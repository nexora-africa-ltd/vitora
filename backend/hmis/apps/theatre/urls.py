from django.urls import include, path
from rest_framework import routers

from .views import OperatingTheatreViewSet, SurgeryCaseViewSet

router = routers.DefaultRouter()
router.register(r"operating-theatres", OperatingTheatreViewSet, basename="operating-theatre")
router.register(r"cases", SurgeryCaseViewSet, basename="surgery-case")

app_name = "theatre"

urlpatterns = [
    path("", include(router.urls)),
]
