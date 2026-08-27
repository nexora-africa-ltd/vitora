"""
What this file is for: inpatient admission viewset and admission-specific API actions.
How to use: imported by ``inpatient.views`` so existing router imports remain stable.
Supported inputs/args: DRF request payloads/query params handled by AdmissionViewSet serializers/actions.
"""

from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.ai.services.icu_lab_enrichment import get_latest_labs_for_icu
from hmis.apps.core.mixins import PublicIdLookupMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)
from hmis.apps.licensing.permissions import requires_feature

from ..clearance import calculate_patient_blocking_balance
from ..models import (
    Admission,
    Bed,
    DischargeDraft,
    InpatientConsumableUsage,
    NursingKardex,
    ReviewRequest,
    Transfer,
    Ward,
)
from ..serializers import (
    AdmissionICUReadinessSerializer,
    AdmissionSerializer,
    CriticalCareWorkflowHealthSerializer,
    DischargeDraftSerializer,
    InpatientConsumableUsageCreateSerializer,
    InpatientConsumableUsageReverseSerializer,
    InpatientConsumableUsageSerializer,
)
from ..services.admission_workflows import admission_order_q, parse_bp_value, transfer_direction
from ..services.bed_assignment import NoBedAvailableError, bed_assignment_service
from ..services.clinical_summary import InpatientClinicalSummaryComposer
from ..services.compatibility import ward_compatibility_service


class AdmissionViewSet(PublicIdLookupMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
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

    tenant_scope = "facility"  # Admissions are facility-scoped

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
    permission_classes = [
        IsAuthenticated,
        WriteRequiresRolePermission,
        requires_feature("inpatient"),
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "ward", "admission_status", "payer_type"]
    search_fields = ["admission_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["admission_date", "created_at", "admission_number"]
    ordering = ["-admission_date"]

    def get_queryset(self):
        queryset = super().get_queryset()
        ward_type = str(self.request.query_params.get("ward_type", "") or "").strip()
        if ward_type:
            queryset = queryset.filter(ward__ward_type=ward_type)
        return queryset

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
                    "override_available": any(v.override_allowed for v in result.violations),
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

        # Add tenant context
        save_kwargs.update(self.get_tenant_save_kwargs())

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

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get critical-care workflow health",
        description=(
            "Returns ICU/HDU/NBU workflow health metrics for admissions, transfers, "
            "pending review requests, transfer transition matrix, and current critical-care ward load."
        ),
        parameters=[
            OpenApiParameter(
                name="days",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Number of days to include for transfer/review trend metrics (default: 30)",
                required=False,
            ),
        ],
        responses={200: CriticalCareWorkflowHealthSerializer},
    )
    @action(detail=False, methods=["get"], url_path="critical-care-workflow-health")
    def critical_care_workflow_health(self, request):
        """Aggregate Phase 3 critical-care workflow metrics for dashboards/monitoring."""
        from datetime import timedelta

        self._resolve_tenant_context()
        now = timezone.now()
        raw_days = request.query_params.get("days", 30)
        try:
            days = max(1, min(int(raw_days), 365))
        except (TypeError, ValueError):
            days = 30
        since = now - timedelta(days=days)

        admissions_qs = self.get_queryset()
        active_admissions_qs = admissions_qs.filter(admission_status="ACTIVE").select_related(
            "ward"
        )
        critical_types = ["ICU", "HDU", "NBU"]

        transfers_qs = Transfer.objects.filter(
            admission_id__in=admissions_qs.values("id"),
            transfer_date__gte=since,
        ).select_related("source_ward", "destination_ward")

        step_up_count = 0
        step_down_count = 0
        lateral_count = 0
        for transfer in transfers_qs:
            direction = transfer_direction(
                str(getattr(transfer.source_ward, "ward_type", "") or ""),
                str(getattr(transfer.destination_ward, "ward_type", "") or ""),
            )
            if direction == "STEP_UP":
                step_up_count += 1
            elif direction == "STEP_DOWN":
                step_down_count += 1
            else:
                lateral_count += 1

        transfer_matrix_qs = (
            transfers_qs.values("source_ward__ward_type", "destination_ward__ward_type")
            .annotate(count=Count("id"))
            .order_by("-count", "source_ward__ward_type", "destination_ward__ward_type")
        )
        transfer_matrix = [
            {
                "from_ward_type": row["source_ward__ward_type"] or "UNKNOWN",
                "to_ward_type": row["destination_ward__ward_type"] or "UNKNOWN",
                "count": row["count"],
            }
            for row in transfer_matrix_qs
        ]

        review_pending_qs = ReviewRequest.objects.filter(
            admission_id__in=admissions_qs.values("id"),
            requested_at__gte=since,
            status="PENDING",
        ).select_related("admission")
        overdue_review_count = sum(
            1 for request_item in review_pending_qs if request_item.is_overdue
        )

        tenant_facility = getattr(request, "facility", None)
        if tenant_facility is not None:
            critical_wards = Ward.objects.filter(
                facility=tenant_facility,
                is_active=True,
                ward_type__in=critical_types,
            )
        else:
            critical_wards = Ward.objects.none()

        active_by_ward = {
            row["ward"]: row["count"]
            for row in active_admissions_qs.values("ward").annotate(count=Count("id"))
        }
        ward_load = [
            {
                "ward_id": ward.id,
                "ward_name": ward.name,
                "ward_type": ward.ward_type,
                "active_admissions": int(active_by_ward.get(ward.id, 0)),
                "occupancy_rate": float(getattr(ward, "occupancy_rate", 0.0) or 0.0),
            }
            for ward in critical_wards
        ]
        ward_load.sort(key=lambda item: item["ward_type"])

        totals = {
            "active_admissions": active_admissions_qs.count(),
            "critical_admissions": active_admissions_qs.filter(
                ward__ward_type__in=critical_types
            ).count(),
            "current_icu": active_admissions_qs.filter(ward__ward_type="ICU").count(),
            "current_hdu": active_admissions_qs.filter(ward__ward_type="HDU").count(),
            "current_nbu": active_admissions_qs.filter(ward__ward_type="NBU").count(),
            "transfers_total": transfers_qs.count(),
            "step_up_transfers": step_up_count,
            "step_down_transfers": step_down_count,
            "lateral_transfers": lateral_count,
            "review_requests_pending": review_pending_qs.count(),
            "review_requests_overdue": overdue_review_count,
        }

        return Response(
            {
                "period_days": days,
                "generated_at": now,
                "totals": totals,
                "transfer_matrix": transfer_matrix,
                "ward_load": ward_load,
            }
        )

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get lab orders for admission",
        description="Get all lab orders for a specific admission.",
    )
    @action(detail=True, methods=["get"], url_path="lab-orders")
    def lab_orders(self, request, pk=None):  # noqa: ARG002
        """Get lab orders for this admission."""
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.laboratory.serializers import LabOrderSerializer

        admission = self.get_object()
        orders = (
            LabOrder.objects.filter(admission_order_q(admission))
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
    def imaging_orders(self, request, pk=None):  # noqa: ARG002
        """Get imaging orders for this admission."""
        from hmis.apps.imaging.models import ImagingOrder
        from hmis.apps.imaging.serializers import ImagingOrderSerializer

        admission = self.get_object()
        orders = (
            ImagingOrder.objects.filter(admission_order_q(admission))
            .select_related("patient", "encounter", "ordered_by")
            .prefetch_related("items__procedure", "reports")
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
    def prescriptions(self, request, pk=None):  # noqa: ARG002
        """Get prescriptions for this admission."""
        from hmis.apps.pharmacy.models import Prescription
        from hmis.apps.pharmacy.serializers import PrescriptionSerializer

        admission = self.get_object()
        prescriptions = (
            Prescription.objects.filter(admission_order_q(admission))
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
    def orders(self, request, pk=None):  # noqa: ARG002
        """Get all orders for this admission (combined view)."""
        from hmis.apps.imaging.models import ImagingOrder
        from hmis.apps.imaging.serializers import ImagingOrderSerializer
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.laboratory.serializers import LabOrderSerializer
        from hmis.apps.pharmacy.models import Prescription
        from hmis.apps.pharmacy.serializers import PrescriptionSerializer

        admission = self.get_object()
        q = admission_order_q(admission)

        lab_orders = (
            LabOrder.objects.filter(q)
            .select_related("patient", "encounter", "ordered_by")
            .prefetch_related("items__test", "items__result")
            .distinct()
        )

        imaging_orders = (
            ImagingOrder.objects.filter(q)
            .select_related("patient", "encounter", "ordered_by")
            .prefetch_related("items__procedure", "reports")
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
        summary="Get chronological clinical summary",
        description=(
            "Build a read-only, chronological timeline from ward rounds, kardex shift notes, "
            "kardex handover notes, ward transfers, and review-request milestones for "
            "preview before claim submission."
        ),
        responses={
            200: inline_serializer(
                name="AdmissionClinicalSummaryResponse",
                fields={
                    "admission_id": serializers.IntegerField(),
                    "admission_number": serializers.CharField(),
                    "generated_at": serializers.DateTimeField(),
                    "entries": serializers.ListField(
                        child=inline_serializer(
                            name="AdmissionClinicalSummaryEntry",
                            fields={
                                "timestamp": serializers.DateTimeField(),
                                "source": serializers.CharField(),
                                "author": serializers.CharField(),
                                "content": serializers.CharField(),
                            },
                        )
                    ),
                    "rendered_text": serializers.CharField(),
                },
            )
        },
    )
    @action(detail=True, methods=["get"], url_path="clinical-summary")
    def clinical_summary(self, request, pk=None):  # noqa: ARG002
        """Return composed clinical timeline for this admission."""
        admission = self.get_object()

        entries = InpatientClinicalSummaryComposer.compose_for_admission(admission)
        rendered_text = InpatientClinicalSummaryComposer.render_text(entries)

        return Response(
            {
                "admission_id": admission.id,
                "admission_number": admission.admission_number,
                "generated_at": timezone.now(),
                "entries": [
                    {
                        "timestamp": entry.timestamp,
                        "source": entry.source,
                        "author": entry.author,
                        "content": entry.content,
                    }
                    for entry in entries
                ],
                "rendered_text": rendered_text,
            }
        )

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="Get ICU predictor readiness for admission",
        description=(
            "Returns normalized bedside/lab fields used by ICU predictor plus "
            "required/advisory missing-field preflight checks."
        ),
        responses={200: AdmissionICUReadinessSerializer},
    )
    @action(detail=True, methods=["get"], url_path="icu-readiness")
    def icu_readiness(self, request, pk=None):  # noqa: ARG002
        """Expose ICU predictor preflight data for this admission."""
        admission = self.get_object()

        latest_ward_round = admission.ward_rounds.order_by(
            "-round_date", "-round_time", "-created_at"
        ).first()
        latest_temp = admission.temperature_readings.order_by("-recorded_at").first()
        latest_bp = admission.bp_readings.order_by("-recorded_at").first()
        latest_fluid = admission.fluid_balance_sheets.order_by("-chart_date", "-created_at").first()
        lab_values = get_latest_labs_for_icu(
            patient_id=admission.patient_id,
            admission_id=admission.id,
        )

        wr_systolic, wr_diastolic = parse_bp_value(
            getattr(latest_ward_round, "blood_pressure", None)
        )

        field_sources: dict[str, str] = {}

        temperature = None
        if latest_temp and latest_temp.temperature is not None:
            temperature = float(latest_temp.temperature)
            field_sources["temperature"] = "temperature_chart"
        elif latest_ward_round and latest_ward_round.temperature is not None:
            temperature = float(latest_ward_round.temperature)
            field_sources["temperature"] = "ward_round"

        heart_rate = None
        if latest_bp and latest_bp.pulse is not None:
            heart_rate = int(latest_bp.pulse)
            field_sources["heart_rate"] = "bp_chart"
        elif latest_temp and latest_temp.pulse is not None:
            heart_rate = int(latest_temp.pulse)
            field_sources["heart_rate"] = "temperature_chart"
        elif latest_ward_round and latest_ward_round.pulse is not None:
            heart_rate = int(latest_ward_round.pulse)
            field_sources["heart_rate"] = "ward_round"

        respiratory_rate = None
        if latest_temp and latest_temp.respiratory_rate is not None:
            respiratory_rate = int(latest_temp.respiratory_rate)
            field_sources["respiratory_rate"] = "temperature_chart"
        elif latest_ward_round and latest_ward_round.respiratory_rate is not None:
            respiratory_rate = int(latest_ward_round.respiratory_rate)
            field_sources["respiratory_rate"] = "ward_round"

        systolic_bp = None
        diastolic_bp = None
        if latest_bp:
            systolic_bp = int(latest_bp.systolic)
            diastolic_bp = int(latest_bp.diastolic)
            field_sources["systolic_bp"] = "bp_chart"
            field_sources["diastolic_bp"] = "bp_chart"
        elif wr_systolic is not None and wr_diastolic is not None:
            systolic_bp = wr_systolic
            diastolic_bp = wr_diastolic
            field_sources["systolic_bp"] = "ward_round"
            field_sources["diastolic_bp"] = "ward_round"

        spo2 = None
        if latest_ward_round and latest_ward_round.spo2 is not None:
            spo2 = float(latest_ward_round.spo2)
            field_sources["spo2"] = "ward_round"

        gcs = getattr(latest_ward_round, "gcs_total", None) if latest_ward_round else None
        if gcs is not None:
            field_sources["gcs"] = "ward_round"

        on_vasopressors = (
            getattr(latest_ward_round, "on_vasopressors", None) if latest_ward_round else None
        )
        if on_vasopressors is not None:
            field_sources["on_vasopressors"] = "ward_round"

        vasopressor_dose = (
            getattr(latest_ward_round, "vasopressor_dose_mcg_kg_min", None)
            if latest_ward_round
            else None
        )
        if vasopressor_dose is not None:
            field_sources["vasopressor_dose_mcg_kg_min"] = "ward_round"

        on_mechanical_ventilation = (
            getattr(latest_ward_round, "on_mechanical_ventilation", None)
            if latest_ward_round
            else None
        )
        if on_mechanical_ventilation is not None:
            field_sources["on_mechanical_ventilation"] = "ward_round"

        urine_output_ml_day = (
            getattr(latest_ward_round, "urine_output_ml_24h", None) if latest_ward_round else None
        )
        if urine_output_ml_day is not None:
            field_sources["urine_output_ml_day"] = "ward_round"
        elif latest_fluid is not None:
            urine_output_ml_day = latest_fluid.total_urine_output_ml
            field_sources["urine_output_ml_day"] = "fluid_balance_sheet"

        labs = {
            "wbc": lab_values.get("wbc"),
            "platelets": lab_values.get("platelets"),
            "creatinine": lab_values.get("creatinine"),
            "bilirubin": lab_values.get("bilirubin"),
            "lactate": lab_values.get("lactate"),
            "pao2_fio2_ratio": lab_values.get("pao2_fio2_ratio"),
        }
        for key, value in labs.items():
            if value is not None:
                field_sources[key] = "icu_lab_enrichment"

        vitals = {
            "temperature": temperature,
            "heart_rate": heart_rate,
            "systolic_bp": systolic_bp,
            "diastolic_bp": diastolic_bp,
            "respiratory_rate": respiratory_rate,
            "spo2": spo2,
        }

        missing_required: list[str] = []
        if vitals["respiratory_rate"] is None:
            missing_required.append("respiratory_rate")
        if vitals["systolic_bp"] is None:
            missing_required.append("systolic_bp")
        if vitals["diastolic_bp"] is None:
            missing_required.append("diastolic_bp")
        if labs["platelets"] is None:
            missing_required.append("platelets")
        if labs["bilirubin"] is None:
            missing_required.append("bilirubin")
        if labs["creatinine"] is None:
            missing_required.append("creatinine")
        if gcs is None:
            missing_required.append("gcs")

        has_respiratory_context = (
            labs["pao2_fio2_ratio"] is not None or on_mechanical_ventilation is not None
        )
        if not has_respiratory_context:
            missing_required.append("pao2_fio2_ratio_or_ventilation_status")
        if on_vasopressors is None:
            missing_required.append("on_vasopressors")

        missing_advisory: list[str] = []
        if labs["wbc"] is None:
            missing_advisory.append("wbc")
        if labs["lactate"] is None:
            missing_advisory.append("lactate")
        if urine_output_ml_day is None:
            missing_advisory.append("urine_output_ml_day")

        payload = {
            "admission_id": admission.id,
            "can_run_predict": len(missing_required) == 0,
            "missing_required": missing_required,
            "missing_advisory": missing_advisory,
            "vitals": vitals,
            "labs": labs,
            "gcs": gcs,
            "on_vasopressors": on_vasopressors,
            "vasopressor_dose_mcg_kg_min": (
                float(vasopressor_dose) if vasopressor_dose is not None else None
            ),
            "on_mechanical_ventilation": on_mechanical_ventilation,
            "urine_output_ml_day": urine_output_ml_day,
            "field_sources": field_sources,
        }
        serializer = AdmissionICUReadinessSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)

    @extend_schema(
        tags=["Inpatient - Admissions"],
        summary="List consumable usage for admission",
        description="Get all recorded consumable stock usages for a specific admission.",
    )
    @action(detail=True, methods=["get"], url_path="consumable-usage")
    def consumable_usage(self, request, pk=None):  # noqa: ARG002
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
    def record_consumable_usage(self, request, pk=None):  # noqa: ARG002
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
    def reverse_consumable_usage(self, request, pk=None, usage_id=None):  # noqa: ARG002
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
    def override_bed(self, request, pk=None):  # noqa: ARG002
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
        return Response(
            {
                "admission": serializer.data,
                "override_id": override.id,
                "old_bed": old_bed.bed_number,
                "new_bed": new_bed.bed_number,
            }
        )

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
    def set_expected_discharge(self, request, pk=None):  # noqa: ARG002
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

        admission.expected_discharge_date = serializer.validated_data["expected_discharge_date"]
        admission.save(update_fields=["expected_discharge_date", "updated_at"])

        AuditLog.log(
            action="admission_expected_discharge_set",
            user=request.user,
            resource_type="Admission",
            resource_id=admission.id,
            details={
                "admission_number": admission.admission_number,
                "expected_discharge_date": (admission.expected_discharge_date.isoformat()),
            },
            ip_address=get_client_ip(request),
        )

        return Response(
            {
                "admission_id": admission.id,
                "admission_number": admission.admission_number,
                "expected_discharge_date": (admission.expected_discharge_date.isoformat()),
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
    def clearance_status(self, request, pk=None):  # noqa: ARG002
        """Get automated clearance status for this admission."""
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
                Invoice.Status.DRAFT,
                Invoice.Status.PAID,
                Invoice.Status.CANCELLED,
                Invoice.Status.WRITTEN_OFF,
            ]
        )
        billing_balance = calculate_patient_blocking_balance(unpaid_invoices)
        outstanding = billing_balance["outstanding_amount"]
        billing_cleared = outstanding <= 0
        billing_info = {
            "cleared": billing_cleared,
            "reason": (
                "All bills settled"
                if billing_cleared
                else f"Patient-responsible outstanding balance: KES {outstanding:,.2f}"
            ),
            "outstanding_amount": float(outstanding),
            "invoice_count": billing_balance["invoice_count"],
            "first_pending_id": billing_balance["first_pending_id"],
        }

        # ----- Pharmacy: all INTERNAL prescriptions dispensed or cancelled -----
        # EXTERNAL prescriptions don't require hospital pharmacy clearance
        q = admission_order_q(admission)
        pending_rx = (
            Prescription.objects.filter(q, dispensing_type="INTERNAL")
            .exclude(status__in=["DISPENSED", "CANCELLED"])
            .distinct()
        )
        pharmacy_cleared = not pending_rx.exists()
        first_rx_id = pending_rx.values_list("id", flat=True).first()
        pharmacy_info = {
            "cleared": pharmacy_cleared,
            "reason": (
                "All prescriptions dispensed"
                if pharmacy_cleared
                else f"{pending_rx.count()} internal prescription(s) not yet dispensed"
            ),
            "pending_count": pending_rx.count(),
            "first_pending_id": first_rx_id,
        }

        # ----- Laboratory: all IN_HOUSE lab orders completed or cancelled -----
        # EXTERNAL lab referrals are processed outside the facility and should
        # not block inpatient discharge clearance.
        pending_labs = (
            LabOrder.objects.filter(q, order_type="IN_HOUSE")
            .exclude(status__in=["COMPLETED", "CANCELLED"])
            .distinct()
        )
        pending_test_names = list(
            pending_labs.values_list("items__test__name", flat=True).distinct()[:10]
        )
        lab_cleared = not pending_labs.exists()
        first_lab_order_number = pending_labs.values_list("order_number", flat=True).first()
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
            active_entries = kardex.care_plan_entries.filter(status__in=["ACTIVE", "ONGOING"])
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

        all_cleared = billing_cleared and pharmacy_cleared and lab_cleared and nursing_cleared

        return Response(
            {
                "billing": billing_info,
                "pharmacy": pharmacy_info,
                "laboratory": lab_info,
                "nursing": nursing_info,
                "all_cleared": all_cleared,
            }
        )

    @action(detail=True, methods=["get", "put", "delete"], url_path="discharge-draft")
    def discharge_draft(self, request, pk=None):  # noqa: ARG002
        """Manage persisted discharge draft for an admission."""
        admission = self.get_object()

        if request.method == "GET":
            draft = getattr(admission, "discharge_draft", None)
            if draft is None:
                return Response(status=status.HTTP_404_NOT_FOUND)
            return Response(DischargeDraftSerializer(draft).data)

        if request.method == "DELETE":
            draft = getattr(admission, "discharge_draft", None)
            if draft is None:
                return Response(status=status.HTTP_204_NO_CONTENT)
            draft.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        draft, _created = DischargeDraft.objects.get_or_create(
            admission=admission,
            defaults={"created_by": request.user, "updated_by": request.user},
        )
        serializer = DischargeDraftSerializer(draft, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)

        AuditLog.log(
            action="discharge_draft_save",
            user=request.user,
            resource_type="Admission",
            resource_id=admission.id,
            details={
                "admission_number": admission.admission_number,
                "discharge_type": serializer.validated_data.get(
                    "discharge_type", draft.discharge_type
                ),
            },
            ip_address=get_client_ip(request),
        )
        return Response(serializer.data, status=status.HTTP_200_OK)
