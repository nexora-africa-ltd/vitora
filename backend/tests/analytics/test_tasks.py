"""
Tests for analytics Celery tasks.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest  # type: ignore

from hmis.apps.analytics.models import (
    DepartmentMonthlySummary,
    FacilityDailySummary,
    PatientDemographicSnapshot,
)
from hmis.apps.analytics.tasks import (
    refresh_daily_analytics,
    refresh_demographics_snapshot,
    refresh_monthly_analytics,
)


@pytest.mark.django_db
class TestRefreshDailyAnalytics:
    """Tests for the daily ETL task."""

    def test_creates_daily_summary(self, sample_facility, sample_patient, sample_encounter):
        """Should create a FacilityDailySummary for the target date."""
        target = sample_encounter.encounter_date.isoformat()
        result = refresh_daily_analytics(target_date_iso=target)

        assert result["created"] >= 1
        assert FacilityDailySummary.objects.filter(
            facility=sample_facility, date=sample_encounter.encounter_date
        ).exists()

    def test_updates_existing_summary(self, sample_facility, sample_patient, sample_encounter):
        """Should update an existing summary on re-run."""
        target = sample_encounter.encounter_date.isoformat()
        refresh_daily_analytics(target_date_iso=target)
        result = refresh_daily_analytics(target_date_iso=target)

        assert result["updated"] >= 1

    def test_defaults_to_yesterday(self, sample_facility):
        """Should default to yesterday when no date is given."""
        result = refresh_daily_analytics()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        assert result["date"] == yesterday


@pytest.mark.django_db
class TestRefreshMonthlyAnalytics:
    """Tests for the monthly ETL task."""

    def test_creates_department_summary(self, sample_facility, sample_encounter):
        """Should create department summaries for the given month."""
        year = sample_encounter.encounter_date.year
        month = sample_encounter.encounter_date.month
        result = refresh_monthly_analytics(year=year, month=month)

        assert result["department_summaries"] >= 1
        assert DepartmentMonthlySummary.objects.filter(
            facility=sample_facility, year=year, month=month
        ).exists()


@pytest.mark.django_db
class TestRefreshDemographicsSnapshot:
    """Tests for the demographics snapshot task."""

    def test_creates_snapshot(self, sample_facility, sample_patient):
        """Should create a demographics snapshot."""
        result = refresh_demographics_snapshot()

        assert result["facilities"] >= 1
        assert PatientDemographicSnapshot.objects.filter(facility=sample_facility).exists()
