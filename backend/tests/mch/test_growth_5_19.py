"""Tests for WHO Growth Reference 5-19y z-score calculations.

Extends the existing 0-5y growth system to cover school-age and adolescent
children using WHO Growth Reference 2007 data.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.mch.services.growth import WHOGrowthCalculator


@pytest.fixture()
def calculator():
    """Fresh calculator instance with cleared cache."""
    WHOGrowthCalculator._cache.clear()
    return WHOGrowthCalculator()


# ---------------------------------------------------------------------------
# Calculator unit tests
# ---------------------------------------------------------------------------
class TestWHOGrowthCalculator5to19:
    """Tests for extended age range z-score calculations."""

    def test_bmi_for_age_z_at_age_10y_boy(self, calculator):
        """Should return a valid BMI-for-age z-score for a 10-year-old boy."""
        age_days = round(10 * 365.25)  # ~3653 days
        # Median BMI at 10y boys is ~16.35 → z≈0
        z = calculator.bmi_for_age_z(16.35, age_days, "M")
        assert z is not None
        assert -0.5 < float(z) < 0.5

    def test_bmi_for_age_z_at_age_15y_girl(self, calculator):
        """Should return a valid BMI-for-age z-score for a 15-year-old girl."""
        age_days = round(15 * 365.25)
        # Median BMI at 15y girls is ~20.2 → z≈0
        z = calculator.bmi_for_age_z(20.2, age_days, "F")
        assert z is not None
        assert -0.5 < float(z) < 0.5

    def test_bmi_for_age_z_obese_18y_boy(self, calculator):
        """High BMI at 18y should yield high z-score."""
        age_days = round(18 * 365.25)
        z = calculator.bmi_for_age_z(30.0, age_days, "M")
        assert z is not None
        assert float(z) > 2.0  # Obese range

    def test_bmi_for_age_z_thin_12y_girl(self, calculator):
        """Low BMI at 12y should yield negative z-score."""
        age_days = round(12 * 365.25)
        z = calculator.bmi_for_age_z(13.0, age_days, "F")
        assert z is not None
        assert float(z) < -2.0  # Severe thinness

    def test_bmi_for_age_z_returns_none_after_19y(self, calculator):
        """BMI-for-age should return None for ages beyond 19 years."""
        age_days = 6941  # Just beyond max
        z = calculator.bmi_for_age_z(22.0, age_days, "M")
        assert z is None

    def test_height_for_age_z_at_age_10y_boy(self, calculator):
        """Should return a valid height-for-age z-score for a 10-year-old boy."""
        age_days = round(10 * 365.25)
        # Median height at 10y boys is ~138 cm → z≈0
        z = calculator.height_for_age_z(138.0, age_days, "M")
        assert z is not None
        assert -0.5 < float(z) < 0.5

    def test_height_for_age_z_at_age_15y_girl(self, calculator):
        """Should return a valid height-for-age z-score for a 15-year-old girl."""
        age_days = round(15 * 365.25)
        # Median height at 15y girls is ~161.5 cm
        z = calculator.height_for_age_z(161.5, age_days, "F")
        assert z is not None
        assert -1.0 < float(z) < 1.0

    def test_height_for_age_z_stunted_7y(self, calculator):
        """Short height for age should yield strongly negative z-score."""
        age_days = round(7 * 365.25)
        # Very short for a 7y boy (median ~121cm)
        z = calculator.height_for_age_z(105.0, age_days, "M")
        assert z is not None
        assert float(z) < -2.0  # Stunted

    def test_height_for_age_z_returns_none_after_19y(self, calculator):
        """Height-for-age should return None beyond 19 years."""
        age_days = 6941
        z = calculator.height_for_age_z(175.0, age_days, "M")
        assert z is None

    def test_weight_for_age_z_at_age_8y_boy(self, calculator):
        """Should return a valid weight-for-age z-score for an 8-year-old boy."""
        age_days = round(8 * 365.25)
        # Median weight at 8y boys is ~25.4 kg
        z = calculator.weight_for_age_z(25.4, age_days, "M")
        assert z is not None
        assert -1.0 < float(z) < 1.0

    def test_weight_for_age_z_at_age_10y_girl(self, calculator):
        """Should return a valid weight-for-age z-score at the upper boundary (10y)."""
        age_days = round(10 * 365.25)
        z = calculator.weight_for_age_z(32.0, age_days, "F")
        assert z is not None

    def test_weight_for_age_z_returns_none_after_10y(self, calculator):
        """Weight-for-age should return None for ages beyond 10 years."""
        age_days = 3653  # Just beyond 10y
        z = calculator.weight_for_age_z(40.0, age_days, "M")
        assert z is None

    def test_head_circumference_z_returns_none_after_5y(self, calculator):
        """Head circumference z-score is only valid for 0-5 years."""
        age_days = round(6 * 365.25)
        z = calculator.head_circumference_for_age_z(52.0, age_days, "M")
        assert z is None

    def test_0_to_5_still_works_bmi(self, calculator):
        """Verify the 0-5y range still works correctly after the extension."""
        # 2-year-old boy, median BMI ~16.3
        age_days = 730
        z = calculator.bmi_for_age_z(16.3, age_days, "M")
        assert z is not None
        assert -1.0 < float(z) < 1.0

    def test_0_to_5_still_works_height(self, calculator):
        """Verify the 0-5y height-for-age still works."""
        # 3-year-old girl, median height ~95 cm
        age_days = round(3 * 365.25)
        z = calculator.height_for_age_z(95.0, age_days, "F")
        assert z is not None
        assert -1.0 < float(z) < 1.0

    def test_0_to_5_still_works_weight(self, calculator):
        """Verify the 0-5y weight-for-age still works."""
        # 4-year-old boy, median weight ~16 kg
        age_days = round(4 * 365.25)
        z = calculator.weight_for_age_z(16.0, age_days, "M")
        assert z is not None
        assert -1.0 < float(z) < 1.0


class TestFileSelection:
    """Tests for data file selection based on age."""

    def test_selects_0_5_file_for_infant(self, calculator):
        """Should select 0-5y file for infant age."""
        filename = calculator._get_sex_filename("bfa", "M", age_days=365)
        assert filename == "bfa_boys_0_5.json"

    def test_selects_5_19_file_for_school_age_bmi(self, calculator):
        """Should select 5-19y file for school-age BMI."""
        filename = calculator._get_sex_filename("bfa", "M", age_days=2000)
        assert filename == "bfa_boys_5_19.json"

    def test_selects_5_19_file_for_adolescent_height(self, calculator):
        """Should select 5-19y file for adolescent height."""
        filename = calculator._get_sex_filename("lhfa", "F", age_days=5000)
        assert filename == "lhfa_girls_5_19.json"

    def test_selects_5_10_file_for_weight(self, calculator):
        """Should select 5-10y file for school-age weight."""
        filename = calculator._get_sex_filename("wfa", "M", age_days=2000)
        assert filename == "wfa_boys_5_10.json"

    def test_selects_0_5_file_for_hcfa_even_if_older(self, calculator):
        """Head circumference has no 5-19y data, always returns 0-5 file."""
        filename = calculator._get_sex_filename("hcfa", "M", age_days=2000)
        assert filename == "hcfa_boys_0_5.json"

    def test_selects_0_5_file_when_no_age_provided(self, calculator):
        """Should default to 0-5y file when no age_days given."""
        filename = calculator._get_sex_filename("bfa", "F")
        assert filename == "bfa_girls_0_5.json"

    def test_boundary_1856_uses_0_5(self, calculator):
        """Age 1856 (5y exactly) should use 0-5y file."""
        filename = calculator._get_sex_filename("bfa", "M", age_days=1856)
        assert filename == "bfa_boys_0_5.json"

    def test_boundary_1857_uses_5_19(self, calculator):
        """Age 1857 (just past 5y) should use 5-19y file."""
        filename = calculator._get_sex_filename("bfa", "M", age_days=1857)
        assert filename == "bfa_boys_5_19.json"


# ---------------------------------------------------------------------------
# Integration tests (model-level)
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestGrowthMeasurement5to19:
    """Tests for GrowthMeasurement model with extended age range."""

    def test_growth_measurement_save_calculates_z_for_7yo(
        self, sample_county, sample_sub_county, sample_organization
    ):
        """Should auto-calculate z-scores for a 7-year-old child."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="James",
            last_name="Kamau",
            date_of_birth=date.today() - timedelta(days=round(7 * 365.25)),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date.today(),
            weight=Decimal("22.5"),
            height=Decimal("120.0"),
        )

        # Weight-for-age should be calculated (within 0-10y range)
        assert measurement.weight_for_age_z is not None
        # Height-for-age should be calculated (within 0-19y range)
        assert measurement.height_for_age_z is not None
        # BMI-for-age should be calculated
        assert measurement.bmi_for_age_z is not None
        # Head circumference: not provided, should be None
        assert measurement.head_circumference_for_age_z is None
        # Nutritional status should be classified
        assert measurement.nutritional_status is not None

    def test_growth_measurement_12yo_no_weight_for_age(
        self, sample_county, sample_sub_county, sample_organization
    ):
        """Weight-for-age should be None for a 12-year-old (>10y limit)."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Wanjiru",
            last_name="Muthoni",
            date_of_birth=date.today() - timedelta(days=round(12 * 365.25)),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date.today(),
            weight=Decimal("40.0"),
            height=Decimal("150.0"),
        )

        # Weight-for-age should be None (>10y)
        assert measurement.weight_for_age_z is None
        # Height-for-age should still work
        assert measurement.height_for_age_z is not None
        # BMI-for-age should still work
        assert measurement.bmi_for_age_z is not None
        # Nutritional status should fall back to BMI-for-age
        assert measurement.nutritional_status is not None

    def test_growth_measurement_15yo_bmi_and_height(
        self, sample_county, sample_sub_county, sample_organization
    ):
        """A 15-year-old should have BMI and height z-scores but no WFA or HCFA."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Brian",
            last_name="Odhiambo",
            date_of_birth=date.today() - timedelta(days=round(15 * 365.25)),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date.today(),
            weight=Decimal("55.0"),
            height=Decimal("168.0"),
            head_circumference=Decimal("55.0"),
        )

        assert measurement.weight_for_age_z is None  # >10y
        assert measurement.height_for_age_z is not None
        assert measurement.bmi_for_age_z is not None
        assert measurement.head_circumference_for_age_z is None  # >5y
        assert measurement.nutritional_status is not None

    def test_nutritional_status_fallback_to_bmi(
        self, sample_county, sample_sub_county, sample_organization
    ):
        """When WFA is None (>10y), nutritional status should use BMI-for-age."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Aisha",
            last_name="Mohamed",
            date_of_birth=date.today() - timedelta(days=round(14 * 365.25)),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        # Very high BMI → obese classification
        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date.today(),
            weight=Decimal("80.0"),
            height=Decimal("155.0"),
        )

        assert measurement.weight_for_age_z is None
        assert measurement.bmi_for_age_z is not None
        # BMI = 80/(1.55^2) ≈ 33.3 → well above obese threshold
        assert float(measurement.bmi_for_age_z) > 2.0
        assert measurement.nutritional_status == "OBESE"

    def test_age_in_months_serializer_field(
        self, sample_county, sample_sub_county, sample_organization
    ):
        """Serializer should include computed age_in_months."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.mch.serializers import GrowthMeasurementSerializer
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Zawadi",
            last_name="Kimani",
            date_of_birth=date.today() - timedelta(days=round(8 * 365.25)),
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date.today(),
            weight=Decimal("25.0"),
            height=Decimal("128.0"),
        )

        serializer = GrowthMeasurementSerializer(measurement)
        data = serializer.data

        assert "age_in_months" in data
        assert data["age_in_months"] is not None
        # ~96 months for 8y
        assert 90 < data["age_in_months"] < 102

    def test_adult_triage_unchanged(self, sample_county, sample_sub_county, sample_organization):
        """Verify that adult records (>19y) get None z-scores as before."""
        from hmis.apps.mch.models import GrowthMeasurement
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Peter",
            last_name="Njoroge",
            date_of_birth=date.today() - timedelta(days=round(25 * 365.25)),
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        measurement = GrowthMeasurement.objects.create(
            patient=patient,
            measurement_date=date.today(),
            weight=Decimal("70.0"),
            height=Decimal("175.0"),
        )

        assert measurement.weight_for_age_z is None
        assert measurement.height_for_age_z is None
        assert measurement.bmi_for_age_z is None
        assert measurement.head_circumference_for_age_z is None


# ---------------------------------------------------------------------------
# Chart data endpoint tests
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestChartDataView:
    """Tests for the chart-data endpoint with 5-19y support."""

    def test_chart_data_returns_5_19_reference_curves(self, authenticated_client):
        """Chart data with age_range=5_19 should return percentile lines."""
        response = authenticated_client.get(
            "/api/mch/growth-measurements/chart-data/",
            {"chart_type": "bmi_for_age", "sex": "M", "age_range": "5_19"},
        )
        assert response.status_code == 200
        data = response.data
        assert "percentile_lines" in data
        lines = data["percentile_lines"]
        assert "z_0" in lines
        # The 5-19y data should have points beyond 1856 days
        z0_points = lines["z_0"]
        assert len(z0_points) > 0
        # Check that x-axis values extend to adolescent range
        max_x = max(p["x"] for p in z0_points)
        assert max_x > 5000  # Should reach ~6940 days

    def test_chart_data_returns_all_range(self, authenticated_client):
        """Chart data with age_range=all should combine 0-5 and 5-19 data."""
        response = authenticated_client.get(
            "/api/mch/growth-measurements/chart-data/",
            {"chart_type": "height_for_age", "sex": "F", "age_range": "all"},
        )
        assert response.status_code == 200
        lines = response.data["percentile_lines"]
        assert "z_0" in lines
        z0_points = lines["z_0"]
        # Should have points from birth to 19y
        min_x = min(p["x"] for p in z0_points)
        max_x = max(p["x"] for p in z0_points)
        assert min_x < 100  # Near birth
        assert max_x > 6000  # Near 19y

    def test_chart_data_default_is_0_5(self, authenticated_client):
        """Default age_range should return 0-5 data only."""
        response = authenticated_client.get(
            "/api/mch/growth-measurements/chart-data/",
            {"chart_type": "weight_for_age", "sex": "M"},
        )
        assert response.status_code == 200
        lines = response.data["percentile_lines"]
        z0_points = lines.get("z_0", [])
        if z0_points:
            max_x = max(p["x"] for p in z0_points)
            assert max_x <= 1856  # 0-5y only

    def test_chart_data_hcfa_no_5_19(self, authenticated_client):
        """Head circumference should only return 0-5y data regardless of age_range."""
        response = authenticated_client.get(
            "/api/mch/growth-measurements/chart-data/",
            {"chart_type": "head_circumference_for_age", "sex": "M", "age_range": "5_19"},
        )
        assert response.status_code == 200
        lines = response.data["percentile_lines"]
        z0_points = lines.get("z_0", [])
        # HCFA 5-19y file doesn't exist, so this should be empty or use 0-5y fallback
        # The _get_sex_filename for hcfa with age>1856 returns 0-5y file
        # but we asked for 5_19 range which loads with age_days=2000
        # → hcfa returns the 0-5y file since no extended file exists
        # The data will still be 0-5y range
        if z0_points:
            max_x = max(p["x"] for p in z0_points)
            assert max_x <= 1856
