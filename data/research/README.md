# Research Staging

- `raw/`: fetched page snapshots + source fetch index (`sources.ndjson_*`).
- `staging/`: extracted candidate claims by topic (`*_claims.ndjson_*`, `*_claims.csv_*`).
- `reviewed/`: manual review queues (`*_review_queue.csv_*`) before DB import.

Run:

```bash
node scripts/research-ingest.mjs --source-file data/research/source_targets.sample.json --topic all
```

Supported topics in source file:
- `windfarm`
- `epc`
- `route`
