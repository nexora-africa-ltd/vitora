"""
Tests for FHIR IPS (International Patient Summary) Bundle generation.

Tests the FHIRPatientSummaryView which generates IPS Bundles containing:
- Patient resource
- Composition (document structure)
- Condition resources (diagnoses)
- AllergyIntolerance resources
- MedicationStatement resources (from prescriptions)
- CarePlan resources (from treatment plans)

Test coverage:
1. IPS Bundle structure and required sections
2. MedicationStatement from PrescriptionItem
3. CarePlan from TreatmentPlan
4. Empty sections (no data) handling
5. Multiple resources per section
6. Individual resource endpoints
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.urls import reverse
from rest_framework import status


@pytest.fixture
def sample_drug(db):
    """Create a sample drug for prescription tests."""
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="PARA500",
        generic_name="Paracetamol",
        form="TABLET",
        strength="500mg",
        unit="tablet",
        schedule="OTC",
        requires_prescription=False,
        keml_code="03.01.01.001",
    )


@pytest.fixture
def sample_specimen(sample_lab_order, test_user):
    """Create a sample specimen for FHIR tests."""
    from django.utils import timezone

    from hmis.apps.laboratory.models import Specimen

    specimen = Specimen.objects.create(
        barcode="FHIR-SPEC-001",
        specimen_type="BLOOD",
        lab_order=sample_lab_order,
        collected_by=test_user,
        collected_at=timezone.now(),
        status="COLLECTED",
    )
    specimen.order_items.add(*sample_lab_order.items.all())
    return specimen


@pytest.fixture
def sample_diagnostic_report(sample_lab_order, test_user):
    """Create a sample diagnostic report for FHIR tests."""
    from hmis.apps.laboratory.models import DiagnosticReport

    return DiagnosticReport.objects.create(
        lab_order=sample_lab_order,
        issued_by=test_user,
        status="FINAL",
        conclusion="Routine chemistry panel within normal limits.",
    )


@pytest.fixture
def anc_clinic(sample_facility, sample_organization):
    """Create an ANC clinic for pregnancy-related FHIR tests."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="FHIR ANC Clinic",
        clinic_type="ANC",
        code="FHIR-ANC-001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sample_anc_enrollment(
    anc_clinic,
    sample_patient,
    test_user,
):
    """Create an ANC enrollment with EDD data for FHIR tests."""
    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today(),
        enrolled_by=test_user,
        gravida=2,
        para=1,
        lmp=date.today() - timedelta(days=140),
    )


@pytest.fixture
def sample_mch_registration(sample_patient, sample_anc_enrollment):
    """Create an MCH registration for pregnancy-related FHIR tests."""
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=sample_anc_enrollment,
        registration_date=date.today(),
    )


@pytest.fixture
def sample_delivery(sample_mch_registration, test_user):
    """Create a completed delivery for pregnancy-outcome FHIR tests."""
    from hmis.apps.mch.models import Delivery

    return Delivery.objects.create(
        registration=sample_mch_registration,
        delivery_date=date.today() - timedelta(days=30),
        delivery_type="SVD",
        delivery_outcome="LIVE_BIRTH",
        status="COMPLETED",
        delivered_by=test_user,
        baby_gender="F",
    )


@pytest.fixture
def sample_social_history_observation(sample_patient, sample_encounter, test_user):
    """Create a dedicated social-history observation for FHIR tests."""
    from hmis.apps.encounters.models import SocialHistoryObservation

    return SocialHistoryObservation.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        observation_type="ALCOHOL_USE",
        status="CURRENT",
        value_text="Occasional alcohol use on weekends",
        recorded_by=test_user,
        effective_date=sample_encounter.encounter_date,
    )


@pytest.fixture
def sample_tobacco_history_observation(sample_patient, sample_encounter, test_user):
    """Create a tobacco-use social-history observation for FHIR tests."""
    from hmis.apps.encounters.models import SocialHistoryObservation

    return SocialHistoryObservation.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        observation_type="TOBACCO_USE",
        status="FORMER",
        value_text="Former smoker, stopped 2 years ago",
        recorded_by=test_user,
        effective_date=sample_encounter.encounter_date,
    )


@pytest.fixture
def sample_pregnancy_status_observation(
    sample_patient,
    sample_encounter,
    sample_mch_registration,
    test_user,
):
    """Create a pregnancy-status observation for FHIR tests."""
    from hmis.apps.encounters.models import PregnancyObservation

    return PregnancyObservation.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        mch_registration=sample_mch_registration,
        observation_type="PREGNANCY_STATUS",
        status_value="PREGNANT",
        recorded_by=test_user,
        effective_date=sample_encounter.encounter_date,
    )


@pytest.fixture
def sample_pregnancy_edd_observation(
    sample_patient,
    sample_encounter,
    sample_mch_registration,
    test_user,
):
    """Create a pregnancy EDD observation for FHIR tests."""
    from hmis.apps.encounters.models import PregnancyObservation

    return PregnancyObservation.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        mch_registration=sample_mch_registration,
        observation_type="PREGNANCY_EXPECTED_DELIVERY_DATE",
        value_date=sample_mch_registration.edd,
        recorded_by=test_user,
        effective_date=sample_encounter.encounter_date,
    )


@pytest.fixture
def sample_pregnancy_outcome_observation(
    sample_patient,
    sample_encounter,
    sample_mch_registration,
    sample_delivery,
    test_user,
):
    """Create a pregnancy outcome observation for FHIR tests."""
    from hmis.apps.encounters.models import PregnancyObservation

    return PregnancyObservation.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        mch_registration=sample_mch_registration,
        delivery=sample_delivery,
        observation_type="PREGNANCY_OUTCOME",
        status_value="LIVE_BIRTH",
        recorded_by=test_user,
        effective_date=sample_delivery.delivery_date,
    )


@pytest.fixture
def sample_vaccine_definition(db):
    """Create a vaccine definition for FHIR tests."""
    from hmis.apps.immunizations.models import VaccineDefinition

    return VaccineDefinition.objects.create(
        code="BCG-FHIR",
        name="BCG Vaccine",
        disease_target="Tuberculosis",
    )


@pytest.fixture
def sample_immunization_record(
    sample_patient,
    sample_encounter,
    test_user,
    sample_vaccine_definition,
    sample_organization,
    sample_facility,
):
    """Create an immunization record for FHIR tests."""
    from hmis.apps.immunizations.models import ImmunizationRecord

    return ImmunizationRecord.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        vaccine=sample_vaccine_definition,
        scheduled_date=date.today(),
        administered_date=date.today(),
        status="ADMINISTERED",
        dose_number=1,
        batch_number="BATCH-001",
        site="LEFT_ARM",
        administered_by=test_user,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_procedure_catalog(sample_organization, sample_facility):
    """Create a procedure catalog entry for FHIR tests."""
    from hmis.apps.procedures.models import ProcedureCatalog

    return ProcedureCatalog.objects.create(
        code="PROC-FHIR-001",
        name="Wound Debridement",
        category="THERAPEUTIC",
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_procedure_order(
    sample_patient,
    sample_encounter,
    test_user,
    sample_procedure_catalog,
    sample_organization,
    sample_facility,
):
    """Create a procedure order for FHIR tests."""
    from hmis.apps.procedures.models import ProcedureOrder

    return ProcedureOrder.objects.create(
        procedure=sample_procedure_catalog,
        patient=sample_patient,
        encounter=sample_encounter,
        indication="Debride infected wound",
        ordered_by=test_user,
        status="COMPLETED",
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_surgical_procedure_catalog(sample_organization, sample_facility):
    """Create a surgical procedure catalog entry for device-backed FHIR tests."""
    from hmis.apps.procedures.models import ProcedureCatalog

    return ProcedureCatalog.objects.create(
        code="SURG-FHIR-001",
        name="Hip Arthroplasty",
        category="SURGICAL",
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_theatre(sample_organization, sample_facility):
    """Create an operating theatre for device-backed FHIR tests."""
    from hmis.apps.theatre.models import OperatingTheatre

    return OperatingTheatre.objects.create(
        code="FHIR-OT-01",
        name="FHIR Operating Theatre",
        theatre_type="ORTHO",
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_implant_consumable(
    sample_patient,
    sample_encounter,
    test_user,
    sample_organization,
    sample_facility,
    sample_theatre,
    sample_surgical_procedure_catalog,
    sample_drug,
):
    """Create an implant-backed theatre consumable for Device FHIR tests."""
    from datetime import time

    from hmis.apps.theatre.models import SurgeryCase, TheatreConsumable

    surgery_case = SurgeryCase.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        primary_procedure=sample_surgical_procedure_catalog,
        theatre=sample_theatre,
        scheduled_date=date.today(),
        scheduled_start_time=time(9, 0),
        estimated_duration_minutes=120,
        priority="ELECTIVE",
        diagnosis="End-stage osteoarthritis of hip",
        requesting_doctor=test_user,
        organization=sample_organization,
        facility=sample_facility,
    )

    return TheatreConsumable.objects.create(
        surgery_case=surgery_case,
        item=sample_drug,
        quantity_used=1,
        unit_cost="125000.00",
        added_by=test_user,
        organization=sample_organization,
        facility=sample_facility,
        is_implant=True,
        implant_serial_number="IMPLANT-FHIR-001",
        lot_number="LOT-FHIR-001",
    )


@pytest.fixture
def sample_dicom_study(sample_patient, test_user):
    """Create a DICOM study for FHIR tests."""
    from hmis.apps.imaging.models import DICOMStudy

    return DICOMStudy.objects.create(
        study_instance_uid="1.2.840.113619.2.55.3.604688433.1234.1",
        patient=sample_patient,
        study_date=date.today(),
        study_description="Chest X-Ray",
        accession_number="ACC-FHIR-001",
        modality="XR",
        number_of_series=1,
        number_of_instances=1,
        uploaded_by=test_user,
    )


@pytest.fixture
def sample_dicom_series(sample_dicom_study):
    """Create a DICOM series for FHIR tests."""
    from hmis.apps.imaging.models import DICOMSeries

    return DICOMSeries.objects.create(
        study=sample_dicom_study,
        series_instance_uid="1.2.840.113619.2.55.3.604688433.1234.2",
        series_number=1,
        series_description="PA View",
        modality="XR",
        number_of_instances=1,
    )


@pytest.fixture
def sample_dicom_instance(sample_dicom_series):
    """Create a DICOM instance for FHIR tests."""
    from hmis.apps.imaging.models import DICOMInstance

    return DICOMInstance.objects.create(
        series=sample_dicom_series,
        sop_instance_uid="1.2.840.113619.2.55.3.604688433.1234.3",
        sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
        instance_number=1,
        file_path="dicom/test/chest-xray-1.dcm",
        file_size=2048,
    )


@pytest.fixture
def sample_drug_2(db):
    """Create a second sample drug for multiple medication tests."""
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="AMOX500",
        generic_name="Amoxicillin",
        form="CAPSULE",
        strength="500mg",
        unit="capsule",
        schedule="POM",
        requires_prescription=True,
    )


@pytest.fixture
def sample_prescription_with_items(
    db,
    sample_patient,
    sample_encounter,
    test_user,
    sample_drug,
    sample_facility,
    sample_organization,
):
    """Create a prescription with items for IPS testing."""
    from hmis.apps.pharmacy.models import Prescription, PrescriptionItem

    prescription = Prescription.objects.create(
        encounter=sample_encounter,
        patient=sample_patient,
        prescribed_by=test_user,
        valid_until=date.today() + timedelta(days=30),
        status="PENDING",
        clinical_notes="For fever and pain management",
        facility=sample_facility,
        organization=sample_organization,
    )

    PrescriptionItem.objects.create(
        prescription=prescription,
        drug=sample_drug,
        quantity=10,
        dosage="1 tablet",
        frequency="3 times daily",
        duration="7 days",
        route="Oral",
        instructions="Take after meals",
    )

    return prescription


@pytest.fixture
def sample_prescription_multiple_items(
    db,
    sample_patient,
    sample_encounter,
    test_user,
    sample_drug,
    sample_drug_2,
    sample_facility,
    sample_organization,
):
    """Create a prescription with multiple items."""
    from hmis.apps.pharmacy.models import Prescription, PrescriptionItem

    prescription = Prescription.objects.create(
        encounter=sample_encounter,
        patient=sample_patient,
        prescribed_by=test_user,
        valid_until=date.today() + timedelta(days=30),
        status="PENDING",
        facility=sample_facility,
        organization=sample_organization,
    )

    PrescriptionItem.objects.create(
        prescription=prescription,
        drug=sample_drug,
        quantity=20,
        dosage="2 tablets",
        frequency="twice daily",
        duration="5 days",
        route="Oral",
    )

    PrescriptionItem.objects.create(
        prescription=prescription,
        drug=sample_drug_2,
        quantity=21,
        dosage="1 capsule",
        frequency="3 times daily",
        duration="7 days",
        route="Oral",
        instructions="Complete the full course",
    )

    return prescription


@pytest.fixture
def sample_treatment_plan_full(db, sample_encounter, test_user):
    """Create a treatment plan with all fields populated."""
    from hmis.apps.encounters.models import TreatmentPlan

    return TreatmentPlan.objects.create(
        encounter=sample_encounter,
        clinical_notes="Patient presents with acute upper respiratory infection.",
        follow_up_instructions="Return if symptoms worsen or fever persists > 3 days.",
        follow_up_date=date.today() + timedelta(days=7),
        diet_recommendations="Increase fluid intake, avoid cold foods",
        activity_restrictions="Bed rest for 2 days",
        referral_needed=True,
        referral_specialty="ENT",
        referral_notes="Recurrent tonsillitis, consider tonsillectomy evaluation",
        status="ACTIVE",
        created_by=test_user,
    )


@pytest.fixture
def sample_allergy_active(db, sample_patient, test_user, sample_organization):
    """Create an active allergy for IPS testing."""
    from hmis.apps.patients.models import Allergy

    return Allergy.objects.create(
        patient=sample_patient,
        substance="Penicillin",
        substance_type="medication",
        reaction_type="rash",
        severity="moderate",
        status="active",
        notes="Causes skin rash within 24 hours",
        recorded_by=test_user,
        organization=sample_organization,
    )


class TestFHIRIPSBundle:
    """Tests for IPS Bundle generation via FHIRPatientSummaryView."""

    def test_ips_bundle_basic_structure(self, authenticated_client, sample_patient):
        """Test IPS bundle has required structure."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "document"
        assert "meta" in response.data
        assert (
            "http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"
            in response.data["meta"]["profile"]
        )

    def test_ips_bundle_contains_composition(self, authenticated_client, sample_patient):
        """Test IPS bundle contains Composition as first entry."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        entries = response.data["entry"]
        assert len(entries) >= 2  # At least Composition and Patient

        # First entry should be Composition
        composition = entries[0]["resource"]
        assert composition["resourceType"] == "Composition"
        assert "section" in composition

    def test_composition_document_operation_returns_ips_bundle(
        self,
        authenticated_client,
        sample_patient,
    ):
        """Composition/$document should return a document bundle."""
        url = reverse("fhir:composition-document", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "document"
        assert response.data["entry"][0]["resource"]["resourceType"] == "Composition"

    def test_composition_read_accepts_fhir_json_accept_header(
        self,
        authenticated_client,
        sample_patient,
    ):
        """Composition reads should negotiate application/fhir+json."""
        url = reverse("fhir:composition-read", args=[sample_patient.id])
        response = authenticated_client.get(url, HTTP_ACCEPT="application/fhir+json")

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"].startswith("application/fhir+json")

    def test_patient_summary_allows_post_operation_invocation(
        self,
        authenticated_client,
        sample_patient,
    ):
        """Patient/$summary should support POST operation invocation."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.post(
            url,
            data={},
            format="json",
            HTTP_ACCEPT="application/fhir+json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "document"

    def test_ips_bundle_contains_patient(self, authenticated_client, sample_patient):
        """Test IPS bundle contains Patient resource."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        entries = response.data["entry"]

        # Second entry should be Patient
        patient = entries[1]["resource"]
        assert patient["resourceType"] == "Patient"
        assert patient["id"] == str(sample_patient.id)

    def test_ips_bundle_nonexistent_patient(self, authenticated_client):
        """Test IPS bundle returns 404 for non-existent patient."""
        url = reverse("fhir:patient-summary", args=[99999])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data["resourceType"] == "OperationOutcome"

    def test_ips_bundle_allows_unauthenticated_access(self, api_client, sample_patient):
        """IPS summary should be callable without auth for Inferno IPS tests."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"

    def test_composition_read_allows_unauthenticated_access(self, api_client, sample_patient):
        """Composition read should be callable without auth for Inferno IPS tests."""
        url = reverse("fhir:composition-read", args=[sample_patient.id])
        response = api_client.get(url, HTTP_ACCEPT="application/fhir+json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Composition"

    def test_composition_document_allows_unauthenticated_access(self, api_client, sample_patient):
        """Composition/$document should be callable without auth for Inferno IPS tests."""
        url = reverse("fhir:composition-document", args=[sample_patient.id])
        response = api_client.get(url, HTTP_ACCEPT="application/fhir+json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"


class TestFHIRObservation:
    """Tests for FHIR Observation endpoints."""

    def test_lab_result_observation_endpoint(self, authenticated_client, sample_lab_result):
        """Lab results should be exposed as valid FHIR Observation resources."""
        url = reverse("fhir:observation-read", args=[sample_lab_result.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Observation"
        assert response.data["id"] == str(sample_lab_result.id)
        assert response.data["category"][0]["coding"][0]["code"] == "laboratory"
        assert response.data["subject"]["reference"] == (
            f"Patient/{sample_lab_result.order_item.lab_order.patient.id}"
        )
        assert response.data["code"]["text"] == sample_lab_result.order_item.test.name
        assert response.data["valueQuantity"]["value"] == float(sample_lab_result.numeric_value)

    def test_social_history_alcohol_observation_endpoint(
        self,
        authenticated_client,
        sample_social_history_observation,
    ):
        response = authenticated_client.get(
            reverse("fhir:observation-read", args=[sample_social_history_observation.fhir_id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Observation"
        assert response.data["id"] == str(sample_social_history_observation.fhir_id)
        assert response.data["category"][0]["coding"][0]["code"] == "social-history"
        assert response.data["code"]["text"] == "Alcohol use"
        assert response.data["valueCodeableConcept"]["text"] == "Current use"

    def test_social_history_tobacco_observation_endpoint(
        self,
        authenticated_client,
        sample_tobacco_history_observation,
    ):
        response = authenticated_client.get(
            reverse("fhir:observation-read", args=[sample_tobacco_history_observation.fhir_id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Observation"
        assert response.data["id"] == str(sample_tobacco_history_observation.fhir_id)
        assert response.data["code"]["text"] == "Tobacco use"
        assert response.data["valueCodeableConcept"]["text"] == "Former use"

    def test_pregnancy_status_observation_endpoint(
        self,
        authenticated_client,
        sample_pregnancy_status_observation,
    ):
        response = authenticated_client.get(
            reverse("fhir:observation-read", args=[sample_pregnancy_status_observation.fhir_id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Observation"
        assert response.data["id"] == str(sample_pregnancy_status_observation.fhir_id)
        assert response.data["code"]["text"] == "Pregnancy status"
        assert response.data["valueCodeableConcept"]["text"] == "Pregnant"

    def test_pregnancy_edd_observation_endpoint(
        self,
        authenticated_client,
        sample_pregnancy_edd_observation,
    ):
        response = authenticated_client.get(
            reverse("fhir:observation-read", args=[sample_pregnancy_edd_observation.fhir_id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Observation"
        assert response.data["id"] == str(sample_pregnancy_edd_observation.fhir_id)
        assert response.data["code"]["text"] == "Estimated delivery date"
        assert response.data["valueDateTime"].startswith(
            sample_pregnancy_edd_observation.value_date.isoformat()
        )

    def test_pregnancy_outcome_observation_endpoint(
        self,
        authenticated_client,
        sample_pregnancy_outcome_observation,
    ):
        response = authenticated_client.get(
            reverse("fhir:observation-read", args=[sample_pregnancy_outcome_observation.fhir_id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Observation"
        assert response.data["id"] == str(sample_pregnancy_outcome_observation.fhir_id)
        assert response.data["code"]["text"] == "Pregnancy outcome"
        assert response.data["valueCodeableConcept"]["text"] == "Live birth"


class TestFHIRAdditionalResources:
    """Tests for additional FHIR resources needed by Inferno input fields."""

    def test_practitioner_role_endpoint(self, authenticated_client, test_staff_profile):
        response = authenticated_client.get(
            reverse("fhir:practitioner-role-read", args=[test_staff_profile.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "PractitionerRole"
        assert response.data["id"] == str(test_staff_profile.id)

    def test_medication_endpoint(self, authenticated_client, sample_drug):
        response = authenticated_client.get(reverse("fhir:medication-read", args=[sample_drug.id]))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Medication"
        assert response.data["id"] == str(sample_drug.id)

    def test_specimen_endpoint(self, authenticated_client, sample_specimen):
        response = authenticated_client.get(
            reverse("fhir:specimen-read", args=[sample_specimen.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Specimen"
        assert response.data["id"] == str(sample_specimen.id)

    def test_diagnostic_report_endpoint(
        self,
        authenticated_client,
        sample_lab_result,
        sample_specimen,
        sample_diagnostic_report,
    ):
        sample_lab_result.specimen = sample_specimen
        sample_lab_result.save(update_fields=["specimen"])

        response = authenticated_client.get(
            reverse("fhir:diagnostic-report-read", args=[sample_diagnostic_report.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "DiagnosticReport"
        assert response.data["id"] == str(sample_diagnostic_report.id)

    def test_immunization_endpoint(self, authenticated_client, sample_immunization_record):
        response = authenticated_client.get(
            reverse("fhir:immunization-read", args=[sample_immunization_record.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Immunization"
        assert response.data["id"] == str(sample_immunization_record.id)

    def test_procedure_endpoint(self, authenticated_client, sample_procedure_order):
        response = authenticated_client.get(
            reverse("fhir:procedure-read", args=[sample_procedure_order.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Procedure"
        assert response.data["id"] == str(sample_procedure_order.id)

    def test_imaging_study_endpoint(self, authenticated_client, sample_dicom_study):
        response = authenticated_client.get(
            reverse("fhir:imaging-study-read", args=[sample_dicom_study.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "ImagingStudy"
        assert response.data["id"] == str(sample_dicom_study.id)

    def test_media_endpoint(self, authenticated_client, sample_dicom_instance):
        response = authenticated_client.get(
            reverse("fhir:media-read", args=[sample_dicom_instance.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Media"
        assert response.data["id"] == str(sample_dicom_instance.id)

    def test_device_endpoint(self, authenticated_client, sample_implant_consumable):
        response = authenticated_client.get(
            reverse("fhir:device-read", args=[sample_implant_consumable.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Device"
        assert response.data["id"] == str(sample_implant_consumable.id)
        assert response.data["serialNumber"] == sample_implant_consumable.implant_serial_number

    def test_device_use_statement_endpoint(self, authenticated_client, sample_implant_consumable):
        response = authenticated_client.get(
            reverse("fhir:device-use-statement-read", args=[sample_implant_consumable.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "DeviceUseStatement"
        assert response.data["id"] == str(sample_implant_consumable.id)
        assert response.data["device"]["reference"] == f"Device/{sample_implant_consumable.id}"


class TestFHIRIPSMedicationStatement:
    """Tests for MedicationStatement in IPS Bundle."""

    def test_ips_includes_medication_statement(
        self, authenticated_client, sample_patient, sample_prescription_with_items
    ):
        """Test IPS bundle includes MedicationStatement from prescriptions."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

        # Find MedicationStatement entries
        med_statements = [
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "MedicationStatement"
        ]

        assert len(med_statements) >= 1
        med = med_statements[0]
        assert med["status"] == "intended"
        assert "medicationCodeableConcept" in med
        assert "Paracetamol" in med["medicationCodeableConcept"]["text"]

    def test_medication_statement_includes_dosage(
        self, authenticated_client, sample_patient, sample_prescription_with_items
    ):
        """Test MedicationStatement includes dosage instructions."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        med_statements = [
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "MedicationStatement"
        ]

        assert len(med_statements) >= 1
        med = med_statements[0]
        assert "dosage" in med
        assert len(med["dosage"]) > 0
        assert "1 tablet" in med["dosage"][0]["text"]
        assert "route" in med["dosage"][0]

    def test_medication_statement_has_ips_profile_narrative(
        self, authenticated_client, sample_patient, sample_prescription_with_items
    ):
        """MedicationStatement should include IPS profile and generated narrative."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        med_statement = next(
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "MedicationStatement"
        )

        assert med_statement["meta"]["profile"] == [
            "http://hl7.org/fhir/uv/ips/StructureDefinition/MedicationStatement-uv-ips"
        ]
        assert med_statement["text"]["status"] == "generated"
        assert "MedicationStatement" in med_statement["text"]["div"]

    def test_multiple_medications_in_ips(
        self, authenticated_client, sample_patient, sample_prescription_multiple_items
    ):
        """Test IPS bundle includes multiple MedicationStatements."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        med_statements = [
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "MedicationStatement"
        ]

        assert len(med_statements) == 2

        # Check medications are different
        med_names = [m["medicationCodeableConcept"]["text"] for m in med_statements]
        assert any("Paracetamol" in name for name in med_names)
        assert any("Amoxicillin" in name for name in med_names)

    def test_medication_statement_individual_endpoint(
        self, authenticated_client, sample_prescription_with_items
    ):
        """Test individual MedicationStatement endpoint works."""
        item = sample_prescription_with_items.items.first()
        url = reverse("fhir:medication-statement-read", args=[item.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "MedicationStatement"
        assert response.data["id"] == str(item.id)

    def test_composition_medication_section_populated(
        self, authenticated_client, sample_patient, sample_prescription_with_items
    ):
        """Test Composition has populated medication section."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        composition = response.data["entry"][0]["resource"]
        med_section = next(
            (s for s in composition["section"] if s["title"] == "Medication Summary"), None
        )

        assert med_section is not None
        assert "entry" in med_section
        assert "emptyReason" not in med_section
        assert len(med_section["entry"]) >= 1


class TestFHIRIPSCarePlan:
    """Tests for CarePlan in IPS Bundle."""

    def test_ips_includes_care_plan(
        self, authenticated_client, sample_patient, sample_treatment_plan_full
    ):
        """Test IPS bundle includes CarePlan from treatment plans."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

        # Find CarePlan entries
        care_plans = [
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "CarePlan"
        ]

        assert len(care_plans) >= 1
        plan = care_plans[0]
        assert plan["status"] == "active"
        assert plan["intent"] == "plan"

    def test_care_plan_includes_activities(
        self, authenticated_client, sample_patient, sample_treatment_plan_full
    ):
        """Test CarePlan includes activities from treatment plan."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        care_plans = [
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "CarePlan"
        ]

        assert len(care_plans) >= 1
        plan = care_plans[0]
        assert "activity" in plan

        # Should have diet, activity restrictions, referral, and follow-up
        assert len(plan["activity"]) >= 3

    def test_care_plan_includes_referral(
        self, authenticated_client, sample_patient, sample_treatment_plan_full
    ):
        """Test CarePlan includes referral activity."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        care_plans = [
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "CarePlan"
        ]

        plan = care_plans[0]
        referral_activity = next(
            (a for a in plan["activity"] if "Referral" in a["detail"]["code"]["text"]),
            None,
        )

        assert referral_activity is not None
        assert "ENT" in referral_activity["detail"]["description"]

    def test_care_plan_individual_endpoint(self, authenticated_client, sample_treatment_plan_full):
        """Test individual CarePlan endpoint works."""
        url = reverse("fhir:care-plan-read", args=[sample_treatment_plan_full.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "CarePlan"
        assert response.data["id"] == str(sample_treatment_plan_full.id)

    def test_care_plan_not_found(self, authenticated_client):
        """Test CarePlan returns 404 for non-existent plan."""
        url = reverse("fhir:care-plan-read", args=[99999])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data["resourceType"] == "OperationOutcome"

    def test_composition_plan_of_care_section(
        self, authenticated_client, sample_patient, sample_treatment_plan_full
    ):
        """Test Composition includes Plan of Care section."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        composition = response.data["entry"][0]["resource"]
        care_section = next(
            (s for s in composition["section"] if s["title"] == "Plan of Care"), None
        )

        assert care_section is not None
        assert "entry" in care_section
        assert len(care_section["entry"]) >= 1


class TestFHIRIPSEmptySections:
    """Tests for IPS Bundle with no data (empty sections)."""

    def test_ips_empty_medication_section(self, authenticated_client, sample_patient):
        """Test IPS handles empty medication section correctly."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        composition = response.data["entry"][0]["resource"]
        med_section = next(
            (s for s in composition["section"] if s["title"] == "Medication Summary"), None
        )

        assert med_section is not None
        assert "emptyReason" in med_section
        assert med_section["emptyReason"]["coding"][0]["code"] == "unavailable"

    def test_ips_empty_allergy_section(self, authenticated_client, sample_patient):
        """Test IPS handles empty allergy section correctly."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        composition = response.data["entry"][0]["resource"]
        allergy_section = next(
            (s for s in composition["section"] if s["title"] == "Allergies and Intolerances"),
            None,
        )

        assert allergy_section is not None
        assert "emptyReason" in allergy_section


class TestFHIRIPSAllergies:
    """Tests for AllergyIntolerance in IPS Bundle (already implemented, verify integration)."""

    def test_ips_includes_allergies(
        self, authenticated_client, sample_patient, sample_allergy_active
    ):
        """Test IPS bundle includes AllergyIntolerance resources."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        # Find AllergyIntolerance entries
        allergies = [
            e["resource"]
            for e in response.data["entry"]
            if e["resource"]["resourceType"] == "AllergyIntolerance"
        ]

        assert len(allergies) >= 1
        allergy = allergies[0]
        assert "Penicillin" in str(allergy)

    def test_composition_allergy_section_populated(
        self, authenticated_client, sample_patient, sample_allergy_active
    ):
        """Test Composition has populated allergy section."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        composition = response.data["entry"][0]["resource"]
        allergy_section = next(
            (s for s in composition["section"] if s["title"] == "Allergies and Intolerances"),
            None,
        )

        assert allergy_section is not None
        assert "entry" in allergy_section
        assert "emptyReason" not in allergy_section


class TestFHIRIPSComplete:
    """Tests for complete IPS Bundle with all resource types."""

    def test_ips_bundle_infers_author_organization_from_facility_when_patient_org_missing(
        self,
        authenticated_client,
        sample_patient,
        sample_facility,
        sample_organization,
    ):
        """IPS bundle should still include the author organization when patient.organization is empty."""
        sample_patient.organization = None
        sample_patient.registered_at_facility = sample_facility
        sample_patient.save(update_fields=["organization", "registered_at_facility"])

        response = authenticated_client.get(
            reverse("fhir:patient-summary", args=[sample_patient.id])
        )

        composition = response.data["entry"][0]["resource"]
        organization_entries = [
            entry["resource"]
            for entry in response.data["entry"]
            if entry["resource"]["resourceType"] == "Organization"
        ]

        assert composition["author"][0]["reference"] == f"Organization/{sample_organization.id}"
        assert any(org["id"] == str(sample_organization.id) for org in organization_entries)

    def test_ips_bundle_contains_author_organization_entry(
        self,
        authenticated_client,
        sample_patient,
    ):
        """IPS bundle should include the organization referenced by Composition author/custodian."""
        response = authenticated_client.get(
            reverse("fhir:patient-summary", args=[sample_patient.id])
        )

        composition = response.data["entry"][0]["resource"]
        organization_entries = [
            entry["resource"]
            for entry in response.data["entry"]
            if entry["resource"]["resourceType"] == "Organization"
        ]

        assert (
            composition["author"][0]["reference"]
            == f"Organization/{sample_patient.organization_id}"
        )
        assert (
            composition["custodian"]["reference"]
            == f"Organization/{sample_patient.organization_id}"
        )
        assert any(org["id"] == str(sample_patient.organization_id) for org in organization_entries)

    def test_ips_composition_has_required_document_metadata(
        self,
        authenticated_client,
        sample_patient,
    ):
        """IPS Composition should include narrative and core document metadata used by Inferno validation."""
        response = authenticated_client.get(
            reverse("fhir:patient-summary", args=[sample_patient.id])
        )
        composition = response.data["entry"][0]["resource"]

        assert composition["meta"]["profile"] == [
            "http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips"
        ]
        assert composition["text"]["status"] == "generated"
        assert composition["identifier"]["value"].startswith("ips-composition-")
        assert composition["confidentiality"] == "N"
        assert composition["attester"][0]["mode"] == "legal"
        assert composition["event"][0]["code"][0]["coding"][0]["code"] == "PCPR"

    def test_ips_conditions_use_problem_category_and_narrative(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        sample_diagnosis,
    ):
        """IPS Conditions should use the IPS problem category pattern and generated narrative."""
        response = authenticated_client.get(
            reverse("fhir:patient-summary", args=[sample_patient.id])
        )

        conditions = [
            entry["resource"]
            for entry in response.data["entry"]
            if entry["resource"]["resourceType"] == "Condition"
        ]

        assert conditions
        condition = conditions[0]
        assert (
            condition["category"][0]["coding"][0]["system"]
            == "http://terminology.hl7.org/CodeSystem/condition-category"
        )
        assert condition["category"][0]["coding"][0]["code"] == "problem-list-item"
        assert condition["text"]["status"] == "generated"
        assert "Condition" in condition["text"]["div"]

    def test_pending_medication_statement_uses_intended_status(
        self, authenticated_client, sample_prescription_with_items
    ):
        """Pending prescriptions should map to intended MedicationStatement status."""
        item = sample_prescription_with_items.items.first()

        response = authenticated_client.get(
            reverse("fhir:medication-statement-read", args=[item.id])
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "intended"

    def test_condition_code_uses_canonical_icd10_display(self):
        """FHIR Condition coding should use canonical ICD-10 displays for Inferno validation."""
        from types import SimpleNamespace

        from hmis.apps.core.fhir.views import FHIRConditionView

        view = FHIRConditionView()

        j06_diagnosis = SimpleNamespace(
            icd10_code=SimpleNamespace(
                code="J06.9",
                description="Acute upper respiratory infection unspecified",
            ),
            icd11_code="",
            icd11_display="",
            snomed_code="",
            snomed_display="",
            free_text_diagnosis="",
        )
        i10_diagnosis = SimpleNamespace(
            icd10_code=SimpleNamespace(code="I10", description="Essential primary hypertension"),
            icd11_code="",
            icd11_display="",
            snomed_code="",
            snomed_display="",
            free_text_diagnosis="",
        )

        j06_code = view._build_condition_code(j06_diagnosis)
        i10_code = view._build_condition_code(i10_diagnosis)

        assert j06_code["coding"][0]["display"] == "Acute upper respiratory infection, unspecified"
        assert j06_code["text"] == "Acute upper respiratory infection, unspecified"
        assert i10_code["coding"][0]["display"] == "Essential (primary) hypertension"
        assert i10_code["text"] == "Essential (primary) hypertension"

    def test_ips_bundle_patient_org_and_allergy_have_narrative(
        self, authenticated_client, sample_patient, sample_allergy_active
    ):
        """Bundled Patient, Organization, and Allergy resources should include narrative text."""
        response = authenticated_client.get(
            reverse("fhir:patient-summary", args=[sample_patient.id])
        )

        patient = next(
            entry["resource"]
            for entry in response.data["entry"]
            if entry["resource"]["resourceType"] == "Patient"
        )
        organization = next(
            entry["resource"]
            for entry in response.data["entry"]
            if entry["resource"]["resourceType"] == "Organization"
        )
        allergy = next(
            entry["resource"]
            for entry in response.data["entry"]
            if entry["resource"]["resourceType"] == "AllergyIntolerance"
        )

        assert patient["text"]["status"] == "generated"
        assert organization["text"]["status"] == "generated"
        assert allergy["text"]["status"] == "generated"
        assert "recorder" not in allergy

    def test_complete_ips_bundle(
        self,
        authenticated_client,
        sample_patient,
        sample_prescription_with_items,
        sample_treatment_plan_full,
        sample_allergy_active,
        sample_lab_result,
        sample_specimen,
        sample_diagnostic_report,
        sample_immunization_record,
        sample_procedure_order,
        sample_dicom_study,
        sample_dicom_instance,
        sample_social_history_observation,
        sample_tobacco_history_observation,
        sample_pregnancy_status_observation,
        sample_pregnancy_edd_observation,
        sample_pregnancy_outcome_observation,
    ):
        """Test IPS bundle with all resource types populated."""
        sample_lab_result.specimen = sample_specimen
        sample_lab_result.save(update_fields=["specimen"])

        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

        # Extract resource types
        resource_types = [e["resource"]["resourceType"] for e in response.data["entry"]]

        # Verify all expected resource types present
        assert "Composition" in resource_types
        assert "Patient" in resource_types
        assert "MedicationStatement" in resource_types
        assert "CarePlan" in resource_types
        assert "AllergyIntolerance" in resource_types
        assert "Observation" in resource_types
        assert "Specimen" in resource_types
        assert "DiagnosticReport" in resource_types
        assert "Immunization" in resource_types
        assert "Procedure" in resource_types
        assert "ImagingStudy" in resource_types
        assert "Media" in resource_types

        # Composition should be first
        assert response.data["entry"][0]["resource"]["resourceType"] == "Composition"

        # Patient should be second
        assert response.data["entry"][1]["resource"]["resourceType"] == "Patient"

    def test_expanded_composition_sections(
        self,
        authenticated_client,
        sample_patient,
        sample_lab_result,
        sample_specimen,
        sample_diagnostic_report,
        sample_immunization_record,
        sample_procedure_order,
        sample_dicom_study,
        sample_dicom_instance,
        sample_social_history_observation,
        sample_tobacco_history_observation,
        sample_pregnancy_status_observation,
        sample_pregnancy_edd_observation,
        sample_pregnancy_outcome_observation,
    ):
        """IPS Composition should reference the expanded clinical sections."""
        sample_lab_result.specimen = sample_specimen
        sample_lab_result.save(update_fields=["specimen"])

        response = authenticated_client.get(
            reverse("fhir:patient-summary", args=[sample_patient.id])
        )

        assert response.status_code == status.HTTP_200_OK

        composition = response.data["entry"][0]["resource"]
        results_section = next(
            (s for s in composition["section"] if s["title"] == "Diagnostic Results"), None
        )
        social_history_section = next(
            (s for s in composition["section"] if s["title"] == "Social History"), None
        )
        pregnancy_section = next(
            (s for s in composition["section"] if s["title"] == "History of Pregnancy"), None
        )
        immunization_section = next(
            (s for s in composition["section"] if s["title"] == "History of Immunizations"),
            None,
        )
        procedure_section = next(
            (s for s in composition["section"] if s["title"] == "Procedure History"), None
        )

        assert results_section is not None
        assert {entry["reference"] for entry in results_section["entry"]} >= {
            f"Observation/{sample_lab_result.id}",
            f"DiagnosticReport/{sample_diagnostic_report.id}",
            f"Specimen/{sample_specimen.id}",
            f"ImagingStudy/{sample_dicom_study.id}",
            f"Media/{sample_dicom_instance.id}",
        }
        assert social_history_section is not None
        assert {entry["reference"] for entry in social_history_section["entry"]} >= {
            f"Observation/{sample_social_history_observation.fhir_id}",
            f"Observation/{sample_tobacco_history_observation.fhir_id}",
        }
        assert pregnancy_section is not None
        assert {entry["reference"] for entry in pregnancy_section["entry"]} >= {
            f"Observation/{sample_pregnancy_status_observation.fhir_id}",
            f"Observation/{sample_pregnancy_edd_observation.fhir_id}",
            f"Observation/{sample_pregnancy_outcome_observation.fhir_id}",
        }
        assert immunization_section is not None
        assert immunization_section["entry"] == [
            {"reference": f"Immunization/{sample_immunization_record.id}"}
        ]
        assert procedure_section is not None
        assert procedure_section["entry"] == [
            {"reference": f"Procedure/{sample_procedure_order.id}"}
        ]

    def test_ips_bundle_identifier(self, authenticated_client, sample_patient):
        """Test IPS bundle has proper identifier."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert "identifier" in response.data
        assert sample_patient.mrn in response.data["identifier"]["value"]

    def test_ips_bundle_timestamp(self, authenticated_client, sample_patient):
        """Test IPS bundle has timestamp."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = authenticated_client.get(url)

        assert "timestamp" in response.data
        assert response.data["timestamp"] is not None
