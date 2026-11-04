# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Normalized DHA terminology lookup endpoint.

Use ``GET /api/terminology/lookup/<key>/?q=<query>&limit=<n>`` for approved
HPT, ICD-11, LOINC, and ICHI concept sources. Accepted keys are registry keys;
clients cannot supply arbitrary upstream owner or source values.
"""

from __future__ import annotations

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService
from hmis.apps.billing.services.terminology_operations import terminology_health
from hmis.apps.billing.services.terminology_source_registry import get_terminology_source


class TerminologyLookupView(APIView):
    """Return normalized DHA Clinical Concepts from an approved registry key."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter("q", OpenApiTypes.STR, required=True),
            OpenApiParameter("limit", OpenApiTypes.INT, required=False),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request, terminology_key: str):
        """Search the named controlled terminology source."""
        query = str(request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response({"detail": "q must contain at least two characters."}, status=400)
        try:
            limit = min(max(int(request.query_params.get("limit", 20)), 1), 100)
        except ValueError:
            return Response({"detail": "limit must be an integer."}, status=400)
        try:
            source = get_terminology_source(terminology_key)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            concepts = TerminologyService().search_concepts(terminology_key, query, limit=limit)
        except TerminologyError:
            return Response(
                {"detail": "Terminology service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "count": len(concepts),
                "source": {
                    "key": source.key,
                    "owner": source.owner,
                    "source": source.source,
                    "endpoint": source.endpoint,
                },
                "results": [
                    {
                        "code": concept.code,
                        "display": concept.display,
                        "owner": concept.owner,
                        "source": concept.source,
                        "system": concept.system,
                        "retrieved_at": concept.retrieved_at.isoformat()
                        if concept.retrieved_at
                        else None,
                        "version": concept.version,
                    }
                    for concept in concepts
                ],
            }
        )


class TerminologyHealthView(APIView):
    """Expose selected-cache freshness for authenticated operations monitoring."""

    permission_classes = [IsAuthenticated]

    def get(self, request):  # noqa: ARG002
        """Return cache freshness without performing a remote terminology call."""
        return Response(terminology_health())
