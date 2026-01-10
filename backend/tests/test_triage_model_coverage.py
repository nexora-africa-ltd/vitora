"""
Additional tests to improve triage model coverage.

Targets uncovered lines in:
- TriageAssessment.calculate_triage_category() 
- TriageAssessment.generate_alerts()
- TriageAssessment.is_wait_time_exceeded()
- WaitingQueue methods
"""

import pytest # type: ignore
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone

from hmis.apps.triage.models import WaitingQueue, TriageAssessment, TriageVitalThreshold


@pytest.mark.django_db
class TestWaitingQueueMethods:
    """Tests for WaitingQueue model methods."""

    def test_cancel_with_reason(self, sample_patient, sample_encounter, test_user):
        """cancel() should update status and append reason to notes."""
        wq = WaitingQueue.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status="WAITING_TRIAGE",
            reason_for_visit="Test",
            checked_in_by=test_user,
            notes="Initial notes",
        )

        wq.cancel(reason="Patient left without being seen")
        wq.refresh_from_db()

        assert wq.status == "CANCELLED"
        assert "Patient left without being seen" in wq.notes

    def test_cancel_without_reason(self, sample_patient, sample_encounter, test_user):
        """cancel() without reason should just update status."""
        wq = WaitingQueue.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status="WAITING_TRIAGE",
            reason_for_visit="Test",
            checked_in_by=test_user,
        )

        wq.cancel()
        wq.refresh_from_db()

        assert wq.status == "CANCELLED"

    def test_complete_triage(self, sample_patient, sample_encounter, test_user):
        """complete_triage() should change status to TRIAGED."""
        wq = WaitingQueue.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            status="IN_TRIAGE",
            reason_for_visit="Test",
            checked_in_by=test_user,
        )

        wq.complete_triage()
        wq.refresh_from_db()

        assert wq.status == "TRIAGED"


@pytest.mark.django_db
class TestTriageVitalThresholdModel:
    """Tests for TriageVitalThreshold model methods."""

    def test_check_value_critical_low(self):
        """check_value() should return 'critical' for values below critical_low."""
        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )

        result = threshold.check_value(Decimal("85.00"))
        assert result == "critical"

    def test_check_value_critical_high(self):
        """check_value() should return 'critical' for values above critical_high."""
        threshold = TriageVitalThreshold.objects.create(
            vital_type="HEART_RATE",
            critical_high=Decimal("150.00"),
            warning_high=Decimal("100.00"),
        )

        result = threshold.check_value(Decimal("160.00"))
        assert result == "critical"

    def test_check_value_warning_low(self):
        """check_value() should return 'warning' for values below warning_low."""
        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )

        result = threshold.check_value(Decimal("92.00"))
        assert result == "warning"

    def test_check_value_warning_high(self):
        """check_value() should return 'warning' for values above warning_high."""
        threshold = TriageVitalThreshold.objects.create(
            vital_type="HEART_RATE",
            critical_high=Decimal("150.00"),
            warning_high=Decimal("100.00"),
        )

        result = threshold.check_value(Decimal("110.00"))
        assert result == "warning"

    def test_check_value_normal(self):
        """check_value() should return 'normal' for values within range."""
        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )

        result = threshold.check_value(Decimal("98.00"))
        assert result == "normal"

    def test_check_value_none(self):
        """check_value() should return 'normal' for None."""
        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
        )

        result = threshold.check_value(None)
        assert result == "normal"

    def test_get_defaults(self):
        """get_defaults() should return dictionary with all vital types."""
        defaults = TriageVitalThreshold.get_defaults()

        assert "SPO2" in defaults
        assert "SYSTOLIC_BP" in defaults
        assert "HEART_RATE" in defaults
        assert defaults["SPO2"]["critical_low"] == 90

    def test_str_representation(self):
        """__str__ should return formatted threshold name."""
        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
        )

        assert "Threshold" in str(threshold)


@pytest.mark.django_db
class TestTriageAssessmentMethods:
    """Tests for TriageAssessment model methods."""

    @pytest.fixture
    def triage_assessment(self, sample_encounter, test_user):
        """Create a base triage assessment for testing."""
        now = timezone.now()
        return TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test complaint",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=now - timedelta(hours=1),
            triage_start_time=now - timedelta(minutes=55),
            triaged_by=test_user,
        )

    def test_calculate_category_red_for_unresponsive(self, sample_encounter, test_user):
        """Should return RED for unresponsive patient (AVPU=U)."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Found unresponsive",
            chief_complaint_category="ALTERED_CONSCIOUSNESS",
            mental_status="U",  # Unresponsive
            mobility="IMMOBILE",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "RED"

    def test_calculate_category_red_for_pain_responsive(self, sample_encounter, test_user):
        """Should return RED for patient only responding to pain (AVPU=P)."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Altered consciousness",
            chief_complaint_category="ALTERED_CONSCIOUSNESS",
            mental_status="P",  # Pain responsive
            mobility="STRETCHER",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "RED"

    def test_calculate_category_red_for_low_spo2(self, sample_encounter, test_user):
        """Should return RED for SpO2 < 90%."""
        # Update encounter with critical SpO2
        sample_encounter.spo2 = Decimal("85.00")
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Difficulty breathing",
            chief_complaint_category="DIFFICULTY_BREATHING",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "RED"

    def test_calculate_category_red_for_low_bp(self, sample_encounter, test_user):
        """Should return RED for systolic BP < 90."""
        sample_encounter.blood_pressure = "85/60"
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Feeling faint",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "RED"

    def test_calculate_category_red_for_high_bp(self, sample_encounter, test_user):
        """Should return RED for systolic BP > 180."""
        sample_encounter.blood_pressure = "200/110"
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Severe headache",
            chief_complaint_category="HEADACHE",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "RED"

    def test_calculate_category_red_for_bradycardia(self, sample_encounter, test_user):
        """Should return RED for heart rate < 40."""
        sample_encounter.pulse = 35
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Feeling weak",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "RED"

    def test_calculate_category_red_for_tachycardia(self, sample_encounter, test_user):
        """Should return RED for heart rate > 150."""
        sample_encounter.pulse = 160
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Palpitations",
            chief_complaint_category="CHEST_PAIN",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "RED"

    def test_calculate_category_orange_for_chest_pain_high_bp(
        self, sample_encounter, test_user
    ):
        """Should return ORANGE for chest pain with systolic BP > 140."""
        sample_encounter.blood_pressure = "150/95"
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Chest pain",
            chief_complaint_category="CHEST_PAIN",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "ORANGE"

    def test_calculate_category_orange_for_severe_pain(self, sample_encounter, test_user):
        """Should return ORANGE for pain score >= 9."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Severe abdominal pain",
            chief_complaint_category="ABDOMINAL_PAIN",
            mental_status="A",
            mobility="STRETCHER",
            pain_score=9,
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "ORANGE"

    def test_calculate_category_orange_for_breathing_difficulty_low_spo2(
        self, sample_encounter, test_user
    ):
        """Should return ORANGE for breathing difficulty with SpO2 < 95."""
        sample_encounter.spo2 = Decimal("93.00")
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Shortness of breath",
            chief_complaint_category="DIFFICULTY_BREATHING",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "ORANGE"

    def test_calculate_category_yellow_for_moderate_pain(
        self, sample_encounter, test_user
    ):
        """Should return YELLOW for pain score 7-8."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Moderate pain",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            pain_score=7,
            triage_category="YELLOW",
            auto_calculated_category="YELLOW",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "YELLOW"

    def test_calculate_category_yellow_for_fever_with_low_spo2(
        self, sample_encounter, test_user
    ):
        """Should return YELLOW for fever with SpO2 < 95."""
        sample_encounter.spo2 = Decimal("94.00")
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Fever and cough",
            chief_complaint_category="FEVER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="YELLOW",
            auto_calculated_category="YELLOW",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "YELLOW"

    def test_calculate_category_green_for_fever(self, sample_encounter, test_user):
        """Should return GREEN for simple fever."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Mild fever",
            chief_complaint_category="FEVER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "GREEN"

    def test_calculate_category_green_for_headache(self, sample_encounter, test_user):
        """Should return GREEN for simple headache."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Mild headache",
            chief_complaint_category="HEADACHE",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "GREEN"

    def test_calculate_category_blue_for_non_urgent(self, sample_encounter, test_user):
        """Should return BLUE for non-urgent cases."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Routine checkup",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="BLUE",
            auto_calculated_category="BLUE",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        result = triage.calculate_triage_category()
        assert result == "BLUE"

    def test_calculate_category_handles_invalid_bp_format(
        self, sample_encounter, test_user
    ):
        """Should handle invalid blood pressure format gracefully."""
        sample_encounter.blood_pressure = "invalid"
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="BLUE",
            auto_calculated_category="BLUE",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        # Should not raise exception
        result = triage.calculate_triage_category()
        assert result == "BLUE"

    def test_get_wait_time_minutes(self, triage_assessment):
        """get_wait_time_minutes() should return approximate minutes since arrival."""
        wait_time = triage_assessment.get_wait_time_minutes()
        # Arrived 1 hour ago
        assert wait_time >= 58  # Allow for test execution time

    def test_is_wait_time_exceeded_true(self, sample_encounter, test_user):
        """is_wait_time_exceeded() should return True when wait time exceeded."""
        now = timezone.now()
        # GREEN category has 240 min target wait time
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=now - timedelta(hours=5),  # 5 hours ago
            triage_start_time=now - timedelta(hours=5),
            triaged_by=test_user,
        )

        assert triage.is_wait_time_exceeded() is True

    def test_is_wait_time_exceeded_false(self, sample_encounter, test_user):
        """is_wait_time_exceeded() should return False when within target."""
        now = timezone.now()
        # GREEN category has 240 min target wait time
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=now - timedelta(hours=1),  # 1 hour ago
            triage_start_time=now - timedelta(hours=1),
            triaged_by=test_user,
        )

        assert triage.is_wait_time_exceeded() is False

    def test_generate_alerts_unresponsive(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for unresponsive."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Found unresponsive",
            chief_complaint_category="ALTERED_CONSCIOUSNESS",
            mental_status="U",
            mobility="IMMOBILE",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("unresponsive" in a.lower() for a in alerts)

    def test_generate_alerts_pain_responsive(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for pain responsive."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Altered consciousness",
            chief_complaint_category="ALTERED_CONSCIOUSNESS",
            mental_status="P",
            mobility="STRETCHER",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("pain" in a.lower() for a in alerts)

    def test_generate_alerts_voice_responsive(self, sample_encounter, test_user):
        """generate_alerts() should include warning for voice responsive."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Drowsy",
            chief_complaint_category="OTHER",
            mental_status="V",
            mobility="WHEELCHAIR",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("voice" in a.lower() for a in alerts)

    def test_generate_alerts_hypoxemia(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for severe hypoxemia."""
        sample_encounter.spo2 = Decimal("85.00")
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Difficulty breathing",
            chief_complaint_category="DIFFICULTY_BREATHING",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("hypoxemia" in a.lower() for a in alerts)

    def test_generate_alerts_low_spo2_warning(self, sample_encounter, test_user):
        """generate_alerts() should include warning for low SpO2 (90-95%)."""
        sample_encounter.spo2 = Decimal("92.00")
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Mild breathing issue",
            chief_complaint_category="DIFFICULTY_BREATHING",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="YELLOW",
            auto_calculated_category="YELLOW",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("oxygen saturation" in a.lower() for a in alerts)

    def test_generate_alerts_bradycardia(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for severe bradycardia."""
        sample_encounter.pulse = 35
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Feeling weak",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("bradycardia" in a.lower() for a in alerts)

    def test_generate_alerts_tachycardia(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for severe tachycardia."""
        sample_encounter.pulse = 160
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Palpitations",
            chief_complaint_category="CHEST_PAIN",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("tachycardia" in a.lower() for a in alerts)

    def test_generate_alerts_hypotension(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for severe hypotension."""
        sample_encounter.blood_pressure = "80/50"
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Feeling faint",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("hypotension" in a.lower() for a in alerts)

    def test_generate_alerts_hypertension(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for severe hypertension."""
        sample_encounter.blood_pressure = "200/110"
        sample_encounter.save()

        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Severe headache",
            chief_complaint_category="HEADACHE",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("hypertension" in a.lower() for a in alerts)

    def test_generate_alerts_severe_pain(self, sample_encounter, test_user):
        """generate_alerts() should include critical alert for severe pain."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Severe pain",
            chief_complaint_category="ABDOMINAL_PAIN",
            mental_status="A",
            mobility="STRETCHER",
            pain_score=10,
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("severe pain" in a.lower() for a in alerts)

    def test_generate_alerts_chest_pain(self, sample_encounter, test_user):
        """generate_alerts() should include alert for chest pain."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Chest pain",
            chief_complaint_category="CHEST_PAIN",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("chest pain" in a.lower() for a in alerts)

    def test_generate_alerts_difficulty_breathing(self, sample_encounter, test_user):
        """generate_alerts() should include alert for difficulty breathing."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Shortness of breath",
            chief_complaint_category="DIFFICULTY_BREATHING",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("breathing" in a.lower() for a in alerts)

    def test_generate_alerts_altered_consciousness(self, sample_encounter, test_user):
        """generate_alerts() should include alert for altered consciousness."""
        now = timezone.now()
        triage = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Confused",
            chief_complaint_category="ALTERED_CONSCIOUSNESS",
            mental_status="A",
            mobility="WHEELCHAIR",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        alerts = triage.generate_alerts()
        assert any("neurological" in a.lower() for a in alerts)

    def test_category_priority_property(self, triage_assessment):
        """category_priority should return numeric priority."""
        assert triage_assessment.category_priority == 4  # GREEN

    def test_str_representation(self, triage_assessment):
        """__str__ should return formatted string."""
        result = str(triage_assessment)
        assert "Triage" in result
        assert "GREEN" in result
