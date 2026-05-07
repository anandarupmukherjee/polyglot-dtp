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


class ServiceAccessGrant(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    service = models.ForeignKey("Service", on_delete=models.CASCADE)

    class Meta:
        db_table = 'user_service_map'
        unique_together = ('user', 'service')


class Twin(models.Model):
    """Digital Twin Registry entry (minimal RA envelope).

    Stores identity (@id), tenant, lifecycle/metadata, declared interfaces and dependencies.
    """
    twin_id = models.CharField(max_length=200, primary_key=True)  # e.g. "dt:RoomSensor_101"
    tenant = models.CharField(max_length=200, blank=True, null=True)
    metadata = models.JSONField(default=dict)  # includes status, domain, etc.
    interfaces = models.JSONField(default=dict)  # { data_streams:[], api:"" }
    dependencies = models.JSONField(default=dict)  # { static:[], dynamic:[] }
    created_at = models.DateTimeField(auto_now_add=True)
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
    created_at = models.DateTimeField(auto_now_add=True)
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


class BootstrapState(models.Model):
    key = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'bootstrap_state'


class TwinRegistration(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('validating', 'Validating'),
        ('building', 'Building'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]
    MODE_CHOICES = [
        ('platform', 'Platform-Hosted'),
        ('external', 'External/Self-Hosted'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    mode = models.CharField(max_length=16, choices=MODE_CHOICES)
    twin_name = models.CharField(max_length=200)
    twin_id_requested = models.CharField(max_length=200, blank=True)
    tenant = models.CharField(max_length=200, default='demo')
    domain_tags = models.JSONField(default=list)

    # Mode A: platform-hosted
    github_url = models.URLField(blank=True, null=True)
    upload_path = models.CharField(max_length=512, blank=True, null=True)

    # Mode B: external / self-hosted
    external_api_url = models.URLField(blank=True, null=True)
    mqtt_broker_host = models.CharField(max_length=256, blank=True, null=True)
    mqtt_broker_port = models.IntegerField(default=1883, blank=True, null=True)
    mqtt_topics = models.JSONField(default=list)
    data_streams = models.JSONField(default=list)

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    status_detail = models.TextField(blank=True, null=True)
    build_log = models.TextField(blank=True, null=True)
    resulting_twin_id = models.CharField(max_length=200, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'twin_registration'


class TwinSynthesis(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('locked', 'Locked'),
        ('building', 'Building'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    canvas_state = models.JSONField(default=dict)
    wiring = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    build_log = models.TextField(blank=True, null=True)
    resulting_twin_id = models.CharField(max_length=200, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'twin_synthesis'


class ProcessModel(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('locked', 'Locked'),
        ('built', 'Built'),
        ('failed', 'Failed'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    canvas_state = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    sim_config = models.JSONField(default=dict)
    sim_results = models.JSONField(default=dict)
    sim_log = models.TextField(blank=True, null=True)
    resulting_twin_id = models.CharField(max_length=200, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'process_model'
