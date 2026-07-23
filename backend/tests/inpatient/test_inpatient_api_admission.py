"""
Tests for Admission API endpoints (Phase 7b).

Tests AdmissionRecommendation and Admission ViewSets with:
- CRUD operations
- Workflow methods (accept/decline recommendation)
- Filtering and search
- Audit logging
- Authentication requirements
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from hmis.apps.inpatient.models import Admission, AdmissionRecommendation, Discharge, DischargeDraft

User = get_user_model()


@pytest.mark.django_db
class TestAdmissionRecommendationAPI:
    """Test suite for AdmissionRecommendation API endpoints."""

    def test_list_admission_recommendations_requires_auth(self, api_client):
        """Should require authentication to list recommendations."""
        response = api_client.get("/api/inpatient/admission-recommendations/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_admission_recommendations(
        self, authenticated_client, sample_admission_recommendation
    ):
        """Should list all admission recommendations."""
        response = authenticated_client.get("/api/inpatient/admission-recommendations/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1
        assert response.data["results"][0]["id"] == sample_admission_recommendation.id

    def test_create_admission_recommendation(
        self, authenticated_client, test_user, sample_encounter, sample_inpatient_ward
    ):
        """Should create new admission recommendation."""
        data = {
            "encounter": sample_encounter.id,
            "recommended_by": test_user.id,
            "reason": "Suspected pneumonia requiring hospitalization",
            "provisional_diagnosis": "J18.9",
            "provisional_diagnosis_text": "Pneumonia, unspecified",
            "urgency": "URGENT",
            "preferred_ward_type": sample_inpatient_ward.ward_type,
        }

        response = authenticated_client.post(
            "/api/inpatient/admission-recommendations/", data, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING"
        assert response.data["reason"] == data["reason"]

        # Verify expiry is set (default 24 hours)
        recommendation = AdmissionRecommendation.objects.get(id=response.data["id"])
        assert recommendation.expires_at is not None

    def test_retrieve_admission_recommendation(
        self, authenticated_client, sample_admission_recommendation
    ):
        """Should retrieve admission recommendation details."""
        response = authenticated_client.get(
            f"/api/inpatient/admission-recommendations/{sample_admission_recommendation.id}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_admission_recommendation.id
        assert "is_expired" in response.data

    def test_accept_admission_recommendation(
        self, authenticated_client, test_user, sample_admission_recommendation
    ):
        """Should accept pending recommendation."""
        response = authenticated_client.post(
            f"/api/inpatient/admission-recommendations/{sample_admission_recommendation.id}/accept/",
            {"user": test_user.id},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACCEPTED"

        # Verify model updated
        sample_admission_recommendation.refresh_from_db()
        assert sample_admission_recommendation.status == "ACCEPTED"
        assert sample_admission_recommendation.resolved_by == test_user

    def test_decline_admission_recommendation(
        self, authenticated_client, test_user, sample_admission_recommendation
    ):
        """Should decline pending recommendation with reason."""
        response = authenticated_client.post(
            f"/api/inpatient/admission-recommendations/{sample_admission_recommendation.id}/decline/",
            {
                "user": test_user.id,
                "reason": "Patient condition improved, no longer requires admission",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DECLINED"

        # Verify model updated
        sample_admission_recommendation.refresh_from_db()
        assert sample_admission_recommendation.status == "DECLINED"
        assert sample_admission_recommendation.decline_reason is not None

    def test_filter_recommendations_by_status(
        self, authenticated_client, sample_admission_recommendation
    ):
        """Should filter recommendations by status."""
        response = authenticated_client.get(
            "/api/inpatient/admission-recommendations/?status=PENDING"
        )

        assert response.status_code == status.HTTP_200_OK
        for rec in response.data["results"]:
            assert rec["status"] == "PENDING"


@pytest.mark.django_db
class TestAdmissionAPI:
    """Test suite for Admission API endpoints."""

    def test_list_admissions_requires_auth(self, api_client):
        """Should require authentication to list admissions."""
        response = api_client.get("/api/inpatient/admissions/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_admissions(self, authenticated_client, sample_admission):
        """Should list all admissions."""
        response = authenticated_client.get("/api/inpatient/admissions/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1
        assert response.data["results"][0]["id"] == sample_admission.id

    def test_create_admission(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        sample_inpatient_ward,
        sample_bed,
        sample_admission_recommendation,
    ):
        """Should create new admission with auto-generated admission number."""
        data = {
            "patient": sample_patient.id,
            "opd_encounter": sample_encounter.id,
            "recommendation": sample_admission_recommendation.id,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": "J18.9",
            "admitting_diagnosis_text": "Pneumonia, unspecified",
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": sample_inpatient_ward.id,
            "bed": sample_bed.id,
            "payer_type": "SHA",
            "insurance_details": {"policy_number": "SHA-12345"},
        }

        response = authenticated_client.post("/api/inpatient/admissions/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["admission_number"].startswith("ADM-")
        assert response.data["admission_status"] == "ACTIVE"

        # Verify bed status updated
        sample_bed.refresh_from_db()
        assert sample_bed.status == "OCCUPIED"

    def test_create_admission_carries_opd_diagnoses_to_ipd_encounter(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        sample_inpatient_ward,
        sample_bed,
        sample_icd10_code,
    ):
        """Admission create path should copy OPD diagnoses and enforce admission PRIMARY."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        secondary_code = ICD10Code.objects.create(
            code="B01",
            description="Varicella",
            short_description="Varicella",
            category="Infectious diseases",
            chapter=1,
        )
        admission_primary_code = ICD10Code.objects.create(
            code="J18.9",
            description="Pneumonia, unspecified organism",
            short_description="Pneumonia",
            category="Diseases of the respiratory system",
            chapter=10,
        )

        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=sample_icd10_code,
            diagnosis_type="PRIMARY",
            is_confirmed=True,
            certainty="confirmed",
            diagnosed_by=test_user,
        )
        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=secondary_code,
            diagnosis_type="SECONDARY",
            is_confirmed=True,
            certainty="confirmed",
            diagnosed_by=test_user,
        )

        data = {
            "patient": sample_patient.id,
            "opd_encounter": sample_encounter.id,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": admission_primary_code.code,
            "admitting_diagnosis_text": admission_primary_code.description,
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": sample_inpatient_ward.id,
            "bed": sample_bed.id,
            "payer_type": "CASH",
        }

        response = authenticated_client.post("/api/inpatient/admissions/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        admission = Admission.objects.get(id=response.data["id"])
        ipd_encounter = admission.ipd_encounter

        primary = ipd_encounter.diagnoses.get(diagnosis_type="PRIMARY")
        assert primary.icd10_code.code == admission_primary_code.code
        assert primary.is_confirmed is True
        assert primary.certainty == "confirmed"

        secondaries = ipd_encounter.diagnoses.filter(diagnosis_type="SECONDARY")
        assert secondaries.count() == 1
        assert secondaries.first().icd10_code.code == secondary_code.code

    def test_create_admission_accepts_source_encounter_alias(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        sample_inpatient_ward,
        sample_bed,
    ):
        """Should accept source_encounter as an alias for opd_encounter."""
        data = {
            "patient": sample_patient.id,
            "source_encounter": sample_encounter.id,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": "J18.9",
            "admitting_diagnosis_text": "Pneumonia, unspecified",
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": sample_inpatient_ward.id,
            "bed": sample_bed.id,
            "payer_type": "CASH",
        }

        response = authenticated_client.post("/api/inpatient/admissions/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["opd_encounter"] == sample_encounter.id
        assert response.data["source_encounter"] == sample_encounter.id

    def test_retrieve_admission_with_length_of_stay(self, authenticated_client, sample_admission):
        """Should retrieve admission with computed length_of_stay."""
        response = authenticated_client.get(f"/api/inpatient/admissions/{sample_admission.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_admission.id
        assert response.data["public_id"] == str(sample_admission.public_id)
        assert "length_of_stay" in response.data
        assert isinstance(response.data["length_of_stay"], int)

    def test_retrieve_admission_by_public_id(self, authenticated_client, sample_admission):
        """Should retrieve admission detail by UUID public_id."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.public_id}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_admission.id
        assert response.data["public_id"] == str(sample_admission.public_id)

    def test_clinical_summary_endpoint_returns_chronological_timeline(
        self, authenticated_client, sample_admission, test_user, another_user
    ):
        """Should expose composed clinical timeline for preview before claim submission."""
        from datetime import date, datetime, time

        from hmis.apps.inpatient.models import (
            KardexHandoverNote,
            KardexShiftNote,
            NursingKardex,
            WardRound,
        )

        kardex, _ = NursingKardex.objects.get_or_create(admission=sample_admission)

        WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(hour=9, minute=0),
            conducted_by=test_user,
            subjective="Breathlessness reduced.",
            objective="Sats 96% on room air.",
            assessment="Improving.",
            plan="Continue therapy.",
            condition_status="IMPROVING",
        )

        shift_note = KardexShiftNote.objects.create(
            kardex=kardex,
            shift="DAY",
            nurse=test_user,
            content="Patient tolerated treatment during morning shift.",
        )
        KardexShiftNote.objects.filter(pk=shift_note.pk).update(
            timestamp=timezone.make_aware(datetime.combine(date.today(), time(hour=10, minute=0)))
        )

        handover = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            shift_ending="DAY",
            pending_tasks="Review oxygen requirements at noon.",
            escalations="Escalate if SpO2 drops below 92%.",
        )
        KardexHandoverNote.objects.filter(pk=handover.pk).update(
            created_at=timezone.make_aware(datetime.combine(date.today(), time(hour=11, minute=0)))
        )

        response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/clinical-summary/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["admission_id"] == sample_admission.id
        assert response.data["admission_number"] == sample_admission.admission_number
        assert "rendered_text" in response.data
        assert "INPATIENT CLINICAL COURSE (Chronological)" in response.data["rendered_text"]

        entries = response.data["entries"]
        assert len(entries) >= 3

        sources = [entry["source"] for entry in entries]
        assert any(src.startswith("Ward Round") for src in sources)
        assert any(src.startswith("Kardex Shift Note") for src in sources)
        assert any(src.startswith("Kardex Handover") for src in sources)

        timestamps = [entry["timestamp"] for entry in entries]
        assert timestamps == sorted(timestamps)

    def test_filter_admissions_by_ward(
        self, authenticated_client, sample_admission, sample_inpatient_ward
    ):
        """Should filter admissions by ward."""
        response = authenticated_client.get(
            f"/api/inpatient/admissions/?ward={sample_inpatient_ward.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        for admission in response.data["results"]:
            assert admission["ward"] == sample_inpatient_ward.id

    def test_filter_admissions_by_status(self, authenticated_client, sample_admission):
        """Should filter admissions by admission status."""
        response = authenticated_client.get("/api/inpatient/admissions/?admission_status=ACTIVE")

        assert response.status_code == status.HTTP_200_OK
        for admission in response.data["results"]:
            assert admission["admission_status"] == "ACTIVE"

    def test_filter_active_admission_for_patient_returns_only_current_stay(
        self,
        authenticated_client,
        sample_admission,
        sample_inpatient_ward,
        sample_facility,
        sample_organization,
        test_user,
    ):
        """Patient + ACTIVE filter should return only the current active admission."""
        from datetime import timedelta

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.inpatient.models import Bed

        discharge_bed = Bed.objects.create(
            ward=sample_inpatient_ward,
            bed_number="TMP-DISCH-1",
            status="AVAILABLE",
            status_changed_by=test_user,
        )
        old_ipd = Encounter.objects.create(
            patient=sample_admission.patient,
            encounter_type="IPD",
            encounter_date=timezone.now().date() - timedelta(days=10),
            chief_complaint="Previous admission episode",
            facility=sample_facility,
            organization=sample_organization,
        )

        Admission.objects.create(
            patient=sample_admission.patient,
            ipd_encounter=old_ipd,
            admission_date=timezone.now() - timedelta(days=10),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Previous pneumonia episode",
            admitting_officer=test_user,
            attending_doctor=test_user,
            ward=sample_inpatient_ward,
            bed=discharge_bed,
            payer_type="CASH",
            admission_status="DISCHARGED",
            discharge_date=timezone.now() - timedelta(days=6),
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get(
            f"/api/inpatient/admissions/?patient={sample_admission.patient_id}&admission_status=ACTIVE&page_size=1"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["id"] == sample_admission.id
        assert response.data["results"][0]["admission_status"] == "ACTIVE"

    def test_save_discharge_draft_without_finalizing_discharge(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Should persist discharge summary draft while keeping admission active."""
        payload = {
            "discharge_type": "NORMAL",
            "diagnoses": [
                {
                    "role": "PRIMARY",
                    "code": "J18.9",
                    "description": "Pneumonia, unspecified",
                }
            ],
            "treatment_summary": "Patient clinically improved; continue oral antibiotics.",
            "patient_instructions": "Return if fever or dyspnea worsens.",
            "follow_up_instructions": "Review after 7 days.",
            "follow_up_date": "2026-07-30",
            "discharge_medications": [
                {
                    "drug_name": "Amoxicillin",
                    "dosage": "500mg",
                    "frequency": "TDS",
                    "duration": "5 days",
                }
            ],
            "generation_mode": "generate",
        }

        response = authenticated_client.put(
            f"/api/inpatient/admissions/{sample_admission.id}/discharge-draft/",
            payload,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["admission"] == sample_admission.id
        assert response.data["treatment_summary"] == payload["treatment_summary"]

        sample_admission.refresh_from_db()
        assert sample_admission.admission_status == "ACTIVE"
        assert Discharge.objects.filter(admission=sample_admission).count() == 0

        draft = DischargeDraft.objects.get(admission=sample_admission)
        assert draft.patient_instructions == payload["patient_instructions"]
        assert draft.diagnoses[0]["code"] == "J18.9"

    def test_get_and_delete_discharge_draft(
        self,
        authenticated_client,
        sample_admission,
    ):
        """Should fetch and delete persisted discharge draft for an admission."""
        DischargeDraft.objects.create(
            admission=sample_admission,
            discharge_type="NORMAL",
            treatment_summary="Draft summary",
            patient_instructions="Draft instructions",
            diagnoses=[],
            discharge_medications=[],
        )

        get_response = authenticated_client.get(
            f"/api/inpatient/admissions/{sample_admission.id}/discharge-draft/"
        )
        assert get_response.status_code == status.HTTP_200_OK
        assert get_response.data["admission"] == sample_admission.id
        assert get_response.data["treatment_summary"] == "Draft summary"

        delete_response = authenticated_client.delete(
            f"/api/inpatient/admissions/{sample_admission.id}/discharge-draft/"
        )
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not DischargeDraft.objects.filter(admission=sample_admission).exists()

    def test_admission_auto_assign_bed_success(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        sample_inpatient_ward,
        sample_bed,
    ):
        """Should auto-assign first available bed when auto_assign_bed=true."""
        # Mark all auto-generated beds as OCCUPIED except one
        from hmis.apps.inpatient.models import Bed

        # Set all beds as OCCUPIED first
        Bed.objects.filter(ward=sample_inpatient_ward).update(status="OCCUPIED")
        # Then make our sample_bed AVAILABLE
        sample_bed.status = "AVAILABLE"
        sample_bed.save()

        data = {
            "patient": sample_patient.id,
            "opd_encounter": sample_encounter.id,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": "J18.9",
            "admitting_diagnosis_text": "Pneumonia",
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": sample_inpatient_ward.id,
            # Note: No bed specified
            "payer_type": "CASH",
            "auto_assign_bed": True,  # Enable automatic bed assignment
        }

        response = authenticated_client.post("/api/inpatient/admissions/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["bed"] == sample_bed.id
        assert response.data["bed_number"] == sample_bed.bed_number

        # Verify bed status updated
        sample_bed.refresh_from_db()
        assert sample_bed.status == "OCCUPIED"

    def test_admission_without_bed_and_no_auto_assign_fails(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        sample_inpatient_ward,
    ):
        """Should fail when no bed provided and auto_assign_bed is not set."""
        data = {
            "patient": sample_patient.id,
            "opd_encounter": sample_encounter.id,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": "J18.9",
            "admitting_diagnosis_text": "Pneumonia",
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": sample_inpatient_ward.id,
            # Note: No bed specified, no auto_assign_bed
            "payer_type": "CASH",
        }

        response = authenticated_client.post("/api/inpatient/admissions/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "bed" in response.data

    def test_admission_auto_assign_fails_when_no_beds_available(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        sample_inpatient_ward,
        sample_bed,
    ):
        """Should fail with clear error when no beds are available for auto-assignment."""
        # Mark ALL beds as occupied (including auto-generated ones)
        from hmis.apps.inpatient.models import Bed

        Bed.objects.filter(ward=sample_inpatient_ward).update(status="OCCUPIED")

        data = {
            "patient": sample_patient.id,
            "opd_encounter": sample_encounter.id,
            "admission_date": timezone.now().isoformat(),
            "admitting_diagnosis": "J18.9",
            "admitting_diagnosis_text": "Pneumonia",
            "admitting_officer": test_user.id,
            "attending_doctor": test_user.id,
            "ward": sample_inpatient_ward.id,
            "payer_type": "CASH",
            "auto_assign_bed": True,
        }

        response = authenticated_client.post("/api/inpatient/admissions/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "bed" in response.data
        assert "No available beds" in str(response.data["bed"])
