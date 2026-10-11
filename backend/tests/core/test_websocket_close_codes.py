# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Verify Channels rejection close codes; run with pytest, with no CLI inputs."""

from unittest.mock import AsyncMock, patch

import pytest
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import AnonymousUser

from hmis.apps.comments.consumers import CommentConsumer
from hmis.apps.core.websockets.notifications import NotificationConsumer
from hmis.apps.laboratory.consumers import (
    LabClinicianConsumer,
    LabEncounterConsumer,
    LabOrderConsumer,
)
from hmis.apps.mch.consumers import LabourPartographConsumer


async def connect_consumer(consumer, kwargs, user=None):
    """Connect directly to a consumer with URL kwargs and optional user scope."""
    communicator = WebsocketCommunicator(consumer.as_asgi(), "/ws/test/")
    communicator.scope["url_route"] = {"kwargs": kwargs}
    if user is not None:
        communicator.scope["user"] = user
    return await communicator.connect()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("consumer", "exists_method", "kwargs"),
    [
        (LabourPartographConsumer, "_partograph_exists", {"partograph_id": "99999"}),
        (LabEncounterConsumer, "_encounter_exists", {"encounter_id": "99999"}),
        (LabOrderConsumer, "_order_exists", {"order_id": "99999"}),
        (CommentConsumer, "_entity_exists", {"entity_type": "encounter", "entity_id": "99999"}),
    ],
)
async def test_missing_resource_closes_with_not_found_code(consumer, exists_method, kwargs):
    """Resource-scoped consumers must distinguish a missing target from a protocol failure."""
    with patch.object(consumer, exists_method, new=AsyncMock(return_value=False)):
        connected, code = await connect_consumer(consumer, kwargs)

    assert connected is False
    assert code == 4404


@pytest.mark.asyncio
async def test_invalid_comment_entity_type_closes_with_invalid_request_code():
    """Comment streams reject unsupported entity types as invalid requests."""
    connected, code = await connect_consumer(
        CommentConsumer,
        {"entity_type": "unsupported", "entity_id": "1"},
    )

    assert connected is False
    assert code == 4400


@pytest.mark.asyncio
@pytest.mark.parametrize("consumer", [LabClinicianConsumer, NotificationConsumer])
async def test_authenticated_consumers_close_anonymous_connections_with_unauthenticated_code(
    consumer,
):
    """User-scoped streams reject anonymous connections consistently."""
    connected, code = await connect_consumer(consumer, {}, user=AnonymousUser())

    assert connected is False
    assert code == 4401
