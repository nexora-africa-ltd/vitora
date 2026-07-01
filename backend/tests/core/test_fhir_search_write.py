# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for FHIR R4 Search and Write endpoints.

Covers Gap #1 (FHIR Write), Gap #2 (FHIR Search) from the interoperability audit.
"""

import pytest  # type: ignore
from rest_framework import status


@pytest.mark.django_db
class TestFHIRPatientSearch:
    """Tests for GET /fhir/Patient?params search endpoint."""

    def test_search_by_name(self, authenticated_client, sample_patient):
        """Should find patient by name."""
        response = authenticated_client.get("/fhir/Patient", {"name": sample_patient.first_name})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "searchset"
        assert response.data["total"] >= 1

        # Check first entry is correct resource type
        entries = response.data["entry"]
        assert len(entries) >= 1
        assert entries[0]["resource"]["resourceType"] == "Patient"

    def test_search_by_identifier(self, authenticated_client, sample_patient):
        """Should find patient by MRN."""
        response = authenticated_client.get("/fhir/Patient", {"identifier": sample_patient.mrn})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total"] >= 1

        resource = response.data["entry"][0]["resource"]
        assert resource["identifier"][0]["value"] == sample_patient.mrn

    def test_search_by_birthdate(self, authenticated_client, sample_patient):
        """Should find patient by date of birth."""
        dob = sample_patient.date_of_birth
        dob_str = dob.isoformat() if hasattr(dob, "isoformat") else str(dob)
        response = authenticated_client.get(
            "/fhir/Patient",
            {"birthdate": dob_str},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total"] >= 1

    def test_search_by_gender(self, authenticated_client, sample_patient):
        """Should find patient by gender."""
        gender_map = {"M": "male", "F": "female", "O": "other"}
        fhir_gender = gender_map.get(sample_patient.gender, "unknown")
        response = authenticated_client.get("/fhir/Patient", {"gender": fhir_gender})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total"] >= 1

    def test_search_pagination(self, authenticated_client, sample_patient):
        """Should support _count and _offset."""
        response = authenticated_client.get("/fhir/Patient", {"_count": 1, "_offset": 0})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["entry"]) <= 1

    def test_search_returns_bundle_type(self, authenticated_client):
        """Should return searchset bundle even with no results."""
        response = authenticated_client.get("/fhir/Patient", {"name": "NONEXISTENT_XYZ_12345"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "searchset"
        assert response.data["total"] == 0

    def test_search_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/fhir/Patient", {"name": "test"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRConditionSearch:
    """Tests for GET /fhir/Condition?params search endpoint."""

    def test_search_by_patient(self, authenticated_client, sample_patient):
        """Should return conditions for a patient."""
        response = authenticated_client.get("/fhir/Condition", {"patient": str(sample_patient.pk)})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "searchset"

    def test_search_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/fhir/Condition", {"patient": "1"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRObservationSearch:
    """Tests for GET /fhir/Observation?params search endpoint."""

    def test_search_vitals_by_patient(self, authenticated_client, sample_patient):
        """Should return vital sign observations for a patient."""
        response = authenticated_client.get(
            "/fhir/Observation",
            {"patient": str(sample_patient.pk), "category": "vital-signs"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "searchset"

    def test_search_lab_by_patient(self, authenticated_client, sample_patient):
        """Should return laboratory observations for a patient."""
        response = authenticated_client.get(
            "/fhir/Observation",
            {"patient": str(sample_patient.pk), "category": "laboratory"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"

    def test_search_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/fhir/Observation", {"patient": "1"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRMedicationStatementSearch:
    """Tests for GET /fhir/MedicationStatement?params search endpoint."""

    def test_search_by_patient(self, authenticated_client, sample_patient):
        """Should return medication statements for a patient."""
        response = authenticated_client.get(
            "/fhir/MedicationStatement", {"patient": str(sample_patient.pk)}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resourceType"] == "Bundle"
        assert response.data["type"] == "searchset"

    def test_search_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/fhir/MedicationStatement", {"patient": "1"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRPatientCreate:
    """Tests for POST /fhir/Patient/ write endpoint."""

    def test_create_patient_from_fhir(self, authenticated_client, sample_county, sample_sub_county):
        """Should create a patient from a valid FHIR Patient resource."""
        fhir_patient = {
            "resourceType": "Patient",
            "name": [{"family": "Doe", "given": ["John"]}],
            "gender": "male",
            "birthDate": "1990-05-15",
            "address": [{"state": sample_county.name, "district": sample_sub_county.name}],
        }
        response = authenticated_client.post("/fhir/Patient/", fhir_patient, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resourceType"] == "Patient"
        assert response.data["name"][0]["family"] == "Doe"
        assert response.data["name"][0]["given"] == ["John"]
        assert response.data["gender"] == "male"
        assert "Location" in response

        # Should have auto-generated MRN
        assert response.data["identifier"][0]["value"].startswith("MRN-")

    def test_create_patient_invalid_resource_type(self, authenticated_client):
        """Should reject non-Patient resource types."""
        response = authenticated_client.post(
            "/fhir/Patient/",
            {"resourceType": "Observation", "status": "final"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["resourceType"] == "OperationOutcome"

    def test_create_patient_missing_name(self, authenticated_client):
        """Should reject Patient without name."""
        response = authenticated_client.post(
            "/fhir/Patient/",
            {"resourceType": "Patient", "gender": "male", "birthDate": "1990-01-01"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_patient_future_birthdate(self, authenticated_client):
        """Should reject future birth date."""
        response = authenticated_client.post(
            "/fhir/Patient/",
            {
                "resourceType": "Patient",
                "name": [{"family": "Future", "given": ["Baby"]}],
                "gender": "female",
                "birthDate": "2030-01-01",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_patient_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/fhir/Patient/",
            {"resourceType": "Patient", "name": [{"family": "X", "given": ["Y"]}]},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRObservationCreate:
    """Tests for POST /fhir/Observation/ write endpoint."""

    def test_create_vital_observation(self, authenticated_client, sample_patient, sample_encounter):
        """Should accept vital sign observation and update encounter."""
        fhir_obs = {
            "resourceType": "Observation",
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "vital-signs",
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "8310-5",
                        "display": "Body temperature",
                    }
                ]
            },
            "subject": {"reference": f"Patient/{sample_patient.pk}"},
            "valueQuantity": {"value": 37.2, "unit": "Cel"},
        }
        response = authenticated_client.post("/fhir/Observation/", fhir_obs, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resourceType"] == "Observation"

    def test_create_observation_invalid_resource_type(self, authenticated_client):
        """Should reject non-Observation resource types."""
        response = authenticated_client.post(
            "/fhir/Observation/",
            {"resourceType": "Patient", "name": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["resourceType"] == "OperationOutcome"

    def test_create_observation_missing_subject(self, authenticated_client):
        """Should reject Observation without subject reference."""
        response = authenticated_client.post(
            "/fhir/Observation/",
            {
                "resourceType": "Observation",
                "status": "final",
                "code": {"coding": [{"system": "http://loinc.org", "code": "718-7"}]},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_observation_unknown_patient(self, authenticated_client):
        """Should reject Observation referencing non-existent patient."""
        response = authenticated_client.post(
            "/fhir/Observation/",
            {
                "resourceType": "Observation",
                "status": "final",
                "code": {"coding": [{"system": "http://loinc.org", "code": "718-7"}]},
                "subject": {"reference": "Patient/999999"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not found" in response.data["issue"][0]["diagnostics"]

    def test_create_observation_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/fhir/Observation/",
            {"resourceType": "Observation"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRConditionCreate:
    """Tests for POST /fhir/Condition/ write endpoint."""

    def test_create_condition(self, authenticated_client, sample_patient, sample_encounter):
        """Should create a condition/diagnosis from FHIR resource."""
        fhir_condition = {
            "resourceType": "Condition",
            "subject": {"reference": f"Patient/{sample_patient.pk}"},
            "encounter": {"reference": f"Encounter/{sample_encounter.pk}"},
            "code": {
                "coding": [
                    {
                        "system": "http://hl7.org/fhir/sid/icd-10",
                        "code": "J18.9",
                        "display": "Pneumonia, unspecified",
                    }
                ]
            },
            "clinicalStatus": {"coding": [{"code": "active"}]},
        }
        response = authenticated_client.post("/fhir/Condition/", fhir_condition, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resourceType"] == "Condition"

    def test_create_condition_invalid_resource_type(self, authenticated_client):
        """Should reject non-Condition resource types."""
        response = authenticated_client.post(
            "/fhir/Condition/",
            {"resourceType": "Patient", "name": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["resourceType"] == "OperationOutcome"

    def test_create_condition_missing_subject(self, authenticated_client):
        """Should reject Condition without subject reference."""
        response = authenticated_client.post(
            "/fhir/Condition/",
            {
                "resourceType": "Condition",
                "code": {"coding": [{"system": "http://hl7.org/fhir/sid/icd-10", "code": "J18.9"}]},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_condition_unknown_patient(self, authenticated_client):
        """Should reject Condition referencing non-existent patient."""
        response = authenticated_client.post(
            "/fhir/Condition/",
            {
                "resourceType": "Condition",
                "subject": {"reference": "Patient/999999"},
                "code": {"coding": [{"system": "http://hl7.org/fhir/sid/icd-10", "code": "J18.9"}]},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_condition_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/fhir/Condition/",
            {"resourceType": "Condition"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIREncounterCreate:
    """Tests for POST /fhir/Encounter/ write endpoint."""

    def test_create_encounter(self, authenticated_client, sample_patient):
        """Should create an encounter from FHIR resource."""
        fhir_encounter = {
            "resourceType": "Encounter",
            "status": "in-progress",
            "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": "AMB",
                "display": "ambulatory",
            },
            "subject": {"reference": f"Patient/{sample_patient.pk}"},
            "reasonCode": [{"text": "Routine checkup"}],
        }
        response = authenticated_client.post("/fhir/Encounter/", fhir_encounter, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resourceType"] == "Encounter"

    def test_create_encounter_invalid_resource_type(self, authenticated_client):
        """Should reject non-Encounter resource types."""
        response = authenticated_client.post(
            "/fhir/Encounter/",
            {"resourceType": "Patient", "name": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_encounter_missing_subject(self, authenticated_client):
        """Should reject Encounter without subject."""
        response = authenticated_client.post(
            "/fhir/Encounter/",
            {
                "resourceType": "Encounter",
                "status": "in-progress",
                "class": {"code": "AMB"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_encounter_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/fhir/Encounter/",
            {"resourceType": "Encounter"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRMedicationRequestCreate:
    """Tests for POST /fhir/MedicationRequest/ write endpoint."""

    def test_create_medication_request(
        self, authenticated_client, sample_patient, sample_encounter
    ):
        """Should create a medication request from FHIR resource."""
        fhir_med = {
            "resourceType": "MedicationRequest",
            "status": "active",
            "intent": "order",
            "subject": {"reference": f"Patient/{sample_patient.pk}"},
            "encounter": {"reference": f"Encounter/{sample_encounter.pk}"},
            "medicationCodeableConcept": {
                "coding": [{"display": "Amoxicillin 500mg"}],
                "text": "Amoxicillin 500mg",
            },
            "dosageInstruction": [
                {
                    "text": "Take 1 capsule three times daily",
                    "timing": {"repeat": {"frequency": 3, "period": 1, "periodUnit": "d"}},
                }
            ],
        }
        response = authenticated_client.post("/fhir/MedicationRequest/", fhir_med, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resourceType"] == "MedicationRequest"

    def test_create_medication_request_invalid_type(self, authenticated_client):
        """Should reject non-MedicationRequest resource types."""
        response = authenticated_client.post(
            "/fhir/MedicationRequest/",
            {"resourceType": "Patient", "name": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_medication_request_missing_subject(self, authenticated_client):
        """Should reject MedicationRequest without subject."""
        response = authenticated_client.post(
            "/fhir/MedicationRequest/",
            {
                "resourceType": "MedicationRequest",
                "status": "active",
                "intent": "order",
                "medicationCodeableConcept": {"text": "Amoxicillin"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_medication_request_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/fhir/MedicationRequest/",
            {"resourceType": "MedicationRequest"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestFHIRDiagnosticReportCreate:
    """Tests for POST /fhir/DiagnosticReport/ write endpoint."""

    def test_create_diagnostic_report(self, authenticated_client, sample_patient, sample_encounter):
        """Should create a diagnostic report from FHIR resource."""
        fhir_report = {
            "resourceType": "DiagnosticReport",
            "status": "final",
            "subject": {"reference": f"Patient/{sample_patient.pk}"},
            "encounter": {"reference": f"Encounter/{sample_encounter.pk}"},
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "58410-2",
                        "display": "Complete blood count",
                    }
                ]
            },
            "conclusion": "All values within normal limits.",
        }
        response = authenticated_client.post("/fhir/DiagnosticReport/", fhir_report, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resourceType"] == "DiagnosticReport"

    def test_create_diagnostic_report_invalid_type(self, authenticated_client):
        """Should reject non-DiagnosticReport resource types."""
        response = authenticated_client.post(
            "/fhir/DiagnosticReport/",
            {"resourceType": "Patient", "name": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_diagnostic_report_missing_subject(self, authenticated_client):
        """Should reject DiagnosticReport without subject."""
        response = authenticated_client.post(
            "/fhir/DiagnosticReport/",
            {
                "resourceType": "DiagnosticReport",
                "status": "final",
                "code": {"coding": [{"system": "http://loinc.org", "code": "58410-2"}]},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_diagnostic_report_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/fhir/DiagnosticReport/",
            {"resourceType": "DiagnosticReport"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
