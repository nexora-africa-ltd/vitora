"""
Tests for triage API endpoints.

Following TDD approach: Write tests FIRST, then implement the API.
Sprint 1.5-1.6 Track E: Triage Module MVP - Phase 5
"""

from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework import status


@pytest.mark.django_db
class TestTriageAssessmentAPI:
    """Tests for triage assessment CRUD endpoints."""

    def test_list_requires_authentication(self, api_client):
        """Should require authentication for list endpoint."""
        response = api_client.get("/api/triage/assessments/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_requires_authentication(self, api_client):
        """Should require authentication for create endpoint."""
        response = api_client.post("/api/triage/assessments/", {})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_requires_perform_triage_permission(
        self, authenticated_client, sample_encounter
    ):
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

        response = authenticated_client.post("/api/triage/assessments/", data, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_triage_assessment_with_permission(
        self, authenticated_client, test_user, sample_encounter
    ):
        """Should create triage assessment with valid data and permission."""
        # Grant permission
        permission = Permission.objects.get(codename="perform_triage")
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

        response = authenticated_client.post("/api/triage/assessments/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "auto_calculated_category" in response.data
        assert "alerts" in response.data

    def test_create_auto_adds_to_queue(self, authenticated_client, test_user, sample_encounter):
        """Should automatically add to queue when creating assessment."""
        from hmis.apps.triage.models import TriageQueue

        permission = Permission.objects.get(codename="perform_triage")
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

        response = authenticated_client.post("/api/triage/assessments/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        # Check queue entry exists
        queue_exists = TriageQueue.objects.filter(triage_assessment_id=response.data["id"]).exists()
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

        response = authenticated_client.get("/api/triage/assessments/")
        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data or isinstance(response.data, list)

    def test_filter_by_triage_category(self, authenticated_client, sample_patient, test_user, sample_facility, sample_organization):
        """Should filter assessments by triage category."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        # Create RED assessment
        encounter1 = Encounter.objects.create(
            patient=sample_patient, encounter_type="EMERGENCY", chief_complaint="Test 1",
            facility=sample_facility,
        )
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
            facility=sample_facility,
            organization=sample_organization,
        )

        # Create GREEN assessment
        encounter2 = Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Test 2",
            facility=sample_facility,
        )
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
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get("/api/triage/assessments/?triage_category=RED")
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get("results", response.data)
        assert len(data) == 1
        assert data[0]["triage_category"] == "RED"

    def test_retrieve_triage_assessment(self, authenticated_client, sample_encounter, test_user, sample_facility, sample_organization):
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
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get(f"/api/triage/assessments/{assessment.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == assessment.id


@pytest.mark.django_db
class TestCalculateCategoryEndpoint:
    """Tests for calculate-category endpoint."""

    def test_calculate_category_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.post("/api/triage/assessments/calculate-category/", {})
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

        response = authenticated_client.post(
            "/api/triage/assessments/calculate-category/", data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "suggested_category" in response.data
        assert "alerts" in response.data

    def test_calculate_category_red_for_critical_vitals(self, authenticated_client):
        """Should return RED for critical vitals."""
        data = {
            "mental_status": "A",
            "chief_complaint_category": "CHEST_PAIN",
            "spo2": "85.0",  # Critical
            "heart_rate": 160,  # Critical
        }

        response = authenticated_client.post(
            "/api/triage/assessments/calculate-category/", data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["suggested_category"] == "RED"
        assert len(response.data["alerts"]) > 0


@pytest.mark.django_db
class TestVitalThresholdsEndpoints:
    """Tests for vital thresholds endpoints."""

    def test_get_thresholds_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/triage/vital-thresholds/")
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

        response = authenticated_client.get("/api/triage/vital-thresholds/")
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

        response = authenticated_client.put(
            f"/api/triage/vital-thresholds/{threshold.id}/", data, format="json"
        )
        # Should fail - not admin
        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        ]


@pytest.mark.django_db
class TestQueueEndpoints:
    """Tests for queue management endpoints."""

    def test_get_queue_requires_permission(self, authenticated_client):
        """Should require view_triage_queue permission."""
        response = authenticated_client.get("/api/triage/queue/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_queue_with_permission(self, authenticated_client, test_user, sample_encounter):
        """Should return active queue with permission."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        # Grant permission
        permission = Permission.objects.get(codename="view_triage_queue")
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

        response = authenticated_client.get("/api/triage/queue/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_queue_excludes_completed(self, authenticated_client, test_user, sample_encounter):
        """Should exclude completed entries from queue."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        permission = Permission.objects.get(codename="view_triage_queue")
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

        response = authenticated_client.get("/api/triage/queue/")
        assert response.status_code == status.HTTP_200_OK
        # Completed entries should not appear
        data = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        assert len(data) == 0

    def test_call_patient_endpoint(self, authenticated_client, test_user, sample_encounter):
        """Should mark patient as called."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        permission = Permission.objects.get(codename="view_triage_queue")
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

        response = authenticated_client.post(f"/api/triage/queue/{queue_entry.id}/call/")
        assert response.status_code == status.HTTP_200_OK

        queue_entry.refresh_from_db()
        assert queue_entry.status == "CALLED"
        assert queue_entry.called_at is not None


@pytest.mark.django_db
class TestReportEndpoints:
    """Tests for report endpoints."""

    def test_wait_times_report(self, authenticated_client, test_user, sample_patient, sample_facility):
        """Should return wait time statistics."""
        from datetime import timedelta

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        # Create some assessments with different wait times
        for i in range(3):
            encounter = Encounter.objects.create(
                patient=sample_patient, encounter_type="OPD", chief_complaint=f"Test {i}",
                facility=sample_facility,
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
                arrival_time=timezone.now() - timedelta(minutes=30 + i * 10),
                triage_start_time=timezone.now(),
                triaged_by=test_user,
            )

        response = authenticated_client.get("/api/triage/reports/wait-times/")
        assert response.status_code == status.HTTP_200_OK
        assert "avg_wait_minutes" in response.data
        assert "median_wait_minutes" in response.data
        assert "target_met_percentage" in response.data
        assert "by_category" in response.data
        assert "current_queue" in response.data
        assert "completion_time" in response.data
        assert "triage_duration" in response.data

    def test_volume_report(self, authenticated_client, test_user, sample_patient, sample_facility):
        """Should return volume counts by category."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        # Create assessments of different categories
        for category in ["RED", "YELLOW", "GREEN"]:
            encounter = Encounter.objects.create(
                patient=sample_patient, encounter_type="OPD", chief_complaint=f"Test {category}",
                facility=sample_facility,
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

        response = authenticated_client.get("/api/triage/reports/volume/")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, (list, dict))


@pytest.mark.django_db
class TestErrorHandling:
    """Tests for error responses."""

    def test_404_for_nonexistent_assessment(self, authenticated_client):
        """Should return 404 for non-existent assessment."""
        response = authenticated_client.get("/api/triage/99999/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_400_for_invalid_data(self, authenticated_client, test_user):
        """Should return 400 for invalid data."""
        permission = Permission.objects.get(codename="perform_triage")
        test_user.user_permissions.add(permission)

        data = {
            "chief_complaint": "Test",
            # Missing required fields
        }

        response = authenticated_client.post("/api/triage/assessments/", data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestEmergencyModuleEndpoints:
    """Tests for emergency module endpoints (critical patients and zones summary)."""

    def test_critical_patients_requires_authentication(self, api_client):
        """Should require authentication for critical patients endpoint."""
        response = api_client.get("/api/triage/queue/critical/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_critical_patients_returns_empty_when_none(
        self, authenticated_client, test_user
    ):
        """Should return empty list when no critical patients."""
        permission = Permission.objects.get(codename="view_triage_queue")
        test_user.user_permissions.add(permission)

        response = authenticated_client.get("/api/triage/queue/critical/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 0
        assert response.data["patients"] == []

    def test_critical_patients_returns_red_patients_in_er(
        self, authenticated_client, test_user, sample_patient,
        sample_facility,
    ):
        """Should return RED category patients in ER areas."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        permission = Permission.objects.get(codename="view_triage_queue")
        test_user.user_permissions.add(permission)

        # Create an encounter and RED triage assessment in ER_RESUS
        encounter = Encounter.objects.create(
            patient=sample_patient, encounter_type="EMERGENCY", chief_complaint="Chest Pain",
            facility=sample_facility,
        )
        assessment = TriageAssessment.objects.create(
            encounter=encounter,
            chief_complaint="Chest Pain",
            chief_complaint_category="CHEST_PAIN",
            mental_status="A",
            mobility="STRETCHER",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        TriageQueue.objects.create(
            triage_assessment=assessment,
            status="WAITING",
            position=1,  # Required field
        )

        response = authenticated_client.get("/api/triage/queue/critical/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert len(response.data["patients"]) == 1
        assert response.data["patients"][0]["assigned_area"] == "ER_RESUS"
        assert response.data["patients"][0]["patient_name"] == f"{sample_patient.first_name} {sample_patient.last_name}"

    def test_zones_summary_requires_authentication(self, api_client):
        """Should require authentication for zones summary endpoint."""
        response = api_client.get("/api/triage/queue/zones-summary/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_zones_summary_returns_all_zones(self, authenticated_client, test_user):
        """Should return summary for all ER zones."""
        permission = Permission.objects.get(codename="view_triage_queue")
        test_user.user_permissions.add(permission)

        response = authenticated_client.get("/api/triage/queue/zones-summary/")
        assert response.status_code == status.HTTP_200_OK
        assert "zones" in response.data
        assert "total_patients" in response.data
        assert len(response.data["zones"]) == 7  # 7 ER zones

        # Verify zone structure
        zone = response.data["zones"][0]
        assert "code" in zone
        assert "name" in zone
        assert "capacity" in zone
        assert "total" in zone
        assert "primary_category" in zone
        assert "by_category" in zone

    def test_zones_summary_counts_patients_correctly(
        self, authenticated_client, test_user, sample_patient,
        sample_facility,
    ):
        """Should correctly count patients per zone and category."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        permission = Permission.objects.get(codename="view_triage_queue")
        test_user.user_permissions.add(permission)

        # Create 2 patients in ER_ACUTE with ORANGE category
        for i in range(2):
            encounter = Encounter.objects.create(
                patient=sample_patient,
                encounter_type="EMERGENCY",
                chief_complaint=f"Pain {i}",
                facility=sample_facility,
            )
            assessment = TriageAssessment.objects.create(
                encounter=encounter,
                chief_complaint=f"Pain {i}",
                chief_complaint_category="OTHER",
                mental_status="A",
                mobility="AMBULATORY",
                triage_category="ORANGE",
                auto_calculated_category="ORANGE",
                assigned_area="ER_ACUTE",
                arrival_time=timezone.now(),
                triage_start_time=timezone.now(),
                triaged_by=test_user,
            )
            TriageQueue.objects.create(
                triage_assessment=assessment,
                status="WAITING",
                position=i + 1,  # Required field
            )

        response = authenticated_client.get("/api/triage/queue/zones-summary/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_patients"] == 2

        # Find ER_ACUTE zone
        acute_zone = next(z for z in response.data["zones"] if z["code"] == "ER_ACUTE")
        assert acute_zone["total"] == 2
        assert acute_zone["by_category"]["ORANGE"] == 2
        assert acute_zone["primary_category"] == "ORANGE"
