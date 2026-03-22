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
from django.utils import timezone

logger = logging.getLogger(__name__)


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

    expiring_qs = Prescription.objects.filter(
        valid_until__gte=today,
        valid_until__lte=warning_date,
        status__in=["PENDING", "PARTIAL"],
    ).select_related("patient", "prescribed_by").prefetch_related("items")

    alerts_created = 0
    for rx in expiring_qs:
        # Only alert if there are remaining items to dispense
        remaining = rx.get_remaining_items()
        if not remaining:
            continue

        days_left = (rx.valid_until - today).days
        is_critical = rx.valid_until <= critical_date

        severity = "CRITICAL" if is_critical else "HIGH"
        item_names = ", ".join(
            item.drug.generic_name for item in remaining[:3]
        )
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
            message__startswith=prefix,
        ).exists()

        if not existing:
            StockAlert.objects.create(
                alert_type="RX_EXPIRING",
                drug=remaining[0].drug,
                severity=severity,
                message=message,
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
