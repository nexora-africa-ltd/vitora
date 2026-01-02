"""
Serializers for the billing app.

Following TDD - implemented to pass API tests.
"""

from decimal import Decimal
from rest_framework import serializers

from hmis.apps.billing.models import (
    ServiceCategory, Service, Invoice, InvoiceItem,
    Payment, Receipt, CreditNote
)


class ServiceCategorySerializer(serializers.ModelSerializer):
    """Serializer for ServiceCategory model."""
    
    class Meta:
        model = ServiceCategory
        fields = [
            'id',
            'code',
            'name',
            'description',
            'display_order',
            'is_active',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ServiceSerializer(serializers.ModelSerializer):
    """Serializer for Service model."""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    is_available = serializers.SerializerMethodField()
    
    class Meta:
        model = Service
        fields = [
            'id',
            'code',
            'name',
            'description',
            'category',
            'category_name',
            'unit_price',
            'sha_code',
            'icd10_code',
            'is_taxable',
            'requires_quantity',
            'is_active',
            'is_available',
            'created_by',
            'created_by_username',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_by_username', 'is_available', 'created_at', 'updated_at']
    
    def get_is_available(self, obj):
        """Return is_available status from method."""
        return obj.is_available()
    
    def create(self, validated_data):
        # Set created_by from request user
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class InvoiceItemSerializer(serializers.ModelSerializer):
    """Serializer for InvoiceItem model."""
    
    service_name = serializers.CharField(source='service.name', read_only=True, allow_null=True)
    
    class Meta:
        model = InvoiceItem
        fields = [
            'id',
            'invoice',
            'service',
            'service_name',
            'description',
            'quantity',
            'unit_price',
            'discount_amount',
            'line_total',
            'is_covered_by_insurance',
            'insurance_approved_amount',
            'sha_code',
            'created_at'
        ]
        read_only_fields = ['id', 'invoice', 'line_total', 'created_at']


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer for Invoice model."""
    
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)
    balance = serializers.SerializerMethodField()
    
    class Meta:
        model = Invoice
        fields = [
            'id',
            'invoice_number',
            'patient',
            'patient_name',
            'encounter',
            'invoice_date',
            'due_date',
            'status',
            'payment_type',
            'subtotal',
            'discount_amount',
            'discount_reason',
            'tax_amount',
            'total_amount',
            'amount_paid',
            'balance',
            'insurance_provider',
            'sha_claim_number',
            'sha_claim_amount',
            'notes',
            'cancellation_reason',
            'cancelled_by',
            'cancelled_at',
            'created_by',
            'created_by_username',
            'items',
            'created_at',
            'updated_at'
        ]
        read_only_fields = [
            'id',
            'invoice_number',
            'subtotal',
            'tax_amount',
            'total_amount',
            'amount_paid',
            'balance',
            'cancelled_by',
            'cancelled_at',
            'created_by',
            'created_by_username',
            'items',
            'created_at',
            'updated_at'
        ]
    
    def get_balance(self, obj):
        """Calculate balance dynamically."""
        return obj.total_amount - obj.amount_paid
    
    def create(self, validated_data):
        # Set created_by from request user
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for Payment model."""
    
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    received_by_username = serializers.CharField(source='received_by.username', read_only=True)
    
    class Meta:
        model = Payment
        fields = [
            'id',
            'payment_reference',
            'invoice',
            'invoice_number',
            'method',
            'amount',
            'status',
            'mpesa_receipt_number',
            'mpesa_transaction_id',
            'mpesa_phone_number',
            'transaction_reference',
            'notes',
            'received_by',
            'received_by_username',
            'payment_date',
            'created_at',
            'updated_at'
        ]
        read_only_fields = [
            'id',
            'payment_reference',
            'status',
            'received_by',
            'received_by_username',
            'payment_date',
            'created_at',
            'updated_at'
        ]
    
    def create(self, validated_data):
        # Set received_by from request user
        validated_data['received_by'] = self.context['request'].user
        # Create payment and process it
        payment = super().create(validated_data)
        payment.process()
        return payment


class ReceiptSerializer(serializers.ModelSerializer):
    """Serializer for Receipt model."""
    
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    issued_by_username = serializers.CharField(source='issued_by.username', read_only=True)
    
    class Meta:
        model = Receipt
        fields = [
            'id',
            'receipt_number',
            'payment',
            'invoice',
            'patient',
            'patient_name',
            'amount',
            'amount_in_words',
            'payment_method',
            'facility_name',
            'facility_address',
            'facility_kra_pin',
            'is_voided',
            'voided_at',
            'void_reason',
            'issued_by',
            'issued_by_username',
            'created_at'
        ]
        read_only_fields = [
            'id',
            'receipt_number',
            'amount_in_words',
            'is_voided',
            'voided_at',
            'void_reason',
            'issued_by',
            'issued_by_username',
            'created_at'
        ]


class CreditNoteSerializer(serializers.ModelSerializer):
    """Serializer for CreditNote model."""
    
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    requested_by_username = serializers.CharField(source='requested_by.username', read_only=True)
    approved_by_username = serializers.CharField(source='approved_by.username', read_only=True, allow_null=True)
    
    class Meta:
        model = CreditNote
        fields = [
            'id',
            'credit_note_number',
            'invoice',
            'invoice_number',
            'patient',
            'patient_name',
            'amount',
            'reason',
            'reason_detail',
            'status',
            'refund_method',
            'refund_reference',
            'requested_by',
            'requested_by_username',
            'approved_by',
            'approved_by_username',
            'approved_at',
            'refunded_at',
            'created_at',
            'updated_at'
        ]
        read_only_fields = [
            'id',
            'credit_note_number',
            'status',
            'approved_by',
            'approved_by_username',
            'approved_at',
            'refunded_at',
            'requested_by',
            'requested_by_username',
            'created_at',
            'updated_at'
        ]
    
    def create(self, validated_data):
        # Set requested_by from request user
        validated_data['requested_by'] = self.context['request'].user
        return super().create(validated_data)
