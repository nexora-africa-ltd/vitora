"""
Signals for Triage app.

This module contains Django signals for automatic updates related to triage assessments.
"""

from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from hmis.apps.core.events import ClinicalEvents, publish_event
from hmis.apps.core.models import AuditLog


@receiver(post_save, sender="triage.TriageAssessment")
def update_encounter_triage_status(sender, instance, created, **kwargs):
    """
    Update encounter triage_status when a TriageAssessment is created or updated.

    - For NOT_REQUIRED encounters: any triage assessment → COMPLETED (consistency)
    - When assessment is created with triage_end_time=null → IN_PROGRESS
    - When assessment has triage_end_time set → COMPLETED

    This signal ensures that when a triage nurse starts/completes an assessment,
    the associated encounter automatically reflects the correct triage status.

    Args:
        sender: The TriageAssessment model class
        instance: The TriageAssessment instance being saved
        created: Boolean indicating if this is a new record
        **kwargs: Additional keyword arguments
    """
    if not instance.encounter:
        return

    encounter = instance.encounter

    # Determine the correct triage status.
    # NOTE: For NOT_REQUIRED encounters, a triage assessment is an edge case but
    # we still mark triage as COMPLETED for downstream workflow consistency.
    if getattr(encounter, "triage_requirement", None) == "NOT_REQUIRED" or instance.triage_end_time:
        new_status = "COMPLETED"
    else:
        new_status = "IN_PROGRESS"

    # Only update if status has changed
    if encounter.triage_status == new_status:
        # Still need to process vitals copying for newly created assessments
        if not created:
            return

    encounter.triage_status = new_status

    updated_fields = {"triage_status"}
    vitals_copied = False

    # Only copy vitals on initial assessment creation, not on updates
    if created:
        # Copy vitals from triage assessment to encounter ONLY if encounter vitals are empty
        if getattr(encounter, "spo2", None) is None and instance.spo2 is not None:
            encounter.spo2 = instance.spo2
            updated_fields.add("spo2")
            vitals_copied = True

        if getattr(encounter, "pulse", None) is None and instance.heart_rate is not None:
            encounter.pulse = instance.heart_rate
            updated_fields.add("pulse")
            vitals_copied = True

        if getattr(encounter, "temperature", None) is None and instance.temperature is not None:
            encounter.temperature = instance.temperature
            updated_fields.add("temperature")
            vitals_copied = True

        if (
            getattr(encounter, "respiratory_rate", None) is None
            and instance.respiratory_rate is not None
        ):
            encounter.respiratory_rate = instance.respiratory_rate
            updated_fields.add("respiratory_rate")
            vitals_copied = True

        if (
            (not getattr(encounter, "blood_pressure", ""))
            and instance.systolic_bp is not None
            and instance.diastolic_bp is not None
        ):
            encounter.blood_pressure = f"{instance.systolic_bp}/{instance.diastolic_bp}"
            updated_fields.add("blood_pressure")
            vitals_copied = True

        # Copy weight if captured at triage
        if getattr(encounter, "weight", None) is None and instance.weight is not None:
            encounter.weight = instance.weight
            updated_fields.add("weight")
            vitals_copied = True

        # Copy height if captured at triage
        if getattr(encounter, "height", None) is None and instance.height is not None:
            encounter.height = instance.height
            updated_fields.add("height")
            vitals_copied = True

        # Copy chief complaint from triage to encounter if encounter's is empty/generic
        encounter_chief = getattr(encounter, "chief_complaint", "") or ""
        triage_chief = getattr(instance, "chief_complaint", "") or ""
        if triage_chief and (
            not encounter_chief.strip()
            or encounter_chief.strip().lower()
            in ("check-in", "triage", "pending", "triage assessment", "pending triage")
        ):
            encounter.chief_complaint = triage_chief
            updated_fields.add("chief_complaint")

        # Set vitals source metadata if we copied any vitals
        if vitals_copied:
            if getattr(encounter, "vitals_source", None) in (None, ""):
                encounter.vitals_source = "TRIAGE"
                updated_fields.add("vitals_source")

            if (
                getattr(encounter, "vitals_recorded_by_id", None) is None
                and getattr(instance, "triaged_by_id", None) is not None
            ):
                encounter.vitals_recorded_by = instance.triaged_by
                updated_fields.add("vitals_recorded_by")

            if getattr(encounter, "vitals_recorded_at", None) is None:
                encounter.vitals_recorded_at = timezone.now()
                updated_fields.add("vitals_recorded_at")

            AuditLog.log(
                action="encounter_vitals_copied_from_triage",
                user=getattr(instance, "triaged_by", None),
                resource_type="Encounter",
                resource_id=encounter.id,
                details={
                    "source": "TRIAGE",
                    "triage_assessment_id": instance.id,
                    "copied_fields": sorted(updated_fields - {"triage_status"}),
                },
                patient_id=getattr(encounter, "patient_id", None),
            )

    updated_fields.add("updated_at")
    encounter.save(update_fields=sorted(updated_fields))

    # Publish domain event for triage assessment
    publish_event(
        event_type=ClinicalEvents.TRIAGE_ASSESSED,
        aggregate_type="TriageAssessment",
        aggregate_id=instance.id,
        payload={
            "encounter_id": encounter.id,
            "patient_id": getattr(encounter, "patient_id", None),
            "triage_category": getattr(instance, "triage_category", None),
            "triage_status": new_status,
            "created": created,
        },
        facility_id=getattr(encounter, "facility_id", None),
    )

    # Notify clinicians about urgent triage assessments
    if created:
        _notify_urgent_triage(instance, encounter)


def _notify_urgent_triage(instance, encounter):
    """Send notification for RED/ORANGE triage category patients."""
    try:
        category = getattr(instance, "triage_category", None)
        if not category or category not in ("RED", "ORANGE"):
            return

        from django.contrib.auth import get_user_model

        from hmis.apps.core.services.notification_service import notify_users

        User = get_user_model()

        facility_id = getattr(encounter, "facility_id", None)
        if not facility_id:
            return

        # Notify doctors and clinical officers in the same facility
        clinicians = User.objects.filter(
            Q(staff_profile__primary_facility_id=facility_id)
            | Q(staff_profile__secondary_facilities__id=facility_id),
            staff_profile__primary_role__code__in=[
                "DOCTOR",
                "CLINICAL_OFFICER",
                "CLINICAL_SENIOR",
            ],
            is_active=True,
        ).distinct()

        if not clinicians.exists():
            return

        patient_name = ""
        if encounter.patient:
            patient_name = f"{encounter.patient.first_name} {encounter.patient.last_name}"

        priority = "critical" if category == "RED" else "high"
        title = f"{'EMERGENCY' if category == 'RED' else 'Urgent'}: Triage {category}"
        message = f"Patient {patient_name} triaged as {category} — requires immediate attention."

        notify_users(
            users=clinicians,
            notification_type="triage_urgent",
            priority=priority,
            title=title,
            message=message,
            related_model="Encounter",
            related_id=encounter.id,
            action_url=f"/encounters/{encounter.id}",
        )
    except Exception:
        import logging

        logging.getLogger(__name__).exception(
            "Failed to notify urgent triage for assessment %s", instance.id
        )
