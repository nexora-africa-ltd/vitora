"""
Views for the patients app.
"""

from datetime import datetime

from django.db import transaction
from django.db.models import Count, Max, Min
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.history_views import ModelHistoryMixin
from hmis.apps.core.mixins import IdempotentCreateMixin
from hmis.apps.core.models import AuditLog, IdempotencyKey
from hmis.apps.core.permissions import SensitiveAccessPermission, get_client_ip
from hmis.apps.encounters.models import Encounter

from .filters import PatientFilter
from .models import Allergy, EmergencyContact, Patient
from .serializers import (
    AllergyListSerializer,
    AllergySerializer,
    EmergencyContactSerializer,
    PatientSerializer,
)


class PatientViewSet(ModelHistoryMixin, IdempotentCreateMixin, viewsets.ModelViewSet):
    """
    ViewSet for Patient model.

    Provides CRUD operations for patients with:
    - Sensitive data access control
    - Automatic audit logging
    - Filtering of sensitive records for unauthorized users
    - Idempotent patient creation (prevents duplicate submissions)
    - Version history tracking (/api/patients/{id}/history/)

    Idempotency:
        Include X-Idempotency-Key header with a unique UUID to enable
        idempotent patient creation. Repeated requests with the same
        key will return the same response.

    History:
        GET /api/patients/{id}/history/ - Get version history
        GET /api/patients/{id}/history/{version_id}/ - Get specific version
        GET /api/patients/{id}/history-count/ - Get version count
    """

    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, SensitiveAccessPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = PatientFilter
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
        """
        Override create to add audit logging, set registered_by, and handle emergency contact.

        Supports idempotent creation via X-Idempotency-Key header.
        """
        # Check for idempotency key first
        idempotency_key = request.META.get("HTTP_X_IDEMPOTENCY_KEY")
        if idempotency_key:
            existing = IdempotencyKey.get_or_none(key=idempotency_key, user=request.user)
            if existing:
                # Return cached response (idempotent replay)
                return Response(existing.response_data, status=existing.response_status)

        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            # Set registered_by to current user
            patient = serializer.save(registered_by=request.user)

            # Create emergency contact if data provided
            emergency_contact_name = request.data.get("emergency_contact_name")
            emergency_contact_phone = request.data.get("emergency_contact_phone")
            emergency_contact_relationship = request.data.get("emergency_contact_relationship")

            if emergency_contact_name or emergency_contact_phone:
                EmergencyContact.objects.create(
                    patient=patient,
                    full_name=emergency_contact_name or "",
                    phone_number=emergency_contact_phone or "",
                    relationship=emergency_contact_relationship or "",
                )

            # Log the create action
            AuditLog.log(
                action="patient_create",
                user=request.user,
                resource_type="Patient",
                resource_id=patient.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient.id,
                details={
                    "patient_mrn": patient.mrn,
                    "registered_by": request.user.username,
                },
            )

            # Re-serialize to include the newly created emergency contact
            response_serializer = self.get_serializer(patient)
            response_data = response_serializer.data

            # Cache response for idempotency
            if idempotency_key:
                IdempotencyKey.objects.create(
                    key=idempotency_key,
                    user=request.user,
                    resource_type="Patient",
                    resource_id=patient.id,
                    response_status=status.HTTP_201_CREATED,
                    response_data=response_data,
                )

        headers = self.get_success_headers(response_data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """Override update to add audit logging and handle emergency contact."""
        patient = self.get_object()
        old_data = PatientSerializer(patient).data

        response = super().update(request, *args, **kwargs)

        if response.status_code == 200:
            # Handle emergency contact update
            emergency_contact_name = request.data.get("emergency_contact_name")
            emergency_contact_phone = request.data.get("emergency_contact_phone")
            emergency_contact_relationship = request.data.get("emergency_contact_relationship")

            if emergency_contact_name or emergency_contact_phone:
                # Get or create primary emergency contact
                contact = patient.emergency_contacts.first()
                if contact:
                    contact.full_name = emergency_contact_name or contact.full_name
                    contact.phone_number = emergency_contact_phone or contact.phone_number
                    contact.relationship = emergency_contact_relationship or contact.relationship
                    contact.save()
                else:
                    EmergencyContact.objects.create(
                        patient=patient,
                        full_name=emergency_contact_name or "",
                        phone_number=emergency_contact_phone or "",
                        relationship=emergency_contact_relationship or "",
                    )
                # Re-serialize to include updated emergency contact
                response = Response(self.get_serializer(patient).data)

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

    @action(detail=True, methods=["get"], url_path="qr-code")
    def qr_code(self, request, pk=None):
        """
        Generate a QR code containing the patient's MRN.

        Returns a data URI (base64 PNG) that encodes the patient MRN
        for scanning at check-in.
        """
        from hmis.apps.core.qr_utils import generate_qr_data_uri

        patient = self.get_object()
        qr_payload = f"VITORA:MRN:{patient.mrn}"
        qr_data_uri = generate_qr_data_uri(qr_payload, box_size=6, border=2)

        return Response(
            {
                "qr_data_uri": qr_data_uri,
                "qr_payload": qr_payload,
                "mrn": patient.mrn,
                "patient_name": f"{patient.first_name} {patient.last_name}",
            }
        )

    @action(detail=True, methods=["get"], url_path="lab-results")
    def lab_results(self, request, pk=None):
        """
        Get all lab results for a patient.

        Returns all verified lab results for this patient across all encounters.
        """
        from hmis.apps.laboratory.models import LabResult
        from hmis.apps.laboratory.serializers import LabResultSerializer

        patient = self.get_object()
        results = (
            LabResult.objects.filter(order_item__lab_order__patient=patient)
            .select_related("order_item__test", "entered_by", "verified_by")
            .order_by("-entered_at")
        )

        serializer = LabResultSerializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="check-duplicate")
    def check_duplicate(self, request):
        """
        Check for potential duplicate patients before registration.

        Query Parameters:
            - identification_number: Check for exact ID match
            - identification_type: Type of ID (default: national_id)
            - first_name: For demographic matching
            - last_name: For demographic matching
            - date_of_birth: For demographic matching (YYYY-MM-DD)
            - gender: For demographic matching (M/F/O)

        Returns:
            - has_duplicate: Boolean indicating if potential duplicate found
            - match_type: "exact_id" | "demographic" | null
            - matches: List of matching patients (limited info for privacy)
        """
        from django.db.models import Q

        identification_number = request.query_params.get("identification_number")
        identification_type = request.query_params.get("identification_type", "national_id")
        first_name = request.query_params.get("first_name", "").strip()
        last_name = request.query_params.get("last_name", "").strip()
        date_of_birth = request.query_params.get("date_of_birth")
        gender = request.query_params.get("gender")

        matches = []
        match_type = None

        # Priority 1: Exact identification match
        if identification_number:
            exact_match = Patient.objects.filter(
                identification_type=identification_type,
                identification_number=identification_number,
            ).first()

            if exact_match:
                matches.append({
                    "id": exact_match.id,
                    "mrn": exact_match.mrn,
                    "full_name": exact_match.full_name,
                    "date_of_birth": exact_match.date_of_birth,
                    "gender": exact_match.gender,
                    "match_confidence": 100,
                    "match_reason": "Exact ID match",
                })
                match_type = "exact_id"

        # Priority 2: Demographic matching (if no exact ID match)
        if not matches and first_name and last_name and date_of_birth:
            try:
                dob = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
                demographic_qs = Patient.objects.filter(
                    first_name__iexact=first_name,
                    last_name__iexact=last_name,
                    date_of_birth=dob,
                )

                if gender:
                    demographic_qs = demographic_qs.filter(gender=gender)

                for patient in demographic_qs[:5]:  # Limit to 5 matches
                    matches.append({
                        "id": patient.id,
                        "mrn": patient.mrn,
                        "full_name": patient.full_name,
                        "date_of_birth": patient.date_of_birth,
                        "gender": patient.gender,
                        "match_confidence": 95 if gender else 85,
                        "match_reason": "Name + DOB match" + (" + Gender" if gender else ""),
                    })
                    match_type = "demographic"
            except ValueError:
                pass  # Invalid date format

        # Priority 3: Partial name match (fuzzy)
        if not matches and first_name and last_name:
            # Look for similar names (case-insensitive contains)
            partial_qs = Patient.objects.filter(
                Q(first_name__icontains=first_name) | Q(last_name__icontains=last_name)
            )

            if date_of_birth:
                try:
                    dob = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
                    partial_qs = partial_qs.filter(date_of_birth=dob)
                except ValueError:
                    pass

            for patient in partial_qs[:3]:  # Limit to 3 partial matches
                # Calculate simple match confidence
                confidence = 50
                if patient.first_name.lower() == first_name.lower():
                    confidence += 20
                if patient.last_name.lower() == last_name.lower():
                    confidence += 20
                if date_of_birth and str(patient.date_of_birth) == date_of_birth:
                    confidence += 10

                matches.append({
                    "id": patient.id,
                    "mrn": patient.mrn,
                    "full_name": patient.full_name,
                    "date_of_birth": patient.date_of_birth,
                    "gender": patient.gender,
                    "match_confidence": confidence,
                    "match_reason": "Partial name match",
                })
                match_type = "partial"

        return Response({
            "has_duplicate": len(matches) > 0,
            "match_type": match_type,
            "matches": matches,
        })


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


class AllergyViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Allergy model.

    Provides CRUD operations for patient allergies with:
    - Automatic audit logging
    - Filtering by patient, substance type, severity, status
    - Drug-allergy interaction checking
    - Nested under patient or standalone access

    URL patterns:
    - /api/patients/{patient_id}/allergies/  (nested)
    - /api/allergies/  (standalone)
    """

    serializer_class = AllergySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "substance_type", "severity", "status", "verification_status"]
    search_fields = ["substance", "substance_code", "notes"]
    ordering_fields = ["created_at", "severity", "onset_date"]
    ordering = ["-severity", "-created_at"]

    def get_queryset(self):
        """Get allergies, optionally filtered by patient."""
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            return Allergy.objects.filter(patient_id=patient_pk).select_related(
                "patient", "drug", "recorded_by", "source_encounter"
            )
        return Allergy.objects.select_related(
            "patient", "drug", "recorded_by", "source_encounter"
        ).all()

    def get_patient(self):
        """Get the patient from URL kwargs (for nested routes)."""
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk:
            return get_object_or_404(Patient, pk=patient_pk)
        return None

    def get_serializer_class(self):
        """Use list serializer for list actions."""
        if self.action == "list":
            return AllergyListSerializer
        return AllergySerializer

    def get_serializer(self, *args, **kwargs):
        """Override to pass nested patient context."""
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())

        # For nested routes, exclude patient from required fields validation
        patient_pk = self.kwargs.get("patient_pk")
        if patient_pk and self.action == "create":
            # Pass patient context for validation
            kwargs["context"]["nested_patient_pk"] = patient_pk

        return serializer_class(*args, **kwargs)

    def create(self, request, *args, **kwargs):
        """Create an allergy record with audit logging."""
        # Get patient from nested route first
        patient = self.get_patient()

        # Prepare data with patient if from nested route
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        if patient:
            data["patient"] = patient.id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        # If still no patient, check request data
        if not patient:
            patient_id = data.get("patient")
            if patient_id:
                patient = get_object_or_404(Patient, pk=patient_id)
            else:
                return Response(
                    {"patient": "Patient is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Save with recorded_by set to current user
        allergy = serializer.save(patient=patient, recorded_by=request.user)

        # Log the creation
        AuditLog.log(
            action="allergy_create",
            user=request.user,
            resource_type="Allergy",
            resource_id=allergy.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "substance": allergy.substance,
                "severity": allergy.severity,
            },
        )

        # Return full serializer for response
        response_serializer = AllergySerializer(allergy)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve an allergy with audit logging."""
        response = super().retrieve(request, *args, **kwargs)

        allergy = self.get_object()
        AuditLog.log(
            action="allergy_view",
            user=request.user,
            resource_type="Allergy",
            resource_id=allergy.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=allergy.patient.id,
            details={
                "patient_mrn": allergy.patient.mrn,
                "substance": allergy.substance,
            },
        )

        return response

    def update(self, request, *args, **kwargs):
        """Update an allergy with audit logging."""
        allergy = self.get_object()
        old_data = AllergySerializer(allergy).data

        response = super().update(request, *args, **kwargs)

        if response.status_code == 200:
            new_data = response.data
            changes = {
                k: {"old": old_data.get(k), "new": new_data.get(k)}
                for k in new_data
                if old_data.get(k) != new_data.get(k)
            }

            AuditLog.log(
                action="allergy_update",
                user=request.user,
                resource_type="Allergy",
                resource_id=allergy.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=allergy.patient.id,
                details={
                    "patient_mrn": allergy.patient.mrn,
                    "substance": allergy.substance,
                    "changes": changes,
                },
            )

        return response

    def destroy(self, request, *args, **kwargs):
        """Delete an allergy with audit logging."""
        allergy = self.get_object()
        allergy_id = allergy.id
        patient_id = allergy.patient.id
        patient_mrn = allergy.patient.mrn
        substance = allergy.substance

        response = super().destroy(request, *args, **kwargs)

        if response.status_code == 204:
            AuditLog.log(
                action="allergy_delete",
                user=request.user,
                resource_type="Allergy",
                resource_id=allergy_id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient_id,
                details={
                    "patient_mrn": patient_mrn,
                    "substance": substance,
                },
            )

        return response

    @action(detail=False, methods=["get"], url_path="lookup")
    def substance_lookup(self, request):
        """
        Look up allergy substances from available sources.

        Query Parameters:
            q: Search query (minimum 2 characters)
            type: Filter by substance type (medication, food, environmental, biological)

        Returns:
            List of matching substances with codes where available.
        """
        from hmis.apps.pharmacy.models import Drug

        query = request.query_params.get("q", "").strip()
        substance_type = request.query_params.get("type", "medication")

        if len(query) < 2:
            return Response(
                {"error": "Query must be at least 2 characters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []

        if substance_type == "medication":
            # Search drugs from pharmacy
            drugs = Drug.objects.filter(
                is_active=True,
                generic_name__icontains=query,
            )[:20]

            for drug in drugs:
                results.append({
                    "substance": drug.generic_name,
                    "code": drug.code,
                    "code_system": "local_drug_code",
                    "drug_id": drug.id,
                    "type": "medication",
                    "display": f"{drug.generic_name} ({drug.strength})",
                })

            # Also search brand names (using Python search to avoid SQLite JSON limitations)
            existing_drug_ids = {r.get("drug_id") for r in results}
            all_drugs = Drug.objects.filter(is_active=True).exclude(brand_names=[])[:100]

            for drug in all_drugs:
                if drug.id in existing_drug_ids:
                    continue
                # Check if query matches any brand name
                brand_matches = [
                    bn for bn in (drug.brand_names or [])
                    if query.lower() in bn.lower()
                ]
                if brand_matches:
                    results.append({
                        "substance": drug.generic_name,
                        "code": drug.code,
                        "code_system": "local_drug_code",
                        "drug_id": drug.id,
                        "type": "medication",
                        "display": f"{drug.generic_name} ({', '.join(drug.brand_names[:2])})",
                    })
                    if len(results) >= 30:
                        break

        else:
            # For non-medication allergies, provide common allergens
            common_allergens = {
                "food": [
                    "Peanuts", "Tree nuts", "Milk", "Eggs", "Wheat", "Soy",
                    "Fish", "Shellfish", "Sesame", "Corn", "Gluten",
                ],
                "environmental": [
                    "Dust mites", "Pollen", "Mold", "Pet dander", "Latex",
                    "Insect stings", "Cockroach", "Grass", "Ragweed",
                ],
                "biological": [
                    "Blood products", "Vaccines", "Insulin", "Latex",
                    "Contrast media", "Antisera",
                ],
            }

            allergens = common_allergens.get(substance_type, [])
            filtered = [a for a in allergens if query.lower() in a.lower()]

            for allergen in filtered[:20]:
                results.append({
                    "substance": allergen,
                    "code": "",
                    "code_system": "",
                    "drug_id": None,
                    "type": substance_type,
                    "display": allergen,
                })

        return Response(results)

    @action(detail=False, methods=["post"], url_path="check-interactions")
    def check_drug_interactions(self, request):
        """
        Check if a patient has allergies to specified drugs.

        Request Body:
            patient_id: Patient ID (required)
            drug_ids: List of drug IDs to check (optional)
            drug_names: List of drug names to check (optional)

        Returns:
            List of matching allergies with severity warnings.
        """
        patient_id = request.data.get("patient_id")
        drug_ids = request.data.get("drug_ids", [])
        drug_names = request.data.get("drug_names", [])

        if not patient_id:
            return Response(
                {"error": "patient_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not drug_ids and not drug_names:
            return Response(
                {"error": "Either drug_ids or drug_names must be provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        interactions = []

        # Check by drug ID
        for drug_id in drug_ids:
            allergies = Allergy.check_drug_allergy(patient_id, drug_id)
            for allergy in allergies:
                interactions.append({
                    "allergy_id": allergy.id,
                    "substance": allergy.substance,
                    "severity": allergy.severity,
                    "severity_display": allergy.get_severity_display(),
                    "reaction_type": allergy.reaction_type,
                    "is_high_risk": allergy.is_high_risk,
                    "drug_id": drug_id,
                    "warning": f"Patient is allergic to {allergy.substance} ({allergy.get_severity_display()} severity)",
                })

        # Check by drug name
        for drug_name in drug_names:
            allergies = Allergy.check_drug_name_allergy(patient_id, drug_name)
            for allergy in allergies:
                # Avoid duplicates
                if allergy.id not in [i["allergy_id"] for i in interactions]:
                    interactions.append({
                        "allergy_id": allergy.id,
                        "substance": allergy.substance,
                        "severity": allergy.severity,
                        "severity_display": allergy.get_severity_display(),
                        "reaction_type": allergy.reaction_type,
                        "is_high_risk": allergy.is_high_risk,
                        "drug_name": drug_name,
                        "warning": f"Patient is allergic to {allergy.substance} ({allergy.get_severity_display()} severity)",
                    })

        # Sort by severity (life_threatening > severe > moderate > mild)
        severity_order = {"life_threatening": 0, "severe": 1, "moderate": 2, "mild": 3}
        interactions.sort(key=lambda x: severity_order.get(x["severity"], 4))

        return Response({
            "patient_id": patient_id,
            "has_interactions": len(interactions) > 0,
            "has_high_risk": any(i["is_high_risk"] for i in interactions),
            "interactions": interactions,
        })
