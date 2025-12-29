"""
Serializers for core app.
"""

from rest_framework import serializers

from .models import AuditLog, County, SubCounty, Ward


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


class CountySerializer(serializers.ModelSerializer):
    """Serializer for County model."""

    class Meta:
        """Meta options for CountySerializer."""

        model = County
        fields = ["id", "code", "name"]
        read_only_fields = fields


class SubCountySerializer(serializers.ModelSerializer):
    """Serializer for SubCounty model."""

    county_name = serializers.CharField(source="county.name", read_only=True)

    class Meta:
        """Meta options for SubCountySerializer."""

        model = SubCounty
        fields = ["id", "county", "county_name", "name"]
        read_only_fields = fields


class WardSerializer(serializers.ModelSerializer):
    """Serializer for Ward model."""

    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)

    class Meta:
        """Meta options for WardSerializer."""

        model = Ward
        fields = ["id", "sub_county", "sub_county_name", "name"]
        read_only_fields = fields
