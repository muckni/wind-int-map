#!/usr/bin/env node
/**
 * Download wind speed GeoTIFF data from the Global Wind Atlas API.
 * Downloads 100m hub height mean wind speed for key offshore regions.
 *
 * Usage:
 *   node scripts/download-wind-data.mjs                    # download all regions
 *   node scripts/download-wind-data.mjs --country GB       # single country
 *   node scripts/download-wind-data.mjs --merge            # merge into single file
 *
 * After download, convert to tiles:
 *   ./scripts/generate-wind-tiles.sh data/ingest/wind-speed-100m.tif
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

const INGEST_DIR = path.join(process.cwd(), "data", "ingest");

// Key offshore wind countries to download
const COUNTRIES = [
  // Europe - major offshore wind markets
  { code: "GBR", label: "United Kingdom" },
  { code: "DEU", label: "Germany" },
  { code: "NLD", label: "Netherlands" },
  { code: "DNK", label: "Denmark" },
  { code: "BEL", label: "Belgium" },
  { code: "FRA", label: "France" },
  { code: "NOR", label: "Norway" },
  { code: "SWE", label: "Sweden" },
  { code: "POL", label: "Poland" },
  { code: "IRL", label: "Ireland" },
  // Asia-Pacific
  { code: "TWN", label: "Taiwan" },
  { code: "JPN", label: "Japan" },
  { code: "KOR", label: "South Korea" },
  { code: "CHN", label: "China" },
  { code: "VNM", label: "Vietnam" },
  // Americas
  { code: "USA", label: "United States" },
  { code: "BRA", label: "Brazil" },
];

// GWA API - alternative download URLs
const GWA_API_BASE = "https://globalwindatlas.info/api/gis";

/**
 * Try to download wind speed data from the Global Wind Atlas API.
 * Note: GWA may rate-limit or require authentication for bulk downloads.
 */
async function downloadCountryGeoTIFF(countryCode, outputPath) {
  // GWA API endpoint for country wind speed GeoTIFF
  const url = `${GWA_API_BASE}/country/${countryCode}/wind-speed/100`;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "OffshoreWindIntel/1.0 (open-source wind map)",
        Accept: "application/octet-stream,image/tiff,*/*",
      },
      redirect: "follow",
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        console.warn(`  ⚠ Rate limited for ${countryCode}. Waiting 30s…`);
        await new Promise((r) => setTimeout(r, 30000));
        return false;
      }
      console.warn(`  ⚠ HTTP ${resp.status} for ${countryCode}: ${resp.statusText}`);
      return false;
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("tiff") && !contentType.includes("octet-stream") && !contentType.includes("image")) {
      console.warn(`  ⚠ Unexpected content-type for ${countryCode}: ${contentType}`);
      // Still try to save it
    }

    await pipeline(resp.body, createWriteStream(outputPath));
    const stats = fs.statSync(outputPath);
    if (stats.size < 1000) {
      console.warn(`  ⚠ File too small (${stats.size} bytes), likely not a GeoTIFF`);
      fs.unlinkSync(outputPath);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`  ⚠ Download failed for ${countryCode}: ${err.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const singleCountry = args.includes("--country") ? args[args.indexOf("--country") + 1]?.toUpperCase() : null;
  const doMerge = args.includes("--merge");

  fs.mkdirSync(INGEST_DIR, { recursive: true });

  const countries = singleCountry
    ? COUNTRIES.filter((c) => c.code === singleCountry || c.code.startsWith(singleCountry))
    : COUNTRIES;

  if (countries.length === 0) {
    console.error(`No matching country found for: ${singleCountry}`);
    console.log("Available:", COUNTRIES.map((c) => `${c.code} (${c.label})`).join(", "));
    process.exit(1);
  }

  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  Global Wind Atlas - Wind Speed Data Download        ║");
  console.log("╚═══════════════════════════════════════════════════════╝");
  console.log(`\nDownloading 100m wind speed for ${countries.length} countries…\n`);

  const downloaded = [];
  const failed = [];

  for (const { code, label } of countries) {
    const outPath = path.join(INGEST_DIR, `wind-speed-100m-${code.toLowerCase()}.tif`);

    if (fs.existsSync(outPath)) {
      console.log(`  ✓ ${label} (${code}) — already exists, skipping`);
      downloaded.push(outPath);
      continue;
    }

    process.stdout.write(`  ↓ ${label} (${code})… `);
    const ok = await downloadCountryGeoTIFF(code, outPath);
    if (ok) {
      const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
      console.log(`✓ ${size} MB`);
      downloaded.push(outPath);
    } else {
      failed.push(code);
    }

    // Rate limit between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  Downloaded: ${downloaded.length}/${countries.length}`);
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.join(", ")}`);
  }

  if (downloaded.length === 0) {
    console.log(`\n⚠ No data downloaded. The GWA API may require authentication.`);
    console.log(`\nAlternative: Download manually from:`);
    console.log(`  https://globalwindatlas.info/en/download/gis-files`);
    console.log(`\nOr use ERA5 data from Copernicus Climate Data Store:`);
    console.log(`  https://cds.climate.copernicus.eu/`);
    console.log(`\nAfter downloading, place the GeoTIFF in data/ingest/ and run:`);
    console.log(`  ./scripts/generate-wind-tiles.sh data/ingest/your-file.tif`);
    console.log(`\n───────────────────────────────────────────────────────`);
    console.log(`Generating demo wind data instead…\n`);
    await generateDemoData();
    return;
  }

  if (doMerge && downloaded.length > 1) {
    console.log(`\nMerging ${downloaded.length} files into single GeoTIFF…`);
    const mergedPath = path.join(INGEST_DIR, "wind-speed-100m.tif");
    const { execSync } = await import("node:child_process");
    try {
      execSync(`gdalwarp -overwrite ${downloaded.map((f) => `"${f}"`).join(" ")} "${mergedPath}"`, { stdio: "pipe" });
      console.log(`  ✓ Merged to ${mergedPath}`);
      console.log(`\nNext step: ./scripts/generate-wind-tiles.sh ${mergedPath}`);
    } catch (err) {
      console.warn(`  ⚠ Merge failed: ${err.message}`);
      console.log(`\nGenerate tiles per country instead:`);
      for (const f of downloaded) {
        console.log(`  ./scripts/generate-wind-tiles.sh ${f}`);
      }
    }
  } else if (downloaded.length === 1) {
    console.log(`\nNext step: ./scripts/generate-wind-tiles.sh ${downloaded[0]}`);
  }
}

/**
 * Generate demo wind resource data when real GeoTIFF download fails.
 * Creates a simple grid-based JSON with realistic North Sea wind speeds
 * that can be rendered as a client-side overlay.
 */
async function generateDemoData() {
  // Generate a wind speed grid covering major offshore wind regions
  // Using realistic wind speed distributions based on published ERA5 averages
  const grid = {
    type: "wind_speed_grid",
    unit: "m/s",
    height: "100m",
    source: "synthetic (based on ERA5 climatology)",
    resolution_deg: 0.5,
    regions: [],
  };

  // North Sea & surrounding waters (the key offshore wind region)
  const regions = [
    { name: "North Sea",       bounds: [-5, 50, 12, 62],    baseSpeed: 9.5,  variance: 1.8 },
    { name: "Baltic Sea",      bounds: [9, 53, 30, 66],     baseSpeed: 8.2,  variance: 1.5 },
    { name: "Irish Sea",       bounds: [-12, 50, -3, 57],   baseSpeed: 9.0,  variance: 1.6 },
    { name: "English Channel", bounds: [-5, 48, 3, 52],     baseSpeed: 8.8,  variance: 1.4 },
    { name: "Bay of Biscay",   bounds: [-10, 43, 0, 48],    baseSpeed: 7.5,  variance: 1.3 },
    { name: "Mediterranean",   bounds: [-1, 35, 20, 44],    baseSpeed: 6.5,  variance: 1.8 },
    { name: "US East Coast",   bounds: [-80, 28, -65, 45],  baseSpeed: 8.0,  variance: 1.7 },
    { name: "Taiwan Strait",   bounds: [115, 20, 125, 28],  baseSpeed: 8.5,  variance: 1.5 },
    { name: "Yellow Sea",      bounds: [118, 30, 128, 40],  baseSpeed: 7.8,  variance: 1.6 },
    { name: "Norwegian Sea",   bounds: [-2, 60, 15, 72],    baseSpeed: 10.5, variance: 2.0 },
    { name: "Atlantic (PT/ES)",bounds: [-12, 35, -5, 44],   baseSpeed: 8.2,  variance: 1.4 },
  ];

  const points = [];

  for (const region of regions) {
    const [west, south, east, north] = region.bounds;
    const step = 0.5; // 0.5 degree resolution

    for (let lat = south; lat <= north; lat += step) {
      for (let lng = west; lng <= east; lng += step) {
        // Simple pseudo-random variation based on position
        // Offshore areas (further from coast) tend to have higher wind speeds
        const distFromCenter = Math.sqrt(
          Math.pow((lat - (south + north) / 2) / (north - south), 2) +
          Math.pow((lng - (west + east) / 2) / (east - west), 2)
        );

        // Seed-based deterministic noise
        const seed = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
        const noise = (seed - Math.floor(seed)) * 2 - 1; // -1 to 1

        const speed = Math.max(3, Math.min(16,
          region.baseSpeed + noise * region.variance - distFromCenter * 0.5
        ));

        points.push({
          lat: Math.round(lat * 100) / 100,
          lng: Math.round(lng * 100) / 100,
          speed: Math.round(speed * 10) / 10,
        });
      }
    }

    grid.regions.push({
      name: region.name,
      bounds: region.bounds,
      avg_speed: region.baseSpeed,
    });
  }

  grid.point_count = points.length;

  // Write the grid data
  const gridPath = path.join(INGEST_DIR, "wind-speed-grid.json");
  fs.writeFileSync(gridPath, JSON.stringify(grid, null, 2) + "\n");

  // Write the points as a compact array for the client
  const clientPath = path.resolve(process.cwd(), "public", "tiles", "wind", "wind-speed-data.json");
  fs.mkdirSync(path.dirname(clientPath), { recursive: true });
  fs.writeFileSync(clientPath, JSON.stringify({
    unit: "m/s",
    height: "100m",
    resolution: 0.5,
    points,
  }) + "\n");

  // Write metadata
  const metadataPath = path.resolve(process.cwd(), "public", "tiles", "wind", "metadata.json");
  fs.writeFileSync(metadataPath, JSON.stringify({
    name: "Wind Speed (100m)",
    description: "Mean wind speed at 100m hub height (demo data based on ERA5 climatology)",
    unit: "m/s",
    source: "Synthetic demo (ERA5-based)",
    mode: "grid",
    resolution_deg: 0.5,
    point_count: points.length,
    bounds: [-80, 20, 30, 72],
    color_ramp: [
      { value: 0,  color: "#08183a", label: "< 3 m/s" },
      { value: 5,  color: "#1e40af", label: "5 m/s" },
      { value: 7,  color: "#3c82f6", label: "7 m/s" },
      { value: 8,  color: "#34d399", label: "8 m/s" },
      { value: 9,  color: "#facc15", label: "9 m/s" },
      { value: 10, color: "#f97316", label: "10 m/s" },
      { value: 11, color: "#ef4444", label: "11 m/s" },
      { value: 14, color: "#c81e1e", label: "14+ m/s" },
    ],
    generated_at: new Date().toISOString(),
  }, null, 2) + "\n");

  console.log(`  ✓ Generated ${points.length} wind speed grid points`);
  console.log(`  → ${gridPath}`);
  console.log(`  → ${clientPath}`);
  console.log(`  → ${metadataPath}`);
  console.log(`\nDemo data ready. The map will render wind speeds as a heatmap overlay.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
