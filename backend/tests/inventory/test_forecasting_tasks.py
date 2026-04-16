"""
Tests for Phase 6 Celery tasks.

Covers:
- aggregate_daily_consumption
- generate_weekly_forecasts
- generate_reorder_suggestions_task
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


class TestAggregateDailyConsumption:
    """Tests for the aggregate_daily_consumption task."""

    def test_aggregates_for_active_facilities(
        self,
        sample_facility,
        sample_drug,
        sample_organization,
        sample_patient,
        test_user,
    ):
        """Should create consumption records for active facilities."""
        from hmis.apps.inventory.models import ConsumptionRecord
        from hmis.apps.inventory.tasks import aggregate_daily_consumption
        from hmis.apps.pharmacy.models import Dispensing, StockBatch

        # Create a batch + dispensing for yesterday
        batch = StockBatch.objects.create(
            drug=sample_drug,
            batch_number="B-TASK-TEST",
            quantity_received=500,
            quantity_available=500,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today() - timedelta(days=30),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            status="AVAILABLE",
            facility=sample_facility,
            organization=sample_organization,
        )
        disp = Dispensing.objects.create(
            drug=sample_drug,
            batch=batch,
            patient=sample_patient,
            quantity_dispensed=80,
            quantity_returned=0,
            unit_price=Decimal("10.00"),
            total_price=Decimal("800.00"),
            dispensed_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        # dispensed_at is auto_now_add (today); backdate to yesterday
        yesterday = date.today() - timedelta(days=1)
        Dispensing.objects.filter(pk=disp.pk).update(dispensed_at=yesterday)

        total = aggregate_daily_consumption()
        assert total >= 1
        assert ConsumptionRecord.objects.filter(facility=sample_facility, drug=sample_drug).exists()

    def test_returns_zero_no_data(self, sample_facility):
        """Should return 0 when no dispensing data exists."""
        from hmis.apps.inventory.tasks import aggregate_daily_consumption

        total = aggregate_daily_consumption()
        assert total == 0


class TestGenerateWeeklyForecasts:
    """Tests for the generate_weekly_forecasts task."""

    def test_generates_forecasts(self, multiple_consumption_records, sample_facility):
        """Should generate forecasts for facilities with consumption history."""
        from hmis.apps.inventory.models import DemandForecast
        from hmis.apps.inventory.tasks import generate_weekly_forecasts

        total = generate_weekly_forecasts()
        assert total >= 1
        assert DemandForecast.objects.filter(facility=sample_facility).exists()

    def test_returns_zero_no_history(self, sample_facility):
        """Should return 0 when no consumption history exists."""
        from hmis.apps.inventory.tasks import generate_weekly_forecasts

        total = generate_weekly_forecasts()
        assert total == 0


class TestGenerateReorderSuggestionsTask:
    """Tests for the generate_reorder_suggestions_task task."""

    def test_generates_suggestions(self, demand_forecast, sample_facility):
        """Should create suggestions for drugs below reorder point."""
        from hmis.apps.inventory.models import ReorderSuggestion
        from hmis.apps.inventory.tasks import generate_reorder_suggestions_task

        total = generate_reorder_suggestions_task()
        assert total >= 1
        assert ReorderSuggestion.objects.filter(facility=sample_facility).exists()

    def test_returns_zero_no_forecasts(self, sample_facility):
        """Should return 0 when no forecasts exist."""
        from hmis.apps.inventory.tasks import generate_reorder_suggestions_task

        total = generate_reorder_suggestions_task()
        assert total == 0
