"""
Tests for triage room assignment and auto-routing.

Covers:
- WaitingQueue.triage_room FK
- TriageSettings model (auto_route_to_room toggle)
- find_best_triage_room() service function
- API endpoints: assign-room, available-triage-rooms, settings
"""

from datetime import date, time

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.models import Department
from hmis.apps.scheduling.models import Resource, Shift
from hmis.apps.triage.models import TriageSettings, WaitingQueue
from hmis.apps.triage.services import find_best_triage_room


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def triage_department(db):
    """A Department tagged for triage rooms."""
    return Department.objects.create(name="Triage", code="TRIAGE", is_active=True)


@pytest.fixture
def triage_settings(db, sample_facility, triage_department):
    """TriageSettings with auto-routing enabled."""
    return TriageSettings.objects.create(
        facility=sample_facility,
        auto_route_to_room=True,
        triage_department=triage_department,
    )


@pytest.fixture
def triage_room_a(db, sample_facility, triage_department):
    """First triage room (capacity 2)."""
    return Resource.objects.create(
        facility=sample_facility,
        name="Triage Room A",
        code="TR-A",
        resource_type="PLACE",
        is_active=True,
        capacity=2,
        department=triage_department,
    )


@pytest.fixture
def triage_room_b(db, sample_facility, triage_department):
    """Second triage room (capacity 1)."""
    return Resource.objects.create(
        facility=sample_facility,
        name="Triage Room B",
        code="TR-B",
        resource_type="PLACE",
        is_active=True,
        capacity=1,
        department=triage_department,
    )


@pytest.fixture
def staff_resource(db, sample_facility):
    """A PERSON resource for shift fixtures."""
    return Resource.objects.create(
        facility=sample_facility,
        name="Nurse Joy",
        code="NURSE-001",
        resource_type="PERSON",
        is_active=True,
    )


@pytest.fixture
def active_shift_in_room_a(db, sample_facility, staff_resource, triage_room_a):
    """An ACTIVE shift in triage_room_a."""
    return Shift.objects.create(
        facility=sample_facility,
        staff_resource=staff_resource,
        shift_date=date.today(),
        start_time=time(7, 0),
        end_time=time(19, 0),
        shift_type="DAY",
        status="ACTIVE",
        room=triage_room_a,
        started_at=timezone.now(),
    )


@pytest.fixture
def waiting_entry(db, sample_patient, sample_encounter):
    """A basic waiting queue entry."""
    return WaitingQueue.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        status="WAITING_TRIAGE",
    )


# =============================================================================
# Model Tests
# =============================================================================


@pytest.mark.django_db
class TestWaitingQueueTriageRoom:
    """Tests for triage_room FK on WaitingQueue."""

    def test_triage_room_is_nullable(self, waiting_entry):
        """triage_room should default to None."""
        assert waiting_entry.triage_room is None

    def test_assign_triage_room(self, waiting_entry, triage_room_a):
        """Should accept a PLACE resource as triage room."""
        waiting_entry.triage_room = triage_room_a
        waiting_entry.save()
        waiting_entry.refresh_from_db()
        assert waiting_entry.triage_room == triage_room_a

    def test_triage_room_set_null_on_delete(self, waiting_entry, triage_room_a, sample_facility):
        """Deleting the room should set FK to null, not cascade."""
        waiting_entry.triage_room = triage_room_a
        waiting_entry.save()
        triage_room_a.delete()
        waiting_entry.refresh_from_db()
        assert waiting_entry.triage_room is None


@pytest.mark.django_db
class TestTriageSettingsModel:
    """Tests for TriageSettings model."""

    def test_create_settings(self, sample_facility, triage_department):
        settings = TriageSettings.objects.create(
            facility=sample_facility,
            auto_route_to_room=False,
            triage_department=triage_department,
        )
        assert settings.auto_route_to_room is False
        assert settings.triage_department == triage_department

    def test_one_per_facility(self, triage_settings, sample_facility, triage_department):
        """Only one TriageSettings per facility."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            TriageSettings.objects.create(
                facility=sample_facility,
                triage_department=triage_department,
            )

    def test_str(self, triage_settings):
        assert "Triage Settings" in str(triage_settings)


# =============================================================================
# Service Tests: find_best_triage_room
# =============================================================================


@pytest.mark.django_db
class TestFindBestTriageRoom:
    """Tests for the auto-routing service function."""

    def test_returns_none_when_no_settings(self, sample_facility):
        """No TriageSettings → None."""
        assert find_best_triage_room(sample_facility) is None

    def test_returns_none_when_auto_route_disabled(
        self, sample_facility, triage_department
    ):
        """auto_route_to_room=False → None."""
        TriageSettings.objects.create(
            facility=sample_facility,
            auto_route_to_room=False,
            triage_department=triage_department,
        )
        assert find_best_triage_room(sample_facility) is None

    def test_returns_none_when_no_department(self, sample_facility):
        """auto_route=True but no triage_department → None."""
        TriageSettings.objects.create(
            facility=sample_facility,
            auto_route_to_room=True,
            triage_department=None,
        )
        assert find_best_triage_room(sample_facility) is None

    def test_returns_none_when_no_active_staff(
        self, triage_settings, triage_room_a
    ):
        """Room exists but no active shift → None."""
        assert find_best_triage_room(triage_settings.facility) is None

    def test_routes_to_room_with_active_staff(
        self, triage_settings, triage_room_a, active_shift_in_room_a
    ):
        """Room with active shift and available capacity → selected."""
        room = find_best_triage_room(triage_settings.facility)
        assert room is not None
        assert room.pk == triage_room_a.pk

    def test_skips_full_room(
        self, triage_settings, triage_room_b, staff_resource, sample_patient, sample_encounter
    ):
        """Room at capacity → skipped."""
        # triage_room_b has capacity=1, put one patient in it
        WaitingQueue.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status="IN_TRIAGE",
            triage_room=triage_room_b,
        )
        # Create an active shift in room B
        Shift.objects.create(
            facility=triage_settings.facility,
            staff_resource=staff_resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="ACTIVE",
            room=triage_room_b,
            started_at=timezone.now(),
        )
        assert find_best_triage_room(triage_settings.facility) is None

    def test_prefers_least_loaded_room(
        self,
        triage_settings,
        triage_room_a,
        triage_room_b,
        staff_resource,
        sample_patient,
        sample_encounter,
        sample_facility,
    ):
        """Among eligible rooms, picks the one with lowest load."""
        # Create a second staff resource for room B
        staff2 = Resource.objects.create(
            facility=sample_facility,
            name="Nurse Brock",
            code="NURSE-002",
            resource_type="PERSON",
            is_active=True,
        )

        # Active shifts in both rooms
        Shift.objects.create(
            facility=sample_facility,
            staff_resource=staff_resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="ACTIVE",
            room=triage_room_a,
            started_at=timezone.now(),
        )
        Shift.objects.create(
            facility=sample_facility,
            staff_resource=staff2,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="ACTIVE",
            room=triage_room_b,
            started_at=timezone.now(),
        )

        # Put 1 patient in room A (cap 2 → load 1), room B empty (cap 1 → load 0)
        WaitingQueue.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status="WAITING_TRIAGE",
            triage_room=triage_room_a,
        )

        room = find_best_triage_room(sample_facility)
        assert room is not None
        # Room B has load 0 < Room A load 1, so B is preferred
        assert room.pk == triage_room_b.pk

    def test_skips_inactive_room(
        self, triage_settings, triage_room_a, active_shift_in_room_a
    ):
        """Inactive rooms are not considered."""
        triage_room_a.is_active = False
        triage_room_a.save()
        assert find_best_triage_room(triage_settings.facility) is None

    def test_on_break_counts_as_active_staff(
        self, triage_settings, triage_room_a, staff_resource, sample_facility
    ):
        """ON_BREAK shift should still count as having active staff."""
        Shift.objects.create(
            facility=sample_facility,
            staff_resource=staff_resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="ON_BREAK",
            room=triage_room_a,
            started_at=timezone.now(),
        )
        room = find_best_triage_room(sample_facility)
        assert room is not None
        assert room.pk == triage_room_a.pk


# =============================================================================
# API Tests: WaitingQueue endpoints
# =============================================================================


@pytest.mark.django_db
class TestWaitingQueueAutoRouting:
    """Tests for auto-routing on check-in."""

    def test_create_auto_routes_when_enabled(
        self,
        authenticated_client,
        sample_patient,
        sample_facility,
        triage_settings,
        triage_room_a,
        active_shift_in_room_a,
    ):
        """Check-in should auto-assign triage_room when auto-route is on."""
        response = authenticated_client.post(
            "/api/triage/waiting/",
            {"patient_id": sample_patient.id},
            format="json",
            HTTP_X_FACILITY_ID=str(sample_facility.pk),
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["triage_room"] == triage_room_a.pk
        assert response.data["triage_room_name"] == "Triage Room A"

    def test_create_no_route_when_disabled(
        self,
        authenticated_client,
        sample_patient,
        sample_facility,
        triage_department,
        triage_room_a,
        active_shift_in_room_a,
    ):
        """Check-in should NOT auto-assign when auto-route is off."""
        TriageSettings.objects.create(
            facility=sample_facility,
            auto_route_to_room=False,
            triage_department=triage_department,
        )
        response = authenticated_client.post(
            "/api/triage/waiting/",
            {"patient_id": sample_patient.id},
            format="json",
            HTTP_X_FACILITY_ID=str(sample_facility.pk),
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["triage_room"] is None

    def test_create_with_explicit_room(
        self,
        authenticated_client,
        sample_patient,
        triage_room_a,
    ):
        """Explicit triage_room_id overrides auto-routing."""
        response = authenticated_client.post(
            "/api/triage/waiting/",
            {"patient_id": sample_patient.id, "triage_room_id": triage_room_a.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["triage_room"] == triage_room_a.pk

    def test_response_includes_triage_room_fields(
        self,
        authenticated_client,
        sample_patient,
    ):
        """Read serializer should include triage_room and triage_room_name."""
        response = authenticated_client.post(
            "/api/triage/waiting/",
            {"patient_id": sample_patient.id},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "triage_room" in response.data
        assert "triage_room_name" in response.data


@pytest.mark.django_db
class TestAssignRoomAction:
    """Tests for POST /api/triage/waiting/{id}/assign-room/."""

    def test_assign_room(self, authenticated_client, waiting_entry, triage_room_a):
        response = authenticated_client.post(
            f"/api/triage/waiting/{waiting_entry.pk}/assign-room/",
            {"triage_room_id": triage_room_a.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_room"] == triage_room_a.pk

    def test_clear_room(self, authenticated_client, waiting_entry, triage_room_a):
        waiting_entry.triage_room = triage_room_a
        waiting_entry.save()
        response = authenticated_client.post(
            f"/api/triage/waiting/{waiting_entry.pk}/assign-room/",
            {"triage_room_id": None},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_room"] is None

    def test_invalid_room(self, authenticated_client, waiting_entry):
        response = authenticated_client.post(
            f"/api/triage/waiting/{waiting_entry.pk}/assign-room/",
            {"triage_room_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestAvailableTriageRooms:
    """Tests for GET /api/triage/waiting/available-triage-rooms/."""

    def test_returns_rooms_with_occupancy(
        self,
        authenticated_client,
        sample_facility,
        triage_settings,
        triage_room_a,
        triage_room_b,
        active_shift_in_room_a,
    ):
        response = authenticated_client.get(
            "/api/triage/waiting/available-triage-rooms/",
            HTTP_X_FACILITY_ID=str(sample_facility.pk),
        )
        assert response.status_code == status.HTTP_200_OK
        rooms = response.data
        assert len(rooms) == 2

        room_a = next(r for r in rooms if r["id"] == triage_room_a.pk)
        assert room_a["capacity"] == 2
        assert room_a["current_load"] == 0
        assert room_a["has_active_staff"] is True
        assert room_a["is_available"] is True

        room_b = next(r for r in rooms if r["id"] == triage_room_b.pk)
        assert room_b["has_active_staff"] is False
        assert room_b["is_available"] is False

    def test_empty_when_no_settings(self, authenticated_client, sample_facility):
        response = authenticated_client.get("/api/triage/waiting/available-triage-rooms/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []


# =============================================================================
# API Tests: TriageSettings endpoints
# =============================================================================


@pytest.mark.django_db
class TestTriageSettingsAPI:
    """Tests for /api/triage/settings/ endpoints."""

    def test_get_current_creates_if_missing(self, authenticated_client, sample_facility):
        """GET current/ should auto-create default settings."""
        response = authenticated_client.get(
            "/api/triage/settings/current/",
            HTTP_X_FACILITY_ID=str(sample_facility.pk),
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["auto_route_to_room"] is False

    def test_get_current_returns_existing(self, authenticated_client, sample_facility, triage_settings):
        response = authenticated_client.get(
            "/api/triage/settings/current/",
            HTTP_X_FACILITY_ID=str(sample_facility.pk),
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["auto_route_to_room"] is True

    def test_patch_toggle(self, authenticated_client, triage_settings):
        response = authenticated_client.patch(
            f"/api/triage/settings/{triage_settings.pk}/",
            {"auto_route_to_room": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        triage_settings.refresh_from_db()
        assert triage_settings.auto_route_to_room is False

    def test_patch_department(self, authenticated_client, triage_settings):
        new_dept = Department.objects.create(name="ER Triage", code="ER-TR", is_active=True)
        response = authenticated_client.patch(
            f"/api/triage/settings/{triage_settings.pk}/",
            {"triage_department": new_dept.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["triage_department"] == new_dept.pk
        assert response.data["triage_department_name"] == "ER Triage"
