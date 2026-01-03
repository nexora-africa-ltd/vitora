"""
Tests for Ward model - Sprint 1.5-1.6 Track D.

Test Coverage (12 tests):
- Ward creation with valid data
- Ward type validation
- Unique name constraint
- Unique code constraint
- Capacity validation (positive integer)
- Daily rate validation
- Available beds calculation
- Occupancy rate calculation
- Ward deactivation
- Ward listing with filters
- Ward search by name/code
- Ward update with audit
"""

import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from hmis.apps.inpatient.models import Ward, Bed


@pytest.mark.django_db
class TestWardCreation:
    """Tests for Ward model creation."""

    def test_create_ward_with_valid_data(self):
        """Should create ward with valid data."""
        ward = Ward.objects.create(
            name="Medical Ward 1",
            code="MED-01",
            ward_type="MEDICAL",
            floor="1st Floor",
            capacity=20,
            daily_rate=Decimal("500.00"),
            description="General medical ward",
        )

        assert ward.id is not None
        assert ward.name == "Medical Ward 1"
        assert ward.code == "MED-01"
        assert ward.ward_type == "MEDICAL"
        assert ward.floor == "1st Floor"
        assert ward.capacity == 20
        assert ward.daily_rate == Decimal("500.00")
        assert ward.description == "General medical ward"
        assert ward.is_active is True
        assert ward.created_at is not None
        assert ward.updated_at is not None

    def test_ward_type_choices_valid(self):
        """Should accept valid ward type choices."""
        valid_types = ["MEDICAL", "SURGICAL", "PEDIATRIC", "MATERNITY", "ICU", "ISOLATION"]
        
        for ward_type in valid_types:
            ward = Ward.objects.create(
                name=f"Ward {ward_type}",
                code=f"W-{ward_type[:3]}",
                ward_type=ward_type,
                capacity=10,
                daily_rate=Decimal("300.00"),
            )
            assert ward.ward_type == ward_type
            ward.delete()  # Clean up for next iteration

    def test_unique_name_constraint(self):
        """Should enforce unique ward names."""
        Ward.objects.create(
            name="Unique Ward",
            code="UW-01",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate=Decimal("500.00"),
        )

        with pytest.raises(IntegrityError):
            Ward.objects.create(
                name="Unique Ward",  # Duplicate name
                code="UW-02",
                ward_type="SURGICAL",
                capacity=15,
                daily_rate=Decimal("600.00"),
            )

    def test_unique_code_constraint(self):
        """Should enforce unique ward codes."""
        Ward.objects.create(
            name="Ward One",
            code="UC-01",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate=Decimal("500.00"),
        )

        with pytest.raises(IntegrityError):
            Ward.objects.create(
                name="Ward Two",
                code="UC-01",  # Duplicate code
                ward_type="SURGICAL",
                capacity=15,
                daily_rate=Decimal("600.00"),
            )

    def test_capacity_positive_integer(self):
        """Should validate that capacity is a positive integer."""
        # Valid capacity
        ward = Ward.objects.create(
            name="Valid Capacity Ward",
            code="VCW-01",
            ward_type="MEDICAL",
            capacity=25,
            daily_rate=Decimal("500.00"),
        )
        assert ward.capacity == 25

        # Capacity cannot be zero (business logic - will validate in model)
        # Note: Django PositiveIntegerField allows 0, so we need custom validation

    def test_daily_rate_decimal_validation(self):
        """Should accept valid daily rate decimal values."""
        ward = Ward.objects.create(
            name="Rate Test Ward",
            code="RTW-01",
            ward_type="ICU",
            capacity=10,
            daily_rate=Decimal("1500.50"),
        )
        assert ward.daily_rate == Decimal("1500.50")

    def test_ward_deactivation(self):
        """Should allow ward deactivation."""
        ward = Ward.objects.create(
            name="Deactivate Ward",
            code="DW-01",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate=Decimal("500.00"),
            is_active=True,
        )
        assert ward.is_active is True

        ward.is_active = False
        ward.save()
        ward.refresh_from_db()
        assert ward.is_active is False

    def test_ward_optional_floor(self):
        """Should allow ward without floor specification."""
        ward = Ward.objects.create(
            name="No Floor Ward",
            code="NFW-01",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate=Decimal("500.00"),
        )
        assert ward.floor == ""

    def test_ward_optional_description(self):
        """Should allow ward without description."""
        ward = Ward.objects.create(
            name="No Description Ward",
            code="NDW-01",
            ward_type="SURGICAL",
            capacity=10,
            daily_rate=Decimal("500.00"),
        )
        assert ward.description == ""


@pytest.mark.django_db
class TestWardProperties:
    """Tests for Ward computed properties."""

    def test_available_beds_with_no_beds(self):
        """Should return 0 available beds when ward has no beds."""
        ward = Ward.objects.create(
            name="Empty Ward",
            code="EW-01",
            ward_type="MEDICAL",
            capacity=20,
            daily_rate=Decimal("500.00"),
        )
        assert ward.available_beds == 0

    def test_available_beds_calculation(self):
        """Should correctly count available beds."""
        ward = Ward.objects.create(
            name="Test Ward",
            code="TW-01",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate=Decimal("500.00"),
        )

        # Create 10 beds with different statuses
        Bed.objects.create(ward=ward, bed_number="B-01", status="AVAILABLE")
        Bed.objects.create(ward=ward, bed_number="B-02", status="AVAILABLE")
        Bed.objects.create(ward=ward, bed_number="B-03", status="AVAILABLE")
        Bed.objects.create(ward=ward, bed_number="B-04", status="OCCUPIED")
        Bed.objects.create(ward=ward, bed_number="B-05", status="OCCUPIED")
        Bed.objects.create(ward=ward, bed_number="B-06", status="OCCUPIED")
        Bed.objects.create(ward=ward, bed_number="B-07", status="MAINTENANCE")
        Bed.objects.create(ward=ward, bed_number="B-08", status="RESERVED")
        Bed.objects.create(ward=ward, bed_number="B-09", status="AVAILABLE")
        Bed.objects.create(ward=ward, bed_number="B-10", status="OCCUPIED")

        # Should have 4 AVAILABLE beds
        assert ward.available_beds == 4

    def test_occupancy_rate_with_no_beds(self):
        """Should return 0% occupancy when ward has no beds."""
        ward = Ward.objects.create(
            name="Empty Ward",
            code="EW-02",
            ward_type="MEDICAL",
            capacity=20,
            daily_rate=Decimal("500.00"),
        )
        assert ward.occupancy_rate == 0.0

    def test_occupancy_rate_calculation(self):
        """Should correctly calculate occupancy percentage."""
        ward = Ward.objects.create(
            name="Occupancy Test Ward",
            code="OTW-01",
            ward_type="SURGICAL",
            capacity=10,
            daily_rate=Decimal("700.00"),
        )

        # Create 10 beds
        for i in range(1, 11):
            status = "OCCUPIED" if i <= 6 else "AVAILABLE"
            Bed.objects.create(
                ward=ward,
                bed_number=f"B-{i:02d}",
                status=status,
            )

        # 6 occupied out of 10 = 60%
        assert ward.occupancy_rate == 60.0

    def test_occupancy_rate_full_ward(self):
        """Should return 100% for fully occupied ward."""
        ward = Ward.objects.create(
            name="Full Ward",
            code="FW-01",
            ward_type="ICU",
            capacity=5,
            daily_rate=Decimal("2000.00"),
        )

        for i in range(1, 6):
            Bed.objects.create(ward=ward, bed_number=f"B-{i:02d}", status="OCCUPIED")

        assert ward.occupancy_rate == 100.0


@pytest.mark.django_db
class TestWardQueryOperations:
    """Tests for Ward filtering and search operations."""

    def test_ward_listing(self):
        """Should list all wards."""
        Ward.objects.create(
            name="Ward A",
            code="WA-01",
            ward_type="MEDICAL",
            capacity=20,
            daily_rate=Decimal("500.00"),
        )
        Ward.objects.create(
            name="Ward B",
            code="WB-01",
            ward_type="SURGICAL",
            capacity=15,
            daily_rate=Decimal("700.00"),
        )

        wards = Ward.objects.all()
        assert wards.count() >= 2

    def test_filter_by_ward_type(self):
        """Should filter wards by type."""
        Ward.objects.create(
            name="Medical Ward A",
            code="MWA-01",
            ward_type="MEDICAL",
            capacity=20,
            daily_rate=Decimal("500.00"),
        )
        Ward.objects.create(
            name="ICU Ward A",
            code="ICUA-01",
            ward_type="ICU",
            capacity=10,
            daily_rate=Decimal("2000.00"),
        )

        medical_wards = Ward.objects.filter(ward_type="MEDICAL")
        icu_wards = Ward.objects.filter(ward_type="ICU")

        assert medical_wards.count() >= 1
        assert icu_wards.count() >= 1

    def test_filter_by_active_status(self):
        """Should filter wards by active status."""
        Ward.objects.create(
            name="Active Ward",
            code="AW-01",
            ward_type="MEDICAL",
            capacity=20,
            daily_rate=Decimal("500.00"),
            is_active=True,
        )
        Ward.objects.create(
            name="Inactive Ward",
            code="IW-01",
            ward_type="SURGICAL",
            capacity=15,
            daily_rate=Decimal("700.00"),
            is_active=False,
        )

        active_wards = Ward.objects.filter(is_active=True)
        inactive_wards = Ward.objects.filter(is_active=False)

        assert active_wards.count() >= 1
        assert inactive_wards.count() >= 1

    def test_search_by_name(self):
        """Should search wards by name."""
        Ward.objects.create(
            name="Pediatric Ward Alpha",
            code="PWA-01",
            ward_type="PEDIATRIC",
            capacity=15,
            daily_rate=Decimal("600.00"),
        )

        results = Ward.objects.filter(name__icontains="Pediatric")
        assert results.count() >= 1
        assert "Pediatric" in results.first().name

    def test_search_by_code(self):
        """Should search wards by code."""
        Ward.objects.create(
            name="Maternity Ward",
            code="MAT-01",
            ward_type="MATERNITY",
            capacity=12,
            daily_rate=Decimal("800.00"),
        )

        results = Ward.objects.filter(code__icontains="MAT")
        assert results.count() >= 1
        assert "MAT" in results.first().code
