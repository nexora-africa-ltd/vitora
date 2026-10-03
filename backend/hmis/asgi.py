# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
ASGI config for Vitora HMIS project.

It exposes the ASGI callable as a module-level variable named ``application``.

This configuration supports both HTTP and WebSocket protocols using Django Channels.
"""

import logging
import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.conf import settings
from django.core.asgi import get_asgi_application

logger = logging.getLogger(__name__)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings")

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

# Import websocket routing after Django is initialized
from hmis.apps.billing.routing import websocket_urlpatterns as billing_ws_patterns  # noqa: E402
from hmis.apps.clinics.routing import websocket_urlpatterns as clinic_ws_patterns  # noqa: E402
from hmis.apps.comments.routing import websocket_urlpatterns as comments_ws_patterns  # noqa: E402
from hmis.apps.core.hub_discovery import (  # noqa: E402
    HubDiscoveryService,
    set_active_hub_discovery_service,
)
from hmis.apps.core.routing import websocket_urlpatterns as core_ws_patterns  # noqa: E402
from hmis.apps.core.websockets.middleware import FacilityWebSocketMiddleware  # noqa: E402
from hmis.apps.imaging.routing import websocket_urlpatterns as imaging_ws_patterns  # noqa: E402
from hmis.apps.immunizations.routing import (  # noqa: E402
    websocket_urlpatterns as immunization_ws_patterns,
)
from hmis.apps.inpatient.routing import websocket_urlpatterns as inpatient_ws_patterns  # noqa: E402
from hmis.apps.laboratory.routing import websocket_urlpatterns as lab_ws_patterns  # noqa: E402
from hmis.apps.mch.routing import websocket_urlpatterns as mch_ws_patterns  # noqa: E402
from hmis.apps.pharmacy.routing import websocket_urlpatterns as pharmacy_ws_patterns  # noqa: E402
from hmis.apps.scheduling.routing import (  # noqa: E402
    websocket_urlpatterns as scheduling_ws_patterns,
)
from hmis.apps.surveillance.routing import (  # noqa: E402
    websocket_urlpatterns as surveillance_ws_patterns,
)
from hmis.apps.triage.routing import websocket_urlpatterns as triage_ws_patterns  # noqa: E402

# Combine all WebSocket URL patterns
websocket_urlpatterns = (
    clinic_ws_patterns
    + comments_ws_patterns
    + lab_ws_patterns
    + mch_ws_patterns
    + inpatient_ws_patterns
    + triage_ws_patterns
    + surveillance_ws_patterns
    + pharmacy_ws_patterns
    + billing_ws_patterns
    + scheduling_ws_patterns
    + imaging_ws_patterns
    + immunization_ws_patterns
    + core_ws_patterns
)


def start_hub_discovery() -> HubDiscoveryService | None:
    """Start LAN discovery only for the local facility hub runtime."""
    if getattr(settings, "ENVIRONMENT", "") != "hub":
        return None

    try:
        service = HubDiscoveryService()
        service.start()
        set_active_hub_discovery_service(service)
        return service
    except Exception:  # noqa: BLE001 - LAN discovery must not block the HTTP hub
        logger.exception("Hub discovery startup failed; continuing without LAN discovery")
        return None


def stop_hub_discovery(service: HubDiscoveryService | None) -> None:
    """Stop the ASGI-owned responder during graceful server shutdown."""
    if service is None:
        return
    try:
        service.stop()
    except Exception:  # noqa: BLE001 - shutdown cleanup must not block process exit
        logger.exception("Hub discovery shutdown failed")
    finally:
        set_active_hub_discovery_service(None)


async def hub_lifespan(_scope, receive, send):
    """Own the hub discovery threads for the lifetime of one Daphne worker."""
    service = None
    while True:
        message = await receive()
        if message["type"] == "lifespan.startup":
            service = start_hub_discovery()
            await send({"type": "lifespan.startup.complete"})
        elif message["type"] == "lifespan.shutdown":
            stop_hub_discovery(service)
            await send({"type": "lifespan.shutdown.complete"})
            return


application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            FacilityWebSocketMiddleware(URLRouter(websocket_urlpatterns))
        ),
        "lifespan": hub_lifespan,
    }
)
