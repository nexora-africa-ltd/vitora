# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for the offline-sync completeness matrix.

Run with: poetry run pytest tests/core/test_sync_completeness.py --no-cov
Inputs: Django's installed model registry and the core sync matrix constants.
"""

import pytest  # type: ignore
from django.apps import apps

from hmis.apps.core.mixins import OrganizationScopedModel
from hmis.apps.core.sync_registry import SYNC_EXCLUSIONS, SYNC_REGISTRY
from hmis.apps.core.sync_views import _derive_tenant_scope_path, _model_sync_dependencies


def _tenant_scoped_model_labels() -> set[str]:
    """Return concrete tenant-owned models that require a sync decision."""
    return {
        model._meta.label
        for model in apps.get_models()
        if not model._meta.abstract
        and not model._meta.auto_created
        and not model._meta.proxy
        and issubclass(model, OrganizationScopedModel)
    }


@pytest.mark.django_db
class TestSyncCompletenessMatrix:
    """Prevent tenant-scoped models from being added without an offline decision."""

    def test_every_tenant_scoped_model_has_exactly_one_sync_decision(self):
        """Each scoped model must be syncable or explicitly excluded, never both."""
        tenant_models = _tenant_scoped_model_labels()
        registered = set(SYNC_REGISTRY)
        excluded = set(SYNC_EXCLUSIONS)

        assert tenant_models - (registered | excluded) == set()
        assert not tenant_models & registered & excluded

    def test_sync_exclusions_document_reason_and_replacement_strategy(self):
        """Exclusions must communicate why they do not sync and what protects the data."""
        for model_label, exclusion in SYNC_EXCLUSIONS.items():
            assert exclusion.reason.strip(), model_label
            assert exclusion.replacement_strategy.strip(), model_label

    def test_nested_phase_workflows_derive_tenant_scope_from_parents(self):
        """Child workflow records must be scoped through their parent aggregate."""
        assert _derive_tenant_scope_path("mch.ANCVisit", target_field="facility") == (
            "registration__facility"
        )
        assert _derive_tenant_scope_path(
            "procedures.ProcedureKitItem", target_field="facility"
        ) == ("kit__procedure__facility")
        assert _derive_tenant_scope_path("theatre.PACUVitalReading", target_field="facility") == (
            "pacu_record__surgery_case__facility"
        )

    def test_nested_phase_workflows_derive_parent_before_child_dependencies(self):
        """Full pulls must emit direct FK parents before dependent workflow rows."""
        assert "laboratory.LabOrder" in _model_sync_dependencies("laboratory.LabOrderItem")
        assert "encounters.TreatmentPlan" in _model_sync_dependencies("encounters.Medication")
