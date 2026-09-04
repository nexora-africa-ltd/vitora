# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for seeding canonical subscription plans.

Usage:
    poetry run pytest tests/core/test_seed_subscription_plans.py -q

Inputs:
    - Django management command: seed_subscription_plans
    - Optional command flags: --update
"""

from io import StringIO

import pytest  # type: ignore
from django.core.management import call_command

from hmis.apps.core.models import Facility, Organization, SubscriptionPlan

STANDALONE_PLAN_EXPECTATIONS = {
    "LIS_STANDALONE": {
        "required": {"laboratory", "lis_standalone", "billing", "inventory"},
        "forbidden": {
            "pharmacy_standalone",
            "imaging_standalone",
            "outpatient",
            "inpatient",
        },
    },
    "PHARMACY_STANDALONE": {
        "required": {"pharmacy", "pharmacy_standalone", "billing", "inventory"},
        "forbidden": {
            "lis_standalone",
            "imaging_standalone",
            "outpatient",
            "inpatient",
        },
    },
    "IMAGING_STANDALONE": {
        "required": {"imaging", "imaging_standalone", "billing", "inventory"},
        "forbidden": {
            "lis_standalone",
            "pharmacy_standalone",
            "outpatient",
            "inpatient",
        },
    },
    "DIAGNOSTIC_STANDALONE": {
        "required": {
            "laboratory",
            "imaging",
            "lis_standalone",
            "imaging_standalone",
            "billing",
            "inventory",
        },
        "forbidden": {"pharmacy_standalone", "outpatient", "inpatient"},
    },
}


@pytest.mark.django_db
class TestSeedSubscriptionPlans:
    """Tests for the seed_subscription_plans command."""

    def test_seeds_general_and_standalone_plan_codes(self):
        out = StringIO()
        call_command("seed_subscription_plans", stdout=out)

        codes = set(SubscriptionPlan.objects.values_list("code", flat=True))
        assert {
            "FREE",
            "BASIC",
            "PROFESSIONAL",
            "ENTERPRISE",
            "LIS_STANDALONE",
            "PHARMACY_STANDALONE",
            "IMAGING_STANDALONE",
            "DIAGNOSTIC_STANDALONE",
        }.issubset(codes)

    def test_update_overwrites_standalone_feature_bundle(self):
        call_command("seed_subscription_plans")

        lis = SubscriptionPlan.objects.get(code="LIS_STANDALONE")
        lis.features["lis_standalone"] = False
        lis.features["outpatient"] = True
        lis.save(update_fields=["features"])

        call_command("seed_subscription_plans", "--update")
        lis.refresh_from_db()

        assert lis.features["lis_standalone"] is True
        assert lis.features["outpatient"] is False

    def test_standalone_seed_features_are_deterministic_for_mode_gating(self):
        """Seeded standalone plans must satisfy Facility operating-mode gate keys."""
        call_command("seed_subscription_plans")

        for code, expectation in STANDALONE_PLAN_EXPECTATIONS.items():
            plan = SubscriptionPlan.objects.get(code=code)

            for key in expectation["required"]:
                assert plan.features.get(key) is True, f"{code} must enable '{key}'."

            for key in expectation["forbidden"]:
                assert plan.features.get(key) is False, f"{code} must disable '{key}'."

        mode_to_plan = {
            Facility.OperatingMode.STANDALONE_LAB: "LIS_STANDALONE",
            Facility.OperatingMode.STANDALONE_PHARMACY: "PHARMACY_STANDALONE",
            Facility.OperatingMode.STANDALONE_IMAGING: "IMAGING_STANDALONE",
            Facility.OperatingMode.STANDALONE_DIAGNOSTIC: "DIAGNOSTIC_STANDALONE",
        }
        for mode, plan_code in mode_to_plan.items():
            required = set(Facility.OPERATING_MODE_REQUIRED_FEATURES[mode])
            plan = SubscriptionPlan.objects.get(code=plan_code)
            for key in required:
                assert plan.features.get(key) is True, (
                    f"{plan_code} missing required '{key}' for mode {mode}."
                )

    def test_standalone_plan_codes_are_valid_tiers(self):
        call_command("seed_subscription_plans")
        tier_codes = {code for code, _label in Organization.SubscriptionTier.choices}
        for code in STANDALONE_PLAN_EXPECTATIONS:
            assert code in tier_codes
