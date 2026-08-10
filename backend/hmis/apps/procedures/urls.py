# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
from django.urls import include, path
from rest_framework import routers

from .views import (
    ExternalProcedureOrderRequestViewSet,
    ProcedureCatalogViewSet,
    ProcedureDashboardView,
    ProcedureOrderViewSet,
)

router = routers.DefaultRouter()
router.register(r"catalog", ProcedureCatalogViewSet, basename="catalog")
router.register(r"orders", ProcedureOrderViewSet, basename="order")
router.register(
    r"external-requests", ExternalProcedureOrderRequestViewSet, basename="external-request"
)

app_name = "procedures"

urlpatterns = [
    path("dashboard/", ProcedureDashboardView.as_view(), name="dashboard"),
    path("", include(router.urls)),
]
