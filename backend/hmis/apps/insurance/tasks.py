"""Celery tasks for private insurance background processing.

All tasks follow the project pattern:
- ``@shared_task`` with explicit dotted name
- Late imports inside the function body
- Per-item try/except so one failure doesn't stop the batch
- Counter-based return string for observability
"""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="hmis.apps.insurance.tasks.check_pending_claims_status")
def check_pending_claims_status() -> str:
    """Poll insurer APIs for status updates on SUBMITTED claims.

    Scheduled via Celery beat (e.g. every 30 minutes). Only processes
    claims whose provider has ``api_integration_enabled=True`` and a
    facility-level ``InsuranceProviderConfig`` with ``api_enabled=True``.
    """
    from hmis.apps.insurance.models import InsuranceClaim, InsuranceProviderConfig
    from hmis.apps.insurance.services.insurance_services import InsuranceClaimsService

    claims = InsuranceClaim.objects.filter(
        status__in=[
            InsuranceClaim.Status.SUBMITTED,
            InsuranceClaim.Status.ACKNOWLEDGED,
            InsuranceClaim.Status.QUERY,
        ],
        provider__api_integration_enabled=True,
        external_claim_id__gt="",
    ).select_related("provider", "facility", "patient_insurance")

    service = InsuranceClaimsService()
    polled = 0
    updated = 0
    errors = 0

    for claim in claims:
        try:
            # Ensure facility has a config with API enabled
            if not InsuranceProviderConfig.objects.filter(
                provider=claim.provider, facility=claim.facility, api_enabled=True
            ).exists():
                continue

            old_status = claim.status
            service.check_status(claim)
            polled += 1
            if claim.status != old_status:
                updated += 1
        except Exception:
            errors += 1
            logger.exception("Failed to check status for claim %s", claim.claim_number)

    result = f"Polled {polled} claim(s), {updated} updated, {errors} error(s)"
    logger.info(result)
    return result


@shared_task(name="hmis.apps.insurance.tasks.check_expiring_preauths")
def check_expiring_preauths() -> str:
    """Find preauths expiring within 48 hours and publish alerts.

    Scheduled via Celery beat (e.g. daily). Marks expired preauths and
    publishes domain events for near-expiry notifications.
    """
    import contextlib
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.core.events import publish_event
    from hmis.apps.insurance.models import InsurancePreauth

    now = timezone.now()
    threshold = now + timedelta(hours=48)

    # Expire overdue preauths
    expired_qs = InsurancePreauth.objects.filter(
        status=InsurancePreauth.Status.APPROVED,
        expires_at__lt=now,
    )
    expired_count = 0
    for preauth in expired_qs:
        try:
            preauth.expire()
            expired_count += 1
        except Exception:
            logger.exception("Failed to expire preauth %s", preauth.preauth_number)

    # Alert near-expiry
    near_expiry = InsurancePreauth.objects.filter(
        status=InsurancePreauth.Status.APPROVED,
        expires_at__gte=now,
        expires_at__lte=threshold,
    )
    alerted = 0
    for preauth in near_expiry:
        with contextlib.suppress(Exception):
            publish_event(
                "insurance.preauth.near_expiry",
                {
                    "preauth_id": preauth.pk,
                    "preauth_number": preauth.preauth_number,
                    "expires_at": preauth.expires_at.isoformat() if preauth.expires_at else "",
                    "provider": preauth.provider.name if preauth.provider else "",
                },
            )
            alerted += 1

    result = f"Expired {expired_count}, alerted {alerted} near-expiry preauth(s)"
    logger.info(result)
    return result


@shared_task(name="hmis.apps.insurance.tasks.fetch_remittances")
def fetch_remittances() -> str:
    """Fetch remittances from API-enabled providers for the last 30 days.

    Scheduled via Celery beat (e.g. daily).
    """
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.insurance.models import InsuranceProviderConfig
    from hmis.apps.insurance.services.insurance_services import InsuranceRemittanceService

    date_to = timezone.now().date()
    date_from = date_to - timedelta(days=30)

    configs = InsuranceProviderConfig.objects.filter(
        api_enabled=True,
    ).select_related("provider", "facility")

    service = InsuranceRemittanceService()
    fetched = 0
    errors = 0

    for config in configs:
        try:
            created = service.fetch_and_reconcile(config, date_from, date_to)
            fetched += len(created)
        except Exception:
            errors += 1
            logger.exception(
                "Failed to fetch remittances for provider %s at facility %s",
                config.provider.name if config.provider else "?",
                config.facility_id,
            )

    result = f"Fetched {fetched} remittance(s), {errors} error(s)"
    logger.info(result)
    return result


@shared_task(name="hmis.apps.insurance.tasks.check_expiring_enrollments")
def check_expiring_enrollments() -> str:
    """Alert for patient insurance enrollments expiring within 30 days.

    Scheduled via Celery beat (e.g. weekly).
    """
    import contextlib
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.core.events import publish_event
    from hmis.apps.insurance.models import PatientInsurance

    today = timezone.now().date()
    threshold = today + timedelta(days=30)

    expiring = PatientInsurance.objects.filter(
        status=PatientInsurance.Status.ACTIVE,
        valid_to__gte=today,
        valid_to__lte=threshold,
    ).select_related("patient", "provider", "plan")

    alerted = 0
    for enrollment in expiring:
        with contextlib.suppress(Exception):
            publish_event(
                "insurance.enrollment.expiring",
                {
                    "enrollment_id": enrollment.pk,
                    "patient_id": enrollment.patient_id,
                    "provider": enrollment.provider.name if enrollment.provider else "",
                    "plan": enrollment.plan.name if enrollment.plan else "",
                    "valid_to": enrollment.valid_to.isoformat() if enrollment.valid_to else "",
                    "days_until_expiry": enrollment.days_until_expiry,
                },
            )
            alerted += 1

    result = f"Alerted {alerted} expiring enrollment(s)"
    logger.info(result)
    return result
