# Data Layer

| Layer | Purpose |
|---|---|
| `raw/` | Source files exactly as received. Never modify. Subdirectory per source. |
| `staging/` | Normalized flat CSV/TSV. Columns mapped to schema names. One file per source. |
| `canonical/` | Deduplicated master records with stable UUIDs. |
| `reference/` | Static geo reference data (EEZ, lease areas, sea basin polygons). |

Current data is loaded via `sql/seed_v2.sql` (210+ projects).
