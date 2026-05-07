"""
Tests for the Facility model, serializers, and API endpoints.

Covers:
* Model creation, properties, ``__str__``, and ``default_modules_for_level``.
* Serializer validation (location hierarchy cross-field checks, KEPH defaults).
* API CRUD operations with authentication and permission enforcement.
* Query parameter filtering (level, ownership, county, module flags).
* ``/default_modules/`` custom action.
* Audit logging on create, update, and delete.
"""

import pytest  # type: ignore  # noqa: I001
from rest_framework import status

from tests.conftest import ensure_staff_profile

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def facility_county(db):
    """Create a dedicated county for facility tests (avoids collision with sample_county)."""
    from hmis.apps.core.models import County

    return County.objects.get_or_create(code=47, defaults={"name": "Nairobi"})[0]


@pytest.fixture
def facility_sub_county(db, facility_county):
    """Create a sub-county under the facility test county."""
    from hmis.apps.core.models import SubCounty

    return SubCounty.objects.get_or_create(county=facility_county, name="Westlands")[0]


@pytest.fixture
def facility_ward(db, facility_sub_county):
    """Create a ward under the facility test sub-county."""
    from hmis.apps.core.models import Ward

    return Ward.objects.get_or_create(sub_county=facility_sub_county, name="Parklands")[0]


@pytest.fixture
def other_county(db):
    """Create a different county for cross-validation tests."""
    from hmis.apps.core.models import County

    return County.objects.get_or_create(code=2, defaults={"name": "Kwale"})[0]


@pytest.fixture
def other_sub_county(db, other_county):
    """Create a sub-county that belongs to a different county."""
    from hmis.apps.core.models import SubCounty

    return SubCounty.objects.get_or_create(county=other_county, name="Msambweni")[0]


@pytest.fixture
def facility_data(facility_county, facility_sub_county):
    """Return a valid payload for creating a facility via the API."""
    return {
        "mfl_code": "12345",
        "name": "Demo Health Centre",
        "level": "3",
        "ownership": "GOK",
        "county": facility_county.id,
        "sub_county": facility_sub_county.id,
    }


@pytest.fixture
def sample_facility(db, facility_county, facility_sub_county, facility_ward, sample_organization):
    """Create and return a persisted Facility instance for read / update tests."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        mfl_code="99999",
        name="Sample District Hospital",
        level="4",
        ownership="GOK",
        county=facility_county,
        sub_county=facility_sub_county,
        ward=facility_ward,
        organization=sample_organization,
        sha_contracted=True,
        sha_facility_code="SHA-99999",
        has_outpatient=True,
        has_inpatient=True,
        has_emergency=True,
        has_pharmacy=True,
        has_laboratory=True,
        has_imaging=True,
        has_theatre=True,
    )


@pytest.fixture
def admin_user(db):
    """Create an admin (is_staff) user for write-permission tests."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username="facilityadmin",
        password="admin123!",
        is_staff=True,
    )


@pytest.fixture
def admin_client(api_client, admin_user, sample_organization, sample_facility):
    """Return an APIClient authenticated as an admin user."""
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=admin_user)
    return api_client


# ============================================================================
# Model Tests
# ============================================================================


class TestFacilityModel:
    """Unit tests for the Facility Django model."""

    def test_str_returns_name_and_mfl(self, sample_facility):
        """__str__ should return 'Name (MFL)' format."""
        assert str(sample_facility) == "Sample District Hospital (99999)"

    def test_modules_property_returns_dict(self, sample_facility):
        """The ``modules`` property should return all 14 module flags."""
        modules = sample_facility.modules
        assert isinstance(modules, dict)
        assert len(modules) == 14
        assert modules["outpatient"] is True
        assert modules["inpatient"] is True
        assert modules["mortuary"] is False

    def test_enabled_module_names(self, sample_facility):
        """``enabled_module_names`` should list only the enabled modules."""
        names = sample_facility.enabled_module_names
        assert "outpatient" in names
        assert "inpatient" in names
        assert "laboratory" in names
        assert "mortuary" not in names
        assert "blood_bank" not in names

    def test_default_modules_level_1(self):
        """Level 1 defaults: outpatient only (community unit)."""
        from hmis.apps.core.models import Facility

        defaults = Facility.default_modules_for_level("1")
        assert defaults["outpatient"] is True
        assert defaults["pharmacy"] is False
        assert defaults["inpatient"] is False
        assert defaults["laboratory"] is False

    def test_default_modules_level_4(self):
        """Level 4 defaults: clinical core without ICU / dialysis."""
        from hmis.apps.core.models import Facility

        defaults = Facility.default_modules_for_level("4")
        assert defaults["outpatient"] is True
        assert defaults["inpatient"] is True
        assert defaults["emergency"] is True
        assert defaults["theatre"] is True
        assert defaults["icu"] is False
        assert defaults["dialysis"] is False

    def test_default_modules_level_6(self):
        """Level 6 defaults: all modules enabled."""
        from hmis.apps.core.models import Facility

        defaults = Facility.default_modules_for_level("6")
        assert all(defaults.values())

    def test_default_modules_unknown_level(self):
        """Unknown levels fall back to outpatient only."""
        from hmis.apps.core.models import Facility

        defaults = Facility.default_modules_for_level("9")
        assert defaults["outpatient"] is True
        assert defaults["pharmacy"] is False
        assert defaults["inpatient"] is False

    def test_unique_mfl_code(self, sample_facility, facility_county, facility_sub_county):
        """MFL code must be unique – duplicate should raise IntegrityError."""
        from django.db import IntegrityError

        from hmis.apps.core.models import Facility

        with pytest.raises(IntegrityError):
            Facility.objects.create(
                mfl_code="99999",  # duplicate
                name="Another Facility",
                level="2",
                ownership="FBO",
                county=facility_county,
                sub_county=facility_sub_county,
            )

    def test_timestamps_auto_set(self, sample_facility):
        """``created_at`` and ``updated_at`` should be auto-populated."""
        assert sample_facility.created_at is not None
        assert sample_facility.updated_at is not None


# ============================================================================
# Serializer Tests
# ============================================================================


class TestFacilitySerializers:
    """Tests for Facility serializers (validation & output shape)."""

    def test_list_serializer_fields(self, sample_facility):
        """FacilityListSerializer should include compact fields + resolved names."""
        from hmis.apps.core.serializers import FacilityListSerializer

        data = FacilityListSerializer(sample_facility).data
        assert "mfl_code" in data
        assert "name" in data
        assert "county_name" in data
        assert data["county_name"] == "Nairobi"
        # Detail fields should NOT be present
        assert "modules" not in data
        assert "has_outpatient" not in data

    def test_detail_serializer_includes_modules(self, sample_facility):
        """FacilityDetailSerializer should include the full modules map."""
        from hmis.apps.core.serializers import FacilityDetailSerializer

        data = FacilityDetailSerializer(sample_facility).data
        assert "modules" in data
        assert "enabled_module_names" in data
        assert data["modules"]["outpatient"] is True
        assert "outpatient" in data["enabled_module_names"]

    def test_create_serializer_rejects_mismatched_sub_county(
        self, facility_county, other_sub_county
    ):
        """
        FacilityCreateSerializer should reject a sub_county that does not
        belong to the given county.
        """
        from hmis.apps.core.serializers import FacilityCreateSerializer

        data = {
            "mfl_code": "11111",
            "name": "Bad Location Facility",
            "level": "2",
            "ownership": "PRIVATE",
            "county": facility_county.id,
            "sub_county": other_sub_county.id,
        }
        serializer = FacilityCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "sub_county" in serializer.errors

    def test_create_serializer_rejects_mismatched_ward(
        self, facility_county, facility_sub_county, other_sub_county
    ):
        """
        FacilityCreateSerializer should reject a ward that does not belong
        to the given sub_county.
        """
        from hmis.apps.core.models import Ward
        from hmis.apps.core.serializers import FacilityCreateSerializer

        bad_ward = Ward.objects.create(sub_county=other_sub_county, name="Wrong Ward")

        data = {
            "mfl_code": "22222",
            "name": "Bad Ward Facility",
            "level": "2",
            "ownership": "PRIVATE",
            "county": facility_county.id,
            "sub_county": facility_sub_county.id,
            "ward": bad_ward.id,
        }
        serializer = FacilityCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "ward" in serializer.errors

    def test_create_serializer_applies_level_defaults(self, facility_county, facility_sub_county):
        """
        When no module flags are provided, create should apply KEPH-level
        defaults (e.g. level 3 → outpatient, pharmacy, laboratory, maternity).
        """
        from hmis.apps.core.serializers import FacilityCreateSerializer

        data = {
            "mfl_code": "33333",
            "name": "Auto-Defaults Facility",
            "level": "3",
            "ownership": "NGO",
            "county": facility_county.id,
            "sub_county": facility_sub_county.id,
        }
        serializer = FacilityCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        facility = serializer.save()
        assert facility.has_outpatient is True
        assert facility.has_pharmacy is True
        assert facility.has_laboratory is True
        assert facility.has_maternity is True
        assert facility.has_inpatient is False

    def test_create_serializer_respects_explicit_flags(self, facility_county, facility_sub_county):
        """
        When module flags are explicitly provided, level defaults should
        NOT override them.
        """
        from hmis.apps.core.serializers import FacilityCreateSerializer

        data = {
            "mfl_code": "44444",
            "name": "Explicit Flags Facility",
            "level": "6",
            "ownership": "GOK",
            "county": facility_county.id,
            "sub_county": facility_sub_county.id,
            "has_outpatient": True,
            "has_inpatient": False,  # override level-6 default
        }
        serializer = FacilityCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        facility = serializer.save()
        # Explicit False should survive (not overwritten by level-6 defaults)
        assert facility.has_inpatient is False


# ============================================================================
# API Tests
# ============================================================================


class TestFacilityAPI:
    """Integration tests for the Facility REST API endpoints."""

    # ------------------------------------------------------------------
    # Authentication & Permissions
    # ------------------------------------------------------------------

    def test_list_requires_auth(self, api_client):
        """Anonymous users should receive 401 on facility list."""
        response = api_client.get("/api/facilities/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_allowed_for_authenticated(self, authenticated_client, sample_facility):
        """Authenticated (non-admin) users can list facilities."""
        response = authenticated_client.get("/api/facilities/")
        assert response.status_code == status.HTTP_200_OK

    def test_retrieve_allowed_for_authenticated(self, authenticated_client, sample_facility):
        """Authenticated users can retrieve a single facility."""
        response = authenticated_client.get(f"/api/facilities/{sample_facility.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["mfl_code"] == "99999"
        assert "modules" in response.data

    def test_create_forbidden_for_non_admin(self, authenticated_client, facility_data):
        """Non-admin users should get 403 Forbidden when creating a facility."""
        response = authenticated_client.post("/api/facilities/", facility_data)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_forbidden_for_non_admin(self, authenticated_client, sample_facility):
        """Non-admin users should get 403 Forbidden when updating."""
        response = authenticated_client.patch(
            f"/api/facilities/{sample_facility.id}/", {"name": "Hacked"}
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_forbidden_for_non_admin(self, authenticated_client, sample_facility):
        """Non-admin users should get 403 Forbidden when deleting."""
        response = authenticated_client.delete(f"/api/facilities/{sample_facility.id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    # ------------------------------------------------------------------
    # CRUD (admin)
    # ------------------------------------------------------------------

    def test_create_facility(self, admin_client, facility_data):
        """Admin can create a facility; MFL code and name are persisted."""
        response = admin_client.post("/api/facilities/", facility_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["mfl_code"] == "12345"
        assert response.data["name"] == "Demo Health Centre"

    def test_update_facility(self, admin_client, sample_facility):
        """Admin can update a facility's name."""
        response = admin_client.patch(
            f"/api/facilities/{sample_facility.id}/",
            {"name": "Renamed Hospital"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Renamed Hospital"

    def test_delete_facility(self, admin_client, sample_facility):
        """Admin can delete a facility."""
        from hmis.apps.core.models import StaffProfile

        # Remove StaffProfiles referencing this facility to avoid ProtectedError
        StaffProfile.objects.filter(primary_facility=sample_facility).update(primary_facility=None)
        facility_id = sample_facility.id
        response = admin_client.delete(f"/api/facilities/{facility_id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        from hmis.apps.core.models import Facility

        assert not Facility.objects.filter(id=facility_id).exists()

    # ------------------------------------------------------------------
    # Filtering
    # ------------------------------------------------------------------

    def test_filter_by_level(self, authenticated_client, sample_facility):
        """Filter by KEPH level should return matching facilities."""
        response = authenticated_client.get("/api/facilities/?level=4")
        assert response.status_code == status.HTTP_200_OK
        mfl_codes = [f["mfl_code"] for f in response.data["results"]]
        assert "99999" in mfl_codes

    def test_filter_by_level_no_match(self, authenticated_client, sample_facility):
        """Filter by non-matching level should return empty results."""
        response = authenticated_client.get("/api/facilities/?level=1")
        assert response.status_code == status.HTTP_200_OK
        mfl_codes = [f["mfl_code"] for f in response.data["results"]]
        assert "99999" not in mfl_codes

    def test_filter_by_module_flag(self, authenticated_client, sample_facility):
        """Filter by ``has_laboratory=true`` should return matching facilities."""
        response = authenticated_client.get("/api/facilities/?has_laboratory=true")
        assert response.status_code == status.HTTP_200_OK
        mfl_codes = [f["mfl_code"] for f in response.data["results"]]
        assert "99999" in mfl_codes

    def test_search_by_name(self, authenticated_client, sample_facility):
        """Search by name should return matching facilities."""
        response = authenticated_client.get("/api/facilities/?search=District")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_search_by_mfl_code(self, authenticated_client, sample_facility):
        """Search by MFL code should return matching facilities."""
        response = authenticated_client.get("/api/facilities/?search=99999")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    # ------------------------------------------------------------------
    # Custom Actions
    # ------------------------------------------------------------------

    def test_default_modules_action(self, authenticated_client):
        """The ``/default_modules/`` action should return defaults for a KEPH level."""
        response = authenticated_client.get("/api/facilities/default_modules/?level=5")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["level"] == "5"
        modules = response.data["modules"]
        assert modules["icu"] is True
        assert modules["dialysis"] is True
        assert modules["blood_bank"] is False

    def test_default_modules_action_defaults_to_level_1(self, authenticated_client):
        """When no level param is given, default_modules falls back to level 1."""
        response = authenticated_client.get("/api/facilities/default_modules/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["level"] == "1"
        modules = response.data["modules"]
        assert modules["outpatient"] is True
        assert modules["inpatient"] is False

    # ------------------------------------------------------------------
    # Audit Logging
    # ------------------------------------------------------------------

    def test_create_logs_audit_entry(self, admin_client, facility_data):
        """Creating a facility should produce an audit log entry."""
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.filter(action="facility_created").count()
        admin_client.post("/api/facilities/", facility_data)
        assert AuditLog.objects.filter(action="facility_created").count() == initial_count + 1

    def test_update_logs_audit_entry(self, admin_client, sample_facility):
        """Updating a facility should produce an audit log entry."""
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.filter(action="facility_updated").count()
        admin_client.patch(f"/api/facilities/{sample_facility.id}/", {"name": "Updated"})
        assert AuditLog.objects.filter(action="facility_updated").count() == initial_count + 1

    def test_delete_logs_audit_entry(self, admin_client, sample_facility):
        """Deleting a facility should produce an audit log entry."""
        from hmis.apps.core.models import AuditLog, StaffProfile

        # Remove StaffProfiles referencing this facility to avoid ProtectedError
        StaffProfile.objects.filter(primary_facility=sample_facility).update(primary_facility=None)
        initial_count = AuditLog.objects.filter(action="facility_deleted").count()
        admin_client.delete(f"/api/facilities/{sample_facility.id}/")
        assert AuditLog.objects.filter(action="facility_deleted").count() == initial_count + 1

    # ------------------------------------------------------------------
    # Validation (via API)
    # ------------------------------------------------------------------

    def test_create_rejects_duplicate_mfl(self, admin_client, facility_data, sample_facility):
        """API should reject a facility with a duplicate MFL code."""
        facility_data["mfl_code"] = "99999"  # already taken by sample_facility
        response = admin_client.post("/api/facilities/", facility_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "mfl_code" in response.data

    def test_create_rejects_mismatched_location(
        self, admin_client, facility_county, other_sub_county
    ):
        """API should reject sub_county that doesn't belong to county."""
        data = {
            "mfl_code": "55555",
            "name": "Bad Loc",
            "level": "2",
            "ownership": "GOK",
            "county": facility_county.id,
            "sub_county": other_sub_county.id,
        }
        response = admin_client.post("/api/facilities/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "sub_county" in response.data
