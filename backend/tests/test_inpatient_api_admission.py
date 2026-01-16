"""
Tests for Admission API endpoints (Phase 7b).

Tests AdmissionRecommendation and Admission ViewSets with:
- CRUD operations
- Workflow methods (accept/decline recommendation)
- Filtering and search
- Audit logging
- Authentication requirements
"""


import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from hmis.apps.inpatient.models import (
    AdmissionRecommendation,
)

User = get_user_model()


@pytest.mark.django_db
class TestAdmissionRecommendationAPI:
    """Test suite for AdmissionRecommendation API endpoints."""

    def test_list_admission_recommendations_requires_auth(self, api_client):
        """Should require authentication to list recommendations."""
        response = api_client.get('/api/inpatient/admission-recommendations/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_admission_recommendations(
        self, authenticated_client, sample_admission_recommendation
    ):
        """Should list all admission recommendations."""
        response = authenticated_client.get('/api/inpatient/admission-recommendations/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
        assert response.data['results'][0]['id'] == sample_admission_recommendation.id

    def test_create_admission_recommendation(
        self, authenticated_client, test_user, sample_encounter, sample_inpatient_ward
    ):
        """Should create new admission recommendation."""
        data = {
            'encounter': sample_encounter.id,
            'recommended_by': test_user.id,
            'reason': 'Suspected pneumonia requiring hospitalization',
            'provisional_diagnosis': 'J18.9',
            'provisional_diagnosis_text': 'Pneumonia, unspecified',
            'urgency': 'URGENT',
            'preferred_ward_type': sample_inpatient_ward.ward_type,
        }

        response = authenticated_client.post(
            '/api/inpatient/admission-recommendations/',
            data,
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['status'] == 'PENDING'
        assert response.data['reason'] == data['reason']

        # Verify expiry is set (default 24 hours)
        recommendation = AdmissionRecommendation.objects.get(id=response.data['id'])
        assert recommendation.expires_at is not None

    def test_retrieve_admission_recommendation(
        self, authenticated_client, sample_admission_recommendation
    ):
        """Should retrieve admission recommendation details."""
        response = authenticated_client.get(
            f'/api/inpatient/admission-recommendations/{sample_admission_recommendation.id}/'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_admission_recommendation.id
        assert 'is_expired' in response.data

    def test_accept_admission_recommendation(
        self, authenticated_client, test_user, sample_admission_recommendation
    ):
        """Should accept pending recommendation."""
        response = authenticated_client.post(
            f'/api/inpatient/admission-recommendations/{sample_admission_recommendation.id}/accept/',
            {'user': test_user.id},
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'ACCEPTED'

        # Verify model updated
        sample_admission_recommendation.refresh_from_db()
        assert sample_admission_recommendation.status == 'ACCEPTED'
        assert sample_admission_recommendation.resolved_by == test_user

    def test_decline_admission_recommendation(
        self, authenticated_client, test_user, sample_admission_recommendation
    ):
        """Should decline pending recommendation with reason."""
        response = authenticated_client.post(
            f'/api/inpatient/admission-recommendations/{sample_admission_recommendation.id}/decline/',
            {
                'user': test_user.id,
                'reason': 'Patient condition improved, no longer requires admission'
            },
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'DECLINED'

        # Verify model updated
        sample_admission_recommendation.refresh_from_db()
        assert sample_admission_recommendation.status == 'DECLINED'
        assert sample_admission_recommendation.decline_reason is not None

    def test_filter_recommendations_by_status(
        self, authenticated_client, sample_admission_recommendation
    ):
        """Should filter recommendations by status."""
        response = authenticated_client.get(
            '/api/inpatient/admission-recommendations/?status=PENDING'
        )

        assert response.status_code == status.HTTP_200_OK
        for rec in response.data['results']:
            assert rec['status'] == 'PENDING'


@pytest.mark.django_db
class TestAdmissionAPI:
    """Test suite for Admission API endpoints."""

    def test_list_admissions_requires_auth(self, api_client):
        """Should require authentication to list admissions."""
        response = api_client.get('/api/inpatient/admissions/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_admissions(self, authenticated_client, sample_admission):
        """Should list all admissions."""
        response = authenticated_client.get('/api/inpatient/admissions/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
        assert response.data['results'][0]['id'] == sample_admission.id

    def test_create_admission(
        self, authenticated_client, test_user, sample_patient, sample_encounter,
        sample_inpatient_ward, sample_bed, sample_admission_recommendation
    ):
        """Should create new admission with auto-generated admission number."""
        data = {
            'patient': sample_patient.id,
            'opd_encounter': sample_encounter.id,
            'recommendation': sample_admission_recommendation.id,
            'admission_date': timezone.now().isoformat(),
            'admitting_diagnosis': 'J18.9',
            'admitting_diagnosis_text': 'Pneumonia, unspecified',
            'admitting_officer': test_user.id,
            'attending_doctor': test_user.id,
            'ward': sample_inpatient_ward.id,
            'bed': sample_bed.id,
            'payer_type': 'SHA',
            'insurance_details': {'policy_number': 'SHA-12345'},
        }

        response = authenticated_client.post(
            '/api/inpatient/admissions/',
            data,
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['admission_number'].startswith('ADM-')
        assert response.data['admission_status'] == 'ACTIVE'

        # Verify bed status updated
        sample_bed.refresh_from_db()
        assert sample_bed.status == 'OCCUPIED'

    def test_retrieve_admission_with_length_of_stay(
        self, authenticated_client, sample_admission
    ):
        """Should retrieve admission with computed length_of_stay."""
        response = authenticated_client.get(
            f'/api/inpatient/admissions/{sample_admission.id}/'
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == sample_admission.id
        assert 'length_of_stay' in response.data
        assert isinstance(response.data['length_of_stay'], int)

    def test_filter_admissions_by_ward(
        self, authenticated_client, sample_admission, sample_inpatient_ward
    ):
        """Should filter admissions by ward."""
        response = authenticated_client.get(
            f'/api/inpatient/admissions/?ward={sample_inpatient_ward.id}'
        )

        assert response.status_code == status.HTTP_200_OK
        for admission in response.data['results']:
            assert admission['ward'] == sample_inpatient_ward.id

    def test_filter_admissions_by_status(
        self, authenticated_client, sample_admission
    ):
        """Should filter admissions by admission status."""
        response = authenticated_client.get(
            '/api/inpatient/admissions/?admission_status=ACTIVE'
        )

        assert response.status_code == status.HTTP_200_OK
        for admission in response.data['results']:
            assert admission['admission_status'] == 'ACTIVE'
