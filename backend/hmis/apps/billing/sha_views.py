# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Views for SHA (Social Health Authority) billing endpoints.

Provides ViewSets for SHA Members, Tariffs, Claims, and related operations.
"""

import csv
import hashlib
import logging
import os
from collections.abc import Mapping
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import models
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BrowsableAPIRenderer, JSONRenderer
from rest_framework.response import Response

from hmis.apps.billing.document_types import (
    dha_document_type_to_local_attachment_type,
    local_to_dha_document_type,
)
from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.filters import SHAClaimFilter, SHAMemberFilter
from hmis.apps.billing.models import (
    FacilityBillingConfig,
    SHAClaim,
    SHAClaimAttachment,
    SHAClaimItem,
    SHAEligibilityCheck,
    SHAMember,
    SHATariff,
)
from hmis.apps.billing.renderers import CSVRenderer, XLSXRenderer
from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
from hmis.apps.billing.sha_serializers import (
    SHAClaimAppealSerializer,
    SHAClaimAttachmentSerializer,
    SHAClaimDashboardSerializer,
    SHAClaimDetailSerializer,
    SHAClaimItemSerializer,
    SHAClaimSerializer,
    SHAClaimSubmitSerializer,
    SHAClaimValidationSerializer,
    SHAEligibilityVerifySerializer,
    SHAMemberDetailSerializer,
    SHAMemberSerializer,
    SHATariffSerializer,
)
from hmis.apps.core.kms import get_kms_provider
from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import SHAPermission, WriteRequiresRolePermission
from hmis.apps.licensing.permissions import requires_feature

logger = logging.getLogger(__name__)


def _to_dha_document_type(
    local_attachment_type: str,
    *,
    attachment_name: str = "",
    original_filename: str = "",
) -> str:
    haystack = _normalize_attachment_name(f"{attachment_name} {original_filename}")
    if "critical care" in haystack or "icu" in haystack:
        return "CRITICAL_CARE_UNIT_CASE"
    if "final bill" in haystack:
        return "FINAL_BILL"
    if "claim form" in haystack:
        return "CLAIM_FORM"
    if "discharge summary" in haystack:
        return "DISCHARGE_SUMMARY"

    return local_to_dha_document_type(local_attachment_type)


def _to_dha_document_type_for_claim(claim: SHAClaim, attachment: SHAClaimAttachment) -> str:
    """Resolve DHA doc type with claim-context overrides.

    DHA preview for inpatient flows expects FINAL_BILL, while local attachments often
    store invoice-like types/names. Normalize those to FINAL_BILL for IP claims.
    """
    doc_type = _to_dha_document_type(
        attachment.attachment_type,
        attachment_name=attachment.name,
        original_filename=attachment.original_filename,
    )
    if doc_type == "INVOICE" and claim.claim_type == SHAClaim.ClaimType.INPATIENT:
        return "FINAL_BILL"
    return doc_type


def _normalize_attachment_name(value: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else " " for ch in str(value or "").strip())
    parts = [part for part in normalized.split() if part]
    if (
        parts
        and len(parts[-1]) <= 5
        and parts[-1]
        in {
            "pdf",
            "jpg",
            "jpeg",
            "png",
            "doc",
            "docx",
            "webp",
            "tif",
            "tiff",
        }
    ):
        parts = parts[:-1]
    return " ".join(parts)


def _to_local_attachment_type(dha_document_type: str) -> str:
    return dha_document_type_to_local_attachment_type(
        dha_document_type,
        default=SHAClaimAttachment.AttachmentType.OTHER,
    )


def _build_attachment_sync_status(claim: SHAClaim) -> dict:
    from hmis.apps.billing.services.consent_token_resolver import resolve_for_claim
    from hmis.apps.billing.services.ilm_claim_service import PREVIEW_PATH
    from hmis.apps.core.models import DHAOutboundCall

    local_attachments = list(claim.attachments.all())
    local_count = len(local_attachments)
    if local_count == 0:
        return {
            "local_count": 0,
            "matched": 0,
            "total": 0,
            "all_matched": True,
            "missing": [],
            "consent_token_present": False,
        }

    try:
        consent = resolve_for_claim(claim)
        consent_token = consent.token
    except Exception:
        consent_token = ""

    if not consent_token:
        return {
            "local_count": local_count,
            "matched": 0,
            "total": local_count,
            "all_matched": False,
            "missing": [
                {
                    "attachment_id": att.id,
                    "attachment_name": att.name,
                    "attachment_type": _to_dha_document_type_for_claim(claim, att),
                }
                for att in local_attachments
            ],
            "consent_token_present": False,
        }

    bucket: dict[tuple[str, str], list[dict[str, str]]] = {}
    match_source = "upload_history"
    stale_preview_detected = False

    latest_upload_call = (
        DHAOutboundCall.objects.filter(
            path="/api/v1/claims/attachments",
            consent_token=consent_token,
            status=DHAOutboundCall.Status.SUCCESS,
        )
        .order_by("-created_at")
        .first()
    )
    latest_upload_at = latest_upload_call.created_at if latest_upload_call else None

    # Preferred source of truth: latest successful DHA preview payload.
    # If preview says claim_attachments is empty, we must treat sync as missing even if
    # uploads previously succeeded in outbound logs.
    preview_calls = DHAOutboundCall.objects.filter(
        path=PREVIEW_PATH,
        consent_token=consent_token,
        status=DHAOutboundCall.Status.SUCCESS,
    ).order_by("-created_at")

    for call in preview_calls:
        response = call.response_excerpt if isinstance(call.response_excerpt, Mapping) else {}
        payload = response
        if isinstance(response.get("payload"), Mapping):
            payload = response.get("payload")
        attachments = payload.get("claim_attachments") if isinstance(payload, Mapping) else None
        if not isinstance(attachments, list):
            continue

        # If we have newer successful upload calls than this preview snapshot,
        # treat preview as stale and fall back to upload history matching.
        if latest_upload_at and call.created_at and latest_upload_at > call.created_at:
            stale_preview_detected = True
            break

        match_source = "preview"
        for entry in attachments:
            if not isinstance(entry, Mapping):
                continue
            doc_type = (
                str(
                    entry.get("attachment_type")
                    or entry.get("document_type")
                    or entry.get("type")
                    or ""
                )
                .strip()
                .upper()
            )
            if not doc_type:
                continue
            doc_title = str(
                entry.get("title")
                or entry.get("document_title")
                or entry.get("attachment_name")
                or entry.get("description")
                or ""
            ).strip()
            key = (doc_type, _normalize_attachment_name(doc_title))
            bucket.setdefault(key, []).append(
                {
                    "remote_attachment_id": str(
                        entry.get("id")
                        or entry.get("attachment_id")
                        or entry.get("attachment_guid")
                        or ""
                    ).strip(),
                    "intervention_code": str(entry.get("intervention_code") or "").strip(),
                }
            )
        break

    if stale_preview_detected and match_source != "preview":
        match_source = "upload_history_after_stale_preview"

    # Fallback for flows where preview has not yet been run.
    if not bucket and match_source != "preview":
        calls = DHAOutboundCall.objects.filter(
            path="/api/v1/claims/attachments",
            consent_token=consent_token,
            status=DHAOutboundCall.Status.SUCCESS,
        ).order_by("created_at")

        for call in calls:
            payload = call.request_payload if isinstance(call.request_payload, Mapping) else {}
            response = call.response_excerpt if isinstance(call.response_excerpt, Mapping) else {}
            doc_type = str(payload.get("document_type") or "").strip().upper()
            doc_title = str(
                payload.get("document_title")
                or payload.get("attachment_name")
                or payload.get("document_name")
                or ""
            ).strip()
            if not doc_type:
                continue
            key = (doc_type, _normalize_attachment_name(doc_title))
            remote_attachment_id = str(
                response.get("id")
                or response.get("attachment_id")
                or response.get("attachment_guid")
                or ""
            ).strip()
            intervention_code = str(
                payload.get("intervention_code") or response.get("intervention_code") or ""
            ).strip()
            bucket.setdefault(key, []).append(
                {
                    "remote_attachment_id": remote_attachment_id,
                    "intervention_code": intervention_code,
                }
            )

    matched = 0
    matched_details: list[dict[str, str | int]] = []
    missing: list[dict[str, str | int]] = []
    for att in local_attachments:
        doc_type = _to_dha_document_type_for_claim(claim, att)
        candidates = [
            _normalize_attachment_name(att.name),
            _normalize_attachment_name(att.original_filename),
        ]
        found = False
        for name_key in candidates:
            key = (doc_type, name_key)
            entries = bucket.get(key) or []
            if entries:
                matched_meta = entries.pop(0)
                matched += 1
                matched_details.append(
                    {
                        "attachment_id": att.id,
                        "attachment_name": att.name,
                        "attachment_type": doc_type,
                        "remote_attachment_id": matched_meta.get("remote_attachment_id", ""),
                        "intervention_code": matched_meta.get("intervention_code", ""),
                    }
                )
                found = True
                break
        if not found:
            missing.append(
                {
                    "attachment_id": att.id,
                    "attachment_name": att.name,
                    "attachment_type": doc_type,
                }
            )

    return {
        "local_count": local_count,
        "matched": matched,
        "total": local_count,
        "all_matched": len(missing) == 0,
        "match_source": match_source,
        "matched_details": matched_details,
        "missing": missing,
        "consent_token_present": True,
    }


def _stringify_error(exc: Exception) -> str:
    """Extract the most useful client-safe error message from an exception."""
    if isinstance(exc, serializers.ValidationError):
        detail = getattr(exc, "detail", None)
        if isinstance(detail, list):
            return "; ".join(str(item) for item in detail if item)
        if isinstance(detail, Mapping):
            parts: list[str] = []
            for field, msgs in detail.items():
                if isinstance(msgs, list):
                    joined = ", ".join(str(m) for m in msgs if m)
                else:
                    joined = str(msgs)
                if joined:
                    parts.append(f"{field}: {joined}")
            if parts:
                return "; ".join(parts)
        if detail:
            return str(detail)

    message_dict = getattr(exc, "message_dict", None)
    if isinstance(message_dict, Mapping) and message_dict:
        parts = []
        for field, msgs in message_dict.items():
            joined = ", ".join(str(m) for m in msgs if m) if isinstance(msgs, list) else str(msgs)
            if joined:
                parts.append(f"{field}: {joined}")
        if parts:
            return "; ".join(parts)

    messages = getattr(exc, "messages", None)
    if isinstance(messages, list) and messages:
        return "; ".join(str(m) for m in messages if m)

    raw = str(exc).strip()
    if raw:
        return raw
    return f"{exc.__class__.__name__}"


def _parse_money(value, field_name: str) -> Decimal:
    try:
        parsed = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise serializers.ValidationError({field_name: "Must be a valid decimal amount."}) from exc
    return parsed


def _extract_dha_invoice_number(payload: object) -> str:
    """Extract DHA invoice identifier from an ILM preview-style payload."""
    if not isinstance(payload, Mapping):
        return ""
    invoices = payload.get("invoices")
    if not isinstance(invoices, list):
        return ""
    for invoice in invoices:
        if not isinstance(invoice, Mapping):
            continue
        candidate = str(
            invoice.get("invoice_number")
            or invoice.get("invoice_no")
            or invoice.get("invoice")
            or ""
        ).strip()
        if candidate:
            return candidate
    return ""


def _extract_preview_claim_reference(payload: object) -> str:
    """Extract DHA claim UUID/reference from an ILM preview-style payload."""
    if not isinstance(payload, Mapping):
        return ""
    candidate = str(
        payload.get("claim") or payload.get("claim_id") or payload.get("id") or ""
    ).strip()
    return candidate


def _collect_unresolved_claim_lines(claim: SHAClaim) -> list[dict[str, object]]:
    """Return claim item details for lines still missing tariff mapping."""
    unresolved = []
    items_without_tariff = claim.items.filter(tariff__isnull=True).select_related(
        "invoice_item__service"
    )
    for item in items_without_tariff:
        invoice_item = getattr(item, "invoice_item", None)
        service = getattr(invoice_item, "service", None)
        unresolved.append(
            {
                "claim_item_id": item.id,
                "description": item.description,
                "quantity": str(item.quantity),
                "unit_price": str(item.unit_price),
                "claimed_amount": str(item.claimed_amount),
                "invoice_item_id": getattr(invoice_item, "id", None),
                "service_id": getattr(service, "id", None),
                "service_name": getattr(service, "name", "") if service else "",
            }
        )
    return unresolved


def _infer_tariff_category_from_code(tariff_code: str) -> str:
    """Best-effort category inference for preview-driven tariff upserts."""
    prefix = "-".join(str(tariff_code or "").upper().split("-")[:2])
    inpatient_prefixes = {"SHA-03", "SHA-07", "SHA-13", "SHA-19", "SHA-20"}
    if prefix in inpatient_prefixes:
        return SHATariff.TariffCategory.INPATIENT
    return SHATariff.TariffCategory.OTHER


class SHAPagination(PageNumberPagination):
    """Custom pagination for SHA endpoints supporting page_size parameter."""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class SHAMemberViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SHA Member management.

    Provides CRUD operations for SHA members with eligibility verification.
    """

    queryset = SHAMember.objects.select_related("patient", "created_by").all()
    lookup_value_regex = r"\d+"
    permission_classes = [IsAuthenticated, SHAPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SHAMemberFilter
    search_fields = ["sha_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["created_at", "sha_number"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "retrieve":
            return SHAMemberDetailSerializer
        return SHAMemberSerializer

    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()

        # Filter by modified_since for sync
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            queryset = queryset.filter(updated_at__gte=modified_since)

        return queryset

    @action(detail=True, methods=["post"], url_path="verify")
    def verify(self, request, pk=None):
        """
        Verify eligibility for a SHA member.

        POST /api/sha/members/{id}/verify/
        """
        member = self.get_object()

        service = SHAEligibilityService()
        facility = getattr(request, "facility", None)
        check = service.check_eligibility(member, request.user, facility=facility)

        is_eligible = getattr(check, "is_eligible", False)
        if not isinstance(is_eligible, bool):
            is_eligible = bool(is_eligible) if is_eligible is not None else False

        result = getattr(check, "result", "") or ""
        if not isinstance(result, str):
            result = str(result)

        eligible_until = getattr(check, "eligible_until", None)
        if not isinstance(eligible_until, date):
            eligible_until = None

        benefit_balance = None
        raw_balance = getattr(check, "benefit_balance", None)
        if raw_balance is not None:
            try:
                benefit_balance = (
                    raw_balance if isinstance(raw_balance, Decimal) else Decimal(str(raw_balance))
                )
            except (InvalidOperation, TypeError, ValueError):
                benefit_balance = None

        ineligibility_reason = getattr(check, "ineligibility_reason", "") or ""
        if not isinstance(ineligibility_reason, str):
            ineligibility_reason = ""

        error_code = getattr(check, "error_code", "") or ""
        if not isinstance(error_code, str):
            error_code = ""

        error_message = getattr(check, "error_message", "") or ""
        if not isinstance(error_message, str):
            error_message = ""

        response_data = getattr(check, "response_data", {}) or {}
        if not isinstance(response_data, dict):
            response_data = {}
        eligible_schemes = response_data.get("eligible_schemes") or []
        if not isinstance(eligible_schemes, list):
            eligible_schemes = []
        coverage_caveat = response_data.get("coverage_caveat") or ""
        if not isinstance(coverage_caveat, str):
            coverage_caveat = ""
        coverage_blocked = bool(response_data.get("coverage_blocked", False))
        billable_schemes = response_data.get("billable_schemes") or []
        if not isinstance(billable_schemes, list):
            billable_schemes = []

        serializer = SHAEligibilityVerifySerializer(
            {
                "is_eligible": is_eligible,
                "result": result,
                "eligible_until": eligible_until,
                "benefit_balance": benefit_balance,
                "ineligibility_reason": ineligibility_reason,
                "error_code": error_code,
                "error_message": error_message,
                "eligible_schemes": eligible_schemes,
                "billable_schemes": billable_schemes,
                "coverage_caveat": coverage_caveat,
                "coverage_blocked": coverage_blocked,
            }
        )

        if result in [
            SHAEligibilityCheck.CheckResult.ERROR,
            SHAEligibilityCheck.CheckResult.TIMEOUT,
        ]:
            return Response(serializer.data, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        """
        Search SHA members by various criteria.

        GET /api/sha/members/search/?sha_number=XXX&national_id=XXX&patient_name=XXX
        """
        queryset = self.get_queryset()

        sha_number = request.query_params.get("sha_number")
        national_id = request.query_params.get("national_id")
        patient_name = request.query_params.get("patient_name")

        if sha_number:
            queryset = queryset.filter(sha_number__icontains=sha_number)
        if national_id:
            queryset = queryset.filter(
                national_id_hmac=get_kms_provider().compute_hmac(national_id)
            )
        if patient_name:
            queryset = queryset.filter(
                patient__first_name__icontains=patient_name
            ) | queryset.filter(patient__last_name__icontains=patient_name)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data})

    @action(detail=True, methods=["get"], url_path="dependents")
    def dependents(self, request, pk=None):
        """
        Get all dependents for a principal SHA member.

        GET /api/billing/sha-members/{id}/dependents/

        Returns list of SHA members who have this member as their principal.
        Uses the principal FK for integrity, falls back to principal_sha_number for legacy data.
        Only applicable for principal members.
        """
        member = self.get_object()

        # Check if the member is a principal
        if member.membership_type != SHAMember.MembershipType.PRINCIPAL:
            return Response(
                {"detail": "Only principal members can have dependents."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get all dependents linked to this principal (via FK or legacy string field)
        dependents = (
            SHAMember.objects.filter(
                models.Q(principal=member) | models.Q(principal_sha_number=member.sha_number)
            )
            .select_related("patient", "created_by")
            .distinct()
        )

        page = self.paginate_queryset(dependents)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(dependents, many=True)
        return Response({"results": serializer.data, "count": dependents.count()})


class SHATariffViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for SHA Tariff codes.

    Provides read-only access to SHA tariff codes with search and filtering.
    """

    queryset = SHATariff.objects.all()
    lookup_value_regex = r"\d+"
    serializer_class = SHATariffSerializer
    permission_classes = [IsAuthenticated, SHAPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "facility_level", "is_active"]
    search_fields = ["code", "name", "description"]
    ordering_fields = ["code", "name", "sha_amount"]
    ordering = ["code"]

    def get_queryset(self):
        """Filter queryset to only active tariffs by default."""
        queryset = super().get_queryset()

        # Only show active tariffs unless explicitly requested
        show_inactive = self.request.query_params.get("show_inactive", "false").lower() == "true"
        if not show_inactive:
            queryset = queryset.filter(is_active=True)

        return queryset

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        """
        Search tariffs by code or name.

        GET /api/sha/tariffs/search/?code=XXX&q=XXX
        """
        queryset = self.get_queryset()

        code = request.query_params.get("code")
        q = request.query_params.get("q")

        if code:
            queryset = queryset.filter(code__icontains=code)
        if q:
            queryset = queryset.filter(name__icontains=q) | queryset.filter(
                description__icontains=q
            )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data})

    @action(detail=False, methods=["get"], url_path="by-category")
    def by_category(self, request):
        """
        Get tariffs grouped by category.

        GET /api/sha/tariffs/by-category/
        """
        categories = {}
        for tariff in self.get_queryset():
            category = tariff.category
            if category not in categories:
                categories[category] = []
            categories[category].append(SHATariffSerializer(tariff).data)

        return Response(categories)


class SHAClaimViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for SHA Claims management.

    Provides CRUD operations for claims with validation, submission, and appeal workflows.
    """

    queryset = (
        SHAClaim.objects.select_related(
            "patient", "sha_member", "encounter", "created_by", "submitted_by", "facility"
        )
        .prefetch_related("items", "attachments")
        .all()
    )
    tenant_scope = "facility"
    lookup_value_regex = r"\d+"
    permission_classes = [IsAuthenticated, SHAPermission, requires_feature("sha_claims")]
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

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "retrieve":
            return SHAClaimDetailSerializer
        return SHAClaimSerializer

    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()

        # Filter by date range
        service_date_from = self.request.query_params.get("service_date_from")
        service_date_to = self.request.query_params.get("service_date_to")
        from_date = self.request.query_params.get("from_date")
        to_date = self.request.query_params.get("to_date")

        if service_date_from or from_date:
            date_from = service_date_from or from_date
            queryset = queryset.filter(service_date__gte=date_from)
        if service_date_to or to_date:
            date_to = service_date_to or to_date
            queryset = queryset.filter(service_date__lte=date_to)

        # Filter by modified_since for sync
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            queryset = queryset.filter(updated_at__gte=modified_since)

        return queryset

    @action(detail=True, methods=["post"], url_path="validate")
    def validate_claim(self, request, pk=None):
        """
        Validate a claim for submission.

        POST /api/sha/claims/{id}/validate/
        """
        claim = self.get_object()
        is_valid, errors = claim.validate_for_submission()

        serializer = SHAClaimValidationSerializer(
            {
                "is_valid": is_valid,
                "errors": errors,
            }
        )

        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        """
        Submit a claim to SHA.

        POST /api/sha/claims/{id}/submit/

        Supports offline queuing - if the system is offline, the claim
        will be queued for later submission.
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService
        from hmis.apps.core.models import SyncQueue

        claim = self.get_object()
        was_queued_retry = claim.status == SHAClaim.ClaimStatus.PENDING_SUBMISSION
        force_online = request.data.get("force_online", False)

        try:
            service = SHAClaimsService()
            result = service.submit_claim(claim, request.user, force_online=force_online)

            # If claim was queued (offline), return queue info
            if result.get("status") == "queued":
                return Response(
                    {
                        "status": "queued",
                        "message": result.get("message"),
                        "queue_entry_id": result.get("queue_entry_id"),
                        "claim_number": claim.claim_number,
                    }
                )

            # Normal submission response
            claim.refresh_from_db()

            # If this was a manual retry of a queued claim and it submitted
            # successfully, close any stale pending queue entries for this claim.
            if was_queued_retry and claim.status != SHAClaim.ClaimStatus.PENDING_SUBMISSION:
                SyncQueue.objects.filter(
                    model_name="SHAClaimSubmission",
                    record_id=claim.id,
                    status__in=["PENDING", "SYNCING"],
                ).update(status="SYNCED", synced_at=timezone.now())

            serializer = SHAClaimSubmitSerializer(
                {
                    "status": claim.status,
                    "claim_number": claim.claim_number,
                    "submitted_at": claim.submitted_at,
                    "sha_claim_reference": claim.sha_claim_reference,
                }
            )

            return Response(serializer.data)

        except Exception as exc:
            logger.exception("SHA claim submission failed for claim %s", pk)
            return Response(
                {"error": _stringify_error(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="appeal")
    def appeal(self, request, pk=None):
        """
        Create an appeal for a rejected claim.

        POST /api/sha/claims/{id}/appeal/
        """
        claim = self.get_object()

        appeal_serializer = SHAClaimAppealSerializer(data=request.data)
        appeal_serializer.is_valid(raise_exception=True)

        if not claim.can_appeal():
            return Response(
                {"error": "Cannot appeal claim in current status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            appeal_claim = claim.create_appeal(
                reason=appeal_serializer.validated_data["reason"], user=request.user
            )

            serializer = SHAClaimSerializer(appeal_claim, context={"request": request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as exc:
            logger.exception("SHA claim appeal failed for claim %s", pk)
            return Response(
                {"error": _stringify_error(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="resubmit")
    def resubmit(self, request, pk=None):
        """
        Resubmit/retry a claim.

        POST /api/sha/claims/{id}/resubmit/

        - REJECTED / QUERY claims are reset to PENDING_SUBMISSION first.
        - PENDING_SUBMISSION claims trigger an immediate retry.
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        claim = self.get_object()

        allowed_statuses = [
            SHAClaim.ClaimStatus.REJECTED,
            SHAClaim.ClaimStatus.QUERY,
            SHAClaim.ClaimStatus.PENDING_SUBMISSION,
        ]
        if claim.status not in allowed_statuses:
            return Response(
                {
                    "error": (
                        f"Cannot resubmit claim in '{claim.get_status_display()}' status. "
                        "Only rejected, queried, or queued claims can be resubmitted."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reset status so submit_claim validation passes for rejected/query claims.
        if claim.status in [SHAClaim.ClaimStatus.REJECTED, SHAClaim.ClaimStatus.QUERY]:
            claim.status = SHAClaim.ClaimStatus.PENDING_SUBMISSION
            claim.save(update_fields=["status", "updated_at"])

        try:
            service = SHAClaimsService()
            result = service.submit_claim(claim, request.user, force_online=True)

            if result.get("status") == "queued":
                return Response(
                    {
                        "status": "queued",
                        "message": result.get("message"),
                        "queue_entry_id": result.get("queue_entry_id"),
                        "claim_number": claim.claim_number,
                    }
                )

            claim.refresh_from_db()
            serializer = SHAClaimSubmitSerializer(
                {
                    "status": claim.status,
                    "claim_number": claim.claim_number,
                    "submitted_at": claim.submitted_at,
                    "sha_claim_reference": claim.sha_claim_reference,
                }
            )
            return Response(serializer.data)

        except Exception as exc:
            logger.exception("SHA claim resubmission failed for claim %s", pk)
            return Response(
                {"error": _stringify_error(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        """
        Cancel a draft or validated claim (local only, not yet submitted to DHA).

        POST /api/sha/claims/{id}/cancel/

        For claims already submitted to DHA, use the ILM close endpoint instead.
        """
        claim = self.get_object()

        allowed_statuses = [
            SHAClaim.ClaimStatus.DRAFT,
            SHAClaim.ClaimStatus.VALIDATED,
        ]
        if claim.status not in allowed_statuses:
            return Response(
                {
                    "error": (
                        f"Cannot cancel claim in '{claim.get_status_display()}' status. "
                        "Only draft or validated claims can be cancelled locally. "
                        "For submitted claims, use the ILM close endpoint."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        claim.status = SHAClaim.ClaimStatus.CANCELLED
        claim.save(update_fields=["status", "updated_at"])

        return Response(
            {"status": claim.status, "message": "Claim cancelled successfully"},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], url_path="bundle")
    def bundle(self, request, pk=None):
        """
        Get full claim bundle with all nested relations.

        GET /api/sha/claims/{id}/bundle/

        Returns the claim with items, attachments, interventions, and related
        patient/encounter data for export or preview purposes.
        """
        claim = self.get_object()
        serializer = SHAClaimDetailSerializer(claim, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["get", "post"], url_path="items")
    def items(self, request, pk=None):
        """
        List or add items to a claim.

        GET /api/sha/claims/{id}/items/
        POST /api/sha/claims/{id}/items/
        """
        claim = self.get_object()

        if request.method == "GET":
            serializer = SHAClaimItemSerializer(claim.items.all(), many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            serializer = SHAClaimItemSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            # Check tariff max quantity if tariff is provided
            tariff_id = request.data.get("tariff")
            quantity = Decimal(request.data.get("quantity", "1"))

            if tariff_id:
                tariff = get_object_or_404(SHATariff, pk=tariff_id)
                if quantity > tariff.max_quantity_per_claim:
                    return Response(
                        {
                            "quantity": f"Exceeds maximum quantity ({tariff.max_quantity_per_claim}) for this tariff"
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            item = SHAClaimItem.objects.create(claim=claim, **serializer.validated_data)

            return Response(SHAClaimItemSerializer(item).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path=r"items/(?P<item_id>[^/.]+)/allocation")
    def item_allocation(self, request, pk=None, item_id=None):
        """Update SHA/patient/discount allocation for a claim line item."""
        claim = self.get_object()
        item = get_object_or_404(claim.items.all(), pk=item_id)

        sha_covered_amount = _parse_money(
            request.data.get("sha_covered_amount", item.sha_covered_amount),
            "sha_covered_amount",
        )
        patient_payable_amount = _parse_money(
            request.data.get("patient_payable_amount", item.patient_payable_amount),
            "patient_payable_amount",
        )
        discount_amount = _parse_money(
            request.data.get("discount_amount", item.discount_amount),
            "discount_amount",
        )
        discount_reason = str(
            request.data.get("discount_reason", item.discount_reason or "")
        ).strip()

        if discount_amount > 0 and not discount_reason:
            return Response(
                {"error": "Discount/waiver reason is required for audit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.sha_covered_amount = sha_covered_amount
        item.patient_payable_amount = patient_payable_amount
        item.discount_amount = discount_amount
        item.discount_reason = discount_reason
        item.allocation_status = SHAClaimItem.AllocationStatus.RESOLVED
        if discount_amount > 0:
            item.discount_applied_by = request.user
            item.discount_applied_at = timezone.now()
        else:
            item.discount_applied_by = None
            item.discount_applied_at = None

        try:
            item.save()
        except Exception as exc:
            return Response({"error": _stringify_error(exc)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="sha_claim_item_allocation_updated",
            user=request.user,
            resource_type="SHAClaimItem",
            resource_id=item.id,
            details={
                "claim_id": claim.id,
                "sha_covered_amount": str(item.sha_covered_amount),
                "patient_payable_amount": str(item.patient_payable_amount),
                "discount_amount": str(item.discount_amount),
                "discount_reason": item.discount_reason,
                "allocation_status": item.allocation_status,
            },
        )

        claim.refresh_from_db(fields=["claimed_amount"])
        return Response(
            {
                "success": True,
                "item": SHAClaimItemSerializer(item).data,
                "claim_claimed_amount": str(claim.claimed_amount),
            }
        )

    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, pk=None):
        """
        List or upload attachments for a claim.

        GET /api/sha/claims/{id}/attachments/
        POST /api/sha/claims/{id}/attachments/
        """
        claim = self.get_object()

        if request.method == "GET":
            serializer = SHAClaimAttachmentSerializer(claim.attachments.all(), many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            file = request.FILES.get("file")
            if not file:
                return Response({"file": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

            # Validate file size
            max_size = 10 * 1024 * 1024  # 10MB
            if file.size > max_size:
                return Response(
                    {"file": "File size exceeds maximum of 10MB"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Validate file type
            allowed_types = [
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/tiff",
            ]
            if file.content_type not in allowed_types:
                return Response(
                    {"file": f"File type not allowed. Allowed: {', '.join(allowed_types)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Calculate checksum
            file_content = file.read()
            checksum = hashlib.sha256(file_content).hexdigest()
            file.seek(0)  # Reset file pointer

            attachment = SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=request.data.get("attachment_type", "other"),
                name=request.data.get("name", file.name),
                description=request.data.get("description", ""),
                file=file,
                file_size=file.size,
                mime_type=file.content_type,
                checksum=checksum,
                original_filename=file.name,
                uploaded_by=request.user,
            )

            return Response(
                SHAClaimAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED
            )

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"attachments/(?P<attachment_id>[^/.]+)",
        parser_classes=[MultiPartParser, FormParser],
    )
    def attachment_detail(self, request, pk=None, attachment_id=None):
        """Update or delete a local claim attachment."""
        claim = self.get_object()
        attachment = get_object_or_404(claim.attachments, id=attachment_id)

        if request.method == "DELETE":
            attachment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        allowed_types = {choice[0] for choice in SHAClaimAttachment.AttachmentType.choices}
        changed = False

        if "attachment_type" in request.data:
            attachment_type = str(request.data.get("attachment_type") or "").strip()
            if not attachment_type:
                return Response(
                    {"attachment_type": "attachment_type cannot be blank"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if attachment_type not in allowed_types:
                return Response(
                    {"attachment_type": "Invalid attachment_type"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            attachment.attachment_type = attachment_type
            changed = True

        if "name" in request.data:
            attachment.name = str(request.data.get("name") or "").strip()
            changed = True

        if "description" in request.data:
            attachment.description = str(request.data.get("description") or "").strip()
            changed = True

        file = request.FILES.get("file")
        if file:
            max_size = 10 * 1024 * 1024  # 10MB
            if file.size > max_size:
                return Response(
                    {"file": "File size exceeds maximum of 10MB"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            allowed_mime_types = {
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/tiff",
            }
            if file.content_type not in allowed_mime_types:
                return Response(
                    {
                        "file": (
                            "File type not allowed. Allowed: "
                            "application/pdf, image/jpeg, image/png, image/tiff"
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            file_content = file.read()
            checksum = hashlib.sha256(file_content).hexdigest()
            file.seek(0)

            attachment.file = file
            attachment.file_size = file.size
            attachment.mime_type = file.content_type
            attachment.checksum = checksum
            attachment.original_filename = file.name
            changed = True

        if not changed:
            return Response(SHAClaimAttachmentSerializer(attachment).data)

        attachment.save()
        return Response(SHAClaimAttachmentSerializer(attachment).data)

    # =================================================================
    # DHA HIE Middleware (ILM) — per-action claim workflow endpoints
    # =================================================================
    # Each action wraps the corresponding IlmClaimService method.
    # All endpoints use url_path="ilm/<action>/" to avoid clashing with
    # the legacy SHA submit/validate/appeal flow above.

    def _ilm_service(self, facility=None):
        from hmis.apps.billing.services.ilm_claim_service import IlmClaimService

        return IlmClaimService(facility=facility)

    def _ilm_response(self, result):
        from rest_framework.response import Response as _R

        return _R(
            {
                "status_code": result.status_code,
                "payload": result.payload,
            },
            status=(
                status.HTTP_200_OK if result.status_code < 400 else status.HTTP_502_BAD_GATEWAY
            ),
        )

    def _ilm_handle_error(self, exc):
        from hmis.apps.billing.services.dha_errors import (
            DHAClientError,
            DHAError,
            DHANotFoundError,
            DHARateLimitedError,
            DHAServerError,
            DHATimeoutError,
            DHATransportError,
            DHAUnauthorizedError,
            DHAValidationError,
        )

        try:
            from hmis.apps.billing.services.ilm_claim_service import _publish_safe
            from hmis.apps.core.events import BillingEvents

            _publish_safe(
                BillingEvents.DHA_CLAIM_CALL_FAILED,
                {
                    "error_class": exc.__class__.__name__,
                    "message": str(exc),
                    "status_code": getattr(exc, "status_code", None),
                    "path": getattr(exc, "path", None),
                },
            )
        except Exception:  # noqa: S110 — telemetry failure must not break the API
            pass

        if isinstance(exc, DHAValidationError):
            raw_body = getattr(exc, "response_body", None)
            resolved_message = str(getattr(exc, "message", "") or "").strip()
            resolved_errors = getattr(exc, "errors", None)
            trace_id = None

            def _extract_from_raw_wrapper(body):
                if not isinstance(body, dict):
                    return body
                raw_value = body.get("raw")
                if not isinstance(raw_value, str):
                    return body
                text = raw_value.strip()
                if not text:
                    return body
                if not (text.startswith("{") or text.startswith("[")):
                    return body
                import json

                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return body

            parsed_body = _extract_from_raw_wrapper(raw_body)

            if (not resolved_message or resolved_message.lower() == "ilm error") and parsed_body:
                try:
                    from hmis.apps.billing.services.ilm_client import _extract_message

                    extracted = _extract_message(parsed_body, "")
                    if extracted:
                        resolved_message = extracted
                except Exception:  # noqa: BLE001 - best effort only
                    logger.debug(
                        "Failed to extract validation message from parsed ILM body", exc_info=True
                    )

            if isinstance(parsed_body, dict):
                trace_id = parsed_body.get("trace_id")
                if resolved_errors is None:
                    resolved_errors = parsed_body.get("errors")

            # Last-resort recovery: if middleware returned a generic message but
            # provided trace_id, fetch the audited outbound row and re-extract
            # the upstream error payload from there.
            if (not resolved_message or resolved_message.lower() == "ilm error") and trace_id:
                try:
                    import json

                    from hmis.apps.core.models import DHAOutboundCall

                    audit_call = (
                        DHAOutboundCall.objects.filter(error_message__icontains=str(trace_id))
                        .order_by("-created_at")
                        .first()
                    )
                    if audit_call and audit_call.error_message:
                        raw_error = audit_call.error_message.strip()
                        if raw_error.startswith("{") or raw_error.startswith("["):
                            parsed_audit = json.loads(raw_error)
                            from hmis.apps.billing.services.ilm_client import _extract_message

                            extracted = _extract_message(parsed_audit, "")
                            if extracted:
                                resolved_message = extracted
                            if resolved_errors is None and isinstance(parsed_audit, dict):
                                resolved_errors = parsed_audit.get("errors")
                except Exception:  # noqa: BLE001 - best effort only
                    logger.debug(
                        "Failed to recover ILM validation error from outbound audit",
                        exc_info=True,
                    )

            return Response(
                {
                    "error": resolved_message or "Validation error",
                    "errors": resolved_errors,
                    **({"trace_id": trace_id} if trace_id else {}),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if isinstance(exc, DHAUnauthorizedError):
            return Response(
                {"error": exc.message, "code": "dha_unauthorized"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if isinstance(exc, DHANotFoundError):
            return Response({"error": exc.message}, status=status.HTTP_404_NOT_FOUND)
        if isinstance(exc, DHARateLimitedError):
            return Response({"error": exc.message}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if isinstance(exc, DHAClientError):
            return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        if isinstance(exc, (DHATimeoutError, DHATransportError, DHAServerError)):
            return Response({"error": exc.message}, status=status.HTTP_502_BAD_GATEWAY)
        if isinstance(exc, DHAError):
            return Response({"error": exc.message}, status=status.HTTP_502_BAD_GATEWAY)
        from hmis.apps.billing.services.consent_token_resolver import (
            ConsentTokenExpiredError,
            ConsentTokenNotFoundError,
        )

        if isinstance(exc, ConsentTokenNotFoundError):
            return Response(
                {
                    "error": "No validated consent token for this claim. "
                    "Please complete the consent flow for the patient.",
                    "code": "consent_token_not_found",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if isinstance(exc, ConsentTokenExpiredError):
            return Response(
                {
                    "error": "Consent token has expired. Please re-consent the patient.",
                    "code": "consent_token_expired",
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if isinstance(exc, ValueError):
            return Response(
                {"error": str(exc), "code": "invalid_request"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        logger.exception("Unexpected ILM error: %s", exc)
        return Response(
            {"error": str(exc) or "Internal error during DHA HIE call"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    def _preview_payload_has_diagnoses(self, payload: object) -> bool:
        if not isinstance(payload, Mapping):
            return False
        claim_diagnoses = payload.get("claim_diagnoses")
        return isinstance(claim_diagnoses, list) and len(claim_diagnoses) > 0

    def _collect_local_diagnosis_codes(self, claim: SHAClaim) -> list[str]:
        codes: list[str] = []

        encounter = getattr(claim, "encounter", None)
        if encounter is not None:
            try:
                encounter_icd11_codes = encounter.diagnoses.exclude(icd11_code="").values_list(
                    "icd11_code", flat=True
                )
                for encounter_code in encounter_icd11_codes:
                    candidate = str(encounter_code or "").strip().upper()
                    if candidate and candidate not in codes:
                        codes.append(candidate)
            except Exception as exc:
                logger.debug(
                    "Unable to collect encounter ICD-11 diagnoses for claim %s: %s",
                    claim.id,
                    _stringify_error(exc),
                )

        primary_code = str(claim.primary_diagnosis_code or "").strip().upper()
        if primary_code:
            codes.append(primary_code)

        for secondary_code in claim.secondary_diagnosis_codes or []:
            candidate = str(secondary_code or "").strip().upper()
            if candidate and candidate not in codes:
                codes.append(candidate)

        return codes

    def _filter_known_icd11_codes(self, diagnosis_codes: list[str]) -> list[str]:
        if not diagnosis_codes:
            return []

        normalized = [
            str(code or "").strip().upper() for code in diagnosis_codes if str(code or "").strip()
        ]
        if not normalized:
            return []

        try:
            from hmis.apps.billing.models import ICD11CodeReference

            active_count = ICD11CodeReference.objects.filter(is_active=True).count()
            if active_count == 0:
                return normalized

            known_codes = set(
                ICD11CodeReference.objects.filter(
                    is_active=True,
                    code__in=normalized,
                ).values_list("code", flat=True)
            )
            return [code for code in normalized if code in known_codes]
        except Exception:
            return normalized

    def _resolve_diagnosis_intervention_code(self, claim: SHAClaim) -> str:
        intervention_code = (
            claim.claim_interventions.filter(status="active")
            .values_list("intervention_code", flat=True)
            .first()
        )
        if intervention_code:
            return str(intervention_code).strip()

        tariff_code = (
            claim.items.filter(tariff__isnull=False).values_list("tariff__code", flat=True).first()
        )
        if tariff_code:
            return str(tariff_code).strip()

        if claim.claim_type == SHAClaim.ClaimType.INPATIENT:
            return "SHA-07-001"
        return "SHA-01-001"

    def _lookup_icd11_display(self, code: str) -> str:
        normalized = str(code or "").strip().upper()
        if not normalized:
            return ""
        try:
            from hmis.apps.billing.models import ICD11CodeReference

            ref = ICD11CodeReference.objects.filter(code=normalized, is_active=True).first()
        except Exception:
            ref = None
        return str(getattr(ref, "title", "") or "").strip()

    def _sync_local_diagnosis_add(self, claim: SHAClaim, *, icd_code: str, user) -> None:
        normalized = str(icd_code or "").strip().upper()
        if not normalized:
            return

        display = self._lookup_icd11_display(normalized) or normalized
        update_fields: list[str] = []

        if len(normalized) <= 10 and claim.primary_diagnosis_code != normalized:
            claim.primary_diagnosis_code = normalized
            update_fields.append("primary_diagnosis_code")

        if display and claim.primary_diagnosis_description != display:
            claim.primary_diagnosis_description = display
            update_fields.append("primary_diagnosis_description")

        secondary_codes = [
            str(code or "").strip().upper() for code in claim.secondary_diagnosis_codes or []
        ]
        cleaned_secondary = [code for code in secondary_codes if code and code != normalized]
        if cleaned_secondary != secondary_codes:
            claim.secondary_diagnosis_codes = cleaned_secondary
            update_fields.append("secondary_diagnosis_codes")

        if update_fields:
            claim.save(update_fields=[*update_fields, "updated_at"])

        encounter = getattr(claim, "encounter", None)
        if encounter is None:
            return

        try:
            from hmis.apps.encounters.models import Diagnosis

            primary = Diagnosis.objects.filter(
                encounter=encounter, diagnosis_type="PRIMARY"
            ).first()
            if primary is None:
                Diagnosis.objects.create(
                    encounter=encounter,
                    diagnosis_type="PRIMARY",
                    icd11_code=normalized[:50],
                    icd11_display=display[:500],
                    diagnosed_by=user,
                )
            else:
                primary.icd11_code = normalized[:50]
                primary.icd11_display = display[:500]
                primary.free_text_diagnosis = ""
                primary.diagnosed_by = user
                primary.save(
                    update_fields=[
                        "icd11_code",
                        "icd11_display",
                        "free_text_diagnosis",
                        "diagnosed_by",
                        "updated_at",
                    ]
                )
        except Exception as exc:
            logger.warning(
                "Failed to sync encounter diagnosis after ILM add_diagnosis for claim %s: %s",
                claim.id,
                _stringify_error(exc),
            )

    def _sync_local_diagnosis_remove(self, claim: SHAClaim, *, icd_code: str) -> None:
        normalized = str(icd_code or "").strip().upper()
        if not normalized:
            return

        encounter = getattr(claim, "encounter", None)
        fallback_code = ""
        fallback_desc = ""

        if encounter is not None:
            try:
                from hmis.apps.encounters.models import Diagnosis

                Diagnosis.objects.filter(
                    encounter=encounter, icd11_code__iexact=normalized
                ).delete()
                remaining = Diagnosis.order_by_type_priority(
                    Diagnosis.objects.filter(encounter=encounter)
                ).first()
                if remaining is not None:
                    fallback_code = (
                        str(getattr(remaining, "icd11_code", "") or "").strip().upper()
                        or str(getattr(getattr(remaining, "icd10_code", None), "code", "") or "")
                        .strip()
                        .upper()
                    )
                    fallback_desc = (
                        str(getattr(remaining, "icd11_display", "") or "").strip()
                        or str(
                            getattr(getattr(remaining, "icd10_code", None), "description", "") or ""
                        ).strip()
                        or str(getattr(remaining, "free_text_diagnosis", "") or "").strip()
                    )
            except Exception as exc:
                logger.warning(
                    "Failed to sync encounter diagnosis after ILM remove_diagnosis for claim %s: %s",
                    claim.id,
                    _stringify_error(exc),
                )

        secondary_codes = [
            str(code or "").strip().upper() for code in (claim.secondary_diagnosis_codes or [])
        ]
        filtered_secondary = [code for code in secondary_codes if code and code != normalized]

        next_code = fallback_code or (filtered_secondary[0] if filtered_secondary else "PENDING")
        next_desc = (
            fallback_desc
            or (
                claim.primary_diagnosis_description
                if claim.primary_diagnosis_code != normalized
                else ""
            )
            or "Awaiting diagnosis"
        )

        update_fields: list[str] = []
        if len(next_code) > 10:
            next_code = next_code[:10]
        if claim.primary_diagnosis_code != next_code:
            claim.primary_diagnosis_code = next_code
            update_fields.append("primary_diagnosis_code")
        if claim.primary_diagnosis_description != next_desc:
            claim.primary_diagnosis_description = next_desc
            update_fields.append("primary_diagnosis_description")
        if filtered_secondary != secondary_codes:
            claim.secondary_diagnosis_codes = filtered_secondary
            update_fields.append("secondary_diagnosis_codes")

        if update_fields:
            claim.save(update_fields=[*update_fields, "updated_at"])

    def _refresh_claim_form_attachment(self, claim: SHAClaim, *, user) -> None:
        try:
            from hmis.apps.billing.services.claim_form_attachment_service import (
                ClaimFormAttachmentService,
            )

            ClaimFormAttachmentService.ensure_for_claim(claim=claim, user=user)
        except Exception as exc:
            logger.warning(
                "Failed to refresh claim form attachment after diagnosis update for claim %s: %s",
                claim.id,
                _stringify_error(exc),
            )

    def _sync_claim_diagnoses_to_dha(self, claim: SHAClaim, *, user) -> int:
        diagnosis_codes = self._collect_local_diagnosis_codes(claim)
        if not diagnosis_codes:
            return 0

        diagnosis_codes = self._filter_known_icd11_codes(diagnosis_codes)
        if not diagnosis_codes:
            logger.info(
                "Skipping DHA diagnosis sync for claim %s: no ICD-11 diagnosis codes available",
                claim.id,
            )
            return 0

        intervention_code = self._resolve_diagnosis_intervention_code(claim)
        if not intervention_code:
            return 0

        synced = 0
        ilm_service = self._ilm_service(facility=claim.facility)
        for diagnosis_code in diagnosis_codes:
            try:
                result = ilm_service.add_diagnosis(
                    claim,
                    icd_code=diagnosis_code,
                    intervention_code=intervention_code,
                    user=user,
                )
            except Exception as exc:  # noqa: BLE001 - best effort before preview
                logger.warning(
                    "Failed to sync diagnosis %s to DHA for claim %s: %s",
                    diagnosis_code,
                    claim.id,
                    _stringify_error(exc),
                )
                continue

            if result.status_code < 400:
                synced += 1

        return synced

    @action(detail=True, methods=["post"], url_path="ilm/start-visit")
    def ilm_start_visit(self, request, pk=None):
        """Start a DHA HIE visit. POST /api/sha/claims/{id}/ilm/start-visit/"""
        from hmis.apps.billing.services.ilm_claim_service import StartVisitParams

        claim = self.get_object()
        d = request.data
        try:
            params = StartVisitParams(
                otp=str(d.get("otp", "")),
                auth_guid=str(d.get("auth_guid", "")),
                patient_id=str(d.get("patient_id", "")),
                intervention_codes=list(d.get("intervention_codes") or []),
                service_type=str(d.get("service_type", "OUTPATIENT")),
                admission_date=d.get("admission_date"),
                estimated_days_of_admission=d.get("estimated_days_of_admission"),
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = self._ilm_service(facility=claim.facility).start_visit(
                claim, params, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/interventions/add")
    def ilm_add_intervention(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("intervention_code")
        if not code:
            return Response(
                {"error": "intervention_code required"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            result = self._ilm_service(facility=claim.facility).add_intervention(
                claim, code, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/interventions/switch")
    def ilm_switch_intervention(self, request, pk=None):
        claim = self.get_object()
        d = request.data
        try:
            result = self._ilm_service(facility=claim.facility).switch_intervention(
                claim,
                existing_intervention_code=d["existing_intervention_code"],
                new_intervention_code=d["new_intervention_code"],
                retain_bill_items=bool(
                    d.get("retain_bill_items", d.get("retain_existing_claim", False))
                ),
                bill_from=d.get("bill_from"),
                bill_to=d.get("bill_to"),
                user=request.user,
            )
        except KeyError as e:
            return Response({"error": f"missing field: {e}"}, status=400)
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/interventions/restore")
    def ilm_restore_intervention(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("intervention_code")
        if not code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).restore_intervention(
                claim, code, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/interventions/retire")
    def ilm_retire_intervention(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("intervention_code")
        if not code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).retire_intervention(
                claim, code, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/interventions/virtual-claim-line")
    def ilm_add_virtual_claim_line(self, request, pk=None):
        """Add a PHC virtual claim line (DHA HIE user-journey Scenario C).

        POST /api/sha/claims/{id}/ilm/interventions/virtual-claim-line/
        Body: {"intervention_code": "...", optional "service_name",
        "service_identifier", "unit_price", "quantity", "scheme_code", "extra"}
        """
        claim = self.get_object()
        d = request.data
        code = d.get("intervention_code")
        if not code:
            return Response(
                {"error": "intervention_code required"}, status=status.HTTP_400_BAD_REQUEST
            )
        extra = d.get("extra")
        if extra is not None and not isinstance(extra, dict):
            return Response({"error": "extra must be an object"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).add_virtual_claim_line(
                claim,
                intervention_code=code,
                service_name=d.get("service_name"),
                service_identifier=d.get("service_identifier"),
                unit_price=d.get("unit_price"),
                quantity=d.get("quantity"),
                scheme_code=d.get("scheme_code"),
                extra=extra,
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/diagnoses/add")
    def ilm_add_diagnosis(self, request, pk=None):
        claim = self.get_object()
        d = request.data
        if not d.get("icd_code") or not d.get("intervention_code"):
            return Response({"error": "icd_code and intervention_code required"}, status=400)
        # ECCIF 24h billing window guard
        if claim.is_emergency_claim and claim.is_time_barred:
            return Response(
                {
                    "error": "Emergency claim 24-hour billing window has expired.",
                    "code": "eccif_time_barred",
                },
                status=400,
            )
        try:
            result = self._ilm_service(facility=claim.facility).add_diagnosis(
                claim,
                icd_code=d["icd_code"],
                intervention_code=d["intervention_code"],
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        if int(getattr(result, "status_code", 500) or 500) < 400:
            self._sync_local_diagnosis_add(claim, icd_code=d["icd_code"], user=request.user)
            self._refresh_claim_form_attachment(claim, user=request.user)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/diagnoses/remove")
    def ilm_remove_diagnosis(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("icd_code")
        intervention_code = str(request.data.get("intervention_code") or "").strip()
        if not intervention_code:
            active_intervention = (
                claim.claim_interventions.filter(status="active").order_by("created_at").first()
            )
            intervention_code = (
                str(active_intervention.intervention_code).strip() if active_intervention else ""
            )
        if not code:
            return Response({"error": "icd_code required"}, status=400)
        if not intervention_code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).remove_diagnosis(
                claim,
                icd_code=code,
                intervention_code=intervention_code,
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        if int(getattr(result, "status_code", 500) or 500) < 400:
            self._sync_local_diagnosis_remove(claim, icd_code=str(code))
            self._refresh_claim_form_attachment(claim, user=request.user)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/lines/add")
    def ilm_add_line(self, request, pk=None):
        from hmis.apps.billing.services.ilm_claim_service import ClaimLine

        claim = self.get_object()
        d = request.data
        # ECCIF 24h billing window guard
        if claim.is_emergency_claim and claim.is_time_barred:
            return Response(
                {
                    "error": "Emergency claim 24-hour billing window has expired.",
                    "code": "eccif_time_barred",
                },
                status=400,
            )
        try:
            line = ClaimLine(
                intervention_code=str(d["intervention_code"]),
                service_name=str(d["service_name"]),
                service_identifier=str(d["service_identifier"]),
                unit_price=str(d["unit_price"]),
                quantity=str(d["quantity"]),
                scheme_code=str(d["scheme_code"]),
            )
        except KeyError as e:
            return Response({"error": f"missing field: {e}"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).add_line(
                claim,
                line,
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/lines/edit")
    def ilm_edit_line(self, request, pk=None):
        claim = self.get_object()
        d = request.data
        if not d.get("claim_line_id"):
            return Response({"error": "claim_line_id required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).edit_line(
                claim,
                claim_line_id=str(d["claim_line_id"]),
                quantity=d.get("quantity"),
                unit_price=d.get("unit_price"),
                scheme_code=d.get("scheme_code"),
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/lines/remove")
    def ilm_remove_line(self, request, pk=None):
        claim = self.get_object()
        line_id = request.data.get("claim_line_id")
        if not line_id:
            return Response({"error": "claim_line_id required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).remove_line(
                claim, claim_line_id=str(line_id), user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(
        detail=True,
        methods=["post"],
        url_path="ilm/attachments/add",
        parser_classes=[MultiPartParser, FormParser],
    )
    def ilm_add_attachment(self, request, pk=None):
        from hmis.apps.billing.services.multipart_builder import MultipartFile

        claim = self.get_object()
        files_in = request.FILES.getlist("files") or (
            [request.FILES["file"]] if "file" in request.FILES else []
        )
        if not files_in:
            return Response({"error": "files required"}, status=400)

        # Local pre-flight validation: size ≤ 2MB, type must be .jpg/.png/.pdf
        MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024  # 2MB per DHA spec
        ALLOWED_CONTENT_TYPES = {
            "application/pdf",
            "image/jpeg",
            "image/png",
        }
        ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
        for f in files_in:
            if f.size > MAX_ATTACHMENT_SIZE:
                return Response(
                    {
                        "error": (
                            f"File '{f.name}' exceeds maximum size of 2MB "
                            f"({f.size / (1024 * 1024):.1f}MB)."
                        ),
                        "code": "file_too_large",
                    },
                    status=400,
                )
            import os

            ext = os.path.splitext(f.name)[1].lower()
            content_type = (f.content_type or "").lower()
            if ext not in ALLOWED_EXTENSIONS:
                return Response(
                    {
                        "error": (
                            f"File '{f.name}' has unsupported extension '{ext}'. "
                            f"Allowed: .pdf, .jpg, .jpeg, .png"
                        ),
                        "code": "invalid_file_type",
                    },
                    status=400,
                )
            if content_type and content_type not in ALLOWED_CONTENT_TYPES:
                return Response(
                    {
                        "error": (
                            f"File '{f.name}' has unsupported content type '{content_type}'. "
                            f"Allowed: application/pdf, image/jpeg, image/png"
                        ),
                        "code": "invalid_file_type",
                    },
                    status=400,
                )

        # ECCIF 24h billing window guard
        if claim.is_emergency_claim and claim.is_time_barred:
            return Response(
                {
                    "error": "Emergency claim 24-hour billing window has expired.",
                    "code": "eccif_time_barred",
                },
                status=400,
            )

        prepared_uploads: list[dict[str, object]] = []
        multipart_files: list[MultipartFile] = []
        for file_obj in files_in:
            content = file_obj.read()
            prepared_uploads.append(
                {
                    "name": file_obj.name,
                    "content": content,
                    "content_type": file_obj.content_type or "application/octet-stream",
                }
            )
            multipart_files.append(
                MultipartFile(
                    field_name="file_blob",
                    filename=file_obj.name,
                    content=content,
                    content_type=file_obj.content_type or "application/octet-stream",
                )
            )
        extra = {k: v for k, v in request.data.items() if k not in ("files", "file")}
        if not extra.get("intervention_code"):
            active_intervention = (
                claim.claim_interventions.filter(status="active").order_by("created_at").first()
            )
            if active_intervention:
                extra["intervention_code"] = active_intervention.intervention_code
        try:
            result = self._ilm_service(facility=claim.facility).add_attachment(
                claim,
                multipart_files,
                extra_fields=extra or None,
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)

        if result.status_code < 400:
            requested_doc_type = str(extra.get("document_type") or "").strip()
            local_attachment_type = _to_local_attachment_type(requested_doc_type)
            title_prefix = str(extra.get("document_title") or "").strip()
            description = str(extra.get("document_description") or "").strip()
            for entry in prepared_uploads:
                filename = str(entry["name"])
                content = entry["content"]
                content_type = str(entry["content_type"])
                if not isinstance(content, (bytes, bytearray)):
                    continue
                checksum = hashlib.sha256(content).hexdigest()
                attachment_name = title_prefix or filename
                local_attachment = SHAClaimAttachment(
                    claim=claim,
                    attachment_type=local_attachment_type,
                    name=attachment_name,
                    description=description,
                    file_size=len(content),
                    mime_type=content_type,
                    checksum=checksum,
                    original_filename=filename,
                    uploaded_by=request.user,
                )
                local_attachment.file.save(filename, ContentFile(content), save=False)
                local_attachment.save()
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/attachments/push-local")
    def ilm_push_local_attachments(self, request, pk=None):
        """Push existing local claim attachments to DHA ILM /claims/attachments."""
        from hmis.apps.billing.services.multipart_builder import MultipartFile

        claim = self.get_object()
        local_attachments = list(claim.attachments.all())
        if not local_attachments:
            return Response(
                {
                    "error": "No local attachments found on this claim.",
                    "local_count": 0,
                    "uploaded": 0,
                    "failed": 0,
                },
                status=400,
            )

        service = self._ilm_service(facility=claim.facility)
        active_intervention = (
            claim.claim_interventions.filter(status="active").order_by("created_at").first()
        )
        intervention_code = (
            str(active_intervention.intervention_code).strip() if active_intervention else ""
        )
        uploaded = 0
        failed = 0
        errors: list[dict[str, str]] = []

        for attachment in local_attachments:
            try:
                if not attachment.file:
                    raise ValueError("Attachment file is missing")

                attachment.file.open("rb")
                try:
                    content = attachment.file.read()
                finally:
                    attachment.file.close()

                if not content:
                    raise ValueError("Attachment file is empty")

                filename = (
                    attachment.original_filename
                    or os.path.basename(getattr(attachment.file, "name", "") or "")
                    or f"attachment-{attachment.id}.bin"
                )

                multipart_file = MultipartFile(
                    field_name="file_blob",
                    filename=filename,
                    content=content,
                    content_type=attachment.mime_type or "application/octet-stream",
                )

                document_type = _to_dha_document_type(
                    attachment.attachment_type,
                    attachment_name=attachment.name,
                    original_filename=attachment.original_filename,
                )
                if document_type == "INVOICE" and claim.claim_type == SHAClaim.ClaimType.INPATIENT:
                    document_type = "FINAL_BILL"
                extra_fields: dict[str, str] = {
                    "document_type": document_type,
                    "document_title": attachment.name,
                    "document_description": attachment.description or "",
                }
                if intervention_code:
                    extra_fields["intervention_code"] = intervention_code
                result = service.add_attachment(
                    claim,
                    [multipart_file],
                    extra_fields=extra_fields,
                    user=request.user,
                )
                if int(getattr(result, "status_code", 500) or 500) >= 400:
                    payload = result.payload if isinstance(result.payload, Mapping) else {}
                    message = str(
                        payload.get("error")
                        or payload.get("message")
                        or payload.get("detail")
                        or "DHA rejected attachment upload"
                    )
                    raise ValueError(message)
                uploaded += 1
            except Exception as exc:  # noqa: BLE001 - collect and continue
                failed += 1
                errors.append(
                    {
                        "attachment_id": str(attachment.id),
                        "attachment_name": attachment.name,
                        "error": _stringify_error(exc),
                    }
                )

        sync_status = _build_attachment_sync_status(claim)

        return Response(
            {
                "local_count": len(local_attachments),
                "uploaded": uploaded,
                "failed": failed,
                "errors": errors,
                "sync_status": sync_status,
            }
        )

    @action(detail=True, methods=["get"], url_path="ilm/attachments/sync-status")
    def ilm_attachment_sync_status(self, request, pk=None):
        """Return strict local-vs-DHA attachment sync status for this claim."""
        claim = self.get_object()
        return Response(_build_attachment_sync_status(claim))

    @action(detail=True, methods=["post"], url_path="ilm/attachments/remove")
    def ilm_remove_attachment(self, request, pk=None):
        claim = self.get_object()
        attachment_id = request.data.get("attachment_id")
        intervention_code = str(request.data.get("intervention_code") or "").strip()
        if not intervention_code:
            active_intervention = (
                claim.claim_interventions.filter(status="active").order_by("created_at").first()
            )
            intervention_code = (
                str(active_intervention.intervention_code).strip() if active_intervention else ""
            )
        if not attachment_id:
            return Response({"error": "attachment_id required"}, status=400)
        if not intervention_code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).remove_attachment(
                claim,
                attachment_id=str(attachment_id),
                intervention_code=intervention_code,
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/preview")
    def ilm_preview(self, request, pk=None):
        claim = self.get_object()
        ilm_service = self._ilm_service(facility=claim.facility)
        try:
            result = ilm_service.preview(claim, user=request.user)
        except Exception as exc:
            return self._ilm_handle_error(exc)

        if result.status_code < 400 and not self._preview_payload_has_diagnoses(result.payload):
            synced_count = self._sync_claim_diagnoses_to_dha(claim, user=request.user)
            if synced_count:
                try:
                    refreshed_result = ilm_service.preview(claim, user=request.user)
                    if refreshed_result.status_code < 400:
                        result = refreshed_result
                except Exception as exc:  # noqa: BLE001 - keep first preview result
                    logger.warning(
                        "Failed to re-preview claim %s after diagnosis sync: %s",
                        claim.id,
                        _stringify_error(exc),
                    )

        # Stamp previewed_at on success (DHA UAT: preview required before submit)
        if result.response and result.status_code < 400:
            from django.utils import timezone as tz

            claim.previewed_at = tz.now()
            dha_invoice_number = _extract_dha_invoice_number(result.payload)
            preview_claim_reference = _extract_preview_claim_reference(result.payload)
            if dha_invoice_number:
                claim.dha_invoice_number = dha_invoice_number
            if preview_claim_reference:
                claim.sha_claim_reference = preview_claim_reference

            update_fields = ["previewed_at", "updated_at"]
            if dha_invoice_number:
                update_fields.append("dha_invoice_number")
            if preview_claim_reference:
                update_fields.append("sha_claim_reference")
            claim.save(update_fields=update_fields)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/preview-payer")
    def ilm_preview_payer(self, request, pk=None):
        """Fetch the payer's adjudication view of this claim from DHA."""
        claim = self.get_object()
        try:
            result = self._ilm_service(facility=claim.facility).preview_payer_claim(
                claim, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/apply-preview-lines")
    def ilm_apply_preview_lines(self, request, pk=None):
        """Backfill local claim items from an ILM preview payload (manual, auditable)."""
        from django.db import transaction

        from hmis.apps.billing.services.preview_invoice_materializer import (
            PreviewInvoiceMaterializer,
        )

        claim = self.get_object()
        payload = request.data.get("payload")
        replace_existing = bool(request.data.get("replace_existing", True))

        if not isinstance(payload, dict):
            return Response({"error": "payload object is required"}, status=400)

        invoices = payload.get("invoices")
        if not isinstance(invoices, list) or not invoices:
            return Response({"error": "payload.invoices must be a non-empty array"}, status=400)

        parsed_lines = []
        parse_errors = []
        unmatched_tariff_codes = set()
        unresolved_lines = []
        description_resolved_count = 0
        auto_upserted_tariff_codes = set()
        detected_invoice_number = ""
        preview_claim_reference = _extract_preview_claim_reference(payload)

        for invoice in invoices:
            if not isinstance(invoice, dict):
                continue
            if not detected_invoice_number:
                detected_invoice_number = str(
                    invoice.get("invoice_number")
                    or invoice.get("invoice_no")
                    or invoice.get("invoice")
                    or ""
                ).strip()
            lines = invoice.get("lines")
            if not isinstance(lines, list):
                continue

            for raw_line in lines:
                if not isinstance(raw_line, dict):
                    continue

                tariff_code = str(
                    raw_line.get("item_code") or raw_line.get("intervention_code") or ""
                ).strip()
                if tariff_code:
                    tariff_code = tariff_code.upper()
                description = str(
                    raw_line.get("item_name") or tariff_code or "Preview line"
                ).strip()

                quantity_raw = raw_line.get("quantity", 1)
                unit_price_raw = raw_line.get("unit_price")
                if unit_price_raw in (None, ""):
                    unit_price_raw = raw_line.get("line_net_amount") or raw_line.get(
                        "line_total_amount"
                    )

                try:
                    quantity = Decimal(str(quantity_raw or "1"))
                    unit_price = Decimal(str(unit_price_raw or "0"))
                except (InvalidOperation, TypeError, ValueError):
                    parse_errors.append(f"Invalid numeric values for line '{description}'")
                    continue

                if quantity <= 0:
                    parse_errors.append(f"Quantity must be > 0 for line '{description}'")
                    continue
                if unit_price <= 0:
                    parse_errors.append(f"Unit price must be > 0 for line '{description}'")
                    continue

                tariff = None
                if tariff_code:
                    tariff = SHATariff.objects.filter(code=tariff_code, is_active=True).first()

                if tariff is None and description:
                    tariff = (
                        SHATariff.get_active_tariffs(facility_level=claim.facility_level)
                        .filter(
                            models.Q(name__iexact=description)
                            | models.Q(description__iexact=description)
                        )
                        .first()
                    )
                    if tariff is None:
                        tariff = (
                            SHATariff.get_active_tariffs(facility_level=claim.facility_level)
                            .filter(
                                models.Q(name__icontains=description)
                                | models.Q(description__icontains=description)
                            )
                            .order_by("code")
                            .first()
                        )
                    if tariff is not None:
                        description_resolved_count += 1

                if tariff is None and tariff_code:
                    facility_level_raw = getattr(getattr(claim, "facility", None), "level", "")
                    if facility_level_raw:
                        fallback_level = f"L{facility_level_raw}"
                    else:
                        fallback_level = claim.facility_level or SHATariff.TariffLevel.LEVEL_3
                    if isinstance(fallback_level, str) and not fallback_level.upper().startswith(
                        "L"
                    ):
                        fallback_level = f"L{fallback_level}"
                    tariff, created = SHATariff.objects.get_or_create(
                        code=tariff_code,
                        defaults={
                            "name": description or tariff_code,
                            "description": f"Auto-imported from DHA preview for claim {claim.claim_number}",
                            "category": _infer_tariff_category_from_code(tariff_code),
                            "facility_level": fallback_level,
                            "sha_amount": unit_price,
                            "effective_date": date.today(),
                            "is_active": True,
                            "max_quantity_per_claim": 99,
                        },
                    )
                    if created:
                        auto_upserted_tariff_codes.add(tariff_code)

                if tariff is None:
                    if tariff_code:
                        unmatched_tariff_codes.add(tariff_code)
                    unresolved_lines.append(
                        {
                            "description": description,
                            "tariff_code": tariff_code,
                        }
                    )

                parsed_lines.append(
                    {
                        "tariff": tariff,
                        "tariff_code": tariff_code,
                        "description": description,
                        "quantity": quantity,
                        "unit_price": unit_price,
                    }
                )

        if not parsed_lines:
            return Response(
                {
                    "error": "No valid preview lines found to apply.",
                    "parse_errors": parse_errors,
                },
                status=400,
            )

        previous_count = claim.items.count()
        created_count = 0
        two_dp = Decimal("0.01")
        with transaction.atomic():
            if replace_existing:
                preview_keys = {
                    (
                        str(line["description"] or "").strip().lower(),
                        str(Decimal(str(line["quantity"])).quantize(two_dp)),
                        str(Decimal(str(line["unit_price"])).quantize(two_dp)),
                        str(
                            line.get("tariff_code") or getattr(line.get("tariff"), "code", "") or ""
                        )
                        .strip()
                        .lower(),
                    )
                    for line in parsed_lines
                }
                matched_fallback_ids: list[int] = []
                for item in claim.items.filter(is_preview_line=False):
                    item_key = (
                        str(item.description or "").strip().lower(),
                        str(Decimal(str(item.quantity or "0")).quantize(two_dp)),
                        str(Decimal(str(item.unit_price or "0")).quantize(two_dp)),
                        str(getattr(item.tariff, "code", "") or "").strip().lower(),
                    )
                    if item_key in preview_keys:
                        matched_fallback_ids.append(item.id)

                claim.items.filter(
                    models.Q(is_preview_line=True) | models.Q(id__in=matched_fallback_ids)
                ).delete()

            for line in parsed_lines:
                line_total = (line["quantity"] * line["unit_price"]).quantize(two_dp)
                SHAClaimItem.objects.create(
                    claim=claim,
                    tariff=line["tariff"],
                    description=line["description"],
                    service_date=claim.service_date,
                    quantity=line["quantity"],
                    unit_price=line["unit_price"],
                    sha_covered_amount=line_total,
                    patient_payable_amount=Decimal("0.00"),
                    discount_amount=Decimal("0.00"),
                    allocation_status=SHAClaimItem.AllocationStatus.RESOLVED,
                    is_preview_line=True,
                )
                created_count += 1

            if detected_invoice_number:
                claim.dha_invoice_number = detected_invoice_number
            if preview_claim_reference:
                claim.sha_claim_reference = preview_claim_reference

            update_fields = ["updated_at"]
            if detected_invoice_number:
                update_fields.append("dha_invoice_number")
            if preview_claim_reference:
                update_fields.append("sha_claim_reference")
            claim.save(update_fields=update_fields)

            claim.calculate_claimed_amount()

        invoice_materialization = PreviewInvoiceMaterializer.materialize(
            claim=claim,
            parsed_lines=parsed_lines,
            detected_invoice_number=detected_invoice_number,
            user=request.user,
            replace_existing=replace_existing,
        )

        AuditLog.log(
            action="sha_claim_apply_preview_lines",
            user=request.user,
            resource_type="SHAClaim",
            resource_id=claim.id,
            details={
                "replace_existing": replace_existing,
                "previous_item_count": previous_count,
                "created_item_count": created_count,
                "incoming_line_count": len(parsed_lines),
                "detected_invoice_number": detected_invoice_number,
                "invoice_linked": bool(invoice_materialization.invoice_id),
                "materialized_invoice_id": invoice_materialization.invoice_id,
                "materialized_invoice_number": invoice_materialization.invoice_number,
                "materialized_invoice_items_created": invoice_materialization.items_created,
                "materialized_invoice_items_replaced": invoice_materialization.items_replaced,
                "materialized_invoice_skipped_reason": invoice_materialization.skipped_reason,
                "final_bill_attachment_id": invoice_materialization.final_bill_attachment_id,
                "final_bill_created": invoice_materialization.final_bill_created,
                "final_bill_updated": invoice_materialization.final_bill_updated,
                "final_bill_skipped_reason": invoice_materialization.final_bill_skipped_reason,
                "critical_care_attachment_id": invoice_materialization.critical_care_attachment_id,
                "critical_care_created": invoice_materialization.critical_care_created,
                "critical_care_updated": invoice_materialization.critical_care_updated,
                "critical_care_skipped_reason": invoice_materialization.critical_care_skipped_reason,
                "discharge_summary_attachment_id": invoice_materialization.discharge_summary_attachment_id,
                "discharge_summary_created": invoice_materialization.discharge_summary_created,
                "discharge_summary_updated": invoice_materialization.discharge_summary_updated,
                "discharge_summary_skipped_reason": invoice_materialization.discharge_summary_skipped_reason,
                "claim_form_attachment_id": invoice_materialization.claim_form_attachment_id,
                "claim_form_created": invoice_materialization.claim_form_created,
                "claim_form_updated": invoice_materialization.claim_form_updated,
                "claim_form_skipped_reason": invoice_materialization.claim_form_skipped_reason,
                "allocation_pending_count": claim.items.filter(
                    allocation_status=SHAClaimItem.AllocationStatus.PENDING
                ).count(),
                "unmatched_tariff_codes": sorted(unmatched_tariff_codes),
                "description_resolved_count": description_resolved_count,
                "unresolved_lines": unresolved_lines,
                "parse_errors": parse_errors,
                "auto_upserted_tariff_codes": sorted(auto_upserted_tariff_codes),
            },
        )

        return Response(
            {
                "success": True,
                "message": "Preview lines applied to local claim items.",
                "replace_existing": replace_existing,
                "previous_item_count": previous_count,
                "created_item_count": created_count,
                "detected_invoice_number": detected_invoice_number,
                "invoice_linked": bool(invoice_materialization.invoice_id),
                "materialized_invoice_id": invoice_materialization.invoice_id,
                "materialized_invoice_number": invoice_materialization.invoice_number,
                "materialized_invoice_items_created": invoice_materialization.items_created,
                "materialized_invoice_items_replaced": invoice_materialization.items_replaced,
                "materialized_invoice_skipped_reason": invoice_materialization.skipped_reason,
                "final_bill_attachment_id": invoice_materialization.final_bill_attachment_id,
                "final_bill_created": invoice_materialization.final_bill_created,
                "final_bill_updated": invoice_materialization.final_bill_updated,
                "final_bill_skipped_reason": invoice_materialization.final_bill_skipped_reason,
                "critical_care_attachment_id": invoice_materialization.critical_care_attachment_id,
                "critical_care_created": invoice_materialization.critical_care_created,
                "critical_care_updated": invoice_materialization.critical_care_updated,
                "critical_care_skipped_reason": invoice_materialization.critical_care_skipped_reason,
                "discharge_summary_attachment_id": invoice_materialization.discharge_summary_attachment_id,
                "discharge_summary_created": invoice_materialization.discharge_summary_created,
                "discharge_summary_updated": invoice_materialization.discharge_summary_updated,
                "discharge_summary_skipped_reason": invoice_materialization.discharge_summary_skipped_reason,
                "claim_form_attachment_id": invoice_materialization.claim_form_attachment_id,
                "claim_form_created": invoice_materialization.claim_form_created,
                "claim_form_updated": invoice_materialization.claim_form_updated,
                "claim_form_skipped_reason": invoice_materialization.claim_form_skipped_reason,
                "allocation_pending_count": claim.items.filter(
                    allocation_status=SHAClaimItem.AllocationStatus.PENDING
                ).count(),
                "unmatched_tariff_codes": sorted(unmatched_tariff_codes),
                "description_resolved_count": description_resolved_count,
                "unresolved_lines": unresolved_lines,
                "parse_errors": parse_errors,
                "auto_upserted_tariff_codes": sorted(auto_upserted_tariff_codes),
                "claimed_amount": str(claim.claimed_amount),
            }
        )

    @action(detail=True, methods=["post"], url_path="ilm/materialize-preview-invoice")
    def ilm_materialize_preview_invoice(self, request, pk=None):
        """Materialize/link a local invoice from current claim preview-derived lines."""
        from hmis.apps.billing.services.preview_invoice_materializer import (
            PreviewInvoiceMaterializer,
        )

        claim = self.get_object()
        replace_existing = bool(request.data.get("replace_existing", True))
        detected_invoice_number = str(
            request.data.get("invoice_number") or claim.dha_invoice_number or ""
        ).strip()

        claim_items = list(claim.items.select_related("tariff").all())
        if not claim_items:
            return Response(
                {
                    "error": (
                        "No local claim items found. Apply preview lines first via "
                        "POST /api/billing/claims/{id}/ilm/apply-preview-lines/."
                    )
                },
                status=400,
            )

        parsed_lines = [
            {
                "tariff": item.tariff,
                "tariff_code": item.tariff.code if item.tariff else "",
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
            }
            for item in claim_items
        ]

        result = PreviewInvoiceMaterializer.materialize(
            claim=claim,
            parsed_lines=parsed_lines,
            detected_invoice_number=detected_invoice_number,
            user=request.user,
            replace_existing=replace_existing,
        )

        return Response(
            {
                "success": True,
                "invoice_id": result.invoice_id,
                "invoice_number": result.invoice_number,
                "linked_existing_invoice": result.linked_existing_invoice,
                "materialized": result.materialized,
                "items_created": result.items_created,
                "items_replaced": result.items_replaced,
                "final_bill_attachment_id": result.final_bill_attachment_id,
                "final_bill_created": result.final_bill_created,
                "final_bill_updated": result.final_bill_updated,
                "final_bill_skipped_reason": result.final_bill_skipped_reason,
                "critical_care_attachment_id": result.critical_care_attachment_id,
                "critical_care_created": result.critical_care_created,
                "critical_care_updated": result.critical_care_updated,
                "critical_care_skipped_reason": result.critical_care_skipped_reason,
                "discharge_summary_attachment_id": result.discharge_summary_attachment_id,
                "discharge_summary_created": result.discharge_summary_created,
                "discharge_summary_updated": result.discharge_summary_updated,
                "discharge_summary_skipped_reason": result.discharge_summary_skipped_reason,
                "claim_form_attachment_id": result.claim_form_attachment_id,
                "claim_form_created": result.claim_form_created,
                "claim_form_updated": result.claim_form_updated,
                "claim_form_skipped_reason": result.claim_form_skipped_reason,
                "skipped_reason": result.skipped_reason,
            }
        )

    @action(detail=True, methods=["post"], url_path="ilm/submit")
    def ilm_submit(self, request, pk=None):
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        claim = self.get_object()
        d = request.data
        invoice_number = d.get("invoice_number") or claim.dha_invoice_number
        if not invoice_number:
            return Response(
                {
                    "error": (
                        "DHA invoice number is required. Run claim preview first "
                        "to fetch the DHA invoice number."
                    )
                },
                status=400,
            )

        invoice_number = str(invoice_number).strip()
        if invoice_number and claim.dha_invoice_number != invoice_number:
            claim.dha_invoice_number = invoice_number
            claim.save(update_fields=["dha_invoice_number", "updated_at"])

        # Ensure claim items exist from invoice when available.
        if not claim.items.exists() and claim.invoice_id and claim.invoice:
            for invoice_item in claim.invoice.items.all():
                SHAClaimItem.create_from_invoice_item(claim, invoice_item)
            claim.calculate_claimed_amount()

        # Best-effort auto-attach of core digital documents before validation.
        # This includes clinical notes and invoice summary attachment generation.
        SHAClaimAutomationService.auto_attach_documents(claim.id)

        # Best-effort auto-preview if this claim has never been previewed.
        # DHA UAT requires preview before submit; doing it here removes a common
        # operator failure mode while keeping explicit Preview available in UI.
        preview_error = None
        if not claim.previewed_at:
            try:
                preview_result = self._ilm_service(facility=claim.facility).preview(
                    claim,
                    user=request.user,
                )
                if preview_result.status_code < 400:
                    from django.utils import timezone as tz

                    claim.previewed_at = tz.now()
                    claim.save(update_fields=["previewed_at", "updated_at"])
                else:
                    preview_error = str(preview_result.payload) if preview_result.payload else None
            except Exception as exc:
                preview_error = _stringify_error(exc)

        # Local pre-flight validation (DHA UAT: catch errors before DHA round-trip)
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        is_valid, errors = SHAClaimsService(facility=claim.facility).validate_claim(
            claim,
            user=request.user,
        )
        unresolved_lines = _collect_unresolved_claim_lines(claim)
        if preview_error:
            errors.append(f"Auto-preview failed: {preview_error}")
            is_valid = False
        if not is_valid:
            response_data = {
                "error": "Claim failed local pre-submission validation.",
                "code": "local_validation_failed",
                "validation_errors": errors,
            }
            if unresolved_lines:
                response_data["unresolved_lines"] = unresolved_lines
                response_data["missing_tariff_count"] = len(unresolved_lines)

            return Response(
                response_data,
                status=400,
            )

        try:
            result = self._ilm_service(facility=claim.facility).submit(
                claim,
                invoice_number=str(invoice_number),
                otp=str(d.get("otp", "")),
                discharge_auth_guid=str(d.get("discharge_auth_guid", "")),
                discharge_reason=str(d.get("discharge_reason", "")),
                notes=str(d.get("notes", "")),
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=True, methods=["post"], url_path="ilm/close")
    def ilm_close(self, request, pk=None):
        from hmis.apps.billing.services.ilm_claim_service import CloseClaimParams

        claim = self.get_object()
        d = request.data
        if not d.get("cancel_reason_type"):
            return Response({"error": "cancel_reason_type required"}, status=400)
        try:
            params = CloseClaimParams(
                cancel_reason_type=str(d["cancel_reason_type"]),
                cancel_reason_text=str(d.get("cancel_reason_text", "")),
            )
            result = self._ilm_service(facility=claim.facility).close(
                claim, params, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        """
        Get claims dashboard statistics.

        GET /api/sha/claims/dashboard/?from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Date filtering
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        # Calculate statistics
        total_claims = queryset.count()
        aggregates = queryset.aggregate(
            total_claimed=Sum("claimed_amount"),
            total_approved=Sum("approved_amount"),
            total_paid=Sum("paid_amount"),
        )

        # Group by status
        status_counts = queryset.values("status").annotate(count=Count("id"))
        claims_by_status = {item["status"]: item["count"] for item in status_counts}

        # Group by type
        type_counts = queryset.values("claim_type").annotate(count=Count("id"))
        claims_by_type = {item["claim_type"]: item["count"] for item in type_counts}

        # Calculate average processing days for submitted claims
        submitted_claims = queryset.filter(submitted_at__isnull=False)
        avg_days = None
        if submitted_claims.exists():
            total_days = sum(
                (timezone.now() - claim.submitted_at).days for claim in submitted_claims
            )
            avg_days = total_days / submitted_claims.count()

        serializer = SHAClaimDashboardSerializer(
            {
                "total_claims": total_claims,
                "total_claimed_amount": aggregates["total_claimed"] or Decimal("0.00"),
                "total_approved_amount": aggregates["total_approved"] or Decimal("0.00"),
                "total_paid_amount": aggregates["total_paid"] or Decimal("0.00"),
                "claims_by_status": claims_by_status,
                "claims_by_type": claims_by_type,
                "average_processing_days": avg_days,
            }
        )

        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="capitation-summary")
    @extend_schema(
        parameters=[
            OpenApiParameter("from_date", OpenApiTypes.DATE, description="Start date (inclusive)"),
            OpenApiParameter("to_date", OpenApiTypes.DATE, description="End date (inclusive)"),
        ],
        responses={
            200: inline_serializer(
                name="CapitationSummaryResponse",
                fields={
                    "period": serializers.DictField(),
                    "total_claims": serializers.IntegerField(),
                    "total_claimed_amount": serializers.DecimalField(
                        max_digits=12, decimal_places=2
                    ),
                    "total_approved_amount": serializers.DecimalField(
                        max_digits=12, decimal_places=2
                    ),
                    "total_paid_amount": serializers.DecimalField(max_digits=12, decimal_places=2),
                    "claims_by_status": serializers.DictField(),
                    "top_interventions": serializers.ListField(child=serializers.DictField()),
                    "monthly_breakdown": serializers.ListField(child=serializers.DictField()),
                },
            )
        },
    )
    def capitation_summary(self, request):
        """
        Capitation claims summary report.

        GET /api/billing/claims/capitation-summary/?from_date=2026-01-01&to_date=2026-06-30

        Returns aggregated statistics for all claims that have at least one
        intervention with payment_mechanism=CAPITATION. Includes totals,
        status breakdown, top interventions, and monthly breakdown.
        """
        from hmis.apps.billing.models import SHAClaimIntervention

        queryset = self.get_queryset()

        # Date filtering
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        # Filter to capitation claims only
        queryset = queryset.filter(
            claim_interventions__payment_mechanism=SHAClaimIntervention.PaymentMechanism.CAPITATION
        ).distinct()

        # Totals
        total_claims = queryset.count()
        aggregates = queryset.aggregate(
            total_claimed=Sum("claimed_amount"),
            total_approved=Sum("approved_amount"),
            total_paid=Sum("paid_amount"),
        )

        # By status
        status_counts = queryset.values("status").annotate(count=Count("id"))
        claims_by_status = {item["status"]: item["count"] for item in status_counts}

        # Top interventions (by frequency)
        top_interventions = (
            SHAClaimIntervention.objects.filter(
                claim__in=queryset,
                payment_mechanism=SHAClaimIntervention.PaymentMechanism.CAPITATION,
            )
            .values("intervention_code", "intervention_name")
            .annotate(
                count=Count("id"),
                total_tariff=Sum("tariff_amount"),
            )
            .order_by("-count")[:10]
        )

        # Monthly breakdown
        monthly_breakdown = (
            queryset.extra(select={"month": "TO_CHAR(service_date, 'YYYY-MM')"})
            .values("month")
            .annotate(
                claims=Count("id"),
                claimed=Sum("claimed_amount"),
                approved=Sum("approved_amount"),
                paid=Sum("paid_amount"),
            )
            .order_by("month")
        )

        # Fallback for SQLite (dev) which doesn't have TO_CHAR
        try:
            monthly_list = list(monthly_breakdown)
        except Exception:
            from django.db.models.functions import TruncMonth

            monthly_breakdown = (
                queryset.annotate(month=TruncMonth("service_date"))
                .values("month")
                .annotate(
                    claims=Count("id"),
                    claimed=Sum("claimed_amount"),
                    approved=Sum("approved_amount"),
                    paid=Sum("paid_amount"),
                )
                .order_by("month")
            )
            monthly_list = [
                {
                    "month": item["month"].strftime("%Y-%m") if item["month"] else None,
                    "claims": item["claims"],
                    "claimed": item["claimed"],
                    "approved": item["approved"],
                    "paid": item["paid"],
                }
                for item in monthly_breakdown
            ]

        return Response(
            {
                "period": {"from_date": from_date, "to_date": to_date},
                "total_claims": total_claims,
                "total_claimed_amount": aggregates["total_claimed"] or Decimal("0.00"),
                "total_approved_amount": aggregates["total_approved"] or Decimal("0.00"),
                "total_paid_amount": aggregates["total_paid"] or Decimal("0.00"),
                "claims_by_status": claims_by_status,
                "top_interventions": list(top_interventions),
                "monthly_breakdown": monthly_list,
            }
        )

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """
        Export claims to CSV or Excel.

        GET /api/sha/claims/export/?format=csv&status=XXX&from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Apply filters
        claim_status = request.query_params.get("status")
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if claim_status:
            queryset = queryset.filter(status=claim_status)
        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        export_format = request.query_params.get("format", "csv")

        if export_format == "xlsx":
            return self._export_excel(queryset)
        else:
            return self._export_csv(queryset)

    def _export_csv(self, queryset):
        """Export claims to CSV format."""
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="sha_claims_{date.today()}.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "Claim Number",
                "Patient Name",
                "SHA Number",
                "Claim Type",
                "Status",
                "Service Date",
                "Claimed Amount",
                "Approved Amount",
                "Paid Amount",
                "Submitted At",
                "Created At",
            ]
        )

        for claim in queryset:
            writer.writerow(
                [
                    claim.claim_number,
                    (
                        f"{claim.patient.first_name} {claim.patient.last_name}"
                        if claim.patient
                        else ""
                    ),
                    claim.sha_member.sha_number if claim.sha_member else "",
                    claim.claim_type,
                    claim.status,
                    claim.service_date,
                    claim.claimed_amount,
                    claim.approved_amount or "",
                    claim.paid_amount or "",
                    claim.submitted_at or "",
                    claim.created_at,
                ]
            )

        return response

    def _export_excel(self, queryset):
        """Export claims to Excel format."""
        try:
            import openpyxl
            from openpyxl.utils import get_column_letter

            wb = openpyxl.Workbook()
            ws = wb.active
            if ws is None:
                ws = wb.create_sheet("SHA Claims")
            else:
                ws.title = "SHA Claims"

            # Headers
            headers = [
                "Claim Number",
                "Patient Name",
                "SHA Number",
                "Claim Type",
                "Status",
                "Service Date",
                "Claimed Amount",
                "Approved Amount",
                "Paid Amount",
                "Submitted At",
                "Created At",
            ]

            for col, header in enumerate(headers, 1):
                ws.cell(row=1, column=col, value=header)

            # Data
            for row, claim in enumerate(queryset, 2):
                ws.cell(row=row, column=1, value=claim.claim_number)
                ws.cell(
                    row=row,
                    column=2,
                    value=(
                        f"{claim.patient.first_name} {claim.patient.last_name}"
                        if claim.patient
                        else ""
                    ),
                )
                ws.cell(
                    row=row, column=3, value=claim.sha_member.sha_number if claim.sha_member else ""
                )
                ws.cell(row=row, column=4, value=claim.claim_type)
                ws.cell(row=row, column=5, value=claim.status)
                ws.cell(row=row, column=6, value=str(claim.service_date))
                ws.cell(row=row, column=7, value=float(claim.claimed_amount))
                ws.cell(
                    row=row,
                    column=8,
                    value=float(claim.approved_amount) if claim.approved_amount else "",
                )
                ws.cell(
                    row=row, column=9, value=float(claim.paid_amount) if claim.paid_amount else ""
                )
                ws.cell(
                    row=row, column=10, value=str(claim.submitted_at) if claim.submitted_at else ""
                )
                ws.cell(row=row, column=11, value=str(claim.created_at))

            # Save to bytes
            output = BytesIO()
            wb.save(output)
            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = (
                f'attachment; filename="sha_claims_{date.today()}.xlsx"'
            )
            return response

        except ImportError:
            # Fallback to CSV if openpyxl not available
            return self._export_csv(queryset)


# =============================================================================
# Terminology API Views
# =============================================================================

from django.conf import settings as django_settings
from rest_framework.views import APIView

from hmis.apps.billing.services.client_registry import (
    ClientNotFoundError,
    ClientRegistryError,
    ClientRegistryService,
)
from hmis.apps.billing.services.dha_search import DHASearchService, SearchError
from hmis.apps.billing.services.icd11_local import ICD11LocalService
from hmis.apps.billing.services.intervention_fallback import search_local_interventions
from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService


class TerminologySearchView(APIView):
    """
    API view for searching medical terminologies.

    Supports ICD-11, LOINC, ICHI, Interventions, and Drug Products.

    For ICD-11, uses local WHO ICD-11 API container by default (ICD11_USE_LOCAL=true).
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "search", OpenApiTypes.STR, description="Search query (min 2 characters)"
            ),
            OpenApiParameter("limit", OpenApiTypes.INT, description="Max results (default 50)"),
        ],
        responses={
            200: inline_serializer(
                name="TerminologySearchResponse",
                fields={
                    "results": serializers.ListField(child=serializers.DictField()),
                    "count": serializers.IntegerField(),
                    "source": serializers.CharField(),
                },
            )
        },
    )
    def get(self, request, terminology_type):
        """
        Search terminology codes.

        GET /api/billing/terminology/{type}/?search=query&limit=50

        Types: icd11, loinc, ichi, interventions, drugs, active-components
        """
        search = request.query_params.get("search", "")
        limit = int(request.query_params.get("limit", 50))

        # Allow browsing interventions by facility_level / payment_mechanism
        # without a search term (used by claim/consent panels to enumerate
        # DHA-eligible codes).
        if len(search) < 2 and not (
            terminology_type == "interventions"
            and (
                request.query_params.get("facility_level")
                or request.query_params.get("payment_mechanism")
            )
        ):
            return Response(
                {"results": [], "message": "Search query must be at least 2 characters"}
            )

        try:
            # For ICD-11: Try DHA API first, fall back to local container
            if terminology_type == "icd11":
                return self._search_icd11_with_fallback(search, limit)

            service = TerminologyService()

            if terminology_type == "icd11":
                results = service.search_icd11(search, limit=limit)
            elif terminology_type == "loinc":
                results = service.search_loinc(search, limit=limit)
            elif terminology_type == "ichi":
                results = service.search_ichi(search, limit=limit)
            elif terminology_type == "interventions":
                facility_level = request.query_params.get("facility_level")
                offset = int(request.query_params.get("offset", 0))
                payment_mechanism = request.query_params.get("payment_mechanism")
                excluded_payment_mechanisms: list[str] = []
                if not payment_mechanism:
                    request_facility = getattr(request, "facility", None)
                    if request_facility is None:
                        profile = getattr(request.user, "staff_profile", None)
                        request_facility = getattr(profile, "primary_facility", None)
                    if request_facility:
                        hide_capitation = (
                            FacilityBillingConfig.objects.filter(facility=request_facility)
                            .values_list("hide_capitation_interventions", flat=True)
                            .first()
                        )
                        if hide_capitation:
                            excluded_payment_mechanisms.append("CAPITATION")
                access_point = request.query_params.get("access_point")
                patient_gender = request.query_params.get("patient_gender")
                active_only = request.query_params.get("active_only", "").lower() in (
                    "1",
                    "true",
                    "yes",
                )
                results_list, total_count = search_local_interventions(
                    query=search,
                    facility_level=int(facility_level) if facility_level else None,
                    limit=limit,
                    offset=offset,
                    payment_mechanism=payment_mechanism or None,
                    exclude_payment_mechanisms=excluded_payment_mechanisms,
                    active_only=active_only,
                    access_point=access_point or None,
                    patient_gender=patient_gender or None,
                )
                # Convert to dicts
                data = results_list
                return Response(
                    {
                        "results": data,
                        "count": total_count,
                    }
                )
            elif terminology_type == "drugs":
                results = service.search_drug_products(search, limit=limit)
            elif terminology_type == "active-components":
                results = service.search_active_components(search, limit=limit)
            else:
                return Response(
                    {"error": f"Unknown terminology type: {terminology_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Convert dataclasses to dicts
            data = []
            for item in results:
                if hasattr(item, "__dict__"):
                    item_dict = {k: v for k, v in item.__dict__.items() if not k.startswith("_")}
                    data.append(item_dict)
                else:
                    data.append(item)

            return Response(
                {
                    "results": data,
                    "count": len(data),
                }
            )

        except TerminologyError as e:
            return Response(
                {"error": str(e), "status_code": e.status_code},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            logger.exception("ICD terminology search failed")
            return Response(
                {"error": _stringify_error(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _search_icd11_with_fallback(self, search: str, limit: int):
        """
        Search ICD-11 with fallback: DHA API, then local container, then local DB.

        Priority:
        1. If ICD11_USE_LOCAL=True, use local container only
        2. Otherwise, try DHA Terminology API first
        3. If DHA fails, fall back to local container
        4. If the container is unavailable, fall back to local ICD-11 DB

        Args:
            search: Search query
            limit: Maximum results

        Returns:
            Response with ICD-11 codes and source indicator
        """
        import logging

        logger = logging.getLogger(__name__)

        # If explicitly configured to use local only, skip DHA
        use_local_only = getattr(django_settings, "ICD11_USE_LOCAL", False)

        if use_local_only:
            logger.debug("ICD11_USE_LOCAL=True, using local container only")
            return self._search_icd11_local(search, limit)

        # If DHA API is not configured, skip straight to local fallback
        sha_base = getattr(django_settings, "SHA_API_BASE_URL", "")
        if not sha_base or sha_base == "https://example.com":
            logger.debug("SHA_API_BASE_URL not configured, using local fallback")
            return self._search_icd11_local(search, limit, "DHA API not configured")

        # Try DHA Terminology API first
        try:
            logger.debug("Attempting DHA Terminology API for ICD-11 search")
            service = TerminologyService(use_local_fallback=False)
            results = service.search_icd11(search, limit=limit)

            if results:
                # Convert dataclasses to dicts
                data = []
                for item in results:
                    if hasattr(item, "__dict__"):
                        item_dict = {
                            k: v for k, v in item.__dict__.items() if not k.startswith("_")
                        }
                        data.append(item_dict)
                    else:
                        data.append(item)

                return Response(
                    {
                        "results": data,
                        "count": len(data),
                        "source": "dha_terminology_api",
                    }
                )
            else:
                # Empty results from DHA, try local
                logger.info("DHA API returned empty results, trying local container")
                raise TerminologyError("Empty results from DHA API", status_code=503)

        except (TerminologyError, Exception) as dha_error:
            logger.warning(f"DHA Terminology API failed: {dha_error}, falling back to local")
            return self._search_icd11_local(search, limit, str(dha_error))

    def _search_icd11_local(self, search: str, limit: int, fallback_reason: str = ""):
        """
        Search ICD-11 using the local WHO ICD-11 container first, then local DB.

        Args:
            search: Search query
            limit: Maximum results
            fallback_reason: Upstream failure reason if already in fallback mode

        Returns:
            Response with ICD-11 codes
        """
        try:
            service = ICD11LocalService()

            # Check if service is available
            if not service.is_available():
                return self._search_icd11_database_fallback(
                    search,
                    limit,
                    fallback_reason or "Local ICD-11 API unavailable",
                )

            results = service.search(search, limit=limit)

            # Convert to dict format
            data = [code.to_dict() for code in results]

            # If container returned empty results, fall back to local DB
            if not data:
                logger.info("Local ICD-11 container returned empty results, trying database")
                return self._search_icd11_database_fallback(
                    search,
                    limit,
                    fallback_reason or "Local ICD-11 container returned no results",
                )

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_who_icd11",
                    "fallback": bool(fallback_reason),
                    "fallback_reason": fallback_reason,
                }
            )

        except Exception:
            logger.exception("ICD-11 local container search failed")
            return self._search_icd11_database_fallback(
                search,
                limit,
                fallback_reason or "ICD-11 local container search failed",
            )

    def _search_icd11_database_fallback(self, search: str, limit: int, original_error: str = ""):
        """Fallback to the local ICD-11 database when network/container sources fail."""
        from hmis.apps.billing.models import ICD11CodeReference

        try:
            codes = ICD11CodeReference.objects.filter(
                models.Q(code__icontains=search)
                | models.Q(title__icontains=search)
                | models.Q(description__icontains=search),
                is_active=True,
            ).order_by("code")[:limit]

            data = [
                {
                    "id": code.pk,
                    "code": code.code,
                    "title": code.title,
                    "chapter": code.chapter or code.chapter_no,
                    "chapter_no": code.chapter_no,
                    "is_leaf": code.is_leaf,
                    "is_active": code.is_active,
                    "class_kind": code.class_kind,
                    "entity_id": code.entity_id,
                }
                for code in codes
            ]

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_icd11_database",
                    "fallback": True,
                    "fallback_reason": original_error or "ICD-11 services unavailable",
                }
            )
        except Exception as exc:
            logger.error(f"ICD-11 database fallback failed: {exc}")
            return Response(
                {
                    "error": "All ICD-11 services unavailable",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


@extend_schema_view()
class ClientRegistryView(APIView):
    """
    API view for Kenya Client Registry operations.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "national_id", OpenApiTypes.STR, description="Kenya National ID number"
            ),
            OpenApiParameter("client_number", OpenApiTypes.STR, description="CR client number"),
            OpenApiParameter("huduma_number", OpenApiTypes.STR, description="Huduma Namba"),
            OpenApiParameter("passport_number", OpenApiTypes.STR, description="Passport number"),
            OpenApiParameter(
                "identification_type", OpenApiTypes.STR, description="Generic ID type"
            ),
            OpenApiParameter("identification_number", OpenApiTypes.STR, description="ID value"),
        ],
        responses={
            200: inline_serializer(
                name="ClientRegistryResponse",
                fields={
                    "found": serializers.BooleanField(),
                    "client": serializers.DictField(),
                },
            )
        },
    )
    def get(self, request):
        """
        Fetch client from Client Registry.

        GET /api/billing/client-registry/fetch/?national_id=XXX
        GET /api/billing/client-registry/fetch/?client_number=XXX
        GET /api/billing/client-registry/fetch/?huduma_number=XXX
        GET /api/billing/client-registry/fetch/?identification_type=National ID&identification_number=XXX

        Query Parameters:
            national_id: Kenya National ID number
            client_number: CR client number
            huduma_number: Huduma Namba
            passport_number: Passport number
            identification_type: Generic ID type (e.g., 'National ID', 'Passport', 'SHA Number')
            identification_number: ID value (used with identification_type)
        """
        national_id = request.query_params.get("national_id")
        client_number = request.query_params.get("client_number")
        huduma_number = request.query_params.get("huduma_number")
        passport_number = request.query_params.get("passport_number")
        identification_type = request.query_params.get("identification_type")
        identification_number = request.query_params.get("identification_number")

        if not any(
            [
                national_id,
                client_number,
                huduma_number,
                passport_number,
                (identification_type and identification_number),
            ]
        ):
            return Response(
                {
                    "error": "At least one identifier is required (national_id, client_number, huduma_number, passport_number, or identification_type+identification_number)"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = ClientRegistryService()
            client = service.fetch_client(
                national_id=national_id,
                client_number=client_number,
                huduma_number=huduma_number,
                passport_number=passport_number,
                identification_type=identification_type,
                identification_number=identification_number,
            )

            if client:
                raw = client.raw_data or {}
                return Response(
                    {
                        "found": True,
                        "client": {
                            "client_number": client.client_number,
                            "first_name": client.first_name,
                            "last_name": client.last_name,
                            "middle_name": client.middle_name,
                            "date_of_birth": (
                                str(client.date_of_birth) if client.date_of_birth else None
                            ),
                            "gender": client.gender,
                            "national_id": client.national_id,
                            "huduma_number": client.huduma_number,
                            "phone_number": client.phone_number,
                            "email": client.email,
                            "county": client.county_of_residence,
                            "sub_county": client.sub_county_of_residence,
                            "ward": client.ward_of_residence,
                            # Extra demographic fields surfaced from the raw
                            # CR payload (esp. via ILM /api/v1/patients).
                            "place_of_birth": raw.get("place_of_birth"),
                            "citizenship": raw.get("citizenship"),
                            "civil_status": raw.get("civil_status"),
                            "employment_type": raw.get("employment_type"),
                            "address": raw.get("postal_address") or raw.get("address"),
                            "village_estate": raw.get("village_estate"),
                            "country": raw.get("country"),
                            "zip_code": raw.get("zip_code"),
                            "id_serial": raw.get("id_serial"),
                            # Nested: other identifiers (SHA Number, Household Number, etc.)
                            "other_identifications": raw.get("other_identifications"),
                            # Nested: dependants list
                            "dependants": raw.get("dependants"),
                        },
                    }
                )
            else:
                return Response({"found": False})

        except ClientNotFoundError:
            return Response({"found": False})
        except ClientRegistryError as e:
            return Response(
                {"error": str(e), "found": False}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as exc:
            logger.exception("Client Registry lookup failed")
            return Response(
                {"error": _stringify_error(exc), "found": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=inline_serializer(
            name="ClientRegistryRegisterRequest",
            fields={
                "patient_id": serializers.IntegerField(required=False),
                "first_name": serializers.CharField(required=False),
                "last_name": serializers.CharField(required=False),
                "middle_name": serializers.CharField(required=False),
                "date_of_birth": serializers.DateField(required=False),
                "gender": serializers.CharField(required=False),
                "national_id": serializers.CharField(required=False),
                "huduma_number": serializers.CharField(required=False),
                "passport_number": serializers.CharField(required=False),
                "phone_number": serializers.CharField(required=False),
                "email": serializers.EmailField(required=False),
            },
        ),
        responses={
            201: inline_serializer(
                name="ClientRegistryRegisterResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "client_number": serializers.CharField(required=False),
                    "message": serializers.CharField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """
        Register a new client in Client Registry.

        POST /api/billing/client-registry/register/

        Accepts either:
        - patient_id: ID of existing patient (will fetch data automatically)
        - Individual fields: first_name, last_name, date_of_birth, gender (required)
        """
        from hmis.apps.patients.models import Patient

        data = request.data
        patient_id = data.get("patient_id")

        # If patient_id provided, fetch patient data
        if patient_id:
            try:
                patient = Patient.objects.get(id=patient_id)
                # Use patient data for CR registration
                first_name = patient.first_name
                last_name = patient.last_name
                date_of_birth = str(patient.date_of_birth)
                gender = patient.gender
                national_id = (
                    patient.identification_number
                    if patient.identification_type == "national_id"
                    else patient.national_id
                )
                middle_name = patient.middle_name
                phone_number = patient.phone_number
                email = patient.email
                # Map other ID types
                huduma_number = None
                passport_number = None
                if patient.identification_type == "passport":
                    passport_number = patient.identification_number
            except Patient.DoesNotExist:
                return Response(
                    {"error": f"Patient with id {patient_id} not found", "success": False},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            # Use individual fields from request
            required_fields = ["first_name", "last_name", "date_of_birth", "gender"]
            missing = [f for f in required_fields if not data.get(f)]
            if missing:
                return Response(
                    {"error": f"Missing required fields: {', '.join(missing)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            first_name = data["first_name"]
            last_name = data["last_name"]
            date_of_birth = data["date_of_birth"]
            gender = data["gender"]
            national_id = data.get("national_id")
            middle_name = data.get("middle_name")
            huduma_number = data.get("huduma_number")
            passport_number = data.get("passport_number")
            phone_number = data.get("phone_number")
            email = data.get("email")

        try:
            service = ClientRegistryService()
            client = service.register_client(
                first_name=first_name,
                last_name=last_name,
                date_of_birth=date_of_birth,
                gender=gender,
                national_id=national_id,
                middle_name=middle_name,
                huduma_number=huduma_number,
                passport_number=passport_number,
                phone_number=phone_number,
                email=email,
            )

            # If patient_id provided, update patient with CR number
            if patient_id and client.client_number:
                patient.cr_number = client.client_number
                patient.save(update_fields=["cr_number"])

            return Response(
                {
                    "success": True,
                    "client_number": client.client_number,
                    "message": "Client registered successfully",
                },
                status=status.HTTP_201_CREATED,
            )

        except ClientRegistryError as e:
            return Response({"error": str(e), "success": False}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Client Registry registration failed")
            return Response(
                {"error": _stringify_error(exc), "success": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=inline_serializer(
            name="ClientRegistryUpdateRequest",
            fields={
                "client_number": serializers.CharField(),
                "phone_number": serializers.CharField(required=False),
                "email": serializers.EmailField(required=False),
                "county": serializers.CharField(required=False),
                "sub_county": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="ClientRegistryUpdateResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "client": serializers.DictField(required=False),
                    "message": serializers.CharField(required=False),
                },
            )
        },
    )
    def put(self, request):
        """
        Update an existing client in Client Registry.

        PUT /api/billing/client-registry/update/

        Request Body:
            client_number: CR client number (required)
            phone_number: Updated phone number (optional)
            email: Updated email address (optional)
            county: Updated county of residence (optional)
            sub_county: Updated sub-county of residence (optional)

        At least one field to update must be provided alongside client_number.

        Per DHA API: PUT /v3/update-client
        """
        data = request.data

        client_number = data.get("client_number")
        if not client_number:
            return Response(
                {"error": "client_number is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Extract updatable fields
        update_fields = {}
        if "phone_number" in data:
            update_fields["phone_number"] = data["phone_number"]
        if "email" in data:
            update_fields["email"] = data["email"]
        if "county" in data:
            update_fields["county_of_residence"] = data["county"]
        if "sub_county" in data:
            update_fields["sub_county_of_residence"] = data["sub_county"]

        if not update_fields:
            return Response(
                {
                    "error": "At least one field to update is required (phone_number, email, county, sub_county)"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = ClientRegistryService()
            client = service.update_client(client_number=client_number, **update_fields)

            return Response(
                {
                    "success": True,
                    "client": {
                        "client_number": client.client_number,
                        "first_name": client.first_name,
                        "last_name": client.last_name,
                        "phone_number": client.phone_number,
                        "email": client.email,
                        "county": client.county_of_residence,
                        "sub_county": client.sub_county_of_residence,
                    },
                    "message": "Client updated successfully",
                }
            )

        except ClientNotFoundError as e:
            return Response({"error": str(e), "success": False}, status=status.HTTP_404_NOT_FOUND)
        except ClientRegistryError as e:
            return Response({"error": str(e), "success": False}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Client Registry update failed")
            return Response(
                {"error": _stringify_error(exc), "success": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class FacilitySearchView(APIView):
    """
    API view for facility validation via MFL.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        parameters=[
            OpenApiParameter("facility_code", OpenApiTypes.STR, description="Facility code"),
            OpenApiParameter("fid", OpenApiTypes.STR, description="Facility ID"),
        ],
        responses={
            200: inline_serializer(
                name="FacilitySearchResponse",
                fields={
                    "found": serializers.BooleanField(),
                    "facility": serializers.DictField(required=False),
                },
            )
        },
    )
    def get(self, request):
        """
        Search/validate facility in Master Facility List.

        GET /api/billing/facility/validate/?facility_code=XXXXX

        Uses ILM middleware (/api/v1/facilities/search) as primary,
        falls back to legacy /v1/facility-search if ILM fails.
        """
        facility_code = request.query_params.get("facility_code")
        fid = request.query_params.get("fid")

        if not facility_code and not fid:
            return Response(
                {"error": "facility_code or fid is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Try ILM middleware first (/api/v1/facilities/search)
            from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

            ilm_result = None
            try:
                identifier = facility_code or fid or ""
                identifier_type = "fr-code" if facility_code else "fid"
                ilm_svc = IlmRegistriesService()
                ilm_result = ilm_svc.search_facility(
                    identifier=identifier,
                    identifier_type=identifier_type,
                    facility=getattr(request, "facility", None),
                    user=request.user,
                )
            except Exception:
                logger.debug("ILM facility search unavailable, falling back to legacy")

            # Parse ILM response (returns a list of facilities)
            if ilm_result and ilm_result.status_code == 200 and ilm_result.payload:
                ilm_data = ilm_result.payload
                # ILM returns a list; take the first match
                fac_data = (
                    ilm_data[0]
                    if isinstance(ilm_data, list) and len(ilm_data) > 0
                    else (
                        ilm_data
                        if isinstance(ilm_data, dict)
                        and (ilm_data.get("officialName") or ilm_data.get("name"))
                        else None
                    )
                )
                if fac_data:
                    # ILM uses camelCase: kephLevel, officialName, frCode, fidCode, etc.
                    dha_level = (
                        fac_data.get("kephLevel")
                        or fac_data.get("keph_level")
                        or fac_data.get("level")
                        or ""
                    )

                    # Auto-correct facility level from DHA
                    level_corrected = False
                    local_facility = getattr(request, "facility", None)
                    if dha_level and local_facility and hasattr(local_facility, "level"):
                        from hmis.apps.core.models import Facility as FacilityModel

                        # Normalize "LEVEL 2" or "Level 2" or "2" to just "2"
                        normalized_level = str(dha_level).upper().replace("LEVEL", "").strip()[:1]
                        if normalized_level.isdigit() and normalized_level != local_facility.level:
                            old_level = local_facility.level
                            FacilityModel.objects.filter(pk=local_facility.pk).update(
                                level=normalized_level
                            )
                            level_corrected = True
                            logger.info(
                                "Auto-corrected facility %s level from %s to %s (per DHA ILM)",
                                getattr(local_facility, "mfl_code", ""),
                                old_level,
                                normalized_level,
                            )

                    return Response(
                        {
                            "found": True,
                            "facility": {
                                "facility_code": fac_data.get("frCode")
                                or fac_data.get("facility_code")
                                or identifier,
                                "name": fac_data.get("officialName") or fac_data.get("name", ""),
                                "level": dha_level,
                                "county": fac_data.get("county", ""),
                                "sub_county": fac_data.get("sub_county", ""),
                                "ward": fac_data.get("ward", ""),
                                "ownership": fac_data.get("ownership", ""),
                                "facility_type": fac_data.get("facility_type", ""),
                                "operational_status": fac_data.get("operational_status", ""),
                                "license_expiry": fac_data.get("license_expiry"),
                                "is_sha_contracted": fac_data.get("approved")
                                or fac_data.get("sha_contracted", False),
                            },
                            "level_corrected": level_corrected,
                        }
                    )

            # Fallback to legacy DHASearchService
            service = DHASearchService()
            facility = service.search_facility(
                facility_code=facility_code,
                fid=fid,
            )

            if facility and facility.found:
                # Auto-correct local facility level from DHA if mismatched
                level_corrected = False
                dha_level = facility.level
                if dha_level and request.user.is_authenticated:
                    from hmis.apps.core.models import Facility as FacilityModel

                    local_facility = getattr(request, "facility", None)
                    if local_facility and hasattr(local_facility, "level"):
                        # Normalize DHA level to our format (e.g., "Level 4" -> "4", "4" -> "4")
                        normalized_level = str(dha_level).replace("Level ", "").strip()[:1]
                        if (
                            normalized_level
                            and normalized_level.isdigit()
                            and normalized_level != local_facility.level
                        ):
                            old_level = local_facility.level
                            FacilityModel.objects.filter(pk=local_facility.pk).update(
                                level=normalized_level
                            )
                            level_corrected = True
                            logger.info(
                                "Auto-corrected facility %s level from %s to %s (per DHA registry)",
                                local_facility.mfl_code,
                                old_level,
                                normalized_level,
                            )

                return Response(
                    {
                        "found": True,
                        "facility": {
                            "facility_code": facility.facility_code,
                            "name": facility.name,
                            "level": facility.level,
                            "county": facility.county,
                            "sub_county": facility.sub_county,
                            "ward": facility.ward,
                            "ownership": facility.ownership,
                            "facility_type": facility.facility_type,
                            "operational_status": facility.operational_status,
                            "license_expiry": (
                                str(facility.license_expiry) if facility.license_expiry else None
                            ),
                            "is_sha_contracted": facility.approved,
                        },
                        "level_corrected": level_corrected,
                    }
                )
            else:
                return Response({"found": False})

        except SearchError as e:
            return Response(
                {"error": str(e), "found": False}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as exc:
            logger.exception("Facility search failed")
            return Response(
                {"error": _stringify_error(exc), "found": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PractitionerSearchView(APIView):
    """
    API view for practitioner search via DHA Health Worker Registry.

    Uses the ILM middleware (``/api/v1/professionals``) to search by
    National ID or Passport number and returns comprehensive practitioner
    information including membership, licenses, professional details,
    and contact information.

    Note: Replaced legacy ``/v1/practitioner-search`` with the ILM
    middleware which uses the newer authentication flow.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    # Map identification_type to the DHA regulator code.
    # When the caller doesn't specify a regulator we try all four.
    _REGULATORS = ("KMPDC", "COC", "PPB", "NCK")

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "identification_number",
                OpenApiTypes.STR,
                description="National ID or Passport number",
            ),
            OpenApiParameter(
                "identification_type", OpenApiTypes.STR, description="'National ID' or 'passport'"
            ),
            OpenApiParameter(
                "regulator",
                OpenApiTypes.STR,
                description="Regulator code: KMPDC, COC, PPB, NCK (optional – tries all if omitted)",
            ),
        ],
        responses={
            200: inline_serializer(
                name="PractitionerSearchResponse",
                fields={
                    "message": serializers.DictField(),
                },
            )
        },
    )
    def get(self, request):
        """
        Search practitioner in Health Worker Registry via ILM middleware.

        GET /api/sha/practitioner/validate/?identification_type=National+ID&identification_number=12345678

        Query Parameters:
            identification_number: National ID or Passport number (required)
            identification_type: 'National ID' or 'passport' (default: 'National ID')
            regulator: KMPDC | COC | PPB | NCK (optional – tries all if omitted)

        Returns:
            Full practitioner data including membership, licenses,
            professional details, contacts, and identifiers.
        """
        from hmis.apps.billing.services.dha_errors import (
            DHAError,
            DHANotFoundError,
            DHAValidationError,
        )
        from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

        identification_number = request.query_params.get("identification_number")
        identification_type = request.query_params.get("identification_type", "National ID")
        regulator = request.query_params.get("regulator")

        if not identification_number:
            return Response(
                {"error": "identification_number is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        regulators = [regulator] if regulator else list(self._REGULATORS)
        facility = getattr(request.user, "primary_facility", None)
        service = IlmRegistriesService()
        last_error: Exception | None = None

        for reg in regulators:
            try:
                result = service.search_professional(
                    identification_number=identification_number,
                    identification_type=identification_type,
                    regulator=reg,
                    facility=facility,
                    user=request.user,
                )
                raw = result.payload
                if raw and isinstance(raw, dict):
                    msg = raw.get("message") or raw
                    membership = msg.get("membership", {})
                    return Response(
                        {
                            "message": {
                                "membership": {
                                    "id": membership.get("id", ""),
                                    "status": membership.get("status", ""),
                                    "salutation": membership.get("salutation", ""),
                                    "full_name": membership.get("full_name", ""),
                                    "gender": membership.get("gender", ""),
                                    "first_name": membership.get("first_name", ""),
                                    "middle_name": membership.get("middle_name", ""),
                                    "last_name": membership.get("last_name", ""),
                                    "registration_id": membership.get("registration_id", ""),
                                    "external_reference_id": membership.get(
                                        "external_reference_id", ""
                                    ),
                                    "licensing_body": membership.get("licensing_body", ""),
                                    "specialty": membership.get("specialty", ""),
                                    "is_active": membership.get("is_active", 0),
                                    "is_withdrawn": membership.get("is_withdrawn", 0),
                                    "withdrawal_reason": membership.get("withdrawal_reason", ""),
                                    "withdrawal_date": membership.get("withdrawal_date", ""),
                                    "license_expires_in_days": _compute_license_days(
                                        msg.get("licenses", [])
                                    ),
                                },
                                "licenses": [
                                    {
                                        "id": lic.get("id", ""),
                                        "external_reference_id": lic.get(
                                            "external_reference_id", ""
                                        ),
                                        "license_type": lic.get("license_type", ""),
                                        "license_start": lic.get("license_start", ""),
                                        "license_end": lic.get("license_end", ""),
                                    }
                                    for lic in msg.get("licenses", [])
                                ],
                                "professional_details": {
                                    "professional_cadre": msg.get("professional_details", {}).get(
                                        "professional_cadre", ""
                                    ),
                                    "practice_type": msg.get("professional_details", {}).get(
                                        "practice_type", ""
                                    ),
                                    "specialty": msg.get("professional_details", {}).get(
                                        "specialty", ""
                                    ),
                                    "subspecialty": msg.get("professional_details", {}).get(
                                        "subspecialty", ""
                                    ),
                                    "discipline_name": msg.get("professional_details", {}).get(
                                        "discipline_name", ""
                                    ),
                                    "educational_qualifications": msg.get(
                                        "professional_details", {}
                                    ).get("educational_qualifications", ""),
                                },
                                "contacts": {
                                    "phone": msg.get("contacts", {}).get("phone", ""),
                                    "email": msg.get("contacts", {}).get("email", ""),
                                    "postal_address": msg.get("contacts", {}).get(
                                        "postal_address", ""
                                    ),
                                },
                                "identifiers": {
                                    "identification_type": msg.get("identifiers", {}).get(
                                        "identification_type", ""
                                    ),
                                    "identification_number": msg.get("identifiers", {}).get(
                                        "identification_number", ""
                                    ),
                                    "client_registry_id": msg.get("identifiers", {}).get(
                                        "client_registry_id", ""
                                    ),
                                    "student_id": msg.get("identifiers", {}).get("student_id", ""),
                                },
                            }
                        }
                    )
            except DHANotFoundError:
                last_error = None  # try next regulator
                continue
            except DHAValidationError as exc:
                # "no practitioner membership returned" means not found with this regulator
                if "no practitioner" in str(exc).lower():
                    continue
                last_error = exc
                continue
            except DHAError as exc:
                last_error = exc
                continue
            except Exception as exc:
                last_error = exc
                continue

        if last_error:
            logger.exception("Practitioner search failed via ILM: %s", last_error)
            return Response(
                {"error": str(last_error), "message": None},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "error": "No practitioner found with the provided identification",
                "message": None,
            },
            status=status.HTTP_404_NOT_FOUND,
        )


def _compute_license_days(licenses: list[dict]) -> int:
    """Compute days until the latest license expires."""
    from datetime import datetime

    best = -999
    for lic in licenses:
        end_str = lic.get("license_end") or ""
        if not end_str or end_str == "None":
            continue
        try:
            end_date = datetime.strptime(end_str, "%Y-%m-%d").date()
            days = (end_date - date.today()).days
            if days > best:
                best = days
        except (ValueError, TypeError):
            continue
    return best if best > -999 else 0


class EligibilityCheckView(APIView):
    """
    API view for SHA eligibility verification.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        request=inline_serializer(
            name="EligibilityCheckRequest",
            fields={
                "patient_id": serializers.IntegerField(required=False),
                "sha_number": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="EligibilityCheckResponse",
                fields={
                    "is_eligible": serializers.BooleanField(),
                    "result": serializers.CharField(),
                    "eligible_until": serializers.CharField(required=False),
                    "benefit_balance": serializers.FloatField(required=False),
                    "ineligibility_reason": serializers.CharField(required=False),
                    "sha_number": serializers.CharField(),
                    "membership_type": serializers.CharField(),
                    "eligible_schemes": serializers.ListField(
                        child=serializers.CharField(), required=False
                    ),
                    "billable_schemes": serializers.ListField(
                        child=serializers.CharField(), required=False
                    ),
                    "coverage_caveat": serializers.CharField(required=False, allow_blank=True),
                    "coverage_blocked": serializers.BooleanField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """
        Check eligibility for a patient or SHA member.

        POST /api/billing/eligibility/check/
        {
            "patient_id": 123,
            "sha_number": "SHA-XXXXX"
        }
        """
        patient_id = request.data.get("patient_id")
        sha_number = request.data.get("sha_number")
        sha_member_id = request.data.get("sha_member_id")

        if not patient_id and not sha_number and not sha_member_id:
            return Response(
                {"error": "patient_id, sha_number, or sha_member_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Try to find SHA member
            member = None
            if sha_member_id:
                member = SHAMember.objects.filter(id=sha_member_id).first()
            elif sha_number:
                member = SHAMember.objects.filter(sha_number=sha_number).first()
            elif patient_id:
                member = SHAMember.objects.filter(patient_id=patient_id).first()

            if not member:
                return Response(
                    {
                        "is_eligible": False,
                        "result": "NOT_FOUND",
                        "message": "No SHA membership found for this patient",
                    }
                )

            # Check eligibility
            service = SHAEligibilityService()
            facility = getattr(request, "facility", None)
            check = service.check_eligibility(member, request.user, facility=facility)

            response_data = getattr(check, "response_data", {}) or {}
            if not isinstance(response_data, dict):
                response_data = {}
            eligible_schemes = response_data.get("eligible_schemes") or []
            if not isinstance(eligible_schemes, list):
                eligible_schemes = []
            billable_schemes = response_data.get("billable_schemes") or []
            if not isinstance(billable_schemes, list):
                billable_schemes = []
            coverage_caveat = response_data.get("coverage_caveat") or ""
            if not isinstance(coverage_caveat, str):
                coverage_caveat = ""
            coverage_blocked = bool(response_data.get("coverage_blocked", False))

            return Response(
                {
                    "is_eligible": getattr(check, "is_eligible", False),
                    "result": getattr(check, "result", ""),
                    "eligible_until": (
                        str(check.eligible_until)
                        if getattr(check, "eligible_until", None)
                        else None
                    ),
                    "benefit_balance": (
                        float(check.benefit_balance)
                        if getattr(check, "benefit_balance", None)
                        else None
                    ),
                    "ineligibility_reason": getattr(check, "ineligibility_reason", ""),
                    "sha_number": member.sha_number,
                    "membership_type": member.membership_type,
                    "eligible_schemes": eligible_schemes,
                    "billable_schemes": billable_schemes,
                    "coverage_caveat": coverage_caveat,
                    "coverage_blocked": coverage_blocked,
                    "is_pfms_eligible": member.is_pfms_eligible,
                    "pfms_category": member.pfms_category or None,
                    "pfms_category_display": (
                        member.get_pfms_category_display() if member.pfms_category else None
                    ),
                    "pfms_verified": member.pfms_verified,
                }
            )

        except Exception as exc:
            logger.exception("SHA eligibility check failed")
            return Response(
                {"error": _stringify_error(exc), "is_eligible": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DirectEligibilityCheckView(APIView):
    """
    API view for direct SHA eligibility verification by ID number.

    This endpoint checks eligibility directly with SHA API without
    requiring a pre-existing SHAMember record. Useful during patient
    registration or lookup to verify SHA coverage status.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "national_id", OpenApiTypes.STR, description="Kenya National ID number"
            ),
            OpenApiParameter("sha_number", OpenApiTypes.STR, description="SHA/CR number"),
            OpenApiParameter("identification_type", OpenApiTypes.STR, description="Custom ID type"),
            OpenApiParameter("identification_number", OpenApiTypes.STR, description="ID value"),
        ],
        responses={
            200: inline_serializer(
                name="DirectEligibilityResponse",
                fields={
                    "is_eligible": serializers.BooleanField(),
                    "sha_number": serializers.CharField(required=False),
                    "full_name": serializers.CharField(required=False),
                    "coverage_end_date": serializers.CharField(required=False),
                    "copay_percentage": serializers.IntegerField(required=False),
                    "reason": serializers.CharField(required=False),
                    "is_employed": serializers.BooleanField(required=False),
                    "error": serializers.CharField(required=False),
                },
            )
        },
    )
    def get(self, request):
        """
        Check SHA eligibility by identification.

        GET /api/billing/eligibility/direct/?national_id=12345678
        GET /api/billing/eligibility/direct/?sha_number=CR1234567890-0

        Query Parameters:
            national_id: Kenya National ID number
            sha_number: SHA/CR number
            identification_type: Custom ID type (default: 'National ID')
            identification_number: ID value (if using custom type)

        Returns:
            {
                "is_eligible": true/false,
                "sha_number": "CR...",
                "full_name": "JOHN DOE",
                "coverage_end_date": "2025-12-31",
                "copay_percentage": 0,
                "reason": "The individual is covered",
                "is_employed": true,
                "error": null
            }
        """
        national_id = request.query_params.get("national_id")
        sha_number = request.query_params.get("sha_number")
        identification_type = request.query_params.get("identification_type")
        identification_number = request.query_params.get("identification_number")

        # Determine identification type and number
        if national_id:
            id_type = "National ID"
            id_number = national_id
        elif sha_number:
            id_type = "SHA Number"
            id_number = sha_number
        elif identification_type and identification_number:
            id_type = identification_type
            id_number = identification_number
        else:
            return Response(
                {
                    "error": "national_id, sha_number, or identification_type+identification_number is required"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAEligibilityService()
            result = service.check_eligibility_direct(id_type, id_number)

            # Return appropriate status based on result
            if result.get("error"):
                error_code = result.get("error_code")
                if error_code == "SHA_AUTH_FAILED":
                    error_status = status.HTTP_502_BAD_GATEWAY
                elif error_code == "SHA_UPSTREAM_TIMEOUT":
                    error_status = status.HTTP_504_GATEWAY_TIMEOUT
                else:
                    error_status = status.HTTP_503_SERVICE_UNAVAILABLE

                return Response(
                    {
                        **result,
                        "message": result.get("error"),
                        "detail": result.get("error"),
                    },
                    status=error_status,
                )

            return Response(result)

        except Exception as exc:
            logger.exception("Direct SHA eligibility check failed")
            return Response(
                {
                    "is_eligible": False,
                    "error": _stringify_error(exc),
                    "sha_number": None,
                    "full_name": None,
                    "coverage_end_date": None,
                    "copay_percentage": 100,
                    "reason": "Internal error",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class SHAWebhookView(APIView):
    """
    Webhook endpoint for receiving DHA/SHA claim responses.

    This is the callback URL that DHA calls to notify us about:
    - Claim status changes (approved, rejected, pending-verification)
    - ClaimResponse FHIR resources
    - Payment notifications

    Register this URL with DHA as your Callback URL:
    https://your-domain/api/sha/webhook/

    DHA Sandbox expects: https://taifa-hmis.com/callback
    Replace with your actual production URL.
    """

    # Allow unauthenticated access since DHA will call this
    # Use signature verification instead
    permission_classes = []

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                name="WebhookResponse",
                fields={
                    "status": serializers.CharField(),
                    "message": serializers.CharField(),
                    "claim_reference": serializers.CharField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """
        Receive ClaimResponse from DHA.

        Expected payload (FHIR ClaimResponse):
        {
            "resourceType": "ClaimResponse",
            "id": "claim-response-id",
            "status": "active",
            "type": {"coding": [{"code": "institutional"}]},
            "use": "claim",
            "patient": {"reference": "Patient/xxx"},
            "created": "2026-01-11T10:00:00Z",
            "insurer": {"reference": "Organization/sha"},
            "request": {"reference": "Claim/original-claim-id"},
            "outcome": "complete|queued|error|partial",
            "disposition": "Claim approved/rejected reason",
            "item": [...],
            "total": {"value": 1500.00, "currency": "KES"}
        }

        Or simplified notification:
        {
            "claim_reference": "SHA-CLM-2026-001",
            "status": "approved|rejected|pending",
            "outcome": "complete|queued|error",
            "disposition": "Reason text",
            "approved_amount": 1500.00,
            "payment_reference": "PAY-xxx"
        }
        """
        import logging

        logger = logging.getLogger("hmis.sha.webhook")

        try:
            payload = request.data
            logger.info(f"SHA Webhook received: {payload}")

            # Verify signature if provided (DHA may include HMAC signature)
            signature = request.headers.get("X-SHA-Signature")
            if signature and not self._verify_signature(request.body, signature):
                logger.warning("Invalid webhook signature")
                return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

            # Handle FHIR ClaimResponse
            if payload.get("resourceType") == "ClaimResponse":
                return self._handle_fhir_claim_response(payload)

            # Handle simple notification format
            if "claim_reference" in payload:
                return self._handle_simple_notification(payload)

            # Unknown format - log and acknowledge
            logger.warning(f"Unknown webhook payload format: {payload}")
            return Response({"status": "received", "warning": "Unknown format"})

        except Exception as e:
            logger.exception(f"Error processing SHA webhook: {e}")
            return Response(
                {"error": "Processing error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _verify_signature(self, body: bytes, signature: str) -> bool:
        """Verify HMAC signature from DHA."""
        import hmac

        from django.conf import settings

        secret = getattr(settings, "SHA_WEBHOOK_SECRET", None)
        if not secret:
            # No secret configured, skip verification
            return True

        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        return hmac.compare_digest(expected, signature)

    def _handle_fhir_claim_response(self, payload: dict) -> Response:
        """Process FHIR ClaimResponse resource."""
        import logging

        logger = logging.getLogger("hmis.sha.webhook")

        # Extract claim reference from request.reference
        request_ref = payload.get("request", {}).get("reference", "")
        claim_id = request_ref.replace("Claim/", "") if request_ref else None

        outcome = payload.get("outcome", "")  # complete, queued, error, partial
        disposition = payload.get("disposition", "")

        # Map FHIR outcome to our status
        status_map = {
            "complete": "approved",
            "queued": "pending_verification",
            "error": "rejected",
            "partial": "partially_approved",
        }
        new_status = status_map.get(outcome, "pending_verification")

        # Get approved amount from total
        total = payload.get("total", {})
        approved_amount = total.get("value", 0)

        # Update claim if we can find it
        if claim_id:
            updated = self._update_claim_status(
                claim_reference=claim_id,
                new_status=new_status,
                disposition=disposition,
                approved_amount=approved_amount,
                response_payload=payload,
            )
            if updated:
                logger.info(f"Updated claim {claim_id} to status {new_status}")
            else:
                logger.warning(f"Could not find claim with reference {claim_id}")

        return Response(
            {
                "status": "processed",
                "claim_reference": claim_id,
                "outcome": outcome,
                "new_status": new_status,
            }
        )

    def _handle_simple_notification(self, payload: dict) -> Response:
        """Process simple notification format."""
        import logging

        logger = logging.getLogger("hmis.sha.webhook")

        claim_reference = payload.get("claim_reference")
        new_status = payload.get("status", "pending_verification")
        disposition = payload.get("disposition", "")
        approved_amount = payload.get("approved_amount", 0)

        updated = self._update_claim_status(
            claim_reference=claim_reference,
            new_status=new_status,
            disposition=disposition,
            approved_amount=approved_amount,
            response_payload=payload,
        )

        if updated:
            logger.info(f"Updated claim {claim_reference} to status {new_status}")
        else:
            logger.warning(f"Could not find claim with reference {claim_reference}")

        return Response(
            {"status": "processed", "claim_reference": claim_reference, "updated": updated}
        )

    def _update_claim_status(
        self,
        claim_reference: str,
        new_status: str,
        disposition: str,
        approved_amount: float,
        response_payload: dict,
    ) -> bool:
        """Update claim status in database and notify billing staff."""
        from decimal import Decimal

        from hmis.apps.billing.agent import BillingAgentService

        # Try to find claim by SHA reference or claim number
        claim = SHAClaim.objects.filter(sha_claim_reference=claim_reference).first()

        if not claim:
            claim = SHAClaim.objects.filter(claim_number=claim_reference).first()

        if not claim:
            return False

        old_status = claim.status

        # Build update using the shared helper
        api_response = dict(response_payload)
        if disposition:
            api_response.setdefault("disposition", disposition)
        if approved_amount:
            api_response.setdefault("approved_amount", approved_amount)

        BillingAgentService._apply_status_update(claim, new_status, api_response)

        # Send notification if status actually changed
        if new_status != old_status:
            BillingAgentService._notify_claim_status_change(claim, old_status, new_status)

        return True


class SHAValidateView(APIView):
    """
    Validation endpoint for DHA to verify our system is reachable.

    This is the Validate URL that DHA uses to test connectivity:
    https://your-domain/api/sha/validate/

    DHA Sandbox expects: https://taifa-hmis/validate
    Replace with your actual production URL.
    """

    permission_classes = []  # Allow unauthenticated for health checks

    @extend_schema(
        responses={
            200: inline_serializer(
                name="SHAValidateGetResponse",
                fields={
                    "status": serializers.CharField(),
                    "system": serializers.CharField(),
                    "version": serializers.CharField(),
                    "sha_integration": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                    "ready": serializers.BooleanField(),
                },
            )
        },
    )
    def get(self, request):
        """
        Health check endpoint for DHA validation.

        Returns system status and readiness for claim processing.
        """
        from django.conf import settings

        return Response(
            {
                "status": "active",
                "system": "Vitora HMIS",
                "version": getattr(settings, "VERSION", "1.0.0"),
                "sha_integration": {
                    "enabled": True,
                    "api_version": "v3",
                    "fhir_version": "R4",
                },
                "timestamp": timezone.now().isoformat(),
                "ready": True,
            }
        )

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                name="SHAValidatePostResponse",
                fields={
                    "status": serializers.CharField(),
                    "result": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """
        Validate a test payload from DHA.

        DHA may send test claims to verify integration.
        """
        payload = request.data

        # Basic validation of payload structure
        validation_result = {"valid": True, "errors": [], "warnings": []}

        # Check for required FHIR bundle fields if it's a bundle
        if payload.get("resourceType") == "Bundle":
            if "type" not in payload:
                validation_result["errors"].append("Bundle missing type field")
                validation_result["valid"] = False
            if "entry" not in payload:
                validation_result["warnings"].append("Bundle has no entries")

        return Response(
            {
                "status": "validated",
                "result": validation_result,
                "timestamp": timezone.now().isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# DHA HIE Health Check (Internal)
# ---------------------------------------------------------------------------


class SHAHealthCheckView(APIView):
    """
    Health check endpoint for DHA HIE authentication and connectivity.

    Returns the status of each DHA integration subsystem:
    - configured: whether required credentials are set
    - token_valid: whether a token can be obtained
    - auth_mode: current authentication mode (legacy/ilm)

    GET /api/sha/health/
    """

    @extend_schema(
        responses={
            200: inline_serializer(
                name="SHAHealthCheckResponse",
                fields={
                    "configured": serializers.BooleanField(),
                    "auth_mode": serializers.CharField(),
                    "token_valid": serializers.BooleanField(),
                    "token_error": serializers.CharField(allow_null=True),
                    "services": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                },
            )
        },
        description="Check DHA HIE authentication and connectivity status.",
    )
    def get(self, request):
        """Check DHA HIE authentication health."""
        from hmis.apps.billing.services.client_registry import ClientRegistryService
        from hmis.apps.billing.services.sha_auth import SHAAuthError, SHAAuthService
        from hmis.apps.billing.services.terminology import TerminologyService

        auth_service = SHAAuthService()
        configured = auth_service.is_configured()
        auth_mode = auth_service.auth_mode
        token_valid = False
        token_error = None

        if configured:
            try:
                auth_service.get_token(force_refresh=True)
                token_valid = True
            except SHAAuthError as exc:
                token_error = str(exc)
            except Exception as exc:
                token_error = f"Unexpected error: {type(exc).__name__}"

        # Check subsystem configuration
        services = {}
        try:
            cr_service = ClientRegistryService()
            services["client_registry"] = cr_service.is_configured()
        except Exception:
            services["client_registry"] = False

        try:
            term_service = TerminologyService()
            services["terminology"] = term_service.is_configured()
        except Exception:
            services["terminology"] = False

        services["claims_submission"] = configured and token_valid

        return Response(
            {
                "configured": configured,
                "auth_mode": auth_mode,
                "token_valid": token_valid,
                "token_error": token_error,
                "services": services,
                "timestamp": timezone.now().isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# DHA HIE Consent & Preauth Views (User Journey Compliance)
# ---------------------------------------------------------------------------


class ConsentSendOTPView(APIView):
    """
    Send OTP to patient for DHA visit consent via ILM middleware.

    POST /api/sha/consent/send-otp/

    Uses the ILM lifecycle service (POST /api/v1/claims/otp) which handles
    authentication transparently via OAuth2 client_credentials token.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    throttle_scope = "otp"

    # Fallback intervention code when none selected by user
    DEFAULT_INTERVENTION = "SHA-01-001"

    def _get_facility(self, request):
        """Resolve and return the request facility, or raise 403."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return None
        return facility

    @staticmethod
    def _sha_number_to_cr_id(sha_number: str) -> str:
        """Convert internal SHA-XXXX-N format to DHA Client Registry CR format.

        SHA-0127974703399-5 → CR0127974703399-5
        """
        if sha_number.startswith("SHA-"):
            return f"CR{sha_number[4:]}"
        if sha_number.startswith("CR"):
            return sha_number
        return sha_number

    @extend_schema(
        request=inline_serializer(
            name="ConsentSendOTPRequest",
            fields={
                "sha_member_id": serializers.IntegerField(),
                "intervention_codes": serializers.ListField(
                    child=serializers.CharField(), required=False
                ),
            },
        ),
        responses={
            201: inline_serializer(
                name="ConsentSendOTPResponse",
                fields={
                    "consent_id": serializers.IntegerField(),
                    "otp_reference": serializers.CharField(),
                    "status": serializers.CharField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Send OTP to patient for consent verification via ILM middleware."""
        from hmis.apps.billing.services.ilm_lifecycle_service import (
            IlmLifecycleService,
            VisitOtpParams,
        )
        from hmis.apps.billing.sha_serializers import SendOTPSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sha_member_id = serializer.validated_data["sha_member_id"]
        intervention_codes = serializer.validated_data.get("intervention_codes") or [
            self.DEFAULT_INTERVENTION
        ]

        try:
            sha_member = SHAMember.objects.select_related("patient").get(
                id=sha_member_id, patient__organization=facility.organization
            )
        except SHAMember.DoesNotExist:
            return Response(
                {"error": "SHA member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ---- PHC pre-flight guards ----
        # Guard: deceased patient
        if sha_member.patient.is_deceased:
            return Response(
                {
                    "error": "Cannot initiate consent for a deceased patient.",
                    "code": "patient_deceased",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Guard: facility is biometrics-enforced (OTP not allowed)
        if getattr(facility, "biometrics_enforced", False):
            return Response(
                {
                    "error": "This facility requires biometric consent. OTP is not available.",
                    "code": "biometrics_enforced",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Guard: duplicate active visit today (same patient + facility + access point)
        from hmis.apps.billing.models import ConsentToken as CT

        # Derive access_point from intervention codes for per-access-point dedup
        INPATIENT_PREFIXES = ("SHA-07", "SHA-19", "SHA-03", "SHA-13", "SHA-20")
        derived_access_point = "OP"
        for code in intervention_codes:
            prefix = "-".join(code.split("-")[:2])
            if prefix in INPATIENT_PREFIXES:
                derived_access_point = "IP"
                break

        now = timezone.now()
        existing_active = CT.objects.filter(
            patient=sha_member.patient,
            facility=facility,
            access_point=derived_access_point,
            status=CT.ConsentStatus.VALIDATED,
            created_at__date=date.today(),
            expires_at__gt=now,
        ).exists()
        if existing_active:
            # Reuse existing VALIDATED consent instead of blocking — idempotent.
            # PENDING consents always re-call DHA so a fresh OTP is generated.
            existing = (
                CT.objects.filter(
                    patient=sha_member.patient,
                    facility=facility,
                    access_point=derived_access_point,
                    status=CT.ConsentStatus.VALIDATED,
                    created_at__date=date.today(),
                    expires_at__gt=now,
                )
                .order_by("-created_at")
                .first()
            )
            if existing:
                response_data = {
                    "consent_id": existing.id,
                    "otp_reference": existing.otp_reference or "",
                    "status": existing.status,
                    "message": "Existing active consent for today reused",
                }
                return Response(response_data, status=status.HTTP_200_OK)

        # Derive the Client Registry ID from the SHA number
        patient_cr_id = self._sha_number_to_cr_id(sha_member.sha_number)
        if not patient_cr_id:
            return Response(
                {"error": "Cannot determine Client Registry ID for this member"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate facility has a DHA FR code configured
        facility_fr_code = resolve_fr_code(facility).value
        if not facility_fr_code:
            return Response(
                {
                    "error": (
                        "Facility does not have a DHA Facility Registry (FR) code configured. "
                        "Set it via Admin > Facilities or the SHA_FACILITY_FR_CODE environment variable."
                    ),
                    "code": "missing_fr_code",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Use the ILM lifecycle service to send OTP via /api/v1/claims/otp
        beneficiary_contact_id = serializer.validated_data.get("beneficiary_contact_id") or ""
        params = VisitOtpParams(
            intervention_codes=intervention_codes,
            patient_id=patient_cr_id,
            beneficiary_contact_id=beneficiary_contact_id,
        )

        try:
            service = IlmLifecycleService(facility=facility)
            result = service.send_visit_otp(
                params=params,
                patient=sha_member.patient,
                sha_member=sha_member,
                facility=facility,
                user=request.user,
            )

            # Extract OTP reference from ILM response
            payload = result.payload if isinstance(result.payload, dict) else {}
            otp_reference = payload.get("otp_reference") or payload.get("otpReference") or ""

            # In sandbox/UAT, DHA returns the OTP in the response message
            # e.g. {'message': 'Your OTP is 075790'}
            sandbox_otp = ""
            if os.getenv("DJANGO_ENV", "development") != "production":
                import re

                msg = payload.get("message", "")
                match = re.search(r"\b(\d{4,6})\b", msg)
                if match:
                    sandbox_otp = match.group(1)

            # Create a local ConsentToken for tracking
            from hmis.apps.billing.models import ConsentToken

            consent = ConsentToken.objects.create(
                patient=sha_member.patient,
                sha_member=sha_member,
                facility=facility,
                organization=facility.organization,
                consent_method=ConsentToken.ConsentMethod.OTP,
                otp_reference=otp_reference,
                identification_type="CR Number",
                identification_number=patient_cr_id,
                intervention_codes=intervention_codes,
                access_point=derived_access_point,
                status=ConsentToken.ConsentStatus.PENDING,
                created_by=request.user,
            )

            response_data = {
                "consent_id": consent.id,
                "otp_reference": otp_reference,
                "status": "PENDING",
                "message": "OTP sent successfully",
            }
            if sandbox_otp:
                response_data["sandbox_otp"] = sandbox_otp

            return Response(response_data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.warning("Failed to send OTP: %s", str(e))
            return Response(
                {"error": str(e), "code": "ilm_error", "details": {}},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class ConsentValidateOTPView(APIView):
    """
    Validate OTP and obtain consent token from DHA.

    POST /api/sha/consent/validate-otp/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    throttle_scope = "otp"

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="ConsentValidateOTPRequest",
            fields={
                "consent_id": serializers.IntegerField(),
                "otp_code": serializers.CharField(),
                "encrypted_pin": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="ConsentValidateOTPResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "expires_at": serializers.DateTimeField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Validate OTP and receive consent token."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.billing.sha_serializers import ValidateOTPSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ValidateOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        consent_id = serializer.validated_data["consent_id"]
        otp_code = serializer.validated_data["otp_code"]
        encrypted_pin = serializer.validated_data.get("encrypted_pin", "")

        try:
            consent = ConsentToken.objects.get(id=consent_id, facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            service = SHAConsentService(facility=facility)
            consent = service.validate_otp(
                consent=consent,
                otp_code=otp_code,
                encrypted_pin=encrypted_pin,
            )

            return Response(
                {
                    "id": consent.id,
                    "status": consent.status,
                    "consent_token": consent.consent_token,
                    "expires_at": consent.expires_at,
                    "message": "Consent validated successfully",
                },
                status=status.HTTP_200_OK,
            )
        except SHAConsentError as e:
            logger.warning("Failed to validate OTP: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ConsentDetailView(APIView):
    """
    Get consent token status.

    GET /api/sha/consent/{id}/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="ConsentDetailResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "patient": serializers.IntegerField(),
                    "sha_member": serializers.IntegerField(),
                    "consent_method": serializers.CharField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "is_valid": serializers.BooleanField(),
                    "created_at": serializers.DateTimeField(),
                    "validated_at": serializers.DateTimeField(),
                    "expires_at": serializers.DateTimeField(),
                },
            )
        },
    )
    def get(self, request, pk):
        """Retrieve consent token details."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.sha_serializers import ConsentTokenSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            consent = ConsentToken.objects.select_related("patient", "sha_member").get(
                id=pk, facility=facility
            )
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ConsentTokenSerializer(consent)
        return Response(serializer.data)


class ConsentLatestView(APIView):
    """
    Get the latest consent token for an SHA member from today.

    GET /api/sha/consent/latest/?sha_member_id=123

    Returns the most recent PENDING or VALIDATED consent token created today.
    Used by the frontend to detect if an OTP was already sent (e.g. by
    check-in automation) so the consent panel can skip to the OTP entry step.

    Returns 200 with token data if found, or 404 if no token exists today.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.sha_serializers import ConsentTokenSerializer
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context."},
                status=status.HTTP_403_FORBIDDEN,
            )

        sha_member_id = request.query_params.get("sha_member_id")
        encounter_id = request.query_params.get("encounter_id")
        intervention_code = str(request.query_params.get("intervention_code") or "").strip()
        encounter_pk = None
        if not sha_member_id:
            return Response(
                {"error": "sha_member_id query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if encounter_id not in (None, ""):
            try:
                encounter_pk = int(encounter_id)
            except (TypeError, ValueError):
                return Response(
                    {"error": "encounter_id must be an integer"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from django.db.models import Q
        from django.utils import timezone

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        base_qs = (
            ConsentToken.objects.filter(
                sha_member_id=sha_member_id,
                facility=facility,
                created_at__gte=today_start,
            )
            .filter(
                Q(status=ConsentToken.ConsentStatus.PENDING)
                | Q(
                    status=ConsentToken.ConsentStatus.VALIDATED,
                    expires_at__gt=now,
                ),
            )
            .order_by("-created_at")
        )

        if intervention_code:
            base_qs = base_qs.filter(intervention_codes__contains=[intervention_code])

        consent = None
        if encounter_pk is not None:
            consent = base_qs.filter(encounter_id=encounter_pk).first()

        # When encounter scope is provided, never fall back to another encounter.
        if encounter_pk is None and not consent:
            consent = base_qs.first()

        if not consent:
            return Response(
                {"exists": False, "message": "No consent token from today"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ConsentTokenSerializer(consent)
        return Response({**serializer.data, "exists": True})


def _persist_consent_interventions(*, patient, facility, intervention_codes: list[str]) -> None:
    """Persist interventions from consent flow to the patient's draft claim.

    Called after consent start_visit succeeds. Finds the most recent draft
    SHA claim for this patient + facility + today and attaches the
    intervention codes so the claim immediately reflects active interventions
    without waiting for a second DHA call from the ILM panel.

    Also stamps dha_visit_started_at on the claim so the frontend's
    ClaimILMPanel knows the visit was already started and avoids a
    duplicate DHA start_visit call.
    """
    if not intervention_codes or not patient:
        return
    from datetime import date

    from django.utils import timezone

    from hmis.apps.billing.models import SHAClaim, SHAClaimIntervention

    claim = (
        SHAClaim.objects.filter(
            patient=patient,
            facility=facility,
            service_date=date.today(),
            status=SHAClaim.ClaimStatus.DRAFT,
        )
        .order_by("-created_at")
        .first()
    )
    if not claim:
        return

    for code in intervention_codes:
        SHAClaimIntervention.objects.update_or_create(
            claim=claim,
            intervention_code=code,
            defaults={
                "intervention_name": "",
                "benefit_code": code.rsplit("-", 1)[0] if "-" in code else "",
                "status": "active",
            },
        )

    # Stamp the claim so the frontend knows a visit was started via consent
    # and the ILM panel won't try a second (duplicate) DHA start_visit.
    if not claim.dha_visit_started_at:
        claim.dha_visit_started_at = timezone.now()
        claim.save(update_fields=["dha_visit_started_at"])


class StartVisitView(APIView):
    """
    Start a visit with DHA (combined OTP validation + visit start).

    POST /api/sha/consent/start-visit/

    This calls DHA's POST /api/v1/claims/visit which takes the raw OTP,
    validates it, and starts the visit session in a single call.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="StartVisitRequest",
            fields={
                "consent_id": serializers.IntegerField(
                    help_text="ConsentToken ID (from send-otp step)"
                ),
                "otp_code": serializers.CharField(help_text="OTP code entered by patient"),
                "intervention_codes": serializers.ListField(
                    child=serializers.CharField(),
                    required=False,
                    help_text="SHA intervention codes for this visit",
                ),
                "service_type": serializers.CharField(
                    required=False,
                    help_text="outpatient, inpatient, or emergency",
                ),
                "admission_date": serializers.CharField(
                    required=False, help_text="ISO date (defaults to today)"
                ),
                "estimated_days_of_admission": serializers.IntegerField(
                    required=False, help_text="Expected length of stay in days"
                ),
                "encounter_id": serializers.IntegerField(
                    required=False,
                    help_text="Encounter ID to link consent token to (from check-in)",
                ),
            },
        ),
        responses={
            200: inline_serializer(
                name="StartVisitResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "expires_at": serializers.DateTimeField(allow_null=True),
                    "visit_data": serializers.DictField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Start a visit by validating OTP or biometric auth_guid + creating visit session with DHA."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        consent_id = request.data.get("consent_id")
        otp_code = request.data.get("otp_code", "")
        auth_guid = request.data.get("auth_guid", "")
        intervention_codes = request.data.get("intervention_codes") or []
        service_type = request.data.get("service_type", "outpatient") or "outpatient"
        admission_date = request.data.get("admission_date", "")
        estimated_days = request.data.get("estimated_days_of_admission", 0)
        encounter_id = request.data.get("encounter_id")

        if not consent_id:
            return Response(
                {"error": "consent_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not otp_code and not auth_guid:
            return Response(
                {"error": "Either otp_code or auth_guid is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if otp_code and auth_guid:
            return Response(
                {"error": "Provide either otp_code or auth_guid, not both"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            consent = ConsentToken.objects.get(id=consent_id, facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Fall back to the intervention codes stored on the consent token
        # during send-otp if the request doesn't include them.
        if not intervention_codes and consent.intervention_codes:
            intervention_codes = consent.intervention_codes

        # ---- PHC pre-flight guards ----
        # Guard: deceased patient
        if consent.patient and consent.patient.is_deceased:
            return Response(
                {"error": "Cannot start visit for a deceased patient.", "code": "patient_deceased"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Guard: one capitation claim per patient per day per facility
        from hmis.apps.billing.models import SHAClaim

        existing_capitation_today = (
            SHAClaim.objects.filter(
                patient=consent.patient,
                facility=facility,
                service_date=date.today(),
                claim_flow=SHAClaim.ClaimFlow.PHC,
            )
            .exclude(
                status__in=["cancelled", "written_off"],
            )
            .exists()
        )
        if existing_capitation_today:
            return Response(
                {
                    "error": "This patient already has a capitation claim today at this facility. Only one per day is allowed.",
                    "code": "duplicate_capitation_claim",
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Guard: check bed availability for inpatient visits
        if service_type.upper() == "INPATIENT":
            from hmis.apps.inpatient.models import Ward

            wards_with_beds = Ward.objects.filter(facility=facility, is_active=True)
            total_available = sum(w.available_beds for w in wards_with_beds)
            if total_available == 0:
                return Response(
                    {
                        "error": "No beds available at this facility for inpatient admission.",
                        "code": "no_beds_available",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        # Guard: check if patient already has an active admission (inpatient)
        if service_type.upper() == "INPATIENT" and consent.patient:
            from hmis.apps.inpatient.models import Admission

            active_admission = Admission.objects.filter(
                patient=consent.patient,
                admission_status="ACTIVE",
            ).exists()
            if active_admission:
                return Response(
                    {
                        "error": "Patient already has an active inpatient admission. Discharge or transfer first.",
                        "code": "active_admission_exists",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        # Resolve encounter if provided (links consent token to encounter)
        encounter = None
        if encounter_id:
            import contextlib

            from hmis.apps.encounters.models import Encounter

            with contextlib.suppress(Encounter.DoesNotExist):
                encounter = Encounter.objects.get(id=encounter_id, facility=facility)

        try:
            service = SHAConsentService(facility=facility)
            visit_data = service.start_visit(
                consent=consent,
                otp_code=otp_code,
                auth_guid=auth_guid,
                intervention_codes=intervention_codes,
                service_type=service_type,
                admission_date=admission_date,
                estimated_days_of_admission=int(estimated_days),
                encounter=encounter,
            )

            consent.refresh_from_db()

            # Persist intervention codes to the patient's draft claim for
            # today (auto-created by the billing agent or encounter signal).
            # This ensures the claim reflects the interventions selected during
            # consent even if the ILM panel's auto-open visit call fails
            # (e.g. duplicate DHA start_visit).
            if intervention_codes:
                _persist_consent_interventions(
                    patient=consent.patient,
                    facility=facility,
                    intervention_codes=intervention_codes,
                )

            return Response(
                {
                    "id": consent.id,
                    "status": consent.status,
                    "consent_token": consent.consent_token,
                    "expires_at": consent.expires_at,
                    "visit_data": visit_data,
                    "message": "Visit started successfully",
                },
                status=status.HTTP_200_OK,
            )
        except SHAConsentError as e:
            logger.warning("Failed to start visit: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BiometricAuthorizeView(APIView):
    """
    Initiate biometric fingerprint authorization via DHA HIE.

    POST /api/sha/consent/authorize/

    Returns auth_guid and iframe_url for rendering the biometric capture UI.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="BiometricAuthorizeRequest",
            fields={
                "sha_member_id": serializers.IntegerField(help_text="SHA Member ID to authorize"),
                "workstation_id": serializers.CharField(
                    help_text="Hardware Server workstation identifier"
                ),
                "agent_national_id": serializers.CharField(
                    help_text="National ID of the biometrics agent (staff)"
                ),
            },
        ),
        responses={
            200: inline_serializer(
                name="BiometricAuthorizeResponse",
                fields={
                    "consent_id": serializers.IntegerField(),
                    "auth_guid": serializers.CharField(),
                    "iframe_url": serializers.CharField(),
                    "status": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Initiate biometric authorization for patient consent."""
        from hmis.apps.billing.models import SHAMember
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        sha_member_id = request.data.get("sha_member_id")
        workstation_id = request.data.get("workstation_id", "")
        agent_national_id = request.data.get("agent_national_id", "")

        # In sandbox/UAT, auto-fill agent_national_id for dev convenience
        if not agent_national_id:
            agent_national_id = getattr(facility, "biometrics_agent_national_id", "") or ""
            # Detect decryption failure: encrypted data exists but property returned empty
            if not agent_national_id and facility.biometrics_agent_national_id_encrypted:
                logger.error(
                    "PII decryption failure for Facility %s (pk=%s) — "
                    "biometrics_agent_national_id_encrypted has data but property returned empty. "
                    "Check ENCRYPTION_KEY consistency.",
                    facility.name,
                    facility.pk,
                    extra={
                        "facility_id": facility.pk,
                        "facility_name": facility.name,
                        "pii_field": "biometrics_agent_national_id",
                    },
                )
                return Response(
                    {
                        "error": (
                            "Facility biometrics configuration error: stored data cannot be "
                            "decrypted. Contact system administrator to verify the encryption key."
                        ),
                        "code": "pii_decryption_failed",
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        if not agent_national_id and os.getenv("DJANGO_ENV", "development") != "production":
            agent_national_id = "12345678"

        if not sha_member_id:
            return Response(
                {"error": "sha_member_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not workstation_id:
            return Response(
                {"error": "workstation_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not agent_national_id:
            return Response(
                {"error": "agent_national_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sha_member = SHAMember.objects.get(id=sha_member_id)
        except SHAMember.DoesNotExist:
            return Response(
                {"error": "SHA member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            service = SHAConsentService(facility=facility)
            result = service.authorize_biometric(
                sha_member=sha_member,
                workstation_id=workstation_id,
                agent_national_id=agent_national_id,
                user=request.user,
                facility=facility,
            )
            return Response(result, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Biometric authorization failed: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BiometricAuthorizeStatusView(APIView):
    """
    Poll biometric authorization status.

    GET /api/sha/consent/authorize/{auth_guid}/status/

    Returns current status of the biometric fingerprint verification.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="BiometricAuthorizeStatusResponse",
                fields={
                    "auth_guid": serializers.CharField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                },
            )
        },
    )
    def get(self, request, auth_guid):
        """Check biometric authorization status."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)

        try:
            service = SHAConsentService(facility=facility)
            result = service.get_authorization_status(auth_guid)
            return Response(result, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Biometric status check failed: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BiometricCancelView(APIView):
    """
    Cancel a pending biometric authorization.

    POST /api/sha/consent/authorize/{auth_guid}/cancel/

    Used when the iframe expires (10-min window) or the user wants to abort.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="BiometricCancelResponse",
                fields={
                    "auth_guid": serializers.CharField(),
                    "status": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request, auth_guid):
        """Cancel a pending biometric authorization."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)

        try:
            service = SHAConsentService(facility=facility)
            result = service.cancel_authorization(auth_guid)
            return Response(result, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Biometric cancel failed: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BeneficiaryContactsView(APIView):
    """
    Retrieve masked beneficiary contacts from DHA HIE.

    GET /api/sha/consent/contacts/?beneficiary_cr_id=...

    Returns a list of registered contacts with masked phone numbers.
    The user selects which contact to send the OTP to.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    @extend_schema(
        parameters=[
            {
                "name": "beneficiary_cr_id",
                "in": "query",
                "required": True,
                "schema": {"type": "string"},
                "description": "Patient's Client Registry ID",
            }
        ],
        responses={
            200: inline_serializer(
                name="BeneficiaryContactsResponse",
                fields={
                    "contacts": serializers.ListField(
                        child=serializers.DictField(),
                        help_text="List of contacts with masked values and IDs",
                    ),
                },
            )
        },
    )
    def get(self, request):
        """Retrieve beneficiary contacts for OTP target selection."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)

        beneficiary_cr_id = request.query_params.get("beneficiary_cr_id", "")
        if not beneficiary_cr_id:
            return Response(
                {"error": "beneficiary_cr_id query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAConsentService(facility=facility)
            contacts = service.get_beneficiary_contacts(beneficiary_cr_id)
            return Response({"contacts": contacts}, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Failed to fetch beneficiary contacts: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )


class PreauthSubmitView(APIView):
    """
    Submit pre-authorization request to DHA.

    POST /api/sha/preauth/submit/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="PreauthSubmitRequest",
            fields={
                "claim_id": serializers.IntegerField(),
                "consent_token_id": serializers.IntegerField(),
                "procedure_code": serializers.CharField(),
                "diagnosis_codes": serializers.ListField(),
                "estimated_cost": serializers.DecimalField(max_digits=12, decimal_places=2),
                "scheduled_date": serializers.DateField(),
                "clinical_notes": serializers.CharField(required=False),
            },
        ),
        responses={
            201: inline_serializer(
                name="PreauthSubmitResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "preauth_reference": serializers.CharField(),
                    "decision": serializers.CharField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Submit pre-authorization request."""
        from hmis.apps.billing.models import ConsentToken, PreauthRequest, SHAClaim
        from hmis.apps.billing.services.sha_preauth import SHAPreauthError, SHAPreauthService
        from hmis.apps.billing.sha_serializers import SubmitPreauthSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SubmitPreauthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Validate references — scoped to facility
        try:
            claim = SHAClaim.objects.select_related("patient", "sha_member").get(
                id=data["claim_id"], facility=facility
            )
        except SHAClaim.DoesNotExist:
            return Response(
                {"error": "SHA claim not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            consent = ConsentToken.objects.get(id=data["consent_token_id"], facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not consent.is_valid:
            return Response(
                {"error": "Consent token is expired or invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAPreauthService()
            preauth = service.submit_preauth(
                claim=claim,
                consent=consent,
                procedure_code=data["procedure_code"],
                diagnosis_codes=data["diagnosis_codes"],
                estimated_cost=data["estimated_cost"],
                scheduled_date=data["scheduled_date"],
                clinical_notes=data.get("clinical_notes", ""),
                user=request.user,
            )

            return Response(
                {
                    "id": preauth.id,
                    "preauth_reference": preauth.preauth_reference,
                    "decision": preauth.decision,
                    "message": "Pre-authorization submitted successfully",
                },
                status=status.HTTP_201_CREATED,
            )
        except SHAPreauthError as e:
            logger.warning("Failed to submit preauth: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class PreauthStatusView(APIView):
    """
    Check pre-authorization status.

    GET /api/sha/preauth/{id}/status/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="PreauthStatusResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "preauth_reference": serializers.CharField(),
                    "decision": serializers.CharField(),
                    "approved_amount": serializers.DecimalField(max_digits=12, decimal_places=2),
                    "valid_until": serializers.DateField(),
                    "is_valid": serializers.BooleanField(),
                    "poll_count": serializers.IntegerField(),
                },
            )
        },
    )
    def get(self, request, pk):
        """Retrieve pre-authorization status."""
        from hmis.apps.billing.models import PreauthRequest
        from hmis.apps.billing.sha_serializers import PreauthRequestSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            preauth = PreauthRequest.objects.select_related("patient", "sha_member", "claim").get(
                id=pk, facility=facility
            )
        except PreauthRequest.DoesNotExist:
            return Response(
                {"error": "Pre-authorization request not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PreauthRequestSerializer(preauth)
        return Response(serializer.data)


class PreauthPendingListView(APIView):
    """
    List pending pre-authorization requests for the facility.

    GET /api/sha/preauth/pending/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="PreauthPendingListResponse",
                fields={
                    "count": serializers.IntegerField(),
                    "results": serializers.ListField(),
                },
            )
        },
    )
    def get(self, request):
        """List all pending preauth requests for the current facility."""
        from hmis.apps.billing.models import PreauthRequest
        from hmis.apps.billing.sha_serializers import PreauthRequestSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        preauths = (
            PreauthRequest.objects.filter(
                decision=PreauthRequest.PreauthDecision.PENDING,
                facility=facility,
            )
            .select_related("patient", "sha_member", "claim")
            .order_by("-created_at")
        )

        serializer = PreauthRequestSerializer(preauths, many=True)
        return Response(
            {
                "count": preauths.count(),
                "results": serializer.data,
            }
        )


# =============================================================================
# SHA Remittance ViewSet
# =============================================================================


class SHARemittanceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    SHA Remittance management.

    GET /api/sha/remittances/          → list remittances
    GET /api/sha/remittances/{id}/     → remittance detail
    GET /api/sha/remittances/{id}/claims/ → claims paid by this remittance
    POST /api/sha/remittances/fetch/   → trigger DHA fetch
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get_queryset(self):
        from hmis.apps.billing.models import SHARemittance
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(self.request)
        facility = getattr(self.request, "facility", None)
        if not facility:
            return SHARemittance.objects.none()
        return SHARemittance.objects.filter(facility=facility).order_by("-payment_date")

    def get_serializer_class(self):
        from hmis.apps.billing.sha_serializers import (
            SHARemittanceLineSerializer,
            SHARemittanceSerializer,
        )

        if self.action == "claims":
            return SHARemittanceLineSerializer
        return SHARemittanceSerializer

    @action(detail=True, methods=["get"])
    def claims(self, request, pk=None):
        """Get claims paid by this remittance."""
        from hmis.apps.billing.models import SHARemittanceLine

        remittance = self.get_object()
        lines = SHARemittanceLine.objects.filter(remittance=remittance).select_related("claim")
        serializer = self.get_serializer(lines, many=True)
        return Response({"count": lines.count(), "results": serializer.data})

    @action(detail=False, methods=["post"])
    def fetch(self, request):
        """Trigger a fetch of remittances from DHA for the current facility."""
        from hmis.apps.billing.services.sha_remittance import (
            SHARemittanceError,
            SHARemittanceService,
        )
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context"},
                status=status.HTTP_403_FORBIDDEN,
            )

        facility_code = getattr(facility, "facility_code", "") or ""
        if not facility_code:
            return Response(
                {"error": "Facility has no MFL code configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHARemittanceService()
            remittances = service.fetch_remittances(facility_code=facility_code, facility=facility)
            # Fetch claims for received remittances
            for remittance in remittances:
                if remittance.status in ("received", "partial"):
                    service.fetch_claims_paid(remittance, facility_code)

            return Response(
                {
                    "message": f"Fetched {len(remittances)} remittance(s) from DHA",
                    "count": len(remittances),
                }
            )
        except SHARemittanceError as e:
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )


class CapitationValidationView(APIView):
    """
    Pre-flight validation for PHC/capitation claims.

    Checks whether the current facility is the patient's selected outpatient
    provider before submitting a capitation claim to DHA. This prevents
    wasted API calls and gives clinicians early feedback.

    POST /api/billing/capitation/validate/
    {
        "sha_member_id": 123,
        "claim_id": 456  (optional — uses claim's facility if provided)
    }
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name="CapitationValidationRequest",
            fields={
                "sha_member_id": serializers.IntegerField(required=True),
                "claim_id": serializers.IntegerField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="CapitationValidationResponse",
                fields={
                    "is_valid": serializers.BooleanField(),
                    "warning": serializers.CharField(allow_blank=True),
                    "blocking": serializers.BooleanField(),
                    "details": serializers.DictField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """Validate capitation provider selection."""
        from hmis.apps.billing.services.capitation_validation import validate_capitation_provider

        sha_member_id = request.data.get("sha_member_id")
        claim_id = request.data.get("claim_id")

        if not sha_member_id:
            return Response(
                {"error": "sha_member_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sha_member = SHAMember.objects.select_related("patient").get(pk=sha_member_id)
        except SHAMember.DoesNotExist:
            return Response(
                {"error": "SHA member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Determine facility: from claim or from user's active facility
        facility = None
        if claim_id:
            try:
                claim = SHAClaim.objects.select_related("facility").get(pk=claim_id)
                facility = claim.facility
            except SHAClaim.DoesNotExist:
                pass

        if not facility:
            # Fall back to user's current facility
            staff_profile = getattr(request.user, "staff_profile", None)
            if staff_profile:
                facility = getattr(staff_profile, "primary_facility", None)

        if not facility:
            return Response(
                {
                    "error": "Could not determine facility. Provide claim_id or ensure user has a primary facility."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = validate_capitation_provider(sha_member, facility)

        return Response(
            {
                "is_valid": result.is_valid,
                "warning": result.warning,
                "blocking": result.blocking,
                "details": result.details,
            },
            status=status.HTTP_200_OK,
        )


class CapitationValidateDirectView(APIView):
    """
    Pre-flight capitation provider validation using raw eligibility response.

    Unlike CapitationValidationView (which requires a local SHAMember record),
    this endpoint accepts the raw eligibility response from a direct check.
    Useful on the patient lookup page BEFORE registration to warn staff that
    the patient's capitation provider doesn't match this facility.

    POST /api/billing/capitation/validate-direct/
    {
        "eligibility_response": { ... raw DirectEligibilityCheckResponse ... }
    }
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name="CapitationValidateDirectRequest",
            fields={
                "eligibility_response": serializers.DictField(required=True),
            },
        ),
        responses={
            200: inline_serializer(
                name="CapitationValidateDirectResponse",
                fields={
                    "is_valid": serializers.BooleanField(),
                    "warning": serializers.CharField(allow_blank=True),
                    "blocking": serializers.BooleanField(),
                    "details": serializers.DictField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """Validate capitation provider using raw eligibility data."""
        from hmis.apps.billing.services.capitation_validation import (
            CapitationValidationResult,
            _extract_provider_code,
            _get_facility_codes,
        )

        eligibility_response = request.data.get("eligibility_response")
        if not eligibility_response or not isinstance(eligibility_response, dict):
            return Response(
                {"error": "eligibility_response dict is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve user's facility
        staff_profile = getattr(request.user, "staff_profile", None)
        facility = getattr(staff_profile, "primary_facility", None) if staff_profile else None

        if not facility:
            return Response(
                {"error": "Could not determine your facility."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract provider code from the raw eligibility response
        provider_code = _extract_provider_code(eligibility_response)

        if not provider_code:
            # No provider selection data — can't validate, pass through
            result = CapitationValidationResult(is_valid=True)
        else:
            facility_codes = _get_facility_codes(facility)
            if provider_code.upper() in {c.upper() for c in facility_codes if c}:
                result = CapitationValidationResult(
                    is_valid=True,
                    details={"matched_code": provider_code},
                )
            else:
                result = CapitationValidationResult(
                    is_valid=False,
                    warning=(
                        f"Patient's selected outpatient provider ({provider_code}) "
                        f"does not match this facility. If you register and treat "
                        f"this patient under capitation (PHC), the claim may be "
                        f"rejected by SHA."
                    ),
                    blocking=False,
                    details={
                        "patient_provider_code": provider_code,
                        "facility_codes": facility_codes,
                    },
                )

        return Response(
            {
                "is_valid": result.is_valid,
                "warning": result.warning,
                "blocking": result.blocking,
                "details": result.details,
            },
            status=status.HTTP_200_OK,
        )
