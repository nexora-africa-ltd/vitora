"""
Tests for staff invitation, password reset, change-password, and
direct-creation credential flows.

Covers:
- StaffInvitation model lifecycle
- PasswordResetToken model lifecycle
- Invitation CRUD API (admin)
- Invitation accept (public)
- Password reset request / confirm (public)
- Change password (authenticated)
- Direct staff creation returns temp_password
- Login includes must_change_password flag
"""

import uuid
from datetime import timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import (
    Department,
    Organization,
    PasswordResetToken,
    Role,
    StaffInvitation,
    StaffProfile,
)
from tests.conftest import ensure_staff_profile

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def admin_user(db):
    """Create an admin (is_staff=True) user."""
    user = User.objects.create_user(
        username="adminuser",
        email="admin@example.com",
        password="adminpass123",
        is_staff=True,
    )
    return user


@pytest.fixture
def admin_client(admin_user, sample_organization, sample_facility):
    """Authenticated client with admin privileges."""
    client = APIClient()
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def regular_user(db):
    """Create a non-admin user with a staff profile."""
    user = User.objects.create_user(
        username="regularuser",
        email="regular@example.com",
        password="regularpass123",
    )
    return user


@pytest.fixture
def regular_client(regular_user, sample_organization, sample_facility):
    """Authenticated client without admin privileges."""
    client = APIClient()
    ensure_staff_profile(regular_user, sample_organization, sample_facility)
    client.force_authenticate(user=regular_user)
    return client


@pytest.fixture
def test_org(db):
    """Create a test organization."""
    return Organization.objects.create(
        name="Onboarding Test Hospital",
        slug="onboarding-test-hospital",
        is_active=True,
    )


@pytest.fixture
def test_department(db):
    """Create a test department."""
    return Department.objects.create(
        name="General Medicine",
        code="GM",
        department_type="CLINICAL",
        is_active=True,
    )


@pytest.fixture
def test_role(db):
    """Create a test role."""
    return Role.objects.create(
        name="Doctor",
        code="DOC",
        category="CLINICAL",
        is_active=True,
    )


@pytest.fixture
def invitation_data(test_org, test_role, test_department):
    """Valid invitation creation payload."""
    return {
        "email": "newhire@hospital.co.ke",
        "organization": test_org.id,
        "role": test_role.id,
        "department": test_department.id,
        "job_title": "General Practitioner",
        "expires_hours": 72,
    }


@pytest.fixture
def pending_invitation(db, admin_user, test_org, test_role, test_department):
    """Create a pending invitation."""
    inv = StaffInvitation(
        email="pending@hospital.co.ke",
        organization=test_org,
        role=test_role,
        department=test_department,
        invited_by=admin_user,
        expires_hours=72,
    )
    inv.save()
    return inv


# ============================================================================
# Model Tests
# ============================================================================


class TestStaffInvitationModel:
    """Tests for the StaffInvitation model."""

    def test_auto_generates_token_and_expiry(self, test_org):
        """Token and expires_at are auto-set on save."""
        inv = StaffInvitation(email="auto@test.com", organization=test_org)
        inv.save()
        assert inv.token is not None
        assert inv.expires_at is not None
        assert inv.status == StaffInvitation.InvitationStatus.PENDING

    def test_is_expired_after_expiry(self, test_org):
        """is_expired returns True when past expires_at."""
        inv = StaffInvitation(
            email="expired@test.com",
            organization=test_org,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        inv.save()
        assert inv.is_expired is True
        assert inv.is_usable is False

    def test_is_usable_when_pending_and_not_expired(self, pending_invitation):
        """A pending, non-expired invitation is usable."""
        assert pending_invitation.is_usable is True

    def test_revoke_changes_status(self, pending_invitation):
        """Revoking sets status to REVOKED."""
        pending_invitation.revoke()
        assert pending_invitation.status == StaffInvitation.InvitationStatus.REVOKED
        assert pending_invitation.is_usable is False

    def test_mark_accepted(self, pending_invitation, regular_user):
        """mark_accepted sets status, user, and timestamp."""
        pending_invitation.mark_accepted(regular_user)
        assert pending_invitation.status == StaffInvitation.InvitationStatus.ACCEPTED
        assert pending_invitation.accepted_user == regular_user
        assert pending_invitation.accepted_at is not None

    def test_expires_hours_capped_at_720(self, test_org):
        """Expiry cannot exceed 30 days (720 hours)."""
        inv = StaffInvitation(
            email="long@test.com",
            organization=test_org,
            expires_hours=1000,
        )
        inv.save()
        # Should be capped at 720 hours from now
        max_delta = timedelta(hours=721)
        assert inv.expires_at - timezone.now() < max_delta


class TestPasswordResetTokenModel:
    """Tests for the PasswordResetToken model."""

    def test_auto_generates_token_and_expiry(self, regular_user):
        """Token and expires_at are auto-set on save."""
        token = PasswordResetToken(user=regular_user)
        token.save()
        assert token.token is not None
        assert token.expires_at is not None
        assert token.used is False

    def test_is_valid_when_fresh(self, regular_user):
        """Freshly created token is valid."""
        token = PasswordResetToken(user=regular_user)
        token.save()
        assert token.is_valid is True

    def test_not_valid_after_consume(self, regular_user):
        """Consumed token is no longer valid."""
        token = PasswordResetToken(user=regular_user)
        token.save()
        token.consume()
        assert token.is_valid is False
        assert token.used is True
        assert token.used_at is not None

    def test_not_valid_after_expiry(self, regular_user):
        """Expired token is not valid."""
        token = PasswordResetToken(
            user=regular_user,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        token.save()
        assert token.is_valid is False


# ============================================================================
# Invitation API Tests
# ============================================================================


class TestInvitationCreate:
    """Tests for POST /api/core/invitations/ (admin only)."""

    def test_admin_can_create_invitation(self, admin_client, invitation_data):
        """Admins can create invitations and get 201."""
        response = admin_client.post("/api/core/invitations/", invitation_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["email"] == invitation_data["email"]
        assert response.data["status"] == "PENDING"
        assert response.data["token"] is not None

    def test_non_admin_cannot_create_invitation(self, regular_client, invitation_data):
        """Non-admins get 403 when trying to create invitations."""
        response = regular_client.post("/api/core/invitations/", invitation_data)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_cannot_create_invitation(self, invitation_data):
        """Unauthenticated requests are rejected."""
        client = APIClient()
        response = client.post("/api/core/invitations/", invitation_data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_duplicate_pending_email_rejected(
        self, admin_client, invitation_data, pending_invitation
    ):
        """Cannot create a second pending invitation for the same email."""
        invitation_data["email"] = pending_invitation.email
        response = admin_client.post("/api/core/invitations/", invitation_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_existing_user_email_rejected(self, admin_client, invitation_data, regular_user):
        """Cannot invite an email that already has a user account."""
        invitation_data["email"] = regular_user.email
        response = admin_client.post("/api/core/invitations/", invitation_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_custom_expiry_hours(self, admin_client, invitation_data):
        """Custom expires_hours is respected."""
        invitation_data["expires_hours"] = 168  # 7 days
        response = admin_client.post("/api/core/invitations/", invitation_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["expires_hours"] == 168

    def test_max_expiry_capped(self, admin_client, invitation_data):
        """Expiry hours > 720 is rejected by serializer."""
        invitation_data["expires_hours"] = 1000
        response = admin_client.post("/api/core/invitations/", invitation_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestInvitationResend:
    """Tests for POST /api/core/invitations/{id}/resend/."""

    def test_admin_can_resend(self, admin_client, pending_invitation):
        """Resending resets expiry and increments send_count."""
        old_expires = pending_invitation.expires_at
        old_count = pending_invitation.send_count
        response = admin_client.post(f"/api/core/invitations/{pending_invitation.id}/resend/")
        assert response.status_code == status.HTTP_200_OK
        pending_invitation.refresh_from_db()
        assert pending_invitation.send_count == old_count + 1
        assert pending_invitation.expires_at > old_expires

    def test_cannot_resend_revoked(self, admin_client, pending_invitation):
        """Cannot resend a revoked invitation."""
        pending_invitation.revoke()
        response = admin_client.post(f"/api/core/invitations/{pending_invitation.id}/resend/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestInvitationRevoke:
    """Tests for POST /api/core/invitations/{id}/revoke/."""

    def test_admin_can_revoke(self, admin_client, pending_invitation):
        """Revoking changes status to REVOKED."""
        response = admin_client.post(f"/api/core/invitations/{pending_invitation.id}/revoke/")
        assert response.status_code == status.HTTP_200_OK
        pending_invitation.refresh_from_db()
        assert pending_invitation.status == StaffInvitation.InvitationStatus.REVOKED


# ============================================================================
# Invitation Accept Tests (Public)
# ============================================================================


class TestInvitationAccept:
    """Tests for POST /api/core/invitations/accept/."""

    def test_accept_creates_user_and_profile(self, pending_invitation, test_role, test_department):
        """Accepting creates User + StaffProfile with pre-configured role/dept."""
        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept/",
            {
                "token": str(pending_invitation.token),
                "username": "newhire",
                "password": "SecurePass123!",
                "confirm_password": "SecurePass123!",
                "first_name": "New",
                "last_name": "Hire",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["username"] == "newhire"

        # Verify user was created
        user = User.objects.get(username="newhire")
        assert user.email == pending_invitation.email
        assert user.check_password("SecurePass123!")

        # Verify staff profile
        profile = user.staff_profile
        assert profile.primary_role == test_role
        assert profile.primary_department == test_department
        assert profile.must_change_password is False  # User set their own password

        # Verify invitation marked as accepted
        pending_invitation.refresh_from_db()
        assert pending_invitation.status == StaffInvitation.InvitationStatus.ACCEPTED
        assert pending_invitation.accepted_user == user

    def test_accept_with_invalid_token(self):
        """Invalid token returns 404."""
        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept/",
            {
                "token": str(uuid.uuid4()),
                "username": "nobody",
                "password": "SecurePass123!",
                "confirm_password": "SecurePass123!",
                "first_name": "No",
                "last_name": "Body",
            },
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_accept_expired_invitation(self, test_org):
        """Expired invitation returns 400."""
        inv = StaffInvitation(
            email="expired@test.com",
            organization=test_org,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        inv.save()

        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept/",
            {
                "token": str(inv.token),
                "username": "expired_user",
                "password": "SecurePass123!",
                "confirm_password": "SecurePass123!",
                "first_name": "Expired",
                "last_name": "User",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_accept_password_mismatch_rejected(self, pending_invitation):
        """Mismatched passwords are rejected."""
        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept/",
            {
                "token": str(pending_invitation.token),
                "username": "mismatch",
                "password": "SecurePass123!",
                "confirm_password": "DifferentPass!",
                "first_name": "Mis",
                "last_name": "Match",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_accept_duplicate_username_rejected(self, pending_invitation, regular_user):
        """Cannot accept with an already-taken username."""
        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept/",
            {
                "token": str(pending_invitation.token),
                "username": regular_user.username,
                "password": "SecurePass123!",
                "confirm_password": "SecurePass123!",
                "first_name": "Dup",
                "last_name": "User",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestInvitationLookup:
    """Tests for GET /api/core/invitations/{token}/ (public)."""

    def test_lookup_returns_public_info(self, pending_invitation):
        """Public lookup returns org/role/department names."""
        client = APIClient()
        response = client.get(f"/api/core/invitations/{pending_invitation.token}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["organization_name"] == pending_invitation.organization.name
        assert response.data["is_usable"] is True

    def test_lookup_invalid_token_returns_404(self):
        """Invalid token returns 404."""
        client = APIClient()
        response = client.get(f"/api/core/invitations/{uuid.uuid4()}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# Password Reset Tests
# ============================================================================


class TestPasswordResetRequest:
    """Tests for POST /api/core/auth/password-reset/request/."""

    def test_request_with_valid_email(self, regular_user):
        """Returns 200 and creates a token for valid email."""
        client = APIClient()
        response = client.post(
            "/api/core/auth/password-reset/request/",
            {"email": regular_user.email},
        )
        assert response.status_code == status.HTTP_200_OK
        assert PasswordResetToken.objects.filter(user=regular_user).exists()

    def test_request_with_unknown_email_still_200(self):
        """Returns 200 for unknown email (prevents enumeration)."""
        client = APIClient()
        response = client.post(
            "/api/core/auth/password-reset/request/",
            {"email": "nonexistent@example.com"},
        )
        assert response.status_code == status.HTTP_200_OK


class TestPasswordResetConfirm:
    """Tests for POST /api/core/auth/password-reset/confirm/."""

    def test_confirm_resets_password(self, regular_user):
        """Valid token resets the user's password."""
        token = PasswordResetToken(user=regular_user)
        token.save()

        client = APIClient()
        response = client.post(
            "/api/core/auth/password-reset/confirm/",
            {
                "token": str(token.token),
                "new_password": "NewSecurePass!456",
                "confirm_password": "NewSecurePass!456",
            },
        )
        assert response.status_code == status.HTTP_200_OK

        regular_user.refresh_from_db()
        assert regular_user.check_password("NewSecurePass!456")

        token.refresh_from_db()
        assert token.used is True

    def test_confirm_with_invalid_token(self):
        """Invalid token returns 400."""
        client = APIClient()
        response = client.post(
            "/api/core/auth/password-reset/confirm/",
            {
                "token": str(uuid.uuid4()),
                "new_password": "NewSecurePass!456",
                "confirm_password": "NewSecurePass!456",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirm_with_used_token(self, regular_user):
        """Used token returns 400."""
        token = PasswordResetToken(user=regular_user)
        token.save()
        token.consume()

        client = APIClient()
        response = client.post(
            "/api/core/auth/password-reset/confirm/",
            {
                "token": str(token.token),
                "new_password": "NewSecurePass!456",
                "confirm_password": "NewSecurePass!456",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirm_password_mismatch(self, regular_user):
        """Mismatched passwords are rejected."""
        token = PasswordResetToken(user=regular_user)
        token.save()

        client = APIClient()
        response = client.post(
            "/api/core/auth/password-reset/confirm/",
            {
                "token": str(token.token),
                "new_password": "NewSecurePass!456",
                "confirm_password": "DifferentPass!",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# Change Password Tests
# ============================================================================


class TestChangePassword:
    """Tests for POST /api/core/auth/change-password/."""

    def test_change_password_with_correct_current(self, regular_client, regular_user):
        """Normal password change with correct current password."""
        response = regular_client.post(
            "/api/core/auth/change-password/",
            {
                "current_password": "regularpass123",
                "new_password": "UpdatedPass!789",
                "confirm_password": "UpdatedPass!789",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.check_password("UpdatedPass!789")

    def test_change_password_wrong_current_rejected(self, regular_client):
        """Wrong current password is rejected."""
        response = regular_client.post(
            "/api/core/auth/change-password/",
            {
                "current_password": "wrongpassword",
                "new_password": "UpdatedPass!789",
                "confirm_password": "UpdatedPass!789",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_forced_change_skips_current_password(self, db, test_org, test_role, test_department):
        """must_change_password=True allows change without current_password."""
        user = User.objects.create_user(
            username="forceduser", email="forced@test.com", password="temppass123"
        )
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-FORCED-001",
            primary_role=test_role,
            primary_department=test_department,
            must_change_password=True,
            date_joined="2026-01-01",
        )

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post(
            "/api/core/auth/change-password/",
            {
                "new_password": "PermanentPass!456",
                "confirm_password": "PermanentPass!456",
            },
        )
        assert response.status_code == status.HTTP_200_OK

        user.refresh_from_db()
        assert user.check_password("PermanentPass!456")
        assert user.staff_profile.must_change_password is False

    def test_change_password_unauthenticated(self):
        """Unauthenticated users cannot change passwords."""
        client = APIClient()
        response = client.post(
            "/api/core/auth/change-password/",
            {
                "new_password": "SomePass!123",
                "confirm_password": "SomePass!123",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Direct Staff Creation - Credential Return Tests
# ============================================================================


class TestDirectStaffCreationCredentials:
    """Tests for POST /api/staff/ returning temp_password."""

    def test_create_staff_returns_temp_password(
        self, admin_client, test_role, test_department, sample_county, sample_sub_county
    ):
        """Direct staff creation returns temp_password in response."""
        response = admin_client.post(
            "/api/staff/",
            {
                "username": "newdoctor",
                "email": "newdoctor@hospital.co.ke",
                "first_name": "New",
                "last_name": "Doctor",
                "employee_id": "VH-2026-NEW",
                "role": test_role.id,
                "department": test_department.id,
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "temp_password" in response.data
        assert len(response.data["temp_password"]) > 0

        # Verify the user can log in with the temp password
        user = User.objects.get(username="newdoctor")
        assert user.check_password(response.data["temp_password"])

        # Verify must_change_password is set
        assert user.staff_profile.must_change_password is True


# ============================================================================
# Login - must_change_password Flag Tests
# ============================================================================


class TestLoginMustChangePassword:
    """Tests that login response includes must_change_password."""

    def test_login_with_must_change_password(self, db, test_role, test_department):
        """Login response includes must_change_password=True when flag is set."""
        user = User.objects.create_user(
            username="mustchange",
            email="mustchange@test.com",
            password="TempPass123!",
        )
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-MUST-001",
            primary_role=test_role,
            primary_department=test_department,
            must_change_password=True,
            date_joined="2026-01-01",
        )

        client = APIClient()
        response = client.post(
            "/api/token/",
            {"username": "mustchange", "password": "TempPass123!"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["must_change_password"] is True

    def test_login_without_must_change_password(self, db, test_role, test_department):
        """Login response includes must_change_password=False normally."""
        user = User.objects.create_user(
            username="normallogin",
            email="normallogin@test.com",
            password="NormalPass123!",
        )
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-NORM-001",
            primary_role=test_role,
            primary_department=test_department,
            must_change_password=False,
            date_joined="2026-01-01",
        )

        client = APIClient()
        response = client.post(
            "/api/token/",
            {"username": "normallogin", "password": "NormalPass123!"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["must_change_password"] is False
