"""
Tests for billing reports API endpoints.

Phase 4.2: Report API Endpoints
Following TDD approach - tests written first.
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestReportAPIEndpoints:
    """Test billing report API endpoints."""

    def test_daily_collection_endpoint_returns_report(
        self, authenticated_client, sample_invoice, sample_payment
    ):
        """Should return daily collection report for specified date."""
        url = reverse("billing:reports-daily-collection")
        response = authenticated_client.get(url, {"date": str(date.today())})

        assert response.status_code == status.HTTP_200_OK
        assert "total_collections" in response.data
        assert "invoice_count" in response.data
        assert "by_payment_method" in response.data

    def test_daily_collection_requires_date(self, authenticated_client):
        """Should return 400 if date parameter is missing."""
        url = reverse("billing:reports-daily-collection")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_revenue_summary_endpoint_returns_report(
        self, authenticated_client, sample_invoice, sample_payment
    ):
        """Should return revenue summary for date range."""
        url = reverse("billing:reports-revenue-summary")
        today = date.today()
        start_date = today - timedelta(days=30)

        response = authenticated_client.get(
            url, {"start_date": str(start_date), "end_date": str(today)}
        )

        assert response.status_code == status.HTTP_200_OK
        assert "total_revenue" in response.data
        assert "by_category" in response.data
        assert "by_payment_method" in response.data

    def test_revenue_summary_requires_dates(self, authenticated_client):
        """Should return 400 if date parameters are missing."""
        url = reverse("billing:reports-revenue-summary")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_outstanding_balances_endpoint_returns_list(self, authenticated_client, sample_invoice):
        """Should return list of outstanding invoices."""
        url = reverse("billing:reports-outstanding-balances")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        if len(response.data) > 0:
            assert "invoice_number" in response.data[0]
            assert "patient_name" in response.data[0]
            assert "days_overdue" in response.data[0]

    def test_service_utilization_endpoint_returns_report(
        self, authenticated_client, sample_invoice_item
    ):
        """Should return service utilization report."""
        url = reverse("billing:reports-service-utilization")
        today = date.today()
        start_date = today - timedelta(days=30)

        response = authenticated_client.get(
            url, {"start_date": str(start_date), "end_date": str(today)}
        )

        assert response.status_code == status.HTTP_200_OK
        assert "services" in response.data
        assert isinstance(response.data["services"], list)

    def test_payment_method_analysis_endpoint_returns_report(
        self, authenticated_client, sample_payment
    ):
        """Should return payment method analysis."""
        url = reverse("billing:reports-payment-analysis")
        today = date.today()
        start_date = today - timedelta(days=30)

        response = authenticated_client.get(
            url, {"start_date": str(start_date), "end_date": str(today)}
        )

        assert response.status_code == status.HTTP_200_OK
        assert "by_method" in response.data
        assert isinstance(response.data["by_method"], dict)

    def test_daily_closure_endpoint_returns_report(
        self, authenticated_client, sample_invoice, sample_payment
    ):
        """Should return end-of-day closure report for specified date."""
        url = reverse("billing:reports-daily-closure")
        response = authenticated_client.get(url, {"date": str(date.today())})

        assert response.status_code == status.HTTP_200_OK
        assert "total_invoiced" in response.data
        assert "total_collected" in response.data
        assert "outstanding" in response.data
        assert "by_department" in response.data
        assert "by_payment_method" in response.data

    def test_daily_closure_requires_date(self, authenticated_client):
        """Should return 400 if date parameter is missing."""
        url = reverse("billing:reports-daily-closure")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_discrepancies_endpoint_returns_list(self, authenticated_client):
        """Should return billing discrepancies list."""
        url = reverse("billing:reports-discrepancies")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_discrepancies_returns_expected_fields(
        self, authenticated_client, sample_invoice, sample_service
    ):
        """Should return discrepancies with all expected fields when price differs."""
        from hmis.apps.billing.models import InvoiceItem

        # Create an invoice item with a price different from service price
        item = InvoiceItem.objects.create(
            invoice=sample_invoice,
            service=sample_service,
            description=sample_service.name,
            quantity=1,
            unit_price=sample_service.unit_price - 100,  # Create discrepancy
        )

        url = reverse("billing:reports-discrepancies")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert len(response.data) >= 1

        # Find our discrepancy in the list
        discrepancy = next(
            (d for d in response.data if d["id"] == item.id),
            None
        )
        assert discrepancy is not None, "Created discrepancy not found in response"

        # Verify all expected fields are present
        expected_fields = [
            "id",
            "encounter_id",
            "invoice_number",
            "patient_name",
            "patient_mrn",
            "service_name",
            "expected_amount",
            "billed_amount",
            "discrepancy",
            "date",
            "status",
        ]
        for field in expected_fields:
            assert field in discrepancy, f"Missing field: {field}"

        # Verify field values
        assert discrepancy["invoice_number"] == sample_invoice.invoice_number
        assert discrepancy["service_name"] == sample_service.name
        assert discrepancy["status"] in ["PENDING", "RESOLVED"]

    def test_unbilled_services_endpoint_returns_list(self, authenticated_client):
        """Should return unbilled services by department."""
        url = reverse("billing:reports-unbilled-services")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_report_endpoints_require_authentication(self, api_client):
        """Should return 401 for unauthenticated requests."""
        endpoints = [
            "billing:reports-daily-collection",
            "billing:reports-revenue-summary",
            "billing:reports-outstanding-balances",
            "billing:reports-service-utilization",
            "billing:reports-payment-analysis",
            "billing:reports-daily-closure",
            "billing:reports-discrepancies",
            "billing:reports-unbilled-services",
        ]

        for endpoint_name in endpoints:
            url = reverse(endpoint_name)
            response = api_client.get(url)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
