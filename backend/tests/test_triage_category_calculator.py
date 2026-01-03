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
        assert any("unresponsive" in alert.lower() for alert in alerts)

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
        assert any("pain" in alert.lower() for alert in alerts)

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
        assert any("spo2" in alert.lower() or "oxygen" in alert.lower() for alert in alerts)

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
        assert any("hypotension" in alert.lower() or "blood pressure" in alert.lower() for alert in alerts)

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
        assert any("hypertension" in alert.lower() or "blood pressure" in alert.lower() for alert in alerts)

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
        assert any("bradycardia" in alert.lower() or "heart rate" in alert.lower() for alert in alerts)

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
        assert any("tachycardia" in alert.lower() or "heart rate" in alert.lower() for alert in alerts)

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
        assert any("consciousness" in alert.lower() for alert in alerts)

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
        assert any("chest pain" in alert.lower() for alert in alerts)

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
        assert any("breathing" in alert.lower() or "oxygen" in alert.lower() for alert in alerts)

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
        assert any("pain" in alert.lower() for alert in alerts)

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
        assert any("trauma" in alert.lower() for alert in alerts)

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
        assert any("fever" in alert.lower() or "temperature" in alert.lower() for alert in alerts)

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
        assert any("spo2" in alert.lower() or "oxygen" in alert.lower() for alert in alerts)
        assert any("heart" in alert.lower() for alert in alerts)
        assert any("blood pressure" in alert.lower() for alert in alerts)

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
