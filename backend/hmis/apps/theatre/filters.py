import django_filters

from .models import OperatingTheatre, SurgeryCase


class OperatingTheatreFilter(django_filters.FilterSet):
    class Meta:
        model = OperatingTheatre
        fields = {
            "theatre_type": ["exact"],
            "is_active": ["exact"],
            "facility": ["exact"],
        }


class SurgeryCaseFilter(django_filters.FilterSet):
    patient = django_filters.NumberFilter()
    patient_id = django_filters.NumberFilter(field_name="patient")
    encounter = django_filters.NumberFilter()
    encounter_id = django_filters.NumberFilter(field_name="encounter")
    scheduled_date_from = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="gte")
    scheduled_date_to = django_filters.DateFilter(field_name="scheduled_date", lookup_expr="lte")

    class Meta:
        model = SurgeryCase
        fields = {
            "status": ["exact"],
            "priority": ["exact"],
            "patient": ["exact"],
            "patient_id": ["exact"],
            "encounter": ["exact"],
            "encounter_id": ["exact"],
            "theatre": ["exact"],
            "scheduled_date": ["exact"],
            "requesting_doctor": ["exact"],
            "facility": ["exact"],
        }
