#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "../..");
export const QA_DIR = path.join(ROOT, "data", "qa");

export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJsonOutputs(baseName, payload) {
  ensureDir(QA_DIR);
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const stampedPath = path.join(QA_DIR, `${baseName}-${stamp}.json`);
  const latestPath = path.join(QA_DIR, `${baseName}-latest.json`);
  const body = JSON.stringify(payload, null, 2) + "\n";
  fs.writeFileSync(stampedPath, body);
  fs.writeFileSync(latestPath, body);
  return { stampedPath, latestPath };
}

export function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function writeCsvOutputs(baseName, rows, columns) {
  ensureDir(QA_DIR);
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const stampedPath = path.join(QA_DIR, `${baseName}-${stamp}.csv`);
  const latestPath = path.join(QA_DIR, `${baseName}-latest.csv`);
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  }
  const body = lines.join("\n") + "\n";
  fs.writeFileSync(stampedPath, body);
  fs.writeFileSync(latestPath, body);
  return { stampedPath, latestPath };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}
