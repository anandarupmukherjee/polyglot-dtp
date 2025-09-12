from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("twins", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccessGrant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("twin", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="twins.twinui")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="auth.user")),
            ],
            options={
                "db_table": "user_twin_map",
                "unique_together": {("user", "twin")},
            },
        ),
    ]

