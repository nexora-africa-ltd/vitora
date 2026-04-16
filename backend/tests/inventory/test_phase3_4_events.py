"""
Tests for Phase 3 + 4 domain events (signals).
"""

import pytest  # type: ignore

from hmis.apps.core.events import InventoryEvents
from hmis.apps.inventory.models import (
    StockCountStatus,
    WardStockTransaction,
    WardTransactionType,
)

pytestmark = pytest.mark.django_db


class TestWardStockEvents:
    """Tests for ward stock domain events."""

    def test_consume_publishes_event(self, mocker, ward_stock, test_user):
        """CONSUME transaction publishes WARD_STOCK_CONSUMED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        WardStockTransaction.objects.create(
            ward_stock=ward_stock,
            transaction_type=WardTransactionType.CONSUME,
            quantity=-5,
            performed_by=test_user,
        )
        calls = [
            c for c in mock_publish.call_args_list if c[0][0] == InventoryEvents.WARD_STOCK_CONSUMED
        ]
        assert len(calls) == 1

    def test_replenish_publishes_event(self, mocker, ward_stock, test_user):
        """REPLENISH transaction publishes WARD_STOCK_REPLENISHED event."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        WardStockTransaction.objects.create(
            ward_stock=ward_stock,
            transaction_type=WardTransactionType.REPLENISH,
            quantity=10,
            performed_by=test_user,
        )
        calls = [
            c
            for c in mock_publish.call_args_list
            if c[0][0] == InventoryEvents.WARD_STOCK_REPLENISHED
        ]
        assert len(calls) == 1

    def test_low_stock_event_when_below_par(self, mocker, ward_stock_with_low_qty, test_user):
        """Low stock event fires when ward stock is below par level."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        WardStockTransaction.objects.create(
            ward_stock=ward_stock_with_low_qty,
            transaction_type=WardTransactionType.CONSUME,
            quantity=-1,
            performed_by=test_user,
        )
        calls = [
            c for c in mock_publish.call_args_list if c[0][0] == InventoryEvents.WARD_STOCK_LOW
        ]
        assert len(calls) == 1


class TestStockCountEvents:
    """Tests for stock count domain events."""

    def test_completed_publishes_event(self, mocker, stock_count_with_counted_items):
        """Completing a stock count publishes STOCK_COUNT_COMPLETED."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        stock_count_with_counted_items.start()
        stock_count_with_counted_items.complete()
        calls = [
            c
            for c in mock_publish.call_args_list
            if c[0][0] == InventoryEvents.STOCK_COUNT_COMPLETED
        ]
        assert len(calls) == 1

    def test_approved_publishes_event(self, mocker, stock_count_with_counted_items, test_user):
        """Approving a stock count publishes STOCK_COUNT_APPROVED."""
        mock_publish = mocker.patch("hmis.apps.inventory.signals.publish_event")
        stock_count_with_counted_items.start()
        stock_count_with_counted_items.complete()
        stock_count_with_counted_items.approve(user=test_user)
        calls = [
            c
            for c in mock_publish.call_args_list
            if c[0][0] == InventoryEvents.STOCK_COUNT_APPROVED
        ]
        assert len(calls) == 1
