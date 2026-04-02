# Offshore Wind Intelligence Platform

Map-first offshore wind intelligence app built with Next.js, Postgres, and PostGIS.

## Current Status
- Interactive map and project detail UI are running locally on top of a spatial Postgres dataset.
- The database currently contains `581` wind farm rows, `129` companies, `81` ownership links, `56` contract rows, `240` EPC package rows, `275` EPC company-role rows, `32` support-scheme rows, and `39` support-price history rows.
- Wind farm detail views include developer, ownership, contracts, EPC roles, structured support-mechanism data, and lightweight support-price charts where multiple dated values exist.
- The map supports project selection, company relationship tracing, project polygons, turbine overlays at higher zoom, and an admin editor for core tables.

## Data Coverage
- `305` wind farms currently have source-backed `approximated` centroids.
- `276` wind farms still remain on generated fallback centroids and need further reconciliation.
- Support-mechanism coverage has been added for public offshore wind support data in the UK, Germany, and France.

## Location Provenance
Current location refresh work uses three source-backed paths:
- Curated `sql/seed_v2.sql` centroids for core offshore projects.
- Direct Wikipedia page coordinates for rows with explicit Wikipedia page titles.
- Selective Wikipedia search matches for a smaller remainder where the match quality was clear enough.

Current location scripts:
- [`scripts/apply-seed-v2-locations.mjs`](scripts/apply-seed-v2-locations.mjs)
- [`scripts/apply-wikipedia-title-locations.mjs`](scripts/apply-wikipedia-title-locations.mjs)
- [`scripts/apply-wikipedia-search-locations.mjs`](scripts/apply-wikipedia-search-locations.mjs)

Generated audit snapshots from the latest refresh:
- [`data/windfarms/seed_v2_locations.json`](data/windfarms/seed_v2_locations.json)
- [`data/windfarms/title_locations.json`](data/windfarms/title_locations.json)
- [`data/windfarms/search_locations.json`](data/windfarms/search_locations.json)

## Tech Stack
- Next.js 15 + React 18 + TypeScript
- MapLibre GL + deck.gl
- PostgreSQL + PostGIS

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

### 3. Build the database
Preferred setup:
```bash
./scripts/db-setup.sh
```

This applies:
- core schema
- migrations
- curated seed data
- PPA/offtaker research seed
- EPC seed data
- support-mechanism migration and public support seed

### 4. Run the app
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Optional validation
```bash
npm run typecheck
npm run validate:data
```

## Project Structure
- `app/`: Next.js routes, API routes, and admin pages
- `components/`: map, project detail, company detail, and admin UI components
- `lib/`: shared types, DB access, and admin table configuration
- `sql/`: schema, migrations, and curated SQL seeds
- `data/`: support datasets, wind farm snapshots, QA outputs, and research inputs
- `scripts/`: setup, validation, research ingest, and location-refresh helpers
- `research/`: source registry and feasibility notes

## Current Limitations
- A large remainder of farms still use generated centroids and need additional reconciliation.
- Some search-based location enrichment remains intentionally conservative to avoid bad placements.
- The current setup is local-first and assumes an existing Postgres/PostGIS instance.
- The map still loads a full farm dataset into the client rather than tile-based spatial loading.

## Next High-Value Work
- Continue replacing generated centroids for the remaining offshore projects with source-backed locations.
- Tighten location QA so low-confidence search hits cannot be applied automatically.
- Move map loading toward tile-based or viewport-scoped spatial delivery for scale.
- Expand support and commercial coverage beyond UK, Germany, and France.
