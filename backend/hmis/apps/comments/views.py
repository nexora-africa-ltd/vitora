"""
ViewSet for Clinical Comments.

Supports nested routing under encounters, lab orders, and prescriptions:
- /api/encounters/{id}/comments/
- /api/lab/orders/{id}/comments/
- /api/pharmacy/prescriptions/{id}/comments/

Also provides:
- /api/comments/mentions/ — staff autocomplete for @mentions (org-scoped)
- Reaction toggle (POST /api/{entity}/comments/{id}/react/)
"""

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db.models import Count
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from hmis.apps.comments.models import ClinicalComment, CommentReaction
from hmis.apps.comments.serializers import (
    ClinicalCommentCreateSerializer,
    ClinicalCommentSerializer,
    ClinicalCommentUpdateSerializer,
    MentionSuggestionSerializer,
)
from hmis.apps.comments.utils import parse_mentions
from hmis.apps.comments.websockets import broadcast_comment_event

User = get_user_model()

# Map URL kwarg names to (app_label, model_name)
COMMENTABLE_MODELS = {
    "encounter_pk": ("encounters", "encounter"),
    "order_pk": ("laboratory", "laborder"),
    "prescription_pk": ("pharmacy", "prescription"),
    "admission_pk": ("inpatient", "admission"),
    "shift_pk": ("scheduling", "shift"),
}


class ClinicalCommentViewSet(viewsets.ModelViewSet):
    """
    CRUD for clinical comments attached to encounters, lab orders, or prescriptions.

    List defaults to top-level comments (parent=null). Pass ?parent={id} for replies.
    """

    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete"]

    def _resolve_target(self):
        """Resolve content_type and object_id from URL kwargs."""
        for kwarg_name, (app_label, model_name) in COMMENTABLE_MODELS.items():
            if kwarg_name in self.kwargs:
                ct = ContentType.objects.get(app_label=app_label, model=model_name)
                obj_id = int(self.kwargs[kwarg_name])
                self._comment_content_type = ct
                self._comment_object_id = obj_id
                return ct, obj_id
        return None, None

    def get_queryset(self):
        ct, obj_id = self._resolve_target()
        if ct is None:
            return ClinicalComment.objects.none()

        qs = ClinicalComment.objects.filter(content_type=ct, object_id=obj_id).select_related(
            "author"
        )

        # Filter by parent (default: top-level only)
        parent_param = self.request.query_params.get("parent")
        if parent_param is None:
            # Default: show top-level comments
            qs = qs.filter(parent__isnull=True)
        elif parent_param == "all":
            # Show all (flat list)
            pass
        else:
            # Show replies to specific parent
            try:
                qs = qs.filter(parent_id=int(parent_param))
            except (ValueError, TypeError):
                qs = qs.none()

        return qs.order_by("created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return ClinicalCommentCreateSerializer
        if self.action == "partial_update":
            return ClinicalCommentUpdateSerializer
        return ClinicalCommentSerializer

    def perform_create(self, serializer):
        ct, obj_id = self._resolve_target()
        instance = serializer.save(
            author=self.request.user,
            content_type=ct,
            object_id=obj_id,
        )

        # Resolve facility from the target object
        if not instance.facility_id:
            instance.save()  # triggers model save() which resolves facility

        # Parse and set mentions — use instance's org (resolved from target object)
        org_id = instance.organization_id
        if not org_id:
            req_org = getattr(self.request, "organization", None)
            org_id = req_org.id if req_org else None
        mentioned_users = parse_mentions(instance.body, org_id)
        if mentioned_users:
            instance.mentions.set(mentioned_users)

        # Create mention notifications (after M2M is set)
        self._create_mention_notifications(instance, mentioned_users)

    def create(self, request, *args, **kwargs):
        """Override to resolve target before validation, and return read serializer on 201."""
        # Resolve target so validate_parent can access it
        self._resolve_target()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Re-serialize with read serializer
        read_serializer = ClinicalCommentSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        """Only the author can edit their own comment."""
        instance = self.get_object()
        if instance.author_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only edit your own comments.")
        if instance.is_deleted:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Cannot edit a deleted comment.")

        serializer.save()

        # Re-parse mentions after edit
        org_id = instance.organization_id
        if not org_id:
            req_org = getattr(self.request, "organization", None)
            org_id = req_org.id if req_org else None
        mentioned_users = parse_mentions(instance.body, org_id)
        instance.mentions.set(mentioned_users)

    def _create_mention_notifications(self, instance, mentioned_users):
        """Create Notification records for mentioned users."""
        from hmis.apps.core.models import Notification

        for user in mentioned_users:
            if user.id == instance.author_id:
                continue  # Don't notify yourself
            Notification.objects.create(
                user=user,
                notification_type="comment_mention",
                priority=Notification.Priority.NORMAL,
                title="You were mentioned in a comment",
                message=f"{instance.author.get_full_name() or instance.author.username} mentioned you in a comment.",
                related_model=instance.content_type.model
                if instance.content_type_id
                else "comment",
                related_id=instance.object_id,
            )

    def destroy(self, request, *args, **kwargs):
        """Soft-delete: replace body with '[deleted]', preserve thread structure."""
        instance = self.get_object()

        # Only author or admin can delete
        is_admin = request.user.is_superuser or (
            hasattr(request.user, "staff_profile")
            and request.user.staff_profile.primary_role
            and request.user.staff_profile.primary_role.code in ("ADMIN", "ORG-ADMIN", "OWNER")
        )
        if instance.author_id != request.user.id and not is_admin:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only delete your own comments.")

        instance.is_deleted = True
        instance.body = "[deleted]"
        instance.mentions.clear()
        instance.save(update_fields=["is_deleted", "body", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="react")
    def react(self, request, **kwargs):
        """
        Toggle a reaction (emoji) on a comment.

        POST body: {"emoji": "👍"}
        If the reaction already exists for this user+emoji, it is removed (toggle off).
        Returns the updated reactions summary for the comment.
        """
        comment = self.get_object()
        emoji = request.data.get("emoji", "").strip()

        if not emoji or len(emoji) > 8:
            return Response(
                {"error": "A valid emoji is required (max 8 chars)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Toggle logic
        existing = CommentReaction.objects.filter(
            comment=comment, user=request.user, emoji=emoji
        ).first()

        if existing:
            existing.delete()
            ws_event = "reaction_removed"
        else:
            CommentReaction.objects.create(comment=comment, user=request.user, emoji=emoji)
            ws_event = "reaction_added"

        # Broadcast to WebSocket
        if comment.content_type_id:
            broadcast_comment_event(
                comment.content_type.model,
                comment.object_id,
                ws_event,
                {
                    "comment_id": comment.pk,
                    "emoji": emoji,
                    "user_id": request.user.id,
                    "user_name": request.user.get_full_name() or request.user.username,
                },
            )

        # Return updated reactions summary
        reactions_qs = (
            CommentReaction.objects.filter(comment=comment)
            .values("emoji")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        user_reactions = list(
            CommentReaction.objects.filter(comment=comment, user=request.user).values_list(
                "emoji", flat=True
            )
        )
        reactions_result = []
        for r in reactions_qs:
            user_ids = list(
                CommentReaction.objects.filter(comment=comment, emoji=r["emoji"]).values_list(
                    "user_id", flat=True
                )
            )
            reactions_result.append(
                {"emoji": r["emoji"], "count": r["count"], "user_ids": user_ids}
            )

        return Response(
            {
                "comment_id": comment.pk,
                "reactions": reactions_result,
                "user_reactions": user_reactions,
            }
        )


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def mention_suggestions(request):
    """
    Return a list of staff users for @mention autocomplete.

    Query params:
        q (str): Search term (matches username, first_name, or last_name)

    Returns users in the same organization as the requesting user.
    Limited to 10 results.
    """
    query = request.query_params.get("q", "").strip()

    # Get the requesting user's organization
    org_id = None
    if hasattr(request.user, "staff_profile") and request.user.staff_profile:
        org_id = request.user.staff_profile.organization_id

    qs = User.objects.filter(is_active=True).exclude(id=request.user.id)

    # Scope to same organization (CRITICAL: prevent cross-org mentions)
    if org_id:
        qs = qs.filter(staff_profile__organization_id=org_id)
    else:
        # If no org, return empty (shouldn't happen for authenticated staff)
        return Response([])

    # Search by username, first_name, or last_name (if query provided)
    if query:
        from django.db.models import Q

        qs = qs.filter(
            Q(username__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
        )

    qs = qs.order_by("first_name", "last_name")[:10]

    serializer = MentionSuggestionSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def comment_count(request):
    """
    Return the comment count for a given entity.

    Query params:
        entity_type (str): One of 'encounter', 'lab-order', 'prescription', 'admission', 'shift'
        entity_id (int): The primary key of the entity

    Returns: { "count": N }
    """
    entity_type = request.query_params.get("entity_type", "")
    entity_id = request.query_params.get("entity_id")

    if not entity_type or not entity_id:
        return Response(
            {"error": "entity_type and entity_id required"}, status=status.HTTP_400_BAD_REQUEST
        )

    # Map entity_type to (app_label, model_name) — same as COMMENTABLE_MODELS
    TYPE_MAP = {
        "encounter": ("encounters", "encounter"),
        "lab-order": ("laboratory", "laborder"),
        "prescription": ("pharmacy", "prescription"),
        "admission": ("inpatient", "admission"),
        "shift": ("scheduling", "shift"),
    }

    mapping = TYPE_MAP.get(entity_type)
    if not mapping:
        return Response(
            {"error": f"Invalid entity_type: {entity_type}"}, status=status.HTTP_400_BAD_REQUEST
        )

    app_label, model_name = mapping
    try:
        ct = ContentType.objects.get(app_label=app_label, model=model_name)
    except ContentType.DoesNotExist:
        return Response({"count": 0})

    count = ClinicalComment.objects.filter(content_type=ct, object_id=entity_id).count()
    return Response({"count": count})
