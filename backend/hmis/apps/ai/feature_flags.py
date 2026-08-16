# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Feature flag utilities for AI/TibaBot integration.

All AI endpoints are gated behind the TIBABOT_ENABLED setting.
When disabled, endpoints return 404 — no endpoint discovery or partial behavior.

Plan-level and quota checks are enforced in AIFeatureGatedMixin.initial():
- ``ai_assistant`` plan feature must be enabled on the org's subscription plan
- Organization must have remaining AI token quota for write operations
"""

from django.conf import settings
from rest_framework.exceptions import NotFound, PermissionDenied

from hmis.apps.core.openapi import SchemaFallbackSerializer

from .client import tibabot_user_context


def is_ai_enabled() -> bool:
    """Check whether the TibaBot AI feature flag is enabled."""
    return getattr(settings, "TIBABOT_ENABLED", False)


class AISchemaMixin:
    """Provide default serializer hooks for APIView schema introspection."""

    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return getattr(self, "serializer_class", SchemaFallbackSerializer)

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": getattr(self, "request", None), "view": self}


class AIFeatureGatedMixin(AISchemaMixin):
    """
    Mixin for DRF views that gates access behind TIBABOT_ENABLED.

    When TIBABOT_ENABLED is False, dispatch returns 404 immediately.
    This prevents endpoint discovery and any partial behavior.

    Additionally sets ``tibabot_user_context`` for the request lifecycle
    so that all ``TibaBotClient`` calls within the view automatically
    include the user-identity JWT in the ``Authorization: Bearer`` header.

    Note: The context is set up in ``initial()`` (after DRF authentication
    runs) rather than ``dispatch()`` because for cookie-based JWT auth,
    ``request.user`` is AnonymousUser until ``perform_authentication()``
    executes inside DRF's dispatch flow.
    """

    _tibabot_ctx = None

    def initial(self, request, *args, **kwargs):  # type: ignore[override]
        super().initial(request, *args, **kwargs)  # type: ignore[misc]

        if not is_ai_enabled():
            raise NotFound("AI features are not enabled for this facility.")

        # Plan-level and quota checks for authenticated non-superusers
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            if not user.is_superuser:
                org = self._resolve_user_org(user)
                if org is not None:
                    if not org.has_feature("ai_assistant"):
                        raise PermissionDenied(
                            "AI features are not available on your current plan. "
                            "Please upgrade to a plan that includes AI Assistant."
                        )
                    if request.method not in (
                        "GET",
                        "HEAD",
                        "OPTIONS",
                    ) and not org.can_use_ai_tokens(tokens_needed=1):
                        raise PermissionDenied(
                            "Your organization has used all available AI tokens "
                            "for this billing cycle."
                        )

            facility = getattr(request, "facility", None)
            self._tibabot_ctx = tibabot_user_context(user, facility)
            self._tibabot_ctx.__enter__()

    def finalize_response(self, request, response, *args, **kwargs):  # type: ignore[override]
        if self._tibabot_ctx is not None:
            self._tibabot_ctx.__exit__(None, None, None)
            self._tibabot_ctx = None
        return super().finalize_response(request, response, *args, **kwargs)  # type: ignore[misc]

    @staticmethod
    def _resolve_user_org(user):
        """Resolve the Organization from the user's staff profile."""
        profile = getattr(user, "staff_profile", None)
        if profile is None:
            return None
        return getattr(profile, "organization", None)
