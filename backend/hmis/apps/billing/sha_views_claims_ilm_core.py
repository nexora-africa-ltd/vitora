"""
What this file is for: Core ILM service and error/response helpers for SHA claim actions.
How to use: mixed into SHAClaimViewSet via SHAClaimILMMixin composition; not used directly.
Supported inputs/args: helper methods for ILM service access, response shaping, and DHA error mapping.
"""

# ruff: noqa: ARG002

import logging

from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class SHAClaimILMCoreMixin:
    """Core ILM service and error/response helpers for SHA claim actions."""

    def _ilm_service(self, facility=None):
        from hmis.apps.billing.services.ilm_claim_service import IlmClaimService

        return IlmClaimService(facility=facility)

    def _ilm_response(self, result):
        from rest_framework.response import Response as _R

        response_payload = {
            "status_code": result.status_code,
            "payload": result.payload,
        }
        reconciliation_summary = getattr(result, "reconciliation_summary", None)
        if isinstance(reconciliation_summary, dict):
            response_payload["reconciliation_summary"] = reconciliation_summary

        return _R(
            response_payload,
            status=(
                status.HTTP_200_OK if result.status_code < 400 else status.HTTP_502_BAD_GATEWAY
            ),
        )

    def _ilm_handle_error(self, exc):
        from hmis.apps.billing.services.dha_errors import (
            DHAClientError,
            DHAError,
            DHANotFoundError,
            DHARateLimitedError,
            DHAServerError,
            DHATimeoutError,
            DHATransportError,
            DHAUnauthorizedError,
            DHAValidationError,
        )

        try:
            from hmis.apps.billing.services.ilm_claim_service import _publish_safe
            from hmis.apps.core.events import BillingEvents

            _publish_safe(
                BillingEvents.DHA_CLAIM_CALL_FAILED,
                {
                    "error_class": exc.__class__.__name__,
                    "message": str(exc),
                    "status_code": getattr(exc, "status_code", None),
                    "path": getattr(exc, "path", None),
                },
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):  # noqa: S110 — telemetry failure must not break the API
            pass

        if isinstance(exc, DHAValidationError):
            raw_body = getattr(exc, "response_body", None)
            resolved_message = str(getattr(exc, "message", "") or "").strip()
            resolved_errors = getattr(exc, "errors", None)
            trace_id = None

            def _extract_from_raw_wrapper(body):
                if not isinstance(body, dict):
                    return body
                raw_value = body.get("raw")
                if not isinstance(raw_value, str):
                    return body
                text = raw_value.strip()
                if not text:
                    return body
                if not (text.startswith("{") or text.startswith("[")):
                    return body
                import json

                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return body

            parsed_body = _extract_from_raw_wrapper(raw_body)

            if (not resolved_message or resolved_message.lower() == "ilm error") and parsed_body:
                try:
                    from hmis.apps.billing.services.ilm_client import _extract_message

                    extracted = _extract_message(parsed_body, "")
                    if extracted:
                        resolved_message = extracted
                except (
                    AttributeError,
                    TypeError,
                    ValueError,
                    RuntimeError,
                    OSError,
                    AssertionError,
                    ImportError,
                ):  # noqa: BLE001 - best effort only
                    logger.debug(
                        "Failed to extract validation message from parsed ILM body", exc_info=True
                    )

            if isinstance(parsed_body, dict):
                trace_id = parsed_body.get("trace_id")
                if resolved_errors is None:
                    resolved_errors = parsed_body.get("errors")

            # Last-resort recovery: if middleware returned a generic message but
            # provided trace_id, fetch the audited outbound row and re-extract
            # the upstream error payload from there.
            if (not resolved_message or resolved_message.lower() == "ilm error") and trace_id:
                try:
                    import json

                    from hmis.apps.core.models import DHAOutboundCall

                    audit_call = (
                        DHAOutboundCall.objects.filter(error_message__icontains=str(trace_id))
                        .order_by("-created_at")
                        .first()
                    )
                    if audit_call and audit_call.error_message:
                        raw_error = audit_call.error_message.strip()
                        if raw_error.startswith("{") or raw_error.startswith("["):
                            parsed_audit = json.loads(raw_error)
                            from hmis.apps.billing.services.ilm_client import _extract_message

                            extracted = _extract_message(parsed_audit, "")
                            if extracted:
                                resolved_message = extracted
                            if resolved_errors is None and isinstance(parsed_audit, dict):
                                resolved_errors = parsed_audit.get("errors")
                except (
                    AttributeError,
                    TypeError,
                    ValueError,
                    RuntimeError,
                    OSError,
                    AssertionError,
                    ImportError,
                ):  # noqa: BLE001 - best effort only
                    logger.debug(
                        "Failed to recover ILM validation error from outbound audit",
                        exc_info=True,
                    )

            return Response(
                {
                    "error": resolved_message or "Validation error",
                    "errors": resolved_errors,
                    **({"trace_id": trace_id} if trace_id else {}),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if isinstance(exc, DHAUnauthorizedError):
            return Response(
                {"error": exc.message, "code": "dha_unauthorized"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if isinstance(exc, DHANotFoundError):
            return Response({"error": exc.message}, status=status.HTTP_404_NOT_FOUND)
        if isinstance(exc, DHARateLimitedError):
            return Response({"error": exc.message}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if isinstance(exc, DHAClientError):
            return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        if isinstance(exc, (DHATimeoutError, DHATransportError, DHAServerError)):
            return Response({"error": exc.message}, status=status.HTTP_502_BAD_GATEWAY)
        if isinstance(exc, DHAError):
            return Response({"error": exc.message}, status=status.HTTP_502_BAD_GATEWAY)
        from hmis.apps.billing.services.consent_token_resolver import (
            ConsentTokenExpiredError,
            ConsentTokenNotFoundError,
        )
        from hmis.apps.billing.services.ilm_claim_service import VisitAlreadyOpenedError

        if isinstance(exc, ConsentTokenNotFoundError):
            return Response(
                {
                    "error": "No validated consent token for this claim. "
                    "Please complete the consent flow for the patient.",
                    "code": "consent_token_not_found",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if isinstance(exc, ConsentTokenExpiredError):
            return Response(
                {
                    "error": "Consent token has expired. Please re-consent the patient.",
                    "code": "consent_token_expired",
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if isinstance(exc, VisitAlreadyOpenedError):
            return Response(
                {
                    "error": str(exc),
                    "code": "visit_already_opened",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if isinstance(exc, ValueError):
            return Response(
                {"error": str(exc), "code": "invalid_request"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if isinstance(exc, RuntimeError):
            return Response(
                {"error": str(exc), "code": "operation_failed"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        logger.exception("Unexpected ILM error: %s", exc)
        return Response(
            {"error": str(exc) or "Internal error during DHA HIE call"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
