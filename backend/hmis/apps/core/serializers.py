"""
Serializers for core app.
"""

from django.contrib.auth.models import Permission
from rest_framework import serializers

from .models import (
    AuditLog,
    CertificateAuthority,
    CertificateRevocation,
    CodeSystem,
    County,
    Department,
    DHIS2Config,
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

    class Meta:
        """Meta options for PermissionSerializer."""

        model = Permission
        fields = ["id", "codename", "name", "app_label", "model"]
        read_only_fields = fields


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
        read_only_fields = ["created_at", "updated_at", "is_license_valid", "organization"]

    def get_full_name(self, obj) -> str:
        """Get full name with title."""
        return obj.get_full_name()

    def get_is_license_valid(self, obj) -> bool:
        """Check if license is valid."""
        return obj.is_license_valid()


class StaffProfileUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for admin/staff profile updates with user field aliases."""

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
        password_was_generated = False
        if not password:
            password = secrets.token_urlsafe(12)
            password_was_generated = True

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

        # Set must_change_password for direct creation
        validated_data["must_change_password"] = True

        # Create the staff profile
        staff_profile = StaffProfile.objects.create(user=user, **validated_data)

        # Stash temporary password on instance for the view to read (not persisted)
        staff_profile._temp_password = password
        staff_profile._password_was_generated = password_was_generated

        return staff_profile


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


class SubscriptionPlanListSerializer(serializers.ModelSerializer):
    """Compact serializer for subscription plan list views."""

    code_display = serializers.CharField(source="get_code_display", read_only=True)
    has_trial = serializers.BooleanField(read_only=True)

    class Meta:
        model = SubscriptionPlan
        fields = [
            "id",
            "code",
            "code_display",
            "name",
            "monthly_price",
            "annual_price",
            "max_facilities",
            "max_users",
            "monthly_ai_tokens",
            "is_active",
            "sort_order",
            "has_trial",
        ]
        read_only_fields = ["id"]


class SubscriptionPlanDetailSerializer(serializers.ModelSerializer):
    """Full serializer for subscription plan detail / update views."""

    code_display = serializers.CharField(source="get_code_display", read_only=True)
    annual_savings = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    has_trial = serializers.BooleanField(read_only=True)

    class Meta:
        model = SubscriptionPlan
        fields = [
            "id",
            "code",
            "code_display",
            "name",
            "description",
            # Pricing
            "monthly_price",
            "annual_price",
            "annual_savings",
            # Limits
            "max_facilities",
            "max_users",
            "max_patients",
            "monthly_ai_tokens",
            # Features
            "features",
            # Display & Status
            "is_active",
            "sort_order",
            "trial_period_days",
            "has_trial",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "annual_savings",
            "has_trial",
            "created_at",
            "updated_at",
        ]


class SubscriptionPlanCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new subscription plan."""

    class Meta:
        model = SubscriptionPlan
        fields = [
            "code",
            "name",
            "description",
            "monthly_price",
            "annual_price",
            "max_facilities",
            "max_users",
            "max_patients",
            "monthly_ai_tokens",
            "features",
            "is_active",
            "sort_order",
            "trial_period_days",
        ]

    def validate_code(self, value):
        if SubscriptionPlan.objects.filter(code=value).exists():
            raise serializers.ValidationError(f"A plan with code '{value}' already exists.")
        return value


# ============================================================================
# Organization Serializers (Multitenancy – Phase 1)
# ============================================================================


class OrganizationListSerializer(serializers.ModelSerializer):
    """Compact serializer for organization list views."""

    facility_count = serializers.IntegerField(read_only=True, default=0)
    staff_count = serializers.IntegerField(read_only=True, default=0)
    county_name = serializers.CharField(source="county.name", read_only=True, default=None)
    plan_name = serializers.CharField(source="subscription_plan.name", read_only=True, default=None)

    class Meta:
        """Meta options for OrganizationListSerializer."""

        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "subscription_tier",
            "subscription_plan",
            "plan_name",
            "is_active",
            "county_name",
            "facility_count",
            "staff_count",
        ]
        read_only_fields = ["id", "subscription_tier", "facility_count", "staff_count", "plan_name"]


class OrganizationDetailSerializer(serializers.ModelSerializer):
    """Full serializer for organization detail / create / update views."""

    facility_count = serializers.IntegerField(read_only=True, default=0)
    staff_count = serializers.IntegerField(read_only=True, default=0)
    county_name = serializers.CharField(source="county.name", read_only=True, default=None)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True, default=None)
    plan_name = serializers.CharField(source="subscription_plan.name", read_only=True, default=None)
    plan_features = serializers.JSONField(
        source="subscription_plan.features", read_only=True, default=dict
    )
    can_add_facility = serializers.BooleanField(read_only=True)
    can_add_user = serializers.BooleanField(read_only=True)
    can_add_patient = serializers.BooleanField(read_only=True)
    is_subscription_expired = serializers.BooleanField(read_only=True)
    ai_tokens_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        """Meta options for OrganizationDetailSerializer."""

        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "logo",
            # Contact
            "contact_email",
            "contact_phone",
            "address",
            # Location
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            # Subscription
            "subscription_plan",
            "plan_name",
            "plan_features",
            "subscription_tier",
            "max_facilities",
            "max_users",
            "max_patients",
            # Limit checks
            "can_add_facility",
            "can_add_user",
            "can_add_patient",
            # Subscription validity
            "subscription_status",
            "subscription_valid_until",
            "is_subscription_expired",
            # AI token usage
            "monthly_ai_tokens",
            "ai_tokens_used",
            "ai_tokens_remaining",
            "ai_tokens_reset_at",
            # Compliance
            "data_retention_years",
            # Config
            "settings",
            # Status
            "is_active",
            # Computed
            "facility_count",
            "staff_count",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "subscription_tier",
            "max_facilities",
            "max_users",
            "max_patients",
            "monthly_ai_tokens",
            "facility_count",
            "staff_count",
            "plan_name",
            "plan_features",
            "can_add_facility",
            "can_add_user",
            "can_add_patient",
            "is_subscription_expired",
            "ai_tokens_remaining",
            "created_at",
            "updated_at",
        ]


# ============================================================================
# Facility Serializers (RBAC Capability Plan – Phase 1)
# ============================================================================


class FacilityListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for facility list views.

    Returns essential identification and location data without the full
    module capability matrix, keeping list payloads compact.  The
    ``county_name`` and ``sub_county_name`` source fields are included so
    the frontend can display human-readable location text without an
    extra lookup.
    """

    county_name = serializers.CharField(source="county.name", read_only=True)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )

    class Meta:
        """Meta options for FacilityListSerializer."""

        model = Facility
        fields = [
            "id",
            "organization",
            "organization_name",
            "mfl_code",
            "name",
            "level",
            "ownership",
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "is_headquarters",
            "branch_code",
            "sha_contracted",
            "is_active",
        ]
        read_only_fields = ["id"]


class FacilityDetailSerializer(serializers.ModelSerializer):
    """
    Full serializer for facility detail / retrieve views.

    Includes the complete module capability map (``modules``) as a nested
    dictionary, plus resolved location names.  ``enabled_module_names``
    provides a convenience list of only the enabled modules for quick
    frontend rendering.

    ``effective_logo_url`` returns the facility's own logo URL if set,
    otherwise falls back to the parent organization's logo URL.
    """

    county_name = serializers.CharField(source="county.name", read_only=True)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)
    ward_name = serializers.CharField(source="ward.name", read_only=True, default=None)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=None
    )
    modules = serializers.DictField(read_only=True)
    enabled_module_names = serializers.ListField(child=serializers.CharField(), read_only=True)
    effective_logo_url = serializers.SerializerMethodField()

    class Meta:
        """Meta options for FacilityDetailSerializer."""

        model = Facility
        fields = [
            "id",
            "organization",
            "organization_name",
            "mfl_code",
            "name",
            "level",
            "ownership",
            "is_headquarters",
            "branch_code",
            "logo",
            "effective_logo_url",
            # Location
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "ward",
            "ward_name",
            # SHA
            "sha_contracted",
            "sha_contract_expiry",
            "sha_facility_code",
            # DHIS2
            "dhis2_org_unit",
            # Modules
            "modules",
            "enabled_module_names",
            # Individual module flags (for admin editing)
            "has_outpatient",
            "has_inpatient",
            "has_emergency",
            "has_pharmacy",
            "has_laboratory",
            "has_imaging",
            "has_theatre",
            "has_dialysis",
            "has_icu",
            "has_maternity",
            "has_mortuary",
            "has_blood_bank",
            "has_inventory",
            "has_lis_standalone",
            "has_triage",
            "has_scheduling",
            "has_surveillance",
            "has_immunizations",
            "has_allied_health",
            "has_quality",
            "has_billing",
            # Status & timestamps
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "modules",
            "enabled_module_names",
            "effective_logo_url",
            "created_at",
            "updated_at",
        ]

    def get_effective_logo_url(self, obj) -> str | None:
        """Return the effective logo URL (facility logo or organization fallback)."""
        effective = obj.effective_logo
        if effective:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(effective.url)
            return effective.url
        return None


class FacilityCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new facility.

    Accepts all writable fields.  Validates that ``sub_county`` belongs to
    the chosen ``county``, and that ``ward`` (when provided) belongs to
    the chosen ``sub_county``.

    If no module flags are explicitly set, the ``create`` method will
    apply the KEPH-level defaults via ``Facility.default_modules_for_level``.
    """

    class Meta:
        """Meta options for FacilityCreateSerializer."""

        model = Facility
        fields = [
            "organization",
            "mfl_code",
            "name",
            "level",
            "ownership",
            "is_headquarters",
            "branch_code",
            # Location
            "county",
            "sub_county",
            "ward",
            # SHA
            "sha_contracted",
            "sha_contract_expiry",
            "sha_facility_code",
            # DHIS2
            "dhis2_org_unit",
            # Modules
            "has_outpatient",
            "has_inpatient",
            "has_emergency",
            "has_pharmacy",
            "has_laboratory",
            "has_imaging",
            "has_theatre",
            "has_dialysis",
            "has_icu",
            "has_maternity",
            "has_mortuary",
            "has_blood_bank",
            "has_inventory",
            "has_lis_standalone",
            "has_triage",
            "has_scheduling",
            "has_surveillance",
            "has_immunizations",
            "has_allied_health",
            "has_quality",
            "has_billing",
            # Status
            "is_active",
        ]

    def validate(self, attrs: dict) -> dict:
        """
        Cross-field validation for location hierarchy consistency.

        Ensures:
        * ``sub_county`` belongs to ``county``.
        * ``ward`` (if given) belongs to ``sub_county``.
        """
        county = attrs.get("county")
        sub_county = attrs.get("sub_county")
        ward = attrs.get("ward")

        if county and sub_county and sub_county.county_id != county.id:
            raise serializers.ValidationError(
                {"sub_county": "Sub-county must belong to the selected county."}
            )
        if sub_county and ward and ward.sub_county_id != sub_county.id:
            raise serializers.ValidationError(
                {"ward": "Ward must belong to the selected sub-county."}
            )

        return attrs

    def create(self, validated_data: dict) -> Facility:
        """
        Create facility, applying KEPH-level module defaults when no
        module flags are explicitly provided in the request payload.
        """
        # Detect whether the caller explicitly set any module flag
        module_fields = [
            "has_outpatient",
            "has_inpatient",
            "has_emergency",
            "has_pharmacy",
            "has_laboratory",
            "has_imaging",
            "has_theatre",
            "has_dialysis",
            "has_icu",
            "has_maternity",
            "has_mortuary",
            "has_blood_bank",
            "has_inventory",
            "has_lis_standalone",
        ]
        any_module_set = any(f in self.initial_data for f in module_fields)

        if not any_module_set:
            level = validated_data.get("level", "1")
            defaults = Facility.default_modules_for_level(level)
            for module_name, enabled in defaults.items():
                validated_data[f"has_{module_name}"] = enabled

        facility = Facility(**validated_data)
        if any_module_set:
            facility._skip_module_defaults = True
        facility.save()
        return facility


# =============================================================================
# PKI & Digital Signature Serializers (DHA Gap #32 — Sprint 3.C)
# =============================================================================


class CertificateAuthoritySerializer(serializers.ModelSerializer):
    """Serializer for CertificateAuthority (public info only)."""

    is_expired = serializers.BooleanField(read_only=True)
    ca_type = serializers.SerializerMethodField()

    class Meta:
        model = CertificateAuthority
        fields = [
            "id",
            "name",
            "serial_number",
            "subject_dn",
            "valid_from",
            "valid_to",
            "is_root",
            "parent_ca",
            "is_active",
            "is_expired",
            "key_size",
            "ca_type",
            "created_at",
        ]
        read_only_fields = fields

    def get_ca_type(self, obj) -> str:
        return "root" if obj.is_root else "intermediate"


class UserCertificateSerializer(serializers.ModelSerializer):
    """Serializer for UserCertificate."""

    username = serializers.CharField(source="user.username", read_only=True)
    user_name = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    ca_name = serializers.CharField(source="certificate_authority.name", read_only=True)

    class Meta:
        model = UserCertificate
        fields = [
            "id",
            "user",
            "username",
            "user_name",
            "certificate_authority",
            "ca_name",
            "serial_number",
            "subject_dn",
            "valid_from",
            "valid_to",
            "is_revoked",
            "revoked_at",
            "revocation_reason",
            "is_expired",
            "is_valid",
            "created_at",
        ]
        read_only_fields = fields

    def get_user_name(self, obj) -> str:
        if not obj.user:
            return ""
        return obj.user.get_full_name().strip() or obj.user.username


class CertificateRevocationSerializer(serializers.ModelSerializer):
    """Serializer for CertificateRevocation."""

    certificate_serial = serializers.CharField(source="certificate.serial_number", read_only=True)
    revoked_by_username = serializers.CharField(
        source="revoked_by.username", read_only=True, default=""
    )

    class Meta:
        model = CertificateRevocation
        fields = [
            "id",
            "certificate",
            "certificate_serial",
            "revoked_at",
            "reason",
            "revoked_by",
            "revoked_by_username",
            "created_at",
        ]
        read_only_fields = fields


class DocumentSignatureSerializer(serializers.ModelSerializer):
    """Serializer for DocumentSignature."""

    signer_username = serializers.CharField(source="signer.username", read_only=True)
    signer_name = serializers.SerializerMethodField()
    signer_full_name = serializers.SerializerMethodField()
    certificate_serial = serializers.CharField(source="certificate.serial_number", read_only=True)

    class Meta:
        model = DocumentSignature
        fields = [
            "id",
            "document_type",
            "document_id",
            "signer",
            "signer_username",
            "signer_name",
            "signer_full_name",
            "certificate",
            "certificate_serial",
            "content_hash",
            "hash_algorithm",
            "signed_at",
            "is_valid",
            "verification_note",
            "created_at",
        ]
        read_only_fields = fields

    def get_signer_name(self, obj) -> str:
        if not obj.signer:
            return ""
        return obj.signer.get_full_name().strip() or obj.signer.username

    def get_signer_full_name(self, obj) -> str:
        return self.get_signer_name(obj)


class SignDocumentRequestSerializer(serializers.Serializer):
    """Request serializer for signing a document."""

    document_type = serializers.ChoiceField(
        choices=[],  # Set dynamically from SIGNABLE_DOCUMENT_TYPES
    )
    document_id = serializers.IntegerField(min_value=1)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .services.signing_service import SIGNABLE_DOCUMENT_TYPES

        self.fields["document_type"].choices = sorted(SIGNABLE_DOCUMENT_TYPES)


class VerifySignatureRequestSerializer(serializers.Serializer):
    """Request serializer for verifying a signature."""

    signature_id = serializers.IntegerField(required=False)
    document_type = serializers.CharField(required=False)
    document_id = serializers.IntegerField(required=False)

    def validate(self, data):
        if not data.get("signature_id") and not (
            data.get("document_type") and data.get("document_id")
        ):
            raise serializers.ValidationError(
                "Provide either 'signature_id' or both 'document_type' and 'document_id'."
            )
        return data


class RevokeCertificateRequestSerializer(serializers.Serializer):
    """Request serializer for revoking a certificate."""

    reason = serializers.ChoiceField(
        choices=UserCertificate.RevocationReason.choices,
    )


# ============================================================================
# Staff Invitation Serializers
# ============================================================================


class StaffInvitationCreateSerializer(serializers.Serializer):
    """Create a new staff invitation (admin action)."""

    email = serializers.EmailField()
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True),
    )
    facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    secondary_roles = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True),
        many=True,
        required=False,
    )
    secondary_departments = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        many=True,
        required=False,
    )
    job_title = serializers.CharField(max_length=100, required=False, allow_blank=True)
    employee_id = serializers.CharField(max_length=50, required=False, allow_blank=True)
    expires_hours = serializers.IntegerField(
        min_value=1,
        max_value=720,  # 30 days max
        default=72,
        required=False,
    )

    def validate_email(self, value):
        """Validate email: allow cross-org invitations for existing users."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        normalized = value.lower()

        # Store existing user ref for use in validate() — not an error anymore
        try:
            self._existing_user = User.objects.get(email__iexact=normalized)
        except User.DoesNotExist:
            self._existing_user = None

        # Check for pending (non-expired) invitation
        from hmis.apps.core.models import StaffInvitation

        pending = StaffInvitation.objects.filter(
            email__iexact=normalized,
            status=StaffInvitation.InvitationStatus.PENDING,
        )
        for inv in pending:
            if inv.is_usable:
                raise serializers.ValidationError(
                    "A pending invitation for this email already exists. Revoke it first or resend."
                )
        return normalized

    def validate(self, data):
        """Cross-org: block if existing user is already a member of the target org."""
        data = super().validate(data)
        existing_user = getattr(self, "_existing_user", None)
        if existing_user is not None:
            org = data.get("organization")
            if org and hasattr(existing_user, "staff_profile"):
                from hmis.apps.core.models import OrgMembership

                if OrgMembership.objects.filter(
                    staff_profile=existing_user.staff_profile,
                    organization=org,
                    status=OrgMembership.MembershipStatus.ACTIVE,
                ).exists():
                    raise serializers.ValidationError(
                        {"email": "This user is already a member of the target organization."}
                    )
            data["is_cross_org"] = True
            data["existing_user"] = existing_user
        else:
            data["is_cross_org"] = False
            data["existing_user"] = None
        return data

    def validate_employee_id(self, value):
        """Validate employee_id is unique if provided."""
        if value and StaffProfile.objects.filter(employee_id=value).exists():
            raise serializers.ValidationError("This employee ID is already in use.")
        return value


class StaffInvitationSerializer(serializers.ModelSerializer):
    """Read serializer for staff invitations."""

    invited_by_name = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    facility_name = serializers.SerializerMethodField()
    role_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_usable = serializers.BooleanField(read_only=True)

    class Meta:
        model = StaffInvitation
        fields = [
            "id",
            "token",
            "email",
            "organization",
            "organization_name",
            "facility",
            "facility_name",
            "role",
            "role_name",
            "department",
            "department_name",
            "job_title",
            "employee_id",
            "status",
            "invited_by",
            "invited_by_name",
            "expires_at",
            "expires_hours",
            "accepted_at",
            "accepted_user",
            "last_sent_at",
            "send_count",
            "is_expired",
            "is_usable",
            "is_cross_org",
            "existing_user",
            "created_at",
        ]
        read_only_fields = fields

    def get_invited_by_name(self, obj) -> str:
        if obj.invited_by:
            return obj.invited_by.get_full_name() or obj.invited_by.username
        return ""

    def get_facility_name(self, obj) -> str:
        return obj.facility.name if obj.facility else ""

    def get_role_name(self, obj) -> str:
        return obj.role.name if obj.role else ""

    def get_department_name(self, obj) -> str:
        return obj.department.name if obj.department else ""


class InvitationAcceptSerializer(serializers.Serializer):
    """Public serializer for accepting an invitation and creating an account."""

    token = serializers.UUIDField()
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    confirm_password = serializers.CharField(max_length=128, write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_username(self, value):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value.lower()

    def validate(self, data):
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data


# ============================================================================
# Password Reset & Change Serializers
# ============================================================================


class PasswordResetRequestSerializer(serializers.Serializer):
    """Request a password reset email."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Confirm a password reset with a token."""

    token = serializers.UUIDField()
    new_password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    confirm_password = serializers.CharField(max_length=128, write_only=True)

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data


class ChangePasswordSerializer(serializers.Serializer):
    """Change password (authenticated, for must_change_password flow)."""

    current_password = serializers.CharField(
        max_length=128,
        write_only=True,
        required=False,
        help_text="Required unless the user has must_change_password=True.",
    )
    new_password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    confirm_password = serializers.CharField(max_length=128, write_only=True)

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data


class InvitationPublicSerializer(serializers.ModelSerializer):
    """Public-facing serializer showing only non-sensitive invitation info."""

    organization_name = serializers.CharField(source="organization.name", read_only=True)
    role_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_usable = serializers.BooleanField(read_only=True)

    class Meta:
        model = StaffInvitation
        fields = [
            "email",
            "organization_name",
            "role_name",
            "department_name",
            "job_title",
            "is_expired",
            "is_usable",
            "is_cross_org",
            "expires_at",
        ]
        read_only_fields = fields

    def get_role_name(self, obj) -> str:
        return obj.role.name if obj.role else ""

    def get_department_name(self, obj) -> str:
        return obj.department.name if obj.department else ""


# ============================================================================
# Cross-Org Accept Serializer
# ============================================================================


class CrossOrgAcceptSerializer(serializers.Serializer):
    """Serializer for existing users accepting a cross-org invitation."""

    token = serializers.UUIDField()


# ============================================================================
# Organization Join Request Serializers
# ============================================================================


class OrgJoinRequestSerializer(serializers.ModelSerializer):
    """Read serializer for join requests."""

    user_name = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    requested_role_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        from hmis.apps.core.models import OrgJoinRequest

        model = OrgJoinRequest
        fields = [
            "id",
            "user",
            "user_name",
            "user_email",
            "organization",
            "organization_name",
            "requested_role",
            "requested_role_name",
            "message",
            "status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "review_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_user_name(self, obj) -> str:
        return obj.user.get_full_name() or obj.user.username

    def get_user_email(self, obj) -> str:
        return obj.user.email

    def get_requested_role_name(self, obj) -> str:
        return obj.requested_role.name if obj.requested_role else ""

    def get_reviewed_by_name(self, obj) -> str:
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return ""


class OrgJoinRequestCreateSerializer(serializers.Serializer):
    """Create a join request."""

    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(is_active=True),
    )
    requested_role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    message = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")

    def validate(self, data):
        user = self.context["request"].user
        org = data["organization"]

        # Block if already a member
        from hmis.apps.core.models import OrgMembership

        if (
            hasattr(user, "staff_profile")
            and OrgMembership.objects.filter(
                staff_profile=user.staff_profile,
                organization=org,
                status=OrgMembership.MembershipStatus.ACTIVE,
            ).exists()
        ):
            raise serializers.ValidationError("You are already a member of this organization.")

        # Block if duplicate pending
        from hmis.apps.core.models import OrgJoinRequest

        if OrgJoinRequest.objects.filter(
            user=user,
            organization=org,
            status=OrgJoinRequest.RequestStatus.PENDING,
        ).exists():
            raise serializers.ValidationError(
                "You already have a pending request for this organization."
            )
        return data


class OrgJoinRequestApproveSerializer(serializers.Serializer):
    """Serializer for approving a join request (admin assigns role/dept/facilities)."""

    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True),
    )
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    facilities = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.filter(is_active=True),
        many=True,
        required=False,
    )
    review_notes = serializers.CharField(
        max_length=1000, required=False, allow_blank=True, default=""
    )


class OrgJoinRequestRejectSerializer(serializers.Serializer):
    """Serializer for rejecting a join request."""

    review_notes = serializers.CharField(
        max_length=1000, required=False, allow_blank=True, default=""
    )


# ============================================================================
# Self-Service Organization Signup Serializers
# ============================================================================


class OrgSignupSerializer(serializers.Serializer):
    """
    Self-service organization signup.

    Creates Organization + Admin User + StaffProfile + initial Facility atomically.
    """

    # Organization
    org_name = serializers.CharField(max_length=200)

    # Admin user
    admin_email = serializers.EmailField()
    admin_first_name = serializers.CharField(max_length=150)
    admin_last_name = serializers.CharField(max_length=150)
    admin_password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    confirm_password = serializers.CharField(max_length=128, write_only=True)

    # Initial facility (required — used for MFL verification)
    facility_name = serializers.CharField(max_length=200)
    facility_mfl_code = serializers.CharField(max_length=20)
    facility_county = serializers.PrimaryKeyRelatedField(
        queryset=County.objects.all(),
    )
    facility_sub_county = serializers.PrimaryKeyRelatedField(
        queryset=SubCounty.objects.all(),
    )
    facility_level = serializers.ChoiceField(
        choices=Facility.FacilityLevel.choices,
        required=False,
        default=Facility.FacilityLevel.LEVEL_3,
    )
    facility_ownership = serializers.ChoiceField(
        choices=Facility.OwnershipType.choices,
        required=False,
        default=Facility.OwnershipType.PRIVATE,
    )

    def validate_org_name(self, value):
        """Ensure org name is unique."""
        if Organization.objects.filter(name__iexact=value).exists():
            raise serializers.ValidationError("An organization with this name already exists.")
        return value

    def validate_admin_email(self, value):
        """Ensure email isn't already registered."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        normalized = value.lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalized

    def validate_facility_mfl_code(self, value):
        """Ensure MFL code isn't already registered."""
        if Facility.objects.filter(mfl_code=value).exists():
            raise serializers.ValidationError("A facility with this MFL code already exists.")
        return value

    def validate(self, data):
        if data["admin_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        # Validate county → sub-county cascade
        county = data.get("facility_county")
        sub_county = data.get("facility_sub_county")
        if county and sub_county and sub_county.county_id != county.pk:
            raise serializers.ValidationError(
                {"facility_sub_county": "Sub-county does not belong to the selected county."}
            )
        return data


class EmailVerifySerializer(serializers.Serializer):
    """Verify email address with a token."""

    token = serializers.UUIDField()


# ============================================================================
# Setup Wizard Serializer
# ============================================================================


class SetupWizardSerializer(serializers.Serializer):
    """
    First-run setup wizard — creates Org + Facility + Admin atomically.

    Only works when no organizations exist in the database.
    """

    # Organization
    org_name = serializers.CharField(max_length=200)
    org_contact_email = serializers.EmailField(required=False, allow_blank=True, default="")
    org_contact_phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )

    # Facility
    facility_name = serializers.CharField(max_length=200)
    facility_mfl_code = serializers.CharField(max_length=20)
    facility_level = serializers.ChoiceField(choices=Facility.FacilityLevel.choices)
    facility_ownership = serializers.ChoiceField(
        choices=Facility.OwnershipType.choices,
        default=Facility.OwnershipType.PRIVATE,
    )
    facility_county = serializers.PrimaryKeyRelatedField(
        queryset=County.objects.all(),
    )
    facility_sub_county = serializers.PrimaryKeyRelatedField(
        queryset=SubCounty.objects.all(),
    )

    # Admin Account
    admin_username = serializers.CharField(max_length=150)
    admin_email = serializers.EmailField()
    admin_first_name = serializers.CharField(max_length=150)
    admin_last_name = serializers.CharField(max_length=150)
    admin_password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    confirm_password = serializers.CharField(max_length=128, write_only=True)

    def validate_facility_mfl_code(self, value):
        """Check MFL code uniqueness."""
        if Facility.objects.filter(mfl_code=value).exists():
            raise serializers.ValidationError("A facility with this MFL code already exists.")
        return value

    def validate_admin_username(self, value):
        """Check username uniqueness."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value.lower()

    def validate_admin_email(self, value):
        """Check email uniqueness."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        if User.objects.filter(email__iexact=value.lower()).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate(self, data):
        if data["admin_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data


# ---------------------------------------------------------------------------
# OrgMembership serializers (Phase 1 multi-org)
# ---------------------------------------------------------------------------


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
