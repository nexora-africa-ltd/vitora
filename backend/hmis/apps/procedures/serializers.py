from rest_framework import serializers

from .models import (
    ProcedureCatalog,
    ProcedureConsent,
    ProcedureConsumable,
    ProcedureLog,
    ProcedureOrder,
    ProcedureOutcome,
)


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
class ProcedureCatalogListSerializer(serializers.ModelSerializer):
    """Compact list view for search/dropdowns."""

    default_clinics_detail = serializers.SerializerMethodField()

    class Meta:
        model = ProcedureCatalog
        fields = [
            "id",
            "code",
            "name",
            "category",
            "body_system",
            "risk_level",
            "base_fee",
            "typical_duration_minutes",
            "consent_required",
            "is_active",
            "default_clinics",
            "default_clinics_detail",
        ]

    def get_default_clinics_detail(self, obj: ProcedureCatalog) -> list[dict]:
        return [
            {"id": c.id, "name": c.name, "clinic_type": c.clinic_type}
            for c in obj.default_clinics.all()
        ]


class ProcedureCatalogDetailSerializer(serializers.ModelSerializer):
    """Full detail including coding, consent template, and requirements."""

    billing_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    billing_service_name = serializers.CharField(
        source="billing_service.name", read_only=True, default=None
    )
    default_clinics_detail = serializers.SerializerMethodField()

    class Meta:
        model = ProcedureCatalog
        fields = "__all__"

    def get_default_clinics_detail(self, obj: ProcedureCatalog) -> list[dict]:
        return [
            {"id": c.id, "name": c.name, "clinic_type": c.clinic_type}
            for c in obj.default_clinics.all()
        ]


# ---------------------------------------------------------------------------
# Consumable
# ---------------------------------------------------------------------------
class ProcedureConsumableSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)

    class Meta:
        model = ProcedureConsumable
        fields = "__all__"


class ProcedureConsumableCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureConsumable
        fields = ["drug", "batch", "quantity", "notes"]


# ---------------------------------------------------------------------------
# Outcome
# ---------------------------------------------------------------------------
class ProcedureOutcomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureOutcome
        fields = "__all__"


class ProcedureOutcomeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureOutcome
        fields = [
            "assessment_date",
            "outcome",
            "findings",
            "notes",
            "next_follow_up",
            "follow_up_notes",
            "images",
        ]


# ---------------------------------------------------------------------------
# Consent
# ---------------------------------------------------------------------------
class ProcedureConsentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureConsent
        fields = "__all__"


class ProcedureConsentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureConsent
        fields = [
            "consent_type",
            "consent_text",
            "procedure_explained",
            "risks_explained",
            "alternatives_explained",
            "questions_answered",
            "signed_by_patient",
            "patient_signature",
            "signed_by_guardian",
            "guardian_name",
            "guardian_relationship",
            "guardian_id_number",
            "guardian_signature",
            "witness_required",
            "witness_name",
            "witness_signature",
        ]


# ---------------------------------------------------------------------------
# Log
# ---------------------------------------------------------------------------
class ProcedureLogSerializer(serializers.ModelSerializer):
    consumables = serializers.SerializerMethodField()

    class Meta:
        model = ProcedureLog
        fields = "__all__"

    def get_consumables(self, obj: ProcedureLog) -> list[dict]:
        return ProcedureConsumableSerializer(obj.consumables.all(), many=True).data


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------
class ProcedureOrderListSerializer(serializers.ModelSerializer):
    procedure_name = serializers.CharField(source="procedure.name", read_only=True)
    patient_name = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProcedureOrder
        fields = [
            "id",
            "order_number",
            "procedure",
            "procedure_name",
            "patient",
            "patient_name",
            "status",
            "priority",
            "scheduled_date",
            "scheduled_time",
            "is_overdue",
            "ordered_at",
        ]

    def get_patient_name(self, obj: ProcedureOrder) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class ProcedureOrderCreateSerializer(serializers.ModelSerializer):
    """Used for POST /api/procedures/orders/."""

    class Meta:
        model = ProcedureOrder
        fields = [
            "procedure",
            "patient",
            "encounter",
            "clinic_visit",
            "admission",
            "priority",
            "indication",
            "clinical_notes",
            "body_site",
            "laterality",
            "scheduled_date",
            "scheduled_time",
            "scheduled_location",
            "scheduled_clinic",
            "estimated_duration_minutes",
            "assigned_performer",
        ]


class ProcedureOrderDetailSerializer(serializers.ModelSerializer):
    procedure = ProcedureCatalogListSerializer(read_only=True)
    consent = serializers.SerializerMethodField()
    log = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProcedureOrder
        fields = "__all__"

    def get_consent(self, obj: ProcedureOrder) -> dict | None:
        try:
            return ProcedureConsentSerializer(obj.consent).data
        except ProcedureConsent.DoesNotExist:
            return None

    def get_log(self, obj: ProcedureOrder) -> dict | None:
        try:
            return ProcedureLogSerializer(obj.log).data
        except ProcedureLog.DoesNotExist:
            return None


# ---------------------------------------------------------------------------
# Action serializers (for @action endpoints)
# ---------------------------------------------------------------------------
class ProcedureScheduleSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/schedule/"""

    scheduled_date = serializers.DateField()
    scheduled_time = serializers.TimeField(required=False)
    scheduled_location = serializers.CharField(required=False, default="")
    scheduled_clinic = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of clinic/procedure room to schedule in",
    )
    estimated_duration_minutes = serializers.IntegerField(required=False)

    def validate_scheduled_clinic(self, value):
        """Validate the clinic exists and is active."""
        if value is None:
            return None
        from hmis.apps.clinics.models import Clinic

        try:
            return Clinic.objects.get(id=value, status="ACTIVE")
        except Clinic.DoesNotExist:
            raise serializers.ValidationError(f"Clinic with ID {value} not found or not active.")


class ProcedureCancelSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/cancel/"""

    reason = serializers.CharField()


class ProcedureStartSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/start/"""

    location = serializers.CharField(required=False, default="")


class ProcedureCompleteSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/complete/"""

    status = serializers.ChoiceField(
        choices=["COMPLETED", "PARTIAL", "COMPLICATED"],
        default="COMPLETED",
    )
    immediate_outcome = serializers.CharField(required=False, default="", allow_blank=True)
    complications_occurred = serializers.BooleanField(required=False, default=False)
    complication_details = serializers.CharField(required=False, default="", allow_blank=True)
