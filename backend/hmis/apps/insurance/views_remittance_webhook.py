# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402
"""Insurance views remittance webhook for Vitora HMIS.

What this file is for:
- Implement views remittance webhook logic for the insurance domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
import re

from django.core.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from hmis.apps.core.openapi import SchemaFallbackSerializer
from hmis.apps.insurance.filters import PayerTariffFilter
from hmis.apps.insurance.models import (
    InsuranceExternalSync,
    InsuranceRemittance,
    InsuranceRemittanceLine,
    PatientInsurance,
    PayerTariff,
)
from hmis.apps.insurance.serializers import (
    InsuranceRemittanceCreateSerializer,
    InsuranceRemittanceLineSerializer,
    InsuranceRemittanceSerializer,
    PayerTariffCreateSerializer,
    PayerTariffSerializer,
)
from hmis.apps.insurance.services.insurance_services import HealthCloudWorkflowService

logger = logging.getLogger(__name__)


from hmis.apps.insurance.views_claims import *  # noqa: F403
from hmis.apps.insurance.views_core import *  # noqa: F403
from hmis.apps.insurance.views_core import _insurance_error_response, _insurance_handled_exceptions


class InsuranceRemittanceViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD for insurance remittances (facility-scoped)."""

    queryset = (
        InsuranceRemittance.objects.select_related("provider")
        .prefetch_related("lines", "lines__claim")
        .all()
    )
    audit_resource_type = "InsuranceRemittance"
    audit_action_prefix = "insurance.remittance"
    audit_source = "insurance_api"

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy", "reconcile"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    tenant_scope = "facility"
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["provider", "status"]
    ordering_fields = ["remittance_date", "total_amount"]
    ordering = ["-remittance_date"]

    def get_serializer_class(self):
        if self.action == "create":
            return InsuranceRemittanceCreateSerializer
        return InsuranceRemittanceSerializer

    @action(detail=True, methods=["post"])
    def reconcile(self, request, pk=None):
        remittance = self.get_object()
        try:
            remittance.reconcile()
        except ValidationError as exc:
            messages = list(exc.messages)
            return Response(
                {"error": str(messages[0]) if messages else "Unable to reconcile remittance."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(InsuranceRemittanceSerializer(remittance).data)

    @action(detail=True, methods=["get"], url_path="claims-drilldown")
    def claims_drilldown(self, request, pk=None):
        remittance = self.get_object()
        service = HealthCloudWorkflowService()
        try:
            payload = service.get_remittance_claims(
                remittance=remittance,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="claims_drilldown", exc=exc)

        refreshed = (
            InsuranceRemittance.objects.select_related("provider")
            .prefetch_related("lines")
            .get(pk=remittance.pk)
        )
        return Response(
            {
                "remittance": InsuranceRemittanceSerializer(refreshed).data,
                "drilldown": payload,
            }
        )

    @action(detail=False, methods=["get"], url_path="healthcloud-sync-status")
    def healthcloud_sync_status(self, request):
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return Response({"error": "No facility context"}, status=status.HTTP_400_BAD_REQUEST)

        sync_qs = InsuranceExternalSync.objects.filter(facility=facility)
        remittances_qs = self.get_queryset()
        pending_sync = sync_qs.filter(status=InsuranceExternalSync.Status.PENDING).count()
        failed_sync = sync_qs.filter(status=InsuranceExternalSync.Status.FAILED).count()
        success_sync = sync_qs.filter(status=InsuranceExternalSync.Status.SUCCESS).count()

        include_failures_raw = str(request.query_params.get("include_failures", "")).strip().lower()
        include_failures = include_failures_raw in {"1", "true", "yes"}
        include_sync_items_raw = (
            str(request.query_params.get("include_sync_items", "")).strip().lower()
        )
        include_sync_items = include_sync_items_raw in {"1", "true", "yes"}
        include_remittance_items_raw = (
            str(request.query_params.get("include_remittance_items", "")).strip().lower()
        )
        include_remittance_items = include_remittance_items_raw in {"1", "true", "yes"}
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))

        def _strip_html(value: str) -> str:
            no_tags = re.sub(r"<[^>]+>", " ", value)
            return re.sub(r"\s+", " ", no_tags).strip()

        def _clean_error(value: str) -> str:
            text = str(value or "").strip()
            if not text:
                return "Unknown sync failure"
            if "<" in text and ">" in text:
                text = _strip_html(text)
            return text[:300]

        def _bucket_failure(error_message: str) -> tuple[str, str]:
            lower = error_message.lower()
            if "timeout" in lower or "transport" in lower:
                return ("transport_timeout", "Transport/Timeout")
            if "http 401" in lower or "http 403" in lower or "unauthorized" in lower:
                return ("auth", "Authentication/Authorization")
            if "http 404" in lower and "claim_remittance" in lower:
                return ("contract_mismatch", "Contract Mismatch")
            if "http 404" in lower:
                return ("not_found", "Not Found")
            if "http 400" in lower or "http 422" in lower or "validation" in lower:
                return ("validation", "Validation")
            if "http 5" in lower:
                return ("upstream_server", "Upstream Server")
            return ("unknown", "Unknown")

        payload = {
            "facility_id": facility.pk,
            "sync": {
                "pending": pending_sync,
                "failed": failed_sync,
                "success": success_sync,
                "total": sync_qs.count(),
            },
            "remittances": {
                "total": remittances_qs.count(),
                "received": remittances_qs.filter(
                    status=InsuranceRemittance.Status.RECEIVED
                ).count(),
                "partial": remittances_qs.filter(status=InsuranceRemittance.Status.PARTIAL).count(),
                "reconciled": remittances_qs.filter(
                    status=InsuranceRemittance.Status.RECONCILED
                ).count(),
                "disputed": remittances_qs.filter(
                    status=InsuranceRemittance.Status.DISPUTED
                ).count(),
            },
        }

        if include_failures:
            failed_entries = list(
                sync_qs.filter(status=InsuranceExternalSync.Status.FAILED)
                .select_related("claim", "preauth", "authorization")
                .order_by("-updated_at")[:limit]
            )
            failed_items = []
            buckets: dict[str, dict[str, int | str]] = {}

            for item in failed_entries:
                message = _clean_error(item.last_error)
                bucket_code, bucket_label = _bucket_failure(message)
                if bucket_code not in buckets:
                    buckets[bucket_code] = {
                        "code": bucket_code,
                        "label": bucket_label,
                        "count": 0,
                    }
                buckets[bucket_code]["count"] = int(buckets[bucket_code]["count"]) + 1

                failed_items.append(
                    {
                        "id": item.id,
                        "operation": item.operation,
                        "status": item.status,
                        "attempt_count": item.attempt_count,
                        "claim_id": item.claim_id,
                        "claim_number": item.claim.claim_number if item.claim_id else "",
                        "preauth_id": item.preauth_id,
                        "authorization_id": item.authorization_id,
                        "correlation_id": item.correlation_id,
                        "error": message,
                        "bucket": {
                            "code": bucket_code,
                            "label": bucket_label,
                        },
                        "created_at": item.created_at,
                        "updated_at": item.updated_at,
                    }
                )

            payload["failed_items"] = failed_items
            payload["failure_buckets"] = sorted(
                buckets.values(),
                key=lambda entry: int(entry["count"]),
                reverse=True,
            )

        if include_sync_items:
            sync_items = []
            for item in sync_qs.select_related("claim", "preauth", "authorization").order_by(
                "-updated_at"
            )[:limit]:
                message = _clean_error(item.last_error)
                bucket_code, bucket_label = _bucket_failure(message)
                sync_items.append(
                    {
                        "id": item.id,
                        "operation": item.operation,
                        "status": item.status,
                        "attempt_count": item.attempt_count,
                        "claim_id": item.claim_id,
                        "claim_number": item.claim.claim_number if item.claim_id else "",
                        "preauth_id": item.preauth_id,
                        "authorization_id": item.authorization_id,
                        "correlation_id": item.correlation_id,
                        "error": message,
                        "bucket": {
                            "code": bucket_code,
                            "label": bucket_label,
                        },
                        "created_at": item.created_at,
                        "updated_at": item.updated_at,
                    }
                )
            payload["sync_items"] = sync_items

        if include_remittance_items:
            remittance_items = []
            for item in remittances_qs.select_related("provider").order_by("-remittance_date")[
                :limit
            ]:
                remittance_items.append(
                    {
                        "id": item.id,
                        "remittance_number": item.remittance_number,
                        "provider_id": item.provider_id,
                        "provider_name": item.provider.name if item.provider_id else "",
                        "status": item.status,
                        "total_amount": str(item.total_amount),
                        "reconciled_amount": str(item.reconciled_amount),
                        "payment_reference": item.payment_reference,
                        "bank_reference": item.bank_reference,
                        "remittance_date": item.remittance_date,
                        "updated_at": item.updated_at,
                    }
                )
            payload["remittance_items"] = remittance_items

        return Response(payload)


# ---------------------------------------------------------------------------
# InsuranceRemittanceLine
# ---------------------------------------------------------------------------
class InsuranceRemittanceLineViewSet(AuditedMutationMixin, viewsets.ModelViewSet):
    """CRUD for remittance lines (nested under remittance)."""

    queryset = InsuranceRemittanceLine.objects.select_related("claim").all()
    audit_resource_type = "InsuranceRemittanceLine"
    audit_action_prefix = "insurance.remittance_line"
    audit_source = "insurance_api"
    serializer_class = InsuranceRemittanceLineSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return self.queryset.filter(remittance_id=self.kwargs.get("remittance_pk"))

    def perform_create(self, serializer):
        serializer.save(remittance_id=self.kwargs.get("remittance_pk"))


# ---------------------------------------------------------------------------
# PayerTariff
# ---------------------------------------------------------------------------
class PayerTariffViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD for payer tariff mappings (org-scoped)."""

    queryset = PayerTariff.objects.select_related("provider", "plan", "service").all()
    audit_resource_type = "PayerTariff"
    audit_action_prefix = "insurance.payer_tariff"
    audit_source = "insurance_api"

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    tenant_scope = "organization"
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PayerTariffFilter
    search_fields = ["service_code", "payer_code", "payer_description"]
    ordering_fields = ["provider", "service_code", "tariff_amount"]
    ordering = ["provider", "service_code"]

    def get_serializer_class(self):
        if self.action == "create":
            return PayerTariffCreateSerializer
        return PayerTariffSerializer


class HealthCloudHealthIdWebhookView(APIView):
    """Receive optional HealthCloud webhook callback for health ID assignment.

    Endpoint:
        POST /api/insurance/healthcloud/webhooks/health-id/

    Expected body (flexible):
        {
          "profile_id": "uuid-or-local-id",
          "health_id": "1234010000000013"
        }
    """

    permission_classes = [AllowAny]

    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}

    @staticmethod
    def _resolve_enrollment(profile_id: str):
        profile_id = str(profile_id or "").strip()
        if not profile_id:
            return None

        if profile_id.isdigit():
            return PatientInsurance.objects.filter(pk=int(profile_id)).first()

        return (
            PatientInsurance.objects.filter(
                last_eligibility_payload__health_identity__profile_request_id=profile_id
            ).first()
            or PatientInsurance.objects.filter(
                last_eligibility_payload__health_identity__profile_id=profile_id
            ).first()
        )

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        profile_id = str(payload.get("profile_id") or payload.get("id") or "").strip()
        health_id = str(payload.get("health_id") or "").strip()

        if not profile_id:
            return Response(
                {"error": "profile_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enrollment = self._resolve_enrollment(profile_id)
        if enrollment is None:
            return Response(
                {"error": "Enrollment not found for profile_id", "profile_id": profile_id},
                status=status.HTTP_404_NOT_FOUND,
            )

        workflow_service = HealthCloudWorkflowService()
        workflow_service._merge_health_identity_snapshot(
            enrollment,
            health_id_response={
                "profile_id": profile_id,
                "health_id": health_id,
                "webhook_payload": payload,
            },
        )

        return Response(
            {
                "status": "ok",
                "profile_id": profile_id,
                "health_id": health_id,
                "enrollment_id": enrollment.pk,
            }
        )
