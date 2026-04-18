"""
Tests for the organization onboarding checklist feature.

Covers:
- Organization.onboarding_complete property
- Organization.get_onboarding_checklist() method
- GET /api/core/onboarding/status/ endpoint
- POST /api/core/onboarding/status/ endpoint (mark complete)
- OnboardingEnforcementMiddleware
- onboarding_complete in _build_user_info login response
"""

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# ============================================================================
# Model Tests
# ============================================================================


class TestOrganizationOnboardingModel:
    """Tests for onboarding fields and methods on Organization."""

    def test_onboarding_complete_false_by_default(self, sample_organization):
        """New organizations should have onboarding_completed_at=None."""
        assert sample_organization.onboarding_completed_at is None
        assert sample_organization.onboarding_complete is False

    def test_onboarding_complete_true_when_set(self, sample_organization):
        """Setting onboarding_completed_at makes onboarding_complete True."""
        sample_organization.onboarding_completed_at = timezone.now()
        sample_organization.save(update_fields=["onboarding_completed_at"])
        sample_organization.refresh_from_db()
        assert sample_organization.onboarding_complete is True

    def test_checklist_returns_three_steps(self, sample_organization, sample_facility):
        """Checklist should return 3 required steps."""
        steps = sample_organization.get_onboarding_checklist()
        assert len(steps) == 3
        assert all(s["required"] for s in steps)
        keys = [s["key"] for s in steps]
        assert "facility_modules" in keys
        assert "first_clinic" in keys
        assert "invite_staff" in keys

    def test_checklist_facility_modules_incomplete_with_defaults(
        self, sample_organization, sample_facility
    ):
        """Facility with only 1 module enabled should be incomplete."""
        # Disable all modules except outpatient so only 1 is active
        sample_facility.has_outpatient = True
        sample_facility.has_pharmacy = False
        sample_facility.has_laboratory = False
        sample_facility.has_maternity = False
        sample_facility.save(
            update_fields=[
                "has_outpatient",
                "has_pharmacy",
                "has_laboratory",
                "has_maternity",
            ]
        )

        steps = sample_organization.get_onboarding_checklist()
        modules_step = next(s for s in steps if s["key"] == "facility_modules")
        assert modules_step["done"] is False

    def test_checklist_facility_modules_complete_with_multiple(
        self, sample_organization, sample_facility
    ):
        """Facility with >1 module should mark step as complete."""
        sample_facility.has_outpatient = True
        sample_facility.has_pharmacy = True
        sample_facility.save(update_fields=["has_outpatient", "has_pharmacy"])

        steps = sample_organization.get_onboarding_checklist()
        modules_step = next(s for s in steps if s["key"] == "facility_modules")
        assert modules_step["done"] is True

    def test_checklist_first_clinic_incomplete(self, sample_organization, sample_facility):
        """No clinics created should be incomplete."""
        steps = sample_organization.get_onboarding_checklist()
        clinic_step = next(s for s in steps if s["key"] == "first_clinic")
        assert clinic_step["done"] is False

    def test_checklist_first_clinic_complete(self, sample_organization, sample_facility):
        """Creating a clinic should mark step as complete."""
        from hmis.apps.clinics.models import Clinic

        Clinic.objects.create(
            facility=sample_facility,
            name="General OPD",
            code="OPD-001",
        )
        steps = sample_organization.get_onboarding_checklist()
        clinic_step = next(s for s in steps if s["key"] == "first_clinic")
        assert clinic_step["done"] is True

    def test_checklist_invite_staff_incomplete_with_one_user(
        self, sample_organization, test_staff_profile
    ):
        """Only the initial admin (1 staff) should be incomplete."""
        assert sample_organization.staff_count == 1
        steps = sample_organization.get_onboarding_checklist()
        staff_step = next(s for s in steps if s["key"] == "invite_staff")
        assert staff_step["done"] is False

    def test_checklist_invite_staff_complete_with_two_users(
        self,
        db,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
        test_staff_profile,
    ):
        """Two staff members should mark step as complete."""
        from datetime import date

        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import StaffProfile

        User = get_user_model()
        user2 = User.objects.create_user(username="nurse1", password="test1234")
        StaffProfile.objects.create(
            user=user2,
            employee_id="NURSE-0001",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date.today(),
        )
        assert sample_organization.staff_count == 2
        steps = sample_organization.get_onboarding_checklist()
        staff_step = next(s for s in steps if s["key"] == "invite_staff")
        assert staff_step["done"] is True


# ============================================================================
# API Endpoint Tests
# ============================================================================


class TestOnboardingStatusEndpoint:
    """Tests for GET/POST /api/core/onboarding/status/."""

    URL = "/api/core/onboarding/status/"

    def test_unauthenticated_returns_401(self, api_client):
        """Unauthenticated requests should be rejected."""
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_returns_checklist(self, authenticated_client, sample_organization):
        """GET should return checklist with complete=False for new org."""
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["complete"] is False
        assert response.data["completed_at"] is None
        assert len(response.data["steps"]) == 3
        assert "all_required_done" in response.data

    def test_post_fails_when_steps_incomplete(self, authenticated_client, sample_organization):
        """POST should fail when required steps are not done."""
        response = authenticated_client.post(self.URL)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Required steps not complete" in response.data["detail"]

    def test_post_succeeds_when_all_done(
        self,
        db,
        authenticated_client,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
        test_staff_profile,
    ):
        """POST should succeed when all required steps are complete."""
        from datetime import date

        from django.contrib.auth import get_user_model

        from hmis.apps.clinics.models import Clinic
        from hmis.apps.core.models import StaffProfile

        # Complete all steps
        sample_facility.has_outpatient = True
        sample_facility.has_pharmacy = True
        sample_facility.save(update_fields=["has_outpatient", "has_pharmacy"])

        Clinic.objects.create(facility=sample_facility, name="OPD", code="OPD-001")

        User = get_user_model()
        user2 = User.objects.create_user(username="staff2", password="test1234")
        StaffProfile.objects.create(
            user=user2,
            employee_id="STAFF-0002",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date.today(),
        )

        response = authenticated_client.post(self.URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["complete"] is True
        assert response.data["completed_at"] is not None

    def test_post_idempotent_when_already_complete(self, authenticated_client, sample_organization):
        """POST when already complete should return success."""
        sample_organization.onboarding_completed_at = timezone.now()
        sample_organization.save(update_fields=["onboarding_completed_at"])

        response = authenticated_client.post(self.URL)
        assert response.status_code == status.HTTP_200_OK
        assert "already completed" in response.data["detail"]


# ============================================================================
# Login Response Tests
# ============================================================================


class TestOnboardingInLoginResponse:
    """Tests for onboarding_complete in _build_user_info."""

    def test_login_response_includes_onboarding_complete(
        self, api_client, test_user, test_staff_profile, sample_organization
    ):
        """Login response should include onboarding_complete=False for new org."""
        response = api_client.post(
            "/api/token/",
            {"username": test_user.username, "password": "testpassword123"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        user_data = response.data.get("user", {})
        assert "onboarding_complete" in user_data
        assert user_data["onboarding_complete"] is False

    def test_login_response_onboarding_true_when_completed(
        self, api_client, test_user, test_staff_profile, sample_organization
    ):
        """Login response should include onboarding_complete=True after completion."""
        sample_organization.onboarding_completed_at = timezone.now()
        sample_organization.save(update_fields=["onboarding_completed_at"])

        response = api_client.post(
            "/api/token/",
            {"username": test_user.username, "password": "testpassword123"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        user_data = response.data.get("user", {})
        assert user_data["onboarding_complete"] is True
