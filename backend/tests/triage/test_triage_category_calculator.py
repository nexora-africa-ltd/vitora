"""
Tests for TriageCategoryCalculator service.

Following TDD approach: Write tests FIRST, then implement the service.
Sprint 1.5-1.6 Track E: Triage Module MVP
"""


class TestTriageCategoryCalculator:
    """Test suite for TriageCategoryCalculator service (20 tests as per spec)."""

    def test_calculator_initialization_with_defaults(self):
        """Should initialize with default thresholds."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()

        assert calculator.thresholds is not None
        assert "SPO2" in calculator.thresholds
        assert calculator.thresholds["SPO2"]["critical_low"] == 90

    def test_calculator_initialization_with_custom_thresholds(self):
        """Should initialize with custom thresholds."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        custom_thresholds = {
            "SPO2": {"critical_low": 85, "warning_low": 92},
        }
        calculator = TriageCategoryCalculator(thresholds=custom_thresholds)

        assert calculator.thresholds == custom_thresholds
        assert calculator.thresholds["SPO2"]["critical_low"] == 85

    def test_red_for_unresponsive_patient(self):
        """Should return RED for unresponsive (AVPU=U) patient."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 98, "heart_rate": 80}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="U",
            chief_complaint_category="OTHER",
        )

        assert category == "RED"
        assert any("unresponsive" in alert["message"].lower() for alert in alerts)

    def test_red_for_responds_to_pain_only(self):
        """Should return RED for responds to pain only (AVPU=P)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 96, "heart_rate": 85}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="P",
            chief_complaint_category="OTHER",
        )

        assert category == "RED"
        assert any("pain" in alert["message"].lower() for alert in alerts)

    def test_red_for_critical_spo2(self):
        """Should return RED for SpO2 < 90%."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 85}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="DIFFICULTY_BREATHING",
        )

        assert category == "RED"
        assert any("spo2" in alert["message"].lower() or "oxygen" in alert["message"].lower() for alert in alerts)

    def test_red_for_severe_hypotension(self):
        """Should return RED for severe hypotension (systolic < 90)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"systolic_bp": 85, "diastolic_bp": 55}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="OTHER",
        )

        assert category == "RED"
        assert any(
            "hypotension" in alert["message"].lower() or "blood pressure" in alert["message"].lower() for alert in alerts
        )

    def test_red_for_severe_hypertension(self):
        """Should return RED for severe hypertension (systolic > 180)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"systolic_bp": 190, "diastolic_bp": 110}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="HEADACHE",
        )

        assert category == "RED"
        assert any(
            "hypertension" in alert["message"].lower() or "blood pressure" in alert["message"].lower() for alert in alerts
        )

    def test_red_for_severe_bradycardia(self):
        """Should return RED for severe bradycardia (HR < 40)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"heart_rate": 35}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="OTHER",
        )

        assert category == "RED"
        assert any(
            "bradycardia" in alert["message"].lower() or "heart rate" in alert["message"].lower() for alert in alerts
        )

    def test_red_for_severe_tachycardia(self):
        """Should return RED for severe tachycardia (HR > 150)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"heart_rate": 160}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="CHEST_PAIN",
        )

        assert category == "RED"
        assert any(
            "tachycardia" in alert["message"].lower() or "heart rate" in alert["message"].lower() for alert in alerts
        )

    def test_red_for_altered_consciousness_chief_complaint(self):
        """Should return RED for altered consciousness chief complaint."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 97, "heart_rate": 80}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="V",
            chief_complaint_category="ALTERED_CONSCIOUSNESS",
        )

        assert category == "RED"
        assert any("consciousness" in alert["message"].lower() for alert in alerts)

    def test_orange_for_chest_pain_with_abnormal_vitals(self):
        """Should return ORANGE for chest pain with abnormal vitals."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"systolic_bp": 160, "heart_rate": 95, "spo2": 96}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="CHEST_PAIN",
            pain_score=7,
        )

        assert category == "ORANGE"
        assert any("chest pain" in alert["message"].lower() for alert in alerts)

    def test_orange_for_difficulty_breathing_with_low_spo2(self):
        """Should return ORANGE for difficulty breathing with SpO2 < 95%."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 92}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="DIFFICULTY_BREATHING",
        )

        assert category == "ORANGE"
        assert any("breathing" in alert["message"].lower() or "oxygen" in alert["message"].lower() for alert in alerts)

    def test_orange_for_severe_pain(self):
        """Should return ORANGE for severe pain (score 9-10)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 98, "heart_rate": 85}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="ABDOMINAL_PAIN",
            pain_score=9,
        )

        assert category == "ORANGE"
        assert any("pain" in alert["message"].lower() for alert in alerts)

    def test_orange_for_trauma_with_immobile_status(self):
        """Should return ORANGE for trauma with immobile status."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 96, "heart_rate": 100}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="TRAUMA",
            mobility="IMMOBILE",
        )

        assert category == "ORANGE"
        assert any("trauma" in alert["message"].lower() for alert in alerts)

    def test_yellow_for_moderate_pain(self):
        """Should return YELLOW for moderate pain (score 7-8)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 97, "heart_rate": 85}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="HEADACHE",
            pain_score=7,
        )

        assert category == "YELLOW"

    def test_yellow_for_fever_with_warning_vitals(self):
        """Should return YELLOW for fever with warning vitals."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"temperature": 38.8, "spo2": 94}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="FEVER",
        )

        assert category == "YELLOW"
        assert any("fever" in alert["message"].lower() or "temperature" in alert["message"].lower() for alert in alerts)

    def test_green_for_stable_vitals_and_low_pain(self):
        """Should return GREEN for stable vitals and low pain."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 98, "heart_rate": 75, "systolic_bp": 120}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="HEADACHE",
            pain_score=4,
        )

        assert category == "GREEN"

    def test_blue_for_non_urgent_chief_complaint(self):
        """Should return BLUE for non-urgent chief complaint with stable vitals."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 99, "heart_rate": 70}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="OTHER",
            pain_score=2,
        )

        assert category == "BLUE"

    def test_alerts_generated_for_critical_vitals(self):
        """Should generate alerts for each critical vital."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {
            "spo2": 88,  # Critical
            "heart_rate": 155,  # Critical
            "systolic_bp": 185,  # Critical
        }

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="CHEST_PAIN",
        )

        assert category == "RED"
        assert len(alerts) >= 3  # Should have multiple alerts
        assert any("spo2" in alert["message"].lower() or "oxygen" in alert["message"].lower() for alert in alerts)
        assert any("heart" in alert["message"].lower() for alert in alerts)
        assert any("blood pressure" in alert["message"].lower() for alert in alerts)

    def test_multiple_alerts_combined_correctly(self):
        """Should combine multiple alerts correctly."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {
            "spo2": 92,  # Warning
            "heart_rate": 110,  # Warning
            "temperature": 38.5,  # Warning
        }

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="FEVER",
            pain_score=6,
        )

        # Should have alerts for multiple warnings
        assert len(alerts) >= 2
        assert isinstance(alerts, list)

    # =========================================================================
    # Glasgow Coma Scale (GCS) Tests
    # =========================================================================

    def test_red_for_severe_gcs(self):
        """Should return RED for GCS ≤8 (severe brain injury)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 98, "heart_rate": 80}

        # GCS 3+2+3 = 8 (severe)
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",  # AVPU alone would be normal
            chief_complaint_category="TRAUMA",
            gcs_total=8,
        )

        assert category == "RED"
        assert any("gcs" in alert["message"].lower() for alert in alerts)
        assert any("severe" in alert["message"].lower() for alert in alerts)

    def test_red_for_gcs_at_minimum(self):
        """Should return RED for GCS of 3 (minimum score)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="TRAUMA",
            gcs_total=3,
        )

        assert category == "RED"
        assert any("gcs" in alert["message"].lower() for alert in alerts)

    def test_orange_for_moderate_gcs(self):
        """Should return ORANGE for GCS 9-12 (moderate brain injury)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 98, "heart_rate": 80}

        # GCS 9 (lower boundary of moderate)
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="TRAUMA",
            gcs_total=9,
        )

        assert category == "ORANGE"
        assert any("gcs" in alert["message"].lower() for alert in alerts)
        assert any("moderate" in alert["message"].lower() for alert in alerts)

    def test_orange_for_gcs_12(self):
        """Should return ORANGE for GCS 12 (upper boundary of moderate)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="TRAUMA",
            gcs_total=12,
        )

        assert category == "ORANGE"
        assert any("gcs" in alert["message"].lower() for alert in alerts)

    def test_no_escalation_for_mild_gcs(self):
        """Should NOT escalate for GCS 13-15 (mild/normal)."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {}

        # GCS 15 (normal) with mundane complaint
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="OTHER",
            gcs_total=15,
        )

        # Should not generate GCS alert for normal score
        gcs_alerts = [a for a in alerts if "gcs" in a["message"].lower()]
        assert len(gcs_alerts) == 0

    def test_gcs_none_does_not_affect_category(self):
        """Should not consider GCS when gcs_total is None."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {"spo2": 98}

        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="OTHER",
            gcs_total=None,  # Not provided
        )

        # Should fall through to default category (BLUE for OTHER)
        assert category == "BLUE"
        gcs_alerts = [a for a in alerts if "gcs" in a["message"].lower()]
        assert len(gcs_alerts) == 0

    def test_gcs_overrides_avpu_when_more_severe(self):
        """GCS ≤8 should trigger RED even with AVPU=A."""
        from hmis.apps.triage.services import TriageCategoryCalculator

        calculator = TriageCategoryCalculator()
        vitals = {}

        # Patient is technically alert (AVPU=A) but GCS=7 indicates severe injury
        # This can happen with confused but awake patients
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status="A",
            chief_complaint_category="OTHER",
            gcs_total=7,
        )

        assert category == "RED"
        assert any("gcs" in alert["message"].lower() for alert in alerts)
