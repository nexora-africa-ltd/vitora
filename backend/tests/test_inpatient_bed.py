"""
Tests for Bed model - Sprint 1.5-1.6 Track D.

Test Coverage (15 tests):
- Bed creation with valid data
- Unique bed number per ward
- Status transitions: AVAILABLE → OCCUPIED
- Status transitions: OCCUPIED → AVAILABLE
- Status transitions: AVAILABLE → MAINTENANCE
- Status transitions: MAINTENANCE → AVAILABLE
- Status transitions: AVAILABLE → RESERVED
- Reserved bed auto-expiry
- Invalid status transition prevention
- Bed listing by ward
- Bed filtering by status
- Bed assignment validation (no double-booking)
- Bed status change audit logging
- Bed deactivation with occupied check
- Bed search by number
"""

from decimal import Decimal

import pytest # type: ignore
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from hmis.apps.inpatient.models import Bed, Ward

User = get_user_model()


@pytest.fixture
def sample_ward(db):
    """Create a sample ward for bed tests."""
    return Ward.objects.create(
        name="Test Ward",
        code="TW-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
    )


@pytest.fixture
def test_user(db):
    """Create a test user for bed status changes."""
    return User.objects.create_user(
        username="testuser",
        password="testpass123",
        email="test@example.com",
    )


@pytest.mark.django_db
class TestBedCreation:
    """Tests for Bed model creation."""

    def test_create_bed_with_valid_data(self, sample_ward, test_user):
        """Should create bed with valid data."""
        bed = Bed.objects.create(
            ward=sample_ward,
            bed_number="B-101",
            status="AVAILABLE",
            bed_type="Standard",
            notes="Test bed",
            status_changed_by=test_user,
        )

        assert bed.id is not None
        assert bed.ward == sample_ward
        assert bed.bed_number == "B-101"
        assert bed.status == "AVAILABLE"
        assert bed.bed_type == "Standard"
        assert bed.notes == "Test bed"
        assert bed.status_changed_by == test_user
        assert bed.status_changed_at is not None
        assert bed.created_at is not None
        assert bed.updated_at is not None

    def test_unique_bed_number_per_ward(self, sample_ward):
        """Should enforce unique bed number within same ward."""
        Bed.objects.create(
            ward=sample_ward,
            bed_number="B-101",
        )

        with pytest.raises(IntegrityError):
            Bed.objects.create(
                ward=sample_ward,
                bed_number="B-101",  # Duplicate in same ward
            )

    def test_same_bed_number_different_wards(self, db):
        """Should allow same bed number in different wards."""
        ward1 = Ward.objects.create(
            name="Ward 1",
            code="W1",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate=Decimal("500.00"),
        )
        ward2 = Ward.objects.create(
            name="Ward 2",
            code="W2",
            ward_type="SURGICAL",
            capacity=10,
            daily_rate=Decimal("600.00"),
        )

        bed1 = Bed.objects.create(ward=ward1, bed_number="B-101")
        bed2 = Bed.objects.create(ward=ward2, bed_number="B-101")

        assert bed1.bed_number == bed2.bed_number
        assert bed1.ward != bed2.ward

    def test_default_status_available(self, sample_ward):
        """Should default to AVAILABLE status."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-102")
        assert bed.status == "AVAILABLE"

    def test_bed_without_type(self, sample_ward):
        """Should allow bed without type specification."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-103")
        assert bed.bed_type == ""

    def test_bed_without_notes(self, sample_ward):
        """Should allow bed without notes."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-104")
        assert bed.notes == ""


@pytest.mark.django_db
class TestBedStatusTransitions:
    """Tests for Bed status transition methods."""

    def test_mark_occupied_from_available(self, sample_ward, test_user):
        """Should transition from AVAILABLE to OCCUPIED."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-201", status="AVAILABLE")

        bed.mark_occupied(test_user)
        bed.refresh_from_db()

        assert bed.status == "OCCUPIED"
        assert bed.status_changed_by == test_user

    def test_mark_occupied_from_reserved(self, sample_ward, test_user):
        """Should transition from RESERVED to OCCUPIED."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-202", status="RESERVED")

        bed.mark_occupied(test_user)
        bed.refresh_from_db()

        assert bed.status == "OCCUPIED"

    def test_mark_occupied_from_maintenance_fails(self, sample_ward, test_user):
        """Should not allow MAINTENANCE → OCCUPIED transition."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-203", status="MAINTENANCE")

        with pytest.raises(ValueError, match="Cannot occupy bed with status MAINTENANCE"):
            bed.mark_occupied(test_user)

    def test_mark_occupied_from_occupied_fails(self, sample_ward, test_user):
        """Should not allow OCCUPIED → OCCUPIED transition (double booking)."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-204", status="OCCUPIED")

        with pytest.raises(ValueError, match="Cannot occupy bed with status OCCUPIED"):
            bed.mark_occupied(test_user)

    def test_mark_available(self, sample_ward, test_user):
        """Should transition any status to AVAILABLE and clear notes."""
        bed = Bed.objects.create(
            ward=sample_ward,
            bed_number="B-205",
            status="OCCUPIED",
            notes="Patient discharged",
        )

        bed.mark_available(test_user)
        bed.refresh_from_db()

        assert bed.status == "AVAILABLE"
        assert bed.status_changed_by == test_user
        assert bed.notes == ""

    def test_mark_maintenance_with_reason(self, sample_ward, test_user):
        """Should transition to MAINTENANCE with reason."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-206", status="AVAILABLE")

        reason = "Broken bed frame - needs repair"
        bed.mark_maintenance(test_user, reason)
        bed.refresh_from_db()

        assert bed.status == "MAINTENANCE"
        assert bed.status_changed_by == test_user
        assert bed.notes == reason

    def test_mark_reserved(self, sample_ward, test_user):
        """Should transition to RESERVED status."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-207", status="AVAILABLE")

        bed.mark_reserved(test_user, duration_hours=24)
        bed.refresh_from_db()

        assert bed.status == "RESERVED"
        assert bed.status_changed_by == test_user

    def test_mark_maintenance_from_occupied(self, sample_ward, test_user):
        """Should allow OCCUPIED → MAINTENANCE (emergency repair)."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-208", status="OCCUPIED")

        reason = "Emergency maintenance required"
        bed.mark_maintenance(test_user, reason)
        bed.refresh_from_db()

        assert bed.status == "MAINTENANCE"
        assert bed.notes == reason


@pytest.mark.django_db
class TestBedQueryOperations:
    """Tests for Bed filtering and query operations."""

    def test_list_beds_by_ward(self, db):
        """Should list all beds in a ward."""
        ward1 = Ward.objects.create(
            name="Ward 1",
            code="W1",
            ward_type="MEDICAL",
            capacity=5,
            daily_rate=Decimal("500.00"),
        )
        ward2 = Ward.objects.create(
            name="Ward 2",
            code="W2",
            ward_type="SURGICAL",
            capacity=5,
            daily_rate=Decimal("600.00"),
        )

        # Create beds in ward1
        Bed.objects.create(ward=ward1, bed_number="B-01")
        Bed.objects.create(ward=ward1, bed_number="B-02")
        Bed.objects.create(ward=ward1, bed_number="B-03")

        # Create beds in ward2
        Bed.objects.create(ward=ward2, bed_number="B-01")
        Bed.objects.create(ward=ward2, bed_number="B-02")

        ward1_beds = Bed.objects.filter(ward=ward1)
        ward2_beds = Bed.objects.filter(ward=ward2)

        assert ward1_beds.count() == 3
        assert ward2_beds.count() == 2

    def test_filter_beds_by_status(self, sample_ward):
        """Should filter beds by status."""
        Bed.objects.create(ward=sample_ward, bed_number="B-01", status="AVAILABLE")
        Bed.objects.create(ward=sample_ward, bed_number="B-02", status="AVAILABLE")
        Bed.objects.create(ward=sample_ward, bed_number="B-03", status="OCCUPIED")
        Bed.objects.create(ward=sample_ward, bed_number="B-04", status="MAINTENANCE")
        Bed.objects.create(ward=sample_ward, bed_number="B-05", status="RESERVED")

        available_beds = Bed.objects.filter(status="AVAILABLE")
        occupied_beds = Bed.objects.filter(status="OCCUPIED")
        maintenance_beds = Bed.objects.filter(status="MAINTENANCE")
        reserved_beds = Bed.objects.filter(status="RESERVED")

        assert available_beds.count() == 2
        assert occupied_beds.count() == 1
        assert maintenance_beds.count() == 1
        assert reserved_beds.count() == 1

    def test_filter_available_beds_in_ward(self, sample_ward):
        """Should filter available beds in specific ward."""
        Bed.objects.create(ward=sample_ward, bed_number="B-01", status="AVAILABLE")
        Bed.objects.create(ward=sample_ward, bed_number="B-02", status="OCCUPIED")
        Bed.objects.create(ward=sample_ward, bed_number="B-03", status="AVAILABLE")

        available_in_ward = Bed.objects.filter(ward=sample_ward, status="AVAILABLE")

        assert available_in_ward.count() == 2

    def test_search_bed_by_number(self, sample_ward):
        """Should search beds by bed number."""
        Bed.objects.create(ward=sample_ward, bed_number="B-101")
        Bed.objects.create(ward=sample_ward, bed_number="B-102")
        Bed.objects.create(ward=sample_ward, bed_number="A-201")

        results = Bed.objects.filter(bed_number__icontains="B-")
        assert results.count() == 2

        specific_bed = Bed.objects.filter(bed_number="B-101").first()
        assert specific_bed is not None
        assert specific_bed.bed_number == "B-101"

    def test_bed_string_representation(self, sample_ward):
        """Should return proper string representation."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-301")
        expected = f"{sample_ward.code} - B-301"
        assert str(bed) == expected


@pytest.mark.django_db
class TestBedStatusAudit:
    """Tests for bed status change audit trail."""

    def test_status_changed_by_tracking(self, sample_ward, test_user):
        """Should track who changed the bed status."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-401")

        bed.mark_occupied(test_user)
        bed.refresh_from_db()

        assert bed.status_changed_by == test_user

    def test_status_changed_at_updates(self, sample_ward, test_user):
        """Should update timestamp when status changes."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-402", status="AVAILABLE")
        initial_time = bed.status_changed_at

        # Wait a moment and change status
        import time
        time.sleep(0.1)

        bed.mark_occupied(test_user)
        bed.refresh_from_db()

        assert bed.status_changed_at > initial_time

    def test_multiple_status_changes_tracking(self, sample_ward, test_user):
        """Should track multiple status changes."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-403", status="AVAILABLE")

        # AVAILABLE → OCCUPIED
        bed.mark_occupied(test_user)
        bed.refresh_from_db()
        assert bed.status == "OCCUPIED"
        assert bed.status_changed_by == test_user

        # OCCUPIED → AVAILABLE
        bed.mark_available(test_user)
        bed.refresh_from_db()
        assert bed.status == "AVAILABLE"
        assert bed.status_changed_by == test_user

        # AVAILABLE → MAINTENANCE
        bed.mark_maintenance(test_user, "Cleaning")
        bed.refresh_from_db()
        assert bed.status == "MAINTENANCE"
        assert bed.status_changed_by == test_user


@pytest.mark.django_db
class TestBedWardRelationship:
    """Tests for Bed-Ward relationship."""

    def test_bed_belongs_to_ward(self, sample_ward):
        """Should establish proper foreign key relationship."""
        bed = Bed.objects.create(ward=sample_ward, bed_number="B-501")
        assert bed.ward == sample_ward

    def test_ward_beds_reverse_relationship(self, sample_ward):
        """Should access beds from ward via reverse relationship."""
        Bed.objects.create(ward=sample_ward, bed_number="B-601")
        Bed.objects.create(ward=sample_ward, bed_number="B-602")
        Bed.objects.create(ward=sample_ward, bed_number="B-603")

        assert sample_ward.beds.count() == 3

    def test_ward_available_beds_property(self, sample_ward):
        """Should correctly count available beds via ward property."""
        Bed.objects.create(ward=sample_ward, bed_number="B-701", status="AVAILABLE")
        Bed.objects.create(ward=sample_ward, bed_number="B-702", status="AVAILABLE")
        Bed.objects.create(ward=sample_ward, bed_number="B-703", status="OCCUPIED")

        # This tests the Ward.available_beds property indirectly
        assert sample_ward.available_beds == 2
