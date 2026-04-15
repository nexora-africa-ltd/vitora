"""
Admin configuration for AI models (chat sessions + stored results).
"""

from django.contrib import admin

from .models import (
    AICarePlanResult,
    AICDSResult,
    AIDischargeResult,
    AIICURiskResult,
    AIInvestigationSuggestResult,
    AILabInterpretResult,
    ChatMessage,
    ChatSession,
)


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


# =============================================================================
# Stored AI result admin
# =============================================================================


class AIResultBaseAdmin(admin.ModelAdmin):
    """Base admin for all stored AI results."""

    list_filter = ("service_mode", "created_at")
    readonly_fields = ("id", "created_at", "request_data", "result_data")
    raw_id_fields = ("created_by",)


@admin.register(AICarePlanResult)
class AICarePlanResultAdmin(AIResultBaseAdmin):
    list_display = ("id", "primary_diagnosis", "service_mode", "created_by", "created_at")
    search_fields = ("primary_diagnosis",)
    raw_id_fields = ("created_by", "encounter", "admission")


@admin.register(AICDSResult)
class AICDSResultAdmin(AIResultBaseAdmin):
    list_display = ("id", "rules_fired", "alert_count", "service_mode", "created_by", "created_at")
    raw_id_fields = ("created_by", "encounter")


@admin.register(AILabInterpretResult)
class AILabInterpretResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "abnormal_count",
        "critical_count",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "lab_result", "encounter")


@admin.register(AIDischargeResult)
class AIDischargeResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "readiness_level",
        "readiness_score",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "admission")


@admin.register(AIICURiskResult)
class AIICURiskResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "prediction_type",
        "risk_level",
        "risk_score",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "admission")


@admin.register(AIInvestigationSuggestResult)
class AIInvestigationSuggestResultAdmin(AIResultBaseAdmin):
    list_display = (
        "id",
        "suggestion_count",
        "service_mode",
        "created_by",
        "created_at",
    )
    raw_id_fields = ("created_by", "encounter")
