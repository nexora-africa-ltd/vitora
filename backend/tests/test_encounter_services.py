"""
Tests for encounters services - patient called notifications.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.core.models import Notification
from hmis.apps.encounters.services import (
    broadcast_patient_called_notification,
    create_patient_called_notification,
)

User = get_user_model()


@pytest.mark.django_db
class TestPatientCalledNotification:
    """Tests for patient called notification service."""

    def test_create_patient_called_notification(self, sample_encounter, test_user):
        """Should create notification when patient is called."""
        notification = create_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
        )

        assert notification is not None
        assert notification.notification_type == "patient_called"
        assert notification.priority == "high"
        assert notification.user == test_user
        assert sample_encounter.patient.first_name in notification.title
        assert sample_encounter.patient.mrn in notification.message
        assert notification.related_model == "Encounter"
        assert notification.related_id == sample_encounter.id
        assert f"/encounters/{sample_encounter.id}" in notification.action_url

    def test_create_notification_includes_patient_details(self, sample_encounter, test_user):
        """Should include patient name and MRN in notification."""
        notification = create_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
        )

        patient = sample_encounter.patient
        expected_name = f"{patient.first_name} {patient.last_name}"

        assert expected_name in notification.title
        assert patient.mrn in notification.message

    def test_broadcast_notification_to_caller(self, sample_encounter, test_user):
        """Should broadcast notification to caller when no target users specified."""
        notifications = broadcast_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
            target_users=None,
        )

        assert len(notifications) == 1
        assert notifications[0].user == test_user
        assert notifications[0].notification_type == "patient_called"

    def test_broadcast_notification_to_multiple_users(self, sample_encounter, test_user):
        """Should broadcast notification to multiple target users."""
        # Create additional users
        user2 = User.objects.create_user(
            username="reception_user",
            password="testpass123",
        )
        user3 = User.objects.create_user(
            username="nurse_user",
            password="testpass123",
        )

        target_users = [test_user, user2, user3]

        notifications = broadcast_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
            target_users=target_users,
        )

        assert len(notifications) == 3

        notified_users = [n.user for n in notifications]
        assert test_user in notified_users
        assert user2 in notified_users
        assert user3 in notified_users

    def test_broadcast_notification_includes_caller_name(self, sample_encounter, test_user):
        """Should include who called the patient in broadcast message."""
        test_user.first_name = "Doctor"
        test_user.last_name = "Smith"
        test_user.save()

        notifications = broadcast_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
            target_users=[test_user],
        )

        assert "Doctor Smith" in notifications[0].message

    def test_broadcast_notification_uses_username_if_no_full_name(
        self, sample_encounter, test_user
    ):
        """Should use username when full name is not set."""
        test_user.first_name = ""
        test_user.last_name = ""
        test_user.save()

        notifications = broadcast_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
            target_users=[test_user],
        )

        assert test_user.username in notifications[0].message

    def test_notification_persisted_to_database(self, sample_encounter, test_user):
        """Should persist notification to database."""
        initial_count = Notification.objects.count()

        create_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
        )

        assert Notification.objects.count() == initial_count + 1

    def test_broadcast_creates_separate_notifications_per_user(self, sample_encounter, test_user):
        """Each user should get their own notification instance."""
        user2 = User.objects.create_user(
            username="another_user",
            password="testpass123",
        )

        notifications = broadcast_patient_called_notification(
            encounter=sample_encounter,
            called_by=test_user,
            target_users=[test_user, user2],
        )

        # Verify separate notification IDs
        notification_ids = [n.id for n in notifications]
        assert len(notification_ids) == len(set(notification_ids))
