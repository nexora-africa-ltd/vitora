"""
Backfill DeathRecord entries for historical DECEASED inpatient discharges.

Creates DeathRecord for any patient who was discharged as DECEASED but doesn't
yet have a death record (e.g., discharges that happened before the Last Office
module was implemented).

Usage:
    python manage.py backfill_death_records            # Preview (dry-run)
    python manage.py backfill_death_records --apply     # Actually create records
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.inpatient.models import Discharge
from hmis.apps.patients.models import DeathRecord, Patient

User = get_user_model()


class Command(BaseCommand):
    help = "Backfill DeathRecord entries for historical DECEASED discharges"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually create the records. Without this flag, only previews.",
        )

    def handle(self, *args, **options):
        apply = options["apply"]

        # Find DECEASED discharges whose patients have no death record
        deceased_discharges = (
            Discharge.objects.filter(discharge_type="DECEASED")
            .select_related(
                "admission__patient",
                "admission__ward",
                "admission__bed__ward",
                "admission__ipd_encounter",
                "discharged_by",
            )
            .order_by("discharge_date")
        )

        # Filter to patients without existing death records
        existing_patient_ids = set(
            DeathRecord.objects.values_list("patient_id", flat=True)
        )
        to_backfill = [
            d
            for d in deceased_discharges
            if d.admission.patient_id not in existing_patient_ids
        ]

        if not to_backfill:
            self.stdout.write(self.style.SUCCESS("No DECEASED discharges need backfilling."))
            return

        self.stdout.write(
            f"Found {len(to_backfill)} DECEASED discharge(s) without death records:"
        )
        for d in to_backfill:
            patient = d.admission.patient
            self.stdout.write(
                f"  - {patient.mrn} ({patient.first_name} {patient.last_name}) "
                f"discharged {d.discharge_date.date()} "
                f"by {d.discharged_by.username}"
            )

        if not apply:
            self.stdout.write(
                self.style.WARNING(
                    f"\nDry run — {len(to_backfill)} record(s) would be created. "
                    "Run with --apply to create them."
                )
            )
            return

        created = 0
        with transaction.atomic():
            for d in to_backfill:
                patient = d.admission.patient
                ward_name = ""
                if d.admission.ward:
                    ward_name = d.admission.ward.name
                elif d.admission.bed and d.admission.bed.ward:
                    ward_name = d.admission.bed.ward.name

                DeathRecord.objects.create(
                    patient=patient,
                    date_of_death=d.discharge_date.date(),
                    time_of_death=d.discharge_date.time(),
                    manner_of_death="NATURAL",
                    place_of_death="INPATIENT",
                    place_of_death_detail=ward_name,
                    notification_source="INPATIENT_DISCHARGE",
                    primary_cause=d.final_diagnosis_text or "To be determined",
                    primary_cause_icd10=None,
                    admission=d.admission,
                    encounter=d.admission.ipd_encounter,
                    recorded_by=d.discharged_by,
                    notes=(
                        f"Backfilled from historical discharge "
                        f"{d.admission.admission_number} "
                        f"(discharge date: {d.discharge_date.date()})"
                    ),
                )
                created += 1

        # Also ensure Patient.is_deceased flags are set
        patient_ids = [d.admission.patient_id for d in to_backfill]
        updated = Patient.objects.filter(
            id__in=patient_ids, is_deceased=False
        ).update(is_deceased=True)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nCreated {created} death record(s). "
                f"Updated {updated} patient is_deceased flag(s)."
            )
        )
