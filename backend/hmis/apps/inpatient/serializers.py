"""
Serializers for the inpatient app.
"""

from rest_framework import serializers

from hmis.apps.encounters.models import Encounter
from hmis.apps.mch.services.postpartum_continuity import (
    route_registration_to_pnc_queue,
    schedule_registration_pnc_follow_up,
    transition_registration_to_postnatal,
)

from .models import (
    Admission,
    AdmissionRecommendation,
    Bed,
    BloodTransfusionObservation,
    BPMonitoringReading,
    Discharge,
    DischargeDiagnosis,
    FluidBalanceEntry,
    FluidBalanceSheet,
    InpatientConsumableUsage,
    KardexHandoverNote,
    KardexShiftNote,
    MedicationAdministration,
    NursingCarePlanEntry,
    NursingKardex,
    ReviewRequest,
    ShiftHandover,
    SupervisorAlertAcknowledgment,
    TemperatureReading,
    Transfer,
    TransfusionObservationEntry,
    Ward,
    WardRound,
)


class InpatientWardSerializer(serializers.ModelSerializer):
    """Serializer for Ward model (inpatient-specific with occupancy stats)."""

    available_beds = serializers.ReadOnlyField()
    total_beds = serializers.ReadOnlyField()
    occupied_beds = serializers.ReadOnlyField()
    occupancy_rate = serializers.ReadOnlyField()
    ward_type_display = serializers.CharField(source="get_ward_type_display", read_only=True)

    class Meta:
        model = Ward
        fields = [
            "id",
            "name",
            "code",
            "ward_type",
            "ward_type_display",
            "floor",
            "capacity",
            "description",
            "is_active",
            "daily_rate",
            "gender_restriction",
            "min_age_years",
            "max_age_years",
            "isolation_capable",
            "oxygen_equipped",
            "ventilator_capable",
            "maternity_designated",
            "emergency_buffer_percent",
            "available_beds",
            "total_beds",
            "occupied_beds",
            "occupancy_rate",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BedSerializer(serializers.ModelSerializer):
    """Serializer for Bed model."""

    ward_name = serializers.CharField(source="ward.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    status_changed_by_username = serializers.CharField(
        source="status_changed_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = Bed
        fields = [
            "id",
            "ward",
            "ward_name",
            "bed_number",
            "status",
            "status_display",
            "notes",
            "status_changed_by",
            "status_changed_by_username",
            "status_changed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status_changed_at", "created_at", "updated_at"]


class BedTurnoverActionSerializer(serializers.Serializer):
    """Serializer for housekeeping turnover actions."""

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Optional housekeeping or turnover notes",
    )


class AdmissionRecommendationSerializer(serializers.ModelSerializer):
    """Serializer for AdmissionRecommendation model."""

    recommended_by_username = serializers.CharField(
        source="recommended_by.username", read_only=True
    )
    resolved_by_username = serializers.CharField(
        source="resolved_by.username", read_only=True, allow_null=True
    )
    patient_id = serializers.IntegerField(source="encounter.patient_id", read_only=True)
    patient_name = serializers.CharField(
        source="encounter.patient.full_name", read_only=True
    )
    patient_mrn = serializers.CharField(
        source="encounter.patient.mrn", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    urgency_display = serializers.CharField(source="get_urgency_display", read_only=True)
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = AdmissionRecommendation
        fields = [
            "id",
            "encounter",
            "recommended_by",
            "recommended_by_username",
            "patient_id",
            "patient_name",
            "patient_mrn",
            "reason",
            "provisional_diagnosis",
            "provisional_diagnosis_text",
            "urgency",
            "urgency_display",
            "preferred_ward_type",
            "status",
            "status_display",
            "expires_at",
            "resolved_at",
            "resolved_by",
            "resolved_by_username",
            "decline_reason",
            "is_expired",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "resolved_at",
            "resolved_by",
            "created_at",
            "updated_at",
        ]

    def get_is_expired(self, obj) -> bool:
        return obj.is_expired()


class AdmissionSerializer(serializers.ModelSerializer):
    """Serializer for Admission model.

    Supports automatic bed assignment via `auto_assign_bed=true` in request body.
    When auto_assign_bed is true, the `bed` field becomes optional as the system
    will automatically select the first available bed in the ward.
    """

    patient_name = serializers.SerializerMethodField()
    patient_age = serializers.SerializerMethodField()
    patient_gender = serializers.SerializerMethodField()
    clinical_context = serializers.SerializerMethodField(
        help_text="AI-ready clinical context: comorbidities, medications, allergies, recent lab results.",
    )
    mch_registration_number = serializers.CharField(
        source="mch_registration.mch_number", read_only=True
    )
    admitting_officer_username = serializers.CharField(
        source="admitting_officer.username", read_only=True
    )
    attending_doctor_username = serializers.CharField(
        source="attending_doctor.username", read_only=True
    )
    ward_name = serializers.CharField(source="ward.name", read_only=True)
    ward_type = serializers.CharField(source="ward.ward_type", read_only=True)
    bed_number = serializers.CharField(source="bed.bed_number", read_only=True)
    admission_status_display = serializers.CharField(
        source="get_admission_status_display", read_only=True
    )
    payer_type_display = serializers.CharField(source="get_payer_type_display", read_only=True)
    length_of_stay = serializers.ReadOnlyField()

    # Make bed optional to support auto_assign_bed workflow
    bed = serializers.PrimaryKeyRelatedField(
        queryset=Bed.objects.all(),
        required=False,
        allow_null=True,
        help_text="Bed ID. Optional when auto_assign_bed=true is provided.",
    )

    class Meta:
        model = Admission
        fields = [
            "id",
            "admission_number",
            "patient",
            "patient_name",
            "patient_age",
            "patient_gender",
            "clinical_context",
            "opd_encounter",
            "mch_registration",
            "mch_registration_number",
            "ipd_encounter",
            "recommendation",
            "admission_date",
            "admitting_diagnosis",
            "admitting_diagnosis_text",
            "admitting_officer",
            "admitting_officer_username",
            "attending_doctor",
            "attending_doctor_username",
            "ward",
            "ward_name",
            "ward_type",
            "bed",
            "bed_number",
            "admission_status",
            "admission_status_display",
            "payer_type",
            "payer_type_display",
            "insurance_details",
            "constraint_override",
            "constraint_override_reason",
            "constraint_violations",
            "expected_discharge_date",
            "length_of_stay",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "admission_number",
            "ipd_encounter",
            "admission_status",
            "constraint_override",
            "constraint_violations",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        patient = attrs.get("patient") or getattr(self.instance, "patient", None)
        ward = attrs.get("ward") or getattr(self.instance, "ward", None)
        mch_registration = (
            attrs.get("mch_registration")
            if "mch_registration" in attrs
            else getattr(self.instance, "mch_registration", None)
        )

        if ward and ward.ward_type == "MATERNITY" and mch_registration is None:
            raise serializers.ValidationError(
                {"mch_registration": "Maternity admissions require an MCH registration."}
            )

        if patient and mch_registration and mch_registration.mother_id != patient.id:
            raise serializers.ValidationError(
                {"mch_registration": "MCH registration mother must match the admission patient."}
            )

        return attrs

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_patient_age(self, obj) -> int | None:
        """Get patient age in years from date of birth."""
        dob = getattr(obj.patient, "date_of_birth", None)
        if not dob:
            return None
        from datetime import date

        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    def get_patient_gender(self, obj) -> str | None:
        """Get patient gender (M, F, O)."""
        return getattr(obj.patient, "gender", None)

    def get_clinical_context(self, obj) -> dict:
        """Return AI-ready clinical context derived from linked encounter, allergies, and labs.

        Only populated on retrieve (detail) — returns ``None`` on list to avoid N+1 queries.
        """
        # Skip on list actions to avoid N+1 (list view seldom needs this)
        view = self.context.get("view")
        if view and getattr(view, "action", None) == "list":
            return None  # type: ignore[return-value]

        result: dict = {
            "comorbidities": [],
            "current_medications": [],
            "allergies_structured": [],
            "lab_results_summary": [],
        }

        # --- From IPD encounter ---
        encounter = getattr(obj, "ipd_encounter", None)
        if encounter:
            if encounter.chronic_conditions:
                result["comorbidities"] = [
                    c.strip()
                    for c in encounter.chronic_conditions.replace("\n", ",").split(",")
                    if c.strip()
                ]
            if encounter.current_medications:
                result["current_medications"] = [
                    m.strip()
                    for m in encounter.current_medications.replace("\n", ",").split(",")
                    if m.strip()
                ]

        # --- Structured allergies from Patient ---
        try:
            allergies_qs = obj.patient.patient_allergies.filter(status="active")
            result["allergies_structured"] = [a.substance for a in allergies_qs]
        except Exception:
            pass

        # --- Recent verified lab results for this admission ---
        try:
            from hmis.apps.laboratory.models import LabResult

            lab_results = (
                LabResult.objects.filter(
                    order_item__lab_order__admission=obj,
                    verification_status="VERIFIED",
                    numeric_value__isnull=False,
                )
                .select_related("order_item__test")
                .order_by("-entered_at")[:20]
            )
            result["lab_results_summary"] = [
                {
                    "test_name": lr.order_item.test.name,
                    "value": float(lr.numeric_value),
                    "unit": lr.result_unit,
                }
                for lr in lab_results
            ]
        except Exception:
            pass

        return result

    def create(self, validated_data):
        """Create an admission and auto-create the linked IPD encounter."""
        patient = validated_data["patient"]
        # opd_encounter is stored for reference but auto-creating IPD encounter
        validated_data.get("opd_encounter")

        # Auto-create IPD encounter (Track D requirement)
        ipd_encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="IPD",
            chief_complaint="Admitted for inpatient care",
        )
        validated_data["ipd_encounter"] = ipd_encounter

        admission = super().create(validated_data)

        # If admission is created from a recommendation, mark it accepted if still pending.
        recommendation = admission.recommendation
        if recommendation and recommendation.status == "PENDING":
            try:
                recommendation.accept(admission.admitting_officer)
            except ValueError:
                pass

        return admission


class DischargeDiagnosisSerializer(serializers.ModelSerializer):
    """Serializer for individual discharge diagnosis."""

    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = DischargeDiagnosis
        fields = [
            "id",
            "role",
            "role_display",
            "code",
            "description",
        ]
        read_only_fields = ["id"]


class DischargeSerializer(serializers.ModelSerializer):
    """Serializer for Discharge model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    diagnoses = DischargeDiagnosisSerializer(many=True, required=False)
    mch_registration = serializers.IntegerField(source="admission.mch_registration_id", read_only=True)
    mch_registration_number = serializers.CharField(
        source="admission.mch_registration.mch_number", read_only=True
    )
    discharged_by_username = serializers.CharField(source="discharged_by.username", read_only=True)
    discharge_type_display = serializers.CharField(
        source="get_discharge_type_display", read_only=True
    )
    maternity_continuity_action_display = serializers.CharField(
        source="get_maternity_continuity_action_display", read_only=True
    )
    maternity_continuity_status_display = serializers.CharField(
        source="get_maternity_continuity_status_display", read_only=True
    )
    pnc_clinic_visit = serializers.IntegerField(source="pnc_clinic_visit_id", read_only=True)
    pnc_appointment = serializers.IntegerField(source="pnc_appointment_id", read_only=True)
    length_of_stay = serializers.ReadOnlyField()
    death_record_id = serializers.SerializerMethodField()

    class Meta:
        model = Discharge
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "mch_registration",
            "mch_registration_number",
            "discharge_type",
            "discharge_type_display",
            "discharge_date",
            "discharged_by",
            "discharged_by_username",
            "admission_diagnosis",
            "final_diagnosis",
            "final_diagnosis_text",
            "diagnoses",
            "procedures_performed",
            "treatment_summary",
            "discharge_medications",
            "maternity_continuity_action",
            "maternity_continuity_action_display",
            "maternity_continuity_status",
            "maternity_continuity_status_display",
            "pnc_clinic_visit",
            "pnc_appointment",
            "follow_up_date",
            "follow_up_instructions",
            "referral_facility",
            "referral_reason",
            "patient_instructions",
            "pharmacy_cleared",
            "billing_cleared",
            "lab_results_acknowledged",
            "length_of_stay",
            "death_record_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "maternity_continuity_status",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        admission = attrs.get("admission") or getattr(self.instance, "admission", None)
        discharge_type = attrs.get("discharge_type") or getattr(self.instance, "discharge_type", None)
        follow_up_date = (
            attrs.get("follow_up_date")
            if "follow_up_date" in attrs
            else getattr(self.instance, "follow_up_date", None)
        )

        # ----- Automated clearance validation for normal discharges -----
        if admission and discharge_type in {"NORMAL", "ROUTINE", "TRANSFERRED"}:
            from decimal import Decimal

            from hmis.apps.billing.models import Invoice
            from hmis.apps.laboratory.models import LabOrder
            from hmis.apps.pharmacy.models import Prescription

            clearance_errors = {}

            # Billing: check invoices linked to the IPD encounter
            unpaid_invoices = Invoice.objects.filter(
                encounter=admission.ipd_encounter,
            ).exclude(
                status__in=[
                    Invoice.Status.PAID,
                    Invoice.Status.CANCELLED,
                    Invoice.Status.WRITTEN_OFF,
                ]
            )
            outstanding = sum(
                (inv.balance_due for inv in unpaid_invoices), Decimal("0.00")
            )
            billing_cleared = outstanding <= 0
            if not billing_cleared:
                clearance_errors["billing_cleared"] = (
                    f"Cannot discharge: KES {outstanding:,.2f} outstanding balance"
                )

            # Pharmacy: all INTERNAL prescriptions dispensed or cancelled
            # EXTERNAL prescriptions are filled outside the hospital and don't require clearance
            pending_rx = Prescription.objects.filter(
                admission=admission,
                dispensing_type="INTERNAL",
            ).exclude(status__in=["DISPENSED", "CANCELLED"])
            pharmacy_cleared = not pending_rx.exists()
            if not pharmacy_cleared:
                clearance_errors["pharmacy_cleared"] = (
                    f"Cannot discharge: {pending_rx.count()} internal prescription(s) not yet dispensed"
                )

            # Lab: all lab orders completed or cancelled
            pending_labs = LabOrder.objects.filter(
                admission=admission,
            ).exclude(status__in=["COMPLETED", "CANCELLED"])
            lab_cleared = not pending_labs.exists()
            if not lab_cleared:
                clearance_errors["lab_results_acknowledged"] = (
                    f"Cannot discharge: {pending_labs.count()} lab order(s) with pending results"
                )

            if clearance_errors:
                raise serializers.ValidationError(clearance_errors)

            # Auto-populate clearance booleans from live data
            attrs["billing_cleared"] = True
            attrs["pharmacy_cleared"] = True
            attrs["lab_results_acknowledged"] = True

        if (
            admission
            and admission.mch_registration_id
            and discharge_type in {"NORMAL", "TRANSFERRED"}
        ):
            action = attrs.get("maternity_continuity_action") or getattr(
                self.instance, "maternity_continuity_action", "NONE"
            )
            if action not in {"SCHEDULE_EARLY_PNC", "ROUTE_TO_PNC_QUEUE"}:
                raise serializers.ValidationError(
                    {
                        "maternity_continuity_action": (
                            "Maternity discharges must either schedule early PNC or route directly to the PNC queue."
                        )
                    }
                )
            if action == "SCHEDULE_EARLY_PNC" and follow_up_date is None:
                raise serializers.ValidationError(
                    {"follow_up_date": "Scheduling early PNC requires a follow-up date."}
                )
        elif admission and not admission.mch_registration_id:
            action = attrs.get("maternity_continuity_action") or getattr(
                self.instance, "maternity_continuity_action", "NONE"
            )
            if action != "NONE":
                raise serializers.ValidationError(
                    {
                        "maternity_continuity_action": (
                            "Only maternity-linked admissions can use postpartum continuity actions."
                        )
                    }
                )

        return attrs

    def _apply_maternity_continuity(self, discharge: Discharge) -> None:
        registration = discharge.admission.mch_registration
        if registration is None:
            return

        transition_registration_to_postnatal(registration)

        if discharge.maternity_continuity_action == "SCHEDULE_EARLY_PNC":
            appointment = schedule_registration_pnc_follow_up(
                registration,
                visit_date=discharge.follow_up_date,
                user=discharge.discharged_by,
                notes=discharge.follow_up_instructions,
            )
            discharge.pnc_appointment = appointment
            discharge.pnc_clinic_visit = None
            discharge.maternity_continuity_status = "SCHEDULED"
        elif discharge.maternity_continuity_action == "ROUTE_TO_PNC_QUEUE":
            clinic_visit = route_registration_to_pnc_queue(
                registration,
                user=discharge.discharged_by,
                routing_date=discharge.discharge_date.date(),
                notes=discharge.follow_up_instructions,
            )
            discharge.pnc_clinic_visit = clinic_visit
            discharge.pnc_appointment = None
            discharge.maternity_continuity_status = "QUEUED"
        else:
            discharge.maternity_continuity_status = "NOT_APPLICABLE"

        discharge.save(
            update_fields=[
                "maternity_continuity_status",
                "pnc_clinic_visit",
                "pnc_appointment",
                "updated_at",
            ]
        )

    def create(self, validated_data):
        diagnoses_data = validated_data.pop("diagnoses", [])
        discharge = super().create(validated_data)

        # Create nested diagnoses
        for diag in diagnoses_data:
            DischargeDiagnosis.objects.create(discharge=discharge, **diag)

        # Backfill legacy fields from primary diagnosis for backward compat
        primary = next((d for d in diagnoses_data if d.get("role") == "PRIMARY"), None)
        if primary and not discharge.final_diagnosis:
            discharge.final_diagnosis = primary["code"][:10]
            discharge.final_diagnosis_text = primary["description"][:255]
            discharge.save(update_fields=["final_diagnosis", "final_diagnosis_text", "updated_at"])

        self._apply_maternity_continuity(discharge)
        return discharge

    def update(self, instance, validated_data):
        diagnoses_data = validated_data.pop("diagnoses", None)
        discharge = super().update(instance, validated_data)

        # Replace diagnoses if provided
        if diagnoses_data is not None:
            discharge.diagnoses.all().delete()
            for diag in diagnoses_data:
                DischargeDiagnosis.objects.create(discharge=discharge, **diag)

            # Backfill legacy fields
            primary = next((d for d in diagnoses_data if d.get("role") == "PRIMARY"), None)
            if primary:
                discharge.final_diagnosis = primary["code"][:10]
                discharge.final_diagnosis_text = primary["description"][:255]
                discharge.save(update_fields=["final_diagnosis", "final_diagnosis_text", "updated_at"])

        if discharge.admission.mch_registration_id and discharge.maternity_continuity_action in {
            "SCHEDULE_EARLY_PNC",
            "ROUTE_TO_PNC_QUEUE",
        }:
            if discharge.maternity_continuity_action == "SCHEDULE_EARLY_PNC" and discharge.pnc_appointment_id is None:
                self._apply_maternity_continuity(discharge)
            elif discharge.maternity_continuity_action == "ROUTE_TO_PNC_QUEUE" and discharge.pnc_clinic_visit_id is None:
                self._apply_maternity_continuity(discharge)
        return discharge

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_death_record_id(self, obj) -> int | None:
        """Return the auto-created death record ID for DECEASED discharges."""
        if obj.discharge_type != "DECEASED":
            return None
        death_record = getattr(obj.admission.patient, "death_record", None)
        return death_record.id if death_record else None


class TransferSerializer(serializers.ModelSerializer):
    """Serializer for Transfer model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    mch_registration = serializers.IntegerField(source="admission.mch_registration_id", read_only=True)
    mch_registration_number = serializers.CharField(
        source="admission.mch_registration.mch_number", read_only=True
    )
    source_ward_name = serializers.CharField(source="source_ward.name", read_only=True)
    source_bed_number = serializers.CharField(source="source_bed.bed_number", read_only=True)
    destination_ward_name = serializers.CharField(source="destination_ward.name", read_only=True)
    destination_bed_number = serializers.CharField(
        source="destination_bed.bed_number", read_only=True
    )
    transferred_by_username = serializers.CharField(
        source="transferred_by.username", read_only=True
    )
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)

    class Meta:
        model = Transfer
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "mch_registration",
            "mch_registration_number",
            "source_ward",
            "source_ward_name",
            "source_bed",
            "source_bed_number",
            "destination_ward",
            "destination_ward_name",
            "destination_bed",
            "destination_bed_number",
            "reason",
            "reason_display",
            "reason_details",
            "transferred_by",
            "transferred_by_username",
            "transfer_date",
            "clinical_handover_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        admission = attrs.get("admission") or getattr(self.instance, "admission", None)
        source_ward = attrs.get("source_ward") or getattr(self.instance, "source_ward", None)
        source_bed = attrs.get("source_bed") or getattr(self.instance, "source_bed", None)

        if admission and source_ward and admission.ward_id != source_ward.id:
            raise serializers.ValidationError(
                {"source_ward": "Source ward must match the admission's current ward."}
            )

        if admission and source_bed and admission.bed_id != source_bed.id:
            raise serializers.ValidationError(
                {"source_bed": "Source bed must match the admission's current bed."}
            )

        return attrs

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class WardRoundSerializer(serializers.ModelSerializer):
    """Serializer for WardRound model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    conducted_by_username = serializers.CharField(source="conducted_by.username", read_only=True)
    condition_status_display = serializers.CharField(
        source="get_condition_status_display", read_only=True
    )
    review_type_display = serializers.CharField(
        source="get_review_type_display", read_only=True
    )
    maternity_continuity_action_display = serializers.CharField(
        source="get_maternity_continuity_action_display", read_only=True
    )

    class Meta:
        model = WardRound
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "round_date",
            "round_time",
            "conducted_by",
            "conducted_by_username",
            "review_type",
            "review_type_display",
            "review_request",
            "subjective",
            "objective",
            "assessment",
            "plan",
            "maternity_continuity_action",
            "maternity_continuity_action_display",
            "maternity_continuity_notes",
            "condition_status",
            "condition_status_display",
            "requires_consultant_review",
            "consultant_specialty",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class ReviewRequestSerializer(serializers.ModelSerializer):
    """Serializer for ReviewRequest model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    ward_name = serializers.CharField(source="admission.ward.name", read_only=True)
    bed_number = serializers.CharField(source="admission.bed.bed_number", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    assigned_to_username = serializers.CharField(
        source="assigned_to.username", read_only=True, allow_null=True
    )
    acknowledged_by_username = serializers.CharField(
        source="acknowledged_by.username", read_only=True, allow_null=True
    )
    review_type_display = serializers.CharField(source="get_review_type_display", read_only=True)
    urgency_display = serializers.CharField(source="get_urgency_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_overdue = serializers.ReadOnlyField()

    class Meta:
        model = ReviewRequest
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "ward_name",
            "bed_number",
            "review_type",
            "review_type_display",
            "urgency",
            "urgency_display",
            "reason",
            "requested_by",
            "requested_by_username",
            "requested_at",
            "consultant_specialty",
            "assigned_to",
            "assigned_to_username",
            "status",
            "status_display",
            "acknowledged_at",
            "acknowledged_by",
            "acknowledged_by_username",
            "completed_at",
            "clinical_context",
            "cancellation_reason",
            "is_overdue",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "requested_at",
            "acknowledged_at",
            "acknowledged_by",
            "completed_at",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class ReviewRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating ReviewRequest.
    
    Note: requested_by is set by the ViewSet, not in the serializer,
    to allow flexibility in both view-based and serializer-based usage.
    """

    class Meta:
        model = ReviewRequest
        fields = [
            "admission",
            "review_type",
            "urgency",
            "reason",
            "consultant_specialty",
            "clinical_context",
        ]


class NursingCarePlanEntrySerializer(serializers.ModelSerializer):
    """Serializer for NursingCarePlanEntry model."""

    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = NursingCarePlanEntry
        fields = [
            "id",
            "kardex",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "assessment",
            "nursing_diagnosis",
            "goal_and_outcome_criteria",
            "plan_of_action",
            "scientific_rationale",
            "implementation",
            "evaluation",
            "status",
            "status_display",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "recorded_by", "created_at", "updated_at"]


class NursingCarePlanEntryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a NursingCarePlanEntry."""

    class Meta:
        model = NursingCarePlanEntry
        fields = [
            "recorded_at",
            "assessment",
            "nursing_diagnosis",
            "goal_and_outcome_criteria",
            "plan_of_action",
            "scientific_rationale",
            "implementation",
            "evaluation",
            "status",
        ]


class KardexShiftNoteSerializer(serializers.ModelSerializer):
    """Serializer for KardexShiftNote model."""

    nurse_username = serializers.CharField(source="nurse.username", read_only=True)
    shift_display = serializers.CharField(source="get_shift_display", read_only=True)

    class Meta:
        model = KardexShiftNote
        fields = [
            "id",
            "kardex",
            "shift",
            "shift_display",
            "nurse",
            "nurse_username",
            "content",
            "timestamp",
        ]
        read_only_fields = ["id", "timestamp"]


class KardexHandoverNoteSerializer(serializers.ModelSerializer):
    """Serializer for KardexHandoverNote model."""

    outgoing_nurse_username = serializers.CharField(
        source="outgoing_nurse.username", read_only=True
    )
    incoming_nurse_username = serializers.CharField(
        source="incoming_nurse.username", read_only=True
    )

    class Meta:
        model = KardexHandoverNote
        fields = [
            "id",
            "kardex",
            "outgoing_nurse",
            "outgoing_nurse_username",
            "incoming_nurse",
            "incoming_nurse_username",
            "shift_ending",
            "pending_tasks",
            "escalations",
            "acknowledged_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class InpatientConsumableUsageSerializer(serializers.ModelSerializer):
    """Serializer for inpatient consumable stock usage records."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    drug_name = serializers.CharField(source="drug.get_display_name", read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True)
    used_by_username = serializers.CharField(source="used_by.username", read_only=True)
    reversed_by_username = serializers.CharField(source="reversed_by.username", read_only=True)

    class Meta:
        model = InpatientConsumableUsage
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "drug",
            "drug_name",
            "batch",
            "batch_number",
            "quantity_used",
            "notes",
            "used_by",
            "used_by_username",
            "used_at",
            "is_reversed",
            "reversed_by",
            "reversed_by_username",
            "reversed_at",
            "reverse_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "drug",
            "used_by",
            "is_reversed",
            "reversed_by",
            "reversed_at",
            "reverse_reason",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class InpatientConsumableUsageCreateSerializer(serializers.ModelSerializer):
    """Serializer for recording inpatient consumable usage."""

    class Meta:
        model = InpatientConsumableUsage
        fields = ["batch", "quantity_used", "notes", "used_at"]


class InpatientConsumableUsageReverseSerializer(serializers.Serializer):
    """Serializer for reversing a consumable usage record."""

    reason = serializers.CharField()


class NursingKardexSerializer(serializers.ModelSerializer):
    """Serializer for NursingKardex model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    ward_name = serializers.CharField(source="admission.ward.name", read_only=True)
    bed_number = serializers.CharField(source="admission.bed.bed_number", read_only=True)
    shift_notes = KardexShiftNoteSerializer(many=True, read_only=True)
    handover_notes = KardexHandoverNoteSerializer(many=True, read_only=True)
    care_plan_entries = NursingCarePlanEntrySerializer(many=True, read_only=True)
    fall_risk_display = serializers.CharField(source="get_fall_risk_display", read_only=True)
    pressure_sore_risk_display = serializers.CharField(
        source="get_pressure_sore_risk_display", read_only=True
    )
    maternity_continuity_action_display = serializers.CharField(
        source="get_maternity_continuity_action_display", read_only=True
    )

    class Meta:
        model = NursingKardex
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "ward_name",
            "bed_number",
            # Basic care information
            "mobility_status",
            "dietary_requirements",
            "allergies",
            "iv_access",
            "maternity_continuity_action",
            "maternity_continuity_action_display",
            "maternity_continuity_notes",
            # Legacy nursing care plan fields (deprecated)
            "nursing_problems",
            "interventions",
            "monitoring_requirements",
            "care_task_frequency",
            # Risk assessments
            "fall_risk",
            "fall_risk_display",
            "pressure_sore_risk",
            "pressure_sore_risk_display",
            # Isolation
            "isolation_required",
            "isolation_type",
            # Related notes and care plan entries
            "shift_notes",
            "handover_notes",
            "care_plan_entries",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "admission", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class ShiftHandoverSerializer(serializers.ModelSerializer):
    """Serializer for ShiftHandover model."""

    ward_name = serializers.CharField(source="ward.name", read_only=True)
    outgoing_nurse_username = serializers.CharField(
        source="outgoing_nurse.username", read_only=True
    )
    incoming_nurse_username = serializers.CharField(
        source="incoming_nurse.username", read_only=True
    )
    shift_ending_display = serializers.CharField(source="get_shift_ending_display", read_only=True)
    is_acknowledged = serializers.ReadOnlyField()

    class Meta:
        model = ShiftHandover
        fields = [
            "id",
            "ward",
            "ward_name",
            "shift_date",
            "shift_ending",
            "shift_ending_display",
            "outgoing_nurse",
            "outgoing_nurse_username",
            "incoming_nurse",
            "incoming_nurse_username",
            "total_patients",
            "critical_patients",
            "new_admissions",
            "discharges_pending",
            "general_notes",
            "acknowledged_at",
            "is_acknowledged",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "acknowledged_at", "created_at", "updated_at"]


# =============================================================================
# Supervisor Alert Serializers (for polling fallback)
# =============================================================================


class ConstraintViolationSerializer(serializers.Serializer):
    """Serializer for constraint violation details."""

    code = serializers.CharField(help_text="Violation code (e.g., 'GENDER_MISMATCH')")
    message = serializers.CharField(help_text="Human-readable violation message")
    severity = serializers.ChoiceField(
        choices=["WARNING", "CRITICAL"],
        help_text="Violation severity level",
    )


class SupervisorAlertSerializer(serializers.Serializer):
    """Serializer for supervisor critical violation alerts."""

    admission_id = serializers.IntegerField(help_text="Admission ID")
    admission_number = serializers.CharField(help_text="Admission number")
    patient_id = serializers.IntegerField(help_text="Patient ID")
    patient_name = serializers.CharField(help_text="Patient full name")
    patient_mrn = serializers.CharField(help_text="Patient MRN")
    ward_id = serializers.IntegerField(help_text="Ward ID")
    ward_name = serializers.CharField(help_text="Ward name")
    bed_number = serializers.CharField(help_text="Bed number")
    admitted_by = serializers.CharField(help_text="Name of admitting officer")
    critical_violations = ConstraintViolationSerializer(
        many=True, help_text="List of CRITICAL constraint violations"
    )
    override_reason = serializers.CharField(
        allow_null=True, help_text="Reason provided for override"
    )
    timestamp = serializers.DateTimeField(help_text="Admission timestamp")


class SupervisorAlertsResponseSerializer(serializers.Serializer):
    """Response serializer for supervisor alerts list endpoint."""

    alerts = SupervisorAlertSerializer(many=True, help_text="List of critical alerts")


# =============================================================================
# Ward Updates Serializers (for polling fallback)
# =============================================================================


class WardUpdateEventSerializer(serializers.Serializer):
    """Serializer for ward update events."""

    type = serializers.ChoiceField(
        choices=[
            "ward_constraints_updated",
            "compatibility_violation",
            "bed_availability_changed",
        ],
        help_text="Type of ward update event",
    )
    admission_id = serializers.IntegerField(
        required=False, allow_null=True, help_text="Related admission ID (if applicable)"
    )
    patient_name = serializers.CharField(
        required=False, allow_null=True, help_text="Patient name (if applicable)"
    )
    violations = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="List of violation messages (if applicable)",
    )
    timestamp = serializers.DateTimeField(help_text="Event timestamp")


class WardCurrentStateSerializer(serializers.Serializer):
    """Serializer for current ward constraint state."""

    ward_id = serializers.IntegerField(help_text="Ward ID")
    ward_name = serializers.CharField(help_text="Ward name")
    gender_restriction = serializers.CharField(
        allow_null=True, help_text="Gender restriction (ANY, MALE_ONLY, FEMALE_ONLY)"
    )
    min_age_years = serializers.IntegerField(
        allow_null=True, help_text="Minimum patient age in years"
    )
    max_age_years = serializers.IntegerField(
        allow_null=True, help_text="Maximum patient age in years"
    )
    isolation_capable = serializers.BooleanField(help_text="Ward has isolation capability")
    oxygen_equipped = serializers.BooleanField(help_text="Ward has oxygen equipment")
    ventilator_capable = serializers.BooleanField(help_text="Ward has ventilator capability")
    maternity_designated = serializers.BooleanField(help_text="Ward is designated for maternity patients")
    available_beds = serializers.IntegerField(help_text="Number of available beds")


class WardUpdatesResponseSerializer(serializers.Serializer):
    """Response serializer for ward updates polling endpoint."""

    events = WardUpdateEventSerializer(many=True, help_text="List of ward update events")
    current_state = WardCurrentStateSerializer(help_text="Current ward constraint state")


# =============================================================================
# Alert Acknowledgment Serializers
# =============================================================================


class SupervisorAlertAcknowledgmentSerializer(serializers.ModelSerializer):
    """Serializer for SupervisorAlertAcknowledgment model."""

    acknowledged_by_username = serializers.CharField(
        source="acknowledged_by.username", read_only=True
    )
    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)

    class Meta:
        model = SupervisorAlertAcknowledgment
        fields = [
            "id",
            "admission",
            "admission_number",
            "acknowledged_by",
            "acknowledged_by_username",
            "acknowledged_at",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "acknowledged_at", "created_at"]


class AcknowledgeAlertRequestSerializer(serializers.Serializer):
    """Request serializer for acknowledging a supervisor alert."""

    admission_id = serializers.IntegerField(help_text="Admission ID to acknowledge")
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Optional notes from the supervisor",
    )


# =============================================================================
# Constraint Override Metrics Serializers
# =============================================================================


class ViolationTypeBreakdownSerializer(serializers.Serializer):
    """Breakdown of violations by type."""

    code = serializers.CharField(help_text="Violation code (e.g., 'GENDER_MISMATCH')")
    count = serializers.IntegerField(help_text="Count of this violation type")


class WardOverrideStatsSerializer(serializers.Serializer):
    """Override statistics for a single ward."""

    ward_id = serializers.IntegerField(help_text="Ward ID")
    ward_name = serializers.CharField(help_text="Ward name")
    override_count = serializers.IntegerField(help_text="Number of overrides")


class ConstraintOverrideMetricsSerializer(serializers.Serializer):
    """Response serializer for constraint override metrics."""

    # Overview stats
    total_admissions = serializers.IntegerField(help_text="Total admissions in period")
    override_count = serializers.IntegerField(help_text="Admissions with constraint overrides")
    override_rate = serializers.FloatField(help_text="Percentage of admissions with overrides")
    critical_override_count = serializers.IntegerField(
        help_text="Admissions with CRITICAL violations overridden"
    )
    acknowledged_count = serializers.IntegerField(
        help_text="CRITICAL overrides acknowledged by supervisors"
    )
    pending_acknowledgment_count = serializers.IntegerField(
        help_text="CRITICAL overrides pending acknowledgment"
    )

    # Breakdowns
    violation_breakdown = ViolationTypeBreakdownSerializer(
        many=True, help_text="Violations by type"
    )
    ward_breakdown = WardOverrideStatsSerializer(many=True, help_text="Overrides by ward")

    # Common override reasons
    common_reasons = serializers.ListField(
        child=serializers.DictField(),
        help_text="Most common override reasons with counts",
    )


# =============================================================================
# Observation Chart Serializers
# =============================================================================


class TemperatureReadingSerializer(serializers.ModelSerializer):
    """Serializer for TPR chart readings."""

    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True
    )
    is_febrile = serializers.BooleanField(read_only=True)
    is_hypothermic = serializers.BooleanField(read_only=True)

    class Meta:
        model = TemperatureReading
        fields = [
            "id",
            "admission",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "temperature",
            "pulse",
            "respiratory_rate",
            "notes",
            "is_febrile",
            "is_hypothermic",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TemperatureReadingCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating TPR readings."""

    class Meta:
        model = TemperatureReading
        fields = [
            "admission",
            "recorded_at",
            "temperature",
            "pulse",
            "respiratory_rate",
            "notes",
        ]


class FluidBalanceSheetSerializer(serializers.ModelSerializer):
    """Serializer for Ministry of Health fluid balance sheets."""

    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True
    )
    total_intravenous_intake_ml = serializers.IntegerField(read_only=True)
    total_alimentary_intake_ml = serializers.IntegerField(read_only=True)
    total_other_intake_ml = serializers.IntegerField(read_only=True)
    total_intake_ml = serializers.IntegerField(read_only=True)
    total_vomit_output_ml = serializers.IntegerField(read_only=True)
    total_stool_output_ml = serializers.IntegerField(read_only=True)
    total_nasogastric_output_ml = serializers.IntegerField(read_only=True)
    total_other_output_ml = serializers.IntegerField(read_only=True)
    total_urine_output_ml = serializers.IntegerField(read_only=True)
    total_output_ml = serializers.IntegerField(read_only=True)
    net_balance_ml = serializers.IntegerField(read_only=True)

    class Meta:
        model = FluidBalanceSheet
        fields = [
            "id",
            "admission",
            "chart_date",
            "recorded_by",
            "recorded_by_username",
            "patient_weight_kg",
            "intravenous_infusion_notes",
            "other_instructions",
            "total_intravenous_intake_ml",
            "total_alimentary_intake_ml",
            "total_other_intake_ml",
            "total_intake_ml",
            "total_vomit_output_ml",
            "total_stool_output_ml",
            "total_nasogastric_output_ml",
            "total_other_output_ml",
            "total_urine_output_ml",
            "total_output_ml",
            "net_balance_ml",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FluidBalanceSheetCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating fluid balance sheets."""

    class Meta:
        model = FluidBalanceSheet
        fields = [
            "admission",
            "chart_date",
            "patient_weight_kg",
            "intravenous_infusion_notes",
            "other_instructions",
        ]


class FluidBalanceEntrySerializer(serializers.ModelSerializer):
    """Serializer for categorized fluid balance entries."""

    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True
    )
    entry_type_display = serializers.CharField(
        source="get_entry_type_display", read_only=True
    )

    class Meta:
        model = FluidBalanceEntry
        fields = [
            "id",
            "fluid_balance_sheet",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "entry_type",
            "entry_type_display",
            "item_type",
            "bottle_number",
            "amount_ml",
            "specific_gravity",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FluidBalanceEntryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating fluid balance entries."""

    class Meta:
        model = FluidBalanceEntry
        fields = [
            "fluid_balance_sheet",
            "recorded_at",
            "entry_type",
            "item_type",
            "bottle_number",
            "amount_ml",
            "specific_gravity",
            "notes",
        ]


class TransfusionObservationEntrySerializer(serializers.ModelSerializer):
    """Serializer for individual transfusion observation entries."""

    observation_interval_display = serializers.CharField(
        source="get_observation_interval_display", read_only=True
    )
    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True
    )

    class Meta:
        model = TransfusionObservationEntry
        fields = [
            "id",
            "transfusion",
            "observation_interval",
            "observation_interval_display",
            "exact_time",
            "recorded_by",
            "recorded_by_username",
            "blood_pressure",
            "temperature",
            "pulse",
            "respiratory_rate",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TransfusionObservationEntryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating transfusion observation entries.

    Note: ``transfusion`` and ``recorded_by`` are set by the view
    (``add_observation`` action), not by the client.
    """

    class Meta:
        model = TransfusionObservationEntry
        fields = [
            "observation_interval",
            "exact_time",
            "blood_pressure",
            "temperature",
            "pulse",
            "respiratory_rate",
            "remarks",
        ]


class BloodTransfusionSerializer(serializers.ModelSerializer):
    """Serializer for blood transfusion observation chart."""

    blood_product_display = serializers.CharField(
        source="get_blood_product_display", read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )
    started_by_username = serializers.CharField(
        source="started_by.username", read_only=True
    )
    counter_checked_by_username = serializers.CharField(
        source="counter_checked_by.username", read_only=True, default=None
    )
    patient_name = serializers.CharField(
        source="admission.patient.__str__", read_only=True
    )
    observations = TransfusionObservationEntrySerializer(many=True, read_only=True)

    class Meta:
        model = BloodTransfusionObservation
        fields = [
            "id",
            "admission",
            "patient_name",
            "blood_product",
            "blood_product_display",
            "blood_product_other",
            "blood_unit_number",
            "blood_group",
            "amount_ml",
            "transfusion_date",
            "time_started",
            "time_ended",
            "started_by",
            "started_by_username",
            "counter_checked_by",
            "counter_checked_by_username",
            "diagnosis",
            "status",
            "status_display",
            "reaction_occurred",
            "reaction_type",
            "reaction_action_taken",
            "observations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BloodTransfusionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating blood transfusion records."""

    class Meta:
        model = BloodTransfusionObservation
        fields = [
            "admission",
            "blood_product",
            "blood_product_other",
            "blood_unit_number",
            "blood_group",
            "amount_ml",
            "transfusion_date",
            "time_started",
            "diagnosis",
        ]


class BPMonitoringReadingSerializer(serializers.ModelSerializer):
    """Serializer for BP monitoring readings."""

    recorded_by_username = serializers.CharField(
        source="recorded_by.username", read_only=True
    )
    mean_arterial_pressure = serializers.IntegerField(read_only=True)
    bp_display = serializers.CharField(read_only=True)
    is_hypertensive = serializers.BooleanField(read_only=True)
    is_hypotensive = serializers.BooleanField(read_only=True)
    position_display = serializers.CharField(
        source="get_position_display", read_only=True
    )

    class Meta:
        model = BPMonitoringReading
        fields = [
            "id",
            "admission",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "systolic",
            "diastolic",
            "pulse",
            "position",
            "position_display",
            "arm",
            "notes",
            "mean_arterial_pressure",
            "bp_display",
            "is_hypertensive",
            "is_hypotensive",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BPMonitoringReadingCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating BP monitoring readings."""

    class Meta:
        model = BPMonitoringReading
        fields = [
            "admission",
            "recorded_at",
            "systolic",
            "diastolic",
            "pulse",
            "position",
            "arm",
            "notes",
        ]


class MedicationAdministrationSerializer(serializers.ModelSerializer):
    """Serializer for Medication Administration Record entries."""

    administered_by_username = serializers.CharField(
        source="administered_by.username", read_only=True, default=None
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )
    drug_name = serializers.CharField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    patient_name = serializers.CharField(
        source="admission.patient.full_name", read_only=True, default=""
    )
    admission_number = serializers.CharField(
        source="admission.admission_number", read_only=True, default=""
    )

    class Meta:
        model = MedicationAdministration
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "prescription_item",
            "drug_name",
            "scheduled_time",
            "actual_time",
            "status",
            "status_display",
            "dose_given",
            "route",
            "administered_by",
            "administered_by_username",
            "notes",
            "is_prn",
            "is_overdue",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class MedicationAdministrationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating MAR entries."""

    class Meta:
        model = MedicationAdministration
        fields = [
            "admission",
            "prescription_item",
            "scheduled_time",
            "actual_time",
            "status",
            "dose_given",
            "route",
            "notes",
            "is_prn",
        ]


class MedicationAdministrationActionSerializer(serializers.Serializer):
    """Serializer for MAR administration actions (give/skip/refuse/hold)."""

    status = serializers.ChoiceField(
        choices=["GIVEN", "SKIPPED", "REFUSED", "HELD", "VOMITED"]
    )
    dose_given = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# =============================================================================
# Rule-Based Bed Assignment Serializers (Phase B)
# =============================================================================


class RuleBasedBedAssignmentRequestSerializer(serializers.Serializer):
    """Request serializer for rule-based bed assignment recommendation."""

    patient_id = serializers.IntegerField(help_text="Patient ID to assign bed for")
    requires_isolation = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires isolation",
    )
    requires_oxygen = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires oxygen supply",
    )
    requires_ventilator = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires ventilator",
    )
    admission_type = serializers.ChoiceField(
        choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
        required=False,
        default="ELECTIVE",
        help_text="Type of admission",
    )


class BedCandidateSerializer(serializers.Serializer):
    """Serializer for a bed candidate evaluation result."""

    bed_id = serializers.IntegerField()
    bed_number = serializers.CharField()
    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    ward_code = serializers.CharField()
    passed = serializers.SerializerMethodField()
    matched_constraints = serializers.ListField(child=serializers.CharField())
    failed_constraints = serializers.ListField(child=serializers.CharField())
    compatibility_violations = serializers.ListField(child=serializers.DictField())
    rejection_reason = serializers.CharField(allow_blank=True)
    score = serializers.FloatField()
    scoring_breakdown = serializers.DictField()

    def get_passed(self, obj) -> bool:
        """Determine if bed passed all constraints."""
        if hasattr(obj, "passed_all_constraints"):
            return obj.passed_all_constraints
        return (
            len(obj.get("failed_constraints", [])) == 0
            and len(obj.get("compatibility_violations", [])) == 0
        )


class RuleBasedBedAssignmentResponseSerializer(serializers.Serializer):
    """Response serializer for rule-based bed assignment."""

    success = serializers.BooleanField(help_text="Whether assignment was successful")
    assigned_bed_id = serializers.IntegerField(
        allow_null=True, help_text="Assigned bed ID (null if unsuccessful)"
    )
    assigned_bed_number = serializers.CharField(
        allow_null=True, help_text="Assigned bed number"
    )
    assigned_ward_name = serializers.CharField(
        allow_null=True, help_text="Assigned ward name"
    )
    rule_applied = serializers.CharField(
        allow_null=True, help_text="Rule code that was applied (null if none)"
    )
    decision_id = serializers.IntegerField(
        allow_null=True, help_text="AssignmentDecision ID for audit"
    )
    decision_outcome = serializers.CharField(help_text="Decision outcome")
    decision_reason = serializers.CharField(help_text="Decision explanation")
    evaluation_time_ms = serializers.IntegerField(help_text="Evaluation time in ms")
    candidates_evaluated = BedCandidateSerializer(
        many=True, help_text="All evaluated bed candidates"
    )
    scoring_details = serializers.DictField(help_text="Scoring summary")
    error = serializers.CharField(
        allow_null=True, allow_blank=True, help_text="Error message if failed"
    )


# =============================================================================
# Smart Allocation Serializers (Phase C)
# =============================================================================


class SetExpectedDischargeSerializer(serializers.Serializer):
    """Request serializer for setting expected discharge date."""

    expected_discharge_date = serializers.DateTimeField(
        help_text="Expected discharge date and time",
    )

    def validate_expected_discharge_date(self, value):
        from django.utils import timezone

        if value <= timezone.now():
            raise serializers.ValidationError(
                "Expected discharge date must be in the future."
            )
        return value


class PredictedDischargeSerializer(serializers.Serializer):
    """Serializer for predicted discharge information."""

    admission_id = serializers.IntegerField()
    admission_number = serializers.CharField()
    patient_name = serializers.CharField()
    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    bed_id = serializers.IntegerField()
    bed_number = serializers.CharField()
    admission_date = serializers.CharField()
    expected_discharge_date = serializers.CharField(allow_null=True)
    estimated_discharge_date = serializers.CharField(allow_null=True)
    source = serializers.CharField()
    hours_until_available = serializers.FloatField(allow_null=True)


class BedUtilizationSerializer(serializers.Serializer):
    """Serializer for bed utilization analytics."""

    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    ward_code = serializers.CharField()
    capacity = serializers.IntegerField()
    occupied = serializers.IntegerField()
    available = serializers.IntegerField()
    cleaning = serializers.IntegerField()
    reserved = serializers.IntegerField()
    maintenance = serializers.IntegerField()
    occupancy_rate = serializers.FloatField()
    emergency_buffer_percent = serializers.IntegerField()
    emergency_buffer_beds = serializers.IntegerField()
    effective_available = serializers.IntegerField()
    avg_length_of_stay_days = serializers.FloatField(allow_null=True)
    predicted_discharges_next_4h = serializers.IntegerField()
    predicted_discharges_next_24h = serializers.IntegerField()
    workload_score = serializers.FloatField()


class SmartRecommendBedRequestSerializer(serializers.Serializer):
    """Request serializer for smart bed recommendation."""

    patient_id = serializers.IntegerField(help_text="Patient ID")
    requires_isolation = serializers.BooleanField(
        required=False, default=False,
        help_text="Whether patient requires isolation (auto-detected if not set)",
    )
    requires_oxygen = serializers.BooleanField(
        required=False, default=False,
        help_text="Whether patient requires oxygen supply",
    )
    requires_ventilator = serializers.BooleanField(
        required=False, default=False,
        help_text="Whether patient requires ventilator",
    )
    admission_type = serializers.ChoiceField(
        choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
        required=False, default="ELECTIVE",
        help_text="Type of admission",
    )


class SmartRecommendBedResponseSerializer(serializers.Serializer):
    """Response serializer for smart bed recommendation."""

    success = serializers.BooleanField()
    assigned_bed_id = serializers.IntegerField(allow_null=True)
    assigned_bed_number = serializers.CharField(allow_null=True)
    smart_scores = serializers.DictField()
    emergency_buffer_enforced = serializers.BooleanField()
    cohort_match_score = serializers.FloatField()
    infection_isolation_triggered = serializers.BooleanField()
    workload_score = serializers.FloatField()
    predicted_discharges = PredictedDischargeSerializer(many=True)
    evaluation_time_ms = serializers.IntegerField()
    error = serializers.CharField(allow_null=True, allow_blank=True)


class RecommendWardRequestSerializer(serializers.Serializer):
    """Request serializer for smart ward recommendation."""

    patient_id = serializers.IntegerField(help_text="Patient ID")
    requires_isolation = serializers.BooleanField(
        required=False, default=False,
        help_text="Whether patient requires isolation",
    )
    requires_oxygen = serializers.BooleanField(
        required=False, default=False,
        help_text="Whether patient requires oxygen supply",
    )
    requires_ventilator = serializers.BooleanField(
        required=False, default=False,
        help_text="Whether patient requires ventilator",
    )
    admission_type = serializers.ChoiceField(
        choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
        required=False, default="ELECTIVE",
        help_text="Type of admission",
    )


class WardCandidateSerializer(serializers.Serializer):
    """Serializer for a ward candidate in recommendation results."""

    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    ward_code = serializers.CharField()
    ward_type = serializers.CharField()
    ward_type_display = serializers.CharField()
    compatible = serializers.BooleanField()
    score = serializers.FloatField()
    scores = serializers.DictField()
    total_beds = serializers.IntegerField()
    available_beds = serializers.IntegerField()
    effective_available = serializers.IntegerField()
    occupancy_rate = serializers.FloatField()
    violations = serializers.ListField(child=serializers.CharField())
    rejection_reason = serializers.CharField(allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
    recommended = serializers.BooleanField()


class RecommendWardResponseSerializer(serializers.Serializer):
    """Response serializer for smart ward recommendation."""

    success = serializers.BooleanField()
    recommended_ward_id = serializers.IntegerField(allow_null=True)
    recommended_ward_name = serializers.CharField(allow_null=True)
    ranked_wards = WardCandidateSerializer(many=True)
    incompatible_wards = WardCandidateSerializer(many=True)
    total_evaluated = serializers.IntegerField()
    infection_isolation_triggered = serializers.BooleanField()
    evaluation_time_ms = serializers.IntegerField()
    error = serializers.CharField(allow_null=True, allow_blank=True)
