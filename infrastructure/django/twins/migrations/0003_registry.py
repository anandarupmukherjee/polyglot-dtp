from django.db import migrations, models
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('twins', '0002_accessgrant'),
    ]

    operations = [
        migrations.CreateModel(
            name='Twin',
            fields=[
                ('twin_id', models.CharField(max_length=200, primary_key=True, serialize=False)),
                ('tenant', models.CharField(blank=True, max_length=200, null=True)),
                ('metadata', models.JSONField(default=dict)),
                ('interfaces', models.JSONField(default=dict)),
                ('dependencies', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'registry_twin',
            },
        ),
        migrations.CreateModel(
            name='Service',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('tenant', models.CharField(blank=True, max_length=200, null=True)),
                ('category', models.CharField(max_length=32)),
                ('interfaces', models.JSONField(default=dict)),
                ('health', models.CharField(blank=True, max_length=256, null=True)),
                ('twin_ref', models.CharField(blank=True, max_length=200, null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'registry_service',
            },
        ),
        migrations.CreateModel(
            name='PortalEvent',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('tenant', models.CharField(db_index=True, max_length=200)),
                ('etype', models.CharField(max_length=64)),
                ('payload', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
            ],
            options={
                'db_table': 'portal_event',
            },
        ),
    ]

