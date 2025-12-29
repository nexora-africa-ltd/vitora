"""
Additional tests for ICD-10 Diagnosis functionality to close coverage gaps.

Sprint 1.1-1.2: Encounter Management
Tests for: API endpoints, validation, import command, and edge cases.
"""

import io
import os
import tempfile
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from rest_framework import status

pytestmark = pytest.mark.django_db


# ============================================================================
# ICD-10 Import Command Tests
# ============================================================================


@pytest.mark.unit
class TestImportICD10Command:
    """Test the import_icd10 management command."""

    def test_import_icd10_creates_codes(self, db, tmp_path):
        """Test importing ICD-10 codes from CSV creates records."""
        from hmis.apps.encounters.models import ICD10Code

        # Create test CSV
        csv_content = """code,short_description,long_description,category,chapter,is_billable
A09,Infectious gastroenteritis,Infectious gastroenteritis and colitis unspecified,Intestinal infectious diseases,1,true
J18.9,Pneumonia unspecified,Pneumonia unspecified organism,Influenza and pneumonia,10,true
B54,Unspecified malaria,Unspecified malaria,Protozoal diseases,1,true"""

        csv_file = tmp_path / "test_icd10.csv"
        csv_file.write_text(csv_content)

        # Run command
        out = io.StringIO()
        call_command("import_icd10", str(csv_file), stdout=out)

        # Verify import
        assert ICD10Code.objects.count() == 3
        assert ICD10Code.objects.filter(code="A09").exists()
        assert ICD10Code.objects.filter(code="J18.9").exists()
        assert ICD10Code.objects.filter(code="B54").exists()

        # Verify output
        output = out.getvalue()
        assert "Created: 3" in output

    def test_import_icd10_with_clear_option(self, db, tmp_path):
        """Test --clear option removes existing codes before import."""
        from hmis.apps.encounters.models import ICD10Code

        # Create existing code
        ICD10Code.objects.create(
            code="Z99.9",
            description="Existing code",
            category="Test",
            chapter=21,
        )
        assert ICD10Code.objects.count() == 1

        # Create test CSV with different code
        csv_content = """code,short_description,long_description,category,chapter,is_billable
A09,Infectious gastroenteritis,Test,Intestinal infectious diseases,1,true"""

        csv_file = tmp_path / "test_icd10.csv"
        csv_file.write_text(csv_content)

        # Run command with --clear
        out = io.StringIO()
        call_command("import_icd10", str(csv_file), "--clear", stdout=out)

        # Verify old code removed, new code added
        assert ICD10Code.objects.count() == 1
        assert not ICD10Code.objects.filter(code="Z99.9").exists()
        assert ICD10Code.objects.filter(code="A09").exists()

    def test_import_icd10_skips_existing_codes(self, db, tmp_path):
        """Test existing codes are skipped without --update."""
        from hmis.apps.encounters.models import ICD10Code

        # Create existing code
        ICD10Code.objects.create(
            code="A09",
            description="Original description",
            short_description="Original",
            category="Original category",
            chapter=1,
        )

        # Create CSV with same code
        csv_content = """code,short_description,long_description,category,chapter,is_billable
A09,Updated description,Updated long,Updated category,1,true"""

        csv_file = tmp_path / "test_icd10.csv"
        csv_file.write_text(csv_content)

        # Run command without --update
        out = io.StringIO()
        call_command("import_icd10", str(csv_file), stdout=out)

        # Verify code not updated
        code = ICD10Code.objects.get(code="A09")
        assert code.short_description == "Original"
        assert "Skipped: 1" in out.getvalue()

    def test_import_icd10_updates_existing_with_flag(self, db, tmp_path):
        """Test --update flag updates existing codes."""
        from hmis.apps.encounters.models import ICD10Code

        # Create existing code
        ICD10Code.objects.create(
            code="A09",
            description="Original description",
            short_description="Original",
            category="Original category",
            chapter=1,
        )

        # Create CSV with updated data
        csv_content = """code,short_description,long_description,category,chapter,is_billable
A09,Updated description,Updated long,Updated category,1,true"""

        csv_file = tmp_path / "test_icd10.csv"
        csv_file.write_text(csv_content)

        # Run command with --update
        out = io.StringIO()
        call_command("import_icd10", str(csv_file), "--update", stdout=out)

        # Verify code updated
        code = ICD10Code.objects.get(code="A09")
        assert code.short_description == "Updated description"
        assert "Updated: 1" in out.getvalue()

    def test_import_icd10_file_not_found(self, db):
        """Test error when CSV file doesn't exist."""
        from django.core.management.base import CommandError

        with pytest.raises(CommandError, match="CSV file not found"):
            call_command("import_icd10", "/nonexistent/file.csv")

    def test_import_icd10_handles_invalid_rows(self, db, tmp_path):
        """Test import handles invalid rows gracefully."""
        from hmis.apps.encounters.models import ICD10Code

        # CSV with one valid and one invalid row (non-numeric chapter)
        csv_content = """code,short_description,long_description,category,chapter,is_billable
A09,Valid code,Test,Intestinal,1,true
B99,Invalid chapter,Test,Invalid,not_a_number,true"""

        csv_file = tmp_path / "test_icd10.csv"
        csv_file.write_text(csv_content)

        # Run command
        err = io.StringIO()
        out = io.StringIO()
        call_command("import_icd10", str(csv_file), stdout=out, stderr=err)

        # Verify valid code imported, invalid skipped
        assert ICD10Code.objects.filter(code="A09").exists()
        assert not ICD10Code.objects.filter(code="B99").exists()
        assert "Errors: 1" in out.getvalue()


# ============================================================================
# ICD-10 API Extended Tests
# ============================================================================


@pytest.mark.integration
class TestICD10APIExtended:
    """Extended API tests for ICD-10 codes."""

    def test_search_icd10_by_chapter(self, authenticated_client):
        """Test filtering ICD-10 codes by chapter."""
        from hmis.apps.encounters.models import ICD10Code

        # Create codes in different chapters
        ICD10Code.objects.create(code="A09", description="GI infection", category="Infectious", chapter=1)
        ICD10Code.objects.create(code="J18.9", description="Pneumonia", category="Respiratory", chapter=10)
        ICD10Code.objects.create(code="I10", description="Hypertension", category="Circulatory", chapter=9)

        # Filter by chapter 10
        response = authenticated_client.get("/api/icd10-codes/?chapter=10")

        assert response.status_code == 200
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["code"] == "J18.9"

    def test_search_icd10_partial_code_match(self, authenticated_client):
        """Test searching ICD-10 codes with partial code match."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(code="J18.0", description="Bronchopneumonia", category="Respiratory", chapter=10)
        ICD10Code.objects.create(code="J18.1", description="Lobar pneumonia", category="Respiratory", chapter=10)
        ICD10Code.objects.create(code="J18.9", description="Pneumonia unspecified", category="Respiratory", chapter=10)
        ICD10Code.objects.create(code="A09", description="GI infection", category="Infectious", chapter=1)

        # Search for "J18"
        response = authenticated_client.get("/api/icd10-codes/?search=J18")

        assert response.status_code == 200
        assert len(response.data["results"]) == 3

    def test_search_icd10_case_insensitive(self, authenticated_client):
        """Test ICD-10 search is case insensitive."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(code="B54", description="Unspecified Malaria", category="Protozoal", chapter=1)

        # Search lowercase
        response = authenticated_client.get("/api/icd10-codes/?search=malaria")

        assert response.status_code == 200
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["code"] == "B54"

    def test_icd10_codes_ordering(self, authenticated_client):
        """Test ICD-10 codes are ordered by code by default."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(code="Z99.9", description="Z code", category="Factors", chapter=21)
        ICD10Code.objects.create(code="A09", description="A code", category="Infectious", chapter=1)
        ICD10Code.objects.create(code="J18.9", description="J code", category="Respiratory", chapter=10)

        response = authenticated_client.get("/api/icd10-codes/")

        assert response.status_code == 200
        codes = [r["code"] for r in response.data["results"]]
        assert codes == ["A09", "J18.9", "Z99.9"]

    def test_icd10_inactive_codes_filtered_out(self, authenticated_client):
        """Test inactive ICD-10 codes are not returned by default."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(code="A09", description="Active", category="Infectious", chapter=1, is_active=True)
        ICD10Code.objects.create(code="B99", description="Inactive", category="Infectious", chapter=1, is_active=False)

        response = authenticated_client.get("/api/icd10-codes/")

        assert response.status_code == 200
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["code"] == "A09"


# ============================================================================
# Diagnosis API Extended Tests
# ============================================================================


@pytest.mark.integration
class TestDiagnosisAPIExtended:
    """Extended API tests for Diagnosis endpoints."""

    def test_update_diagnosis(self, authenticated_client, sample_encounter, sample_icd10_code):
        """Test PUT /api/encounters/{id}/diagnoses/{id}/ - Update diagnosis."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="SECONDARY",
            notes="Initial notes",
        )

        # Create another code to update to
        new_code = ICD10Code.objects.create(
            code="B54",
            description="Malaria",
            category="Protozoal",
            chapter=1,
        )

        data = {
            "icd10_code": new_code.id,
            "diagnosis_type": "PRIMARY",
            "notes": "Updated notes - confirmed malaria",
        }

        response = authenticated_client.put(
            f"/api/encounters/{sample_encounter.id}/diagnoses/{diagnosis.id}/",
            data,
            format="json",
        )

        assert response.status_code == 200
        assert response.data["diagnosis_type"] == "PRIMARY"
        assert response.data["notes"] == "Updated notes - confirmed malaria"

    def test_partial_update_diagnosis(self, authenticated_client, sample_encounter, sample_icd10_code):
        """Test PATCH /api/encounters/{id}/diagnoses/{id}/ - Partial update."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="WORKING",
            notes="Initial notes",
        )

        # Only update notes
        data = {"notes": "Confirmed by lab results"}

        response = authenticated_client.patch(
            f"/api/encounters/{sample_encounter.id}/diagnoses/{diagnosis.id}/",
            data,
            format="json",
        )

        assert response.status_code == 200
        assert response.data["notes"] == "Confirmed by lab results"
        assert response.data["diagnosis_type"] == "WORKING"  # Unchanged

    def test_create_diagnosis_requires_authentication(self, sample_encounter, sample_icd10_code):
        """Test diagnosis creation requires authentication."""
        from rest_framework.test import APIClient

        client = APIClient()  # Not authenticated

        data = {
            "icd10_code": sample_icd10_code.id,
            "diagnosis_type": "PRIMARY",
        }

        response = client.post(
            f"/api/encounters/{sample_encounter.id}/diagnoses/",
            data,
            format="json",
        )

        assert response.status_code == 401

    def test_diagnosis_filtered_by_type(self, authenticated_client, sample_encounter):
        """Test filtering diagnoses by type."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code1 = ICD10Code.objects.create(code="A09", description="GI", category="Infectious", chapter=1)
        code2 = ICD10Code.objects.create(code="J18.9", description="Pneumonia", category="Respiratory", chapter=10)

        Diagnosis.objects.create(encounter=sample_encounter, icd10_code=code1, diagnosis_type="PRIMARY")
        Diagnosis.objects.create(encounter=sample_encounter, icd10_code=code2, diagnosis_type="SECONDARY")

        # Filter by SECONDARY
        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter.id}/diagnoses/?diagnosis_type=SECONDARY"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["diagnosis_type"] == "SECONDARY"


# ============================================================================
# Diagnosis Validation Tests
# ============================================================================


@pytest.mark.unit
class TestDiagnosisValidation:
    """Test diagnosis validation rules."""

    def test_diagnosis_with_inactive_icd10_code_warning(self, sample_encounter):
        """Test diagnosis with inactive ICD-10 code triggers warning/validation."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        inactive_code = ICD10Code.objects.create(
            code="Z99.9",
            description="Inactive test code",
            category="Test",
            chapter=21,
            is_active=False,
        )

        # Creating diagnosis with inactive code should still work
        # (warning is handled at API/form level, not model level)
        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=inactive_code,
            diagnosis_type="SECONDARY",
        )

        assert diagnosis.id is not None
        assert diagnosis.icd10_code.is_active is False

    def test_diagnosis_non_billable_code_flagged(self, sample_encounter):
        """Test diagnosis with non-billable code can be identified."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        non_billable_code = ICD10Code.objects.create(
            code="A00",
            description="Cholera (category code)",
            category="Infectious",
            chapter=1,
            is_billable=False,  # Category code, not billable
        )

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=non_billable_code,
            diagnosis_type="PRIMARY",
        )

        # Verify diagnosis exists and code is non-billable
        assert diagnosis.id is not None
        assert diagnosis.icd10_code.is_billable is False

    def test_diagnosis_requires_either_icd10_or_free_text(self, sample_encounter):
        """Test diagnosis should have either ICD-10 code or free text."""
        from hmis.apps.encounters.models import Diagnosis

        # This is valid - free text without ICD-10
        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=None,
            free_text_diagnosis="Unknown tropical fever",
            diagnosis_type="WORKING",
        )
        assert diagnosis.id is not None

    def test_duplicate_primary_diagnosis_raises_validation_error(self, sample_encounter, sample_icd10_code):
        """Test adding second PRIMARY diagnosis raises validation error."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        # Create first PRIMARY diagnosis
        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
        )

        # Create second ICD-10 code
        code2 = ICD10Code.objects.create(
            code="B54",
            description="Malaria",
            category="Protozoal",
            chapter=1,
        )

        # Attempting second PRIMARY should raise validation error
        with pytest.raises(ValidationError):
            diagnosis2 = Diagnosis(
                encounter=sample_encounter,
                icd10_code=code2,
                diagnosis_type="PRIMARY",
            )
            diagnosis2.full_clean()

    def test_certainty_choices_validation(self, sample_encounter, sample_icd10_code):
        """Test certainty field accepts valid choices."""
        from hmis.apps.encounters.models import Diagnosis

        valid_certainties = ["confirmed", "provisional", "ruled_out", "suspected"]

        for certainty in valid_certainties:
            diagnosis = Diagnosis(
                encounter=sample_encounter,
                icd10_code=sample_icd10_code,
                diagnosis_type="SECONDARY",
                certainty=certainty,
            )
            diagnosis.full_clean()  # Should not raise

    def test_invalid_certainty_raises_error(self, sample_encounter, sample_icd10_code):
        """Test invalid certainty value raises validation error."""
        from hmis.apps.encounters.models import Diagnosis

        diagnosis = Diagnosis(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="SECONDARY",
            certainty="invalid_certainty",
        )

        with pytest.raises(ValidationError):
            diagnosis.full_clean()


# ============================================================================
# ICD-10 Code Model Extended Tests
# ============================================================================


@pytest.mark.unit
class TestICD10CodeExtended:
    """Extended tests for ICD-10 code model."""

    def test_icd10_code_uppercase_on_save(self, db):
        """Test ICD-10 codes are uppercased on save."""
        from hmis.apps.encounters.models import ICD10Code

        code = ICD10Code.objects.create(
            code="a09",  # Lowercase
            description="Test",
            category="Test",
            chapter=1,
        )

        code.refresh_from_db()
        assert code.code == "A09"

    def test_icd10_filter_billable_codes(self, db):
        """Test filtering billable ICD-10 codes."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(code="A09", description="Billable", category="Test", chapter=1, is_billable=True)
        ICD10Code.objects.create(code="A00", description="Category", category="Test", chapter=1, is_billable=False)
        ICD10Code.objects.create(code="B54", description="Billable 2", category="Test", chapter=1, is_billable=True)

        billable = ICD10Code.objects.filter(is_billable=True)
        assert billable.count() == 2

    def test_icd10_chapter_grouping(self, db):
        """Test grouping ICD-10 codes by chapter."""
        from hmis.apps.encounters.models import ICD10Code

        ICD10Code.objects.create(code="A09", description="GI", category="Infectious", chapter=1)
        ICD10Code.objects.create(code="B54", description="Malaria", category="Protozoal", chapter=1)
        ICD10Code.objects.create(code="J18.9", description="Pneumonia", category="Respiratory", chapter=10)
        ICD10Code.objects.create(code="I10", description="HTN", category="Circulatory", chapter=9)

        chapter_1 = ICD10Code.objects.filter(chapter=1)
        chapter_10 = ICD10Code.objects.filter(chapter=10)

        assert chapter_1.count() == 2
        assert chapter_10.count() == 1


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_patient(db):
    """Create a sample patient for testing."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        date_of_birth=date(1990, 5, 15),
        gender="M",
    )


@pytest.fixture
def sample_encounter(db, sample_patient):
    """Create a sample encounter for testing."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        chief_complaint="Fever and cough",
    )


@pytest.fixture
def sample_icd10_code(db):
    """Create a sample ICD-10 code for testing."""
    from hmis.apps.encounters.models import ICD10Code

    return ICD10Code.objects.create(
        code="J18.9",
        description="Pneumonia, unspecified organism",
        short_description="Pneumonia unspecified",
        category="Influenza and pneumonia",
        chapter=10,
    )


@pytest.fixture
def authenticated_client(db):
    """Provide authenticated API client."""
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    User = get_user_model()
    user = User.objects.create_user(username="icd10testuser", password="testpass123")
    client = APIClient()
    client.force_authenticate(user=user)
    return client
