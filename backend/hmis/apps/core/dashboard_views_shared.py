# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core dashboard views shared for Vitora HMIS.

What this file is for:
- Implement dashboard views shared logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

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


def _dashboard_section_exceptions() -> tuple[type[Exception], ...]:
    return (
        DatabaseError,
        FieldError,
        ArithmeticError,
        AttributeError,
        KeyError,
        LookupError,
        TimeoutError,
        TypeError,
        ValueError,
        RuntimeError,
    )


# Cache configuration
DASHBOARD_STATS_CACHE_KEY = "dashboard_stats"
DASHBOARD_STATS_TTL = 300  # 5 minutes


def _resolve_tenant_for_request(request):
    """
    Lazy-resolve facility/organization on the request.

    With JWT authentication, the TenantMiddleware sees AnonymousUser
    (DRF auth runs after middleware), so request.facility is None.
    This re-resolves from the X-Facility-Id header or the user's
    primary_facility — mirroring TenantScopedViewMixin._resolve_tenant_context.
    """
    resolve_request_tenant(request)
