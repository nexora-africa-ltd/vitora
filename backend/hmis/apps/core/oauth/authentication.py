# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
DRF authentication for SMART-on-FHIR bearer access tokens.

Configured before JWT authentication. It validates django-oauth-toolkit bearer
tokens and attaches ``access_token`` and persisted ``launch_context`` to DRF
requests for SMART permissions.
"""

from oauth2_provider.contrib.rest_framework.authentication import OAuth2Authentication

from hmis.apps.core.models import SMARTTokenContext


class SMARTOAuth2Authentication(OAuth2Authentication):
    """Authenticate DOT tokens and load their durable SMART launch context."""

    def authenticate(self, request):
        authenticated = super().authenticate(request)
        if not authenticated:
            return None

        user, access_token = authenticated
        request.access_token = access_token
        try:
            request.launch_context = access_token.smart_context.context
        except SMARTTokenContext.DoesNotExist:
            request.launch_context = {}
        return user, access_token
