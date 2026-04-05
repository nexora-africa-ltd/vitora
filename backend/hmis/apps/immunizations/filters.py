"""Filters for the immunizations app."""

import django_filters

from hmis.apps.immunizations.models import (
    AEFI,
    ImmunizationRecord,
    VaccineCampaign,
    VaccineDefinition,
)


class VaccineDefinitionFilter(django_filters.FilterSet):
    """Filter for vaccine definitions."""

    program = django_filters.CharFilter(lookup_expr="iexact")
    target_population = django_filters.CharFilter(lookup_expr="iexact")
    series_name = django_filters.CharFilter(lookup_expr="icontains")

    class Meta:
        model = VaccineDefinition
        fields = ["program", "target_population", "series_name"]


class ImmunizationRecordFilter(django_filters.FilterSet):
    """Filter for immunization records."""

    patient = django_filters.NumberFilter()
    vaccine = django_filters.NumberFilter()
    status = django_filters.CharFilter(lookup_expr="iexact")
    program = django_filters.CharFilter(
        field_name="vaccine__program", lookup_expr="iexact"
    )
    campaign = django_filters.NumberFilter()

    class Meta:
        model = ImmunizationRecord
        fields = ["patient", "vaccine", "status", "program", "campaign"]


class VaccineCampaignFilter(django_filters.FilterSet):
    """Filter for vaccine campaigns."""

    status = django_filters.CharFilter(lookup_expr="iexact")
    target_population = django_filters.CharFilter(lookup_expr="iexact")

    class Meta:
        model = VaccineCampaign
        fields = ["status", "target_population"]


class AEFIFilter(django_filters.FilterSet):
    """Filter for AEFI reports."""

    event_type = django_filters.CharFilter(lookup_expr="iexact")
    severity = django_filters.CharFilter(lookup_expr="iexact")
    immunization_record = django_filters.NumberFilter()

    class Meta:
        model = AEFI
        fields = ["event_type", "severity", "immunization_record"]
