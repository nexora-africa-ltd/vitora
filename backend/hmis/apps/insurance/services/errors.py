"""Exception hierarchy for private insurance API integrations.

Mirrors the DHA ``DHAError`` hierarchy so callers can catch a single
``InsuranceApiError`` base class. Raised by ``InsuranceHttpClient`` and
the per-domain insurance services.
"""

from __future__ import annotations

from typing import Any


class InsuranceApiError(Exception):
    """Base class for all private insurance API errors."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        path: str | None = None,
        method: str | None = None,
        response_body: Any = None,
        provider_code: str | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.path = path
        self.method = method
        self.response_body = response_body
        self.provider_code = provider_code
        super().__init__(self.__str__())

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        bits: list[str] = []
        if self.provider_code:
            bits.append(f"[{self.provider_code}]")
        if self.method and self.path:
            bits.append(f"{self.method} {self.path}")
        if self.status_code:
            bits.append(f"HTTP {self.status_code}")
        prefix = " ".join(bits)
        return f"{prefix}: {self.message}" if prefix else self.message


class InsuranceTransportError(InsuranceApiError):
    """HTTP request itself failed (timeout, DNS, connection)."""


class InsuranceTimeoutError(InsuranceTransportError):
    """Upstream timed out after all retries exhausted."""


class InsuranceClientError(InsuranceApiError):
    """4xx response from the insurer API."""


class InsuranceValidationError(InsuranceClientError):
    """400/422 with field-level validation errors."""

    def __init__(self, message: str, *, errors: Any = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.errors = errors


class InsuranceUnauthorizedError(InsuranceClientError):
    """401/403 — credentials rejected by insurer API."""


class InsuranceNotFoundError(InsuranceClientError):
    """404 — resource not found at insurer API."""


class InsuranceConflictError(InsuranceClientError):
    """409 — state conflict (e.g. claim already submitted)."""


class InsuranceRateLimitedError(InsuranceClientError):
    """429 — rate limit exceeded."""


class InsuranceServerError(InsuranceApiError):
    """5xx — insurer-side failure after retries exhausted."""


class InsuranceNotConfiguredError(InsuranceApiError):
    """Raised when API integration is not configured for a provider."""


def from_status(status_code: int, message: str, **kwargs: Any) -> InsuranceApiError:
    """Map an HTTP status code to the most specific exception class."""
    if status_code in (401, 403):
        return InsuranceUnauthorizedError(message, status_code=status_code, **kwargs)
    if status_code == 404:
        return InsuranceNotFoundError(message, status_code=status_code, **kwargs)
    if status_code == 409:
        return InsuranceConflictError(message, status_code=status_code, **kwargs)
    if status_code == 429:
        return InsuranceRateLimitedError(message, status_code=status_code, **kwargs)
    if status_code in (400, 422):
        return InsuranceValidationError(message, status_code=status_code, **kwargs)
    if 400 <= status_code < 500:
        return InsuranceClientError(message, status_code=status_code, **kwargs)
    if 500 <= status_code < 600:
        return InsuranceServerError(message, status_code=status_code, **kwargs)
    return InsuranceApiError(message, status_code=status_code, **kwargs)
