"""
Tests for Ward Stock models (Phase 3).
"""

from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.inventory.models import WardStock, WardStockTransaction, WardTransactionType

pytestmark = pytest.mark.django_db


class TestWardStockModel:
    """Tests for the WardStock model."""

    def test_ward_stock_creation(self, ward_stock):
        """WardStock record is created with correct defaults."""
        assert ward_stock.quantity_available == 50
        assert ward_stock.par_level == 20
        assert ward_stock.max_level == 100
        assert ward_stock.pk is not None

    def test_is_below_par_false_when_above(self, ward_stock):
        """is_below_par returns False when quantity_available >= par_level."""
        assert ward_stock.is_below_par is False

    def test_is_below_par_true_when_below(self, ward_stock_with_low_qty):
        """is_below_par returns True when quantity_available < par_level."""
        assert ward_stock_with_low_qty.is_below_par is True

    def test_reorder_quantity(self, ward_stock_with_low_qty):
        """reorder_quantity returns max_level - quantity_available when below par."""
        assert ward_stock_with_low_qty.reorder_quantity == 95  # 100 - 5

    def test_reorder_quantity_nonzero_when_below_max(self, ward_stock):
        """reorder_quantity returns max_level - quantity_available when below max."""
        assert ward_stock.reorder_quantity == 50  # max_level(100) - qty(50)

    def test_reorder_quantity_zero_when_at_max(self, ward_stock):
        """reorder_quantity returns 0 when at or above max level."""
        ward_stock.quantity_available = 100
        ward_stock.save()
        assert ward_stock.reorder_quantity == 0

    def test_unique_constraint(
        self, ward_stock, sample_drug, ward_store, sample_facility, sample_organization
    ):
        """Cannot create duplicate WardStock for same drug + store_location."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            WardStock.objects.create(
                store_location=ward_store,
                drug=sample_drug,
                quantity_available=10,
                par_level=5,
                max_level=50,
                facility=sample_facility,
                organization=sample_organization,
            )

    def test_str_representation(self, ward_stock):
        """String representation includes drug and location."""
        s = str(ward_stock)
        assert ward_stock.drug.generic_name in s or str(ward_stock.drug) in s


class TestWardStockTransaction:
    """Tests for WardStockTransaction and auto-updates."""

    def test_consume_decreases_quantity(self, ward_stock, test_user):
        """Creating a CONSUME transaction decreases ward stock quantity."""
        initial_qty = ward_stock.quantity_available
        WardStockTransaction.objects.create(
            ward_stock=ward_stock,
            transaction_type=WardTransactionType.CONSUME,
            quantity=-10,
            performed_by=test_user,
            notes="Patient use",
        )
        ward_stock.refresh_from_db()
        assert ward_stock.quantity_available == initial_qty - 10

    def test_replenish_increases_quantity(self, ward_stock, test_user):
        """Creating a REPLENISH transaction increases ward stock quantity."""
        initial_qty = ward_stock.quantity_available
        WardStockTransaction.objects.create(
            ward_stock=ward_stock,
            transaction_type=WardTransactionType.REPLENISH,
            quantity=30,
            performed_by=test_user,
            notes="Restock from main store",
        )
        ward_stock.refresh_from_db()
        assert ward_stock.quantity_available == initial_qty + 30

    def test_return_decreases_quantity(self, ward_stock, test_user):
        """Creating a RETURN transaction decreases ward stock quantity."""
        initial_qty = ward_stock.quantity_available
        WardStockTransaction.objects.create(
            ward_stock=ward_stock,
            transaction_type=WardTransactionType.RETURN,
            quantity=-5,
            performed_by=test_user,
            notes="Return unused stock",
        )
        ward_stock.refresh_from_db()
        assert ward_stock.quantity_available == initial_qty - 5

    def test_adjustment_positive(self, ward_stock, test_user):
        """Positive ADJUSTMENT transaction increases quantity."""
        initial_qty = ward_stock.quantity_available
        WardStockTransaction.objects.create(
            ward_stock=ward_stock,
            transaction_type=WardTransactionType.ADJUSTMENT,
            quantity=5,
            performed_by=test_user,
            notes="Count correction",
        )
        ward_stock.refresh_from_db()
        assert ward_stock.quantity_available == initial_qty + 5
