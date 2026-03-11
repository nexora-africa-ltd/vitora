"""
Filters for the patients app.
"""

import django_filters

from .models import Patient


class PatientFilter(django_filters.FilterSet):
    """Filterset for Patient list endpoint with delta sync support."""

    modified_after = django_filters.IsoDateTimeFilter(
        field_name="updated_at",
        lookup_expr="gte",
        help_text="Return patients modified at or after this ISO 8601 timestamp (delta sync).",
    )

    class Meta:
        model = Patient
        fields = ["gender", "is_sensitive"]
