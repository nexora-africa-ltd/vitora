"""
Tests for AI context enrichment and Phase 2 clinical chat/assist endpoints.

Tests cover:
- Context enrichment helper (build_user_context, build_facility_context)
- Seniority inference from Role.hierarchy_level
- Clinical chat endpoint with context injection
- Clinical assist endpoint with context injection
- Graceful degradation when TibaBot is unavailable
- Audit logging for clinical chat/assist
- Serializer validation for new serializers
"""

from datetime import date
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status


# =============================================================================
# Context enrichment tests
# =============================================================================


class TestSeniorityMapping:
    """Tests for hierarchy_level → seniority label mapping."""

    def test_senior_levels(self):
        from hmis.apps.ai.context import _hierarchy_to_seniority

        assert _hierarchy_to_seniority(0) == "SENIOR"
        assert _hierarchy_to_seniority(1) == "SENIOR"
        assert _hierarchy_to_seniority(2) == "SENIOR"

    def test_mid_levels(self):
        from hmis.apps.ai.context import _hierarchy_to_seniority

        assert _hierarchy_to_seniority(3) == "MID"
        assert _hierarchy_to_seniority(4) == "MID"
        assert _hierarchy_to_seniority(5) == "MID"

    def test_junior_levels(self):
        from hmis.apps.ai.context import _hierarchy_to_seniority

        assert _hierarchy_to_seniority(6) == "JUNIOR"
        assert _hierarchy_to_seniority(10) == "JUNIOR"
        assert _hierarchy_to_seniority(99) == "JUNIOR"


@pytest.mark.django_db
class TestBuildUserContext:
    """Tests for build_user_context helper."""

    def test_returns_nulls_for_user_without_staff_profile(self, test_user):
        """Should return null role/seniority/specialization for basic users."""
        from hmis.apps.ai.context import build_user_context

        mock_request = MagicMock()
        mock_request.user = test_user

        ctx = build_user_context(mock_request)

        assert ctx["role"] is None
        assert ctx["seniority"] is None
        assert ctx["specialization"] is None

    def test_extracts_role_from_staff_profile(self, db):
        """Should extract role code and seniority from StaffProfile."""
        from django.contrib.auth import get_user_model

        from hmis.apps.ai.context import build_user_context
        from hmis.apps.core.models import Department, Role, StaffProfile

        User = get_user_model()
        user = User.objects.create_user(
            username="dr_test", email="dr@test.com", password="pass123"
        )

        dept = Department.objects.create(
            name="Medicine", code="MED", department_type="CLINICAL"
        )
        role = Role.objects.create(
            code="DOCTOR",
            name="Doctor",
            category="CLINICAL",
            hierarchy_level=1,
        )
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-100",
            primary_role=role,
            primary_department=dept,
            specialization="Cardiology",
            date_joined=date(2024, 1, 1),
        )

        mock_request = MagicMock()
        mock_request.user = user

        ctx = build_user_context(mock_request)

        assert ctx["role"] == "DOCTOR"
        assert ctx["seniority"] == "SENIOR"  # hierarchy_level=1 → SENIOR
        assert ctx["specialization"] == "Cardiology"

    def test_mid_seniority_from_hierarchy(self, db):
        """Should map hierarchy_level=4 to MID seniority."""
        from django.contrib.auth import get_user_model

        from hmis.apps.ai.context import build_user_context
        from hmis.apps.core.models import Department, Role, StaffProfile

        User = get_user_model()
        user = User.objects.create_user(
            username="nurse_test", email="nurse@test.com", password="pass123"
        )

        dept = Department.objects.create(
            name="Nursing", code="NUR", department_type="CLINICAL"
        )
        role = Role.objects.create(
            code="NURSE",
            name="Nurse",
            category="CLINICAL",
            hierarchy_level=4,
        )
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-101",
            primary_role=role,
            primary_department=dept,
            date_joined=date(2024, 1, 1),
        )

        mock_request = MagicMock()
        mock_request.user = user

        ctx = build_user_context(mock_request)

        assert ctx["role"] == "NURSE"
        assert ctx["seniority"] == "MID"


class TestBuildFacilityContext:
    """Tests for build_facility_context helper."""

    @override_settings(
        FACILITY_LEVEL="L4",
        FACILITY_COUNTY="Nairobi",
        FACILITY_HAS_ICU=True,
        FACILITY_HAS_LABORATORY=True,
        FACILITY_HAS_IMAGING=False,
        FACILITY_HAS_PHARMACY=True,
    )
    def test_reads_from_settings(self):
        """Should read all facility settings."""
        from hmis.apps.ai.context import build_facility_context

        ctx = build_facility_context()

        assert ctx["keph_level"] == "L4"
        assert ctx["county"] == "Nairobi"
        assert ctx["has_icu"] is True
        assert ctx["has_laboratory"] is True
        assert ctx["has_imaging"] is False
        assert ctx["has_pharmacy"] is True

    @override_settings(FACILITY_LEVEL="L3")
    def test_returns_nulls_for_unconfigured_capabilities(self):
        """Should return None for capability flags not set in settings."""
        from hmis.apps.ai.context import build_facility_context

        ctx = build_facility_context()

        assert ctx["keph_level"] == "L3"
        # These aren't configured in the test settings override
        assert ctx["has_icu"] is None
        assert ctx["has_laboratory"] is None
        assert ctx["has_imaging"] is None
        assert ctx["has_pharmacy"] is None


# =============================================================================
# Clinical Chat endpoint tests
# =============================================================================


@pytest.mark.django_db
class TestClinicalChatEndpoint:
    """Tests for POST /api/ai/clinical/chat/."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.post(
            "/api/ai/clinical/chat/",
            {"message": "What are the DDx for chest pain?"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/ai/clinical/chat/",
            {"message": "test"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_message_required(self, authenticated_client):
        """Should reject requests without a message."""
        response = authenticated_client.post(
            "/api/ai/clinical/chat/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "message" in response.data

    @override_settings(TIBABOT_ENABLED=True, FACILITY_LEVEL="L4")
    def test_enriches_with_user_and_facility_context(self, authenticated_client):
        """Should inject user_context and facility_context before forwarding."""
        mock_response = {
            "session_id": "sess-123",
            "message": {
                "role": "assistant",
                "content": "Based on the presentation...",
            },
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "DDx for chest pain?"},
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK

            # Verify the payload sent to TibaBot was enriched
            call_args = mock_client.clinical_chat.call_args[0][0]
            assert "user_context" in call_args
            assert "facility_context" in call_args
            assert call_args["facility_context"]["keph_level"] == "L4"

    @override_settings(TIBABOT_ENABLED=True)
    def test_graceful_degradation_when_unavailable(self, authenticated_client):
        """Should return fallback response when TibaBot is down."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.side_effect = TibaBotUnavailableError(
                "unavailable"
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "test question"},
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK
            assert "error" in response.data
            assert response.data["message"]["role"] == "assistant"

    @override_settings(TIBABOT_ENABLED=True)
    def test_audit_log_created(self, authenticated_client):
        """Should create audit log for clinical chat requests."""
        from hmis.apps.core.models import AuditLog

        mock_response = {
            "session_id": "sess-456",
            "message": {"role": "assistant", "content": "response"},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "test question for audit"},
                format="json",
            )

            log = AuditLog.objects.filter(action="ai_clinical_chat").first()
            assert log is not None
            assert log.resource_type == "AI"
            assert log.details["message_length"] > 0


# =============================================================================
# Clinical Assist endpoint tests
# =============================================================================


@pytest.mark.django_db
class TestClinicalAssistEndpoint:
    """Tests for POST /api/ai/clinical/assist/."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client):
        """Should return 404 when TIBABOT_ENABLED is False."""
        response = authenticated_client.post(
            "/api/ai/clinical/assist/",
            {"query": "DDx for this patient"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/ai/clinical/assist/",
            {"query": "test"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_validates_query_required(self, authenticated_client):
        """Should reject requests without a query."""
        response = authenticated_client.post(
            "/api/ai/clinical/assist/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "query" in response.data

    @override_settings(TIBABOT_ENABLED=True, FACILITY_LEVEL="L2")
    def test_enriches_with_context(self, authenticated_client):
        """Should inject user_context and facility_context."""
        mock_response = {
            "response": "For this presentation, consider...",
            "references": ["Kenya Clinical Guidelines 2022"],
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_assist.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/assist/",
                {
                    "query": "DDx for cough and fever",
                    "patient_context": {
                        "patient_age": 35,
                        "patient_sex": "M",
                    },
                    "verbosity": "detailed",
                },
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK

            # Verify enrichment
            call_args = mock_client.clinical_assist.call_args[0][0]
            assert call_args["user_context"] is not None
            assert call_args["facility_context"]["keph_level"] == "L2"
            assert call_args["verbosity"] == "detailed"

    @override_settings(TIBABOT_ENABLED=True)
    def test_graceful_degradation_when_unavailable(self, authenticated_client):
        """Should return fallback when TibaBot is down."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_assist.side_effect = TibaBotUnavailableError(
                "unavailable"
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/assist/",
                {"query": "DDx for headache"},
                format="json",
            )

            assert response.status_code == status.HTTP_200_OK
            assert "error" in response.data
            assert "unavailable" in response.data["response"].lower()

    @override_settings(TIBABOT_ENABLED=True)
    def test_audit_log_created(self, authenticated_client):
        """Should create audit log for clinical assist requests."""
        from hmis.apps.core.models import AuditLog

        mock_response = {
            "response": "Consider the following...",
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_assist.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/clinical/assist/",
                {
                    "query": "What workup for this patient?",
                    "patient_context": {
                        "patient_age": 50,
                        "patient_sex": "F",
                        "allergies": ["Penicillin"],
                    },
                },
                format="json",
            )

            log = AuditLog.objects.filter(action="ai_clinical_assist").first()
            assert log is not None
            assert log.details["has_patient_context"] is True
            assert log.details["verbosity"] == "standard"


# =============================================================================
# Serializer validation tests
# =============================================================================


class TestClinicalChatRequestSerializer:
    """Tests for ClinicalChatRequestSerializer."""

    def test_valid_minimal_request(self):
        from hmis.apps.ai.serializers import ClinicalChatRequestSerializer

        serializer = ClinicalChatRequestSerializer(
            data={"message": "What is the DDx for chest pain?"}
        )
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["message"] == "What is the DDx for chest pain?"

    def test_valid_with_session_id(self):
        from hmis.apps.ai.serializers import ClinicalChatRequestSerializer

        serializer = ClinicalChatRequestSerializer(
            data={"message": "Follow-up question", "session_id": "sess-123"}
        )
        assert serializer.is_valid(), serializer.errors

    def test_rejects_empty_message(self):
        from hmis.apps.ai.serializers import ClinicalChatRequestSerializer

        serializer = ClinicalChatRequestSerializer(data={"message": ""})
        assert not serializer.is_valid()
        assert "message" in serializer.errors


class TestClinicalAssistRequestSerializer:
    """Tests for ClinicalAssistRequestSerializer."""

    def test_valid_minimal_request(self):
        from hmis.apps.ai.serializers import ClinicalAssistRequestSerializer

        serializer = ClinicalAssistRequestSerializer(
            data={"query": "DDx for productive cough"}
        )
        assert serializer.is_valid(), serializer.errors

    def test_valid_with_full_context(self):
        from hmis.apps.ai.serializers import ClinicalAssistRequestSerializer

        serializer = ClinicalAssistRequestSerializer(
            data={
                "query": "DDx for headache",
                "patient_context": {
                    "patient_age": 45,
                    "patient_sex": "M",
                    "allergies": ["Penicillin"],
                    "comorbidities": ["Hypertension"],
                },
                "encounter_context": {
                    "chief_complaint": "Severe headache for 2 days",
                    "vitals": {"bp": "180/110", "pulse": 88},
                },
                "user_context": {
                    "role": "DOCTOR",
                    "seniority": "SENIOR",
                    "specialization": "Internal Medicine",
                },
                "facility_context": {
                    "keph_level": "L4",
                    "county": "Nairobi",
                    "has_icu": True,
                    "has_laboratory": True,
                    "has_imaging": True,
                    "has_pharmacy": True,
                },
                "verbosity": "detailed",
            }
        )
        assert serializer.is_valid(), serializer.errors

    def test_accepts_null_context_fields(self):
        from hmis.apps.ai.serializers import ClinicalAssistRequestSerializer

        serializer = ClinicalAssistRequestSerializer(
            data={
                "query": "DDx for cough",
                "user_context": {
                    "role": "NURSE",
                    "seniority": None,
                    "specialization": None,
                },
                "facility_context": {
                    "keph_level": "L3",
                    "county": None,
                    "has_icu": None,
                    "has_laboratory": None,
                    "has_imaging": None,
                    "has_pharmacy": None,
                },
            }
        )
        assert serializer.is_valid(), serializer.errors

    def test_rejects_empty_query(self):
        from hmis.apps.ai.serializers import ClinicalAssistRequestSerializer

        serializer = ClinicalAssistRequestSerializer(data={"query": ""})
        assert not serializer.is_valid()
        assert "query" in serializer.errors

    def test_invalid_verbosity(self):
        from hmis.apps.ai.serializers import ClinicalAssistRequestSerializer

        serializer = ClinicalAssistRequestSerializer(
            data={"query": "test", "verbosity": "ultra_verbose"}
        )
        assert not serializer.is_valid()
        assert "verbosity" in serializer.errors
