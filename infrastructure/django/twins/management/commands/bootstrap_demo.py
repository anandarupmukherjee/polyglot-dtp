import os
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from twins.models import (
    TwinUI,
    AccessGrant,
    Twin,
    BootstrapState,
)


class Command(BaseCommand):
    help = "Seed default portal users, twins and grants once."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Reapply the bootstrap even if it has been run before.",
        )

    def handle(self, *args, **options):
        force = options.get("force", False)
        if BootstrapState.objects.filter(key="demo_seed").exists() and not force:
            self.stdout.write(self.style.NOTICE("Demo bootstrap already applied; skipping."))
            return

        if force:
            BootstrapState.objects.filter(key="demo_seed").delete()

        self.stdout.write("Applying demo bootstrap...")
        created_uis = []
        with transaction.atomic():
            demo_email = "demo@example.com"
            demo_password = os.getenv("DJANGO_DEMO_PASSWORD", "demo12345")
            demo_user, created = User.objects.get_or_create(
                username=demo_email,
                defaults={"email": demo_email},
            )
            if created:
                demo_user.set_password(demo_password)
                demo_user.save()

            admin_user = os.getenv("DJANGO_ADMIN_USER", "admin@example.com")
            admin_password = os.getenv("DJANGO_ADMIN_PASSWORD", "admin12345")
            if not User.objects.filter(username=admin_user).exists():
                User.objects.create_superuser(
                    username=admin_user,
                    email=admin_user,
                    password=admin_password,
                )

            if not TwinUI.objects.exists():
                created_uis.extend(
                    [
                        TwinUI.objects.create(name="Room 1", ui_url="http://localhost:7474"),
                        TwinUI.objects.create(name="Room 2", ui_url="http://localhost:7474"),
                    ]
                )

            lift_ui, created = TwinUI.objects.get_or_create(
                name="Lift Maintenance",
                defaults={"ui_url": "http://localhost:3001"},
            )
            if created:
                created_uis.append(lift_ui)

            energy_defaults = {
                "ui_url": "http://localhost:3002",
                "dtr_id": "dt:EnergyHVAC_001",
            }
            energy_ui, created = TwinUI.objects.get_or_create(
                name="Energy & HVAC",
                defaults=energy_defaults,
            )
            if created:
                created_uis.append(energy_ui)
            else:
                # ensure dtr_id is populated without overwriting custom ui_url changes
                updated = False
                if not energy_ui.dtr_id:
                    energy_ui.dtr_id = energy_defaults["dtr_id"]
                    updated = True
                if updated:
                    energy_ui.save(update_fields=["dtr_id"])

            # Seed sample registry twins only when they do not exist yet
            self._ensure_twin(
                "dt:Lift_001",
                {
                    "tenant": "demo",
                    "metadata": {"status": "instantiated", "domain": ["Lift"]},
                    "interfaces": {
                        "data_streams": ["MQTT:dtp/lift/alerts"],
                        "api": "http://localhost:3001",
                    },
                    "dependencies": {"static": [], "dynamic": []},
                },
                force=force,
            )
            self._ensure_twin(
                "dt:EnergyHVAC_001",
                {
                    "tenant": "demo",
                    "metadata": {"status": "instantiated", "domain": ["Energy", "HVAC"]},
                    "interfaces": {
                        "data_streams": ["MQTT:dtp/energy_hvac/events"],
                        "api": "http://localhost:3002",
                    },
                    "dependencies": {"static": [], "dynamic": []},
                },
                force=force,
            )
            self._ensure_twin(
                "dt:RoomSensor_101",
                {
                    "tenant": "demo",
                    "metadata": {"status": "instantiated", "domain": ["Temperature"]},
                    "interfaces": {
                        "data_streams": ["MQTT:dtp/sensors/room1/temp"],
                        "api": "http://localhost:8086",
                    },
                    "dependencies": {"static": [], "dynamic": []},
                },
                force=force,
            )
            self._ensure_twin(
                "dt:RoomSensor_102",
                {
                    "tenant": "demo",
                    "metadata": {"status": "instantiated", "domain": ["Temperature"]},
                    "interfaces": {
                        "data_streams": ["MQTT:dtp/sensors/room2/temp"],
                        "api": "http://localhost:8086",
                    },
                    "dependencies": {"static": [], "dynamic": []},
                },
                force=force,
            )

            for ui in created_uis:
                if not AccessGrant.objects.filter(twin=ui).exists():
                    for user in User.objects.all():
                        AccessGrant.objects.get_or_create(user=user, twin=ui)

        BootstrapState.objects.update_or_create(
            key="demo_seed",
            defaults={"notes": "Demo bootstrap applied"},
        )
        self.stdout.write(self.style.SUCCESS("Demo bootstrap complete."))

    def _ensure_twin(self, twin_id: str, defaults: dict, force: bool = False):
        if force:
            Twin.objects.update_or_create(twin_id=twin_id, defaults=defaults)
            return
        Twin.objects.get_or_create(twin_id=twin_id, defaults=defaults)
