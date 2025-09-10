#!/usr/bin/env bash
set -euo pipefail

# Local InfluxDB setup
# Use IPv4 loopback explicitly to avoid IPv6 (::1) resolution issues
export LOCAL_INFLUX_URL=http://127.0.0.1:8086
export LOCAL_ORG=lift-org
export LOCAL_BUCKET=lift
export LOCAL_ADMIN=lift
export LOCAL_PASSWORD=liftpass123
export LOCAL_TOKEN_FILE=/var/lib/influxdb2/influx.token
# Grafana -> Influx via InfluxQL user/pass (v1 auth compatibility)
export GRAFANA_INFLUX_USER=${GRAFANA_INFLUX_USER:-grafana}
export GRAFANA_INFLUX_PASSWORD=${GRAFANA_INFLUX_PASSWORD:-grafana123}

# Start influxd in background
# Ensure Influx binds on :8086 for HTTP
export INFLUXD_HTTP_BIND_ADDRESS=":8086"
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
  echo -n "admin-token" > "$LOCAL_TOKEN_FILE"
fi

LOCAL_TOKEN=$(cat "$LOCAL_TOKEN_FILE" 2>/dev/null || echo "admin-token")

# Create v1 auth (user/pass) mapped to the lift bucket for InfluxQL access
BUCKET_ID=$(influx bucket list -o "$LOCAL_ORG" -t "$LOCAL_TOKEN" 2>/dev/null | awk -v b="$LOCAL_BUCKET" '$0 ~ b {print $1; exit}')
if [ -n "$BUCKET_ID" ]; then
  influx v1 auth create -o "$LOCAL_ORG" -t "$LOCAL_TOKEN" \
    --username "$GRAFANA_INFLUX_USER" --password "$GRAFANA_INFLUX_PASSWORD" \
    --read-bucket "$BUCKET_ID" --write-bucket "$BUCKET_ID" >/dev/null 2>&1 || true
fi

# Write Grafana datasource provisioning using local Influx
cat > /etc/grafana/provisioning/datasources/lift.yml <<YAML
apiVersion: 1
datasources:
  - name: LiftLocalInfluxQL
    uid: lift_local_ql
    type: influxdb
    access: proxy
    url: ${LOCAL_INFLUX_URL}
    user: ${GRAFANA_INFLUX_USER}
    jsonData:
      version: InfluxQL
      dbName: ${LOCAL_BUCKET}
      httpMode: POST
    secureJsonData:
      password: ${GRAFANA_INFLUX_PASSWORD}
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
      "datasource": { "type": "influxdb", "uid": "lift_local_ql" },
      "fieldConfig": {"defaults": {"unit": "none"}},
      "targets": [
        {
          "query": "SELECT mean(\"rms\") AS \"rms\" FROM \"vibration\" WHERE $timeFilter GROUP BY time($__interval) fill(null)",
          "rawQuery": true,
          "refId": "A"
        }
      ],
      "gridPos": {"h": 9, "w": 24, "x": 0, "y": 0}
    },
    {
      "type": "table",
      "title": "Alerts",
      "datasource": { "type": "influxdb", "uid": "lift_local_ql" },
      "targets": [
        {
          "query": "SELECT \"message\", \"value\" FROM \"alert\" WHERE $timeFilter",
          "rawQuery": true,
          "refId": "B"
        }
      ],
      "gridPos": {"h": 8, "w": 24, "x": 0, "y": 9}
    }
  ],
  "schemaVersion": 39,
  "version": 1
}
JSON

# Ensure Grafana can read provisioning and dashboards
chown -R grafana:grafana /etc/grafana/provisioning /var/lib/grafana/dashboards || true

# Start the simulator/analysis in background
export LOCAL_TOKEN
python3 /app/generator.py &

# Start Grafana (foreground)
exec /run.sh
