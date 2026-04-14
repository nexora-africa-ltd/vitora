"""
URL configuration for the nutrition module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.nutrition.views import DietPlanViewSet, NutritionConsultationViewSet

app_name = "nutrition"

router = DefaultRouter()
router.register(r"consultations", NutritionConsultationViewSet, basename="consultation")
router.register(r"diet-plans", DietPlanViewSet, basename="diet-plan")

urlpatterns = [
    path("", include(router.urls)),
]
