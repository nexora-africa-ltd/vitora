# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Insurance views core for Vitora HMIS.

What this file is for:
- Implement views core logic for the insurance domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
import re
from importlib import import_module

from django.core.exceptions import ValidationError
from django.db import DatabaseError, IntegrityError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import RequiresActiveShiftPermission
from hmis.apps.encounters.models import Encounter
from hmis.apps.insurance.bootstrap import seed_slade_defaults
from hmis.apps.insurance.filters import (
    InsurancePlanFilter,
    InsuranceProviderFilter,
    PatientInsuranceFilter,
)
from hmis.apps.insurance.media_security import read_decrypted_card_image, validate_card_image_token
from hmis.apps.insurance.models import (
    FacilitySladeCredential,
    InsurancePlan,
    InsuranceProvider,
    InsuranceProviderConfig,
    InsuranceVisitAuthorization,
    PatientInsurance,
)
from hmis.apps.insurance.serializers import (
    FacilitySladeCredentialSerializer,
    HealthCloudGetHealthIdSerializer,
    HealthCloudPostProfileSerializer,
    HealthCloudSessionRequestOTPSerializer,
    HealthCloudSessionStartVisitSerializer,
    InsurancePlanCreateSerializer,
    InsurancePlanSerializer,
    InsuranceProviderCreateSerializer,
    InsuranceProviderSerializer,
    InsuranceVisitAuthorizationSerializer,
    PatientInsuranceCreateSerializer,
    PatientInsuranceSerializer,
    RequestOTPSerializer,
    StartVisitSerializer,
    VerifyEnrollmentPreviewSerializer,
)
from hmis.apps.insurance.services.errors import InsuranceApiError
from hmis.apps.insurance.services.insurance_services import (
    HealthCloudWorkflowService,
    InsuranceEligibilityService,
)

logger = logging.getLogger(__name__)


def legacy_insurance_views_module():
    """Return compatibility shim module for patch-friendly dependency lookups."""
    return import_module("hmis.apps.insurance.views")


def _insurance_handled_exceptions() -> tuple[type[Exception], ...]:
    return (
        InsuranceApiError,
        ValidationError,
        DRFValidationError,
        IntegrityError,
        DatabaseError,
        ValueError,
        TypeError,
        RuntimeError,
    )


def _insurance_error_response(
    *, action: str, exc: Exception, fallback: str = "Insurance operation failed."
) -> Response:
    logger.warning(
        "Insurance action failed",
        extra={"action": action, "error_class": exc.__class__.__name__, "error": str(exc)},
    )
    message = str(exc) or fallback
    return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# FacilitySladeCredential
# ---------------------------------------------------------------------------
class FacilitySladeCredentialViewSet(
    ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet
):
    """CRUD for facility-level Slade OAuth credentials."""

    queryset = FacilitySladeCredential.objects.select_related("facility").order_by("-updated_at")
    serializer_class = FacilitySladeCredentialSerializer
    tenant_scope = "facility"

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        """Upsert facility credentials to avoid unique-constraint collisions."""
        resolve_request_tenant(request)
        tenant_kwargs = self.get_tenant_save_kwargs()
        facility = tenant_kwargs.get(self.tenant_facility_field) or getattr(
            request, "facility", None
        )
        organization = tenant_kwargs.get("organization") or getattr(request, "organization", None)
        existing = None
        if facility is not None:
            existing = FacilitySladeCredential.objects.filter(
                facility=facility,
            ).first()

        if existing is not None:
            serializer = self.get_serializer(existing, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            save_kwargs: dict[str, object] = {}
            if getattr(existing, "organization_id", None) is None and organization is not None:
                save_kwargs["organization"] = organization
            if getattr(existing, "facility_id", None) is None and facility is not None:
                save_kwargs["facility"] = facility
            serializer.save(**save_kwargs)
            return Response(serializer.data, status=status.HTTP_200_OK)

        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            if facility is None:
                raise
            existing = FacilitySladeCredential.objects.filter(facility=facility).first()
            if existing is None:
                raise
            serializer = self.get_serializer(existing, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# InsuranceProvider
# ---------------------------------------------------------------------------
class InsuranceProviderViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD for insurance providers (org-scoped)."""

    queryset = InsuranceProvider.objects.all()
    audit_resource_type = "InsuranceProvider"
    audit_action_prefix = "insurance.provider"
    audit_source = "insurance_api"

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
class InsurancePlanViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD for insurance plans (org-scoped)."""

    queryset = InsurancePlan.objects.select_related("provider").all()
    audit_resource_type = "InsurancePlan"
    audit_action_prefix = "insurance.plan"
    audit_source = "insurance_api"

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
class PatientInsuranceViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD for patient insurance enrollments (org-scoped)."""

    queryset = PatientInsurance.objects.select_related(
        "patient", "plan", "plan__provider", "provider"
    ).all()
    audit_resource_type = "PatientInsurance"
    audit_action_prefix = "insurance.enrollment"
    audit_source = "insurance_api"

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
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="verify_via_healthcloud", exc=exc)
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

        adapter = legacy_insurance_views_module().get_adapter(config)
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
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="verify_via_healthcloud_preview", exc=exc)

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
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="healthcloud_session_start", exc=exc)

        return Response(
            {
                "session": InsuranceVisitAuthorizationSerializer(session).data,
                "eligibility": self._eligibility_payload(result),
            }
        )

    @action(detail=True, methods=["post"], url_path="healthcloud/post-profile")
    def healthcloud_post_profile(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = HealthCloudPostProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = HealthCloudWorkflowService()
        try:
            identity = service.post_profile_to_crm(
                enrollment=enrollment,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                payload=dict(serializer.validated_data),
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="healthcloud_post_profile", exc=exc)

        refreshed = PatientInsurance.objects.select_related(
            "patient", "plan", "plan__provider", "provider"
        ).get(pk=enrollment.pk)
        return Response(
            {
                "enrollment": PatientInsuranceSerializer(
                    refreshed, context={"request": request}
                ).data,
                "identity": identity,
            }
        )

    @action(detail=True, methods=["post"], url_path="healthcloud/get-health-id")
    def healthcloud_get_health_id(self, request, pk=None):
        enrollment = self.get_object()
        try:
            self._ensure_healthcloud_enabled(enrollment)
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = HealthCloudGetHealthIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = HealthCloudWorkflowService()
        try:
            identity = service.get_health_id(
                enrollment=enrollment,
                facility=getattr(request, "facility", None),
                organization=getattr(request, "organization", None),
                profile_id=serializer.validated_data.get("profile_id", ""),
            )
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="healthcloud_get_health_id", exc=exc)

        refreshed = PatientInsurance.objects.select_related(
            "patient", "plan", "plan__provider", "provider"
        ).get(pk=enrollment.pk)
        return Response(
            {
                "enrollment": PatientInsuranceSerializer(
                    refreshed, context={"request": request}
                ).data,
                "identity": identity,
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
        except (OSError, ValueError, TypeError) as exc:
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
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="healthcloud_session_request_otp", exc=exc)

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
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="healthcloud_session_start_visit", exc=exc)

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
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="request_otp", exc=exc)
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
        except _insurance_handled_exceptions() as exc:
            return _insurance_error_response(action="start_visit", exc=exc)
        return Response(InsuranceVisitAuthorizationSerializer(auth).data)


# ---------------------------------------------------------------------------
# InsuranceProviderConfig
# ---------------------------------------------------------------------------
