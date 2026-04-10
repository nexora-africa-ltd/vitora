"""Analytics URL configuration."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from hmis.apps.analytics import views

app_name = "analytics"

router = DefaultRouter()
router.register(r"facility-summary", views.FacilityDailySummaryViewSet, basename="facility-summary")
router.register(
    r"department-performance",
    views.DepartmentMonthlySummaryViewSet,
    basename="department-performance",
)
router.register(r"diagnosis-trends", views.DiagnosisTrendViewSet, basename="diagnosis-trends")
router.register(r"demographics", views.PatientDemographicSnapshotViewSet, basename="demographics")

urlpatterns = [
    path("metabase-embed/", views.MetabaseEmbedView.as_view(), name="metabase-embed"),
] + router.urls
