"""Tests for Django admin access restriction, MFA grace period, and admin MFA."""

import json
from datetime import timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory
from django.utils import timezone

from hmis.apps.core.middleware import AdminAccessMiddleware, MFAGraceEnforcementMiddleware

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def rf():
    return RequestFactory()


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser(
        username="nexora_admin",
        email="admin@nexora.africa",
        password="SuperSecure1!",
    )


@pytest.fixture
def staff_user(db):
    """A user with is_staff=True but NOT superuser (tenant admin)."""
    return User.objects.create_user(
        username="tenant_admin",
        email="admin@hospital.ke",
        password="TenantPass1!",
        is_staff=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username="nurse",
        email="nurse@hospital.ke",
        password="NursePass1!",
    )


@pytest.fixture
def mfa_required_user(
    db,
    sample_organization,
    sample_facility,
    sample_department,
    settings,
):
    """User with ADMIN role (requires MFA) and a StaffProfile."""
    from hmis.apps.core.models import Role, StaffProfile

    settings.MFA_ENFORCEMENT = True
    user = User.objects.create_user(
        username="mfa_doctor",
        email="mfa_doctor@hospital.ke",
        password="MfaPass1!",
    )
    role, _ = Role.objects.get_or_create(
        code="ADMIN",
        defaults={"name": "Admin", "hierarchy_level": 1, "is_active": True},
    )
    StaffProfile.objects.create(
        user=user,
        employee_id="EMP-MFA-001",
        organization=sample_organization,
        primary_facility=sample_facility,
        primary_department=sample_department,
        primary_role=role,
        date_joined="2026-01-01",
    )
    return user


def _make_admin_mw():
    """Create AdminAccessMiddleware with a dummy get_response."""
    return AdminAccessMiddleware(get_response=lambda r: type("Resp", (), {"status_code": 200})())


def _make_grace_mw():
    """Create MFAGraceEnforcementMiddleware with a dummy get_response."""
    return MFAGraceEnforcementMiddleware(
        get_response=lambda r: type("Resp", (), {"status_code": 200})()
    )


# ===========================================================================
# Feature #2: Restrict Django Admin to Nexora Staff
# ===========================================================================


class TestAdminAccessMiddleware:
    """Only superusers should access /admin/ pages."""

    def _add_session(self, request):
        """Attach a dict-like session to a RequestFactory request."""
        request.session = {}
        return request

    def test_superuser_allowed(self, rf, superuser):
        request = self._add_session(rf.get("/admin/core/staffprofile/"))
        request.user = superuser
        assert _make_admin_mw()(request).status_code == 200

    def test_staff_user_blocked(self, rf, staff_user):
        request = self._add_session(rf.get("/admin/core/staffprofile/"))
        request.user = staff_user
        assert _make_admin_mw()(request).status_code == 403

    def test_regular_user_blocked(self, rf, regular_user):
        request = self._add_session(rf.get("/admin/core/staffprofile/"))
        request.user = regular_user
        assert _make_admin_mw()(request).status_code == 403

    def test_anonymous_user_passes_through(self, rf):
        request = rf.get("/admin/core/staffprofile/")
        request.user = AnonymousUser()
        assert _make_admin_mw()(request).status_code == 200

    def test_admin_login_page_allowed(self, rf, staff_user):
        request = rf.get("/admin/login/")
        request.user = staff_user
        assert _make_admin_mw()(request).status_code == 200

    def test_mfa_verify_page_allowed(self, rf, superuser):
        """MFA verify page must be accessible to avoid redirect loop."""
        request = rf.get("/admin/mfa-verify/")
        request.user = superuser
        assert _make_admin_mw()(request).status_code == 200

    def test_non_admin_path_unaffected(self, rf, regular_user):
        request = rf.get("/api/patients/")
        request.user = regular_user
        assert _make_admin_mw()(request).status_code == 200

    def test_superuser_with_mfa_redirected_to_verify(self, rf, superuser, mocker):
        """Superuser with MFA enabled but not verified → redirect to /admin/mfa-verify/."""
        mocker.patch(
            "hmis.apps.core.mfa.utils.is_mfa_enabled",
            return_value=True,
        )
        request = self._add_session(rf.get("/admin/core/staffprofile/"))
        request.user = superuser
        response = _make_admin_mw()(request)
        assert response.status_code == 302
        assert response.url == "/admin/mfa-verify/"

    def test_superuser_with_mfa_verified_allowed(self, rf, superuser, mocker):
        """Superuser with MFA enabled and verified in session → allowed."""
        mocker.patch(
            "hmis.apps.core.mfa.utils.is_mfa_enabled",
            return_value=True,
        )
        request = self._add_session(rf.get("/admin/core/staffprofile/"))
        request.user = superuser
        request.session["admin_mfa_verified"] = True
        assert _make_admin_mw()(request).status_code == 200

    def test_superuser_without_mfa_not_redirected(self, rf, superuser, mocker):
        """Superuser without MFA device → no redirect."""
        mocker.patch(
            "hmis.apps.core.mfa.utils.is_mfa_enabled",
            return_value=False,
        )
        request = self._add_session(rf.get("/admin/core/staffprofile/"))
        request.user = superuser
        assert _make_admin_mw()(request).status_code == 200


# ===========================================================================
# Feature #3: MFA Grace Period
# ===========================================================================


class TestMFAGraceUtils:
    """Tests for set_mfa_grace_deadline and is_mfa_grace_period_expired."""

    def test_set_grace_deadline(self, mfa_required_user, settings):
        """Should set the grace deadline on first call."""
        from hmis.apps.core.mfa.utils import set_mfa_grace_deadline

        settings.MFA_GRACE_PERIOD_HOURS = 48
        set_mfa_grace_deadline(mfa_required_user)

        profile = mfa_required_user.staff_profile
        profile.refresh_from_db()
        assert profile.mfa_grace_deadline is not None

        expected = timezone.now() + timedelta(hours=48)
        diff = abs((profile.mfa_grace_deadline - expected).total_seconds())
        assert diff < 5

    def test_set_grace_deadline_not_extended(self, mfa_required_user, settings):
        """Should not extend deadline on subsequent calls."""
        from hmis.apps.core.mfa.utils import set_mfa_grace_deadline

        set_mfa_grace_deadline(mfa_required_user)
        profile = mfa_required_user.staff_profile
        profile.refresh_from_db()
        first_deadline = profile.mfa_grace_deadline

        set_mfa_grace_deadline(mfa_required_user)
        profile.refresh_from_db()
        assert profile.mfa_grace_deadline == first_deadline

    def test_grace_period_not_expired_within_window(self, mfa_required_user, settings):
        """Should return False when deadline is in the future."""
        from hmis.apps.core.mfa.utils import is_mfa_grace_period_expired

        profile = mfa_required_user.staff_profile
        profile.mfa_grace_deadline = timezone.now() + timedelta(hours=24)
        profile.save(update_fields=["mfa_grace_deadline"])

        assert is_mfa_grace_period_expired(mfa_required_user) is False

    def test_grace_period_expired_after_deadline(self, mfa_required_user, settings):
        """Should return True when deadline has passed."""
        from hmis.apps.core.mfa.utils import is_mfa_grace_period_expired

        profile = mfa_required_user.staff_profile
        profile.mfa_grace_deadline = timezone.now() - timedelta(hours=1)
        profile.save(update_fields=["mfa_grace_deadline"])

        assert is_mfa_grace_period_expired(mfa_required_user) is True

    def test_grace_not_expired_when_enforcement_off(self, mfa_required_user, settings):
        """Should return False when MFA enforcement is disabled."""
        from hmis.apps.core.mfa.utils import is_mfa_grace_period_expired

        settings.MFA_ENFORCEMENT = False
        profile = mfa_required_user.staff_profile
        profile.mfa_grace_deadline = timezone.now() - timedelta(hours=1)
        profile.save(update_fields=["mfa_grace_deadline"])

        assert is_mfa_grace_period_expired(mfa_required_user) is False

    def test_grace_not_expired_when_no_deadline(self, mfa_required_user, settings):
        """Should return False when no deadline has been set yet."""
        from hmis.apps.core.mfa.utils import is_mfa_grace_period_expired

        assert mfa_required_user.staff_profile.mfa_grace_deadline is None
        assert is_mfa_grace_period_expired(mfa_required_user) is False


class TestMFAGraceMiddleware:
    """Tests for MFAGraceEnforcementMiddleware."""

    def _set_deadline(self, user, hours_from_now):
        profile = user.staff_profile
        profile.mfa_grace_deadline = timezone.now() + timedelta(hours=hours_from_now)
        profile.save(update_fields=["mfa_grace_deadline"])

    def test_blocks_api_when_grace_expired(self, rf, mfa_required_user, settings):
        self._set_deadline(mfa_required_user, -1)
        request = rf.get("/api/patients/")
        request.user = mfa_required_user
        response = _make_grace_mw()(request)
        assert response.status_code == 403
        body = json.loads(response.content)
        assert body["code"] == "mfa_setup_required"

    def test_allows_mfa_setup_when_grace_expired(self, rf, mfa_required_user, settings):
        self._set_deadline(mfa_required_user, -1)
        for path in ["/api/mfa/totp/setup/", "/api/token/", "/api/token/refresh/"]:
            request = rf.get(path)
            request.user = mfa_required_user
            assert _make_grace_mw()(request).status_code == 200, f"{path} should be exempt"

    def test_allows_api_within_grace_period(self, rf, mfa_required_user, settings):
        self._set_deadline(mfa_required_user, 24)
        request = rf.get("/api/patients/")
        request.user = mfa_required_user
        assert _make_grace_mw()(request).status_code == 200

    def test_non_api_routes_unaffected(self, rf, mfa_required_user, settings):
        self._set_deadline(mfa_required_user, -1)
        request = rf.get("/some-page/")
        request.user = mfa_required_user
        assert _make_grace_mw()(request).status_code == 200

    def test_unauthenticated_passes_through(self, rf):
        request = rf.get("/api/patients/")
        request.user = AnonymousUser()
        assert _make_grace_mw()(request).status_code == 200
