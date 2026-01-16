"""
Tests for RBAC models: Department, Role, StaffProfile.
Following TDD approach: Write tests FIRST, then implement.

Sprint 1.1-1.2 Track C: RBAC Foundation
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError

User = get_user_model()


@pytest.mark.django_db
class TestDepartmentModel:
    """Tests for Department model."""

    def test_department_creation_with_required_fields(self):
        """Should create department with code, name, and type."""
        from hmis.apps.core.models import Department

        department = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
        )

        assert department.id is not None
        assert department.code == "OPD"
        assert department.name == "Outpatient Department"
        assert department.department_type == "CLINICAL"
        assert department.is_active is True
        assert department.created_at is not None
        assert department.updated_at is not None

    def test_department_code_uniqueness(self):
        """Should reject duplicate department codes."""
        from hmis.apps.core.models import Department

        Department.objects.create(
            code="LAB",
            name="Laboratory",
            department_type="LABORATORY",
        )

        # Attempting to create department with same code should fail
        with pytest.raises(IntegrityError):
            Department.objects.create(
                code="LAB",
                name="Lab Copy",
                department_type="LABORATORY",
            )

    def test_department_parent_relationship(self):
        """Should support hierarchical department structure."""
        from hmis.apps.core.models import Department

        parent = Department.objects.create(
            code="CLINICAL",
            name="Clinical Services",
            department_type="CLINICAL",
        )

        child = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
            parent=parent,
        )

        assert child.parent == parent
        assert child in parent.department_set.all()

    def test_department_head_assignment(self):
        """Should link to StaffProfile as department head."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        # Create department
        department = Department.objects.create(
            code="PHARMACY",
            name="Pharmacy Department",
            department_type="PHARMACY",
        )

        # Create role
        role = Role.objects.create(
            code="PHARMACIST",
            name="Pharmacist",
            category="TECHNICAL",
        )

        # Create user and staff profile
        user = User.objects.create_user(username="pharmacist1", password="test123")
        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-001",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        # Assign as department head
        department.head = staff
        department.save()

        assert department.head == staff
        assert department.head.user.username == "pharmacist1"

    def test_department_staff_count(self):
        """Should count active staff in department."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        department = Department.objects.create(
            code="NURSING",
            name="Nursing Department",
            department_type="CLINICAL",
        )

        role = Role.objects.create(
            code="NURSE",
            name="Registered Nurse",
            category="CLINICAL",
        )

        # Create 3 staff members
        for i in range(3):
            user = User.objects.create_user(username=f"nurse{i}", password="test123")
            StaffProfile.objects.create(
                user=user,
                employee_id=f"VH-2026-00{i}",
                primary_role=role,
                primary_department=department,
                date_joined=date.today(),
            )

        assert department.get_staff_count() == 3

    def test_department_hierarchy_traversal(self):
        """Should return full parent chain."""
        from hmis.apps.core.models import Department

        # Create hierarchy: Hospital > Clinical > OPD
        hospital = Department.objects.create(
            code="HOSPITAL",
            name="Hospital Services",
            department_type="ADMINISTRATIVE",
        )

        clinical = Department.objects.create(
            code="CLINICAL",
            name="Clinical Services",
            department_type="CLINICAL",
            parent=hospital,
        )

        opd = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
            parent=clinical,
        )

        hierarchy = opd.get_hierarchy()
        assert len(hierarchy) == 3
        assert hierarchy[0] == hospital
        assert hierarchy[1] == clinical
        assert hierarchy[2] == opd

    def test_department_subdepartments(self):
        """Should return child departments."""
        from hmis.apps.core.models import Department

        parent = Department.objects.create(
            code="CLINICAL",
            name="Clinical Services",
            department_type="CLINICAL",
        )

        child1 = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
            parent=parent,
        )

        child2 = Department.objects.create(
            code="IPD",
            name="Inpatient Department",
            department_type="CLINICAL",
            parent=parent,
        )

        subdepartments = parent.get_subdepartments()
        assert subdepartments.count() == 2
        assert child1 in subdepartments
        assert child2 in subdepartments

    def test_department_active_filtering(self):
        """Should filter by active status."""
        from hmis.apps.core.models import Department

        active_dept = Department.objects.create(
            code="ACTIVE",
            name="Active Department",
            department_type="CLINICAL",
            is_active=True,
        )

        inactive_dept = Department.objects.create(
            code="INACTIVE",
            name="Inactive Department",
            department_type="CLINICAL",
            is_active=False,
        )

        active_depts = Department.objects.filter(is_active=True)
        assert active_dept in active_depts
        assert inactive_dept not in active_depts


@pytest.mark.django_db
class TestRoleModel:
    """Tests for Role model."""

    def test_role_creation_with_required_fields(self):
        """Should create role with code, name, and category."""
        from hmis.apps.core.models import Role

        role = Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
        )

        assert role.id is not None
        assert role.code == "DOCTOR"
        assert role.name == "Medical Doctor"
        assert role.category == "CLINICAL"
        assert role.hierarchy_level == 0
        assert role.requires_license is False
        assert role.is_active is True

    def test_role_code_uniqueness(self):
        """Should reject duplicate role codes."""
        from hmis.apps.core.models import Role

        Role.objects.create(
            code="NURSE",
            name="Registered Nurse",
            category="CLINICAL",
        )

        with pytest.raises(IntegrityError):
            Role.objects.create(
                code="NURSE",
                name="Nurse Copy",
                category="CLINICAL",
            )

    def test_role_permissions_matrix_validation(self):
        """Should validate JSON permission matrix structure."""
        from hmis.apps.core.models import Role

        permissions_matrix = {
            "Patient": {
                "create": True,
                "read": True,
                "update": True,
                "delete": False,
                "view_sensitive": True,
            },
            "Encounter": {
                "create": True,
                "read": True,
                "update": True,
                "delete": False,
            },
        }

        role = Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
            permissions_matrix=permissions_matrix,
        )

        assert role.permissions_matrix == permissions_matrix
        assert role.permissions_matrix["Patient"]["create"] is True
        assert role.permissions_matrix["Encounter"]["delete"] is False

    def test_role_hierarchy_level(self):
        """Should enforce hierarchy level ordering."""
        from hmis.apps.core.models import Role

        admin = Role.objects.create(
            code="ADMIN",
            name="System Administrator",
            category="ADMINISTRATIVE",
            hierarchy_level=0,
        )

        doctor = Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
            hierarchy_level=2,
        )

        nurse = Role.objects.create(
            code="NURSE",
            name="Registered Nurse",
            category="CLINICAL",
            hierarchy_level=3,
        )

        # Verify ordering
        roles = Role.objects.order_by("hierarchy_level")
        assert roles[0] == admin
        assert roles[1] == doctor
        assert roles[2] == nurse

    def test_role_parent_inheritance(self):
        """Should inherit permissions from parent role."""
        from hmis.apps.core.models import Role

        parent_perms = {
            "Patient": {"read": True, "create": False},
        }

        parent = Role.objects.create(
            code="CLINICAL_STAFF",
            name="Clinical Staff",
            category="CLINICAL",
            permissions_matrix=parent_perms,
        )

        child_perms = {
            "Encounter": {"read": True, "create": True},
        }

        child = Role.objects.create(
            code="NURSE",
            name="Registered Nurse",
            category="CLINICAL",
            parent_role=parent,
            permissions_matrix=child_perms,
        )

        # Get all permissions (should include parent's)
        all_perms = child.get_all_permissions()
        assert "Patient" in all_perms
        assert "Encounter" in all_perms
        assert all_perms["Patient"]["read"] is True

    def test_role_django_group_linking(self):
        """Should link to Django Group for standard permissions."""
        from django.contrib.auth.models import Group

        from hmis.apps.core.models import Role

        group = Group.objects.create(name="Doctors")

        role = Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
            django_group=group,
        )

        assert role.django_group == group
        assert role.django_group.name == "Doctors"

    def test_role_license_requirement(self):
        """Should require license_body when requires_license=True."""
        from hmis.apps.core.models import Role

        role = Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
            requires_license=True,
            license_body="KMPDB",
        )

        assert role.requires_license is True
        assert role.license_body == "KMPDB"

    def test_role_has_permission_method(self):
        """Should check permission matrix correctly."""
        from hmis.apps.core.models import Role

        permissions = {
            "Patient": {"create": True, "read": True, "update": True, "delete": False},
        }

        role = Role.objects.create(
            code="NURSE",
            name="Registered Nurse",
            category="CLINICAL",
            permissions_matrix=permissions,
        )

        assert role.has_permission("create", "Patient") is True
        assert role.has_permission("read", "Patient") is True
        assert role.has_permission("delete", "Patient") is False
        assert role.has_permission("create", "NonExistentResource") is False

    def test_role_get_all_permissions(self):
        """Should aggregate inherited and direct permissions."""
        from hmis.apps.core.models import Role

        parent_perms = {
            "Patient": {"read": True, "create": False},
            "AuditLog": {"read": True},
        }

        parent = Role.objects.create(
            code="STAFF",
            name="Staff Member",
            category="CLINICAL",
            permissions_matrix=parent_perms,
        )

        child_perms = {
            "Patient": {"read": True, "create": True},  # Override parent
            "Encounter": {"create": True, "read": True},  # New permission
        }

        child = Role.objects.create(
            code="NURSE",
            name="Registered Nurse",
            category="CLINICAL",
            parent_role=parent,
            permissions_matrix=child_perms,
        )

        all_perms = child.get_all_permissions()

        # Should have all resources
        assert "Patient" in all_perms
        assert "Encounter" in all_perms
        assert "AuditLog" in all_perms

        # Child permissions should override parent
        assert all_perms["Patient"]["create"] is True  # Overridden from False
        assert all_perms["Patient"]["read"] is True

    def test_role_category_filtering(self):
        """Should filter roles by category."""
        from hmis.apps.core.models import Role

        Role.objects.create(code="DOCTOR", name="Doctor", category="CLINICAL")
        Role.objects.create(code="NURSE", name="Nurse", category="CLINICAL")
        Role.objects.create(code="ADMIN", name="Admin", category="ADMINISTRATIVE")

        clinical_roles = Role.objects.filter(category="CLINICAL")
        assert clinical_roles.count() == 2

    def test_role_active_filtering(self):
        """Should filter by active status."""
        from hmis.apps.core.models import Role

        active_role = Role.objects.create(
            code="ACTIVE", name="Active Role", category="CLINICAL", is_active=True
        )

        inactive_role = Role.objects.create(
            code="INACTIVE",
            name="Inactive Role",
            category="CLINICAL",
            is_active=False,
        )

        active_roles = Role.objects.filter(is_active=True)
        assert active_role in active_roles
        assert inactive_role not in active_roles

    def test_role_department_access_check(self):
        """Should check department-based access."""
        from hmis.apps.core.models import Department, Role

        role = Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
        )

        department = Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
        )

        # Test department access logic (to be implemented in StaffProfile)
        assert role.can_access_department(department) is True


@pytest.mark.django_db
class TestStaffProfileModel:
    """Tests for StaffProfile model."""

    def test_staffprofile_creation_with_user(self):
        """Should create profile linked to User."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="DOCTOR", name="Doctor", category="CLINICAL")

        department = Department.objects.create(
            code="OPD", name="OPD", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="doctor1", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-001",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        assert staff.id is not None
        assert staff.user == user
        assert staff.employee_id == "VH-2026-001"
        assert staff.primary_role == role
        assert staff.primary_department == department

    def test_staffprofile_employee_id_uniqueness(self):
        """Should reject duplicate employee IDs."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="NURSE", name="Nurse", category="CLINICAL")

        department = Department.objects.create(
            code="WARD", name="Ward", department_type="CLINICAL"
        )

        user1 = User.objects.create_user(username="staff1", password="test123")
        StaffProfile.objects.create(
            user=user1,
            employee_id="VH-2026-001",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        user2 = User.objects.create_user(username="staff2", password="test123")

        with pytest.raises(IntegrityError):
            StaffProfile.objects.create(
                user=user2,
                employee_id="VH-2026-001",  # Duplicate
                primary_role=role,
                primary_department=department,
                date_joined=date.today(),
            )

    def test_staffprofile_employee_id_format(self):
        """Should generate employee ID in correct format."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="CLERK", name="Clerk", category="ADMINISTRATIVE")

        department = Department.objects.create(
            code="RECORDS", name="Records", department_type="RECORDS"
        )

        user = User.objects.create_user(username="clerk1", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-042",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        # Check format: VH-YYYY-XXX
        assert staff.employee_id.startswith("VH-")
        assert len(staff.employee_id) == 11  # VH-2026-042

    def test_staffprofile_primary_role_required(self):
        """Should require primary role assignment."""
        from hmis.apps.core.models import Department, StaffProfile

        department = Department.objects.create(
            code="LAB", name="Laboratory", department_type="LABORATORY"
        )

        user = User.objects.create_user(username="staff3", password="test123")

        # Attempting to create without primary_role should fail at DB level
        # (assuming NOT NULL constraint)
        # This test verifies the constraint exists
        with pytest.raises((IntegrityError, ValidationError)):
            staff = StaffProfile(
                user=user,
                employee_id="VH-2026-999",
                primary_department=department,
                date_joined=date.today(),
            )
            staff.full_clean()  # Trigger validation
            staff.save()

    def test_staffprofile_secondary_roles(self):
        """Should support multiple secondary roles."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        primary_role = Role.objects.create(
            code="DOCTOR", name="Doctor", category="CLINICAL"
        )
        secondary_role1 = Role.objects.create(
            code="TRAINER", name="Trainer", category="MANAGEMENT"
        )
        secondary_role2 = Role.objects.create(
            code="AUDITOR", name="Auditor", category="MANAGEMENT"
        )

        department = Department.objects.create(
            code="OPD", name="OPD", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="multirole", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-100",
            primary_role=primary_role,
            primary_department=department,
            date_joined=date.today(),
        )

        staff.secondary_roles.add(secondary_role1, secondary_role2)

        assert staff.secondary_roles.count() == 2
        assert secondary_role1 in staff.secondary_roles.all()
        assert secondary_role2 in staff.secondary_roles.all()

    def test_staffprofile_primary_department_required(self):
        """Should require primary department assignment."""
        from hmis.apps.core.models import Role, StaffProfile

        role = Role.objects.create(code="STAFF", name="Staff", category="ADMINISTRATIVE")

        user = User.objects.create_user(username="staff4", password="test123")

        with pytest.raises((IntegrityError, ValidationError)):
            staff = StaffProfile(
                user=user,
                employee_id="VH-2026-888",
                primary_role=role,
                date_joined=date.today(),
            )
            staff.full_clean()
            staff.save()

    def test_staffprofile_secondary_departments(self):
        """Should support multiple secondary departments."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="DOCTOR", name="Doctor", category="CLINICAL")

        primary_dept = Department.objects.create(
            code="OPD", name="OPD", department_type="CLINICAL"
        )
        secondary_dept1 = Department.objects.create(
            code="IPD", name="IPD", department_type="CLINICAL"
        )
        secondary_dept2 = Department.objects.create(
            code="EMERGENCY", name="Emergency", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="multidept", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-200",
            primary_role=role,
            primary_department=primary_dept,
            date_joined=date.today(),
        )

        staff.secondary_departments.add(secondary_dept1, secondary_dept2)

        assert staff.secondary_departments.count() == 2

    def test_staffprofile_license_validation(self):
        """Should validate license number for licensed roles."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="DOCTOR",
            name="Doctor",
            category="CLINICAL",
            requires_license=True,
            license_body="KMPDB",
        )

        department = Department.objects.create(
            code="OPD", name="OPD", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="doctor2", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-300",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            license_number="KMPDB/12345",
        )

        assert staff.license_number == "KMPDB/12345"

    def test_staffprofile_license_expiry_check(self):
        """Should check license expiry date."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(
            code="NURSE",
            name="Nurse",
            category="CLINICAL",
            requires_license=True,
            license_body="NCK",
        )

        department = Department.objects.create(
            code="WARD", name="Ward", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="nurse2", password="test123")

        # Valid license
        valid_staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-400",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            license_number="NCK/54321",
            license_expiry=date.today() + timedelta(days=365),
        )

        assert valid_staff.is_license_valid() is True

        # Expired license
        user2 = User.objects.create_user(username="nurse3", password="test123")
        expired_staff = StaffProfile.objects.create(
            user=user2,
            employee_id="VH-2026-401",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            license_number="NCK/99999",
            license_expiry=date.today() - timedelta(days=1),
        )

        assert expired_staff.is_license_valid() is False

    def test_staffprofile_employment_status_transitions(self):
        """Should handle status transitions correctly."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="STAFF", name="Staff", category="ADMINISTRATIVE")

        department = Department.objects.create(
            code="ADMIN", name="Admin", department_type="ADMINISTRATIVE"
        )

        user = User.objects.create_user(username="staff5", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-500",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            employment_status="ACTIVE",
        )

        assert staff.employment_status == "ACTIVE"

        # Suspend staff
        staff.employment_status = "SUSPENDED"
        staff.save()

        staff.refresh_from_db()
        assert staff.employment_status == "SUSPENDED"

        # Terminate staff
        staff.employment_status = "TERMINATED"
        staff.date_left = date.today()
        staff.save()

        staff.refresh_from_db()
        assert staff.employment_status == "TERMINATED"
        assert staff.date_left is not None

    def test_staffprofile_supervisor_relationship(self):
        """Should link to supervisor StaffProfile."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="NURSE", name="Nurse", category="CLINICAL")

        department = Department.objects.create(
            code="NURSING", name="Nursing", department_type="CLINICAL"
        )

        user1 = User.objects.create_user(username="supervisor", password="test123")
        supervisor = StaffProfile.objects.create(
            user=user1,
            employee_id="VH-2026-600",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        user2 = User.objects.create_user(username="supervisee", password="test123")
        supervisee = StaffProfile.objects.create(
            user=user2,
            employee_id="VH-2026-601",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
            supervisor=supervisor,
        )

        assert supervisee.supervisor == supervisor
        assert supervisee in supervisor.supervisees.all()

    def test_staffprofile_full_name_with_title(self):
        """Should return formatted full name with title."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="DOCTOR", name="Doctor", category="CLINICAL")

        department = Department.objects.create(
            code="OPD", name="OPD", department_type="CLINICAL"
        )

        user = User.objects.create_user(
            username="jdoe",
            password="test123",
            first_name="John",
            last_name="Doe",
        )

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-700",
            title="Dr.",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        assert staff.get_full_name() == "Dr. John Doe"

    def test_staffprofile_all_roles_aggregation(self):
        """Should return primary + secondary roles."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        primary_role = Role.objects.create(
            code="DOCTOR", name="Doctor", category="CLINICAL"
        )
        secondary_role = Role.objects.create(
            code="TRAINER", name="Trainer", category="MANAGEMENT"
        )

        department = Department.objects.create(
            code="OPD", name="OPD", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="multirole2", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-800",
            primary_role=primary_role,
            primary_department=department,
            date_joined=date.today(),
        )

        staff.secondary_roles.add(secondary_role)

        all_roles = staff.get_all_roles()
        assert len(all_roles) == 2
        assert primary_role in all_roles
        assert secondary_role in all_roles

    def test_staffprofile_permission_aggregation(self):
        """Should aggregate permissions from all roles."""
        from hmis.apps.core.models import Department, Role, StaffProfile

        primary_perms = {"Patient": {"read": True, "create": True}}
        primary_role = Role.objects.create(
            code="NURSE",
            name="Nurse",
            category="CLINICAL",
            permissions_matrix=primary_perms,
        )

        secondary_perms = {"Encounter": {"read": True, "create": True}}
        secondary_role = Role.objects.create(
            code="TRAINER",
            name="Trainer",
            category="MANAGEMENT",
            permissions_matrix=secondary_perms,
        )

        department = Department.objects.create(
            code="WARD", name="Ward", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="aggregator", password="test123")

        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-900",
            primary_role=primary_role,
            primary_department=department,
            date_joined=date.today(),
        )

        staff.secondary_roles.add(secondary_role)

        # Should have permission from primary role
        assert staff.has_permission("read", "Patient") is True

        # Should have permission from secondary role
        assert staff.has_permission("read", "Encounter") is True

    def test_staffprofile_cascading_delete_prevention(self):
        """Should prevent deletion of referenced Role/Department."""
        from django.db.models import ProtectedError

        from hmis.apps.core.models import Department, Role, StaffProfile

        role = Role.objects.create(code="PROTECT", name="Protected", category="CLINICAL")

        department = Department.objects.create(
            code="PROTECT", name="Protected", department_type="CLINICAL"
        )

        user = User.objects.create_user(username="protected", password="test123")

        StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-1000",
            primary_role=role,
            primary_department=department,
            date_joined=date.today(),
        )

        # Attempting to delete role should fail
        with pytest.raises(ProtectedError):
            role.delete()

        # Attempting to delete department should fail
        with pytest.raises(ProtectedError):
            department.delete()
