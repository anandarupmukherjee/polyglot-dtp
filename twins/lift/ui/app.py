import os
import cherrypy
import json
from datetime import datetime, timezone, timedelta
from influxdb_client import InfluxDBClient


LOCAL_INFLUX_URL = os.getenv("LOCAL_INFLUX_URL", "http://lift_influx:8086")
LOCAL_ORG = os.getenv("LOCAL_ORG", "lift-org")
LOCAL_BUCKET = os.getenv("LOCAL_BUCKET", "lift")
LOCAL_TOKEN = os.getenv("LOCAL_TOKEN", "admin-token")


def query_points(measurement, field=None, minutes=30):
    with InfluxDBClient(url=LOCAL_INFLUX_URL, token=LOCAL_TOKEN, org=LOCAL_ORG) as client:
        q = f'from(bucket:"{LOCAL_BUCKET}") |> range(start: -{minutes}m) |> filter(fn:(r)=> r._measurement=="{measurement}")'
        if field:
            q += f' |> filter(fn:(r)=> r._field=="{field}")'
        tables = client.query_api().query(q)
        points = []
        for table in tables:
            for rec in table.records:
                points.append({
                    "time": rec.get_time().isoformat(),
                    "field": rec.get_field(),
                    "value": rec.get_value(),
                })
        return points


class LiftUI:
    @cherrypy.expose
    def index(self):
        return """
        <!doctype html>
        <html>
          <head>
            <meta charset='utf-8' />
            <meta name='viewport' content='width=device-width, initial-scale=1' />
            <title>Lift Maintenance</title>
            <script src='https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'></script>
            <style>
              body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; }
              .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin: .5rem 0; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border-bottom: 1px solid #e2e8f0; padding: .5rem; text-align: left; }
            </style>
          </head>
          <body>
            <h1>Lift Maintenance (Local)</h1>
            <div class='card'>
              <h2>Vibration RMS (last 30 min)</h2>
              <canvas id='vib'></canvas>
            </div>
            <div class='card'>
              <h2>Alerts (last 24h)</h2>
              <table id='alerts'><thead><tr><th>Time</th><th>Message</th><th>Value</th></tr></thead><tbody></tbody></table>
            </div>
            <script>
              async function loadVibration() {
                const res = await fetch('/api/vibration');
                const data = await res.json();
                const labels = data.map(p => new Date(p.time));
                const values = data.map(p => p.value);
                const ctx = document.getElementById('vib').getContext('2d');
                new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'RMS', data: values, borderColor: '#2563eb', tension: .15 }] }, options: { scales: { x: { type: 'time', time: { unit: 'minute' } } } } });
              }
              async function loadAlerts() {
                const res = await fetch('/api/alerts');
                const data = await res.json();
                const tb = document.querySelector('#alerts tbody');
                tb.innerHTML = data.map(a => `<tr><td>${a.time}</td><td>${a.message || ''}</td><td>${(a.value !== undefined && a.value !== null) ? a.value : ''}</td></tr>`).join('');
              }
              (async () => { await loadVibration(); await loadAlerts(); })();
            </script>
          </body>
        </html>
        """.encode()

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def api_vibration(self):
        pts = query_points("vibration", field="rms", minutes=30)
        # keep last 1000 points
        return pts[-1000:]

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def api_alerts(self):
        pts = query_points("alert", minutes=24*60)
        out = []
        for p in pts:
            out.append({
                "time": p["time"],
                "message": p.get("value") if p.get("field") == "message" else "",
                "value": p.get("value") if p.get("field") == "value" else None
            })
        # Collapse by time: group fields of same timestamp
        by_time = {}
        for row in out:
            t = row["time"]
            if t not in by_time:
                by_time[t] = {"time": t, "message": "", "value": None}
            if row["message"]:
                by_time[t]["message"] = row["message"]
            if row["value"] is not None:
                by_time[t]["value"] = row["value"]
        # Return most recent first, limit 200
        rows = list(by_time.values())
        rows.sort(key=lambda r: r["time"], reverse=True)
        return rows[:200]


if __name__ == '__main__':
    cherrypy.config.update({
        'server.socket_host': '0.0.0.0',
        'server.socket_port': 3000,
    })
    cherrypy.quickstart(LiftUI())
