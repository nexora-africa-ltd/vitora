"""
Tests for Procedure ↔ Clinic integration.

Covers:
1. ProcedureCatalog.default_clinics M2M
2. ProcedureOrder.scheduled_clinic FK
3. schedule() with clinic & auto-staff-assignment
4. Check-in auto-transition of ProcedureOrders
5. Available-slots endpoint
6. CheckIn.procedure_order FK
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.checkin.services import process_checkin
from hmis.apps.clinics.models import Clinic, ClinicSchedule, ClinicStaff
from hmis.apps.procedures.models import ProcedureCatalog, ProcedureOrder


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def procedure_clinic(db, sample_facility, sample_organization):
    """Create a PROCEDURE-type clinic."""
    return Clinic.objects.create(
        name="Procedure Room 1",
        clinic_type="PROCEDURE",
        code="PROC-RM-001",
        status="ACTIVE",
        accepts_walk_ins=False,
        triage_required=False,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def procedure_clinic_2(db, sample_facility, sample_organization):
    """Create a second PROCEDURE-type clinic."""
    return Clinic.objects.create(
        name="Procedure Room 2",
        clinic_type="PROCEDURE",
        code="PROC-RM-002",
        status="ACTIVE",
        accepts_walk_ins=False,
        triage_required=False,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def procedure_clinic_schedule(db, procedure_clinic):
    """Create a schedule for the procedure clinic on every weekday."""
    schedules = []
    for day in range(5):  # Mon-Fri
        schedules.append(
            ClinicSchedule.objects.create(
                clinic=procedure_clinic,
                day_of_week=day,
                start_time=time(8, 0),
                end_time=time(17, 0),
                max_patients=20,
                is_active=True,
            )
        )
    return schedules


@pytest.fixture
def sample_catalog(db, sample_facility, sample_organization):
    """Create a sample procedure catalog entry."""
    return ProcedureCatalog.objects.create(
        code="PROC-TEST-001",
        name="Wound Suturing",
        category="WOUND_CARE",
        typical_duration_minutes=30,
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def catalog_with_clinics(db, sample_catalog, procedure_clinic, procedure_clinic_2):
    """Catalog entry with default clinics attached."""
    sample_catalog.default_clinics.add(procedure_clinic, procedure_clinic_2)
    return sample_catalog


@pytest.fixture
def sample_order(db, sample_catalog, sample_patient, test_user, sample_facility, sample_organization):
    """Create a sample ORDERED procedure order."""
    return ProcedureOrder.objects.create(
        procedure=sample_catalog,
        patient=sample_patient,
        indication="Laceration on left forearm",
        ordered_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def clinic_staff_member(db, procedure_clinic, test_user):
    """Assign test_user as a DOCTOR to the procedure clinic."""
    return ClinicStaff.objects.create(
        clinic=procedure_clinic,
        user=test_user,
        role="DOCTOR",
        is_primary=True,
        start_date=date.today() - timedelta(days=30),
        is_active=True,
    )


# =============================================================================
# Model Tests
# =============================================================================


class TestProcedureCatalogDefaultClinics:
    """Tests for ProcedureCatalog.default_clinics M2M."""

    def test_attach_clinics_to_catalog(self, sample_catalog, procedure_clinic, procedure_clinic_2):
        """Should allow attaching multiple clinics to a procedure."""
        sample_catalog.default_clinics.add(procedure_clinic, procedure_clinic_2)

        assert sample_catalog.default_clinics.count() == 2
        assert procedure_clinic in sample_catalog.default_clinics.all()
        assert procedure_clinic_2 in sample_catalog.default_clinics.all()

    def test_reverse_relation(self, catalog_with_clinics, procedure_clinic):
        """Clinic should see its linked catalog entries via reverse relation."""
        assert catalog_with_clinics in procedure_clinic.procedure_catalog_entries.all()

    def test_empty_by_default(self, sample_catalog):
        """New catalog entries should have no default clinics."""
        assert sample_catalog.default_clinics.count() == 0


class TestProcedureOrderScheduledClinic:
    """Tests for ProcedureOrder.scheduled_clinic FK."""

    def test_scheduled_clinic_nullable(self, sample_order):
        """scheduled_clinic should be null by default."""
        assert sample_order.scheduled_clinic is None

    def test_set_scheduled_clinic(self, sample_order, procedure_clinic):
        """Should be able to set scheduled_clinic on an order."""
        sample_order.scheduled_clinic = procedure_clinic
        sample_order.save(update_fields=["scheduled_clinic"])
        sample_order.refresh_from_db()

        assert sample_order.scheduled_clinic == procedure_clinic


# =============================================================================
# schedule() Method Tests
# =============================================================================


class TestScheduleWithClinic:
    """Tests for ProcedureOrder.schedule() with clinic integration."""

    def test_schedule_sets_clinic(self, sample_order, procedure_clinic):
        """schedule() should set scheduled_clinic when clinic is provided."""
        sample_order.schedule(
            date=date.today(),
            time=time(10, 0),
            clinic=procedure_clinic,
        )
        sample_order.refresh_from_db()

        assert sample_order.status == ProcedureOrder.Status.SCHEDULED
        assert sample_order.scheduled_clinic == procedure_clinic
        assert sample_order.scheduled_date == date.today()

    def test_schedule_without_clinic(self, sample_order):
        """schedule() without clinic should work as before (manual scheduling)."""
        sample_order.schedule(
            date=date.today(),
            location="Room 3",
        )
        sample_order.refresh_from_db()

        assert sample_order.status == ProcedureOrder.Status.SCHEDULED
        assert sample_order.scheduled_clinic is None
        assert sample_order.scheduled_location == "Room 3"

    def test_schedule_auto_assigns_performer(
        self, sample_order, procedure_clinic, clinic_staff_member
    ):
        """schedule() should auto-assign performer from ClinicStaff."""
        sample_order.schedule(
            date=date.today(),
            time=time(10, 0),
            clinic=procedure_clinic,
        )
        sample_order.refresh_from_db()

        assert sample_order.assigned_performer == clinic_staff_member.user

    def test_schedule_does_not_override_explicit_performer(
        self, sample_order, procedure_clinic, clinic_staff_member
    ):
        """schedule() should NOT override an explicitly set performer."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        other_user = User.objects.create_user(
            username="other_performer", password="test1234"
        )
        sample_order.assigned_performer = other_user
        sample_order.save(update_fields=["assigned_performer"])

        sample_order.schedule(
            date=date.today(),
            time=time(10, 0),
            clinic=procedure_clinic,
        )
        sample_order.refresh_from_db()

        assert sample_order.assigned_performer == other_user

    def test_schedule_no_staff_available(self, sample_order, procedure_clinic):
        """schedule() with clinic but no staff should leave performer null."""
        sample_order.schedule(
            date=date.today(),
            time=time(10, 0),
            clinic=procedure_clinic,
        )
        sample_order.refresh_from_db()

        assert sample_order.assigned_performer is None


# =============================================================================
# Check-in Auto-Transition Tests
# =============================================================================


class TestCheckinAutoTransition:
    """Tests for auto-transitioning ProcedureOrders on check-in."""

    def test_checkin_with_procedure_order_transitions_to_ready(
        self, sample_order, procedure_clinic, sample_patient, test_user
    ):
        """Checking in with a linked procedure order should transition it to READY."""
        # Schedule the order at this clinic today
        sample_order.schedule(
            date=date.today(),
            time=time(10, 0),
            clinic=procedure_clinic,
        )
        assert sample_order.status == ProcedureOrder.Status.SCHEDULED

        # Check in patient to procedure clinic with procedure_order linked
        checkin, warning = process_checkin(
            patient=sample_patient,
            destination=procedure_clinic.id,
            user=test_user,
            visit_reason="SCHEDULED_PROCEDURE",
            skip_triage=True,
            procedure_order_id=sample_order.id,
        )

        # Order should now be READY and linked to the clinic visit
        sample_order.refresh_from_db()
        assert sample_order.status == ProcedureOrder.Status.READY
        assert sample_order.clinic_visit is not None
        assert checkin.procedure_order == sample_order

    def test_checkin_auto_discovers_scheduled_orders(
        self, sample_order, procedure_clinic, sample_patient, test_user
    ):
        """Check-in without explicit procedure_order should auto-discover matching orders."""
        sample_order.schedule(
            date=date.today(),
            time=time(10, 0),
            clinic=procedure_clinic,
        )

        # Check in WITHOUT procedure_order_id
        checkin, warning = process_checkin(
            patient=sample_patient,
            destination=procedure_clinic.id,
            user=test_user,
            visit_reason="SCHEDULED_PROCEDURE",
            skip_triage=True,
        )

        sample_order.refresh_from_db()
        assert sample_order.status == ProcedureOrder.Status.READY
        assert sample_order.clinic_visit is not None

    def test_checkin_does_not_transition_completed_orders(
        self, sample_order, procedure_clinic, sample_patient, test_user
    ):
        """Completed orders should not be touched during check-in."""
        sample_order.scheduled_clinic = procedure_clinic
        sample_order.scheduled_date = date.today()
        sample_order.status = ProcedureOrder.Status.COMPLETED
        sample_order.save()

        process_checkin(
            patient=sample_patient,
            destination=procedure_clinic.id,
            user=test_user,
            visit_reason="SCHEDULED_PROCEDURE",
            skip_triage=True,
        )

        sample_order.refresh_from_db()
        assert sample_order.status == ProcedureOrder.Status.COMPLETED

    def test_checkin_to_non_matching_clinic_no_transition(
        self, sample_order, procedure_clinic, procedure_clinic_2, sample_patient, test_user
    ):
        """Order scheduled at clinic 1 should not transition when checked into clinic 2."""
        sample_order.schedule(
            date=date.today(),
            time=time(10, 0),
            clinic=procedure_clinic,
        )

        process_checkin(
            patient=sample_patient,
            destination=procedure_clinic_2.id,
            user=test_user,
            visit_reason="SCHEDULED_PROCEDURE",
            skip_triage=True,
        )

        sample_order.refresh_from_db()
        # Should still be SCHEDULED, not READY
        assert sample_order.status == ProcedureOrder.Status.SCHEDULED


# =============================================================================
# Available Slots Endpoint Tests
# =============================================================================


class TestAvailableSlotsEndpoint:
    """Tests for GET /api/procedures/catalog/{id}/available-slots/."""

    def test_returns_slots_for_configured_clinics(
        self, authenticated_client, catalog_with_clinics, procedure_clinic_schedule
    ):
        """Should return time slots derived from ClinicSchedule."""
        target_date = _next_weekday()
        response = authenticated_client.get(
            f"/api/procedures/catalog/{catalog_with_clinics.id}/available-slots/",
            {"date": target_date.isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "slots" in data
        assert len(data["slots"]) > 0

        # All slots should have the expected structure
        slot = data["slots"][0]
        assert "clinic_id" in slot
        assert "clinic_name" in slot
        assert "start_time" in slot
        assert "end_time" in slot
        assert "available" in slot
        assert "duration_minutes" in slot

    def test_no_clinics_returns_empty_with_message(
        self, authenticated_client, sample_catalog
    ):
        """Catalog without default_clinics should return empty slots with helpful message."""
        response = authenticated_client.get(
            f"/api/procedures/catalog/{sample_catalog.id}/available-slots/",
            {"date": date.today().isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["slots"] == []
        assert "manual scheduling" in response.data["message"].lower()

    def test_missing_date_returns_400(self, authenticated_client, sample_catalog):
        """Should return 400 if date param is missing."""
        response = authenticated_client.get(
            f"/api/procedures/catalog/{sample_catalog.id}/available-slots/",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_booked_slots_marked_unavailable(
        self,
        authenticated_client,
        catalog_with_clinics,
        procedure_clinic,
        procedure_clinic_schedule,
        sample_patient,
        test_user,
    ):
        """Already booked slot should be marked as available=False."""
        target_date = _next_weekday()
        # Book a procedure at 08:00
        ProcedureOrder.objects.create(
            procedure=catalog_with_clinics,
            patient=sample_patient,
            indication="Test booking",
            ordered_by=test_user,
            status=ProcedureOrder.Status.SCHEDULED,
            scheduled_date=target_date,
            scheduled_time=time(8, 0),
            scheduled_clinic=procedure_clinic,
        )

        response = authenticated_client.get(
            f"/api/procedures/catalog/{catalog_with_clinics.id}/available-slots/",
            {"date": target_date.isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        slots = response.data["slots"]

        # Find the 08:00 slot for procedure_clinic
        booked_slot = next(
            (s for s in slots if s["start_time"] == "08:00" and s["clinic_id"] == procedure_clinic.id),
            None,
        )
        assert booked_slot is not None
        assert booked_slot["available"] is False


# =============================================================================
# API Schedule Action Tests
# =============================================================================


class TestScheduleActionWithClinic:
    """Tests for POST /api/procedures/orders/{id}/schedule/ with scheduled_clinic."""

    def test_schedule_with_clinic_id(
        self, authenticated_client, sample_order, procedure_clinic
    ):
        """Should accept scheduled_clinic in the schedule action."""
        response = authenticated_client.post(
            f"/api/procedures/orders/{sample_order.id}/schedule/",
            {
                "scheduled_date": date.today().isoformat(),
                "scheduled_time": "10:00",
                "scheduled_clinic": procedure_clinic.id,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        sample_order.refresh_from_db()
        assert sample_order.scheduled_clinic == procedure_clinic
        assert sample_order.status == ProcedureOrder.Status.SCHEDULED

    def test_schedule_without_clinic_still_works(
        self, authenticated_client, sample_order
    ):
        """Should still work without scheduled_clinic (manual scheduling)."""
        response = authenticated_client.post(
            f"/api/procedures/orders/{sample_order.id}/schedule/",
            {
                "scheduled_date": date.today().isoformat(),
                "scheduled_location": "Procedure Room A",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        sample_order.refresh_from_db()
        assert sample_order.scheduled_clinic is None
        assert sample_order.scheduled_location == "Procedure Room A"


# =============================================================================
# Catalog Detail Serializer Tests
# =============================================================================


class TestCatalogDetailSerializer:
    """Tests for ProcedureCatalogDetailSerializer with default_clinics."""

    def test_includes_default_clinics_detail(
        self, authenticated_client, catalog_with_clinics, procedure_clinic
    ):
        """Should return default_clinics_detail in catalog detail response."""
        response = authenticated_client.get(
            f"/api/procedures/catalog/{catalog_with_clinics.id}/",
        )

        assert response.status_code == status.HTTP_200_OK
        clinics_detail = response.data["default_clinics_detail"]
        assert len(clinics_detail) == 2
        clinic_ids = [c["id"] for c in clinics_detail]
        assert procedure_clinic.id in clinic_ids


# =============================================================================
# Helpers
# =============================================================================


def _next_weekday() -> date:
    """Return the next weekday (Mon-Fri) from today, or today if it's a weekday."""
    d = date.today()
    while d.weekday() > 4:  # Saturday=5, Sunday=6
        d += timedelta(days=1)
    return d
