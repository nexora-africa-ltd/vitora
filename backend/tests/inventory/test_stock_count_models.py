"""
Tests for Stock Count models (Phase 4).
"""

from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

from hmis.apps.inventory.models import StockCount, StockCountItem, StockCountStatus

pytestmark = pytest.mark.django_db


class TestStockCountModel:
    """Tests for the StockCount model."""

    def test_stock_count_creation(self, stock_count):
        """StockCount record is created with correct defaults."""
        assert stock_count.status == StockCountStatus.DRAFT
        assert stock_count.count_number.startswith("SC-")
        assert stock_count.pk is not None

    def test_auto_generated_count_number(self, stock_count):
        """count_number is auto-generated in SC-YYYYMMDD-XXXX format."""
        import re

        assert re.match(r"SC-\d{8}-\d{4}", stock_count.count_number)

    def test_start_transitions_to_in_progress(self, stock_count_with_items):
        """start() transitions DRAFT → IN_PROGRESS."""
        stock_count_with_items.start()
        assert stock_count_with_items.status == StockCountStatus.IN_PROGRESS
        assert stock_count_with_items.started_at is not None

    def test_start_from_non_draft_fails(self, stock_count_with_items):
        """start() from IN_PROGRESS should raise ValidationError."""
        stock_count_with_items.start()
        with pytest.raises(ValidationError):
            stock_count_with_items.start()

    def test_start_with_no_items_fails(self, stock_count):
        """start() from DRAFT should fail when no items exist."""
        with pytest.raises(ValidationError, match="no items"):
            stock_count.start()

    def test_complete_transitions_to_completed(self, stock_count_with_counted_items):
        """complete() transitions IN_PROGRESS → COMPLETED."""
        stock_count_with_counted_items.start()
        stock_count_with_counted_items.complete()
        assert stock_count_with_counted_items.status == StockCountStatus.COMPLETED
        assert stock_count_with_counted_items.completed_at is not None

    def test_complete_from_draft_fails(self, stock_count):
        """complete() from DRAFT should raise ValidationError."""
        with pytest.raises(ValidationError):
            stock_count.complete()

    def test_approve_transitions_to_approved(self, stock_count_with_counted_items, test_user):
        """approve() transitions COMPLETED → APPROVED."""
        stock_count_with_counted_items.start()
        stock_count_with_counted_items.complete()
        stock_count_with_counted_items.approve(user=test_user)
        assert stock_count_with_counted_items.status == StockCountStatus.APPROVED
        assert stock_count_with_counted_items.approved_by == test_user
        assert stock_count_with_counted_items.approved_at is not None

    def test_approve_from_non_completed_fails(self, stock_count, test_user):
        """approve() from DRAFT should raise ValidationError."""
        with pytest.raises(ValidationError):
            stock_count.approve(user=test_user)

    def test_cancel_from_draft(self, stock_count):
        """cancel() from DRAFT should transition to CANCELLED."""
        stock_count.cancel()
        assert stock_count.status == StockCountStatus.CANCELLED

    def test_cancel_from_in_progress(self, stock_count_with_items):
        """cancel() from IN_PROGRESS should work."""
        stock_count_with_items.start()
        stock_count_with_items.cancel()
        assert stock_count_with_items.status == StockCountStatus.CANCELLED

    def test_cancel_from_approved_fails(self, stock_count_with_counted_items, test_user):
        """cancel() from APPROVED should raise ValidationError."""
        stock_count_with_counted_items.start()
        stock_count_with_counted_items.complete()
        stock_count_with_counted_items.approve(user=test_user)
        with pytest.raises(ValidationError):
            stock_count_with_counted_items.cancel()


class TestStockCountItem:
    """Tests for StockCountItem properties."""

    def test_variance_when_not_counted(self, stock_count_with_items):
        """variance returns None when counted_quantity is None."""
        item = stock_count_with_items.items.first()
        assert item.counted_quantity is None
        assert item.variance is None

    def test_variance_calculation(self, stock_count_with_items):
        """variance = counted_quantity - system_quantity."""
        item = stock_count_with_items.items.first()
        item.counted_quantity = 980
        item.save()
        # system_quantity=1000, counted=980, variance = -20
        assert item.variance == -20

    def test_no_discrepancy_when_match(self, stock_count_with_items):
        """has_discrepancy is False when counted equals system."""
        item = stock_count_with_items.items.first()
        item.counted_quantity = item.system_quantity
        item.save()
        assert item.has_discrepancy is False

    def test_has_discrepancy_when_different(self, stock_count_with_items):
        """has_discrepancy is True when counted differs from system."""
        item = stock_count_with_items.items.first()
        item.counted_quantity = item.system_quantity + 10
        item.save()
        assert item.has_discrepancy is True


class TestStockCountGenerateItems:
    """Tests for generate_items() method."""

    def test_generate_items_from_stock_batches(self, stock_count, source_stock_batch):
        """generate_items() creates items from current stock batches."""
        # source_stock_batch is at the same facility
        created = stock_count.generate_items()
        assert created >= 1
        assert stock_count.items.count() >= 1

        item = stock_count.items.first()
        assert item.system_quantity == source_stock_batch.quantity_available

    def test_generate_items_idempotent_check(self, stock_count, source_stock_batch):
        """generate_items() should not re-add existing batch items."""
        stock_count.generate_items()
        count_before = stock_count.items.count()
        stock_count.generate_items()
        assert stock_count.items.count() == count_before

    def test_generate_items_fails_for_non_draft(self, stock_count_with_items):
        """generate_items() should fail for non-DRAFT status."""
        stock_count_with_items.start()
        with pytest.raises(ValidationError):
            stock_count_with_items.generate_items()


class TestStockCountApproval:
    """Tests for approval creating adjustment records."""

    def test_approve_creates_stock_adjustments(self, stock_count_with_items, test_user):
        """approve() creates StockAdjustment records for items with variance."""
        from hmis.apps.pharmacy.models import StockAdjustment

        item = stock_count_with_items.items.first()
        item.counted_quantity = item.system_quantity - 20  # -20 variance
        item.variance_reason = "Damage found"
        item.save()

        stock_count_with_items.start()
        stock_count_with_items.complete()
        stock_count_with_items.approve(user=test_user)

        # Verify adjustment was created
        adjustments = StockAdjustment.objects.filter(
            adjustment_type="COUNT_CORRECTION",
            batch=item.batch,
        )
        assert adjustments.exists()
        adj = adjustments.first()
        assert adj.quantity == -20
        assert "Damage found" in adj.reason

    def test_approve_no_adjustment_when_no_variance(self, stock_count_with_items, test_user):
        """approve() skips items with no variance."""
        from hmis.apps.pharmacy.models import StockAdjustment

        item = stock_count_with_items.items.first()
        item.counted_quantity = item.system_quantity  # No variance
        item.save()

        stock_count_with_items.start()
        stock_count_with_items.complete()

        adj_count_before = StockAdjustment.objects.count()
        stock_count_with_items.approve(user=test_user)
        assert StockAdjustment.objects.count() == adj_count_before
