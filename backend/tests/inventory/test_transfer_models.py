"""
Tests for Phase 2: Multi-Store Stock Transfer models.

Covers:
- StoreLocation creation and constraints
- StockTransfer auto-number generation
- Full transfer lifecycle: DRAFT → REQUESTED → APPROVED → IN_TRANSIT → RECEIVED
- Stock deduction on dispatch, stock creation on receive
- Cancellation rules
- Validation (insufficient stock, wrong status transitions)
"""

from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# StoreLocation
# ---------------------------------------------------------------------------


class TestStoreLocation:
    """Tests for StoreLocation model."""

    def test_create_store_location(self, main_store):
        """Should create a store location with code and type."""
        assert main_store.code == "STORE-MAIN"
        assert main_store.location_type == "MAIN_STORE"
        assert main_store.is_active is True

    def test_unique_code_per_facility(self, main_store, sample_facility, sample_organization):
        """Should enforce unique store code within a facility."""
        from django.db import IntegrityError

        from hmis.apps.inventory.models import StoreLocation

        with pytest.raises(IntegrityError):
            StoreLocation.objects.create(
                code="STORE-MAIN",
                name="Duplicate Store",
                location_type="SATELLITE_PHARMACY",
                facility=sample_facility,
                organization=sample_organization,
            )

    def test_same_code_different_facility(self, main_store, second_facility, sample_organization):
        """Should allow same code at different facilities."""
        from hmis.apps.inventory.models import StoreLocation

        store = StoreLocation.objects.create(
            code="STORE-MAIN",
            name="Branch Main Store",
            location_type="MAIN_STORE",
            facility=second_facility,
            organization=sample_organization,
        )
        assert store.pk is not None

    def test_str_representation(self, main_store):
        assert str(main_store) == "STORE-MAIN - Main Pharmacy Store"


# ---------------------------------------------------------------------------
# StockTransfer — Auto-number
# ---------------------------------------------------------------------------


class TestTransferAutoNumber:
    """Tests for transfer number auto-generation."""

    def test_auto_number_format(self, sample_transfer):
        """Transfer number should follow TRF-YYYYMMDD-XXXX format."""
        assert sample_transfer.transfer_number.startswith("TRF-")
        parts = sample_transfer.transfer_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # sequence

    def test_sequential_numbers(
        self,
        sample_transfer,
        sample_facility,
        second_facility,
        sample_organization,
        test_user,
    ):
        """Sequential transfers should get incrementing numbers."""
        from hmis.apps.inventory.models import StockTransfer

        transfer2 = StockTransfer.objects.create(
            source_facility=sample_facility,
            destination_facility=second_facility,
            requested_by=test_user,
            organization=sample_organization,
        )
        # Both start with same date prefix
        prefix = sample_transfer.transfer_number[:13]  # TRF-YYYYMMDD-
        assert transfer2.transfer_number.startswith(prefix)
        seq1 = int(sample_transfer.transfer_number.split("-")[-1])
        seq2 = int(transfer2.transfer_number.split("-")[-1])
        assert seq2 == seq1 + 1


# ---------------------------------------------------------------------------
# StockTransfer — Lifecycle
# ---------------------------------------------------------------------------


class TestTransferLifecycle:
    """Tests for the full transfer state machine."""

    def test_initial_status_is_draft(self, sample_transfer):
        assert sample_transfer.status == "DRAFT"

    def test_submit_draft_to_requested(self, sample_transfer):
        """DRAFT → REQUESTED."""
        sample_transfer.submit()
        assert sample_transfer.status == "REQUESTED"

    def test_submit_without_items_fails(
        self, sample_facility, second_facility, sample_organization, test_user
    ):
        """Cannot submit a transfer with no items."""
        from hmis.apps.inventory.models import StockTransfer

        transfer = StockTransfer.objects.create(
            source_facility=sample_facility,
            destination_facility=second_facility,
            requested_by=test_user,
            organization=sample_organization,
        )
        with pytest.raises(ValidationError, match="no items"):
            transfer.submit()

    def test_submit_non_draft_fails(self, submitted_transfer):
        """Cannot submit a transfer that's already submitted."""
        with pytest.raises(ValidationError, match="Only DRAFT"):
            submitted_transfer.submit()

    def test_approve_requested_to_approved(self, submitted_transfer, test_user):
        """REQUESTED → APPROVED."""
        submitted_transfer.approve(test_user)
        assert submitted_transfer.status == "APPROVED"
        assert submitted_transfer.approved_by == test_user
        assert submitted_transfer.approved_at is not None

    def test_approve_non_requested_fails(self, sample_transfer, test_user):
        """Cannot approve a DRAFT transfer."""
        with pytest.raises(ValidationError, match="Only REQUESTED"):
            sample_transfer.approve(test_user)

    def test_dispatch_approved_to_in_transit(self, approved_transfer, test_user):
        """APPROVED → IN_TRANSIT. Should deduct source stock."""
        source_batch = approved_transfer.items.first().source_batch
        initial_available = source_batch.quantity_available

        approved_transfer.dispatch(test_user)

        assert approved_transfer.status == "IN_TRANSIT"
        assert approved_transfer.dispatched_by == test_user
        assert approved_transfer.dispatched_at is not None

        # Stock should be deducted
        source_batch.refresh_from_db()
        item = approved_transfer.items.first()
        assert source_batch.quantity_available == initial_available - item.quantity_dispatched

    def test_dispatch_sets_quantity_dispatched(self, approved_transfer, test_user):
        """Dispatch should set quantity_dispatched = quantity_requested when not pre-set."""
        item = approved_transfer.items.first()
        assert item.quantity_dispatched == 0

        approved_transfer.dispatch(test_user)

        item.refresh_from_db()
        assert item.quantity_dispatched == item.quantity_requested

    def test_dispatch_creates_stock_adjustment(self, approved_transfer, test_user):
        """Dispatch should create TRANSFER_OUT StockAdjustment records."""
        from hmis.apps.pharmacy.models import StockAdjustment

        initial_count = StockAdjustment.objects.count()
        approved_transfer.dispatch(test_user)

        assert StockAdjustment.objects.count() == initial_count + 1
        adj = StockAdjustment.objects.latest("adjusted_at")
        assert adj.adjustment_type == "TRANSFER_OUT"
        assert adj.quantity < 0  # Negative = deduction
        assert approved_transfer.transfer_number in adj.reference_number

    def test_dispatch_insufficient_stock_fails(
        self,
        sample_facility,
        second_facility,
        sample_organization,
        test_user,
        sample_drug,
    ):
        """Dispatch should fail if source batch has insufficient stock."""
        from hmis.apps.inventory.models import StockTransfer, TransferItem
        from hmis.apps.pharmacy.models import StockBatch

        batch = StockBatch.objects.create(
            drug=sample_drug,
            batch_number="LOW-BATCH",
            quantity_received=10,
            quantity_available=5,
            expiry_date="2027-12-31",
            received_date="2026-01-01",
            cost_price=Decimal("4.00"),
            selling_price=Decimal("7.00"),
            received_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        transfer = StockTransfer.objects.create(
            source_facility=sample_facility,
            destination_facility=second_facility,
            requested_by=test_user,
            organization=sample_organization,
        )
        TransferItem.objects.create(
            transfer=transfer,
            drug=sample_drug,
            source_batch=batch,
            quantity_requested=100,
        )
        transfer.submit()
        transfer.approve(test_user)

        with pytest.raises(ValidationError, match="Insufficient stock"):
            transfer.dispatch(test_user)

    def test_dispatch_non_approved_fails(self, submitted_transfer, test_user):
        """Cannot dispatch a REQUESTED transfer (must be APPROVED first)."""
        with pytest.raises(ValidationError, match="Only APPROVED"):
            submitted_transfer.dispatch(test_user)

    def test_receive_in_transit_to_received(self, dispatched_transfer, test_user):
        """IN_TRANSIT → RECEIVED. Should create stock at destination."""
        dispatched_transfer.receive(test_user)

        assert dispatched_transfer.status == "RECEIVED"
        assert dispatched_transfer.received_by == test_user
        assert dispatched_transfer.received_at is not None

        item = dispatched_transfer.items.first()
        assert item.destination_batch is not None
        assert item.destination_batch.facility == dispatched_transfer.destination_facility
        assert item.destination_batch.quantity_available == item.quantity_dispatched

    def test_receive_creates_stock_batch_at_destination(self, dispatched_transfer, test_user):
        """Receive should create a StockBatch at the destination facility."""
        from hmis.apps.pharmacy.models import StockBatch

        initial_count = StockBatch.objects.filter(
            facility=dispatched_transfer.destination_facility
        ).count()

        dispatched_transfer.receive(test_user)

        new_count = StockBatch.objects.filter(
            facility=dispatched_transfer.destination_facility
        ).count()
        assert new_count == initial_count + 1

    def test_receive_non_in_transit_fails(self, approved_transfer, test_user):
        """Cannot receive an APPROVED transfer (must be IN_TRANSIT)."""
        with pytest.raises(ValidationError, match="Only IN_TRANSIT"):
            approved_transfer.receive(test_user)


# ---------------------------------------------------------------------------
# StockTransfer — Cancellation
# ---------------------------------------------------------------------------


class TestTransferCancellation:
    """Tests for transfer cancellation rules."""

    def test_cancel_draft(self, sample_transfer, test_user):
        """Should cancel a DRAFT transfer."""
        sample_transfer.cancel(test_user, reason="No longer needed")
        assert sample_transfer.status == "CANCELLED"
        assert sample_transfer.cancellation_reason == "No longer needed"
        assert sample_transfer.cancelled_at is not None

    def test_cancel_requested(self, submitted_transfer, test_user):
        """Should cancel a REQUESTED transfer."""
        submitted_transfer.cancel(test_user)
        assert submitted_transfer.status == "CANCELLED"

    def test_cancel_approved(self, approved_transfer, test_user):
        """Should cancel an APPROVED transfer (before dispatch)."""
        approved_transfer.cancel(test_user)
        assert approved_transfer.status == "CANCELLED"

    def test_cancel_in_transit_fails(self, dispatched_transfer, test_user):
        """Cannot cancel an in-transit transfer."""
        with pytest.raises(ValidationError, match="in-transit"):
            dispatched_transfer.cancel(test_user)

    def test_cancel_received_fails(self, dispatched_transfer, test_user):
        """Cannot cancel a received transfer."""
        dispatched_transfer.receive(test_user)
        with pytest.raises(ValidationError, match="received or already-cancelled"):
            dispatched_transfer.cancel(test_user)

    def test_cancel_already_cancelled_fails(self, sample_transfer, test_user):
        """Cannot cancel an already-cancelled transfer."""
        sample_transfer.cancel(test_user)
        with pytest.raises(ValidationError, match="received or already-cancelled"):
            sample_transfer.cancel(test_user)


# ---------------------------------------------------------------------------
# StockTransfer — Computed Properties
# ---------------------------------------------------------------------------


class TestTransferProperties:
    """Tests for computed properties."""

    def test_total_items(self, sample_transfer):
        assert sample_transfer.total_items == 1

    def test_str_representation(self, sample_transfer):
        s = str(sample_transfer)
        assert sample_transfer.transfer_number in s
