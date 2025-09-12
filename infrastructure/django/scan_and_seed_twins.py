import os
import json
from pathlib import Path

import yaml

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portalbackend.settings")
import django  # noqa: E402

django.setup()

from twins.models import Twin  # noqa: E402
from twins.views import _sync_portal_card_for_twin as sync  # noqa: E402


def infer_api(twin_dir: Path):
    for name in ("compose.yaml", "docker-compose.yaml", "compose.yml"):
        p = twin_dir / name
        if p.exists():
            try:
                data = yaml.safe_load(p.read_text(encoding="utf-8"))
                svcs = (data or {}).get("services") or {}
                ui = svcs.get("ui") or next((svcs[k] for k in svcs if k.lower().endswith("ui")), None)
                if ui:
                    ports = ui.get("ports") or []
                    if ports:
                        first = ports[0]
                        if isinstance(first, str) and ":" in first:
                            host = first.split(":", 1)[0]
                            return f"http://localhost:{host}"
                        if isinstance(first, dict):
                            host = first.get("published") or first.get("host_port")
                            if host:
                                return f"http://localhost:{host}"
            except Exception:
                pass
    return None


def normalize(meta: dict, folder: Path):
    tid = meta.get("@id") or meta.get("twin_id") or f"dt:{folder.name}_001"
    interfaces = meta.get("interfaces") or {}
    if not interfaces.get("api"):
        api = infer_api(folder)
        if api:
            interfaces["api"] = api
    if "data_streams" not in interfaces:
        interfaces["data_streams"] = []
    return {
        "twin_id": tid,
        "tenant": meta.get("tenant") or "demo",
        "metadata": meta.get("metadata") or {"status": "instantiated", "name": meta.get("name") or folder.name},
        "interfaces": interfaces,
        "dependencies": meta.get("dependencies") or {"static": [], "dynamic": []},
    }


def run():
    # Prefer mounted repo twins directory when available; fall back to app path
    base = Path("/app/twins_repo")
    if not base.exists():
        base = Path("/app/twins")
    if not base.exists():
        return
    for twin_dir in base.iterdir():
        if not twin_dir.is_dir():
            continue
        cand = None
        for pat in ("twin.yaml", "twin.yml", "twin.json"):
            p = twin_dir / pat
            if p.exists():
                cand = p
                break
        if not cand:
            continue
        try:
            if cand.suffix in (".yaml", ".yml"):
                raw = yaml.safe_load(cand.read_text(encoding="utf-8"))
            else:
                raw = json.loads(cand.read_text(encoding="utf-8"))
            payload = normalize(raw or {}, twin_dir)
            tw, _ = Twin.objects.update_or_create(twin_id=payload["twin_id"], defaults=payload)
            try:
                sync(tw)
            except Exception:
                pass
        except Exception as e:
            print("scan error", twin_dir, e)


if __name__ == "__main__":
    run()

