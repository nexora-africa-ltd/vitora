"""
Views for Pharmacy app API endpoints.
"""

from datetime import date, timedelta

from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import RequiresActiveShiftPermission
from hmis.apps.pharmacy.models import (
    Dispensing,
    Drug,
    DrugCategory,
    Prescription,
    StockAdjustment,
    StockAlert,
    StockBatch,
)
from hmis.apps.pharmacy.serializers import (
    DispensingSerializer,
    DrugCategorySerializer,
    DrugSerializer,
    PrescriptionCreateSerializer,
    PrescriptionSerializer,
    StockAdjustmentSerializer,
    StockAlertSerializer,
    StockBatchSerializer,
)
from hmis.apps.pharmacy.services import FEFODispenser, InsufficientStockError


class DrugCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for DrugCategory registry."""

    queryset = DrugCategory.objects.all()
    serializer_class = DrugCategorySerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            return queryset.filter(is_active=True)
        return queryset


class DrugViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Drug model.

    Endpoints:
    - GET /api/pharmacy/drugs/ - List drugs with search and filtering
    - GET /api/pharmacy/drugs/{id}/ - Get drug details
    - POST /api/pharmacy/drugs/ - Create drug (admin only)
    - PATCH /api/pharmacy/drugs/{id}/ - Update drug (admin only)
    - DELETE /api/pharmacy/drugs/{id}/ - Delete drug (admin only)
    """

    queryset = Drug.objects.all()
    serializer_class = DrugSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["generic_name", "brand_names", "code"]
    filterset_fields = ["form", "schedule", "is_essential", "is_active"]
    ordering_fields = ["generic_name", "created_at"]
    ordering = ["generic_name"]

    def get_queryset(self):
        """Filter by category if provided (searches within categories array)."""
        from django.db.models import CharField, Q, Value
        from django.db.models.functions import Cast

        queryset = super().get_queryset()
        category = self.request.query_params.get("category")
        if category:
            # For SQLite compatibility, check if category appears in JSON string
            # This works because JSONField stores as text in SQLite
            queryset = queryset.filter(Q(categories__icontains=f'"{category}"'))
        return queryset

    @action(detail=False, methods=["get"], url_path="hpt-search")
    def hpt_search(self, request):
        """
        Search DHA HPT Registry for drug products.

        Delegates to TerminologyService.search_drug_products().
        GET /api/pharmacy/drugs/hpt-search/?q=Metformin
        """
        from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService

        query = request.query_params.get("q", "").strip()
        if not query:
            return Response(
                {"error": "q parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product_id = request.query_params.get("product_id")
        generic_concept_id = request.query_params.get("generic_concept_id")

        try:
            service = TerminologyService()
            results = service.search_drug_products(
                query,
                product_id=int(product_id) if product_id else None,
                generic_concept_id=int(generic_concept_id) if generic_concept_id else None,
            )
            return Response({
                "count": len(results),
                "results": [
                    {
                        "product_id": r.product_id,
                        "brand_name": r.brand_name,
                        "generic_name": r.generic_name,
                        "brand_display_name": r.brand_display_name,
                        "generic_display_name": r.generic_display_name,
                        "generic_concept_id": r.generic_concept_id,
                        "strength_amount": r.strength_amount,
                        "strength_unit": r.strength_unit,
                        "route_description": r.route_description,
                        "form_description": r.form_description,
                        "ppb_registration_code": r.ppb_registration_code,
                        "knhts_concept_id": r.knhts_concept_id,
                    }
                    for r in results
                ],
            })
        except TerminologyError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=["post"], url_path="map-hpt")
    def map_hpt(self, request, pk=None):
        """
        Map a specific drug to an HPT code.

        POST /api/pharmacy/drugs/{id}/map-hpt/
        Body: { "hpt_code": "10-03913-01", "hpt_product_id": 4855, "ppb_code": "77" }
        """
        from django.utils import timezone

        drug = self.get_object()
        hpt_code = request.data.get("hpt_code", "").strip()
        hpt_product_id = request.data.get("hpt_product_id")
        ppb_code = request.data.get("ppb_code", "").strip()

        if not hpt_code:
            return Response(
                {"error": "hpt_code is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        drug.hpt_code = hpt_code
        if hpt_product_id is not None:
            drug.hpt_product_id = int(hpt_product_id)
        if ppb_code:
            drug.ppb_code = ppb_code
        drug.hpt_last_synced = timezone.now()
        drug.save(update_fields=["hpt_code", "hpt_product_id", "ppb_code", "hpt_last_synced"])

        serializer = self.get_serializer(drug)
        return Response(serializer.data)


class StockBatchViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for StockBatch model.

    Endpoints:
    - GET /api/pharmacy/stock/ - List all stock batches
    - GET /api/pharmacy/stock/{id}/ - Get batch details
    - POST /api/pharmacy/stock/ - Receive new stock
    - PATCH /api/pharmacy/stock/{id}/ - Update batch
    """

    queryset = StockBatch.objects.select_related("drug", "received_by").all()
    serializer_class = StockBatchSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["drug", "status"]
    ordering_fields = ["expiry_date", "received_date", "created_at"]
    ordering = ["expiry_date"]

    def perform_create(self, serializer):
        """Set received_by to current user when creating new stock."""
        serializer.save(received_by=self.request.user)

    @action(detail=False, methods=["get"])
    def by_drug(self, request):
        """Get stock batches for a specific drug."""
        drug_id = request.query_params.get("drug_id")
        if not drug_id:
            return Response(
                {"error": "drug_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batches = self.queryset.filter(drug_id=drug_id)
        serializer = self.get_serializer(batches, many=True)
        return Response(serializer.data)


class StockAlertViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for StockAlert model.

    Endpoints:
    - GET /api/pharmacy/alerts/ - List alerts
    - GET /api/pharmacy/alerts/{id}/ - Get alert details
    - POST /api/pharmacy/alerts/{id}/acknowledge/ - Acknowledge alert
    - POST /api/pharmacy/alerts/{id}/resolve/ - Resolve alert
    """

    queryset = StockAlert.objects.select_related("drug").all()
    serializer_class = StockAlertSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["alert_type", "severity", "is_acknowledged", "is_resolved"]
    ordering_fields = ["created_at", "severity"]
    ordering = ["-created_at"]

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Acknowledge an alert."""
        alert = self.get_object()
        alert.acknowledge(request.user)
        serializer = self.get_serializer(alert)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Resolve an alert."""
        alert = self.get_object()
        notes = request.data.get("notes", "")
        alert.resolve(request.user, notes)
        serializer = self.get_serializer(alert)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        """Get low stock alerts."""
        alerts = self.queryset.filter(alert_type="LOW_STOCK", is_resolved=False)
        serializer = self.get_serializer(alerts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def expiring(self, request):
        """Get expiring stock alerts."""
        alerts = self.queryset.filter(
            alert_type__in=["EXPIRING_SOON", "EXPIRING_CRITICAL"],
            is_resolved=False,
        )
        serializer = self.get_serializer(alerts, many=True)
        return Response(serializer.data)


class PrescriptionViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Prescription model.

    Endpoints:
    - GET /api/prescriptions/ - List prescriptions
    - GET /api/prescriptions/{id}/ - Get prescription details
    - POST /api/prescriptions/ - Create prescription with items
    - PATCH /api/prescriptions/{id}/ - Update prescription
    - POST /api/prescriptions/{id}/cancel/ - Cancel prescription
    """

    tenant_scope = "facility"  # Prescriptions are facility-scoped

    queryset = (
        Prescription.objects.select_related("patient", "encounter", "prescribed_by")
        .prefetch_related("items__drug")
        .all()
    )
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "status", "encounter", "admission", "dispensing_type", "is_discharge_medication"]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "prescribed_by__first_name",
        "prescribed_by__last_name",
    ]
    ordering_fields = ["prescribed_at", "created_at"]
    ordering = ["-prescribed_at"]

    def get_serializer_class(self):
        """Use different serializer for create action."""
        if self.action == "create":
            return PrescriptionCreateSerializer
        return PrescriptionSerializer

    def perform_create(self, serializer):
        """Set prescribed_by to current user when creating prescription."""
        serializer.save(prescribed_by=self.request.user)

    def create(self, request, *args, **kwargs):
        """Create prescription and return with full details."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        # Return full prescription with items using read serializer
        prescription = serializer.instance
        read_serializer = PrescriptionSerializer(prescription)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a prescription."""
        prescription = self.get_object()
        reason = request.data.get("reason", "Cancelled by user")
        prescription.cancel(reason)
        serializer = self.get_serializer(prescription)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_patient(self, request):
        """Get prescriptions for a specific patient."""
        patient_id = request.query_params.get("patient_id")
        if not patient_id:
            return Response(
                {"error": "patient_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prescriptions = self.queryset.filter(patient_id=patient_id)
        serializer = self.get_serializer(prescriptions, many=True)
        return Response(serializer.data)


class DispensingViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Dispensing model.

    Endpoints:
    - GET /api/dispensings/ - List dispensings
    - GET /api/dispensings/{id}/ - Get dispensing details
    - POST /api/dispensings/ - Create dispensing (manual)
    - POST /api/dispensings/dispense/ - Dispense using FEFO
    - POST /api/dispensings/{id}/return/ - Process return
    - POST /api/dispensings/{id}/verify/ - Verify controlled drug
    """

    queryset = Dispensing.objects.select_related(
        "patient", "drug", "batch", "dispensed_by", "verified_by"
    ).all()
    serializer_class = DispensingSerializer
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["patient", "drug", "prescription_item"]
    ordering_fields = ["dispensed_at", "created_at"]
    ordering = ["-dispensed_at"]

    def perform_create(self, serializer):
        """Set dispensed_by to current user when creating dispensing."""
        serializer.save(dispensed_by=self.request.user)

    @action(detail=False, methods=["post"])
    def dispense(self, request):
        """
        Dispense drug using FEFO logic.

        Expected payload:
        {
            "drug_id": 1,
            "quantity": 30,
            "patient_id": 1,
            "prescription_item_id": 1  # optional
        }
        """
        drug_id = request.data.get("drug_id")
        quantity = request.data.get("quantity")
        patient_id = request.data.get("patient_id")
        prescription_item_id = request.data.get("prescription_item_id")

        if not drug_id or not quantity or not patient_id:
            return Response(
                {"error": "drug_id, quantity, and patient_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            drug = Drug.objects.get(id=drug_id)
        except Drug.DoesNotExist:
            return Response({"error": "Drug not found"}, status=status.HTTP_404_NOT_FOUND)

        # Guard: reject dispensing against an expired prescription
        if prescription_item_id:
            try:
                from hmis.apps.pharmacy.models import PrescriptionItem

                rx_item = PrescriptionItem.objects.select_related("prescription").get(
                    id=prescription_item_id
                )
                if not rx_item.prescription.is_valid():
                    return Response(
                        {
                            "error": (
                                f"Prescription {rx_item.prescription.prescription_number} "
                                f"expired on {rx_item.prescription.valid_until}. "
                                "Dispensing is not allowed."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            except PrescriptionItem.DoesNotExist:
                return Response(
                    {"error": "Prescription item not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        try:
            # Use FEFO service to dispense
            kwargs = {"patient_id": patient_id}
            if prescription_item_id:
                kwargs["prescription_item_id"] = prescription_item_id

            dispensings = FEFODispenser.dispense(
                drug=drug,
                quantity=int(quantity),
                dispensed_by=request.user,
                **kwargs,
            )

            serializer = self.get_serializer(dispensings, many=True)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except InsufficientStockError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"Dispensing failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def return_stock(self, request, pk=None):
        """Process drug return."""
        dispensing = self.get_object()
        quantity = request.data.get("quantity")
        reason = request.data.get("reason", "Return")

        if not quantity:
            return Response(
                {"error": "quantity is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            dispensing.process_return(int(quantity), reason)
            serializer = self.get_serializer(dispensing)
            return Response(serializer.data)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        """Verify controlled drug dispensing."""
        dispensing = self.get_object()

        if not dispensing.requires_verification():
            return Response(
                {"error": "This dispensing does not require verification"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            dispensing.verify(request.user)
            serializer = self.get_serializer(dispensing)
            return Response(serializer.data)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class StockAdjustmentViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for StockAdjustment model.

    Endpoints:
    - GET /api/pharmacy/adjustments/ - List adjustments
    - GET /api/pharmacy/adjustments/{id}/ - Get adjustment details
    - POST /api/pharmacy/adjustments/ - Create adjustment
    """

    queryset = StockAdjustment.objects.select_related(
        "batch__drug", "adjusted_by", "approved_by"
    ).all()
    serializer_class = StockAdjustmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["batch", "adjustment_type", "requires_approval"]
    ordering_fields = ["adjusted_at", "created_at"]
    ordering = ["-adjusted_at"]
    tenant_facility_chain = "batch__facility"
    tenant_org_chain = "batch__organization"

    def perform_create(self, serializer):
        """Set adjusted_by to current user when creating adjustment."""
        serializer.save(adjusted_by=self.request.user)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve an adjustment."""
        adjustment = self.get_object()

        if not adjustment.requires_approval:
            return Response(
                {"error": "This adjustment does not require approval"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if adjustment.approved_by:
            return Response(
                {"error": "This adjustment has already been approved"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        adjustment.approve(request.user)
        serializer = self.get_serializer(adjustment)
        return Response(serializer.data)


# Report Views


class StockSummaryReportView(APIView):
    """
    Stock summary report showing current inventory levels.

    GET /api/pharmacy/reports/stock-summary/
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get stock summary for all drugs."""
        # Get all drugs with their stock batches
        drugs_with_stock = Drug.objects.filter(is_active=True).prefetch_related("batches")

        results = []
        for drug in drugs_with_stock:
            # Calculate total available quantity across all batches
            batches = drug.batches.filter(status="AVAILABLE")
            total_quantity = batches.aggregate(total=Sum("quantity_available"))["total"] or 0

            batch_details = []
            for batch in batches:
                batch_details.append(
                    {
                        "batch_number": batch.batch_number,
                        "quantity_available": batch.quantity_available,
                        "expiry_date": batch.expiry_date,
                        "days_to_expiry": batch.days_to_expiry(),
                    }
                )

            results.append(
                {
                    "drug_id": drug.id,
                    "drug_name": drug.get_display_name(),
                    "total_quantity": total_quantity,
                    "reorder_level": drug.default_reorder_level,
                    "is_below_reorder": (
                        total_quantity < drug.default_reorder_level
                        if drug.default_reorder_level
                        else False
                    ),
                    "batches": batch_details,
                }
            )

        return Response({"results": results})


class ExpiryReportView(APIView):
    """
    Expiry report showing batches expiring soon.

    GET /api/pharmacy/reports/expiry-report/?days=90
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "days", OpenApiTypes.INT, description="Days threshold (default 90)", required=False
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get batches expiring within specified days (default 90)."""
        days = int(request.query_params.get("days", 90))
        expiry_threshold = date.today() + timedelta(days=days)

        # Get batches expiring within threshold
        batches = (
            StockBatch.objects.filter(
                expiry_date__lte=expiry_threshold, expiry_date__gte=date.today(), status="AVAILABLE"
            )
            .select_related("drug")
            .order_by("expiry_date")
        )

        results = []
        for batch in batches:
            results.append(
                {
                    "batch_id": batch.id,
                    "drug_name": batch.drug.get_display_name(),
                    "batch_number": batch.batch_number,
                    "expiry_date": batch.expiry_date,
                    "days_to_expiry": batch.days_to_expiry(),
                    "quantity_available": batch.quantity_available,
                    "status": batch.status,
                }
            )

        return Response({"results": results})


class DispensingReportView(APIView):
    """
    Dispensing report showing drugs dispensed.

    GET /api/pharmacy/reports/dispensing/?start_date=2025-01-01&end_date=2025-01-31
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                description="Start date (YYYY-MM-DD)",
                required=False,
            ),
            OpenApiParameter(
                "end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=False
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get dispensing records with optional date range filtering."""
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        dispensings = Dispensing.objects.select_related("drug", "patient", "batch", "dispensed_by")

        if start_date:
            dispensings = dispensings.filter(dispensed_at__date__gte=start_date)
        if end_date:
            dispensings = dispensings.filter(dispensed_at__date__lte=end_date)

        dispensings = dispensings.order_by("-dispensed_at")

        results = []
        for dispensing in dispensings:
            results.append(
                {
                    "dispensing_id": dispensing.id,
                    "drug_name": dispensing.drug.get_display_name(),
                    "quantity_dispensed": dispensing.quantity_dispensed,
                    "dispensed_date": dispensing.dispensed_at.date(),
                    "patient_name": f"{dispensing.patient.first_name} {dispensing.patient.last_name}",
                    "dispensed_by": dispensing.dispensed_by.get_full_name()
                    or dispensing.dispensed_by.username,
                    "batch_number": dispensing.batch.batch_number,
                    "total_cost": dispensing.calculate_total(),
                }
            )

        return Response({"results": results})


class StockMovementReportView(APIView):
    """
    Stock movement report showing all inventory transactions.

    GET /api/pharmacy/reports/movement/?start_date=2025-01-01&end_date=2025-01-31
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "start_date",
                OpenApiTypes.DATE,
                description="Start date (YYYY-MM-DD)",
                required=False,
            ),
            OpenApiParameter(
                "end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=False
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get stock movements (received, dispensed, adjusted)."""
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        movements = []

        # Get stock receipts (batches received)
        batches = StockBatch.objects.select_related("drug", "received_by")
        if start_date:
            batches = batches.filter(received_date__gte=start_date)
        if end_date:
            batches = batches.filter(received_date__lte=end_date)

        for batch in batches:
            movements.append(
                {
                    "drug_name": batch.drug.get_display_name(),
                    "movement_type": "RECEIVED",
                    "quantity": batch.quantity_received,
                    "date": batch.received_date,
                    "reference": f"Batch {batch.batch_number}",
                    "user": (
                        batch.received_by.get_full_name() or batch.received_by.username
                        if batch.received_by
                        else None
                    ),
                }
            )

        # Get dispensings
        dispensings = Dispensing.objects.select_related("drug", "dispensed_by")
        if start_date:
            dispensings = dispensings.filter(dispensed_at__date__gte=start_date)
        if end_date:
            dispensings = dispensings.filter(dispensed_at__date__lte=end_date)

        for dispensing in dispensings:
            movements.append(
                {
                    "drug_name": dispensing.drug.get_display_name(),
                    "movement_type": "DISPENSED",
                    "quantity": -dispensing.quantity_dispensed,  # Negative for dispensing
                    "date": dispensing.dispensed_at.date(),
                    "reference": f"Dispensing #{dispensing.id}",
                    "user": dispensing.dispensed_by.get_full_name()
                    or dispensing.dispensed_by.username,
                }
            )

        # Get inpatient consumable usages
        from hmis.apps.inpatient.models import InpatientConsumableUsage

        consumable_usages = InpatientConsumableUsage.objects.select_related(
            "drug", "admission", "used_by"
        ).filter(is_reversed=False)
        if start_date:
            consumable_usages = consumable_usages.filter(used_at__date__gte=start_date)
        if end_date:
            consumable_usages = consumable_usages.filter(used_at__date__lte=end_date)

        for usage in consumable_usages:
            movements.append(
                {
                    "drug_name": usage.drug.get_display_name(),
                    "movement_type": "INPATIENT_CONSUMED",
                    "quantity": -usage.quantity_used,
                    "date": usage.used_at.date(),
                    "reference": (
                        f"Admission {usage.admission.admission_number} - Usage #{usage.id}"
                    ),
                    "user": usage.used_by.get_full_name() or usage.used_by.username,
                }
            )

        # Get adjustments
        adjustments = StockAdjustment.objects.select_related("batch__drug", "adjusted_by")
        if start_date:
            adjustments = adjustments.filter(adjustment_date__gte=start_date)
        if end_date:
            adjustments = adjustments.filter(adjustment_date__lte=end_date)

        for adjustment in adjustments:
            movements.append(
                {
                    "drug_name": adjustment.batch.drug.get_display_name(),
                    "movement_type": "ADJUSTED",
                    "quantity": adjustment.quantity_change,
                    "date": adjustment.adjustment_date,
                    "reference": f"{adjustment.get_adjustment_type_display()} - {adjustment.reason}",
                    "user": adjustment.adjusted_by.get_full_name()
                    or adjustment.adjusted_by.username,
                }
            )

        # Sort by date descending
        movements.sort(key=lambda x: x["date"], reverse=True)

        return Response({"results": movements})


class AlertSettingsView(APIView):
    """
    API view for alert settings configuration.

    GET - Retrieve current alert settings
    PUT/PATCH - Update alert settings
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get current alert settings."""
        from hmis.apps.pharmacy.models import AlertSettings
        from hmis.apps.pharmacy.serializers import AlertSettingsSerializer

        settings = AlertSettings.get_settings()
        serializer = AlertSettingsSerializer(settings)
        return Response(serializer.data)

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT},
    )
    def put(self, request):
        """Update alert settings (full update)."""
        return self._update(request, partial=False)

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT},
    )
    def patch(self, request):
        """Update alert settings (partial update)."""
        return self._update(request, partial=True)

    def _update(self, request, partial=False):
        """Internal method to handle updates."""
        from hmis.apps.pharmacy.models import AlertSettings
        from hmis.apps.pharmacy.serializers import AlertSettingsSerializer

        settings = AlertSettings.get_settings()
        serializer = AlertSettingsSerializer(settings, data=request.data, partial=partial)

        if serializer.is_valid():
            serializer.save(updated_by=request.user)
            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
