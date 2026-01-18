# Sprint 1.1-1.2 Track C: RBAC Foundation - Deliverables

**Sprint Duration**: Weeks 1-4 (Phase 1)
**Status**: 📋 PLANNED
**Target Date**: Q1 2026

---

## Executive Summary

Track C of Sprint 1.1-1.2 implements the Role-Based Access Control (RBAC) foundation for Vitora HMIS. This extends beyond Django's built-in Groups/Permissions to provide a comprehensive hospital staff management system with departments, roles, and staff profiles.

### Key Deliverables

| Deliverable | Tests Required | Priority |
|-------------|----------------|----------|
| Department Model | 8 tests | High |
| Role Model | 12 tests | High |
| StaffProfile Model | 15 tests | High |
| RoleBasedPermission Class | 18 tests | High |
| Permission Matrix | 10 tests | High |
| Django Admin Integration | 8 tests | Medium |
| API Endpoints | 14 tests | Medium |

**Total Planned Tests**: ~85 tests
**Target Coverage**: ≥85%

---

## Components to Implement

### 1. Department Model

**Module**: `hmis/apps/core/models.py`

**Purpose**: Organize hospital staff by functional departments for access control and reporting.

**Fields**:
```python
class Department(models.Model):
    """Hospital department for staff organization."""

    DEPARTMENT_TYPES = [
        ('CLINICAL', 'Clinical'),
        ('ADMINISTRATIVE', 'Administrative'),
        ('SUPPORT', 'Support'),
        ('LABORATORY', 'Laboratory'),
        ('PHARMACY', 'Pharmacy'),
        ('RADIOLOGY', 'Radiology'),
        ('RECORDS', 'Medical Records'),
    ]

    code = models.CharField(max_length=20, unique=True)  # e.g., "OPD", "IPD", "LAB"
    name = models.CharField(max_length=100)  # e.g., "Outpatient Department"
    department_type = models.CharField(max_length=20, choices=DEPARTMENT_TYPES)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL)
    head = models.ForeignKey('StaffProfile', null=True, blank=True, on_delete=models.SET_NULL)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Methods**:
- `get_staff_count()`: Count of active staff in department
- `get_hierarchy()`: Full parent chain
- `get_subdepartments()`: Child departments

**Test Coverage**: 8 tests
- Department creation with required fields
- Department code uniqueness
- Parent-child relationships
- Department head assignment
- Department type validation
- Active/inactive filtering
- Staff count calculation
- Hierarchy traversal

---

### 2. Role Model

**Module**: `hmis/apps/core/models.py`

**Purpose**: Define hospital roles with associated permissions beyond Django Groups.

**Fields**:
```python
class Role(models.Model):
    """Hospital role with hierarchical permissions."""

    ROLE_CATEGORIES = [
        ('CLINICAL', 'Clinical Staff'),
        ('ADMINISTRATIVE', 'Administrative Staff'),
        ('TECHNICAL', 'Technical Staff'),
        ('MANAGEMENT', 'Management'),
    ]

    code = models.CharField(max_length=30, unique=True)  # e.g., "DOCTOR", "NURSE"
    name = models.CharField(max_length=100)  # e.g., "Medical Doctor"
    category = models.CharField(max_length=20, choices=ROLE_CATEGORIES)
    description = models.TextField(blank=True)

    # Permission matrix (JSON for flexibility)
    permissions_matrix = models.JSONField(default=dict)

    # Hierarchy
    hierarchy_level = models.PositiveIntegerField(default=0)  # 0=highest
    parent_role = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL)

    # Linked Django Group (for standard permissions)
    django_group = models.OneToOneField(
        'auth.Group',
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )

    # Kenya-specific
    requires_license = models.BooleanField(default=False)  # Medical license required
    license_body = models.CharField(max_length=100, blank=True)  # e.g., "KMPDB", "NCK"

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Methods**:
- `has_permission(action, resource)`: Check permission matrix
- `get_all_permissions()`: Inherited + direct permissions
- `can_access_department(department)`: Department-based access check

**Permission Matrix Structure**:
```python
{
    "Patient": {
        "create": true,
        "read": true,
        "update": true,
        "delete": false,
        "view_sensitive": false
    },
    "Encounter": {
        "create": true,
        "read": true,
        "update": true,
        "delete": false
    },
    "LabOrder": {
        "create": true,
        "read": true,
        "update": false,
        "delete": false
    }
}
```

**Test Coverage**: 12 tests
- Role creation with required fields
- Role code uniqueness
- Permission matrix validation
- Hierarchy level ordering
- Parent role inheritance
- Django Group linking
- License requirement enforcement
- Category filtering
- Active/inactive filtering
- Permission check method
- All permissions aggregation
- Department access check

---

### 3. StaffProfile Model

**Module**: `hmis/apps/core/models.py`

**Purpose**: Extended user profile for hospital staff with role and department assignments.

**Fields**:
```python
class StaffProfile(models.Model):
    """Extended profile for hospital staff members."""

    EMPLOYMENT_STATUS = [
        ('ACTIVE', 'Active'),
        ('ON_LEAVE', 'On Leave'),
        ('SUSPENDED', 'Suspended'),
        ('TERMINATED', 'Terminated'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_profile'
    )

    # Identity
    employee_id = models.CharField(max_length=50, unique=True)  # e.g., "VH-2026-001"
    title = models.CharField(max_length=20, blank=True)  # e.g., "Dr.", "Nurse"

    # Role and Department
    primary_role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='primary_staff')
    secondary_roles = models.ManyToManyField(Role, blank=True, related_name='secondary_staff')
    primary_department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name='primary_staff')
    secondary_departments = models.ManyToManyField(Department, blank=True, related_name='secondary_staff')

    # Professional details (Kenya-specific)
    license_number = models.CharField(max_length=50, blank=True)  # e.g., KMPDB number
    license_expiry = models.DateField(null=True, blank=True)
    license_verified = models.BooleanField(default=False)
    specialization = models.CharField(max_length=100, blank=True)

    # Contact
    phone_number = models.CharField(max_length=20, blank=True)  # Encrypted
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)

    # Employment
    employment_status = models.CharField(max_length=20, choices=EMPLOYMENT_STATUS, default='ACTIVE')
    date_joined = models.DateField()
    date_left = models.DateField(null=True, blank=True)

    # Supervisor
    supervisor = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='supervisees'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Methods**:
- `get_full_name()`: Title + User's full name
- `get_all_roles()`: Primary + secondary roles
- `get_all_departments()`: Primary + secondary departments
- `has_permission(action, resource)`: Aggregate permission check
- `is_license_valid()`: Check license expiry
- `get_supervisees()`: Direct reports

**Test Coverage**: 15 tests
- StaffProfile creation linked to User
- Employee ID generation/uniqueness
- Primary role assignment
- Secondary role assignment
- Primary department assignment
- Secondary departments assignment
- License number validation (for licensed roles)
- License expiry checking
- Employment status transitions
- Supervisor relationship
- Full name with title
- All roles aggregation
- All departments aggregation
- Permission aggregation across roles
- Cascading delete prevention (PROTECT)

---

### 4. RoleBasedPermission Class

**Module**: `hmis/apps/core/permissions.py`

**Purpose**: DRF permission class that checks permissions against role matrices.

**Implementation**:
```python
class RoleBasedPermission(permissions.BasePermission):
    """
    Permission class that checks role-based access.

    Uses the permission matrix from user's StaffProfile roles.
    Falls back to Django permissions if no StaffProfile exists.
    """

    # Map HTTP methods to actions
    ACTION_MAP = {
        'GET': 'read',
        'HEAD': 'read',
        'OPTIONS': 'read',
        'POST': 'create',
        'PUT': 'update',
        'PATCH': 'update',
        'DELETE': 'delete',
    }

    def has_permission(self, request, view):
        """Check if user has permission for this action on this resource."""
        if not request.user or not request.user.is_authenticated:
            return False

        # Superusers always have permission
        if request.user.is_superuser:
            return True

        # Get resource name from view
        resource = self._get_resource_name(view)
        action = self.ACTION_MAP.get(request.method, 'read')

        # Check StaffProfile permissions
        try:
            profile = request.user.staff_profile
            return profile.has_permission(action, resource)
        except StaffProfile.DoesNotExist:
            # Fallback to Django permissions
            return self._check_django_permission(request.user, action, resource)

    def has_object_permission(self, request, view, obj):
        """Check object-level permissions (e.g., department-based)."""
        # Additional checks for sensitive data, department access, etc.
        pass
```

**Test Coverage**: 18 tests
- Permission check for authenticated users
- Permission check for unauthenticated users (denied)
- Superuser always allowed
- GET maps to 'read' action
- POST maps to 'create' action
- PUT/PATCH maps to 'update' action
- DELETE maps to 'delete' action
- Permission from primary role
- Permission from secondary role
- Permission inheritance from parent role
- Permission denied for missing action
- Permission denied for missing resource
- Fallback to Django permissions (no StaffProfile)
- Object-level department check
- Sensitive patient access check
- Licensed role can access clinical resources
- Unlicensed role denied clinical resources
- Audit logging of permission checks

---

### 5. Default Roles Configuration

**Module**: `hmis/apps/core/fixtures/roles.json`

**Purpose**: Pre-configured roles for typical Kenya hospital setup.

**Roles**:
```python
DEFAULT_ROLES = [
    {
        "code": "ADMIN",
        "name": "System Administrator",
        "category": "ADMINISTRATIVE",
        "hierarchy_level": 0,
        "requires_license": False,
        "permissions_matrix": {
            "Patient": {"create": True, "read": True, "update": True, "delete": True, "view_sensitive": True},
            "Encounter": {"create": True, "read": True, "update": True, "delete": True},
            "StaffProfile": {"create": True, "read": True, "update": True, "delete": True},
            "Role": {"create": True, "read": True, "update": True, "delete": True},
            "Department": {"create": True, "read": True, "update": True, "delete": True},
            "AuditLog": {"create": False, "read": True, "update": False, "delete": False},
        }
    },
    {
        "code": "DOCTOR",
        "name": "Medical Doctor",
        "category": "CLINICAL",
        "hierarchy_level": 2,
        "requires_license": True,
        "license_body": "KMPDB",
        "permissions_matrix": {
            "Patient": {"create": True, "read": True, "update": True, "delete": False, "view_sensitive": True},
            "Encounter": {"create": True, "read": True, "update": True, "delete": False},
            "LabOrder": {"create": True, "read": True, "update": True, "delete": False},
            "Prescription": {"create": True, "read": True, "update": True, "delete": False},
        }
    },
    {
        "code": "NURSE",
        "name": "Registered Nurse",
        "category": "CLINICAL",
        "hierarchy_level": 3,
        "requires_license": True,
        "license_body": "NCK",
        "permissions_matrix": {
            "Patient": {"create": True, "read": True, "update": True, "delete": False, "view_sensitive": False},
            "Encounter": {"create": True, "read": True, "update": True, "delete": False},
            "LabOrder": {"create": False, "read": True, "update": False, "delete": False},
        }
    },
    {
        "code": "CLINICAL_OFFICER",
        "name": "Clinical Officer",
        "category": "CLINICAL",
        "hierarchy_level": 3,
        "requires_license": True,
        "license_body": "KMPDB",
        "permissions_matrix": {
            "Patient": {"create": True, "read": True, "update": True, "delete": False, "view_sensitive": True},
            "Encounter": {"create": True, "read": True, "update": True, "delete": False},
            "LabOrder": {"create": True, "read": True, "update": False, "delete": False},
        }
    },
    {
        "code": "LAB_TECH",
        "name": "Laboratory Technician",
        "category": "TECHNICAL",
        "hierarchy_level": 4,
        "requires_license": True,
        "license_body": "KMLTTB",
        "permissions_matrix": {
            "Patient": {"create": False, "read": True, "update": False, "delete": False, "view_sensitive": False},
            "LabOrder": {"create": False, "read": True, "update": False, "delete": False},
            "LabResult": {"create": True, "read": True, "update": True, "delete": False},
        }
    },
    {
        "code": "PHARMACIST",
        "name": "Pharmacist",
        "category": "TECHNICAL",
        "hierarchy_level": 4,
        "requires_license": True,
        "license_body": "PPB",
        "permissions_matrix": {
            "Patient": {"create": False, "read": True, "update": False, "delete": False, "view_sensitive": False},
            "Prescription": {"create": False, "read": True, "update": True, "delete": False},
            "DrugDispensing": {"create": True, "read": True, "update": True, "delete": False},
            "PharmacyInventory": {"create": True, "read": True, "update": True, "delete": True},
        }
    },
    {
        "code": "RECEPTIONIST",
        "name": "Receptionist",
        "category": "ADMINISTRATIVE",
        "hierarchy_level": 5,
        "requires_license": False,
        "permissions_matrix": {
            "Patient": {"create": True, "read": True, "update": True, "delete": False, "view_sensitive": False},
            "Encounter": {"create": False, "read": True, "update": False, "delete": False},
        }
    },
    {
        "code": "RECORDS_CLERK",
        "name": "Medical Records Clerk",
        "category": "ADMINISTRATIVE",
        "hierarchy_level": 5,
        "requires_license": False,
        "permissions_matrix": {
            "Patient": {"create": True, "read": True, "update": True, "delete": False, "view_sensitive": False},
            "Encounter": {"create": False, "read": True, "update": False, "delete": False},
        }
    },
    {
        "code": "CHW",
        "name": "Community Health Worker",
        "category": "CLINICAL",
        "hierarchy_level": 6,
        "requires_license": False,
        "permissions_matrix": {
            "Patient": {"create": True, "read": True, "update": True, "delete": False, "view_sensitive": False},
            "Encounter": {"create": True, "read": True, "update": False, "delete": False},
        }
    },
]
```

**Test Coverage**: 10 tests
- All default roles load successfully
- Role hierarchy levels are consistent
- Permission matrices are valid JSON
- Licensed roles have license_body set
- Django Groups are created for each role
- Permission inheritance works correctly
- Role categories are valid
- Duplicate role codes rejected
- Role update preserves permissions
- Role deletion cascades appropriately

---

### 6. Django Admin Integration

**Module**: `hmis/apps/core/admin.py`

**Features**:
- Department management with hierarchy view
- Role management with permission matrix editor
- StaffProfile management with inline user info
- Bulk actions (activate/deactivate staff)
- Filters by department, role, status
- Search by employee ID, name, license number
- Export staff list to CSV

**Test Coverage**: 8 tests
- Department admin list view
- Department admin create
- Role admin list view
- Role admin permission matrix editing
- StaffProfile admin list view
- StaffProfile admin bulk actions
- StaffProfile admin filters
- StaffProfile admin search

---

### 7. API Endpoints

**Module**: `hmis/apps/core/views.py` (extended)

**Endpoints**:
```
# Departments
GET     /api/departments/                    # List departments
POST    /api/departments/                    # Create department (admin only)
GET     /api/departments/{id}/               # Get department details
PATCH   /api/departments/{id}/               # Update department (admin only)
DELETE  /api/departments/{id}/               # Delete department (admin only)
GET     /api/departments/{id}/staff/         # List staff in department

# Roles
GET     /api/roles/                          # List roles
POST    /api/roles/                          # Create role (admin only)
GET     /api/roles/{id}/                     # Get role details
PATCH   /api/roles/{id}/                     # Update role (admin only)
DELETE  /api/roles/{id}/                     # Delete role (admin only)
GET     /api/roles/{id}/permissions/         # Get role permission matrix

# Staff Profiles
GET     /api/staff/                          # List staff profiles
POST    /api/staff/                          # Create staff profile (admin only)
GET     /api/staff/{id}/                     # Get staff profile
PATCH   /api/staff/{id}/                     # Update staff profile
DELETE  /api/staff/{id}/                     # Deactivate staff (admin only)
GET     /api/staff/me/                       # Get current user's profile
PATCH   /api/staff/me/                       # Update own profile (limited fields)
```

**Test Coverage**: 14 tests
- Department CRUD operations
- Role CRUD operations
- StaffProfile CRUD operations
- Permission-based endpoint access
- Department staff listing
- Role permissions endpoint
- Current user profile endpoint
- Own profile update restrictions
- Admin-only endpoint enforcement
- Pagination and filtering
- Search functionality
- Nested serializer data
- Validation errors
- Audit logging of changes

---

## Database Migrations

### Migration: Add RBAC Models

```python
# hmis/apps/core/migrations/000X_add_rbac_models.py

operations = [
    migrations.CreateModel(
        name='Department',
        fields=[
            ('id', models.BigAutoField(primary_key=True)),
            ('code', models.CharField(max_length=20, unique=True)),
            ('name', models.CharField(max_length=100)),
            ('department_type', models.CharField(max_length=20)),
            ('is_active', models.BooleanField(default=True)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ],
    ),
    migrations.CreateModel(
        name='Role',
        fields=[
            ('id', models.BigAutoField(primary_key=True)),
            ('code', models.CharField(max_length=30, unique=True)),
            ('name', models.CharField(max_length=100)),
            ('category', models.CharField(max_length=20)),
            ('description', models.TextField(blank=True)),
            ('permissions_matrix', models.JSONField(default=dict)),
            ('hierarchy_level', models.PositiveIntegerField(default=0)),
            ('requires_license', models.BooleanField(default=False)),
            ('license_body', models.CharField(max_length=100, blank=True)),
            ('is_active', models.BooleanField(default=True)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ],
    ),
    migrations.CreateModel(
        name='StaffProfile',
        fields=[
            ('id', models.BigAutoField(primary_key=True)),
            ('employee_id', models.CharField(max_length=50, unique=True)),
            ('title', models.CharField(max_length=20, blank=True)),
            ('license_number', models.CharField(max_length=50, blank=True)),
            ('license_expiry', models.DateField(null=True, blank=True)),
            ('license_verified', models.BooleanField(default=False)),
            ('specialization', models.CharField(max_length=100, blank=True)),
            ('phone_number', models.CharField(max_length=20, blank=True)),
            ('employment_status', models.CharField(max_length=20, default='ACTIVE')),
            ('date_joined', models.DateField()),
            ('date_left', models.DateField(null=True, blank=True)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ],
    ),
    # Foreign keys added separately
    migrations.AddField(
        model_name='department',
        name='parent',
        field=models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL),
    ),
    migrations.AddField(
        model_name='role',
        name='parent_role',
        field=models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL),
    ),
    migrations.AddField(
        model_name='role',
        name='django_group',
        field=models.OneToOneField('auth.Group', null=True, blank=True, on_delete=models.CASCADE),
    ),
    migrations.AddField(
        model_name='staffprofile',
        name='user',
        field=models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
    ),
    migrations.AddField(
        model_name='staffprofile',
        name='primary_role',
        field=models.ForeignKey('Role', on_delete=models.PROTECT),
    ),
    migrations.AddField(
        model_name='staffprofile',
        name='primary_department',
        field=models.ForeignKey('Department', on_delete=models.PROTECT),
    ),
    # M2M fields
    migrations.AddField(
        model_name='staffprofile',
        name='secondary_roles',
        field=models.ManyToManyField('Role', blank=True, related_name='secondary_staff'),
    ),
    migrations.AddField(
        model_name='staffprofile',
        name='secondary_departments',
        field=models.ManyToManyField('Department', blank=True, related_name='secondary_staff'),
    ),
]
```

---

## Test Files to Create

### 1. tests/test_rbac_models.py (~35 tests)

```python
"""
Tests for RBAC models: Department, Role, StaffProfile.
Following TDD approach: Write tests FIRST, then implement.
"""

import pytest # type: ignore
from django.contrib.auth import get_user_model
from hmis.apps.core.models import Department, Role, StaffProfile

User = get_user_model()


class TestDepartmentModel:
    """Tests for Department model."""

    def test_department_creation_with_required_fields(self, db):
        """Should create department with code, name, and type."""

    def test_department_code_uniqueness(self, db):
        """Should reject duplicate department codes."""

    def test_department_parent_relationship(self, db):
        """Should support hierarchical department structure."""

    def test_department_head_assignment(self, db):
        """Should link to StaffProfile as department head."""

    def test_department_staff_count(self, db):
        """Should count active staff in department."""

    def test_department_hierarchy_traversal(self, db):
        """Should return full parent chain."""

    def test_department_subdepartments(self, db):
        """Should return child departments."""

    def test_department_active_filtering(self, db):
        """Should filter by active status."""


class TestRoleModel:
    """Tests for Role model."""

    def test_role_creation_with_required_fields(self, db):
        """Should create role with code, name, and category."""

    def test_role_code_uniqueness(self, db):
        """Should reject duplicate role codes."""

    def test_role_permissions_matrix_validation(self, db):
        """Should validate JSON permission matrix structure."""

    def test_role_hierarchy_level(self, db):
        """Should enforce hierarchy level ordering."""

    def test_role_parent_inheritance(self, db):
        """Should inherit permissions from parent role."""

    def test_role_django_group_linking(self, db):
        """Should link to Django Group for standard permissions."""

    def test_role_license_requirement(self, db):
        """Should require license_body when requires_license=True."""

    def test_role_has_permission_method(self, db):
        """Should check permission matrix correctly."""

    def test_role_get_all_permissions(self, db):
        """Should aggregate inherited and direct permissions."""

    def test_role_category_filtering(self, db):
        """Should filter roles by category."""

    def test_role_active_filtering(self, db):
        """Should filter by active status."""

    def test_role_department_access_check(self, db):
        """Should check department-based access."""


class TestStaffProfileModel:
    """Tests for StaffProfile model."""

    def test_staffprofile_creation_with_user(self, db):
        """Should create profile linked to User."""

    def test_staffprofile_employee_id_uniqueness(self, db):
        """Should reject duplicate employee IDs."""

    def test_staffprofile_employee_id_format(self, db):
        """Should generate employee ID in correct format."""

    def test_staffprofile_primary_role_required(self, db):
        """Should require primary role assignment."""

    def test_staffprofile_secondary_roles(self, db):
        """Should support multiple secondary roles."""

    def test_staffprofile_primary_department_required(self, db):
        """Should require primary department assignment."""

    def test_staffprofile_secondary_departments(self, db):
        """Should support multiple secondary departments."""

    def test_staffprofile_license_validation(self, db):
        """Should validate license number for licensed roles."""

    def test_staffprofile_license_expiry_check(self, db):
        """Should check license expiry date."""

    def test_staffprofile_employment_status_transitions(self, db):
        """Should handle status transitions correctly."""

    def test_staffprofile_supervisor_relationship(self, db):
        """Should link to supervisor StaffProfile."""

    def test_staffprofile_full_name_with_title(self, db):
        """Should return formatted full name with title."""

    def test_staffprofile_all_roles_aggregation(self, db):
        """Should return primary + secondary roles."""

    def test_staffprofile_permission_aggregation(self, db):
        """Should aggregate permissions from all roles."""

    def test_staffprofile_cascading_delete_prevention(self, db):
        """Should prevent deletion of referenced Role/Department."""
```

### 2. tests/test_rbac_permissions.py (~18 tests)

```python
"""
Tests for RoleBasedPermission class.
Following TDD approach: Write tests FIRST, then implement.
"""

import pytest # type: ignore
from rest_framework.test import APIRequestFactory
from hmis.apps.core.permissions import RoleBasedPermission


class TestRoleBasedPermission:
    """Tests for RoleBasedPermission DRF permission class."""

    def test_permission_denied_for_unauthenticated(self):
        """Should deny access to unauthenticated users."""

    def test_permission_allowed_for_superuser(self):
        """Should allow superusers all access."""

    def test_get_maps_to_read_action(self):
        """Should map GET requests to 'read' action."""

    def test_post_maps_to_create_action(self):
        """Should map POST requests to 'create' action."""

    def test_put_patch_maps_to_update_action(self):
        """Should map PUT/PATCH requests to 'update' action."""

    def test_delete_maps_to_delete_action(self):
        """Should map DELETE requests to 'delete' action."""

    def test_permission_from_primary_role(self):
        """Should check permission from primary role."""

    def test_permission_from_secondary_role(self):
        """Should check permission from secondary roles."""

    def test_permission_inheritance_from_parent(self):
        """Should inherit permissions from parent role."""

    def test_permission_denied_missing_action(self):
        """Should deny if action not in permission matrix."""

    def test_permission_denied_missing_resource(self):
        """Should deny if resource not in permission matrix."""

    def test_fallback_to_django_permissions(self):
        """Should fallback to Django perms if no StaffProfile."""

    def test_object_level_department_check(self):
        """Should check department access at object level."""

    def test_sensitive_patient_access(self):
        """Should check view_sensitive permission for patients."""

    def test_licensed_role_clinical_access(self):
        """Should allow licensed roles to access clinical resources."""

    def test_unlicensed_role_denied_clinical(self):
        """Should deny unlicensed roles from clinical resources."""

    def test_expired_license_denied(self):
        """Should deny access if staff license is expired."""

    def test_permission_check_audit_logging(self):
        """Should log permission check results."""
```

### 3. tests/test_rbac_api.py (~14 tests)

```python
"""
Tests for RBAC API endpoints.
Following TDD approach: Write tests FIRST, then implement.
"""

import pytest # type: ignore
from rest_framework import status
from rest_framework.test import APIClient


class TestDepartmentAPI:
    """Tests for Department API endpoints."""

    def test_list_departments_authenticated(self):
        """Should list departments for authenticated users."""

    def test_create_department_admin_only(self):
        """Should only allow admins to create departments."""

    def test_department_staff_listing(self):
        """Should list staff in a department."""


class TestRoleAPI:
    """Tests for Role API endpoints."""

    def test_list_roles_authenticated(self):
        """Should list roles for authenticated users."""

    def test_create_role_admin_only(self):
        """Should only allow admins to create roles."""

    def test_role_permissions_endpoint(self):
        """Should return role's permission matrix."""


class TestStaffProfileAPI:
    """Tests for StaffProfile API endpoints."""

    def test_list_staff_authenticated(self):
        """Should list staff for authenticated users."""

    def test_create_staff_admin_only(self):
        """Should only allow admins to create staff."""

    def test_get_current_user_profile(self):
        """Should return current user's staff profile."""

    def test_update_own_profile_limited(self):
        """Should only allow updating certain fields on own profile."""

    def test_staff_pagination(self):
        """Should paginate staff list."""

    def test_staff_filtering_by_department(self):
        """Should filter staff by department."""

    def test_staff_search(self):
        """Should search staff by name, employee_id."""

    def test_staff_changes_audit_logged(self):
        """Should log all staff profile changes."""
```

### 4. tests/test_rbac_admin.py (~8 tests)

```python
"""
Tests for RBAC Django Admin integration.
"""

import pytest # type: ignore
from django.contrib.admin.sites import AdminSite
from hmis.apps.core.admin import DepartmentAdmin, RoleAdmin, StaffProfileAdmin


class TestRBACAdmin:
    """Tests for RBAC admin interfaces."""

    def test_department_admin_list_view(self):
        """Should display departments in admin."""

    def test_department_admin_create(self):
        """Should create department via admin."""

    def test_role_admin_list_view(self):
        """Should display roles in admin."""

    def test_role_admin_permission_matrix_edit(self):
        """Should edit permission matrix in admin."""

    def test_staffprofile_admin_list_view(self):
        """Should display staff profiles in admin."""

    def test_staffprofile_admin_bulk_deactivate(self):
        """Should bulk deactivate staff."""

    def test_staffprofile_admin_filters(self):
        """Should filter by department, role, status."""

    def test_staffprofile_admin_search(self):
        """Should search by name, employee_id, license."""
```

---

## Settings Configuration

```python
# hmis/settings/base.py additions

# RBAC Configuration
RBAC_ENABLED = True
RBAC_STRICT_MODE = True  # Deny if no explicit permission (vs allow)
RBAC_CACHE_TIMEOUT = 300  # Cache permission checks for 5 minutes

# License Bodies (Kenya)
KENYA_LICENSE_BODIES = {
    'KMPDB': 'Kenya Medical Practitioners and Dentists Board',
    'NCK': 'Nursing Council of Kenya',
    'KMLTTB': 'Kenya Medical Laboratory Technicians and Technologists Board',
    'PPB': 'Pharmacy and Poisons Board',
    'COC': 'Clinical Officers Council',
}

# Default hierarchy levels
RBAC_HIERARCHY_LEVELS = {
    'ADMIN': 0,
    'MANAGEMENT': 1,
    'CLINICAL_SENIOR': 2,
    'CLINICAL': 3,
    'TECHNICAL': 4,
    'ADMINISTRATIVE': 5,
    'COMMUNITY': 6,
}
```

---

## Acceptance Criteria

| Criterion | Tests | Status |
|-----------|-------|--------|
| Department model with hierarchy | 8 | 📋 |
| Role model with permission matrix | 12 | 📋 |
| StaffProfile model with roles/departments | 15 | 📋 |
| RoleBasedPermission class | 18 | 📋 |
| Default roles fixture | 10 | 📋 |
| API endpoints for RBAC management | 14 | 📋 |
| Django Admin integration | 8 | 📋 |
| Permission inheritance works | ✓ | 📋 |
| License validation enforced | ✓ | 📋 |
| Audit logging of role changes | ✓ | 📋 |
| All tests pass | ~85 | 📋 |
| Coverage ≥85% | ✓ | 📋 |

---

## Dependencies

- Django Groups/Permissions (existing)
- DRF permissions framework (existing)
- AuditLog model (Sprint 0.4)
- SensitiveAccessPermission (Sprint 0.4)

---

## Architecture Decisions

### 1. Custom Role Model vs Django Groups

**Decision**: Use custom Role model that links to Django Groups

**Rationale**:
- Richer metadata (hierarchy, license requirements, Kenya-specific)
- JSON permission matrix for flexible resource/action mapping
- Keep Django Groups for standard permission checks as fallback
- Admin can still use Django Groups for simple scenarios

### 2. Permission Matrix vs Database Permissions

**Decision**: Store permissions in JSON field

**Rationale**:
- No join queries for permission checks
- Easy to serialize/deserialize
- Supports dynamic resources (future modules)
- Can cache entire matrix per role
- Trade-off: Database constraints not enforced

### 3. License Verification

**Decision**: Store license info locally, manual verification

**Rationale**:
- Kenya licensing boards don't have public APIs
- Manual verification by admin with `license_verified` flag
- License expiry tracked for alerts
- Future: Integrate with KMPDB API when available

---

## TDD Methodology

1. **Red**: Write all ~85 tests first (this document)
2. **Green**: Implement models, permissions, and APIs to pass tests
3. **Refactor**: Optimize permission checks, add caching

---

**Document Status**: PLANNED
**Sprint Status**: 📋 NOT STARTED
**Document Owner**: Engineering Lead
**Last Updated**: December 31, 2025
