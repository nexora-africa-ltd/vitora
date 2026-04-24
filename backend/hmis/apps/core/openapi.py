"""drf-spectacular extensions for custom Vitora API components."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class CookieJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    """Describe cookie-based JWT auth in OpenAPI."""

    target_class = "hmis.apps.core.cookie_auth_backend.CookieJWTAuthentication"
    name = "cookieJwtAuth"

    def get_security_definition(self, _auto_schema):
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": "vitora_access",
            "description": "JWT access token stored in the vitora_access httpOnly cookie.",
        }
