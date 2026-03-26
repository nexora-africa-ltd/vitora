"""
Seed Facility Data — Kenya MFL representative facilities.

Creates a small representative set of facilities across KEPH levels 1-6 with
appropriate module defaults so that developers can immediately test
capability-based navigation filtering.

Usage:
    python manage.py seed_facilities
    python manage.py seed_facilities --force   # recreate even if they exist
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed representative Kenya MFL facilities for development/staging"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Recreate facilities even if they already exist",
        )

    def handle(self, *args, **options):
        from django.db import transaction

        from hmis.apps.core.models import County, Facility, SubCounty

        FACILITIES = [
            {
                "mfl_code": "12345",
                "name": "Kenyatta National Hospital",
                "level": "6",
                "ownership": "PUBLIC",
                "county_name": "Nairobi",
                "sub_county_name": "Dagoretti North",
                "sha_contracted": True,
            },
            {
                "mfl_code": "12346",
                "name": "Coast General Teaching & Referral Hospital",
                "level": "5",
                "ownership": "PUBLIC",
                "county_name": "Mombasa",
                "sub_county_name": "Mvita",
                "sha_contracted": True,
            },
            {
                "mfl_code": "12347",
                "name": "Machakos Level 4 Hospital",
                "level": "4",
                "ownership": "PUBLIC",
                "county_name": "Machakos",
                "sub_county_name": "Mavoko",
                "sha_contracted": True,
            },
            {
                "mfl_code": "12348",
                "name": "Kibera Health Centre",
                "level": "3",
                "ownership": "PUBLIC",
                "county_name": "Nairobi",
                "sub_county_name": "Kibra",
                "sha_contracted": False,
            },
            {
                "mfl_code": "12349",
                "name": "Ruiru Dispensary",
                "level": "2",
                "ownership": "PUBLIC",
                "county_name": "Kiambu",
                "sub_county_name": "Ruiru",
                "sha_contracted": False,
            },
            {
                "mfl_code": "12350",
                "name": "Mathare Community Health Unit",
                "level": "1",
                "ownership": "PUBLIC",
                "county_name": "Nairobi",
                "sub_county_name": "Mathare",
                "sha_contracted": False,
            },
            {
                "mfl_code": "12351",
                "name": "Aga Khan University Hospital",
                "level": "6",
                "ownership": "PRIVATE",
                "county_name": "Nairobi",
                "sub_county_name": "Westlands",
                "sha_contracted": True,
            },
            {
                "mfl_code": "12352",
                "name": "St. Francis Community Hospital",
                "level": "4",
                "ownership": "FBO",
                "county_name": "Nairobi",
                "sub_county_name": "Kasarani",
                "sha_contracted": True,
            },
        ]

        force = options["force"]
        created_count = 0
        skipped_count = 0

        with transaction.atomic():
            for spec in FACILITIES:
                if Facility.objects.filter(mfl_code=spec["mfl_code"]).exists():
                    if force:
                        Facility.objects.filter(mfl_code=spec["mfl_code"]).delete()
                    else:
                        skipped_count += 1
                        self.stdout.write(
                            self.style.WARNING(
                                f"  Skipped {spec['name']} (MFL {spec['mfl_code']}) — already exists"
                            )
                        )
                        continue

                county = County.objects.filter(name__iexact=spec["county_name"]).first()
                if not county:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Skipped {spec['name']} — county '{spec['county_name']}' not found"
                        )
                    )
                    skipped_count += 1
                    continue

                sub_county = SubCounty.objects.filter(
                    name__iexact=spec["sub_county_name"],
                    county=county,
                ).first()
                if not sub_county:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Skipped {spec['name']} — sub-county '{spec['sub_county_name']}' not found in {county.name}"
                        )
                    )
                    skipped_count += 1
                    continue

                # Get KEPH-level defaults
                defaults = Facility.default_modules_for_level(spec["level"])

                Facility.objects.create(
                    mfl_code=spec["mfl_code"],
                    name=spec["name"],
                    level=spec["level"],
                    ownership=spec["ownership"],
                    county=county,
                    sub_county=sub_county,
                    sha_contracted=spec["sha_contracted"],
                    **{f"has_{k}": v for k, v in defaults.items()},
                )

                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  Created {spec['name']} (Level {spec['level']}, MFL {spec['mfl_code']})"
                    )
                )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created {created_count}, skipped {skipped_count}."
            )
        )
