from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.CreateModel(
            name="TwinUI",
            fields=[
                ("twin_id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("name", models.CharField(max_length=200)),
                ("ui_url", models.URLField()),
            ],
            options={"db_table": "twin_ui"},
        ),
        migrations.CreateModel(
            name="UserTwin",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("twin", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="twins.twinui")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="auth.user")),
            ],
            options={"db_table": "user_twin", "unique_together": {("user", "twin")}},
        ),
    ]

