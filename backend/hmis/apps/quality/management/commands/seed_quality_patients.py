"""Seed demo patients and clinical data for Quality Measures evaluation.

Creates realistic data across multiple clinics so that the automated CQM
evaluators (bp_control, lab_threshold, visit_count, wait_time, enrollment_active)
produce meaningful results.

Usage:
    python manage.py seed_quality_patients
    python manage.py seed_quality_patients --dry-run
    python manage.py seed_quality_patients --clear  # Remove previously seeded data
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

User = get_user_model()

# Tag to identify seeded data for cleanup
SEED_TAG = "qm_seed_demo"


class Command(BaseCommand):
    help = "Seed demo patients and clinical data for Quality Measures evaluation"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without saving",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Remove previously seeded quality demo data",
        )
        parser.add_argument(
            "--facility",
            type=int,
            default=None,
            help="Facility ID to seed data into (default: first facility in first org)",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            return self._clear_seeded_data()

        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("[DRY RUN] No data will be created.\n"))

        # Imports
        from hmis.apps.clinics.models import Clinic, ClinicEnrollment, ClinicSession, ClinicVisit
        from hmis.apps.core.models import County, Facility, Organization, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
        from hmis.apps.patients.models import Patient

        # =====================================================================
        # Resolve existing infrastructure
        # =====================================================================
        facility_id = options.get("facility")
        if facility_id:
            facility = Facility.objects.filter(id=facility_id).first()
            if not facility:
                self.stderr.write(self.style.ERROR(f"Facility with id={facility_id} not found."))
                return
            org = facility.organization
        else:
            org = Organization.objects.first()
            if not org:
                self.stderr.write(self.style.ERROR("No Organization found. Run setup first."))
                return
            facility = Facility.objects.filter(organization=org).first()
            if not facility:
                self.stderr.write(self.style.ERROR("No Facility found. Run setup first."))
                return

        user = User.objects.filter(is_active=True).first()
        if not user:
            self.stderr.write(self.style.ERROR("No active User found."))
            return

        county = County.objects.first()
        sub_county = SubCounty.objects.filter(county=county).first()
        if not county or not sub_county:
            self.stderr.write(self.style.ERROR("No Kenya locations found. Run location import."))
            return

        # Map clinics
        anc_clinic = Clinic.objects.filter(name__icontains="antenatal", status="ACTIVE").first()
        ccc_clinic = Clinic.objects.filter(
            name__icontains="comprehensive care", status="ACTIVE"
        ).first()
        diabetic_clinic = Clinic.objects.filter(name__icontains="diabetic", status="ACTIVE").first()
        htn_clinic = Clinic.objects.filter(name__icontains="hypertens", status="ACTIVE").first()
        opd_clinic = Clinic.objects.filter(name__icontains="general opd", status="ACTIVE").first()

        clinics_found = {
            "ANC": anc_clinic,
            "CCC": ccc_clinic,
            "Diabetic": diabetic_clinic,
            "HTN": htn_clinic,
            "OPD": opd_clinic,
        }

        self.stdout.write("Resolved clinics:")
        for label, clinic in clinics_found.items():
            status = f"#{clinic.id} {clinic.name}" if clinic else "NOT FOUND"
            self.stdout.write(f"  {label}: {status}")

        if dry_run:
            self.stdout.write(
                self.style.WARNING("\n[DRY RUN] Would create ~50 patients with clinical data.")
            )
            return

        # =====================================================================
        # Helper: Create patients
        # =====================================================================
        today = date.today()
        period_start = today.replace(day=1) - timedelta(days=60)  # ~2 months back

        first_names_f = [
            "Amina",
            "Wanjiku",
            "Aisha",
            "Mercy",
            "Faith",
            "Grace",
            "Hope",
            "Joy",
            "Lucy",
            "Mary",
        ]
        first_names_m = [
            "Kamau",
            "Ochieng",
            "Mwangi",
            "Kiprop",
            "Wafula",
            "Hassan",
            "Omar",
            "Dennis",
            "Brian",
            "Kevin",
        ]
        last_names = [
            "Muthoni",
            "Odhiambo",
            "Kimani",
            "Kiplagat",
            "Wanjala",
            "Mohamed",
            "Otieno",
            "Njoroge",
            "Karanja",
            "Ndegwa",
        ]

        def make_patient(first_name, last_name, gender, dob):
            return Patient.objects.create(
                first_name=first_name,
                last_name=last_name,
                gender=gender,
                date_of_birth=dob,
                county=county,
                sub_county=sub_county,
                registered_by=user,
                organization=org,
                referral_source="clinic",
                referred_from_facility=SEED_TAG,  # Tag for cleanup
            )

        def random_dob(min_age=20, max_age=65):
            days = random.randint(min_age * 365, max_age * 365)
            return today - timedelta(days=days)

        def random_date_in_period():
            days_back = random.randint(0, 60)
            return today - timedelta(days=days_back)

        created_counts = {
            "patients": 0,
            "enrollments": 0,
            "sessions": 0,
            "visits": 0,
            "encounters": 0,
            "lab_orders": 0,
            "lab_results": 0,
        }

        # =====================================================================
        # 1. ANC Clinic: 10 patients, varying visit counts (KE-CQM-001)
        # =====================================================================
        if anc_clinic:
            self.stdout.write("\n--- Seeding ANC patients (KE-CQM-001: ANC 4+ Visits) ---")
            session, created = ClinicSession.objects.get_or_create(
                clinic=anc_clinic,
                session_date=today,
                defaults={
                    "status": "OPEN",
                    "opened_at": timezone.now(),
                    "opened_by": user,
                    "organization": org,
                    "facility": facility,
                },
            )
            if created:
                created_counts["sessions"] += 1

            # Get next available queue number
            max_queue = (
                ClinicVisit.objects.filter(session=session)
                .order_by("-queue_number")
                .values_list("queue_number", flat=True)
                .first()
                or 0
            )

            for i in range(10):
                name = first_names_f[i]
                patient = make_patient(name, last_names[i], "F", random_dob(18, 40))
                created_counts["patients"] += 1

                ClinicEnrollment.objects.create(
                    clinic=anc_clinic,
                    patient=patient,
                    enrollment_date=period_start,
                    status="ACTIVE",
                    enrolled_by=user,
                )
                created_counts["enrollments"] += 1

                # Vary visit counts: 6 patients get 4+ visits, 4 get <4
                num_visits = [5, 6, 4, 5, 4, 7, 2, 3, 1, 3][i]
                for v in range(num_visits):
                    max_queue += 1
                    visit_date = period_start + timedelta(days=random.randint(0, 55))
                    ClinicVisit.objects.create(
                        session=session,
                        patient=patient,
                        queue_number=max_queue,
                        status="COMPLETED",
                        registered_at=timezone.make_aware(
                            timezone.datetime(
                                visit_date.year, visit_date.month, visit_date.day, 8, 0
                            )
                        ),
                        consultation_started_at=timezone.make_aware(
                            timezone.datetime(
                                visit_date.year,
                                visit_date.month,
                                visit_date.day,
                                8,
                                random.randint(10, 40),
                            )
                        ),
                        completed_at=timezone.make_aware(
                            timezone.datetime(
                                visit_date.year, visit_date.month, visit_date.day, 9, 0
                            )
                        ),
                        organization=org,
                        facility=facility,
                    )
                    created_counts["visits"] += 1

            self.stdout.write(
                self.style.SUCCESS("  Created 10 ANC patients with varying visit counts")
            )

        # =====================================================================
        # 2. HTN Clinic: 10 patients with BP readings (KE-CQM-006)
        # =====================================================================
        if htn_clinic:
            self.stdout.write("\n--- Seeding HTN patients (KE-CQM-006: BP Control) ---")
            for i in range(10):
                gender = "F" if i < 5 else "M"
                name = first_names_f[i] if gender == "F" else first_names_m[i - 5]
                patient = make_patient(name, last_names[(i + 3) % 10], gender, random_dob(35, 70))
                created_counts["patients"] += 1

                ClinicEnrollment.objects.create(
                    clinic=htn_clinic,
                    patient=patient,
                    enrollment_date=period_start - timedelta(days=90),
                    status="ACTIVE",
                    enrolled_by=user,
                )
                created_counts["enrollments"] += 1

                # Create encounter with BP reading
                # 6 controlled (<140/90), 4 uncontrolled
                if i < 6:
                    systolic = random.randint(110, 138)
                    diastolic = random.randint(60, 88)
                else:
                    systolic = random.randint(142, 170)
                    diastolic = random.randint(92, 105)

                enc_date = random_date_in_period()
                Encounter.objects.create(
                    patient=patient,
                    encounter_type="OPD",
                    encounter_date=enc_date,
                    chief_complaint="Hypertension follow-up",
                    blood_pressure=f"{systolic}/{diastolic}",
                    pulse=random.randint(60, 90),
                    temperature=Decimal("36.6"),
                    organization=org,
                    facility=facility,
                )
                created_counts["encounters"] += 1

            self.stdout.write(
                self.style.SUCCESS("  Created 10 HTN patients (6 controlled, 4 uncontrolled)")
            )

        # =====================================================================
        # 3. CCC Clinic: 10 patients with Viral Load results (KE-CQM-003)
        # =====================================================================
        if ccc_clinic:
            self.stdout.write("\n--- Seeding CCC patients (KE-CQM-003: HIV Viral Load) ---")

            # Ensure TestCatalog has a Viral Load test
            vl_test, _ = TestCatalog.objects.get_or_create(
                name="Viral Load",
                defaults={
                    "code": "VL-001",
                    "loinc_code": "20447-9",
                    "category": "VIROLOGY",
                    "specimen_type": "BLOOD",
                },
            )

            for i in range(10):
                gender = "F" if i < 5 else "M"
                name = first_names_f[i] if gender == "F" else first_names_m[i - 5]
                patient = make_patient(name, last_names[(i + 5) % 10], gender, random_dob(25, 55))
                created_counts["patients"] += 1

                ClinicEnrollment.objects.create(
                    clinic=ccc_clinic,
                    patient=patient,
                    enrollment_date=period_start - timedelta(days=180),
                    status="ACTIVE",
                    enrolled_by=user,
                )
                created_counts["enrollments"] += 1

                # Create lab order + result
                lab_order = LabOrder.objects.create(
                    patient=patient,
                    ordered_by=user,
                    priority="ROUTINE",
                    status="COMPLETED",
                    clinical_notes="Routine VL monitoring",
                    organization=org,
                    facility=facility,
                )
                created_counts["lab_orders"] += 1

                order_item = LabOrderItem.objects.create(
                    lab_order=lab_order,
                    test=vl_test,
                    status="COMPLETED",
                )

                # 8 suppressed (<1000), 2 unsuppressed
                if i < 8:
                    vl_value = Decimal(str(random.randint(20, 800)))
                else:
                    vl_value = Decimal(str(random.randint(1500, 50000)))

                result_date = random_date_in_period()
                LabResult.objects.create(
                    order_item=order_item,
                    numeric_value=vl_value,
                    text_value=f"{vl_value} copies/ml",
                    verification_status="VERIFIED",
                    entered_by=user,
                    verified_by=user,
                    entered_at=timezone.make_aware(
                        timezone.datetime(
                            result_date.year, result_date.month, result_date.day, 14, 0
                        )
                    ),
                )
                created_counts["lab_results"] += 1

            self.stdout.write(
                self.style.SUCCESS("  Created 10 CCC patients (8 suppressed, 2 unsuppressed)")
            )

        # =====================================================================
        # 4. Diabetic Clinic: 10 patients with HbA1c results (KE-CQM-005)
        # =====================================================================
        if diabetic_clinic:
            self.stdout.write("\n--- Seeding Diabetic patients (KE-CQM-005: HbA1c Control) ---")

            hba1c_test, _ = TestCatalog.objects.get_or_create(
                name="HbA1c",
                defaults={
                    "code": "HBA1C-001",
                    "loinc_code": "4548-4",
                    "category": "CHEMISTRY",
                    "specimen_type": "BLOOD",
                },
            )

            for i in range(10):
                gender = "M" if i < 6 else "F"
                name = first_names_m[i] if gender == "M" else first_names_f[i - 6]
                patient = make_patient(name, last_names[(i + 7) % 10], gender, random_dob(40, 70))
                created_counts["patients"] += 1

                ClinicEnrollment.objects.create(
                    clinic=diabetic_clinic,
                    patient=patient,
                    enrollment_date=period_start - timedelta(days=120),
                    status="ACTIVE",
                    enrolled_by=user,
                )
                created_counts["enrollments"] += 1

                lab_order = LabOrder.objects.create(
                    patient=patient,
                    ordered_by=user,
                    priority="ROUTINE",
                    status="COMPLETED",
                    clinical_notes="Quarterly HbA1c",
                    organization=org,
                    facility=facility,
                )
                created_counts["lab_orders"] += 1

                order_item = LabOrderItem.objects.create(
                    lab_order=lab_order,
                    test=hba1c_test,
                    status="COMPLETED",
                )

                # 5 controlled (<7%), 5 uncontrolled
                if i < 5:
                    hba1c_value = Decimal(str(round(random.uniform(5.2, 6.8), 1)))
                else:
                    hba1c_value = Decimal(str(round(random.uniform(7.2, 11.5), 1)))

                result_date = random_date_in_period()
                LabResult.objects.create(
                    order_item=order_item,
                    numeric_value=hba1c_value,
                    text_value=f"{hba1c_value}%",
                    verification_status="VERIFIED",
                    entered_by=user,
                    verified_by=user,
                    entered_at=timezone.make_aware(
                        timezone.datetime(
                            result_date.year, result_date.month, result_date.day, 10, 0
                        )
                    ),
                )
                created_counts["lab_results"] += 1

            self.stdout.write(
                self.style.SUCCESS("  Created 10 Diabetic patients (5 controlled, 5 uncontrolled)")
            )

        # =====================================================================
        # 5. OPD Clinic: 15 patients with wait times (KE-CQM-008)
        # =====================================================================
        if opd_clinic:
            self.stdout.write("\n--- Seeding OPD patients (KE-CQM-008: Wait Time) ---")
            session, created = ClinicSession.objects.get_or_create(
                clinic=opd_clinic,
                session_date=today,
                defaults={
                    "status": "OPEN",
                    "opened_at": timezone.now(),
                    "opened_by": user,
                    "organization": org,
                    "facility": facility,
                },
            )
            if created:
                created_counts["sessions"] += 1

            # Get next available queue number
            max_queue = (
                ClinicVisit.objects.filter(session=session)
                .order_by("-queue_number")
                .values_list("queue_number", flat=True)
                .first()
                or 0
            )

            for i in range(15):
                gender = "M" if i % 2 == 0 else "F"
                name = first_names_m[i % 10] if gender == "M" else first_names_f[i % 10]
                patient = make_patient(name, last_names[i % 10], gender, random_dob(18, 70))
                created_counts["patients"] += 1

                visit_date = random_date_in_period()
                reg_hour = 8
                reg_min = random.randint(0, 50)

                # 10 patients seen within 30 min, 5 waited longer
                if i < 10:
                    wait_minutes = random.randint(5, 28)
                else:
                    wait_minutes = random.randint(35, 90)

                consult_min = reg_min + wait_minutes
                consult_hour = reg_hour + (consult_min // 60)
                consult_min = consult_min % 60

                max_queue += 1
                ClinicVisit.objects.create(
                    session=session,
                    patient=patient,
                    queue_number=max_queue,
                    status="COMPLETED",
                    registered_at=timezone.make_aware(
                        timezone.datetime(
                            visit_date.year, visit_date.month, visit_date.day, reg_hour, reg_min
                        )
                    ),
                    consultation_started_at=timezone.make_aware(
                        timezone.datetime(
                            visit_date.year,
                            visit_date.month,
                            visit_date.day,
                            consult_hour,
                            consult_min,
                        )
                    ),
                    completed_at=timezone.make_aware(
                        timezone.datetime(
                            visit_date.year, visit_date.month, visit_date.day, consult_hour + 1, 0
                        )
                    ),
                    organization=org,
                    facility=facility,
                )
                created_counts["visits"] += 1

            self.stdout.write(
                self.style.SUCCESS("  Created 15 OPD visits (10 within 30min, 5 over)")
            )

        # =====================================================================
        # 6. CCC Clinic: Add some DEFAULTED enrollments (KE-CQM-012)
        # =====================================================================
        if ccc_clinic:
            self.stdout.write(
                "\n--- Seeding defaulted enrollments (KE-CQM-012: Enrollment Active) ---"
            )
            for i in range(5):
                name = first_names_m[(i + 5) % 10]
                patient = make_patient(name, last_names[(i + 2) % 10], "M", random_dob(30, 50))
                created_counts["patients"] += 1

                ClinicEnrollment.objects.create(
                    clinic=ccc_clinic,
                    patient=patient,
                    enrollment_date=period_start - timedelta(days=200),
                    status="DEFAULTED",
                    enrolled_by=user,
                    outcome_date=today - timedelta(days=random.randint(10, 40)),
                    outcome_reason="Missed 2+ consecutive appointments",
                )
                created_counts["enrollments"] += 1

            self.stdout.write(self.style.SUCCESS("  Created 5 DEFAULTED CCC enrollments"))

        # =====================================================================
        # Summary
        # =====================================================================
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("Quality Measures demo data seeded successfully!"))
        self.stdout.write("=" * 60)
        for key, count in created_counts.items():
            self.stdout.write(f"  {key}: {count}")

        self.stdout.write(
            "\nRun evaluation: POST /api/quality/results/evaluate/ "
            "(select 'All Clinics' on the domain page)"
        )

    def _clear_seeded_data(self):
        """Remove all data tagged with SEED_TAG."""
        from hmis.apps.clinics.models import ClinicEnrollment, ClinicSession, ClinicVisit
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.patients.models import Patient

        patients = Patient.objects.filter(referred_from_facility=SEED_TAG)
        patient_ids = list(patients.values_list("id", flat=True))
        count = patients.count()

        if count == 0:
            self.stdout.write("No seeded data found.")
            return

        # Delete in dependency order
        LabOrder.objects.filter(patient_id__in=patient_ids).delete()
        Encounter.objects.filter(patient_id__in=patient_ids).delete()
        ClinicVisit.objects.filter(patient_id__in=patient_ids).delete()
        ClinicEnrollment.objects.filter(patient_id__in=patient_ids).delete()
        patients.delete()

        # Clean up empty sessions
        ClinicSession.objects.filter(visits__isnull=True).delete()

        self.stdout.write(self.style.SUCCESS(f"Cleared {count} seeded patients and related data."))
