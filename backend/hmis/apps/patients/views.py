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

        Query Parameters:
            - start_date: Filter encounters from this date (YYYY-MM-DD)
            - end_date: Filter encounters until this date (YYYY-MM-DD)
            - encounter_type: Filter by type (comma-separated: OPD,IPD,EMERGENCY)
            - page: Page number for pagination (enables pagination)
            - page_size: Results per page (default 20, max 100)
            - include_vitals: Include vitals_summary (default: true)
            - include_diagnoses: Include diagnoses (default: true)
            - include_treatment: Include treatment_plan (default: true)
            - include_alerts: Include alerts (default: true)

        Returns:
            - patient: Patient information
            - timeline: List of encounters ordered by date (newest first)
            - statistics: Summary statistics including most common diagnosis
            - pagination: Pagination info (only when page param provided)
        """
        from datetime import timedelta

        from hmis.apps.encounters.models import Diagnosis, TreatmentPlan

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

        # Apply encounter type filter
        encounter_type = request.query_params.get("encounter_type")
        if encounter_type:
            types = [t.strip().upper() for t in encounter_type.split(",")]
            encounters = encounters.filter(encounter_type__in=types)

        encounters = encounters.order_by("-encounter_date")

        # Parse include toggles (default all to True)
        include_vitals = request.query_params.get("include_vitals", "true").lower() == "true"
        include_diagnoses = request.query_params.get("include_diagnoses", "true").lower() == "true"
        include_treatment = request.query_params.get("include_treatment", "true").lower() == "true"
        include_alerts = request.query_params.get("include_alerts", "true").lower() == "true"

        # Calculate statistics (before pagination)
        total_count = encounters.count()
        stats = encounters.aggregate(
            first_encounter=Min("encounter_date"),
            last_encounter=Max("encounter_date"),
        )

        # Encounter type breakdown
        type_breakdown = encounters.values("encounter_type").annotate(count=Count("id"))

        # Count critical vitals encounters
        critical_count = sum(1 for e in encounters if e.has_critical_vitals())

        # Calculate most common diagnosis
        most_common_diag = (
            Diagnosis.objects.filter(encounter__patient=patient)
            .values("icd10_code__code", "icd10_code__description")
            .annotate(count=Count("id"))
            .order_by("-count")
            .first()
        )
        most_common_diagnosis = None
        if most_common_diag and most_common_diag["icd10_code__code"]:
            most_common_diagnosis = {
                "code": most_common_diag["icd10_code__code"],
                "description": most_common_diag["icd10_code__description"],
                "count": most_common_diag["count"],
            }

        # Calculate follow-up compliance
        def calculate_followup_compliance() -> dict | None:
            """Calculate follow-up compliance rate."""
            plans_with_followup = TreatmentPlan.objects.filter(
                encounter__patient=patient, follow_up_date__isnull=False
            ).select_related("encounter")

            if not plans_with_followup.exists():
                return None

            scheduled = 0
            completed = 0

            for plan in plans_with_followup:
                scheduled += 1
                followup_window_start = plan.follow_up_date - timedelta(days=7)
                followup_window_end = plan.follow_up_date + timedelta(days=7)

                # Check if a subsequent encounter exists in the window
                followup_exists = Encounter.objects.filter(
                    patient=patient,
                    encounter_date__gte=followup_window_start,
                    encounter_date__lte=followup_window_end,
                    encounter_date__gt=plan.encounter.encounter_date,  # Must be after original
                ).exists()

                if followup_exists:
                    completed += 1

            if scheduled == 0:
                return None

            return {
                "rate": round((completed / scheduled) * 100, 1),
                "completed": completed,
                "scheduled": scheduled,
            }

        # Apply pagination if page param provided
        pagination_info = None
        page = request.query_params.get("page")

        # Add select_related and prefetch_related before pagination
        encounters = encounters.select_related("patient").prefetch_related(
            "diagnoses__icd10_code", "treatment_plan__medications"
        )

        if page:
            try:
                page_num = int(page)
                page_size = int(request.query_params.get("page_size", 20))
                page_size = min(page_size, 100)  # Cap at 100

                total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
                offset = (page_num - 1) * page_size

                # Slice the queryset for pagination (convert to list to preserve order)
                encounters = list(encounters[offset : offset + page_size])

                pagination_info = {
                    "page": page_num,
                    "page_size": page_size,
                    "total_pages": total_pages,
                    "total_items": total_count,
                    "has_next": page_num < total_pages,
                    "has_previous": page_num > 1,
                }
            except ValueError:
                pass  # Invalid page number, ignore pagination

        def build_vitals_summary(encounter: Encounter) -> dict:
            """Build vitals summary with status for each vital."""
            summary: dict[str, object] = {}
            if encounter.temperature is not None:
                summary["temperature"] = {
                    "value": str(encounter.temperature),
                    "status": encounter.get_vital_status("temperature"),
                    "unit": "°C",
                }
            if encounter.pulse is not None:
                summary["pulse"] = {
                    "value": encounter.pulse,
                    "status": encounter.get_vital_status("pulse"),
                    "unit": "bpm",
                }
            if encounter.blood_pressure:
                summary["blood_pressure"] = {
                    "value": encounter.blood_pressure,
                    "status": encounter.get_vital_status("systolic_bp"),
                    "unit": "mmHg",
                }
            if encounter.respiratory_rate is not None:
                summary["respiratory_rate"] = {
                    "value": encounter.respiratory_rate,
                    "status": encounter.get_vital_status("respiratory_rate"),
                    "unit": "/min",
                }
            if encounter.spo2 is not None:
                summary["spo2"] = {
                    "value": float(encounter.spo2),
                    "status": encounter.get_vital_status("spo2"),
                    "unit": "%",
                }
            if encounter.weight is not None:
                summary["weight"] = {
                    "value": str(encounter.weight),
                    "status": "normal",  # Weight doesn't have clinical thresholds
                    "unit": "kg",
                }
            if encounter.height is not None:
                summary["height"] = {
                    "value": str(encounter.height),
                    "status": "normal",  # Height doesn't have clinical thresholds
                    "unit": "cm",
                }
            return summary

        def build_diagnoses(encounter: Encounter) -> list[dict]:
            diagnoses = []
            for diagnosis in encounter.diagnoses.select_related("icd10_code").all():
                diagnoses.append(
                    {
                        "id": diagnosis.id,
                        "diagnosis_type": diagnosis.diagnosis_type,
                        "code": diagnosis.icd10_code.code if diagnosis.icd10_code else None,
                        "description": (
                            diagnosis.icd10_code.description if diagnosis.icd10_code else None
                        ),
                        "free_text_diagnosis": diagnosis.free_text_diagnosis,
                    }
                )
            return diagnoses

        def build_treatment_plan(encounter: Encounter) -> dict | None:
            """Build treatment plan summary."""
            try:
                plan = encounter.treatment_plan
                return {
                    "status": plan.status.lower() if plan.status else None,
                    "medications_count": plan.medications.count(),
                    "follow_up_date": plan.follow_up_date,
                }
            except Encounter.treatment_plan.RelatedObjectDoesNotExist:
                return None

        def build_alerts(encounter: Encounter) -> list[str]:
            """Build alerts list from encounter."""
            alerts_str = encounter.get_alerts()
            if alerts_str:
                return [a.strip() for a in alerts_str.split(",") if a.strip()]
            return []

        timeline_items = []
        for encounter in encounters:
            timeline_item = {
                "encounter_id": encounter.id,
                "encounter_date": encounter.encounter_date,
                "encounter_type": encounter.encounter_type,
                "chief_complaint": encounter.chief_complaint,
                "has_critical_vitals": encounter.has_critical_vitals(),
            }

            # Conditionally include optional fields based on toggles
            if include_vitals:
                timeline_item["vitals_summary"] = build_vitals_summary(encounter)
            if include_diagnoses:
                timeline_item["diagnoses"] = build_diagnoses(encounter)
            if include_treatment:
                timeline_item["treatment_plan"] = build_treatment_plan(encounter)
            if include_alerts:
                timeline_item["alerts"] = build_alerts(encounter)

            timeline_items.append(timeline_item)

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
                "total_encounters": total_count,
                "first_encounter_date": stats["first_encounter"],
                "last_encounter_date": stats["last_encounter"],
                "encounters_with_critical_vitals": critical_count,
                "by_type": {item["encounter_type"]: item["count"] for item in type_breakdown},
                "most_common_diagnosis": most_common_diagnosis,
                "follow_up_compliance": calculate_followup_compliance(),
            },
        }

        # Add pagination info if pagination was applied
        if pagination_info:
            timeline_data["pagination"] = pagination_info

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

    @action(detail=True, methods=["get"], url_path="lab-results")
    def lab_results(self, request, pk=None):
        """
        Get all lab results for a patient.

        Returns all verified lab results for this patient across all encounters.
        """
        from hmis.apps.laboratory.models import LabResult
        from hmis.apps.laboratory.serializers import LabResultSerializer

        patient = self.get_object()
        results = LabResult.objects.filter(
            order_item__lab_order__patient=patient
        ).select_related(
            "order_item__test", "entered_by", "verified_by"
        ).order_by("-entered_at")

        serializer = LabResultSerializer(results, many=True)
        return Response(serializer.data)


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
