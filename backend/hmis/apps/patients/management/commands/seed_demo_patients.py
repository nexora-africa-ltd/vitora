"""Seed 10 outpatient demo patients with diverse demographics."""

from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.core.models import County, Facility, Organization, SubCounty
from hmis.apps.patients.models import Patient

DEMO_SUFFIX = " (Demo)"

# fmt: off
DEMO_PATIENTS = [
    # (first_name, last_name, dob, gender, title, county_name, phone, identification_type)
    ("Amina",    "Osman",     date(1987, 3, 14),  "F", "Mrs",  "Mombasa",    "+254711000001", "national_id"),
    ("James",    "Kipchoge",  date(1955, 8, 22),  "M", "Mr",   "Nairobi",    "+254722000002", "national_id"),
    ("Wanjiku",  "Muthoni",   date(2001, 11, 5),  "F", "Ms",   "Kiambu",     "+254733000003", "national_id"),
    ("Hassan",   "Abdi",      date(1970, 1, 30),  "M", "Mr",   "Garissa",    "+254744000004", "national_id"),
    ("Grace",    "Achieng",   date(2015, 6, 18),  "F", "",      "Kisumu",     "",              ""),
    ("Peter",    "Kamau",     date(1992, 9, 3),   "M", "Mr",   "Nakuru",     "+254755000006", "national_id"),
    ("Fatma",    "Ali",       date(1948, 12, 10), "F", "Mrs",  "Kilifi",     "+254766000007", "national_id"),
    ("Brian",    "Otieno",    date(2020, 4, 25),  "M", "",      "Nairobi",    "",              ""),
    ("Lucy",     "Wambui",    date(1983, 7, 8),   "F", "Ms",   "Nyeri",      "+254777000009", "national_id"),
    ("David",    "Mwangi",    date(2008, 2, 14),  "M", "",      "Machakos",   "+254788000010", ""),
]
# fmt: on


class Command(BaseCommand):
    help = "Seed 10 outpatient demo patients with diverse demographics."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Remove all demo patients (last name ending with '(Demo)') and exit.",
        )
        parser.add_argument(
            "--org",
            type=str,
            default="",
            help="Organization name or slug to assign patients to. Uses first available if omitted.",
        )
        parser.add_argument(
            "--facility",
            type=str,
            default="",
            help="Facility name or MFL code to assign patients to. Uses first in org if omitted.",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            return self._clear_demo_data()

        with transaction.atomic():
            org = self._resolve_organization(options["org"])
            facility = self._resolve_facility(options["facility"], org)
            created = self._create_patients(org, facility)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Created {created} demo patients."))
        if org:
            self.stdout.write(f"  Organization: {org.name}")
        if facility:
            self.stdout.write(f"  Facility:     {facility.name}")
        self.stdout.write(self.style.NOTICE("Run with --clear to remove all demo patients."))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_organization(self, org_hint: str):
        if org_hint:
            try:
                return Organization.objects.get(name=org_hint)
            except Organization.DoesNotExist:
                try:
                    return Organization.objects.get(slug=org_hint)
                except Organization.DoesNotExist:
                    self.stderr.write(self.style.ERROR(f"Organization '{org_hint}' not found."))
                    return None
        return Organization.objects.first()

    def _resolve_facility(self, facility_hint: str, org):
        if facility_hint:
            try:
                return Facility.objects.get(name=facility_hint)
            except Facility.DoesNotExist:
                try:
                    return Facility.objects.get(mfl_code=facility_hint)
                except Facility.DoesNotExist:
                    self.stderr.write(self.style.ERROR(f"Facility '{facility_hint}' not found."))
                    return None
        if org:
            return Facility.objects.filter(organization=org).first()
        return Facility.objects.first()

    def _get_location(self, county_name: str):
        """Return (county, sub_county) for a given county name, or (None, None)."""
        try:
            county = County.objects.get(name__iexact=county_name)
        except County.DoesNotExist:
            self.stderr.write(
                self.style.WARNING(f"County '{county_name}' not found — skipping location.")
            )
            return None, None
        sub_county = SubCounty.objects.filter(county=county).first()
        return county, sub_county

    def _create_patients(self, org, facility) -> int:
        created = 0
        for row in DEMO_PATIENTS:
            (
                first_name,
                last_name,
                dob,
                gender,
                title,
                county_name,
                phone,
                id_type,
            ) = row

            tagged_last = f"{last_name}{DEMO_SUFFIX}"

            # Skip if already exists (idempotent)
            if Patient.objects.filter(
                first_name=first_name,
                last_name=tagged_last,
                date_of_birth=dob,
            ).exists():
                self.stdout.write(f"  ⏭  {first_name} {tagged_last} already exists")
                continue

            county, sub_county = self._get_location(county_name)

            kwargs = {
                "first_name": first_name,
                "last_name": tagged_last,
                "date_of_birth": dob,
                "gender": gender,
                "county": county,
                "sub_county": sub_county,
                "organization": org,
                "registered_at_facility": facility,
                "referral_source": "self",
            }
            if title:
                kwargs["title"] = title
            if phone:
                kwargs["phone_number"] = phone
            if id_type:
                kwargs["identification_type"] = id_type

            patient = Patient.objects.create(**kwargs)
            age = self._age(dob)
            self.stdout.write(
                f"  ✅  {patient.mrn}  {first_name} {tagged_last}  "
                f"({gender}, age {age}, {county_name})"
            )
            created += 1

        return created

    def _clear_demo_data(self):
        qs = Patient.objects.filter(last_name__endswith=DEMO_SUFFIX)
        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.NOTICE("No demo patients found."))
            return

        # Temporarily patch PROTECT → CASCADE on ALL reverse relations so
        # a single `.delete()` cascades through every dependent table.
        from django.db.models.deletion import CASCADE, PROTECT

        patched = []
        for field in Patient._meta.get_fields():
            if hasattr(field, "on_delete") and field.on_delete is PROTECT:
                patched.append((field, PROTECT))
                field.on_delete = CASCADE

        try:
            deleted_total, counts = qs.delete()
        finally:
            for field, original in patched:
                field.on_delete = original

        self.stdout.write(
            self.style.SUCCESS(f"Deleted {count} demo patient(s) and related records.")
        )
        for model_label, n in sorted(counts.items()):
            if n:
                self.stdout.write(f"  {model_label}: {n}")

    @staticmethod
    def _age(dob: date) -> int:
        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
