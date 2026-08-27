"""
What this file is for: inpatient review-request workflow viewset.
How to use: imported and re-exported by ``inpatient.views`` to preserve existing imports.
Supported inputs/args: DRF ViewSet payloads/query params defined by ReviewRequest serializers/actions.
"""

# ruff: noqa: ARG002

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

from ..models import ReviewRequest
from ..serializers import ReviewRequestCreateSerializer, ReviewRequestSerializer


class ReviewRequestViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for ReviewRequest model."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    queryset = ReviewRequest.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "admission",
        "review_type",
        "urgency",
        "status",
        "requested_by",
        "assigned_to",
    ]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "reason",
        "consultant_specialty",
    ]
    ordering_fields = ["requested_at", "urgency", "status", "created_at"]
    ordering = ["-requested_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return ReviewRequestCreateSerializer
        return ReviewRequestSerializer

    def create(self, request, *_args, **_kwargs):
        """Create review request, then return full read serializer payload."""
        create_serializer = ReviewRequestCreateSerializer(data=request.data)
        create_serializer.is_valid(raise_exception=True)

        review_request = create_serializer.save(requested_by=request.user)

        AuditLog.log(
            action="review_request_create",
            user=request.user,
            resource_type="ReviewRequest",
            resource_id=review_request.id,
            details={
                "admission_number": review_request.admission.admission_number,
                "review_type": review_request.review_type,
                "urgency": review_request.urgency,
                "reason": review_request.reason,
            },
            ip_address=get_client_ip(request),
        )

        output_serializer = ReviewRequestSerializer(review_request)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Acknowledge a review request and mark it in-progress."""
        review_request = self.get_object()

        if review_request.status not in ["PENDING"]:
            return Response(
                {"error": "Only pending requests can be acknowledged"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review_request.acknowledge(request.user)

        AuditLog.log(
            action="review_request_acknowledge",
            user=request.user,
            resource_type="ReviewRequest",
            resource_id=review_request.id,
            details={
                "admission_number": review_request.admission.admission_number,
                "review_type": review_request.review_type,
                "urgency": review_request.urgency,
            },
            ip_address=get_client_ip(request),
        )

        return Response(ReviewRequestSerializer(review_request).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Mark a review request as completed."""
        review_request = self.get_object()

        if review_request.status not in ["PENDING", "IN_PROGRESS"]:
            return Response(
                {"error": "Only pending or in-progress requests can be completed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review_request.complete()

        AuditLog.log(
            action="review_request_complete",
            user=request.user,
            resource_type="ReviewRequest",
            resource_id=review_request.id,
            details={
                "admission_number": review_request.admission.admission_number,
                "review_type": review_request.review_type,
            },
            ip_address=get_client_ip(request),
        )

        return Response(ReviewRequestSerializer(review_request).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a review request with reason."""
        review_request = self.get_object()
        reason = request.data.get("reason", "").strip()

        if not reason:
            return Response(
                {"error": "Cancellation reason is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if review_request.status not in ["PENDING", "IN_PROGRESS"]:
            return Response(
                {"error": "Only pending or in-progress requests can be cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review_request.cancel(reason)

        AuditLog.log(
            action="review_request_cancel",
            user=request.user,
            resource_type="ReviewRequest",
            resource_id=review_request.id,
            details={
                "admission_number": review_request.admission.admission_number,
                "review_type": review_request.review_type,
                "reason": reason,
            },
            ip_address=get_client_ip(request),
        )

        return Response(ReviewRequestSerializer(review_request).data)
