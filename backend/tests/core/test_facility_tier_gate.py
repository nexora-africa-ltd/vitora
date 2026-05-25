"""
Tier-gating tests for Facility module flags and operating_mode.

Verifies that the Facility serializers reject ``has_*`` flag flips and
``operating_mode`` changes when the org's subscription plan does not
include the required feature.
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.core.models import Facility, SubscriptionPlan

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def _enforce_tier(settings):
    """Enable subscription feature enforcement for this test module."""
    settings.SUBSCRIPTION_FEATURE_ENFORCEMENT = True


@pytest.fixture
def free_plan(db):
    """FREE plan — only outpatient/pharmacy/billing/triage/scheduling enabled."""
    return SubscriptionPlan.objects.create(
        code="FREE_TIER_TEST",
        name="Free Tier Test",
        monthly_price=Decimal("0"),
        annual_price=Decimal("0"),
        max_facilities=1,
        max_users=2,
        max_patients=100,
        features={
            "outpatient": True,
            "pharmacy": True,
            "billing": True,
            "triage": True,
            "scheduling": True,
            # Everything else explicitly off
            "laboratory": False,
            "imaging": False,
            "inpatient": False,
            "lis_standalone": False,
            "pharmacy_standalone": False,
            "imaging_standalone": False,
            "private_insurance": False,
            "allied_health": False,
            "quality": False,
            "immunizations": False,
            "surveillance": False,
        },
        is_active=True,
        sort_order=0,
    )


@pytest.fixture
def enterprise_plan(db):
    """Enterprise plan — everything enabled."""
    return SubscriptionPlan.objects.create(
        code="ENT_TIER_TEST",
        name="Enterprise Tier Test",
        monthly_price=Decimal("250000"),
        annual_price=Decimal("2500000"),
        max_facilities=None,
        max_users=None,
        max_patients=None,
        features={key: True for key, _ in SubscriptionPlan.FEATURE_REGISTRY},
        is_active=True,
        sort_order=10,
    )


@pytest.fixture
def org_on_free(sample_organization, free_plan):
    sample_organization.subscription_plan = free_plan
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def org_on_enterprise(sample_organization, enterprise_plan):
    sample_organization.subscription_plan = enterprise_plan
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def free_facility(db, org_on_free, sample_county, sample_sub_county):
    """A facility owned by a FREE-plan org with only baseline modules."""
    return Facility.objects.create(
        organization=org_on_free,
        name="Free Plan Facility",
        mfl_code="40001",
        level="2",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def enterprise_facility(db, org_on_enterprise, sample_county, sample_sub_county):
    return Facility.objects.create(
        organization=org_on_enterprise,
        name="Enterprise Plan Facility",
        mfl_code="40002",
        level="4",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def free_admin_client(api_client, db, org_on_free, free_facility):
    """An admin user (Nexora superuser) — bypasses everything; used as control."""
    from django.contrib.auth import get_user_model

    from tests.conftest import ensure_staff_profile

    User = get_user_model()
    user = User.objects.create_user(
        username="free_admin",
        email="freeadmin@test.com",
        password="testpass123",
        is_staff=True,  # required by FacilityViewSet.get_permissions()
    )
    ensure_staff_profile(user, org_on_free, free_facility)
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def enterprise_admin_client(api_client, db, org_on_enterprise, enterprise_facility):
    from django.contrib.auth import get_user_model

    from tests.conftest import ensure_staff_profile

    User = get_user_model()
    user = User.objects.create_user(
        username="ent_admin",
        email="entadmin@test.com",
        password="testpass123",
        is_staff=True,
    )
    ensure_staff_profile(user, org_on_enterprise, enterprise_facility)
    api_client.force_authenticate(user=user)
    return api_client


# ============================================================================
# FEATURE_REGISTRY coverage
# ============================================================================


class TestFeatureRegistryCoverage:
    """Every Facility ``has_*`` flag must map to a known feature key."""

    def test_every_module_flag_has_feature_key(self):
        registry_keys = {key for key, _ in SubscriptionPlan.FEATURE_REGISTRY}
        for flag, feature_key in Facility.MODULE_FLAG_TO_FEATURE.items():
            assert feature_key in registry_keys, (
                f"Facility.{flag} maps to feature '{feature_key}' which is "
                f"not in SubscriptionPlan.FEATURE_REGISTRY."
            )

    def test_every_standalone_mode_has_required_features(self):
        registry_keys = {key for key, _ in SubscriptionPlan.FEATURE_REGISTRY}
        for mode, required in Facility.OPERATING_MODE_REQUIRED_FEATURES.items():
            for key in required:
                assert key in registry_keys, (
                    f"Operating mode {mode} requires unknown feature '{key}'."
                )


# ============================================================================
# PATCH: tier gating on Facility module flips
# ============================================================================


@pytest.mark.usefixtures("_enforce_tier")
class TestFacilityModuleFlagTierGate:
    """PATCH /api/facilities/{id}/ enforces plan features on has_* flips."""

    def test_free_plan_cannot_enable_laboratory(self, free_admin_client, free_facility):
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"has_laboratory": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "has_laboratory" in response.data
        free_facility.refresh_from_db()
        assert free_facility.has_laboratory is False

    def test_free_plan_cannot_enable_imaging(self, free_admin_client, free_facility):
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"has_imaging": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "has_imaging" in response.data

    def test_free_plan_cannot_enable_private_insurance(self, free_admin_client, free_facility):
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"has_private_insurance": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "has_private_insurance" in response.data

    def test_free_plan_can_enable_in_plan_module(self, free_admin_client, free_facility):
        """Flipping a flag the plan covers should still succeed."""
        # triage is on the FREE plan; flipping should succeed.
        free_facility.has_triage = False
        free_facility.save(update_fields=["has_triage"])
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"has_triage": True},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        free_facility.refresh_from_db()
        assert free_facility.has_triage is True

    def test_free_plan_can_disable_any_module(self, free_admin_client, free_facility):
        """Disabling a module is always allowed (no upgrade needed to turn off)."""
        free_facility.has_outpatient = True
        free_facility.save(update_fields=["has_outpatient"])
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"has_outpatient": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_enterprise_plan_can_enable_anything(
        self, enterprise_admin_client, enterprise_facility
    ):
        response = enterprise_admin_client.patch(
            f"/api/facilities/{enterprise_facility.id}/",
            {
                "has_laboratory": True,
                "has_imaging": True,
                "has_private_insurance": True,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        enterprise_facility.refresh_from_db()
        assert enterprise_facility.has_laboratory is True
        assert enterprise_facility.has_imaging is True
        assert enterprise_facility.has_private_insurance is True


# ============================================================================
# PATCH: tier gating on operating_mode
# ============================================================================


@pytest.mark.usefixtures("_enforce_tier")
class TestFacilityOperatingModeTierGate:
    """operating_mode changes require the underlying features on the plan."""

    def test_free_plan_cannot_switch_to_standalone_lab(self, free_admin_client, free_facility):
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"operating_mode": "STANDALONE_LAB"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "operating_mode" in response.data
        free_facility.refresh_from_db()
        assert free_facility.operating_mode == Facility.OperatingMode.FULL_HMIS

    def test_free_plan_cannot_switch_to_standalone_diagnostic(
        self, free_admin_client, free_facility
    ):
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"operating_mode": "STANDALONE_DIAGNOSTIC"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_enterprise_plan_can_switch_to_standalone_lab(
        self, enterprise_admin_client, enterprise_facility
    ):
        response = enterprise_admin_client.patch(
            f"/api/facilities/{enterprise_facility.id}/",
            {"operating_mode": "STANDALONE_LAB"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        enterprise_facility.refresh_from_db()
        assert enterprise_facility.operating_mode == Facility.OperatingMode.STANDALONE_LAB
        # Cascade should have force-enabled lab + standalone flag
        assert enterprise_facility.has_laboratory is True
        assert enterprise_facility.has_lis_standalone is True


# ============================================================================
# Enforcement OFF (dev/test default)
# ============================================================================


class TestTierGatingDisabled:
    """When SUBSCRIPTION_FEATURE_ENFORCEMENT=False, no tier check fires."""

    def test_free_plan_can_enable_lab_when_enforcement_off(
        self, free_admin_client, free_facility, settings
    ):
        settings.SUBSCRIPTION_FEATURE_ENFORCEMENT = False
        response = free_admin_client.patch(
            f"/api/facilities/{free_facility.id}/",
            {"has_laboratory": True},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# Output filtering: hide non-plan modules from GET responses
# ============================================================================


@pytest.mark.usefixtures("_enforce_tier")
class TestFacilityOutputModuleHiding:
    """GET /api/facilities/{id}/ must hide modules not on the org's plan."""

    def test_free_plan_get_hides_unavailable_has_flags(self, free_admin_client, free_facility):
        response = free_admin_client.get(f"/api/facilities/{free_facility.id}/")
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        # FREE plan covers outpatient, pharmacy, billing, triage, scheduling.
        assert "has_outpatient" in data
        assert "has_triage" in data
        assert "has_billing" in data
        # FREE plan does NOT cover these — must be stripped from output.
        for flag in [
            "has_laboratory",
            "has_imaging",
            "has_inpatient",
            "has_lis_standalone",
            "has_pharmacy_standalone",
            "has_imaging_standalone",
            "has_private_insurance",
            "has_allied_health",
            "has_quality",
            "has_immunizations",
            "has_surveillance",
        ]:
            assert flag not in data, f"{flag} leaked into response on FREE plan"

    def test_free_plan_get_filters_modules_dict(self, free_admin_client, free_facility):
        response = free_admin_client.get(f"/api/facilities/{free_facility.id}/")
        modules = response.data["modules"]
        assert "outpatient" in modules
        assert "triage" in modules
        assert "laboratory" not in modules
        assert "imaging" not in modules
        assert "private_insurance" not in modules

    def test_free_plan_get_filters_enabled_module_names(self, free_admin_client, free_facility):
        # Enable a baseline module and verify it shows up; lab would be denied.
        free_facility.has_outpatient = True
        free_facility.save(update_fields=["has_outpatient"])
        response = free_admin_client.get(f"/api/facilities/{free_facility.id}/")
        names = response.data["enabled_module_names"]
        assert "outpatient" in names
        assert "laboratory" not in names

    def test_enterprise_plan_get_shows_everything(
        self, enterprise_admin_client, enterprise_facility
    ):
        response = enterprise_admin_client.get(f"/api/facilities/{enterprise_facility.id}/")
        data = response.data
        for flag in Facility.MODULE_FLAG_TO_FEATURE:
            assert flag in data, f"{flag} missing on enterprise plan"


# ============================================================================
# FacilityAdminPermission: open writes to tenant ADMIN/ORG-ADMIN/OWNER
# ============================================================================


@pytest.fixture
def org_admin_role(db):
    from hmis.apps.core.models import Role

    role, _ = Role.objects.get_or_create(
        code="ORG-ADMIN",
        defaults={"name": "Org Admin", "hierarchy_level": 9, "is_active": True},
    )
    return role


@pytest.fixture
def doctor_role(db):
    from hmis.apps.core.models import Role

    role, _ = Role.objects.get_or_create(
        code="DOCTOR",
        defaults={"name": "Doctor", "hierarchy_level": 5, "is_active": True},
    )
    return role


def _make_tenant_client(api_client, org, facility, role, username):
    from django.contrib.auth import get_user_model

    from tests.conftest import ensure_staff_profile

    User = get_user_model()
    user = User.objects.create_user(
        username=username,
        email=f"{username}@test.com",
        password="testpass123",
        is_staff=False,
    )
    profile = ensure_staff_profile(user, org, facility)
    profile.primary_role = role
    profile.save(update_fields=["primary_role"])
    api_client.force_authenticate(user=user)
    return api_client


class TestFacilityAdminPermission:
    """Writes must accept tenant ADMIN/ORG-ADMIN/OWNER but reject clinical roles."""

    def test_tenant_org_admin_can_patch_facility(
        self, api_client, org_on_enterprise, enterprise_facility, org_admin_role
    ):
        client = _make_tenant_client(
            api_client, org_on_enterprise, enterprise_facility, org_admin_role, "tenant_oa"
        )
        response = client.patch(
            f"/api/facilities/{enterprise_facility.id}/",
            {"name": "Renamed by Org Admin"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        enterprise_facility.refresh_from_db()
        assert enterprise_facility.name == "Renamed by Org Admin"

    def test_tenant_doctor_cannot_patch_facility(
        self, api_client, org_on_enterprise, enterprise_facility, doctor_role
    ):
        client = _make_tenant_client(
            api_client, org_on_enterprise, enterprise_facility, doctor_role, "tenant_doc"
        )
        response = client.patch(
            f"/api/facilities/{enterprise_facility.id}/",
            {"name": "Should Fail"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_tenant_org_admin_cannot_patch_other_org_facility(
        self,
        api_client,
        org_on_enterprise,
        enterprise_facility,
        org_admin_role,
        db,
        sample_county,
        sample_sub_county,
    ):
        """Cross-tenant write must be blocked by has_object_permission."""
        from hmis.apps.core.models import Facility, Organization

        other_org = Organization.objects.create(
            name="Other Org",
            slug="other-org",
            contact_email="other@x.com",
            is_active=True,
            is_verified=True,
        )
        other_fac = Facility.objects.create(
            organization=other_org,
            name="Other Org Facility",
            mfl_code="40003",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
        )
        client = _make_tenant_client(
            api_client, org_on_enterprise, enterprise_facility, org_admin_role, "tenant_oa2"
        )
        response = client.patch(
            f"/api/facilities/{other_fac.id}/",
            {"name": "Should Fail Cross-Tenant"},
            format="json",
        )
        # Tenant queryset scoping returns 404 (not in qs); either is acceptable.
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        )
