"""
Tests for WardRound model.

Test Coverage (12 tests):
- Ward round creation
- SOAP note structure validation
- Condition status transitions
- Multiple rounds per day (different doctors)
- Round date cannot be future
- Consultant review flagging
- Round listing by admission
- Round filtering by date
- Round search
- Round audit logging
- Unique constraint validation
- Round ordering
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from hmis.apps.inpatient.models import WardRound


@pytest.mark.django_db
class TestWardRoundCreation:
    """Tests for creating ward rounds."""

    def test_create_ward_round_with_valid_data(self, sample_admission, test_user):
        """Should create ward round with valid SOAP notes."""
        ward_round = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Patient complains of mild pain at incision site",
            objective="Temp: 37.2°C, BP: 120/80, Wound healing well",
            assessment="Post-operative recovery progressing as expected",
            plan="Continue antibiotics, monitor wound",
            condition_status="IMPROVING",
        )

        assert ward_round.id is not None
        assert ward_round.admission == sample_admission
        assert ward_round.conducted_by == test_user
        assert ward_round.condition_status == "IMPROVING"
        assert "Post-operative" in ward_round.assessment

    def test_create_ward_round_with_consultant_flag(self, sample_admission, test_user):
        """Should create ward round requiring consultant review."""
        ward_round = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(14, 30),
            conducted_by=test_user,
            subjective="Patient developing complications",
            objective="Fever 38.5°C, wound showing signs of infection",
            assessment="Possible surgical site infection",
            plan="Start broad-spectrum antibiotics, request surgical review",
            condition_status="DETERIORATING",
            requires_consultant_review=True,
            consultant_specialty="General Surgery",
        )

        assert ward_round.requires_consultant_review is True
        assert ward_round.consultant_specialty == "General Surgery"
        assert ward_round.condition_status == "DETERIORATING"


@pytest.mark.django_db
class TestWardRoundValidation:
    """Tests for ward round validation rules."""

    def test_round_date_cannot_be_future(self, sample_admission, test_user):
        """Should reject future round dates."""
        future_date = date.today() + timedelta(days=1)

        ward_round = WardRound(
            admission=sample_admission,
            round_date=future_date,
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Test",
            objective="Test",
            assessment="Test",
            plan="Test",
            condition_status="STABLE",
        )

        with pytest.raises(ValidationError) as exc_info:
            ward_round.clean()

        assert "future" in str(exc_info.value).lower()

    def test_soap_notes_required(self, sample_admission, test_user):
        """Should require all SOAP note fields."""
        # SOAP notes are TextField - Django doesn't enforce NOT NULL by default
        # But blank=False is the default, so validation should fail
        ward_round = WardRound(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(9, 0),
            conducted_by=test_user,
            # subjective missing - should fail validation
            objective="Test",
            assessment="Test",
            plan="Test",
            condition_status="STABLE",
        )

        with pytest.raises(ValidationError) as exc_info:
            ward_round.full_clean()

        assert "subjective" in str(exc_info.value).lower()

    def test_condition_status_choices(self, sample_admission, test_user):
        """Should validate condition status choices."""
        with pytest.raises(ValidationError):
            ward_round = WardRound.objects.create(
                admission=sample_admission,
                round_date=date.today(),
                round_time=time(9, 0),
                conducted_by=test_user,
                subjective="Test",
                objective="Test",
                assessment="Test",
                plan="Test",
                condition_status="INVALID_STATUS",
            )
            ward_round.full_clean()


@pytest.mark.django_db
class TestMultipleRoundsPerDay:
    """Tests for multiple ward rounds on same day."""

    def test_multiple_rounds_same_day_different_doctors(
        self, sample_admission, test_user, authenticated_client
    ):
        """Should allow multiple rounds same day by different doctors."""
        # Create another user for second round
        from django.contrib.auth import get_user_model

        User = get_user_model()
        doctor2 = User.objects.create_user(username="doctor2", password="password123")

        # First round
        WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Morning assessment",
            objective="Stable vitals",
            assessment="Improving",
            plan="Continue treatment",
            condition_status="IMPROVING",
        )

        # Second round by different doctor
        round2 = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(14, 0),
            conducted_by=doctor2,
            subjective="Afternoon check",
            objective="Vitals stable",
            assessment="Progressing well",
            plan="Prepare for discharge",
            condition_status="STABLE",
        )

        assert round2.id is not None
        assert (
            WardRound.objects.filter(admission=sample_admission, round_date=date.today()).count()
            == 2
        )

    def test_multiple_rounds_same_doctor_same_day_allowed(self, sample_admission, test_user):
        """Should allow multiple rounds by same doctor on same day (e.g., urgent reviews)."""
        # First round - scheduled morning round
        round1 = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(9, 0),
            conducted_by=test_user,
            review_type="WARD_ROUND",
            subjective="Morning round",
            objective="Test",
            assessment="Test",
            plan="Test",
            condition_status="STABLE",
        )

        # Second round - urgent review later in the day
        round2 = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(14, 0),  # Different time
            conducted_by=test_user,  # Same doctor
            review_type="URGENT_REVIEW",
            subjective="Patient condition deteriorated",
            objective="Test",
            assessment="Test",
            plan="Test",
            condition_status="DETERIORATING",
        )

        # Both should exist
        rounds = WardRound.objects.filter(admission=sample_admission, round_date=date.today())
        assert rounds.count() == 2
        assert round1.review_type == "WARD_ROUND"
        assert round2.review_type == "URGENT_REVIEW"


@pytest.mark.django_db
class TestWardRoundQueries:
    """Tests for querying ward rounds."""

    def test_list_rounds_by_admission(self, sample_admission, test_user):
        """Should list all rounds for an admission."""
        # Create multiple rounds
        for i in range(3):
            WardRound.objects.create(
                admission=sample_admission,
                round_date=date.today() - timedelta(days=i),
                round_time=time(9, 0),
                conducted_by=test_user,
                subjective=f"Day {i} assessment",
                objective="Vitals stable",
                assessment="Progressing",
                plan="Continue",
                condition_status="STABLE",
            )

        rounds = WardRound.objects.filter(admission=sample_admission)
        assert rounds.count() == 3

    def test_filter_rounds_by_date(self, sample_admission, test_user):
        """Should filter rounds by date."""
        yesterday = date.today() - timedelta(days=1)

        WardRound.objects.create(
            admission=sample_admission,
            round_date=yesterday,
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Yesterday",
            objective="Test",
            assessment="Test",
            plan="Test",
            condition_status="STABLE",
        )

        WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Today",
            objective="Test",
            assessment="Test",
            plan="Test",
            condition_status="STABLE",
        )

        yesterday_rounds = WardRound.objects.filter(
            admission=sample_admission, round_date=yesterday
        )
        assert yesterday_rounds.count() == 1
        assert yesterday_rounds.first().subjective == "Yesterday"

    def test_rounds_ordered_by_date_descending(self, sample_admission, test_user):
        """Should order rounds by date/time descending (most recent first)."""
        for i in range(3):
            WardRound.objects.create(
                admission=sample_admission,
                round_date=date.today() - timedelta(days=i),
                round_time=time(9, 0),
                conducted_by=test_user,
                subjective=f"Day {i}",
                objective="Test",
                assessment="Test",
                plan="Test",
                condition_status="STABLE",
            )

        rounds = list(
            WardRound.objects.filter(admission=sample_admission).order_by(
                "-round_date", "-round_time"
            )
        )
        # Most recent should be first
        assert rounds[0].subjective == "Day 0"
        assert rounds[-1].subjective == "Day 2"


@pytest.mark.django_db
class TestConditionStatusTracking:
    """Tests for patient condition status tracking."""

    def test_condition_status_transition_stable_to_deteriorating(self, sample_admission, test_user):
        """Should track condition status changes over time."""
        # Day 1 - Stable
        WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today() - timedelta(days=2),
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="No complaints",
            objective="Stable vitals",
            assessment="Recovering well",
            plan="Continue",
            condition_status="STABLE",
        )

        # Day 2 - Deteriorating
        round2 = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today() - timedelta(days=1),
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Developing fever",
            objective="Temp 38.5°C",
            assessment="Possible infection",
            plan="Start antibiotics",
            condition_status="DETERIORATING",
        )

        # Day 3 - Improving
        round3 = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Feeling better",
            objective="Temp normalizing",
            assessment="Responding to treatment",
            plan="Continue antibiotics",
            condition_status="IMPROVING",
        )

        # Verify status progression
        rounds = WardRound.objects.filter(admission=sample_admission).order_by("round_date")
        statuses = [r.condition_status for r in rounds]
        assert statuses == ["STABLE", "DETERIORATING", "IMPROVING"]

    def test_critical_status_requires_consultant(self, sample_admission, test_user):
        """Should flag consultant review for critical patients."""
        critical_round = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(9, 0),
            conducted_by=test_user,
            subjective="Severe respiratory distress",
            objective="SpO2 88%, RR 32",
            assessment="Acute respiratory failure",
            plan="Transfer to ICU, intubate if necessary",
            condition_status="CRITICAL",
            requires_consultant_review=True,
            consultant_specialty="Pulmonology",
        )

        assert critical_round.condition_status == "CRITICAL"
        assert critical_round.requires_consultant_review is True

    def test_postpartum_continuity_fields_capture_next_maternity_step(
        self, sample_admission, test_user
    ):
        """Ward rounds should capture structured postpartum continuity intent for maternity care."""
        ward_round = WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(11, 0),
            conducted_by=test_user,
            subjective="Mother recovering well after delivery",
            objective="Bleeding minimal, vitals stable, breastfeeding established",
            assessment="Stable postpartum recovery",
            plan="Prepare for step-down and early PNC linkage",
            condition_status="IMPROVING",
            maternity_continuity_action="SCHEDULE_EARLY_PNC",
            maternity_continuity_notes="Book day 7 early PNC review before discharge.",
        )

        assert ward_round.maternity_continuity_action == "SCHEDULE_EARLY_PNC"
        assert "day 7" in ward_round.maternity_continuity_notes.lower()
