# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
FHIR RBAC and SMART OAuth-admin security tests.

Run with:
    poetry run pytest tests/core/test_fhir_access_and_oauth_admin.py --no-cov

Inputs:
    Django users, permissions, and the registered OAuth Application admin.
"""

import pytest  # type: ignore
from django.contrib import admin
from django.contrib.auth.models import Permission
from django.test import RequestFactory, override_settings
from oauth2_provider.models import Application

from hmis.apps.core.admin_smart_oauth import SMARTOAuthApplicationAdmin, SMARTOAuthApplicationForm
from hmis.apps.core.permissions import FHIRAccessPermission


@pytest.mark.django_db
class TestFHIRAccessPermission:
    """FHIR API access requires its explicit capability when enforcement is enabled."""

    @override_settings(FHIR_RBAC_ENFORCEMENT=True)
    def test_denies_user_without_dedicated_permission(self, test_user):
        """An authenticated user cannot access FHIR merely by being logged in."""
        request = RequestFactory().get("/fhir/Patient")
        request.user = test_user

        assert not FHIRAccessPermission().has_permission(request, object())

    @override_settings(FHIR_RBAC_ENFORCEMENT=True)
    def test_allows_user_with_dedicated_permission(self, test_user):
        """The dedicated Django permission explicitly grants FHIR access."""
        permission = Permission.objects.get(
            content_type__app_label="core",
            codename="access_fhir_api",
        )
        test_user.user_permissions.add(permission)
        request = RequestFactory().get("/fhir/Patient")
        request.user = test_user

        assert FHIRAccessPermission().has_permission(request, object())

    @override_settings(FHIR_RBAC_ENFORCEMENT=True)
    def test_read_permission_does_not_grant_fhir_writes(self, test_user):
        """FHIR writes require the separate write capability."""
        permission = Permission.objects.get(
            content_type__app_label="core",
            codename="access_fhir_api",
        )
        test_user.user_permissions.add(permission)
        request = RequestFactory().post("/fhir/Patient/")
        request.user = test_user

        assert not FHIRAccessPermission().has_permission(request, object())

    def test_fhir_matrix_actions_sync_to_the_matching_group_permissions(self):
        """FHIR matrix entries materialize into read and write Django permissions."""
        from hmis.apps.core.models import Role
        from hmis.apps.core.role_permissions_sync import sync_role_group_permissions

        role = Role.objects.create(
            code="FHIR_TEST",
            name="FHIR Test",
            hierarchy_level=1,
            permissions_matrix={"FHIR": {"read": True, "create": True}},
        )
        sync_role_group_permissions(role)

        assert set(
            role.django_group.permissions.filter(codename__contains="fhir_api").values_list(
                "codename", flat=True
            )
        ) == {"access_fhir_api", "write_fhir_api"}


class TestSMARTOAuthApplicationAdmin:
    """OAuth admin must use secure defaults and explain partner-controlled URLs."""

    def test_custom_admin_is_registered_with_secure_defaults(self, rf):
        """Applications use confidential authorization-code defaults, not guessed URLs."""
        registered_admin = admin.site._registry[Application]
        assert isinstance(registered_admin, SMARTOAuthApplicationAdmin)

        request = rf.get("/admin/oauth2_provider/application/add/")
        initial = registered_admin.get_changeform_initial_data(request)
        assert initial["client_type"] == Application.CLIENT_CONFIDENTIAL
        assert initial["authorization_grant_type"] == Application.GRANT_AUTHORIZATION_CODE
        assert initial["hash_client_secret"] is True
        assert initial["skip_authorization"] is False

    def test_form_explains_and_rejects_unsafe_partner_urls(self):
        """Redirects and CORS origins remain editable but are strictly validated."""
        assert (
            "callback" in SMARTOAuthApplicationForm.base_fields["redirect_uris"].help_text.lower()
        )

        with pytest.raises(Exception, match="HTTPS"):
            SMARTOAuthApplicationForm._validate_uri_list(
                "http://partner.example/callback",
                "Redirect URIs",
            )

        with pytest.raises(Exception, match="origins"):
            SMARTOAuthApplicationForm._validate_uri_list(
                "https://partner.example/callback",
                "Allowed origins",
                origin_only=True,
            )
