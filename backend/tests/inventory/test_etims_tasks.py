"""
Tests for eTIMS Celery tasks.

Covers:
- submit_etims_invoice_task execution
- retry_failed_etims_invoices periodic task
"""

from unittest.mock import patch

import pytest  # type: ignore

from hmis.apps.inventory.models import ETIMSInvoice, ETIMSInvoiceStatus
from hmis.apps.inventory.tasks import (
    MAX_ETIMS_RETRIES,
    retry_failed_etims_invoices,
    submit_etims_invoice_task,
)


@pytest.mark.django_db
class TestSubmitETIMSInvoiceTask:
    """Tests for submit_etims_invoice_task."""

    def test_task_calls_service(self, etims_invoice, mocker):
        """Task should call submit_etims_invoice and succeed with mock client."""
        from hmis.apps.inventory.services.etims import ETIMSResponse

        mock_submit = mocker.patch(
            "hmis.apps.inventory.services.etims.submit_etims_invoice",
            return_value=ETIMSResponse(
                success=True,
                receipt_number="MOCK-20260416",
                message="OK",
            ),
        )
        # Call synchronously (not via .delay())
        submit_etims_invoice_task(etims_invoice.pk)
        mock_submit.assert_called_once_with(etims_invoice.pk)

    def test_task_retries_on_failure(self, etims_invoice, mocker):
        """Task should raise Retry when service returns failure."""
        from hmis.apps.inventory.services.etims import ETIMSResponse

        mocker.patch(
            "hmis.apps.inventory.services.etims.submit_etims_invoice",
            return_value=ETIMSResponse(success=False, message="KRA timeout"),
        )
        mock_retry = mocker.patch.object(
            submit_etims_invoice_task,
            "retry",
            side_effect=submit_etims_invoice_task.MaxRetriesExceededError(),
        )

        # Should not propagate the MaxRetriesExceededError (task logs it)
        submit_etims_invoice_task(etims_invoice.pk)

        mock_retry.assert_called_once()


@pytest.mark.django_db
class TestRetryFailedETIMSInvoices:
    """Tests for retry_failed_etims_invoices periodic task."""

    def test_queues_failed_invoices(self, etims_invoice_failed, mocker):
        mock_delay = mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        count = retry_failed_etims_invoices()

        assert count == 1
        mock_delay.assert_called_once_with(etims_invoice_failed.pk)

    def test_skips_invoices_over_retry_limit(self, etims_invoice_failed, mocker):
        etims_invoice_failed.retry_count = MAX_ETIMS_RETRIES
        etims_invoice_failed.save()

        mock_delay = mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        count = retry_failed_etims_invoices()

        assert count == 0
        mock_delay.assert_not_called()

    def test_skips_non_failed_invoices(self, etims_invoice, mocker):
        """PENDING invoices should not be retried by the periodic task."""
        mock_delay = mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        count = retry_failed_etims_invoices()

        assert count == 0
        mock_delay.assert_not_called()

    def test_returns_zero_when_none_failed(self, mocker):
        mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        count = retry_failed_etims_invoices()
        assert count == 0
