import uuid
from django.db import models
from django.contrib.auth.models import User


class TwinUI(models.Model):
    twin_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    ui_url = models.URLField()

    class Meta:
        db_table = 'twin_ui'


class UserTwin(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    twin = models.ForeignKey(TwinUI, on_delete=models.CASCADE)

    class Meta:
        db_table = 'user_twin'
        unique_together = ('user', 'twin')

