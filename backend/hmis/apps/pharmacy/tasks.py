# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Celery tasks for the Pharmacy module.

Includes:
- Automatic prescription expiry
- Prescription expiry alerts
- Stock batch expiry processing
"""

import logging
from datetime import date, timedelta

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count
from django.template.loader import render_to_string
from django.utils import timezone

from hmis.apps.core.services.email_service import send_transactional_email

logger = logging.getLogger(__name__)

STOCK_DIGEST_MAX_ITEMS = 100


def queue_stock_alert_digest(facility_id: int, digest_minutes: int = 15) -> None:
    """Schedule one delayed stock digest per facility, regardless of alert volume."""
    interval = max(1, digest_minutes)
    key = f"pharmacy:stock-alert-digest:{facility_id}"
    # The cache key only coalesces scheduling. The sent marker on StockAlert is
    # durable, so a cache eviction can at most cause a harmless duplicate task.
    if cache.add(key, "1", timeout=interval * 120):
        send_stock_alert_digest.apply_async(args=[facility_id], countdown=interval * 60)


@shared_task(name="hmis.apps.pharmacy.tasks.send_stock_alert_digest")
def send_stock_alert_digest(facility_id: int) -> dict[str, int | bool]:
    """Email one facility-scoped, de-duplicated digest of pending stock alerts."""
    from hmis.apps.core.models import Facility
    from hmis.apps.pharmacy.models import AlertSettings, StockAlert

    cache.delete(f"pharmacy:stock-alert-digest:{facility_id}")
    facility = Facility.objects.filter(pk=facility_id).first()
    if facility is None:
        return {"sent": False, "alerts": 0}

    alert_settings = AlertSettings.get_settings(facility)
    if not alert_settings.enable_email_notifications:
        return {"sent": False, "alerts": 0}
    recipients = alert_settings.resolve_stock_alert_email_recipients()
    if not recipients:
        return {"sent": False, "alerts": 0}

    with transaction.atomic():
        alerts = list(
            StockAlert.objects.select_for_update()
            .filter(
                facility_id=facility_id,
                is_resolved=False,
                stock_digest_sent_at__isnull=True,
                alert_type__in=["LOW_STOCK", "OUT_OF_STOCK"],
            )
            .select_related("drug", "batch")
            .order_by("-severity", "-created_at")
        )
        if not alerts:
            return {"sent": False, "alerts": 0}

        displayed_alerts = alerts[:STOCK_DIGEST_MAX_ITEMS]
        grouped = {}
        for alert in displayed_alerts:
            grouped.setdefault(alert.severity, {}).setdefault(alert.alert_type, []).append(alert)
        counts = list(
            StockAlert.objects.filter(pk__in=[alert.pk for alert in alerts])
            .values("severity", "alert_type")
            .annotate(total=Count("id"))
            .order_by("-total")
        )
        context = {
            "facility_name": facility.name,
            "total_alerts": len(alerts),
            "groups": grouped,
            "counts": counts,
            "alerts": displayed_alerts,
            "remaining_alerts": max(0, len(alerts) - len(displayed_alerts)),
            "inventory_url": f"{getattr(settings, 'FRONTEND_URL', '').rstrip('/')}/pharmacy/inventory",
        }
        html_body = render_to_string("pharmacy/email/stock_alert_digest.html", context)
        text_body = render_to_string("pharmacy/email/stock_alert_digest.txt", context)
        subject = f"[{facility.name}] Pharmacy stock alert digest ({len(alerts):,})"

        accepted = True
        for recipient in recipients:
            result = send_transactional_email(
                subject=subject,
                html_body=html_body or text_body.replace("\n", "<br>"),
                to_email=recipient,
                facility=facility,
            )
            accepted = accepted and bool(result.get("accepted", False))

        if accepted:
            StockAlert.objects.filter(pk__in=[alert.pk for alert in alerts]).update(
                stock_digest_sent_at=timezone.now()
            )
            return {"sent": True, "alerts": len(alerts)}

    # Leave alerts pending after a provider rejection so a later stock event
    # schedules a retry without losing the digest.
    return {"sent": False, "alerts": len(alerts)}


@shared_task(name="hmis.apps.pharmacy.tasks.expire_prescriptions")
def expire_prescriptions():
    """
    Mark prescriptions past their valid_until date as EXPIRED.

    Runs daily. Only transitions PENDING and PARTIAL prescriptions —
    DISPENSED and CANCELLED are final states and are not touched.
    Logs each transition to the audit trail via HistoricalRecords.
    """
    from hmis.apps.pharmacy.models import Prescription

    today = date.today()

    expired_qs = Prescription.objects.filter(
        valid_until__lt=today,
        status__in=["PENDING", "PARTIAL"],
    )

    count = expired_qs.count()
    if count == 0:
        logger.info("expire_prescriptions: no prescriptions to expire.")
        return {"expired": 0}

    # Update one-by-one so HistoricalRecords captures each transition
    expired_ids = []
    for rx in expired_qs.iterator():
        rx.status = "EXPIRED"
        rx.save(update_fields=["status", "updated_at"])
        expired_ids.append(rx.prescription_number)

    logger.info(
        "expire_prescriptions: marked %d prescription(s) as EXPIRED: %s",
        count,
        ", ".join(expired_ids[:20]),  # Log first 20 for brevity
    )

    return {"expired": count, "prescription_numbers": expired_ids}


@shared_task(name="hmis.apps.pharmacy.tasks.generate_prescription_expiry_alerts")
def generate_prescription_expiry_alerts():
    """
    Generate alerts for prescriptions expiring soon that still have
    undispensed items.

    Alert thresholds (from PHARMACY_SETTINGS):
    - CRITICAL: expiring within 3 days
    - HIGH: expiring within 7 days

    Only targets PENDING and PARTIAL prescriptions with remaining items.
    """
    from hmis.apps.pharmacy.models import Prescription, StockAlert

    pharmacy_settings = getattr(settings, "PHARMACY_SETTINGS", {})
    critical_days = pharmacy_settings.get("RX_EXPIRY_CRITICAL_DAYS", 3)
    warning_days = pharmacy_settings.get("RX_EXPIRY_WARNING_DAYS", 7)

    today = date.today()
    critical_date = today + timedelta(days=critical_days)
    warning_date = today + timedelta(days=warning_days)

    expiring_qs = (
        Prescription.objects.filter(
            valid_until__gte=today,
            valid_until__lte=warning_date,
            status__in=["PENDING", "PARTIAL"],
        )
        .select_related("patient", "prescribed_by")
        .prefetch_related("items")
    )

    alerts_created = 0
    for rx in expiring_qs:
        # Only alert if there are remaining items to dispense
        remaining = rx.get_remaining_items()
        if not remaining:
            continue

        days_left = (rx.valid_until - today).days
        is_critical = rx.valid_until <= critical_date

        severity = "CRITICAL" if is_critical else "HIGH"
        item_names = ", ".join(item.drug.generic_name for item in remaining[:3])
        suffix = f" (+{len(remaining) - 3} more)" if len(remaining) > 3 else ""

        message = (
            f"Prescription {rx.prescription_number} for "
            f"{rx.patient.first_name} {rx.patient.last_name} "
            f"expires in {days_left} day(s). "
            f"Undispensed: {item_names}{suffix}"
        )

        # Use StockAlert with RX_EXPIRING type.
        # Deduplicate by checking for an existing unresolved alert whose
        # message starts with this prescription number.
        prefix = f"Prescription {rx.prescription_number} "
        existing = StockAlert.objects.filter(
            alert_type="RX_EXPIRING",
            is_resolved=False,
            facility=rx.facility,
            message__startswith=prefix,
        ).exists()

        if not existing:
            StockAlert.objects.create(
                alert_type="RX_EXPIRING",
                drug=remaining[0].drug,
                severity=severity,
                message=message,
                facility=rx.facility,
            )
            alerts_created += 1

    logger.info(
        "generate_prescription_expiry_alerts: created %d alert(s) "
        "from %d expiring prescription(s).",
        alerts_created,
        expiring_qs.count(),
    )

    return {"alerts_created": alerts_created}


@shared_task(name="hmis.apps.pharmacy.tasks.generate_stock_expiry_alerts")
def generate_stock_expiry_alerts():
    """Generate alerts for expiring and expired stock batches."""
    from hmis.apps.pharmacy.models import StockAlert

    alerts = StockAlert.generate_expiry_alerts()
    logger.info(
        "generate_stock_expiry_alerts: generated %d new alert(s).",
        len(alerts),
    )
    return {"alerts_generated": len(alerts)}
