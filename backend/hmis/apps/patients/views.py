"""
Views for the patients app.
"""

from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import SensitiveAccessPermission, get_client_ip

from .models import EmergencyContact, Patient
from .serializers import EmergencyContactSerializer, PatientSerializer


class PatientViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Patient model.

    Provides CRUD operations for patients with:
    - Sensitive data access control
    - Automatic audit logging
    - Filtering of sensitive records for unauthorized users
    """

    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, SensitiveAccessPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["gender", "is_sensitive"]
    search_fields = ["first_name", "last_name", "mrn", "national_id", "phone_number"]
    ordering_fields = ["created_at", "last_name", "first_name"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """
        Filter queryset based on user permissions.

        Regular users cannot see sensitive patient records unless they
        have the 'view_sensitive_patient' permission.
        """
        queryset = super().get_queryset()
        user = self.request.user

        # Superusers see all patients
        if user.is_superuser:
            return queryset

        # Check if user can view sensitive records
        if not user.has_perm("patients.view_sensitive_patient"):
            queryset = queryset.filter(is_sensitive=False)

        return queryset

    def retrieve(self, request, *args, **kwargs):
        """Override retrieve to add audit logging."""
        response = super().retrieve(request, *args, **kwargs)

        # Log the view action
        patient = self.get_object()
        AuditLog.log(
            action="patient_view",
            user=request.user,
            resource_type="Patient",
            resource_id=patient.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={"patient_mrn": patient.mrn},
        )

        return response

    def create(self, request, *args, **kwargs):
        """Override create to add audit logging."""
        response = super().create(request, *args, **kwargs)

        if response.status_code == 201:
            # Log the create action
            AuditLog.log(
                action="patient_create",
                user=request.user,
                resource_type="Patient",
                resource_id=response.data.get("id"),
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=response.data.get("id"),
                details={"patient_mrn": response.data.get("mrn")},
            )

        return response

    def update(self, request, *args, **kwargs):
        """Override update to add audit logging."""
        patient = self.get_object()
        old_data = PatientSerializer(patient).data

        response = super().update(request, *args, **kwargs)

        if response.status_code == 200:
            # Log the update action with changes
            new_data = response.data
            changes = {
                k: {"old": old_data.get(k), "new": new_data.get(k)}
                for k in new_data
                if old_data.get(k) != new_data.get(k)
            }

            AuditLog.log(
                action="patient_update",
                user=request.user,
                resource_type="Patient",
                resource_id=patient.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient.id,
                details={"patient_mrn": patient.mrn, "changes": changes},
            )

        return response

    def destroy(self, request, *args, **kwargs):
        """Override destroy to add audit logging."""
        patient = self.get_object()
        patient_id = patient.id
        patient_mrn = patient.mrn

        response = super().destroy(request, *args, **kwargs)

        if response.status_code == 204:
            # Log the delete action
            AuditLog.log(
                action="patient_delete",
                user=request.user,
                resource_type="Patient",
                resource_id=patient_id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient_id,
                details={"patient_mrn": patient_mrn},
            )

        return response


class EmergencyContactViewSet(viewsets.ModelViewSet):
    """
    ViewSet for EmergencyContact model.

    Provides CRUD operations for emergency contacts nested under patients.
    URL pattern: /api/patients/{patient_id}/emergency-contacts/
    """

    serializer_class = EmergencyContactSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Get emergency contacts for a specific patient."""
        patient_id = self.kwargs.get("patient_pk")
        return EmergencyContact.objects.filter(patient_id=patient_id)

    def get_patient(self):
        """Get the patient from URL kwargs."""
        patient_id = self.kwargs.get("patient_pk")
        return get_object_or_404(Patient, pk=patient_id)

    def create(self, request, *args, **kwargs):
        """Create an emergency contact for the patient."""
        patient = self.get_patient()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(patient=patient)

        # Log the action
        AuditLog.log(
            action="emergency_contact_create",
            user=request.user,
            resource_type="EmergencyContact",
            resource_id=serializer.instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "contact_name": serializer.instance.full_name,
            },
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """Delete an emergency contact with audit logging."""
        instance = self.get_object()
        patient = instance.patient
        contact_name = instance.full_name

        response = super().destroy(request, *args, **kwargs)

        # Log the deletion
        AuditLog.log(
            action="emergency_contact_delete",
            user=request.user,
            resource_type="EmergencyContact",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "contact_name": contact_name,
            },
        )

        return response
