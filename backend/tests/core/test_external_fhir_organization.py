# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for tenant-owned external FHIR Organization references.

Run with:
    poetry run pytest tests/core/test_external_fhir_organization.py --no-cov

Inputs:
    Organization, facility, and SMART OAuth application test fixtures.
"""

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from oauth2_provider.models import Application


@pytest.mark.django_db
class TestExternalFHIROrganization:
    """External FHIR Organization records stay separate from Vitora tenancy."""

    def test_creates_external_organization_with_source_and_provenance(
        self, sample_organization, test_user
    ):
        """A tenant can record an external FHIR Organization identity."""
        from hmis.apps.core.models import ExternalFHIROrganization

        application = Application.objects.create(
            name="Referral Partner",
            client_type=Application.CLIENT_CONFIDENTIAL,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            user=test_user,
        )
        external = ExternalFHIROrganization.objects.create(
            organization=sample_organization,
            source_application=application,
            external_base_url="https://partner.example/fhir",
            fhir_resource_type="Organization",
            fhir_resource_id="provider-123",
            identifiers=[
                {"system": "urn:kenya:mfl", "value": "12345"},
                {"system": "https://partner.example/ids", "value": "partner-123"},
            ],
            mfl_code="12345",
            display_name="Partner Referral Hospital",
            provenance={"bundle_id": "bundle-001", "source": "SMART import"},
        )

        assert external.organization == sample_organization
        assert external.source_application == application
        assert external.matched_facility is None
        assert external.fhir_resource_id == "provider-123"

    def test_rejects_facility_matched_to_another_organization(
        self, sample_organization, sample_facility, sample_county, sample_sub_county
    ):
        """An external reference cannot create a cross-tenant facility link."""
        from hmis.apps.core.models import ExternalFHIROrganization, Facility, Organization

        foreign_organization = Organization.objects.create(
            name="Foreign Integration Group",
            slug="foreign-integration-group",
            contact_email="foreign@example.test",
            is_active=True,
            is_verified=True,
        )
        foreign_facility = Facility.objects.create(
            organization=foreign_organization,
            name="Foreign Integration Facility",
            mfl_code="87654",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        external = ExternalFHIROrganization(
            organization=sample_organization,
            external_base_url="https://partner.example/fhir",
            fhir_resource_id="provider-123",
            display_name="Partner Referral Hospital",
            matched_facility=foreign_facility,
        )

        with pytest.raises(ValidationError, match="matched facility"):
            external.full_clean()

        assert sample_facility.organization == sample_organization

    def test_external_identity_is_unique_per_tenant_and_source(self, sample_organization):
        """The same external logical resource is recorded once per Vitora tenant."""
        from django.core.exceptions import ValidationError

        from hmis.apps.core.models import ExternalFHIROrganization

        values = {
            "organization": sample_organization,
            "external_base_url": "https://partner.example/fhir",
            "fhir_resource_id": "provider-123",
            "display_name": "Partner Referral Hospital",
        }
        ExternalFHIROrganization.objects.create(**values)

        with pytest.raises(ValidationError):
            ExternalFHIROrganization.objects.create(**values)
