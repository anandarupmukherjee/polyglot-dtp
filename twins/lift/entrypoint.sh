#!/usr/bin/env bash
set -euo pipefail

# Local InfluxDB setup
export LOCAL_INFLUX_URL=http://localhost:8086
export LOCAL_ORG=lift-org
export LOCAL_BUCKET=lift
export LOCAL_ADMIN=lift
export LOCAL_PASSWORD=liftpass123
export LOCAL_TOKEN_FILE=/var/lib/influxdb2/influx.token

# Start influxd in background
influxd --bolt-path /var/lib/influxdb2/influxd.bolt --engine-path /var/lib/influxdb2/engine &
INFLUX_PID=$!

# Wait for InfluxDB to be ready
for i in {1..60}; do
  if curl -sf ${LOCAL_INFLUX_URL}/health >/dev/null; then break; fi; sleep 1; done

# One-time setup
if [ ! -f "$LOCAL_TOKEN_FILE" ]; then
  influx setup -f \
    -u "$LOCAL_ADMIN" -p "$LOCAL_PASSWORD" \
    -o "$LOCAL_ORG" -b "$LOCAL_BUCKET" \
    -r 0 -t admin-token >/tmp/setup.out 2>&1 || true
  # Grab token (either from output or via export)
  influx auth list -o "$LOCAL_ORG" -u "$LOCAL_ADMIN" -p "$LOCAL_PASSWORD" --json | awk -F'"' '/token/ {print $4; exit}' > "$LOCAL_TOKEN_FILE" || true
fi

LOCAL_TOKEN=$(cat "$LOCAL_TOKEN_FILE" || echo "")

# Write Grafana datasource provisioning using local Influx
cat > /etc/grafana/provisioning/datasources/lift.yml <<YAML
apiVersion: 1
datasources:
  - name: LiftLocalInflux
    type: influxdb
    access: proxy
    url: ${LOCAL_INFLUX_URL}
    jsonData:
      version: Flux
      organization: ${LOCAL_ORG}
      defaultBucket: ${LOCAL_BUCKET}
    secureJsonData:
      token: ${LOCAL_TOKEN}
    isDefault: true
YAML

# Write Grafana dashboard provisioning
cat > /etc/grafana/provisioning/dashboards/lift.yml <<YAML
apiVersion: 1
providers:
  - name: 'LiftDashboards'
    orgId: 1
    folder: 'Lift'
    type: file
    disableDeletion: false
    options:
      path: /var/lib/grafana/dashboards
YAML

mkdir -p /var/lib/grafana/dashboards
cat > /var/lib/grafana/dashboards/lift_dashboard.json <<'JSON'
{
  "title": "Lift Maintenance",
  "timezone": "browser",
  "panels": [
    {
      "type": "timeseries",
      "title": "Vibration RMS",
      "datasource": { "type": "influxdb", "uid": "LiftLocalInflux" },
      "fieldConfig": {"defaults": {"unit": "none"}},
      "targets": [
        {
          "query": "from(bucket: \"lift\") |> range(start: -30m) |> filter(fn: (r) => r._measurement == \"vibration\" and r._field == \"rms\")"
        }
      ],
      "gridPos": {"h": 9, "w": 24, "x": 0, "y": 0}
    },
    {
      "type": "table",
      "title": "Alerts",
      "datasource": { "type": "influxdb", "uid": "LiftLocalInflux" },
      "targets": [
        {
          "query": "from(bucket: \"lift\") |> range(start: -24h) |> filter(fn: (r) => r._measurement == \"alert\") |> keep(columns: [\"_time\", \"message\", \"value\"])"
        }
      ],
      "gridPos": {"h": 8, "w": 24, "x": 0, "y": 9}
    }
  ],
  "schemaVersion": 39,
  "version": 1
}
JSON

# Start the simulator/analysis in background
export LOCAL_TOKEN
python3 /app/generator.py &

# Start Grafana (foreground)
exec /run.sh

