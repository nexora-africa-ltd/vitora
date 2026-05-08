"""Test fixtures for the referrals module."""

import pytest


@pytest.fixture(autouse=True)
def _grant_referral_action_perms(test_user, db):
    """Grant accept/decline referral perms to ``test_user`` for these tests.

    The ``ReferralActionPermission`` requires explicit Django permissions for
    accept/decline. Real deployments grant these via roles; in tests we make
    ``test_user`` a referral receiver by default. Tests that need to verify
    permission denial can revoke these perms inline.
    """
    from django.contrib.auth.models import Permission

    perms = Permission.objects.filter(
        codename__in=("accept_referral", "decline_referral", "view_sensitive_referral"),
    )
    test_user.user_permissions.add(*perms)
