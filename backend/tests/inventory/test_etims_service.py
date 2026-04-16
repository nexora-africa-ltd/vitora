"""
Tests for the KRA eTIMS service layer.

Covers:
- ETIMSClient and MockETIMSClient
- get_etims_client factory
- build_etims_payload
- submit_etims_invoice end-to-end flow
- _map_payment_type
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore

from hmis.apps.inventory.models import ETIMSInvoiceStatus, ETIMSItem
from hmis.apps.inventory.services.etims import (
    ETIMSClient,
    ETIMSResponse,
    MockETIMSClient,
    _map_payment_type,
    build_etims_payload,
    get_etims_client,
    submit_etims_invoice,
)


@pytest.mark.django_db
class TestMockETIMSClient:
    """Tests for MockETIMSClient used in dev/test."""

    def test_submit_invoice_returns_success(self):
        client = MockETIMSClient()
        result = client.submit_invoice({"some": "payload"})

        assert result.success is True
        assert result.receipt_number.startswith("MOCK-")
        assert result.message == "Mock submission successful"
        assert result.raw_data["resultCd"] == "000"

    def test_test_connection_returns_success(self):
        client = MockETIMSClient()
        result = client.test_connection()

        assert result.success is True
        assert result.message == "Mock connection OK"


@pytest.mark.django_db
class TestGetETIMSClientFactory:
    """Tests for the get_etims_client factory function."""

    def test_sandbox_returns_mock(self, etims_config):
        client = get_etims_client(etims_config)
        assert isinstance(client, MockETIMSClient)

    def test_production_returns_real_client(self, etims_config):
        etims_config.environment = "PRODUCTION"
        etims_config.save()
        client = get_etims_client(etims_config)
        assert isinstance(client, ETIMSClient)

    @patch("hmis.apps.inventory.services.etims.settings")
    def test_etims_mock_setting_overrides_production(self, mock_settings, etims_config):
        mock_settings.ETIMS_MOCK = True
        etims_config.environment = "PRODUCTION"
        etims_config.save()
        client = get_etims_client(etims_config)
        assert isinstance(client, MockETIMSClient)


@pytest.mark.django_db
class TestBuildETIMSPayload:
    """Tests for build_etims_payload."""

    def test_builds_valid_payload(self, etims_invoice, etims_config):
        payload = build_etims_payload(etims_invoice)

        assert payload["tin"] == etims_config.tin
        assert payload["bhfId"] == etims_config.bhf_id
        assert payload["invcNo"] == etims_invoice.invoice.invoice_number
        assert payload["rcptTyCd"] == "S"
        assert payload["totItemCnt"] == 2
        assert len(payload["itemList"]) == 2

        # Check first item
        item1 = payload["itemList"][0]
        assert item1["itemSeq"] == 1
        assert item1["itemNm"] == "Consultation Fee"
        assert item1["qty"] == 1.0
        assert item1["prc"] == 1500.0
        assert item1["taxAmt"] == 0.0

        # Check second item
        item2 = payload["itemList"][1]
        assert item2["itemSeq"] == 2
        assert item2["itemNm"] == "Amoxicillin 500mg x 21"
        assert item2["qty"] == 21.0

    def test_builds_correct_totals(self, etims_invoice, etims_config):
        payload = build_etims_payload(etims_invoice)

        assert payload["totAmt"] == float(etims_invoice.invoice.total_amount)
        assert payload["totTaxAmt"] == 0.0

    def test_raises_without_active_config(self, etims_invoice, etims_config):
        etims_config.is_active = False
        etims_config.save()

        with pytest.raises(ValueError, match="No active eTIMS configuration"):
            build_etims_payload(etims_invoice)


class TestMapPaymentType:
    """Tests for _map_payment_type helper."""

    def test_cash_maps_to_01(self):
        assert _map_payment_type("CASH") == "01"

    def test_mpesa_maps_to_04(self):
        assert _map_payment_type("MPESA") == "04"

    def test_insurance_maps_to_05(self):
        assert _map_payment_type("INSURANCE") == "05"

    def test_corporate_maps_to_05(self):
        assert _map_payment_type("CORPORATE") == "05"

    def test_mixed_maps_to_07(self):
        assert _map_payment_type("MIXED") == "07"

    def test_unknown_defaults_to_01(self):
        assert _map_payment_type("UNKNOWN") == "01"


@pytest.mark.django_db
class TestSubmitETIMSInvoice:
    """Tests for the submit_etims_invoice end-to-end function."""

    def test_successful_submission_creates_items(self, etims_invoice, etims_config):
        """With mock client (sandbox), invoice should be confirmed with items."""
        response = submit_etims_invoice(etims_invoice.pk)

        assert response.success is True
        assert response.receipt_number.startswith("MOCK-")

        etims_invoice.refresh_from_db()
        assert etims_invoice.status == ETIMSInvoiceStatus.CONFIRMED
        assert etims_invoice.etims_receipt_number.startswith("MOCK-")
        assert etims_invoice.submitted_at is not None
        assert etims_invoice.confirmed_at is not None

        # Check eTIMS items were created
        items = ETIMSItem.objects.filter(etims_invoice=etims_invoice)
        assert items.count() == 2
        assert items.first().item_name == "Consultation Fee"

    def test_successful_submission_updates_config_last_sync(self, etims_invoice, etims_config):
        submit_etims_invoice(etims_invoice.pk)

        etims_config.refresh_from_db()
        assert etims_config.last_sync_at is not None

    def test_no_config_marks_failed(self, etims_invoice, etims_config):
        etims_config.is_active = False
        etims_config.save()

        response = submit_etims_invoice(etims_invoice.pk)

        assert response.success is False
        etims_invoice.refresh_from_db()
        assert etims_invoice.status == ETIMSInvoiceStatus.FAILED
        assert "No active eTIMS" in etims_invoice.error_message

    @patch("hmis.apps.inventory.services.etims.get_etims_client")
    def test_api_failure_marks_failed(self, mock_get_client, etims_invoice, etims_config):
        mock_client = MagicMock()
        mock_client.submit_invoice.return_value = ETIMSResponse(
            success=False, message="KRA server error"
        )
        mock_get_client.return_value = mock_client

        response = submit_etims_invoice(etims_invoice.pk)

        assert response.success is False
        etims_invoice.refresh_from_db()
        assert etims_invoice.status == ETIMSInvoiceStatus.FAILED
        assert etims_invoice.error_message == "KRA server error"
        assert etims_invoice.retry_count == 1
