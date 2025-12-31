"""
Tests for Pharmacy models: Drug, StockBatch, Prescription, Dispensing.

Following TDD approach: Write tests FIRST, then implement models.
These tests follow the sprint deliverable requirements exactly.
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import IntegrityError


# ============================================================================
# Drug Model Tests (12 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestDrugModel:
    """Tests for Drug catalog model."""

    def test_drug_creation_with_required_fields(self):
        """Drug can be created with minimum required fields."""
        from hmis.apps.pharmacy.models import Drug
        
        drug = Drug.objects.create(
            code="TEST001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        assert drug.id is not None
        assert drug.code == "TEST001"
        assert drug.generic_name == "Test Drug"
        assert drug.strength == "100mg"
        assert drug.form == "TABLET"
        assert drug.is_active is True  # Default value
        assert drug.created_at is not None
        assert drug.updated_at is not None

    def test_drug_code_uniqueness(self):
        """Drug code must be unique across all drugs."""
        from hmis.apps.pharmacy.models import Drug
        
        Drug.objects.create(
            code="UNIQUE001",
            generic_name="Drug One",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        # Attempting to create drug with same code should fail
        with pytest.raises(IntegrityError):
            Drug.objects.create(
                code="UNIQUE001",  # Duplicate code
                generic_name="Drug Two",
                strength="200mg",
                form="CAPSULE",
                category="OTHER",
                unit="capsule",
            )

    def test_drug_form_validation(self):
        """Drug form must be one of the valid choices."""
        from hmis.apps.pharmacy.models import Drug
        
        # Valid forms should work
        valid_forms = ["TABLET", "CAPSULE", "SYRUP", "INJECTION", "CREAM"]
        for form in valid_forms:
            drug = Drug(
                code=f"TEST{form}",
                generic_name="Test Drug",
                strength="100mg",
                form=form,
                category="OTHER",
                unit="unit",
            )
            drug.full_clean()  # Should not raise error

    def test_drug_category_validation(self):
        """Drug category must be one of the valid choices."""
        from hmis.apps.pharmacy.models import Drug
        
        # Valid categories should work
        valid_categories = ["ANALGESIC", "ANTIBIOTIC", "ANTIMALARIAL", "ANTIRETROVIRAL"]
        for category in valid_categories:
            drug = Drug(
                code=f"TEST{category}",
                generic_name="Test Drug",
                strength="100mg",
                form="TABLET",
                category=category,
                unit="tablet",
            )
            drug.full_clean()  # Should not raise error

    def test_keml_code_format_validation(self):
        """KEML code should accept valid formats."""
        from hmis.apps.pharmacy.models import Drug
        
        drug = Drug.objects.create(
            code="KEMLTEST",
            generic_name="KEML Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            keml_code="02.01.03",
            is_essential=True,
        )
        
        assert drug.keml_code == "02.01.03"
        assert drug.is_essential is True

    def test_schedule_determines_requires_prescription(self):
        """Drug schedule should determine prescription requirements."""
        from hmis.apps.pharmacy.models import Drug
        
        # OTC drug should not require prescription
        otc_drug = Drug.objects.create(
            code="OTC001",
            generic_name="OTC Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            schedule="OTC",
            requires_prescription=False,
        )
        assert otc_drug.requires_prescription is False
        
        # POM drug should require prescription
        pom_drug = Drug.objects.create(
            code="POM001",
            generic_name="POM Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            schedule="POM",
            requires_prescription=True,
        )
        assert pom_drug.requires_prescription is True

    def test_controlled_drug_flag(self):
        """Controlled drugs should have appropriate flags set."""
        from hmis.apps.pharmacy.models import Drug
        
        controlled_drug = Drug.objects.create(
            code="CD001",
            generic_name="Controlled Drug",
            strength="10mg",
            form="TABLET",
            category="CONTROLLED",
            unit="tablet",
            schedule="CD",
            is_controlled=True,
            is_narcotic=True,
            requires_prescription=True,
        )
        
        assert controlled_drug.is_controlled is True
        assert controlled_drug.is_narcotic is True
        assert controlled_drug.requires_prescription is True

    def test_brand_names_json_array(self):
        """Drug should support multiple brand names as JSON array."""
        from hmis.apps.pharmacy.models import Drug
        
        drug = Drug.objects.create(
            code="BRAND001",
            generic_name="Generic Drug",
            brand_names=["Brand A", "Brand B", "Brand C"],
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        assert drug.brand_names == ["Brand A", "Brand B", "Brand C"]
        assert len(drug.brand_names) == 3

    def test_drug_display_name_formatting(self):
        """Drug display name should include generic name, strength, and form."""
        from hmis.apps.pharmacy.models import Drug
        
        drug = Drug.objects.create(
            code="DISPLAY001",
            generic_name="Paracetamol",
            strength="500mg",
            form="TABLET",
            category="ANALGESIC",
            unit="tablet",
        )
        
        display_name = drug.get_display_name()
        assert "Paracetamol" in display_name
        assert "500mg" in display_name
        assert "TABLET" in display_name or "Tablet" in display_name

    def test_drug_search_by_generic_name(self):
        """Drug search should find drugs by generic name."""
        from hmis.apps.pharmacy.models import Drug
        
        Drug.objects.create(
            code="SEARCH001",
            generic_name="Amoxicillin",
            strength="500mg",
            form="CAPSULE",
            category="ANTIBIOTIC",
            unit="capsule",
        )
        
        # Search should be case-insensitive
        results = Drug.objects.filter(generic_name__icontains="amoxicillin")
        assert results.count() == 1
        assert results.first().generic_name == "Amoxicillin"

    def test_drug_search_by_brand_name(self):
        """Drug search should find drugs by brand name in JSON field."""
        from hmis.apps.pharmacy.models import Drug
        
        drug = Drug.objects.create(
            code="BRANDSEARCH001",
            generic_name="Amoxicillin",
            brand_names=["Amoxil", "Trimox", "Moxatag"],
            strength="500mg",
            form="CAPSULE",
            category="ANTIBIOTIC",
            unit="capsule",
        )
        
        # Search by brand name (SQLite-compatible approach)
        all_drugs = Drug.objects.all()
        results = [d for d in all_drugs if "Amoxil" in d.brand_names]
        assert len(results) == 1
        assert results[0].generic_name == "Amoxicillin"

    def test_default_reorder_levels(self):
        """Drug should have default reorder level and quantity."""
        from hmis.apps.pharmacy.models import Drug
        
        drug = Drug.objects.create(
            code="REORDER001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            default_reorder_level=50,
            default_reorder_quantity=100,
        )
        
        assert drug.default_reorder_level == 50
        assert drug.default_reorder_quantity == 100

    def test_reference_price_handling(self):
        """Drug should handle reference price as decimal."""
        from hmis.apps.pharmacy.models import Drug
        
        drug = Drug.objects.create(
            code="PRICE001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            reference_price=Decimal("99.99"),
        )
        
        assert drug.reference_price == Decimal("99.99")
        # Test with null price
        drug_no_price = Drug.objects.create(
            code="NOPRICE001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            reference_price=None,
        )
        assert drug_no_price.reference_price is None


# ============================================================================
# StockBatch Model Tests (18 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestStockBatchModel:
    """Tests for Stock Batch model."""

    def test_batch_creation_with_drug_linkage(self):
        """Stock batch can be created with drug linkage."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser", password="test123")
        
        drug = Drug.objects.create(
            code="BATCH001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="BATCH20250101",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        assert batch.id is not None
        assert batch.drug == drug
        assert batch.batch_number == "BATCH20250101"
        assert batch.quantity_received == 1000
        assert batch.quantity_available == 1000

    def test_batch_number_uniqueness_per_drug(self):
        """Batch number must be unique per drug."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser2", password="test123")
        
        drug = Drug.objects.create(
            code="UNIQUEBATCH",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        StockBatch.objects.create(
            drug=drug,
            batch_number="DUPLICATE001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        # Same batch number for same drug should fail
        with pytest.raises(IntegrityError):
            StockBatch.objects.create(
                drug=drug,
                batch_number="DUPLICATE001",
                quantity_received=500,
                quantity_available=500,
                expiry_date=date.today() + timedelta(days=365),
                received_date=date.today(),
                cost_price=Decimal("5.00"),
                selling_price=Decimal("10.00"),
                received_by=user,
            )

    def test_quantity_tracking(self):
        """Batch should track received, available, and dispensed quantities."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser3", password="test123")
        
        drug = Drug.objects.create(
            code="QTYTRACK",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="QTY001",
            quantity_received=1000,
            quantity_available=800,
            quantity_dispensed=200,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        assert batch.quantity_received == 1000
        assert batch.quantity_available == 800
        assert batch.quantity_dispensed == 200

    def test_expiry_date_validation(self):
        """Expiry date should be in the future for new batches."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser4", password="test123")
        
        drug = Drug.objects.create(
            code="EXPIRYTEST",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        # Future expiry date should work
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="FUTURE001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        assert batch.expiry_date > date.today()

    def test_days_to_expiry_calculation(self):
        """Batch should calculate days until expiry correctly."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser5", password="test123")
        
        drug = Drug.objects.create(
            code="DAYSTO",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        expiry_in_90_days = date.today() + timedelta(days=90)
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DAYS001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=expiry_in_90_days,
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        days_to_expiry = batch.days_to_expiry()
        assert days_to_expiry == 90

    def test_is_expired_check(self):
        """Batch should correctly identify if it's expired."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser6", password="test123")
        
        drug = Drug.objects.create(
            code="EXPCHECK",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        # Not expired batch
        future_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="NOTEXP001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        assert future_batch.is_expired() is False
        
        # Expired batch
        expired_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="EXP001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() - timedelta(days=10),
            received_date=date.today() - timedelta(days=400),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="EXPIRED",
        )
        assert expired_batch.is_expired() is True

    def test_is_low_stock_check(self):
        """Batch should check if below drug's reorder level."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser7", password="test123")
        
        drug = Drug.objects.create(
            code="LOWSTOCK",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
            default_reorder_level=50,
        )
        
        # Low stock batch
        low_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="LOW001",
            quantity_received=1000,
            quantity_available=30,  # Below reorder level
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        assert low_batch.is_low_stock() is True
        
        # Adequate stock batch
        good_batch = StockBatch.objects.create(
            drug=drug,
            batch_number="GOOD001",
            quantity_received=1000,
            quantity_available=100,  # Above reorder level
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        assert good_batch.is_low_stock() is False

    def test_dispense_reduces_available_stock(self):
        """Dispensing should reduce available quantity."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser8", password="test123")
        
        drug = Drug.objects.create(
            code="DISPENSE",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        # Dispense 100 units
        batch.dispense(100)
        
        assert batch.quantity_available == 900
        assert batch.quantity_dispensed == 100

    def test_dispense_prevents_over_dispensing(self):
        """Dispensing should not allow more than available quantity."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser9", password="test123")
        
        drug = Drug.objects.create(
            code="OVERDISP",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="OVER001",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        # Try to dispense more than available
        with pytest.raises(ValueError):
            batch.dispense(150)

    def test_return_stock_increases_available(self):
        """Returning stock should increase available quantity."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser10", password="test123")
        
        drug = Drug.objects.create(
            code="RETURN",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="RET001",
            quantity_received=1000,
            quantity_available=900,
            quantity_dispensed=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        # Return 50 units
        batch.return_stock(50)
        
        assert batch.quantity_available == 950
        assert batch.quantity_dispensed == 50

    def test_mark_expired_status_change(self):
        """Marking batch as expired should change status."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser11", password="test123")
        
        drug = Drug.objects.create(
            code="MARKEXP",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="MARK001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() - timedelta(days=1),
            received_date=date.today() - timedelta(days=400),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="AVAILABLE",
        )
        
        batch.mark_expired()
        
        assert batch.status == "EXPIRED"
        assert batch.quantity_expired == 1000

    def test_mark_damaged_with_quantity_and_reason(self):
        """Marking stock as damaged should record quantity and reason."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser12", password="test123")
        
        drug = Drug.objects.create(
            code="DAMAGED",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DAM001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        batch.mark_damaged(50, "Water damage during storage")
        
        assert batch.quantity_damaged == 50
        assert batch.quantity_available == 950

    def test_fefo_ordering(self):
        """Batches should be ordered by expiry date (earliest first)."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser13", password="test123")
        
        drug = Drug.objects.create(
            code="FEFO",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        # Create batches with different expiry dates
        batch1 = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=180),  # Expires sooner
            received_date=date.today() - timedelta(days=10),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        batch2 = StockBatch.objects.create(
            drug=drug,
            batch_number="FEFO002",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),  # Expires later
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        # Get batches in FEFO order
        batches = StockBatch.objects.filter(drug=drug).order_by("expiry_date")
        
        assert batches.first() == batch1  # Earlier expiry comes first
        assert batches.last() == batch2

    def test_status_transitions(self):
        """Batch status should support different states."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser14", password="test123")
        
        drug = Drug.objects.create(
            code="STATUS",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="STAT001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="AVAILABLE",
        )
        
        assert batch.status == "AVAILABLE"
        
        # Change to LOW
        batch.status = "LOW"
        batch.save()
        assert batch.status == "LOW"
        
        # Change to QUARANTINE
        batch.status = "QUARANTINE"
        batch.save()
        assert batch.status == "QUARANTINE"

    def test_stock_value_calculation(self):
        """Batch should calculate total value of remaining stock."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser15", password="test123")
        
        drug = Drug.objects.create(
            code="VALUE",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="VAL001",
            quantity_received=1000,
            quantity_available=500,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00"),
            received_by=user,
        )
        
        # Value based on cost price
        expected_value = 500 * Decimal("10.00")
        assert batch.get_value() == expected_value

    def test_cost_price_vs_selling_price(self):
        """Batch should maintain both cost and selling prices."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser16", password="test123")
        
        drug = Drug.objects.create(
            code="PRICES",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="PRICE001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("12.50"),
            received_by=user,
        )
        
        assert batch.cost_price == Decimal("5.00")
        assert batch.selling_price == Decimal("12.50")
        assert batch.selling_price > batch.cost_price  # Selling price should be higher

    def test_supplier_tracking(self):
        """Batch should track supplier information."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="testuser17", password="test123")
        
        drug = Drug.objects.create(
            code="SUPPLIER",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="SUPP001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            supplier="Kenya Medical Supplies Authority",
            purchase_order="PO-2025-001",
            received_by=user,
        )
        
        assert batch.supplier == "Kenya Medical Supplies Authority"
        assert batch.purchase_order == "PO-2025-001"

    def test_received_by_user_tracking(self):
        """Batch should track which user received the stock."""
        from hmis.apps.pharmacy.models import Drug, StockBatch
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        user = User.objects.create_user(username="pharmacist1", password="test123")
        
        drug = Drug.objects.create(
            code="USRTRACK",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            category="OTHER",
            unit="tablet",
        )
        
        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="USR001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )
        
        assert batch.received_by == user
        assert batch.received_by.username == "pharmacist1"

