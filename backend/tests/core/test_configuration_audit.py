# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for safe, field-level facility configuration audit trails.

Run with: poetry run pytest tests/core/test_configuration_audit.py -q
Inputs: Facility-scoped configuration fixtures and authenticated API clients.
"""

from hmis.apps.core.models import FacilityEmailConfig


class TestConfigurationAuditSafety:
    """Configuration snapshots must preserve useful evidence without secrets."""

    def test_snapshot_diff_keeps_safe_values_and_redacts_credentials(self, sample_facility):
        """SMTP connection changes retain host evidence but never credential values."""
        from hmis.apps.core.audit import AuditedConfigurationMutationMixin

        config = FacilityEmailConfig.objects.create(
            facility=sample_facility,
            smtp_host="smtp.old.example.test",
            smtp_username="old-user@example.test",
        )
        config.smtp_password = "old-secret"
        config.save()

        audit_mixin = AuditedConfigurationMutationMixin()
        before = audit_mixin.configuration_audit_snapshot(config)

        config.smtp_host = "smtp.new.example.test"
        config.smtp_username = "new-user@example.test"
        config.smtp_password = "new-secret"
        config.save()

        details = audit_mixin.build_configuration_audit_details(
            before,
            audit_mixin.configuration_audit_snapshot(config),
            operation="partial_update",
        )

        assert details["changed_fields"] == ["smtp_host", "smtp_password", "smtp_username"]
        assert details["old_values"] == {"smtp_host": "smtp.old.example.test"}
        assert details["new_values"] == {"smtp_host": "smtp.new.example.test"}
        assert details["redacted_fields"] == ["smtp_password", "smtp_username"]
        assert "old-secret" not in str(details)
        assert "new-secret" not in str(details)

    def test_configuration_viewsets_use_field_level_audit_mixin(self):
        """Every previously identified facility-settings API receives safe diffs."""
        from hmis.apps.billing.views_mpesa_reports import FacilityBillingConfigViewSet
        from hmis.apps.core.audit import AuditedConfigurationMutationMixin
        from hmis.apps.core.views_org_facility import FacilityEmailConfigViewSet, FacilityViewSet
        from hmis.apps.laboratory.views_specimen_settings import (
            LabBarcodeConfigViewSet,
            LaboratoryAlertSettingsViewSet,
            LabWorkflowSettingsViewSet,
        )
        from hmis.apps.scheduling.views_shift_config import SchedulingSettingsViewSet
        from hmis.apps.surveillance.views import SurveillanceFacilitySettingsViewSet

        viewsets = (
            FacilityViewSet,
            FacilityEmailConfigViewSet,
            SurveillanceFacilitySettingsViewSet,
            SchedulingSettingsViewSet,
            FacilityBillingConfigViewSet,
            LabBarcodeConfigViewSet,
            LabWorkflowSettingsViewSet,
            LaboratoryAlertSettingsViewSet,
        )

        assert all(issubclass(viewset, AuditedConfigurationMutationMixin) for viewset in viewsets)
