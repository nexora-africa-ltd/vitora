# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Normalized DHA terminology lookup endpoint.

Use ``GET /api/terminology/lookup/<key>/?q=<query>&limit=<n>`` for approved
HPT, ICD-11, LOINC, and ICHI concept sources. Accepted keys are registry keys;
clients cannot supply arbitrary upstream owner or source values.
"""

from __future__ import annotations

from django.conf import settings
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService
from hmis.apps.billing.services.terminology_operations import terminology_health
from hmis.apps.billing.services.terminology_source_registry import get_terminology_source
from hmis.apps.core.mixins import resolve_request_tenant
from hmis.apps.core.services.snomed_service import SNOMEDService


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


class StandardTerminologyUsageView(APIView):
    """Demonstrate current ICD-11, SNOMED CT, and LOINC validation for DHA."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Verify DHA standard terminology usage",
        description=(
            "Validates controlled ICD-11, SNOMED CT, and LOINC examples against "
            "the configured current terminology sources. Requires an authorized "
            "X-Facility-ID tenant context."
        ),
        responses={200: OpenApiTypes.OBJECT, 503: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Return a fail-closed, facility-contextualized standards verification."""
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility is None:
            return Response(
                {"detail": "An authorized X-Facility-ID header is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dha_terminology = TerminologyService()
        snomed = SNOMEDService()
        try:
            icd11_result = self._find_code(
                dha_terminology.search_concepts("icd11", "Essential hypertension", limit=20),
                "BA00",
            )
            snomed_result = snomed.lookup("38341003")
            loinc_result = self._find_code(
                dha_terminology.search_concepts("loinc", "Complete blood count", limit=20),
                "57021-8",
            )
        except TerminologyError:
            icd11_result = snomed_result = loinc_result = None

        standards = {
            "icd11": {
                "system": "http://id.who.int/icd/release/11/mms",
                "code": "BA00",
                "display": getattr(icd11_result, "display", ""),
                "version": getattr(icd11_result, "version", "") or settings.ICD11_MMS_RELEASE,
                "valid": icd11_result is not None,
            },
            "snomed_ct": {
                "system": "http://snomed.info/sct",
                "code": "38341003",
                "display": getattr(snomed_result, "display", ""),
                "version": settings.SNOMED_CT_RELEASE,
                "valid": snomed_result is not None,
            },
            "loinc": {
                "system": "http://loinc.org",
                "code": "57021-8",
                "display": getattr(loinc_result, "display", ""),
                "version": getattr(loinc_result, "version", "") or settings.LOINC_RELEASE,
                "valid": loinc_result is not None,
            },
        }
        passed = all(item["valid"] for item in standards.values())
        payload = {
            "passed": passed,
            "verified_at": timezone.now().isoformat(),
            "facility": {"id": facility.id, "name": facility.name},
            "standards": standards,
        }
        return Response(
            payload,
            status=status.HTTP_200_OK if passed else status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @staticmethod
    def _find_code(concepts, code: str):
        """Return the exact code from a controlled DHA terminology result set."""
        return next((concept for concept in concepts if concept.code == code), None)
