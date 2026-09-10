# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Subscription billing control tests.

Run with: poetry run pytest tests/core/test_subscription_billing_controls.py -q
Inputs: Django test fixtures for organizations, plans, and platform users.
"""

import json
from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework.test import APIClient

from hmis.apps.core.models import SubscriptionPlan
from tests.conftest import ensure_staff_profile


@pytest.mark.django_db
class TestSubscriptionBillingControls:
    def test_staff_user_cannot_access_subscription_period_ledger(
        self, sample_organization, sample_facility
    ):
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.create_user(
            username="platform-staff", password="password", is_staff=True
        )
        ensure_staff_profile(user, sample_organization, sample_facility)
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get("/api/subscription-periods/")

        assert response.status_code == 403

    def test_staff_user_cannot_modify_subscription_plans(
        self, sample_organization, sample_facility
    ):
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.create_user(
            username="plan-staff", password="password", is_staff=True
        )
        ensure_staff_profile(user, sample_organization, sample_facility)
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            "/api/subscription-plans/",
            {"code": "BASIC", "name": "Unapproved plan"},
            format="json",
        )

        assert response.status_code == 403

    def test_org_admin_cannot_change_commercial_subscription_fields(
        self, sample_organization, sample_facility
    ):
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import Role

        plan = SubscriptionPlan.objects.create(code="BASIC", name="Basic")
        role = Role.objects.create(code="ORG-ADMIN", name="Org Admin")
        user = get_user_model().objects.create_user(username="tenant-admin", password="password")
        profile = ensure_staff_profile(user, sample_organization, sample_facility)
        profile.primary_role = role
        profile.save(update_fields=["primary_role"])
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.patch(
            f"/api/organizations/{sample_organization.id}/",
            {
                "subscription_plan": plan.id,
                "subscription_status": "ACTIVE",
                "subscription_valid_until": (timezone.now() + timedelta(days=365)).isoformat(),
            },
            format="json",
        )

        assert response.status_code == 403

    def test_suspended_subscription_blocks_writes(
        self, sample_organization, test_user, test_staff_profile, settings
    ):
        settings.SUBSCRIPTION_EXPIRY_ENFORCEMENT = True
        sample_organization.subscription_status = "SUSPENDED"
        sample_organization.save(update_fields=["subscription_status"])
        from django.test import RequestFactory

        from hmis.apps.core.middleware import SubscriptionExpiryMiddleware

        request = RequestFactory().post("/api/patients/")
        request.user = test_user
        response = SubscriptionExpiryMiddleware(lambda _request: None)(request)

        assert response.status_code == 403
        assert json.loads(response.content)["code"] == "subscription_expired"

    def test_confirmed_period_activates_entitlement_idempotently(self, sample_organization):
        from hmis.apps.core.models import SubscriptionPeriod

        plan = SubscriptionPlan.objects.create(
            code="PROFESSIONAL", name="Professional", monthly_price=Decimal("5000.00")
        )
        period = SubscriptionPeriod.objects.create(
            organization=sample_organization,
            plan=plan,
            billing_interval="MONTHLY",
            amount=Decimal("5000.00"),
            currency="KES",
            period_start=timezone.now(),
            period_end=timezone.now() + timedelta(days=30),
        )

        period.confirm_payment("PAYMENT-001")
        period.confirm_payment("PAYMENT-001")
        sample_organization.refresh_from_db()
        period.refresh_from_db()

        assert period.status == SubscriptionPeriod.Status.PAID
        assert sample_organization.subscription_plan_id == plan.id
        assert sample_organization.subscription_status == "ACTIVE"

    def test_plan_with_historical_period_cannot_be_deleted(self, sample_organization):
        from django.core.exceptions import ValidationError

        from hmis.apps.core.models import SubscriptionPeriod

        plan = SubscriptionPlan.objects.create(code="BASIC", name="Basic")
        SubscriptionPeriod.objects.create(
            organization=sample_organization,
            plan=plan,
            billing_interval="MONTHLY",
            amount=Decimal("1.00"),
            currency="KES",
            period_start=timezone.now(),
            period_end=timezone.now() + timedelta(days=30),
        )

        with pytest.raises(ValidationError):
            plan.delete()

    def test_plan_features_can_be_updated_for_assigned_plan(self, sample_organization):
        plan = SubscriptionPlan.objects.create(
            code="BASIC", name="Basic", features={"billing": True}
        )
        sample_organization.subscription_plan = plan
        sample_organization.save(update_fields=["subscription_plan"])

        plan.features = {"billing": True, "ai_assistant": True}
        plan.save()
        plan.refresh_from_db()

        assert plan.features["ai_assistant"] is True
