"""
Celery tasks for the Referrals module.

Tasks:
- expire_referrals: Mark PENDING referrals past their expires_at as EXPIRED.
"""

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="hmis.apps.referrals.tasks.expire_referrals")
def expire_referrals():
    """
    Mark PENDING referrals past their ``expires_at`` as EXPIRED.

    Runs every 15 minutes by Celery beat. Only transitions PENDING referrals
    so that ACCEPTED / IN_PROGRESS / COMPLETED / CANCELLED / DECLINED records
    are never overwritten. Each transition flows through ``referral.expire()``
    so HistoricalRecords + signals fire (notifications, domain events).
    """
    from hmis.apps.referrals.models import ClinicalReferral

    now = timezone.now()

    expired_qs = ClinicalReferral.objects.filter(
        status="PENDING",
        expires_at__lt=now,
    )

    count = expired_qs.count()
    if count == 0:
        logger.info("expire_referrals: no referrals to expire.")
        return {"expired": 0}

    expired_numbers = []
    for ref in expired_qs.iterator():
        ref.expire()
        expired_numbers.append(ref.referral_number)

    logger.info(
        "expire_referrals: marked %d referral(s) as EXPIRED: %s",
        count,
        ", ".join(expired_numbers[:20]),
    )

    return {"expired": count, "referral_numbers": expired_numbers}
