"""Twin Registration API endpoints.

Handles two modes:
  A) Platform-Hosted  – user uploads files or provides a GitHub URL
  B) External         – user's twin runs elsewhere; platform registers the pointer
"""
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
import tarfile
import uuid
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse, HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .models import (
    Twin, TwinUI, AccessGrant, PortalEvent, TwinRegistration,
)

TWINS_DIR = Path("/app/twins")
ALLOWED_EXTENSIONS = {
    ".py", ".yaml", ".yml", ".json", ".html", ".css", ".js",
    ".txt", ".md", ".sh", ".toml", ".cfg", ".conf", ".ini",
    ".jinja", ".jinja2", ".j2", ".env", ".Dockerfile",
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _sanitize_twin_id(name):
    slug = re.sub(r"[^a-zA-Z0-9_]", "", name.replace(" ", "_").replace("-", "_"))
    return f"dt:{slug}_001"


def _validate_twin_id(twin_id, user=None):
    """Check twin ID uniqueness. Allow overwrite if it's from the same user's failed registration."""
    if not Twin.objects.filter(twin_id=twin_id).exists():
        return None
    # Allow if the user has a failed/building registration for this same twin
    if user:
        prev = TwinRegistration.objects.filter(
            user=user, resulting_twin_id=twin_id, status__in=["failed", "building"]
        ).first()
        if prev:
            return None  # will overwrite
    return f"Twin ID '{twin_id}' already exists"


def _register_twin_in_dtr(twin_id, tenant, metadata, interfaces, dependencies=None):
    tw, _ = Twin.objects.update_or_create(
        twin_id=twin_id,
        defaults={
            "tenant": tenant,
            "metadata": metadata,
            "interfaces": interfaces,
            "dependencies": dependencies or {"static": [], "dynamic": []},
        },
    )
    _sync_portal_card(tw, grant_user=None)
    PortalEvent.objects.create(
        tenant=tenant,
        etype="twin.update",
        payload={"twin_id": twin_id, "action": "registered"},
    )
    return tw


def _sync_portal_card(tw, grant_user=None):
    """Create/link a TwinUI portal card and grant access."""
    from .views import _sync_portal_card_for_twin
    _sync_portal_card_for_twin(tw)
    if grant_user:
        ui = TwinUI.objects.filter(dtr_id=tw.twin_id).first()
        if ui:
            AccessGrant.objects.get_or_create(user=grant_user, twin=ui)


def _validate_archive(path):
    """Basic security checks on an extracted archive directory."""
    errors = []
    for root, dirs, files in os.walk(path):
        for f in files:
            fp = Path(root) / f
            if fp.is_symlink():
                errors.append(f"Symlink not allowed: {fp.name}")
            if fp.stat().st_size > 10 * 1024 * 1024:
                errors.append(f"File too large (>10MB): {fp.name}")
            if fp.suffix.lower() not in ALLOWED_EXTENSIONS and fp.name != "Dockerfile":
                errors.append(f"File type not allowed: {fp.name}")
    # Must contain twin.yaml or twin.yml
    has_manifest = (Path(path) / "twin.yaml").exists() or (Path(path) / "twin.yml").exists()
    if not has_manifest:
        errors.append("Missing twin.yaml manifest file")
    return errors


def _parse_twin_yaml(path):
    """Parse twin.yaml using the lenient parser from scan_and_seed_twins."""
    manifest = Path(path) / "twin.yaml"
    if not manifest.exists():
        manifest = Path(path) / "twin.yml"
    if not manifest.exists():
        return None
    try:
        import yaml
        with open(manifest) as f:
            raw = f.read()
        # Handle bare @id field
        raw = re.sub(r"^@id:", '"@id":', raw, flags=re.MULTILINE)
        # Handle bare MQTT: tokens
        raw = re.sub(r":\s+MQTT:", ': "MQTT:', raw)
        raw = raw.replace('MQTT:', '"MQTT:')
        data = yaml.safe_load(raw)
        return data
    except Exception:
        # Fallback: regex extraction
        text = manifest.read_text()
        data = {}
        m = re.search(r'@id[:\s]+(\S+)', text)
        if m:
            data["@id"] = m.group(1)
        m = re.search(r'name[:\s]+(.+)', text)
        if m:
            data["name"] = m.group(1).strip()
        return data if data else None


# ─── Template content generators ─────────────────────────────────────────────

TEMPLATE_TWIN_YAML = '''"@id": dt:YourTwin_001
name: Your Twin Name
tenant: demo
metadata:
  domain: [YourDomain]
  status: instantiated
interfaces:
  api: http://localhost:3004
  data_streams:
    - "MQTT:dtp/yourtwin/telemetry"
dependencies:
  static: []
  dynamic: []
'''

TEMPLATE_COMPOSE_YAML = '''services:
  influx_local:
    image: influxdb:2
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: twin
      DOCKER_INFLUXDB_INIT_PASSWORD: twinpass123
      DOCKER_INFLUXDB_INIT_ORG: twin-org
      DOCKER_INFLUXDB_INIT_BUCKET: twin
      DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: twin-token-123
    volumes:
      - influxdata:/var/lib/influxdb2
    networks: [twin_net]

  generator:
    image: python:3.11-slim
    working_dir: /app
    volumes:
      - .:/app:ro
    env_file:
      - ../../.env
    command: ["bash","-lc","pip install --no-cache-dir influxdb-client paho-mqtt && python /app/generator.py"]
    environment:
      LOCAL_INFLUX_URL: http://influx_local:8086
      LOCAL_ORG: twin-org
      LOCAL_BUCKET: twin
      LOCAL_TOKEN: twin-token-123
      MQTT_BROKER_HOST: mqtt
      MQTT_BROKER_PORT: "1883"
      MQTT_TOPIC: dtp/yourtwin/telemetry
      CENTRAL_INFLUX_URL: http://influx:8086
      CENTRAL_INFLUX_ORG: ${INFLUX_ORG}
      CENTRAL_INFLUX_BUCKET: ${INFLUX_BUCKET}
      CENTRAL_INFLUX_TOKEN: ${INFLUX_TOKEN}
    depends_on: [influx_local]
    networks: [twin_net, main_net]

  ui:
    image: python:3.11-slim
    working_dir: /app
    volumes:
      - ./ui:/app
    command: ["bash","-lc","pip install --no-cache-dir cherrypy influxdb-client && python /app/app.py"]
    environment:
      TWIN_INFLUX_URL: http://influx_local:8086
      TWIN_INFLUX_ORG: twin-org
      TWIN_INFLUX_BUCKET: twin
      TWIN_INFLUX_TOKEN: twin-token-123
    ports:
      - "3004:8000"
    depends_on: [influx_local]
    networks: [twin_net]

networks:
  twin_net: {}
  main_net:
    external: true
    name: polyglotdtp_default

volumes:
  influxdata: {}
'''

TEMPLATE_GENERATOR_PY = '''"""Starter generator for a new Digital Twin.

Customize:
  - MEASUREMENT: the InfluxDB measurement name
  - generate_data(): your data generation logic
  - MQTT_TOPIC: the MQTT topic for alerts/telemetry
"""
import os, time, math, random, json
from datetime import datetime, timezone
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
import paho.mqtt.client as mqtt

LOCAL_URL    = os.getenv("LOCAL_INFLUX_URL", "http://influx_local:8086")
LOCAL_ORG    = os.getenv("LOCAL_ORG", "twin-org")
LOCAL_BUCKET = os.getenv("LOCAL_BUCKET", "twin")
LOCAL_TOKEN  = os.getenv("LOCAL_TOKEN", "twin-token-123")

MQTT_HOST  = os.getenv("MQTT_BROKER_HOST", "mqtt")
MQTT_PORT  = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "dtp/yourtwin/telemetry")

MEASUREMENT = "sensor_reading"
INTERVAL_SEC = 2


def generate_data(t):
    """Return a dict of field_name: value to write each cycle."""
    return {
        "value": 20.0 + 5.0 * math.sin(t / 10.0) + random.gauss(0, 0.5),
        "status": "ok" if random.random() > 0.05 else "warning",
    }


def main():
    client = InfluxDBClient(url=LOCAL_URL, token=LOCAL_TOKEN, org=LOCAL_ORG)
    writer = client.write_api(write_options=SYNCHRONOUS)

    mqtt_client = mqtt.Client()
    try:
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
        mqtt_client.loop_start()
    except Exception as e:
        print(f"[Twin] WARN: MQTT connect failed: {e}")

    t0 = time.time()
    while True:
        t = time.time() - t0
        now = datetime.now(timezone.utc)
        data = generate_data(t)

        p = Point(MEASUREMENT).time(now, WritePrecision.NS)
        for k, v in data.items():
            p = p.field(k, v)
        writer.write(bucket=LOCAL_BUCKET, record=p)

        # Publish to MQTT
        try:
            payload = {"type": "telemetry", "ts": now.isoformat(), **data}
            mqtt_client.publish(MQTT_TOPIC, json.dumps(payload), qos=0)
        except Exception:
            pass

        time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    main()
'''

TEMPLATES = {
    "twin.yaml": {
        "description": "Twin identity manifest — declares ID, interfaces, and metadata",
        "content": TEMPLATE_TWIN_YAML,
        "filename": "twin.yaml",
    },
    "compose.yaml": {
        "description": "Docker Compose stack — local InfluxDB, generator, and UI services",
        "content": TEMPLATE_COMPOSE_YAML,
        "filename": "compose.yaml",
    },
    "generator.py": {
        "description": "Data generator — produces measurements and publishes to MQTT",
        "content": TEMPLATE_GENERATOR_PY,
        "filename": "generator.py",
    },
}


# ─── API Endpoints ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def register_templates_list(request):
    """List available starter templates."""
    return JsonResponse([
        {"name": k, "description": v["description"], "filename": v["filename"]}
        for k, v in TEMPLATES.items()
    ], safe=False)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def register_template_download(request, name):
    """Download a specific template file."""
    tpl = TEMPLATES.get(name)
    if not tpl:
        return JsonResponse({"error": "Unknown template"}, status=404)
    response = HttpResponse(tpl["content"], content_type="text/plain; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{tpl["filename"]}"'
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_twin(request):
    """Submit a twin registration (either mode)."""
    data = request.data
    mode = data.get("mode")
    if mode not in ("platform", "external"):
        return JsonResponse({"error": "mode must be 'platform' or 'external'"}, status=400)

    twin_name = (data.get("twin_name") or "").strip()
    if not twin_name:
        return JsonResponse({"error": "twin_name is required"}, status=400)

    twin_id = (data.get("twin_id") or "").strip()
    if not twin_id:
        twin_id = _sanitize_twin_id(twin_name)

    # Check uniqueness
    err = _validate_twin_id(twin_id, request.user)
    if err:
        return JsonResponse({"error": err}, status=409)

    domain_tags = data.get("domain_tags", [])
    if isinstance(domain_tags, str):
        domain_tags = [t.strip() for t in domain_tags.split(",") if t.strip()]
    tenant = data.get("tenant", "demo") or "demo"

    reg = TwinRegistration.objects.create(
        user=request.user,
        mode=mode,
        twin_name=twin_name,
        twin_id_requested=twin_id,
        tenant=tenant,
        domain_tags=domain_tags,
    )

    if mode == "external":
        api_url = (data.get("external_api_url") or "").strip()
        if not api_url:
            reg.delete()
            return JsonResponse({"error": "external_api_url is required for external mode"}, status=400)

        mqtt_host = data.get("mqtt_broker_host", "")
        mqtt_port = data.get("mqtt_broker_port", 1883)
        mqtt_topics = data.get("mqtt_topics", [])
        data_streams_list = data.get("data_streams", [])

        if isinstance(mqtt_topics, str):
            mqtt_topics = [t.strip() for t in mqtt_topics.split(",") if t.strip()]
        if isinstance(data_streams_list, str):
            data_streams_list = [s.strip() for s in data_streams_list.split(",") if s.strip()]

        # Build data_streams in platform format
        streams = []
        for t in mqtt_topics:
            streams.append(f"MQTT:{t}")
        for s in data_streams_list:
            if not s.startswith("MQTT:"):
                streams.append(s)

        reg.external_api_url = api_url
        reg.mqtt_broker_host = mqtt_host
        reg.mqtt_broker_port = mqtt_port
        reg.mqtt_topics = mqtt_topics
        reg.data_streams = streams

        # Information Fabric stream categorization
        fabric = data.get("fabric")
        if fabric and isinstance(fabric, dict):
            # Validate structure: must have keys from {data, decisions, queries, state}
            valid_cats = {"data", "decisions", "queries", "state"}
            fabric = {k: v for k, v in fabric.items() if k in valid_cats and isinstance(v, list)}
        else:
            fabric = {}

        # External twins register immediately
        metadata = {"status": "instantiated", "domain": domain_tags, "name": twin_name}
        interfaces = {"api": api_url, "data_streams": streams}
        if fabric:
            interfaces["fabric"] = fabric

        try:
            tw = _register_twin_in_dtr(twin_id, tenant, metadata, interfaces)
            # Grant the registering user
            ui = TwinUI.objects.filter(dtr_id=twin_id).first()
            if ui:
                AccessGrant.objects.get_or_create(user=request.user, twin=ui)
            reg.status = "ready"
            reg.resulting_twin_id = twin_id
            reg.save()
            return JsonResponse({
                "id": str(reg.id),
                "status": "ready",
                "twin_id": twin_id,
                "message": "External twin registered successfully",
            })
        except Exception as e:
            reg.status = "failed"
            reg.status_detail = str(e)
            reg.save()
            return JsonResponse({"error": str(e)}, status=500)

    elif mode == "platform":
        github_url = (data.get("github_url") or "").strip()
        if github_url:
            reg.github_url = github_url
            reg.status = "validating"
            reg.save()
            # Process GitHub clone
            result = _process_github(reg)
            return JsonResponse(result, status=200 if result.get("status") != "failed" else 400)
        else:
            # File upload handled separately via register_twin_upload
            reg.status = "draft"
            reg.save()
            return JsonResponse({
                "id": str(reg.id),
                "status": "draft",
                "message": "Registration created. Upload twin files to complete.",
            })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_twin_upload(request):
    """Upload a zip/tar.gz twin bundle."""
    reg_id = request.data.get("registration_id") or request.POST.get("registration_id")
    if not reg_id:
        return JsonResponse({"error": "registration_id is required"}, status=400)

    try:
        reg = TwinRegistration.objects.get(id=reg_id, user=request.user)
    except TwinRegistration.DoesNotExist:
        return JsonResponse({"error": "Registration not found"}, status=404)

    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    # Validate file type
    fname = f.name.lower()
    if not (fname.endswith(".zip") or fname.endswith(".tar.gz") or fname.endswith(".tgz")):
        return JsonResponse({"error": "Must be .zip or .tar.gz"}, status=400)

    if f.size > 50 * 1024 * 1024:
        return JsonResponse({"error": "File too large (max 50MB)"}, status=400)

    # Extract to temp, validate, then move to media
    with tempfile.TemporaryDirectory() as tmpdir:
        extract_dir = Path(tmpdir) / "twin"
        extract_dir.mkdir()

        try:
            if fname.endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(f.read())) as zf:
                    # Check for path traversal
                    for name in zf.namelist():
                        if ".." in name or name.startswith("/"):
                            return JsonResponse({"error": f"Unsafe path in archive: {name}"}, status=400)
                    zf.extractall(extract_dir)
            else:
                with tarfile.open(fileobj=io.BytesIO(f.read()), mode="r:gz") as tf:
                    for member in tf.getmembers():
                        if ".." in member.name or member.name.startswith("/"):
                            return JsonResponse({"error": f"Unsafe path in archive: {member.name}"}, status=400)
                        if member.issym() or member.islnk():
                            return JsonResponse({"error": f"Symlinks not allowed: {member.name}"}, status=400)
                    tf.extractall(extract_dir)
        except (zipfile.BadZipFile, tarfile.TarError) as e:
            return JsonResponse({"error": f"Invalid archive: {e}"}, status=400)

        # Find the actual twin root (might be nested in a single folder)
        entries = list(extract_dir.iterdir())
        twin_root = extract_dir
        if len(entries) == 1 and entries[0].is_dir():
            twin_root = entries[0]

        # Validate
        errors = _validate_archive(twin_root)
        if errors:
            return JsonResponse({"error": "Validation failed", "details": errors}, status=400)

        # Parse twin.yaml
        manifest = _parse_twin_yaml(twin_root)
        if not manifest:
            return JsonResponse({"error": "Could not parse twin.yaml"}, status=400)

        # Move to permanent storage
        dest = Path(settings.MEDIA_ROOT) / "twin_uploads" / str(reg.id)
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(twin_root, dest)

    reg.upload_path = str(dest)
    reg.status = "validating"
    reg.save()

    # Finalize: register in DTR
    result = _finalize_platform_twin(reg, manifest)
    return JsonResponse(result, status=200 if result.get("status") != "failed" else 400)


def _process_github(reg):
    """Clone a GitHub repo and validate/register the twin."""
    url = reg.github_url
    if not re.match(r'^https://github\.com/[a-zA-Z0-9_./-]+$', url):
        reg.status = "failed"
        reg.status_detail = "Invalid GitHub URL"
        reg.save()
        return {"id": str(reg.id), "status": "failed", "error": "Invalid GitHub URL format"}

    with tempfile.TemporaryDirectory() as tmpdir:
        clone_dir = Path(tmpdir) / "repo"
        try:
            subprocess.run(
                ["git", "clone", "--depth=1", url, str(clone_dir)],
                capture_output=True, text=True, timeout=60, check=True,
            )
        except subprocess.TimeoutExpired:
            reg.status = "failed"
            reg.status_detail = "Git clone timed out (60s)"
            reg.save()
            return {"id": str(reg.id), "status": "failed", "error": "Clone timed out"}
        except subprocess.CalledProcessError as e:
            reg.status = "failed"
            reg.status_detail = f"Git clone failed: {e.stderr}"
            reg.save()
            return {"id": str(reg.id), "status": "failed", "error": f"Clone failed: {e.stderr[:200]}"}

        errors = _validate_archive(clone_dir)
        if errors:
            reg.status = "failed"
            reg.status_detail = "; ".join(errors)
            reg.save()
            return {"id": str(reg.id), "status": "failed", "error": "Validation failed", "details": errors}

        manifest = _parse_twin_yaml(clone_dir)
        if not manifest:
            reg.status = "failed"
            reg.status_detail = "Could not parse twin.yaml"
            reg.save()
            return {"id": str(reg.id), "status": "failed", "error": "Could not parse twin.yaml"}

        # Store files
        dest = Path(settings.MEDIA_ROOT) / "twin_uploads" / str(reg.id)
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(clone_dir, dest, ignore=shutil.ignore_patterns(".git"))
        reg.upload_path = str(dest)
        reg.save()

    return _finalize_platform_twin(reg, manifest)


def _finalize_platform_twin(reg, manifest):
    """Register a platform-hosted twin in the DTR from parsed manifest."""
    twin_id = reg.twin_id_requested
    if not twin_id:
        twin_id = manifest.get("@id") or _sanitize_twin_id(reg.twin_name)

    # Check uniqueness again
    if Twin.objects.filter(twin_id=twin_id).exists():
        twin_id = f"{twin_id}_{str(reg.id)[:8]}"

    metadata = manifest.get("metadata", {})
    if not metadata.get("name"):
        metadata["name"] = reg.twin_name
    if not metadata.get("domain") and reg.domain_tags:
        metadata["domain"] = reg.domain_tags
    if not metadata.get("status"):
        metadata["status"] = "instantiated"

    interfaces = manifest.get("interfaces", {})
    if not interfaces.get("api"):
        interfaces["api"] = ""
    deps = manifest.get("dependencies", {"static": [], "dynamic": []})

    try:
        tw = _register_twin_in_dtr(twin_id, reg.tenant, metadata, interfaces, deps)
        ui = TwinUI.objects.filter(dtr_id=twin_id).first()
        if ui:
            AccessGrant.objects.get_or_create(user=reg.user, twin=ui)

        reg.status = "ready"
        reg.resulting_twin_id = twin_id
        reg.status_detail = None
        reg.save()
        return {
            "id": str(reg.id),
            "status": "ready",
            "twin_id": twin_id,
            "message": "Twin registered successfully",
        }
    except Exception as e:
        reg.status = "failed"
        reg.status_detail = str(e)
        reg.save()
        return {"id": str(reg.id), "status": "failed", "error": str(e)}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_twin_guided(request):
    """Platform-hosted registration: user provides repo + Dockerfile.

    The platform wraps the user's Dockerfile/compose with networking,
    MQTT bridge, InfluxDB, and registers the twin in the DTR.
    """
    twin_name = (request.POST.get("twin_name") or "").strip()
    if not twin_name:
        return JsonResponse({"error": "twin_name is required"}, status=400)

    twin_id = (request.POST.get("twin_id") or "").strip()
    if not twin_id:
        twin_id = _sanitize_twin_id(twin_name)
    err = _validate_twin_id(twin_id, request.user)
    if err:
        return JsonResponse({"error": err}, status=409)

    tenant = request.POST.get("tenant", "demo") or "demo"
    domain_tags_raw = request.POST.get("domain_tags", "")
    domain_tags = [t.strip() for t in domain_tags_raw.split(",") if t.strip()]

    # Docker configuration from user
    dockerfile_text = (request.POST.get("dockerfile_text") or "").strip()
    dockerfile_type = request.POST.get("dockerfile_type", "dockerfile")  # 'dockerfile' or 'compose'
    exposed_port = (request.POST.get("exposed_port") or "").strip()

    # GitHub URL alternative to file upload
    github_url = (request.POST.get("github_url") or "").strip()

    # Information Fabric categorization (JSON string from form)
    fabric_raw = request.POST.get("fabric", "")
    fabric = {}
    if fabric_raw:
        try:
            fabric = json.loads(fabric_raw)
            valid_cats = {"data", "decisions", "queries", "state"}
            fabric = {k: v for k, v in fabric.items() if k in valid_cats and isinstance(v, list)}
        except (json.JSONDecodeError, AttributeError):
            fabric = {}

    # Repo source: file upload or GitHub
    repo_file = request.FILES.get("repo")
    if not repo_file and not github_url:
        return JsonResponse({"error": "Provide a repo zip upload or GitHub URL"}, status=400)

    # Create registration
    reg = TwinRegistration.objects.create(
        user=request.user, mode="platform",
        twin_name=twin_name, twin_id_requested=twin_id,
        tenant=tenant, domain_tags=domain_tags,
        github_url=github_url or None,
        status="building",
    )

    dest = Path(settings.MEDIA_ROOT) / "twin_uploads" / str(reg.id)
    dest.mkdir(parents=True, exist_ok=True)

    # Extract repo from upload or GitHub
    if repo_file:
        fname = repo_file.name.lower()
        if not (fname.endswith(".zip") or fname.endswith(".tar.gz") or fname.endswith(".tgz")):
            reg.status = "failed"; reg.status_detail = "Repo must be .zip or .tar.gz"; reg.save()
            return JsonResponse({"error": "Repo must be .zip or .tar.gz"}, status=400)
        with tempfile.TemporaryDirectory() as tmpdir:
            extract_dir = Path(tmpdir) / "repo"
            extract_dir.mkdir()
            try:
                raw = repo_file.read()
                if fname.endswith(".zip"):
                    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                        for name in zf.namelist():
                            if ".." in name or name.startswith("/"):
                                return JsonResponse({"error": f"Unsafe path: {name}"}, status=400)
                        zf.extractall(extract_dir)
                else:
                    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tf:
                        for member in tf.getmembers():
                            if ".." in member.name or member.name.startswith("/"):
                                return JsonResponse({"error": f"Unsafe path: {member.name}"}, status=400)
                        tf.extractall(extract_dir)
            except Exception as e:
                reg.status = "failed"; reg.status_detail = str(e); reg.save()
                return JsonResponse({"error": f"Invalid archive: {e}"}, status=400)
            # Handle single nested folder
            entries = list(extract_dir.iterdir())
            repo_root = entries[0] if len(entries) == 1 and entries[0].is_dir() else extract_dir
            shutil.copytree(repo_root, dest, dirs_exist_ok=True)
        reg.upload_path = str(dest)
        reg.save()
    elif github_url:
        result = _process_github(reg)
        if result.get("status") == "failed":
            return JsonResponse(result, status=400)
        # _process_github already saved files to dest and set reg.upload_path

    # Determine slug
    slug = re.sub(r"[^a-z0-9_]", "", twin_name.lower().replace(" ", "_").replace("-", "_")) or "twin"
    assigned_port = _next_available_port()

    # Auto-detect Docker files from repo if user didn't paste content
    detected = _detect_docker_files(dest)

    # Save user's Dockerfile/compose content, or use detected files
    if dockerfile_text:
        if dockerfile_type == "compose":
            (dest / "user-compose.yaml").write_text(dockerfile_text)
        else:
            if not (dest / "Dockerfile").exists():
                (dest / "Dockerfile").write_text(dockerfile_text)
    elif detected["compose_files"] or detected["dockerfiles"]:
        # Use the first detected file — repo already has it
        if detected["compose_files"]:
            dockerfile_type = "compose"
        elif detected["dockerfiles"]:
            dockerfile_type = "dockerfile"

    # Collect MQTT topics from fabric data
    mqtt_topics = []
    for cat_entries in fabric.values():
        for entry in cat_entries:
            proto = (entry.get("protocol") or "").upper()
            if "MQTT" in proto and entry.get("name"):
                mqtt_topics.append(f"MQTT:dtp/{slug}/{entry['name'].lower().replace(' ', '_')}")
    if not mqtt_topics:
        mqtt_topics = [f"MQTT:dtp/{slug}/telemetry"]

    # Generate platform wrapper compose.yaml
    wrapper = _generate_platform_compose(slug, dockerfile_text, dockerfile_type, assigned_port, mqtt_topics, dest=dest)
    (dest / "compose.yaml").write_text(wrapper)

    # Generate twin.yaml
    twin_yaml = f'''"@id": {twin_id}
name: {twin_name}
tenant: {tenant}
metadata:
  domain: [{", ".join(domain_tags)}]
  status: instantiated
interfaces:
  api: http://localhost:{assigned_port}
  data_streams:
{chr(10).join(f'    - "{t}"' for t in mqtt_topics)}
dependencies:
  static: []
  dynamic: []
'''
    (dest / "twin.yaml").write_text(twin_yaml)

    # Register in DTR
    manifest = {
        "@id": twin_id,
        "name": twin_name,
        "metadata": {"domain": domain_tags, "status": "instantiated", "name": twin_name},
        "interfaces": {
            "api": f"http://localhost:{assigned_port}",
            "data_streams": mqtt_topics,
            **({"fabric": fabric} if fabric else {}),
        },
        "dependencies": {"static": [], "dynamic": []},
    }
    result = _finalize_platform_twin(reg, manifest)
    result["generated_files"] = sorted([f.name for f in dest.iterdir() if f.is_file()])
    result["detected_docker"] = detected
    result["port"] = assigned_port

    # Trigger async build
    if result.get("status") == "ready":
        # Set back to building — the build will update to ready/failed
        reg.status = "building"
        reg.status_detail = "Build queued"
        reg.save()
        result["status"] = "building"
        result["message"] = "Twin registered. Building Docker image..."
        # Run build in background thread
        import threading
        threading.Thread(target=_build_twin, args=(reg, dest, slug), daemon=True).start()

    return JsonResponse(result, status=200 if result.get("status") == "failed" else 200)


def _detect_docker_files(repo_path):
    """Scan a repo directory for Dockerfiles and compose files."""
    repo = Path(repo_path)
    dockerfiles = []
    compose_files = []
    for f in repo.rglob("*"):
        if not f.is_file():
            continue
        rel = str(f.relative_to(repo))
        name = f.name.lower()
        if name == "dockerfile" or name.startswith("dockerfile."):
            dockerfiles.append(rel)
        elif name in ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"):
            compose_files.append(rel)
    return {
        "dockerfiles": sorted(dockerfiles),
        "compose_files": sorted(compose_files),
    }


def _build_twin(reg, dest, slug):
    """Build and start the twin containers. Runs in a background thread."""
    compose_path = dest / "compose.yaml"
    if not compose_path.exists():
        reg.status = "failed"
        reg.status_detail = "No compose.yaml found"
        reg.build_log = "ERROR: compose.yaml not found in twin directory"
        reg.save()
        return

    # Use the container path for -f flag. Docker CLI reads the compose file
    # from the container FS and sends build context to the daemon via socket.
    compose_file = str(compose_path)

    log_lines = []
    try:
        reg.status_detail = "Building Docker images..."
        reg.save()

        build_result = subprocess.run(
            ["docker", "compose", "-f", compose_file, "build"],
            capture_output=True, text=True, timeout=300,
        )
        log_lines.append("=== BUILD ===")
        log_lines.append(build_result.stdout[-2000:] if build_result.stdout else "(no stdout)")
        if build_result.stderr:
            log_lines.append(build_result.stderr[-2000:])

        if build_result.returncode != 0:
            reg.status = "failed"
            reg.status_detail = "Docker build failed"
            reg.build_log = "\n".join(log_lines)
            reg.save()
            return

        # Start
        reg.status_detail = "Starting containers..."
        reg.save()

        up_result = subprocess.run(
            ["docker", "compose", "-f", compose_file, "up", "-d"],
            capture_output=True, text=True, timeout=120,
        )
        log_lines.append("\n=== UP ===")
        log_lines.append(up_result.stdout[-2000:] if up_result.stdout else "(no stdout)")
        if up_result.stderr:
            log_lines.append(up_result.stderr[-1000:])

        if up_result.returncode != 0:
            reg.status = "failed"
            reg.status_detail = "Docker up failed"
            reg.build_log = "\n".join(log_lines)
            reg.save()
            return

        reg.status = "ready"
        reg.status_detail = "Built and running"
        reg.build_log = "\n".join(log_lines)
        reg.save()

    except subprocess.TimeoutExpired:
        log_lines.append("\nERROR: Build timed out (5 min limit)")
        reg.status = "failed"
        reg.status_detail = "Build timed out"
        reg.build_log = "\n".join(log_lines)
        reg.save()
    except Exception as e:
        log_lines.append(f"\nERROR: {e}")
        reg.status = "failed"
        reg.status_detail = str(e)
        reg.build_log = "\n".join(log_lines)
        reg.save()


def _detect_internal_port(dest):
    """Detect the container's internal port from Dockerfile EXPOSE or compose ports."""
    # Check Dockerfile for EXPOSE
    dockerfile = dest / "Dockerfile"
    if dockerfile.exists():
        for line in dockerfile.read_text().splitlines():
            line = line.strip().upper()
            if line.startswith("EXPOSE"):
                parts = line.split()
                for p in parts[1:]:
                    try:
                        return int(p.split("/")[0])  # handle "80/tcp"
                    except ValueError:
                        continue
    # Check user's docker-compose for ports
    for name in ("docker-compose.yml", "docker-compose.yaml", "user-compose.yaml"):
        f = dest / name
        if f.exists():
            for line in f.read_text().splitlines():
                line = line.strip().strip("-").strip().strip('"').strip("'")
                if ":" in line:
                    parts = line.split(":")
                    try:
                        return int(parts[-1].split("/")[0])
                    except ValueError:
                        continue
    return 8000  # fallback


def _generate_platform_compose(slug, dockerfile_text, dockerfile_type, port, mqtt_topics, dest=None):
    """Generate a compose.yaml that wraps the user's service with platform infra.

    Env vars are resolved at generation time so no env_file reference is needed.
    """
    influx_org = os.getenv("INFLUX_ORG", "dtp-org")
    influx_bucket = os.getenv("INFLUX_BUCKET", "signals")
    influx_token = os.getenv("INFLUX_TOKEN", "")

    internal_port = _detect_internal_port(dest) if dest else 8000

    svc_block = f'''services:
  twin:
    build: .
    environment:
      MQTT_BROKER_HOST: mqtt
      MQTT_BROKER_PORT: "1883"
      INFLUX_URL: http://influx:8086
      INFLUX_ORG: "{influx_org}"
      INFLUX_BUCKET: "{influx_bucket}"
      INFLUX_TOKEN: "{influx_token}"
    ports:
      - "{port}:{internal_port}"
    networks: [{slug}_net, main_net]

networks:
  {slug}_net: {{}}
  main_net:
    external: true
    name: polyglotdtp_default
'''
    return f'''# Platform-wrapped twin compose for: {slug}\n{svc_block}'''


def _next_available_port():
    """Find a port number not already in use by existing twins or running containers."""
    used = set()
    # Check registry
    for tw in Twin.objects.all():
        api = (tw.interfaces or {}).get("api", "")
        try:
            port = int(api.rsplit(":", 1)[-1].strip("/"))
            used.add(port)
        except (ValueError, IndexError):
            pass
    # Check actually-bound ports via Docker
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Ports}}"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            for part in line.split(","):
                part = part.strip()
                if "->" in part:
                    host_part = part.split("->")[0].strip()
                    port_str = host_part.rsplit(":", 1)[-1]
                    try:
                        used.add(int(port_str))
                    except ValueError:
                        pass
    except Exception:
        pass
    # Well-known ports to avoid
    used.update([80, 443, 1883, 5432, 7474, 7687, 8080, 8083, 8085, 8086, 9000, 9001, 9100, 9101])
    # Start from 3010
    for p in range(3010, 3200):
        if p not in used:
            return p
    return 3199


def _detect_pip_packages(dest, files):
    """Best-effort: scan Python files for common import names and map to pip packages."""
    import_map = {
        "numpy": "numpy", "np": "numpy",
        "pandas": "pandas", "pd": "pandas",
        "requests": "requests",
        "flask": "flask",
        "fastapi": "fastapi",
        "cherrypy": "cherrypy",
        "serial": "pyserial",
        "cv2": "opencv-python",
        "PIL": "Pillow", "pillow": "Pillow",
        "sklearn": "scikit-learn",
        "scipy": "scipy",
        "torch": "torch",
        "tensorflow": "tensorflow",
        "matplotlib": "matplotlib",
        "plotly": "plotly",
        "httpx": "httpx",
        "aiohttp": "aiohttp",
        "websockets": "websockets",
        "dotenv": "python-dotenv",
        "yaml": "pyyaml",
        "toml": "toml",
        "sqlalchemy": "sqlalchemy",
        "redis": "redis",
        "celery": "celery",
        "boto3": "boto3",
        "paramiko": "paramiko",
        "cryptography": "cryptography",
    }
    found = set()
    for f in files:
        if not f.name.endswith(".py"):
            continue
        fpath = dest / f.name
        try:
            text = fpath.read_text(errors="ignore")
        except Exception:
            continue
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("import ") or line.startswith("from "):
                parts = line.replace("from ", "").replace("import ", "").split(".")
                mod = parts[0].split()[0].strip(",")
                if mod in import_map:
                    found.add(import_map[mod])
    return list(found)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def register_twin_status(request, reg_id):
    """Check registration status."""
    try:
        reg = TwinRegistration.objects.get(id=reg_id, user=request.user)
    except TwinRegistration.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)
    return JsonResponse({
        "id": str(reg.id),
        "status": reg.status,
        "detail": reg.status_detail,
        "build_log": reg.build_log,
        "twin_id": reg.resulting_twin_id,
        "mode": reg.mode,
        "twin_name": reg.twin_name,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def register_my_registrations(request):
    """List the current user's twin registrations."""
    regs = TwinRegistration.objects.filter(user=request.user).order_by("-created_at")[:20]
    return JsonResponse([
        {
            "id": str(r.id),
            "twin_name": r.twin_name,
            "mode": r.mode,
            "status": r.status,
            "twin_id": r.resulting_twin_id,
            "created_at": r.created_at.isoformat(),
        }
        for r in regs
    ], safe=False)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def information_fabric(request):
    """Return the platform-wide Information Fabric — all twins' stream categorizations.

    Aggregates fabric data from all registry twins, grouped by the 4 categories:
    data, decisions, queries, state.
    """
    twins = Twin.objects.all()
    categories = {
        "data":      {"label": "Data",      "subtypes": ["raw_data", "processed_data"], "streams": []},
        "decisions": {"label": "Decisions",  "subtypes": ["decisions", "insights"],      "streams": []},
        "queries":   {"label": "Queries",    "subtypes": ["queries", "commands"],        "streams": []},
        "state":     {"label": "State",      "subtypes": ["state"],                     "streams": []},
    }
    twins_summary = []

    for tw in twins:
        ifaces = tw.interfaces or {}
        fabric = ifaces.get("fabric", {})
        md = tw.metadata or {}
        twin_info = {
            "twin_id": tw.twin_id,
            "name": md.get("name") or tw.twin_id,
            "domain": md.get("domain", []),
            "api": ifaces.get("api", ""),
            "fabric": {},
        }
        has_fabric = False

        for cat_key, cat_info in categories.items():
            entries = fabric.get(cat_key, [])
            if entries:
                has_fabric = True
                twin_info["fabric"][cat_key] = entries
                for entry in entries:
                    categories[cat_key]["streams"].append({
                        "twin_id": tw.twin_id,
                        "twin_name": md.get("name") or tw.twin_id,
                        **entry,
                    })

        # If no fabric defined, infer from data_streams
        if not has_fabric:
            streams = ifaces.get("data_streams", [])
            for s in streams:
                inferred = {
                    "name": s,
                    "stream": s,
                    "protocol": "MQTT" if s.startswith("MQTT:") else "API",
                    "trigger": "event",
                    "format": "structured",
                    "subtype": "raw_data",
                }
                categories["data"]["streams"].append({
                    "twin_id": tw.twin_id,
                    "twin_name": md.get("name") or tw.twin_id,
                    **inferred,
                })
                twin_info["fabric"]["data"] = twin_info["fabric"].get("data", []) + [inferred]

        twins_summary.append(twin_info)

    return JsonResponse({
        "categories": {
            k: {"label": v["label"], "subtypes": v["subtypes"], "count": len(v["streams"]), "streams": v["streams"]}
            for k, v in categories.items()
        },
        "twins": twins_summary,
        "total_streams": sum(len(v["streams"]) for v in categories.values()),
    })


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_twin_fabric(request, twin_id):
    """Update a twin's Information Fabric stream categorizations."""
    try:
        tw = Twin.objects.get(twin_id=twin_id)
    except Twin.DoesNotExist:
        return JsonResponse({"error": "Twin not found"}, status=404)

    fabric = request.data.get("fabric")
    if not fabric or not isinstance(fabric, dict):
        return JsonResponse({"error": "fabric must be a dict with keys: data, decisions, queries, state"}, status=400)

    valid_cats = {"data", "decisions", "queries", "state"}
    fabric = {k: v for k, v in fabric.items() if k in valid_cats and isinstance(v, list)}

    ifaces = tw.interfaces or {}
    ifaces["fabric"] = fabric
    tw.interfaces = ifaces
    tw.save(update_fields=["interfaces", "updated_at"])

    return JsonResponse({"ok": True, "twin_id": twin_id})
