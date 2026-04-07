"""
Tests for Multi-Factor Authentication (MFA) functionality.

DHA Compliance: P0 REQUIRED
- TOTP enrollment flow (QR code + backup codes)
- MFA requirement for sensitive roles (ADMIN, CLINICAL_SENIOR, MANAGEMENT)
- Backup code support

TDD: These tests are written FIRST, before implementation.
"""

import base64
import re

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status

User = get_user_model()


# ============================================================================
# MFA Model Tests
# ============================================================================


class TestMFADeviceModel:
    """Tests for TOTP device functionality."""

    def test_create_totp_device_for_user(self, db, test_user):
        """Should create a TOTP device for a user."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Primary Device",
        )

        assert device.id is not None
        assert device.user == test_user
        assert device.name == "Primary Device"
        assert device.confirmed is False  # Not confirmed until verified
        assert device.secret_key is not None  # Should auto-generate

    def test_totp_device_generates_valid_secret(self, db, test_user):
        """Should generate a valid base32-encoded secret key."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Test Device",
        )

        # Secret should be base32 encoded (uppercase letters A-Z and digits 2-7)
        assert re.match(r"^[A-Z2-7]+$", device.secret_key)
        assert len(device.secret_key) >= 16  # Minimum recommended length

    def test_totp_device_verify_valid_token(self, db, test_user):
        """Should verify a valid TOTP token."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Test Device",
        )

        # Generate a valid token
        token = device.generate_token()

        # Should verify successfully
        assert device.verify_token(token) is True

    def test_totp_device_reject_invalid_token(self, db, test_user):
        """Should reject an invalid TOTP token."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Test Device",
        )

        # Should reject invalid tokens
        assert device.verify_token("000000") is False
        assert device.verify_token("123456") is False
        assert device.verify_token("invalid") is False

    def test_totp_device_generates_qr_uri(self, db, test_user):
        """Should generate a valid otpauth:// URI for QR codes."""
        from urllib.parse import unquote

        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Test Device",
        )

        uri = device.get_provisioning_uri()
        decoded_uri = unquote(uri)  # Decode percent-encoded URL

        assert uri.startswith("otpauth://totp/")
        assert "Vitora HMIS" in decoded_uri or "Vitora" in decoded_uri
        assert test_user.username in decoded_uri or test_user.email in decoded_uri
        assert f"secret={device.secret_key}" in uri

    def test_user_can_have_multiple_devices(self, db, test_user):
        """Should allow user to have multiple TOTP devices."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device1 = UserTOTPDevice.objects.create(user=test_user, name="Phone")
        device2 = UserTOTPDevice.objects.create(user=test_user, name="Tablet")

        assert UserTOTPDevice.objects.filter(user=test_user).count() == 2
        assert device1.secret_key != device2.secret_key


class TestBackupCodeModel:
    """Tests for backup code functionality."""

    def test_generate_backup_codes(self, db, test_user):
        """Should generate backup codes for a user."""
        from hmis.apps.core.mfa.models import BackupCode

        codes = BackupCode.generate_codes(user=test_user, count=10)

        assert len(codes) == 10
        assert BackupCode.objects.filter(user=test_user).count() == 10

    def test_backup_code_format(self, db, test_user):
        """Should generate codes in expected format (8 alphanumeric chars)."""
        from hmis.apps.core.mfa.models import BackupCode

        codes = BackupCode.generate_codes(user=test_user, count=5)

        for code in codes:
            # Should be 8 characters, alphanumeric
            assert len(code) == 8
            assert code.isalnum()

    def test_backup_code_verify_and_consume(self, db, test_user):
        """Should verify and consume a backup code (single use)."""
        from hmis.apps.core.mfa.models import BackupCode

        codes = BackupCode.generate_codes(user=test_user, count=5)
        code_to_use = codes[0]

        # Should verify successfully
        assert BackupCode.verify_code(user=test_user, code=code_to_use) is True

        # Should be consumed (can't use again)
        assert BackupCode.verify_code(user=test_user, code=code_to_use) is False

        # Other codes should still work
        assert BackupCode.verify_code(user=test_user, code=codes[1]) is True

    def test_backup_code_reject_invalid(self, db, test_user):
        """Should reject invalid backup codes."""
        from hmis.apps.core.mfa.models import BackupCode

        BackupCode.generate_codes(user=test_user, count=5)

        assert BackupCode.verify_code(user=test_user, code="INVALID1") is False
        assert BackupCode.verify_code(user=test_user, code="12345678") is False

    def test_regenerate_backup_codes_invalidates_old(self, db, test_user):
        """Should invalidate old codes when regenerating."""
        from hmis.apps.core.mfa.models import BackupCode

        old_codes = BackupCode.generate_codes(user=test_user, count=5)
        new_codes = BackupCode.generate_codes(user=test_user, count=5)

        # Old codes should not work
        for code in old_codes:
            assert BackupCode.verify_code(user=test_user, code=code) is False

        # New codes should work
        assert BackupCode.verify_code(user=test_user, code=new_codes[0]) is True


class TestMFASettingsModel:
    """Tests for user MFA settings."""

    def test_mfa_not_enabled_by_default(self, db, test_user):
        """MFA should not be enabled by default for users."""
        from hmis.apps.core.mfa.utils import is_mfa_enabled

        assert is_mfa_enabled(test_user) is False

    def test_mfa_enabled_when_device_confirmed(self, db, test_user):
        """MFA should be enabled when user has a confirmed device."""
        from hmis.apps.core.mfa.models import UserTOTPDevice
        from hmis.apps.core.mfa.utils import is_mfa_enabled

        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Phone",
            confirmed=True,
        )

        assert is_mfa_enabled(test_user) is True

    def test_mfa_disabled_when_no_confirmed_device(self, db, test_user):
        """MFA should be disabled if device exists but not confirmed."""
        from hmis.apps.core.mfa.models import UserTOTPDevice
        from hmis.apps.core.mfa.utils import is_mfa_enabled

        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Phone",
            confirmed=False,
        )

        assert is_mfa_enabled(test_user) is False


# ============================================================================
# MFA API Tests - Status & Setup
# ============================================================================


class TestMFAStatusAPI:
    """Tests for MFA status endpoint."""

    def test_get_mfa_status_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/mfa/status/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_mfa_status_not_enabled(self, authenticated_client, test_user):
        """Should return MFA not enabled for new user."""
        response = authenticated_client.get("/api/mfa/status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mfa_enabled"] is False
        assert response.data["mfa_required"] is False
        assert response.data["devices_count"] == 0
        assert response.data["backup_codes_remaining"] == 0

    def test_get_mfa_status_enabled(self, authenticated_client, test_user, db):
        """Should return MFA enabled when device is confirmed."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        UserTOTPDevice.objects.create(
            user=test_user,
            name="Phone",
            confirmed=True,
        )
        BackupCode.generate_codes(user=test_user, count=10)

        response = authenticated_client.get("/api/mfa/status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mfa_enabled"] is True
        assert response.data["devices_count"] == 1
        assert response.data["backup_codes_remaining"] == 10


class TestMFAEnrollmentAPI:
    """Tests for TOTP enrollment flow."""

    def test_start_enrollment_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post("/api/mfa/totp/setup/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_start_enrollment_creates_pending_device(self, authenticated_client, test_user):
        """Should create unconfirmed TOTP device and return QR data."""
        response = authenticated_client.post("/api/mfa/totp/setup/")

        assert response.status_code == status.HTTP_200_OK
        assert "secret" in response.data
        assert "qr_code" in response.data  # Base64 encoded QR image
        assert "provisioning_uri" in response.data

        # Device should exist but not be confirmed
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.get(user=test_user)
        assert device.confirmed is False

    def test_confirm_enrollment_with_valid_token(self, authenticated_client, test_user, db):
        """Should confirm device with valid TOTP token."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        # Start enrollment
        authenticated_client.post("/api/mfa/totp/setup/")
        device = UserTOTPDevice.objects.get(user=test_user)

        # Generate valid token
        token = device.generate_token()

        # Confirm enrollment
        response = authenticated_client.post(
            "/api/mfa/totp/confirm/",
            {"token": token},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["confirmed"] is True
        assert "backup_codes" in response.data
        assert len(response.data["backup_codes"]) == 10

        # Device should now be confirmed
        device.refresh_from_db()
        assert device.confirmed is True

    def test_confirm_enrollment_rejects_invalid_token(self, authenticated_client, test_user, db):
        """Should reject invalid TOTP token during confirmation."""
        # Start enrollment
        authenticated_client.post("/api/mfa/totp/setup/")

        # Try to confirm with invalid token
        response = authenticated_client.post(
            "/api/mfa/totp/confirm/",
            {"token": "123456"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid" in response.data.get("error", "") or "invalid" in str(response.data)

    def test_enrollment_replaces_existing_unconfirmed_device(
        self, authenticated_client, test_user, db
    ):
        """Should replace existing unconfirmed device on new enrollment."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        # Start enrollment twice
        authenticated_client.post("/api/mfa/totp/setup/")
        first_device_id = UserTOTPDevice.objects.get(user=test_user).id

        authenticated_client.post("/api/mfa/totp/setup/")

        # Should only have one device (replaced)
        assert UserTOTPDevice.objects.filter(user=test_user).count() == 1
        assert UserTOTPDevice.objects.get(user=test_user).id != first_device_id


class TestMFADisableAPI:
    """Tests for disabling MFA."""

    def test_disable_mfa_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post("/api/mfa/disable/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_disable_mfa_requires_password(self, authenticated_client, test_user, db):
        """Should require password confirmation to disable MFA."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        # Enable MFA first
        device = UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        BackupCode.generate_codes(user=test_user, count=10)

        # Try to disable without password
        response = authenticated_client.post("/api/mfa/disable/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_disable_mfa_with_valid_password(self, authenticated_client, test_user, db):
        """Should disable MFA with valid password."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        # Enable MFA first
        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        BackupCode.generate_codes(user=test_user, count=10)

        # Disable with password
        response = authenticated_client.post(
            "/api/mfa/disable/",
            {"password": "testpassword123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert UserTOTPDevice.objects.filter(user=test_user).count() == 0
        assert BackupCode.objects.filter(user=test_user).count() == 0

    def test_disable_mfa_blocked_for_required_roles(self, api_client, db):
        """Should prevent disabling MFA for roles that require it."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        # Create admin user with MFA required role
        admin_user = User.objects.create_user(
            username="adminuser",
            password="testpassword123",
        )

        admin_role = Role.objects.create(
            code="ADMIN",
            name="Administrator",
            category="MANAGEMENT",
        )

        dept = Department.objects.create(
            name="Administration",
            code="ADMIN",
            department_type="ADMINISTRATIVE",
        )

        StaffProfile.objects.create(
            user=admin_user,
            employee_id="VH-2026-001",
            primary_role=admin_role,
            primary_department=dept,
            date_joined="2026-01-01",
        )

        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        UserTOTPDevice.objects.create(user=admin_user, name="Phone", confirmed=True)
        BackupCode.generate_codes(user=admin_user, count=10)

        api_client.force_authenticate(user=admin_user)
        with override_settings(MFA_ENFORCEMENT=True):
            response = api_client.post(
                "/api/mfa/disable/",
                {"password": "testpassword123"},
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "required" in response.data.get("error", "").lower()


class TestBackupCodesAPI:
    """Tests for backup codes management."""

    def test_regenerate_backup_codes_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post("/api/mfa/backup-codes/regenerate/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_regenerate_backup_codes_requires_mfa_enabled(self, authenticated_client, test_user):
        """Should require MFA to be enabled."""
        response = authenticated_client.post("/api/mfa/backup-codes/regenerate/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_regenerate_backup_codes_requires_verification(
        self, authenticated_client, test_user, db
    ):
        """Should require TOTP verification to regenerate backup codes."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Try without token
        response = authenticated_client.post("/api/mfa/backup-codes/regenerate/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_regenerate_backup_codes_with_valid_token(self, authenticated_client, test_user, db):
        """Should regenerate backup codes with valid TOTP token."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        device = UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        BackupCode.generate_codes(user=test_user, count=10)

        token = device.generate_token()

        response = authenticated_client.post(
            "/api/mfa/backup-codes/regenerate/",
            {"token": token},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "backup_codes" in response.data
        assert len(response.data["backup_codes"]) == 10


# ============================================================================
# MFA Login Flow Tests
# ============================================================================


class TestMFALoginFlow:
    """Tests for login flow with MFA."""

    def test_login_without_mfa_returns_tokens(self, api_client, test_user):
        """Should return tokens directly when MFA not enabled."""
        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data.get("mfa_required") is False or "mfa_required" not in response.data

    def test_login_with_mfa_returns_mfa_required(self, api_client, test_user, db, settings):
        """Should return MFA required when user has MFA enabled."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mfa_required"] is True
        assert "mfa_token" in response.data  # Temporary token for MFA step
        assert "access" not in response.data  # No access token yet

    def test_mfa_verify_with_valid_totp(self, api_client, test_user, db, settings):
        """Should complete login with valid TOTP token."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Step 1: Login
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token = login_response.data["mfa_token"]

        # Step 2: Verify TOTP
        token = device.generate_token()
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token, "token": token},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        # User info should be included in the response
        assert "user" in response.data
        assert response.data["user"]["username"] == "testuser"
        assert "first_name" in response.data["user"]
        assert "last_name" in response.data["user"]
        assert "permissions" in response.data["user"]

    def test_mfa_verify_with_backup_code(self, api_client, test_user, db, settings):
        """Should complete login with valid backup code."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        codes = BackupCode.generate_codes(user=test_user, count=10)

        # Step 1: Login
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token = login_response.data["mfa_token"]

        # Step 2: Verify with backup code
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token, "backup_code": codes[0]},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        # User info should be included in the response
        assert "user" in response.data
        assert response.data["user"]["username"] == "testuser"

    def test_mfa_verify_rejects_invalid_totp(self, api_client, test_user, db, settings):
        """Should reject invalid TOTP token."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Step 1: Login
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token = login_response.data["mfa_token"]

        # Step 2: Try invalid token
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token, "token": "000000"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_mfa_verify_rejects_expired_mfa_token(self, api_client, test_user, db):
        """Should reject expired MFA token."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Use an invalid/expired mfa_token
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": "expired_or_invalid_token", "token": device.generate_token()},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# Role-Based MFA Enforcement Tests
# ============================================================================


class TestMFARoleEnforcement:
    """Tests for role-based MFA requirements."""

    @pytest.fixture(autouse=True)
    def _enforce_mfa(self, settings):
        """Enable MFA enforcement for these tests."""
        settings.MFA_ENFORCEMENT = True

    @pytest.fixture
    def admin_role(self, db):
        """Create admin role."""
        from hmis.apps.core.models import Role

        return Role.objects.create(
            code="ADMIN",
            name="Administrator",
            category="MANAGEMENT",
        )

    @pytest.fixture
    def clinical_senior_role(self, db):
        """Create clinical senior role."""
        from hmis.apps.core.models import Role

        return Role.objects.create(
            code="CLINICAL_SENIOR",
            name="Senior Clinician",
            category="CLINICAL",
        )

    @pytest.fixture
    def management_role(self, db):
        """Create management role."""
        from hmis.apps.core.models import Role

        return Role.objects.create(
            code="MANAGEMENT",
            name="Management",
            category="MANAGEMENT",
        )

    @pytest.fixture
    def regular_role(self, db):
        """Create regular staff role."""
        from hmis.apps.core.models import Role

        return Role.objects.create(
            code="RECEPTIONIST",
            name="Receptionist",
            category="ADMINISTRATIVE",
        )

    @pytest.fixture
    def sample_department(self, db):
        """Create sample department."""
        from hmis.apps.core.models import Department

        return Department.objects.create(
            name="General",
            code="GEN",
            department_type="CLINICAL",
        )

    def _create_user_with_role(self, db, role, department, username="roleuser"):
        """Helper to create user with staff profile."""
        from hmis.apps.core.models import StaffProfile

        user = User.objects.create_user(
            username=username,
            password="testpassword123",
        )
        StaffProfile.objects.create(
            user=user,
            employee_id=f"VH-2026-{username}",
            primary_role=role,
            primary_department=department,
            date_joined="2026-01-01",
        )
        return user

    def test_admin_role_requires_mfa(self, db, admin_role, sample_department):
        """ADMIN role should require MFA."""
        from hmis.apps.core.mfa.utils import is_mfa_required

        user = self._create_user_with_role(db, admin_role, sample_department, "admin1")
        assert is_mfa_required(user) is True

    def test_clinical_senior_role_requires_mfa(self, db, clinical_senior_role, sample_department):
        """CLINICAL_SENIOR role should require MFA."""
        from hmis.apps.core.mfa.utils import is_mfa_required

        user = self._create_user_with_role(db, clinical_senior_role, sample_department, "csenior1")
        assert is_mfa_required(user) is True

    def test_management_role_requires_mfa(self, db, management_role, sample_department):
        """MANAGEMENT role should require MFA."""
        from hmis.apps.core.mfa.utils import is_mfa_required

        user = self._create_user_with_role(db, management_role, sample_department, "mgmt1")
        assert is_mfa_required(user) is True

    def test_regular_role_mfa_optional(self, db, regular_role, sample_department):
        """Regular roles should not require MFA (optional)."""
        from hmis.apps.core.mfa.utils import is_mfa_required

        user = self._create_user_with_role(db, regular_role, sample_department, "regular1")
        assert is_mfa_required(user) is False

    def test_superuser_requires_mfa(self, db):
        """Superusers should require MFA."""
        from hmis.apps.core.mfa.utils import is_mfa_required

        superuser = User.objects.create_superuser(
            username="superadmin",
            password="testpassword123",
        )
        assert is_mfa_required(superuser) is True

    def test_pending_mfa_setup_blocks_sensitive_endpoints(
        self, api_client, db, admin_role, sample_department
    ):
        """Users with required MFA but not setup should be directed to setup MFA."""
        user = self._create_user_with_role(db, admin_role, sample_department, "admin2")

        # Login (should succeed but indicate MFA setup required)
        response = api_client.post(
            "/api/token/",
            {"username": "admin2", "password": "testpassword123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data.get("mfa_setup_required") is True
        # Should get a limited token that only allows MFA setup
        assert "mfa_setup_token" in response.data or "access" in response.data


# ============================================================================
# MFA Audit Logging Tests
# ============================================================================


class TestMFAAuditLogging:
    """Tests for MFA-related audit logging."""

    @pytest.fixture(autouse=True)
    def _enforce_mfa(self, settings):
        """Enable MFA enforcement for these tests."""
        settings.MFA_ENFORCEMENT = True

    def test_mfa_enrollment_logged(self, authenticated_client, test_user, db):
        """Should log MFA enrollment."""
        from hmis.apps.core.models import AuditLog

        # Start enrollment
        authenticated_client.post("/api/mfa/totp/setup/")

        # Check audit log
        log = AuditLog.objects.filter(
            user=test_user,
            action="mfa_enrollment_started",
        ).first()

        assert log is not None

    def test_mfa_confirmed_logged(self, authenticated_client, test_user, db):
        """Should log MFA confirmation."""
        from hmis.apps.core.mfa.models import UserTOTPDevice
        from hmis.apps.core.models import AuditLog

        # Setup and confirm
        authenticated_client.post("/api/mfa/totp/setup/")
        device = UserTOTPDevice.objects.get(user=test_user)
        token = device.generate_token()
        authenticated_client.post("/api/mfa/totp/confirm/", {"token": token})

        # Check audit log
        log = AuditLog.objects.filter(
            user=test_user,
            action="mfa_enabled",
        ).first()

        assert log is not None

    def test_mfa_disabled_logged(self, authenticated_client, test_user, db):
        """Should log MFA disable."""
        from hmis.apps.core.mfa.models import UserTOTPDevice
        from hmis.apps.core.models import AuditLog

        # Enable MFA
        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Disable MFA
        authenticated_client.post(
            "/api/mfa/disable/",
            {"password": "testpassword123"},
        )

        # Check audit log
        log = AuditLog.objects.filter(
            user=test_user,
            action="mfa_disabled",
        ).first()

        assert log is not None

    def test_mfa_verification_failed_logged(self, api_client, test_user, db):
        """Should log failed MFA verification attempts."""
        from hmis.apps.core.mfa.models import UserTOTPDevice
        from hmis.apps.core.models import AuditLog

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Login
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token = login_response.data["mfa_token"]

        # Try invalid token
        api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token, "token": "000000"},
        )

        # Check audit log
        log = AuditLog.objects.filter(
            user=test_user,
            action="mfa_verification_failed",
        ).first()

        assert log is not None

    def test_backup_code_used_logged(self, api_client, test_user, db):
        """Should log backup code usage."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice
        from hmis.apps.core.models import AuditLog

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        codes = BackupCode.generate_codes(user=test_user, count=10)

        # Login
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token = login_response.data["mfa_token"]

        # Use backup code
        api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token, "backup_code": codes[0]},
        )

        # Check audit log
        log = AuditLog.objects.filter(
            user=test_user,
            action="backup_code_used",
        ).first()

        assert log is not None


# ============================================================================
# MFA Token Refresh Tests (Sprint 2.0 - Security Fix)
# ============================================================================


class TestMFAAwareTokenRefresh:
    """
    Tests for MFA-aware token refresh.

    When MFA is enabled, tokens issued BEFORE MFA was enabled should be
    rejected on refresh. This prevents session hijacking where old tokens
    bypass MFA verification.
    """

    def test_refresh_token_works_when_no_mfa(self, api_client, test_user, db):
        """Should allow token refresh when MFA is not enabled."""
        # Login (no MFA)
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )

        assert login_response.status_code == status.HTTP_200_OK
        refresh_token = login_response.data["refresh"]

        # Refresh the token
        refresh_response = api_client.post(
            "/api/token/refresh/",
            {"refresh": refresh_token},
        )

        assert refresh_response.status_code == status.HTTP_200_OK
        assert "access" in refresh_response.data

    def test_refresh_token_blocked_after_mfa_enabled(self, api_client, test_user, db):
        """Should block token refresh when MFA was enabled after token was issued."""
        from datetime import timedelta

        from django.utils import timezone

        from hmis.apps.core.mfa.models import UserTOTPDevice

        # Login BEFORE MFA is enabled
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )

        assert login_response.status_code == status.HTTP_200_OK
        refresh_token = login_response.data["refresh"]

        # Enable MFA AFTER getting the token
        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Phone",
            confirmed=True,
            confirmed_at=timezone.now(),
        )

        # Attempt to refresh the token - should be blocked
        refresh_response = api_client.post(
            "/api/token/refresh/",
            {"refresh": refresh_token},
        )

        assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED
        assert refresh_response.data["code"] == "MFA_ENABLED_RE_AUTH_REQUIRED"

    def test_refresh_token_works_after_mfa_login(self, api_client, test_user, db, settings):
        """Should allow token refresh when token was issued AFTER MFA was enabled."""
        settings.MFA_ENFORCEMENT = True
        from datetime import timedelta

        from django.utils import timezone

        from hmis.apps.core.mfa.models import UserTOTPDevice

        # Enable MFA FIRST
        device = UserTOTPDevice.objects.create(
            user=test_user,
            name="Phone",
            confirmed=True,
            confirmed_at=timezone.now() - timedelta(hours=1),  # MFA enabled 1 hour ago
        )

        # Login through MFA flow
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )

        assert login_response.status_code == status.HTTP_200_OK
        assert login_response.data.get("mfa_required") is True
        mfa_token = login_response.data["mfa_token"]

        # Verify MFA with TOTP
        current_totp = device.generate_token()
        verify_response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token, "token": current_totp},
        )

        assert verify_response.status_code == status.HTTP_200_OK
        refresh_token = verify_response.data["refresh"]

        # Refresh the token - should work since we went through MFA
        refresh_response = api_client.post(
            "/api/token/refresh/",
            {"refresh": refresh_token},
        )

        assert refresh_response.status_code == status.HTTP_200_OK
        assert "access" in refresh_response.data

    def test_refresh_blocked_logs_audit(self, api_client, test_user, db):
        """Should log when token refresh is blocked due to MFA enablement."""
        from django.utils import timezone

        from hmis.apps.core.mfa.models import UserTOTPDevice
        from hmis.apps.core.models import AuditLog

        # Login BEFORE MFA
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        refresh_token = login_response.data["refresh"]

        # Enable MFA
        UserTOTPDevice.objects.create(
            user=test_user,
            name="Phone",
            confirmed=True,
            confirmed_at=timezone.now(),
        )

        # Attempt refresh
        api_client.post(
            "/api/token/refresh/",
            {"refresh": refresh_token},
        )

        # Check audit log
        log = AuditLog.objects.filter(
            user=test_user,
            action="token_refresh_blocked_mfa",
        ).first()

        assert log is not None
        assert "mfa_enabled_at" in log.details

    def test_refresh_with_invalid_token(self, api_client, db):
        """Should reject refresh with invalid token."""
        refresh_response = api_client.post(
            "/api/token/refresh/",
            {"refresh": "invalid-token"},
        )

        assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_refresh_without_token(self, api_client, db):
        """Should reject refresh without token provided."""
        refresh_response = api_client.post(
            "/api/token/refresh/",
            {},
        )

        assert refresh_response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# WebAuthn Credential Model Tests
# ============================================================================


class TestWebAuthnCredentialModel:
    """Tests for WebAuthn credential model."""

    def test_create_webauthn_credential(self, db, test_user):
        """Should create a WebAuthn credential for a user."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        cred = UserWebAuthnCredential.objects.create(
            user=test_user,
            name="Windows Hello",
            credential_id=b"\x01\x02\x03\x04",
            public_key=b"\x05\x06\x07\x08",
            sign_count=0,
            transports=["internal"],
        )

        assert cred.id is not None
        assert cred.user == test_user
        assert cred.name == "Windows Hello"
        assert bytes(cred.credential_id) == b"\x01\x02\x03\x04"
        assert cred.sign_count == 0
        assert cred.transports == ["internal"]

    def test_update_sign_count(self, db, test_user):
        """Should update sign count and last_used_at."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        cred = UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x11\x22",
            public_key=b"\x33\x44",
            sign_count=0,
        )

        assert cred.last_used_at is None

        cred.update_sign_count(5)
        cred.refresh_from_db()

        assert cred.sign_count == 5
        assert cred.last_used_at is not None

    def test_user_can_have_multiple_credentials(self, db, test_user):
        """Should allow user to have multiple WebAuthn credentials."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="Windows Hello",
            credential_id=b"\x01",
            public_key=b"\x02",
        )
        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x03",
            public_key=b"\x04",
        )

        assert UserWebAuthnCredential.objects.filter(user=test_user).count() == 2

    def test_credential_id_unique(self, db, test_user):
        """Should enforce unique credential_id."""
        from django.db import IntegrityError

        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="Key 1",
            credential_id=b"\x01\x02\x03",
            public_key=b"\x04",
        )

        with pytest.raises(IntegrityError):
            UserWebAuthnCredential.objects.create(
                user=test_user,
                name="Key 2",
                credential_id=b"\x01\x02\x03",  # Same credential_id
                public_key=b"\x05",
            )


class TestMFAEnabledWithWebAuthn:
    """Tests for is_mfa_enabled with WebAuthn credentials."""

    def test_mfa_enabled_with_webauthn_only(self, db, test_user):
        """MFA should be considered enabled with only WebAuthn credentials."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential
        from hmis.apps.core.mfa.utils import is_mfa_enabled

        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        assert is_mfa_enabled(test_user) is True

    def test_mfa_enabled_with_both_totp_and_webauthn(self, db, test_user):
        """MFA should be enabled when both TOTP and WebAuthn exist."""
        from hmis.apps.core.mfa.models import UserTOTPDevice, UserWebAuthnCredential
        from hmis.apps.core.mfa.utils import is_mfa_enabled

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        assert is_mfa_enabled(test_user) is True


# ============================================================================
# MFA Status with WebAuthn Tests
# ============================================================================


class TestMFAStatusWithWebAuthn:
    """Tests for MFA status endpoint including WebAuthn info."""

    def test_status_includes_webauthn_count(self, authenticated_client, test_user, db):
        """Status should include webauthn_credentials_count."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        response = authenticated_client.get("/api/mfa/status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["webauthn_credentials_count"] == 1

    def test_status_includes_available_methods(self, authenticated_client, test_user, db):
        """Status should include available_methods list."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice, UserWebAuthnCredential

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )
        BackupCode.generate_codes(user=test_user, count=10)

        response = authenticated_client.get("/api/mfa/status/")

        assert response.status_code == status.HTTP_200_OK
        assert "totp" in response.data["available_methods"]
        assert "webauthn" in response.data["available_methods"]
        assert "backup_code" in response.data["available_methods"]

    def test_status_no_methods_when_mfa_disabled(self, authenticated_client, test_user, db):
        """available_methods should be empty when MFA is not enabled."""
        response = authenticated_client.get("/api/mfa/status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["available_methods"] == []


# ============================================================================
# WebAuthn Registration API Tests
# ============================================================================


class TestWebAuthnRegistrationAPI:
    """Tests for WebAuthn registration endpoints."""

    def test_register_begin_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post("/api/mfa/webauthn/register/begin/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_register_begin_requires_totp_enabled(self, authenticated_client, test_user, db):
        """Should require TOTP MFA to be enabled before adding WebAuthn."""
        response = authenticated_client.post("/api/mfa/webauthn/register/begin/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "TOTP" in response.data.get("error", "")

    def test_register_begin_returns_options(self, authenticated_client, test_user, db):
        """Should return PublicKeyCredentialCreationOptions when TOTP is enabled."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        response = authenticated_client.post("/api/mfa/webauthn/register/begin/")

        assert response.status_code == status.HTTP_200_OK
        assert "options" in response.data

    def test_register_complete_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post("/api/mfa/webauthn/register/complete/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_register_complete_requires_credential(self, authenticated_client, test_user, db):
        """Should require credential JSON in request."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        response = authenticated_client.post("/api/mfa/webauthn/register/complete/", {})

        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# WebAuthn Credential Management API Tests
# ============================================================================


class TestWebAuthnCredentialManagementAPI:
    """Tests for WebAuthn credential listing and deletion."""

    def test_list_credentials_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/mfa/webauthn/credentials/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_credentials_empty(self, authenticated_client, test_user, db):
        """Should return empty list when no credentials."""
        response = authenticated_client.get("/api/mfa/webauthn/credentials/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_list_credentials_returns_all(self, authenticated_client, test_user, db):
        """Should return all user's WebAuthn credentials."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="Windows Hello",
            credential_id=b"\x01",
            public_key=b"\x02",
            transports=["internal"],
        )
        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x03",
            public_key=b"\x04",
            transports=["usb"],
        )

        response = authenticated_client.get("/api/mfa/webauthn/credentials/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        names = [c["name"] for c in response.data]
        assert "Windows Hello" in names
        assert "YubiKey" in names

    def test_delete_credential_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.delete("/api/mfa/webauthn/credentials/1/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_credential_requires_password(self, authenticated_client, test_user, db):
        """Should require password confirmation."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        cred = UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        response = authenticated_client.delete(f"/api/mfa/webauthn/credentials/{cred.id}/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_credential_with_valid_password(self, authenticated_client, test_user, db):
        """Should delete credential with valid password."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        cred = UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        response = authenticated_client.delete(
            f"/api/mfa/webauthn/credentials/{cred.id}/",
            data={"password": "testpassword123"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert UserWebAuthnCredential.objects.filter(id=cred.id).count() == 0

    def test_delete_credential_wrong_password(self, authenticated_client, test_user, db):
        """Should reject deletion with wrong password."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        cred = UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        response = authenticated_client.delete(
            f"/api/mfa/webauthn/credentials/{cred.id}/",
            data={"password": "wrongpassword"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert UserWebAuthnCredential.objects.filter(id=cred.id).count() == 1

    def test_delete_credential_not_found(self, authenticated_client, test_user, db):
        """Should return 404 for non-existent credential."""
        response = authenticated_client.delete(
            "/api/mfa/webauthn/credentials/99999/",
            data={"password": "testpassword123"},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_cannot_delete_other_users_credential(self, authenticated_client, test_user, db):
        """Should not allow deleting another user's credential."""
        from hmis.apps.core.mfa.models import UserWebAuthnCredential

        other_user = User.objects.create_user(
            username="otheruser", password="testpassword123"
        )
        cred = UserWebAuthnCredential.objects.create(
            user=other_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        response = authenticated_client.delete(
            f"/api/mfa/webauthn/credentials/{cred.id}/",
            data={"password": "testpassword123"},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert UserWebAuthnCredential.objects.filter(id=cred.id).count() == 1


# ============================================================================
# WebAuthn Authentication API Tests
# ============================================================================


class TestWebAuthnAuthenticationAPI:
    """Tests for WebAuthn authentication begin endpoint."""

    def test_authenticate_begin_requires_mfa_token(self, api_client, db):
        """Should require mfa_token."""
        response = api_client.post("/api/mfa/webauthn/authenticate/begin/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_authenticate_begin_rejects_invalid_token(self, api_client, db):
        """Should reject invalid mfa_token."""
        response = api_client.post(
            "/api/mfa/webauthn/authenticate/begin/",
            {"mfa_token": "invalid_token"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_authenticate_begin_requires_webauthn_credentials(
        self, api_client, test_user, db, settings
    ):
        """Should require user to have WebAuthn credentials."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Login to get mfa_token
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token = login_response.data["mfa_token"]

        # Try WebAuthn begin without credentials
        response = api_client.post(
            "/api/mfa/webauthn/authenticate/begin/",
            {"mfa_token": mfa_token},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "No WebAuthn" in response.data.get("error", "")

    def test_authenticate_begin_returns_options(self, api_client, test_user, db, settings):
        """Should return PublicKeyCredentialRequestOptions."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import UserTOTPDevice, UserWebAuthnCredential

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01\x02\x03\x04",
            public_key=b"\x05\x06\x07\x08",
            transports=["usb"],
        )

        # Login to get mfa_token
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token = login_response.data["mfa_token"]

        response = api_client.post(
            "/api/mfa/webauthn/authenticate/begin/",
            {"mfa_token": mfa_token},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "options" in response.data


# ============================================================================
# Backup Codes Download (Re-download) API Tests
# ============================================================================


class TestBackupCodesDownloadAPI:
    """Tests for backup codes re-download endpoint."""

    def test_download_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post("/api/mfa/backup-codes/download/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_download_requires_mfa_enabled(self, authenticated_client, test_user, db):
        """Should require MFA to be enabled."""
        response = authenticated_client.post(
            "/api/mfa/backup-codes/download/",
            {"token": "123456"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "MFA must be enabled" in response.data.get("error", "")

    def test_download_requires_valid_token(self, authenticated_client, test_user, db):
        """Should require a valid 6-digit TOTP token."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # No token
        response = authenticated_client.post("/api/mfa/backup-codes/download/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # Invalid token
        response = authenticated_client.post(
            "/api/mfa/backup-codes/download/",
            {"token": "abc"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_download_rejects_wrong_totp_token(self, authenticated_client, test_user, db):
        """Should reject incorrect TOTP token."""
        from hmis.apps.core.mfa.models import UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        response = authenticated_client.post(
            "/api/mfa/backup-codes/download/",
            {"token": "000000"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid" in response.data.get("error", "")

    def test_download_returns_fresh_codes_with_valid_token(
        self, authenticated_client, test_user, db
    ):
        """Should return fresh backup codes after TOTP verification."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        device = UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        BackupCode.generate_codes(user=test_user, count=10)

        token = device.generate_token()

        response = authenticated_client.post(
            "/api/mfa/backup-codes/download/",
            {"token": token},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "backup_codes" in response.data
        assert len(response.data["backup_codes"]) == 10

    def test_download_is_audited(self, authenticated_client, test_user, db):
        """Should create an audit log entry for backup codes download."""
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice
        from hmis.apps.core.models import AuditLog

        device = UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        BackupCode.generate_codes(user=test_user, count=10)

        token = device.generate_token()
        authenticated_client.post(
            "/api/mfa/backup-codes/download/",
            {"token": token},
        )

        log = AuditLog.objects.filter(
            user=test_user,
            action="backup_codes_downloaded",
        ).first()

        assert log is not None
        assert log.details["count"] == 10


# ============================================================================
# MFA Disable Deletes WebAuthn Credentials Tests
# ============================================================================


class TestMFADisableDeletesWebAuthn:
    """Tests that disabling MFA also removes WebAuthn credentials."""

    def test_disable_mfa_deletes_webauthn_credentials(
        self, authenticated_client, test_user, db
    ):
        """Should delete WebAuthn credentials when MFA is disabled."""
        from hmis.apps.core.mfa.models import UserTOTPDevice, UserWebAuthnCredential

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
        )

        assert UserWebAuthnCredential.objects.filter(user=test_user).count() == 1

        response = authenticated_client.post(
            "/api/mfa/disable/",
            {"password": "testpassword123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert UserWebAuthnCredential.objects.filter(user=test_user).count() == 0


# ============================================================================
# Login Flow with available_methods Tests
# ============================================================================


class TestLoginFlowAvailableMethods:
    """Tests that the login response includes available_methods."""

    def test_login_mfa_response_includes_available_methods(
        self, api_client, test_user, db, settings
    ):
        """MFA required login should include available_methods."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import UserTOTPDevice, UserWebAuthnCredential

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        UserWebAuthnCredential.objects.create(
            user=test_user,
            name="YubiKey",
            credential_id=b"\x01",
            public_key=b"\x02",
            transports=["usb"],
        )

        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mfa_required"] is True
        assert "available_methods" in response.data
        assert "totp" in response.data["available_methods"]
        assert "webauthn" in response.data["available_methods"]

    def test_login_mfa_totp_only_available_methods(
        self, api_client, test_user, db, settings
    ):
        """MFA login with only TOTP should show correct methods."""
        settings.MFA_ENFORCEMENT = True
        from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)
        BackupCode.generate_codes(user=test_user, count=10)

        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "totp" in response.data["available_methods"]
        assert "backup_code" in response.data["available_methods"]
        assert "webauthn" not in response.data["available_methods"]
