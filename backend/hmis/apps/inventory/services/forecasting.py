"""
Demand forecasting service for the inventory module.

Provides three engines:
- ConsumptionAggregator: aggregates dispensing + adjustment data into
  ConsumptionRecord summaries.
- DemandForecaster: generates DemandForecast records using moving average
  or exponential smoothing.
- ReorderEngine: compares forecasts vs current stock to generate
  ReorderSuggestion records.
"""

import logging
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import F, Sum

logger = logging.getLogger(__name__)

# Safety stock multiplier (z-score for ~95% service level)
SAFETY_FACTOR = Decimal("1.65")

# Exponential smoothing alpha (0–1, higher = more weight on recent data)
DEFAULT_ALPHA = Decimal("0.3")


class ConsumptionAggregator:
    """
    Aggregate dispensing and stock-adjustment data into ConsumptionRecord rows.

    Usage::

        agg = ConsumptionAggregator(facility_id=1)
        records = agg.aggregate(period_start=date(2026, 1, 1), period_end=date(2026, 1, 31))
    """

    def __init__(self, facility_id: int):
        self.facility_id = facility_id

    def aggregate(
        self,
        period_start: date,
        period_end: date,
        drug_ids: list[int] | None = None,
    ) -> int:
        """
        Create or update ConsumptionRecord rows for the given period.

        Returns the number of records created/updated.
        """
        from hmis.apps.inventory.models import ConsumptionRecord
        from hmis.apps.pharmacy.models import Dispensing, StockAdjustment

        # --- Dispensing totals per drug --------------------------------
        disp_qs = Dispensing.objects.filter(
            facility_id=self.facility_id,
            dispensed_at__date__gte=period_start,
            dispensed_at__date__lte=period_end,
        )
        if drug_ids:
            disp_qs = disp_qs.filter(drug_id__in=drug_ids)

        disp_totals = dict(
            disp_qs.values_list("drug_id")
            .annotate(total=Sum(F("quantity_dispensed") - F("quantity_returned")))
            .values_list("drug_id", "total")
        )

        # --- Adjustment totals per drug (negative = out) ---------------
        adj_qs = StockAdjustment.objects.filter(
            batch__facility_id=self.facility_id,
            adjusted_at__date__gte=period_start,
            adjusted_at__date__lte=period_end,
        ).exclude(
            adjustment_type__in=["TRANSFER_OUT", "TRANSFER_IN", "COUNT_CORRECTION"],
        )
        if drug_ids:
            adj_qs = adj_qs.filter(batch__drug_id__in=drug_ids)

        adj_totals: dict[int, Decimal] = {}
        for row in adj_qs.values("batch__drug_id").annotate(total=Sum("quantity")):
            drug_id = row["batch__drug_id"]
            # quantity is negative for outflows (DAMAGE, LOSS, EXPIRED)
            adj_totals[drug_id] = Decimal(str(abs(row["total"] or 0)))

        # --- Transfer totals per drug ----------------------------------
        transfer_out = dict(
            StockAdjustment.objects.filter(
                batch__facility_id=self.facility_id,
                adjusted_at__date__gte=period_start,
                adjusted_at__date__lte=period_end,
                adjustment_type="TRANSFER_OUT",
            )
            .values_list("batch__drug_id")
            .annotate(total=Sum("quantity"))
            .values_list("batch__drug_id", "total")
        )
        transfer_in = dict(
            StockAdjustment.objects.filter(
                batch__facility_id=self.facility_id,
                adjusted_at__date__gte=period_start,
                adjusted_at__date__lte=period_end,
                adjustment_type="TRANSFER_IN",
            )
            .values_list("batch__drug_id")
            .annotate(total=Sum("quantity"))
            .values_list("batch__drug_id", "total")
        )

        # Combine all drug IDs
        all_drug_ids = set(disp_totals) | set(adj_totals) | set(transfer_out) | set(transfer_in)
        if drug_ids:
            all_drug_ids &= set(drug_ids)

        count = 0
        for drug_id in all_drug_ids:
            qty_dispensed = Decimal(str(disp_totals.get(drug_id, 0)))
            qty_adjusted = Decimal(str(adj_totals.get(drug_id, 0)))
            out_val = abs(Decimal(str(transfer_out.get(drug_id, 0))))
            in_val = abs(Decimal(str(transfer_in.get(drug_id, 0))))
            qty_transferred = out_val - in_val

            ConsumptionRecord.objects.update_or_create(
                facility_id=self.facility_id,
                drug_id=drug_id,
                period_start=period_start,
                period_end=period_end,
                defaults={
                    "quantity_dispensed": qty_dispensed,
                    "quantity_transferred": qty_transferred,
                    "quantity_adjusted": qty_adjusted,
                    "organization_id": self._get_organization_id(),
                },
            )
            count += 1

        return count

    def _get_organization_id(self) -> int | None:
        from hmis.apps.core.models import Facility

        try:
            return Facility.objects.values_list("organization_id", flat=True).get(
                pk=self.facility_id
            )
        except Facility.DoesNotExist:
            return None


class DemandForecaster:
    """
    Generate DemandForecast records from historical ConsumptionRecords.

    Supports:
    - Moving average: simple average of last N months.
    - Exponential smoothing: weighted average giving more weight to recent data.
    """

    def __init__(self, facility_id: int):
        self.facility_id = facility_id

    def forecast(
        self,
        drug_id: int,
        period_months: int = 3,
        method: str = "MOVING_AVERAGE",
        lookback_months: int = 6,
        user=None,
    ):
        """
        Generate a forecast for a single drug.

        Returns the created DemandForecast instance.
        """
        from hmis.apps.inventory.models import ConsumptionRecord, DemandForecast, ForecastMethod

        # Gather historical data
        cutoff = date.today() - timedelta(days=lookback_months * 30)

        # We need raw consumption values
        consumption_qs = ConsumptionRecord.objects.filter(
            facility_id=self.facility_id,
            drug_id=drug_id,
            period_start__gte=cutoff,
        ).order_by("period_start")

        monthly_values = [r.quantity_dispensed + r.quantity_adjusted for r in consumption_qs]

        if not monthly_values:
            # No history — use drug's default reorder quantity as fallback
            from hmis.apps.pharmacy.models import Drug

            drug = Drug.objects.get(pk=drug_id)
            predicted = Decimal(str(drug.default_reorder_quantity * period_months))
            monthly_values = [predicted / period_months]
        else:
            if method == ForecastMethod.EXPONENTIAL_SMOOTHING:
                predicted = self._exponential_smoothing(monthly_values, period_months)
            else:
                predicted = self._moving_average(monthly_values, period_months)

        # Confidence interval (±1.65 * std_dev * sqrt(period))
        confidence_lower, confidence_upper = self._confidence_interval(
            monthly_values, predicted, period_months
        )

        # Reorder point and suggested order qty
        reorder_point, suggested_qty = self._compute_reorder_params(
            drug_id, predicted, period_months
        )

        forecast = DemandForecast.objects.create(
            facility_id=self.facility_id,
            organization_id=self._get_organization_id(),
            drug_id=drug_id,
            forecast_date=date.today(),
            period_months=period_months,
            predicted_demand=predicted.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            confidence_lower=confidence_lower.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            confidence_upper=confidence_upper.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            method=method,
            reorder_point=reorder_point,
            suggested_order_quantity=suggested_qty,
            generated_by=user,
        )
        return forecast

    def forecast_all(
        self,
        period_months: int = 3,
        method: str = "MOVING_AVERAGE",
        user=None,
    ) -> int:
        """
        Generate forecasts for all drugs with consumption history at this facility.

        Returns the number of forecasts generated.
        """
        from hmis.apps.inventory.models import ConsumptionRecord

        drug_ids = (
            ConsumptionRecord.objects.filter(facility_id=self.facility_id)
            .values_list("drug_id", flat=True)
            .distinct()
        )
        count = 0
        for drug_id in drug_ids:
            try:
                self.forecast(
                    drug_id=drug_id,
                    period_months=period_months,
                    method=method,
                    user=user,
                )
                count += 1
            except Exception:
                logger.exception(
                    "Failed to forecast drug %d at facility %d",
                    drug_id,
                    self.facility_id,
                )
        return count

    # -- Forecast algorithms ------------------------------------------------

    @staticmethod
    def _moving_average(values: list[Decimal], period_months: int) -> Decimal:
        """Simple moving average projected over the forecast period."""
        if not values:
            return Decimal("0")
        avg = sum(values) / len(values)
        return avg * period_months

    @staticmethod
    def _exponential_smoothing(values: list[Decimal], period_months: int) -> Decimal:
        """Single exponential smoothing projected over the forecast period."""
        if not values:
            return Decimal("0")
        alpha = DEFAULT_ALPHA
        smoothed = values[0]
        for val in values[1:]:
            smoothed = alpha * val + (1 - alpha) * smoothed
        return smoothed * period_months

    @staticmethod
    def _confidence_interval(
        values: list[Decimal],
        predicted: Decimal,
        period_months: int,
    ) -> tuple[Decimal, Decimal]:
        """Compute 95% confidence interval."""
        if len(values) < 2:
            margin = predicted * Decimal("0.25")
        else:
            mean = sum(values) / len(values)
            variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
            std_dev = variance ** Decimal("0.5")
            margin = SAFETY_FACTOR * std_dev * Decimal(str(period_months)) ** Decimal("0.5")

        lower = max(Decimal("0"), predicted - margin)
        upper = predicted + margin
        return lower, upper

    def _compute_reorder_params(
        self,
        drug_id: int,
        predicted_demand: Decimal,
        period_months: int,
    ) -> tuple[Decimal | None, Decimal | None]:
        """Compute reorder point and suggested order quantity."""
        from hmis.apps.inventory.models import Supplier
        from hmis.apps.pharmacy.models import Drug, StockBatch

        try:
            Drug.objects.get(pk=drug_id)
        except Drug.DoesNotExist:
            return None, None

        # Current stock on hand
        current_stock = Decimal(
            str(
                StockBatch.objects.filter(
                    drug_id=drug_id,
                    facility_id=self.facility_id,
                    status="AVAILABLE",
                ).aggregate(total=Sum("quantity_available"))["total"]
                or 0
            )
        )

        # Lead time (average from suppliers or default 14 days)
        avg_lead = Supplier.objects.filter(
            purchase_orders__items__drug_id=drug_id,
            is_active=True,
        ).aggregate(avg_lead=Sum("lead_time_days"))
        lead_days = Decimal(str(avg_lead.get("avg_lead") or 14))

        # Average daily demand
        daily_demand = predicted_demand / Decimal(str(period_months * 30))

        # Safety stock = SAFETY_FACTOR * std_dev_of_daily_demand * sqrt(lead_time)
        safety_stock = SAFETY_FACTOR * daily_demand * lead_days ** Decimal("0.5")

        reorder_point = (daily_demand * lead_days + safety_stock).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        suggested_qty = max(
            Decimal("0"),
            (predicted_demand - current_stock + safety_stock).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ),
        )

        return reorder_point, suggested_qty

    def _get_organization_id(self) -> int | None:
        from hmis.apps.core.models import Facility

        try:
            return Facility.objects.values_list("organization_id", flat=True).get(
                pk=self.facility_id
            )
        except Facility.DoesNotExist:
            return None


class ReorderEngine:
    """
    Compare current stock levels against forecasted demand to generate
    ReorderSuggestion records.
    """

    def __init__(self, facility_id: int):
        self.facility_id = facility_id

    def generate_suggestions(self) -> int:
        """
        Create ReorderSuggestion records for drugs whose stock is at or
        below the reorder point.

        Returns the number of suggestions generated.
        """
        from hmis.apps.inventory.models import DemandForecast, ReorderStatus, ReorderSuggestion
        from hmis.apps.pharmacy.models import StockBatch

        # Get latest forecast per drug
        latest_forecasts = (
            DemandForecast.objects.filter(facility_id=self.facility_id)
            .order_by("drug_id", "-forecast_date")
            .distinct("drug_id")
        )

        # SQLite doesn't support DISTINCT ON — fall back to subquery approach
        from django.db import connection

        if connection.vendor == "sqlite":
            latest_forecasts = self._get_latest_forecasts_sqlite()
        else:
            latest_forecasts = list(latest_forecasts)

        count = 0
        org_id = self._get_organization_id()

        for forecast in latest_forecasts:
            if forecast.reorder_point is None:
                continue

            # Current stock
            current_stock = Decimal(
                str(
                    StockBatch.objects.filter(
                        drug_id=forecast.drug_id,
                        facility_id=self.facility_id,
                        status="AVAILABLE",
                    ).aggregate(total=Sum("quantity_available"))["total"]
                    or 0
                )
            )

            if current_stock > forecast.reorder_point:
                continue

            # Skip if there's already a PENDING suggestion for this drug
            if ReorderSuggestion.objects.filter(
                facility_id=self.facility_id,
                drug_id=forecast.drug_id,
                status=ReorderStatus.PENDING,
            ).exists():
                continue

            # Determine urgency
            urgency = self._compute_urgency(
                current_stock, forecast.reorder_point, forecast.predicted_demand
            )

            # Find preferred supplier
            preferred_supplier = self._find_preferred_supplier(forecast.drug_id, org_id)

            suggested_qty = forecast.suggested_order_quantity or (
                forecast.predicted_demand - current_stock
            )

            ReorderSuggestion.objects.create(
                facility_id=self.facility_id,
                organization_id=org_id,
                drug_id=forecast.drug_id,
                supplier=preferred_supplier,
                current_stock=current_stock,
                reorder_point=forecast.reorder_point,
                suggested_quantity=max(Decimal("0"), suggested_qty),
                urgency=urgency,
            )
            count += 1

        return count

    def _get_latest_forecasts_sqlite(self):
        """Fallback for SQLite which doesn't support DISTINCT ON."""
        from hmis.apps.inventory.models import DemandForecast

        seen_drugs: set[int] = set()
        result = []
        for fc in DemandForecast.objects.filter(facility_id=self.facility_id).order_by(
            "drug_id", "-forecast_date", "-pk"
        ):
            if fc.drug_id not in seen_drugs:
                seen_drugs.add(fc.drug_id)
                result.append(fc)
        return result

    @staticmethod
    def _compute_urgency(
        current_stock: Decimal,
        reorder_point: Decimal,
        predicted_demand: Decimal,
    ) -> str:
        from hmis.apps.inventory.models import ReorderUrgency

        if current_stock <= 0:
            return ReorderUrgency.CRITICAL
        if predicted_demand > 0:
            days_of_stock = current_stock / (predicted_demand / Decimal("90"))
        else:
            days_of_stock = Decimal("999")

        if days_of_stock <= 7:
            return ReorderUrgency.CRITICAL
        if days_of_stock <= 14:
            return ReorderUrgency.HIGH
        if current_stock <= reorder_point:
            return ReorderUrgency.MEDIUM
        return ReorderUrgency.LOW

    @staticmethod
    def _find_preferred_supplier(drug_id: int, org_id: int | None):
        """Find the most-used active supplier for a drug in the org."""
        from hmis.apps.inventory.models import Supplier

        qs = Supplier.objects.filter(
            is_active=True,
            purchase_orders__items__drug_id=drug_id,
        )
        if org_id:
            qs = qs.filter(organization_id=org_id)
        return qs.order_by("-rating").first()

    def _get_organization_id(self) -> int | None:
        from hmis.apps.core.models import Facility

        try:
            return Facility.objects.values_list("organization_id", flat=True).get(
                pk=self.facility_id
            )
        except Facility.DoesNotExist:
            return None
