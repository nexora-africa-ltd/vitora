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
            "James", "John", "Peter", "Paul", "David", "Joseph", "Michael",
            "Daniel", "Samuel", "Stephen", "Francis", "George", "Robert", "Patrick",
            "Brian", "Kevin", "Dennis", "Martin", "Charles", "Eric", "Simon",
            "Kelvin", "Victor", "Felix", "Caleb", "Emmanuel", "Isaac", "Moses",
        ]

        KENYAN_FIRST_NAMES_FEMALE = [
            "Mary", "Grace", "Faith", "Joy", "Mercy", "Esther", "Ruth",
            "Elizabeth", "Sarah", "Rebecca", "Lucy", "Ann", "Jane", "Margaret",
            "Rose", "Beatrice", "Agnes", "Catherine", "Dorothy", "Florence",
            "Gladys", "Hannah", "Irene", "Janet", "Joyce", "Lydia", "Naomi",
        ]

        KENYAN_SURNAMES = [
            "Ochieng", "Wanjiku", "Kamau", "Mwangi", "Njeri", "Akinyi", "Otieno",
            "Wambui", "Kimani", "Nyambura", "Omondi", "Adhiambo", "Kipchoge",
            "Chebet", "Kosgei", "Rotich", "Kipruto", "Jepchirchir", "Tanui",
            "Mutua", "Musyoka", "Ndungu", "Gitau", "Mburu", "Ngugi", "Karanja",
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
            self.stdout.write(self.style.MIGRATE_HEADING("\n3. Creating Demo Users with Staff Profiles..."))

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
