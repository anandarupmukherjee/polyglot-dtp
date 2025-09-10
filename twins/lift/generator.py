import os, time, math, random
from datetime import datetime, timezone
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS


LOCAL_URL = os.getenv("LOCAL_INFLUX_URL", "http://localhost:8086")
LOCAL_ORG = os.getenv("LOCAL_ORG", "lift-org")
LOCAL_BUCKET = os.getenv("LOCAL_BUCKET", "lift")
LOCAL_TOKEN_FILE = os.getenv("LOCAL_TOKEN_FILE", "/var/lib/influxdb2/influx.token")

CENTRAL_URL = os.getenv("CENTRAL_INFLUX_URL", "http://influx:8086")
CENTRAL_ORG = os.getenv("INFLUX_ORG", "dtp-org")
CENTRAL_BUCKET = os.getenv("INFLUX_BUCKET", "signals")
CENTRAL_TOKEN = os.getenv("INFLUX_TOKEN", "")

VIB_THRESHOLD = float(os.getenv("VIB_THRESHOLD", "2.0"))
LIFT_ID = os.getenv("LIFT_ID", "lift-001")


def read_local_token():
    try:
        with open(LOCAL_TOKEN_FILE, "r") as f:
            return f.read().strip()
    except Exception:
        return ""


def main():
    local_token = ""
    # wait until token is available
    for _ in range(60):
        local_token = read_local_token()
        if local_token:
            break
        time.sleep(1)

    if not local_token:
        print("[Lift] ERROR: No local Influx token; exiting")
        return

    local = InfluxDBClient(url=LOCAL_URL, token=local_token, org=LOCAL_ORG)
    central = None
    if CENTRAL_TOKEN:
        central = InfluxDBClient(url=CENTRAL_URL, token=CENTRAL_TOKEN, org=CENTRAL_ORG)

    w_local = local.write_api(write_options=SYNCHRONOUS)
    w_central = central.write_api(write_options=SYNCHRONOUS) if central else None

    t0 = time.time()
    while True:
        t = time.time() - t0
        # base vibration: sine + noise, with occasional spikes
        base = 1.0 + 0.5 * math.sin(t / 3.0) + random.gauss(0, 0.1)
        if random.random() < 0.02:
            base += random.uniform(1.0, 2.5)
        rms = max(0.0, base)
        now = datetime.now(timezone.utc)

        p = (
            Point("vibration")
            .tag("lift_id", LIFT_ID)
            .field("rms", float(rms))
            .time(now, WritePrecision.NS)
        )
        w_local.write(bucket=LOCAL_BUCKET, record=p)

        if rms >= VIB_THRESHOLD:
            msg = f"Vibration threshold exceeded (rms={rms:.2f} >= {VIB_THRESHOLD})"
            a = (
                Point("alert")
                .tag("lift_id", LIFT_ID)
                .field("message", msg)
                .field("value", float(rms))
                .time(now, WritePrecision.NS)
            )
            # write locally
            w_local.write(bucket=LOCAL_BUCKET, record=a)
            # send only alerts to central
            if w_central:
                w_central.write(bucket=CENTRAL_BUCKET, record=a)
            print(f"[Lift] ALERT: {msg}")

        time.sleep(1)


if __name__ == "__main__":
    main()

