"""URL configuration for Inventory app."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.inventory.views import GoodsReceiptNoteViewSet, PurchaseOrderViewSet, SupplierViewSet

router = DefaultRouter()
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchaseorder")
router.register(r"goods-receipts", GoodsReceiptNoteViewSet, basename="goodsreceiptnote")

app_name = "inventory"

urlpatterns = [
    path("", include(router.urls)),
]
