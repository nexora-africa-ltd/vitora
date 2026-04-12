"""
Tests for RequiresActiveShiftPermission.

Verifies that clinical write endpoints are gated behind an active shift,
while reads remain open.  Also tests emergency override and superuser bypass.
"""

from datetime import date, time

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


# All tests in this module run with enforcement enabled
pytestmark = pytest.mark.usefixtures()


@pytest.fixture(autouse=True)
def _enable_enforcement(settings):
    """Enable active-shift enforcement for these tests."""
    settings.ACTIVE_SHIFT_ENFORCEMENT = True


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def staff_resource(db, test_staff_profile, sample_facility):
    """Create a scheduling Resource linked to the test user."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Dr. Test",
        resource_type="PERSON",
        code="DOC-PERM-001",
        is_active=True,
        staff_profile=test_staff_profile,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def active_shift(db, staff_resource, sample_facility):
    """Create an ACTIVE shift for today for the test user."""
    from hmis.apps.scheduling.models import Shift

    return Shift.objects.create(
        staff_resource=staff_resource,
        shift_date=date.today(),
        start_time=time(7, 0),
        end_time=time(19, 0),
        shift_type="DAY",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def on_break_shift(db, staff_resource, sample_facility):
    """Create an ON_BREAK shift for today for the test user."""
    from hmis.apps.scheduling.models import Shift

    return Shift.objects.create(
        staff_resource=staff_resource,
        shift_date=date.today(),
        start_time=time(7, 0),
        end_time=time(19, 0),
        shift_type="DAY",
        status="ON_BREAK",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def encounter_payload(sample_patient):
    """Minimal encounter creation payload."""
    return {
        "patient": sample_patient.id,
        "encounter_type": "OPD",
        "chief_complaint": "Permission test complaint",
    }


# =============================================================================
# Tests
# =============================================================================


class TestActiveShiftGate:
    """Tests for RequiresActiveShiftPermission on clinical endpoints."""

    def test_read_allowed_without_active_shift(
        self, authenticated_client, sample_encounter
    ):
        """GET requests should work even without an active shift."""
        response = authenticated_client.get("/api/encounters/")
        assert response.status_code == status.HTTP_200_OK

    def test_write_blocked_without_active_shift(
        self, authenticated_client, encounter_payload
    ):
        """POST should be blocked if user has no active shift today."""
        response = authenticated_client.post(
            "/api/encounters/", encounter_payload, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get("detail") is not None

    def test_write_allowed_with_active_shift(
        self, authenticated_client, active_shift, encounter_payload
    ):
        """POST should succeed when user has an ACTIVE shift."""
        response = authenticated_client.post(
            "/api/encounters/", encounter_payload, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_write_allowed_on_break(
        self, authenticated_client, on_break_shift, encounter_payload
    ):
        """POST should succeed when user has an ON_BREAK shift."""
        response = authenticated_client.post(
            "/api/encounters/", encounter_payload, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_emergency_override_bypasses_gate(
        self, authenticated_client, encounter_payload
    ):
        """Emergency override query param should bypass the shift check."""
        response = authenticated_client.post(
            "/api/encounters/?emergency_override=true",
            encounter_payload,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_emergency_override_creates_audit_log(
        self, authenticated_client, encounter_payload
    ):
        """Emergency override should be logged in AuditLog."""
        from hmis.apps.core.models import AuditLog

        authenticated_client.post(
            "/api/encounters/?emergency_override=true",
            encounter_payload,
            format="json",
        )
        assert AuditLog.objects.filter(action="emergency_override").exists()

    def test_superuser_exempt(
        self, authenticated_client, test_user, encounter_payload
    ):
        """Superusers should bypass the active shift requirement."""
        test_user.is_superuser = True
        test_user.save()
        response = authenticated_client.post(
            "/api/encounters/", encounter_payload, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_scheduled_shift_not_sufficient(
        self, authenticated_client, staff_resource, sample_facility, encounter_payload
    ):
        """A SCHEDULED (not clocked-in) shift should NOT satisfy the gate."""
        from hmis.apps.scheduling.models import Shift

        Shift.objects.create(
            staff_resource=staff_resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.post(
            "/api/encounters/", encounter_payload, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
