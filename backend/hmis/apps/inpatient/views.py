"""
Views for the inpatient app.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import filters, serializers, status, viewsets
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
    BloodTransfusionObservation,
    BPMonitoringReading,
    Discharge,
    FluidBalanceEntry,
    FluidBalanceSheet,
    InpatientConsumableUsage,
    KardexHandoverNote,
    KardexShiftNote,
    MedicationAdministration,
    NursingCarePlanEntry,
    NursingKardex,
    ReviewRequest,
    ShiftHandover,
    TemperatureReading,
    Transfer,
    TransfusionObservationEntry,
    Ward,
    WardRound,
)
from .serializers import (
    AdmissionRecommendationSerializer,
    AdmissionSerializer,
    BedSerializer,
    BedTurnoverActionSerializer,
    BloodTransfusionCreateSerializer,
    BloodTransfusionSerializer,
    BPMonitoringReadingCreateSerializer,
    BPMonitoringReadingSerializer,
    ConstraintOverrideMetricsSerializer,
    DischargeSerializer,
    FluidBalanceEntryCreateSerializer,
    FluidBalanceEntrySerializer,
    FluidBalanceSheetCreateSerializer,
    FluidBalanceSheetSerializer,
    InpatientConsumableUsageCreateSerializer,
    InpatientConsumableUsageReverseSerializer,
    InpatientConsumableUsageSerializer,
    InpatientWardSerializer,
    KardexHandoverNoteSerializer,
    KardexShiftNoteSerializer,
    NursingCarePlanEntryCreateSerializer,
    NursingCarePlanEntrySerializer,
    NursingKardexSerializer,
    ReviewRequestCreateSerializer,
    ReviewRequestSerializer,
    ShiftHandoverSerializer,
    SupervisorAlertsResponseSerializer,
    TemperatureReadingCreateSerializer,
    TemperatureReadingSerializer,
    TransferSerializer,
    TransfusionObservationEntryCreateSerializer,
    TransfusionObservationEntrySerializer,
    WardRoundSerializer,
    WardUpdatesResponseSerializer,
    MedicationAdministrationSerializer,
    MedicationAdministrationCreateSerializer,
    MedicationAdministrationActionSerializer,
)
from .services.bed_assignment import NoBedAvailableError, bed_assignment_service
from .services.compatibility import ward_compatibility_service

User = get_user_model()


class WardViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Ward model.

    Provides CRUD operations for wards with:
    - Real-time occupancy statistics
    - Bed availability tracking
    - Filtering by ward type
    - Search by name or code

    Endpoints:
    - GET /api/inpatient/wards/ - List all wards
    - GET /api/inpatient/wards/{id}/ - Ward detail
    - PATCH /api/inpatient/wards/{id}/ - Update ward
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
    # Allow GET, PATCH, POST (for custom actions), but prevent DELETE
    http_method_names = ["get", "patch", "post", "head", "options"]

    @action(detail=True, methods=["get"])
    def beds(self, request, pk=None):
        """
        List all beds for a specific ward.

        Query parameters:
        - status: Filter by bed status (AVAILABLE, OCCUPIED, CLEANING, MAINTENANCE, RESERVED)
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
        requires_oxygen = bool(request.data.get("requires_oxygen", False))
        requires_ventilator = bool(request.data.get("requires_ventilator", False))

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
            requires_oxygen=requires_oxygen,
            requires_ventilator=requires_ventilator,
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
        for patient_id, requires_isolation in zip(
            patient_ids, requires_isolation_list, strict=False
        ):
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

    @extend_schema(
        summary="Get ward updates (polling fallback)",
        description=(
            "Polling fallback endpoint for ward updates when WebSocket is unavailable. "
            "Returns recent ward events and current constraint state."
        ),
        parameters=[
            OpenApiParameter(
                name="since",
                type=str,
                location=OpenApiParameter.QUERY,
                description="ISO timestamp to filter events after (optional)",
                required=False,
            ),
        ],
        responses={200: WardUpdatesResponseSerializer},
        tags=["Inpatient - Wards"],
    )
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
        violations_qs = (
            Admission.objects.filter(
                ward=ward,
                constraint_violations__isnull=False,
            )
            .exclude(constraint_violations=[])
            .order_by("-created_at")
        )

        if since_dt:
            violations_qs = violations_qs.filter(created_at__gt=since_dt)

        # Apply limit after filtering
        violations_qs = violations_qs[:10]

        events = []
        for admission in violations_qs:
            events.append(
                {
                    "type": "compatibility_violation",
                    "admission_id": admission.id,
                    "patient_name": f"{admission.patient.first_name} {admission.patient.last_name}",
                    "violations": [
                        v.get("message", v.get("code", "Unknown violation"))
                        for v in admission.constraint_violations
                    ],
                    "timestamp": admission.created_at.isoformat(),
                }
            )

        return Response(
            {
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
            }
        )

    @extend_schema(
        summary="Generate beds for ward",
        description=(
            "Generate missing bed records for a ward based on its capacity. "
            "Useful for wards that have capacity defined but no individual bed records. "
            "Only creates beds if ward.beds.count() < ward.capacity."
        ),
        responses={
            200: {
                "type": "object",
                "properties": {
                    "created": {"type": "integer", "description": "Number of beds created"},
                    "total": {"type": "integer", "description": "Total beds after generation"},
                    "capacity": {"type": "integer", "description": "Ward capacity"},
                },
            }
        },
        tags=["Inpatient - Wards"],
    )
    @action(detail=True, methods=["post"], url_path="generate_beds")
    def generate_beds(self, request, pk=None):
        """
        Generate missing bed records for a ward.

        Creates bed records up to the ward's capacity if fewer beds
        currently exist than the capacity allows.

        Returns:
            created: Number of beds created
            total: Total beds after generation
            capacity: Ward capacity
        """
        ward = self.get_object()
        existing = ward.beds.count()

        if existing >= ward.capacity:
            return Response(
                {
                    "created": 0,
                    "total": existing,
                    "capacity": ward.capacity,
                    "message": "Ward already has enough beds",
                }
            )

        created = ward.generate_missing_beds()

        return Response(
            {
                "created": created,
                "total": ward.beds.count(),
                "capacity": ward.capacity,
                "message": f"Generated {created} bed(s)",
            }
        )

    @extend_schema(
        summary="Recommend bed using rules-based assignment",
        description=(
            "Phase B: Evaluate available beds for a patient using constraint checking "
            "and scoring rules. Returns the recommended bed without marking it as occupied. "
            "Uses WardCompatibilityService for constraint validation and AssignmentRule DSL "
            "for scoring. All decisions are logged to AssignmentDecision for audit."
        ),
        request={
            "type": "object",
            "properties": {
                "patient_id": {"type": "integer", "description": "Patient ID"},
                "requires_isolation": {"type": "boolean", "default": False},
                "requires_oxygen": {"type": "boolean", "default": False},
                "requires_ventilator": {"type": "boolean", "default": False},
                "admission_type": {
                    "type": "string",
                    "enum": ["ELECTIVE", "EMERGENCY", "TRANSFER"],
                    "default": "ELECTIVE",
                },
            },
            "required": ["patient_id"],
        },
        responses={
            200: {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "assigned_bed_id": {"type": "integer", "nullable": True},
                    "assigned_bed_number": {"type": "string", "nullable": True},
                    "assigned_ward_name": {"type": "string", "nullable": True},
                    "rule_applied": {"type": "string", "nullable": True},
                    "decision_id": {"type": "integer"},
                    "decision_outcome": {"type": "string"},
                    "decision_reason": {"type": "string"},
                    "evaluation_time_ms": {"type": "integer"},
                    "candidates_evaluated": {"type": "array"},
                    "scoring_details": {"type": "object"},
                },
            }
        },
        tags=["Inpatient - Wards"],
    )
    @action(detail=True, methods=["post"], url_path="recommend_bed")
    def recommend_bed(self, request, pk=None):
        """
        Recommend a bed for a patient using rules-based assignment.

        Evaluates available beds in this ward against:
        - Ward compatibility constraints (gender, age, isolation)
        - Equipment requirements (oxygen, ventilator)
        - Active BED_ASSIGNMENT rules (scoring, custom constraints)

        Returns the recommended bed WITHOUT marking it as occupied.
        Call the admissions endpoint with the bed ID to complete the admission.

        Request body:
            patient_id: Patient ID to evaluate
            requires_isolation: Whether patient needs isolation (default: false)
            requires_oxygen: Whether patient needs oxygen supply (default: false)
            requires_ventilator: Whether patient needs ventilator (default: false)
            admission_type: Type of admission (ELECTIVE, EMERGENCY, TRANSFER)
        """
        from hmis.apps.core.permissions import get_client_ip
        from hmis.apps.inpatient.serializers import (
            RuleBasedBedAssignmentRequestSerializer,
        )
        from hmis.apps.inpatient.services.bed_rules import bed_assignment_rule_evaluator

        ward = self.get_object()

        # Validate request
        serializer = RuleBasedBedAssignmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient_id = serializer.validated_data["patient_id"]
        try:
            patient = Patient.objects.get(id=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {"error": f"Patient with ID {patient_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Evaluate beds using rule-based assignment
        result = bed_assignment_rule_evaluator.evaluate_beds_for_patient(
            patient=patient,
            ward=ward,
            requires_isolation=serializer.validated_data.get("requires_isolation", False),
            requires_oxygen=serializer.validated_data.get("requires_oxygen", False),
            requires_ventilator=serializer.validated_data.get("requires_ventilator", False),
            admission_type=serializer.validated_data.get("admission_type", "ELECTIVE"),
            user=request.user,
            ip_address=get_client_ip(request),
        )

        # Build response
        response_data = {
            "success": result.success,
            "assigned_bed_id": result.assigned_bed.id if result.assigned_bed else None,
            "assigned_bed_number": (
                result.assigned_bed.bed_number if result.assigned_bed else None
            ),
            "assigned_ward_name": (
                result.assigned_bed.ward.name if result.assigned_bed else None
            ),
            "rule_applied": result.rule_applied.rule_code if result.rule_applied else None,
            "decision_id": result.decision.id if result.decision else None,
            "decision_outcome": result.decision.decision_outcome if result.decision else "ERROR",
            "decision_reason": result.decision.decision_reason if result.decision else "",
            "evaluation_time_ms": result.evaluation_time_ms,
            "candidates_evaluated": [e.to_dict() for e in result.candidates_evaluated],
            "scoring_details": (
                result.decision.scoring_details if result.decision else {}
            ),
            "error": result.error,
        }

        return Response(response_data, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------ #
    # Phase C: Smart Allocation Endpoints
    # ------------------------------------------------------------------ #

    @extend_schema(
        summary="Get predicted discharges for bed planning",
        description=(
            "Phase C: Returns admissions expected to free beds within the "
            "given time window. Uses explicit expected_discharge_date (set by "
            "clinicians) and average LOS estimates as fallback."
        ),
        parameters=[
            OpenApiParameter(
                "hours_ahead",
                type=int,
                location="query",
                description="Hours to look ahead (default: 24)",
                required=False,
            ),
        ],
        tags=["Inpatient - Smart Allocation"],
    )
    @action(detail=True, methods=["get"], url_path="predicted_discharges")
    def predicted_discharges(self, request, pk=None):
        """List predicted discharges for a ward."""
        from hmis.apps.inpatient.services.bed_smart import smart_bed_allocation_service

        ward = self.get_object()
        hours_ahead = int(request.query_params.get("hours_ahead", 24))
        hours_ahead = max(1, min(hours_ahead, 168))  # 1h to 7 days

        predictions = smart_bed_allocation_service.get_predicted_discharges(
            ward, hours_ahead=hours_ahead
        )
        return Response(
            {
                "ward_id": ward.id,
                "ward_name": ward.name,
                "hours_ahead": hours_ahead,
                "count": len(predictions),
                "predictions": [p.to_dict() for p in predictions],
            }
        )

    @extend_schema(
        summary="Get bed utilization analytics",
        description=(
            "Phase C: Comprehensive bed utilization statistics including "
            "emergency buffer, workload score, average LOS, and discharge "
            "predictions."
        ),
        tags=["Inpatient - Smart Allocation"],
    )
    @action(detail=True, methods=["get"], url_path="bed_utilization")
    def bed_utilization(self, request, pk=None):
        """Get bed utilization analytics for a ward."""
        from hmis.apps.inpatient.services.bed_smart import smart_bed_allocation_service

        ward = self.get_object()
        utilization = smart_bed_allocation_service.get_bed_utilization(ward)
        return Response(utilization.to_dict())

    @extend_schema(
        summary="Smart bed recommendation (Phase C)",
        description=(
            "Phase C: Recommend a bed using smart allocation that includes "
            "infection control auto-detection, emergency buffer enforcement, "
            "cohort grouping scoring, and workload balancing — on top of "
            "Phase B rule-based evaluation. Returns recommendation WITHOUT "
            "marking bed as occupied."
        ),
        tags=["Inpatient - Smart Allocation"],
    )
    @action(detail=True, methods=["post"], url_path="smart_recommend_bed")
    def smart_recommend_bed(self, request, pk=None):
        """Smart bed recommendation with Phase C features."""
        from hmis.apps.core.permissions import get_client_ip
        from hmis.apps.inpatient.serializers import SmartRecommendBedRequestSerializer
        from hmis.apps.inpatient.services.bed_smart import smart_bed_allocation_service

        ward = self.get_object()
        serializer = SmartRecommendBedRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient_id = serializer.validated_data["patient_id"]
        try:
            patient = Patient.objects.get(id=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {"error": f"Patient with ID {patient_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = smart_bed_allocation_service.smart_assign_bed(
            patient=patient,
            ward=ward,
            user=request.user,
            requires_isolation=serializer.validated_data.get("requires_isolation", False),
            requires_oxygen=serializer.validated_data.get("requires_oxygen", False),
            requires_ventilator=serializer.validated_data.get("requires_ventilator", False),
            admission_type=serializer.validated_data.get("admission_type", "ELECTIVE"),
            ip_address=get_client_ip(request),
            mark_as_occupied=False,
        )

        response_data = result.to_dict()
        response_data["predicted_discharges"] = [
            p.to_dict() for p in result.predicted_discharges
        ]

        return Response(response_data, status=status.HTTP_200_OK)


    @extend_schema(
        summary="Smart ward recommendation",
        description=(
            "Evaluate all active wards and rank them for a patient based on "
            "compatibility, availability, occupancy, cohort match, and workload. "
            "Returns a ranked list of compatible wards and a list of incompatible wards with reasons."
        ),
        request=inline_serializer(
            name="RecommendWardRequest",
            fields={
                "patient_id": serializers.IntegerField(help_text="Patient ID"),
                "requires_isolation": serializers.BooleanField(required=False, default=False),
                "requires_oxygen": serializers.BooleanField(required=False, default=False),
                "requires_ventilator": serializers.BooleanField(required=False, default=False),
                "admission_type": serializers.ChoiceField(
                    choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
                    required=False, default="ELECTIVE",
                ),
            },
        ),
        tags=["Inpatient - Wards"],
    )
    @action(detail=False, methods=["post"], url_path="recommend_ward")
    def recommend_ward(self, request):
        """Smart ward recommendation — evaluate all wards for a patient."""
        from hmis.apps.inpatient.serializers import RecommendWardRequestSerializer
        from hmis.apps.inpatient.services.bed_smart import smart_bed_allocation_service

        serializer = RecommendWardRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient_id = serializer.validated_data["patient_id"]
        try:
            patient = Patient.objects.get(id=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {"error": f"Patient with ID {patient_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = smart_bed_allocation_service.recommend_ward(
            patient=patient,
            requires_isolation=serializer.validated_data.get("requires_isolation", False),
            requires_oxygen=serializer.validated_data.get("requires_oxygen", False),
            requires_ventilator=serializer.validated_data.get("requires_ventilator", False),
            admission_type=serializer.validated_data.get("admission_type", "ELECTIVE"),
        )

        return Response(result.to_dict(), status=status.HTTP_200_OK)


class SupervisorAlertViewSet(viewsets.ViewSet):
    """
    ViewSet for supervisor critical violation alerts.

    Polling fallback for WebSocket supervisor alerts.
    Requires receive_critical_alerts permission.

    Endpoints:
    - GET /api/inpatient/supervisor/alerts/ - List recent critical violations
    - POST /api/inpatient/supervisor/alerts/acknowledge/ - Acknowledge a critical alert
    - GET /api/inpatient/supervisor/alerts/metrics/ - Get constraint override metrics
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="List supervisor critical violation alerts",
        description=(
            "List recent admissions with CRITICAL constraint violations that were overridden. "
            "Requires receive_critical_alerts permission. Used as polling fallback for WebSocket alerts."
        ),
        parameters=[
            OpenApiParameter(
                name="since",
                type=str,
                location=OpenApiParameter.QUERY,
                description="ISO timestamp to filter alerts after (optional)",
                required=False,
            ),
            OpenApiParameter(
                name="limit",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Maximum number of alerts to return (default: 20)",
                required=False,
            ),
        ],
        responses={
            200: SupervisorAlertsResponseSerializer,
            403: {"description": "Permission denied - requires receive_critical_alerts permission"},
        },
        tags=["Inpatient - Supervisor Alerts"],
    )
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
        admissions_qs = (
            Admission.objects.filter(
                constraint_violations__isnull=False,
                constraint_override=True,
            )
            .exclude(constraint_violations=[])
            .select_related(
                "patient",
                "ward",
                "bed",
                "admitting_officer",
                "alert_acknowledgment__acknowledged_by",
            )
            .order_by("-created_at")
        )

        if since_dt:
            admissions_qs = admissions_qs.filter(created_at__gt=since_dt)

        # Filter only those with CRITICAL violations
        alerts = []
        for admission in admissions_qs[: limit * 2]:  # Get extra to filter
            critical_violations = [
                v for v in admission.constraint_violations if v.get("severity") == "CRITICAL"
            ]
            if critical_violations:
                # Check if acknowledged
                is_acknowledged = hasattr(admission, "alert_acknowledgment")
                alerts.append(
                    {
                        "admission_id": admission.id,
                        "admission_number": admission.admission_number,
                        "patient_id": admission.patient.id,
                        "patient_name": f"{admission.patient.first_name} {admission.patient.last_name}",
                        "patient_mrn": admission.patient.mrn,
                        "ward_id": admission.ward.id,
                        "ward_name": admission.ward.name,
                        "bed_number": admission.bed.bed_number,
                        "critical_violations": critical_violations,
                        "override_reason": admission.constraint_override_reason,
                        "admitted_by": (
                            admission.admitting_officer.get_full_name()
                            if admission.admitting_officer
                            else "Unknown"
                        ),
                        "timestamp": admission.created_at.isoformat(),
                        "is_acknowledged": is_acknowledged,
                        "acknowledged_by": (
                            admission.alert_acknowledgment.acknowledged_by.get_full_name()
                            if is_acknowledged
                            else None
                        ),
                        "acknowledged_at": (
                            admission.alert_acknowledgment.acknowledged_at.isoformat()
                            if is_acknowledged
                            else None
                        ),
                    }
                )
                if len(alerts) >= limit:
                    break

        return Response({"alerts": alerts})

    @extend_schema(
        summary="Acknowledge a supervisor critical violation alert",
        description=(
            "Acknowledge a critical constraint violation that was overridden during admission. "
            "Requires receive_critical_alerts permission."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "admission_id": {
                        "type": "integer",
                        "description": "Admission ID to acknowledge",
                    },
                    "notes": {"type": "string", "description": "Optional notes from supervisor"},
                },
                "required": ["admission_id"],
            }
        },
        responses={
            200: {"description": "Alert acknowledged successfully"},
            400: {"description": "Invalid request or already acknowledged"},
            403: {"description": "Permission denied"},
            404: {"description": "Admission not found or has no critical violations"},
        },
        tags=["Inpatient - Supervisor Alerts"],
    )
    def acknowledge(self, request):
        """
        Acknowledge a supervisor critical violation alert.

        Request body:
        - admission_id: Admission ID to acknowledge
        - notes: Optional notes from supervisor
        """
        from .models import SupervisorAlertAcknowledgment

        # Check permission
        if not request.user.has_perm("inpatient.receive_critical_alerts"):
            return Response(
                {"detail": "Permission denied. Requires receive_critical_alerts permission."},
                status=status.HTTP_403_FORBIDDEN,
            )

        admission_id = request.data.get("admission_id")
        notes = request.data.get("notes", "")

        if not admission_id:
            return Response(
                {"detail": "admission_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            admission = Admission.objects.get(id=admission_id)
        except Admission.DoesNotExist:
            return Response(
                {"detail": "Admission not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if admission has critical violations
        critical_violations = [
            v for v in admission.constraint_violations if v.get("severity") == "CRITICAL"
        ]
        if not critical_violations:
            return Response(
                {"detail": "Admission has no critical violations to acknowledge."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if already acknowledged
        if hasattr(admission, "alert_acknowledgment"):
            return Response(
                {"detail": "Alert already acknowledged."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create acknowledgment
        ack = SupervisorAlertAcknowledgment.objects.create(
            admission=admission,
            acknowledged_by=request.user,
            notes=notes,
        )

        # Log acknowledgment
        AuditLog.log(
            action="supervisor_alert_acknowledge",
            user=request.user,
            resource_type="Admission",
            resource_id=admission.id,
            details={
                "admission_number": admission.admission_number,
                "violations": admission.constraint_violations,
                "notes": notes,
            },
            ip_address=get_client_ip(request),
        )

        return Response(
            {
                "message": "Alert acknowledged successfully.",
                "acknowledgment_id": ack.id,
                "acknowledged_at": ack.acknowledged_at.isoformat(),
            }
        )

    @extend_schema(
        summary="Get constraint override metrics",
        description=(
            "Get statistics on constraint overrides including counts, rates, "
            "breakdown by violation type and ward, and common override reasons. "
            "Requires receive_critical_alerts permission."
        ),
        parameters=[
            OpenApiParameter(
                name="days",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Number of days to include in metrics (default: 30)",
                required=False,
            ),
        ],
        responses={200: ConstraintOverrideMetricsSerializer},
        tags=["Inpatient - Supervisor Alerts"],
    )
    def metrics(self, request):
        """
        Get constraint override metrics.

        Query parameters:
        - days: Number of days to include in metrics (default: 30)
        """
        from collections import Counter
        from datetime import timedelta

        from django.db.models import Count
        from django.utils import timezone

        from .models import SupervisorAlertAcknowledgment

        # Check permission
        if not request.user.has_perm("inpatient.receive_critical_alerts"):
            return Response(
                {"detail": "Permission denied. Requires receive_critical_alerts permission."},
                status=status.HTTP_403_FORBIDDEN,
            )

        days = int(request.query_params.get("days", 30))
        since_date = timezone.now() - timedelta(days=days)

        # Total admissions in period
        total_admissions = Admission.objects.filter(created_at__gte=since_date).count()

        # Admissions with constraint overrides
        override_qs = Admission.objects.filter(
            created_at__gte=since_date,
            constraint_override=True,
        ).select_related("ward")

        override_count = override_qs.count()
        override_rate = (override_count / total_admissions * 100) if total_admissions > 0 else 0.0

        # Critical violations
        critical_admissions = []
        for admission in override_qs.exclude(constraint_violations=[]):
            has_critical = any(
                v.get("severity") == "CRITICAL" for v in admission.constraint_violations
            )
            if has_critical:
                critical_admissions.append(admission.id)

        critical_override_count = len(critical_admissions)

        # Acknowledgments
        acknowledged_count = SupervisorAlertAcknowledgment.objects.filter(
            admission_id__in=critical_admissions
        ).count()
        pending_acknowledgment_count = critical_override_count - acknowledged_count

        # Violation type breakdown
        violation_counter: Counter[str] = Counter()
        for admission in override_qs.exclude(constraint_violations=[]):
            for v in admission.constraint_violations:
                code = v.get("code", "UNKNOWN")
                violation_counter[code] += 1

        violation_breakdown = [
            {"code": code, "count": count} for code, count in violation_counter.most_common()
        ]

        # Ward breakdown
        ward_stats = (
            override_qs.values("ward__id", "ward__name")
            .annotate(override_count=Count("id"))
            .order_by("-override_count")
        )
        ward_breakdown = [
            {
                "ward_id": ws["ward__id"],
                "ward_name": ws["ward__name"],
                "override_count": ws["override_count"],
            }
            for ws in ward_stats
        ]

        # Common override reasons
        reason_counter: Counter[str] = Counter()
        for admission in override_qs.exclude(constraint_override_reason=""):
            reason = admission.constraint_override_reason.strip()
            if reason:
                reason_counter[reason] += 1

        common_reasons = [
            {"reason": reason, "count": count} for reason, count in reason_counter.most_common(10)
        ]

        return Response(
            {
                "total_admissions": total_admissions,
                "override_count": override_count,
                "override_rate": round(override_rate, 2),
                "critical_override_count": critical_override_count,
                "acknowledged_count": acknowledged_count,
                "pending_acknowledgment_count": pending_acknowledgment_count,
                "violation_breakdown": violation_breakdown,
                "ward_breakdown": ward_breakdown,
                "common_reasons": common_reasons,
            }
        )


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

    @action(detail=True, methods=["post"], url_path="mark_cleaning")
    def mark_cleaning(self, request, pk=None):
        """Move a bed into housekeeping turnover workflow."""
        bed = self.get_object()
        serializer = BedTurnoverActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        bed.mark_cleaning(
            request.user,
            reason=serializer.validated_data.get("notes", ""),
        )

        AuditLog.log(
            action="bed_turnover_start",
            user=request.user,
            resource_type="Bed",
            resource_id=bed.id,
            details={
                "new_status": bed.status,
                "notes": bed.notes,
            },
            ip_address=get_client_ip(request),
        )

        return Response(self.get_serializer(bed).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark_available")
    def mark_available(self, request, pk=None):
        """Complete housekeeping turnover and return bed to available."""
        bed = self.get_object()
        bed.mark_available(request.user)

        AuditLog.log(
            action="bed_turnover_complete",
            user=request.user,
            resource_type="Bed",
            resource_id=bed.id,
            details={
                "new_status": bed.status,
            },
            ip_address=get_client_ip(request),
        )

        return Response(self.get_serializer(bed).data, status=status.HTTP_200_OK)


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

    queryset = Admission.objects.select_related(
        "patient",
        "ipd_encounter",
        "ward",
        "bed",
        "admitting_officer",
        "attending_doctor",
        "mch_registration",
    ).all()
    serializer_class = AdmissionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "ward", "admission_status", "payer_type"]
    search_fields = ["admission_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["admission_date", "created_at", "admission_number"]
    ordering = ["-admission_date"]

    def perform_create(self, serializer):
        """Create admission, enforce ward compatibility override rules, and log action.

        Supports automatic bed assignment when `auto_assign_bed=true` is provided
        in the request body without specifying a bed.
        """
        patient = serializer.validated_data.get("patient")
        bed = serializer.validated_data.get("bed")
        ward = serializer.validated_data.get("ward")
        auto_assign_bed = bool(self.request.data.get("auto_assign_bed", False))

        if patient is None or ward is None:
            raise ValidationError("patient and ward are required")

        # Handle automatic bed assignment
        if bed is None:
            if not auto_assign_bed:
                raise ValidationError(
                    {"bed": "Bed is required, or set auto_assign_bed=true for automatic assignment"}
                )

            # Phase B: try rule-based assignment first
            use_rules = bool(self.request.data.get("use_rules", True))
            if use_rules:
                requires_isolation = bool(self.request.data.get("requires_isolation", False))
                requires_oxygen = bool(self.request.data.get("requires_oxygen", False))
                requires_ventilator = bool(self.request.data.get("requires_ventilator", False))
                admission_type = str(self.request.data.get("admission_type", "ELECTIVE"))

                rule_result = bed_assignment_service.rule_based_assign_bed(
                    patient=patient,
                    ward=ward,
                    user=self.request.user,
                    requires_isolation=requires_isolation,
                    requires_oxygen=requires_oxygen,
                    requires_ventilator=requires_ventilator,
                    admission_type=admission_type,
                    ip_address=get_client_ip(self.request),
                    mark_as_occupied=True,
                )

                if rule_result.success and rule_result.assigned_bed:
                    bed = rule_result.assigned_bed
                else:
                    # Fall back to MVP first-available if rules didn't match
                    try:
                        bed = bed_assignment_service.auto_assign_bed(
                            ward=ward,
                            user=self.request.user,
                            ip_address=get_client_ip(self.request),
                        )
                    except NoBedAvailableError as e:
                        raise ValidationError({"bed": str(e)}) from e
            else:
                # Explicit MVP-only mode
                try:
                    bed = bed_assignment_service.auto_assign_bed(
                        ward=ward,
                        user=self.request.user,
                        ip_address=get_client_ip(self.request),
                    )
                except NoBedAvailableError as e:
                    raise ValidationError({"bed": str(e)}) from e
        elif bed.ward_id != ward.id:
            raise ValidationError({"bed": "Selected bed does not belong to the selected ward"})

        # Check compatibility (admission flow currently assumes requirements are provided by the client)
        requires_isolation = bool(self.request.data.get("requires_isolation", False))
        requires_oxygen = bool(self.request.data.get("requires_oxygen", False))
        requires_ventilator = bool(self.request.data.get("requires_ventilator", False))
        result = ward_compatibility_service.check_compatibility(
            patient=patient,
            ward=bed.ward,
            requires_isolation=requires_isolation,
            requires_oxygen=requires_oxygen,
            requires_ventilator=requires_ventilator,
        )

        override_requested = bool(self.request.data.get("constraint_override", False))
        override_reason = str(self.request.data.get("constraint_override_reason", "") or "")

        if not result.compatible and not override_requested:
            violation_details = [
                {
                    "code": v.code,
                    "severity": v.severity,
                    "message": v.message,
                    "override_allowed": v.override_allowed,
                }
                for v in result.violations
            ]
            raise ValidationError(
                {
                    "compatibility": (
                        f"This patient cannot be placed in {bed.ward.name} "
                        f"due to {len(result.violations)} constraint "
                        f"violation{'s' if len(result.violations) != 1 else ''}. "
                        "Review the violations below and either choose a different "
                        "ward or provide a constraint_override with a reason."
                    ),
                    "violations": violation_details,
                    "ward_name": bed.ward.name,
                    "has_critical": result.has_critical_violations,
                    "override_available": any(
                        v.override_allowed for v in result.violations
                    ),
                }
            )

        override_used = (not result.compatible) and override_requested

        # Build save kwargs - include bed if it was auto-assigned
        save_kwargs = {
            "constraint_override": override_used,
            "constraint_override_reason": (override_reason if override_used else ""),
            "constraint_violations": [
                {"code": v.code, "severity": v.severity, "message": v.message}
                for v in result.violations
            ],
        }

        # If bed was auto-assigned, explicitly pass it to save
        if auto_assign_bed:
            save_kwargs["bed"] = bed

        instance = serializer.save(**save_kwargs)

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

    @staticmethod
    def _admission_order_q(admission) -> Q:
        """Build a Q filter that captures all orders for an admission.

        Includes orders linked directly to the admission, orders linked to the
        IPD encounter, and orders from the originating OPD encounter (if any).
        """
        q = Q(admission=admission) | Q(encounter=admission.ipd_encounter)
        if admission.opd_encounter_id:
            q |= Q(encounter=admission.opd_encounter)
        return q

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get lab orders for admission",
        description="Get all lab orders for a specific admission.",
    )
    @action(detail=True, methods=["get"], url_path="lab-orders")
    def lab_orders(self, request, pk=None):
        """Get lab orders for this admission."""
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.laboratory.serializers import LabOrderSerializer

        admission = self.get_object()
        orders = (
            LabOrder.objects.filter(self._admission_order_q(admission))
            .select_related("patient", "encounter", "ordered_by")
            .prefetch_related("items__test", "items__result")
            .distinct()
        )
        serializer = LabOrderSerializer(orders, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get imaging orders for admission",
        description="Get all imaging orders for a specific admission.",
    )
    @action(detail=True, methods=["get"], url_path="imaging-orders")
    def imaging_orders(self, request, pk=None):
        """Get imaging orders for this admission."""
        from hmis.apps.imaging.models import ImagingOrder
        from hmis.apps.imaging.serializers import ImagingOrderSerializer

        admission = self.get_object()
        orders = (
            ImagingOrder.objects.filter(self._admission_order_q(admission))
            .select_related("patient", "encounter", "ordered_by")
            .prefetch_related("items__procedure")
            .distinct()
        )
        serializer = ImagingOrderSerializer(orders, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get prescriptions for admission",
        description="Get all prescriptions for a specific admission.",
    )
    @action(detail=True, methods=["get"], url_path="prescriptions")
    def prescriptions(self, request, pk=None):
        """Get prescriptions for this admission."""
        from hmis.apps.pharmacy.models import Prescription
        from hmis.apps.pharmacy.serializers import PrescriptionSerializer

        admission = self.get_object()
        prescriptions = (
            Prescription.objects.filter(self._admission_order_q(admission))
            .select_related("patient", "encounter", "prescribed_by")
            .prefetch_related("items__drug")
            .distinct()
        )
        serializer = PrescriptionSerializer(prescriptions, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get all orders for admission",
        description="Get a combined view of all medical orders (lab, imaging, prescriptions) for a specific admission.",
    )
    @action(detail=True, methods=["get"], url_path="orders")
    def orders(self, request, pk=None):
        """Get all orders for this admission (combined view)."""
        from hmis.apps.imaging.models import ImagingOrder
        from hmis.apps.imaging.serializers import ImagingOrderSerializer
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.laboratory.serializers import LabOrderSerializer
        from hmis.apps.pharmacy.models import Prescription
        from hmis.apps.pharmacy.serializers import PrescriptionSerializer

        admission = self.get_object()
        q = self._admission_order_q(admission)

        lab_orders = (
            LabOrder.objects.filter(q)
            .select_related("patient", "encounter", "ordered_by")
            .prefetch_related("items__test", "items__result")
            .distinct()
        )

        imaging_orders = (
            ImagingOrder.objects.filter(q)
            .select_related("patient", "encounter", "ordered_by")
            .prefetch_related("items__procedure")
            .distinct()
        )

        prescriptions = (
            Prescription.objects.filter(q)
            .select_related("patient", "encounter", "prescribed_by")
            .prefetch_related("items__drug")
            .distinct()
        )

        return Response(
            {
                "lab_orders": LabOrderSerializer(lab_orders, many=True).data,
                "imaging_orders": ImagingOrderSerializer(imaging_orders, many=True).data,
                "prescriptions": PrescriptionSerializer(prescriptions, many=True).data,
            }
        )

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="List consumable usage for admission",
        description="Get all recorded consumable stock usages for a specific admission.",
    )
    @action(detail=True, methods=["get"], url_path="consumable-usage")
    def consumable_usage(self, request, pk=None):
        """List inpatient consumable usage records for this admission."""
        admission = self.get_object()
        usages = admission.consumable_usages.select_related(
            "drug", "batch", "used_by", "reversed_by"
        )
        serializer = InpatientConsumableUsageSerializer(usages, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Record consumable usage for admission",
        description="Record inpatient consumable usage against a pharmacy stock batch and debit stock.",
    )
    @action(detail=True, methods=["post"], url_path="record-consumable-usage")
    def record_consumable_usage(self, request, pk=None):
        """Create a consumable stock usage entry for this admission."""
        admission = self.get_object()
        serializer = InpatientConsumableUsageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        usage = serializer.save(admission=admission, used_by=request.user)

        AuditLog.log(
            action="inpatient_consumable_usage_create",
            user=request.user,
            resource_type="InpatientConsumableUsage",
            resource_id=usage.id,
            details={
                "admission_number": admission.admission_number,
                "drug": usage.drug.get_display_name(),
                "batch": usage.batch.batch_number,
                "quantity_used": usage.quantity_used,
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = InpatientConsumableUsageSerializer(usage)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Reverse recorded consumable usage",
        description="Reverse a consumable usage entry and restore stock to the original batch.",
    )
    @action(
        detail=True,
        methods=["post"],
        url_path=r"reverse-consumable-usage/(?P<usage_id>\d+)",
    )
    def reverse_consumable_usage(self, request, pk=None, usage_id=None):
        """Reverse a previously recorded consumable stock usage."""
        admission = self.get_object()

        try:
            usage = admission.consumable_usages.get(id=usage_id)
        except InpatientConsumableUsage.DoesNotExist:
            return Response(
                {"error": "Consumable usage not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = InpatientConsumableUsageReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            usage.reverse(user=request.user, reason=serializer.validated_data["reason"])
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="inpatient_consumable_usage_reverse",
            user=request.user,
            resource_type="InpatientConsumableUsage",
            resource_id=usage.id,
            details={
                "admission_number": admission.admission_number,
                "drug": usage.drug.get_display_name(),
                "batch": usage.batch.batch_number,
                "quantity_used": usage.quantity_used,
                "reason": usage.reverse_reason,
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = InpatientConsumableUsageSerializer(usage)
        return Response(result_serializer.data)

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Override bed assignment for an admission",
        description=(
            "Manually override the bed assignment for an active admission. "
            "Requires justification and optionally approval. "
            "The old bed is released and the new bed is marked occupied."
        ),
        request={
            "application/json": {
                "type": "object",
                "required": ["new_bed_id", "override_reason", "justification"],
                "properties": {
                    "new_bed_id": {"type": "integer", "description": "ID of the new bed"},
                    "override_reason": {
                        "type": "string",
                        "enum": [
                            "PATIENT_REQUEST",
                            "STAFF_UNAVAILABLE",
                            "EMERGENCY",
                            "SPECIALIZATION_NEEDED",
                            "LOAD_BALANCING",
                            "ADMINISTRATIVE",
                            "OTHER",
                        ],
                    },
                    "justification": {"type": "string"},
                    "requires_approval": {"type": "boolean", "default": False},
                },
            }
        },
    )
    @action(detail=True, methods=["post"], url_path="override_bed")
    def override_bed(self, request, pk=None):
        """
        Manually override the bed assignment for an active admission.

        Releases the current bed and assigns a new one.
        Creates an AssignmentOverride record for audit trail.
        """
        from hmis.apps.scheduling.models import AssignmentOverride

        admission = self.get_object()

        if admission.admission_status != "ACTIVE":
            return Response(
                {"error": "Can only override bed for active admissions"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_bed_id = request.data.get("new_bed_id")
        override_reason = request.data.get("override_reason")
        justification = request.data.get("justification")
        requires_approval = bool(request.data.get("requires_approval", False))

        if not new_bed_id or not override_reason or not justification:
            return Response(
                {"error": "new_bed_id, override_reason, and justification are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            new_bed = Bed.objects.get(id=new_bed_id)
        except Bed.DoesNotExist:
            return Response(
                {"error": f"Bed with ID {new_bed_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if new_bed.status != "AVAILABLE":
            return Response(
                {"error": f"Bed {new_bed.bed_number} is not available (status: {new_bed.status})"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_bed = admission.bed

        # Create override record
        override = AssignmentOverride.objects.create(
            target_type="Admission",
            target_id=admission.id,
            original_resource=None,  # Beds aren't scheduling Resources
            new_resource=None,
            override_reason=override_reason,
            justification=justification,
            overridden_by=request.user,
            requires_approval=requires_approval,
        )

        # Release old bed and occupy new one
        old_bed.mark_available(request.user)
        new_bed.mark_occupied(request.user)
        admission.bed = new_bed
        admission.save(update_fields=["bed", "updated_at"])

        # Audit log
        AuditLog.log(
            action="admission_bed_override",
            user=request.user,
            resource_type="Admission",
            resource_id=admission.id,
            details={
                "admission_number": admission.admission_number,
                "old_bed": old_bed.bed_number,
                "old_ward": old_bed.ward.code,
                "new_bed": new_bed.bed_number,
                "new_ward": new_bed.ward.code,
                "override_reason": override_reason,
                "justification": justification,
                "override_id": override.id,
            },
            ip_address=get_client_ip(request),
        )

        serializer = self.get_serializer(admission)
        return Response({
            "admission": serializer.data,
            "override_id": override.id,
            "old_bed": old_bed.bed_number,
            "new_bed": new_bed.bed_number,
        })

    # ------------------------------------------------------------------ #
    # Phase C: Smart Allocation — Expected Discharge
    # ------------------------------------------------------------------ #

    @extend_schema(
        summary="Set expected discharge date for bed planning",
        description=(
            "Phase C: Set or update the expected discharge date for an active "
            "admission. Used by clinicians during ward rounds to enable "
            "predictive bed allocation."
        ),
        tags=["Inpatient - Smart Allocation"],
    )
    @action(detail=True, methods=["post"], url_path="set_expected_discharge")
    def set_expected_discharge(self, request, pk=None):
        """Set expected discharge date for an admission."""
        from hmis.apps.inpatient.serializers import SetExpectedDischargeSerializer

        admission = self.get_object()

        if admission.admission_status != "ACTIVE":
            return Response(
                {"error": "Can only set expected discharge for active admissions"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SetExpectedDischargeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        admission.expected_discharge_date = serializer.validated_data[
            "expected_discharge_date"
        ]
        admission.save(update_fields=["expected_discharge_date", "updated_at"])

        AuditLog.log(
            action="admission_expected_discharge_set",
            user=request.user,
            resource_type="Admission",
            resource_id=admission.id,
            details={
                "admission_number": admission.admission_number,
                "expected_discharge_date": (
                    admission.expected_discharge_date.isoformat()
                ),
            },
            ip_address=get_client_ip(request),
        )

        return Response(
            {
                "admission_id": admission.id,
                "admission_number": admission.admission_number,
                "expected_discharge_date": (
                    admission.expected_discharge_date.isoformat()
                ),
            }
        )

    # ------------------------------------------------------------------ #
    # Automated Discharge Clearance
    # ------------------------------------------------------------------ #

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get automated clearance status for discharge",
        description=(
            "Query each department (Billing, Pharmacy, Laboratory, Nursing) "
            "in real-time and return whether the admission is cleared for discharge."
        ),
        responses={
            200: inline_serializer(
                name="ClearanceStatusResponse",
                fields={
                    "billing": serializers.DictField(),
                    "pharmacy": serializers.DictField(),
                    "laboratory": serializers.DictField(),
                    "nursing": serializers.DictField(),
                    "all_cleared": serializers.BooleanField(),
                },
            )
        },
    )
    @action(detail=True, methods=["get"], url_path="clearance-status")
    def clearance_status(self, request, pk=None):
        """Get automated clearance status for this admission."""
        from decimal import Decimal

        from hmis.apps.billing.models import Invoice
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.pharmacy.models import Prescription

        admission = self.get_object()

        # ----- Billing: check invoices linked to admission encounters -----
        billing_q = Q(encounter=admission.ipd_encounter)
        if admission.opd_encounter_id:
            billing_q |= Q(encounter=admission.opd_encounter)
        unpaid_invoices = Invoice.objects.filter(billing_q).exclude(
            status__in=[
                Invoice.Status.PAID,
                Invoice.Status.CANCELLED,
                Invoice.Status.WRITTEN_OFF,
            ]
        )
        outstanding = sum(
            (inv.balance_due for inv in unpaid_invoices), Decimal("0.00")
        )
        billing_cleared = outstanding <= 0
        first_unpaid_id = unpaid_invoices.values_list("id", flat=True).first()
        billing_info = {
            "cleared": billing_cleared,
            "reason": (
                "All bills settled"
                if billing_cleared
                else f"Outstanding balance: KES {outstanding:,.2f}"
            ),
            "outstanding_amount": float(outstanding),
            "invoice_count": unpaid_invoices.count(),
            "first_pending_id": first_unpaid_id,
        }

        # ----- Pharmacy: all prescriptions dispensed or cancelled -----
        q = self._admission_order_q(admission)
        pending_rx = Prescription.objects.filter(q).exclude(
            status__in=["DISPENSED", "CANCELLED"]
        ).distinct()
        pharmacy_cleared = not pending_rx.exists()
        first_rx_id = pending_rx.values_list("id", flat=True).first()
        pharmacy_info = {
            "cleared": pharmacy_cleared,
            "reason": (
                "All prescriptions dispensed"
                if pharmacy_cleared
                else f"{pending_rx.count()} prescription(s) not yet dispensed"
            ),
            "pending_count": pending_rx.count(),
            "first_pending_id": first_rx_id,
        }

        # ----- Laboratory: all lab orders completed or cancelled -----
        pending_labs = LabOrder.objects.filter(q).exclude(
            status__in=["COMPLETED", "CANCELLED"]
        ).distinct()
        pending_test_names = list(
            pending_labs.values_list("items__test__name", flat=True).distinct()[:10]
        )
        lab_cleared = not pending_labs.exists()
        first_lab_order_number = pending_labs.values_list(
            "order_number", flat=True
        ).first()
        lab_info = {
            "cleared": lab_cleared,
            "reason": (
                "All lab results available"
                if lab_cleared
                else f"{pending_labs.count()} lab order(s) with pending results"
            ),
            "pending_count": pending_labs.count(),
            "pending_tests": [t for t in pending_test_names if t],
            "first_pending_order_number": first_lab_order_number,
        }

        # ----- Nursing: all care plan entries resolved/discontinued -----
        nursing_cleared = True
        active_entries_count = 0
        try:
            kardex = admission.kardex
            active_entries = kardex.care_plan_entries.filter(
                status__in=["ACTIVE", "ONGOING"]
            )
            active_entries_count = active_entries.count()
            nursing_cleared = active_entries_count == 0
        except NursingKardex.DoesNotExist:
            pass  # No kardex = nothing to clear

        nursing_info = {
            "cleared": nursing_cleared,
            "reason": (
                "No active nursing care plans"
                if nursing_cleared
                else f"{active_entries_count} active/ongoing nursing care plan(s)"
            ),
            "pending_count": active_entries_count,
        }

        all_cleared = (
            billing_cleared and pharmacy_cleared and lab_cleared and nursing_cleared
        )

        return Response(
            {
                "billing": billing_info,
                "pharmacy": pharmacy_info,
                "laboratory": lab_info,
                "nursing": nursing_info,
                "all_cleared": all_cleared,
            }
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

    queryset = Discharge.objects.select_related(
        "admission",
        "admission__mch_registration",
        "pnc_clinic_visit",
        "pnc_appointment",
    ).prefetch_related("diagnoses")
    serializer_class = DischargeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["admission", "discharge_type", "pharmacy_cleared", "billing_cleared", "discharged_by"]
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

    queryset = Transfer.objects.select_related("admission", "admission__mch_registration")
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


class ReviewRequestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ReviewRequest model.

    Manages pending review requests (urgent, consultant, pre-discharge).

    Endpoints:
    - GET /api/inpatient/review-requests/ - List all review requests
    - GET /api/inpatient/review-requests/{id}/ - Review request detail
    - POST /api/inpatient/review-requests/ - Create review request
    - PATCH /api/inpatient/review-requests/{id}/ - Update review request
    - POST /api/inpatient/review-requests/{id}/acknowledge/ - Acknowledge request
    - POST /api/inpatient/review-requests/{id}/complete/ - Mark as completed
    - POST /api/inpatient/review-requests/{id}/cancel/ - Cancel request
    """

    queryset = ReviewRequest.objects.all()
    permission_classes = [IsAuthenticated]
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
        """Return appropriate serializer based on action."""
        if self.action == "create":
            return ReviewRequestCreateSerializer
        return ReviewRequestSerializer

    def create(self, request, *args, **kwargs):
        """
        Create a review request.

        Uses ReviewRequestCreateSerializer for validation but returns
        full ReviewRequestSerializer data.
        """
        create_serializer = ReviewRequestCreateSerializer(data=request.data)
        create_serializer.is_valid(raise_exception=True)

        # Auto-set requested_by to current user
        review_request = create_serializer.save(requested_by=request.user)

        # Log the action
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

        # Return full serializer data
        output_serializer = ReviewRequestSerializer(review_request)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """
        Acknowledge a review request and mark as in-progress.

        The current user will be assigned to the request if not already assigned.
        """
        review_request = self.get_object()

        if review_request.status not in ["PENDING"]:
            return Response(
                {"error": "Only pending requests can be acknowledged"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review_request.acknowledge(request.user)

        # Log action
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
        """
        Mark a review request as completed.

        Should be called after creating a ward round that fulfills the request.
        """
        review_request = self.get_object()

        if review_request.status not in ["PENDING", "IN_PROGRESS"]:
            return Response(
                {"error": "Only pending or in-progress requests can be completed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review_request.complete()

        # Log action
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
        """
        Cancel a review request.

        Request body:
        - reason: Reason for cancellation (required)
        """
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

        # Log action
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

    @action(detail=True, methods=["post"], url_path="add-care-plan-entry")
    def add_care_plan_entry(self, request, pk=None):
        """
        Add a nursing care plan entry to the kardex.

        Request body:
        - recorded_at: Date/time of the entry
        - assessment: Assessment findings / cluster of cues
        - nursing_diagnosis: Nursing diagnosis
        - goal_and_outcome_criteria: Goals and outcome criteria
        - plan_of_action: Nursing plan of action / interventions
        - scientific_rationale: Scientific rationale
        - implementation: What was implemented (optional)
        - evaluation: Evaluation of outcomes (optional)
        - status: ACTIVE / RESOLVED / ONGOING (default: ACTIVE)
        """
        kardex = self.get_object()
        serializer = NursingCarePlanEntryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_by=request.user,
            **serializer.validated_data,
        )

        # Log care plan entry creation
        AuditLog.log(
            action="kardex_care_plan_entry_create",
            user=request.user,
            resource_type="NursingCarePlanEntry",
            resource_id=entry.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "nursing_diagnosis": entry.nursing_diagnosis[:100],
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = NursingCarePlanEntrySerializer(entry)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path=r"update-care-plan-entry/(?P<entry_id>\d+)")
    def update_care_plan_entry(self, request, pk=None, entry_id=None):
        """
        Update a nursing care plan entry (e.g., add implementation/evaluation).

        Only the following fields can be updated:
        - implementation, evaluation, status

        Entries in terminal statuses (RESOLVED, DISCONTINUED) cannot be updated.
        """
        kardex = self.get_object()
        try:
            entry = kardex.care_plan_entries.get(id=entry_id)
        except NursingCarePlanEntry.DoesNotExist:
            return Response(
                {"error": "Care plan entry not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if entry.status in NursingCarePlanEntry.TERMINAL_STATUSES:
            return Response(
                {"error": f"Cannot update a {entry.get_status_display().lower()} care plan entry"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_fields = {"implementation", "evaluation", "status"}
        update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

        if not update_data:
            return Response(
                {"error": "No valid fields to update. Allowed: implementation, evaluation, status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate status transition
        new_status = update_data.get("status")
        if new_status and new_status not in dict(NursingCarePlanEntry.STATUS_CHOICES):
            return Response(
                {"error": f"Invalid status: {new_status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for field, value in update_data.items():
            setattr(entry, field, value)
        entry.save(update_fields=list(update_data.keys()) + ["updated_at"])

        # Log care plan entry update
        AuditLog.log(
            action="kardex_care_plan_entry_update",
            user=request.user,
            resource_type="NursingCarePlanEntry",
            resource_id=entry.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "updated_fields": list(update_data.keys()),
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = NursingCarePlanEntrySerializer(entry)
        return Response(result_serializer.data)

    @action(detail=True, methods=["post"], url_path="resolve-all-care-plans")
    def resolve_all_care_plans(self, request, pk=None):
        """
        Bulk-resolve all active/ongoing care plan entries for discharge clearance.

        Sets all non-terminal entries to RESOLVED. Optionally accepts:
        - evaluation: str — evaluation note applied to all resolved entries
        """
        kardex = self.get_object()
        evaluation = request.data.get("evaluation", "")

        pending_entries = kardex.care_plan_entries.filter(
            status__in=["ACTIVE", "ONGOING"]
        )
        count = pending_entries.count()

        if count == 0:
            return Response(
                {"message": "No active care plan entries to resolve", "resolved_count": 0}
            )

        update_fields = {"status": "RESOLVED"}
        if evaluation:
            update_fields["evaluation"] = evaluation

        pending_entries.update(**update_fields)

        AuditLog.log(
            action="kardex_care_plan_bulk_resolve",
            user=request.user,
            resource_type="NursingKardex",
            resource_id=kardex.id,
            details={
                "admission_number": kardex.admission.admission_number,
                "resolved_count": count,
                "evaluation": evaluation[:200] if evaluation else "",
            },
            ip_address=get_client_ip(request),
        )

        return Response(
            {"message": f"{count} care plan entry(ies) resolved", "resolved_count": count}
        )

    @action(detail=True, methods=["post"], url_path=r"discontinue-care-plan-entry/(?P<entry_id>\d+)")
    def discontinue_care_plan_entry(self, request, pk=None, entry_id=None):
        """
        Discontinue a care plan entry (e.g., plan abandoned, patient refused).

        Requires:
        - reason: str — reason for discontinuation (stored in evaluation field)
        """
        kardex = self.get_object()
        try:
            entry = kardex.care_plan_entries.get(id=entry_id)
        except NursingCarePlanEntry.DoesNotExist:
            return Response(
                {"error": "Care plan entry not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if entry.status in NursingCarePlanEntry.TERMINAL_STATUSES:
            return Response(
                {"error": f"Cannot discontinue a {entry.get_status_display().lower()} care plan entry"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "").strip()
        if not reason:
            return Response(
                {"error": "A reason is required to discontinue a care plan entry"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entry.status = "DISCONTINUED"
        entry.evaluation = f"[Discontinued] {reason}" if not entry.evaluation else f"{entry.evaluation}\n[Discontinued] {reason}"
        entry.save(update_fields=["status", "evaluation", "updated_at"])

        AuditLog.log(
            action="kardex_care_plan_entry_discontinue",
            user=request.user,
            resource_type="NursingCarePlanEntry",
            resource_id=entry.id,
            details={
                "kardex_id": kardex.id,
                "admission_number": kardex.admission.admission_number,
                "reason": reason[:200],
            },
            ip_address=get_client_ip(request),
        )

        result_serializer = NursingCarePlanEntrySerializer(entry)
        return Response(result_serializer.data)


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


# =============================================================================
# Observation Chart ViewSets
# =============================================================================


class TemperatureReadingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for temperature chart readings.

    Provides CRUD for temperature readings linked to admissions.
    Supports filtering by admission.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission"]
    ordering_fields = ["recorded_at"]
    ordering = ["-recorded_at"]

    def get_queryset(self):
        return TemperatureReading.objects.select_related(
            "admission", "admission__patient", "recorded_by"
        )

    def get_serializer_class(self):
        if self.action == "create":
            return TemperatureReadingCreateSerializer
        return TemperatureReadingSerializer

    def create(self, request, *args, **kwargs):
        """Return the full read serializer after creating a temperature reading."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = TemperatureReadingSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        AuditLog.log(
            action="temperature_reading_create",
            user=self.request.user,
            resource_type="TemperatureReading",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "temperature": str(instance.temperature),
            },
            ip_address=get_client_ip(self.request),
        )


class FluidBalanceSheetViewSet(viewsets.ModelViewSet):
    """ViewSet for daily fluid balance sheets."""

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission", "chart_date"]
    ordering_fields = ["chart_date", "created_at"]
    ordering = ["-chart_date", "-created_at"]

    def get_queryset(self):
        return FluidBalanceSheet.objects.select_related(
            "admission", "admission__patient", "recorded_by"
        ).prefetch_related("entries", "entries__recorded_by")

    def get_serializer_class(self):
        if self.action == "create":
            return FluidBalanceSheetCreateSerializer
        return FluidBalanceSheetSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = FluidBalanceSheetSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        AuditLog.log(
            action="fluid_balance_sheet_create",
            user=self.request.user,
            resource_type="FluidBalanceSheet",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "chart_date": instance.chart_date.isoformat(),
            },
            ip_address=get_client_ip(self.request),
        )


class FluidBalanceEntryViewSet(viewsets.ModelViewSet):
    """ViewSet for categorized fluid balance entries."""

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["fluid_balance_sheet", "entry_type"]
    ordering_fields = ["recorded_at", "created_at"]
    ordering = ["-recorded_at", "-created_at"]

    def get_queryset(self):
        return FluidBalanceEntry.objects.select_related(
            "fluid_balance_sheet",
            "fluid_balance_sheet__admission",
            "fluid_balance_sheet__admission__patient",
            "recorded_by",
        )

    def get_serializer_class(self):
        if self.action == "create":
            return FluidBalanceEntryCreateSerializer
        return FluidBalanceEntrySerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = FluidBalanceEntrySerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        AuditLog.log(
            action="fluid_balance_entry_create",
            user=self.request.user,
            resource_type="FluidBalanceEntry",
            resource_id=instance.id,
            details={
                "fluid_balance_sheet_id": instance.fluid_balance_sheet_id,
                "entry_type": instance.entry_type,
                "amount_ml": instance.amount_ml,
            },
            ip_address=get_client_ip(self.request),
        )


class BloodTransfusionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for blood transfusion observation charts.

    Provides CRUD for transfusion records and nested observation entries.
    Supports filtering by admission.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission", "status"]
    ordering_fields = ["transfusion_date"]
    ordering = ["-transfusion_date"]

    def get_queryset(self):
        return BloodTransfusionObservation.objects.select_related(
            "admission", "admission__patient", "started_by", "counter_checked_by"
        ).prefetch_related("observations", "observations__recorded_by")

    def get_serializer_class(self):
        if self.action == "create":
            return BloodTransfusionCreateSerializer
        if self.action == "add_observation":
            return TransfusionObservationEntryCreateSerializer
        return BloodTransfusionSerializer

    def perform_create(self, serializer):
        instance = serializer.save(started_by=self.request.user)
        AuditLog.log(
            action="blood_transfusion_create",
            user=self.request.user,
            resource_type="BloodTransfusionObservation",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "blood_product": instance.blood_product,
                "amount_ml": instance.amount_ml,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"], url_path="add-observation")
    def add_observation(self, request, pk=None):
        """
        Add an observation entry to a transfusion record.
        """
        transfusion = self.get_object()
        serializer = TransfusionObservationEntryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(
            transfusion=transfusion,
            recorded_by=request.user,
        )
        AuditLog.log(
            action="transfusion_observation_create",
            user=request.user,
            resource_type="TransfusionObservationEntry",
            resource_id=entry.id,
            details={
                "transfusion_id": transfusion.id,
                "interval": entry.observation_interval,
            },
            ip_address=get_client_ip(request),
        )
        return Response(
            TransfusionObservationEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="mark-reaction")
    def mark_reaction(self, request, pk=None):
        """
        Record a transfusion reaction.
        """
        transfusion = self.get_object()
        reaction_type = request.data.get("reaction_type", "")
        action_taken = request.data.get("action_taken", "")

        if not reaction_type:
            return Response(
                {"error": "reaction_type is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        transfusion.reaction_occurred = True
        transfusion.reaction_type = reaction_type
        transfusion.reaction_action_taken = action_taken
        transfusion.status = "STOPPED"
        transfusion.save()

        AuditLog.log(
            action="transfusion_reaction_recorded",
            user=request.user,
            resource_type="BloodTransfusionObservation",
            resource_id=transfusion.id,
            details={
                "reaction_type": reaction_type,
                "action_taken": action_taken,
            },
            ip_address=get_client_ip(request),
        )
        return Response(BloodTransfusionSerializer(transfusion).data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete_transfusion(self, request, pk=None):
        """
        Mark a transfusion as completed.
        """
        transfusion = self.get_object()
        from django.utils import timezone as tz
        import datetime

        transfusion.status = "COMPLETED"
        transfusion.time_ended = request.data.get(
            "time_ended", tz.localtime().time()
        )
        if isinstance(transfusion.time_ended, str):
            transfusion.time_ended = datetime.time.fromisoformat(transfusion.time_ended)
        transfusion.save()

        AuditLog.log(
            action="blood_transfusion_complete",
            user=request.user,
            resource_type="BloodTransfusionObservation",
            resource_id=transfusion.id,
            details={"admission_id": transfusion.admission_id},
            ip_address=get_client_ip(request),
        )
        return Response(BloodTransfusionSerializer(transfusion).data)


class BPMonitoringViewSet(viewsets.ModelViewSet):
    """
    ViewSet for blood pressure monitoring readings.

    Provides CRUD for BP readings linked to admissions.
    Supports filtering by admission.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission"]
    ordering_fields = ["recorded_at"]
    ordering = ["-recorded_at"]

    def get_queryset(self):
        return BPMonitoringReading.objects.select_related(
            "admission", "admission__patient", "recorded_by"
        )

    def get_serializer_class(self):
        if self.action == "create":
            return BPMonitoringReadingCreateSerializer
        return BPMonitoringReadingSerializer

    def perform_create(self, serializer):
        instance = serializer.save(recorded_by=self.request.user)
        AuditLog.log(
            action="bp_reading_create",
            user=self.request.user,
            resource_type="BPMonitoringReading",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "systolic": instance.systolic,
                "diastolic": instance.diastolic,
            },
            ip_address=get_client_ip(self.request),
        )


class MedicationAdministrationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Medication Administration Record (MAR) entries.

    Provides CRUD for MAR entries linked to admissions and
    prescription items. Supports filtering by admission and status.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["admission", "status", "prescription_item"]
    ordering_fields = ["scheduled_time", "created_at"]
    ordering = ["-scheduled_time"]

    def get_queryset(self):
        return MedicationAdministration.objects.select_related(
            "admission",
            "admission__patient",
            "prescription_item",
            "prescription_item__drug",
            "administered_by",
        )

    def get_serializer_class(self):
        if self.action == "create":
            return MedicationAdministrationCreateSerializer
        if self.action == "record_administration":
            return MedicationAdministrationActionSerializer
        return MedicationAdministrationSerializer

    def create(self, request, *args, **kwargs):
        """Return the full read serializer after creating a MAR entry."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = self.get_queryset().get(pk=serializer.instance.pk)
        output_serializer = MedicationAdministrationSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="medication_administration_create",
            user=self.request.user,
            resource_type="MedicationAdministration",
            resource_id=instance.id,
            details={
                "admission_id": instance.admission_id,
                "prescription_item_id": instance.prescription_item_id,
                "scheduled_time": str(instance.scheduled_time),
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"], url_path="record")
    def record_administration(self, request, pk=None):
        """Record that a dose was given, skipped, refused, held, or vomited."""
        mar_entry = self.get_object()
        serializer = MedicationAdministrationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        dose_given = serializer.validated_data.get("dose_given", "")
        notes = serializer.validated_data.get("notes", "")

        if new_status == "GIVEN":
            mar_entry.administer(user=request.user, dose_given=dose_given, notes=notes)
        else:
            from django.utils import timezone as tz

            mar_entry.status = new_status
            mar_entry.actual_time = tz.now()
            mar_entry.administered_by = request.user
            if notes:
                mar_entry.notes = notes
            mar_entry.save(
                update_fields=["status", "actual_time", "administered_by", "notes", "updated_at"]
            )

        AuditLog.log(
            action="medication_administration_record",
            user=request.user,
            resource_type="MedicationAdministration",
            resource_id=mar_entry.id,
            details={
                "admission_id": mar_entry.admission_id,
                "new_status": new_status,
                "dose_given": dose_given,
            },
            ip_address=get_client_ip(request),
        )

        refreshed = self.get_queryset().get(pk=mar_entry.pk)
        return Response(MedicationAdministrationSerializer(refreshed).data)
