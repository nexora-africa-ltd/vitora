"""
Tests for Phase 2: Tenant & Permission Resolution via OrgMembership.

Covers:
- TenantMiddleware facility access check via OrgMembership
- RoleBasedPermission org-scoped permission resolution
- Login response includes memberships array
- /api/staff/me/ includes memberships
- my-facilities derives from OrgMembership
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.middleware import TenantMiddleware
from hmis.apps.core.models import (
    County,
    Department,
    Facility,
    Organization,
    OrgMembership,
    Role,
    StaffProfile,
    SubCounty,
)

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def org_a(db):
    return Organization.objects.create(
        name="Alpha Hospital",
        slug="alpha-hospital",
        contact_email="admin@alpha.co.ke",
        is_active=True,
        is_verified=True,
    )


@pytest.fixture
def org_b(db):
    return Organization.objects.create(
        name="Beta Clinic",
        slug="beta-clinic",
        contact_email="admin@beta.co.ke",
        is_active=True,
        is_verified=True,
    )


@pytest.fixture
def county(db):
    return County.objects.create(code=48, name="Phase2County")


@pytest.fixture
def sub_county(db, county):
    return SubCounty.objects.create(county=county, name="Phase2SubCounty")


@pytest.fixture
def facility_a1(db, org_a, county, sub_county):
    return Facility.objects.create(
        organization=org_a,
        mfl_code="A0001",
        name="Alpha Main",
        level="3",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def facility_a2(db, org_a, county, sub_county):
    return Facility.objects.create(
        organization=org_a,
        mfl_code="A0002",
        name="Alpha Branch",
        level="2",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def facility_b1(db, org_b, county, sub_county):
    return Facility.objects.create(
        organization=org_b,
        mfl_code="B0001",
        name="Beta Central",
        level="4",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def role_doctor(db):
    return Role.objects.create(
        name="Doctor P2",
        code="DOCTOR_P2",
        hierarchy_level=5,
        is_active=True,
        permissions_matrix={
            "Patient": {"read": True, "create": True, "update": True, "delete": False},
            "Encounter": {"read": True, "create": True, "update": True, "delete": False},
        },
    )


@pytest.fixture
def role_receptionist(db):
    return Role.objects.create(
        name="Receptionist P2",
        code="RECEPTIONIST_P2",
        hierarchy_level=8,
        is_active=True,
        permissions_matrix={
            "Patient": {"read": True, "create": True, "update": False, "delete": False},
        },
    )


@pytest.fixture
def dept(db):
    return Department.objects.create(name="General P2", code="GEN_P2", is_active=True)


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="p2user",
        email="p2user@example.com",
        password="testpass123!",
        first_name="Phase",
        last_name="Two",
    )


@pytest.fixture
def staff_profile(db, staff_user, org_a, facility_a1, role_doctor, dept):
    return StaffProfile.objects.create(
        user=staff_user,
        employee_id="P2-001",
        organization=org_a,
        primary_facility=facility_a1,
        primary_role=role_doctor,
        primary_department=dept,
        date_joined=date.today(),
    )


@pytest.fixture
def membership_a(db, staff_profile, org_a, role_doctor, dept, facility_a1, facility_a2):
    """Primary membership in org_a with doctor role and both facilities."""
    m = OrgMembership.objects.create(
        staff_profile=staff_profile,
        organization=org_a,
        role=role_doctor,
        department=dept,
        is_primary=True,
    )
    m.facilities.add(facility_a1, facility_a2)
    return m


@pytest.fixture
def membership_b(db, staff_profile, org_b, role_receptionist, facility_b1):
    """Secondary membership in org_b with receptionist role."""
    m = OrgMembership.objects.create(
        staff_profile=staff_profile,
        organization=org_b,
        role=role_receptionist,
        is_primary=False,
    )
    m.facilities.add(facility_b1)
    return m


# ============================================================================
# TenantMiddleware facility access via OrgMembership
# ============================================================================


class TestTenantMiddlewareMembershipAccess:
    """TenantMiddleware._user_has_facility_access via OrgMembership."""

    def _get_middleware(self):
        return TenantMiddleware(lambda request: None)

    def test_access_granted_for_membership_facility(
        self, staff_user, staff_profile, membership_a, facility_a1
    ):
        """User can access a facility in their membership."""
        mw = self._get_middleware()
        assert mw._user_has_facility_access(staff_user, facility_a1) is True

    def test_access_granted_for_secondary_membership_facility(
        self, staff_user, staff_profile, membership_a, membership_b, facility_b1
    ):
        """User can access a facility from a secondary org membership."""
        mw = self._get_middleware()
        assert mw._user_has_facility_access(staff_user, facility_b1) is True

    def test_access_denied_for_non_membership_facility(
        self, staff_user, staff_profile, membership_a, facility_b1
    ):
        """User cannot access a facility they have no membership for."""
        mw = self._get_middleware()
        assert mw._user_has_facility_access(staff_user, facility_b1) is False

    def test_access_denied_for_revoked_membership(
        self, staff_user, staff_profile, membership_b, facility_b1
    ):
        """User cannot access facilities from a REVOKED membership."""
        membership_b.status = OrgMembership.MembershipStatus.REVOKED
        membership_b.save()
        mw = self._get_middleware()
        assert mw._user_has_facility_access(staff_user, facility_b1) is False

    def test_access_denied_for_suspended_membership(
        self, staff_user, staff_profile, membership_b, facility_b1
    ):
        """User cannot access facilities from a SUSPENDED membership."""
        membership_b.status = OrgMembership.MembershipStatus.SUSPENDED
        membership_b.save()
        mw = self._get_middleware()
        assert mw._user_has_facility_access(staff_user, facility_b1) is False

    def test_superuser_always_has_access(self, db, facility_b1):
        """Superuser bypasses membership check."""
        superuser = User.objects.create_superuser(
            username="su_p2", email="su@p2.co.ke", password="pass123!"
        )
        mw = self._get_middleware()
        assert mw._user_has_facility_access(superuser, facility_b1) is True

    def test_user_without_profile_denied(self, db, facility_a1):
        """User with no StaffProfile is denied."""
        user = User.objects.create_user(
            username="noprofile_p2", email="no@p2.co.ke", password="pass!"
        )
        mw = self._get_middleware()
        assert mw._user_has_facility_access(user, facility_a1) is False

    def test_primary_facility_access_via_membership(
        self, staff_user, staff_profile, membership_a, facility_a2
    ):
        """User can access secondary facility in their membership."""
        mw = self._get_middleware()
        assert mw._user_has_facility_access(staff_user, facility_a2) is True


# ============================================================================
# RoleBasedPermission org-scoped resolution
# ============================================================================


class TestOrgScopedPermissions:
    """RoleBasedPermission uses active org's membership role."""

    def test_doctor_permissions_in_org_a(self, staff_user, staff_profile, membership_a, org_a):
        """Doctor role in org_a should grant Patient.update."""
        assert staff_profile.has_permission_for_org("update", "Patient", org_a.pk) is True

    def test_receptionist_permissions_in_org_b(
        self, staff_user, staff_profile, membership_a, membership_b, org_b
    ):
        """Receptionist role in org_b should NOT grant Patient.update."""
        assert staff_profile.has_permission_for_org("update", "Patient", org_b.pk) is False

    def test_receptionist_can_read_in_org_b(
        self, staff_user, staff_profile, membership_a, membership_b, org_b
    ):
        """Receptionist role in org_b should grant Patient.read."""
        assert staff_profile.has_permission_for_org("read", "Patient", org_b.pk) is True

    def test_no_encounter_perms_in_org_b(
        self, staff_user, staff_profile, membership_a, membership_b, org_b
    ):
        """Receptionist role has no Encounter permissions."""
        assert staff_profile.has_permission_for_org("read", "Encounter", org_b.pk) is False

    def test_doctor_encounter_perms_in_org_a(self, staff_user, staff_profile, membership_a, org_a):
        """Doctor role in org_a should grant Encounter.create."""
        assert staff_profile.has_permission_for_org("create", "Encounter", org_a.pk) is True


# ============================================================================
# Login response includes memberships
# ============================================================================


class TestLoginResponseMemberships:
    """Login response should include memberships array."""

    def test_login_includes_memberships(
        self,
        staff_user,
        staff_profile,
        membership_a,
        membership_b,
        org_a,
        org_b,
        role_doctor,
        role_receptionist,
    ):
        """Token login should include memberships in response."""
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "p2user", "password": "testpass123!"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "memberships" in data, f"Keys: {list(data.keys())}"
        memberships = data["memberships"]
        assert len(memberships) == 2

        # Find by org
        m_a = next(m for m in memberships if m["organization_id"] == org_a.pk)
        m_b = next(m for m in memberships if m["organization_id"] == org_b.pk)

        assert m_a["role_code"] == role_doctor.code
        assert m_a["is_primary"] is True
        assert m_a["organization_name"] == org_a.name

        assert m_b["role_code"] == role_receptionist.code
        assert m_b["is_primary"] is False

    def test_login_without_memberships_returns_empty(self, db):
        """User with profile but no OrgMembership gets empty list."""
        user = User.objects.create_user(
            username="nomember_p2",
            email="nomember@p2.co.ke",
            password="testpass123!",
        )
        dept = Department.objects.create(name="Dept NM", code="DNM", is_active=True)
        role = Role.objects.create(name="Role NM", code="RNM", hierarchy_level=5, is_active=True)
        StaffProfile.objects.create(
            user=user,
            employee_id="NM-001",
            primary_role=role,
            primary_department=dept,
            date_joined=date.today(),
        )
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "nomember_p2", "password": "testpass123!"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get("memberships") == []


# ============================================================================
# /api/staff/me/ includes memberships
# ============================================================================


class TestStaffMeMemberships:
    """Staff me endpoint should include memberships."""

    def test_me_includes_memberships(
        self,
        staff_user,
        staff_profile,
        membership_a,
        membership_b,
    ):
        """GET /api/staff/me/ should include memberships in user_info."""
        client = APIClient()
        client.force_authenticate(user=staff_user)
        response = client.get("/api/staff/me/")
        assert response.status_code == status.HTTP_200_OK

        data = response.data
        # Memberships should be in user_info or top-level
        memberships = data.get("memberships") or data.get("user_info", {}).get("memberships")
        assert memberships is not None, f"Keys: {list(data.keys())}"
        assert len(memberships) == 2


# ============================================================================
# my-facilities derives from OrgMembership
# ============================================================================


class TestMyFacilitiesFromMembership:
    """my-facilities endpoint should derive from OrgMembership."""

    def test_my_facilities_includes_membership_facilities(
        self,
        staff_user,
        staff_profile,
        membership_a,
        membership_b,
        facility_a1,
        facility_a2,
        facility_b1,
    ):
        """Should return facilities from all active memberships."""
        client = APIClient()
        client.force_authenticate(user=staff_user)
        response = client.get("/api/core/facilities/my-facilities/")
        assert response.status_code == status.HTTP_200_OK

        facility_ids = {f["id"] for f in response.data}
        assert facility_a1.pk in facility_ids
        assert facility_a2.pk in facility_ids
        assert facility_b1.pk in facility_ids

    def test_my_facilities_excludes_revoked_membership(
        self,
        staff_user,
        staff_profile,
        membership_a,
        membership_b,
        facility_b1,
    ):
        """Revoked membership facilities should not appear."""
        membership_b.status = OrgMembership.MembershipStatus.REVOKED
        membership_b.save()

        client = APIClient()
        client.force_authenticate(user=staff_user)
        response = client.get("/api/core/facilities/my-facilities/")
        assert response.status_code == status.HTTP_200_OK

        facility_ids = {f["id"] for f in response.data}
        assert facility_b1.pk not in facility_ids
