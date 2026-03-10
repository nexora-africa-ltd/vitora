"""
Tests for Triage Vital Threshold model.

Following TDD approach: Write tests FIRST, then implement the model.
Sprint 1.5-1.6 Track E: Triage Module MVP
"""

from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError


@pytest.mark.django_db
class TestTriageVitalThresholdModel:
    """Test suite for TriageVitalThreshold model (15 tests as per spec)."""

    def test_create_threshold_with_valid_data(self):
        """Should create threshold with all required fields."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )

        assert threshold.id is not None
        assert threshold.vital_type == "SPO2"
        assert threshold.critical_low == Decimal("90.00")
        assert threshold.warning_low == Decimal("95.00")
        assert threshold.is_active is True

    def test_vital_type_unique_constraint(self):
        """Should enforce unique constraint on vital_type."""
        from hmis.apps.triage.models import TriageVitalThreshold

        TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
        )

        with pytest.raises(IntegrityError):
            TriageVitalThreshold.objects.create(
                vital_type="SPO2",
                critical_low=Decimal("85.00"),
            )

    def test_vital_type_choices_validation(self):
        """Should validate vital_type against allowed choices."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold(
            vital_type="INVALID_TYPE",
            critical_low=Decimal("90.00"),
        )

        with pytest.raises(ValidationError) as exc_info:
            threshold.full_clean()

        assert "vital_type" in str(exc_info.value)

    def test_threshold_fields_accept_null(self):
        """Should allow null values for threshold fields."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=None,
            warning_low=None,
            warning_high=None,
            critical_high=None,
        )

        assert threshold.critical_low is None
        assert threshold.warning_low is None
        assert threshold.warning_high is None
        assert threshold.critical_high is None

    def test_threshold_fields_accept_decimal_values(self):
        """Should accept decimal values for all threshold fields."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="TEMPERATURE",
            critical_high=Decimal("40.50"),
            critical_low=Decimal("35.00"),
            warning_high=Decimal("38.50"),
            warning_low=Decimal("36.00"),
        )

        assert threshold.critical_high == Decimal("40.50")
        assert threshold.critical_low == Decimal("35.00")
        assert threshold.warning_high == Decimal("38.50")
        assert threshold.warning_low == Decimal("36.00")

    def test_is_active_default_true(self):
        """Should default is_active to True."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="HEART_RATE",
            critical_high=Decimal("150"),
        )

        assert threshold.is_active is True

    def test_get_defaults_returns_all_vital_types(self):
        """Should return default thresholds for all vital types."""
        from hmis.apps.triage.models import TriageVitalThreshold

        defaults = TriageVitalThreshold.get_defaults()

        assert "SPO2" in defaults
        assert "SYSTOLIC_BP" in defaults
        assert "DIASTOLIC_BP" in defaults
        assert "HEART_RATE" in defaults
        assert "TEMPERATURE" in defaults
        assert "RESPIRATORY_RATE" in defaults

    def test_check_value_returns_critical_for_critical_low_breach(self):
        """Should return 'critical' when value is below critical_low."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
        )

        result = threshold.check_value(Decimal("85.00"))
        assert result == "critical"

    def test_check_value_returns_critical_for_critical_high_breach(self):
        """Should return 'critical' when value is above critical_high."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SYSTOLIC_BP",
            critical_high=Decimal("180.00"),
        )

        result = threshold.check_value(Decimal("190.00"))
        assert result == "critical"

    def test_check_value_returns_warning_for_warning_low_breach(self):
        """Should return 'warning' when value is below warning_low but above critical_low."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )

        result = threshold.check_value(Decimal("93.00"))
        assert result == "warning"

    def test_check_value_returns_warning_for_warning_high_breach(self):
        """Should return 'warning' when value is above warning_high but below critical_high."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SYSTOLIC_BP",
            warning_high=Decimal("140.00"),
            critical_high=Decimal("180.00"),
        )

        result = threshold.check_value(Decimal("150.00"))
        assert result == "warning"

    def test_check_value_returns_normal_for_normal_values(self):
        """Should return 'normal' for values within normal range."""
        from hmis.apps.triage.models import TriageVitalThreshold

        threshold = TriageVitalThreshold.objects.create(
            vital_type="SPO2",
            critical_low=Decimal("90.00"),
            warning_low=Decimal("95.00"),
        )

        result = threshold.check_value(Decimal("98.00"))
        assert result == "normal"

    def test_spo2_critical_threshold_90_percent(self):
        """Should recognize SpO2 < 90% as critical."""
        from hmis.apps.triage.models import TriageVitalThreshold

        defaults = TriageVitalThreshold.get_defaults()
        spo2_defaults = defaults["SPO2"]

        assert spo2_defaults["critical_low"] == 90

    def test_temperature_critical_thresholds(self):
        """Should have critical thresholds at 32°C (severe hypothermia) and 40°C (high fever)."""
        from hmis.apps.triage.models import TriageVitalThreshold

        defaults = TriageVitalThreshold.get_defaults()
        temp_defaults = defaults["TEMPERATURE"]

        assert temp_defaults["critical_low"] == 32.0
        assert temp_defaults["critical_high"] == 40.0

    def test_heart_rate_critical_thresholds(self):
        """Should have critical heart rate thresholds at 40 and 150 bpm."""
        from hmis.apps.triage.models import TriageVitalThreshold

        defaults = TriageVitalThreshold.get_defaults()
        hr_defaults = defaults["HEART_RATE"]

        assert hr_defaults["critical_low"] == 40
        assert hr_defaults["critical_high"] == 150
