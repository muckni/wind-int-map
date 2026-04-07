#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Generate color-ramped XYZ raster tiles from a wind speed GeoTIFF.
#
# Input:  A GeoTIFF with mean wind speed values (m/s) at 100m hub height.
#         Download from Global Wind Atlas: https://globalwindatlas.info/en/download/gis-files
#
# Output: public/tiles/wind/{z}/{x}/{y}.png  (XYZ tile pyramid)
#         public/tiles/wind/metadata.json     (bounds, zoom range, color ramp info)
#
# Usage:
#   ./scripts/generate-wind-tiles.sh data/ingest/wind-speed-100m.tif
#   ./scripts/generate-wind-tiles.sh data/ingest/wind-speed-100m.tif --zoom 3-8
#   ./scripts/generate-wind-tiles.sh data/ingest/wind-speed-100m.tif --region north-sea
#
# Prerequisites: GDAL 3.x (gdal2tiles.py, gdaldem, gdalwarp, gdal_translate)
# ──────────────────────────────────────────────────────────────────────────────
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_DIR/public/tiles/wind"
TMP_DIR="$PROJECT_DIR/.tmp-wind-tiles"

# Defaults
ZOOM_RANGE="2-8"
REGION=""

# Parse arguments
INPUT_FILE="${1:-}"
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --zoom)   ZOOM_RANGE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *)        echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$INPUT_FILE" ]]; then
  echo "Usage: $0 <input.tif> [--zoom 2-8] [--region north-sea]"
  echo ""
  echo "Download GeoTIFF from Global Wind Atlas:"
  echo "  https://globalwindatlas.info/en/download/gis-files"
  echo ""
  echo "Or run: node scripts/download-wind-data.mjs"
  exit 1
fi

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: Input file not found: $INPUT_FILE"
  exit 1
fi

# Check GDAL
for cmd in gdalwarp gdaldem gdal2tiles.py gdal_translate; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd not found. Install GDAL: brew install gdal"
    exit 1
  fi
done

echo "═══════════════════════════════════════════════════════════"
echo "  Wind Resource Tile Generator"
echo "═══════════════════════════════════════════════════════════"
echo "  Input:  $INPUT_FILE"
echo "  Output: $OUTPUT_DIR"
echo "  Zoom:   $ZOOM_RANGE"
echo ""

# Clean up
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR" "$OUTPUT_DIR"

# ── Step 1: Crop to region if specified ──────────────────────────────────────
WORKING_FILE="$INPUT_FILE"

BOUNDS_STR=""
case "$REGION" in
  north-sea)  BOUNDS_STR="-5 50 12 62" ;;
  baltic)     BOUNDS_STR="9 53 30 66" ;;
  irish-sea)  BOUNDS_STR="-12 50 -3 57" ;;
  us-east)    BOUNDS_STR="-80 28 -65 45" ;;
  taiwan)     BOUNDS_STR="115 20 125 28" ;;
  global)     BOUNDS_STR="-180 -85 180 85" ;;
esac

if [ -n "$BOUNDS_STR" ]; then
  echo "Step 1: Cropping to region: $REGION ($BOUNDS_STR)"
  set -- $BOUNDS_STR
  gdalwarp -te "$1" "$2" "$3" "$4" \
    -t_srs EPSG:4326 \
    -r bilinear \
    -overwrite \
    "$INPUT_FILE" "$TMP_DIR/cropped.tif" 2>&1 | tail -1
  WORKING_FILE="$TMP_DIR/cropped.tif"
else
  echo "Step 1: No region crop (using full extent)"
fi

# ── Step 2: Reproject to Web Mercator (EPSG:3857) ───────────────────────────
echo "Step 2: Reprojecting to EPSG:3857…"
gdalwarp -t_srs EPSG:3857 \
  -r bilinear \
  -dstnodata -9999 \
  -overwrite \
  "$WORKING_FILE" "$TMP_DIR/reprojected.tif" 2>&1 | tail -1

# ── Step 3: Create color ramp file ──────────────────────────────────────────
echo "Step 3: Creating color ramp…"
# Wind speed color ramp: blue (<7) → green (8) → yellow (9) → orange (10) → red (>11 m/s)
cat > "$TMP_DIR/wind-color-ramp.txt" <<'RAMP'
nv   0   0   0   0
0    8  24  58  0
3   16  42  90  80
5   30  64 175 140
6   50 100 220 180
7   60 130 246 200
7.5  80 180 200 210
8   52 211 153 220
8.5  120 220 100 225
9  250 204  21 230
9.5 251 175  50 235
10 249 115  22 240
10.5 240  80  20 242
11 239  68  68 245
12 200  30  30 248
14 160  10  10 250
16 120   0  30 252
20 100   0  60 255
RAMP

# ── Step 4: Apply color ramp ────────────────────────────────────────────────
echo "Step 4: Applying color ramp (gdaldem)…"
gdaldem color-relief \
  "$TMP_DIR/reprojected.tif" \
  "$TMP_DIR/wind-color-ramp.txt" \
  "$TMP_DIR/colored.tif" \
  -alpha \
  -nearest_color_entry 2>&1 | tail -1

# ── Step 5: Generate XYZ tiles ──────────────────────────────────────────────
echo "Step 5: Generating XYZ tiles (zoom $ZOOM_RANGE)…"
gdal2tiles.py \
  --zoom="$ZOOM_RANGE" \
  --xyz \
  --processes="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)" \
  --resampling=bilinear \
  --tilesize=256 \
  --webviewer=none \
  "$TMP_DIR/colored.tif" \
  "$OUTPUT_DIR" 2>&1 | tail -3

# ── Step 6: Also keep the raw data for hover queries ────────────────────────
echo "Step 6: Creating data grid for hover queries…"

# Generate a low-res version of the raw wind speed data for client-side lookups
gdalwarp -t_srs EPSG:4326 \
  -r bilinear \
  -ts 360 180 \
  -dstnodata -9999 \
  -overwrite \
  "$WORKING_FILE" "$TMP_DIR/grid-lowres.tif" 2>&1 | tail -1

# Extract as ASCII grid for JSON conversion
gdal_translate -of AAIGrid \
  "$TMP_DIR/grid-lowres.tif" \
  "$TMP_DIR/grid-lowres.asc" 2>&1 | tail -1

# ── Step 7: Generate metadata ──────────────────────────────────────────────
echo "Step 7: Writing metadata…"

# Get bounds from input
BOUNDS=$(gdalinfo -json "$WORKING_FILE" 2>/dev/null | python3 -c "
import json, sys
info = json.load(sys.stdin)
corners = info.get('cornerCoordinates', {})
ll = corners.get('lowerLeft', [-180, -85])
ur = corners.get('upperRight', [180, 85])
print(f'{ll[0]},{ll[1]},{ur[0]},{ur[1]}')
" 2>/dev/null || echo "-180,-85,180,85")

IFS=',' read -r WEST SOUTH EAST NORTH <<< "$BOUNDS"

cat > "$OUTPUT_DIR/metadata.json" <<EOF
{
  "name": "Wind Speed (100m)",
  "description": "Mean wind speed at 100m hub height",
  "unit": "m/s",
  "source": "Global Wind Atlas / ERA5",
  "zoom_range": "$ZOOM_RANGE",
  "bounds": [$WEST, $SOUTH, $EAST, $NORTH],
  "color_ramp": [
    {"value": 0,  "color": "#08183a", "label": "< 3 m/s"},
    {"value": 5,  "color": "#1e40af", "label": "5 m/s"},
    {"value": 7,  "color": "#3c82f6", "label": "7 m/s"},
    {"value": 8,  "color": "#34d399", "label": "8 m/s"},
    {"value": 9,  "color": "#facc15", "label": "9 m/s"},
    {"value": 10, "color": "#f97316", "label": "10 m/s"},
    {"value": 11, "color": "#ef4444", "label": "11 m/s"},
    {"value": 14, "color": "#c81e1e", "label": "14+ m/s"}
  ],
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# ── Step 8: Count tiles ─────────────────────────────────────────────────────
TILE_COUNT=$(find "$OUTPUT_DIR" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ Done! Generated $TILE_COUNT tiles"
echo "  Output: $OUTPUT_DIR"
echo "  Metadata: $OUTPUT_DIR/metadata.json"
echo "═══════════════════════════════════════════════════════════"

# Clean up temp
rm -rf "$TMP_DIR"
