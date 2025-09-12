import os, time, random, json
from datetime import datetime, timezone
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
try:
    import paho.mqtt.client as mqtt  # type: ignore
except Exception:  # fallback if not installed yet; compose will install
    mqtt = None


LOCAL_URL = os.getenv("LOCAL_INFLUX_URL", "http://influx_local:8086")
LOCAL_ORG = os.getenv("LOCAL_ORG", "energy-org")
LOCAL_BUCKET = os.getenv("LOCAL_BUCKET", "energy")
LOCAL_TOKEN = os.getenv("LOCAL_TOKEN", "energy-token-123")

SITE_ID = os.getenv("SITE_ID", "site-a")
RATE_PER_KWH = float(os.getenv("ENERGY_RATE", "0.25"))  # currency per kWh

# MQTT settings (for publishing events as declared in twin.yaml)
MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "dtp/energy_hvac/events")

# Optional central Influx (for portal last-data)
CENTRAL_URL = os.getenv("CENTRAL_INFLUX_URL")
CENTRAL_ORG = os.getenv("CENTRAL_INFLUX_ORG")
CENTRAL_BUCKET = os.getenv("CENTRAL_INFLUX_BUCKET")
CENTRAL_TOKEN = os.getenv("CENTRAL_INFLUX_TOKEN")


def main():
    c = InfluxDBClient(url=LOCAL_URL, token=LOCAL_TOKEN, org=LOCAL_ORG)
    w = c.write_api(write_options=SYNCHRONOUS)
    cw = None
    if CENTRAL_URL and CENTRAL_TOKEN and CENTRAL_ORG and CENTRAL_BUCKET:
        try:
            cc = InfluxDBClient(url=CENTRAL_URL, token=CENTRAL_TOKEN, org=CENTRAL_ORG)
            cw = cc.write_api(write_options=SYNCHRONOUS)
        except Exception as e:
            print(f"[EnergyHVAC] WARN: central Influx connect failed: {e}")
    # Optional MQTT client
    mqtt_client = None
    if mqtt is not None:
        try:
            mqtt_client = mqtt.Client()
            mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
            mqtt_client.loop_start()
        except Exception as e:
            print(f"[EnergyHVAC] WARN: MQTT connect failed: {e}")
    t0 = time.time()
    base_kw = 10.0  # base power
    hvac_state = 'IDLE'
    last_state = hvac_state
    while True:
        t = time.time() - t0
        # simple HVAC load pattern: cycles between IDLE and COOLING/HEATING
        if random.random() < 0.05:
            hvac_state = random.choice(['COOLING','HEATING','IDLE'])

        # power draw varies with state
        if hvac_state == 'COOLING':
            kw = base_kw + 5.0 + random.gauss(0, 0.5)
        elif hvac_state == 'HEATING':
            kw = base_kw + 4.0 + random.gauss(0, 0.5)
        else:
            kw = base_kw + random.gauss(0, 0.3)

        kwh = max(0.0, kw) / 60.0  # approx energy used in this minute-equivalent sample
        cost = kwh * RATE_PER_KWH
        now = datetime.now(timezone.utc)

        p_energy = (
            Point("energy")
            .tag("site", SITE_ID)
            .tag("hvac_state", hvac_state)
            .field("kwh", float(kwh))
            .field("kw", float(kw))
            .field("cost", float(cost))
            .time(now, WritePrecision.NS)
        )
        w.write(bucket=LOCAL_BUCKET, record=p_energy)
        if cw is not None:
            try:
                cw.write(bucket=CENTRAL_BUCKET, record=p_energy)
            except Exception as e:
                print(f"[EnergyHVAC] WARN: central Influx write (energy) failed: {e}")

        # Publish periodic status over MQTT so 'last data' never shows unknown
        if mqtt_client is not None:
            try:
                payload = {
                    "type": "energy_status",
                    "site": SITE_ID,
                    "hvac_state": hvac_state,
                    "kw": float(kw),
                    "kwh": float(kwh),
                    "cost": float(cost),
                    "ts": now.isoformat(),
                    "source": "energy-hvac-twin"
                }
                mqtt_client.publish(MQTT_TOPIC, json.dumps(payload), qos=0)
            except Exception as e:
                print(f"[EnergyHVAC] WARN: MQTT publish (status) failed: {e}")

        # Record and publish an hvac state-change event
        if hvac_state != last_state or random.random() < 0.03:
            ev = Point("hvac_event").tag("site", SITE_ID).field("state", hvac_state).time(now, WritePrecision.NS)
            w.write(bucket=LOCAL_BUCKET, record=ev)
            if cw is not None:
                try:
                    cw.write(bucket=CENTRAL_BUCKET, record=ev)
                except Exception as e:
                    print(f"[EnergyHVAC] WARN: central Influx write (event) failed: {e}")
            if mqtt_client is not None:
                try:
                    event_payload = {
                        "type": "hvac_event",
                        "site": SITE_ID,
                        "state": hvac_state,
                        "ts": now.isoformat(),
                        "source": "energy-hvac-twin"
                    }
                    mqtt_client.publish(MQTT_TOPIC, json.dumps(event_payload), qos=1)
                except Exception as e:
                    print(f"[EnergyHVAC] WARN: MQTT publish (event) failed: {e}")
            last_state = hvac_state

        time.sleep(1)


if __name__ == "__main__":
    main()
