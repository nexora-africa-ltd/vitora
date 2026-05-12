"""
Management command to encrypt existing plaintext PII fields.

Reads plaintext Patient and EmergencyContact PII values and writes
their encrypted + HMAC counterparts.  Resumable: rows with an already-
populated ``*_encrypted`` column are skipped.

Usage:
    python manage.py encrypt_pii_fields                # all records
    python manage.py encrypt_pii_fields --batch-size=1000
    python manage.py encrypt_pii_fields --dry-run      # preview only
    python manage.py encrypt_pii_fields --model=Patient
    python manage.py encrypt_pii_fields --model=EmergencyContact
"""

from __future__ import annotations

import sys

from django.core.management.base import BaseCommand
from django.db.models import Q

from hmis.apps.core.kms import get_kms_provider
from hmis.apps.patients.models import EmergencyContact, Patient


class Command(BaseCommand):
    help = "Encrypt existing plaintext PII into *_encrypted/*_hmac columns."

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Number of rows to process per batch (default: 500).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count rows that need encryption without modifying data.",
        )
        parser.add_argument(
            "--model",
            choices=["Patient", "EmergencyContact"],
            help="Process only this model (default: both).",
        )

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        dry_run = options["dry_run"]
        model_filter = options.get("model")

        kms = get_kms_provider()

        if not model_filter or model_filter == "Patient":
            self._backfill_patients(kms, batch_size, dry_run)

        if not model_filter or model_filter == "EmergencyContact":
            self._backfill_emergency_contacts(kms, batch_size, dry_run)

        self.stdout.write(self.style.SUCCESS("Done."))

    # ------------------------------------------------------------------
    # Patient
    # ------------------------------------------------------------------
    def _backfill_patients(self, kms, batch_size: int, dry_run: bool):
        # Find patients that have any plaintext PII but missing encrypted version
        qs = Patient.objects.filter(
            Q(identification_number__isnull=False, identification_number_encrypted="")
            | Q(phone_number__isnull=False, phone_number_encrypted="")
            | Q(email__gt="", email_encrypted="")
            | Q(address__gt="", address_encrypted="")
            | Q(national_id__isnull=False, national_id_encrypted="")
            | Q(principal_national_id__isnull=False, principal_national_id_encrypted="")
        ).exclude(
            # Skip rows where ALL plaintext fields are empty/null
            identification_number__in=["", None],
            phone_number__in=["", None],
            email="",
            address="",
            national_id__in=["", None],
            principal_national_id__in=["", None],
        )

        total = qs.count()
        self.stdout.write(f"Patient: {total} rows need encryption")

        if dry_run or total == 0:
            return

        processed = 0
        for patient in qs.iterator(chunk_size=batch_size):
            update_fields = []

            for plain_attr, enc_attr, hmac_attr in Patient._PII_FIELDS:
                value = getattr(patient, plain_attr, None) or ""
                if value and not getattr(patient, enc_attr):
                    setattr(patient, enc_attr, kms.encrypt_string(value))
                    update_fields.append(enc_attr)
                    if hmac_attr:
                        setattr(patient, hmac_attr, kms.compute_hmac(value))
                        update_fields.append(hmac_attr)

            if update_fields:
                patient.save(update_fields=update_fields)

            processed += 1
            if processed % batch_size == 0:
                self.stdout.write(f"  … {processed}/{total}")
                sys.stdout.flush()

        self.stdout.write(self.style.SUCCESS(f"Patient: encrypted {processed} rows"))

    # ------------------------------------------------------------------
    # EmergencyContact
    # ------------------------------------------------------------------
    def _backfill_emergency_contacts(self, kms, batch_size: int, dry_run: bool):
        qs = EmergencyContact.objects.filter(
            Q(phone_number__gt="", phone_number_encrypted="")
            | Q(alternative_phone__gt="", alternative_phone_encrypted="")
        )

        total = qs.count()
        self.stdout.write(f"EmergencyContact: {total} rows need encryption")

        if dry_run or total == 0:
            return

        processed = 0
        for contact in qs.iterator(chunk_size=batch_size):
            update_fields = []

            for plain_attr, enc_attr, _hmac_attr in EmergencyContact._PII_FIELDS:
                value = getattr(contact, plain_attr, None) or ""
                if value and not getattr(contact, enc_attr):
                    setattr(contact, enc_attr, kms.encrypt_string(value))
                    update_fields.append(enc_attr)

            if update_fields:
                contact.save(update_fields=update_fields)

            processed += 1
            if processed % batch_size == 0:
                self.stdout.write(f"  … {processed}/{total}")
                sys.stdout.flush()

        self.stdout.write(self.style.SUCCESS(f"EmergencyContact: encrypted {processed} rows"))
