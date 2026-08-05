# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Views for the insurance app."""

import logging

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
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
        if self.action == "create":
            return PatientInsuranceCreateSerializer
        return PatientInsuranceSerializer

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
        return Response(
            {
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
        )

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

        return Response(
            {
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
        )

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
        payload = dict(serializer.validated_data)
        payload["claim"] = payload.get("claim") or claim.external_claim_id
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
        serializer = UploadClaimAttachmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        payload["claim"] = payload.get("claim") or claim.external_claim_id
        service = HealthCloudWorkflowService()
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
