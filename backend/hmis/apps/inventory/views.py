"""
ViewSets for the Inventory app.

Follows project conventions:
- TenantScopedViewMixin for multi-tenancy
- ReadOnCreateMixin for returning full read serializer on 201
- get_serializer_class() routing per action
- Custom @action for state transitions
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import RequiresActiveShiftPermission, WriteRequiresRolePermission
from hmis.apps.inventory.filters import (
    ConsumptionRecordFilter,
    DemandForecastFilter,
    ETIMSInvoiceFilter,
    GoodsReceiptNoteFilter,
    PurchaseOrderFilter,
    ReorderSuggestionFilter,
    StockCountFilter,
    StockTransferFilter,
    StoreLocationFilter,
    SupplierFilter,
    WardStockFilter,
    WardStockTransactionFilter,
)
from hmis.apps.inventory.models import (
    ConsumptionRecord,
    DemandForecast,
    ETIMSConfig,
    ETIMSInvoice,
    GoodsReceiptNote,
    PaymentTerm,
    PurchaseOrder,
    ReorderSuggestion,
    StockCount,
    StockTransfer,
    StoreLocation,
    Supplier,
    WardStock,
    WardStockTransaction,
    WardTransactionType,
)
from hmis.apps.inventory.serializers import (
    ETIMSConfigCreateSerializer,
    ETIMSConfigSerializer,
    ETIMSInvoiceCreateSerializer,
    ETIMSInvoiceSerializer,
    GoodsReceiptNoteCreateSerializer,
    GoodsReceiptNoteDetailSerializer,
    GoodsReceiptNoteListSerializer,
    PaymentTermSerializer,
    POApproveSerializer,
    POCancelSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderDetailSerializer,
    PurchaseOrderItemSerializer,
    PurchaseOrderListSerializer,
    StockCountCreateSerializer,
    StockCountDetailSerializer,
    StockCountItemSerializer,
    StockCountItemUpdateSerializer,
    StockCountListSerializer,
    StockTransferCreateSerializer,
    StockTransferDetailSerializer,
    StockTransferListSerializer,
    StoreLocationCreateSerializer,
    StoreLocationSerializer,
    SupplierCreateSerializer,
    SupplierSerializer,
    TransferApproveSerializer,
    TransferCancelSerializer,
    TransferItemSerializer,
    WardConsumeSerializer,
    WardReplenishSerializer,
    WardReturnSerializer,
    WardStockCreateSerializer,
    WardStockSerializer,
    WardStockTransactionSerializer,
)

# ---------------------------------------------------------------------------
# Payment Terms
# ---------------------------------------------------------------------------


class PaymentTermViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for configurable payment terms. Organization-scoped."""

    queryset = PaymentTerm.objects.all()
    serializer_class = PaymentTermSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "organization"
    search_fields = ["code", "name"]


# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------


class SupplierViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD for suppliers. Organization-scoped."""

    queryset = Supplier.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
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

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, RequiresActiveShiftPermission],
    )
    def approve(self, request, pk=None):
        """SUBMITTED → APPROVED. Requires ``inventory.approve_purchase_order``."""
        if not request.user.has_perm("inventory.approve_purchase_order"):
            return Response(
                {"error": "You do not have permission to approve purchase orders."},
                status=status.HTTP_403_FORBIDDEN,
            )
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
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
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


# ===========================================================================
# Phase 2: Multi-Store Stock Transfers
# ===========================================================================


# ---------------------------------------------------------------------------
# Store Location
# ---------------------------------------------------------------------------


class StoreLocationViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD for store locations within a facility. Facility-scoped."""

    queryset = StoreLocation.objects.select_related("managed_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = StoreLocationFilter
    search_fields = ["name", "code"]
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return StoreLocationCreateSerializer
        return StoreLocationSerializer


# ---------------------------------------------------------------------------
# Stock Transfer
# ---------------------------------------------------------------------------


class StockTransferViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD + state transitions for stock transfers. Organization-scoped."""

    queryset = StockTransfer.objects.select_related(
        "source_facility",
        "destination_facility",
        "source_store",
        "destination_store",
        "requested_by",
        "approved_by",
        "dispatched_by",
        "received_by",
    ).prefetch_related("items__drug", "items__source_batch", "items__destination_batch")
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    filterset_class = StockTransferFilter
    tenant_scope = "organization"

    def get_serializer_class(self):
        if self.action == "create":
            return StockTransferCreateSerializer
        if self.action == "list":
            return StockTransferListSerializer
        if self.action == "approve":
            return TransferApproveSerializer
        if self.action == "cancel":
            return TransferCancelSerializer
        return StockTransferDetailSerializer

    def perform_create(self, serializer):
        serializer.save(
            requested_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """DRAFT → REQUESTED."""
        transfer = self.get_object()
        try:
            transfer.submit()
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockTransferDetailSerializer(transfer).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, RequiresActiveShiftPermission],
    )
    def approve(self, request, pk=None):
        """REQUESTED → APPROVED. Requires ``inventory.approve_stock_transfer``."""
        if not request.user.has_perm("inventory.approve_stock_transfer"):
            return Response(
                {"error": "You do not have permission to approve stock transfers."},
                status=status.HTTP_403_FORBIDDEN,
            )
        transfer = self.get_object()
        serializer = TransferApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transfer.approve(user=request.user)
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        if serializer.validated_data.get("notes"):
            transfer.notes = (transfer.notes + "\n" + serializer.validated_data["notes"]).strip()
            transfer.save(update_fields=["notes", "updated_at"])
        return Response(StockTransferDetailSerializer(transfer).data)

    @action(detail=True, methods=["post"])
    def dispatch_transfer(self, request, pk=None):
        """APPROVED → IN_TRANSIT. Deducts source stock."""
        transfer = self.get_object()
        try:
            transfer.dispatch(user=request.user)
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockTransferDetailSerializer(transfer).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """IN_TRANSIT → RECEIVED. Creates stock at destination."""
        transfer = self.get_object()
        try:
            transfer.receive(user=request.user)
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        # Re-fetch with full relations to include destination_batch
        transfer = self.get_queryset().get(pk=transfer.pk)
        return Response(StockTransferDetailSerializer(transfer).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Any non-terminal → CANCELLED."""
        transfer = self.get_object()
        serializer = TransferCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            transfer.cancel(
                reason=serializer.validated_data.get("reason", ""),
            )
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockTransferDetailSerializer(transfer).data)

    @action(detail=True, methods=["get"])
    def items(self, request, pk=None):
        """List items for a specific transfer."""
        transfer = self.get_object()
        serializer = TransferItemSerializer(
            transfer.items.select_related("drug", "source_batch"), many=True
        )
        return Response(serializer.data)


# ===========================================================================
# Phase 3: Ward / Satellite Stock
# ===========================================================================


class WardStockViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD + consume/replenish/return for ward stock levels. Facility-scoped."""

    queryset = WardStock.objects.select_related("store_location", "drug", "ward")
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    filterset_class = WardStockFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return WardStockCreateSerializer
        if self.action == "consume":
            return WardConsumeSerializer
        if self.action == "replenish":
            return WardReplenishSerializer
        if self.action == "return_to_store":
            return WardReturnSerializer
        return WardStockSerializer

    def perform_create(self, serializer):
        if not self.request.user.has_perm("inventory.add_wardstock"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have permission to add ward stock.")
        serializer.save(**self.get_tenant_save_kwargs())

    def destroy(self, request, *args, **kwargs):
        """Delete with permission check."""
        if not request.user.has_perm("inventory.delete_wardstock"):
            return Response(
                {"detail": "You do not have permission to delete ward stock."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def consume(self, request, pk=None):
        """Consume stock at the ward (e.g. patient use)."""
        if not request.user.has_perm("inventory.change_wardstock"):
            return Response(
                {"detail": "You do not have permission to consume ward stock."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ws = self.get_object()
        serializer = WardConsumeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        qty = serializer.validated_data["quantity"]
        if qty > ws.quantity_available:
            return Response(
                {
                    "error": f"Insufficient stock: available={ws.quantity_available}, requested={qty}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        WardStockTransaction.objects.create(
            ward_stock=ws,
            transaction_type=WardTransactionType.CONSUME,
            quantity=-qty,
            batch_id=serializer.validated_data.get("batch"),
            patient_id=serializer.validated_data.get("patient"),
            performed_by=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        ws.refresh_from_db()
        return Response(WardStockSerializer(ws).data)

    @action(detail=True, methods=["post"])
    def replenish(self, request, pk=None):
        """Replenish ward stock (from main store)."""
        if not request.user.has_perm("inventory.change_wardstock"):
            return Response(
                {"detail": "You do not have permission to replenish ward stock."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ws = self.get_object()
        serializer = WardReplenishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        qty = serializer.validated_data["quantity"]
        WardStockTransaction.objects.create(
            ward_stock=ws,
            transaction_type=WardTransactionType.REPLENISH,
            quantity=qty,
            batch_id=serializer.validated_data.get("batch"),
            performed_by=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        ws.refresh_from_db()
        return Response(WardStockSerializer(ws).data)

    @action(detail=True, methods=["post"])
    def return_to_store(self, request, pk=None):
        """Return stock from ward back to main store."""
        if not request.user.has_perm("inventory.change_wardstock"):
            return Response(
                {"detail": "You do not have permission to return ward stock."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ws = self.get_object()
        serializer = WardReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        qty = serializer.validated_data["quantity"]
        if qty > ws.quantity_available:
            return Response(
                {"error": f"Cannot return more than available: {ws.quantity_available}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        WardStockTransaction.objects.create(
            ward_stock=ws,
            transaction_type=WardTransactionType.RETURN,
            quantity=-qty,
            performed_by=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        ws.refresh_from_db()
        return Response(WardStockSerializer(ws).data)


class WardStockTransactionViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only transaction history for ward stock. Facility-scoped."""

    queryset = WardStockTransaction.objects.select_related(
        "ward_stock__drug",
        "ward_stock__store_location",
        "ward_stock__facility",
        "performed_by",
        "patient",
    )
    serializer_class = WardStockTransactionSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = WardStockTransactionFilter
    tenant_scope = "facility"
    tenant_facility_field = "ward_stock__facility"


# ===========================================================================
# Phase 4: Stock Reconciliation & Cycle Counting
# ===========================================================================


class StockCountViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD + lifecycle actions for stock counts. Facility-scoped."""

    queryset = StockCount.objects.select_related("store_location", "started_by", "approved_by")
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    filterset_class = StockCountFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return StockCountCreateSerializer
        if self.action == "list":
            return StockCountListSerializer
        return StockCountDetailSerializer

    def perform_create(self, serializer):
        serializer.save(
            started_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"])
    def generate_items(self, request, pk=None):
        """Auto-populate count items from current stock batches."""
        count = self.get_object()
        try:
            created = count.generate_items()
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"created": created, "total": count.items.count()},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """DRAFT → IN_PROGRESS."""
        count = self.get_object()
        try:
            count.start()
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockCountDetailSerializer(count).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """IN_PROGRESS → COMPLETED."""
        count = self.get_object()
        try:
            count.complete()
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockCountDetailSerializer(count).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, RequiresActiveShiftPermission],
    )
    def approve(self, request, pk=None):
        """COMPLETED → APPROVED. Requires ``inventory.approve_stock_count``."""
        if not request.user.has_perm("inventory.approve_stock_count"):
            return Response(
                {"error": "You do not have permission to approve stock counts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        count = self.get_object()
        try:
            count.approve(user=request.user)
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        # Re-fetch with relations
        count = self.get_queryset().get(pk=count.pk)
        return Response(StockCountDetailSerializer(count).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Any non-terminal → CANCELLED."""
        count = self.get_object()
        try:
            count.cancel()
        except DjangoValidationError as e:
            return Response({"error": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(StockCountDetailSerializer(count).data)

    @extend_schema(
        parameters=[
            OpenApiParameter("item_pk", OpenApiTypes.INT, OpenApiParameter.PATH),
        ]
    )
    @action(detail=True, methods=["get"], url_path="items/(?P<item_pk>[^/.]+)")
    def item_detail(self, request, pk=None, item_pk=None):
        """Get or update a specific count item (record physical count)."""
        count = self.get_object()
        try:
            item = count.items.select_related("drug", "batch").get(pk=item_pk)
        except StockCount.items.rel.related_model.DoesNotExist:
            return Response({"error": "Item not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(StockCountItemSerializer(item).data)

    @item_detail.mapping.patch
    def item_update(self, request, pk=None, item_pk=None):
        """Update a specific count item (record physical count)."""
        count = self.get_object()
        try:
            item = count.items.select_related("drug", "batch").get(pk=item_pk)
        except StockCount.items.rel.related_model.DoesNotExist:
            return Response({"error": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = StockCountItemUpdateSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(counted_by=request.user, counted_at=timezone.now())
        item.refresh_from_db()
        return Response(StockCountItemSerializer(item).data)

    @action(detail=True, methods=["get"])
    def items(self, request, pk=None):
        """Paginated list of count items (avoids SQLite expression-tree limit)."""
        count = self.get_object()
        qs = count.items.select_related("drug", "batch", "counted_by").order_by(
            "drug__generic_name"
        )

        # Optional filters
        has_discrepancy = request.query_params.get("has_discrepancy")
        if has_discrepancy == "true":
            from django.db.models import F

            qs = qs.exclude(counted_quantity__isnull=True).exclude(
                counted_quantity=F("system_quantity")
            )
        elif has_discrepancy == "false":
            from django.db.models import F, Q

            qs = qs.filter(
                Q(counted_quantity__isnull=True) | Q(counted_quantity=F("system_quantity"))
            )

        uncounted = request.query_params.get("uncounted")
        if uncounted == "true":
            qs = qs.filter(counted_quantity__isnull=True)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = StockCountItemSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = StockCountItemSerializer(qs, many=True)
        return Response(serializer.data)


# ===========================================================================
# Phase 5: KRA eTIMS Integration
# ===========================================================================


class ETIMSConfigViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD for eTIMS configuration. Singleton per facility.

    Write operations require ``inventory.manage_etims`` permission.
    """

    queryset = ETIMSConfig.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"

    def check_write_permission(self, request):
        if request.method not in ("GET", "HEAD", "OPTIONS") and not (
            request.user.is_superuser or request.user.has_perm("inventory.manage_etims")
        ):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have permission to manage eTIMS configuration.")

    def create(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return super().destroy(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ETIMSConfigCreateSerializer
        return ETIMSConfigSerializer

    def perform_create(self, serializer):
        kwargs = self.get_tenant_save_kwargs()
        facility = kwargs.get("facility")
        if facility and ETIMSConfig.objects.filter(facility=facility).exists():
            raise serializers.ValidationError(
                {"detail": "An eTIMS configuration already exists for this facility."}
            )
        serializer.save(**kwargs)

    @action(detail=True, methods=["post"])
    def test_connection(self, request, pk=None):
        """Test the eTIMS API connection for this configuration."""
        config = self.get_object()
        from hmis.apps.inventory.services.etims import get_etims_client

        client = get_etims_client(config)
        result = client.test_connection()
        return Response(
            {
                "success": result.success,
                "message": result.message,
            },
            status=status.HTTP_200_OK if result.success else status.HTTP_502_BAD_GATEWAY,
        )


class ETIMSInvoiceViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """CRUD + lifecycle actions for eTIMS invoice submissions."""

    queryset = ETIMSInvoice.objects.select_related(
        "invoice__patient", "dispensing"
    ).prefetch_related("items")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = ETIMSInvoiceFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return ETIMSInvoiceCreateSerializer
        return ETIMSInvoiceSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Submit this eTIMS invoice to KRA (async via Celery)."""
        etims_inv = self.get_object()
        if etims_inv.status not in ("PENDING", "FAILED"):
            return Response(
                {"error": f"Cannot submit invoice in {etims_inv.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from hmis.apps.inventory.tasks import submit_etims_invoice_task

        submit_etims_invoice_task.delay(etims_inv.pk)
        return Response({"message": "Submission queued."}, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        """Retry a FAILED eTIMS invoice submission."""
        etims_inv = self.get_object()
        if etims_inv.status != "FAILED":
            return Response(
                {"error": "Only FAILED invoices can be retried."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from hmis.apps.inventory.tasks import submit_etims_invoice_task

        submit_etims_invoice_task.delay(etims_inv.pk)
        return Response({"message": "Retry queued."}, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a PENDING or FAILED eTIMS invoice."""
        etims_inv = self.get_object()
        if etims_inv.status not in ("PENDING", "FAILED"):
            return Response(
                {"error": f"Cannot cancel invoice in {etims_inv.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        etims_inv.mark_cancelled()
        return Response(ETIMSInvoiceSerializer(etims_inv).data)

    @action(detail=True, methods=["post"], url_path="credit-note")
    def credit_note(self, request, pk=None):
        """
        Create a credit note (NC) for a CONFIRMED eTIMS invoice (§6.16).

        This creates a new ETIMSInvoice with transaction_type='NC' referencing
        the original, then queues it for submission to KRA.
        """
        from hmis.apps.inventory.serializers import ETIMSCreditNoteSerializer

        original = self.get_object()
        if original.status != "CONFIRMED":
            return Response(
                {"error": "Credit notes can only be issued for CONFIRMED invoices."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if original.transaction_type == "NC":
            return Response(
                {"error": "Cannot issue a credit note for another credit note."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ETIMSCreditNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Determine credit note receipt label
        cn_label_map = {"NS": "NC", "CS": "CC", "TS": "TC"}
        cn_receipt_label = cn_label_map.get(original.receipt_label, "NC")

        # Create credit note ETIMSInvoice
        credit_inv = ETIMSInvoice.objects.create(
            invoice=original.invoice,
            dispensing=original.dispensing,
            facility=original.facility,
            organization=original.organization,
            receipt_type=original.receipt_type,
            transaction_type="NC",
            receipt_label=cn_receipt_label,
            original_etims_invoice=original,
            original_cu_invoice_number=original.cu_invoice_number,
            buyer_pin=original.buyer_pin,
        )

        # Copy items from original
        for item in original.items.all():
            credit_inv.items.create(
                item_code=item.item_code,
                item_name=item.item_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                tax_amount=item.tax_amount,
                total=item.total,
            )

        # Queue for submission
        from hmis.apps.inventory.tasks import submit_etims_invoice_task

        submit_etims_invoice_task.delay(credit_inv.pk)

        return Response(
            ETIMSInvoiceSerializer(credit_inv).data,
            status=status.HTTP_201_CREATED,
        )


class ETIMSDailyReportViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only access to eTIMS daily X/Z reports + on-demand generation."""

    from hmis.apps.inventory.models import ETIMSDailyReport

    queryset = ETIMSDailyReport.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    tenant_scope = "facility"

    def get_serializer_class(self):
        from hmis.apps.inventory.serializers import (
            ETIMSDailyReportGenerateSerializer,
            ETIMSDailyReportSerializer,
        )

        if self.action == "generate":
            return ETIMSDailyReportGenerateSerializer
        return ETIMSDailyReportSerializer

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Generate an X or Z daily report for the current facility."""
        from hmis.apps.inventory.serializers import (
            ETIMSDailyReportGenerateSerializer,
            ETIMSDailyReportSerializer,
        )
        from hmis.apps.inventory.services.etims import generate_daily_report

        serializer = ETIMSDailyReportGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        self._resolve_tenant_context()
        facility = getattr(self.request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report = generate_daily_report(
            facility_id=facility.pk,
            report_type=serializer.validated_data["report_type"],
            report_date=serializer.validated_data.get("report_date"),
            user=request.user,
        )

        return Response(
            ETIMSDailyReportSerializer(report).data,
            status=status.HTTP_201_CREATED,
        )


# ===========================================================================
# Phase 6: Predictive Analytics / Demand Forecasting
# ===========================================================================


class ConsumptionRecordViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only access to aggregated consumption records."""

    queryset = ConsumptionRecord.objects.select_related("drug")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = ConsumptionRecordFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        from hmis.apps.inventory.serializers import ConsumptionRecordSerializer

        return ConsumptionRecordSerializer


class DemandForecastViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only access to demand forecasts + on-demand generation."""

    queryset = DemandForecast.objects.select_related("drug")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = DemandForecastFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        from hmis.apps.inventory.serializers import (
            DemandForecastGenerateSerializer,
            DemandForecastSerializer,
        )

        if self.action == "generate":
            return DemandForecastGenerateSerializer
        return DemandForecastSerializer

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Trigger forecast generation for a drug or all drugs."""
        from hmis.apps.inventory.serializers import DemandForecastGenerateSerializer
        from hmis.apps.inventory.services.forecasting import DemandForecaster

        serializer = DemandForecastGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        forecaster = DemandForecaster(facility_id=facility.pk)
        drug_id = data.get("drug_id")
        if drug_id:
            forecast = forecaster.forecast(
                drug_id=drug_id,
                period_months=data["period_months"],
                method=data["method"],
                user=request.user,
            )
            from hmis.apps.inventory.serializers import DemandForecastSerializer

            return Response(
                DemandForecastSerializer(forecast).data,
                status=status.HTTP_201_CREATED,
            )
        else:
            count = forecaster.forecast_all(
                period_months=data["period_months"],
                method=data["method"],
                user=request.user,
            )
            return Response(
                {"message": f"Generated {count} forecast(s).", "count": count},
                status=status.HTTP_201_CREATED,
            )


class ReorderSuggestionViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only access to reorder suggestions + convert/dismiss actions."""

    queryset = ReorderSuggestion.objects.select_related("drug", "supplier")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_class = ReorderSuggestionFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        from hmis.apps.inventory.serializers import ReorderSuggestionSerializer

        return ReorderSuggestionSerializer

    @action(detail=True, methods=["post"])
    def convert_to_po(self, request, pk=None):
        """Convert this suggestion into a Purchase Order."""
        from hmis.apps.inventory.models import PurchaseOrder, PurchaseOrderItem

        suggestion = self.get_object()
        if suggestion.status != "PENDING":
            return Response(
                {"error": "Only PENDING suggestions can be converted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not suggestion.supplier:
            return Response(
                {"error": "No supplier associated with this suggestion."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        po = PurchaseOrder.objects.create(
            supplier=suggestion.supplier,
            ordered_by=request.user,
            notes=f"Auto-generated from reorder suggestion #{suggestion.pk}",
            facility=suggestion.facility,
            organization=suggestion.organization,
        )
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            drug=suggestion.drug,
            quantity_ordered=int(suggestion.suggested_quantity),
            unit_cost=suggestion.drug.reference_price or 0,
        )
        suggestion.mark_converted(po)

        return Response(
            {
                "message": f"Created PO {po.po_number}",
                "purchase_order_id": po.pk,
                "po_number": po.po_number,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def dismiss(self, request, pk=None):
        """Dismiss a PENDING suggestion."""
        suggestion = self.get_object()
        if suggestion.status != "PENDING":
            return Response(
                {"error": "Only PENDING suggestions can be dismissed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        suggestion.dismiss()
        from hmis.apps.inventory.serializers import ReorderSuggestionSerializer

        return Response(ReorderSuggestionSerializer(suggestion).data)
