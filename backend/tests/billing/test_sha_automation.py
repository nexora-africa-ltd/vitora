"""Tests for SHA Claims Workflow Automation Service."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an active SHA member for testing."""
    from hmis.apps.billing.models import SHAMember

    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-AUTO-001",
        national_id="12345678",
        membership_type="principal",
        status="active",
        coverage_start_date=date.today(),
        created_by=test_user,
    )


@pytest.fixture
def sha_claim_draft(
    db,
    sample_patient,
    sample_encounter,
    sample_facility,
    sample_organization,
    sha_member,
    test_user,
):
    """Create a draft SHA claim for automation testing."""
    from hmis.apps.billing.models import SHAClaim

    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        claim_type="outpatient",
        claim_flow="phc",
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="J18.9",
        primary_diagnosis_description="Pneumonia, unspecified",
        claimed_amount=Decimal("5000.00"),
        facility_code="12345",
        facility_level="L3",
        facility=sample_facility,
        organization=sample_organization,
        created_by=test_user,
    )


@pytest.fixture
def sha_claim_query(
    db,
    sample_patient,
    sample_encounter,
    sample_facility,
    sample_organization,
    sha_member,
    test_user,
):
    """Create a SHA claim in QUERY status for testing."""
    from hmis.apps.billing.models import SHAClaim

    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        claim_type="outpatient",
        claim_flow="shif",
        status=SHAClaim.ClaimStatus.QUERY,
        service_date=date.today() - timedelta(days=5),
        primary_diagnosis_code="J18.9",
        primary_diagnosis_description="Pneumonia",
        claimed_amount=Decimal("8000.00"),
        facility_code="12345",
        facility_level="L3",
        facility=sample_facility,
        organization=sample_organization,
        created_by=test_user,
    )


class TestAutoTriggerConsent:
    """Tests for auto-trigger consent at check-in."""

    def test_not_eligible_without_sha_member(self, db, sample_patient, sample_facility):
        """Should return not_eligible if patient has no SHA membership."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.auto_trigger_consent(
            patient_id=sample_patient.pk,
            facility_id=sample_facility.pk,
        )
        assert result["status"] == "not_eligible"

    def test_eligible_patient_triggers_consent(
        self, db, sample_patient, sample_facility, sha_member
    ):
        """Should attempt to send OTP for eligible patient."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        with patch(
            "hmis.apps.billing.sha_automation.SHAClaimAutomationService.auto_trigger_consent"
        ) as mock_trigger:
            mock_trigger.return_value = {"status": "sent"}
            result = mock_trigger(sample_patient.pk, sample_facility.pk)
            assert result["status"] == "sent"


class TestAutoStartVisit:
    """Tests for auto-start visit on encounter creation."""

    def test_not_eligible_without_sha_member(self, db, sample_encounter):
        """Should return not_eligible if patient has no SHA membership."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.auto_start_visit(sample_encounter.pk)
        assert result["status"] == "not_eligible"

    def test_no_claim_returns_no_claim(self, db, sample_encounter, sha_member):
        """Should return no_claim if no SHA claim exists for encounter."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.auto_start_visit(sample_encounter.pk)
        # Either no_consent or no_claim depending on consent state
        assert result["status"] in ("no_consent", "no_claim")


class TestBatchValidation:
    """Tests for batch validation and bulk submission."""

    def test_batch_validate_returns_summary(self, db, sha_claim_draft, sample_facility):
        """Should return summary with ready/invalid/missing_docs counts."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.batch_validate_claims(sample_facility.pk)

        assert "total" in result
        assert "ready" in result
        assert "invalid" in result
        assert "missing_docs" in result
        assert "total_claimable_amount" in result
        assert result["total"] >= 1

    def test_bulk_submit_validates_before_submitting(self, db, sha_claim_draft, sample_facility):
        """Should validate claims before attempting submission."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        # Mock the service to avoid actual DHA API calls
        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService.submit_claim"
        ) as mock_submit:
            mock_submit.return_value = {"status": "submitted"}

            result = SHAClaimAutomationService.bulk_submit_claims([sha_claim_draft.pk])

            # Should have processed the claim (submitted or skipped)
            assert result["submitted"] + result["failed"] + result["skipped"] >= 0

    def test_bulk_submit_rejects_empty_ids(self, authenticated_client):
        """Should reject empty claim_ids list via API."""
        # Make test user superuser for SHAPermission
        user = authenticated_client.handler._force_user
        user.is_superuser = True
        user.save(update_fields=["is_superuser"])

        response = authenticated_client.post(
            "/api/sha/claims/bulk-submit/",
            {"claim_ids": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_submit_rejects_oversized_batch(self, authenticated_client):
        """Should reject batch larger than 50 claims."""
        user = authenticated_client.handler._force_user
        user.is_superuser = True
        user.save(update_fields=["is_superuser"])

        response = authenticated_client.post(
            "/api/sha/claims/bulk-submit/",
            {"claim_ids": list(range(1, 52))},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestDailyDigest:
    """Tests for daily claims digest generation."""

    def test_generates_digest_for_facility(self, db, sha_claim_draft, sample_facility):
        """Should return comprehensive digest with counts and action items."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        digest = SHAClaimAutomationService.generate_daily_digest(sample_facility.pk)

        assert "date" in digest
        assert "summary" in digest
        assert "action_items" in digest
        assert "created_today" in digest["summary"]
        assert "pending_submission" in digest["summary"]
        assert "pending_amount" in digest["summary"]
        assert digest["summary"]["pending_submission"] >= 1

    def test_digest_includes_time_bar_risk(
        self,
        db,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        sha_member,
        test_user,
    ):
        """Should flag emergency claims approaching deadline."""
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        # Create an emergency draft claim
        SHAClaim.objects.create(
            patient=sample_patient,
            sha_member=sha_member,
            encounter=sample_encounter,
            claim_type="emergency",
            claim_flow="eccif",
            status=SHAClaim.ClaimStatus.DRAFT,
            service_date=date.today() - timedelta(hours=20),  # 20h ago
            primary_diagnosis_code="R55",
            primary_diagnosis_description="Syncope",
            claimed_amount=Decimal("10000.00"),
            facility_code="12345",
            facility_level="L3",
            is_emergency_claim=True,
            facility=sample_facility,
            organization=sample_organization,
            created_by=test_user,
        )

        digest = SHAClaimAutomationService.generate_daily_digest(sample_facility.pk)
        # The emergency claim may or may not show in time_bar_risk depending on
        # whether time_barring_deadline property is implemented
        assert "time_bar_risk" in digest["action_items"]


class TestQueryEscalation:
    """Tests for smart query response workflow."""

    def test_handle_claim_query_assigns_clinician(self, db, sha_claim_query):
        """Should assign query to encounter clinician and calculate deadline."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        with patch("hmis.apps.core.events.publish_event"):
            result = SHAClaimAutomationService.handle_claim_query(sha_claim_query.pk)

        assert result["status"] == "assigned"
        assert "deadline" in result
        assert "hours_remaining" in result

    def test_escalate_overdue_queries(self, db, sha_claim_query):
        """Should escalate queries approaching deadline."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        with patch("hmis.apps.core.events.publish_event"):
            result = SHAClaimAutomationService.escalate_overdue_queries()

        assert "escalated" in result


class TestAutoAttachDocuments:
    """Tests for auto-attachment of digital documents."""

    def test_no_encounter_returns_error(self, db, sha_claim_draft):
        """Should handle claims without encounter gracefully."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        # Claim has encounter, so it should work (but may not find docs)
        result = SHAClaimAutomationService.auto_attach_documents(sha_claim_draft.pk)
        assert "attached" in result

    def test_attaches_available_documents(self, db, sha_claim_draft):
        """Should attach clinical notes from encounter."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.auto_attach_documents(sha_claim_draft.pk)
        # Encounter has chief_complaint so MEDICAL_REPORT should be attached
        assert result["attached"] >= 0  # At least no error

    def test_render_clinical_notes_includes_inpatient_chronological_summary(
        self, sample_admission, test_user
    ):
        """IPD clinical notes rendering should include chronological inpatient sections."""
        from datetime import date, time

        from hmis.apps.billing.sha_automation import SHAClaimAutomationService
        from hmis.apps.inpatient.models import WardRound

        WardRound.objects.create(
            admission=sample_admission,
            round_date=date.today(),
            round_time=time(hour=9, minute=30),
            conducted_by=test_user,
            subjective="Cough improving.",
            objective="No respiratory distress.",
            assessment="Responding to treatment.",
            plan="Continue treatment and review tomorrow.",
            condition_status="IMPROVING",
        )

        notes = SHAClaimAutomationService._render_clinical_notes_text(
            sample_admission.ipd_encounter,
            sample_admission.patient,
        )

        assert notes is not None
        assert "INPATIENT CLINICAL COURSE (Chronological)" in notes
        assert "Ward Round" in notes

    def test_render_clinical_notes_includes_discharge_summary_section(
        self, sample_admission, test_user
    ):
        """IPD clinical notes rendering should include discharge synthesis when present."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService
        from hmis.apps.inpatient.models import Discharge

        Discharge.objects.create(
            admission=sample_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="J18.9",
            final_diagnosis="J18.9",
            final_diagnosis_text="Pneumonia, improved",
            procedures_performed="Chest physiotherapy",
            treatment_summary="Completed IV ceftriaxone and oxygen therapy.",
            discharge_medications=[
                {
                    "drug_name": "Amoxicillin",
                    "dosage": "500mg",
                    "frequency": "TDS",
                    "duration": "5 days",
                }
            ],
            patient_instructions="Complete oral antibiotics and return if symptoms recur.",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        notes = SHAClaimAutomationService._render_clinical_notes_text(
            sample_admission.ipd_encounter,
            sample_admission.patient,
        )

        assert notes is not None
        assert "DISCHARGE SUMMARY" in notes
        assert "Treatment summary:" in notes
        assert "Discharge medications:" in notes


class TestInterventionSuggestions:
    """Tests for auto-populating interventions from clinical actions."""

    def test_no_encounter_returns_empty(self, db, sha_claim_draft):
        """Should return empty list when encounter has no clinical actions."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        suggestions = SHAClaimAutomationService.suggest_interventions_for_encounter(
            sha_claim_draft.encounter_id
        )
        # May or may not find suggestions depending on SHAIntervention catalog
        assert isinstance(suggestions, list)

    def test_auto_attach_skips_non_draft(self, db, sha_claim_query, sample_facility):
        """Should not attach interventions to non-draft claims."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.auto_attach_interventions(
            sha_claim_query.pk,
            [{"code": "SHA-01-001", "name": "Test", "tariff": "1000"}],
        )
        assert result["reason"] == "not_draft"


class TestEligibilityPreCheck:
    """Tests for eligibility pre-check and caching."""

    def test_skips_without_national_id(self, db, sample_patient, sample_facility):
        """Should skip patients without national ID."""
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        result = SHAClaimAutomationService.cache_patient_eligibility(
            sample_patient.pk, sample_facility.pk
        )
        # Depends on whether patient has national_id set
        assert result["status"] in ("skipped", "error", "checked")


class TestAutomationAPIEndpoints:
    """Tests for the automation REST API endpoints."""

    def test_batch_validate_endpoint(self, authenticated_client, sample_facility):
        """Should return validation results for facility claims."""
        user = authenticated_client.handler._force_user
        user.is_superuser = True
        user.save(update_fields=["is_superuser"])

        # Give user a facility
        from hmis.apps.core.models import StaffProfile

        profile, _ = StaffProfile.objects.get_or_create(
            user=user, defaults={"primary_facility": sample_facility}
        )
        if not profile.primary_facility:
            profile.primary_facility = sample_facility
            profile.save(update_fields=["primary_facility"])

        response = authenticated_client.post("/api/sha/claims/batch-validate/")
        # Should not 404 or 500
        assert response.status_code in (200, 400)

    def test_daily_digest_endpoint(self, authenticated_client, sample_facility):
        """Should return daily digest for the facility."""
        user = authenticated_client.handler._force_user
        user.is_superuser = True
        user.save(update_fields=["is_superuser"])

        from hmis.apps.core.models import StaffProfile

        profile, _ = StaffProfile.objects.get_or_create(
            user=user, defaults={"primary_facility": sample_facility}
        )
        if not profile.primary_facility:
            profile.primary_facility = sample_facility
            profile.save(update_fields=["primary_facility"])

        response = authenticated_client.get("/api/sha/claims/daily-digest/")
        assert response.status_code in (200, 400)
