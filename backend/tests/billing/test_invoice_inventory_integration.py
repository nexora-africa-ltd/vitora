"""
TDD Tests for Invoice-Inventory Integration.

Sprint 1.5-1.6: Gap Fix
Gap 1: Invoice items should deduct from inventory for pharmacy items.

These tests verify that:
1. Creating an invoice item with a drug deducts stock from inventory
2. Deleting an invoice item restores stock to inventory
3. Invoice items without drugs don't affect inventory
4. Stock validation prevents over-allocation
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
from hmis.apps.pharmacy.models import Drug, StockBatch


@pytest.fixture
def pharmacy_category(db):
    """Create a pharmacy service category."""
    return ServiceCategory.objects.create(
        name="Pharmacy",
        code="PHARM",
        description="Pharmacy dispensing services",
        display_order=10,
    )


@pytest.fixture
def pharmacy_service(db, pharmacy_category, test_user):
    """Create a pharmacy service that links to drugs."""
    return Service.objects.create(
        category=pharmacy_category,
        code="PHARM-DISP",
        name="Drug Dispensing",
        description="Dispensing of drugs",
        unit_price=Decimal("50.00"),
        requires_quantity=True,  # Pharmacy items need quantities
        created_by=test_user,
    )


@pytest.fixture
def test_drug(db):
    """Create a test drug."""
    return Drug.objects.create(
        code="TEST001",
        generic_name="Test Drug",
        strength="100mg",
        form="TABLET",
        category="ANALGESIC",
        schedule="OTC",
        unit="tablet",
        is_essential=True,
        requires_prescription=False,
        default_reorder_level=50,
        default_reorder_quantity=100,
        reference_price=Decimal("15.00"),
    )


@pytest.fixture
def test_stock_batch(db, test_drug, test_user):
    """Create a test stock batch with available inventory."""
    return StockBatch.objects.create(
        drug=test_drug,
        batch_number="INV-TEST-001",
        quantity_received=100,
        quantity_available=100,
        manufacture_date=date.today() - timedelta(days=30),
        expiry_date=date.today() + timedelta(days=365),
        received_date=date.today() - timedelta(days=5),
        cost_price=Decimal("10.00"),
        selling_price=Decimal("15.00"),
        supplier="Test Supplier",
        received_by=test_user,
        status="AVAILABLE",
    )


@pytest.fixture
def test_invoice(db, sample_patient, test_user):
    """Create a test invoice."""
    return Invoice.objects.create(
        patient=sample_patient,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        status=Invoice.Status.DRAFT,
        payment_type=Invoice.PaymentType.CASH,
        created_by=test_user,
    )


@pytest.mark.django_db
class TestInvoiceItemInventoryDeduction:
    """Tests for automatic inventory deduction when invoice items are created."""

    def test_create_invoice_item_with_drug_deducts_stock(
        self, test_invoice, test_drug, test_stock_batch
    ):
        """Creating an invoice item with a drug should deduct from stock batch."""
        initial_stock = test_stock_batch.quantity_available
        quantity_to_bill = 10

        # Create invoice item with drug
        item = InvoiceItem.objects.create(
            invoice=test_invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=test_drug,
            description=f"{test_drug.generic_name} {test_drug.strength}",
            quantity=quantity_to_bill,
            unit_price=test_drug.reference_price,
        )

        # Refresh batch from database
        test_stock_batch.refresh_from_db()

        # Stock should be deducted
        assert test_stock_batch.quantity_available == initial_stock - quantity_to_bill

    def test_create_invoice_item_without_drug_no_stock_change(
        self, test_invoice, pharmacy_service
    ):
        """Creating an invoice item without a drug should not affect inventory."""
        # Create a non-drug invoice item (e.g., consultation)
        item = InvoiceItem.objects.create(
            invoice=test_invoice,
            item_type=InvoiceItem.ItemType.SERVICE,
            service=pharmacy_service,
            description="Consultation",
            quantity=1,
            unit_price=Decimal("500.00"),
        )

        # No stock should be affected (no drug linked)
        assert item.drug is None
        # No error should occur

    def test_delete_invoice_item_restores_stock(
        self, test_invoice, test_drug, test_stock_batch
    ):
        """Deleting an invoice item should restore stock to inventory."""
        initial_stock = test_stock_batch.quantity_available
        quantity_to_bill = 10

        # Create invoice item
        item = InvoiceItem.objects.create(
            invoice=test_invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=test_drug,
            description=f"{test_drug.generic_name} {test_drug.strength}",
            quantity=quantity_to_bill,
            unit_price=test_drug.reference_price,
        )

        # Verify stock was deducted
        test_stock_batch.refresh_from_db()
        assert test_stock_batch.quantity_available == initial_stock - quantity_to_bill

        # Delete the invoice item
        item.delete()

        # Stock should be restored
        test_stock_batch.refresh_from_db()
        assert test_stock_batch.quantity_available == initial_stock

    def test_invoice_item_prevents_over_allocation(
        self, test_invoice, test_drug, test_stock_batch
    ):
        """Creating an invoice item for more than available stock should fail."""
        available = test_stock_batch.quantity_available
        quantity_over = available + 50  # More than available

        with pytest.raises(ValidationError) as exc_info:
            InvoiceItem.objects.create(
                invoice=test_invoice,
                item_type=InvoiceItem.ItemType.PHARMACY,
                drug=test_drug,
                description=f"{test_drug.generic_name} {test_drug.strength}",
                quantity=quantity_over,
                unit_price=test_drug.reference_price,
            )

        assert "insufficient stock" in str(exc_info.value).lower()

    def test_update_invoice_item_quantity_adjusts_stock(
        self, test_invoice, test_drug, test_stock_batch
    ):
        """Updating invoice item quantity should adjust stock accordingly."""
        initial_stock = test_stock_batch.quantity_available
        initial_quantity = 10
        new_quantity = 15

        # Create invoice item
        item = InvoiceItem.objects.create(
            invoice=test_invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=test_drug,
            description=f"{test_drug.generic_name} {test_drug.strength}",
            quantity=initial_quantity,
            unit_price=test_drug.reference_price,
        )

        # Verify initial deduction
        test_stock_batch.refresh_from_db()
        assert test_stock_batch.quantity_available == initial_stock - initial_quantity

        # Update quantity
        item.quantity = new_quantity
        item.save()

        # Stock should reflect new quantity
        test_stock_batch.refresh_from_db()
        assert test_stock_batch.quantity_available == initial_stock - new_quantity

    def test_invoice_item_selects_fefo_batch(self, test_invoice, test_drug, test_user):
        """Invoice item should allocate from batch expiring soonest (FEFO)."""
        # Create two batches with different expiry dates
        batch_expiring_soon = StockBatch.objects.create(
            drug=test_drug,
            batch_number="FEFO-SOON",
            quantity_received=50,
            quantity_available=50,
            manufacture_date=date.today() - timedelta(days=365),
            expiry_date=date.today() + timedelta(days=30),  # Expiring sooner
            received_date=date.today() - timedelta(days=10),
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            received_by=test_user,
            status="AVAILABLE",
        )

        batch_expiring_later = StockBatch.objects.create(
            drug=test_drug,
            batch_number="FEFO-LATER",
            quantity_received=50,
            quantity_available=50,
            manufacture_date=date.today() - timedelta(days=30),
            expiry_date=date.today() + timedelta(days=365),  # Expiring later
            received_date=date.today() - timedelta(days=5),
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            received_by=test_user,
            status="AVAILABLE",
        )

        # Create invoice item
        item = InvoiceItem.objects.create(
            invoice=test_invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=test_drug,
            description=f"{test_drug.generic_name} {test_drug.strength}",
            quantity=10,
            unit_price=test_drug.reference_price,
        )

        # Batch expiring soonest should be deducted first
        batch_expiring_soon.refresh_from_db()
        batch_expiring_later.refresh_from_db()

        assert batch_expiring_soon.quantity_available == 40  # Deducted from this batch
        assert batch_expiring_later.quantity_available == 50  # Untouched

    def test_invoice_item_tracks_stock_allocation(
        self, test_invoice, test_drug, test_stock_batch
    ):
        """Invoice item should track which batch stock was allocated from."""
        item = InvoiceItem.objects.create(
            invoice=test_invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=test_drug,
            description=f"{test_drug.generic_name} {test_drug.strength}",
            quantity=10,
            unit_price=test_drug.reference_price,
        )

        # Item should have a reference to stock batch and allocation amount
        assert item.stock_batch is not None
        assert item.stock_allocated == 10


@pytest.mark.django_db
class TestInvoiceItemStockValidation:
    """Tests for stock validation in invoice items."""

    def test_invoice_item_fails_for_expired_batch_only(
        self, test_invoice, test_drug, test_user
    ):
        """Should fail if only available batch is expired."""
        # Create only an expired batch
        expired_batch = StockBatch.objects.create(
            drug=test_drug,
            batch_number="EXPIRED-001",
            quantity_received=100,
            quantity_available=100,
            manufacture_date=date.today() - timedelta(days=730),
            expiry_date=date.today() - timedelta(days=10),  # Already expired
            received_date=date.today() - timedelta(days=700),
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            received_by=test_user,
            status="EXPIRED",
        )

        with pytest.raises(ValidationError) as exc_info:
            InvoiceItem.objects.create(
                invoice=test_invoice,
                item_type=InvoiceItem.ItemType.PHARMACY,
                drug=test_drug,
                description=f"{test_drug.generic_name} {test_drug.strength}",
                quantity=10,
                unit_price=test_drug.reference_price,
            )

        # Check that validation error is raised for insufficient stock
        assert "insufficient stock" in str(exc_info.value).lower()

    def test_invoice_item_skips_expired_batches(
        self, test_invoice, test_drug, test_user
    ):
        """Should skip expired batches and use available ones."""
        # Create an expired batch
        expired_batch = StockBatch.objects.create(
            drug=test_drug,
            batch_number="EXPIRED-002",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() - timedelta(days=10),
            received_date=date.today() - timedelta(days=700),
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            received_by=test_user,
            status="EXPIRED",
        )

        # Create a valid batch
        valid_batch = StockBatch.objects.create(
            drug=test_drug,
            batch_number="VALID-002",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today() - timedelta(days=10),
            cost_price=Decimal("10.00"),
            selling_price=Decimal("15.00"),
            received_by=test_user,
            status="AVAILABLE",
        )

        # Should succeed and use valid batch
        item = InvoiceItem.objects.create(
            invoice=test_invoice,
            item_type=InvoiceItem.ItemType.PHARMACY,
            drug=test_drug,
            description=f"{test_drug.generic_name} {test_drug.strength}",
            quantity=10,
            unit_price=test_drug.reference_price,
        )

        valid_batch.refresh_from_db()
        expired_batch.refresh_from_db()

        assert valid_batch.quantity_available == 90  # Deducted from valid batch
        assert expired_batch.quantity_available == 100  # Expired batch untouched
