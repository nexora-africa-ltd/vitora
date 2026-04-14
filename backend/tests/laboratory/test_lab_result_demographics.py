"""
Tests for LabResultSerializer patient demographics fields.

Verifies the new patient_gender, patient_date_of_birth, and encounter_id
fields are correctly exposed for AI lab interpretation on the frontend.
"""

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.laboratory.serializers import LabResultSerializer


@pytest.mark.django_db
class TestLabResultSerializerDemographics:
    """Tests for patient demographics on LabResultSerializer."""

    def test_serializer_includes_patient_gender(self, sample_lab_result):
        """Should expose patient gender from related order → patient."""
        serializer = LabResultSerializer(sample_lab_result)
        assert "patient_gender" in serializer.data
        # The sample_patient has gender='F' (from conftest)
        assert serializer.data["patient_gender"] in ("M", "F", "O")

    def test_serializer_includes_patient_date_of_birth(self, sample_lab_result):
        """Should expose patient date_of_birth from related order → patient."""
        serializer = LabResultSerializer(sample_lab_result)
        assert "patient_date_of_birth" in serializer.data
        assert serializer.data["patient_date_of_birth"] is not None

    def test_serializer_includes_encounter_id(self, sample_lab_result):
        """Should expose encounter_id from related lab order."""
        serializer = LabResultSerializer(sample_lab_result)
        assert "encounter_id" in serializer.data
        # The sample_lab_order is linked to an encounter via conftest
        assert serializer.data["encounter_id"] is not None

    def test_api_returns_demographics_on_result_detail(
        self, authenticated_client, sample_lab_result
    ):
        """GET /api/laboratory/results/{id}/ should include patient demographics."""
        url = f"/api/lab/results/{sample_lab_result.id}/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert "patient_gender" in response.data
        assert "patient_date_of_birth" in response.data
        assert "encounter_id" in response.data

    def test_demographics_match_actual_patient_data(self, sample_lab_result, sample_patient):
        """Demographics should match the actual patient on the lab order."""
        serializer = LabResultSerializer(sample_lab_result)
        assert serializer.data["patient_gender"] == sample_patient.gender
        assert serializer.data["patient_date_of_birth"] == str(sample_patient.date_of_birth)
