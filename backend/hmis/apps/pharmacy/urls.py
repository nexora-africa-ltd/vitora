"""
URL configuration for Pharmacy app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from hmis.apps.pharmacy.views import (
    DrugViewSet,
    StockBatchViewSet,
    StockAlertViewSet,
    PrescriptionViewSet,
    DispensingViewSet,
    StockAdjustmentViewSet,
    StockSummaryReportView,
    ExpiryReportView,
    DispensingReportView,
    StockMovementReportView,
)

router = DefaultRouter()
router.register(r"drugs", DrugViewSet, basename="drug")
router.register(r"stock", StockBatchViewSet, basename="stockbatch")
router.register(r"alerts", StockAlertViewSet, basename="stockalert")
router.register(r"prescriptions", PrescriptionViewSet, basename="prescription")
router.register(r"dispensings", DispensingViewSet, basename="dispensing")
router.register(r"adjustments", StockAdjustmentViewSet, basename="stockadjustment")

app_name = "pharmacy"

urlpatterns = [
    path("", include(router.urls)),
    # Report endpoints
    path("reports/stock-summary/", StockSummaryReportView.as_view(), name="stock-summary-report"),
    path("reports/expiry-report/", ExpiryReportView.as_view(), name="expiry-report"),
    path("reports/dispensing/", DispensingReportView.as_view(), name="dispensing-report"),
    path("reports/movement/", StockMovementReportView.as_view(), name="stock-movement-report"),
]
