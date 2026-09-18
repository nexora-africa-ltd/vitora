# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Background tasks for encounter workflows.

How to use:
- Tasks are auto-discovered by Celery and scheduled from ``hmis/celery.py``.

Supported inputs:
- ``flag_overdue_emergency_encounter_documentation``: no runtime args.
"""

import logging

from celery import shared_task
from django.utils import timezone

from hmis.apps.core.models import AuditLog

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    ignore_result=True,
    max_retries=0,
    name="hmis.apps.encounters.tasks.flag_overdue_emergency_encounter_documentation",
)
def flag_overdue_emergency_encounter_documentation(self):  # noqa: ARG001
    """Mark emergency encounter deferred documentation as overdue once SLA expires."""
    from hmis.apps.encounters.models import Encounter

    now = timezone.now()
    overdue_qs = Encounter.objects.filter(
        is_emergency_capture=True,
        deferred_completion_status="PENDING",
        deferred_completion_due_at__isnull=False,
        deferred_completion_due_at__lt=now,
    )

    flagged = 0
    for encounter in overdue_qs:
        encounter.deferred_completion_status = "OVERDUE"
        encounter.save(update_fields=["deferred_completion_status", "updated_at"])
        flagged += 1

        AuditLog.log(
            action="encounter_emergency_deferred_overdue",
            user=None,
            resource_type="Encounter",
            resource_id=encounter.id,
            patient_id=encounter.patient_id,
            details={
                "workflow": "emergency_deferred_completion",
                "reason": "SLA deadline exceeded",
                "deferred_completion_due_at": (
                    encounter.deferred_completion_due_at.isoformat()
                    if encounter.deferred_completion_due_at
                    else None
                ),
                "deferred_completion_status": encounter.deferred_completion_status,
            },
        )

    if flagged:
        logger.info(
            "Flagged %d emergency encounter deferred documentation records as overdue",
            flagged,
        )

    return {"flagged_overdue": flagged}
