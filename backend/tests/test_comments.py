"""
Tests for Clinical Comments feature.

Covers:
- Model validation (allowed content types, threading)
- API CRUD (create, list, retrieve, update, soft-delete)
- Mention parsing and notification creation
- Permission checks (author-only edit/delete, admin override)
- Thread structure and filtering
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework import status

from hmis.apps.comments.models import ClinicalComment
from hmis.apps.comments.utils import parse_mentions

User = get_user_model()


@pytest.fixture
def encounter_content_type(db):
    """ContentType for Encounter model."""
    return ContentType.objects.get(app_label="encounters", model="encounter")


@pytest.fixture
def sample_comment(db, sample_encounter, test_user, encounter_content_type):
    """Create a sample comment on an encounter."""
    return ClinicalComment.objects.create(
        content_type=encounter_content_type,
        object_id=sample_encounter.id,
        author=test_user,
        body="Initial assessment looks good.",
        facility=sample_encounter.facility,
        organization=sample_encounter.organization,
    )


@pytest.fixture
def another_user_with_profile(
    db, sample_organization, sample_facility, sample_role, sample_department
):
    """Create a second user with a staff profile for mention tests."""
    from hmis.apps.core.models import StaffProfile

    user = User.objects.create_user(
        username="drjones",
        email="drjones@test.co.ke",
        password="testpass123",
        first_name="Jane",
        last_name="Jones",
    )
    StaffProfile.objects.create(
        user=user,
        employee_id="TEST-0002",
        organization=sample_organization,
        primary_facility=sample_facility,
        primary_role=sample_role,
        primary_department=sample_department,
        date_joined="2026-01-01",
    )
    return user


class TestClinicalCommentModel:
    """Tests for ClinicalComment model."""

    def test_create_comment(self, sample_encounter, test_user, encounter_content_type):
        """Should create a comment and auto-resolve facility."""
        comment = ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="Test comment.",
        )
        # Facility should be resolved from encounter
        assert comment.facility_id == sample_encounter.facility_id
        assert comment.organization_id == sample_encounter.organization_id

    def test_soft_delete_display_body(self, sample_comment):
        """Soft-deleted comment should show '[deleted]'."""
        sample_comment.is_deleted = True
        sample_comment.save()
        assert sample_comment.display_body == "[deleted]"

    def test_replies_count(
        self, sample_comment, test_user, encounter_content_type, sample_encounter
    ):
        """replies_count should only count non-deleted replies."""
        ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="Reply 1",
            parent=sample_comment,
            facility=sample_encounter.facility,
        )
        ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="Deleted reply",
            parent=sample_comment,
            facility=sample_encounter.facility,
            is_deleted=True,
        )
        assert sample_comment.replies_count == 1

    def test_threading_unlimited_depth(
        self, sample_comment, test_user, encounter_content_type, sample_encounter
    ):
        """Should support unlimited nesting depth."""
        reply1 = ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="Reply level 1",
            parent=sample_comment,
            facility=sample_encounter.facility,
        )
        reply2 = ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="Reply level 2",
            parent=reply1,
            facility=sample_encounter.facility,
        )
        assert reply2.parent == reply1
        assert reply1.parent == sample_comment


class TestMentionParsing:
    """Tests for the mention parsing utility."""

    def test_parse_single_mention(self, another_user_with_profile, sample_organization):
        """Should resolve @username to a user."""
        users = parse_mentions("Hey @drjones check this", sample_organization.id)
        assert another_user_with_profile in users

    def test_parse_no_mentions(self, sample_organization):
        """Should return empty list when no mentions."""
        users = parse_mentions("Regular comment without mentions", sample_organization.id)
        assert users == []

    def test_parse_nonexistent_user(self, sample_organization):
        """Should skip usernames that don't exist."""
        users = parse_mentions("Hey @nonexistent_user", sample_organization.id)
        assert users == []

    def test_parse_multiple_mentions(
        self, another_user_with_profile, test_user, sample_organization
    ):
        """Should resolve multiple mentions."""
        body = f"@{test_user.username} and @drjones please review"
        users = parse_mentions(body, sample_organization.id)
        assert another_user_with_profile in users

    def test_empty_body(self, sample_organization):
        """Should handle empty body."""
        assert parse_mentions("", sample_organization.id) == []
        assert parse_mentions(None, sample_organization.id) == []


class TestCommentAPI:
    """Tests for the comment REST API."""

    def test_create_comment_on_encounter(self, authenticated_client, sample_encounter):
        """Should create a comment via API."""
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.post(url, {"body": "Looks good."})
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["body"] == "Looks good."
        assert response.data["author"]["username"] == "testuser"
        assert response.data["parent"] is None

    def test_create_reply(self, authenticated_client, sample_encounter, sample_comment):
        """Should create a threaded reply."""
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.post(url, {"body": "I agree.", "parent": sample_comment.id})
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["parent"] == sample_comment.id

    def test_list_top_level_comments(self, authenticated_client, sample_encounter, sample_comment):
        """Default listing should show only top-level comments."""
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        for comment in results:
            assert comment["parent"] is None

    def test_list_replies(
        self,
        authenticated_client,
        sample_encounter,
        sample_comment,
        test_user,
        encounter_content_type,
    ):
        """Filtering by parent should return replies."""
        ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="A reply",
            parent=sample_comment,
            facility=sample_encounter.facility,
        )
        url = f"/api/encounters/{sample_encounter.id}/comments/?parent={sample_comment.id}"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["body"] == "A reply"

    def test_update_own_comment(self, authenticated_client, sample_encounter, sample_comment):
        """Author should be able to edit their comment."""
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/"
        response = authenticated_client.patch(url, {"body": "Updated text"})
        assert response.status_code == status.HTTP_200_OK
        sample_comment.refresh_from_db()
        assert sample_comment.body == "Updated text"
        assert sample_comment.is_edited is True
        assert sample_comment.edited_at is not None

    def test_cannot_update_others_comment(
        self, api_client, sample_encounter, sample_comment, another_user_with_profile
    ):
        """Non-author should not be able to edit another's comment."""
        api_client.force_authenticate(user=another_user_with_profile)
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/"
        response = api_client.patch(url, {"body": "Hacked!"})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_soft_delete_own_comment(self, authenticated_client, sample_encounter, sample_comment):
        """Author should be able to soft-delete their comment."""
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/"
        response = authenticated_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        sample_comment.refresh_from_db()
        assert sample_comment.is_deleted is True
        assert sample_comment.body == "[deleted]"

    def test_cannot_delete_others_comment(
        self, api_client, sample_encounter, sample_comment, another_user_with_profile
    ):
        """Non-author, non-admin should not be able to delete another's comment."""
        api_client.force_authenticate(user=another_user_with_profile)
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/"
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_access_denied(self, api_client, sample_encounter):
        """Unauthenticated request should be rejected."""
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_empty_body_rejected(self, authenticated_client, sample_encounter):
        """Empty comment body should be rejected."""
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.post(url, {"body": "   "})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_parent_must_belong_to_same_target(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
        encounter_content_type,
        sample_facility,
    ):
        """Parent comment from a different encounter should be rejected."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient

        # Create another encounter
        patient = sample_encounter.patient
        other_encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Cough",
            facility=sample_facility,
        )
        # Create comment on the other encounter
        other_comment = ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=other_encounter.id,
            author=test_user,
            body="Different encounter comment",
            facility=sample_facility,
        )
        # Try to reply to that comment from the first encounter's URL
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.post(
            url, {"body": "Cross-target reply", "parent": other_comment.id}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestCommentNotifications:
    """Tests for mention notifications."""

    def test_mention_creates_notification(
        self, authenticated_client, sample_encounter, another_user_with_profile
    ):
        """Mentioning a user should create a Notification."""
        from hmis.apps.core.models import Notification

        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.post(url, {"body": "@drjones please check this patient."})
        assert response.status_code == status.HTTP_201_CREATED

        # Check notification was created for drjones
        notifs = Notification.objects.filter(
            user=another_user_with_profile, notification_type="comment_mention"
        )
        assert notifs.count() == 1
        assert "mentioned you" in notifs.first().message

    def test_reply_notifies_parent_author(
        self, api_client, sample_encounter, sample_comment, another_user_with_profile
    ):
        """Replying to a comment should notify the parent comment's author."""
        from hmis.apps.core.models import Notification

        api_client.force_authenticate(user=another_user_with_profile)
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = api_client.post(url, {"body": "Great point!", "parent": sample_comment.id})
        assert response.status_code == status.HTTP_201_CREATED

        # Parent author (test_user) should get a reply notification
        notifs = Notification.objects.filter(
            user=sample_comment.author, notification_type="comment_reply"
        )
        assert notifs.count() == 1

    def test_self_mention_no_notification(self, authenticated_client, sample_encounter, test_user):
        """Mentioning yourself should not create a notification."""
        from hmis.apps.core.models import Notification

        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.post(url, {"body": f"Note to self @{test_user.username}"})
        assert response.status_code == status.HTTP_201_CREATED

        notifs = Notification.objects.filter(user=test_user, notification_type="comment_mention")
        assert notifs.count() == 0


class TestCommentDomainEvents:
    """Tests for domain event publishing."""

    def test_create_publishes_event(
        self, mocker, sample_encounter, test_user, encounter_content_type
    ):
        """Creating a comment should publish COMMENT_CREATED event."""
        mock_publish = mocker.patch("hmis.apps.comments.signals.publish_event")
        ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="Event test",
            facility=sample_encounter.facility,
        )
        mock_publish.assert_called()
        call_args = mock_publish.call_args_list[0]
        assert call_args[0][0] == "comments.comment.created"
