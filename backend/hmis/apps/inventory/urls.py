"""URL configuration for Inventory app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.inventory.views import (
    ETIMSConfigViewSet,
    ETIMSInvoiceViewSet,
    GoodsReceiptNoteViewSet,
    PurchaseOrderViewSet,
    StockCountViewSet,
    StockTransferViewSet,
    StoreLocationViewSet,
    SupplierViewSet,
    WardStockTransactionViewSet,
    WardStockViewSet,
)

router = DefaultRouter()
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchaseorder")
router.register(r"goods-receipts", GoodsReceiptNoteViewSet, basename="goodsreceiptnote")
router.register(r"store-locations", StoreLocationViewSet, basename="storelocation")
router.register(r"transfers", StockTransferViewSet, basename="stocktransfer")
router.register(r"ward-stock", WardStockViewSet, basename="wardstock")
router.register(r"ward-transactions", WardStockTransactionViewSet, basename="wardstocktransaction")
router.register(r"stock-counts", StockCountViewSet, basename="stockcount")
router.register(r"etims-config", ETIMSConfigViewSet, basename="etimsconfig")
router.register(r"etims-invoices", ETIMSInvoiceViewSet, basename="etimsinvoice")

app_name = "inventory"

urlpatterns = [
    path("", include(router.urls)),
]
