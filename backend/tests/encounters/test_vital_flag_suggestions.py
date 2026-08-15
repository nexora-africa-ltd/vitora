"""Tests vitals-derived clinical flag suggestions workflow.

How to run:
    poetry run pytest tests/encounters/test_vital_flag_suggestions.py -v

Inputs:
    Uses shared pytest fixtures (authenticated_client, sample_patient,
    sample_encounter, sample_icd10_code, sample_organization, sample_facility).
"""

import pytest
from rest_framework import status

from hmis.apps.encounters.models import ChronicCondition, Diagnosis, VitalFlagSuggestion
from hmis.apps.encounters.services import VitalFlagSuggestionService


@pytest.mark.django_db
class TestVitalFlagSuggestionDetection:
    def test_detect_from_encounter_creates_expected_flags(self, sample_encounter):
        sample_encounter.spo2 = 89
        sample_encounter.blood_pressure = "182/121"
        sample_encounter.weight = 110
        sample_encounter.height = 170
        sample_encounter.save(
            update_fields=["spo2", "blood_pressure", "weight", "height", "updated_at"]
        )

        suggestions = VitalFlagSuggestionService.detect_from_encounter(sample_encounter)
        keys = sorted(s.flag_key for s in suggestions)

        assert "HYPOXIA" in keys
        assert "HYPERTENSIVE_CRISIS" in keys
        assert "BMI_OBESITY" in keys

        hypoxia = VitalFlagSuggestion.objects.get(encounter=sample_encounter, flag_key="HYPOXIA")
        assert hypoxia.severity == VitalFlagSuggestion.Severity.CRITICAL
        assert hypoxia.status == VitalFlagSuggestion.Status.NEW
        assert hypoxia.mapping_status in {
            VitalFlagSuggestion.MappingStatus.AUTO_MAPPED,
            VitalFlagSuggestion.MappingStatus.UNMAPPED,
        }


@pytest.mark.django_db
class TestVitalFlagSuggestionAPI:
    def test_acknowledge_map_and_accept_creates_diagnosis(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        sample_icd10_code,
        sample_organization,
        sample_facility,
    ):
        suggestion = VitalFlagSuggestion.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            source_type=VitalFlagSuggestion.SourceType.ENCOUNTER,
            flag_key="HYPOXIA",
            clinical_domain="RESPIRATORY",
            severity=VitalFlagSuggestion.Severity.CRITICAL,
            evidence_json={"spo2": 88.0},
            organization=sample_organization,
            facility=sample_facility,
        )

        base = f"/api/patients/{sample_patient.id}/vital-flag-suggestions/{suggestion.id}"

        acknowledge_response = authenticated_client.post(
            f"{base}/acknowledge/",
            {"note": "Reviewed by clinician"},
            format="json",
        )
        assert acknowledge_response.status_code == status.HTTP_200_OK
        assert acknowledge_response.data["status"] == VitalFlagSuggestion.Status.ACKNOWLEDGED

        map_response = authenticated_client.post(
            f"{base}/map-codes/",
            {
                "selected_icd10": sample_icd10_code.id,
                "selected_icd11_code": "MD71",
                "selected_icd11_title": "Hypoxemia",
            },
            format="json",
        )
        assert map_response.status_code == status.HTTP_200_OK
        assert map_response.data["status"] == VitalFlagSuggestion.Status.MAPPED

        accept_response = authenticated_client.post(
            f"{base}/accept/",
            {
                "resolution_action": "CREATE_DIAGNOSIS_CONFIRMED",
                "selected_icd10": sample_icd10_code.id,
                "diagnosis_type": "WORKING",
                "note": "Confirmed after review",
            },
            format="json",
        )
        assert accept_response.status_code == status.HTTP_200_OK
        assert accept_response.data["status"] == VitalFlagSuggestion.Status.ACCEPTED
        assert accept_response.data["linked_diagnosis"] is not None

        diagnosis = Diagnosis.objects.get(pk=accept_response.data["linked_diagnosis"])
        assert diagnosis.encounter_id == sample_encounter.id
        assert diagnosis.icd10_code_id == sample_icd10_code.id
        assert diagnosis.is_confirmed is True

    def test_accept_add_chronic_condition(
        self,
        authenticated_client,
        sample_patient,
        sample_encounter,
        sample_icd10_code,
        sample_organization,
        sample_facility,
    ):
        suggestion = VitalFlagSuggestion.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            source_type=VitalFlagSuggestion.SourceType.ENCOUNTER,
            flag_key="HYPERTENSION_STAGE2",
            clinical_domain="CARDIOVASCULAR",
            severity=VitalFlagSuggestion.Severity.WARNING,
            selected_icd10=sample_icd10_code,
            mapping_status=VitalFlagSuggestion.MappingStatus.CONFIRMED,
            evidence_json={"systolic_bp": 150, "diastolic_bp": 98},
            organization=sample_organization,
            facility=sample_facility,
        )

        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/vital-flag-suggestions/{suggestion.id}/accept/",
            {
                "resolution_action": "ADD_CHRONIC_CONDITION",
                "condition_name": "Hypertension",
                "chronic_status": "ACTIVE",
                "note": "Persistently elevated readings",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == VitalFlagSuggestion.Status.ACCEPTED
        assert response.data["linked_chronic_condition"] is not None

        condition = ChronicCondition.objects.get(pk=response.data["linked_chronic_condition"])
        assert condition.patient_id == sample_patient.id
        assert condition.encounter_id == sample_encounter.id
        assert condition.condition_name == "Hypertension"
