import os, time, uuid
from datetime import datetime, timezone, timedelta
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from dotenv import load_dotenv

load_dotenv()
url = "http://localhost:8086"
token = os.getenv("INFLUX_TOKEN")
org = os.getenv("INFLUX_ORG","dtp-org")
bucket = os.getenv("INFLUX_BUCKET","signals")

def run():
    sig = str(uuid.uuid4())
    with InfluxDBClient(url=url, token=token, org=org) as client:
        write_api = client.write_api(write_options=SYNCHRONOUS)
        now = datetime.now(timezone.utc)
        for i in range(5):
            p = Point("observation").tag("signal_id", sig).field("value", 42.0+i).time(now + timedelta(seconds=i), WritePrecision.NS)
            write_api.write(bucket=bucket, record=p)
        time.sleep(1)
        query_api = client.query_api()
        q = f'''from(bucket:"{bucket}") |> range(start: -5m) |> filter(fn:(r) => r._measurement=="observation" and r.signal_id=="{sig}")'''
        tables = query_api.query(q)
        cnt = sum(1 for _ in tables[0].records) if tables else 0
    assert cnt >= 1, "Influx write/query failed"
    print(f"[INFLUX] OK: wrote {cnt} points for signal {sig}")
    return {"signal_id": sig, "points": cnt}

if __name__ == "__main__":
    run()
