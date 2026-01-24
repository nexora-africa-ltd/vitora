"""
TDD Tests for Triage → Clinic Routing Integration.

Tests routing patients from triage assessment to specific clinics.
"""

from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient
from hmis.apps.triage.models import TriageAssessment

User = get_user_model()


@pytest.fixture
def api_client():
    """Create API test client."""
    return APIClient()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username="triageuser",
        email="triage@example.com",
        password="testpass123",
    )


@pytest.fixture
def authenticated_client(api_client, test_user):
    """Create authenticated API client."""
    api_client.force_authenticate(user=test_user)
    return api_client


@pytest.fixture
def sample_patient(db):
    """Create a sample patient."""
    from hmis.apps.core.models import County, SubCounty

    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    return Patient.objects.create(
        first_name="Jane",
        last_name="Wanjiku",
        date_of_birth="1990-03-15",
        gender="F",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def sample_encounter(db, sample_patient):
    """Create a sample encounter for triage."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Eye pain and blurred vision",
    )


@pytest.fixture
def sample_clinic(db):
    """Create a sample clinic."""
    return Clinic.objects.create(
        name="General OPD",
        code="GEN-OPD-001",
        clinic_type="GENERAL_OPD",
        status="ACTIVE",
    )


@pytest.fixture
def eye_clinic(db):
    """Create an eye clinic for referral testing."""
    return Clinic.objects.create(
        name="Eye Clinic",
        code="EYE-001",
        clinic_type="EYE",
        status="ACTIVE",
    )


@pytest.fixture
def sample_triage(db, sample_encounter, test_user):
    """Create a completed triage assessment."""
    now = timezone.now()
    return TriageAssessment.objects.create(
        encounter=sample_encounter,
        chief_complaint="Eye pain and blurred vision",
        chief_complaint_category="OTHER",
        mental_status="A",
        mobility="AMBULATORY",
        arrival_mode="WALK_IN",
        triage_category="YELLOW",
        auto_calculated_category="YELLOW",
        assigned_area="OPD",
        arrival_time=now,
        triage_start_time=now,
        triage_end_time=now,
        triaged_by=test_user,
    )


# =============================================================================
# Triage Model Tests
# =============================================================================


class TestTriageRouteToClinic:
    """Tests for TriageAssessment.route_to_clinic() method."""

    def test_route_to_clinic_creates_clinic_visit(self, sample_triage, eye_clinic, test_user):
        """Should create ClinicVisit when routing from triage."""
        visit = sample_triage.route_to_clinic(
            clinic=eye_clinic,
            user=test_user,
            notes="Referred for eye examination",
        )

        assert visit is not None
        assert isinstance(visit, ClinicVisit)
        assert visit.patient == sample_triage.encounter.patient
        assert visit.session.clinic == eye_clinic

    def test_route_to_clinic_sets_correct_priority(self, sample_triage, eye_clinic, test_user):
        """Should set visit priority based on triage category."""
        visit = sample_triage.route_to_clinic(
            clinic=eye_clinic,
            user=test_user,
        )

        # Yellow triage = YELLOW priority
        assert visit.priority == "YELLOW"

    def test_route_to_clinic_copies_chief_complaint(self, sample_triage, eye_clinic, test_user):
        """Should copy chief complaint from triage."""
        visit = sample_triage.route_to_clinic(
            clinic=eye_clinic,
            user=test_user,
        )

        assert visit.chief_complaint == sample_triage.chief_complaint

    def test_route_to_clinic_links_triage_assessment(self, sample_triage, eye_clinic, test_user):
        """Should link the clinic visit to triage assessment."""
        visit = sample_triage.route_to_clinic(
            clinic=eye_clinic,
            user=test_user,
        )

        assert visit.triage_assessment == sample_triage

    def test_route_to_clinic_creates_session_if_needed(self, sample_triage, eye_clinic, test_user):
        """Should create clinic session for today if none exists."""
        # Ensure no session exists
        ClinicSession.objects.filter(clinic=eye_clinic).delete()

        visit = sample_triage.route_to_clinic(
            clinic=eye_clinic,
            user=test_user,
        )

        assert visit.session is not None
        assert visit.session.clinic == eye_clinic
        assert visit.session.session_date == date.today()

    def test_route_to_clinic_uses_existing_session(self, sample_triage, eye_clinic, test_user):
        """Should use existing open session if available."""
        existing_session = ClinicSession.objects.create(
            clinic=eye_clinic,
            session_date=date.today(),
            status="OPEN",
        )

        visit = sample_triage.route_to_clinic(
            clinic=eye_clinic,
            user=test_user,
        )

        assert visit.session == existing_session

    def test_route_to_clinic_with_notes(self, sample_triage, eye_clinic, test_user):
        """Should include routing notes in visit."""
        visit = sample_triage.route_to_clinic(
            clinic=eye_clinic,
            user=test_user,
            notes="Urgent - possible retinal detachment",
        )

        assert "Urgent - possible retinal detachment" in (visit.notes or "")

    def test_route_to_inactive_clinic_fails(self, sample_triage, eye_clinic, test_user):
        """Should not route to inactive clinic."""
        eye_clinic.status = "INACTIVE"
        eye_clinic.save()

        with pytest.raises(ValueError, match="not active"):
            sample_triage.route_to_clinic(
                clinic=eye_clinic,
                user=test_user,
            )


# =============================================================================
# API Tests
# =============================================================================


class TestTriageRouteToClinicAPI:
    """Tests for POST /api/triage/assessments/{id}/route-to-clinic/ endpoint."""

    def test_route_to_clinic_endpoint_creates_visit(
        self, authenticated_client, sample_triage, eye_clinic
    ):
        """Should create clinic visit via API."""
        url = f"/api/triage/assessments/{sample_triage.id}/route-to-clinic/"
        response = authenticated_client.post(
            url,
            {
                "clinic_id": eye_clinic.id,
                "notes": "Referred for eye examination",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "id" in response.data
        # Patient may be returned as ID or nested object depending on serializer
        patient_data = response.data.get("patient")
        if isinstance(patient_data, dict):
            assert patient_data["id"] == sample_triage.encounter.patient.id
        else:
            assert patient_data == sample_triage.encounter.patient.id

    def test_route_to_clinic_endpoint_requires_auth(self, api_client, sample_triage, eye_clinic):
        """Should require authentication."""
        url = f"/api/triage/assessments/{sample_triage.id}/route-to-clinic/"
        response = api_client.post(
            url,
            {"clinic_id": eye_clinic.id},
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_route_to_clinic_endpoint_requires_clinic_id(self, authenticated_client, sample_triage):
        """Should require clinic_id parameter."""
        url = f"/api/triage/assessments/{sample_triage.id}/route-to-clinic/"
        response = authenticated_client.post(url, {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "clinic_id" in str(response.data).lower()

    def test_route_to_clinic_endpoint_validates_clinic_exists(
        self, authenticated_client, sample_triage
    ):
        """Should validate clinic exists."""
        url = f"/api/triage/assessments/{sample_triage.id}/route-to-clinic/"
        response = authenticated_client.post(
            url,
            {"clinic_id": 99999},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_route_to_clinic_endpoint_returns_queue_number(
        self, authenticated_client, sample_triage, eye_clinic
    ):
        """Should return queue number in response."""
        url = f"/api/triage/assessments/{sample_triage.id}/route-to-clinic/"
        response = authenticated_client.post(
            url,
            {"clinic_id": eye_clinic.id},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "queue_number" in response.data
