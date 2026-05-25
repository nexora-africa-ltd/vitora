"""
Slack notification service for Vitora HMIS.

Posts simple block-style messages to an incoming webhook URL.
Wired into the org signup lifecycle so the team gets notified when:

  * a new organization completes the signup form (``send_signup_received``)
  * a new organization verifies its email (``send_signup_verified``)

Configuration (settings / env vars):
    SLACK_SIGNUP_WEBHOOK_URL  – Slack Incoming Webhook URL. When empty
                                the service is a no-op (safe for dev/tests).
"""

from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _post(payload: dict[str, Any]) -> bool:
    """Post a payload to the configured Slack webhook. Returns True on success."""
    webhook_url = getattr(settings, "SLACK_SIGNUP_WEBHOOK_URL", "") or ""

    # Safety: never call out to Slack from the test runner.
    if getattr(settings, "TESTING", False):
        return False

    if not webhook_url:
        # No webhook configured — treat as a graceful no-op.
        return False

    try:
        resp = requests.post(
            webhook_url,
            json=payload,
            timeout=5,
        )
        if 200 <= resp.status_code < 300:
            return True
        logger.warning("Slack webhook returned status %s", resp.status_code)
        return False
    except requests.RequestException:
        logger.exception("Slack webhook call failed")
        return False
    except Exception:
        logger.exception("Unexpected error posting to Slack webhook")
        return False


def _fields(rows: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Format a list of (label, value) pairs as Slack ``mrkdwn`` field blocks."""
    return [{"type": "mrkdwn", "text": f"*{label}*\n{value or '—'}"} for label, value in rows]


def send_signup_received(
    *,
    org_name: str,
    admin_name: str,
    admin_email: str,
    facility_name: str = "",
    facility_mfl_code: str = "",
    operating_mode: str = "",
) -> bool:
    """Notify Slack that a new organization just submitted the signup form."""
    payload = {
        "text": f":wave: New Vitora signup: {org_name}",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": ":wave: New Vitora signup"},
            },
            {
                "type": "section",
                "fields": _fields(
                    [
                        ("Organization", org_name),
                        ("Admin", f"{admin_name} <{admin_email}>"),
                        ("Facility", facility_name),
                        ("MFL Code", facility_mfl_code),
                        ("Operating Mode", operating_mode or "FULL_HMIS"),
                        ("Status", ":hourglass_flowing_sand: Awaiting email verification"),
                    ]
                ),
            },
        ],
    }
    return _post(payload)


def send_signup_verified(
    *,
    org_name: str,
    admin_name: str,
    admin_email: str,
    facility_name: str = "",
    facility_mfl_code: str = "",
    operating_mode: str = "",
) -> bool:
    """Notify Slack that an org verified its email and is awaiting activation."""
    payload = {
        "text": f":white_check_mark: Vitora signup verified: {org_name}",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": ":white_check_mark: Signup verified — needs activation",
                },
            },
            {
                "type": "section",
                "fields": _fields(
                    [
                        ("Organization", org_name),
                        ("Admin", f"{admin_name} <{admin_email}>"),
                        ("Facility", facility_name),
                        ("MFL Code", facility_mfl_code),
                        ("Operating Mode", operating_mode or "FULL_HMIS"),
                        ("Next step", "Activate in Django Admin"),
                    ]
                ),
            },
        ],
    }
    return _post(payload)
