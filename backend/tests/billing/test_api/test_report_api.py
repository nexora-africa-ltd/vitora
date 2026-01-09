"""
Tests for billing reports API endpoints.

Phase 4.2: Report API Endpoints
Following TDD approach - tests written first.
"""
from datetime import date, timedelta

import pytest # type: ignore
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestReportAPIEndpoints:
    """Test billing report API endpoints."""

    def test_daily_collection_endpoint_returns_report(
        self, authenticated_client, sample_invoice, sample_payment
    ):
        """Should return daily collection report for specified date."""
        url = reverse('billing:reports-daily-collection')
        response = authenticated_client.get(url, {'date': str(date.today())})

        assert response.status_code == status.HTTP_200_OK
        assert 'total_collections' in response.data
        assert 'invoice_count' in response.data
        assert 'by_payment_method' in response.data

    def test_daily_collection_requires_date(self, authenticated_client):
        """Should return 400 if date parameter is missing."""
        url = reverse('billing:reports-daily-collection')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_revenue_summary_endpoint_returns_report(
        self, authenticated_client, sample_invoice, sample_payment
    ):
        """Should return revenue summary for date range."""
        url = reverse('billing:reports-revenue-summary')
        today = date.today()
        start_date = today - timedelta(days=30)

        response = authenticated_client.get(url, {
            'start_date': str(start_date),
            'end_date': str(today)
        })

        assert response.status_code == status.HTTP_200_OK
        assert 'total_revenue' in response.data
        assert 'by_category' in response.data
        assert 'by_payment_method' in response.data

    def test_revenue_summary_requires_dates(self, authenticated_client):
        """Should return 400 if date parameters are missing."""
        url = reverse('billing:reports-revenue-summary')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_outstanding_balances_endpoint_returns_list(
        self, authenticated_client, sample_invoice
    ):
        """Should return list of outstanding invoices."""
        url = reverse('billing:reports-outstanding-balances')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        if len(response.data) > 0:
            assert 'invoice_number' in response.data[0]
            assert 'patient_name' in response.data[0]
            assert 'days_overdue' in response.data[0]

    def test_service_utilization_endpoint_returns_report(
        self, authenticated_client, sample_invoice_item
    ):
        """Should return service utilization report."""
        url = reverse('billing:reports-service-utilization')
        today = date.today()
        start_date = today - timedelta(days=30)

        response = authenticated_client.get(url, {
            'start_date': str(start_date),
            'end_date': str(today)
        })

        assert response.status_code == status.HTTP_200_OK
        assert 'services' in response.data
        assert isinstance(response.data['services'], list)

    def test_payment_method_analysis_endpoint_returns_report(
        self, authenticated_client, sample_payment
    ):
        """Should return payment method analysis."""
        url = reverse('billing:reports-payment-analysis')
        today = date.today()
        start_date = today - timedelta(days=30)

        response = authenticated_client.get(url, {
            'start_date': str(start_date),
            'end_date': str(today)
        })

        assert response.status_code == status.HTTP_200_OK
        assert 'by_method' in response.data
        assert isinstance(response.data['by_method'], dict)

    def test_report_endpoints_require_authentication(self, api_client):
        """Should return 401 for unauthenticated requests."""
        endpoints = [
            'billing:reports-daily-collection',
            'billing:reports-revenue-summary',
            'billing:reports-outstanding-balances',
            'billing:reports-service-utilization',
            'billing:reports-payment-analysis',
        ]

        for endpoint_name in endpoints:
            url = reverse(endpoint_name)
            response = api_client.get(url)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
