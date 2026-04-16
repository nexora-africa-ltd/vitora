"""
Tests for Phase 6 forecasting API endpoints.

Covers:
- ConsumptionRecord: list, filter
- DemandForecast: list, filter, generate action
- ReorderSuggestion: list, filter, convert_to_po, dismiss actions
- Authentication enforcement
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

pytestmark = pytest.mark.django_db


# ============================================================================
# ConsumptionRecord API
# ============================================================================


class TestConsumptionRecordAPI:
    """Tests for /api/inventory/consumption/ endpoints."""

    ENDPOINT = "/api/inventory/consumption/"

    def test_list_consumption_records(self, authenticated_client, consumption_record):
        """Should list consumption records for the user's facility."""
        response = authenticated_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        record = results[0]
        assert "drug_name" in record
        assert "total_consumption" in record
        assert "average_daily_consumption" in record

    def test_list_consumption_unauthenticated(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_filter_by_drug(self, authenticated_client, consumption_record, sample_drug):
        """Should filter consumption records by drug."""
        response = authenticated_client.get(self.ENDPOINT, {"drug": sample_drug.pk})
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_retrieve_consumption_record(self, authenticated_client, consumption_record):
        """Should retrieve a single consumption record."""
        url = f"{self.ENDPOINT}{consumption_record.pk}/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == consumption_record.pk

    def test_no_create_allowed(self, authenticated_client):
        """Should not allow POST (read-only viewset)."""
        response = authenticated_client.post(self.ENDPOINT, {}, format="json")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


# ============================================================================
# DemandForecast API
# ============================================================================


class TestDemandForecastAPI:
    """Tests for /api/inventory/forecasts/ endpoints."""

    ENDPOINT = "/api/inventory/forecasts/"

    def test_list_forecasts(self, authenticated_client, demand_forecast):
        """Should list demand forecasts."""
        response = authenticated_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert "drug_name" in results[0]
        assert "predicted_demand" in results[0]

    def test_list_unauthenticated(self, api_client):
        """Should reject unauthenticated access."""
        response = api_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_filter_by_method(self, authenticated_client, demand_forecast):
        """Should filter by forecast method."""
        response = authenticated_client.get(self.ENDPOINT, {"method": "MOVING_AVERAGE"})
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert all(r["method"] == "MOVING_AVERAGE" for r in results)

    def test_retrieve_forecast(self, authenticated_client, demand_forecast):
        """Should retrieve a single forecast."""
        url = f"{self.ENDPOINT}{demand_forecast.pk}/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == demand_forecast.pk

    def test_generate_single_drug(
        self,
        authenticated_client,
        sample_drug,
        multiple_consumption_records,
    ):
        """Should generate a forecast for a specific drug."""
        url = f"{self.ENDPOINT}generate/"
        response = authenticated_client.post(
            url,
            {
                "drug_id": sample_drug.pk,
                "period_months": 3,
                "method": "MOVING_AVERAGE",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["drug"] == sample_drug.pk
        assert "predicted_demand" in response.data

    def test_generate_all_drugs(
        self,
        authenticated_client,
        multiple_consumption_records,
    ):
        """Should generate forecasts for all drugs with history."""
        url = f"{self.ENDPOINT}generate/"
        response = authenticated_client.post(
            url,
            {
                "period_months": 3,
                "method": "MOVING_AVERAGE",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["count"] >= 1

    def test_generate_validates_input(self, authenticated_client):
        """Should reject invalid method."""
        url = f"{self.ENDPOINT}generate/"
        response = authenticated_client.post(
            url,
            {"period_months": 3, "method": "INVALID_METHOD"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# ReorderSuggestion API
# ============================================================================


class TestReorderSuggestionAPI:
    """Tests for /api/inventory/reorder-suggestions/ endpoints."""

    ENDPOINT = "/api/inventory/reorder-suggestions/"

    def test_list_suggestions(self, authenticated_client, reorder_suggestion):
        """Should list reorder suggestions."""
        response = authenticated_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert "drug_name" in results[0]
        assert "urgency" in results[0]
        assert "supplier_name" in results[0]

    def test_list_unauthenticated(self, api_client):
        """Should reject unauthenticated access."""
        response = api_client.get(self.ENDPOINT)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_filter_by_urgency(self, authenticated_client, reorder_suggestion):
        """Should filter suggestions by urgency."""
        response = authenticated_client.get(self.ENDPOINT, {"urgency": "HIGH"})
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert all(r["urgency"] == "HIGH" for r in results)

    def test_filter_by_status(self, authenticated_client, reorder_suggestion):
        """Should filter by status."""
        response = authenticated_client.get(self.ENDPOINT, {"status": "PENDING"})
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert all(r["status"] == "PENDING" for r in results)

    def test_convert_to_po(self, authenticated_client, reorder_suggestion):
        """Should convert a PENDING suggestion to a PurchaseOrder."""
        url = f"{self.ENDPOINT}{reorder_suggestion.pk}/convert_to_po/"
        response = authenticated_client.post(url, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert "purchase_order_id" in response.data
        assert "po_number" in response.data

        reorder_suggestion.refresh_from_db()
        assert reorder_suggestion.status == "CONVERTED_TO_PO"
        assert reorder_suggestion.purchase_order_id is not None

    def test_convert_non_pending_fails(self, authenticated_client, reorder_suggestion):
        """Should reject converting a non-PENDING suggestion."""
        reorder_suggestion.dismiss()

        url = f"{self.ENDPOINT}{reorder_suggestion.pk}/convert_to_po/"
        response = authenticated_client.post(url, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_convert_no_supplier_fails(
        self,
        authenticated_client,
        sample_drug,
        sample_facility,
        sample_organization,
    ):
        """Should reject conversion when suggestion has no supplier."""
        from hmis.apps.inventory.models import ReorderSuggestion

        suggestion = ReorderSuggestion.objects.create(
            drug=sample_drug,
            supplier=None,
            current_stock=Decimal("10.00"),
            reorder_point=Decimal("50.00"),
            suggested_quantity=Decimal("200.00"),
            urgency="CRITICAL",
            status="PENDING",
            facility=sample_facility,
            organization=sample_organization,
        )

        url = f"{self.ENDPOINT}{suggestion.pk}/convert_to_po/"
        response = authenticated_client.post(url, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "supplier" in response.data["error"].lower()

    def test_dismiss_suggestion(self, authenticated_client, reorder_suggestion):
        """Should dismiss a PENDING suggestion."""
        url = f"{self.ENDPOINT}{reorder_suggestion.pk}/dismiss/"
        response = authenticated_client.post(url, format="json")
        assert response.status_code == status.HTTP_200_OK

        reorder_suggestion.refresh_from_db()
        assert reorder_suggestion.status == "DISMISSED"

    def test_dismiss_non_pending_fails(self, authenticated_client, reorder_suggestion):
        """Should reject dismissing a non-PENDING suggestion."""
        reorder_suggestion.dismiss()

        url = f"{self.ENDPOINT}{reorder_suggestion.pk}/dismiss/"
        response = authenticated_client.post(url, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_no_create_allowed(self, authenticated_client):
        """Should not allow POST (read-only viewset)."""
        response = authenticated_client.post(self.ENDPOINT, {}, format="json")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
