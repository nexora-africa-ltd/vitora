"""Shared fixtures for AI/TibaBot tests."""

import pytest  # type: ignore


@pytest.fixture(autouse=True)
def _grant_ai_feature(monkeypatch, sample_organization):
    """Ensure AI plan checks pass for all AI tests.

    Test orgs have subscription_plan=None which means:
    1. has_feature('ai_assistant') returns False (not in PLAN_FALLBACK_FEATURES)
    2. monthly_ai_tokens is set to 0 by Organization.save(), so token quota
       check blocks all POST/PATCH/DELETE requests.

    This fixture:
    - Patches PLAN_FALLBACK_FEATURES to include ai_assistant
    - Sets monthly_ai_tokens=None (unlimited) on the test org
    """
    from hmis.apps.core.models import Organization

    patched = {**Organization.PLAN_FALLBACK_FEATURES, "ai_assistant": True}
    monkeypatch.setattr(Organization, "PLAN_FALLBACK_FEATURES", patched)

    # Set unlimited AI tokens on the test org (bypasses token quota check)
    Organization.objects.filter(pk=sample_organization.pk).update(monthly_ai_tokens=None)
    sample_organization.monthly_ai_tokens = None
