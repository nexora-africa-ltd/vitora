"""
Tests for SubscriptionFeatureGateMiddleware and invitation staff-limit enforcement.

Covers:
- Middleware gates module URL prefixes based on subscription features
- Middleware bypasses for superusers and unauthenticated requests
- Invitation create enforces staff limit
- Invitation accept enforces staff limit
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import Organization, StaffInvitation, SubscriptionPlan
from tests.conftest import ensure_staff_profile

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def free_plan_no_lab(db):
    """FREE plan without laboratory or imaging."""
    return SubscriptionPlan.objects.create(
        code="FREE_GATE",
        name="Free Gate Test",
        monthly_price=Decimal("0"),
        annual_price=Decimal("0"),
        max_facilities=1,
        max_users=2,
        max_patients=100,
        features={
            "outpatient": True,
            "pharmacy": True,
            "billing": True,
            "laboratory": False,
            "imaging": False,
            "inpatient": False,
            "scheduling": False,
            "sha_claims": False,
            "api_access": False,
            "offline_sync": False,
            "theatre": False,
            "blood_bank": False,
            "dialysis": False,
            "inventory": False,
            "maternity": False,
            "custom_reports": False,
            "dhis2_reporting": False,
        },
        is_active=True,
        sort_order=0,
    )


@pytest.fixture
def pro_plan_all_features(db):
    """PRO plan with most features enabled."""
    return SubscriptionPlan.objects.create(
        code="PRO_GATE",
        name="Pro Gate Test",
        monthly_price=Decimal("50000"),
        annual_price=Decimal("500000"),
        max_facilities=3,
        max_users=50,
        max_patients=None,
        features={
            "outpatient": True,
            "pharmacy": True,
            "billing": True,
            "laboratory": True,
            "imaging": True,
            "inpatient": True,
            "scheduling": True,
            "sha_claims": True,
            "api_access": True,
            "offline_sync": True,
            "theatre": True,
            "blood_bank": False,
            "dialysis": False,
            "inventory": True,
            "maternity": True,
            "custom_reports": True,
            "dhis2_reporting": True,
        },
        is_active=True,
        sort_order=2,
    )


@pytest.fixture
def org_free(sample_organization, free_plan_no_lab):
    """Organization on the free plan (restricted features)."""
    sample_organization.subscription_plan = free_plan_no_lab
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def org_pro(sample_organization, pro_plan_all_features):
    """Organization on the pro plan (most features)."""
    sample_organization.subscription_plan = pro_plan_all_features
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def free_user(db, org_free, sample_facility):
    """Regular user in a free-plan organization."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(
        username="freeuser", email="free@test.com", password="testpass123"
    )
    ensure_staff_profile(user, org_free, sample_facility)
    return user


@pytest.fixture
def pro_user(db, org_pro, sample_facility):
    """Regular user in a pro-plan organization."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(
        username="prouser", email="pro@test.com", password="testpass123"
    )
    ensure_staff_profile(user, org_pro, sample_facility)
    return user


@pytest.fixture
def free_client(free_user):
    """API client authenticated as a free-plan user (session-based for middleware)."""
    client = APIClient()
    client.login(username="freeuser", password="testpass123")
    return client


@pytest.fixture
def pro_client(pro_user):
    """API client authenticated as a pro-plan user (session-based for middleware)."""
    client = APIClient()
    client.login(username="prouser", password="testpass123")
    return client


@pytest.fixture
def superuser_client_gate(db, sample_organization, sample_facility):
    """Superuser API client (session-based for middleware)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    su = User.objects.create_superuser(
        username="su_gate", email="su@gate.com", password="testpass123"
    )
    ensure_staff_profile(su, sample_organization, sample_facility)
    client = APIClient()
    client.login(username="su_gate", password="testpass123")
    return client


# ============================================================================
# Middleware: SubscriptionFeatureGateMiddleware
# ============================================================================


@pytest.fixture
def _enable_feature_gate(settings):
    """Enable the subscription feature gate middleware for these tests."""
    settings.SUBSCRIPTION_FEATURE_ENFORCEMENT = True


@pytest.mark.usefixtures("_enable_feature_gate")
class TestSubscriptionFeatureGateMiddleware:
    """Tests for the URL-prefix feature gate middleware."""

    GATED_URLS = [
        ("/api/lab/orders/", "laboratory"),
        ("/api/lab/tests/", "laboratory"),
        ("/api/imaging/orders/", "imaging"),
        ("/api/inpatient/wards/", "inpatient"),
        ("/api/scheduling/shifts/", "scheduling"),
        ("/api/sha/claims/", "sha_claims"),
        ("/api/hl7/endpoints/", "api_access"),
        ("/api/powersync/credentials/", "offline_sync"),
        ("/api/theatre/sessions/", "theatre"),
        ("/api/procedures/orders/", "theatre"),
        ("/api/blood-bank/products/", "blood_bank"),
        ("/api/dialysis/sessions/", "dialysis"),
        ("/api/inventory/items/", "inventory"),
        ("/api/mch/anc/", "maternity"),
        ("/api/moh-reports/", "dhis2_reporting"),
    ]

    @pytest.mark.parametrize("url,feature", GATED_URLS)
    def test_free_plan_blocked(self, free_client, url, feature):
        """FREE plan user should be blocked from feature-gated modules."""
        response = free_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json()["code"] == "subscription_feature_disabled"
        assert response.json()["feature"] == feature

    @pytest.mark.parametrize("url,feature", GATED_URLS)
    def test_free_plan_post_blocked(self, free_client, url, feature):
        """FREE plan user should be blocked from POST to feature-gated modules."""
        response = free_client.post(url, {}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json()["code"] == "subscription_feature_disabled"

    def test_pro_plan_allowed_lab(self, pro_client):
        """PRO plan user should pass the feature gate for lab (gets 200 or other non-403)."""
        response = pro_client.get("/api/lab/orders/")
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_pro_plan_allowed_imaging(self, pro_client):
        """PRO plan user should pass the feature gate for imaging."""
        response = pro_client.get("/api/imaging/orders/")
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_pro_plan_allowed_scheduling(self, pro_client):
        """PRO plan user should pass the feature gate for scheduling."""
        response = pro_client.get("/api/scheduling/shifts/")
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_superuser_bypasses_gate(self, superuser_client_gate, free_plan_no_lab):
        """Superusers should bypass the feature gate entirely."""
        # Even though superuser's org might not have lab, superuser is exempt
        response = superuser_client_gate.get("/api/lab/orders/")
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_unauthenticated_not_blocked_by_gate(self, db, free_plan_no_lab):
        """Unauthenticated requests should pass through middleware (auth handled elsewhere)."""
        client = APIClient()
        response = client.get("/api/lab/orders/")
        # Should get 401 (auth required), not 403 (feature disabled)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_ungated_url_not_affected(self, free_client):
        """URLs not in the gate map should not be affected."""
        response = free_client.get("/api/patients/")
        # Patients endpoint is not gated — should pass (200 or similar)
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_billing_not_gated(self, free_client):
        """Billing is available on all tiers — not in the gate map."""
        response = free_client.get("/api/billing/services/")
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_pharmacy_not_gated(self, free_client):
        """Pharmacy is available on all tiers — not in the gate map."""
        response = free_client.get("/api/pharmacy/drugs/")
        assert response.status_code != status.HTTP_403_FORBIDDEN


class TestSubscriptionFeatureGateDisabled:
    """When SUBSCRIPTION_FEATURE_ENFORCEMENT=False (default in test), middleware is a no-op."""

    def test_free_plan_not_blocked_when_disabled(self, free_client):
        """Should pass through when enforcement is disabled."""
        response = free_client.get("/api/lab/orders/")
        # Should NOT get the feature_disabled 403
        if response.status_code == status.HTTP_403_FORBIDDEN:
            assert response.json().get("code") != "subscription_feature_disabled"


# ============================================================================
# Invitation: Staff Limit Enforcement
# ============================================================================


@pytest.fixture
def tight_limit_plan(db):
    """Plan with max_users=1 for testing limits."""
    return SubscriptionPlan.objects.create(
        code="TIGHT",
        name="Tight Plan",
        monthly_price=Decimal("0"),
        annual_price=Decimal("0"),
        max_facilities=1,
        max_users=1,
        max_patients=100,
        features={"outpatient": True},
        is_active=True,
        sort_order=0,
    )


@pytest.fixture
def org_at_limit(sample_organization, tight_limit_plan, sample_facility):
    """
    Organization at its staff limit (max_users=1, already has 1 staff).
    The admin user creating invitations counts as the 1 staff member.
    """
    sample_organization.subscription_plan = tight_limit_plan
    sample_organization.sync_from_plan(save=True)
    return sample_organization


@pytest.fixture
def admin_at_limit(db, org_at_limit, sample_facility):
    """Staff admin user whose org is at the staff limit (not superuser)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.create_user(
        username="admin_limit",
        email="admin_limit@test.com",
        password="testpass123",
        is_staff=True,
    )
    ensure_staff_profile(user, org_at_limit, sample_facility)
    return user


@pytest.fixture
def admin_at_limit_client(admin_at_limit):
    client = APIClient()
    client.force_authenticate(user=admin_at_limit)
    return client


class TestInvitationStaffLimitEnforcement:
    """Tests that invitation creation and acceptance respect staff limits."""

    def test_create_invitation_blocked_at_limit(
        self, admin_at_limit_client, org_at_limit, sample_facility
    ):
        """Should reject invitation creation when org is at staff limit."""
        from hmis.apps.core.models import Role

        role = Role.objects.first()
        response = admin_at_limit_client.post(
            "/api/core/invitations/",
            {
                "email": "newstaff@test.com",
                "organization": org_at_limit.pk,
                "facility": sample_facility.pk,
                "role": role.pk if role else None,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json()["code"] == "staff_limit_reached"

    def test_accept_invitation_blocked_at_limit(
        self, admin_at_limit, org_at_limit, sample_facility
    ):
        """Should reject invitation acceptance when org is at staff limit."""
        from hmis.apps.core.models import Role

        role = Role.objects.first()

        # admin_at_limit already occupies the 1 staff slot (max_users=1)
        # Create an invitation (bypass the limit check)
        invitation = StaffInvitation.objects.create(
            email="newuser@test.com",
            organization=org_at_limit,
            facility=sample_facility,
            role=role,
            status="PENDING",
        )

        client = APIClient()
        response = client.post(
            "/api/core/invitations/accept/",
            {
                "token": str(invitation.token),
                "username": "newuser",
                "first_name": "New",
                "last_name": "User",
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json()["code"] == "staff_limit_reached"
