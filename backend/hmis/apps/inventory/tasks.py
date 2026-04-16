"""
Celery tasks for the Inventory app.

Phase 5: KRA eTIMS async submission and retry.
Phase 6: Demand forecasting scheduled tasks.
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


# ===========================================================================
# Phase 6: Demand Forecasting Scheduled Tasks
# ===========================================================================


@shared_task
def aggregate_daily_consumption():
    """
    Scheduled daily: aggregate yesterday's dispensing/adjustment data into
    ConsumptionRecord rows for all active facilities.
    """
    from datetime import date, timedelta

    from hmis.apps.core.models import Facility
    from hmis.apps.inventory.services.forecasting import ConsumptionAggregator

    yesterday = date.today() - timedelta(days=1)
    first_of_month = yesterday.replace(day=1)

    facility_ids = Facility.objects.filter(is_active=True).values_list("pk", flat=True)
    total = 0
    for fid in facility_ids:
        agg = ConsumptionAggregator(facility_id=fid)
        count = agg.aggregate(first_of_month, yesterday)
        total += count

    if total:
        logger.info(
            "Daily consumption aggregation: %d records across %d facilities.",
            total,
            len(facility_ids),
        )
    return total


@shared_task
def generate_weekly_forecasts():
    """
    Scheduled weekly: generate demand forecasts for all drugs at all active
    facilities using the moving average method.
    """
    from hmis.apps.core.models import Facility
    from hmis.apps.inventory.services.forecasting import DemandForecaster

    facility_ids = Facility.objects.filter(is_active=True).values_list("pk", flat=True)
    total = 0
    for fid in facility_ids:
        forecaster = DemandForecaster(facility_id=fid)
        count = forecaster.forecast_all(period_months=3, method="MOVING_AVERAGE")
        total += count

    if total:
        logger.info("Weekly forecast generation: %d forecasts.", total)
    return total


@shared_task
def generate_reorder_suggestions_task():
    """
    Scheduled weekly: generate reorder suggestions for all active facilities
    by comparing current stock against forecasted demand.
    """
    from hmis.apps.core.models import Facility
    from hmis.apps.inventory.services.forecasting import ReorderEngine

    facility_ids = Facility.objects.filter(is_active=True).values_list("pk", flat=True)
    total = 0
    for fid in facility_ids:
        engine = ReorderEngine(facility_id=fid)
        count = engine.generate_suggestions()
        total += count

    if total:
        logger.info("Weekly reorder suggestions: %d suggestions.", total)
    return total
