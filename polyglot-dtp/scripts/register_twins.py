import os
import sys
import time
import json
import glob
import threading
import argparse
from pathlib import Path
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv

try:
    import yaml  # type: ignore
except Exception:
    yaml = None
try:
    from watchdog.observers import Observer  # type: ignore
    from watchdog.events import PatternMatchingEventHandler  # type: ignore
except Exception:
    Observer = None
    PatternMatchingEventHandler = None


def read_meta(path: Path):
    if path.suffix.lower() in (".yaml", ".yml"):
        if not yaml:
            raise RuntimeError("pyyaml not installed; cannot read YAML")
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def infer_ui_url(twin_dir: Path):
    # try compose.yaml in twin dir and find service 'ui' port mapping
    for name in ("compose.yaml", "docker-compose.yaml", "compose.yml"):
        p = twin_dir / name
        if p.exists():
            if not yaml:
                return None
            try:
                data = yaml.safe_load(p.read_text(encoding="utf-8"))
                svcs = (data or {}).get("services") or {}
                ui = svcs.get("ui") or next((svcs[k] for k in svcs.keys() if k.lower().endswith("ui")), None)
                if not ui:
                    return None
                ports = ui.get("ports") or []
                if ports:
                    # formats: "3001:8000" or dicts
                    first = ports[0]
                    if isinstance(first, str) and ":" in first:
                        host = first.split(":", 1)[0]
                        return f"http://localhost:{host}"
                    if isinstance(first, dict):
                        host = first.get("published") or first.get("host_port")
                        if host:
                            return f"http://localhost:{host}"
            except Exception:
                return None
    return None


def ensure_id(meta: dict, folder_name: str) -> str:
    tid = meta.get("@id") or meta.get("twin_id")
    if tid:
        return tid
    # generate a simple id based on folder name
    safe = folder_name.replace(" ", "_")
    return f"dt:{safe}_001"


def normalize_payload(meta: dict, folder: Path):
    name = meta.get("name") or folder.name
    tenant = meta.get("tenant") or "demo"
    interfaces = meta.get("interfaces") or {}
    if not interfaces.get("api"):
        url = infer_ui_url(folder)
        if url:
            interfaces["api"] = url
    if "data_streams" not in interfaces:
        interfaces["data_streams"] = []
    payload = {
        "@id": ensure_id(meta, folder.name),
        "tenant": tenant,
        "metadata": meta.get("metadata") or {"status": "instantiated", "name": name},
        "interfaces": interfaces,
        "dependencies": meta.get("dependencies") or {"static": [], "dynamic": []},
    }
    return payload


def get_token(api_base: str, username: str, password: str) -> str:
    r = requests.post(urljoin(api_base, "/api/token/"), json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access"]


def register_twin(api_base: str, token: str, payload: dict):
    r = requests.post(urljoin(api_base, "/api/registry/twins"), json=payload, headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()


def scan_once(api_base: str, token: str, root: Path) -> list:
    metas = []
    for twin_dir in sorted([p for p in root.iterdir() if p.is_dir()]):
        cand = None
        for pattern in ("twin.yaml", "twin.yml", "twin.json"):
            p = twin_dir / pattern
            if p.exists():
                cand = p
                break
        if not cand:
            continue
        try:
            raw = read_meta(cand) or {}
        except Exception as e:
            print(f"[register] WARN: failed to read {cand}: {e}")
            continue
        payload = normalize_payload(raw, twin_dir)
        try:
            res = register_twin(api_base, token, payload)
            metas.append({
                "folder": twin_dir.name,
                "@id": res.get("twin_id") or payload.get("@id"),
                "api": (res.get("interfaces") or {}).get("api") if isinstance(res.get("interfaces"), dict) else None,
            })
            print(f"Registered {twin_dir.name}: id={res.get('twin_id') or payload.get('@id')} api={(res.get('interfaces') or {}).get('api') if isinstance(res.get('interfaces'), dict) else None}")
        except Exception as e:
            print(f"[register] ERROR: registry POST failed for {twin_dir.name}: {e}")
    return metas


def main():
    parser = argparse.ArgumentParser(description="Scan twins and register into DTR")
    parser.add_argument("--root", default=None, help="Twins root folder (defaults to repo twins)")
    parser.add_argument("--api-base", default=None, help="Django API base, e.g. http://localhost:8085")
    parser.add_argument("--user", default=None, help="Admin username (email)")
    parser.add_argument("--password", default=None, help="Admin password")
    parser.add_argument("--watch", action="store_true", help="Watch for changes and auto-register")
    parser.add_argument("--interval", type=float, default=2.0, help="Polling interval when watchdog not available")
    args = parser.parse_args()

    load_dotenv()
    api_base = args.api_base or os.getenv("DTP_API_BASE") or os.getenv("VITE_API_BASE") or "http://localhost:8085"
    admin_user = args.user or os.getenv("DTP_ADMIN_USER", "admin@example.com")
    admin_pass = args.password or os.getenv("DTP_ADMIN_PASSWORD", "admin12345")
    root = Path(args.root) if args.root else (Path(__file__).resolve().parents[1] / "twins")

    token = get_token(api_base, admin_user, admin_pass)

    if not args.watch:
        items = scan_once(api_base, token, root)
        print(json.dumps({"count": len(items), "items": items}, indent=2))
        return

    # Watch mode
    print(f"[register] Watching {root} for twin.yaml changes (api={api_base})")
    debounce_lock = threading.Lock()
    timer_ref = {"t": None}

    def trigger_scan():
        with debounce_lock:
            t = timer_ref.get("t")
            if t:
                t.cancel()
            def run():
                try:
                    scan_once(api_base, token, root)
                except Exception as e:
                    print(f"[register] ERROR: scan failed: {e}")
            nt = threading.Timer(0.75, run)
            timer_ref["t"] = nt
            nt.start()

    if Observer and PatternMatchingEventHandler:
        handler = PatternMatchingEventHandler(patterns=["*/twin.yaml", "*/twin.yml", "*/twin.json"], ignore_directories=True)
        handler.on_created = lambda e: trigger_scan()
        handler.on_modified = lambda e: trigger_scan()
        observer = Observer()
        observer.schedule(handler, str(root), recursive=True)
        observer.start()
        try:
            scan_once(api_base, token, root)
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()
    else:
        # Fallback: simple poll by mtimes
        last_mtimes = {}
        def snapshot():
            m = {}
            for p in root.glob("*/twin.*"):
                if p.suffix.lower() not in (".yaml", ".yml", ".json"):
                    continue
                try:
                    m[str(p)] = p.stat().st_mtime
                except Exception:
                    pass
            return m
        last_mtimes = snapshot()
        scan_once(api_base, token, root)
        try:
            while True:
                time.sleep(args.interval)
                cur = snapshot()
                if cur != last_mtimes:
                    last_mtimes = cur
                    scan_once(api_base, token, root)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
