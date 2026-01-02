"""
Tests for Invoice API endpoints.

Following TDD principles - these tests are written BEFORE implementation.
Reference: Deliverables spec § 8, lines 847-889
"""

import pytest
from decimal import Decimal
from datetime import date, timedelta
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.billing.models import Invoice, InvoiceItem

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    """Provide REST framework API client."""
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, test_user):
    """Provide authenticated API client."""
    api_client.force_authenticate(user=test_user)
    return api_client


class TestInvoiceAPIEndpoints:
    """Test Invoice API CRUD operations."""

    def test_list_invoices_authenticated(self, authenticated_client, sample_invoice):
        """Test GET /api/billing/invoices/ - List invoices with pagination."""
        response = authenticated_client.get('/api/billing/invoices/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data or isinstance(response.data, list)

    def test_list_invoices_unauthenticated_fails(self, api_client):
        """Test unauthenticated access is rejected."""
        response = api_client.get('/api/billing/invoices/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_invoices_filter_by_status(self, authenticated_client, sample_invoice):
        """Test filtering invoices by status (pending, paid, etc)."""
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()
        
        response = authenticated_client.get(f'/api/billing/invoices/?status={Invoice.Status.PENDING}')
        
        assert response.status_code == status.HTTP_200_OK

    def test_list_invoices_filter_by_patient(self, authenticated_client, sample_invoice, sample_patient):
        """Test filtering invoices by patient ID."""
        response = authenticated_client.get(f'/api/billing/invoices/?patient={sample_patient.id}')
        
        assert response.status_code == status.HTTP_200_OK

    def test_create_invoice_with_patient(self, authenticated_client, sample_patient):
        """Test POST /api/billing/invoices/ - Create invoice with patient."""
        data = {
            'patient': sample_patient.id,
            'notes': 'Test invoice'
        }
        
        response = authenticated_client.post('/api/billing/invoices/', data)
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['patient'] == sample_patient.id
        assert 'invoice_number' in response.data
        assert response.data['invoice_number'].startswith('INV-')

    def test_create_invoice_with_encounter(self, authenticated_client, sample_patient, sample_encounter):
        """Test creating invoice linked to encounter."""
        data = {
            'patient': sample_patient.id,
            'encounter': sample_encounter.id,
            'notes': 'Consultation invoice'
        }
        
        response = authenticated_client.post('/api/billing/invoices/', data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['encounter'] == sample_encounter.id

    def test_get_invoice_detail(self, authenticated_client, sample_invoice):
        """Test GET /api/billing/invoices/{id}/ - Get full invoice with items."""
        response = authenticated_client.get(f'/api/billing/invoices/{sample_invoice.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_invoice.id
        assert 'items' in response.data or 'invoice_items' in response.data

    def test_update_draft_invoice(self, authenticated_client, sample_invoice):
        """Test PATCH /api/billing/invoices/{id}/ - Modify draft invoice."""
        sample_invoice.status = Invoice.Status.DRAFT
        sample_invoice.save()
        
        data = {'notes': 'Updated notes'}
        response = authenticated_client.patch(f'/api/billing/invoices/{sample_invoice.id}/', data)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['notes'] == 'Updated notes'

    def test_update_finalized_invoice_rejected(self, authenticated_client, sample_invoice):
        """Test that finalized invoices cannot be modified."""
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.save()
        
        data = {'notes': 'Should not update'}
        response = authenticated_client.patch(f'/api/billing/invoices/{sample_invoice.id}/', data)
        
        # Should reject or return error
        assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN]

    def test_finalize_invoice(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test POST /api/billing/invoices/{id}/finalize/ - Status change to pending."""
        sample_invoice.status = Invoice.Status.DRAFT
        sample_invoice.save()
        
        response = authenticated_client.post(f'/api/billing/invoices/{sample_invoice.id}/finalize/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == Invoice.Status.PENDING

    def test_cancel_invoice(self, authenticated_client, sample_invoice):
        """Test POST /api/billing/invoices/{id}/cancel/ - Cancel with reason."""
        data = {'reason': 'Patient transferred to another facility'}
        
        response = authenticated_client.post(f'/api/billing/invoices/{sample_invoice.id}/cancel/', data)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == Invoice.Status.CANCELLED

    def test_add_invoice_item(self, authenticated_client, sample_invoice, sample_service):
        """Test POST /api/billing/invoices/{id}/items/ - Add service item."""
        data = {
            'service': sample_service.id,
            'description': sample_service.name,  # Add required description
            'quantity': 1,
            'unit_price': str(sample_service.unit_price)
        }
        
        response = authenticated_client.post(f'/api/billing/invoices/{sample_invoice.id}/items/', data)
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['service'] == sample_service.id

    def test_remove_invoice_item(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test DELETE /api/billing/invoices/{id}/items/{item_id}/ - Remove item and recalculate."""
        response = authenticated_client.delete(
            f'/api/billing/invoices/{sample_invoice.id}/items/{sample_invoice_item.id}/'
        )
        
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_apply_discount(self, authenticated_client, sample_invoice, sample_invoice_item):
        """Test POST /api/billing/invoices/{id}/apply-discount/ - Apply discount with reason."""
        # Ensure invoice has items and totals calculated
        sample_invoice.calculate_totals()
        sample_invoice.save()
        
        data = {
            'discount_amount': '50.00',
            'discount_reason': 'Senior citizen discount'
        }
        
        response = authenticated_client.post(f'/api/billing/invoices/{sample_invoice.id}/apply-discount/', data)
        
        assert response.status_code == status.HTTP_200_OK
        assert Decimal(response.data['discount_amount']) == Decimal('50.00')

    def test_list_overdue_invoices(self, authenticated_client, sample_invoice):
        """Test GET /api/billing/invoices/overdue/ - Filter overdue invoices."""
        # Make invoice overdue - set both invoice_date and due_date in past
        sample_invoice.status = Invoice.Status.PENDING
        sample_invoice.invoice_date = date.today() - timedelta(days=40)
        sample_invoice.due_date = date.today() - timedelta(days=10)
        sample_invoice.save()
        
        response = authenticated_client.get('/api/billing/invoices/overdue/')
        
        assert response.status_code == status.HTTP_200_OK
