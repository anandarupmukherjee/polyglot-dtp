import cherrypy
import os
import json
from datetime import datetime, timedelta, timezone
from influxdb_client import InfluxDBClient


INFLUX_URL = os.getenv("M5_INFLUX_URL", "http://influx_local:8086")
INFLUX_TOKEN = os.getenv("M5_INFLUX_TOKEN", "m5-token-123")
INFLUX_ORG = os.getenv("M5_INFLUX_ORG", "m5-org")
INFLUX_BUCKET = os.getenv("M5_INFLUX_BUCKET", "m5")
CONFIG_PATH = os.getenv("CONFIG_PATH", "/data/config.json")

HTML = """<!doctype html>
<html>
  <head>
    <meta charset='utf-8' />
    <meta name='viewport' content='width=device-width, initial-scale=1' />
    <title>M5Stack Core2 Twin</title>
    <style>
      body{font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; margin: 1.25rem}
      .card{border:1px solid #e2e8f0; border-radius:8px; padding:1rem; margin:.5rem 0}
      #cube{width:120px; height:120px; background:#2563eb22; border:2px solid #2563eb; border-radius:8px; transform-style:preserve-3d; display:inline-block}
      #viz{display:flex; gap:1rem; align-items:center}
      canvas{max-width:100%; height:240px}
      code{background:#f1f5f9; padding:0 .25rem; border-radius:4px}
    </style>
  </head>
  <body>
    <h1>M5Stack Core2 Twin</h1>
    <div class='card' id='viz'>
      <div>
        <div id='cube'></div>
        <div id='angles' style='margin-top:.5rem; color:#334155; font-size:.9em'></div>
      </div>
      <div style='flex:1'>
        <h3 style='margin:.25rem 0'>Vibration RMS (last 30 min)</h3>
        <canvas id='vib'></canvas>
      </div>
    </div>
    <div class='card'>
      <h3>Controls</h3>
      <label>Vibration Threshold: <input id='th' type='number' step='0.1' value='2.0' /></label>
      <button onclick='setThreshold()'>Set</button>
      <span id='status' style='margin-left:.5rem; color:#2563eb'></span>
    </div>
    <script>
      async function fetchJSON(url){ const r = await fetch(url); if(!r.ok) return null; return r.json(); }
      function drawLine(canvas, series){
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.clientWidth; const h = canvas.height = canvas.clientHeight;
        ctx.clearRect(0,0,w,h);
        if(!series || series.length===0){ ctx.fillStyle='#475569'; ctx.fillText('No data', 10, 20); return; }
        const xs = series.map(p=>p.t), ys = series.map(p=>p.v);
        const xmin=Math.min(...xs), xmax=Math.max(...xs), ymin=Math.min(...ys), ymax=Math.max(...ys);
        const pad=24; const sx = x=> pad + (x-xmin)/(xmax-xmin||1)*(w-2*pad); const sy = y=> h-pad - (y-ymin)/(ymax-ymin||1)*(h-2*pad);
        ctx.strokeStyle='#2563eb'; ctx.lineWidth=2; ctx.beginPath();
        series.forEach((p,i)=>{ const X=sx(p.t), Y=sy(p.v); if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y); });
        ctx.stroke();
      }
      async function load(){
        const o = await fetchJSON('/api/orientation');
        if(o && o.roll !== undefined){
          const cube = document.getElementById('cube');
          const r = o.roll||0, p = o.pitch||0, y = o.yaw||0;
          cube.style.transform = `rotateX(${p}deg) rotateY(${y}deg) rotateZ(${r}deg)`;
          document.getElementById('angles').textContent = `roll=${r.toFixed(1)}°, pitch=${p.toFixed(1)}°, yaw=${y.toFixed(1)}°`;
        }
        const vib = await fetchJSON('/api/vibration?mins=30');
        drawLine(document.getElementById('vib'), (vib&&vib.points)||[]);
      }
      async function setThreshold(){
        const v = parseFloat(document.getElementById('th').value || '2.0');
        const r = await fetch('/api/set_threshold', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ vib_threshold: v }) });
        document.getElementById('status').textContent = r.ok ? 'Threshold updated' : 'Failed';
      }
      load(); setInterval(load, 4000);
    </script>
  </body>
  </html>"""


class API:
    @cherrypy.expose
    @cherrypy.tools.json_out()
    def vibration(self, mins="30"):
        try:
            mins = int(mins)
        except Exception:
            mins = 30
        start = datetime.now(timezone.utc) - timedelta(minutes=mins)
        q = (
            f'from(bucket:"{INFLUX_BUCKET}") '
            f'|> range(start: {start.isoformat()}) '
            f'|> filter(fn: (r) => r._measurement == "vibration" and r._field == "rms") '
            f'|> keep(columns: ["_time","_value"])'
        )
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
            res = c.query_api().query(org=INFLUX_ORG, query=q)
        pts = []
        for tbl in res:
            for rec in tbl.records:
                pts.append({"t": rec.get_time().timestamp(), "v": float(rec.get_value())})
        pts.sort(key=lambda p: p["t"])
        return {"points": pts}

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def orientation(self):
        # return last known orientation
        q = (
            f'from(bucket:"{INFLUX_BUCKET}") '
            f'|> range(start: -2h) '
            f'|> filter(fn: (r) => r._measurement == "orientation") '
            f'|> keep(columns: ["_time","roll","pitch","yaw"])'
        )
        # Simpler: query each field last()
        q = (
            f'roll=from(bucket:"{INFLUX_BUCKET}")|>range(start:-2h)|>filter(fn:(r)=> r._measurement=="orientation" and r._field=="roll")|>last()'
            f'\npitch=from(bucket:"{INFLUX_BUCKET}")|>range(start:-2h)|>filter(fn:(r)=> r._measurement=="orientation" and r._field=="pitch")|>last()'
            f'\nyaw=from(bucket:"{INFLUX_BUCKET}")|>range(start:-2h)|>filter(fn:(r)=> r._measurement=="orientation" and r._field=="yaw")|>last()'
            f'\nunion(tables: [roll,pitch,yaw])'
        )
        vals = {"roll": 0.0, "pitch": 0.0, "yaw": 0.0}
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
            res = c.query_api().query(org=INFLUX_ORG, query=q)
        for tbl in res:
            for rec in tbl.records:
                f = rec.get_field()
                if f in vals:
                    vals[f] = float(rec.get_value())
        return vals

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def set_threshold(self):
        try:
            l = int(cherrypy.request.headers.get("Content-Length", "0"))
            body = cherrypy.request.body.read(l) if l > 0 else b"{}"
            data = json.loads(body.decode("utf-8"))
            vt = float(data.get("vib_threshold", 2.0))
            os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
            with open(CONFIG_PATH, "w") as f:
                json.dump({"vib_threshold": vt}, f)
            return {"ok": True, "vib_threshold": vt}
        except Exception as e:
            cherrypy.response.status = 400
            return {"ok": False, "error": str(e)}


class App:
    @cherrypy.expose
    def index(self):
        return HTML

    api = API()


def run():
    cherrypy.config.update({
        'server.socket_host': '0.0.0.0',
        'server.socket_port': 8000,
    })
    cherrypy.quickstart(App())


if __name__ == '__main__':
    run()

