"""Management command to seed Kenya-specific quality indicators."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from hmis.apps.quality.models import QualityMeasure

KENYA_QUALITY_MEASURES = [
    {
        "code": "KE-CQM-001",
        "name": "ANC 4+ Visits Coverage",
        "description": (
            "Percentage of pregnant women who attended at least 4 antenatal care visits "
            "during their pregnancy, as per WHO and Kenya MOH recommendations."
        ),
        "domain": "CLINICAL",
        "numerator_logic": "Pregnant women with >= 4 ANC visits during the reporting period",
        "denominator_logic": "All pregnant women enrolled in ANC during the reporting period",
        "target_percentage": 80,
        "low_threshold": 50,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["ANC"],
        "evaluation_rule": {
            "type": "visit_count",
            "params": {"min_visits": 4, "enrollment_status": "ACTIVE"},
        },
    },
    {
        "code": "KE-CQM-002",
        "name": "Skilled Birth Attendance",
        "description": (
            "Percentage of deliveries attended by a skilled health provider "
            "(doctor, clinical officer, nurse/midwife)."
        ),
        "domain": "CLINICAL",
        "numerator_logic": "Deliveries attended by skilled provider in the reporting period",
        "denominator_logic": "All deliveries in the reporting period",
        "target_percentage": 90,
        "low_threshold": 60,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["ANC", "PNC"],
        "evaluation_rule": None,
    },
    {
        "code": "KE-CQM-003",
        "name": "HIV Viral Load Suppression",
        "description": (
            "Percentage of HIV-positive patients on ART for >= 6 months with "
            "viral load < 1000 copies/ml (virally suppressed)."
        ),
        "domain": "CLINICAL",
        "numerator_logic": ("CCC patients on ART >= 6 months with latest VL < 1000 copies/ml"),
        "denominator_logic": (
            "All CCC patients on ART for >= 6 months with a VL test in the period"
        ),
        "target_percentage": 95,
        "low_threshold": 80,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["CCC"],
        "dhis2_indicator_id": "TX_PVLS",
        "evaluation_rule": {
            "type": "lab_threshold",
            "params": {
                "test_name": "Viral Load",
                "threshold": 1000,
                "comparison": "lt",
            },
        },
    },
    {
        "code": "KE-CQM-004",
        "name": "TB Treatment Success Rate",
        "description": (
            "Percentage of TB patients who completed treatment or were cured "
            "among those started on treatment during the cohort period."
        ),
        "domain": "CLINICAL",
        "numerator_logic": (
            "TB patients with outcome 'CURED' or 'TREATMENT_COMPLETE' in the cohort"
        ),
        "denominator_logic": "All TB patients started on treatment in the cohort period",
        "target_percentage": 90,
        "low_threshold": 75,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["TB"],
        "evaluation_rule": None,
    },
    {
        "code": "KE-CQM-005",
        "name": "Diabetic HbA1c Control",
        "description": (
            "Percentage of diabetic patients with latest HbA1c < 7% "
            "indicating adequate glycemic control."
        ),
        "domain": "CLINICAL",
        "numerator_logic": "Diabetic clinic patients with latest HbA1c < 7%",
        "denominator_logic": "All active diabetic clinic patients with HbA1c test in period",
        "target_percentage": 60,
        "low_threshold": 30,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["DIABETIC"],
        "evaluation_rule": {
            "type": "lab_threshold",
            "params": {
                "test_name": "HbA1c",
                "threshold": 7.0,
                "comparison": "lt",
            },
        },
    },
    {
        "code": "KE-CQM-006",
        "name": "Hypertension Blood Pressure Control",
        "description": (
            "Percentage of hypertensive patients with blood pressure < 140/90 mmHg "
            "at their last visit in the reporting period."
        ),
        "domain": "CLINICAL",
        "numerator_logic": "HTN patients with last BP < 140/90 in the reporting period",
        "denominator_logic": "All active HTN clinic patients seen in the reporting period",
        "target_percentage": 50,
        "low_threshold": 25,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["HYPERTENSION"],
        "evaluation_rule": {
            "type": "bp_control",
            "params": {"systolic_max": 140, "diastolic_max": 90},
        },
    },
    {
        "code": "KE-CQM-007",
        "name": "Under-5 Immunization Completeness",
        "description": (
            "Percentage of children under 5 who received all age-appropriate "
            "vaccines per the KEPI schedule."
        ),
        "domain": "PUBLIC_HEALTH",
        "numerator_logic": ("Children under 5 with all age-appropriate KEPI vaccines administered"),
        "denominator_logic": "All children under 5 seen in the reporting period",
        "target_percentage": 90,
        "low_threshold": 70,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["CWC", "IMMUNIZATION"],
        "evaluation_rule": None,
    },
    {
        "code": "KE-CQM-008",
        "name": "Patient Waiting Time (OPD)",
        "description": ("Percentage of OPD patients seen within 30 minutes of registration."),
        "domain": "EFFICIENCY",
        "numerator_logic": (
            "OPD visits where time from REGISTERED to IN_CONSULTATION <= 30 minutes"
        ),
        "denominator_logic": "All completed OPD visits in the reporting period",
        "target_percentage": 80,
        "low_threshold": 50,
        "reporting_period": "MONTHLY",
        "applicable_clinic_types": ["GENERAL_OPD", "FILTER_CLINIC"],
        "evaluation_rule": {
            "type": "wait_time",
            "params": {"max_minutes": 30},
        },
    },
    {
        "code": "KE-CQM-009",
        "name": "Maternal Mortality Ratio",
        "description": ("Number of maternal deaths per 100,000 live births in the facility."),
        "domain": "PATIENT_SAFETY",
        "numerator_logic": "Maternal deaths during or within 42 days of delivery",
        "denominator_logic": "Live births in the reporting period (per 100,000)",
        "target_percentage": None,
        "low_threshold": None,
        "reporting_period": "ANNUAL",
        "applicable_clinic_types": ["ANC", "PNC"],
        "evaluation_rule": None,
    },
    {
        "code": "KE-CQM-010",
        "name": "IDSR Timely Reporting",
        "description": (
            "Percentage of IDSR weekly reports submitted within the reporting deadline "
            "(by Monday of the following week)."
        ),
        "domain": "PUBLIC_HEALTH",
        "numerator_logic": (
            "IDSR weekly reports submitted before deadline in the reporting period"
        ),
        "denominator_logic": "Total expected IDSR weekly reports in the reporting period",
        "target_percentage": 80,
        "low_threshold": 50,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": [],
        "dhis2_indicator_id": "IDSR_TIMELINESS",
        "evaluation_rule": None,
    },
    {
        "code": "KE-CQM-011",
        "name": "Medicine Stock-Out Rate",
        "description": (
            "Percentage of tracer medicines that experienced a stock-out "
            "at any point during the reporting period."
        ),
        "domain": "EFFICIENCY",
        "numerator_logic": "Tracer medicines with at least one stock-out day in the period",
        "denominator_logic": "Total number of tracer medicines being tracked",
        "target_percentage": 5,
        "low_threshold": 20,
        "reporting_period": "MONTHLY",
        "applicable_clinic_types": [],
        "evaluation_rule": {
            "type": "stock_availability",
            "params": {"tracer_only": True},
        },
    },
    {
        "code": "KE-CQM-012",
        "name": "Defaulter Tracing Rate",
        "description": (
            "Percentage of chronic care defaulters (missed 2+ appointments) "
            "who were traced and returned to care."
        ),
        "domain": "CARE_COORDINATION",
        "numerator_logic": ("Chronic care defaulters traced and returned to care in the period"),
        "denominator_logic": "All chronic care defaulters identified in the period",
        "target_percentage": 80,
        "low_threshold": 50,
        "reporting_period": "QUARTERLY",
        "applicable_clinic_types": ["CCC", "TB", "DIABETIC", "HYPERTENSION"],
        "evaluation_rule": {
            "type": "enrollment_active",
            "params": {},
        },
    },
]


class Command(BaseCommand):
    help = "Seed Kenya-specific clinical quality measures (CQM)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without saving",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        created = 0
        updated = 0

        for measure_data in KENYA_QUALITY_MEASURES:
            code = measure_data["code"]

            if dry_run:
                exists = QualityMeasure.objects.filter(code=code).exists()
                action = "UPDATE" if exists else "CREATE"
                self.stdout.write(f"  [DRY RUN] {action}: {code} - {measure_data['name']}")
                continue

            defaults = {k: v for k, v in measure_data.items() if k != "code"}
            defaults["status"] = "ACTIVE"

            _, was_created = QualityMeasure.objects.update_or_create(
                code=code,
                defaults=defaults,
            )

            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  Created: {code}"))
            else:
                updated += 1
                self.stdout.write(f"  Updated: {code}")

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"\n[DRY RUN] Would process {len(KENYA_QUALITY_MEASURES)} measures."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nDone. Created: {created}, Updated: {updated}, "
                    f"Total: {QualityMeasure.objects.count()}"
                )
            )
