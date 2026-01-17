"""
Django management command to seed demo data for staging environment.
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed demo data for staging/demo environment"

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
        from django.contrib.auth.models import Group, Permission
        from django.db import transaction

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        User = get_user_model()

        # Demo user credentials
        DEMO_USERS = [
            {
                "username": "demo_admin",
                "email": "admin@demo.vitora.health",
                "password": "DemoAdmin2026!",
                "first_name": "Admin",
                "last_name": "User",
                "is_staff": True,
                "is_superuser": True,
                "groups": [],
            },
            {
                "username": "demo_receptionist",
                "email": "reception@demo.vitora.health",
                "password": "DemoReception2026!",
                "first_name": "Mary",
                "last_name": "Wanjiku",
                "is_staff": False,
                "is_superuser": False,
                "groups": ["Receptionist"],
            },
            {
                "username": "demo_nurse",
                "email": "nurse@demo.vitora.health",
                "password": "DemoNurse2026!",
                "first_name": "Grace",
                "last_name": "Akinyi",
                "is_staff": False,
                "is_superuser": False,
                "groups": ["Nurse"],
            },
            {
                "username": "demo_doctor",
                "email": "doctor@demo.vitora.health",
                "password": "DemoDoctor2026!",
                "first_name": "Dr. James",
                "last_name": "Ochieng",
                "is_staff": False,
                "is_superuser": False,
                "groups": ["Doctor"],
            },
            {
                "username": "demo_pharmacist",
                "email": "pharmacy@demo.vitora.health",
                "password": "DemoPharmacy2026!",
                "first_name": "Peter",
                "last_name": "Mwangi",
                "is_staff": False,
                "is_superuser": False,
                "groups": ["Pharmacist"],
            },
            {
                "username": "demo_labtech",
                "email": "lab@demo.vitora.health",
                "password": "DemoLab2026!",
                "first_name": "Susan",
                "last_name": "Njeri",
                "is_staff": False,
                "is_superuser": False,
                "groups": ["Lab Technician"],
            },
            {
                "username": "demo_billing",
                "email": "billing@demo.vitora.health",
                "password": "DemoBilling2026!",
                "first_name": "John",
                "last_name": "Kamau",
                "is_staff": False,
                "is_superuser": False,
                "groups": ["Billing Clerk"],
            },
        ]

        # Kenyan names for sample patients
        KENYAN_FIRST_NAMES_MALE = [
            "James", "John", "Peter", "Paul", "David", "Joseph", "Michael",
            "Daniel", "Samuel", "Stephen", "Francis", "George", "Robert",
            "Patrick", "William", "Charles", "Thomas", "Christopher", "Brian",
            "Kevin", "Emmanuel", "Moses", "Isaac", "Abraham", "Joshua",
        ]

        KENYAN_FIRST_NAMES_FEMALE = [
            "Mary", "Jane", "Grace", "Faith", "Hope", "Joy", "Mercy",
            "Elizabeth", "Sarah", "Ruth", "Esther", "Rebecca", "Rachel",
            "Naomi", "Hannah", "Deborah", "Lydia", "Miriam", "Priscilla",
            "Lucy", "Ann", "Catherine", "Margaret", "Susan", "Agnes",
        ]

        KENYAN_SURNAMES = [
            "Ochieng", "Wanjiku", "Mwangi", "Kamau", "Njoroge", "Kipchoge",
            "Akinyi", "Otieno", "Njeri", "Wambui", "Mutua", "Kibet",
            "Chebet", "Korir", "Sang", "Rono", "Kimutai", "Yego",
            "Kiptoo", "Kipruto", "Chepkoech", "Jepchirchir", "Kiplagat",
            "Kigen", "Rotich", "Kemboi", "Tanui", "Koros", "Chepkurui",
        ]

        # Check if demo users already exist
        existing_demo_user = User.objects.filter(username="demo_admin").first()
        if existing_demo_user and not options["force"]:
            self.stdout.write(
                self.style.WARNING(
                    "Demo users already exist. Use --force to recreate."
                )
            )
            return

        self.stdout.write("Starting demo data seeding...")

        with transaction.atomic():
            # Create demo users
            self.stdout.write("Creating demo users...")
            for user_data in DEMO_USERS:
                groups = user_data.pop("groups")
                password = user_data.pop("password")

                user, created = User.objects.update_or_create(
                    username=user_data["username"],
                    defaults=user_data,
                )
                user.set_password(password)
                user.save()

                # Add to groups
                for group_name in groups:
                    group, _ = Group.objects.get_or_create(name=group_name)
                    user.groups.add(group)

                status = "Created" if created else "Updated"
                self.stdout.write(f"  {status} user: {user.username}")

            # Create sample patients
            self.stdout.write("\nCreating sample patients...")
            counties = list(County.objects.all()[:5])
            if not counties:
                self.stdout.write(
                    self.style.WARNING(
                        "No counties found. Run import_kenya_locations first."
                    )
                )
            else:
                registered_by = User.objects.get(username="demo_receptionist")

                for i in range(20):
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
                        self.stdout.write(f"  Created patient: {patient.mrn}")

        self.stdout.write(
            self.style.SUCCESS("\n✅ Demo data seeding completed successfully!")
        )
        self.stdout.write("\nDemo credentials:")
        self.stdout.write("-" * 50)
        for user_data in DEMO_USERS:
            self.stdout.write(f"  {user_data['username']}")
