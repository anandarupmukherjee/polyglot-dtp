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
   - Portal (links to all UIs): http://localhost:8080

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
- Timescale hypertable is created by `data-storage/sql/timescale.sql`.
- Influx is pre-seeded with org/bucket/token from `.env`.
- Tests run purely with Python clients; no external frameworks required.

## Repository Layout
- `ui/` — portal and future web UIs
- `data-storage/` — database init/config (e.g., Timescale SQL)
- `infrastructure/` — infra components (e.g., MQTT broker config)
- `data-collection/` — simulators and ingestors (e.g., MQTT simulator)

## Kubernetes (optional)
- Prereq: enable Docker Desktop Kubernetes or use a `kind` cluster.
- Apply namespace and services:
  - `kubectl apply -f k8s/namespace.yaml`
  - `kubectl apply -f k8s/postgres-timescale -n dtp`
  - `kubectl apply -f k8s/neo4j -n dtp`
  - `kubectl apply -f k8s/influx -n dtp`
  - `kubectl apply -f k8s/minio -n dtp`
- Wait for pods: `kubectl get pods -n dtp`
- Run tests inside the cluster:
  - `kubectl apply -f k8s/test-job -n dtp`
  - `kubectl logs -n dtp job/dtp-test`
- Port-forward UIs (optional):
  - Neo4j: `kubectl port-forward -n dtp svc/neo4j 7474:7474 7687:7687`
  - InfluxDB: `kubectl port-forward -n dtp svc/influx 8086:8086`
  - MinIO: `kubectl port-forward -n dtp svc/minio 9000:9000 9001:9001`

## MQTT Simulator (optional)
- Services: an embedded Mosquitto broker (`mqtt`) and a `simulator` container are included in `docker compose`.
- Start: `docker compose up -d` (or start individually: `docker compose up -d mqtt simulator`)
- What it does:
  - Publishes JSON sensor messages to MQTT topic `dtp/sensors/room1/temp` every 5s.
  - Subscribes to `dtp/sensors/#` and, for each message, writes:
    - Time-series point to InfluxDB bucket `signals` (measurement `observation`).
    - Relational rows to TimescaleDB tables `signal` and `observation`.
- Configure via env (override in `.env` or compose):
  - `PUBLISH_INTERVAL_SEC` (default `5`)
  - `MQTT_TOPIC` (default `dtp/sensors/room1/temp`)
  - `SIM_SIGNAL_NAME` (default `temp_room_1`), `SIM_SIGNAL_UNIT` (default `C`)
- Observe logs: `docker compose logs -f simulator`
- Verify data:
  - TimescaleDB: `docker compose exec db psql -U dtp -d dtp -c "select count(*) from observation;"`
  - InfluxDB UI: http://localhost:8086 → Data Explorer → query measurement `observation` in bucket `signals`.
