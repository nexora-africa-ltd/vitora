"""
Tests for core URL configuration.

Sprint 0.6: Coverage improvement tests for core/urls.py (0% -> 100%)
"""

import pytest  # type: ignore
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
        """URL patterns should include router URLs plus any custom paths."""
        # urlpatterns contains router.urls plus custom paths (generate/prc-number/, generate/case-number/)
        # Check that all router URLs are in urlpatterns
        for url in router.urls:
            assert url in urlpatterns, f"Router URL {url} not found in urlpatterns"
        # urlpatterns should have more URLs than router.urls (custom paths added)
        assert len(urlpatterns) >= len(router.urls)
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
