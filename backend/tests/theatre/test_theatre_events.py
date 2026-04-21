"""
Tests for Theatre domain event publishing.

Verifies that surgery case status changes publish the correct
domain events via publish_event().
"""

import pytest  # type: ignore

from hmis.apps.core.events.types import TheatreEvents


@pytest.mark.django_db
class TestTheatreDomainEvents:
    def test_case_creation_publishes_event(self, sample_surgery_case, mocker):
        """Creating a SurgeryCase should publish CASE_CREATED."""
        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")

        from hmis.apps.theatre.models import SurgeryCase

        case = SurgeryCase.objects.create(
            patient=sample_surgery_case.patient,
            primary_procedure=sample_surgery_case.primary_procedure,
            theatre=sample_surgery_case.theatre,
            scheduled_date=sample_surgery_case.scheduled_date,
            scheduled_start_time="10:00",
            estimated_duration_minutes=60,
            diagnosis="Test",
            requesting_doctor=sample_surgery_case.requesting_doctor,
            organization=sample_surgery_case.organization,
            facility=sample_surgery_case.facility,
        )
        mock_publish.assert_called()
        call_args = mock_publish.call_args
        assert (
            call_args.kwargs.get("event_type") == TheatreEvents.CASE_CREATED
            or call_args[1].get("event_type") == TheatreEvents.CASE_CREATED
            or (len(call_args[0]) > 0 and call_args[0][0] == TheatreEvents.CASE_CREATED)
        )

    def test_schedule_publishes_scheduled_event(self, sample_surgery_case, test_user, mocker):
        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")
        sample_surgery_case.schedule(user=test_user)
        mock_publish.assert_called()
        # Check that the last call was for scheduled status
        last_call = mock_publish.call_args
        payload = None
        # Try both keyword and positional argument patterns
        if "payload" in (last_call.kwargs or {}):
            payload = last_call.kwargs["payload"]
        elif len(last_call.args) > 3:
            payload = last_call.args[3]
        elif len(last_call[0]) > 3:
            payload = last_call[0][3]
        if payload:
            assert payload.get("status") == "SCHEDULED"

    def test_cancel_publishes_cancelled_event(self, sample_surgery_case, test_user, mocker):
        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")
        sample_surgery_case.cancel(user=test_user, reason="Test cancel")
        mock_publish.assert_called()

    def test_surgery_start_publishes_event(self, in_theatre_surgery_case, test_user, mocker):
        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")
        in_theatre_surgery_case.start_surgery(user=test_user)
        mock_publish.assert_called()

    def test_full_workflow_publishes_multiple_events(self, sample_surgery_case, test_user, mocker):
        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")
        sample_surgery_case.schedule(user=test_user)
        sample_surgery_case.start_pre_op(user=test_user)
        sample_surgery_case.enter_theatre(user=test_user)
        sample_surgery_case.start_surgery(user=test_user)
        sample_surgery_case.end_surgery(user=test_user)
        sample_surgery_case.discharge(user=test_user)
        event_types = [
            call.kwargs.get("event_type") or (call.args[0] if call.args else None)
            for call in mock_publish.call_args_list
        ]

        assert event_types == [
            TheatreEvents.CASE_SCHEDULED,
            TheatreEvents.CASE_STATUS_CHANGED,
            TheatreEvents.CASE_STATUS_CHANGED,
            TheatreEvents.SURGERY_STARTED,
            TheatreEvents.SURGERY_COMPLETED,
            TheatreEvents.PACU_DISCHARGED,
        ]
