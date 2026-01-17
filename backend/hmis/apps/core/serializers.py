"""
Serializers for core app.
"""

from django.contrib.auth.models import Permission
from rest_framework import serializers

from .models import AuditLog, County, Department, Notification, Role, StaffProfile, SubCounty, Ward


class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for Django Permission model."""

    app_label = serializers.CharField(source="content_type.app_label", read_only=True)
    model = serializers.CharField(source="content_type.model", read_only=True)

    class Meta:
        """Meta options for PermissionSerializer."""

        model = Permission
        fields = ["id", "codename", "name", "app_label", "model"]
        read_only_fields = fields


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
    primary_department_name = serializers.CharField(
        source="primary_department.name", read_only=True
    )
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
            "middle_name",
            "primary_role",
            "primary_role_name",
            "secondary_roles",
            "primary_department",
            "primary_department_name",
            "secondary_departments",
            "hwr_id",
            "license_number",
            "license_expiry",
            "license_verified",
            "licensing_body",
            "is_license_valid",
            "specialization",
            "phone_number",
            "emergency_contact_name",
            "emergency_contact_phone",
            "employment_status",
            "employment_type",
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


class StaffProfileCreateSerializer(serializers.Serializer):
    """
    Serializer for creating a StaffProfile with a new User.

    This handles the combined creation of a User account and StaffProfile.
    """

    # User fields
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, required=False, write_only=True)

    # StaffProfile fields
    employee_id = serializers.CharField(max_length=20)
    middle_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        source="primary_department",
    )
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        source="primary_role",
    )
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    hwr_id = serializers.CharField(max_length=50, required=False, allow_blank=True)
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    license_expiry = serializers.DateField(required=False, allow_null=True)
    licensing_body = serializers.CharField(max_length=100, required=False, allow_blank=True)
    specialization = serializers.CharField(max_length=100, required=False, allow_blank=True)
    hire_date = serializers.DateField(required=False, allow_null=True, source="date_joined")

    def validate_username(self, value):
        """Validate username is unique."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value.lower()

    def validate_email(self, value):
        """Validate email is unique."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value.lower()

    def validate_employee_id(self, value):
        """Validate employee_id is unique."""
        if StaffProfile.objects.filter(employee_id=value).exists():
            raise serializers.ValidationError("This employee ID is already in use.")
        return value

    def create(self, validated_data):
        """Create User and StaffProfile together."""
        import secrets
        from datetime import date

        from django.contrib.auth import get_user_model

        User = get_user_model()

        # Extract user fields
        username = validated_data.pop("username")
        email = validated_data.pop("email")
        first_name = validated_data.pop("first_name")
        last_name = validated_data.pop("last_name")
        password = validated_data.pop("password", None)

        # Generate a random password if not provided
        if not password:
            password = secrets.token_urlsafe(12)

        # Ensure date_joined has a default value
        if "date_joined" not in validated_data or validated_data.get("date_joined") is None:
            validated_data["date_joined"] = date.today()

        # Create the user
        user = User.objects.create_user(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            password=password,
        )

        # Create the staff profile
        staff_profile = StaffProfile.objects.create(user=user, **validated_data)

        return staff_profile


# ============================================================================
# Notification Serializers (Phase 2.3 - Notification System)
# ============================================================================


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for Notification model."""

    class Meta:
        """Meta options for NotificationSerializer."""

        model = Notification
        fields = [
            "id",
            "notification_type",
            "priority",
            "title",
            "message",
            "related_model",
            "related_id",
            "action_url",
            "is_read",
            "read_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "notification_type",
            "priority",
            "title",
            "message",
            "related_model",
            "related_id",
            "action_url",
            "created_at",
        ]
