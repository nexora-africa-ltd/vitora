"""
Tests for triage serializers.

Following TDD approach: Write tests FIRST, then implement serializers.
Sprint 1.5-1.6 Track E: Triage Module MVP
"""

from decimal import Decimal

import pytest
from django.utils import timezone


@pytest.mark.django_db
class TestTriageVitalThresholdSerializer:
    """Tests for TriageVitalThresholdSerializer."""

    def test_serialize_threshold(self):
        """Should serialize threshold with all fields."""
        from hmis.apps.triage.models import TriageVitalThreshold
        from hmis.apps.triage.serializers import TriageVitalThresholdSerializer

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
            is_active=True,
        )

        serializer = TriageVitalThresholdSerializer(threshold)
        data = serializer.data

        assert data["vital_type"] == "SPO2"
        assert data["critical_low"] == "90.00"
        assert data["warning_low"] == "95.00"
        assert data["is_active"] is True

    def test_deserialize_threshold(self):
        """Should deserialize and create threshold."""
        from hmis.apps.triage.serializers import TriageVitalThresholdSerializer

        data = {
            "vital_type": "HEART_RATE",
            "critical_low": "40.00",
            "critical_high": "150.00",
            "warning_low": "50.00",
            "warning_high": "100.00",
        }

        serializer = TriageVitalThresholdSerializer(data=data)
        assert serializer.is_valid()
        threshold = serializer.save()

        assert threshold.vital_type == "HEART_RATE"
        assert threshold.critical_low == Decimal("40.00")


@pytest.mark.django_db
class TestTriageAssessmentSerializer:
    """Tests for TriageAssessmentSerializer."""

    def test_serialize_assessment_with_patient_info(self, sample_encounter, test_user):
        """Should serialize assessment with nested patient information."""
        from hmis.apps.triage.models import TriageAssessment
        from hmis.apps.triage.serializers import TriageAssessmentSerializer

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Chest pain",
            chief_complaint_category="CHEST_PAIN",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        serializer = TriageAssessmentSerializer(assessment)
        data = serializer.data

        assert "patient_name" in data
        assert "patient_mrn" in data
        assert data["chief_complaint"] == "Chest pain"
        assert data["triage_category"] == "ORANGE"

    def test_serialize_includes_wait_time(self, sample_encounter, test_user):
        """Should include calculated wait_time_minutes."""
        from datetime import timedelta

        from hmis.apps.triage.models import TriageAssessment
        from hmis.apps.triage.serializers import TriageAssessmentSerializer

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(minutes=30),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        serializer = TriageAssessmentSerializer(assessment)
        data = serializer.data

        assert "wait_time_minutes" in data
        assert data["wait_time_minutes"] >= 29


@pytest.mark.django_db
class TestTriageAssessmentCreateSerializer:
    """Tests for TriageAssessmentCreateSerializer."""

    def test_create_assessment_auto_calculates_category(self, sample_encounter, test_user):
        """Should auto-calculate category when creating."""
        from hmis.apps.triage.serializers import TriageAssessmentCreateSerializer

        # Set critical vitals on encounter
        sample_encounter.spo2 = Decimal("85.00")
        sample_encounter.save()

        data = {
            "encounter": sample_encounter.id,
            "chief_complaint": "Difficulty breathing",
            "chief_complaint_category": "DIFFICULTY_BREATHING",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "arrival_mode": "WALK_IN",
            "assigned_area": "ER_RESUS",
            "arrival_time": timezone.now().isoformat(),
            "triage_start_time": timezone.now().isoformat(),
        }

        serializer = TriageAssessmentCreateSerializer(data=data, context={"request": type("obj", (object,), {"user": test_user})()})
        assert serializer.is_valid(), serializer.errors
        assessment = serializer.save()

        assert assessment.auto_calculated_category == "RED"
        assert len(assessment.alerts) > 0

    def test_create_assessment_adds_to_queue(self, sample_encounter, test_user):
        """Should automatically add to queue when creating."""
        from hmis.apps.triage.models import TriageQueue
        from hmis.apps.triage.serializers import TriageAssessmentCreateSerializer

        data = {
            "encounter": sample_encounter.id,
            "chief_complaint": "Headache",
            "chief_complaint_category": "HEADACHE",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "arrival_mode": "WALK_IN",
            "assigned_area": "OPD",
            "arrival_time": timezone.now().isoformat(),
            "triage_start_time": timezone.now().isoformat(),
        }

        serializer = TriageAssessmentCreateSerializer(data=data, context={"request": type("obj", (object,), {"user": test_user})()})
        assert serializer.is_valid()
        assessment = serializer.save()

        # Check queue entry exists
        queue_entry = TriageQueue.objects.filter(triage_assessment=assessment).first()
        assert queue_entry is not None
        assert queue_entry.status == "WAITING"

    def test_validate_override_reason_required(self, sample_encounter, test_user):
        """Should require category_override_reason if category differs from auto-calculated."""
        from hmis.apps.triage.serializers import TriageAssessmentCreateSerializer

        # Set vitals that would calculate to RED
        sample_encounter.spo2 = Decimal("85.00")
        sample_encounter.save()

        data = {
            "encounter": sample_encounter.id,
            "chief_complaint": "Test",
            "chief_complaint_category": "OTHER",
            "mental_status": "A",
            "mobility": "AMBULATORY",
            "triage_category": "YELLOW",  # Override to YELLOW
            "arrival_mode": "WALK_IN",
            "assigned_area": "OPD",
            "arrival_time": timezone.now().isoformat(),
            "triage_start_time": timezone.now().isoformat(),
        }

        serializer = TriageAssessmentCreateSerializer(data=data, context={"request": type("obj", (object,), {"user": test_user})()})
        # Should fail validation - no override reason
        assert not serializer.is_valid()
        assert "category_override_reason" in serializer.errors or "non_field_errors" in serializer.errors


@pytest.mark.django_db
class TestTriageQueueSerializer:
    """Tests for TriageQueueSerializer."""

    def test_serialize_queue_with_nested_assessment(self, sample_encounter, test_user):
        """Should serialize queue entry with flattened assessment data."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue
        from hmis.apps.triage.serializers import TriageQueueSerializer

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

        serializer = TriageQueueSerializer(queue_entry)
        data = serializer.data

        assert data["position"] == 1
        assert data["status"] == "WAITING"
        # Assessment data is flattened, not nested
        assert data["triage_category"] == "GREEN"
        assert data["chief_complaint"] == "Test"
        assert data["assigned_area"] == "OPD"
        assert "patient_name" in data
        assert "patient_mrn" in data


@pytest.mark.django_db
class TestTriageCategoryCalculationSerializer:
    """Tests for TriageCategoryCalculationSerializer."""

    def test_validate_vitals_data(self):
        """Should validate vital signs data."""
        from hmis.apps.triage.serializers import TriageCategoryCalculationSerializer

        data = {
            "spo2": "98.5",
            "heart_rate": 75,
            "systolic_bp": 120,
            "mental_status": "A",
            "chief_complaint_category": "HEADACHE",
        }

        serializer = TriageCategoryCalculationSerializer(data=data)
        assert serializer.is_valid()

    def test_mental_status_required(self):
        """Should require mental_status field."""
        from hmis.apps.triage.serializers import TriageCategoryCalculationSerializer

        data = {
            "spo2": "98.5",
            "chief_complaint_category": "HEADACHE",
        }

        serializer = TriageCategoryCalculationSerializer(data=data)
        assert not serializer.is_valid()
        assert "mental_status" in serializer.errors

    def test_pain_score_validation(self):
        """Should validate pain_score is between 0-10."""
        from hmis.apps.triage.serializers import TriageCategoryCalculationSerializer

        data = {
            "mental_status": "A",
            "chief_complaint_category": "OTHER",
            "pain_score": 15,  # Invalid
        }

        serializer = TriageCategoryCalculationSerializer(data=data)
        assert not serializer.is_valid()
        assert "pain_score" in serializer.errors
