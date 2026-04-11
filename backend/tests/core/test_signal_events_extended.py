"""
Tests for domain event publishing from newly wired signal handlers.

Covers: scheduling, encounters (post_save), triage, inpatient,
        MCH, surveillance, and imaging signal handlers.
"""

import pytest  # type: ignore
from unittest.mock import MagicMock, patch

from hmis.apps.core.events import (
    ClinicalEvents,
    ImagingEvents,
    ImmunizationEvents,
    InpatientEvents,
    MCHEvents,
    SchedulingEvents,
    SurveillanceEvents,
    get_event_bus,
)
from hmis.apps.core.events.bus import reset_event_bus


@pytest.fixture(autouse=True)
def _clean_event_bus():
    """Reset event bus before each test to ensure clean state."""
    reset_event_bus()
    yield
    reset_event_bus()


# ---------------------------------------------------------------------------
# Event Type Naming Conventions
# ---------------------------------------------------------------------------


class TestExtendedEventTypeCatalog:
    """Verify naming convention for new event type classes."""

    def test_scheduling_events_follow_convention(self):
        for attr in dir(SchedulingEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(SchedulingEvents, attr)
                assert value.startswith("scheduling."), f"{attr} = {value}"

    def test_imaging_events_follow_convention(self):
        for attr in dir(ImagingEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(ImagingEvents, attr)
                assert value.startswith("imaging."), f"{attr} = {value}"

    def test_inpatient_events_follow_convention(self):
        for attr in dir(InpatientEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(InpatientEvents, attr)
                assert value.startswith("inpatient."), f"{attr} = {value}"

    def test_mch_events_follow_convention(self):
        for attr in dir(MCHEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(MCHEvents, attr)
                assert value.startswith("mch."), f"{attr} = {value}"

    def test_surveillance_events_follow_convention(self):
        for attr in dir(SurveillanceEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(SurveillanceEvents, attr)
                assert value.startswith("surveillance."), f"{attr} = {value}"

    def test_immunization_events_follow_convention(self):
        for attr in dir(ImmunizationEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(ImmunizationEvents, attr)
                assert value.startswith("immunization."), f"{attr} = {value}"

    def test_no_duplicate_event_types_across_new_catalogs(self):
        all_values = []
        for cls in [
            SchedulingEvents,
            ImagingEvents,
            InpatientEvents,
            MCHEvents,
            SurveillanceEvents,
            ImmunizationEvents,
        ]:
            for attr in dir(cls):
                if attr.isupper() and not attr.startswith("_"):
                    all_values.append(getattr(cls, attr))
        assert len(all_values) == len(set(all_values)), "Duplicate event types found"


# ---------------------------------------------------------------------------
# Scheduling Signal Events
# ---------------------------------------------------------------------------


class TestSchedulingSignalEvents:
    """Test domain event publishing from scheduling signal handlers."""

    @pytest.mark.django_db
    def test_appointment_created_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.APPOINTMENT_CREATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_appointment_event

        instance = MagicMock()
        instance.id = 10
        instance.appointment_number = "APT-001"
        instance.status = "CREATED"
        instance.patient_id = 5
        instance.resource_id = 2
        instance.appointment_type = "NEW_PATIENT"
        instance.scheduled_start = "2026-04-01T08:00:00"
        instance.facility_id = 1
        instance.organization_id = 2

        publish_appointment_event(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.APPOINTMENT_CREATED
        assert received[0].aggregate_type == "Appointment"
        assert received[0].aggregate_id == 10
        assert received[0].payload["appointment_number"] == "APT-001"

    @pytest.mark.django_db
    def test_appointment_confirmed_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.APPOINTMENT_CONFIRMED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_appointment_event

        instance = MagicMock()
        instance.id = 10
        instance.appointment_number = "APT-001"
        instance.status = "CONFIRMED"
        instance.patient_id = 5
        instance.resource_id = 2
        instance.appointment_type = "NEW_PATIENT"
        instance.scheduled_start = "2026-04-01T08:00:00"
        instance.facility_id = 1
        instance.organization_id = 2

        publish_appointment_event(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.APPOINTMENT_CONFIRMED

    @pytest.mark.django_db
    def test_appointment_cancelled_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.APPOINTMENT_CANCELLED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_appointment_event

        instance = MagicMock()
        instance.id = 10
        instance.appointment_number = "APT-001"
        instance.status = "CANCELLED"
        instance.patient_id = 5
        instance.resource_id = 2
        instance.appointment_type = "FOLLOW_UP"
        instance.scheduled_start = None
        instance.facility_id = 1
        instance.organization_id = 2

        publish_appointment_event(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.APPOINTMENT_CANCELLED

    @pytest.mark.django_db
    def test_appointment_no_show_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.APPOINTMENT_NO_SHOW, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_appointment_event

        instance = MagicMock()
        instance.id = 10
        instance.appointment_number = "APT-001"
        instance.status = "NO_SHOW"
        instance.patient_id = 5
        instance.resource_id = 2
        instance.appointment_type = "FOLLOW_UP"
        instance.scheduled_start = None
        instance.facility_id = 1
        instance.organization_id = 2

        publish_appointment_event(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.APPOINTMENT_NO_SHOW

    @pytest.mark.django_db
    def test_appointment_unknown_status_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.APPOINTMENT_CREATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_appointment_event

        instance = MagicMock()
        instance.id = 10
        instance.status = "UNKNOWN_STATUS"
        instance.facility_id = 1
        instance.organization_id = 2

        publish_appointment_event(sender=None, instance=instance, created=False)

        assert len(received) == 0


# ---------------------------------------------------------------------------
# Schedule (Timetable) Signal Events
# ---------------------------------------------------------------------------


class TestScheduleTimetableSignalEvents:
    """Test domain event publishing for schedule/timetable changes."""

    @pytest.mark.django_db
    def test_schedule_created_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.SCHEDULE_CREATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_schedule_event

        resource = MagicMock()
        resource.facility_id = 1

        instance = MagicMock()
        instance.id = 20
        instance.resource_id = 5
        instance.resource = resource
        instance.schedule_type = "RECURRING"
        instance.day_of_week = 0
        instance.is_active = True

        publish_schedule_event(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.SCHEDULE_CREATED
        assert received[0].aggregate_type == "Schedule"
        assert received[0].payload["resource_id"] == 5
        assert received[0].payload["day_of_week"] == 0

    @pytest.mark.django_db
    def test_schedule_updated_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.SCHEDULE_UPDATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_schedule_event

        resource = MagicMock()
        resource.facility_id = 1

        instance = MagicMock()
        instance.id = 20
        instance.resource_id = 5
        instance.resource = resource
        instance.schedule_type = "ONE_TIME"
        instance.day_of_week = None
        instance.is_active = False

        publish_schedule_event(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.SCHEDULE_UPDATED
        assert received[0].payload["is_active"] is False


# ---------------------------------------------------------------------------
# Assignment Engine Signal Events
# ---------------------------------------------------------------------------


class TestAssignmentSignalEvents:
    """Test domain event publishing for assignment engine."""

    @pytest.mark.django_db
    def test_assignment_decision_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.ASSIGNMENT_DECIDED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_assignment_decision_event

        instance = MagicMock()
        instance.id = 30
        instance.assignment_type = "APPOINTMENT"
        instance.target_type = "Appointment"
        instance.target_id = 100
        instance.decision_outcome = "ASSIGNED"
        instance.assigned_resource_id = 5
        instance.rule_applied_id = 2
        instance.evaluation_time_ms = 12

        publish_assignment_decision_event(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.ASSIGNMENT_DECIDED
        assert received[0].aggregate_type == "AssignmentDecision"
        assert received[0].payload["outcome"] == "ASSIGNED"
        assert received[0].payload["target_id"] == 100
        assert received[0].payload["evaluation_time_ms"] == 12

    @pytest.mark.django_db
    def test_assignment_decision_update_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.ASSIGNMENT_DECIDED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_assignment_decision_event

        instance = MagicMock()
        instance.id = 30

        publish_assignment_decision_event(sender=None, instance=instance, created=False)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_override_created_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.OVERRIDE_CREATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_override_event

        instance = MagicMock()
        instance.id = 40
        instance.target_type = "Appointment"
        instance.target_id = 100
        instance.override_reason = "PATIENT_REQUEST"
        instance.approval_status = "PENDING"
        instance.original_resource_id = 3
        instance.new_resource_id = 7

        publish_override_event(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.OVERRIDE_CREATED
        assert received[0].aggregate_type == "AssignmentOverride"
        assert received[0].payload["override_reason"] == "PATIENT_REQUEST"

    @pytest.mark.django_db
    def test_override_approved_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.OVERRIDE_APPROVED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_override_event

        instance = MagicMock()
        instance.id = 40
        instance.target_type = "Appointment"
        instance.target_id = 100
        instance.override_reason = "EMERGENCY"
        instance.approval_status = "APPROVED"
        instance.original_resource_id = 3
        instance.new_resource_id = 7

        publish_override_event(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.OVERRIDE_APPROVED

    @pytest.mark.django_db
    def test_override_rejected_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.OVERRIDE_REJECTED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_override_event

        instance = MagicMock()
        instance.id = 40
        instance.target_type = "Appointment"
        instance.target_id = 100
        instance.override_reason = "OTHER"
        instance.approval_status = "REJECTED"
        instance.original_resource_id = 3
        instance.new_resource_id = 7

        publish_override_event(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.OVERRIDE_REJECTED

    @pytest.mark.django_db
    def test_override_not_required_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.OVERRIDE_CREATED, lambda e: received.append(e))
        bus.subscribe(SchedulingEvents.OVERRIDE_APPROVED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_override_event

        instance = MagicMock()
        instance.id = 40
        instance.approval_status = "NOT_REQUIRED"

        publish_override_event(sender=None, instance=instance, created=False)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_rule_activated_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.RULE_ACTIVATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_rule_toggle_event

        instance = MagicMock()
        instance.id = 50
        instance.rule_code = "assign_doctor_opd"
        instance.applies_to = "APPOINTMENT"
        instance.priority = 100
        instance.is_active = True
        instance.facility_id = 1

        publish_rule_toggle_event(
            sender=None, instance=instance, created=False, update_fields=["is_active", "updated_at"]
        )

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.RULE_ACTIVATED
        assert received[0].payload["rule_code"] == "assign_doctor_opd"

    @pytest.mark.django_db
    def test_rule_deactivated_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.RULE_DEACTIVATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_rule_toggle_event

        instance = MagicMock()
        instance.id = 50
        instance.rule_code = "assign_doctor_opd"
        instance.applies_to = "APPOINTMENT"
        instance.priority = 100
        instance.is_active = False
        instance.facility_id = 1

        publish_rule_toggle_event(
            sender=None, instance=instance, created=False, update_fields=["is_active", "updated_at"]
        )

        assert len(received) == 1
        assert received[0].event_type == SchedulingEvents.RULE_DEACTIVATED

    @pytest.mark.django_db
    def test_rule_created_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.RULE_ACTIVATED, lambda e: received.append(e))
        bus.subscribe(SchedulingEvents.RULE_DEACTIVATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_rule_toggle_event

        instance = MagicMock()
        instance.id = 50

        publish_rule_toggle_event(sender=None, instance=instance, created=True)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_rule_non_active_field_update_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SchedulingEvents.RULE_ACTIVATED, lambda e: received.append(e))
        bus.subscribe(SchedulingEvents.RULE_DEACTIVATED, lambda e: received.append(e))

        from hmis.apps.scheduling.signals import publish_rule_toggle_event

        instance = MagicMock()
        instance.id = 50

        publish_rule_toggle_event(
            sender=None, instance=instance, created=False, update_fields=["priority", "updated_at"]
        )

        assert len(received) == 0


# ---------------------------------------------------------------------------
# Encounter Signal Events (post_save handler)
# ---------------------------------------------------------------------------


class TestEncounterPostSaveSignalEvents:
    """Test domain event publishing from encounters post_save handler."""

    @pytest.mark.django_db
    def test_encounter_created_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(ClinicalEvents.ENCOUNTER_CREATED, lambda e: received.append(e))

        from hmis.apps.encounters.signals import publish_encounter_event

        instance = MagicMock()
        instance.id = 42
        instance.patient_id = 10
        instance.encounter_type = "OPD"
        instance.status = "ACTIVE"
        instance.facility_id = 1
        instance.organization_id = 2

        publish_encounter_event(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == ClinicalEvents.ENCOUNTER_CREATED
        assert received[0].aggregate_type == "Encounter"
        assert received[0].payload["patient_id"] == 10
        assert received[0].payload["encounter_type"] == "OPD"

    @pytest.mark.django_db
    def test_encounter_updated_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(ClinicalEvents.ENCOUNTER_UPDATED, lambda e: received.append(e))

        from hmis.apps.encounters.signals import publish_encounter_event

        instance = MagicMock()
        instance.id = 42
        instance.patient_id = 10
        instance.encounter_type = "EMERGENCY"
        instance.status = "CLOSED"
        instance.facility_id = 1
        instance.organization_id = 2

        publish_encounter_event(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == ClinicalEvents.ENCOUNTER_UPDATED


# ---------------------------------------------------------------------------
# Triage Signal Events
# ---------------------------------------------------------------------------


class TestTriageSignalEvents:
    """Test domain event publishing from triage signal handlers."""

    @pytest.mark.django_db
    def test_triage_assessed_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(ClinicalEvents.TRIAGE_ASSESSED, lambda e: received.append(e))

        from hmis.apps.triage.signals import update_encounter_triage_status

        encounter = MagicMock()
        encounter.id = 100
        encounter.patient_id = 10
        encounter.facility_id = 1
        encounter.triage_status = None
        encounter.triage_requirement = "REQUIRED"
        encounter.spo2 = None
        encounter.pulse = None
        encounter.temperature = None
        encounter.respiratory_rate = None
        encounter.blood_pressure = ""
        encounter.weight = None
        encounter.height = None
        encounter.chief_complaint = ""
        encounter.vitals_source = None
        encounter.vitals_recorded_by_id = None
        encounter.vitals_recorded_at = None

        instance = MagicMock()
        instance.id = 50
        instance.encounter = encounter
        instance.triage_end_time = "2026-04-01T09:00:00"
        instance.triage_category = "URGENT"
        instance.spo2 = 97
        instance.heart_rate = 80
        instance.temperature = 37.0
        instance.respiratory_rate = 18
        instance.systolic_bp = 120
        instance.diastolic_bp = 80
        instance.weight = 70
        instance.height = 170
        instance.chief_complaint = "Persistent cough"
        instance.triaged_by = MagicMock()
        instance.triaged_by_id = 5

        with patch("hmis.apps.triage.signals.AuditLog"):
            update_encounter_triage_status(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == ClinicalEvents.TRIAGE_ASSESSED
        assert received[0].aggregate_type == "TriageAssessment"
        assert received[0].aggregate_id == 50
        assert received[0].payload["triage_category"] == "URGENT"
        assert received[0].payload["triage_status"] == "COMPLETED"


# ---------------------------------------------------------------------------
# Inpatient Signal Events
# ---------------------------------------------------------------------------


class TestInpatientSignalEvents:
    """Test domain event publishing from inpatient signal handlers."""

    @pytest.mark.django_db
    def test_ward_constraints_updated_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(InpatientEvents.WARD_CONSTRAINTS_UPDATED, lambda e: received.append(e))

        from hmis.apps.inpatient.signals import notify_ward_constraints_updated

        instance = MagicMock()
        instance.id = 3
        instance.name = "Medical Ward A"
        instance.gender_restriction = "ANY"
        instance.min_age_years = 0
        instance.max_age_years = None
        instance.isolation_capable = True
        instance.oxygen_equipped = True
        instance.ventilator_capable = False
        instance.facility_id = 1

        with patch("hmis.apps.inpatient.signals.broadcast_ward_event_sync"):
            notify_ward_constraints_updated(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == InpatientEvents.WARD_CONSTRAINTS_UPDATED
        assert received[0].aggregate_type == "Ward"
        assert received[0].payload["ward_name"] == "Medical Ward A"

    @pytest.mark.django_db
    def test_ward_created_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(InpatientEvents.WARD_CONSTRAINTS_UPDATED, lambda e: received.append(e))

        from hmis.apps.inpatient.signals import notify_ward_constraints_updated

        instance = MagicMock()
        instance.id = 3

        notify_ward_constraints_updated(sender=None, instance=instance, created=True)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_admission_with_violations_publishes_both_events(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(InpatientEvents.ADMISSION_CREATED, lambda e: received.append(e))
        bus.subscribe(InpatientEvents.COMPATIBILITY_VIOLATION, lambda e: received.append(e))

        from hmis.apps.inpatient.signals import notify_compatibility_violation

        patient = MagicMock()
        patient.first_name = "John"
        patient.last_name = "Doe"
        patient.mrn = "MRN-001"

        ward = MagicMock()
        ward.id = 3
        ward.name = "Pediatric Ward"

        bed = MagicMock()
        bed.bed_number = "B-001"

        officer = MagicMock()
        officer.get_full_name.return_value = "Dr. Smith"

        instance = MagicMock()
        instance.id = 20
        instance.admission_number = "ADM-001"
        instance.patient = patient
        instance.patient_id = 5
        instance.ward = ward
        instance.ward_id = 3
        instance.bed = bed
        instance.admitting_officer = officer
        instance.constraint_violations = [
            {"severity": "CRITICAL", "rule": "age_out_of_range"},
            {"severity": "WARNING", "rule": "gender_mismatch"},
        ]
        instance.constraint_override_reason = "Emergency override"
        instance.facility_id = 1

        with patch("hmis.apps.inpatient.signals.broadcast_ward_event_sync"), \
             patch("hmis.apps.inpatient.signals.broadcast_supervisor_alert_sync"), \
             patch("hmis.apps.inpatient.signals.notify_supervisors_critical_violation"):
            notify_compatibility_violation(sender=None, instance=instance, created=True)

        assert len(received) == 2
        types = {e.event_type for e in received}
        assert InpatientEvents.ADMISSION_CREATED in types
        assert InpatientEvents.COMPATIBILITY_VIOLATION in types

    @pytest.mark.django_db
    def test_admission_without_violations_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(InpatientEvents.ADMISSION_CREATED, lambda e: received.append(e))

        from hmis.apps.inpatient.signals import notify_compatibility_violation

        instance = MagicMock()
        instance.id = 20
        instance.constraint_violations = []

        notify_compatibility_violation(sender=None, instance=instance, created=True)

        assert len(received) == 0


# ---------------------------------------------------------------------------
# MCH Signal Events
# ---------------------------------------------------------------------------


class TestMCHSignalEvents:
    """Test domain event publishing from MCH signal handlers."""

    @pytest.mark.django_db
    def test_mch_registration_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(MCHEvents.REGISTRATION_CREATED, lambda e: received.append(e))

        from hmis.apps.mch.signals import auto_create_anc_enrollment

        instance = MagicMock()
        instance.id = 15
        instance.mch_number = "MCH-001"
        instance.mother_id = 10
        instance.mother = MagicMock()
        instance.mother.id = 10
        instance.anc_enrollment = None
        instance.is_high_risk = True
        instance.risk_factors = "Previous preeclampsia"
        instance.registration_date = "2026-04-01"
        instance.registered_by = MagicMock()
        instance.facility_id = 1
        instance.organization_id = 2

        with patch("hmis.apps.mch.signals.Clinic", create=True) as mock_clinic_cls:
            mock_clinic = MagicMock()
            mock_clinic.id = 1

            with patch("hmis.apps.clinics.models.Clinic") as MockClinic, \
                 patch("hmis.apps.clinics.models.ClinicEnrollment") as MockEnrollment:
                MockClinic.objects.filter.return_value.first.return_value = mock_clinic
                enrollment = MagicMock()
                enrollment.id = 100
                MockEnrollment.objects.create.return_value = enrollment

                auto_create_anc_enrollment(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == MCHEvents.REGISTRATION_CREATED
        assert received[0].aggregate_type == "MCHRegistration"
        assert received[0].payload["mch_number"] == "MCH-001"
        assert received[0].payload["is_high_risk"] is True

    @pytest.mark.django_db
    def test_mch_registration_not_created_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(MCHEvents.REGISTRATION_CREATED, lambda e: received.append(e))

        from hmis.apps.mch.signals import auto_create_anc_enrollment

        instance = MagicMock()
        instance.anc_enrollment = None

        auto_create_anc_enrollment(sender=None, instance=instance, created=False)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_delivery_completed_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(MCHEvents.DELIVERY_COMPLETED, lambda e: received.append(e))

        from hmis.apps.mch.signals import auto_transition_mch_to_delivered

        registration = MagicMock()
        registration.status = "ACTIVE"
        registration.mch_number = "MCH-001"

        instance = MagicMock()
        instance.id = 30
        instance.status = "COMPLETED"
        instance.registration = registration
        instance.registration_id = 15
        instance.delivery_date = "2026-04-01"
        instance.facility_id = 1
        instance.organization_id = 2

        auto_transition_mch_to_delivered(sender=None, instance=instance, created=False)

        assert len(received) == 1
        assert received[0].event_type == MCHEvents.DELIVERY_COMPLETED
        assert received[0].aggregate_type == "Delivery"
        assert received[0].payload["mch_number"] == "MCH-001"

    @pytest.mark.django_db
    def test_delivery_not_completed_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(MCHEvents.DELIVERY_COMPLETED, lambda e: received.append(e))

        from hmis.apps.mch.signals import auto_transition_mch_to_delivered

        instance = MagicMock()
        instance.status = "IN_LABOUR"

        auto_transition_mch_to_delivered(sender=None, instance=instance, created=False)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_baby_patient_created_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(MCHEvents.BABY_PATIENT_CREATED, lambda e: received.append(e))

        from hmis.apps.mch.signals import create_baby_patient_on_delivery

        mother = MagicMock()
        mother.id = 10
        mother.first_name = "Jane"
        mother.last_name = "Doe"
        mother.county = MagicMock()
        mother.sub_county = MagicMock()
        mother.ward = MagicMock()

        registration = MagicMock()
        registration.mother = mother
        registration.registered_by = MagicMock()
        registration.baby = None

        instance = MagicMock()
        instance.id = 30
        instance.status = "COMPLETED"
        instance.baby_patient = None
        instance.registration = registration
        instance.delivery_date = "2026-04-01"
        instance.baby_gender = "F"
        instance.delivered_by = MagicMock()
        instance.facility_id = 1
        instance.organization_id = 2

        with patch("hmis.apps.patients.models.Patient") as MockPatient:
            baby = MagicMock()
            baby.id = 99
            MockPatient.objects.create.return_value = baby

            create_baby_patient_on_delivery(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == MCHEvents.BABY_PATIENT_CREATED
        assert received[0].aggregate_type == "Delivery"
        assert received[0].payload["baby_patient_id"] == 99
        assert received[0].payload["mother_id"] == 10

    @pytest.mark.django_db
    def test_anc_visit_created_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(MCHEvents.ANC_VISIT_CREATED, lambda e: received.append(e))

        from hmis.apps.mch.signals import auto_create_anc_appointment

        from datetime import date, timedelta

        registration = MagicMock()
        registration.mch_number = "MCH-001"

        instance = MagicMock()
        instance.id = 40
        instance.registration = registration
        instance.registration_id = 15
        instance.visit_number = 3
        instance.next_visit_date = date.today() + timedelta(days=14)
        instance.conducted_by = MagicMock()
        instance.facility_id = 1
        instance.organization_id = 2

        with patch("hmis.apps.scheduling.models.Appointment") as MockAppointment, \
             patch("hmis.apps.scheduling.models.Resource") as MockResource:
            MockAppointment.objects.filter.return_value.exists.return_value = False
            resource = MagicMock()
            resource.id = 1
            MockResource.objects.filter.return_value.first.return_value = resource

            appointment = MagicMock()
            appointment.appointment_number = "APT-100"
            MockAppointment.return_value = appointment

            auto_create_anc_appointment(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == MCHEvents.ANC_VISIT_CREATED
        assert received[0].aggregate_type == "ANCVisit"
        assert received[0].payload["visit_number"] == 3

    @pytest.mark.django_db
    def test_immunization_schedule_generated_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(ImmunizationEvents.SCHEDULE_GENERATED, lambda e: received.append(e))

        from hmis.apps.mch.signals import auto_generate_immunization_schedule

        from datetime import date, timedelta

        instance = MagicMock()
        instance.id = 55
        instance.date_of_birth = date.today() - timedelta(days=5)
        instance.facility_id = 1
        instance.organization_id = 2

        with patch("hmis.apps.mch.services.immunization.generate_immunization_schedule") as mock_gen:
            mock_gen.return_value = [MagicMock(), MagicMock(), MagicMock()]
            auto_generate_immunization_schedule(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == ImmunizationEvents.SCHEDULE_GENERATED
        assert received[0].aggregate_type == "Patient"
        assert received[0].payload["records_count"] == 3


# ---------------------------------------------------------------------------
# Surveillance Signal Events
# ---------------------------------------------------------------------------


class TestSurveillanceSignalEvents:
    """Test domain event publishing from surveillance signal handlers."""

    @pytest.mark.django_db
    def test_notifiable_disease_detected_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SurveillanceEvents.NOTIFIABLE_DISEASE_DETECTED, lambda e: received.append(e))

        from hmis.apps.surveillance.signals import check_diagnosis_for_surveillance

        icd10_code = MagicMock()
        icd10_code.code = "A01.0"

        encounter = MagicMock()
        encounter.patient_id = 10
        encounter.facility_id = 1

        instance = MagicMock()
        instance.id = 60
        instance.icd10_code = icd10_code
        instance.certainty = "confirmed"
        instance.encounter = encounter
        instance.diagnosed_by = MagicMock()

        disease = MagicMock()
        disease.name = "Typhoid"

        case = MagicMock()
        case.id = 70

        with patch("hmis.apps.surveillance.services.SurveillanceService") as MockService:
            MockService.check_diagnosis_for_notifiable_disease.return_value = disease
            MockService.create_case_from_diagnosis.return_value = case

            check_diagnosis_for_surveillance(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == SurveillanceEvents.NOTIFIABLE_DISEASE_DETECTED
        assert received[0].aggregate_type == "NotifiableCase"
        assert received[0].aggregate_id == 70
        assert received[0].payload["disease_name"] == "Typhoid"
        assert received[0].payload["icd10_code"] == "A01.0"

    @pytest.mark.django_db
    def test_non_notifiable_diagnosis_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SurveillanceEvents.NOTIFIABLE_DISEASE_DETECTED, lambda e: received.append(e))

        from hmis.apps.surveillance.signals import check_diagnosis_for_surveillance

        instance = MagicMock()
        instance.id = 60
        instance.icd10_code = MagicMock()
        instance.certainty = "confirmed"
        instance.encounter = MagicMock()

        with patch("hmis.apps.surveillance.services.SurveillanceService") as MockService:
            MockService.check_diagnosis_for_notifiable_disease.return_value = None
            check_diagnosis_for_surveillance(sender=None, instance=instance, created=True)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_ruled_out_diagnosis_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(SurveillanceEvents.NOTIFIABLE_DISEASE_DETECTED, lambda e: received.append(e))

        from hmis.apps.surveillance.signals import check_diagnosis_for_surveillance

        instance = MagicMock()
        instance.id = 60
        instance.icd10_code = MagicMock()
        instance.certainty = "ruled_out"

        check_diagnosis_for_surveillance(sender=None, instance=instance, created=True)

        assert len(received) == 0


# ---------------------------------------------------------------------------
# Imaging Signal Events
# ---------------------------------------------------------------------------


class TestImagingSignalEvents:
    """Test domain event publishing from imaging signal handlers."""

    @pytest.mark.django_db
    def test_imaging_order_item_created_publishes_event(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(ImagingEvents.ORDER_ITEM_CREATED, lambda e: received.append(e))

        from hmis.apps.imaging.signals import create_invoice_item_for_imaging

        procedure = MagicMock()
        procedure.name = "Chest X-Ray"
        procedure.cost = 2500
        procedure.sha_intervention_code = "IMG001"

        order = MagicMock()
        order.order_number = "IMG-ORD-001"
        order.encounter = MagicMock()
        order.facility_id = 1

        instance = MagicMock()
        instance.id = 80
        instance.order = order
        instance.procedure = procedure
        instance.unit_cost = 2500
        instance.laterality = "NA"
        instance.get_laterality_display.return_value = "N/A"

        with patch("hmis.apps.imaging.signals.Invoice") as MockInvoice, \
             patch("hmis.apps.imaging.signals.InvoiceItem") as MockInvoiceItem:
            invoice = MagicMock()
            invoice.id = 90
            MockInvoice.objects.filter.return_value.first.return_value = invoice
            MockInvoiceItem.ItemType.IMAGING = "IMAGING"

            create_invoice_item_for_imaging(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].event_type == ImagingEvents.ORDER_ITEM_CREATED
        assert received[0].aggregate_type == "ImagingOrderItem"
        assert received[0].payload["order_number"] == "IMG-ORD-001"
        assert received[0].payload["procedure_name"] == "Chest X-Ray"

    @pytest.mark.django_db
    def test_imaging_order_item_update_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(ImagingEvents.ORDER_ITEM_CREATED, lambda e: received.append(e))

        from hmis.apps.imaging.signals import create_invoice_item_for_imaging

        instance = MagicMock()
        instance.id = 80

        create_invoice_item_for_imaging(sender=None, instance=instance, created=False)

        assert len(received) == 0

    @pytest.mark.django_db
    def test_imaging_no_draft_invoice_does_not_publish(self):
        received = []
        bus = get_event_bus()
        bus.subscribe(ImagingEvents.ORDER_ITEM_CREATED, lambda e: received.append(e))

        from hmis.apps.imaging.signals import create_invoice_item_for_imaging

        procedure = MagicMock()
        procedure.name = "CT Scan"

        order = MagicMock()
        order.order_number = "IMG-ORD-002"
        order.encounter = MagicMock()

        instance = MagicMock()
        instance.id = 81
        instance.order = order
        instance.procedure = procedure

        with patch("hmis.apps.imaging.signals.Invoice") as MockInvoice:
            MockInvoice.objects.filter.return_value.first.return_value = None
            MockInvoice.Status.DRAFT = "DRAFT"

            create_invoice_item_for_imaging(sender=None, instance=instance, created=True)

        assert len(received) == 0
