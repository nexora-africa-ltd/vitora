# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Views for the insurance app."""

import logging
import re
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import RequiresActiveShiftPermission
from hmis.apps.encounters.models import Encounter
from hmis.apps.insurance.bootstrap import seed_slade_defaults
from hmis.apps.insurance.filters import (
    InsuranceClaimFilter,
    InsurancePlanFilter,
    InsurancePreauthFilter,
    InsuranceProviderFilter,
    PatientInsuranceFilter,
    PayerTariffFilter,
)
from hmis.apps.insurance.media_security import read_decrypted_card_image, validate_card_image_token
from hmis.apps.insurance.models import (
    InsuranceBalanceReservation,
    InsuranceClaim,
    InsuranceClaimItem,
    InsuranceExternalSync,
    InsurancePlan,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceProviderConfig,
    InsuranceRemittance,
    InsuranceRemittanceLine,
    InsuranceVisitAuthorization,
    PatientInsurance,
    PayerTariff,
)
from hmis.apps.insurance.serializers import (
    HealthCloudSessionRequestOTPSerializer,
    HealthCloudSessionStartVisitSerializer,
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
    InsurancePlanCreateSerializer,
    InsurancePlanSerializer,
    InsurancePreauthApproveSerializer,
    InsurancePreauthCancelSerializer,
    InsurancePreauthCreateSerializer,
    InsurancePreauthDenySerializer,
    InsurancePreauthSerializer,
    InsuranceProviderConfigSerializer,
    InsuranceProviderCreateSerializer,
    InsuranceProviderSerializer,
    InsuranceRemittanceCreateSerializer,
    InsuranceRemittanceLineSerializer,
    InsuranceRemittanceSerializer,
    InsuranceVisitAuthorizationSerializer,
    PatientInsuranceCreateSerializer,
    PatientInsuranceSerializer,
    PayerTariffCreateSerializer,
    PayerTariffSerializer,
    RequestOTPSerializer,
    ReserveBalanceSerializer,
    StartVisitSerializer,
    SubmitCreditNoteSerializer,
    SubmitInvoiceSerializer,
    UploadClaimAttachmentSerializer,
    ValidateAuthorizationSerializer,
    VerifyEnrollmentPreviewSerializer,
)
from hmis.apps.insurance.services.adapters import get_adapter
from hmis.apps.insurance.services.insurance_services import (
    HealthCloudWorkflowService,
    InsuranceEligibilityService,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# InsuranceProvider
# ---------------------------------------------------------------------------
class InsuranceProviderViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for insurance providers (org-scoped)."""

    queryset = InsuranceProvider.objects.all()

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy", "seed_slade_defaults"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    tenant_scope = "organization"
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = InsuranceProviderFilter
    search_fields = ["name", "code", "contact_person"]
    ordering_fields = ["name", "created_at", "status"]
    ordering = ["name"]

    def get_serializer_class(self):
        if self.action == "create":
            return InsuranceProviderCreateSerializer
        return InsuranceProviderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        from django.db.models import Count, Q

        return qs.annotate(
            plans_count=Count("plans"),
            active_enrollments_count=Count(
                "patient_enrollments",
                filter=Q(patient_enrollments__status="active"),
            ),
        )

    @action(detail=False, methods=["post"], url_path="seed-slade-defaults")
    def seed_slade_defaults(self, request):
        resolve_request_tenant(request)
        organization = getattr(request, "organization", None)
        facility = getattr(request, "facility", None)
        if not organization:
            return Response(
                {"error": "No organization context."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = seed_slade_defaults(
            organization=organization,
            facilities=[facility] if facility else None,
            create_provider_configs=True,
        )
        return Response(result)


# ---------------------------------------------------------------------------
# InsurancePlan
# ---------------------------------------------------------------------------
class InsurancePlanViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for insurance plans (org-scoped)."""

    queryset = InsurancePlan.objects.select_related("provider").all()

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    tenant_scope = "organization"
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = InsurancePlanFilter
    search_fields = ["name", "code", "provider__name"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_serializer_class(self):
        if self.action == "create":
            return InsurancePlanCreateSerializer
        return InsurancePlanSerializer


# ---------------------------------------------------------------------------
# PatientInsurance
# ---------------------------------------------------------------------------
class PatientInsuranceViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for patient insurance enrollments (org-scoped)."""

    queryset = PatientInsurance.objects.select_related(
        "patient", "plan", "plan__provider", "provider"
    ).all()

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAdminUser()]
        if self.action in ["create", "update", "partial_update", "verify"]:
            return [IsAuthenticated(), RequiresActiveShiftPermission()]
        return [IsAuthenticated()]

    tenant_scope = "organization"
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PatientInsuranceFilter
    search_fields = ["member_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["valid_to", "created_at"]
    ordering = ["-valid_to"]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return PatientInsuranceCreateSerializer
        return PatientInsuranceSerializer

    def _can_view_card_images(self, request) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        profile = getattr(user, "staff_profile", None)
        if not profile:
            return False
        role = getattr(profile, "primary_role", None)
        if role and getattr(role, "code", "") in {"ADMIN", "ORG-ADMIN", "OWNER"}:
            return True
        return profile.has_permission("read", "PatientInsurance")

    def perform_create(self, serializer):
        tenant_kwargs = self.get_tenant_save_kwargs()
        if not tenant_kwargs.get("organization"):
            patient = serializer.validated_data.get("patient")
            plan = serializer.validated_data.get("plan")
            organization = getattr(patient, "organization", None) or getattr(
                getattr(plan, "provider", None), "organization", None
            )
            if organization is None:
                raise DRFValidationError(
                    {
                        "organization": (
                            "Unable to resolve organization for this enrollment. "
                            "Select an active facility context and retry."
                        )
                    }
                )
            tenant_kwargs["organization"] = organization
        serializer.save(**tenant_kwargs)

    def _ensure_healthcloud_enabled(self, enrollment: PatientInsurance):
        cfg = InsuranceProviderConfig.objects.filter(
            provider=enrollment.provider,
            facility=getattr(self.request, "facility", None),
        ).first()
        if not cfg or not cfg.api_enabled or not cfg.healthcloud_enabled:
            raise ValidationError(
                "HealthCloud is not enabled for this provider/facility configuration."
            )
        return cfg

    @staticmethod
    def _eligibility_payload(result) -> dict:
        return {
            "eligible": result.eligible,
            "status": result.status,
            "plan_name": result.plan_name,
            "member_number": result.member_number,
            "annual_balance": str(result.annual_balance)
            if result.annual_balance is not None
            else None,
            "copay_percent": str(result.copay_percent)
            if result.copay_percent is not None
            else None,
            "message": result.message,
            "raw_response": result.raw_response,
        }

    @staticmethod
    def _normalize_plan_code(raw_code: str | None, fallback_name: str | None) -> str:
        base = (raw_code or "").strip()
        if not base:
            base = (fallback_name or "").strip()
        if not base:
            return "HEALTHCLOUD_PLAN"

        code = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_").upper()
        if not code:
            code = "HEALTHCLOUD_PLAN"
        return code[:30]

    def _ensure_plan_from_eligibility(self, provider, organization, result):
        raw = result.raw_response if isinstance(result.raw_response, dict) else {}
        cover = raw.get("cover") if isinstance(raw, dict) else None
        cover_data = cover if isinstance(cover, dict) else {}

        plan_name = (
            str(cover_data.get("schemeName") or "").strip()
            or str(result.plan_name or "").strip()
            or f"{provider.name} HealthCloud Plan"
        )
        raw_code = str(cover_data.get("schemeCode") or cover_data.get("schemeID") or "").strip()
        plan_code = self._normalize_plan_code(raw_code, plan_name)

        defaults = {
            "organization": getattr(provider, "organization", None) or organization,
            "name": plan_name,
            "plan_type": InsurancePlan.PlanType.INDIVIDUAL,
            "coverage_type": InsurancePlan.CoverageType.COMPREHENSIVE,
            "status": InsurancePlan.Status.ACTIVE,
        }
        plan, created = InsurancePlan.objects.get_or_create(
            provider=provider,
            code=plan_code,
            defaults=defaults,
        )

        # Keep name in sync with latest eligibility payload while preserving
        # idempotency on provider+code.
        if not created and plan_name and plan.name != plan_name:
            plan.name = plan_name
            plan.save(update_fields=["name", "updated_at"])
        return plan

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        """Mark enrollment as verified."""
        enrollment = self.get_object()
        enrollment.status = PatientInsurance.Status.ACTIVE
        enrollment.verified_at = __import__("django.utils.timezone", fromlist=["now"]).now()
        enrollment.verified_by = request.user
        enrollment.save(update_fields=["status", "verified_at", "verified_by", "updated_at"])
        return Response(PatientInsuranceSerializer(enrollment).data)

    @action(detail=True, methods=["post"], url_path="verify-via-healthcloud")
    def verify_via_healthcloud(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        service = InsuranceEligibilityService()
        try:
            result = service.verify(enrollment, facility=getattr(request, "facility", None))
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._eligibility_payload(result))

    @action(detail=False, methods=["post"], url_path="verify-via-healthcloud-preview")
    def verify_via_healthcloud_preview(self, request):
        resolve_request_tenant(request)
        serializer = VerifyEnrollmentPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        organization = getattr(request, "organization", None)
        plan_id = serializer.validated_data.get("plan")
        provider_id = serializer.validated_data.get("provider")

        plan = None
        if plan_id is not None:
            plan_qs = InsurancePlan.objects.filter(pk=plan_id)
            if organization is not None:
                plan_qs = plan_qs.filter(organization=organization)
            plan = get_object_or_404(plan_qs)

        provider = None
        if provider_id is not None:
            provider_qs = InsuranceProvider.objects.filter(pk=provider_id)
            if organization is not None:
                provider_qs = provider_qs.filter(organization=organization)
            provider = get_object_or_404(provider_qs)
        elif plan is not None:
            provider = plan.provider

        if provider is None:
            return Response(
                {"error": "Unable to resolve provider from request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        facility = getattr(request, "facility", None)
        config = InsuranceProviderConfig.objects.filter(
            provider=provider,
            facility=facility,
        ).first()
        if not config or not config.api_enabled or not config.healthcloud_enabled:
            return Response(
                {"error": "HealthCloud is not enabled for this provider/facility configuration."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        adapter = get_adapter(config)
        preview_enrollment = type(
            "PreviewEnrollment",
            (),
            {
                "member_number": serializer.validated_data["member_number"],
                "status": "pending_verification",
                "is_valid": False,
            },
        )()
        try:
            result = adapter.verify_eligibility(preview_enrollment)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        plan = self._ensure_plan_from_eligibility(provider, organization, result)
        payload = self._eligibility_payload(result)
        payload["resolved_plan_id"] = plan.id
        payload["resolved_plan_name"] = plan.name
        payload["resolved_plan_code"] = plan.code
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="healthcloud-session/start")
    def healthcloud_session_start(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        existing_session = (
            InsuranceVisitAuthorization.objects.filter(
                enrollment=enrollment,
                facility=getattr(request, "facility", None),
            )
            .exclude(
                status__in=[
                    InsuranceVisitAuthorization.Status.FAILED,
                    InsuranceVisitAuthorization.Status.EXPIRED,
                ]
            )
            .order_by("-created_at")
            .first()
        )
        if existing_session:
            eligibility_payload = existing_session.eligibility_payload
            if not isinstance(eligibility_payload, dict):
                eligibility_payload = {}
            return Response(
                {
                    "session": InsuranceVisitAuthorizationSerializer(existing_session).data,
                    "eligibility": {
                        "eligible": bool(enrollment.last_eligibility_eligible)
                        if enrollment.last_eligibility_eligible is not None
                        else True,
                        "status": enrollment.last_eligibility_status or existing_session.status,
                        "plan_name": enrollment.plan.name,
                        "member_number": existing_session.member_number or enrollment.member_number,
                        "annual_balance": None,
                        "copay_percent": None,
                        "message": "Existing HealthCloud session loaded.",
                        "raw_response": eligibility_payload,
                    },
                }
            )

        eligibility_service = InsuranceEligibilityService()
        workflow_service = HealthCloudWorkflowService()
        facility = getattr(request, "facility", None)
        organization = getattr(request, "organization", None)

        try:
            result = eligibility_service.verify(enrollment, facility=facility)
            session = workflow_service.start_session(
                enrollment=enrollment,
                facility=facility,
                organization=organization,
                eligibility_result=result,
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "session": InsuranceVisitAuthorizationSerializer(session).data,
                "eligibility": self._eligibility_payload(result),
            }
        )

    @action(detail=True, methods=["get"], url_path=r"card-image/(?P<side>front|back)")
    def card_image(self, request, pk=None, side=None):
        enrollment = self.get_object()
        if not self._can_view_card_images(request):
            return Response(
                {"error": "You do not have permission to view insurance card images."},
                status=status.HTTP_403_FORBIDDEN,
            )

        token = request.query_params.get("token", "")
        if not token or not validate_card_image_token(
            token,
            enrollment_id=enrollment.id,
            side=side,
            user_id=request.user.id,
        ):
            return Response(
                {"error": "Invalid or expired card image link."}, status=status.HTTP_403_FORBIDDEN
            )

        try:
            payload, content_type = read_decrypted_card_image(enrollment=enrollment, side=side)
        except FileNotFoundError:
            return Response({"error": "Card image not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            logger.exception(
                "Failed to read insurance card image",
                extra={"enrollment_id": enrollment.id, "side": side},
            )
            return Response(
                {"error": f"Could not load card image: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        AuditLog.log(
            action="insurance_card_image_view",
            user=request.user,
            resource_type="PatientInsurance",
            resource_id=enrollment.id,
            patient_id=enrollment.patient_id,
            request=request,
            details={
                "side": side,
                "purpose": "insurance_enrollment_review",
            },
        )

        response = HttpResponse(payload, content_type=content_type)
        response["Cache-Control"] = "private, max-age=60"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Disposition"] = "inline"
        return response

    @action(detail=True, methods=["post"], url_path="healthcloud-session/request-otp")
    def healthcloud_session_request_otp(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = HealthCloudSessionRequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_id = serializer.validated_data["session_id"]
        authorization = get_object_or_404(
            InsuranceVisitAuthorization,
            pk=session_id,
            enrollment=enrollment,
            facility=getattr(request, "facility", None),
        )

        service = HealthCloudWorkflowService()
        try:
            updated = service.request_otp_for_session(
                authorization=authorization,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                contact_id=serializer.validated_data["contact_id"],
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(InsuranceVisitAuthorizationSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="healthcloud-session/start-visit")
    def healthcloud_session_start_visit(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = HealthCloudSessionStartVisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        session_id = data.pop("session_id")
        encounter_id = data.pop("encounter", None)
        encounter = None
        if encounter_id:
            encounter = get_object_or_404(
                Encounter,
                pk=encounter_id,
                facility=getattr(request, "facility", None),
            )

        authorization = get_object_or_404(
            InsuranceVisitAuthorization,
            pk=session_id,
            enrollment=enrollment,
            facility=getattr(request, "facility", None),
        )

        service = HealthCloudWorkflowService()
        try:
            updated = service.start_visit_for_session(
                authorization=authorization,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                payload=data,
                encounter=encounter,
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(InsuranceVisitAuthorizationSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="request-otp")
    def request_otp(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = HealthCloudWorkflowService()
        try:
            auth = service.request_otp(
                enrollment=enrollment,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                contact_id=serializer.validated_data["contact_id"],
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceVisitAuthorizationSerializer(auth).data)

    @action(detail=True, methods=["post"], url_path="start-visit")
    def start_visit(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = StartVisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        encounter_id = data.pop("encounter", None)
        encounter = None
        if encounter_id:
            encounter = get_object_or_404(
                Encounter,
                pk=encounter_id,
                facility=getattr(request, "facility", None),
            )
        service = HealthCloudWorkflowService()
        try:
            auth = service.start_visit(
                enrollment=enrollment,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                payload=data,
                encounter=encounter,
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceVisitAuthorizationSerializer(auth).data)


# ---------------------------------------------------------------------------
# InsuranceProviderConfig
# ---------------------------------------------------------------------------
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(response)


# ---------------------------------------------------------------------------
# InsuranceClaim
# ---------------------------------------------------------------------------
class InsuranceClaimViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
            except Exception as exc:
                return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"claim": InsuranceClaimSerializer(claim).data, "remittance": response})


# ---------------------------------------------------------------------------
# InsuranceClaimItem (nested)
# ---------------------------------------------------------------------------
class InsuranceClaimItemViewSet(viewsets.ModelViewSet):
    """CRUD for claim line items (nested under claim)."""

    queryset = InsuranceClaimItem.objects.all()
    serializer_class = InsuranceClaimItemSerializer
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]

    def get_queryset(self):
        return self.queryset.filter(claim_id=self.kwargs.get("claim_pk"))

    def perform_create(self, serializer):
        serializer.save(claim_id=self.kwargs.get("claim_pk"))


# ---------------------------------------------------------------------------
# InsurancePreauth
# ---------------------------------------------------------------------------
class InsurancePreauthViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD + lifecycle for pre-authorizations (facility-scoped)."""

    queryset = InsurancePreauth.objects.select_related(
        "provider",
        "patient",
        "patient_insurance",
        "patient_insurance__plan",
    ).all()
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
        try:
            preauth.submit(user=request.user)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsurancePreauthSerializer(preauth).data)

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
class InsuranceRemittanceViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for insurance remittances (facility-scoped)."""

    queryset = (
        InsuranceRemittance.objects.select_related("provider")
        .prefetch_related("lines", "lines__claim")
        .all()
    )

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
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InsuranceRemittanceSerializer(remittance).data)

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

        return Response(
            {
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
                    "partial": remittances_qs.filter(
                        status=InsuranceRemittance.Status.PARTIAL
                    ).count(),
                    "reconciled": remittances_qs.filter(
                        status=InsuranceRemittance.Status.RECONCILED
                    ).count(),
                    "disputed": remittances_qs.filter(
                        status=InsuranceRemittance.Status.DISPUTED
                    ).count(),
                },
            }
        )


# ---------------------------------------------------------------------------
# InsuranceRemittanceLine
# ---------------------------------------------------------------------------
class InsuranceRemittanceLineViewSet(viewsets.ModelViewSet):
    """CRUD for remittance lines (nested under remittance)."""

    queryset = InsuranceRemittanceLine.objects.select_related("claim").all()
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
class PayerTariffViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for payer tariff mappings (org-scoped)."""

    queryset = PayerTariff.objects.select_related("provider", "plan", "service").all()

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
