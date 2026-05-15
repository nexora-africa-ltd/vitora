"""Views for the insurance app."""

import logging

from django.core.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import RequiresActiveShiftPermission
from hmis.apps.insurance.filters import (
    InsuranceClaimFilter,
    InsurancePlanFilter,
    InsurancePreauthFilter,
    InsuranceProviderFilter,
    PatientInsuranceFilter,
    PayerTariffFilter,
)
from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsuranceClaimItem,
    InsurancePlan,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceProviderConfig,
    InsuranceRemittance,
    InsuranceRemittanceLine,
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
    PatientInsuranceCreateSerializer,
    PatientInsuranceSerializer,
    PayerTariffCreateSerializer,
    PayerTariffSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# InsuranceProvider
# ---------------------------------------------------------------------------
class InsuranceProviderViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for insurance providers (org-scoped)."""

    queryset = InsuranceProvider.objects.all()
    permission_classes = [IsAuthenticated]
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


# ---------------------------------------------------------------------------
# InsurancePlan
# ---------------------------------------------------------------------------
class InsurancePlanViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for insurance plans (org-scoped)."""

    queryset = InsurancePlan.objects.select_related("provider").all()
    permission_classes = [IsAuthenticated]
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
    permission_classes = [IsAuthenticated]
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

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        """Mark enrollment as verified."""
        enrollment = self.get_object()
        enrollment.status = PatientInsurance.Status.ACTIVE
        enrollment.verified_at = __import__("django.utils.timezone", fromlist=["now"]).now()
        enrollment.verified_by = request.user
        enrollment.save(update_fields=["status", "verified_at", "verified_by", "updated_at"])
        return Response(PatientInsuranceSerializer(enrollment).data)


# ---------------------------------------------------------------------------
# InsuranceProviderConfig
# ---------------------------------------------------------------------------
class InsuranceProviderConfigViewSet(
    ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet
):
    """CRUD for per-facility provider configs (facility-scoped)."""

    queryset = InsuranceProviderConfig.objects.select_related("provider", "facility").all()
    serializer_class = InsuranceProviderConfigSerializer
    permission_classes = [IsAuthenticated]
    tenant_scope = "facility"
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["provider", "accreditation_status", "api_enabled"]


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
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    tenant_scope = "facility"
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


# ---------------------------------------------------------------------------
# InsuranceClaimItem (nested)
# ---------------------------------------------------------------------------
class InsuranceClaimItemViewSet(viewsets.ModelViewSet):
    """CRUD for claim line items (nested under claim)."""

    queryset = InsuranceClaimItem.objects.all()
    serializer_class = InsuranceClaimItemSerializer
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    tenant_scope = "facility"
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
    permission_classes = [IsAuthenticated]
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


# ---------------------------------------------------------------------------
# InsuranceRemittanceLine
# ---------------------------------------------------------------------------
class InsuranceRemittanceLineViewSet(viewsets.ModelViewSet):
    """CRUD for remittance lines (nested under remittance)."""

    queryset = InsuranceRemittanceLine.objects.select_related("claim").all()
    serializer_class = InsuranceRemittanceLineSerializer
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]
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
