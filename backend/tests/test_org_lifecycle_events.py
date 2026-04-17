"""
Tests for Organization lifecycle domain events.

Verifies that domain events are published for:
- Organization signup (ORG_SIGNUP)
- Email verification (ORG_EMAIL_VERIFIED)
- Organization activation (ORG_ACTIVATED)
- Organization deactivation (ORG_DEACTIVATED)
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.events.types import OrganizationEvents
from hmis.apps.core.models import EmailVerificationToken, Organization

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def anon_client(db):
    """Unauthenticated API client."""
    return APIClient()


@pytest.fixture
def signup_data():
    """Valid org signup payload."""
    return {
        "org_name": "Event Test Clinic",
        "admin_email": "eventadmin@test.co.ke",
        "admin_first_name": "Alice",
        "admin_last_name": "Mwangi",
        "admin_password": "StrongPass123!",
        "confirm_password": "StrongPass123!",
    }


# ============================================================================
# Signup Event Tests
# ============================================================================


@pytest.mark.django_db
class TestOrgSignupEvent:
    """Tests that org signup publishes ORG_SIGNUP domain event."""

    def test_signup_publishes_org_signup_event(self, anon_client, signup_data, mocker):
        mock_publish = mocker.patch("hmis.apps.core.events.publish_event")

        response = anon_client.post("/api/core/auth/signup/", signup_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        mock_publish.assert_called_once()
        call_kwargs = mock_publish.call_args
        assert call_kwargs.kwargs["event_type"] == OrganizationEvents.ORG_SIGNUP
        assert call_kwargs.kwargs["aggregate_type"] == "Organization"
        assert call_kwargs.kwargs["payload"]["org_name"] == "Event Test Clinic"
        assert call_kwargs.kwargs["payload"]["admin_email"] == "eventadmin@test.co.ke"

    def test_signup_event_includes_slug(self, anon_client, signup_data, mocker):
        mock_publish = mocker.patch("hmis.apps.core.events.publish_event")

        anon_client.post("/api/core/auth/signup/", signup_data, format="json")

        payload = mock_publish.call_args.kwargs["payload"]
        assert "slug" in payload
        assert payload["slug"].startswith("event-test-clinic")


# ============================================================================
# Email Verification Event Tests
# ============================================================================


@pytest.mark.django_db
class TestEmailVerificationEvent:
    """Tests that email verification publishes ORG_EMAIL_VERIFIED domain event."""

    def test_verify_publishes_email_verified_event(self, anon_client, mocker):
        user = User.objects.create_user(username="verifyevt", email="v@evt.com", password="pass123")
        org = Organization.objects.create(
            name="Verify Evt Org",
            slug="verify-evt-org",
            is_active=False,
            is_verified=False,
        )
        token = EmailVerificationToken.objects.create(user=user, organization=org)

        mock_publish = mocker.patch("hmis.apps.core.events.publish_event")
        mock_pending = mocker.patch(
            "hmis.apps.core.services.email_service.send_org_pending_review_email"
        )

        response = anon_client.post(
            "/api/core/auth/verify-email/",
            {"token": str(token.token)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        mock_publish.assert_called_once()
        call_kwargs = mock_publish.call_args
        assert call_kwargs.kwargs["event_type"] == OrganizationEvents.ORG_EMAIL_VERIFIED
        assert call_kwargs.kwargs["aggregate_type"] == "Organization"
        assert call_kwargs.kwargs["payload"]["org_name"] == "Verify Evt Org"

    def test_verify_event_includes_admin_details(self, anon_client, mocker):
        user = User.objects.create_user(
            username="detailevt",
            email="detail@evt.com",
            password="pass123",
            first_name="Bob",
            last_name="Kimani",
        )
        org = Organization.objects.create(name="Detail Evt Org", slug="detail-evt-org")
        token = EmailVerificationToken.objects.create(user=user, organization=org)

        mock_publish = mocker.patch("hmis.apps.core.events.publish_event")
        mocker.patch("hmis.apps.core.services.email_service.send_org_pending_review_email")

        anon_client.post(
            "/api/core/auth/verify-email/",
            {"token": str(token.token)},
            format="json",
        )

        payload = mock_publish.call_args.kwargs["payload"]
        assert payload["admin_email"] == "detail@evt.com"
        assert "Bob" in payload["admin_name"]

    def test_verify_sends_pending_review_email_to_user(self, anon_client, mocker):
        """After email verification, user receives a pending-review notification."""
        user = User.objects.create_user(
            username="pendinguser",
            email="pending@evt.com",
            password="pass123",
            first_name="Grace",
            last_name="Wanjiku",
        )
        org = Organization.objects.create(
            name="Pending Review Org",
            slug="pending-review-org",
            is_active=False,
            is_verified=False,
        )
        token = EmailVerificationToken.objects.create(user=user, organization=org)

        mocker.patch("hmis.apps.core.events.publish_event")
        mock_pending = mocker.patch(
            "hmis.apps.core.services.email_service.send_org_pending_review_email"
        )

        response = anon_client.post(
            "/api/core/auth/verify-email/",
            {"token": str(token.token)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        mock_pending.assert_called_once_with(
            to_email="pending@evt.com",
            org_name="Pending Review Org",
            admin_name="Grace Wanjiku",
        )


# ============================================================================
# Organization Activation/Deactivation Signal Event Tests
# ============================================================================


@pytest.mark.django_db
class TestOrgActivationEvents:
    """Tests that Organization.is_active changes publish domain events via signals."""

    def test_activation_publishes_org_activated_event(self, mocker):
        mock_publish = mocker.patch("hmis.apps.core.signals.publish_event")
        mocker.patch("hmis.apps.core.services.email_service.send_org_activated_email")

        org = Organization.objects.create(
            name="Activate Org",
            slug="activate-org",
            is_active=False,
            is_verified=True,
        )
        mock_publish.reset_mock()

        # Activate the org
        org.is_active = True
        org.save(update_fields=["is_active"])

        mock_publish.assert_called_once()
        call_kwargs = mock_publish.call_args
        assert call_kwargs.kwargs["event_type"] == OrganizationEvents.ORG_ACTIVATED
        assert call_kwargs.kwargs["aggregate_type"] == "Organization"
        assert call_kwargs.kwargs["payload"]["org_name"] == "Activate Org"
        assert call_kwargs.kwargs["payload"]["is_active"] is True

    def test_deactivation_publishes_org_deactivated_event(self, mocker):
        mock_publish = mocker.patch("hmis.apps.core.signals.publish_event")
        mocker.patch("hmis.apps.core.services.email_service.send_org_activated_email")

        org = Organization.objects.create(
            name="Deactivate Org",
            slug="deactivate-org",
            is_active=True,
            is_verified=True,
        )
        mock_publish.reset_mock()

        # Deactivate the org
        org.is_active = False
        org.save(update_fields=["is_active"])

        mock_publish.assert_called_once()
        call_kwargs = mock_publish.call_args
        assert call_kwargs.kwargs["event_type"] == OrganizationEvents.ORG_DEACTIVATED
        assert call_kwargs.kwargs["payload"]["is_active"] is False

    def test_no_event_when_is_active_unchanged(self, mocker):
        mock_publish = mocker.patch("hmis.apps.core.signals.publish_event")

        org = Organization.objects.create(
            name="No Change Org",
            slug="no-change-org",
            is_active=True,
        )
        mock_publish.reset_mock()

        # Save without changing is_active
        org.name = "No Change Org Updated"
        org.save()

        mock_publish.assert_not_called()

    def test_no_event_on_org_creation(self, mocker):
        """Creating an org should NOT trigger the activation signal event."""
        mock_publish = mocker.patch("hmis.apps.core.signals.publish_event")

        Organization.objects.create(
            name="New Org",
            slug="new-org",
            is_active=False,
        )

        # The signal should NOT publish for creation (signup event handles that)
        mock_publish.assert_not_called()

    def test_activation_sends_email_to_org_admin(self, mocker):
        """Activating an org sends an activation email to the org's admin user."""
        mocker.patch("hmis.apps.core.signals.publish_event")
        mock_email = mocker.patch("hmis.apps.core.services.email_service.send_org_activated_email")

        org = Organization.objects.create(
            name="Email Org",
            slug="email-org",
            is_active=False,
            is_verified=True,
        )
        user = User.objects.create_user(
            username="orgadmin",
            email="orgadmin@test.co.ke",
            password="pass123",
            first_name="Mary",
            last_name="Akinyi",
        )
        from datetime import date

        from hmis.apps.core.models import Department, Role, StaffProfile

        dept = Department.objects.create(name="Admin Dept", code="ADMINEML")
        role, _ = Role.objects.get_or_create(
            code="ORG-ADMIN", defaults={"name": "Org Admin", "is_active": True}
        )
        StaffProfile.objects.create(
            user=user,
            employee_id="ADMIN-0099",
            organization=org,
            primary_department=dept,
            primary_role=role,
            date_joined=date.today(),
        )

        # Activate the org
        org.is_active = True
        org.save(update_fields=["is_active"])

        mock_email.assert_called_once_with(
            to_email="orgadmin@test.co.ke",
            org_name="Email Org",
            admin_name="Mary Akinyi",
        )

    def test_deactivation_does_not_send_activation_email(self, mocker):
        """Deactivating an org should NOT send an activation email."""
        mocker.patch("hmis.apps.core.signals.publish_event")
        mock_email = mocker.patch("hmis.apps.core.services.email_service.send_org_activated_email")

        org = Organization.objects.create(
            name="Deact Email Org",
            slug="deact-email-org",
            is_active=True,
            is_verified=True,
        )
        mock_email.reset_mock()

        org.is_active = False
        org.save(update_fields=["is_active"])

        mock_email.assert_not_called()
