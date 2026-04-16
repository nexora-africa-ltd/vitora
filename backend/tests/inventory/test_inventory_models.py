"""
Tests for Inventory models.

Covers:
- Supplier: creation, uniqueness, str
- PurchaseOrder: auto-number, state transitions, computed properties
- PurchaseOrderItem: line total, outstanding quantity
- GoodsReceiptNote: confirm creates StockBatch, updates PO quantities
- GRNItem: line total
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

from hmis.apps.inventory.models import (
    GoodsReceiptNote,
    GRNItem,
    GRNStatus,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    Supplier,
)

pytestmark = pytest.mark.django_db


# ============================================================================
# Supplier
# ============================================================================


class TestSupplierModel:
    """Tests for Supplier model."""

    def test_create_supplier(self, sample_supplier):
        """Should create a supplier with all fields."""
        assert sample_supplier.pk is not None
        assert sample_supplier.code == "SUP-001"
        assert sample_supplier.name == "Kenya Medical Supplies Authority"
        assert sample_supplier.supplier_type == "GOVERNMENT"
        assert sample_supplier.is_active is True

    def test_supplier_str(self, sample_supplier):
        """String representation should show code and name."""
        assert str(sample_supplier) == "SUP-001 - Kenya Medical Supplies Authority"

    def test_unique_code_per_org(self, sample_supplier, sample_organization):
        """Duplicate supplier codes within the same org should fail."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            Supplier.objects.create(
                code="SUP-001",
                name="Duplicate",
                organization=sample_organization,
            )

    def test_supplier_rating_default(self, sample_organization):
        """Default rating should be 0."""
        supplier = Supplier.objects.create(
            code="SUP-RATE",
            name="Test Rating",
            organization=sample_organization,
        )
        assert supplier.rating == Decimal("0")


# ============================================================================
# Purchase Order
# ============================================================================


class TestPurchaseOrderModel:
    """Tests for PurchaseOrder model."""

    def test_create_po(self, sample_purchase_order):
        """Should create a PO with auto-generated number."""
        assert sample_purchase_order.pk is not None
        assert sample_purchase_order.po_number.startswith("PO-")
        assert sample_purchase_order.status == PurchaseOrderStatus.DRAFT
        assert sample_purchase_order.items.count() == 1

    def test_po_str(self, sample_purchase_order):
        """String representation should show PO number and supplier name."""
        assert sample_purchase_order.supplier.name in str(sample_purchase_order)

    def test_po_total_amount(self, sample_purchase_order):
        """Total amount should be sum of item line totals."""
        # 500 * 4.50 = 2250
        assert sample_purchase_order.total_amount == Decimal("2250.00")

    def test_po_submit(self, sample_purchase_order):
        """DRAFT → SUBMITTED."""
        sample_purchase_order.submit()
        assert sample_purchase_order.status == PurchaseOrderStatus.SUBMITTED

    def test_po_submit_requires_items(
        self, sample_supplier, test_user, sample_facility, sample_organization
    ):
        """Cannot submit PO with no items."""
        po = PurchaseOrder.objects.create(
            supplier=sample_supplier,
            ordered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        with pytest.raises(ValidationError, match="no items"):
            po.submit()

    def test_po_submit_requires_draft(self, submitted_purchase_order):
        """Cannot submit an already-submitted PO."""
        with pytest.raises(ValidationError, match="DRAFT"):
            submitted_purchase_order.submit()

    def test_po_approve(self, submitted_purchase_order, test_user):
        """SUBMITTED → APPROVED."""
        submitted_purchase_order.approve(test_user)
        assert submitted_purchase_order.status == PurchaseOrderStatus.APPROVED
        assert submitted_purchase_order.approved_by == test_user
        assert submitted_purchase_order.approved_at is not None

    def test_po_approve_requires_submitted(self, sample_purchase_order, test_user):
        """Cannot approve a DRAFT PO."""
        with pytest.raises(ValidationError, match="SUBMITTED"):
            sample_purchase_order.approve(test_user)

    def test_po_cancel_from_draft(self, sample_purchase_order, test_user):
        """DRAFT → CANCELLED."""
        sample_purchase_order.cancel(test_user, reason="Budget cut")
        assert sample_purchase_order.status == PurchaseOrderStatus.CANCELLED
        assert sample_purchase_order.cancellation_reason == "Budget cut"
        assert sample_purchase_order.cancelled_at is not None

    def test_po_cancel_from_submitted(self, submitted_purchase_order, test_user):
        """SUBMITTED → CANCELLED."""
        submitted_purchase_order.cancel(test_user)
        assert submitted_purchase_order.status == PurchaseOrderStatus.CANCELLED

    def test_po_cancel_from_approved(self, approved_purchase_order, test_user):
        """APPROVED → CANCELLED."""
        approved_purchase_order.cancel(test_user)
        assert approved_purchase_order.status == PurchaseOrderStatus.CANCELLED

    def test_cannot_cancel_received_po(self, approved_purchase_order, test_user):
        """Cannot cancel a RECEIVED PO."""
        approved_purchase_order.status = PurchaseOrderStatus.RECEIVED
        approved_purchase_order.save(update_fields=["status"])
        with pytest.raises(ValidationError, match="cancel"):
            approved_purchase_order.cancel(test_user)

    def test_cannot_cancel_already_cancelled(self, sample_purchase_order, test_user):
        """Cannot cancel an already-cancelled PO."""
        sample_purchase_order.cancel(test_user)
        with pytest.raises(ValidationError, match="cancel"):
            sample_purchase_order.cancel(test_user)

    def test_po_is_fully_received(self, sample_purchase_order):
        """is_fully_received should be False when items are outstanding."""
        assert sample_purchase_order.is_fully_received is False

    def test_po_is_fully_received_true(self, sample_purchase_order):
        """is_fully_received should be True when all items are received."""
        item = sample_purchase_order.items.first()
        item.quantity_received = item.quantity_ordered
        item.save(update_fields=["quantity_received"])
        assert sample_purchase_order.is_fully_received is True


# ============================================================================
# Purchase Order Item
# ============================================================================


class TestPurchaseOrderItemModel:
    """Tests for PurchaseOrderItem model."""

    def test_line_total(self, sample_purchase_order):
        """Line total should be quantity * unit_cost."""
        item = sample_purchase_order.items.first()
        assert item.line_total == Decimal("2250.00")

    def test_outstanding_quantity(self, sample_purchase_order):
        """Outstanding quantity should be ordered - received."""
        item = sample_purchase_order.items.first()
        assert item.outstanding_quantity == 500

    def test_outstanding_quantity_partial(self, sample_purchase_order):
        """Outstanding quantity after partial receipt."""
        item = sample_purchase_order.items.first()
        item.quantity_received = 200
        item.save(update_fields=["quantity_received"])
        assert item.outstanding_quantity == 300

    def test_is_fully_received(self, sample_purchase_order):
        """is_fully_received should be False when outstanding."""
        item = sample_purchase_order.items.first()
        assert item.is_fully_received is False


# ============================================================================
# Goods Receipt Note
# ============================================================================


class TestGoodsReceiptNoteModel:
    """Tests for GoodsReceiptNote and GRNItem models."""

    def test_create_grn(self, sample_grn):
        """Should create a GRN with auto-generated number."""
        assert sample_grn.pk is not None
        assert sample_grn.grn_number.startswith("GRN-")
        assert sample_grn.status == GRNStatus.DRAFT
        assert sample_grn.items.count() == 1

    def test_grn_total_amount(self, sample_grn):
        """Total amount should be sum of item line totals."""
        # 500 * 4.50 = 2250
        assert sample_grn.total_amount == Decimal("2250.00")

    def test_grn_total_items(self, sample_grn):
        """Total items should count GRN items."""
        assert sample_grn.total_items == 1

    def test_grn_confirm_creates_stock_batch(self, sample_grn, test_user):
        """Confirming a GRN should create StockBatch records."""
        from hmis.apps.pharmacy.models import StockBatch

        initial_count = StockBatch.objects.count()
        sample_grn.confirm(user=test_user)

        assert sample_grn.status == GRNStatus.CONFIRMED
        assert sample_grn.confirmed_at is not None
        assert sample_grn.confirmed_by == test_user
        assert StockBatch.objects.count() == initial_count + 1

        # Verify StockBatch details
        batch = StockBatch.objects.latest("id")
        assert batch.drug.code == "INV-AMOX500"
        assert batch.batch_number == "BATCH-AMOX-2026-04"
        assert batch.quantity_received == 500
        assert batch.quantity_available == 500
        assert batch.cost_price == Decimal("4.50")
        assert batch.selling_price == Decimal("8.00")
        assert batch.location == "Shelf A-3"

    def test_grn_confirm_updates_po_quantity(self, sample_grn, test_user):
        """Confirming a GRN should update PO item received quantities."""
        sample_grn.confirm(user=test_user)

        po_item = sample_grn.purchase_order.items.first()
        assert po_item.quantity_received == 500

    def test_grn_confirm_updates_po_status(self, sample_grn, test_user):
        """Confirming a GRN should update PO status to RECEIVED when fully received."""
        sample_grn.confirm(user=test_user)

        sample_grn.purchase_order.refresh_from_db()
        assert sample_grn.purchase_order.status == PurchaseOrderStatus.RECEIVED

    def test_grn_confirm_partial_po(self, sample_grn, test_user, sample_drug):
        """Partial receipt should set PO to PARTIALLY_RECEIVED."""
        # Add a second item to the PO so it won't be fully received
        PurchaseOrderItem.objects.create(
            purchase_order=sample_grn.purchase_order,
            drug=sample_drug,
            quantity_ordered=200,
            unit_cost=Decimal("5.00"),
        )
        sample_grn.confirm(user=test_user)

        sample_grn.purchase_order.refresh_from_db()
        assert sample_grn.purchase_order.status == PurchaseOrderStatus.PARTIALLY_RECEIVED

    def test_grn_confirm_sets_stock_batch_on_item(self, sample_grn, test_user):
        """Confirming a GRN should link GRNItem to the created StockBatch."""
        sample_grn.confirm(user=test_user)

        grn_item = sample_grn.items.first()
        assert grn_item.stock_batch is not None
        assert grn_item.stock_batch.batch_number == "BATCH-AMOX-2026-04"

    def test_grn_confirm_requires_draft(self, sample_grn, test_user):
        """Cannot confirm a non-DRAFT GRN."""
        sample_grn.confirm(user=test_user)
        with pytest.raises(ValidationError, match="DRAFT"):
            sample_grn.confirm(user=test_user)

    def test_grn_confirm_requires_items(
        self, sample_supplier, test_user, sample_facility, sample_organization
    ):
        """Cannot confirm a GRN with no items."""
        grn = GoodsReceiptNote.objects.create(
            supplier=sample_supplier,
            received_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        with pytest.raises(ValidationError, match="no items"):
            grn.confirm(user=test_user)

    def test_grn_cancel(self, sample_grn):
        """DRAFT → CANCELLED."""
        sample_grn.cancel()
        assert sample_grn.status == GRNStatus.CANCELLED

    def test_grn_cancel_requires_draft(self, sample_grn, test_user):
        """Cannot cancel a confirmed GRN."""
        sample_grn.confirm(user=test_user)
        with pytest.raises(ValidationError, match="DRAFT"):
            sample_grn.cancel()


class TestGRNItemModel:
    """Tests for GRNItem model."""

    def test_grn_item_line_total(self, sample_grn):
        """Line total should be quantity_received * cost_price."""
        item = sample_grn.items.first()
        assert item.line_total == Decimal("2250.00")

    def test_grn_item_str(self, sample_grn):
        """String representation should include drug name and batch."""
        item = sample_grn.items.first()
        assert "Amoxicillin" in str(item)
        assert "BATCH-AMOX-2026-04" in str(item)
