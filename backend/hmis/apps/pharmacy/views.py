"""
Views for Pharmacy app API endpoints.
"""

from datetime import date, timedelta

from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.pharmacy.models import (
    Dispensing,
    Drug,
    Prescription,
    PrescriptionItem,
    StockAdjustment,
    StockAlert,
    StockBatch,
)
from hmis.apps.pharmacy.serializers import (
    DispensingSerializer,
    DrugSerializer,
    PrescriptionCreateSerializer,
    PrescriptionSerializer,
    StockAdjustmentSerializer,
    StockAlertSerializer,
    StockBatchSerializer,
)
from hmis.apps.pharmacy.services import FEFODispenser, InsufficientStockError


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
    filterset_fields = ["form", "category", "schedule", "is_essential", "is_active"]
    ordering_fields = ["generic_name", "created_at"]
    ordering = ["generic_name"]


class StockBatchViewSet(viewsets.ModelViewSet):
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


class StockAlertViewSet(viewsets.ModelViewSet):
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


class PrescriptionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Prescription model.

    Endpoints:
    - GET /api/prescriptions/ - List prescriptions
    - GET /api/prescriptions/{id}/ - Get prescription details
    - POST /api/prescriptions/ - Create prescription with items
    - PATCH /api/prescriptions/{id}/ - Update prescription
    - POST /api/prescriptions/{id}/cancel/ - Cancel prescription
    """

    queryset = (
        Prescription.objects.select_related("patient", "encounter", "prescribed_by")
        .prefetch_related("items__drug")
        .all()
    )
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["patient", "status", "encounter"]
    ordering_fields = ["prescribed_at", "created_at"]
    ordering = ["-prescribed_at"]

    def get_serializer_class(self):
        """Use different serializer for create action."""
        if self.action == 'create':
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


class DispensingViewSet(viewsets.ModelViewSet):
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
    permission_classes = [IsAuthenticated]
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


class StockAdjustmentViewSet(viewsets.ModelViewSet):
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
                    "is_below_reorder": total_quantity < drug.default_reorder_level
                    if drug.default_reorder_level
                    else False,
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
                    "user": batch.received_by.get_full_name() or batch.received_by.username
                    if batch.received_by
                    else None,
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
