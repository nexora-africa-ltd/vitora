"""
What this file is for: claim CRUD and submission workflow mixin for SHA claims.
How to use: mixed into SHAClaimViewSet to provide create/validate/submit/appeal/resubmit/cancel endpoints.
Supported inputs/args: DRF action payloads for SHA claim lifecycle operations.
"""

# ruff: noqa: ARG002

import logging

from django.db import DatabaseError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import action as drf_action
from rest_framework.response import Response

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.models import Invoice, SHAClaim, SHAMember
from hmis.apps.billing.services.sha_flow_router import determine_flow
from hmis.apps.billing.sha_serializers import (
    SHAClaimAppealSerializer,
    SHAClaimDetailSerializer,
    SHAClaimSerializer,
    SHAClaimSubmitSerializer,
    SHAClaimValidationSerializer,
)
from hmis.apps.billing.sha_views_claims_helpers import _stringify_error
from hmis.apps.encounters.models import Encounter

logger = logging.getLogger(__name__)


class SHAClaimWorkflowMixin:
    """CRUD and non-ILM workflow endpoints for SHA claims."""

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

    def create(self, request, *args, **kwargs):
        """Create a claim with support for minimal encounter/invoice payloads.

        The web app commonly sends `{encounter_id, invoice_id}` only. Hydrate
        required serializer fields from the linked encounter/facility defaults.
        """
        incoming = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        payload = incoming.dict() if hasattr(incoming, "dict") else dict(incoming)

        encounter_raw = payload.get("encounter") or payload.get("encounter_id")
        invoice_raw = payload.get("invoice") or payload.get("invoice_id")

        encounter_obj = None
        selected_sha_member = None
        resolved_claim_flow = None
        resolved_is_emergency_claim = None
        if encounter_raw not in (None, ""):
            try:
                encounter_id = int(encounter_raw)
            except (TypeError, ValueError):
                return Response(
                    {"encounter": ["Encounter must be an integer."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            encounter_qs = Encounter.objects.select_related("patient", "facility")
            if getattr(request, "facility", None) is not None:
                encounter_qs = encounter_qs.filter(facility=request.facility)
            encounter_obj = get_object_or_404(encounter_qs, pk=encounter_id)
            payload["encounter"] = encounter_obj.id

            payload.setdefault("patient", encounter_obj.patient_id)
            payload.setdefault("service_date", str(encounter_obj.encounter_date))

            encounter_type = str(getattr(encounter_obj, "encounter_type", "") or "").strip().upper()
            is_ipd_encounter = encounter_type == "IPD"
            is_emergency_encounter = encounter_type == "EMERGENCY"

            auto_claim_type = SHAClaim.ClaimType.OUTPATIENT
            if is_ipd_encounter:
                auto_claim_type = SHAClaim.ClaimType.INPATIENT
            elif is_emergency_encounter:
                auto_claim_type = SHAClaim.ClaimType.EMERGENCY

            raw_claim_type = payload.get("claim_type")
            if raw_claim_type not in (None, ""):
                normalized_claim_type = str(raw_claim_type).strip().lower()
                allowed_claim_types = {choice for choice, _ in SHAClaim.ClaimType.choices}
                if normalized_claim_type not in allowed_claim_types:
                    allowed_values = ", ".join(sorted(allowed_claim_types))
                    return Response(
                        {"claim_type": [f"Invalid claim_type. Allowed values: {allowed_values}."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                payload["claim_type"] = normalized_claim_type
            else:
                payload["claim_type"] = auto_claim_type

            resolved_claim_type = str(payload.get("claim_type") or "").strip().lower()

            if resolved_claim_type == SHAClaim.ClaimType.INPATIENT and raw_claim_type in (None, ""):
                payload.setdefault("admission_date", str(encounter_obj.encounter_date))

            payload.setdefault("primary_diagnosis_code", "PENDING")
            payload.setdefault("primary_diagnosis_description", "Awaiting diagnosis")

            if not payload.get("sha_member"):
                sha_member = (
                    SHAMember.objects.filter(
                        patient_id=encounter_obj.patient_id,
                        status=SHAMember.MembershipStatus.ACTIVE,
                    )
                    .order_by("-updated_at", "-id")
                    .first()
                )
                if sha_member is not None:
                    payload["sha_member"] = sha_member.id
                    selected_sha_member = sha_member
            elif payload.get("sha_member"):
                selected_sha_member = SHAMember.objects.filter(pk=payload.get("sha_member")).first()

            facility = encounter_obj.facility or getattr(request, "facility", None)
            if facility is not None:
                fr_code = resolve_fr_code(facility, allow_settings_fallback=False).value
                payload.setdefault(
                    "facility_code",
                    fr_code or getattr(facility, "mfl_code", ""),
                )
                level_raw = str(getattr(facility, "level", "") or "").strip().upper()
                if level_raw and not level_raw.startswith("L"):
                    level_raw = f"L{level_raw}"
                if level_raw:
                    payload.setdefault("facility_level", level_raw)

            # Resolve claim flow for this create path so emergency encounters are
            # consistently marked as ECCIF claims even when created from minimal
            # dialog payloads.
            eligibility_data = (
                getattr(selected_sha_member, "eligibility_response", None)
                if selected_sha_member is not None
                else None
            )
            if facility is not None:
                resolved_claim_flow = determine_flow(
                    encounter_obj,
                    facility,
                    eligibility_data=eligibility_data,
                )
            else:
                resolved_claim_flow = SHAClaim.ClaimFlow.PHC

            if resolved_claim_type == SHAClaim.ClaimType.EMERGENCY:
                resolved_claim_flow = SHAClaim.ClaimFlow.ECCIF
            resolved_is_emergency_claim = resolved_claim_flow == SHAClaim.ClaimFlow.ECCIF

            parent_claim_raw = payload.get("parent_claim")
            is_root_claim = parent_claim_raw in (None, "")
            if is_root_claim:
                existing_root = (
                    SHAClaim.objects.filter(
                        encounter_id=encounter_obj.id,
                        parent_claim__isnull=True,
                    )
                    .exclude(status=SHAClaim.ClaimStatus.CANCELLED)
                    .order_by("-created_at")
                    .first()
                )
                if existing_root is not None:
                    return Response(
                        {
                            "encounter": [
                                (
                                    "This encounter already has a root SHA claim. "
                                    "Use the existing claim or create an appeal/resubmission from it."
                                )
                            ],
                            "existing_claim_id": existing_root.id,
                            "existing_claim_number": existing_root.claim_number,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        if invoice_raw not in (None, ""):
            try:
                invoice_id = int(invoice_raw)
            except (TypeError, ValueError):
                return Response(
                    {"invoice": ["Invoice must be an integer."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            invoice_qs = Invoice.objects.all()
            if getattr(request, "facility", None) is not None:
                invoice_qs = invoice_qs.filter(facility=request.facility)
            invoice_obj = get_object_or_404(invoice_qs, pk=invoice_id)
            if encounter_obj is not None and invoice_obj.encounter_id != encounter_obj.id:
                return Response(
                    {"invoice": ["Selected invoice is not linked to the selected encounter."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            payload["invoice"] = invoice_obj.id

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        claim = serializer.save()

        update_fields = []
        if resolved_claim_flow and claim.claim_flow != resolved_claim_flow:
            claim.claim_flow = resolved_claim_flow
            update_fields.append("claim_flow")
        if (
            resolved_is_emergency_claim is not None
            and claim.is_emergency_claim != resolved_is_emergency_claim
        ):
            claim.is_emergency_claim = resolved_is_emergency_claim
            update_fields.append("is_emergency_claim")
        if update_fields:
            claim.save(update_fields=[*update_fields, "updated_at"])

        response_data = self.get_serializer(claim).data
        headers = self.get_success_headers(response_data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    @drf_action(detail=True, methods=["post"], url_path="validate")
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

    @staticmethod
    def _sha_action_handled_exception_types() -> tuple[type[Exception], ...]:
        from django.core.exceptions import ValidationError as DjangoValidationError

        from hmis.apps.billing.services.sha_auth import SHAAuthError

        return (
            DatabaseError,
            DjangoValidationError,
            serializers.ValidationError,
            SHAAuthError,
            ValueError,
            TypeError,
            RuntimeError,
        )

    def _handle_sha_action_error(
        self, action: str, claim_id: int | None, exc: Exception
    ) -> Response:
        from django.core.exceptions import ValidationError as DjangoValidationError

        from hmis.apps.billing.services.sha_auth import SHAAuthError

        error_handlers: tuple[tuple[type[Exception], int, str, str | None], ...] = (
            (
                DatabaseError,
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "database_error",
                "Temporary database error. Please retry shortly.",
            ),
            (
                DjangoValidationError,
                status.HTTP_400_BAD_REQUEST,
                "validation_error",
                None,
            ),
            (
                serializers.ValidationError,
                status.HTTP_400_BAD_REQUEST,
                "validation_error",
                None,
            ),
            (SHAAuthError, status.HTTP_400_BAD_REQUEST, "sha_auth_error", None),
            (ValueError, status.HTTP_400_BAD_REQUEST, "invalid_request", None),
            (TypeError, status.HTTP_400_BAD_REQUEST, "invalid_request", None),
            (
                RuntimeError,
                status.HTTP_400_BAD_REQUEST,
                "operation_failed",
                None,
            ),
        )

        for error_cls, http_status, code, default_message in error_handlers:
            if isinstance(exc, error_cls):
                logger.warning(
                    "SHA claim action failed",
                    extra={
                        "action": action,
                        "claim_id": claim_id,
                        "error_class": exc.__class__.__name__,
                        "error": _stringify_error(exc),
                    },
                )
                return Response(
                    {
                        "error": default_message or _stringify_error(exc),
                        "code": code,
                    },
                    status=http_status,
                )

        logger.exception(
            "Unhandled SHA claim action error (action=%s claim_id=%s)", action, claim_id
        )
        return Response(
            {"error": "Unexpected server error.", "code": "internal_error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    @drf_action(detail=True, methods=["post"], url_path="submit")
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

        except self._sha_action_handled_exception_types() as exc:
            return self._handle_sha_action_error("submit", getattr(claim, "id", None), exc)

    @drf_action(detail=True, methods=["post"], url_path="appeal")
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

        except self._sha_action_handled_exception_types() as exc:
            return self._handle_sha_action_error("appeal", getattr(claim, "id", None), exc)

    @drf_action(detail=True, methods=["post"], url_path="resubmit")
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

        except self._sha_action_handled_exception_types() as exc:
            return self._handle_sha_action_error("resubmit", getattr(claim, "id", None), exc)

    @drf_action(detail=True, methods=["post"], url_path="cancel")
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

    @drf_action(detail=True, methods=["get"], url_path="bundle")
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
