"""
Celery tasks for Triage app.

Phase 4: Auto-Escalation & Alerts
- check_wait_time_breaches: Runs every minute to detect KETA target violations
- broadcast_breach_alerts: Pushes new breaches to WebSocket clients
- auto_resolve_breaches: Cleans up breaches for patients no longer in active queue
"""

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, ignore_result=True, max_retries=0)
def check_wait_time_breaches(self):
    """
    Periodic task: check all active ER queue entries for KETA wait time breaches.

    Runs every minute via Celery Beat. For each active queue entry whose wait
    time exceeds the KETA target, creates a WaitTimeBreach record (if one
    doesn't already exist for that queue entry) and broadcasts an alert via
    the emergency WebSocket channel.

    KETA Targets:
      RED:    0 min (immediate)
      ORANGE: 10 min
      YELLOW: 60 min
      GREEN:  240 min
      BLUE:   480 min
    """
    from hmis.apps.triage.models import (
        TriageAssessment,
        TriageQueue,
        WaitTimeBreach,
    )

    now = timezone.now()
    new_breaches = []

    # Get all active ER queue entries (WAITING or CALLED — not yet with clinician)
    active_entries = TriageQueue.objects.filter(status__in=["WAITING", "CALLED"]).select_related(
        "triage_assessment",
        "triage_assessment__encounter__patient",
    )

    for entry in active_entries:
        assessment = entry.triage_assessment
        category = assessment.triage_category
        target = TriageAssessment.TARGET_WAIT_TIMES.get(category, 240)

        # Calculate actual wait time
        delta = now - assessment.arrival_time
        actual_wait = int(delta.total_seconds() / 60)

        # Skip if not breached
        if actual_wait <= target:
            continue

        # Skip if breach already recorded for this queue entry
        existing = WaitTimeBreach.objects.filter(
            queue_entry=entry,
            status__in=["ACTIVE", "ACKNOWLEDGED", "ESCALATED"],
        ).exists()

        if existing:
            continue

        # Create breach record
        severity = WaitTimeBreach.CATEGORY_SEVERITY_MAP.get(category, "INFO")
        breach = WaitTimeBreach.objects.create(
            queue_entry=entry,
            triage_assessment=assessment,
            patient=assessment.encounter.patient,
            triage_category=category,
            severity=severity,
            target_wait_minutes=target,
            actual_wait_minutes=actual_wait,
            assigned_area=assessment.assigned_area or "",
        )
        new_breaches.append(breach)

        logger.info(
            "Wait time breach detected: Patient %s (%s), category=%s, "
            "wait=%d min (target=%d min)",
            assessment.encounter.patient.mrn,
            f"{assessment.encounter.patient.first_name} {assessment.encounter.patient.last_name}",
            category,
            actual_wait,
            target,
        )

    # Broadcast new breaches via WebSocket
    if new_breaches:
        _broadcast_breach_alerts(new_breaches)

    logger.debug("Wait time breach check complete: %d new breaches detected", len(new_breaches))

    return len(new_breaches)


@shared_task(bind=True, ignore_result=True, max_retries=0)
def auto_resolve_breaches(self):
    """
    Periodic task: resolve breaches for patients no longer in active queue.

    Runs every 5 minutes. If a patient's queue entry has been completed or
    marked LWBS, their active breaches should be resolved automatically.
    """
    from hmis.apps.triage.models import WaitTimeBreach

    resolved_count = 0
    active_breaches = WaitTimeBreach.objects.filter(
        status__in=["ACTIVE", "ACKNOWLEDGED", "ESCALATED"],
    ).select_related("queue_entry")

    for breach in active_breaches:
        queue_status = breach.queue_entry.status
        if queue_status in ["COMPLETED", "LEFT_WITHOUT_BEING_SEEN", "WITH_CLINICIAN"]:
            breach.resolve()
            resolved_count += 1

    if resolved_count:
        logger.info("Auto-resolved %d wait time breaches", resolved_count)

    return resolved_count


def _broadcast_breach_alerts(breaches):
    """
    Broadcast wait time breach alerts to emergency WebSocket clients.

    Uses the same fire-and-forget async pattern as _broadcast_bed_update in views.
    """
    try:
        import asyncio

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        alerts = []
        for breach in breaches:
            alerts.append(
                {
                    "id": breach.id,
                    "queue_entry_id": breach.queue_entry_id,
                    "triage_assessment_id": breach.triage_assessment_id,
                    "patient_name": (f"{breach.patient.first_name} {breach.patient.last_name}"),
                    "patient_mrn": breach.patient.mrn,
                    "triage_category": breach.triage_category,
                    "severity": breach.severity,
                    "target_wait_minutes": breach.target_wait_minutes,
                    "actual_wait_minutes": breach.actual_wait_minutes,
                    "assigned_area": breach.assigned_area,
                    "status": breach.status,
                    "created_at": breach.created_at.isoformat(),
                }
            )

        message = {
            "type": "emergency.wait.breach",
            "event_type": "wait_time_breach",
            "data": {
                "breaches": alerts,
                "count": len(alerts),
                "timestamp": timezone.now().isoformat(),
            },
        }

        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if loop and loop.is_running():
            asyncio.ensure_future(channel_layer.group_send("emergency_queue", message))
        else:
            new_loop = asyncio.new_event_loop()
            try:
                new_loop.run_until_complete(channel_layer.group_send("emergency_queue", message))
            finally:
                new_loop.close()

    except Exception:
        logger.exception("Failed to broadcast breach alerts via WebSocket")
