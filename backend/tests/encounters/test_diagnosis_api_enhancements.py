"""
Tests for Diagnosis API enhancements - Sprint 1.1-1.2.

Tests cover:
1. Creating diagnosis with certainty field via API
2. Diagnosis response includes certainty
3. Diagnosis response includes diagnosed_by
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Local Fixtures
# ============================================================================


@pytest.fixture
def diagnosis_api_test_user(db):
    """Create a test user for diagnosis API tests."""
    return User.objects.create_user(username="diagnosisdoc", password="testpass123")


@pytest.fixture
def diagnosis_api_sample_patient(db, sample_organization):
    """Create a sample patient for diagnosis API tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="DiagAPI",
        last_name="Test",
        date_of_birth=date(1985, 3, 20),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def diagnosis_api_sample_encounter(db, diagnosis_api_sample_patient, sample_facility):
    """Create a sample encounter for diagnosis API tests."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=diagnosis_api_sample_patient,
        encounter_type="OPD",
        chief_complaint="Diagnosis API test complaint",
        facility=sample_facility,
    )


@pytest.fixture
def diagnosis_api_sample_icd10_code(db):
    """Create a sample ICD-10 code for diagnosis API tests."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="A00.0",
        description="Cholera due to Vibrio cholerae",
        category="Certain infectious diseases",
        chapter=1,
    )


@pytest.fixture
def diagnosis_api_authenticated_client(
    db, diagnosis_api_test_user, sample_organization, sample_facility
):
    """Provide authenticated API client for diagnosis API tests."""
    client = APIClient()
    ensure_staff_profile(diagnosis_api_test_user, sample_organization, sample_facility)
    client.force_authenticate(user=diagnosis_api_test_user)
    return client


# ============================================================================
# Diagnosis API Enhancement Tests
# ============================================================================


@pytest.mark.integration
class TestDiagnosisAPIEnhancements:
    """Test Diagnosis API includes new fields."""

    def test_create_diagnosis_with_certainty(
        self,
        diagnosis_api_authenticated_client,
        diagnosis_api_sample_encounter,
        diagnosis_api_sample_icd10_code,
    ):
        """Test creating diagnosis via API with certainty field."""
        data = {
            "icd10_code": diagnosis_api_sample_icd10_code.id,
            "diagnosis_type": "PRIMARY",
            "certainty": "provisional",
        }

        response = diagnosis_api_authenticated_client.post(
            f"/api/encounters/{diagnosis_api_sample_encounter.id}/diagnoses/",
            data,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["certainty"] == "provisional"

    def test_diagnosis_response_includes_certainty(
        self,
        diagnosis_api_authenticated_client,
        diagnosis_api_sample_encounter,
        diagnosis_api_sample_icd10_code,
    ):
        """Test diagnosis list response includes certainty field."""
        from hmis.apps.encounters.models import Diagnosis

        Diagnosis.objects.create(
            encounter=diagnosis_api_sample_encounter,
            icd10_code=diagnosis_api_sample_icd10_code,
            diagnosis_type="PRIMARY",
            certainty="suspected",
        )

        response = diagnosis_api_authenticated_client.get(
            f"/api/encounters/{diagnosis_api_sample_encounter.id}/diagnoses/"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert results[0]["certainty"] == "suspected"

    def test_diagnosis_response_includes_diagnosed_by(
        self,
        diagnosis_api_authenticated_client,
        diagnosis_api_sample_encounter,
        diagnosis_api_sample_icd10_code,
        diagnosis_api_test_user,
    ):
        """Test diagnosis response includes diagnosed_by info."""
        from hmis.apps.encounters.models import Diagnosis

        Diagnosis.objects.create(
            encounter=diagnosis_api_sample_encounter,
            icd10_code=diagnosis_api_sample_icd10_code,
            diagnosis_type="PRIMARY",
            diagnosed_by=diagnosis_api_test_user,
        )

        response = diagnosis_api_authenticated_client.get(
            f"/api/encounters/{diagnosis_api_sample_encounter.id}/diagnoses/"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert "diagnosed_by" in results[0]
