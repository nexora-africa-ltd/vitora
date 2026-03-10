"""
Tests for the audit logging middleware.

Sprint 0.6: Coverage improvement tests for middleware.py (0% -> 100%)
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from hmis.apps.core.middleware import AuditLogMiddleware, get_client_ip

User = get_user_model()


class TestGetClientIP:
    """Tests for get_client_ip utility function."""

    def test_get_client_ip_from_remote_addr(self):
        """Should extract IP from REMOTE_ADDR."""
        factory = RequestFactory()
        request = factory.get("/")
        request.META["REMOTE_ADDR"] = "192.168.1.100"

        ip = get_client_ip(request)
        assert ip == "192.168.1.100"

    def test_get_client_ip_from_x_forwarded_for(self):
        """Should extract IP from X-Forwarded-For header (proxy)."""
        factory = RequestFactory()
        request = factory.get("/")
        request.META["HTTP_X_FORWARDED_FOR"] = "203.0.113.50, 70.41.3.18, 150.172.238.178"
        request.META["REMOTE_ADDR"] = "127.0.0.1"

        ip = get_client_ip(request)
        assert ip == "203.0.113.50"

    def test_get_client_ip_x_forwarded_for_single_ip(self):
        """Should handle single IP in X-Forwarded-For."""
        factory = RequestFactory()
        request = factory.get("/")
        request.META["HTTP_X_FORWARDED_FOR"] = "10.0.0.1"
        request.META["REMOTE_ADDR"] = "127.0.0.1"

        ip = get_client_ip(request)
        assert ip == "10.0.0.1"

    def test_get_client_ip_x_forwarded_for_with_spaces(self):
        """Should strip whitespace from X-Forwarded-For IPs."""
        factory = RequestFactory()
        request = factory.get("/")
        request.META["HTTP_X_FORWARDED_FOR"] = "  10.0.0.5  , 192.168.1.1"
        request.META["REMOTE_ADDR"] = "127.0.0.1"

        ip = get_client_ip(request)
        assert ip == "10.0.0.5"

    def test_get_client_ip_fallback_to_remote_addr(self):
        """Should fallback to REMOTE_ADDR when X-Forwarded-For missing."""
        factory = RequestFactory()
        request = factory.get("/")
        request.META["REMOTE_ADDR"] = "172.16.0.1"
        # Ensure HTTP_X_FORWARDED_FOR is not set
        request.META.pop("HTTP_X_FORWARDED_FOR", None)

        ip = get_client_ip(request)
        assert ip == "172.16.0.1"


class TestAuditLogMiddleware:
    """Tests for AuditLogMiddleware."""

    def test_middleware_initialization(self):
        """Should initialize with get_response callable."""
        mock_response = {"status": "ok"}

        def mock_get_response(request):
            return mock_response

        middleware = AuditLogMiddleware(mock_get_response)
        assert middleware.get_response == mock_get_response

    def test_middleware_passes_request_through(self):
        """Should pass request through to get_response and return response."""
        factory = RequestFactory()
        request = factory.get("/test/")

        expected_response = {"test": "response"}

        def mock_get_response(req):
            return expected_response

        middleware = AuditLogMiddleware(mock_get_response)
        response = middleware(request)

        assert response == expected_response

    def test_middleware_works_with_authenticated_user(self):
        """Should work with authenticated user requests."""
        factory = RequestFactory()
        request = factory.get("/api/patients/")

        # Create and attach user to request
        user = User(username="testuser", email="test@example.com")
        request.user = user

        expected_response = {"data": "patients"}

        def mock_get_response(req):
            return expected_response

        middleware = AuditLogMiddleware(mock_get_response)
        response = middleware(request)

        assert response == expected_response

    def test_middleware_works_with_post_request(self):
        """Should handle POST requests."""
        factory = RequestFactory()
        request = factory.post("/api/patients/", {"name": "John"})

        expected_response = {"created": True}

        def mock_get_response(req):
            return expected_response

        middleware = AuditLogMiddleware(mock_get_response)
        response = middleware(request)

        assert response == expected_response

    def test_middleware_preserves_request_metadata(self):
        """Should preserve all request metadata."""
        factory = RequestFactory()
        request = factory.get(
            "/api/test/",
            HTTP_USER_AGENT="Mozilla/5.0",
            HTTP_X_FORWARDED_FOR="10.0.0.1",
        )

        captured_request = None

        def mock_get_response(req):
            nonlocal captured_request
            captured_request = req
            return {}

        middleware = AuditLogMiddleware(mock_get_response)
        middleware(request)

        assert captured_request is not None
        assert captured_request.META.get("HTTP_USER_AGENT") == "Mozilla/5.0"
        assert captured_request.META.get("HTTP_X_FORWARDED_FOR") == "10.0.0.1"


@pytest.mark.django_db
class TestMiddlewareIntegration:
    """Integration tests for middleware with database."""

    def test_middleware_with_real_view(self, client, django_user_model):
        """Should work with actual Django client and views."""
        # Create a user
        user = django_user_model.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

        # Login
        client.force_login(user)

        # Make a request (to patients endpoint)
        response = client.get("/api/patients/")

        # Should succeed (middleware passes through, auth handled by view)
        # Status depends on auth setup - middleware just passes request through
        assert response.status_code in [200, 401, 403]

    def test_middleware_with_unauthenticated_request(self, client):
        """Should work with unauthenticated requests."""
        # Make a request without auth
        response = client.get("/api/patients/")

        # Should still work (returns 401 from view, not middleware)
        assert response.status_code in [200, 401, 403]
