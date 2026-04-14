"""
Tests for analytics permissions (CanViewAnalytics, IsSuperUser)
and org-level / platform-wide aggregation endpoints.
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.analytics.models import DepartmentMonthlySummary, FacilityDailySummary

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_user(db, username, is_superuser=False, is_staff=False):
    """Create a plain user without a staff profile."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username=username,
        password="testpass123!",
        is_superuser=is_superuser,
        is_staff=is_staff,
    )


def _attach_profile(user, organization, facility, role_code="DOC"):
    """Attach a StaffProfile with the given role to *user*."""
    from datetime import date as d

    from hmis.apps.core.models import Department, Role, StaffProfile

    dept, _ = Department.objects.get_or_create(
        code="TST", defaults={"name": "Test Dept", "is_active": True}
    )
    role, _ = Role.objects.get_or_create(
        code=role_code,
        defaults={"name": role_code.title(), "hierarchy_level": 5, "is_active": True},
    )
    return StaffProfile.objects.create(
        user=user,
        employee_id=f"EMP-{user.pk}",
        organization=organization,
        primary_facility=facility,
        primary_department=dept,
        primary_role=role,
        date_joined=d.today(),
    )


def _make_client(user):
    """Return an APIClient authenticated as *user*."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _seed_summary(facility, dt=None):
    """Create a FacilityDailySummary row for the given facility."""
    dt = dt or date(2026, 4, 1)
    return FacilityDailySummary.objects.create(
        facility=facility,
        organization=facility.organization,
        date=dt,
        encounters_total=10,
        revenue_total=Decimal("5000.00"),
    )


def _seed_department(facility, department="OPD", year=2026, month=4):
    return DepartmentMonthlySummary.objects.create(
        facility=facility,
        organization=facility.organization,
        year=year,
        month=month,
        department=department,
        visit_count=50,
        revenue=Decimal("10000.00"),
    )


# ---------------------------------------------------------------------------
# Permission tests: CanViewAnalytics
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCanViewAnalyticsPermission:
    """Tests for the CanViewAnalytics permission class."""

    FACILITY_SUMMARY_URL = "/api/analytics/facility-summary/"

    def test_unauthenticated_returns_401(self, api_client):
        """Unauthenticated request is rejected."""
        response = api_client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_doctor_role_allowed(self, authenticated_client):
        """User with DOC role (from test fixtures) can access analytics."""
        response = authenticated_client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_superuser_allowed(self, db, sample_organization, sample_facility):
        """Superuser can always access analytics."""
        user = _create_user(db, "superanalytics", is_superuser=True, is_staff=True)
        _attach_profile(user, sample_organization, sample_facility)
        client = _make_client(user)
        response = client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_management_role_allowed(self, db, sample_organization, sample_facility):
        """User with MANAGEMENT role can access analytics."""
        user = _create_user(db, "manager1")
        _attach_profile(user, sample_organization, sample_facility, role_code="MANAGEMENT")
        client = _make_client(user)
        response = client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_admin_role_allowed(self, db, sample_organization, sample_facility):
        """User with ADMIN role can access analytics."""
        user = _create_user(db, "admin1")
        _attach_profile(user, sample_organization, sample_facility, role_code="ADMIN")
        client = _make_client(user)
        response = client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_receptionist_denied(self, db, sample_organization, sample_facility):
        """User with non-privileged role is denied."""
        user = _create_user(db, "receptionist1")
        _attach_profile(user, sample_organization, sample_facility, role_code="RECEPTIONIST")
        client = _make_client(user)
        response = client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_user_without_profile_denied(self, db):
        """Authenticated user without StaffProfile is denied."""
        user = _create_user(db, "noprofile1")
        client = _make_client(user)
        response = client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_management_category_allowed(self, db, sample_organization, sample_facility):
        """User whose role has MANAGEMENT category can access analytics."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role, _ = Role.objects.get_or_create(
            code="COO",
            defaults={
                "name": "Chief Operating Officer",
                "category": "MANAGEMENT",
                "hierarchy_level": 2,
                "is_active": True,
            },
        )
        user = _create_user(db, "coo1")
        dept, _ = Department.objects.get_or_create(
            code="EXC", defaults={"name": "Executive", "is_active": True}
        )
        StaffProfile.objects.create(
            user=user,
            employee_id=f"EMP-{user.pk}",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=dept,
            primary_role=role,
            date_joined=date.today(),
        )
        client = _make_client(user)
        response = client.get(self.FACILITY_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Org-level endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOrgLevelEndpoints:
    """Tests for /api/analytics/org/* cross-facility aggregation."""

    ORG_SUMMARY_URL = "/api/analytics/org/facility-summary/"
    ORG_DEPT_URL = "/api/analytics/org/department-performance/"
    ORG_DX_URL = "/api/analytics/org/diagnosis-trends/"
    ORG_DEMO_URL = "/api/analytics/org/demographics/"

    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.get(self.ORG_SUMMARY_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_receptionist_denied(self, db, sample_organization, sample_facility):
        """Non-privileged role is denied at org level."""
        user = _create_user(db, "org_receptionist")
        _attach_profile(user, sample_organization, sample_facility, role_code="RECEPTIONIST")
        client = _make_client(user)
        response = client.get(self.ORG_SUMMARY_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_data_from_multiple_facilities(
        self, db, sample_organization, sample_facility, sample_county, sample_sub_county
    ):
        """Org endpoint returns data from all facilities in the org."""
        from hmis.apps.core.models import Facility

        # Create a second facility in the same org
        facility_b = Facility.objects.create(
            organization=sample_organization,
            name="Branch B",
            mfl_code="77777",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )

        _seed_summary(sample_facility, date(2026, 4, 1))
        _seed_summary(facility_b, date(2026, 4, 1))

        user = _create_user(db, "org_admin")
        _attach_profile(user, sample_organization, sample_facility, role_code="ADMIN")
        client = _make_client(user)

        response = client.get(self.ORG_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        facility_ids = {r["facility"] for r in results}
        assert sample_facility.pk in facility_ids
        assert facility_b.pk in facility_ids

    def test_does_not_leak_other_org_data(
        self, db, sample_organization, sample_facility, sample_county, sample_sub_county
    ):
        """Org endpoint excludes data from other organizations."""
        from hmis.apps.core.models import Facility, Organization

        other_org = Organization.objects.create(
            name="Other Org",
            slug="other-org",
            contact_email="other@example.co.ke",
            is_active=True,
            is_verified=True,
        )
        other_facility = Facility.objects.create(
            organization=other_org,
            name="Other Facility",
            mfl_code="66666",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )

        _seed_summary(sample_facility, date(2026, 4, 1))
        _seed_summary(other_facility, date(2026, 4, 2))

        user = _create_user(db, "iso_admin")
        _attach_profile(user, sample_organization, sample_facility, role_code="ADMIN")
        client = _make_client(user)

        response = client.get(self.ORG_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for r in results:
            assert r["facility"] != other_facility.pk

    def test_org_department_performance_accessible(self, authenticated_client):
        response = authenticated_client.get(self.ORG_DEPT_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_org_diagnosis_trends_accessible(self, authenticated_client):
        response = authenticated_client.get(self.ORG_DX_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_org_demographics_accessible(self, authenticated_client):
        response = authenticated_client.get(self.ORG_DEMO_URL)
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Platform-wide endpoint tests (superuser only)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPlatformLevelEndpoints:
    """Tests for /api/analytics/platform/* (Nexora superusers only)."""

    PLATFORM_SUMMARY_URL = "/api/analytics/platform/facility-summary/"
    PLATFORM_DEPT_URL = "/api/analytics/platform/department-performance/"
    PLATFORM_DX_URL = "/api/analytics/platform/diagnosis-trends/"
    PLATFORM_DEMO_URL = "/api/analytics/platform/demographics/"

    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.get(self.PLATFORM_SUMMARY_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_regular_user_denied(self, authenticated_client):
        """Non-superuser is denied at platform level."""
        response = authenticated_client.get(self.PLATFORM_SUMMARY_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_role_denied(self, db, sample_organization, sample_facility):
        """Even ADMIN role without is_superuser is denied."""
        user = _create_user(db, "admin_nosuperuser")
        _attach_profile(user, sample_organization, sample_facility, role_code="ADMIN")
        client = _make_client(user)
        response = client.get(self.PLATFORM_SUMMARY_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_superuser_can_access_all_facilities(
        self, db, sample_organization, sample_facility, sample_county, sample_sub_county
    ):
        """Superuser gets data from ALL organizations/facilities."""
        from hmis.apps.core.models import Facility, Organization

        other_org = Organization.objects.create(
            name="Platform Org B",
            slug="platform-org-b",
            contact_email="b@example.co.ke",
            is_active=True,
            is_verified=True,
        )
        other_facility = Facility.objects.create(
            organization=other_org,
            name="Platform Facility B",
            mfl_code="55555",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )

        _seed_summary(sample_facility, date(2026, 4, 1))
        _seed_summary(other_facility, date(2026, 4, 2))

        user = _create_user(db, "nexora_superuser", is_superuser=True, is_staff=True)
        client = _make_client(user)
        response = client.get(self.PLATFORM_SUMMARY_URL)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        facility_ids = {r["facility"] for r in results}
        assert sample_facility.pk in facility_ids
        assert other_facility.pk in facility_ids

    def test_platform_department_performance(self, db):
        """Superuser can access platform department performance."""
        user = _create_user(db, "su_dept", is_superuser=True, is_staff=True)
        client = _make_client(user)
        response = client.get(self.PLATFORM_DEPT_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_platform_diagnosis_trends(self, db):
        """Superuser can access platform diagnosis trends."""
        user = _create_user(db, "su_dx", is_superuser=True, is_staff=True)
        client = _make_client(user)
        response = client.get(self.PLATFORM_DX_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_platform_demographics(self, db):
        """Superuser can access platform demographics."""
        user = _create_user(db, "su_demo", is_superuser=True, is_staff=True)
        client = _make_client(user)
        response = client.get(self.PLATFORM_DEMO_URL)
        assert response.status_code == status.HTTP_200_OK

    def test_platform_list_only_no_create(self, db):
        """Platform endpoints are read-only (list)."""
        user = _create_user(db, "su_readonly", is_superuser=True, is_staff=True)
        client = _make_client(user)
        response = client.post(self.PLATFORM_SUMMARY_URL, {})
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
