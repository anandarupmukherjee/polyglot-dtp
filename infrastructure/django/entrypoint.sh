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
python manage.py shell -c 'from django.contrib.auth.models import User; from twins.models import TwinUI, AccessGrant; t,_=TwinUI.objects.get_or_create(name="Lift Maintenance", defaults={"ui_url":"http://localhost:3001"}); [AccessGrant.objects.get_or_create(user=u, twin=t) for u in User.objects.all()]'

# Seed a minimal DTR entry for the lift twin (for portal discovery)
python manage.py shell -c 'from twins.models import Twin; Twin.objects.update_or_create(\
    twin_id="dt:Lift_001", defaults={\
      "tenant": "demo",\
      "metadata": {"status": "instantiated", "domain": ["Lift"]},\
      "interfaces": {\
        "data_streams": ["MQTT:dtp/lift/alerts"],\
        "api": "http://localhost:3001"\
      },\
      "dependencies": {"static": [], "dynamic": []}\
    })'

# Seed Energy & HVAC twin (portal card + DTR)
python manage.py shell -c 'from twins.models import Twin, TwinUI, AccessGrant; from django.contrib.auth.models import User; \
  Twin.objects.update_or_create(twin_id="dt:EnergyHVAC_001", defaults={\
    "tenant":"demo",\
    "metadata": {"status":"instantiated","domain":["Energy","HVAC"]},\
    "interfaces": {"data_streams": ["MQTT:dtp/energy_hvac/events"], "api": "http://localhost:3002"},\
    "dependencies": {"static": [], "dynamic": []}\
  }); \
  ui,_=TwinUI.objects.get_or_create(name="Energy & HVAC", defaults={"ui_url":"http://localhost:3002","dtr_id":"dt:EnergyHVAC_001"}); \
  [AccessGrant.objects.get_or_create(user=u, twin=ui) for u in User.objects.all()]'

# Seed sample Room twins that align with the simulator topics
python manage.py shell -c 'from twins.models import Twin;\
  Twin.objects.update_or_create(twin_id="dt:RoomSensor_101", defaults={\
    "tenant":"demo",\
    "metadata": {"status":"instantiated","domain":["Temperature"]},\
    "interfaces": {"data_streams": ["MQTT:dtp/sensors/room1/temp"], "api": "http://localhost:8086"},\
    "dependencies": {"static": [], "dynamic": []}\
  });\
  Twin.objects.update_or_create(twin_id="dt:RoomSensor_102", defaults={\
    "tenant":"demo",\
    "metadata": {"status":"instantiated","domain":["Temperature"]},\
    "interfaces": {"data_streams": ["MQTT:dtp/sensors/room2/temp"], "api": "http://localhost:8086"},\
    "dependencies": {"static": [], "dynamic": []}\
  })'


# Scan twins from repo (non-fatal)
python /app/scan_and_seed_twins.py || true
exec python manage.py runserver 0.0.0.0:8000

