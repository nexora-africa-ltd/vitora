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

    # Exact-match filters for encrypted PII (rewritten to HMAC blind-index lookup
    # by PatientQuerySet — `?search=` cannot match these because the plaintext
    # column is blanked at rest).
    national_id = django_filters.CharFilter(
        method="filter_national_id",
        help_text="Exact match against the encrypted national_id (HMAC blind-index).",
    )
    identification_number = django_filters.CharFilter(
        method="filter_identification_number",
        help_text="Exact match against the encrypted identification_number (HMAC blind-index).",
    )

    def filter_current_facility_only(self, queryset, _name, value):
        if not value:
            return queryset

        facility = getattr(self.request, "facility", None)
        if facility is None:
            return queryset.none()

        return queryset.filter(registered_at_facility=facility)

    def filter_national_id(self, queryset, _name, value):
        value = (value or "").strip()
        if not value:
            return queryset
        # PatientQuerySet rewrites these kwargs to *_hmac blind-index lookups.
        # We can't OR via Q() here because the rewrite only inspects kwargs;
        # union the two HMAC matches instead so either column hits.
        by_national = queryset.filter(national_id=value)
        by_ident = queryset.filter(identification_number=value)
        ids = list(by_national.values_list("pk", flat=True)) + list(
            by_ident.values_list("pk", flat=True)
        )
        return queryset.filter(pk__in=ids)

    def filter_identification_number(self, queryset, _name, value):
        value = (value or "").strip()
        if not value:
            return queryset
        return queryset.filter(identification_number=value)

    class Meta:
        model = Patient
        fields = [
            "gender",
            "is_sensitive",
            "current_facility_only",
            "national_id",
            "identification_number",
        ]
