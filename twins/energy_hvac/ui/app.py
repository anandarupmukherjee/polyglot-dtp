import cherrypy
import os
from datetime import datetime, timedelta, timezone
from influxdb_client import InfluxDBClient

INFLUX_URL = os.getenv("ENERGY_INFLUX_URL", "http://influx_local:8086")
INFLUX_TOKEN = os.getenv("ENERGY_INFLUX_TOKEN", "energy-token-123")
INFLUX_ORG = os.getenv("ENERGY_INFLUX_ORG", "energy-org")
INFLUX_BUCKET = os.getenv("ENERGY_INFLUX_BUCKET", "energy")

HTML = """<!doctype html>
<html>
  <head>
    <meta charset='utf-8'/>
    <meta name='viewport' content='width=device-width, initial-scale=1'/>
    <title>Energy & HVAC Twin</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:1.25rem}
      .card{border:1px solid #e2e8f0;border-radius:8px;padding:1rem;margin:.5rem 0}
      canvas{max-width:100%;height:260px}
      code{background:#f1f5f9;padding:0 .25rem;border-radius:4px}
    </style>
  </head>
  <body>
    <h1>Energy & HVAC Twin</h1>
    <div class='card'>
      <h3>Energy (kWh) and Cost (currency) — last 60 min</h3>
      <canvas id='energy'></canvas>
      <canvas id='cost' style='margin-top:.75rem'></canvas>
    </div>
    <div class='card'>
      <h3>HVAC State Events</h3>
      <ul id='events' style='margin:.5rem 0'></ul>
    </div>
    <script>
      async function j(url){ const r=await fetch(url); if(!r.ok) return null; return r.json(); }
      function drawLine(canvas, series, color){
        const ctx = canvas.getContext('2d'); const w = canvas.width = canvas.clientWidth; const h = canvas.height = canvas.clientHeight;
        ctx.clearRect(0,0,w,h); if(!series||series.length===0){ ctx.fillText('No data',10,20); return; }
        const xs=series.map(p=>p.t), ys=series.map(p=>p.v); const xmin=Math.min(...xs), xmax=Math.max(...xs), ymin=Math.min(...ys), ymax=Math.max(...ys);
        const pad=24; const sx=x=>(pad + (x-xmin)/(xmax-xmin||1)*(w-2*pad)); const sy=y=>(h-pad - (y-ymin)/(ymax-ymin||1)*(h-2*pad));
        ctx.strokeStyle=color||'#2563eb'; ctx.lineWidth=2; ctx.beginPath(); series.forEach((p,i)=>{ const X=sx(p.t), Y=sy(p.v); if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y); }); ctx.stroke();
      }
      async function load(){
        const e = await j('/api/energy?mins=60'); drawLine(document.getElementById('energy'), (e&&e.points)||[], '#2563eb');
        const c = await j('/api/cost?mins=60'); drawLine(document.getElementById('cost'), (c&&c.points)||[], '#16a34a');
        const ev = await j('/api/events?mins=60'); document.getElementById('events').innerHTML = ((ev&&ev.items)||[]).map(x=>`<li><code>${x.ts}</code> — ${x.state}</li>`).join('') || '<em>No events</em>';
      }
      load(); setInterval(load, 5000);
    </script>
  </body>
  </html>"""


class API:
    @cherrypy.expose
    @cherrypy.tools.json_out()
    def energy(self, mins="60"):
        try:
            mins = int(mins)
        except Exception:
            mins = 60
        start = datetime.now(timezone.utc) - timedelta(minutes=mins)
        q = f'from(bucket:"{INFLUX_BUCKET}") |> range(start: {start.isoformat()}) |> filter(fn: (r) => r._measurement == "energy" and r._field == "kwh") |> keep(columns: ["_time","_value"])'
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
            res = c.query_api().query(org=INFLUX_ORG, query=q)
        pts = []
        for t in res:
            for r in t.records:
                pts.append({"t": r.get_time().timestamp(), "v": float(r.get_value())})
        pts.sort(key=lambda p: p['t'])
        return {"points": pts}

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def cost(self, mins="60"):
        try:
            mins = int(mins)
        except Exception:
            mins = 60
        start = datetime.now(timezone.utc) - timedelta(minutes=mins)
        q = f'from(bucket:"{INFLUX_BUCKET}") |> range(start: {start.isoformat()}) |> filter(fn: (r) => r._measurement == "energy" and r._field == "cost") |> keep(columns: ["_time","_value"])'
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
            res = c.query_api().query(org=INFLUX_ORG, query=q)
        pts = []
        for t in res:
            for r in t.records:
                pts.append({"t": r.get_time().timestamp(), "v": float(r.get_value())})
        pts.sort(key=lambda p: p['t'])
        return {"points": pts}

    @cherrypy.expose
    @cherrypy.tools.json_out()
    def events(self, mins="60"):
        try:
            mins = int(mins)
        except Exception:
            mins = 60
        start = datetime.now(timezone.utc) - timedelta(minutes=mins)
        q = f'from(bucket:"{INFLUX_BUCKET}") |> range(start: {start.isoformat()}) |> filter(fn: (r) => r._measurement == "hvac_event" and r._field == "state") |> keep(columns: ["_time","_value"])'
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as c:
            res = c.query_api().query(org=INFLUX_ORG, query=q)
        items = []
        for t in res:
            for r in t.records:
                items.append({"ts": r.get_time().isoformat(), "state": r.get_value()})
        return {"items": items}


class App:
    api = API()

    @cherrypy.expose
    def index(self):
        return HTML


def run():
    cherrypy.config.update({'server.socket_host': '0.0.0.0', 'server.socket_port': 8000})
    cherrypy.quickstart(App())


if __name__ == '__main__':
    run()

