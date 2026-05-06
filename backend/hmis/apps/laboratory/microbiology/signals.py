"""Domain event signals for L4 Microbiology module."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import LaboratoryEvents

from .models import AntibioticSensitivity, CultureResult


@receiver(post_save, sender=CultureResult)
def publish_culture_result_event(sender, instance, created, **kwargs):
    """Publish domain events for culture result lifecycle."""
    event_type = LaboratoryEvents.CULTURE_CREATED if created else LaboratoryEvents.CULTURE_UPDATED

    publish_event(
        event_type,
        aggregate_type="CultureResult",
        aggregate_id=instance.pk,
        payload={
            "lab_result_id": instance.lab_result_id,
            "status": instance.status,
            "organism_id": instance.organism_id,
            "is_significant": instance.is_significant,
        },
        facility_id=instance.facility_id,
    )


@receiver(post_save, sender=AntibioticSensitivity)
def publish_sensitivity_event(sender, instance, created, **kwargs):
    """Publish domain events for antibiotic sensitivity records."""
    if created:
        publish_event(
            LaboratoryEvents.SENSITIVITY_CREATED,
            aggregate_type="AntibioticSensitivity",
            aggregate_id=instance.pk,
            payload={
                "culture_id": instance.culture_id,
                "antibiotic_id": instance.antibiotic_id,
                "interpretation": instance.interpretation,
            },
            facility_id=instance.facility_id,
        )
