"""
Views for the encounters app.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets

from .models import Encounter
from .serializers import EncounterListSerializer, EncounterSerializer


class EncounterViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Encounter model.

    Provides CRUD operations for encounters with filtering,
    search, and ordering capabilities.

    Endpoints:
    - GET /api/encounters/ - List all encounters
    - POST /api/encounters/ - Create a new encounter
    - GET /api/encounters/{id}/ - Retrieve an encounter
    - PUT /api/encounters/{id}/ - Update an encounter
    - PATCH /api/encounters/{id}/ - Partial update an encounter
    - DELETE /api/encounters/{id}/ - Delete an encounter
    """

    queryset = Encounter.objects.select_related("patient").all()
    serializer_class = EncounterSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "encounter_type", "encounter_date"]
    search_fields = ["chief_complaint", "notes", "patient__first_name", "patient__last_name"]
    ordering_fields = ["encounter_date", "created_at", "encounter_type"]
    ordering = ["-encounter_date", "-created_at"]

    def get_serializer_class(self):
        """
        Return different serializers for list vs detail views.

        Uses EncounterListSerializer for list action for better performance.
        """
        if self.action == "list":
            return EncounterListSerializer
        return EncounterSerializer

    def get_queryset(self):
        """
        Optionally filter encounters by patient.

        Query params:
        - patient_id: Filter by patient ID
        - patient_mrn: Filter by patient MRN
        """
        queryset = super().get_queryset()

        # Filter by patient_id if provided
        patient_id = self.request.query_params.get("patient_id")
        if patient_id:
            queryset = queryset.filter(patient_id=patient_id)

        # Filter by patient MRN if provided
        patient_mrn = self.request.query_params.get("patient_mrn")
        if patient_mrn:
            queryset = queryset.filter(patient__mrn=patient_mrn)

        return queryset
