"""
Views for the patients app.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets

from .models import Patient
from .serializers import PatientSerializer


class PatientViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Patient model.

    Provides CRUD operations for patients.
    """

    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["gender"]
    search_fields = ["first_name", "last_name", "mrn", "national_id", "phone_number"]
    ordering_fields = ["created_at", "last_name", "first_name"]
    ordering = ["-created_at"]
