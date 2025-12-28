"""
Views for the encounters app.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

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
    permission_classes = [IsAuthenticated]
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

        Also filters out encounters for sensitive patients if user lacks permission.

        Query params:
        - patient_id: Filter by patient ID
        - patient_mrn: Filter by patient MRN
        """
        queryset = super().get_queryset()
        user = self.request.user

        # Filter out encounters for sensitive patients unless user has permission
        if not user.is_superuser and not user.has_perm("patients.view_sensitive_patient"):
            queryset = queryset.filter(patient__is_sensitive=False)

        # Filter by patient_id if provided
        patient_id = self.request.query_params.get("patient_id")
        if patient_id:
            queryset = queryset.filter(patient_id=patient_id)

        # Filter by patient MRN if provided
        patient_mrn = self.request.query_params.get("patient_mrn")
        if patient_mrn:
            queryset = queryset.filter(patient__mrn=patient_mrn)

        return queryset

    def retrieve(self, request, *args, **kwargs):
        """Override retrieve to add audit logging."""
        response = super().retrieve(request, *args, **kwargs)

        encounter = self.get_object()
        AuditLog.log(
            action="encounter_view",
            user=request.user,
            resource_type="Encounter",
            resource_id=encounter.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
            details={"encounter_type": encounter.encounter_type},
        )

        return response

    def create(self, request, *args, **kwargs):
        """Override create to add audit logging."""
        response = super().create(request, *args, **kwargs)

        if response.status_code == 201:
            AuditLog.log(
                action="encounter_create",
                user=request.user,
                resource_type="Encounter",
                resource_id=response.data.get("id"),
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=response.data.get("patient"),
                details={"encounter_type": response.data.get("encounter_type")},
            )

        return response

    def update(self, request, *args, **kwargs):
        """Override update to add audit logging."""
        encounter = self.get_object()

        response = super().update(request, *args, **kwargs)

        if response.status_code == 200:
            AuditLog.log(
                action="encounter_update",
                user=request.user,
                resource_type="Encounter",
                resource_id=encounter.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=encounter.patient_id,
                details={"encounter_type": encounter.encounter_type},
            )

        return response

    def destroy(self, request, *args, **kwargs):
        """Override destroy to add audit logging."""
        encounter = self.get_object()
        encounter_id = encounter.id
        patient_id = encounter.patient_id
        encounter_type = encounter.encounter_type

        response = super().destroy(request, *args, **kwargs)

        if response.status_code == 204:
            AuditLog.log(
                action="encounter_delete",
                user=request.user,
                resource_type="Encounter",
                resource_id=encounter_id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient_id,
                details={"encounter_type": encounter_type},
            )

        return response
