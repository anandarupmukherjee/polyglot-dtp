.PHONY: venv up down logs test ci

venv:
	if [ ! -d ".venv" ]; then python3 -m venv .venv; fi
	./.venv/bin/pip install -qq --upgrade pip
	./.venv/bin/pip install -qq -r requirements.txt

up:
	docker compose up -d --remove-orphans

down:
	docker compose down -v --remove-orphans

logs:
	docker compose logs -f --tail=200

test:
	./.venv/bin/python scripts/test/test_all.py

ci:
	./.venv/bin/pip install -qq -r requirements.txt && ./.venv/bin/python scripts/test/test_all.py
