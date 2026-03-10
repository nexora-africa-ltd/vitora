"""
Tests for AI Phase 2 — session management and chat response schema alignment.

Tests cover:
- Chat response includes ``id`` and ``timestamp`` in message (schema alignment)
- Session creation on first chat message
- Session reuse when ``session_id`` is provided
- Auto-title from first user message
- GET /api/ai/clinical/chat/sessions/ — list sessions
- GET /api/ai/clinical/chat/session/{id}/ — session detail with messages
- DELETE /api/ai/clinical/chat/session/{id}/ — delete session
- Feature-flag gating on session endpoints
- User isolation (cannot access another user's sessions)
- Response shape matches frontend Zod schemas exactly
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status

from hmis.apps.ai.models import ChatMessage, ChatSession

User = get_user_model()


@pytest.fixture
def authenticated_client(api_client, test_user):
    """Authenticated AI client with an allowed conversational AI role."""
    test_user.role = "DOCTOR"
    api_client.force_authenticate(user=test_user)
    return api_client


# =============================================================================
# Helpers
# =============================================================================


def _create_session(user, title="Test Chat", num_messages=2):
    """Create a ChatSession with messages for testing."""
    session = ChatSession.objects.create(user=user, title=title)
    for i in range(num_messages):
        role = "user" if i % 2 == 0 else "assistant"
        ChatMessage.objects.create(
            session=session,
            role=role,
            content=f"Message {i + 1}",
        )
    return session


# =============================================================================
# Chat response schema alignment
# =============================================================================


@pytest.mark.django_db
class TestClinicalChatResponseSchema:
    """
    Verify that POST /api/ai/clinical/chat/ returns responses matching
    the frontend AIClinicalChatResponseSchema:

    {
        session_id: string,
        message: { id: string, role: string, content: string, timestamp: string },
        error?: string
    }
    """

    @override_settings(TIBABOT_ENABLED=True)
    def test_response_has_session_id_and_structured_message(
        self, authenticated_client
    ):
        """Response must include session_id and message with id+timestamp."""
        mock_response = {
            "session_id": "ignored-tibabot-session",
            "message": {
                "role": "assistant",
                "content": "Based on the presentation...",
            },
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "DDx for chest pain?"},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # session_id must be a valid UUID string
        assert "session_id" in data
        uuid.UUID(data["session_id"])  # raises if invalid

        # message must have id, role, content, timestamp
        msg = data["message"]
        assert "id" in msg
        uuid.UUID(msg["id"])
        assert msg["role"] == "assistant"
        assert len(msg["content"]) > 0
        assert "timestamp" in msg

        # No isStreaming in backend response (frontend-only field)
        assert "isStreaming" not in msg

    @override_settings(TIBABOT_ENABLED=True)
    def test_error_response_also_has_proper_message_shape(
        self, authenticated_client
    ):
        """Even error fallback responses must have id+timestamp."""
        from hmis.apps.ai.client import TibaBotUnavailableError

        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.side_effect = TibaBotUnavailableError(
                "unavailable"
            )
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "test"},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        msg = response.data["message"]
        assert "id" in msg
        uuid.UUID(msg["id"])
        assert "timestamp" in msg
        assert msg["role"] == "assistant"
        assert "error" in response.data

    @override_settings(TIBABOT_ENABLED=True)
    def test_session_created_on_new_chat(self, authenticated_client, test_user):
        """A new ChatSession should be created when no session_id provided."""
        mock_response = {
            "message": {"role": "assistant", "content": "Response"},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "Hello TibaBot"},
                format="json",
            )

        session_id = response.data["session_id"]
        session = ChatSession.objects.get(id=session_id)
        assert session.user == test_user
        # Auto-title from first message
        assert session.title == "Hello TibaBot"
        # 2 messages: user + assistant
        assert session.messages.count() == 2

    @override_settings(TIBABOT_ENABLED=True)
    def test_session_reused_when_session_id_provided(
        self, authenticated_client, test_user
    ):
        """Should continue an existing session when session_id is given."""
        session = ChatSession.objects.create(user=test_user, title="Existing")
        # Pre-populate with a user message so auto-title doesn't trigger
        ChatMessage.objects.create(
            session=session, role="user", content="Initial question"
        )

        mock_response = {
            "message": {"role": "assistant", "content": "Follow-up response"},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "Follow-up question", "session_id": str(session.id)},
                format="json",
            )

        assert response.data["session_id"] == str(session.id)
        # Title unchanged since a user message already existed
        session.refresh_from_db()
        assert session.title == "Existing"

    @override_settings(TIBABOT_ENABLED=True)
    def test_creates_new_session_when_invalid_session_id(
        self, authenticated_client
    ):
        """Should create a new session when session_id doesn't exist."""
        fake_id = str(uuid.uuid4())
        mock_response = {
            "message": {"role": "assistant", "content": "New session"},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "First message", "session_id": fake_id},
                format="json",
            )

        # A new session should have been created
        assert response.data["session_id"] != fake_id

    @override_settings(TIBABOT_ENABLED=True)
    def test_user_messages_persisted(self, authenticated_client, test_user):
        """Both user and assistant messages should be persisted."""
        mock_response = {
            "message": {"role": "assistant", "content": "AI answer"},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            response = authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "User question"},
                format="json",
            )

        session_id = response.data["session_id"]
        messages = list(
            ChatMessage.objects.filter(session_id=session_id).order_by("timestamp")
        )
        assert len(messages) == 2
        assert messages[0].role == "user"
        assert messages[0].content == "User question"
        assert messages[1].role == "assistant"
        assert messages[1].content == "AI answer"


# =============================================================================
# Session List
# =============================================================================


@pytest.mark.django_db
class TestClinicalChatSessionListEndpoint:
    """Tests for GET /api/ai/clinical/chat/sessions/."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client):
        response = authenticated_client.get("/api/ai/clinical/chat/sessions/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/ai/clinical/chat/sessions/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_forbids_unauthorized_roles(self, api_client, test_user):
        test_user.role = "NURSE"
        api_client.force_authenticate(user=test_user)

        response = api_client.get("/api/ai/clinical/chat/sessions/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_empty_sessions(self, authenticated_client):
        response = authenticated_client.get("/api/ai/clinical/chat/sessions/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"sessions": []}

    @override_settings(TIBABOT_ENABLED=True)
    def test_returns_user_sessions(self, authenticated_client, test_user):
        """Should return sessions matching AIChatSessionSchema."""
        s1 = _create_session(test_user, title="Chat about malaria", num_messages=4)
        s2 = _create_session(test_user, title="Dengue DDx", num_messages=2)

        response = authenticated_client.get("/api/ai/clinical/chat/sessions/")

        assert response.status_code == status.HTTP_200_OK
        sessions = response.data["sessions"]
        assert len(sessions) == 2

        # Verify schema shape for each session
        for s in sessions:
            assert "id" in s
            uuid.UUID(s["id"])
            assert "title" in s
            assert "created_at" in s
            assert "updated_at" in s
            assert "message_count" in s
            assert isinstance(s["message_count"], int)

    @override_settings(TIBABOT_ENABLED=True)
    def test_sessions_ordered_by_updated_at_desc(
        self, authenticated_client, test_user
    ):
        """Most recently updated session should appear first."""
        s1 = _create_session(test_user, title="Older")
        s2 = _create_session(test_user, title="Newer")

        response = authenticated_client.get("/api/ai/clinical/chat/sessions/")
        sessions = response.data["sessions"]
        assert sessions[0]["title"] == "Newer"
        assert sessions[1]["title"] == "Older"

    @override_settings(TIBABOT_ENABLED=True)
    def test_user_isolation(self, authenticated_client, test_user):
        """Should NOT return sessions belonging to other users."""
        other_user = User.objects.create_user(
            username="other_clinician",
            email="other@test.com",
            password="pass123",
        )
        _create_session(test_user, title="My session")
        _create_session(other_user, title="Their session")

        response = authenticated_client.get("/api/ai/clinical/chat/sessions/")
        sessions = response.data["sessions"]
        assert len(sessions) == 1
        assert sessions[0]["title"] == "My session"


# =============================================================================
# Session Detail
# =============================================================================


@pytest.mark.django_db
class TestClinicalChatSessionDetailEndpoint:
    """Tests for GET/DELETE /api/ai/clinical/chat/session/{id}/."""

    @override_settings(TIBABOT_ENABLED=False)
    def test_returns_404_when_disabled(self, authenticated_client):
        fake_id = str(uuid.uuid4())
        response = authenticated_client.get(
            f"/api/ai/clinical/chat/session/{fake_id}/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_requires_authentication(self, api_client):
        fake_id = str(uuid.uuid4())
        response = api_client.get(f"/api/ai/clinical/chat/session/{fake_id}/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(TIBABOT_ENABLED=True)
    def test_forbids_unauthorized_roles(self, api_client, test_user):
        test_user.role = "NURSE"
        api_client.force_authenticate(user=test_user)
        fake_id = str(uuid.uuid4())

        response = api_client.get(f"/api/ai/clinical/chat/session/{fake_id}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @override_settings(TIBABOT_ENABLED=True)
    def test_get_session_detail(self, authenticated_client, test_user):
        """Should return session + messages matching AIChatSessionDetailResponseSchema."""
        session = _create_session(test_user, title="Detailed Chat", num_messages=4)

        response = authenticated_client.get(
            f"/api/ai/clinical/chat/session/{session.id}/"
        )

        assert response.status_code == status.HTTP_200_OK

        # Session shape
        s = response.data["session"]
        assert s["id"] == str(session.id)
        assert s["title"] == "Detailed Chat"
        assert s["message_count"] == 4
        assert "created_at" in s
        assert "updated_at" in s

        # Messages shape
        msgs = response.data["messages"]
        assert len(msgs) == 4
        for m in msgs:
            assert "id" in m
            uuid.UUID(m["id"])
            assert m["role"] in ("user", "assistant", "system")
            assert "content" in m
            assert "timestamp" in m
            # No isStreaming in backend response
            assert "isStreaming" not in m

    @override_settings(TIBABOT_ENABLED=True)
    def test_messages_ordered_by_timestamp(self, authenticated_client, test_user):
        """Messages should be in chronological order."""
        session = _create_session(test_user, num_messages=4)

        response = authenticated_client.get(
            f"/api/ai/clinical/chat/session/{session.id}/"
        )
        msgs = response.data["messages"]
        timestamps = [m["timestamp"] for m in msgs]
        assert timestamps == sorted(timestamps)

    @override_settings(TIBABOT_ENABLED=True)
    def test_get_nonexistent_session_returns_404(self, authenticated_client):
        fake_id = str(uuid.uuid4())
        response = authenticated_client.get(
            f"/api/ai/clinical/chat/session/{fake_id}/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_cannot_access_other_users_session(self, authenticated_client):
        """Should return 404 for sessions owned by other users."""
        other_user = User.objects.create_user(
            username="another_clinician",
            email="another@test.com",
            password="pass123",
        )
        session = _create_session(other_user, title="Private")

        response = authenticated_client.get(
            f"/api/ai/clinical/chat/session/{session.id}/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_session(self, authenticated_client, test_user):
        """Should delete session and all its messages, returning 204."""
        session = _create_session(test_user, num_messages=6)
        session_id = str(session.id)

        response = authenticated_client.delete(
            f"/api/ai/clinical/chat/session/{session_id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Session and messages should be gone
        assert not ChatSession.objects.filter(id=session_id).exists()
        assert not ChatMessage.objects.filter(session_id=session_id).exists()

    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_nonexistent_session_returns_404(self, authenticated_client):
        fake_id = str(uuid.uuid4())
        response = authenticated_client.delete(
            f"/api/ai/clinical/chat/session/{fake_id}/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @override_settings(TIBABOT_ENABLED=True)
    def test_cannot_delete_other_users_session(self, authenticated_client):
        """Should return 404 when trying to delete another user's session."""
        other_user = User.objects.create_user(
            username="delete_test_user",
            email="delete_test@test.com",
            password="pass123",
        )
        session = _create_session(other_user, title="Not yours")

        response = authenticated_client.delete(
            f"/api/ai/clinical/chat/session/{session.id}/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        # Session should still exist
        assert ChatSession.objects.filter(id=session.id).exists()

    @override_settings(TIBABOT_ENABLED=True)
    def test_delete_audit_logged(self, authenticated_client, test_user):
        """Should create an audit log entry when deleting a session."""
        from hmis.apps.core.models import AuditLog

        session = _create_session(test_user, title="To Delete")

        authenticated_client.delete(
            f"/api/ai/clinical/chat/session/{session.id}/"
        )

        log = AuditLog.objects.filter(action="ai_chat_session_delete").first()
        assert log is not None
        assert log.details["session_id"] == str(session.id)
        assert log.details["title"] == "To Delete"


# =============================================================================
# Model tests
# =============================================================================


@pytest.mark.django_db
class TestChatSessionModel:
    """Tests for the ChatSession model."""

    def test_message_count_property(self, test_user):
        session = ChatSession.objects.create(user=test_user, title="Test")
        assert session.message_count == 0

        ChatMessage.objects.create(session=session, role="user", content="Hi")
        ChatMessage.objects.create(
            session=session, role="assistant", content="Hello"
        )
        assert session.message_count == 2

    def test_string_representation(self, test_user):
        session = ChatSession.objects.create(user=test_user, title="My Chat")
        assert "My Chat" in str(session)

    def test_default_title(self, test_user):
        session = ChatSession.objects.create(user=test_user)
        assert session.title == "New Chat"

    def test_cascade_delete_messages(self, test_user):
        session = _create_session(test_user, num_messages=3)
        msg_ids = list(session.messages.values_list("id", flat=True))
        session.delete()
        assert ChatMessage.objects.filter(id__in=msg_ids).count() == 0

    def test_uuid_primary_key(self, test_user):
        session = ChatSession.objects.create(user=test_user)
        assert isinstance(session.id, uuid.UUID)


@pytest.mark.django_db
class TestChatMessageModel:
    """Tests for the ChatMessage model."""

    def test_uuid_primary_key(self, test_user):
        session = ChatSession.objects.create(user=test_user)
        msg = ChatMessage.objects.create(
            session=session, role="user", content="Test"
        )
        assert isinstance(msg.id, uuid.UUID)

    def test_ordering_by_timestamp(self, test_user):
        session = ChatSession.objects.create(user=test_user)
        m1 = ChatMessage.objects.create(
            session=session, role="user", content="First"
        )
        m2 = ChatMessage.objects.create(
            session=session, role="assistant", content="Second"
        )
        msgs = list(session.messages.all())
        assert msgs[0].id == m1.id
        assert msgs[1].id == m2.id

    def test_string_representation(self, test_user):
        session = ChatSession.objects.create(user=test_user)
        msg = ChatMessage.objects.create(
            session=session, role="user", content="Test message"
        )
        assert "user:" in str(msg).lower()


# =============================================================================
# Response serializer tests
# =============================================================================


class TestResponseSerializers:
    """Verify response serializers match frontend Zod schemas."""

    def test_chat_message_serializer(self):
        from hmis.apps.ai.serializers import AIChatMessageSerializer

        data = {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": "Test response",
            "timestamp": "2026-03-02T10:00:00+00:00",
        }
        serializer = AIChatMessageSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_chat_message_rejects_invalid_role(self):
        from hmis.apps.ai.serializers import AIChatMessageSerializer

        data = {
            "id": str(uuid.uuid4()),
            "role": "invalid_role",
            "content": "Test",
            "timestamp": "2026-03-02T10:00:00+00:00",
        }
        serializer = AIChatMessageSerializer(data=data)
        assert not serializer.is_valid()
        assert "role" in serializer.errors

    def test_clinical_chat_response_serializer(self):
        from hmis.apps.ai.serializers import AIClinicalChatResponseSerializer

        data = {
            "session_id": str(uuid.uuid4()),
            "message": {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": "Response text",
                "timestamp": "2026-03-02T10:00:00+00:00",
            },
        }
        serializer = AIClinicalChatResponseSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_clinical_chat_response_with_error(self):
        from hmis.apps.ai.serializers import AIClinicalChatResponseSerializer

        data = {
            "session_id": str(uuid.uuid4()),
            "message": {
                "id": str(uuid.uuid4()),
                "role": "assistant",
                "content": "Unavailable",
                "timestamp": "2026-03-02T10:00:00+00:00",
            },
            "error": "AI service temporarily unavailable.",
        }
        serializer = AIClinicalChatResponseSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_clinical_assist_response_serializer(self):
        from hmis.apps.ai.serializers import AIClinicalAssistResponseSerializer

        data = {
            "response": "Consider the following differentials...",
            "references": ["Kenya MOH Protocol 4.2", "WHO Guidelines"],
        }
        serializer = AIClinicalAssistResponseSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_clinical_assist_response_without_references(self):
        from hmis.apps.ai.serializers import AIClinicalAssistResponseSerializer

        data = {"response": "Some advice."}
        serializer = AIClinicalAssistResponseSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_session_serializer(self):
        from hmis.apps.ai.serializers import AIChatSessionSerializer

        data = {
            "id": str(uuid.uuid4()),
            "title": "My Session",
            "created_at": "2026-03-02T10:00:00+00:00",
            "updated_at": "2026-03-02T10:30:00+00:00",
            "message_count": 5,
        }
        serializer = AIChatSessionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_session_list_response_serializer(self):
        from hmis.apps.ai.serializers import AIChatSessionListResponseSerializer

        data = {
            "sessions": [
                {
                    "id": str(uuid.uuid4()),
                    "title": "Session 1",
                    "created_at": "2026-03-02T10:00:00+00:00",
                    "updated_at": "2026-03-02T10:30:00+00:00",
                    "message_count": 3,
                },
            ]
        }
        serializer = AIChatSessionListResponseSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_session_detail_response_serializer(self):
        from hmis.apps.ai.serializers import AIChatSessionDetailResponseSerializer

        data = {
            "session": {
                "id": str(uuid.uuid4()),
                "title": "Detail Session",
                "created_at": "2026-03-02T10:00:00+00:00",
                "updated_at": "2026-03-02T10:30:00+00:00",
                "message_count": 2,
            },
            "messages": [
                {
                    "id": str(uuid.uuid4()),
                    "role": "user",
                    "content": "Question",
                    "timestamp": "2026-03-02T10:00:00+00:00",
                },
                {
                    "id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": "Answer",
                    "timestamp": "2026-03-02T10:01:00+00:00",
                },
            ],
        }
        serializer = AIChatSessionDetailResponseSerializer(data=data)
        assert serializer.is_valid(), serializer.errors


# =============================================================================
# System instruction for no-context chat
# =============================================================================


@pytest.mark.django_db
class TestClinicalChatContextForwarding:
    """Tests that encounter context is forwarded and system_instruction is set."""

    @override_settings(TIBABOT_ENABLED=True)
    def test_system_instruction_injected_when_no_encounter_context(
        self, authenticated_client
    ):
        """Should add system_instruction telling TibaBot it has no page visibility."""
        mock_response = {
            "message": {"role": "assistant", "content": "I can help."},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/clinical/chat/",
                {"message": "discuss the page we are on"},
                format="json",
            )

            # Verify system_instruction was included in payload to TibaBot
            call_args = mock_client.clinical_chat.call_args[0][0]
            assert "system_instruction" in call_args
            assert "don't have visibility" in call_args["system_instruction"].lower()
            assert "Ask about this patient" in call_args["system_instruction"]

    @override_settings(TIBABOT_ENABLED=True)
    def test_no_system_instruction_when_encounter_context_present(
        self, authenticated_client
    ):
        """Should NOT add system_instruction when encounter context is provided."""
        mock_response = {
            "message": {"role": "assistant", "content": "Based on the vitals..."},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/clinical/chat/",
                {
                    "message": "What's going on with this patient?",
                    "patient_context": {
                        "patient_age": 45,
                        "patient_sex": "M",
                    },
                    "encounter_context": {
                        "chief_complaint": "Cough for 3 days",
                        "vitals": {"spo2": 92, "pulse": 110},
                    },
                },
                format="json",
            )

            call_args = mock_client.clinical_chat.call_args[0][0]
            assert "system_instruction" not in call_args

    @override_settings(TIBABOT_ENABLED=True)
    def test_patient_context_forwarded_to_tibabot(
        self, authenticated_client
    ):
        """Should forward patient_context and encounter_context to TibaBot."""
        mock_response = {
            "message": {"role": "assistant", "content": "Consider..."},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/clinical/chat/",
                {
                    "message": "DDx for this patient?",
                    "patient_context": {
                        "patient_age": 30,
                        "patient_sex": "F",
                        "allergies": ["Penicillin"],
                    },
                    "encounter_context": {
                        "chief_complaint": "Headache",
                    },
                },
                format="json",
            )

            call_args = mock_client.clinical_chat.call_args[0][0]
            assert call_args["patient_context"]["patient_age"] == 30
            assert call_args["patient_context"]["patient_sex"] == "F"
            assert call_args["encounter_context"]["chief_complaint"] == "Headache"

    @override_settings(TIBABOT_ENABLED=True)
    def test_system_instruction_when_only_patient_context(
        self, authenticated_client
    ):
        """Should NOT add system_instruction when patient_context alone is present."""
        mock_response = {
            "message": {"role": "assistant", "content": "OK."},
        }
        with patch(
            "hmis.apps.ai.views.get_tibabot_client"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_client.clinical_chat.return_value = mock_response
            mock_get_client.return_value = mock_client

            authenticated_client.post(
                "/api/ai/clinical/chat/",
                {
                    "message": "What workup?",
                    "patient_context": {
                        "patient_age": 60,
                        "patient_sex": "M",
                    },
                },
                format="json",
            )

            call_args = mock_client.clinical_chat.call_args[0][0]
            assert "system_instruction" not in call_args
