# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Inbound SMS webhook handlers."""

from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog, SMSDeliveryCallback
from hmis.apps.core.openapi import SchemaFallbackSerializer


def _normalize_delivery_status(raw_status: str) -> str:
    value = (raw_status or "").strip().lower()
    if value in {"success", "delivered", "sent"}:
        return SMSDeliveryCallback.DeliveryStatus.DELIVERED
    if value in {"failed", "rejected", "undelivered"}:
        return SMSDeliveryCallback.DeliveryStatus.FAILED
    if value in {"queued", "buffered", "pending", "submitted"}:
        return SMSDeliveryCallback.DeliveryStatus.PENDING
    return SMSDeliveryCallback.DeliveryStatus.UNKNOWN


def _mask_last4(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return digits[-4:] if digits else ""


def _parse_retry_count(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


class AfricasTalkingSMSCallbackView(APIView):
    """Receives Africa's Talking SMS delivery callbacks."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}

    def post(self, request):
        configured_token = getattr(settings, "AT_SMS_CALLBACK_TOKEN", "")
        provided_token = (
            request.headers.get("X-Callback-Token")
            or request.query_params.get("token")
            or request.data.get("token")
        )

        token_valid = True
        if configured_token:
            token_valid = provided_token == configured_token
            if not token_valid:
                return Response(
                    {"detail": "Unauthorized callback token."}, status=status.HTTP_403_FORBIDDEN
                )

        payload = request.data if isinstance(request.data, dict) else {"raw": str(request.data)}

        raw_status = str(payload.get("status") or payload.get("deliveryStatus") or "")
        callback = SMSDeliveryCallback.objects.create(
            provider="africastalking",
            provider_message_id=str(payload.get("id") or payload.get("messageId") or ""),
            status=raw_status,
            delivery_status=_normalize_delivery_status(raw_status),
            phone_last4=_mask_last4(str(payload.get("phoneNumber") or payload.get("to") or "")),
            network_code=str(payload.get("networkCode") or ""),
            retry_count=_parse_retry_count(payload.get("retryCount")),
            failure_reason=str(payload.get("failureReason") or payload.get("description") or ""),
            callback_payload=payload,
            callback_ip=request.META.get("REMOTE_ADDR"),
            token_valid=token_valid,
        )

        AuditLog.log(
            action="sms_delivery_callback_received",
            user=None,
            resource_type="SMSDeliveryCallback",
            resource_id=callback.id,
            ip_address=request.META.get("REMOTE_ADDR"),
            details={
                "provider": callback.provider,
                "provider_message_id": callback.provider_message_id,
                "delivery_status": callback.delivery_status,
                "status": callback.status,
                "phone_last4": callback.phone_last4,
                "token_valid": callback.token_valid,
            },
        )

        return Response({"status": "ok"}, status=status.HTTP_200_OK)
