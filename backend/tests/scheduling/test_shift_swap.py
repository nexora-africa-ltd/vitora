"""
Tests for the Shift Swap Request feature.

Covers:
- Model state transitions
- Constraint checking
- Full and partial swap execution
- API endpoints (CRUD + lifecycle actions)
- Auto-expiry
- Domain event publication
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.scheduling.models import Resource, SchedulingSettings, Shift, ShiftSwapRequest

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def staff_resource_a(db, test_staff_profile, sample_facility, sample_organization):
    """PERSON resource for test_user (staff A)."""
    return Resource.objects.create(
        name="Dr. Alice",
        resource_type="PERSON",
        code="DOC-A",
        staff_profile=test_staff_profile,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def second_user(db):
    """Create a second user for swap target."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(username="staff_b", password="testpass123")


@pytest.fixture
def second_staff_profile(db, second_user, sample_facility, sample_organization):
    """Create StaffProfile for second user."""
    from tests.conftest import ensure_staff_profile

    return ensure_staff_profile(second_user, sample_organization, sample_facility, "SP-B")


@pytest.fixture
def staff_resource_b(db, second_staff_profile, sample_facility, sample_organization):
    """PERSON resource for second_user (staff B)."""
    return Resource.objects.create(
        name="Dr. Bob",
        resource_type="PERSON",
        code="DOC-B",
        staff_profile=second_staff_profile,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def shift_a(db, staff_resource_a, sample_facility, sample_organization):
    """Scheduled shift for staff A (tomorrow, day shift)."""
    tomorrow = date.today() + timedelta(days=1)
    return Shift.objects.create(
        staff_resource=staff_resource_a,
        shift_date=tomorrow,
        start_time=time(8, 0),
        end_time=time(16, 0),
        shift_type="DAY",
        status="SCHEDULED",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def shift_b(db, staff_resource_b, sample_facility, sample_organization):
    """Scheduled shift for staff B (tomorrow, night shift)."""
    tomorrow = date.today() + timedelta(days=1)
    return Shift.objects.create(
        staff_resource=staff_resource_b,
        shift_date=tomorrow,
        start_time=time(20, 0),
        end_time=time(8, 0),  # overnight
        shift_type="NIGHT",
        status="SCHEDULED",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def scheduling_settings(db, sample_facility, sample_organization):
    """Facility scheduling settings."""
    return SchedulingSettings.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        require_swap_approval=True,
        enforce_constraints=True,
    )


@pytest.fixture
def authenticated_client_b(db, second_user):
    """Authenticated API client for second user."""
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user=second_user)
    return client


# =============================================================================
# Model Tests
# =============================================================================


class TestShiftSwapRequestModel:
    """Tests for ShiftSwapRequest model state transitions."""

    def test_create_swap_request(
        self, db, shift_a, test_user, sample_facility, sample_organization
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            reason="Personal appointment",
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        assert swap.status == "PENDING"
        assert swap.is_partial is False

    def test_accept_transition(
        self,
        db,
        shift_a,
        shift_b,
        test_user,
        second_user,
        sample_facility,
        sample_organization,
        scheduling_settings,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.accept(user=second_user, offered_shift=shift_b)
        assert swap.status == "ACCEPTED"
        assert swap.accepted_by == second_user

    def test_approve_and_complete(
        self,
        db,
        shift_a,
        shift_b,
        test_user,
        second_user,
        sample_facility,
        sample_organization,
        scheduling_settings,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.accept(user=second_user, offered_shift=shift_b)
        swap.approve(user=test_user)
        assert swap.status == "COMPLETED"
        # Verify staff assignments were swapped
        shift_a.refresh_from_db()
        shift_b.refresh_from_db()
        assert shift_a.staff_resource.code == "DOC-B"
        assert shift_b.staff_resource.code == "DOC-A"

    def test_auto_approval_when_disabled(
        self,
        db,
        shift_a,
        shift_b,
        test_user,
        second_user,
        sample_facility,
        sample_organization,
        scheduling_settings,
    ):
        """When require_swap_approval=False, acceptance auto-completes."""
        scheduling_settings.require_swap_approval = False
        scheduling_settings.save()

        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.accept(user=second_user, offered_shift=shift_b)
        assert swap.status == "COMPLETED"

    def test_reject_transition(
        self,
        db,
        shift_a,
        test_user,
        second_user,
        sample_facility,
        sample_organization,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.reject(user=second_user, reason="Cannot take that shift")
        assert swap.status == "REJECTED"
        assert swap.rejection_reason == "Cannot take that shift"

    def test_cancel_transition(
        self,
        db,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.cancel()
        assert swap.status == "CANCELLED"

    def test_expire_transition(
        self,
        db,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() - timedelta(hours=1),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.expire()
        assert swap.status == "EXPIRED"

    def test_invalid_transition_raises(
        self,
        db,
        shift_a,
        test_user,
        second_user,
        sample_facility,
        sample_organization,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.cancel()
        with pytest.raises(ValueError, match="Cannot transition"):
            swap.accept(user=second_user)


class TestPartialSwap:
    """Tests for partial shift swap execution."""

    def test_partial_swap_splits_shift(
        self,
        db,
        shift_a,
        shift_b,
        test_user,
        second_user,
        staff_resource_b,
        sample_facility,
        sample_organization,
    ):
        """Partial swap should create a new shift for the swapped portion."""
        settings_obj = SchedulingSettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            require_swap_approval=False,
        )

        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            is_partial=True,
            partial_start_time=time(8, 0),
            partial_end_time=time(12, 0),
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.accept(user=second_user, offered_shift=shift_b)
        assert swap.status == "COMPLETED"

        # Original shift should be shortened
        shift_a.refresh_from_db()
        assert shift_a.start_time == time(12, 0)

        # New shift should exist for the swapped portion
        partial = Shift.objects.filter(
            staff_resource=staff_resource_b,
            shift_date=shift_a.shift_date,
            start_time=time(8, 0),
            end_time=time(12, 0),
        )
        assert partial.exists()


class TestConstraintChecking:
    """Tests for constraint validation on swap requests."""

    def test_no_nights_constraint_warns(
        self,
        db,
        shift_a,
        shift_b,
        test_user,
        second_user,
        staff_resource_a,
        sample_facility,
        sample_organization,
        scheduling_settings,
    ):
        """Should warn when swapping staff into a night shift they can't work."""
        from hmis.apps.scheduling.models import StaffConstraint

        StaffConstraint.objects.create(
            staff_resource=staff_resource_a,
            constraint_type="NO_NIGHTS",
            is_active=True,
            facility=sample_facility,
            organization=sample_organization,
        )

        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        warnings = swap.check_constraints()
        assert any("NO_NIGHTS" in w for w in warnings)


# =============================================================================
# API Tests
# =============================================================================


class TestShiftSwapAPI:
    """Tests for Shift Swap API endpoints."""

    def test_create_swap_request(
        self,
        authenticated_client,
        shift_a,
        sample_facility,
    ):
        response = authenticated_client.post(
            "/api/scheduling/shift-swaps/",
            {"requesting_shift": shift_a.id, "reason": "Doctor's appointment"},
            format="json",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING"
        assert response.data["reason"] == "Doctor's appointment"

    def test_create_swap_request_non_scheduled_shift_fails(
        self,
        authenticated_client,
        shift_a,
        sample_facility,
    ):
        shift_a.status = "ACTIVE"
        shift_a.save()
        response = authenticated_client.post(
            "/api/scheduling/shift-swaps/",
            {"requesting_shift": shift_a.id},
            format="json",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_swap_requests(
        self,
        authenticated_client,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        response = authenticated_client.get(
            "/api/scheduling/shift-swaps/",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_accept_swap(
        self,
        authenticated_client_b,
        shift_a,
        shift_b,
        test_user,
        sample_facility,
        sample_organization,
        scheduling_settings,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        response = authenticated_client_b.post(
            f"/api/scheduling/shift-swaps/{swap.id}/accept/",
            {"offered_shift": shift_b.id},
            format="json",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACCEPTED"

    def test_reject_swap(
        self,
        authenticated_client_b,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        response = authenticated_client_b.post(
            f"/api/scheduling/shift-swaps/{swap.id}/reject/",
            {"reason": "Not available"},
            format="json",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REJECTED"

    def test_cancel_swap(
        self,
        authenticated_client,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        response = authenticated_client.post(
            f"/api/scheduling/shift-swaps/{swap.id}/cancel/",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_approve_swap_requires_permission(
        self,
        authenticated_client_b,
        shift_a,
        shift_b,
        test_user,
        second_user,
        sample_facility,
        sample_organization,
        scheduling_settings,
    ):
        """Non-manager should get 403 on approve."""
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        swap.accept(user=second_user, offered_shift=shift_b)
        response = authenticated_client_b.post(
            f"/api/scheduling/shift-swaps/{swap.id}/approve/",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_available_endpoint(
        self,
        authenticated_client_b,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Available endpoint should list open swap requests for other users."""
        ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        response = authenticated_client_b.get(
            "/api/scheduling/shift-swaps/available/",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_my_requests_endpoint(
        self,
        authenticated_client,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        response = authenticated_client.get(
            "/api/scheduling/shift-swaps/my-requests/",
            HTTP_X_FACILITY_ID=sample_facility.id,
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1


# =============================================================================
# Celery Task Tests
# =============================================================================


class TestExpireSwapTask:
    """Tests for the auto-expiry Celery task."""

    def test_expire_pending_swap_requests(
        self,
        db,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        from hmis.apps.scheduling.tasks import expire_pending_swap_requests

        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() - timedelta(hours=1),
            facility=sample_facility,
            organization=sample_organization,
        )
        result = expire_pending_swap_requests()
        assert result >= 1
        swap.refresh_from_db()
        assert swap.status == "EXPIRED"

    def test_does_not_expire_non_pending(
        self,
        db,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
    ):
        from hmis.apps.scheduling.tasks import expire_pending_swap_requests

        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            status="CANCELLED",
            expires_at=timezone.now() - timedelta(hours=1),
            facility=sample_facility,
            organization=sample_organization,
        )
        expire_pending_swap_requests()
        swap.refresh_from_db()
        assert swap.status == "CANCELLED"


# =============================================================================
# Signal / Event Tests
# =============================================================================


class TestShiftSwapEvents:
    """Tests for domain event publication on swap lifecycle."""

    def test_swap_creation_publishes_event(
        self,
        db,
        shift_a,
        test_user,
        sample_facility,
        sample_organization,
        mocker,
    ):
        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")
        ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        # Check that at least one call was the swap requested event
        call_args_list = mock_publish.call_args_list
        swap_calls = [c for c in call_args_list if "swap.requested" in str(c)]
        assert len(swap_calls) >= 1

    def test_swap_acceptance_publishes_event(
        self,
        db,
        shift_a,
        shift_b,
        test_user,
        second_user,
        sample_facility,
        sample_organization,
        scheduling_settings,
        mocker,
    ):
        swap = ShiftSwapRequest.objects.create(
            requesting_shift=shift_a,
            target_shift=shift_b,
            requester=test_user,
            expires_at=timezone.now() + timedelta(hours=48),
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")
        swap.accept(user=second_user, offered_shift=shift_b)
        call_args_list = mock_publish.call_args_list
        accepted_calls = [c for c in call_args_list if "swap.accepted" in str(c)]
        assert len(accepted_calls) >= 1
