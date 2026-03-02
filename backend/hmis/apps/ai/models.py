"""
Models for AI chat session persistence.

Stores clinical chat sessions and messages locally so the frontend can:
- List past sessions (GET /api/ai/clinical/chat/sessions/)
- Retrieve a full session with messages (GET /api/ai/clinical/chat/session/{id}/)
- Delete a session (DELETE /api/ai/clinical/chat/session/{id}/)

Messages are stored *after* the TibaBot round-trip completes, so the local DB
serves as a history/cache rather than the source of truth for the conversation.
"""

import uuid

from django.conf import settings
from django.db import models


class ChatSession(models.Model):
    """
    A multi-turn clinical chat session owned by a single user.

    Each session maps to a TibaBot session_id.  The local model stores
    metadata (title, timestamps, message count) for the session list UI.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_chat_sessions",
    )
    title = models.CharField(
        max_length=255,
        default="New Chat",
        help_text="Auto-generated from the first user message.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "AI Chat Session"
        verbose_name_plural = "AI Chat Sessions"

    def __str__(self) -> str:
        return f"ChatSession {self.id} — {self.title}"

    @property
    def message_count(self) -> int:
        """Return the number of messages in this session."""
        return self.messages.count()


class ChatMessage(models.Model):
    """
    A single message in a chat session.

    Stores both user and assistant messages.  The ``id`` is a UUID string
    (matching the frontend ``AIChatMessage.id`` type).
    """

    ROLE_CHOICES = [
        ("user", "User"),
        ("assistant", "Assistant"),
        ("system", "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]
        verbose_name = "AI Chat Message"
        verbose_name_plural = "AI Chat Messages"

    def __str__(self) -> str:
        return f"{self.role}: {self.content[:60]}"
