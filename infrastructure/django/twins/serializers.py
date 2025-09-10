from rest_framework import serializers
from .models import TwinUI


class TwinUISerializer(serializers.ModelSerializer):
    class Meta:
        model = TwinUI
        fields = ["twin_id", "name", "ui_url"]

