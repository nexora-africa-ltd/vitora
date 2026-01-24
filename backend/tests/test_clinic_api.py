"""
Tests for Clinic API endpoints - RED PHASE (TDD).

These tests define the expected behavior of the Clinics module REST API.
All tests should FAIL initially as views/serializers have not been implemented yet.

Following TDD guidelines from docs/tdd-guidelines.md:
1. RED - Write failing tests that define expected behavior
2. GREEN - Write minimal code to make tests pass
3. REFACTOR - Improve code while keeping tests green

API Endpoints tested:
- /api/clinics/ - Clinic CRUD
- /api/clinics/{id}/sessions/ - Clinic sessions
- /api/clinics/{id}/queue/ - Clinic queue management
- /api/clinics/{id}/staff/ - Clinic staff assignments
- /api/clinics/{id}/schedule/ - Clinic schedule
- /api/clinic-visits/ - Visit CRUD + actions
- /api/clinic-enrollments/ - Enrollment CRUD + queries
"""

from datetime import date, time, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def api_client():
    """Return an unauthenticated API client."""
    return APIClient()


@pytest.fixture
def clinic_admin_user(db):
    """Create an admin user for clinic management."""
    user = User.objects.create_user(
        username="clinic_admin",
        email="admin@clinic.test",
        password="testpass123",
        first_name="Admin",
        last_name="User",
        is_staff=True,
    )
    return user


@pytest.fixture
def clinic_doctor_user(db):
    """Create a doctor user for clinic operations."""
    return User.objects.create_user(
        username="clinic_doctor",
        email="doctor@clinic.test",
        password="testpass123",
        first_name="John",
        last_name="Doctor",
    )


@pytest.fixture
def clinic_nurse_user(db):
    """Create a nurse user for clinic operations."""
    return User.objects.create_user(
        username="clinic_nurse",
        email="nurse@clinic.test",
        password="testpass123",
        first_name="Jane",
        last_name="Nurse",
    )


@pytest.fixture
def authenticated_client(api_client, clinic_doctor_user):
    """Return an authenticated API client."""
    api_client.force_authenticate(user=clinic_doctor_user)
    return api_client


@pytest.fixture
def admin_client(api_client, clinic_admin_user):
    """Return an admin authenticated API client."""
    api_client.force_authenticate(user=clinic_admin_user)
    return api_client


@pytest.fixture
def sample_clinic(db):
    """Create a sample clinic for testing."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="General OPD",
        clinic_type="GENERAL_OPD",
        code="OPD-001",
        description="General outpatient department",
        location="Block A, Room 1",
        capacity=3,
        status="ACTIVE",
    )


@pytest.fixture
def eye_clinic(db):
    """Create an eye clinic for testing."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="Eye Clinic",
        clinic_type="EYE",
        code="EYE-001",
        description="Ophthalmology clinic",
        location="Block B, Room 5",
        capacity=2,
        status="ACTIVE",
    )


@pytest.fixture
def ccc_clinic(db):
    """Create a CCC (HIV) clinic for sensitive access tests."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="Comprehensive Care Clinic",
        clinic_type="CCC",
        code="CCC-001",
        description="HIV comprehensive care clinic",
        location="Block C, Room 10",
        is_sensitive=True,
        required_permission="clinics.view_ccc_clinic",
    )


@pytest.fixture
def sample_clinic_session(db, sample_clinic, clinic_doctor_user):
    """Create a sample clinic session for testing."""
    from hmis.apps.clinics.models import ClinicSession

    return ClinicSession.objects.create(
        clinic=sample_clinic,
        session_date=date.today(),
        status="OPEN",
        opened_at=timezone.now(),
        opened_by=clinic_doctor_user,
    )


@pytest.fixture
def sample_clinic_visit(db, sample_clinic_session, sample_patient, clinic_doctor_user):
    """Create a sample clinic visit for testing."""
    from hmis.apps.clinics.models import ClinicVisit

    return ClinicVisit.objects.create(
        session=sample_clinic_session,
        patient=sample_patient,
        status="WAITING",
        priority="STANDARD",
        visit_type="NEW",
        source="TRIAGE",
        chief_complaint="Headache for 2 days",
        registered_by=clinic_doctor_user,
    )


@pytest.fixture
def sample_clinic_enrollment(db, ccc_clinic, sample_patient, clinic_doctor_user):
    """Create a sample clinic enrollment for testing."""
    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=ccc_clinic,
        patient=sample_patient,
        enrollment_number="CCC-12345",
        enrollment_date=date.today() - timedelta(days=30),
        status="ACTIVE",
        enrollment_data={
            "art_start_date": "2024-01-15",
            "current_regimen": "TDF/3TC/DTG",
        },
        next_appointment=date.today() + timedelta(days=7),
        enrolled_by=clinic_doctor_user,
    )


@pytest.fixture
def clinic_data():
    """Return valid clinic creation data."""
    return {
        "name": "Dental Clinic",
        "clinic_type": "DENTAL",
        "code": "DENT-001",
        "description": "Dental services",
        "location": "Block D, Room 2",
        "capacity": 2,
        "status": "ACTIVE",
        "accepts_walk_ins": True,
        "triage_required": False,
    }


# ============================================================================
# TestClinicViewSet - Tests for Clinic CRUD endpoints
# ============================================================================


@pytest.mark.django_db
class TestClinicViewSet:
    """Test suite for Clinic API endpoints."""

    # -------------------------------------------------------------------------
    # List Clinics
    # -------------------------------------------------------------------------

    def test_list_clinics_authenticated(self, authenticated_client, sample_clinic):
        """Authenticated users can list clinics."""
        url = reverse("clinic-list")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_clinics_unauthenticated(self, api_client, sample_clinic):
        """Unauthenticated users cannot list clinics."""
        url = reverse("clinic-list")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_clinics_filter_by_type(self, authenticated_client, sample_clinic, eye_clinic):
        """Clinics can be filtered by clinic_type."""
        url = reverse("clinic-list")
        response = authenticated_client.get(url, {"clinic_type": "EYE"})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["clinic_type"] == "EYE"

    def test_list_clinics_filter_by_status(self, authenticated_client, sample_clinic, db):
        """Clinics can be filtered by status."""
        from hmis.apps.clinics.models import Clinic

        Clinic.objects.create(
            name="Inactive Clinic",
            clinic_type="OTHER",
            code="INACT-001",
            status="INACTIVE",
        )

        url = reverse("clinic-list")
        response = authenticated_client.get(url, {"status": "ACTIVE"})

        assert response.status_code == status.HTTP_200_OK
        for clinic in response.data["results"]:
            assert clinic["status"] == "ACTIVE"

    def test_list_clinics_excludes_sensitive_without_permission(
        self, authenticated_client, sample_clinic, ccc_clinic
    ):
        """Sensitive clinics are excluded without proper permission."""
        url = reverse("clinic-list")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        clinic_codes = [c["code"] for c in response.data["results"]]
        assert "CCC-001" not in clinic_codes

    # -------------------------------------------------------------------------
    # Retrieve Clinic
    # -------------------------------------------------------------------------

    def test_retrieve_clinic(self, authenticated_client, sample_clinic):
        """Can retrieve a single clinic by ID."""
        url = reverse("clinic-detail", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_clinic.pk
        assert response.data["name"] == "General OPD"
        assert response.data["clinic_type"] == "GENERAL_OPD"

    def test_retrieve_clinic_includes_is_open_today(self, authenticated_client, sample_clinic):
        """Clinic detail includes is_open_today computed field."""
        url = reverse("clinic-detail", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert "is_open_today" in response.data

    # -------------------------------------------------------------------------
    # Create Clinic
    # -------------------------------------------------------------------------

    def test_create_clinic_admin(self, admin_client, clinic_data):
        """Admin users can create clinics."""
        url = reverse("clinic-list")
        response = admin_client.post(url, clinic_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Dental Clinic"
        assert response.data["code"] == "DENT-001"

    def test_create_clinic_non_admin_forbidden(self, authenticated_client, clinic_data):
        """Non-admin users cannot create clinics."""
        url = reverse("clinic-list")
        response = authenticated_client.post(url, clinic_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_clinic_duplicate_code_fails(self, admin_client, sample_clinic, clinic_data):
        """Cannot create clinic with duplicate code."""
        clinic_data["code"] = "OPD-001"  # Same as sample_clinic
        url = reverse("clinic-list")
        response = admin_client.post(url, clinic_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "code" in response.data

    def test_create_clinic_invalid_type_fails(self, admin_client, clinic_data):
        """Cannot create clinic with invalid type."""
        clinic_data["clinic_type"] = "INVALID_TYPE"
        url = reverse("clinic-list")
        response = admin_client.post(url, clinic_data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "clinic_type" in response.data

    # -------------------------------------------------------------------------
    # Update Clinic
    # -------------------------------------------------------------------------

    def test_update_clinic_admin(self, admin_client, sample_clinic):
        """Admin users can update clinics."""
        url = reverse("clinic-detail", kwargs={"pk": sample_clinic.pk})
        response = admin_client.patch(url, {"description": "Updated description"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["description"] == "Updated description"

    def test_update_clinic_non_admin_forbidden(self, authenticated_client, sample_clinic):
        """Non-admin users cannot update clinics."""
        url = reverse("clinic-detail", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.patch(url, {"description": "Updated"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    # -------------------------------------------------------------------------
    # Delete Clinic
    # -------------------------------------------------------------------------

    def test_delete_clinic_admin(self, admin_client, sample_clinic):
        """Admin users can delete clinics."""
        url = reverse("clinic-detail", kwargs={"pk": sample_clinic.pk})
        response = admin_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_clinic_non_admin_forbidden(self, authenticated_client, sample_clinic):
        """Non-admin users cannot delete clinics."""
        url = reverse("clinic-detail", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.delete(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# TestClinicSessionEndpoints - Tests for Clinic Session endpoints
# ============================================================================


@pytest.mark.django_db
class TestClinicSessionEndpoints:
    """Test suite for Clinic Session API endpoints."""

    def test_list_clinic_sessions(self, authenticated_client, sample_clinic, sample_clinic_session):
        """Can list sessions for a clinic."""
        url = reverse("clinic-sessions-list", kwargs={"clinic_pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_clinic_session(self, authenticated_client, sample_clinic, clinic_doctor_user):
        """Can create a new clinic session."""
        url = reverse("clinic-sessions-list", kwargs={"clinic_pk": sample_clinic.pk})
        data = {"session_date": str(date.today() + timedelta(days=1))}
        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["clinic"] == sample_clinic.pk

    def test_get_today_session(self, authenticated_client, sample_clinic, sample_clinic_session):
        """Can get today's session for a clinic."""
        url = reverse("clinic-sessions-today", kwargs={"clinic_pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["session_date"] == str(date.today())

    def test_get_today_session_creates_if_not_exists(self, authenticated_client, eye_clinic):
        """Getting today's session creates one if it doesn't exist."""
        url = reverse("clinic-sessions-today", kwargs={"clinic_pk": eye_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["session_date"] == str(date.today())

    def test_open_session(self, authenticated_client, sample_clinic, db):
        """Can open today's clinic session."""
        from hmis.apps.clinics.models import ClinicSession

        session = ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today(),
            status="SCHEDULED",
        )

        url = reverse("clinic-sessions-open", kwargs={"clinic_pk": sample_clinic.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "OPEN"
        assert response.data["opened_at"] is not None

    def test_close_session(self, authenticated_client, sample_clinic, sample_clinic_session):
        """Can close today's clinic session."""
        url = reverse("clinic-sessions-close", kwargs={"clinic_pk": sample_clinic.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CLOSED"
        assert response.data["closed_at"] is not None


# ============================================================================
# TestClinicQueueEndpoints - Tests for Clinic Queue endpoints
# ============================================================================


@pytest.mark.django_db
class TestClinicQueueEndpoints:
    """Test suite for Clinic Queue API endpoints."""

    def test_get_clinic_queue(
        self, authenticated_client, sample_clinic, sample_clinic_session, sample_clinic_visit
    ):
        """Can get current queue for a clinic."""
        url = reverse("clinic-queue", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert len(response.data["results"]) >= 1

    def test_get_clinic_queue_ordered_by_priority(
        self,
        authenticated_client,
        sample_clinic,
        sample_clinic_session,
        sample_patient,
        clinic_doctor_user,
        db,
    ):
        """Queue is ordered by priority (emergency first)."""
        from hmis.apps.clinics.models import ClinicVisit
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.first() or County.objects.create(code=99, name="Test")
        sub_county = SubCounty.objects.first() or SubCounty.objects.create(
            county=county, name="Test Sub"
        )

        # Create patients
        patient2 = Patient.objects.create(
            first_name="Emergency",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
        )

        # Create standard visit first
        ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            status="WAITING",
            priority="STANDARD",
            visit_type="NEW",
            source="TRIAGE",
            chief_complaint="Headache",
            registered_by=clinic_doctor_user,
        )

        # Create emergency visit second
        ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=patient2,
            status="WAITING",
            priority="EMERGENCY",
            visit_type="EMERGENCY",
            source="DIRECT",
            chief_complaint="Chest pain",
            registered_by=clinic_doctor_user,
        )

        url = reverse("clinic-queue", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        # Emergency should be first
        assert response.data["results"][0]["priority"] == "EMERGENCY"

    def test_add_patient_to_queue(
        self, authenticated_client, sample_clinic, sample_clinic_session, sample_patient
    ):
        """Can add a patient to clinic queue."""
        url = reverse("clinic-queue", kwargs={"pk": sample_clinic.pk})
        data = {
            "patient": sample_patient.pk,
            "priority": "STANDARD",
            "visit_type": "NEW",
            "source": "TRIAGE",
            "chief_complaint": "Fever for 3 days",
        }
        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["patient"] == sample_patient.pk
        assert response.data["queue_number"] is not None

    def test_get_queue_stats(
        self, authenticated_client, sample_clinic, sample_clinic_session, sample_clinic_visit
    ):
        """Can get queue statistics for a clinic."""
        url = reverse("clinic-queue-stats", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert "waiting" in response.data
        assert "in_consultation" in response.data
        assert "completed" in response.data
        assert "average_wait_time" in response.data


# ============================================================================
# TestClinicVisitViewSet - Tests for ClinicVisit CRUD and actions
# ============================================================================


@pytest.mark.django_db
class TestClinicVisitViewSet:
    """Test suite for ClinicVisit API endpoints."""

    # -------------------------------------------------------------------------
    # List/Retrieve Visits
    # -------------------------------------------------------------------------

    def test_list_clinic_visits(self, authenticated_client, sample_clinic_visit):
        """Can list all clinic visits."""
        url = reverse("clinicvisit-list")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_clinic_visits_filter_by_status(self, authenticated_client, sample_clinic_visit):
        """Can filter visits by status."""
        url = reverse("clinicvisit-list")
        response = authenticated_client.get(url, {"status": "WAITING"})

        assert response.status_code == status.HTTP_200_OK
        for visit in response.data["results"]:
            assert visit["status"] == "WAITING"

    def test_list_clinic_visits_filter_by_clinic(
        self, authenticated_client, sample_clinic, sample_clinic_visit
    ):
        """Can filter visits by clinic."""
        url = reverse("clinicvisit-list")
        response = authenticated_client.get(url, {"clinic": sample_clinic.pk})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_clinic_visits_filter_by_date(self, authenticated_client, sample_clinic_visit):
        """Can filter visits by date."""
        url = reverse("clinicvisit-list")
        response = authenticated_client.get(url, {"date": str(date.today())})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_retrieve_clinic_visit(self, authenticated_client, sample_clinic_visit):
        """Can retrieve a single visit by ID."""
        url = reverse("clinicvisit-detail", kwargs={"pk": sample_clinic_visit.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_clinic_visit.pk
        assert "wait_time_minutes" in response.data

    # -------------------------------------------------------------------------
    # Create Visit
    # -------------------------------------------------------------------------

    def test_create_clinic_visit(self, authenticated_client, sample_clinic_session, sample_patient):
        """Can create a new clinic visit."""
        url = reverse("clinicvisit-list")
        data = {
            "session": sample_clinic_session.pk,
            "patient": sample_patient.pk,
            "priority": "STANDARD",
            "visit_type": "NEW",
            "source": "TRIAGE",
            "chief_complaint": "Cough for 1 week",
        }
        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["patient"] == sample_patient.pk
        assert response.data["queue_number"] is not None

    # -------------------------------------------------------------------------
    # Update Visit
    # -------------------------------------------------------------------------

    def test_update_clinic_visit(self, authenticated_client, sample_clinic_visit):
        """Can update a clinic visit."""
        url = reverse("clinicvisit-detail", kwargs={"pk": sample_clinic_visit.pk})
        response = authenticated_client.patch(url, {"priority": "URGENT"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["priority"] == "URGENT"

    # -------------------------------------------------------------------------
    # Call Patient Action
    # -------------------------------------------------------------------------

    def test_call_patient(self, authenticated_client, sample_clinic_visit):
        """Can call a patient for consultation."""
        url = reverse("clinicvisit-call", kwargs={"pk": sample_clinic_visit.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CALLED"
        assert response.data["called_at"] is not None
        assert response.data["assigned_clinician"] is not None

    def test_call_patient_already_called_fails(self, authenticated_client, sample_clinic_visit):
        """Cannot call a patient who is already called."""
        sample_clinic_visit.status = "CALLED"
        sample_clinic_visit.save()

        url = reverse("clinicvisit-call", kwargs={"pk": sample_clinic_visit.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # -------------------------------------------------------------------------
    # Start Consultation Action
    # -------------------------------------------------------------------------

    def test_start_consultation(self, authenticated_client, sample_clinic_visit):
        """Can start consultation for a visit."""
        sample_clinic_visit.status = "CALLED"
        sample_clinic_visit.save()

        url = reverse("clinicvisit-start", kwargs={"pk": sample_clinic_visit.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_CONSULTATION"
        assert response.data["consultation_started_at"] is not None
        assert response.data["encounter"] is not None

    def test_start_consultation_creates_encounter(self, authenticated_client, sample_clinic_visit):
        """Starting consultation creates an encounter."""
        sample_clinic_visit.status = "CALLED"
        sample_clinic_visit.save()

        url = reverse("clinicvisit-start", kwargs={"pk": sample_clinic_visit.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["encounter"] is not None

    # -------------------------------------------------------------------------
    # Complete Visit Action
    # -------------------------------------------------------------------------

    def test_complete_visit(self, authenticated_client, sample_clinic_visit):
        """Can complete a visit."""
        sample_clinic_visit.status = "IN_CONSULTATION"
        sample_clinic_visit.save()

        url = reverse("clinicvisit-complete", kwargs={"pk": sample_clinic_visit.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["completed_at"] is not None

    # -------------------------------------------------------------------------
    # Refer Patient Action
    # -------------------------------------------------------------------------

    def test_refer_to_clinic(self, authenticated_client, sample_clinic_visit, eye_clinic):
        """Can refer a patient to another clinic."""
        url = reverse("clinicvisit-refer", kwargs={"pk": sample_clinic_visit.pk})
        data = {
            "target_clinic": eye_clinic.pk,
            "reason": "Needs eye examination",
        }
        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REFERRED"
        assert response.data["referred_to_clinic"] == eye_clinic.pk
        assert "new_visit_id" in response.data

    def test_refer_to_clinic_creates_new_visit(
        self, authenticated_client, sample_clinic_visit, eye_clinic
    ):
        """Referring creates a new visit in target clinic."""
        from hmis.apps.clinics.models import ClinicVisit

        initial_count = ClinicVisit.objects.filter(session__clinic=eye_clinic).count()

        url = reverse("clinicvisit-refer", kwargs={"pk": sample_clinic_visit.pk})
        data = {
            "target_clinic": eye_clinic.pk,
            "reason": "Needs eye examination",
        }
        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        new_count = ClinicVisit.objects.filter(session__clinic=eye_clinic).count()
        assert new_count == initial_count + 1


# ============================================================================
# TestClinicStaffEndpoints - Tests for Clinic Staff assignment endpoints
# ============================================================================


@pytest.mark.django_db
class TestClinicStaffEndpoints:
    """Test suite for Clinic Staff API endpoints."""

    def test_list_clinic_staff(self, authenticated_client, sample_clinic, clinic_doctor_user, db):
        """Can list staff for a clinic."""
        from hmis.apps.clinics.models import ClinicStaff

        ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_doctor_user,
            role="DOCTOR",
            start_date=date.today(),
        )

        url = reverse("clinic-staff-list", kwargs={"clinic_pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_assign_staff_to_clinic(self, admin_client, sample_clinic, clinic_nurse_user):
        """Admin can assign staff to a clinic."""
        url = reverse("clinic-staff-list", kwargs={"clinic_pk": sample_clinic.pk})
        data = {
            "user": clinic_nurse_user.pk,
            "role": "NURSE",
            "start_date": str(date.today()),
        }
        response = admin_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["user"] == clinic_nurse_user.pk
        assert response.data["role"] == "NURSE"

    def test_remove_staff_from_clinic(self, admin_client, sample_clinic, clinic_doctor_user, db):
        """Admin can remove staff from a clinic."""
        from hmis.apps.clinics.models import ClinicStaff

        assignment = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_doctor_user,
            role="DOCTOR",
            start_date=date.today(),
        )

        url = reverse(
            "clinic-staff-detail",
            kwargs={"clinic_pk": sample_clinic.pk, "pk": assignment.pk},
        )
        response = admin_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT


# ============================================================================
# TestClinicScheduleEndpoints - Tests for Clinic Schedule endpoints
# ============================================================================


@pytest.mark.django_db
class TestClinicScheduleEndpoints:
    """Test suite for Clinic Schedule API endpoints."""

    def test_list_clinic_schedule(self, authenticated_client, sample_clinic, db):
        """Can list schedule for a clinic."""
        from hmis.apps.clinics.models import ClinicSchedule

        ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=0,  # Monday
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        url = reverse("clinic-schedule-list", kwargs={"clinic_pk": sample_clinic.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_clinic_schedule(self, admin_client, sample_clinic):
        """Admin can create a schedule entry."""
        url = reverse("clinic-schedule-list", kwargs={"clinic_pk": sample_clinic.pk})
        data = {
            "day_of_week": 1,  # Tuesday
            "start_time": "08:00:00",
            "end_time": "17:00:00",
            "max_patients": 50,
        }
        response = admin_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["day_of_week"] == 1

    def test_update_clinic_schedule(self, admin_client, sample_clinic, db):
        """Admin can update a schedule entry."""
        from hmis.apps.clinics.models import ClinicSchedule

        schedule = ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=2,  # Wednesday
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        url = reverse(
            "clinic-schedule-detail",
            kwargs={"clinic_pk": sample_clinic.pk, "pk": schedule.pk},
        )
        response = admin_client.patch(url, {"max_patients": 30}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["max_patients"] == 30

    def test_delete_clinic_schedule(self, admin_client, sample_clinic, db):
        """Admin can delete a schedule entry."""
        from hmis.apps.clinics.models import ClinicSchedule

        schedule = ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=3,  # Thursday
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        url = reverse(
            "clinic-schedule-detail",
            kwargs={"clinic_pk": sample_clinic.pk, "pk": schedule.pk},
        )
        response = admin_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT


# ============================================================================
# TestClinicEnrollmentViewSet - Tests for ClinicEnrollment endpoints
# ============================================================================


@pytest.mark.django_db
class TestClinicEnrollmentViewSet:
    """Test suite for ClinicEnrollment API endpoints."""

    # -------------------------------------------------------------------------
    # List/Retrieve Enrollments
    # -------------------------------------------------------------------------

    def test_list_enrollments(self, authenticated_client, sample_clinic_enrollment):
        """Can list clinic enrollments."""
        url = reverse("clinicenrollment-list")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_enrollments_filter_by_clinic(
        self, authenticated_client, ccc_clinic, sample_clinic_enrollment
    ):
        """Can filter enrollments by clinic."""
        url = reverse("clinicenrollment-list")
        response = authenticated_client.get(url, {"clinic": ccc_clinic.pk})

        assert response.status_code == status.HTTP_200_OK
        for enrollment in response.data["results"]:
            assert enrollment["clinic"] == ccc_clinic.pk

    def test_list_enrollments_filter_by_status(
        self, authenticated_client, sample_clinic_enrollment
    ):
        """Can filter enrollments by status."""
        url = reverse("clinicenrollment-list")
        response = authenticated_client.get(url, {"status": "ACTIVE"})

        assert response.status_code == status.HTTP_200_OK
        for enrollment in response.data["results"]:
            assert enrollment["status"] == "ACTIVE"

    def test_retrieve_enrollment(self, authenticated_client, sample_clinic_enrollment):
        """Can retrieve a single enrollment by ID."""
        url = reverse("clinicenrollment-detail", kwargs={"pk": sample_clinic_enrollment.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_clinic_enrollment.pk
        assert "is_overdue" in response.data
        assert "days_since_last_visit" in response.data

    # -------------------------------------------------------------------------
    # Create Enrollment
    # -------------------------------------------------------------------------

    def test_create_enrollment(self, authenticated_client, ccc_clinic, sample_patient):
        """Can create a new enrollment."""
        url = reverse("clinicenrollment-list")
        data = {
            "clinic": ccc_clinic.pk,
            "patient": sample_patient.pk,
            "enrollment_number": "CCC-99999",
            "enrollment_date": str(date.today()),
            "enrollment_data": {
                "art_start_date": str(date.today()),
                "current_regimen": "ABC/3TC/DTG",
            },
            "appointment_interval_days": 30,
        }
        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["enrollment_number"] == "CCC-99999"

    # -------------------------------------------------------------------------
    # Update Enrollment
    # -------------------------------------------------------------------------

    def test_update_enrollment(self, authenticated_client, sample_clinic_enrollment):
        """Can update an enrollment."""
        url = reverse("clinicenrollment-detail", kwargs={"pk": sample_clinic_enrollment.pk})
        response = authenticated_client.patch(
            url,
            {"next_appointment": str(date.today() + timedelta(days=14))},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

    # -------------------------------------------------------------------------
    # Overdue Patients
    # -------------------------------------------------------------------------

    def test_get_overdue_patients(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user, db
    ):
        """Can get list of overdue patients."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # Create an overdue enrollment
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-OVERDUE",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=7),  # Past date
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-overdue")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_get_overdue_patients_filter_by_clinic(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user, db
    ):
        """Can filter overdue patients by clinic."""
        from hmis.apps.clinics.models import ClinicEnrollment

        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-OVERDUE-2",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=3),
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-overdue")
        response = authenticated_client.get(url, {"clinic": ccc_clinic.pk})

        assert response.status_code == status.HTTP_200_OK
        for enrollment in response.data["results"]:
            assert enrollment["clinic"] == ccc_clinic.pk

    # -------------------------------------------------------------------------
    # Defaulters
    # -------------------------------------------------------------------------

    def test_get_defaulters(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user, db
    ):
        """Can get list of defaulters (missed 2+ appointments)."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # Create a defaulter (significantly overdue)
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-DEFAULTER",
            enrollment_date=date.today() - timedelta(days=180),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=90),  # 3 months overdue
            last_visit_date=date.today() - timedelta(days=120),
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-defaulters")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

    # -------------------------------------------------------------------------
    # Record Visit
    # -------------------------------------------------------------------------

    def test_record_visit(self, authenticated_client, sample_clinic_enrollment):
        """Can record a visit for an enrollment."""
        url = reverse("clinicenrollment-record-visit", kwargs={"pk": sample_clinic_enrollment.pk})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["last_visit_date"] == str(date.today())
        assert response.data["total_visits"] == sample_clinic_enrollment.total_visits + 1


# ============================================================================
# TestClinicEnrollmentFilters - Tests for new filter parameters
# ============================================================================


@pytest.mark.django_db
class TestClinicEnrollmentFilters:
    """Test suite for ClinicEnrollment filter enhancements."""

    def test_filter_by_clinic_type(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user
    ):
        """Can filter enrollments by clinic_type."""
        from hmis.apps.clinics.models import ClinicEnrollment

        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-FILTER-1",
            enrollment_date=date.today(),
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-list")
        response = authenticated_client.get(url, {"clinic_type": "CCC"})

        assert response.status_code == status.HTTP_200_OK
        for enrollment in response.data["results"]:
            assert enrollment["clinic_type"] == "CCC"

    def test_filter_by_is_overdue_true(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user
    ):
        """Can filter enrollments that are overdue."""
        from hmis.apps.clinics.models import ClinicEnrollment

        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-OVERDUE-FILTER",
            enrollment_date=date.today() - timedelta(days=60),
            status="ACTIVE",
            next_appointment=date.today() - timedelta(days=7),
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-list")
        response = authenticated_client.get(url, {"is_overdue": "true"})

        assert response.status_code == status.HTTP_200_OK
        for enrollment in response.data["results"]:
            assert enrollment["is_overdue"] is True

    def test_filter_by_is_defaulter_true(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user
    ):
        """Can filter enrollments that are defaulters."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # Create a defaulter (2+ appointment cycles overdue)
        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-DEFAULTER-FILTER",
            enrollment_date=date.today() - timedelta(days=180),
            status="ACTIVE",
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=65),  # > 2x30 days
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-list")
        response = authenticated_client.get(url, {"is_defaulter": "true"})

        assert response.status_code == status.HTTP_200_OK
        for enrollment in response.data["results"]:
            assert enrollment["is_defaulter"] is True

    def test_filter_by_enrollment_type_ccc(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user
    ):
        """Can filter by enrollment_type=CCC."""
        from hmis.apps.clinics.models import ClinicEnrollment

        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-TYPE-FILTER",
            enrollment_date=date.today() - timedelta(days=1),
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-list")
        response = authenticated_client.get(url, {"enrollment_type": "CCC"})

        assert response.status_code == status.HTTP_200_OK
        for enrollment in response.data["results"]:
            assert enrollment["enrollment_type"] == "CCC"


# ============================================================================
# TestClinicEnrollmentSerializerComputedFields - Tests for computed fields
# ============================================================================


@pytest.mark.django_db
class TestClinicEnrollmentSerializerComputedFields:
    """Test suite for ClinicEnrollment serializer computed fields."""

    def test_ccc_enrollment_serializer_fields(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user
    ):
        """CCC enrollment serializer should include CCC computed fields."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-SERIALIZER-1",
            enrollment_date=date.today() - timedelta(days=365),
            enrolled_by=clinic_doctor_user,
            art_start_date=date.today() - timedelta(days=365),
            current_art_regimen="TDF/3TC/DTG",
            latest_viral_load=50,
            viral_load_suppressed=True,
        )

        url = reverse("clinicenrollment-detail", kwargs={"pk": enrollment.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["enrollment_type"] == "CCC"
        assert response.data["days_on_art"] == 365
        assert response.data["is_virally_suppressed"] is True
        assert response.data["viral_load_due"] is True  # >6 months since no VL date
        assert "clinic_specific_summary" in response.data
        assert response.data["clinic_specific_summary"]["type"] == "CCC"

    def test_anc_enrollment_serializer_fields(
        self, authenticated_client, sample_patient, clinic_doctor_user
    ):
        """ANC enrollment serializer should include ANC computed fields."""
        from hmis.apps.clinics.models import Clinic, ClinicEnrollment

        anc_clinic = Clinic.objects.create(
            name="ANC Test Clinic",
            clinic_type="ANC",
            code="ANC-TEST-SER",
        )

        lmp_date = date.today() - timedelta(days=140)  # 20 weeks

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_number="ANC-SERIALIZER-1",
            enrollment_date=date.today(),
            enrolled_by=clinic_doctor_user,
            gravida=2,
            para=1,
            lmp=lmp_date,
            edd=lmp_date + timedelta(days=280),
            hiv_status="NEGATIVE",
        )

        url = reverse("clinicenrollment-detail", kwargs={"pk": enrollment.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["enrollment_type"] == "ANC"
        assert response.data["gestation_weeks"] == 20
        assert response.data["gestation_display"] == "20 weeks 0 days"
        assert response.data["trimester"] == 2
        assert response.data["days_to_edd"] is not None
        assert response.data["clinic_specific_summary"]["type"] == "ANC"

    def test_diabetic_enrollment_serializer_fields(
        self, authenticated_client, sample_patient, clinic_doctor_user
    ):
        """Diabetic enrollment serializer should include diabetic computed fields."""

        from hmis.apps.clinics.models import Clinic, ClinicEnrollment

        diabetic_clinic = Clinic.objects.create(
            name="Diabetic Test Clinic",
            clinic_type="DIABETIC",
            code="DM-TEST-SER",
        )

        enrollment = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_number="DM-SERIALIZER-1",
            enrollment_date=date.today(),
            enrolled_by=clinic_doctor_user,
            diabetes_type="TYPE_2",
            latest_hba1c=Decimal("6.5"),
            latest_hba1c_date=date.today() - timedelta(days=30),
            on_insulin=True,
        )

        url = reverse("clinicenrollment-detail", kwargs={"pk": enrollment.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["enrollment_type"] == "DIABETIC"
        assert response.data["hba1c_controlled"] is True  # < 7%
        assert response.data["hba1c_due"] is False  # < 3 months
        assert response.data["clinic_specific_summary"]["type"] == "DIABETIC"

    def test_enrollment_defaulter_fields_in_response(
        self, authenticated_client, ccc_clinic, sample_patient, clinic_doctor_user
    ):
        """Enrollment response should include defaulter tracking fields."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_number="CCC-DEFAULTER-SER",
            enrollment_date=date.today() - timedelta(days=180),
            status="ACTIVE",
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=65),  # 65 days overdue
            enrolled_by=clinic_doctor_user,
        )

        url = reverse("clinicenrollment-detail", kwargs={"pk": enrollment.pk})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_overdue"] is True
        assert response.data["is_defaulter"] is True
        assert response.data["days_overdue"] == 65

    def test_create_anc_enrollment_auto_calculates_edd(
        self, authenticated_client, sample_patient, clinic_doctor_user
    ):
        """Creating ANC enrollment with LMP should auto-calculate EDD."""
        from hmis.apps.clinics.models import Clinic

        anc_clinic = Clinic.objects.create(
            name="ANC Auto EDD Test",
            clinic_type="ANC",
            code="ANC-AUTO-EDD",
        )

        lmp_date = date.today() - timedelta(days=100)

        url = reverse("clinicenrollment-list")
        data = {
            "clinic": anc_clinic.pk,
            "patient": sample_patient.pk,
            "enrollment_number": "ANC-EDD-AUTO",
            "enrollment_date": str(date.today()),
            "lmp": str(lmp_date),
            "gravida": 1,
            "para": 0,
        }
        response = authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        # EDD should be LMP + 280 days
        expected_edd = lmp_date + timedelta(days=280)
        assert response.data["edd"] == str(expected_edd)


# ============================================================================
# TestClinicAPIPermissions - Tests for API permissions
# ============================================================================


@pytest.mark.django_db
class TestClinicAPIPermissions:
    """Test suite for Clinic API permissions."""

    def test_unauthenticated_access_denied(self, api_client, sample_clinic):
        """Unauthenticated users cannot access clinic endpoints."""
        urls = [
            reverse("clinic-list"),
            reverse("clinic-detail", kwargs={"pk": sample_clinic.pk}),
            reverse("clinicvisit-list"),
            reverse("clinicenrollment-list"),
        ]

        for url in urls:
            response = api_client.get(url)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_create_clinic(self, authenticated_client, clinic_data):
        """Non-admin users cannot create clinics."""
        url = reverse("clinic-list")
        response = authenticated_client.post(url, clinic_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_non_admin_cannot_delete_clinic(self, authenticated_client, sample_clinic):
        """Non-admin users cannot delete clinics."""
        url = reverse("clinic-detail", kwargs={"pk": sample_clinic.pk})
        response = authenticated_client.delete(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN
