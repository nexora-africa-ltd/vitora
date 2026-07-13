"""
Tests for auto-creation of SHA claims on outpatient encounters.

When an OPD/EMERGENCY/FOLLOW_UP encounter is created and the patient has an active
SHAMember record, a draft SHA claim is automatically created with claim_flow set
by the DHA HIE flow router (phc, shif, or eccif).
"""

from datetime import date
from unittest.mock import patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.test import override_settings

from hmis.apps.billing.models import Invoice, SHAClaim, SHAMember
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def phc_patient(db, sample_county, sample_sub_county, sample_facility):
    """Patient at a PHC facility."""
    return Patient.objects.create(
        first_name="PHC",
        last_name="Patient",
        date_of_birth="1990-05-15",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_facility.organization,
    )


@pytest.fixture
def phc_sha_member(db, phc_patient, test_user):
    """Active SHA member for the PHC patient."""
    SHAMember.objects.filter(patient=phc_patient).delete()
    return SHAMember.objects.create(
        patient=phc_patient,
        sha_number="SHA-PHC-001",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        created_by=test_user,
        eligibility_response={"is_eligible": True},
    )


@pytest.mark.django_db
class TestAutoPhcClaimCreation:
    """Tests for the auto-PHC claim signal."""

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_opd_encounter_creates_phc_claim(self, phc_patient, phc_sha_member, sample_facility):
        """OPD encounter at Level 3 should auto-create a draft PHC claim."""
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Cough and cold",
            facility=sample_facility,
        )

        claim = SHAClaim.objects.filter(
            encounter=encounter,
            claim_flow=SHAClaim.ClaimFlow.PHC,
        ).first()

        assert claim is not None, "PHC claim should be auto-created"
        assert claim.status == SHAClaim.ClaimStatus.DRAFT
        assert claim.claim_type == SHAClaim.ClaimType.OUTPATIENT
        assert claim.sha_member == phc_sha_member
        assert claim.patient == phc_patient
        assert claim.facility_level == "L3"
        assert claim.service_date == encounter.encounter_date

    @override_settings(FACILITY_MFL_CODE="88888")
    def test_level_2_facility_creates_phc_claim(
        self, phc_patient, phc_sha_member, sample_organization, sample_county, sample_sub_county
    ):
        """Level 2 dispensary should also auto-create PHC claims."""
        from hmis.apps.core.models import Facility

        l2_facility = Facility.objects.create(
            name="Level 2 Dispensary",
            level="2",
            mfl_code="88888",
            dha_fr_code="88888",
            organization=sample_organization,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Follow-up",
            facility=l2_facility,
        )

        claim = SHAClaim.objects.filter(
            encounter=encounter,
            claim_flow=SHAClaim.ClaimFlow.PHC,
        ).first()

        assert claim is not None
        assert claim.facility_code == "88888"
        assert claim.facility_level == "L2"  # Normalized to L prefix

    @override_settings(FACILITY_MFL_CODE="77777")
    def test_level_4_opd_routes_to_shif_flow(
        self, phc_patient, phc_sha_member, sample_organization, sample_county, sample_sub_county
    ):
        """Level 4+ OPD encounters route to SHIF flow via determine_flow."""
        from hmis.apps.core.models import Facility

        l4_facility = Facility.objects.create(
            name="Level 4 Sub-County Hospital",
            level="4",
            mfl_code="77777",
            organization=sample_organization,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Referral case",
            facility=l4_facility,
        )

        claim = SHAClaim.objects.filter(encounter=encounter).first()

        assert claim is not None
        assert claim.claim_flow == SHAClaim.ClaimFlow.SHIF

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_ipd_encounter_does_not_create_phc_claim(
        self, phc_patient, phc_sha_member, sample_facility
    ):
        """IPD encounters should NOT auto-create PHC claims (handled at discharge)."""
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="IPD",
            chief_complaint="Admission",
            facility=sample_facility,
        )

        claim = SHAClaim.objects.filter(
            encounter=encounter,
            claim_flow=SHAClaim.ClaimFlow.PHC,
        ).first()

        assert claim is None

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_no_sha_member_no_claim(self, phc_patient, sample_facility):
        """Patients without active SHA membership should not get auto-claims."""
        # Ensure no SHAMember exists
        SHAMember.objects.filter(patient=phc_patient).delete()

        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Cash patient",
            facility=sample_facility,
        )

        claim = SHAClaim.objects.filter(encounter=encounter).first()
        assert claim is None

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_inactive_sha_member_no_claim(self, phc_patient, test_user, sample_facility):
        """Inactive SHA members should not trigger auto-claim creation."""
        SHAMember.objects.filter(patient=phc_patient).delete()
        SHAMember.objects.create(
            patient=phc_patient,
            sha_number="SHA-INACTIVE",
            national_id="99999999",
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            status=SHAMember.MembershipStatus.INACTIVE,
            created_by=test_user,
            eligibility_response={},
        )

        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            facility=sample_facility,
        )

        claim = SHAClaim.objects.filter(encounter=encounter).first()
        assert claim is None

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_no_duplicate_claims_on_update(self, phc_patient, phc_sha_member, sample_facility):
        """Updating an encounter should not create a duplicate PHC claim."""
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Initial visit",
            facility=sample_facility,
        )

        # First claim should exist
        assert (
            SHAClaim.objects.filter(encounter=encounter, claim_flow=SHAClaim.ClaimFlow.PHC).count()
            == 1
        )

        # Update the encounter (should NOT trigger new claim)
        encounter.chief_complaint = "Updated complaint"
        encounter.save()

        # Still exactly one
        assert (
            SHAClaim.objects.filter(encounter=encounter, claim_flow=SHAClaim.ClaimFlow.PHC).count()
            == 1
        )

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_claim_linked_to_invoice(self, phc_patient, phc_sha_member, sample_facility):
        """The auto-created PHC claim should be linked to the encounter's invoice."""
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Linked test",
            facility=sample_facility,
        )

        claim = SHAClaim.objects.filter(
            encounter=encounter,
            claim_flow=SHAClaim.ClaimFlow.PHC,
        ).first()

        assert claim is not None
        # Invoice is also auto-created by the invoice signal
        invoice = Invoice.objects.filter(encounter=encounter).first()
        assert claim.invoice == invoice

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_emergency_encounter_creates_eccif_claim(
        self, phc_patient, phc_sha_member, sample_facility
    ):
        """EMERGENCY encounters route to ECCIF flow via determine_flow."""
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Acute injury",
            facility=sample_facility,
        )

        claim = SHAClaim.objects.filter(encounter=encounter).first()

        assert claim is not None
        assert claim.claim_flow == SHAClaim.ClaimFlow.ECCIF
        assert claim.is_emergency_claim is True
        assert claim.claim_type == SHAClaim.ClaimType.OUTPATIENT

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_domain_event_published(self, phc_patient, phc_sha_member, sample_facility, mocker):
        """Domain event should be published when PHC claim is auto-created."""
        mock_publish = mocker.patch("hmis.apps.billing.signals.publish_event")

        Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Event test",
            facility=sample_facility,
        )

        # Find the SHA_CLAIM_CREATED call
        sha_claim_calls = [
            call for call in mock_publish.call_args_list if "sha_claim.created" in str(call)
        ]
        assert len(sha_claim_calls) == 1
        payload = sha_claim_calls[0].kwargs.get("payload") or sha_claim_calls[0][1].get(
            "payload", {}
        )
        assert payload.get("claim_flow") == "phc"
        assert payload.get("trigger") == "outpatient_encounter_created"


@pytest.mark.django_db
class TestPhcClaimRetryAndQueueTrigger:
    """Tests for retry mechanism and queue-triggered claim creation."""

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_retry_task_queued_on_failure(
        self, phc_patient, phc_sha_member, sample_facility, mocker
    ):
        """When _maybe_create_phc_claim fails, a retry Celery task should be queued."""
        # Make SHAClaim.objects.create raise to simulate SQLite locking
        mocker.patch(
            "hmis.apps.billing.models.SHAClaim.objects.create",
            side_effect=Exception("database is locked"),
        )
        mock_retry = mocker.patch(
            "hmis.apps.billing.tasks.retry_phc_claim_creation.apply_async",
        )

        Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Retry test",
            facility=sample_facility,
        )

        # Retry task should have been queued
        assert mock_retry.called
        call_args = mock_retry.call_args
        assert call_args.kwargs.get("countdown") == 10

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_queue_trigger_creates_claim_for_existing_encounter(
        self, phc_patient, phc_sha_member, sample_facility, mocker
    ):
        """When patient is queued, trigger_phc_claim_on_queue creates missing claim."""
        from hmis.apps.billing.signals import trigger_phc_claim_on_queue

        # Create encounter WITHOUT triggering the signal (simulate failed signal)
        mocker.patch("hmis.apps.billing.signals._maybe_create_phc_claim")
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Queue fallback test",
            facility=sample_facility,
        )

        # Verify no claim exists yet
        assert not SHAClaim.objects.filter(encounter=encounter).exists()

        # Now restore the real function and call trigger_phc_claim_on_queue
        mocker.stopall()
        trigger_phc_claim_on_queue(phc_patient.pk, sample_facility.pk)

        # Claim should now exist
        claim = SHAClaim.objects.filter(
            encounter=encounter, claim_flow=SHAClaim.ClaimFlow.PHC
        ).first()
        assert claim is not None
        assert claim.status == SHAClaim.ClaimStatus.DRAFT

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_queue_trigger_skips_if_claim_already_exists(
        self, phc_patient, phc_sha_member, sample_facility
    ):
        """trigger_phc_claim_on_queue should not duplicate an existing claim."""
        from hmis.apps.billing.signals import trigger_phc_claim_on_queue

        # Normal path: encounter created → claim auto-created
        encounter = Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="No duplicate test",
            facility=sample_facility,
        )

        assert (
            SHAClaim.objects.filter(encounter=encounter, claim_flow=SHAClaim.ClaimFlow.PHC).count()
            == 1
        )

        # Queue trigger should not create a second claim
        trigger_phc_claim_on_queue(phc_patient.pk, sample_facility.pk)

        assert (
            SHAClaim.objects.filter(encounter=encounter, claim_flow=SHAClaim.ClaimFlow.PHC).count()
            == 1
        )

    @override_settings(FACILITY_LEVEL="L3", FACILITY_MFL_CODE="99999")
    def test_queue_trigger_no_sha_member_is_noop(self, phc_patient, sample_facility):
        """trigger_phc_claim_on_queue does nothing for non-SHA patients."""
        from hmis.apps.billing.signals import trigger_phc_claim_on_queue

        SHAMember.objects.filter(patient=phc_patient).delete()

        Encounter.objects.create(
            patient=phc_patient,
            encounter_type="OPD",
            chief_complaint="Cash patient",
            facility=sample_facility,
        )

        trigger_phc_claim_on_queue(phc_patient.pk, sample_facility.pk)
        assert SHAClaim.objects.filter(patient=phc_patient).count() == 0
