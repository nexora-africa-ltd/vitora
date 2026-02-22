"""
Django signals for Disease Surveillance.

Auto-flags encounters when a diagnosis matches a notifiable disease.
Creates NotifiableCase records and triggers alerts for immediate diseases.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender="encounters.Diagnosis")
def check_diagnosis_for_surveillance(sender, instance, created, **kwargs):
    """
    Check if a new or updated diagnosis matches a notifiable disease.

    When a diagnosis is created or updated with an ICD-10 code that
    matches a notifiable disease, automatically create a NotifiableCase.
    """
    from .services import SurveillanceService

    # Only check confirmed diagnoses with ICD-10 codes
    if not instance.icd10_code:
        return

    # Skip ruled out diagnoses
    if instance.certainty == "ruled_out":
        return

    # Check for matching notifiable disease
    disease = SurveillanceService.check_diagnosis_for_notifiable_disease(instance)

    if disease:
        try:
            # Create case from diagnosis
            case = SurveillanceService.create_case_from_diagnosis(
                diagnosis=instance,
                disease=disease,
                reported_by=instance.diagnosed_by,
            )
            logger.info(
                f"Auto-created notifiable case for {disease.name} "
                f"from diagnosis {instance.id}"
            )
        except Exception as e:
            logger.error(
                f"Failed to create notifiable case for diagnosis {instance.id}: {e}"
            )
