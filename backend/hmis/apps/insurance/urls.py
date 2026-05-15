"""URL configuration for the insurance app."""

from django.urls import include, path
from rest_framework import routers

from hmis.apps.insurance.views import (
    InsuranceClaimItemViewSet,
    InsuranceClaimViewSet,
    InsurancePlanViewSet,
    InsurancePreauthViewSet,
    InsuranceProviderConfigViewSet,
    InsuranceProviderViewSet,
    InsuranceRemittanceLineViewSet,
    InsuranceRemittanceViewSet,
    PatientInsuranceViewSet,
    PayerTariffViewSet,
)

router = routers.DefaultRouter()
router.register(r"providers", InsuranceProviderViewSet, basename="insurance-provider")
router.register(r"plans", InsurancePlanViewSet, basename="insurance-plan")
router.register(r"enrollments", PatientInsuranceViewSet, basename="patient-insurance")
router.register(
    r"provider-configs",
    InsuranceProviderConfigViewSet,
    basename="insurance-provider-config",
)
router.register(r"claims", InsuranceClaimViewSet, basename="insurance-claim")
router.register(r"preauths", InsurancePreauthViewSet, basename="insurance-preauth")
router.register(r"remittances", InsuranceRemittanceViewSet, basename="insurance-remittance")
router.register(r"tariffs", PayerTariffViewSet, basename="payer-tariff")

app_name = "insurance"

urlpatterns = [
    path("", include(router.urls)),
    # Nested: claim items
    path(
        "claims/<int:claim_pk>/items/",
        InsuranceClaimItemViewSet.as_view({"get": "list", "post": "create"}),
        name="insurance-claim-item-list",
    ),
    path(
        "claims/<int:claim_pk>/items/<int:pk>/",
        InsuranceClaimItemViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="insurance-claim-item-detail",
    ),
    # Nested: remittance lines
    path(
        "remittances/<int:remittance_pk>/lines/",
        InsuranceRemittanceLineViewSet.as_view({"get": "list", "post": "create"}),
        name="insurance-remittance-line-list",
    ),
    path(
        "remittances/<int:remittance_pk>/lines/<int:pk>/",
        InsuranceRemittanceLineViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="insurance-remittance-line-detail",
    ),
]
