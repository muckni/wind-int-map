#!/usr/bin/env bash
# Run once after starting the database.
# Usage: ./scripts/db-setup.sh
# Requires: psql on PATH and DATABASE_URL set (or uses docker default).

set -e

DB_URL="${DATABASE_URL:-postgres://owi:owi@localhost:5432/offshore_wind}"

echo "→ Applying schema..."
psql "$DB_URL" -f sql/schema.sql

echo "→ Applying migration 001..."
psql "$DB_URL" -f sql/migrations/001_extend_wind_farms.sql

echo "→ Applying migration 002..."
psql "$DB_URL" -f sql/migrations/002_geometry_and_commercial.sql

echo "→ Loading v2 seed data (210+ projects)..."
psql "$DB_URL" -f sql/seed_v2.sql

echo "→ Loading v3 seed data (geometry + ownership + contracts)..."
psql "$DB_URL" -f sql/seed_v3.sql

echo "→ Loading v4 seed data (PPA/offtaker companies + contract links)..."
psql "$DB_URL" -f sql/seed_v4_ppa.sql

echo "→ Applying migration 003 (confidence/provenance fields)..."
psql "$DB_URL" -f sql/migrations/003_commercial_enrich.sql

echo "→ Loading v5 seed data (expanded PPA/ownership research)..."
psql "$DB_URL" -f sql/seed_v5_ppa_research.sql

echo "→ Applying migration 005 (EPC role/confidence refinements)..."
psql "$DB_URL" -f sql/migrations/005_epc_roles_confidence_refine.sql

echo "→ Loading v6 seed data (EPC contractor CSV ingest)..."
psql "$DB_URL" -f sql/seed_v6_epc_csv.sql

echo "✓ Database ready."
psql "$DB_URL" -c "SELECT status_current, COUNT(*) FROM wind_farms GROUP BY 1 ORDER BY 1;"
