"""Signals for the MCH module."""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.mch.models import Delivery

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Delivery)
def create_baby_patient_on_delivery(sender, instance, created, **kwargs):
    """Create baby patient record when a delivery is completed."""
    if instance.status != "COMPLETED" or instance.baby_patient:
        return

    try:
        from hmis.apps.patients.models import Patient

        mother = instance.registration.mother
        baby_first_name = f"Baby of {mother.first_name}"

        baby = Patient.objects.create(
            first_name=baby_first_name,
            last_name=mother.last_name,
            date_of_birth=instance.delivery_date,
            gender=instance.baby_gender or "O",
            county=mother.county,
            sub_county=mother.sub_county,
            ward=mother.ward,
            registered_by=instance.delivered_by or instance.registration.registered_by,
        )

        instance.baby_patient = baby
        instance.save(update_fields=["baby_patient"])

        registration = instance.registration
        if not registration.baby:
            registration.baby = baby
            registration.save(update_fields=["baby"])

        logger.info("Created baby patient %s for delivery %s", baby.id, instance.id)

    except Exception as exc:
        logger.error("Failed to create baby patient for delivery %s: %s", instance.id, exc)
