"""
Signals for Triage app.

This module contains Django signals for automatic updates related to triage assessments.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from hmis.apps.core.models import AuditLog


@receiver(post_save, sender="triage.TriageAssessment")
def update_encounter_triage_status(sender, instance, created, **kwargs):
    """
    Update encounter triage_status to COMPLETED when a TriageAssessment is created.

    This signal ensures that when a triage nurse completes an assessment,
    the associated encounter automatically reflects the completed triage status.

    Args:
        sender: The TriageAssessment model class
        instance: The TriageAssessment instance being saved
        created: Boolean indicating if this is a new record
        **kwargs: Additional keyword arguments
    """
    if not (created and instance.encounter):
        return

    encounter = instance.encounter

    # Update the encounter's triage status to COMPLETED
    encounter.triage_status = "COMPLETED"

    updated_fields = {"triage_status"}
    vitals_copied = False

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

    if getattr(encounter, "respiratory_rate", None) is None and instance.respiratory_rate is not None:
        encounter.respiratory_rate = instance.respiratory_rate
        updated_fields.add("respiratory_rate")
        vitals_copied = True

    if (not getattr(encounter, "blood_pressure", "")) and instance.systolic_bp is not None and instance.diastolic_bp is not None:
        encounter.blood_pressure = f"{instance.systolic_bp}/{instance.diastolic_bp}"
        updated_fields.add("blood_pressure")
        vitals_copied = True

    # Set vitals source metadata if we copied any vitals
    if vitals_copied:
        if getattr(encounter, "vitals_source", None) in (None, ""):
            encounter.vitals_source = "TRIAGE"
            updated_fields.add("vitals_source")

        if getattr(encounter, "vitals_recorded_by_id", None) is None and getattr(instance, "triaged_by_id", None) is not None:
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
