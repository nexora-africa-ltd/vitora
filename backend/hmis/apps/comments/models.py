"""
Clinical Comments — threaded comments on Encounters, Lab Orders, and Prescriptions.
"""

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel


def _allowed_content_types():
    """Return ContentType IDs for allowed commentable models."""
    return ContentType.objects.filter(
        app_label__in=["encounters", "laboratory", "pharmacy"],
        model__in=["encounter", "laborder", "prescription"],
    )


class ClinicalComment(FacilityScopedModel, TimeStampedModel):
    """
    A threaded comment attached to a clinical object (Encounter, LabOrder, or Prescription).

    Uses GenericForeignKey to support multiple target models. Threading is implemented
    via a self-referencing FK (parent). Mentions are parsed from body text and stored
    as M2M for efficient querying.
    """

    # --- Generic FK to the commentable object ---
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        limit_choices_to={
            "app_label__in": ["encounters", "laboratory", "pharmacy"],
            "model__in": ["encounter", "laborder", "prescription"],
        },
    )
    object_id = models.PositiveBigIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")

    # --- Threading ---
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
        help_text="Parent comment for threading. Null = top-level comment.",
    )

    # --- Content ---
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="clinical_comments",
    )
    body = models.TextField(help_text="Comment text. Supports @username mentions.")

    # --- Mentions (parsed from body on save) ---
    mentions = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="mentioned_in_comments",
        help_text="Users @mentioned in this comment.",
    )

    # --- Edit tracking ---
    is_edited = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)

    # --- Soft delete ---
    is_deleted = models.BooleanField(
        default=False,
        help_text="Soft-deleted comments show '[deleted]' but preserve thread structure.",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["content_type", "object_id"], name="comment_target_idx"),
            models.Index(fields=["parent"], name="comment_parent_idx"),
            models.Index(fields=["author"], name="comment_author_idx"),
            models.Index(
                fields=["facility", "content_type", "object_id"],
                name="comment_facility_target_idx",
            ),
        ]

    def __str__(self):
        target = f"{self.content_type.model}:{self.object_id}" if self.content_type_id else "?"
        return f"Comment by {self.author_id} on {target}"

    def save(self, *args, **kwargs):
        # Resolve facility/org from content_object if not set
        if not self.facility_id and self.content_object:
            obj = self.content_object
            if hasattr(obj, "facility_id") and obj.facility_id:
                self.facility_id = obj.facility_id
            if hasattr(obj, "organization_id") and obj.organization_id:
                self.organization_id = obj.organization_id
        super().save(*args, **kwargs)

    @property
    def replies_count(self) -> int:
        """Count of non-deleted direct replies."""
        return self.replies.filter(is_deleted=False).count()

    @property
    def display_body(self) -> str:
        """Return body or '[deleted]' placeholder for soft-deleted comments."""
        if self.is_deleted:
            return "[deleted]"
        return self.body
