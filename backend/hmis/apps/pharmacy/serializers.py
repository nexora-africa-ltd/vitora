"""
Serializers for Pharmacy app.
"""


import re
from typing import Optional

from django.apps import apps
from django.contrib.auth import get_user_model
from rest_framework import serializers

from hmis.apps.core.qr_utils import generate_document_signature, get_verification_base_url
from hmis.apps.encounters.models import Encounter
from hmis.apps.pharmacy.models import (
    AlertSettings,
    Dispensing,
    Drug,
    Prescription,
    PrescriptionItem,
    StockAdjustment,
    StockAlert,
    StockBatch,
)

User = get_user_model()


def _normalize_category_code(value: str) -> str:
    code = re.sub(r"[^A-Za-z0-9]+", "_", value.strip()).strip("_")
    return code.upper()[:50]


class DrugCategorySerializer(serializers.ModelSerializer):
    """Serializer for DrugCategory registry."""

    value = serializers.CharField(source="code", read_only=True)
    label = serializers.CharField(source="name", read_only=True)

    class Meta:
        model = apps.get_model("pharmacy", "DrugCategory")
        fields = ["id", "code", "name", "value", "label", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "value", "label", "created_at", "updated_at"]
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
            "is_active": {"required": False},
        }

    def validate_code(self, value: str) -> str:
        if not value:
            return value
        normalized = _normalize_category_code(value)
        if value != normalized:
            raise serializers.ValidationError(
                f"Invalid code format. Suggested code: '{normalized}'"
            )
        return value

    def create(self, validated_data):
        # If code not provided, generate from name
        if not validated_data.get("code"):
            validated_data["code"] = _normalize_category_code(validated_data["name"])
        return super().create(validated_data)


class DrugSerializer(serializers.ModelSerializer):
    """Serializer for Drug model."""

    display_name = serializers.CharField(source="get_display_name", read_only=True)
    current_stock = serializers.IntegerField(source="get_current_stock", read_only=True)
    # Backward compatibility: expose both 'category' (primary) and 'categories' (all)
    category = serializers.SerializerMethodField()

    class Meta:
        model = Drug
        fields = [
            "id",
            "code",
            "generic_name",
            "brand_names",
            "strength",
            "form",
            "category",  # Primary category (backward compatible)
            "categories",  # All categories (new)
            "unit",
            "schedule",
            "is_essential",
            "keml_code",
            "nhif_code",
            "hpt_code",
            "hpt_product_id",
            "hpt_last_synced",
            "ppb_code",
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

    def get_category(self, obj) -> str:
        """Return primary (first) category for backward compatibility."""
        return obj.categories[0] if obj.categories else None

    def validate(self, attrs):
        """Map legacy `category` to `categories` and validate against registry."""
        # Backward compat: allow `category` on create/update
        if "categories" not in attrs or not attrs.get("categories"):
            category = self.initial_data.get("category")
            if category:
                attrs["categories"] = [category] if isinstance(category, str) else list(category)

        categories = attrs.get("categories")
        if categories:
            DrugCategory = apps.get_model("pharmacy", "DrugCategory")
            existing = set(
                DrugCategory.objects.filter(is_active=True, code__in=categories).values_list(
                    "code", flat=True
                )
            )
            missing = [c for c in categories if c not in existing]
            if missing:
                raise serializers.ValidationError(
                    {"categories": f"Unknown categories: {', '.join(missing)}"}
                )

        return attrs

    def create(self, validated_data):
        """Handle both 'category' (single) and 'categories' (list) on create."""
        return super().create(validated_data)

    def update(self, instance, validated_data):
        """Handle both 'category' (single) and 'categories' (list) on update."""
        return super().update(instance, validated_data)


class StockBatchSerializer(serializers.ModelSerializer):
    """Serializer for StockBatch model."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    # Aliases with _status suffix (legacy)
    days_until_expiry = serializers.IntegerField(source="days_to_expiry", read_only=True)
    is_expired_status = serializers.BooleanField(source="is_expired", read_only=True)
    is_low_stock_status = serializers.BooleanField(source="is_low_stock", read_only=True)
    # Direct aliases for frontend compatibility
    days_to_expiry = serializers.IntegerField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    # Decimal fields - return as numbers, not strings
    cost_price = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    selling_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, coerce_to_string=False
    )

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
            "days_to_expiry",
            "is_expired_status",
            "is_expired",
            "is_low_stock_status",
            "is_low_stock",
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
            "quantity_available",  # Auto-set from quantity_received on create
            "quantity_dispensed",
            "quantity_damaged",
            "quantity_expired",
            "created_at",
            "updated_at",
            "drug_name",
            "days_until_expiry",
            "days_to_expiry",
            "is_expired_status",
            "is_expired",
            "is_low_stock_status",
            "is_low_stock",
        ]

    def create(self, validated_data):
        """Auto-set quantity_available to quantity_received on create."""
        validated_data["quantity_available"] = validated_data["quantity_received"]
        return super().create(validated_data)


class StockAlertSerializer(serializers.ModelSerializer):
    """Serializer for StockAlert model."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    batch_number = serializers.CharField(
        source="batch.batch_number", read_only=True, allow_null=True
    )
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
        read_only_fields = [
            "id",
            "created_at",
            "drug_name",
            "batch_number",
            "acknowledged",
            "resolved",
        ]


class PrescriptionItemSerializer(serializers.ModelSerializer):
    """Serializer for PrescriptionItem model."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    drug_code = serializers.CharField(source="drug.code", read_only=True)
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
            "drug_code",
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
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "quantity_dispensed",
            "drug_name",
            "drug_code",
            "remaining_qty",
            "remaining_quantity",
            "quantity_prescribed",
            "created_at",
            "updated_at",
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
        qty = data.get("quantity_prescribed") or data.get("quantity")
        if not qty or qty < 1:
            raise serializers.ValidationError({"quantity": "Quantity must be at least 1"})
        # Normalize to 'quantity' for model
        data["quantity"] = qty
        data.pop("quantity_prescribed", None)
        return data


class PrescriptionSerializer(serializers.ModelSerializer):
    """Serializer for Prescription model."""

    items = PrescriptionItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    # Alias for frontend compatibility (prescribed_by -> prescriber)
    prescriber = serializers.IntegerField(source="prescribed_by.id", read_only=True)
    prescriber_name = serializers.SerializerMethodField()
    prescribed_date = serializers.SerializerMethodField()
    is_valid_prescription = serializers.SerializerMethodField()
    # Aliases for frontend compatibility
    is_valid = serializers.SerializerMethodField()
    is_fully_dispensed = serializers.SerializerMethodField()
    is_fully_dispensed_status = serializers.SerializerMethodField()
    effective_status = serializers.CharField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    # QR verification URL
    verification_url = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = [
            "id",
            "prescription_number",
            "encounter",
            "admission",
            "patient",
            "patient_name",
            "patient_mrn",
            "prescribed_by",
            "prescriber",
            "prescriber_name",
            "prescribed_at",
            "prescribed_date",
            "valid_until",
            "status",
            "dispensing_type",
            "is_discharge_medication",
            "clinical_notes",
            "is_valid",
            "is_valid_prescription",
            "is_fully_dispensed",
            "is_fully_dispensed_status",
            "effective_status",
            "days_until_expiry",
            "items",
            "verification_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "prescription_number",
            "prescribed_by",
            "prescriber",
            "prescribed_date",
            "status",
            "created_at",
            "updated_at",
            "patient_name",
            "patient_mrn",
            "prescriber_name",
            "is_valid",
            "is_valid_prescription",
            "is_fully_dispensed",
            "is_fully_dispensed_status",
            "effective_status",
            "days_until_expiry",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_prescriber_name(self, obj) -> str:
        """Get prescriber full name."""
        return obj.prescribed_by.get_full_name() or obj.prescribed_by.username

    def get_prescribed_date(self, obj) -> Optional[str]:
        """Get prescription date (date only, not datetime)."""
        if obj.prescribed_at:
            return obj.prescribed_at.date()
        return None

    def get_is_valid_prescription(self, obj) -> bool:
        """Get prescription validity status."""
        return obj.is_valid()

    def get_is_valid(self, obj) -> bool:
        """Alias for is_valid_prescription."""
        return obj.is_valid()

    def get_is_fully_dispensed(self, obj) -> bool:
        """Check if all items in prescription are fully dispensed."""
        return obj.is_fully_dispensed()

    def get_is_fully_dispensed_status(self, obj) -> bool:
        """Alias for is_fully_dispensed (for frontend compatibility)."""
        return obj.is_fully_dispensed()

    def get_verification_url(self, obj) -> str:
        """Generate verification URL for QR code."""
        if not obj.prescription_number or not obj.prescribed_at:
            return None

        date_str = obj.prescribed_at.strftime("%Y-%m-%d")
        sig = generate_document_signature(
            document_type="PRESCRIPTION",
            document_number=obj.prescription_number,
            amount="0",  # Prescriptions don't have amounts
            date=date_str,
        )

        base_url = get_verification_base_url()
        return (
            f"{base_url}?type=PRESCRIPTION"
            f"&number={obj.prescription_number}"
            f"&date={date_str}"
            f"&signature={sig}"
        )


class PrescriptionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating prescriptions with nested items."""

    items = PrescriptionItemWriteSerializer(
        many=True, write_only=True, required=False, default=list
    )
    # Make encounter optional (for walk-in pharmacy cases)
    encounter = serializers.PrimaryKeyRelatedField(
        queryset=Encounter.objects.all(),
        required=False,
        allow_null=True,
    )
    # Default valid_until to 30 days from now
    valid_until = serializers.DateField(required=False)
    # Override flag to allow prescriptions despite allergy warnings
    acknowledge_allergy_warnings = serializers.BooleanField(
        required=False,
        default=False,
        write_only=True,
        help_text="Set to true to acknowledge allergy warnings and proceed with prescription",
    )

    class Meta:
        model = Prescription
        fields = [
            "id",
            "encounter",
            "admission",
            "patient",
            "valid_until",
            "dispensing_type",
            "is_discharge_medication",
            "clinical_notes",
            "items",
            "acknowledge_allergy_warnings",
        ]

    def validate(self, data):
        """Validate prescription data and check for drug-allergy interactions."""
        from hmis.apps.patients.models import Allergy

        if "valid_until" not in data or data["valid_until"] is None:
            from datetime import date, timedelta

            data["valid_until"] = date.today() + timedelta(days=30)

        # Extract items for allergy checking
        items_data = data.get("items", [])
        patient = data.get("patient")
        acknowledge_warnings = data.pop("acknowledge_allergy_warnings", False)

        if not patient:
            return data

        # Check for drug-allergy interactions
        allergy_warnings = []
        for item_data in items_data:
            drug = item_data.get("drug")
            if not drug:
                continue

            # Check by drug ID
            matching_allergies = Allergy.check_drug_allergy(patient.id, drug.id)

            # Also check by drug name in case allergy was recorded by name only
            if not matching_allergies:
                matching_allergies = Allergy.check_drug_name_allergy(patient.id, drug.generic_name)

            # HPT-enhanced check: if drug has an hpt_code, check against
            # allergies with ATC-coded substances for deterministic matching
            if not matching_allergies and getattr(drug, "hpt_code", ""):
                matching_allergies = list(
                    Allergy.objects.filter(
                        patient_id=patient.id,
                        status="active",
                        substance__icontains=drug.generic_name,
                        substance_code__isnull=False,
                    ).exclude(substance_code="")
                )

            for allergy in matching_allergies:
                warning = {
                    "drug_id": drug.id,
                    "drug_name": drug.generic_name,
                    "allergy_id": allergy.id,
                    "substance": allergy.substance,
                    "severity": allergy.severity,
                    "severity_display": allergy.get_severity_display(),
                    "reaction_type": allergy.reaction_type,
                    "is_high_risk": allergy.is_high_risk,
                }
                allergy_warnings.append(warning)

        # If there are warnings and user hasn't acknowledged them, raise validation error
        if allergy_warnings and not acknowledge_warnings:
            raise serializers.ValidationError({
                "allergy_warnings": allergy_warnings,
                "message": "Drug-allergy interactions detected. Set acknowledge_allergy_warnings=true to proceed.",
                "has_high_risk": any(w["is_high_risk"] for w in allergy_warnings),
            })

        # Store warnings for later use (e.g., audit logging)
        data["_allergy_warnings"] = allergy_warnings
        data["_warnings_acknowledged"] = acknowledge_warnings

        return data

    def create(self, validated_data):
        """Create prescription with nested items."""
        items_data = validated_data.pop("items", [])
        allergy_warnings = validated_data.pop("_allergy_warnings", [])
        warnings_acknowledged = validated_data.pop("_warnings_acknowledged", False)

        prescription = Prescription.objects.create(**validated_data)

        for item_data in items_data:
            PrescriptionItem.objects.create(prescription=prescription, **item_data)

        # If there were allergy warnings that were acknowledged, add to clinical notes
        if allergy_warnings and warnings_acknowledged:
            warning_text = "\n\n[ALLERGY WARNING ACKNOWLEDGED BY PRESCRIBER]\n"
            warning_text += "The following drug-allergy interactions were detected:\n"
            for w in allergy_warnings:
                warning_text += f"- {w['drug_name']}: Patient allergic to {w['substance']} ({w['severity_display']})\n"
            prescription.clinical_notes = (prescription.clinical_notes or "") + warning_text
            prescription.save(update_fields=["clinical_notes"])

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

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_dispensed_by_name(self, obj) -> str:
        """Get dispenser full name."""
        return obj.dispensed_by.get_full_name() or obj.dispensed_by.username

    def get_verified_by_name(self, obj) -> str:
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

    def get_adjusted_by_name(self, obj) -> str:
        """Get adjuster full name."""
        return obj.adjusted_by.get_full_name() or obj.adjusted_by.username

    def get_approved_by_name(self, obj) -> str:
        """Get approver full name."""
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None


class AlertSettingsSerializer(serializers.ModelSerializer):
    """Serializer for AlertSettings model."""

    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AlertSettings
        fields = [
            "id",
            "low_stock_threshold",
            "expiry_warning_days",
            "expiry_critical_days",
            "enable_email_notifications",
            "notification_email_recipients",
            "updated_by",
            "updated_by_name",
            "updated_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "updated_by_name",
            "updated_at",
            "created_at",
        ]

    def get_updated_by_name(self, obj) -> str:
        """Get updater full name."""
        if obj.updated_by:
            return obj.updated_by.get_full_name() or obj.updated_by.username
        return None

    def validate(self, data):
        """Validate settings data."""
        expiry_warning = data.get("expiry_warning_days")
        expiry_critical = data.get("expiry_critical_days")

        if expiry_critical and expiry_warning and expiry_critical >= expiry_warning:
            raise serializers.ValidationError("Critical days should be less than warning days")

        low_stock = data.get("low_stock_threshold")
        if low_stock is not None and low_stock < 0:
            raise serializers.ValidationError("Low stock threshold must be non-negative")

        return data
