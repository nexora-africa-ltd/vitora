# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Blood Bank views."""

from django.core.exceptions import ValidationError
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

from .models import (
    BloodDonor,
    BloodIssue,
    BloodRequest,
    BloodUnit,
    CrossMatch,
    CrossMatchResult,
    RequestStatus,
    UnitStatus,
    UnitStatusChangeSource,
)
from .permissions import CanIssueBloodUnit, CanManageBloodBank, CanPerformCrossMatch
from .serializers import (
    BloodDonorCreateSerializer,
    BloodDonorDetailSerializer,
    BloodDonorListSerializer,
    BloodIssueCompleteSerializer,
    BloodIssueCreateSerializer,
    BloodIssueSerializer,
    BloodRequestCreateSerializer,
    BloodRequestDetailSerializer,
    BloodRequestListSerializer,
    BloodUnitCreateSerializer,
    BloodUnitDetailSerializer,
    BloodUnitListSerializer,
    BloodUnitStatusTransitionSerializer,
    CrossMatchCreateSerializer,
    CrossMatchSerializer,
)


def _validation_error_message(exc: ValidationError, fallback: str) -> str:
    messages = list(exc.messages)
    if messages:
        return str(messages[0])
    return fallback


# =============================================================================
# Filters
# =============================================================================


class BloodDonorFilter(filters.FilterSet):
    blood_group = filters.CharFilter()
    is_active = filters.BooleanFilter()

    class Meta:
        model = BloodDonor
        fields = ["blood_group", "is_active"]


class BloodUnitFilter(filters.FilterSet):
    blood_group = filters.CharFilter()
    component = filters.CharFilter()
    status = filters.CharFilter()

    class Meta:
        model = BloodUnit
        fields = ["blood_group", "component", "status"]


class BloodRequestFilter(filters.FilterSet):
    status = filters.CharFilter()
    urgency = filters.CharFilter()
    blood_group = filters.CharFilter()
    patient = filters.NumberFilter()

    class Meta:
        model = BloodRequest
        fields = ["status", "urgency", "blood_group", "patient"]


# =============================================================================
# ViewSets
# =============================================================================


class BloodDonorViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = BloodDonor.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filterset_class = BloodDonorFilter
    search_fields = ["first_name", "last_name", "donor_number"]
    ordering_fields = ["created_at", "last_donation_date", "blood_group"]
    tenant_scope = "facility"

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action not in ("list", "retrieve"):
            permissions.append(CanManageBloodBank())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return BloodDonorCreateSerializer
        if self.action == "list":
            return BloodDonorListSerializer
        return BloodDonorDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())


class BloodUnitViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = BloodUnit.objects.select_related("donor")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filterset_class = BloodUnitFilter
    search_fields = ["unit_number", "donor__first_name", "donor__last_name"]
    ordering_fields = ["collection_date", "expiry_date", "blood_group", "status"]
    tenant_scope = "facility"

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action in ("mark_available", "quarantine", "transition") or self.action not in (
            "list",
            "retrieve",
        ):
            permissions.append(CanManageBloodBank())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return BloodUnitCreateSerializer
        if self.action == "list":
            return BloodUnitListSerializer
        return BloodUnitDetailSerializer

    def perform_create(self, serializer):
        instance = serializer.save(**self.get_tenant_save_kwargs())
        # Update donor last donation date
        donor = instance.donor
        donor.last_donation_date = (
            instance.collection_date.date() if instance.collection_date else None
        )
        donor.total_donations += 1
        donor.save(update_fields=["last_donation_date", "total_donations", "updated_at"])

    @action(detail=True, methods=["post"])
    def mark_available(self, request, pk=None):
        """Mark unit as available after screening."""
        unit = self.get_object()
        try:
            unit.transition_to(
                UnitStatus.AVAILABLE,
                changed_by=request.user,
                reason="Manual release after screening review.",
                source=UnitStatusChangeSource.MANUAL,
            )
        except ValidationError as exc:
            return Response(
                {
                    "error": _validation_error_message(
                        exc,
                        "Unable to mark blood unit as available.",
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(BloodUnitDetailSerializer(unit).data)

    @action(detail=True, methods=["post"])
    def quarantine(self, request, pk=None):
        """Quarantine a unit."""
        reason = request.data.get("reason", "")
        unit = self.get_object()
        try:
            unit.transition_to(
                UnitStatus.QUARANTINED,
                changed_by=request.user,
                reason=reason or "Manual quarantine requested.",
                source=UnitStatusChangeSource.MANUAL,
            )
        except ValidationError as exc:
            return Response(
                {
                    "error": _validation_error_message(
                        exc,
                        "Unable to quarantine blood unit.",
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(BloodUnitDetailSerializer(unit).data)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        """Transition a blood unit using lifecycle guard rails."""
        unit = self.get_object()
        serializer = BloodUnitStatusTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            unit.transition_to(
                serializer.validated_data["target_status"],
                changed_by=request.user,
                reason=serializer.validated_data.get("reason", ""),
                source=UnitStatusChangeSource.MANUAL,
            )
        except ValidationError as exc:
            return Response(
                {
                    "error": _validation_error_message(
                        exc,
                        "Unable to transition blood unit status.",
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(BloodUnitDetailSerializer(unit).data)


class BloodRequestViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = BloodRequest.objects.select_related("patient", "requested_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filterset_class = BloodRequestFilter
    search_fields = ["request_number", "patient__first_name", "patient__last_name", "patient__mrn"]
    ordering_fields = ["created_at", "urgency", "status"]
    tenant_scope = "facility"

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action not in ("list", "retrieve"):
            permissions.append(CanManageBloodBank())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return BloodRequestCreateSerializer
        if self.action == "list":
            return BloodRequestListSerializer
        return BloodRequestDetailSerializer

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user, **self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a blood request."""
        obj = self.get_object()
        if obj.status in (RequestStatus.ISSUED, RequestStatus.TRANSFUSED):
            return Response(
                {"error": "Cannot cancel a request that has been issued or transfused."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get("reason", "")
        obj.cancel(reason)
        return Response(BloodRequestDetailSerializer(obj).data)


class CrossMatchViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = CrossMatch.objects.select_related("blood_request", "blood_unit", "performed_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    search_fields = ["blood_unit__unit_number", "blood_request__request_number"]
    tenant_scope = "facility"

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action not in ("list", "retrieve"):
            permissions.append(CanPerformCrossMatch())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return CrossMatchCreateSerializer
        return CrossMatchSerializer

    def perform_create(self, serializer):
        instance = serializer.save(performed_by=self.request.user, **self.get_tenant_save_kwargs())
        if instance.blood_request.status == RequestStatus.PENDING:
            instance.blood_request.status = RequestStatus.CROSSMATCH_PENDING
            instance.blood_request.save(update_fields=["status", "updated_at"])

    @action(detail=True, methods=["post"])
    def record_result(self, request, pk=None):
        """Record cross-match result."""
        obj = self.get_object()
        result = request.data.get("result")
        if result not in [CrossMatchResult.COMPATIBLE, CrossMatchResult.INCOMPATIBLE]:
            return Response(
                {"error": "result must be COMPATIBLE or INCOMPATIBLE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.result = result
        obj.save(update_fields=["result", "updated_at"])

        # If compatible, update request status and auto-reserve the blood unit
        if result == CrossMatchResult.COMPATIBLE:
            blood_request = obj.blood_request
            if blood_request.status == RequestStatus.CROSSMATCH_PENDING:
                blood_request.status = RequestStatus.READY
                blood_request.save(update_fields=["status", "updated_at"])

            active_request_statuses = {
                RequestStatus.PENDING,
                RequestStatus.CROSSMATCH_PENDING,
                RequestStatus.READY,
            }

            if blood_request.status in active_request_statuses:
                blood_unit = obj.blood_unit
                if blood_unit.status == UnitStatus.AVAILABLE:
                    try:
                        blood_unit.transition_to(
                            UnitStatus.RESERVED,
                            changed_by=request.user,
                            reason=(
                                "Auto-reserved after compatible crossmatch "
                                f"#{obj.pk} for request {blood_request.request_number}"
                            ),
                            source=UnitStatusChangeSource.AUTOMATED,
                        )
                    except ValidationError as exc:
                        reserve_note = f"Auto-reserve failed: {exc}"
                        obj.notes = (
                            f"{obj.notes}\n{reserve_note}".strip() if obj.notes else reserve_note
                        )
                        obj.save(update_fields=["notes", "updated_at"])
        return Response(CrossMatchSerializer(obj).data)


class BloodIssueViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = BloodIssue.objects.select_related(
        "blood_request", "blood_unit", "crossmatch", "issued_by"
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    search_fields = ["blood_unit__unit_number", "blood_request__request_number"]
    tenant_scope = "facility"

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action not in ("list", "retrieve"):
            permissions.append(CanIssueBloodUnit())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return BloodIssueCreateSerializer
        if self.action == "complete_transfusion":
            return BloodIssueCompleteSerializer
        return BloodIssueSerializer

    def perform_create(self, serializer):
        serializer.save(issued_by=self.request.user, **self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"], url_path="complete-transfusion")
    def complete_transfusion(self, request, pk=None):
        """Record transfusion completion and any reaction."""
        obj = self.get_object()
        serializer = BloodIssueCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj.complete_transfusion(
            reaction=serializer.validated_data.get("reaction", "NONE"),
            details=serializer.validated_data.get("details", ""),
        )
        return Response(BloodIssueSerializer(obj).data)
