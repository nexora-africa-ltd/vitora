"""
Tests for Invoice API endpoints.

Following TDD principles - these tests are written BEFORE implementation.
Reference: Deliverables spec § 8, lines 847-889
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.billing.models import Invoice, InvoiceItem, InvoicePayer
from hmis.apps.procedures.models import ProcedureCatalog
from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    """Provide REST framework API client."""
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, test_user, sample_organization, sample_facility):
    """Provide authenticated API client."""
    ensure_staff_profile(test_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=test_user)
    return api_client


class TestInvoiceAPIEndpoints:
    """Test Invoice API CRUD operations."""

    def test_list_invoices_authenticated(self, authenticated_client, sample_invoice):
        """Test GET /api/billing/invoices/ - List invoices with pagination."""
        response = authenticated_client.get("/api/billing/invoices/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data or isinstance(response.data, list)

    def test_list_invoices_unauthenticated_fails(self, api_client):
        """Test unauthenticated access is rejected."""
        response = api_client.get("/api/billing/invoices/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_invoices_filter_by_status(self, authenticated_client, sample_invoice):
        """Test filtering invoices by status (pending, paid, etc)."""
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()

        response = authenticated_client.get(
            f"/api/billing/invoices/?status={Invoice.Status.PENDING}"
        )

        assert response.status_code == status.HTTP_200_OK

    def test_list_invoices_filter_by_patient(
        self, authenticated_client, sample_invoice, sample_patient
    ):
        """Test filtering invoices by patient ID."""
        response = authenticated_client.get(f"/api/billing/invoices/?patient={sample_patient.id}")

        assert response.status_code == status.HTTP_200_OK

    def test_create_invoice_with_patient(self, authenticated_client, sample_patient):
        """Test POST /api/billing/invoices/ - Create invoice with patient."""
        data = {"patient": sample_patient.id, "notes": "Test invoice"}

        response = authenticated_client.post("/api/billing/invoices/", data)

        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["patient"] == sample_patient.id
        assert "invoice_number" in response.data
        assert response.data["invoice_number"].startswith("INV-")

    def test_create_invoice_with_encounter(
        self, authenticated_client, sample_patient, sample_encounter
    ):
        """Test creating invoice linked to encounter."""
        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "notes": "Consultation invoice",
        }

        response = authenticated_client.post("/api/billing/invoices/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["encounter"] == sample_encounter.id

    def test_get_invoice_detail(self, authenticated_client, sample_invoice):
        """Test GET /api/billing/invoices/{id}/ - Get full invoice with items."""
        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_invoice.id
        assert response.data["public_id"] == str(sample_invoice.public_id)
        assert "items" in response.data or "invoice_items" in response.data

    def test_get_invoice_detail_includes_payer_credit_breakdown(
        self, authenticated_client, sample_invoice
    ):
        """Invoice detail should expose gross and payer-net payable totals."""
        sample_invoice.total_amount = Decimal("15000.00")
        sample_invoice.amount_paid = Decimal("0.00")
        sample_invoice.save(update_fields=["total_amount", "amount_paid", "updated_at"])

        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.SHA,
            approved_amount=Decimal("3360.00"),
        )

        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["gross_total"] == "15000.00"
        assert response.data["sha_credit_amount"] == "3360.00"
        assert response.data["insurance_credit_amount"] == "0.00"
        assert response.data["payer_credit_total"] == "3360.00"
        assert response.data["patient_copay_amount"] == "0.00"
        assert response.data["patient_net_due"] == "11640.00"

    def test_get_invoice_detail_uses_insurance_payer_credit_for_private_insurer(
        self, authenticated_client, sample_invoice
    ):
        """Private insurance approved allocation should reduce patient net due."""
        sample_invoice.total_amount = Decimal("15000.00")
        sample_invoice.amount_paid = Decimal("0.00")
        sample_invoice.save(update_fields=["total_amount", "amount_paid", "updated_at"])

        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.PRIVATE_INSURANCE,
            approved_amount=Decimal("3360.00"),
        )

        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["gross_total"] == "15000.00"
        assert response.data["sha_credit_amount"] == "0.00"
        assert response.data["insurance_credit_amount"] == "3360.00"
        assert response.data["payer_credit_total"] == "3360.00"
        assert response.data["patient_copay_amount"] == "0.00"
        assert response.data["patient_net_due"] == "11640.00"

    def test_get_invoice_detail_treats_private_insurance_allocation_as_estimate_only(
        self, authenticated_client, sample_invoice
    ):
        """Private insurer allocated_amount should not reduce payable totals before approval/reserve."""
        sample_invoice.total_amount = Decimal("15000.00")
        sample_invoice.amount_paid = Decimal("0.00")
        sample_invoice.save(update_fields=["total_amount", "amount_paid", "updated_at"])

        InvoicePayer.objects.create(
            invoice=sample_invoice,
            payer_type=InvoicePayer.PayerType.PRIVATE_INSURANCE,
            allocated_amount=Decimal("3360.00"),
            approved_amount=Decimal("0.00"),
        )

        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["gross_total"] == "15000.00"
        assert response.data["insurance_credit_amount"] == "0.00"
        assert response.data["insurance_estimated_allocation"] == "3360.00"
        assert response.data["payer_credit_total"] == "0.00"
        assert response.data["patient_net_due"] == "15000.00"

    def test_get_invoice_detail_falls_back_to_item_allocation_when_claim_copay_missing(
        self, authenticated_client, sample_invoice, sample_service
    ):
        """Line allocations remain estimates until an insurer approves or reserves them."""
        sample_invoice.total_amount = Decimal("1000.00")
        sample_invoice.amount_paid = Decimal("0.00")
        sample_invoice.save(update_fields=["total_amount", "amount_paid", "updated_at"])

        InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=sample_service,
            description="Allocated service",
            quantity=Decimal("1.00"),
            unit_price=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            line_total=Decimal("1000.00"),
            is_covered_by_insurance=True,
            insurance_approved_amount=Decimal("200.00"),
        )

        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["insurance_credit_amount"] == "0.00"
        assert response.data["insurance_estimated_allocation"] == "200.00"
        assert response.data["payer_credit_total"] == "0.00"
        assert response.data["patient_copay_amount"] == "800.00"
        assert response.data["patient_net_due"] == "1000.00"

    def test_get_invoice_detail_by_public_id(self, authenticated_client, sample_invoice):
        """Test GET /api/billing/invoices/{public_id}/ - Get invoice by UUID."""
        response = authenticated_client.get(f"/api/billing/invoices/{sample_invoice.public_id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_invoice.id
        assert response.data["public_id"] == str(sample_invoice.public_id)

    def test_update_draft_invoice(self, authenticated_client, sample_invoice):
        """Test PATCH /api/billing/invoices/{id}/ - Modify draft invoice."""
        sample_invoice.status = Invoice.Status.DRAFT
        sample_invoice.save()

        data = {"notes": "Updated notes"}
        response = authenticated_client.patch(f"/api/billing/invoices/{sample_invoice.id}/", data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["notes"] == "Updated notes"

    def test_update_finalized_invoice_rejected(self, authenticated_client, sample_invoice):
        """Test that finalized invoices cannot be modified."""
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()

        data = {"notes": "Should not update"}
        response = authenticated_client.patch(f"/api/billing/invoices/{sample_invoice.id}/", data)

        # Should reject or return error
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN]

    def test_finalize_invoice(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test POST /api/billing/invoices/{id}/finalize/ - Status change to pending."""
        sample_invoice.status = Invoice.Status.DRAFT
        sample_invoice.save()

        response = authenticated_client.post(f"/api/billing/invoices/{sample_invoice.id}/finalize/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Invoice.Status.PENDING

    def test_cancel_invoice(self, authenticated_client, sample_invoice):
        """Test POST /api/billing/invoices/{id}/cancel/ - Cancel with reason."""
        data = {"reason": "Patient transferred to another facility"}

        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.id}/cancel/", data
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Invoice.Status.CANCELLED

    def test_add_invoice_item(self, authenticated_client, sample_invoice, sample_service):
        """Test POST /api/billing/invoices/{id}/items/ - Add service item."""
        data = {
            "service": sample_service.id,
            "description": sample_service.name,  # Add required description
            "quantity": 1,
            "unit_price": str(sample_service.unit_price),
        }

        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.id}/items/", data
        )

        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["service"] == sample_service.id

    def test_add_invoice_item_uses_service_catalog_price_when_unit_price_missing(
        self, authenticated_client, sample_invoice, sample_service
    ):
        """POST /items should default unit price/description from selected service."""
        data = {
            "service": sample_service.id,
            "quantity": "1.00",
        }

        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.id}/items/", data, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["service"] == sample_service.id
        assert Decimal(response.data["unit_price"]) == sample_service.unit_price
        assert response.data["description"] == sample_service.name

    def test_add_invoice_item_from_procedure_catalog_ref(
        self,
        authenticated_client,
        sample_invoice,
        sample_service,
        sample_facility,
        sample_organization,
    ):
        """POST /items should resolve price from procedure catalog via billing service."""
        procedure = ProcedureCatalog.objects.create(
            code="PROC-APP-001",
            name="Appendectomy",
            category=ProcedureCatalog.Category.SURGICAL,
            body_system=ProcedureCatalog.BodySystem.DIGESTIVE,
            risk_level=ProcedureCatalog.RiskLevel.MEDIUM,
            typical_duration_minutes=60,
            consent_required=True,
            billing_service=sample_service,
            base_fee=Decimal("9000.00"),
            facility=sample_facility,
            organization=sample_organization,
        )
        data = {
            "catalog_ref": {"kind": "procedure_catalog", "id": procedure.id},
            "quantity": "1.00",
        }

        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.id}/items/", data, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["service"] == sample_service.id
        assert Decimal(response.data["unit_price"]) == sample_service.unit_price
        assert response.data["description"] == f"Procedure: {procedure.name}"

    def test_remove_invoice_item(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test DELETE /api/billing/invoices/{id}/items/{item_id}/ - Remove item and recalculate."""
        response = authenticated_client.delete(
            f"/api/billing/invoices/{sample_invoice.id}/items/{sample_invoice_item.id}/"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_create_copay_proforma_from_draft_invoice(self, authenticated_client, sample_invoice):
        """POST create-copay-proforma should create interim PROFORMA invoice."""
        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.id}/create-copay-proforma/",
            {"amount": "800.00", "reason": "Ongoing treatment copay"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == Invoice.Status.PROFORMA
        assert "Interim copay" in (response.data.get("notes") or "")

    def test_finalize_and_apply_copay_applies_interim_payments(
        self,
        authenticated_client,
        sample_invoice,
        sample_invoice_item,
        sample_payment_point,
    ):
        """Finalize-and-apply endpoint should reconcile interim proforma payments."""
        from hmis.apps.billing.models import Payment

        sample_invoice.calculate_totals()
        sample_invoice.status = Invoice.Status.DRAFT
        sample_invoice.save(update_fields=["status", "updated_at"])

        proforma = Invoice.objects.create(
            patient=sample_invoice.patient,
            encounter=sample_invoice.encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=7),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            payer_type=Invoice.PayerType.CASH,
            created_by=sample_invoice.created_by,
            facility=sample_invoice.facility,
            organization=sample_invoice.organization,
            notes=f"Interim copay collection for draft invoice {sample_invoice.invoice_number}",
        )
        proforma_item = sample_invoice_item
        proforma_item.pk = None
        proforma_item.invoice = proforma
        proforma_item.unit_price = Decimal("300.00")
        proforma_item.line_total = Decimal("300.00")
        proforma_item.save()
        proforma.calculate_totals()

        interim_payment = Payment.objects.create(
            invoice=proforma,
            method=Payment.Method.CASH,
            amount=Decimal("300.00"),
            payment_details={"interim_copay": True},
            received_by=sample_invoice.created_by,
        )
        interim_payment.process()

        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.id}/finalize-and-apply-copay/",
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        sample_invoice.refresh_from_db()
        assert sample_invoice.status in {
            Invoice.Status.PENDING,
            Invoice.Status.PARTIAL,
            Invoice.Status.PAID,
        }
        assert sample_invoice.amount_paid >= Decimal("300.00")

    def test_apply_discount(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test POST /api/billing/invoices/{id}/apply-discount/ - Apply discount with reason."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()

        data = {"discount_amount": "50.00", "discount_reason": "Senior citizen discount"}

        response = authenticated_client.post(
            f"/api/billing/invoices/{sample_invoice.id}/apply-discount/", data
        )

        assert response.status_code == status.HTTP_200_OK
        assert Decimal(response.data["discount_amount"]) == Decimal("50.00")

    def test_list_overdue_invoices(self, authenticated_client, sample_invoice):
        """Test GET /api/billing/invoices/overdue/ - Filter overdue invoices."""
        # Make invoice overdue - set both invoice_date and due_date in past
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.invoice_date = date.today() - timedelta(days=40)
        sample_invoice.due_date = date.today() - timedelta(days=10)
        sample_invoice.save()

        response = authenticated_client.get("/api/billing/invoices/overdue/")

        assert response.status_code == status.HTTP_200_OK
