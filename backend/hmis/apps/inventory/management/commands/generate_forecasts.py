"""
Management command to generate demand forecasts for drugs at a facility.

Usage:
    python manage.py generate_forecasts --facility-id 1
    python manage.py generate_forecasts --all-facilities --method EXPONENTIAL_SMOOTHING
    python manage.py generate_forecasts --facility-id 1 --drug-id 42
"""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import Facility
from hmis.apps.inventory.services.forecasting import DemandForecaster


class Command(BaseCommand):
    help = "Generate demand forecasts from historical consumption data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Facility ID to generate forecasts for.",
        )
        parser.add_argument(
            "--all-facilities",
            action="store_true",
            help="Generate forecasts for all active facilities.",
        )
        parser.add_argument(
            "--drug-id",
            type=int,
            help="Generate forecast for a single drug only.",
        )
        parser.add_argument(
            "--period-months",
            type=int,
            default=3,
            help="Forecast horizon in months (default: 3).",
        )
        parser.add_argument(
            "--method",
            choices=["MOVING_AVERAGE", "EXPONENTIAL_SMOOTHING"],
            default="MOVING_AVERAGE",
            help="Forecasting method (default: MOVING_AVERAGE).",
        )

    def handle(self, *args, **options):
        facility_ids = self._resolve_facilities(options)
        method = options["method"]
        period_months = options["period_months"]
        drug_id = options.get("drug_id")
        total = 0

        for fid in facility_ids:
            forecaster = DemandForecaster(facility_id=fid)
            if drug_id:
                forecaster.forecast(
                    drug_id=drug_id,
                    period_months=period_months,
                    method=method,
                )
                total += 1
                self.stdout.write(f"  facility={fid} drug={drug_id}: 1 forecast")
            else:
                count = forecaster.forecast_all(
                    period_months=period_months,
                    method=method,
                )
                total += count
                self.stdout.write(f"  facility={fid}: {count} forecasts")

        self.stdout.write(self.style.SUCCESS(f"Generated {total} forecast(s)."))

    def _resolve_facilities(self, options) -> list[int]:
        if options["all_facilities"]:
            return list(Facility.objects.filter(is_active=True).values_list("pk", flat=True))
        if options["facility_id"]:
            if not Facility.objects.filter(pk=options["facility_id"]).exists():
                raise CommandError(f"Facility {options['facility_id']} does not exist.")
            return [options["facility_id"]]
        raise CommandError("Specify --facility-id or --all-facilities.")
