"""
Views for the inpatient app.
"""

from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip
from hmis.apps.patients.models import Patient

from .models import (
    Admission,
    AdmissionRecommendation,
    Bed,
    Discharge,
    KardexHandoverNote,
    KardexShiftNote,
    NursingKardex,
    ShiftHandover,
    Transfer,
    Ward,
    WardRound,
)
from .serializers import (
    AdmissionRecommendationSerializer,
    AdmissionSerializer,
    BedSerializer,
    DischargeSerializer,
    InpatientWardSerializer,
    KardexHandoverNoteSerializer,
    KardexShiftNoteSerializer,
    NursingKardexSerializer,
    ShiftHandoverSerializer,
    TransferSerializer,
    WardRoundSerializer,
)
from .services.compatibility import ward_compatibility_service

User = get_user_model()


class WardViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Ward model (read-only).

    Provides listing and detail views for wards with:
    - Real-time occupancy statistics
    - Bed availability tracking
    - Filtering by ward type
    - Search by name or code

    Endpoints:
    - GET /api/inpatient/wards/ - List all wards
    - GET /api/inpatient/wards/{id}/ - Ward detail
    - GET /api/inpatient/wards/{id}/beds/ - List beds in ward
    """

    queryset = Ward.objects.filter(is_active=True)
    serializer_class = InpatientWardSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["ward_type", "is_active"]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "code", "ward_type", "capacity"]
    ordering = ["name"]

    @action(detail=True, methods=["get"])
    def beds(self, request, pk=None):
        """
        List all beds for a specific ward.

        Query parameters:
        - status: Filter by bed status (AVAILABLE, OCCUPIED, MAINTENANCE, RESERVED)
        """
        ward = self.get_object()
        beds = Bed.objects.filter(ward=ward)

        # Filter by status if provided
        status_filter = request.query_params.get("status")
        if status_filter:
            beds = beds.filter(status=status_filter)

        # Paginate results
        page = self.paginate_queryset(beds)
        if page is not None:
            serializer = BedSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = BedSerializer(beds, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="check_compatibility")
    def check_compatibility(self, request, pk=None):
        """Check patient compatibility with this ward."""
        ward = self.get_object()
        patient_id = request.data.get("patient_id")
        requires_isolation = bool(request.data.get("requires_isolation", False))

        if not patient_id:
            return Response({"error": "patient_id required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            patient = Patient.objects.get(id=patient_id)
        except Patient.DoesNotExist:
            return Response({"error": "Patient not found"}, status=status.HTTP_404_NOT_FOUND)

        result = ward_compatibility_service.check_compatibility(
            patient=patient,
            ward=ward,
            requires_isolation=requires_isolation,
        )

        return Response(
            {
                "compatible": result.compatible,
                "has_critical_violations": result.has_critical_violations,
                "violations": [v.to_dict() for v in result.violations],
            }
        )

    @action(detail=False, methods=["post"], url_path="bulk_check_compatibility")
    def bulk_check_compatibility(self, request):
        """Bulk check compatibility for multiple patients across all wards."""
        patient_ids = request.data.get("patient_ids", [])
        requires_isolation_list = request.data.get("requires_isolation", [])

        if not patient_ids:
            return Response(
                {"error": "patient_ids required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(patient_ids, list):
            return Response(
                {"error": "patient_ids must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(requires_isolation_list, list):
            requires_isolation_list = []

        while len(requires_isolation_list) < len(patient_ids):
            requires_isolation_list.append(False)

        patients_by_id = Patient.objects.in_bulk(patient_ids)
        wards = Ward.objects.filter(is_active=True).prefetch_related("beds")

        results = []
        for patient_id, requires_isolation in zip(patient_ids, requires_isolation_list, strict=False):
            patient = patients_by_id.get(patient_id)
            if patient is None:
                results.append(
                    {
                        "patient_id": patient_id,
                        "error": "Patient not found",
                        "compatible_wards": [],
                        "incompatible_wards": [],
                    }
                )
                continue

            compatible_wards = []
            incompatible_wards = []

            for ward in wards:
                result = ward_compatibility_service.check_compatibility(
                    patient=patient,
                    ward=ward,
                    requires_isolation=bool(requires_isolation),
                )

                ward_info = {
                    "ward_id": ward.id,
                    "ward_name": ward.name,
                    "ward_type": ward.ward_type,
                    "available_beds": ward.available_beds,
                }

                if result.compatible:
                    compatible_wards.append(ward_info)
                else:
                    ward_info["violations"] = [v.code for v in result.violations]
                    ward_info["has_critical"] = result.has_critical_violations
                    incompatible_wards.append(ward_info)

            results.append(
                {
                    "patient_id": patient.id,
                    "patient_name": f"{patient.first_name} {patient.last_name}",
                    "patient_mrn": patient.mrn,
                    "compatible_wards": sorted(
                        compatible_wards, key=lambda x: -int(x["available_beds"])
                    ),
                    "incompatible_wards": incompatible_wards,
                }
            )

        return Response({"results": results})

    @action(detail=True, methods=["get"])
    def updates(self, request, pk=None):
        """
        Polling fallback endpoint for ward updates when WebSocket is unavailable.

        Query parameters:
        - since: ISO timestamp to filter events after (optional)

        Returns:
        - events: List of recent ward events (constraints updates, violations, etc.)
        - current_state: Current ward constraint settings
        """
        from django.utils.dateparse import parse_datetime

        ward = self.get_object()

        since_param = request.query_params.get("since")
        since_dt = parse_datetime(since_param) if since_param else None

        # Get recent admissions with violations for this ward
        violations_qs = Admission.objects.filter(
            ward=ward,
            constraint_violations__isnull=False,
        ).exclude(constraint_violations=[]).order_by("-created_at")

        if since_dt:
            violations_qs = violations_qs.filter(created_at__gt=since_dt)

        # Apply limit after filtering
        violations_qs = violations_qs[:10]

        events = []
        for admission in violations_qs:
            events.append({
                "type": "compatibility_violation",
                "admission_id": admission.id,
                "patient_name": f"{admission.patient.first_name} {admission.patient.last_name}",
                "violations": admission.constraint_violations,
                "timestamp": admission.created_at.isoformat(),
            })

        return Response({
            "events": events,
            "current_state": {
                "ward_id": ward.id,
                "ward_name": ward.name,
                "gender_restriction": ward.gender_restriction,
                "min_age_years": ward.min_age_years,
                "max_age_years": ward.max_age_years,
                "isolation_capable": ward.isolation_capable,
                "oxygen_equipped": ward.oxygen_equipped,
                "ventilator_capable": ward.ventilator_capable,
                "available_beds": ward.available_beds,
            },
        })


class SupervisorAlertViewSet(viewsets.ViewSet):
    """
    ViewSet for supervisor critical violation alerts.

    Polling fallback for WebSocket supervisor alerts.
    Requires receive_critical_alerts permission.

    Endpoints:
    - GET /api/inpatient/supervisor/alerts/ - List recent critical violations
    """

    permission_classes = [IsAuthenticated]

    def list(self, request):
        """
        List recent critical violation alerts for supervisors.

        Requires receive_critical_alerts permission.

        Query parameters:
        - since: ISO timestamp to filter alerts after (optional)
        - limit: Maximum number of alerts to return (default: 20)
        """
        from django.utils.dateparse import parse_datetime

        # Check permission
        if not request.user.has_perm("inpatient.receive_critical_alerts"):
            return Response(
                {"detail": "Permission denied. Requires receive_critical_alerts permission."},
                status=status.HTTP_403_FORBIDDEN,
            )

        since_param = request.query_params.get("since")
        since_dt = parse_datetime(since_param) if since_param else None
        limit = int(request.query_params.get("limit", 20))

        # Get admissions with CRITICAL violations
        admissions_qs = Admission.objects.filter(
            constraint_violations__isnull=False,
            constraint_override=True,
        ).exclude(constraint_violations=[]).select_related(
            "patient", "ward", "bed", "admitting_officer"
        ).order_by("-created_at")

        if since_dt:
            admissions_qs = admissions_qs.filter(created_at__gt=since_dt)

        # Filter only those with CRITICAL violations
        alerts = []
        for admission in admissions_qs[:limit * 2]:  # Get extra to filter
            critical_violations = [
                v for v in admission.constraint_violations
                if v.get("severity") == "CRITICAL"
            ]
            if critical_violations:
                alerts.append({
                    "admission_id": admission.id,
                    "admission_number": admission.admission_number,
                    "patient_name": f"{admission.patient.first_name} {admission.patient.last_name}",
                    "patient_mrn": admission.patient.mrn,
                    "ward_name": admission.ward.name,
                    "bed_number": admission.bed.bed_number,
                    "violations": critical_violations,
                    "override_reason": admission.constraint_override_reason,
                    "admitted_by": (
                        admission.admitting_officer.get_full_name()
                        if admission.admitting_officer else "Unknown"
                    ),
                    "timestamp": admission.created_at.isoformat(),
                })
                if len(alerts) >= limit:
                    break

        return Response({"alerts": alerts})


class BedViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Bed model.

    Provides CRUD operations for beds with:
    - Bed status management
    - Audit logging for status changes
    - Filtering by ward and status

    Endpoints:
    - GET /api/inpatient/beds/ - List all beds
    - GET /api/inpatient/beds/{id}/ - Bed detail
    - PATCH /api/inpatient/beds/{id}/ - Update bed status
    """

    queryset = Bed.objects.all()
    serializer_class = BedSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["ward", "status"]
    search_fields = ["bed_number"]
    ordering_fields = ["bed_number", "status", "status_changed_at"]
    ordering = ["bed_number"]

    def perform_update(self, serializer):
        """Update bed and log status changes."""
        old_status = self.get_object().status
        instance = serializer.save(status_changed_by=self.request.user)

        # Log bed status update
        if instance.status != old_status:
            AuditLog.log(
                action="bed_status_update",
                user=self.request.user,
                resource_type="Bed",
                resource_id=instance.id,
                details={
                    "old_status": old_status,
                    "new_status": instance.status,
                    "notes": instance.notes,
                },
                ip_address=get_client_ip(self.request),
            )


class AdmissionRecommendationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AdmissionRecommendation model.

    Provides CRUD operations for admission recommendations with:
    - Workflow methods (accept, decline)
    - Filtering by status and urgency
    - Expiry tracking

    Endpoints:
    - GET /api/inpatient/admission-recommendations/ - List all recommendations
    - GET /api/inpatient/admission-recommendations/{id}/ - Recommendation detail
    - POST /api/inpatient/admission-recommendations/ - Create recommendation
    - POST /api/inpatient/admission-recommendations/{id}/accept/ - Accept recommendation
    - POST /api/inpatient/admission-recommendations/{id}/decline/ - Decline recommendation
    """

    queryset = AdmissionRecommendation.objects.all()
    serializer_class = AdmissionRecommendationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "urgency", "recommended_by", "preferred_ward_type"]
    search_fields = ["reason", "provisional_diagnosis_text"]
    ordering_fields = ["created_at", "expires_at", "urgency"]
    ordering = ["-created_at"]

    def perform_create(self, serializer):
        """Create recommendation and log action."""
        instance = serializer.save()

        # Log recommendation creation
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
        """
        Accept a pending admission recommendation.

        Request body:
        - user: User ID who is accepting
        """
        recommendation = self.get_object()
        user_id = request.data.get("user")

        if not user_id:
            return Response({"error": "User ID required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=user_id)
            recommendation.accept(user)

            # Log acceptance
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
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        """
        Decline a pending admission recommendation.

        Request body:
        - user: User ID who is declining
        - reason: Reason for declining (required)
        """
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

            # Log decline
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
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Admission model.

    Provides CRUD operations for admissions with:
    - Auto-generated admission numbers
    - Bed status management
    - Length of stay tracking
    - Filtering by ward, status, patient

    Endpoints:
    - GET /api/inpatient/admissions/ - List all admissions
    - GET /api/inpatient/admissions/{id}/ - Admission detail
    - POST /api/inpatient/admissions/ - Create admission
    - PATCH /api/inpatient/admissions/{id}/ - Update admission
    """

    queryset = Admission.objects.all()
    serializer_class = AdmissionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "ward", "admission_status", "payer_type"]
    search_fields = ["admission_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["admission_date", "created_at", "admission_number"]
    ordering = ["-admission_date"]

    def perform_create(self, serializer):
        """Create admission, enforce ward compatibility override rules, and log action."""
        patient = serializer.validated_data.get("patient")
        bed = serializer.validated_data.get("bed")
        ward = serializer.validated_data.get("ward")

        if bed is None or patient is None or ward is None:
            raise ValidationError("patient, ward, and bed are required")

        if bed.ward_id != ward.id:
            raise ValidationError({"bed": "Selected bed does not belong to the selected ward"})

        # Check compatibility (admission flow currently assumes requires_isolation is provided by the client)
        requires_isolation = bool(self.request.data.get("requires_isolation", False))
        result = ward_compatibility_service.check_compatibility(
            patient=patient,
            ward=bed.ward,
            requires_isolation=requires_isolation,
        )

        override_requested = bool(self.request.data.get("constraint_override", False))
        override_reason = str(self.request.data.get("constraint_override_reason", "") or "")

        if not result.compatible and not override_requested:
            raise ValidationError(
                {
                    "compatibility": (
                        "Patient is not compatible with this ward. "
                        "Set constraint_override=true to proceed."
                    ),
                    "violations": [v.message for v in result.violations],
                }
            )

        override_used = (not result.compatible) and override_requested

        instance = serializer.save(
            constraint_override=override_used,
            constraint_override_reason=(override_reason if override_used else ""),
            constraint_violations=[
                {"code": v.code, "severity": v.severity, "message": v.message}
                for v in result.violations
            ],
        )

        # Log admission creation
        AuditLog.log(
            action="admission_create",
            user=self.request.user,
            resource_type="Admission",
            resource_id=instance.id,
            details={
                "admission_number": instance.admission_number,
                "patient": instance.patient.id,
                "ward": instance.ward.name,
                "bed": instance.bed.bed_number,
            },
            ip_address=get_client_ip(self.request),
        )

        if override_used:
            AuditLog.log(
                action="admission_constraint_override",
                user=self.request.user,
                resource_type="Admission",
                resource_id=instance.id,
                details={
                    "patient": instance.patient.id,
                    "patient_mrn": instance.patient.mrn,
                    "ward": instance.ward.name,
                    "bed": instance.bed.bed_number,
                    "violations": instance.constraint_violations,
                    "override_reason": instance.constraint_override_reason,
                },
                ip_address=get_client_ip(self.request),
            )


class DischargeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Discharge model.

    Provides CRUD operations for discharges with:
    - Automatic admission/bed status updates
    - Clearance tracking
    - Filtering by discharge type

    Endpoints:
    - GET /api/inpatient/discharges/ - List all discharges
    - GET /api/inpatient/discharges/{id}/ - Discharge detail
    - POST /api/inpatient/discharges/ - Create discharge
    - PATCH /api/inpatient/discharges/{id}/ - Update discharge
    """

    queryset = Discharge.objects.all()
    serializer_class = DischargeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["discharge_type", "pharmacy_cleared", "billing_cleared", "discharged_by"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
    ]
    ordering_fields = ["discharge_date", "created_at"]
    ordering = ["-discharge_date"]

    def perform_create(self, serializer):
        """Create discharge and log action."""
        instance = serializer.save()

        # Log discharge creation
        AuditLog.log(
            action="discharge_create",
            user=self.request.user,
            resource_type="Discharge",
            resource_id=instance.id,
            details={
                "admission_number": instance.admission.admission_number,
                "patient": instance.admission.patient.id,
                "discharge_type": instance.discharge_type,
                "length_of_stay": instance.length_of_stay,
            },
            ip_address=get_client_ip(self.request),
        )


class TransferViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Transfer model.

    Provides CRUD operations for patient transfers with:
    - Automatic bed status updates
    - Ward/bed validation
    - Clinical handover tracking

    Endpoints:
    - GET /api/inpatient/transfers/ - List all transfers
    - GET /api/inpatient/transfers/{id}/ - Transfer detail
    - POST /api/inpatient/transfers/ - Create transfer
    """

    queryset = Transfer.objects.all()
    serializer_class = TransferSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["source_ward", "destination_ward", "reason", "transferred_by"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
    ]
    ordering_fields = ["transfer_date", "created_at"]
    ordering = ["-transfer_date"]

    def perform_create(self, serializer):
        """Create transfer and log action."""
        instance = serializer.save()

        # Log transfer creation
        AuditLog.log(
            action="transfer_create",
            user=self.request.user,
            resource_type="Transfer",
            resource_id=instance.id,
            details={
                "admission_number": instance.admission.admission_number,
                "patient": instance.admission.patient.id,
                "source_ward": instance.source_ward.name,
                "destination_ward": instance.destination_ward.name,
                "reason": instance.reason,
            },
            ip_address=get_client_ip(self.request),
        )


class WardRoundViewSet(viewsets.ModelViewSet):
    """
    ViewSet for WardRound model.

    Provides CRUD operations for ward rounds with:
    - SOAP notes documentation
    - Patient condition tracking
    - Consultant review flagging

    Endpoints:
    - GET /api/inpatient/ward-rounds/ - List all ward rounds
    - GET /api/inpatient/ward-rounds/{id}/ - Ward round detail
    - POST /api/inpatient/ward-rounds/ - Create ward round
    - PATCH /api/inpatient/ward-rounds/{id}/ - Update ward round
    """

    queryset = WardRound.objects.all()
    serializer_class = WardRoundSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "admission",
        "condition_status",
        "requires_consultant_review",
        "conducted_by",
    ]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "subjective",
        "assessment",
    ]
    ordering_fields = ["round_date", "round_time", "created_at"]
    ordering = ["-round_date", "-round_time"]

    def perform_create(self, serializer):
        """Create ward round and log action."""
        instance = serializer.save()

        # Log ward round creation
        AuditLog.log(
            action="ward_round_create",
            user=self.request.user,
            resource_type="WardRound",
            resource_id=instance.id,
            details={
                "admission_number": instance.admission.admission_number,
                "patient": instance.admission.patient.id,
                "condition_status": instance.condition_status,
                "requires_consultant_review": instance.requires_consultant_review,
            },
            ip_address=get_client_ip(self.request),
        )


class NursingKardexViewSet(viewsets.ModelViewSet):
    """
    ViewSet for NursingKardex model.

    Provides CRUD operations for nursing kardex with:
    - Nursing care plans
    - Risk assessments
    - Shift notes and handovers

    Endpoints:
    - GET /api/inpatient/kardex/ - List all kardexes
    - GET /api/inpatient/kardex/{id}/ - Kardex detail
    - PATCH /api/inpatient/kardex/{id}/ - Update kardex
    - POST /api/inpatient/kardex/{id}/add-shift-note/ - Add shift note
    - POST /api/inpatient/kardex/{id}/add-handover-note/ - Add handover note
    """

    queryset = NursingKardex.objects.all()
    serializer_class = NursingKardexSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["admission", "fall_risk", "pressure_sore_risk"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "nursing_problems",
    ]
    ordering_fields = ["created_at", "updated_at"]
    ordering = ["-created_at"]

    @action(detail=True, methods=["post"], url_path="add-shift-note")
    def add_shift_note(self, request, pk=None):
        """
        Add a shift note to the kardex.

        Request body:
        - shift: DAY or NIGHT
        - content: Note content
        """
        kardex = self.get_object()
        shift = request.data.get("shift")
        content = request.data.get("content")

        if not shift or not content:
            return Response(
                {"error": "Shift and content are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        note = KardexShiftNote.objects.create(
            kardex=kardex, shift=shift, nurse=request.user, content=content
        )

        # Log shift note creation
        AuditLog.log(
            action="kardex_shift_note_create",
            user=request.user,
            resource_type="KardexShiftNote",
            resource_id=note.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "shift": shift,
            },
            ip_address=get_client_ip(request),
        )

        serializer = KardexShiftNoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="add-handover-note")
    def add_handover_note(self, request, pk=None):
        """
        Add a handover note to the kardex.

        Request body:
        - incoming_nurse: User ID of incoming nurse
        - shift_ending: DAY or NIGHT
        - pending_tasks: Tasks for next shift
        - escalations: Issues escalated (optional)
        """
        kardex = self.get_object()
        incoming_nurse_id = request.data.get("incoming_nurse")
        shift_ending = request.data.get("shift_ending")
        pending_tasks = request.data.get("pending_tasks")
        escalations = request.data.get("escalations", "")

        if not incoming_nurse_id or not shift_ending or not pending_tasks:
            return Response(
                {"error": "incoming_nurse, shift_ending, and pending_tasks are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            incoming_nurse = User.objects.get(id=incoming_nurse_id)
        except User.DoesNotExist:
            return Response({"error": "Incoming nurse not found"}, status=status.HTTP_404_NOT_FOUND)

        note = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=request.user,
            incoming_nurse=incoming_nurse,
            shift_ending=shift_ending,
            pending_tasks=pending_tasks,
            escalations=escalations,
        )

        # Log handover note creation
        AuditLog.log(
            action="kardex_handover_note_create",
            user=request.user,
            resource_type="KardexHandoverNote",
            resource_id=note.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "shift_ending": shift_ending,
                "incoming_nurse": incoming_nurse.username,
            },
            ip_address=get_client_ip(request),
        )

        serializer = KardexHandoverNoteSerializer(note)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ShiftHandoverViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ShiftHandover model.

    Provides CRUD operations for ward-level shift handovers with:
    - Patient counts tracking
    - Handover acknowledgment
    - Auto-populate counts from ward data

    Endpoints:
    - GET /api/inpatient/shift-handovers/ - List all handovers
    - GET /api/inpatient/shift-handovers/{id}/ - Handover detail
    - POST /api/inpatient/shift-handovers/ - Create handover
    - POST /api/inpatient/shift-handovers/{id}/acknowledge/ - Acknowledge handover
    - POST /api/inpatient/shift-handovers/{id}/auto-populate/ - Auto-populate counts
    """

    queryset = ShiftHandover.objects.all()
    serializer_class = ShiftHandoverSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["ward", "shift_date", "shift_ending", "outgoing_nurse", "incoming_nurse"]
    search_fields = ["ward__name", "general_notes"]
    ordering_fields = ["shift_date", "created_at"]
    ordering = ["-shift_date", "-created_at"]

    def perform_create(self, serializer):
        """Create shift handover and log action."""
        instance = serializer.save()

        # Log shift handover creation
        AuditLog.log(
            action="shift_handover_create",
            user=self.request.user,
            resource_type="ShiftHandover",
            resource_id=instance.id,
            details={
                "ward": instance.ward.name,
                "shift_date": str(instance.shift_date),
                "shift_ending": instance.shift_ending,
                "total_patients": instance.total_patients,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """
        Acknowledge the handover by the incoming nurse.
        """
        handover = self.get_object()

        if handover.is_acknowledged:
            return Response(
                {"error": "Handover already acknowledged"}, status=status.HTTP_400_BAD_REQUEST
            )

        if request.user != handover.incoming_nurse:
            return Response(
                {"error": "Only the incoming nurse can acknowledge the handover"},
                status=status.HTTP_403_FORBIDDEN,
            )

        handover.acknowledge(request.user)

        # Log acknowledgment
        AuditLog.log(
            action="shift_handover_acknowledge",
            user=request.user,
            resource_type="ShiftHandover",
            resource_id=handover.id,
            details={
                "ward": handover.ward.name,
                "shift_date": str(handover.shift_date),
                "shift_ending": handover.shift_ending,
            },
            ip_address=get_client_ip(request),
        )

        serializer = self.get_serializer(handover)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="auto-populate")
    def auto_populate(self, request, pk=None):
        """
        Auto-populate patient counts from ward data.
        """
        handover = self.get_object()
        handover.auto_populate_counts()

        serializer = self.get_serializer(handover)
        return Response(serializer.data)
