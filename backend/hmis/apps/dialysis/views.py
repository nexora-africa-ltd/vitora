"""Dialysis views."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import WriteRequiresRolePermission

from .models import DialysisOrder, DialysisSession, OrderStatus, SessionStatus, VascularAccess
from .permissions import CanManageDialysis, CanPerformDialysis
from .serializers import (
    DialysisOrderCreateSerializer,
    DialysisOrderDetailSerializer,
    DialysisOrderListSerializer,
    DialysisSessionCreateSerializer,
    DialysisSessionDetailSerializer,
    DialysisSessionListSerializer,
    VascularAccessCreateSerializer,
    VascularAccessDetailSerializer,
    VascularAccessListSerializer,
)

# =============================================================================
# Filters
# =============================================================================


class VascularAccessFilter(filters.FilterSet):
    patient = filters.NumberFilter()
    status = filters.CharFilter()
    access_type = filters.CharFilter()

    class Meta:
        model = VascularAccess
        fields = ["patient", "status", "access_type"]


class DialysisOrderFilter(filters.FilterSet):
    patient = filters.NumberFilter()
    status = filters.CharFilter()
    dialysis_type = filters.CharFilter()

    class Meta:
        model = DialysisOrder
        fields = ["patient", "status", "dialysis_type"]


class DialysisSessionFilter(filters.FilterSet):
    patient = filters.NumberFilter()
    status = filters.CharFilter()
    dialysis_type = filters.CharFilter()
    scheduled_date = filters.DateFilter()
    scheduled_date_gte = filters.DateFilter(field_name="scheduled_date", lookup_expr="gte")
    scheduled_date_lte = filters.DateFilter(field_name="scheduled_date", lookup_expr="lte")

    class Meta:
        model = DialysisSession
        fields = ["patient", "status", "dialysis_type", "scheduled_date"]


# =============================================================================
# ViewSets
# =============================================================================


class VascularAccessViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = VascularAccess.objects.select_related("patient", "placed_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = VascularAccessFilter
    search_fields = ["patient__first_name", "patient__last_name", "patient__mrn", "site"]
    ordering_fields = ["placed_date", "created_at"]
    tenant_scope = "facility"

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action not in ("list", "retrieve"):
            permissions.append(CanManageDialysis())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return VascularAccessCreateSerializer
        if self.action == "list":
            return VascularAccessListSerializer
        return VascularAccessDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())


class DialysisOrderViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = DialysisOrder.objects.select_related("patient", "ordered_by", "vascular_access")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = DialysisOrderFilter
    search_fields = ["patient__first_name", "patient__last_name", "patient__mrn"]
    ordering_fields = ["created_at", "start_date", "status"]
    tenant_scope = "facility"

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action not in ("list", "retrieve"):
            permissions.append(CanManageDialysis())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return DialysisOrderCreateSerializer
        if self.action == "list":
            return DialysisOrderListSerializer
        return DialysisOrderDetailSerializer

    def perform_create(self, serializer):
        serializer.save(ordered_by=self.request.user, **self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        """Suspend a dialysis order."""
        obj = self.get_object()
        if obj.status != OrderStatus.ACTIVE:
            return Response(
                {"error": "Only active orders can be suspended."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.status = OrderStatus.SUSPENDED
        obj.save(update_fields=["status", "updated_at"])
        return Response(DialysisOrderDetailSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        """Resume a suspended order."""
        obj = self.get_object()
        if obj.status != OrderStatus.SUSPENDED:
            return Response(
                {"error": "Only suspended orders can be resumed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.status = OrderStatus.ACTIVE
        obj.save(update_fields=["status", "updated_at"])
        return Response(DialysisOrderDetailSerializer(obj).data)


class DialysisSessionViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = DialysisSession.objects.select_related("patient", "order", "performed_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = DialysisSessionFilter
    search_fields = ["session_number", "patient__first_name", "patient__last_name", "patient__mrn"]
    ordering_fields = ["scheduled_date", "start_time", "status", "created_at"]
    tenant_scope = "facility"

    SESSION_ACTIONS = {"start", "complete", "abort"}

    def get_permissions(self):
        permissions = [IsAuthenticated()]
        if self.action in self.SESSION_ACTIONS:
            permissions.append(CanPerformDialysis())
        elif self.action not in ("list", "retrieve"):
            permissions.append(CanManageDialysis())
        return permissions

    def get_serializer_class(self):
        if self.action == "create":
            return DialysisSessionCreateSerializer
        if self.action == "list":
            return DialysisSessionListSerializer
        return DialysisSessionDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Start a dialysis session."""
        obj = self.get_object()
        if obj.status != SessionStatus.SCHEDULED:
            return Response(
                {"error": "Only scheduled sessions can be started."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        obj.start(user=request.user)
        return Response(DialysisSessionDetailSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Complete a dialysis session."""
        obj = self.get_object()
        if obj.status != SessionStatus.IN_PROGRESS:
            return Response(
                {"error": "Only in-progress sessions can be completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Update post-vitals if provided
        for field in ["post_weight_kg", "post_bp", "post_pulse", "uf_achieved_ml"]:
            if field in request.data:
                setattr(obj, field, request.data[field])
        obj.complete()
        return Response(DialysisSessionDetailSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def abort(self, request, pk=None):
        """Abort a session early."""
        obj = self.get_object()
        if obj.status != SessionStatus.IN_PROGRESS:
            return Response(
                {"error": "Only in-progress sessions can be aborted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get("reason", "")
        obj.abort(reason)
        return Response(DialysisSessionDetailSerializer(obj).data)
