"""
Tests for core URL configuration.

Sprint 0.6: Coverage improvement tests for core/urls.py (0% -> 100%)
"""

import pytest
from django.urls import resolve

from hmis.apps.core.urls import router, urlpatterns
from hmis.apps.core.views import AuditLogViewSet


class TestCoreURLConfiguration:
    """Tests for core app URL patterns."""

    def test_router_is_configured(self):
        """Router should be a DRF router."""
        from rest_framework.routers import DefaultRouter

        assert isinstance(router, DefaultRouter)

    def test_auditlog_registered_in_router(self):
        """AuditLog viewset should be registered."""
        # Check that 'auditlog' is in the router's registry
        registered_basenames = [r[0] for r in router.registry]
        assert "auditlogs" in registered_basenames

    def test_urlpatterns_from_router(self):
        """URL patterns should be generated from router."""
        assert urlpatterns == router.urls
        assert len(urlpatterns) > 0


@pytest.mark.django_db
class TestCoreURLResolution:
    """Tests for URL resolution in core app."""

    def test_auditlog_list_url_resolves(self):
        """AuditLog list URL should resolve to viewset."""
        # The core URLs are included under /api/
        url = "/api/auditlogs/"
        resolver = resolve(url)
        assert resolver.func.cls == AuditLogViewSet

    def test_auditlog_detail_url_resolves(self):
        """AuditLog detail URL should resolve to viewset."""
        url = "/api/auditlogs/1/"
        resolver = resolve(url)
        assert resolver.func.cls == AuditLogViewSet
