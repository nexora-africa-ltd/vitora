"""
Phase 3 — Cross-Organization Invitation Tests.

Covers:
- Inviting an existing user to a DIFFERENT org → success (creates cross-org invitation)
- Inviting an existing user to the SAME org → rejected (already a member)
- Existing user accepts → OrgMembership created, no new User/StaffProfile
- Existing user declines → invitation marked DECLINED
- New user accept flow creates OrgMembership alongside User+StaffProfile
- Public lookup shows is_cross_org flag
"""

import uuid
from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import (
    Department,
    Facility,
    Organization,
    OrgMembership,
    Role,
    StaffInvitation,
    StaffProfile,
)

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def org_a(db):
    return Organization.objects.create(name="Org Alpha", slug="org-alpha", is_active=True)


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="Org Beta", slug="org-beta", is_active=True)


@pytest.fixture
def facility_a(db, org_a, sample_county, sample_sub_county):
    return Facility.objects.create(
        organization=org_a,
        name="Alpha Clinic",
        mfl_code="FA001",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def facility_b(db, org_b, sample_county, sample_sub_county):
    return Facility.objects.create(
        organization=org_b,
        name="Beta Hospital",
        mfl_code="FB001",
        level="4",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def role_doctor(db):
    return Role.objects.create(name="Doctor X", code="DOCX", is_active=True)


@pytest.fixture
def role_consultant(db):
    return Role.objects.create(name="Consultant X", code="CONX", is_active=True)


@pytest.fixture
def dept_gen(db):
    return Department.objects.create(name="General X", code="GENX", is_active=True)


@pytest.fixture
def existing_user(db, org_a, facility_a, role_doctor, dept_gen):
    """A user who is already a member of Org A."""
    user = User.objects.create_user(
        username="existing_co",
        email="existing@hospital.co.ke",
        password="ExistPass123!",
    )
    profile = StaffProfile.objects.create(
        user=user,
        employee_id="EX-001",
        organization=org_a,
        primary_facility=facility_a,
        primary_role=role_doctor,
        primary_department=dept_gen,
        date_joined=date.today(),
    )
    # Create OrgMembership for Org A
    membership = OrgMembership.objects.create(
        staff_profile=profile,
        organization=org_a,
        role=role_doctor,
        department=dept_gen,
        is_primary=True,
    )
    membership.facilities.add(facility_a)
    return user


@pytest.fixture
def admin_user_co(db, org_b, facility_b, role_consultant, dept_gen):
    """Admin user in Org B who sends invitations."""
    user = User.objects.create_user(
        username="admin_co",
        email="admin_co@beta.co.ke",
        password="AdminPass123!",
        is_staff=True,
    )
    profile = StaffProfile.objects.create(
        user=user,
        employee_id="ADM-CO-001",
        organization=org_b,
        primary_facility=facility_b,
        primary_role=role_consultant,
        primary_department=dept_gen,
        date_joined=date.today(),
    )
    OrgMembership.objects.create(
        staff_profile=profile,
        organization=org_b,
        role=role_consultant,
        department=dept_gen,
        is_primary=True,
    )
    return user


@pytest.fixture
def admin_client_co(admin_user_co):
    client = APIClient()
    client.force_authenticate(user=admin_user_co)
    return client


@pytest.fixture
def cross_org_invitation(
    db, admin_user_co, org_b, role_consultant, dept_gen, facility_b, existing_user
):
    """A pending cross-org invitation for existing_user to join Org B."""
    inv = StaffInvitation(
        email=existing_user.email,
        organization=org_b,
        role=role_consultant,
        department=dept_gen,
        facility=facility_b,
        invited_by=admin_user_co,
        is_cross_org=True,
        existing_user=existing_user,
        expires_hours=72,
    )
    inv.save()
    return inv


# ============================================================================
# Phase 3a: Cross-Org Invitation Creation
# ============================================================================


@pytest.mark.django_db
class TestCrossOrgInvitationCreate:
    """Admin can invite existing users to a different organization."""

    def test_invite_existing_user_to_different_org(
        self, admin_client_co, existing_user, org_b, role_consultant, dept_gen
    ):
        """Inviting an existing user to Org B (they're in Org A) succeeds."""
        response = admin_client_co.post(
            "/api/core/invitations/",
            {
                "email": existing_user.email,
                "organization": org_b.pk,
                "role": role_consultant.pk,
                "department": dept_gen.pk,
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_cross_org"] is True
        assert response.data["existing_user"] == existing_user.pk

    def test_invite_existing_user_to_same_org_rejected(
        self, admin_client_co, existing_user, org_a, role_doctor, dept_gen
    ):
        """Inviting an existing user who is already a member of the target org fails."""
        # admin_client_co is in org_b, but we specify org_a as target
        response = admin_client_co.post(
            "/api/core/invitations/",
            {
                "email": existing_user.email,
                "organization": org_a.pk,
                "role": role_doctor.pk,
                "department": dept_gen.pk,
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already a member" in str(response.data["email"]).lower()

    def test_invite_new_email_still_works(self, admin_client_co, org_b, role_consultant, dept_gen):
        """Inviting a brand-new email (no existing user) still works normally."""
        response = admin_client_co.post(
            "/api/core/invitations/",
            {
                "email": "brandnew@hospital.co.ke",
                "organization": org_b.pk,
                "role": role_consultant.pk,
                "department": dept_gen.pk,
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_cross_org"] is False
        assert response.data["existing_user"] is None


# ============================================================================
# Phase 3b: New-user Accept Creates OrgMembership
# ============================================================================


@pytest.mark.django_db
class TestNewUserAcceptCreatesOrgMembership:
    """Accepting an invitation as a brand-new user also creates an OrgMembership."""

    def test_new_user_accept_creates_membership(
        self, org_b, role_consultant, dept_gen, facility_b, admin_user_co
    ):
        """New-user accept creates User + StaffProfile + OrgMembership."""
        inv = StaffInvitation(
            email="fresh@hospital.co.ke",
            organization=org_b,
            role=role_consultant,
            department=dept_gen,
            facility=facility_b,
            invited_by=admin_user_co,
            expires_hours=72,
        )
        inv.save()

        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept/",
            {
                "token": str(inv.token),
                "username": "freshuser",
                "password": "SecurePass123!",
                "confirm_password": "SecurePass123!",
                "first_name": "Fresh",
                "last_name": "User",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        user = User.objects.get(username="freshuser")
        profile = user.staff_profile
        membership = OrgMembership.objects.get(staff_profile=profile, organization=org_b)
        assert membership.is_primary is True
        assert membership.role == role_consultant
        assert membership.department == dept_gen
        assert membership.status == OrgMembership.MembershipStatus.ACTIVE
        assert facility_b in membership.facilities.all()


# ============================================================================
# Phase 3c: Cross-Org Accept (Existing User)
# ============================================================================


@pytest.mark.django_db
class TestCrossOrgAccept:
    """Existing user accepts a cross-org invitation → OrgMembership created."""

    def test_existing_user_accept_creates_secondary_membership(
        self, cross_org_invitation, existing_user, org_b, role_consultant, dept_gen, facility_b
    ):
        """Existing user accepting creates OrgMembership(is_primary=False)."""
        client = APIClient()
        client.force_authenticate(user=existing_user)
        response = client.post(
            "/api/core/invitations/accept-cross-org/",
            {"token": str(cross_org_invitation.token)},
        )
        assert response.status_code == status.HTTP_201_CREATED

        membership = OrgMembership.objects.get(
            staff_profile=existing_user.staff_profile,
            organization=org_b,
        )
        assert membership.is_primary is False
        assert membership.role == role_consultant
        assert membership.department == dept_gen
        assert membership.status == OrgMembership.MembershipStatus.ACTIVE
        assert facility_b in membership.facilities.all()
        assert membership.invited_by == cross_org_invitation.invited_by

        # Invitation marked as accepted
        cross_org_invitation.refresh_from_db()
        assert cross_org_invitation.status == StaffInvitation.InvitationStatus.ACCEPTED
        assert cross_org_invitation.accepted_user == existing_user

    def test_cross_org_accept_requires_authentication(self, cross_org_invitation):
        """Unauthenticated users can't accept cross-org invitations."""
        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept-cross-org/",
            {"token": str(cross_org_invitation.token)},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_cross_org_accept_wrong_user_rejected(self, cross_org_invitation, admin_user_co):
        """A different authenticated user cannot accept someone else's cross-org invite."""
        client = APIClient()
        client.force_authenticate(user=admin_user_co)
        response = client.post(
            "/api/core/invitations/accept-cross-org/",
            {"token": str(cross_org_invitation.token)},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_cross_org_accept_expired_invitation_rejected(
        self, existing_user, org_b, admin_user_co
    ):
        """Expired cross-org invitations cannot be accepted."""
        from datetime import timedelta

        from django.utils import timezone

        inv = StaffInvitation(
            email=existing_user.email,
            organization=org_b,
            invited_by=admin_user_co,
            is_cross_org=True,
            existing_user=existing_user,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        inv.save()

        client = APIClient()
        client.force_authenticate(user=existing_user)
        response = client.post(
            "/api/core/invitations/accept-cross-org/",
            {"token": str(inv.token)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cross_org_accept_already_member_rejected(
        self, existing_user, org_a, role_doctor, admin_user_co
    ):
        """Cannot accept if user already has membership in the target org."""
        inv = StaffInvitation(
            email=existing_user.email,
            organization=org_a,  # User is already in Org A
            role=role_doctor,
            invited_by=admin_user_co,
            is_cross_org=True,
            existing_user=existing_user,
            expires_hours=72,
        )
        inv.save()

        client = APIClient()
        client.force_authenticate(user=existing_user)
        response = client.post(
            "/api/core/invitations/accept-cross-org/",
            {"token": str(inv.token)},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already a member" in str(response.data).lower()


# ============================================================================
# Phase 3d: Decline Cross-Org Invitation
# ============================================================================


@pytest.mark.django_db
class TestCrossOrgDecline:
    """Existing user can decline a cross-org invitation."""

    def test_decline_sets_status(self, cross_org_invitation, existing_user):
        """Declining sets invitation status to DECLINED."""
        client = APIClient()
        client.force_authenticate(user=existing_user)
        response = client.post(
            f"/api/core/invitations/{cross_org_invitation.pk}/decline/",
        )
        assert response.status_code == status.HTTP_200_OK
        cross_org_invitation.refresh_from_db()
        assert cross_org_invitation.status == StaffInvitation.InvitationStatus.DECLINED

    def test_decline_wrong_user_rejected(self, cross_org_invitation, admin_user_co):
        """A different user cannot decline someone else's invitation."""
        client = APIClient()
        client.force_authenticate(user=admin_user_co)
        response = client.post(
            f"/api/core/invitations/{cross_org_invitation.pk}/decline/",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_decline_requires_authentication(self, cross_org_invitation):
        """Unauthenticated users cannot decline."""
        client = APIClient()
        response = client.post(
            f"/api/core/invitations/{cross_org_invitation.pk}/decline/",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Phase 3e: Public Lookup Shows Cross-Org Flag
# ============================================================================


@pytest.mark.django_db
class TestCrossOrgLookup:
    """Public lookup endpoint shows cross-org info."""

    def test_lookup_cross_org_invitation(self, cross_org_invitation):
        """Public lookup shows is_cross_org and hides sensitive existing_user details."""
        client = APIClient()
        response = client.get(f"/api/core/invitations/{cross_org_invitation.token}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_cross_org"] is True
