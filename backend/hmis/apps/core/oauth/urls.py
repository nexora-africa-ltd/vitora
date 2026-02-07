"""
SMART on FHIR URL configuration.

Includes OAuth2 endpoints and SMART-specific endpoints.
"""

from django.urls import include, path

from hmis.apps.core.oauth.views import (
    CapabilityStatementView,
    SMARTConfigurationView,
    SMARTLaunchContextView,
    SMARTLaunchView,
    SMARTTokenIntrospectionView,
)

app_name = "smart"

# SMART on FHIR specific endpoints
urlpatterns = [
    # SMART configuration discovery
    path(
        ".well-known/smart-configuration",
        SMARTConfigurationView.as_view(),
        name="smart-configuration",
    ),
    # FHIR CapabilityStatement
    path(
        "fhir/metadata",
        CapabilityStatementView.as_view(),
        name="capability-statement",
    ),
    # SMART launch endpoints
    path(
        "smart/launch",
        SMARTLaunchView.as_view(),
        name="smart-launch",
    ),
    path(
        "smart/launch-context",
        SMARTLaunchContextView.as_view(),
        name="smart-launch-context",
    ),
    # Token introspection (SMART-specific)
    path(
        "smart/introspect",
        SMARTTokenIntrospectionView.as_view(),
        name="smart-introspect",
    ),
    # django-oauth-toolkit URLs
    path("oauth/", include("oauth2_provider.urls", namespace="oauth2_provider")),
]
