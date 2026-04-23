"""
Web Push notification service.

Sends browser push notifications to users via the Web Push protocol (RFC 8030)
using VAPID authentication. Subscriptions are stored in PushSubscription model.

Usage:
    from hmis.apps.core.services.push_service import send_push_to_user

    send_push_to_user(
        user=user,
        title="Lab Results Ready",
        body="Your blood test results are available.",
        url="/lab/results/123",
    )
"""

import json
import logging

from django.conf import settings
from pywebpush import WebPushException, webpush

logger = logging.getLogger(__name__)


def _get_vapid_claims() -> dict:
    """Return VAPID claims dict for pywebpush."""
    return {"sub": settings.VAPID_CLAIM_EMAIL}


def send_push_notification(subscription_info: dict, payload: dict) -> bool:
    """
    Send a single push notification.

    Args:
        subscription_info: {"endpoint": ..., "keys": {"p256dh": ..., "auth": ...}}
        payload: JSON-serializable notification data

    Returns:
        True if sent successfully, False otherwise.
    """
    private_key = settings.VAPID_PRIVATE_KEY
    if not private_key:
        logger.warning("VAPID_PRIVATE_KEY not configured — skipping push notification")
        return False

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims=_get_vapid_claims(),
            timeout=10,
        )
        return True
    except WebPushException as e:
        status_code = getattr(e.response, "status_code", None) if hasattr(e, "response") else None
        if status_code in (404, 410):
            # Subscription expired or unsubscribed — clean up
            logger.info("Push subscription expired (HTTP %s), removing", status_code)
            _remove_subscription(subscription_info["endpoint"])
        else:
            logger.warning("Web push failed: %s", e)
        return False
    except Exception:
        logger.exception("Unexpected error sending push notification")
        return False


def _remove_subscription(endpoint: str) -> None:
    """Remove an expired/invalid push subscription."""
    from hmis.apps.core.models import PushSubscription

    PushSubscription.objects.filter(endpoint=endpoint).delete()


def send_push_to_user(
    user,
    title: str,
    body: str,
    url: str = "",
    tag: str = "",
    icon: str = "/logo.png",
) -> int:
    """
    Send a push notification to all of a user's subscribed browsers/devices.

    Args:
        user: User instance
        title: Notification title
        body: Notification body text
        url: URL to open when notification is clicked
        tag: Notification tag (for grouping/replacing)
        icon: Notification icon URL

    Returns:
        Number of successfully sent notifications.
    """
    from hmis.apps.core.models import PushSubscription

    subscriptions = PushSubscription.objects.filter(user=user)
    if not subscriptions.exists():
        return 0

    payload = {
        "title": title,
        "body": body,
        "icon": icon,
        "tag": tag or "vitora-notification",
        "data": {"url": url},
    }

    sent_count = 0
    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {
                "p256dh": sub.p256dh,
                "auth": sub.auth,
            },
        }
        if send_push_notification(subscription_info, payload):
            sent_count += 1

    return sent_count
