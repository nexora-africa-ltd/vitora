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


class TestCommentReactions:
    """Tests for emoji reactions on comments."""

    def test_add_reaction(self, authenticated_client, sample_encounter, sample_comment):
        """Should add a reaction to a comment."""
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/react/"
        response = authenticated_client.post(url, {"emoji": "👍"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["comment_id"] == sample_comment.id
        assert any(r["emoji"] == "👍" and r["count"] == 1 for r in response.data["reactions"])
        assert "👍" in response.data["user_reactions"]

    def test_toggle_off_reaction(self, authenticated_client, sample_encounter, sample_comment):
        """Should remove reaction when toggled again."""
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/react/"
        # Add
        authenticated_client.post(url, {"emoji": "👍"})
        # Toggle off
        response = authenticated_client.post(url, {"emoji": "👍"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["reactions"] == []
        assert response.data["user_reactions"] == []

    def test_multiple_users_react(
        self,
        authenticated_client,
        api_client,
        sample_encounter,
        sample_comment,
        another_user_with_profile,
    ):
        """Multiple users can react with same emoji."""
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/react/"
        # User 1
        authenticated_client.post(url, {"emoji": "❤️"})
        # User 2
        api_client.force_authenticate(user=another_user_with_profile)
        response = api_client.post(url, {"emoji": "❤️"})
        assert response.status_code == status.HTTP_200_OK
        heart_reaction = next(r for r in response.data["reactions"] if r["emoji"] == "❤️")
        assert heart_reaction["count"] == 2

    def test_multiple_emojis_on_same_comment(
        self, authenticated_client, sample_encounter, sample_comment
    ):
        """A user can react with different emojis."""
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/react/"
        authenticated_client.post(url, {"emoji": "👍"})
        response = authenticated_client.post(url, {"emoji": "🎉"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["reactions"]) == 2
        assert "👍" in response.data["user_reactions"]
        assert "🎉" in response.data["user_reactions"]

    def test_empty_emoji_rejected(self, authenticated_client, sample_encounter, sample_comment):
        """Should reject empty emoji."""
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/react/"
        response = authenticated_client.post(url, {"emoji": ""})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reactions_in_comment_serializer(
        self, authenticated_client, sample_encounter, sample_comment
    ):
        """Comment list should include reactions data."""
        from hmis.apps.comments.models import CommentReaction

        CommentReaction.objects.create(
            comment=sample_comment, user=sample_comment.author, emoji="✅"
        )
        url = f"/api/encounters/{sample_encounter.id}/comments/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        comment_data = next(c for c in results if c["id"] == sample_comment.id)
        assert "reactions" in comment_data
        assert any(r["emoji"] == "✅" for r in comment_data["reactions"])


class TestMentionSuggestions:
    """Tests for @mention autocomplete endpoint."""

    def test_search_by_username(self, authenticated_client, another_user_with_profile):
        """Should find user by username prefix."""
        response = authenticated_client.get("/api/comments/mentions/", {"q": "drj"})
        assert response.status_code == status.HTTP_200_OK
        usernames = [u["username"] for u in response.data]
        assert "drjones" in usernames

    def test_search_by_first_name(self, authenticated_client, another_user_with_profile):
        """Should find user by first name."""
        response = authenticated_client.get("/api/comments/mentions/", {"q": "Jan"})
        assert response.status_code == status.HTTP_200_OK
        usernames = [u["username"] for u in response.data]
        assert "drjones" in usernames

    def test_search_by_last_name(self, authenticated_client, another_user_with_profile):
        """Should find user by last name."""
        response = authenticated_client.get("/api/comments/mentions/", {"q": "Jon"})
        assert response.status_code == status.HTTP_200_OK
        usernames = [u["username"] for u in response.data]
        assert "drjones" in usernames

    def test_excludes_self(self, authenticated_client, test_user):
        """Should not include the requesting user in suggestions."""
        response = authenticated_client.get("/api/comments/mentions/", {"q": test_user.username})
        assert response.status_code == status.HTTP_200_OK
        user_ids = [u["id"] for u in response.data]
        assert test_user.id not in user_ids

    def test_org_scoped_no_cross_org(
        self, authenticated_client, db, sample_role, sample_department
    ):
        """Should NOT return users from a different organization."""
        from hmis.apps.core.models import Organization, StaffProfile

        other_org = Organization.objects.create(name="Other Org", slug="other-org")
        other_user = User.objects.create_user(
            username="otherdoc",
            email="other@other.org",
            password="pass123",
            first_name="Other",
            last_name="Doctor",
        )
        StaffProfile.objects.create(
            user=other_user,
            employee_id="OTHER-001",
            organization=other_org,
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined="2026-01-01",
        )
        response = authenticated_client.get("/api/comments/mentions/", {"q": "otherdoc"})
        assert response.status_code == status.HTTP_200_OK
        usernames = [u["username"] for u in response.data]
        assert "otherdoc" not in usernames

    def test_empty_query_returns_org_staff(self, authenticated_client, another_user_with_profile):
        """Empty query should return org staff (for immediate dropdown on @ trigger)."""
        response = authenticated_client.get("/api/comments/mentions/", {"q": ""})
        assert response.status_code == status.HTTP_200_OK
        # Should include the other user in the same org
        assert len(response.data) >= 1
        usernames = [u["username"] for u in response.data]
        assert "drjones" in usernames

    def test_unauthenticated_rejected(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/comments/mentions/", {"q": "test"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestCommentWebSocketBroadcast:
    """Tests for WebSocket broadcast on comment events."""

    def test_create_broadcasts_to_websocket(
        self, mocker, sample_encounter, test_user, encounter_content_type
    ):
        """Creating a comment should broadcast via WebSocket."""
        mock_broadcast = mocker.patch("hmis.apps.comments.signals.broadcast_comment_event")
        ClinicalComment.objects.create(
            content_type=encounter_content_type,
            object_id=sample_encounter.id,
            author=test_user,
            body="WS test",
            facility=sample_encounter.facility,
        )
        mock_broadcast.assert_called_once()
        args = mock_broadcast.call_args[0]
        assert args[0] == "encounter"  # content_type_model
        assert args[1] == sample_encounter.id  # object_id
        assert args[2] == "created"  # event_type
        assert args[3]["body"] == "WS test"

    def test_update_broadcasts_to_websocket(self, mocker, sample_comment):
        """Editing a comment should broadcast 'updated' event."""
        mock_broadcast = mocker.patch("hmis.apps.comments.signals.broadcast_comment_event")
        sample_comment.body = "Edited body"
        sample_comment.is_edited = True
        sample_comment.save()
        mock_broadcast.assert_called_once()
        args = mock_broadcast.call_args[0]
        assert args[2] == "updated"
        assert args[3]["body"] == "Edited body"
        assert args[3]["is_edited"] is True

    def test_delete_broadcasts_to_websocket(self, mocker, sample_comment):
        """Soft-deleting a comment should broadcast 'deleted' event."""
        mock_broadcast = mocker.patch("hmis.apps.comments.signals.broadcast_comment_event")
        sample_comment.is_deleted = True
        sample_comment.body = "[deleted]"
        sample_comment.save()
        mock_broadcast.assert_called_once()
        args = mock_broadcast.call_args[0]
        assert args[2] == "deleted"
        assert args[3] == {"id": sample_comment.pk}

    def test_reaction_broadcasts_to_websocket(
        self, mocker, authenticated_client, sample_encounter, sample_comment
    ):
        """Adding a reaction should broadcast via WebSocket."""
        mock_broadcast = mocker.patch("hmis.apps.comments.views.broadcast_comment_event")
        url = f"/api/encounters/{sample_encounter.id}/comments/{sample_comment.id}/react/"
        authenticated_client.post(url, {"emoji": "👍"})
        mock_broadcast.assert_called_once()
        args = mock_broadcast.call_args[0]
        assert args[2] == "reaction_added"
        assert args[3]["emoji"] == "👍"


class TestAdmissionComments:
    """Tests for comments on inpatient admissions."""

    @pytest.fixture
    def sample_admission(
        self,
        db,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
    ):
        """Create a sample admission for comment tests."""
        from datetime import date

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.inpatient.models import Admission, Ward

        ward = Ward.objects.create(
            name="Medical Ward",
            code="MW001",
            ward_type="GENERAL",
            capacity=10,
            daily_rate=1500,
            facility=sample_facility,
            organization=sample_organization,
        )
        bed = ward.beds.first()
        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Pneumonia admission",
            facility=sample_facility,
            organization=sample_organization,
        )
        return Admission.objects.create(
            patient=sample_patient,
            opd_encounter=sample_encounter,
            ipd_encounter=ipd_encounter,
            admission_date=date(2026, 5, 1),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            attending_doctor=test_user,
            ward=ward,
            bed=bed,
            payer_type="CASH",
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_create_comment_on_admission(self, authenticated_client, sample_admission):
        """Should create a comment on an admission."""
        url = f"/api/admissions/{sample_admission.id}/comments/"
        response = authenticated_client.post(url, {"body": "Patient stable overnight."})
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["body"] == "Patient stable overnight."
        assert response.data["author"]["username"] == "testuser"

    def test_list_admission_comments(self, authenticated_client, sample_admission):
        """Should list comments on an admission."""
        url = f"/api/admissions/{sample_admission.id}/comments/"
        authenticated_client.post(url, {"body": "First note."})
        authenticated_client.post(url, {"body": "Second note."})

        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 2

    def test_admission_comment_uses_admission_facility(
        self, authenticated_client, sample_admission
    ):
        """Comment should auto-resolve facility from the admission."""
        url = f"/api/admissions/{sample_admission.id}/comments/"
        response = authenticated_client.post(url, {"body": "Test facility scoping."})
        assert response.status_code == status.HTTP_201_CREATED

        comment = ClinicalComment.objects.get(id=response.data["id"])
        assert comment.facility_id == sample_admission.facility_id
        assert comment.organization_id == sample_admission.organization_id


class TestShiftComments:
    """Tests for comments on scheduling shifts."""

    @pytest.fixture
    def sample_shift(self, db, sample_facility, sample_organization, test_user):
        """Create a sample shift for comment tests."""
        from datetime import date, time

        from hmis.apps.scheduling.models import Resource, Shift

        resource = Resource.objects.create(
            name="Dr. Test",
            resource_type="STAFF",
            facility=sample_facility,
            organization=sample_organization,
        )
        return Shift.objects.create(
            staff_resource=resource,
            shift_date=date(2026, 6, 1),
            start_time=time(8, 0),
            end_time=time(16, 0),
            shift_type="DAY",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_create_comment_on_shift(self, authenticated_client, sample_shift):
        """Should create a comment on a shift."""
        url = f"/api/scheduling/shifts/{sample_shift.id}/comments/"
        response = authenticated_client.post(url, {"body": "Swap request for this shift."})
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["body"] == "Swap request for this shift."

    def test_list_shift_comments(self, authenticated_client, sample_shift):
        """Should list comments on a shift."""
        url = f"/api/scheduling/shifts/{sample_shift.id}/comments/"
        authenticated_client.post(url, {"body": "First note."})
        authenticated_client.post(url, {"body": "Second note."})

        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 2

    def test_shift_comment_uses_shift_facility(self, authenticated_client, sample_shift):
        """Comment should auto-resolve facility from the shift."""
        url = f"/api/scheduling/shifts/{sample_shift.id}/comments/"
        response = authenticated_client.post(url, {"body": "Facility scoping."})
        assert response.status_code == status.HTTP_201_CREATED

        comment = ClinicalComment.objects.get(id=response.data["id"])
        assert comment.facility_id == sample_shift.facility_id
        assert comment.organization_id == sample_shift.organization_id
