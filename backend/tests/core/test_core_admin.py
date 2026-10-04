"""Tests for core Django admin helpers."""

import pytest  # type: ignore
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory

pytestmark = pytest.mark.django_db


class TestStaffProfileAdmin:
    """Regression tests for StaffProfile admin display helpers."""

    def test_license_display_handles_incomplete_add_form_object(self):
        """Readonly display helpers should not 500 before primary_role is set."""
        from django.contrib import admin

        from hmis.apps.core.admin import StaffProfileAdmin
        from hmis.apps.core.models import StaffProfile

        model_admin = StaffProfileAdmin(StaffProfile, admin.site)

        assert model_admin.is_license_valid_display(StaffProfile()) is None
        assert model_admin.is_license_valid_display(None) is None


class TestUserAdminForms:
    """Regression tests for Django UserAdmin add/change form selection."""

    def test_add_user_admin_page_renders_for_superuser(self, client):
        """The platform-admin add-user route must not raise a form FieldError."""
        User = get_user_model()
        superuser = User.objects.create_superuser(
            username="platform_admin",
            email="platform-admin@example.com",
            password="SuperSecure1!",
        )
        client.force_login(superuser)

        response = client.get("/admin/auth/user/add/")

        assert response.status_code == 200
        assert "password1" in response.content.decode()
        assert "password2" in response.content.decode()

    def test_add_form_includes_django_password_creation_fields(self, test_user):
        """The add-user page must use Django's creation form, not the MFA change form."""
        from hmis.apps.core.admin_user_audit import UserAdmin

        User = get_user_model()
        model_admin = UserAdmin(User, admin.site)
        request = RequestFactory().get("/admin/auth/user/add/")
        request.user = test_user
        form_class = model_admin.get_form(request)

        assert {"username", "usable_password", "password1", "password2"} <= set(
            form_class.base_fields
        )
        assert "mfa_disabled_toggle" not in form_class.base_fields

    def test_change_form_includes_mfa_management_fields(self, test_user):
        """The existing-user page must retain its MFA management controls."""
        from hmis.apps.core.admin_user_audit import UserAdmin

        User = get_user_model()
        model_admin = UserAdmin(User, admin.site)
        request = RequestFactory().get(f"/admin/auth/user/{test_user.pk}/change/")
        request.user = test_user

        form_class = model_admin.get_form(request, obj=test_user, change=True)
        fieldsets = model_admin.get_fieldsets(request, obj=test_user)

        assert "mfa_disabled_toggle" in form_class.base_fields
        assert any("mfa_disabled_toggle" in fields["fields"] for _, fields in fieldsets)
