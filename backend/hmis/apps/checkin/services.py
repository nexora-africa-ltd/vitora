"""
Services for the check-in app.

Contains business logic for:
- Clinical snapshot generation
- Visit context determination
- Check-in processing

Sprint: Returning Patient Workflow - Sprint 1
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from django.db import IntegrityError
from django.db.models import Max
from django.utils import timezone


@dataclass
class ClinicalSnapshot:
    """Clinical summary for a patient."""

    allergies: list[str]
    active_conditions: list[str]
    current_medications: list[str]
    last_visit_date: Optional[date]
    last_visit_clinic: Optional[str]
    pending_results: list[dict]
    alerts: list[str]


@dataclass
class VisitContext:
    """Suggested visit classification."""

    visit_type: str
    visit_reason: str
    skip_triage: bool


def get_clinical_snapshot(patient) -> ClinicalSnapshot:
    """
    Generate a clinical snapshot for a patient.

    Aggregates data from:
    - Most recent encounter (allergies, conditions, medications)
    - Pending lab results
    - Critical alerts

    Args:
        patient: Patient model instance

    Returns:
        ClinicalSnapshot with aggregated clinical data
    """
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.laboratory.models import LabOrder

    # Get most recent encounter with medical history
    last_encounter = (
        Encounter.objects.filter(patient=patient).order_by("-encounter_date", "-created_at").first()
    )

    # Parse allergies
    allergies = []
    if last_encounter and last_encounter.allergies:
        # Split by comma or newline
        raw_allergies = last_encounter.allergies.replace("\n", ",")
        allergies = [a.strip() for a in raw_allergies.split(",") if a.strip()]

    # Parse chronic conditions
    active_conditions = []
    if last_encounter and last_encounter.chronic_conditions:
        raw_conditions = last_encounter.chronic_conditions.replace("\n", ",")
        active_conditions = [c.strip() for c in raw_conditions.split(",") if c.strip()]

    # Parse current medications
    current_medications = []
    if last_encounter and last_encounter.current_medications:
        raw_meds = last_encounter.current_medications.replace("\n", ",")
        current_medications = [m.strip() for m in raw_meds.split(",") if m.strip()]

    # Get last visit info
    last_visit_date = None
    last_visit_clinic = None
    if last_encounter:
        last_visit_date = last_encounter.encounter_date
        # Get clinic name if linked
        if hasattr(last_encounter, "clinic_visit_o2o") and last_encounter.clinic_visit_o2o:
            last_visit_clinic = last_encounter.clinic_visit_o2o.session.clinic.name

    # Get pending lab results
    pending_results = []
    pending_orders = LabOrder.objects.filter(
        patient=patient,
        status__in=["ORDERED", "COLLECTED", "PROCESSING"],
    ).select_related("encounter")

    for order in pending_orders[:5]:  # Limit to 5 most recent
        for item in order.items.all():
            pending_results.append(
                {
                    "test_name": item.test.name if item.test else "Unknown Test",
                    "ordered_date": order.ordered_at.date() if order.ordered_at else None,
                    "status": order.status,
                }
            )

    # Generate alerts
    alerts = []
    if allergies:
        severity_keywords = ["severe", "anaphylaxis", "critical"]
        has_severe = any(any(kw in a.lower() for kw in severity_keywords) for a in allergies)
        if has_severe:
            alerts.append("⚠️ SEVERE ALLERGY: Check allergy list before prescribing")
        else:
            alerts.append("Allergy alert: Patient has documented allergies")

    if pending_results:
        alerts.append(f"Pending lab results: {len(pending_results)} test(s) awaiting")

    # Check for overdue follow-up
    if last_visit_date and active_conditions:
        days_since = (date.today() - last_visit_date).days
        if days_since > 90:
            alerts.append(f"Overdue for chronic care review ({days_since} days since last visit)")

    return ClinicalSnapshot(
        allergies=allergies,
        active_conditions=active_conditions,
        current_medications=current_medications,
        last_visit_date=last_visit_date,
        last_visit_clinic=last_visit_clinic,
        pending_results=pending_results,
        alerts=alerts,
    )


def determine_visit_context(patient) -> VisitContext:
    """
    Determine suggested visit type and reason based on patient history.

    Logic:
    1. No previous visits -> NEW patient
    2. Has pending results -> LAB_REVIEW (skip triage)
    3. Visit within 30 days -> FOLLOW_UP
    4. Has chronic conditions -> CHRONIC_CARE
    5. Otherwise -> RETURN visit

    Args:
        patient: Patient model instance

    Returns:
        VisitContext with suggested classification
    """
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.laboratory.models import LabOrder

    # Check for any previous visits
    last_encounter = Encounter.objects.filter(patient=patient).aggregate(
        last_date=Max("encounter_date")
    )
    last_encounter_date = last_encounter.get("last_date")

    if not last_encounter_date:
        # New patient
        return VisitContext(
            visit_type="NEW",
            visit_reason="NEW_COMPLAINT",
            skip_triage=False,
        )

    # Check for pending lab results
    has_pending_results = LabOrder.objects.filter(
        patient=patient,
        status__in=["COLLECTED", "PROCESSING", "RESULTED"],
    ).exists()

    if has_pending_results:
        return VisitContext(
            visit_type="RETURN",
            visit_reason="LAB_REVIEW",
            skip_triage=True,
        )

    # Calculate days since last visit
    days_since_last = (date.today() - last_encounter_date).days

    # Check for chronic conditions
    has_chronic_conditions = (
        Encounter.objects.filter(patient=patient).exclude(chronic_conditions="").exists()
    )

    if days_since_last <= 30:
        # Recent visit - likely follow-up
        return VisitContext(
            visit_type="FOLLOW_UP",
            visit_reason="FOLLOW_UP",
            skip_triage=False,
        )

    if has_chronic_conditions:
        return VisitContext(
            visit_type="RETURN",
            visit_reason="CHRONIC_CARE",
            skip_triage=False,
        )

    # Default - returning patient
    return VisitContext(
        visit_type="RETURN",
        visit_reason="NEW_COMPLAINT",
        skip_triage=False,
    )


def should_skip_triage(visit_reason: str, clinic=None) -> bool:
    """
    Determine if triage should be skipped based on visit reason and clinic.

    Args:
        visit_reason: The visit reason code
        clinic: Optional clinic being visited

    Returns:
        bool: Whether to skip triage
    """
    # Visit reasons that skip triage
    skip_triage_reasons = ["REFILL_ONLY", "LAB_REVIEW"]

    if visit_reason in skip_triage_reasons:
        return True

    # Check clinic configuration
    if clinic and hasattr(clinic, "triage_required"):
        return not clinic.triage_required

    return False


def process_checkin(
    patient,
    destination,
    user,
    visit_type: Optional[str] = None,
    visit_reason: str = "NEW_COMPLAINT",
    skip_triage: bool = False,
    chief_complaint: str = "",
    notes: str = "",
    linked_encounter_id: Optional[int] = None,
    identity_method: str = "MRN",
):
    """
    Process a patient check-in.

    Creates:
    1. CheckIn record
    2. Encounter (if not exists)
    3. WaitingQueue entry (if going to triage)
    4. ClinicVisit entry (if direct to clinic)

    Args:
        patient: Patient model instance
        destination: "TRIAGE" or Clinic instance
        user: User performing check-in
        visit_type: Optional override for visit type
        visit_reason: Reason for visit
        skip_triage: Whether to skip triage
        chief_complaint: Initial complaint
        notes: Additional notes
        linked_encounter_id: ID of previous encounter for follow-up
        identity_method: How identity was verified

    Returns:
        tuple: (CheckIn, warning_message or None)
    """
    from hmis.apps.checkin.models import CheckIn
    from hmis.apps.clinics.models import Clinic, ClinicVisit
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.triage.models import WaitingQueue

    warning = None

    # Check if already checked in today
    if CheckIn.patient_checked_in_today(patient.id):
        warning = "Patient has already checked in today. Creating additional check-in."

    # Determine visit type if not provided
    if visit_type is None:
        context = determine_visit_context(patient)
        visit_type = context.visit_type

    # Determine skip triage if not explicitly set
    destination_clinic = None
    destination_type = "TRIAGE"

    if isinstance(destination, int):
        destination_clinic = Clinic.objects.get(id=destination)
        destination_type = "CLINIC"
        skip_triage = should_skip_triage(visit_reason, destination_clinic) or skip_triage
    elif isinstance(destination, Clinic):
        destination_clinic = destination
        destination_type = "CLINIC"
        skip_triage = should_skip_triage(visit_reason, destination_clinic) or skip_triage
    elif destination == "EMERGENCY":
        destination_type = "EMERGENCY"
        visit_type = "EMERGENCY"
        skip_triage = False  # ER patients must be triaged (KETA protocol)
    elif destination == "TRIAGE":
        destination_type = "TRIAGE"
        # Auto-detect skip triage based on visit reason even for TRIAGE destination
        skip_triage = should_skip_triage(visit_reason) or skip_triage

    # =========================================================================
    # Duplicate check — BEFORE creating encounter/checkin to avoid orphaned records
    # =========================================================================
    if destination_type in ("TRIAGE", "EMERGENCY"):
        existing_entry = WaitingQueue.objects.filter(
            patient=patient,
            status__in=["WAITING_TRIAGE", "IN_TRIAGE"],
        ).first()
        if existing_entry:
            dest_label = "Emergency triage" if destination_type == "EMERGENCY" else "Triage"
            raise ValueError(
                f"Patient is already in the {dest_label} waiting queue "
                f"(status: {existing_entry.get_status_display()}). "
                f"Please wait for the current triage to complete before checking in again."
            )
    elif destination_type == "CLINIC" and destination_clinic:
        session = destination_clinic.get_current_session()
        existing_visit = ClinicVisit.objects.filter(
            session=session,
            patient=patient,
            status__in=["REGISTERED", "WAITING", "CALLED", "IN_CONSULTATION"],
        ).first()
        if existing_visit:
            raise ValueError(
                f"Patient is already in the {destination_clinic.name} queue "
                f"(position #{existing_visit.queue_number}, "
                f"status: {existing_visit.get_status_display()}). "
                f"Please wait for the current visit to complete before checking in again."
            )

    # Get linked encounter
    linked_encounter = None
    if linked_encounter_id:
        linked_encounter = Encounter.objects.filter(id=linked_encounter_id).first()

    # Create encounter
    encounter_type = "OPD"
    if destination_type == "EMERGENCY":
        encounter_type = "EMERGENCY"
    elif visit_reason == "FOLLOW_UP" or visit_type == "FOLLOW_UP":
        encounter_type = "FOLLOW_UP"

    encounter = Encounter.objects.create(
        patient=patient,
        encounter_type=encounter_type,
        chief_complaint=chief_complaint or "Check-in",
        status="CREATED",
        visit_reason=visit_reason,
        linked_encounter=linked_encounter,
    )

    # Create check-in record
    checkin = CheckIn.objects.create(
        patient=patient,
        encounter=encounter,
        linked_encounter=linked_encounter,
        destination_type=destination_type,
        destination_clinic=destination_clinic,
        skip_triage=skip_triage,
        visit_type=visit_type,
        visit_reason=visit_reason,
        checked_in_by=user,
        identity_method=identity_method,
        notes=notes,
        chief_complaint=chief_complaint,
        status="WAITING",
    )

    # Create queue entries based on destination
    if destination_type in ("TRIAGE", "EMERGENCY"):
        # Add to triage waiting queue (ER patients also go through triage per KETA)
        waiting_queue = WaitingQueue.objects.create(
            patient=patient,
            encounter=encounter,
            reason_for_visit=chief_complaint,
            status="WAITING_TRIAGE",
            priority_hint="EMERGENCY" if destination_type == "EMERGENCY" else "",
            checked_in_by=user,
        )
        checkin.waiting_queue_entry = waiting_queue
        checkin.save(update_fields=["waiting_queue_entry"])
    else:
        # Add directly to clinic queue
        session = destination_clinic.get_current_session()

        # Get next queue number
        last_visit = ClinicVisit.objects.filter(session=session).order_by("-queue_number").first()
        next_queue_number = (last_visit.queue_number + 1) if last_visit else 1

        try:
            clinic_visit = ClinicVisit.objects.create(
                session=session,
                patient=patient,
                queue_number=next_queue_number,
                status="REGISTERED",
                priority="STANDARD",
                visit_type=visit_type,
                source="DIRECT",
                encounter=encounter,
                registered_by=user,
            )
        except IntegrityError:
            # Race condition: another request slipped in between our pre-check and create.
            # Don't attempt to delete encounter (may have protected FKs from signals).
            # Mark checkin as failed instead.
            checkin.status = "CANCELLED"
            checkin.notes = (checkin.notes or "") + "\n[System] Duplicate queue entry detected."
            checkin.save(update_fields=["status", "notes"])
            raise ValueError(
                f"Patient is already in the {destination_clinic.name} queue. "
                f"Please wait for the current visit to complete before checking in again."
            )
        checkin.clinic_visit = clinic_visit
        checkin.save(update_fields=["clinic_visit"])

        # Update encounter with clinic visit link and mark triage as bypassed
        # so the encounter appears in the consultation queue.
        # Use queryset.update() to bypass save() auto-override of triage_requirement,
        # which would force MANDATORY for OPD and reject the bypass.
        update_kwargs: dict = {"clinic_visit": clinic_visit}

        if skip_triage:
            update_kwargs.update(
                {
                    "triage_requirement": "OPTIONAL",
                    "triage_status": "BYPASSED",
                    "triage_bypass_reason": "CONSULTANT_DECISION",
                    "triage_bypassed_by": user,
                    "triage_bypassed_at": timezone.now(),
                }
            )

        Encounter.objects.filter(pk=encounter.pk).update(**update_kwargs)
        encounter.refresh_from_db()

    return checkin, warning
