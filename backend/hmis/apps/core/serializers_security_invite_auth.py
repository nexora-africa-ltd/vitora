# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F401, F811
"""Core serializers security invite auth for Vitora HMIS.

What this file is for:
- Implement serializers security invite auth logic for the core domain.

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


class CertificateAuthoritySerializer(serializers.ModelSerializer):
    """Serializer for CertificateAuthority (public info only)."""

    is_expired = serializers.BooleanField(read_only=True)
    ca_type = serializers.SerializerMethodField()
    organization_name = serializers.CharField(
        source="organization.name",
        read_only=True,
        default="",
    )

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
            "organization",
            "organization_name",
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
    organization_name = serializers.CharField(
        source="organization.name",
        read_only=True,
        default="",
    )

    class Meta:
        model = UserCertificate
        fields = [
            "id",
            "user",
            "username",
            "user_name",
            "certificate_authority",
            "ca_name",
            "organization",
            "organization_name",
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


class DocumentShareSerializer(serializers.ModelSerializer):
    """Serializer for document shares."""

    shared_by_name = serializers.SerializerMethodField()
    shared_with_name = serializers.SerializerMethodField()

    class Meta:
        model = DocumentShare
        fields = [
            "id",
            "document_type",
            "document_id",
            "shared_by",
            "shared_by_name",
            "shared_with",
            "shared_with_name",
            "permission",
            "note",
            "expires_at",
            "revoked_at",
            "revoked_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "shared_by",
            "shared_by_name",
            "shared_with_name",
            "revoked_at",
            "revoked_by",
            "created_at",
            "updated_at",
        ]

    def get_shared_by_name(self, obj) -> str:
        return obj.shared_by.get_full_name().strip() or obj.shared_by.username

    def get_shared_with_name(self, obj) -> str:
        return obj.shared_with.get_full_name().strip() or obj.shared_with.username


class DocumentShareCreateSerializer(serializers.ModelSerializer):
    """Create serializer for document shares."""

    class Meta:
        model = DocumentShare
        fields = ["document_type", "document_id", "shared_with", "permission", "note", "expires_at"]

    def validate_document_type(self, value):
        from .services.signing_service import SIGNABLE_DOCUMENT_TYPES

        shareable_types = set(SIGNABLE_DOCUMENT_TYPES) | {
            "Invoice",
            "SHAClaim",
            "SHAPreauth",
            "SHAClaimAttachment",
            "CreditNote",
            "Receipt",
            "Payment",
        }
        if value not in shareable_types:
            raise serializers.ValidationError("Unsupported document type.")
        return value

    def validate_shared_with(self, value):
        request = self.context.get("request")
        if request and value.pk == request.user.pk:
            raise serializers.ValidationError("You cannot share a document with yourself.")
        return value

    def validate(self, attrs):
        from .services.signing_service import SIGNABLE_DOCUMENT_TYPES

        if (
            attrs.get("permission") == DocumentShare.Permission.SIGN
            and attrs.get("document_type") not in SIGNABLE_DOCUMENT_TYPES
        ):
            raise serializers.ValidationError(
                {"permission": "SIGN permission is only available for signable document types."}
            )
        return attrs


class DocumentHubItemSerializer(serializers.Serializer):
    """Normalized Document Hub item."""

    document_type = serializers.CharField()
    document_id = serializers.IntegerField()
    document_number = serializers.CharField()
    title = serializers.CharField()
    patient_name = serializers.CharField(allow_blank=True)
    status = serializers.CharField(allow_blank=True)
    owner_name = serializers.CharField(allow_blank=True)
    is_signed = serializers.BooleanField()
    signed_at = serializers.DateTimeField(allow_null=True)
    can_sign = serializers.BooleanField()
    is_shared_with_me = serializers.BooleanField()
    share_permission = serializers.CharField(allow_null=True)
    shared_by_name = serializers.CharField(allow_null=True)
    shared_at = serializers.DateTimeField(allow_null=True)


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
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.core.models import StaffInvitation

        email_hmac = get_kms_provider().compute_hmac(normalized.lower())
        pending = StaffInvitation.objects.filter(
            email_hmac=email_hmac,
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

    # PII property field (encrypted at rest)
    email = serializers.CharField(required=False, allow_blank=True, default="")

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

    def validate_password(self, value):
        """Enforce Django AUTH_PASSWORD_VALIDATORS."""
        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages) from None
        return value

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

    def validate_new_password(self, value):
        """Enforce Django AUTH_PASSWORD_VALIDATORS."""
        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages) from None
        return value

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data


class ChangePasswordSerializer(serializers.Serializer):
    """Change password (authenticated or via reset_token, for must_change_password flow)."""

    current_password = serializers.CharField(
        max_length=128,
        write_only=True,
        required=False,
        help_text="Required unless the user has must_change_password=True or reset_token is provided.",
    )
    reset_token = serializers.UUIDField(
        write_only=True,
        required=False,
        help_text="One-time token issued on login when must_change_password is True. "
        "When provided, authentication is not required and current_password is skipped.",
    )
    new_password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    confirm_password = serializers.CharField(max_length=128, write_only=True)

    def validate_new_password(self, value):
        """Enforce Django AUTH_PASSWORD_VALIDATORS."""
        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages) from None
        return value

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data


class PasswordValidationSerializer(serializers.Serializer):
    """Validate a password against Django's AUTH_PASSWORD_VALIDATORS."""

    password = serializers.CharField(min_length=1, max_length=128, write_only=True)

    def validate_password(self, value):
        """Run Django password validators and return error messages."""
        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages) from None
        return value


class InvitationPublicSerializer(serializers.ModelSerializer):
    """Public-facing serializer showing only non-sensitive invitation info."""

    # PII property field (encrypted at rest)
    email = serializers.CharField(read_only=True, default="")

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

    def validate_admin_password(self, value):
        """Enforce Django AUTH_PASSWORD_VALIDATORS."""
        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages) from None
        return value

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
    facility_operating_mode = serializers.ChoiceField(
        choices=Facility.OperatingMode.choices,
        required=False,
        default=Facility.OperatingMode.FULL_HMIS,
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
