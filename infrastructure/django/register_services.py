from pathlib import Path
import sys
import os

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "portalbackend.settings")
import django

django.setup()

from django.contrib.auth.models import User
from twins.models import Twin, TwinUI, Service, ServiceAccessGrant

CORE_SERVICES = [
    {"name": "Django Admin", "interfaces": {"api": "http://localhost:8085/admin", "public": True}, "category": "UI", "health": "http://localhost:8085/api/healthz"},
    {"name": "Neo4j Browser", "interfaces": {"api": "http://localhost:7474", "public": True}, "category": "UI"},
    {"name": "InfluxDB", "interfaces": {"api": "http://localhost:8086", "public": True}, "category": "UI", "health": "http://localhost:8086/health"},
    {"name": "MinIO Console", "interfaces": {"api": "http://localhost:9101", "public": True}, "category": "UI"},
    {"name": "Twin Composer", "interfaces": {"api": "http://localhost:1880", "public": True}, "category": "UI"},
]


def ensure_service_grant(service: Service):
    if ServiceAccessGrant.objects.filter(service=service).exists():
        return
    for user in User.objects.all():
        ServiceAccessGrant.objects.get_or_create(user=user, service=service)


def run():
    from twins.models import Twin, TwinUI, Service
    Twin.objects.filter(twin_id="dt:TwinComposer_001").delete()
    TwinUI.objects.filter(name="Twin Composer").delete()
    for svc in CORE_SERVICES:
        defaults = {
            "tenant": svc.get("tenant") or "demo",
            "category": svc.get("category", "UI"),
            "interfaces": svc.get("interfaces", {}),
            "health": svc.get("health"),
            "twin_ref": svc.get("twin_ref"),
        }
        service, _ = Service.objects.update_or_create(name=svc["name"], defaults=defaults)
        ensure_service_grant(service)


if __name__ == "__main__":
    run()
