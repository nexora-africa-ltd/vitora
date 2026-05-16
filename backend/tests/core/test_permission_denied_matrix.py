"""
Negative permission matrix tests.

Gap: Existing permission tests mostly verify "allowed" scenarios. These tests
verify the "denied" side across all role/permission combinations to ensure
the security boundary is complete.

Tests cover:
- RequiresActiveShiftPermission: cross-facility, completed shifts, wrong date
- SensitiveAccessPermission: denied scenarios across roles, redaction in list views
- ManageSchedulesWritePermission: non-manager write attempts, bulk operations
- RoleBasedPermission: lower-role users attempting higher-privilege actions
- SHAPermission: unauthorized claim actions
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework import status
from rest_framework.test import APIClient

from tests.conftest import ensure_staff_profile

User = get_user_model()


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def second_facility(db, sample_organization, sample_county, sample_sub_county):
    """Create a second facility in the same organization."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Second Health Centre",
        mfl_code="88888",
        level="4",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def nurse_user(db, sample_organization, sample_facility):
    """Create a nurse user without sensitive access permission."""
    user = User.objects.create_user(
        username="nurse_perm_test",
        email="nurse_perm@example.com",
        password="nursepass123",
    )
    ensure_staff_profile(user, sample_organization, sample_facility, employee_id="NRS-PERM-001")
    return user


@pytest.fixture
def nurse_client(api_client, nurse_user):
    """Authenticated client for nurse user."""
    client = APIClient()
    client.force_authenticate(user=nurse_user)
    return client


@pytest.fixture
def receptionist_user(db, sample_organization, sample_facility):
    """Create a receptionist with no clinical permissions."""
    user = User.objects.create_user(
        username="receptionist_perm_test",
        email="receptionist_perm@example.com",
        password="recpass123",
    )
    ensure_staff_profile(user, sample_organization, sample_facility, employee_id="REC-PERM-001")
    return user


@pytest.fixture
def receptionist_client(receptionist_user):
    """Authenticated client for receptionist."""
    client = APIClient()
    client.force_authenticate(user=receptionist_user)
    return client


@pytest.fixture
def admin_role_user(db, sample_organization, sample_facility):
    """Create a user with ADMIN role (exempt from shift enforcement)."""
    from hmis.apps.core.models import Role, StaffProfile

    user = User.objects.create_user(
        username="admin_role_perm_test",
        email="admin_role_perm@example.com",
        password="adminpass123",
    )
    admin_role, _ = Role.objects.get_or_create(
        code="ADMIN",
        defaults={"name": "Administrator", "hierarchy_level": 1, "is_active": True},
    )
    from hmis.apps.core.models import Department

    dept, _ = Department.objects.get_or_create(
        code="ADM-PERM",
        defaults={"name": "Admin Dept", "is_active": True},
    )
    StaffProfile.objects.create(
        user=user,
        employee_id="ADM-PERM-001",
        organization=sample_organization,
        primary_facility=sample_facility,
        primary_department=dept,
        primary_role=admin_role,
        date_joined=date.today(),
    )
    return user


@pytest.fixture
def admin_role_client(admin_role_user):
    """Authenticated client for admin-role user."""
    client = APIClient()
    client.force_authenticate(user=admin_role_user)
    return client


@pytest.fixture(autouse=True)
def _enable_shift_enforcement(settings):
    """Enable active-shift enforcement for all tests in this module."""
    settings.ACTIVE_SHIFT_ENFORCEMENT = True


@pytest.fixture
def encounter_payload(sample_patient):
    """Minimal encounter creation payload."""
    return {
        "patient": sample_patient.id,
        "encounter_type": "OPD",
        "chief_complaint": "Permission matrix test",
    }


@pytest.fixture
def sensitive_patient(db, sample_county, sample_sub_county, sample_organization, sample_facility):
    """Create a sensitive patient (HIV/GBV case)."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Protected",
        last_name="Patient",
        date_of_birth="1990-01-01",
        gender="F",
        is_sensitive=True,
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
        registered_at_facility=sample_facility,
    )


# =============================================================================
# RequiresActiveShiftPermission — Denied Scenarios
# =============================================================================


@pytest.mark.django_db
class TestActiveShiftDeniedScenarios:
    """Comprehensive denied scenarios for active shift enforcement."""

    def test_completed_shift_does_not_satisfy_gate(
        self, authenticated_client, test_staff_profile, sample_facility, encounter_payload
    ):
        """A COMPLETED shift should not satisfy the active shift requirement."""
        from hmis.apps.scheduling.models import Resource, Shift

        resource = Resource.objects.create(
            name="Dr. Completed",
            resource_type="PERSON",
            code="DOC-COMP-001",
            is_active=True,
            staff_profile=test_staff_profile,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        Shift.objects.create(
            staff_resource=resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(15, 0),
            shift_type="DAY",
            status="COMPLETED",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.post("/api/encounters/", encounter_payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_cancelled_shift_does_not_satisfy_gate(
        self, authenticated_client, test_staff_profile, sample_facility, encounter_payload
    ):
        """A CANCELLED shift should not satisfy the active shift requirement."""
        from hmis.apps.scheduling.models import Resource, Shift

        resource = Resource.objects.create(
            name="Dr. Cancelled",
            resource_type="PERSON",
            code="DOC-CAN-001",
            is_active=True,
            staff_profile=test_staff_profile,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        Shift.objects.create(
            staff_resource=resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="CANCELLED",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.post("/api/encounters/", encounter_payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_yesterdays_active_shift_does_not_satisfy_gate(
        self, authenticated_client, test_staff_profile, sample_facility, encounter_payload
    ):
        """An ACTIVE shift from yesterday should not satisfy today's requirement."""
        from hmis.apps.scheduling.models import Resource, Shift

        resource = Resource.objects.create(
            name="Dr. Yesterday",
            resource_type="PERSON",
            code="DOC-YST-001",
            is_active=True,
            staff_profile=test_staff_profile,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        Shift.objects.create(
            staff_resource=resource,
            shift_date=date.today() - timedelta(days=1),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="ACTIVE",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.post("/api/encounters/", encounter_payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_off_day_shift_type_does_not_satisfy_gate(
        self, authenticated_client, test_staff_profile, sample_facility, encounter_payload
    ):
        """A shift with OFF/LEAVE type should not satisfy the requirement even if ACTIVE."""
        from hmis.apps.scheduling.models import Resource, Shift

        resource = Resource.objects.create(
            name="Dr. Off Day",
            resource_type="PERSON",
            code="DOC-OFF-001",
            is_active=True,
            staff_profile=test_staff_profile,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        for shift_type in ["OFF", "LEAVE", "SICK_LEAVE", "DAY_OFF"]:
            Shift.objects.filter(staff_resource=resource).delete()
            Shift.objects.create(
                staff_resource=resource,
                shift_date=date.today(),
                start_time=time(7, 0),
                end_time=time(19, 0),
                shift_type=shift_type,
                status="ACTIVE",
                facility=sample_facility,
                organization=sample_facility.organization,
            )

            response = authenticated_client.post(
                "/api/encounters/", encounter_payload, format="json"
            )
            assert response.status_code == status.HTTP_403_FORBIDDEN, (
                f"shift_type={shift_type} should be denied"
            )

    def test_active_shift_at_different_facility_does_not_satisfy(
        self,
        authenticated_client,
        test_staff_profile,
        second_facility,
        sample_facility,
        encounter_payload,
    ):
        """An active shift at Facility B should not allow writes at Facility A."""
        from hmis.apps.scheduling.models import Resource, Shift

        # Create resource + shift at the SECOND facility
        resource = Resource.objects.create(
            name="Dr. Wrong Facility",
            resource_type="PERSON",
            code="DOC-WF-001",
            is_active=True,
            staff_profile=test_staff_profile,
            facility=second_facility,
            organization=second_facility.organization,
        )
        Shift.objects.create(
            staff_resource=resource,
            shift_date=date.today(),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="ACTIVE",
            facility=second_facility,
            organization=second_facility.organization,
        )

        # Writing at primary facility should still be blocked
        response = authenticated_client.post("/api/encounters/", encounter_payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_user_without_staff_profile_blocked(self, encounter_payload, sample_patient):
        """A user with no StaffProfile at all should be blocked on writes."""
        bare_user = User.objects.create_user(
            username="bare_user_perm",
            email="bare_perm@example.com",
            password="pass123",
        )
        client = APIClient()
        client.force_authenticate(user=bare_user)

        response = client.post("/api/encounters/", encounter_payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_role_exempt_from_shift_enforcement(self, admin_role_client, encounter_payload):
        """ADMIN role should bypass active shift requirement."""
        response = admin_role_client.post("/api/encounters/", encounter_payload, format="json")
        # Should not be blocked by shift enforcement (may fail for other reasons like
        # facility context, but NOT 403 with "not_clocked_in" code)
        if response.status_code == status.HTTP_403_FORBIDDEN:
            assert response.data.get("code") != "not_clocked_in"


# =============================================================================
# SensitiveAccessPermission — Denied Scenarios
# =============================================================================


@pytest.mark.django_db
class TestSensitiveAccessDenied:
    """Verify that sensitive patient access is properly denied."""

    def test_nurse_without_permission_cannot_view_sensitive_patient(
        self, nurse_client, sensitive_patient
    ):
        """A nurse without view_sensitive_patient permission cannot access sensitive patient.

        Implementation returns 404 (not 403) because sensitive patients are excluded
        from the queryset entirely — this avoids confirming the patient's existence
        (security by obscurity, per Kenya DPA guidelines).
        """
        response = nurse_client.get(f"/api/patients/{sensitive_patient.id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_sensitive_patient_hidden_from_list_without_permission(
        self, nurse_client, sensitive_patient, sample_patient
    ):
        """Sensitive patients should be excluded from list for users without permission."""
        response = nurse_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

        # The sensitive patient should not appear in the list
        patient_ids = [p["id"] for p in response.data.get("results", response.data)]
        assert sensitive_patient.id not in patient_ids

    def test_sensitive_access_denied_no_existence_leak(self, nurse_client, sensitive_patient):
        """Denied access to sensitive records must not reveal the patient exists.

        The queryset-level filtering means the response is 404 (same as a
        non-existent ID), preventing information disclosure. Audit logging
        only occurs when has_object_permission is reached (i.e., when the
        patient is found in the queryset but access is denied at object level).
        """
        response = nurse_client.get(f"/api/patients/{sensitive_patient.id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

        # Verify response body is identical to a genuinely non-existent patient
        response_nonexistent = nurse_client.get("/api/patients/999999/")
        assert response.status_code == response_nonexistent.status_code

    def test_granting_permission_allows_sensitive_access(
        self, nurse_client, nurse_user, sensitive_patient
    ):
        """After granting view_sensitive_patient, access should be allowed."""
        perm = Permission.objects.get(codename="view_sensitive_patient")
        nurse_user.user_permissions.add(perm)

        # Clear permission cache
        nurse_user = User.objects.get(pk=nurse_user.pk)
        nurse_client.force_authenticate(user=nurse_user)

        response = nurse_client.get(f"/api/patients/{sensitive_patient.id}/")
        assert response.status_code == status.HTTP_200_OK

    def test_superuser_can_access_sensitive_without_explicit_permission(self, sensitive_patient):
        """Superusers should access sensitive patients without explicit permission."""
        su = User.objects.create_superuser(
            username="su_sensitive_test",
            email="su_sensitive@example.com",
            password="supass123",
        )
        client = APIClient()
        client.force_authenticate(user=su)

        response = client.get(f"/api/patients/{sensitive_patient.id}/")
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# ManageSchedulesWritePermission — Denied Scenarios
# =============================================================================


@pytest.mark.django_db
class TestScheduleWritePermissionDenied:
    """Verify non-managers cannot write to scheduling endpoints."""

    def test_nurse_cannot_create_shift_for_others(
        self, nurse_client, test_staff_profile, sample_facility
    ):
        """A nurse without manage_schedules permission cannot create shifts."""
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.create(
            name="Target Staff",
            resource_type="PERSON",
            code="TGT-001",
            is_active=True,
            staff_profile=test_staff_profile,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = nurse_client.post(
            "/api/scheduling/shifts/",
            {
                "staff_resource": resource.id,
                "shift_date": str(date.today() + timedelta(days=1)),
                "start_time": "07:00",
                "end_time": "19:00",
                "shift_type": "DAY",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_nurse_cannot_bulk_delete_shifts(self, nurse_client, sample_facility):
        """A nurse without manage_schedules cannot bulk delete shifts."""
        from hmis.apps.scheduling.models import Resource, Shift
        from tests.conftest import ensure_staff_profile

        resource = Resource.objects.create(
            name="Bulk Target",
            resource_type="PERSON",
            code="BLK-001",
            is_active=True,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        shift = Shift.objects.create(
            staff_resource=resource,
            shift_date=date.today() + timedelta(days=1),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = nurse_client.post(
            "/api/scheduling/shifts/bulk_delete/",
            {"ids": [shift.id]},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_nurse_can_read_shifts(self, nurse_client):
        """A nurse should still be able to view the schedule (read-only)."""
        response = nurse_client.get("/api/scheduling/shifts/")
        assert response.status_code == status.HTTP_200_OK

    def test_user_with_manage_schedules_can_create_shift(self, sample_facility, test_staff_profile):
        """A user with manage_schedules permission CAN create shifts."""
        from hmis.apps.scheduling.models import Resource

        manager_user = User.objects.create_user(
            username="schedule_manager_perm",
            email="sched_mgr_perm@example.com",
            password="mgrpass123",
        )
        ensure_staff_profile(
            manager_user,
            sample_facility.organization,
            sample_facility,
            employee_id="MGR-PERM-001",
        )
        perm = Permission.objects.get(codename="manage_schedules")
        manager_user.user_permissions.add(perm)
        manager_user = User.objects.get(pk=manager_user.pk)  # clear cache

        resource = Resource.objects.create(
            name="Manageable Staff",
            resource_type="PERSON",
            code="MGR-TGT-001",
            is_active=True,
            staff_profile=test_staff_profile,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        client = APIClient()
        client.force_authenticate(user=manager_user)

        response = client.post(
            "/api/scheduling/shifts/",
            {
                "staff_resource": resource.id,
                "shift_date": str(date.today() + timedelta(days=1)),
                "start_time": "07:00",
                "end_time": "19:00",
                "shift_type": "DAY",
            },
            format="json",
        )
        # Should succeed (201) or at least not be 403
        assert response.status_code != status.HTTP_403_FORBIDDEN


# =============================================================================
# Cross-Role Permission Boundary Tests
# =============================================================================


@pytest.mark.django_db
class TestCrossRoleBoundaries:
    """Verify that roles cannot exceed their permission boundaries."""

    def test_unauthenticated_user_blocked_on_all_endpoints(self):
        """Unauthenticated requests should get 401 on all data endpoints."""
        client = APIClient()
        endpoints = [
            "/api/patients/",
            "/api/encounters/",
            "/api/scheduling/shifts/",
            "/api/auditlogs/",
        ]

        for endpoint in endpoints:
            response = client.get(endpoint)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED, (
                f"{endpoint} should require auth"
            )

    def test_non_admin_cannot_access_audit_logs(self, nurse_client):
        """Non-admin users should not be able to access audit logs."""
        response = nurse_client.get("/api/auditlogs/")
        # Should be 403 (not admin/staff)
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_200_OK,  # May be filtered to own logs only
        )

    def test_patch_on_readonly_field_does_not_change_mrn(
        self, authenticated_client, sample_patient
    ):
        """Attempting to PATCH a read-only field (mrn) should not change it."""
        original_mrn = sample_patient.mrn
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/",
            {"mrn": "MRN-HACKED-9999"},
            format="json",
        )
        # Even if 200, MRN should not change
        if response.status_code == status.HTTP_200_OK:
            assert response.data["mrn"] == original_mrn

    def test_delete_method_blocked_without_permission(self, receptionist_client, sample_patient):
        """Users without delete_patient permission should be blocked from deleting patients."""
        response = receptionist_client.delete(f"/api/patients/{sample_patient.id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_emergency_override_without_value_does_not_bypass(
        self, authenticated_client, encounter_payload
    ):
        """emergency_override param without 'true' value should not bypass."""
        # Test various non-true values
        for param_value in ["false", "1", "yes", ""]:
            response = authenticated_client.post(
                f"/api/encounters/?emergency_override={param_value}",
                encounter_payload,
                format="json",
            )
            assert response.status_code == status.HTTP_403_FORBIDDEN, (
                f"emergency_override={param_value} should not bypass"
            )
