"""
Admin configuration for AI chat session models.
"""

from django.contrib import admin

from .models import ChatMessage, ChatSession


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ("id", "role", "content", "timestamp")
    ordering = ("timestamp",)


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "title", "message_count", "created_at", "updated_at")
    list_filter = ("created_at",)
    search_fields = ("title", "user__username")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("user",)
    inlines = [ChatMessageInline]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "role", "content_preview", "timestamp")
    list_filter = ("role", "timestamp")
    raw_id_fields = ("session",)
    readonly_fields = ("id", "timestamp")

    @admin.display(description="Content")
    def content_preview(self, obj: ChatMessage) -> str:
        return obj.content[:80] + "…" if len(obj.content) > 80 else obj.content
