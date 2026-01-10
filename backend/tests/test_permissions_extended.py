"""
Extended tests for permissions module.

Sprint 0.6: Coverage improvement tests for core/permissions.py (62% -> 95%+)
"""

from unittest.mock import MagicMock, patch

import pytest # type: ignore
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from hmis.apps.core.permissions import (
    AuditLogPermission,
    IsAdminUser,
    IsAuthenticatedOrReadOnly,
    PatientPermission,
    SensitiveAccessPermission,
    get_client_ip,
)
from hmis.apps.patients.models import Patient

User = get_user_model()


class TestGetClientIPFromPermissions:
    """Tests for get_client_ip in permissions module."""

    def test_x_forwarded_for_takes_priority(self):
        """X-Forwarded-For should take priority over REMOTE_ADDR."""
        factory = RequestFactory()
        request = factory.get("/")
        request.META["HTTP_X_FORWARDED_FOR"] = "10.0.0.1, 192.168.1.1"
        request.META["REMOTE_ADDR"] = "127.0.0.1"

        ip = get_client_ip(request)
        assert ip == "10.0.0.1"

    def test_fallback_to_remote_addr(self):
        """Should use REMOTE_ADDR when no X-Forwarded-For."""
        factory = RequestFactory()
        request = factory.get("/")
        request.META["REMOTE_ADDR"] = "172.16.0.50"

        ip = get_client_ip(request)
        assert ip == "172.16.0.50"


class TestIsAuthenticatedOrReadOnly:
    """Tests for IsAuthenticatedOrReadOnly permission."""

    def test_allows_get_for_anonymous(self):
        """Should allow GET for anonymous users."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = MagicMock()
        request.user.is_authenticated = False

        permission = IsAuthenticatedOrReadOnly()
        assert permission.has_permission(request, None) is True

    def test_allows_head_for_anonymous(self):
        """Should allow HEAD for anonymous users."""
        factory = RequestFactory()
        request = factory.head("/")
        request.user = MagicMock()
        request.user.is_authenticated = False

        permission = IsAuthenticatedOrReadOnly()
        assert permission.has_permission(request, None) is True

    def test_denies_post_for_anonymous(self):
        """Should deny POST for anonymous users."""
        factory = RequestFactory()
        request = factory.post("/")
        request.user = MagicMock()
        request.user.is_authenticated = False

        permission = IsAuthenticatedOrReadOnly()
        assert permission.has_permission(request, None) is False

    def test_allows_post_for_authenticated(self):
        """Should allow POST for authenticated users."""
        factory = RequestFactory()
        request = factory.post("/")
        request.user = MagicMock()
        request.user.is_authenticated = True

        permission = IsAuthenticatedOrReadOnly()
        assert permission.has_permission(request, None) is True


@pytest.mark.django_db
class TestSensitiveAccessPermission:
    """Tests for SensitiveAccessPermission."""

    @pytest.fixture
    def user(self, django_user_model):
        """Create a test user."""
        return django_user_model.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

    @pytest.fixture
    def superuser(self, django_user_model):
        """Create a superuser."""
        return django_user_model.objects.create_superuser(
            username="admin", email="admin@example.com", password="adminpass123"
        )

    @pytest.fixture
    def sensitive_patient(self):
        """Create a sensitive patient."""
        return Patient.objects.create(
            first_name="Sensitive",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="F",
            is_sensitive=True,
        )

    @pytest.fixture
    def normal_patient(self):
        """Create a normal patient."""
        return Patient.objects.create(
            first_name="Normal",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            is_sensitive=False,
        )

    def test_has_permission_requires_authentication(self, user):
        """has_permission should require authentication."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = MagicMock()
        request.user.is_authenticated = False

        permission = SensitiveAccessPermission()
        assert permission.has_permission(request, None) is False

    def test_has_permission_allows_authenticated(self, user):
        """has_permission should allow authenticated users."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = SensitiveAccessPermission()
        assert permission.has_permission(request, None) is True

    def test_allows_access_to_non_sensitive_patient(self, user, normal_patient):
        """Should allow any authenticated user to access non-sensitive patients."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = user
        request.META["HTTP_USER_AGENT"] = "test"

        permission = SensitiveAccessPermission()
        assert permission.has_object_permission(request, None, normal_patient) is True

    def test_superuser_can_access_sensitive_patient(self, superuser, sensitive_patient):
        """Superuser should be able to access sensitive patients."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = superuser
        request.META["HTTP_USER_AGENT"] = "test"

        permission = SensitiveAccessPermission()
        assert permission.has_object_permission(request, None, sensitive_patient) is True

    def test_regular_user_denied_sensitive_patient(self, user, sensitive_patient):
        """Regular user should be denied access to sensitive patients."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = user
        request.META["HTTP_USER_AGENT"] = "test"

        permission = SensitiveAccessPermission()
        assert permission.has_object_permission(request, None, sensitive_patient) is False

    @patch("hmis.apps.core.permissions.AuditLog.log")
    def test_logs_sensitive_access_granted(self, mock_log, superuser, sensitive_patient):
        """Should log when sensitive access is granted."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = superuser
        request.META["HTTP_USER_AGENT"] = "test"
        request.META["REMOTE_ADDR"] = "10.0.0.1"

        permission = SensitiveAccessPermission()
        permission.has_object_permission(request, None, sensitive_patient)

        mock_log.assert_called()
        call_kwargs = mock_log.call_args[1]
        assert call_kwargs["action"] == "view_sensitive_patient"

    @patch("hmis.apps.core.permissions.AuditLog.log")
    def test_logs_sensitive_access_denied(self, mock_log, user, sensitive_patient):
        """Should log when sensitive access is denied."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = user
        request.META["HTTP_USER_AGENT"] = "test"
        request.META["REMOTE_ADDR"] = "10.0.0.1"

        permission = SensitiveAccessPermission()
        permission.has_object_permission(request, None, sensitive_patient)

        mock_log.assert_called()
        call_kwargs = mock_log.call_args[1]
        assert call_kwargs["action"] == "sensitive_access_denied"


@pytest.mark.django_db
class TestIsAdminUser:
    """Tests for IsAdminUser permission."""

    def test_denies_anonymous_user(self):
        """Should deny anonymous users."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = MagicMock()
        request.user.is_authenticated = False

        permission = IsAdminUser()
        assert permission.has_permission(request, None) is False

    def test_denies_regular_user(self, django_user_model):
        """Should deny non-staff users."""
        user = django_user_model.objects.create_user(
            username="regular", email="regular@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = IsAdminUser()
        assert permission.has_permission(request, None) is False

    def test_allows_staff_user(self, django_user_model):
        """Should allow staff users."""
        user = django_user_model.objects.create_user(
            username="staff", email="staff@example.com", password="testpass", is_staff=True
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = IsAdminUser()
        assert permission.has_permission(request, None) is True


@pytest.mark.django_db
class TestAuditLogPermission:
    """Tests for AuditLogPermission."""

    def test_denies_anonymous_user(self):
        """Should deny anonymous users."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = MagicMock()
        request.user.is_authenticated = False

        permission = AuditLogPermission()
        assert permission.has_permission(request, None) is False

    def test_denies_regular_user(self, django_user_model):
        """Should deny non-superusers."""
        user = django_user_model.objects.create_user(
            username="regular", email="regular@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = AuditLogPermission()
        assert permission.has_permission(request, None) is False

    def test_allows_superuser_read(self, django_user_model):
        """Should allow superusers to read."""
        user = django_user_model.objects.create_superuser(
            username="admin", email="admin@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = AuditLogPermission()
        assert permission.has_permission(request, None) is True

    def test_denies_superuser_post(self, django_user_model):
        """Should deny even superusers from modifying."""
        user = django_user_model.objects.create_superuser(
            username="admin", email="admin@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.post("/")
        request.user = user

        permission = AuditLogPermission()
        assert permission.has_permission(request, None) is False

    def test_denies_superuser_delete(self, django_user_model):
        """Should deny delete operations."""
        user = django_user_model.objects.create_superuser(
            username="admin", email="admin@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.delete("/")
        request.user = user

        permission = AuditLogPermission()
        assert permission.has_permission(request, None) is False

    def test_has_object_permission_superuser_read(self, django_user_model):
        """has_object_permission should allow superuser read."""
        user = django_user_model.objects.create_superuser(
            username="admin", email="admin@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = AuditLogPermission()
        assert permission.has_object_permission(request, None, MagicMock()) is True

    def test_has_object_permission_denies_non_superuser(self, django_user_model):
        """has_object_permission should deny non-superusers."""
        user = django_user_model.objects.create_user(
            username="regular", email="regular@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = AuditLogPermission()
        assert permission.has_object_permission(request, None, MagicMock()) is False


@pytest.mark.django_db
class TestPatientPermission:
    """Tests for PatientPermission."""

    @pytest.fixture
    def sensitive_patient(self):
        """Create a sensitive patient."""
        return Patient.objects.create(
            first_name="Sensitive",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="F",
            is_sensitive=True,
        )

    @pytest.fixture
    def normal_patient(self):
        """Create a normal patient."""
        return Patient.objects.create(
            first_name="Normal",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            is_sensitive=False,
        )

    def test_denies_anonymous_user(self):
        """Should deny anonymous users."""
        factory = RequestFactory()
        request = factory.get("/")
        request.user = MagicMock()
        request.user.is_authenticated = False

        permission = PatientPermission()
        assert permission.has_permission(request, None) is False

    def test_allows_authenticated_user(self, django_user_model):
        """Should allow authenticated users."""
        user = django_user_model.objects.create_user(
            username="user", email="user@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = PatientPermission()
        assert permission.has_permission(request, None) is True

    def test_allows_access_to_normal_patient(self, django_user_model, normal_patient):
        """Should allow access to non-sensitive patients."""
        user = django_user_model.objects.create_user(
            username="user", email="user@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = PatientPermission()
        assert permission.has_object_permission(request, None, normal_patient) is True

    def test_superuser_can_access_sensitive(self, django_user_model, sensitive_patient):
        """Superuser should access sensitive patients."""
        user = django_user_model.objects.create_superuser(
            username="admin", email="admin@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = PatientPermission()
        assert permission.has_object_permission(request, None, sensitive_patient) is True

    def test_regular_user_denied_sensitive(self, django_user_model, sensitive_patient):
        """Regular user should be denied sensitive patients."""
        user = django_user_model.objects.create_user(
            username="user", email="user@example.com", password="testpass"
        )

        factory = RequestFactory()
        request = factory.get("/")
        request.user = user

        permission = PatientPermission()
        assert permission.has_object_permission(request, None, sensitive_patient) is False
