"""Domain event signals for Worksheets & Labels."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import LaboratoryEvents

from .models import LabelPrintJob, Worksheet


@receiver(post_save, sender=Worksheet)
def publish_worksheet_event(sender, instance, created, **kwargs):
    """Publish event when a worksheet is generated."""
    if created:
        publish_event(
            LaboratoryEvents.WORKSHEET_GENERATED,
            "Worksheet",
            instance.pk,
            payload={
                "worksheet_number": instance.worksheet_number,
                "title": instance.title,
                "specimen_count": instance.specimen_count,
                "export_format": instance.export_format,
            },
            facility_id=instance.facility_id,
        )


@receiver(post_save, sender=LabelPrintJob)
def publish_label_job_event(sender, instance, created, **kwargs):
    """Publish event when labels are generated."""
    if created:
        publish_event(
            LaboratoryEvents.LABEL_JOB_CREATED,
            "LabelPrintJob",
            instance.pk,
            payload={
                "label_count": instance.label_count,
                "status": instance.status,
                "template_id": instance.template_id,
            },
            facility_id=instance.facility_id,
        )
