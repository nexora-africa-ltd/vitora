"""
Feature flag utilities for AI/TibaBot integration.

All AI endpoints are gated behind TIBABOT_ENABLED setting.
Per-feature flags gate individual clinical features (lab assist,
discharge readiness, care plan, clerking assist).
When disabled, endpoints return 404 — no endpoint discovery or partial behavior.
"""

from django.conf import settings
from rest_framework.exceptions import NotFound

from .client import tibabot_user_context


def is_ai_enabled() -> bool:
    """Check whether the TibaBot AI feature flag is enabled."""
    return getattr(settings, "TIBABOT_ENABLED", False)


def is_feature_enabled(feature_flag: str) -> bool:
    """Check whether a specific clinical AI feature is enabled.

    Requires the master TIBABOT_ENABLED flag AND the per-feature flag.
    Feature flags default to True so new features are opt-out.

    Args:
        feature_flag: Settings attribute name, e.g. "TIBABOT_ENABLE_LAB_ASSIST".
    """
    if not is_ai_enabled():
        return False
    return getattr(settings, feature_flag, True)


class AIFeatureGatedMixin:
    """
    Mixin for DRF views that gates access behind TIBABOT_ENABLED.

    When TIBABOT_ENABLED is False, dispatch returns 404 immediately.
    This prevents endpoint discovery and any partial behavior.

    Subclasses can set ``ai_feature_flag`` to gate behind an additional
    per-feature setting (e.g. ``"TIBABOT_ENABLE_LAB_ASSIST"``).

    Additionally sets ``tibabot_user_context`` for the request lifecycle
    so that all ``TibaBotClient`` calls within the view automatically
    include the user-identity JWT in the ``Authorization: Bearer`` header.

    Note: The context is set up in ``initial()`` (after DRF authentication
    runs) rather than ``dispatch()`` because for cookie-based JWT auth,
    ``request.user`` is AnonymousUser until ``perform_authentication()``
    executes inside DRF's dispatch flow.
    """

    ai_feature_flag: str | None = None
    _tibabot_ctx = None

    def initial(self, request, *args, **kwargs):  # type: ignore[override]
        # Run DRF authentication, permissions, throttling first
        super().initial(request, *args, **kwargs)  # type: ignore[misc]

        # Feature gate checks (after auth so 401 takes precedence over 404)
        if not is_ai_enabled():
            raise NotFound("AI features are not enabled for this facility.")
        if self.ai_feature_flag and not is_feature_enabled(self.ai_feature_flag):
            raise NotFound("This AI feature is not enabled for this facility.")

        # Set up user context for TibaBot client (user is now authenticated)
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            facility = getattr(request, "facility", None)
            self._tibabot_ctx = tibabot_user_context(user, facility)
            self._tibabot_ctx.__enter__()

    def finalize_response(self, request, response, *args, **kwargs):  # type: ignore[override]
        # Tear down the user context after the response is built
        if self._tibabot_ctx is not None:
            self._tibabot_ctx.__exit__(None, None, None)
            self._tibabot_ctx = None
        return super().finalize_response(request, response, *args, **kwargs)  # type: ignore[misc]
