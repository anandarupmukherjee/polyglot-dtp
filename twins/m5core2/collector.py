import os, json, time
from datetime import datetime, timezone
from typing import Optional

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
import paho.mqtt.client as mqtt
import ssl

LOCAL_URL = os.getenv("LOCAL_INFLUX_URL", "http://influx_local:8086")
LOCAL_ORG = os.getenv("LOCAL_ORG", "m5-org")
LOCAL_BUCKET = os.getenv("LOCAL_BUCKET", "m5")
LOCAL_TOKEN_FILE = os.getenv("LOCAL_TOKEN_FILE", "/var/lib/influxdb2/influx.token")

CONFIG_PATH = os.getenv("CONFIG_PATH", "/data/config.json")

MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USERNAME") or None
MQTT_PASS = os.getenv("MQTT_PASSWORD") or None
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "dtp/m5core2/telemetry")
MQTT_ALERT_TOPIC = os.getenv("MQTT_ALERT_TOPIC", "dtp/m5core2/alerts")
MQTT_TLS = os.getenv("MQTT_TLS", "false").lower() in ("1","true","yes")
MQTT_TLS_INSECURE = os.getenv("MQTT_TLS_INSECURE", "false").lower() in ("1","true","yes")
MQTT_TLS_CA = os.getenv("MQTT_TLS_CA") or None  # optional CA bundle path


def read_local_token() -> str:
    try:
        with open(LOCAL_TOKEN_FILE, "r") as f:
            return f.read().strip()
    except Exception:
        return ""


def read_threshold(default: float = 2.0) -> float:
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r") as f:
                cfg = json.load(f)
            vt = float(cfg.get("vib_threshold", default))
            return vt
    except Exception:
        pass
    return default


def main():
    # Wait for local token
    local_token = os.getenv("LOCAL_TOKEN") or os.getenv("M5_INFLUX_TOKEN") or ""
    if not local_token:
        for _ in range(60):
            local_token = read_local_token()
            if local_token:
                break
            time.sleep(1)
    if not local_token:
        print("[M5] ERROR: No local Influx token; exiting")
        return

    client = InfluxDBClient(url=LOCAL_URL, token=local_token, org=LOCAL_ORG)
    write_api = client.write_api(write_options=SYNCHRONOUS)

    def on_connect(cli, userdata, flags, rc):
        print(f"[M5] MQTT connected rc={rc}; subscribing {MQTT_TOPIC}")
        cli.subscribe(MQTT_TOPIC, qos=1)

    def on_message(cli, userdata, msg):
        now = datetime.now(timezone.utc)
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception as e:
            print(f"[M5] WARN: bad JSON: {e}")
            return

        # Expect payload like: { "device_id": "core2-001", "rms": 1.23, "roll": 10, "pitch": -5, "yaw": 45 }
        dev = str(payload.get("device_id") or "core2")
        rms = float(payload.get("rms") or 0.0)
        roll = float(payload.get("roll") or 0.0)
        pitch = float(payload.get("pitch") or 0.0)
        yaw = float(payload.get("yaw") or 0.0)

        # Write points
        p_v = Point("vibration").tag("device_id", dev).field("rms", rms).time(now, WritePrecision.NS)
        p_o = (
            Point("orientation")
            .tag("device_id", dev)
            .field("roll", roll)
            .field("pitch", pitch)
            .field("yaw", yaw)
            .time(now, WritePrecision.NS)
        )
        try:
            write_api.write(bucket=LOCAL_BUCKET, record=[p_v, p_o])
        except Exception as e:
            print(f"[M5] WARN: Influx write failed: {e}")

        # Alert if over threshold
        try:
            th = read_threshold(2.0)
            if rms >= th:
                alert = {
                    "type": "vibration_alert",
                    "device_id": dev,
                    "rms": rms,
                    "threshold": th,
                    "ts": now.isoformat(),
                    "source": "m5core2-collector",
                }
                cli.publish(MQTT_ALERT_TOPIC, json.dumps(alert), qos=1)
        except Exception as e:
            print(f"[M5] WARN: alert publish failed: {e}")

    cli = mqtt.Client()
    if MQTT_USER:
        cli.username_pw_set(MQTT_USER, MQTT_PASS or "")
    if MQTT_TLS:
        if MQTT_TLS_CA and os.path.exists(MQTT_TLS_CA):
            cli.tls_set(ca_certs=MQTT_TLS_CA, certfile=None, keyfile=None, cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS, ciphers=None)
        else:
            # Use system CA store
            cli.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS)
        if MQTT_TLS_INSECURE:
            cli.tls_insecure_set(True)
    cli.on_connect = on_connect
    cli.on_message = on_message
    cli.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    cli.loop_forever()


if __name__ == "__main__":
    main()
