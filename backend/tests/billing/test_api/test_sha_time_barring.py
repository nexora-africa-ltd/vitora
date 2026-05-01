"""
Tests for DHA HIE Time-Barring Alerts (Phase 2.3).

Validates:
- time_barring_deadline property on SHAClaim
- is_time_barred property
- hours_until_time_barred property
- flag_time_barring_claims Celery task

Test Coverage:
- Emergency claims get 24h deadline from service_date
- Query claims get 14-day deadline from updated_at
- Normal draft claims have no deadline
- is_time_barred returns True when past deadline
- Celery task emits warning/time-barred events
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone

from hmis.apps.billing.models import SHAClaim, SHAMember, SHATariff
from hmis.apps.billing.tasks import flag_time_barring_claims
from tests.conftest import ensure_staff_profile

User = get_user_model()


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username="timebaruser", email="timebar@test.com", password="testpass123"
    )


@pytest.fixture
def sample_sha_member(db, sample_patient, test_user):
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-TIMEBAR-001",
        national_id="88888888",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        created_by=test_user,
    )


@pytest.fixture
def sample_sha_tariff(db):
    return SHATariff.objects.create(
        code="SHA-TIMEBAR-001",
        name="Time Bar Test Tariff",
        category=SHATariff.TariffCategory.CONSULTATION,
        sha_amount=Decimal("500.00"),
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        effective_date=date.today() - timedelta(days=30),
        is_active=True,
        max_quantity_per_claim=1,
    )


@pytest.fixture
def emergency_claim(db, sample_sha_member, sample_encounter, test_user, sample_facility):
    """Emergency claim created yesterday (approaching 24h deadline)."""
    claim = SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.EMERGENCY,
        is_emergency_claim=True,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today() - timedelta(days=1),
        primary_diagnosis_code="R07.9",
        primary_diagnosis_description="Chest pain",
        facility=sample_facility,
        facility_code="12345",
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        created_by=test_user,
    )
    return claim


@pytest.fixture
def query_claim(db, sample_sha_member, sample_encounter, test_user, sample_facility):
    """Claim in QUERY status (awaiting attachments)."""
    claim = SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.QUERY,
        service_date=date.today() - timedelta(days=7),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="URTI",
        facility=sample_facility,
        facility_code="12345",
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        created_by=test_user,
    )
    return claim


@pytest.fixture
def normal_draft_claim(db, sample_sha_member, sample_encounter, test_user, sample_facility):
    """Normal draft claim with no time-barring deadline."""
    claim = SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="URTI",
        facility=sample_facility,
        facility_code="12345",
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        created_by=test_user,
    )
    return claim


# =============================================================================
# Tests — Properties
# =============================================================================


class TestTimeBarringDeadline:
    """Tests for SHAClaim.time_barring_deadline property."""

    def test_emergency_claim_has_24h_deadline(self, emergency_claim):
        """Emergency claims have a 24-hour deadline from service_date."""
        deadline = emergency_claim.time_barring_deadline
        assert deadline is not None
        # Deadline should be approximately 24h after service_date midnight
        expected = timezone.make_aware(
            datetime.combine(emergency_claim.service_date, datetime.min.time())
        ) + timedelta(hours=24)
        assert deadline == expected

    def test_query_claim_has_14_day_deadline(self, query_claim):
        """Query claims have 14-day deadline from updated_at."""
        deadline = query_claim.time_barring_deadline
        assert deadline is not None
        expected = query_claim.updated_at + timedelta(days=14)
        assert deadline == expected

    def test_normal_claim_has_no_deadline(self, normal_draft_claim):
        """Normal draft claims have no time-barring deadline."""
        assert normal_draft_claim.time_barring_deadline is None

    def test_emergency_claim_is_time_barred(self, emergency_claim):
        """Emergency claim from yesterday should be time-barred (past 24h)."""
        assert emergency_claim.is_time_barred is True

    def test_fresh_emergency_claim_not_time_barred(
        self, db, sample_sha_member, sample_encounter, test_user, sample_facility
    ):
        """Emergency claim created just now should NOT be time-barred."""
        claim = SHAClaim.objects.create(
            patient=sample_sha_member.patient,
            sha_member=sample_sha_member,
            encounter=sample_encounter,
            claim_type=SHAClaim.ClaimType.EMERGENCY,
            is_emergency_claim=True,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today(),
            primary_diagnosis_code="R07.9",
            primary_diagnosis_description="Chest pain",
            facility=sample_facility,
            facility_code="12345",
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            created_by=test_user,
        )
        assert claim.is_time_barred is False

    def test_hours_until_time_barred_normal_claim(self, normal_draft_claim):
        """Normal claim returns None for hours_until_time_barred."""
        assert normal_draft_claim.hours_until_time_barred is None

    def test_hours_until_time_barred_expired(self, emergency_claim):
        """Expired emergency claim returns 0 hours."""
        assert emergency_claim.hours_until_time_barred == 0


# =============================================================================
# Tests — Celery Task
# =============================================================================


class TestFlagTimeBarringTask:
    """Tests for flag_time_barring_claims Celery task."""

    @patch("hmis.apps.core.events.publish_event")
    def test_task_emits_time_barred_for_past_deadline(self, mock_publish, emergency_claim):
        """Task should emit time-barred event for claims past deadline."""
        result = flag_time_barring_claims()
        assert "time-barred" in result.lower() or "1" in result

        # Find the time-barred event call
        time_barred_calls = [
            call
            for call in mock_publish.call_args_list
            if "time_barred" in str(call) and "warning" not in str(call)
        ]
        assert len(time_barred_calls) >= 1

    @patch("hmis.apps.core.events.publish_event")
    def test_task_emits_warning_for_approaching_deadline(
        self, mock_publish, db, sample_sha_member, sample_encounter, test_user, sample_facility
    ):
        """Task should emit warning for claims within 6 hours of deadline."""
        # Create emergency claim with service_date = today (within 24h window)
        claim = SHAClaim.objects.create(
            patient=sample_sha_member.patient,
            sha_member=sample_sha_member,
            encounter=sample_encounter,
            claim_type=SHAClaim.ClaimType.EMERGENCY,
            is_emergency_claim=True,
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today(),
            primary_diagnosis_code="R07.9",
            primary_diagnosis_description="Chest pain",
            facility=sample_facility,
            facility_code="12345",
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            created_by=test_user,
        )

        # Mock now to be 20 hours after midnight (4 hours remain until 24h deadline)
        fake_now = timezone.make_aware(
            datetime.combine(date.today(), datetime.min.time())
        ) + timedelta(hours=20)

        with patch("django.utils.timezone.now", return_value=fake_now):
            result = flag_time_barring_claims()

        # Should have a warning event
        warning_calls = [call for call in mock_publish.call_args_list if "warning" in str(call)]
        assert len(warning_calls) >= 1

    @patch("hmis.apps.core.events.publish_event")
    def test_task_no_events_for_normal_claims(self, mock_publish, normal_draft_claim):
        """Task should not flag normal draft claims."""
        result = flag_time_barring_claims()
        assert "0 warning" in result or "warning(s)" in result
        # No calls for this particular claim
        claim_calls = [
            call for call in mock_publish.call_args_list if str(normal_draft_claim.pk) in str(call)
        ]
        assert len(claim_calls) == 0
