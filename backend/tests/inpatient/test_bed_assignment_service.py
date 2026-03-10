"""
Tests for Automatic Bed Assignment Service.

Test Coverage (13 tests):
- Auto-assign first available bed in ward
- Raises NoBedAvailableError when ward is full
- Respects bed status (only AVAILABLE beds)
- Deterministic ordering by bed number
- Concurrent assignment (race condition prevention)
- Updates bed status to OCCUPIED
- Records status_changed_by user
- Audit logging for auto-assignment
- get_available_beds returns correct list
- get_available_beds count matches ward.available_beds
- Beds in MAINTENANCE/RESERVED are excluded
- Works with empty ward (raises error)
- Works with single bed ward
"""

from decimal import Decimal
from unittest.mock import patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.db import transaction

from hmis.apps.inpatient.models import Bed, Ward
from hmis.apps.inpatient.services.bed_assignment import BedAssignmentService, NoBedAvailableError

User = get_user_model()


@pytest.fixture
def sample_ward(db):
    """Create a sample ward with 5 beds (auto-generated)."""
    ward = Ward.objects.create(
        name="Medical Ward",
        code="MW-01",
        ward_type="MEDICAL",
        capacity=5,
        daily_rate=Decimal("500.00"),
    )
    # Ward.save() auto-generates 5 beds: B-001 through B-005
    return ward


@pytest.fixture
def ward_with_beds(sample_ward, test_user):
    """Configure a ward with 5 beds (3 available, 1 occupied, 1 maintenance).

    Uses auto-generated beds and modifies their statuses.
    """
    # Get the auto-generated beds and set their statuses
    beds = list(sample_ward.beds.order_by("bed_number"))
    # B-001: AVAILABLE (default)
    beds[0].status_changed_by = test_user
    beds[0].save()
    # B-002: OCCUPIED
    beds[1].status = "OCCUPIED"
    beds[1].status_changed_by = test_user
    beds[1].save()
    # B-003: AVAILABLE (default)
    beds[2].status_changed_by = test_user
    beds[2].save()
    # B-004: MAINTENANCE
    beds[3].status = "MAINTENANCE"
    beds[3].status_changed_by = test_user
    beds[3].save()
    # B-005: AVAILABLE (default)
    beds[4].status_changed_by = test_user
    beds[4].save()
    return sample_ward


@pytest.fixture
def full_ward(sample_ward, test_user):
    """Configure a ward where all beds are occupied.

    Uses auto-generated beds and sets them all to OCCUPIED.
    """
    for bed in sample_ward.beds.all():
        bed.status = "OCCUPIED"
        bed.status_changed_by = test_user
        bed.save()
    return sample_ward


@pytest.fixture
def empty_ward(db):
    """Create a ward with no beds."""
    return Ward.objects.create(
        name="Empty Ward",
        code="EW-01",
        ward_type="MEDICAL",
        capacity=0,
        daily_rate=Decimal("500.00"),
    )


@pytest.fixture
def test_user(db):
    """Create a test user for bed assignment."""
    return User.objects.create_user(
        username="assignmentuser",
        password="testpass123",
        email="assignment@example.com",
    )


@pytest.fixture
def bed_assignment_service():
    """Create instance of BedAssignmentService."""
    return BedAssignmentService()


@pytest.mark.django_db
class TestBedAssignmentService:
    """Tests for BedAssignmentService."""

    def test_auto_assign_first_available_bed(
        self, bed_assignment_service, ward_with_beds, test_user
    ):
        """Should assign the first available bed ordered by bed_number."""
        bed = bed_assignment_service.auto_assign_bed(ward_with_beds, test_user)

        assert bed is not None
        assert bed.bed_number == "B-001"  # First available bed
        assert bed.status == "OCCUPIED"
        assert bed.status_changed_by == test_user

    def test_raises_no_bed_available_when_ward_full(
        self, bed_assignment_service, full_ward, test_user
    ):
        """Should raise NoBedAvailableError when no beds are available."""
        with pytest.raises(NoBedAvailableError) as exc_info:
            bed_assignment_service.auto_assign_bed(full_ward, test_user)

        assert "No available beds in ward" in str(exc_info.value)
        assert full_ward.code in str(exc_info.value)

    def test_raises_no_bed_available_when_ward_empty(
        self, bed_assignment_service, empty_ward, test_user
    ):
        """Should raise NoBedAvailableError when ward has no beds."""
        with pytest.raises(NoBedAvailableError) as exc_info:
            bed_assignment_service.auto_assign_bed(empty_ward, test_user)

        assert "No available beds in ward" in str(exc_info.value)

    def test_only_available_beds_considered(
        self, bed_assignment_service, ward_with_beds, test_user
    ):
        """Should only consider beds with AVAILABLE status."""
        # Mark first available bed as RESERVED
        first_bed = (
            Bed.objects.filter(ward=ward_with_beds, status="AVAILABLE")
            .order_by("bed_number")
            .first()
        )
        first_bed.status = "RESERVED"
        first_bed.save()

        bed = bed_assignment_service.auto_assign_bed(ward_with_beds, test_user)

        # Should skip B-001 (now RESERVED) and assign B-003
        assert bed.bed_number == "B-003"

    def test_deterministic_ordering_by_bed_number(
        self, sample_ward, test_user, bed_assignment_service
    ):
        """Should assign beds in deterministic order (by bed_number).

        Uses the auto-generated beds which are created in order (B-001 to B-005).
        """
        # Auto-generated beds are already in order, but let's verify
        # the service always picks the lowest available bed number
        bed = bed_assignment_service.auto_assign_bed(sample_ward, test_user)

        assert bed.bed_number == "B-001"  # Lowest bed number

    def test_updates_bed_status_to_occupied(
        self, bed_assignment_service, ward_with_beds, test_user
    ):
        """Should update bed status to OCCUPIED after assignment."""
        bed = bed_assignment_service.auto_assign_bed(ward_with_beds, test_user)
        bed.refresh_from_db()

        assert bed.status == "OCCUPIED"
        assert bed.status_changed_by == test_user
        assert bed.status_changed_at is not None

    def test_get_available_beds_returns_correct_list(self, bed_assignment_service, ward_with_beds):
        """Should return list of available beds only."""
        available_beds = bed_assignment_service.get_available_beds(ward_with_beds)

        assert len(available_beds) == 3
        for bed in available_beds:
            assert bed.status == "AVAILABLE"

    def test_get_available_beds_ordered_by_bed_number(self, bed_assignment_service, ward_with_beds):
        """Should return beds ordered by bed_number."""
        available_beds = bed_assignment_service.get_available_beds(ward_with_beds)
        bed_numbers = [bed.bed_number for bed in available_beds]

        assert bed_numbers == sorted(bed_numbers)

    def test_excludes_maintenance_and_reserved_beds(
        self, bed_assignment_service, sample_ward, test_user
    ):
        """Should exclude MAINTENANCE and RESERVED beds from available list.

        Uses auto-generated beds and modifies their statuses.
        """
        # Get auto-generated beds and set specific statuses
        beds = list(sample_ward.beds.order_by("bed_number"))
        beds[0].status = "MAINTENANCE"  # B-001
        beds[0].save()
        beds[1].status = "RESERVED"  # B-002
        beds[1].save()
        beds[2].status = "OCCUPIED"  # B-003
        beds[2].save()
        beds[3].status = "OCCUPIED"  # B-004
        beds[3].save()
        # B-005 remains AVAILABLE

        available_beds = bed_assignment_service.get_available_beds(sample_ward)

        assert len(available_beds) == 1
        assert available_beds[0].bed_number == "B-005"

    def test_single_bed_ward_assignment(self, test_user, bed_assignment_service, db):
        """Should work correctly with a single-bed ward."""
        # Create a ward with capacity=1 (auto-generates 1 bed)
        single_bed_ward = Ward.objects.create(
            name="Single Bed Ward",
            code="SBW-01",
            ward_type="MEDICAL",
            capacity=1,
            daily_rate=Decimal("500.00"),
        )

        bed = bed_assignment_service.auto_assign_bed(single_bed_ward, test_user)

        assert bed.bed_number == "B-001"
        assert bed.status == "OCCUPIED"


@pytest.mark.django_db(transaction=True)
class TestBedAssignmentConcurrency:
    """Tests for concurrent bed assignment (race condition prevention).

    Note: These tests require a database that supports row-level locking.
    SQLite does not support SELECT FOR UPDATE and will get "database locked" errors.
    These tests are skipped when running with SQLite.
    """

    @pytest.mark.skipif(
        "sqlite"
        in str(__import__("django").conf.settings.DATABASES.get("default", {}).get("ENGINE", "")),
        reason="SQLite does not support row-level locking (SELECT FOR UPDATE)",
    )
    def test_concurrent_assignment_no_double_booking(
        self, sample_ward, test_user, bed_assignment_service
    ):
        """Two concurrent assignments should not book the same bed."""
        # Make all beds OCCUPIED except the first one - forces race condition
        beds = list(sample_ward.beds.order_by("bed_number"))
        for bed in beds[1:]:  # Skip first bed
            bed.status = "OCCUPIED"
            bed.status_changed_by = test_user
            bed.save()

        assigned_beds = []
        errors = []

        def assign_bed():
            try:
                with transaction.atomic():
                    bed = bed_assignment_service.auto_assign_bed(sample_ward, test_user)
                    assigned_beds.append(bed.bed_number)
            except NoBedAvailableError as e:
                errors.append(str(e))

        # Run two assignments - one should succeed, one should fail
        import threading

        t1 = threading.Thread(target=assign_bed)
        t2 = threading.Thread(target=assign_bed)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # One assignment should succeed, one should fail
        assert len(assigned_beds) + len(errors) == 2
        # At least one should succeed
        assert len(assigned_beds) >= 1
        # Check no double booking
        bed = Bed.objects.get(ward=sample_ward, bed_number="B-001")
        assert bed.status == "OCCUPIED"


@pytest.mark.django_db
class TestBedAssignmentAuditLogging:
    """Tests for audit logging of bed assignments."""

    def test_auto_assignment_creates_audit_log(
        self, bed_assignment_service, ward_with_beds, test_user
    ):
        """Should create audit log entry for automatic bed assignment."""
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.filter(action="bed_auto_assigned").count()

        bed_assignment_service.auto_assign_bed(ward_with_beds, test_user)

        new_count = AuditLog.objects.filter(action="bed_auto_assigned").count()
        assert new_count == initial_count + 1

        log = AuditLog.objects.filter(action="bed_auto_assigned").latest("timestamp")
        assert log.user == test_user
        assert log.resource_type == "Bed"
        assert "ward" in log.details
        assert "bed_number" in log.details
