"""
Views for the referrals module.

Provides REST API endpoints for:
- ClinicalReferral CRUD
- Status transitions (accept, decline, cancel)
- Encounter-scoped referral listing
- Filtering by service, type, status, patient
"""

from django_filters import rest_framework as django_filters
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.referrals.models import ClinicalReferral
from hmis.apps.referrals.serializers import (
    ClinicalReferralCreateSerializer,
    ClinicalReferralListSerializer,
    ClinicalReferralSerializer,
    EncounterReferralSerializer,
    ReferralAcceptSerializer,
    ReferralCancelSerializer,
    ReferralDeclineSerializer,
)


class ClinicalReferralFilter(django_filters.FilterSet):
    """Filter for ClinicalReferral."""

    patient = django_filters.NumberFilter()
    encounter = django_filters.NumberFilter()
    referral_type = django_filters.CharFilter(lookup_expr="iexact")
    target_service = django_filters.CharFilter(lookup_expr="iexact")
    status = django_filters.CharFilter(lookup_expr="iexact")
    priority = django_filters.CharFilter(lookup_expr="iexact")
    referred_by = django_filters.NumberFilter()
    is_sensitive = django_filters.BooleanFilter()
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = ClinicalReferral
        fields = [
            "patient",
            "encounter",
            "referral_type",
            "target_service",
            "status",
            "priority",
            "referred_by",
            "is_sensitive",
        ]


class ClinicalReferralViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing clinical referrals.

    Provides CRUD operations plus custom actions for:
    - Accepting referrals
    - Declining referrals
    - Cancelling referrals
    - Listing referrals by encounter
    - Pending referrals queue
    """

    queryset = ClinicalReferral.objects.select_related(
        "patient",
        "encounter",
        "referred_by",
        "accepted_by",
        "declined_by",
        "clinic_visit",
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ClinicalReferralFilter
    search_fields = [
        "referral_number",
        "reason",
        "clinical_notes",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
    ]
    ordering_fields = ["created_at", "priority", "status", "target_service"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return ClinicalReferralListSerializer
        if self.action == "create":
            return ClinicalReferralCreateSerializer
        if self.action == "accept":
            return ReferralAcceptSerializer
        if self.action == "decline":
            return ReferralDeclineSerializer
        if self.action == "cancel":
            return ReferralCancelSerializer
        if self.action == "for_encounter":
            return EncounterReferralSerializer
        return ClinicalReferralSerializer

    def perform_create(self, serializer):
        """Create referral with audit logging."""
        referral = serializer.save()
        self._created_referral = referral

        AuditLog.log(
            action="referral_create",
            user=self.request.user,
            resource_type="ClinicalReferral",
            resource_id=referral.id,
            patient_id=referral.patient_id,
            details={
                "referral_number": referral.referral_number,
                "referral_type": referral.referral_type,
                "target_service": referral.target_service,
                "priority": referral.priority,
                "encounter_id": referral.encounter_id,
            },
        )

    def create(self, request, *args, **kwargs):
        """Create and return full detail serializer."""
        response = super().create(request, *args, **kwargs)
        if hasattr(self, "_created_referral"):
            response.data = ClinicalReferralSerializer(self._created_referral).data
        return response

    def perform_update(self, serializer):
        """Update referral with audit logging."""
        referral = serializer.save()

        AuditLog.log(
            action="referral_update",
            user=self.request.user,
            resource_type="ClinicalReferral",
            resource_id=referral.id,
            patient_id=referral.patient_id,
            details={
                "referral_number": referral.referral_number,
                "updated_fields": list(serializer.validated_data.keys()),
            },
        )

    def perform_destroy(self, instance):
        """Delete referral with audit logging (only drafts)."""
        if instance.status != "DRAFT":
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only draft referrals can be deleted. Cancel instead.")

        AuditLog.log(
            action="referral_delete",
            user=self.request.user,
            resource_type="ClinicalReferral",
            resource_id=instance.id,
            patient_id=instance.patient_id,
            details={"referral_number": instance.referral_number},
        )
        instance.delete()

    # =========================================================================
    # Custom Actions
    # =========================================================================

    @action(detail=True, methods=["post"], url_path="accept")
    def accept(self, request, pk=None):
        """Accept a referral."""
        referral = self.get_object()

        serializer = ReferralAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            referral.accept(user=request.user)
        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="referral_accept",
            user=request.user,
            resource_type="ClinicalReferral",
            resource_id=referral.id,
            patient_id=referral.patient_id,
            details={
                "referral_number": referral.referral_number,
                "target_service": referral.target_service,
            },
        )

        return Response(
            ClinicalReferralSerializer(referral).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="decline")
    def decline(self, request, pk=None):
        """Decline a referral with a reason."""
        referral = self.get_object()

        serializer = ReferralDeclineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            referral.decline(
                user=request.user,
                reason=serializer.validated_data["reason"],
            )
        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="referral_decline",
            user=request.user,
            resource_type="ClinicalReferral",
            resource_id=referral.id,
            patient_id=referral.patient_id,
            details={
                "referral_number": referral.referral_number,
                "reason": serializer.validated_data["reason"],
            },
        )

        return Response(
            ClinicalReferralSerializer(referral).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        """Cancel a referral."""
        referral = self.get_object()

        serializer = ReferralCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            referral.cancel(user=request.user)
        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="referral_cancel",
            user=request.user,
            resource_type="ClinicalReferral",
            resource_id=referral.id,
            patient_id=referral.patient_id,
            details={"referral_number": referral.referral_number},
        )

        return Response(
            ClinicalReferralSerializer(referral).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="for-encounter/(?P<encounter_id>[^/.]+)")
    def for_encounter(self, request, encounter_id=None):
        """List all referrals for a specific encounter."""
        referrals = self.get_queryset().filter(encounter_id=encounter_id)
        serializer = EncounterReferralSerializer(referrals, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        """List all pending referrals (for receiving services to review)."""
        qs = self.get_queryset().filter(status="PENDING")

        # Optional filter by target_service
        target_service = request.query_params.get("target_service")
        if target_service:
            qs = qs.filter(target_service__iexact=target_service)

        # Optional filter by referral_type
        referral_type = request.query_params.get("referral_type")
        if referral_type:
            qs = qs.filter(referral_type__iexact=referral_type)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ClinicalReferralListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ClinicalReferralListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="my-referrals")
    def my_referrals(self, request):
        """List referrals created by the current user."""
        qs = self.get_queryset().filter(referred_by=request.user)

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = ClinicalReferralListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = ClinicalReferralListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Return referral statistics."""
        qs = self.get_queryset()

        # Optional date filter
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")
        if from_date:
            qs = qs.filter(created_at__date__gte=from_date)
        if to_date:
            qs = qs.filter(created_at__date__lte=to_date)

        stats = {
            "total": qs.count(),
            "by_status": {},
            "by_type": {},
            "by_priority": {},
        }

        for s in ClinicalReferral.STATUS_CHOICES:
            count = qs.filter(status=s[0]).count()
            if count > 0:
                stats["by_status"][s[0]] = count

        for t in ClinicalReferral.REFERRAL_TYPE_CHOICES:
            count = qs.filter(referral_type=t[0]).count()
            if count > 0:
                stats["by_type"][t[0]] = count

        for p in ClinicalReferral.PRIORITY_CHOICES:
            count = qs.filter(priority=p[0]).count()
            if count > 0:
                stats["by_priority"][p[0]] = count

        return Response(stats)
