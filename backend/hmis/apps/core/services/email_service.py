# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Email service for Vitora HMIS.

Provides a unified interface for sending transactional emails.
Uses Resend in production and Django's console backend in development.

Configuration (settings / env vars):
    RESEND_API_KEY        – Resend API key (when set, uses Resend SDK)
    DEFAULT_FROM_EMAIL    – Sender address (default: noreply@vitora.health)
    FRONTEND_URL          – Base URL for links in emails (default: http://localhost:3009)
"""

from __future__ import annotations

import logging
from email.utils import formataddr
from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection, send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)

# Safe connection metadata for frontend SMTP setup. Never include credentials.
SMTP_PROVIDER_PRESETS = [
    {
        "id": "gmail",
        "name": "Gmail",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "security_mode": "STARTTLS",
    },
    {
        "id": "outlook",
        "name": "Microsoft 365 / Outlook",
        "smtp_host": "smtp.office365.com",
        "smtp_port": 587,
        "security_mode": "STARTTLS",
    },
    {
        "id": "yahoo",
        "name": "Yahoo Mail",
        "smtp_host": "smtp.mail.yahoo.com",
        "smtp_port": 465,
        "security_mode": "SSL_TLS",
    },
    {
        "id": "zoho",
        "name": "Zoho Mail",
        "smtp_host": "smtp.zoho.com",
        "smtp_port": 465,
        "security_mode": "SSL_TLS",
    },
    {
        "id": "custom",
        "name": "Custom SMTP",
        "smtp_host": "",
        "smtp_port": 587,
        "security_mode": "STARTTLS",
    },
]


def _get_frontend_url() -> str:
    """Return the frontend base URL (no trailing slash)."""
    return getattr(settings, "FRONTEND_URL", "http://localhost:3009").rstrip("/")


def _send(
    *,
    subject: str,
    html_body: str,
    to_email: str,
    from_email: str | None = None,
) -> bool:
    """
    Send an email, routing through Resend SDK when configured or
    falling back to Django's email backend (console in dev).

    Returns True on success, False on failure (never raises).
    """
    result = send_transactional_email(
        subject=subject,
        html_body=html_body,
        to_email=to_email,
        from_email=from_email,
    )
    return bool(result.get("accepted", False))


def send_transactional_email(
    *,
    subject: str,
    html_body: str,
    to_email: str,
    from_email: str | None = None,
    headers: dict[str, str] | None = None,
    tags: list[dict[str, str]] | None = None,
    facility: Any | None = None,
) -> dict[str, Any]:
    """Send email and return provider-aware metadata for delivery workflows."""
    if facility is not None:
        from hmis.apps.core.models import FacilityEmailConfig

        config = FacilityEmailConfig.objects.filter(facility=facility).first()
        if getattr(facility, "has_custom_email", False) and config and config.custom_email_enabled:
            return _send_via_facility_smtp(
                config=config,
                subject=subject,
                html_body=html_body,
                to_email=to_email,
            )

    sender = from_email or getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@vitora.health")
    resend_key = getattr(settings, "RESEND_API_KEY", "") or ""

    if getattr(settings, "TESTING", False):
        resend_key = ""

    if resend_key:
        try:
            import resend  # type: ignore

            resend.api_key = resend_key
            payload: dict[str, Any] = {
                "from": sender,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            }
            if headers:
                payload["headers"] = headers
            if tags:
                payload["tags"] = tags

            response = resend.Emails.send(payload)
            provider_message_id = None
            if isinstance(response, dict):
                provider_message_id = response.get("id")
            logger.info("Email accepted by Resend to %s: %s", to_email, subject)
            return {
                "accepted": True,
                "provider": "resend",
                "provider_message_id": provider_message_id,
                "terminal_state": None,
            }
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception("Failed to send email via Resend to %s", to_email)
            return {
                "accepted": False,
                "provider": "resend",
                "provider_message_id": None,
                "terminal_state": "failed",
            }

    try:
        plain_text = strip_tags(html_body)
        sent_count = send_mail(
            subject=subject,
            message=plain_text,
            from_email=sender,
            recipient_list=[to_email],
            html_message=html_body,
            fail_silently=False,
        )
        accepted = bool(sent_count)
        logger.info("Email sent via Django backend to %s: %s", to_email, subject)
        return {
            "accepted": accepted,
            "provider": "django",
            "provider_message_id": None,
            "terminal_state": "delivered" if accepted else "failed",
        }
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):
        logger.exception("Failed to send email via Django backend to %s", to_email)
        return {
            "accepted": False,
            "provider": "django",
            "provider_message_id": None,
            "terminal_state": "failed",
        }


def _send_via_facility_smtp(
    *, config: Any, subject: str, html_body: str, to_email: str
) -> dict[str, Any]:
    """Send through the selected facility SMTP account without global fallback."""
    if not config.is_configured or config.status != config.Status.HEALTHY:
        logger.warning("Facility SMTP unavailable for facility_id=%s", config.facility_id)
        return {
            "accepted": False,
            "provider": "smtp",
            "provider_message_id": None,
            "terminal_state": "failed",
        }

    try:
        connection = get_connection(
            backend="django.core.mail.backends.smtp.EmailBackend",
            host=config.smtp_host,
            port=config.smtp_port,
            username=config.smtp_username,
            password=config.smtp_password,
            use_tls=config.security_mode == config.SecurityMode.STARTTLS,
            use_ssl=config.security_mode == config.SecurityMode.SSL_TLS,
            fail_silently=False,
        )
        message = EmailMultiAlternatives(
            subject=subject,
            body=strip_tags(html_body),
            from_email=formataddr((config.from_display_name, config.effective_from_address))
            if config.from_display_name
            else config.effective_from_address,
            to=[to_email],
            reply_to=[config.effective_reply_to_address],
            connection=connection,
        )
        message.attach_alternative(html_body, "text/html")
        accepted = bool(connection.send_messages([message]))
        return {
            "accepted": accepted,
            "provider": "smtp",
            "provider_message_id": None,
            "terminal_state": "delivered" if accepted else "failed",
        }
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):
        logger.exception("Facility SMTP send failed for facility_id=%s", config.facility_id)
        return {
            "accepted": False,
            "provider": "smtp",
            "provider_message_id": None,
            "terminal_state": "failed",
        }


# ============================================================================
# Invitation Emails
# ============================================================================


def send_invitation_email(
    *,
    to_email: str,
    token: str,
    invited_by_name: str,
    organization_name: str,
    role_name: str = "",
    department_name: str = "",
    expires_hours: int = 72,
) -> bool:
    """Send a staff invitation email with a link to accept and set up the account."""
    frontend_url = _get_frontend_url()
    accept_url = f"{frontend_url}/invite/{token}"

    html_body = render_to_string(
        "emails/invitation.html",
        {
            "accept_url": accept_url,
            "invited_by_name": invited_by_name,
            "organization_name": organization_name,
            "role_name": role_name,
            "department_name": department_name,
            "expires_hours": expires_hours,
            "support_email": getattr(settings, "SUPPORT_EMAIL", "hello@nexora.africa"),
        },
    )

    return _send(
        subject=f"You're invited to join {organization_name} on Vitora HMIS",
        html_body=html_body,
        to_email=to_email,
    )


# ============================================================================
# Welcome / Credential Emails
# ============================================================================


def send_welcome_email(
    *,
    to_email: str,
    username: str,
    temp_password: str,
    full_name: str,
    organization_name: str,
) -> bool:
    """Send a welcome email with temporary credentials (direct-creation flow)."""
    frontend_url = _get_frontend_url()
    login_url = f"{frontend_url}/login"

    html_body = render_to_string(
        "emails/welcome.html",
        {
            "login_url": login_url,
            "username": username,
            "temp_password": temp_password,
            "full_name": full_name,
            "organization_name": organization_name,
        },
    )

    return _send(
        subject=f"Welcome to {organization_name} — Your Vitora HMIS Account",
        html_body=html_body,
        to_email=to_email,
    )


# ============================================================================
# Password Reset Emails
# ============================================================================


def send_password_reset_email(
    *,
    to_email: str,
    token: str,
    full_name: str,
) -> bool:
    """Send a password reset email with a time-limited link."""
    frontend_url = _get_frontend_url()
    reset_url = f"{frontend_url}/reset-password?token={token}"

    html_body = render_to_string(
        "emails/password_reset.html",
        {
            "reset_url": reset_url,
            "full_name": full_name,
            "support_email": getattr(settings, "SUPPORT_EMAIL", "hello@nexora.africa"),
        },
    )

    return _send(
        subject="Reset your Vitora HMIS password",
        html_body=html_body,
        to_email=to_email,
    )


# ============================================================================
# Organization Verification
# ============================================================================


def send_org_verification_email(
    *,
    to_email: str,
    token: str,
    org_name: str,
    admin_name: str,
) -> bool:
    """Send an email verification link after self-service org signup."""
    frontend_url = _get_frontend_url()
    verify_url = f"{frontend_url}/verify-email?token={token}"

    html_body = render_to_string(
        "emails/org_verification.html",
        {
            "verify_url": verify_url,
            "org_name": org_name,
            "admin_name": admin_name,
        },
    )

    return _send(
        subject="Verify your email — Vitora HMIS",
        html_body=html_body,
        to_email=to_email,
    )


# ============================================================================
# Admin Notifications
# ============================================================================


def send_admin_signup_notification(
    *,
    org_name: str,
    admin_email: str,
    admin_name: str,
    facility_name: str = "",
    facility_mfl_code: str = "",
) -> bool:
    """Notify Nexora platform administrators that an organization has verified its email.

    Sends an email to ADMIN_NOTIFICATION_EMAIL (defaults to DEFAULT_FROM_EMAIL)
    so that a human can review and activate the new organization in Django Admin.
    """
    admin_notify_email = getattr(
        settings,
        "ADMIN_NOTIFICATION_EMAIL",
        getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@vitora.digital"),
    )
    frontend_url = _get_frontend_url()

    facility_rows = ""
    if facility_name:
        facility_rows += (
            f"<tr><td style='padding:4px 12px;font-weight:bold;'>Facility</td>"
            f"<td style='padding:4px 12px;'>{facility_name}</td></tr>"
        )
    if facility_mfl_code:
        facility_rows += (
            f"<tr><td style='padding:4px 12px;font-weight:bold;'>MFL Code</td>"
            f"<td style='padding:4px 12px;'>{facility_mfl_code}</td></tr>"
        )

    html_body = (
        f"<h2>New Organization Signup — Email Verified</h2>"
        f"<p>A new organization has completed email verification and is awaiting activation.</p>"
        f"<table style='border-collapse:collapse;'>"
        f"<tr><td style='padding:4px 12px;font-weight:bold;'>Organization</td>"
        f"<td style='padding:4px 12px;'>{org_name}</td></tr>"
        f"<tr><td style='padding:4px 12px;font-weight:bold;'>Admin Name</td>"
        f"<td style='padding:4px 12px;'>{admin_name}</td></tr>"
        f"<tr><td style='padding:4px 12px;font-weight:bold;'>Admin Email</td>"
        f"<td style='padding:4px 12px;'>{admin_email}</td></tr>"
        f"{facility_rows}"
        f"</table>"
        f"<p>To activate this organization, log in to the "
        f"<a href='{frontend_url}/admin/'>Django Admin</a> and set "
        f"<code>is_active = True</code> on the Organization record.</p>"
    )

    return _send(
        subject=f"[Vitora] New Org Signup: {org_name} — Pending Activation",
        html_body=html_body,
        to_email=admin_notify_email,
    )


# ============================================================================
# User-Facing Signup Lifecycle Emails
# ============================================================================


def send_org_pending_review_email(
    *,
    to_email: str,
    org_name: str,
    admin_name: str,
    facility_name: str = "",
    facility_mfl_code: str = "",
) -> bool:
    """Notify the user that their email is verified and the org is pending admin review."""
    html_body = render_to_string(
        "emails/org_pending_review.html",
        {
            "org_name": org_name,
            "admin_name": admin_name,
            "facility_name": facility_name,
            "facility_mfl_code": facility_mfl_code,
            "support_email": getattr(settings, "SUPPORT_EMAIL", "hello@nexora.africa"),
        },
    )

    return _send(
        subject=f"Email verified — {org_name} is under review",
        html_body=html_body,
        to_email=to_email,
    )


def send_org_activated_email(
    *,
    to_email: str,
    org_name: str,
    admin_name: str,
    facility_name: str = "",
    facility_mfl_code: str = "",
) -> bool:
    """Notify the user that their organization has been activated and they can log in."""
    frontend_url = _get_frontend_url()
    login_url = f"{frontend_url}/login"

    html_body = render_to_string(
        "emails/org_activated.html",
        {
            "org_name": org_name,
            "admin_name": admin_name,
            "facility_name": facility_name,
            "facility_mfl_code": facility_mfl_code,
            "login_url": login_url,
            "support_email": getattr(settings, "SUPPORT_EMAIL", "hello@nexora.africa"),
        },
    )

    return _send(
        subject=f"{org_name} is now active on Vitora HMIS — Log in now!",
        html_body=html_body,
        to_email=to_email,
    )


# ============================================================================
# Licensing Emails
# ============================================================================


def send_activation_code_email(
    *,
    to_email: str,
    organization_name: str,
    activation_code: str,
    installation_name: str = "",
    facility_name: str = "",
) -> bool:
    """Send an activation code to an organization's contact email."""
    html_body = render_to_string(
        "emails/activation_code.html",
        {
            "organization_name": organization_name,
            "activation_code": activation_code,
            "installation_name": installation_name,
            "facility_name": facility_name,
            "support_email": getattr(settings, "SUPPORT_EMAIL", "hello@nexora.africa"),
        },
    )

    return _send(
        subject=f"Vitora HMIS Activation Code — {organization_name}",
        html_body=html_body,
        to_email=to_email,
    )
