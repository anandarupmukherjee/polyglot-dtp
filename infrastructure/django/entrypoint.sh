#!/usr/bin/env bash
set -euo pipefail

python manage.py migrate --fake-initial

python manage.py shell -c 'from django.contrib.auth.models import User; from twins.models import TwinUI, AccessGrant; email="demo@example.com"; pw="demo12345"; u,created = User.objects.get_or_create(username=email, defaults={"email": email}); from django.db import transaction; transaction.set_autocommit(True); \
    (u.set_password(pw) or u.save()) if created else None; \
    (TwinUI.objects.create(name="Room 1", ui_url="http://localhost:7474"), TwinUI.objects.create(name="Room 2", ui_url="http://localhost:7474")) if TwinUI.objects.count()==0 else None; \
    [AccessGrant.objects.get_or_create(user=u, twin=t) for t in TwinUI.objects.all()]'

# Create Django superuser (admin) if not exists
python manage.py shell -c 'from django.contrib.auth.models import User; import os; \
    username=os.getenv("DJANGO_ADMIN_USER","admin@example.com"); \
    password=os.getenv("DJANGO_ADMIN_PASSWORD","admin12345"); \
    u = User.objects.filter(username=username).first(); \
    (User.objects.create_superuser(username=username, email=username, password=password)) if not u else None'

# Seed a Lift Maintenance twin entry pointing to the local Grafana in twin container (host port 3001)
python manage.py shell -c 'from django.contrib.auth.models import User; from twins.models import TwinUI, AccessGrant; \
    t, _ = TwinUI.objects.get_or_create(name="Lift Maintenance", defaults={"ui_url": "http://localhost:3001"}); \
    for u in User.objects.all(): AccessGrant.objects.get_or_create(user=u, twin=t)'

exec python manage.py runserver 0.0.0.0:8000
