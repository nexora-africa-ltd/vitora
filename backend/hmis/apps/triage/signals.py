"""
Signals for Triage app.

This module contains Django signals for automatic updates related to triage assessments.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver


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
    if created and instance.encounter:
        # Update the encounter's triage status to COMPLETED
        encounter = instance.encounter
        encounter.triage_status = "COMPLETED"
        encounter.save(update_fields=["triage_status", "updated_at"])
