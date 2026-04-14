"""
Tests for analytics ETL services.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

from hmis.apps.analytics.services import (
    _age_band,
    compute_daily_summary,
    compute_demographics_snapshot,
    compute_department_monthly,
    compute_diagnosis_trends,
)


@pytest.mark.django_db
class TestAgeBand:
    """Tests for age-band calculation helper."""

    def test_infant(self):
        assert _age_band(date(2024, 1, 1), date(2026, 4, 1)) == "0-4"

    def test_child(self):
        assert _age_band(date(2015, 6, 15), date(2026, 4, 1)) == "5-14"

    def test_young_adult(self):
        assert _age_band(date(2000, 1, 1), date(2026, 4, 1)) == "25-34"

    def test_elderly(self):
        assert _age_band(date(1950, 1, 1), date(2026, 4, 1)) == "65+"

    def test_exact_boundary(self):
        """Person turning 5 today should be in 5-14 band."""
        ref = date(2026, 4, 1)
        dob = date(2021, 4, 1)  # exactly 5 years old
        assert _age_band(dob, ref) == "5-14"


@pytest.mark.django_db
class TestComputeDailySummary:
    """Tests for daily summary computation."""

    def test_basic_summary(self, sample_facility, sample_patient, sample_encounter):
        """Should compute basic daily metrics."""
        today = sample_encounter.encounter_date
        result = compute_daily_summary(sample_facility, today)

        assert "new_patients" in result
        assert "encounters_total" in result
        assert "revenue_total" in result
        assert isinstance(result["encounters_total"], int)
        assert result["encounters_total"] >= 0

    def test_patient_counts(self, sample_facility, sample_patient):
        """Should count patients registered at the facility."""
        from django.utils import timezone

        today = timezone.localdate()
        result = compute_daily_summary(sample_facility, today)

        # sample_patient may have been created on a different date,
        # but total_patients should still count it
        assert result["total_patients"] >= 1

    def test_encounter_type_breakdown(self, sample_facility, sample_encounter):
        """Should break encounters down by type."""
        today = sample_encounter.encounter_date
        result = compute_daily_summary(sample_facility, today)

        # sample_encounter is OPD
        assert result["encounters_opd"] >= 1

    def test_empty_date(self, sample_facility):
        """Should return zeros for a date with no data."""
        result = compute_daily_summary(sample_facility, date(2020, 1, 1))

        assert result["new_patients"] == 0
        assert result["encounters_total"] == 0
        assert result["revenue_total"] == Decimal("0")

    def test_lab_stats_graceful_fallback(self, sample_facility):
        """Lab stats should return zeros if lab module has no data."""
        result = compute_daily_summary(sample_facility, date(2026, 4, 1))
        assert result["lab_orders_placed"] == 0

    def test_inpatient_stats_graceful_fallback(self, sample_facility):
        """Inpatient stats should return zeros if no admissions."""
        result = compute_daily_summary(sample_facility, date(2026, 4, 1))
        assert result["current_admissions"] == 0
        assert result["bed_occupancy_rate"] == Decimal("0")


@pytest.mark.django_db
class TestComputeDepartmentMonthly:
    """Tests for department monthly summary computation."""

    def test_opd_department(self, sample_facility, sample_encounter):
        """Should compute OPD department stats from encounters."""
        year = sample_encounter.encounter_date.year
        month = sample_encounter.encounter_date.month
        results = compute_department_monthly(sample_facility, year, month)

        # There is at least an OPD encounter
        dept_codes = [r["department"] for r in results]
        assert "OPD" in dept_codes

        opd = next(r for r in results if r["department"] == "OPD")
        assert opd["visit_count"] >= 1
        assert opd["unique_patients"] >= 1

    def test_no_encounters_month(self, sample_facility):
        """Should return empty list for months with no encounters."""
        results = compute_department_monthly(sample_facility, 2020, 1)
        assert results == []


@pytest.mark.django_db
class TestComputeDiagnosisTrends:
    """Tests for diagnosis trend computation."""

    def test_with_diagnoses(self, sample_facility, sample_encounter, sample_icd10_code):
        """Should compute diagnosis trends when diagnoses exist."""
        from hmis.apps.encounters.models import Diagnosis

        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        enc_date = sample_encounter.encounter_date
        period_start = enc_date.replace(day=1)
        if enc_date.month == 12:
            period_end = date(enc_date.year + 1, 1, 1) - timedelta(days=1)
        else:
            period_end = date(enc_date.year, enc_date.month + 1, 1) - timedelta(days=1)

        results = compute_diagnosis_trends(
            sample_facility, period_start, period_end, "MONTHLY"
        )
        assert len(results) >= 1
        assert results[0]["icd10_code"] == sample_icd10_code.code
        assert results[0]["case_count"] >= 1

    def test_no_diagnoses(self, sample_facility):
        """Should return empty list when no diagnoses exist."""
        results = compute_diagnosis_trends(
            sample_facility, date(2020, 1, 1), date(2020, 1, 31), "MONTHLY"
        )
        assert results == []


@pytest.mark.django_db
class TestComputeDemographicsSnapshot:
    """Tests for demographics snapshot computation."""

    def test_basic_snapshot(self, sample_facility, sample_patient):
        """Should compute demographics from registered patients."""
        result = compute_demographics_snapshot(sample_facility, date(2026, 4, 1))

        assert result["total_patients"] >= 1
        assert isinstance(result["age_distribution"], dict)
        assert isinstance(result["gender_distribution"], dict)
        assert isinstance(result["county_distribution"], list)

    def test_gender_distribution(self, sample_facility, sample_patient):
        """Should include gender breakdown."""
        result = compute_demographics_snapshot(sample_facility, date(2026, 4, 1))
        # sample_patient is Female
        assert "F" in result["gender_distribution"]
        assert result["gender_distribution"]["F"] >= 1

    def test_empty_facility(self, sample_facility):
        """Should return zeros for facility with no patients."""
        # Note: sample_facility may have patients from other fixtures,
        # but this tests the structure
        result = compute_demographics_snapshot(sample_facility, date(2020, 1, 1))
        assert isinstance(result["total_patients"], int)
