# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402
"""Insurance views claims for Vitora HMIS.

What this file is for:
- Implement views claims logic for the insurance domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import json
import logging
import re
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import ReadRequiresModelPermission, RequiresActiveShiftPermission
from hmis.apps.insurance.filters import InsuranceClaimFilter, InsurancePreauthFilter
from hmis.apps.insurance.models import (
    InsuranceBalanceReservation,
    InsuranceClaim,
    InsuranceClaimItem,
    InsurancePreauth,
    InsuranceProviderConfig,
    InsuranceVisitAuthorization,
)
from hmis.apps.insurance.serializers import (
    InsuranceClaimAppealSerializer,
    InsuranceClaimApproveSerializer,
    InsuranceClaimCancelSerializer,
    InsuranceClaimCreateSerializer,
    InsuranceClaimItemSerializer,
    InsuranceClaimPaySerializer,
    InsuranceClaimQueryResponseSerializer,
    InsuranceClaimQuerySerializer,
    InsuranceClaimRejectSerializer,
    InsuranceClaimSerializer,
    InsuranceClaimSubmitSerializer,
    InsurancePreauthApproveSerializer,
    InsurancePreauthCancelSerializer,
    InsurancePreauthCreateSerializer,
    InsurancePreauthDenySerializer,
    InsurancePreauthSerializer,
    InsuranceProviderConfigSerializer,
    InsuranceVisitAuthorizationSerializer,
    ReserveBalanceSerializer,
    SubmitCreditNoteSerializer,
    SubmitInvoiceSerializer,
    UploadClaimAttachmentSerializer,
    ValidateAuthorizationSerializer,
)
from hmis.apps.insurance.services.errors import InsuranceApiError
from hmis.apps.insurance.services.insurance_services import (
    HealthCloudWorkflowService,
    InsurancePreauthService,
)

logger = logging.getLogger(__name__)


from hmis.apps.insurance.views_core import *  # noqa: F403
from hmis.apps.insurance.views_core import _insurance_error_response, _insurance_handled_exceptions


class InsuranceProviderConfigViewSet(
    ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet
):
    """CRUD for per-facility provider configs (facility-scoped)."""

    queryset = InsuranceProviderConfig.objects.select_related("provider", "facility").all()
    serializer_class = InsuranceProviderConfigSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    tenant_scope = "facility"
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["provider", "accreditation_status", "api_enabled"]


class InsuranceVisitAuthorizationViewSet(
    ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet
):
    """Read and validate HealthCloud visit authorizations (facility-scoped)."""

    queryset = InsuranceVisitAuthorization.objects.select_related(
        "enrollment",
        "provider_config",
        "patient",
        "encounter",
    ).all()
    serializer_class = InsuranceVisitAuthorizationSerializer
    tenant_scope = "facility"
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "enrollment", "patient", "provider_config"]
    ordering = ["-created_at"]
    ordering_fields = ["created_at", "updated_at"]

    def get_permissions(self):
        return [IsAuthenticated()]

    def _ensure_healthcloud_enabled(self, authorization: InsuranceVisitAuthorization):
        cfg = authorization.provider_config
        if not cfg.api_enabled or not cfg.healthcloud_enabled:
            raise ValidationError(
                "HealthCloud is not enabled for this provider/facility configuration."
            )

    @action(detail=True, methods=["post"], url_path="validate-token")
    def validate_token(self, request, pk=None):
        authorization = self.get_object()
        try:
            self._ensure_healthcloud_enabled(authorization)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ValidateAuthorizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = HealthCloudWorkflowService()
        try:
            response = service.validate_authorization(
                authorization=authorization,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                payload=serializer.validated_data,
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="validate_token", exc=exc)
        return Response(response)


# ---------------------------------------------------------------------------
# InsuranceClaim
# ---------------------------------------------------------------------------
class InsuranceClaimViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD + lifecycle for insurance claims (facility-scoped)."""

    queryset = (
        InsuranceClaim.objects.select_related(
            "provider",
            "patient",
            "patient_insurance",
            "patient_insurance__plan",
            "invoice",
            "encounter",
            "preauth",
        )
        .prefetch_related("items")
        .all()
    )
    audit_resource_type = "InsuranceClaim"
    audit_action_prefix = "insurance.claim"
    audit_source = "insurance_api"
    tenant_scope = "facility"

    # -- Adjudication actions require admin; clinical ops require active shift --
    _admin_actions = frozenset(
        {
            "approve",
            "partially_approve",
            "reject",
            "query_claim",
            "mark_paid",
            "write_off",
        }
    )

    def get_permissions(self):
        if self.action in self._admin_actions:
            return [IsAdminUser()]
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), RequiresActiveShiftPermission()]
        return [IsAuthenticated()]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = InsuranceClaimFilter
    search_fields = ["claim_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["created_at", "submission_date", "total_amount"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return InsuranceClaimCreateSerializer
        if self.action == "submit":
            return InsuranceClaimSubmitSerializer
        if self.action in ("approve", "partially_approve"):
            return InsuranceClaimApproveSerializer
        if self.action == "reject":
            return InsuranceClaimRejectSerializer
        if self.action == "query_claim":
            return InsuranceClaimQuerySerializer
        if self.action == "respond_to_query":
            return InsuranceClaimQueryResponseSerializer
        if self.action == "mark_paid":
            return InsuranceClaimPaySerializer
        if self.action == "appeal":
            return InsuranceClaimAppealSerializer
        if self.action == "cancel":
            return InsuranceClaimCancelSerializer
        return InsuranceClaimSerializer

    def _ensure_healthcloud_enabled(self, claim: InsuranceClaim) -> InsuranceProviderConfig:
        cfg = InsuranceProviderConfig.objects.filter(
            provider=claim.provider,
            facility=getattr(self.request, "facility", None),
        ).first()
        if not cfg or not cfg.api_enabled or not cfg.healthcloud_enabled:
            raise ValidationError(
                "HealthCloud is not enabled for this provider/facility configuration."
            )
        return cfg

    @staticmethod
    def _as_money(value) -> Decimal:
        return Decimal(str(value or "0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @staticmethod
    def _strip_html(value: str) -> str:
        """Strip HTML tags and collapse whitespace for safe, readable messages."""
        no_tags = re.sub(r"<[^>]+>", " ", value)
        return re.sub(r"\s+", " ", no_tags).strip()

    @classmethod
    def _extract_upstream_message(cls, value) -> str:
        """Extract a concise error message from insurer payloads/text."""
        if isinstance(value, dict):
            for key in ("detail", "error", "message"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return cls._extract_upstream_message(candidate)
            return json.dumps(value)[:300]

        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return cls._extract_upstream_message(item)
            return "Upstream request failed."

        text = str(value or "").strip()
        if not text:
            return "Upstream request failed."

        if "<" in text and ">" in text:
            stripped = cls._strip_html(text)
            if stripped:
                return stripped[:300]

        if text.startswith("{") and text.endswith("}"):
            try:
                parsed = json.loads(text)
                return cls._extract_upstream_message(parsed)
            except (TypeError, ValueError):
                pass

        return text[:300]

    @classmethod
    def _upstream_error_response(
        cls, exc: Exception, fallback: str = "Upstream request failed"
    ) -> Response:
        """Normalize upstream errors into a structured payload for UI consumption."""
        if isinstance(exc, InsuranceApiError):
            message = cls._extract_upstream_message(exc.response_body or exc.message)
            provider = str(exc.provider_code or "")
            method = str(exc.method or "")
            path = str(exc.path or "")
            status_code = int(exc.status_code) if isinstance(exc.status_code, int) else None

            action_hint = ""
            if status_code == 404 and "/remittances/claim_remittance" in path:
                action_hint = (
                    "Slade contract mismatch: confirm the claim remittance endpoint and required query keys "
                    "for this payer/facility, then update adapter routing."
                )
            elif status_code == 404 and path.startswith("/claims/"):
                action_hint = (
                    "External claim not found in payer tenant. Verify external_claim_id and confirm the claim was "
                    "submitted in the same Slade environment."
                )

            payload = {
                "error": message or fallback,
                "upstream": {
                    "provider": provider,
                    "method": method,
                    "path": path,
                    "status": status_code,
                    "message": message or fallback,
                },
            }
            if action_hint:
                payload["action"] = action_hint

            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        return Response({"error": str(exc) or fallback}, status=status.HTTP_400_BAD_REQUEST)

    def _build_invoice_submission_payload(self, claim: InsuranceClaim, payload: dict) -> dict:
        invoice = claim.invoice
        invoice_number = str(payload.get("invoice_number") or "").strip()
        invoice_date = str(payload.get("invoice_date") or "").strip()
        provided_lines = payload.get("lines") if isinstance(payload.get("lines"), list) else []

        if invoice is not None:
            if not invoice_number:
                invoice_number = str(invoice.invoice_number or "")
            if not invoice_date:
                invoice_date = invoice.invoice_date.isoformat() if invoice.invoice_date else ""

        if not invoice_number:
            raise ValidationError("Invoice number is required for invoice submission.")
        if not invoice_date:
            raise ValidationError("Invoice date is required for invoice submission.")

        line_entries: list[dict] = []
        if invoice is not None and invoice.items.exists():
            for idx, item in enumerate(invoice.items.all(), start=1):
                line_total = self._as_money(item.line_total)
                discount = self._as_money(item.discount_amount)
                item_code = ""
                if item.service_id and getattr(item, "service", None) is not None:
                    item_code = str(item.service.code or "")
                if not item_code:
                    item_code = f"ITEM-{idx}"

                line_entries.append(
                    {
                        "item_code": item_code,
                        "item_name": item.description,
                        "charge_date": invoice_date,
                        "unit_price": float(self._as_money(item.unit_price)),
                        "quantity": float(Decimal(str(item.quantity or "0"))),
                        "line_number": idx,
                        "discount": float(discount),
                        "discount_reason": str(item.discount_reason or ""),
                        "line_total_amount": float(line_total),
                    }
                )
        else:
            for idx, provided in enumerate(provided_lines, start=1):
                if not isinstance(provided, dict):
                    continue
                line_total = self._as_money(
                    provided.get("line_total_amount") or provided.get("line_total") or 0
                )
                discount = self._as_money(provided.get("discount") or 0)
                quantity = Decimal(str(provided.get("quantity") or "0"))
                unit_price = self._as_money(provided.get("unit_price") or 0)
                line_entries.append(
                    {
                        "item_code": str(provided.get("item_code") or f"ITEM-{idx}"),
                        "item_name": str(
                            provided.get("item_name")
                            or provided.get("description")
                            or f"Item {idx}"
                        ),
                        "charge_date": str(provided.get("charge_date") or invoice_date),
                        "unit_price": float(unit_price),
                        "quantity": float(quantity),
                        "line_number": int(provided.get("line_number") or idx),
                        "discount": float(discount),
                        "discount_reason": str(provided.get("discount_reason") or ""),
                        "line_total_amount": float(line_total),
                    }
                )

        if not line_entries:
            raise ValidationError("Invoice submission requires at least one line item.")

        total_inv_amount = self._as_money(invoice.total_amount if invoice is not None else 0)
        if total_inv_amount <= Decimal("0.00"):
            total_inv_amount = sum(
                (self._as_money(line.get("line_total_amount")) for line in line_entries),
                Decimal("0.00"),
            )

        total_inv_copay = self._as_money(claim.copay_amount)
        if total_inv_copay < Decimal("0.00"):
            total_inv_copay = Decimal("0.00")
        if total_inv_copay > total_inv_amount:
            total_inv_copay = total_inv_amount

        line_total_sum = sum(
            (self._as_money(line.get("line_total_amount")) for line in line_entries),
            Decimal("0.00"),
        )
        remaining_copay = total_inv_copay
        for idx, line in enumerate(line_entries):
            line_total = self._as_money(line.get("line_total_amount"))
            if idx == len(line_entries) - 1:
                line_copay = remaining_copay
            elif line_total_sum > Decimal("0.00") and total_inv_copay > Decimal("0.00"):
                line_copay = (total_inv_copay * line_total / line_total_sum).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                line_copay = min(line_copay, remaining_copay)
                remaining_copay -= line_copay
            else:
                line_copay = Decimal("0.00")

            line_net = self._as_money(line_total - line_copay)
            line["line_copay"] = float(line_copay)
            line["line_net_amount"] = float(line_net)
            line["patient_net_price"] = float(line_copay)
            line["sponsor_net_price"] = float(line_net)

        total_inv_net_amount = self._as_money(total_inv_amount - total_inv_copay)

        computed_copays = payload.get("copays") if isinstance(payload.get("copays"), list) else []

        return {
            "claim": payload.get("claim") or claim.external_claim_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "provider_invoice_ref": invoice_number,
            "lines": line_entries,
            "copays": computed_copays,
            "total_inv_amount": float(total_inv_amount),
            "total_inv_copay": float(total_inv_copay),
            "total_inv_net_amount": float(total_inv_net_amount),
        }

    def _ensure_invoice_split_synced(self, claim: InsuranceClaim) -> None:
        if claim.invoice_id is None:
            return
        create_serializer = InsuranceClaimCreateSerializer(context=self.get_serializer_context())
        create_serializer._sync_invoice_responsibility_split(claim)

    def perform_create(self, serializer):
        with transaction.atomic():
            claim = serializer.save(**self.get_tenant_save_kwargs())
            self._ensure_invoice_split_synced(claim)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        self._ensure_invoice_split_synced(instance)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    # -- Lifecycle actions --

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        claim = self.get_object()
        try:
            claim.submit(user=request.user)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.approve(
                approved_amount=serializer.validated_data["approved_amount"],
                user=request.user,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def partially_approve(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.partially_approve(
                approved_amount=serializer.validated_data["approved_amount"],
                user=request.user,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.reject(
                reason=serializer.validated_data["reason"],
                user=request.user,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"], url_path="query")
    def query_claim(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimQuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.query_claim(
                details=serializer.validated_data["details"],
                user=request.user,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"], url_path="respond-to-query")
    def respond_to_query(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimQueryResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.respond_to_query(
                response=serializer.validated_data["response"],
                user=request.user,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimPaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.mark_paid(paid_amount=serializer.validated_data["paid_amount"])
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def appeal(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimAppealSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.appeal(notes=serializer.validated_data.get("notes", ""))
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        claim = self.get_object()
        serializer = InsuranceClaimCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claim.cancel(reason=serializer.validated_data.get("reason", ""))
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"], url_path="write-off")
    def write_off(self, request, pk=None):
        claim = self.get_object()
        reason = request.data.get("reason", "")
        try:
            claim.write_off(reason=reason)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceClaimSerializer(claim).data)

    @action(detail=True, methods=["post"], url_path="reserve-balance")
    def reserve_balance(self, request, pk=None):
        claim = self.get_object()
        try:
            self._ensure_healthcloud_enabled(claim)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ReserveBalanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        authorization = get_object_or_404(
            InsuranceVisitAuthorization,
            pk=serializer.validated_data["authorization_id"],
            facility=getattr(request, "facility", None),
        )
        service = HealthCloudWorkflowService()
        try:
            reservation = service.reserve_balance(
                claim=claim,
                authorization=authorization,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                amount=serializer.validated_data["amount"],
                invoice_number=serializer.validated_data["invoice_number"],
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="reserve_balance", exc=exc)
        return Response(
            {
                "id": reservation.pk,
                "reservation_guid": reservation.reservation_guid,
                "status": reservation.status,
                "invoice_number": reservation.invoice_number,
                "amount": str(reservation.amount),
            }
        )

    @action(detail=True, methods=["post"], url_path="submit-to-healthcloud")
    def submit_to_healthcloud(self, request, pk=None):
        claim = self.get_object()
        try:
            cfg = self._ensure_healthcloud_enabled(claim)
            if cfg.require_visit_authorization:
                has_authorization = InsuranceVisitAuthorization.objects.filter(
                    facility=getattr(request, "facility", None),
                    patient=claim.patient,
                    status__in=[
                        InsuranceVisitAuthorization.Status.AUTHORIZED,
                        InsuranceVisitAuthorization.Status.VALIDATED,
                    ],
                ).exists()
                if not has_authorization:
                    raise ValidationError(
                        "Visit authorization is required before submitting this claim."
                    )
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        service = HealthCloudWorkflowService()
        try:
            response = service.submit_claim(
                claim=claim,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="submit_to_healthcloud", exc=exc)
        return Response({"claim": InsuranceClaimSerializer(claim).data, "external": response})

    @action(detail=True, methods=["post"], url_path="submit-invoice")
    def submit_invoice(self, request, pk=None):
        claim = self.get_object()
        try:
            cfg = self._ensure_healthcloud_enabled(claim)
            if cfg.require_balance_reservation:
                has_reservation = claim.balance_reservations.filter(
                    status=InsuranceBalanceReservation.Status.RESERVED
                ).exists()
                if not has_reservation:
                    raise ValidationError(
                        "Active balance reservation is required before invoice submission."
                    )
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = SubmitInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = self._build_invoice_submission_payload(
                claim,
                dict(serializer.validated_data),
            )
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        service = HealthCloudWorkflowService()
        try:
            response = service.submit_invoice(
                claim=claim,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                payload=payload,
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="submit_invoice", exc=exc)
        return Response(response)

    @action(detail=True, methods=["post"], url_path="refresh-external-status")
    def refresh_external_status(self, request, pk=None):
        claim = self.get_object()
        try:
            self._ensure_healthcloud_enabled(claim)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        service = HealthCloudWorkflowService()
        try:
            response = service.refresh_claim_status(
                claim=claim,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
            )
        except _insurance_handled_exceptions() as exc:
            return self._upstream_error_response(
                exc, fallback="Failed to refresh external claim status"
            )
        return Response({"claim": InsuranceClaimSerializer(claim).data, "external": response})

    @action(detail=True, methods=["post"], url_path="submit-credit-note")
    def submit_credit_note(self, request, pk=None):
        claim = self.get_object()
        try:
            self._ensure_healthcloud_enabled(claim)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = SubmitCreditNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        payload["claim"] = payload.get("claim") or claim.external_claim_id
        service = HealthCloudWorkflowService()
        try:
            response = service.submit_credit_note(
                claim=claim,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                payload=payload,
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="submit_credit_note", exc=exc)
        return Response(response)

    @action(detail=True, methods=["post"], url_path="upload-attachment")
    def upload_attachment(self, request, pk=None):
        claim = self.get_object()
        try:
            self._ensure_healthcloud_enabled(claim)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        service = HealthCloudWorkflowService()

        file_obj = request.FILES.get("attachment")
        if file_obj is not None:
            attachment_type = str(request.data.get("attachment_type") or "CLAIM_FORM")
            description = str(request.data.get("description") or "")
            try:
                response = service.upload_claim_attachment_file(
                    claim=claim,
                    facility=getattr(request, "facility", None),
                    organization=getattr(request, "organization", None),
                    file_obj=file_obj,
                    attachment_type=attachment_type,
                    description=description,
                )
            except _insurance_handled_exceptions() as exc:
                return _insurance_error_response(action="upload_attachment_file_inline", exc=exc)
            return Response(response)

        serializer = UploadClaimAttachmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        payload["claim"] = payload.get("claim") or claim.external_claim_id
        try:
            response = service.upload_claim_attachment(
                claim=claim,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                payload=payload,
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="upload_attachment", exc=exc)
        return Response(response)

    @action(detail=True, methods=["post"], url_path="upload-attachment-file")
    def upload_attachment_file(self, request, pk=None):
        claim = self.get_object()
        try:
            self._ensure_healthcloud_enabled(claim)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        file_obj = request.FILES.get("file")
        if file_obj is None:
            return Response(
                {"error": "file is required (multipart/form-data)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attachment_type = str(request.data.get("attachment_type") or "CLAIM_FORM")
        description = str(request.data.get("description") or "")

        service = HealthCloudWorkflowService()
        try:
            response = service.upload_claim_attachment_file(
                claim=claim,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                file_obj=file_obj,
                attachment_type=attachment_type,
                description=description,
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="upload_attachment_file", exc=exc)
        return Response(response)

    @action(detail=True, methods=["post"], url_path="check-remittance")
    def check_remittance(self, request, pk=None):
        claim = self.get_object()
        try:
            self._ensure_healthcloud_enabled(claim)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        service = HealthCloudWorkflowService()
        try:
            response = service.get_claim_remittance(
                claim=claim,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
            )
        except _insurance_handled_exceptions() as exc:
            return self._upstream_error_response(exc, fallback="Failed to fetch claim remittance")
        return Response({"claim": InsuranceClaimSerializer(claim).data, "remittance": response})


# ---------------------------------------------------------------------------
# InsuranceClaimItem (nested)
# ---------------------------------------------------------------------------
class InsuranceClaimItemViewSet(AuditedMutationMixin, viewsets.ModelViewSet):
    """CRUD for claim line items (nested under claim)."""

    queryset = InsuranceClaimItem.objects.all()
    audit_resource_type = "InsuranceClaimItem"
    audit_action_prefix = "insurance.claim_item"
    audit_source = "insurance_api"
    serializer_class = InsuranceClaimItemSerializer
    permission_classes = [
        IsAuthenticated,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]

    def get_queryset(self):
        return self.queryset.filter(claim_id=self.kwargs.get("claim_pk"))

    def perform_create(self, serializer):
        serializer.save(claim_id=self.kwargs.get("claim_pk"))


# ---------------------------------------------------------------------------
# InsurancePreauth
# ---------------------------------------------------------------------------
class InsurancePreauthViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD + lifecycle for pre-authorizations (facility-scoped)."""

    queryset = InsurancePreauth.objects.select_related(
        "provider",
        "patient",
        "patient_insurance",
        "patient_insurance__plan",
    ).all()
    audit_resource_type = "InsurancePreauth"
    audit_action_prefix = "insurance.preauth"
    audit_source = "insurance_api"
    tenant_scope = "facility"

    # -- Adjudication actions require admin; clinical ops require active shift --
    _admin_actions = frozenset({"approve", "deny"})

    def get_permissions(self):
        if self.action in self._admin_actions:
            return [IsAdminUser()]
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated(), RequiresActiveShiftPermission()]
        return [IsAuthenticated()]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = InsurancePreauthFilter
    search_fields = ["preauth_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["created_at", "estimated_cost"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return InsurancePreauthCreateSerializer
        if self.action == "approve":
            return InsurancePreauthApproveSerializer
        if self.action == "deny":
            return InsurancePreauthDenySerializer
        if self.action == "cancel":
            return InsurancePreauthCancelSerializer
        return InsurancePreauthSerializer

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        preauth = self.get_object()
        config = InsuranceProviderConfig.objects.filter(
            provider=preauth.provider,
            facility=getattr(request, "facility", None),
        ).first()

        # For HealthCloud-enabled configs, submit through adapter orchestration.
        if config and config.api_enabled and config.healthcloud_enabled:
            service = InsurancePreauthService()
            try:
                result = service.submit(preauth, user=request.user)
            except _insurance_handled_exceptions() as e:
                return Response(
                    {
                        "error": str(e),
                        "action": (
                            "HealthCloud preauth endpoint may not be enabled for this payer. "
                            "Confirm contract endpoint path/tenant and retry."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not result.success:
                return Response(
                    {
                        "error": result.message or "Preauth submission failed.",
                        "upstream": result.raw_response,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response(
                {
                    "preauth": InsurancePreauthSerializer(preauth).data,
                    "upstream": result.raw_response,
                }
            )

        try:
            preauth.submit(user=request.user)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsurancePreauthSerializer(preauth).data)

    @action(detail=True, methods=["post"], url_path="check-status")
    def check_status(self, request, pk=None):
        preauth = self.get_object()
        service = InsurancePreauthService()
        try:
            result = service.check_status(preauth)
        except _insurance_handled_exceptions() as e:
            return _insurance_error_response(action="preauth_check_status", exc=e)
        return Response(
            {
                "preauth": InsurancePreauthSerializer(preauth).data,
                "upstream": result.raw_response,
                "status": result.status,
            }
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        preauth = self.get_object()
        serializer = InsurancePreauthApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            preauth.approve(
                approved_amount=serializer.validated_data["approved_amount"],
                validity_days=serializer.validated_data.get("validity_days", 30),
                user=request.user,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsurancePreauthSerializer(preauth).data)

    @action(detail=True, methods=["post"])
    def deny(self, request, pk=None):
        preauth = self.get_object()
        serializer = InsurancePreauthDenySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            preauth.deny(
                reason=serializer.validated_data["reason"],
                user=request.user,
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsurancePreauthSerializer(preauth).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        preauth = self.get_object()
        serializer = InsurancePreauthCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            preauth.cancel(reason=serializer.validated_data.get("reason", ""))
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsurancePreauthSerializer(preauth).data)


# ---------------------------------------------------------------------------
# InsuranceRemittance
# ---------------------------------------------------------------------------
