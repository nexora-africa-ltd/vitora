"""
Tests for KRA eTIMS TIS v2.0 compliance implementation.

Covers:
- Receipt type classification (N/C/T/P) and receipt labels (NS/NC/CS/CC/TS/TC/PS)
- Credit note (NC) creation and submission
- Sequential per-receipt-label counters
- Buyer PIN for B2B transactions
- SCU response parsing and QR code generation
- Electronic Journal (EJ_DATA) submission
- Stock validation before goods submission
- Daily X/Z report generation
- Credit note API endpoint
- Daily report API endpoint
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# ===========================================================================
# Receipt Type / Label Tests
# ===========================================================================


@pytest.mark.django_db
class TestReceiptTypeClassification:
    """Tests for receipt type and label enums on ETIMSInvoice."""

    def test_default_receipt_type_is_normal(self, etims_invoice):
        assert etims_invoice.receipt_type == "N"

    def test_default_transaction_type_is_sale(self, etims_invoice):
        assert etims_invoice.transaction_type == "S"

    def test_default_receipt_label_is_ns(self, etims_invoice):
        assert etims_invoice.receipt_label == "NS"

    def test_credit_note_receipt_label(
        self, db, etims_config, billing_invoice, sample_facility, sample_organization
    ):
        from hmis.apps.inventory.models import ETIMSInvoice

        cn = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
            receipt_type="N",
            transaction_type="NC",
            receipt_label="NC",
        )
        assert cn.receipt_label == "NC"
        assert cn.transaction_type == "NC"

    def test_copy_sale_receipt_label(
        self, db, etims_config, billing_invoice, sample_facility, sample_organization
    ):
        from hmis.apps.inventory.models import ETIMSInvoice

        cs = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
            receipt_type="C",
            transaction_type="S",
            receipt_label="CS",
        )
        assert cs.receipt_label == "CS"


# ===========================================================================
# Sequential Counter Tests
# ===========================================================================


@pytest.mark.django_db
class TestSequentialCounters:
    """Tests for per-receipt-label sequential counters on ETIMSConfig."""

    def test_get_next_receipt_number_ns(self, etims_config):
        n1 = etims_config.get_next_receipt_number("NS")
        assert n1 == 1
        etims_config.refresh_from_db()
        assert etims_config.counter_ns == 1

        n2 = etims_config.get_next_receipt_number("NS")
        assert n2 == 2
        etims_config.refresh_from_db()
        assert etims_config.counter_ns == 2

    def test_get_next_receipt_number_nc(self, etims_config):
        n = etims_config.get_next_receipt_number("NC")
        assert n == 1
        etims_config.refresh_from_db()
        assert etims_config.counter_nc == 1

    def test_counters_are_independent(self, etims_config):
        etims_config.get_next_receipt_number("NS")
        etims_config.get_next_receipt_number("NS")
        etims_config.get_next_receipt_number("NC")

        etims_config.refresh_from_db()
        assert etims_config.counter_ns == 2
        assert etims_config.counter_nc == 1
        assert etims_config.counter_cs == 0

    def test_all_labels_supported(self, etims_config):
        for label in ["NS", "NC", "CS", "CC", "TS", "TC", "PS"]:
            n = etims_config.get_next_receipt_number(label)
            assert n == 1


# ===========================================================================
# Buyer PIN Tests
# ===========================================================================


@pytest.mark.django_db
class TestBuyerPIN:
    """Tests for buyer PIN on ETIMSInvoice."""

    def test_buyer_pin_stored(
        self, db, etims_config, billing_invoice, sample_facility, sample_organization
    ):
        from hmis.apps.inventory.models import ETIMSInvoice

        inv = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
            buyer_pin="A001234567B",
        )
        inv.refresh_from_db()
        assert inv.buyer_pin == "A001234567B"

    def test_buyer_pin_optional(self, etims_invoice):
        assert etims_invoice.buyer_pin == ""


# ===========================================================================
# SCU Response & QR Code Tests
# ===========================================================================


@pytest.mark.django_db
class TestSCUResponseAndQR:
    """Tests for SCU response storage and QR code generation."""

    def test_mark_confirmed_with_scu_data(self, etims_invoice):
        etims_invoice.mark_submitted()
        scu_data = {
            "scu_id": "SDC01234567890",
            "receipt_type_counter": 42,
            "total_counter": 1500,
            "internal_data": "ABCDEF1234567890ABCDEF1234567890",
            "receipt_signature": "1234567890ABCDEF1234567890ABCDEF",
        }
        etims_invoice.mark_confirmed("RCP-TEST-001", scu_data=scu_data)

        etims_invoice.refresh_from_db()
        assert etims_invoice.status == "CONFIRMED"
        assert etims_invoice.scu_id == "SDC01234567890"
        assert etims_invoice.scu_receipt_counter == 42
        assert etims_invoice.scu_total_counter == 1500
        assert etims_invoice.scu_internal_data == "ABCDEF1234567890ABCDEF1234567890"
        assert etims_invoice.scu_receipt_signature == "1234567890ABCDEF1234567890ABCDEF"
        assert etims_invoice.scu_datetime is None  # Only set when scu_datetime key provided

    def test_qr_code_generated_on_confirm_with_scu(self, etims_invoice, etims_config):
        etims_invoice.receipt_type_counter = 5
        etims_invoice.save()
        etims_invoice.mark_submitted()
        scu_data = {
            "scu_id": "SDC01234567890",
            "scu_datetime": timezone.now(),
            "receipt_type_counter": 42,
            "total_counter": 1500,
            "internal_data": "ABCDEF1234567890",
            "receipt_signature": "1234567890ABCDEF",
        }
        etims_invoice.mark_confirmed("RCP-QR-001", scu_data=scu_data)

        etims_invoice.refresh_from_db()
        assert etims_invoice.qr_code_data != ""
        assert "SDC01234567890" in etims_invoice.qr_code_data

    def test_cu_invoice_number_format(self, etims_invoice, etims_config):
        """CU Invoice Number = SCU_ID / receipt_number per §6.23.4."""
        etims_invoice.scu_id = "SDC01234567890"
        etims_invoice.etims_receipt_number = "RCP-FMT-001"
        etims_invoice.save()

        cu_num = etims_invoice.cu_invoice_number
        assert cu_num == "SDC01234567890/RCP-FMT-001"

    def test_cu_invoice_number_empty_without_scu(self, etims_invoice):
        assert etims_invoice.cu_invoice_number == ""

    def test_formatted_internal_data_dash_separated(self, etims_invoice):
        etims_invoice.scu_internal_data = "ABCDEFGH12345678"
        etims_invoice.save()

        result = etims_invoice.formatted_internal_data
        assert "-" in result
        # Each chunk should be 4 chars
        parts = result.split("-")
        assert all(len(p) == 4 for p in parts)

    def test_formatted_receipt_signature_dash_separated(self, etims_invoice):
        etims_invoice.scu_receipt_signature = "1234ABCD5678EFGH"
        etims_invoice.save()

        result = etims_invoice.formatted_receipt_signature
        assert "-" in result


# ===========================================================================
# Build Payload Tests (v2 compliance)
# ===========================================================================


@pytest.mark.django_db
class TestBuildPayloadV2:
    """Tests for the v2 payload builder compliance."""

    def test_payload_contains_receipt_label(self, etims_invoice, etims_config):
        from hmis.apps.inventory.services.etims import build_etims_payload

        payload = build_etims_payload(etims_invoice)
        assert payload["rcptTyCd"] == "NS"

    def test_payload_credit_note_has_negative_amounts(
        self, db, etims_config, billing_invoice, sample_facility, sample_organization
    ):
        from hmis.apps.inventory.models import ETIMSInvoice
        from hmis.apps.inventory.services.etims import build_etims_payload

        cn = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
            transaction_type="NC",
            receipt_label="NC",
        )
        payload = build_etims_payload(cn)

        assert payload["rcptTyCd"] == "NC"
        # Credit note items should have negative amounts
        item = payload["itemList"][0]
        assert item["totAmt"] < 0

    def test_payload_includes_buyer_pin(
        self, db, etims_config, billing_invoice, sample_facility, sample_organization
    ):
        from hmis.apps.inventory.models import ETIMSInvoice
        from hmis.apps.inventory.services.etims import build_etims_payload

        inv = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
            buyer_pin="A001234567B",
        )
        payload = build_etims_payload(inv)
        assert payload["custTin"] == "A001234567B"

    def test_payload_has_five_tax_slots(self, etims_invoice, etims_config):
        from hmis.apps.inventory.services.etims import build_etims_payload

        payload = build_etims_payload(etims_invoice)
        # Should have tax slots A through E
        for slot in ["A", "B", "C", "D", "E"]:
            assert f"taxblAmt{slot}" in payload
            assert f"taxAmt{slot}" in payload

    def test_payload_items_have_tax_type_code(self, etims_invoice, etims_config):
        from hmis.apps.inventory.services.etims import build_etims_payload

        payload = build_etims_payload(etims_invoice)
        for item in payload["itemList"]:
            assert "taxTyCd" in item
            assert item["taxTyCd"] in ("A", "B", "C", "D", "E")

    def test_payload_credit_note_includes_original_reference(
        self, db, etims_config, billing_invoice, sample_facility, sample_organization
    ):
        from hmis.apps.inventory.models import ETIMSInvoice
        from hmis.apps.inventory.services.etims import build_etims_payload

        # Original confirmed invoice with SCU data
        original = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
        )
        original.mark_submitted()
        original.scu_id = "SDC01234567890"
        original.etims_receipt_number = "RCP-ORIG-001"
        original.receipt_type_counter = 3
        original.save()
        original.mark_confirmed("RCP-ORIG-001")

        # Credit note referencing original
        cn = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
            transaction_type="NC",
            receipt_label="NC",
            original_etims_invoice=original,
            original_cu_invoice_number=original.cu_invoice_number,
        )
        payload = build_etims_payload(cn)
        assert payload.get("orgInvcNo") is not None


# ===========================================================================
# Stock Validation Tests
# ===========================================================================


@pytest.mark.django_db
class TestStockValidation:
    """Tests for stock validation before eTIMS goods submission (§6.29)."""

    def test_validate_stock_empty_for_services(self, billing_invoice):
        from hmis.apps.inventory.services.etims import validate_stock_for_submission

        # billing_invoice has service items only (no item_type = pharmacy)
        errors = validate_stock_for_submission(billing_invoice)
        assert errors == []


# ===========================================================================
# Electronic Journal Tests
# ===========================================================================


@pytest.mark.django_db
class TestElectronicJournal:
    """Tests for EJ_DATA submission (§5.5)."""

    def test_ej_data_only_for_ns_nc(self, etims_invoice, etims_config):
        from hmis.apps.inventory.services.etims import submit_ej_data

        # Non-NS/NC labels should skip
        etims_invoice.receipt_label = "CS"
        etims_invoice.save()
        result = submit_ej_data(etims_invoice, None, etims_config)
        assert result is True  # Skipped successfully

    @patch("hmis.apps.inventory.services.etims.requests.post")
    def test_ej_data_submitted_for_ns(self, mock_post, etims_invoice, etims_config):
        from hmis.apps.inventory.services.etims import submit_ej_data

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"resultCd": "000", "resultMsg": "OK"}
        mock_post.return_value = mock_resp

        etims_invoice.receipt_label = "NS"
        etims_invoice.etims_receipt_number = "RCP-EJ-001"
        etims_invoice.save()

        result = submit_ej_data(etims_invoice, None, etims_config)
        assert result is True

        etims_invoice.refresh_from_db()
        assert etims_invoice.ej_data_sent is True
        mock_post.assert_called_once()

    @patch("hmis.apps.inventory.services.etims.requests.post")
    def test_ej_data_failure_returns_false(self, mock_post, etims_invoice, etims_config):
        from hmis.apps.inventory.services.etims import submit_ej_data

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_post.return_value = mock_resp

        etims_invoice.receipt_label = "NS"
        etims_invoice.etims_receipt_number = "RCP-EJ-002"
        etims_invoice.save()

        result = submit_ej_data(etims_invoice, None, etims_config)
        assert result is False


# ===========================================================================
# Daily Report Generation Tests
# ===========================================================================


@pytest.mark.django_db
class TestDailyReportGeneration:
    """Tests for X/Z daily report generation."""

    def test_generate_z_report_empty(self, sample_facility):
        from hmis.apps.inventory.services.etims import generate_daily_report

        report = generate_daily_report(
            facility_id=sample_facility.pk,
            report_type="Z",
            report_date=date.today(),
        )
        assert report.report_type == "Z"
        assert report.report_date == date.today()
        assert report.report_number == 1
        assert report.total_ns_amount == 0
        assert report.total_nc_amount == 0

    def test_generate_x_report(self, sample_facility, test_user):
        from hmis.apps.inventory.services.etims import generate_daily_report

        report = generate_daily_report(
            facility_id=sample_facility.pk,
            report_type="X",
            user=test_user,
        )
        assert report.report_type == "X"
        assert report.generated_by == test_user

    def test_report_numbers_increment(self, sample_facility):
        from hmis.apps.inventory.services.etims import generate_daily_report

        r1 = generate_daily_report(sample_facility.pk, "Z", date.today())
        r2 = generate_daily_report(sample_facility.pk, "Z", date.today())
        assert r1.report_number == 1
        assert r2.report_number == 2

    def test_x_and_z_counters_independent(self, sample_facility):
        from hmis.apps.inventory.services.etims import generate_daily_report

        z = generate_daily_report(sample_facility.pk, "Z")
        x = generate_daily_report(sample_facility.pk, "X")
        assert z.report_number == 1
        assert x.report_number == 1

    def test_z_report_aggregates_confirmed_invoices(
        self,
        db,
        etims_config,
        billing_invoice,
        sample_facility,
        sample_organization,
    ):
        from hmis.apps.inventory.models import ETIMSInvoice
        from hmis.apps.inventory.services.etims import generate_daily_report

        # Create and confirm an invoice
        inv = ETIMSInvoice.objects.create(
            invoice=billing_invoice,
            facility=sample_facility,
            organization=sample_organization,
            receipt_label="NS",
        )
        inv.mark_submitted()
        inv.mark_confirmed("RCP-Z-001")
        inv.refresh_from_db()

        report = generate_daily_report(sample_facility.pk, "Z", date.today())
        # At least 1 confirmed NS invoice in this period
        assert report.total_ns_count >= 1
        assert report.total_ns_amount > 0


# ===========================================================================
# Credit Note API Tests
# ===========================================================================


@pytest.mark.django_db
class TestCreditNoteAPI:
    """Tests for POST /api/inventory/etims-invoices/{id}/credit-note/."""

    URL = "/api/inventory/etims-invoices/"

    def test_credit_note_from_confirmed_invoice(self, authenticated_client, etims_invoice, mocker):
        from hmis.apps.inventory.models import ETIMSItem

        # Add items and confirm
        ETIMSItem.objects.create(
            etims_invoice=etims_invoice,
            item_code="HS001",
            item_name="Consultation",
            quantity=1,
            unit_price=Decimal("1500.00"),
            total=Decimal("1500.00"),
        )
        etims_invoice.mark_submitted()
        etims_invoice.mark_confirmed("RCP-CN-001")

        mock_delay = mocker.patch("hmis.apps.inventory.tasks.submit_etims_invoice_task.delay")
        response = authenticated_client.post(
            f"{self.URL}{etims_invoice.pk}/credit-note/",
            {"reason": "Patient overcharged"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["transaction_type"] == "NC"
        assert response.data["receipt_label"] == "NC"
        assert response.data["original_etims_invoice"] == etims_invoice.pk
        mock_delay.assert_called_once()

    def test_credit_note_rejected_for_pending(self, authenticated_client, etims_invoice):
        response = authenticated_client.post(
            f"{self.URL}{etims_invoice.pk}/credit-note/",
            {"reason": "Some reason"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "CONFIRMED" in response.data["error"]

    def test_credit_note_rejected_for_existing_cn(self, authenticated_client, etims_invoice):
        etims_invoice.transaction_type = "NC"
        etims_invoice.status = "CONFIRMED"
        etims_invoice.save()

        response = authenticated_client.post(
            f"{self.URL}{etims_invoice.pk}/credit-note/",
            {"reason": "Double credit"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "credit note" in response.data["error"].lower()

    def test_credit_note_requires_reason(self, authenticated_client, etims_invoice):
        etims_invoice.mark_submitted()
        etims_invoice.mark_confirmed("RCP-CN-002")

        response = authenticated_client.post(
            f"{self.URL}{etims_invoice.pk}/credit-note/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ===========================================================================
# Daily Report API Tests
# ===========================================================================


@pytest.mark.django_db
class TestDailyReportAPI:
    """Tests for /api/inventory/etims-daily-reports/ endpoints."""

    URL = "/api/inventory/etims-daily-reports/"

    def test_generate_z_report(self, authenticated_client, etims_config):
        response = authenticated_client.post(
            f"{self.URL}generate/",
            {"report_type": "Z"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["report_type"] == "Z"
        assert response.data["report_number"] == 1
        assert "total_ns_amount" in response.data
        assert "total_nc_amount" in response.data
        assert "payment_cash" in response.data

    def test_generate_x_report(self, authenticated_client, etims_config):
        response = authenticated_client.post(
            f"{self.URL}generate/",
            {"report_type": "X"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["report_type"] == "X"

    def test_generate_with_date(self, authenticated_client, etims_config):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        response = authenticated_client.post(
            f"{self.URL}generate/",
            {"report_type": "Z", "report_date": yesterday},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["report_date"] == yesterday

    def test_generate_invalid_type_rejected(self, authenticated_client, etims_config):
        response = authenticated_client.post(
            f"{self.URL}generate/",
            {"report_type": "Y"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_reports(self, authenticated_client, etims_config):
        # Generate a report first
        authenticated_client.post(
            f"{self.URL}generate/",
            {"report_type": "Z"},
            format="json",
        )

        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ===========================================================================
# Serializer Validation Tests
# ===========================================================================


@pytest.mark.django_db
class TestETIMSInvoiceCreateSerializerV2:
    """Tests for the updated ETIMSInvoiceCreateSerializer."""

    URL = "/api/inventory/etims-invoices/"

    def test_create_with_receipt_type(self, authenticated_client, billing_invoice):
        data = {
            "invoice": billing_invoice.pk,
            "receipt_type": "C",
            "transaction_type": "S",
        }
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["receipt_type"] == "C"
        assert response.data["receipt_label"] == "CS"

    def test_auto_derives_receipt_label(self, authenticated_client, billing_invoice):
        data = {
            "invoice": billing_invoice.pk,
            "receipt_type": "T",
            "transaction_type": "S",
        }
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["receipt_label"] == "TS"

    def test_credit_note_requires_reference(self, authenticated_client, billing_invoice):
        data = {
            "invoice": billing_invoice.pk,
            "transaction_type": "NC",
        }
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_credit_note_with_original_invoice_number(self, authenticated_client, billing_invoice):
        data = {
            "invoice": billing_invoice.pk,
            "transaction_type": "NC",
            "original_cu_invoice_number": "P000111222A-00-NS-0001",
        }
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["original_cu_invoice_number"] == "P000111222A-00-NS-0001"

    def test_create_with_buyer_pin(self, authenticated_client, billing_invoice):
        data = {
            "invoice": billing_invoice.pk,
            "buyer_pin": "A001234567B",
        }
        response = authenticated_client.post(self.URL, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["buyer_pin"] == "A001234567B"

    def test_response_includes_scu_fields(self, authenticated_client, etims_invoice):
        response = authenticated_client.get(f"{self.URL}{etims_invoice.pk}/")

        assert response.status_code == status.HTTP_200_OK
        assert "scu_id" in response.data
        assert "scu_datetime" in response.data
        assert "cu_invoice_number" in response.data
        assert "qr_code_data" in response.data
        assert "ej_data_sent" in response.data
        assert "formatted_internal_data" in response.data
        assert "formatted_receipt_signature" in response.data
