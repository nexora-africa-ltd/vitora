"""Admin configuration for L4 Microbiology models."""

from django.contrib import admin

from .models import Antibiogram, Antibiotic, AntibioticSensitivity, CultureResult, Organism


@admin.register(Organism)
class OrganismAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "gram_stain", "organism_type", "is_active"]
    list_filter = ["gram_stain", "organism_type", "is_active"]
    search_fields = ["code", "name", "genus", "species"]


@admin.register(Antibiotic)
class AntibioticAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "antibiotic_class", "disk_content", "is_active"]
    list_filter = ["antibiotic_class", "is_active"]
    search_fields = ["code", "name"]


@admin.register(CultureResult)
class CultureResultAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "status",
        "organism",
        "colony_count",
        "is_significant",
        "facility",
        "created_at",
    ]
    list_filter = ["status", "is_significant", "identification_method", "facility"]
    search_fields = ["organism__name", "lab_result__order_item__lab_order__order_number"]
    raw_id_fields = ["lab_result", "specimen", "organism", "inoculated_by", "read_by", "facility"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(AntibioticSensitivity)
class AntibioticSensitivityAdmin(admin.ModelAdmin):
    list_display = [
        "culture",
        "antibiotic",
        "interpretation",
        "zone_diameter",
        "mic",
        "test_method",
    ]
    list_filter = ["interpretation", "test_method", "breakpoint_standard"]
    search_fields = ["antibiotic__name", "antibiotic__code"]
    raw_id_fields = ["culture", "antibiotic", "tested_by", "facility"]


@admin.register(Antibiogram)
class AntibiogramAdmin(admin.ModelAdmin):
    list_display = [
        "year",
        "organism",
        "antibiotic",
        "total_isolates",
        "percent_sensitive",
        "percent_resistant",
        "facility",
    ]
    list_filter = ["year", "facility"]
    search_fields = ["organism__name", "antibiotic__name"]
    raw_id_fields = ["organism", "antibiotic", "facility"]
