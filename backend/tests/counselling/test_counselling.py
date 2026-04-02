"""
Tests for the Counselling module.

Tests cover:
- CounsellingType CRUD operations
- CounsellingReferral CRUD and workflow
- CounsellingSession CRUD and workflow
- Status transitions
- Sensitive referral privacy
- Mental health integration
- Session completion and follow-up
- Clinic queue integration
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.counselling.models import (
    CounsellingReferral,
    CounsellingSession,
    CounsellingType,
    generate_counselling_referral_number,
    generate_session_number,
)

User = get_user_model()


# ==================== FIXTURES ====================


@pytest.fixture
def counselling_type(db):
    """Create a sample counselling type (non-sensitive for general tests)."""
    return CounsellingType.objects.create(
        code="CT-GEN-001",
        name="General Stress Counselling",
        description="General stress management and support",
        category="GENERAL",
        typical_duration_minutes=45,
        recommended_sessions=6,
        recommended_frequency="1x per week",
        cost_per_session=Decimal("1500.00"),
        sha_claimable=True,
        sha_intervention_code="SH-COUNS-001",
        requires_privacy=False,  # Non-sensitive for general tests
        is_active=True,
    )


@pytest.fixture
def mental_health_counselling_type(db):
    """Create a mental health counselling type (sensitive)."""
    return CounsellingType.objects.create(
        code="CT-MH-001",
        name="General Mental Health Counselling",
        description="General mental health support and guidance",
        category="MENTAL_HEALTH",
        typical_duration_minutes=45,
        recommended_sessions=6,
        recommended_frequency="1x per week",
        cost_per_session=Decimal("1500.00"),
        sha_claimable=True,
        sha_intervention_code="SH-COUNS-002",
        requires_privacy=True,
        is_active=True,
    )


@pytest.fixture
def hiv_counselling_type(db):
    """Create an HIV counselling type."""
    return CounsellingType.objects.create(
        code="CT-HIV-001",
        name="HIV Pre-Test and Post-Test Counselling",
        description="HIV counselling and support services",
        category="HIV",
        typical_duration_minutes=30,
        recommended_sessions=3,
        recommended_frequency="as needed",
        cost_per_session=Decimal("500.00"),
        sha_claimable=True,
        requires_privacy=True,
        is_active=True,
    )


@pytest.fixture
def family_planning_type(db):
    """Create a family planning counselling type."""
    return CounsellingType.objects.create(
        code="CT-FP-001",
        name="Family Planning Counselling",
        description="Reproductive health and family planning guidance",
        category="FAMILY_PLANNING",
        typical_duration_minutes=30,
        recommended_sessions=2,
        cost_per_session=Decimal("800.00"),
        sha_claimable=True,
        requires_privacy=False,
        is_active=True,
    )


@pytest.fixture
def counselling_referral(db, sample_patient, sample_encounter, test_user, counselling_type, sample_facility, sample_organization):
    """Create a sample counselling referral (non-sensitive)."""
    referral = CounsellingReferral.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        counselling_type=counselling_type,
        referred_by=test_user,
        reason="STRESS",
        urgency="ROUTINE",
        clinical_summary="Patient presents with work-related stress",
        presenting_issues="Difficulty sleeping, irritability, anxiety",
        goals="Develop coping strategies and stress management techniques",
        status="DRAFT",
        total_sessions=4,
        is_sensitive=False,
        facility=sample_facility,
        organization=sample_organization,
    )
    return referral


@pytest.fixture
def hiv_referral(db, sample_patient, sample_encounter, test_user, hiv_counselling_type, sample_facility, sample_organization):
    """Create an HIV counselling referral (sensitive)."""
    return CounsellingReferral.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        counselling_type=hiv_counselling_type,
        referred_by=test_user,
        reason="HIV_DIAGNOSIS",
        urgency="URGENT",
        clinical_summary="Patient recently diagnosed HIV positive",
        presenting_issues="Emotional support needed, treatment adherence",
        goals="Emotional processing, adherence support, partner notification",
        status="PENDING",
        total_sessions=3,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def crisis_referral(db, sample_patient, sample_encounter, test_user, sample_facility, sample_organization):
    """Create a crisis/suicidal ideation referral."""
    return CounsellingReferral.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        referred_by=test_user,
        reason="SUICIDAL",
        urgency="EMERGENCY",
        clinical_summary="Patient expressing suicidal thoughts",
        presenting_issues="Active suicidal ideation, recent loss",
        risk_assessment="High risk - safety plan needed immediately",
        goals="Crisis intervention, safety planning",
        status="PENDING",
        total_sessions=6,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def counselling_session(db, counselling_referral, test_user):
    """Create a sample counselling session."""
    # Ensure referral is not sensitive for this fixture
    counselling_referral.is_sensitive = False
    counselling_referral.save(update_fields=["is_sensitive"])
    
    return CounsellingSession.objects.create(
        referral=counselling_referral,
        counsellor=test_user,
        session_sequence=1,
        scheduled_date=date.today(),
        status="SCHEDULED",
        is_sensitive=False,
    )


# ==================== MODEL TESTS ====================


class TestCounsellingTypeModel:
    """Tests for CounsellingType model."""

    def test_create_counselling_type(self, counselling_type):
        """Should create a counselling type successfully."""
        assert counselling_type.id is not None
        assert counselling_type.code == "CT-GEN-001"
        assert counselling_type.category == "GENERAL"
        assert counselling_type.cost_per_session == Decimal("1500.00")
        assert counselling_type.requires_privacy is False

    def test_counselling_type_str(self, counselling_type):
        """Should return expected string representation."""
        assert str(counselling_type) == "CT-GEN-001 - General Stress Counselling"

    def test_counselling_type_unique_code(self, counselling_type):
        """Should enforce unique code constraint."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            CounsellingType.objects.create(
                code="CT-GEN-001",  # Duplicate
                name="Another Type",
                category="GENERAL",
            )


class TestCounsellingReferralModel:
    """Tests for CounsellingReferral model."""

    def test_referral_number_auto_generated(self, counselling_referral):
        """Should auto-generate referral number in correct format."""
        assert counselling_referral.referral_number is not None
        assert counselling_referral.referral_number.startswith("COUNS-")
        # Format: COUNS-YYYYMMDD-XXXX
        parts = counselling_referral.referral_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX

    def test_referral_number_immutable(self, counselling_referral):
        """Should not allow modifying referral number after creation."""
        original_number = counselling_referral.referral_number
        counselling_referral.referral_number = "COUNS-00000000-9999"
        counselling_referral.save()
        counselling_referral.refresh_from_db()
        assert counselling_referral.referral_number == original_number

    def test_hiv_referral_auto_sensitive(self, hiv_referral):
        """HIV referrals should automatically be marked as sensitive."""
        assert hiv_referral.is_sensitive is True
        assert hiv_referral.patient.is_sensitive is True

    def test_crisis_referral_auto_sensitive(self, crisis_referral):
        """Crisis/suicidal referrals should be marked as sensitive."""
        assert crisis_referral.is_sensitive is True

    def test_mental_health_related_property(self, hiv_referral, crisis_referral, counselling_referral):
        """Should correctly identify mental health related referrals."""
        # Stress is not in MENTAL_HEALTH_REASONS list
        assert counselling_referral.is_mental_health_related is False
        # HIV is not mental health
        assert hiv_referral.is_mental_health_related is False
        # Suicidal is mental health
        assert crisis_referral.is_mental_health_related is True

    def test_hiv_related_property(self, hiv_referral, counselling_referral):
        """Should correctly identify HIV related referrals."""
        assert hiv_referral.is_hiv_related is True
        assert counselling_referral.is_hiv_related is False

    def test_requires_immediate_attention(self, crisis_referral, counselling_referral):
        """Emergency/crisis referrals should require immediate attention."""
        assert crisis_referral.requires_immediate_attention is True
        assert counselling_referral.requires_immediate_attention is False

    def test_valid_status_transition(self, counselling_referral, test_user):
        """Should allow valid status transitions."""
        counselling_referral.status = "PENDING"
        counselling_referral.save()
        counselling_referral.update_status("ACCEPTED", user=test_user)
        assert counselling_referral.status == "ACCEPTED"
        assert counselling_referral.accepted_at is not None

    def test_invalid_status_transition(self, counselling_referral, test_user):
        """Should reject invalid status transitions."""
        from django.core.exceptions import ValidationError

        counselling_referral.status = "DRAFT"
        counselling_referral.save()

        with pytest.raises(ValidationError):
            counselling_referral.update_status("COMPLETED", user=test_user)

    def test_completion_percentage(self, counselling_referral):
        """Should calculate completion percentage correctly."""
        counselling_referral.total_sessions = 4
        counselling_referral.sessions_completed = 2
        counselling_referral.save()

        assert counselling_referral.completion_percentage == 50.0

    def test_generate_referral_number_sequential(self, db, sample_patient, sample_encounter, test_user):
        """Referral numbers should be sequential for the same day."""
        ref1 = CounsellingReferral.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            referred_by=test_user,
            reason="STRESS",
            urgency="ROUTINE",
            clinical_summary="Test",
            presenting_issues="Test",
        )
        ref2 = CounsellingReferral.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            referred_by=test_user,
            reason="ANXIETY",
            urgency="ROUTINE",
            clinical_summary="Test 2",
            presenting_issues="Test 2",
        )

        # Both should have same date prefix but sequential numbers
        assert ref1.referral_number.rsplit("-", 1)[0] == ref2.referral_number.rsplit("-", 1)[0]
        assert int(ref2.referral_number.split("-")[-1]) == int(ref1.referral_number.split("-")[-1]) + 1


class TestCounsellingSessionModel:
    """Tests for CounsellingSession model."""

    def test_session_number_auto_generated(self, counselling_session):
        """Should auto-generate session number in correct format."""
        assert counselling_session.session_number is not None
        assert counselling_session.session_number.startswith("CS-")
        # Format: CS-YYYYMMDD-XXXX
        parts = counselling_session.session_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX

    def test_session_inherits_sensitivity(self, hiv_referral, test_user):
        """Sessions should inherit sensitivity from referral."""
        session = CounsellingSession.objects.create(
            referral=hiv_referral,
            counsellor=test_user,
            scheduled_date=date.today(),
        )
        assert session.is_sensitive is True
        assert session.confidentiality_level == "HIGHLY_RESTRICTED"

    def test_session_complete(self, counselling_session, test_user):
        """Should mark session as completed and update referral."""
        counselling_session.progress_notes = "Session went well"
        counselling_session.save()
        counselling_session.complete(user=test_user)

        assert counselling_session.status == "COMPLETED"
        assert counselling_session.completed_at is not None
        assert counselling_session.referral.sessions_completed == 1

    def test_mood_improvement(self, counselling_session):
        """Should calculate mood improvement correctly."""
        counselling_session.pre_session_mood = 3
        counselling_session.post_session_mood = 7
        counselling_session.save()

        assert counselling_session.mood_improvement == 4

    def test_is_overdue(self, counselling_referral, test_user):
        """Should detect overdue scheduled sessions."""
        past_session = CounsellingSession.objects.create(
            referral=counselling_referral,
            counsellor=test_user,
            scheduled_date=date.today() - timedelta(days=7),
            status="SCHEDULED",
        )
        future_session = CounsellingSession.objects.create(
            referral=counselling_referral,
            counsellor=test_user,
            scheduled_date=date.today() + timedelta(days=7),
            status="SCHEDULED",
        )

        assert past_session.is_overdue is True
        assert future_session.is_overdue is False


# ==================== API TESTS ====================


class TestCounsellingTypeAPI:
    """Tests for CounsellingType API endpoints."""

    def test_list_counselling_types(self, authenticated_client, counselling_type, family_planning_type):
        """Should list all active counselling types."""
        response = authenticated_client.get("/api/counselling/types/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 2

    def test_create_counselling_type(self, authenticated_client):
        """Should create a new counselling type."""
        data = {
            "code": "CT-GEN-001",
            "name": "General Counselling",
            "description": "General counselling services",
            "category": "GENERAL",
            "typical_duration_minutes": 45,
            "recommended_sessions": 4,
            "cost_per_session": "1000.00",
            "sha_claimable": True,
            "is_active": True,
        }
        response = authenticated_client.post("/api/counselling/types/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "CT-GEN-001"

    def test_retrieve_counselling_type(self, authenticated_client, counselling_type):
        """Should retrieve a specific counselling type."""
        response = authenticated_client.get(f"/api/counselling/types/{counselling_type.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == counselling_type.code


class TestCounsellingReferralAPI:
    """Tests for CounsellingReferral API endpoints."""

    def test_create_referral(self, authenticated_client, sample_patient, sample_encounter, counselling_type):
        """Should create a counselling referral."""
        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "counselling_type": counselling_type.id,
            "reason": "ANXIETY",
            "urgency": "ROUTINE",
            "clinical_summary": "Patient reports anxiety symptoms",
            "presenting_issues": "Difficulty concentrating, racing thoughts",
            "goals": "Develop anxiety management strategies",
            "total_sessions": 6,
        }
        response = authenticated_client.post("/api/counselling/referrals/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["referral_number"].startswith("COUNS-")
        assert response.data["patient"] == sample_patient.id

    def test_list_referrals(self, authenticated_client, counselling_referral):
        """Should list counselling referrals."""
        response = authenticated_client.get("/api/counselling/referrals/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_retrieve_referral(self, authenticated_client, counselling_referral):
        """Should retrieve a specific referral."""
        response = authenticated_client.get(f"/api/counselling/referrals/{counselling_referral.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["referral_number"] == counselling_referral.referral_number

    def test_accept_referral(self, authenticated_client, counselling_referral):
        """Should accept a pending referral."""
        # First move to PENDING
        counselling_referral.status = "PENDING"
        counselling_referral.save()

        response = authenticated_client.post(f"/api/counselling/referrals/{counselling_referral.id}/accept/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACCEPTED"
        assert response.data["accepted_at"] is not None

    def test_assign_counsellor(self, authenticated_client, counselling_referral, test_user):
        """Should assign a counsellor to the referral."""
        response = authenticated_client.post(
            f"/api/counselling/referrals/{counselling_referral.id}/assign_counsellor/",
            {"assigned_counsellor": test_user.id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_counsellor"] == test_user.id

    def test_start_referral(self, authenticated_client, counselling_referral):
        """Should start (set to IN_PROGRESS) an accepted referral."""
        counselling_referral.status = "ACCEPTED"
        counselling_referral.save()

        response = authenticated_client.post(f"/api/counselling/referrals/{counselling_referral.id}/start/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"
        assert response.data["started_at"] is not None

    def test_complete_referral(self, authenticated_client, counselling_referral):
        """Should complete an in-progress referral."""
        counselling_referral.status = "IN_PROGRESS"
        counselling_referral.save()

        response = authenticated_client.post(
            f"/api/counselling/referrals/{counselling_referral.id}/complete/",
            {"completion_notes": "Patient showed good progress"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["completion_notes"] == "Patient showed good progress"

    def test_cancel_referral(self, authenticated_client, counselling_referral):
        """Should cancel a referral with reason."""
        counselling_referral.status = "PENDING"
        counselling_referral.save()

        response = authenticated_client.post(
            f"/api/counselling/referrals/{counselling_referral.id}/cancel/",
            {"cancellation_reason": "Patient relocated"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"
        assert response.data["cancellation_reason"] == "Patient relocated"

    def test_generate_sessions(self, authenticated_client, counselling_referral):
        """Should generate sessions for a referral."""
        counselling_referral.status = "ACCEPTED"
        counselling_referral.save()

        response = authenticated_client.post(
            f"/api/counselling/referrals/{counselling_referral.id}/generate_sessions/",
            {
                "num_sessions": 4,
                "start_date": str(date.today()),
                "frequency_days": 7,
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert "sessions" in response.data
        assert len(response.data["sessions"]) == 4

    def test_filter_sensitive_referrals(self, authenticated_client, hiv_referral, counselling_referral):
        """Should filter out sensitive referrals for users without permission."""
        # By default, test user doesn't have view_sensitive_counselling_referral permission
        response = authenticated_client.get("/api/counselling/referrals/")
        assert response.status_code == status.HTTP_200_OK

        # Should NOT see the HIV (sensitive) referral
        referral_numbers = [r["referral_number"] for r in response.data["results"]]
        assert hiv_referral.referral_number not in referral_numbers


class TestCounsellingSessionAPI:
    """Tests for CounsellingSession API endpoints."""

    def test_create_session(self, authenticated_client, counselling_referral, test_user):
        """Should create a counselling session."""
        counselling_referral.status = "ACCEPTED"
        counselling_referral.save()

        data = {
            "referral": counselling_referral.id,
            "counsellor": test_user.id,
            "scheduled_date": str(date.today() + timedelta(days=1)),
            "scheduled_time": "10:00:00",
            "session_type": "Individual",
        }
        response = authenticated_client.post("/api/counselling/sessions/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["session_number"].startswith("CS-")

    def test_list_sessions(self, authenticated_client, counselling_session):
        """Should list counselling sessions."""
        response = authenticated_client.get("/api/counselling/sessions/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_start_session(self, authenticated_client, counselling_session):
        """Should start a scheduled session."""
        response = authenticated_client.post(f"/api/counselling/sessions/{counselling_session.id}/start/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"
        assert response.data["actual_date"] is not None

    def test_complete_session(self, authenticated_client, counselling_session):
        """Should complete a session with notes."""
        counselling_session.status = "IN_PROGRESS"
        counselling_session.save()

        data = {
            "progress_notes": "Patient discussed work stress, explored coping strategies",
            "outcome": "GOOD_PROGRESS",
            "follow_up_required": "CONTINUE",
            "follow_up_date": str(date.today() + timedelta(days=7)),
            "homework": "Practice deep breathing exercises daily",
        }
        response = authenticated_client.post(
            f"/api/counselling/sessions/{counselling_session.id}/complete/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["outcome"] == "GOOD_PROGRESS"

    def test_cancel_session(self, authenticated_client, counselling_session):
        """Should cancel a scheduled session."""
        response = authenticated_client.post(f"/api/counselling/sessions/{counselling_session.id}/cancel/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_no_show_session(self, authenticated_client, counselling_session):
        """Should mark session as no-show."""
        response = authenticated_client.post(f"/api/counselling/sessions/{counselling_session.id}/no_show/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "NO_SHOW"

    def test_reschedule_session(self, authenticated_client, counselling_session):
        """Should reschedule a session."""
        new_date = str(date.today() + timedelta(days=14))
        response = authenticated_client.post(
            f"/api/counselling/sessions/{counselling_session.id}/reschedule/",
            {
                "scheduled_date": new_date,
                "scheduled_time": "14:00:00",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["old_session"]["status"] == "RESCHEDULED"
        assert response.data["new_session"]["scheduled_date"] == new_date


class TestCounsellingReferralWorkflow:
    """Tests for complete referral workflow."""

    def test_complete_referral_workflow(self, authenticated_client, sample_patient, sample_encounter, counselling_type, test_user):
        """Should complete full workflow from referral to completion."""
        # 1. Create referral
        create_data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "counselling_type": counselling_type.id,
            "reason": "DEPRESSION",
            "urgency": "URGENT",
            "clinical_summary": "Patient shows signs of depression",
            "presenting_issues": "Low mood, loss of interest",
            "goals": "Stabilize mood, develop coping strategies",
            "total_sessions": 2,
        }
        create_response = authenticated_client.post("/api/counselling/referrals/", create_data)
        assert create_response.status_code == status.HTTP_201_CREATED
        referral_id = create_response.data["id"]

        # 2. Submit for review (DRAFT -> PENDING)
        referral = CounsellingReferral.objects.get(id=referral_id)
        referral.status = "PENDING"
        referral.save()

        # 3. Accept referral
        accept_response = authenticated_client.post(f"/api/counselling/referrals/{referral_id}/accept/")
        assert accept_response.status_code == status.HTTP_200_OK

        # 4. Generate sessions
        sessions_response = authenticated_client.post(
            f"/api/counselling/referrals/{referral_id}/generate_sessions/",
            {"num_sessions": 2, "start_date": str(date.today()), "frequency_days": 7},
        )
        assert sessions_response.status_code == status.HTTP_200_OK
        session_ids = [s["id"] for s in sessions_response.data["sessions"]]

        # 5. Start first session
        start_response = authenticated_client.post(f"/api/counselling/sessions/{session_ids[0]}/start/")
        assert start_response.status_code == status.HTTP_200_OK

        # 6. Complete first session
        complete_session_response = authenticated_client.post(
            f"/api/counselling/sessions/{session_ids[0]}/complete/",
            {"progress_notes": "First session notes", "outcome": "MODERATE_PROGRESS"},
        )
        assert complete_session_response.status_code == status.HTTP_200_OK

        # 7. Verify referral status updated
        referral.refresh_from_db()
        assert referral.sessions_completed == 1
        assert referral.status == "IN_PROGRESS"

        # 8. Complete second session
        start_response2 = authenticated_client.post(f"/api/counselling/sessions/{session_ids[1]}/start/")
        complete_session_response2 = authenticated_client.post(
            f"/api/counselling/sessions/{session_ids[1]}/complete/",
            {"progress_notes": "Second session notes", "outcome": "GOOD_PROGRESS"},
        )
        assert complete_session_response2.status_code == status.HTTP_200_OK

        # 9. Verify referral auto-completed
        referral.refresh_from_db()
        assert referral.sessions_completed == 2
        assert referral.status == "COMPLETED"
