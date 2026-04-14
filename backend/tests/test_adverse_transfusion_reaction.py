"""
Tests for Adverse Transfusion Reaction (ATR) reporting.

Aligned with Kenya MOH/PPB form FOM20/MIP/PMS/SOP/001.
"""

from datetime import date, time
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def sample_transfusion_with_reaction(db, sample_admission, test_user):
    """Create a blood transfusion that has a recorded reaction."""
    from hmis.apps.inpatient.models import BloodTransfusionObservation, TransfusionObservationEntry

    transfusion = BloodTransfusionObservation.objects.create(
        admission=sample_admission,
        blood_product="PACKED_RED_CELLS",
        blood_unit_number="KNH-2026-00451",
        blood_group="A+",
        amount_ml=450,
        transfusion_date=date.today(),
        time_started=time(10, 0),
        started_by=test_user,
        diagnosis="Severe anaemia",
        status="STOPPED",
        reaction_occurred=True,
        reaction_type="Fever, chills",
        reaction_action_taken="Transfusion stopped, antihistamine given",
        expiry_date=date(2026, 6, 30),
    )

    # Add observation entries for vitals auto-population
    TransfusionObservationEntry.objects.create(
        transfusion=transfusion,
        observation_interval="BEFORE",
        exact_time=time(9, 55),
        recorded_by=test_user,
        blood_pressure="120/80",
        temperature=Decimal("36.8"),
        pulse=78,
        respiratory_rate=18,
    )
    TransfusionObservationEntry.objects.create(
        transfusion=transfusion,
        observation_interval="15_MIN",
        exact_time=time(10, 15),
        recorded_by=test_user,
        blood_pressure="130/90",
        temperature=Decimal("38.2"),
        pulse=110,
        respiratory_rate=24,
    )

    return transfusion


@pytest.fixture
def sample_transfusion_no_reaction(db, sample_admission, test_user):
    """Create a completed blood transfusion with no reaction."""
    from hmis.apps.inpatient.models import BloodTransfusionObservation

    return BloodTransfusionObservation.objects.create(
        admission=sample_admission,
        blood_product="WHOLE",
        blood_unit_number="KNH-2026-00452",
        amount_ml=500,
        transfusion_date=date.today(),
        time_started=time(14, 0),
        time_ended=time(18, 0),
        started_by=test_user,
        status="COMPLETED",
        reaction_occurred=False,
    )


@pytest.fixture
def atr_create_data(sample_transfusion_with_reaction):
    """Valid data for creating an ATR report."""
    return {
        "transfusion": sample_transfusion_with_reaction.id,
        "pre_transfusion_hb": "8.5",
        "obstetric_status": "NA",
        "previous_transfusion": True,
        "previous_transfusion_comment": "2 units 6 months ago, no reaction",
        "previous_reactions": False,
        "current_medications": "Folic acid 5mg, Ferrous sulphate 200mg",
        "general_reactions": ["FEVER", "CHILLS_RIGORS"],
        "cardiac_respiratory_reactions": ["TACHYCARDIA"],
        "dermatological_reactions": [],
        "renal_reactions": [],
        "haematological_reactions": [],
        "other_reactions": "",
        "initial_reporter_cadre": "Clinical Officer",
        "initial_reporter_mobile": "0712345678",
        "initial_reporter_email": "nurse@example.com",
    }


@pytest.fixture
def sample_atr(
    db, sample_transfusion_with_reaction, test_user, sample_facility, sample_organization
):
    """Create a sample ATR report."""
    from hmis.apps.inpatient.models import AdverseTransfusionReaction

    atr = AdverseTransfusionReaction.objects.create(
        transfusion=sample_transfusion_with_reaction,
        facility=sample_facility,
        organization=sample_organization,
        pre_transfusion_hb=Decimal("8.5"),
        obstetric_status="NA",
        previous_transfusion=True,
        previous_transfusion_comment="No issues",
        previous_reactions=False,
        current_medications="Ferrous sulphate",
        general_reactions=["FEVER", "CHILLS_RIGORS"],
        cardiac_respiratory_reactions=["TACHYCARDIA"],
        dermatological_reactions=[],
        renal_reactions=[],
        haematological_reactions=[],
        initial_reporter=test_user,
        initial_reporter_cadre="Clinical Officer",
        report_date=date.today(),
    )
    atr.auto_populate_vitals()
    atr.save()
    return atr


# ============================================================================
# Model Tests
# ============================================================================


class TestAdverseTransfusionReactionModel:
    """Tests for the AdverseTransfusionReaction model."""

    def test_create_atr_linked_to_reaction_transfusion(
        self, sample_transfusion_with_reaction, test_user, sample_facility, sample_organization
    ):
        """ATR can be created when linked to a transfusion with reaction_occurred=True."""
        from hmis.apps.inpatient.models import AdverseTransfusionReaction

        atr = AdverseTransfusionReaction.objects.create(
            transfusion=sample_transfusion_with_reaction,
            facility=sample_facility,
            organization=sample_organization,
            general_reactions=["FEVER"],
            initial_reporter=test_user,
            report_date=date.today(),
        )
        assert atr.id is not None
        assert atr.status == "DRAFT"
        assert atr.transfusion == sample_transfusion_with_reaction

    def test_one_atr_per_transfusion(
        self,
        sample_atr,
        sample_transfusion_with_reaction,
        test_user,
        sample_facility,
        sample_organization,
    ):
        """Only one ATR report allowed per transfusion (OneToOneField)."""
        from django.db import IntegrityError

        from hmis.apps.inpatient.models import AdverseTransfusionReaction

        with pytest.raises(IntegrityError):
            AdverseTransfusionReaction.objects.create(
                transfusion=sample_transfusion_with_reaction,
                facility=sample_facility,
                organization=sample_organization,
                general_reactions=["FLUSHING"],
                initial_reporter=test_user,
                report_date=date.today(),
            )

    def test_auto_populate_vitals(self, sample_atr):
        """auto_populate_vitals() should pull from observation entries."""
        assert sample_atr.vitals_at_start_bp == "120/80"
        assert sample_atr.vitals_at_start_temp == Decimal("36.8")
        assert sample_atr.vitals_at_start_pulse == 78
        assert sample_atr.vitals_at_start_rr == 18
        assert sample_atr.vitals_during_bp == "130/90"
        assert sample_atr.vitals_during_temp == Decimal("38.2")
        assert sample_atr.vitals_during_pulse == 110

    def test_submit_to_ppb_state_transition(self, sample_atr, test_user):
        """submit_to_ppb() should change status from DRAFT to SUBMITTED."""
        sample_atr.submit_to_ppb(user=test_user)
        sample_atr.refresh_from_db()
        assert sample_atr.status == "SUBMITTED"
        assert sample_atr.submission_date is not None

    def test_submit_to_ppb_rejects_already_submitted(self, sample_atr, test_user):
        """submit_to_ppb() should reject if already submitted."""
        from django.core.exceptions import ValidationError

        sample_atr.submit_to_ppb(user=test_user)
        with pytest.raises(ValidationError):
            sample_atr.submit_to_ppb(user=test_user)

    def test_mark_acknowledged(self, sample_atr, test_user):
        """mark_acknowledged() should set PPB tracking fields."""
        sample_atr.submit_to_ppb(user=test_user)
        sample_atr.mark_acknowledged(
            adr_number="ADR/2026/0451",
            vigiflow_number="VF-KE-2026-00123",
        )
        sample_atr.refresh_from_db()
        assert sample_atr.status == "ACKNOWLEDGED"
        assert sample_atr.adr_report_number == "ADR/2026/0451"
        assert sample_atr.vigiflow_entry_number == "VF-KE-2026-00123"

    def test_has_lab_investigation_false_when_empty(self, sample_atr):
        """has_lab_investigation should be False when no lab fields are filled."""
        assert sample_atr.has_lab_investigation is False

    def test_has_lab_investigation_true_when_filled(self, sample_atr):
        """has_lab_investigation should be True when any lab field is filled."""
        sample_atr.recipient_supernatant_hemolysis = "PRESENT"
        sample_atr.recipient_hemolysis_severity = "MILD"
        sample_atr.save()
        assert sample_atr.has_lab_investigation is True

    def test_reaction_categories_display(self, sample_atr):
        """reaction_categories_display should flatten all selected reactions."""
        display = sample_atr.reaction_categories_display
        assert "Fever" in display
        assert "Chills/Rigors" in display
        assert "Tachycardia" in display

    def test_str_representation(self, sample_atr):
        """__str__ should include ATR and patient info."""
        s = str(sample_atr)
        assert "ATR" in s


# ============================================================================
# API Tests
# ============================================================================


class TestATRAPICreate:
    """Tests for ATR creation via API."""

    def test_create_atr_success(self, authenticated_client, atr_create_data):
        """Should create ATR report with valid data."""
        response = authenticated_client.post(
            "/api/inpatient/adverse-transfusion-reactions/",
            atr_create_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "DRAFT"
        assert response.data["general_reactions"] == ["FEVER", "CHILLS_RIGORS"]

    def test_create_atr_without_auth_fails(self, api_client, atr_create_data):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            "/api/inpatient/adverse-transfusion-reactions/",
            atr_create_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_atr_for_non_reaction_transfusion_fails(
        self, authenticated_client, sample_transfusion_no_reaction
    ):
        """Should reject ATR for transfusion without reaction_occurred=True."""
        data = {
            "transfusion": sample_transfusion_no_reaction.id,
            "general_reactions": ["FEVER"],
        }
        response = authenticated_client.post(
            "/api/inpatient/adverse-transfusion-reactions/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_atr_no_reaction_categories_fails(
        self, authenticated_client, sample_transfusion_with_reaction
    ):
        """Should reject ATR with no reaction categories selected."""
        data = {
            "transfusion": sample_transfusion_with_reaction.id,
            "general_reactions": [],
            "dermatological_reactions": [],
            "cardiac_respiratory_reactions": [],
            "renal_reactions": [],
            "haematological_reactions": [],
        }
        response = authenticated_client.post(
            "/api/inpatient/adverse-transfusion-reactions/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_atr_invalid_reaction_value_fails(
        self, authenticated_client, sample_transfusion_with_reaction
    ):
        """Should reject ATR with invalid reaction category values."""
        data = {
            "transfusion": sample_transfusion_with_reaction.id,
            "general_reactions": ["INVALID_REACTION"],
        }
        response = authenticated_client.post(
            "/api/inpatient/adverse-transfusion-reactions/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestATRAPIRetrieve:
    """Tests for ATR retrieval via API."""

    def test_list_atr_reports(self, authenticated_client, sample_atr):
        """Should list ATR reports."""
        response = authenticated_client.get("/api/inpatient/adverse-transfusion-reactions/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_retrieve_atr_detail(self, authenticated_client, sample_atr):
        """Should retrieve ATR detail with all sections."""
        response = authenticated_client.get(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_atr.id
        assert response.data["general_reactions"] == ["FEVER", "CHILLS_RIGORS"]
        assert "has_lab_investigation" in response.data
        assert "reaction_categories_display" in response.data

    def test_retrieve_atr_detail_includes_patient_demographics(
        self, authenticated_client, sample_atr
    ):
        """Detail should include patient gender, DOB, ward, diagnosis, and started_by."""
        response = authenticated_client.get(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        # Patient demographics
        assert "patient_gender" in data
        assert "patient_date_of_birth" in data
        assert "ward_name" in data
        # Transfusion context
        assert "transfusion_diagnosis" in data
        assert "started_by_name" in data
        # Existing fields still present
        assert "patient_name" in data
        assert "patient_mrn" in data

    def test_filter_by_admission(self, authenticated_client, sample_atr):
        """Should filter ATR reports by admission."""
        admission_id = sample_atr.transfusion.admission_id
        response = authenticated_client.get(
            f"/api/inpatient/adverse-transfusion-reactions/?transfusion__admission={admission_id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_filter_by_status(self, authenticated_client, sample_atr):
        """Should filter ATR reports by status."""
        response = authenticated_client.get(
            "/api/inpatient/adverse-transfusion-reactions/?status=DRAFT"
        )
        assert response.status_code == status.HTTP_200_OK
        results = (
            response.data
            if isinstance(response.data, list)
            else response.data.get("results", response.data)
        )
        assert all(r["status"] == "DRAFT" for r in results)


class TestATRAPIActions:
    """Tests for ATR custom actions."""

    def test_update_lab_investigation(self, authenticated_client, sample_atr):
        """Should update lab investigation fields."""
        lab_data = {
            "recipient_supernatant_hemolysis": "PRESENT",
            "recipient_hemolysis_severity": "MILD",
            "recipient_agglutination": "ABSENT",
            "haematological_results": {
                "wbc": "5.2",
                "hb": "7.8",
                "rbc": "3.1",
                "hct": "28",
                "mcv": "82",
                "mch": "28",
                "mchc": "33",
                "plt": "180",
            },
            "donor_supernatant_hemolysis": "ABSENT",
            "compatibility_saline_rt": "COMPATIBLE",
            "compatibility_saline_37": "COMPATIBLE",
            "compatibility_ahg": "COMPATIBLE",
            "compatibility_albumin_37": "COMPATIBLE",
            "urinalysis": "Hemoglobinuria detected",
            "evaluation_diagnosis": "Febrile non-hemolytic transfusion reaction",
            "reaction_related_to_transfusion": "YES",
        }
        response = authenticated_client.patch(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/update-lab-investigation/",
            lab_data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_lab_investigation"] is True

    def test_submit_to_ppb(self, authenticated_client, sample_atr):
        """Should submit ATR to PPB."""
        data = {
            "ppb_submitter_name": "Dr. Jane Wanjiku",
            "ppb_submitter_cadre": "Pharmacist",
            "ppb_submitter_mobile": "0722111222",
            "ppb_submitter_email": "pharmacist@hospital.co.ke",
        }
        response = authenticated_client.post(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/submit-to-ppb/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SUBMITTED"

    def test_submit_to_ppb_already_submitted_fails(
        self, authenticated_client, sample_atr, test_user
    ):
        """Should reject double submission."""
        sample_atr.submit_to_ppb(user=test_user)
        data = {"ppb_submitter_name": "Dr. Test"}
        response = authenticated_client.post(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/submit-to-ppb/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_mark_acknowledged(self, authenticated_client, sample_atr, test_user):
        """Should record PPB acknowledgment."""
        sample_atr.submit_to_ppb(user=test_user)
        data = {
            "adr_report_number": "ADR/2026/0451",
            "vigiflow_entry_number": "VF-KE-2026-00123",
        }
        response = authenticated_client.post(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/mark-acknowledged/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACKNOWLEDGED"
        assert response.data["adr_report_number"] == "ADR/2026/0451"


# ============================================================================
# Lab Order Integration Tests
# ============================================================================


@pytest.fixture
def sample_test_catalog(db):
    """Create lab test catalog entries needed for ATR investigation."""
    from hmis.apps.laboratory.models import TestCatalog

    tests = []
    for code, name, category in [
        ("CBC", "Complete Blood Count", "HEMATOLOGY"),
        ("BCULTURE", "Blood Culture", "MICROBIOLOGY"),
        ("UA", "Urinalysis", "URINALYSIS"),
    ]:
        test, _ = TestCatalog.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "short_name": code,
                "category": category,
                "specimen_type": "BLOOD" if category == "HEMATOLOGY" else "URINE",
                "result_type": "NUMERIC",
                "cost": 500,
                "is_active": True,
            },
        )
        tests.append(test)
    return tests


class TestATRLabOrderIntegration:
    """Tests for ATR ↔ Lab Order integration."""

    def test_create_lab_order_from_atr(self, sample_atr, test_user, sample_test_catalog):
        """create_lab_order() should create a linked URGENT lab order."""
        order = sample_atr.create_lab_order(user=test_user)

        assert order is not None
        assert order.order_number.startswith("LAB-")
        assert order.priority == "STAT"
        assert order.admission == sample_atr.transfusion.admission
        assert order.patient == sample_atr.transfusion.admission.patient
        assert "ATR" in order.clinical_notes
        assert order.items.count() >= 2  # CBC + BCULTURE + UA

        sample_atr.refresh_from_db()
        assert sample_atr.lab_order_id == order.id

    def test_create_lab_order_rejects_duplicate(self, sample_atr, test_user, sample_test_catalog):
        """Should reject creating a second lab order."""
        from django.core.exceptions import ValidationError

        sample_atr.create_lab_order(user=test_user)
        with pytest.raises(ValidationError, match="already been created"):
            sample_atr.create_lab_order(user=test_user)

    def test_populate_from_lab_results_empty(self, sample_atr):
        """populate_from_lab_results() returns False when no lab order."""
        assert sample_atr.populate_from_lab_results() is False

    def test_populate_from_lab_results_with_verified_results(
        self, sample_atr, test_user, sample_test_catalog
    ):
        """Should pull verified CBC results into haematological_results."""
        from hmis.apps.laboratory.models import LabResult

        order = sample_atr.create_lab_order(user=test_user)
        # Find the UA order item and add a verified result
        ua_item = order.items.filter(test__code="UA").first()
        if ua_item:
            LabResult.objects.create(
                order_item=ua_item,
                text_value="Hemoglobinuria detected, dark brown color",
                verification_status="VERIFIED",
                entered_by=test_user,
            )

        updated = sample_atr.populate_from_lab_results()
        sample_atr.refresh_from_db()

        if ua_item:
            assert updated is True
            assert "Hemoglobinuria" in sample_atr.urinalysis

    def test_populate_does_not_overwrite_manual(self, sample_atr, test_user, sample_test_catalog):
        """Should not overwrite manually-entered urinalysis."""
        from hmis.apps.laboratory.models import LabResult

        sample_atr.urinalysis = "Manual entry: clear, no hemoglobinuria"
        sample_atr.save()

        order = sample_atr.create_lab_order(user=test_user)
        ua_item = order.items.filter(test__code="UA").first()
        if ua_item:
            LabResult.objects.create(
                order_item=ua_item,
                text_value="Something different from lab",
                verification_status="VERIFIED",
                entered_by=test_user,
            )

        sample_atr.populate_from_lab_results()
        sample_atr.refresh_from_db()
        assert sample_atr.urinalysis == "Manual entry: clear, no hemoglobinuria"


class TestATRLabOrderAPI:
    """Tests for ATR lab order API actions."""

    def test_request_lab_investigation_success(
        self, authenticated_client, sample_atr, sample_test_catalog
    ):
        """Should create a lab order via the API."""
        response = authenticated_client.post(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/request-lab-investigation/",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["lab_order_number"] is not None
        assert response.data["lab_order_status"] in ("DRAFT", "ORDERED")

    def test_request_lab_investigation_duplicate_fails(
        self, authenticated_client, sample_atr, test_user, sample_test_catalog
    ):
        """Should reject duplicate lab order request."""
        sample_atr.create_lab_order(user=test_user)
        response = authenticated_client.post(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/request-lab-investigation/",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_sync_lab_results_no_order(self, authenticated_client, sample_atr):
        """Should fail when no lab order exists."""
        response = authenticated_client.post(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/sync-lab-results/",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_sync_lab_results_success(
        self, authenticated_client, sample_atr, test_user, sample_test_catalog
    ):
        """Should sync verified results from the lab order."""
        from hmis.apps.laboratory.models import LabResult

        order = sample_atr.create_lab_order(user=test_user)
        ua_item = order.items.filter(test__code="UA").first()
        if ua_item:
            LabResult.objects.create(
                order_item=ua_item,
                text_value="Hemoglobinuria detected",
                verification_status="VERIFIED",
                entered_by=test_user,
            )

        response = authenticated_client.post(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/sync-lab-results/",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_detail_includes_lab_order_fields(
        self, authenticated_client, sample_atr, test_user, sample_test_catalog
    ):
        """Detail response should include lab_order_number and lab_order_status."""
        order = sample_atr.create_lab_order(user=test_user)
        response = authenticated_client.get(
            f"/api/inpatient/adverse-transfusion-reactions/{sample_atr.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["lab_order_number"] == order.order_number
        assert response.data["lab_order_status"] is not None
