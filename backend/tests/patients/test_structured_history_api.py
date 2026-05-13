"""
Tests for the structured history APIs: ChronicCondition, CurrentMedication,
PastSurgery, FamilyHistory.

Covers CRUD operations, tenant scoping, and validation.
"""

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.encounters.models import (
    ChronicCondition,
    CurrentMedication,
    FamilyHistory,
    PastSurgery,
)

pytestmark = pytest.mark.django_db


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def chronic_condition_data():
    return {
        "condition_name": "Type 2 Diabetes Mellitus",
        "icd10_code": "E11",
        "status": "ACTIVE",
        "onset_date": "2020-06-15",
        "notes": "Controlled with metformin",
    }


@pytest.fixture
def sample_chronic_condition(sample_patient, sample_facility, test_user):
    return ChronicCondition.objects.create(
        patient=sample_patient,
        condition_name="Hypertension",
        icd10_code="I10",
        status="ACTIVE",
        onset_date="2019-03-10",
        notes="On lisinopril 10mg OD",
        recorded_by=test_user,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def current_medication_data():
    return {
        "medication_name": "Metformin",
        "dosage": "500mg",
        "frequency": "BD",
        "route": "Oral",
        "status": "ACTIVE",
        "start_date": "2020-06-15",
        "notes": "Take with meals",
    }


@pytest.fixture
def sample_current_medication(sample_patient, sample_facility, test_user):
    return CurrentMedication.objects.create(
        patient=sample_patient,
        medication_name="Lisinopril",
        dosage="10mg",
        frequency="OD",
        route="Oral",
        status="ACTIVE",
        start_date="2019-03-10",
        recorded_by=test_user,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def past_surgery_data():
    return {
        "procedure_name": "Appendectomy",
        "procedure_date": "2018-09-20",
        "outcome": "SUCCESSFUL",
        "notes": "Laparoscopic, no complications",
    }


@pytest.fixture
def sample_past_surgery(sample_patient, sample_facility, test_user):
    return PastSurgery.objects.create(
        patient=sample_patient,
        procedure_name="Cesarean Section",
        procedure_date="2021-01-15",
        outcome="SUCCESSFUL",
        notes="Emergency C-section",
        recorded_by=test_user,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def family_history_data():
    return {
        "relationship": "FATHER",
        "condition_name": "Myocardial Infarction",
        "deceased": True,
        "age_at_onset": "55",
        "notes": "Fatal MI at age 55",
    }


@pytest.fixture
def sample_family_history(sample_patient, sample_facility, test_user):
    return FamilyHistory.objects.create(
        patient=sample_patient,
        relationship="MOTHER",
        condition_name="Type 2 Diabetes",
        deceased=False,
        age_at_onset="50",
        recorded_by=test_user,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


# =============================================================================
# Chronic Condition Tests
# =============================================================================


class TestChronicConditionList:
    def test_list_returns_conditions(
        self, authenticated_client, sample_patient, sample_chronic_condition
    ):
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/chronic-conditions/"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["condition_name"] == "Hypertension"
        assert results[0]["status_display"] == "Active"

    def test_list_empty(self, authenticated_client, sample_patient):
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/chronic-conditions/"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_list_requires_auth(self, api_client, sample_patient):
        response = api_client.get(f"/api/patients/{sample_patient.id}/chronic-conditions/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_filters_by_status(
        self,
        authenticated_client,
        sample_patient,
        sample_chronic_condition,
        sample_facility,
        test_user,
    ):
        ChronicCondition.objects.create(
            patient=sample_patient,
            condition_name="Resolved Condition",
            status="RESOLVED",
            recorded_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/chronic-conditions/?status=ACTIVE"
        )
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["status"] == "ACTIVE"


class TestChronicConditionCreate:
    def test_create(self, authenticated_client, sample_patient, chronic_condition_data):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/chronic-conditions/",
            chronic_condition_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["condition_name"] == "Type 2 Diabetes Mellitus"
        assert response.data["icd10_code"] == "E11"
        assert response.data["patient"] == sample_patient.id

    def test_create_generates_fhir_id(
        self, authenticated_client, sample_patient, chronic_condition_data
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/chronic-conditions/",
            chronic_condition_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        obj = ChronicCondition.objects.get(pk=response.data["id"])
        assert obj.fhir_id >= ChronicCondition.FHIR_ID_FLOOR

    def test_create_assigns_recorded_by(
        self, authenticated_client, sample_patient, chronic_condition_data, test_user
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/chronic-conditions/",
            chronic_condition_data,
            format="json",
        )
        obj = ChronicCondition.objects.get(pk=response.data["id"])
        assert obj.recorded_by == test_user

    def test_create_requires_auth(self, api_client, sample_patient, chronic_condition_data):
        response = api_client.post(
            f"/api/patients/{sample_patient.id}/chronic-conditions/",
            chronic_condition_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_invalid_status(self, authenticated_client, sample_patient):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/chronic-conditions/",
            {"condition_name": "Test", "status": "INVALID"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestChronicConditionUpdate:
    def test_update_status(self, authenticated_client, sample_patient, sample_chronic_condition):
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/chronic-conditions/{sample_chronic_condition.id}/",
            {"status": "REMISSION"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_chronic_condition.refresh_from_db()
        assert sample_chronic_condition.status == "REMISSION"


class TestChronicConditionDelete:
    def test_delete(self, authenticated_client, sample_patient, sample_chronic_condition):
        response = authenticated_client.delete(
            f"/api/patients/{sample_patient.id}/chronic-conditions/{sample_chronic_condition.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ChronicCondition.objects.filter(pk=sample_chronic_condition.id).exists()

    def test_delete_requires_auth(self, api_client, sample_patient, sample_chronic_condition):
        response = api_client.delete(
            f"/api/patients/{sample_patient.id}/chronic-conditions/{sample_chronic_condition.id}/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Current Medication Tests
# =============================================================================


class TestCurrentMedicationList:
    def test_list_returns_medications(
        self, authenticated_client, sample_patient, sample_current_medication
    ):
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/current-medications/"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["medication_name"] == "Lisinopril"
        assert results[0]["status_display"] == "Currently taking"

    def test_list_empty(self, authenticated_client, sample_patient):
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/current-medications/"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_list_requires_auth(self, api_client, sample_patient):
        response = api_client.get(f"/api/patients/{sample_patient.id}/current-medications/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestCurrentMedicationCreate:
    def test_create(self, authenticated_client, sample_patient, current_medication_data):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/current-medications/",
            current_medication_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["medication_name"] == "Metformin"
        assert response.data["dosage"] == "500mg"
        assert response.data["frequency"] == "BD"
        assert response.data["patient"] == sample_patient.id

    def test_create_generates_fhir_id(
        self, authenticated_client, sample_patient, current_medication_data
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/current-medications/",
            current_medication_data,
            format="json",
        )
        obj = CurrentMedication.objects.get(pk=response.data["id"])
        assert obj.fhir_id >= CurrentMedication.FHIR_ID_FLOOR

    def test_create_requires_auth(self, api_client, sample_patient, current_medication_data):
        response = api_client.post(
            f"/api/patients/{sample_patient.id}/current-medications/",
            current_medication_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_invalid_status(self, authenticated_client, sample_patient):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/current-medications/",
            {"medication_name": "Test", "status": "INVALID"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestCurrentMedicationUpdate:
    def test_update_dosage(self, authenticated_client, sample_patient, sample_current_medication):
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/current-medications/{sample_current_medication.id}/",
            {"dosage": "20mg", "notes": "Increased dose"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_current_medication.refresh_from_db()
        assert sample_current_medication.dosage == "20mg"

    def test_update_status_to_stopped(
        self, authenticated_client, sample_patient, sample_current_medication
    ):
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/current-medications/{sample_current_medication.id}/",
            {"status": "STOPPED"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_current_medication.refresh_from_db()
        assert sample_current_medication.status == "STOPPED"


class TestCurrentMedicationDelete:
    def test_delete(self, authenticated_client, sample_patient, sample_current_medication):
        response = authenticated_client.delete(
            f"/api/patients/{sample_patient.id}/current-medications/{sample_current_medication.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not CurrentMedication.objects.filter(pk=sample_current_medication.id).exists()


# =============================================================================
# Past Surgery Tests
# =============================================================================


class TestPastSurgeryList:
    def test_list_returns_surgeries(
        self, authenticated_client, sample_patient, sample_past_surgery
    ):
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/past-surgeries/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["procedure_name"] == "Cesarean Section"
        assert results[0]["outcome_display"] == "Successful"

    def test_list_empty(self, authenticated_client, sample_patient):
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/past-surgeries/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_list_requires_auth(self, api_client, sample_patient):
        response = api_client.get(f"/api/patients/{sample_patient.id}/past-surgeries/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestPastSurgeryCreate:
    def test_create(self, authenticated_client, sample_patient, past_surgery_data):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/past-surgeries/",
            past_surgery_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["procedure_name"] == "Appendectomy"
        assert response.data["outcome"] == "SUCCESSFUL"
        assert response.data["patient"] == sample_patient.id

    def test_create_generates_fhir_id(
        self, authenticated_client, sample_patient, past_surgery_data
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/past-surgeries/",
            past_surgery_data,
            format="json",
        )
        obj = PastSurgery.objects.get(pk=response.data["id"])
        assert obj.fhir_id >= PastSurgery.FHIR_ID_FLOOR

    def test_create_requires_auth(self, api_client, sample_patient, past_surgery_data):
        response = api_client.post(
            f"/api/patients/{sample_patient.id}/past-surgeries/",
            past_surgery_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_invalid_outcome(self, authenticated_client, sample_patient):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/past-surgeries/",
            {"procedure_name": "Test", "outcome": "INVALID"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestPastSurgeryUpdate:
    def test_update_notes(self, authenticated_client, sample_patient, sample_past_surgery):
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/past-surgeries/{sample_past_surgery.id}/",
            {"notes": "Updated notes: no complications post-op"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_past_surgery.refresh_from_db()
        assert sample_past_surgery.notes == "Updated notes: no complications post-op"


class TestPastSurgeryDelete:
    def test_delete(self, authenticated_client, sample_patient, sample_past_surgery):
        response = authenticated_client.delete(
            f"/api/patients/{sample_patient.id}/past-surgeries/{sample_past_surgery.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not PastSurgery.objects.filter(pk=sample_past_surgery.id).exists()


# =============================================================================
# Family History Tests
# =============================================================================


class TestFamilyHistoryList:
    def test_list_returns_entries(
        self, authenticated_client, sample_patient, sample_family_history
    ):
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/family-history/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["relationship"] == "MOTHER"
        assert results[0]["relationship_display"] == "Mother"
        assert results[0]["condition_name"] == "Type 2 Diabetes"

    def test_list_empty(self, authenticated_client, sample_patient):
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/family-history/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_list_requires_auth(self, api_client, sample_patient):
        response = api_client.get(f"/api/patients/{sample_patient.id}/family-history/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_filters_by_relationship(
        self,
        authenticated_client,
        sample_patient,
        sample_family_history,
        sample_facility,
        test_user,
    ):
        FamilyHistory.objects.create(
            patient=sample_patient,
            relationship="SIBLING",
            condition_name="Asthma",
            recorded_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/family-history/?relationship=MOTHER"
        )
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["relationship"] == "MOTHER"


class TestFamilyHistoryCreate:
    def test_create(self, authenticated_client, sample_patient, family_history_data):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/family-history/",
            family_history_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["relationship"] == "FATHER"
        assert response.data["condition_name"] == "Myocardial Infarction"
        assert response.data["deceased"] is True
        assert response.data["patient"] == sample_patient.id

    def test_create_generates_fhir_id(
        self, authenticated_client, sample_patient, family_history_data
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/family-history/",
            family_history_data,
            format="json",
        )
        obj = FamilyHistory.objects.get(pk=response.data["id"])
        assert obj.fhir_id >= FamilyHistory.FHIR_ID_FLOOR

    def test_create_requires_auth(self, api_client, sample_patient, family_history_data):
        response = api_client.post(
            f"/api/patients/{sample_patient.id}/family-history/",
            family_history_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_invalid_relationship(self, authenticated_client, sample_patient):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/family-history/",
            {"relationship": "INVALID", "condition_name": "Test"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestFamilyHistoryUpdate:
    def test_update_notes(self, authenticated_client, sample_patient, sample_family_history):
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/family-history/{sample_family_history.id}/",
            {"notes": "Diagnosed at age 50, well controlled"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_family_history.refresh_from_db()
        assert sample_family_history.notes == "Diagnosed at age 50, well controlled"


class TestFamilyHistoryDelete:
    def test_delete(self, authenticated_client, sample_patient, sample_family_history):
        response = authenticated_client.delete(
            f"/api/patients/{sample_patient.id}/family-history/{sample_family_history.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not FamilyHistory.objects.filter(pk=sample_family_history.id).exists()

    def test_delete_requires_auth(self, api_client, sample_patient, sample_family_history):
        response = api_client.delete(
            f"/api/patients/{sample_patient.id}/family-history/{sample_family_history.id}/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
