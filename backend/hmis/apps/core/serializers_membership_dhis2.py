# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core serializers membership dhis2 for Vitora HMIS.

What this file is for:
- Implement serializers membership dhis2 logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

"""
Serializers for core app.
"""

from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    AuditLog,
    CertificateAuthority,
    CertificateRevocation,
    CodeSystem,
    County,
    Department,
    DHIS2Config,
    DocumentShare,
    DocumentSignature,
    Facility,
    FeatureFlag,
    FrontendEvent,
    Notification,
    Organization,
    OrgMembership,
    PushSubscription,
    Role,
    StaffInvitation,
    StaffProfile,
    SubCounty,
    SubscriptionPlan,
    UserCertificate,
    Ward,
)


class OrgMembershipSerializer(serializers.ModelSerializer):
    """Read serializer for OrgMembership — includes nested org/role/dept names."""

    organization_name = serializers.CharField(source="organization.name", read_only=True)
    role_code = serializers.CharField(source="role.code", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    facility_ids = serializers.SerializerMethodField()
    facilities_detail = serializers.SerializerMethodField()
    staff_name = serializers.CharField(source="staff_profile.get_full_name", read_only=True)

    class Meta:
        model = OrgMembership
        fields = [
            "id",
            "staff_profile",
            "staff_name",
            "organization",
            "organization_name",
            "role",
            "role_code",
            "role_name",
            "department",
            "department_name",
            "facilities_detail",
            "facility_ids",
            "is_primary",
            "status",
            "joined_at",
            "invited_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_facility_ids(self, obj) -> list[int]:
        return list(obj.facilities.values_list("pk", flat=True))

    def get_facilities_detail(self, obj) -> list[dict]:
        return list(obj.facilities.values("id", "name", "mfl_code"))


class OrgMembershipCreateSerializer(serializers.ModelSerializer):
    """Write serializer for OrgMembership."""

    staff_profile = serializers.PrimaryKeyRelatedField(queryset=StaffProfile.objects.all())
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(), required=False
    )

    class Meta:
        model = OrgMembership
        fields = [
            "staff_profile",
            "organization",
            "role",
            "department",
            "facilities",
            "is_primary",
            "status",
        ]

    def validate(self, data):
        """Validate facilities belong to the target org."""
        org = data.get("organization")
        if org is None and self.instance is not None:
            org = self.instance.organization

        request = self.context.get("request")
        request_org = getattr(request, "organization", None) if request else None
        if request_org is not None:
            if org is None:
                org = request_org
                data["organization"] = request_org
            elif org.pk != request_org.pk:
                raise serializers.ValidationError(
                    {"organization": "Membership organization must match the active organization."}
                )

        facilities = data.get("facilities", [])
        if org and facilities:
            bad = [f.name for f in facilities if f.organization_id != org.pk]
            if bad:
                raise serializers.ValidationError(
                    {
                        "facilities": (
                            f"These facilities do not belong to {org.name}: {', '.join(bad)}"
                        )
                    }
                )
        return data


# =============================================================================
# DHIS2 Configuration Serializers
# =============================================================================


class DHIS2ConfigListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for DHIS2 config list views."""

    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )

    class Meta:
        model = DHIS2Config
        fields = [
            "id",
            "organization",
            "organization_name",
            "name",
            "base_url",
            "username",
            "environment",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class DHIS2ConfigDetailSerializer(serializers.ModelSerializer):
    """Full serializer for DHIS2 config detail — excludes password."""

    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )

    class Meta:
        model = DHIS2Config
        fields = [
            "id",
            "organization",
            "organization_name",
            "name",
            "base_url",
            "username",
            "environment",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at"]


class DHIS2ConfigCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating / updating DHIS2 configs.

    Accepts ``password`` as a write-only plaintext field.
    """

    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = DHIS2Config
        fields = [
            "organization",
            "name",
            "base_url",
            "username",
            "password",
            "environment",
            "is_active",
        ]

    def create(self, validated_data: dict) -> DHIS2Config:
        password = validated_data.pop("password")
        instance = DHIS2Config(**validated_data)
        instance.set_password(password)
        instance.save()
        return instance

    def update(self, instance: DHIS2Config, validated_data: dict) -> DHIS2Config:
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class DHIS2ConfigUpdateSerializer(serializers.ModelSerializer):
    """Serializer for partial updates — password is optional."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = DHIS2Config
        fields = [
            "name",
            "base_url",
            "username",
            "password",
            "environment",
            "is_active",
        ]

    def update(self, instance: DHIS2Config, validated_data: dict) -> DHIS2Config:
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
