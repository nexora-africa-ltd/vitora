"""
ViewSet for Clinical Comments.

Supports nested routing under encounters, lab orders, and prescriptions:
- /api/encounters/{id}/comments/
- /api/lab/orders/{id}/comments/
- /api/pharmacy/prescriptions/{id}/comments/
"""

from django.contrib.contenttypes.models import ContentType
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from hmis.apps.comments.models import ClinicalComment
from hmis.apps.comments.serializers import (
    ClinicalCommentCreateSerializer,
    ClinicalCommentSerializer,
    ClinicalCommentUpdateSerializer,
)
from hmis.apps.comments.utils import parse_mentions

# Map URL kwarg names to (app_label, model_name)
COMMENTABLE_MODELS = {
    "encounter_pk": ("encounters", "encounter"),
    "order_pk": ("laboratory", "laborder"),
    "prescription_pk": ("pharmacy", "prescription"),
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
