"""
Management command to seed demo surveillance data for testing.

Creates sample notifiable cases for DHIS2 integration testing.

Usage:
    python manage.py seed_surveillance_demo
    python manage.py seed_surveillance_demo --cases 20
    python manage.py seed_surveillance_demo --week 8 --year 2026
"""

import random
from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code
from hmis.apps.patients.models import Patient
from hmis.apps.surveillance.models import (
    CaseOutcome,
    CaseSeverity,
    NotifiableCase,
    NotifiableCategory,
    NotifiableDisease,
)
from hmis.apps.surveillance.services import IDSRReportingService

User = get_user_model()


class Command(BaseCommand):
    help = "Seed demo surveillance data for testing DHIS2 integration"

    def add_arguments(self, parser):
        parser.add_argument(
            "--cases",
            type=int,
            default=15,
            help="Number of notifiable cases to create (default: 15)",
        )
        parser.add_argument(
            "--week",
            type=int,
            default=None,
            help="Epidemiological week number (default: current week)",
        )
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Epidemiological year (default: current year)",
        )
        parser.add_argument(
            "--regenerate",
            action="store_true",
            help="Regenerate IDSR report after seeding",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing demo cases before seeding",
        )

    def handle(self, *args, **options):
        case_count = options["cases"]
        epi_week = options["week"]
        epi_year = options["year"]
        regenerate = options["regenerate"]
        clear = options["clear"]

        self.stdout.write(self.style.NOTICE(f"Seeding {case_count} surveillance demo cases..."))

        # Get or calculate epi week dates
        if epi_week and epi_year:
            _, _, week_start, week_end = self._get_week_dates(epi_year, epi_week)
        else:
            epi_year, epi_week, week_start, week_end = IDSRReportingService.get_epi_week()

        self.stdout.write(f"Target week: W{epi_week:02d}/{epi_year} ({week_start} to {week_end})")

        with transaction.atomic():
            if clear:
                self._clear_demo_data()

            # Ensure we have required data
            user = self._get_or_create_user()
            county, sub_county = self._get_or_create_location()
            diseases = self._get_diseases()

            if not diseases:
                self.stdout.write(self.style.ERROR("No notifiable diseases found. Run seed_notifiable_diseases first."))
                return

            # Create demo cases
            created_cases = []
            for i in range(case_count):
                case = self._create_demo_case(
                    index=i,
                    user=user,
                    county=county,
                    sub_county=sub_county,
                    diseases=diseases,
                    week_start=week_start,
                    week_end=week_end,
                )
                if case:
                    created_cases.append(case)

            self.stdout.write(self.style.SUCCESS(f"Created {len(created_cases)} notifiable cases"))

            # Show summary by disease
            self._print_summary(created_cases)

            # Regenerate report if requested
            if regenerate:
                self._regenerate_report(epi_year, epi_week, week_start, week_end, user)

    def _get_week_dates(self, year: int, week: int) -> tuple:
        """Calculate week start/end dates from year and week number."""
        # ISO week 1 starts on Monday of the first week with >= 4 days in Jan
        jan4 = date(year, 1, 4)
        week1_monday = jan4 - timedelta(days=jan4.weekday())
        week_start = week1_monday + timedelta(weeks=week - 1)
        week_end = week_start + timedelta(days=6)
        return year, week, week_start, week_end

    def _clear_demo_data(self):
        """Clear previously seeded demo data."""
        # Clear cases for demo patients (patients with last name ending in '(Demo)')
        demo_patients = Patient.objects.filter(last_name__endswith="(Demo)")
        if demo_patients.exists():
            count = NotifiableCase.objects.filter(patient__in=demo_patients).count()
            NotifiableCase.objects.filter(patient__in=demo_patients).delete()
            Encounter.objects.filter(patient__in=demo_patients).delete()
            demo_patients.delete()
            self.stdout.write(f"Cleared {count} existing demo cases")

    def _get_or_create_user(self) -> User:
        """Get or create a demo user for audit purposes."""
        user, created = User.objects.get_or_create(
            username="surveillance_demo",
            defaults={
                "email": "demo@vitora.local",
                "first_name": "Surveillance",
                "last_name": "Demo",
                "is_active": True,
            },
        )
        if created:
            user.set_password("demo12345")
            user.save()
            self.stdout.write(f"Created demo user: {user.username}")
        return user

    def _get_or_create_location(self) -> tuple:
        """Get or create demo county/sub-county."""
        county = County.objects.first()
        if not county:
            county = County.objects.create(code=47, name="Demo County")
            self.stdout.write("Created demo county")

        sub_county = SubCounty.objects.filter(county=county).first()
        if not sub_county:
            sub_county = SubCounty.objects.create(
                county=county, name="Demo Sub-County"
            )
            self.stdout.write("Created demo sub-county")

        return county, sub_county

    def _get_diseases(self) -> list:
        """Get notifiable diseases for demo, prioritizing those with DHIS2 mappings."""
        # Prioritize diseases that have DHIS2 mappings configured
        priority_diseases = [
            "Cholera",
            "Measles",
            "Acute Flaccid Paralysis",
            "Malaria",
            "Typhoid Fever",
            "Dysentery",
        ]

        diseases = list(
            NotifiableDisease.objects.filter(
                is_active=True,
                name__in=priority_diseases,
            )
        )

        # Add more diseases if needed
        if len(diseases) < 3:
            additional = NotifiableDisease.objects.filter(
                is_active=True
            ).exclude(id__in=[d.id for d in diseases])[:5]
            diseases.extend(list(additional))

        return diseases

    def _create_demo_case(
        self,
        index: int,
        user,
        county,
        sub_county,
        diseases: list,
        week_start: date,
        week_end: date,
    ) -> NotifiableCase | None:
        """Create a single demo case with patient, encounter, and diagnosis."""
        disease = random.choice(diseases)

        # Generate random date within the week
        days_offset = random.randint(0, 6)
        detection_date = week_start + timedelta(days=days_offset)
        detection_datetime = datetime.combine(
            detection_date,
            datetime.min.time().replace(hour=random.randint(8, 17)),
        )
        if timezone.is_naive(detection_datetime):
            detection_datetime = timezone.make_aware(detection_datetime)

        # Create demo patient
        patient = self._create_demo_patient(index, county, sub_county)

        # Create encounter
        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            encounter_date=detection_date,
            chief_complaint=f"Presenting with symptoms suggestive of {disease.name}",
            created_by=user,
        )

        # Get matching ICD-10 code
        icd_codes = disease.get_icd10_code_list()
        icd10_code = None
        if icd_codes:
            icd10_code = ICD10Code.objects.filter(code__iexact=icd_codes[0]).first()
            if not icd10_code:
                # Create a placeholder ICD-10 code
                icd10_code = ICD10Code.objects.create(
                    code=icd_codes[0],
                    description=f"{disease.name} (auto-created for demo)",
                )

        # Create diagnosis
        diagnosis = Diagnosis.objects.create(
            encounter=encounter,
            icd10_code=icd10_code,
            diagnosis_type="WORKING",
            notes=f"Clinical presentation consistent with {disease.name}",
            diagnosed_by=user,
        )

        # Determine case characteristics
        severity = random.choice([CaseSeverity.MILD, CaseSeverity.MODERATE, CaseSeverity.SEVERE])
        outcome = CaseOutcome.ACTIVE
        if random.random() < 0.05:  # 5% mortality rate for demo
            outcome = CaseOutcome.DECEASED
        elif random.random() < 0.2:  # 20% recovered
            outcome = CaseOutcome.RECOVERED

        lab_confirmed = random.random() < 0.4  # 40% lab confirmed

        # Check if case was auto-created by signal (from diagnosis creation)
        case = NotifiableCase.objects.filter(
            disease=disease,
            patient=patient,
            encounter=encounter,
        ).first()

        if case:
            # Update the auto-created case with our demo data
            case.detected_at = detection_datetime
            case.onset_date = detection_date - timedelta(days=random.randint(1, 5))
            case.severity = severity
            case.outcome = outcome
            case.laboratory_confirmed = lab_confirmed
            case.lab_result_date = detection_date if lab_confirmed else None
            case.save()
        else:
            # Create notifiable case manually if signal didn't trigger
            case = NotifiableCase.objects.create(
                disease=disease,
                patient=patient,
                encounter=encounter,
                diagnosis=diagnosis,
                detected_at=detection_datetime,
                onset_date=detection_date - timedelta(days=random.randint(1, 5)),
                severity=severity,
                outcome=outcome,
                laboratory_confirmed=lab_confirmed,
                lab_result_date=detection_date if lab_confirmed else None,
                county=county,
                sub_county=sub_county,
                reported_by=user,
            )

        return case

    def _create_demo_patient(self, index: int, county, sub_county) -> Patient:
        """Create a demo patient with varied demographics."""
        # Age distribution: mix of under-5 and over-5
        if random.random() < 0.3:  # 30% under 5
            age_years = random.randint(0, 4)
        else:
            age_years = random.randint(5, 70)

        dob = date.today() - timedelta(days=age_years * 365 + random.randint(0, 364))
        gender = random.choice(["M", "F"])

        first_names_m = ["James", "John", "Peter", "David", "Samuel", "Joseph", "Daniel", "Michael"]
        first_names_f = ["Mary", "Jane", "Sarah", "Grace", "Faith", "Ann", "Rose", "Lucy"]
        last_names = ["Kamau", "Ochieng", "Mwangi", "Wanjiku", "Otieno", "Njeri", "Kiprop", "Mutua"]

        first_name = random.choice(first_names_m if gender == "M" else first_names_f)
        last_name = random.choice(last_names)

        # Create patient - MRN is auto-generated
        patient = Patient.objects.create(
            first_name=first_name,
            last_name=f"{last_name} (Demo)",  # Mark as demo via last name suffix
            date_of_birth=dob,
            gender=gender,
            county=county,
            sub_county=sub_county,
        )

        return patient

    def _print_summary(self, cases: list):
        """Print summary of created cases by disease."""
        summary = {}
        for case in cases:
            disease_name = case.disease.name
            if disease_name not in summary:
                summary[disease_name] = {
                    "total": 0,
                    "under_5": 0,
                    "5_and_above": 0,
                    "lab_confirmed": 0,
                    "deaths": 0,
                }
            summary[disease_name]["total"] += 1

            age = (case.detected_at.date() - case.patient.date_of_birth).days // 365
            if age < 5:
                summary[disease_name]["under_5"] += 1
            else:
                summary[disease_name]["5_and_above"] += 1

            if case.laboratory_confirmed:
                summary[disease_name]["lab_confirmed"] += 1
            if case.outcome == CaseOutcome.DECEASED:
                summary[disease_name]["deaths"] += 1

        self.stdout.write("\nCase Summary by Disease:")
        self.stdout.write("-" * 70)
        self.stdout.write(f"{'Disease':<25} {'Total':>6} {'<5':>6} {'≥5':>6} {'Lab':>6} {'Deaths':>6}")
        self.stdout.write("-" * 70)

        for disease_name, data in sorted(summary.items()):
            self.stdout.write(
                f"{disease_name:<25} {data['total']:>6} "
                f"{data['under_5']:>6} {data['5_and_above']:>6} "
                f"{data['lab_confirmed']:>6} {data['deaths']:>6}"
            )

        self.stdout.write("-" * 70)

    def _regenerate_report(self, epi_year, epi_week, week_start, week_end, user):
        """Regenerate IDSR report for the target week."""
        self.stdout.write(f"\nRegenerating IDSR report for W{epi_week:02d}/{epi_year}...")

        report = IDSRReportingService.generate_weekly_report(
            epi_year=epi_year,
            epi_week=epi_week,
            week_start=week_start,
            week_end=week_end,
            generated_by=user,
        )

        self.stdout.write(self.style.SUCCESS(
            f"Report generated: {report.total_cases} cases, "
            f"{report.disease_summaries.count()} diseases, "
            f"Status: {report.status}"
        ))

        # Show disease summaries
        self.stdout.write("\nDisease Summaries in Report:")
        for summary in report.disease_summaries.select_related("disease"):
            total = summary.cases_under_5 + summary.cases_5_and_above
            self.stdout.write(
                f"  - {summary.disease.name}: {total} cases "
                f"(U5: {summary.cases_under_5}, 5+: {summary.cases_5_and_above})"
            )
