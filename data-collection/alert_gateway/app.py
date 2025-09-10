import os, json
import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient, Point, WritePrecision

MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_ALERT_TOPIC", "dtp/lift/alerts")

CENTRAL_URL = os.getenv("CENTRAL_INFLUX_URL", "http://influx:8086")
CENTRAL_ORG = os.getenv("INFLUX_ORG", "dtp-org")
CENTRAL_BUCKET = os.getenv("INFLUX_BUCKET", "signals")
CENTRAL_TOKEN = os.getenv("INFLUX_TOKEN", "")


def on_msg(client, userdata, msg):
    try:
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
    cli.subscribe(MQTT_TOPIC, qos=1)
    print(f"[Gateway] Subscribed to {MQTT_TOPIC}; forwarding to {CENTRAL_URL}/{CENTRAL_BUCKET}")
    cli.loop_forever()


if __name__ == "__main__":
    main()

