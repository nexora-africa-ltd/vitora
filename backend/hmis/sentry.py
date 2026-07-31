"""Sentry initialization and privacy scrubbing for the backend."""

from __future__ import annotations

from collections.abc import Mapping

SENSITIVE_FIELD_NAMES = {
    "authorization",
    "cookie",
    "set-cookie",
    "password",
    "passcode",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "jwt",
    "api_key",
    "apikey",
    "session",
    "sessionid",
    "csrftoken",
    "csrf",
    "national_id",
    "phone",
    "phone_number",
    "email",
    "mrn",
    "patient",
    "patient_id",
}

REDACTED = "[Filtered]"


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    if lowered in SENSITIVE_FIELD_NAMES:
        return True
    return any(marker in lowered for marker in ("password", "token", "secret", "cookie"))


def _scrub_value(value):
    if isinstance(value, Mapping):
        sanitized = {}
        for key, item in value.items():
            key_text = str(key)
            if _is_sensitive_key(key_text):
                sanitized[key_text] = REDACTED
            else:
                sanitized[key_text] = _scrub_value(item)
        return sanitized

    if isinstance(value, list):
        return [_scrub_value(item) for item in value]

    if isinstance(value, tuple):
        return tuple(_scrub_value(item) for item in value)

    return value


def _before_send(event, hint):
    del hint

    request = event.get("request")
    if isinstance(request, dict):
        for key in ("headers", "cookies", "data"):
            if key in request:
                request[key] = REDACTED

    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {
            key: value
            for key, value in user.items()
            if str(key).lower() in {"id"} and value is not None
        }

    if "extra" in event:
        event["extra"] = _scrub_value(event["extra"])

    if "contexts" in event:
        event["contexts"] = _scrub_value(event["contexts"])

    return event


def _before_breadcrumb(crumb, hint):
    del hint
    return _scrub_value(crumb)


def initialize_sentry(
    *,
    dsn: str,
    environment: str,
    release: str,
    sample_rate: float,
    traces_sample_rate: float,
    profiles_sample_rate: float,
    debug: bool,
    max_breadcrumbs: int,
) -> bool:
    """Initialize Sentry with strict privacy defaults.

    Returns True when initialized, False otherwise.
    """
    if not dsn:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.django import DjangoIntegration
    except ImportError:
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        sample_rate=sample_rate,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
        debug=debug,
        max_breadcrumbs=max_breadcrumbs,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        integrations=[
            DjangoIntegration(),
            CeleryIntegration(),
        ],
        in_app_include=["hmis"],
        before_send=_before_send,
        before_breadcrumb=_before_breadcrumb,
    )

    return True
