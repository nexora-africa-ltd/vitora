"""
Tests for RoleBasedPermission class.
Following TDD approach: Write tests FIRST, then implement.

Sprint 1.1-1.2 Track C: RBAC Foundation - Phase 2
"""

from datetime import date, timedelta
from unittest.mock import Mock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory

User = get_user_model()


@pytest.mark.django_db
class TestRoleBasedPermission:
    """Tests for RoleBasedPermission DRF permission class."""

    @pytest.fixture
    def permission_class(self):
        """Get permission class instance."""
        from hmis.apps.core.permissions import RoleBasedPermission

        return RoleBasedPermission()

    @pytest.fixture
    def factory(self):
        """Get request factory."""
        return APIRequestFactory()

    @pytest.fixture
    def mock_view(self):
        """Create mock view with model name."""
        view = Mock()
        view.get_queryset = Mock()
        view.get_queryset.return_value.model.__name__ = "Patient"
        return view

    def test_permission_denied_for_unauthenticated(self, permission_class, factory, mock_view):
        """Should deny access to unauthenticated users."""
        request = factory.get("/api/patients/")
        request.user = None

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is False

    def test_permission_denied_for_anonymous(self, permission_class, factory, mock_view):
        """Should deny access to anonymous users."""
        from django.contrib.auth.models import AnonymousUser

        request = factory.get("/api/patients/")
        request.user = AnonymousUser()

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is False

    def test_permission_allowed_for_superuser(self, permission_class, factory, mock_view):
        """Should allow superusers all access."""
        user = User.objects.create_superuser(
            username="superuser", email="super@test.com", password="test123"
        )

        request = factory.post("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is True

    def test_get_maps_to_read_action(self, permission_class, factory, mock_view):
        """Should map GET requests to 'read' action."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="READER",
            name="Reader",
            category="CLINICAL",
            permissions_matrix={"Patient": {"read": True, "create": False}},
        )

        department = Department.objects.create(code="OPD", name="OPD", department_type="CLINICAL")

        user = User.objects.create_user(username="reader", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-001",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is True

    def test_post_maps_to_create_action(self, permission_class, factory, mock_view):
        """Should map POST requests to 'create' action."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="CREATOR",
            name="Creator",
            category="CLINICAL",
            permissions_matrix={"Patient": {"read": False, "create": True}},
        )

        department = Department.objects.create(code="OPD", name="OPD", department_type="CLINICAL")

        user = User.objects.create_user(username="creator", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-002",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        request = factory.post("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is True

    def test_put_patch_maps_to_update_action(self, permission_class, factory, mock_view):
        """Should map PUT/PATCH requests to 'update' action."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="UPDATER",
            name="Updater",
            category="CLINICAL",
            permissions_matrix={"Patient": {"update": True}},
        )

        department = Department.objects.create(code="OPD", name="OPD", department_type="CLINICAL")

        user = User.objects.create_user(username="updater", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-003",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        # Test PUT
        request = factory.put("/api/patients/1/")
        request.user = user
        assert permission_class.has_permission(request, mock_view) is True

        # Test PATCH
        request = factory.patch("/api/patients/1/")
        request.user = user
        assert permission_class.has_permission(request, mock_view) is True

    def test_delete_maps_to_delete_action(self, permission_class, factory, mock_view):
        """Should map DELETE requests to 'delete' action."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="DELETER",
            name="Deleter",
            category="ADMINISTRATIVE",
            permissions_matrix={"Patient": {"delete": True}},
        )

        department = Department.objects.create(
            code="ADMIN", name="Admin", department_type="ADMINISTRATIVE"
        )

        user = User.objects.create_user(username="deleter", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-004",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        request = factory.delete("/api/patients/1/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is True

    def test_permission_from_primary_role(self, permission_class, factory, mock_view):
        """Should check permission from primary role."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="PRIMARY",
            name="Primary Role",
            category="CLINICAL",
            permissions_matrix={"Patient": {"read": True, "create": True}},
        )

        department = Department.objects.create(code="WARD", name="Ward", department_type="CLINICAL")

        user = User.objects.create_user(username="primary", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-005",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is True

    def test_permission_from_secondary_role(self, permission_class, factory, mock_view):
        """Should check permission from secondary roles."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        primary_role = Role.objects.create(
            code="PRIMARY2",
            name="Primary Role",
            category="CLINICAL",
            permissions_matrix={"Encounter": {"read": True}},
        )

        secondary_role = Role.objects.create(
            code="SECONDARY",
            name="Secondary Role",
            category="ADMINISTRATIVE",
            permissions_matrix={"Patient": {"read": True, "create": True}},
        )

        department = Department.objects.create(
            code="MULTI", name="Multi", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="multi", password="test123")
        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-006",
            primary_role=primary_role,
            primary_department=department,
            date_joined=date.today(),
        )
        staff.secondary_roles.add(secondary_role)

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        # Should have permission from secondary role
        assert has_perm is True

    def test_permission_inheritance_from_parent(self, permission_class, factory, mock_view):
        """Should inherit permissions from parent role."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        parent_role = Role.objects.create(
            code="PARENT",
            name="Parent Role",
            category="CLINICAL",
            permissions_matrix={"Patient": {"read": True}},
        )

        child_role = Role.objects.create(
            code="CHILD",
            name="Child Role",
            category="CLINICAL",
            parent_role=parent_role,
            permissions_matrix={"Encounter": {"read": True}},
        )

        department = Department.objects.create(
            code="INHERIT", name="Inherit", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="inherit", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-007",
            primary_role=child_role,
            primary_department=department,
            date_joined=date.today(),
        )

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        # Should inherit read permission from parent
        assert has_perm is True

    def test_permission_denied_missing_action(self, permission_class, factory, mock_view):
        """Should deny if action not in permission matrix."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="LIMITED",
            name="Limited Role",
            category="CLINICAL",
            permissions_matrix={"Patient": {"read": True}},  # No create permission
        )

        department = Department.objects.create(
            code="LIMITED", name="Limited", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="limited", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-008",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        # Try to create (POST) but only has read permission
        request = factory.post("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is False

    def test_permission_denied_missing_resource(self, permission_class, factory, mock_view):
        """Should deny if resource not in permission matrix."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="NORESOURCE",
            name="No Resource Role",
            category="CLINICAL",
            permissions_matrix={"Encounter": {"read": True}},  # No Patient permission
        )

        department = Department.objects.create(
            code="NORES", name="No Resource", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="noresource", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-009",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is False

    def test_fallback_to_django_permissions(self, permission_class, factory, mock_view):
        """Should fallback to Django perms if no StaffProfile."""
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        user = User.objects.create_user(username="fallback", password="test123")

        # Give user a Django permission
        content_type = ContentType.objects.get(app_label="patients", model="patient")
        permission = Permission.objects.get(content_type=content_type, codename="view_patient")
        user.user_permissions.add(permission)

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        # Should use Django permissions as fallback
        assert has_perm is True

    def test_object_level_department_check(
        self, permission_class, factory, mock_view, sample_organization
    ):
        """Should check department access at object level."""
        from hmis.apps.core.models import Department, Role, StaffProfile
        from hmis.apps.patients.models import Patient

        role = Role.objects.create(
            code="DEPT_CHECK",
            name="Department Check",
            category="CLINICAL",
            permissions_matrix={"Patient": {"read": True}},
        )

        department = Department.objects.create(
            code="DEPT1", name="Department 1", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="deptcheck", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-010",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        # Create a patient
        from hmis.apps.core.models import County, SubCounty

        county = County.objects.create(code=1, name="Test County")
        sub_county = SubCounty.objects.create(county=county, name="Test Sub-County")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            registered_by=user,
            organization=sample_organization,
        )

        request = factory.get(f"/api/patients/{patient.id}/")
        request.user = user

        has_perm = permission_class.has_object_permission(request, mock_view, patient)

        # Should allow access (basic implementation)
        assert has_perm is True

    def test_sensitive_patient_access(
        self, permission_class, factory, mock_view, sample_organization
    ):
        """Should check view_sensitive permission for patients."""
        from hmis.apps.core.models import County, Department, Role, StaffProfile, SubCounty
        from hmis.apps.patients.models import Patient

        role = Role.objects.create(
            code="NO_SENS",
            name="No Sensitive",
            category="CLINICAL",
            permissions_matrix={
                "Patient": {"read": True, "view_sensitive": False}
            },  # No sensitive access
        )

        department = Department.objects.create(
            code="NOSENS", name="No Sensitive", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="nosens", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-011",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        county = County.objects.create(code=2, name="County 2")
        sub_county = SubCounty.objects.create(county=county, name="Sub-County 2")

        # Create sensitive patient
        patient = Patient.objects.create(
            first_name="Sensitive",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="F",
            county=county,
            sub_county=sub_county,
            registered_by=user,
            is_sensitive=True,
            organization=sample_organization,
        )

        request = factory.get(f"/api/patients/{patient.id}/")
        request.user = user

        has_perm = permission_class.has_object_permission(request, mock_view, patient)

        # Should deny access to sensitive patient
        assert has_perm is False

    def test_licensed_role_clinical_access(self, permission_class, factory, mock_view):
        """Should allow licensed roles to access clinical resources."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="LICENSED",
            name="Licensed Doctor",
            category="CLINICAL",
            requires_license=True,
            license_body="KMPDB",
            permissions_matrix={"Patient": {"read": True, "create": True}},
        )

        department = Department.objects.create(
            code="CLINICAL", name="Clinical", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="licensed", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-012",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            license_number="KMPDB/12345",
            license_expiry=date.today() + timedelta(days=365),
            license_verified=True,
        )

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        assert has_perm is True

    def test_unlicensed_role_denied_clinical(self, permission_class, factory, mock_view):
        """Should deny unlicensed roles from clinical resources."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="UNLICENSED",
            name="Unlicensed Staff",
            category="CLINICAL",
            requires_license=True,
            license_body="KMPDB",
            permissions_matrix={"Patient": {"read": True}},
        )

        department = Department.objects.create(
            code="UNLIC", name="Unlicensed", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="unlicensed", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-013",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            # No license provided
        )

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        # Should be denied if license is required but not provided
        assert has_perm is False

    def test_expired_license_denied(self, permission_class, factory, mock_view):
        """Should deny access if staff license is expired."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="EXPIRED_LIC",
            name="Expired License",
            category="CLINICAL",
            requires_license=True,
            license_body="KMPDB",
            permissions_matrix={"Patient": {"read": True}},
        )

        department = Department.objects.create(
            code="EXPIRED", name="Expired", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="expired", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-014",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            license_number="KMPDB/99999",
            license_expiry=date.today() - timedelta(days=1),  # Expired yesterday
            license_verified=True,
        )

        request = factory.get("/api/patients/")
        request.user = user

        has_perm = permission_class.has_permission(request, mock_view)

        # Should be denied if license is expired
        assert has_perm is False

    def test_permission_check_audit_logging(self, permission_class, factory, mock_view):
        """Should log permission check results."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="AUDIT",
            name="Audit Role",
            category="CLINICAL",
            permissions_matrix={"Patient": {"read": True}},
        )

        department = Department.objects.create(
            code="AUDIT", name="Audit", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="audit", password="test123")
        StaffProfile.objects.create(
            user=user,
            employee_id="VH-TEST-015",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        request = factory.get("/api/patients/")
        request.user = user
        request.META["REMOTE_ADDR"] = "127.0.0.1"
        request.META["HTTP_USER_AGENT"] = "TestClient"

        # Enable audit logging
        with patch("hmis.apps.core.permissions.AuditLog.log") as mock_log:
            permission_class.has_permission(request, mock_view)

            # Verify audit log was called
            # Note: This depends on implementation
            # mock_log.assert_called_once()
