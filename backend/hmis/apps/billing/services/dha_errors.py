"""Exception hierarchy for DHA HIE Middleware (ILM) integrations.

These exceptions are raised by `IlmClient` and the per-domain ILM services
(claim build, preauth, emergency, prescriptions, etc.). All inherit from
``DHAError`` so callers can catch a single base class.
"""

from __future__ import annotations

from typing import Any


class DHAError(Exception):
    """Base class for all DHA HIE Middleware errors."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        path: str | None = None,
        method: str | None = None,
        response_body: Any = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.path = path
        self.method = method
        self.response_body = response_body
        super().__init__(self.__str__())

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        bits = []
        if self.method and self.path:
            bits.append(f"{self.method} {self.path}")
        if self.status_code:
            bits.append(f"HTTP {self.status_code}")
        prefix = " ".join(bits)
        return f"{prefix}: {self.message}" if prefix else self.message


class DHATransportError(DHAError):
    """Raised when the HTTP request itself fails (timeout, DNS, connection)."""


class DHATimeoutError(DHATransportError):
    """Raised when the upstream times out after all retries are exhausted."""


class DHAClientError(DHAError):
    """4xx response from the middleware (caller-side error)."""


class DHAValidationError(DHAClientError):
    """422 / 400 with field-level validation errors."""

    def __init__(self, message: str, *, errors: Any = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.errors = errors


class DHAUnauthorizedError(DHAClientError):
    """401 / 403 — token rejected by middleware."""


class DHANotFoundError(DHAClientError):
    """404 — resource not present at upstream."""


class DHAConflictError(DHAClientError):
    """409 — state conflict (e.g. claim already submitted)."""


class DHAServerError(DHAError):
    """5xx — middleware-side failure that retries did not recover from."""


class DHARateLimitedError(DHAClientError):
    """429 — caller exceeded the rate limit."""


def from_status(status_code: int, message: str, **kwargs: Any) -> DHAError:
    """Map an HTTP status code to the most specific exception class."""
    if status_code in (401, 403):
        return DHAUnauthorizedError(message, status_code=status_code, **kwargs)
    if status_code == 404:
        return DHANotFoundError(message, status_code=status_code, **kwargs)
    if status_code == 409:
        return DHAConflictError(message, status_code=status_code, **kwargs)
    if status_code == 429:
        return DHARateLimitedError(message, status_code=status_code, **kwargs)
    if status_code in (400, 422):
        return DHAValidationError(message, status_code=status_code, **kwargs)
    if 400 <= status_code < 500:
        return DHAClientError(message, status_code=status_code, **kwargs)
    if 500 <= status_code < 600:
        return DHAServerError(message, status_code=status_code, **kwargs)
    return DHAError(message, status_code=status_code, **kwargs)
