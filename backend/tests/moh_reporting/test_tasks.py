"""Tests for MOH Reporting Celery tasks."""

from datetime import date
from unittest.mock import MagicMock, patch

import pytest  # type: ignore

from hmis.apps.moh_reporting.models import MOH705Report, MOH711Report, MOH717Report
from hmis.apps.moh_reporting.tasks import (
    _previous_month,
    generate_moh705_monthly,
    generate_moh711_monthly,
    generate_moh717_monthly,
)

pytestmark = pytest.mark.django_db


class TestPreviousMonth:
    @patch("hmis.apps.moh_reporting.tasks.date")
    def test_regular_month(self, mock_date):
        mock_date.today.return_value = date(2026, 4, 1)
        y, m = _previous_month()
        assert y == 2026
        assert m == 3

    @patch("hmis.apps.moh_reporting.tasks.date")
    def test_january_wraps(self, mock_date):
        mock_date.today.return_value = date(2026, 1, 15)
        y, m = _previous_month()
        assert y == 2025
        assert m == 12


class TestMOH705Task:
    def test_generates_report(self, sample_facility):
        generate_moh705_monthly(year=2026, month=3)
        assert MOH705Report.objects.filter(
            facility=sample_facility, period_start=date(2026, 3, 1)
        ).exists()


class TestMOH711Task:
    def test_generates_report(self, sample_facility):
        generate_moh711_monthly(year=2026, month=3)
        assert MOH711Report.objects.filter(
            facility=sample_facility, period_start=date(2026, 3, 1)
        ).exists()


class TestMOH717Task:
    def test_generates_report(self, sample_facility):
        generate_moh717_monthly(year=2026, month=3)
        assert MOH717Report.objects.filter(
            facility=sample_facility, period_start=date(2026, 3, 1)
        ).exists()
