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
            {
                "username": "demo_radiographer",
                "email": "radiology@demo.vitora.health",
                "password": "DemoRadiology2026!",
                "first_name": "Evans",
                "last_name": "Maina",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "RADIOGRAPHER",
                "department_code": "RAD",
                "employee_id": "VH-2026-011",
                "title": "",
                "phone": "0722000011",
                "license_number": "KRCHRRD-2020-33333",
                "licensing_body": "Kenya Radiographers and Clinical Health Records Registration Board",
                "specialization": "Diagnostic Radiography",
            },
            {
                "username": "demo_radiologist",
                "email": "radiologist@demo.vitora.health",
                "password": "DemoRadiologist2026!",
                "first_name": "Dr. Beatrice",
                "last_name": "Nyokabi",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "RADIOLOGIST",
                "department_code": "RAD",
                "employee_id": "VH-2026-012",
                "title": "Dr.",
                "phone": "0722000012",
                "license_number": "KMPDB-2015-RAD-001",
                "licensing_body": "Kenya Medical Practitioners and Dentists Board",
                "specialization": "Diagnostic Radiology",
            },
            {
                "username": "demo_sonographer",
                "email": "ultrasound@demo.vitora.health",
                "password": "DemoSonographer2026!",
                "first_name": "Lucy",
                "last_name": "Wangari",
                "is_staff": False,
                "is_superuser": False,
                "role_code": "SONOGRAPHER",
                "department_code": "RAD",
                "employee_id": "VH-2026-013",
                "title": "",
                "phone": "0722000013",
                "license_number": "KRCHRRD-2019-44444",
                "licensing_body": "Kenya Radiographers and Clinical Health Records Registration Board",
                "specialization": "Obstetric and Abdominal Ultrasound",
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

                # ---------------------------------------------------------
                # Deterministic clinic demo patients (stable IDs via temporary_id)
                # ---------------------------------------------------------
                demo_patient_specs = [
                    # General OPD / Filter
                    {
                        "identification_number": "DEMO-PT-0001",
                        "first_name": "John",
                        "last_name": "Kamau",
                        "gender": "M",
                        "date_of_birth": date.today() - timedelta(days=365 * 34),
                        "notes": "General OPD demo patient",
                    },
                    {
                        "identification_number": "DEMO-PT-0002",
                        "first_name": "Mary",
                        "last_name": "Otieno",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 29),
                        "notes": "Filter/Screening demo patient",
                    },
                    # MCH
                    {
                        "identification_number": "DEMO-PT-0101",
                        "first_name": "Grace",
                        "last_name": "Wambui",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 26),
                        "notes": "ANC demo patient",
                    },
                    {
                        "identification_number": "DEMO-PT-0102",
                        "first_name": "Faith",
                        "last_name": "Nyambura",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 30),
                        "notes": "PNC demo patient",
                    },
                    {
                        "identification_number": "DEMO-PT-0103",
                        "first_name": "Jane",
                        "last_name": "Wanjiku",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 27),
                        "notes": "Family planning demo patient",
                    },
                    {
                        "identification_number": "DEMO-PT-0104",
                        "first_name": "Brian",
                        "last_name": "Mwangi",
                        "gender": "M",
                        "date_of_birth": date.today() - timedelta(days=365 * 2),
                        "notes": "Child welfare demo patient",
                    },
                    # Specialty
                    {
                        "identification_number": "DEMO-PT-0201",
                        "first_name": "Peter",
                        "last_name": "Njeri",
                        "gender": "M",
                        "date_of_birth": date.today() - timedelta(days=365 * 41),
                        "notes": "Dental demo patient",
                    },
                    {
                        "identification_number": "DEMO-PT-0202",
                        "first_name": "Esther",
                        "last_name": "Akinyi",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 52),
                        "notes": "Eye clinic demo patient",
                    },
                    {
                        "identification_number": "DEMO-PT-0203",
                        "first_name": "Daniel",
                        "last_name": "Kipchoge",
                        "gender": "M",
                        "date_of_birth": date.today() - timedelta(days=365 * 37),
                        "notes": "ENT demo patient",
                    },
                    # Chronic care
                    {
                        "identification_number": "DEMO-PT-0301",
                        "first_name": "Agnes",
                        "last_name": "Chebet",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 45),
                        "notes": "Diabetic clinic demo patient",
                    },
                    {
                        "identification_number": "DEMO-PT-0302",
                        "first_name": "George",
                        "last_name": "Mutua",
                        "gender": "M",
                        "date_of_birth": date.today() - timedelta(days=365 * 58),
                        "notes": "Hypertension clinic demo patient",
                    },
                    # Sensitive
                    {
                        "identification_number": "DEMO-PT-0901",
                        "first_name": "Ruth",
                        "last_name": "Adhiambo",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 33),
                        "notes": "CCC (sensitive) demo patient",
                        "is_sensitive": True,
                    },
                    {
                        "identification_number": "DEMO-PT-0902",
                        "first_name": "Naomi",
                        "last_name": "Omondi",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 24),
                        "notes": "Mental Health (sensitive) demo patient",
                        "is_sensitive": True,
                    },
                    {
                        "identification_number": "DEMO-PT-0903",
                        "first_name": "Mercy",
                        "last_name": "Wanjiku",
                        "gender": "F",
                        "date_of_birth": date.today() - timedelta(days=365 * 22),
                        "notes": "GBV clinic (sensitive) demo patient",
                        "is_sensitive": True,
                    },
                ]

                # Use a predictable county/sub-county combo for deterministic patients
                default_county = counties[0]
                default_sub_counties = list(default_county.sub_counties.all()[:5])
                default_sub_county = default_sub_counties[0] if default_sub_counties else None

                for spec in demo_patient_specs:
                    if default_sub_county is None:
                        break

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
                            "phone_number": f"07{randint(10000000, 99999999)}",
                            "consent_given": True,
                            "consent_date": None,
                            "is_sensitive": bool(spec.get("is_sensitive", False)),
                            "address": spec.get("notes", ""),
                        },
                    )
                    if created:
                        patients_created += 1

                # ---------------------------------------------------------
                # Random sample patients (augment overall demo dataset)
                # ---------------------------------------------------------
                for i in range(60):  # Create up to 60 additional patients
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
                            "consent_given": True,
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
            # Step 6: Create Clinics Demo Data (clinics, sessions, queue)
            # =============================================================
            self.stdout.write(self.style.MIGRATE_HEADING("\n6. Creating Clinics Demo Data..."))
            self._seed_clinics_data(options)

            # =============================================================
            # Step 7: Create Imaging Demo Data (procedures, orders, items)
            # =============================================================
            self.stdout.write(self.style.MIGRATE_HEADING("\n7. Creating Imaging Demo Data..."))
            self._seed_imaging_data(options)

            # =============================================================
            # Step 8: Create Pharmacy Stock Data (stock batches for drugs)
            # =============================================================
            self.stdout.write(self.style.MIGRATE_HEADING("\n8. Creating Pharmacy Stock Data..."))
            self._seed_pharmacy_stock_data(options)

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
            {
                "code": "CONS-SPEC",
                "name": "Specialist Consultation",
                "category": "CONS",
                "price": 1500,
            },
            {
                "code": "CONS-PEDS",
                "name": "Pediatric Consultation",
                "category": "CONS",
                "price": 600,
            },
            {
                "code": "CONS-EMR",
                "name": "Emergency Consultation",
                "category": "CONS",
                "price": 1000,
            },
            {"code": "CONS-REV", "name": "Review Consultation", "category": "CONS", "price": 300},
            # Laboratory Services
            {
                "code": "LAB-CBC",
                "name": "Complete Blood Count (CBC)",
                "category": "LAB",
                "price": 800,
                "sha_code": "LAB001",
            },
            {
                "code": "LAB-RFT",
                "name": "Renal Function Test (RFT)",
                "category": "LAB",
                "price": 1200,
                "sha_code": "LAB002",
            },
            {
                "code": "LAB-LFT",
                "name": "Liver Function Test (LFT)",
                "category": "LAB",
                "price": 1500,
                "sha_code": "LAB003",
            },
            {
                "code": "LAB-FBS",
                "name": "Fasting Blood Sugar",
                "category": "LAB",
                "price": 400,
                "sha_code": "LAB004",
            },
            {
                "code": "LAB-RBS",
                "name": "Random Blood Sugar",
                "category": "LAB",
                "price": 350,
                "sha_code": "LAB005",
            },
            {
                "code": "LAB-LIPID",
                "name": "Lipid Profile",
                "category": "LAB",
                "price": 2000,
                "sha_code": "LAB006",
            },
            {
                "code": "LAB-HBA1C",
                "name": "HbA1c (Glycated Hemoglobin)",
                "category": "LAB",
                "price": 1800,
                "sha_code": "LAB007",
            },
            {
                "code": "LAB-UREA",
                "name": "Blood Urea Nitrogen",
                "category": "LAB",
                "price": 500,
                "sha_code": "LAB008",
            },
            {
                "code": "LAB-CREAT",
                "name": "Serum Creatinine",
                "category": "LAB",
                "price": 500,
                "sha_code": "LAB009",
            },
            {
                "code": "LAB-UA",
                "name": "Urinalysis",
                "category": "LAB",
                "price": 300,
                "sha_code": "LAB010",
            },
            {
                "code": "LAB-MALARIA",
                "name": "Malaria Test (BS/RDT)",
                "category": "LAB",
                "price": 500,
                "sha_code": "LAB011",
            },
            {
                "code": "LAB-WIDAL",
                "name": "Widal Test",
                "category": "LAB",
                "price": 600,
                "sha_code": "LAB012",
            },
            {
                "code": "LAB-HIV",
                "name": "HIV Test",
                "category": "LAB",
                "price": 1,
                "sha_code": "LAB013",
            },  # Free per Kenya policy (nominal 1 KES)
            {
                "code": "LAB-PREG",
                "name": "Pregnancy Test (UPT)",
                "category": "LAB",
                "price": 400,
                "sha_code": "LAB014",
            },
            {
                "code": "LAB-STOOL",
                "name": "Stool Analysis",
                "category": "LAB",
                "price": 400,
                "sha_code": "LAB015",
            },
            # Radiology Services
            {
                "code": "RAD-XRAY-CH",
                "name": "Chest X-Ray",
                "category": "RAD",
                "price": 1500,
                "sha_code": "RAD001",
            },
            {
                "code": "RAD-XRAY-AB",
                "name": "Abdominal X-Ray",
                "category": "RAD",
                "price": 1500,
                "sha_code": "RAD002",
            },
            {
                "code": "RAD-XRAY-LMB",
                "name": "Lumbar Spine X-Ray",
                "category": "RAD",
                "price": 2000,
                "sha_code": "RAD003",
            },
            {
                "code": "RAD-US-ABD",
                "name": "Abdominal Ultrasound",
                "category": "RAD",
                "price": 2500,
                "sha_code": "RAD004",
            },
            {
                "code": "RAD-US-PELV",
                "name": "Pelvic Ultrasound",
                "category": "RAD",
                "price": 2500,
                "sha_code": "RAD005",
            },
            {
                "code": "RAD-US-OBS",
                "name": "Obstetric Ultrasound",
                "category": "RAD",
                "price": 2000,
                "sha_code": "RAD006",
            },
            {
                "code": "RAD-ECG",
                "name": "Electrocardiogram (ECG)",
                "category": "RAD",
                "price": 1000,
                "sha_code": "RAD007",
            },
            {
                "code": "RAD-ECHO",
                "name": "Echocardiogram",
                "category": "RAD",
                "price": 5000,
                "sha_code": "RAD008",
            },
            # Procedures
            {"code": "PROC-DRESS", "name": "Wound Dressing", "category": "PROC", "price": 500},
            {"code": "PROC-SUTURE", "name": "Suturing (Minor)", "category": "PROC", "price": 1500},
            {
                "code": "PROC-INJECT",
                "name": "Injection Administration",
                "category": "PROC",
                "price": 200,
            },
            {"code": "PROC-IV", "name": "IV Line Insertion", "category": "PROC", "price": 500},
            {
                "code": "PROC-CATH",
                "name": "Urinary Catheterization",
                "category": "PROC",
                "price": 1000,
            },
            {"code": "PROC-NGT", "name": "NGT Insertion", "category": "PROC", "price": 800},
            {"code": "PROC-NEBUL", "name": "Nebulization", "category": "PROC", "price": 500},
            {"code": "PROC-CIRC", "name": "Circumcision", "category": "PROC", "price": 5000},
            # Inpatient Services
            {"code": "IPD-GEN", "name": "General Ward (per day)", "category": "IPD", "price": 2500},
            {
                "code": "IPD-PRIV",
                "name": "Private Ward (per day)",
                "category": "IPD",
                "price": 5000,
            },
            {"code": "IPD-ICU", "name": "ICU (per day)", "category": "IPD", "price": 15000},
            {"code": "IPD-HDU", "name": "HDU (per day)", "category": "IPD", "price": 8000},
            {
                "code": "IPD-PEDS",
                "name": "Pediatric Ward (per day)",
                "category": "IPD",
                "price": 2000,
            },
            # Nursing Services
            {
                "code": "NURS-OBS",
                "name": "Nursing Observation (per hour)",
                "category": "NURS",
                "price": 200,
            },
            {
                "code": "NURS-CARE",
                "name": "Nursing Care Package",
                "category": "NURS",
                "price": 1000,
            },
            {
                "code": "NURS-IV-MEDS",
                "name": "IV Medication Administration",
                "category": "NURS",
                "price": 300,
            },
            # MCH Services
            {"code": "MCH-ANC", "name": "Antenatal Care Visit", "category": "MCH", "price": 500},
            {
                "code": "MCH-DEL-NVD",
                "name": "Normal Vaginal Delivery",
                "category": "MCH",
                "price": 15000,
            },
            {"code": "MCH-DEL-CS", "name": "Caesarean Section", "category": "MCH", "price": 50000},
            {"code": "MCH-PNC", "name": "Postnatal Care Visit", "category": "MCH", "price": 400},
            {
                "code": "MCH-FP",
                "name": "Family Planning Consultation",
                "category": "MCH",
                "price": 300,
            },
            {
                "code": "MCH-IMM",
                "name": "Immunization Service",
                "category": "MCH",
                "price": 1,
            },  # Free per Kenya policy (nominal 1 KES)
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
                    status=Invoice.Status.DRAFT
                    if target_status != Invoice.Status.PROFORMA
                    else Invoice.Status.PROFORMA,
                    payment_type=choice(
                        [
                            Invoice.PaymentType.CASH,
                            Invoice.PaymentType.MPESA,
                            Invoice.PaymentType.INSURANCE,
                        ]
                    ),
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
                    quantity = (
                        Decimal("1")
                        if not service.requires_quantity
                        else Decimal(str(randint(1, 3)))
                    )

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
                        payment_amount = (invoice.total_amount * percentage).quantize(
                            Decimal("0.01")
                        )

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
                            timezone.datetime.combine(
                                invoice_date + timedelta(days=randint(0, 5)),
                                timezone.datetime.min.time(),
                            )
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
                            facility_name=getattr(
                                django_settings, "FACILITY_NAME", "Demo Health Facility"
                            ),
                            facility_address=getattr(
                                django_settings, "FACILITY_ADDRESS", "P.O. Box 12345, Nairobi"
                            ),
                            facility_phone=getattr(
                                django_settings, "FACILITY_PHONE", "+254 700 000 000"
                            ),
                            facility_kra_pin=getattr(
                                django_settings, "FACILITY_KRA_PIN", "P000000000X"
                            ),
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
            credit_amount = (inv.total_amount * Decimal(str(uniform(0.1, 0.3)))).quantize(
                Decimal("0.01")
            )

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

    def _seed_clinics_data(self, options):
        """Seed clinics demo data: clinics, schedules, sessions, staff assignments, enrollments, and queue visits."""
        from datetime import time, timedelta
        from decimal import Decimal
        from random import choice, randint

        from django.contrib.auth import get_user_model
        from django.utils import timezone

        from hmis.apps.clinics.models import (
            Clinic,
            ClinicEnrollment,
            ClinicSchedule,
            ClinicSession,
            ClinicStaff,
            ClinicVisit,
        )
        from hmis.apps.clinics.services.template_routing import resolve_default_clinical_template
        from hmis.apps.patients.models import Patient

        User = get_user_model()

        today = timezone.localdate()
        weekday = today.weekday()

        # Resolve demo users
        demo_admin = User.objects.filter(username="demo_admin").first() or User.objects.filter(
            is_superuser=True
        ).first()
        receptionist = User.objects.filter(username="demo_receptionist").first() or demo_admin
        nurse = User.objects.filter(username="demo_nurse").first() or demo_admin
        doctor = User.objects.filter(username="demo_doctor").first() or demo_admin
        clinical_officer = User.objects.filter(username="demo_clinical_officer").first() or doctor

        if demo_admin is None:
            self.stdout.write(self.style.WARNING("  No admin user found. Skipping clinics demo data."))
            return

        # -----------------------------------------------------------------
        # Idempotency / cleanup
        # -----------------------------------------------------------------
        # Older iterations of the demo seeder created extra clinics with DEMO-* codes.
        # When re-seeding with --force, remove them to avoid parallel clinics in UI.
        if options.get("force"):
            deleted, _ = Clinic.objects.filter(code__startswith="DEMO-").delete()
            if deleted:
                self.stdout.write(f"  Removed legacy DEMO-* clinics: {deleted}")

        # -----------------------------------------------------------------
        # Clinics to use for demo (prefer the canonical *-DEFAULT clinics seeded by migrations)
        # -----------------------------------------------------------------
        CLINICS = [
            # Primary care
            {
                "code": "OPD-DEFAULT",
                "name": "General OPD",
                "clinic_type": "GENERAL_OPD",
                "location": "Outpatient Block, Room 1",
                "capacity": 3,
                "default_service_fee": Decimal("500.00"),
                "triage_required": True,
            },
            {
                "code": "FILTER-DEFAULT",
                "name": "Filter/Screening Clinic",
                "clinic_type": "FILTER_CLINIC",
                "location": "Outpatient Block, Triage Area",
                "capacity": 2,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
            },
            # MCH
            {
                "code": "ANC-DEFAULT",
                "name": "Antenatal Clinic",
                "clinic_type": "ANC",
                "location": "MCH Wing, Room 2",
                "capacity": 2,
                "default_service_fee": Decimal("300.00"),
                "triage_required": False,
            },
            {
                "code": "PNC-DEFAULT",
                "name": "Postnatal Clinic",
                "clinic_type": "PNC",
                "location": "MCH Wing, Room 3",
                "capacity": 1,
                "default_service_fee": Decimal("300.00"),
                "triage_required": False,
            },
            {
                "code": "FP-DEFAULT",
                "name": "Family Planning Clinic",
                "clinic_type": "FP",
                "location": "MCH Wing, Room 4",
                "capacity": 1,
                "default_service_fee": Decimal("200.00"),
                "triage_required": False,
            },
            {
                "code": "CWC-DEFAULT",
                "name": "Child Welfare Clinic",
                "clinic_type": "CWC",
                "location": "MCH Wing, Room 1",
                "capacity": 2,
                "default_service_fee": Decimal("200.00"),
                "triage_required": False,
            },
            {
                "code": "IMM-DEFAULT",
                "name": "Immunization Clinic",
                "clinic_type": "IMMUNIZATION",
                "location": "MCH Wing, Vaccination Room",
                "capacity": 2,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
            },
            {
                "code": "NUTRITION-DEFAULT",
                "name": "Nutrition Clinic",
                "clinic_type": "NUTRITION",
                "location": "Outpatient Block, Room 5",
                "capacity": 1,
                "default_service_fee": Decimal("200.00"),
                "triage_required": True,
            },
            # Specialty clinics
            {
                "code": "DENTAL-DEFAULT",
                "name": "Dental Clinic",
                "clinic_type": "DENTAL",
                "location": "Specialist Block, Dental Suite",
                "capacity": 1,
                "default_service_fee": Decimal("1500.00"),
                "triage_required": False,
            },
            {
                "code": "EYE-DEFAULT",
                "name": "Eye Clinic",
                "clinic_type": "EYE",
                "location": "Specialist Block, Ophthalmology",
                "capacity": 1,
                "default_service_fee": Decimal("1500.00"),
                "triage_required": False,
            },
            {
                "code": "ENT-DEFAULT",
                "name": "ENT Clinic",
                "clinic_type": "ENT",
                "location": "Specialist Block, ENT",
                "capacity": 1,
                "default_service_fee": Decimal("1500.00"),
                "triage_required": False,
            },
            {
                "code": "SURGICAL-DEFAULT",
                "name": "Surgical Outpatient Clinic",
                "clinic_type": "SURGICAL",
                "location": "Specialist Block, Surgery OPD",
                "capacity": 1,
                "default_service_fee": Decimal("1500.00"),
                "triage_required": True,
            },
            {
                "code": "ORTHO-DEFAULT",
                "name": "Orthopedic Clinic",
                "clinic_type": "ORTHO",
                "location": "Specialist Block, Ortho",
                "capacity": 1,
                "default_service_fee": Decimal("1500.00"),
                "triage_required": True,
            },
            {
                "code": "PHYSIO-DEFAULT",
                "name": "Physiotherapy Clinic",
                "clinic_type": "PHYSIO",
                "location": "Rehab Wing",
                "capacity": 2,
                "default_service_fee": Decimal("800.00"),
                "triage_required": False,
            },
            {
                "code": "DERM-DEFAULT",
                "name": "Dermatology Clinic",
                "clinic_type": "DERM",
                "location": "Specialist Block, Dermatology",
                "capacity": 1,
                "default_service_fee": Decimal("1500.00"),
                "triage_required": False,
            },
            # Chronic care
            {
                "code": "CCC-DEFAULT",
                "name": "Comprehensive Care Clinic",
                "clinic_type": "CCC",
                "location": "Chronic Care Wing",
                "capacity": 2,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
                "is_sensitive": True,
                "required_permission": "clinics.view_ccc_clinic",
            },
            {
                "code": "TB-DEFAULT",
                "name": "TB Clinic",
                "clinic_type": "TB",
                "location": "Chronic Care Wing",
                "capacity": 1,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
            },
            {
                "code": "DIABETIC-DEFAULT",
                "name": "Diabetic Clinic",
                "clinic_type": "DIABETIC",
                "location": "Chronic Care Wing",
                "capacity": 1,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
            },
            {
                "code": "HYPERTENSION-DEFAULT",
                "name": "Hypertension Clinic",
                "clinic_type": "HYPERTENSION",
                "location": "Chronic Care Wing",
                "capacity": 1,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
            },
            {
                "code": "MENTAL-DEFAULT",
                "name": "Mental Health Clinic",
                "clinic_type": "MENTAL_HEALTH",
                "location": "Chronic Care Wing, Counseling Room",
                "capacity": 1,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
                "is_sensitive": True,
                "required_permission": "clinics.view_mental_health_clinic",
            },
            {
                "code": "ONCO-DEFAULT",
                "name": "Oncology Clinic",
                "clinic_type": "ONCOLOGY",
                "location": "Specialist Block, Oncology",
                "capacity": 1,
                "default_service_fee": Decimal("0.00"),
                "triage_required": True,
            },
            {
                "code": "DIALYSIS-DEFAULT",
                "name": "Dialysis Unit",
                "clinic_type": "DIALYSIS",
                "location": "Renal Unit",
                "capacity": 4,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
            },
            # Procedure areas
            {
                "code": "PROCEDURE-DEFAULT",
                "name": "Procedure Room",
                "clinic_type": "PROCEDURE",
                "location": "Outpatient Block, Procedure Room",
                "capacity": 1,
                "default_service_fee": Decimal("1200.00"),
                "triage_required": False,
            },
            {
                "code": "DRESSING-DEFAULT",
                "name": "Dressing/Wound Care",
                "clinic_type": "DRESSING",
                "location": "Outpatient Block, Dressing Room",
                "capacity": 1,
                "default_service_fee": Decimal("300.00"),
                "triage_required": False,
            },
            {
                "code": "INJECTION-DEFAULT",
                "name": "Injection Room",
                "clinic_type": "INJECTION",
                "location": "Outpatient Block, Treatment Room",
                "capacity": 1,
                "default_service_fee": Decimal("200.00"),
                "triage_required": False,
            },
            # Other / sensitive GBV handling
            {
                "code": "GBV-DEFAULT",
                "name": "GBV Clinic",
                "clinic_type": "OTHER",
                "location": "Counseling Wing",
                "capacity": 1,
                "default_service_fee": Decimal("0.00"),
                "triage_required": False,
                "is_sensitive": True,
                "required_permission": "patients.view_sensitive_patient",
            },
        ]

        clinics_created = 0
        clinics_updated = 0
        clinics: list[Clinic] = []

        for clinic_data in CLINICS:
            code = clinic_data["code"]
            defaults = {
                "name": clinic_data["name"],
                "clinic_type": clinic_data["clinic_type"],
                "description": clinic_data.get("description", ""),
                "location": clinic_data.get("location", ""),
                "floor": clinic_data.get("floor", ""),
                "capacity": clinic_data.get("capacity", 1),
                "status": "ACTIVE",
                "requires_appointment": clinic_data.get("requires_appointment", False),
                "requires_referral": clinic_data.get("requires_referral", False),
                "accepts_walk_ins": clinic_data.get("accepts_walk_ins", True),
                "triage_required": clinic_data.get("triage_required", True),
                "eligibility_rules": clinic_data.get("eligibility_rules"),
                "default_service_fee": clinic_data.get("default_service_fee"),
                "is_sensitive": clinic_data.get("is_sensitive", False),
                "required_permission": clinic_data.get("required_permission", ""),
            }

            clinic, created = Clinic.objects.update_or_create(code=code, defaults=defaults)
            if created:
                clinics_created += 1
            else:
                clinics_updated += 1
            clinics.append(clinic)

        self.stdout.write(f"  Clinics: {clinics_created} created, {clinics_updated} updated")

        # -----------------------------------------------------------------
        # Schedules (Mon-Fri) + ensure open today
        # -----------------------------------------------------------------
        schedules_created = 0
        schedules_updated = 0
        for clinic in clinics:
            for day in range(0, 5):
                start = time(8, 0)
                end = time(17, 0)
                if clinic.clinic_type in {"DIALYSIS"}:
                    start = time(7, 0)
                    end = time(15, 0)
                if clinic.clinic_type in {"IMMUNIZATION", "CWC"}:
                    start = time(9, 0)
                    end = time(16, 0)

                sched, created = ClinicSchedule.objects.update_or_create(
                    clinic=clinic,
                    day_of_week=day,
                    start_time=start,
                    defaults={
                        "end_time": end,
                        "max_patients": 60,
                        "is_active": True,
                        "notes": "[DEMO] Default weekday schedule",
                    },
                )
                if created:
                    schedules_created += 1
                else:
                    schedules_updated += 1

            # Ensure clinic is open today in case today is weekend
            if weekday > 4:
                ClinicSchedule.objects.update_or_create(
                    clinic=clinic,
                    day_of_week=weekday,
                    start_time=time(9, 0),
                    defaults={
                        "end_time": time(13, 0),
                        "max_patients": 40,
                        "is_active": True,
                        "notes": "[DEMO] Weekend schedule",
                    },
                )

        self.stdout.write(
            f"  Schedules: {schedules_created} created, {schedules_updated} updated"
        )

        # -----------------------------------------------------------------
        # Staff assignments
        # -----------------------------------------------------------------
        assignments_created = 0
        assignments_updated = 0

        def assign(clinic: Clinic, user, role: str, is_primary: bool = False):
            nonlocal assignments_created, assignments_updated
            if user is None:
                return
            obj, created = ClinicStaff.objects.update_or_create(
                clinic=clinic,
                user=user,
                role=role,
                defaults={
                    "is_primary": is_primary,
                    "start_date": today - timedelta(days=30),
                    "end_date": None,
                    "is_active": True,
                },
            )
            if created:
                assignments_created += 1
            else:
                assignments_updated += 1
            return obj

        for clinic in clinics:
            # Default staffing patterns
            assign(clinic, receptionist, "CLERK", is_primary=(clinic.clinic_type == "GENERAL_OPD"))

            if clinic.clinic_type in {"GENERAL_OPD", "SURGICAL", "ORTHO", "DERM", "EYE", "ENT", "DENTAL"}:
                assign(clinic, doctor, "DOCTOR", is_primary=True)
            elif clinic.clinic_type in {"FILTER_CLINIC"}:
                assign(clinic, clinical_officer, "DOCTOR", is_primary=True)
            elif clinic.clinic_type in {"ANC", "PNC", "FP", "CWC", "IMMUNIZATION", "NUTRITION"}:
                assign(clinic, nurse, "NURSE", is_primary=True)
            elif clinic.clinic_type in {"CCC", "TB", "DIABETIC", "HYPERTENSION", "ONCOLOGY", "DIALYSIS"}:
                assign(clinic, doctor, "DOCTOR", is_primary=True)
                assign(clinic, nurse, "NURSE", is_primary=False)
            elif clinic.code == "GBV-DEFAULT":
                assign(clinic, nurse, "COUNSELOR", is_primary=True)

        self.stdout.write(
            f"  Staff assignments: {assignments_created} created, {assignments_updated} updated"
        )

        # -----------------------------------------------------------------
        # Sessions for today (open)
        # -----------------------------------------------------------------
        sessions_created = 0
        sessions_updated = 0
        sessions: list[ClinicSession] = []
        for clinic in clinics:
            session, created = ClinicSession.objects.update_or_create(
                clinic=clinic,
                session_date=today,
                defaults={
                    "status": "OPEN",
                    "opened_at": timezone.now(),
                    "opened_by": demo_admin,
                    "notes": "[DEMO] Open session for today",
                },
            )
            if created:
                sessions_created += 1
            else:
                sessions_updated += 1
                if session.status != "OPEN":
                    session.status = "OPEN"
                    session.opened_at = session.opened_at or timezone.now()
                    session.opened_by = session.opened_by or demo_admin
                    session.save(update_fields=["status", "opened_at", "opened_by"])
            sessions.append(session)

        self.stdout.write(f"  Sessions: {sessions_created} created, {sessions_updated} updated")

        # -----------------------------------------------------------------
        # Default clinical templates per clinic (best effort)
        # -----------------------------------------------------------------
        templates_set = 0
        for clinic in clinics:
            if clinic.default_clinical_template_id:
                continue
            resolved = resolve_default_clinical_template(clinic)
            if resolved is None:
                continue
            clinic.default_clinical_template = resolved
            clinic.save(update_fields=["default_clinical_template"])
            templates_set += 1

        self.stdout.write(f"  Default templates set: {templates_set}")

        # -----------------------------------------------------------------
        # Enrollments (CCC/ANC/Diabetic/HTN) for deterministic demo patients
        # -----------------------------------------------------------------
        enrollments_created = 0
        enrollments_updated = 0

        def get_patient_by_temp_id(temp_id: str) -> Patient | None:
            return Patient.objects.filter(
                identification_type="temporary_id", identification_number=temp_id
            ).first()

        clinic_by_type = {c.clinic_type: c for c in clinics}
        ccc = clinic_by_type.get("CCC")
        anc = clinic_by_type.get("ANC")
        diab = clinic_by_type.get("DIABETIC")
        htn = clinic_by_type.get("HYPERTENSION")
        mental = clinic_by_type.get("MENTAL_HEALTH")

        enrollment_specs = [
            ("DEMO-PT-0901", ccc, {"appointment_interval_days": 30}),
            ("DEMO-PT-0101", anc, {"appointment_interval_days": 28}),
            ("DEMO-PT-0301", diab, {"appointment_interval_days": 30}),
            ("DEMO-PT-0302", htn, {"appointment_interval_days": 30}),
            ("DEMO-PT-0902", mental, {"appointment_interval_days": 14}),
        ]

        for temp_id, clinic, extra in enrollment_specs:
            if clinic is None:
                continue
            patient = get_patient_by_temp_id(temp_id)
            if patient is None:
                continue

            enrollment, created = ClinicEnrollment.objects.update_or_create(
                clinic=clinic,
                patient=patient,
                defaults={
                    "enrollment_date": today - timedelta(days=randint(30, 365)),
                    "status": "ACTIVE",
                    "enrolled_by": doctor,
                    "next_appointment": today + timedelta(days=extra.get("appointment_interval_days", 30)),
                    "appointment_interval_days": extra.get("appointment_interval_days", 30),
                },
            )
            if created:
                enrollments_created += 1
            else:
                enrollments_updated += 1

        self.stdout.write(
            f"  Enrollments: {enrollments_created} created, {enrollments_updated} updated"
        )

        # -----------------------------------------------------------------
        # Queue visits across clinics (WAITING/CALLED/IN_CONSULTATION/COMPLETED)
        # -----------------------------------------------------------------
        complaints = [
            "Fever and headache",
            "Cough and chest discomfort",
            "Follow-up visit",
            "Medication refill",
            "Routine check-up",
            "Abdominal pain",
            "Joint pain",
            "Skin rash",
            "Eye irritation",
            "Toothache",
        ]

        def next_queue_number(session: ClinicSession) -> int:
            last = ClinicVisit.objects.filter(session=session).order_by("-queue_number").first()
            return (last.queue_number + 1) if last else 1

        visits_created = 0
        visits_updated = 0

        # Use a stable pool of patients; prefer deterministic ones first
        preferred_temp_ids = [
            "DEMO-PT-0001",
            "DEMO-PT-0002",
            "DEMO-PT-0101",
            "DEMO-PT-0102",
            "DEMO-PT-0103",
            "DEMO-PT-0104",
            "DEMO-PT-0201",
            "DEMO-PT-0202",
            "DEMO-PT-0203",
            "DEMO-PT-0301",
            "DEMO-PT-0302",
            "DEMO-PT-0901",
            "DEMO-PT-0902",
            "DEMO-PT-0903",
        ]
        preferred_patients = [p for p in (get_patient_by_temp_id(t) for t in preferred_temp_ids) if p]

        other_patients = list(
            Patient.objects.exclude(id__in=[p.id for p in preferred_patients])
            .order_by("-id")
            .all()[:50]
        )
        patient_pool = preferred_patients + other_patients
        if not patient_pool:
            self.stdout.write(self.style.WARNING("  No patients available for clinic queues."))
            return

        def upsert_visit(
            *,
            session: ClinicSession,
            patient: Patient,
            status: str,
            priority: str = "STANDARD",
            source: str = "TRIAGE",
            visit_type: str = "NEW",
            assigned=None,
        ) -> ClinicVisit:
            nonlocal visits_created, visits_updated

            existing = ClinicVisit.objects.filter(session=session, patient=patient).first()
            if existing:
                existing.status = status
                existing.priority = priority
                existing.source = source
                existing.visit_type = visit_type
                existing.chief_complaint = existing.chief_complaint or choice(complaints)
                existing.notes = "[DEMO] Seeded clinic visit"
                if assigned is not None:
                    existing.assigned_clinician = assigned
                existing.save()
                visits_updated += 1
                return existing

            visit = ClinicVisit.objects.create(
                session=session,
                patient=patient,
                queue_number=next_queue_number(session),
                status=status,
                priority=priority,
                source=source,
                visit_type=visit_type,
                chief_complaint=choice(complaints),
                notes="[DEMO] Seeded clinic visit",
                registered_by=receptionist,
                assigned_clinician=assigned,
            )
            visits_created += 1
            return visit

        # Seed a small queue for each clinic session
        pool_index = 0
        for session in sessions:
            # Keep sensitive clinics smaller
            clinic = session.clinic
            per_clinic = 3 if clinic.is_sensitive else 5

            statuses = ["WAITING", "WAITING", "CALLED", "IN_CONSULTATION", "COMPLETED"]
            statuses = statuses[:per_clinic]

            for s in statuses:
                patient = patient_pool[pool_index % len(patient_pool)]
                pool_index += 1

                priority = choice(["STANDARD", "PRIORITY", "URGENT"])
                assigned_user = doctor if clinic.clinic_type not in {"ANC", "PNC", "FP", "CWC", "IMMUNIZATION"} else nurse
                if clinic.clinic_type == "FILTER_CLINIC":
                    assigned_user = clinical_officer
                if clinic.code == "GBV-DEFAULT":
                    assigned_user = nurse

                visit = upsert_visit(
                    session=session,
                    patient=patient,
                    status=s,
                    priority=priority,
                    source="TRIAGE" if clinic.triage_required else "DIRECT",
                    visit_type=choice(["NEW", "RETURN", "FOLLOW_UP"]),
                    assigned=assigned_user if s in {"CALLED", "IN_CONSULTATION", "COMPLETED"} else None,
                )

                # Add timestamps for realism
                if visit.status in {"CALLED", "IN_CONSULTATION", "COMPLETED"} and visit.called_at is None:
                    visit.called_at = timezone.now() - timedelta(minutes=randint(5, 60))
                if visit.status in {"IN_CONSULTATION", "COMPLETED"} and visit.consultation_started_at is None:
                    visit.consultation_started_at = timezone.now() - timedelta(minutes=randint(1, 30))
                if visit.status == "COMPLETED" and visit.completed_at is None:
                    visit.completed_at = timezone.now() - timedelta(minutes=randint(1, 10))
                visit.save()

            # Update session stats
            session.update_statistics()

        # Create one example referral flow (best-effort)
        try:
            source_clinic = Clinic.objects.filter(code="FILTER-DEFAULT").first()
            target_clinic = Clinic.objects.filter(code="OPD-DEFAULT").first()
            if source_clinic and target_clinic:
                src_session = ClinicSession.objects.get(clinic=source_clinic, session_date=today)
                patient = preferred_patients[0] if preferred_patients else patient_pool[0]
                src_visit = upsert_visit(
                    session=src_session,
                    patient=patient,
                    status="IN_CONSULTATION",
                    priority="PRIORITY",
                    source="DIRECT",
                    visit_type="NEW",
                    assigned=clinical_officer,
                )
                src_visit.refer_to_clinic(target_clinic, "Referred for clinician review", clinical_officer)
        except Exception as e:
            # Do not fail demo seeding because referral creation is best-effort
            self.stdout.write(self.style.WARNING(f"    Referral creation skipped: {e}"))

        self.stdout.write(f"  Clinic visits: {visits_created} created, {visits_updated} updated")
        self.stdout.write(self.style.SUCCESS("  ✅ Clinics demo data created successfully!"))

    def _seed_imaging_data(self, options):
        """Seed imaging demo data: procedures (via catalog command), orders, and order items."""
        from datetime import date, timedelta
        from random import choice, randint

        from django.contrib.auth import get_user_model
        from django.core.management import call_command
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure
        from hmis.apps.patients.models import Patient

        User = get_user_model()

        # =================================================================
        # Step 1: Seed the imaging procedure catalog (delegates to existing command)
        # =================================================================
        self.stdout.write("  Seeding imaging procedure catalog...")
        try:
            call_command("seed_imaging_catalog", verbosity=0)
            procedure_count = ImagingProcedure.objects.filter(is_active=True).count()
            self.stdout.write(f"    Imaging catalog ready: {procedure_count} procedures")
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(f"    Could not seed imaging catalog: {e}")
            )

        # =================================================================
        # Step 2: Get required users and patients
        # =================================================================
        demo_doctor = User.objects.filter(username="demo_doctor").first()

        if not demo_doctor:
            demo_doctor = User.objects.filter(is_superuser=True).first()

        if not demo_doctor:
            self.stdout.write(
                self.style.WARNING("  No ordering user found. Skipping imaging orders.")
            )
            return

        # Get patients (prefer deterministic demo patients)
        patients = list(
            Patient.objects.filter(
                identification_type="temporary_id",
                identification_number__startswith="DEMO-PT-",
            )[:10]
        )
        if not patients:
            patients = list(Patient.objects.all()[:10])

        if not patients:
            self.stdout.write(
                self.style.WARNING("  No patients found. Skipping imaging orders.")
            )
            return

        # Get procedures grouped by modality for realistic ordering patterns
        procedures = list(ImagingProcedure.objects.filter(is_active=True))
        if not procedures:
            self.stdout.write(
                self.style.WARNING("  No imaging procedures found. Skipping orders.")
            )
            return

        xray_procedures = [p for p in procedures if p.modality == "XR"]
        us_procedures = [p for p in procedures if p.modality == "US"]
        ct_procedures = [p for p in procedures if p.modality == "CT"]
        mri_procedures = [p for p in procedures if p.modality == "MRI"]

        # =================================================================
        # Step 3: Ensure encounters exist for orders (create if needed)
        # =================================================================
        self.stdout.write("  Ensuring encounters exist for imaging orders...")
        encounters_created = 0

        for patient in patients:
            existing_encounter = Encounter.objects.filter(patient=patient).first()
            if not existing_encounter:
                # Create a basic encounter for this patient
                Encounter.objects.create(
                    patient=patient,
                    encounter_type="OPD",
                    encounter_date=date.today() - timedelta(days=randint(0, 30)),
                    chief_complaint="Routine checkup / imaging referral",
                    assigned_clinician=demo_doctor,
                    status="CLOSED",
                )
                encounters_created += 1

        if encounters_created:
            self.stdout.write(f"    Created {encounters_created} encounters for imaging")

        # =================================================================
        # Step 4: Clinical indication templates (realistic Kenya context)
        # =================================================================
        CLINICAL_INDICATIONS = {
            "XR": [
                "Chronic cough for 3 weeks, rule out pulmonary TB",
                "Productive cough with night sweats, ? PTB",
                "Road traffic accident, rule out fractures",
                "Fall from height, assess for bony injury",
                "Chronic low back pain, r/o degenerative changes",
                "Post-operative follow-up chest",
                "Suspected pneumonia with fever and dyspnea",
                "Trauma to right knee, exclude fracture",
                "Recurrent shoulder pain, assess joint space",
                "Known hypertensive, pre-operative cardiac assessment",
                "Motorcycle accident with wrist injury",
                "Suspected foreign body ingestion",
            ],
            "US": [
                "Right upper quadrant pain, r/o cholelithiasis",
                "Amenorrhea 8 weeks, confirm intrauterine pregnancy",
                "ANC - routine obstetric ultrasound at 20 weeks",
                "Lower abdominal pain, rule out ovarian pathology",
                "Pelvic pain with irregular menses, assess uterus and adnexa",
                "Abdominal distension, r/o ascites",
                "Known hepatitis B, assess liver parenchyma",
                "Flank pain with hematuria, rule out renal calculi",
                "Scrotal swelling, r/o hydrocele vs varicocele",
                "Breast lump on self-examination, characterize",
                "Known diabetic, assess kidneys for nephropathy",
                "Post-partum fever, r/o retained products",
            ],
            "CT": [
                "Severe headache with altered consciousness, r/o stroke",
                "Road traffic accident with head injury, r/o intracranial hemorrhage",
                "Chronic headache with visual disturbance, r/o SOL",
                "Abdominal pain with peritonitis, r/o perforation",
                "Staging workup for known malignancy",
                "Persistent cough, CXR inconclusive, r/o lung mass",
                "Suspected pulmonary embolism with dyspnea",
                "Trauma with suspected splenic injury",
            ],
            "MRI": [
                "Chronic knee pain, assess menisci and ligaments",
                "Lower back pain with radiculopathy, r/o disc herniation",
                "Seizure disorder, rule out structural lesion",
                "Shoulder pain with limited ROM, assess rotator cuff",
                "Recurrent headache, characterize brain parenchyma",
                "Known breast mass for staging",
            ],
        }

        RELEVANT_HISTORY = [
            "No known allergies. No previous similar imaging.",
            "Allergic to penicillin. No contrast allergy known.",
            "Hypertensive on amlodipine 10mg OD. Diabetic on metformin.",
            "Previous appendectomy 2019. No other surgical history.",
            "Known asthmatic. On salbutamol inhaler PRN.",
            "Smoker, 10 pack-years. Social alcohol use.",
            "Previous CT scan 6 months ago showed mild hepatomegaly.",
            "G3P2, previous SVDs. No pregnancy complications.",
            "Known sickle cell disease, on hydroxyurea.",
            "HIV positive on ART (TDF/3TC/DTG), CD4 450, VL undetectable.",
            "",
        ]

        # =================================================================
        # Step 5: Create imaging orders with various statuses
        # =================================================================
        self.stdout.write("  Creating imaging orders...")

        ORDER_STATUS_DISTRIBUTION = [
            ("ORDERED", 3),
            ("SCHEDULED", 2),
            ("IN_PROGRESS", 2),
            ("COMPLETED", 4),
            ("REPORTED", 5),
            ("CANCELLED", 1),
        ]

        orders_created = 0
        items_created = 0
        today = date.today()

        for patient in patients:
            encounter = Encounter.objects.filter(patient=patient).first()
            if not encounter:
                continue

            # Create 1-3 imaging orders per patient
            num_orders = randint(1, 3)
            for _ in range(num_orders):
                # Pick status based on distribution
                status = choice(
                    [s for s, weight in ORDER_STATUS_DISTRIBUTION for _ in range(weight)]
                )

                # Pick modality with realistic distribution (X-ray most common)
                modality_weights = [
                    (xray_procedures, 5),
                    (us_procedures, 3),
                    (ct_procedures, 1),
                    (mri_procedures, 1),
                ]
                available_pools = [(pool, w) for pool, w in modality_weights if pool]
                if not available_pools:
                    continue

                procedure_pool = choice(
                    [p for pool, weight in available_pools for p in [pool] * weight]
                )
                if not procedure_pool:
                    continue

                # Pick random procedure from the pool
                procedure = choice(procedure_pool)
                modality = procedure.modality

                # Get appropriate clinical indication
                indications = CLINICAL_INDICATIONS.get(modality, CLINICAL_INDICATIONS["XR"])
                clinical_indication = choice(indications)
                relevant_history = choice(RELEVANT_HISTORY)

                # Determine priority based on indication keywords
                priority = "ROUTINE"
                if any(
                    kw in clinical_indication.lower()
                    for kw in ["accident", "trauma", "stroke", "emergency", "stat"]
                ):
                    priority = choice(["URGENT", "STAT"])
                elif any(
                    kw in clinical_indication.lower()
                    for kw in ["severe", "altered", "hemorrhage"]
                ):
                    priority = "URGENT"

                # Calculate dates based on status
                days_ago = randint(0, 30)
                ordered_at = timezone.now() - timedelta(days=days_ago)

                # Create the order
                order = ImagingOrder(
                    patient=patient,
                    encounter=encounter,
                    ordered_by=demo_doctor,
                    priority=priority,
                    clinical_indication=clinical_indication,
                    relevant_clinical_history=relevant_history,
                    status="DRAFT",
                )
                order.save()  # This auto-generates order_number
                orders_created += 1

                # Transition status appropriately
                if status != "DRAFT":
                    order.status = "ORDERED"
                    order.save(update_fields=["status"])

                if status in ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "REPORTED"]:
                    order.status = "SCHEDULED"
                    order.scheduled_datetime = ordered_at + timedelta(hours=randint(2, 48))
                    order.scheduled_room = choice(["X-Ray Room 1", "X-Ray Room 2", "US Room A", "CT Suite", "MRI Suite"])
                    order.save(update_fields=["status", "scheduled_datetime", "scheduled_room"])

                if status in ["IN_PROGRESS", "COMPLETED", "REPORTED"]:
                    order.status = "IN_PROGRESS"
                    # Generate PACS accession number
                    order.accession_number = f"ACC-{today.strftime('%Y%m%d')}-{randint(1000, 9999)}"
                    order.save(update_fields=["status", "accession_number"])

                if status in ["COMPLETED", "REPORTED"]:
                    order.status = "COMPLETED"
                    order.completed_at = ordered_at + timedelta(hours=randint(1, 24))
                    order.save(update_fields=["status", "completed_at"])

                if status == "REPORTED":
                    order.status = "REPORTED"
                    order.save(update_fields=["status"])

                if status == "CANCELLED":
                    order.status = "CANCELLED"
                    order.save(update_fields=["status"])

                # =============================================================
                # Step 6: Create order items (1-3 procedures per order)
                # =============================================================
                num_items = randint(1, 2) if modality in ["XR", "US"] else 1

                for _ in range(num_items):
                    # Pick procedure from same modality pool
                    item_procedure = choice(procedure_pool)

                    # Determine laterality based on body region
                    laterality = "NA"
                    if item_procedure.body_region in ["UPPER_EXTREMITY", "LOWER_EXTREMITY"]:
                        laterality = choice(["LEFT", "RIGHT", "BILATERAL"])
                    elif item_procedure.body_region == "CHEST" and "lateral" in item_procedure.name.lower():
                        laterality = "NA"

                    # Create order item
                    ImagingOrderItem.objects.create(
                        order=order,
                        procedure=item_procedure,
                        laterality=laterality,
                        specific_instructions="" if randint(0, 3) else choice([
                            "Use small focal spot",
                            "Include comparison with previous study",
                            "Full bladder required",
                            "Patient anxious, may need reassurance",
                            "Portable study if patient unstable",
                        ]),
                        unit_cost=item_procedure.cost,
                        is_completed=status in ["COMPLETED", "REPORTED"],
                        completed_at=order.completed_at if status in ["COMPLETED", "REPORTED"] else None,
                    )
                    items_created += 1

                # Recalculate total cost
                order.calculate_total_cost()

                # Mark as paid for completed/reported orders (80% of the time)
                if status in ["COMPLETED", "REPORTED"] and randint(1, 10) <= 8:
                    order.is_paid = True
                    order.save(update_fields=["is_paid"])

        self.stdout.write(f"    Created {orders_created} imaging orders")
        self.stdout.write(f"    Created {items_created} imaging order items")

        # =================================================================
        # Summary by status
        # =================================================================
        status_counts = {}
        for status, _ in ImagingOrder.ORDER_STATUS:
            count = ImagingOrder.objects.filter(status=status).count()
            if count > 0:
                status_counts[status] = count

        self.stdout.write("    Order status distribution:")
        for status, count in status_counts.items():
            self.stdout.write(f"      {status}: {count}")

        self.stdout.write(self.style.SUCCESS("  ✅ Imaging demo data created successfully!"))

    def _seed_pharmacy_stock_data(self, options):
        """
        Seed pharmacy stock data: create stock batches for all drugs in the catalog.

        This ensures that demos have available stock for dispensing workflows.
        """
        from datetime import date, timedelta
        from decimal import Decimal
        from random import choice, randint, uniform

        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockBatch

        User = get_user_model()

        # Get all active drugs
        drugs = Drug.objects.filter(is_active=True)

        if not drugs.exists():
            self.stdout.write(self.style.WARNING("  No drugs found. Run import_drugs first."))
            return

        # Get a pharmacist for received_by
        pharmacist = User.objects.filter(username="demo_pharmacist").first()
        if not pharmacist:
            pharmacist = User.objects.filter(is_staff=True).first()

        today = date.today()
        batches_created = 0
        batches_skipped = 0
        total_stock_value = Decimal("0.00")

        # Supplier options (realistic Kenyan suppliers)
        SUPPLIERS = [
            "Kenya Medical Supplies Authority (KEMSA)",
            "Mission for Essential Drugs & Supplies (MEDS)",
            "Philips Pharmaceuticals Ltd",
            "Cosmos Limited",
            "Dawa Limited",
            "Beta Healthcare (K) Ltd",
            "Nairobi Pharma Ltd",
            "Elys Chemical Industries Ltd",
        ]

        # Storage locations
        LOCATIONS = [
            "Main Pharmacy - Shelf A1",
            "Main Pharmacy - Shelf A2",
            "Main Pharmacy - Shelf B1",
            "Main Pharmacy - Shelf B2",
            "Cold Storage Unit 1",
            "Controlled Substances Cabinet",
            "Emergency Stock Bay",
            "Dispensing Counter Stock",
        ]

        for drug in drugs:
            # Check if drug already has stock batches
            existing_batches = drug.batches.filter(status="AVAILABLE").count()
            if existing_batches > 0:
                batches_skipped += 1
                continue

            # Create 1-3 batches per drug for variety
            num_batches = randint(1, 3)

            for batch_num in range(num_batches):
                # Generate batch number (format: BTH-YYYYMMDD-XXXX)
                batch_date = today - timedelta(days=randint(1, 90))
                batch_number = f"BTH-{batch_date.strftime('%Y%m%d')}-{randint(1000, 9999)}"

                # Quantity based on drug type (controlled substances have smaller quantities)
                if drug.is_controlled or drug.is_narcotic:
                    quantity = randint(20, 100)
                else:
                    quantity = randint(100, 500)

                # Reference price calculation
                base_price = drug.reference_price or Decimal(str(uniform(50, 500)))
                cost_price = base_price * Decimal("0.7")  # 30% margin
                selling_price = base_price

                # Expiry date (6 months to 2 years from now)
                months_to_expiry = randint(6, 24)
                expiry_date = today + timedelta(days=months_to_expiry * 30)

                # Manufacture date (before received date)
                manufacture_date = batch_date - timedelta(days=randint(30, 180))

                # Location based on drug type
                if drug.is_controlled or drug.is_narcotic:
                    location = "Controlled Substances Cabinet"
                elif drug.storage_requirements and "cold" in drug.storage_requirements.lower():
                    location = "Cold Storage Unit 1"
                else:
                    location = choice(LOCATIONS[:4])  # Regular shelves

                # Create the stock batch
                batch, created = StockBatch.objects.get_or_create(
                    drug=drug,
                    batch_number=batch_number,
                    defaults={
                        "barcode": f"{drug.code}-{batch_number}",
                        "quantity_received": quantity,
                        "quantity_available": quantity,
                        "quantity_dispensed": 0,
                        "quantity_damaged": 0,
                        "quantity_expired": 0,
                        "manufacture_date": manufacture_date,
                        "expiry_date": expiry_date,
                        "received_date": batch_date,
                        "cost_price": round(cost_price, 2),
                        "selling_price": round(selling_price, 2),
                        "supplier": choice(SUPPLIERS),
                        "purchase_order": f"PO-{batch_date.strftime('%Y%m')}-{randint(100, 999)}",
                        "received_by": pharmacist,
                        "status": "AVAILABLE",
                        "location": location,
                    },
                )

                if created:
                    batches_created += 1
                    total_stock_value += batch.get_value()

        # Summary
        self.stdout.write(f"  Created {batches_created} stock batches for {drugs.count()} drugs")
        self.stdout.write(f"  Skipped {batches_skipped} drugs (already have stock)")
        self.stdout.write(f"  Total stock value: KES {total_stock_value:,.2f}")
        self.stdout.write(self.style.SUCCESS("  ✅ Pharmacy stock data created successfully!"))
