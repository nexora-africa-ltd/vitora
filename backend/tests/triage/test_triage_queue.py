"""
Tests for TriageQueue model.

Following TDD approach: Write tests FIRST, then implement the model.
Sprint 1.5-1.6 Track E: Triage Module MVP
"""

from datetime import timedelta

import pytest  # type: ignore
from django.utils import timezone


@pytest.mark.django_db
class TestTriageQueueModel:
    """Test suite for TriageQueue model (20 tests as per spec)."""

    def test_create_queue_entry_with_valid_data(self, sample_encounter, test_user):
        """Should create queue entry linked to triage assessment."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="WAITING",
        )

        assert queue_entry.id is not None
        assert queue_entry.triage_assessment == assessment
        assert queue_entry.status == "WAITING"

    def test_triage_assessment_one_to_one_relationship(self, sample_encounter, test_user):
        """Should enforce one-to-one relationship with triage assessment."""
        from django.db import IntegrityError

        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        # Create first queue entry
        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        # Try to create second queue entry for same assessment
        with pytest.raises(IntegrityError):
            TriageQueue.objects.create(
                triage_assessment=assessment,
                position=2,
            )

    def test_status_default_is_waiting(self, sample_encounter, test_user):
        """Should default status to WAITING."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        assert queue_entry.status == "WAITING"

    def test_status_choices_validation(self, sample_encounter, test_user):
        """Should validate status against allowed choices."""
        from django.core.exceptions import ValidationError

        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue(
            triage_assessment=assessment,
            position=1,
            status="INVALID_STATUS",
        )

        with pytest.raises(ValidationError) as exc_info:
            queue_entry.full_clean()

        assert "status" in str(exc_info.value)

    def test_ordering_by_category_then_arrival_time(
        self, sample_patient, test_user, sample_facility
    ):
        """Should order queue by triage category (RED first) then arrival time (FIFO)."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        # Create encounters and assessments with different categories and times
        encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test 1",
            facility=sample_facility,
        )
        encounter2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test 2",
            facility=sample_facility,
        )
        encounter3 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test 3",
            facility=sample_facility,
        )

        # YELLOW category, arrived 60 minutes ago
        yellow_early = TriageAssessment.objects.create(
            encounter=encounter1,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="YELLOW",
            auto_calculated_category="YELLOW",
            assigned_area="ER_ACUTE",
            arrival_time=timezone.now() - timedelta(minutes=60),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        # RED category, arrived 10 minutes ago
        red_late = TriageAssessment.objects.create(
            encounter=encounter2,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="U",
            mobility="IMMOBILE",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=timezone.now() - timedelta(minutes=10),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        # RED category, arrived 30 minutes ago
        red_early = TriageAssessment.objects.create(
            encounter=encounter3,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="P",
            mobility="STRETCHER",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=timezone.now() - timedelta(minutes=30),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        # Create queue entries
        TriageQueue.objects.create(triage_assessment=yellow_early, position=0)
        TriageQueue.objects.create(triage_assessment=red_late, position=0)
        TriageQueue.objects.create(triage_assessment=red_early, position=0)

        # Get queue in priority order (using Python sorting)
        queue = list(TriageQueue.objects.all().select_related("triage_assessment"))
        queue.sort(
            key=lambda x: (x.triage_assessment.category_priority, x.triage_assessment.arrival_time)
        )

        # RED patients should come first (by arrival), then YELLOW
        assert queue[0].triage_assessment == red_early  # RED, earlier arrival
        assert queue[1].triage_assessment == red_late  # RED, later arrival
        assert queue[2].triage_assessment == yellow_early  # YELLOW

    def test_red_category_patients_appear_first(self, sample_patient, test_user, sample_facility):
        """Should prioritize RED category patients at top of queue."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        # Create GREEN and RED assessments
        green_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test 1",
            facility=sample_facility,
        )
        red_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test 2",
            facility=sample_facility,
        )

        green_assessment = TriageAssessment.objects.create(
            encounter=green_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(hours=1),  # Arrived earlier
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        red_assessment = TriageAssessment.objects.create(
            encounter=red_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="U",
            mobility="IMMOBILE",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=timezone.now(),  # Arrived later
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        TriageQueue.objects.create(triage_assessment=green_assessment, position=0)
        TriageQueue.objects.create(triage_assessment=red_assessment, position=0)

        # Get queue sorted by priority (using Python sorting)
        queue = list(TriageQueue.objects.all().select_related("triage_assessment"))
        queue.sort(
            key=lambda x: (x.triage_assessment.category_priority, x.triage_assessment.arrival_time)
        )

        # RED should be first despite arriving later
        assert queue[0].triage_assessment == red_assessment

    def test_same_category_sorted_by_arrival_time_fifo(
        self, sample_patient, test_user, sample_facility
    ):
        """Should sort same category by arrival time (FIFO)."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        # Create three GREEN assessments with different arrival times
        encounters = [
            Encounter.objects.create(
                patient=sample_patient,
                encounter_type="OPD",
                chief_complaint=f"Test {i}",
                facility=sample_facility,
            )
            for i in range(3)
        ]

        assessment1 = TriageAssessment.objects.create(
            encounter=encounters[0],
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(minutes=30),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        assessment2 = TriageAssessment.objects.create(
            encounter=encounters[1],
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(minutes=20),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        assessment3 = TriageAssessment.objects.create(
            encounter=encounters[2],
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(minutes=10),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        TriageQueue.objects.create(triage_assessment=assessment1, position=0)
        TriageQueue.objects.create(triage_assessment=assessment2, position=0)
        TriageQueue.objects.create(triage_assessment=assessment3, position=0)

        queue = list(TriageQueue.objects.all())

        # Should be ordered by arrival time (earliest first)
        assert queue[0].triage_assessment == assessment1  # Earliest
        assert queue[1].triage_assessment == assessment2  # Middle
        assert queue[2].triage_assessment == assessment3  # Latest

    def test_get_active_queue_excludes_completed(self, sample_encounter, test_user):
        """Should exclude COMPLETED entries from active queue."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="COMPLETED",
        )

        active_queue = TriageQueue.get_active_queue()

        assert queue_entry not in active_queue

    def test_get_active_queue_excludes_lwbs(self, sample_encounter, test_user):
        """Should exclude LWBS entries from active queue."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
            status="LEFT_WITHOUT_BEING_SEEN",
        )

        active_queue = TriageQueue.get_active_queue()

        assert queue_entry not in active_queue

    def test_mark_called_sets_called_at_timestamp(self, sample_encounter, test_user):
        """Should set called_at timestamp when marking as called."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        queue_entry.mark_called(test_user)

        assert queue_entry.called_at is not None
        assert queue_entry.called_by == test_user

    def test_mark_called_changes_status_to_called(self, sample_encounter, test_user):
        """Should change status to CALLED when marking as called."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        queue_entry.mark_called(test_user)

        assert queue_entry.status == "CALLED"

    def test_mark_with_clinician_updates_status(self, sample_encounter, test_user):
        """Should update status to WITH_CLINICIAN."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        queue_entry.mark_with_clinician()

        assert queue_entry.status == "WITH_CLINICIAN"

    def test_mark_with_clinician_sets_seen_by_clinician_time(self, sample_encounter, test_user):
        """Should set seen_by_clinician_time on assessment."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        queue_entry.mark_with_clinician()

        assessment.refresh_from_db()
        assert assessment.seen_by_clinician_time is not None

    def test_mark_completed_changes_status(self, sample_encounter, test_user):
        """Should change status to COMPLETED."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        queue_entry.mark_completed()

        assert queue_entry.status == "COMPLETED"

    def test_mark_lwbs_with_reason(self, sample_encounter, test_user):
        """Should mark as LWBS with reason."""
        from hmis.apps.triage.models import TriageAssessment, TriageQueue

        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Test",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )

        queue_entry = TriageQueue.objects.create(
            triage_assessment=assessment,
            position=1,
        )

        reason = "Patient left due to long wait time"
        queue_entry.mark_lwbs(reason)

        assert queue_entry.status == "LEFT_WITHOUT_BEING_SEEN"
        assert reason in queue_entry.notes
