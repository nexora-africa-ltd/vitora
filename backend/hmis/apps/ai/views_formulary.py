"""
Drug Formulary proxy views.

Proxies requests to TibaBot's Drug Formulary endpoints:
- /drugs/search — unified search across SmPC, PPB Products, KEML
- /drugs/smpc/{doc_id} — full SmPC monograph detail
- /drugs/stats — service health and data statistics
"""

import logging

from rest_framework import permissions, serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog

from .client import TibaBotError, TibaBotUnavailableError, get_tibabot_client
from .feature_flags import AIFeatureGatedMixin

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────
# Request Serializers
# ──────────────────────────────────────────────────────────────────────


class FormularySearchRequestSerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=200)
    limit = serializers.IntegerField(min_value=1, max_value=50, default=10, required=False)


# ──────────────────────────────────────────────────────────────────────
# Views
# ──────────────────────────────────────────────────────────────────────


class FormularySearchView(AIFeatureGatedMixin, APIView):
    """
    Search Kenya's pharmaceutical data sources.

    Proxies to TibaBot /drugs/search endpoint which searches across:
    - SmPC (Summary of Product Characteristics)
    - PPB Products (Pharmacy & Poisons Board register)
    - KEML (Kenya Essential Medicines List)
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        serializer = FormularySearchRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        query = serializer.validated_data["q"]
        limit = serializer.validated_data.get("limit", 10)

        # Audit log
        AuditLog.log(
            action="ai_formulary_search",
            user=request.user,
            resource_type="DrugFormulary",
            resource_id=0,
            details={"query": query, "limit": limit},
            request=request,
        )

        try:
            client = get_tibabot_client()
            result = client._request(
                "GET",
                "/drugs/search",
                params={"q": query, "limit": limit},
            )
        except TibaBotUnavailableError:
            return Response(
                {
                    "query": query,
                    "total_results": 0,
                    "smpc": [],
                    "ppb_products": [],
                    "keml": [],
                    "error": "Drug formulary service is currently unavailable.",
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("Formulary search failed: %s", e)
            return Response(
                {
                    "query": query,
                    "total_results": 0,
                    "smpc": [],
                    "ppb_products": [],
                    "keml": [],
                    "error": "Drug formulary search failed.",
                },
                status=status.HTTP_200_OK,
            )

        return Response(result)


class FormularySmpcDetailView(AIFeatureGatedMixin, APIView):
    """
    Retrieve full SmPC monograph for a specific drug product.

    Proxies to TibaBot /drugs/smpc/{doc_id} endpoint.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, doc_id: str) -> Response:
        # Audit log
        AuditLog.log(
            action="ai_formulary_smpc_view",
            user=request.user,
            resource_type="DrugFormulary",
            resource_id=0,
            details={"doc_id": doc_id},
            request=request,
        )

        try:
            client = get_tibabot_client()
            result = client._request("GET", f"/drugs/smpc/{doc_id}")
        except TibaBotUnavailableError:
            return Response(
                {"detail": "Drug formulary service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            if e.status_code == 404:
                return Response(
                    {"detail": f"SmPC document '{doc_id}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            logger.error("SmPC detail fetch failed: %s", e)
            return Response(
                {"detail": "Failed to retrieve SmPC document."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class FormularyStatsView(AIFeatureGatedMixin, APIView):
    """
    Drug formulary service statistics and health check.

    Proxies to TibaBot /drugs/stats endpoint.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:  # noqa: ARG002
        try:
            client = get_tibabot_client()
            result = client._request("GET", "/drugs/stats")
        except TibaBotUnavailableError:
            return Response(
                {"loaded": False, "smpc_count": 0, "ppb_products_count": 0, "keml_count": 0},
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("Formulary stats failed: %s", e)
            return Response(
                {"loaded": False, "smpc_count": 0, "ppb_products_count": 0, "keml_count": 0},
                status=status.HTTP_200_OK,
            )

        return Response(result)
