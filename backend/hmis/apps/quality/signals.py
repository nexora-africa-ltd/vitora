"""
Signal handlers for the Quality app.

Wires clinical data changes to asynchronous quality measure recalculation:
- Encounter save → re-evaluate measures for the encounter's clinic
- Lab result verification → re-evaluate measures for the patient's clinic
- Clinic visit completion → re-evaluate measures for the visit's clinic
- QualityMeasureResult save → publish domain event

These use Celery tasks (async) to avoid slowing down the clinical workflow.
"""

from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import QualityEvents

logger = logging.getLogger(__name__)


# =============================================================================
# Domain Event Publishing
# =============================================================================


@receiver(post_save, sender="quality.QualityMeasureResult")
def publish_quality_result_event(sender, instance, created, **kwargs):
    """Publish domain event when a quality measure result is calculated."""
    event_type = QualityEvents.RESULT_CALCULATED if created else QualityEvents.RESULT_UPDATED
    publish_event(
        event_type=event_type,
        aggregate_type="QualityMeasureResult",
        aggregate_id=instance.pk,
        payload={
            "measure_code": instance.measure.code,
            "clinic_id": instance.clinic_id,
            "year": instance.year,
            "period": instance.period,
            "percentage": float(instance.percentage),
            "meets_target": instance.meets_target,
            "numerator": instance.numerator,
            "denominator": instance.denominator,
        },
        facility_id=getattr(instance.clinic, "facility_id", None),
        organization_id=getattr(instance.clinic, "organization_id", None),
    )


# =============================================================================
# Clinical Data Change → Async Recalculation
# =============================================================================


@receiver(post_save, sender="encounters.Encounter")
def trigger_evaluation_on_encounter(sender, instance, **kwargs):
    """Re-evaluate quality measures when an encounter is saved."""
    # Only trigger if encounter has a clinic visit link
    clinic_id = _get_clinic_id_from_encounter(instance)
    if clinic_id:
        _schedule_evaluation(clinic_id)


@receiver(post_save, sender="laboratory.LabResult")
def trigger_evaluation_on_lab_result(sender, instance, **kwargs):
    """Re-evaluate quality measures when a lab result is verified."""
    # Only trigger for verified results to avoid premature evaluation
    if instance.verification_status != "VERIFIED":
        return

    clinic_id = _get_clinic_id_from_lab_result(instance)
    if clinic_id:
        _schedule_evaluation(clinic_id)


@receiver(post_save, sender="clinics.ClinicVisit")
def trigger_evaluation_on_visit_complete(sender, instance, **kwargs):
    """Re-evaluate quality measures when a visit is completed."""
    if instance.status != "COMPLETED":
        return

    clinic_id = getattr(instance.session, "clinic_id", None)
    if clinic_id:
        _schedule_evaluation(clinic_id)


# =============================================================================
# Helpers
# =============================================================================


def _get_clinic_id_from_encounter(encounter) -> int | None:
    """Resolve clinic_id from an encounter via its clinic_visit."""
    visit = getattr(encounter, "clinic_visit", None)
    if visit:
        session = getattr(visit, "session", None)
        if session:
            return session.clinic_id
    return None


def _get_clinic_id_from_lab_result(lab_result) -> int | None:
    """Resolve clinic_id from a lab result → order → patient → clinic visit."""
    try:
        order = lab_result.order_item.order
        # Try to find an active clinic enrollment for this patient
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = (
            ClinicEnrollment.objects.filter(
                patient_id=order.patient_id,
                status="ACTIVE",
            )
            .select_related("clinic")
            .first()
        )
        if enrollment:
            return enrollment.clinic_id
    except Exception:  # noqa: S110
        pass
    return None


def _schedule_evaluation(clinic_id: int) -> None:
    """Schedule async CQM evaluation for a clinic (debounced via Celery)."""
    try:
        from hmis.apps.quality.tasks import evaluate_clinic_measures_task

        # Use countdown=60 to debounce rapid-fire saves (batch clinical workflow)
        evaluate_clinic_measures_task.apply_async(
            kwargs={"clinic_id": clinic_id},
            countdown=60,
        )
    except Exception:
        # Celery not available (dev mode without Redis) — skip silently
        logger.debug("Celery not available, skipping CQM evaluation for clinic %d", clinic_id)
