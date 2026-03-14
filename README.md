# Offshore Wind Intelligence Platform (V1)

A map-first intelligence platform for offshore wind assets, starting with Europe and designed for global scale. The V1 focuses on clean ingestion, robust spatial queries, and a useful wind farm detail panel.

## Current Scope (V1)
- Map-centric view of offshore wind farms (centroid points only)
- Bounding-box data loading for performance
- Normalized Postgres + PostGIS schema with a map-read view
- Source traceability tables
- Lightweight ingestion pipeline with staging tables
- Wind farm detail API (developer, ownership, contracts, sources)

## Tech Stack
- Next.js + TypeScript
- MapLibre GL + deck.gl
- PostgreSQL + PostGIS

## Local Setup
### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
Create a `.env` file from the template:
```bash
cp .env.example .env
```
Set `DATABASE_URL` to your local Postgres connection string.

### 3) Database setup
Ensure Postgres and PostGIS are installed locally. Then apply the schema:
```sql
\i sql/schema.sql
```

### 4) Load starter data
Place the CSVs in `data/seed/`:
- `companies_seed.csv`
- `wind_farms_seed.csv`
- `wind_farm_ownership_seed.csv`
- `contracts_seed.csv`
- `sources_seed.csv`
- `wind_farm_sources_seed.csv`
- `contract_sources_seed.csv`

Import via the staging pipeline:
```sql
\i sql/import_from_csv.sql
```

You can also use the minimal seed:
```sql
\i sql/seed.sql
```

### 5) Run the app
```bash
npm run dev
```

Open http://localhost:3000

## CSV Import Notes
- `centroid_wkt` must be in WKT format like `POINT(lon lat)`
- Rows can be marked `data_quality = Example` or `verification_status = Example`
- `ON CONFLICT DO NOTHING` is used for starter imports to allow repeat loading

## Current Limitations
- No authentication or admin UI
- No 3D visualization
- No ownership graph visualization
- No relationship lines on the map
 - Bbox-limited loading with a max result cap
 - No pagination/cursoring yet
 - No vector tiles yet
 - Starter import path is not a full reconciliation pipeline

## Map/API Limitations (V1)
- Map data is loaded by bbox only and capped by the API max limit.
- No cursor-based pagination or tile-based loading yet.
- Vector tiles and clustering are not implemented.

Preferred future approach for overflow:
- Tile-based loading or cursor-based pagination, with optional clustering.

## Planned Next Steps
- Expand ingestion auditing and batch provenance
- Add richer detail UI panels (ownership + contracts)
- Improve validation and QA tooling for larger EU datasets

## Suggested Repo Name
`offshore-wind-intelligence`
