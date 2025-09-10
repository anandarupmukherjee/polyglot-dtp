import os
import json
import time
import uuid
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
import psycopg


# Env/config
MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "dtp/sensors/room1/temp")
PUBLISH_INTERVAL_SEC = float(os.getenv("PUBLISH_INTERVAL_SEC", "5"))

# Influx
INFLUX_URL = os.getenv("INFLUX_URL", os.getenv("INFLUX_HOST", "http://influx:8086"))
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN")
INFLUX_ORG = os.getenv("INFLUX_ORG", "dtp-org")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "signals")

# Postgres/Timescale
PG_DSN = (
    f"dbname={os.getenv('PGDATABASE','dtp')} "
    f"user={os.getenv('PGUSER','dtp')} "
    f"password={os.getenv('PGPASSWORD','dtpsecret1')} "
    f"host={os.getenv('PGHOST','db')} "
    f"port={os.getenv('PGPORT','5432')}"
)


def ensure_pg_schema():
    # idempotent: ensure the signal exists we will be writing for
    with psycopg.connect(PG_DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(
            """
            create table if not exists signal(
              signal_id uuid primary key,
              name text not null,
              unit text
            );
            """
        )


def on_connect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Connected with result code {rc}")
    client.subscribe("dtp/sensors/#", qos=1)


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        signal_id = payload.get("signal_id") or str(uuid.uuid4())
        value = float(payload.get("value"))
        ts = payload.get("ts") or datetime.now(timezone.utc).isoformat()
        source = payload.get("source", "simulator")

        # Write to Influx
        with InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG) as ic:
            w = ic.write_api(write_options=SYNCHRONOUS)
            p = (
                Point("observation")
                .tag("signal_id", signal_id)
                .field("value", value)
                .time(ts, WritePrecision.NS)
            )
            w.write(bucket=INFLUX_BUCKET, record=p)

        # Write to Timescale/Postgres
        with psycopg.connect(PG_DSN, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute(
                "insert into signal(signal_id,name,unit) values(%s,%s,%s) on conflict do nothing",
                (signal_id, payload.get("name", "temp_room_1"), payload.get("unit", "C")),
            )
            cur.execute(
                """
                insert into observation(signal_id, ts, value_double, source)
                values (%s, %s, %s, %s)
                on conflict do nothing
                """,
                (signal_id, ts, value, source),
            )
        print(f"[INGEST] {signal_id} value={value} ts={ts}")
    except Exception as e:
        print(f"[ERROR] on_message: {e}")


def publisher_loop():
    pub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    pub.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    pub.loop_start()
    signal_id = os.getenv("SIM_SIGNAL_ID", str(uuid.uuid4()))
    i = 0
    while True:
        now = datetime.now(timezone.utc).isoformat()
        value = 20.0 + (i % 10)  # simple ramp
        payload = {
            "signal_id": signal_id,
            "name": os.getenv("SIM_SIGNAL_NAME", "temp_room_1"),
            "unit": os.getenv("SIM_SIGNAL_UNIT", "C"),
            "value": value,
            "ts": now,
            "source": "sim-publisher",
        }
        pub.publish(MQTT_TOPIC, json.dumps(payload), qos=1)
        print(f"[PUBLISH] {MQTT_TOPIC} -> {payload}")
        i += 1
        time.sleep(PUBLISH_INTERVAL_SEC)


def main():
    ensure_pg_schema()

    # Subscriber that ingests to Influx + Timescale
    sub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    sub.on_connect = on_connect
    sub.on_message = on_message
    sub.connect(MQTT_HOST, MQTT_PORT, keepalive=30)

    t_pub = threading.Thread(target=publisher_loop, daemon=True)
    t_pub.start()

    # Blocking loop for subscriber (runs forever)
    sub.loop_forever()


if __name__ == "__main__":
    main()

