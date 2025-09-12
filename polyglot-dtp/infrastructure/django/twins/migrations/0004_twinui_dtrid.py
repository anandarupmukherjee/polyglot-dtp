from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('twins', '0003_registry'),
    ]

    operations = [
        migrations.AddField(
            model_name='twinui',
            name='dtr_id',
            field=models.CharField(max_length=200, blank=True, null=True),
        ),
    ]

