import uuid
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User


class TwinUI(models.Model):
    twin_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    ui_url = models.URLField()
    # Optional: link this UI card to a DTR twin (@id)
    dtr_id = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'twin_ui'


class AccessGrant(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    twin = models.ForeignKey(TwinUI, on_delete=models.CASCADE)

    class Meta:
        db_table = 'user_twin_map'
        unique_together = ('user', 'twin')


class Twin(models.Model):
    """Digital Twin Registry entry (minimal RA envelope).

    Stores identity (@id), tenant, lifecycle/metadata, declared interfaces and dependencies.
    """
    twin_id = models.CharField(max_length=200, primary_key=True)  # e.g. "dt:RoomSensor_101"
    tenant = models.CharField(max_length=200, blank=True, null=True)
    metadata = models.JSONField(default=dict)  # includes status, domain, etc.
    interfaces = models.JSONField(default=dict)  # { data_streams:[], api:"" }
    dependencies = models.JSONField(default=dict)  # { static:[], dynamic:[] }
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'registry_twin'


class Service(models.Model):
    """Service Registry entry for companion services (ANA/DMS/ACT/UI/etc.)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    tenant = models.CharField(max_length=200, blank=True, null=True)
    category = models.CharField(max_length=32)  # "ANA"|"DMS"|"UI"|"DC"|"SDS"|"DO"|"ACT"
    interfaces = models.JSONField(default=dict)  # { input:[], output:[], api:"" }
    health = models.CharField(max_length=256, blank=True, null=True)  # "/health" or URL
    twin_ref = models.CharField(max_length=200, blank=True, null=True)  # optional linked twin_id
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'registry_service'


class PortalEvent(models.Model):
    """Small event log to back the portal SSE without external broker.

    Not meant as durable bus; only for UI fan-out (lifecycle and small deltas).
    """
    id = models.BigAutoField(primary_key=True)
    tenant = models.CharField(max_length=200, db_index=True)
    etype = models.CharField(max_length=64)  # e.g., twin.update, twin.delete, service.update
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'portal_event'
