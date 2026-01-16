"""Django admin configuration for pharmacy models."""



from django.contrib import admin

from .models import (
    AlertSettings,
    Dispensing,
    Drug,
    Prescription,
    PrescriptionItem,
    StockAdjustment,
    StockAlert,
    StockBatch,
)


@admin.register(Drug)
class DrugAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'code',
        'generic_name',
        'brand_names',
        'category',
        'form',
        'strength',
        'unit',
        'schedule',
        'requires_prescription',
        'is_controlled',
        'is_narcotic',
        'keml_code',
        'is_essential',
        'nhif_code',
        'default_reorder_level',
        'default_reorder_quantity',
        'shelf_life_months',
        'storage_requirements',
        'reference_price',
        'is_active',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'requires_prescription',
        'is_controlled',
        'is_narcotic',
        'is_essential',
        'is_active',
        'created_at',
        'updated_at',
    )
    date_hierarchy = 'created_at'


@admin.register(StockBatch)
class StockBatchAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'drug',
        'batch_number',
        'barcode',
        'quantity_received',
        'quantity_available',
        'quantity_dispensed',
        'quantity_damaged',
        'quantity_expired',
        'manufacture_date',
        'expiry_date',
        'received_date',
        'cost_price',
        'selling_price',
        'supplier',
        'purchase_order',
        'received_by',
        'status',
        'location',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'drug',
        'manufacture_date',
        'expiry_date',
        'received_date',
        'received_by',
        'created_at',
        'updated_at',
    )
    date_hierarchy = 'created_at'


@admin.register(StockAlert)
class StockAlertAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'drug',
        'batch',
        'alert_type',
        'severity',
        'message',
        'is_acknowledged',
        'acknowledged_by',
        'acknowledged_at',
        'is_resolved',
        'resolved_by',
        'resolved_at',
        'resolution_notes',
        'created_at',
    )
    list_filter = (
        'drug',
        'batch',
        'is_acknowledged',
        'acknowledged_by',
        'acknowledged_at',
        'is_resolved',
        'resolved_by',
        'resolved_at',
        'created_at',
    )
    date_hierarchy = 'created_at'


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'encounter',
        'patient',
        'prescribed_by',
        'prescribed_at',
        'valid_until',
        'status',
        'clinical_notes',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'encounter',
        'patient',
        'prescribed_by',
        'prescribed_at',
        'valid_until',
        'created_at',
        'updated_at',
    )
    date_hierarchy = 'created_at'


@admin.register(PrescriptionItem)
class PrescriptionItemAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'prescription',
        'drug',
        'quantity',
        'dosage',
        'frequency',
        'duration',
        'route',
        'instructions',
        'quantity_dispensed',
        'is_substitutable',
        'is_cancelled',
        'cancellation_reason',
    )
    list_filter = (
        'prescription',
        'drug',
        'is_substitutable',
        'is_cancelled',
    )


@admin.register(Dispensing)
class DispensingAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'prescription_item',
        'patient',
        'drug',
        'batch',
        'quantity_dispensed',
        'quantity_returned',
        'unit_price',
        'total_price',
        'discount',
        'instructions_given',
        'patient_counseled',
        'dispensed_by',
        'dispensed_at',
        'verified_by',
        'verified_at',
        'notes',
        'created_at',
    )
    list_filter = (
        'prescription_item',
        'patient',
        'drug',
        'batch',
        'patient_counseled',
        'dispensed_by',
        'dispensed_at',
        'verified_by',
        'verified_at',
        'created_at',
    )
    date_hierarchy = 'created_at'


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'batch',
        'adjustment_type',
        'quantity',
        'reason',
        'reference_number',
        'adjusted_by',
        'adjusted_at',
        'requires_approval',
        'approved_by',
        'approved_at',
    )
    list_filter = (
        'batch',
        'adjusted_by',
        'adjusted_at',
        'requires_approval',
        'approved_by',
        'approved_at',
    )


@admin.register(AlertSettings)
class AlertSettingsAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'low_stock_threshold',
        'expiry_warning_days',
        'expiry_critical_days',
        'enable_email_notifications',
        'updated_by',
        'updated_at',
    )
    list_filter = (
        'enable_email_notifications',
        'updated_by',
        'updated_at',
    )
    readonly_fields = ('created_at', 'updated_at')

    def has_add_permission(self, request):
        # Only allow one instance
        return not AlertSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        # Don't allow deletion
        return False
