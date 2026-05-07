"""Background MQTT listener that caches recent messages per topic.

Connects to BOTH the local platform broker AND any external brokers
declared by registered external twins. Used by the synthesis preview
to show live MQTT payload content.
"""
import json
import os
import re
import threading
import time
from collections import deque

_lock = threading.Lock()
_cache = {}              # topic -> deque of { payload, ts, topic, broker }
_connected_brokers = {}  # "host:port" -> True
MAX_PER_TOPIC = 30
MAX_AGE_SEC = 300


def _on_message(client, userdata, msg):
    topic = msg.topic
    try:
        payload = json.loads(msg.payload.decode("utf-8", errors="replace"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = {"raw": msg.payload.decode("utf-8", errors="replace")[:500]}

    broker_label = userdata or "local"
    with _lock:
        if topic not in _cache:
            _cache[topic] = deque(maxlen=MAX_PER_TOPIC)
        _cache[topic].append({
            "payload": payload, "ts": time.time(),
            "topic": topic, "broker": broker_label,
        })


def _connect_to_broker(host, port, topics, label=None):
    """Connect to a broker in a background thread and subscribe to topics."""
    key = f"{host}:{port}"
    with _lock:
        if key in _connected_brokers:
            return
        _connected_brokers[key] = True

    label = label or key

    def _run():
        try:
            import paho.mqtt.client as mqtt
            client = mqtt.Client(userdata=label)
            client.on_message = _on_message
            client.connect(host, port, keepalive=60)
            for t in topics:
                client.subscribe(t, qos=0)
            print(f"[mqtt_cache] Connected to {key}, subscribed to {topics}")
            client.loop_forever()
        except Exception as e:
            print(f"[mqtt_cache] Failed to connect to {key}: {e}")
            with _lock:
                _connected_brokers.pop(key, None)

    threading.Thread(target=_run, daemon=True).start()


def _ensure_connections():
    """Connect to local broker + all external brokers from registered twins."""
    # Local broker
    local_host = os.getenv("MQTT_BROKER_HOST", "mqtt")
    local_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    _connect_to_broker(local_host, local_port, ["#"], label="local")

    # External brokers from twin registrations
    try:
        # Import inside function to avoid circular imports at module load
        from .models import TwinRegistration
        externals = TwinRegistration.objects.filter(
            mode="external",
            mqtt_broker_host__isnull=False,
        ).exclude(mqtt_broker_host="")

        for reg in externals:
            host = reg.mqtt_broker_host
            port = reg.mqtt_broker_port or 1883
            # Build topic list from registration + fabric
            topics = list(reg.mqtt_topics or [])

            # Also get topics from the Twin's fabric
            from .models import Twin
            twin = Twin.objects.filter(twin_id=reg.resulting_twin_id).first()
            if twin:
                fabric = (twin.interfaces or {}).get("fabric", {})
                for cat_streams in fabric.values():
                    for s in cat_streams:
                        name = s.get("name", "")
                        proto = (s.get("protocol") or "").upper()
                        if name and "MQTT" in proto:
                            topics.append(name)

                # Also from data_streams
                for ds in (twin.interfaces or {}).get("data_streams", []):
                    if ds.startswith("MQTT:"):
                        topics.append(ds.replace("MQTT:", ""))

            # Deduplicate and add wildcard variants
            clean_topics = set()
            for t in topics:
                clean_topics.add(t)
                # If topic has no wildcard, also subscribe to subtopics
                if "#" not in t and "+" not in t:
                    clean_topics.add(t + "/#")

            if clean_topics:
                _connect_to_broker(host, port, list(clean_topics), label=f"{host}:{port}")
    except Exception as e:
        print(f"[mqtt_cache] Error scanning external brokers: {e}")


def get_recent_messages(topic_prefix=None, limit=30):
    """Get recent MQTT messages, optionally filtered by topic prefix."""
    _ensure_connections()
    now = time.time()
    results = []
    with _lock:
        for topic, msgs in _cache.items():
            if topic_prefix and not topic.startswith(topic_prefix):
                continue
            for m in msgs:
                if now - m["ts"] < MAX_AGE_SEC:
                    results.append(m)
    results.sort(key=lambda m: m["ts"])
    return results[-limit:]


def get_messages_for_twin(twin_id, limit=30):
    """Get recent MQTT messages related to a specific twin.

    Matches by: declared fabric topic names, topic slug from twin_id,
    or payload source/twin_id field.
    """
    _ensure_connections()

    # Build matching sets
    # 1) Declared topics from the twin's fabric/data_streams
    declared_topics = set()
    try:
        from .models import Twin
        twin = Twin.objects.filter(twin_id=twin_id).first()
        if twin:
            fabric = (twin.interfaces or {}).get("fabric", {})
            for cat_streams in fabric.values():
                for s in cat_streams:
                    name = s.get("name", "")
                    if name:
                        declared_topics.add(name.lower())
            for ds in (twin.interfaces or {}).get("data_streams", []):
                if ds.startswith("MQTT:"):
                    declared_topics.add(ds.replace("MQTT:", "").lower())
    except Exception:
        pass

    # 2) Slugs from twin_id for fuzzy matching
    raw = twin_id.replace("dt:", "").replace("_001", "").replace("_002", "")
    slugs = set()
    slugs.add(raw.lower())
    slugs.add(raw.replace("_", "/").lower())
    snake = re.sub(r'(?<=[a-z])(?=[A-Z])', '_', raw).lower()
    slugs.add(snake)
    slugs.add(snake.replace("_", "/"))
    slugs = {s for s in slugs if len(s) >= 3}

    now = time.time()
    results = []
    with _lock:
        for topic, msgs in _cache.items():
            topic_lower = topic.lower()
            # Match by declared topic (exact or prefix)
            declared_match = any(
                topic_lower == dt or topic_lower.startswith(dt + "/") or dt.startswith(topic_lower)
                for dt in declared_topics
            )
            # Match by slug
            slug_match = any(s in topic_lower for s in slugs)

            if not declared_match and not slug_match:
                continue

            for m in msgs:
                if now - m["ts"] >= MAX_AGE_SEC:
                    continue
                results.append(m)

    # If declared topics matched nothing, also try payload field matching
    if not results:
        with _lock:
            for topic, msgs in _cache.items():
                for m in msgs:
                    if now - m["ts"] >= MAX_AGE_SEC:
                        continue
                    p = m.get("payload", {})
                    if isinstance(p, dict):
                        src = str(p.get("source", "") or p.get("twin_id", "")).lower()
                        if any(s in src for s in slugs):
                            results.append(m)

    results.sort(key=lambda m: m["ts"])
    return results[-limit:]
