# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core serializers audit rbac for Vitora HMIS.

What this file is for:
- Implement serializers audit rbac logic for the core domain.

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


class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for Django Permission model."""

    app_label = serializers.CharField(source="content_type.app_label", read_only=True)
    model = serializers.CharField(source="content_type.model", read_only=True)
    matrix_key = serializers.SerializerMethodField()
    matrix_action = serializers.SerializerMethodField()

    class Meta:
        """Meta options for PermissionSerializer."""

        model = Permission
        fields = ["id", "codename", "name", "app_label", "model", "matrix_key", "matrix_action"]
        read_only_fields = fields

    def get_matrix_key(self, obj) -> str | None:
        """Return the canonical PascalCase resource key used in permissions_matrix."""
        from hmis.apps.core.role_permissions_sync import get_matrix_key

        return get_matrix_key(obj.content_type.app_label, obj.content_type.model)

    def get_matrix_action(self, obj) -> str | None:
        """Return the canonical action key used in permissions_matrix (e.g. 'create', 'read', 'approve_emergency_access')."""
        from hmis.apps.core.role_permissions_sync import get_matrix_action

        return get_matrix_action(obj.codename, obj.content_type.model)


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for AuditLog model."""

    username = serializers.CharField(source="user.username", read_only=True, default="Anonymous")
    user_name = serializers.SerializerMethodField()
    facility_name = serializers.CharField(source="facility.name", read_only=True, default=None)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )

    class Meta:
        """Meta options for AuditLogSerializer."""

        model = AuditLog
        fields = [
            "id",
            "user",
            "username",
            "user_name",
            "action",
            "resource_type",
            "resource_id",
            "timestamp",
            "ip_address",
            "user_agent",
            "details",
            "patient_id",
            "facility",
            "facility_name",
            "organization",
            "organization_name",
            "sequence_number",
            "entry_hash",
            "previous_hash",
        ]
        read_only_fields = fields  # All fields are read-only

    def get_user_name(self, obj) -> str:
        """Return a friendly display name for the acting user."""
        if not obj.user:
            return "System"
        full_name = obj.user.get_full_name().strip()
        return full_name or obj.user.username


class FrontendEventSerializer(serializers.ModelSerializer):
    """
    Serializer for FrontendEvent model.

    Accepts events from frontend applications for logging user interactions.
    Supports both single event and batch event submission.
    """

    username = serializers.CharField(source="user.username", read_only=True, default="Anonymous")

    class Meta:
        """Meta options for FrontendEventSerializer."""

        model = FrontendEvent
        fields = [
            "id",
            "user",
            "username",
            "event_type",
            "resource_type",
            "resource_id",
            "client_timestamp",
            "server_timestamp",
            "session_id",
            "device_type",
            "details",
            "was_offline",
        ]
        read_only_fields = ["id", "user", "username", "server_timestamp"]

    def create(self, validated_data):
        """Set the user from the request context."""
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["user"] = request.user
        return super().create(validated_data)


class FrontendEventBatchSerializer(serializers.Serializer):
    """
    Serializer for batch frontend event submission.

    Allows submitting multiple events at once (useful for offline sync).
    """

    events = FrontendEventSerializer(many=True)

    def create(self, validated_data):
        """Create multiple events at once."""
        request = self.context.get("request")
        user = request.user if request and request.user.is_authenticated else None

        events = []
        for event_data in validated_data["events"]:
            event_data["user"] = user
            events.append(FrontendEvent(**event_data))

        return FrontendEvent.objects.bulk_create(events)


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
    department_type_display = serializers.CharField(
        source="get_department_type_display", read_only=True
    )
    facility_name = serializers.CharField(source="facility.name", read_only=True, default=None)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )

    class Meta:
        """Meta options for DepartmentSerializer."""

        model = Department
        fields = [
            "id",
            "code",
            "name",
            "description",
            "department_type",
            "department_type_display",
            "parent",
            "parent_name",
            "head",
            "head_name",
            "facility",
            "facility_name",
            "organization",
            "organization_name",
            "is_active",
            "staff_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "staff_count"]

    def get_head_name(self, obj) -> str | None:
        """Get department head name."""
        if obj.head:
            return obj.head.get_full_name()
        return None

    def get_staff_count(self, obj) -> int:
        """Get active staff count."""
        return obj.get_staff_count()


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for Role model."""

    parent_role_name = serializers.CharField(source="parent_role.name", read_only=True)
    django_group_name = serializers.CharField(source="django_group.name", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    scope_display = serializers.CharField(source="get_scope_display", read_only=True)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )
    facility_name = serializers.CharField(source="facility.name", read_only=True, default=None)

    class Meta:
        """Meta options for RoleSerializer."""

        model = Role
        fields = [
            "id",
            "code",
            "name",
            "category",
            "category_display",
            "description",
            "scope",
            "scope_display",
            "organization",
            "organization_name",
            "facility",
            "facility_name",
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

    # PII property fields (encrypted at rest)
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True, default="")
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True, default="")
    hwr_national_id = serializers.CharField(required=False, allow_blank=True, default="")

    user_username = serializers.CharField(source="user.username", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_first_name = serializers.CharField(source="user.first_name", read_only=True)
    user_last_name = serializers.CharField(source="user.last_name", read_only=True)
    full_name = serializers.SerializerMethodField()
    primary_role_name = serializers.CharField(source="primary_role.name", read_only=True)
    primary_department_name = serializers.CharField(
        source="primary_department.name", read_only=True
    )
    primary_facility_name = serializers.CharField(
        source="primary_facility.name", read_only=True, default=None
    )
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
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
            "primary_facility",
            "primary_facility_name",
            "secondary_facilities",
            "organization",
            "organization_name",
            "secondary_organizations",
            "hwr_id",
            "license_number",
            "license_expiry",
            "license_verified",
            "licensing_body",
            "is_license_valid",
            "specialization",
            "practice_type",
            "subspecialty",
            "discipline_name",
            "educational_qualifications",
            "hwr_status",
            "hwr_salutation",
            "identification_type",
            "postal_address",
            "hwr_national_id",
            "hwr_last_verified_at",
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
        read_only_fields = [
            "created_at",
            "updated_at",
            "is_license_valid",
            "organization",
            "hwr_last_verified_at",
        ]

    def get_full_name(self, obj) -> str:
        """Get full name with title."""
        return obj.get_full_name()

    def get_is_license_valid(self, obj) -> bool:
        """Check if license is valid."""
        return obj.is_license_valid()


class StaffProfileUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for admin/staff profile updates with user field aliases."""

    # PII property fields (encrypted at rest)
    phone_number = serializers.CharField(required=False, allow_blank=True, default="")
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True, default="")
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True, default="")
    hwr_national_id = serializers.CharField(required=False, allow_blank=True, default="")

    email = serializers.EmailField(source="user.email", required=False)
    first_name = serializers.CharField(source="user.first_name", required=False)
    last_name = serializers.CharField(source="user.last_name", required=False)
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

    class Meta:
        model = StaffProfile
        fields = [
            "title",
            "middle_name",
            "email",
            "first_name",
            "last_name",
            "employee_id",
            "primary_role",
            "role",
            "secondary_roles",
            "primary_department",
            "department",
            "secondary_departments",
            "primary_facility",
            "secondary_facilities",
            "secondary_organizations",
            "hwr_id",
            "license_number",
            "license_expiry",
            "license_verified",
            "licensing_body",
            "specialization",
            "practice_type",
            "subspecialty",
            "discipline_name",
            "educational_qualifications",
            "hwr_status",
            "hwr_salutation",
            "identification_type",
            "postal_address",
            "hwr_national_id",
            "phone_number",
            "emergency_contact_name",
            "emergency_contact_phone",
            "employment_status",
            "employment_type",
            "date_joined",
            "date_left",
            "supervisor",
        ]

    def validate(self, attrs):
        """Cross-field validation for facility-organization consistency."""
        attrs = super().validate(attrs)
        instance = self.instance
        primary_facility = attrs.get(
            "primary_facility", getattr(instance, "primary_facility", None)
        )
        if primary_facility and instance and instance.organization_id:
            if primary_facility.organization_id != instance.organization_id:
                raise serializers.ValidationError(
                    {
                        "primary_facility": (
                            "Primary facility must belong to the staff member's organization."
                        )
                    }
                )

        # Auto-set license_verified when HWR data is being populated
        if attrs.get("hwr_id") or attrs.get("hwr_national_id") or attrs.get("license_number"):
            attrs["license_verified"] = True
            from django.utils import timezone

            attrs["hwr_last_verified_at"] = timezone.now()

        return attrs

    def validate_email(self, value):
        """Validate email uniqueness for updates."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        instance = getattr(self, "instance", None)
        queryset = User.objects.filter(email__iexact=value)
        if instance is not None:
            queryset = queryset.exclude(pk=instance.user_id)
        if queryset.exists():
            raise serializers.ValidationError("This email is already registered.")
        return value.lower()

    def update(self, instance, validated_data):
        """Update related user fields and the staff profile in one request."""
        user_data = validated_data.pop("user", {})
        user = instance.user
        user_changed = False

        for field, value in user_data.items():
            if getattr(user, field) != value:
                setattr(user, field, value)
                user_changed = True

        if user_changed:
            user.save(update_fields=list(user_data.keys()))

        return super().update(instance, validated_data)


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
    employee_id = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True
    )
    must_change_password = serializers.BooleanField(required=False, default=True)
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
    primary_facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    hwr_id = serializers.CharField(max_length=50, required=False, allow_blank=True)
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    license_expiry = serializers.DateField(required=False, allow_null=True)
    licensing_body = serializers.CharField(max_length=100, required=False, allow_blank=True)
    specialization = serializers.CharField(max_length=100, required=False, allow_blank=True)
    practice_type = serializers.CharField(max_length=100, required=False, allow_blank=True)
    subspecialty = serializers.CharField(max_length=200, required=False, allow_blank=True)
    discipline_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    educational_qualifications = serializers.CharField(
        max_length=300, required=False, allow_blank=True
    )
    hwr_status = serializers.CharField(max_length=50, required=False, allow_blank=True)
    hwr_salutation = serializers.CharField(max_length=30, required=False, allow_blank=True)
    identification_type = serializers.CharField(max_length=50, required=False, allow_blank=True)
    postal_address = serializers.CharField(max_length=300, required=False, allow_blank=True)
    hwr_national_id = serializers.CharField(max_length=30, required=False, allow_blank=True)

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
        """Validate employee_id is unique (skip when blank so auto-generation works)."""
        if value and StaffProfile.objects.filter(employee_id=value).exists():
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
        must_change_password = validated_data.pop("must_change_password", True)

        # Generate a random password if not provided
        password_was_generated = False
        if not password:
            password = secrets.token_urlsafe(12)
            password_was_generated = True

        # Ensure date_joined has a default value
        if "date_joined" not in validated_data or validated_data.get("date_joined") is None:
            validated_data["date_joined"] = date.today()

        # Allow the model to auto-generate employee_id when blank/None
        employee_id = validated_data.get("employee_id")
        if not employee_id:
            validated_data.pop("employee_id", None)

        # Create the user
        user = User.objects.create_user(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            password=password,
        )

        # Generated passwords must force a reset on first login. Manual passwords
        # respect the admin's choice (default True for defense in depth).
        if password_was_generated:
            must_change_password = True
        validated_data["must_change_password"] = must_change_password

        # Create the staff profile
        staff_profile = StaffProfile.objects.create(user=user, **validated_data)

        # Stash temporary password on instance for the view to read (not persisted)
        staff_profile._temp_password = password
        staff_profile._password_was_generated = password_was_generated

        return staff_profile


class StaffPasswordResetSerializer(serializers.Serializer):
    """Serializer for admin-initiated staff password resets."""

    password = serializers.CharField(max_length=128, required=False, write_only=True)
    must_change_password = serializers.BooleanField(required=False, default=True)
    send_email = serializers.BooleanField(required=False, default=False)

    def validate_password(self, value):
        """Reject common weak passwords when set manually."""
        if value and len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters.")
        return value


class OrgChartSummarySerializer(serializers.Serializer):
    """Summary metrics for the organization chart payload."""

    department_count = serializers.IntegerField()
    staff_count = serializers.IntegerField()
    root_department_count = serializers.IntegerField()
    department_heads_count = serializers.IntegerField()
    supervisor_link_count = serializers.IntegerField()


class OrgChartPayloadSerializer(serializers.Serializer):
    """Serializer for the department org chart endpoint."""

    departments = DepartmentSerializer(many=True)
    staff = StaffProfileSerializer(many=True)
    summary = OrgChartSummarySerializer()


class UserPermissionsSerializer(serializers.Serializer):
    """Serializer for the current user's permission list."""

    permissions = serializers.ListField(child=serializers.CharField())


class UsernameCheckResponseSerializer(serializers.Serializer):
    """Response serializer for username availability checks."""

    username = serializers.CharField()
    available = serializers.BooleanField()
    suggestions = serializers.ListField(child=serializers.CharField())


class UsernameSuggestionRequestSerializer(serializers.Serializer):
    """Request serializer for username suggestions."""

    first_name = serializers.CharField()
    last_name = serializers.CharField()
    middle_name = serializers.CharField(required=False, allow_blank=True)


class UsernameSuggestionResponseSerializer(serializers.Serializer):
    """Response serializer for username suggestions."""

    suggestions = serializers.ListField(child=serializers.CharField())


# ============================================================================
# Notification Serializers (Phase 2.3 - Notification System)
# ============================================================================


class CodeSystemSerializer(serializers.ModelSerializer):
    """
    Serializer for CodeSystem model (read-only).

    Provides a registry of code systems used in Vitora for FHIR compliance
    and self-documenting API responses.
    """

    class Meta:
        """Meta options for CodeSystemSerializer."""

        model = CodeSystem
        fields = [
            "id",
            "slug",
            "name",
            "uri",
            "version",
            "publisher",
            "description",
            "is_internal",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


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


class FeatureFlagSerializer(serializers.ModelSerializer):
    """Read-only serializer for feature flags."""

    class Meta:
        model = FeatureFlag
        fields = ["id", "name", "is_enabled", "description"]
        read_only_fields = fields


class PushSubscriptionSerializer(serializers.ModelSerializer):
    """Serializer for Web Push subscription registration."""

    class Meta:
        model = PushSubscription
        fields = ["id", "endpoint", "p256dh", "auth", "created_at"]
        read_only_fields = ["id", "created_at"]


# ============================================================================
# Subscription Plan Serializers (SaaS Licensing)
# ============================================================================
