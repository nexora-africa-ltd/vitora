"""
Billing Celery tasks for scheduled automation.

Tasks:
- apply_daily_bed_charges: Midnight — charge active IPD admissions
- flag_overdue_invoices: 6 AM daily — mark past-due invoices
- submit_pending_sha_claims: Hourly — batch submit SHA claims to SHA API
- poll_preauth_statuses: Every 5 min — poll DHA for preauth decision updates
"""

from celery import shared_task


@shared_task(name="hmis.apps.billing.tasks.apply_daily_bed_charges")
def apply_daily_bed_charges():
    """Apply daily bed charges to all active inpatient admissions."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.apply_daily_bed_charges()


@shared_task(name="hmis.apps.billing.tasks.flag_overdue_invoices")
def flag_overdue_invoices():
    """Flag pending invoices past their due date as overdue."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.flag_overdue_invoices()


@shared_task(name="hmis.apps.billing.tasks.submit_pending_sha_claims")
def submit_pending_sha_claims():
    """Batch-submit draft SHA claims to the SHA API."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.submit_pending_sha_claims()


@shared_task(name="hmis.apps.billing.tasks.poll_sha_claim_statuses")
def poll_sha_claim_statuses():
    """Poll SHA API for status updates on submitted claims."""
    from hmis.apps.billing.agent import BillingAgentService

    return BillingAgentService.poll_sha_claim_statuses()


@shared_task(name="hmis.apps.billing.tasks.poll_preauth_statuses")
def poll_preauth_statuses():
    """Poll DHA API for pre-authorization decision updates on pending requests."""
    import logging

    from hmis.apps.billing.models import PreauthRequest
    from hmis.apps.billing.services.sha_preauth import SHAPreauthService

    logger = logging.getLogger(__name__)
    pending = PreauthRequest.objects.filter(
        decision=PreauthRequest.PreauthDecision.PENDING,
    ).select_related("claim", "sha_member")

    polled = 0
    errors = 0
    for preauth in pending:
        try:
            service = SHAPreauthService()
            service.poll_status(preauth)
            polled += 1
        except Exception:
            errors += 1
            logger.exception("Failed to poll preauth %s", preauth.preauth_reference)

    result = f"Polled {polled} preauth request(s), {errors} error(s)"
    logger.info(result)
    return result
