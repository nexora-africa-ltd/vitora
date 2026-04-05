"""
Celery tasks for immunizations module.

Includes:
- AEFI DHIS2 Tracker submission (async, triggered after submit_to_authorities)
"""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    name="hmis.apps.immunizations.tasks.submit_aefi_to_dhis2",
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # 1 minute between retries
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def submit_aefi_to_dhis2(self, aefi_id: int) -> dict:  # noqa: ARG001
    """Submit an AEFI report to DHIS2 Tracker API.

    This task is enqueued after an AEFI is marked as reported via
    submit_to_authorities(). It retries up to 3 times with exponential
    backoff on transient failures.

    Args:
        aefi_id: Primary key of the AEFI instance.

    Returns:
        dict with submission result.
    """
    from hmis.apps.immunizations.models import AEFI
    from hmis.apps.immunizations.services.dhis2_tracker import AEFITrackerService

    try:
        aefi = AEFI.objects.select_related(
            "immunization_record",
            "immunization_record__patient",
            "immunization_record__vaccine",
        ).get(pk=aefi_id)
    except AEFI.DoesNotExist:
        logger.error("AEFI %s not found, cannot submit to DHIS2", aefi_id)
        return {"status": "error", "message": f"AEFI {aefi_id} not found"}

    result = AEFITrackerService.submit_to_dhis2(aefi)
    logger.info("AEFI %s DHIS2 submission result: %s", aefi_id, result.get("status", "unknown"))
    return result
