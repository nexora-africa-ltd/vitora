# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tenant account and billing API tests.

Run with: poetry run pytest tests/core/test_tenant_billing_api.py -q
Inputs: organization-scoped authenticated users and subscription plans.
"""

import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import SubscriptionPeriod, SubscriptionPlan
from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant_client(test_user, sample_organization, sample_facility):
    ensure_staff_profile(test_user, sample_organization, sample_facility)
    client = APIClient()
    client.force_authenticate(user=test_user)
    return client


def test_tenant_can_read_own_billing_summary(tenant_client, sample_organization):
    plan = SubscriptionPlan.objects.create(
        code="BASIC", name="Basic", monthly_price=Decimal("1000")
    )
    SubscriptionPeriod.objects.create(
        organization=sample_organization,
        plan=plan,
        billing_interval="MONTHLY",
        amount=Decimal("1000"),
        period_start=timezone.now(),
        period_end=timezone.now() + timedelta(days=30),
    )

    response = tenant_client.get(f"/api/organizations/{sample_organization.id}/account-billing/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["organization_id"] == sample_organization.id
    assert len(response.data["periods"]) == 1


def test_org_admin_can_update_billing_contact(tenant_client, sample_organization):
    from hmis.apps.core.models import Role

    profile = tenant_client.handler._force_user.staff_profile
    profile.primary_role = Role.objects.create(code="ORG-ADMIN", name="Organization Admin")
    profile.save(update_fields=["primary_role"])

    response = tenant_client.patch(
        f"/api/organizations/{sample_organization.id}/billing-contact/",
        {
            "contact_name": "Jane Doe",
            "billing_email": "billing@example.test",
            "phone": "+254712345678",
            "billing_address": "Nairobi, Kenya",
            "kra_pin": "P012345678A",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["contact_name"] == "Jane Doe"
    sample_organization.refresh_from_db()
    assert sample_organization.contact_email == "billing@example.test"


def test_tenant_cannot_read_another_organization_billing(tenant_client, sample_organization, db):
    from hmis.apps.core.models import Organization

    other = Organization.objects.create(name="Other Org", slug="other-org")
    response = tenant_client.get(f"/api/organizations/{other.id}/account-billing/")
    assert response.status_code == status.HTTP_404_NOT_FOUND


@patch("hmis.apps.core.views_org_facility.requests.post")
def test_tenant_can_initiate_paystack_checkout(
    mock_post, tenant_client, sample_organization, settings
):
    from hmis.apps.core.models import Role

    profile = tenant_client.handler._force_user.staff_profile
    role = Role.objects.create(code="ORG-ADMIN", name="Organization Admin")
    profile.primary_role = role
    profile.save(update_fields=["primary_role"])
    settings.PAYSTACK_SECRET_KEY = "sk_test_123"
    plan = SubscriptionPlan.objects.create(
        code="BASIC", name="Basic", monthly_price=Decimal("1000")
    )
    mock_response = Mock()
    mock_response.raise_for_status = Mock()
    mock_response.json.return_value = {
        "status": True,
        "data": {"authorization_url": "https://paystack.test/pay", "reference": "PAYSTACK-1"},
    }
    mock_post.return_value = mock_response

    response = tenant_client.post(
        f"/api/organizations/{sample_organization.id}/paystack-checkout/",
        {"plan_id": plan.id, "billing_interval": "MONTHLY"},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["authorization_url"] == "https://paystack.test/pay"
    assert response.data["reference"] == "PAYSTACK-1"
    payload = mock_post.call_args.kwargs["json"]
    assert payload["metadata"]["payer_full_name"] == "testuser"
    assert payload["metadata"]["custom_fields"][1]["value"] == "testuser"


@patch("hmis.apps.core.paystack_views.requests.get")
def test_paystack_webhook_confirms_verified_payment(
    mock_get, api_client, sample_organization, settings
):
    settings.PAYSTACK_SECRET_KEY = "sk_test_123"
    plan = SubscriptionPlan.objects.create(
        code="BASIC", name="Basic", monthly_price=Decimal("1000")
    )
    period = SubscriptionPeriod.objects.create(
        organization=sample_organization,
        plan=plan,
        billing_interval="MONTHLY",
        amount=Decimal("1000"),
        payment_reference="PAYSTACK-1",
        period_start=timezone.now(),
        period_end=timezone.now() + timedelta(days=30),
    )
    body = json.dumps({"event": "charge.success", "data": {"reference": "PAYSTACK-1"}}).encode()
    mock_response = Mock()
    mock_response.raise_for_status = Mock()
    mock_response.json.return_value = {
        "data": {"status": "success", "currency": "KES", "amount": 100000}
    }
    mock_get.return_value = mock_response

    response = api_client.post(
        "/api/payments/paystack/webhook/",
        body,
        content_type="application/json",
        HTTP_X_PAYSTACK_SIGNATURE=hmac.new(b"sk_test_123", body, hashlib.sha512).hexdigest(),
    )

    assert response.status_code == status.HTTP_200_OK
    period.refresh_from_db()
    assert period.status == SubscriptionPeriod.Status.PAID


@patch("hmis.apps.core.views_org_facility.requests.get")
def test_org_admin_can_reconcile_returned_paystack_payment(
    mock_get, tenant_client, sample_organization, settings
):
    from hmis.apps.core.models import Role

    profile = tenant_client.handler._force_user.staff_profile
    profile.primary_role = Role.objects.create(code="ORG-ADMIN", name="Organization Admin")
    profile.save(update_fields=["primary_role"])
    settings.PAYSTACK_SECRET_KEY = "sk_test_123"
    plan = SubscriptionPlan.objects.create(
        code="BASIC", name="Basic", monthly_price=Decimal("1000")
    )
    period = SubscriptionPeriod.objects.create(
        organization=sample_organization,
        plan=plan,
        billing_interval="MONTHLY",
        amount=Decimal("1000"),
        payment_reference="PAYSTACK-RETURN-1",
        period_start=timezone.now(),
        period_end=timezone.now() + timedelta(days=30),
    )
    mock_response = Mock()
    mock_response.raise_for_status = Mock()
    mock_response.json.return_value = {
        "data": {"status": "success", "currency": "KES", "amount": 100000}
    }
    mock_get.return_value = mock_response

    response = tenant_client.post(
        f"/api/organizations/{sample_organization.id}/paystack-status/",
        {"reference": "PAYSTACK-RETURN-1"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    period.refresh_from_db()
    assert period.status == SubscriptionPeriod.Status.PAID


@patch("hmis.apps.core.views_org_facility.requests.post")
def test_checkout_starts_after_current_subscription_end(
    mock_post, tenant_client, sample_organization, settings
):
    from hmis.apps.core.models import Role

    profile = tenant_client.handler._force_user.staff_profile
    profile.primary_role = Role.objects.create(code="ORG-ADMIN", name="Organization Admin")
    profile.save(update_fields=["primary_role"])
    settings.PAYSTACK_SECRET_KEY = "sk_test_123"
    sample_organization.contact_email = "billing@example.test"
    sample_organization.subscription_valid_until = timezone.now() + timedelta(days=10)
    sample_organization.save(update_fields=["contact_email_encrypted", "subscription_valid_until"])

    plan = SubscriptionPlan.objects.create(
        code="PROFESSIONAL", name="Professional", monthly_price=Decimal("2000")
    )
    mock_response = Mock()
    mock_response.raise_for_status = Mock()
    mock_response.json.return_value = {
        "status": True,
        "data": {"authorization_url": "https://paystack.test/pay", "reference": "PAYSTACK-2"},
    }
    mock_post.return_value = mock_response

    response = tenant_client.post(
        f"/api/organizations/{sample_organization.id}/paystack-checkout/",
        {"plan_id": plan.id, "billing_interval": "MONTHLY"},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    period = SubscriptionPeriod.objects.get(
        organization=sample_organization, payment_reference="PAYSTACK-2"
    )
    assert period.period_start == sample_organization.subscription_valid_until


def test_account_billing_uses_aggregated_ai_tokens_when_counter_is_stale(
    tenant_client, sample_organization, sample_facility
):
    from hmis.apps.ai.models import AICarePlanResult

    AICarePlanResult.objects.create(
        organization=sample_organization,
        facility=sample_facility,
        request_data={"prompt": "x"},
        result_data={"answer": "y"},
        total_tokens=43375,
    )
    sample_organization.ai_tokens_used = 0
    sample_organization.save(update_fields=["ai_tokens_used"])

    response = tenant_client.get(f"/api/organizations/{sample_organization.id}/account-billing/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["ai_tokens"]["used"] == 43375
