"""
Phase 4 — Self-Service Organization Join Request Tests.

Covers:
- OrgJoinRequest model lifecycle (create, approve, reject, cancel)
- API endpoints: list, create, approve, reject, cancel
- Approval creates OrgMembership
- Duplicate pending request blocked
- Already-a-member request blocked
- Only org admins can approve/reject
- Requester can cancel their own request
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import (
    Department,
    Facility,
    Organization,
    OrgJoinRequest,
    OrgMembership,
    Role,
    StaffProfile,
)

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def target_org(db):
    return Organization.objects.create(name="Target Org", slug="target-org", is_active=True)


@pytest.fixture
def target_facility(db, target_org, sample_county, sample_sub_county):
    return Facility.objects.create(
        organization=target_org,
        name="Target Clinic",
        mfl_code="TG001",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def requester_org(db):
    return Organization.objects.create(name="Requester Org", slug="requester-org", is_active=True)


@pytest.fixture
def requester_facility(db, requester_org, sample_county, sample_sub_county):
    return Facility.objects.create(
        organization=requester_org,
        name="Requester Clinic",
        mfl_code="RQ001",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def role_nurse(db):
    return Role.objects.create(name="Nurse JR", code="NJR", is_active=True)


@pytest.fixture
def role_admin_jr(db):
    return Role.objects.create(name="Admin JR", code="ADJR", is_active=True)


@pytest.fixture
def dept_jr(db):
    return Department.objects.create(name="Dept JR", code="DJR", is_active=True)


@pytest.fixture
def requester_user(db, requester_org, requester_facility, role_nurse, dept_jr):
    """A regular user who wants to join target_org."""
    user = User.objects.create_user(
        username="requester_jr",
        email="requester@hospital.co.ke",
        password="ReqPass123!",
    )
    profile = StaffProfile.objects.create(
        user=user,
        employee_id="REQ-001",
        organization=requester_org,
        primary_facility=requester_facility,
        primary_role=role_nurse,
        primary_department=dept_jr,
        date_joined=date.today(),
    )
    OrgMembership.objects.create(
        staff_profile=profile,
        organization=requester_org,
        role=role_nurse,
        department=dept_jr,
        is_primary=True,
    )
    return user


@pytest.fixture
def requester_client(requester_user):
    client = APIClient()
    client.force_authenticate(user=requester_user)
    return client


@pytest.fixture
def org_admin_user(db, target_org, target_facility, role_admin_jr, dept_jr):
    """Admin user in target_org who can approve/reject requests."""
    user = User.objects.create_user(
        username="orgadmin_jr",
        email="orgadmin_jr@target.co.ke",
        password="AdminJR123!",
        is_staff=True,
    )
    profile = StaffProfile.objects.create(
        user=user,
        employee_id="ADM-JR-001",
        organization=target_org,
        primary_facility=target_facility,
        primary_role=role_admin_jr,
        primary_department=dept_jr,
        date_joined=date.today(),
    )
    OrgMembership.objects.create(
        staff_profile=profile,
        organization=target_org,
        role=role_admin_jr,
        department=dept_jr,
        is_primary=True,
    )
    return user


@pytest.fixture
def admin_client_jr(org_admin_user):
    client = APIClient()
    client.force_authenticate(user=org_admin_user)
    return client


@pytest.fixture
def pending_join_request(db, requester_user, target_org, role_nurse):
    return OrgJoinRequest.objects.create(
        user=requester_user,
        organization=target_org,
        requested_role=role_nurse,
        message="I'd like to consult at your facility.",
    )


# ============================================================================
# Model Tests
# ============================================================================


@pytest.mark.django_db
class TestOrgJoinRequestModel:
    """Tests for OrgJoinRequest model."""

    def test_create_join_request(self, requester_user, target_org, role_nurse):
        """Can create a join request."""
        jr = OrgJoinRequest.objects.create(
            user=requester_user,
            organization=target_org,
            requested_role=role_nurse,
            message="Locum work",
        )
        assert jr.status == OrgJoinRequest.RequestStatus.PENDING
        assert jr.reviewed_by is None
        assert jr.reviewed_at is None

    def test_unique_pending_per_user_org(
        self, pending_join_request, requester_user, target_org, role_nurse
    ):
        """Cannot have two pending requests for the same user+org."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            OrgJoinRequest.objects.create(
                user=requester_user,
                organization=target_org,
                requested_role=role_nurse,
                message="Duplicate",
            )

    def test_can_request_after_rejection(
        self, pending_join_request, requester_user, target_org, role_nurse
    ):
        """After a rejection, user can submit a new request."""
        pending_join_request.status = OrgJoinRequest.RequestStatus.REJECTED
        pending_join_request.save()
        # Now a new PENDING request is allowed
        jr2 = OrgJoinRequest.objects.create(
            user=requester_user,
            organization=target_org,
            requested_role=role_nurse,
            message="Trying again",
        )
        assert jr2.status == OrgJoinRequest.RequestStatus.PENDING


# ============================================================================
# API: Create Join Request
# ============================================================================


@pytest.mark.django_db
class TestCreateJoinRequest:
    """Tests for POST /api/core/join-requests/."""

    def test_create_request_success(self, requester_client, target_org, role_nurse):
        """Authenticated user can create a join request."""
        response = requester_client.post(
            "/api/core/join-requests/",
            {
                "organization": target_org.pk,
                "requested_role": role_nurse.pk,
                "message": "I would like to consult.",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING"
        assert response.data["organization"] == target_org.pk

    def test_create_request_unauthenticated(self, target_org, role_nurse):
        """Unauthenticated users cannot create requests."""
        client = APIClient()
        response = client.post(
            "/api/core/join-requests/",
            {
                "organization": target_org.pk,
                "requested_role": role_nurse.pk,
                "message": "Please let me in.",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_duplicate_pending_rejected(
        self, requester_client, pending_join_request, target_org, role_nurse
    ):
        """Cannot create a second pending request for the same org."""
        response = requester_client.post(
            "/api/core/join-requests/",
            {
                "organization": target_org.pk,
                "requested_role": role_nurse.pk,
                "message": "Duplicate attempt.",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_already_member_rejected(self, requester_client, requester_org, role_nurse):
        """Cannot request to join an org you're already a member of."""
        response = requester_client.post(
            "/api/core/join-requests/",
            {
                "organization": requester_org.pk,
                "requested_role": role_nurse.pk,
                "message": "I'm already here.",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already a member" in str(response.data).lower()


# ============================================================================
# API: Approve Join Request
# ============================================================================


@pytest.mark.django_db
class TestApproveJoinRequest:
    """Tests for POST /api/core/join-requests/{id}/approve/."""

    def test_approve_creates_membership(
        self,
        admin_client_jr,
        pending_join_request,
        requester_user,
        target_org,
        target_facility,
        role_nurse,
        dept_jr,
    ):
        """Approving creates OrgMembership for the requester."""
        response = admin_client_jr.post(
            f"/api/core/join-requests/{pending_join_request.pk}/approve/",
            {
                "role": role_nurse.pk,
                "department": dept_jr.pk,
                "facilities": [target_facility.pk],
            },
        )
        assert response.status_code == status.HTTP_200_OK

        pending_join_request.refresh_from_db()
        assert pending_join_request.status == OrgJoinRequest.RequestStatus.APPROVED

        membership = OrgMembership.objects.get(
            staff_profile=requester_user.staff_profile,
            organization=target_org,
        )
        assert membership.role == role_nurse
        assert membership.department == dept_jr
        assert membership.is_primary is False
        assert membership.status == OrgMembership.MembershipStatus.ACTIVE
        assert target_facility in membership.facilities.all()

    def test_approve_non_admin_forbidden(self, requester_client, pending_join_request, role_nurse):
        """Non-admin users cannot approve requests."""
        response = requester_client.post(
            f"/api/core/join-requests/{pending_join_request.pk}/approve/",
            {"role": role_nurse.pk},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# API: Reject Join Request
# ============================================================================


@pytest.mark.django_db
class TestRejectJoinRequest:
    """Tests for POST /api/core/join-requests/{id}/reject/."""

    def test_reject_sets_status(self, admin_client_jr, pending_join_request):
        """Rejecting sets status to REJECTED with optional notes."""
        response = admin_client_jr.post(
            f"/api/core/join-requests/{pending_join_request.pk}/reject/",
            {"review_notes": "We're not hiring right now."},
        )
        assert response.status_code == status.HTTP_200_OK
        pending_join_request.refresh_from_db()
        assert pending_join_request.status == OrgJoinRequest.RequestStatus.REJECTED
        assert pending_join_request.review_notes == "We're not hiring right now."

    def test_reject_no_membership_created(
        self, admin_client_jr, pending_join_request, requester_user, target_org
    ):
        """Rejecting does NOT create an OrgMembership."""
        admin_client_jr.post(
            f"/api/core/join-requests/{pending_join_request.pk}/reject/",
        )
        assert not OrgMembership.objects.filter(
            staff_profile=requester_user.staff_profile,
            organization=target_org,
        ).exists()


# ============================================================================
# API: Cancel Join Request
# ============================================================================


@pytest.mark.django_db
class TestCancelJoinRequest:
    """Tests for POST /api/core/join-requests/{id}/cancel/."""

    def test_requester_can_cancel(self, requester_client, pending_join_request):
        """Requester can cancel their own pending request."""
        response = requester_client.post(
            f"/api/core/join-requests/{pending_join_request.pk}/cancel/",
        )
        assert response.status_code == status.HTTP_200_OK
        pending_join_request.refresh_from_db()
        assert pending_join_request.status == OrgJoinRequest.RequestStatus.CANCELLED

    def test_other_user_cannot_cancel(self, admin_client_jr, pending_join_request):
        """A different user (even admin) cannot cancel someone else's request."""
        response = admin_client_jr.post(
            f"/api/core/join-requests/{pending_join_request.pk}/cancel/",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# API: List Join Requests
# ============================================================================


@pytest.mark.django_db
class TestListJoinRequests:
    """Tests for GET /api/core/join-requests/."""

    def test_requester_sees_own_requests(self, requester_client, pending_join_request):
        """Regular user sees only their own join requests."""
        response = requester_client.get("/api/core/join-requests/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        ids = {r["id"] for r in results}
        assert pending_join_request.pk in ids

    def test_admin_sees_requests_for_their_org(
        self, admin_client_jr, pending_join_request, target_org
    ):
        """Admin sees requests targeting their org."""
        response = admin_client_jr.get("/api/core/join-requests/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        ids = {r["id"] for r in results}
        assert pending_join_request.pk in ids
