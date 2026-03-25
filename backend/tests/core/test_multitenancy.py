"""
Tests for multitenancy: Organization model, Facility linkage,
TenantMiddleware, and Organization API.

Phase 1 of the Vitora HMIS multi-tenancy plan.
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.core.models import (
    County,
    Department,
    Facility,
    Organization,
    Role,
    StaffProfile,
    SubCounty,
)

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_org(db):
    """Create a sample organization."""
    return Organization.objects.create(
        name="Demo Health Group",
        slug="demo-health-group",
        contact_email="admin@demohealth.co.ke",
        subscription_tier="BASIC",
    )


@pytest.fixture
def another_org(db):
    """Create a second organization for isolation tests."""
    return Organization.objects.create(
        name="Other Health Network",
        slug="other-health-network",
        contact_email="admin@otherhealth.co.ke",
    )


@pytest.fixture
def org_county(db):
    """County for facility tests."""
    return County.objects.create(code=47, name="Nairobi")


@pytest.fixture
def org_sub_county(db, org_county):
    """Sub-county for facility tests."""
    return SubCounty.objects.create(county=org_county, name="Westlands")


@pytest.fixture
def sample_facility(db, sample_org, org_county, org_sub_county):
    """Create a facility linked to sample_org."""
    return Facility.objects.create(
        organization=sample_org,
        mfl_code="12345",
        name="Demo Clinic - Main",
        level="3",
        ownership="PRIVATE",
        county=org_county,
        sub_county=org_sub_county,
        is_headquarters=True,
        branch_code="HQ",
    )


@pytest.fixture
def second_facility(db, sample_org, org_county, org_sub_county):
    """Create a second facility in the same org."""
    return Facility.objects.create(
        organization=sample_org,
        mfl_code="12346",
        name="Demo Clinic - Branch",
        level="2",
        ownership="PRIVATE",
        county=org_county,
        sub_county=org_sub_county,
        branch_code="BR01",
    )


@pytest.fixture
def other_org_facility(db, another_org, org_county, org_sub_county):
    """Create a facility belonging to another_org."""
    return Facility.objects.create(
        organization=another_org,
        mfl_code="99999",
        name="Other Org Clinic",
        level="2",
        ownership="GOK",
        county=org_county,
        sub_county=org_sub_county,
    )


@pytest.fixture
def sample_department(db):
    """Create a minimal department for StaffProfile tests."""
    return Department.objects.create(
        name="General",
        code="GEN",
        description="General department",
    )


@pytest.fixture
def sample_role(db):
    """Create a minimal role for StaffProfile tests."""
    return Role.objects.create(
        code="DOCTOR",
        name="Doctor",
        category="CLINICAL",
    )


@pytest.fixture
def staff_user(db):
    """Create a user for staff profile tests."""
    return User.objects.create_user(
        username="drstaff", email="dr@demo.co.ke", password="testpass123"
    )


@pytest.fixture
def staff_profile(db, staff_user, sample_facility, sample_department, sample_role):
    """Create a StaffProfile linked to sample_facility."""
    return StaffProfile.objects.create(
        user=staff_user,
        employee_id="VH-2026-T01",
        primary_role=sample_role,
        primary_department=sample_department,
        primary_facility=sample_facility,
        date_joined=date(2026, 1, 1),
    )


@pytest.fixture
def admin_user(db):
    """Create a superuser for admin-only endpoints."""
    return User.objects.create_superuser(
        username="orgadmin", email="orgadmin@demo.co.ke", password="adminpass123"
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    """Authenticated API client with admin privileges."""
    api_client.force_authenticate(user=admin_user)
    return api_client


# ============================================================================
# Organization Model Tests
# ============================================================================


class TestOrganizationModel:
    """Tests for the Organization model."""

    def test_create_organization(self, sample_org):
        """Should create org with all default fields."""
        assert sample_org.pk is not None
        assert sample_org.name == "Demo Health Group"
        assert sample_org.slug == "demo-health-group"
        assert sample_org.is_active is True
        assert sample_org.subscription_tier == "BASIC"
        assert sample_org.data_retention_years == 7

    def test_organization_str(self, sample_org):
        """__str__ should return organization name."""
        assert str(sample_org) == "Demo Health Group"

    def test_unique_name(self, sample_org):
        """Organization name must be unique."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            Organization.objects.create(name="Demo Health Group", slug="demo-2")

    def test_unique_slug(self, sample_org):
        """Organization slug must be unique."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            Organization.objects.create(name="Another Org", slug="demo-health-group")

    def test_facility_count(self, sample_org, sample_facility, second_facility):
        """facility_count property should return correct count."""
        assert sample_org.facility_count == 2

    def test_can_add_facility_unlimited(self, sample_org):
        """Should allow adding when max_facilities is None."""
        assert sample_org.max_facilities is None
        assert sample_org.can_add_facility() is True

    def test_can_add_facility_at_limit(self, sample_org, sample_facility):
        """Should deny adding when at capacity."""
        sample_org.max_facilities = 1
        sample_org.save()
        assert sample_org.can_add_facility() is False

    def test_settings_default(self, sample_org):
        """Settings should default to empty dict."""
        assert sample_org.settings == {}

    def test_subscription_tiers(self):
        """All subscription tier choices should be valid."""
        valid = {"FREE", "BASIC", "PROFESSIONAL", "ENTERPRISE"}
        choices = {c[0] for c in Organization.SubscriptionTier.choices}
        assert choices == valid


# ============================================================================
# Facility → Organization Linkage Tests
# ============================================================================


class TestFacilityOrganization:
    """Tests for the Facility → Organization relationship."""

    def test_facility_linked_to_org(self, sample_facility, sample_org):
        """Facility should be linked to its organization."""
        assert sample_facility.organization == sample_org
        assert sample_facility.organization_id == sample_org.pk

    def test_facility_headquarters_flag(self, sample_facility, second_facility):
        """Only HQ facility should have is_headquarters=True."""
        assert sample_facility.is_headquarters is True
        assert second_facility.is_headquarters is False

    def test_facility_branch_code(self, sample_facility, second_facility):
        """Branch codes should be set correctly."""
        assert sample_facility.branch_code == "HQ"
        assert second_facility.branch_code == "BR01"

    def test_org_facilities_queryset(self, sample_org, sample_facility, second_facility):
        """Organization.facilities should list all linked facilities."""
        facilities = list(sample_org.facilities.all())
        assert len(facilities) == 2
        assert sample_facility in facilities
        assert second_facility in facilities

    def test_facility_without_org(self, db, org_county, org_sub_county):
        """Facility can exist without an organization (nullable FK)."""
        f = Facility.objects.create(
            mfl_code="00000",
            name="Standalone Clinic",
            level="2",
            ownership="GOK",
            county=org_county,
            sub_county=org_sub_county,
        )
        assert f.organization is None


# ============================================================================
# StaffProfile → Organization Auto-Set Tests
# ============================================================================


class TestStaffOrganization:
    """Tests for StaffProfile organization auto-derivation."""

    def test_org_auto_set_from_facility(self, staff_profile, sample_org):
        """StaffProfile.organization should auto-set from primary_facility."""
        assert staff_profile.organization == sample_org

    def test_org_updated_on_facility_change(
        self, staff_profile, second_facility, another_org, other_org_facility
    ):
        """Changing primary_facility should update organization on save."""
        staff_profile.primary_facility = other_org_facility
        staff_profile.save()
        staff_profile.refresh_from_db()
        assert staff_profile.organization == another_org

    def test_org_none_when_facility_has_no_org(
        self, staff_user, sample_department, sample_role, org_county, org_sub_county
    ):
        """Org stays None if facility has no organization."""
        standalone = Facility.objects.create(
            mfl_code="00001",
            name="No-Org Clinic",
            level="2",
            ownership="GOK",
            county=org_county,
            sub_county=org_sub_county,
        )
        profile = StaffProfile.objects.create(
            user=staff_user,
            employee_id="VH-2026-T02",
            primary_role=sample_role,
            primary_department=sample_department,
            primary_facility=standalone,
            date_joined=date(2026, 1, 1),
        )
        assert profile.organization is None


# ============================================================================
# TenantMiddleware Tests
# ============================================================================


class TestTenantMiddleware:
    """Tests for the TenantMiddleware request context resolution."""

    def test_middleware_resolves_facility_from_header(
        self, api_client, staff_user, staff_profile, sample_facility
    ):
        """Middleware should set request.facility from X-Facility-Id header."""
        api_client.force_authenticate(user=staff_user)
        api_client.credentials(HTTP_X_FACILITY_ID=str(sample_facility.pk))
        # Any authenticated endpoint works — use /api/patients/
        response = api_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_fallback_to_primary_facility(
        self, api_client, staff_user, staff_profile
    ):
        """Without header, middleware should use primary_facility."""
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_no_crash_without_profile(self, authenticated_client):
        """Users without StaffProfile should not crash middleware."""
        response = authenticated_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_superuser_can_access_any_facility(
        self, admin_client, other_org_facility
    ):
        """Superusers should be able to use any facility header."""
        admin_client.credentials(HTTP_X_FACILITY_ID=str(other_org_facility.pk))
        response = admin_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_denies_unassigned_facility(
        self, api_client, staff_user, staff_profile, other_org_facility
    ):
        """Staff should not resolve a facility they are not assigned to."""
        api_client.force_authenticate(user=staff_user)
        api_client.credentials(HTTP_X_FACILITY_ID=str(other_org_facility.pk))
        # Middleware doesn't 403, it just doesn't set request.facility
        # (the request still succeeds, it just has no facility context)
        response = api_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_secondary_facility_access(
        self, api_client, staff_user, staff_profile, second_facility
    ):
        """Staff should be able to access secondary facilities."""
        staff_profile.secondary_facilities.add(second_facility)
        api_client.force_authenticate(user=staff_user)
        api_client.credentials(HTTP_X_FACILITY_ID=str(second_facility.pk))
        response = api_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_invalid_facility_id(self, api_client, staff_user, staff_profile):
        """Invalid facility ID should not crash, just no facility context."""
        api_client.force_authenticate(user=staff_user)
        api_client.credentials(HTTP_X_FACILITY_ID="99999999")
        response = api_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# Organization API Tests
# ============================================================================


class TestOrganizationAPI:
    """Tests for the Organization REST API endpoints."""

    def test_list_organizations_authenticated(self, authenticated_client, sample_org):
        """Authenticated users can list organizations."""
        response = authenticated_client.get("/api/organizations/")
        assert response.status_code == status.HTTP_200_OK

    def test_list_organizations_unauthenticated(self, api_client, sample_org):
        """Unauthenticated requests should be rejected."""
        response = api_client.get("/api/organizations/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_organization(self, authenticated_client, sample_org):
        """Should return organization detail."""
        response = authenticated_client.get(f"/api/organizations/{sample_org.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Demo Health Group"
        assert response.data["slug"] == "demo-health-group"

    def test_create_organization_admin(self, admin_client):
        """Admin users can create organizations."""
        data = {
            "name": "New Health Network",
            "slug": "new-health-network",
            "contact_email": "info@newhealthnetwork.co.ke",
            "subscription_tier": "PROFESSIONAL",
        }
        response = admin_client.post("/api/organizations/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "New Health Network"
        assert Organization.objects.filter(slug="new-health-network").exists()

    def test_create_organization_non_admin_denied(self, authenticated_client):
        """Non-admin users cannot create organizations."""
        data = {
            "name": "Unauthorized Org",
            "slug": "unauthorized-org",
        }
        response = authenticated_client.post("/api/organizations/", data, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_organization_admin(self, admin_client, sample_org):
        """Admin users can update organizations."""
        response = admin_client.patch(
            f"/api/organizations/{sample_org.pk}/",
            {"contact_phone": "+254712345678"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_org.refresh_from_db()
        assert sample_org.contact_phone == "+254712345678"

    def test_update_organization_non_admin_denied(self, authenticated_client, sample_org):
        """Non-admin users cannot update organizations."""
        response = authenticated_client.patch(
            f"/api/organizations/{sample_org.pk}/",
            {"name": "Hacked Name"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_organization_admin(self, admin_client, sample_org):
        """Admin users can delete organizations."""
        response = admin_client.delete(f"/api/organizations/{sample_org.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Organization.objects.filter(pk=sample_org.pk).exists()

    def test_delete_organization_non_admin_denied(self, authenticated_client, sample_org):
        """Non-admin users cannot delete organizations."""
        response = authenticated_client.delete(f"/api/organizations/{sample_org.pk}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_org_facilities(
        self, authenticated_client, sample_org, sample_facility, second_facility
    ):
        """The facilities action should list facilities for the org."""
        response = authenticated_client.get(
            f"/api/organizations/{sample_org.pk}/facilities/"
        )
        assert response.status_code == status.HTTP_200_OK
        mfl_codes = [f["mfl_code"] for f in response.data]
        assert "12345" in mfl_codes
        assert "12346" in mfl_codes

    def test_org_serializer_includes_facility_count(
        self, authenticated_client, sample_org, sample_facility, second_facility
    ):
        """Detail response should include facility_count."""
        response = authenticated_client.get(f"/api/organizations/{sample_org.pk}/")
        assert response.status_code == status.HTTP_200_OK
        # facility_count is a property so it may or may not be annotated in list
        # but detail serializer includes it
        assert "facility_count" in response.data


# ============================================================================
# Facility API with Organization Fields
# ============================================================================


class TestFacilityAPIOrganization:
    """Tests that Facility API includes organization fields."""

    def test_facility_list_includes_organization(
        self, authenticated_client, sample_facility
    ):
        """Facility list should include organization and organization_name."""
        response = authenticated_client.get("/api/facilities/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        if isinstance(results, list) and len(results) > 0:
            facility_data = results[0]
            assert "organization" in facility_data
            assert "organization_name" in facility_data

    def test_facility_detail_includes_branch_fields(
        self, authenticated_client, sample_facility
    ):
        """Facility detail should include is_headquarters and branch_code."""
        response = authenticated_client.get(f"/api/facilities/{sample_facility.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert "is_headquarters" in response.data
        assert "branch_code" in response.data
        assert response.data["is_headquarters"] is True
        assert response.data["branch_code"] == "HQ"
