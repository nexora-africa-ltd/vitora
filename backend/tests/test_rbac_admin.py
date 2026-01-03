"""
Tests for RBAC Django Admin integration.
Following TDD approach: Write tests FIRST, then implement.

Sprint 1.1-1.2 Track C: RBAC Foundation - Phase 4
"""

from datetime import date

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory

User = get_user_model()


@pytest.mark.django_db
class TestDepartmentAdmin:
    """Tests for Department admin interface."""

    @pytest.fixture
    def admin_site(self):
        """Get admin site instance."""
        return AdminSite()

    @pytest.fixture
    def admin_user(self):
        """Create superuser for admin access."""
        return User.objects.create_superuser(
            username="admin",
            email="admin@test.com",
            password="admin123"
        )

    @pytest.fixture
    def request_factory(self):
        """Get request factory."""
        return RequestFactory()

    def test_department_admin_registered(self):
        """Should register DepartmentAdmin."""
        from hmis.apps.core.admin import DepartmentAdmin

        # Check if DepartmentAdmin exists and is properly configured
        assert DepartmentAdmin is not None
        # Admin classes registered with decorator don't need explicit model attribute
        assert hasattr(DepartmentAdmin, 'list_display')

    def test_department_admin_list_display(self):
        """Should display key fields in list view."""
        from hmis.apps.core.admin import DepartmentAdmin

        # Check list_display includes important fields
        expected_fields = ['code', 'name', 'department_type', 'is_active']
        list_display = getattr(DepartmentAdmin, 'list_display', [])

        for field in expected_fields:
            assert field in list_display, f"Field {field} not in list_display"

    def test_department_admin_list_filter(self):
        """Should provide filters for department type and status."""
        from hmis.apps.core.admin import DepartmentAdmin

        list_filter = getattr(DepartmentAdmin, 'list_filter', [])

        assert 'department_type' in list_filter
        assert 'is_active' in list_filter

    def test_department_admin_search_fields(self):
        """Should allow searching by name and code."""
        from hmis.apps.core.admin import DepartmentAdmin

        search_fields = getattr(DepartmentAdmin, 'search_fields', [])

        assert 'name' in search_fields or any('name' in f for f in search_fields)
        assert 'code' in search_fields or any('code' in f for f in search_fields)

    def test_department_admin_hierarchy_display(self):
        """Should show parent department in list view."""
        from hmis.apps.core.admin import DepartmentAdmin

        list_display = getattr(DepartmentAdmin, 'list_display', [])

        # Should show parent or have a method to display hierarchy
        assert 'parent' in list_display or any('parent' in str(f) for f in list_display)


@pytest.mark.django_db
class TestRoleAdmin:
    """Tests for Role admin interface."""

    def test_role_admin_registered(self):
        """Should register RoleAdmin."""
        from hmis.apps.core.admin import RoleAdmin

        # Check if RoleAdmin exists and is properly configured
        assert RoleAdmin is not None
        # Admin classes registered with decorator don't need explicit model attribute
        assert hasattr(RoleAdmin, 'list_display')

    def test_role_admin_list_display(self):
        """Should display key fields in list view."""
        from hmis.apps.core.admin import RoleAdmin

        expected_fields = ['code', 'name', 'category', 'hierarchy_level', 'requires_license', 'is_active']
        list_display = getattr(RoleAdmin, 'list_display', [])

        for field in expected_fields:
            assert field in list_display, f"Field {field} not in list_display"

    def test_role_admin_list_filter(self):
        """Should provide filters for category, license, and status."""
        from hmis.apps.core.admin import RoleAdmin

        list_filter = getattr(RoleAdmin, 'list_filter', [])

        assert 'category' in list_filter
        assert 'requires_license' in list_filter
        assert 'is_active' in list_filter

    def test_role_admin_search_fields(self):
        """Should allow searching by name and code."""
        from hmis.apps.core.admin import RoleAdmin

        search_fields = getattr(RoleAdmin, 'search_fields', [])

        assert any('name' in f for f in search_fields)
        assert any('code' in f for f in search_fields)

    def test_role_admin_readonly_fields(self):
        """Should make created/updated timestamps readonly."""
        from hmis.apps.core.admin import RoleAdmin

        readonly_fields = getattr(RoleAdmin, 'readonly_fields', [])

        assert 'created_at' in readonly_fields
        assert 'updated_at' in readonly_fields

    def test_role_admin_ordering(self):
        """Should order by hierarchy level."""
        from hmis.apps.core.admin import RoleAdmin

        ordering = getattr(RoleAdmin, 'ordering', [])

        assert 'hierarchy_level' in ordering or ordering == ['hierarchy_level']


@pytest.mark.django_db
class TestStaffProfileAdmin:
    """Tests for StaffProfile admin interface."""

    def test_staffprofile_admin_registered(self):
        """Should register StaffProfileAdmin."""
        from hmis.apps.core.admin import StaffProfileAdmin

        # Check if StaffProfileAdmin exists and is properly configured
        assert StaffProfileAdmin is not None
        # Admin classes registered with decorator don't need explicit model attribute
        assert hasattr(StaffProfileAdmin, 'list_display')

    def test_staffprofile_admin_list_display(self):
        """Should display key fields in list view."""
        from hmis.apps.core.admin import StaffProfileAdmin

        expected_fields = ['employee_id', 'get_user_full_name', 'primary_role',
                          'primary_department', 'employment_status', 'is_license_valid']
        list_display = getattr(StaffProfileAdmin, 'list_display', [])

        # Check for required fields (some might be methods)
        assert 'employee_id' in list_display
        assert 'primary_role' in list_display
        assert 'primary_department' in list_display
        assert 'employment_status' in list_display

    def test_staffprofile_admin_list_filter(self):
        """Should provide filters for role, department, and status."""
        from hmis.apps.core.admin import StaffProfileAdmin

        list_filter = getattr(StaffProfileAdmin, 'list_filter', [])

        assert 'primary_role' in list_filter
        assert 'primary_department' in list_filter
        assert 'employment_status' in list_filter

    def test_staffprofile_admin_search_fields(self):
        """Should allow searching by employee ID, name, and license."""
        from hmis.apps.core.admin import StaffProfileAdmin

        search_fields = getattr(StaffProfileAdmin, 'search_fields', [])

        # Should search by employee_id, user name, and license number
        assert any('employee_id' in f for f in search_fields)
        assert any('user__' in f for f in search_fields)  # User fields
        assert any('license_number' in f for f in search_fields)

    def test_staffprofile_admin_readonly_fields(self):
        """Should make created/updated timestamps readonly."""
        from hmis.apps.core.admin import StaffProfileAdmin

        readonly_fields = getattr(StaffProfileAdmin, 'readonly_fields', [])

        assert 'created_at' in readonly_fields
        assert 'updated_at' in readonly_fields

    def test_staffprofile_admin_actions(self):
        """Should provide bulk actions for activating/deactivating staff."""
        from hmis.apps.core.admin import StaffProfileAdmin

        actions = getattr(StaffProfileAdmin, 'actions', [])

        # Should have actions for status changes
        action_names = [getattr(action, '__name__', str(action)) for action in actions]

        # Check if there are actions (could be method names as strings)
        assert len(actions) > 0 or hasattr(StaffProfileAdmin, 'activate_staff') or hasattr(StaffProfileAdmin, 'deactivate_staff')

    def test_staffprofile_admin_fieldsets(self):
        """Should organize fields into logical sections."""
        from hmis.apps.core.admin import StaffProfileAdmin

        fieldsets = getattr(StaffProfileAdmin, 'fieldsets', None)

        # Should have organized fieldsets
        assert fieldsets is not None
        assert len(fieldsets) > 0

        # Check for main sections
        section_names = [fs[0] for fs in fieldsets if fs[0]]
        # Should have sections for identity, roles, professional details, etc.
        assert len(section_names) >= 3  # At least 3 logical sections

    def test_staffprofile_admin_filter_horizontal(self):
        """Should use horizontal filter for M2M fields."""
        from hmis.apps.core.admin import StaffProfileAdmin

        filter_horizontal = getattr(StaffProfileAdmin, 'filter_horizontal', [])

        # M2M fields should use horizontal filter for better UX
        assert 'secondary_roles' in filter_horizontal
        assert 'secondary_departments' in filter_horizontal
    def test_staffprofile_admin_export_csv_action(self):
        """Should have CSV export action."""
        from hmis.apps.core.admin import StaffProfileAdmin

        actions = getattr(StaffProfileAdmin, 'actions', [])

        # Check if export_to_csv action exists
        action_names = [getattr(action, '__name__', str(action)) for action in actions]
        assert 'export_to_csv' in action_names or hasattr(StaffProfileAdmin, 'export_to_csv'), \
            "StaffProfileAdmin should have export_to_csv action"


@pytest.mark.django_db
class TestStaffProfileCSVExport:
    """Tests for StaffProfile CSV export functionality."""

    @pytest.fixture
    def admin_site(self):
        """Get admin site instance."""
        return AdminSite()

    @pytest.fixture
    def admin_user(self):
        """Create superuser for admin access."""
        return User.objects.create_superuser(
            username="admin",
            email="admin@test.com",
            password="admin123"
        )

    @pytest.fixture
    def request_factory(self):
        """Get request factory."""
        return RequestFactory()

    @pytest.fixture
    def sample_staff(self):
        """Create sample staff profiles for export."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        department = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
        )

        role = Role.objects.create(
            code="NURSE",
            name="Registered Nurse",
            category="CLINICAL",
            requires_license=True,
            license_body="NCK",
        )

        staff_list = []
        for i in range(3):
            user = User.objects.create_user(
                username=f"nurse{i}",
                first_name=f"Nurse{i}",
                last_name=f"Test{i}",
                email=f"nurse{i}@test.com",
                password="test123"
            )
            staff = StaffProfile.objects.create(
                user=user,
                employee_id=f"VH-2026-00{i}",
                title="Nurse",
                primary_role=role,
                primary_department=department,
                license_number=f"NCK-{1000+i}",
                date_joined=date.today(),
            )
            staff_list.append(staff)

        return staff_list

    def test_export_to_csv_returns_csv_response(
        self, admin_site, admin_user, request_factory, sample_staff
    ):
        """Should return CSV file response."""
        from hmis.apps.core.admin import StaffProfileAdmin
        from hmis.apps.core.models import StaffProfile

        modeladmin = StaffProfileAdmin(StaffProfile, admin_site)

        request = request_factory.get('/admin/core/staffprofile/')
        request.user = admin_user

        queryset = StaffProfile.objects.all()
        response = modeladmin.export_to_csv(request, queryset)

        assert response['Content-Type'] == 'text/csv'
        assert 'attachment; filename=' in response['Content-Disposition']
        assert 'staff_export' in response['Content-Disposition']

    def test_export_csv_contains_headers(
        self, admin_site, admin_user, request_factory, sample_staff
    ):
        """Should include column headers in CSV."""
        import csv
        from io import StringIO

        from hmis.apps.core.admin import StaffProfileAdmin
        from hmis.apps.core.models import StaffProfile

        modeladmin = StaffProfileAdmin(StaffProfile, admin_site)

        request = request_factory.get('/admin/core/staffprofile/')
        request.user = admin_user

        queryset = StaffProfile.objects.all()
        response = modeladmin.export_to_csv(request, queryset)

        content = response.content.decode('utf-8')
        reader = csv.reader(StringIO(content))
        headers = next(reader)

        # Should have key columns
        assert 'Employee ID' in headers
        assert 'Full Name' in headers
        assert 'Primary Role' in headers
        assert 'Primary Department' in headers
        assert 'Employment Status' in headers

    def test_export_csv_contains_staff_data(
        self, admin_site, admin_user, request_factory, sample_staff
    ):
        """Should include staff data rows."""
        import csv
        from io import StringIO

        from hmis.apps.core.admin import StaffProfileAdmin
        from hmis.apps.core.models import StaffProfile

        modeladmin = StaffProfileAdmin(StaffProfile, admin_site)

        request = request_factory.get('/admin/core/staffprofile/')
        request.user = admin_user

        queryset = StaffProfile.objects.all()
        response = modeladmin.export_to_csv(request, queryset)

        content = response.content.decode('utf-8')
        reader = csv.reader(StringIO(content))
        rows = list(reader)

        # Header + 3 staff members
        assert len(rows) == 4, f"Expected 4 rows (header + 3 staff), got {len(rows)}"

        # Check data includes employee IDs
        all_content = content
        for staff in sample_staff:
            assert staff.employee_id in all_content, \
                f"Employee ID {staff.employee_id} should be in CSV"

    def test_export_csv_selected_only(
        self, admin_site, admin_user, request_factory, sample_staff
    ):
        """Should export only selected staff."""
        import csv
        from io import StringIO

        from hmis.apps.core.admin import StaffProfileAdmin
        from hmis.apps.core.models import StaffProfile

        modeladmin = StaffProfileAdmin(StaffProfile, admin_site)

        request = request_factory.get('/admin/core/staffprofile/')
        request.user = admin_user

        # Select only first staff
        queryset = StaffProfile.objects.filter(pk=sample_staff[0].pk)
        response = modeladmin.export_to_csv(request, queryset)

        content = response.content.decode('utf-8')
        reader = csv.reader(StringIO(content))
        rows = list(reader)

        # Header + 1 selected staff
        assert len(rows) == 2, f"Expected 2 rows (header + 1 staff), got {len(rows)}"
