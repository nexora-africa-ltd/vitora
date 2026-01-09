"""
Serializers for Pharmacy app.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from hmis.apps.pharmacy.models import (
    Dispensing,
    Drug,
    Prescription,
    PrescriptionItem,
    StockAdjustment,
    StockAlert,
    StockBatch,
)

User = get_user_model()


class DrugSerializer(serializers.ModelSerializer):
    """Serializer for Drug model."""

    display_name = serializers.CharField(source="get_display_name", read_only=True)
    current_stock = serializers.IntegerField(source="get_current_stock", read_only=True)

    class Meta:
        model = Drug
        fields = [
            "id",
            "code",
            "generic_name",
            "brand_names",
            "strength",
            "form",
            "category",
            "unit",
            "schedule",
            "is_essential",
            "keml_code",
            "nhif_code",
            "requires_prescription",
            "is_controlled",
            "is_narcotic",
            "default_reorder_level",
            "default_reorder_quantity",
            "shelf_life_months",
            "storage_requirements",
            "reference_price",
            "is_active",
            "display_name",
            "current_stock",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "display_name", "current_stock"]


class StockBatchSerializer(serializers.ModelSerializer):
    """Serializer for StockBatch model."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    days_until_expiry = serializers.IntegerField(source="days_to_expiry", read_only=True)
    is_expired_status = serializers.BooleanField(source="is_expired", read_only=True)
    is_low_stock_status = serializers.BooleanField(source="is_low_stock", read_only=True)

    class Meta:
        model = StockBatch
        fields = [
            "id",
            "drug",
            "drug_name",
            "batch_number",
            "quantity_received",
            "quantity_available",
            "quantity_dispensed",
            "quantity_damaged",
            "quantity_expired",
            "expiry_date",
            "days_until_expiry",
            "is_expired_status",
            "is_low_stock_status",
            "status",
            "cost_price",
            "selling_price",
            "supplier",
            "purchase_order",
            "received_date",
            "received_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "quantity_dispensed",
            "quantity_damaged",
            "quantity_expired",
            "created_at",
            "updated_at",
            "drug_name",
            "days_until_expiry",
            "is_expired_status",
            "is_low_stock_status",
        ]


class StockAlertSerializer(serializers.ModelSerializer):
    """Serializer for StockAlert model."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True, allow_null=True)
    # Aliases for frontend compatibility
    acknowledged = serializers.BooleanField(source="is_acknowledged", read_only=True)
    resolved = serializers.BooleanField(source="is_resolved", read_only=True)

    class Meta:
        model = StockAlert
        fields = [
            "id",
            "drug",
            "drug_name",
            "batch_number",
            "alert_type",
            "severity",
            "message",
            "acknowledged",
            "is_acknowledged",
            "acknowledged_by",
            "acknowledged_at",
            "resolved",
            "is_resolved",
            "resolved_by",
            "resolved_at",
            "resolution_notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "drug_name", "batch_number", "acknowledged", "resolved"]


class PrescriptionItemSerializer(serializers.ModelSerializer):
    """Serializer for PrescriptionItem model."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    remaining_qty = serializers.IntegerField(source="remaining_quantity", read_only=True)
    # Alias for frontend compatibility
    quantity_prescribed = serializers.IntegerField(source="quantity", read_only=True)
    remaining_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "prescription",
            "drug",
            "drug_name",
            "quantity",
            "quantity_prescribed",
            "dosage",
            "frequency",
            "duration",
            "route",
            "instructions",
            "is_substitutable",
            "quantity_dispensed",
            "remaining_qty",
            "remaining_quantity",
            "is_cancelled",
            "cancellation_reason",
        ]
        read_only_fields = [
            "id",
            "quantity_dispensed",
            "drug_name",
            "remaining_qty",
            "remaining_quantity",
            "quantity_prescribed",
        ]


class PrescriptionItemWriteSerializer(serializers.Serializer):
    """Serializer for writing prescription items (nested in prescription create)."""

    drug = serializers.PrimaryKeyRelatedField(queryset=Drug.objects.all())
    # Accept both 'quantity' and 'quantity_prescribed' from frontend
    quantity_prescribed = serializers.IntegerField(min_value=1, required=False)
    quantity = serializers.IntegerField(min_value=1, required=False)
    dosage = serializers.CharField(max_length=100)
    frequency = serializers.CharField(max_length=100)
    duration = serializers.CharField(max_length=50)
    route = serializers.CharField(max_length=50, required=False, allow_blank=True)
    instructions = serializers.CharField(required=False, allow_blank=True)
    is_substitutable = serializers.BooleanField(default=True)

    def validate(self, data):
        """Ensure we have a quantity value."""
        # Accept either quantity_prescribed or quantity
        qty = data.get('quantity_prescribed') or data.get('quantity')
        if not qty or qty < 1:
            raise serializers.ValidationError({
                'quantity': 'Quantity must be at least 1'
            })
        # Normalize to 'quantity' for model
        data['quantity'] = qty
        data.pop('quantity_prescribed', None)
        return data


class PrescriptionSerializer(serializers.ModelSerializer):
    """Serializer for Prescription model."""

    items = PrescriptionItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    prescriber_name = serializers.SerializerMethodField()
    is_valid_prescription = serializers.SerializerMethodField()
    is_fully_dispensed_status = serializers.BooleanField(
        source="is_fully_dispensed", read_only=True
    )

    class Meta:
        model = Prescription
        fields = [
            "id",
            "prescription_number",
            "encounter",
            "patient",
            "patient_name",
            "patient_mrn",
            "prescribed_by",
            "prescriber_name",
            "prescribed_at",
            "valid_until",
            "status",
            "clinical_notes",
            "is_valid_prescription",
            "is_fully_dispensed_status",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "prescription_number",
            "prescribed_by",
            "status",
            "created_at",
            "updated_at",
            "patient_name",
            "patient_mrn",
            "prescriber_name",
            "is_valid_prescription",
            "is_fully_dispensed_status",
        ]

    def get_patient_name(self, obj):
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_prescriber_name(self, obj):
        """Get prescriber full name."""
        return obj.prescribed_by.get_full_name() or obj.prescribed_by.username

    def get_is_valid_prescription(self, obj):
        """Get prescription validity status."""
        return obj.is_valid()


class PrescriptionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating prescriptions with nested items."""

    items = PrescriptionItemWriteSerializer(many=True, write_only=True, required=False, default=list)

    class Meta:
        model = Prescription
        fields = [
            "id",
            "encounter",
            "patient",
            "valid_until",
            "clinical_notes",
            "items",
        ]

    def create(self, validated_data):
        """Create prescription with nested items."""
        items_data = validated_data.pop('items', [])
        prescription = Prescription.objects.create(**validated_data)

        for item_data in items_data:
            PrescriptionItem.objects.create(
                prescription=prescription,
                **item_data
            )

        return prescription


class DispensingSerializer(serializers.ModelSerializer):
    """Serializer for Dispensing model."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    patient_name = serializers.SerializerMethodField()
    dispensed_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True)

    class Meta:
        model = Dispensing
        fields = [
            "id",
            "prescription_item",
            "patient",
            "patient_name",
            "drug",
            "drug_name",
            "batch",
            "batch_number",
            "quantity_dispensed",
            "quantity_returned",
            "unit_price",
            "total_price",
            "discount",
            "instructions_given",
            "patient_counseled",
            "dispensed_by",
            "dispensed_by_name",
            "dispensed_at",
            "verified_by",
            "verified_by_name",
            "verified_at",
            "notes",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "quantity_returned",
            "dispensed_at",
            "verified_at",
            "created_at",
            "drug_name",
            "patient_name",
            "dispensed_by_name",
            "verified_by_name",
            "batch_number",
        ]

    def get_patient_name(self, obj):
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_dispensed_by_name(self, obj):
        """Get dispenser full name."""
        return obj.dispensed_by.get_full_name() or obj.dispensed_by.username

    def get_verified_by_name(self, obj):
        """Get verifier full name."""
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username
        return None


class StockAdjustmentSerializer(serializers.ModelSerializer):
    """Serializer for StockAdjustment model."""

    batch_number = serializers.CharField(source="batch.batch_number", read_only=True)
    drug_name = serializers.CharField(source="batch.drug.generic_name", read_only=True)
    adjusted_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockAdjustment
        fields = [
            "id",
            "batch",
            "batch_number",
            "drug_name",
            "adjustment_type",
            "quantity",
            "reason",
            "reference_number",
            "adjusted_by",
            "adjusted_by_name",
            "adjusted_at",
            "requires_approval",
            "approved_by",
            "approved_by_name",
            "approved_at",
        ]
        read_only_fields = [
            "id",
            "adjusted_at",
            "approved_at",
            "batch_number",
            "drug_name",
            "adjusted_by_name",
            "approved_by_name",
        ]

    def get_adjusted_by_name(self, obj):
        """Get adjuster full name."""
        return obj.adjusted_by.get_full_name() or obj.adjusted_by.username

    def get_approved_by_name(self, obj):
        """Get approver full name."""
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None
