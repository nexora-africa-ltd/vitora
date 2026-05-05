"""
HL7 message queue service.

Handles enqueuing, sending, and retrying HL7 messages via MLLP.
Uses the existing MLLPClient from laboratory.services for transport.

Endpoint resolution order:
1. Explicit destination_host/port passed to enqueue()
2. Facility-scoped HL7Endpoint from the database (by endpoint_type)
3. Global settings fallback (MLLP_HOST / MLLP_PORT)
"""

import logging
from typing import TYPE_CHECKING

from django.conf import settings
from django.utils import timezone

from hmis.apps.hl7.models import HL7Message, HL7MessageStatus

if TYPE_CHECKING:
    from hmis.apps.hl7.models import HL7Endpoint

logger = logging.getLogger(__name__)


class HL7QueueService:
    """Queue and retry service for HL7 messages."""

    RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 240]  # Exponential backoff schedule

    @classmethod
    def resolve_endpoint(
        cls,
        facility_id: int | None = None,
        endpoint_type: str = "LIS",
    ) -> "HL7Endpoint | None":
        """
        Resolve the active HL7 endpoint for a facility and type.

        Returns None if no matching endpoint is found.
        """
        from hmis.apps.hl7.models import HL7Endpoint

        if not facility_id:
            return None

        return HL7Endpoint.objects.filter(
            facility_id=facility_id,
            endpoint_type=endpoint_type,
            is_active=True,
        ).first()

    @classmethod
    def enqueue(
        cls,
        message_type: str,
        raw_message: str,
        message_control_id: str,
        resource_type: str = "",
        resource_id: int | None = None,
        destination_host: str = "",
        destination_port: int | None = None,
        facility_id: int | None = None,
        endpoint_type: str = "LIS",
    ) -> HL7Message:
        """
        Enqueue an HL7 message for delivery.

        Endpoint resolution order:
        1. Explicit destination_host/port (if provided)
        2. Facility-scoped HL7Endpoint from DB
        3. Global settings fallback

        Returns:
            The created HL7Message instance.
        """
        endpoint = None
        host = destination_host
        port = destination_port

        # Resolve from facility endpoint if not explicitly provided
        if not host and facility_id:
            endpoint = cls.resolve_endpoint(facility_id, endpoint_type)
            if endpoint:
                host = endpoint.mllp_host
                port = endpoint.mllp_port

        # Fall back to global settings
        if not host:
            host = getattr(settings, "HL7_MLLP_HOST", "") or getattr(settings, "MLLP_HOST", "")
        if not port:
            port = getattr(settings, "HL7_MLLP_PORT", None) or getattr(settings, "MLLP_PORT", None)

        msg = HL7Message.objects.create(
            message_type=message_type,
            raw_message=raw_message,
            message_control_id=message_control_id,
            resource_type=resource_type,
            resource_id=resource_id,
            endpoint=endpoint,
            destination_host=host or "",
            destination_port=port,
            facility_id=facility_id,
        )

        # Auto-send if integration enabled and host configured
        if cls._is_enabled() and host:
            cls._try_send(msg)

        return msg

    @classmethod
    def retry_pending(cls, batch_size: int = 50) -> dict:
        """
        Process pending/failed messages that are due for retry.

        Returns:
            dict with counts: sent, failed, skipped
        """
        now = timezone.now()
        messages = HL7Message.objects.filter(
            status__in=[HL7MessageStatus.PENDING, HL7MessageStatus.FAILED],
            next_retry_at__lte=now,
        ).order_by("next_retry_at")[:batch_size]

        results = {"sent": 0, "failed": 0, "dead_letter": 0}

        for msg in messages:
            if not msg.is_retryable and msg.status == HL7MessageStatus.FAILED:
                msg.mark_dead_letter()
                results["dead_letter"] += 1
                continue

            if cls._try_send(msg):
                results["sent"] += 1
            else:
                results["failed"] += 1

        return results

    @classmethod
    def _try_send(cls, msg: HL7Message) -> bool:
        """
        Attempt to send an HL7 message via MLLP.

        Returns True on success, False on failure.
        """
        if not msg.destination_host or not msg.destination_port:
            msg.status = HL7MessageStatus.FAILED
            msg.last_error = "No MLLP destination configured"
            msg.save(update_fields=["status", "last_error", "updated_at"])
            return False

        msg.status = HL7MessageStatus.SENDING
        msg.save(update_fields=["status", "updated_at"])

        try:
            from hmis.apps.laboratory.services.mllp_client import MLLPClient, MLLPConfig

            config = MLLPConfig(host=msg.destination_host, port=msg.destination_port)
            client = MLLPClient(config)
            with client:
                mllp_response = client.send_message(msg.raw_message)

            response_text = mllp_response.message if mllp_response else ""

            # Parse ACK
            if response_text:
                ack_code = cls._parse_ack_code(response_text)
                msg.ack_code = ack_code
                if ack_code == "AA":
                    msg.status = HL7MessageStatus.ACKNOWLEDGED
                    msg.acknowledged_at = timezone.now()
                    msg.sent_at = timezone.now()
                else:
                    msg.status = HL7MessageStatus.FAILED
                    msg.last_error = f"Negative ACK: {ack_code}"
            else:
                msg.status = HL7MessageStatus.SENT
                msg.sent_at = timezone.now()

            msg.save(
                update_fields=[
                    "status",
                    "ack_code",
                    "sent_at",
                    "acknowledged_at",
                    "last_error",
                    "updated_at",
                ]
            )
            return msg.status in (HL7MessageStatus.SENT, HL7MessageStatus.ACKNOWLEDGED)

        except Exception as exc:
            msg.status = HL7MessageStatus.FAILED
            msg.retry_count += 1
            msg.last_error = str(exc)[:500]

            # Calculate next retry with exponential backoff
            backoff_idx = min(msg.retry_count - 1, len(cls.RETRY_BACKOFF_MINUTES) - 1)
            from datetime import timedelta

            msg.next_retry_at = timezone.now() + timedelta(
                minutes=cls.RETRY_BACKOFF_MINUTES[backoff_idx]
            )

            if msg.retry_count >= msg.max_retries:
                msg.status = HL7MessageStatus.DEAD_LETTER

            msg.save(
                update_fields=[
                    "status",
                    "retry_count",
                    "last_error",
                    "next_retry_at",
                    "updated_at",
                ]
            )

            logger.warning(
                "HL7 send failed for %s (attempt %d/%d): %s",
                msg.message_control_id,
                msg.retry_count,
                msg.max_retries,
                exc,
            )
            return False

    @classmethod
    def _parse_ack_code(cls, response: str) -> str:
        """Extract ACK code from HL7 ACK response."""
        for line in response.split("\r"):
            if line.startswith("MSA|"):
                parts = line.split("|")
                if len(parts) >= 2:
                    return parts[1]
        return ""

    @classmethod
    def _is_enabled(cls) -> bool:
        """Check if HL7 integration is enabled."""
        return getattr(settings, "HL7_INTEGRATION_ENABLED", True)
