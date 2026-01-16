"""
URL configuration for SHA (Social Health Authority) billing endpoints.

Provides routes for SHA Members, Tariffs, Claims, and related operations.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.billing.sha_views import (
    ClientRegistryView,
    EligibilityCheckView,
    FacilitySearchView,
    PractitionerSearchView,
    SHAClaimViewSet,
    SHAMemberViewSet,
    SHATariffViewSet,
    SHAValidateView,
    SHAWebhookView,
    TerminologySearchView,
)

app_name = 'sha'

router = DefaultRouter()
router.register(r'members', SHAMemberViewSet, basename='member')
router.register(r'tariffs', SHATariffViewSet, basename='tariff')
router.register(r'claims', SHAClaimViewSet, basename='claim')

urlpatterns = [
    path('', include(router.urls)),

    # Terminology endpoints
    path('terminology/<str:terminology_type>/', TerminologySearchView.as_view(), name='terminology-search'),

    # Client Registry endpoints
    path('client-registry/fetch/', ClientRegistryView.as_view(), name='client-registry-fetch'),
    path('client-registry/register/', ClientRegistryView.as_view(), name='client-registry-register'),

    # Facility and Practitioner validation
    path('facility/validate/', FacilitySearchView.as_view(), name='facility-validate'),
    path('practitioner/validate/', PractitionerSearchView.as_view(), name='practitioner-validate'),

    # Eligibility check
    path('eligibility/check/', EligibilityCheckView.as_view(), name='eligibility-check'),

    # DHA Integration Endpoints (Callback/Webhook URLs)
    # Register these with DHA when setting up integration:
    # - Callback URL: https://your-domain/api/sha/webhook/
    # - Validate URL: https://your-domain/api/sha/validate/
    path('webhook/', SHAWebhookView.as_view(), name='sha-webhook'),
    path('callback/', SHAWebhookView.as_view(), name='sha-callback'),  # Alias for webhook
    path('validate/', SHAValidateView.as_view(), name='sha-validate'),
]
