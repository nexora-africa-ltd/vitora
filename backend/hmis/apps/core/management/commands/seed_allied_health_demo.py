"""
Management command to seed comprehensive Allied Health demo data.

Creates:
- Allied Health staff users with proper roles
- Allied Health clinics (Physiotherapy, Nutrition, OT, Social Work, Counselling)
- Demo orders, sessions, consultations, referrals, and cases

Usage:
    python manage.py seed_allied_health_demo
    python manage.py seed_allied_health_demo --clear   # Clear existing demo data first
    python manage.py seed_allied_health_demo --dry-run # Preview without changes
"""

# ruff: noqa: S311

import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction

User = get_user_model()


class Command(BaseCommand):
    """Seed comprehensive Allied Health demo data for staging/demo environment."""

    help = "Seed Allied Health demo data including staff, clinics, and sample records"

    # =========================================================================
    # Allied Health Staff Definitions
    # =========================================================================
    ALLIED_HEALTH_STAFF = [
        {
            "username": "demo_physiotherapist",
            "email": "physio@demo.vitora.health",
            "password": "DemoPhysio2026?!",
            "first_name": "Alice",
            "last_name": "Muthoni",
            "role_code": "PHYSIOTHERAPIST",
            "department_code": "PHYSIO",
            "employee_id": "VH-2026-AH01",
            "title": "",
            "phone": "0722000020",
            "license_number": "KSP-2020-12345",
            "licensing_body": "Kenya Society of Physiotherapists",
            "specialization": "Musculoskeletal Rehabilitation",
        },
        {
            "username": "demo_dietitian",
            "email": "nutrition@demo.vitora.health",
            "password": "DemoDietitian2026?!",
            "first_name": "Sarah",
            "last_name": "Wangui",
            "role_code": "DIETITIAN",
            "department_code": "PHYSIO",  # Falls under allied health
            "employee_id": "VH-2026-AH02",
            "title": "",
            "phone": "0722000021",
            "license_number": "KNDI-2019-54321",
            "licensing_body": "Kenya Nutritionists and Dietitians Institute",
            "specialization": "Clinical Nutrition",
        },
        {
            "username": "demo_ot",
            "email": "ot@demo.vitora.health",
            "password": "DemoOT2026?!",
            "first_name": "David",
            "last_name": "Kiprotich",
            "role_code": "OCCUPATIONAL_THERAPIST",
            "department_code": "PHYSIO",
            "employee_id": "VH-2026-AH03",
            "title": "",
            "phone": "0722000022",
            "license_number": "KOTA-2021-67890",
            "licensing_body": "Kenya Occupational Therapists Association",
            "specialization": "Neurological Rehabilitation",
        },
        {
            "username": "demo_social_worker",
            "email": "socialwork@demo.vitora.health",
            "password": "DemoSW2026?!",
            "first_name": "Esther",
            "last_name": "Adhiambo",
            "role_code": "SOCIAL_WORKER",
            "department_code": "PHYSIO",
            "employee_id": "VH-2026-AH04",
            "title": "",
            "phone": "0722000023",
            "license_number": "KNASW-2018-11111",
            "licensing_body": "Kenya National Association of Social Workers",
            "specialization": "Medical Social Work",
        },
        {
            "username": "demo_counsellor",
            "email": "counselling@demo.vitora.health",
            "password": "DemoCounsellor2026?!",
            "first_name": "James",
            "last_name": "Otieno",
            "role_code": "COUNSELLOR",
            "department_code": "PHYSIO",
            "employee_id": "VH-2026-AH05",
            "title": "",
            "phone": "0722000024",
            "license_number": "KCPA-2020-22222",
            "licensing_body": "Kenya Counselling and Psychological Association",
            "specialization": "HIV/Mental Health Counselling",
        },
    ]

    # =========================================================================
    # Allied Health Clinic Definitions
    # =========================================================================
    ALLIED_HEALTH_CLINICS = [
        {
            "name": "Physiotherapy Clinic",
            "code": "PHYSIO-CLINIC",
            "clinic_type": "PHYSIO",
            "description": "Physiotherapy and rehabilitation services",
            "capacity": 6,
        },
        {
            "name": "Nutrition Clinic",
            "code": "NUTRITION-CLINIC",
            "clinic_type": "NUTRITION",
            "description": "Nutrition assessment and dietary counselling",
            "capacity": 5,
        },
        {
            "name": "Occupational Therapy Clinic",
            "code": "OT-CLINIC",
            "clinic_type": "OT",
            "description": "Occupational therapy and ADL training",
            "capacity": 4,
        },
        {
            "name": "Social Work Services",
            "code": "SW-CLINIC",
            "clinic_type": "SOCIAL_WORK",
            "description": "Medical social work and case management",
            "capacity": 3,
        },
        {
            "name": "Counselling Services",
            "code": "COUNS-CLINIC",
            "clinic_type": "COUNSELLING",
            "description": "Individual and group counselling services",
            "capacity": 5,
        },
    ]

    # =========================================================================
    # Demo Patient Specs for Allied Health
    # =========================================================================
    ALLIED_HEALTH_PATIENTS = [
        {
            "identification_number": "DEMO-PT-AH01",
            "first_name": "Robert",
            "last_name": "Kiptoo",
            "gender": "M",
            "date_of_birth": date.today() - timedelta(days=365 * 35),
            "notes": "Post-ACL surgery - physiotherapy patient",
        },
        {
            "identification_number": "DEMO-PT-AH02",
            "first_name": "Elizabeth",
            "last_name": "Nyokabi",
            "gender": "F",
            "date_of_birth": date.today() - timedelta(days=365 * 48),
            "notes": "Diabetic - nutrition counselling",
        },
        {
            "identification_number": "DEMO-PT-AH03",
            "first_name": "Michael",
            "last_name": "Omondi",
            "gender": "M",
            "date_of_birth": date.today() - timedelta(days=365 * 62),
            "notes": "Post-stroke - OT rehabilitation",
        },
        {
            "identification_number": "DEMO-PT-AH04",
            "first_name": "Janet",
            "last_name": "Were",
            "gender": "F",
            "date_of_birth": date.today() - timedelta(days=365 * 28),
            "notes": "Social work - discharge planning",
            "is_sensitive": False,
        },
        {
            "identification_number": "DEMO-PT-AH05",
            "first_name": "Samuel",
            "last_name": "Mutua",
            "gender": "M",
            "date_of_birth": date.today() - timedelta(days=365 * 42),
            "notes": "HIV adherence counselling",
            "is_sensitive": True,
        },
        {
            "identification_number": "DEMO-PT-AH06",
            "first_name": "Lucy",
            "last_name": "Chepkoech",
            "gender": "F",
            "date_of_birth": date.today() - timedelta(days=365 * 55),
            "notes": "Chronic back pain - physio",
        },
        {
            "identification_number": "DEMO-PT-AH07",
            "first_name": "Patrick",
            "last_name": "Njuguna",
            "gender": "M",
            "date_of_birth": date.today() - timedelta(days=365 * 8),
            "notes": "Pediatric OT - developmental delay",
        },
        {
            "identification_number": "DEMO-PT-AH08",
            "first_name": "Margaret",
            "last_name": "Achieng",
            "gender": "F",
            "date_of_birth": date.today() - timedelta(days=365 * 32),
            "notes": "GBV case - social work",
            "is_sensitive": True,
        },
        {
            "identification_number": "DEMO-PT-AH09",
            "first_name": "Joseph",
            "last_name": "Karanja",
            "gender": "M",
            "date_of_birth": date.today() - timedelta(days=365 * 45),
            "notes": "Weight management - nutrition",
        },
        {
            "identification_number": "DEMO-PT-AH10",
            "first_name": "Catherine",
            "last_name": "Wambui",
            "gender": "F",
            "date_of_birth": date.today() - timedelta(days=365 * 38),
            "notes": "Mental health counselling - anxiety",
            "is_sensitive": True,
        },
    ]

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing allied health demo data before seeding",
        )
        parser.add_argument(
            "--skip-staff",
            action="store_true",
            help="Skip staff user creation",
        )
        parser.add_argument(
            "--skip-clinics",
            action="store_true",
            help="Skip clinic creation",
        )
        parser.add_argument(
            "--skip-patients",
            action="store_true",
            help="Skip patient and demo record creation",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        dry_run = options["dry_run"]
        clear = options["clear"]
        skip_staff = options["skip_staff"]
        skip_clinics = options["skip_clinics"]
        skip_patients = options["skip_patients"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))

        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write(self.style.SUCCESS("Allied Health Demo Data Seeding"))
        self.stdout.write(self.style.SUCCESS("=" * 70))

        with transaction.atomic():
            # Import models here to avoid app loading issues
            from hmis.apps.clinics.models import Clinic
            from hmis.apps.core.models import County, Department, Role, StaffProfile
            from hmis.apps.counselling.models import (
                CounsellingReferral,
                CounsellingSession,
                CounsellingType,
            )
            from hmis.apps.encounters.models import Encounter
            from hmis.apps.nutrition.models import DietPlan, NutritionConsultation
            from hmis.apps.occupational_therapy.models import (
                OccupationalTherapyOrder,
                OTSession,
                OTTreatmentType,
            )
            from hmis.apps.patients.models import Patient
            from hmis.apps.physiotherapy.models import (
                PhysiotherapyOrder,
                PhysiotherapySession,
                PhysiotherapyTreatmentType,
            )
            from hmis.apps.social_work.models import CaseNote, SocialWorkCase, SocialWorkReferral

            if clear and not dry_run:
                self._clear_demo_data()

            # Step 1: Create Allied Health Staff
            staff_map = {}
            if not skip_staff:
                staff_map = self._create_allied_health_staff(
                    dry_run, Department, Role, StaffProfile
                )
            else:
                self.stdout.write("\n⏭️  Skipping staff creation (--skip-staff)")
                # Try to get existing demo staff
                for staff_data in self.ALLIED_HEALTH_STAFF:
                    try:
                        user = User.objects.get(username=staff_data["username"])
                        staff_map[staff_data["role_code"]] = user
                    except User.DoesNotExist:
                        pass

            # Step 2: Create Allied Health Clinics
            clinics_map = {}
            if not skip_clinics:
                clinics_map = self._create_allied_health_clinics(dry_run, Clinic)
            else:
                self.stdout.write("\n⏭️  Skipping clinic creation (--skip-clinics)")
                # Try to get existing clinics
                for clinic_data in self.ALLIED_HEALTH_CLINICS:
                    try:
                        clinic = Clinic.objects.get(code=clinic_data["code"])
                        clinics_map[clinic_data["clinic_type"]] = clinic
                    except Clinic.DoesNotExist:
                        pass

            # Step 3: Create Demo Patients and Records
            if not skip_patients:
                # Ensure treatment types are loaded
                physio_types = list(PhysiotherapyTreatmentType.objects.filter(is_active=True))
                ot_types = list(OTTreatmentType.objects.filter(is_active=True))
                counselling_types = list(CounsellingType.objects.filter(is_active=True))

                if not physio_types or not ot_types or not counselling_types:
                    self.stdout.write(
                        self.style.WARNING(
                            "\n⚠️  Treatment types not found. "
                            "Run 'seed_allied_health_data' first to load fixtures."
                        )
                    )

                patients = self._create_allied_health_patients(dry_run, Patient, County)
                self._create_demo_records(
                    dry_run=dry_run,
                    patients=patients,
                    staff_map=staff_map,
                    clinics_map=clinics_map,
                    physio_types=physio_types,
                    ot_types=ot_types,
                    counselling_types=counselling_types,
                    # Models
                    Encounter=Encounter,
                    PhysiotherapyOrder=PhysiotherapyOrder,
                    PhysiotherapySession=PhysiotherapySession,
                    NutritionConsultation=NutritionConsultation,
                    DietPlan=DietPlan,
                    OccupationalTherapyOrder=OccupationalTherapyOrder,
                    OTSession=OTSession,
                    SocialWorkReferral=SocialWorkReferral,
                    SocialWorkCase=SocialWorkCase,
                    CaseNote=CaseNote,
                    CounsellingReferral=CounsellingReferral,
                    CounsellingSession=CounsellingSession,
                )
            else:
                self.stdout.write("\n⏭️  Skipping patient/record creation (--skip-patients)")

        # Summary
        self._print_summary(dry_run)

    def _clear_demo_data(self):
        """Clear previously seeded allied health demo data."""
        from hmis.apps.counselling.models import CounsellingReferral, CounsellingSession
        from hmis.apps.nutrition.models import DietPlan, NutritionConsultation
        from hmis.apps.occupational_therapy.models import OccupationalTherapyOrder, OTSession
        from hmis.apps.patients.models import Patient
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder, PhysiotherapySession
        from hmis.apps.social_work.models import CaseNote, SocialWorkCase, SocialWorkReferral

        self.stdout.write("\n🗑️  Clearing existing Allied Health demo data...")

        # Get demo patients
        demo_patients = Patient.objects.filter(identification_number__startswith="DEMO-PT-AH")

        if demo_patients.exists():
            # Delete related records
            count = PhysiotherapySession.objects.filter(order__patient__in=demo_patients).count()
            PhysiotherapySession.objects.filter(order__patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} physiotherapy sessions")

            count = PhysiotherapyOrder.objects.filter(patient__in=demo_patients).count()
            PhysiotherapyOrder.objects.filter(patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} physiotherapy orders")

            count = DietPlan.objects.filter(consultation__patient__in=demo_patients).count()
            DietPlan.objects.filter(consultation__patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} diet plans")

            count = NutritionConsultation.objects.filter(patient__in=demo_patients).count()
            NutritionConsultation.objects.filter(patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} nutrition consultations")

            count = OTSession.objects.filter(order__patient__in=demo_patients).count()
            OTSession.objects.filter(order__patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} OT sessions")

            count = OccupationalTherapyOrder.objects.filter(patient__in=demo_patients).count()
            OccupationalTherapyOrder.objects.filter(patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} OT orders")

            count = CaseNote.objects.filter(case__patient__in=demo_patients).count()
            CaseNote.objects.filter(case__patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} case notes")

            count = SocialWorkCase.objects.filter(patient__in=demo_patients).count()
            SocialWorkCase.objects.filter(patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} social work cases")

            count = SocialWorkReferral.objects.filter(patient__in=demo_patients).count()
            SocialWorkReferral.objects.filter(patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} social work referrals")

            count = CounsellingSession.objects.filter(referral__patient__in=demo_patients).count()
            CounsellingSession.objects.filter(referral__patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} counselling sessions")

            count = CounsellingReferral.objects.filter(patient__in=demo_patients).count()
            CounsellingReferral.objects.filter(patient__in=demo_patients).delete()
            self.stdout.write(f"  Deleted {count} counselling referrals")

    def _create_allied_health_staff(self, dry_run, Department, Role, StaffProfile):
        """Create Allied Health staff users."""
        self.stdout.write("\n👥 Creating Allied Health Staff...")

        staff_map = {}
        departments_map = {d.code: d for d in Department.objects.all()}

        for staff_data in self.ALLIED_HEALTH_STAFF:
            role_code = staff_data["role_code"]
            department_code = staff_data["department_code"]

            if dry_run:
                self.stdout.write(f"  Would create: {staff_data['username']} ({role_code})")
                continue

            # Create/update user
            user, created = User.objects.update_or_create(
                username=staff_data["username"],
                defaults={
                    "email": staff_data["email"],
                    "first_name": staff_data["first_name"],
                    "last_name": staff_data["last_name"],
                    "is_staff": False,
                    "is_superuser": False,
                },
            )
            user.set_password(staff_data["password"])
            user.save()

            # Get role and department
            role = Role.objects.filter(code=role_code).first()
            department = departments_map.get(department_code)

            if role:
                # Create/update StaffProfile
                staff_defaults = {
                    "employee_id": staff_data["employee_id"],
                    "title": staff_data.get("title", ""),
                    "primary_role": role,
                    "phone_number": staff_data.get("phone", ""),
                    "license_number": staff_data.get("license_number", ""),
                    "licensing_body": staff_data.get("licensing_body", ""),
                    "specialization": staff_data.get("specialization", ""),
                    "employment_status": "ACTIVE",
                    "employment_type": "PERMANENT",
                    "date_joined": date.today() - timedelta(days=365),
                }
                if department:
                    staff_defaults["primary_department"] = department

                StaffProfile.objects.update_or_create(
                    user=user,
                    defaults=staff_defaults,
                )

                # Add to Django group
                if role.django_group:
                    user.groups.add(role.django_group)

                # Also add to allied health permission groups
                group_names = {
                    "PHYSIOTHERAPIST": "physiotherapists",
                    "DIETITIAN": "dietitians",
                    "OCCUPATIONAL_THERAPIST": "occupational_therapists",
                    "SOCIAL_WORKER": "social_workers",
                    "COUNSELLOR": "counsellors",
                }
                if role_code in group_names:
                    try:
                        ah_group = Group.objects.get(name=group_names[role_code])
                        user.groups.add(ah_group)
                    except Group.DoesNotExist:
                        pass

                self.stdout.write(
                    self.style.SUCCESS(
                        f"  ✓ {'Created' if created else 'Updated'}: {user.username} ({role.name})"
                    )
                )
                staff_map[role_code] = user
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"  ⚠ Created user {user.username} but role '{role_code}' not found"
                    )
                )

        return staff_map

    def _create_allied_health_clinics(self, dry_run, Clinic):
        """Create Allied Health clinics."""
        self.stdout.write("\n🏥 Creating Allied Health Clinics...")

        clinics_map = {}

        for clinic_data in self.ALLIED_HEALTH_CLINICS:
            if dry_run:
                self.stdout.write(f"  Would create: {clinic_data['name']}")
                continue

            clinic, created = Clinic.objects.update_or_create(
                code=clinic_data["code"],
                defaults={
                    "name": clinic_data["name"],
                    "clinic_type": clinic_data["clinic_type"],
                    "description": clinic_data["description"],
                    "capacity": clinic_data["capacity"],
                    "status": "ACTIVE",
                    "requires_appointment": False,
                },
            )

            self.stdout.write(
                self.style.SUCCESS(f"  ✓ {'Created' if created else 'Updated'}: {clinic.name}")
            )
            clinics_map[clinic_data["clinic_type"]] = clinic

        return clinics_map

    def _create_allied_health_patients(self, dry_run, Patient, County):
        """Create Allied Health demo patients."""
        self.stdout.write("\n🧑‍🤝‍🧑 Creating Allied Health Demo Patients...")

        patients = []
        counties = list(County.objects.all()[:5])

        if not counties:
            self.stdout.write(
                self.style.WARNING("  ⚠ No counties found. Run import_kenya_locations first.")
            )
            return patients

        default_county = counties[0]
        default_sub_counties = list(default_county.sub_counties.all()[:5])
        if not default_sub_counties:
            self.stdout.write(self.style.WARNING("  ⚠ No sub-counties found."))
            return patients

        default_sub_county = default_sub_counties[0]

        # Get a registered_by user
        try:
            registered_by = User.objects.get(username="demo_receptionist")
        except User.DoesNotExist:
            registered_by = User.objects.filter(is_active=True).first()

        if not registered_by:
            self.stdout.write(self.style.WARNING("  ⚠ No user found for registered_by."))
            return patients

        for spec in self.ALLIED_HEALTH_PATIENTS:
            if dry_run:
                self.stdout.write(f"  Would create: {spec['first_name']} {spec['last_name']}")
                continue

            patient, created = Patient.objects.update_or_create(
                identification_type="temporary_id",
                identification_number=spec["identification_number"],
                defaults={
                    "first_name": spec["first_name"],
                    "last_name": spec["last_name"],
                    "date_of_birth": spec["date_of_birth"],
                    "gender": spec["gender"],
                    "county": default_county,
                    "sub_county": default_sub_county,
                    "registered_by": registered_by,
                    "phone_number": f"07{random.randint(10000000, 99999999)}",
                    "consent_given": True,
                    "is_sensitive": bool(spec.get("is_sensitive", False)),
                    "address": spec.get("notes", ""),
                },
            )
            patients.append(patient)
            self.stdout.write(
                self.style.SUCCESS(
                    f"  ✓ {'Created' if created else 'Updated'}: "
                    f"{patient.first_name} {patient.last_name} ({patient.mrn})"
                )
            )

        return patients

    def _create_demo_records(
        self,
        dry_run,
        patients,
        staff_map,
        clinics_map,
        physio_types,
        ot_types,
        counselling_types,
        **models,
    ):
        """Create demo orders, consultations, referrals, and sessions."""
        if not patients:
            self.stdout.write("\n⚠️  No patients available for demo records.")
            return

        # Unpack models
        Encounter = models["Encounter"]
        PhysiotherapyOrder = models["PhysiotherapyOrder"]
        PhysiotherapySession = models["PhysiotherapySession"]
        NutritionConsultation = models["NutritionConsultation"]
        DietPlan = models["DietPlan"]
        OccupationalTherapyOrder = models["OccupationalTherapyOrder"]
        OTSession = models["OTSession"]
        SocialWorkReferral = models["SocialWorkReferral"]
        SocialWorkCase = models["SocialWorkCase"]
        CaseNote = models["CaseNote"]
        CounsellingReferral = models["CounsellingReferral"]
        CounsellingSession = models["CounsellingSession"]

        # Get a clinician for encounters
        try:
            clinician = User.objects.get(username="demo_doctor")
        except User.DoesNotExist:
            clinician = User.objects.filter(is_active=True).first()

        if dry_run:
            self.stdout.write("\n📋 Would create demo records for each patient:")
            self.stdout.write("  • Physiotherapy orders and sessions")
            self.stdout.write("  • Nutrition consultations and diet plans")
            self.stdout.write("  • OT orders and sessions")
            self.stdout.write("  • Social work referrals and cases")
            self.stdout.write("  • Counselling referrals and sessions")
            return

        self.stdout.write("\n📋 Creating Demo Allied Health Records...")

        # Create records for each patient
        physio_count = 0
        nutrition_count = 0
        ot_count = 0
        sw_count = 0
        counselling_count = 0

        for patient in patients:
            # Get or create an encounter for this patient
            encounter, _ = Encounter.objects.get_or_create(
                patient=patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=random.randint(1, 30)),
                defaults={
                    "chief_complaint": "Allied Health demo encounter",
                    "assigned_clinician": clinician,
                    "created_by": clinician,
                    "status": "COMPLETED",
                },
            )

            # Physiotherapy (patients 0, 5)
            patient_idx = patients.index(patient)
            if patient_idx in [0, 5] and physio_types:
                physio_count += self._create_physio_demo(
                    patient,
                    encounter,
                    staff_map.get("PHYSIOTHERAPIST"),
                    clinician,
                    physio_types,
                    clinics_map.get("PHYSIO"),
                    PhysiotherapyOrder,
                    PhysiotherapySession,
                )

            # Nutrition (patients 1, 8)
            if patient_idx in [1, 8]:
                nutrition_count += self._create_nutrition_demo(
                    patient,
                    encounter,
                    staff_map.get("DIETITIAN"),
                    clinician,
                    NutritionConsultation,
                    DietPlan,
                )

            # OT (patients 2, 6)
            if patient_idx in [2, 6] and ot_types:
                ot_count += self._create_ot_demo(
                    patient,
                    encounter,
                    staff_map.get("OCCUPATIONAL_THERAPIST"),
                    clinician,
                    ot_types,
                    clinics_map.get("OT"),
                    OccupationalTherapyOrder,
                    OTSession,
                )

            # Social Work (patients 3, 7)
            if patient_idx in [3, 7]:
                sw_count += self._create_social_work_demo(
                    patient,
                    encounter,
                    staff_map.get("SOCIAL_WORKER"),
                    clinician,
                    SocialWorkReferral,
                    SocialWorkCase,
                    CaseNote,
                )

            # Counselling (patients 4, 9)
            if patient_idx in [4, 9] and counselling_types:
                counselling_count += self._create_counselling_demo(
                    patient,
                    encounter,
                    staff_map.get("COUNSELLOR"),
                    clinician,
                    counselling_types,
                    CounsellingReferral,
                    CounsellingSession,
                )

        self.stdout.write(f"  ✓ Created {physio_count} physiotherapy orders/sessions")
        self.stdout.write(f"  ✓ Created {nutrition_count} nutrition consultations")
        self.stdout.write(f"  ✓ Created {ot_count} OT orders/sessions")
        self.stdout.write(f"  ✓ Created {sw_count} social work referrals/cases")
        self.stdout.write(f"  ✓ Created {counselling_count} counselling referrals/sessions")

    def _create_physio_demo(
        self,
        patient,
        encounter,
        therapist,
        ordered_by,
        treatment_types,
        clinic,
        PhysiotherapyOrder,
        PhysiotherapySession,
    ):
        """Create physiotherapy demo order and sessions."""
        if not therapist:
            return 0

        treatment_type = random.choice(treatment_types)

        # Create order
        order, created = PhysiotherapyOrder.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            treatment_type=treatment_type,
            defaults={
                "ordered_by": ordered_by,
                "assigned_therapist": therapist,
                "referral_reason": random.choice(["POST_INJURY", "CHRONIC_PAIN", "POST_SURGERY"]),
                "clinical_indication": f"Allied Health demo - {treatment_type.name}",
                "total_sessions": 6,
                "frequency": "2x per week",
                "treatment_goals": "Improve range of motion, reduce pain, restore function",
                "priority": "ROUTINE",
                "status": "IN_PROGRESS",
                "start_date": date.today() - timedelta(days=14),
            },
        )

        # Create 3 completed sessions
        for i in range(3):
            session_date = date.today() - timedelta(days=14 - (i * 3))
            PhysiotherapySession.objects.get_or_create(
                order=order,
                session_number=i + 1,
                defaults={
                    "therapist": therapist,
                    "scheduled_date": session_date,
                    "actual_date": session_date,
                    "status": "COMPLETED",
                    "duration_minutes": 30,
                    "pre_pain_score": 7 - i,
                    "post_pain_score": 5 - i,
                    "outcome": "IMPROVED",
                    "interventions": f"Session {i + 1}: {treatment_type.name}",
                    "progress_notes": f"Patient progressing well after session {i + 1}",
                },
            )

        return 1 if created else 0

    def _create_nutrition_demo(
        self,
        patient,
        encounter,
        dietitian,
        referred_by,
        NutritionConsultation,
        DietPlan,
    ):
        """Create nutrition consultation and diet plan."""
        if not dietitian:
            return 0

        # Create consultation
        consultation, created = NutritionConsultation.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            defaults={
                "dietitian": dietitian,
                "referred_by": referred_by,
                "referral_reason": random.choice(
                    ["DIABETES", "WEIGHT_MANAGEMENT", "CARDIOVASCULAR"]
                ),
                "status": "COMPLETED",
                "priority": "ROUTINE",
                "weight": Decimal(str(round(random.uniform(60, 95), 2))),
                "height": Decimal(str(round(random.uniform(155, 180), 2))),
                "nutrition_goals": "Allied Health demo - nutrition assessment completed",
                "recommendations": "Follow prescribed diet plan, reduce sodium intake",
                "follow_up_plan": "Return in 30 days for weight check and diet review",
                "follow_up_date": date.today() + timedelta(days=30),
            },
        )

        # Create diet plan
        if created:
            DietPlan.objects.get_or_create(
                patient=patient,
                consultation=consultation,
                defaults={
                    "name": f"Diet Plan for {patient.first_name}",
                    "plan_type": "THERAPEUTIC",
                    "start_date": date.today(),
                    "end_date": date.today() + timedelta(days=90),
                    "target_calories": random.randint(1800, 2200),
                    "restrictions": "Low sodium, limited refined sugars",
                    "meal_plan": "3 main meals + 2 healthy snacks daily",
                    "goals": "Achieve healthy weight and manage blood glucose levels",
                    "status": "ACTIVE",
                    "created_by": dietitian,
                },
            )

        return 1 if created else 0

    def _create_ot_demo(
        self,
        patient,
        encounter,
        therapist,
        ordered_by,
        treatment_types,
        clinic,
        OccupationalTherapyOrder,
        OTSession,
    ):
        """Create OT demo order and sessions."""
        if not therapist:
            return 0

        treatment_type = random.choice(treatment_types)

        # Create order
        order, created = OccupationalTherapyOrder.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            treatment_type=treatment_type,
            defaults={
                "ordered_by": ordered_by,
                "assigned_therapist": therapist,
                "assessment_type": random.choice(["INITIAL", "FUNCTIONAL", "ADL"]),
                "referral_reason": random.choice(["STROKE_REHAB", "ADL_SUPPORT", "DEVELOPMENTAL"]),
                "clinical_indication": f"Allied Health demo - {treatment_type.name}",
                "total_sessions": 8,
                "frequency": "2x per week",
                "treatment_goals": "Improve independence in daily activities",
                "priority": "ROUTINE",
                "status": "IN_PROGRESS",
                "start_date": date.today() - timedelta(days=21),
            },
        )

        # Create 4 completed sessions
        independence_levels = ["MOD_ASSIST", "MIN_ASSIST", "SUPERVISION", "MODIFIED_IND"]
        for i in range(4):
            session_date = date.today() - timedelta(days=21 - (i * 4))
            OTSession.objects.get_or_create(
                order=order,
                session_number=i + 1,
                defaults={
                    "therapist": therapist,
                    "scheduled_date": session_date,
                    "actual_date": session_date,
                    "status": "COMPLETED",
                    "duration_minutes": 45,
                    "pre_functional_status": (
                        independence_levels[i] if i < len(independence_levels) else "MIN_ASSIST"
                    ),
                    "post_functional_status": independence_levels[
                        min(i + 1, len(independence_levels) - 1)
                    ],
                    "outcome": "IMPROVED",
                    "activities_performed": f"Session {i + 1}: {treatment_type.name}",
                    "progress_notes": f"ADL training session {i + 1} - good progress",
                },
            )

        return 1 if created else 0

    def _create_social_work_demo(
        self,
        patient,
        encounter,
        social_worker,
        referred_by,
        SocialWorkReferral,
        SocialWorkCase,
        CaseNote,
    ):
        """Create social work referral and case."""
        if not social_worker:
            return 0

        is_sensitive = patient.is_sensitive
        referral_reason = "GBV" if is_sensitive else "DISCHARGE_PLANNING"

        # Create referral
        referral, created = SocialWorkReferral.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            defaults={
                "referred_by": referred_by,
                "assigned_worker": social_worker,
                "reason": referral_reason,
                "urgency": "URGENT" if is_sensitive else "ROUTINE",
                "status": "ACCEPTED",
                "is_sensitive": is_sensitive,
                "clinical_summary": f"Allied Health demo - {referral_reason} referral",
                "presenting_issues": "Patient requires social work intervention",
            },
        )

        # Create case
        if created:
            case, _ = SocialWorkCase.objects.get_or_create(
                referral=referral,
                patient=patient,
                defaults={
                    "assigned_worker": social_worker,
                    "case_type": referral_reason,
                    "title": f"Demo case - {referral_reason.replace('_', ' ').title()}",
                    "status": "IN_PROGRESS",
                    "is_sensitive": is_sensitive,
                    "presenting_problem": "Initial assessment completed for demo case",
                    "risk_level": "HIGH" if is_sensitive else "LOW",
                    "goals": "Provide support and connect with resources",
                    "intervention_plan": "Weekly follow-up sessions, resource linkage",
                },
            )

            # Create case note
            CaseNote.objects.create(
                case=case,
                author=social_worker,
                note_type="INITIAL",
                content="Initial contact made. Patient cooperative and engaged.",
                is_confidential=is_sensitive,
            )

        return 1 if created else 0

    def _create_counselling_demo(
        self,
        patient,
        encounter,
        counsellor,
        referred_by,
        counselling_types,
        CounsellingReferral,
        CounsellingSession,
    ):
        """Create counselling referral and session."""
        if not counsellor:
            return 0

        counselling_type = random.choice(counselling_types)
        is_sensitive = patient.is_sensitive

        # Create referral
        referral, created = CounsellingReferral.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            counselling_type=counselling_type,
            defaults={
                "referred_by": referred_by,
                "assigned_counsellor": counsellor,
                "reason": "HIV_ADHERENCE" if is_sensitive else "STRESS",
                "urgency": "ROUTINE",
                "status": "IN_PROGRESS",
                "is_sensitive": is_sensitive,
                "clinical_summary": f"Allied Health demo - {counselling_type.name}",
                "presenting_issues": "Patient requires counselling support",
            },
        )

        # Create 2 sessions
        if created:
            for i in range(2):
                session_date = date.today() - timedelta(days=14 - (i * 7))
                CounsellingSession.objects.get_or_create(
                    referral=referral,
                    session_sequence=i + 1,
                    defaults={
                        "counsellor": counsellor,
                        "scheduled_date": session_date,
                        "actual_date": session_date,
                        "status": "COMPLETED",
                        "duration_minutes": 45,
                        "session_type": counselling_type.category,
                        "progress_notes": f"Session {i + 1} completed. Patient engaged well.",
                        "pre_session_mood": 5 + i,
                        "post_session_mood": 7 + i,
                        "follow_up_required": "CONTINUE" if i == 0 else "DISCHARGE",
                    },
                )

        return 1 if created else 0

    def _print_summary(self, dry_run):
        """Print final summary."""
        self.stdout.write("\n" + "=" * 70)

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN COMPLETE - No changes were made"))
        else:
            self.stdout.write(self.style.SUCCESS("✅ Allied Health Demo Data Seeding Complete!"))

        self.stdout.write("=" * 70)

        self.stdout.write("\n📊 Summary:")
        self.stdout.write("  • 5 Allied Health staff users created")
        self.stdout.write("  • 5 Allied Health clinics configured")
        self.stdout.write("  • 10 Demo patients with allied health records")
        self.stdout.write("  • Demo orders/sessions for each module")

        self.stdout.write("\n🔑 Demo Staff Credentials:")
        for staff in self.ALLIED_HEALTH_STAFF:
            self.stdout.write(
                f"  • {staff['role_code'].replace('_', ' ').title()}: "
                f"{staff['username']} / {staff['password']}"
            )

        self.stdout.write("\n💡 Tip: Run with --clear to reset allied health demo data")
