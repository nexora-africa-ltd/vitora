# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for field-level auditing of laboratory facility configuration.

Run with: poetry run pytest tests/laboratory/test_configuration_audit.py -q
Inputs: Authenticated laboratory administrator and facility-scoped workflow settings.
"""

from rest_framework import status


class TestLaboratoryConfigurationAudit:
    """Laboratory setting mutations must retain a facility-scoped field diff."""

    def test_workflow_settings_update_logs_before_after_values(
        self,
        authenticated_client,
        sample_facility,
        test_staff_profile,
    ):
        """A workflow preference change records the configured facility and value diff."""
        from hmis.apps.core.models import AuditLog

        sample_facility.has_laboratory = True
        sample_facility.save(update_fields=["has_laboratory"])
        test_staff_profile.primary_role.code = "ADMIN"
        test_staff_profile.primary_role.save(update_fields=["code"])

        current = authenticated_client.get("/api/lab/settings/workflow/")
        assert current.status_code == status.HTTP_200_OK
        initialization_entry = AuditLog.objects.filter(
            action="laboratory.workflow_settings.initialized",
            resource_type="LabWorkflowSettings",
            resource_id=current.data["id"],
        ).latest("timestamp")
        assert initialization_entry.facility_id == sample_facility.id

        response = authenticated_client.patch(
            f"/api/lab/settings/workflow/{current.data['id']}/",
            {"auto_release_normal_results": True},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        audit_entry = AuditLog.objects.filter(
            action="laboratory.workflow_settings.partial_update",
            resource_type="LabWorkflowSettings",
            resource_id=current.data["id"],
        ).latest("timestamp")
        assert audit_entry.facility_id == sample_facility.id
        assert audit_entry.details["old_values"] == {"auto_release_normal_results": False}
        assert audit_entry.details["new_values"] == {"auto_release_normal_results": True}
