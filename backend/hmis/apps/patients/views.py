"""
Views for the patients app.
"""

from datetime import datetime

from django.db.models import Count, Max, Min
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import SensitiveAccessPermission, get_client_ip
from hmis.apps.encounters.models import Encounter
from hmis.apps.encounters.serializers import EncounterListSerializer

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
        """Override create to add audit logging and set registered_by."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Set registered_by to current user
        serializer.save(registered_by=request.user)

        # Log the create action
        AuditLog.log(
            action="patient_create",
            user=request.user,
            resource_type="Patient",
            resource_id=serializer.instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=serializer.instance.id,
            details={
                "patient_mrn": serializer.instance.mrn,
                "registered_by": request.user.username,
            },
        )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

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

    @action(detail=True, methods=["get"], url_path="encounter-timeline")
    def encounter_timeline(self, request, pk=None):
        """
        Get patient encounter timeline with statistics.

        Returns:
            - patient: Patient information
            - encounters: List of encounters ordered by date
            - statistics: Summary statistics
        """
        patient = self.get_object()

        # Get encounters for this patient
        encounters = Encounter.objects.filter(patient=patient)

        # Apply date filters if provided
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        if start_date:
            try:
                start = datetime.strptime(start_date, "%Y-%m-%d").date()
                encounters = encounters.filter(encounter_date__gte=start)
            except ValueError:
                pass  # Invalid date format, ignore filter

        if end_date:
            try:
                end = datetime.strptime(end_date, "%Y-%m-%d").date()
                encounters = encounters.filter(encounter_date__lte=end)
            except ValueError:
                pass  # Invalid date format, ignore filter

        encounters = encounters.order_by("-encounter_date")

        # Calculate statistics
        stats = encounters.aggregate(
            total_count=Count("id"),
            first_encounter=Min("encounter_date"),
            last_encounter=Max("encounter_date"),
        )

        # Encounter type breakdown
        type_breakdown = encounters.values("encounter_type").annotate(count=Count("id"))

        # Count critical vitals encounters
        critical_count = sum(1 for e in encounters if e.has_critical_vitals())

        def build_vitals_summary(encounter: Encounter) -> dict:
            summary: dict[str, object] = {}
            if encounter.temperature is not None:
                summary["temperature"] = str(encounter.temperature)
            if encounter.pulse is not None:
                summary["pulse"] = encounter.pulse
            if encounter.blood_pressure:
                summary["blood_pressure"] = encounter.blood_pressure
            if encounter.respiratory_rate is not None:
                summary["respiratory_rate"] = encounter.respiratory_rate
            if encounter.spo2 is not None:
                summary["spo2"] = float(encounter.spo2)
            if encounter.weight is not None:
                summary["weight"] = str(encounter.weight)
            if encounter.height is not None:
                summary["height"] = str(encounter.height)
            return summary

        def build_diagnoses(encounter: Encounter) -> list[dict]:
            diagnoses = []
            for diagnosis in encounter.diagnoses.select_related("icd10_code").all():
                diagnoses.append(
                    {
                        "id": diagnosis.id,
                        "diagnosis_type": diagnosis.diagnosis_type,
                        "code": diagnosis.icd10_code.code if diagnosis.icd10_code else None,
                        "description": diagnosis.icd10_code.description if diagnosis.icd10_code else None,
                        "free_text_diagnosis": diagnosis.free_text_diagnosis,
                    }
                )
            return diagnoses

        timeline_items = []
        for encounter in encounters.select_related("patient"):
            timeline_items.append(
                {
                    "encounter_id": encounter.id,
                    "encounter_date": encounter.encounter_date,
                    "encounter_type": encounter.encounter_type,
                    "chief_complaint": encounter.chief_complaint,
                    "has_critical_vitals": encounter.has_critical_vitals(),
                    "vitals_summary": build_vitals_summary(encounter),
                    "diagnoses": build_diagnoses(encounter),
                }
            )

        # Build response
        timeline_data = {
            "patient": {
                "id": patient.id,
                "mrn": patient.mrn,
                "full_name": patient.full_name,
                "date_of_birth": patient.date_of_birth,
                "age": patient.age,
                "gender": patient.gender,
            },
            "timeline": timeline_items,
            "statistics": {
                "total_encounters": stats["total_count"] or 0,
                "first_encounter_date": stats["first_encounter"],
                "last_encounter_date": stats["last_encounter"],
                "encounters_with_critical_vitals": critical_count,
                "by_type": {
                    item["encounter_type"]: item["count"] for item in type_breakdown
                },
            },
        }

        # Log the timeline view
        AuditLog.log(
            action="patient_timeline_view",
            user=request.user,
            resource_type="Patient",
            resource_id=patient.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "encounters_returned": len(timeline_items),
            },
        )

        return Response(timeline_data)


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
