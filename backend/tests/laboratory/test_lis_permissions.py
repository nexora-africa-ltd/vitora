"""
Tests for LIS permission classes and feature flag gating.

Covers:
- LaboratoryModuleRequired: allows when has_laboratory OR has_lis_standalone
- LISStandaloneRequired: allows when LIS_STANDALONE_MODE OR facility.has_lis_standalone
- LISQCPermission: role-gated QC access
- LISManageCatalogPermission: role-gated catalog management
- LISVerifyResultsPermission: role-gated result verification
- Standalone endpoint integration: 403 when flags disabled
"""

import pytest  # type: ignore
from django.test import RequestFactory
from rest_framework.views import APIView

from hmis.apps.laboratory.permissions import (
    LaboratoryModuleRequired,
    LISManageCatalogPermission,
    LISQCPermission,
    LISStandaloneRequired,
    LISVerifyResultsPermission,
)


@pytest.fixture
def rf():
    """Django request factory."""
    return RequestFactory()


@pytest.fixture
def lab_facility(db, sample_organization, sample_county, sample_sub_county):
    """Facility with laboratory module enabled."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Lab Facility",
        mfl_code="LAB01",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
        has_laboratory=True,
        has_lis_standalone=False,
    )


@pytest.fixture
def lis_standalone_facility(db, sample_organization, sample_county, sample_sub_county):
    """Facility with LIS standalone mode enabled (no integrated lab)."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Standalone LIS Facility",
        mfl_code="LIS01",
        level="2",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
        has_laboratory=False,
        has_lis_standalone=True,
    )


@pytest.fixture
def no_lab_facility(db, sample_organization, sample_county, sample_sub_county):
    """Facility with neither lab module nor LIS standalone."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="No Lab Facility",
        mfl_code="NOL01",
        level="1",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
        has_laboratory=False,
        has_lis_standalone=False,
    )


def _make_user_with_profile(db, facility, role_code="LAB_TECH", username=None):
    """Helper to create user + staff profile with given role at facility."""
    from datetime import date

    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import Department, Role, StaffProfile

    User = get_user_model()
    uname = username or f"user_{role_code.lower()}_{facility.pk}"
    user = User.objects.create_user(username=uname, password="testpass123")

    dept, _ = Department.objects.get_or_create(
        code="LAB",
        facility=facility,
        defaults={
            "name": "Laboratory",
            "is_active": True,
            "organization": facility.organization,
        },
    )
    role, _ = Role.objects.get_or_create(
        code=role_code,
        defaults={
            "name": role_code.replace("_", " ").title(),
            "hierarchy_level": 5,
            "is_active": True,
        },
    )
    StaffProfile.objects.create(
        user=user,
        employee_id=f"EMP-{user.pk}",
        organization=facility.organization,
        primary_facility=facility,
        primary_department=dept,
        primary_role=role,
        date_joined=date.today(),
    )
    return user


# =============================================================================
# LaboratoryModuleRequired Tests
# =============================================================================


class TestLaboratoryModuleRequired:
    """Tests for LaboratoryModuleRequired permission."""

    def test_allows_when_has_laboratory_true(self, db, rf, lab_facility):
        """Should allow access when facility has_laboratory=True."""
        user = _make_user_with_profile(db, lab_facility)
        request = rf.get("/api/lab/orders/")
        request.user = user

        perm = LaboratoryModuleRequired()
        assert perm.has_permission(request, APIView()) is True

    def test_allows_when_has_lis_standalone_true(self, db, rf, lis_standalone_facility):
        """Should allow access when facility has_lis_standalone=True."""
        user = _make_user_with_profile(db, lis_standalone_facility)
        request = rf.get("/api/lab/orders/")
        request.user = user

        perm = LaboratoryModuleRequired()
        assert perm.has_permission(request, APIView()) is True

    def test_denies_when_neither_enabled(self, db, rf, no_lab_facility):
        """Should deny when both has_laboratory and has_lis_standalone are False."""
        user = _make_user_with_profile(db, no_lab_facility)
        request = rf.get("/api/lab/orders/")
        request.user = user

        perm = LaboratoryModuleRequired()
        assert perm.has_permission(request, APIView()) is False

    def test_denies_unauthenticated(self, rf):
        """Should deny unauthenticated requests."""
        from django.contrib.auth.models import AnonymousUser

        request = rf.get("/api/lab/orders/")
        request.user = AnonymousUser()

        perm = LaboratoryModuleRequired()
        assert perm.has_permission(request, APIView()) is False

    def test_allows_superuser_without_profile(self, db, rf):
        """Superusers should bypass facility checks."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        superuser = User.objects.create_superuser(
            username="lab_super", password="pass", email="super@test.com"
        )
        request = rf.get("/api/lab/orders/")
        request.user = superuser

        perm = LaboratoryModuleRequired()
        assert perm.has_permission(request, APIView()) is True

    def test_denies_user_without_profile(self, db, rf):
        """Should deny user without staff profile."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(username="noprofile", password="pass")
        request = rf.get("/api/lab/orders/")
        request.user = user

        perm = LaboratoryModuleRequired()
        assert perm.has_permission(request, APIView()) is False


# =============================================================================
# LISStandaloneRequired Tests
# =============================================================================


class TestLISStandaloneRequired:
    """Tests for LISStandaloneRequired permission."""

    def test_allows_when_facility_has_lis_standalone(self, db, rf, lis_standalone_facility):
        """Should allow when facility.has_lis_standalone=True."""
        user = _make_user_with_profile(db, lis_standalone_facility)
        request = rf.get("/api/lab/standalone/walkin-patients/")
        request.user = user

        perm = LISStandaloneRequired()
        assert perm.has_permission(request, APIView()) is True

    def test_denies_when_only_integrated_lab(self, db, rf, lab_facility, settings):
        """Should deny when facility only has integrated lab (not standalone)."""
        settings.LIS_STANDALONE_MODE = False
        user = _make_user_with_profile(db, lab_facility)
        request = rf.get("/api/lab/standalone/walkin-patients/")
        request.user = user

        perm = LISStandaloneRequired()
        assert perm.has_permission(request, APIView()) is False

    def test_allows_when_global_standalone_mode(self, db, rf, lab_facility, settings):
        """Should allow when LIS_STANDALONE_MODE setting is True."""
        settings.LIS_STANDALONE_MODE = True
        user = _make_user_with_profile(db, lab_facility, username="global_mode_user")
        request = rf.get("/api/lab/standalone/walkin-patients/")
        request.user = user

        perm = LISStandaloneRequired()
        assert perm.has_permission(request, APIView()) is True

    def test_denies_when_both_flags_false(self, db, rf, no_lab_facility, settings):
        """Should deny when neither global nor facility flag is set."""
        settings.LIS_STANDALONE_MODE = False
        user = _make_user_with_profile(db, no_lab_facility, username="both_off_user")
        request = rf.get("/api/lab/standalone/walkin-patients/")
        request.user = user

        perm = LISStandaloneRequired()
        assert perm.has_permission(request, APIView()) is False

    def test_allows_superuser(self, db, rf):
        """Superusers bypass all checks."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        superuser = User.objects.create_superuser(
            username="lis_super", password="pass", email="lissuper@test.com"
        )
        request = rf.get("/api/lab/standalone/walkin-patients/")
        request.user = superuser

        perm = LISStandaloneRequired()
        assert perm.has_permission(request, APIView()) is True

    def test_denies_unauthenticated(self, rf):
        """Should deny unauthenticated."""
        from django.contrib.auth.models import AnonymousUser

        request = rf.get("/api/lab/standalone/walkin-patients/")
        request.user = AnonymousUser()

        perm = LISStandaloneRequired()
        assert perm.has_permission(request, APIView()) is False


# =============================================================================
# LISQCPermission Tests
# =============================================================================


class TestLISQCPermission:
    """Tests for LISQCPermission role gating."""

    @pytest.mark.parametrize("role_code", ["LAB_TECH", "LAB_SCIENTIST", "PATHOLOGIST", "ADMIN"])
    def test_allows_authorized_roles(self, db, rf, lab_facility, role_code):
        """Should allow LAB_TECH, LAB_SCIENTIST, PATHOLOGIST, ADMIN."""
        user = _make_user_with_profile(db, lab_facility, role_code=role_code)
        request = rf.get("/api/lab/qc/")
        request.user = user

        perm = LISQCPermission()
        assert perm.has_permission(request, APIView()) is True

    @pytest.mark.parametrize("role_code", ["NURSE", "DOCTOR", "RECEPTIONIST", "PHLEBOTOMIST"])
    def test_denies_unauthorized_roles(self, db, rf, lab_facility, role_code):
        """Should deny roles without QC access."""
        user = _make_user_with_profile(db, lab_facility, role_code=role_code)
        request = rf.get("/api/lab/qc/")
        request.user = user

        perm = LISQCPermission()
        assert perm.has_permission(request, APIView()) is False


# =============================================================================
# LISManageCatalogPermission Tests
# =============================================================================


class TestLISManageCatalogPermission:
    """Tests for LISManageCatalogPermission."""

    def test_allows_read_for_any_authenticated_user(self, db, rf, lab_facility):
        """GET/HEAD/OPTIONS allowed for any authenticated user."""
        user = _make_user_with_profile(db, lab_facility, role_code="PHLEBOTOMIST")
        for method in ("get", "head", "options"):
            request = getattr(rf, method)("/api/lab/catalog/")
            request.user = user

            perm = LISManageCatalogPermission()
            assert perm.has_permission(request, APIView()) is True

    @pytest.mark.parametrize("role_code", ["LAB_SCIENTIST", "PATHOLOGIST", "ADMIN"])
    def test_allows_write_for_catalog_admin_roles(self, db, rf, lab_facility, role_code):
        """POST/PUT/PATCH/DELETE allowed for catalog admin roles."""
        user = _make_user_with_profile(db, lab_facility, role_code=role_code)
        request = rf.post("/api/lab/catalog/", data={})
        request.user = user

        perm = LISManageCatalogPermission()
        assert perm.has_permission(request, APIView()) is True

    def test_denies_write_for_non_admin_role(self, db, rf, lab_facility):
        """LAB_TECH cannot write to catalog."""
        user = _make_user_with_profile(db, lab_facility, role_code="LAB_TECH")
        request = rf.post("/api/lab/catalog/", data={})
        request.user = user

        perm = LISManageCatalogPermission()
        assert perm.has_permission(request, APIView()) is False


# =============================================================================
# LISVerifyResultsPermission Tests
# =============================================================================


class TestLISVerifyResultsPermission:
    """Tests for LISVerifyResultsPermission."""

    @pytest.mark.parametrize("role_code", ["LAB_SCIENTIST", "PATHOLOGIST", "ADMIN"])
    def test_allows_verification_roles(self, db, rf, lab_facility, role_code):
        """Should allow LAB_SCIENTIST, PATHOLOGIST, ADMIN."""
        user = _make_user_with_profile(db, lab_facility, role_code=role_code)
        request = rf.post("/api/lab/results/verify/")
        request.user = user

        perm = LISVerifyResultsPermission()
        assert perm.has_permission(request, APIView()) is True

    @pytest.mark.parametrize("role_code", ["LAB_TECH", "NURSE", "PHLEBOTOMIST"])
    def test_denies_non_verification_roles(self, db, rf, lab_facility, role_code):
        """Should deny LAB_TECH, NURSE, PHLEBOTOMIST."""
        user = _make_user_with_profile(db, lab_facility, role_code=role_code)
        request = rf.post("/api/lab/results/verify/")
        request.user = user

        perm = LISVerifyResultsPermission()
        assert perm.has_permission(request, APIView()) is False


# =============================================================================
# Integration: Standalone Endpoint Access Tests
# =============================================================================


class TestStandaloneEndpointAccess:
    """Integration tests: standalone endpoints return 403 when flags are off."""

    @pytest.fixture
    def lis_client(self, db, lis_standalone_facility):
        """Authenticated client with LIS standalone facility."""
        from rest_framework.test import APIClient

        user = _make_user_with_profile(db, lis_standalone_facility, role_code="LAB_TECH")
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    @pytest.fixture
    def no_lis_client(self, db, no_lab_facility, settings):
        """Authenticated client with no lab/LIS modules."""
        from rest_framework.test import APIClient

        settings.LIS_STANDALONE_MODE = False
        user = _make_user_with_profile(db, no_lab_facility, role_code="LAB_TECH")
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_walkin_patients_accessible_with_lis_standalone(self, lis_client):
        """Walk-in patient endpoint should be accessible."""
        response = lis_client.get("/api/lab/standalone/walkin-patients/")
        assert response.status_code == 200

    def test_walkin_patients_denied_without_flags(self, no_lis_client):
        """Walk-in patient endpoint should return 403 without LIS flags."""
        response = no_lis_client.get("/api/lab/standalone/walkin-patients/")
        assert response.status_code == 403

    def test_standalone_order_create_denied_without_flags(self, no_lis_client):
        """Standalone order create endpoint should return 403 without LIS flags."""
        response = no_lis_client.post("/api/lab/standalone/orders/create/", data={}, format="json")
        assert response.status_code == 403

    def test_external_orders_denied_without_flags(self, no_lis_client):
        """External orders endpoint should return 403 without LIS flags."""
        response = no_lis_client.get("/api/lab/standalone/external-orders/")
        assert response.status_code == 403
