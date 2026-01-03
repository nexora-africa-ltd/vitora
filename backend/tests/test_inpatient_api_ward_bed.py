"""
Tests for Ward and Bed API endpoints.

Phase 7a: Ward & Bed Management API (8 tests)
- Ward listing with occupancy data
- Ward detail with bed count
- Bed listing for a ward
- Bed status update
- Bed availability filtering
- Ward search functionality
- Permission checks
- Audit logging
"""

import pytest
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.inpatient.models import Ward, Bed
from hmis.apps.core.models import AuditLog


@pytest.mark.django_db
class TestWardAPI:
    """Tests for Ward API endpoints."""

    def test_list_wards_with_occupancy(self, authenticated_client, sample_inpatient_ward):
        """Should list wards with occupancy data."""
        response = authenticated_client.get('/api/inpatient/wards/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
        ward_data = response.data['results'][0]
        assert 'id' in ward_data
        assert 'name' in ward_data
        assert 'code' in ward_data
        assert 'ward_type' in ward_data
        assert 'capacity' in ward_data
        assert 'available_beds' in ward_data
        assert 'occupancy_rate' in ward_data
        assert 'daily_rate' in ward_data

    def test_get_ward_detail(self, authenticated_client, sample_inpatient_ward):
        """Should retrieve ward details with bed statistics."""
        response = authenticated_client.get(f'/api/inpatient/wards/{sample_inpatient_ward.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_inpatient_ward.id
        assert response.data['name'] == sample_inpatient_ward.name
        assert response.data['code'] == sample_inpatient_ward.code
        assert response.data['ward_type'] == sample_inpatient_ward.ward_type
        assert 'available_beds' in response.data
        assert 'occupancy_rate' in response.data

    def test_list_wards_unauthenticated_fails(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get('/api/inpatient/wards/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_search_wards_by_name(self, authenticated_client, sample_inpatient_ward):
        """Should search wards by name."""
        response = authenticated_client.get('/api/inpatient/wards/', {'search': sample_inpatient_ward.name})
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1


@pytest.mark.django_db
class TestBedAPI:
    """Tests for Bed API endpoints."""

    def test_list_beds_for_ward(self, authenticated_client, sample_inpatient_ward, sample_bed):
        """Should list all beds for a specific ward."""
        response = authenticated_client.get(f'/api/inpatient/wards/{sample_inpatient_ward.id}/beds/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
        bed_data = response.data['results'][0]
        assert 'id' in bed_data
        assert 'bed_number' in bed_data
        assert 'status' in bed_data
        assert bed_data['ward'] == sample_inpatient_ward.id

    def test_get_bed_detail(self, authenticated_client, sample_bed):
        """Should retrieve bed details."""
        response = authenticated_client.get(f'/api/inpatient/beds/{sample_bed.id}/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_bed.id
        assert response.data['bed_number'] == sample_bed.bed_number
        assert response.data['status'] == sample_bed.status

    def test_update_bed_status(self, authenticated_client, sample_bed, test_user):
        """Should update bed status with audit trail."""
        initial_status = sample_bed.status
        new_status = 'MAINTENANCE'
        
        response = authenticated_client.patch(
            f'/api/inpatient/beds/{sample_bed.id}/',
            {'status': new_status, 'notes': 'Equipment repair'},
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == new_status
        
        # Verify bed was updated
        sample_bed.refresh_from_db()
        assert sample_bed.status == new_status
        assert sample_bed.notes == 'Equipment repair'
        
        # Verify audit log created
        audit_log = AuditLog.objects.filter(
            action='bed_status_update',
            resource_type='Bed',
            resource_id=sample_bed.id
        ).first()
        assert audit_log is not None
        assert audit_log.user == test_user

    def test_filter_beds_by_status(self, authenticated_client, sample_inpatient_ward):
        """Should filter beds by availability status."""
        # Create beds with different statuses
        Bed.objects.create(ward=sample_inpatient_ward, bed_number='B-001', status='AVAILABLE')
        Bed.objects.create(ward=sample_inpatient_ward, bed_number='B-002', status='OCCUPIED')
        Bed.objects.create(ward=sample_inpatient_ward, bed_number='B-003', status='AVAILABLE')
        
        response = authenticated_client.get(
            f'/api/inpatient/wards/{sample_inpatient_ward.id}/beds/',
            {'status': 'AVAILABLE'}
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 2
        for bed in response.data['results']:
            assert bed['status'] == 'AVAILABLE'
