"""
Serializers for core app.
"""

from rest_framework import serializers

from .models import AuditLog, County, Department, Role, StaffProfile, SubCounty, Ward


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


# ============================================================================
# RBAC Serializers (Sprint 1.1-1.2 Track C - Phase 5)
# ============================================================================


class DepartmentSerializer(serializers.ModelSerializer):
    """Serializer for Department model."""

    parent_name = serializers.CharField(source="parent.name", read_only=True)
    head_name = serializers.SerializerMethodField()
    staff_count = serializers.SerializerMethodField()

    class Meta:
        """Meta options for DepartmentSerializer."""

        model = Department
        fields = [
            "id",
            "code",
            "name",
            "department_type",
            "parent",
            "parent_name",
            "head",
            "head_name",
            "staff_count",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "staff_count"]

    def get_head_name(self, obj):
        """Get department head name."""
        if obj.head:
            return obj.head.get_full_name()
        return None

    def get_staff_count(self, obj):
        """Get active staff count."""
        return obj.get_staff_count()


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for Role model."""

    parent_role_name = serializers.CharField(source="parent_role.name", read_only=True)
    django_group_name = serializers.CharField(source="django_group.name", read_only=True)

    class Meta:
        """Meta options for RoleSerializer."""

        model = Role
        fields = [
            "id",
            "code",
            "name",
            "category",
            "description",
            "permissions_matrix",
            "hierarchy_level",
            "parent_role",
            "parent_role_name",
            "django_group",
            "django_group_name",
            "requires_license",
            "license_body",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class StaffProfileSerializer(serializers.ModelSerializer):
    """Serializer for StaffProfile model."""

    user_username = serializers.CharField(source="user.username", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_first_name = serializers.CharField(source="user.first_name", read_only=True)
    user_last_name = serializers.CharField(source="user.last_name", read_only=True)
    full_name = serializers.SerializerMethodField()
    primary_role_name = serializers.CharField(source="primary_role.name", read_only=True)
    primary_department_name = serializers.CharField(source="primary_department.name", read_only=True)
    is_license_valid = serializers.SerializerMethodField()

    class Meta:
        """Meta options for StaffProfileSerializer."""

        model = StaffProfile
        fields = [
            "id",
            "user",
            "user_username",
            "user_email",
            "user_first_name",
            "user_last_name",
            "full_name",
            "employee_id",
            "title",
            "primary_role",
            "primary_role_name",
            "secondary_roles",
            "primary_department",
            "primary_department_name",
            "secondary_departments",
            "license_number",
            "license_expiry",
            "license_verified",
            "is_license_valid",
            "specialization",
            "phone_number",
            "emergency_contact_name",
            "emergency_contact_phone",
            "employment_status",
            "date_joined",
            "date_left",
            "supervisor",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "is_license_valid"]

    def get_full_name(self, obj):
        """Get full name with title."""
        return obj.get_full_name()

    def get_is_license_valid(self, obj):
        """Check if license is valid."""
        return obj.is_license_valid()
