import cherrypy
import os
import json
from datetime import datetime, timedelta, timezone
from influxdb_client import InfluxDBClient, Point, WriteOptions


INFLUX_URL = os.getenv("LIFT_INFLUX_URL", "http://influx_local:8086")
INFLUX_TOKEN = os.getenv("LIFT_INFLUX_TOKEN", "lift-token-123")
INFLUX_ORG = os.getenv("LIFT_INFLUX_ORG", "lift-org")
INFLUX_BUCKET = os.getenv("LIFT_INFLUX_BUCKET", "lift")
CONFIG_PATH = os.getenv("CONFIG_PATH", "/app/shared/config.json")

# central influx (optional for test alert fanout)
CENTRAL_URL = os.getenv("CENTRAL_INFLUX_URL")
CENTRAL_ORG = os.getenv("CENTRAL_INFLUX_ORG")
CENTRAL_BUCKET = os.getenv("CENTRAL_INFLUX_BUCKET")
CENTRAL_TOKEN = os.getenv("CENTRAL_INFLUX_TOKEN")


HTML_PAGE = """<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lift Twin UI</title>
    <style>
      body{font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; margin: 1.25rem;}
      h1{margin:0 0 .5rem 0}
      .card{border:1px solid #e2e8f0; border-radius:8px; padding:1rem; margin:.5rem 0}
      canvas{max-width:100%; height:280px}
      code{background:#f1f5f9; padding:0 .25rem; border-radius:4px}
    </style>
  </head>
  <body>
    <h1>Lift Twin</h1>
    <div class="card">
      <h3>Controls</h3>
      <div>
        <label>Vibration Threshold: <input id="th" type="number" step="0.1" value="2.0" /></label>
        <button onclick="setThreshold()">Set</button>
        <button onclick="triggerAlert()" style="margin-left:.5rem">Trigger Test Alert</button>
        <span id="ctrlStatus" style="margin-left:.5rem;color:#2563eb"></span>
      </div>
    </div>
    <div class="card">
      <h3>Vibration RMS (last 60 min)</h3>
      <canvas id="vib"></canvas>
    </div>
    <div class="card">
      <h3>Alerts (last 60 min)</h3>
      <ul id="alerts" style="margin:.5rem 0"></ul>
    </div>
    <script>
      async function fetchJSON(url){ const r = await fetch(url); if(!r.ok) return null; return r.json(); }
      function drawSimpleLine(canvas, series){
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.clientWidth;
        const h = canvas.height = canvas.clientHeight;
        ctx.clearRect(0,0,w,h);
        if(!series || series.length===0){ ctx.fillStyle='#475569'; ctx.fillText('No data', 10, 20); return; }
        const xs = series.map(p=>p.t);
        const ys = series.map(p=>p.v);
        const xmin = Math.min(...xs), xmax = Math.max(...xs);
        const ymin = Math.min(...ys), ymax = Math.max(...ys);
        const pad = 24;
        function sx(x){ return pad + (x - xmin) / (xmax - xmin || 1) * (w - 2*pad); }
        function sy(y){ return h - pad - (y - ymin) / (ymax - ymin || 1) * (h - 2*pad); }
        ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.beginPath();
        series.forEach((p,i)=>{ const X=sx(p.t), Y=sy(p.v); if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y); });
        ctx.stroke();
      }
      async function load(){
        const vib = await fetchJSON('/api/vibration?mins=60');
        drawSimpleLine(document.getElementById('vib'), (vib&&vib.points)||[]);
        const al = await fetchJSON('/api/alerts?mins=60');
        const list = document.getElementById('alerts');
        list.innerHTML = ((al&&al.items)||[]).map(a=>`<li><code>${a.ts}</code> — ${a.message} (value=${a.value})</li>`).join('') || '<em>No alerts</em>';
      }
      load(); setInterval(load, 5000);

      async function setThreshold(){
        const v = parseFloat(document.getElementById('th').value || '2.0');
        const r = await fetch('/api/set_threshold', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ vib_threshold: v }) });
        document.getElementById('ctrlStatus').textContent = r.ok ? 'Threshold updated' : 'Failed';
      }
      async function triggerAlert(){
        const r = await fetch('/api/trigger_alert', { method:'POST' });
        document.getElementById('ctrlStatus').textContent = r.ok ? 'Alert triggered' : 'Failed';
        load();
      }
    </script>
  </body>
  </html>"""


class API:
    @cherrypy.expose
    @cherrypy.tools.json_out()
    def vibration(self, mins="60"):
        try:
            mins = int(mins)
        except Exception:
            mins = 60
        start = datetime.now(timezone.utc) - timedelta(minutes=mins)
        q = f'from(bucket:"{INFLUX_BUCKET}") |> range(start: {start.isoformat()}) |> filter(fn: (r) => r._measurement == "vibration" and r._field == "rms") |> keep(columns: ["_time","_value"])'
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
            res = c.query_api().query(org=INFLUX_ORG, query=q)
        points = []
        for table in res:
            for rec in table.records:
                t = rec.get_time().timestamp()
                v = float(rec.get_value())
                points.append({"t": t, "v": v})
        points.sort(key=lambda p: p["t"])
        return {"points": points}

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def alerts(self, mins="60"):
        try:
            mins = int(mins)
        except Exception:
            mins = 60
        start = datetime.now(timezone.utc) - timedelta(minutes=mins)
        q = f'from(bucket:"{INFLUX_BUCKET}") |> range(start: {start.isoformat()}) |> filter(fn: (r) => r._measurement == "alert" and r._field == "message") |> keep(columns: ["_time","_value"])'
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
            res = c.query_api().query(org=INFLUX_ORG, query=q)
        items = []
        for table in res:
            for rec in table.records:
                items.append({
                    "ts": rec.get_time().isoformat(),
                    "message": rec.get_value(),
                    "value": None
                })
        return {"items": items}

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def set_threshold(self):
        try:
            raw = cherrypy.request.body.read()
            data = json.loads(raw or b"{}")
            vt = float(data.get('vib_threshold', 2.0))
            os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
            with open(CONFIG_PATH, 'w') as f:
                json.dump({'vib_threshold': vt}, f)
            return {'ok': True, 'vib_threshold': vt}
        except Exception as e:
            cherrypy.response.status = 400
            return {'ok': False, 'error': str(e)}

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def trigger_alert(self):
        # write a manual alert to local and central influx (if configured)
        now = datetime.now(timezone.utc)
        try:
            with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
                w = c.write_api(write_options=WriteOptions(batch_size=1))
                from influxdb_client import Point
                p = Point('alert').field('message','Manual trigger').field('value', 1.0).time(now)
                w.write(bucket=INFLUX_BUCKET, record=p)
        except Exception as e:
            pass
        try:
            if CENTRAL_URL and CENTRAL_TOKEN and CENTRAL_ORG and CENTRAL_BUCKET:
                with InfluxDBClient(url=CENTRAL_URL, token=CENTRAL_TOKEN, org=CENTRAL_ORG) as ic:
                    w2 = ic.write_api(write_options=WriteOptions(batch_size=1))
                    p2 = Point('alert').field('message','Manual trigger').field('value', 1.0).time(now)
                    w2.write(bucket=CENTRAL_BUCKET, record=p2)
        except Exception:
            pass
        return {'ok': True}


class LiftUI:
    @cherrypy.expose
    def index(self):
        return HTML_PAGE

    # mount API under /api
    api = API()


def run():
    cherrypy.config.update({
        'server.socket_host': '0.0.0.0',
        'server.socket_port': 8000,
    })
    cherrypy.quickstart(LiftUI())


if __name__ == '__main__':
    run()
