"""URL configuration for Inventory app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.inventory.views import (
    GoodsReceiptNoteViewSet,
    PurchaseOrderViewSet,
    StockTransferViewSet,
    StoreLocationViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchaseorder")
router.register(r"goods-receipts", GoodsReceiptNoteViewSet, basename="goodsreceiptnote")
router.register(r"store-locations", StoreLocationViewSet, basename="storelocation")
router.register(r"transfers", StockTransferViewSet, basename="stocktransfer")

app_name = "inventory"

urlpatterns = [
    path("", include(router.urls)),
]
