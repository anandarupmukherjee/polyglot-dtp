from rest_framework import serializers
from .models import TwinUI, Twin, Service


class TwinUISerializer(serializers.ModelSerializer):
    class Meta:
        model = TwinUI
        fields = ["twin_id", "name", "ui_url", "dtr_id"]


class TwinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Twin
        fields = [
            "twin_id",
            "tenant",
            "metadata",
            "interfaces",
            "dependencies",
            "created_at",
            "updated_at",
        ]


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = [
            "id",
            "name",
            "tenant",
            "category",
            "interfaces",
            "health",
            "twin_ref",
            "created_at",
            "updated_at",
        ]
