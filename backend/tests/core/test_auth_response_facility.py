"""
Tests for Phase 4: Auth Response Enhancement.

Verifies that token obtain, MFA verify, and /api/staff/me/ responses include:
- role_category alongside role
- facility object with id, mfl_code, name, level, modules, sha_contracted
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def auth_county(db):
    from hmis.apps.core.models import County

    return County.objects.get_or_create(code=99, defaults={"name": "Auth Test County"})[0]


@pytest.fixture
def auth_sub_county(db, auth_county):
    from hmis.apps.core.models import SubCounty

    return SubCounty.objects.get_or_create(county=auth_county, name="Auth Sub-County")[0]


@pytest.fixture
def auth_facility(db, auth_county, auth_sub_county):
    from hmis.apps.core.models import Facility

    return Facility.objects.get_or_create(
        mfl_code="AUTH001",
        defaults={
            "name": "Auth Test Hospital",
            "level": "4",
            "ownership": "GOK",
            "county": auth_county,
            "sub_county": auth_sub_county,
            "sha_contracted": True,
            "has_outpatient": True,
            "has_inpatient": True,
            "has_emergency": True,
            "has_pharmacy": True,
            "has_laboratory": True,
            "has_imaging": False,
            "has_theatre": False,
            "has_dialysis": False,
            "has_icu": False,
            "has_maternity": False,
            "has_mortuary": False,
            "has_blood_bank": False,
        },
    )[0]


@pytest.fixture
def auth_role(db):
    from hmis.apps.core.models import Role

    return Role.objects.get_or_create(
        code="NURSE",
        defaults={
            "name": "Nurse",
            "category": "CLINICAL",
            "hierarchy_level": 3,
        },
    )[0]


@pytest.fixture
def auth_department(db):
    from hmis.apps.core.models import Department

    return Department.objects.get_or_create(
        code="AUTH_OPD",
        defaults={"name": "Auth OPD"},
    )[0]


@pytest.fixture
def user_with_facility(db, auth_role, auth_department, auth_facility):
    from hmis.apps.core.models import StaffProfile

    user = User.objects.create_user(
        username="nurse_facility",
        email="nurse@auth.test",
        first_name="Alice",
        last_name="Wanjiku",
        password="secure123!",
        is_staff=True,
    )
    StaffProfile.objects.create(
        user=user,
        employee_id="VH-AUTH-001",
        primary_role=auth_role,
        primary_department=auth_department,
        primary_facility=auth_facility,
        date_joined="2026-01-01",
    )
    return user


@pytest.fixture
def user_without_facility(db, auth_role, auth_department):
    from hmis.apps.core.models import StaffProfile

    user = User.objects.create_user(
        username="nurse_nofac",
        email="nurse_nofac@auth.test",
        first_name="Bob",
        last_name="Ochieng",
        password="secure123!",
        is_staff=True,
    )
    StaffProfile.objects.create(
        user=user,
        employee_id="VH-AUTH-002",
        primary_role=auth_role,
        primary_department=auth_department,
        date_joined="2026-01-01",
    )
    return user


@pytest.fixture
def superuser_no_profile(db):
    return User.objects.create_superuser(
        username="superadmin_auth",
        email="super@auth.test",
        password="secure123!",
    )


# ============================================================================
# Token Obtain Tests
# ============================================================================


@pytest.mark.django_db
class TestTokenObtainFacility:
    """Token obtain response includes facility, role_category."""

    def test_login_includes_facility(self, api_client, user_with_facility, auth_facility):
        """Login response should include facility object with modules."""
        url = reverse("token_obtain_pair")
        response = api_client.post(
            url, {"username": "nurse_facility", "password": "secure123!"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        user_data = response.data["user"]
        assert user_data["role"] == "NURSE"
        assert user_data["role_category"] == "CLINICAL"

        facility = user_data["facility"]
        assert facility is not None
        assert facility["id"] == auth_facility.id
        assert facility["mfl_code"] == "AUTH001"
        assert facility["name"] == "Auth Test Hospital"
        assert facility["level"] == "4"
        assert facility["sha_contracted"] is True
        assert facility["modules"]["outpatient"] is True
        assert facility["modules"]["inpatient"] is True
        assert facility["modules"]["imaging"] is False

    def test_login_without_facility_returns_null(self, api_client, user_without_facility):
        """Login response should return facility=null when no facility assigned."""
        url = reverse("token_obtain_pair")
        response = api_client.post(
            url, {"username": "nurse_nofac", "password": "secure123!"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        user_data = response.data["user"]
        assert user_data["role"] == "NURSE"
        assert user_data["role_category"] == "CLINICAL"
        assert user_data["facility"] is None

    def test_superuser_login_without_profile(self, api_client, superuser_no_profile):
        """Superuser login should return role=ADMIN and facility=null."""
        url = reverse("token_obtain_pair")
        response = api_client.post(
            url, {"username": "superadmin_auth", "password": "secure123!"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        user_data = response.data["user"]
        assert user_data["role"] == "ADMIN"
        assert user_data["facility"] is None


# ============================================================================
# /api/staff/me/ Tests
# ============================================================================


@pytest.mark.django_db
class TestStaffMeFacility:
    """/api/staff/me/ response includes user_info with facility."""

    def test_me_includes_user_info_with_facility(
        self, api_client, user_with_facility, auth_facility
    ):
        """GET /api/staff/me/ should include user_info with facility."""
        api_client.force_authenticate(user=user_with_facility)
        response = api_client.get("/api/staff/me/")

        assert response.status_code == status.HTTP_200_OK
        assert "user_info" in response.data

        user_info = response.data["user_info"]
        assert user_info["role"] == "NURSE"
        assert user_info["role_category"] == "CLINICAL"
        assert user_info["username"] == "nurse_facility"

        facility = user_info["facility"]
        assert facility is not None
        assert facility["id"] == auth_facility.id
        assert facility["mfl_code"] == "AUTH001"
        assert facility["modules"]["pharmacy"] is True
        assert facility["modules"]["theatre"] is False

    def test_me_without_facility_returns_null(self, api_client, user_without_facility):
        """GET /api/staff/me/ should return facility=null when not assigned."""
        api_client.force_authenticate(user=user_without_facility)
        response = api_client.get("/api/staff/me/")

        assert response.status_code == status.HTTP_200_OK
        user_info = response.data["user_info"]
        assert user_info["facility"] is None

    def test_me_includes_permissions_list(self, api_client, user_with_facility):
        """GET /api/staff/me/ user_info should include permissions array."""
        api_client.force_authenticate(user=user_with_facility)
        response = api_client.get("/api/staff/me/")

        user_info = response.data["user_info"]
        assert "permissions" in user_info
        assert isinstance(user_info["permissions"], list)


# ============================================================================
# _build_user_info unit tests
# ============================================================================


@pytest.mark.django_db
class TestBuildUserInfo:
    """Direct tests for _build_user_info helper."""

    def test_returns_all_expected_keys(self, user_with_facility):
        from hmis.apps.core.views import _build_user_info

        info = _build_user_info(user_with_facility)
        expected_keys = {
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_staff",
            "is_superuser",
            "role",
            "role_category",
            "role_display",
            "phone_number",
            "permissions",
            "facility",
        }
        assert set(info.keys()) == expected_keys

    def test_facility_has_all_module_keys(self, user_with_facility):
        from hmis.apps.core.views import _build_user_info

        info = _build_user_info(user_with_facility)
        modules = info["facility"]["modules"]
        expected_modules = {
            "outpatient",
            "inpatient",
            "emergency",
            "pharmacy",
            "laboratory",
            "imaging",
            "theatre",
            "dialysis",
            "icu",
            "maternity",
            "mortuary",
            "blood_bank",
            "inventory",
        }
        assert set(modules.keys()) == expected_modules

    def test_user_without_staff_profile(self, db):
        """User without a StaffProfile should get role=None, facility=None."""
        from hmis.apps.core.views import _build_user_info

        user = User.objects.create_user(
            username="plain_user_auth",
            password="pass123!",
        )
        info = _build_user_info(user)
        assert info["role"] is None
        assert info["role_category"] is None
        assert info["facility"] is None

    def test_superuser_gets_admin_role(self, superuser_no_profile):
        from hmis.apps.core.views import _build_user_info

        info = _build_user_info(superuser_no_profile)
        assert info["role"] == "ADMIN"
        assert info["facility"] is None
