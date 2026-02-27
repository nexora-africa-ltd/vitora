#!/usr/bin/env python
"""
Seed script for Vitora HMIS staging/demo environment.

Creates realistic sample data for stakeholder workflow demonstrations:
- Demo users with different roles
- Sample patients with Kenyan names
- Sample encounters with diagnoses
- Sample prescriptions and lab orders

Usage:
    cd backend
    poetry shell
    python manage.py shell < scripts/seed_demo_data.py

    # Or run directly:
    DJANGO_SETTINGS_MODULE=hmis.settings.staging python scripts/seed_demo_data.py

Author: Nexora Africa Ltd
"""

import os
import sys
from datetime import date, timedelta
from decimal import Decimal
from random import choice, randint

import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings.staging")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.models import Group, Permission  # noqa: E402
from django.db import transaction  # noqa: E402

from hmis.apps.core.models import County, SubCounty, Ward  # noqa: E402
from hmis.apps.encounters.models import Encounter  # noqa: E402
from hmis.apps.patients.models import Patient  # noqa: E402

User = get_user_model()

# =============================================================================
# Demo User Credentials
# =============================================================================
DEMO_USERS = [
    {
        "username": "demo_admin",
        "password": "DemoAdmin2026?!",
        "first_name": "Demo",
        "last_name": "Administrator",
        "email": "admin@demo.vitora.health",
        "is_staff": True,
        "is_superuser": True,
        "role": "System Administrator",
    },
    {
        "username": "demo_receptionist",
        "password": "DemoReception2026?!",
        "first_name": "Faith",
        "last_name": "Mwangi",
        "email": "receptionist@demo.vitora.health",
        "role": "Receptionist",
        "groups": ["Receptionists"],
    },
    {
        "username": "demo_nurse",
        "password": "DemoNurse2026?!",
        "first_name": "Grace",
        "last_name": "Ochieng",
        "email": "nurse@demo.vitora.health",
        "role": "Nurse (Triage)",
        "groups": ["Nurses"],
    },
    {
        "username": "demo_doctor",
        "password": "DemoDoctor2026?!",
        "first_name": "Dr. James",
        "last_name": "Kamau",
        "email": "doctor@demo.vitora.health",
        "role": "Doctor (General Practitioner)",
        "groups": ["Doctors"],
    },
    {
        "username": "demo_pharmacist",
        "password": "DemoPharmacy2026?!",
        "first_name": "Peter",
        "last_name": "Njoroge",
        "email": "pharmacy@demo.vitora.health",
        "role": "Pharmacist",
        "groups": ["Pharmacists"],
    },
    {
        "username": "demo_labtech",
        "password": "DemoLab2026?!",
        "first_name": "Sarah",
        "last_name": "Wanjiku",
        "email": "lab@demo.vitora.health",
        "role": "Lab Technician",
        "groups": ["Lab Technicians"],
    },
    {
        "username": "demo_billing",
        "password": "DemoBilling2026?!",
        "first_name": "John",
        "last_name": "Mutua",
        "email": "billing@demo.vitora.health",
        "role": "Billing Clerk",
        "groups": ["Billing Clerks"],
    },
]

# =============================================================================
# Sample Kenyan Names
# =============================================================================
KENYAN_FIRST_NAMES_MALE = [
    "John",
    "James",
    "Peter",
    "David",
    "Joseph",
    "Samuel",
    "Daniel",
    "Michael",
    "Stephen",
    "Paul",
    "George",
    "Francis",
    "Charles",
    "Martin",
    "Patrick",
    "Brian",
    "Kevin",
    "Dennis",
    "Alex",
    "Collins",
    "Eric",
    "Felix",
    "Geoffrey",
    "Henry",
    "Isaac",
    "Kelvin",
    "Moses",
    "Nicholas",
    "Oscar",
    "Victor",
    "Wycliffe",
]

KENYAN_FIRST_NAMES_FEMALE = [
    "Mary",
    "Jane",
    "Grace",
    "Faith",
    "Ann",
    "Sarah",
    "Elizabeth",
    "Margaret",
    "Catherine",
    "Agnes",
    "Florence",
    "Esther",
    "Joyce",
    "Rose",
    "Lucy",
    "Nancy",
    "Rachel",
    "Ruth",
    "Winfred",
    "Beatrice",
    "Caroline",
    "Dorothy",
    "Eunice",
    "Gladys",
    "Hannah",
    "Irene",
    "Jennifer",
    "Lydia",
    "Mercy",
    "Naomi",
]

KENYAN_SURNAMES = [
    "Kamau",
    "Ochieng",
    "Wanjiru",
    "Mwangi",
    "Njoroge",
    "Otieno",
    "Wambui",
    "Kimani",
    "Omondi",
    "Nyambura",
    "Kiprono",
    "Akinyi",
    "Mutua",
    "Kosgei",
    "Chebet",
    "Kiplagat",
    "Wairimu",
    "Odongo",
    "Ndungu",
    "Cheruiyot",
    "Odhiambo",
    "Maina",
    "Kiptoo",
    "Jepkosgei",
    "Rotich",
    "Kemboi",
    "Chepkurui",
    "Lagat",
    "Sitienei",
    "Kipchoge",
]

# =============================================================================
# Sample Diagnoses (Common in Kenya)
# =============================================================================
COMMON_DIAGNOSES = [
    {"code": "J06.9", "description": "Acute upper respiratory infection, unspecified"},
    {"code": "A09.9", "description": "Gastroenteritis and colitis of unspecified origin"},
    {"code": "J18.9", "description": "Pneumonia, unspecified organism"},
    {"code": "B54", "description": "Unspecified malaria"},
    {"code": "K29.7", "description": "Gastritis, unspecified"},
    {"code": "N39.0", "description": "Urinary tract infection, site not specified"},
    {"code": "J02.9", "description": "Acute pharyngitis, unspecified"},
    {"code": "I10", "description": "Essential (primary) hypertension"},
    {"code": "E11.9", "description": "Type 2 diabetes mellitus without complications"},
    {"code": "M54.5", "description": "Low back pain"},
]

# =============================================================================
# Sample Encounter Chief Complaints
# =============================================================================
CHIEF_COMPLAINTS = [
    "Fever and body aches for 3 days",
    "Cough and difficulty breathing",
    "Abdominal pain and diarrhea",
    "Headache and dizziness",
    "Joint pain and swelling",
    "Skin rash and itching",
    "General body weakness",
    "Sore throat and difficulty swallowing",
    "Back pain for 1 week",
    "Follow-up for hypertension",
    "Follow-up for diabetes",
    "Routine antenatal check-up",
    "Child immunization visit",
    "Persistent cough for 2 weeks",
    "Chest pain on exertion",
]


def create_demo_groups():
    """Create role-based groups with appropriate permissions."""
    print("Creating demo groups...")

    groups_permissions = {
        "Receptionists": [
            "add_patient",
            "change_patient",
            "view_patient",
            "add_encounter",
            "view_encounter",
        ],
        "Nurses": [
            "view_patient",
            "change_patient",
            "add_encounter",
            "change_encounter",
            "view_encounter",
            "add_triageassessment",
            "change_triageassessment",
            "view_triageassessment",
        ],
        "Doctors": [
            "view_patient",
            "change_patient",
            "add_encounter",
            "change_encounter",
            "view_encounter",
            "add_prescription",
            "change_prescription",
            "view_prescription",
            "add_laborder",
            "view_laborder",
            "view_labresult",
        ],
        "Pharmacists": [
            "view_patient",
            "view_prescription",
            "change_prescription",
            "add_dispensing",
            "change_dispensing",
            "view_dispensing",
            "view_drug",
            "change_drug",
        ],
        "Lab Technicians": [
            "view_patient",
            "view_laborder",
            "change_laborder",
            "add_labresult",
            "change_labresult",
            "view_labresult",
        ],
        "Billing Clerks": [
            "view_patient",
            "view_encounter",
            "add_invoice",
            "change_invoice",
            "view_invoice",
            "add_payment",
            "change_payment",
            "view_payment",
        ],
    }

    for group_name, perm_codenames in groups_permissions.items():
        group, created = Group.objects.get_or_create(name=group_name)
        for codename in perm_codenames:
            try:
                perm = Permission.objects.get(codename=codename)
                group.permissions.add(perm)
            except Permission.DoesNotExist:
                print(f"  Warning: Permission '{codename}' not found")
        print(f"  {'Created' if created else 'Updated'} group: {group_name}")

    return groups_permissions.keys()


def create_demo_users():
    """Create demo users for each role."""
    print("\nCreating demo users...")

    for user_data in DEMO_USERS:
        username = user_data["username"]
        password = user_data["password"]

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "first_name": user_data["first_name"],
                "last_name": user_data["last_name"],
                "email": user_data["email"],
                "is_staff": user_data.get("is_staff", False),
                "is_superuser": user_data.get("is_superuser", False),
            },
        )

        if created:
            user.set_password(password)
            user.save()

            # Add to groups
            for group_name in user_data.get("groups", []):
                try:
                    group = Group.objects.get(name=group_name)
                    user.groups.add(group)
                except Group.DoesNotExist:
                    pass

        print(f"  {'Created' if created else 'Exists'}: {username} ({user_data['role']})")
        print(f"    Password: {password}")


def get_or_create_locations():
    """Ensure Kenya locations exist and return sample ones."""
    print("\nChecking Kenya locations...")

    # Check if locations are loaded
    county_count = County.objects.count()
    if county_count < 47:
        print(f"  Warning: Only {county_count} counties found. Run location import first.")
        print("  Creating minimal sample locations...")

        # Create sample Nairobi locations
        nairobi, _ = County.objects.get_or_create(code=47, defaults={"name": "Nairobi"})
        westlands, _ = SubCounty.objects.get_or_create(county=nairobi, name="Westlands")
        Ward.objects.get_or_create(sub_county=westlands, name="Parklands")

        mombasa, _ = County.objects.get_or_create(code=1, defaults={"name": "Mombasa"})
        mvita, _ = SubCounty.objects.get_or_create(county=mombasa, name="Mvita")
        Ward.objects.get_or_create(sub_county=mvita, name="Tononoka")

        kisumu, _ = County.objects.get_or_create(code=42, defaults={"name": "Kisumu"})
        kisumu_central, _ = SubCounty.objects.get_or_create(county=kisumu, name="Kisumu Central")
        Ward.objects.get_or_create(sub_county=kisumu_central, name="Railways")
    else:
        print(f"  Found {county_count} counties")

    # Return sample locations for patient creation
    counties = list(County.objects.all()[:10])
    return counties


def create_sample_patients(counties, count=20):
    """Create sample patients with Kenyan names."""
    print(f"\nCreating {count} sample patients...")

    # Get a user for registered_by
    try:
        registered_by = User.objects.get(username="demo_receptionist")
    except User.DoesNotExist:
        registered_by = User.objects.first()

    patients_created = 0

    for _ in range(count):
        gender = choice(["M", "F"])

        if gender == "M":
            first_name = choice(KENYAN_FIRST_NAMES_MALE)
        else:
            first_name = choice(KENYAN_FIRST_NAMES_FEMALE)

        last_name = choice(KENYAN_SURNAMES)

        # Random date of birth (age 1-80)
        age_days = randint(365, 365 * 80)
        dob = date.today() - timedelta(days=age_days)

        # Random county and sub-county
        county = choice(counties)
        sub_counties = list(county.sub_counties.all()[:5])
        if not sub_counties:
            continue
        sub_county = choice(sub_counties)

        # Create patient
        try:
            patient = Patient.objects.create(
                first_name=first_name,
                last_name=last_name,
                date_of_birth=dob,
                gender=gender,
                county=county,
                sub_county=sub_county,
                phone_number=f"+2547{randint(10000000, 99999999)}",
                registered_by=registered_by,
                referral_source=choice(["self", "clinic", "other_facility"]),
                consent_given=True,
                consent_date=date.today(),
            )
            patients_created += 1
            print(f"  Created: {patient.mrn} - {patient.first_name} {patient.last_name}")
        except Exception as e:
            print(f"  Error creating patient: {e}")

    print(f"  Total patients created: {patients_created}")
    return Patient.objects.all()[:count]


def create_sample_encounters(patients, count_per_patient=2):
    """Create sample encounters for patients."""
    print("\nCreating sample encounters...")

    # Get clinician user
    try:
        clinician = User.objects.get(username="demo_doctor")
    except User.DoesNotExist:
        clinician = User.objects.first()

    encounters_created = 0

    for patient in patients[:10]:  # Create encounters for first 10 patients
        for _ in range(randint(1, count_per_patient)):
            encounter_date = date.today() - timedelta(days=randint(0, 30))

            try:
                encounter = Encounter.objects.create(
                    patient=patient,
                    encounter_type=choice(["OPD", "EMERGENCY", "FOLLOW_UP"]),
                    encounter_date=encounter_date,
                    chief_complaint=choice(CHIEF_COMPLAINTS),
                    clinician=clinician,
                    # Vitals
                    temperature=Decimal(str(round(36.5 + randint(0, 30) / 10, 1))),
                    pulse=randint(60, 100),
                    blood_pressure=f"{randint(100, 140)}/{randint(60, 90)}",
                    respiratory_rate=randint(12, 20),
                    spo2=Decimal(str(randint(95, 100))),
                    weight=Decimal(str(randint(50, 90))),
                    height=Decimal(str(randint(150, 185))),
                )
                encounters_created += 1
                print(f"  Created encounter for {patient.mrn}: {encounter.chief_complaint[:30]}...")
            except Exception as e:
                print(f"  Error creating encounter: {e}")

    print(f"  Total encounters created: {encounters_created}")


def print_demo_credentials():
    """Print demo credentials summary."""
    print("\n" + "=" * 70)
    print("DEMO CREDENTIALS FOR STAKEHOLDER TESTING")
    print("=" * 70)
    print("\nLogin URL: https://vitora-hmis-staging.onrender.com/login")
    print("\n" + "-" * 70)
    print(f"{'Username':<25} {'Password':<25} {'Role':<20}")
    print("-" * 70)

    for user in DEMO_USERS:
        print(f"{user['username']:<25} {user['password']:<25} {user['role']:<20}")

    print("-" * 70)
    print("\nRecommended Demo Workflow:")
    print("1. Receptionist: Register a new patient")
    print("2. Nurse: Conduct triage, record vitals")
    print("3. Doctor: Create encounter, add diagnosis, prescribe medication")
    print("4. Pharmacist: Dispense prescribed medication")
    print("5. Lab Tech: Process lab orders, enter results")
    print("6. Billing: Generate invoice, record payment")
    print("7. Admin: View audit logs, manage users")
    print("=" * 70)


@transaction.atomic
def main():
    """Main function to seed demo data."""
    print("=" * 70)
    print("VITORA HMIS - Demo Data Seeding Script")
    print("=" * 70)

    # Create groups and users
    create_demo_groups()
    create_demo_users()

    # Get/create locations
    counties = get_or_create_locations()

    if counties:
        # Create sample patients
        patients = create_sample_patients(counties, count=20)

        # Create sample encounters
        if patients:
            create_sample_encounters(patients)

    # Print credentials
    print_demo_credentials()

    print("\n✅ Demo data seeding complete!")
    print("Run 'python manage.py runserver' to start the backend")


if __name__ == "__main__":
    main()
