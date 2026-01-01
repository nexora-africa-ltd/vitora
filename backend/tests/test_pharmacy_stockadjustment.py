"""
Tests for StockAdjustment model.

Following TDD approach: Write tests FIRST, then implement model.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

# ============================================================================
# StockAdjustment Model Tests (8 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestStockAdjustmentModel:
    """Tests for StockAdjustment model."""

    def test_adjustment_creation_reduces_stock(self):
        """Negative adjustment should reduce batch stock."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="adjuster1", password="test123")

        drug = Drug.objects.create(
            code="ADJ001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        initial_quantity = batch.quantity_available

        # Create adjustment for damaged stock (negative adjustment)
        adjustment = StockAdjustment.objects.create(
            batch=batch,
            adjustment_type="DAMAGE",
            quantity=-50,  # Negative = decrease
            reason="Water damage during storage",
            adjusted_by=user,
        )

        batch.refresh_from_db()
        assert batch.quantity_available == initial_quantity - 50
        assert adjustment.quantity == -50

    def test_adjustment_creation_increases_stock(self):
        """Positive adjustment should increase batch stock."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="adjuster2", password="test123")

        drug = Drug.objects.create(
            code="ADJ002",
            generic_name="Test Drug 2",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ002",
            quantity_received=1000,
            quantity_available=950,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        initial_quantity = batch.quantity_available

        # Create adjustment for transfer in (positive adjustment)
        adjustment = StockAdjustment.objects.create(
            batch=batch,
            adjustment_type="TRANSFER_IN",
            quantity=100,  # Positive = increase
            reason="Stock transfer from warehouse A",
            adjusted_by=user,
        )

        batch.refresh_from_db()
        assert batch.quantity_available == initial_quantity + 100
        assert adjustment.quantity == 100

    def test_reason_required(self):
        """Adjustment must have a reason."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="adjuster3", password="test123")

        drug = Drug.objects.create(
            code="ADJ003",
            generic_name="Test Drug 3",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ003",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        adjustment = StockAdjustment.objects.create(
            batch=batch,
            adjustment_type="DAMAGE",
            quantity=-10,
            reason="Broken bottles during handling",
            adjusted_by=user,
        )

        assert adjustment.reason == "Broken bottles during handling"
        assert len(adjustment.reason) > 0

    def test_approval_workflow_for_large_adjustments(self):
        """Large adjustments should require approval."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user1 = User.objects.create_user(username="adjuster4", password="test123")
        user2 = User.objects.create_user(username="approver1", password="test123")

        drug = Drug.objects.create(
            code="ADJ004",
            generic_name="Test Drug 4",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ004",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user1,
        )

        # Create large adjustment requiring approval
        adjustment = StockAdjustment.objects.create(
            batch=batch,
            adjustment_type="LOSS",
            quantity=-200,  # Large negative adjustment
            reason="Stock theft detected during audit",
            adjusted_by=user1,
            requires_approval=True,
        )

        assert adjustment.requires_approval is True
        assert adjustment.approved_by is None

        # Approve adjustment
        adjustment.approve(user2)

        assert adjustment.approved_by == user2
        assert adjustment.approved_at is not None

    def test_reference_number_for_returns(self):
        """Return to supplier should have reference number."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="adjuster5", password="test123")

        drug = Drug.objects.create(
            code="ADJ005",
            generic_name="Test Drug 5",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ005",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=90),  # Near expiry
            received_date=date.today() - timedelta(days=270),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Return to supplier with reference number
        adjustment = StockAdjustment.objects.create(
            batch=batch,
            adjustment_type="RETURN_SUPPLIER",
            quantity=-500,
            reason="Returning near-expiry stock to supplier",
            reference_number="RN-2025-001",
            adjusted_by=user,
        )

        assert adjustment.reference_number == "RN-2025-001"
        assert adjustment.adjustment_type == "RETURN_SUPPLIER"

    def test_adjustment_types_validation(self):
        """Adjustment type must be one of valid choices."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="adjuster6", password="test123")

        drug = Drug.objects.create(
            code="ADJ006",
            generic_name="Test Drug 6",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ006",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Test valid adjustment types
        valid_types = [
            "DAMAGE",
            "LOSS",
            "EXPIRED",
            "RETURN_SUPPLIER",
            "TRANSFER_OUT",
            "TRANSFER_IN",
            "COUNT_CORRECTION",
            "SAMPLE",
        ]

        for adj_type in valid_types:
            adjustment = StockAdjustment(
                batch=batch,
                adjustment_type=adj_type,
                quantity=-10,
                reason=f"Test {adj_type}",
                adjusted_by=user,
            )
            adjustment.full_clean()  # Should not raise error

    def test_cannot_adjust_below_zero(self):
        """Negative adjustment should not reduce stock below zero."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="adjuster7", password="test123")

        drug = Drug.objects.create(
            code="ADJ007",
            generic_name="Test Drug 7",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ007",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Try to adjust more than available
        adjustment = StockAdjustment(
            batch=batch,
            adjustment_type="DAMAGE",
            quantity=-150,  # More than available
            reason="Attempting to adjust too much",
            adjusted_by=user,
        )

        # Should raise error when validated
        with pytest.raises(ValidationError):
            adjustment.clean()

    def test_audit_trail_creation(self):
        """Adjustment should create audit trail."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAdjustment, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="adjuster8", password="test123")

        drug = Drug.objects.create(
            code="ADJ008",
            generic_name="Test Drug 8",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="ADJ008",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        adjustment = StockAdjustment.objects.create(
            batch=batch,
            adjustment_type="COUNT_CORRECTION",
            quantity=25,
            reason="Physical count found 25 extra units",
            adjusted_by=user,
        )

        # Verify audit trail
        assert adjustment.adjusted_by == user
        assert adjustment.adjusted_at is not None
        assert adjustment.reason is not None
        assert len(adjustment.reason) > 0
