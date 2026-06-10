"""
Tests for SubscriptionPlan model, serializers, and API endpoints.
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import SubscriptionPlan
from tests.conftest import ensure_staff_profile

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def plan_data():
    """Valid subscription plan payload."""
    return {
        "code": "BASIC",
        "name": "Basic Plan",
        "description": "Entry-level plan for small clinics.",
        "monthly_price": "2500.00",
        "annual_price": "25000.00",
        "max_facilities": 2,
        "max_users": 10,
        "max_patients": 5000,
        "features": {"pharmacy": True, "laboratory": False, "ai_assistant": False},
        "is_active": True,
        "sort_order": 1,
        "trial_period_days": 14,
    }


@pytest.fixture
def free_plan(db):
    """Create a FREE subscription plan."""
    return SubscriptionPlan.objects.create(
        code="FREE",
        name="Free Plan",
        description="Free tier for evaluation.",
        monthly_price=Decimal("0.00"),
        annual_price=Decimal("0.00"),
        max_facilities=1,
        max_users=3,
        max_patients=100,
        features={"pharmacy": False, "laboratory": False, "ai_assistant": False},
        is_active=True,
        sort_order=0,
        trial_period_days=0,
    )


@pytest.fixture
def basic_plan(db):
    """Create a BASIC subscription plan."""
    return SubscriptionPlan.objects.create(
        code="BASIC",
        name="Basic Plan",
        description="Entry-level plan.",
        monthly_price=Decimal("2500.00"),
        annual_price=Decimal("25000.00"),
        max_facilities=2,
        max_users=10,
        max_patients=5000,
        features={"pharmacy": True, "laboratory": False, "ai_assistant": False},
        is_active=True,
        sort_order=1,
        trial_period_days=14,
    )


@pytest.fixture
def pro_plan(db):
    """Create a PROFESSIONAL subscription plan."""
    return SubscriptionPlan.objects.create(
        code="PROFESSIONAL",
        name="Professional Plan",
        description="For mid-size facilities.",
        monthly_price=Decimal("7500.00"),
        annual_price=Decimal("75000.00"),
        max_facilities=5,
        max_users=50,
        max_patients=None,
        features={"pharmacy": True, "laboratory": True, "ai_assistant": True},
        is_active=True,
        sort_order=2,
        trial_period_days=30,
    )


@pytest.fixture
def superuser_client(db, sample_organization, sample_facility):
    """Authenticated client with superuser privileges."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_superuser(
        username="superadmin",
        email="super@example.com",
        password="superpass123",
    )
    ensure_staff_profile(user, sample_organization, sample_facility)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ============================================================================
# Model Tests
# ============================================================================


class TestSubscriptionPlanModel:
    """Tests for SubscriptionPlan model."""

    def test_create_plan(self, free_plan):
        """Should create a subscription plan with correct fields."""
        assert free_plan.pk is not None
        assert free_plan.code == "FREE"
        assert free_plan.name == "Free Plan"
        assert free_plan.monthly_price == Decimal("0.00")
        assert free_plan.is_active is True

    def test_str_representation(self, basic_plan):
        """Should return name and code display in __str__."""
        assert str(basic_plan) == "Basic Plan (Basic)"

    def test_annual_savings_positive(self, basic_plan):
        """Should calculate annual savings when annual < 12 * monthly."""
        # 12 * 2500 = 30000; 30000 - 25000 = 5000
        assert basic_plan.annual_savings == Decimal("5000.00")

    def test_annual_savings_zero_when_no_discount(self, db):
        """Should return 0 when annual equals 12 * monthly."""
        plan = SubscriptionPlan.objects.create(
            code="ENTERPRISE",
            name="Enterprise",
            monthly_price=Decimal("1000.00"),
            annual_price=Decimal("12000.00"),
            sort_order=3,
        )
        assert plan.annual_savings == Decimal("0")

    def test_annual_savings_never_negative(self, db):
        """Should return 0 even if annual > 12 * monthly (edge case)."""
        plan = SubscriptionPlan.objects.create(
            code="ENTERPRISE",
            name="Enterprise",
            monthly_price=Decimal("1000.00"),
            annual_price=Decimal("15000.00"),
            sort_order=3,
        )
        assert plan.annual_savings == Decimal("0")

    def test_has_trial_true(self, basic_plan):
        """Should return True when trial_period_days > 0."""
        assert basic_plan.has_trial is True

    def test_has_trial_false(self, free_plan):
        """Should return False when trial_period_days == 0."""
        assert free_plan.has_trial is False

    def test_code_is_unique(self, basic_plan):
        """Should enforce unique code constraint."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            SubscriptionPlan.objects.create(
                code="BASIC",
                name="Duplicate Basic",
                sort_order=99,
            )

    def test_ordering(self, free_plan, basic_plan, pro_plan):
        """Should order by sort_order then monthly_price."""
        plans = list(SubscriptionPlan.objects.values_list("code", flat=True))
        assert plans == ["FREE", "BASIC", "PROFESSIONAL"]

    def test_default_values(self, db):
        """Should use sensible defaults for optional fields."""
        plan = SubscriptionPlan.objects.create(
            code="ENTERPRISE",
            name="Enterprise",
            sort_order=10,
        )
        assert plan.monthly_price == Decimal("0")
        assert plan.annual_price == Decimal("0")
        assert plan.max_facilities is None
        assert plan.max_users is None
        assert plan.max_patients is None
        assert plan.features == {}
        assert plan.is_active is True
        assert plan.trial_period_days == 0

    def test_features_json_field(self, pro_plan):
        """Should store and retrieve feature flags as JSON."""
        assert pro_plan.features["pharmacy"] is True
        assert pro_plan.features["ai_assistant"] is True


# ============================================================================
# Serializer Tests
# ============================================================================


class TestSubscriptionPlanSerializers:
    """Tests for SubscriptionPlan serializers."""

    def test_list_serializer_fields(self, basic_plan):
        """List serializer should include compact field set."""
        from hmis.apps.core.serializers import SubscriptionPlanListSerializer

        data = SubscriptionPlanListSerializer(basic_plan).data
        assert "id" in data
        assert "code" in data
        assert "code_display" in data
        assert data["code_display"] == "Basic"
        assert "name" in data
        assert "monthly_price" in data
        assert "annual_price" in data
        assert "max_facilities" in data
        assert "max_users" in data
        assert "is_active" in data
        assert "sort_order" in data
        assert "has_trial" in data
        # Should NOT include detail-only fields
        assert "description" not in data
        assert "features" not in data
        assert "max_patients" not in data

    def test_detail_serializer_fields(self, pro_plan):
        """Detail serializer should include all fields + computed props."""
        from hmis.apps.core.serializers import SubscriptionPlanDetailSerializer

        data = SubscriptionPlanDetailSerializer(pro_plan).data
        assert "id" in data
        assert "code_display" in data
        assert "description" in data
        assert "features" in data
        assert "max_patients" in data
        assert "annual_savings" in data
        assert "has_trial" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_detail_serializer_annual_savings(self, basic_plan):
        """Detail serializer should expose computed annual_savings."""
        from hmis.apps.core.serializers import SubscriptionPlanDetailSerializer

        data = SubscriptionPlanDetailSerializer(basic_plan).data
        assert Decimal(data["annual_savings"]) == Decimal("5000.00")

    def test_create_serializer_rejects_duplicate_code(self, basic_plan):
        """Create serializer should reject duplicate code."""
        from hmis.apps.core.serializers import SubscriptionPlanCreateSerializer

        serializer = SubscriptionPlanCreateSerializer(
            data={
                "code": "BASIC",
                "name": "Another Basic",
                "sort_order": 5,
            }
        )
        assert serializer.is_valid() is False
        assert "code" in serializer.errors

    def test_create_serializer_valid(self, db):
        """Create serializer should accept valid data."""
        from hmis.apps.core.serializers import SubscriptionPlanCreateSerializer

        serializer = SubscriptionPlanCreateSerializer(
            data={
                "code": "BASIC",
                "name": "Basic Plan",
                "monthly_price": "2500.00",
                "annual_price": "25000.00",
                "max_facilities": 2,
                "max_users": 10,
                "is_active": True,
                "sort_order": 1,
            }
        )
        assert serializer.is_valid(), serializer.errors


# ============================================================================
# API Tests — Unauthenticated
# ============================================================================


class TestSubscriptionPlanAPIUnauthenticated:
    """Tests for unauthenticated access to subscription plan endpoints."""

    def test_list_requires_auth(self, api_client):
        """Should reject unauthenticated list requests."""
        response = api_client.get("/api/subscription-plans/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_requires_auth(self, api_client, plan_data):
        """Should reject unauthenticated create requests."""
        response = api_client.post("/api/subscription-plans/", plan_data, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# API Tests — Authenticated (Non-Admin)
# ============================================================================


class TestSubscriptionPlanAPIAuthenticated:
    """Tests for authenticated non-admin access."""

    def test_list_plans(self, authenticated_client, free_plan, basic_plan):
        """Authenticated users should be able to list plans."""
        response = authenticated_client.get("/api/subscription-plans/")
        assert response.status_code == status.HTTP_200_OK
        # Could be paginated or a list
        results = response.data.get("results", response.data)
        # At least the two explicitly-created plans must be present
        codes = {r["code"] for r in results}
        assert "FREE" in codes
        assert "BASIC" in codes
        assert len(results) >= 2

    def test_retrieve_plan(self, authenticated_client, basic_plan):
        """Authenticated users should be able to retrieve a plan."""
        response = authenticated_client.get(f"/api/subscription-plans/{basic_plan.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "BASIC"
        assert response.data["name"] == "Basic Plan"

    def test_create_plan_forbidden_for_non_admin(self, authenticated_client, plan_data):
        """Non-admin users should not be able to create plans."""
        response = authenticated_client.post("/api/subscription-plans/", plan_data, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_plan_forbidden_for_non_admin(self, authenticated_client, basic_plan):
        """Non-admin users should not be able to update plans."""
        response = authenticated_client.patch(
            f"/api/subscription-plans/{basic_plan.pk}/",
            {"name": "Hacked"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_plan_forbidden_for_non_admin(self, authenticated_client, basic_plan):
        """Non-admin users should not be able to delete plans."""
        response = authenticated_client.delete(f"/api/subscription-plans/{basic_plan.pk}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_search_plans(self, authenticated_client, free_plan, basic_plan, pro_plan):
        """Should support search by name."""
        response = authenticated_client.get("/api/subscription-plans/?search=Professional")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["code"] == "PROFESSIONAL"

    def test_ordering_plans(self, authenticated_client, free_plan, basic_plan, pro_plan):
        """Should support ordering by monthly_price."""
        response = authenticated_client.get("/api/subscription-plans/?ordering=monthly_price")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        prices = [Decimal(r["monthly_price"]) for r in results]
        assert prices == sorted(prices)


# ============================================================================
# API Tests — Superuser (Admin)
# ============================================================================


class TestSubscriptionPlanAPIAdmin:
    """Tests for superuser/admin CRUD operations."""

    def test_create_plan(self, superuser_client, plan_data):
        """Superuser should be able to create a plan."""
        response = superuser_client.post("/api/subscription-plans/", plan_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        plan = SubscriptionPlan.objects.get(code="BASIC")
        assert plan.name == "Basic Plan"
        assert plan.monthly_price == Decimal("2500.00")
        assert plan.trial_period_days == 14

    def test_create_plan_duplicate_code_rejected(self, superuser_client, basic_plan, plan_data):
        """Should reject creating a plan with a duplicate code."""
        response = superuser_client.post("/api/subscription-plans/", plan_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "code" in response.data

    def test_update_plan(self, superuser_client, basic_plan):
        """Superuser should be able to update a plan."""
        response = superuser_client.patch(
            f"/api/subscription-plans/{basic_plan.pk}/",
            {"name": "Basic Plus", "monthly_price": "3000.00"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        basic_plan.refresh_from_db()
        assert basic_plan.name == "Basic Plus"
        assert basic_plan.monthly_price == Decimal("3000.00")

    def test_update_features(self, superuser_client, basic_plan):
        """Should be able to update feature flags."""
        response = superuser_client.patch(
            f"/api/subscription-plans/{basic_plan.pk}/",
            {"features": {"pharmacy": True, "laboratory": True, "ai_assistant": True}},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        basic_plan.refresh_from_db()
        assert basic_plan.features["laboratory"] is True

    def test_deactivate_plan(self, superuser_client, basic_plan):
        """Should be able to deactivate a plan."""
        response = superuser_client.patch(
            f"/api/subscription-plans/{basic_plan.pk}/",
            {"is_active": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        basic_plan.refresh_from_db()
        assert basic_plan.is_active is False

    def test_delete_plan(self, superuser_client, basic_plan):
        """Superuser should be able to delete a plan."""
        pk = basic_plan.pk
        response = superuser_client.delete(f"/api/subscription-plans/{pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not SubscriptionPlan.objects.filter(pk=pk).exists()

    def test_create_plan_with_unlimited_limits(self, superuser_client):
        """Should accept null values for unlimited limits."""
        data = {
            "code": "ENTERPRISE",
            "name": "Enterprise Plan",
            "monthly_price": "50000.00",
            "annual_price": "500000.00",
            "max_facilities": None,
            "max_users": None,
            "max_patients": None,
            "is_active": True,
            "sort_order": 10,
        }
        response = superuser_client.post("/api/subscription-plans/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        plan = SubscriptionPlan.objects.get(code="ENTERPRISE")
        assert plan.max_facilities is None
        assert plan.max_users is None
        assert plan.max_patients is None

    def test_create_returns_detail_fields(self, superuser_client, plan_data):
        """Create response should include detail-level fields (ReadOnCreateMixin check)."""
        response = superuser_client.post("/api/subscription-plans/", plan_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        # The response should have id at minimum
        assert "id" in response.data

    def test_list_returns_list_serializer_shape(self, superuser_client, free_plan, basic_plan):
        """List endpoint should use the compact list serializer."""
        response = superuser_client.get("/api/subscription-plans/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        first = results[0]
        assert "code_display" in first
        assert "has_trial" in first
        # List serializer should NOT include detail-only fields
        assert "description" not in first
        assert "features" not in first
