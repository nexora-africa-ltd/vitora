"""Serializers for the insurance app."""

from rest_framework import serializers

from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsuranceClaimItem,
    InsurancePlan,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceProviderConfig,
    InsuranceRemittance,
    InsuranceRemittanceLine,
    PatientInsurance,
    PayerTariff,
)


# ---------------------------------------------------------------------------
# InsuranceProvider
# ---------------------------------------------------------------------------
class InsuranceProviderSerializer(serializers.ModelSerializer):
    plans_count = serializers.IntegerField(read_only=True, default=0)
    active_enrollments_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = InsuranceProvider
        fields = [
            "id",
            "name",
            "code",
            "provider_type",
            "status",
            "contact_email",
            "contact_phone",
            "contact_person",
            "address",
            "website",
            "api_integration_enabled",
            "notes",
            "plans_count",
            "active_enrollments_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class InsuranceProviderCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsuranceProvider
        fields = [
            "name",
            "code",
            "provider_type",
            "status",
            "contact_email",
            "contact_phone",
            "contact_person",
            "address",
            "website",
            "api_integration_enabled",
            "notes",
        ]


# ---------------------------------------------------------------------------
# InsurancePlan
# ---------------------------------------------------------------------------
class InsurancePlanSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)

    class Meta:
        model = InsurancePlan
        fields = [
            "id",
            "provider",
            "provider_name",
            "name",
            "code",
            "plan_type",
            "coverage_type",
            "default_copay_percent",
            "annual_limit",
            "per_visit_limit",
            "preauth_required",
            "preauth_threshold",
            "waiting_period_days",
            "exclusions",
            "status",
            "effective_from",
            "effective_to",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class InsurancePlanCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsurancePlan
        fields = [
            "provider",
            "name",
            "code",
            "plan_type",
            "coverage_type",
            "default_copay_percent",
            "annual_limit",
            "per_visit_limit",
            "preauth_required",
            "preauth_threshold",
            "waiting_period_days",
            "exclusions",
            "status",
            "effective_from",
            "effective_to",
            "notes",
        ]


# ---------------------------------------------------------------------------
# PatientInsurance
# ---------------------------------------------------------------------------
class PatientInsuranceSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    patient_name = serializers.SerializerMethodField()
    is_valid = serializers.BooleanField(read_only=True)
    copay_percent = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)

    class Meta:
        model = PatientInsurance
        fields = [
            "id",
            "patient",
            "plan",
            "plan_name",
            "provider",
            "provider_name",
            "patient_name",
            "member_number",
            "policy_number",
            "member_type",
            "principal_member",
            "principal_name",
            "employer",
            "status",
            "valid_from",
            "valid_to",
            "copay_override",
            "annual_balance",
            "is_primary",
            "is_valid",
            "copay_percent",
            "days_until_expiry",
            "verified_at",
            "verified_by",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "provider",
            "is_valid",
            "copay_percent",
            "days_until_expiry",
            "verified_at",
            "verified_by",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class PatientInsuranceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientInsurance
        fields = [
            "patient",
            "plan",
            "member_number",
            "policy_number",
            "member_type",
            "principal_member",
            "principal_name",
            "employer",
            "status",
            "valid_from",
            "valid_to",
            "copay_override",
            "annual_balance",
            "is_primary",
            "notes",
        ]


# ---------------------------------------------------------------------------
# InsuranceProviderConfig
# ---------------------------------------------------------------------------
class InsuranceProviderConfigSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    is_contract_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = InsuranceProviderConfig
        fields = [
            "id",
            "provider",
            "provider_name",
            "facility_name",
            "contract_number",
            "contract_start",
            "contract_end",
            "accreditation_status",
            "accreditation_number",
            "api_base_url",
            "api_auth_type",
            "api_credentials",
            "api_enabled",
            "max_claim_amount",
            "submission_format",
            "is_contract_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_contract_active", "created_at", "updated_at"]
        extra_kwargs = {
            "api_credentials": {"write_only": True},
        }


# ---------------------------------------------------------------------------
# InsuranceClaim
# ---------------------------------------------------------------------------
class InsuranceClaimItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsuranceClaimItem
        fields = [
            "id",
            "claim",
            "invoice_item",
            "service_description",
            "service_code",
            "quantity",
            "unit_price",
            "claimed_amount",
            "approved_amount",
            "rejection_reason",
            "tariff_code",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "claim", "created_at", "updated_at"]


class InsuranceClaimSerializer(serializers.ModelSerializer):
    items = InsuranceClaimItemSerializer(many=True, read_only=True)
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    patient_name = serializers.SerializerMethodField()
    member_number = serializers.CharField(source="patient_insurance.member_number", read_only=True)
    plan_name = serializers.CharField(source="patient_insurance.plan.name", read_only=True)
    days_since_submission = serializers.IntegerField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    is_appealable = serializers.BooleanField(read_only=True)

    class Meta:
        model = InsuranceClaim
        fields = [
            "id",
            "claim_number",
            "invoice",
            "patient_insurance",
            "provider",
            "provider_name",
            "patient",
            "patient_name",
            "member_number",
            "plan_name",
            "encounter",
            "preauth",
            "status",
            "claim_type",
            "diagnosis_codes",
            "service_date",
            "admission_date",
            "discharge_date",
            "submission_date",
            "total_amount",
            "approved_amount",
            "copay_amount",
            "paid_amount",
            "external_claim_id",
            "external_preauth_id",
            "rejection_reason",
            "query_details",
            "query_response",
            "submitted_by",
            "reviewed_by",
            "notes",
            "days_since_submission",
            "is_overdue",
            "is_appealable",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "claim_number",
            "days_since_submission",
            "is_overdue",
            "is_appealable",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class InsuranceClaimCreateSerializer(serializers.ModelSerializer):
    items = InsuranceClaimItemSerializer(many=True, required=False)

    class Meta:
        model = InsuranceClaim
        fields = [
            "invoice",
            "patient_insurance",
            "patient",
            "encounter",
            "preauth",
            "claim_type",
            "diagnosis_codes",
            "service_date",
            "admission_date",
            "discharge_date",
            "total_amount",
            "copay_amount",
            "notes",
            "items",
        ]

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        claim = InsuranceClaim.objects.create(**validated_data)
        for item_data in items_data:
            InsuranceClaimItem.objects.create(claim=claim, **item_data)
        return claim


# Action serializers
class InsuranceClaimSubmitSerializer(serializers.Serializer):
    """Input for submitting a claim."""

    pass


class InsuranceClaimApproveSerializer(serializers.Serializer):
    approved_amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class InsuranceClaimRejectSerializer(serializers.Serializer):
    reason = serializers.CharField()


class InsuranceClaimQuerySerializer(serializers.Serializer):
    details = serializers.CharField()


class InsuranceClaimQueryResponseSerializer(serializers.Serializer):
    response = serializers.CharField()


class InsuranceClaimPaySerializer(serializers.Serializer):
    paid_amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class InsuranceClaimAppealSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, default="")


class InsuranceClaimCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, default="")


# ---------------------------------------------------------------------------
# InsurancePreauth
# ---------------------------------------------------------------------------
class InsurancePreauthSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    patient_name = serializers.SerializerMethodField()
    member_number = serializers.CharField(source="patient_insurance.member_number", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = InsurancePreauth
        fields = [
            "id",
            "preauth_number",
            "patient_insurance",
            "provider",
            "provider_name",
            "patient",
            "patient_name",
            "member_number",
            "status",
            "preauth_type",
            "diagnosis_codes",
            "requested_services",
            "estimated_cost",
            "approved_amount",
            "validity_period_days",
            "approved_at",
            "expires_at",
            "external_preauth_id",
            "clinical_notes",
            "rejection_reason",
            "submitted_by",
            "reviewed_by",
            "notes",
            "is_expired",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "preauth_number",
            "is_expired",
            "is_active",
            "approved_at",
            "expires_at",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class InsurancePreauthCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsurancePreauth
        fields = [
            "patient_insurance",
            "patient",
            "preauth_type",
            "diagnosis_codes",
            "requested_services",
            "estimated_cost",
            "clinical_notes",
            "notes",
        ]


class InsurancePreauthApproveSerializer(serializers.Serializer):
    approved_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    validity_days = serializers.IntegerField(default=30)


class InsurancePreauthDenySerializer(serializers.Serializer):
    reason = serializers.CharField()


class InsurancePreauthCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, default="")


# ---------------------------------------------------------------------------
# InsuranceRemittance
# ---------------------------------------------------------------------------
class InsuranceRemittanceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsuranceRemittanceLine
        fields = [
            "id",
            "remittance",
            "claim",
            "claim_number",
            "member_number",
            "paid_amount",
            "deductions",
            "net_amount",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class InsuranceRemittanceSerializer(serializers.ModelSerializer):
    lines = InsuranceRemittanceLineSerializer(many=True, read_only=True)
    provider_name = serializers.CharField(source="provider.name", read_only=True)

    class Meta:
        model = InsuranceRemittance
        fields = [
            "id",
            "provider",
            "provider_name",
            "remittance_number",
            "remittance_date",
            "total_amount",
            "reconciled_amount",
            "status",
            "payment_method",
            "payment_reference",
            "bank_reference",
            "received_at",
            "reconciled_at",
            "notes",
            "lines",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reconciled_amount",
            "reconciled_at",
            "created_at",
            "updated_at",
        ]


class InsuranceRemittanceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsuranceRemittance
        fields = [
            "provider",
            "remittance_number",
            "remittance_date",
            "total_amount",
            "payment_method",
            "payment_reference",
            "bank_reference",
            "received_at",
            "notes",
        ]


# ---------------------------------------------------------------------------
# PayerTariff
# ---------------------------------------------------------------------------
class PayerTariffSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True, allow_null=True)
    service_name = serializers.CharField(source="service.name", read_only=True, allow_null=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = PayerTariff
        fields = [
            "id",
            "provider",
            "provider_name",
            "plan",
            "plan_name",
            "service",
            "service_name",
            "service_code",
            "payer_code",
            "payer_description",
            "tariff_amount",
            "facility_charge",
            "requires_preauth",
            "effective_from",
            "effective_to",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]


class PayerTariffCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayerTariff
        fields = [
            "provider",
            "plan",
            "service",
            "service_code",
            "payer_code",
            "payer_description",
            "tariff_amount",
            "facility_charge",
            "requires_preauth",
            "effective_from",
            "effective_to",
            "notes",
        ]
