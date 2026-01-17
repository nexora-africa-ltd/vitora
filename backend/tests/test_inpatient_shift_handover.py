"""
Tests for ShiftHandover model.

Sprint 1.5-1.6 Track D: Inpatient Foundation - Phase 4c
Test coverage: 8 tests for shift handover functionality
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.inpatient.models import ShiftHandover, Ward


@pytest.fixture
def inpatient_ward(db):
    """Create an inpatient ward for testing."""
    return Ward.objects.create(
        name="Medical Ward 1",
        code="MED-01",
        ward_type="MEDICAL",
        capacity=20,
        daily_rate=Decimal("500.00"),
    )


@pytest.mark.django_db
class TestShiftHandoverCreation:
    """Tests for ShiftHandover creation and validation."""

    def test_create_shift_handover_with_valid_data(self, inpatient_ward, test_user, another_user):
        """Should create shift handover with valid data."""
        handover = ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=date.today(),
            shift_ending="DAY",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=15,
            critical_patients=2,
            new_admissions=3,
            discharges_pending=1,
            general_notes="Busy shift, 3 new admissions in morning",
        )

        assert handover.ward == inpatient_ward
        assert handover.shift_ending == "DAY"
        assert handover.total_patients == 15
        assert handover.critical_patients == 2
        assert handover.acknowledged_at is None

    def test_shift_handover_unique_constraint(self, inpatient_ward, test_user, another_user):
        """Should prevent duplicate handover for same ward, date, and shift."""
        shift_date = date.today()

        # Create first handover
        ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=shift_date,
            shift_ending="DAY",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=10,
        )

        # Attempt to create duplicate
        with pytest.raises(ValidationError):
            handover = ShiftHandover(
                ward=inpatient_ward,
                shift_date=shift_date,
                shift_ending="DAY",
                outgoing_nurse=another_user,
                incoming_nurse=test_user,
                total_patients=10,
            )
            handover.full_clean()

    def test_shift_ending_choices_validation(self, inpatient_ward, test_user, another_user):
        """Should validate shift_ending is DAY or EVENING or NIGHT."""
        # Valid shift endings
        for shift in ["DAY", "EVENING", "NIGHT"]:
            handover = ShiftHandover(
                ward=inpatient_ward,
                shift_date=date.today(),
                shift_ending=shift,
                outgoing_nurse=test_user,
                incoming_nurse=another_user,
                total_patients=10,
            )
            handover.full_clean()  # Should not raise

        # Invalid shift
        with pytest.raises(ValidationError):
            handover = ShiftHandover(
                ward=inpatient_ward,
                shift_date=date.today(),
                shift_ending="INVALID",
                outgoing_nurse=test_user,
                incoming_nurse=another_user,
                total_patients=10,
            )
            handover.full_clean()


@pytest.mark.django_db
class TestShiftHandoverAcknowledgment:
    """Tests for shift handover acknowledgment."""

    def test_acknowledge_handover(self, inpatient_ward, test_user, another_user):
        """Should acknowledge handover and set timestamp."""
        handover = ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=date.today(),
            shift_ending="DAY",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=10,
        )

        assert handover.acknowledged_at is None

        # Acknowledge handover
        handover.acknowledge(another_user)

        handover.refresh_from_db()
        assert handover.acknowledged_at is not None
        assert handover.is_acknowledged is True

    def test_handover_is_acknowledged_property(self, inpatient_ward, test_user, another_user):
        """Should have is_acknowledged property."""
        handover = ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=date.today(),
            shift_ending="NIGHT",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=8,
        )

        assert handover.is_acknowledged is False

        handover.acknowledged_at = timezone.now()
        handover.save()

        assert handover.is_acknowledged is True


@pytest.mark.django_db
class TestShiftHandoverPatientCounts:
    """Tests for patient count auto-population."""

    def test_auto_populate_patient_counts_from_ward(self, inpatient_ward, test_user, another_user):
        """Should provide method to auto-populate counts from ward data."""
        handover = ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=date.today(),
            shift_ending="DAY",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=0,  # Will be populated
        )

        # Call auto-populate method
        handover.auto_populate_counts()

        # Should have calculated counts (will be 0 if no admissions in test)
        assert handover.total_patients >= 0
        assert handover.critical_patients >= 0
        assert handover.new_admissions >= 0
        assert handover.discharges_pending >= 0


@pytest.mark.django_db
class TestShiftHandoverQueries:
    """Tests for querying shift handovers."""

    def test_handovers_by_ward(self, inpatient_ward, test_user, another_user):
        """Should filter handovers by ward."""
        # Create handover for inpatient_ward
        ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=date.today(),
            shift_ending="DAY",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=10,
        )

        # Query handovers for this ward
        handovers = ShiftHandover.objects.filter(ward=inpatient_ward)
        assert handovers.count() == 1

    def test_unacknowledged_handovers(self, inpatient_ward, test_user, another_user):
        """Should query unacknowledged handovers."""
        # Create unacknowledged handover
        ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=date.today(),
            shift_ending="DAY",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=10,
        )

        # Create acknowledged handover
        acknowledged = ShiftHandover.objects.create(
            ward=inpatient_ward,
            shift_date=date(2026, 1, 2),
            shift_ending="NIGHT",
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            total_patients=8,
            acknowledged_at=timezone.now(),
        )

        # Query unacknowledged
        unacknowledged = ShiftHandover.objects.filter(acknowledged_at__isnull=True)
        assert unacknowledged.count() == 1
        assert acknowledged not in unacknowledged
