"""Tests for triage vitals capture + encounter auto-copy.

TDD (RED): These tests define the expected behavior for Phase 1: Backend - Vitals in TriageAssessment.

Expected changes:
- Add vitals fields to TriageAssessment model + serializers
- Validate vitals ranges on create/update
- Auto-copy vitals from TriageAssessment to Encounter without overwriting existing Encounter vitals
- Track Encounter vitals source metadata (vitals_source, vitals_recorded_by, vitals_recorded_at)
"""

from __future__ import annotations

from decimal import Decimal

import pytest # type: ignore
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework import status


@pytest.mark.django_db
class TestTriageAssessmentVitalsCapture:
    def _grant_perform_triage(self, test_user):
        permission = Permission.objects.get(codename="perform_triage")
        test_user.user_permissions.add(permission)

    def test_create_triage_assessment_accepts_vitals_fields(self, authenticated_client, test_user, sample_encounter):
        """Should accept vitals in request body and return them in response."""
        self._grant_perform_triage(test_user)

        payload = {
            "encounter": sample_encounter.id,
            "arrival_mode": "WALK_IN",
            "arrival_time": timezone.now().isoformat(),
            "chief_complaint_category": "DIFFICULTY_BREATHING",
            "chief_complaint": "Shortness of breath",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "pain_score": 7,
            "assigned_area": "ER_ACUTE",
            "spo2": "94.00",
            "heart_rate": 110,
            "systolic_bp": 160,
            "diastolic_bp": 95,
            "temperature": "37.2",
            "respiratory_rate": 22,
        }

        response = authenticated_client.post("/api/triage/assessments/", payload, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        # Phase 1 expectation: vitals are included as explicit fields in response
        assert response.data["spo2"] == "94.00"
        assert response.data["heart_rate"] == 110
        assert response.data["systolic_bp"] == 160
        assert response.data["diastolic_bp"] == 95
        assert response.data["temperature"] == "37.2"
        assert response.data["respiratory_rate"] == 22

    def test_create_copies_vitals_to_encounter_if_empty(self, authenticated_client, test_user, sample_encounter):
        """On create, vitals should copy to Encounter if Encounter vitals are empty."""
        from hmis.apps.encounters.models import Encounter

        self._grant_perform_triage(test_user)

        # Ensure encounter vitals are empty
        sample_encounter.spo2 = None
        sample_encounter.pulse = None
        sample_encounter.blood_pressure = ""
        sample_encounter.temperature = None
        sample_encounter.respiratory_rate = None
        sample_encounter.save()

        payload = {
            "encounter": sample_encounter.id,
            "arrival_mode": "WALK_IN",
            "arrival_time": timezone.now().isoformat(),
            "chief_complaint_category": "DIFFICULTY_BREATHING",
            "chief_complaint": "Shortness of breath",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "assigned_area": "ER_ACUTE",
            "spo2": "94.00",
            "heart_rate": 110,
            "systolic_bp": 160,
            "diastolic_bp": 95,
            "temperature": "37.2",
            "respiratory_rate": 22,
        }

        response = authenticated_client.post("/api/triage/assessments/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        encounter = Encounter.objects.get(pk=sample_encounter.id)
        assert encounter.spo2 == Decimal("94.00")
        assert encounter.pulse == 110
        assert encounter.blood_pressure == "160/95"
        assert encounter.temperature == Decimal("37.2")
        assert encounter.respiratory_rate == 22

        # Phase 1 expectation: encounter vitals metadata is tracked
        assert encounter.vitals_source == "TRIAGE"
        assert encounter.vitals_recorded_by_id == test_user.id
        assert encounter.vitals_recorded_at is not None

    def test_create_does_not_overwrite_existing_encounter_vitals(self, authenticated_client, test_user, sample_encounter):
        """Existing Encounter vitals must not be overwritten by triage vitals."""
        from hmis.apps.encounters.models import Encounter

        self._grant_perform_triage(test_user)

        sample_encounter.spo2 = Decimal("98.00")
        sample_encounter.pulse = 72
        sample_encounter.blood_pressure = "120/80"
        sample_encounter.temperature = Decimal("36.8")
        sample_encounter.respiratory_rate = 14
        sample_encounter.save()

        payload = {
            "encounter": sample_encounter.id,
            "arrival_mode": "WALK_IN",
            "arrival_time": timezone.now().isoformat(),
            "chief_complaint_category": "DIFFICULTY_BREATHING",
            "chief_complaint": "Shortness of breath",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "assigned_area": "ER_ACUTE",
            "spo2": "90.00",
            "heart_rate": 150,
            "systolic_bp": 180,
            "diastolic_bp": 120,
            "temperature": "40.0",
            "respiratory_rate": 30,
        }

        response = authenticated_client.post("/api/triage/assessments/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        encounter = Encounter.objects.get(pk=sample_encounter.id)
        assert encounter.spo2 == Decimal("98.00")
        assert encounter.pulse == 72
        assert encounter.blood_pressure == "120/80"
        assert encounter.temperature == Decimal("36.8")
        assert encounter.respiratory_rate == 14


@pytest.mark.django_db
class TestTriageVitalsValidation:
    def _grant_perform_triage(self, test_user):
        permission = Permission.objects.get(codename="perform_triage")
        test_user.user_permissions.add(permission)

    @pytest.mark.parametrize(
        "field,value",
        [
            ("spo2", "101.00"),
            ("spo2", "-1.00"),
            ("heart_rate", 301),
            ("heart_rate", -1),
            ("systolic_bp", 301),
            ("systolic_bp", -1),
            ("diastolic_bp", 201),
            ("diastolic_bp", -1),
            ("temperature", "29.9"),
            ("temperature", "45.1"),
            ("respiratory_rate", 61),
            ("respiratory_rate", -1),
        ],
    )
    def test_create_rejects_out_of_range_vitals(self, authenticated_client, test_user, sample_encounter, field, value):
        """Should return 400 with clear field error when vitals are out of range."""
        self._grant_perform_triage(test_user)

        payload = {
            "encounter": sample_encounter.id,
            "arrival_mode": "WALK_IN",
            "arrival_time": timezone.now().isoformat(),
            "chief_complaint_category": "OTHER",
            "chief_complaint": "Test",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "assigned_area": "OPD",
            field: value,
        }

        response = authenticated_client.post("/api/triage/assessments/", payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert field in response.data


@pytest.mark.django_db
class TestTriageCategoryVitalsRules:
    def test_calculate_category_red_for_spo2_below_90(self, authenticated_client):
        payload = {
            "mental_status": "A",
            "chief_complaint_category": "HEADACHE",
            "spo2": "89.0",
        }

        response = authenticated_client.post(
            "/api/triage/assessments/calculate-category/", payload, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["category"] == "RED"

    def test_calculate_category_orange_for_breathing_with_spo2_below_95(self, authenticated_client):
        payload = {
            "mental_status": "A",
            "chief_complaint_category": "DIFFICULTY_BREATHING",
            "spo2": "94.0",
        }

        response = authenticated_client.post(
            "/api/triage/assessments/calculate-category/", payload, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["category"] == "ORANGE"
