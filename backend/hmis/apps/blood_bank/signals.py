"""Blood Bank domain event signals."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event

from .models import BloodIssue, BloodRequest, BloodUnit


@receiver(post_save, sender=BloodUnit)
def publish_blood_unit_event(sender, instance, created, **kwargs):
    event_type = "blood_bank.unit.created" if created else "blood_bank.unit.updated"
    publish_event(
        event_type,
        "BloodUnit",
        instance.pk,
        {
            "unit_number": instance.unit_number,
            "blood_group": instance.blood_group,
            "status": instance.status,
        },
    )


@receiver(post_save, sender=BloodRequest)
def publish_blood_request_event(sender, instance, created, **kwargs):
    event_type = "blood_bank.request.created" if created else "blood_bank.request.updated"
    publish_event(
        event_type,
        "BloodRequest",
        instance.pk,
        {
            "request_number": instance.request_number,
            "patient_id": instance.patient_id,
            "status": instance.status,
            "urgency": instance.urgency,
        },
    )


@receiver(post_save, sender=BloodIssue)
def publish_blood_issue_event(sender, instance, created, **kwargs):
    if created:
        publish_event(
            "blood_bank.issue.created",
            "BloodIssue",
            instance.pk,
            {
                "blood_unit_id": instance.blood_unit_id,
                "blood_request_id": instance.blood_request_id,
            },
        )
