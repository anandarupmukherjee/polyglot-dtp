"""Twin Synthesis API endpoints.

Handles creating, saving, locking, building, downloading, and live-previewing
composite twins assembled in the visual sandbox.
"""
import json
import math
import os
import random
import shutil
import subprocess
import tarfile
import tempfile
import threading
import time as _time
from datetime import datetime, timezone, timedelta
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse, HttpResponse, StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .models import Twin, TwinUI, AccessGrant, TwinSynthesis, PortalEvent
from .registration_views import _sanitize_twin_id, _next_available_port, _register_twin_in_dtr

# ─── Tool definitions ─────────────────────────────────────────────────────────

ANALYSIS_TOOLS = [
    {
        "id": "moving_average",
        "name": "Moving Average",
        "icon": "〰",
        "description": "Smooths data over a configurable time window",
        "config_schema": {"window": {"type": "int", "default": 10, "label": "Window size"}},
        "ports_in": [{"category": "data", "label": "Input"}],
        "ports_out": [{"category": "data", "label": "Smoothed"}],
    },
    {
        "id": "anomaly_detection",
        "name": "Anomaly Detection",
        "icon": "⚠",
        "description": "Flags values exceeding a threshold",
        "config_schema": {"threshold": {"type": "float", "default": 2.0, "label": "Threshold"}},
        "ports_in": [{"category": "data", "label": "Input"}],
        "ports_out": [{"category": "decisions", "label": "Alerts"}],
    },
    {
        "id": "aggregator",
        "name": "Aggregator",
        "icon": "Σ",
        "description": "Computes min/max/avg over a time window",
        "config_schema": {"window_sec": {"type": "int", "default": 60, "label": "Window (sec)"}},
        "ports_in": [{"category": "data", "label": "Input"}],
        "ports_out": [{"category": "data", "label": "Aggregated"}],
    },
    {
        "id": "correlation",
        "name": "Correlation",
        "icon": "⊗",
        "description": "Correlates two data streams",
        "config_schema": {"window": {"type": "int", "default": 30, "label": "Window"}},
        "ports_in": [
            {"category": "data", "label": "Stream A"},
            {"category": "data", "label": "Stream B"},
        ],
        "ports_out": [{"category": "decisions", "label": "Correlation"}],
    },
    {
        "id": "trend_detection",
        "name": "Trend Detection",
        "icon": "↗",
        "description": "Detects upward/downward trends",
        "config_schema": {"sensitivity": {"type": "float", "default": 0.5, "label": "Sensitivity"}},
        "ports_in": [{"category": "data", "label": "Input"}],
        "ports_out": [{"category": "decisions", "label": "Trends"}],
    },
]

VIZ_TOOLS = [
    {
        "id": "timeseries_chart",
        "name": "Time Series Chart",
        "icon": "📈",
        "description": "Line chart over time",
        "ports_in": [{"category": "data", "label": "Series"}],
        "ports_out": [],
    },
    {
        "id": "gauge",
        "name": "Gauge / Meter",
        "icon": "⊙",
        "description": "Real-time gauge display",
        "ports_in": [{"category": "data", "label": "Value"}],
        "ports_out": [],
    },
    {
        "id": "status_dashboard",
        "name": "Status Dashboard",
        "icon": "▦",
        "description": "Multi-twin status overview",
        "ports_in": [{"category": "state", "label": "Status"}],
        "ports_out": [],
    },
    {
        "id": "alert_log",
        "name": "Alert Log",
        "icon": "⚡",
        "description": "Scrolling alert/decision feed",
        "ports_in": [{"category": "decisions", "label": "Alerts"}],
        "ports_out": [],
    },
    {
        "id": "heatmap",
        "name": "Heatmap",
        "icon": "▥",
        "description": "Heatmap of values across twins",
        "ports_in": [{"category": "data", "label": "Values"}],
        "ports_out": [],
    },
]


# ─── API Endpoints ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def synthesis_tools(request):
    """Return available analysis and visualization tool definitions."""
    return JsonResponse({
        "analysis": ANALYSIS_TOOLS,
        "visualization": VIZ_TOOLS,
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def synthesis_list(request):
    """List or create syntheses."""
    if request.method == "GET":
        items = TwinSynthesis.objects.filter(user=request.user).order_by("-updated_at")[:20]
        return JsonResponse([
            {
                "id": str(s.id), "name": s.name, "status": s.status,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
            }
            for s in items
        ], safe=False)

    data = request.data
    name = (data.get("name") or "").strip() or "Untitled Synthesis"
    s = TwinSynthesis.objects.create(
        user=request.user,
        name=name,
        canvas_state=data.get("canvas_state", {}),
    )
    return JsonResponse({"id": str(s.id), "name": s.name, "status": s.status})


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def synthesis_detail(request, synthesis_id):
    """Get, update, or delete a synthesis."""
    try:
        s = TwinSynthesis.objects.get(id=synthesis_id, user=request.user)
    except TwinSynthesis.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if request.method == "GET":
        return JsonResponse({
            "id": str(s.id), "name": s.name, "status": s.status,
            "canvas_state": s.canvas_state,
            "wiring": s.wiring,
            "build_log": s.build_log,
            "resulting_twin_id": s.resulting_twin_id,
        })

    if request.method == "DELETE":
        s.delete()
        return JsonResponse({"ok": True})

    # PATCH
    if s.status == "locked":
        return JsonResponse({"error": "Cannot edit a locked synthesis"}, status=400)
    data = request.data
    if "name" in data:
        s.name = data["name"]
    if "canvas_state" in data:
        s.canvas_state = data["canvas_state"]
    s.save()
    return JsonResponse({"ok": True, "id": str(s.id)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def synthesis_lock(request, synthesis_id):
    """Lock a synthesis — validate connections and prepare for build."""
    try:
        s = TwinSynthesis.objects.get(id=synthesis_id, user=request.user)
    except TwinSynthesis.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    canvas = s.canvas_state or {}
    nodes = canvas.get("nodes", [])
    connections = canvas.get("connections", [])

    if not nodes:
        return JsonResponse({"error": "No nodes in the canvas"}, status=400)

    # Build wiring manifest
    wiring = {"nodes": [], "connections": []}
    for n in nodes:
        wiring["nodes"].append({
            "id": n["id"],
            "type": n["type"],
            "twin_id": n.get("twinId"),
            "tool_id": n.get("toolId"),
            "label": n.get("label", ""),
            "config": n.get("config", {}),
        })
    for c in connections:
        wiring["connections"].append({
            "from": c["fromNodeId"],
            "from_port": c["fromPort"],
            "to": c["toNodeId"],
            "to_port": c["toPort"],
        })

    s.wiring = wiring
    s.status = "locked"
    s.save()
    return JsonResponse({"ok": True, "status": "locked"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def synthesis_build(request, synthesis_id):
    """Build a locked synthesis into a deployable composite DT."""
    try:
        s = TwinSynthesis.objects.get(id=synthesis_id, user=request.user)
    except TwinSynthesis.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if s.status not in ("locked", "failed"):
        return JsonResponse({"error": f"Cannot build from status '{s.status}'"}, status=400)

    s.status = "building"
    s.build_log = None
    s.save()

    threading.Thread(target=_build_synthesis, args=(s,), daemon=True).start()
    return JsonResponse({"ok": True, "status": "building", "id": str(s.id)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def synthesis_status(request, synthesis_id):
    """Poll build status."""
    try:
        s = TwinSynthesis.objects.get(id=synthesis_id, user=request.user)
    except TwinSynthesis.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)
    return JsonResponse({
        "id": str(s.id), "status": s.status,
        "build_log": s.build_log,
        "resulting_twin_id": s.resulting_twin_id,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def synthesis_download(request, synthesis_id):
    """Download the generated composite DT package as .tar.gz."""
    try:
        s = TwinSynthesis.objects.get(id=synthesis_id, user=request.user)
    except TwinSynthesis.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if s.status != "ready":
        return JsonResponse({"error": "Build not ready"}, status=400)

    dest = Path(settings.MEDIA_ROOT) / "synthesis" / str(s.id)
    if not dest.exists():
        return JsonResponse({"error": "Build artifacts not found"}, status=404)

    buf = BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        tar.add(str(dest), arcname=f"synthesis_{s.name.replace(' ', '_')}")
    buf.seek(0)

    resp = HttpResponse(buf.read(), content_type="application/gzip")
    resp["Content-Disposition"] = f'attachment; filename="synthesis_{s.name.replace(" ", "_")}.tar.gz"'
    return resp


# ─── Build Logic ──────────────────────────────────────────────────────────────

def _build_synthesis(s):
    """Generate compose, build, and deploy a composite twin. Runs in background thread."""
    try:
        wiring = s.wiring or {}
        nodes = wiring.get("nodes", [])
        connections = wiring.get("connections", [])

        dest = Path(settings.MEDIA_ROOT) / "synthesis" / str(s.id)
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)

        slug = _sanitize_twin_id(s.name).replace("dt:", "").lower()
        assigned_port = _next_available_port()
        influx_org = os.getenv("INFLUX_ORG", "dtp-org")
        influx_bucket = os.getenv("INFLUX_BUCKET", "signals")
        influx_token = os.getenv("INFLUX_TOKEN", "")

        # Build the compose services
        services = []
        for node in nodes:
            if node["type"] == "analysis":
                tool_id = node.get("tool_id", "")
                node_id = node["id"]
                # Find input connections
                inputs = [c for c in connections if c["to"] == node_id]
                input_topics = []
                for inp in inputs:
                    src = next((n for n in nodes if n["id"] == inp["from"]), None)
                    if src and src["type"] == "twin":
                        input_topics.append(f"dtp/{src.get('twin_id', 'unknown').replace(':', '_')}/+")
                    elif src:
                        input_topics.append(f"dtp/synthesis/{s.id}/{src['id']}/output")
                output_topic = f"dtp/synthesis/{s.id}/{node_id}/output"

                config = node.get("config", {})
                services.append({
                    "name": f"analysis_{node_id}",
                    "tool_id": tool_id,
                    "input_topics": input_topics,
                    "output_topic": output_topic,
                    "config": config,
                })

        # Generate compose.yaml
        compose_lines = [f"# Composite twin: {s.name}", "services:"]
        for svc in services:
            env_lines = [
                f'      INPUT_TOPICS: "{",".join(svc["input_topics"])}"',
                f'      OUTPUT_TOPIC: "{svc["output_topic"]}"',
                f'      MQTT_BROKER_HOST: mqtt',
                f'      MQTT_BROKER_PORT: "1883"',
                f'      TOOL_ID: "{svc["tool_id"]}"',
                f'      CONFIG: \'{json.dumps(svc["config"])}\'',
            ]
            compose_lines.extend([
                f"  {svc['name']}:",
                f"    image: python:3.11-slim",
                f'    command: ["bash", "-lc", "pip install --no-cache-dir paho-mqtt && python /app/analysis_runner.py"]',
                f"    volumes:",
                f"      - ./analysis_runner.py:/app/analysis_runner.py:ro",
                f"    environment:",
                *env_lines,
                f"    networks: [synth_net, main_net]",
                "",
            ])

        compose_lines.extend([
            "networks:",
            "  synth_net: {}",
            "  main_net:",
            "    external: true",
            "    name: polyglotdtp_default",
            "",
        ])
        (dest / "compose.yaml").write_text("\n".join(compose_lines))

        # Generate analysis runner script
        runner = '''"""Generic analysis runner — reads config from env and processes MQTT streams."""
import os, json, time
import paho.mqtt.client as mqtt

TOOL_ID = os.getenv("TOOL_ID", "")
INPUT_TOPICS = os.getenv("INPUT_TOPICS", "").split(",")
OUTPUT_TOPIC = os.getenv("OUTPUT_TOPIC", "")
CONFIG = json.loads(os.getenv("CONFIG", "{}"))
BROKER = os.getenv("MQTT_BROKER_HOST", "mqtt")
PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))

buffer = []

def on_message(client, userdata, msg):
    global buffer
    try:
        data = json.loads(msg.payload)
    except:
        return
    buffer.append(data)
    window = CONFIG.get("window", CONFIG.get("window_sec", 10))
    if len(buffer) > window:
        buffer = buffer[-window:]

    result = {}
    if TOOL_ID == "moving_average":
        vals = [d.get("value", 0) for d in buffer if "value" in d]
        result = {"value": sum(vals)/len(vals) if vals else 0, "type": "moving_average"}
    elif TOOL_ID == "anomaly_detection":
        threshold = CONFIG.get("threshold", 2.0)
        val = data.get("value", 0)
        if abs(val) > threshold:
            result = {"alert": True, "value": val, "threshold": threshold, "type": "anomaly"}
    elif TOOL_ID == "aggregator":
        vals = [d.get("value", 0) for d in buffer if "value" in d]
        result = {"min": min(vals) if vals else 0, "max": max(vals) if vals else 0, "avg": sum(vals)/len(vals) if vals else 0, "type": "aggregated"}
    elif TOOL_ID == "trend_detection":
        vals = [d.get("value", 0) for d in buffer if "value" in d]
        if len(vals) >= 3:
            trend = "up" if vals[-1] > vals[0] else "down" if vals[-1] < vals[0] else "flat"
            result = {"trend": trend, "delta": vals[-1] - vals[0], "type": "trend"}
    elif TOOL_ID == "correlation":
        result = {"type": "correlation", "count": len(buffer)}

    if result:
        result["ts"] = data.get("ts", "")
        client.publish(OUTPUT_TOPIC, json.dumps(result))

client = mqtt.Client()
client.on_message = on_message
client.connect(BROKER, PORT)
for t in INPUT_TOPICS:
    if t.strip():
        client.subscribe(t.strip())
client.loop_forever()
'''
        (dest / "analysis_runner.py").write_text(runner)

        # Generate wiring.json
        (dest / "wiring.json").write_text(json.dumps(wiring, indent=2))

        # Generate twin.yaml
        twin_id = _sanitize_twin_id(s.name)
        twin_yaml = f'''"@id": {twin_id}
name: "{s.name}"
tenant: demo
metadata:
  domain: [Composite]
  status: instantiated
  synthesis_id: "{s.id}"
interfaces:
  api: http://localhost:{assigned_port}
  data_streams: []
dependencies:
  static: []
  dynamic: []
'''
        (dest / "twin.yaml").write_text(twin_yaml)

        s.status_detail = "Package generated. Building..."
        s.save()

        # Build if there are services
        if services:
            compose_path = str(dest / "compose.yaml")
            build_result = subprocess.run(
                ["docker", "compose", "-f", compose_path, "build"],
                capture_output=True, text=True, timeout=300,
            )
            log = f"=== BUILD ===\n{build_result.stdout[-2000:]}\n{build_result.stderr[-1000:]}"

            if build_result.returncode != 0:
                s.status = "failed"
                s.build_log = log
                s.save()
                return

            up_result = subprocess.run(
                ["docker", "compose", "-f", compose_path, "up", "-d"],
                capture_output=True, text=True, timeout=120,
            )
            log += f"\n=== UP ===\n{up_result.stdout[-1000:]}\n{up_result.stderr[-500:]}"

            if up_result.returncode != 0:
                s.status = "failed"
                s.build_log = log
                s.save()
                return

            s.build_log = log
        else:
            s.build_log = "No analysis services to build (visualization-only synthesis)"

        # Register composite twin in DTR
        metadata = {"name": s.name, "domain": ["Composite"], "status": "instantiated"}
        interfaces = {"api": f"http://localhost:{assigned_port}", "data_streams": []}
        try:
            _register_twin_in_dtr(twin_id, "demo", metadata, interfaces)
            ui = TwinUI.objects.filter(dtr_id=twin_id).first()
            if ui:
                AccessGrant.objects.get_or_create(user=s.user, twin=ui)
        except Exception:
            pass

        s.status = "ready"
        s.resulting_twin_id = twin_id
        s.save()

    except Exception as e:
        s.status = "failed"
        s.build_log = f"ERROR: {e}"
        s.save()


# ─── Live Preview ─────────────────────────────────────────────────────────────

def _summarize_twin_data(data):
    """Build a human-friendly summary from twin data points."""
    if not data:
        return {"points": 0}
    latest = data[-1]
    summary = {"points": len(data)}

    # Show actual payload fields (skip meta keys)
    skip = {"time", "ts", "topic", "measurement", "tags", "error", "raw_value", "field", "signal_id"}
    fields = {}
    for k, v in latest.items():
        if k in skip or k.startswith("_"):
            continue
        if v is not None and v != "":
            if isinstance(v, float):
                fields[k] = round(v, 2)
            elif isinstance(v, str) and len(v) > 80:
                fields[k] = v[:80] + "..."
            else:
                fields[k] = v
    summary.update(fields)
    return summary


def _query_influx_recent(twin_id, minutes=5):
    """Query central InfluxDB for recent data — ALL fields, grouped into events."""
    influx_url = os.getenv("INFLUX_URL", "http://influx:8086")
    influx_org = os.getenv("INFLUX_ORG", "dtp-org")
    influx_token = os.getenv("INFLUX_TOKEN", "")
    influx_bucket = os.getenv("INFLUX_BUCKET", "signals")
    if not influx_token:
        return []
    try:
        from influxdb_client import InfluxDBClient
        client = InfluxDBClient(url=influx_url, token=influx_token, org=influx_org)
        # Query ALL fields (not just "value") to capture message, status, etc.
        query = f'''
            from(bucket: "{influx_bucket}")
            |> range(start: -{minutes}m)
            |> filter(fn: (r) => r._measurement != "")
            |> tail(n: 100)
        '''
        tables = client.query_api().query(query, org=influx_org)

        # Collect raw records
        raw = []
        for table in tables:
            for record in table.records:
                raw.append({
                    "measurement": record.get_measurement(),
                    "field": record.get_field(),
                    "raw_value": record.get_value(),
                    "time": record.get_time().isoformat() if record.get_time() else None,
                    "tags": {k: v for k, v in record.values.items()
                             if not k.startswith("_") and k not in ("result", "table")},
                })
        client.close()

        # Group by (measurement, time) to merge fields into rich event objects
        events = {}
        for r in raw:
            key = (r["measurement"], r["time"])
            if key not in events:
                events[key] = {
                    "measurement": r["measurement"],
                    "time": r["time"],
                    "tags": r["tags"],
                    "fields": {},
                }
            events[key]["fields"][r["field"]] = r["raw_value"]

        # Flatten into a list, sorted by time, with convenience keys
        points = []
        for ev in sorted(events.values(), key=lambda e: e["time"] or ""):
            point = {
                "measurement": ev["measurement"],
                "time": ev["time"],
                **ev["tags"],
                **ev["fields"],  # every field becomes a top-level key
            }
            # Also set a "value" key from the most likely numeric field
            for vf in ("value", "rms", "value_double", "kw", "kwh", "cost"):
                if vf in ev["fields"] and isinstance(ev["fields"][vf], (int, float)):
                    point["value"] = ev["fields"][vf]
                    break
            points.append(point)

        return points[-30:]  # cap to last 30 events
    except Exception as e:
        return [{"error": str(e)}]


def _run_analysis_preview(tool_id, config, input_data):
    """Run an analysis tool's logic on input data and return results."""
    results = []
    if not input_data:
        return results

    values = [d.get("value") for d in input_data if d.get("value") is not None]
    if not values:
        return [{"type": tool_id, "info": "no numeric values in input"}]

    if tool_id == "moving_average":
        window = config.get("window", 10)
        window = min(window, len(values))
        avg = sum(values[-window:]) / window if window > 0 else 0
        results.append({"type": "moving_average", "value": round(avg, 3), "window": window, "samples": len(values)})

    elif tool_id == "anomaly_detection":
        threshold = config.get("threshold", 2.0)
        anomalies = [v for v in values if abs(v) > threshold]
        results.append({
            "type": "anomaly_detection", "anomalies": len(anomalies),
            "total": len(values), "threshold": threshold,
            "latest": values[-1] if values else None,
            "alert": abs(values[-1]) > threshold if values else False,
        })

    elif tool_id == "aggregator":
        results.append({
            "type": "aggregated",
            "min": round(min(values), 3), "max": round(max(values), 3),
            "avg": round(sum(values) / len(values), 3), "count": len(values),
        })

    elif tool_id == "correlation":
        # Simple auto-correlation of the single stream
        n = len(values)
        if n >= 2:
            mean = sum(values) / n
            var = sum((v - mean) ** 2 for v in values) / n
            if var > 0:
                lag1 = sum((values[i] - mean) * (values[i - 1] - mean) for i in range(1, n)) / (n * var)
                results.append({"type": "correlation", "lag1_autocorr": round(lag1, 3), "samples": n})
            else:
                results.append({"type": "correlation", "lag1_autocorr": 0, "samples": n, "note": "zero variance"})
        else:
            results.append({"type": "correlation", "note": "insufficient data"})

    elif tool_id == "trend_detection":
        if len(values) >= 2:
            delta = values[-1] - values[0]
            trend = "up" if delta > config.get("sensitivity", 0.5) else "down" if delta < -config.get("sensitivity", 0.5) else "flat"
            results.append({"type": "trend", "trend": trend, "delta": round(delta, 3), "first": round(values[0], 3), "last": round(values[-1], 3)})
        else:
            results.append({"type": "trend", "trend": "unknown", "note": "insufficient data"})

    return results


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def synthesis_preview(request):
    """Run a live preview of the canvas wiring.

    Takes the current canvas state, queries InfluxDB for each twin node's
    recent data, runs analysis tools, and returns results keyed by node ID.
    """
    canvas = request.data
    nodes = canvas.get("nodes", [])
    connections = canvas.get("connections", [])

    if not nodes:
        return JsonResponse({"node_data": {}})

    # Build adjacency: for each node, what feeds into it
    inputs_for = {}  # nodeId -> [{ fromNodeId, fromPort }]
    for c in connections:
        inputs_for.setdefault(c["toNodeId"], []).append(c)

    # Phase 1: Fetch data for twin nodes — prefer MQTT live data, fallback to InfluxDB
    from .mqtt_cache import get_messages_for_twin

    node_data = {}  # nodeId -> { data: [...], output: [...], type, label }
    for n in nodes:
        if n["type"] == "twin":
            twin_id = n.get("twinId", "")

            # Look up the twin in registry
            twin_reg = Twin.objects.filter(twin_id=twin_id).first()

            # Get live MQTT data — cache handles both local and external brokers
            is_process = False
            mqtt_msgs = get_messages_for_twin(twin_id, limit=30)

            if mqtt_msgs:
                data = []
                for m in mqtt_msgs:
                    p = m.get("payload", {})
                    if isinstance(p, dict):
                        point = {**p, "topic": m.get("topic", ""), "time": p.get("ts", "")}
                        if "value" not in point:
                            for vf in ("rms", "kw", "kwh", "cost", "temperature", "humidity", "temp"):
                                if vf in point and isinstance(point[vf], (int, float)):
                                    point["value"] = point[vf]
                                    break
                        data.append(point)
                    else:
                        data.append({"raw": str(p), "topic": m.get("topic", ""), "time": ""})
            else:
                # Check if this is a process twin — use sim results instead of InfluxDB
                if twin_reg:
                    md = twin_reg.metadata or {}
                    if md.get("process_id"):
                        is_process = True
                        from .models import ProcessModel
                        try:
                            proc = ProcessModel.objects.get(id=md["process_id"])
                            sim = proc.sim_results or {}
                            summary = sim.get("summary", {})
                            proc_nodes = (proc.canvas_state or {}).get("nodes", [])
                            proc_conns = (proc.canvas_state or {}).get("connections", [])
                            events = sim.get("events", [])

                            # Build data per Data Out port — each gets events from its source
                            fabric = (twin_reg.interfaces or {}).get("fabric", {})
                            data = []
                            for cat, streams in fabric.items():
                                for si, stream in enumerate(streams):
                                    port_tag = f"{cat}_{si}"
                                    src_labels = stream.get("source_labels", [])
                                    # Resolve source labels to node names
                                    src_names = []
                                    for src_id in src_labels:
                                        src_n = next((nd for nd in proc_nodes if nd.get("id") == src_id), None)
                                        if src_n:
                                            src_names.append(src_n.get("label", src_id))

                                    if src_names:
                                        # Filter events to those at or passing through the source nodes
                                        port_events = [ev for ev in events if ev.get("node") in src_names]
                                        for ev in port_events[-10:]:
                                            data.append({**ev, "_port": port_tag, "_stream": stream.get("name", "")})
                                    else:
                                        # No specific source — add general summary tagged to this port
                                        data.append({"type": "process_kpi", "metric": "throughput", "value": summary.get("throughput", 0), "_port": port_tag, "_stream": stream.get("name", ""), "time": ""})

                            # Also add general KPIs
                            data.append({"type": "process_kpi", "metric": "throughput", "value": summary.get("throughput", 0), "time": ""})
                            data.append({"type": "process_kpi", "metric": "avg_cycle_time", "value": summary.get("avg_time_in_system", 0), "time": ""})
                            data.append({"type": "process_status", "status": proc.status, "name": proc.name, "time": ""})
                            for srv_id, util in summary.get("server_utilization", {}).items():
                                srv_label = next((nd.get("label", srv_id) for nd in proc_nodes if nd.get("id") == srv_id), srv_id)
                                data.append({"type": "utilization", "server": srv_label, "value": util, "time": ""})
                        except ProcessModel.DoesNotExist:
                            data = [{"type": "process_status", "status": "not found", "time": ""}]

                if not is_process:
                    # Regular twin — try InfluxDB
                    data = _query_influx_recent(twin_id, minutes=5)

            node_data[n["id"]] = {
                "type": "twin", "label": n.get("label", ""),
                "source": "mqtt" if mqtt_msgs else ("process" if is_process else "influx"),
                "data": data, "output": data,
                "summary": _summarize_twin_data(data),
            }

    # Phase 1.5: Fetch data for sensor nodes (they are sources, not downstream)
    for n in nodes:
        if n.get("type") == "service" and n.get("toolId") == "sensor":
            config = n.get("config", {})
            protocol = config.get("protocol", "MQTT")
            topic = config.get("topic", "")
            data = []

            if protocol == "MQTT" and topic:
                # Get messages from MQTT cache matching this topic
                from .mqtt_cache import get_recent_messages
                broker = config.get("broker", "")
                all_msgs = get_recent_messages(limit=200)
                topic_lower = topic.lower()
                for m in all_msgs:
                    if topic_lower in m.get("topic", "").lower():
                        p = m.get("payload", {})
                        if isinstance(p, dict):
                            point = {**p, "topic": m["topic"], "time": p.get("ts", "")}
                            if "value" not in point:
                                for vf in ("rms", "kw", "temperature", "humidity", "temp", "value"):
                                    if vf in point and isinstance(point[vf], (int, float)):
                                        point["value"] = point[vf]
                                        break
                            data.append(point)
                data = data[-30:]

            elif protocol == "API" and topic:
                # Fetch from API endpoint
                try:
                    import requests
                    method = config.get("method", "GET").upper()
                    headers = {}
                    if config.get("auth_header"):
                        headers["Authorization"] = config["auth_header"]
                    resp = requests.request(method, topic, headers=headers, timeout=5)
                    if resp.ok:
                        try:
                            payload = resp.json()
                            if isinstance(payload, list):
                                data = payload[-30:]
                            elif isinstance(payload, dict):
                                data = [payload]
                        except Exception:
                            data = [{"raw": resp.text[:500], "time": ""}]
                except Exception as e:
                    data = [{"error": str(e), "time": ""}]

            node_data[n["id"]] = {
                "type": "service", "label": n.get("label", ""),
                "source": protocol.lower(),
                "data": data, "output": data,
                "summary": _summarize_twin_data(data) if data else {"info": f"No data from {protocol} {topic or '(no topic)'}"},
            }

    # Phase 1.6: Fetch data for vision sensor nodes
    for n in nodes:
        if n.get("type") == "service" and n.get("toolId") == "vision_sensor":
            config = n.get("config", {})
            stream_url = config.get("stream_url", "")
            stream_type = config.get("stream_type", "snapshot")
            data = []

            if stream_url and stream_type == "snapshot":
                try:
                    import requests as req
                    import base64
                    resp = req.get(stream_url, timeout=5, stream=False)
                    if resp.ok:
                        ct = resp.headers.get("content-type", "")
                        if "image" in ct:
                            b64 = base64.b64encode(resp.content).decode()
                            data = [{
                                "type": "frame", "format": ct,
                                "frame_b64": b64[:100] + "..." if len(b64) > 100 else b64,
                                "frame_size": len(resp.content),
                                "frame_url": stream_url,
                                "time": datetime.now(timezone.utc).isoformat(),
                            }]
                        else:
                            # Might be JSON metadata
                            try:
                                data = [resp.json()]
                            except Exception:
                                data = [{"raw": resp.text[:200], "time": ""}]
                except Exception as e:
                    data = [{"error": str(e), "time": ""}]
            elif stream_url:
                data = [{"type": "stream", "stream_type": stream_type, "url": stream_url, "status": "configured"}]

            # Also check MQTT metadata topic
            mqtt_topic = config.get("mqtt_meta_topic", "")
            if mqtt_topic:
                from .mqtt_cache import get_recent_messages
                all_msgs = get_recent_messages(limit=100)
                topic_lower = mqtt_topic.lower()
                for m in all_msgs:
                    if topic_lower in m.get("topic", "").lower():
                        p = m.get("payload", {})
                        if isinstance(p, dict):
                            data.append({**p, "topic": m["topic"], "time": p.get("ts", "")})

            node_data[n["id"]] = {
                "type": "service", "label": n.get("label", ""),
                "source": "camera",
                "data": data, "output": data,
                "summary": {
                    "stream_type": stream_type,
                    "url": stream_url or "(not configured)",
                    "frames": len([d for d in data if d.get("type") == "frame"]),
                    "metadata_events": len([d for d in data if d.get("topic")]),
                } if data else {"info": "No stream URL configured"},
            }

    # Phase 2: Process analysis nodes (topological order — simple single-pass since chains are short)
    max_passes = 5
    for _ in range(max_passes):
        progress = False
        for n in nodes:
            if n["id"] in node_data:
                continue
            if n["type"] in ("analysis", "visualization", "transform", "service", "database"):
                # Gather input data from connected sources
                input_conns = inputs_for.get(n["id"], [])
                all_inputs_ready = all(c["fromNodeId"] in node_data for c in input_conns)
                if not all_inputs_ready and input_conns:
                    continue

                # Merge input data from all sources, filtered by port→topic
                merged_data = []
                for c in input_conns:
                    src_node_id = c["fromNodeId"]
                    src_port = c.get("fromPort", "")  # e.g., "state_0"
                    src = node_data.get(src_node_id, {})
                    src_output = src.get("output", [])

                    # If source is a twin with fabric, filter to the specific stream
                    src_node_def = next((nd for nd in nodes if nd["id"] == src_node_id), None)
                    if src_node_def and src_node_def.get("type") == "twin" and "_" in src_port:
                        cat, idx_str = src_port.rsplit("_", 1)
                        try:
                            idx = int(idx_str)
                        except ValueError:
                            idx = 0
                        fabric = src_node_def.get("activeFabric", {})
                        streams = fabric.get(cat, [])
                        if idx < len(streams):
                            stream_name = streams[idx].get("name", "")
                            if stream_name:
                                port_id = f"{cat}_{idx}"
                                # Filter by _port tag (for process twins) or by topic (for MQTT twins)
                                filtered = [d for d in src_output
                                            if d.get("_port") == port_id
                                            or stream_name.lower() in (d.get("topic", "")).lower()]
                                merged_data.extend(filtered if filtered else src_output)
                                continue
                    merged_data.extend(src_output)

                if n["type"] == "transform":
                    tool_id = n.get("toolId", "")
                    config = n.get("config", {})
                    output = _run_transform_preview(tool_id, config, merged_data)
                    node_data[n["id"]] = {
                        "type": "transform", "label": n.get("label", ""),
                        "tool": tool_id,
                        "data": merged_data,  # raw input for field discovery
                        "input_count": len(merged_data),
                        "output": output,
                        "summary": output[0] if output else {"info": "no output"},
                    }
                elif n["type"] in ("service", "database"):
                    # Pass-through: these nodes forward data
                    node_data[n["id"]] = {
                        "type": n["type"], "label": n.get("label", ""),
                        "data": merged_data,
                        "input_count": len(merged_data),
                        "output": merged_data,
                        "summary": _summarize_twin_data(merged_data) if merged_data else {"info": "no data"},
                    }
                elif n["type"] == "analysis":
                    tool_id = n.get("toolId", "")
                    config = n.get("config", {})
                    output = _run_analysis_preview(tool_id, config, merged_data)
                    node_data[n["id"]] = {
                        "type": "analysis", "label": n.get("label", ""),
                        "tool": tool_id,
                        "data": merged_data,
                        "input_count": len(merged_data),
                        "output": output,
                        "summary": output[0] if output else {"info": "no output"},
                    }
                elif n["type"] == "visualization":
                    tool_id = n.get("toolId", "")
                    # Viz nodes consume data — prepare display-ready output
                    viz_data = _format_viz_data(tool_id, merged_data)
                    node_data[n["id"]] = {
                        "type": "visualization", "label": n.get("label", ""),
                        "tool": tool_id,
                        "input_count": len(merged_data),
                        "output": [],
                        "viz": viz_data,
                        "summary": viz_data.get("summary", {}),
                    }
                progress = True
        if not progress:
            break

    return JsonResponse({"node_data": node_data})


def _run_transform_preview(tool_id, config, input_data):
    """Run a data transform on input data and return transformed results."""
    if not input_data:
        return []

    results = []
    if tool_id == "transform_text_to_int":
        field = config.get("field", "")
        mappings = {m["text"]: m["value"] for m in config.get("mappings", []) if m.get("text")}
        if not field or not mappings:
            # Pass through with field info for discovery
            return input_data
        for d in input_data:
            out = dict(d)
            raw_val = d.get(field, "")
            # Try matching as-is, then as string, then lowercase
            val_variants = [raw_val, str(raw_val), str(raw_val).lower()]
            matched = False
            for v in val_variants:
                if v in mappings:
                    out[field] = mappings[v]
                    out["_mapped"] = True
                    out["value"] = mappings[v]
                    matched = True
                    break
            results.append(out)

    elif tool_id == "transform_json_extract":
        fields = config.get("fields", [])
        if not fields and config.get("path"):
            fields = [f.strip() for f in config["path"].split(",") if f.strip()]
        if not fields:
            return input_data
        for d in input_data:
            out = {}
            for f in fields:
                if f in d:
                    out[f] = d[f]
            if "time" in d:
                out["time"] = d["time"]
            if "ts" in d:
                out["ts"] = d["ts"]
            if out:
                results.append(out)

    elif tool_id == "transform_scale":
        field = config.get("field", "value")
        mult = config.get("multiply", 1)
        offset = config.get("offset", 0)
        for d in input_data:
            out = dict(d)
            v = d.get(field)
            if isinstance(v, (int, float)):
                out[field] = v * mult + offset
                out["value"] = out[field]
            results.append(out)

    elif tool_id == "transform_filter":
        field = config.get("field", "value")
        op = config.get("operator", ">")
        threshold = config.get("threshold", 0)
        for d in input_data:
            v = d.get(field)
            if v is None:
                continue
            try:
                v = float(v) if not isinstance(v, (int, float)) else v
            except (ValueError, TypeError):
                continue
            passes = (
                (op == ">" and v > threshold) or
                (op == "<" and v < threshold) or
                (op == "==" and v == threshold) or
                (op == "!=" and v != threshold)
            )
            if passes:
                results.append(d)

    return results if results else input_data


def _format_viz_data(tool_id, data):
    """Format rich event data for visualization node display.

    Each data item is a dict with measurement, time, tags, and all fields
    as top-level keys (e.g., value, message, status, rms, source, etc.)
    """
    # Extract numeric values for charting
    values = [d.get("value") for d in data if isinstance(d.get("value"), (int, float))]

    # Detect the most meaningful text field for display
    def _text_repr(d):
        """Build a human-readable text from a data event."""
        # Prefer explicit message/status fields
        for key in ("message", "status", "state", "alert", "type", "trend", "source"):
            v = d.get(key)
            if v and isinstance(v, str) and v not in ("observation", "telemetry"):
                return v
        # Show all non-meta fields as key=value pairs
        skip = {"measurement", "time", "value", "tags", "error", "field", "raw_value"}
        parts = []
        for k, v in d.items():
            if k in skip or k.startswith("_"):
                continue
            if isinstance(v, str) and len(v) > 50:
                continue
            if v is not None:
                fv = f"{v:.1f}" if isinstance(v, float) else str(v)
                parts.append(f"{k}={fv}")
        return ", ".join(parts[:4]) if parts else d.get("measurement", "data")

    if tool_id == "timeseries_chart":
        # Chart numeric values with field context
        points = []
        field_name = None
        for d in data[-25:]:
            v = d.get("value")
            if isinstance(v, (int, float)):
                points.append({
                    "v": round(v, 2) if isinstance(v, float) else v,
                    "t": d.get("time", ""),
                    "label": _text_repr(d),
                })
                if not field_name:
                    # Find which field "value" came from
                    for fn in ("rms", "kw", "kwh", "cost", "temperature", "humidity"):
                        if fn in d:
                            field_name = fn
                            break
        return {
            "chart_type": "timeseries",
            "field_name": field_name or "value",
            "points": points,
            "summary": {
                "count": len(points),
                "latest": points[-1]["v"] if points else None,
                "field": field_name or "value",
            },
        }

    elif tool_id == "gauge":
        latest = values[-1] if values else 0
        field_name = None
        for fn in ("rms", "kw", "temperature", "humidity", "value"):
            if data and fn in data[-1]:
                field_name = fn
                break
        return {
            "chart_type": "gauge",
            "field_name": field_name or "value",
            "value": round(latest, 2) if isinstance(latest, float) else latest,
            "min": round(min(values), 2) if values else 0,
            "max": round(max(values), 2) if values else 0,
            "summary": {
                "value": round(latest, 2) if isinstance(latest, float) else latest,
                "field": field_name or "value",
            },
        }

    elif tool_id == "status_dashboard":
        # Show the actual payload content — all meaningful fields from each event
        skip_keys = {"measurement", "time", "ts", "topic", "tags", "error",
                     "field", "raw_value", "signal_id", "value", "type"}
        entries = []
        for d in data[-8:]:
            ts = d.get("time") or d.get("ts", "")
            if isinstance(ts, (int, float)) and ts > 1_000_000_000:
                try:
                    ts_short = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%H:%M:%S")
                except Exception:
                    ts_short = str(ts)
            else:
                ts = str(ts) if not isinstance(ts, str) else ts
                ts_short = ts[11:19] if len(ts) > 19 else ts

            # Build display from all non-meta fields
            parts = []
            # First: explicit message or status field if present
            for key in ("message", "status", "state", "alert"):
                v = d.get(key)
                if v and isinstance(v, str):
                    parts.append(v)
                    break

            # Then: all other payload fields as key=value
            if not parts:
                for k, v in d.items():
                    if k in skip_keys or k.startswith("_"):
                        continue
                    if v is None or v == "":
                        continue
                    if isinstance(v, float):
                        parts.append(f"{k}: {v:.2f}")
                    elif isinstance(v, str) and len(v) > 60:
                        continue
                    else:
                        parts.append(f"{k}: {v}")

            text = " | ".join(parts[:5]) if parts else d.get("type") or d.get("measurement", "no data")
            entries.append({"text": text, "time": ts_short})
        return {
            "chart_type": "status",
            "entries": entries[-5:],
            "summary": {
                "latest": entries[-1]["text"] if entries else "no data",
                "count": len(entries),
            },
        }

    elif tool_id == "alert_log":
        # Show events with their actual message/payload content
        skip_keys = {"measurement", "time", "ts", "topic", "tags", "error",
                     "field", "raw_value", "signal_id"}
        alerts = []
        for d in data[-15:]:
            # Build message from payload fields
            msg = d.get("message") or d.get("alert") or d.get("status")
            if not msg:
                # Build from all fields
                parts = []
                for k, v in d.items():
                    if k in skip_keys or k.startswith("_") or k == "type":
                        continue
                    if v is None or v == "":
                        continue
                    if isinstance(v, float):
                        parts.append(f"{k}: {v:.2f}")
                    elif isinstance(v, str) and len(v) > 60:
                        continue
                    else:
                        parts.append(f"{k}: {v}")
                msg = " | ".join(parts[:4])
            if not msg:
                continue

            v = d.get("value")
            ts = d.get("time") or d.get("ts", "")
            if isinstance(ts, (int, float)) and ts > 1_000_000_000:
                try:
                    ts_short = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%H:%M:%S")
                except Exception:
                    ts_short = str(ts)
            else:
                ts = str(ts) if not isinstance(ts, str) else ts
                ts_short = ts[11:19] if len(ts) > 19 else ts
            alerts.append({
                "message": msg if isinstance(msg, str) else str(msg),
                "value": round(v, 2) if isinstance(v, float) else v,
                "time": ts_short,
                "type": d.get("type") or d.get("measurement", "event"),
            })
        return {
            "chart_type": "alerts",
            "alerts": alerts[-5:],
            "summary": {
                "count": len(alerts),
                "latest": alerts[-1]["message"] if alerts else "none",
            },
        }

    elif tool_id == "heatmap":
        return {
            "chart_type": "heatmap",
            "values": [round(v, 1) if isinstance(v, float) else v for v in values[-20:]],
            "summary": {"cells": len(values[-20:])},
        }

    elif tool_id == "camera_view":
        # Find the camera frame URL from upstream data
        frame_url = ""
        stream_type = "snapshot"
        for d in data:
            if d.get("frame_url"):
                frame_url = d["frame_url"]
            elif d.get("stream_url"):
                frame_url = d["stream_url"]
            elif d.get("url"):
                frame_url = d["url"]
            if d.get("stream_type"):
                stream_type = d["stream_type"]
        return {
            "chart_type": "camera",
            "frame_url": frame_url,
            "stream_type": stream_type,
            "summary": {"url": frame_url or "no source", "type": stream_type},
        }

    return {"chart_type": "unknown", "summary": {}}
