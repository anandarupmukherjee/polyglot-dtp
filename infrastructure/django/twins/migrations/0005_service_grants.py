from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("twins", "0004_twinui_dtrid"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.CreateModel(
            name="ServiceAccessGrant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("service", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="twins.service")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="auth.user")),
            ],
            options={
                "db_table": "user_service_map",
                "unique_together": {("user", "service")},
            },
        ),
        migrations.CreateModel(
            name="BootstrapState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("notes", models.CharField(blank=True, max_length=255, null=True)),
            ],
            options={
                "db_table": "bootstrap_state",
            },
        ),
    ]
