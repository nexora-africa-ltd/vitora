"""
Tests for Service and ServiceCategory API endpoints.

Following TDD principles - these tests are written BEFORE implementation.
Reference: Deliverables spec § 8, lines 847-889 (Invoice API pattern)
"""

from decimal import Decimal

import pytest # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

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


class TestServiceAPIEndpoints:
    """Test Service API CRUD operations."""

    def test_list_services_authenticated(self, authenticated_client, sample_service):
        """Test GET /api/billing/services/ - List all services."""
        response = authenticated_client.get('/api/billing/services/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data or isinstance(response.data, list)

    def test_list_services_unauthenticated_fails(self, api_client):
        """Test unauthenticated access is rejected."""
        response = api_client.get('/api/billing/services/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_services_filter_by_category(self, authenticated_client, sample_category, sample_service):
        """Test filtering services by category."""
        # Create service in the category
        sample_service.category = sample_category
        sample_service.save()

        response = authenticated_client.get(f'/api/billing/services/?category={sample_category.id}')

        assert response.status_code == status.HTTP_200_OK

    def test_list_services_filter_by_availability(self, authenticated_client, sample_service):
        """Test filtering services by availability."""
        sample_service.is_active = True
        sample_service.save()

        response = authenticated_client.get('/api/billing/services/?is_active=true')

        assert response.status_code == status.HTTP_200_OK

    def test_list_services_search(self, authenticated_client, sample_service):
        """Test searching services by name or code."""
        response = authenticated_client.get(f'/api/billing/services/?search={sample_service.name}')

        assert response.status_code == status.HTTP_200_OK

    def test_get_service_detail(self, authenticated_client, sample_service):
        """Test GET /api/billing/services/{id}/ - Get service details."""
        response = authenticated_client.get(f'/api/billing/services/{sample_service.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_service.id
        assert response.data['name'] == sample_service.name
        assert Decimal(response.data['unit_price']) == sample_service.unit_price

    def test_create_service(self, authenticated_client, sample_category):
        """Test POST /api/billing/services/ - Create new service."""
        data = {
            'code': 'CONS-NEW',
            'name': 'New Consultation',
            'category': sample_category.id,
            'unit_price': '1500.00',
            'is_taxable': True,
            'is_available': True
        }

        response = authenticated_client.post('/api/billing/services/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['code'] == 'CONS-NEW'
        assert Decimal(response.data['unit_price']) == Decimal('1500.00')

    def test_update_service(self, authenticated_client, sample_service):
        """Test PATCH /api/billing/services/{id}/ - Update service."""
        data = {'unit_price': '1200.00'}

        response = authenticated_client.patch(f'/api/billing/services/{sample_service.id}/', data)

        assert response.status_code == status.HTTP_200_OK
        assert Decimal(response.data['unit_price']) == Decimal('1200.00')

    def test_delete_service(self, authenticated_client, sample_service):
        """Test DELETE /api/billing/services/{id}/ - Delete service (soft delete)."""
        response = authenticated_client.delete(f'/api/billing/services/{sample_service.id}/')

        # Should either be 204 NO CONTENT or mark as unavailable
        assert response.status_code in [status.HTTP_204_NO_CONTENT, status.HTTP_200_OK]


class TestServiceCategoryAPIEndpoints:
    """Test ServiceCategory API operations."""

    def test_list_categories(self, authenticated_client, sample_category):
        """Test GET /api/billing/service-categories/ - List all categories."""
        response = authenticated_client.get('/api/billing/service-categories/')

        assert response.status_code == status.HTTP_200_OK

    def test_get_category_detail(self, authenticated_client, sample_category):
        """Test GET /api/billing/service-categories/{id}/ - Get category details."""
        response = authenticated_client.get(f'/api/billing/service-categories/{sample_category.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_category.id
        assert response.data['name'] == sample_category.name
