"""
Django management command to seed comprehensive demo data for staging environment.

Creates:
- Demo users with proper StaffProfiles linked to Roles and Departments
- Departments (OPD, IPD, Pharmacy, Laboratory, etc.)
- Wards with Beds
- Sample patients with encounters
- Sample prescriptions and lab orders
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed comprehensive demo data for staging/demo environment"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force seeding even if demo users already exist",
        )

    def handle(self, *args, **options):
        from datetime import date, timedelta
        from decimal import Decimal
        from random import choice, randint

        from django.contrib.auth import get_user_model
        from django.db import transaction

        from hmis.apps.core.models import County, Department, Role, StaffProfile
        from hmis.apps.patients.models import Patient

        User = get_user_model()

        # =================================================================
        # Department definitions
        # =================================================================
        DEPARTMENTS = [
            {
                "code": "OPD",
                "name": "Outpatient Department",
                "department_type": "CLINICAL",
            },
            {
                "code": "IPD",
                "name": "Inpatient Department",
                "department_type": "CLINICAL",
            },
            {
                "code": "EMERG",
                "name": "Emergency Department",
                "department_type": "CLINICAL",
            },
            {
                "code": "PHARM",
                "name": "Pharmacy",
                "department_type": "PHARMACY",
            },
            {
                "code": "LAB",
                "name": "Laboratory",
                "department_type": "LABORATORY",
            },
            {
                "code": "RAD",
                "name": "Radiology",
                "department_type": "RADIOLOGY",
            },
            {
                "code": "MCH",
                "name": "Maternal & Child Health",
                "department_type": "CLINICAL",
            },
            {
                "code": "DENTAL",
                "name": "Dental Clinic",
                "department_type": "CLINICAL",
            },
            {
                "code": "PHYSIO",
                "name": "Physiotherapy",
                "department_type": "CLINICAL",
            },
            {
                "code": "ADMIN",
                "name": "Administration",
                "department_type": "ADMINISTRATIVE",
            },
            {
                "code": "FIN",
                "name": "Finance & Billing",
                "department_type": "ADMINISTRATIVE",
            },
            {
                "code": "RECORDS",
                "name": "Medical Records",
                "department_type": "RECORDS",
            },
            {
                "code": "HR",
                "name": "Human Resources",
                "department_type": "ADMINISTRATIVE",
            },
        ]

        # =================================================================
        # Ward definitions (for inpatient module)
        # =================================================================
        WARDS = [
            {
                "name": "Medical Ward 1",
                "code": "MED-01",
                "ward_type": "MEDICAL",
                "floor": "1st Floor",
                "capacity": 20,
                "daily_rate": Decimal("2500.00"),
                "description": "General medical ward for adult patients",
            },
            {
                "name": "Surgical Ward",
                "code": "SURG-01",
                "ward_type": "SURGICAL",
                "floor": "2nd Floor",
                "capacity": 15,
                "daily_rate": Decimal("3000.00"),
                "description": "Post-operative care and surgical patients",
            },
            {
                "name": "Pediatric Ward",
                "code": "PED-01",
                "ward_type": "PEDIATRIC",
                "floor": "1st Floor",
                "capacity": 12,
                "daily_rate": Decimal("2000.00"),
                "description": "Children's ward (0-12 years)",
            },
            {
                "name": "Maternity Ward",
                "code": "MAT-01",
                "ward_type": "MATERNITY",
                "floor": "Ground Floor",
                "capacity": 10,
                "daily_rate": Decimal("2500.00"),
                "description": "Antenatal, labor, and postnatal care",
            },
            {
                "name": "ICU",
                "code": "ICU-01",
                "ward_type": "ICU",
                "floor": "2nd Floor",
                "capacity": 6,
                "daily_rate": Decimal("15000.00"),
                "description": "Intensive Care Unit for critical patients",
            },
            {
                "name": "Isolation Ward",
                "code": "ISO-01",
                "ward_type": "ISOLATION",
                "floor": "Ground Floor",
                "capacity": 8,
                "daily_rate": Decimal("4000.00"),
                "description": "Isolation ward for infectious diseases",
            },
        ]

        # =================================================================
        # Demo user definitions with staff profile data
        # =================================================================
        DEMO_USERS = [
            {
                "username": "demo_admin",
                "email": "admin@demo.vitora.health",
                "password": "DemoAdmin2026!",
                "first_name": "Admin",
                "last_name": "User",
                "is_staff": True,
                "is_superuser": True,
                "role_code": "ADMIN",
                "department_code": "ADMIN",
                "employee_id": "VH-2026-001",
                "title": "",
                "phone": "0722000001",
            },
            {
                "username": "demo_receptionist",
                "email": "reception@demo.vitora.health",
                "password": "DemoReception2026!",
                "first_name": "Mary",
                "last_name": "Wanjiku",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "RECEPTIONIST",
                "department_code": "OPD",
                "employee_id": "VH-2026-002",
                "title": "",
                "phone": "0722000002",
            },
            {
                "username": "demo_nurse",
                "email": "nurse@demo.vitora.health",
                "password": "DemoNurse2026!",
                "first_name": "Grace",
                "last_name": "Akinyi",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "NURSE",
                "department_code": "OPD",
                "employee_id": "VH-2026-003",
                "title": "Nurse",
                "phone": "0722000003",
                "license_number": "NCK-RN-2020-12345",
                "licensing_body": "Nursing Council of Kenya",
            },
            {
                "username": "demo_doctor",
                "email": "doctor@demo.vitora.health",
                "password": "DemoDoctor2026!",
                "first_name": "James",
                "last_name": "Ochieng",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "DOCTOR",
                "department_code": "OPD",
                "employee_id": "VH-2026-004",
                "title": "Dr.",
                "phone": "0722000004",
                "license_number": "KMPDB-2018-54321",
                "licensing_body": "Kenya Medical Practitioners and Dentists Board",
                "specialization": "General Practice",
            },
            {
                "username": "demo_pharmacist",
                "email": "pharmacy@demo.vitora.health",
                "password": "DemoPharmacy2026!",
                "first_name": "Peter",
                "last_name": "Mwangi",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "PHARMACIST",
                "department_code": "PHARM",
                "employee_id": "VH-2026-005",
                "title": "",
                "phone": "0722000005",
                "license_number": "PPB-2019-67890",
                "licensing_body": "Pharmacy and Poisons Board",
            },
            {
                "username": "demo_labtech",
                "email": "lab@demo.vitora.health",
                "password": "DemoLab2026!",
                "first_name": "Susan",
                "last_name": "Njeri",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "LAB_TECH",
                "department_code": "LAB",
                "employee_id": "VH-2026-006",
                "title": "",
                "phone": "0722000006",
                "license_number": "KMLTTB-2021-11111",
                "licensing_body": "Kenya Medical Laboratory Technicians and Technologists Board",
            },
            {
                "username": "demo_billing",
                "email": "billing@demo.vitora.health",
                "password": "DemoBilling2026!",
                "first_name": "John",
                "last_name": "Kamau",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "BILLING_CLERK",
                "department_code": "FIN",
                "employee_id": "VH-2026-007",
                "title": "",
                "phone": "0722000007",
            },
            {
                "username": "demo_records",
                "email": "records@demo.vitora.health",
                "password": "DemoRecords2026!",
                "first_name": "Faith",
                "last_name": "Wambui",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "RECORDS_CLERK",
                "department_code": "RECORDS",
                "employee_id": "VH-2026-008",
                "title": "",
                "phone": "0722000008",
            },
            {
                "username": "demo_clinical_officer",
                "email": "co@demo.vitora.health",
                "password": "DemoCO2026!",
                "first_name": "Daniel",
                "last_name": "Kipchoge",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "CLINICAL_OFFICER",
                "department_code": "OPD",
                "employee_id": "VH-2026-009",
                "title": "",
                "phone": "0722000009",
                "license_number": "COC-2020-22222",
                "licensing_body": "Clinical Officers Council",
            },
            {
                "username": "demo_ipd_nurse",
                "email": "ipd.nurse@demo.vitora.health",
                "password": "DemoIPDNurse2026!",
                "first_name": "Agnes",
                "last_name": "Chebet",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "NURSE",
                "department_code": "IPD",
                "employee_id": "VH-2026-010",
                "title": "Nurse",
                "phone": "0722000010",
                "license_number": "NCK-RN-2019-54321",
                "licensing_body": "Nursing Council of Kenya",
            },
        ]

        # Kenyan names for sample patients
        KENYAN_FIRST_NAMES_MALE = [
            "James",
            "John",
            "Peter",
            "Paul",
            "David",
            "Joseph",
            "Michael",
            "Daniel",
            "Samuel",
            "Stephen",
            "Francis",
            "George",
            "Robert",
            "Patrick",
            "Brian",
            "Kevin",
            "Dennis",
            "Martin",
            "Charles",
            "Eric",
            "Simon",
            "Kelvin",
            "Victor",
            "Felix",
            "Caleb",
            "Emmanuel",
            "Isaac",
            "Moses",
        ]

        KENYAN_FIRST_NAMES_FEMALE = [
            "Mary",
            "Grace",
            "Faith",
            "Joy",
            "Mercy",
            "Esther",
            "Ruth",
            "Elizabeth",
            "Sarah",
            "Rebecca",
            "Lucy",
            "Ann",
            "Jane",
            "Margaret",
            "Rose",
            "Beatrice",
            "Agnes",
            "Catherine",
            "Dorothy",
            "Florence",
            "Gladys",
            "Hannah",
            "Irene",
            "Janet",
            "Joyce",
            "Lydia",
            "Naomi",
        ]

        KENYAN_SURNAMES = [
            "Ochieng",
            "Wanjiku",
            "Kamau",
            "Mwangi",
            "Njeri",
            "Akinyi",
            "Otieno",
            "Wambui",
            "Kimani",
            "Nyambura",
            "Omondi",
            "Adhiambo",
            "Kipchoge",
            "Chebet",
            "Kosgei",
            "Rotich",
            "Kipruto",
            "Jepchirchir",
            "Tanui",
            "Mutua",
            "Musyoka",
            "Ndungu",
            "Gitau",
            "Mburu",
            "Ngugi",
            "Karanja",
        ]

        # Check if demo users already exist
        existing_demo_user = User.objects.filter(username="demo_admin").first()
        if existing_demo_user and not options["force"]:
            self.stdout.write(
                self.style.WARNING("Demo users already exist. Use --force to recreate.")
            )
            return

        self.stdout.write("Starting comprehensive demo data seeding...")

        with transaction.atomic():
            # =============================================================
            # Step 1: Create Departments
            # =============================================================
            self.stdout.write(self.style.MIGRATE_HEADING("\n1. Creating Departments..."))
            departments_map = {}
            for dept_data in DEPARTMENTS:
                dept, created = Department.objects.update_or_create(
                    code=dept_data["code"],
                    defaults={
                        "name": dept_data["name"],
                        "department_type": dept_data["department_type"],
                        "is_active": True,
                    },
                )
                departments_map[dept_data["code"]] = dept
                status = "Created" if created else "Updated"
                self.stdout.write(f"  {status}: {dept.name} ({dept.code})")

            # =============================================================
            # Step 2: Create Wards with Beds
            # =============================================================
            self.stdout.write(self.style.MIGRATE_HEADING("\n2. Creating Wards and Beds..."))
            try:
                from hmis.apps.inpatient.models import Bed, Ward

                for ward_data in WARDS:
                    # Extract capacity for bed creation but keep it in defaults
                    capacity = ward_data["capacity"]
                    ward, created = Ward.objects.update_or_create(
                        code=ward_data["code"],
                        defaults={
                            "name": ward_data["name"],
                            "ward_type": ward_data["ward_type"],
                            "floor": ward_data.get("floor", ""),
                            "capacity": capacity,
                            "daily_rate": ward_data["daily_rate"],
                            "description": ward_data.get("description", ""),
                            "is_active": True,
                        },
                    )

                    # Create beds if ward was just created
                    if created:
                        for i in range(1, capacity + 1):
                            Bed.objects.create(
                                ward=ward,
                                bed_number=f"{ward.code}-B{i:02d}",
                                bed_type="STANDARD" if i <= capacity - 2 else "PRIVATE",
                                status="AVAILABLE",
                            )
                        self.stdout.write(f"  Created: {ward.name} with {capacity} beds")
                    else:
                        self.stdout.write(f"  Updated: {ward.name}")
            except ImportError:
                self.stdout.write(
                    self.style.WARNING("  Inpatient app not available, skipping wards")
                )

            # =============================================================
            # Step 3: Create Demo Users with StaffProfiles
            # =============================================================
            self.stdout.write(
                self.style.MIGRATE_HEADING("\n3. Creating Demo Users with Staff Profiles...")
            )

            for user_data in DEMO_USERS:
                # Extract staff profile data (use .get() to avoid modifying original dict)
                role_code = user_data["role_code"]
                department_code = user_data["department_code"]
                employee_id = user_data["employee_id"]
                title = user_data.get("title", "")
                phone = user_data.get("phone", "")
                license_number = user_data.get("license_number", "")
                licensing_body = user_data.get("licensing_body", "")
                specialization = user_data.get("specialization", "")
                password = user_data["password"]

                # Create/update user
                user, created = User.objects.update_or_create(
                    username=user_data["username"],
                    defaults={
                        "email": user_data["email"],
                        "first_name": user_data["first_name"],
                        "last_name": user_data["last_name"],
                        "is_staff": user_data["is_staff"],
                        "is_superuser": user_data["is_superuser"],
                    },
                )
                user.set_password(password)
                user.save()

                # Get role and department
                role = Role.objects.filter(code=role_code).first()
                department = departments_map.get(department_code)

                if role and department:
                    # Create/update StaffProfile
                    staff_profile, sp_created = StaffProfile.objects.update_or_create(
                        user=user,
                        defaults={
                            "employee_id": employee_id,
                            "title": title,
                            "primary_role": role,
                            "primary_department": department,
                            "phone_number": phone,
                            "license_number": license_number,
                            "licensing_body": licensing_body,
                            "specialization": specialization,
                            "employment_status": "ACTIVE",
                            "employment_type": "PERMANENT",
                            "date_joined": date.today() - timedelta(days=365),  # Joined 1 year ago
                        },
                    )

                    # Also add user to the role's Django group
                    if role.django_group:
                        user.groups.add(role.django_group)

                    sp_status = "Created" if sp_created else "Updated"
                    self.stdout.write(
                        f"  {'Created' if created else 'Updated'} user: {user.username} "
                        f"| Role: {role.code} | Dept: {department.code} "
                        f"| StaffProfile: {sp_status}"
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  {'Created' if created else 'Updated'} user: {user.username} "
                            f"| Role '{role_code}' or Dept '{department_code}' not found - no StaffProfile created"
                        )
                    )

            # =============================================================
            # Step 4: Create Sample Patients
            # =============================================================
            self.stdout.write(self.style.MIGRATE_HEADING("\n4. Creating Sample Patients..."))
            counties = list(County.objects.all()[:5])
            if not counties:
                self.stdout.write(
                    self.style.WARNING("  No counties found. Run import_kenya_locations first.")
                )
            else:
                registered_by = User.objects.get(username="demo_receptionist")
                patients_created = 0

                for i in range(30):  # Create 30 patients
                    gender = choice(["M", "F"])
                    if gender == "M":
                        first_name = choice(KENYAN_FIRST_NAMES_MALE)
                    else:
                        first_name = choice(KENYAN_FIRST_NAMES_FEMALE)

                    last_name = choice(KENYAN_SURNAMES)
                    age_days = randint(365, 365 * 80)
                    dob = date.today() - timedelta(days=age_days)

                    county = choice(counties)
                    sub_counties = list(county.sub_counties.all()[:5])
                    if not sub_counties:
                        continue
                    sub_county = choice(sub_counties)

                    patient, created = Patient.objects.get_or_create(
                        first_name=first_name,
                        last_name=last_name,
                        date_of_birth=dob,
                        defaults={
                            "gender": gender,
                            "county": county,
                            "sub_county": sub_county,
                            "registered_by": registered_by,
                            "phone_number": f"07{randint(10000000, 99999999)}",
                        },
                    )
                    if created:
                        patients_created += 1

                self.stdout.write(f"  Created {patients_created} sample patients")

            # =============================================================
            # Step 5: Create Billing Demo Data
            # =============================================================
            self.stdout.write(self.style.MIGRATE_HEADING("\n5. Creating Billing Demo Data..."))
            self._seed_billing_data(options)

        # =============================================================
        # Summary
        # =============================================================
        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        self.stdout.write(self.style.SUCCESS("✅ Demo data seeding completed successfully!"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        self.stdout.write("\n📋 Demo Credentials:")
        self.stdout.write("-" * 60)
        self.stdout.write(f"{'Username':<25} {'Role':<20} {'Department'}")
        self.stdout.write("-" * 60)
        for user_data in DEMO_USERS:
            self.stdout.write(
                f"{user_data['username']:<25} "
                f"{user_data.get('role_code', 'N/A'):<20} "
                f"{user_data.get('department_code', 'N/A')}"
            )
        self.stdout.write("-" * 60)
        self.stdout.write("\n🔑 All demo passwords follow the pattern: Demo<Role>2026!")
        self.stdout.write("   Example: DemoAdmin2026!, DemoNurse2026!, etc.")

    def _seed_billing_data(self, options):
        """Seed billing demo data: categories, services, payment points, invoices, payments."""
        from datetime import date, timedelta
        from decimal import Decimal
        from random import choice, randint, uniform

        from django.contrib.auth import get_user_model
        from django.utils import timezone

        from hmis.apps.billing.models import (
            CreditNote,
            Invoice,
            InvoiceItem,
            Payment,
            PaymentPoint,
            Receipt,
            Service,
            ServiceCategory,
        )
        from hmis.apps.patients.models import Patient

        User = get_user_model()

        # Get billing user
        try:
            billing_user = User.objects.get(username="demo_billing")
        except User.DoesNotExist:
            billing_user = User.objects.filter(is_superuser=True).first()
            if not billing_user:
                self.stdout.write(
                    self.style.WARNING("  No billing user found. Skipping billing data.")
                )
                return

        # =================================================================
        # Service Categories
        # =================================================================
        SERVICE_CATEGORIES = [
            {
                "code": "CONS",
                "name": "Consultation",
                "description": "Outpatient and inpatient consultation services",
                "display_order": 1,
            },
            {
                "code": "LAB",
                "name": "Laboratory",
                "description": "Laboratory tests and diagnostics",
                "display_order": 2,
            },
            {
                "code": "RAD",
                "name": "Radiology",
                "description": "X-rays, ultrasounds, CT scans, and MRI",
                "display_order": 3,
            },
            {
                "code": "PHARM",
                "name": "Pharmacy",
                "description": "Medications and pharmaceutical supplies",
                "display_order": 4,
            },
            {
                "code": "PROC",
                "name": "Procedures",
                "description": "Minor and major medical procedures",
                "display_order": 5,
            },
            {
                "code": "IPD",
                "name": "Inpatient",
                "description": "Bed charges and inpatient services",
                "display_order": 6,
            },
            {
                "code": "NURS",
                "name": "Nursing",
                "description": "Nursing care and services",
                "display_order": 7,
            },
            {
                "code": "MCH",
                "name": "Maternal & Child Health",
                "description": "Antenatal, delivery, and child wellness services",
                "display_order": 8,
            },
        ]

        self.stdout.write("  Creating Service Categories...")
        categories_map = {}
        for cat_data in SERVICE_CATEGORIES:
            cat, created = ServiceCategory.objects.update_or_create(
                code=cat_data["code"],
                defaults={
                    "name": cat_data["name"],
                    "description": cat_data["description"],
                    "display_order": cat_data["display_order"],
                    "is_active": True,
                },
            )
            categories_map[cat_data["code"]] = cat
            status = "Created" if created else "Updated"
            self.stdout.write(f"    {status}: {cat.name}")

        # =================================================================
        # Services with realistic Kenya pricing (KES)
        # =================================================================
        SERVICES = [
            # Consultation Services
            {"code": "CONS-OPD", "name": "OPD Consultation", "category": "CONS", "price": 500},
            {"code": "CONS-SPEC", "name": "Specialist Consultation", "category": "CONS", "price": 1500},
            {"code": "CONS-PEDS", "name": "Pediatric Consultation", "category": "CONS", "price": 600},
            {"code": "CONS-EMR", "name": "Emergency Consultation", "category": "CONS", "price": 1000},
            {"code": "CONS-REV", "name": "Review Consultation", "category": "CONS", "price": 300},
            # Laboratory Services
            {"code": "LAB-CBC", "name": "Complete Blood Count (CBC)", "category": "LAB", "price": 800, "sha_code": "LAB001"},
            {"code": "LAB-RFT", "name": "Renal Function Test (RFT)", "category": "LAB", "price": 1200, "sha_code": "LAB002"},
            {"code": "LAB-LFT", "name": "Liver Function Test (LFT)", "category": "LAB", "price": 1500, "sha_code": "LAB003"},
            {"code": "LAB-FBS", "name": "Fasting Blood Sugar", "category": "LAB", "price": 400, "sha_code": "LAB004"},
            {"code": "LAB-RBS", "name": "Random Blood Sugar", "category": "LAB", "price": 350, "sha_code": "LAB005"},
            {"code": "LAB-LIPID", "name": "Lipid Profile", "category": "LAB", "price": 2000, "sha_code": "LAB006"},
            {"code": "LAB-HBA1C", "name": "HbA1c (Glycated Hemoglobin)", "category": "LAB", "price": 1800, "sha_code": "LAB007"},
            {"code": "LAB-UREA", "name": "Blood Urea Nitrogen", "category": "LAB", "price": 500, "sha_code": "LAB008"},
            {"code": "LAB-CREAT", "name": "Serum Creatinine", "category": "LAB", "price": 500, "sha_code": "LAB009"},
            {"code": "LAB-UA", "name": "Urinalysis", "category": "LAB", "price": 300, "sha_code": "LAB010"},
            {"code": "LAB-MALARIA", "name": "Malaria Test (BS/RDT)", "category": "LAB", "price": 500, "sha_code": "LAB011"},
            {"code": "LAB-WIDAL", "name": "Widal Test", "category": "LAB", "price": 600, "sha_code": "LAB012"},
            {"code": "LAB-HIV", "name": "HIV Test", "category": "LAB", "price": 1, "sha_code": "LAB013"},  # Free per Kenya policy (nominal 1 KES)
            {"code": "LAB-PREG", "name": "Pregnancy Test (UPT)", "category": "LAB", "price": 400, "sha_code": "LAB014"},
            {"code": "LAB-STOOL", "name": "Stool Analysis", "category": "LAB", "price": 400, "sha_code": "LAB015"},
            # Radiology Services
            {"code": "RAD-XRAY-CH", "name": "Chest X-Ray", "category": "RAD", "price": 1500, "sha_code": "RAD001"},
            {"code": "RAD-XRAY-AB", "name": "Abdominal X-Ray", "category": "RAD", "price": 1500, "sha_code": "RAD002"},
            {"code": "RAD-XRAY-LMB", "name": "Lumbar Spine X-Ray", "category": "RAD", "price": 2000, "sha_code": "RAD003"},
            {"code": "RAD-US-ABD", "name": "Abdominal Ultrasound", "category": "RAD", "price": 2500, "sha_code": "RAD004"},
            {"code": "RAD-US-PELV", "name": "Pelvic Ultrasound", "category": "RAD", "price": 2500, "sha_code": "RAD005"},
            {"code": "RAD-US-OBS", "name": "Obstetric Ultrasound", "category": "RAD", "price": 2000, "sha_code": "RAD006"},
            {"code": "RAD-ECG", "name": "Electrocardiogram (ECG)", "category": "RAD", "price": 1000, "sha_code": "RAD007"},
            {"code": "RAD-ECHO", "name": "Echocardiogram", "category": "RAD", "price": 5000, "sha_code": "RAD008"},
            # Procedures
            {"code": "PROC-DRESS", "name": "Wound Dressing", "category": "PROC", "price": 500},
            {"code": "PROC-SUTURE", "name": "Suturing (Minor)", "category": "PROC", "price": 1500},
            {"code": "PROC-INJECT", "name": "Injection Administration", "category": "PROC", "price": 200},
            {"code": "PROC-IV", "name": "IV Line Insertion", "category": "PROC", "price": 500},
            {"code": "PROC-CATH", "name": "Urinary Catheterization", "category": "PROC", "price": 1000},
            {"code": "PROC-NGT", "name": "NGT Insertion", "category": "PROC", "price": 800},
            {"code": "PROC-NEBUL", "name": "Nebulization", "category": "PROC", "price": 500},
            {"code": "PROC-CIRC", "name": "Circumcision", "category": "PROC", "price": 5000},
            # Inpatient Services
            {"code": "IPD-GEN", "name": "General Ward (per day)", "category": "IPD", "price": 2500},
            {"code": "IPD-PRIV", "name": "Private Ward (per day)", "category": "IPD", "price": 5000},
            {"code": "IPD-ICU", "name": "ICU (per day)", "category": "IPD", "price": 15000},
            {"code": "IPD-HDU", "name": "HDU (per day)", "category": "IPD", "price": 8000},
            {"code": "IPD-PEDS", "name": "Pediatric Ward (per day)", "category": "IPD", "price": 2000},
            # Nursing Services
            {"code": "NURS-OBS", "name": "Nursing Observation (per hour)", "category": "NURS", "price": 200},
            {"code": "NURS-CARE", "name": "Nursing Care Package", "category": "NURS", "price": 1000},
            {"code": "NURS-IV-MEDS", "name": "IV Medication Administration", "category": "NURS", "price": 300},
            # MCH Services
            {"code": "MCH-ANC", "name": "Antenatal Care Visit", "category": "MCH", "price": 500},
            {"code": "MCH-DEL-NVD", "name": "Normal Vaginal Delivery", "category": "MCH", "price": 15000},
            {"code": "MCH-DEL-CS", "name": "Caesarean Section", "category": "MCH", "price": 50000},
            {"code": "MCH-PNC", "name": "Postnatal Care Visit", "category": "MCH", "price": 400},
            {"code": "MCH-FP", "name": "Family Planning Consultation", "category": "MCH", "price": 300},
            {"code": "MCH-IMM", "name": "Immunization Service", "category": "MCH", "price": 1},  # Free per Kenya policy (nominal 1 KES)
            {"code": "MCH-GROWTH", "name": "Growth Monitoring", "category": "MCH", "price": 200},
        ]

        self.stdout.write("  Creating Services...")
        services_map = {}
        for svc_data in SERVICES:
            category = categories_map.get(svc_data["category"])
            if not category:
                continue
            svc, created = Service.objects.update_or_create(
                code=svc_data["code"],
                defaults={
                    "name": svc_data["name"],
                    "category": category,
                    "unit_price": Decimal(str(svc_data["price"])),
                    "sha_code": svc_data.get("sha_code", ""),
                    "is_active": True,
                    "created_by": billing_user,
                },
            )
            services_map[svc_data["code"]] = svc
        self.stdout.write(f"    Created/Updated {len(SERVICES)} services")

        # =================================================================
        # Payment Points
        # =================================================================
        PAYMENT_POINTS = [
            {
                "code": "CASH-01",
                "name": "Main Cash Counter",
                "method": "cash",
            },
            {
                "code": "CASH-02",
                "name": "OPD Cash Counter",
                "method": "cash",
            },
            {
                "code": "MPESA-01",
                "name": "M-Pesa Till (Buy Goods)",
                "method": "mpesa",
                "till_number": "123456",
            },
            {
                "code": "MPESA-02",
                "name": "M-Pesa Paybill",
                "method": "mpesa",
                "paybill_number": "654321",
                "paybill_account_number": "VITORA",
            },
            {
                "code": "BANK-01",
                "name": "KCB Bank Account",
                "method": "bank_transfer",
                "bank_name": "Kenya Commercial Bank",
                "bank_account_name": "Demo Health Facility",
                "bank_account_number": "1234567890",
                "bank_branch": "Nairobi Branch",
            },
        ]

        self.stdout.write("  Creating Payment Points...")
        payment_points_map = {}
        for pp_data in PAYMENT_POINTS:
            pp, created = PaymentPoint.objects.update_or_create(
                code=pp_data["code"],
                defaults={
                    "name": pp_data["name"],
                    "method": pp_data["method"],
                    "till_number": pp_data.get("till_number", ""),
                    "paybill_number": pp_data.get("paybill_number", ""),
                    "paybill_account_number": pp_data.get("paybill_account_number", ""),
                    "bank_name": pp_data.get("bank_name", ""),
                    "bank_account_name": pp_data.get("bank_account_name", ""),
                    "bank_account_number": pp_data.get("bank_account_number", ""),
                    "bank_branch": pp_data.get("bank_branch", ""),
                    "is_active": True,
                    "created_by": billing_user,
                },
            )
            payment_points_map[pp_data["code"]] = pp
            status = "Created" if created else "Updated"
            self.stdout.write(f"    {status}: {pp.name}")

        # =================================================================
        # Generate Invoices, Payments, and Receipts
        # =================================================================
        self.stdout.write("  Creating Invoices and Payments...")

        patients = list(Patient.objects.all()[:20])
        if not patients:
            self.stdout.write(
                self.style.WARNING("    No patients found. Skipping invoice generation.")
            )
            return

        # Service lists by category for random selection
        consultation_services = [s for c, s in services_map.items() if c.startswith("CONS")]
        lab_services = [s for c, s in services_map.items() if c.startswith("LAB")]
        procedure_services = [s for c, s in services_map.items() if c.startswith("PROC")]
        radiology_services = [s for c, s in services_map.items() if c.startswith("RAD")]

        invoice_statuses = [
            Invoice.Status.PAID,
            Invoice.Status.PAID,
            Invoice.Status.PAID,
            Invoice.Status.PARTIAL,
            Invoice.Status.PENDING,
            Invoice.Status.OVERDUE,
            Invoice.Status.DRAFT,
            Invoice.Status.PROFORMA,
        ]

        payment_methods = [
            Payment.Method.CASH,
            Payment.Method.CASH,
            Payment.Method.MPESA,
            Payment.Method.MPESA,
            Payment.Method.CARD,
            Payment.Method.INSURANCE,
        ]

        invoices_created = 0
        payments_created = 0
        receipts_created = 0

        for patient in patients:
            # Create 1-3 invoices per patient
            num_invoices = randint(1, 3)

            for _ in range(num_invoices):
                # Random date in the last 90 days
                days_ago = randint(0, 90)
                invoice_date = date.today() - timedelta(days=days_ago)
                target_status = choice(invoice_statuses)

                # Create invoice
                invoice = Invoice(
                    patient=patient,
                    invoice_date=invoice_date,
                    due_date=invoice_date + timedelta(days=30),
                    status=Invoice.Status.DRAFT if target_status != Invoice.Status.PROFORMA else Invoice.Status.PROFORMA,
                    payment_type=choice([Invoice.PaymentType.CASH, Invoice.PaymentType.MPESA, Invoice.PaymentType.INSURANCE]),
                    created_by=billing_user,
                )
                invoice.save()
                invoices_created += 1

                # Add 1-5 items to invoice
                num_items = randint(1, 5)
                for _ in range(num_items):
                    # Pick random service
                    all_services = consultation_services + lab_services + procedure_services
                    if radiology_services and randint(0, 3) == 0:  # 25% chance of radiology
                        all_services = radiology_services
                    
                    if not all_services:
                        continue
                    
                    service = choice(all_services)
                    quantity = Decimal("1") if not service.requires_quantity else Decimal(str(randint(1, 3)))

                    InvoiceItem.objects.create(
                        invoice=invoice,
                        item_type=InvoiceItem.ItemType.SERVICE,
                        service=service,
                        description=service.name,
                        quantity=quantity,
                        unit_price=service.unit_price,
                        line_total=service.unit_price * quantity,
                        sha_code=service.sha_code,
                    )

                # Recalculate totals
                invoice.calculate_totals()

                # Skip further processing for draft/proforma
                if target_status in [Invoice.Status.DRAFT, Invoice.Status.PROFORMA]:
                    continue

                # Process based on target status
                invoice.status = Invoice.Status.PENDING
                invoice.save(update_fields=["status"])

                if target_status == Invoice.Status.OVERDUE:
                    # Make it overdue by setting old dates
                    invoice.invoice_date = date.today() - timedelta(days=60)
                    invoice.due_date = date.today() - timedelta(days=30)
                    invoice.status = Invoice.Status.OVERDUE
                    invoice.save(update_fields=["invoice_date", "due_date", "status"])
                    continue

                if target_status in [Invoice.Status.PAID, Invoice.Status.PARTIAL]:
                    # Create payment
                    method = choice(payment_methods)
                    
                    if target_status == Invoice.Status.PAID:
                        payment_amount = invoice.total_amount
                    else:
                        # Partial payment: 30-70% of total
                        percentage = Decimal(str(uniform(0.3, 0.7)))
                        payment_amount = (invoice.total_amount * percentage).quantize(Decimal("0.01"))

                    # Select appropriate payment point
                    if method == Payment.Method.CASH:
                        pp = payment_points_map.get("CASH-01")
                    elif method == Payment.Method.MPESA:
                        pp = payment_points_map.get("MPESA-01")
                    else:
                        pp = None

                    payment = Payment(
                        invoice=invoice,
                        payment_point=pp,
                        method=method,
                        amount=payment_amount,
                        status=Payment.Status.COMPLETED,
                        payment_date=timezone.make_aware(
                            timezone.datetime.combine(invoice_date + timedelta(days=randint(0, 5)), timezone.datetime.min.time())
                        ),
                        processed_at=timezone.now(),
                        received_by=billing_user,
                    )

                    # Add M-Pesa details if applicable
                    if method == Payment.Method.MPESA:
                        payment.mpesa_receipt_number = f"SH{randint(10000000, 99999999)}XZ"
                        payment.mpesa_transaction_id = f"ws_CO_{randint(1000000000, 9999999999)}"
                        payment.mpesa_phone = f"2547{randint(10000000, 99999999)}"

                    payment.save()
                    payments_created += 1

                    # Update invoice with payment
                    invoice.amount_paid = payment_amount
                    invoice.balance_due = invoice.total_amount - payment_amount
                    if payment_amount >= invoice.total_amount:
                        invoice.status = Invoice.Status.PAID
                    else:
                        invoice.status = Invoice.Status.PARTIAL
                    invoice.save(update_fields=["amount_paid", "balance_due", "status"])

                    # Create receipt for completed payments
                    if payment.status == Payment.Status.COMPLETED:
                        from django.conf import settings as django_settings
                        
                        Receipt.objects.create(
                            payment=payment,
                            invoice=invoice,
                            patient=patient,
                            amount=payment.amount,
                            payment_method=payment.method,
                            facility_name=getattr(django_settings, "FACILITY_NAME", "Demo Health Facility"),
                            facility_address=getattr(django_settings, "FACILITY_ADDRESS", "P.O. Box 12345, Nairobi"),
                            facility_phone=getattr(django_settings, "FACILITY_PHONE", "+254 700 000 000"),
                            facility_kra_pin=getattr(django_settings, "FACILITY_KRA_PIN", "P000000000X"),
                            patient_name=f"{patient.first_name} {patient.last_name}",
                            patient_mrn=patient.mrn,
                            issued_by=billing_user,
                        )
                        receipts_created += 1

        self.stdout.write(f"    Created {invoices_created} invoices")
        self.stdout.write(f"    Created {payments_created} payments")
        self.stdout.write(f"    Created {receipts_created} receipts")

        # =================================================================
        # Create sample Credit Notes
        # =================================================================
        self.stdout.write("  Creating sample Credit Notes...")

        # Get a few paid invoices for credit notes
        paid_invoices = Invoice.objects.filter(status=Invoice.Status.PAID)[:3]
        credit_notes_created = 0

        credit_reasons = [
            (CreditNote.Reason.OVERCHARGE, "Price adjustment due to overcharge"),
            (CreditNote.Reason.SERVICE_NOT_RENDERED, "Service was not provided"),
            (CreditNote.Reason.GOODWILL, "Customer goodwill gesture"),
        ]

        for inv in paid_invoices:
            reason, detail = choice(credit_reasons)
            # Credit 10-30% of invoice
            credit_amount = (inv.total_amount * Decimal(str(uniform(0.1, 0.3)))).quantize(Decimal("0.01"))
            
            CreditNote.objects.create(
                invoice=inv,
                patient=inv.patient,
                amount=credit_amount,
                reason=reason,
                reason_detail=detail,
                status=choice([CreditNote.Status.DRAFT, CreditNote.Status.APPROVED]),
                requested_by=billing_user,
            )
            credit_notes_created += 1

        self.stdout.write(f"    Created {credit_notes_created} credit notes")
        self.stdout.write(self.style.SUCCESS("  ✅ Billing demo data created successfully!"))
