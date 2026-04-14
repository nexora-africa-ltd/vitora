"""
Tests for the Social Work module.

Tests cover:
- SocialWorkReferral CRUD operations
- SocialWorkCase CRUD and workflow
- CaseNote CRUD
- SocialWorkIntervention CRUD and workflow
- Status transitions
- GBV/sensitive case privacy
- Clinic queue integration
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.social_work.models import (
    CaseNote,
    SocialWorkCase,
    SocialWorkIntervention,
    SocialWorkReferral,
    generate_case_number,
    generate_sw_referral_number,
)

User = get_user_model()


# ==================== FIXTURES ====================


@pytest.fixture
def sw_referral(
    db, sample_patient, sample_encounter, test_user, sample_facility, sample_organization
):
    """Create a sample social work referral."""
    return SocialWorkReferral.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        referred_by=test_user,
        reason="FINANCIAL_HARDSHIP",
        urgency="ROUTINE",
        clinical_summary="Patient requires financial assistance for medication",
        presenting_issues="Unable to afford ongoing medication costs",
        status="DRAFT",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def gbv_referral(
    db, sample_patient, sample_encounter, test_user, sample_facility, sample_organization
):
    """Create a GBV (sensitive) referral."""
    return SocialWorkReferral.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        referred_by=test_user,
        reason="GBV",
        urgency="EMERGENCY",
        clinical_summary="Patient presents with signs of domestic violence",
        presenting_issues="Physical injuries consistent with assault, patient fearful",
        risk_factors="Immediate safety concern, perpetrator known",
        status="PENDING",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sw_case(db, sample_patient, test_user):
    """Create a sample social work case."""
    return SocialWorkCase.objects.create(
        patient=sample_patient,
        assigned_worker=test_user,
        case_type="FINANCIAL",
        title="Financial assistance case",
        presenting_problem="Patient unable to afford medication",
        goals="Secure financial support for medication",
        risk_level="LOW",
        priority="MEDIUM",
        status="OPEN",
    )


@pytest.fixture
def gbv_case(db, sample_patient, test_user):
    """Create a GBV (sensitive) case."""
    return SocialWorkCase.objects.create(
        patient=sample_patient,
        assigned_worker=test_user,
        case_type="GBV",
        title="GBV support case",
        presenting_problem="Domestic violence situation",
        goals="Ensure patient safety and provide support",
        safety_assessment="High risk, safety plan in place",
        risk_level="CRITICAL",
        priority="URGENT",
        status="IN_PROGRESS",
    )


@pytest.fixture
def case_note(db, sw_case, test_user):
    """Create a sample case note."""
    return CaseNote.objects.create(
        case=sw_case,
        author=test_user,
        note_type="CONTACT",
        contact_date=date.today(),
        contact_method="IN_PERSON",
        subject="Initial assessment",
        content="Met with patient to discuss financial needs",
        duration_minutes=45,
    )


@pytest.fixture
def sw_intervention(db, sw_case, test_user):
    """Create a sample intervention."""
    return SocialWorkIntervention.objects.create(
        case=sw_case,
        provided_by=test_user,
        intervention_type="FINANCIAL_ASSISTANCE",
        description="Apply for hospital welfare fund",
        objectives="Secure funding for medication",
        status="PLANNED",
        planned_date=date.today() + timedelta(days=3),
    )


# ==================== MODEL TESTS ====================


class TestSocialWorkReferralModel:
    """Tests for SocialWorkReferral model."""

    def test_referral_number_auto_generated(self, sw_referral):
        """Should auto-generate referral number in correct format."""
        assert sw_referral.referral_number is not None
        assert sw_referral.referral_number.startswith("SW-")
        # Format: SW-YYYYMMDD-XXXX
        parts = sw_referral.referral_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX

    def test_referral_number_immutable(self, sw_referral):
        """Should not allow modifying referral number after creation."""
        original_number = sw_referral.referral_number
        sw_referral.referral_number = "SW-00000000-9999"
        sw_referral.save()
        sw_referral.refresh_from_db()
        assert sw_referral.referral_number == original_number

    def test_gbv_referral_auto_sensitive(self, gbv_referral):
        """GBV referrals should automatically be marked as sensitive."""
        assert gbv_referral.is_sensitive is True
        assert gbv_referral.patient.is_sensitive is True

    def test_gbv_case_property(self, gbv_referral, sw_referral):
        """Should correctly identify GBV cases."""
        assert gbv_referral.is_gbv_case is True
        assert sw_referral.is_gbv_case is False

    def test_requires_immediate_attention(self, gbv_referral, sw_referral):
        """Emergency/GBV referrals should require immediate attention."""
        assert gbv_referral.requires_immediate_attention is True
        assert sw_referral.requires_immediate_attention is False

    def test_valid_status_transition(self, sw_referral, test_user):
        """Should allow valid status transitions."""
        sw_referral.status = "PENDING"
        sw_referral.save()
        sw_referral.update_status("ACCEPTED", user=test_user)
        assert sw_referral.status == "ACCEPTED"
        assert sw_referral.accepted_at is not None

    def test_invalid_status_transition(self, sw_referral, test_user):
        """Should reject invalid status transitions."""
        from django.core.exceptions import ValidationError

        sw_referral.status = "DRAFT"
        sw_referral.save()

        with pytest.raises(ValidationError):
            sw_referral.update_status("COMPLETED", user=test_user)

    def test_generate_referral_number_sequential(
        self, db, sample_patient, sample_encounter, test_user
    ):
        """Referral numbers should be sequential for the same day."""
        ref1 = SocialWorkReferral.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            referred_by=test_user,
            reason="OTHER",
            urgency="ROUTINE",
            clinical_summary="Test",
            presenting_issues="Test",
        )
        ref2 = SocialWorkReferral.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            referred_by=test_user,
            reason="OTHER",
            urgency="ROUTINE",
            clinical_summary="Test 2",
            presenting_issues="Test 2",
        )
        # Extract sequence numbers
        seq1 = int(ref1.referral_number.split("-")[-1])
        seq2 = int(ref2.referral_number.split("-")[-1])
        assert seq2 == seq1 + 1


class TestSocialWorkCaseModel:
    """Tests for SocialWorkCase model."""

    def test_case_number_auto_generated(self, sw_case):
        """Should auto-generate case number in correct format."""
        assert sw_case.case_number is not None
        assert sw_case.case_number.startswith("SWC-")
        parts = sw_case.case_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD

    def test_case_number_immutable(self, sw_case):
        """Should not allow modifying case number after creation."""
        original_number = sw_case.case_number
        sw_case.case_number = "SWC-00000000-9999"
        sw_case.save()
        sw_case.refresh_from_db()
        assert sw_case.case_number == original_number

    def test_gbv_case_auto_sensitive(self, gbv_case):
        """GBV cases should automatically be marked as sensitive."""
        assert gbv_case.is_sensitive is True
        assert gbv_case.confidentiality_level == "RESTRICTED"
        assert gbv_case.patient.is_sensitive is True

    def test_is_open_property(self, sw_case, gbv_case):
        """Should correctly identify open cases."""
        assert sw_case.is_open is True
        assert gbv_case.is_open is True

        sw_case.update_status("CLOSED_RESOLVED")
        assert sw_case.is_open is False

    def test_days_open(self, sw_case):
        """Should calculate days open correctly."""
        # Case just opened today
        assert sw_case.days_open >= 0

    def test_close_case(self, sw_case, test_user):
        """Should close case with outcome documentation."""
        sw_case.close_case(
            outcome="Patient secured financial assistance",
            outcome_rating="FULLY_ACHIEVED",
            user=test_user,
        )
        sw_case.refresh_from_db()
        assert sw_case.status == "CLOSED_RESOLVED"
        assert sw_case.outcome == "Patient secured financial assistance"
        assert sw_case.outcome_rating == "FULLY_ACHIEVED"
        assert sw_case.closed_at is not None

    def test_is_overdue_for_review(self, sw_case):
        """Should detect overdue review dates."""
        # No review date set
        assert sw_case.is_overdue_for_review is False

        # Set past review date
        sw_case.next_review_date = date.today() - timedelta(days=1)
        sw_case.save()
        assert sw_case.is_overdue_for_review is True

        # Set future review date
        sw_case.next_review_date = date.today() + timedelta(days=7)
        sw_case.save()
        assert sw_case.is_overdue_for_review is False


class TestInterventionModel:
    """Tests for SocialWorkIntervention model."""

    def test_intervention_complete(self, sw_intervention):
        """Should mark intervention as completed with outcome."""
        sw_intervention.complete(
            outcome="Successfully obtained funding",
            outcome_rating="SUCCESSFUL",
        )
        sw_intervention.refresh_from_db()
        assert sw_intervention.status == "COMPLETED"
        assert sw_intervention.completion_date == date.today()
        assert sw_intervention.outcome_rating == "SUCCESSFUL"


# ==================== API TESTS ====================


class TestSocialWorkReferralAPI:
    """Tests for SocialWorkReferral API endpoints."""

    def test_create_referral(self, authenticated_client, sample_patient, sample_encounter):
        """Should create a new referral."""
        data = {
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "reason": "DISCHARGE_PLANNING",
            "urgency": "ROUTINE",
            "clinical_summary": "Patient ready for discharge, needs home assessment",
            "presenting_issues": "Lives alone, mobility limitations",
        }
        response = authenticated_client.post("/api/social-work/referrals/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["referral_number"].startswith("SW-")
        assert response.data["reason"] == "DISCHARGE_PLANNING"

    def test_list_referrals(self, authenticated_client, sw_referral):
        """Should list referrals."""
        response = authenticated_client.get("/api/social-work/referrals/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_retrieve_referral(self, authenticated_client, sw_referral):
        """Should retrieve a single referral."""
        response = authenticated_client.get(f"/api/social-work/referrals/{sw_referral.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["referral_number"] == sw_referral.referral_number

    def test_accept_referral(self, authenticated_client, sw_referral):
        """Should accept a pending referral."""
        sw_referral.status = "PENDING"
        sw_referral.save()

        response = authenticated_client.post(f"/api/social-work/referrals/{sw_referral.id}/accept/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACCEPTED"

    def test_assign_worker(self, authenticated_client, sw_referral, test_user):
        """Should assign a social worker to referral."""
        data = {"assigned_worker": test_user.id}
        response = authenticated_client.post(
            f"/api/social-work/referrals/{sw_referral.id}/assign_worker/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_worker"] == test_user.id

    def test_create_case_from_referral(self, authenticated_client, sw_referral):
        """Should create a case from a referral."""
        sw_referral.status = "ACCEPTED"
        sw_referral.save()

        data = {
            "title": "New case from referral",
            "goals": "Help patient with financial needs",
        }
        response = authenticated_client.post(
            f"/api/social-work/referrals/{sw_referral.id}/create_case/",
            data,
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["case_number"].startswith("SWC-")
        assert response.data["referral"] == sw_referral.id

    def test_filter_by_urgency(self, authenticated_client, sw_referral, gbv_referral):
        """Should filter referrals by urgency."""
        response = authenticated_client.get("/api/social-work/referrals/?urgency=emergency")
        assert response.status_code == status.HTTP_200_OK
        for ref in response.data["results"]:
            assert ref["urgency"] == "EMERGENCY"


class TestSocialWorkCaseAPI:
    """Tests for SocialWorkCase API endpoints."""

    def test_create_case(self, authenticated_client, sample_patient):
        """Should create a new case."""
        data = {
            "patient": sample_patient.id,
            "case_type": "MENTAL_HEALTH",
            "title": "Mental health support case",
            "presenting_problem": "Patient experiencing anxiety and depression",
            "goals": "Provide counselling referral and support",
        }
        response = authenticated_client.post("/api/social-work/cases/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["case_number"].startswith("SWC-")

    def test_list_cases(self, authenticated_client, sw_case):
        """Should list cases."""
        response = authenticated_client.get("/api/social-work/cases/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_retrieve_case(self, authenticated_client, sw_case):
        """Should retrieve a single case."""
        response = authenticated_client.get(f"/api/social-work/cases/{sw_case.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["case_number"] == sw_case.case_number

    def test_update_case_status(self, authenticated_client, sw_case):
        """Should update case status."""
        data = {"status": "IN_PROGRESS"}
        response = authenticated_client.post(
            f"/api/social-work/cases/{sw_case.id}/update_status/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_close_case(self, authenticated_client, sw_case):
        """Should close a case with outcome."""
        data = {
            "status": "CLOSED_RESOLVED",
            "outcome": "Patient received financial assistance",
            "outcome_rating": "FULLY_ACHIEVED",
        }
        response = authenticated_client.post(
            f"/api/social-work/cases/{sw_case.id}/close/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CLOSED_RESOLVED"
        assert response.data["outcome_rating"] == "FULLY_ACHIEVED"

    def test_assign_worker_to_case(self, authenticated_client, sw_case, test_user):
        """Should assign workers to case."""
        data = {"assigned_worker": test_user.id}
        response = authenticated_client.post(
            f"/api/social-work/cases/{sw_case.id}/assign_worker/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["assigned_worker"] == test_user.id

    def test_filter_open_cases(self, authenticated_client, sw_case):
        """Should filter to show only open cases."""
        response = authenticated_client.get("/api/social-work/cases/?is_open=true")
        assert response.status_code == status.HTTP_200_OK
        for case in response.data["results"]:
            assert case["status"] in ["OPEN", "IN_PROGRESS", "ON_HOLD"]


class TestCaseNoteAPI:
    """Tests for CaseNote API endpoints."""

    def test_create_note(self, authenticated_client, sw_case):
        """Should create a case note."""
        data = {
            "case": sw_case.id,
            "note_type": "PROGRESS",
            "contact_date": str(date.today()),
            "contact_method": "PHONE",
            "subject": "Follow-up call",
            "content": "Spoke with patient about progress",
            "duration_minutes": 15,
        }
        response = authenticated_client.post("/api/social-work/notes/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["note_type"] == "PROGRESS"

    def test_list_notes(self, authenticated_client, case_note):
        """Should list case notes."""
        response = authenticated_client.get("/api/social-work/notes/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_filter_notes_by_case(self, authenticated_client, case_note, sw_case):
        """Should filter notes by case."""
        response = authenticated_client.get(f"/api/social-work/notes/?case={sw_case.id}")
        assert response.status_code == status.HTTP_200_OK
        for note in response.data["results"]:
            assert note["case"] == sw_case.id


class TestSocialWorkInterventionAPI:
    """Tests for SocialWorkIntervention API endpoints."""

    def test_create_intervention(self, authenticated_client, sw_case):
        """Should create an intervention."""
        data = {
            "case": sw_case.id,
            "intervention_type": "COUNSELLING",
            "description": "Provide grief counselling",
            "objectives": "Help patient process loss",
            "planned_date": str(date.today() + timedelta(days=7)),
        }
        response = authenticated_client.post("/api/social-work/interventions/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["intervention_type"] == "COUNSELLING"
        assert response.data["status"] == "PLANNED"

    def test_start_intervention(self, authenticated_client, sw_intervention):
        """Should start a planned intervention."""
        response = authenticated_client.post(
            f"/api/social-work/interventions/{sw_intervention.id}/start/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"
        assert response.data["start_date"] == str(date.today())

    def test_complete_intervention(self, authenticated_client, sw_intervention):
        """Should complete an intervention."""
        sw_intervention.status = "IN_PROGRESS"
        sw_intervention.save()

        data = {
            "outcome": "Patient received funding",
            "outcome_rating": "SUCCESSFUL",
            "client_feedback": "Very grateful for support",
        }
        response = authenticated_client.post(
            f"/api/social-work/interventions/{sw_intervention.id}/complete/",
            data,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["outcome_rating"] == "SUCCESSFUL"

    def test_cancel_intervention(self, authenticated_client, sw_intervention):
        """Should cancel an intervention."""
        response = authenticated_client.post(
            f"/api/social-work/interventions/{sw_intervention.id}/cancel/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"


# ==================== PRIVACY TESTS ====================


class TestSensitiveCasePrivacy:
    """Tests for GBV/sensitive case privacy controls."""

    def test_sensitive_referrals_hidden_without_permission(
        self, authenticated_client, gbv_referral, sw_referral
    ):
        """Users without permission should not see sensitive referrals."""
        # By default, test_user doesn't have view_sensitive_sw_referral permission
        response = authenticated_client.get("/api/social-work/referrals/")
        assert response.status_code == status.HTTP_200_OK
        referral_ids = [r["id"] for r in response.data["results"]]
        assert gbv_referral.id not in referral_ids

    def test_sensitive_cases_hidden_without_permission(
        self, authenticated_client, gbv_case, sw_case
    ):
        """Users without permission should not see sensitive cases."""
        response = authenticated_client.get("/api/social-work/cases/")
        assert response.status_code == status.HTTP_200_OK
        case_ids = [c["id"] for c in response.data["results"]]
        assert gbv_case.id not in case_ids


# ==================== NUMBER GENERATION TESTS ====================


class TestNumberGeneration:
    """Tests for referral and case number generation functions."""

    def test_generate_sw_referral_number_format(self, db):
        """Should generate number in correct format."""
        number = generate_sw_referral_number()
        assert number.startswith("SW-")
        parts = number.split("-")
        assert len(parts) == 3

    def test_generate_case_number_format(self, db):
        """Should generate case number in correct format."""
        number = generate_case_number()
        assert number.startswith("SWC-")
        parts = number.split("-")
        assert len(parts) == 3
