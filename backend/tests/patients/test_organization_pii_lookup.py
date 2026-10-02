# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for organization-scoped PII indexes; run with pytest tests/patients/test_organization_pii_lookup.py."""

from datetime import date

import pytest
from django.db import IntegrityError
from django.db.models import Q
from django.test import override_settings

from hmis.apps.core.models import Organization, SubscriptionPlan
from hmis.apps.patients.models import Patient
from hmis.apps.patients.serializers import PatientSerializer


@pytest.fixture
def second_organization(db):
    """Create an independent organization for tenant isolation assertions."""
    plan = SubscriptionPlan.objects.get(code="TEST_ALL_FEATURES")
    return Organization.objects.create(
        name="Second Test Hospital Group",
        slug="second-test-hospital-group",
        subscription_plan=plan,
    )


def create_patient(organization, *, national_id="12345678", first_name="Jane"):
    """Create a patient with the minimal fields required for scoped PII tests."""
    return Patient.objects.create(
        first_name=first_name,
        last_name="Patient",
        date_of_birth=date(1990, 1, 1),
        gender="F",
        organization=organization,
        identification_type="national_id",
        identification_number=national_id,
        national_id=national_id,
    )


@pytest.mark.django_db
class TestOrganizationScopedPatientPIILookups:
    """Patient PII lookup paths must use only the current tenant's HMAC keys."""

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_exact_lookup_uses_organization_hmac_and_excludes_other_tenants(
        self, sample_organization, second_organization
    ):
        """The same identifier is searchable only within the selected organization."""
        first = create_patient(sample_organization)
        create_patient(second_organization, first_name="Other")

        assert list(
            Patient.objects.filter(
                organization=sample_organization, identification_number="12345678"
            )
        ) == [first]
        assert list(
            Patient.objects.filter(organization=second_organization, national_id="12345678")
        ) != [first]

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_q_exact_lookup_uses_organization_hmac(self, sample_organization):
        """Q-based exact PII filters retain organization-aware blind-index lookup."""
        patient = create_patient(sample_organization)

        assert list(
            Patient.objects.filter(Q(national_id="12345678"), organization=sample_organization)
        ) == [patient]

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_same_identifier_is_allowed_for_different_organizations(
        self, sample_organization, second_organization
    ):
        """The HMAC uniqueness constraint is organization-scoped."""
        create_patient(sample_organization)

        create_patient(second_organization, first_name="Other")

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_same_identifier_is_rejected_within_an_organization(self, sample_organization):
        """The HMAC uniqueness constraint still rejects an in-tenant duplicate."""
        create_patient(sample_organization)

        with pytest.raises(IntegrityError):
            create_patient(sample_organization, first_name="Duplicate")

    @override_settings(ORGANIZATION_PII_ENCRYPTION_ENABLED=True)
    def test_serializer_demographic_duplicate_check_is_organization_scoped(
        self, sample_organization, second_organization, sample_county, sample_sub_county
    ):
        """A demographic match in another organization must not block registration."""
        create_patient(second_organization)
        serializer = PatientSerializer(
            data={
                "first_name": "Jane",
                "last_name": "Patient",
                "date_of_birth": "1990-01-01",
                "gender": "F",
                "county": sample_county.pk,
                "sub_county": sample_sub_county.pk,
            },
            context={"organization": sample_organization},
        )

        assert serializer.is_valid(), serializer.errors
