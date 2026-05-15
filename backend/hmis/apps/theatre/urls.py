from django.urls import include, path
from rest_framework import routers

from .views import (
    CaseEquipmentRequirementViewSet,
    OperatingTheatreViewSet,
    SurgeryCaseViewSet,
    TheatreEquipmentTypeViewSet,
)

router = routers.DefaultRouter()
router.register(r"operating-theatres", OperatingTheatreViewSet, basename="operating-theatre")
router.register(r"cases", SurgeryCaseViewSet, basename="surgery-case")
router.register(r"equipment-types", TheatreEquipmentTypeViewSet, basename="equipment-type")

app_name = "theatre"

urlpatterns = [
    path("", include(router.urls)),
    # Nested: /api/theatre/cases/{case_pk}/equipment/
    path(
        "cases/<int:case_pk>/equipment/",
        CaseEquipmentRequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="case-equipment-list",
    ),
    path(
        "cases/<int:case_pk>/equipment/check-conflicts/",
        CaseEquipmentRequirementViewSet.as_view({"get": "check_conflicts"}),
        name="case-equipment-check-conflicts",
    ),
    path(
        "cases/<int:case_pk>/equipment/<int:pk>/",
        CaseEquipmentRequirementViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="case-equipment-detail",
    ),
]
