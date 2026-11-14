# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Audit Django-materialized default-role permissions.

Run with:
    poetry run pytest tests/rbac/test_role_permission_sync_audit.py --no-cov
"""

from io import StringIO

import pytest  # type: ignore
from django.core.management import call_command


@pytest.mark.django_db
class TestDefaultRolePermissionSyncAudit:
    """CRUD and explicit override actions must not be silently ignored."""

    def test_every_django_materialized_action_resolves_to_a_permission(self):
        """Catch stale CRUD/override mappings; domain actions remain matrix-enforced."""
        from django.contrib.auth.models import Permission

        from hmis.apps.core.models import Role
        from hmis.apps.core.role_permissions_sync import (
            ACTION_MAPPING,
            CUSTOM_ACTIONS,
            MATRIX_PERMISSION_OVERRIDES,
            MODEL_MAPPING,
            MODEL_SUFFIXED_ACTIONS,
        )

        call_command("load_default_roles", stdout=StringIO())

        unresolved: list[str] = []
        for role in Role.objects.all():
            for resource, actions in (role.permissions_matrix or {}).items():
                for action, granted in actions.items():
                    if not granted or (
                        action in CUSTOM_ACTIONS
                        and (resource, action) not in MATRIX_PERMISSION_OVERRIDES
                    ):
                        continue
                    target = MATRIX_PERMISSION_OVERRIDES.get((resource, action))
                    if target is None:
                        app_label, model = MODEL_MAPPING[resource]
                        codename = (
                            f"{action}_{model}"
                            if action in MODEL_SUFFIXED_ACTIONS
                            else f"{ACTION_MAPPING[action]}_{model}"
                        )
                        target = (app_label, model, codename)
                    app_label, model, codename = target
                    if not Permission.objects.filter(
                        content_type__app_label=app_label,
                        content_type__model=model,
                        codename=codename,
                    ).exists():
                        unresolved.append(f"{role.code}.{resource}.{action}")

        assert unresolved == [], "Unresolved role permissions: " + "; ".join(unresolved)

    def test_fhir_roles_follow_least_privilege(self):
        """Clinical roles are read-only; only the integration service role can write."""
        from hmis.apps.core.models import Role

        call_command("load_default_roles", stdout=StringIO())

        for code in (
            "DOCTOR",
            "CONSULTANT",
            "CLINICAL_OFFICER",
            "NURSE",
            "PHARMACIST",
            "RADIOLOGIST",
            "LAB_SCIENTIST",
        ):
            assert Role.objects.get(code=code).permissions_matrix["FHIR"] == {
                "create": False,
                "read": True,
                "update": False,
                "delete": False,
            }

        assert Role.objects.get(code="FHIR_INTEGRATION").permissions_matrix["FHIR"] == {
            "create": True,
            "read": True,
            "update": False,
            "delete": False,
        }
