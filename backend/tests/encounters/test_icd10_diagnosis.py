"""
Tests for ICD-10 Diagnosis functionality.

Sprint 1.1-1.2: Encounter Management
TDD Focus: Test diagnosis code validation, lookup, and storage

Following TDD principles - these tests are written BEFORE implementation.
"""

from datetime import date

import pytest  # type: ignore
from django.core.exceptions import ValidationError

from tests.conftest import ensure_staff_profile

pytestmark = pytest.mark.django_db


# ============================================================================
# ICD-10 Code Model Tests
# ============================================================================


@pytest.mark.unit
class TestICD10CodeModel:
    """Test ICD-10 code storage and validation."""

    def test_create_icd10_code(self, db):
        """Test creating a valid ICD-10 code."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="A09",
            description="Infectious gastroenteritis and colitis, unspecified",
            category="Certain infectious and parasitic diseases",
            chapter=1,
        )

        assert code.id is not None
        assert code.code == "A09"
        assert code.description == "Infectious gastroenteritis and colitis, unspecified"
        assert code.chapter == 1

    def test_icd10_code_format_validation_valid(self, db):
        """Test valid ICD-10 code formats."""
        from hmis.apps.encounters.models import ICD10Code

        # Valid formats: Letter + 2 digits, or Letter + 2 digits + decimal + digit(s)
        valid_codes = ["A09", "B20", "J18.9", "K35.80", "M54.5"]
        for code_str in valid_codes:
            code = ICD10Code(
                code=code_str,
                description=f"Test code {code_str}",
                category="Test",
                chapter=1,
            )
            code.full_clean()  # Should not raise

    def test_icd10_code_format_validation_invalid(self, db):
        """Test invalid ICD-10 code formats are rejected."""
        from hmis.apps.encounters.models import ICD10Code

        invalid_codes = ["123", "AB12", "A", "A1", "A123456"]
        for code_str in invalid_codes:
            code = ICD10Code(
                code=code_str,
                description=f"Test invalid {code_str}",
                category="Test",
                chapter=1,
            )
            with pytest.raises(ValidationError):
                code.full_clean()

    def test_icd10_code_unique(self, db):
        """Test ICD-10 codes are unique."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(
            code="A09",
            description="First entry",
            category="Test",
            chapter=1,
        )

        with pytest.raises(Exception):  # IntegrityError
            ICD10Code.objects.create(
                code="A09",
                description="Duplicate entry",
                category="Test",
                chapter=1,
            )

    def test_icd10_code_string_representation(self, db):
        """Test string representation of ICD-10 code."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="J18.9",
            description="Pneumonia, unspecified organism",
            category="Diseases of the respiratory system",
            chapter=10,
        )

        assert str(code) == "J18.9 - Pneumonia, unspecified organism"

    def test_icd10_code_search_by_code(self, db):
        """Test searching ICD-10 codes by code."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(
            code="A09", description="Gastroenteritis", category="Infectious", chapter=1
        )
        ICD10Code.objects.create(
            code="A00", description="Cholera", category="Infectious", chapter=1
        )
        ICD10Code.objects.create(
            code="B20", description="HIV disease", category="Infectious", chapter=1
        )

        results = ICD10Code.objects.filter(code__icontains="A0")
        assert results.count() == 2

    def test_icd10_code_search_by_description(self, db):
        """Test searching ICD-10 codes by description."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(
            code="J18.9",
            description="Pneumonia, unspecified organism",
            category="Respiratory",
            chapter=10,
        )
        ICD10Code.objects.create(
            code="J12.9",
            description="Viral pneumonia, unspecified",
            category="Respiratory",
            chapter=10,
        )
        ICD10Code.objects.create(
            code="A09", description="Gastroenteritis", category="Infectious", chapter=1
        )

        results = ICD10Code.objects.filter(description__icontains="pneumonia")
        assert results.count() == 2


# ============================================================================
# Diagnosis Model Tests
# ============================================================================


@pytest.mark.unit
class TestDiagnosisModel:
    """Test Diagnosis model for encounter diagnoses."""

    def test_create_diagnosis_with_icd10_code(self, sample_encounter, sample_icd10_code):
        """Test creating a diagnosis linked to encounter and ICD-10 code."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            notes="Confirmed diagnosis",
        )

        assert diagnosis.id is not None
        assert diagnosis.encounter == sample_encounter
        assert diagnosis.icd10_code == sample_icd10_code
        assert diagnosis.diagnosis_type == "PRIMARY"

    def test_diagnosis_type_choices(self, sample_encounter, sample_icd10_code):
        """Test diagnosis type field accepts valid choices."""
        from hmis.apps.encounters.models import Diagnosis

        valid_types = ["PRIMARY", "SECONDARY", "DIFFERENTIAL", "WORKING"]
        for diag_type in valid_types:
            diagnosis = Diagnosis(
                encounter=sample_encounter,
                icd10_code=sample_icd10_code,
                diagnosis_type=diag_type,
            )
            diagnosis.full_clean()  # Should not raise

    def test_invalid_diagnosis_type_raises_error(self, sample_encounter, sample_icd10_code):
        """Test invalid diagnosis type raises validation error."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="INVALID",
        )
        with pytest.raises(ValidationError):
            diagnosis.full_clean()

    def test_diagnosis_string_representation(self, sample_encounter, sample_icd10_code):
        """Test string representation of diagnosis."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        assert sample_icd10_code.code in str(diagnosis)
        assert "PRIMARY" in str(diagnosis)

    def test_encounter_can_have_multiple_diagnoses(self, sample_encounter):
        """Test an encounter can have multiple diagnoses."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code1 = ICD10Code.objects.create(
            code="J18.9", description="Pneumonia", category="Respiratory", chapter=10
        )
        code2 = ICD10Code.objects.create(
            code="R50.9", description="Fever", category="Symptoms", chapter=18
        )

        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=code1,
            diagnosis_type="PRIMARY",
        )
        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=code2,
            diagnosis_type="SECONDARY",
        )

        assert sample_encounter.diagnoses.count() == 2

    def test_one_primary_diagnosis_per_encounter(self, sample_encounter, sample_icd10_code):
        """Test only one primary diagnosis allowed per encounter."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code2 = ICD10Code.objects.create(
            code="R50.9", description="Fever", category="Symptoms", chapter=18
        )

        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        # Attempting to add second primary should raise error
        diagnosis2 = Diagnosis(
            encounter=sample_encounter,
            icd10_code=code2,
            diagnosis_type="PRIMARY",
        )
        with pytest.raises(ValidationError):
            diagnosis2.full_clean()

    def test_diagnosis_ordering_by_type(self, sample_encounter):
        """Test diagnoses are ordered by type (PRIMARY first) using order_by_type_priority."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code1 = ICD10Code.objects.create(
            code="J18.9", description="Pneumonia", category="Respiratory", chapter=10
        )
        code2 = ICD10Code.objects.create(
            code="R50.9", description="Fever", category="Symptoms", chapter=18
        )
        code3 = ICD10Code.objects.create(
            code="A09", description="Gastro", category="Infectious", chapter=1
        )

        # Create in non-sorted order
        Diagnosis.objects.create(
            encounter=sample_encounter, icd10_code=code2, diagnosis_type="DIFFERENTIAL"
        )
        Diagnosis.objects.create(
            encounter=sample_encounter, icd10_code=code1, diagnosis_type="PRIMARY"
        )
        Diagnosis.objects.create(
            encounter=sample_encounter, icd10_code=code3, diagnosis_type="SECONDARY"
        )

        # Use the order_by_type_priority method for proper ordering
        diagnoses = list(Diagnosis.order_by_type_priority(sample_encounter.diagnoses.all()))
        assert diagnoses[0].diagnosis_type == "PRIMARY"
        assert diagnoses[1].diagnosis_type == "SECONDARY"
        assert diagnoses[2].diagnosis_type == "DIFFERENTIAL"

    def test_diagnosis_free_text_without_icd10(self, sample_encounter):
        """Test diagnosis can be entered as free text when ICD-10 code unknown."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=None,
            free_text_diagnosis="Suspected viral infection",
            diagnosis_type="WORKING",
        )

        assert diagnosis.id is not None
        assert diagnosis.free_text_diagnosis == "Suspected viral infection"
        assert diagnosis.icd10_code is None


# ============================================================================
# Diagnosis API Tests
# ============================================================================


@pytest.mark.integration
class TestDiagnosisAPI:
    """Test Diagnosis API endpoints."""

    def test_list_diagnoses_for_encounter(
        self, authenticated_client, sample_encounter, sample_icd10_code
    ):
        """Test GET /api/encounters/{id}/diagnoses/ - List diagnoses."""
        from hmis.apps.encounters.models import Diagnosis

        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        response = authenticated_client.get(f"/api/encounters/{sample_encounter.id}/diagnoses/")

        assert response.status_code == 200
        # Handle paginated response
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        assert len(results) == 1

    def test_create_diagnosis(self, authenticated_client, sample_encounter, sample_icd10_code):
        """Test POST /api/encounters/{id}/diagnoses/ - Create diagnosis."""
        data = {
            "icd10_code": sample_icd10_code.id,
            "diagnosis_type": "PRIMARY",
            "notes": "Confirmed by lab tests",
        }

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/diagnoses/",
            data,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["diagnosis_type"] == "PRIMARY"

    def test_search_icd10_codes(self, authenticated_client):
        """Test GET /api/icd10-codes/?search=term - Search ICD-10 codes."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(
            code="J18.9", description="Pneumonia, unspecified", category="Respiratory", chapter=10
        )
        ICD10Code.objects.create(
            code="J12.9", description="Viral pneumonia", category="Respiratory", chapter=10
        )
        ICD10Code.objects.create(
            code="A09", description="Gastroenteritis", category="Infectious", chapter=1
        )

        response = authenticated_client.get("/api/icd10-codes/?search=pneumonia")

        assert response.status_code == 200
        assert len(response.data["results"]) == 2

    def test_delete_diagnosis(self, authenticated_client, sample_encounter, sample_icd10_code):
        """Test DELETE /api/encounters/{id}/diagnoses/{diagnosis_id}/ - Delete diagnosis."""
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import Permission

        from hmis.apps.encounters.models import Diagnosis

        User = get_user_model()

        # Grant delete permission to the authenticated user
        user = authenticated_client.handler._force_user
        perm = Permission.objects.get(codename="delete_diagnosis")
        user.user_permissions.add(perm)
        # Re-fetch to clear perm cache; re-authenticate to use fresh instance
        user = User.objects.get(pk=user.pk)
        authenticated_client.force_authenticate(user=user)

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        response = authenticated_client.delete(
            f"/api/encounters/{sample_encounter.id}/diagnoses/{diagnosis.id}/"
        )

        assert response.status_code == 204
        assert not Diagnosis.objects.filter(id=diagnosis.id).exists()


# ============================================================================
# Encounter with Diagnoses Tests
# ============================================================================


@pytest.mark.unit
class TestEncounterWithDiagnoses:
    """Test Encounter model integration with diagnoses."""

    def test_encounter_get_primary_diagnosis(self, sample_encounter):
        """Test getting primary diagnosis from encounter."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code = ICD10Code.objects.create(
            code="J18.9", description="Pneumonia", category="Respiratory", chapter=10
        )
        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=code,
            diagnosis_type="PRIMARY",
        )

        primary = sample_encounter.get_primary_diagnosis()
        assert primary is not None
        assert primary.icd10_code.code == "J18.9"

    def test_encounter_get_all_diagnosis_codes(self, sample_encounter):
        """Test getting all diagnosis codes as comma-separated string."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code1 = ICD10Code.objects.create(
            code="J18.9", description="Pneumonia", category="Respiratory", chapter=10
        )
        code2 = ICD10Code.objects.create(
            code="R50.9", description="Fever", category="Symptoms", chapter=18
        )

        Diagnosis.objects.create(
            encounter=sample_encounter, icd10_code=code1, diagnosis_type="PRIMARY"
        )
        Diagnosis.objects.create(
            encounter=sample_encounter, icd10_code=code2, diagnosis_type="SECONDARY"
        )

        codes = sample_encounter.get_diagnosis_codes_display()
        assert "J18.9" in codes
        assert "R50.9" in codes


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_patient(db, sample_organization):
    """Create a sample patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        date_of_birth=date(1990, 5, 15),
        gender="M",
        organization=sample_organization,
    )


@pytest.fixture
def sample_encounter(db, sample_patient, sample_facility):
    """Create a sample encounter for testing."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Fever and cough",
        facility=sample_facility,
    )


@pytest.fixture
def sample_icd10_code(db):
    """Create a sample ICD-10 code for testing."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="J18.9",
        description="Pneumonia, unspecified organism",
        category="Diseases of the respiratory system",
        chapter=10,
    )


@pytest.fixture
def authenticated_client(db, sample_organization, sample_facility):
    """Provide authenticated API client."""
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    User = get_user_model()
    user = User.objects.create_user(username="diaguser", password="testpass123")
    client = APIClient()
    ensure_staff_profile(user, sample_organization, sample_facility)
    client.force_authenticate(user=user)
    return client
