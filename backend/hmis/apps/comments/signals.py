"""
Signals for Clinical Comments.

Handles:
- Domain event publishing (COMMENT_CREATED, COMMENT_UPDATED)
- WebSocket broadcast to connected clients
- Notification creation for reply-to-parent-author
- Mention notifications are handled in views.py after M2M is set
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from hmis.apps.comments.models import ClinicalComment
from hmis.apps.comments.websockets import broadcast_comment_event
from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import CommentEvents


@receiver(post_save, sender=ClinicalComment)
def publish_comment_event(sender, instance, created, **kwargs):
    """Publish domain event on comment create/update."""
    if instance.is_deleted:
        event_type = CommentEvents.COMMENT_DELETED
    elif created:
        event_type = CommentEvents.COMMENT_CREATED
    else:
        event_type = CommentEvents.COMMENT_UPDATED

    payload = {
        "id": instance.pk,
        "content_type": instance.content_type.model if instance.content_type_id else None,
        "object_id": instance.object_id,
        "author_id": instance.author_id,
        "parent_id": instance.parent_id,
        "facility_id": instance.facility_id,
    }
    publish_event(
        event_type,
        aggregate_type="ClinicalComment",
        aggregate_id=instance.pk,
        payload=payload,
        user_id=instance.author_id,
        facility_id=instance.facility_id,
        organization_id=instance.organization_id,
    )


@receiver(post_save, sender=ClinicalComment)
def broadcast_comment_to_websocket(sender, instance, created, **kwargs):
    """Broadcast comment events to connected WebSocket clients."""
    if not instance.content_type_id:
        return

    content_type_model = instance.content_type.model

    if instance.is_deleted:
        ws_event_type = "deleted"
        data = {"id": instance.pk}
    elif created:
        ws_event_type = "created"
        data = {
            "id": instance.pk,
            "parent_id": instance.parent_id,
            "author_id": instance.author_id,
            "author_name": instance.author.get_full_name() or instance.author.username,
            "body": instance.body,
        }
    else:
        ws_event_type = "updated"
        data = {
            "id": instance.pk,
            "body": instance.body,
            "is_edited": instance.is_edited,
        }

    broadcast_comment_event(content_type_model, instance.object_id, ws_event_type, data)


@receiver(post_save, sender=ClinicalComment)
def notify_parent_author_on_reply(sender, instance, created, **kwargs):
    """Create Notification for parent comment's author when a reply is posted."""
    if not created or instance.is_deleted:
        return
    if not instance.parent_id:
        return

    from hmis.apps.core.models import Notification

    # Don't notify if replying to your own comment
    if instance.parent.author_id == instance.author_id:
        return

    # Don't notify if parent author will already get a mention notification
    # (this is checked after mentions are set in the view, so we do it here
    # conservatively — the view deduplicates later)
    Notification.objects.create(
        user=instance.parent.author,
        notification_type="comment_reply",
        priority=Notification.Priority.NORMAL,
        title="Someone replied to your comment",
        message=f"{instance.author.get_full_name() or instance.author.username} replied to your comment.",
        related_model=instance.content_type.model if instance.content_type_id else "comment",
        related_id=instance.object_id,
    )
