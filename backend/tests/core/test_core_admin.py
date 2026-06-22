"""Tests for core Django admin helpers."""

import pytest  # type: ignore

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
