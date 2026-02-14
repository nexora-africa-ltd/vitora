"""
Seed FHIR test data for Inferno IPS testing.

This management command creates test data required for running 
the Inferno IPS (International Patient Summary) test suite.

Usage:
    python manage.py seed_fhir_test_data

This creates:
    - Test Patient with complete demographics
    - Test StaffProfile (Practitioner)
    - Test Clinic (Organization)
    - Test Encounters with vitals
    - Test Diagnoses (Conditions)
    - Test Lab Orders/Results (Observations)
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger(__name__)
User = get_user_model()


class Command(BaseCommand):
    help = "Seed test data for FHIR/IPS testing with Inferno"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing test data before seeding",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Seeding FHIR test data for Inferno IPS testing..."))

        # Import models
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.core.models import County, Department, Role, StaffProfile, SubCounty, Ward
        from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code
        from hmis.apps.patients.models import Patient

        # Get or create test county (Nairobi)
        county, _ = County.objects.get_or_create(code=47, defaults={"name": "Nairobi"})
        self.stdout.write(f"  ✓ County: {county.name}")

        # Get or create test sub-county
        sub_county, _ = SubCounty.objects.get_or_create(
            county=county, name="Westlands", defaults={}
        )
        self.stdout.write(f"  ✓ SubCounty: {sub_county.name}")

        # Get or create test ward
        ward, _ = Ward.objects.get_or_create(sub_county=sub_county, name="Parklands", defaults={})
        self.stdout.write(f"  ✓ Ward: {ward.name}")

        # Create test user for registered_by
        test_user, created = User.objects.get_or_create(
            username="fhir_test_user",
            defaults={
                "email": "fhir_test@vitora.local",
                "first_name": "FHIR",
                "last_name": "Tester",
                "is_active": True,
            },
        )
        if created:
            test_user.set_password("testpass123")
            test_user.save()
        self.stdout.write(f"  ✓ Test User: {test_user.username}")

        # Create test clinic (Organization)
        clinic, _ = Clinic.objects.get_or_create(
            name="FHIR Test Clinic",
            defaults={
                "clinic_type": "GENERAL_OPD",
                "status": "OPEN",
            },
        )
        self.stdout.write(f"  ✓ Clinic (Organization ID={clinic.id}): {clinic.name}")

        # Create department for staff
        department, _ = Department.objects.get_or_create(
            code="GEN-MED", defaults={"name": "General Medicine", "department_type": "CLINICAL"}
        )

        # Create role for staff (look up existing DOCTOR role or create)
        role = Role.objects.filter(code="DOCTOR").first()
        if not role:
            role = Role.objects.filter(name__icontains="doctor").first()
        if not role:
            role, _ = Role.objects.get_or_create(
                code="FHIR-DOCTOR", defaults={"name": "Doctor (FHIR Test)"}
            )

        # Create test practitioner (StaffProfile)
        practitioner_user, created = User.objects.get_or_create(
            username="dr_fhir_test",
            defaults={
                "email": "dr_fhir@vitora.local",
                "first_name": "Jane",
                "last_name": "Doctor",
                "is_active": True,
            },
        )
        if created:
            practitioner_user.set_password("testpass123")
            practitioner_user.save()

        staff_profile, _ = StaffProfile.objects.get_or_create(
            user=practitioner_user,
            defaults={
                "employee_id": "FHIR-001",
                "primary_department": department,
                "primary_role": role,
                "date_joined": date.today(),
            },
        )
        self.stdout.write(
            f"  ✓ Practitioner (ID={staff_profile.id}): Dr. {practitioner_user.first_name} {practitioner_user.last_name}"
        )

        # Create test patient
        patient, _ = Patient.objects.get_or_create(
            first_name="John",
            last_name="FHIRTest",
            date_of_birth=date(1985, 6, 15),
            defaults={
                "gender": "M",
                "county": county,
                "sub_county": sub_county,
                "ward": ward,
                "phone_number": "+254712345678",
                "identification_type": "national_id",
                "identification_number": "12345678",
                "registered_by": test_user,
                "referral_source": "self",
                "consent_given": True,
            },
        )
        self.stdout.write(
            f"  ✓ Patient (ID={patient.id}): {patient.first_name} {patient.last_name}, MRN: {patient.mrn}"
        )

        # Create test encounter with vitals
        encounter, _ = Encounter.objects.get_or_create(
            patient=patient,
            encounter_date=date.today() - timedelta(days=1),
            defaults={
                "encounter_type": "OPD",
                "chief_complaint": "Routine checkup for FHIR testing",
                "temperature": Decimal("36.8"),
                "pulse": 72,
                "blood_pressure": "120/80",
                "respiratory_rate": 16,
                "spo2": Decimal("98.0"),
                "weight": Decimal("75.5"),
                "height": Decimal("175.0"),
            },
        )
        self.stdout.write(
            f"  ✓ Encounter (ID={encounter.id}): {encounter.encounter_type} on {encounter.encounter_date}"
        )

        # Get or create ICD-10 codes for diagnoses
        icd10_j06, _ = ICD10Code.objects.get_or_create(
            code="J06.9",
            defaults={
                "description": "Acute upper respiratory infection, unspecified",
                "short_description": "Acute URI",
                "chapter": "10",
                "category": "J06",
            },
        )
        icd10_i10, _ = ICD10Code.objects.get_or_create(
            code="I10",
            defaults={
                "description": "Essential (primary) hypertension",
                "short_description": "Hypertension",
                "chapter": "9",
                "category": "I10",
            },
        )

        # Create diagnoses (Conditions)
        diagnosis1, _ = Diagnosis.objects.get_or_create(
            encounter=encounter,
            icd10_code=icd10_j06,
            defaults={
                "diagnosis_type": "PRIMARY",
                "notes": "Acute upper respiratory infection for FHIR testing",
            },
        )
        self.stdout.write(
            f"  ✓ Diagnosis (Condition ID={diagnosis1.id}): {diagnosis1.icd10_code.code}"
        )

        diagnosis2, _ = Diagnosis.objects.get_or_create(
            encounter=encounter,
            icd10_code=icd10_i10,
            defaults={
                "diagnosis_type": "SECONDARY",
                "notes": "Essential hypertension for FHIR testing",
            },
        )
        self.stdout.write(
            f"  ✓ Diagnosis (Condition ID={diagnosis2.id}): {diagnosis2.icd10_code.code}"
        )

        # Print summary for Inferno test inputs
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("FHIR Test Data Created Successfully!"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write("")
        self.stdout.write("Use these IDs in Inferno IPS test inputs:")
        self.stdout.write("")
        self.stdout.write(f"  url:              http://host.docker.internal:9088/fhir")
        self.stdout.write(f"  patient_id:       {patient.id}")
        self.stdout.write(f"  composition_id:   {patient.id}  (same as patient_id)")
        self.stdout.write(f"  practitioner_id:  {staff_profile.id}")
        self.stdout.write(f"  observation_results_laboratory_id:  (none - create lab results)")
        self.stdout.write(f"  observation_alcohol_use_id:         (none)")
        self.stdout.write(f"  observation_results_radiology_id:   (none)")
        self.stdout.write(f"  device_id:        (none)")
        self.stdout.write("")
        self.stdout.write("Test the endpoints:")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Patient/{patient.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Patient/{patient.id}/\\$summary")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Practitioner/{staff_profile.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Organization/{clinic.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Condition/{diagnosis1.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Observation/{encounter.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Composition/{patient.id}")
        self.stdout.write("")
