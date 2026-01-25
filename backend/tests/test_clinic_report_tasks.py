from __future__ import annotations

from datetime import date
from unittest.mock import Mock

import pytest  # type: ignore


@pytest.mark.django_db
class TestClinicReportTasks:
    def test_generate_monthly_clinic_reports_defaults_to_previous_month(self, monkeypatch):
        """Task should compute previous month when args omitted."""
        from hmis.apps.clinics import tasks

        mock_generate_all = Mock(return_value=[])
        monkeypatch.setattr(tasks, "generate_all_clinic_reports", mock_generate_all)
        monkeypatch.setattr(tasks.timezone, "localdate", lambda: date(2026, 1, 15))

        tasks.generate_monthly_clinic_reports()

        mock_generate_all.assert_called_once_with(year=2025, month=12)

    def test_celery_beat_schedule_has_monthly_clinic_reports(self):
        """Celery beat should schedule the task monthly."""
        from celery.schedules import crontab

        from hmis.celery import app

        schedule = app.conf.beat_schedule
        assert "generate-monthly-clinic-reports" in schedule

        entry = schedule["generate-monthly-clinic-reports"]
        assert entry["task"] == "hmis.apps.clinics.tasks.generate_monthly_clinic_reports"
        assert isinstance(entry["schedule"], crontab)

        # Run on 1st day of month at 01:00 Africa/Nairobi
        assert entry["schedule"]._orig_day_of_month in (1, "1")
        assert entry["schedule"]._orig_hour in (1, "1")
        assert entry["schedule"]._orig_minute in (0, "0")
