"""
Views for Pharmacy app API endpoints.
"""

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q

from hmis.apps.pharmacy.models import (
    Drug,
    StockBatch,
    StockAlert,
    Prescription,
    PrescriptionItem,
    Dispensing,
    StockAdjustment,
)
from hmis.apps.pharmacy.serializers import (
    DrugSerializer,
    StockBatchSerializer,
    StockAlertSerializer,
    PrescriptionSerializer,
    PrescriptionItemSerializer,
    DispensingSerializer,
    StockAdjustmentSerializer,
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
    filterset_fields = ["alert_type", "severity", "acknowledged", "resolved"]
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
        alerts = self.queryset.filter(alert_type="LOW_STOCK", resolved=False)
        serializer = self.get_serializer(alerts, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def expiring(self, request):
        """Get expiring stock alerts."""
        alerts = self.queryset.filter(
            alert_type__in=["EXPIRING_SOON", "EXPIRING_CRITICAL"],
            resolved=False,
        )
        serializer = self.get_serializer(alerts, many=True)
        return Response(serializer.data)


class PrescriptionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Prescription model.
    
    Endpoints:
    - GET /api/prescriptions/ - List prescriptions
    - GET /api/prescriptions/{id}/ - Get prescription details
    - POST /api/prescriptions/ - Create prescription
    - PATCH /api/prescriptions/{id}/ - Update prescription
    - POST /api/prescriptions/{id}/cancel/ - Cancel prescription
    """
    
    queryset = Prescription.objects.select_related(
        "patient", "encounter", "prescribed_by"
    ).prefetch_related("items__drug").all()
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["patient", "status", "encounter"]
    ordering_fields = ["prescribed_at", "created_at"]
    ordering = ["-prescribed_at"]

    def perform_create(self, serializer):
        """Set prescribed_by to current user when creating prescription."""
        serializer.save(prescribed_by=self.request.user)

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
            return Response(
                {"error": "Drug not found"}, status=status.HTTP_404_NOT_FOUND
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
            return Response(
                {"error": str(e)}, status=status.HTTP_400_BAD_REQUEST
            )
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
            return Response(
                {"error": str(e)}, status=status.HTTP_400_BAD_REQUEST
            )

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
            return Response(
                {"error": str(e)}, status=status.HTTP_400_BAD_REQUEST
            )


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
