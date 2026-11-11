# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for account lockout and server-enforced idle authentication sessions.

Run with: poetry run pytest tests/core/test_auth_session_security.py --no-cov
Inputs: Django API client, authenticated users, and configurable security settings.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import (
    AuditLog,
    AuthenticationSecuritySettings,
    AuthSession,
    LoginSecurityState,
)

User = get_user_model()


@pytest.mark.django_db
class TestAccountLockout:
    """Account-specific failed-login lockout behaviour."""

    def test_five_failed_attempts_lock_the_account_and_audit_the_event(self, api_client, test_user):
        AuthenticationSecuritySettings.objects.update_or_create(
            pk=AuthenticationSecuritySettings.SINGLETON_PK,
            defaults={
                "max_failed_login_attempts": 5,
                "lockout_duration_minutes": 15,
                "idle_session_timeout_seconds": 1800,
            },
        )
        for _ in range(5):
            response = api_client.post(
                "/api/token/", {"username": test_user.username, "password": "incorrect-password"}
            )
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        state = LoginSecurityState.objects.get(user=test_user)
        assert state.locked_until > timezone.now()
        assert AuditLog.objects.filter(action="account_locked", user=test_user).exists()

        cache.clear()
        response = api_client.post(
            "/api/token/", {"username": test_user.username, "password": "testpassword123"}
        )
        assert response.status_code == status.HTTP_423_LOCKED
        assert response.data["code"] == "account_locked"

    def test_successful_login_resets_failed_attempt_counter(self, api_client, test_user):
        state = LoginSecurityState.objects.create(user=test_user, failed_attempts=3)

        response = api_client.post(
            "/api/token/", {"username": test_user.username, "password": "testpassword123"}
        )

        assert response.status_code == status.HTTP_200_OK
        state.refresh_from_db()
        assert state.failed_attempts == 0

    def test_expired_lock_is_cleared_and_audited(self, api_client, test_user):
        LoginSecurityState.objects.create(
            user=test_user,
            failed_attempts=5,
            locked_until=timezone.now() - timedelta(seconds=1),
        )

        response = api_client.post(
            "/api/token/", {"username": test_user.username, "password": "testpassword123"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert AuditLog.objects.filter(action="account_unlocked", user=test_user).exists()


@pytest.mark.django_db
class TestServerIdleSessionRevocation:
    """JWT sessions are revoked by the server after configured inactivity."""

    def test_idle_session_is_rejected_and_audited(self, api_client, test_user, settings):
        config = AuthenticationSecuritySettings.load()
        config.idle_session_timeout_seconds = 60
        config.save(update_fields=["idle_session_timeout_seconds", "updated_at"])
        login = api_client.post(
            "/api/token/", {"username": test_user.username, "password": "testpassword123"}
        )
        session = AuthSession.objects.get(user=test_user)
        session.last_activity_at = timezone.now() - timedelta(seconds=61)
        session.save(update_fields=["last_activity_at"])

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = api_client.get("/api/patients/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        session.refresh_from_db()
        assert session.revoked_at is not None
        assert AuditLog.objects.filter(action="session_idle_revoked", user=test_user).exists()


@pytest.mark.django_db
def test_security_settings_are_singleton_admin_managed_defaults():
    """Runtime controls persist independently of deployment environment variables."""
    config = AuthenticationSecuritySettings.load()

    assert config.pk == AuthenticationSecuritySettings.SINGLETON_PK
    assert config.max_failed_login_attempts == 5
    assert config.lockout_duration_minutes == 15
    assert config.idle_session_timeout_seconds == 1800

    def test_logout_revokes_the_server_session(self, test_user):
        client = APIClient()
        login = client.post(
            "/api/token/", {"username": test_user.username, "password": "testpassword123"}
        )
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        client.post("/api/auth/logout/")

        response = client.get("/api/patients/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
