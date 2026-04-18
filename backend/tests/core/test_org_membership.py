"""
Tests for OrgMembership model — multi-org support with per-org roles.

Phase 1 of the Multi-Org Workflow plan.
Covers: model CRUD, uniqueness constraints, is_primary enforcement,
facility-org validation, StaffProfile compat properties.
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError

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
        name="Alpha Hospital Group",
        slug="alpha-hospital",
        contact_email="admin@alpha.co.ke",
        is_active=True,
        is_verified=True,
    )


@pytest.fixture
def org_b(db):
    return Organization.objects.create(
        name="Beta Health Network",
        slug="beta-health",
        contact_email="admin@beta.co.ke",
        is_active=True,
        is_verified=True,
    )


@pytest.fixture
def county(db):
    return County.objects.create(code=47, name="Nairobi")


@pytest.fixture
def sub_county(db, county):
    return SubCounty.objects.create(county=county, name="Westlands")


@pytest.fixture
def facility_a(db, org_a, county, sub_county):
    return Facility.objects.create(
        organization=org_a,
        mfl_code="10001",
        name="Alpha Main Clinic",
        level="3",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def facility_a2(db, org_a, county, sub_county):
    return Facility.objects.create(
        organization=org_a,
        mfl_code="10002",
        name="Alpha Branch Clinic",
        level="2",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def facility_b(db, org_b, county, sub_county):
    return Facility.objects.create(
        organization=org_b,
        mfl_code="20001",
        name="Beta Central Hospital",
        level="4",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def role_doctor(db):
    return Role.objects.create(name="Doctor", code="DOCTOR_OM", hierarchy_level=5, is_active=True)


@pytest.fixture
def role_consultant(db):
    return Role.objects.create(
        name="Consultant", code="CONSULTANT_OM", hierarchy_level=3, is_active=True
    )


@pytest.fixture
def dept_outpatient(db):
    return Department.objects.create(name="Outpatient", code="OPD_OM", is_active=True)


@pytest.fixture
def dept_surgery(db):
    return Department.objects.create(name="Surgery", code="SURG_OM", is_active=True)


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="drjane",
        email="drjane@example.com",
        password="testpass123!",
        first_name="Jane",
        last_name="Doe",
    )


@pytest.fixture
def staff_profile(db, staff_user, org_a, facility_a, role_doctor, dept_outpatient):
    return StaffProfile.objects.create(
        user=staff_user,
        employee_id="OM-TEST-001",
        organization=org_a,
        primary_facility=facility_a,
        primary_role=role_doctor,
        primary_department=dept_outpatient,
        date_joined=date.today(),
    )


# ============================================================================
# Model CRUD
# ============================================================================


class TestOrgMembershipCreation:
    """Tests for creating OrgMembership records."""

    def test_create_primary_membership(
        self, staff_profile, org_a, role_doctor, dept_outpatient, facility_a
    ):
        """Should create a primary membership with all fields."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            department=dept_outpatient,
            is_primary=True,
        )
        membership.facilities.add(facility_a)

        assert membership.pk is not None
        assert membership.staff_profile == staff_profile
        assert membership.organization == org_a
        assert membership.role == role_doctor
        assert membership.department == dept_outpatient
        assert membership.is_primary is True
        assert membership.status == OrgMembership.MembershipStatus.ACTIVE
        assert membership.joined_at is not None
        assert facility_a in membership.facilities.all()

    def test_create_secondary_membership(self, staff_profile, org_b, role_consultant, facility_b):
        """Should create a non-primary membership for a second org."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_b,
            role=role_consultant,
            is_primary=False,
        )
        membership.facilities.add(facility_b)

        assert membership.is_primary is False
        assert membership.organization == org_b
        assert membership.role == role_consultant

    def test_membership_str_representation(self, staff_profile, org_a, role_doctor):
        """Should have meaningful string representation."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        result = str(membership)
        assert staff_profile.get_full_name() in result
        assert org_a.name in result

    def test_department_is_optional(self, staff_profile, org_a, role_doctor):
        """Should allow creating membership without department."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
            department=None,
        )
        assert membership.department is None

    def test_invited_by_is_optional(self, staff_profile, org_a, role_doctor):
        """Should allow creating membership without invited_by."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        assert membership.invited_by is None

    def test_invited_by_tracks_inviter(self, staff_profile, org_a, role_doctor, staff_user):
        """Should track who invited the member."""
        admin_user = User.objects.create_user(
            username="admin_org", email="admin@org.co.ke", password="pass123!"
        )
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
            invited_by=admin_user,
        )
        assert membership.invited_by == admin_user


# ============================================================================
# Status
# ============================================================================


class TestOrgMembershipStatus:
    """Tests for membership status."""

    def test_default_status_is_active(self, staff_profile, org_a, role_doctor):
        """Should default to ACTIVE status."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        assert membership.status == OrgMembership.MembershipStatus.ACTIVE

    def test_is_active_property(self, staff_profile, org_a, role_doctor):
        """Should return True when status is ACTIVE."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        assert membership.is_active is True

    def test_suspended_is_not_active(self, staff_profile, org_a, role_doctor):
        """Should return False when status is SUSPENDED."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
            status=OrgMembership.MembershipStatus.SUSPENDED,
        )
        assert membership.is_active is False

    def test_revoked_is_not_active(self, staff_profile, org_a, role_doctor):
        """Should return False when status is REVOKED."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
            status=OrgMembership.MembershipStatus.REVOKED,
        )
        assert membership.is_active is False


# ============================================================================
# Uniqueness Constraints
# ============================================================================


class TestOrgMembershipUniqueConstraints:
    """Tests for uniqueness enforcement."""

    def test_unique_staff_org_pair(self, staff_profile, org_a, role_doctor, role_consultant):
        """Should reject duplicate membership for same staff + org."""
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        with pytest.raises(IntegrityError):
            OrgMembership.objects.create(
                staff_profile=staff_profile,
                organization=org_a,
                role=role_consultant,
                is_primary=False,
            )

    def test_same_staff_different_orgs_allowed(
        self, staff_profile, org_a, org_b, role_doctor, role_consultant
    ):
        """Should allow same staff in different orgs."""
        m1 = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        m2 = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_b,
            role=role_consultant,
            is_primary=False,
        )
        assert m1.pk != m2.pk
        assert OrgMembership.objects.filter(staff_profile=staff_profile).count() == 2

    def test_different_staff_same_org_allowed(
        self, staff_profile, org_a, role_doctor, dept_outpatient
    ):
        """Should allow different staff in the same org."""
        user2 = User.objects.create_user(
            username="drjohn", email="drjohn@example.com", password="pass123!"
        )
        profile2 = StaffProfile.objects.create(
            user=user2,
            employee_id="OM-TEST-002",
            organization=org_a,
            primary_role=role_doctor,
            primary_department=dept_outpatient,
            date_joined=date.today(),
        )
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        OrgMembership.objects.create(
            staff_profile=profile2,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        assert OrgMembership.objects.filter(organization=org_a).count() == 2


# ============================================================================
# Facility-Org Validation
# ============================================================================


class TestOrgMembershipFacilityValidation:
    """Tests for facility-org cross-validation."""

    def test_facilities_must_belong_to_membership_org(
        self, staff_profile, org_a, org_b, role_doctor, facility_b
    ):
        """Should reject facilities from a different org."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        membership.facilities.add(facility_b)  # facility_b belongs to org_b

        with pytest.raises(ValidationError):
            membership.clean()

    def test_facilities_from_same_org_allowed(
        self, staff_profile, org_a, role_doctor, facility_a, facility_a2
    ):
        """Should allow facilities from the membership's org."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        membership.facilities.add(facility_a, facility_a2)
        membership.clean()  # Should not raise

    def test_empty_facilities_is_valid(self, staff_profile, org_a, role_doctor):
        """Should allow membership with no facilities."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        membership.clean()  # Should not raise


# ============================================================================
# StaffProfile Compat Properties
# ============================================================================


class TestStaffProfileMembershipProperties:
    """Tests for backward-compat properties on StaffProfile."""

    def test_active_memberships_returns_active_only(
        self, staff_profile, org_a, org_b, role_doctor, role_consultant
    ):
        """Should return only ACTIVE memberships."""
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
            status=OrgMembership.MembershipStatus.ACTIVE,
        )
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_b,
            role=role_consultant,
            is_primary=False,
            status=OrgMembership.MembershipStatus.REVOKED,
        )
        active = staff_profile.active_memberships
        assert active.count() == 1
        assert active.first().organization == org_a

    def test_primary_membership_returns_primary(
        self, staff_profile, org_a, org_b, role_doctor, role_consultant
    ):
        """Should return the primary membership."""
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_b,
            role=role_consultant,
            is_primary=False,
        )
        primary = staff_profile.primary_membership
        assert primary is not None
        assert primary.organization == org_a
        assert primary.is_primary is True

    def test_primary_membership_returns_none_when_no_memberships(self, staff_profile):
        """Should return None when no memberships exist."""
        assert staff_profile.primary_membership is None

    def test_get_membership_for_org(
        self, staff_profile, org_a, org_b, role_doctor, role_consultant
    ):
        """Should return the membership for a specific org."""
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        m2 = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_b,
            role=role_consultant,
            is_primary=False,
        )
        result = staff_profile.get_membership_for_org(org_b.pk)
        assert result == m2
        assert result.role == role_consultant

    def test_get_membership_for_org_returns_none_for_unknown(
        self, staff_profile, org_a, role_doctor
    ):
        """Should return None for an org the staff doesn't belong to."""
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        assert staff_profile.get_membership_for_org(99999) is None

    def test_has_permission_for_org(self, staff_profile, org_a, org_b, role_consultant):
        """Should check permissions using the org-specific role."""
        # Create a role with specific permissions
        role_with_perms = Role.objects.create(
            name="Permissioned Role",
            code="PERM_ROLE_OM",
            hierarchy_level=5,
            is_active=True,
            permissions_matrix={
                "Patient": {"read": True, "create": True, "update": False, "delete": False},
            },
        )
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_with_perms,
            is_primary=True,
        )
        OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_b,
            role=role_consultant,  # No permissions_matrix set
            is_primary=False,
        )

        # Has Patient.read via org_a's role
        assert staff_profile.has_permission_for_org("read", "Patient", org_a.pk) is True
        assert staff_profile.has_permission_for_org("create", "Patient", org_a.pk) is True
        assert staff_profile.has_permission_for_org("delete", "Patient", org_a.pk) is False

        # org_b role (consultant) has no permissions_matrix → all False
        assert staff_profile.has_permission_for_org("read", "Patient", org_b.pk) is False

    def test_has_permission_for_org_returns_false_for_no_membership(self, staff_profile):
        """Should return False when user has no membership for the org."""
        assert staff_profile.has_permission_for_org("read", "Patient", 99999) is False


# ============================================================================
# Facility IDs property
# ============================================================================


class TestOrgMembershipFacilityIds:
    """Tests for facility_ids property."""

    def test_facility_ids_returns_pks(
        self, staff_profile, org_a, role_doctor, facility_a, facility_a2
    ):
        """Should return list of facility PKs."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        membership.facilities.add(facility_a, facility_a2)
        ids = membership.facility_ids
        assert set(ids) == {facility_a.pk, facility_a2.pk}

    def test_facility_ids_empty_when_no_facilities(self, staff_profile, org_a, role_doctor):
        """Should return empty list when no facilities assigned."""
        membership = OrgMembership.objects.create(
            staff_profile=staff_profile,
            organization=org_a,
            role=role_doctor,
            is_primary=True,
        )
        assert membership.facility_ids == []
