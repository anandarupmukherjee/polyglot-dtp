# Polyglot DTP Testbed (no framework)
Spin up Postgres/Timescale, Neo4j, InfluxDB 2, and MinIO. Run one script that writes and reads from each to prove the wiring.

## Run locally
1. `cp .env.example .env`
2. `make up` (starts containers + creates venv)
3. `make test` (writes to each store and prints a summary)
4. MinIO console: http://localhost:9001 (user/pass from .env)
5. Neo4j browser: http://localhost:7474 (user: neo4j, pass from .env)

## Tear down
`make down`

## Notes
- Timescale hypertable is created by `sql/timescale.sql`.
- Influx is pre-seeded with org/bucket/token from `.env`.
- Tests run purely with Python clients; no external frameworks required.
