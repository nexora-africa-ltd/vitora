"""
Tests for the referrals module.

Following TDD approach: tests define expected behavior for:
- ClinicalReferral model (creation, auto-numbering, status transitions, validation)
- ClinicalReferral API (CRUD, accept, decline, cancel, filtering)
- Signal-driven downstream record creation
"""

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from rest_framework import status

# ============================================================================
# Model Tests
# ============================================================================


class TestClinicalReferralModel:
    """Tests for the ClinicalReferral model."""

    def test_create_referral_auto_generates_number(self, db, sample_encounter, test_user):
        """Should auto-generate a REF-YYYYMMDD-XXXX number."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Knee pain rehabilitation",
            referred_by=test_user,
        )

        assert referral.referral_number.startswith("REF-")
        assert len(referral.referral_number) == 17  # REF-YYYYMMDD-XXXX

    def test_create_referral_auto_derives_type_allied_health(self, db, sample_encounter, test_user):
        """Should auto-derive referral_type as ALLIED_HEALTH for allied health services."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="NUTRITION",
            reason="Malnutrition screening",
            referred_by=test_user,
        )

        assert referral.referral_type == "ALLIED_HEALTH"

    def test_create_referral_auto_derives_type_admission(self, db, sample_encounter, test_user):
        """Should auto-derive referral_type as ADMISSION for ward services."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="GENERAL_WARD",
            reason="Requires monitoring",
            provisional_diagnosis_text="Pneumonia",
            referred_by=test_user,
        )

        assert referral.referral_type == "ADMISSION"

    def test_create_referral_defaults_to_specialty_clinic(self, db, sample_encounter, test_user):
        """Should default to SPECIALTY_CLINIC for unmapped services."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="DENTAL",
            reason="Tooth extraction needed",
            referred_by=test_user,
        )

        assert referral.referral_type == "SPECIALTY_CLINIC"

    def test_create_referral_auto_sets_patient_from_encounter(
        self, db, sample_encounter, test_user
    ):
        """Should auto-set patient from encounter if not explicitly provided."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            target_service="PHYSIOTHERAPY",
            reason="Rehab needed",
            referred_by=test_user,
        )

        assert referral.patient == sample_encounter.patient

    def test_sequential_numbering_per_day(self, db, sample_encounter, test_user):
        """Should generate sequential numbers within the same day."""
        from hmis.apps.referrals.models import ClinicalReferral

        r1 = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Reason 1",
            referred_by=test_user,
        )
        r2 = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="NUTRITION",
            reason="Reason 2",
            referred_by=test_user,
        )

        # Extract sequence numbers
        seq1 = int(r1.referral_number.split("-")[-1])
        seq2 = int(r2.referral_number.split("-")[-1])
        assert seq2 == seq1 + 1

    def test_default_status_is_pending(self, db, sample_encounter, test_user):
        """New referrals should default to PENDING status."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="DENTAL",
            reason="Dental work needed",
            referred_by=test_user,
        )

        assert referral.status == "PENDING"

    def test_status_transition_accept(self, db, sample_encounter, test_user):
        """Should transition from PENDING to ACCEPTED."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="ENT",
            reason="Hearing assessment",
            referred_by=test_user,
        )

        referral.accept(user=test_user)
        referral.refresh_from_db()

        assert referral.status == "ACCEPTED"
        assert referral.accepted_by == test_user
        assert referral.accepted_at is not None

    def test_status_transition_decline(self, db, sample_encounter, test_user):
        """Should transition from PENDING to DECLINED with reason."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="EYE",
            reason="Vision check",
            referred_by=test_user,
        )

        referral.decline(user=test_user, reason="Patient declined referral")
        referral.refresh_from_db()

        assert referral.status == "DECLINED"
        assert referral.declined_by == test_user
        assert referral.decline_reason == "Patient declined referral"

    def test_status_transition_decline_requires_reason(self, db, sample_encounter, test_user):
        """Declining without a reason should raise ValidationError."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="EYE",
            reason="Vision check",
            referred_by=test_user,
        )

        with pytest.raises(ValidationError, match="reason is required"):
            referral.decline(user=test_user, reason="")

    def test_invalid_status_transition_raises_error(self, db, sample_encounter, test_user):
        """Cannot transition from COMPLETED to ACCEPTED."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="DENTAL",
            reason="Dental check",
            referred_by=test_user,
            status="COMPLETED",
        )

        with pytest.raises(ValidationError, match="Cannot transition"):
            referral.update_status("ACCEPTED")

    def test_is_active_for_pending_referral(self, db, sample_encounter, test_user):
        """PENDING referral should be active."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="DENTAL",
            reason="Check",
            referred_by=test_user,
        )

        assert referral.is_active is True
        assert referral.is_terminal is False

    def test_is_terminal_for_completed_referral(self, db, sample_encounter, test_user):
        """COMPLETED referral should be terminal."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="DENTAL",
            reason="Check",
            referred_by=test_user,
            status="COMPLETED",
        )

        assert referral.is_terminal is True
        assert referral.is_active is False

    def test_is_admission_property(self, db, sample_encounter, test_user):
        """Should correctly identify admission referrals."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="ICU",
            reason="Critical care needed",
            provisional_diagnosis_text="Sepsis",
            referred_by=test_user,
        )

        assert referral.is_admission is True
        assert referral.referral_type == "ADMISSION"

    def test_snapshot_encounter_context(self, db, sample_encounter, test_user):
        """Should snapshot vitals from encounter."""
        from hmis.apps.referrals.models import ClinicalReferral

        # Set some vitals on the encounter
        sample_encounter.temperature = 38.5
        sample_encounter.pulse = 90
        sample_encounter.blood_pressure = "140/90"
        sample_encounter.save()

        referral = ClinicalReferral(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )
        referral.snapshot_encounter_context()

        assert referral.relevant_vitals.get("temperature") == "38.5"
        assert referral.relevant_vitals.get("pulse") == "90"
        assert referral.relevant_vitals.get("blood_pressure") == "140/90"

    def test_get_clinic_type_mapping(self, db, sample_encounter, test_user):
        """Should return correct clinic type for routing."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral(target_service="PHYSIOTHERAPY")
        assert referral.get_clinic_type() == "PHYSIO"

        referral2 = ClinicalReferral(target_service="DENTAL")
        assert referral2.get_clinic_type() == "DENTAL"

    def test_expire_only_pending_referrals(self, db, sample_encounter, test_user):
        """expire() should only work on PENDING referrals."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="DENTAL",
            reason="Check",
            referred_by=test_user,
        )

        referral.expire()
        referral.refresh_from_db()
        assert referral.status == "EXPIRED"


# ============================================================================
# API Tests
# ============================================================================


class TestClinicalReferralAPI:
    """Tests for the ClinicalReferral REST API."""

    @pytest.fixture
    def referral_data(self, sample_encounter):
        """Valid referral creation data."""
        return {
            "encounter": sample_encounter.id,
            "target_service": "PHYSIOTHERAPY",
            "reason": "Knee pain rehabilitation after surgery",
            "clinical_notes": "Post-op right knee replacement",
            "priority": "ROUTINE",
        }

    def test_create_referral_success(self, authenticated_client, referral_data):
        """Should create a referral with auto-generated fields."""
        response = authenticated_client.post("/api/referrals/", referral_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["referral_number"].startswith("REF-")
        assert response.data["referral_type"] == "ALLIED_HEALTH"
        assert response.data["target_service"] == "PHYSIOTHERAPY"
        assert response.data["status"] == "PENDING"

    def test_create_referral_unauthenticated_fails(self, api_client, referral_data):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/referrals/", referral_data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_admission_referral(self, authenticated_client, sample_encounter):
        """Should create an admission referral with required fields."""
        data = {
            "encounter": sample_encounter.id,
            "target_service": "MEDICAL_WARD",
            "reason": "Requires inpatient monitoring",
            "provisional_diagnosis_text": "Severe pneumonia",
            "provisional_diagnosis": "J18.9",
            "priority": "URGENT",
        }
        response = authenticated_client.post("/api/referrals/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["referral_type"] == "ADMISSION"

    def test_create_admission_referral_without_diagnosis_fails(
        self, authenticated_client, sample_encounter
    ):
        """Admission referrals require provisional diagnosis text."""
        data = {
            "encounter": sample_encounter.id,
            "target_service": "MEDICAL_WARD",
            "reason": "Requires monitoring",
            "priority": "ROUTINE",
        }
        response = authenticated_client.post("/api/referrals/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "provisional_diagnosis_text" in response.data

    def test_list_referrals(self, authenticated_client, referral_data):
        """Should list referrals."""
        authenticated_client.post("/api/referrals/", referral_data, format="json")

        response = authenticated_client.get("/api/referrals/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_referral(self, authenticated_client, referral_data):
        """Should retrieve a single referral detail."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        response = authenticated_client.get(f"/api/referrals/{referral_id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["referral_number"] == create_resp.data["referral_number"]
        assert "relevant_diagnoses" in response.data
        assert "relevant_vitals" in response.data

    def test_accept_referral(self, authenticated_client, referral_data):
        """Should accept a pending referral."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        response = authenticated_client.post(
            f"/api/referrals/{referral_id}/accept/", {}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACCEPTED"
        assert response.data["accepted_at"] is not None

    def test_decline_referral(self, authenticated_client, referral_data):
        """Should decline a referral with a reason."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        response = authenticated_client.post(
            f"/api/referrals/{referral_id}/decline/",
            {"reason": "Service not available at this time"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DECLINED"
        assert response.data["decline_reason"] == "Service not available at this time"

    def test_decline_referral_without_reason_fails(self, authenticated_client, referral_data):
        """Declining without a reason should fail."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        response = authenticated_client.post(
            f"/api/referrals/{referral_id}/decline/",
            {"reason": ""},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_referral(self, authenticated_client, referral_data):
        """Should cancel an active referral."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        response = authenticated_client.post(
            f"/api/referrals/{referral_id}/cancel/", {}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_delete_only_draft_referrals(self, authenticated_client, referral_data):
        """Should prevent deleting non-draft referrals."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        # Default is PENDING, not DRAFT — should fail
        response = authenticated_client.delete(f"/api/referrals/{referral_id}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_for_encounter_endpoint(self, authenticated_client, referral_data):
        """Should list referrals filtered by encounter."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        encounter_id = referral_data["encounter"]

        response = authenticated_client.get(f"/api/referrals/for-encounter/{encounter_id}/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        assert response.data[0]["target_service"] == "PHYSIOTHERAPY"

    def test_pending_endpoint(self, authenticated_client, referral_data):
        """Should list pending referrals."""
        authenticated_client.post("/api/referrals/", referral_data, format="json")

        response = authenticated_client.get("/api/referrals/pending/")

        assert response.status_code == status.HTTP_200_OK

    def test_pending_endpoint_filter_by_service(self, authenticated_client, referral_data):
        """Should filter pending referrals by target_service."""
        authenticated_client.post("/api/referrals/", referral_data, format="json")

        response = authenticated_client.get("/api/referrals/pending/?target_service=PHYSIOTHERAPY")

        assert response.status_code == status.HTTP_200_OK

    def test_my_referrals_endpoint(self, authenticated_client, referral_data):
        """Should list referrals created by current user."""
        authenticated_client.post("/api/referrals/", referral_data, format="json")

        response = authenticated_client.get("/api/referrals/my-referrals/")

        assert response.status_code == status.HTTP_200_OK

    def test_stats_endpoint(self, authenticated_client, referral_data):
        """Should return referral statistics."""
        authenticated_client.post("/api/referrals/", referral_data, format="json")

        response = authenticated_client.get("/api/referrals/stats/")

        assert response.status_code == status.HTTP_200_OK
        assert "total" in response.data
        assert "by_status" in response.data
        assert "by_type" in response.data
        assert "by_priority" in response.data

    def test_filter_by_referral_type(self, authenticated_client, referral_data):
        """Should filter referrals by type."""
        authenticated_client.post("/api/referrals/", referral_data, format="json")

        response = authenticated_client.get("/api/referrals/?referral_type=ALLIED_HEALTH")

        assert response.status_code == status.HTTP_200_OK
        for r in response.data.get("results", []):
            assert r["referral_type"] == "ALLIED_HEALTH"

    def test_filter_by_patient(self, authenticated_client, referral_data, sample_patient):
        """Should filter referrals by patient."""
        authenticated_client.post("/api/referrals/", referral_data, format="json")

        response = authenticated_client.get(f"/api/referrals/?patient={sample_patient.id}")

        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_patient_id_alias(
        self,
        authenticated_client,
        referral_data,
        sample_county,
        sample_sub_county,
        sample_organization,
        sample_facility,
    ):
        """Should filter referrals when callers send patient_id."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        target_referral_id = create_resp.data["id"]
        other_patient = Patient.objects.create(
            first_name="Alias",
            last_name="Referral",
            date_of_birth="1992-04-10",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
            registered_at_facility=sample_facility,
        )
        other_encounter = Encounter.objects.create(
            patient=other_patient,
            encounter_type="OPD",
            chief_complaint="Other referral",
            organization=sample_organization,
            facility=sample_facility,
        )
        authenticated_client.post(
            "/api/referrals/",
            {
                "encounter": other_encounter.id,
                "target_service": "NUTRITION",
                "reason": "Other patient referral",
                "clinical_notes": "Other patient",
                "priority": "ROUTINE",
            },
            format="json",
        )

        response = authenticated_client.get(
            f"/api/referrals/?patient_id={create_resp.data['patient']}"
        )

        assert response.status_code == status.HTTP_200_OK
        referral_ids = {item["id"] for item in response.data["results"]}
        assert referral_ids == {target_referral_id}

    def test_filter_by_encounter_id_alias(
        self,
        authenticated_client,
        referral_data,
        sample_encounter,
        sample_patient,
        test_user,
    ):
        """Should filter referrals when callers send encounter_id."""
        from hmis.apps.referrals.models import ClinicalReferral

        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        target_referral_id = create_resp.data["id"]
        other_encounter = sample_encounter.__class__.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Referral follow-up",
            organization=sample_encounter.organization,
            facility=sample_encounter.facility,
        )
        ClinicalReferral.objects.create(
            encounter=other_encounter,
            patient=sample_patient,
            target_service="SOCIAL_WORK",
            reason="Other encounter referral",
            clinical_notes="Other encounter",
            priority="ROUTINE",
            referral_type="ALLIED_HEALTH",
            referred_by=test_user,
        )

        response = authenticated_client.get(f"/api/referrals/?encounter_id={sample_encounter.id}")

        assert response.status_code == status.HTTP_200_OK
        referral_ids = {item["id"] for item in response.data["results"]}
        assert referral_ids == {target_referral_id}

    def test_search_by_referral_number(self, authenticated_client, referral_data):
        """Should search referrals by number."""
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        ref_number = create_resp.data["referral_number"]

        response = authenticated_client.get(f"/api/referrals/?search={ref_number}")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_referral_for_closed_encounter_fails(
        self, authenticated_client, sample_encounter
    ):
        """Should reject referrals for closed encounters."""
        sample_encounter.status = "CLOSED"
        sample_encounter.save()

        data = {
            "encounter": sample_encounter.id,
            "target_service": "DENTAL",
            "reason": "Check",
        }
        response = authenticated_client.post("/api/referrals/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_multiple_referral_types(self, authenticated_client, sample_encounter):
        """Should support creating different referral types from same encounter."""
        # Allied health
        r1 = authenticated_client.post(
            "/api/referrals/",
            {
                "encounter": sample_encounter.id,
                "target_service": "PHYSIOTHERAPY",
                "reason": "Rehab",
            },
            format="json",
        )
        # Specialty
        r2 = authenticated_client.post(
            "/api/referrals/",
            {
                "encounter": sample_encounter.id,
                "target_service": "DENTAL",
                "reason": "Dental work",
            },
            format="json",
        )

        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code == status.HTTP_201_CREATED
        assert r1.data["referral_type"] == "ALLIED_HEALTH"
        assert r2.data["referral_type"] == "SPECIALTY_CLINIC"

    def test_referral_captures_vitals_snapshot(self, authenticated_client, sample_encounter):
        """Should auto-snapshot encounter vitals."""
        sample_encounter.temperature = 37.5
        sample_encounter.pulse = 80
        sample_encounter.weight = 70
        sample_encounter.save()

        data = {
            "encounter": sample_encounter.id,
            "target_service": "NUTRITION",
            "reason": "Diet assessment",
        }
        response = authenticated_client.post("/api/referrals/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        vitals = response.data["relevant_vitals"]
        assert vitals.get("temperature") == "37.5"
        assert vitals.get("pulse") == "80"


# ============================================================================
# Audit Log Tests
# ============================================================================


class TestReferralAuditLogging:
    """Tests for referral audit logging."""

    def test_create_referral_creates_audit_log(self, authenticated_client, sample_encounter):
        """Creating a referral should create an audit log entry."""
        from hmis.apps.core.models import AuditLog

        data = {
            "encounter": sample_encounter.id,
            "target_service": "DENTAL",
            "reason": "Dental check",
        }
        authenticated_client.post("/api/referrals/", data, format="json")

        log = AuditLog.objects.filter(action="referral_create").last()
        assert log is not None
        assert log.resource_type == "ClinicalReferral"

    def test_accept_referral_creates_audit_log(self, authenticated_client, sample_encounter):
        """Accepting a referral should create an audit log entry."""
        from hmis.apps.core.models import AuditLog

        data = {
            "encounter": sample_encounter.id,
            "target_service": "DENTAL",
            "reason": "Check",
        }
        resp = authenticated_client.post("/api/referrals/", data, format="json")
        referral_id = resp.data["id"]

        authenticated_client.post(f"/api/referrals/{referral_id}/accept/", {}, format="json")

        log = AuditLog.objects.filter(action="referral_accept").last()
        assert log is not None
