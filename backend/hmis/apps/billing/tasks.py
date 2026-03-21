"""
Billing Celery tasks for scheduled automation.

Tasks:
- apply_daily_bed_charges: Midnight — charge active IPD admissions
- flag_overdue_invoices: 6 AM daily — mark past-due invoices
- submit_pending_sha_claims: Hourly — batch submit SHA claims to SHA API
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
