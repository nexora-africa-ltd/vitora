"""Serializers for L4 Microbiology module."""

from rest_framework import serializers

from .models import Antibiogram, Antibiotic, AntibioticSensitivity, CultureResult, Organism


class OrganismSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organism
        fields = [
            "id",
            "code",
            "name",
            "genus",
            "species",
            "gram_stain",
            "organism_type",
            "is_active",
        ]


class OrganismCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organism
        fields = ["code", "name", "genus", "species", "gram_stain", "organism_type"]


class AntibioticSerializer(serializers.ModelSerializer):
    class Meta:
        model = Antibiotic
        fields = [
            "id",
            "code",
            "name",
            "antibiotic_class",
            "disk_content",
            "is_active",
        ]


class AntibioticCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Antibiotic
        fields = ["code", "name", "antibiotic_class", "disk_content"]


class AntibioticSensitivitySerializer(serializers.ModelSerializer):
    antibiotic_name = serializers.CharField(source="antibiotic.name", read_only=True)
    antibiotic_code = serializers.CharField(source="antibiotic.code", read_only=True)
    interpretation_display = serializers.CharField(
        source="get_interpretation_display", read_only=True
    )
    test_method_display = serializers.CharField(source="get_test_method_display", read_only=True)
    tested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AntibioticSensitivity
        fields = [
            "id",
            "culture",
            "antibiotic",
            "antibiotic_name",
            "antibiotic_code",
            "zone_diameter",
            "mic",
            "interpretation",
            "interpretation_display",
            "test_method",
            "test_method_display",
            "breakpoint_standard",
            "tested_by",
            "tested_by_name",
            "tested_at",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_tested_by_name(self, obj):
        if obj.tested_by:
            return (
                f"{obj.tested_by.first_name} {obj.tested_by.last_name}".strip()
                or obj.tested_by.username
            )
        return None


class AntibioticSensitivityCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AntibioticSensitivity
        fields = [
            "antibiotic",
            "zone_diameter",
            "mic",
            "interpretation",
            "test_method",
            "breakpoint_standard",
            "notes",
        ]


class CultureResultSerializer(serializers.ModelSerializer):
    organism_name = serializers.CharField(source="organism.name", read_only=True, default=None)
    organism_code = serializers.CharField(source="organism.code", read_only=True, default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    sensitivities = AntibioticSensitivitySerializer(many=True, read_only=True)
    is_complete = serializers.BooleanField(read_only=True)
    days_incubating = serializers.IntegerField(read_only=True)
    inoculated_by_name = serializers.SerializerMethodField()
    read_by_name = serializers.SerializerMethodField()
    lab_order_number = serializers.CharField(
        source="lab_result.order_item.lab_order.order_number", read_only=True, default=None
    )
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = CultureResult
        fields = [
            "id",
            "lab_result",
            "specimen",
            "status",
            "status_display",
            "culture_medium",
            "incubation_temperature",
            "incubation_atmosphere",
            "incubation_hours",
            "inoculated_by",
            "inoculated_by_name",
            "inoculated_at",
            "read_by",
            "read_by_name",
            "read_at",
            "colony_count",
            "morphology",
            "gram_stain_result",
            "microscopy_notes",
            "organism",
            "organism_name",
            "organism_code",
            "identification_method",
            "preliminary_report",
            "preliminary_reported_at",
            "final_report",
            "final_reported_at",
            "clinical_notes",
            "is_significant",
            "is_complete",
            "days_incubating",
            "sensitivities",
            "lab_order_number",
            "patient_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_inoculated_by_name(self, obj):
        if obj.inoculated_by:
            return (
                f"{obj.inoculated_by.first_name} {obj.inoculated_by.last_name}".strip()
                or obj.inoculated_by.username
            )
        return None

    def get_read_by_name(self, obj):
        if obj.read_by:
            return (
                f"{obj.read_by.first_name} {obj.read_by.last_name}".strip() or obj.read_by.username
            )
        return None

    def get_patient_name(self, obj):
        try:
            patient = obj.lab_result.order_item.lab_order.patient
            return f"{patient.first_name} {patient.last_name}"
        except (AttributeError, TypeError):
            return None


class CultureResultCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CultureResult
        fields = [
            "lab_result",
            "specimen",
            "culture_medium",
            "incubation_temperature",
            "incubation_atmosphere",
            "incubation_hours",
        ]
        extra_kwargs = {
            "specimen": {"required": False, "allow_null": True},
            "incubation_temperature": {"required": False},
            "incubation_atmosphere": {"required": False},
            "incubation_hours": {"required": False},
        }


class CultureStatusTransitionSerializer(serializers.Serializer):
    """Serializer for culture status transition actions."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class CultureIncubateSerializer(serializers.Serializer):
    """Start incubation with optional parameters."""

    temperature = serializers.DecimalField(max_digits=4, decimal_places=1, required=False)
    atmosphere = serializers.ChoiceField(
        choices=["AEROBIC", "ANAEROBIC", "CO2", "MICROAEROPHILIC"],
        required=False,
    )
    hours = serializers.IntegerField(required=False, min_value=1)


class CultureReadingSerializer(serializers.Serializer):
    """Record culture reading results."""

    colony_count = serializers.CharField(required=False, allow_blank=True)
    morphology = serializers.CharField(required=False, allow_blank=True)
    gram_stain_result = serializers.CharField(required=False, allow_blank=True)
    microscopy_notes = serializers.CharField(required=False, allow_blank=True)
    organism = serializers.PrimaryKeyRelatedField(
        queryset=Organism.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    identification_method = serializers.ChoiceField(
        choices=["MANUAL", "VITEK", "MALDI_TOF", "MOLECULAR", "API", "OTHER"],
        required=False,
    )
    is_significant = serializers.BooleanField(required=False, default=True)


class CultureReportSerializer(serializers.Serializer):
    """Submit preliminary or final report."""

    report_text = serializers.CharField(required=False, allow_blank=True)
    clinical_notes = serializers.CharField(required=False, allow_blank=True)


class AntibiogramSerializer(serializers.ModelSerializer):
    organism_name = serializers.CharField(source="organism.name", read_only=True)
    organism_code = serializers.CharField(source="organism.code", read_only=True)
    antibiotic_name = serializers.CharField(source="antibiotic.name", read_only=True)
    antibiotic_code = serializers.CharField(source="antibiotic.code", read_only=True)

    class Meta:
        model = Antibiogram
        fields = [
            "id",
            "year",
            "organism",
            "organism_name",
            "organism_code",
            "antibiotic",
            "antibiotic_name",
            "antibiotic_code",
            "total_isolates",
            "sensitive_count",
            "intermediate_count",
            "resistant_count",
            "percent_sensitive",
            "percent_resistant",
            "generated_at",
        ]
        read_only_fields = ["id", "generated_at"]


class AntibiogramGenerateSerializer(serializers.Serializer):
    """Request antibiogram generation for a given year."""

    year = serializers.IntegerField(min_value=2020, max_value=2100)


class WHONETExportSerializer(serializers.Serializer):
    """Parameters for WHONET export."""

    year = serializers.IntegerField(min_value=2020, max_value=2100)
    organism = serializers.PrimaryKeyRelatedField(
        queryset=Organism.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
