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
    current_facility_only = django_filters.BooleanFilter(
        method="filter_current_facility_only",
        help_text="When true, limit org-wide patients to those registered at the active facility.",
    )

    def filter_current_facility_only(self, queryset, _name, value):
        if not value:
            return queryset

        facility = getattr(self.request, "facility", None)
        if facility is None:
            return queryset.none()

        return queryset.filter(registered_at_facility=facility)

    class Meta:
        model = Patient
        fields = ["gender", "is_sensitive", "current_facility_only"]
