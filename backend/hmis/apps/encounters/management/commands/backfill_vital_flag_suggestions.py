"""Backfill vitals-derived flag suggestions for existing encounter/triage records.

Purpose:
- Re-run vitals flag detection on historical records to populate
  ``VitalFlagSuggestion`` rows that predate signal wiring.

How to run:
- python manage.py backfill_vital_flag_suggestions --dry-run
- python manage.py backfill_vital_flag_suggestions --patient-id 123 --start-date 2026-01-01
- python manage.py backfill_vital_flag_suggestions --encounter-id 456

Supported args/options:
- --dry-run: Preview what would be detected without writing suggestions.
- --patient-id <int>: Limit to one patient.
- --encounter-id <int>: Limit to one encounter (and linked triage assessment).
- --start-date <YYYY-MM-DD>: Inclusive lower date bound.
- --end-date <YYYY-MM-DD>: Inclusive upper date bound.
- --chunk-size <int>: Iterator batch size (default 500).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.encounters.models import Encounter
from hmis.apps.encounters.services import VitalFlagSuggestionService
from hmis.apps.triage.models import TriageAssessment


class Command(BaseCommand):
    help = (
        "Backfill vitals-derived flag suggestions for historical encounter/triage records "
        "with optional patient/encounter/date filtering."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="Preview only; do not write suggestions"
        )
        parser.add_argument("--patient-id", type=int, default=None, help="Process one patient ID")
        parser.add_argument(
            "--encounter-id", type=int, default=None, help="Process one encounter ID"
        )
        parser.add_argument(
            "--start-date",
            type=str,
            default=None,
            help="Inclusive start date (YYYY-MM-DD)",
        )
        parser.add_argument(
            "--end-date",
            type=str,
            default=None,
            help="Inclusive end date (YYYY-MM-DD)",
        )
        parser.add_argument(
            "--chunk-size",
            type=int,
            default=500,
            help="Iterator chunk size (default: 500)",
        )

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        patient_id = options["patient_id"]
        encounter_id = options["encounter_id"]
        chunk_size = max(1, int(options["chunk_size"]))
        start_date = self._parse_date(options.get("start_date"), arg_name="--start-date")
        end_date = self._parse_date(options.get("end_date"), arg_name="--end-date")

        if start_date and end_date and start_date > end_date:
            raise CommandError("--start-date must be <= --end-date")

        encounter_qs = Encounter.objects.select_related("patient").order_by("id")
        triage_qs = TriageAssessment.objects.select_related(
            "encounter", "encounter__patient"
        ).order_by("id")

        if patient_id:
            encounter_qs = encounter_qs.filter(patient_id=patient_id)
            triage_qs = triage_qs.filter(encounter__patient_id=patient_id)

        if encounter_id:
            encounter_qs = encounter_qs.filter(id=encounter_id)
            triage_qs = triage_qs.filter(encounter_id=encounter_id)

        if start_date:
            encounter_qs = encounter_qs.filter(encounter_date__gte=start_date)
            triage_qs = triage_qs.filter(arrival_time__date__gte=start_date)

        if end_date:
            encounter_qs = encounter_qs.filter(encounter_date__lte=end_date)
            triage_qs = triage_qs.filter(arrival_time__date__lte=end_date)

        mode = "DRY-RUN" if dry_run else "COMMIT"
        self.stdout.write(f"Vital flag suggestion backfill mode: {mode}")
        self.stdout.write(
            f"Filters: patient_id={patient_id or '-'} encounter_id={encounter_id or '-'} "
            f"start_date={start_date or '-'} end_date={end_date or '-'} chunk_size={chunk_size}"
        )

        encounter_scanned, encounter_with_flags, encounter_flags_total = self._process_encounters(
            encounter_qs,
            dry_run=dry_run,
            chunk_size=chunk_size,
        )
        triage_scanned, triage_with_flags, triage_flags_total = self._process_triage(
            triage_qs,
            dry_run=dry_run,
            chunk_size=chunk_size,
        )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Backfill complete"))
        self.stdout.write(
            f"Encounter records: scanned={encounter_scanned}, flagged={encounter_with_flags}, "
            f"flags_detected={encounter_flags_total}"
        )
        self.stdout.write(
            f"Triage records: scanned={triage_scanned}, flagged={triage_with_flags}, "
            f"flags_detected={triage_flags_total}"
        )

    def _process_encounters(
        self, queryset, *, dry_run: bool, chunk_size: int
    ) -> tuple[int, int, int]:
        scanned = 0
        with_flags = 0
        flags_total = 0

        for encounter in queryset.iterator(chunk_size=chunk_size):
            scanned += 1
            if dry_run:
                flag_keys = self._preview_encounter_flags(encounter)
            else:
                suggestions = VitalFlagSuggestionService.detect_from_encounter(encounter)
                flag_keys = [s.flag_key for s in suggestions]

            if flag_keys:
                with_flags += 1
                flags_total += len(flag_keys)

        return scanned, with_flags, flags_total

    def _process_triage(self, queryset, *, dry_run: bool, chunk_size: int) -> tuple[int, int, int]:
        scanned = 0
        with_flags = 0
        flags_total = 0

        for triage in queryset.iterator(chunk_size=chunk_size):
            scanned += 1
            if dry_run:
                flag_keys = self._preview_triage_flags(triage)
            else:
                suggestions = VitalFlagSuggestionService.detect_from_triage(triage)
                flag_keys = [s.flag_key for s in suggestions]

            if flag_keys:
                with_flags += 1
                flags_total += len(flag_keys)

        return scanned, with_flags, flags_total

    def _preview_encounter_flags(self, encounter: Encounter) -> list[str]:
        keys: list[str] = []

        spo2 = float(encounter.spo2) if encounter.spo2 is not None else None
        if spo2 is not None and spo2 < 95:
            keys.append("HYPOXIA")

        systolic = encounter.get_systolic_bp() if hasattr(encounter, "get_systolic_bp") else None
        diastolic = encounter.get_diastolic_bp() if hasattr(encounter, "get_diastolic_bp") else None
        if systolic is not None and diastolic is not None:
            if systolic >= 180 or diastolic >= 120:
                keys.append("HYPERTENSIVE_CRISIS")
            elif systolic >= 140 or diastolic >= 90:
                keys.append("HYPERTENSION_STAGE2")

        bmi = self._calculate_bmi(encounter.weight, encounter.height)
        if bmi is not None and VitalFlagSuggestionService._is_adult(encounter.patient):  # noqa: SLF001
            if bmi < 18.5:
                keys.append("BMI_UNDERWEIGHT")
            elif bmi >= 30:
                keys.append("BMI_OBESITY")

        return keys

    def _preview_triage_flags(self, triage: TriageAssessment) -> list[str]:
        keys: list[str] = []
        muac = triage.muac_cm
        if muac is None:
            return keys

        muac_value = float(muac)
        if muac_value < 11.5:
            keys.append("MALNUTRITION_SAM")
        elif muac_value < 12.5:
            keys.append("MALNUTRITION_MAM")
        return keys

    @staticmethod
    def _parse_date(raw: str | None, *, arg_name: str) -> date | None:
        if not raw:
            return None
        try:
            return date.fromisoformat(raw)
        except ValueError as exc:
            raise CommandError(f"Invalid {arg_name} value '{raw}'. Use YYYY-MM-DD") from exc

    @staticmethod
    def _calculate_bmi(weight_kg: Decimal | None, height_cm: Decimal | None) -> float | None:
        if weight_kg is None or height_cm is None:
            return None
        try:
            weight = float(weight_kg)
            height_m = float(height_cm) / 100.0
            if weight <= 0 or height_m <= 0:
                return None
            return round(weight / (height_m * height_m), 2)
        except (TypeError, ValueError, ZeroDivisionError):
            return None
