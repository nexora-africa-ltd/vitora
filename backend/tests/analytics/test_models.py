"""
Tests for analytics aggregate models.
"""

import pytest  # type: ignore
from datetime import date
from decimal import Decimal

from hmis.apps.analytics.models import (
    DepartmentMonthlySummary,
    DiagnosisTrend,
    FacilityDailySummary,
    PatientDemographicSnapshot,
)


@pytest.mark.django_db
class TestFacilityDailySummary:
    """Tests for FacilityDailySummary model."""

    def test_create_daily_summary(self, sample_facility):
        """Should create a daily summary with all fields."""
        summary = FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 4, 1),
            new_patients=10,
            total_patients=500,
            encounters_opd=25,
            encounters_ipd=5,
            encounters_emergency=3,
            encounters_total=33,
            revenue_total=Decimal("45000.00"),
        )
        assert summary.pk is not None
        assert summary.new_patients == 10
        assert summary.encounters_total == 33
        assert summary.revenue_total == Decimal("45000.00")

    def test_unique_constraint_facility_date(self, sample_facility):
        """Should enforce unique (facility, date) constraint."""
        FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 4, 1),
        )
        with pytest.raises(Exception):
            FacilityDailySummary.objects.create(
                facility=sample_facility,
                organization=sample_facility.organization,
                date=date(2026, 4, 1),
            )

    def test_str_representation(self, sample_facility):
        """Should return facility name and date."""
        summary = FacilityDailySummary(
            facility=sample_facility, date=date(2026, 4, 1)
        )
        assert sample_facility.name in str(summary)
        assert "2026-04-01" in str(summary)

    def test_ordering(self, sample_facility):
        """Should order by date descending."""
        FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 4, 1),
        )
        FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 4, 3),
        )
        summaries = list(FacilityDailySummary.objects.all())
        assert summaries[0].date > summaries[1].date

    def test_defaults_are_zero(self, sample_facility):
        """All numeric fields should default to zero."""
        summary = FacilityDailySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date(2026, 4, 5),
        )
        assert summary.new_patients == 0
        assert summary.encounters_total == 0
        assert summary.revenue_total == 0
        assert summary.bed_occupancy_rate == 0


@pytest.mark.django_db
class TestDepartmentMonthlySummary:
    """Tests for DepartmentMonthlySummary model."""

    def test_create_department_summary(self, sample_facility):
        """Should create a department monthly summary."""
        summary = DepartmentMonthlySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            year=2026,
            month=3,
            department="OPD",
            visit_count=150,
            unique_patients=120,
            revenue=Decimal("250000.00"),
            top_diagnoses=[{"code": "J06.9", "name": "URTI", "count": 42}],
        )
        assert summary.pk is not None
        assert summary.department == "OPD"
        assert summary.top_diagnoses[0]["code"] == "J06.9"

    def test_unique_constraint(self, sample_facility):
        """Should enforce unique (facility, year, month, department)."""
        DepartmentMonthlySummary.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            year=2026,
            month=3,
            department="OPD",
        )
        with pytest.raises(Exception):
            DepartmentMonthlySummary.objects.create(
                facility=sample_facility,
                organization=sample_facility.organization,
                year=2026,
                month=3,
                department="OPD",
            )


@pytest.mark.django_db
class TestDiagnosisTrend:
    """Tests for DiagnosisTrend model."""

    def test_create_diagnosis_trend(self, sample_facility):
        """Should create a diagnosis trend entry."""
        trend = DiagnosisTrend.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            icd10_code="J06.9",
            icd10_name="Acute upper respiratory infection",
            granularity="MONTHLY",
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            case_count=42,
            age_band_breakdown={"0-4": 5, "5-14": 12, "15-24": 10, "25-34": 8, "35-49": 7},
            gender_breakdown={"M": 20, "F": 22},
        )
        assert trend.case_count == 42
        assert trend.age_band_breakdown["5-14"] == 12

    def test_unique_constraint(self, sample_facility):
        """Should enforce unique (facility, code, granularity, period_start)."""
        DiagnosisTrend.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            icd10_code="J06.9",
            granularity="MONTHLY",
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            case_count=10,
        )
        with pytest.raises(Exception):
            DiagnosisTrend.objects.create(
                facility=sample_facility,
                organization=sample_facility.organization,
                icd10_code="J06.9",
                granularity="MONTHLY",
                period_start=date(2026, 3, 1),
                period_end=date(2026, 3, 31),
                case_count=20,
            )


@pytest.mark.django_db
class TestPatientDemographicSnapshot:
    """Tests for PatientDemographicSnapshot model."""

    def test_create_snapshot(self, sample_facility):
        """Should create a demographics snapshot."""
        snap = PatientDemographicSnapshot.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            snapshot_date=date(2026, 4, 1),
            total_patients=500,
            age_distribution={"0-4": 50, "5-14": 80, "15-24": 100, "25-34": 120, "35-49": 80, "50-64": 50, "65+": 20},
            gender_distribution={"M": 240, "F": 255, "O": 5},
            county_distribution=[{"county": "Nairobi", "count": 200}, {"county": "Mombasa", "count": 150}],
        )
        assert snap.total_patients == 500
        assert snap.gender_distribution["F"] == 255

    def test_unique_constraint(self, sample_facility):
        """Should enforce unique (facility, snapshot_date)."""
        PatientDemographicSnapshot.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            snapshot_date=date(2026, 4, 1),
        )
        with pytest.raises(Exception):
            PatientDemographicSnapshot.objects.create(
                facility=sample_facility,
                organization=sample_facility.organization,
                snapshot_date=date(2026, 4, 1),
            )
