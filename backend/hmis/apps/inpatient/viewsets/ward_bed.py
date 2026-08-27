"""
What this file is for: inpatient ward and bed viewsets with ward compatibility and bed turnover actions.
How to use: imported by ``inpatient.views`` so existing router imports remain stable.
Supported inputs/args: DRF request payloads/query params handled by WardViewSet and BedViewSet actions.
"""

# ruff: noqa: ARG002

from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog, Facility
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)
from hmis.apps.core.tenant_access import user_has_facility_access
from hmis.apps.patients.models import Patient

from ..models import Admission, Bed, Ward
from ..serializers import (
    BedSerializer,
    BedTurnoverActionSerializer,
    InpatientWardSerializer,
    WardUpdatesResponseSerializer,
)
from ..services.compatibility import ward_compatibility_service


class WardViewSet(AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    tenant_scope = "facility"  # Wards are facility-scoped
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
    audit_resource_type = "InpatientWard"
    audit_action_prefix = "inpatient.ward"
    audit_source = "inpatient_api"
    serializer_class = InpatientWardSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        """
        Seed default wards for the user's facility.

        Creates a standard set of 6 hospital wards (Medical, Surgical,
        Paediatric, Maternity, ICU, Isolation) with beds auto-generated.
        Skips wards that already exist (by code) for the facility.
        """
        from hmis.apps.inpatient.management.commands.seed_default_wards import DEFAULT_WARDS

        facility = getattr(request, "facility", None)
        requested_facility_id = request.data.get("facility_id") or request.query_params.get(
            "facility_id"
        )

        if requested_facility_id:
            try:
                requested_facility = Facility.objects.select_related("organization").get(
                    pk=int(requested_facility_id), is_active=True
                )
            except (Facility.DoesNotExist, ValueError, TypeError):
                return Response(
                    {"error": "Invalid facility_id."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not request.user.is_superuser:
                if not getattr(request.user, "staff_profile", None):
                    raise PermissionDenied("Staff profile required for facility-scoped action.")

                if not user_has_facility_access(request.user, requested_facility):
                    raise PermissionDenied(
                        "You do not have access to the requested facility for this action."
                    )

            facility = requested_facility

        if not facility and hasattr(request.user, "staff_profile"):
            profile = getattr(request.user, "staff_profile", None)
            if profile and hasattr(profile, "primary_facility"):
                facility = profile.primary_facility

        if not facility:
            return Response(
                {"error": "No facility context available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_wards = []
        for ward_def in DEFAULT_WARDS:
            code = ward_def["code"]
            ward_name = ward_def["name"]
            if (
                Ward.objects.filter(facility=facility)
                .filter(Q(code=code) | Q(name=ward_name))
                .exists()
            ):
                continue
            ward = Ward.objects.create(facility=facility, is_active=True, **ward_def)
            created_wards.append(
                {"id": ward.id, "name": ward.name, "code": ward.code, "beds": ward.beds.count()}
            )

        return Response(
            {
                "created": len(created_wards),
                "facility_id": facility.id,
                "facility_name": facility.name,
                "wards": created_wards,
                "message": f"Created {len(created_wards)} default ward(s)"
                if created_wards
                else "All default wards already exist",
            },
            status=status.HTTP_201_CREATED if created_wards else status.HTTP_200_OK,
        )

    @extend_schema(
        summary="Recommend bed using rules-based assignment",
        description=(
            "Phase B: Evaluate available beds for a patient using constraint checking "
            "and scoring rules. Returns the recommended bed without marking it as occupied. "
            "Uses WardCompatibilityService for constraint validation and AssignmentRule DSL "
            "for scoring. All decisions are logged to AssignmentDecision for audit."
        ),
        request=inline_serializer(
            name="RuleBasedBedRecommendationRequest",
            fields={
                "patient_id": serializers.IntegerField(help_text="Patient ID"),
                "requires_isolation": serializers.BooleanField(required=False, default=False),
                "requires_oxygen": serializers.BooleanField(required=False, default=False),
                "requires_ventilator": serializers.BooleanField(required=False, default=False),
                "admission_type": serializers.ChoiceField(
                    choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
                    required=False,
                    default="ELECTIVE",
                ),
            },
        ),
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
        from hmis.apps.inpatient.serializers import RuleBasedBedAssignmentRequestSerializer
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
            "assigned_ward_name": (result.assigned_bed.ward.name if result.assigned_bed else None),
            "rule_applied": result.rule_applied.rule_code if result.rule_applied else None,
            "decision_id": result.decision.id if result.decision else None,
            "decision_outcome": result.decision.decision_outcome if result.decision else "ERROR",
            "decision_reason": result.decision.decision_reason if result.decision else "",
            "evaluation_time_ms": result.evaluation_time_ms,
            "candidates_evaluated": [e.to_dict() for e in result.candidates_evaluated],
            "scoring_details": (result.decision.scoring_details if result.decision else {}),
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
        response_data["predicted_discharges"] = [p.to_dict() for p in result.predicted_discharges]

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
                    required=False,
                    default="ELECTIVE",
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
            wards_queryset=self.get_queryset(),
        )

        return Response(result.to_dict(), status=status.HTTP_200_OK)


class BedViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["ward", "status"]
    search_fields = ["bed_number"]
    ordering_fields = ["bed_number", "status", "status_changed_at"]
    ordering = ["bed_number"]
    tenant_facility_chain = "ward__facility"
    tenant_org_chain = "ward__organization"

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
