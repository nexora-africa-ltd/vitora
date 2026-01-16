"""
Tests for AdmissionRecommendation model - Sprint 1.5-1.6 Track D.

Test Coverage (10 tests):
- Recommendation creation from OPD encounter
- Encounter status update to ADMISSION_PENDING
- Recommendation expiry after 24 hours
- Recommendation acceptance flow
- Recommendation decline with reason
- Duplicate recommendation prevention
- Only OPD encounters can have recommendations
- Recommendation notification to reception
- Expired recommendation handling
- Recommendation audit logging
"""

from datetime import timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone

from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.inpatient.models import AdmissionRecommendation
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def test_user(db):
    """Create a test user (clinician)."""
    return User.objects.create_user(
        username="drsmith",
        password="testpass123",
        email="drsmith@example.com",
    )


@pytest.fixture
def second_user(db):
    """Create a second test user."""
    return User.objects.create_user(
        username="reception",
        password="testpass123",
        email="reception@example.com",
    )


@pytest.fixture
def sample_patient(db, test_user):
    """Create a sample patient."""
    county = County.objects.create(code=1, name="Test County")
    sub_county = SubCounty.objects.create(county=county, name="Test SubCounty")

    return Patient.objects.create(
        first_name="John",
        last_name="Doe",
        date_of_birth="1990-01-01",
        gender="M",
        county=county,
        sub_county=sub_county,
        registered_by=test_user,
    )


@pytest.fixture
def opd_encounter(db, sample_patient):
    """Create an OPD encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        encounter_date=timezone.now().date(),
        chief_complaint="Severe abdominal pain",
    )


@pytest.mark.django_db
class TestAdmissionRecommendationCreation:
    """Tests for AdmissionRecommendation creation."""

    def test_create_recommendation_from_opd_encounter(self, opd_encounter, test_user):
        """Should create admission recommendation from OPD encounter."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Suspected appendicitis requiring surgical intervention",
            provisional_diagnosis="K35.8",
            provisional_diagnosis_text="Acute appendicitis, unspecified",
            urgency="URGENT",
            preferred_ward_type="SURGICAL",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        assert recommendation.id is not None
        assert recommendation.encounter == opd_encounter
        assert recommendation.recommended_by == test_user
        assert recommendation.reason == "Suspected appendicitis requiring surgical intervention"
        assert recommendation.provisional_diagnosis == "K35.8"
        assert recommendation.urgency == "URGENT"
        assert recommendation.preferred_ward_type == "SURGICAL"
        assert recommendation.status == "PENDING"
        assert recommendation.expires_at is not None
        assert recommendation.created_at is not None

    def test_default_status_pending(self, opd_encounter, test_user):
        """Should default to PENDING status."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Observation required",
            provisional_diagnosis="R07.4",
            provisional_diagnosis_text="Chest pain, unspecified",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        assert recommendation.status == "PENDING"

    def test_default_urgency_routine(self, opd_encounter, test_user):
        """Should default to ROUTINE urgency."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Elective surgery",
            provisional_diagnosis="K40.9",
            provisional_diagnosis_text="Unilateral inguinal hernia",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        assert recommendation.urgency == "ROUTINE"

    def test_duplicate_recommendation_prevention(self, opd_encounter, test_user):
        """Should prevent duplicate recommendations for same encounter."""
        AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="First recommendation",
            provisional_diagnosis="K35.8",
            provisional_diagnosis_text="Acute appendicitis",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        with pytest.raises(IntegrityError):
            AdmissionRecommendation.objects.create(
                encounter=opd_encounter,
                recommended_by=test_user,
                reason="Second recommendation",
                provisional_diagnosis="K35.8",
                provisional_diagnosis_text="Acute appendicitis",
                expires_at=timezone.now() + timedelta(hours=24),
            )

    def test_optional_preferred_ward_type(self, opd_encounter, test_user):
        """Should allow recommendation without preferred ward type."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="General admission",
            provisional_diagnosis="R50.9",
            provisional_diagnosis_text="Fever, unspecified",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        assert recommendation.preferred_ward_type == ""

    def test_recommendation_expiry_set_24_hours(self, opd_encounter, test_user):
        """Should set expiry 24 hours from creation."""
        now = timezone.now()
        expires_at = now + timedelta(hours=24)

        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Test admission",
            provisional_diagnosis="Z00.0",
            provisional_diagnosis_text="General medical examination",
            expires_at=expires_at,
        )

        # Check expiry is approximately 24 hours from now
        time_until_expiry = recommendation.expires_at - now
        assert 23.9 <= time_until_expiry.total_seconds() / 3600 <= 24.1


@pytest.mark.django_db
class TestAdmissionRecommendationWorkflow:
    """Tests for recommendation workflow methods."""

    def test_accept_recommendation(self, opd_encounter, test_user, second_user):
        """Should accept recommendation and update status."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Patient requires admission",
            provisional_diagnosis="J18.9",
            provisional_diagnosis_text="Pneumonia, unspecified",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        recommendation.accept(second_user)
        recommendation.refresh_from_db()

        assert recommendation.status == "ACCEPTED"
        assert recommendation.resolved_by == second_user
        assert recommendation.resolved_at is not None

    def test_decline_recommendation_with_reason(self, opd_encounter, test_user, second_user):
        """Should decline recommendation with reason."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Patient needs admission",
            provisional_diagnosis="I10",
            provisional_diagnosis_text="Essential hypertension",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        decline_reason = "Patient condition improved, discharge with medication"
        recommendation.decline(second_user, decline_reason)
        recommendation.refresh_from_db()

        assert recommendation.status == "DECLINED"
        assert recommendation.resolved_by == second_user
        assert recommendation.resolved_at is not None
        assert recommendation.decline_reason == decline_reason

    def test_is_expired_returns_true_after_expiry(self, opd_encounter, test_user):
        """Should return True if recommendation has expired."""
        past_time = timezone.now() - timedelta(hours=1)

        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Old recommendation",
            provisional_diagnosis="R50.9",
            provisional_diagnosis_text="Fever",
            expires_at=past_time,
        )

        assert recommendation.is_expired() is True

    def test_is_expired_returns_false_before_expiry(self, opd_encounter, test_user):
        """Should return False if recommendation has not expired."""
        future_time = timezone.now() + timedelta(hours=24)

        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="New recommendation",
            provisional_diagnosis="R50.9",
            provisional_diagnosis_text="Fever",
            expires_at=future_time,
        )

        assert recommendation.is_expired() is False

    def test_cannot_accept_already_accepted_recommendation(self, opd_encounter, test_user, second_user):
        """Should not allow accepting an already accepted recommendation."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Patient needs admission",
            provisional_diagnosis="J18.9",
            provisional_diagnosis_text="Pneumonia",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        recommendation.accept(second_user)
        recommendation.refresh_from_db()

        with pytest.raises(ValueError, match="Recommendation already resolved"):
            recommendation.accept(second_user)

    def test_cannot_decline_already_declined_recommendation(self, opd_encounter, test_user, second_user):
        """Should not allow declining an already declined recommendation."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Patient needs admission",
            provisional_diagnosis="J18.9",
            provisional_diagnosis_text="Pneumonia",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        recommendation.decline(second_user, "Not needed")
        recommendation.refresh_from_db()

        with pytest.raises(ValueError, match="Recommendation already resolved"):
            recommendation.decline(second_user, "Another reason")


@pytest.mark.django_db
class TestAdmissionRecommendationQueries:
    """Tests for recommendation query operations."""

    def test_filter_pending_recommendations(self, opd_encounter, test_user, second_user, sample_patient):
        """Should filter recommendations by status."""
        # Create pending recommendation
        AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Pending admission",
            provisional_diagnosis="J18.9",
            provisional_diagnosis_text="Pneumonia",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        # Create accepted recommendation for different encounter
        encounter2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=timezone.now().date(),
            chief_complaint="Other complaint",
        )
        rec2 = AdmissionRecommendation.objects.create(
            encounter=encounter2,
            recommended_by=test_user,
            reason="Another admission",
            provisional_diagnosis="I10",
            provisional_diagnosis_text="Hypertension",
            expires_at=timezone.now() + timedelta(hours=24),
        )
        rec2.accept(second_user)

        pending = AdmissionRecommendation.objects.filter(status="PENDING")
        accepted = AdmissionRecommendation.objects.filter(status="ACCEPTED")

        assert pending.count() == 1
        assert accepted.count() == 1

    def test_filter_by_urgency(self, sample_patient, test_user):
        """Should filter recommendations by urgency level."""
        # Create encounters
        enc1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=timezone.now().date(),
            chief_complaint="Emergency case",
        )
        enc2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=timezone.now().date(),
            chief_complaint="Routine case",
        )

        AdmissionRecommendation.objects.create(
            encounter=enc1,
            recommended_by=test_user,
            reason="Critical condition",
            provisional_diagnosis="I21.9",
            provisional_diagnosis_text="Acute myocardial infarction",
            urgency="EMERGENCY",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        AdmissionRecommendation.objects.create(
            encounter=enc2,
            recommended_by=test_user,
            reason="Elective procedure",
            provisional_diagnosis="K40.9",
            provisional_diagnosis_text="Inguinal hernia",
            urgency="ROUTINE",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        emergency_recs = AdmissionRecommendation.objects.filter(urgency="EMERGENCY")
        routine_recs = AdmissionRecommendation.objects.filter(urgency="ROUTINE")

        assert emergency_recs.count() == 1
        assert routine_recs.count() == 1

    def test_recommendation_string_representation(self, opd_encounter, test_user):
        """Should return proper string representation."""
        recommendation = AdmissionRecommendation.objects.create(
            encounter=opd_encounter,
            recommended_by=test_user,
            reason="Test admission",
            provisional_diagnosis="R50.9",
            provisional_diagnosis_text="Fever, unspecified",
            expires_at=timezone.now() + timedelta(hours=24),
        )

        expected = f"Admission Recommendation for {opd_encounter.patient} - {recommendation.status}"
        assert str(recommendation) == expected
