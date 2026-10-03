# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Migrate legacy MCH immunization data into the standalone immunization module.

Run with: poetry run python manage.py migrate_mch_immunizations [--dry-run]
Inputs: legacy mch.Vaccine, mch.ImmunizationRecord, and mch.AEFI database rows.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.immunizations.models import AEFI, ImmunizationRecord, VaccineDefinition
from hmis.apps.mch.models import AEFI as LegacyAEFI
from hmis.apps.mch.models import ImmunizationRecord as LegacyImmunizationRecord
from hmis.apps.mch.models import Vaccine as LegacyVaccine


class Command(BaseCommand):
    """Copy legacy MCH KEPI records to the standalone, tenant-scoped models."""

    help = (
        "Migrate legacy MCH vaccine, immunization, and AEFI data to the "
        "standalone immunizations module. The operation is idempotent."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report rows eligible for migration without writing changes.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        migrated_vaccines = 0
        migrated_records = 0
        migrated_aefi = 0
        skipped_records = 0
        vaccine_map: dict[int, VaccineDefinition] = {}
        record_map: dict[int, ImmunizationRecord] = {}

        with transaction.atomic():
            for legacy_vaccine in LegacyVaccine.objects.order_by("pk"):
                vaccine, created = VaccineDefinition.objects.get_or_create(
                    code=legacy_vaccine.code,
                    defaults={
                        "name": legacy_vaccine.name,
                        "description": legacy_vaccine.description,
                        "disease_target": legacy_vaccine.disease_target,
                        "standard_age_days": legacy_vaccine.standard_age_days,
                        "route": legacy_vaccine.route,
                        "dose_number": legacy_vaccine.dose_number,
                        "series_name": legacy_vaccine.series_name,
                        "program": "KEPI",
                        "target_population": "INFANT",
                        "is_active": legacy_vaccine.is_active,
                    },
                )
                vaccine_map[legacy_vaccine.pk] = vaccine
                migrated_vaccines += int(created)

            legacy_records = LegacyImmunizationRecord.objects.select_related(
                "patient", "vaccine", "administered_by"
            ).order_by("pk")
            for legacy_record in legacy_records:
                facility = legacy_record.patient.registered_at_facility
                organization = legacy_record.patient.organization
                if facility is None or organization is None:
                    skipped_records += 1
                    continue

                vaccine = vaccine_map[legacy_record.vaccine_id]
                record, created = ImmunizationRecord.objects.get_or_create(
                    patient=legacy_record.patient,
                    vaccine=vaccine,
                    dose_number=legacy_record.dose_number,
                    defaults={
                        "organization": organization,
                        "facility": facility,
                        "scheduled_date": legacy_record.scheduled_date,
                        "administered_date": legacy_record.administered_date,
                        "status": legacy_record.status,
                        "batch_number": legacy_record.batch_number,
                        "lot_number": legacy_record.lot_number,
                        "expiry_date": legacy_record.expiry_date,
                        "site": legacy_record.site,
                        "administered_by": legacy_record.administered_by,
                        "next_dose_date": legacy_record.next_dose_date,
                        "notes": legacy_record.notes,
                    },
                )
                record_map[legacy_record.pk] = record
                migrated_records += int(created)

            legacy_aefi_reports = LegacyAEFI.objects.select_related(
                "immunization_record__patient", "investigated_by"
            ).order_by("pk")
            for legacy_aefi in legacy_aefi_reports:
                record = record_map.get(legacy_aefi.immunization_record_id)
                if record is None:
                    continue

                _, created = AEFI.objects.get_or_create(
                    immunization_record=record,
                    event_date=legacy_aefi.event_date,
                    description=legacy_aefi.description,
                    defaults={
                        "organization": record.organization,
                        "facility": record.facility,
                        "event_types": [legacy_aefi.event_type],
                        "severity": legacy_aefi.severity,
                        "outcome": legacy_aefi.outcome,
                        "reported_to_authorities": legacy_aefi.reported_to_authorities,
                        "report_date": legacy_aefi.report_date,
                        "investigated_by": legacy_aefi.investigated_by,
                        "investigation_notes": legacy_aefi.investigation_notes,
                    },
                )
                migrated_aefi += int(created)

            if dry_run:
                transaction.set_rollback(True)

        verb = "Would migrate" if dry_run else "Migrated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {migrated_vaccines} vaccine(s), {migrated_records} immunization "
                f"record(s), and {migrated_aefi} AEFI report(s); skipped {skipped_records} "
                "record(s) without tenant context."
            )
        )
