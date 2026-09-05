# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Publish domain events for significant SHR consent lifecycle changes."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import SHREvents
from hmis.apps.shr.models import SHRConsentVisit


@receiver(post_save, sender=SHRConsentVisit)
def publish_shr_consent_event(sender, instance, created, **kwargs):
    """Emit only non-sensitive SHR lifecycle metadata."""
    event_type = SHREvents.CONSENT_REQUESTED if created else SHREvents.STATUS_CHANGED
    publish_event(
        event_type,
        "SHRConsentVisit",
        instance.pk,
        {
            "patient_id": instance.patient_id,
            "visit_id": instance.visit_id,
            "status": instance.status,
            "request_kind": instance.request_kind,
        },
        user_id=instance.created_by_id,
        facility_id=instance.facility_id,
        organization_id=instance.organization_id,
    )
