"""
Tests for AI Advisory → Order Link feature.

Covers:
- _extract_suggestions helper (unit)
- AIAdvisoryOrderLink model constraints
- AIAdvisoryOrderLinkListView (GET list, POST seed)
- AIAdvisoryOrderLinkActionView (PATCH action)
- AIAdvisoryHasOrdersView (GET has-orders)
- Auto-matching signals (LabOrderItem, ImagingOrderItem, PrescriptionItem)
- _fuzzy_match helper
"""

import uuid
from datetime import date, time, timedelta

import pytest  # type: ignore
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework import status

from hmis.apps.ai.models import (
    AIAdvisoryOrderLink,
    AIAdvisoryOrderLinkStatus,
    AISurgicalPostOpCarePlanResult,
    AISurgicalPreOpAssessResult,
)
from hmis.apps.ai.signals import _fuzzy_match, _tokenize
from hmis.apps.ai.views import _extract_suggestions
from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem, ImagingProcedure
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog
from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem
from hmis.apps.procedures.models import ProcedureCatalog
from hmis.apps.theatre.models import OperatingTheatre, SurgeryCase

# =============================================================================
# Shared fixtures
# =============================================================================

SAMPLE_PRE_OP_RESULT_DATA = {
    "medications": ["Paracetamol 1g q6h", "Ceftriaxone 2g IV preop"],
    "pre_op_checklist": {
        "consent": "Written informed consent",
        "investigations": ["Full blood count", "Renal function tests"],
        "preparation": ["NPO from midnight"],
    },
    "required_equipment": ["Laparoscopic tower", "Harmonic scalpel"],
    "complications_watchlist": [
        {
            "complication": "Wound infection",
            "incidence": "5%",
            "signs": "Redness",
            "action": "Antibiotics",
        },
        {
            "complication": "Bleeding",
            "incidence": "2%",
            "signs": "Hypotension",
            "action": "Blood transfusion",
        },
    ],
    "discharge_criteria": ["Pain controlled", "Tolerating oral intake"],
    "follow_up": {
        "appointment": "Review in 2 weeks",
        "red_flags": ["Fever >38.5°C", "Persistent vomiting"],
    },
    "procedure_template": {},
    "risk_scores": {"asa": {"classification": "II"}},
}

SAMPLE_POST_OP_RESULT_DATA = {
    "medications": ["Ibuprofen 400mg TDS", "Omeprazole 20mg OD"],
    "monitoring": "Hourly vitals for 4 hours",
    "activity": "Bed rest for 6 hours, then mobilise",
    "nutrition": "Clear fluids once awake, light diet by evening",
    "wound_care": "Keep wound dry for 48 hours",
    "complications_to_watch": [
        {"complication": "DVT", "signs": "Calf swelling"},
    ],
    "discharge_criteria": ["Aldrete score ≥9", "Pain <4/10"],
    "follow_up": {
        "appointment": "Clinic in 10 days",
        "red_flags": ["Shortness of breath", "Chest pain"],
    },
    "surgical_apgar": {"score": 7, "risk_level": "moderate"},
}


@pytest.fixture
def procedure_catalog(sample_organization, sample_facility):
    return ProcedureCatalog.objects.create(
        code="GS-ADVLINK",
        name="Cholecystectomy",
        tibabot_procedure_key="cholecystectomy",
        category="SURGICAL",
        body_system="DIGESTIVE",
        risk_level="MEDIUM",
        typical_duration_minutes=90,
        consent_required=True,
        requires_anesthesia=True,
        anesthesia_type="GENERAL",
        base_fee=30000,
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def theatre(sample_organization, sample_facility):
    return OperatingTheatre.objects.create(
        code="OT-ADVLINK",
        name="Theatre Adv-Link",
        theatre_type="GENERAL",
        location="Main Block",
        operating_hours_start=time(7, 0),
        operating_hours_end=time(20, 0),
        slot_duration_minutes=30,
        is_active=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def surgery_case(
    sample_patient,
    sample_encounter,
    procedure_catalog,
    theatre,
    test_user,
    sample_organization,
    sample_facility,
):
    return SurgeryCase.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        primary_procedure=procedure_catalog,
        theatre=theatre,
        scheduled_date=date.today(),
        scheduled_start_time=time(9, 0),
        estimated_duration_minutes=90,
        priority="ELECTIVE",
        diagnosis="Cholelithiasis",
        asa_class="II",
        requesting_doctor=test_user,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def pre_op_result(surgery_case, test_user, sample_organization, sample_facility):
    return AISurgicalPreOpAssessResult.objects.create(
        surgery_case=surgery_case,
        created_by=test_user,
        request_data={"procedure_key": "cholecystectomy"},
        result_data=SAMPLE_PRE_OP_RESULT_DATA,
        overall_risk_level="moderate",
        facility_capable=True,
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def post_op_result(surgery_case, test_user, sample_organization, sample_facility):
    return AISurgicalPostOpCarePlanResult.objects.create(
        surgery_case=surgery_case,
        created_by=test_user,
        request_data={"procedure_key": "cholecystectomy"},
        result_data=SAMPLE_POST_OP_RESULT_DATA,
        procedure_key="cholecystectomy",
        surgical_apgar_score=7,
        risk_level="moderate",
        organization=sample_organization,
        facility=sample_facility,
    )


@pytest.fixture
def pre_op_ct():
    return ContentType.objects.get_for_model(AISurgicalPreOpAssessResult)


@pytest.fixture
def post_op_ct():
    return ContentType.objects.get_for_model(AISurgicalPostOpCarePlanResult)


@pytest.fixture
def suggested_link(pre_op_result, pre_op_ct, sample_organization, sample_facility):
    return AIAdvisoryOrderLink.objects.create(
        ai_result_content_type=pre_op_ct,
        ai_result_id=pre_op_result.pk,
        suggestion_category="medications",
        suggestion_index=0,
        suggestion_text="Paracetamol 1g q6h",
        status=AIAdvisoryOrderLinkStatus.SUGGESTED,
        organization=sample_organization,
        facility=sample_facility,
    )


# =============================================================================
# _extract_suggestions unit tests
# =============================================================================


@pytest.mark.django_db
class TestExtractSuggestions:
    """Unit tests for the _extract_suggestions helper."""

    def test_extracts_medications(self):
        data = {"medications": ["Drug A", "Drug B"]}
        result = _extract_suggestions(data)
        assert ("medications", 0, "Drug A") in result
        assert ("medications", 1, "Drug B") in result

    def test_extracts_investigations(self):
        data = {"pre_op_checklist": {"investigations": ["CBC", "RFT"]}}
        result = _extract_suggestions(data)
        assert ("pre_op_checklist.investigations", 0, "CBC") in result
        assert ("pre_op_checklist.investigations", 1, "RFT") in result

    def test_extracts_required_equipment(self):
        data = {"required_equipment": ["Suction unit", "Cautery"]}
        result = _extract_suggestions(data)
        assert ("required_equipment", 0, "Suction unit") in result

    def test_extracts_complications_from_dict(self):
        data = {"complications_to_watch": [{"complication": "Bleeding"}]}
        result = _extract_suggestions(data)
        assert ("complications_to_watch", 0, "Bleeding") in result

    def test_extracts_complications_from_watchlist_key(self):
        data = {"complications_watchlist": [{"complication": "Infection"}]}
        result = _extract_suggestions(data)
        assert ("complications_to_watch", 0, "Infection") in result

    def test_extracts_discharge_criteria(self):
        data = {"discharge_criteria": ["Pain controlled", "Mobile"]}
        result = _extract_suggestions(data)
        assert ("discharge_criteria", 0, "Pain controlled") in result
        assert ("discharge_criteria", 1, "Mobile") in result

    def test_extracts_follow_up_red_flags(self):
        data = {"follow_up": {"red_flags": ["Fever", "Bleeding"]}}
        result = _extract_suggestions(data)
        assert ("follow_up.red_flags", 0, "Fever") in result
        assert ("follow_up.red_flags", 1, "Bleeding") in result

    def test_extracts_post_op_care_medications(self):
        data = {"post_op_care": {"medications": ["Paracetamol", "Metoclopramide"]}}
        result = _extract_suggestions(data)
        assert ("post_op_care.medications", 0, "Paracetamol") in result

    def test_extracts_single_text_fields(self):
        data = {
            "monitoring": "Hourly vitals",
            "activity": "Bed rest",
            "nutrition": "Clear fluids",
            "wound_care": "Keep dry",
        }
        result = _extract_suggestions(data)
        assert ("monitoring", 0, "Hourly vitals") in result
        assert ("activity", 0, "Bed rest") in result
        assert ("nutrition", 0, "Clear fluids") in result
        assert ("wound_care", 0, "Keep dry") in result

    def test_skips_empty_strings(self):
        data = {"medications": ["", "  ", "Valid"]}
        result = _extract_suggestions(data)
        assert len(result) == 1
        assert result[0] == ("medications", 2, "Valid")

    def test_skips_non_list_medications(self):
        data = {"medications": "not a list"}
        result = _extract_suggestions(data)
        med_items = [s for s in result if s[0] == "medications"]
        assert len(med_items) == 0

    def test_empty_data_returns_empty(self):
        assert _extract_suggestions({}) == []

    def test_full_pre_op_data_extraction(self):
        """Verify we get expected count from realistic pre-op data."""
        result = _extract_suggestions(SAMPLE_PRE_OP_RESULT_DATA)
        categories = {s[0] for s in result}
        assert "medications" in categories
        assert "pre_op_checklist.investigations" in categories
        assert "required_equipment" in categories
        assert "complications_to_watch" in categories
        assert "discharge_criteria" in categories
        assert "follow_up.red_flags" in categories
        # 2 meds + 2 investigations + 2 equipment + 2 complications + 2 discharge + 2 red_flags = 12
        assert len(result) == 12

    def test_full_post_op_data_extraction(self):
        """Verify we get expected count from realistic post-op data."""
        result = _extract_suggestions(SAMPLE_POST_OP_RESULT_DATA)
        categories = {s[0] for s in result}
        assert "medications" in categories
        assert "monitoring" in categories
        assert "activity" in categories
        assert "nutrition" in categories
        assert "wound_care" in categories
        assert "complications_to_watch" in categories
        assert "discharge_criteria" in categories
        assert "follow_up.red_flags" in categories
        # 2 meds + 1 monitoring + 1 activity + 1 nutrition + 1 wound_care
        # + 1 complication + 2 discharge + 2 red_flags = 11
        assert len(result) == 11


# =============================================================================
# _fuzzy_match / _tokenize unit tests
# =============================================================================


class TestFuzzyMatch:
    """Unit tests for the fuzzy-matching helpers in signals."""

    def test_tokenize_strips_short_words(self):
        assert _tokenize("a CBC test") == {"cbc", "test"}

    def test_tokenize_lowercases(self):
        assert _tokenize("FULL Blood Count") == {"full", "blood", "count"}

    def test_exact_substring_match(self):
        assert _fuzzy_match("Full blood count", "Full blood count with differential") is True

    def test_reverse_substring_match(self):
        assert _fuzzy_match("Full blood count with differential", "Full blood count") is True

    def test_case_insensitive_substring(self):
        assert _fuzzy_match("CBC", "cbc") is True

    def test_word_overlap_match(self):
        assert _fuzzy_match("Complete blood count", "Full blood count CBC") is True

    def test_no_match(self):
        assert _fuzzy_match("Chest X-Ray", "Full blood count") is False

    def test_empty_strings(self):
        assert _fuzzy_match("", "") is True  # "" in "" is True

    def test_partial_overlap_below_threshold(self):
        # Only 1 of 4 words overlap → 0.25 < 0.4
        assert _fuzzy_match("Alpha beta gamma delta", "Delta epsilon zeta eta") is False


# =============================================================================
# Model constraint tests
# =============================================================================


@pytest.mark.django_db
class TestAdvisoryOrderLinkModel:
    """Tests for AIAdvisoryOrderLink model and constraints."""

    def test_create_link(self, suggested_link):
        assert suggested_link.pk is not None
        assert suggested_link.status == "SUGGESTED"
        assert suggested_link.suggestion_text == "Paracetamol 1g q6h"

    def test_unique_constraint_prevents_duplicates(
        self,
        pre_op_result,
        pre_op_ct,
        sample_organization,
        sample_facility,
    ):
        AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=pre_op_ct,
            ai_result_id=pre_op_result.pk,
            suggestion_category="medications",
            suggestion_index=0,
            suggestion_text="First",
            organization=sample_organization,
            facility=sample_facility,
        )
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            AIAdvisoryOrderLink.objects.create(
                ai_result_content_type=pre_op_ct,
                ai_result_id=pre_op_result.pk,
                suggestion_category="medications",
                suggestion_index=0,
                suggestion_text="Duplicate",
                organization=sample_organization,
                facility=sample_facility,
            )

    def test_different_index_allowed(
        self,
        pre_op_result,
        pre_op_ct,
        sample_organization,
        sample_facility,
    ):
        link0 = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=pre_op_ct,
            ai_result_id=pre_op_result.pk,
            suggestion_category="medications",
            suggestion_index=0,
            suggestion_text="Drug A",
            organization=sample_organization,
            facility=sample_facility,
        )
        link1 = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=pre_op_ct,
            ai_result_id=pre_op_result.pk,
            suggestion_category="medications",
            suggestion_index=1,
            suggestion_text="Drug B",
            organization=sample_organization,
            facility=sample_facility,
        )
        assert link0.pk != link1.pk

    def test_generic_fk_resolves(self, suggested_link, pre_op_result):
        assert suggested_link.ai_result == pre_op_result


# =============================================================================
# API: GET /api/ai/advisory-links/?ai_result_id=...
# =============================================================================


@pytest.mark.django_db
class TestAdvisoryLinkListGet:
    """Tests for GET /api/ai/advisory-links/."""

    URL = "/api/ai/advisory-links/"

    def test_returns_empty_without_param(self, authenticated_client):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_returns_links_for_result(
        self,
        authenticated_client,
        suggested_link,
        pre_op_result,
    ):
        response = authenticated_client.get(self.URL, {"ai_result_id": str(pre_op_result.pk)})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["suggestion_text"] == "Paracetamol 1g q6h"
        assert response.data[0]["status"] == "SUGGESTED"

    def test_returns_empty_for_unknown_id(self, authenticated_client):
        response = authenticated_client.get(self.URL, {"ai_result_id": str(uuid.uuid4())})
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# API: POST /api/ai/advisory-links/ (seed)
# =============================================================================


@pytest.mark.django_db
class TestAdvisoryLinkSeed:
    """Tests for POST /api/ai/advisory-links/ (seed suggestions)."""

    URL = "/api/ai/advisory-links/"

    def test_seed_pre_op_creates_links(
        self,
        authenticated_client,
        pre_op_result,
    ):
        response = authenticated_client.post(
            self.URL,
            {
                "ai_result_id": str(pre_op_result.pk),
                "ai_result_type": "pre_op_assessment",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created"] == 12  # from SAMPLE_PRE_OP_RESULT_DATA
        assert response.data["total"] == 12
        assert len(response.data["links"]) == 12

    def test_seed_post_op_creates_links(
        self,
        authenticated_client,
        post_op_result,
    ):
        response = authenticated_client.post(
            self.URL,
            {
                "ai_result_id": str(post_op_result.pk),
                "ai_result_type": "post_op_care_plan",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created"] == 11  # from SAMPLE_POST_OP_RESULT_DATA
        assert response.data["total"] == 11

    def test_seed_is_idempotent(
        self,
        authenticated_client,
        pre_op_result,
    ):
        """Second seed call should create 0 new links."""
        payload = {
            "ai_result_id": str(pre_op_result.pk),
            "ai_result_type": "pre_op_assessment",
        }
        r1 = authenticated_client.post(self.URL, payload, format="json")
        assert r1.status_code == status.HTTP_201_CREATED
        assert r1.data["created"] == 12

        r2 = authenticated_client.post(self.URL, payload, format="json")
        assert r2.status_code == status.HTTP_200_OK
        assert r2.data["created"] == 0
        assert r2.data["total"] == 12

    def test_seed_unknown_result_id_returns_404(self, authenticated_client):
        response = authenticated_client.post(
            self.URL,
            {
                "ai_result_id": str(uuid.uuid4()),
                "ai_result_type": "pre_op_assessment",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_seed_invalid_type_returns_400(self, authenticated_client, pre_op_result):
        response = authenticated_client.post(
            self.URL,
            {
                "ai_result_id": str(pre_op_result.pk),
                "ai_result_type": "invalid_type",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_seed_unauthenticated_rejected(self, api_client, pre_op_result):
        response = api_client.post(
            self.URL,
            {
                "ai_result_id": str(pre_op_result.pk),
                "ai_result_type": "pre_op_assessment",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_seed_links_have_correct_categories(
        self,
        authenticated_client,
        pre_op_result,
    ):
        response = authenticated_client.post(
            self.URL,
            {
                "ai_result_id": str(pre_op_result.pk),
                "ai_result_type": "pre_op_assessment",
            },
            format="json",
        )
        categories = {link["suggestion_category"] for link in response.data["links"]}
        assert "medications" in categories
        assert "pre_op_checklist.investigations" in categories
        assert "required_equipment" in categories
        assert "complications_to_watch" in categories
        assert "discharge_criteria" in categories
        assert "follow_up.red_flags" in categories


# =============================================================================
# API: PATCH /api/ai/advisory-links/<id>/action/
# =============================================================================


@pytest.mark.django_db
class TestAdvisoryLinkAction:
    """Tests for PATCH /api/ai/advisory-links/<id>/action/."""

    def _url(self, pk):
        return f"/api/ai/advisory-links/{pk}/action/"

    def test_decline_link(self, authenticated_client, suggested_link):
        response = authenticated_client.patch(
            self._url(suggested_link.pk),
            {"status": "DECLINED"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DECLINED"
        suggested_link.refresh_from_db()
        assert suggested_link.status == "DECLINED"
        assert suggested_link.actioned_by is not None
        assert suggested_link.actioned_at is not None

    def test_mark_not_applicable(self, authenticated_client, suggested_link):
        response = authenticated_client.patch(
            self._url(suggested_link.pk),
            {"status": "NOT_APPLICABLE"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "NOT_APPLICABLE"

    def test_mark_ordered_with_lab_order(
        self,
        authenticated_client,
        suggested_link,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        response = authenticated_client.patch(
            self._url(suggested_link.pk),
            {"status": "ORDERED", "lab_order_id": lab_order.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ORDERED"
        assert response.data["lab_order_id"] == lab_order.pk

    def test_ordered_without_order_fk_rejected(
        self,
        authenticated_client,
        suggested_link,
    ):
        response = authenticated_client.patch(
            self._url(suggested_link.pk),
            {"status": "ORDERED"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_ordered_with_multiple_order_fks_rejected(
        self,
        authenticated_client,
        suggested_link,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        prescription = Prescription.objects.create(
            patient=sample_patient,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=7),
            organization=sample_organization,
            facility=sample_facility,
        )
        response = authenticated_client.patch(
            self._url(suggested_link.pk),
            {
                "status": "ORDERED",
                "lab_order_id": lab_order.pk,
                "prescription_id": prescription.pk,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_not_found_returns_404(self, authenticated_client):
        response = authenticated_client.patch(
            self._url(99999),
            {"status": "DECLINED"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_rejected(self, api_client, suggested_link):
        response = api_client.patch(
            self._url(suggested_link.pk),
            {"status": "DECLINED"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_decline_clears_order_fk(
        self,
        authenticated_client,
        suggested_link,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        """When declining a previously-ordered link, order FKs should clear."""
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        # First mark as ordered
        authenticated_client.patch(
            self._url(suggested_link.pk),
            {"status": "ORDERED", "lab_order_id": lab_order.pk},
            format="json",
        )
        # Then decline
        response = authenticated_client.patch(
            self._url(suggested_link.pk),
            {"status": "DECLINED"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        suggested_link.refresh_from_db()
        assert suggested_link.lab_order_id is None

    def test_order_number_denormalized(
        self,
        authenticated_client,
        suggested_link,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        response = authenticated_client.patch(
            self._url(suggested_link.pk),
            {"status": "ORDERED", "lab_order_id": lab_order.pk},
            format="json",
        )
        assert response.data["order_number"] == lab_order.order_number


# =============================================================================
# API: GET /api/ai/advisory-links/has-orders/?ai_result_id=...
# =============================================================================


@pytest.mark.django_db
class TestAdvisoryHasOrders:
    """Tests for GET /api/ai/advisory-links/has-orders/."""

    URL = "/api/ai/advisory-links/has-orders/"

    def test_returns_false_with_no_links(self, authenticated_client, pre_op_result):
        response = authenticated_client.get(self.URL, {"ai_result_id": str(pre_op_result.pk)})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_orders"] is False

    def test_returns_false_without_param(self, authenticated_client):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_orders"] is False

    def test_returns_false_for_draft_order(
        self,
        authenticated_client,
        suggested_link,
        pre_op_result,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        """Draft lab orders should not count."""
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            status="DRAFT",
            organization=sample_organization,
            facility=sample_facility,
        )
        suggested_link.status = AIAdvisoryOrderLinkStatus.ORDERED
        suggested_link.lab_order = lab_order
        suggested_link.save()

        response = authenticated_client.get(self.URL, {"ai_result_id": str(pre_op_result.pk)})
        assert response.data["has_orders"] is False

    def test_returns_true_for_ordered_non_draft(
        self,
        authenticated_client,
        suggested_link,
        pre_op_result,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            status="ORDERED",
            organization=sample_organization,
            facility=sample_facility,
        )
        suggested_link.status = AIAdvisoryOrderLinkStatus.ORDERED
        suggested_link.lab_order = lab_order
        suggested_link.save()

        response = authenticated_client.get(self.URL, {"ai_result_id": str(pre_op_result.pk)})
        assert response.data["has_orders"] is True

    def test_returns_false_for_declined_links(
        self,
        authenticated_client,
        suggested_link,
        pre_op_result,
    ):
        suggested_link.status = AIAdvisoryOrderLinkStatus.DECLINED
        suggested_link.save()

        response = authenticated_client.get(self.URL, {"ai_result_id": str(pre_op_result.pk)})
        assert response.data["has_orders"] is False

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Auto-matching signal tests
# =============================================================================


@pytest.mark.django_db
class TestAutoMatchLabOrderItem:
    """Tests for auto_match_lab_order_item signal."""

    def test_auto_matches_lab_item_to_investigation(
        self,
        pre_op_result,
        pre_op_ct,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        # Create a SUGGESTED link for "Full blood count"
        link = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=pre_op_ct,
            ai_result_id=pre_op_result.pk,
            suggestion_category="pre_op_checklist.investigations",
            suggestion_index=0,
            suggestion_text="Full blood count",
            organization=sample_organization,
            facility=sample_facility,
        )

        # Create a lab order + item with a matching test name
        test_catalog = TestCatalog.objects.create(
            code="FBC-001",
            name="Full Blood Count",
            short_name="FBC",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="PANEL",
        )
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        # Signal fires on save
        LabOrderItem.objects.create(
            lab_order=lab_order,
            test=test_catalog,
            unit_cost=0,
        )

        link.refresh_from_db()
        assert link.status == AIAdvisoryOrderLinkStatus.ORDERED
        assert link.lab_order_id == lab_order.pk
        assert link.actioned_at is not None

    def test_no_match_for_unrelated_test(
        self,
        pre_op_result,
        pre_op_ct,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        link = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=pre_op_ct,
            ai_result_id=pre_op_result.pk,
            suggestion_category="pre_op_checklist.investigations",
            suggestion_index=0,
            suggestion_text="Liver function tests",
            organization=sample_organization,
            facility=sample_facility,
        )

        test_catalog = TestCatalog.objects.create(
            code="XR-001",
            name="Chest X-Ray PA",
            short_name="CXR",
            category="OTHER",
            specimen_type="OTHER",
            result_type="TEXT",
        )
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        LabOrderItem.objects.create(
            lab_order=lab_order,
            test=test_catalog,
            unit_cost=0,
        )

        link.refresh_from_db()
        assert link.status == AIAdvisoryOrderLinkStatus.SUGGESTED  # unchanged

    def test_no_match_without_surgery_case(
        self,
        pre_op_ct,
        sample_patient,
        test_user,
        sample_organization,
        sample_facility,
    ):
        """If encounter has no surgery case, nothing happens."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Unrelated",
            organization=sample_organization,
            facility=sample_facility,
        )
        test_catalog = TestCatalog.objects.create(
            code="MISC-001",
            name="Random Test",
            short_name="RT",
            category="OTHER",
            specimen_type="OTHER",
            result_type="TEXT",
        )
        lab_order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=encounter,
            ordered_by=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        # Should not raise
        LabOrderItem.objects.create(
            lab_order=lab_order,
            test=test_catalog,
            unit_cost=0,
        )


@pytest.mark.django_db
class TestAutoMatchImagingOrderItem:
    """Tests for auto_match_imaging_order_item signal."""

    def test_auto_matches_imaging_to_investigation(
        self,
        pre_op_result,
        pre_op_ct,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        link = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=pre_op_ct,
            ai_result_id=pre_op_result.pk,
            suggestion_category="pre_op_checklist.investigations",
            suggestion_index=0,
            suggestion_text="Abdominal ultrasound",
            organization=sample_organization,
            facility=sample_facility,
        )

        procedure = ImagingProcedure.objects.create(
            code="US-ABD-01",
            name="Abdominal Ultrasound",
            modality="US",
            body_region="ABDOMEN",
        )
        imaging_order = ImagingOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            clinical_indication="Pre-op evaluation",
        )
        ImagingOrderItem.objects.create(
            order=imaging_order,
            procedure=procedure,
        )

        link.refresh_from_db()
        assert link.status == AIAdvisoryOrderLinkStatus.ORDERED
        assert link.imaging_order_id == imaging_order.pk


@pytest.mark.django_db
class TestAutoMatchPrescriptionItem:
    """Tests for auto_match_prescription_item signal."""

    def test_auto_matches_prescription_to_medication(
        self,
        post_op_result,
        post_op_ct,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        link = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=post_op_ct,
            ai_result_id=post_op_result.pk,
            suggestion_category="medications",
            suggestion_index=0,
            suggestion_text="Ibuprofen 400mg TDS",
            organization=sample_organization,
            facility=sample_facility,
        )

        drug = Drug.objects.create(
            code="IBU-400",
            generic_name="Ibuprofen",
            form="TABLET",
            strength="400mg",
            unit="tablet",
        )
        prescription = Prescription.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=7),
            organization=sample_organization,
            facility=sample_facility,
        )
        PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=21,
            dosage="1 tablet",
            frequency="Three times daily",
            duration="7 days",
        )

        link.refresh_from_db()
        assert link.status == AIAdvisoryOrderLinkStatus.ORDERED
        assert link.prescription_id == prescription.pk

    def test_auto_match_only_matches_first_link(
        self,
        post_op_result,
        post_op_ct,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        """Only the first matching SUGGESTED link gets matched (break)."""
        link1 = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=post_op_ct,
            ai_result_id=post_op_result.pk,
            suggestion_category="medications",
            suggestion_index=0,
            suggestion_text="Omeprazole 20mg daily",
            organization=sample_organization,
            facility=sample_facility,
        )
        link2 = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=post_op_ct,
            ai_result_id=post_op_result.pk,
            suggestion_category="post_op_care.medications",
            suggestion_index=0,
            suggestion_text="Omeprazole for gastric protection",
            organization=sample_organization,
            facility=sample_facility,
        )

        drug = Drug.objects.create(
            code="OME-20",
            generic_name="Omeprazole",
            form="CAPSULE",
            strength="20mg",
            unit="capsule",
        )
        prescription = Prescription.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=14),
            organization=sample_organization,
            facility=sample_facility,
        )
        PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=14,
            dosage="1 capsule",
            frequency="Once daily",
            duration="14 days",
        )

        link1.refresh_from_db()
        link2.refresh_from_db()
        # Exactly one should be matched (the first in query order)
        matched = [l for l in [link1, link2] if l.status == AIAdvisoryOrderLinkStatus.ORDERED]
        assert len(matched) == 1

    def test_already_ordered_link_not_overwritten(
        self,
        post_op_result,
        post_op_ct,
        sample_patient,
        sample_encounter,
        test_user,
        sample_organization,
        sample_facility,
    ):
        """ORDERED links should not be overwritten by auto-match."""
        existing_prescription = Prescription.objects.create(
            patient=sample_patient,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=7),
            organization=sample_organization,
            facility=sample_facility,
        )
        link = AIAdvisoryOrderLink.objects.create(
            ai_result_content_type=post_op_ct,
            ai_result_id=post_op_result.pk,
            suggestion_category="medications",
            suggestion_index=0,
            suggestion_text="Ibuprofen 400mg TDS",
            status=AIAdvisoryOrderLinkStatus.ORDERED,
            prescription=existing_prescription,
            actioned_at=timezone.now(),
            organization=sample_organization,
            facility=sample_facility,
        )

        drug = Drug.objects.create(
            code="IBU-400B",
            generic_name="Ibuprofen",
            form="TABLET",
            strength="400mg",
            unit="tablet",
        )
        new_prescription = Prescription.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=7),
            organization=sample_organization,
            facility=sample_facility,
        )
        PrescriptionItem.objects.create(
            prescription=new_prescription,
            drug=drug,
            quantity=21,
            dosage="1 tablet",
            frequency="TDS",
            duration="7 days",
        )

        link.refresh_from_db()
        # Still linked to original prescription, not overwritten
        assert link.prescription_id == existing_prescription.pk


# =============================================================================
# Serializer validation tests
# =============================================================================


@pytest.mark.django_db
class TestAdvisorySerializerValidation:
    """Tests for serializer-level validation logic."""

    def test_action_serializer_rejects_no_order_on_ordered(self):
        from hmis.apps.ai.serializers import AIAdvisoryOrderLinkActionSerializer

        serializer = AIAdvisoryOrderLinkActionSerializer(data={"status": "ORDERED"})
        assert not serializer.is_valid()
        assert "non_field_errors" in serializer.errors

    def test_action_serializer_accepts_declined_without_order(self):
        from hmis.apps.ai.serializers import AIAdvisoryOrderLinkActionSerializer

        serializer = AIAdvisoryOrderLinkActionSerializer(data={"status": "DECLINED"})
        assert serializer.is_valid()

    def test_action_serializer_accepts_single_order_fk(self):
        from hmis.apps.ai.serializers import AIAdvisoryOrderLinkActionSerializer

        serializer = AIAdvisoryOrderLinkActionSerializer(
            data={"status": "ORDERED", "lab_order_id": 1}
        )
        assert serializer.is_valid()

    def test_action_serializer_rejects_two_order_fks(self):
        from hmis.apps.ai.serializers import AIAdvisoryOrderLinkActionSerializer

        serializer = AIAdvisoryOrderLinkActionSerializer(
            data={"status": "ORDERED", "lab_order_id": 1, "prescription_id": 2}
        )
        assert not serializer.is_valid()

    def test_seed_serializer_rejects_invalid_type(self):
        from hmis.apps.ai.serializers import AIAdvisoryBulkSeedSerializer

        serializer = AIAdvisoryBulkSeedSerializer(
            data={"ai_result_id": str(uuid.uuid4()), "ai_result_type": "invalid"}
        )
        assert not serializer.is_valid()
        assert "ai_result_type" in serializer.errors

    def test_seed_serializer_accepts_valid_types(self):
        from hmis.apps.ai.serializers import AIAdvisoryBulkSeedSerializer

        for result_type in ("pre_op_assessment", "post_op_care_plan"):
            serializer = AIAdvisoryBulkSeedSerializer(
                data={"ai_result_id": str(uuid.uuid4()), "ai_result_type": result_type}
            )
            assert serializer.is_valid(), f"Failed for {result_type}"
