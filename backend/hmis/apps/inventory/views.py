"""
ViewSets for the Inventory app.

Follows project conventions:
- TenantScopedViewMixin for multi-tenancy
- ReadOnCreateMixin for returning full read serializer on 201
- get_serializer_class() routing per action
- Custom @action for state transitions
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.inventory.filters import GoodsReceiptNoteFilter, PurchaseOrderFilter, SupplierFilter
from hmis.apps.inventory.models import GoodsReceiptNote, PurchaseOrder, Supplier
from hmis.apps.inventory.serializers import (
    GoodsReceiptNoteCreateSerializer,
    GoodsReceiptNoteDetailSerializer,
    GoodsReceiptNoteListSerializer,
    POApproveSerializer,
    POCancelSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderDetailSerializer,
    PurchaseOrderItemSerializer,
    PurchaseOrderListSerializer,
    SupplierCreateSerializer,
    SupplierSerializer,
)

# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------


class SupplierViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD for suppliers. Organization-scoped."""

    queryset = Supplier.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = SupplierFilter
    search_fields = ["name", "code", "contact_person"]
    tenant_scope = "organization"

    def get_serializer_class(self):
        if self.action == "create":
            return SupplierCreateSerializer
        return SupplierSerializer

    @action(detail=True, methods=["post"])
    def toggle_active(self, request, pk=None):
        """Toggle supplier active status."""
        supplier = self.get_object()
        supplier.is_active = not supplier.is_active
        supplier.save(update_fields=["is_active", "updated_at"])
        return Response(SupplierSerializer(supplier).data)


# ---------------------------------------------------------------------------
# Purchase Order
# ---------------------------------------------------------------------------


class PurchaseOrderViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD + state transitions for purchase orders. Facility-scoped."""

    queryset = PurchaseOrder.objects.select_related(
        "supplier", "ordered_by", "approved_by"
    ).prefetch_related("items__drug")
    permission_classes = [IsAuthenticated]
    filterset_class = PurchaseOrderFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return PurchaseOrderCreateSerializer
        if self.action == "list":
            return PurchaseOrderListSerializer
        if self.action == "approve":
            return POApproveSerializer
        if self.action == "cancel":
            return POCancelSerializer
        return PurchaseOrderDetailSerializer

    def perform_create(self, serializer):
        serializer.save(
            ordered_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """DRAFT → SUBMITTED."""
        po = self.get_object()
        try:
            po.submit()
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PurchaseOrderDetailSerializer(po).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """SUBMITTED → APPROVED."""
        po = self.get_object()
        serializer = POApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            po.approve(user=request.user)
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        if serializer.validated_data.get("notes"):
            po.notes = (po.notes + "\n" + serializer.validated_data["notes"]).strip()
            po.save(update_fields=["notes", "updated_at"])
        return Response(PurchaseOrderDetailSerializer(po).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Any non-terminal → CANCELLED."""
        po = self.get_object()
        serializer = POCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            po.cancel(user=request.user, reason=serializer.validated_data.get("reason", ""))
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PurchaseOrderDetailSerializer(po).data)

    @action(detail=True, methods=["get"])
    def items(self, request, pk=None):
        """List items for a specific PO."""
        po = self.get_object()
        serializer = PurchaseOrderItemSerializer(po.items.select_related("drug"), many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Goods Receipt Note
# ---------------------------------------------------------------------------


class GoodsReceiptNoteViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD + confirm for goods receipt notes. Facility-scoped."""

    queryset = GoodsReceiptNote.objects.select_related(
        "supplier", "purchase_order", "received_by", "confirmed_by"
    ).prefetch_related("items__drug", "items__po_item", "items__stock_batch")
    permission_classes = [IsAuthenticated]
    filterset_class = GoodsReceiptNoteFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return GoodsReceiptNoteCreateSerializer
        if self.action == "list":
            return GoodsReceiptNoteListSerializer
        return GoodsReceiptNoteDetailSerializer

    def perform_create(self, serializer):
        serializer.save(
            received_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """DRAFT → CONFIRMED. Creates StockBatch records."""
        grn = self.get_object()
        try:
            grn.confirm(user=request.user)
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        # Re-fetch with full relations
        grn.refresh_from_db()
        return Response(GoodsReceiptNoteDetailSerializer(grn).data)

    @action(detail=True, methods=["post"])
    def cancel_grn(self, request, pk=None):
        """DRAFT → CANCELLED."""
        grn = self.get_object()
        try:
            grn.cancel()
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(GoodsReceiptNoteDetailSerializer(grn).data)

    @action(detail=False, methods=["get"])
    def by_purchase_order(self, request):
        """List GRNs for a specific PO."""
        po_id = request.query_params.get("purchase_order")
        if not po_id:
            return Response(
                {"error": "purchase_order query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        grns = self.get_queryset().filter(purchase_order_id=po_id)
        serializer = GoodsReceiptNoteListSerializer(grns, many=True)
        return Response(serializer.data)
