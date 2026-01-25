"""
Views for triage app.

Sprint 1.5-1.6 Track E: Triage Module MVP - Phase 5
"""

from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

from .models import TriageAssessment, TriageQueue, TriageVitalThreshold, WaitingQueue
from .serializers import (
    TriageAssessmentCreateSerializer,
    TriageAssessmentSerializer,
    TriageCategoryCalculationSerializer,
    TriageQueueSerializer,
    TriageVitalThresholdSerializer,
    WaitingQueueCreateSerializer,
    WaitingQueueSerializer,
)


class HasPerformTriagePermission(BasePermission):
    """Permission class for perform_triage permission."""

    def has_permission(self, request, view):
        if request.method in ["POST", "PUT", "PATCH"]:
            return request.user.has_perm("triage.perform_triage")
        return True


class HasViewQueuePermission(BasePermission):
    """Permission class for view_triage_queue permission."""

    def has_permission(self, request, view):
        return request.user.has_perm("triage.view_triage_queue")


class TriageAssessmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for TriageAssessment model.

    Provides CRUD operations with:
    - Auto-calculation of triage category
    - Alert generation
    - Queue integration
    - Audit logging
    """

    queryset = TriageAssessment.objects.all().select_related(
        "encounter__patient", "triaged_by", "assigned_clinician"
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["triage_category", "assigned_area", "mental_status"]
    search_fields = [
        "chief_complaint",
        "encounter__patient__mrn",
        "encounter__patient__first_name",
        "encounter__patient__last_name",
    ]
    ordering_fields = ["arrival_time", "triage_start_time", "triage_category"]
    ordering = ["-arrival_time"]

    def get_serializer_class(self):
        """Use different serializers for create vs read."""
        if self.action == "create":
            return TriageAssessmentCreateSerializer
        return TriageAssessmentSerializer

    def get_permissions(self):
        """Add perform_triage permission for create/update/delete."""
        permissions = super().get_permissions()

        if self.action in ["create", "update", "partial_update"]:
            permissions.append(HasPerformTriagePermission())
        elif self.action == "destroy":
            permissions.append(IsAdminUser())

        return permissions

    def create(self, request, *args, **kwargs):
        """Create triage assessment with audit logging.

        Also updates the WaitingQueue entry to mark triage as complete.
        """
        # Use create serializer for validation and creation
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        # Update the WaitingQueue entry for this encounter to mark as triaged
        encounter_id = instance.encounter_id
        WaitingQueue.objects.filter(
            encounter_id=encounter_id, status__in=["WAITING_TRIAGE", "IN_TRIAGE"]
        ).update(status="TRIAGED")

        # Use read serializer for response
        read_serializer = TriageAssessmentSerializer(instance, context={"request": request})
        headers = self.get_success_headers(read_serializer.data)

        # Log the creation
        if "id" in read_serializer.data:
            AuditLog.log(
                action="triage_create",
                user=request.user,
                resource_type="TriageAssessment",
                resource_id=read_serializer.data["id"],
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                details={
                    "category": read_serializer.data.get("triage_category"),
                    "auto_calculated": read_serializer.data.get("auto_calculated_category"),
                },
            )

        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """Update triage assessment with audit logging for overrides."""
        instance = self.get_object()
        original_category = instance.triage_category

        response = super().update(request, *args, **kwargs)

        if response.status_code == status.HTTP_200_OK:
            new_category = response.data.get("triage_category")

            # Log if category was overridden
            if original_category != new_category:
                AuditLog.log(
                    action="triage_category_override",
                    user=request.user,
                    resource_type="TriageAssessment",
                    resource_id=instance.id,
                    ip_address=get_client_ip(request),
                    user_agent=request.META.get("HTTP_USER_AGENT", ""),
                    details={
                        "original_category": original_category,
                        "new_category": new_category,
                        "override_reason": response.data.get("category_override_reason"),
                    },
                )

        return response

    @action(detail=False, methods=["post"], url_path="calculate-category")
    def calculate_category(self, request):
        """
        Calculate triage category without creating assessment.

        Used for decision support and "what-if" scenarios.
        """
        serializer = TriageCategoryCalculationSerializer(data=request.data)

        if serializer.is_valid():
            result = serializer.calculate_category()
            return Response(result, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete_triage(self, request, pk=None):
        """
        Complete a triage assessment.

        Sets triage_end_time to now and marks the triage as complete.
        This is important for reporting on triage duration metrics.
        """
        from django.utils import timezone

        instance = self.get_object()

        # Check if already completed
        if instance.triage_end_time:
            return Response(
                {"detail": "Triage assessment already completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Set end time
        instance.triage_end_time = timezone.now()
        instance.save(update_fields=["triage_end_time"])

        # Log the completion
        AuditLog.log(
            action="triage_complete",
            user=request.user,
            resource_type="TriageAssessment",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "category": instance.triage_category,
                "duration_seconds": (
                    (instance.triage_end_time - instance.triage_start_time).total_seconds()
                    if instance.triage_start_time
                    else None
                ),
            },
        )

        # Return updated assessment
        serializer = TriageAssessmentSerializer(instance, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="route-to-clinic")
    def route_to_clinic(self, request, pk=None):
        """
        Route patient from triage to a specific clinic.

        Creates a ClinicVisit in the target clinic's queue with appropriate
        priority based on triage category.

        Request body:
            clinic_id (required): ID of the target clinic
            notes (optional): Routing notes

        Returns:
            201: ClinicVisit created successfully
            400: Invalid request (missing clinic_id, clinic not active, etc.)
        """
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.clinics.serializers import ClinicVisitSerializer

        instance = self.get_object()

        # Validate clinic_id is provided
        clinic_id = request.data.get("clinic_id")
        if not clinic_id:
            return Response(
                {"clinic_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get clinic
        try:
            clinic = Clinic.objects.get(id=clinic_id)
        except Clinic.DoesNotExist:
            return Response(
                {"clinic_id": "Clinic not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Route to clinic
        try:
            notes = request.data.get("notes", "")
            visit = instance.route_to_clinic(
                clinic=clinic,
                user=request.user,
                notes=notes,
            )
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Log the routing
        AuditLog.log(
            action="triage_route_to_clinic",
            user=request.user,
            resource_type="TriageAssessment",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "clinic_id": clinic.id,
                "clinic_name": clinic.name,
                "clinic_visit_id": visit.id,
                "queue_number": visit.queue_number,
                "notes": notes,
            },
        )

        # Return created visit
        visit_serializer = ClinicVisitSerializer(visit, context={"request": request})
        return Response(visit_serializer.data, status=status.HTTP_201_CREATED)


class WaitingQueueViewSet(viewsets.ModelViewSet):
    """
    ViewSet for waiting queue (patients awaiting triage).

    This is the entry point for patients who have registered/checked in
    and are waiting to be triaged. Once triaged, they move to the
    priority-based TriageQueue.
    """

    queryset = WaitingQueue.objects.all().select_related("patient", "encounter", "checked_in_by")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "priority_hint"]
    search_fields = [
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
        "reason_for_visit",
    ]
    ordering_fields = ["check_in_time", "status"]
    ordering = ["check_in_time"]

    def get_serializer_class(self):
        if self.action == "create":
            return WaitingQueueCreateSerializer
        return WaitingQueueSerializer

    def get_queryset(self):
        """Return waiting patients by default."""
        queryset = super().get_queryset()

        # By default, show only patients waiting for triage
        show_all = self.request.query_params.get("show_all", "false").lower() == "true"
        if not show_all:
            queryset = queryset.filter(status__in=["WAITING_TRIAGE", "IN_TRIAGE"])

        return queryset

    def create(self, request, *args, **kwargs):
        """Check in a patient (add to waiting queue)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        # Log the check-in
        AuditLog.log(
            action="patient_check_in",
            user=request.user,
            resource_type="WaitingQueue",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "patient_id": instance.patient_id,
                "patient_mrn": instance.patient.mrn,
                "reason": instance.reason_for_visit,
            },
        )

        read_serializer = WaitingQueueSerializer(instance)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="start-triage")
    def start_triage(self, request, pk=None):
        """Mark patient as currently being triaged."""
        entry = self.get_object()
        entry.start_triage()
        serializer = WaitingQueueSerializer(entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_entry(self, request, pk=None):
        """Remove patient from waiting queue."""
        entry = self.get_object()
        reason = request.data.get("reason", "")
        entry.cancel(reason)
        serializer = WaitingQueueSerializer(entry)
        return Response(serializer.data)


class VitalThresholdsViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for vital thresholds.

    Read-only for regular users, admin can update via admin panel.
    """

    queryset = TriageVitalThreshold.objects.filter(is_active=True)
    serializer_class = TriageVitalThresholdSerializer
    permission_classes = [IsAuthenticated]


class TriageQueueViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for triage queue.

    Provides queue display and management actions.
    """

    queryset = TriageQueue.objects.all().select_related(
        "triage_assessment__encounter__patient", "triage_assessment__triaged_by", "called_by"
    )
    serializer_class = TriageQueueSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "triage_assessment__assigned_area"]

    def get_permissions(self):
        """Require view_triage_queue permission."""
        permissions = super().get_permissions()
        permissions.append(HasViewQueuePermission())
        return permissions

    def get_queryset(self):
        """Return active queue entries sorted by priority."""
        # Start with base queryset
        queryset = TriageQueue.objects.exclude(
            status__in=["COMPLETED", "LEFT_WITHOUT_BEING_SEEN"]
        ).select_related(
            "triage_assessment__encounter__patient", "triage_assessment__triaged_by", "called_by"
        )

        # Filter by area if provided
        area = self.request.query_params.get("area")
        if area:
            queryset = queryset.filter(triage_assessment__assigned_area=area)

        return queryset

    def list(self, request, *args, **kwargs):
        """Override list to apply priority sorting."""
        queryset = self.filter_queryset(self.get_queryset())

        # Convert to list and sort by priority
        queue_list = list(queryset)
        queue_list.sort(
            key=lambda x: (x.triage_assessment.category_priority, x.triage_assessment.arrival_time)
        )

        # Apply pagination manually
        page = self.paginate_queryset(queue_list)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queue_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def call(self, request, pk=None):
        """Mark patient as called."""
        queue_entry = self.get_object()
        queue_entry.mark_called(request.user)

        serializer = self.get_serializer(queue_entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="with-clinician")
    def with_clinician(self, request, pk=None):
        """Mark patient as with clinician."""
        queue_entry = self.get_object()
        queue_entry.mark_with_clinician()

        serializer = self.get_serializer(queue_entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Mark queue entry as completed."""
        queue_entry = self.get_object()
        queue_entry.mark_completed()

        return Response({"status": "completed"})

    @action(detail=True, methods=["post"])
    def lwbs(self, request, pk=None):
        """Mark patient as Left Without Being Seen."""
        queue_entry = self.get_object()
        reason = request.data.get("reason", "")
        queue_entry.mark_lwbs(reason)

        return Response({"status": "left_without_being_seen", "reason": reason})


class WaitTimesReportView(APIView):
    """
    Report endpoint for wait time statistics.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get wait time statistics."""
        from django.utils import timezone

        # Get assessments from today
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        assessments = TriageAssessment.objects.filter(arrival_time__gte=today_start)

        # Calculate wait times
        wait_times = []
        for assessment in assessments:
            wait_time = assessment.get_wait_time_minutes()
            if wait_time is not None:
                wait_times.append(wait_time)

        if wait_times:
            avg_wait_time = sum(wait_times) / len(wait_times)
            max_wait_time = max(wait_times)
            min_wait_time = min(wait_times)
        else:
            avg_wait_time = 0
            max_wait_time = 0
            min_wait_time = 0

        # Count by category
        category_stats = {}
        for category in ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"]:
            category_assessments = [a for a in assessments if a.triage_category == category]
            category_wait_times = [
                a.get_wait_time_minutes()
                for a in category_assessments
                if a.get_wait_time_minutes() is not None
            ]

            if category_wait_times:
                category_stats[category] = {
                    "count": len(category_assessments),
                    "avg_wait_time": sum(category_wait_times) / len(category_wait_times),
                }
            else:
                category_stats[category] = {
                    "count": len(category_assessments),
                    "avg_wait_time": 0,
                }

        return Response(
            {
                "total_assessments": assessments.count(),
                "average_wait_time": round(avg_wait_time, 2),
                "max_wait_time": max_wait_time,
                "min_wait_time": min_wait_time,
                "by_category": category_stats,
            }
        )


class VolumeReportView(APIView):
    """
    Report endpoint for volume by category.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get volume counts by category."""
        from django.utils import timezone

        # Get date range from query params
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        assessments = TriageAssessment.objects.filter(arrival_time__gte=today_start)

        # Count by category
        volume_by_category = (
            assessments.values("triage_category").annotate(count=Count("id")).order_by("-count")
        )

        # Count by area
        volume_by_area = (
            assessments.values("assigned_area").annotate(count=Count("id")).order_by("-count")
        )

        return Response(
            {
                "total": assessments.count(),
                "by_category": list(volume_by_category),
                "by_area": list(volume_by_area),
            }
        )
