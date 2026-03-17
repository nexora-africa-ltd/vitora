"""
Tests for POST /api/ai/clinical/document/ — Clinical Document Generation.

Covers:
- Authentication requirement
- Input validation (document_type, patient_context, admission_context)
- Successful TibaBot calls with all document types
- Graceful degradation (fallback when TibaBot unavailable)
- Output format variations (markdown, structured, fhir)
- Audit logging
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_tibabot():
    """Yields a mock TibaBot client and patches get_tibabot_client."""
    with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


@pytest.fixture
def valid_request_data():
    """Minimal valid request body for clinical document generation."""
    return {
        "document_type": "discharge_summary",
        "patient_context": {
            "patient_age": 32,
            "patient_sex": "male",
        },
        "admission_context": {
            "primary_diagnosis": "Gonococcal urethritis",
        },
    }


@pytest.fixture
def full_request_data():
    """Fully populated request body for clinical document generation."""
    return {
        "document_type": "discharge_summary",
        "patient_context": {
            "patient_age": 32,
            "patient_sex": "male",
            "allergies": ["Sulfonamides"],
            "comorbidities": ["HIV"],
            "current_medications": ["TDF/3TC/DTG"],
            "facility_level": 4,
        },
        "admission_context": {
            "primary_diagnosis": "Gonococcal urethritis",
            "icd10_code": "A54.0",
            "secondary_diagnoses": ["HIV infection"],
            "admission_date": "2025-06-01",
            "discharge_date": "2025-06-04",
            "length_of_stay_days": 3,
            "ward": "Medical Ward",
            "discharge_type": "NORMAL",
            "procedures_performed": ["Urethral swab culture"],
            "medications_given": ["Ceftriaxone 500mg IM stat"],
            "discharge_medications": ["Doxycycline 100mg BD x 7 days"],
            "key_investigations": ["GC culture: positive"],
            "complications": [],
            "condition_at_discharge": "Stable, afebrile",
        },
        "encounter_context": {
            "chief_complaint": "Urethral discharge and dysuria for 5 days",
        },
        "facility_context": {
            "level": 4,
            "county": "Nairobi",
        },
        "output_format": "structured",
        "include_icd10_codes": True,
        "additional_instructions": "Emphasise partner notification",
    }


MOCK_TIBABOT_RESPONSE = {
    "document_type": "discharge_summary",
    "sections": [
        {
            "section_id": "patient_information",
            "title": "Patient Information",
            "content": "32-year-old male, HIV-positive on TDF/3TC/DTG...",
        },
        {
            "section_id": "hospital_course",
            "title": "Hospital Course",
            "content": "Patient admitted with 5-day history...",
        },
    ],
    "full_text": "## Patient Information\n32-year-old male...",
    "suggested_icd10_codes": [
        {
            "code": "A54.0",
            "description": "Gonococcal infection of lower genitourinary tract",
            "confidence": 0.95,
        },
    ],
    "safety_alerts": [],
    "has_safety_concerns": False,
    "citations": [
        {"source": "Kenya STI Treatment Guidelines 2024", "section": "Chapter 3"},
    ],
    "processing_time_ms": 3200,
    "model_used": "llama-3.3-70b-versatile",
    "disclaimer": "AI-generated clinical document. Must be reviewed.",
}


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestClinicalDocumentAuth:
    """POST /api/ai/clinical/document/ requires authentication."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_unauthenticated_returns_401(self, api_client, valid_request_data):
        response = api_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Feature flag gating
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestClinicalDocumentFeatureFlag:
    """Endpoint is hidden when TIBABOT_ENABLED is False."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client, valid_request_data):
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestClinicalDocumentValidation:
    """Request body validation for clinical document generation."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_missing_document_type(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            {
                "patient_context": {"patient_age": 30, "patient_sex": "M"},
                "admission_context": {"primary_diagnosis": "Malaria"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "document_type" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_invalid_document_type(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            {
                "document_type": "invalid_type",
                "patient_context": {"patient_age": 30, "patient_sex": "M"},
                "admission_context": {"primary_diagnosis": "Malaria"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "document_type" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_missing_patient_context(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            {
                "document_type": "discharge_summary",
                "admission_context": {"primary_diagnosis": "Malaria"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient_context" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_missing_admission_context(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            {
                "document_type": "discharge_summary",
                "patient_context": {"patient_age": 30, "patient_sex": "M"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "admission_context" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_missing_primary_diagnosis(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            {
                "document_type": "discharge_summary",
                "patient_context": {"patient_age": 30, "patient_sex": "M"},
                "admission_context": {},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_primary_diagnosis_too_short(self, authenticated_client):
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            {
                "document_type": "discharge_summary",
                "patient_context": {"patient_age": 30, "patient_sex": "M"},
                "admission_context": {"primary_diagnosis": "X"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_invalid_output_format(self, authenticated_client, valid_request_data):
        valid_request_data["output_format"] = "csv"
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "output_format" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_invalid_discharge_type(self, authenticated_client, valid_request_data):
        valid_request_data["admission_context"]["discharge_type"] = "INVALID"
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(TIBABOT_ENABLED=True)
    def test_patient_age_out_of_range(self, authenticated_client, valid_request_data):
        valid_request_data["patient_context"]["patient_age"] = -1
        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# TibaBot success
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestClinicalDocumentSuccess:
    """Successful clinical document generation via TibaBot."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_discharge_summary(self, authenticated_client, mock_tibabot, full_request_data):
        mock_tibabot.generate_clinical_document.return_value = MOCK_TIBABOT_RESPONSE.copy()

        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            full_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["document_type"] == "discharge_summary"
        assert len(response.data["sections"]) == 2
        assert response.data["sections"][0]["section_id"] == "patient_information"
        assert response.data["full_text"] != ""
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_soap_note(self, authenticated_client, mock_tibabot, valid_request_data):
        valid_request_data["document_type"] = "soap"
        mock_tibabot.generate_clinical_document.return_value = {
            **MOCK_TIBABOT_RESPONSE,
            "document_type": "soap",
        }

        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["document_type"] == "soap"
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_progress_note(self, authenticated_client, mock_tibabot, valid_request_data):
        valid_request_data["document_type"] = "progress_note"
        mock_tibabot.generate_clinical_document.return_value = {
            **MOCK_TIBABOT_RESPONSE,
            "document_type": "progress_note",
        }

        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["document_type"] == "progress_note"

    @override_settings(TIBABOT_ENABLED=True)
    def test_referral_letter(self, authenticated_client, mock_tibabot, valid_request_data):
        valid_request_data["document_type"] = "referral_letter"
        mock_tibabot.generate_clinical_document.return_value = {
            **MOCK_TIBABOT_RESPONSE,
            "document_type": "referral_letter",
        }

        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["document_type"] == "referral_letter"

    @override_settings(TIBABOT_ENABLED=True)
    def test_clerking_note(self, authenticated_client, mock_tibabot, valid_request_data):
        valid_request_data["document_type"] = "clerking_note"
        mock_tibabot.generate_clinical_document.return_value = {
            **MOCK_TIBABOT_RESPONSE,
            "document_type": "clerking_note",
        }

        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["document_type"] == "clerking_note"

    @override_settings(TIBABOT_ENABLED=True)
    def test_minimal_request(self, authenticated_client, mock_tibabot, valid_request_data):
        mock_tibabot.generate_clinical_document.return_value = MOCK_TIBABOT_RESPONSE.copy()

        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["mode"] == "tibabot"

    @override_settings(TIBABOT_ENABLED=True)
    def test_icd10_suggestions_returned(self, authenticated_client, mock_tibabot, full_request_data):
        mock_tibabot.generate_clinical_document.return_value = MOCK_TIBABOT_RESPONSE.copy()

        response = authenticated_client.post(
            "/api/ai/clinical/document/",
            full_request_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        codes = response.data["suggested_icd10_codes"]
        assert len(codes) == 1
        assert codes[0]["code"] == "A54.0"
        assert codes[0]["confidence"] == 0.95


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestClinicalDocumentFallback:
    """Graceful degradation when TibaBot is unavailable."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_returns_empty_template(self, authenticated_client, valid_request_data):
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.generate_clinical_document.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/document/",
                valid_request_data,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            assert response.data["document_type"] == "discharge_summary"
            assert response.data["full_text"] == ""
            assert len(response.data["sections"]) > 0

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_soap_has_correct_sections(self, authenticated_client, valid_request_data):
        from hmis.apps.ai.client import TibaBotUnavailableError

        valid_request_data["document_type"] = "soap"

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.generate_clinical_document.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/document/",
                valid_request_data,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            section_ids = [s["section_id"] for s in response.data["sections"]]
            assert "subjective" in section_ids
            assert "objective" in section_ids
            assert "assessment" in section_ids
            assert "plan" in section_ids

    @override_settings(TIBABOT_ENABLED=True)
    def test_fallback_referral_has_correct_sections(self, authenticated_client, valid_request_data):
        from hmis.apps.ai.client import TibaBotUnavailableError

        valid_request_data["document_type"] = "referral_letter"

        with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
            mock_client = MagicMock()
            mock_client.generate_clinical_document.side_effect = TibaBotUnavailableError("down")
            mock_get.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/document/",
                valid_request_data,
                format="json",
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.data["mode"] == "fallback"
            section_ids = [s["section_id"] for s in response.data["sections"]]
            assert "referral_to" in section_ids
            assert "reason_for_referral" in section_ids


# ---------------------------------------------------------------------------
# Audit Logging
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestClinicalDocumentAudit:
    """Audit logging for clinical document generation."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_audit_log_created(self, authenticated_client, mock_tibabot, valid_request_data):
        from hmis.apps.core.models import AuditLog

        mock_tibabot.generate_clinical_document.return_value = MOCK_TIBABOT_RESPONSE.copy()

        authenticated_client.post(
            "/api/ai/clinical/document/",
            valid_request_data,
            format="json",
        )

        log = AuditLog.objects.filter(action="ai_clinical_document_generate").last()
        assert log is not None
        assert log.details["document_type"] == "discharge_summary"
        assert log.details["output_format"] == "markdown"
