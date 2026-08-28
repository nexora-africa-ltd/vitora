# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: activity feed dashboard endpoint and formatting helpers.
How to use: imported by `hmis.apps.core.dashboard_views` compatibility shim.
Supported inputs/args: DRF function views/helpers for dashboard activity streams.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Dashboard Statistics API views.

Provides real-time statistics for the HMIS dashboard with caching
to maintain fast response times while reflecting actual database state.

Stats are scoped to the active facility (via ``request.facility``,
resolved by ``TenantMiddleware`` from the ``X-Facility-Id`` header).
When no facility context is available, stats are org-wide or global.
"""

import logging
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.core.exceptions import FieldError
from django.db import DatabaseError
from django.db.models import Count, Sum
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import resolve_request_tenant

logger = logging.getLogger(__name__)


from hmis.apps.core.dashboard_views_shared import (
    _dashboard_section_exceptions,
    _resolve_tenant_for_request,
)

ACTIVITY_FEED_CACHE_KEY = "activity_feed"
ACTIVITY_FEED_TTL = 60  # 1 minute (shorter TTL for real-time feel)


@extend_schema(
    parameters=[
        OpenApiParameter(
            "limit",
            OpenApiTypes.INT,
            description="Number of items to return (default: 20, max: 100)",
            required=False,
        ),
        OpenApiParameter(
            "offset", OpenApiTypes.INT, description="Pagination offset (default: 0)", required=False
        ),
        OpenApiParameter(
            "types",
            OpenApiTypes.STR,
            description="Comma-separated list of activity types to filter",
            required=False,
        ),
        OpenApiParameter(
            "actions",
            OpenApiTypes.STR,
            description="Comma-separated list of actions to filter",
            required=False,
        ),
        OpenApiParameter("refresh", OpenApiTypes.BOOL, description="Bypass cache", required=False),
    ],
    responses={200: OpenApiTypes.OBJECT},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def activity_feed(request):
    """
    Get recent activity feed for dashboard.

    Returns a paginated list of recent activities across all modules.

    Query Parameters:
        limit (int): Number of items to return (default: 20, max: 100)
        offset (int): Pagination offset (default: 0)
        types (str): Comma-separated list of activity types to filter
        actions (str): Comma-separated list of actions to filter
        refresh (bool): Bypass cache and fetch fresh data
    """
    # Parse parameters
    try:
        limit = min(int(request.query_params.get("limit", 20)), 100)
        if limit < 1:
            limit = 20
    except (ValueError, TypeError):
        limit = 20

    try:
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (ValueError, TypeError):
        offset = 0

    types_param = request.query_params.get("types", "")
    types_filter = [t.strip() for t in types_param.split(",") if t.strip()] if types_param else None

    actions_param = request.query_params.get("actions", "")
    actions_filter = (
        [a.strip() for a in actions_param.split(",") if a.strip()] if actions_param else None
    )

    bypass_cache = request.query_params.get("refresh", "").lower() == "true"

    # Build cache key
    cache_key = f"{ACTIVITY_FEED_CACHE_KEY}:{limit}:{offset}:{types_param}:{actions_param}"

    if not bypass_cache:
        cached_result = cache.get(cache_key)
        if cached_result:
            return Response(cached_result)

    # Fetch activity data
    result = _get_activity_feed(limit, offset, types_filter, actions_filter, request)

    # Cache the result
    cache.set(cache_key, result, ACTIVITY_FEED_TTL)

    return Response(result)


def _get_activity_feed(
    limit: int, offset: int, types_filter: list, actions_filter: list, _request
) -> dict:
    """
    Fetch activity feed data from the database.

    Args:
        limit: Maximum number of items to return
        offset: Pagination offset
        types_filter: List of activity types to filter by
        actions_filter: List of actions to filter by
        request: The HTTP request object (for building URLs)

    Returns:
        dict: Activity feed data with count, next link, and results
    """
    from hmis.apps.core.models import ActivityFeed

    # Build queryset
    queryset = ActivityFeed.objects.select_related("user").order_by("-timestamp")

    if types_filter:
        queryset = queryset.filter(activity_type__in=types_filter)

    if actions_filter:
        queryset = queryset.filter(action__in=actions_filter)

    # Get total count
    total_count = queryset.count()

    # Paginate
    activities = queryset[offset : offset + limit]

    # Build next link
    next_offset = offset + limit
    if next_offset < total_count:
        next_link = f"/api/core/dashboard/activity-feed/?limit={limit}&offset={next_offset}"
        if types_filter:
            next_link += f"&types={','.join(types_filter)}"
        if actions_filter:
            next_link += f"&actions={','.join(actions_filter)}"
    else:
        next_link = None

    # Format results
    results = []
    for activity in activities:
        results.append(_format_activity(activity))

    return {
        "count": total_count,
        "next": next_link,
        "results": results,
    }


def _format_activity(activity) -> dict:
    """
    Format an ActivityFeed entry for API response.

    Args:
        activity: ActivityFeed model instance

    Returns:
        dict: Formatted activity data
    """
    # Format user info
    user_info = None
    if activity.user:
        full_name = activity.user.get_full_name()
        name = full_name if full_name.strip() else activity.user.username
        user_info = {
            "id": activity.user.id,
            "name": name,
        }

    # Generate resource href
    href = _get_resource_href(activity.resource_type, activity.resource_id)

    return {
        "id": f"act_{activity.id}",
        "type": activity.activity_type,
        "action": activity.action,
        "title": activity.title,
        "description": activity.description,
        "timestamp": activity.timestamp.isoformat(),
        "user": user_info,
        "resource": {
            "type": activity.resource_type,
            "id": activity.resource_id,
            "href": href,
        },
    }


def _get_resource_href(resource_type: str, resource_id: int) -> str:
    """
    Generate the frontend URL for a resource.

    Args:
        resource_type: Type of resource (Patient, Encounter, etc.)
        resource_id: ID of the resource

    Returns:
        str: Frontend URL path for the resource
    """
    resource_type_lower = resource_type.lower()

    href_mappings = {
        "patient": f"/patients/{resource_id}",
        "encounter": f"/encounters/{resource_id}",
        "laborder": f"/laboratory/orders/{resource_id}",
        "labresult": f"/laboratory/results/{resource_id}",
        "prescription": f"/pharmacy/prescriptions/{resource_id}",
        "invoice": f"/billing/invoices/{resource_id}",
        "payment": f"/billing/payments/{resource_id}",
        "triageassessment": f"/triage/{resource_id}",
        "admission": f"/inpatient/admissions/{resource_id}",
        "appointment": f"/appointments/{resource_id}",
        "inventoryitem": f"/pharmacy/inventory/{resource_id}",
        "stockalert": f"/pharmacy/alerts/{resource_id}",
    }

    return href_mappings.get(resource_type_lower, f"/{resource_type_lower}s/{resource_id}")
