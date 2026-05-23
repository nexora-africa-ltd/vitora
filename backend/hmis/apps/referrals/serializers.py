"""
Serializers for the referrals module.

Provides REST API serialization for ClinicalReferral with
role-appropriate field exposure:
- Create serializer: Only fields the clinician should fill
- Detail serializer: Full record for viewing
- List serializer: Lightweight fields for table views
- Status action serializers: Accept, decline, cancel
"""

from rest_framework import serializers

from hmis.apps.clinics.models import Clinic
from hmis.apps.referrals.models import ClinicalReferral


class ClinicalReferralListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for referral list views."""

    referral_type_display = serializers.CharField(
        source="get_referral_type_display", read_only=True
    )
    target_service_display = serializers.CharField(
        source="get_target_service_display", read_only=True
    )
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    referred_by_name = serializers.SerializerMethodField()
    destination_clinic_name = serializers.CharField(
        source="destination_clinic.name", read_only=True
    )

    class Meta:
        model = ClinicalReferral
        fields = [
            "id",
            "referral_number",
            "referral_type",
            "referral_type_display",
            "target_service",
            "target_service_display",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "destination_clinic",
            "destination_clinic_name",
            "priority",
            "priority_display",
            "status",
            "status_display",
            "referred_by",
            "referred_by_name",
            "is_sensitive",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        """Return formatted patient name."""
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return ""

    def get_patient_mrn(self, obj):
        """Return patient MRN."""
        if obj.patient:
            return obj.patient.mrn
        return ""

    def get_referred_by_name(self, obj):
        """Return name of referring clinician."""
        if obj.referred_by:
            name = f"{obj.referred_by.first_name} {obj.referred_by.last_name}".strip()
            return name or obj.referred_by.username
        return ""


class ClinicalReferralSerializer(serializers.ModelSerializer):
    """Full detail serializer for ClinicalReferral."""

    referral_type_display = serializers.CharField(
        source="get_referral_type_display", read_only=True
    )
    target_service_display = serializers.CharField(
        source="get_target_service_display", read_only=True
    )
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    patient_gender = serializers.CharField(source="patient.gender", read_only=True, default="")
    patient_date_of_birth = serializers.DateField(
        source="patient.date_of_birth", read_only=True, default=None
    )
    patient_phone = serializers.SerializerMethodField()
    referred_by_name = serializers.SerializerMethodField()
    accepted_by_name = serializers.SerializerMethodField()
    declined_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()
    destination_clinic_name = serializers.CharField(
        source="destination_clinic.name", read_only=True
    )
    is_active = serializers.BooleanField(read_only=True)
    is_terminal = serializers.BooleanField(read_only=True)

    class Meta:
        model = ClinicalReferral
        fields = [
            "id",
            "referral_number",
            "referral_type",
            "referral_type_display",
            "target_service",
            "target_service_display",
            # Patient
            "patient",
            "patient_name",
            "patient_mrn",
            "patient_gender",
            "patient_date_of_birth",
            "patient_phone",
            "encounter",
            "destination_clinic",
            "destination_clinic_name",
            # Clinician input
            "reason",
            "clinical_notes",
            "hospital_course",
            "priority",
            "priority_display",
            # Clinical context
            "relevant_diagnoses",
            "relevant_vitals",
            # Admission fields
            "provisional_diagnosis",
            "provisional_diagnosis_text",
            "preferred_ward_type",
            # External fields
            "external_facility_name",
            "external_facility_code",
            "referral_letter",
            # Status & tracking
            "status",
            "status_display",
            "referred_by",
            "referred_by_name",
            "accepted_by",
            "accepted_by_name",
            "declined_by",
            "declined_by_name",
            "decline_reason",
            "cancelled_by",
            "cancelled_by_name",
            "cancel_reason",
            # Timestamps
            "accepted_at",
            "declined_at",
            "cancelled_at",
            "completed_at",
            "expires_at",
            # Linked specialist record
            "linked_module",
            "linked_model",
            "linked_object_id",
            # Other
            "clinic_visit",
            "is_sensitive",
            "is_active",
            "is_terminal",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "referral_number",
            "referral_type",
            "referred_by",
            "accepted_by",
            "declined_by",
            "cancelled_by",
            "accepted_at",
            "declined_at",
            "cancelled_at",
            "completed_at",
            "linked_module",
            "linked_model",
            "linked_object_id",
            "clinic_visit",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return ""

    def get_patient_mrn(self, obj):
        if obj.patient:
            return obj.patient.mrn
        return ""

    def get_patient_phone(self, obj):
        """Return patient phone (decrypted)."""
        if obj.patient and obj.patient.phone_number:
            return obj.patient.phone_number
        return ""

    def get_referred_by_name(self, obj):
        if obj.referred_by:
            name = f"{obj.referred_by.first_name} {obj.referred_by.last_name}".strip()
            return name or obj.referred_by.username
        return ""

    def get_accepted_by_name(self, obj):
        if obj.accepted_by:
            name = f"{obj.accepted_by.first_name} {obj.accepted_by.last_name}".strip()
            return name or obj.accepted_by.username
        return ""

    def get_declined_by_name(self, obj):
        if obj.declined_by:
            name = f"{obj.declined_by.first_name} {obj.declined_by.last_name}".strip()
            return name or obj.declined_by.username
        return ""

    def get_cancelled_by_name(self, obj):
        if obj.cancelled_by:
            name = f"{obj.cancelled_by.first_name} {obj.cancelled_by.last_name}".strip()
            return name or obj.cancelled_by.username
        return ""


class ClinicalReferralCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a referral.

    Only exposes the fields that a clinician should fill.
    Everything else is auto-populated.
    """

    destination_clinic = serializers.PrimaryKeyRelatedField(
        queryset=Clinic.objects.filter(status="ACTIVE"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ClinicalReferral
        fields = [
            "encounter",
            "target_service",
            "destination_clinic",
            "reason",
            "clinical_notes",
            "hospital_course",
            "priority",
            # Admission-specific (optional)
            "provisional_diagnosis",
            "provisional_diagnosis_text",
            "preferred_ward_type",
            # External-specific (optional)
            "external_facility_name",
            "external_facility_code",
            "referral_letter",
            # Sensitivity
            "is_sensitive",
        ]

    def validate_encounter(self, value):
        """Ensure the encounter is active."""
        if value.status in ("CLOSED", "CANCELLED"):
            raise serializers.ValidationError(
                "Cannot create referrals for closed or cancelled encounters."
            )
        return value

    def validate(self, data):
        """Cross-field validation."""
        target_service = data.get("target_service", "")
        encounter = data.get("encounter")
        destination_clinic = data.get("destination_clinic")

        # Derive referral type for validation
        referral_type = ClinicalReferral.SERVICE_TO_TYPE.get(target_service, "SPECIALTY_CLINIC")

        # Admission referrals require provisional diagnosis text
        if referral_type == "ADMISSION":
            if not data.get("provisional_diagnosis_text"):
                raise serializers.ValidationError(
                    {
                        "provisional_diagnosis_text": (
                            "Provisional diagnosis is required for admission referrals."
                        )
                    }
                )

        # External referrals require an external facility name
        if referral_type == "EXTERNAL":
            if not data.get("external_facility_name"):
                raise serializers.ValidationError(
                    {
                        "external_facility_name": (
                            "External facility name is required for external referrals."
                        )
                    }
                )

        clinic_type = ClinicalReferral.SERVICE_TO_CLINIC_TYPE.get(target_service)
        requires_destination_clinic = (
            referral_type == "SPECIALTY_CLINIC" and bool(clinic_type) and target_service != "OTHER"
        )

        if requires_destination_clinic and encounter:
            eligible_clinics = Clinic.objects.filter(
                facility=encounter.facility,
                organization=encounter.organization,
                clinic_type=clinic_type,
                status="ACTIVE",
            ).order_by("name", "id")

            if destination_clinic:
                if not eligible_clinics.filter(pk=destination_clinic.pk).exists():
                    raise serializers.ValidationError(
                        {
                            "destination_clinic": (
                                "Selected clinic is not an active routing destination for this service "
                                "in the encounter facility."
                            )
                        }
                    )
            else:
                clinic_count = eligible_clinics.count()
                if clinic_count == 1:
                    data["destination_clinic"] = eligible_clinics.first()
                elif clinic_count == 0:
                    raise serializers.ValidationError(
                        {
                            "destination_clinic": (
                                "No active clinic is configured for this referral service in the "
                                "encounter facility."
                            )
                        }
                    )
                else:
                    raise serializers.ValidationError(
                        {
                            "destination_clinic": (
                                "Multiple active clinics can receive this referral. Select the "
                                "destination clinic explicitly."
                            )
                        }
                    )

        return data

    def create(self, validated_data):
        """Create referral with auto-populated fields."""
        request = self.context.get("request")
        if request and request.user:
            validated_data["referred_by"] = request.user

        # Auto-set patient from encounter
        encounter = validated_data.get("encounter")
        if encounter:
            validated_data["patient"] = encounter.patient

        referral = ClinicalReferral(**validated_data)
        referral.snapshot_encounter_context()
        referral.save()
        return referral


class ReferralAcceptSerializer(serializers.Serializer):
    """Serializer for accepting a referral."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ReferralDeclineSerializer(serializers.Serializer):
    """Serializer for declining a referral."""

    reason = serializers.CharField(required=True, min_length=5)


class ReferralCancelSerializer(serializers.Serializer):
    """Serializer for cancelling a referral."""

    reason = serializers.CharField(required=False, allow_blank=True, default="")


class EncounterReferralSerializer(serializers.ModelSerializer):
    """
    Compact serializer for showing referrals within an encounter detail.

    Used in the encounter detail page's "Referrals" tab.
    """

    target_service_display = serializers.CharField(
        source="get_target_service_display", read_only=True
    )
    referral_type_display = serializers.CharField(
        source="get_referral_type_display", read_only=True
    )
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    referred_by_name = serializers.SerializerMethodField()
    destination_clinic_name = serializers.CharField(
        source="destination_clinic.name", read_only=True
    )

    class Meta:
        model = ClinicalReferral
        fields = [
            "id",
            "referral_number",
            "referral_type",
            "referral_type_display",
            "target_service",
            "target_service_display",
            "destination_clinic",
            "destination_clinic_name",
            "reason",
            "priority",
            "priority_display",
            "status",
            "status_display",
            "referred_by_name",
            "is_sensitive",
            "created_at",
        ]

    def get_referred_by_name(self, obj):
        if obj.referred_by:
            name = f"{obj.referred_by.first_name} {obj.referred_by.last_name}".strip()
            return name or obj.referred_by.username
        return ""
