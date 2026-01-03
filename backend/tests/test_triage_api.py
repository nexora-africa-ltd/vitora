"""
Tests for triage API endpoints.

Following TDD approach: Write tests FIRST, then implement the API.
Sprint 1.5-1.6 Track E: Triage Module MVP - Phase 5
"""

import pytest
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth.models import Permission
from rest_framework import status


@pytest.mark.django_db
class TestTriageAssessmentAPI:
    """Tests for triage assessment CRUD endpoints."""

    def test_list_requires_authentication(self, api_client):
        """Should require authentication for list endpoint."""
        response = api_client.get('/api/triage/assessments/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_requires_authentication(self, api_client):
        """Should require authentication for create endpoint."""
        response = api_client.post('/api/triage/assessments/', {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_requires_perform_triage_permission(self, authenticated_client, sample_encounter):
        """Should require perform_triage permission for create."""
        data = {
            "encounter": sample_encounter.id,
            "chief_complaint": "Test",
            "chief_complaint_category": "OTHER",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "assigned_area": "OPD",
            "arrival_time": timezone.now().isoformat(),
            "triage_start_time": timezone.now().isoformat(),
        }
        
        response = authenticated_client.post('/api/triage/assessments/', data, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_triage_assessment_with_permission(self, authenticated_client, test_user, sample_encounter):
        """Should create triage assessment with valid data and permission."""
        # Grant permission
        permission = Permission.objects.get(codename='perform_triage')
        test_user.user_permissions.add(permission)
        
        data = {
            "encounter": sample_encounter.id,
            "chief_complaint": "Headache",
            "chief_complaint_category": "HEADACHE",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "assigned_area": "OPD",
            "arrival_time": timezone.now().isoformat(),
            "triage_start_time": timezone.now().isoformat(),
        }
        
        response = authenticated_client.post('/api/triage/assessments/', data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert 'auto_calculated_category' in response.data
        assert 'alerts' in response.data

    def test_create_auto_adds_to_queue(self, authenticated_client, test_user, sample_encounter):
        """Should automatically add to queue when creating assessment."""
        from hmis.apps.triage.models import TriageQueue
        
        permission = Permission.objects.get(codename='perform_triage')
        test_user.user_permissions.add(permission)
        
        data = {
            "encounter": sample_encounter.id,
            "chief_complaint": "Test",
            "chief_complaint_category": "OTHER",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "assigned_area": "OPD",
            "arrival_time": timezone.now().isoformat(),
            "triage_start_time": timezone.now().isoformat(),
        }
        
        response = authenticated_client.post('/api/triage/assessments/', data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        
        # Check queue entry exists
        queue_exists = TriageQueue.objects.filter(triage_assessment_id=response.data['id']).exists()
        assert queue_exists

    def test_list_triage_assessments(self, authenticated_client, sample_encounter, test_user):
        """Should list triage assessments with pagination."""
        from hmis.apps.triage.models import TriageAssessment
        
        # Create assessment
        TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        response = authenticated_client.get('/api/triage/assessments/')
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data or isinstance(response.data, list)

    def test_filter_by_triage_category(self, authenticated_client, sample_patient, test_user):
        """Should filter assessments by triage category."""
        from hmis.apps.triage.models import TriageAssessment
        from hmis.apps.encounters.models import Encounter
        
        # Create RED assessment
        encounter1 = Encounter.objects.create(patient=sample_patient, encounter_type="EMERGENCY", chief_complaint="Test 1")
        TriageAssessment.objects.create(
            encounter=encounter1,
            chief_complaint="Critical",
            chief_complaint_category="ALTERED_CONSCIOUSNESS",
            mental_status="U",
            mobility="IMMOBILE",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        # Create GREEN assessment
        encounter2 = Encounter.objects.create(patient=sample_patient, encounter_type="OPD", chief_complaint="Test 2")
        TriageAssessment.objects.create(
            encounter=encounter2,
            chief_complaint="Minor",
            chief_complaint_category="HEADACHE",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        response = authenticated_client.get('/api/triage/assessments/?triage_category=RED')
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get('results', response.data)
        assert len(data) == 1
        assert data[0]['triage_category'] == 'RED'

    def test_retrieve_triage_assessment(self, authenticated_client, sample_encounter, test_user):
        """Should retrieve specific triage assessment."""
        from hmis.apps.triage.models import TriageAssessment
        
        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        response = authenticated_client.get(f'/api/triage/assessments/{assessment.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == assessment.id


@pytest.mark.django_db
class TestCalculateCategoryEndpoint:
    """Tests for calculate-category endpoint."""

    def test_calculate_category_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post('/api/triage/assessments/calculate-category/', {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_calculate_category_returns_result(self, authenticated_client):
        """Should calculate and return category with alerts."""
        data = {
            "mental_status": "A",
            "chief_complaint_category": "HEADACHE",
            "spo2": "98.0",
            "heart_rate": 75,
            "pain_score": 5,
        }
        
        response = authenticated_client.post('/api/triage/assessments/calculate-category/', data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert 'category' in response.data
        assert 'alerts' in response.data

    def test_calculate_category_red_for_critical_vitals(self, authenticated_client):
        """Should return RED for critical vitals."""
        data = {
            "mental_status": "A",
            "chief_complaint_category": "CHEST_PAIN",
            "spo2": "85.0",  # Critical
            "heart_rate": 160,  # Critical
        }
        
        response = authenticated_client.post('/api/triage/assessments/calculate-category/', data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['category'] == 'RED'
        assert len(response.data['alerts']) > 0


@pytest.mark.django_db
class TestVitalThresholdsEndpoints:
    """Tests for vital thresholds endpoints."""

    def test_get_thresholds_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get('/api/triage/vital-thresholds/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_vital_thresholds(self, authenticated_client):
        """Should return all vital thresholds."""
        from hmis.apps.triage.models import TriageVitalThreshold
        
        # Create some thresholds
        TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )
        
        response = authenticated_client.get('/api/triage/vital-thresholds/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_update_thresholds_requires_admin(self, authenticated_client):
        """Should require admin permission to update thresholds."""
        from hmis.apps.triage.models import TriageVitalThreshold
        
        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )
        
        data = {
            "vital_type": "SPO2",
            "critical_low": "85.00",
            "warning_low": "92.00",
        }
        
        response = authenticated_client.put(f'/api/triage/vital-thresholds/{threshold.id}/', data, format='json')
        # Should fail - not admin
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED]


@pytest.mark.django_db
class TestQueueEndpoints:
    """Tests for queue management endpoints."""

    def test_get_queue_requires_permission(self, authenticated_client):
        """Should require view_triage_queue permission."""
        response = authenticated_client.get('/api/triage/queue/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_queue_with_permission(self, authenticated_client, test_user, sample_encounter):
        """Should return active queue with permission."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue
        
        # Grant permission
        permission = Permission.objects.get(codename='view_triage_queue')
        test_user.user_permissions.add(permission)
        
        # Create assessment and queue entry
        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="WAITING",
        )
        
        response = authenticated_client.get('/api/triage/queue/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_queue_excludes_completed(self, authenticated_client, test_user, sample_encounter):
        """Should exclude completed entries from queue."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue
        
        permission = Permission.objects.get(codename='view_triage_queue')
        test_user.user_permissions.add(permission)
        
        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        # Create completed queue entry
        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="COMPLETED",
        )
        
        response = authenticated_client.get('/api/triage/queue/')
        assert response.status_code == status.HTTP_200_OK
        # Completed entries should not appear
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        assert len(data) == 0

    def test_call_patient_endpoint(self, authenticated_client, test_user, sample_encounter):
        """Should mark patient as called."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue
        
        permission = Permission.objects.get(codename='view_triage_queue')
        test_user.user_permissions.add(permission)
        
        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="WAITING",
        )
        
        response = authenticated_client.post(f'/api/triage/queue/{queue_entry.id}/call/')
        assert response.status_code == status.HTTP_200_OK
        
        queue_entry.refresh_from_db()
        assert queue_entry.status == "CALLED"
        assert queue_entry.called_at is not None


@pytest.mark.django_db
class TestReportEndpoints:
    """Tests for report endpoints."""

    def test_wait_times_report(self, authenticated_client, test_user, sample_patient):
        """Should return wait time statistics."""
        from hmis.apps.triage.models import TriageAssessment
        from hmis.apps.encounters.models import Encounter
        from datetime import timedelta
        
        # Create some assessments with different wait times
        for i in range(3):
            encounter = Encounter.objects.create(
                patient=sample_patient,
                encounter_type="OPD",
                chief_complaint=f"Test {i}"
            )
            TriageAssessment.objects.create(
                encounter=encounter,
                chief_complaint="Test",
                chief_complaint_category="OTHER",
                mental_status="A",
                mobility="AMBULATORY",
                triage_category="GREEN",
                auto_calculated_category="GREEN",
                assigned_area="OPD",
                arrival_time=timezone.now() - timedelta(minutes=30+i*10),
                triage_start_time=timezone.now(),
                triaged_by=test_user,
            )
        
        response = authenticated_client.get('/api/triage/reports/wait-times/')
        assert response.status_code == status.HTTP_200_OK
        assert 'average_wait_time' in response.data or 'avg_wait_time' in response.data

    def test_volume_report(self, authenticated_client, test_user, sample_patient):
        """Should return volume counts by category."""
        from hmis.apps.triage.models import TriageAssessment
        from hmis.apps.encounters.models import Encounter
        
        # Create assessments of different categories
        for category in ['RED', 'YELLOW', 'GREEN']:
            encounter = Encounter.objects.create(
                patient=sample_patient,
                encounter_type="OPD",
                chief_complaint=f"Test {category}"
            )
            TriageAssessment.objects.create(
                encounter=encounter,
                chief_complaint="Test",
                chief_complaint_category="OTHER",
                mental_status="A",
                mobility="AMBULATORY",
                triage_category=category,
                auto_calculated_category=category,
                assigned_area="OPD",
                arrival_time=timezone.now(),
                triage_start_time=timezone.now(),
                triaged_by=test_user,
            )
        
        response = authenticated_client.get('/api/triage/reports/volume/')
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, (list, dict))


@pytest.mark.django_db
class TestErrorHandling:
    """Tests for error responses."""

    def test_404_for_nonexistent_assessment(self, authenticated_client):
        """Should return 404 for non-existent assessment."""
        response = authenticated_client.get('/api/triage/99999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_400_for_invalid_data(self, authenticated_client, test_user):
        """Should return 400 for invalid data."""
        permission = Permission.objects.get(codename='perform_triage')
        test_user.user_permissions.add(permission)
        
        data = {
            "chief_complaint": "Test",
            # Missing required fields
        }
        
        response = authenticated_client.post('/api/triage/assessments/', data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
