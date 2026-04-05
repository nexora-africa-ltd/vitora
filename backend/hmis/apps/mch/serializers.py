"""Serializers for the MCH (Maternal & Child Health) module."""

import json
from datetime import date as date_module

from rest_framework import serializers

from hmis.apps.clinics.models import ClinicVisit
from hmis.apps.inpatient.models import Admission, Discharge
from hmis.apps.mch.models import (
    AEFI,
    ANCVisit,
    CommunityScreening,
    Delivery,
    GrowthMeasurement,
    LabourPartograph,
    LabourPartographObservation,
    HEIFollowUp,
    HEIPCRTest,
    ImmunizationRecord,
    MCHRegistration,
    PNCVisit,
    Vaccine,
    VitaminASupplement,
)

# =============================================================================
# MCH Registration Serializers
# =============================================================================


class MCHRegistrationListSerializer(serializers.ModelSerializer):
    """Lean serializer for MCH registration list."""

    mother_name = serializers.SerializerMethodField()
    mother_mrn = serializers.CharField(source="mother.mrn", read_only=True)
    edd = serializers.SerializerMethodField()
    gestation_display = serializers.SerializerMethodField()
    trimester = serializers.SerializerMethodField()
    gravida = serializers.SerializerMethodField()
    parity = serializers.SerializerMethodField()
    current_gestation_weeks = serializers.SerializerMethodField()
    anc_visit_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = MCHRegistration
        fields = [
            "id",
            "mch_number",
            "mother",
            "mother_name",
            "mother_mrn",
            "registration_date",
            "status",
            "is_high_risk",
            "linda_jamii_beneficiary",
            "edd",
            "gestation_display",
            "trimester",
            "gravida",
            "parity",
            "current_gestation_weeks",
            "anc_visit_count",
            "created_at",
        ]

    def get_mother_name(self, obj):
        return f"{obj.mother.first_name} {obj.mother.last_name}"

    def get_edd(self, obj):
        return obj.edd

    def get_gestation_display(self, obj):
        return obj.gestation_display

    def get_trimester(self, obj):
        return obj.trimester

    def get_gravida(self, obj):
        enrollment = obj.anc_enrollment
        return enrollment.gravida if enrollment else None

    def get_parity(self, obj):
        enrollment = obj.anc_enrollment
        return enrollment.para if enrollment else None

    def get_current_gestation_weeks(self, obj):
        frozen = obj._gestation_at_delivery()
        if frozen is not None:
            return frozen[0]
        enrollment = obj.anc_enrollment
        return enrollment.gestation_weeks() if enrollment else None


class MCHRegistrationSerializer(serializers.ModelSerializer):
    """Full serializer for MCH registration detail."""

    mother_name = serializers.SerializerMethodField()
    mother_mrn = serializers.CharField(source="mother.mrn", read_only=True)
    baby_name = serializers.SerializerMethodField()
    baby_mrn = serializers.SerializerMethodField()
    baby_count = serializers.IntegerField(read_only=True)
    is_multiple_pregnancy = serializers.BooleanField(read_only=True)
    all_babies_info = serializers.SerializerMethodField()
    inter_pregnancy_interval_days = serializers.SerializerMethodField()
    edd = serializers.SerializerMethodField()
    gestation_display = serializers.SerializerMethodField()
    trimester = serializers.SerializerMethodField()
    gravida = serializers.SerializerMethodField()
    parity = serializers.SerializerMethodField()
    current_gestation_weeks = serializers.SerializerMethodField()
    anc_visit_count = serializers.IntegerField(read_only=True)
    pnc_visit_count = serializers.IntegerField(read_only=True)
    registered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MCHRegistration
        fields = [
            "id",
            "mch_number",
            "mother",
            "mother_name",
            "mother_mrn",
            "anc_enrollment",
            "baby",
            "baby_name",
            "baby_mrn",
            "baby_count",
            "is_multiple_pregnancy",
            "all_babies_info",
            "inter_pregnancy_interval_days",
            "registration_date",
            "status",
            "is_high_risk",
            "risk_factors",
            "sha_claimable",
            "linda_jamii_beneficiary",
            "gbv_related",
            "is_sensitive",
            "registered_by",
            "registered_by_name",
            "notes",
            "completed_at",
            "edd",
            "gestation_display",
            "trimester",
            "gravida",
            "parity",
            "current_gestation_weeks",
            "anc_visit_count",
            "pnc_visit_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "mch_number",
            "is_sensitive",
            "registered_by",
            "completed_at",
        ]

    def get_mother_name(self, obj):
        return f"{obj.mother.first_name} {obj.mother.last_name}"

    def get_baby_name(self, obj):
        if obj.baby:
            return f"{obj.baby.first_name} {obj.baby.last_name}"
        return None

    def get_baby_mrn(self, obj):
        if obj.baby:
            return obj.baby.mrn
        return None

    def get_all_babies_info(self, obj):
        """Return list of all babies for this registration (supports twins/multiples)."""
        babies = obj.all_babies
        return [
            {
                "id": baby.id,
                "name": f"{baby.first_name} {baby.last_name}",
                "mrn": baby.mrn,
                "gender": baby.gender,
                "date_of_birth": str(baby.date_of_birth) if baby.date_of_birth else None,
            }
            for baby in babies
        ]

    def get_inter_pregnancy_interval_days(self, obj):
        return obj.inter_pregnancy_interval_days

    def get_edd(self, obj):
        return obj.edd

    def get_gestation_display(self, obj):
        return obj.gestation_display

    def get_trimester(self, obj):
        return obj.trimester

    def get_registered_by_name(self, obj):
        if obj.registered_by:
            return f"{obj.registered_by.first_name} {obj.registered_by.last_name}".strip() or obj.registered_by.username
        return None

    def get_gravida(self, obj):
        enrollment = obj.anc_enrollment
        return enrollment.gravida if enrollment else None

    def get_parity(self, obj):
        enrollment = obj.anc_enrollment
        return enrollment.para if enrollment else None

    def get_current_gestation_weeks(self, obj):
        frozen = obj._gestation_at_delivery()
        if frozen is not None:
            return frozen[0]
        enrollment = obj.anc_enrollment
        return enrollment.gestation_weeks() if enrollment else None


class MCHRegistrationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating MCH registrations."""

    class Meta:
        model = MCHRegistration
        fields = [
            "mother",
            "anc_enrollment",
            "registration_date",
            "is_high_risk",
            "risk_factors",
            "sha_claimable",
            "linda_jamii_beneficiary",
            "gbv_related",
            "notes",
        ]


class PregnancyHistorySerializer(serializers.ModelSerializer):
    """Lean serializer for pregnancy history — past registrations for the same mother."""

    edd = serializers.SerializerMethodField()
    delivery_date = serializers.SerializerMethodField()
    delivery_outcome = serializers.SerializerMethodField()
    baby_count = serializers.IntegerField(read_only=True)
    inter_pregnancy_interval_days = serializers.SerializerMethodField()

    class Meta:
        model = MCHRegistration
        fields = [
            "id",
            "mch_number",
            "registration_date",
            "status",
            "edd",
            "delivery_date",
            "delivery_outcome",
            "baby_count",
            "inter_pregnancy_interval_days",
            "completed_at",
        ]

    def get_edd(self, obj):
        return obj.edd

    def get_delivery_date(self, obj):
        delivery = obj.deliveries.order_by("-delivery_date").first()
        return str(delivery.delivery_date) if delivery else None

    def get_delivery_outcome(self, obj):
        delivery = obj.deliveries.order_by("-delivery_date").first()
        return delivery.delivery_outcome if delivery else None

    def get_inter_pregnancy_interval_days(self, obj):
        return obj.inter_pregnancy_interval_days


# =============================================================================
# ANC Visit Serializers
# =============================================================================


class ANCVisitSerializer(serializers.ModelSerializer):
    """Full serializer for ANC visit."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    conducted_by_name = serializers.SerializerMethodField()
    alerts = serializers.SerializerMethodField()
    is_fetal_heart_rate_normal = serializers.BooleanField(read_only=True)
    clinic_visit = serializers.PrimaryKeyRelatedField(
        queryset=ClinicVisit.objects.select_related("session__clinic", "patient", "encounter"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ANCVisit
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "encounter",
            "clinic_visit",
            "visit_number",
            "visit_date",
            "gestation_weeks",
            "weight",
            "blood_pressure",
            "fundal_height",
            "fetal_heart_rate",
            "presentation",
            "lie",
            "fetal_movements",
            "urine_protein",
            "urine_glucose",
            "hb_level",
            "blood_sugar",
            "hiv_test_done",
            "syphilis_test_done",
            "iron_folate_given",
            "calcium_given",
            "deworming_given",
            "tetanus_toxoid_dose",
            "next_visit_date",
            "notes",
            "conducted_by",
            "conducted_by_name",
            "alerts",
            "is_fetal_heart_rate_normal",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["gestation_weeks"]

    def get_conducted_by_name(self, obj):
        if obj.conducted_by:
            return f"{obj.conducted_by.first_name} {obj.conducted_by.last_name}".strip() or obj.conducted_by.username
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class CommunityScreeningPhotoSerializer(serializers.Serializer):
    uri = serializers.CharField()
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)
    captured_at = serializers.DateTimeField()


class CommunityScreeningListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()

    class Meta:
        model = CommunityScreening
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "screening_type",
            "screening_date",
            "chu_name",
            "territory",
            "result_summary",
            "notes",
            "muac_mm",
            "edema_present",
            "fever_present",
            "cough_duration_days",
            "household_contact_name",
            "malaria_rdt_result",
            "malaria_treatment_referred",
            "tb_referral_made",
            "location",
            "photo",
            "captured_by",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        return obj.patient_name

    def get_patient_mrn(self, obj):
        return obj.patient_mrn

    def get_photo(self, obj):
        if not obj.photo:
            return None

        request = self.context.get("request")
        uri = obj.photo.url
        if request is not None:
            uri = request.build_absolute_uri(uri)

        return {
            "uri": uri,
            "width": None,
            "height": None,
            "captured_at": obj.updated_at,
        }


class CommunityScreeningSerializer(CommunityScreeningListSerializer):
    photo_upload = serializers.FileField(required=False, allow_null=True, write_only=True)
    location = serializers.JSONField(required=False, allow_null=True)

    class Meta(CommunityScreeningListSerializer.Meta):
        fields = CommunityScreeningListSerializer.Meta.fields + ["photo_upload"]
        read_only_fields = [
            "result_summary",
            "captured_by",
            "created_at",
            "updated_at",
        ]

    def to_internal_value(self, data):
        if hasattr(data, "copy"):
            mutable = data.copy()
        else:
            mutable = dict(data)

        if "patient_name" in mutable and "patient_name_snapshot" not in mutable:
            mutable["patient_name_snapshot"] = mutable.get("patient_name")
        if "patient_mrn" in mutable and "patient_mrn_snapshot" not in mutable:
            mutable["patient_mrn_snapshot"] = mutable.get("patient_mrn")

        return super().to_internal_value(mutable)

    def validate_location(self, value):
        if value in (None, ""):
            return None
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError("Location must be valid JSON.") from exc
        return value

    def create(self, validated_data):
        photo_upload = validated_data.pop("photo_upload", None)
        if photo_upload is not None:
            validated_data["photo"] = photo_upload
        return super().create(validated_data)

    def update(self, instance, validated_data):
        photo_upload = validated_data.pop("photo_upload", None)
        if photo_upload is not None:
            validated_data["photo"] = photo_upload
        return super().update(instance, validated_data)


class ANCVisitListSerializer(serializers.ModelSerializer):
    """Lean serializer for ANC visit list."""

    alerts = serializers.SerializerMethodField()

    class Meta:
        model = ANCVisit
        fields = [
            "id",
            "registration",
            "visit_number",
            "visit_date",
            "gestation_weeks",
            "weight",
            "blood_pressure",
            "fetal_heart_rate",
            "next_visit_date",
            "alerts",
            "created_at",
        ]

    def get_alerts(self, obj):
        return obj.get_alerts()


# =============================================================================
# Delivery Serializers
# =============================================================================


class DeliverySerializer(serializers.ModelSerializer):
    """Full serializer for delivery record."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    delivered_by_name = serializers.SerializerMethodField()
    baby_patient_mrn = serializers.SerializerMethodField()
    is_low_birth_weight = serializers.BooleanField(read_only=True)
    is_macrosomia = serializers.BooleanField(read_only=True)
    alerts = serializers.SerializerMethodField()
    partograph = serializers.PrimaryKeyRelatedField(
        queryset=LabourPartograph.objects.select_related("registration", "admission"),
        required=False,
        allow_null=True,
    )
    admission = serializers.PrimaryKeyRelatedField(
        queryset=Admission.objects.select_related("mch_registration", "patient"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Delivery
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "partograph",
            "admission",
            "delivery_date",
            "delivery_time",
            "delivery_type",
            "delivery_outcome",
            "place_of_delivery",
            "status",
            "delivered_by",
            "delivered_by_name",
            "baby_gender",
            "birth_weight",
            "apgar_score_1min",
            "apgar_score_5min",
            "apgar_score_10min",
            "resuscitation_done",
            "baby_patient",
            "baby_patient_mrn",
            "maternal_complications",
            "neonatal_complications",
            "blood_loss_ml",
            "placenta_complete",
            "is_low_birth_weight",
            "is_macrosomia",
            "alerts",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["baby_patient"]
        extra_kwargs = {
            "status": {"default": "COMPLETED"},
        }

    def validate(self, attrs):
        registration = attrs.get("registration") or getattr(self.instance, "registration", None)

        # Idempotency: prevent duplicate delivery for the same registration
        if self.instance is None and registration:
            if Delivery.objects.filter(registration=registration).exists():
                raise serializers.ValidationError(
                    {"registration": "A delivery has already been recorded for this MCH registration."}
                )
            if registration.status not in ("ACTIVE", "DELIVERED"):
                raise serializers.ValidationError(
                    {"registration": f"Cannot record delivery for a registration with status '{registration.status}'."}
                )

        partograph = (
            attrs.get("partograph") if "partograph" in attrs else getattr(self.instance, "partograph", None)
        )
        admission = (
            attrs.get("admission") if "admission" in attrs else getattr(self.instance, "admission", None)
        )

        if registration and partograph and partograph.registration_id != registration.id:
            raise serializers.ValidationError(
                {"partograph": "Labour partograph must belong to the same MCH registration."}
            )

        if registration and admission:
            if admission.patient_id != registration.mother_id:
                raise serializers.ValidationError(
                    {"admission": "Admission patient must match the MCH registration mother."}
                )
            if admission.mch_registration_id and admission.mch_registration_id != registration.id:
                raise serializers.ValidationError(
                    {"admission": "Admission must belong to the same MCH registration."}
                )

        if partograph and admission and partograph.admission_id and partograph.admission_id != admission.id:
            raise serializers.ValidationError(
                {"admission": "Delivery admission must match the linked labour partograph admission."}
            )

        return attrs

    def create(self, validated_data):
        partograph = validated_data.get("partograph")
        if partograph and validated_data.get("admission") is None and partograph.admission_id:
            validated_data["admission"] = partograph.admission
        return super().create(validated_data)

    def update(self, instance, validated_data):
        partograph = validated_data.get("partograph", instance.partograph)
        if partograph and validated_data.get("admission", instance.admission) is None and partograph.admission_id:
            validated_data["admission"] = partograph.admission
        return super().update(instance, validated_data)

    def get_delivered_by_name(self, obj):
        if obj.delivered_by:
            return f"{obj.delivered_by.first_name} {obj.delivered_by.last_name}".strip() or obj.delivered_by.username
        return None

    def get_baby_patient_mrn(self, obj):
        if obj.baby_patient:
            return obj.baby_patient.mrn
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class DeliveryListSerializer(serializers.ModelSerializer):
    """Lean serializer for delivery list."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    mother_name = serializers.SerializerMethodField()
    mother_mrn = serializers.CharField(
        source="registration.mother.mrn", read_only=True
    )
    place_of_delivery = serializers.CharField(read_only=True)
    delivered_by_name = serializers.SerializerMethodField()
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "mother_name",
            "mother_mrn",
            "delivery_date",
            "delivery_type",
            "delivery_outcome",
            "place_of_delivery",
            "status",
            "baby_gender",
            "birth_weight",
            "delivered_by_name",
            "alerts",
            "created_at",
        ]

    def get_mother_name(self, obj):
        mother = obj.registration.mother
        return f"{mother.first_name} {mother.last_name}"

    def get_delivered_by_name(self, obj):
        if obj.delivered_by:
            return (
                f"{obj.delivered_by.first_name} {obj.delivered_by.last_name}".strip()
                or obj.delivered_by.username
            )
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


# =============================================================================
# Labour Partograph Serializers
# =============================================================================


class LabourPartographObservationSerializer(serializers.ModelSerializer):
    """Serializer for labour partograph observations."""

    recorded_by_name = serializers.SerializerMethodField()
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = LabourPartographObservation
        fields = [
            "id",
            "partograph",
            "observation_time",
            "recorded_by",
            "recorded_by_name",
            "fetal_heart_rate",
            "cervical_dilation_cm",
            "descent_fifths",
            "contractions_per_10_min",
            "contraction_duration_seconds",
            "contraction_intensity",
            "moulding",
            "maternal_pulse",
            "maternal_blood_pressure",
            "maternal_temperature",
            "urine_volume_ml",
            "urine_protein",
            "urine_acetone",
            "oxytocin_drops_per_min",
            "medications",
            "notes",
            "alerts",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["recorded_by", "recorded_by_name", "alerts"]

    def get_recorded_by_name(self, obj):
        user = obj.recorded_by
        full = user.get_full_name()
        return full if full else user.username

    def get_alerts(self, obj):
        return obj.get_alerts()


class LabourPartographSerializer(serializers.ModelSerializer):
    """Serializer for labour partographs."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    mother_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    observation_count = serializers.IntegerField(read_only=True)
    latest_observation = serializers.SerializerMethodField()

    class Meta:
        model = LabourPartograph
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "mother_name",
            "encounter",
            "admission",
            "started_at",
            "status",
            "parity",
            "gestation_weeks",
            "membrane_status",
            "liquor",
            "notes",
            "created_by",
            "created_by_name",
            "completed_at",
            "observation_count",
            "latest_observation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_by",
            "created_by_name",
            "completed_at",
            "observation_count",
            "latest_observation",
        ]

    def get_mother_name(self, obj):
        mother = obj.registration.mother
        return f"{mother.first_name} {mother.last_name}"

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return None
        full = user.get_full_name()
        return full if full else user.username

    def get_latest_observation(self, obj):
        latest = getattr(obj, "latest_observation", None)
        if callable(latest):
            latest = latest()
        if latest is None:
            latest = obj.observations.order_by("-observation_time").first()
        if latest is None:
            return None
        return LabourPartographObservationSerializer(latest).data

    def validate(self, attrs):
        registration = attrs.get("registration") or getattr(self.instance, "registration", None)
        admission = (
            attrs.get("admission") if "admission" in attrs else getattr(self.instance, "admission", None)
        )
        encounter = (
            attrs.get("encounter") if "encounter" in attrs else getattr(self.instance, "encounter", None)
        )

        if registration and admission:
            if admission.patient_id != registration.mother_id:
                raise serializers.ValidationError(
                    {"admission": "Admission patient must match the MCH registration mother."}
                )
            if admission.mch_registration_id and admission.mch_registration_id != registration.id:
                raise serializers.ValidationError(
                    {"admission": "Admission must belong to the same MCH registration."}
                )

        if encounter and admission and admission.opd_encounter_id and admission.opd_encounter_id != encounter.id:
            raise serializers.ValidationError(
                {"encounter": "Labour encounter must match the linked admission OPD encounter."}
            )

        return attrs


# =============================================================================
# PNC Visit Serializers
# =============================================================================


class PNCVisitSerializer(serializers.ModelSerializer):
    """Full serializer for PNC visit."""

    registration_mch_number = serializers.CharField(
        source="registration.mch_number", read_only=True
    )
    conducted_by_name = serializers.SerializerMethodField()
    alerts = serializers.SerializerMethodField()
    admission = serializers.PrimaryKeyRelatedField(
        queryset=Admission.objects.select_related("mch_registration", "patient"),
        required=False,
        allow_null=True,
    )
    discharge = serializers.PrimaryKeyRelatedField(
        queryset=Discharge.objects.select_related(
            "admission", "admission__mch_registration", "admission__patient"
        ),
        required=False,
        allow_null=True,
    )
    clinic_visit = serializers.PrimaryKeyRelatedField(
        queryset=ClinicVisit.objects.select_related("session__clinic", "patient", "encounter"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = PNCVisit
        fields = [
            "id",
            "registration",
            "registration_mch_number",
            "encounter",
            "admission",
            "discharge",
            "clinic_visit",
            "visit_number",
            "visit_date",
            "days_postpartum",
            "blood_pressure",
            "temperature",
            "uterine_involution",
            "lochia",
            "breast_condition",
            "mood_assessment",
            "baby_weight",
            "baby_temperature",
            "cord_status",
            "breastfeeding_status",
            "family_planning_counselling",
            "contraceptive_given",
            "conducted_by",
            "conducted_by_name",
            "alerts",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["days_postpartum"]

    def validate(self, attrs):
        registration = attrs.get("registration") or getattr(self.instance, "registration", None)
        admission = attrs.get("admission") if "admission" in attrs else getattr(self.instance, "admission", None)
        discharge = attrs.get("discharge") if "discharge" in attrs else getattr(self.instance, "discharge", None)

        if registration and discharge:
            discharge_admission = discharge.admission
            if discharge_admission.patient_id != registration.mother_id:
                raise serializers.ValidationError(
                    {"discharge": "Discharge admission patient must match the MCH registration mother."}
                )
            if discharge_admission.mch_registration_id and discharge_admission.mch_registration_id != registration.id:
                raise serializers.ValidationError(
                    {"discharge": "Discharge must belong to the same MCH registration."}
                )

        if registration and admission:
            if admission.patient_id != registration.mother_id:
                raise serializers.ValidationError(
                    {"admission": "Admission patient must match the MCH registration mother."}
                )
            if admission.mch_registration_id and admission.mch_registration_id != registration.id:
                raise serializers.ValidationError(
                    {"admission": "Admission must belong to the same MCH registration."}
                )

        if admission and discharge and discharge.admission_id != admission.id:
            raise serializers.ValidationError(
                {"discharge": "Discharge must belong to the same admission linked to this PNC visit."}
            )

        return attrs

    def create(self, validated_data):
        discharge = validated_data.get("discharge")
        if discharge and validated_data.get("admission") is None:
            validated_data["admission"] = discharge.admission
        return super().create(validated_data)

    def update(self, instance, validated_data):
        discharge = validated_data.get("discharge", instance.discharge)
        if discharge and validated_data.get("admission", instance.admission) is None:
            validated_data["admission"] = discharge.admission
        return super().update(instance, validated_data)

    def get_conducted_by_name(self, obj):
        if obj.conducted_by:
            return f"{obj.conducted_by.first_name} {obj.conducted_by.last_name}".strip() or obj.conducted_by.username
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class PNCVisitListSerializer(serializers.ModelSerializer):
    """Lean serializer for PNC visit list."""

    alerts = serializers.SerializerMethodField()

    class Meta:
        model = PNCVisit
        fields = [
            "id",
            "registration",
            "visit_number",
            "visit_date",
            "days_postpartum",
            "breastfeeding_status",
            "alerts",
            "created_at",
        ]

    def get_alerts(self, obj):
        return obj.get_alerts()


# =============================================================================
# Growth Measurement Serializers
# =============================================================================


class GrowthMeasurementSerializer(serializers.ModelSerializer):
    """Full serializer for growth measurement."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    patient_dob = serializers.DateField(source="patient.date_of_birth", read_only=True)
    measured_by_name = serializers.SerializerMethodField()
    has_critical_flag = serializers.BooleanField(read_only=True)
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = GrowthMeasurement
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "patient_gender",
            "patient_dob",
            "encounter",
            "measured_by",
            "measured_by_name",
            "measurement_date",
            "age_in_days",
            "weight",
            "height",
            "head_circumference",
            "muac",
            "weight_for_age_z",
            "height_for_age_z",
            "weight_for_height_z",
            "bmi_for_age_z",
            "head_circumference_for_age_z",
            "muac_classification",
            "nutritional_status",
            "has_critical_flag",
            "alerts",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "age_in_days",
            "weight_for_age_z",
            "height_for_age_z",
            "weight_for_height_z",
            "bmi_for_age_z",
            "head_circumference_for_age_z",
            "muac_classification",
            "nutritional_status",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_measured_by_name(self, obj):
        if obj.measured_by:
            return f"{obj.measured_by.first_name} {obj.measured_by.last_name}".strip() or obj.measured_by.username
        return None

    def get_alerts(self, obj):
        return obj.get_alerts()


class GrowthMeasurementListSerializer(serializers.ModelSerializer):
    """Lean serializer for growth measurement list."""

    patient_name = serializers.SerializerMethodField()
    has_critical_flag = serializers.BooleanField(read_only=True)

    class Meta:
        model = GrowthMeasurement
        fields = [
            "id",
            "patient",
            "patient_name",
            "measurement_date",
            "age_in_days",
            "weight",
            "height",
            "muac",
            "muac_classification",
            "nutritional_status",
            "has_critical_flag",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class GrowthChartDataSerializer(serializers.Serializer):
    """Serializer for growth chart data response."""

    measurements = GrowthMeasurementListSerializer(many=True)
    percentile_lines = serializers.DictField()
    chart_type = serializers.CharField()
    sex = serializers.CharField()


# =============================================================================
# Vaccine Serializers
# =============================================================================


class VaccineSerializer(serializers.ModelSerializer):
    """Serializer for vaccine reference data."""

    class Meta:
        model = Vaccine
        fields = [
            "id",
            "code",
            "name",
            "description",
            "disease_target",
            "standard_age_days",
            "route",
            "dose_number",
            "series_name",
            "is_active",
        ]


# =============================================================================
# Immunization Record Serializers
# =============================================================================


class ImmunizationRecordSerializer(serializers.ModelSerializer):
    """Full serializer for immunization record."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
    administered_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)

    class Meta:
        model = ImmunizationRecord
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "vaccine",
            "vaccine_code",
            "vaccine_name",
            "scheduled_date",
            "administered_date",
            "status",
            "dose_number",
            "batch_number",
            "lot_number",
            "expiry_date",
            "site",
            "administered_by",
            "administered_by_name",
            "next_dose_date",
            "is_overdue",
            "days_overdue",
            "notes",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_administered_by_name(self, obj):
        if obj.administered_by:
            return f"{obj.administered_by.first_name} {obj.administered_by.last_name}".strip() or obj.administered_by.username
        return None


class ImmunizationRecordListSerializer(serializers.ModelSerializer):
    """Lean serializer for immunization record list."""

    vaccine_code = serializers.CharField(source="vaccine.code", read_only=True)
    vaccine_name = serializers.CharField(source="vaccine.name", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ImmunizationRecord
        fields = [
            "id",
            "patient",
            "vaccine",
            "vaccine_code",
            "vaccine_name",
            "scheduled_date",
            "administered_date",
            "status",
            "dose_number",
            "is_overdue",
            "created_at",
        ]


class AdministerVaccineSerializer(serializers.Serializer):
    """Serializer for administering a vaccine."""

    administered_date = serializers.DateField(default=date_module.today)
    batch_number = serializers.CharField(required=False, default="")
    lot_number = serializers.CharField(required=False, default="")
    expiry_date = serializers.DateField(required=False, allow_null=True)
    site = serializers.ChoiceField(
        choices=ImmunizationRecord.SITE_CHOICES,
        required=False,
        default="",
    )
    notes = serializers.CharField(required=False, default="")


# =============================================================================
# Vitamin A Supplement Serializer
# =============================================================================


class VitaminASupplementSerializer(serializers.ModelSerializer):
    """Serializer for Vitamin A supplement records."""

    patient_name = serializers.SerializerMethodField()
    administered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VitaminASupplement
        fields = [
            "id",
            "patient",
            "patient_name",
            "administered_date",
            "dose",
            "administered_by",
            "administered_by_name",
            "notes",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_administered_by_name(self, obj):
        if obj.administered_by:
            return f"{obj.administered_by.first_name} {obj.administered_by.last_name}".strip() or obj.administered_by.username
        return None


# =============================================================================
# AEFI Serializers
# =============================================================================


class AEFISerializer(serializers.ModelSerializer):
    """Full serializer for AEFI report (MCH compatibility layer)."""

    vaccine_code = serializers.CharField(
        source="immunization_record.vaccine.code", read_only=True
    )
    vaccine_name = serializers.CharField(
        source="immunization_record.vaccine.name", read_only=True
    )
    patient_name = serializers.SerializerMethodField()
    investigated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AEFI
        fields = [
            "id",
            "immunization_record",
            "vaccine_code",
            "vaccine_name",
            "patient_name",
            "event_date",
            "event_type",
            "severity",
            "description",
            "outcome",
            "reported_to_authorities",
            "report_date",
            "investigated_by",
            "investigated_by_name",
            "investigation_notes",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        patient = obj.immunization_record.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_investigated_by_name(self, obj):
        if obj.investigated_by:
            return f"{obj.investigated_by.first_name} {obj.investigated_by.last_name}".strip() or obj.investigated_by.username
        return None


class AEFIListSerializer(serializers.ModelSerializer):
    """Lean serializer for AEFI list (MCH compatibility layer)."""

    vaccine_code = serializers.CharField(
        source="immunization_record.vaccine.code", read_only=True
    )

    class Meta:
        model = AEFI
        fields = [
            "id",
            "immunization_record",
            "vaccine_code",
            "event_date",
            "event_type",
            "severity",
            "outcome",
            "reported_to_authorities",
            "created_at",
        ]


# =============================================================================
# HEI Follow-Up Serializers
# =============================================================================


class HEIPCRTestSerializer(serializers.ModelSerializer):
    """Serializer for HEI PCR test records."""

    class Meta:
        model = HEIPCRTest
        fields = [
            "id",
            "hei_followup",
            "test_number",
            "scheduled_date",
            "actual_date",
            "result",
            "lab_reference",
            "notes",
            "created_at",
        ]


class HEIPCRTestReadSerializer(serializers.ModelSerializer):
    """Read-only serializer for nested HEI PCR test records."""

    class Meta:
        model = HEIPCRTest
        fields = [
            "id",
            "hei_followup",
            "test_number",
            "scheduled_date",
            "actual_date",
            "result",
            "lab_reference",
            "notes",
            "created_at",
        ]
        read_only_fields = ["hei_followup"]


class HEIFollowUpSerializer(serializers.ModelSerializer):
    """Full serializer for HEI follow-up."""

    infant_name = serializers.SerializerMethodField()
    infant_mrn = serializers.CharField(source="infant.mrn", read_only=True)
    mother_name = serializers.SerializerMethodField()
    pcr_tests = HEIPCRTestReadSerializer(many=True, read_only=True)
    enrolled_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HEIFollowUp
        fields = [
            "id",
            "hei_number",
            "infant",
            "infant_name",
            "infant_mrn",
            "mch_registration",
            "mother_name",
            "enrollment_date",
            "status",
            "mother_art_status",
            "infant_arv_prophylaxis",
            "arv_start_date",
            "arv_end_date",
            "breastfeeding_status",
            "cotrimoxazole_prophylaxis",
            "cotrimoxazole_start_date",
            "enrolled_by",
            "enrolled_by_name",
            "pcr_tests",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["hei_number", "enrolled_by", "is_sensitive"]

    def get_infant_name(self, obj):
        return f"{obj.infant.first_name} {obj.infant.last_name}"

    def get_mother_name(self, obj):
        if obj.mch_registration:
            mother = obj.mch_registration.mother
            return f"{mother.first_name} {mother.last_name}"
        return None

    def get_enrolled_by_name(self, obj):
        if obj.enrolled_by:
            return f"{obj.enrolled_by.first_name} {obj.enrolled_by.last_name}".strip() or obj.enrolled_by.username
        return None


class HEIFollowUpListSerializer(serializers.ModelSerializer):
    """Lean serializer for HEI follow-up list."""

    infant_name = serializers.SerializerMethodField()
    infant_mrn = serializers.CharField(source="infant.mrn", read_only=True)

    class Meta:
        model = HEIFollowUp
        fields = [
            "id",
            "hei_number",
            "infant",
            "infant_name",
            "infant_mrn",
            "enrollment_date",
            "status",
            "mother_art_status",
            "infant_arv_prophylaxis",
            "breastfeeding_status",
            "created_at",
        ]

    def get_infant_name(self, obj):
        return f"{obj.infant.first_name} {obj.infant.last_name}"
