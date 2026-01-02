from django.shortcuts import render

"""
Views for the billing app.

Following TDD - implemented to pass API tests.
"""

from decimal import Decimal
from datetime import date
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.models import (
    ServiceCategory, Service, Invoice, InvoiceItem,
    Payment, Receipt, CreditNote
)
from hmis.apps.billing.serializers import (
    ServiceCategorySerializer, ServiceSerializer,
    InvoiceSerializer, InvoiceItemSerializer,
    PaymentSerializer, ReceiptSerializer,
    CreditNoteSerializer
)


class ServiceCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ServiceCategory model.
    
    Provides CRUD operations for service categories.
    """
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['display_order', 'name', 'created_at']
    ordering = ['display_order']


class ServiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Service model.
    
    Provides CRUD operations for billable services with filtering.
    """
    queryset = Service.objects.select_related('category', 'created_by').all()
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active', 'is_taxable', 'sha_code']
    search_fields = ['name', 'code', 'description', 'sha_code']
    ordering_fields = ['name', 'unit_price', 'created_at']
    ordering = ['name']
    
    def perform_destroy(self, instance):
        """Soft delete - mark service as unavailable instead of deleting."""
        instance.is_active = False
        instance.save()


class InvoiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Invoice model.
    
    Provides CRUD operations for invoices with custom actions.
    """
    queryset = Invoice.objects.select_related(
        'patient', 'encounter', 'created_by', 'cancelled_by'
    ).prefetch_related('invoiceitem_set').all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'patient', 'encounter', 'payment_type']
    search_fields = ['invoice_number', 'patient__first_name', 'patient__last_name', 'patient__mrn']
    ordering_fields = ['invoice_date', 'due_date', 'total_amount', 'created_at']
    ordering = ['-invoice_date']
    
    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()
        
        # Filter by date range if provided
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if start_date:
            queryset = queryset.filter(invoice_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(invoice_date__lte=end_date)
        
        return queryset
    
    def update(self, request, *args, **kwargs):
        """Only allow updates to draft invoices."""
        instance = self.get_object()
        
        if instance.status != Invoice.Status.DRAFT:
            return Response(
                {'error': 'Only draft invoices can be modified'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().update(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """Finalize invoice (draft → pending)."""
        invoice = self.get_object()
        
        if invoice.status != Invoice.Status.DRAFT:
            return Response(
                {'error': 'Only draft invoices can be finalized'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if invoice has items
        if not invoice.invoiceitem_set.exists():
            return Response(
                {'error': 'Invoice must have at least one item'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Change status to pending
        invoice.status = Invoice.Status.PENDING
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel invoice with reason."""
        invoice = self.get_object()
        reason = request.data.get('reason')
        
        if not reason:
            return Response(
                {'error': 'Cancellation reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoice.cancel(request.user, reason)
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='apply-discount')
    def apply_discount(self, request, pk=None):
        """Apply discount to invoice."""
        invoice = self.get_object()
        
        discount_amount = request.data.get('discount_amount')
        discount_reason = request.data.get('discount_reason', '')
        
        if not discount_amount:
            return Response(
                {'error': 'Discount amount is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            discount_amount = Decimal(str(discount_amount))
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid discount amount'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoice.apply_discount(discount_amount, discount_reason)
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """List overdue invoices."""
        queryset = self.filter_queryset(self.get_queryset())
        queryset = queryset.filter(
            status=Invoice.Status.PENDING,
            due_date__lt=date.today()
        )
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get', 'post'])
    def items(self, request, pk=None):
        """List or add invoice items."""
        invoice = self.get_object()
        
        if request.method == 'GET':
            items = invoice.invoiceitem_set.all()
            serializer = InvoiceItemSerializer(items, many=True)
            return Response(serializer.data)
        
        # POST - Add item
        serializer = InvoiceItemSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(invoice=invoice)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['delete'], url_path='items/(?P<item_id>[^/.]+)')
    def remove_item(self, request, pk=None, item_id=None):
        """Remove an invoice item."""
        invoice = self.get_object()
        item = get_object_or_404(InvoiceItem, id=item_id, invoice=invoice)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PaymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Payment model.
    
    Provides operations for recording and managing payments.
    """
    queryset = Payment.objects.select_related('invoice', 'received_by').all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['method', 'status', 'invoice']
    search_fields = ['reference', 'mpesa_receipt_number', 'transaction_reference']
    ordering_fields = ['payment_date', 'amount', 'created_at']
    ordering = ['-payment_date']
    
    @action(detail=True, methods=['get'])
    def receipt(self, request, pk=None):
        """Get or generate receipt for payment."""
        payment = self.get_object()
        
        # Try to get existing receipt
        try:
            receipt = Receipt.objects.get(payment=payment)
        except Receipt.DoesNotExist:
            # Generate receipt
            receipt = Receipt.objects.create(
                payment=payment,
                invoice=payment.invoice,
                patient=payment.invoice.patient,
                amount=payment.amount,
                payment_method=payment.method,
                issued_by=request.user
            )
        
        serializer = ReceiptSerializer(receipt)
        return Response(serializer.data)


class CreditNoteViewSet(viewsets.ModelViewSet):
    """
    ViewSet for CreditNote model.
    
    Provides operations for credit notes with approval workflow.
    """
    queryset = CreditNote.objects.select_related(
        'invoice', 'patient', 'requested_by', 'approved_by'
    ).all()
    serializer_class = CreditNoteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'reason', 'invoice', 'patient']
    search_fields = ['credit_note_number', 'reason_detail']
    ordering_fields = ['created_at', 'approved_at']
    ordering = ['-created_at']
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve credit note."""
        credit_note = self.get_object()
        
        try:
            credit_note.approve(request.user)
            serializer = self.get_serializer(credit_note)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        """Process refund for approved credit note."""
        credit_note = self.get_object()
        
        refund_method = request.data.get('refund_method')
        refund_reference = request.data.get('refund_reference', '')
        
        if not refund_method:
            return Response(
                {'error': 'Refund method is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            credit_note.process_refund(refund_method, refund_reference)
            serializer = self.get_serializer(credit_note)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
