"""
WebSocket URL routing for Clinical Comments.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Comments for any commentable entity
    # URL: ws/comments/{entity_type}/{entity_id}/
    # entity_type: encounter | lab-order | prescription
    re_path(
        r"ws/comments/(?P<entity_type>[\w-]+)/(?P<entity_id>\d+)/$",
        consumers.CommentConsumer.as_asgi(),
    ),
]
