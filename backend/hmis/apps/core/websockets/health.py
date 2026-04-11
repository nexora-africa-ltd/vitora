"""
WebSocket health check endpoint.

Verifies channel layer connectivity and returns status for load balancers
and monitoring systems.
"""

import logging
import time

from channels.layers import get_channel_layer
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Unique channel name for health probes
_HEALTH_CHANNEL = "ws_health_probe"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def websocket_health(request):
    """
    GET /api/ws/health/

    Returns channel layer connectivity status.
    Useful for monitoring dashboards and deployment health checks.
    """
    channel_layer = get_channel_layer()
    result = {
        "websocket": "unknown",
        "channel_layer_backend": type(channel_layer).__name__ if channel_layer else None,
        "latency_ms": None,
    }

    if channel_layer is None:
        result["websocket"] = "unavailable"
        result["detail"] = "No channel layer configured"
        return Response(result, status=503)

    # Probe the channel layer with a test message
    try:
        import asyncio

        from asgiref.sync import async_to_sync

        start = time.monotonic()

        async def _probe():
            test_channel = f"{_HEALTH_CHANNEL}_{int(time.time())}"
            await channel_layer.send(test_channel, {"type": "health.check", "ok": True})
            msg = await asyncio.wait_for(channel_layer.receive(test_channel), timeout=5.0)
            return msg.get("ok", False)

        ok = async_to_sync(_probe)()
        elapsed = (time.monotonic() - start) * 1000

        result["websocket"] = "healthy" if ok else "degraded"
        result["latency_ms"] = round(elapsed, 2)

    except Exception as exc:
        logger.warning("WebSocket health probe failed: %s", exc)
        result["websocket"] = "unhealthy"
        result["detail"] = str(exc)
        return Response(result, status=503)

    return Response(result)
