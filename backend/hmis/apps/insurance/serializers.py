# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Serializers for the insurance app."""

from django.core.files.storage import default_storage
from rest_framework import serializers

from hmis.apps.insurance.media_security import build_card_image_url, save_encrypted_card_image
from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsuranceClaimItem,
    InsurancePlan,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceProviderConfig,
    InsuranceRemittance,
    InsuranceRemittanceLine,
    InsuranceVisitAuthorization,
    PatientInsurance,
    PayerTariff,
)
from hmis.apps.insurance.payer_mappings import infer_healthcloud_payer_slade_code


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
            "logo",
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
            "logo",
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
    card_image_front = serializers.SerializerMethodField()
    card_image_back = serializers.SerializerMethodField()
    has_card_image_front = serializers.SerializerMethodField()
    has_card_image_back = serializers.SerializerMethodField()

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
            "last_eligibility_checked_at",
            "last_eligibility_eligible",
            "last_eligibility_status",
            "last_eligibility_payload",
            "notes",
            "card_image_front",
            "card_image_back",
            "has_card_image_front",
            "has_card_image_back",
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
            "last_eligibility_checked_at",
            "last_eligibility_eligible",
            "last_eligibility_status",
            "last_eligibility_payload",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def _build_signed_url(self, obj, side: str) -> str | None:
        field = obj.card_image_front if side == "front" else obj.card_image_back
        if not field:
            return None
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not request or not user or not user.is_authenticated:
            return None
        return build_card_image_url(
            request=request,
            enrollment_id=obj.id,
            side=side,
            user_id=user.id,
        )

    def get_card_image_front(self, obj):
        return self._build_signed_url(obj, "front")

    def get_card_image_back(self, obj):
        return self._build_signed_url(obj, "back")

    def get_has_card_image_front(self, obj):
        return bool(obj.card_image_front)

    def get_has_card_image_back(self, obj):
        return bool(obj.card_image_back)


class PatientInsuranceCreateSerializer(serializers.ModelSerializer):
    remove_card_image_front = serializers.BooleanField(
        write_only=True, required=False, default=False
    )
    remove_card_image_back = serializers.BooleanField(
        write_only=True, required=False, default=False
    )

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
            "card_image_front",
            "card_image_back",
            "remove_card_image_front",
            "remove_card_image_back",
            "notes",
        ]

    _MISSING = object()

    def validate(self, attrs):
        attrs = super().validate(attrs)

        patient = attrs.get("patient") or getattr(self.instance, "patient", None)
        plan = attrs.get("plan") or getattr(self.instance, "plan", None)
        member_number = attrs.get("member_number")
        if member_number is None:
            member_number = getattr(self.instance, "member_number", "")
        member_number = (member_number or "").strip()

        status = attrs.get("status") or getattr(
            self.instance, "status", PatientInsurance.Status.ACTIVE
        )

        if not patient or not plan or not member_number:
            return attrs

        same_enrollment_qs = PatientInsurance.objects.filter(
            patient=patient,
            plan=plan,
            member_number=member_number,
        )
        if self.instance is not None:
            same_enrollment_qs = same_enrollment_qs.exclude(pk=self.instance.pk)

        if same_enrollment_qs.exists():
            raise serializers.ValidationError(
                {
                    "non_field_errors": [
                        "This patient is already enrolled on the selected plan with this member number."
                    ]
                }
            )

        if status != PatientInsurance.Status.ACTIVE:
            return attrs

        duplicate_qs = PatientInsurance.objects.filter(
            provider=plan.provider,
            status=PatientInsurance.Status.ACTIVE,
            member_number=member_number,
        )
        if self.instance is not None:
            duplicate_qs = duplicate_qs.exclude(pk=self.instance.pk)

        if duplicate_qs.exists():
            existing = duplicate_qs.select_related("patient").first()
            patient_label = (
                f"{existing.patient.first_name} {existing.patient.last_name}"
                if existing and existing.patient_id
                else "another patient"
            )
            raise serializers.ValidationError(
                {
                    "member_number": (
                        "An active enrollment already exists for this provider and member number "
                        f"({patient_label})."
                    )
                }
            )

        attrs["member_number"] = member_number
        return attrs

    def create(self, validated_data):
        front = validated_data.pop("card_image_front", self._MISSING)
        back = validated_data.pop("card_image_back", self._MISSING)
        remove_front = validated_data.pop("remove_card_image_front", False)
        remove_back = validated_data.pop("remove_card_image_back", False)
        instance = super().create(validated_data)
        self._save_card_images(
            instance,
            front=front,
            back=back,
            remove_front=remove_front,
            remove_back=remove_back,
        )
        return instance

    def update(self, instance, validated_data):
        previous_member_number = instance.member_number
        previous_plan_id = instance.plan_id

        front = validated_data.pop("card_image_front", self._MISSING)
        back = validated_data.pop("card_image_back", self._MISSING)
        remove_front = validated_data.pop("remove_card_image_front", False)
        remove_back = validated_data.pop("remove_card_image_back", False)
        instance = super().update(instance, validated_data)

        core_identifiers_changed = (
            instance.member_number != previous_member_number or instance.plan_id != previous_plan_id
        )
        if core_identifiers_changed:
            instance.status = PatientInsurance.Status.PENDING_VERIFICATION
            instance.last_eligibility_checked_at = None
            instance.last_eligibility_eligible = None
            instance.last_eligibility_status = ""
            instance.last_eligibility_payload = {}
            instance.save(
                update_fields=[
                    "status",
                    "last_eligibility_checked_at",
                    "last_eligibility_eligible",
                    "last_eligibility_status",
                    "last_eligibility_payload",
                    "updated_at",
                ]
            )
            instance.visit_authorizations.exclude(
                status__in=[
                    InsuranceVisitAuthorization.Status.FAILED,
                    InsuranceVisitAuthorization.Status.EXPIRED,
                ]
            ).update(
                status=InsuranceVisitAuthorization.Status.EXPIRED,
                workflow_step="enrollment_updated",
                last_error=(
                    "Enrollment identifiers changed. Re-verify eligibility and restart authorization flow."
                ),
            )

        self._save_card_images(
            instance,
            front=front,
            back=back,
            remove_front=remove_front,
            remove_back=remove_back,
        )
        return instance

    @staticmethod
    def _replace_file(existing_name: str | None):
        if existing_name and default_storage.exists(existing_name):
            default_storage.delete(existing_name)

    def _save_card_images(
        self,
        instance,
        *,
        front=_MISSING,
        back=_MISSING,
        remove_front=False,
        remove_back=False,
    ):
        update_fields: list[str] = []

        if remove_front or front is None:
            self._replace_file(
                instance.card_image_front.name if instance.card_image_front else None
            )
            instance.card_image_front = None
            update_fields.append("card_image_front")
        elif front is not self._MISSING:
            self._replace_file(
                instance.card_image_front.name if instance.card_image_front else None
            )
            instance.card_image_front = save_encrypted_card_image(
                enrollment=instance,
                side="front",
                uploaded_file=front,
            )
            update_fields.append("card_image_front")

        if remove_back or back is None:
            self._replace_file(instance.card_image_back.name if instance.card_image_back else None)
            instance.card_image_back = None
            update_fields.append("card_image_back")
        elif back is not self._MISSING:
            self._replace_file(instance.card_image_back.name if instance.card_image_back else None)
            instance.card_image_back = save_encrypted_card_image(
                enrollment=instance,
                side="back",
                uploaded_file=back,
            )
            update_fields.append("card_image_back")

        if update_fields:
            instance.save(update_fields=[*update_fields, "updated_at"])


class VerifyEnrollmentPreviewSerializer(serializers.Serializer):
    plan = serializers.IntegerField(min_value=1, required=False)
    provider = serializers.IntegerField(min_value=1, required=False)
    member_number = serializers.CharField()
    policy_number = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("plan") and not attrs.get("provider"):
            raise serializers.ValidationError(
                {"non_field_errors": ["Either plan or provider is required."]}
            )
        return attrs


# ---------------------------------------------------------------------------
# InsuranceProviderConfig
# ---------------------------------------------------------------------------
class InsuranceProviderConfigSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    is_contract_active = serializers.BooleanField(read_only=True)
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

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
            "auth_base_url",
            "provider_edi_base_url",
            "provider_is_base_url",
            "api_auth_type",
            "api_credentials",
            "api_key",
            "api_secret",
            "api_username",
            "api_password",
            "api_token",
            "api_enabled",
            "healthcloud_enabled",
            "payer_slade_code",
            "require_visit_authorization",
            "require_balance_reservation",
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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        provider = attrs.get("provider") or getattr(self.instance, "provider", None)
        payer_code = attrs.get("payer_slade_code")
        if provider and payer_code is None:
            inferred = infer_healthcloud_payer_slade_code(provider)
            if inferred is not None:
                attrs["payer_slade_code"] = inferred

        api_enabled = attrs.get("api_enabled")
        if api_enabled is None and self.instance is not None:
            api_enabled = self.instance.api_enabled
        healthcloud_enabled = attrs.get("healthcloud_enabled")
        if healthcloud_enabled is None and self.instance is not None:
            healthcloud_enabled = self.instance.healthcloud_enabled

        if api_enabled and healthcloud_enabled:
            required_hosts = ("auth_base_url", "provider_edi_base_url", "provider_is_base_url")
            missing = []
            for field in required_hosts:
                value = attrs.get(field)
                if value is None and self.instance is not None:
                    value = getattr(self.instance, field, "")
                if not value:
                    missing.append(field)

            if missing:
                raise serializers.ValidationError(
                    dict.fromkeys(
                        missing, "This field is required when API and HealthCloud are enabled."
                    )
                )

            final_payer_code = attrs.get("payer_slade_code")
            if final_payer_code is None and self.instance is not None:
                final_payer_code = self.instance.payer_slade_code
            if final_payer_code is None:
                raise serializers.ValidationError(
                    {
                        "payer_slade_code": (
                            "This field is required when API and HealthCloud are enabled. "
                            "Use a known mapped provider or set the payer code explicitly."
                        )
                    }
                )
        return attrs

    def create(self, validated_data):
        secret_fields = {
            "api_key": validated_data.pop("api_key", ""),
            "api_secret": validated_data.pop("api_secret", ""),
            "api_username": validated_data.pop("api_username", ""),
            "api_password": validated_data.pop("api_password", ""),
            "api_token": validated_data.pop("api_token", ""),
        }
        instance = super().create(validated_data)
        for field, value in secret_fields.items():
            if value:
                setattr(instance, field, value)
        if any(secret_fields.values()):
            instance.save(update_fields=[*(k for k, v in secret_fields.items() if v), "updated_at"])
        return instance

    def update(self, instance, validated_data):
        secret_fields = {
            "api_key": validated_data.pop("api_key", ""),
            "api_secret": validated_data.pop("api_secret", ""),
            "api_username": validated_data.pop("api_username", ""),
            "api_password": validated_data.pop("api_password", ""),
            "api_token": validated_data.pop("api_token", ""),
        }
        instance = super().update(instance, validated_data)
        for field, value in secret_fields.items():
            if value:
                setattr(instance, field, value)
        if any(secret_fields.values()):
            instance.save(update_fields=[*(k for k, v in secret_fields.items() if v), "updated_at"])
        return instance


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
            "attachments_meta",
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

    def validate(self, attrs):
        enrollment = attrs.get("patient_insurance")
        patient = attrs.get("patient")
        encounter = attrs.get("encounter")
        claim_type = attrs.get("claim_type", InsuranceClaim.ClaimType.OUTPATIENT)

        encounter_required_types = {
            InsuranceClaim.ClaimType.OUTPATIENT,
            InsuranceClaim.ClaimType.INPATIENT,
        }

        if claim_type in encounter_required_types and encounter is None:
            raise serializers.ValidationError(
                {
                    "encounter": (
                        "Encounter is required for outpatient and inpatient claims so visit context and diagnoses can be linked."
                    )
                }
            )

        if enrollment and patient and enrollment.patient_id != patient.id:
            raise serializers.ValidationError(
                {
                    "patient": "Selected patient must match the selected patient insurance enrollment."
                }
            )

        if encounter and patient and encounter.patient_id != patient.id:
            raise serializers.ValidationError(
                {"encounter": "Selected encounter must belong to the selected patient."}
            )

        if encounter and enrollment and encounter.patient_id != enrollment.patient_id:
            raise serializers.ValidationError(
                {
                    "encounter": (
                        "Selected encounter must belong to the patient linked to the selected enrollment."
                    )
                }
            )

        return attrs


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


class RequestOTPSerializer(serializers.Serializer):
    contact_id = serializers.IntegerField(min_value=1)


class HealthCloudSessionRequestOTPSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(min_value=1)
    contact_id = serializers.IntegerField(min_value=1)


class StartVisitSerializer(serializers.Serializer):
    beneficiary_id = serializers.IntegerField()
    benefit_type = serializers.CharField()
    benefit_code = serializers.CharField()
    policy_number = serializers.CharField()
    policy_effective_date = serializers.CharField()
    otp = serializers.CharField()
    beneficiary_contact = serializers.IntegerField()
    factors = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=["OTP"],
    )
    scheme_name = serializers.CharField(required=False, allow_blank=True, default="")
    scheme_code = serializers.CharField(required=False, allow_blank=True, default="")
    encounter = serializers.IntegerField(required=False)


class HealthCloudSessionStartVisitSerializer(StartVisitSerializer):
    session_id = serializers.IntegerField(min_value=1)


class InsuranceVisitAuthorizationSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = InsuranceVisitAuthorization
        fields = [
            "id",
            "enrollment",
            "provider_config",
            "patient",
            "patient_name",
            "encounter",
            "member_number",
            "payer_slade_code",
            "benefit_type",
            "benefit_code",
            "policy_number",
            "beneficiary_id",
            "beneficiary_contact_id",
            "beneficiary_contact_value",
            "selected_beneficiary_contact_id",
            "selected_beneficiary_contact_value",
            "selected_benefit_type",
            "selected_benefit_code",
            "factors",
            "eligibility_payload",
            "workflow_step",
            "status",
            "auth_token",
            "authorization_guid",
            "authorization_date",
            "auth_expiry",
            "auth_status",
            "last_error",
            "raw_payload",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "auth_token",
            "authorization_guid",
            "authorization_date",
            "auth_expiry",
            "auth_status",
            "last_error",
            "selected_beneficiary_contact_id",
            "selected_beneficiary_contact_value",
            "selected_benefit_type",
            "selected_benefit_code",
            "eligibility_payload",
            "workflow_step",
            "raw_payload",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class ValidateAuthorizationSerializer(serializers.Serializer):
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    other_names = serializers.CharField(required=False, allow_blank=True, default="")
    member_number = serializers.CharField()
    auth_token = serializers.CharField()
    visit_type = serializers.ChoiceField(choices=["OUTPATIENT", "INPATIENT"], required=False)
    scheme_code = serializers.CharField(required=False, allow_blank=True, default="")
    scheme_name = serializers.CharField(required=False, allow_blank=True, default="")
    payer_code = serializers.CharField(required=False, allow_blank=True, default="")


class ReserveBalanceSerializer(serializers.Serializer):
    authorization_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    invoice_number = serializers.CharField()


class SubmitInvoiceSerializer(serializers.Serializer):
    claim = serializers.CharField(required=False)
    invoice_number = serializers.CharField()
    invoice_date = serializers.CharField()
    copays = serializers.ListField(required=False, default=list)
    lines = serializers.ListField()


class SubmitCreditNoteSerializer(serializers.Serializer):
    claim = serializers.CharField(required=False)
    invoice_number = serializers.CharField()
    invoice_date = serializers.CharField()
    lines = serializers.ListField()


class UploadClaimAttachmentSerializer(serializers.Serializer):
    claim = serializers.CharField(required=False)
    attachment = serializers.CharField()
    attachment_type = serializers.CharField()
    description = serializers.CharField(required=False, allow_blank=True, default="")
