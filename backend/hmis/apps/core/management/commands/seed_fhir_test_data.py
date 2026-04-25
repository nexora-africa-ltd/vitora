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

FHIR_TEST_PATIENT_ID_TYPE = "passport"
FHIR_TEST_PATIENT_ID_NUMBER = "FHIR-TEST-PATIENT-001"


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
        from django.utils import timezone

        from hmis.apps.clinics.models import Clinic, ClinicEnrollment
        from hmis.apps.core.models import (
            County,
            Department,
            Facility,
            Organization,
            Role,
            StaffProfile,
            SubCounty,
            Ward,
        )
        from hmis.apps.encounters.models import (
            Diagnosis,
            Encounter,
            ICD10Code,
            PregnancyObservation,
            SocialHistoryObservation,
        )
        from hmis.apps.imaging.models import DICOMInstance, DICOMSeries, DICOMStudy
        from hmis.apps.immunizations.models import ImmunizationRecord, VaccineDefinition
        from hmis.apps.laboratory.models import (
            DiagnosticReport,
            LabOrder,
            LabOrderItem,
            LabResult,
            Specimen,
            TestCatalog,
        )
        from hmis.apps.mch.models import Delivery, MCHRegistration
        from hmis.apps.patients.models import Allergy, Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem
        from hmis.apps.procedures.models import ProcedureCatalog, ProcedureOrder
        from hmis.apps.theatre.models import OperatingTheatre, SurgeryCase, TheatreConsumable

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

        organization, _ = Organization.objects.get_or_create(
            slug="fhir-test-org",
            defaults={
                "name": "FHIR Test Organization",
                "contact_email": "fhir-org@vitora.local",
                "is_active": True,
                "is_verified": True,
            },
        )
        self.stdout.write(f"  ✓ Organization: {organization.name}")

        facility, _ = Facility.objects.get_or_create(
            organization=organization,
            name="FHIR Test Facility",
            defaults={
                "mfl_code": "99888",
                "level": "3",
                "county": county,
                "sub_county": sub_county,
                "is_active": True,
            },
        )
        self.stdout.write(f"  ✓ Facility: {facility.name}")

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
            code="FHIR-OPD-001",
            defaults={
                "name": "FHIR Test Clinic",
                "clinic_type": "GENERAL_OPD",
                "status": "ACTIVE",
                "facility": facility,
                "organization": organization,
            },
        )
        self.stdout.write(f"  ✓ Clinic (Organization ID={clinic.id}): {clinic.name}")

        anc_clinic, _ = Clinic.objects.get_or_create(
            code="FHIR-ANC-001",
            defaults={
                "name": "FHIR ANC Clinic",
                "clinic_type": "ANC",
                "status": "ACTIVE",
                "facility": facility,
                "organization": organization,
            },
        )
        self.stdout.write(f"  ✓ ANC Clinic (ID={anc_clinic.id}): {anc_clinic.name}")

        # Create department for staff
        department, _ = Department.objects.get_or_create(
            code="GEN-MED",
            facility=facility,
            organization=organization,
            defaults={"name": "General Medicine", "department_type": "CLINICAL"},
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
                "organization": organization,
                "primary_facility": facility,
                "primary_department": department,
                "primary_role": role,
                "date_joined": date.today(),
            },
        )
        self.stdout.write(
            f"  ✓ Practitioner (ID={staff_profile.id}): Dr. {practitioner_user.first_name} {practitioner_user.last_name}"
        )

        # Create test patient
        patient, created = Patient.objects.get_or_create(
            identification_type=FHIR_TEST_PATIENT_ID_TYPE,
            identification_number=FHIR_TEST_PATIENT_ID_NUMBER,
            defaults={
                "first_name": "Jane",
                "last_name": "FHIRTest",
                "date_of_birth": date(1985, 6, 15),
                "gender": "F",
                "county": county,
                "sub_county": sub_county,
                "ward": ward,
                "organization": organization,
                "registered_at_facility": facility,
                "phone_number": "+254712345678",
                "identification_type": FHIR_TEST_PATIENT_ID_TYPE,
                "identification_number": FHIR_TEST_PATIENT_ID_NUMBER,
                "registered_by": test_user,
                "referral_source": "self",
                "consent_given": True,
            },
        )
        if not created:
            patient.first_name = "Jane"
            patient.last_name = "FHIRTest"
            patient.date_of_birth = date(1985, 6, 15)
            patient.gender = "F"
            patient.county = county
            patient.sub_county = sub_county
            patient.ward = ward
            patient.organization = organization
            patient.registered_at_facility = facility
            patient.phone_number = "+254712345678"
            patient.registered_by = test_user
            patient.referral_source = "self"
            patient.consent_given = True
            patient.save()
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
                "organization": organization,
                "facility": facility,
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

        allergy, _ = Allergy.objects.get_or_create(
            patient=patient,
            substance="Penicillin",
            defaults={
                "organization": organization,
                "substance_type": "medication",
                "reaction_type": "rash",
                "reaction_description": "Diffuse rash after penicillin exposure",
                "severity": "moderate",
                "status": "active",
                "verification_status": "confirmed",
                "criticality": "high",
                "notes": "FHIR IPS allergy seed data",
                "recorded_by": test_user,
                "source_encounter": encounter,
            },
        )
        self.stdout.write(f"  ✓ Allergy (ID={allergy.id}): {allergy.substance}")

        test_catalog, _ = TestCatalog.objects.get_or_create(
            code="HB-FHIR",
            defaults={
                "name": "Hemoglobin",
                "short_name": "Hb",
                "loinc_code": "718-7",
                "category": "HEMATOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "NUMERIC",
                "result_unit": "g/dL",
                "normal_range_male": "13.5-17.5",
                "normal_range_female": "12.0-15.5",
                "cost": Decimal("500.00"),
            },
        )
        lab_order, _ = LabOrder.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            ordered_by=test_user,
            defaults={
                "facility": facility,
                "organization": organization,
                "status": "ORDERED",
                "clinical_notes": "FHIR IPS laboratory observation seed data",
                "sample_type": "Blood",
            },
        )
        lab_item, _ = LabOrderItem.objects.get_or_create(
            lab_order=lab_order,
            test=test_catalog,
            defaults={"unit_cost": test_catalog.cost, "status": "COMPLETED"},
        )
        specimen, _ = Specimen.objects.get_or_create(
            barcode="FHIR-SPEC-001",
            defaults={
                "specimen_type": "BLOOD",
                "lab_order": lab_order,
                "collected_by": test_user,
                "collected_at": timezone.now(),
                "status": "COLLECTED",
            },
        )
        specimen.order_items.add(lab_item)
        lab_result, _ = LabResult.objects.get_or_create(
            order_item=lab_item,
            defaults={
                "specimen": specimen,
                "numeric_value": Decimal("13.20"),
                "result_unit": "g/dL",
                "reference_range_text": "12.0-15.5",
                "result_flag": "NORMAL",
                "verification_status": "VERIFIED",
                "verified_by": test_user,
                "verified_at": timezone.now(),
                "entered_by": test_user,
            },
        )
        self.stdout.write(f"  ✓ Lab Result (Observation ID={lab_result.id}): {test_catalog.name}")

        diagnostic_report, _ = DiagnosticReport.objects.get_or_create(
            lab_order=lab_order,
            status="FINAL",
            defaults={
                "issued_by": test_user,
                "issued_at": timezone.now(),
                "conclusion": "Hemoglobin within normal range.",
                "clinical_info": "Seeded report for Inferno.",
            },
        )
        self.stdout.write(
            f"  ✓ Diagnostic Report (ID={diagnostic_report.id}): {diagnostic_report.report_number}"
        )

        vaccine_definition, _ = VaccineDefinition.objects.get_or_create(
            code="TT-FHIR-1",
            defaults={
                "name": "Tetanus Toxoid",
                "disease_target": "Tetanus",
                "target_population": "ADULT",
                "program": "ROUTINE",
                "route": "IM",
            },
        )
        immunization, _ = ImmunizationRecord.objects.get_or_create(
            patient=patient,
            vaccine=vaccine_definition,
            dose_number=1,
            defaults={
                "encounter": encounter,
                "scheduled_date": date.today(),
                "administered_date": date.today(),
                "status": "ADMINISTERED",
                "batch_number": "FHIR-VAX-001",
                "site": "LEFT_ARM",
                "administered_by": test_user,
            },
        )
        self.stdout.write(f"  ✓ Immunization (ID={immunization.id}): {vaccine_definition.name}")

        procedure_catalog, _ = ProcedureCatalog.objects.get_or_create(
            code="PROC-FHIR-001",
            defaults={
                "name": "Wound Debridement",
                "category": "THERAPEUTIC",
                "organization": organization,
                "facility": facility,
            },
        )
        procedure_order, _ = ProcedureOrder.objects.get_or_create(
            procedure=procedure_catalog,
            patient=patient,
            encounter=encounter,
            defaults={
                "indication": "Minor wound care for FHIR seed data",
                "ordered_by": test_user,
                "status": "COMPLETED",
                "scheduled_date": date.today(),
                "organization": organization,
                "facility": facility,
            },
        )
        self.stdout.write(f"  ✓ Procedure (ID={procedure_order.id}): {procedure_catalog.name}")

        medication_drug, _ = Drug.objects.get_or_create(
            code="PARA-FHIR-500",
            defaults={
                "generic_name": "Paracetamol",
                "form": "TABLET",
                "strength": "500mg",
                "unit": "tablet",
                "schedule": "OTC",
                "requires_prescription": False,
            },
        )
        prescription, _ = Prescription.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            prescribed_by=test_user,
            status="DISPENSED",
            defaults={
                "valid_until": date.today() + timedelta(days=30),
                "clinical_notes": "FHIR IPS dispensed medication seed data",
                "facility": facility,
                "organization": organization,
            },
        )
        prescription_item, _ = PrescriptionItem.objects.get_or_create(
            prescription=prescription,
            drug=medication_drug,
            defaults={
                "quantity": 10,
                "dosage": "1 tablet",
                "frequency": "3 times daily",
                "duration": "7 days",
                "route": "Oral",
                "instructions": "Take after meals",
            },
        )
        self.stdout.write(
            f"  ✓ Medication Statement seed (PrescriptionItem ID={prescription_item.id}): {medication_drug.generic_name}"
        )

        implant_drug, _ = Drug.objects.get_or_create(
            code="IMPLANT-FHIR-001",
            defaults={
                "generic_name": "Hip Prosthesis",
                "form": "PATCH",
                "strength": "Standard",
                "unit": "device",
                "schedule": "POM",
                "requires_prescription": True,
            },
        )
        theatre, _ = OperatingTheatre.objects.get_or_create(
            code="FHIR-OT-01",
            defaults={
                "name": "FHIR Operating Theatre",
                "theatre_type": "ORTHO",
                "organization": organization,
                "facility": facility,
            },
        )
        surgical_procedure_catalog, _ = ProcedureCatalog.objects.get_or_create(
            code="SURG-FHIR-001",
            defaults={
                "name": "Hip Arthroplasty",
                "category": "SURGICAL",
                "organization": organization,
                "facility": facility,
            },
        )
        surgery_case, _ = SurgeryCase.objects.get_or_create(
            patient=patient,
            encounter=encounter,
            primary_procedure=surgical_procedure_catalog,
            theatre=theatre,
            scheduled_date=date.today(),
            scheduled_start_time=timezone.now().time().replace(second=0, microsecond=0),
            defaults={
                "estimated_duration_minutes": 120,
                "priority": "ELECTIVE",
                "diagnosis": "Degenerative hip disease",
                "requesting_doctor": test_user,
                "organization": organization,
                "facility": facility,
            },
        )
        implant_consumable, _ = TheatreConsumable.objects.get_or_create(
            surgery_case=surgery_case,
            item=implant_drug,
            is_implant=True,
            defaults={
                "quantity_used": 1,
                "unit_cost": Decimal("125000.00"),
                "added_by": test_user,
                "organization": organization,
                "facility": facility,
                "implant_serial_number": "IMPLANT-FHIR-001",
                "lot_number": "LOT-FHIR-001",
            },
        )
        self.stdout.write(
            f"  ✓ Implant Device (ID={implant_consumable.id}): {implant_drug.generic_name}"
        )

        dicom_study, _ = DICOMStudy.objects.get_or_create(
            study_instance_uid="1.2.840.113619.2.55.3.604688433.5000.1",
            defaults={
                "patient": patient,
                "study_date": date.today(),
                "study_description": "Chest X-Ray",
                "accession_number": "FHIR-RAD-001",
                "modality": "XR",
                "number_of_series": 1,
                "number_of_instances": 1,
                "uploaded_by": test_user,
            },
        )
        dicom_series, _ = DICOMSeries.objects.get_or_create(
            series_instance_uid="1.2.840.113619.2.55.3.604688433.5000.2",
            defaults={
                "study": dicom_study,
                "series_number": 1,
                "series_description": "PA View",
                "modality": "XR",
                "number_of_instances": 1,
            },
        )
        dicom_instance, _ = DICOMInstance.objects.get_or_create(
            sop_instance_uid="1.2.840.113619.2.55.3.604688433.5000.3",
            defaults={
                "series": dicom_series,
                "sop_class_uid": "1.2.840.10008.5.1.4.1.1.1",
                "instance_number": 1,
                "file_path": "dicom/test/chest-xray-fhir-1.dcm",
                "file_size": 2048,
            },
        )
        self.stdout.write(
            f"  ✓ Imaging Study (ID={dicom_study.id}): {dicom_study.study_description}"
        )
        self.stdout.write(f"  ✓ Media (ID={dicom_instance.id}): {dicom_instance.sop_instance_uid}")

        anc_enrollment, _ = ClinicEnrollment.objects.get_or_create(
            clinic=anc_clinic,
            patient=patient,
            enrollment_date=date.today(),
            defaults={
                "enrolled_by": test_user,
                "gravida": 2,
                "para": 1,
                "lmp": date.today() - timedelta(days=140),
                "edd": date.today() + timedelta(days=140),
            },
        )
        mch_registration, _ = MCHRegistration.objects.get_or_create(
            mother=patient,
            anc_enrollment=anc_enrollment,
            registration_date=date.today(),
            defaults={
                "organization": organization,
                "facility": facility,
                "registered_by": test_user,
                "notes": "FHIR pregnancy seed data",
            },
        )
        delivery = Delivery.objects.filter(
            registration=mch_registration, delivery_outcome="LIVE_BIRTH"
        ).first()
        if delivery is None:
            delivery = Delivery.objects.create(
                registration=mch_registration,
                delivery_date=date.today() - timedelta(days=30),
                delivery_type="SVD",
                delivery_outcome="LIVE_BIRTH",
                status="COMPLETED",
                delivered_by=test_user,
                baby_gender="F",
            )

        alcohol_observation = SocialHistoryObservation.objects.filter(
            patient=patient,
            encounter=encounter,
            observation_type="ALCOHOL_USE",
        ).first()
        if alcohol_observation is None:
            alcohol_observation = SocialHistoryObservation.objects.create(
                patient=patient,
                encounter=encounter,
                observation_type="ALCOHOL_USE",
                status="CURRENT",
                value_text="Occasional alcohol use on weekends",
                recorded_by=test_user,
                effective_date=encounter.encounter_date,
            )

        tobacco_observation = SocialHistoryObservation.objects.filter(
            patient=patient,
            encounter=encounter,
            observation_type="TOBACCO_USE",
        ).first()
        if tobacco_observation is None:
            tobacco_observation = SocialHistoryObservation.objects.create(
                patient=patient,
                encounter=encounter,
                observation_type="TOBACCO_USE",
                status="FORMER",
                value_text="Former smoker, stopped 2 years ago",
                recorded_by=test_user,
                effective_date=encounter.encounter_date,
            )

        pregnancy_status = PregnancyObservation.objects.filter(
            patient=patient,
            encounter=encounter,
            observation_type="PREGNANCY_STATUS",
        ).first()
        if pregnancy_status is None:
            pregnancy_status = PregnancyObservation.objects.create(
                patient=patient,
                encounter=encounter,
                mch_registration=mch_registration,
                observation_type="PREGNANCY_STATUS",
                status_value="PREGNANT",
                recorded_by=test_user,
                effective_date=encounter.encounter_date,
            )

        pregnancy_edd = PregnancyObservation.objects.filter(
            patient=patient,
            encounter=encounter,
            observation_type="PREGNANCY_EXPECTED_DELIVERY_DATE",
        ).first()
        if pregnancy_edd is None:
            pregnancy_edd = PregnancyObservation.objects.create(
                patient=patient,
                encounter=encounter,
                mch_registration=mch_registration,
                observation_type="PREGNANCY_EXPECTED_DELIVERY_DATE",
                value_date=anc_enrollment.edd,
                recorded_by=test_user,
                effective_date=encounter.encounter_date,
            )

        pregnancy_outcome = PregnancyObservation.objects.filter(
            patient=patient,
            encounter=encounter,
            observation_type="PREGNANCY_OUTCOME",
        ).first()
        if pregnancy_outcome is None:
            pregnancy_outcome = PregnancyObservation.objects.create(
                patient=patient,
                encounter=encounter,
                mch_registration=mch_registration,
                delivery=delivery,
                observation_type="PREGNANCY_OUTCOME",
                status_value="LIVE_BIRTH",
                recorded_by=test_user,
                effective_date=delivery.delivery_date,
            )

        self.stdout.write(
            f"  ✓ Social History Observations: alcohol={alcohol_observation.fhir_id}, tobacco={tobacco_observation.fhir_id}"
        )
        self.stdout.write(
            "  ✓ Pregnancy Observations: "
            f"status={pregnancy_status.fhir_id}, edd={pregnancy_edd.fhir_id}, outcome={pregnancy_outcome.fhir_id}"
        )

        # Print summary for Inferno test inputs
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("FHIR Test Data Created Successfully!"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write("")
        self.stdout.write("Use these IDs in Inferno IPS test inputs:")
        self.stdout.write("")
        self.stdout.write("  url:              http://host.docker.internal:9088/fhir")
        self.stdout.write(f"  patient_id:       {patient.id}")
        self.stdout.write(f"  composition_id:   {patient.id}  (same as patient_id)")
        self.stdout.write(f"  practitioner_id:  {staff_profile.id}")
        self.stdout.write(f"  observation_results_laboratory_id:  {lab_result.id}")
        self.stdout.write(f"  observation_alcohol_use_id:         {alcohol_observation.fhir_id}")
        self.stdout.write(f"  observation_tobacco_use_id:         {tobacco_observation.fhir_id}")
        self.stdout.write(f"  observation_pregnancy_status_id:    {pregnancy_status.fhir_id}")
        self.stdout.write(f"  observation_pregnancy_edd_id:       {pregnancy_edd.fhir_id}")
        self.stdout.write(f"  observation_pregnancy_outcome_id:   {pregnancy_outcome.fhir_id}")
        self.stdout.write(f"  immunization_id:                    {immunization.id}")
        self.stdout.write(f"  specimen_id:                        {specimen.id}")
        self.stdout.write(f"  diagnostic_report_id:               {diagnostic_report.id}")
        self.stdout.write(f"  procedure_id:                       {procedure_order.id}")
        self.stdout.write(f"  imaging_study_id:                   {dicom_study.id}")
        self.stdout.write(f"  media_id:                           {dicom_instance.id}")
        self.stdout.write(
            "  observation_results_radiology_id:   (use imaging_study_id/media_id for current support)"
        )
        self.stdout.write(f"  device_id:                          {implant_consumable.id}")
        self.stdout.write(f"  device_use_statement_id:            {implant_consumable.id}")
        self.stdout.write("")
        self.stdout.write("Test the endpoints:")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Patient/{patient.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Patient/{patient.id}/\\$summary")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Practitioner/{staff_profile.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Organization/{clinic.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Condition/{diagnosis1.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Observation/{lab_result.id}")
        self.stdout.write(
            f"  curl http://localhost:9088/fhir/Observation/{alcohol_observation.fhir_id}"
        )
        self.stdout.write(
            f"  curl http://localhost:9088/fhir/Observation/{pregnancy_status.fhir_id}"
        )
        self.stdout.write(f"  curl http://localhost:9088/fhir/Composition/{patient.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Immunization/{immunization.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Specimen/{specimen.id}")
        self.stdout.write(
            f"  curl http://localhost:9088/fhir/DiagnosticReport/{diagnostic_report.id}"
        )
        self.stdout.write(f"  curl http://localhost:9088/fhir/Procedure/{procedure_order.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/ImagingStudy/{dicom_study.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Media/{dicom_instance.id}")
        self.stdout.write(f"  curl http://localhost:9088/fhir/Device/{implant_consumable.id}")
        self.stdout.write(
            f"  curl http://localhost:9088/fhir/DeviceUseStatement/{implant_consumable.id}"
        )
        self.stdout.write("")
