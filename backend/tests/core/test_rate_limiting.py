"""
Tests for rate limiting on authentication endpoints.

Security Compliance: DHA P0 Required
- Brute-force protection on password login
- Brute-force protection on MFA verification
- Failed attempt tracking and lockout

These tests verify that authentication endpoints are protected against
brute-force attacks through rate limiting and account lockout mechanisms.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status

User = get_user_model()


# ============================================================================
# Login Rate Limiting Tests
# ============================================================================


class TestLoginRateLimiting:
    """Tests for rate limiting on password login endpoint."""

    @pytest.fixture(autouse=True)
    def clear_throttle_cache(self):
        """Clear throttle cache before each test."""
        cache.clear()
        yield
        cache.clear()

    def test_login_has_throttle_configured(self, api_client, test_user):
        """Should have rate limiting configured on login endpoint."""
        from hmis.apps.core.views import AuditedTokenObtainPairView
        from rest_framework.throttling import ScopedRateThrottle

        assert ScopedRateThrottle in AuditedTokenObtainPairView.throttle_classes
        assert AuditedTokenObtainPairView.throttle_scope == "login"

    def test_login_allows_successful_requests(self, api_client, test_user):
        """Should allow successful login requests."""
        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_login_rate_limits_after_threshold(self, api_client, test_user):
        """Should rate limit after exceeding threshold (5 requests/minute)."""
        # Make 5 successful requests (within limit)
        for _ in range(5):
            response = api_client.post(
                "/api/token/",
                {"username": "testuser", "password": "testpassword123"},
            )
            # Should all succeed
            assert response.status_code in [status.HTTP_200_OK, status.HTTP_429_TOO_MANY_REQUESTS]

        # 6th request should be rate limited
        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_login_rate_limits_failed_attempts(self, api_client, test_user):
        """Should rate limit failed login attempts too."""
        # Make 5 failed attempts
        for _ in range(5):
            response = api_client.post(
                "/api/token/",
                {"username": "testuser", "password": "wrongpassword"},
            )
            # Should be 401 until rate limited
            assert response.status_code in [
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_429_TOO_MANY_REQUESTS,
            ]

        # 6th request should be rate limited
        response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "wrongpassword"},
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


# ============================================================================
# MFA Verification Rate Limiting Tests
# ============================================================================


class TestMFAVerificationRateLimiting:
    """Tests for rate limiting on MFA verification endpoint."""

    @pytest.fixture(autouse=True)
    def clear_throttle_cache(self):
        """Clear throttle cache before each test."""
        cache.clear()
        yield
        cache.clear()

    def test_mfa_verify_has_throttle_configured(self, api_client, db):
        """Should have rate limiting configured on MFA verify endpoint."""
        from hmis.apps.core.mfa.views import MFAVerifyView
        from rest_framework.throttling import ScopedRateThrottle

        assert ScopedRateThrottle in MFAVerifyView.throttle_classes
        assert MFAVerifyView.throttle_scope == "mfa_verify"

    def test_mfa_verify_rate_limits_after_threshold(self, api_client, test_user, db):
        """Should rate limit MFA verify after exceeding threshold."""
        from hmis.apps.core.mfa.models import MFAToken, UserTOTPDevice

        # Setup MFA
        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Make 5 attempts with invalid data
        for _ in range(5):
            mfa_token = MFAToken.create_for_user(test_user)
            response = api_client.post(
                "/api/mfa/verify/",
                {"mfa_token": mfa_token.token, "token": "000000"},
            )
            # Should be 400 until rate limited
            assert response.status_code in [
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_429_TOO_MANY_REQUESTS,
            ]

        # 6th request should be rate limited
        mfa_token = MFAToken.create_for_user(test_user)
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token.token, "token": "000000"},
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


# ============================================================================
# MFA Token Failed Attempts Tests
# ============================================================================


class TestMFATokenFailedAttempts:
    """Tests for MFA token failed attempt tracking and lockout."""

    @pytest.fixture(autouse=True)
    def _enforce_mfa(self, settings):
        """Enable MFA enforcement for these tests."""
        settings.MFA_ENFORCEMENT = True

    def test_mfa_token_has_failed_attempts_field(self, db, test_user):
        """MFAToken should have failed_attempts field."""
        from hmis.apps.core.mfa.models import MFAToken

        mfa_token = MFAToken.create_for_user(test_user)
        assert hasattr(mfa_token, "failed_attempts")
        assert mfa_token.failed_attempts == 0

    def test_mfa_token_increment_failed_attempts(self, db, test_user):
        """Should increment failed_attempts counter."""
        from hmis.apps.core.mfa.models import MFAToken

        mfa_token = MFAToken.create_for_user(test_user)
        assert mfa_token.failed_attempts == 0

        mfa_token.increment_failed_attempts()
        mfa_token.refresh_from_db()
        assert mfa_token.failed_attempts == 1

        mfa_token.increment_failed_attempts()
        mfa_token.refresh_from_db()
        assert mfa_token.failed_attempts == 2

    def test_mfa_token_invalidates_after_max_attempts(self, db, test_user):
        """Should invalidate token after MAX_FAILED_ATTEMPTS."""
        from hmis.apps.core.mfa.models import MFAToken

        mfa_token = MFAToken.create_for_user(test_user)
        assert mfa_token.is_valid()

        # Increment to just below max
        for _ in range(MFAToken.MAX_FAILED_ATTEMPTS - 1):
            mfa_token.increment_failed_attempts()
            mfa_token.refresh_from_db()
            assert mfa_token.is_valid()

        # Reaching max should invalidate
        mfa_token.increment_failed_attempts()
        mfa_token.refresh_from_db()
        assert mfa_token.used is True
        assert not mfa_token.is_valid()

    def test_mfa_token_max_attempts_is_five(self, db):
        """MAX_FAILED_ATTEMPTS should be 5."""
        from hmis.apps.core.mfa.models import MFAToken

        assert MFAToken.MAX_FAILED_ATTEMPTS == 5

    def test_mfa_verify_increments_failed_attempts_on_invalid_totp(
        self, api_client, test_user, db
    ):
        """Should increment failed attempts when TOTP verification fails."""
        from hmis.apps.core.mfa.models import MFAToken, UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Login to get MFA token
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token_str = login_response.data["mfa_token"]

        # Try invalid TOTP
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token_str, "token": "000000"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # Check failed_attempts incremented
        mfa_token = MFAToken.objects.get(token=mfa_token_str)
        assert mfa_token.failed_attempts == 1

    def test_mfa_verify_returns_429_after_max_attempts(self, api_client, test_user, db):
        """Should return 429 when max failed attempts reached."""
        from hmis.apps.core.mfa.models import MFAToken, UserTOTPDevice

        # Clear cache to avoid rate limiting interference
        cache.clear()

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Login to get MFA token
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token_str = login_response.data["mfa_token"]

        # Set failed attempts to max - 1
        mfa_token = MFAToken.objects.get(token=mfa_token_str)
        mfa_token.failed_attempts = MFAToken.MAX_FAILED_ATTEMPTS
        mfa_token.save()

        # Next attempt should get 429
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token_str, "token": "000000"},
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "Too many failed attempts" in response.data.get("error", "")

    def test_mfa_verify_succeeds_after_failed_attempts_below_max(
        self, api_client, test_user, db
    ):
        """Should still succeed with valid TOTP if below max attempts."""
        from hmis.apps.core.mfa.models import MFAToken, UserTOTPDevice

        # Clear cache to avoid rate limiting
        cache.clear()

        device = UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Login to get MFA token
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token_str = login_response.data["mfa_token"]

        # Make some failed attempts
        for _ in range(3):
            api_client.post(
                "/api/mfa/verify/",
                {"mfa_token": mfa_token_str, "token": "000000"},
            )

        # Clear cache again before final attempt
        cache.clear()

        # Valid token should still work
        valid_token = device.generate_token()
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token_str, "token": valid_token},
        )
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data

    def test_mfa_verify_increments_failed_attempts_on_invalid_backup_code(
        self, api_client, test_user, db
    ):
        """Should increment failed attempts when backup code verification fails."""
        from hmis.apps.core.mfa.models import MFAToken, UserTOTPDevice

        UserTOTPDevice.objects.create(user=test_user, name="Phone", confirmed=True)

        # Login to get MFA token
        login_response = api_client.post(
            "/api/token/",
            {"username": "testuser", "password": "testpassword123"},
        )
        mfa_token_str = login_response.data["mfa_token"]

        # Try invalid backup code
        response = api_client.post(
            "/api/mfa/verify/",
            {"mfa_token": mfa_token_str, "backup_code": "INVALID1"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # Check failed_attempts incremented
        mfa_token = MFAToken.objects.get(token=mfa_token_str)
        assert mfa_token.failed_attempts == 1


# ============================================================================
# Throttle Settings Tests
# ============================================================================


class TestThrottleSettings:
    """Tests for throttle configuration in settings."""

    def test_throttle_rates_are_configured(self, db):
        """Should have throttle rates configured in REST_FRAMEWORK settings."""
        from django.conf import settings

        rf_settings = getattr(settings, "REST_FRAMEWORK", {})
        throttle_rates = rf_settings.get("DEFAULT_THROTTLE_RATES", {})

        assert "login" in throttle_rates, "login throttle rate not configured"
        assert "mfa_verify" in throttle_rates, "mfa_verify throttle rate not configured"

        # Verify rates are set to 5/minute
        assert throttle_rates["login"] == "5/minute"
        assert throttle_rates["mfa_verify"] == "5/minute"

    def test_throttle_classes_are_configured(self, db):
        """Should have throttle classes configured in REST_FRAMEWORK settings."""
        from django.conf import settings

        rf_settings = getattr(settings, "REST_FRAMEWORK", {})
        throttle_classes = rf_settings.get("DEFAULT_THROTTLE_CLASSES", [])

        assert len(throttle_classes) >= 2
        assert "rest_framework.throttling.AnonRateThrottle" in throttle_classes
        assert "rest_framework.throttling.ScopedRateThrottle" in throttle_classes
