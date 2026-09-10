# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Paystack subscription payment endpoints.

Webhook use: configure POST /api/payments/paystack/webhook/ in Paystack.
Inputs: Paystack-signed charge.success payloads; no user authentication.
"""

import hashlib
import hmac
import json
from decimal import Decimal

import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from hmis.apps.core.models import SubscriptionPeriod


@csrf_exempt
@require_POST
def paystack_webhook(request):
    """Verify a Paystack event then confirm its matching subscription period."""
    secret_key = getattr(settings, "PAYSTACK_SECRET_KEY", "")
    signature = request.headers.get("x-paystack-signature", "")
    expected = hmac.new(secret_key.encode("utf-8"), request.body, hashlib.sha512).hexdigest()
    if not secret_key or not signature or not hmac.compare_digest(signature, expected):
        return JsonResponse({"detail": "Invalid Paystack signature."}, status=400)
    try:
        event = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON payload."}, status=400)
    if event.get("event") != "charge.success":
        return JsonResponse({"status": "ignored"})
    payment = event.get("data") or {}
    reference = str(payment.get("reference") or "")
    if not reference:
        return JsonResponse({"detail": "Payment reference is required."}, status=400)
    try:
        period = SubscriptionPeriod.objects.get(payment_reference=reference)
    except SubscriptionPeriod.DoesNotExist:
        return JsonResponse({"status": "ignored"})
    try:
        verification = requests.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {secret_key}"},
            timeout=15,
        )
        verification.raise_for_status()
        verified = verification.json().get("data") or {}
    except (requests.RequestException, ValueError):
        return JsonResponse({"detail": "Unable to verify Paystack transaction."}, status=502)
    if verified.get("status") != "success":
        return JsonResponse({"detail": "Payment has not completed."}, status=400)
    if (
        verified.get("currency") != period.currency
        or Decimal(str(verified.get("amount", 0))) != period.amount * 100
    ):
        return JsonResponse(
            {"detail": "Payment amount or currency does not match the subscription period."},
            status=400,
        )
    period.confirm_payment(reference)
    return JsonResponse({"status": "confirmed", "reference": reference})
