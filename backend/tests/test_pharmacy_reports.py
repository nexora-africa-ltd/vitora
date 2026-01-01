"""
Tests for Pharmacy reports endpoints.
Following TDD approach: Write tests FIRST, then implement.
"""

import pytest
from datetime import date, timedelta
from rest_framework import status
from django.urls import reverse


@pytest.mark.django_db
class TestPharmacyReports:
    """Tests for inventory and dispensing reports."""
    
    def test_stock_summary_report_requires_auth(self, api_client):
        """Should require authentication for stock summary report."""
        url = reverse('pharmacy:stock-summary-report')
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_stock_summary_report_authenticated(
        self, authenticated_client, sample_drug, sample_stock_batch
    ):
        """Should return stock summary for authenticated user."""
        url = reverse('pharmacy:stock-summary-report')
        response = authenticated_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) > 0
        
        # Check structure
        stock_item = response.data['results'][0]
        assert 'drug_id' in stock_item
        assert 'drug_name' in stock_item
        assert 'total_quantity' in stock_item
        assert 'batches' in stock_item
    
    def test_expiry_report_requires_auth(self, api_client):
        """Should require authentication for expiry report."""
        url = reverse('pharmacy:expiry-report')
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_expiry_report_authenticated(
        self, authenticated_client, sample_drug, expiring_batch
    ):
        """Should return expiry report for authenticated user."""
        url = reverse('pharmacy:expiry-report')
        response = authenticated_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) > 0
        
        # Check structure
        batch = response.data['results'][0]
        assert 'batch_id' in batch
        assert 'drug_name' in batch
        assert 'batch_number' in batch
        assert 'expiry_date' in batch
        assert 'days_to_expiry' in batch
        assert 'quantity_available' in batch
    
    def test_expiry_report_filters_by_days(
        self, authenticated_client, sample_drug, expiring_batch
    ):
        """Should filter expiry report by days parameter."""
        url = reverse('pharmacy:expiry-report')
        response = authenticated_client.get(url, {'days': 30})
        
        assert response.status_code == status.HTTP_200_OK
        # Should only show batches expiring within 30 days
        for batch in response.data['results']:
            assert batch['days_to_expiry'] <= 30
    
    def test_dispensing_report_requires_auth(self, api_client):
        """Should require authentication for dispensing report."""
        url = reverse('pharmacy:dispensing-report')
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_dispensing_report_authenticated(
        self, authenticated_client, sample_dispensing
    ):
        """Should return dispensing report for authenticated user."""
        url = reverse('pharmacy:dispensing-report')
        response = authenticated_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) > 0
        
        # Check structure
        dispensing = response.data['results'][0]
        assert 'dispensing_id' in dispensing
        assert 'drug_name' in dispensing
        assert 'quantity_dispensed' in dispensing
        assert 'dispensed_date' in dispensing
        assert 'patient_name' in dispensing
    
    def test_dispensing_report_filters_by_date_range(
        self, authenticated_client, sample_dispensing
    ):
        """Should filter dispensing report by date range."""
        url = reverse('pharmacy:dispensing-report')
        today = date.today()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)
        
        response = authenticated_client.get(url, {
            'start_date': yesterday.isoformat(),
            'end_date': tomorrow.isoformat()
        })
        
        assert response.status_code == status.HTTP_200_OK
        # Should include today's dispensing
        assert len(response.data['results']) > 0
    
    def test_stock_movement_report_requires_auth(self, api_client):
        """Should require authentication for stock movement report."""
        url = reverse('pharmacy:stock-movement-report')
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_stock_movement_report_authenticated(
        self, authenticated_client, sample_drug, sample_stock_batch, sample_dispensing
    ):
        """Should return stock movement report for authenticated user."""
        url = reverse('pharmacy:stock-movement-report')
        response = authenticated_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) > 0
        
        # Check structure
        movement = response.data['results'][0]
        assert 'drug_name' in movement
        assert 'movement_type' in movement  # 'RECEIVED', 'DISPENSED', 'ADJUSTED'
        assert 'quantity' in movement
        assert 'date' in movement
