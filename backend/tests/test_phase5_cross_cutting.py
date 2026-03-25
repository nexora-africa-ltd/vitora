"""
Tests for Phase 5: Cross-Cutting Concerns (Multitenancy).

Covers:
- Step 5.1: AuditLog enrichment (facility/organization on log entries)
- Step 5.2: SyncQueue scoping (already has FKs – verify usage)
- Step 5.3: RBAC scoping (Role.scope field)
- Step 5.4: Reporting scoping (BillingReportService, SurveillanceDashboard)
"""

import pytest  # type: ignore
from django.db import IntegrityError
from django.test import RequestFactory
from rest_framework.test import APIRequestFactory

from hmis.apps.core.models import AuditLog, Facility, Organization, Role, SyncQueue

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_organization(db):
    """Create a sample organization."""
    return Organization.objects.create(
        name="Test Health Org",
        slug="test-health-org",
    )


@pytest.fixture
def sample_facility(db, sample_organization, sample_county, sample_sub_county):
    """Create a sample facility linked to an organization."""
    return Facility.objects.create(
        organization=sample_organization,
        mfl_code="12345",
        name="Test Hospital",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def second_organization(db):
    """Create a second organization for isolation tests."""
    return Organization.objects.create(
        name="Other Health Org",
        slug="other-health-org",
    )


@pytest.fixture
def second_facility(db, second_organization, sample_county, sample_sub_county):
    """Create a facility in a different organization."""
    return Facility.objects.create(
        organization=second_organization,
        mfl_code="67890",
        name="Other Hospital",
        county=sample_county,
        sub_county=sample_sub_county,
    )


# ============================================================================
# Step 5.1: AuditLog Enrichment Tests
# ============================================================================


class TestAuditLogEnrichment:
    """Tests for AuditLog.log() accepting facility and organization params."""

    def test_log_with_explicit_facility_and_org(self, test_user, sample_facility, sample_organization):
        """AuditLog.log() should store facility and organization when explicitly passed."""
        entry = AuditLog.log(
            action="patient_view",
            user=test_user,
            resource_type="Patient",
            resource_id=1,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert entry.facility == sample_facility
        assert entry.organization == sample_organization

    def test_log_with_request_auto_resolves_tenant(self, test_user, sample_facility, sample_organization):
        """AuditLog.log() should auto-resolve facility/org from a request object."""
        factory = RequestFactory()
        request = factory.get("/api/patients/")
        request.user = test_user
        request.facility = sample_facility
        request.organization = sample_organization

        entry = AuditLog.log(
            action="patient_view",
            user=test_user,
            resource_type="Patient",
            resource_id=1,
            request=request,
        )
        assert entry.facility == sample_facility
        assert entry.organization == sample_organization

    def test_log_explicit_facility_overrides_request(self, test_user, sample_facility, second_facility, sample_organization):
        """Explicit facility param should override request.facility."""
        factory = RequestFactory()
        request = factory.get("/api/patients/")
        request.user = test_user
        request.facility = sample_facility
        request.organization = sample_organization

        entry = AuditLog.log(
            action="patient_view",
            user=test_user,
            resource_type="Patient",
            resource_id=1,
            facility=second_facility,  # explicit override
            request=request,
        )
        assert entry.facility == second_facility

    def test_log_without_tenant_context_remains_null(self, test_user):
        """AuditLog.log() without facility/org should leave them null."""
        entry = AuditLog.log(
            action="login_success",
            user=test_user,
        )
        assert entry.facility is None
        assert entry.organization is None

    def test_log_backward_compatible(self, test_user):
        """Existing callers without facility/org/request args still work."""
        entry = AuditLog.log(
            action="patient_create",
            user=test_user,
            resource_type="Patient",
            resource_id=99,
            ip_address="127.0.0.1",
            details={"test": True},
        )
        assert entry.action == "patient_create"
        assert entry.resource_id == 99
        assert entry.facility is None


# ============================================================================
# Step 5.2: SyncQueue Scoping Tests
# ============================================================================


class TestSyncQueueScoping:
    """Tests verifying SyncQueue has facility/organization FKs."""

    def test_sync_entry_with_facility(self, sample_facility, sample_organization):
        """SyncQueue entries can be scoped to a facility."""
        entry = SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={"first_name": "Test"},
            facility=sample_facility,
            organization=sample_organization,
        )
        assert entry.facility == sample_facility
        assert entry.organization == sample_organization

    def test_sync_entries_filtered_by_facility(self, sample_facility, second_facility, sample_organization, second_organization):
        """SyncQueue entries can be filtered by facility."""
        SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=1,
            data={},
            facility=sample_facility,
            organization=sample_organization,
        )
        SyncQueue.objects.create(
            operation="CREATE",
            model_name="Patient",
            record_id=2,
            data={},
            facility=second_facility,
            organization=second_organization,
        )

        facility_entries = SyncQueue.objects.filter(facility=sample_facility)
        assert facility_entries.count() == 1
        assert facility_entries.first().record_id == 1


# ============================================================================
# Step 5.3: RBAC Scoping Tests
# ============================================================================


class TestRBACScoping:
    """Tests for Role.scope field and tenant constraints."""

    def test_role_default_scope_is_org(self, db):
        """New roles should default to ORG scope."""
        role = Role.objects.create(
            code="TEST_DOCTOR",
            name="Test Doctor",
            category="CLINICAL",
        )
        assert role.scope == "ORG"

    def test_org_scoped_role_without_facility(self, sample_organization):
        """ORG-scoped roles don't require a facility."""
        role = Role.objects.create(
            code="ORG_ADMIN",
            name="Organization Admin",
            category="MANAGEMENT",
            scope="ORG",
            organization=sample_organization,
        )
        assert role.scope == "ORG"
        assert role.facility is None

    def test_facility_scoped_role_with_facility(self, sample_facility, sample_organization):
        """FACILITY-scoped roles must have a facility FK set."""
        role = Role.objects.create(
            code="FACILITY_NURSE",
            name="Facility Nurse",
            category="CLINICAL",
            scope="FACILITY",
            organization=sample_organization,
            facility=sample_facility,
        )
        assert role.scope == "FACILITY"
        assert role.facility == sample_facility

    def test_facility_scoped_role_without_facility_fails(self, sample_organization):
        """FACILITY-scoped roles without a facility should violate the constraint."""
        with pytest.raises(IntegrityError):
            Role.objects.create(
                code="BAD_ROLE",
                name="Bad Role",
                category="CLINICAL",
                scope="FACILITY",
                organization=sample_organization,
                facility=None,
            )

    def test_role_organization_fk(self, sample_organization):
        """Roles can be linked to an organization."""
        role = Role.objects.create(
            code="ORG_ROLE",
            name="Org Role",
            category="ADMINISTRATIVE",
            organization=sample_organization,
        )
        assert role.organization == sample_organization
        assert sample_organization.roles.filter(pk=role.pk).exists()

    def test_system_wide_role_no_org(self, db):
        """System-wide roles have no organization (null)."""
        role = Role.objects.create(
            code="SYSTEM_ADMIN",
            name="System Admin",
            category="MANAGEMENT",
        )
        assert role.organization is None
        assert role.facility is None


# ============================================================================
# Step 5.4: Reporting Scoping Tests
# ============================================================================


class TestBillingReportServiceScoping:
    """Tests for BillingReportService accepting facility/org params."""

    def test_service_init_with_facility(self, sample_facility):
        """BillingReportService should accept facility param."""
        from hmis.apps.billing.reports import BillingReportService

        service = BillingReportService(facility=sample_facility)
        assert service.facility == sample_facility
        assert service.organization is None

    def test_service_init_with_organization(self, sample_organization):
        """BillingReportService should accept organization param."""
        from hmis.apps.billing.reports import BillingReportService

        service = BillingReportService(organization=sample_organization)
        assert service.organization == sample_organization
        assert service.facility is None

    def test_service_init_default_no_scoping(self):
        """BillingReportService with no args should not scope."""
        from hmis.apps.billing.reports import BillingReportService

        service = BillingReportService()
        assert service.facility is None
        assert service.organization is None
