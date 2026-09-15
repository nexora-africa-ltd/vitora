# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Shared API error-response helpers for DRF views.

This module standardizes safe error payloads returned by API endpoints.
Use ``safe_error_response`` inside ``except`` blocks to avoid leaking raw
exception internals for unexpected errors while preserving useful validation
messages for expected client mistakes.
"""

from __future__ import annotations

import logging
from typing import Any

from rest_framework import status
from rest_framework.response import Response


def safe_error_response(
    *,
    action: str,
    exc: Exception,
    logger: logging.Logger,
    fallback: str = "Operation failed.",
    default_status: int = status.HTTP_400_BAD_REQUEST,
    expose_message_for: tuple[type[Exception], ...] = (ValueError,),
    extra_payload: dict[str, Any] | None = None,
) -> Response:
    """Build a safe DRF error response.

    Args:
        action: Stable action name for structured logging.
        exc: Caught exception.
        logger: Logger instance for structured event logging.
        fallback: Generic user-facing fallback message.
        default_status: HTTP status code if no explicit code is available.
        expose_message_for: Exception types allowed to expose ``str(exc)``.
        extra_payload: Additional response fields to merge into payload.
    """

    logger.warning(
        "API action failed",
        extra={"action": action, "error_class": exc.__class__.__name__},
    )

    message = fallback
    http_status = default_status

    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int) and 400 <= status_code <= 599:
        http_status = status_code

    if isinstance(exc, expose_message_for):
        message = str(exc) or fallback

    payload: dict[str, Any] = {"error": message}
    if extra_payload:
        payload.update(extra_payload)
    return Response(payload, status=http_status)
