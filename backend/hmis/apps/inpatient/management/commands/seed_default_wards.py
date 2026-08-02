# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Management command to seed default wards for a facility.

Creates a standard set of hospital wards matching common Kenyan facility
configurations. Beds are auto-generated for each ward.

Usage:
    python manage.py seed_default_wards --facility 2
    python manage.py seed_default_wards --facility 2 --dry-run
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from hmis.apps.core.models import Facility
from hmis.apps.inpatient.models import Ward

DEFAULT_WARDS = [
    {
        "name": "Medical Ward",
        "code": "MED-01",
        "ward_type": "MEDICAL",
        "capacity": 20,
        "daily_rate": Decimal("1500.00"),
        "description": "General medical ward for adult patients",
    },
    {
        "name": "Surgical Ward",
        "code": "SUR-01",
        "ward_type": "SURGICAL",
        "capacity": 15,
        "daily_rate": Decimal("2000.00"),
        "description": "Pre and post-operative surgical care",
    },
    {
        "name": "Paediatric Ward",
        "code": "PED-01",
        "ward_type": "PEDIATRIC",
        "capacity": 12,
        "daily_rate": Decimal("1200.00"),
        "description": "Paediatric inpatient care (0-14 years)",
        "min_age_years": 0,
        "max_age_years": 14,
    },
    {
        "name": "Maternity Ward",
        "code": "MAT-01",
        "ward_type": "MATERNITY",
        "capacity": 16,
        "daily_rate": Decimal("1000.00"),
        "description": "Antenatal, delivery, and postnatal care",
        "gender_restriction": "FEMALE_ONLY",
        "min_age_years": 12,
        "max_age_years": 55,
    },
    {
        "name": "High Dependency Unit",
        "code": "HDU-01",
        "ward_type": "HDU",
        "capacity": 6,
        "daily_rate": Decimal("5000.00"),
        "description": "High-dependency monitoring and step-down critical care",
        "ventilator_capable": False,
        "oxygen_equipped": True,
        "isolation_capable": True,
    },
    {
        "name": "Intensive Care Unit",
        "code": "ICU-01",
        "ward_type": "ICU",
        "capacity": 6,
        "daily_rate": Decimal("8000.00"),
        "description": "Critical care and life support",
        "ventilator_capable": True,
        "oxygen_equipped": True,
    },
    {
        "name": "Newborn Unit",
        "code": "NBU-01",
        "ward_type": "NBU",
        "capacity": 10,
        "daily_rate": Decimal("4500.00"),
        "description": "Neonatal monitoring and inpatient newborn care",
        "oxygen_equipped": True,
        "isolation_capable": True,
        "min_age_years": 0,
        "max_age_years": 1,
    },
    {
        "name": "Isolation Ward",
        "code": "ISO-01",
        "ward_type": "ISOLATION",
        "capacity": 8,
        "daily_rate": Decimal("3000.00"),
        "description": "Infectious disease isolation",
        "isolation_capable": True,
    },
]


class Command(BaseCommand):
    help = "Seed default wards for a facility"

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility",
            type=int,
            required=True,
            help="Facility ID to create wards for",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without writing to the database",
        )

    def handle(self, *args, **options):
        facility_id = options["facility"]
        dry_run = options["dry_run"]

        try:
            facility = Facility.objects.get(pk=facility_id)
        except Facility.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Facility with ID {facility_id} not found."))
            return

        self.stdout.write(f"Facility: {facility.name} (ID={facility.pk})")

        created_count = 0
        skipped_count = 0

        for ward_def in DEFAULT_WARDS:
            code = ward_def["code"]
            name = ward_def["name"]

            # Check if ward already exists for this facility
            if Ward.objects.filter(code=code, facility=facility).exists():
                self.stdout.write(f"  Skipped: {name} ({code}) — already exists")
                skipped_count += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"  Would create: {name} ({code}) — capacity {ward_def['capacity']}"
                )
                created_count += 1
                continue

            ward = Ward.objects.create(
                facility=facility,
                is_active=True,
                **ward_def,
            )
            # generate_missing_beds is called automatically on Ward.save() for new wards
            bed_count = ward.beds.count()
            self.stdout.write(
                self.style.SUCCESS(f"  Created: {name} ({code}) — {bed_count} beds generated")
            )
            created_count += 1

        if dry_run:
            self.stdout.write(
                self.style.NOTICE(
                    f"\nDRY RUN: Would create {created_count} ward(s), skipped {skipped_count}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nDone: Created {created_count} ward(s), skipped {skipped_count}"
                )
            )
