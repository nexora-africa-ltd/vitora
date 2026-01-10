"""
Tests for RBAC API endpoints.
Following TDD approach: Write tests FIRST, then implement.

Sprint 1.1-1.2 Track C: RBAC Foundation - Phase 5
"""

from datetime import date

import pytest # type: ignore
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
            username="admin",
            email="admin@test.com",
            password="adminpass123"
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
        response = authenticated_client.get('/api/departments/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
        assert any(d['code'] == 'OPD' for d in response.data['results'])

    def test_list_departments_unauthenticated(self, api_client, sample_department):
        """Should deny access to unauthenticated users."""
        response = api_client.get('/api/departments/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_department_admin_only(self, authenticated_client):
        """Should allow admins to create departments."""
        data = {
            'code': 'LAB',
            'name': 'Laboratory',
            'department_type': 'LABORATORY',
        }

        response = authenticated_client.post('/api/departments/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['code'] == 'LAB'

    def test_get_department_details(self, authenticated_client, sample_department):
        """Should retrieve department details."""
        response = authenticated_client.get(f'/api/departments/{sample_department.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['code'] == 'OPD'
        assert response.data['name'] == 'Outpatient Department'

    def test_update_department_admin_only(self, authenticated_client, sample_department):
        """Should allow admins to update departments."""
        data = {'name': 'Updated OPD'}

        response = authenticated_client.patch(
            f'/api/departments/{sample_department.id}/',
            data
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated OPD'

    def test_delete_department_admin_only(self, authenticated_client, sample_department):
        """Should allow admins to delete departments."""
        response = authenticated_client.delete(f'/api/departments/{sample_department.id}/')

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

        response = authenticated_client.get(f'/api/departments/{sample_department.id}/staff/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1


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
            username="admin",
            email="admin@test.com",
            password="adminpass123"
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
            }
        )

    def test_list_roles_authenticated(self, authenticated_client, sample_role):
        """Should list roles for authenticated users."""
        response = authenticated_client.get('/api/roles/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1

    def test_list_roles_unauthenticated(self, api_client, sample_role):
        """Should deny access to unauthenticated users."""
        response = api_client.get('/api/roles/')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_role_admin_only(self, authenticated_client):
        """Should allow admins to create roles."""
        data = {
            'code': 'NURSE',
            'name': 'Registered Nurse',
            'category': 'CLINICAL',
            'requires_license': True,
            'license_body': 'NCK',
            'permissions_matrix': {
                'Patient': {'read': True, 'create': True}
            }
        }

        response = authenticated_client.post('/api/roles/', data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['code'] == 'NURSE'

    def test_get_role_details(self, authenticated_client, sample_role):
        """Should retrieve role details."""
        response = authenticated_client.get(f'/api/roles/{sample_role.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['code'] == 'DOCTOR'
        assert response.data['requires_license'] is True

    def test_get_role_permissions_matrix(self, authenticated_client, sample_role):
        """Should return role's permission matrix."""
        response = authenticated_client.get(f'/api/roles/{sample_role.id}/permissions/')

        assert response.status_code == status.HTTP_200_OK
        assert 'Patient' in response.data
        assert response.data['Patient']['read'] is True


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
            username="admin",
            email="admin@test.com",
            password="adminpass123"
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
            last_name="Doe"
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
        response = authenticated_client.get('/api/staff/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1

    def test_list_staff_unauthenticated(self, api_client, sample_staff):
        """Should deny access to unauthenticated users."""
        response = api_client.get('/api/staff/')

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

        user = User.objects.create_user(
            username="labtech1",
            password="pass123"
        )

        data = {
            'user': user.id,
            'employee_id': 'VH-2026-002',
            'primary_role': role.id,
            'primary_department': department.id,
            'date_joined': str(date.today()),
        }

        response = authenticated_client.post('/api/staff/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['employee_id'] == 'VH-2026-002'

    def test_get_staff_profile(self, authenticated_client, sample_staff):
        """Should retrieve staff profile."""
        response = authenticated_client.get(f'/api/staff/{sample_staff.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['employee_id'] == 'VH-2026-001'

    def test_update_staff_profile(self, authenticated_client, sample_staff):
        """Should allow updating staff profile."""
        data = {'title': 'Dr.'}

        response = authenticated_client.patch(
            f'/api/staff/{sample_staff.id}/',
            data
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['title'] == 'Dr.'

    def test_get_current_user_profile(self, api_client, sample_staff):
        """Should return current user's staff profile."""
        api_client.force_authenticate(user=sample_staff.user)

        response = api_client.get('/api/staff/me/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['employee_id'] == 'VH-2026-001'

    def test_staff_search(self, authenticated_client, sample_staff):
        """Should search staff by name or employee_id."""
        response = authenticated_client.get('/api/staff/?search=VH-2026')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1

    def test_staff_filter_by_department(self, authenticated_client, sample_staff):
        """Should filter staff by department."""
        response = authenticated_client.get(
            f'/api/staff/?primary_department={sample_staff.primary_department.id}'
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1

    def test_staff_filter_by_role(self, authenticated_client, sample_staff):
        """Should filter staff by role."""
        response = authenticated_client.get(
            f'/api/staff/?primary_role={sample_staff.primary_role.id}'
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
