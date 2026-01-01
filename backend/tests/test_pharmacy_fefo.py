"""
Tests for FEFO (First Expiry First Out) dispensing service.

Following TDD approach: Write tests FIRST, then implement service.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest

# ============================================================================
# FEFO Service Tests (10 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestFEFODispenser:
    """Tests for FEFODispenser service."""

    def test_single_batch_sufficient(self):
        """When single batch has enough stock, use only that batch."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo1", password="test123")

        drug = Drug.objects.create(
            code="FEFO001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Request 50 units - single batch has 1000
        result = FEFODispenser.get_batches_for_dispensing(drug, 50)

        assert len(result) == 1
        assert result[0][0] == batch
        assert result[0][1] == 50

    def test_multiple_batches_needed(self):
        """When quantity exceeds single batch, use multiple batches."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo2", password="test123")

        drug = Drug.objects.create(
            code="FEFO002",
            generic_name="Test Drug 2",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        # First batch - expires sooner, less stock
        batch1 = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO002A",
            quantity_received=50,
            quantity_available=50,
            expiry_date=date.today() + timedelta(days=180),
            received_date=date.today() - timedelta(days=10),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Second batch - expires later, more stock
        batch2 = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO002B",
            quantity_received=200,
            quantity_available=200,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Request 100 units - need both batches
        result = FEFODispenser.get_batches_for_dispensing(drug, 100)

        assert len(result) == 2
        assert result[0][0] == batch1  # First batch (expires sooner)
        assert result[0][1] == 50  # All of batch1
        assert result[1][0] == batch2  # Second batch
        assert result[1][1] == 50  # Partial from batch2

    def test_earliest_expiry_selected_first(self):
        """Batch with earliest expiry date should be selected first."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo3", password="test123")

        drug = Drug.objects.create(
            code="FEFO003",
            generic_name="Test Drug 3",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        # Create batches with different expiry dates (reverse order intentionally)
        batch_far = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO003C",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=730),  # 2 years
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        batch_near = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO003A",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=90),  # 3 months
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        batch_mid = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO003B",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),  # 1 year
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Request 50 units - should use batch with earliest expiry
        result = FEFODispenser.get_batches_for_dispensing(drug, 50)

        assert len(result) == 1
        assert result[0][0] == batch_near  # Batch expiring in 90 days

    def test_expired_batches_excluded(self):
        """Expired batches should not be included in FEFO selection."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo4", password="test123")

        drug = Drug.objects.create(
            code="FEFO004",
            generic_name="Test Drug 4",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        # Expired batch - should be excluded
        expired_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO004A",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() - timedelta(days=30),  # Expired 30 days ago
            received_date=date.today() - timedelta(days=400),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="EXPIRED",
        )

        # Valid batch
        valid_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO004B",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Request 50 units - should only use valid batch
        result = FEFODispenser.get_batches_for_dispensing(drug, 50)

        assert len(result) == 1
        assert result[0][0] == valid_batch

    def test_quarantined_batches_excluded(self):
        """Quarantined batches should not be included in FEFO selection."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo5", password="test123")

        drug = Drug.objects.create(
            code="FEFO005",
            generic_name="Test Drug 5",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        # Quarantined batch - should be excluded
        quarantined_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO005A",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=90),  # Expires sooner
            received_date=date.today() - timedelta(days=10),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="QUARANTINE",
        )

        # Available batch
        available_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO005B",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="AVAILABLE",
        )

        # Request 50 units - should only use available batch
        result = FEFODispenser.get_batches_for_dispensing(drug, 50)

        assert len(result) == 1
        assert result[0][0] == available_batch

    def test_insufficient_stock_error(self):
        """Should raise error when insufficient stock available."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser, InsufficientStockError

        User = get_user_model()
        user = User.objects.create_user(username="fefo6", password="test123")

        drug = Drug.objects.create(
            code="FEFO006",
            generic_name="Test Drug 6",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO006",
            quantity_received=50,
            quantity_available=50,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Request 100 units - only 50 available
        with pytest.raises(InsufficientStockError) as excinfo:
            FEFODispenser.get_batches_for_dispensing(drug, 100)

        assert "Insufficient stock" in str(excinfo.value)
        assert "Test Drug 6" in str(excinfo.value)

    def test_batch_quantity_reduced_after_dispense(self):
        """Dispensing should reduce batch quantity."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo7", password="test123")

        county = County.objects.create(code=40, name="FEFO County")
        sub_county = SubCounty.objects.create(county=county, name="FEFO SubCounty")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        drug = Drug.objects.create(
            code="FEFO007",
            generic_name="Test Drug 7",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO007",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        initial_quantity = batch.quantity_available

        # Dispense 50 units using FEFO logic
        dispensings = FEFODispenser.dispense(drug, 50, user, patient=patient)

        batch.refresh_from_db()
        assert batch.quantity_available == initial_quantity - 50
        assert len(dispensings) == 1

    def test_zero_quantity_request(self):
        """Requesting zero quantity should return empty list."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo8", password="test123")

        drug = Drug.objects.create(
            code="FEFO008",
            generic_name="Test Drug 8",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO008",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Request 0 units
        result = FEFODispenser.get_batches_for_dispensing(drug, 0)

        assert len(result) == 0

    def test_drug_with_no_stock(self):
        """Should raise error when drug has no stock."""
        from hmis.apps.pharmacy.models import Drug
        from hmis.apps.pharmacy.services import FEFODispenser, InsufficientStockError

        drug = Drug.objects.create(
            code="FEFO009",
            generic_name="Test Drug 9",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        # No batches created - no stock

        with pytest.raises(InsufficientStockError) as excinfo:
            FEFODispenser.get_batches_for_dispensing(drug, 10)

        assert "Insufficient stock" in str(excinfo.value)

    def test_same_expiry_date_ordering_by_received_date(self):
        """When expiry dates same, order by received date (older first)."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch
        from hmis.apps.pharmacy.services import FEFODispenser

        User = get_user_model()
        user = User.objects.create_user(username="fefo10", password="test123")

        drug = Drug.objects.create(
            code="FEFO010",
            generic_name="Test Drug 10",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )

        same_expiry = date.today() + timedelta(days=365)

        # Newer batch (received later)
        batch_new = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO010B",
            quantity_received=100,
            quantity_available=100,
            expiry_date=same_expiry,
            received_date=date.today(),  # Received today
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Older batch (received earlier)
        batch_old = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO010A",
            quantity_received=100,
            quantity_available=100,
            expiry_date=same_expiry,
            received_date=date.today() - timedelta(days=30),  # Received 30 days ago
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Request 50 units - should use older batch first
        result = FEFODispenser.get_batches_for_dispensing(drug, 50)

        assert len(result) == 1
        assert result[0][0] == batch_old  # Older batch selected first
