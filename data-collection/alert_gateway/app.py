import os, json, time
import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient, Point, WritePrecision
import urllib.request

MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_ALERT_TOPIC", "dtp/lift/alerts")
REGISTRY_URL = os.getenv("REGISTRY_URL", "http://django:8000/api/registry/public/twins")
TENANT = os.getenv("TENANT", "demo")

CENTRAL_URL = os.getenv("CENTRAL_INFLUX_URL", "http://influx:8086")
CENTRAL_ORG = os.getenv("INFLUX_ORG", "dtp-org")
CENTRAL_BUCKET = os.getenv("INFLUX_BUCKET", "signals")
CENTRAL_TOKEN = os.getenv("INFLUX_TOKEN", "")


ALLOWED_TOPICS = set()


def refresh_allowed_topics():
    global ALLOWED_TOPICS
    try:
        url = f"{REGISTRY_URL}?tenant={TENANT}"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        topics = set()
        for tw in data or []:
            streams = ((tw.get("interfaces") or {}).get("data_streams") or [])
            for s in streams:
                if isinstance(s, str) and s.upper().startswith("MQTT:"):
                    topics.add(s.split(":",1)[1])
        if not topics and MQTT_TOPIC:
            topics.add(MQTT_TOPIC)
        ALLOWED_TOPICS = topics
        print(f"[Gateway] Allowed topics from registry: {sorted(ALLOWED_TOPICS)}")
    except Exception as e:
        print(f"[Gateway] WARN: cannot refresh allowed topics: {e}")
        if not ALLOWED_TOPICS and MQTT_TOPIC:
            ALLOWED_TOPICS = {MQTT_TOPIC}


def on_msg(client, userdata, msg):
    try:
        # enforce allowed topics
        if ALLOWED_TOPICS and msg.topic not in ALLOWED_TOPICS:
            return
        payload = json.loads(msg.payload.decode("utf-8"))
        # Write to central Influx as alert
        with InfluxDBClient(url=CENTRAL_URL, token=CENTRAL_TOKEN, org=CENTRAL_ORG) as ic:
            w = ic.write_api()
            p = (
                Point("alert")
                .tag("source", payload.get("source","mqtt"))
                .tag("lift_id", payload.get("lift_id","unknown"))
                .field("message", json.dumps(payload))
                .field("value", float(payload.get("rms", 0.0)))
            )
            w.write(bucket=CENTRAL_BUCKET, record=p)
        print(f"[Gateway] wrote alert for lift {payload.get('lift_id')}")
    except Exception as e:
        print(f"[Gateway] ERROR: {e}")


def main():
    cli = mqtt.Client()
    cli.on_message = on_msg
    cli.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    refresh_allowed_topics()
    # subscribe to each allowed topic
    for t in sorted(ALLOWED_TOPICS):
        cli.subscribe(t, qos=1)
    print(f"[Gateway] Subscribed to {sorted(ALLOWED_TOPICS)}; forwarding to {CENTRAL_URL}/{CENTRAL_BUCKET}")
    cli.loop_forever()


if __name__ == "__main__":
    main()

