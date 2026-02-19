"""
Views for the check-in app.

Provides API endpoints for:
- Patient lookup with clinical snapshot
- Patient check-in
- Today's check-ins list

Sprint: Returning Patient Workflow - Sprint 1
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip
from hmis.apps.patients.models import Patient

from .models import CheckIn
from .serializers import (
    CheckInRequestSerializer,
    CheckInResponseSerializer,
    PatientLookupSerializer,
    TodayCheckinSerializer,
)
from .services import determine_visit_context, get_clinical_snapshot, process_checkin


class CheckinPagination(PageNumberPagination):
    """Pagination for check-in lists."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class PatientLookupView(views.APIView):
    """
    API endpoint for patient lookup with clinical snapshot.

    GET /api/checkin/lookup/?q={query}

    Searches by:
    - MRN (exact or prefix match)
    - Phone number
    - National ID / identification number
    - Name (partial match)

    Returns patient details with clinical snapshot and
    suggested visit context.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "q",
                OpenApiTypes.STR,
                description="Search query (MRN, ID, phone, or name)",
                required=True,
            ),
        ],
        responses={200: PatientLookupSerializer},
    )
    def get(self, request):
        """Look up a patient by MRN, ID, phone, or name."""
        query = request.query_params.get("q", "").strip()

        if not query:
            return Response(
                {"detail": "Query parameter 'q' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build search query
        patient = None

        # Try primary key (numeric ID) first
        if query.isdigit():
            patient = Patient.objects.filter(pk=int(query)).first()

        # Try exact MRN match first
        if not patient:
            patient = Patient.objects.filter(mrn__iexact=query).first()

        if not patient:
            # Try MRN prefix match
            patient = Patient.objects.filter(mrn__istartswith=query).first()

        if not patient:
            # Try phone number (strip leading zeros for flexibility)
            normalized_phone = query.lstrip("0").replace("+254", "")
            patient = Patient.objects.filter(
                Q(phone_number__icontains=normalized_phone) | Q(phone_number=query)
            ).first()

        if not patient:
            # Try identification number
            patient = Patient.objects.filter(identification_number__iexact=query).first()

        if not patient:
            # Try name search (first + last)
            name_parts = query.split()
            if len(name_parts) >= 2:
                patient = Patient.objects.filter(
                    Q(first_name__icontains=name_parts[0]) & Q(last_name__icontains=name_parts[-1])
                ).first()
            else:
                patient = Patient.objects.filter(
                    Q(first_name__icontains=query) | Q(last_name__icontains=query)
                ).first()

        if not patient:
            return Response(
                {"detail": "Patient not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Generate clinical snapshot
        snapshot = get_clinical_snapshot(patient)
        context = determine_visit_context(patient)

        # Build response data
        serializer = PatientLookupSerializer(patient)
        response_data = serializer.data

        # Add clinical snapshot
        response_data["clinical_snapshot"] = {
            "allergies": snapshot.allergies,
            "active_conditions": snapshot.active_conditions,
            "current_medications": snapshot.current_medications,
            "last_visit_date": snapshot.last_visit_date,
            "last_visit_clinic": snapshot.last_visit_clinic,
            "pending_results": snapshot.pending_results,
            "alerts": snapshot.alerts,
        }

        # Add visit context
        response_data["suggested_visit_type"] = context.visit_type
        response_data["suggested_visit_reason"] = context.visit_reason

        # Add linkable encounter for follow-up visits
        from hmis.apps.encounters.models import Encounter

        linkable = (
            Encounter.objects.filter(
                patient=patient,
            )
            .exclude(
                status__in=["CANCELLED"],
            )
            .order_by("-encounter_date", "-created_at")
            .first()
        )

        response_data["linkable_encounter_id"] = linkable.id if linkable else None

        # Log the lookup
        AuditLog.log(
            action="patient_lookup",
            user=request.user,
            resource_type="Patient",
            resource_id=patient.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "query": query,
                "found": True,
            },
        )

        return Response(response_data)


class PatientCheckinView(views.APIView):
    """
    API endpoint for checking in a patient.

    POST /api/checkin/patients/{patient_id}/checkin/

    Creates a check-in record and routes patient to:
    - Triage queue
    - Direct to clinic (skip triage)

    Also creates encounter and queue entries.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=CheckInRequestSerializer,
        responses={200: CheckInResponseSerializer},
    )
    def post(self, request, patient_id):
        """Check in a patient."""
        # Get patient
        patient = get_object_or_404(Patient, id=patient_id)

        # Validate request
        serializer = CheckInRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # Process check-in
        try:
            checkin, warning = process_checkin(
                patient=patient,
                destination=data["destination"],
                user=request.user,
                visit_type=data.get("visit_type"),
                visit_reason=data.get("visit_reason", "NEW_COMPLAINT"),
                skip_triage=data.get("skip_triage", False),
                chief_complaint=data.get("chief_complaint", ""),
                notes=data.get("notes", ""),
                linked_encounter_id=data.get("linked_encounter_id"),
                identity_method=data.get("identity_method", "MRN"),
            )
        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Log the check-in
        AuditLog.log(
            action="patient_checkin",
            user=request.user,
            resource_type="CheckIn",
            resource_id=checkin.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=patient.id,
            details={
                "patient_mrn": patient.mrn,
                "destination": str(data["destination"]),
                "visit_type": checkin.visit_type,
                "visit_reason": checkin.visit_reason,
                "skip_triage": checkin.skip_triage,
                "encounter_id": checkin.encounter.id if checkin.encounter else None,
            },
        )

        # Build response
        response_serializer = CheckInResponseSerializer(checkin)
        response_data = response_serializer.data

        if warning:
            response_data["warning"] = warning

        return Response(response_data, status=status.HTTP_201_CREATED)


class TodayCheckinsViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for today's check-ins.

    GET /api/checkin/today/

    Lists all check-ins for today, ordered by most recent first.
    Supports filtering by destination and status.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TodayCheckinSerializer
    pagination_class = CheckinPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "destination_type", "visit_type"]
    ordering_fields = ["checked_in_at"]
    ordering = ["-checked_in_at"]

    def get_queryset(self):
        """Get today's check-ins with optional filtering."""
        queryset = CheckIn.get_today_checkins()

        # Filter by destination clinic
        destination_clinic = self.request.query_params.get("destination_clinic")
        if destination_clinic:
            try:
                clinic_id = int(destination_clinic)
                queryset = queryset.filter(destination_clinic_id=clinic_id)
            except ValueError:
                pass

        return queryset

    def list(self, request, *args, **kwargs):
        """List today's check-ins."""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)

        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data})
