"""
Serializers for SHA (Social Health Authority) billing models.

Provides serialization for SHA Members, Tariffs, Claims, and related models.
"""

from rest_framework import serializers

from hmis.apps.billing.models import (
    SHAClaim,
    SHAClaimAttachment,
    SHAClaimIntervention,
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
        """Validate file size and type using magic-byte content sniffing."""
        from hmis.apps.core.upload_validators import validate_upload

        validate_upload(
            value,
            allowed_extensions=["pdf", "jpg", "jpeg", "png", "tiff", "tif"],
            allowed_mime_types=[
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/tiff",
            ],
            max_size_mb=10,
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
    time_barring_deadline = serializers.DateTimeField(read_only=True)
    is_time_barred = serializers.BooleanField(read_only=True)
    hours_until_time_barred = serializers.FloatField(read_only=True)

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
            "dha_external_id",
            "dha_correlation_id",
            "last_dha_status",
            "last_dha_payload_at",
            "dha_visit_started_at",
            "time_barring_deadline",
            "is_time_barred",
            "hours_until_time_barred",
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
            "dha_external_id",
            "dha_correlation_id",
            "last_dha_status",
            "last_dha_payload_at",
            "dha_visit_started_at",
            "time_barring_deadline",
            "is_time_barred",
            "hours_until_time_barred",
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


class SHAClaimInterventionSerializer(serializers.ModelSerializer):
    """Serializer for claim interventions tracked from DHA HIE."""

    class Meta:
        model = SHAClaimIntervention
        fields = [
            "id",
            "intervention_code",
            "intervention_name",
            "benefit_code",
            "status",
            "required_document_types",
            "dha_intervention_id",
            "tariff_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SHAClaimDetailSerializer(SHAClaimSerializer):
    """Detailed serializer for SHA claim with nested items and attachments."""

    items = SHAClaimItemSerializer(many=True, read_only=True)
    attachments = SHAClaimAttachmentSerializer(many=True, read_only=True)
    claim_interventions = SHAClaimInterventionSerializer(many=True, read_only=True)
    missing_document_types = serializers.SerializerMethodField()

    class Meta(SHAClaimSerializer.Meta):
        fields = SHAClaimSerializer.Meta.fields + [
            "items",
            "attachments",
            "claim_interventions",
            "missing_document_types",
        ]

    def get_missing_document_types(self, obj) -> list[dict]:
        """Return missing document types per intervention."""
        return obj.missing_document_types


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
    # Facility-aware coverage fields (DHA HIE).
    eligible_schemes = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    billable_schemes = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    coverage_caveat = serializers.CharField(required=False, allow_blank=True, default="")
    coverage_blocked = serializers.BooleanField(required=False, default=False)


class SHAClaimDashboardSerializer(serializers.Serializer):
    """Serializer for claims dashboard statistics."""

    total_claims = serializers.IntegerField()
    total_claimed_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_approved_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    claims_by_status = serializers.DictField()
    claims_by_type = serializers.DictField()
    average_processing_days = serializers.FloatField(allow_null=True)


# ---------------------------------------------------------------------------
# Consent Token Serializers
# ---------------------------------------------------------------------------


class ConsentTokenSerializer(serializers.ModelSerializer):
    """Read serializer for ConsentToken."""

    patient_name = serializers.SerializerMethodField()
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        from hmis.apps.billing.models import ConsentToken

        model = ConsentToken
        fields = [
            "id",
            "patient",
            "patient_name",
            "sha_member",
            "encounter",
            "consent_method",
            "status",
            "otp_reference",
            "identification_type",
            "identification_number",
            "consent_token",
            "created_at",
            "validated_at",
            "expires_at",
            "is_valid",
            "facility",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj) -> str:
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return ""


class SendOTPSerializer(serializers.Serializer):
    """Input serializer for sending OTP."""

    sha_member_id = serializers.IntegerField(help_text="ID of the SHA member to send OTP to")
    intervention_codes = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        help_text="SHA intervention codes for this visit (e.g. ['SHA-06-001'])",
    )


class ValidateOTPSerializer(serializers.Serializer):
    """Input serializer for validating OTP."""

    consent_id = serializers.IntegerField(help_text="ID of the pending ConsentToken")
    otp_code = serializers.CharField(max_length=10, help_text="OTP code entered by patient")
    encrypted_pin = serializers.CharField(
        max_length=255, required=False, default="", help_text="Optional encrypted PIN"
    )


# ---------------------------------------------------------------------------
# Pre-authorization Serializers
# ---------------------------------------------------------------------------


class PreauthRequestSerializer(serializers.ModelSerializer):
    """Read serializer for PreauthRequest."""

    patient_name = serializers.SerializerMethodField()
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        from hmis.apps.billing.models import PreauthRequest

        model = PreauthRequest
        fields = [
            "id",
            "claim",
            "patient",
            "patient_name",
            "sha_member",
            "consent_token",
            "preauth_reference",
            "procedure_code",
            "diagnosis_codes",
            "estimated_cost",
            "scheduled_date",
            "clinical_notes",
            "decision",
            "approved_amount",
            "valid_until",
            "denial_reason",
            "poll_count",
            "last_polled_at",
            "created_at",
            "submitted_at",
            "is_valid",
            "facility",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj) -> str:
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return ""


class SubmitPreauthSerializer(serializers.Serializer):
    """Input serializer for submitting pre-authorization."""

    claim_id = serializers.IntegerField(help_text="ID of the SHA claim requiring preauth")
    consent_token_id = serializers.IntegerField(help_text="ID of a valid ConsentToken")
    procedure_code = serializers.CharField(max_length=20, help_text="SHA tariff code")
    diagnosis_codes = serializers.ListField(
        child=serializers.CharField(max_length=10),
        help_text="ICD-10 diagnosis codes",
    )
    estimated_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, help_text="Estimated cost (KES)"
    )
    scheduled_date = serializers.DateField(help_text="Planned procedure date")
    clinical_notes = serializers.CharField(
        required=False, default="", help_text="Clinical justification"
    )


# =============================================================================
# SHA Remittance Serializers
# =============================================================================


class SHARemittanceSerializer(serializers.ModelSerializer):
    """Serializer for SHA remittance (payment batch)."""

    reconciled_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    unreconciled_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        from hmis.apps.billing.models import SHARemittance

        model = SHARemittance
        fields = [
            "id",
            "bank_reference",
            "payment_date",
            "total_amount",
            "claims_count",
            "status",
            "reconciled_amount",
            "unreconciled_amount",
            "fetched_at",
            "reconciled_at",
        ]
        read_only_fields = fields


class SHARemittanceLineSerializer(serializers.ModelSerializer):
    """Serializer for individual claim payment within a remittance."""

    claim_number = serializers.CharField(source="claim.claim_number", read_only=True, default=None)
    claim_status = serializers.CharField(source="claim.status", read_only=True, default=None)

    class Meta:
        from hmis.apps.billing.models import SHARemittanceLine

        model = SHARemittanceLine
        fields = [
            "id",
            "dha_claim_id",
            "paid_amount",
            "payment_status",
            "is_reconciled",
            "reconciled_at",
            "claim",
            "claim_number",
            "claim_status",
        ]
        read_only_fields = fields
