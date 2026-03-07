"""
Tests for RBAC API endpoints.
Following TDD approach: Write tests FIRST, then implement.

Sprint 1.1-1.2 Track C: RBAC Foundation - Phase 5
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


@pytest.mark.django_db
class TestDepartmentAPI:
    """Tests for Department API endpoints."""

    @pytest.fixture
    def api_client(self):
        """Get API client."""
        return APIClient()

    @pytest.fixture
    def admin_user(self):
        """Create admin user."""
        return User.objects.create_superuser(
            username="admin", email="admin@test.com", password="adminpass123"
        )

    @pytest.fixture
    def authenticated_client(self, api_client, admin_user):
        """Get authenticated API client."""
        api_client.force_authenticate(user=admin_user)
        return api_client

    @pytest.fixture
    def sample_department(self):
        """Create sample department."""
        from hmis.apps.core.models import Department

        return Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
        )

    def test_list_departments_authenticated(self, authenticated_client, sample_department):
        """Should list departments for authenticated users."""
        response = authenticated_client.get("/api/departments/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1
        assert any(d["code"] == "OPD" for d in response.data["results"])

    def test_list_departments_unauthenticated(self, api_client, sample_department):
        """Should deny access to unauthenticated users."""
        response = api_client.get("/api/departments/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_department_admin_only(self, authenticated_client):
        """Should allow admins to create departments."""
        data = {
            "code": "LAB",
            "name": "Laboratory",
            "department_type": "LABORATORY",
        }

        response = authenticated_client.post("/api/departments/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "LAB"

    def test_get_department_details(self, authenticated_client, sample_department):
        """Should retrieve department details."""
        response = authenticated_client.get(f"/api/departments/{sample_department.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "OPD"
        assert response.data["name"] == "Outpatient Department"
        assert response.data["description"] == ""
        assert response.data["department_type_display"] == "Clinical"

    def test_update_department_admin_only(self, authenticated_client, sample_department):
        """Should allow admins to update departments."""
        data = {"name": "Updated OPD", "description": "Handles walk-in visits"}

        response = authenticated_client.patch(f"/api/departments/{sample_department.id}/", data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated OPD"
        assert response.data["description"] == "Handles walk-in visits"

    def test_create_department_logs_audit_event(self, authenticated_client, admin_user):
        """Creating a department should generate an audit log entry."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.post(
            "/api/departments/",
            {
                "code": "RAD",
                "name": "Radiology",
                "department_type": "RADIOLOGY",
                "description": "Imaging services",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        audit = AuditLog.objects.filter(action="department_created").latest("timestamp")
        assert audit.user == admin_user
        assert audit.resource_type == "Department"
        assert audit.details["name"] == "Radiology"

    def test_delete_department_admin_only(self, authenticated_client, sample_department):
        """Should allow admins to delete departments."""
        response = authenticated_client.delete(f"/api/departments/{sample_department.id}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_list_staff_in_department(self, authenticated_client, sample_department):
        """Should list staff in a department."""
        from hmis.apps.core.models import Role, StaffProfile

        # Create role and staff
        role = Role.objects.create(code="NURSE", name="Nurse", category="CLINICAL")
        user = User.objects.create_user(username="nurse1", password="pass123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-001",
            primary_role=role,
            primary_department=sample_department,
            date_joined=date.today(),
        )

        response = authenticated_client.get(f"/api/departments/{sample_department.id}/staff/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_org_chart_returns_hierarchy_and_staff(self, authenticated_client):
        """Should return a non-paginated org chart payload with departments and staff."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        root_department = Department.objects.create(
            code="CLIN",
            name="Clinical Services",
            department_type="CLINICAL",
        )
        child_department = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
            parent=root_department,
        )
        role = Role.objects.create(code="NURSE", name="Nurse", category="CLINICAL")
        supervisor_user = User.objects.create_user(username="supervisor1", password="pass123")
        staff_user = User.objects.create_user(username="nurse2", password="pass123")

        supervisor = StaffProfile.objects.create(
            user=supervisor_user,
            employee_id="VH-2026-010",
            primary_role=role,
            primary_department=child_department,
            date_joined=date.today(),
        )
        child_department.head = supervisor
        child_department.save(update_fields=["head"])

        staff_member = StaffProfile.objects.create(
            user=staff_user,
            employee_id="VH-2026-011",
            primary_role=role,
            primary_department=child_department,
            supervisor=supervisor,
            date_joined=date.today(),
        )

        response = authenticated_client.get("/api/departments/org-chart/")

        assert response.status_code == status.HTTP_200_OK
        assert {"departments", "staff", "summary"}.issubset(response.data.keys())
        assert any(
            department["id"] == root_department.id and department["parent"] is None
            for department in response.data["departments"]
        )
        assert any(
            department["id"] == child_department.id and department["parent"] == root_department.id
            for department in response.data["departments"]
        )
        assert any(
            staff_entry["id"] == staff_member.id and staff_entry["supervisor"] == supervisor.id
            for staff_entry in response.data["staff"]
        )
        assert response.data["summary"]["department_count"] >= 2
        assert response.data["summary"]["staff_count"] >= 2
        assert response.data["summary"]["root_department_count"] >= 1

    def test_org_chart_excludes_inactive_records_by_default(self, authenticated_client):
        """Should exclude inactive departments and non-active staff unless requested."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        inactive_department = Department.objects.create(
            code="ARCH",
            name="Archived Department",
            department_type="ADMINISTRATIVE",
            is_active=False,
        )
        active_department = Department.objects.create(
            code="LAB",
            name="Laboratory",
            department_type="LABORATORY",
        )
        role = Role.objects.create(code="LABTECH", name="Lab Tech", category="TECHNICAL")
        inactive_user = User.objects.create_user(username="inactive_staff", password="pass123")
        active_user = User.objects.create_user(username="active_staff", password="pass123")

        StaffProfile.objects.create(
            user=inactive_user,
            employee_id="VH-2026-012",
            primary_role=role,
            primary_department=inactive_department,
            employment_status="TERMINATED",
            date_joined=date.today(),
        )
        active_staff = StaffProfile.objects.create(
            user=active_user,
            employee_id="VH-2026-013",
            primary_role=role,
            primary_department=active_department,
            employment_status="ACTIVE",
            date_joined=date.today(),
        )

        default_response = authenticated_client.get("/api/departments/org-chart/")

        assert default_response.status_code == status.HTTP_200_OK
        assert all(
            department["id"] != inactive_department.id
            for department in default_response.data["departments"]
        )
        assert all(
            staff_entry["employment_status"] == "ACTIVE"
            for staff_entry in default_response.data["staff"]
        )
        assert any(
            staff_entry["id"] == active_staff.id
            for staff_entry in default_response.data["staff"]
        )

        include_inactive_response = authenticated_client.get(
            "/api/departments/org-chart/?include_inactive=true"
        )

        assert include_inactive_response.status_code == status.HTTP_200_OK
        assert any(
            department["id"] == inactive_department.id
            for department in include_inactive_response.data["departments"]
        )
        assert any(
            staff_entry["employment_status"] == "TERMINATED"
            for staff_entry in include_inactive_response.data["staff"]
        )


@pytest.mark.django_db
class TestRoleAPI:
    """Tests for Role API endpoints."""

    @pytest.fixture
    def api_client(self):
        """Get API client."""
        return APIClient()

    @pytest.fixture
    def admin_user(self):
        """Create admin user."""
        return User.objects.create_superuser(
            username="admin", email="admin@test.com", password="adminpass123"
        )

    @pytest.fixture
    def authenticated_client(self, api_client, admin_user):
        """Get authenticated API client."""
        api_client.force_authenticate(user=admin_user)
        return api_client

    @pytest.fixture
    def sample_role(self):
        """Create sample role."""
        from hmis.apps.core.models import Role

        return Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
            requires_license=True,
            license_body="KMPDB",
            permissions_matrix={
                "Patient": {"read": True, "create": True, "update": True, "delete": False}
            },
        )

    def test_list_roles_authenticated(self, authenticated_client, sample_role):
        """Should list roles for authenticated users."""
        response = authenticated_client.get("/api/roles/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_roles_unauthenticated(self, api_client, sample_role):
        """Should deny access to unauthenticated users."""
        response = api_client.get("/api/roles/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_role_admin_only(self, authenticated_client):
        """Should allow admins to create roles."""
        data = {
            "code": "NURSE",
            "name": "Registered Nurse",
            "category": "CLINICAL",
            "requires_license": True,
            "license_body": "NCK",
            "permissions_matrix": {"Patient": {"read": True, "create": True}},
        }

        response = authenticated_client.post("/api/roles/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "NURSE"

    def test_get_role_details(self, authenticated_client, sample_role):
        """Should retrieve role details."""
        response = authenticated_client.get(f"/api/roles/{sample_role.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "DOCTOR"
        assert response.data["requires_license"] is True
        assert response.data["category_display"] == "Clinical Staff"

    def test_update_role_logs_audit_event(self, authenticated_client, sample_role, admin_user):
        """Updating a role should generate an audit log entry."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.patch(
            f"/api/roles/{sample_role.id}/",
            {"description": "Updated role description"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        audit = AuditLog.objects.filter(action="role_updated").latest("timestamp")
        assert audit.user == admin_user
        assert audit.resource_type == "Role"
        assert audit.resource_id == sample_role.id

    def test_get_role_permissions_matrix(self, authenticated_client, sample_role):
        """Should return role's permission matrix."""
        response = authenticated_client.get(f"/api/roles/{sample_role.id}/permissions/")

        assert response.status_code == status.HTTP_200_OK
        assert "Patient" in response.data
        assert response.data["Patient"]["read"] is True


@pytest.mark.django_db
class TestStaffProfileAPI:
    """Tests for StaffProfile API endpoints."""

    @pytest.fixture
    def api_client(self):
        """Get API client."""
        return APIClient()

    @pytest.fixture
    def admin_user(self):
        """Create admin user."""
        return User.objects.create_superuser(
            username="admin", email="admin@test.com", password="adminpass123"
        )

    @pytest.fixture
    def authenticated_client(self, api_client, admin_user):
        """Get authenticated API client."""
        api_client.force_authenticate(user=admin_user)
        return api_client

    @pytest.fixture
    def sample_staff(self):
        """Create sample staff profile."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        department = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
        )

        role = Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
        )

        user = User.objects.create_user(
            username="doctor1",
            email="doctor1@test.com",
            password="pass123",
            first_name="John",
            last_name="Doe",
        )

        return StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-001",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

    def test_list_staff_authenticated(self, authenticated_client, sample_staff):
        """Should list staff for authenticated users."""
        response = authenticated_client.get("/api/staff/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_staff_unauthenticated(self, api_client, sample_staff):
        """Should deny access to unauthenticated users."""
        response = api_client.get("/api/staff/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_staff_admin_only(self, authenticated_client):
        """Should allow admins to create staff."""
        from hmis.apps.core.models import Department, Role

        department = Department.objects.create(
            code="LAB",
            name="Laboratory",
            department_type="LABORATORY",
        )

        role = Role.objects.create(
            code="LAB_TECH",
            name="Lab Technician",
            category="TECHNICAL",
        )

        # StaffProfileCreateSerializer expects user fields to create a new user
        data = {
            "username": "labtech1",
            "email": "labtech1@example.com",
            "first_name": "Lab",
            "last_name": "Technician",
            "employee_id": "VH-2026-002",
            "role": role.id,
            "department": department.id,
            "hire_date": str(date.today()),
        }

        response = authenticated_client.post("/api/staff/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["employee_id"] == "VH-2026-002"

    def test_get_staff_profile(self, authenticated_client, sample_staff):
        """Should retrieve staff profile."""
        response = authenticated_client.get(f"/api/staff/{sample_staff.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["employee_id"] == "VH-2026-001"

    def test_update_staff_profile(self, authenticated_client, sample_staff):
        """Should allow updating staff profile."""
        from hmis.apps.core.models import Department, Role

        new_department = Department.objects.create(
            code="LAB",
            name="Laboratory",
            department_type="LABORATORY",
            description="Diagnostics",
        )
        new_role = Role.objects.create(
            code="CONSULTANT",
            name="Consultant",
            category="CLINICAL",
        )
        data = {
            "title": "Dr.",
            "first_name": "Jane",
            "last_name": "Roe",
            "email": "jane.roe@example.com",
            "department": new_department.id,
            "role": new_role.id,
        }

        response = authenticated_client.patch(f"/api/staff/{sample_staff.id}/", data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "Dr."
        assert response.data["user_first_name"] == "Jane"
        assert response.data["user_last_name"] == "Roe"
        assert response.data["user_email"] == "jane.roe@example.com"
        assert response.data["primary_department"] == new_department.id
        assert response.data["primary_role"] == new_role.id

    def test_update_staff_profile_logs_audit_event(self, authenticated_client, sample_staff, admin_user):
        """Updating staff should generate an audit log entry."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.patch(
            f"/api/staff/{sample_staff.id}/",
            {"title": "Dr."},
        )

        assert response.status_code == status.HTTP_200_OK
        audit = AuditLog.objects.filter(action="staff_updated").latest("timestamp")
        assert audit.user == admin_user
        assert audit.resource_type == "StaffProfile"
        assert audit.resource_id == sample_staff.id

    def test_get_current_user_profile(self, api_client, sample_staff):
        """Should return current user's staff profile."""
        api_client.force_authenticate(user=sample_staff.user)

        response = api_client.get("/api/staff/me/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["employee_id"] == "VH-2026-001"

    def test_staff_search(self, authenticated_client, sample_staff):
        """Should search staff by name or employee_id."""
        response = authenticated_client.get("/api/staff/?search=VH-2026")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_staff_filter_by_department(self, authenticated_client, sample_staff):
        """Should filter staff by department."""
        response = authenticated_client.get(
            f"/api/staff/?primary_department={sample_staff.primary_department.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_staff_filter_by_role(self, authenticated_client, sample_staff):
        """Should filter staff by role."""
        response = authenticated_client.get(
            f"/api/staff/?primary_role={sample_staff.primary_role.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_get_current_user_permissions(self, api_client, sample_staff):
        """Should return the current user's permissions list."""
        api_client.force_authenticate(user=sample_staff.user)

        response = api_client.get("/api/me/permissions/")

        assert response.status_code == status.HTTP_200_OK
        assert "permissions" in response.data
        assert isinstance(response.data["permissions"], list)
