# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Pluggable SMS backends used by :mod:`hmis.apps.core.sms_gateway`."""

from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


class BaseSMSBackend:
    """Interface for SMS backends."""

    def send(self, message: str, recipients: list[str], sender_id: str | None = None) -> dict:
        raise NotImplementedError


class MockSMSBackend(BaseSMSBackend):
    """Backend that never talks to an external provider."""

    def send(self, message: str, recipients: list[str], sender_id: str | None = None) -> dict:
        logger.info(
            "MockSMSBackend send: recipients=%s sender_id=%s message_len=%s",
            len(recipients),
            sender_id,
            len(message or ""),
        )
        return {
            "SMSMessageData": {
                "Recipients": [
                    {
                        "number": recipient,
                        "status": "Success",
                        "statusCode": 101,
                        "messageId": f"mock-{idx}",
                        "cost": "KES 0.00",
                    }
                    for idx, recipient in enumerate(recipients, start=1)
                ]
            }
        }


class AfricasTalkingSMSBackend(BaseSMSBackend):
    """Africa's Talking SMS backend adapter."""

    def __init__(self) -> None:
        username = getattr(settings, "AT_USERNAME", None)
        api_key = getattr(settings, "AT_API_KEY", None)
        if not username or not api_key:
            raise ValueError("AT_USERNAME and AT_API_KEY must be configured")

        import africastalking

        africastalking.initialize(username=username, api_key=api_key)
        self._client = africastalking.SMS

    def send(self, message: str, recipients: list[str], sender_id: str | None = None) -> dict:
        return self._client.send(message, recipients, sender_id=sender_id)
