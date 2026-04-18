"""
Tests for multitenancy: Organization model, Facility linkage,
TenantMiddleware, Organization API, and clinical model scoping.

Phase 1 + Phase 2 of the Vitora HMIS multi-tenancy plan.
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status

from hmis.apps.core.models import (
    AuditLog,
    County,
    Department,
    Facility,
    Organization,
    Role,
    StaffProfile,
    SubCounty,
    SyncQueue,
)
from tests.conftest import ensure_staff_profile

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
def admin_client(api_client, admin_user, sample_organization, sample_facility):
    """Authenticated API client with admin privileges."""
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
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

    def test_middleware_fallback_to_primary_facility(self, api_client, staff_user, staff_profile):
        """Without header, middleware should use primary_facility."""
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_no_crash_without_profile(self, authenticated_client):
        """Users without StaffProfile should not crash middleware."""
        response = authenticated_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK

    def test_middleware_superuser_can_access_any_facility(self, admin_client, other_org_facility):
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
        # Clean up references to the org before deletion
        Facility.objects.filter(organization=sample_org).update(organization=None)
        StaffProfile.objects.filter(organization=sample_org).delete()
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
        response = authenticated_client.get(f"/api/organizations/{sample_org.pk}/facilities/")
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

    def test_facility_list_includes_organization(self, authenticated_client, sample_facility):
        """Facility list should include organization and organization_name."""
        response = authenticated_client.get("/api/facilities/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        if isinstance(results, list) and len(results) > 0:
            facility_data = results[0]
            assert "organization" in facility_data
            assert "organization_name" in facility_data

    def test_facility_detail_includes_branch_fields(self, authenticated_client, sample_facility):
        """Facility detail should include is_headquarters and branch_code."""
        response = authenticated_client.get(f"/api/facilities/{sample_facility.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert "is_headquarters" in response.data
        assert "branch_code" in response.data
        assert response.data["is_headquarters"] is True
        assert response.data["branch_code"] == "HQ"


# ============================================================================
# Phase 2: Clinical Model Scoping Tests
# ============================================================================


class TestPatientOrganizationScoping:
    """Tests for Patient → Organization scoping."""

    def test_patient_can_have_organization(self, sample_org, sample_facility):
        """Patient should accept organization FK."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=sample_facility.county,
            sub_county=sample_facility.sub_county,
            organization=sample_org,
            registered_at_facility=sample_facility,
        )
        assert patient.organization == sample_org
        assert patient.registered_at_facility == sample_facility

    def test_patient_without_organization(self, org_county, org_sub_county):
        """Patient should work without organization (nullable)."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Legacy",
            last_name="Patient",
            date_of_birth="1985-06-15",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
        )
        assert patient.organization is None
        assert patient.registered_at_facility is None

    def test_org_patients_queryset(self, sample_org, sample_facility, org_county, org_sub_county):
        """Organization.patients should list all org patients."""
        from hmis.apps.patients.models import Patient

        p1 = Patient.objects.create(
            first_name="A",
            last_name="B",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        p2 = Patient.objects.create(
            first_name="C",
            last_name="D",
            date_of_birth="1991-02-02",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        assert sample_org.patients.count() == 2
        assert p1 in sample_org.patients.all()
        assert p2 in sample_org.patients.all()


class TestEncounterFacilityScoping:
    """Tests for Encounter → Facility scoping."""

    def test_encounter_can_have_facility(
        self, sample_org, sample_facility, org_county, org_sub_county
    ):
        """Encounter should accept facility + organization FKs."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="E",
            last_name="F",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test",
            organization=sample_org,
            facility=sample_facility,
        )
        assert encounter.organization == sample_org
        assert encounter.facility == sample_facility

    def test_encounter_without_facility(self, org_county, org_sub_county):
        """Encounter should work without facility (nullable FK)."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="G",
            last_name="H",
            date_of_birth="1987-03-03",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Legacy encounter",
        )
        assert encounter.facility is None
        assert encounter.organization is None

    def test_facility_encounters_queryset(
        self, sample_org, sample_facility, second_facility, org_county, org_sub_county
    ):
        """Encounters should be scoped to specific facility."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="I",
            last_name="J",
            date_of_birth="1992-04-04",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        enc1 = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="At HQ",
            organization=sample_org,
            facility=sample_facility,
        )
        enc2 = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="At branch",
            organization=sample_org,
            facility=second_facility,
        )
        assert sample_facility.encounters_encounter_set.count() == 1
        assert sample_facility.encounters_encounter_set.first() == enc1
        assert second_facility.encounters_encounter_set.count() == 1
        assert second_facility.encounters_encounter_set.first() == enc2
        # But org sees all
        assert sample_org.encounters_encounter_set.count() == 2


class TestAllergyOrganizationScoping:
    """Tests for Allergy → Organization scoping (shared medical history)."""

    def test_allergy_can_have_organization(self, sample_org, org_county, org_sub_county):
        """Allergy should accept organization FK."""
        from hmis.apps.patients.models import Allergy, Patient

        patient = Patient.objects.create(
            first_name="K",
            last_name="L",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        allergy = Allergy.objects.create(
            patient=patient,
            substance="Penicillin",
            substance_type="medication",
            severity="moderate",
            status="active",
            organization=sample_org,
        )
        assert allergy.organization == sample_org


class TestClinicalModelFKs:
    """Tests that all clinical models accept facility/organization FKs."""

    def test_ward_accepts_facility_fk(self, sample_org, sample_facility):
        """Ward should accept facility + organization FKs."""
        from hmis.apps.inpatient.models import Ward

        ward = Ward.objects.create(
            name="Test Ward MT",
            code="TW-MT-01",
            ward_type="GENERAL",
            capacity=10,
            daily_rate="500.00",
            organization=sample_org,
            facility=sample_facility,
        )
        assert ward.facility == sample_facility
        assert ward.organization == sample_org

    def test_audit_log_accepts_tenant_fks(self, sample_org, sample_facility):
        """AuditLog should accept organization + facility FKs."""
        log = AuditLog.objects.create(
            action="test_action",
            resource_type="Test",
            organization=sample_org,
            facility=sample_facility,
        )
        assert log.organization == sample_org
        assert log.facility == sample_facility

    def test_sync_queue_accepts_tenant_fks(self, sample_org, sample_facility):
        """SyncQueue should accept organization + facility FKs."""
        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Test",
            data={"key": "value"},
            organization=sample_org,
            facility=sample_facility,
        )
        assert entry.organization == sample_org
        assert entry.facility == sample_facility

    def test_invoice_accepts_tenant_fks(
        self, sample_org, sample_facility, org_county, org_sub_county, staff_user
    ):
        """Invoice should accept facility + organization FKs."""
        from hmis.apps.billing.models import Invoice
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Bill",
            last_name="Payer",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
        )
        invoice = Invoice.objects.create(
            patient=patient,
            created_by=staff_user,
            organization=sample_org,
            facility=sample_facility,
        )
        assert invoice.organization == sample_org
        assert invoice.facility == sample_facility

    def test_lab_order_accepts_tenant_fks(
        self, sample_org, sample_facility, org_county, org_sub_county, staff_user
    ):
        """LabOrder should accept facility + organization FKs."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Lab",
            last_name="Test",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Lab test",
        )
        order = LabOrder.objects.create(
            patient=patient,
            encounter=encounter,
            ordered_by=staff_user,
            organization=sample_org,
            facility=sample_facility,
        )
        assert order.organization == sample_org
        assert order.facility == sample_facility

    def test_prescription_accepts_tenant_fks(
        self, sample_org, sample_facility, org_county, org_sub_county, staff_user
    ):
        """Prescription should accept facility + organization FKs."""
        from datetime import timedelta

        from django.utils import timezone

        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        patient = Patient.objects.create(
            first_name="Rx",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
        )
        rx = Prescription.objects.create(
            patient=patient,
            prescribed_by=staff_user,
            valid_until=(timezone.now() + timedelta(days=30)).date(),
            organization=sample_org,
            facility=sample_facility,
        )
        assert rx.organization == sample_org
        assert rx.facility == sample_facility

    def test_clinic_accepts_tenant_fks(self, sample_org, sample_facility):
        """Clinic should accept facility + organization FKs."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="MT Clinic",
            clinic_type="GENERAL_OPD",
            code="MT-CLI-001",
            organization=sample_org,
            facility=sample_facility,
        )
        assert clinic.organization == sample_org
        assert clinic.facility == sample_facility

    def test_triage_accepts_tenant_fks(
        self, sample_org, sample_facility, org_county, org_sub_county, staff_user
    ):
        """TriageAssessment should accept facility + organization FKs."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.triage.models import TriageAssessment

        patient = Patient.objects.create(
            first_name="Tri",
            last_name="Age",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
        )
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Triage test",
        )
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=encounter,
            chief_complaint="Triage test",
            chief_complaint_category="FEVER",
            mental_status="A",
            mobility="AMBULATORY",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=staff_user,
            triage_category="GREEN",
            assigned_area="ER_ACUTE",
            organization=sample_org,
            facility=sample_facility,
        )
        assert triage.organization == sample_org
        assert triage.facility == sample_facility


class TestCrossOrgIsolation:
    """Tests verifying data isolation between organizations."""

    def test_patients_isolated_by_org(self, sample_org, another_org, org_county, org_sub_county):
        """Patients in different orgs should be isolated via queryset."""
        from hmis.apps.patients.models import Patient

        p_org1 = Patient.objects.create(
            first_name="Org1",
            last_name="Pat",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        p_org2 = Patient.objects.create(
            first_name="Org2",
            last_name="Pat",
            date_of_birth="1991-02-02",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=another_org,
        )
        org1_patients = Patient.objects.filter(organization=sample_org)
        org2_patients = Patient.objects.filter(organization=another_org)

        assert p_org1 in org1_patients
        assert p_org2 not in org1_patients
        assert p_org2 in org2_patients
        assert p_org1 not in org2_patients

    def test_encounters_isolated_by_facility(
        self,
        sample_org,
        another_org,
        sample_facility,
        other_org_facility,
        org_county,
        org_sub_county,
    ):
        """Encounters at different facilities should be isolated."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        p1 = Patient.objects.create(
            first_name="P1",
            last_name="F",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        p2 = Patient.objects.create(
            first_name="P2",
            last_name="F",
            date_of_birth="1991-01-01",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=another_org,
        )
        enc1 = Encounter.objects.create(
            patient=p1,
            encounter_type="OPD",
            chief_complaint="Org1",
            organization=sample_org,
            facility=sample_facility,
        )
        enc2 = Encounter.objects.create(
            patient=p2,
            encounter_type="OPD",
            chief_complaint="Org2",
            organization=another_org,
            facility=other_org_facility,
        )
        fac1_encounters = Encounter.objects.filter(facility=sample_facility)
        fac2_encounters = Encounter.objects.filter(facility=other_org_facility)

        assert enc1 in fac1_encounters
        assert enc2 not in fac1_encounters
        assert enc2 in fac2_encounters

    def test_patient_visible_across_facilities_in_same_org(
        self, sample_org, sample_facility, second_facility, org_county, org_sub_county
    ):
        """Patient registered at HQ should be visible org-wide."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Shared",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
            registered_at_facility=sample_facility,
        )
        # Org-wide query (used when user is at any facility in the org)
        org_patients = Patient.objects.filter(organization=sample_org)
        assert patient in org_patients
        # Patient is NOT filtered by facility — they're org-scoped
        assert org_patients.count() == 1


# ============================================================================
# Phase 3: API-Level Tenant Scoping Tests
# ============================================================================


@pytest.fixture
def other_staff_user(db):
    """Create a second user for cross-org tests."""
    return User.objects.create_user(
        username="drother", email="other@other.co.ke", password="testpass123"
    )


@pytest.fixture
def other_staff_profile(db, other_staff_user, other_org_facility, sample_department, sample_role):
    """Create a StaffProfile at the other org's facility."""
    return StaffProfile.objects.create(
        user=other_staff_user,
        employee_id="VH-2026-T99",
        primary_role=sample_role,
        primary_department=sample_department,
        primary_facility=other_org_facility,
        date_joined=date(2026, 1, 1),
    )


@pytest.fixture
def staff_client(db, staff_user, staff_profile, sample_facility, sample_organization):
    """API client authenticated as staff at sample_facility with facility header."""
    from rest_framework.test import APIClient

    client = APIClient()
    ensure_staff_profile(staff_user, sample_organization, sample_facility)
    client.force_authenticate(user=staff_user)
    client.credentials(HTTP_X_FACILITY_ID=str(sample_facility.pk))
    return client


@pytest.fixture
def other_staff_client(
    db,
    other_staff_user,
    other_staff_profile,
    other_org_facility,
    sample_organization,
    sample_facility,
):
    """API client authenticated as staff at the other org's facility."""
    from rest_framework.test import APIClient

    client = APIClient()
    ensure_staff_profile(other_staff_user, sample_organization, sample_facility)
    client.force_authenticate(user=other_staff_user)
    client.credentials(HTTP_X_FACILITY_ID=str(other_org_facility.pk))
    return client


class TestPatientAPIScopping:
    """Tests that Patient API respects organization scoping."""

    def test_patient_list_scoped_to_org(
        self, staff_client, sample_org, another_org, org_county, org_sub_county
    ):
        """Patient list should only return patients in the user's org."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="OrgOne",
            last_name="Pat",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        Patient.objects.create(
            first_name="OrgTwo",
            last_name="Pat",
            date_of_birth="1991-02-02",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=another_org,
        )

        response = staff_client.get("/api/patients/")
        assert response.status_code == 200
        results = response.data.get("results", response.data)
        names = [p["first_name"] for p in results]
        assert "OrgOne" in names
        assert "OrgTwo" not in names

    def test_patient_create_auto_sets_org(
        self, staff_client, sample_org, sample_facility, org_county, org_sub_county
    ):
        """Creating a patient via API should auto-set organization."""
        data = {
            "first_name": "AutoOrg",
            "last_name": "Patient",
            "date_of_birth": "1990-01-01",
            "gender": "M",
            "county": org_county.pk,
            "sub_county": org_sub_county.pk,
        }
        response = staff_client.post("/api/patients/", data, format="json")
        assert response.status_code == 201
        assert response.data["organization"] == sample_org.pk

    def test_patient_visible_from_branch_facility(
        self,
        sample_org,
        sample_facility,
        second_facility,
        staff_user,
        staff_profile,
        org_county,
        org_sub_county,
    ):
        """Patient created at HQ should be visible from branch facility."""
        from rest_framework.test import APIClient

        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="HQPatient",
            last_name="Cross",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
            registered_at_facility=sample_facility,
        )
        # Staff assigned to second_facility
        staff_profile.secondary_facilities.add(second_facility)
        branch_client = APIClient()
        branch_client.force_authenticate(user=staff_user)
        branch_client.credentials(HTTP_X_FACILITY_ID=str(second_facility.pk))

        response = branch_client.get("/api/patients/")
        assert response.status_code == 200
        results = response.data.get("results", response.data)
        names = [p["first_name"] for p in results]
        assert "HQPatient" in names


class TestEncounterAPIScopping:
    """Tests that Encounter API respects facility scoping."""

    def test_encounter_list_scoped_to_facility(
        self,
        staff_client,
        sample_org,
        another_org,
        sample_facility,
        other_org_facility,
        org_county,
        org_sub_county,
    ):
        """Encounter list should only return encounters at the user's facility."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        p1 = Patient.objects.create(
            first_name="P1",
            last_name="E",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        p2 = Patient.objects.create(
            first_name="P2",
            last_name="E",
            date_of_birth="1991-01-01",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=another_org,
        )
        Encounter.objects.create(
            patient=p1,
            encounter_type="OPD",
            chief_complaint="At my facility",
            organization=sample_org,
            facility=sample_facility,
        )
        Encounter.objects.create(
            patient=p2,
            encounter_type="OPD",
            chief_complaint="At other facility",
            organization=another_org,
            facility=other_org_facility,
        )

        response = staff_client.get("/api/encounters/")
        assert response.status_code == 200
        results = response.data.get("results", response.data)
        complaints = [e["chief_complaint"] for e in results]
        assert "At my facility" in complaints
        assert "At other facility" not in complaints

    def test_encounter_create_auto_sets_facility(
        self, staff_client, sample_org, sample_facility, org_county, org_sub_county
    ):
        """Creating an encounter via API should auto-set facility and org."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="EncAuto",
            last_name="Pat",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        data = {
            "patient": patient.pk,
            "encounter_type": "OPD",
            "chief_complaint": "Auto-set test",
        }
        response = staff_client.post("/api/encounters/", data, format="json")
        assert response.status_code == 201
        assert response.data["facility"] == sample_facility.pk
        assert response.data["organization"] == sample_org.pk

    def test_encounters_at_branch_not_visible_from_hq(
        self,
        staff_client,
        sample_org,
        sample_facility,
        second_facility,
        staff_user,
        staff_profile,
        org_county,
        org_sub_county,
    ):
        """Encounters at branch should NOT be visible from HQ (facility-scoped)."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="BranchPat",
            last_name="Enc",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="At branch only",
            organization=sample_org,
            facility=second_facility,
        )
        # Staff at HQ (sample_facility)
        response = staff_client.get("/api/encounters/")
        assert response.status_code == 200
        results = response.data.get("results", response.data)
        complaints = [e["chief_complaint"] for e in results]
        assert "At branch only" not in complaints


class TestCrossOrgAPIIsolation:
    """Tests that cross-org API access is denied."""

    def test_other_org_patients_not_visible(
        self, staff_client, other_staff_client, sample_org, another_org, org_county, org_sub_county
    ):
        """Staff at org1 should not see org2 patients and vice versa."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="Org1Only",
            last_name="Pat",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        Patient.objects.create(
            first_name="Org2Only",
            last_name="Pat",
            date_of_birth="1991-02-02",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=another_org,
        )

        # Org1 staff
        r1 = staff_client.get("/api/patients/")
        names1 = [p["first_name"] for p in r1.data.get("results", r1.data)]
        assert "Org1Only" in names1
        assert "Org2Only" not in names1

        # Org2 staff
        r2 = other_staff_client.get("/api/patients/")
        names2 = [p["first_name"] for p in r2.data.get("results", r2.data)]
        assert "Org2Only" in names2
        assert "Org1Only" not in names2

    def test_other_org_encounters_not_visible(
        self,
        staff_client,
        other_staff_client,
        sample_org,
        another_org,
        sample_facility,
        other_org_facility,
        org_county,
        org_sub_county,
    ):
        """Staff at org1 should not see org2 encounters."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        p1 = Patient.objects.create(
            first_name="E1",
            last_name="P",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        p2 = Patient.objects.create(
            first_name="E2",
            last_name="P",
            date_of_birth="1991-01-01",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=another_org,
        )
        Encounter.objects.create(
            patient=p1,
            encounter_type="OPD",
            chief_complaint="Org1 enc",
            organization=sample_org,
            facility=sample_facility,
        )
        Encounter.objects.create(
            patient=p2,
            encounter_type="OPD",
            chief_complaint="Org2 enc",
            organization=another_org,
            facility=other_org_facility,
        )

        r1 = staff_client.get("/api/encounters/")
        c1 = [e["chief_complaint"] for e in r1.data.get("results", r1.data)]
        assert "Org1 enc" in c1
        assert "Org2 enc" not in c1

        r2 = other_staff_client.get("/api/encounters/")
        c2 = [e["chief_complaint"] for e in r2.data.get("results", r2.data)]
        assert "Org2 enc" in c2
        assert "Org1 enc" not in c2

    def test_no_facility_header_uses_primary(
        self, api_client, staff_user, staff_profile, sample_org, org_county, org_sub_county
    ):
        """Without X-Facility-Id, middleware falls back to primary_facility."""
        from hmis.apps.patients.models import Patient

        Patient.objects.create(
            first_name="FallbackPat",
            last_name="Test",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        api_client.force_authenticate(user=staff_user)
        # No X-Facility-Id header
        response = api_client.get("/api/patients/")
        assert response.status_code == 200
        results = response.data.get("results", response.data)
        names = [p["first_name"] for p in results]
        assert "FallbackPat" in names

    def test_superuser_no_facility_sees_all(
        self, api_client, admin_user, sample_org, another_org, org_county, org_sub_county
    ):
        """Superuser without facility header should see all patients (no filter)."""
        from hmis.apps.patients.models import Patient

        # Delete StaffProfile so superuser has no tenant scope
        StaffProfile.objects.filter(user=admin_user).delete()

        Patient.objects.create(
            first_name="Super1",
            last_name="A",
            date_of_birth="1990-01-01",
            gender="M",
            county=org_county,
            sub_county=org_sub_county,
            organization=sample_org,
        )
        Patient.objects.create(
            first_name="Super2",
            last_name="B",
            date_of_birth="1991-01-01",
            gender="F",
            county=org_county,
            sub_county=org_sub_county,
            organization=another_org,
        )
        # Superuser without StaffProfile — should bypass tenant filter
        api_client.force_authenticate(user=admin_user)
        response = api_client.get("/api/patients/")
        assert response.status_code == 200
        results = response.data.get("results", response.data)
        names = [p["first_name"] for p in results]
        assert "Super1" in names
        assert "Super2" in names
