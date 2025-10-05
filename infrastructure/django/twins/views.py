import json
import time
import threading
from datetime import datetime, timedelta
from django.db import transaction
from django.http import StreamingHttpResponse, HttpRequest
from django.utils.timezone import now
from rest_framework.decorators import api_view, permission_classes
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from .models import TwinUI, AccessGrant, Twin, Service, PortalEvent
from .orchestrator import orchestrate_twin
from .serializers import TwinUISerializer, TwinSerializer, ServiceSerializer
from django.db import connection
import os
try:
    from influxdb_client import InfluxDBClient
except Exception:
    InfluxDBClient = None

# -----------------------------------------------------------------------------
# Simple background cron to cache last-data per twin (optional)
LASTDATA_CACHE = {}
_CRON_STARTED = False
_CRON_LOCK = threading.Lock()


def _compute_last_for_twin(tw: "Twin"):
    md = tw.metadata or {}
    domains = set(md.get("domain") or [])
    # default source and ts
    source = None
    ts = None
    # Heuristics per domain
    if "Lift" in domains:
        lift_id = md.get("lift_id") or "lift-001"
        ts = _influx_last_ts("alert", where=f' and r.lift_id == "{lift_id}"') or _influx_last_ts("alert")
        source = "influx:alert"
    if (not ts) and "Temperature" in domains:
        sig = md.get("signal_name")
        if not sig:
            if "101" in tw.twin_id:
                sig = "temp_room_1"
            elif "102" in tw.twin_id:
                sig = "temp_room_2"
        if sig:
            ts = _timescale_last_ts_for_signal(sig)
            source = f"timescale:signal:{sig}"
    if (not ts) and ("Energy" in domains or "HVAC" in domains):
        ts = _influx_last_ts("energy", field="kwh")
        source = "influx:energy.kwh"
    return ts, source


def _cron_loop(interval: float):
    from .models import Twin  # local import to avoid circulars at import time
    global LASTDATA_CACHE
    while True:
        try:
            cache = {}
            for tw in Twin.objects.all():
                ts, source = _compute_last_for_twin(tw)
                cache[tw.twin_id] = {"last_ts": ts, "source": source}
            LASTDATA_CACHE = cache
        except Exception:
            pass
        time.sleep(interval)


def _maybe_start_cron():
    global _CRON_STARTED
    if _CRON_STARTED:
        return
    with _CRON_LOCK:
        if _CRON_STARTED:
            return
        # enable only when explicitly requested or by default in dev
        enabled = os.getenv("ENABLE_LASTDATA_CRON", "1") == "1"
        interval = float(os.getenv("LASTDATA_CRON_INTERVAL", "30"))
        if enabled:
            t = threading.Thread(target=_cron_loop, args=(interval,), daemon=True)
            t.start()
            _CRON_STARTED = True


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_twins(request):
    twin_ids = AccessGrant.objects.filter(user=request.user).values_list("twin_id", flat=True)
    twins = TwinUI.objects.filter(twin_id__in=twin_ids).order_by("name")
    return Response(TwinUISerializer(twins, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def healthz(request):
    # minimal health info
    db_ok = True
    try:
        with connection.cursor() as cur:
            cur.execute("select 1")
            cur.fetchone()
    except Exception:
        db_ok = False
    influx_cfg = bool(os.getenv("CENTRAL_INFLUX_URL") or os.getenv("INFLUX_URL")) and bool(os.getenv("INFLUX_TOKEN"))
    _maybe_start_cron()
    return Response({
        "ok": True,
        "db": db_ok,
        "influx_configured": influx_cfg,
        "cron": _CRON_STARTED,
        "ts": now().isoformat(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    return Response({
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "is_staff": u.is_staff,
        "is_superuser": u.is_superuser,
    })


# --- Registry APIs ---

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def registry_attach_twin(request: HttpRequest):
    """Attach/register a twin in the DTR.

    Expected body (minimal):
    {
      "@id": "dt:RoomSensor_101",
      "tenant": "t1",  # optional
      "metadata": {"status":"instantiated","domain":["Temperature"]},
      "interfaces": {"data_streams": ["MQTT:..."], "api": "https://..."},
      "dependencies": {"static": [], "dynamic": []}
    }
    """
    payload = request.data or {}
    twin_id = payload.get("@id") or payload.get("twin_id")
    if not twin_id:
        return Response({"detail": "@id required"}, status=status.HTTP_400_BAD_REQUEST)
    defaults = {
        "tenant": payload.get("tenant"),
        "metadata": payload.get("metadata") or {"status": "instantiated"},
        "interfaces": payload.get("interfaces") or {},
        "dependencies": payload.get("dependencies") or {},
    }
    with transaction.atomic():
        tw, created = Twin.objects.update_or_create(
            twin_id=twin_id,
            defaults=defaults,
        )
        try:
            orchestrate_twin(TwinSerializer(tw).data)
        except Exception:
            pass
        _sync_portal_card_for_twin(tw)
        PortalEvent.objects.create(
            tenant=tw.tenant or "default",
            etype="twin.update",
            payload={"twin_id": tw.twin_id, "metadata": tw.metadata},
        )
    return Response(TwinSerializer(tw).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def registry_update_twin(request: HttpRequest, twin_id: str):
    try:
        tw = Twin.objects.get(pk=twin_id)
    except Twin.DoesNotExist:
        return Response({"detail": "twin not found"}, status=status.HTTP_404_NOT_FOUND)
    patch = request.data or {}
    # allow updating lifecycle metadata, interfaces, dependencies
    for field in ("metadata", "interfaces", "dependencies", "tenant"):
        if field in patch and patch[field] is not None:
            setattr(tw, field, patch[field])
    tw.save()
    try:
        orchestrate_twin(TwinSerializer(tw).data)
    except Exception:
        pass
    _sync_portal_card_for_twin(tw)
    PortalEvent.objects.create(
        tenant=tw.tenant or "default",
        etype="twin.update",
        payload={"twin_id": tw.twin_id, "metadata": tw.metadata},
    )
    return Response(TwinSerializer(tw).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def registry_detach_twin(request: HttpRequest, twin_id: str):
    soft = request.query_params.get("soft") == "true"
    try:
        tw = Twin.objects.get(pk=twin_id)
    except Twin.DoesNotExist:
        return Response({"detail": "twin not found"}, status=status.HTTP_404_NOT_FOUND)
    if soft:
        md = dict(tw.metadata or {})
        md["status"] = "deprecated"
        tw.metadata = md
        tw.save()
        PortalEvent.objects.create(
            tenant=tw.tenant or "default",
            etype="twin.update",
            payload={"twin_id": tw.twin_id, "metadata": tw.metadata},
        )
        return Response({"ok": True})
    tenant = tw.tenant or "default"
    tid = tw.twin_id
    tw.delete()
    PortalEvent.objects.create(
        tenant=tenant,
        etype="twin.delete",
        payload={"twin_id": tid},
    )
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def registry_list_twins(request: HttpRequest):
    tenant = request.query_params.get("tenant")
    qs = Twin.objects.all().order_by("twin_id")
    if tenant:
        qs = qs.filter(tenant=tenant)
    # optional filters
    status_f = request.query_params.get("status")
    domain_f = request.query_params.get("domain")
    scope = (request.query_params.get("scope") or "").lower()

    # RBAC: non-staff users see only their granted twins by default (or when scope=mine)
    allowed_api_urls = set()
    allowed_names = set()
    allowed_dtr_ids = set()
    if not request.user.is_staff:
        granted_ui = TwinUI.objects.filter(accessgrant__user=request.user)
        allowed_api_urls = {t.ui_url for t in granted_ui}
        allowed_names = {t.name for t in granted_ui}
        allowed_dtr_ids = {t.dtr_id for t in granted_ui if getattr(t, 'dtr_id', None)}
    items = []
    for tw in qs:
        md = tw.metadata or {}
        if status_f and md.get("status") != status_f:
            continue
        if domain_f and domain_f not in (md.get("domain") or []):
            continue
        if not request.user.is_staff:
            if scope == "mine" or scope == "":
                api_url = tw.interfaces.get("api") if isinstance(tw.interfaces, dict) else None
                if (
                    api_url not in allowed_api_urls
                    and tw.twin_id not in allowed_dtr_ids
                    and tw.twin_id not in allowed_names
                ):
                    continue
        items.append(TwinSerializer(tw).data)
    return Response(items)


@api_view(["GET"])
@permission_classes([AllowAny])
def registry_list_twins_public(request: HttpRequest):
    """Public read-only listing for demo/ingress services to discover declared topics."""
    tenant = request.query_params.get("tenant")
    qs = Twin.objects.all().order_by("twin_id")
    if tenant:
        qs = qs.filter(tenant=tenant)
    status_f = request.query_params.get("status")
    domain_f = request.query_params.get("domain")
    items = []
    for tw in qs:
        md = tw.metadata or {}
        if status_f and md.get("status") != status_f:
            continue
        if domain_f and domain_f not in (md.get("domain") or []):
            continue
        items.append(TwinSerializer(tw).data)
    return Response(items)


# Combined dispatchers to share URL paths cleanly
class RegistryTwinsRoot(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: HttpRequest):
        tenant = request.query_params.get("tenant")
        qs = Twin.objects.all().order_by("twin_id")
        if tenant:
            qs = qs.filter(tenant=tenant)

        # optional filters
        status_f = request.query_params.get("status")
        domain_f = request.query_params.get("domain")
        scope = (request.query_params.get("scope") or "mine").lower()

        # RBAC: apply filtering when (a) user is not staff OR (b) scope explicitly 'mine'
        apply_rbac = (not request.user.is_staff) or (scope == "mine")
        allowed_api_urls = set()
        allowed_names = set()
        allowed_dtr_ids = set()
        allowed_ids = set()
        if apply_rbac:
            granted_ui = TwinUI.objects.filter(accessgrant__user=request.user)
            allowed_api_urls = {t.ui_url for t in granted_ui}
            allowed_names = {t.name for t in granted_ui}
            allowed_dtr_ids = {t.dtr_id for t in granted_ui if getattr(t, 'dtr_id', None)}
            allowed_ids = set(allowed_dtr_ids)
            # Also allow any DTR twin whose interfaces.api matches a granted UI URL
            for tw in qs:
                if isinstance(tw.interfaces, dict):
                    api_url = tw.interfaces.get("api")
                    if api_url in allowed_api_urls:
                        allowed_ids.add(tw.twin_id)

        items = []
        for tw in qs:
            md = tw.metadata or {}
            if status_f and md.get("status") != status_f:
                continue
            if domain_f and domain_f not in (md.get("domain") or []):
                continue
            if apply_rbac and (tw.twin_id not in allowed_ids) and (tw.twin_id not in allowed_names):
                continue
            items.append(TwinSerializer(tw).data)
        return Response(items)

    def post(self, request: HttpRequest):
        payload = request.data or {}
        twin_id = payload.get("@id") or payload.get("twin_id")
        if not twin_id:
            return Response({"detail": "@id required"}, status=status.HTTP_400_BAD_REQUEST)
        defaults = {
            "tenant": payload.get("tenant"),
            "metadata": payload.get("metadata") or {"status": "instantiated"},
            "interfaces": payload.get("interfaces") or {},
            "dependencies": payload.get("dependencies") or {},
        }
        with transaction.atomic():
            tw, created = Twin.objects.update_or_create(
                twin_id=twin_id,
                defaults=defaults,
            )
            try:
                orchestrate_twin(TwinSerializer(tw).data)
            except Exception:
                pass
            PortalEvent.objects.create(
                tenant=tw.tenant or "default",
                etype="twin.update",
                payload={"twin_id": tw.twin_id, "metadata": tw.metadata},
            )
        return Response(TwinSerializer(tw).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class RegistryTwinItem(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: HttpRequest, twin_id: str):
        try:
            tw = Twin.objects.get(pk=twin_id)
        except Twin.DoesNotExist:
            return Response({"detail": "twin not found"}, status=status.HTTP_404_NOT_FOUND)
        patch = request.data or {}
        for field in ("metadata", "interfaces", "dependencies", "tenant"):
            if field in patch and patch[field] is not None:
                setattr(tw, field, patch[field])
        tw.save()
        try:
            orchestrate_twin(TwinSerializer(tw).data)
        except Exception:
            pass
        PortalEvent.objects.create(
            tenant=tw.tenant or "default",
            etype="twin.update",
            payload={"twin_id": tw.twin_id, "metadata": tw.metadata},
        )
        return Response(TwinSerializer(tw).data)

    def delete(self, request: HttpRequest, twin_id: str):
        soft = request.query_params.get("soft") == "true"
        try:
            tw = Twin.objects.get(pk=twin_id)
        except Twin.DoesNotExist:
            return Response({"detail": "twin not found"}, status=status.HTTP_404_NOT_FOUND)
        if soft:
            md = dict(tw.metadata or {})
            md["status"] = "deprecated"
            tw.metadata = md
            tw.save()
            PortalEvent.objects.create(
                tenant=tw.tenant or "default",
                etype="twin.update",
                payload={"twin_id": tw.twin_id, "metadata": tw.metadata},
            )
            return Response({"ok": True})
        tenant = tw.tenant or "default"
        tid = tw.twin_id
        tw.delete()
        PortalEvent.objects.create(
            tenant=tenant,
            etype="twin.delete",
            payload={"twin_id": tid},
        )
        return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def registry_register_service(request: HttpRequest):
    payload = request.data or {}
    required = ("category", "interfaces")
    missing = [k for k in required if k not in payload]
    if missing:
        return Response({"detail": f"missing: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)
    svc = Service.objects.create(
        name=payload.get("name") or payload.get("category"),
        tenant=payload.get("tenant"),
        category=payload["category"],
        interfaces=payload.get("interfaces") or {},
        health=payload.get("health"),
        twin_ref=payload.get("twin_ref"),
    )
    PortalEvent.objects.create(
        tenant=svc.tenant or "default",
        etype="service.update",
        payload={"id": str(svc.id), "category": svc.category, "name": svc.name},
    )
    return Response(ServiceSerializer(svc).data, status=status.HTTP_201_CREATED)


# List services (RBAC-filtered)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def registry_list_services(request: HttpRequest):
    tenant = request.query_params.get("tenant")
    scope = (request.query_params.get("scope") or "mine").lower()
    qs = Service.objects.all().order_by("name")
    if tenant:
        qs = qs.filter(tenant=tenant)
    # Apply RBAC when user is not staff OR scope=mine; otherwise (staff + scope=all) show all
    apply_rbac = (not request.user.is_staff) or (scope == "mine")
    if not apply_rbac:
        return Response(ServiceSerializer(qs, many=True).data)
    granted_ui = TwinUI.objects.filter(accessgrant__user=request.user)
    allowed_dtr_ids = {t.dtr_id for t in granted_ui if getattr(t, 'dtr_id', None)}
    allowed_api_urls = {t.ui_url for t in granted_ui}
    items = []
    for s in qs:
        twin_ref_ok = bool(s.twin_ref) and s.twin_ref in allowed_dtr_ids
        api_ok = isinstance(s.interfaces, dict) and (s.interfaces.get("api") in allowed_api_urls)
        if twin_ref_ok or api_ok:
            items.append(ServiceSerializer(s).data)
    return Response(items)


# Explicit "my twins" endpoint (strict RBAC)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def registry_my_twins(request: HttpRequest):
    granted_ui = TwinUI.objects.filter(accessgrant__user=request.user)
    allowed_dtr_ids = {t.dtr_id for t in granted_ui if getattr(t, 'dtr_id', None)}
    allowed_api_urls = {t.ui_url for t in granted_ui}
    items_map = {}
    # by dtr_id
    for tw in Twin.objects.filter(twin_id__in=allowed_dtr_ids):
        items_map[tw.twin_id] = TwinSerializer(tw).data
    # by interfaces.api
    for tw in Twin.objects.all():
        if isinstance(tw.interfaces, dict) and tw.interfaces.get('api') in allowed_api_urls:
            items_map[tw.twin_id] = TwinSerializer(tw).data
    return Response(list(items_map.values()))


# Explicit "my services" endpoint (strict RBAC)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def registry_my_services(request: HttpRequest):
    granted_ui = TwinUI.objects.filter(accessgrant__user=request.user)
    allowed_dtr_ids = {t.dtr_id for t in granted_ui if getattr(t, 'dtr_id', None)}
    allowed_api_urls = {t.ui_url for t in granted_ui}
    items = []
    for s in Service.objects.all():
        twin_ref_ok = bool(s.twin_ref) and s.twin_ref in allowed_dtr_ids
        api_ok = isinstance(s.interfaces, dict) and (s.interfaces.get('api') in allowed_api_urls)
        if twin_ref_ok or api_ok:
            items.append(ServiceSerializer(s).data)
    return Response(items)

# --- Portal SSE ---

@api_view(["GET"])
@permission_classes([AllowAny])
def portal_stream(request: HttpRequest):
    tenant = request.query_params.get("tenant") or "default"
    # stream events newer than optional since parameter
    try:
        since_param = request.query_params.get("since")
        since_dt = datetime.fromisoformat(since_param) if since_param else (now() - timedelta(minutes=10))
    except Exception:
        since_dt = now() - timedelta(minutes=10)

    def event_stream():
        last_ts = since_dt
        while True:
            # poll DB for new portal events for this tenant
            new_items = PortalEvent.objects.filter(tenant=tenant, created_at__gt=last_ts).order_by("created_at")
            for ev in new_items:
                data = json.dumps({
                    "type": ev.etype,
                    "tenant": ev.tenant,
                    "payload": ev.payload,
                    "ts": ev.created_at.isoformat(),
                })
                yield f"event: update\n"
                yield f"data: {data}\n\n"
                last_ts = ev.created_at
            time.sleep(1)

def _sync_portal_card_for_twin(tw: Twin):
    """Ensure a TwinUI portal card exists and is linked to this DTR twin.

    - Name: prefer metadata.name if present, else the twin_id
    - ui_url: interfaces.api if present; if missing, keep existing
    - dtr_id: twin_id
    - Bootstrap policy (demo): if the card has no grants yet, grant all users
    """
    try:
        md = tw.metadata or {}
        name = md.get("name") or tw.twin_id
        api = None
        if isinstance(tw.interfaces, dict):
            api = tw.interfaces.get("api")
        changed = False
        duplicates = []
        with transaction.atomic():
            matches = list(TwinUI.objects.select_for_update().filter(dtr_id=tw.twin_id))
            if matches:
                ui = matches[0]
                duplicates = matches[1:]
            else:
                fallback = TwinUI.objects.select_for_update().filter(name=name, dtr_id__isnull=True).first()
                if fallback:
                    ui = fallback
                    if ui.dtr_id != tw.twin_id:
                        ui.dtr_id = tw.twin_id
                        ui.save(update_fields=["dtr_id"])
                else:
                    ui = TwinUI.objects.create(
                        dtr_id=tw.twin_id,
                        name=name,
                        ui_url=api or ""
                    )
            if duplicates:
                dup_ids = [dup.pk for dup in duplicates]
                AccessGrant.objects.filter(twin_id__in=dup_ids).update(twin=ui)
                TwinUI.objects.filter(pk__in=dup_ids).delete()
        ui.refresh_from_db()
        if ui.name != name:
            ui.name = name
            changed = True
        if api and ui.ui_url != api:
            ui.ui_url = api
            changed = True
        if changed:
            ui.save()
        # bootstrap grants: if none exist for this card, grant all users
        if not AccessGrant.objects.filter(twin=ui).exists():
            from django.contrib.auth.models import User
            for u in User.objects.all():
                AccessGrant.objects.get_or_create(user=u, twin=ui)
    except Exception:
        # do not break registry flow on portal sync errors
        pass



def _timescale_last_ts_for_signal(signal_name: str):
    try:
        with connection.cursor() as cur:
            cur.execute("""
                select max(o.ts)
                from observation o
                join signal s using(signal_id)
                where s.name = %s
            """, [signal_name])
            row = cur.fetchone()
            return row[0].isoformat() if row and row[0] else None
    except Exception:
        return None


def _influx_last_ts(measurement: str, field: str = None, where: str = ""):
    url = os.getenv("CENTRAL_INFLUX_URL") or os.getenv("INFLUX_URL")
    token = os.getenv("INFLUX_TOKEN")
    org = os.getenv("INFLUX_ORG")
    bucket = os.getenv("INFLUX_BUCKET")
    if not (InfluxDBClient and url and token and org and bucket):
        return None
    where_clause = where or ""
    fld = f" and r._field == \"{field}\"" if field else ""
    q = f'from(bucket:"{bucket}") |> range(start: -24h) |> filter(fn: (r) => r._measurement == "{measurement}"{fld}{where_clause}) |> keep(columns:["_time"]) |> last()'
    try:
        with InfluxDBClient(url=url, token=token, org=org) as c:
            res = c.query_api().query(org=org, query=q)
            for table in res:
                for rec in table.records:
                    return rec.get_time().isoformat()
    except Exception:
        return None
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def last_data_my(request: HttpRequest):
    _maybe_start_cron()
    # Build map of dtr twin_id -> last data timestamp
    result = []
    # get user's DTR twins via grants
    granted_ui = TwinUI.objects.filter(accessgrant__user=request.user)
    # map dtr_id or api url to Twin
    all_twins = {tw.twin_id: tw for tw in Twin.objects.all()}
    # helper to add
    def add_item(tw: Twin, ts: str):
        result.append({"twin_id": tw.twin_id, "last_ts": ts})

    # attempt for each grant
    for ui in granted_ui:
        tw = None
        if ui.dtr_id and ui.dtr_id in all_twins:
            tw = all_twins[ui.dtr_id]
        else:
            # fallback: by api
            tw = next((t for t in all_twins.values() if isinstance(t.interfaces, dict) and t.interfaces.get("api") == ui.ui_url), None)
        if not tw:
            continue
        # Prefer cached if available
        cache = LASTDATA_CACHE.get(tw.twin_id) or {}
        last_ts = cache.get("last_ts")
        source = cache.get("source")
        if not last_ts:
            last_ts, source = _compute_last_for_twin(tw)
        result.append({"twin_id": tw.twin_id, "last_ts": last_ts, "source": source})
    return Response({"items": result, "count": len(result)})

    return StreamingHttpResponse(event_stream(), content_type='text/event-stream')


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def last_data_cached(request: HttpRequest):
    _maybe_start_cron()
    granted_ui = TwinUI.objects.filter(accessgrant__user=request.user)
    all_twins = {tw.twin_id: tw for tw in Twin.objects.all()}
    items = []
    for ui in granted_ui:
        tw = None
        if ui.dtr_id and ui.dtr_id in all_twins:
            tw = all_twins[ui.dtr_id]
        else:
            tw = next((t for t in all_twins.values() if isinstance(t.interfaces, dict) and t.interfaces.get("api") == ui.ui_url), None)
        if not tw:
            continue
        entry = LASTDATA_CACHE.get(tw.twin_id) or {}
        items.append({"twin_id": tw.twin_id, "last_ts": entry.get("last_ts"), "source": entry.get("source")})
    return Response({"items": items, "count": len(items)})
