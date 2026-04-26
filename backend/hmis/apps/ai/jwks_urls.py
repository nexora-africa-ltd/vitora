"""
URL configuration for the JWKS endpoint.

Serves ``/.well-known/jwks.json`` — a public, unauthenticated endpoint that
returns the RSA public key(s) used to sign TibaBot user-identity JWTs.
TibaBot caches the response for up to 1 hour.
"""

from django.http import JsonResponse
from django.urls import path
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_GET

from .jwks import get_jwks


@require_GET
@cache_control(public=True, max_age=3600)  # Cache for 1 hour (matches TibaBot)
def jwks_view(request):  # noqa: ARG001 — Django views require the request parameter
    """Return the JWKS document containing TibaBot JWT signing public keys."""
    return JsonResponse(get_jwks(), content_type="application/json")


urlpatterns = [
    path("", jwks_view, name="tibabot-jwks"),
]
