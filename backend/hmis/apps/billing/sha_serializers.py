"""
Serializers for SHA (Social Health Authority) billing models.

Provides serialization for SHA Members, Tariffs, Claims, and related models.
"""

from rest_framework import serializers

from hmis.apps.billing.models import (
    SHAClaim,
    SHAClaimAttachment,
    SHAClaimItem,
    SHAEligibilityCheck,
    SHAMember,
    SHATariff,
)


class SHAMemberSerializer(serializers.ModelSerializer):
    """Serializer for SHA member registration and display."""

    patient_name = serializers.SerializerMethodField()
    eligibility_display = serializers.SerializerMethodField()
    pfms_category_display = serializers.SerializerMethodField()

    class Meta:
        model = SHAMember
        fields = [
            "id",
            "patient",
            "patient_name",
            "sha_number",
            "national_id",
            "membership_type",
            "principal_sha_number",
            "status",
            "eligibility_display",
            "coverage_start_date",
            "coverage_end_date",
            "eligibility_valid_until",
            "last_eligibility_check",
            # PFMS fields (SHA Integration Checklist #13)
            "is_pfms_eligible",
            "pfms_category",
            "pfms_category_display",
            "pfms_verified",
            "pfms_verified_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "eligibility_valid_until",
            "last_eligibility_check",
            "pfms_verified",
            "pfms_verified_at",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str | None:
        """Return patient's full name."""
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return None

    def get_eligibility_display(self, obj) -> str:
        """Return human-readable eligibility status."""
        return obj.get_eligibility_display()

    def get_pfms_category_display(self, obj) -> str | None:
        """Return human-readable PFMS category."""
        if obj.is_pfms_eligible and obj.pfms_category:
            return obj.get_pfms_category_display()
        return None

    def validate_sha_number(self, value):
        """Validate SHA number format."""
        if not value.startswith("SHA-"):
            raise serializers.ValidationError("SHA number must start with 'SHA-'")
        return value

    def validate(self, attrs):
        """Validate non-principal members have a principal SHA number."""
        membership_type = attrs.get("membership_type")
        principal_sha_number = attrs.get("principal_sha_number")

        if membership_type != SHAMember.MembershipType.PRINCIPAL and not principal_sha_number:
            raise serializers.ValidationError(
                {"principal_sha_number": "Non-principal members must have a principal SHA number"}
            )

        # Validate PFMS category when PFMS eligible
        is_pfms_eligible = attrs.get("is_pfms_eligible", False)
        pfms_category = attrs.get("pfms_category", "")
        if is_pfms_eligible and not pfms_category:
            raise serializers.ValidationError(
                {"pfms_category": "PFMS category is required when member is PFMS eligible"}
            )

        return attrs

    def create(self, validated_data):
        """Set created_by from request user."""
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class SHAMemberDetailSerializer(SHAMemberSerializer):
    """Detailed serializer for SHA member with nested patient info."""

    patient = serializers.SerializerMethodField()

    def get_patient(self, obj) -> str:
        """Return nested patient details."""
        if obj.patient:
            return {
                "id": obj.patient.id,
                "mrn": obj.patient.mrn,
                "first_name": obj.patient.first_name,
                "last_name": obj.patient.last_name,
                "date_of_birth": obj.patient.date_of_birth,
                "gender": obj.patient.gender,
            }
        return None


class SHATariffSerializer(serializers.ModelSerializer):
    """Serializer for SHA tariff codes."""

    is_valid = serializers.SerializerMethodField()

    class Meta:
        model = SHATariff
        fields = [
            "id",
            "code",
            "name",
            "description",
            "category",
            "sha_amount",
            "facility_level",
            "effective_date",
            "expiry_date",
            "is_active",
            "is_valid",
            "max_quantity_per_claim",
            "requires_preauthorization",
            "applicable_icd10_codes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_is_valid(self, obj) -> bool:
        """Check if tariff is currently valid."""
        return obj.is_valid_on_date()


class SHAClaimItemSerializer(serializers.ModelSerializer):
    """Serializer for claim line items."""

    tariff_code = serializers.CharField(source="tariff.code", read_only=True, allow_null=True)
    tariff_name = serializers.CharField(source="tariff.name", read_only=True, allow_null=True)
    coverage_type_display = serializers.SerializerMethodField()

    class Meta:
        model = SHAClaimItem
        fields = [
            "id",
            "claim",
            "tariff",
            "tariff_code",
            "tariff_name",
            "service",
            "invoice_item",
            "description",
            "service_date",
            "quantity",
            "unit_price",
            "claimed_amount",
            # PFMS coverage type (SHA Integration Checklist #13)
            "coverage_type",
            "coverage_type_display",
            "status",
            "approved_quantity",
            "approved_amount",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "claim",
            "claimed_amount",
            "status",
            "approved_quantity",
            "approved_amount",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]

    def get_coverage_type_display(self, obj) -> str:
        """Return human-readable coverage type."""
        return obj.get_coverage_type_display()


class SHAClaimAttachmentSerializer(serializers.ModelSerializer):
    """Serializer for claim attachments."""

    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True)

    class Meta:
        model = SHAClaimAttachment
        fields = [
            "id",
            "claim",
            "attachment_type",
            "name",
            "description",
            "file",
            "file_size",
            "mime_type",
            "checksum",
            "original_filename",
            "page_count",
            "uploaded_by",
            "uploaded_by_username",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "claim",
            "file_size",
            "checksum",
            "uploaded_by",
            "uploaded_by_username",
            "created_at",
        ]

    def validate_file(self, value):
        """Validate file size and type."""
        max_size = 10 * 1024 * 1024  # 10MB
        if value.size > max_size:
            raise serializers.ValidationError("File size exceeds maximum of 10MB")

        allowed_types = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/tiff",
        ]
        if value.content_type not in allowed_types:
            raise serializers.ValidationError(
                f"File type not allowed. Allowed: {', '.join(allowed_types)}"
            )
        return value


class SHAClaimSerializer(serializers.ModelSerializer):
    """Serializer for SHA claims."""

    patient_name = serializers.SerializerMethodField()
    sha_member_number = serializers.CharField(source="sha_member.sha_number", read_only=True)
    items_count = serializers.SerializerMethodField()
    attachments_count = serializers.SerializerMethodField()
    submitted_by_username = serializers.CharField(
        source="submitted_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = SHAClaim
        fields = [
            "id",
            "claim_number",
            "sha_claim_reference",
            "patient",
            "patient_name",
            "sha_member",
            "sha_member_number",
            "encounter",
            "invoice",
            "claim_type",
            "status",
            "service_date",
            "admission_date",
            "discharge_date",
            "primary_diagnosis_code",
            "primary_diagnosis_description",
            "secondary_diagnosis_codes",
            "claimed_amount",
            "approved_amount",
            "paid_amount",
            "patient_copay",
            "submission_method",
            "submitted_at",
            "submitted_by",
            "submitted_by_username",
            "adjudication_date",
            "adjudication_notes",
            "rejection_reason",
            "rejection_code",
            "payment_date",
            "payment_reference",
            "preauth_number",
            "preauth_date",
            "preauth_valid_until",
            "facility_code",
            "facility_level",
            "version",
            "parent_claim",
            "items_count",
            "attachments_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "claim_number",
            "sha_claim_reference",
            "status",
            "claimed_amount",
            "approved_amount",
            "paid_amount",
            "patient_copay",
            "submitted_at",
            "submitted_by",
            "adjudication_date",
            "adjudication_notes",
            "rejection_reason",
            "rejection_code",
            "payment_date",
            "payment_reference",
            "version",
            "parent_claim",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Return patient's full name."""
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return None

    def get_items_count(self, obj) -> int | None:
        """Return count of claim items."""
        return obj.items.count()

    def get_attachments_count(self, obj) -> int:
        """Return count of attachments."""
        return obj.attachments.count()

    def validate(self, attrs):
        """Validate claim data."""
        claim_type = attrs.get("claim_type")
        admission_date = attrs.get("admission_date")

        # Inpatient claims require admission date
        if claim_type in ["inpatient", "surgery", "maternity"]:
            if not admission_date:
                raise serializers.ValidationError(
                    {"admission_date": f"{claim_type.title()} claims require an admission date"}
                )

        return attrs

    def create(self, validated_data):
        """Set created_by from request user."""
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class SHAClaimDetailSerializer(SHAClaimSerializer):
    """Detailed serializer for SHA claim with nested items and attachments."""

    items = SHAClaimItemSerializer(many=True, read_only=True)
    attachments = SHAClaimAttachmentSerializer(many=True, read_only=True)

    class Meta(SHAClaimSerializer.Meta):
        fields = SHAClaimSerializer.Meta.fields + ["items", "attachments"]


class SHAClaimValidationSerializer(serializers.Serializer):
    """Serializer for claim validation response."""

    is_valid = serializers.BooleanField()
    errors = serializers.ListField(child=serializers.CharField())


class SHAClaimSubmitSerializer(serializers.Serializer):
    """Serializer for claim submission response."""

    status = serializers.CharField()
    claim_number = serializers.CharField()
    submitted_at = serializers.DateTimeField()


class SHAClaimAppealSerializer(serializers.Serializer):
    """Serializer for claim appeal request."""

    reason = serializers.CharField(required=True, max_length=1000)


class SHAEligibilityCheckSerializer(serializers.ModelSerializer):
    """Serializer for eligibility check records."""

    sha_member_number = serializers.CharField(source="sha_member.sha_number", read_only=True)
    checked_by_username = serializers.CharField(source="checked_by.username", read_only=True)

    class Meta:
        model = SHAEligibilityCheck
        fields = [
            "id",
            "sha_member",
            "sha_member_number",
            "patient",
            "check_date",
            "result",
            "is_eligible",
            "eligible_until",
            "benefit_balance",
            "ineligibility_reason",
            "response_time_ms",
            "error_code",
            "error_message",
            "checked_by",
            "checked_by_username",
        ]
        read_only_fields = fields


class SHAEligibilityVerifySerializer(serializers.Serializer):
    """Serializer for eligibility verification response."""

    is_eligible = serializers.BooleanField()
    result = serializers.CharField()
    eligible_until = serializers.DateField(allow_null=True)
    benefit_balance = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    ineligibility_reason = serializers.CharField(allow_blank=True)
    error_code = serializers.CharField(allow_blank=True)
    error_message = serializers.CharField(allow_blank=True)


class SHAClaimDashboardSerializer(serializers.Serializer):
    """Serializer for claims dashboard statistics."""

    total_claims = serializers.IntegerField()
    total_claimed_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_approved_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    claims_by_status = serializers.DictField()
    claims_by_type = serializers.DictField()
    average_processing_days = serializers.FloatField(allow_null=True)
