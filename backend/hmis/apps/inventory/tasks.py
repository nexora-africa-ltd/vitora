"""
Celery tasks for the Inventory app.

Phase 5: KRA eTIMS async submission and retry.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)

# Maximum retries before giving up on a failed eTIMS submission
MAX_ETIMS_RETRIES = 5


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def submit_etims_invoice_task(self, etims_invoice_id: int):
    """
    Asynchronously submit an invoice to KRA eTIMS.

    Automatically retries up to 3 times with a 60-second delay on failure.
    """
    from hmis.apps.inventory.services.etims import submit_etims_invoice

    try:
        response = submit_etims_invoice(etims_invoice_id)
        if not response.success:
            logger.warning(
                "eTIMS submission failed for ETIMSInvoice %s: %s",
                etims_invoice_id,
                response.message,
            )
            # Retry transient failures
            raise self.retry(exc=Exception(response.message))
        logger.info(
            "eTIMS submission succeeded for ETIMSInvoice %s: receipt %s",
            etims_invoice_id,
            response.receipt_number,
        )
    except self.MaxRetriesExceededError:
        logger.error(
            "eTIMS submission exhausted retries for ETIMSInvoice %s",
            etims_invoice_id,
        )


@shared_task
def retry_failed_etims_invoices():
    """
    Periodic task: retry all FAILED eTIMS invoice submissions that haven't
    exceeded the max retry count.

    Intended to run on a Celery Beat schedule (e.g., every 15 minutes).
    """
    from hmis.apps.inventory.models import ETIMSInvoice, ETIMSInvoiceStatus

    failed = ETIMSInvoice.objects.filter(
        status=ETIMSInvoiceStatus.FAILED,
        retry_count__lt=MAX_ETIMS_RETRIES,
    )
    count = 0
    for etims_inv in failed:
        submit_etims_invoice_task.delay(etims_inv.pk)
        count += 1

    if count:
        logger.info("Queued %d failed eTIMS invoices for retry.", count)
    return count
