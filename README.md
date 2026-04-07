# Offshore Wind Intelligence Platform — v3

Free, open-source offshore wind farm intelligence map — an alternative to proprietary tools like 4C Offshore.

## What's new in v3
- **Wind resource heatmap** — Global Wind Atlas raster tiles with a layer control panel, opacity slider, color legend, and hover wind-speed readout.
- **Company markers fixed** — EPC, developer, and offtaker markers now render via a typed PostGIS tile table that Martin auto-discovers.

Built with Next.js, PostGIS, MapLibre, and Martin vector tiles.

## Features

### Map Layers
- **Wind farms** — 600+ projects worldwide with status-based styling (operational, under construction, planned, decommissioned)
- **Project polygons** — farm boundary geometries at higher zoom
- **Turbine positions** — individual turbine markers at zoom 9.8+
- **Submarine cables** — export cables, inter-array cables, and interconnectors with type-based coloring
- **Cable connection points** — onshore/offshore substations and grid entry points
- **Company network** — relationship lines between company HQs and wind farms by role

### Data & Detail Panels
- Project detail: capacity, turbine count, foundation type, water depth, distance to shore
- Ownership structure with equity shares and confidence tracking
- Contracts/PPAs with counterparties, pricing, and verification status
- EPC contractor roles (240 packages, 275 company-role records)
- Support scheme data (UK, Germany, France) with price history
- Company portfolios with project counts and total MW

### Timeline
- Timeline slider animating wind farm development from 1991–2035
- Cumulative capacity counter (GW)

### Infrastructure
- Vector tile serving via Martin (MapBox Vector Tiles from PostGIS)
- Admin CRUD interface for all core tables
- Full-text search across farms and companies
- Data quality and provenance tracking throughout

## Data Coverage

| Entity | Count |
|--------|-------|
| Wind farms | 600+ |
| Companies | 129 |
| Ownership links | 80 |
| Contracts/PPAs | 56 |
| EPC packages | 240 |
| EPC company-roles | 275 |
| Support schemes | 32 |
| Price history records | 39 |

### Data Expansion Pipeline
An automated ingestion pipeline expands coverage using public data:
- **OpenStreetMap** — Overpass API query for offshore wind plants
- **Wikipedia** — parses "List of offshore wind farms" pages for 24 countries
- **Reconciliation** — Levenshtein name matching + proximity deduplication against existing DB
- **Review-first** — produces `data/qa/new-farms-review.csv` for human review before import

```bash
node scripts/ingest-osm-windfarms.mjs      # → data/ingest/osm-farms.json
node scripts/ingest-wiki-windfarms.mjs      # → data/ingest/wiki-farms.json
node scripts/reconcile-farms.mjs            # → data/qa/new-farms-review.csv
node scripts/apply-new-farms.mjs --dry-run  # preview, then run without --dry-run to import
```

## Tech Stack
- **Frontend:** Next.js 15 + React 18 + TypeScript
- **Map:** MapLibre GL + deck.gl + react-map-gl
- **Tiles:** Martin (MVT server from PostGIS)
- **Database:** PostgreSQL 16 + PostGIS 3.4
- **Basemap:** CartoDB Dark Matter

## Local Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Set `DATABASE_URL` to a local Postgres database with PostGIS enabled.

### 3. Start services
```bash
docker compose up -d   # PostgreSQL + Martin
```

### 4. Build the database
```bash
./scripts/db-setup.sh
```
This applies the core schema, all migrations (001–009), seed data, and support/EPC/cable seeds.

### 5. Run the app
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 6. Optional validation
```bash
npm run typecheck
npm run validate:data
```

## Project Structure
- `app/` — Next.js routes, API routes (`/api/wind-farms`, `/api/cables`, `/api/companies`, etc.), admin pages
- `components/` — MapView, WindFarmPanel, CompanyPanel, TimelineSlider, admin UI
- `lib/` — shared types, DB pool, admin config, completeness scoring
- `sql/schema.sql` — core tables
- `sql/migrations/` — incremental migrations (001–009)
- `sql/seeds/` — cable and infrastructure seed data
- `data/` — wind farm datasets, ingest staging, QA outputs, support data
- `scripts/` — DB setup, data validation, location refresh, ingest pipeline

## API Endpoints

| Route | Description |
|-------|-------------|
| `GET /api/wind-farms` | List farms (bbox, status, country, sea_basin filters) |
| `GET /api/wind-farms/[id]` | Farm detail + ownership + contracts + EPC + support |
| `GET /api/cables` | Submarine cables as GeoJSON (bbox filter) |
| `GET /api/cable-connection-points` | Substations and grid connection points |
| `GET /api/companies` | Companies with optional location filter |
| `GET /api/companies/[id]/network` | Company-farm relationship network |
| `GET /api/turbines` | Individual turbine positions (bbox, zoom-triggered) |
| `GET /api/wind-farm-polygons` | Project boundary polygons as GeoJSON |
| `GET /api/search` | Full-text search across farms and companies |
| `GET /api/filter-options` | Available filter values for dropdowns |
| `GET /api/timeline` | Capacity-by-year data for timeline slider |

## Roadmap
- [ ] Port infrastructure layer (manufacturing, installation, O&M ports)
- [ ] EEZ boundary overlays (marineregions.org)
- [ ] Bathymetry contours (GEBCO)
- [ ] Advanced multi-criteria filter panel
- [ ] Public REST API v1 with documentation and data export (GeoJSON, CSV)
- [ ] Vessel tracking via free AIS data
- [ ] Grid connection point expansion from TSO registers
- [ ] User accounts with saved views and bookmarks
- [ ] Mobile responsive layout
- [ ] Production deployment (Docker, CI/CD, SEO)

## Contributing
Contributions welcome. See the roadmap above for high-impact areas.

## License
MIT
