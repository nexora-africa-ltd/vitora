"""
Management command to import Kenya county location data.

Usage:
    python manage.py import_kenya_locations <csv_file_path>
"""

import csv

from django.core.management.base import BaseCommand

from hmis.apps.core.models import County, SubCounty, Ward


class Command(BaseCommand):
    """Import Kenya location data from CSV file."""

    help = "Import Kenya county, sub-county, and ward data from CSV file"

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "csv_file",
            type=str,
            help="Path to the CSV file containing location data",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing location data before import",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        csv_file = options["csv_file"]
        clear_existing = options.get("clear", False)

        if clear_existing:
            self.stdout.write("Clearing existing location data...")
            Ward.objects.all().delete()
            SubCounty.objects.all().delete()
            County.objects.all().delete()
            self.stdout.write(self.style.SUCCESS("Existing data cleared."))

        # Track created objects to avoid duplicates
        counties_created = 0
        sub_counties_created = 0
        wards_created = 0

        # Cache for efficiency
        county_cache = {}
        sub_county_cache = {}

        self.stdout.write(f"Reading from {csv_file}...")

        try:
            with open(csv_file, encoding="utf-8-sig") as f:  # utf-8-sig handles BOM
                reader = csv.DictReader(f)

                for row in reader:
                    county_code = int(row["code"])
                    county_name = row["county"].strip()
                    sub_county_name = row["sub_county"].strip()
                    ward_name = row["ward"].strip()

                    # Get or create County
                    county_key = county_code
                    if county_key not in county_cache:
                        county, created = County.objects.get_or_create(
                            code=county_code,
                            defaults={"name": county_name},
                        )
                        county_cache[county_key] = county
                        if created:
                            counties_created += 1
                    else:
                        county = county_cache[county_key]

                    # Get or create SubCounty
                    sub_county_key = (county.id, sub_county_name)
                    if sub_county_key not in sub_county_cache:
                        sub_county, created = SubCounty.objects.get_or_create(
                            county=county,
                            name=sub_county_name,
                        )
                        sub_county_cache[sub_county_key] = sub_county
                        if created:
                            sub_counties_created += 1
                    else:
                        sub_county = sub_county_cache[sub_county_key]

                    # Get or create Ward
                    ward, created = Ward.objects.get_or_create(
                        sub_county=sub_county,
                        name=ward_name,
                    )
                    if created:
                        wards_created += 1

            self.stdout.write(
                self.style.SUCCESS(
                    f"Import complete!\n"
                    f"  Counties created: {counties_created}\n"
                    f"  Sub-counties created: {sub_counties_created}\n"
                    f"  Wards created: {wards_created}"
                )
            )

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f"File not found: {csv_file}"))
        except KeyError as e:
            self.stdout.write(
                self.style.ERROR(
                    f"CSV format error: Missing column {e}. "
                    f"Expected columns: code, county, sub_county, ward"
                )
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error importing data: {e}"))
