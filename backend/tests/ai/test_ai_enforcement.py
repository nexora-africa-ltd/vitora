"""
Tests for AI plan-feature and token-quota enforcement.

Verifies that AIFeatureGatedMixin blocks requests when:
- The org's plan does NOT include ``ai_assistant``
- The org has exhausted its AI token quota

Also verifies superusers bypass these checks.
"""

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.core.models import Organization, SubscriptionPlan

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def plan_with_ai(db):
    """A subscription plan that includes AI assistant."""
    return SubscriptionPlan.objects.create(
        code="BASIC",
        name="Basic Plan",
        monthly_price=5000,
        annual_price=50000,
        max_facilities=3,
        max_users=20,
        max_patients=5000,
        monthly_ai_tokens=100,
        features={
            "outpatient": True,
            "pharmacy": True,
            "billing": True,
            "ai_assistant": True,
        },
        is_active=True,
        sort_order=1,
    )


@pytest.fixture
def plan_without_ai(db):
    """A subscription plan that does NOT include AI assistant."""
    return SubscriptionPlan.objects.create(
        code="FREE",
        name="Free Plan",
        monthly_price=0,
        annual_price=0,
        max_facilities=1,
        max_users=5,
        max_patients=500,
        monthly_ai_tokens=0,
        features={
            "outpatient": True,
            "pharmacy": True,
            "billing": True,
            "ai_assistant": False,
        },
        is_active=True,
        sort_order=0,
    )


@pytest.fixture
def org_with_ai(db, plan_with_ai):
    """Organization on a plan that includes AI."""
    org = Organization.objects.create(
        name="AI Org",
        slug="ai-org",
        contact_email="ai@example.ke",
        is_active=True,
        is_verified=True,
        subscription_plan=plan_with_ai,
    )
    return org


@pytest.fixture
def org_without_ai(db, plan_without_ai):
    """Organization on a plan that does NOT include AI."""
    org = Organization.objects.create(
        name="Free Org",
        slug="free-org",
        contact_email="free@example.ke",
        is_active=True,
        is_verified=True,
        subscription_plan=plan_without_ai,
    )
    return org


@pytest.fixture
def org_exhausted_tokens(db, plan_with_ai):
    """Organization on AI plan but with all tokens used up."""
    org = Organization.objects.create(
        name="Exhausted Org",
        slug="exhausted-org",
        contact_email="exhausted@example.ke",
        is_active=True,
        is_verified=True,
        subscription_plan=plan_with_ai,
    )
    # Use up all tokens
    org.ai_tokens_used = plan_with_ai.monthly_ai_tokens
    org.save(update_fields=["ai_tokens_used"])
    return org


def _make_user_with_org(db, org, username, is_superuser=False):
    """Create a user + staff profile linked to the given org."""
    from datetime import date

    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import Department, Facility, Role, StaffProfile

    User = get_user_model()
    user = User.objects.create_user(username=username, password="testpass123")
    if is_superuser:
        user.is_superuser = True
        user.is_staff = True
        user.save()

    # Ensure a facility exists for the org
    facility = Facility.objects.filter(organization=org).first()
    if not facility:
        from hmis.apps.core.models import County, SubCounty

        county, _ = County.objects.get_or_create(code=1, defaults={"name": "Mombasa"})
        sub_county, _ = SubCounty.objects.get_or_create(county=county, defaults={"name": "Mvita"})
        facility = Facility.objects.create(
            organization=org,
            name="Test Facility",
            mfl_code=f"F{org.pk:05d}",
            level="3",
            county=county,
            sub_county=sub_county,
            is_active=True,
        )

    role, _ = Role.objects.get_or_create(
        code="DOCTOR", defaults={"name": "Doctor", "hierarchy_level": 5, "is_active": True}
    )

    department, _ = Department.objects.get_or_create(
        code="GOP",
        facility=facility,
        defaults={
            "name": "General Outpatient",
            "is_active": True,
            "organization": org,
        },
    )

    StaffProfile.objects.create(
        user=user,
        employee_id=f"EMP-{user.pk}",
        organization=org,
        primary_facility=facility,
        primary_department=department,
        primary_role=role,
        date_joined=date.today(),
    )

    return user


@pytest.fixture
def user_with_ai(db, org_with_ai):
    return _make_user_with_org(db, org_with_ai, "ai_user")


@pytest.fixture
def user_without_ai(db, org_without_ai):
    return _make_user_with_org(db, org_without_ai, "free_user")


@pytest.fixture
def user_exhausted(db, org_exhausted_tokens):
    return _make_user_with_org(db, org_exhausted_tokens, "exhausted_user")


@pytest.fixture
def superuser_no_ai(db, org_without_ai):
    return _make_user_with_org(db, org_without_ai, "super_user", is_superuser=True)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAIPlanFeatureEnforcement:
    """Verify plan-feature gate on AI endpoints."""

    AI_CHAT_URL = "/api/ai/clinical/chat/"
    AI_ICD10_URL = "/api/ai/icd10-suggest/"

    def test_org_with_ai_plan_can_access(self, api_client, user_with_ai, settings):
        """User on an AI-enabled plan can reach an AI endpoint (not blocked by plan check)."""
        settings.TIBABOT_ENABLED = True
        api_client.force_authenticate(user=user_with_ai)
        response = api_client.get(self.AI_ICD10_URL)
        # Should NOT be 403; may be 400 (missing params) — not a plan block
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_org_without_ai_plan_gets_403(self, api_client, user_without_ai, settings):
        """User on a plan WITHOUT ai_assistant gets 403 on AI endpoints."""
        settings.TIBABOT_ENABLED = True
        api_client.force_authenticate(user=user_without_ai)
        response = api_client.get(self.AI_ICD10_URL)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "plan" in response.data["detail"].lower()

    def test_org_without_ai_plan_blocked_on_post(self, api_client, user_without_ai, settings):
        """POST to AI chat is blocked for plan without ai_assistant."""
        settings.TIBABOT_ENABLED = True
        api_client.force_authenticate(user=user_without_ai)
        response = api_client.post(self.AI_CHAT_URL, {"message": "hello"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_superuser_bypasses_plan_check(self, api_client, superuser_no_ai, settings):
        """Superusers bypass plan feature checks."""
        settings.TIBABOT_ENABLED = True
        api_client.force_authenticate(user=superuser_no_ai)
        response = api_client.get(self.AI_ICD10_URL)
        # Should NOT be 403 (plan check bypassed)
        assert response.status_code != status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAITokenQuotaEnforcement:
    """Verify token-quota gate on AI write operations."""

    AI_CHAT_URL = "/api/ai/clinical/chat/"
    AI_ICD10_URL = "/api/ai/icd10-suggest/"

    def test_exhausted_tokens_blocks_post(self, api_client, user_exhausted, settings, mocker):
        """POST is blocked when org has used all AI tokens."""
        settings.TIBABOT_ENABLED = True
        api_client.force_authenticate(user=user_exhausted)
        response = api_client.post(self.AI_CHAT_URL, {"message": "hello"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "token" in response.data["detail"].lower()

    def test_exhausted_tokens_allows_get(self, api_client, user_exhausted, settings):
        """GET (read) operations are still allowed even when tokens exhausted."""
        settings.TIBABOT_ENABLED = True
        api_client.force_authenticate(user=user_exhausted)
        response = api_client.get(self.AI_ICD10_URL)
        # Should not be 403 for quota (GET is exempt from token check)
        assert response.status_code != status.HTTP_403_FORBIDDEN

    def test_user_with_tokens_can_post(self, api_client, user_with_ai, settings, mocker):
        """POST is allowed when org has remaining AI tokens."""
        settings.TIBABOT_ENABLED = True
        api_client.force_authenticate(user=user_with_ai)
        # Mock the actual TibaBot client so we don't need the service running
        mock_client = mocker.MagicMock()
        mock_client.clinical_chat.return_value = {
            "message": {"role": "assistant", "content": "Hello!"},
            "session_id": "test-session",
            "model": "gpt-4",
        }
        mocker.patch(
            "hmis.apps.ai.views.get_tibabot_client",
            return_value=mock_client,
        )
        response = api_client.post(self.AI_CHAT_URL, {"message": "hello"}, format="json")
        # Should not be 403 (has tokens)
        assert response.status_code != status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAIDisabledFeatureFlag:
    """Verify master TIBABOT_ENABLED flag still works."""

    AI_ICD10_URL = "/api/ai/icd10-suggest/"

    def test_tibabot_disabled_returns_404(self, api_client, user_with_ai, settings):
        """When TIBABOT_ENABLED=False, AI endpoints return 404."""
        settings.TIBABOT_ENABLED = False
        api_client.force_authenticate(user=user_with_ai)
        response = api_client.get(self.AI_ICD10_URL)
        assert response.status_code == status.HTTP_404_NOT_FOUND
