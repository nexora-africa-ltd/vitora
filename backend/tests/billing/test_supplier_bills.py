"""
Tests for Supplier Bills (Accounts Payable) feature.

Covers:
- SupplierBill model CRUD and state transitions
- 3-way matching (PO vs GRN vs invoice)
- SupplierPayment model and partial payment logic
- API endpoints for bills and payments
- Aging summary report
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
from rest_framework import status


@pytest.fixture(autouse=True)
def _grant_billing_permissions(db, test_user):
    """Grant supplier bill/payment permissions to the test user for all tests."""
    perms = Permission.objects.filter(
        codename__in=[
            "add_supplierbill",
            "change_supplierbill",
            "delete_supplierbill",
            "view_supplierbill",
            "approve_supplierbill",
            "add_supplierpayment",
            "change_supplierpayment",
            "delete_supplierpayment",
            "view_supplierpayment",
        ]
    )
    test_user.user_permissions.add(*perms)


@pytest.fixture
def sample_supplier(db, sample_organization):
    """Create a sample supplier for testing."""
    from hmis.apps.inventory.models import Supplier

    return Supplier.objects.create(
        organization=sample_organization,
        code="SUP-001",
        name="Kenya Medical Supplies",
        supplier_type="DISTRIBUTOR",
        payment_terms="Net 30",
        lead_time_days=7,
        tax_pin="P051234567A",
        is_active=True,
    )


@pytest.fixture
def sample_drug(db):
    """Create a sample drug for testing."""
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="DRG-PARA-500",
        generic_name="Paracetamol",
        form="TABLET",
        strength="500mg",
        unit="tablet",
        categories=["ANALGESIC"],
    )


@pytest.fixture
def sample_purchase_order(db, sample_supplier, sample_facility, test_user):
    """Create a sample approved PO."""
    from hmis.apps.inventory.models import PurchaseOrder, PurchaseOrderItem

    po = PurchaseOrder.objects.create(
        supplier=sample_supplier,
        status="APPROVED",
        ordered_by=test_user,
        organization=sample_facility.organization,
        facility=sample_facility,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        drug_id=_get_or_create_drug(sample_facility).pk,
        quantity_ordered=100,
        unit_cost=Decimal("50.00"),
    )
    return po


@pytest.fixture
def sample_grn(db, sample_supplier, sample_facility, sample_purchase_order, test_user):
    """Create a sample confirmed GRN."""
    from hmis.apps.inventory.models import GoodsReceiptNote, GRNItem

    grn = GoodsReceiptNote.objects.create(
        purchase_order=sample_purchase_order,
        supplier=sample_supplier,
        status="CONFIRMED",
        received_by=test_user,
        received_date=date.today(),
        invoice_number="INV-2026-001",
        organization=sample_facility.organization,
        facility=sample_facility,
    )
    GRNItem.objects.create(
        grn=grn,
        drug_id=sample_purchase_order.items.first().drug_id,
        quantity_received=100,
        cost_price=Decimal("50.00"),
        selling_price=Decimal("80.00"),
        batch_number="BATCH-001",
        expiry_date=date.today() + timedelta(days=365),
    )
    return grn


@pytest.fixture
def sample_bill(db, sample_supplier, sample_grn, sample_purchase_order, sample_facility, test_user):
    """Create a sample supplier bill."""
    from hmis.apps.billing.models import SupplierBill

    return SupplierBill.objects.create(
        supplier=sample_supplier,
        grn=sample_grn,
        purchase_order=sample_purchase_order,
        supplier_invoice_number="INV-2026-001",
        amount_invoiced=Decimal("5000.00"),
        tax_amount=Decimal("800.00"),
        bill_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        created_by=test_user,
        organization=sample_facility.organization,
        facility=sample_facility,
    )


def _get_or_create_drug(facility):
    """Helper to get or create a drug for tests."""
    from hmis.apps.pharmacy.models import Drug

    drug, _ = Drug.objects.get_or_create(
        code="DRG-TEST-001",
        defaults={
            "generic_name": "Paracetamol",
            "form": "TABLET",
            "strength": "500mg",
            "unit": "tablet",
            "categories": ["ANALGESIC"],
        },
    )
    return drug


# ===========================================================================
# Model Tests
# ===========================================================================


class TestSupplierBillModel:
    """Tests for SupplierBill model."""

    def test_create_bill(self, sample_bill):
        """Should create a bill with auto-generated bill_number."""
        assert sample_bill.bill_number.startswith("BILL-")
        assert sample_bill.status == "draft"
        assert sample_bill.amount_invoiced == Decimal("5000.00")

    def test_total_amount_includes_tax(self, sample_bill):
        """Total amount should be invoiced + tax."""
        assert sample_bill.total_amount == Decimal("5800.00")

    def test_balance_is_total_minus_paid(self, sample_bill):
        """Balance should be total - amount_paid."""
        assert sample_bill.balance == Decimal("5800.00")
        sample_bill.amount_paid = Decimal("2000.00")
        sample_bill.save()
        assert sample_bill.balance == Decimal("3800.00")

    def test_is_not_overdue_when_due_date_in_future(self, sample_bill):
        """Bill should not be overdue if due_date is in the future."""
        sample_bill.due_date = date.today() + timedelta(days=10)
        sample_bill.save()
        assert sample_bill.is_overdue is False

    def test_is_overdue_when_past_due(self, sample_bill):
        """Bill should be overdue when past due date and not paid."""
        sample_bill.due_date = date.today() - timedelta(days=5)
        sample_bill.save()
        assert sample_bill.is_overdue is True
        assert sample_bill.days_overdue == 5

    def test_not_overdue_when_paid(self, sample_bill):
        """Paid bills are never overdue."""
        sample_bill.due_date = date.today() - timedelta(days=5)
        sample_bill.status = "paid"
        sample_bill.save()
        assert sample_bill.is_overdue is False

    def test_aging_bucket_current(self, sample_bill):
        """Bill with future due_date should be in 'current' bucket."""
        sample_bill.due_date = date.today() + timedelta(days=5)
        sample_bill.save()
        assert sample_bill.aging_bucket == "current"

    def test_aging_bucket_31_60(self, sample_bill):
        """Bill 45 days overdue should be in '31-60' bucket."""
        sample_bill.due_date = date.today() - timedelta(days=45)
        sample_bill.save()
        assert sample_bill.aging_bucket == "31-60"

    def test_aging_bucket_90_plus(self, sample_bill):
        """Bill 100 days overdue should be in '90+' bucket."""
        sample_bill.due_date = date.today() - timedelta(days=100)
        sample_bill.save()
        assert sample_bill.aging_bucket == "90+"


class TestSupplierBillStateTransitions:
    """Tests for SupplierBill state-transition methods."""

    def test_receive_from_draft(self, sample_bill):
        """DRAFT → RECEIVED."""
        sample_bill.receive()
        assert sample_bill.status == "received"
        assert sample_bill.received_date == date.today()

    def test_receive_non_draft_fails(self, sample_bill):
        """Cannot receive a non-DRAFT bill."""
        sample_bill.status = "approved"
        sample_bill.save()
        with pytest.raises(ValidationError):
            sample_bill.receive()

    def test_approve_from_received(self, sample_bill, test_user):
        """RECEIVED → APPROVED."""
        sample_bill.receive()
        sample_bill.approve(test_user)
        assert sample_bill.status == "approved"
        assert sample_bill.approved_by == test_user
        assert sample_bill.approved_at is not None

    def test_approve_non_received_fails(self, sample_bill, test_user):
        """Cannot approve a DRAFT bill."""
        with pytest.raises(ValidationError):
            sample_bill.approve(test_user)

    def test_dispute_from_received(self, sample_bill):
        """RECEIVED → DISPUTED."""
        sample_bill.receive()
        sample_bill.dispute(notes="Quantity mismatch")
        assert sample_bill.status == "disputed"
        assert sample_bill.match_notes == "Quantity mismatch"

    def test_cancel_from_draft(self, sample_bill):
        """DRAFT → CANCELLED."""
        sample_bill.cancel()
        assert sample_bill.status == "cancelled"

    def test_cancel_paid_fails(self, sample_bill):
        """Cannot cancel a PAID bill."""
        sample_bill.status = "paid"
        sample_bill.save()
        with pytest.raises(ValidationError):
            sample_bill.cancel()

    def test_record_payment_partial(self, sample_bill):
        """Partial payment updates status to PARTIALLY_PAID."""
        sample_bill.record_payment(Decimal("2000.00"))
        assert sample_bill.amount_paid == Decimal("2000.00")
        assert sample_bill.status == "partially_paid"

    def test_record_payment_full(self, sample_bill):
        """Full payment updates status to PAID."""
        sample_bill.record_payment(Decimal("5800.00"))
        assert sample_bill.status == "paid"


class TestThreeWayMatching:
    """Tests for 3-way matching logic."""

    def test_match_when_amounts_align(self, sample_bill):
        """Should mark as matched when PO, GRN, and invoice amounts match."""
        # PO total = 100 * 50 = 5000, GRN total = 100 * 50 = 5000
        # Set invoice to match
        sample_bill.amount_invoiced = Decimal("5000.00")
        sample_bill.save()
        result = sample_bill.perform_three_way_match()
        assert result is True
        assert sample_bill.is_matched is True
        assert sample_bill.match_variance == Decimal("0.00")

    def test_match_with_variance(self, sample_bill):
        """Should detect variance when amounts don't align."""
        # PO = 5000, GRN = 5000, invoice = 5200 (variance = 200)
        sample_bill.amount_invoiced = Decimal("5200.00")
        sample_bill.save()
        result = sample_bill.perform_three_way_match()
        assert result is False
        assert sample_bill.is_matched is False
        assert sample_bill.match_variance == Decimal("200.00")

    def test_match_with_custom_tolerance(self, sample_bill):
        """Should accept variance within custom tolerance."""
        sample_bill.amount_invoiced = Decimal("5005.00")
        sample_bill.save()
        result = sample_bill.perform_three_way_match(tolerance=Decimal("10.00"))
        assert result is True
        assert sample_bill.is_matched is True

    def test_match_without_po(self, sample_bill):
        """Should still compare GRN and invoice when no PO."""
        sample_bill.purchase_order = None
        sample_bill.amount_invoiced = Decimal("5000.00")
        sample_bill.save()
        result = sample_bill.perform_three_way_match()
        assert result is True  # GRN = 5000, Invoice = 5000

    def test_match_without_grn_or_po(self, sample_bill):
        """Should not match with only invoice amount (nothing to compare)."""
        sample_bill.purchase_order = None
        sample_bill.grn = None
        sample_bill.save()
        result = sample_bill.perform_three_way_match()
        assert result is False


class TestComputeDueDate:
    """Tests for due_date computation from payment terms."""

    def test_net_30_terms(self, sample_bill):
        """Should compute due_date as bill_date + 30 days."""
        sample_bill.due_date = None
        sample_bill.save()
        sample_bill.compute_due_date()
        sample_bill.refresh_from_db()
        expected = sample_bill.bill_date + timedelta(days=30)
        assert sample_bill.due_date == expected

    def test_does_not_overwrite_existing_due_date(self, sample_bill):
        """Should not overwrite a manually set due_date."""
        original = sample_bill.due_date
        sample_bill.compute_due_date()
        assert sample_bill.due_date == original


# ===========================================================================
# Supplier Payment Model Tests
# ===========================================================================


class TestSupplierPaymentModel:
    """Tests for SupplierPayment model."""

    def test_process_payment(self, sample_bill, test_user, sample_facility):
        """Processing a payment should update bill balance."""
        from hmis.apps.billing.models import SupplierPayment

        sample_bill.status = "approved"
        sample_bill.save()

        payment = SupplierPayment.objects.create(
            bill=sample_bill,
            supplier=sample_bill.supplier,
            method="bank_transfer",
            amount=Decimal("3000.00"),
            paid_by=test_user,
            organization=sample_facility.organization,
            facility=sample_facility,
        )
        payment.process()

        assert payment.status == "completed"
        assert payment.processed_at is not None
        sample_bill.refresh_from_db()
        assert sample_bill.amount_paid == Decimal("3000.00")
        assert sample_bill.status == "partially_paid"

    def test_process_full_payment(self, sample_bill, test_user, sample_facility):
        """Full payment should mark bill as PAID."""
        from hmis.apps.billing.models import SupplierPayment

        sample_bill.status = "approved"
        sample_bill.save()

        payment = SupplierPayment.objects.create(
            bill=sample_bill,
            supplier=sample_bill.supplier,
            method="cheque",
            amount=Decimal("5800.00"),
            paid_by=test_user,
            organization=sample_facility.organization,
            facility=sample_facility,
        )
        payment.process()

        sample_bill.refresh_from_db()
        assert sample_bill.status == "paid"

    def test_reverse_payment(self, sample_bill, test_user, sample_facility):
        """Reversing a payment should deduct from bill amount_paid."""
        from hmis.apps.billing.models import SupplierPayment

        sample_bill.status = "approved"
        sample_bill.save()

        payment = SupplierPayment.objects.create(
            bill=sample_bill,
            supplier=sample_bill.supplier,
            method="mpesa",
            amount=Decimal("2000.00"),
            paid_by=test_user,
            organization=sample_facility.organization,
            facility=sample_facility,
        )
        payment.process()
        payment.reverse(reason="Duplicate payment")

        assert payment.status == "reversed"
        sample_bill.refresh_from_db()
        assert sample_bill.amount_paid == Decimal("0.00")
        assert sample_bill.status == "approved"

    def test_payment_reference_auto_generated(self, sample_bill, test_user, sample_facility):
        """Payment reference should be auto-generated."""
        from hmis.apps.billing.models import SupplierPayment

        payment = SupplierPayment.objects.create(
            bill=sample_bill,
            supplier=sample_bill.supplier,
            method="cash",
            amount=Decimal("100.00"),
            paid_by=test_user,
            organization=sample_facility.organization,
            facility=sample_facility,
        )
        assert payment.payment_reference.startswith("SPAY-")


# ===========================================================================
# API Tests
# ===========================================================================


class TestSupplierBillAPI:
    """Tests for SupplierBill API endpoints."""

    def test_list_bills(self, authenticated_client, sample_bill):
        """Should list supplier bills."""
        response = authenticated_client.get("/api/billing/supplier-bills/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_bill(self, authenticated_client, sample_supplier, sample_grn, sample_facility):
        """Should create a new bill via API."""
        data = {
            "supplier": sample_supplier.id,
            "grn": sample_grn.id,
            "supplier_invoice_number": "INV-NEW-001",
            "amount_invoiced": "7500.00",
            "tax_amount": "1200.00",
            "bill_date": str(date.today()),
        }
        response = authenticated_client.post("/api/billing/supplier-bills/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["bill_number"].startswith("BILL-")
        assert response.data["status"] == "draft"

    def test_create_bill_mismatched_supplier_grn_fails(
        self, authenticated_client, sample_grn, sample_facility
    ):
        """Should reject bill when GRN supplier doesn't match."""
        from hmis.apps.inventory.models import Supplier

        other_supplier = Supplier.objects.create(
            organization=sample_facility.organization,
            code="SUP-OTHER",
            name="Other Supplier",
        )
        data = {
            "supplier": other_supplier.id,
            "grn": sample_grn.id,
            "amount_invoiced": "5000.00",
        }
        response = authenticated_client.post("/api/billing/supplier-bills/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "grn" in response.data or "GRN supplier" in str(response.data)

    def test_receive_action(self, authenticated_client, sample_bill):
        """Should transition bill to RECEIVED."""
        response = authenticated_client.post(
            f"/api/billing/supplier-bills/{sample_bill.id}/receive/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "received"

    def test_approve_action(self, authenticated_client, sample_bill):
        """Should transition bill to APPROVED."""
        sample_bill.receive()
        response = authenticated_client.post(
            f"/api/billing/supplier-bills/{sample_bill.id}/approve/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "approved"

    def test_dispute_action(self, authenticated_client, sample_bill):
        """Should transition bill to DISPUTED with notes."""
        sample_bill.receive()
        response = authenticated_client.post(
            f"/api/billing/supplier-bills/{sample_bill.id}/dispute/",
            {"notes": "Quantity mismatch on line 2"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "disputed"

    def test_cancel_action(self, authenticated_client, sample_bill):
        """Should cancel a bill."""
        response = authenticated_client.post(
            f"/api/billing/supplier-bills/{sample_bill.id}/cancel/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "cancelled"

    def test_match_action(self, authenticated_client, sample_bill):
        """Should run 3-way matching."""
        sample_bill.amount_invoiced = Decimal("5000.00")
        sample_bill.save()
        response = authenticated_client.post(f"/api/billing/supplier-bills/{sample_bill.id}/match/")
        assert response.status_code == status.HTTP_200_OK
        assert "match_result" in response.data

    def test_aging_summary(self, authenticated_client, sample_bill):
        """Should return aging summary buckets."""
        response = authenticated_client.get("/api/billing/supplier-bills/aging_summary/")
        assert response.status_code == status.HTTP_200_OK
        assert "current" in response.data
        assert "1_30" in response.data
        assert "over_90" in response.data

    def test_filter_by_overdue(self, authenticated_client, sample_bill):
        """Should filter overdue bills."""
        sample_bill.due_date = date.today() - timedelta(days=5)
        sample_bill.save()
        response = authenticated_client.get("/api/billing/supplier-bills/?overdue=true")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_unauthenticated_access_denied(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/billing/supplier-bills/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestSupplierPaymentAPI:
    """Tests for SupplierPayment API endpoints."""

    def test_create_payment(self, authenticated_client, sample_bill):
        """Should create a payment against an approved bill."""
        sample_bill.receive()
        sample_bill.approve(sample_bill.created_by)
        data = {
            "bill": sample_bill.id,
            "supplier": sample_bill.supplier_id,
            "method": "bank_transfer",
            "amount": "3000.00",
            "transaction_reference": "BNK-REF-001",
            "payment_date": str(date.today()),
        }
        response = authenticated_client.post("/api/billing/supplier-payments/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["payment_reference"].startswith("SPAY-")
        assert response.data["status"] == "completed"

    def test_create_payment_unapproved_bill_fails(self, authenticated_client, sample_bill):
        """Should reject payment against a DRAFT bill."""
        data = {
            "bill": sample_bill.id,
            "supplier": sample_bill.supplier_id,
            "method": "cash",
            "amount": "1000.00",
        }
        response = authenticated_client.post("/api/billing/supplier-payments/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_payment_exceeds_balance_fails(self, authenticated_client, sample_bill):
        """Should reject payment exceeding bill balance."""
        sample_bill.receive()
        sample_bill.approve(sample_bill.created_by)
        data = {
            "bill": sample_bill.id,
            "supplier": sample_bill.supplier_id,
            "method": "mpesa",
            "amount": "99999.00",
        }
        response = authenticated_client.post("/api/billing/supplier-payments/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reverse_payment(self, authenticated_client, sample_bill, test_user, sample_facility):
        """Should reverse a completed payment."""
        from hmis.apps.billing.models import SupplierPayment

        sample_bill.receive()
        sample_bill.approve(test_user)

        payment = SupplierPayment.objects.create(
            bill=sample_bill,
            supplier=sample_bill.supplier,
            method="cheque",
            amount=Decimal("2000.00"),
            paid_by=test_user,
            organization=sample_facility.organization,
            facility=sample_facility,
        )
        payment.process()

        response = authenticated_client.post(
            f"/api/billing/supplier-payments/{payment.id}/reverse/",
            {"reason": "Wrong supplier"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "reversed"

    def test_list_payments_filter_by_bill(
        self, authenticated_client, sample_bill, test_user, sample_facility
    ):
        """Should filter payments by bill."""
        from hmis.apps.billing.models import SupplierPayment

        sample_bill.receive()
        sample_bill.approve(test_user)

        SupplierPayment.objects.create(
            bill=sample_bill,
            supplier=sample_bill.supplier,
            method="cash",
            amount=Decimal("1000.00"),
            paid_by=test_user,
            organization=sample_facility.organization,
            facility=sample_facility,
        )
        response = authenticated_client.get(
            f"/api/billing/supplier-payments/?bill={sample_bill.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


# ===========================================================================
# RBAC Permission Tests
# ===========================================================================


class TestSupplierBillRBAC:
    """Tests that RBAC is enforced on supplier bill endpoints."""

    @pytest.fixture(autouse=True)
    def _strip_permissions(self, test_user):
        """Remove all supplier bill permissions from the test user."""
        test_user.user_permissions.clear()

    def test_create_bill_without_permission(
        self, authenticated_client, sample_supplier, sample_grn, sample_facility
    ):
        """Should return 403 when user lacks add_supplierbill permission."""
        data = {
            "supplier": sample_supplier.id,
            "grn": sample_grn.id,
            "supplier_invoice_number": "INV-RBAC-001",
            "amount_invoiced": "5000.00",
            "tax_amount": "800.00",
            "bill_date": str(date.today()),
        }
        response = authenticated_client.post("/api/billing/supplier-bills/", data)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_bill_without_permission(self, authenticated_client, sample_bill):
        """Should return 403 when user lacks delete_supplierbill permission."""
        response = authenticated_client.delete(f"/api/billing/supplier-bills/{sample_bill.id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_approve_bill_without_permission(self, authenticated_client, sample_bill):
        """Should return 403 when user lacks approve_supplierbill permission."""
        sample_bill.receive()
        response = authenticated_client.post(
            f"/api/billing/supplier-bills/{sample_bill.id}/approve/"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_payment_without_permission(self, authenticated_client, sample_bill):
        """Should return 403 when user lacks add_supplierpayment permission."""
        sample_bill.receive()
        sample_bill.approve(sample_bill.created_by)
        data = {
            "bill": sample_bill.id,
            "supplier": sample_bill.supplier_id,
            "method": "cash",
            "amount": "1000.00",
        }
        response = authenticated_client.post("/api/billing/supplier-payments/", data)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_payment_without_permission(
        self, authenticated_client, sample_bill, test_user, sample_facility
    ):
        """Should return 403 when user lacks delete_supplierpayment permission."""
        from hmis.apps.billing.models import SupplierPayment

        sample_bill.receive()
        sample_bill.approve(test_user)

        payment = SupplierPayment.objects.create(
            bill=sample_bill,
            supplier=sample_bill.supplier,
            method="cash",
            amount=Decimal("1000.00"),
            paid_by=test_user,
            organization=sample_facility.organization,
            facility=sample_facility,
        )
        response = authenticated_client.delete(f"/api/billing/supplier-payments/{payment.id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
