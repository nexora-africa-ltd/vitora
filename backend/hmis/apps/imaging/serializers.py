"""
Serializers for imaging models.
"""

from rest_framework import serializers

from .models import ImagingOrder, ImagingOrderItem, ImagingProcedure


class ImagingProcedureSerializer(serializers.ModelSerializer):
    """Serializer for imaging procedure catalog listing."""

    class Meta:
        model = ImagingProcedure
        fields = [
            "id",
            "code",
            "name",
            "modality",
            "body_region",
            "cost",
            "sha_claimable",
            "available_in_house",
            "is_active",
        ]


class ImagingProcedureDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer with all procedure fields."""

    class Meta:
        model = ImagingProcedure
        fields = [
            "id",
            "code",
            "name",
            "modality",
            "body_region",
            "radlex_code",
            "loinc_code",
            "requires_contrast",
            "requires_sedation",
            "special_preparation",
            "turnaround_hours",
            "cost",
            "sha_claimable",
            "sha_intervention_code",
            "is_active",
            "available_in_house",
            "created_at",
            "updated_at",
        ]


class ImagingOrderItemSerializer(serializers.ModelSerializer):
    """Order item with procedure details."""

    procedure_name = serializers.CharField(source="procedure.name", read_only=True)
    procedure_code = serializers.CharField(source="procedure.code", read_only=True)
    modality = serializers.CharField(source="procedure.modality", read_only=True)

    class Meta:
        model = ImagingOrderItem
        fields = [
            "id",
            "procedure",
            "procedure_name",
            "procedure_code",
            "modality",
            "laterality",
            "specific_instructions",
            "is_completed",
            "completed_at",
            "unit_cost",
        ]


class ImagingOrderSerializer(serializers.ModelSerializer):
    """Order with status and items."""

    items = ImagingOrderItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    ordered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ImagingOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "encounter",
            "ordered_by",
            "ordered_by_name",
            "priority",
            "clinical_indication",
            "relevant_clinical_history",
            "status",
            "scheduled_datetime",
            "scheduled_room",
            "accession_number",
            "study_instance_uid",
            "total_cost",
            "is_paid",
            "items",
            "ordered_at",
            "completed_at",
        ]
        read_only_fields = ["order_number", "ordered_at", "ordered_by"]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj):
        return obj.ordered_by.get_full_name() or obj.ordered_by.username


class ImagingOrderItemCreateSerializer(serializers.Serializer):
    """Serializer for creating order items."""

    procedure_code = serializers.CharField()
    laterality = serializers.ChoiceField(
        choices=ImagingOrderItem.LATERALITY_CHOICES, default="NA"
    )
    specific_instructions = serializers.CharField(required=False, allow_blank=True)


class ImagingOrderCreateSerializer(serializers.ModelSerializer):
    """Create order with items."""

    items = ImagingOrderItemCreateSerializer(many=True, write_only=True)

    class Meta:
        model = ImagingOrder
        fields = [
            "patient",
            "encounter",
            "priority",
            "clinical_indication",
            "relevant_clinical_history",
            "items",
        ]

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        ordered_by = self.context["request"].user
        order = ImagingOrder.objects.create(ordered_by=ordered_by, **validated_data)

        for item_data in items_data:
            procedure_code = item_data["procedure_code"]
            try:
                procedure = ImagingProcedure.objects.get(code=procedure_code)
            except ImagingProcedure.DoesNotExist as e:
                # Rollback by deleting the order
                order.delete()
                raise serializers.ValidationError(
                    {"items": f"Procedure with code '{procedure_code}' not found in catalog."}
                ) from e

            laterality = item_data.get("laterality", "NA")
            specific_instructions = item_data.get("specific_instructions", "")
            ImagingOrderItem.objects.create(
                order=order,
                procedure=procedure,
                laterality=laterality,
                specific_instructions=specific_instructions,
                unit_cost=procedure.cost,
            )

        order.calculate_total_cost()
        return order


class ScheduleOrderSerializer(serializers.Serializer):
    """Serializer for scheduling an imaging order."""

    scheduled_datetime = serializers.DateTimeField()
    scheduled_room = serializers.CharField(required=False, allow_blank=True)


class CancelOrderSerializer(serializers.Serializer):
    """Serializer for cancelling an imaging order."""

    reason = serializers.CharField(required=False, allow_blank=True, default="No reason provided")
