"""
URL configuration for inpatient app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    WardViewSet,
    BedViewSet,
)

app_name = 'inpatient'

# Create router for inpatient endpoints
router = DefaultRouter()
router.register(r'wards', WardViewSet, basename='ward')
router.register(r'beds', BedViewSet, basename='bed')

urlpatterns = [
    path('', include(router.urls)),
]
