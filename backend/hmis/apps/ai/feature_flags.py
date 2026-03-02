"""
Feature flag utilities for AI/TibaBot integration.

All AI endpoints are gated behind TIBABOT_ENABLED setting.
When disabled, endpoints return 404 — no endpoint discovery or partial behavior.
"""

from django.conf import settings
from rest_framework.exceptions import NotFound


def is_ai_enabled() -> bool:
    """Check whether the TibaBot AI feature flag is enabled."""
    return getattr(settings, "TIBABOT_ENABLED", False)


class AIFeatureGatedMixin:
    """
    Mixin for DRF views that gates access behind TIBABOT_ENABLED.

    When TIBABOT_ENABLED is False, dispatch returns 404 immediately.
    This prevents endpoint discovery and any partial behavior.
    """

    def initial(self, request, *args, **kwargs):  # type: ignore[override]
        if not is_ai_enabled():
            raise NotFound("AI features are not enabled for this facility.")
        super().initial(request, *args, **kwargs)  # type: ignore[misc]
