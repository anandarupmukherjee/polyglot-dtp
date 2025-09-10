# Polyglot DTP Testbed (no framework)
Spin up Postgres/Timescale, Neo4j, InfluxDB 2, and MinIO. Run one script that writes and reads from each to prove the wiring.

## Run locally

### Option A: Windows (Docker Compose, no Make)
1. Copy env: `copy .env.example .env`
2. Start services: `docker compose up -d`
3. Wait for health checks: `docker compose ps`
4. Run tests in network:
   `docker compose run --rm runner bash -lc "pip install -r requirements.txt && python test_all.py"`
5. Ports:
   - MinIO S3: http://localhost:9100 (console http://localhost:9101)
   - Neo4j Browser: http://localhost:7474 (user `neo4j`, pass from `.env`)
   - InfluxDB: http://localhost:8086 (org/bucket/token from `.env`)

### Option B: Linux/Mac (Makefile helper)
1. `cp .env.example .env`
2. `make up` (starts containers + creates venv)
3. `make test` (writes to each store and prints a summary)
4. MinIO console: http://localhost:9101 (user/pass from .env)
5. Neo4j browser: http://localhost:7474 (user: neo4j, pass from .env)

## Tear down
`make down`

## Storage back end
- Local: MinIO at `minio:9000` inside the compose network; host access via http://localhost:9100 (console http://localhost:9101).
- CI: LocalStack S3 at http://localhost:4566.

The MinIO test auto-detects which backend to use via `MINIO_ENDPOINT`.

## Notes
- Timescale hypertable is created by `sql/timescale.sql`.
- Influx is pre-seeded with org/bucket/token from `.env`.
- Tests run purely with Python clients; no external frameworks required.
