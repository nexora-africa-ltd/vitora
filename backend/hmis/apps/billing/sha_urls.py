"""
URL configuration for SHA (Social Health Authority) billing endpoints.

Provides routes for SHA Members, Tariffs, Claims, and related operations.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.billing.sha_views import (
    SHAClaimViewSet,
    SHAMemberViewSet,
    SHATariffViewSet,
)

app_name = 'sha'

router = DefaultRouter()
router.register(r'members', SHAMemberViewSet, basename='member')
router.register(r'tariffs', SHATariffViewSet, basename='tariff')
router.register(r'claims', SHAClaimViewSet, basename='claim')

urlpatterns = [
    path('', include(router.urls)),
]
