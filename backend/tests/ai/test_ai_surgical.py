"""
Tests for AI Surgical Assistant endpoints.

Covers:
- Feature flag gating (master + per-feature)
- Authentication requirement
- Successful TibaBot response passthrough
- Result persistence for pre-op, checklist, and post-op flows
- Stored results retrieval endpoints
- Surgical procedure proxy list/detail endpoints
"""

from datetime import date, time
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

from hmis.apps.ai.models import (
    AISurgicalChecklistSessionResult,
    AISurgicalPostOpCarePlanResult,
    AISurgicalPreOpAssessResult,
)


@pytest.fixture
def mock_tibabot():
    """Yields a mock TibaBot client and patches get_tibabot_client."""
    with patch("hmis.apps.ai.views.get_tibabot_client") as mock_get:
        mock_client = MagicMock()
        mock_get.return_value = mock_client
        yield mock_client


@pytest.fixture
def surgical_procedure(sample_organization, sample_facility):
    from hmis.apps.procedures.models import ProcedureCatalog

    return ProcedureCatalog.objects.create(
        code="GS-APP",
        name="Appendectomy",
        tibabot_procedure_key="appendectomy",
        category="SURGICAL",
        body_system="DIGESTIVE",
        risk_level="MEDIUM",
        typical_duration_minutes=60,
        consent_required=True,
        requires_anesthesia=True,
        anesthesia_type="GENERAL",
        base_fee=25000,
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def surgical_theatre(sample_organization, sample_facility):
    from hmis.apps.theatre.models import OperatingTheatre

    return OperatingTheatre.objects.create(
        code="OT-01",
        name="Operating Theatre 1",
        theatre_type="GENERAL",
        location="Main Block",
        operating_hours_start=time(8, 0),
        operating_hours_end=time(18, 0),
        slot_duration_minutes=30,
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def sample_surgery_case(
    sample_patient,
    sample_encounter,
    surgical_procedure,
    surgical_theatre,
    test_user,
    sample_organization,
    sample_facility,
):
    from hmis.apps.theatre.models import SurgeryCase

    return SurgeryCase.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        primary_procedure=surgical_procedure,
        theatre=surgical_theatre,
        scheduled_date=date.today(),
        scheduled_start_time=time(9, 0),
        estimated_duration_minutes=60,
        priority="ELECTIVE",
        diagnosis="Acute appendicitis",
        asa_class="II",
        requesting_doctor=test_user,
        organization=sample_organization,
        facility=sample_facility,
    )


PRE_OP_PAYLOAD = {
    "procedure_key": "appendectomy",
    "age": 42,
    "sex": "female",
    "asa_class": "II",
    "urgency": "elective",
    "high_risk_surgery": False,
    "ischemic_heart_disease": False,
    "congestive_heart_failure": False,
    "cerebrovascular_disease": False,
    "insulin_dependent_diabetes": False,
    "creatinine_above_2": False,
    "caprini_factors": ["age_41_60", "major_surgery_over_45_min"],
    "mallampati_class": "II",
    "facility_level": "H4",
    "include_fhir": False,
}

PRE_OP_RESPONSE = {
    "risk_scores": {
        "asa": {"classification": "II", "risk_level": "low"},
        "rcri": {"score": 0, "risk_level": "low"},
        "caprini": {"score": 3, "risk_level": "moderate"},
        "mallampati": {"classification": "II", "risk_level": "low"},
        "overall_risk_level": "moderate",
        "alerts": ["Caprini VTE score 3"],
        "recommendations": ["Mechanical prophylaxis if pharmacologic contraindicated"],
    },
    "facility_capable": True,
    "facility_alert": None,
    "cds_alerts": [],
    "fhir_risk_assessment": None,
}

CHECKLIST_START_RESPONSE = {
    "session": {
        "session_id": "surg-session-123",
        "state": "sign_in",
        "items": [
            {
                "id": "SI-01",
                "phase": "sign_in",
                "description": "Patient has confirmed identity",
                "responsible": "nurse",
                "checked": False,
                "checked_by": None,
                "notes": None,
                "critical": True,
            },
            {
                "id": "SI-02",
                "phase": "sign_in",
                "description": "Surgical site marked",
                "responsible": "surgeon",
                "checked": False,
                "checked_by": None,
                "notes": None,
                "critical": True,
            },
        ],
    },
    "message": "WHO SIGN IN",
    "phase_complete": False,
    "unchecked_critical_items": ["SI-01"],
}

CHECKLIST_ADVANCE_RESPONSE = {
    "session": {
        "session_id": "surg-session-123",
        "state": "time_out",
        "items": [
            {
                "id": "TO-01",
                "phase": "time_out",
                "description": "All team members introduced",
                "responsible": "nurse",
                "checked": False,
                "checked_by": None,
                "notes": None,
                "critical": False,
            },
            {
                "id": "TO-02",
                "phase": "time_out",
                "description": "Patient name and procedure confirmed",
                "responsible": "surgeon",
                "checked": False,
                "checked_by": None,
                "notes": None,
                "critical": True,
            },
        ],
    },
    "message": "WHO TIME OUT",
    "phase_complete": True,
    "unchecked_critical_items": [],
}

CHECKLIST_STATUS_RESPONSE = {
    "progress": {
        "current_phase": "time_out",
        "total_items": 19,
        "total_checked": 7,
        "percent_complete": 36.8,
    }
}

POST_OP_RESPONSE = {
    "procedure_key": "appendectomy",
    "procedure_name": "Open Appendectomy",
    "surgical_apgar": {
        "score": 9,
        "risk_level": "low",
        "complication_rate": "4%",
    },
    "monitoring": "Vitals q15min x 4.",
    "medications": ["Paracetamol 1g q6h"],
    "activity": "Ambulate within 24h.",
    "nutrition": "Sips of water 6h post-op.",
    "wound_care": "Keep wound clean and dry.",
    "complications_to_watch": [],
    "discharge_criteria": ["Afebrile for 24 hours"],
    "follow_up": {"timing": "Review in 7-10 days", "actions": ["Wound check"]},
    "cds_alerts": [],
    "fhir_care_plan": None,
}

PROCEDURES_RESPONSE = {
    "results": [
        {
            "key": "appendectomy",
            "display_name": "Open Appendectomy",
            "specialty": "general_surgery",
            "min_facility_level": "H4",
            "urgency_categories": ["elective", "urgent", "emergency"],
            "icd10_code": "K35.80",
        }
    ]
}

PROCEDURE_DETAIL_RESPONSE = {
    "key": "appendectomy",
    "display_name": "Open Appendectomy",
    "specialty": "general_surgery",
    "min_facility_level": "H4",
    "urgency_categories": ["elective", "urgent", "emergency"],
    "icd10_code": "K35.80",
}


@pytest.mark.django_db
class TestAISurgicalFeatureFlags:
    @override_settings(TIBABOT_ENABLED=False)
    def test_master_flag_off_returns_404(self, authenticated_client, sample_surgery_case):
        response = authenticated_client.post(
            "/api/ai/surgical/pre-op/assess/",
            {"surgery_case_id": sample_surgery_case.id, **PRE_OP_PAYLOAD},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True, TIBABOT_ENABLE_SURGICAL_ASSISTANT=False)
    def test_feature_flag_off_returns_404(self, authenticated_client, sample_surgery_case):
        response = authenticated_client.post(
            "/api/ai/surgical/pre-op/assess/",
            {"surgery_case_id": sample_surgery_case.id, **PRE_OP_PAYLOAD},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestAISurgicalAuth:
    @override_settings(TIBABOT_ENABLED=True)
    def test_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/ai/surgical/procedures/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAISurgicalPreOp:
    @override_settings(TIBABOT_ENABLED=True)
    def test_pre_op_assessment_persists_result(
        self, authenticated_client, mock_tibabot, sample_surgery_case
    ):
        mock_tibabot.assess_surgical_pre_op.return_value = PRE_OP_RESPONSE.copy()

        response = authenticated_client.post(
            "/api/ai/surgical/pre-op/assess/",
            {"surgery_case_id": sample_surgery_case.id, **PRE_OP_PAYLOAD},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["risk_scores"]["overall_risk_level"] == "moderate"
        assert "stored_id" in response.data
        stored = AISurgicalPreOpAssessResult.objects.get(surgery_case=sample_surgery_case)
        assert stored.overall_risk_level == "moderate"
        assert stored.facility_capable is True

    @override_settings(TIBABOT_ENABLED=True)
    def test_pre_op_results_list_returns_saved_results(
        self, authenticated_client, mock_tibabot, sample_surgery_case
    ):
        mock_tibabot.assess_surgical_pre_op.return_value = PRE_OP_RESPONSE.copy()
        authenticated_client.post(
            "/api/ai/surgical/pre-op/assess/",
            {"surgery_case_id": sample_surgery_case.id, **PRE_OP_PAYLOAD},
            format="json",
        )

        response = authenticated_client.get(
            f"/api/ai/results/surgical/pre-op-assessments/?surgery_case_id={sample_surgery_case.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["overall_risk_level"] == "moderate"


@pytest.mark.django_db
class TestAISurgicalChecklist:
    @override_settings(TIBABOT_ENABLED=True)
    def test_checklist_start_and_advance_persist_snapshots(
        self, authenticated_client, mock_tibabot, sample_surgery_case
    ):
        mock_tibabot.start_surgical_checklist.return_value = CHECKLIST_START_RESPONSE.copy()
        start_response = authenticated_client.post(
            "/api/ai/surgical/checklist/start/",
            {
                "surgery_case_id": sample_surgery_case.id,
                "procedure_key": "appendectomy",
                "patient_id": str(sample_surgery_case.patient_id),
            },
            format="json",
        )

        assert start_response.status_code == status.HTTP_200_OK
        assert start_response.data["tibabot_session_id"] == "surg-session-123"
        assert (
            AISurgicalChecklistSessionResult.objects.filter(
                surgery_case=sample_surgery_case
            ).count()
            == 1
        )

        mock_tibabot.advance_surgical_checklist.return_value = CHECKLIST_ADVANCE_RESPONSE.copy()
        advance_response = authenticated_client.post(
            "/api/ai/surgical/checklist/surg-session-123/advance/",
            {
                "checked_items": ["SI-01", "SI-02"],
                "notes": {"SI-02": "Confirmed"},
                "checked_by": "Nurse Amina",
            },
            format="json",
        )

        assert advance_response.status_code == status.HTTP_200_OK
        assert advance_response.data["session"]["state"] == "time_out"
        assert (
            AISurgicalChecklistSessionResult.objects.filter(
                surgery_case=sample_surgery_case
            ).count()
            == 2
        )

    @override_settings(TIBABOT_ENABLED=True)
    def test_checklist_status_passthrough(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_surgical_checklist_status.return_value = CHECKLIST_STATUS_RESPONSE.copy()

        response = authenticated_client.get("/api/ai/surgical/checklist/surg-session-123/status/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["progress"]["current_phase"] == "time_out"

    @override_settings(TIBABOT_ENABLED=True)
    def test_checklist_results_list_returns_saved_results(
        self, authenticated_client, mock_tibabot, sample_surgery_case
    ):
        mock_tibabot.start_surgical_checklist.return_value = CHECKLIST_START_RESPONSE.copy()
        authenticated_client.post(
            "/api/ai/surgical/checklist/start/",
            {
                "surgery_case_id": sample_surgery_case.id,
                "procedure_key": "appendectomy",
                "patient_id": str(sample_surgery_case.patient_id),
            },
            format="json",
        )

        response = authenticated_client.get(
            f"/api/ai/results/surgical/checklist-sessions/?surgery_case_id={sample_surgery_case.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["tibabot_session_id"] == "surg-session-123"


@pytest.mark.django_db
class TestAISurgicalPostOp:
    @override_settings(TIBABOT_ENABLED=True)
    def test_post_op_care_plan_persists_result(
        self, authenticated_client, mock_tibabot, sample_surgery_case
    ):
        mock_tibabot.generate_surgical_post_op_care_plan.return_value = POST_OP_RESPONSE.copy()

        response = authenticated_client.post(
            "/api/ai/surgical/post-op/care-plan/",
            {
                "surgery_case_id": sample_surgery_case.id,
                "procedure_key": "appendectomy",
                "estimated_blood_loss_ml": 50,
                "lowest_heart_rate": 68,
                "lowest_map": 72,
                "findings": "Gangrenous appendix, no perforation",
                "drain_placed": False,
                "caprini_score": 2,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["surgical_apgar"]["score"] == 9
        stored = AISurgicalPostOpCarePlanResult.objects.get(surgery_case=sample_surgery_case)
        assert stored.procedure_key == "appendectomy"
        assert stored.surgical_apgar_score == 9

    @override_settings(TIBABOT_ENABLED=True)
    def test_post_op_results_list_returns_saved_results(
        self, authenticated_client, mock_tibabot, sample_surgery_case
    ):
        mock_tibabot.generate_surgical_post_op_care_plan.return_value = POST_OP_RESPONSE.copy()
        authenticated_client.post(
            "/api/ai/surgical/post-op/care-plan/",
            {
                "surgery_case_id": sample_surgery_case.id,
                "procedure_key": "appendectomy",
            },
            format="json",
        )

        response = authenticated_client.get(
            f"/api/ai/results/surgical/post-op-care-plans/?surgery_case_id={sample_surgery_case.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["procedure_key"] == "appendectomy"


@pytest.mark.django_db
class TestAISurgicalProcedureProxy:
    @override_settings(TIBABOT_ENABLED=True)
    def test_list_surgical_procedures(self, authenticated_client, mock_tibabot):
        mock_tibabot.list_surgical_procedures.return_value = PROCEDURES_RESPONSE.copy()

        response = authenticated_client.get("/api/ai/surgical/procedures/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"][0]["key"] == "appendectomy"

    @override_settings(TIBABOT_ENABLED=True)
    def test_get_surgical_procedure_detail(self, authenticated_client, mock_tibabot):
        mock_tibabot.get_surgical_procedure.return_value = PROCEDURE_DETAIL_RESPONSE.copy()

        response = authenticated_client.get("/api/ai/surgical/procedures/appendectomy/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["display_name"] == "Open Appendectomy"


@pytest.mark.django_db
class TestAISurgicalMappingExposure:
    def test_theatre_case_detail_includes_mapped_tibabot_key(
        self, authenticated_client, sample_surgery_case
    ):
        response = authenticated_client.get(
            f"/api/theatre/cases/{sample_surgery_case.case_number}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["primary_procedure_tibabot_key"] == "appendectomy"
