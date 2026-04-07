#!/usr/bin/env node
/**
 * Shared helpers for the farm-ingest pipeline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, "..");
export const INGEST_DIR = path.join(ROOT, "data", "ingest");
export const QA_DIR = path.join(ROOT, "data", "qa");

/* ---------- tiny .env loader (no deps) ---------- */
export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const envPath = path.join(ROOT, name);
    if (!fs.existsSync(envPath)) continue;
    _loadEnvFile(envPath);
  }
}

function _loadEnvFile(envPath) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, key, val] = m;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

/* ---------- Levenshtein distance ---------- */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  const prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let diagPrev = prev[0];
    prev[0] = i;
    for (let j = 1; j <= lb; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diagPrev : 1 + Math.min(diagPrev, prev[j], prev[j - 1]);
      diagPrev = tmp;
    }
  }
  return prev[lb];
}

/* ---------- normalise a farm name for matching ---------- */
export function normaliseName(n) {
  return (n || "")
    .toLowerCase()
    .replace(/offshore\s+wind\s+farm/gi, "")
    .replace(/wind\s+farm/gi, "")
    .replace(/wind\s+park/gi, "")
    .replace(/[\u2013\u2014]/g, "-") // en/em dash
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- Haversine distance (km) ---------- */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- write JSON helper ---------- */
export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`  → wrote ${filePath} (${data.length} rows)`);
}

/* ---------- status normaliser ---------- */
export function normaliseStatus(raw) {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  if (/operati|commission|online|in\s+service/.test(s)) return "operational";
  if (/construct|building|install/.test(s)) return "under construction";
  if (/plan|approv|consent|propos|develop|pre-?construct/.test(s)) return "planned";
  if (/decommission|dismantl|remov/.test(s)) return "decommissioned";
  return "unknown";
}

/* ---------- parse year from various date strings ---------- */
export function parseYear(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}
