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

/* ---------- decode HTML entities ---------- */
export function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#160;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#91;[^&#]*&#93;/g, "") // e.g. &#91;de&#93;
    .replace(/\[\d+\]/g, "")          // [1], [2] refs
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- Roman numeral ↔ digit normalization ---------- */
const ROMAN_TO_DIGIT = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10", xi: "11", xii: "12" };

function normaliseRomans(s) {
  // Replace standalone Roman numerals with digits
  return s.replace(/\b(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/g, (m) => ROMAN_TO_DIGIT[m] || m);
}

/* ---------- normalise a farm name for matching ---------- */
export function normaliseName(n) {
  return normaliseRomans(
    decodeHtmlEntities(n || "")
      .toLowerCase()
      .replace(/offshore\s+wind\s+farm/gi, "")
      .replace(/\bowf\b/gi, "")
      .replace(/wind\s*farm/gi, "")
      .replace(/wind\s*park/gi, "")
      .replace(/windpark/gi, "")
      .replace(/[\u2013\u2014]/g, "-") // en/em dash
      .replace(/&/g, "and")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/* ---------- offline country lookup from coordinates ---------- */
const COUNTRY_BBOXES = [
  // [code, minLat, maxLat, minLng, maxLng] — coastal/offshore bboxes
  ["GB", 49.5, 61.0, -11.0, 3.0],
  ["DE", 53.5, 56.0, 3.0, 15.0],
  ["DK", 54.5, 58.0, 3.0, 15.5],
  ["NL", 51.0, 54.5, 2.5, 7.5],
  ["BE", 51.0, 52.0, 2.0, 4.0],
  ["FR", 42.0, 51.5, -5.5, 3.0],
  ["SE", 55.0, 66.0, 10.0, 25.0],
  ["NO", 56.0, 72.0, 0.0, 32.0],
  ["PL", 54.0, 56.0, 14.0, 20.0],
  ["IE", 51.0, 56.0, -11.0, -5.5],
  ["FI", 59.0, 66.0, 19.0, 30.0],
  ["IT", 36.0, 46.0, 6.0, 19.0],
  ["ES", 35.5, 44.0, -10.0, 4.5],
  ["PT", 36.5, 42.5, -11.0, -6.0],
  ["GR", 34.5, 42.0, 19.0, 30.0],
  ["TW", 22.0, 26.0, 119.0, 123.0],
  ["JP", 24.0, 46.0, 122.0, 154.0],
  ["KR", 33.0, 39.0, 124.0, 132.0],
  ["CN", 17.0, 42.0, 105.0, 125.0],
  ["VN", 8.0, 24.0, 102.0, 112.0],
  ["US", 24.0, 49.0, -82.0, -66.0],
  ["IN", 6.0, 22.0, 68.0, 89.0],
  ["BR", -34.0, 5.0, -53.0, -28.0],
];

export function guessCountryFromCoords(lat, lng) {
  if (lat == null || lng == null) return null;
  for (const [code, minLat, maxLat, minLng, maxLng] of COUNTRY_BBOXES) {
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return code;
  }
  return null;
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

/* ---------- aliases for backward compat with other scripts ---------- */
export const loadEnvFile = loadEnv;

/* ---------- read CSV (no deps) ---------- */
export function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { vals.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = vals[i]?.trim() ?? ""));
    return obj;
  });
}
