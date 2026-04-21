"""API tests for OrgMembership management endpoints."""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.core.models import Facility, OrgMembership
from tests.conftest import ensure_staff_profile

User = get_user_model()


@pytest.fixture
def membership_admin_user(db):
    return User.objects.create_user(
        username="membershipadmin",
        email="membership-admin@example.com",
        password="admin123!",
        is_staff=True,
    )


@pytest.fixture
def membership_admin_client(
    api_client,
    membership_admin_user,
    sample_organization,
    sample_facility,
):
    ensure_staff_profile(membership_admin_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=membership_admin_user)
    return api_client


@pytest.fixture
def extra_facility(db, sample_organization, sample_county, sample_sub_county):
    return Facility.objects.create(
        organization=sample_organization,
        name="Annex Clinic",
        mfl_code="99998",
        level="2",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def secondary_staff_profile(
    db,
    another_user,
    sample_organization,
    sample_facility,
    sample_department,
    sample_role,
):
    from datetime import date

    from hmis.apps.core.models import StaffProfile

    return StaffProfile.objects.create(
        user=another_user,
        employee_id="TEST-0002",
        organization=sample_organization,
        primary_facility=sample_facility,
        primary_department=sample_department,
        primary_role=sample_role,
        date_joined=date.today(),
    )


@pytest.fixture
def org_membership(
    test_staff_profile, sample_organization, sample_role, sample_department, sample_facility
):
    membership = OrgMembership.objects.create(
        staff_profile=test_staff_profile,
        organization=sample_organization,
        role=sample_role,
        department=sample_department,
        is_primary=True,
    )
    membership.facilities.add(sample_facility)
    return membership


class TestOrgMembershipApi:
    def test_list_memberships_for_staff_profile(
        self,
        membership_admin_client,
        org_membership,
        secondary_staff_profile,
        sample_organization,
        sample_role,
    ):
        other_membership = OrgMembership.objects.create(
            staff_profile=secondary_staff_profile,
            organization=sample_organization,
            role=sample_role,
            is_primary=False,
        )

        response = membership_admin_client.get(
            "/api/org-memberships/",
            {"staff_profile": org_membership.staff_profile_id},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["id"] == org_membership.id
        assert response.data["results"][0]["staff_profile"] == org_membership.staff_profile_id
        assert all(item["id"] != other_membership.id for item in response.data["results"])

    def test_create_membership_for_staff_profile(
        self,
        membership_admin_client,
        test_staff_profile,
        sample_organization,
        sample_role,
        sample_department,
        sample_facility,
        extra_facility,
    ):
        response = membership_admin_client.post(
            "/api/org-memberships/",
            {
                "staff_profile": test_staff_profile.id,
                "organization": sample_organization.id,
                "role": sample_role.id,
                "department": sample_department.id,
                "facilities": [sample_facility.id, extra_facility.id],
                "is_primary": False,
                "status": OrgMembership.MembershipStatus.ACTIVE,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["staff_profile"] == test_staff_profile.id
        assert response.data["organization"] == sample_organization.id
        assert response.data["role"] == sample_role.id
        assert sorted(response.data["facility_ids"]) == sorted(
            [sample_facility.id, extra_facility.id]
        )
        assert OrgMembership.objects.filter(
            staff_profile=test_staff_profile,
            organization=sample_organization,
            is_primary=False,
        ).exists()

    def test_update_membership_role_and_facilities(
        self,
        membership_admin_client,
        org_membership,
        sample_facility,
        extra_facility,
    ):
        from hmis.apps.core.models import Role

        replacement_role = Role.objects.create(
            name="Nurse",
            code="NURSE_OM_API",
            hierarchy_level=4,
            is_active=True,
        )

        response = membership_admin_client.patch(
            f"/api/org-memberships/{org_membership.id}/",
            {
                "role": replacement_role.id,
                "facilities": [extra_facility.id],
                "is_primary": False,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["role"] == replacement_role.id
        assert response.data["is_primary"] is False
        assert response.data["facility_ids"] == [extra_facility.id]

        org_membership.refresh_from_db()
        assert org_membership.role == replacement_role
        assert list(org_membership.facilities.values_list("id", flat=True)) == [extra_facility.id]

    def test_delete_membership(self, membership_admin_client, org_membership):
        response = membership_admin_client.delete(f"/api/org-memberships/{org_membership.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not OrgMembership.objects.filter(pk=org_membership.id).exists()
