"""Shared HTTP client for the DHA HIE Middleware (ILM).

Every per-domain ILM service (claim build, preauth, emergency, prescriptions,
etc.) goes through this client so that:

* JWT auth is injected automatically (via :class:`SHAAuthService`).
* 5xx / 429 / connection failures are retried with exponential backoff.
* Each call writes a :class:`hmis.apps.core.models.DHAOutboundCall` audit row.
* PII fields are redacted before persistence.
* Errors are mapped to a typed exception hierarchy (``DHAError`` family).

It is intentionally thin: it does **not** know about claim/preauth shapes —
those live in the per-domain services.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

import requests
from django.conf import settings

from .dha_errors import DHAError, DHATimeoutError, DHATransportError, from_status
from .sha_auth import SHAAuthError, SHAAuthService

logger = logging.getLogger(__name__)

# Fields stripped from request payloads before audit persistence (Kenya DPA 2019).
_PII_FIELDS = frozenset(
    {
        "national_id",
        "id_number",
        "identification_number",
        "phone",
        "phone_number",
        "msisdn",
        "beneficiary_contact_id",
        "otp",
        "consent_token",  # tracked separately on the audit row
        "client_secret",
        "password",
        "access_token",
        "refresh_token",
        "Authorization",
        "authorization",
    }
)

_REQUEST_ID: ContextVar[str | None] = ContextVar("dha_request_id", default=None)


def set_request_id(request_id: str | None) -> None:
    """Bind a correlation id (typically the inbound HTTP request id) to ILM calls."""
    _REQUEST_ID.set(request_id)


def _redact(value: Any, depth: int = 0) -> Any:
    if depth > 6:
        return "..."
    if isinstance(value, Mapping):
        out = {}
        for k, v in value.items():
            if k in _PII_FIELDS:
                out[k] = "***REDACTED***"
            else:
                out[k] = _redact(v, depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [_redact(v, depth + 1) for v in value]
    return value


@dataclass
class IlmResponse:
    """Lightweight wrapper around a successful ILM response."""

    status_code: int
    headers: Mapping[str, str]
    json: Any = None
    text: str = ""
    elapsed_ms: int = 0
    audit_id: int | None = None
    raw: requests.Response | None = field(default=None, repr=False)


class IlmClient:
    """Synchronous HTTP client targeting the DHA HIE Middleware (ILM)."""

    DEFAULT_RETRY_STATUSES: frozenset[int] = frozenset({429, 500, 502, 503, 504})

    def __init__(
        self,
        *,
        auth_service: SHAAuthService | None = None,
        base_url: str | None = None,
        timeout: int | None = None,
        max_retries: int | None = None,
        backoff_seconds: float | None = None,
        session: requests.Session | None = None,
    ) -> None:
        self.auth_service = auth_service or SHAAuthService()
        self.base_url = (
            base_url or getattr(settings, "ILM_BASE_URL", None) or self.auth_service.auth_base_url
        ).rstrip("/")
        self.timeout = int(
            timeout
            if timeout is not None
            else getattr(settings, "ILM_REQUEST_TIMEOUT", getattr(settings, "SHA_API_TIMEOUT", 30))
        )
        self.max_retries = int(
            max_retries if max_retries is not None else getattr(settings, "ILM_MAX_RETRIES", 2)
        )
        self.backoff_seconds = float(
            backoff_seconds
            if backoff_seconds is not None
            else getattr(settings, "ILM_BACKOFF_SECONDS", 0.5)
        )
        self._session = session or requests.Session()

    # --------------- public verbs ----------------------------------------

    def get(self, path: str, **kwargs: Any) -> IlmResponse:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> IlmResponse:
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> IlmResponse:
        return self.request("PATCH", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> IlmResponse:
        return self.request("PUT", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> IlmResponse:
        return self.request("DELETE", path, **kwargs)

    # --------------- core --------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json_body: Any = None,
        data: Any = None,
        files: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        consent_token: str | None = None,
        facility: Any = None,
        user: Any = None,
        retry_statuses: frozenset[int] | None = None,
        idempotency_key: str | None = None,
    ) -> IlmResponse:
        method = method.upper()
        url = self._build_url(path)
        retry_statuses = retry_statuses or self.DEFAULT_RETRY_STATUSES
        correlation_id = _REQUEST_ID.get() or uuid.uuid4().hex

        merged_headers: dict[str, str] = {"Accept": "application/json"}
        # Auth (best-effort; we still want to log the failure if it raises)
        try:
            merged_headers.update(self.auth_service.get_auth_headers())
        except SHAAuthError as exc:
            self._record_audit(
                method=method,
                path=path,
                status=_audit_status_for_exception(exc),
                status_code=exc.status_code or None,
                duration_ms=0,
                attempt=1,
                consent_token=consent_token,
                correlation_id=correlation_id,
                facility=facility,
                user=user,
                request_payload=None,
                response_excerpt=None,
                error_message=str(exc),
                error_code="auth_failed",
            )
            raise from_status(
                exc.status_code or 401,
                f"DHA auth failed: {exc.message}",
                method=method,
                path=path,
            ) from exc

        if files is None and json_body is not None and "Content-Type" not in merged_headers:
            merged_headers["Content-Type"] = "application/json"
        if files is not None:
            # Let requests auto-set Content-Type with multipart boundary
            merged_headers.pop("Content-Type", None)

        # DHA requires facility identification headers on all requests.
        if facility and hasattr(facility, "dha_fr_code") and facility.dha_fr_code:
            merged_headers["X-Facility-Id"] = facility.dha_fr_code
            merged_headers["X-Facility-Id-Type"] = "fr-code"
        elif getattr(settings, "SHA_FACILITY_FR_CODE", ""):
            merged_headers["X-Facility-Id"] = settings.SHA_FACILITY_FR_CODE
            merged_headers["X-Facility-Id-Type"] = "fr-code"

        if headers:
            merged_headers.update(headers)
        if idempotency_key:
            merged_headers.setdefault("Idempotency-Key", idempotency_key)
        merged_headers.setdefault("X-Correlation-Id", correlation_id)

        # Build redacted payload for audit (do NOT send the redacted version!)
        audit_payload = _redact(json_body if json_body is not None else data)

        last_exc: Exception | None = None
        attempt = 0
        while attempt < self.max_retries + 1:
            attempt += 1
            started = time.monotonic()
            try:
                response = self._session.request(
                    method,
                    url,
                    params=params,
                    json=json_body if files is None else None,
                    data=data if files is not None or json_body is None else None,
                    files=files,
                    headers=merged_headers,
                    timeout=self.timeout,
                )
            except requests.Timeout as exc:
                last_exc = exc
                duration_ms = int((time.monotonic() - started) * 1000)
                logger.warning(
                    "ILM timeout %s %s attempt=%d duration=%dms", method, path, attempt, duration_ms
                )
                if attempt > self.max_retries:
                    self._record_audit(
                        method=method,
                        path=path,
                        status="TIMEOUT",
                        status_code=None,
                        duration_ms=duration_ms,
                        attempt=attempt,
                        consent_token=consent_token,
                        correlation_id=correlation_id,
                        facility=facility,
                        user=user,
                        request_payload=audit_payload,
                        response_excerpt=None,
                        error_message=str(exc),
                        error_code="timeout",
                    )
                    raise DHATimeoutError(
                        f"Timed out after {attempt} attempt(s)", method=method, path=path
                    ) from exc
                self._sleep_backoff(attempt)
                continue
            except requests.RequestException as exc:
                last_exc = exc
                duration_ms = int((time.monotonic() - started) * 1000)
                logger.warning(
                    "ILM transport error %s %s attempt=%d err=%s", method, path, attempt, exc
                )
                if attempt > self.max_retries:
                    self._record_audit(
                        method=method,
                        path=path,
                        status="TRANSPORT",
                        status_code=None,
                        duration_ms=duration_ms,
                        attempt=attempt,
                        consent_token=consent_token,
                        correlation_id=correlation_id,
                        facility=facility,
                        user=user,
                        request_payload=audit_payload,
                        response_excerpt=None,
                        error_message=str(exc),
                        error_code="transport_error",
                    )
                    raise DHATransportError(
                        f"Transport error: {exc}", method=method, path=path
                    ) from exc
                self._sleep_backoff(attempt)
                continue

            duration_ms = int((time.monotonic() - started) * 1000)
            status_code = response.status_code

            if status_code in retry_statuses and attempt <= self.max_retries:
                logger.warning(
                    "ILM retryable status %s %s -> %d attempt=%d",
                    method,
                    path,
                    status_code,
                    attempt,
                )
                self._sleep_backoff(attempt)
                continue

            audit_status = (
                "SUCCESS"
                if 200 <= status_code < 400
                else ("CLIENT_ERROR" if status_code < 500 else "SERVER_ERROR")
            )
            response_excerpt = _safe_response_excerpt(response)
            audit_row_id = self._record_audit(
                method=method,
                path=path,
                status=audit_status,
                status_code=status_code,
                duration_ms=duration_ms,
                attempt=attempt,
                consent_token=consent_token,
                correlation_id=correlation_id,
                facility=facility,
                user=user,
                request_payload=audit_payload,
                response_excerpt=response_excerpt,
                error_message="" if audit_status == "SUCCESS" else (response.text or "")[:500],
                error_code="" if audit_status == "SUCCESS" else f"http_{status_code}",
            )

            if audit_status != "SUCCESS":
                raise from_status(
                    status_code,
                    _extract_message(response_excerpt, response.text),
                    method=method,
                    path=path,
                    response_body=response_excerpt,
                )

            return IlmResponse(
                status_code=status_code,
                headers=dict(response.headers),
                json=response_excerpt if isinstance(response_excerpt, (dict, list)) else None,
                text=response.text,
                elapsed_ms=duration_ms,
                audit_id=audit_row_id,
                raw=response,
            )

        # Defensive — loop should always either return or raise.
        raise DHAError(
            f"ILM request failed after {self.max_retries + 1} attempts: {last_exc}",
            method=method,
            path=path,
        )

    # --------------- helpers ----------------------------------------------

    def _build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}{path}"

    def _sleep_backoff(self, attempt: int) -> None:
        delay = self.backoff_seconds * (2 ** (attempt - 1))
        time.sleep(delay)

    def _record_audit(self, **fields: Any) -> int | None:
        """Persist a DHAOutboundCall row. Failures must never break the request."""
        try:
            from hmis.apps.core.models import DHAOutboundCall  # late import: avoid cycles

            call = DHAOutboundCall.objects.create(
                method=fields["method"],
                path=fields["path"],
                base_url=self.base_url,
                auth_mode=getattr(self.auth_service, "auth_mode", ""),
                status=fields["status"],
                status_code=fields["status_code"],
                duration_ms=fields["duration_ms"],
                attempt=fields["attempt"],
                consent_token=(fields.get("consent_token") or "")[:255],
                correlation_id=(fields.get("correlation_id") or "")[:64],
                request_id=(fields.get("correlation_id") or "")[:64],
                facility=fields.get("facility"),
                user=fields.get("user"),
                request_payload=fields.get("request_payload"),
                response_excerpt=fields.get("response_excerpt"),
                error_message=(fields.get("error_message") or "")[:5000],
                error_code=(fields.get("error_code") or "")[:64],
            )
            return call.pk
        except Exception:  # pragma: no cover - never break on audit failure
            logger.exception("Failed to record DHA outbound audit row")
            return None


def _safe_response_excerpt(response: requests.Response, max_bytes: int = 4096) -> Any:
    text = (response.text or "")[:max_bytes]
    ctype = response.headers.get("Content-Type", "")
    if "json" in ctype.lower():
        try:
            return response.json() if len(response.text or "") <= max_bytes else json.loads(text)
        except (ValueError, json.JSONDecodeError):
            return {"raw": text}
    return {"raw": text}


def _extract_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, Mapping):
        for key in ("message", "error", "detail", "Error"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
    return (fallback or "ILM error").strip()[:500]


def _audit_status_for_exception(exc: SHAAuthError) -> str:
    return "CLIENT_ERROR" if exc.status_code and exc.status_code < 500 else "TRANSPORT"
