.PHONY: up down logs test ci
up:
\tcp -n .env.example .env || true
\tdocker compose up -d
\tpython3 -m venv .venv && . .venv/bin/activate && pip install -r scripts/requirements.txt

down:
\tdocker compose down -v

logs:
\tdocker compose logs -f --tail=200

test:
\t. .venv/bin/activate && python scripts/test_all.py

ci:
\tpip install -r scripts/requirements.txt && python scripts/test_all.py
