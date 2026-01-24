"""
TDD Tests for Triage → Clinic Routing Integration.

Tests for POST /api/triage/{id}/route-to-clinic/
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.patients.models import Patient
from hmis.apps.triage.models import TriageAssessment

User = get_user_model()


@pytest.fixture
def api_client():
    """Return an unauthenticated API client."""
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, test_user):
    """Return an authenticated API client."""
    api_client.force_authenticate(user=test_user)
    return api_client


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username="testuser",
        email="test@example.com",
        password="testpass123",
    )


@pytest.fixture
def sample_patient(db):
    """Create a sample patient."""
    from hmis.apps.core.models import County, SubCounty

    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(
        name="Westlands", defaults={"county": county}
    )
    return Patient.objects.create(
        first_name="Jane",
        last_name="Doe",
        date_of_birth="1990-01-15",
        gender="F",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def sample_clinic(db):
    """Create a sample clinic."""
    return Clinic.objects.create(
        name="General OPD",
        code="GEN-OPD-001",
        clinic_type="GENERAL_OPD",
        status="ACTIVE",
        location="Ground Floor, Room 101",
    )


@pytest.fixture
def sample_triage_assessment(db, sample_patient, test_user):
    """Create a sample triage assessment."""
    return TriageAssessment.objects.create(
        patient=sample_patient,
        chief_complaint_category="FEVER",
        chief_complaint_text="High temperature for 2 days",
        triage_category="GREEN",
        assessed_by=test_user,
    )


@pytest.mark.django_db
class TestRouteToClinicAuthentication:
    """Test authentication requirements for route-to-clinic endpoint."""

    def test_route_to_clinic_requires_authentication(
        self, api_client, sample_triage_assessment, sample_clinic
    ):
        """Should reject unauthenticated requests."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = api_client.post(url, {"clinic_id": sample_clinic.id})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_route_to_clinic_accessible_when_authenticated(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should accept authenticated requests."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": sample_clinic.id})
        # Either success (201) or validation error (400), not 401/403
        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,
        ]


@pytest.mark.django_db
class TestRouteToClinicValidation:
    """Test validation for route-to-clinic endpoint."""

    def test_route_to_clinic_requires_clinic_id(
        self, authenticated_client, sample_triage_assessment
    ):
        """Should require clinic_id parameter."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "clinic_id" in response.data or "clinic" in str(response.data).lower()

    def test_route_to_clinic_rejects_invalid_clinic_id(
        self, authenticated_client, sample_triage_assessment
    ):
        """Should reject non-existent clinic ID."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": 99999})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_route_to_clinic_rejects_inactive_clinic(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should reject routing to inactive clinic."""
        sample_clinic.status = "INACTIVE"
        sample_clinic.save()

        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": sample_clinic.id})
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestRouteToClinicSuccess:
    """Test successful route-to-clinic operations."""

    def test_route_to_clinic_creates_clinic_visit(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should create a ClinicVisit when routing succeeds."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": sample_clinic.id})

        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]
        assert "clinic_visit_id" in response.data or "visit" in response.data

        # Verify ClinicVisit was created
        visit = ClinicVisit.objects.filter(
            patient=sample_triage_assessment.patient,
            triage_assessment=sample_triage_assessment,
        ).first()
        assert visit is not None
        assert visit.session.clinic == sample_clinic

    def test_route_to_clinic_creates_session_if_needed(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should create today's session if it doesn't exist."""
        from datetime import date

        # Ensure no session exists
        ClinicSession.objects.filter(clinic=sample_clinic, session_date=date.today()).delete()

        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": sample_clinic.id})

        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]

        # Verify session was created
        session = ClinicSession.objects.filter(
            clinic=sample_clinic, session_date=date.today()
        ).first()
        assert session is not None

    def test_route_to_clinic_uses_triage_priority(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should map triage category to clinic visit priority."""
        sample_triage_assessment.triage_category = "RED"
        sample_triage_assessment.save()

        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": sample_clinic.id})

        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]

        visit = ClinicVisit.objects.filter(
            triage_assessment=sample_triage_assessment
        ).first()
        assert visit is not None
        assert visit.priority == "EMERGENCY"  # RED maps to EMERGENCY

    def test_route_to_clinic_links_triage_assessment(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should link the clinic visit to the triage assessment."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": sample_clinic.id})

        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]

        visit = ClinicVisit.objects.filter(
            triage_assessment=sample_triage_assessment
        ).first()
        assert visit is not None
        assert visit.triage_assessment_id == sample_triage_assessment.id
        assert visit.source == "TRIAGE"

    def test_route_to_clinic_copies_chief_complaint(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should copy chief complaint from triage to clinic visit."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(url, {"clinic_id": sample_clinic.id})

        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]

        visit = ClinicVisit.objects.filter(
            triage_assessment=sample_triage_assessment
        ).first()
        assert visit is not None
        assert sample_triage_assessment.chief_complaint_text in visit.chief_complaint

    def test_route_to_clinic_with_optional_notes(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should accept optional routing notes."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"
        response = authenticated_client.post(
            url,
            {
                "clinic_id": sample_clinic.id,
                "notes": "Patient needs urgent eye examination",
            },
        )

        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]

        visit = ClinicVisit.objects.filter(
            triage_assessment=sample_triage_assessment
        ).first()
        assert visit is not None
        assert "urgent eye examination" in visit.notes


@pytest.mark.django_db
class TestRouteToClinicIdempotency:
    """Test idempotency of route-to-clinic."""

    def test_cannot_route_already_routed_triage(
        self, authenticated_client, sample_triage_assessment, sample_clinic
    ):
        """Should prevent re-routing an already routed triage."""
        url = f"/api/triage/{sample_triage_assessment.id}/route-to-clinic/"

        # First routing - should succeed
        response1 = authenticated_client.post(url, {"clinic_id": sample_clinic.id})
        assert response1.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]

        # Second routing - should fail or return existing
        response2 = authenticated_client.post(url, {"clinic_id": sample_clinic.id})
        # Either 400 (rejected) or 200 (returns existing) is acceptable
        assert response2.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_200_OK,
            status.HTTP_409_CONFLICT,
        ]
