"""
Serializers for core app.
"""

from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for AuditLog model."""

    username = serializers.CharField(source="user.username", read_only=True, default="Anonymous")

    class Meta:
        """Meta options for AuditLogSerializer."""

        model = AuditLog
        fields = [
            "id",
            "user",
            "username",
            "action",
            "resource_type",
            "resource_id",
            "timestamp",
            "ip_address",
            "user_agent",
            "details",
            "patient_id",
        ]
        read_only_fields = fields  # All fields are read-only
