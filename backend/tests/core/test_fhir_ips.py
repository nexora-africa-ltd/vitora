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
def sample_prescription_with_items(db, sample_patient, sample_encounter, test_user, sample_drug, sample_facility, sample_organization):
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
    db, sample_patient, sample_encounter, test_user, sample_drug, sample_drug_2,
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
        assert "http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips" in response.data[
            "meta"
        ]["profile"]

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

    def test_ips_bundle_requires_authentication(self, api_client, sample_patient):
        """Test IPS endpoint requires authentication."""
        url = reverse("fhir:patient-summary", args=[sample_patient.id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


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
        assert med["status"] == "active"
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
            (
                a
                for a in plan["activity"]
                if "Referral" in a["detail"]["code"]["text"]
            ),
            None,
        )

        assert referral_activity is not None
        assert "ENT" in referral_activity["detail"]["description"]

    def test_care_plan_individual_endpoint(
        self, authenticated_client, sample_treatment_plan_full
    ):
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

    def test_complete_ips_bundle(
        self,
        authenticated_client,
        sample_patient,
        sample_prescription_with_items,
        sample_treatment_plan_full,
        sample_allergy_active,
    ):
        """Test IPS bundle with all resource types populated."""
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

        # Composition should be first
        assert response.data["entry"][0]["resource"]["resourceType"] == "Composition"

        # Patient should be second
        assert response.data["entry"][1]["resource"]["resourceType"] == "Patient"

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
