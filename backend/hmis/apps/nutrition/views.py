"""
Views for the nutrition module.

Provides REST API endpoints for:
- NutritionConsultation (assessments)
- DietPlan (meal plans)
"""

from django.db import models
from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.nutrition.models import DietPlan, NutritionConsultation
from hmis.apps.nutrition.serializers import (
    DietPlanCreateSerializer,
    DietPlanDiscontinueSerializer,
    DietPlanListSerializer,
    DietPlanSerializer,
    NutritionConsultationAssignDietitianSerializer,
    NutritionConsultationCreateSerializer,
    NutritionConsultationListSerializer,
    NutritionConsultationSerializer,
    NutritionConsultationUpdateStatusSerializer,
)

# ============================================================================
# Nutrition Consultation ViewSet
# ============================================================================


class NutritionConsultationFilter(django_filters.FilterSet):
    """Filter for NutritionConsultation."""

    patient = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    priority = django_filters.CharFilter(lookup_expr="iexact")
    dietitian = django_filters.NumberFilter()
    referral_reason = django_filters.CharFilter(lookup_expr="iexact")
    nutritional_status = django_filters.CharFilter(lookup_expr="iexact")
    consultation_from = django_filters.DateFilter(
        field_name="consultation_date", lookup_expr="date__gte"
    )
    consultation_to = django_filters.DateFilter(
        field_name="consultation_date", lookup_expr="date__lte"
    )
    bmi_min = django_filters.NumberFilter(field_name="bmi", lookup_expr="gte")
    bmi_max = django_filters.NumberFilter(field_name="bmi", lookup_expr="lte")

    class Meta:
        model = NutritionConsultation
        fields = [
            "patient",
            "status",
            "priority",
            "dietitian",
            "referral_reason",
            "nutritional_status",
        ]


class NutritionConsultationViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing nutrition consultations.

    Provides CRUD operations plus custom actions for:
    - Updating consultation status
    - Assigning dietitian
    - Syncing anthropometrics from encounter
    """

    queryset = NutritionConsultation.objects.select_related(
        "patient",
        "encounter",
        "dietitian",
        "referred_by",
        "clinic_visit",
    ).prefetch_related("diet_plans")
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = NutritionConsultationFilter
    search_fields = [
        "consultation_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "diagnosis",
        "recommendations",
    ]
    ordering_fields = [
        "consultation_date",
        "status",
        "priority",
        "bmi",
        "created_at",
    ]
    ordering = ["-consultation_date"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return NutritionConsultationListSerializer
        if self.action == "create":
            return NutritionConsultationCreateSerializer
        if self.action == "update_status":
            return NutritionConsultationUpdateStatusSerializer
        if self.action == "assign_dietitian":
            return NutritionConsultationAssignDietitianSerializer
        return NutritionConsultationSerializer

    def perform_create(self, serializer):
        """Create consultation and log audit."""
        consultation = serializer.save(referred_by=self.request.user)
        AuditLog.log(
            action="nutrition_consultation_create",
            user=self.request.user,
            resource_type="NutritionConsultation",
            resource_id=consultation.id,
            details={
                "consultation_number": consultation.consultation_number,
                "patient_id": consultation.patient_id,
                "referral_reason": consultation.referral_reason,
            },
        )
        # Store the created consultation for response serialization
        self._created_consultation = consultation

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_consultation"):
            response.data = NutritionConsultationSerializer(self._created_consultation).data
        return response

    def perform_update(self, serializer):
        """Update consultation and log audit."""
        consultation = serializer.save()
        AuditLog.log(
            action="nutrition_consultation_update",
            user=self.request.user,
            resource_type="NutritionConsultation",
            resource_id=consultation.id,
            details={
                "consultation_number": consultation.consultation_number,
                "changes": serializer.validated_data,
            },
        )

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """
        Update consultation status with validation.

        POST /api/nutrition/consultations/{id}/update_status/
        Body: {"status": "IN_PROGRESS", "notes": "Optional notes"}
        """
        consultation = self.get_object()
        serializer = self.get_serializer(consultation, data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        old_status = consultation.status
        consultation.transition_status(new_status, user=request.user)

        AuditLog.log(
            action="nutrition_consultation_status_change",
            user=request.user,
            resource_type="NutritionConsultation",
            resource_id=consultation.id,
            details={
                "consultation_number": consultation.consultation_number,
                "old_status": old_status,
                "new_status": new_status,
                "notes": serializer.validated_data.get("notes", ""),
            },
        )

        return Response(NutritionConsultationSerializer(consultation).data)

    @action(detail=True, methods=["post"])
    def assign_dietitian(self, request, pk=None):
        """
        Assign a dietitian to the consultation.

        POST /api/nutrition/consultations/{id}/assign_dietitian/
        Body: {"dietitian": 123}
        """
        consultation = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dietitian = serializer.validated_data["dietitian"]
        consultation.dietitian = dietitian
        consultation.save(update_fields=["dietitian", "updated_at"])

        AuditLog.log(
            action="nutrition_consultation_assign_dietitian",
            user=request.user,
            resource_type="NutritionConsultation",
            resource_id=consultation.id,
            details={
                "consultation_number": consultation.consultation_number,
                "dietitian_id": dietitian.id,
                "dietitian_name": f"{dietitian.first_name} {dietitian.last_name}",
            },
        )

        return Response(NutritionConsultationSerializer(consultation).data)

    @action(detail=True, methods=["post"])
    def sync_anthropometrics(self, request, pk=None):
        """
        Sync anthropometric measurements from linked encounter.

        POST /api/nutrition/consultations/{id}/sync_anthropometrics/
        """
        consultation = self.get_object()

        if not consultation.encounter:
            return Response(
                {"error": "No encounter linked to this consultation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = consultation.sync_anthropometrics_from_encounter()

        if updated:
            AuditLog.log(
                action="nutrition_consultation_sync_anthropometrics",
                user=request.user,
                resource_type="NutritionConsultation",
                resource_id=consultation.id,
                details={
                    "consultation_number": consultation.consultation_number,
                    "encounter_id": consultation.encounter_id,
                    "weight": str(consultation.weight) if consultation.weight else None,
                    "height": str(consultation.height) if consultation.height else None,
                },
            )
            return Response(
                {
                    "message": "Anthropometrics synced from encounter",
                    "data": NutritionConsultationSerializer(consultation).data,
                }
            )
        else:
            return Response(
                {"message": "No new measurements to sync"},
                status=status.HTTP_200_OK,
            )

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Complete the consultation.

        POST /api/nutrition/consultations/{id}/complete/
        """
        consultation = self.get_object()

        if consultation.status == "COMPLETED":
            return Response(
                {"error": "Consultation is already completed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not consultation.can_transition_to("COMPLETED"):
            return Response(
                {"error": f"Cannot complete consultation with status '{consultation.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consultation.transition_status("COMPLETED", user=request.user)

        AuditLog.log(
            action="nutrition_consultation_complete",
            user=request.user,
            resource_type="NutritionConsultation",
            resource_id=consultation.id,
            details={
                "consultation_number": consultation.consultation_number,
                "completed_at": str(consultation.completed_at),
            },
        )

        return Response(NutritionConsultationSerializer(consultation).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel the consultation.

        POST /api/nutrition/consultations/{id}/cancel/
        """
        consultation = self.get_object()

        if consultation.status == "CANCELLED":
            return Response(
                {"error": "Consultation is already cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not consultation.can_transition_to("CANCELLED"):
            return Response(
                {"error": f"Cannot cancel consultation with status '{consultation.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consultation.transition_status("CANCELLED", user=request.user)

        AuditLog.log(
            action="nutrition_consultation_cancel",
            user=request.user,
            resource_type="NutritionConsultation",
            resource_id=consultation.id,
            details={
                "consultation_number": consultation.consultation_number,
            },
        )

        return Response(NutritionConsultationSerializer(consultation).data)


# ============================================================================
# Diet Plan ViewSet
# ============================================================================


class DietPlanFilter(django_filters.FilterSet):
    """Filter for DietPlan."""

    patient = django_filters.NumberFilter()
    consultation = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    plan_type = django_filters.CharFilter(lookup_expr="iexact")
    created_by = django_filters.NumberFilter()
    start_from = django_filters.DateFilter(field_name="start_date", lookup_expr="gte")
    start_to = django_filters.DateFilter(field_name="start_date", lookup_expr="lte")
    is_active = django_filters.BooleanFilter(method="filter_is_active")

    class Meta:
        model = DietPlan
        fields = [
            "patient",
            "consultation",
            "status",
            "plan_type",
            "created_by",
        ]

    def filter_is_active(self, queryset, name, value):
        """Filter by active status."""
        from datetime import date

        today = date.today()
        if value:
            # Active plans: status=ACTIVE, start_date <= today, end_date >= today or None
            return queryset.filter(
                status="ACTIVE",
                start_date__lte=today,
            ).filter(models.Q(end_date__gte=today) | models.Q(end_date__isnull=True))
        else:
            # Inactive plans
            return queryset.exclude(
                status="ACTIVE",
                start_date__lte=today,
            ).exclude(models.Q(end_date__gte=today) | models.Q(end_date__isnull=True))


class DietPlanViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing diet plans.

    Provides CRUD operations plus custom actions for:
    - Activating plans
    - Discontinuing plans
    """

    tenant_facility_chain = "consultation__facility"
    tenant_org_chain = "consultation__organization"

    queryset = DietPlan.objects.select_related(
        "patient",
        "consultation",
        "created_by",
        "updated_by",
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = DietPlanFilter
    search_fields = [
        "plan_number",
        "name",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "description",
        "restrictions",
    ]
    ordering_fields = [
        "created_at",
        "start_date",
        "end_date",
        "status",
        "plan_type",
    ]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return DietPlanListSerializer
        if self.action == "create":
            return DietPlanCreateSerializer
        if self.action == "discontinue":
            return DietPlanDiscontinueSerializer
        return DietPlanSerializer

    def perform_create(self, serializer):
        """Create diet plan and log audit."""
        diet_plan = serializer.save(created_by=self.request.user)
        AuditLog.log(
            action="diet_plan_create",
            user=self.request.user,
            resource_type="DietPlan",
            resource_id=diet_plan.id,
            details={
                "plan_number": diet_plan.plan_number,
                "patient_id": diet_plan.patient_id,
                "plan_type": diet_plan.plan_type,
                "name": diet_plan.name,
            },
        )
        # Store the created plan for response serialization
        self._created_plan = diet_plan

    def create(self, request, *args, **kwargs):
        """Override create to return detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_plan"):
            response.data = DietPlanSerializer(self._created_plan).data
        return response

    def perform_update(self, serializer):
        """Update diet plan and log audit."""
        diet_plan = serializer.save(updated_by=self.request.user)
        AuditLog.log(
            action="diet_plan_update",
            user=self.request.user,
            resource_type="DietPlan",
            resource_id=diet_plan.id,
            details={
                "plan_number": diet_plan.plan_number,
                "changes": serializer.validated_data,
            },
        )

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """
        Activate a diet plan.

        POST /api/nutrition/diet-plans/{id}/activate/
        """
        diet_plan = self.get_object()

        try:
            diet_plan.activate(user=request.user)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="diet_plan_activate",
            user=request.user,
            resource_type="DietPlan",
            resource_id=diet_plan.id,
            details={
                "plan_number": diet_plan.plan_number,
                "activated_at": str(diet_plan.activated_at),
            },
        )

        return Response(DietPlanSerializer(diet_plan).data)

    @action(detail=True, methods=["post"])
    def discontinue(self, request, pk=None):
        """
        Discontinue a diet plan.

        POST /api/nutrition/diet-plans/{id}/discontinue/
        Body: {"reason": "Patient no longer following plan"}
        """
        diet_plan = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data["reason"]

        try:
            diet_plan.discontinue(reason=reason, user=request.user)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="diet_plan_discontinue",
            user=request.user,
            resource_type="DietPlan",
            resource_id=diet_plan.id,
            details={
                "plan_number": diet_plan.plan_number,
                "reason": reason,
                "discontinued_at": str(diet_plan.discontinued_at),
            },
        )

        return Response(DietPlanSerializer(diet_plan).data)

    @action(detail=True, methods=["post"])
    def put_on_hold(self, request, pk=None):
        """
        Put a diet plan on hold.

        POST /api/nutrition/diet-plans/{id}/put_on_hold/
        """
        diet_plan = self.get_object()

        if diet_plan.status not in ["DRAFT", "ACTIVE"]:
            return Response(
                {"error": f"Cannot put on hold diet plan with status '{diet_plan.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        diet_plan.status = "ON_HOLD"
        diet_plan.updated_by = request.user
        diet_plan.save(update_fields=["status", "updated_by", "updated_at"])

        AuditLog.log(
            action="diet_plan_on_hold",
            user=request.user,
            resource_type="DietPlan",
            resource_id=diet_plan.id,
            details={
                "plan_number": diet_plan.plan_number,
            },
        )

        return Response(DietPlanSerializer(diet_plan).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """
        Mark a diet plan as completed.

        POST /api/nutrition/diet-plans/{id}/complete/
        """
        diet_plan = self.get_object()

        if diet_plan.status not in ["ACTIVE", "ON_HOLD"]:
            return Response(
                {"error": f"Cannot complete diet plan with status '{diet_plan.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        diet_plan.status = "COMPLETED"
        diet_plan.updated_by = request.user
        diet_plan.save(update_fields=["status", "updated_by", "updated_at"])

        AuditLog.log(
            action="diet_plan_complete",
            user=request.user,
            resource_type="DietPlan",
            resource_id=diet_plan.id,
            details={
                "plan_number": diet_plan.plan_number,
            },
        )

        return Response(DietPlanSerializer(diet_plan).data)
