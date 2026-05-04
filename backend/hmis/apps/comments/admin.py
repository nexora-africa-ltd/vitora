from django.contrib import admin

from hmis.apps.comments.models import ClinicalComment


@admin.register(ClinicalComment)
class ClinicalCommentAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "author",
        "content_type",
        "object_id",
        "parent",
        "is_deleted",
        "created_at",
    ]
    list_filter = ["content_type", "is_deleted", "facility"]
    search_fields = ["body", "author__username"]
    raw_id_fields = ["author", "parent", "facility", "organization"]
    readonly_fields = ["created_at", "updated_at", "edited_at"]
