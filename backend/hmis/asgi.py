"""
ASGI config for Vitora HMIS project.

It exposes the ASGI callable as a module-level variable named ``application``.

This configuration supports both HTTP and WebSocket protocols using Django Channels.
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings")

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

# Import websocket routing after Django is initialized
from hmis.apps.clinics.routing import websocket_urlpatterns as clinic_ws_patterns  # noqa: E402
from hmis.apps.inpatient.routing import websocket_urlpatterns as inpatient_ws_patterns  # noqa: E402
from hmis.apps.laboratory.routing import websocket_urlpatterns as lab_ws_patterns  # noqa: E402
from hmis.apps.mch.routing import websocket_urlpatterns as mch_ws_patterns  # noqa: E402
from hmis.apps.surveillance.routing import websocket_urlpatterns as surveillance_ws_patterns  # noqa: E402
from hmis.apps.triage.routing import websocket_urlpatterns as triage_ws_patterns  # noqa: E402

# Combine all WebSocket URL patterns
websocket_urlpatterns = (
    clinic_ws_patterns
    + lab_ws_patterns
    + mch_ws_patterns
    + inpatient_ws_patterns
    + triage_ws_patterns
    + surveillance_ws_patterns
)

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    }
)
