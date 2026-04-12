"""
Tests for room-aware clock-in, auto clinic sessions, and room-aware patient routing.

Covers:
- Clock-in with room and clinic selection
- Auto-open clinic session on first clock-in
- Auto-close clinic session on last clock-out
- Room-aware patient routing (auto-assign room on call)
- ClinicRoom CRUD
"""

import pytest  # type: ignore
from datetime import date, time, timedelta

from django.utils import timezone
from rest_framework import status

from hmis.apps.clinics.models import Clinic, ClinicRoom, ClinicSession, ClinicStaff, ClinicVisit
from hmis.apps.scheduling.models import Resource, Shift


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def facility_clinic(db, sample_facility, sample_organization):
    """Create a clinic linked to the sample facility."""
    return Clinic.objects.create(
        name="General OPD",
        clinic_type="GENERAL_OPD",
        code="GOPD-ROOM-TEST",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def room_resource(db, sample_facility, sample_organization):
    """Create a PLACE resource (room)."""
    return Resource.objects.create(
        name="Room 1",
        resource_type="PLACE",
        code="ROOM-001",
        capacity=2,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def room_resource_2(db, sample_facility, sample_organization):
    """Create a second room."""
    return Resource.objects.create(
        name="Room 2",
        resource_type="PLACE",
        code="ROOM-002",
        capacity=1,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def staff_resource(db, test_staff_profile, sample_facility, sample_organization):
    """Create a PERSON resource for the test user."""
    return Resource.objects.create(
        name=f"{test_staff_profile.user.first_name} {test_staff_profile.user.last_name}",
        resource_type="PERSON",
        code="STAFF-ROOM-TEST",
        staff_profile=test_staff_profile,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def today_shift(db, staff_resource, sample_facility, sample_organization):
    """Create a SCHEDULED shift for today."""
    return Shift.objects.create(
        staff_resource=staff_resource,
        shift_date=date.today(),
        start_time=time(6, 0),
        end_time=time(18, 0),
        shift_type="DAY",
        status="SCHEDULED",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def clinic_staff_assignment(db, test_user, facility_clinic):
    """Create ClinicStaff assignment for the test user."""
    return ClinicStaff.objects.create(
        clinic=facility_clinic,
        user=test_user,
        role="DOCTOR",
        is_primary=True,
        start_date=date.today(),
        is_active=True,
    )


# =============================================================================
# Clock-in with Room & Clinic
# =============================================================================


class TestClockInWithRoom:
    """Tests for clock-in with room and clinic selection."""

    def test_clockin_with_room_and_clinic(
        self, authenticated_client, today_shift, room_resource, facility_clinic
    ):
        """Clock-in with room_id and clinic_id records both on the shift."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": room_resource.id, "clinic_id": facility_clinic.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["room"] == room_resource.id
        assert response.data["room_name"] == "Room 1"
        assert response.data["clinic"] == facility_clinic.id
        assert response.data["clinic_name"] == "General OPD"
        assert response.data["status"] == "ACTIVE"

    def test_clockin_without_room_still_works(
        self, authenticated_client, today_shift
    ):
        """Clock-in without room/clinic is backward compatible."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"
        assert response.data["room"] is None
        assert response.data["clinic"] is None

    def test_clockin_with_nonexistent_room_fails(
        self, authenticated_client, today_shift
    ):
        """Clock-in with invalid room_id returns 400."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_clockin_with_non_place_resource_fails(
        self, authenticated_client, today_shift, staff_resource
    ):
        """Clock-in with a PERSON resource as room fails."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": staff_resource.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_clockin_with_room_from_different_facility_fails(
        self, authenticated_client, today_shift, sample_organization, sample_county, sample_sub_county
    ):
        """Clock-in with a room from a different facility fails."""
        from hmis.apps.core.models import Facility

        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="88888",
            level="3",
            organization=sample_organization,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        other_room = Resource.objects.create(
            name="Other Room",
            resource_type="PLACE",
            code="OTHER-ROOM-001",
            facility=other_facility,
            organization=sample_organization,
        )
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": other_room.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_clockin_auto_resolves_clinic_from_staff_assignment(
        self, authenticated_client, today_shift, clinic_staff_assignment, facility_clinic
    ):
        """Clock-in without clinic_id auto-resolves from ClinicStaff primary assignment."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["clinic"] == facility_clinic.id
        assert response.data["clinic_name"] == "General OPD"

    def test_clockin_with_inactive_clinic_fails(
        self, authenticated_client, today_shift, facility_clinic
    ):
        """Clock-in with an inactive clinic fails."""
        facility_clinic.status = "INACTIVE"
        facility_clinic.save()
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"clinic_id": facility_clinic.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Auto Clinic Session Lifecycle
# =============================================================================


class TestAutoSessionLifecycle:
    """Tests for auto-opening and closing clinic sessions."""

    def test_first_clockin_auto_opens_session(
        self, authenticated_client, today_shift, room_resource, facility_clinic
    ):
        """First clock-in with a clinic auto-opens the session."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": room_resource.id, "clinic_id": facility_clinic.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["session_auto_opened"] is True

        # Verify session is OPEN
        session = ClinicSession.objects.get(clinic=facility_clinic, session_date=date.today())
        assert session.status == "OPEN"

    def test_second_clockin_does_not_duplicate_session(
        self, authenticated_client, today_shift, room_resource, facility_clinic,
        sample_facility, sample_organization, test_staff_profile
    ):
        """Second clock-in with same clinic does not duplicate session."""
        # First clock-in opens session
        authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": room_resource.id, "clinic_id": facility_clinic.id},
            format="json",
        )

        # Create second staff + shift
        staff2_resource = Resource.objects.create(
            name="Dr. B",
            resource_type="PERSON",
            code="STAFF-B",
            facility=sample_facility,
            organization=sample_organization,
        )
        shift2 = Shift.objects.create(
            staff_resource=staff2_resource,
            shift_date=date.today(),
            start_time=time(6, 0),
            end_time=time(18, 0),
            shift_type="DAY",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.post(
            f"/api/scheduling/shifts/{shift2.id}/start/",
            {"clinic_id": facility_clinic.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["session_auto_opened"] is False  # Already open

        # Only one session exists
        assert ClinicSession.objects.filter(
            clinic=facility_clinic, session_date=date.today()
        ).count() == 1

    def test_last_clockout_auto_closes_session(
        self, authenticated_client, today_shift, room_resource, facility_clinic
    ):
        """Clocking out the last active shift auto-closes the session."""
        # Clock in
        authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": room_resource.id, "clinic_id": facility_clinic.id},
            format="json",
        )

        # Clock out
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/complete/",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["session_auto_closed"] is True

        session = ClinicSession.objects.get(clinic=facility_clinic, session_date=date.today())
        assert session.status == "CLOSED"

    def test_clockout_with_remaining_shifts_keeps_session_open(
        self, authenticated_client, today_shift, room_resource, facility_clinic,
        sample_facility, sample_organization
    ):
        """Clocking out with other active shifts keeps the session open."""
        # Clock in first clinician
        authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {"room_id": room_resource.id, "clinic_id": facility_clinic.id},
            format="json",
        )

        # Create + clock-in second clinician
        staff2_resource = Resource.objects.create(
            name="Dr. C",
            resource_type="PERSON",
            code="STAFF-C",
            facility=sample_facility,
            organization=sample_organization,
        )
        shift2 = Shift.objects.create(
            staff_resource=staff2_resource,
            shift_date=date.today(),
            start_time=time(6, 0),
            end_time=time(18, 0),
            shift_type="DAY",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_organization,
        )
        shift2.start_shift(clinic=facility_clinic)

        # Clock out first clinician
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/complete/",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["session_auto_closed"] is False

        session = ClinicSession.objects.get(clinic=facility_clinic, session_date=date.today())
        assert session.status == "OPEN"

    def test_clockin_without_clinic_no_session_created(
        self, authenticated_client, today_shift
    ):
        """Clock-in without clinic does not create any session."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{today_shift.id}/start/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get("session_auto_opened") is False


# =============================================================================
# Room-Aware Patient Routing
# =============================================================================


class TestRoomAwareRouting:
    """Tests for auto-assigning room when calling a patient."""

    def test_call_patient_auto_assigns_room(
        self, db, test_user, today_shift, room_resource, facility_clinic,
        sample_patient, sample_facility, sample_organization
    ):
        """Calling a patient auto-assigns the clinician's room."""
        # Clock in with a room
        today_shift.start_shift(room=room_resource, clinic=facility_clinic)

        # Create session and visit
        session = ClinicSession.objects.create(
            clinic=facility_clinic,
            session_date=date.today(),
            status="OPEN",
            facility=sample_facility,
            organization=sample_organization,
        )
        visit = ClinicVisit.objects.create(
            session=session,
            patient=sample_patient,
            status="WAITING",
            priority="STANDARD",
            facility=sample_facility,
            organization=sample_organization,
        )

        # Call patient
        visit.call_patient(test_user)
        visit.refresh_from_db()

        assert visit.room == room_resource
        assert visit.status == "CALLED"
        assert visit.assigned_clinician == test_user

    def test_call_patient_no_room_when_clinician_has_no_shift(
        self, db, test_user, facility_clinic, sample_patient,
        sample_facility, sample_organization
    ):
        """Room is null when clinician has no active shift."""
        session = ClinicSession.objects.create(
            clinic=facility_clinic,
            session_date=date.today(),
            status="OPEN",
            facility=sample_facility,
            organization=sample_organization,
        )
        visit = ClinicVisit.objects.create(
            session=session,
            patient=sample_patient,
            status="WAITING",
            priority="STANDARD",
            facility=sample_facility,
            organization=sample_organization,
        )

        visit.call_patient(test_user)
        visit.refresh_from_db()

        assert visit.room is None
        assert visit.status == "CALLED"


# =============================================================================
# ClinicRoom CRUD
# =============================================================================


class TestClinicRoomCrud:
    """Tests for ClinicRoom API endpoints."""

    def test_list_clinic_rooms(
        self, authenticated_client, facility_clinic, room_resource
    ):
        """List rooms linked to a clinic."""
        ClinicRoom.objects.create(clinic=facility_clinic, room=room_resource)

        response = authenticated_client.get(
            f"/api/clinics/{facility_clinic.id}/rooms/"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["room_name"] == "Room 1"

    def test_create_clinic_room(
        self, authenticated_client, facility_clinic, room_resource
    ):
        """Link a room to a clinic."""
        response = authenticated_client.post(
            f"/api/clinics/{facility_clinic.id}/rooms/",
            {"room": room_resource.id},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert ClinicRoom.objects.filter(
            clinic=facility_clinic, room=room_resource
        ).exists()

    def test_create_clinic_room_non_place_fails(
        self, authenticated_client, facility_clinic, staff_resource
    ):
        """Linking a non-PLACE resource as a room fails."""
        response = authenticated_client.post(
            f"/api/clinics/{facility_clinic.id}/rooms/",
            {"room": staff_resource.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_clinic_room(
        self, authenticated_client, facility_clinic, room_resource
    ):
        """Unlink a room from a clinic."""
        cr = ClinicRoom.objects.create(clinic=facility_clinic, room=room_resource)
        response = authenticated_client.delete(
            f"/api/clinics/{facility_clinic.id}/rooms/{cr.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ClinicRoom.objects.filter(pk=cr.id).exists()

    def test_same_room_multiple_clinics(
        self, db, room_resource, sample_facility, sample_organization
    ):
        """Same room can be linked to multiple clinics (shared rooms)."""
        clinic_a = Clinic.objects.create(
            name="Clinic A",
            clinic_type="GENERAL_OPD",
            code="CLA-001",
            status="ACTIVE",
            facility=sample_facility,
            organization=sample_organization,
        )
        clinic_b = Clinic.objects.create(
            name="Clinic B",
            clinic_type="DENTAL",
            code="CLB-001",
            status="ACTIVE",
            facility=sample_facility,
            organization=sample_organization,
        )
        ClinicRoom.objects.create(clinic=clinic_a, room=room_resource)
        ClinicRoom.objects.create(clinic=clinic_b, room=room_resource)

        assert room_resource.clinic_rooms.count() == 2

    def test_duplicate_clinic_room_rejected(
        self, db, facility_clinic, room_resource
    ):
        """Duplicate clinic-room association is rejected."""
        ClinicRoom.objects.create(clinic=facility_clinic, room=room_resource)
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            ClinicRoom.objects.create(clinic=facility_clinic, room=room_resource)
