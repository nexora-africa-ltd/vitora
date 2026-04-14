"""
Tests for Phase 2: Link Staff to Facility.

Covers:
* StaffProfile model — ``primary_facility`` FK, ``secondary_facilities`` M2M,
  ``get_all_facilities()`` method.
* Serializer — ``primary_facility_name`` resolved field in read serializer,
  facility fields in create and update serializers.
* API — creating staff with a facility assignment, updating facility assignment,
  filtering staff by ``primary_facility``.
"""

import pytest  # type: ignore  # noqa: I001
from rest_framework import status
from tests.conftest import ensure_staff_profile


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sf_county(db):
    """Create a county for staff-facility tests."""
    from hmis.apps.core.models import County

    return County.objects.get_or_create(code=47, defaults={"name": "Nairobi"})[0]


@pytest.fixture
def sf_sub_county(db, sf_county):
    """Create a sub-county for staff-facility tests."""
    from hmis.apps.core.models import SubCounty

    return SubCounty.objects.get_or_create(county=sf_county, name="Westlands")[0]


@pytest.fixture
def primary_facility(db, sf_county, sf_sub_county, sample_organization):
    """Create a primary facility for staff assignment."""
    from hmis.apps.core.models import Facility

    return Facility.objects.get_or_create(
        mfl_code="PF001",
        defaults={
            "name": "Primary Health Centre",
            "level": "3",
            "ownership": "GOK",
            "county": sf_county,
            "sub_county": sf_sub_county,
            "organization": sample_organization,
        },
    )[0]


@pytest.fixture
def secondary_facility(db, sf_county, sf_sub_county, sample_organization):
    """Create a secondary facility for multi-site assignment."""
    from hmis.apps.core.models import Facility

    return Facility.objects.get_or_create(
        mfl_code="SF001",
        defaults={
            "name": "Secondary Dispensary",
            "level": "2",
            "ownership": "FBO",
            "county": sf_county,
            "sub_county": sf_sub_county,
            "organization": sample_organization,
        },
    )[0]


@pytest.fixture
def sf_role(db):
    """Create a role for staff-facility tests."""
    from hmis.apps.core.models import Role

    return Role.objects.get_or_create(
        code="CLIN_OFF",
        defaults={
            "name": "Clinical Officer",
            "category": "CLINICAL",
            "hierarchy_level": 2,
        },
    )[0]


@pytest.fixture
def sf_department(db):
    """Create a department for staff-facility tests."""
    from hmis.apps.core.models import Department

    return Department.objects.get_or_create(
        code="OPD",
        defaults={"name": "Outpatient Department"},
    )[0]


@pytest.fixture
def staff_with_facility(db, sf_role, sf_department, primary_facility, secondary_facility):
    """Create a StaffProfile linked to a primary and secondary facility."""
    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import StaffProfile

    User = get_user_model()
    user = User.objects.create_user(
        username="facilitystaff",
        email="fstaff@example.com",
        first_name="Jane",
        last_name="Muthoni",
        password="secure123!",
    )
    profile = StaffProfile.objects.create(
        user=user,
        employee_id="VH-SF-001",
        primary_role=sf_role,
        primary_department=sf_department,
        primary_facility=primary_facility,
        organization=primary_facility.organization,
        date_joined="2026-01-01",
    )
    profile.secondary_facilities.add(secondary_facility)
    return profile


@pytest.fixture
def staff_without_facility(db, sf_role, sf_department):
    """Create a StaffProfile without any facility assignment (legacy data)."""
    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import StaffProfile

    User = get_user_model()
    user = User.objects.create_user(
        username="nofacilitystaff",
        email="nofc@example.com",
        first_name="Peter",
        last_name="Otieno",
        password="secure123!",
    )
    return StaffProfile.objects.create(
        user=user,
        employee_id="VH-SF-002",
        primary_role=sf_role,
        primary_department=sf_department,
        date_joined="2026-02-01",
    )


@pytest.fixture
def admin_user_sf(db):
    """Create an admin user for write-permission tests."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username="sfadmin",
        password="admin123!",
        is_staff=True,
    )


@pytest.fixture
def admin_client_sf(api_client, admin_user_sf, sample_organization, sample_facility):
    """Return an APIClient authenticated as an admin user."""
    ensure_staff_profile(admin_user_sf, sample_organization, sample_facility)
    api_client.force_authenticate(user=admin_user_sf)
    return api_client


# ============================================================================
# Model Tests
# ============================================================================


class TestStaffFacilityModel:
    """Unit tests for StaffProfile facility assignment fields."""

    def test_primary_facility_assigned(self, staff_with_facility, primary_facility):
        """Staff should have their primary facility FK set."""
        assert staff_with_facility.primary_facility == primary_facility

    def test_secondary_facilities_assigned(self, staff_with_facility, secondary_facility):
        """Staff should have their secondary facility in the M2M set."""
        assert secondary_facility in staff_with_facility.secondary_facilities.all()

    def test_get_all_facilities_includes_both(
        self, staff_with_facility, primary_facility, secondary_facility
    ):
        """``get_all_facilities()`` should return primary + secondaries."""
        facilities = staff_with_facility.get_all_facilities()
        assert primary_facility in facilities
        assert secondary_facility in facilities
        assert len(facilities) == 2

    def test_get_all_facilities_primary_first(self, staff_with_facility, primary_facility):
        """Primary facility should be the first element."""
        facilities = staff_with_facility.get_all_facilities()
        assert facilities[0] == primary_facility

    def test_get_all_facilities_empty_when_no_facility(self, staff_without_facility):
        """Staff without a primary facility should return empty list."""
        facilities = staff_without_facility.get_all_facilities()
        assert facilities == []

    def test_primary_facility_nullable(self, staff_without_facility):
        """primary_facility should be None for legacy/unassigned staff."""
        assert staff_without_facility.primary_facility is None

    def test_facility_protect_on_delete(self, staff_with_facility, primary_facility):
        """Deleting a facility with assigned staff should raise ProtectedError."""
        from django.db.models import ProtectedError

        with pytest.raises(ProtectedError):
            primary_facility.delete()

    def test_reverse_relation_staff(self, staff_with_facility, primary_facility):
        """Facility.staff reverse manager should list assigned staff."""
        assert staff_with_facility in primary_facility.staff.all()

    def test_reverse_relation_secondary_staff(self, staff_with_facility, secondary_facility):
        """Facility.secondary_staff reverse manager should list M2M staff."""
        assert staff_with_facility in secondary_facility.secondary_staff.all()


# ============================================================================
# Serializer Tests
# ============================================================================


class TestStaffFacilitySerializers:
    """Tests for facility fields in StaffProfile serializers."""

    def test_read_serializer_includes_facility_name(self, staff_with_facility):
        """StaffProfileSerializer should include ``primary_facility_name``."""
        from hmis.apps.core.serializers import StaffProfileSerializer

        data = StaffProfileSerializer(staff_with_facility).data
        assert "primary_facility" in data
        assert "primary_facility_name" in data
        assert data["primary_facility"] == staff_with_facility.primary_facility_id
        assert data["primary_facility_name"] == "Primary Health Centre"

    def test_read_serializer_null_facility(self, staff_without_facility):
        """StaffProfileSerializer should handle null primary_facility."""
        from hmis.apps.core.serializers import StaffProfileSerializer

        data = StaffProfileSerializer(staff_without_facility).data
        assert data["primary_facility"] is None
        assert data["primary_facility_name"] is None

    def test_read_serializer_includes_secondary_facilities(self, staff_with_facility):
        """StaffProfileSerializer should include secondary_facilities."""
        from hmis.apps.core.serializers import StaffProfileSerializer

        data = StaffProfileSerializer(staff_with_facility).data
        assert "secondary_facilities" in data
        assert len(data["secondary_facilities"]) == 1

    def test_update_serializer_accepts_facility(self, staff_with_facility, secondary_facility):
        """StaffProfileUpdateSerializer should accept primary_facility changes."""
        from hmis.apps.core.serializers import StaffProfileUpdateSerializer

        serializer = StaffProfileUpdateSerializer(
            staff_with_facility,
            data={"primary_facility": secondary_facility.id},
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.primary_facility == secondary_facility


# ============================================================================
# API Tests
# ============================================================================


class TestStaffFacilityAPI:
    """Integration tests for staff-facility assignment via the API."""

    def test_retrieve_staff_includes_facility(self, authenticated_client, staff_with_facility):
        """GET /api/staff/{id}/ should include facility fields."""
        response = authenticated_client.get(f"/api/staff/{staff_with_facility.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["primary_facility"] == staff_with_facility.primary_facility_id
        assert response.data["primary_facility_name"] == "Primary Health Centre"
        assert len(response.data["secondary_facilities"]) == 1

    def test_create_staff_with_facility(
        self, admin_client_sf, sf_role, sf_department, primary_facility
    ):
        """Admin can create a staff profile with a facility assignment."""
        data = {
            "username": "newstaff",
            "email": "new@example.com",
            "first_name": "New",
            "last_name": "Staff",
            "employee_id": "VH-NEW-001",
            "role": sf_role.id,
            "department": sf_department.id,
            "primary_facility": primary_facility.id,
            "hire_date": "2026-03-01",
        }
        response = admin_client_sf.post("/api/staff/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["primary_facility"] == primary_facility.id
        assert response.data["primary_facility_name"] == "Primary Health Centre"

    def test_create_staff_without_facility(self, admin_client_sf, sf_role, sf_department):
        """Admin can create a staff profile without a facility (legacy mode)."""
        data = {
            "username": "legacystaff",
            "email": "legacy@example.com",
            "first_name": "Legacy",
            "last_name": "User",
            "employee_id": "VH-LEG-001",
            "role": sf_role.id,
            "department": sf_department.id,
            "hire_date": "2026-03-01",
        }
        response = admin_client_sf.post("/api/staff/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["primary_facility"] is None

    def test_update_staff_facility(self, admin_client_sf, staff_with_facility, secondary_facility):
        """Admin can reassign a staff member's primary facility."""
        response = admin_client_sf.patch(
            f"/api/staff/{staff_with_facility.id}/",
            {"primary_facility": secondary_facility.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["primary_facility"] == secondary_facility.id
        assert response.data["primary_facility_name"] == "Secondary Dispensary"

    def test_clear_staff_facility(self, admin_client_sf, staff_with_facility):
        """Admin can clear a staff member's primary facility (set to null)."""
        response = admin_client_sf.patch(
            f"/api/staff/{staff_with_facility.id}/",
            {"primary_facility": None},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["primary_facility"] is None

    def test_filter_staff_by_facility(
        self, authenticated_client, staff_with_facility, primary_facility
    ):
        """GET /api/staff/?primary_facility={id} should filter correctly."""
        response = authenticated_client.get(f"/api/staff/?primary_facility={primary_facility.id}")
        assert response.status_code == status.HTTP_200_OK
        employee_ids = [s["employee_id"] for s in response.data["results"]]
        assert "VH-SF-001" in employee_ids

    def test_filter_staff_by_facility_no_match(
        self, authenticated_client, staff_with_facility, secondary_facility
    ):
        """Filter by a facility where staff is secondary should not return them."""
        response = authenticated_client.get(f"/api/staff/?primary_facility={secondary_facility.id}")
        assert response.status_code == status.HTTP_200_OK
        employee_ids = [s["employee_id"] for s in response.data["results"]]
        assert "VH-SF-001" not in employee_ids
