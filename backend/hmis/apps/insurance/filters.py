"""Filters for the insurance app."""

import django_filters

from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsurancePlan,
    InsurancePreauth,
    InsuranceProvider,
    PatientInsurance,
    PayerTariff,
)


class InsuranceProviderFilter(django_filters.FilterSet):
    class Meta:
        model = InsuranceProvider
        fields = ["provider_type", "status", "api_integration_enabled"]


class InsurancePlanFilter(django_filters.FilterSet):
    class Meta:
        model = InsurancePlan
        fields = ["provider", "plan_type", "coverage_type", "status"]


class PatientInsuranceFilter(django_filters.FilterSet):
    class Meta:
        model = PatientInsurance
        fields = ["patient", "provider", "plan", "status", "member_type", "is_primary"]


class InsuranceClaimFilter(django_filters.FilterSet):
    class Meta:
        model = InsuranceClaim
        fields = ["provider", "patient", "status", "claim_type", "patient_insurance"]


class InsurancePreauthFilter(django_filters.FilterSet):
    class Meta:
        model = InsurancePreauth
        fields = ["provider", "patient", "status", "preauth_type", "patient_insurance"]


class PayerTariffFilter(django_filters.FilterSet):
    class Meta:
        model = PayerTariff
        fields = ["provider", "plan", "service", "requires_preauth"]
