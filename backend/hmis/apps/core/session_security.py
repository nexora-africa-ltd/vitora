# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Server-side authentication session and temporary account-lockout helpers.

Use from JWT issuance, authentication, refresh, and logout flows. Inputs are a
Django user, JWT session claim, request context, and security settings.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken

from hmis.apps.core.events import CoreEvents, publish_event
from hmis.apps.core.models import (
    AuditLog,
    AuthenticationSecuritySettings,
    AuthSession,
    LoginSecurityState,
)
from hmis.apps.core.permissions import get_client_ip


def _audit(action, user, request, **details):
    AuditLog.log(
        action=action,
        user=user,
        resource_type="User",
        resource_id=user.id,
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
        details=details,
    )
    event_types = {
        "account_locked": CoreEvents.USER_ACCOUNT_LOCKED,
        "account_unlocked": CoreEvents.USER_ACCOUNT_UNLOCKED,
        "session_idle_revoked": CoreEvents.USER_SESSION_IDLE_REVOKED,
    }
    if event_type := event_types.get(action):
        publish_event(
            event_type,
            aggregate_type="User",
            aggregate_id=user.id,
            payload=details,
            user_id=user.id,
        )


def check_account_lock(user, request=None) -> bool:
    """Return whether a user remains locked, clearing an expired lock once."""
    state, _ = LoginSecurityState.objects.get_or_create(user=user)
    if not state.locked_until:
        return False
    if state.locked_until > timezone.now():
        return True
    state.failed_attempts = 0
    state.locked_until = None
    state.save(update_fields=["failed_attempts", "locked_until", "updated_at"])
    _audit("account_unlocked", user, request, reason="lockout_expired")
    return False


def record_failed_login(user, request=None) -> None:
    """Increment failures and temporarily lock the account at the configured threshold."""
    state, _ = LoginSecurityState.objects.get_or_create(user=user)
    if check_account_lock(user, request):
        return
    state.refresh_from_db()
    state.failed_attempts += 1
    security_settings = AuthenticationSecuritySettings.load()
    max_attempts = security_settings.max_failed_login_attempts
    if state.failed_attempts >= max_attempts:
        duration = security_settings.lockout_duration_minutes
        state.locked_until = timezone.now() + timedelta(minutes=duration)
        _audit(
            "account_locked",
            user,
            request,
            failed_attempts=state.failed_attempts,
            locked_until=state.locked_until.isoformat(),
        )
    state.save(update_fields=["failed_attempts", "locked_until", "updated_at"])


def clear_failed_logins(user) -> None:
    """Clear failures after a valid primary-credential login."""
    state, _ = LoginSecurityState.objects.get_or_create(user=user)
    if state.failed_attempts or state.locked_until:
        state.failed_attempts = 0
        state.locked_until = None
        state.save(update_fields=["failed_attempts", "locked_until", "updated_at"])


def create_token_pair(user):
    """Create a JWT pair bound to a revocable server-side session."""
    session = AuthSession.objects.create(user=user)
    refresh = RefreshToken.for_user(user)
    refresh["session_id"] = str(session.session_id)
    return session, refresh


def validate_session(user, session_id, request=None) -> AuthSession:
    """Validate, touch, or revoke the session backing a JWT."""
    if not session_id:
        raise AuthenticationFailed(
            "Session is invalid. Please sign in again.", code="session_invalid"
        )
    try:
        session = AuthSession.objects.get(session_id=session_id, user=user)
    except (AuthSession.DoesNotExist, ValueError):
        raise AuthenticationFailed(
            "Session is invalid. Please sign in again.", code="session_invalid"
        ) from None
    if session.revoked_at:
        raise AuthenticationFailed(
            "Session has ended. Please sign in again.", code="session_revoked"
        )

    idle_seconds = AuthenticationSecuritySettings.load().idle_session_timeout_seconds
    if idle_seconds > 0 and timezone.now() - session.last_activity_at > timedelta(
        seconds=idle_seconds
    ):
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])
        _audit("session_idle_revoked", user, request, timeout_seconds=idle_seconds)
        raise AuthenticationFailed(
            "Session expired due to inactivity. Please sign in again.", code="session_idle"
        )

    session.last_activity_at = timezone.now()
    session.save(update_fields=["last_activity_at"])
    return session


def revoke_session_from_token(raw_token, request=None) -> None:
    """Revoke the server session represented by a refresh or access JWT."""
    try:
        token = UntypedToken(raw_token)
    except Exception:  # noqa: BLE001 - logout must clear client state for malformed tokens
        return
    session_id = token.payload.get("session_id")
    if not session_id:
        return
    session = (
        AuthSession.objects.filter(session_id=session_id, revoked_at__isnull=True)
        .select_related("user")
        .first()
    )
    if session:
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])
        _audit("session_revoked", session.user, request, reason="logout")
