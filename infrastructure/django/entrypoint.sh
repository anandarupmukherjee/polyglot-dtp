#!/usr/bin/env bash
set -euo pipefail

python manage.py migrate --fake-initial

python manage.py bootstrap_demo

python /app/infrastructure/django/register_services.py

python /app/scan_and_seed_twins.py || true
exec python manage.py runserver 0.0.0.0:8000

