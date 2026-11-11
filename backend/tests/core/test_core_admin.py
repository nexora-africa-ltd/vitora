"""Tests for core Django admin helpers."""

from unittest.mock import PropertyMock

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

    def test_hwr_identifier_display_does_not_decrypt_pii(self, test_staff_profile, mocker):
        """Admin change pages must not call Key Vault just to render a staff profile."""
        from hmis.apps.core.admin import StaffProfileAdmin
        from hmis.apps.core.models import StaffProfile

        test_staff_profile.hwr_national_id_encrypted = "v2.encrypted-value"
        mocker.patch.object(
            StaffProfile,
            "hwr_national_id",
            new_callable=PropertyMock,
            side_effect=AssertionError("PII decryption must not run while rendering admin"),
        )
        model_admin = StaffProfileAdmin(StaffProfile, admin.site)

        assert model_admin.hwr_national_id_display(test_staff_profile) == "Stored securely"

    def test_staff_profile_change_page_does_not_decrypt_hwr_identifier(
        self, client, test_staff_profile, mocker
    ):
        """Staff/user profile edits must not block on Key Vault PII decryption."""
        from hmis.apps.core.models import StaffProfile

        User = get_user_model()
        superuser = User.objects.create_superuser(
            username="staff_profile_admin",
            email="staff-profile-admin@example.com",
            password="SuperSecure1!",
        )
        test_staff_profile.hwr_national_id_encrypted = "v2.encrypted-value"
        test_staff_profile.save(update_fields=["hwr_national_id_encrypted"])
        mocker.patch.object(
            StaffProfile,
            "hwr_national_id",
            new_callable=PropertyMock,
            side_effect=AssertionError("PII decryption must not run while rendering admin"),
        )
        client.force_login(superuser)

        response = client.get(f"/admin/core/staffprofile/{test_staff_profile.pk}/change/")

        assert response.status_code == 200
        assert b"Stored securely" in response.content

    def test_facility_change_form_does_not_decrypt_biometrics_identifier(
        self, client, sample_facility, mocker
    ):
        """Opening a facility edit page must not block on Key Vault PII decryption."""
        from hmis.apps.core.models import Facility

        User = get_user_model()
        superuser = User.objects.create_superuser(
            username="facility_admin",
            email="facility-admin@example.com",
            password="SuperSecure1!",
        )
        sample_facility.biometrics_agent_national_id_encrypted = "v2.encrypted-value"
        sample_facility.save(update_fields=["biometrics_agent_national_id_encrypted"])
        mocker.patch.object(
            Facility,
            "biometrics_agent_national_id",
            new_callable=PropertyMock,
            side_effect=AssertionError("PII decryption must not run while rendering admin"),
        )
        client.force_login(superuser)

        response = client.get(f"/admin/core/facility/{sample_facility.pk}/change/")

        assert response.status_code == 200
        assert b"Leave blank to keep the existing encrypted value." in response.content

    def test_facility_location_choices_avoid_per_option_parent_queries(
        self, sample_facility, sample_county
    ):
        """Facility admin location selectors must not issue an N+1 query per option."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        from hmis.apps.core.admin_facility_security import FacilityAdminForm
        from hmis.apps.core.models import SubCounty

        SubCounty.objects.create(county=sample_county, name="Second Test Sub-County")
        form = FacilityAdminForm(instance=sample_facility)

        with CaptureQueriesContext(connection) as queries:
            labels = [str(sub_county) for sub_county in form.fields["sub_county"].queryset]

        assert len(labels) >= 2
        assert len(queries) == 1


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
        assert "mfa_required_toggle" in form_class.base_fields
        assert any("mfa_disabled_toggle" in fields["fields"] for _, fields in fieldsets)
        assert any("mfa_required_toggle" in fields["fields"] for _, fields in fieldsets)

    def test_user_change_page_renders_without_decrypting_staff_pii(
        self, client, test_user, test_staff_profile, mocker
    ):
        """User account edits remain independent of encrypted StaffProfile fields."""
        from hmis.apps.core.models import StaffProfile

        User = get_user_model()
        superuser = User.objects.create_superuser(
            username="user_admin",
            email="user-admin@example.com",
            password="SuperSecure1!",
        )
        mocker.patch.object(
            StaffProfile,
            "hwr_national_id",
            new_callable=PropertyMock,
            side_effect=AssertionError("PII decryption must not run while rendering user admin"),
        )
        client.force_login(superuser)

        response = client.get(f"/admin/auth/user/{test_user.pk}/change/")

        assert response.status_code == 200

    def test_user_permission_choices_avoid_content_type_n_plus_one(self, test_user):
        """Permission labels must be eager-loaded before the admin change form renders."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        from hmis.apps.core.admin_user_audit import UserAdmin

        User = get_user_model()
        model_admin = UserAdmin(User, admin.site)
        request = RequestFactory().get(f"/admin/auth/user/{test_user.pk}/change/")
        request.user = User.objects.create_superuser(
            username="permission_choices_admin",
            email="permission-choices-admin@example.com",
            password="SuperSecure1!",
        )
        form_class = model_admin.get_form(request, obj=test_user, change=True)

        with CaptureQueriesContext(connection) as queries:
            labels = [
                str(permission)
                for permission in form_class.base_fields["user_permissions"].queryset
            ]

        assert labels
        assert len(queries) == 1
