"""
Tests for billing catalog-items aggregate API.

Use:
- Run with pytest to validate /api/billing/catalog-items/ behavior and search/filtering.

Supported inputs:
- pytest test selection args (file/class/test selectors) and standard test fixtures.
"""

from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.procedures.models import ProcedureCatalog
from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, test_user, sample_organization, sample_facility):
    ensure_staff_profile(test_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=test_user)
    return api_client


class TestBillingCatalogItemsAPI:
    def test_list_catalog_items_returns_aggregated_rows(
        self,
        authenticated_client,
        sample_service,
        sample_facility,
        sample_organization,
    ):
        ProcedureCatalog.objects.create(
            code="PROC-WC-002",
            name="Advanced Wound Dressing",
            category=ProcedureCatalog.Category.WOUND_CARE,
            body_system=ProcedureCatalog.BodySystem.INTEGUMENTARY,
            risk_level=ProcedureCatalog.RiskLevel.LOW,
            typical_duration_minutes=30,
            consent_required=False,
            base_fee=Decimal("1200.00"),
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get("/api/billing/catalog-items/")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        kinds = {row["kind"] for row in response.data["results"]}
        assert "service" in kinds
        assert "procedure_catalog" in kinds

    def test_catalog_items_search_filters_across_catalogs(
        self,
        authenticated_client,
        sample_service,
    ):
        response = authenticated_client.get("/api/billing/catalog-items/?search=CONS-GEN")

        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data
        assert len(response.data["results"]) >= 1
        assert all(
            "cons-gen" in f"{row.get('code', '')} {row.get('name', '')}".lower()
            for row in response.data["results"]
        )
