# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""drf-spectacular extensions for custom Vitora API components."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework import serializers


class SchemaFallbackSerializer(serializers.Serializer):
    """Named no-field serializer for schema fallbacks on APIViews/ViewSets."""


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


class HubLicenseOrJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    """Describe hub license or user Bearer auth in OpenAPI."""

    target_class = "hmis.apps.licensing.hub_auth.HubLicenseOrJWTAuthentication"
    name = "hubLicenseOrJwtAuth"

    def get_security_definition(self, _auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": (
                "Accepts either a hub license JWT or a standard user JWT in the "
                "Authorization Bearer header."
            ),
        }


def patch_stock_count_items_operation_ids(result, generator, request, public):
    """Assign stable, distinct operationIds for stock-count item list/detail endpoints."""

    del generator, request, public

    paths = result.get("paths", {})
    items_list_path = paths.get("/api/inventory/stock-counts/{id}/items/")
    if isinstance(items_list_path, dict):
        get_op = items_list_path.get("get")
        if isinstance(get_op, dict):
            get_op["operationId"] = "inventory_stock_count_items_list"

    item_detail_path = paths.get("/api/inventory/stock-counts/{id}/items/{item_pk}/")
    if isinstance(item_detail_path, dict):
        get_op = item_detail_path.get("get")
        if isinstance(get_op, dict):
            get_op["operationId"] = "inventory_stock_count_item_retrieve"
        patch_op = item_detail_path.get("patch")
        if isinstance(patch_op, dict):
            patch_op["operationId"] = "inventory_stock_count_item_partial_update"

    return result
