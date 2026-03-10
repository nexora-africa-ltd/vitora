"""
Views for the encounters app.
"""

from django.core.exceptions import ValidationError
from django.db.models import ProtectedError
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.checkin.serializers import ClinicalSnapshotSerializer
from hmis.apps.core.history_views import ModelHistoryMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

from .models import (
    Diagnosis,
    Encounter,
    ICD10Code,
    Medication,
    TreatmentPlan,
    TreatmentPlanTemplate,
)
from .serializers import (
    DiagnosisSerializer,
    EncounterListSerializer,
    EncounterSerializer,
    ICD10CodeSerializer,
    MedicationSerializer,
    TreatmentPlanSerializer,
    TreatmentPlanTemplateSerializer,
)


class ICD10CodeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for ICD-10 codes (read-only).

    Provides search and filtering for ICD-10 code lookup.

    Endpoints:
    - GET /api/icd10-codes/ - List/search ICD-10 codes
    - GET /api/icd10-codes/{id}/ - Retrieve an ICD-10 code
    """

    queryset = ICD10Code.objects.filter(is_active=True)
    serializer_class = ICD10CodeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["chapter", "category"]
    search_fields = ["code", "description", "category"]
    ordering_fields = ["code", "description"]
    ordering = ["code"]


class TreatmentPlanTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Treatment Plan Templates.

    Provides CRUD operations and template suggestions by diagnosis.

    Endpoints:
    - GET /api/treatment-templates/ - List templates
    - POST /api/treatment-templates/ - Create template
    - GET /api/treatment-templates/{id}/ - Retrieve template
    - PUT /api/treatment-templates/{id}/ - Update template
    - DELETE /api/treatment-templates/{id}/ - Delete template
    - GET /api/treatment-templates/suggest/?diagnosis=<code> - Suggest by diagnosis
    """

    queryset = TreatmentPlanTemplate.objects.filter(is_active=True)
    serializer_class = TreatmentPlanTemplateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["department", "is_active"]
    search_fields = ["name", "description", "department"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        """Filter templates, optionally including inactive ones."""
        queryset = TreatmentPlanTemplate.objects.all()
        # By default, only show active templates
        if not self.request.query_params.get("include_inactive"):
            queryset = queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        """Set created_by on creation."""
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"])
    def suggest(self, request):
        """
        Suggest templates based on diagnosis code.

        Query params:
        - diagnosis: ICD-10 code to match against template diagnosis_codes
        """
        diagnosis_code = request.query_params.get("diagnosis", "")
        if not diagnosis_code:
            return Response(
                {"detail": "diagnosis parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find templates linked to this diagnosis code
        templates = TreatmentPlanTemplate.objects.filter(
            is_active=True,
            diagnosis_codes__code__iexact=diagnosis_code,
        ).distinct()

        page = self.paginate_queryset(templates)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(templates, many=True)
        return Response({"results": serializer.data})


class DiagnosisViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Diagnosis model.

    Provides CRUD operations for encounter diagnoses.

    Endpoints:
    - GET /api/encounters/{encounter_id}/diagnoses/ - List diagnoses
    - POST /api/encounters/{encounter_id}/diagnoses/ - Create diagnosis
    - GET /api/encounters/{encounter_id}/diagnoses/{id}/ - Retrieve
    - PUT /api/encounters/{encounter_id}/diagnoses/{id}/ - Update
    - DELETE /api/encounters/{encounter_id}/diagnoses/{id}/ - Delete
    """

    serializer_class = DiagnosisSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["diagnosis_type", "is_confirmed"]
    ordering_fields = ["diagnosis_type", "created_at"]
    ordering = ["created_at"]

    def get_queryset(self):
        """Filter diagnoses by encounter."""
        encounter_id = self.kwargs.get("encounter_pk")
        return Diagnosis.objects.filter(encounter_id=encounter_id).select_related("icd10_code")

    def get_serializer_context(self):
        """Add encounter to serializer context."""
        context = super().get_serializer_context()
        context["encounter_pk"] = self.kwargs.get("encounter_pk")
        return context

    def create(self, request, *args, **kwargs):
        """Create diagnosis with encounter from URL."""
        encounter_pk = self.kwargs.get("encounter_pk")

        # Verify encounter exists
        try:
            encounter = Encounter.objects.get(pk=encounter_pk)
        except Encounter.DoesNotExist:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Add encounter to data
        data = request.data.copy()
        data["encounter"] = encounter_pk

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        # Audit log
        AuditLog.log(
            action="diagnosis_create",
            user=request.user,
            resource_type="Diagnosis",
            resource_id=serializer.data.get("id"),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
            details={"diagnosis_type": serializer.data.get("diagnosis_type")},
        )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def destroy(self, request, *args, **kwargs):
        """Delete diagnosis with audit logging."""
        diagnosis = self.get_object()
        diagnosis_id = diagnosis.id
        patient_id = diagnosis.encounter.patient_id
        diagnosis_type = diagnosis.diagnosis_type

        response = super().destroy(request, *args, **kwargs)

        if response.status_code == 204:
            AuditLog.log(
                action="diagnosis_delete",
                user=request.user,
                resource_type="Diagnosis",
                resource_id=diagnosis_id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient_id,
                details={"diagnosis_type": diagnosis_type},
            )

        return response

    def update(self, request, *args, **kwargs):
        """Update diagnosis with audit logging."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        # Add encounter to data if not provided
        data = request.data.copy()
        if "encounter" not in data:
            data["encounter"] = instance.encounter_id

        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Audit log
        AuditLog.log(
            action="diagnosis_update",
            user=request.user,
            resource_type="Diagnosis",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.encounter.patient_id,
            details={"diagnosis_type": serializer.data.get("diagnosis_type")},
        )

        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """Partial update diagnosis."""
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)


class EncounterViewSet(ModelHistoryMixin, viewsets.ModelViewSet):
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

    History:
    - GET /api/encounters/{id}/history/ - Get version history
    - GET /api/encounters/{id}/history/{version_id}/ - Get specific version
    - GET /api/encounters/{id}/history-count/ - Get version count
    """

    queryset = Encounter.objects.select_related("patient").all()
    serializer_class = EncounterSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "encounter_type", "encounter_date", "status", "visit_reason"]
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

    def perform_create(self, serializer):
        """Set created_by on creation, claim encounter, and link any existing waiting queue entries."""
        from django.utils import timezone

        from hmis.apps.triage.models import WaitingQueue

        # Auto-claim: The user who creates the encounter is assigned as the clinician
        instance = serializer.save(
            created_by=self.request.user,
            assigned_clinician=self.request.user,
            claimed_at=timezone.now(),
        )

        # Link any existing waiting queue entries for this patient to this encounter
        # This handles the case where a patient checked in (creating a WaitingQueue entry)
        # before an encounter was created
        waiting_entries = WaitingQueue.objects.filter(
            patient=instance.patient,
            status__in=["WAITING_TRIAGE", "IN_TRIAGE"],
            encounter__isnull=True,  # Only entries without an encounter
        )

        for entry in waiting_entries:
            entry.encounter = instance
            # If the encounter has vitals recorded, mark as triaged (vitals = triage complete)
            if instance.has_vitals():
                entry.status = "TRIAGED"
                entry.save(update_fields=["encounter", "status", "updated_at"])
            else:
                entry.save(update_fields=["encounter", "updated_at"])

    def update(self, request, *args, **kwargs):
        """Override update to check if encounter can be edited and add audit logging."""
        from hmis.apps.triage.models import WaitingQueue

        encounter = self.get_object()

        # Track if encounter had vitals before update
        had_vitals_before = encounter.has_vitals()

        # Check if encounter can be edited
        if not encounter.can_edit():
            return Response(
                {"detail": f"Encounter with status '{encounter.status}' cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = super().update(request, *args, **kwargs)

        if response.status_code == 200:
            # Refresh encounter from DB to get updated values
            encounter.refresh_from_db()

            # If vitals were just added, mark any waiting queue entries as TRIAGED
            if not had_vitals_before and encounter.has_vitals():
                WaitingQueue.objects.filter(
                    encounter=encounter,
                    status__in=["WAITING_TRIAGE", "IN_TRIAGE"],
                ).update(status="TRIAGED")

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
        """Override destroy to add audit logging and handle protected references."""
        encounter = self.get_object()
        encounter_id = encounter.id
        patient_id = encounter.patient_id
        encounter_type = encounter.encounter_type

        try:
            response = super().destroy(request, *args, **kwargs)
        except ProtectedError:
            # Handle protected foreign key references (e.g., invoices)
            return Response(
                {
                    "detail": "Cannot delete this encounter because it has associated billing records. "
                    "Please void or delete the related invoices first."
                },
                status=status.HTTP_409_CONFLICT,
            )

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

    # =========================================================================
    # Clinical Snapshot (Clinician Safety)
    # =========================================================================

    @extend_schema(
        responses={200: ClinicalSnapshotSerializer},
    )
    @action(detail=True, methods=["get"])
    def clinical_snapshot(self, request, pk=None):
        """
        Return a clinical snapshot for the encounter's patient.

        This reuses the check-in clinical snapshot generator to avoid duplicating
        clinical summary business logic.

        GET /api/encounters/{id}/clinical_snapshot/
        """
        encounter = self.get_object()

        from hmis.apps.checkin.services import get_clinical_snapshot

        snapshot = get_clinical_snapshot(encounter.patient)
        serializer = ClinicalSnapshotSerializer(snapshot)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # =========================================================================
    # Status Workflow Actions (Sprint 1.1-1.2)
    # =========================================================================

    @action(detail=True, methods=["post"])
    def start_progress(self, request, pk=None):
        """
        Start progress on a draft encounter.

        Transitions encounter from DRAFT to IN_PROGRESS.

        POST /api/encounters/{id}/start_progress/
        """
        encounter = self.get_object()

        try:
            encounter.start_progress()
            serializer = self.get_serializer(encounter)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {"detail": str(e.message if hasattr(e, "message") else e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        """
        Finalize/complete an encounter.

        Transitions encounter to CLOSED status.
        Records the user who finalized and timestamp.

        POST /api/encounters/{id}/finalize/
        """
        encounter = self.get_object()

        try:
            encounter.finalize(request.user)
            serializer = self.get_serializer(encounter)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {"detail": str(e.message if hasattr(e, "message") else e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel an encounter.

        Transitions encounter to CANCELLED status.
        Optionally accepts a reason for cancellation.

        POST /api/encounters/{id}/cancel/
        Body: {"reason": "Patient left before consultation"}
        """
        encounter = self.get_object()
        reason = request.data.get("reason", "")

        try:
            encounter.cancel(reason=reason)
            serializer = self.get_serializer(encounter)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {"detail": str(e.message if hasattr(e, "message") else e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # =========================================================================
    # State Machine Transition (Sprint 2 - Phase 2A)
    # =========================================================================

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        """
        Transition encounter to a new status.

        Validates the transition and creates audit trail.

        POST /api/encounters/{id}/transition/
        Body: {"to_status": "CHECKED_IN", "reason": "Patient verified"}
        """
        from hmis.apps.core.permissions import get_client_ip

        from .services import EncounterStateMachine

        encounter = self.get_object()
        to_status = request.data.get("to_status")

        if not to_status:
            return Response(
                {"detail": "to_status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "")

        try:
            result = EncounterStateMachine.transition(
                encounter=encounter,
                to_status=to_status,
                user=request.user,
                reason=reason,
                ip_address=get_client_ip(request),
            )
            return Response(result, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response(
                {"detail": str(e.message if hasattr(e, "message") else e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # =========================================================================
    # Related Encounters (Sprint 2 - Phase 2B)
    # =========================================================================

    @action(detail=True, methods=["get"])
    def related(self, request, pk=None):
        """
        Get encounters linked to this encounter (follow-up visits).

        GET /api/encounters/{id}/related/
        """
        encounter = self.get_object()
        related_encounters = encounter.follow_up_encounters.all().order_by("-encounter_date")
        serializer = EncounterListSerializer(related_encounters, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # =========================================================================
    # Consultation Queue Actions (Phase 2)
    # =========================================================================

    @action(detail=True, methods=["post"])
    def bypass_triage(self, request, pk=None):
        """
        Bypass triage for OPTIONAL triage encounters.

        Only allowed for encounters with triage_requirement=OPTIONAL.
        Requires a bypass reason.

        POST /api/encounters/{id}/bypass_triage/
        Body: {"reason": "FOLLOW_UP"}
        """
        from django.utils import timezone

        encounter = self.get_object()
        reason = request.data.get("reason")

        # Validate reason is provided
        if not reason:
            return Response(
                {"detail": "Bypass reason is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate reason is valid
        valid_reasons = [choice[0] for choice in Encounter.TRIAGE_BYPASS_REASON_CHOICES]
        if reason not in valid_reasons:
            return Response(
                {"detail": f"Invalid bypass reason. Valid options: {', '.join(valid_reasons)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if triage can be bypassed
        if encounter.triage_requirement == "MANDATORY":
            return Response(
                {"detail": "Cannot bypass triage for mandatory triage encounters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if encounter.triage_status == "COMPLETED":
            return Response(
                {"detail": "Triage already completed. Cannot bypass."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if encounter.triage_status == "BYPASSED":
            return Response(
                {"detail": "Triage already bypassed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Bypass triage
        encounter.triage_status = "BYPASSED"
        encounter.triage_bypass_reason = reason
        encounter.triage_bypassed_by = request.user
        encounter.triage_bypassed_at = timezone.now()
        encounter.save()

        serializer = self.get_serializer(encounter)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def edit_chief_complaint(self, request, pk=None):
        """
        Edit chief complaint with audit trail.

        Only allowed for triaged encounters. Requires a reason.

        POST /api/encounters/{id}/edit_chief_complaint/
        {
            "chief_complaint": "Updated complaint text",
            "edit_reason": "ADDITIONAL_SYMPTOMS",  # Choice from CHIEF_COMPLAINT_EDIT_REASON_CHOICES
            "edit_reason_other": ""  # Required if edit_reason is "OTHER"
        }
        """
        from django.utils import timezone

        encounter = self.get_object()

        if not request.user.has_perm("encounters.change_encounter"):
            return Response(
                {"detail": "You do not have permission to edit chief complaint."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get data from request
        new_complaint = request.data.get("chief_complaint", "").strip()
        edit_reason = request.data.get("edit_reason", "").strip()
        edit_reason_other = request.data.get("edit_reason_other", "").strip()

        # Validate chief complaint
        if not new_complaint:
            return Response(
                {"detail": "Chief complaint is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate edit reason
        valid_reasons = [choice[0] for choice in Encounter.CHIEF_COMPLAINT_EDIT_REASON_CHOICES]
        if not edit_reason:
            return Response(
                {"detail": "Edit reason is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if edit_reason not in valid_reasons:
            return Response(
                {"detail": f"Invalid edit reason. Must be one of: {', '.join(valid_reasons)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate "Other" reason
        if edit_reason == "OTHER" and not edit_reason_other:
            return Response(
                {"detail": "Please specify the reason when selecting 'Other'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store original if not already stored
        if not encounter.chief_complaint_original:
            encounter.chief_complaint_original = encounter.chief_complaint

        # Update chief complaint with audit trail
        encounter.chief_complaint = new_complaint
        encounter.chief_complaint_edited = True
        encounter.chief_complaint_edit_reason = edit_reason
        encounter.chief_complaint_edit_reason_other = (
            edit_reason_other if edit_reason == "OTHER" else ""
        )
        encounter.chief_complaint_edited_by = request.user
        encounter.chief_complaint_edited_at = timezone.now()
        encounter.save()

        serializer = self.get_serializer(encounter)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def call(self, request, pk=None):
        """
        Call a patient for consultation and claim the encounter.

        Sets consultation_status to CALLED, records the call time,
        and automatically claims the encounter for the calling clinician.
        This prevents the need for separate Call and Claim actions.

        Only allowed if encounter can enter consultation and is not
        already claimed by another clinician.

        Creates a notification for the patient called event.

        POST /api/encounters/{id}/call/
        """
        from django.db import transaction
        from django.utils import timezone

        from .services import create_patient_called_notification

        with transaction.atomic():
            # Lock the encounter row to prevent race conditions
            encounter = Encounter.objects.select_for_update().get(pk=pk)

            # Check if encounter can enter consultation
            if not encounter.can_enter_consultation():
                return Response(
                    {"detail": "Encounter cannot enter consultation. Triage may be required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Check if consultation is not already in progress
            if encounter.consultation_status == "IN_PROGRESS":
                return Response(
                    {"detail": "Consultation is already in progress."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if encounter.consultation_status == "COMPLETED":
                return Response(
                    {"detail": "Consultation is already completed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Check if already claimed by another user
            if encounter.assigned_clinician and encounter.assigned_clinician != request.user:
                return Response(
                    {
                        "detail": f"Patient already claimed by {encounter.assigned_clinician.get_full_name() or encounter.assigned_clinician.username}. "
                        f"They must release it before you can call this patient."
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            # Call the patient and claim the encounter
            encounter.consultation_status = "CALLED"
            encounter.called_at = timezone.now()
            encounter.assigned_clinician = request.user
            encounter.claimed_at = timezone.now()
            encounter.save()

            # Create notification for patient called event
            create_patient_called_notification(encounter, request.user)

            # Log the call+claim action
            AuditLog.log(
                action="encounter_call_and_claim",
                user=request.user,
                resource_type="Encounter",
                resource_id=encounter.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=encounter.patient_id,
                details={"encounter_type": encounter.encounter_type},
            )

        serializer = self.get_serializer(encounter)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def quick_consultation(self, request):
        """
        Create a new encounter and claim it for the current clinician in one step.

        This is a convenience endpoint for quickly starting a consultation
        from the patient list. It:
        1. Creates a new OPD encounter for the patient
        2. Sets triage_status to NOT_APPLICABLE (direct to consultation)
        3. Calls the patient (consultation_status = CALLED)
        4. Claims the encounter for the current user

        POST /api/encounters/quick_consultation/
        Body: {
            "patient": <patient_id>,
            "chief_complaint": <optional string>,
            "encounter_type": <optional, default "OPD">
        }

        Returns:
        - 201: Encounter created and claimed
        - 400: Invalid patient or validation error
        - 409: Patient already has an active encounter with another clinician
        """
        from django.db import transaction
        from django.utils import timezone

        from hmis.apps.patients.models import Patient

        from .services import create_patient_called_notification

        patient_id = request.data.get("patient")
        if not patient_id:
            return Response(
                {"detail": "patient ID is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {"detail": "Patient not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if patient already has an active encounter
        existing_encounter = (
            Encounter.objects.filter(
                patient=patient,
                status="IN_PROGRESS",
            )
            .select_related("assigned_clinician")
            .first()
        )

        if existing_encounter:
            # If claimed by another user, return 409
            if (
                existing_encounter.assigned_clinician
                and existing_encounter.assigned_clinician != request.user
            ):
                return Response(
                    {
                        "detail": f"Patient already has an active encounter with {existing_encounter.assigned_clinician.get_full_name() or existing_encounter.assigned_clinician.username}",
                        "encounter_id": existing_encounter.id,
                        "claimed_by": existing_encounter.assigned_clinician.username,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            # If already claimed by current user, return that encounter
            if existing_encounter.assigned_clinician == request.user:
                return Response(
                    {
                        "detail": "You already have an active encounter with this patient",
                        "encounter_id": existing_encounter.id,
                    },
                    status=status.HTTP_200_OK,
                )
            # If unclaimed, claim it
            with transaction.atomic():
                existing_encounter = Encounter.objects.select_for_update().get(
                    pk=existing_encounter.pk
                )
                existing_encounter.assigned_clinician = request.user
                existing_encounter.claimed_at = timezone.now()
                if existing_encounter.consultation_status == "WAITING":
                    existing_encounter.consultation_status = "CALLED"
                    existing_encounter.called_at = timezone.now()
                existing_encounter.save()

                AuditLog.log(
                    action="encounter_quick_claim",
                    user=request.user,
                    resource_type="Encounter",
                    resource_id=existing_encounter.id,
                    ip_address=get_client_ip(request),
                    user_agent=request.META.get("HTTP_USER_AGENT", ""),
                    patient_id=patient.id,
                    details={"existing_encounter": True},
                )

            serializer = self.get_serializer(existing_encounter)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Create a new encounter
        with transaction.atomic():
            encounter = Encounter.objects.create(
                patient=patient,
                encounter_type=request.data.get("encounter_type", "OPD"),
                chief_complaint=request.data.get("chief_complaint", ""),
                status="IN_PROGRESS",
                triage_requirement="NOT_REQUIRED",
                triage_status="NOT_APPLICABLE",
                consultation_status="CALLED",
                called_at=timezone.now(),
                assigned_clinician=request.user,
                claimed_at=timezone.now(),
                encounter_date=timezone.now().date(),
                registered_by=request.user,
            )

            # Create notification
            create_patient_called_notification(encounter, request.user)

            # Log the action
            AuditLog.log(
                action="encounter_quick_consultation",
                user=request.user,
                resource_type="Encounter",
                resource_id=encounter.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=patient.id,
                details={"encounter_type": encounter.encounter_type},
            )

        serializer = self.get_serializer(encounter)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def start_consultation(self, request, pk=None):
        """
        Start consultation for a patient.

        Sets consultation_status to IN_PROGRESS and records the start time.
        Only allowed from WAITING or CALLED status.

        POST /api/encounters/{id}/start_consultation/
        """
        encounter = self.get_object()

        try:
            encounter.begin_consultation()
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(encounter)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def consultation_queue(self, request):
        """
        Get list of encounters ready for consultation.

        Returns encounters that:
        - Have triage_status in (COMPLETED, BYPASSED, NOT_APPLICABLE)
        - Have consultation_status in (WAITING, CALLED)
        - Exclude MANDATORY + PENDING triage

        Sorted by:
        - Emergency encounters first
        - Then by wait time (oldest first)

        Query params:
        - triage_status: Filter by triage status
        - consultation_status: Filter by consultation status

        GET /api/encounters/consultation_queue/
        """
        from django.db.models import Case, IntegerField, Value, When

        queryset = self.get_queryset()

        # Filter for consultation-ready encounters
        queryset = queryset.filter(
            triage_status__in=["COMPLETED", "BYPASSED", "NOT_APPLICABLE"],
            consultation_status__in=["WAITING", "CALLED"],
        )

        # Apply optional filters
        triage_status = request.query_params.get("triage_status")
        if triage_status:
            queryset = queryset.filter(triage_status=triage_status)

        consultation_status = request.query_params.get("consultation_status")
        if consultation_status:
            queryset = queryset.filter(consultation_status=consultation_status)

        # Sort by priority (emergency first) then by wait time
        queryset = queryset.annotate(
            is_emergency=Case(
                When(encounter_type="EMERGENCY", then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        ).order_by("is_emergency", "created_at")

        # Paginate and serialize
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data})

    @action(detail=False, methods=["get"])
    def pre_triage_queue(self, request):
        """
        Get list of encounters awaiting triage.

        Returns encounters that:
        - Have triage_status = PENDING (or IN_PROGRESS if include_in_progress=true)
        - Have triage_requirement in (MANDATORY, OPTIONAL)
        - Excludes NOT_REQUIRED encounters

        Sorted by:
        - Arrival time (created_at) ascending (FIFO)

        Query params:
        - triage_requirement: Filter by triage requirement (MANDATORY, OPTIONAL)
        - encounter_type: Filter by encounter type
        - include_in_progress: Include IN_PROGRESS encounters (default: false)

        GET /api/encounters/pre_triage_queue/
        """

        queryset = self.get_queryset()

        # Only include encounters requiring triage (MANDATORY or OPTIONAL)
        queryset = queryset.filter(
            triage_requirement__in=["MANDATORY", "OPTIONAL"],
        )

        # By default, only show PENDING status
        # If include_in_progress=true, also show IN_PROGRESS
        include_in_progress = (
            request.query_params.get("include_in_progress", "false").lower() == "true"
        )
        if include_in_progress:
            queryset = queryset.filter(triage_status__in=["PENDING", "IN_PROGRESS"])
        else:
            queryset = queryset.filter(triage_status="PENDING")

        # Apply optional filters
        triage_requirement = request.query_params.get("triage_requirement")
        if triage_requirement:
            queryset = queryset.filter(triage_requirement=triage_requirement)

        encounter_type = request.query_params.get("encounter_type")
        if encounter_type:
            queryset = queryset.filter(encounter_type=encounter_type)

        # Sort by arrival time (FIFO)
        queryset = queryset.order_by("created_at")

        # Paginate and serialize
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data})

    # =========================================================================
    # Clinician Claim/Release Actions (Data Integrity - Sprint 1.7)
    # =========================================================================

    @action(detail=True, methods=["post"])
    def claim(self, request, pk=None):
        """
        Clinician claims an encounter to attend the patient.

        Prevents multiple clinicians from attending the same patient
        at the same time. Uses database-level locking to prevent race conditions.

        POST /api/encounters/{id}/claim/

        Returns:
        - 200: Successfully claimed
        - 400: Cannot claim (invalid status)
        - 409: Already claimed by another clinician
        """
        from django.db import transaction
        from django.utils import timezone

        with transaction.atomic():
            # Lock the encounter row to prevent race conditions
            encounter = Encounter.objects.select_for_update().get(pk=pk)

            # Check if already claimed by another user
            if encounter.assigned_clinician and encounter.assigned_clinician != request.user:
                return Response(
                    {
                        "error": f"Encounter already claimed by {encounter.assigned_clinician.username}. "
                        f"They must release it before you can claim it."
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            # Check if encounter is in valid status for claiming
            if encounter.status in ("CLOSED", "CANCELLED"):
                return Response(
                    {"error": f"Cannot claim encounter with status '{encounter.status}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Claim the encounter
            encounter.assigned_clinician = request.user
            encounter.claimed_at = timezone.now()
            if encounter.status in ("CREATED", "CHECKED_IN", "TRIAGED"):
                encounter.status = "IN_PROGRESS"
            encounter.save()

            # Log the claim action
            AuditLog.log(
                action="encounter_claim",
                user=request.user,
                resource_type="Encounter",
                resource_id=encounter.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=encounter.patient_id,
                details={"encounter_type": encounter.encounter_type},
            )

        return Response(
            {
                "status": "claimed",
                "encounter_id": encounter.id,
                "claimed_by": request.user.username,
                "claimed_at": encounter.claimed_at.isoformat(),
            }
        )

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        """
        Clinician releases an encounter they previously claimed.

        Only the assigned clinician can release an encounter.
        This allows another clinician to take over.

        POST /api/encounters/{id}/release/

        Returns:
        - 200: Successfully released
        - 403: Not the assigned clinician
        - 400: Cannot release (encounter completed/cancelled)
        """
        from django.db import transaction

        with transaction.atomic():
            encounter = Encounter.objects.select_for_update().get(pk=pk)

            # Check if user is the assigned clinician
            if encounter.assigned_clinician != request.user:
                if encounter.assigned_clinician:
                    return Response(
                        {
                            "error": f"You are not the assigned clinician. "
                            f"This encounter is assigned to {encounter.assigned_clinician.username}."
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                else:
                    return Response(
                        {"error": "This encounter is not currently claimed by anyone."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # Cannot release closed or cancelled encounters
            if encounter.status in ("CLOSED", "CANCELLED"):
                return Response(
                    {"error": f"Cannot release an encounter with status '{encounter.status}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Store previous clinician for audit log
            previous_clinician = encounter.assigned_clinician.username

            # Release the encounter
            encounter.assigned_clinician = None
            encounter.claimed_at = None
            # Optionally revert to DRAFT if it was only IN_PROGRESS due to claiming
            # (Leave as IN_PROGRESS if clinical work has started)
            encounter.save()

            # Log the release action
            AuditLog.log(
                action="encounter_release",
                user=request.user,
                resource_type="Encounter",
                resource_id=encounter.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                patient_id=encounter.patient_id,
                details={
                    "encounter_type": encounter.encounter_type,
                    "released_by": previous_clinician,
                },
            )

        return Response(
            {
                "status": "released",
                "encounter_id": encounter.id,
            }
        )

    @action(detail=False, methods=["get"])
    def my_claimed(self, request):
        """
        Get list of encounters claimed by the current user.

        Returns all encounters where the current user is the assigned clinician
        and the encounter is not yet closed.

        GET /api/encounters/my_claimed/

        Query params:
        - status: Filter by encounter status
        - include_completed: Include closed encounters (default: false)
        """
        queryset = self.get_queryset().filter(assigned_clinician=request.user)

        # By default, exclude closed encounters
        include_completed = request.query_params.get("include_completed", "false").lower() == "true"
        if not include_completed:
            queryset = queryset.exclude(status__in=["CLOSED", "CANCELLED"])

        # Optional status filter
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Order by claimed_at (most recent first)
        queryset = queryset.order_by("-claimed_at")

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data, "count": queryset.count()})

    @action(detail=False, methods=["get"], url_path="all_claimed")
    def all_claimed(self, request):
        """
        Get list of all currently claimed encounters.

        This endpoint is for supervisors and management to see all encounters
        currently being worked on by clinicians.

        Requires user to have hierarchy_level <= 3 (supervisor or above)
        or the 'encounters.view_all_claimed' permission.

        GET /api/encounters/all_claimed/

        Query params:
        - status: Filter by encounter status
        - include_completed: Include closed encounters (default: false)
        - clinician: Filter by clinician ID
        - department: Filter by department ID
        """
        # Permission check: supervisor level (hierarchy_level <= 3) or specific permission
        user = request.user

        # Check if user has the specific permission
        has_permission = user.has_perm("encounters.view_all_claimed")

        # Check if user is supervisor level (hierarchy_level <= 3)
        is_supervisor = False
        if hasattr(user, "staff_profile") and user.staff_profile:
            primary_role = user.staff_profile.primary_role
            if primary_role and primary_role.hierarchy_level <= 3:
                is_supervisor = True

        # Also allow superusers and staff
        if not (has_permission or is_supervisor or user.is_superuser or user.is_staff):
            return Response(
                {"error": "You do not have permission to view all claimed encounters."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get all claimed encounters (where assigned_clinician is set)
        queryset = self.get_queryset().filter(assigned_clinician__isnull=False)

        # By default, exclude closed encounters
        include_completed = request.query_params.get("include_completed", "false").lower() == "true"
        if not include_completed:
            queryset = queryset.exclude(status__in=["CLOSED", "CANCELLED"])

        # Optional filters
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        clinician_filter = request.query_params.get("clinician")
        if clinician_filter:
            queryset = queryset.filter(assigned_clinician_id=clinician_filter)

        department_filter = request.query_params.get("department")
        if department_filter:
            queryset = queryset.filter(department_id=department_filter)

        # Order by claimed_at (most recent first)
        queryset = queryset.order_by("-claimed_at")

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data, "count": queryset.count()})

    # =========================================================================
    # Clinical Template Sync Actions
    # =========================================================================

    @action(detail=True, methods=["get"], url_path="populate-template")
    def populate_template(self, request, pk=None):
        """
        Populate template fields from existing encounter/patient data.

        Auto-fills template fields with matching encounter vitals and
        patient demographics.

        GET /api/encounters/{id}/populate-template/?template_id=123

        Query params:
        - template_id: Required. The ID of the template to populate.
        - structure_by_section: Optional. If 'true', structures data by section names.

        Returns:
        {
            "populated_data": { ... },
            "template_id": 123,
            "template_name": "Vitals Assessment"
        }
        """
        from hmis.apps.clinical_templates.models import ClinicalTemplate
        from hmis.apps.clinical_templates.services import TemplateDataSynchronizer

        encounter = self.get_object()

        # Validate template_id
        template_id = request.query_params.get("template_id")
        if not template_id:
            return Response(
                {"detail": "template_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            template = ClinicalTemplate.objects.get(pk=template_id, is_active=True)
        except ClinicalTemplate.DoesNotExist:
            return Response(
                {"detail": "Template not found or inactive."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get existing template data from encounter if any
        existing_data = encounter.clinical_template_data or {}

        # Populate from encounter
        synchronizer = TemplateDataSynchronizer()
        structure_by_section = (
            request.query_params.get("structure_by_section", "false").lower() == "true"
        )

        populated_data = synchronizer.populate_from_encounter(
            template=template,
            encounter=encounter,
            existing_data=existing_data,
            structure_by_section=structure_by_section,
        )

        return Response(
            {
                "populated_data": populated_data,
                "template_id": template.id,
                "template_name": template.name,
            }
        )

    @action(detail=True, methods=["post"], url_path="sync-template")
    def sync_template(self, request, pk=None):
        """
        Sync template data back to encounter fields.

        Updates encounter vitals and other fields from template data.

        POST /api/encounters/{id}/sync-template/
        {
            "template_id": 123,
            "template_data": {
                "temperature": 37.5,
                "pulse": 80,
                ...
            }
        }

        Returns:
        - Updated encounter with changed_fields list
        """
        from hmis.apps.clinical_templates.models import ClinicalTemplate
        from hmis.apps.clinical_templates.services import TemplateDataSynchronizer

        encounter = self.get_object()

        # Check if encounter can be edited
        if not encounter.can_edit():
            return Response(
                {"detail": f"Encounter with status '{encounter.status}' cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate request data
        template_id = request.data.get("template_id")
        template_data = request.data.get("template_data")

        if not template_id:
            return Response(
                {"detail": "template_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not template_data or not isinstance(template_data, dict):
            return Response(
                {"detail": "template_data must be a non-empty object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            template = ClinicalTemplate.objects.get(pk=template_id, is_active=True)
        except ClinicalTemplate.DoesNotExist:
            return Response(
                {"detail": "Template not found or inactive."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Sync template data to encounter
        synchronizer = TemplateDataSynchronizer()
        updated_encounter, changed_fields = synchronizer.sync_to_encounter(
            template_data=template_data,
            encounter=encounter,
            return_changes=True,
        )

        # Also store the template data on the encounter
        updated_encounter.clinical_template = template
        updated_encounter.clinical_template_data = template_data
        updated_encounter.save(update_fields=["clinical_template", "clinical_template_data"])

        serializer = self.get_serializer(updated_encounter)
        return Response(
            {
                **serializer.data,
                "changed_fields": changed_fields,
            }
        )

    @action(detail=True, methods=["get", "post"], url_path="template-snapshots")
    def template_snapshots(self, request, pk=None):
        """
        List or create template snapshots for an encounter.

        GET /api/encounters/{id}/template-snapshots/
        - Returns list of template snapshots for this encounter

        POST /api/encounters/{id}/template-snapshots/
        {
            "template_id": 123,
            "template_data": { ... }
        }
        - Creates a new immutable snapshot
        """
        from hmis.apps.clinical_templates.models import ClinicalTemplate
        from hmis.apps.clinical_templates.services import TemplateSnapshotService

        encounter = self.get_object()
        service = TemplateSnapshotService()

        if request.method == "GET":
            snapshots = service.get_snapshots_for_encounter(encounter)
            return Response(
                [
                    {
                        "id": s.id,
                        "template_id": s.template_id,
                        "template_name": s.template_name,
                        "template_version": s.template_version,
                        "data": s.data,
                        "created_by": s.created_by.username if s.created_by else None,
                        "created_at": s.created_at.isoformat(),
                    }
                    for s in snapshots
                ]
            )

        # POST - Create snapshot
        template_id = request.data.get("template_id")
        template_data = request.data.get("template_data")

        if not template_id:
            return Response(
                {"detail": "template_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not template_data or not isinstance(template_data, dict):
            return Response(
                {"detail": "template_data must be a non-empty object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            template = ClinicalTemplate.objects.get(pk=template_id)
        except ClinicalTemplate.DoesNotExist:
            return Response(
                {"detail": "Template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot = service.create_snapshot(
            encounter=encounter,
            template=template,
            template_data=template_data,
            created_by=request.user,
        )

        return Response(
            {
                "id": snapshot.id,
                "template_id": snapshot.template_id,
                "template_name": snapshot.template_name,
                "template_version": snapshot.template_version,
                "created_at": snapshot.created_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )

    def get_queryset(self):
        """
        Optionally filter encounters by patient and status.

        Also filters out encounters for sensitive patients if user lacks permission.

        Query params:
        - patient_id: Filter by patient ID
        - patient_mrn: Filter by patient MRN
        - status: Filter by status (comma-separated for multiple)
        """
        queryset = Encounter.objects.select_related("patient", "finalized_by").all()
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

        # Filter by status if provided (comma-separated)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            statuses = [s.strip().upper() for s in status_filter.split(",")]
            queryset = queryset.filter(status__in=statuses)

        # Filter by clinic if provided
        clinic_id = self.request.query_params.get("clinic")
        if clinic_id:
            queryset = queryset.filter(clinic_visit__session__clinic_id=clinic_id)

        return queryset


class TreatmentPlanView(APIView):
    """
    View for Treatment Plan operations.

    Supports GET, POST, PUT, PATCH for single treatment plan per encounter.

    Endpoints:
    - GET /api/encounters/{encounter_id}/treatment-plan/ - Get treatment plan
    - POST /api/encounters/{encounter_id}/treatment-plan/ - Create treatment plan
    - PUT/PATCH /api/encounters/{encounter_id}/treatment-plan/ - Update treatment plan
    """

    permission_classes = [IsAuthenticated]

    def _get_encounter(self, encounter_pk):
        """Get encounter or return 404."""
        try:
            return Encounter.objects.get(pk=encounter_pk)
        except Encounter.DoesNotExist:
            return None

    @extend_schema(
        responses={200: TreatmentPlanSerializer},
    )
    def get(self, request, encounter_pk):
        """Get treatment plan for encounter."""
        encounter = self._get_encounter(encounter_pk)
        if not encounter:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            plan = TreatmentPlan.objects.get(encounter=encounter)
            serializer = TreatmentPlanSerializer(plan)
            return Response(serializer.data)
        except TreatmentPlan.DoesNotExist:
            return Response(
                {"detail": "Treatment plan not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

    @extend_schema(
        request=TreatmentPlanSerializer,
        responses={201: TreatmentPlanSerializer},
    )
    def post(self, request, encounter_pk):
        """Create treatment plan for encounter."""
        encounter = self._get_encounter(encounter_pk)
        if not encounter:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if plan already exists
        if TreatmentPlan.objects.filter(encounter=encounter).exists():
            return Response(
                {"detail": "Treatment plan already exists for this encounter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data.copy()
        data["encounter"] = encounter_pk

        serializer = TreatmentPlanSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Audit log
        AuditLog.log(
            action="treatment_plan_create",
            user=request.user,
            resource_type="TreatmentPlan",
            resource_id=serializer.data.get("id"),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=TreatmentPlanSerializer,
        responses={200: TreatmentPlanSerializer},
    )
    def patch(self, request, encounter_pk):
        """Partially update treatment plan."""
        encounter = self._get_encounter(encounter_pk)
        if not encounter:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            plan = TreatmentPlan.objects.get(encounter=encounter)
        except TreatmentPlan.DoesNotExist:
            return Response(
                {"detail": "Treatment plan not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = TreatmentPlanSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Audit log
        AuditLog.log(
            action="treatment_plan_update",
            user=request.user,
            resource_type="TreatmentPlan",
            resource_id=plan.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
        )

        return Response(serializer.data)

    @extend_schema(
        request=TreatmentPlanSerializer,
        responses={200: TreatmentPlanSerializer},
    )
    def put(self, request, encounter_pk):
        """Full update of treatment plan."""
        return self.patch(request, encounter_pk)


class ApplyTemplateView(APIView):
    """
    Apply a treatment plan template to an encounter.

    Endpoint:
    - POST /api/encounters/{encounter_id}/treatment-plan/apply-template/
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name="ApplyTemplateRequest",
            fields={
                "template_id": serializers.IntegerField(),
            },
        ),
        responses={200: TreatmentPlanSerializer},
    )
    def post(self, request, encounter_pk):
        """Apply template to treatment plan."""
        # Get encounter
        try:
            encounter = Encounter.objects.get(pk=encounter_pk)
        except Encounter.DoesNotExist:
            return Response(
                {"detail": "Encounter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get template ID from request
        template_id = request.data.get("template_id")
        if not template_id:
            return Response(
                {"detail": "template_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get template
        try:
            template = TreatmentPlanTemplate.objects.get(pk=template_id, is_active=True)
        except TreatmentPlanTemplate.DoesNotExist:
            return Response(
                {"detail": "Template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get or create treatment plan
        plan, created = TreatmentPlan.objects.get_or_create(
            encounter=encounter,
            defaults={"created_by": request.user},
        )

        # Apply template
        plan.apply_template(template)

        # Audit log
        AuditLog.log(
            action="treatment_plan_apply_template",
            user=request.user,
            resource_type="TreatmentPlan",
            resource_id=plan.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=encounter.patient_id,
            details={"template_id": template_id, "template_name": template.name},
        )

        serializer = TreatmentPlanSerializer(plan)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MedicationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Medication model.

    Provides CRUD operations for treatment plan medications.

    Endpoints:
    - GET /api/encounters/{encounter_id}/treatment-plan/medications/ - List
    - POST /api/encounters/{encounter_id}/treatment-plan/medications/ - Create
    - GET /api/encounters/{encounter_id}/treatment-plan/medications/{id}/ - Retrieve
    - PUT /api/encounters/{encounter_id}/treatment-plan/medications/{id}/ - Update
    - DELETE /api/encounters/{encounter_id}/treatment-plan/medications/{id}/ - Delete
    """

    serializer_class = MedicationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def _get_treatment_plan(self, encounter_pk):
        """Get treatment plan for encounter."""
        try:
            encounter = Encounter.objects.get(pk=encounter_pk)
            return TreatmentPlan.objects.get(encounter=encounter)
        except (Encounter.DoesNotExist, TreatmentPlan.DoesNotExist):
            return None

    def get_queryset(self):
        """Filter medications by treatment plan."""
        encounter_pk = self.kwargs.get("encounter_pk")
        plan = self._get_treatment_plan(encounter_pk)
        if plan:
            return Medication.objects.filter(treatment_plan=plan)
        return Medication.objects.none()

    def create(self, request, *args, **kwargs):
        """Create medication with treatment plan from URL."""
        encounter_pk = self.kwargs.get("encounter_pk")
        plan = self._get_treatment_plan(encounter_pk)

        if not plan:
            return Response(
                {"detail": "Treatment plan not found for this encounter."},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data.copy()
        data["treatment_plan"] = plan.id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        # Audit log
        AuditLog.log(
            action="medication_create",
            user=request.user,
            resource_type="Medication",
            resource_id=serializer.data.get("id"),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=plan.encounter.patient_id,
            details={"medication_name": serializer.data.get("name")},
        )

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
