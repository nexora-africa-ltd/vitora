# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Patient Django-admin tenant-field tests.

Run with:
    poetry run pytest tests/patients/test_patient_admin_tenant_fields.py --no-cov

Inputs:
    The registered PatientAdmin configuration.
"""

from hmis.apps.patients.admin import PatientAdmin
from hmis.apps.patients.models import Patient


class TestPatientAdminTenantFields:
    """Patient administration must expose ownership without rendering PII."""

    def test_tenant_fields_are_visible_and_filterable(self):
        """Platform administrators can inspect and filter patient ownership."""
        admin_config = PatientAdmin(Patient, None)

        assert "organization" in admin_config.list_display
        assert "registered_at_facility" in admin_config.list_display
        assert "organization" in admin_config.list_filter
        assert "registered_at_facility" in admin_config.list_filter
        assert "organization" in admin_config.raw_id_fields
        assert "registered_at_facility" in admin_config.raw_id_fields

    def test_tenant_ownership_fieldset_contains_local_tenant_fields(self):
        """The change form identifies the owning organization and registration facility."""
        tenant_fieldsets = [
            options["fields"]
            for title, options in PatientAdmin.fieldsets
            if title == "Tenant Ownership"
        ]

        assert tenant_fieldsets == [("organization", "registered_at_facility")]
