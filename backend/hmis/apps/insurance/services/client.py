"""Reusable HTTP client for private insurance API integrations.

Mirrors ``IlmClient`` from the DHA HIE integration. Each outbound call is
audited via :class:`~hmis.apps.insurance.models.InsuranceOutboundCall`.
PII fields are redacted before persistence.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

import requests

from .errors import InsuranceTimeoutError, InsuranceTransportError, from_status

logger = logging.getLogger(__name__)

# PII fields stripped from payloads before audit persistence (Kenya DPA 2019).
_PII_FIELDS = frozenset(
    {
        "national_id",
        "id_number",
        "identification_number",
        "phone",
        "phone_number",
        "msisdn",
        "member_number",
        "policy_number",
        "client_secret",
        "password",
        "access_token",
        "refresh_token",
        "Authorization",
        "authorization",
        "api_key",
    }
)

_REQUEST_ID: ContextVar[str | None] = ContextVar("insurance_request_id", default=None)


def set_request_id(request_id: str | None) -> None:
    """Bind a correlation id to insurance outbound calls."""
    _REQUEST_ID.set(request_id)


def _redact(value: Any, depth: int = 0) -> Any:
    """Recursively replace PII fields with ``***REDACTED***``."""
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


def _audit_status_for_code(status_code: int | None) -> str:
    """Map HTTP status code to audit status string."""
    if status_code is None:
        return "TRANSPORT"
    if 200 <= status_code < 400:
        return "SUCCESS"
    if 400 <= status_code < 500:
        return "CLIENT_ERROR"
    return "SERVER_ERROR"


@dataclass
class InsuranceResponse:
    """Lightweight wrapper around a successful insurer API response."""

    status_code: int
    headers: Mapping[str, str]
    json: Any = None
    text: str = ""
    elapsed_ms: int = 0
    audit_id: int | None = None
    raw: requests.Response | None = field(default=None, repr=False)


class InsuranceHttpClient:
    """Synchronous HTTP client for private insurer APIs.

    Instantiated per-provider using :class:`InsuranceProviderConfig` which
    supplies base URL, auth type, and credentials.
    """

    DEFAULT_RETRY_STATUSES: frozenset[int] = frozenset({429, 500, 502, 503, 504})

    def __init__(
        self,
        *,
        base_url: str,
        auth_type: str = "NONE",
        auth_credentials: dict[str, Any] | None = None,
        provider: Any = None,
        facility: Any = None,
        timeout: int = 30,
        max_retries: int = 2,
        backoff_seconds: float = 0.5,
        session: requests.Session | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.auth_credentials = auth_credentials or {}
        self.provider = provider
        self.facility = facility
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_seconds = backoff_seconds
        self._session = session or requests.Session()

    @classmethod
    def from_config(cls, config: Any) -> InsuranceHttpClient:
        """Create client from an ``InsuranceProviderConfig`` instance."""
        return cls(
            base_url=config.api_base_url or "",
            auth_type=config.api_auth_type,
            auth_credentials=config.get_credentials_dict(),
            provider=config.provider,
            facility=config.facility,
        )

    # -------- public verbs ------------------------------------------------

    def get(self, path: str, **kwargs: Any) -> InsuranceResponse:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> InsuranceResponse:
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> InsuranceResponse:
        return self.request("PATCH", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> InsuranceResponse:
        return self.request("PUT", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> InsuranceResponse:
        return self.request("DELETE", path, **kwargs)

    # -------- core ---------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json_body: Any = None,
        data: Any = None,
        headers: Mapping[str, str] | None = None,
        user: Any = None,
        retry_statuses: frozenset[int] | None = None,
    ) -> InsuranceResponse:
        method = method.upper()
        url = f"{self.base_url}/{path.lstrip('/')}" if self.base_url else path
        retry_statuses = retry_statuses or self.DEFAULT_RETRY_STATUSES
        correlation_id = _REQUEST_ID.get() or uuid.uuid4().hex

        merged_headers: dict[str, str] = {"Accept": "application/json"}
        self._apply_auth(merged_headers)
        if json_body is not None and "Content-Type" not in merged_headers:
            merged_headers["Content-Type"] = "application/json"
        if headers:
            merged_headers.update(headers)
        merged_headers.setdefault("X-Correlation-Id", correlation_id)

        audit_payload = _redact(json_body if json_body is not None else data)

        attempt = 0
        while attempt < self.max_retries + 1:
            attempt += 1
            started = time.monotonic()
            try:
                response = self._session.request(
                    method,
                    url,
                    params=params,
                    json=json_body,
                    data=data,
                    headers=merged_headers,
                    timeout=self.timeout,
                )
            except requests.Timeout as exc:
                duration_ms = int((time.monotonic() - started) * 1000)
                if attempt > self.max_retries:
                    self._record_audit(
                        method=method,
                        path=path,
                        status="TIMEOUT",
                        status_code=None,
                        duration_ms=duration_ms,
                        attempt=attempt,
                        correlation_id=correlation_id,
                        user=user,
                        request_payload=audit_payload,
                        response_excerpt=None,
                        error_message=str(exc),
                        error_code="timeout",
                    )
                    raise InsuranceTimeoutError(
                        f"Timed out after {attempt} attempt(s)",
                        method=method,
                        path=path,
                        provider_code=getattr(self.provider, "code", None),
                    ) from exc
                time.sleep(self.backoff_seconds * (2 ** (attempt - 1)))
                continue
            except requests.RequestException as exc:
                duration_ms = int((time.monotonic() - started) * 1000)
                if attempt > self.max_retries:
                    self._record_audit(
                        method=method,
                        path=path,
                        status="TRANSPORT",
                        status_code=None,
                        duration_ms=duration_ms,
                        attempt=attempt,
                        correlation_id=correlation_id,
                        user=user,
                        request_payload=audit_payload,
                        response_excerpt=None,
                        error_message=str(exc),
                        error_code="transport",
                    )
                    raise InsuranceTransportError(
                        f"Transport error after {attempt} attempt(s): {exc}",
                        method=method,
                        path=path,
                        provider_code=getattr(self.provider, "code", None),
                    ) from exc
                time.sleep(self.backoff_seconds * (2 ** (attempt - 1)))
                continue

            duration_ms = int((time.monotonic() - started) * 1000)
            status_code = response.status_code

            # Parse response body
            try:
                body = response.json()
            except (ValueError, TypeError):
                body = None
            text = response.text[:4096]

            # Retryable?
            if status_code in retry_statuses and attempt <= self.max_retries:
                time.sleep(self.backoff_seconds * (2 ** (attempt - 1)))
                continue

            # Audit
            audit_id = self._record_audit(
                method=method,
                path=path,
                status=_audit_status_for_code(status_code),
                status_code=status_code,
                duration_ms=duration_ms,
                attempt=attempt,
                correlation_id=correlation_id,
                user=user,
                request_payload=audit_payload,
                response_excerpt=_redact(body) if body else text[:4096],
                error_message="" if status_code < 400 else text[:1024],
                error_code="" if status_code < 400 else str(status_code),
            )

            if status_code >= 400:
                raise from_status(
                    status_code,
                    text[:512],
                    method=method,
                    path=path,
                    response_body=body,
                    provider_code=getattr(self.provider, "code", None),
                )

            return InsuranceResponse(
                status_code=status_code,
                headers=dict(response.headers),
                json=body,
                text=text,
                elapsed_ms=duration_ms,
                audit_id=audit_id,
                raw=response,
            )

        # Should not reach here but guard against it
        raise InsuranceTransportError(  # pragma: no cover
            f"Request failed after {attempt} attempt(s)",
            method=method,
            path=path,
            provider_code=getattr(self.provider, "code", None),
        )

    # -------- auth helpers -------------------------------------------------

    def _apply_auth(self, headers: dict[str, str]) -> None:
        """Inject auth headers based on ``auth_type``."""
        creds = self.auth_credentials
        if self.auth_type == "BEARER":
            token = creds.get("token", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"
        elif self.auth_type == "BASIC":
            import base64

            username = creds.get("username", "")
            password = creds.get("password", "")
            if username:
                encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers["Authorization"] = f"Basic {encoded}"
        elif self.auth_type == "API_KEY":
            key = creds.get("api_key", "")
            header_name = creds.get("header_name", "X-Api-Key")
            if key:
                headers[header_name] = key
        # NONE and CUSTOM: no automatic headers

    # -------- audit --------------------------------------------------------

    def _record_audit(
        self,
        *,
        method: str,
        path: str,
        status: str,
        status_code: int | None,
        duration_ms: int,
        attempt: int,
        correlation_id: str,
        user: Any,
        request_payload: Any,
        response_excerpt: Any,
        error_message: str,
        error_code: str,
    ) -> int | None:
        """Write an ``InsuranceOutboundCall`` row. Never raises."""
        try:
            from hmis.apps.insurance.models import InsuranceOutboundCall

            row = InsuranceOutboundCall.objects.create(
                facility=self.facility,
                organization=getattr(self.facility, "organization", None),
                provider=self.provider,
                user=user if hasattr(user, "pk") else None,
                method=method,
                path=path,
                base_url=self.base_url,
                auth_mode=self.auth_type,
                status=status,
                status_code=status_code,
                duration_ms=duration_ms,
                attempt=attempt,
                correlation_id=correlation_id,
                request_payload=request_payload,
                response_excerpt=response_excerpt,
                error_message=error_message,
                error_code=error_code,
            )
            return row.pk
        except Exception:
            logger.exception("Failed to write InsuranceOutboundCall audit row")
            return None
