"""
Tests for SubscriptionPlan ↔ Organization wiring:
- FK link + sync_from_plan
- Limit enforcement (facility, staff, patient)
- Feature gating permission
- Signal: plan save → org sync
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import Organization, SubscriptionPlan
from tests.conftest import ensure_staff_profile

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def free_plan(db):
    """FREE plan with tight limits."""
    return SubscriptionPlan.objects.create(
        code="FREE",
        name="Free Plan",
        monthly_price=Decimal("0"),
        annual_price=Decimal("0"),
        max_facilities=1,
        max_users=2,
        max_patients=5,
        features={"pharmacy": False, "laboratory": False, "ai_assistant": False},
        is_active=True,
        sort_order=0,
    )


@pytest.fixture
def basic_plan(db):
    """BASIC plan with moderate limits."""
    return SubscriptionPlan.objects.create(
        code="BASIC",
        name="Basic Plan",
        monthly_price=Decimal("2500"),
        annual_price=Decimal("25000"),
        max_facilities=3,
        max_users=10,
        max_patients=500,
        features={"pharmacy": True, "laboratory": False, "ai_assistant": False},
        is_active=True,
        sort_order=1,
    )


@pytest.fixture
def enterprise_plan(db):
    """ENTERPRISE plan with no limits."""
    return SubscriptionPlan.objects.create(
        code="ENTERPRISE",
        name="Enterprise Plan",
        monthly_price=Decimal("50000"),
        annual_price=Decimal("500000"),
        max_facilities=None,
        max_users=None,
        max_patients=None,
        features={"pharmacy": True, "laboratory": True, "ai_assistant": True},
        is_active=True,
        sort_order=3,
    )


@pytest.fixture
def org_with_free_plan(sample_organization, free_plan):
    """Organization linked to the FREE plan."""
    sample_organization.subscription_plan = free_plan
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def org_with_basic_plan(sample_organization, basic_plan):
    """Organization linked to the BASIC plan."""
    sample_organization.subscription_plan = basic_plan
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def org_with_enterprise_plan(sample_organization, enterprise_plan):
    """Organization linked to the ENTERPRISE plan."""
    sample_organization.subscription_plan = enterprise_plan
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def admin_user(db):
    """Superuser for admin operations."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_superuser(
        username="superadmin",
        email="superadmin@test.com",
        password="superpass123",
    )


@pytest.fixture
def superuser_client(admin_user, sample_organization, sample_facility):
    """Superuser API client."""
    ensure_staff_profile(admin_user, sample_organization, sample_facility)
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


# ============================================================================
# Model: sync_from_plan
# ============================================================================


class TestSyncFromPlan:
    """Tests for Organization.sync_from_plan()."""

    def test_sync_copies_tier(self, sample_organization, basic_plan):
        """Should copy plan.code → org.subscription_tier."""
        sample_organization.subscription_plan = basic_plan
        sample_organization.sync_from_plan(save=True)
        sample_organization.refresh_from_db()
        assert sample_organization.subscription_tier == "BASIC"

    def test_sync_copies_limits(self, sample_organization, basic_plan):
        """Should copy max_facilities, max_users, max_patients from plan."""
        sample_organization.subscription_plan = basic_plan
        sample_organization.sync_from_plan(save=True)
        sample_organization.refresh_from_db()
        assert sample_organization.max_facilities == 3
        assert sample_organization.max_users == 10
        assert sample_organization.max_patients == 500

    def test_sync_unlimited_limits(self, sample_organization, enterprise_plan):
        """Should set None for unlimited limits."""
        sample_organization.subscription_plan = enterprise_plan
        sample_organization.sync_from_plan(save=True)
        sample_organization.refresh_from_db()
        assert sample_organization.max_facilities is None
        assert sample_organization.max_users is None
        assert sample_organization.max_patients is None

    def test_sync_noop_without_plan(self, sample_organization):
        """Should do nothing if no plan is linked."""
        sample_organization.subscription_plan = None
        sample_organization.max_facilities = 99
        sample_organization.save()
        sample_organization.sync_from_plan(save=True)
        sample_organization.refresh_from_db()
        assert sample_organization.max_facilities == 99  # Unchanged

    def test_sync_without_save(self, sample_organization, free_plan):
        """sync_from_plan(save=False) should not persist."""
        old_max = sample_organization.max_facilities
        sample_organization.subscription_plan = free_plan
        sample_organization.sync_from_plan(save=False)
        assert sample_organization.max_facilities == 1  # In-memory
        sample_organization.refresh_from_db()
        assert sample_organization.max_facilities == old_max  # Not saved


# ============================================================================
# Model: can_add_* checks
# ============================================================================


class TestLimitChecks:
    """Tests for Organization limit check methods."""

    def test_can_add_facility_within_limit(self, org_with_basic_plan):
        """Should allow adding facility when under limit."""
        assert org_with_basic_plan.can_add_facility() is True

    def test_can_add_facility_at_limit(self, org_with_free_plan, sample_facility):
        """Should deny when at facility limit (FREE = 1, already has 1)."""
        assert org_with_free_plan.facility_count >= 1
        assert org_with_free_plan.max_facilities == 1
        assert org_with_free_plan.can_add_facility() is False

    def test_can_add_user_within_limit(self, org_with_basic_plan):
        """Should allow adding user when under limit."""
        assert org_with_basic_plan.can_add_user() is True

    def test_can_add_patient_unlimited(self, org_with_enterprise_plan):
        """Should always allow with unlimited plan."""
        assert org_with_enterprise_plan.can_add_patient() is True

    def test_can_add_patient_at_limit(self, org_with_free_plan):
        """Should deny when at patient limit."""
        from hmis.apps.patients.models import Patient

        org = org_with_free_plan
        for i in range(org.max_patients):
            Patient.objects.create(
                first_name=f"Test{i}",
                last_name="Patient",
                date_of_birth="1990-01-01",
                gender="M",
                organization=org,
            )
        assert org.can_add_patient() is False


# ============================================================================
# Model: has_feature
# ============================================================================


class TestHasFeature:
    """Tests for Organization.has_feature()."""

    def test_feature_enabled(self, org_with_basic_plan):
        """Should return True for enabled features."""
        assert org_with_basic_plan.has_feature("pharmacy") is True

    def test_feature_disabled(self, org_with_basic_plan):
        """Should return False for disabled features."""
        assert org_with_basic_plan.has_feature("laboratory") is False

    def test_feature_missing_key(self, org_with_basic_plan):
        """Should return False for unrecognized feature keys."""
        assert org_with_basic_plan.has_feature("telehealth") is False

    def test_feature_no_plan(self, sample_organization):
        """Should return True (no restrictions) when no plan is linked."""
        sample_organization.subscription_plan = None
        assert sample_organization.has_feature("anything") is True


# ============================================================================
# Signal: plan save → org sync
# ============================================================================


class TestPlanSaveSignal:
    """Tests for the post_save signal that syncs plan changes to orgs."""

    def test_plan_update_syncs_to_org(self, org_with_basic_plan, basic_plan):
        """When a plan is updated, linked orgs should be synced."""
        basic_plan.max_facilities = 20
        basic_plan.max_users = 100
        basic_plan.save()
        org_with_basic_plan.refresh_from_db()
        assert org_with_basic_plan.max_facilities == 20
        assert org_with_basic_plan.max_users == 100

    def test_plan_update_syncs_max_patients(self, org_with_free_plan, free_plan):
        """When a plan's max_patients changes, the org should update too."""
        free_plan.max_patients = 200
        free_plan.save()
        org_with_free_plan.refresh_from_db()
        assert org_with_free_plan.max_patients == 200

    def test_unlinked_org_not_affected(self, db, basic_plan):
        """Orgs not linked to the plan should not be affected."""
        org = Organization.objects.create(
            name="Unlinked Org",
            slug="unlinked-org",
            subscription_plan=None,
            max_facilities=99,
        )
        basic_plan.max_facilities = 50
        basic_plan.save()
        org.refresh_from_db()
        assert org.max_facilities == 99  # Unchanged


# ============================================================================
# API: Facility create limit enforcement
# ============================================================================


class TestFacilityLimitEnforcement:
    """Tests for facility creation limit enforcement."""

    @pytest.fixture
    def staff_admin_client(self, db, sample_organization, sample_facility):
        """Admin (is_staff=True, non-superuser) client for limit tests."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(
            username="staffadmin",
            email="staffadmin@test.com",
            password="pass123",
            is_staff=True,
        )
        ensure_staff_profile(user, sample_organization, sample_facility)
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_facility_create_blocked_at_limit(
        self, staff_admin_client, org_with_free_plan, sample_county, sample_sub_county
    ):
        """Should reject facility creation when at limit."""
        response = staff_admin_client.post(
            "/api/facilities/",
            {
                "name": "Second Facility",
                "mfl_code": "LIMIT-TEST-1",
                "level": "3",
                "ownership": "PRIVATE",
                "county": sample_county.id,
                "sub_county": sample_sub_county.id,
                "organization": org_with_free_plan.id,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data.get("code") == "facility_limit_reached"

    def test_facility_create_allowed_under_limit(
        self, staff_admin_client, org_with_basic_plan, sample_county, sample_sub_county
    ):
        """Should allow facility creation when under limit."""
        response = staff_admin_client.post(
            "/api/facilities/",
            {
                "name": "New Facility",
                "mfl_code": "88888",
                "level": "3",
                "ownership": "PRIVATE",
                "county": sample_county.id,
                "sub_county": sample_sub_county.id,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_superuser_bypasses_facility_limit(
        self, superuser_client, org_with_free_plan, sample_county, sample_sub_county
    ):
        """Superusers should bypass facility limits."""
        response = superuser_client.post(
            "/api/facilities/",
            {
                "name": "Super Facility",
                "mfl_code": "77777",
                "level": "3",
                "ownership": "PRIVATE",
                "county": sample_county.id,
                "sub_county": sample_sub_county.id,
            },
            format="json",
        )
        # Superuser bypasses limit check — should NOT get facility_limit_reached
        if response.status_code == status.HTTP_403_FORBIDDEN:
            assert response.data.get("code") != "facility_limit_reached"
        else:
            assert response.status_code == status.HTTP_201_CREATED


# ============================================================================
# API: Organization detail shows plan fields
# ============================================================================


class TestOrganizationPlanAPI:
    """Tests for plan-related fields on Organization API."""

    def test_org_detail_includes_plan_fields(
        self, superuser_client, org_with_basic_plan, basic_plan
    ):
        """Org detail should include plan_name, plan_features, can_add_*."""
        response = superuser_client.get(f"/api/organizations/{org_with_basic_plan.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["subscription_plan"] == basic_plan.pk
        assert response.data["plan_name"] == "Basic Plan"
        assert response.data["plan_features"]["pharmacy"] is True
        assert response.data["can_add_facility"] is True
        assert response.data["can_add_user"] is True

    def test_org_list_includes_plan_name(self, superuser_client, org_with_basic_plan, basic_plan):
        """Org list should include subscription_plan and plan_name."""
        response = superuser_client.get("/api/organizations/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        org_data = next(r for r in results if r["id"] == org_with_basic_plan.pk)
        assert org_data["subscription_plan"] == basic_plan.pk
        assert org_data["plan_name"] == "Basic Plan"

    def test_update_org_plan(self, superuser_client, sample_organization, basic_plan):
        """Changing org's subscription_plan should save the FK."""
        response = superuser_client.patch(
            f"/api/organizations/{sample_organization.pk}/",
            {"subscription_plan": basic_plan.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_organization.refresh_from_db()
        assert sample_organization.subscription_plan == basic_plan


# ============================================================================
# Feature gating permission
# ============================================================================


class TestSubscriptionFeaturePermission:
    """Tests for the SubscriptionFeaturePermission class."""

    def test_permission_allows_enabled_feature(self, db, sample_county, sample_sub_county):
        """Should allow access when feature is enabled in plan."""
        from rest_framework.test import APIRequestFactory

        from hmis.apps.core.permissions import SubscriptionFeaturePermission

        perm = SubscriptionFeaturePermission()
        factory = APIRequestFactory()
        request = factory.get("/")

        class MockView:
            subscription_feature = "pharmacy"

        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(username="featuser", password="pass")

        plan = SubscriptionPlan.objects.create(
            code="PROFESSIONAL",
            name="Pro",
            features={"pharmacy": True},
            sort_order=2,
        )
        org = Organization.objects.create(
            name="Feature Test Org",
            slug="feature-test",
            subscription_plan=plan,
        )
        org.sync_from_plan(save=True)

        from hmis.apps.core.models import Facility

        facility = Facility.objects.create(
            name="FT Facility",
            mfl_code="FT001",
            organization=org,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        ensure_staff_profile(user, org, facility, employee_id="FT-001")

        request.user = user
        assert perm.has_permission(request, MockView()) is True

    def test_permission_denies_disabled_feature(self, db, sample_county, sample_sub_county):
        """Should deny access when feature is disabled in plan."""
        from rest_framework.test import APIRequestFactory

        from hmis.apps.core.permissions import SubscriptionFeaturePermission

        perm = SubscriptionFeaturePermission()
        factory = APIRequestFactory()
        request = factory.get("/")

        class MockView:
            subscription_feature = "ai_assistant"

        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(username="featuser2", password="pass")

        plan = SubscriptionPlan.objects.create(
            code="FREE",
            name="Free",
            features={"pharmacy": False, "ai_assistant": False},
            sort_order=0,
        )
        org = Organization.objects.create(
            name="Free Org",
            slug="free-org",
            subscription_plan=plan,
        )
        org.sync_from_plan(save=True)

        from hmis.apps.core.models import Facility

        facility = Facility.objects.create(
            name="FT2 Fac",
            mfl_code="FT002",
            organization=org,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        ensure_staff_profile(user, org, facility, employee_id="FT-002")

        request.user = user
        assert perm.has_permission(request, MockView()) is False

    def test_superuser_bypasses_feature_gate(self, db):
        """Superusers should bypass feature gating."""
        from rest_framework.test import APIRequestFactory

        from hmis.apps.core.permissions import SubscriptionFeaturePermission

        perm = SubscriptionFeaturePermission()
        factory = APIRequestFactory()
        request = factory.get("/")

        class MockView:
            subscription_feature = "ai_assistant"

        from django.contrib.auth import get_user_model

        User = get_user_model()
        superuser = User.objects.create_superuser(username="superf", password="pass")
        request.user = superuser
        assert perm.has_permission(request, MockView()) is True
