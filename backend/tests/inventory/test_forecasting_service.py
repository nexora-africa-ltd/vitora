"""
Tests for the demand forecasting service layer.

Covers:
- ConsumptionAggregator: aggregate dispensing + adjustment data
- DemandForecaster: moving average, exponential smoothing, confidence intervals
- ReorderEngine: urgency calculation, suggestion generation, deduplication
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone

pytestmark = pytest.mark.django_db


# ============================================================================
# ConsumptionAggregator
# ============================================================================


class TestConsumptionAggregator:
    """Tests for ConsumptionAggregator."""

    def _create_dispensing(
        self, drug, facility, organization, patient, user, qty=50, returned=5, days_ago=0
    ):
        """Helper to create a Dispensing with required batch."""
        from hmis.apps.pharmacy.models import StockBatch

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number=f"B-TEST-{days_ago}-{qty}",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today() - timedelta(days=30),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            status="AVAILABLE",
            facility=facility,
            organization=organization,
        )
        from hmis.apps.pharmacy.models import Dispensing

        return Dispensing.objects.create(
            drug=drug,
            batch=batch,
            patient=patient,
            quantity_dispensed=qty,
            quantity_returned=returned,
            unit_price=Decimal("10.00"),
            total_price=Decimal(str(qty * 10)),
            dispensed_by=user,
            facility=facility,
            organization=organization,
        )

    def test_aggregate_creates_records_from_dispensing(
        self,
        sample_facility,
        sample_drug,
        sample_organization,
        sample_patient,
        test_user,
    ):
        """Should aggregate dispensing data into ConsumptionRecord rows."""
        from hmis.apps.inventory.models import ConsumptionRecord
        from hmis.apps.inventory.services.forecasting import ConsumptionAggregator

        # Create 3 dispensing records
        for i in range(3):
            self._create_dispensing(
                sample_drug,
                sample_facility,
                sample_organization,
                sample_patient,
                test_user,
                qty=50,
                returned=5,
                days_ago=i,
            )

        now = date.today()
        agg = ConsumptionAggregator(facility_id=sample_facility.pk)
        count = agg.aggregate(
            period_start=now - timedelta(days=10),
            period_end=now,
        )

        assert count == 1
        record = ConsumptionRecord.objects.get(facility=sample_facility, drug=sample_drug)
        # 3 dispensings × (50 - 5) = 135
        assert record.quantity_dispensed == Decimal("135")

    def test_aggregate_update_or_create_idempotent(
        self,
        sample_facility,
        sample_drug,
        sample_organization,
        sample_patient,
        test_user,
    ):
        """Running aggregate twice for the same period should update, not duplicate."""
        from hmis.apps.inventory.models import ConsumptionRecord
        from hmis.apps.inventory.services.forecasting import ConsumptionAggregator

        self._create_dispensing(
            sample_drug,
            sample_facility,
            sample_organization,
            sample_patient,
            test_user,
            qty=100,
            returned=0,
        )

        now = date.today()
        agg = ConsumptionAggregator(facility_id=sample_facility.pk)
        period_start = now - timedelta(days=5)
        period_end = now

        agg.aggregate(period_start, period_end)
        agg.aggregate(period_start, period_end)

        assert (
            ConsumptionRecord.objects.filter(
                facility=sample_facility,
                drug=sample_drug,
                period_start=period_start,
                period_end=period_end,
            ).count()
            == 1
        )

    def test_aggregate_with_drug_filter(
        self,
        sample_facility,
        sample_drug,
        second_drug,
        sample_organization,
        sample_patient,
        test_user,
    ):
        """Should only aggregate specified drugs when drug_ids is given."""
        from hmis.apps.inventory.models import ConsumptionRecord
        from hmis.apps.inventory.services.forecasting import ConsumptionAggregator

        for i, drug in enumerate([sample_drug, second_drug]):
            self._create_dispensing(
                drug,
                sample_facility,
                sample_organization,
                sample_patient,
                test_user,
                qty=50,
                returned=0,
                days_ago=i,
            )

        now = date.today()
        agg = ConsumptionAggregator(facility_id=sample_facility.pk)
        count = agg.aggregate(
            period_start=now - timedelta(days=1),
            period_end=now,
            drug_ids=[sample_drug.pk],
        )

        assert count == 1
        assert ConsumptionRecord.objects.filter(drug=sample_drug).exists()
        assert not ConsumptionRecord.objects.filter(drug=second_drug).exists()

    def test_aggregate_returns_zero_no_data(self, sample_facility):
        """Should return 0 when no dispensing/adjustment data exists."""
        from hmis.apps.inventory.services.forecasting import ConsumptionAggregator

        agg = ConsumptionAggregator(facility_id=sample_facility.pk)
        count = agg.aggregate(
            period_start=date.today() - timedelta(days=30),
            period_end=date.today(),
        )
        assert count == 0


# ============================================================================
# DemandForecaster
# ============================================================================


class TestDemandForecaster:
    """Tests for DemandForecaster."""

    def test_forecast_moving_average(
        self, multiple_consumption_records, sample_facility, sample_drug
    ):
        """Should generate a forecast using moving average."""
        from hmis.apps.inventory.models import DemandForecast
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        forecaster = DemandForecaster(facility_id=sample_facility.pk)
        forecast = forecaster.forecast(
            drug_id=sample_drug.pk,
            period_months=3,
            method="MOVING_AVERAGE",
            lookback_months=6,
        )

        assert isinstance(forecast, DemandForecast)
        assert forecast.drug_id == sample_drug.pk
        assert forecast.method == "MOVING_AVERAGE"
        assert forecast.period_months == 3
        assert forecast.predicted_demand > 0
        assert forecast.confidence_lower is not None
        assert forecast.confidence_upper is not None
        assert forecast.confidence_lower <= forecast.predicted_demand
        assert forecast.confidence_upper >= forecast.predicted_demand

    def test_forecast_exponential_smoothing(
        self, multiple_consumption_records, sample_facility, sample_drug
    ):
        """Should generate a forecast using exponential smoothing."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        forecaster = DemandForecaster(facility_id=sample_facility.pk)
        forecast = forecaster.forecast(
            drug_id=sample_drug.pk,
            period_months=3,
            method="EXPONENTIAL_SMOOTHING",
        )

        assert forecast.method == "EXPONENTIAL_SMOOTHING"
        assert forecast.predicted_demand > 0

    def test_forecast_no_history_uses_default(self, sample_facility, sample_drug):
        """Should fall back to drug's default_reorder_quantity when no history."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        forecaster = DemandForecaster(facility_id=sample_facility.pk)
        forecast = forecaster.forecast(
            drug_id=sample_drug.pk,
            period_months=3,
            method="MOVING_AVERAGE",
        )

        # default_reorder_quantity = 500, period_months = 3 → 1500
        assert forecast.predicted_demand == Decimal("1500.00")

    def test_forecast_sets_reorder_params(
        self, multiple_consumption_records, sample_facility, sample_drug
    ):
        """Should compute reorder_point and suggested_order_quantity."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        forecaster = DemandForecaster(facility_id=sample_facility.pk)
        forecast = forecaster.forecast(
            drug_id=sample_drug.pk,
            period_months=3,
            method="MOVING_AVERAGE",
        )

        assert forecast.reorder_point is not None
        assert forecast.suggested_order_quantity is not None
        assert forecast.reorder_point > 0

    def test_forecast_all_generates_for_all_drugs(
        self, multiple_consumption_records, sample_facility
    ):
        """forecast_all should generate one forecast per drug with history."""
        from hmis.apps.inventory.models import DemandForecast
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        forecaster = DemandForecaster(facility_id=sample_facility.pk)
        count = forecaster.forecast_all(period_months=3, method="MOVING_AVERAGE")

        assert count >= 1
        assert DemandForecast.objects.filter(facility=sample_facility).count() == count

    def test_forecast_with_user(
        self, multiple_consumption_records, sample_facility, sample_drug, test_user
    ):
        """Should store the generating user."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        forecaster = DemandForecaster(facility_id=sample_facility.pk)
        forecast = forecaster.forecast(
            drug_id=sample_drug.pk,
            period_months=3,
            method="MOVING_AVERAGE",
            user=test_user,
        )

        assert forecast.generated_by == test_user

    # -- Algorithm unit tests -----------------------------------------------

    def test_moving_average_calculation(self):
        """Test static moving average calculation."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        values = [Decimal("100"), Decimal("120"), Decimal("110")]
        result = DemandForecaster._moving_average(values, period_months=3)
        # avg = 110, * 3 = 330
        assert result == Decimal("330")

    def test_moving_average_empty(self):
        """Moving average of empty list should return 0."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        result = DemandForecaster._moving_average([], period_months=3)
        assert result == Decimal("0")

    def test_exponential_smoothing_calculation(self):
        """Test exponential smoothing with known values."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        values = [Decimal("100"), Decimal("120"), Decimal("110")]
        result = DemandForecaster._exponential_smoothing(values, period_months=3)
        # alpha=0.3: s0=100, s1=0.3*120+0.7*100=106, s2=0.3*110+0.7*106=107.2
        # 107.2 * 3 = 321.6
        assert result == Decimal("321.6")

    def test_confidence_interval_bounds(self):
        """Confidence interval should bracket predicted value."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        values = [Decimal("100"), Decimal("120"), Decimal("110"), Decimal("130")]
        predicted = Decimal("345")
        lower, upper = DemandForecaster._confidence_interval(values, predicted, 3)

        assert lower <= predicted
        assert upper >= predicted
        assert lower >= 0

    def test_confidence_interval_single_value(self):
        """With a single value, margin should be 25% of predicted."""
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        values = [Decimal("100")]
        predicted = Decimal("300")
        lower, upper = DemandForecaster._confidence_interval(values, predicted, 3)

        # margin = 300 * 0.25 = 75
        assert lower == Decimal("225")
        assert upper == Decimal("375")


# ============================================================================
# ReorderEngine
# ============================================================================


class TestReorderEngine:
    """Tests for ReorderEngine."""

    def test_generate_suggestions_creates_records(self, demand_forecast, sample_facility):
        """Should create suggestions for drugs below reorder point."""
        from hmis.apps.inventory.models import ReorderSuggestion
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        # No stock batches = current_stock == 0, which is below reorder_point (50)
        engine = ReorderEngine(facility_id=sample_facility.pk)
        count = engine.generate_suggestions()

        assert count == 1
        suggestion = ReorderSuggestion.objects.get(facility=sample_facility)
        assert suggestion.drug_id == demand_forecast.drug_id
        assert suggestion.status == "PENDING"
        assert suggestion.current_stock == Decimal("0")

    def test_generate_suggestions_skips_above_reorder_point(
        self, demand_forecast, sample_facility, sample_drug, sample_organization
    ):
        """Should not create suggestions when stock is above reorder point."""
        from hmis.apps.inventory.models import ReorderSuggestion
        from hmis.apps.inventory.services.forecasting import ReorderEngine
        from hmis.apps.pharmacy.models import StockBatch

        # Create stock well above the reorder point (50)
        StockBatch.objects.create(
            drug=sample_drug,
            batch_number="BATCH-TEST-001",
            quantity_received=500,
            quantity_available=500,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("4.50"),
            selling_price=Decimal("8.00"),
            status="AVAILABLE",
            facility=sample_facility,
            organization=sample_organization,
        )

        engine = ReorderEngine(facility_id=sample_facility.pk)
        count = engine.generate_suggestions()

        assert count == 0
        assert not ReorderSuggestion.objects.filter(facility=sample_facility).exists()

    def test_generate_suggestions_skips_existing_pending(
        self, demand_forecast, reorder_suggestion, sample_facility
    ):
        """Should not duplicate a suggestion for a drug that already has a PENDING one."""
        from hmis.apps.inventory.models import ReorderSuggestion
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        engine = ReorderEngine(facility_id=sample_facility.pk)
        count = engine.generate_suggestions()

        assert count == 0
        assert (
            ReorderSuggestion.objects.filter(
                facility=sample_facility,
            ).count()
            == 1
        )  # Only the fixture one

    def test_compute_urgency_critical_zero_stock(self):
        """Zero stock should return CRITICAL urgency."""
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        urgency = ReorderEngine._compute_urgency(
            current_stock=Decimal("0"),
            reorder_point=Decimal("50"),
            predicted_demand=Decimal("300"),
        )
        assert urgency == "CRITICAL"

    def test_compute_urgency_critical_low_days(self):
        """Less than 7 days of stock should return CRITICAL."""
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        # predicted_demand=900 over 90 days = 10/day, stock=50 = 5 days
        urgency = ReorderEngine._compute_urgency(
            current_stock=Decimal("50"),
            reorder_point=Decimal("100"),
            predicted_demand=Decimal("900"),
        )
        assert urgency == "CRITICAL"

    def test_compute_urgency_high(self):
        """7-14 days of stock should return HIGH."""
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        # predicted=900/90=10/day, stock=100 = 10 days
        urgency = ReorderEngine._compute_urgency(
            current_stock=Decimal("100"),
            reorder_point=Decimal("150"),
            predicted_demand=Decimal("900"),
        )
        assert urgency == "HIGH"

    def test_compute_urgency_medium(self):
        """Stock below reorder point but >14 days should return MEDIUM."""
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        # predicted=90/90=1/day, stock=40 = 40 days, but below reorder_point=50
        urgency = ReorderEngine._compute_urgency(
            current_stock=Decimal("40"),
            reorder_point=Decimal("50"),
            predicted_demand=Decimal("90"),
        )
        assert urgency == "MEDIUM"

    def test_compute_urgency_low(self):
        """Stock above reorder point should return LOW."""
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        urgency = ReorderEngine._compute_urgency(
            current_stock=Decimal("200"),
            reorder_point=Decimal("50"),
            predicted_demand=Decimal("90"),
        )
        assert urgency == "LOW"

    def test_no_forecasts_returns_zero(self, sample_facility):
        """Should return 0 when there are no forecasts."""
        from hmis.apps.inventory.services.forecasting import ReorderEngine

        engine = ReorderEngine(facility_id=sample_facility.pk)
        count = engine.generate_suggestions()
        assert count == 0
