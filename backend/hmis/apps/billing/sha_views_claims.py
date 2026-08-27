"""
What this file is for: composed SHA claim ViewSet assembled from focused mixins.
How to use: import SHAClaimViewSet and helper re-exports from this module; routes remain unchanged.
Supported inputs/args: DRF ViewSet actions for SHA claims, including workflow, ILM, attachments, and reporting endpoints.
"""

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BrowsableAPIRenderer, JSONRenderer

from hmis.apps.billing.filters import SHAClaimFilter
from hmis.apps.billing.models import SHAClaim
from hmis.apps.billing.renderers import CSVRenderer, XLSXRenderer
from hmis.apps.billing.sha_views_claims_attachments import SHAClaimAttachmentsMixin
from hmis.apps.billing.sha_views_claims_helpers import (
    _build_attachment_sync_status,
    _collect_unresolved_claim_lines,
    _extract_dha_invoice_number,
    _extract_preview_claim_reference,
    _infer_tariff_category_from_code,
    _normalize_attachment_name,
    _parse_money,
    _stringify_error,
    _to_dha_document_type,
    _to_dha_document_type_for_claim,
    _to_local_attachment_type,
)
from hmis.apps.billing.sha_views_claims_ilm import SHAClaimILMMixin
from hmis.apps.billing.sha_views_claims_reporting import SHAClaimReportingMixin
from hmis.apps.billing.sha_views_claims_workflow import SHAClaimWorkflowMixin
from hmis.apps.billing.sha_views_members import SHAPagination
from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.permissions import ReadRequiresModelPermission, SHAPermission
from hmis.apps.licensing.permissions import requires_feature


@extend_schema_view(
    item_allocation=extend_schema(
        parameters=[
            OpenApiParameter(
                name="item_id",
                location=OpenApiParameter.PATH,
                required=True,
                type=OpenApiTypes.INT,
            )
        ]
    ),
    attachment_detail=extend_schema(
        parameters=[
            OpenApiParameter(
                name="attachment_id",
                location=OpenApiParameter.PATH,
                required=True,
                type=OpenApiTypes.INT,
            )
        ]
    ),
)
class SHAClaimViewSet(
    SHAClaimReportingMixin,
    SHAClaimILMMixin,
    SHAClaimAttachmentsMixin,
    SHAClaimWorkflowMixin,
    AuditedMutationMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """ViewSet for SHA Claims management."""

    queryset = (
        SHAClaim.objects.select_related(
            "patient", "sha_member", "encounter", "created_by", "submitted_by", "facility"
        )
        .prefetch_related("items", "attachments")
        .all()
    )
    audit_resource_type = "SHAClaim"
    audit_action_prefix = "billing.sha_claim"
    audit_source = "sha_api"
    tenant_scope = "facility"
    lookup_value_regex = r"\d+"
    permission_classes = [
        IsAuthenticated,
        SHAPermission,
        requires_feature("sha_claims"),
        ReadRequiresModelPermission,
    ]
    renderer_classes = [JSONRenderer, BrowsableAPIRenderer, CSVRenderer, XLSXRenderer]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SHAClaimFilter
    search_fields = [
        "claim_number",
        "sha_claim_reference",
        "patient__first_name",
        "patient__last_name",
    ]
    ordering_fields = ["created_at", "service_date", "claimed_amount"]
    ordering = ["-created_at"]


__all__ = [
    "SHAClaimViewSet",
    "_build_attachment_sync_status",
    "_collect_unresolved_claim_lines",
    "_extract_dha_invoice_number",
    "_extract_preview_claim_reference",
    "_infer_tariff_category_from_code",
    "_normalize_attachment_name",
    "_parse_money",
    "_stringify_error",
    "_to_dha_document_type",
    "_to_dha_document_type_for_claim",
    "_to_local_attachment_type",
]
