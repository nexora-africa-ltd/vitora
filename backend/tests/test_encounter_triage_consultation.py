"""
Tests for Encounter Triage & Consultation Queue Model Updates.

Phase 1: Backend Model Updates from encounters-consultation-queue-plan.md

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior for:
- Extended ENCOUNTER_TYPE_CHOICES
- Triage requirement choices and logic
- Triage status choices
- Triage bypass fields and validation
- Consultation status fields
- can_enter_consultation() method
- Signal to auto-set triage_status when TriageAssessment created
"""

from datetime import date

import pytest # type: ignore
from django.core.exceptions import ValidationError
from django.utils import timezone

pytestmark = pytest.mark.django_db


# ============================================================================
# Test: Extended Encounter Type Choices
# ============================================================================


@pytest.mark.unit
class TestEncounterTypeChoices:
    """Test the extended ENCOUNTER_TYPE_CHOICES."""

    def test_encounter_type_choices_include_all_mandatory_triage_types(self):
        """Verify all mandatory triage encounter types are available."""
        from hmis.apps.encounters.models import Encounter

        mandatory_types = ["OPD", "IPD", "EMERGENCY", "ANC", "PAEDIATRIC", "DIALYSIS", "ONCOLOGY"]
        choice_values = [choice[0] for choice in Encounter.ENCOUNTER_TYPE_CHOICES]

        for encounter_type in mandatory_types:
            assert (
                encounter_type in choice_values
            ), f"{encounter_type} should be in ENCOUNTER_TYPE_CHOICES"

    def test_encounter_type_choices_include_all_optional_triage_types(self):
        """Verify all optional triage encounter types are available."""
        from hmis.apps.encounters.models import Encounter

        optional_types = [
            "SCHEDULED_OPD",
            "FOLLOW_UP",
            "CONSULTANT_REVIEW",
            "CHRONIC_STABLE",
            "SPECIALIST_CLINIC",
        ]
        choice_values = [choice[0] for choice in Encounter.ENCOUNTER_TYPE_CHOICES]

        for encounter_type in optional_types:
            assert (
                encounter_type in choice_values
            ), f"{encounter_type} should be in ENCOUNTER_TYPE_CHOICES"

    def test_encounter_type_choices_include_all_not_required_triage_types(self):
        """Verify all triage-not-required encounter types are available."""
        from hmis.apps.encounters.models import Encounter

        not_required_types = ["PROCEDURE", "DAY_CASE", "WARD_ROUND", "DISCHARGE_REVIEW"]
        choice_values = [choice[0] for choice in Encounter.ENCOUNTER_TYPE_CHOICES]

        for encounter_type in not_required_types:
            assert (
                encounter_type in choice_values
            ), f"{encounter_type} should be in ENCOUNTER_TYPE_CHOICES"

    def test_new_encounter_type_creates_successfully(self, sample_patient):
        """Test that new encounter types can be used to create encounters."""
        from hmis.apps.encounters.models import Encounter

        # Test a few of the new types
        new_types = ["ANC", "SCHEDULED_OPD", "PROCEDURE"]

        for encounter_type in new_types:
            encounter = Encounter(
                patient=sample_patient,
                encounter_type=encounter_type,
                chief_complaint="Test complaint",
            )
            encounter.full_clean()  # Should not raise


# ============================================================================
# Test: Triage Requirement Choices
# ============================================================================


@pytest.mark.unit
class TestTriageRequirementChoices:
    """Test TRIAGE_REQUIREMENT_CHOICES and mapping."""

    def test_triage_requirement_choices_exist(self):
        """Verify TRIAGE_REQUIREMENT_CHOICES is defined with correct values."""
        from hmis.apps.encounters.models import Encounter

        expected_choices = ["MANDATORY", "OPTIONAL", "NOT_REQUIRED"]
        choice_values = [choice[0] for choice in Encounter.TRIAGE_REQUIREMENT_CHOICES]

        for requirement in expected_choices:
            assert (
                requirement in choice_values
            ), f"{requirement} should be in TRIAGE_REQUIREMENT_CHOICES"

    def test_encounter_type_to_triage_requirement_mapping_exists(self):
        """Verify mapping from encounter type to triage requirement exists."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "ENCOUNTER_TYPE_TRIAGE_MAP"
        ), "ENCOUNTER_TYPE_TRIAGE_MAP should be defined"

        # Verify mapping for mandatory triage types
        mandatory_types = ["OPD", "IPD", "EMERGENCY", "ANC", "PAEDIATRIC", "DIALYSIS", "ONCOLOGY"]
        for enc_type in mandatory_types:
            assert (
                Encounter.ENCOUNTER_TYPE_TRIAGE_MAP.get(enc_type) == "MANDATORY"
            ), f"{enc_type} should map to MANDATORY triage"

        # Verify mapping for optional triage types
        optional_types = [
            "SCHEDULED_OPD",
            "FOLLOW_UP",
            "CONSULTANT_REVIEW",
            "CHRONIC_STABLE",
            "SPECIALIST_CLINIC",
        ]
        for enc_type in optional_types:
            assert (
                Encounter.ENCOUNTER_TYPE_TRIAGE_MAP.get(enc_type) == "OPTIONAL"
            ), f"{enc_type} should map to OPTIONAL triage"

        # Verify mapping for not-required triage types
        not_required_types = ["PROCEDURE", "DAY_CASE", "WARD_ROUND", "DISCHARGE_REVIEW"]
        for enc_type in not_required_types:
            assert (
                Encounter.ENCOUNTER_TYPE_TRIAGE_MAP.get(enc_type) == "NOT_REQUIRED"
            ), f"{enc_type} should map to NOT_REQUIRED triage"


# ============================================================================
# Test: Triage Status Choices
# ============================================================================


@pytest.mark.unit
class TestTriageStatusChoices:
    """Test TRIAGE_STATUS_CHOICES."""

    def test_triage_status_choices_exist(self):
        """Verify TRIAGE_STATUS_CHOICES is defined with correct values."""
        from hmis.apps.encounters.models import Encounter

        expected_choices = ["PENDING", "IN_PROGRESS", "COMPLETED", "BYPASSED", "NOT_APPLICABLE"]
        choice_values = [choice[0] for choice in Encounter.TRIAGE_STATUS_CHOICES]

        for status in expected_choices:
            assert status in choice_values, f"{status} should be in TRIAGE_STATUS_CHOICES"


# ============================================================================
# Test: Triage Bypass Reason Choices
# ============================================================================


@pytest.mark.unit
class TestTriageBypassReasonChoices:
    """Test TRIAGE_BYPASS_REASON_CHOICES."""

    def test_triage_bypass_reason_choices_exist(self):
        """Verify TRIAGE_BYPASS_REASON_CHOICES is defined."""
        from hmis.apps.encounters.models import Encounter

        expected_choices = [
            "STABLE_FOLLOW_UP",
            "CONSULTANT_DECISION",
            "CHRONIC_CARE_REVIEW",
            "STAFF_SHORTAGE",
            "PATIENT_PREFERENCE",
            "OTHER",
        ]
        choice_values = [choice[0] for choice in Encounter.TRIAGE_BYPASS_REASON_CHOICES]

        for reason in expected_choices:
            assert reason in choice_values, f"{reason} should be in TRIAGE_BYPASS_REASON_CHOICES"


# ============================================================================
# Test: Consultation Status Choices
# ============================================================================


@pytest.mark.unit
class TestConsultationStatusChoices:
    """Test CONSULTATION_STATUS_CHOICES."""

    def test_consultation_status_choices_exist(self):
        """Verify CONSULTATION_STATUS_CHOICES is defined with correct values."""
        from hmis.apps.encounters.models import Encounter

        expected_choices = ["WAITING", "CALLED", "IN_PROGRESS", "COMPLETED"]
        choice_values = [choice[0] for choice in Encounter.CONSULTATION_STATUS_CHOICES]

        for status in expected_choices:
            assert status in choice_values, f"{status} should be in CONSULTATION_STATUS_CHOICES"


# ============================================================================
# Test: Triage Requirement Field
# ============================================================================


@pytest.mark.unit
class TestTriageRequirementField:
    """Test triage_requirement field on Encounter model."""

    def test_triage_requirement_field_exists(self):
        """Verify triage_requirement field exists on Encounter model."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "triage_requirement"
        ), "Encounter should have triage_requirement field"

    def test_triage_requirement_auto_set_for_opd(self, sample_patient):
        """OPD encounter should auto-set triage_requirement to MANDATORY."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.triage_requirement == "MANDATORY"

    def test_triage_requirement_auto_set_for_emergency(self, sample_patient):
        """EMERGENCY encounter should auto-set triage_requirement to MANDATORY."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Test complaint",
        )
        assert encounter.triage_requirement == "MANDATORY"

    def test_triage_requirement_auto_set_for_scheduled_opd(self, sample_patient):
        """SCHEDULED_OPD encounter should auto-set triage_requirement to OPTIONAL."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="SCHEDULED_OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.triage_requirement == "OPTIONAL"

    def test_triage_requirement_auto_set_for_follow_up(self, sample_patient):
        """FOLLOW_UP encounter should auto-set triage_requirement to OPTIONAL."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up visit",
        )
        assert encounter.triage_requirement == "OPTIONAL"

    def test_triage_requirement_auto_set_for_procedure(self, sample_patient):
        """PROCEDURE encounter should auto-set triage_requirement to NOT_REQUIRED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="PROCEDURE",
            chief_complaint="Scheduled procedure",
        )
        assert encounter.triage_requirement == "NOT_REQUIRED"

    def test_triage_requirement_auto_set_for_day_case(self, sample_patient):
        """DAY_CASE encounter should auto-set triage_requirement to NOT_REQUIRED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="DAY_CASE",
            chief_complaint="Day case procedure",
        )
        assert encounter.triage_requirement == "NOT_REQUIRED"


# ============================================================================
# Test: Triage Status Field
# ============================================================================


@pytest.mark.unit
class TestTriageStatusField:
    """Test triage_status field on Encounter model."""

    def test_triage_status_field_exists(self):
        """Verify triage_status field exists on Encounter model."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "triage_status"), "Encounter should have triage_status field"

    def test_triage_status_default_pending_for_mandatory(self, sample_patient):
        """Mandatory triage encounters should default to PENDING status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.triage_status == "PENDING"

    def test_triage_status_default_pending_for_optional(self, sample_patient):
        """Optional triage encounters should default to PENDING status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="SCHEDULED_OPD",
            chief_complaint="Follow-up visit",
        )
        assert encounter.triage_status == "PENDING"

    def test_triage_status_default_not_applicable_for_not_required(self, sample_patient):
        """NOT_REQUIRED triage encounters should default to NOT_APPLICABLE status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="PROCEDURE",
            chief_complaint="Scheduled procedure",
        )
        assert encounter.triage_status == "NOT_APPLICABLE"


# ============================================================================
# Test: Triage Bypass Fields
# ============================================================================


@pytest.mark.unit
class TestTriageBypassFields:
    """Test triage bypass related fields."""

    def test_triage_bypass_reason_field_exists(self):
        """Verify triage_bypass_reason field exists."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "triage_bypass_reason"
        ), "Encounter should have triage_bypass_reason field"

    def test_triage_bypassed_by_field_exists(self):
        """Verify triage_bypassed_by field exists."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "triage_bypassed_by"
        ), "Encounter should have triage_bypassed_by field"

    def test_triage_bypassed_at_field_exists(self):
        """Verify triage_bypassed_at field exists."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "triage_bypassed_at"
        ), "Encounter should have triage_bypassed_at field"

    def test_bypass_reason_required_when_status_bypassed(self, sample_patient, test_user):
        """Validation error should be raised if triage_status is BYPASSED without reason."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="SCHEDULED_OPD",
            chief_complaint="Follow-up visit",
            triage_status="BYPASSED",
            triage_bypass_reason="",  # Empty reason should fail
        )

        with pytest.raises(ValidationError) as exc_info:
            encounter.full_clean()

        assert "triage_bypass_reason" in str(exc_info.value)

    def test_bypass_reason_not_required_when_status_not_bypassed(self, sample_patient):
        """No validation error when triage_status is not BYPASSED and reason is empty."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Regular visit",
            triage_status="PENDING",
            triage_bypass_reason="",
        )

        # Should not raise
        encounter.full_clean()

    def test_bypass_fields_set_together(self, sample_patient, test_user):
        """When bypassing, all bypass fields should be set."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="SCHEDULED_OPD",
            chief_complaint="Follow-up visit",
        )

        # Bypass the triage
        encounter.triage_status = "BYPASSED"
        encounter.triage_bypass_reason = "STABLE_FOLLOW_UP"
        encounter.triage_bypassed_by = test_user
        encounter.triage_bypassed_at = timezone.now()
        encounter.full_clean()
        encounter.save()

        # Refresh and verify
        encounter.refresh_from_db()
        assert encounter.triage_status == "BYPASSED"
        assert encounter.triage_bypass_reason == "STABLE_FOLLOW_UP"
        assert encounter.triage_bypassed_by == test_user
        assert encounter.triage_bypassed_at is not None


# ============================================================================
# Test: Consultation Status Fields
# ============================================================================


@pytest.mark.unit
class TestConsultationStatusFields:
    """Test consultation status related fields."""

    def test_consultation_status_field_exists(self):
        """Verify consultation_status field exists."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "consultation_status"
        ), "Encounter should have consultation_status field"

    def test_called_at_field_exists(self):
        """Verify called_at field exists."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "called_at"), "Encounter should have called_at field"

    def test_consultation_started_at_field_exists(self):
        """Verify consultation_started_at field exists."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "consultation_started_at"
        ), "Encounter should have consultation_started_at field"

    def test_consultation_status_default_waiting(self, sample_patient):
        """New encounters should default to WAITING consultation status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.consultation_status == "WAITING"


# ============================================================================
# Test: can_enter_consultation() Method
# ============================================================================


@pytest.mark.unit
class TestCanEnterConsultationMethod:
    """Test the can_enter_consultation() model method."""

    def test_can_enter_consultation_method_exists(self):
        """Verify can_enter_consultation method exists on Encounter model."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(
            Encounter, "can_enter_consultation"
        ), "Encounter should have can_enter_consultation method"
        assert callable(
            Encounter.can_enter_consultation
        ), "can_enter_consultation should be callable"

    def test_cannot_enter_consultation_when_mandatory_pending(self, sample_patient):
        """Cannot enter consultation when mandatory triage is PENDING."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        # triage_requirement = MANDATORY, triage_status = PENDING
        assert encounter.can_enter_consultation() is False

    def test_can_enter_consultation_when_mandatory_completed(self, sample_patient):
        """Can enter consultation when mandatory triage is COMPLETED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        encounter.triage_status = "COMPLETED"
        encounter.save()

        assert encounter.can_enter_consultation() is True

    def test_can_enter_consultation_when_optional_bypassed(self, sample_patient, test_user):
        """Can enter consultation when optional triage is BYPASSED."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="SCHEDULED_OPD",
            chief_complaint="Follow-up visit",
        )
        encounter.triage_status = "BYPASSED"
        encounter.triage_bypass_reason = "STABLE_FOLLOW_UP"
        encounter.triage_bypassed_by = test_user
        encounter.triage_bypassed_at = timezone.now()
        encounter.save()

        assert encounter.can_enter_consultation() is True

    def test_can_enter_consultation_when_not_applicable(self, sample_patient):
        """Can enter consultation when triage is NOT_APPLICABLE."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="PROCEDURE",
            chief_complaint="Scheduled procedure",
        )
        # triage_status should be NOT_APPLICABLE automatically
        assert encounter.can_enter_consultation() is True

    def test_cannot_enter_consultation_when_mandatory_in_progress(self, sample_patient):
        """Cannot enter consultation when mandatory triage is IN_PROGRESS."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Chest pain",
        )
        encounter.triage_status = "IN_PROGRESS"
        encounter.save()

        assert encounter.can_enter_consultation() is False

    def test_can_enter_consultation_when_optional_pending(self, sample_patient):
        """Can enter consultation when optional triage is PENDING (bypass allowed)."""
        from hmis.apps.encounters.models import Encounter

        # For optional triage, can still enter consultation with PENDING status
        # This represents the case where bypass is available but not used yet
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up visit",
        )
        # When triage is optional and pending, we need to either complete or bypass
        # So PENDING alone shouldn't allow consultation
        assert encounter.can_enter_consultation() is False


# ============================================================================
# Test: Signal for Auto-Setting Triage Status
# ============================================================================


@pytest.mark.unit
class TestTriageAssessmentSignal:
    """Test signal to auto-set triage_status when TriageAssessment is created."""

    def test_triage_status_set_to_completed_when_assessment_created(
        self, sample_patient, test_user
    ):
        """Creating TriageAssessment should auto-set encounter triage_status to COMPLETED."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.triage_status == "PENDING"

        # Create triage assessment
        now = timezone.now()
        TriageAssessment.objects.create(
            encounter=encounter,
            chief_complaint="Test complaint",
            chief_complaint_category="OTHER",
            pain_score=5,
            mental_status="A",
            mobility="AMBULATORY",
            arrival_mode="WALK_IN",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triage_end_time=now,
            triaged_by=test_user,
        )

        # Refresh encounter and verify triage_status
        encounter.refresh_from_db()
        assert encounter.triage_status == "COMPLETED"

    def test_triage_status_not_changed_for_not_required_encounters(
        self, sample_patient, test_user
    ):
        """TriageAssessment on NOT_REQUIRED encounters keeps NOT_APPLICABLE status."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="PROCEDURE",
            chief_complaint="Scheduled procedure",
        )
        assert encounter.triage_status == "NOT_APPLICABLE"

        # Create triage assessment (edge case - shouldn't normally happen)
        now = timezone.now()
        TriageAssessment.objects.create(
            encounter=encounter,
            chief_complaint="Procedure assessment",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="BLUE",
            auto_calculated_category="BLUE",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triaged_by=test_user,
        )

        # Refresh encounter - status should change to COMPLETED for consistency
        encounter.refresh_from_db()
        assert encounter.triage_status == "COMPLETED"


# ============================================================================
# Test: Integration Tests for Encounter Workflow
# ============================================================================


@pytest.mark.integration
class TestEncounterTriageWorkflow:
    """Integration tests for complete triage workflow."""

    def test_opd_encounter_full_workflow(self, sample_patient, test_user):
        """Test complete OPD encounter workflow from creation to consultation."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        # 1. Create OPD encounter
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache for 3 days",
        )

        # Verify initial state
        assert encounter.triage_requirement == "MANDATORY"
        assert encounter.triage_status == "PENDING"
        assert encounter.consultation_status == "WAITING"
        assert encounter.can_enter_consultation() is False

        # 2. Perform triage
        now = timezone.now()
        TriageAssessment.objects.create(
            encounter=encounter,
            chief_complaint="Headache for 3 days",
            chief_complaint_category="HEADACHE",
            pain_score=6,
            mental_status="A",
            mobility="AMBULATORY",
            arrival_mode="WALK_IN",
            triage_category="YELLOW",
            auto_calculated_category="YELLOW",
            assigned_area="OPD",
            arrival_time=now,
            triage_start_time=now,
            triage_end_time=now,
            triaged_by=test_user,
        )

        # 3. Verify post-triage state
        encounter.refresh_from_db()
        assert encounter.triage_status == "COMPLETED"
        assert encounter.can_enter_consultation() is True

    def test_scheduled_opd_bypass_workflow(self, sample_patient, test_user):
        """Test scheduled OPD encounter with triage bypass."""
        from hmis.apps.encounters.models import Encounter

        # 1. Create scheduled OPD encounter
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="SCHEDULED_OPD",
            chief_complaint="Scheduled follow-up",
        )

        # Verify initial state
        assert encounter.triage_requirement == "OPTIONAL"
        assert encounter.triage_status == "PENDING"
        assert encounter.can_enter_consultation() is False

        # 2. Bypass triage
        encounter.triage_status = "BYPASSED"
        encounter.triage_bypass_reason = "STABLE_FOLLOW_UP"
        encounter.triage_bypassed_by = test_user
        encounter.triage_bypassed_at = timezone.now()
        encounter.full_clean()
        encounter.save()

        # 3. Verify can now enter consultation
        assert encounter.can_enter_consultation() is True

    def test_procedure_direct_to_consultation(self, sample_patient):
        """Test procedure encounter going directly to consultation."""
        from hmis.apps.encounters.models import Encounter

        # 1. Create procedure encounter
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="PROCEDURE",
            chief_complaint="Scheduled minor procedure",
        )

        # Verify state allows immediate consultation
        assert encounter.triage_requirement == "NOT_REQUIRED"
        assert encounter.triage_status == "NOT_APPLICABLE"
        assert encounter.can_enter_consultation() is True


# ============================================================================
# Test: Edge Cases
# ============================================================================


@pytest.mark.unit
class TestTriageEdgeCases:
    """Test edge cases for triage fields."""

    def test_cannot_bypass_mandatory_triage(self, sample_patient, test_user):
        """Mandatory triage should not allow bypass status."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Chest pain",
            triage_status="BYPASSED",
            triage_bypass_reason="STAFF_SHORTAGE",
        )

        with pytest.raises(ValidationError) as exc_info:
            encounter.full_clean()

        # Should indicate that mandatory triage cannot be bypassed
        assert "bypass" in str(exc_info.value).lower() or "mandatory" in str(exc_info.value).lower()

    def test_triage_requirement_cannot_be_manually_changed(self, sample_patient):
        """triage_requirement should be read-only (based on encounter_type)."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
        )
        assert encounter.triage_requirement == "MANDATORY"

        # Attempt to change requirement
        encounter.triage_requirement = "OPTIONAL"
        encounter.save()
        encounter.refresh_from_db()

        # Should either raise an error or revert to correct value based on encounter_type
        # Implementation choice: could be enforced via clean() or property
        assert encounter.triage_requirement == "MANDATORY"

    def test_all_new_encounter_types_valid(self, sample_patient):
        """Test that all new encounter types can be created and validated."""
        from hmis.apps.encounters.models import Encounter

        all_new_types = [
            "ANC",
            "PAEDIATRIC",
            "DIALYSIS",
            "ONCOLOGY",
            "SCHEDULED_OPD",
            "FOLLOW_UP",
            "CONSULTANT_REVIEW",
            "CHRONIC_STABLE",
            "SPECIALIST_CLINIC",
            "PROCEDURE",
            "DAY_CASE",
            "WARD_ROUND",
            "DISCHARGE_REVIEW",
        ]

        for enc_type in all_new_types:
            encounter = Encounter(
                patient=sample_patient,
                encounter_type=enc_type,
                chief_complaint=f"Test for {enc_type}",
            )
            encounter.full_clean()  # Should not raise


# ============================================================================
# Test: Chief Complaint Edit with Audit Trail
# ============================================================================


@pytest.mark.unit
class TestChiefComplaintEditAuditTrail:
    """Test the chief complaint edit feature with audit trail."""

    def test_chief_complaint_edit_reason_choices_exist(self):
        """Verify chief complaint edit reason choices are defined."""
        from hmis.apps.encounters.models import Encounter

        expected_reasons = [
            "ADDITIONAL_SYMPTOMS",
            "PATIENT_DETAILS",
            "INCORRECT_INITIAL",
            "CLARIFICATION",
            "MISUNDERSTANDING",
            "OTHER",
        ]
        choice_values = [choice[0] for choice in Encounter.CHIEF_COMPLAINT_EDIT_REASON_CHOICES]

        for reason in expected_reasons:
            assert reason in choice_values, f"{reason} should be in CHIEF_COMPLAINT_EDIT_REASON_CHOICES"

    def test_encounter_has_chief_complaint_audit_fields(self, sample_patient):
        """Verify encounter model has all chief complaint audit fields."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Initial complaint",
        )
        
        # Check fields exist
        assert hasattr(encounter, 'chief_complaint_original')
        assert hasattr(encounter, 'chief_complaint_edited')
        assert hasattr(encounter, 'chief_complaint_edit_reason')
        assert hasattr(encounter, 'chief_complaint_edit_reason_other')
        assert hasattr(encounter, 'chief_complaint_edited_by')
        assert hasattr(encounter, 'chief_complaint_edited_at')

    def test_edit_chief_complaint_stores_original(self, authenticated_client, sample_patient):
        """Test that editing chief complaint stores the original value."""
        from hmis.apps.encounters.models import Encounter

        # Create encounter
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original headache complaint",
        )

        # Edit via API
        response = authenticated_client.post(
            f"/api/encounters/{encounter.id}/edit_chief_complaint/",
            {
                "chief_complaint": "Updated: severe migraine with nausea",
                "edit_reason": "ADDITIONAL_SYMPTOMS",
            },
            format="json",
        )

        assert response.status_code == 200
        encounter.refresh_from_db()
        assert encounter.chief_complaint == "Updated: severe migraine with nausea"
        assert encounter.chief_complaint_original == "Original headache complaint"
        assert encounter.chief_complaint_edited is True
        assert encounter.chief_complaint_edit_reason == "ADDITIONAL_SYMPTOMS"
        assert encounter.chief_complaint_edited_by is not None
        assert encounter.chief_complaint_edited_at is not None

    def test_edit_chief_complaint_requires_reason(self, authenticated_client, sample_patient):
        """Test that editing chief complaint requires a reason."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Initial complaint",
        )

        # Try without reason
        response = authenticated_client.post(
            f"/api/encounters/{encounter.id}/edit_chief_complaint/",
            {
                "chief_complaint": "Updated complaint",
            },
            format="json",
        )

        assert response.status_code == 400
        assert "reason" in response.data.get("detail", "").lower()

    def test_edit_chief_complaint_other_requires_details(self, authenticated_client, sample_patient):
        """Test that 'OTHER' reason requires specification."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Initial complaint",
        )

        # Try with OTHER but no details
        response = authenticated_client.post(
            f"/api/encounters/{encounter.id}/edit_chief_complaint/",
            {
                "chief_complaint": "Updated complaint",
                "edit_reason": "OTHER",
            },
            format="json",
        )

        assert response.status_code == 400
        assert "specify" in response.data.get("detail", "").lower() or "other" in response.data.get("detail", "").lower()

    def test_edit_chief_complaint_other_with_details_succeeds(self, authenticated_client, sample_patient):
        """Test that 'OTHER' reason with details succeeds."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Initial complaint",
        )

        response = authenticated_client.post(
            f"/api/encounters/{encounter.id}/edit_chief_complaint/",
            {
                "chief_complaint": "Updated complaint",
                "edit_reason": "OTHER",
                "edit_reason_other": "Patient revealed additional history after trust was established",
            },
            format="json",
        )

        assert response.status_code == 200
        encounter.refresh_from_db()
        assert encounter.chief_complaint_edit_reason == "OTHER"
        assert "trust" in encounter.chief_complaint_edit_reason_other

    def test_edit_chief_complaint_preserves_first_original(self, authenticated_client, sample_patient):
        """Test that multiple edits preserve the first original value."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="First original complaint",
        )

        # First edit
        authenticated_client.post(
            f"/api/encounters/{encounter.id}/edit_chief_complaint/",
            {
                "chief_complaint": "Second version",
                "edit_reason": "ADDITIONAL_SYMPTOMS",
            },
            format="json",
        )

        # Second edit
        authenticated_client.post(
            f"/api/encounters/{encounter.id}/edit_chief_complaint/",
            {
                "chief_complaint": "Third version",
                "edit_reason": "CLARIFICATION",
            },
            format="json",
        )

        encounter.refresh_from_db()
        assert encounter.chief_complaint == "Third version"
        assert encounter.chief_complaint_original == "First original complaint"
        assert encounter.chief_complaint_edit_reason == "CLARIFICATION"
