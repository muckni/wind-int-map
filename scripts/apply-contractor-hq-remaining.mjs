#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ROOT = process.cwd();

const HQ_MAP = {
  "Adwen": { city: "Zamudio", country: "ES", lat: 43.2948, lng: -2.8635 },
  "Aibel": { city: "Stavanger", country: "NO", lat: 58.969976, lng: 5.733107 },
  "Deme": { city: "Zwijndrecht", country: "BE", lat: 51.219448, lng: 4.402464 },
  "DEME Offshore": { city: "Zwijndrecht", country: "BE", lat: 51.219448, lng: 4.402464 },
  "Global Energy Group": { city: "Inverness", country: "GB", lat: 57.477773, lng: -4.224721 },
  "Hellenic Cables": { city: "Athens", country: "GR", lat: 37.98381, lng: 23.727539 },
  "Jdr Cable Systems": { city: "Hartlepool", country: "GB", lat: 54.685, lng: -1.21 },
  "Seaway7": { city: "Luxembourg", country: "LU", lat: 49.611622, lng: 6.131935 },
  "Sif": { city: "Roermond", country: "NL", lat: 51.194168, lng: 5.987516 },
  "Smulders": { city: "Arendonk", country: "BE", lat: 51.322051, lng: 5.083741 },
  "Tkf": { city: "Haaksbergen", country: "NL", lat: 52.156111, lng: 6.738889 },
  "Unknown OEM": { city: "Hamburg", country: "DE", lat: 53.551086, lng: 9.993682 },
  "Windar Renovables": { city: "Aviles", country: "ES", lat: 43.55473, lng: -5.92483 }
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] == null) process.env[m[1]] = value;
  }
}

async function main() {
  loadEnv(path.join(ROOT, ".env.local"));
  loadEnv(path.join(ROOT, ".env"));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const api = await fetch("http://localhost:3000/api/companies?with_location=true");
  const json = await api.json();
  const epc = (Array.isArray(json.data) ? json.data : []).filter((r) => r.marker_class === "epc");

  let applied = 0;
  const updated = [];

  try {
    await client.query("BEGIN");
    for (const c of epc) {
      const hq = HQ_MAP[c.name];
      if (!hq) continue;

      await client.query(
        `
        INSERT INTO company_locations (company_id, location, location_type, city, country_code)
        VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 'hq', $4, $5)
        ON CONFLICT (company_id, location_type)
        DO UPDATE SET
          location = EXCLUDED.location,
          city = EXCLUDED.city,
          country_code = EXCLUDED.country_code
        `,
        [c.id, hq.lng, hq.lat, hq.city, hq.country]
      );
      applied += 1;
      updated.push({ id: c.id, name: c.name, city: hq.city, country: hq.country });
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }

  console.log(JSON.stringify({ applied, updated }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
