import os, time, math, random
from datetime import datetime, timezone
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
import paho.mqtt.client as mqtt


LOCAL_URL = os.getenv("LOCAL_INFLUX_URL", os.getenv("LIFT_INFLUX_URL", "http://influx_local:8086"))
LOCAL_ORG = os.getenv("LOCAL_ORG", "lift-org")
LOCAL_BUCKET = os.getenv("LOCAL_BUCKET", "lift")
LOCAL_TOKEN_FILE = os.getenv("LOCAL_TOKEN_FILE", "/var/lib/influxdb2/influx.token")

# Central Influx for alerts (optional)
CENTRAL_URL = os.getenv("CENTRAL_INFLUX_URL")
CENTRAL_ORG = os.getenv("CENTRAL_INFLUX_ORG")
CENTRAL_BUCKET = os.getenv("CENTRAL_INFLUX_BUCKET")
CENTRAL_TOKEN = os.getenv("CENTRAL_INFLUX_TOKEN")

# MQTT for alerts
MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_ALERT_TOPIC", "dtp/lift/alerts")

DEFAULT_VIB_THRESHOLD = float(os.getenv("VIB_THRESHOLD", "2.0"))
LIFT_ID = os.getenv("LIFT_ID", "lift-001")
CONFIG_PATH = os.getenv("CONFIG_PATH", "/app/shared/config.json")


def read_local_token():
    try:
        with open(LOCAL_TOKEN_FILE, "r") as f:
            return f.read().strip()
    except Exception:
        return ""


def main():
    local_token = os.getenv("LOCAL_TOKEN") or os.getenv("LIFT_INFLUX_TOKEN") or ""
    if not local_token:
        # wait until token file is available
        for _ in range(60):
            local_token = read_local_token()
            if local_token:
                break
            time.sleep(1)

    if not local_token:
        print("[Lift] ERROR: No local Influx token; exiting")
        return

    local = InfluxDBClient(url=LOCAL_URL, token=local_token, org=LOCAL_ORG)

    w_local = local.write_api(write_options=SYNCHRONOUS)
    # MQTT publisher
    mqtt_client = mqtt.Client()
    try:
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
        mqtt_client.loop_start()
    except Exception as e:
        print(f"[Lift] WARN: MQTT connect failed: {e}")

    t0 = time.time()
    current_threshold = DEFAULT_VIB_THRESHOLD
    while True:
        # check config for threshold update
        try:
            if os.path.exists(CONFIG_PATH):
                import json
                with open(CONFIG_PATH, 'r') as f:
                    cfg = json.load(f)
                vt = float(cfg.get('vib_threshold', current_threshold))
                current_threshold = vt
        except Exception:
            pass
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

        if rms >= current_threshold:
            msg = f"Vibration threshold exceeded (rms={rms:.2f} >= {current_threshold})"
            a = (
                Point("alert")
                .tag("lift_id", LIFT_ID)
                .field("message", msg)
                .field("value", float(rms))
                .time(now, WritePrecision.NS)
            )
            # write locally
            w_local.write(bucket=LOCAL_BUCKET, record=a)
            # publish alert over MQTT
            try:
                payload = {
                    "type": "vibration_alert",
                    "lift_id": LIFT_ID,
                    "rms": float(rms),
                    "threshold": VIB_THRESHOLD,
                    "ts": now.isoformat(),
                    "source": "lift-twin"
                }
                import json
                mqtt_client.publish(MQTT_TOPIC, json.dumps(payload), qos=1)
            except Exception as e:
                print(f"[Lift] WARN: MQTT publish failed: {e}")
            # also write to central Influx if configured
            try:
                if CENTRAL_URL and CENTRAL_TOKEN and CENTRAL_ORG and CENTRAL_BUCKET:
                    with InfluxDBClient(url=CENTRAL_URL, token=CENTRAL_TOKEN, org=CENTRAL_ORG) as ic:
                        w = ic.write_api(write_options=SYNCHRONOUS)
                        w.write(bucket=CENTRAL_BUCKET, record=a)
            except Exception as e:
                print(f"[Lift] WARN: Central Influx write failed: {e}")
            print(f"[Lift] ALERT: {msg}")

        time.sleep(1)


if __name__ == "__main__":
    main()
