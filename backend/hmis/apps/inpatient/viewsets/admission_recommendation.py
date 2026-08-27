"""
What this file is for: admission recommendation workflow APIs.
How to use: imported and re-exported by ``inpatient.views`` to preserve router imports.
Supported inputs/args: DRF ViewSet payloads/query params for create/accept/decline/pending endpoints.
"""

# ruff: noqa: ARG002

from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import AdmissionRecommendation
from ..serializers import AdmissionRecommendationSerializer

User = get_user_model()


class AdmissionRecommendationViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for AdmissionRecommendation model."""

    queryset = AdmissionRecommendation.objects.all()
    serializer_class = AdmissionRecommendationSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "urgency", "recommended_by", "preferred_ward_type"]
    search_fields = ["reason", "provisional_diagnosis_text"]
    ordering_fields = ["created_at", "expires_at", "urgency"]
    ordering = ["-created_at"]
    tenant_facility_chain = "encounter__facility"
    tenant_org_chain = "encounter__organization"

    def perform_create(self, serializer):
        """Create recommendation and log action."""
        instance = serializer.save()

        AuditLog.log(
            action="admission_recommendation_create",
            user=self.request.user,
            resource_type="AdmissionRecommendation",
            resource_id=instance.id,
            details={
                "encounter": instance.encounter.id,
                "urgency": instance.urgency,
                "reason": instance.reason,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Accept a pending admission recommendation."""
        recommendation = self.get_object()
        user_id = request.data.get("user")

        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=user_id)
            recommendation.accept(user)

            AuditLog.log(
                action="admission_recommendation_accept",
                user=request.user,
                resource_type="AdmissionRecommendation",
                resource_id=recommendation.id,
                details={"accepted_by": user.username},
                ip_address=get_client_ip(request),
            )

            serializer = self.get_serializer(recommendation)
            return Response(serializer.data)

        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        """Decline a pending admission recommendation."""
        recommendation = self.get_object()
        user_id = request.data.get("user")
        reason = request.data.get("reason")

        if not user_id or not reason:
            return Response(
                {"error": "User ID and reason required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(id=user_id)
            recommendation.decline(user, reason)

            AuditLog.log(
                action="admission_recommendation_decline",
                user=request.user,
                resource_type="AdmissionRecommendation",
                resource_id=recommendation.id,
                details={
                    "declined_by": user.username,
                    "reason": reason,
                },
                ip_address=get_client_ip(request),
            )

            serializer = self.get_serializer(recommendation)
            return Response(serializer.data)

        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"], url_path="pending-admissions")
    def pending_admissions(self, request):
        """List IPD encounters that do not yet have an admission record."""
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.encounters.serializers import EncounterListSerializer

        queryset = (
            Encounter.objects.filter(
                encounter_type="IPD",
                status="IN_PROGRESS",
                admission__isnull=True,
            )
            .select_related("patient", "facility", "organization")
            .order_by("-encounter_date", "-created_at")
        )

        facility = getattr(request, "facility", None)
        if facility:
            queryset = queryset.filter(facility=facility)
        elif hasattr(request.user, "staff_profile"):
            profile = request.user.staff_profile
            if hasattr(profile, "primary_facility") and profile.primary_facility:
                queryset = queryset.filter(facility=profile.primary_facility)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = EncounterListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = EncounterListSerializer(queryset, many=True)
        return Response(serializer.data)
