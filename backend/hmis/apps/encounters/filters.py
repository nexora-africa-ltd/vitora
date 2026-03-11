"""
Filters for the encounters app.
"""

import django_filters

from .models import Encounter


class EncounterFilter(django_filters.FilterSet):
    """Filterset for Encounter list endpoint with delta sync support."""

    modified_after = django_filters.IsoDateTimeFilter(
        field_name="updated_at",
        lookup_expr="gte",
        help_text="Return encounters modified at or after this ISO 8601 timestamp (delta sync).",
    )

    class Meta:
        model = Encounter
        fields = ["patient", "encounter_type", "encounter_date", "status", "visit_reason"]
