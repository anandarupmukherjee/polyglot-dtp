#!/usr/bin/env python3
import json
import os
from pathlib import Path

try:
    import yaml  # type: ignore
except Exception:
    yaml = None


def find_twins(root: Path):
    for p in root.rglob('twin.yaml'):
        yield p


def load_yaml(path: Path):
    if yaml is None:
        # minimal loader to avoid dependency if PyYAML not installed
        # fallback: return raw as lines
        return {"_raw": path.read_text(encoding='utf-8', errors='replace')}
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f) or {}


def main():
    root = Path(os.getenv('TWINS_DIR', 'polyglot-dtp/twins')).resolve()
    items = []
    for twin_file in find_twins(root):
        data = load_yaml(twin_file)
        items.append({
            "path": str(twin_file),
            "id": data.get('@id'),
            "name": data.get('name'),
            "tenant": data.get('tenant'),
            "metadata": data.get('metadata', {}),
            "interfaces": data.get('interfaces', {}),
            "dependencies": data.get('dependencies', {}),
        })
    print(json.dumps({"twins": items}, indent=2))


if __name__ == '__main__':
    main()

