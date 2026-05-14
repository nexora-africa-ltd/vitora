"""Fixtures for analytics tests.

Grants the ``custom_reports`` feature to the test organisation so that
the ``SubscriptionFeaturePermission`` on Superset / Metabase views does
not block analytics tests that predate the subscription-gating work.
"""

import pytest  # type: ignore


@pytest.fixture(autouse=True)
def _grant_custom_reports(test_staff_profile):
    """Ensure the test org has a plan with ``custom_reports`` enabled."""
    from hmis.apps.core.models import SubscriptionPlan

    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="TEST_ANALYTICS",
        defaults={
            "name": "Test Analytics Plan",
            "monthly_price": "0.00",
            "annual_price": "0.00",
            "features": {"custom_reports": True},
            "is_active": True,
        },
    )
    org = test_staff_profile.organization
    org.subscription_plan = plan
    org.save(update_fields=["subscription_plan"])
