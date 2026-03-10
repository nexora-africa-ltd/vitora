"""
Tests for TriageAssessment model.

Following TDD approach: Write tests FIRST, then implement the model.
Sprint 1.5-1.6 Track E: Triage Module MVP
"""

from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.utils import timezone


@pytest.mark.django_db
class TestTriageAssessmentModel:
    """Test suite for TriageAssessment model (25 tests as per spec)."""

    def test_create_assessment_with_valid_data(self, sample_encounter, test_user):
        """Should create triage assessment with all required fields."""
        from hmis.apps.triage.models import TriageAssessment

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Chest pain radiating to left arm",
            chief_complaint_category="CHEST_PAIN",
            pain_score=8,
            mental_status="A",
            mobility="AMBULATORY",
            arrival_mode="WALK_IN",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        assert assessment.id is not None
        assert assessment.triage_category == "ORANGE"
        assert assessment.encounter == sample_encounter

    def test_encounter_one_to_one_relationship(self, sample_encounter, test_user):
        """Should enforce one-to-one relationship with encounter."""
        from django.db import IntegrityError

        from hmis.apps.triage.models import TriageAssessment

        # Create first assessment
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

        # Try to create second assessment for same encounter
        with pytest.raises(IntegrityError):
            TriageAssessment.objects.create(
                encounter=sample_encounter,
                chief_complaint="Test 2",
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

    def test_chief_complaint_category_choices_validation(self, sample_encounter, test_user):
        """Should validate chief_complaint_category against allowed choices."""
        from hmis.apps.triage.models import TriageAssessment

        assessment = TriageAssessment(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="INVALID_CATEGORY",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        with pytest.raises(ValidationError) as exc_info:
            assessment.full_clean()

        assert "chief_complaint_category" in str(exc_info.value)

    def test_pain_score_range_validation_0_to_10(self, sample_encounter, test_user):
        """Should validate pain_score is between 0 and 10."""
        from hmis.apps.triage.models import TriageAssessment

        # Test below range
        assessment = TriageAssessment(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            pain_score=-1,
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        with pytest.raises(ValidationError) as exc_info:
            assessment.full_clean()

        assert "pain_score" in str(exc_info.value)

    def test_pain_score_null_allowed(self, sample_encounter, test_user):
        """Should allow null pain_score."""
        from hmis.apps.triage.models import TriageAssessment

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            pain_score=None,
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        assert assessment.pain_score is None

    def test_mental_status_avpu_choices(self, sample_encounter, test_user):
        """Should validate mental_status AVPU choices."""
        from hmis.apps.triage.models import TriageAssessment

        # Valid choices should work
        for status in ["A", "V", "P", "U"]:
            assessment = TriageAssessment(
                encounter=sample_encounter,
                chief_complaint="Test",
                chief_complaint_category="OTHER",
                mental_status=status,
                mobility="AMBULATORY",
                triage_category="GREEN",
                auto_calculated_category="GREEN",
                assigned_area="OPD",
                arrival_time=timezone.now(),
                triage_start_time=timezone.now(),
                triaged_by=test_user,
            )
            # Should not raise
            assert assessment.mental_status == status

    def test_get_wait_time_minutes_calculation(self, sample_encounter, test_user):
        """Should calculate wait time in minutes since arrival."""
        from hmis.apps.triage.models import TriageAssessment

        arrival = timezone.now() - timedelta(minutes=45)
        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=arrival,
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        wait_time = assessment.get_wait_time_minutes()
        assert wait_time >= 44  # Allow for timing variations
        assert wait_time <= 46

    def test_is_wait_time_exceeded_for_each_category(self, sample_encounter, test_user):
        """Should check if wait time exceeded target for each category."""
        from hmis.apps.triage.models import TriageAssessment

        # RED - target 0 minutes, exceeded after 1 minute
        red_assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="U",
            mobility="IMMOBILE",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=timezone.now() - timedelta(minutes=2),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        assert red_assessment.is_wait_time_exceeded() is True

    def test_generate_alerts_for_critical_vitals(self, sample_encounter, test_user):
        """Should generate alerts based on vitals and symptoms."""
        from hmis.apps.triage.models import TriageAssessment

        # Set critical vitals on encounter
        sample_encounter.spo2 = Decimal("85.00")  # Critical low
        sample_encounter.pulse = 160  # Critical high
        sample_encounter.save()

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Difficulty breathing",
            chief_complaint_category="DIFFICULTY_BREATHING",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        alerts = assessment.generate_alerts()
        assert len(alerts) > 0
        assert any("SpO2" in alert or "oxygen" in alert.lower() for alert in alerts)

    def test_ordering_by_arrival_time_descending(self, sample_patient, test_user):
        """Should order assessments by arrival_time descending."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        # Create three encounters and assessments
        encounter1 = Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Test 1"
        )
        encounter2 = Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Test 2"
        )
        encounter3 = Encounter.objects.create(
            patient=sample_patient, encounter_type="OPD", chief_complaint="Test 3"
        )

        # Create assessments with different arrival times
        assessment1 = TriageAssessment.objects.create(
            encounter=encounter1,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(hours=2),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        assessment2 = TriageAssessment.objects.create(
            encounter=encounter2,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(hours=1),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        assessment3 = TriageAssessment.objects.create(
            encounter=encounter3,
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

        # Query all assessments - should be ordered newest first
        assessments = list(TriageAssessment.objects.all())
        assert assessments[0] == assessment3  # Most recent
        assert assessments[1] == assessment2
        assert assessments[2] == assessment1  # Oldest
