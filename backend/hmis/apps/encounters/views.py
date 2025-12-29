"""
Views for the encounters app.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

from .models import Diagnosis, Encounter, ICD10Code, Medication, TreatmentPlan, TreatmentPlanTemplate
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

