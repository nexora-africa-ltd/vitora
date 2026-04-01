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
from typing import Any

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


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
    sender = from_email or getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@vitora.health")
    resend_key = getattr(settings, "RESEND_API_KEY", "") or ""

    if resend_key:
        # Production path — Resend SDK
        try:
            import resend  # type: ignore

            resend.api_key = resend_key
            resend.Emails.send(
                {
                    "from": sender,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_body,
                }
            )
            logger.info("Email sent via Resend to %s: %s", to_email, subject)
            return True
        except Exception:
            logger.exception("Failed to send email via Resend to %s", to_email)
            return False
    else:
        # Development path — Django email backend (console)
        try:
            plain_text = strip_tags(html_body)
            send_mail(
                subject=subject,
                message=plain_text,
                from_email=sender,
                recipient_list=[to_email],
                html_message=html_body,
                fail_silently=False,
            )
            logger.info("Email sent via Django backend to %s: %s", to_email, subject)
            return True
        except Exception:
            logger.exception("Failed to send email via Django backend to %s", to_email)
            return False


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
            "support_email": getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@vitora.health"),
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
            "support_email": getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@vitora.health"),
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
