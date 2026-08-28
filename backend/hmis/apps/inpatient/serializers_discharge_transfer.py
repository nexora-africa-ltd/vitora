# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: inpatient discharge, transfer, ward round, and review serializers.
How to use: imported by `hmis.apps.inpatient.serializers` compatibility shim.
Supported inputs/args: DRF serializers for discharge and transfer workflows.
"""

from rest_framework import serializers

from hmis.apps.blood_bank.models import UnitStatus
from hmis.apps.core.models import Facility
from hmis.apps.core.utils import resolve_model_pk_or_public_id
from hmis.apps.encounters.models import Encounter
from hmis.apps.mch.services.postpartum_continuity import (
    route_registration_to_pnc_queue,
    schedule_registration_pnc_follow_up,
    transition_registration_to_postnatal,
)

from .clearance import calculate_patient_blocking_balance
from .models import (
    Admission,
    AdmissionRecommendation,
    AdverseTransfusionReaction,
    Bed,
    BloodTransfusionObservation,
    BPMonitoringReading,
    CardiacRespiratoryReaction,
    DermatologicalReaction,
    Discharge,
    DischargeDiagnosis,
    DischargeDraft,
    DischargeTemplate,
    FluidBalanceEntry,
    FluidBalanceSheet,
    GeneralReaction,
    HaematologicalReaction,
    InpatientConsumableUsage,
    InterFacilityTransfer,
    InterFacilityTransferEvent,
    KardexFieldChange,
    KardexHandoverNote,
    KardexScheduleItem,
    KardexShiftNote,
    MedicationAdministration,
    NursingCarePlanEntry,
    NursingCarePlanEntryChange,
    NursingKardex,
    RenalReaction,
    ReviewRequest,
    ShiftHandover,
    SupervisorAlertAcknowledgment,
    TemperatureReading,
    Transfer,
    TransfusionObservationEntry,
    Ward,
    WardRound,
)
from .serializers_shared import PublicIdOrPkRelatedField


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

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())
    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    diagnoses = DischargeDiagnosisSerializer(many=True, required=False)
    mch_registration = serializers.IntegerField(
        source="admission.mch_registration_id", read_only=True
    )
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
    follow_up_appointment = serializers.IntegerField(
        source="follow_up_appointment_id", read_only=True
    )
    length_of_stay = serializers.ReadOnlyField()
    death_record_id = serializers.SerializerMethodField()
    transfer_workflow = serializers.DictField(write_only=True, required=False)

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
            "follow_up_appointment",
            "follow_up_instructions",
            "referral_facility",
            "referral_reason",
            "patient_instructions",
            "pharmacy_cleared",
            "billing_cleared",
            "lab_results_acknowledged",
            "length_of_stay",
            "death_record_id",
            "transfer_workflow",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "maternity_continuity_status",
            "follow_up_appointment",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        admission = attrs.get("admission") or getattr(self.instance, "admission", None)
        discharge_type = attrs.get("discharge_type") or getattr(
            self.instance, "discharge_type", None
        )
        follow_up_date = (
            attrs.get("follow_up_date")
            if "follow_up_date" in attrs
            else getattr(self.instance, "follow_up_date", None)
        )
        transfer_workflow = attrs.get("transfer_workflow")

        # ----- Automated clearance validation for normal discharges -----
        if (
            admission
            and discharge_type in {"NORMAL", "ROUTINE", "TRANSFERRED"}
            and self.instance is None
        ):
            from hmis.apps.billing.models import Invoice
            from hmis.apps.laboratory.models import LabOrder
            from hmis.apps.pharmacy.models import Prescription

            clearance_errors = {}

            # Billing: check invoices linked to the IPD encounter
            unpaid_invoices = Invoice.objects.filter(
                encounter=admission.ipd_encounter,
            ).exclude(
                status__in=[
                    Invoice.Status.DRAFT,
                    Invoice.Status.PAID,
                    Invoice.Status.CANCELLED,
                    Invoice.Status.WRITTEN_OFF,
                ]
            )
            billing_balance = calculate_patient_blocking_balance(unpaid_invoices)
            outstanding = billing_balance["outstanding_amount"]
            billing_cleared = outstanding <= 0
            if not billing_cleared:
                clearance_errors["billing_cleared"] = (
                    f"Cannot discharge: KES {outstanding:,.2f} patient-responsible outstanding balance"
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

            # Lab: all IN_HOUSE lab orders completed or cancelled
            # EXTERNAL referrals do not block discharge.
            pending_labs = LabOrder.objects.filter(
                admission=admission,
                order_type="IN_HOUSE",
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

        if admission and discharge_type == "TRANSFERRED":
            open_transfer = self._get_open_transfer_for_admission(admission)
            if open_transfer is None and not transfer_workflow:
                raise serializers.ValidationError(
                    {
                        "transfer_workflow": (
                            "No open inter-facility transfer exists for this admission. "
                            "Provide transfer_workflow details to create and link one."
                        )
                    }
                )

            if transfer_workflow:
                destination_facility = transfer_workflow.get("destination_facility")
                destination_name = (
                    transfer_workflow.get("destination_facility_name") or ""
                ).strip()
                if not destination_facility and not destination_name:
                    raise serializers.ValidationError(
                        {
                            "transfer_workflow": (
                                "transfer_workflow requires destination_facility or "
                                "destination_facility_name."
                            )
                        }
                    )
                required_fields = ["reason_code", "clinical_summary", "handover_notes"]
                missing = [
                    field
                    for field in required_fields
                    if not str(transfer_workflow.get(field, "") or "").strip()
                ]
                if missing:
                    raise serializers.ValidationError(
                        {
                            "transfer_workflow": (
                                "transfer_workflow missing required fields: " + ", ".join(missing)
                            )
                        }
                    )

        return attrs

    @staticmethod
    def _get_open_transfer_for_admission(admission: Admission) -> InterFacilityTransfer | None:
        return (
            InterFacilityTransfer.objects.filter(
                source_admission=admission,
                status__in=[
                    InterFacilityTransfer.TransferStatus.DRAFT,
                    InterFacilityTransfer.TransferStatus.PENDING_ACCEPTANCE,
                    InterFacilityTransfer.TransferStatus.ACCEPTED,
                    InterFacilityTransfer.TransferStatus.IN_TRANSIT,
                ],
            )
            .order_by("-created_at")
            .first()
        )

    def _normalize_transfer_workflow_payload(self, payload: dict) -> tuple[dict, bool]:
        normalized = dict(payload)
        destination_facility = normalized.get("destination_facility")
        if destination_facility:
            if isinstance(destination_facility, Facility):
                normalized["destination_facility"] = destination_facility
            else:
                normalized["destination_facility"] = resolve_model_pk_or_public_id(
                    Facility, destination_facility
                )[0]

        normalized.setdefault("priority", InterFacilityTransfer.TransferPriority.ROUTINE)
        normalized.setdefault("transport_mode", InterFacilityTransfer.TransportMode.AMBULANCE)
        normalized.setdefault("escort_required", False)
        normalized.setdefault("escort_name", "")
        normalized.setdefault("reason_details", "")
        normalized.setdefault("destination_facility_name", "")

        submit_immediately = bool(normalized.pop("submit_immediately", False))
        return normalized, submit_immediately

    def _ensure_transfer_link(self, discharge: Discharge, transfer_workflow: dict | None) -> None:
        if discharge.discharge_type != "TRANSFERRED":
            return

        open_transfer = self._get_open_transfer_for_admission(discharge.admission)
        if open_transfer is None:
            if not transfer_workflow:
                raise serializers.ValidationError(
                    {
                        "transfer_workflow": (
                            "Provide transfer_workflow details to create a linked transfer record."
                        )
                    }
                )
            payload, submit_immediately = self._normalize_transfer_workflow_payload(
                transfer_workflow
            )
            open_transfer = InterFacilityTransfer.objects.create(
                source_admission=discharge.admission,
                source_discharge=discharge,
                patient=discharge.admission.patient,
                source_facility=discharge.admission.facility,
                requested_by=discharge.discharged_by,
                **payload,
            )
            InterFacilityTransferEvent.objects.create(
                transfer=open_transfer,
                event_type=InterFacilityTransferEvent.EventType.CREATED,
                actor=discharge.discharged_by,
                from_status="",
                to_status=open_transfer.status,
                note="Created from discharge workflow.",
            )
            if submit_immediately:
                open_transfer.transition_to(
                    InterFacilityTransfer.TransferStatus.PENDING_ACCEPTANCE,
                    user=discharge.discharged_by,
                )
                InterFacilityTransferEvent.objects.create(
                    transfer=open_transfer,
                    event_type=InterFacilityTransferEvent.EventType.SUBMITTED,
                    actor=discharge.discharged_by,
                    from_status=InterFacilityTransfer.TransferStatus.DRAFT,
                    to_status=InterFacilityTransfer.TransferStatus.PENDING_ACCEPTANCE,
                    note="Submitted from discharge workflow.",
                )
            return

        if open_transfer.source_discharge_id is None:
            open_transfer.source_discharge = discharge
            open_transfer.save(update_fields=["source_discharge", "updated_at"])

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

    def _schedule_follow_up_appointment(self, discharge: Discharge) -> None:
        """Create a follow-up Appointment when follow_up_date is set (non-maternity)."""
        if not discharge.follow_up_date:
            return
        # Maternity discharges handle their own appointments via _apply_maternity_continuity
        if discharge.admission.mch_registration_id:
            return

        import zoneinfo
        from datetime import datetime, time, timedelta

        from django.db.models import Q

        from hmis.apps.scheduling.models import Appointment, Resource

        # Find a suitable PLACE resource at this facility (prefer OPD/outpatient)
        facility = discharge.admission.facility
        resource = (
            Resource.objects.filter(
                facility=facility,
                resource_type="PLACE",
                is_active=True,
            )
            .filter(
                Q(code__icontains="OPD")
                | Q(name__icontains="outpatient")
                | Q(name__icontains="consultation")
            )
            .first()
        )
        if resource is None:
            resource = Resource.objects.filter(
                facility=facility,
                resource_type="PLACE",
                is_active=True,
            ).first()
        if resource is None:
            # No resource configured — store the date but skip appointment creation
            return

        tz = zoneinfo.ZoneInfo("Africa/Nairobi")
        start_dt = datetime.combine(discharge.follow_up_date, time(8, 0), tzinfo=tz)
        end_dt = start_dt + timedelta(minutes=30)

        appointment = Appointment(
            patient=discharge.admission.patient,
            resource=resource,
            facility=facility,
            organization=discharge.admission.organization,
            appointment_type="FOLLOW_UP",
            scheduled_start=start_dt,
            scheduled_end=end_dt,
            reason=f"Post-discharge follow-up — {discharge.final_diagnosis_text or 'General'}",
            notes=discharge.follow_up_instructions or "",
            priority="ROUTINE",
            status="CREATED",
            created_by=discharge.discharged_by,
        )
        appointment.save()

        discharge.follow_up_appointment = appointment
        discharge.save(update_fields=["follow_up_appointment", "updated_at"])

    def create(self, validated_data):
        diagnoses_data = validated_data.pop("diagnoses", [])
        transfer_workflow = validated_data.pop("transfer_workflow", None)
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
        self._schedule_follow_up_appointment(discharge)
        self._ensure_transfer_link(discharge, transfer_workflow)
        return discharge

    def update(self, instance, validated_data):
        diagnoses_data = validated_data.pop("diagnoses", None)
        transfer_workflow = validated_data.pop("transfer_workflow", None)
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
                discharge.save(
                    update_fields=["final_diagnosis", "final_diagnosis_text", "updated_at"]
                )

        if discharge.admission.mch_registration_id and discharge.maternity_continuity_action in {
            "SCHEDULE_EARLY_PNC",
            "ROUTE_TO_PNC_QUEUE",
        }:
            if (
                discharge.maternity_continuity_action == "SCHEDULE_EARLY_PNC"
                and discharge.pnc_appointment_id is None
                or discharge.maternity_continuity_action == "ROUTE_TO_PNC_QUEUE"
                and discharge.pnc_clinic_visit_id is None
            ):
                self._apply_maternity_continuity(discharge)

        self._ensure_transfer_link(discharge, transfer_workflow)
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


class DischargeDraftSerializer(serializers.ModelSerializer):
    """Serializer for persisted discharge drafts."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)

    class Meta:
        model = DischargeDraft
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "discharge_type",
            "diagnoses",
            "procedures_performed",
            "treatment_summary",
            "discharge_medications",
            "maternity_continuity_action",
            "follow_up_date",
            "follow_up_instructions",
            "referral_facility",
            "referral_reason",
            "patient_instructions",
            "generation_mode",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class InterFacilityTransferSerializer(serializers.ModelSerializer):
    """Serializer for inter-facility transfer workflow records."""

    source_admission_number = serializers.CharField(
        source="source_admission.admission_number", read_only=True
    )
    patient_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    reason_code_display = serializers.CharField(source="get_reason_code_display", read_only=True)
    source_facility_name = serializers.CharField(source="source_facility.name", read_only=True)
    destination_facility_label = serializers.SerializerMethodField()
    timeline_events = serializers.SerializerMethodField()
    discharge_summary_requested = serializers.SerializerMethodField()
    discharge_summary_requested_at = serializers.SerializerMethodField()
    discharge_summary_request_note = serializers.SerializerMethodField()
    discharge_summary_snapshot = serializers.SerializerMethodField()

    class Meta:
        model = InterFacilityTransfer
        fields = [
            "id",
            "public_id",
            "transfer_number",
            "source_admission",
            "source_admission_number",
            "source_discharge",
            "destination_admission",
            "patient",
            "patient_name",
            "source_facility",
            "source_facility_name",
            "destination_facility",
            "destination_facility_name",
            "destination_facility_label",
            "status",
            "status_display",
            "priority",
            "priority_display",
            "reason_code",
            "reason_code_display",
            "reason_details",
            "clinical_summary",
            "handover_notes",
            "transport_mode",
            "escort_required",
            "escort_name",
            "requested_by",
            "accepted_by",
            "dispatched_by",
            "arrived_by",
            "cancelled_by",
            "accepted_at",
            "dispatched_at",
            "arrived_at",
            "cancelled_at",
            "rejection_reason",
            "cancellation_reason",
            "timeline_events",
            "discharge_summary_requested",
            "discharge_summary_requested_at",
            "discharge_summary_request_note",
            "discharge_summary_snapshot",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "public_id",
            "transfer_number",
            "patient",
            "source_facility",
            "requested_by",
            "destination_admission",
            "accepted_by",
            "dispatched_by",
            "arrived_by",
            "cancelled_by",
            "accepted_at",
            "dispatched_at",
            "arrived_at",
            "cancelled_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        if self.instance and "status" in attrs and attrs.get("status") != self.instance.status:
            raise serializers.ValidationError(
                {"status": "Use workflow actions (submit/accept/reject/dispatch/arrive/cancel)."}
            )

        source_admission = attrs.get("source_admission") or getattr(
            self.instance, "source_admission", None
        )
        source_discharge = attrs.get("source_discharge") or getattr(
            self.instance, "source_discharge", None
        )
        destination_facility = attrs.get("destination_facility") or getattr(
            self.instance, "destination_facility", None
        )
        destination_name = attrs.get("destination_facility_name") or getattr(
            self.instance, "destination_facility_name", ""
        )

        if source_admission and source_admission.admission_status != "ACTIVE":
            if not source_discharge:
                raise serializers.ValidationError(
                    {
                        "source_admission": (
                            "Transfer workflow can only start from an ACTIVE admission "
                            "unless linked to a TRANSFERRED discharge."
                        )
                    }
                )

        if not destination_facility and not destination_name:
            raise serializers.ValidationError(
                {
                    "destination_facility_name": (
                        "Provide destination facility or destination facility name."
                    )
                }
            )

        return attrs

    def get_patient_name(self, obj) -> str:
        patient = obj.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_destination_facility_label(self, obj) -> str:
        if obj.destination_facility is not None:
            return obj.destination_facility.name
        return obj.destination_facility_name

    def get_timeline_events(self, obj):
        events_qs = obj.timeline_events.select_related("actor").all().order_by("occurred_at", "id")
        return InterFacilityTransferEventSerializer(events_qs, many=True).data

    @staticmethod
    def _latest_timeline_event(obj, event_type: str):
        return (
            obj.timeline_events.filter(event_type=event_type)
            .order_by("-occurred_at", "-id")
            .first()
        )

    def get_discharge_summary_requested(self, obj) -> bool:
        requested_event = self._latest_timeline_event(
            obj, InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_REQUESTED
        )
        if requested_event is None:
            return False
        shared_event = self._latest_timeline_event(
            obj, InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_SHARED
        )
        if shared_event is None:
            return True
        if requested_event.occurred_at > shared_event.occurred_at:
            return True
        if requested_event.occurred_at == shared_event.occurred_at:
            return requested_event.id > shared_event.id
        return False

    def get_discharge_summary_requested_at(self, obj):
        if not self.get_discharge_summary_requested(obj):
            return None
        requested_event = self._latest_timeline_event(
            obj, InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_REQUESTED
        )
        return requested_event.occurred_at if requested_event else None

    def get_discharge_summary_request_note(self, obj):
        requested_event = self._latest_timeline_event(
            obj, InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_REQUESTED
        )
        if requested_event is None:
            return None
        metadata = requested_event.metadata or {}
        request_note = metadata.get("request_note")
        return request_note if isinstance(request_note, str) and request_note.strip() else None

    def get_discharge_summary_snapshot(self, obj):
        shared_event = self._latest_timeline_event(
            obj, InterFacilityTransferEvent.EventType.DISCHARGE_SUMMARY_SHARED
        )
        if shared_event is None:
            return None
        metadata = shared_event.metadata or {}
        snapshot = metadata.get("discharge_snapshot")
        return snapshot if isinstance(snapshot, dict) else None


class InterFacilityTransferEventSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source="get_event_type_display", read_only=True)
    actor_username = serializers.CharField(source="actor.username", read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = InterFacilityTransferEvent
        fields = [
            "id",
            "event_type",
            "event_type_display",
            "from_status",
            "to_status",
            "occurred_at",
            "actor",
            "actor_username",
            "actor_name",
            "note",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj) -> str:
        if obj.actor is None:
            return ""
        full_name = obj.actor.get_full_name()
        return full_name or obj.actor.username


class TransferSerializer(serializers.ModelSerializer):
    """Serializer for Transfer model."""

    _CARE_LEVEL_SCORE = {
        "MEDICAL": 1,
        "SURGICAL": 1,
        "PEDIATRIC": 1,
        "MATERNITY": 1,
        "ISOLATION": 1,
        "HDU": 2,
        "NBU": 2,
        "ICU": 3,
    }

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    mch_registration = serializers.IntegerField(
        source="admission.mch_registration_id", read_only=True
    )
    mch_registration_number = serializers.CharField(
        source="admission.mch_registration.mch_number", read_only=True
    )
    source_ward_name = serializers.CharField(source="source_ward.name", read_only=True)
    source_ward_type = serializers.CharField(source="source_ward.ward_type", read_only=True)
    source_bed_number = serializers.CharField(source="source_bed.bed_number", read_only=True)
    destination_ward_name = serializers.CharField(source="destination_ward.name", read_only=True)
    destination_ward_type = serializers.CharField(
        source="destination_ward.ward_type", read_only=True
    )
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
            "source_ward_type",
            "source_bed",
            "source_bed_number",
            "destination_ward",
            "destination_ward_name",
            "destination_ward_type",
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
        destination_ward = attrs.get("destination_ward") or getattr(
            self.instance, "destination_ward", None
        )
        reason = attrs.get("reason") or getattr(self.instance, "reason", None)
        reason_details = attrs.get("reason_details") or getattr(self.instance, "reason_details", "")
        clinical_handover_notes = attrs.get("clinical_handover_notes") or getattr(
            self.instance, "clinical_handover_notes", ""
        )

        if admission and source_ward and admission.ward_id != source_ward.id:
            raise serializers.ValidationError(
                {"source_ward": "Source ward must match the admission's current ward."}
            )

        if admission and source_bed and admission.bed_id != source_bed.id:
            raise serializers.ValidationError(
                {"source_bed": "Source bed must match the admission's current bed."}
            )

        if source_ward and destination_ward and source_ward.id == destination_ward.id:
            raise serializers.ValidationError(
                {"destination_ward": "Destination ward must be different from source ward."}
            )

        if reason in {"STEP_UP", "STEP_DOWN"}:
            if (
                admission
                and admission.mch_registration_id
                and not str(reason_details or "").strip()
                and str(clinical_handover_notes or "").strip()
            ):
                reason_details = str(clinical_handover_notes).strip()
                attrs["reason_details"] = reason_details

            if not str(reason_details or "").strip():
                raise serializers.ValidationError(
                    {"reason_details": "Provide reason_details for step-up/step-down transfers."}
                )

            if source_ward and destination_ward:
                source_score = self._CARE_LEVEL_SCORE.get(str(source_ward.ward_type), 1)
                destination_score = self._CARE_LEVEL_SCORE.get(str(destination_ward.ward_type), 1)

                if reason == "STEP_UP" and destination_score <= source_score:
                    raise serializers.ValidationError(
                        {
                            "destination_ward": (
                                "STEP_UP transfer must move to a higher-acuity ward "
                                f"(current: {source_ward.ward_type}, destination: {destination_ward.ward_type})."
                            )
                        }
                    )

                if reason == "STEP_DOWN" and destination_score > source_score:
                    raise serializers.ValidationError(
                        {
                            "destination_ward": (
                                "STEP_DOWN transfer must move to a lower-acuity ward "
                                f"(current: {source_ward.ward_type}, destination: {destination_ward.ward_type})."
                            )
                        }
                    )

        if admission and destination_ward and destination_ward.ward_type == "NBU":
            patient_dob = getattr(admission.patient, "date_of_birth", None)
            if patient_dob is not None:
                from datetime import date

                age_years = (date.today() - patient_dob).days // 365
                if age_years > 1:
                    raise serializers.ValidationError(
                        {
                            "destination_ward": "NBU destination is only allowed for newborn/infant patients."
                        }
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
    review_type_display = serializers.CharField(source="get_review_type_display", read_only=True)
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
            "temperature",
            "pulse",
            "blood_pressure",
            "respiratory_rate",
            "spo2",
            "gcs_total",
            "on_vasopressors",
            "vasopressor_dose_mcg_kg_min",
            "on_mechanical_ventilation",
            "urine_output_ml_24h",
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

    def validate(self, attrs):
        attrs = super().validate(attrs)

        placeholder_values = {"see clinical notes", "see notes", "refer to clinical notes"}
        field_values = {
            "subjective": attrs.get("subjective"),
            "objective": attrs.get("objective"),
            "assessment": attrs.get("assessment"),
            "plan": attrs.get("plan"),
        }
        errors = {}

        for field_name, value in field_values.items():
            normalized = (value or "").strip()
            if not normalized:
                errors[field_name] = "This field is required."
                continue
            if normalized.lower() in placeholder_values:
                errors[field_name] = "Enter the actual ward-round content for this field."

        if errors:
            raise serializers.ValidationError(errors)

        if (
            attrs.get("vasopressor_dose_mcg_kg_min") is not None
            and attrs.get("on_vasopressors") is False
        ):
            raise serializers.ValidationError(
                {
                    "vasopressor_dose_mcg_kg_min": (
                        "Dose can only be recorded when on_vasopressors is true or unknown."
                    )
                }
            )

        return attrs

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

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())

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
