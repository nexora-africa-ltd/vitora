"""
Serializers for Clinical Comments.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone
from rest_framework import serializers

from hmis.apps.comments.models import ClinicalComment, CommentReaction

User = get_user_model()


class CommentAuthorSerializer(serializers.Serializer):
    """Nested read-only author representation."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj) -> str:
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username


class ClinicalCommentSerializer(serializers.ModelSerializer):
    """Read serializer for clinical comments (list/retrieve)."""

    author = CommentAuthorSerializer(read_only=True)
    replies_count = serializers.IntegerField(read_only=True)
    display_body = serializers.CharField(read_only=True)
    mentions = serializers.SlugRelatedField(many=True, read_only=True, slug_field="username")
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalComment
        fields = [
            "id",
            "parent",
            "author",
            "body",
            "display_body",
            "mentions",
            "is_edited",
            "is_deleted",
            "created_at",
            "edited_at",
            "replies_count",
            "reactions",
        ]
        read_only_fields = fields

    def get_reactions(self, obj) -> list[dict]:
        """Return aggregated reactions: [{emoji, count, users}]."""
        reactions_qs = (
            CommentReaction.objects.filter(comment=obj)
            .values("emoji")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        # Get user IDs per emoji for "has reacted" check on frontend
        result = []
        for r in reactions_qs:
            user_ids = list(
                CommentReaction.objects.filter(comment=obj, emoji=r["emoji"]).values_list(
                    "user_id", flat=True
                )
            )
            result.append({"emoji": r["emoji"], "count": r["count"], "user_ids": user_ids})
        return result


class ClinicalCommentCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating comments."""

    parent = serializers.PrimaryKeyRelatedField(
        queryset=ClinicalComment.objects.all(),
        required=False,
        allow_null=True,
        help_text="ID of parent comment for threading.",
    )

    class Meta:
        model = ClinicalComment
        fields = ["body", "parent"]

    def validate_parent(self, value):
        """Ensure parent comment belongs to the same target object."""
        if value is None:
            return value

        # Access content_type and object_id from context (set by viewset)
        view = self.context.get("view")
        if view:
            content_type = getattr(view, "_comment_content_type", None)
            object_id = getattr(view, "_comment_object_id", None)
            if (
                content_type
                and object_id
                and (value.content_type_id != content_type.id or value.object_id != object_id)
            ):
                raise serializers.ValidationError(
                    "Parent comment must belong to the same target object."
                )
        return value

    def validate_body(self, value):
        """Ensure body is not empty/whitespace."""
        if not value or not value.strip():
            raise serializers.ValidationError("Comment body cannot be empty.")
        return value.strip()


class ClinicalCommentUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for editing comments (body only)."""

    class Meta:
        model = ClinicalComment
        fields = ["body"]

    def validate_body(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Comment body cannot be empty.")
        return value.strip()

    def update(self, instance, validated_data):
        instance.body = validated_data["body"]
        instance.is_edited = True
        instance.edited_at = timezone.now()
        instance.save(update_fields=["body", "is_edited", "edited_at", "updated_at"])
        return instance


class CommentReactionSerializer(serializers.ModelSerializer):
    """Read serializer for individual reactions."""

    class Meta:
        model = CommentReaction
        fields = ["id", "emoji", "user", "created_at"]
        read_only_fields = fields


class MentionSuggestionSerializer(serializers.ModelSerializer):
    """Serializer for @mention autocomplete results."""

    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name"]
        read_only_fields = fields

    def get_full_name(self, obj) -> str:
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username
