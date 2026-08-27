# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, DJ012, SIM102
"""
What this file is for: geography, department, role, and staff reference models.
How to use: imported by `hmis.apps.core.models_reference` for model registration and compatibility.
Supported inputs/args: Django model fields/methods for identity, staffing, and location hierarchy.
"""

from django.conf import settings
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel, SyncOriginMixin
from hmis.apps.core.pii import encrypted_pii_property


class County(models.Model):
    """
    Kenya County model (47 counties).

    Represents the first level of Kenya's administrative hierarchy.
    """

    code = models.PositiveSmallIntegerField(
        unique=True,
        help_text="County code (1-47)",
    )
    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="County name",
    )

    class Meta:
        """Meta options for County."""

        verbose_name = "County"
        verbose_name_plural = "Counties"
        ordering = ["name"]

    def __str__(self) -> str:
        """Return county name."""
        return self.name


class SubCounty(models.Model):
    """
    Kenya Sub-County model.

    Represents the second level of Kenya's administrative hierarchy.
    Each sub-county belongs to one county.
    """

    county = models.ForeignKey(
        County,
        on_delete=models.CASCADE,
        related_name="sub_counties",
        help_text="Parent county",
    )
    name = models.CharField(
        max_length=100,
        help_text="Sub-county name",
    )

    class Meta:
        """Meta options for SubCounty."""

        verbose_name = "Sub-County"
        verbose_name_plural = "Sub-Counties"
        ordering = ["name"]
        unique_together = ["county", "name"]

    def __str__(self) -> str:
        """Return sub-county and county name."""
        return f"{self.name}, {self.county.name}"


class Ward(models.Model):
    """
    Kenya Ward model.

    Represents the third level of Kenya's administrative hierarchy.
    Each ward belongs to one sub-county.
    """

    sub_county = models.ForeignKey(
        SubCounty,
        on_delete=models.CASCADE,
        related_name="wards",
        help_text="Parent sub-county",
    )
    name = models.CharField(
        max_length=100,
        help_text="Ward name",
    )

    class Meta:
        """Meta options for Ward."""

        verbose_name = "Ward"
        verbose_name_plural = "Wards"
        ordering = ["name"]
        unique_together = ["sub_county", "name"]

    def __str__(self) -> str:
        """Return ward and sub-county name."""
        return f"{self.name}, {self.sub_county.name}"


class Department(FacilityScopedModel):
    """
    Hospital department for staff organization and access control.

    Supports hierarchical structure for complex organizational charts.
    Each department can have a head (StaffProfile) and multiple staff members.

    Scoped to a Facility (branch). The ``organization`` FK is auto-set from
    the facility on save via :class:`FacilityScopedModel`.
    """

    DEPARTMENT_TYPES = [
        ("CLINICAL", "Clinical"),
        ("ADMINISTRATIVE", "Administrative"),
        ("SUPPORT", "Support"),
        ("LABORATORY", "Laboratory"),
        ("PHARMACY", "Pharmacy"),
        ("RADIOLOGY", "Radiology"),
        ("RECORDS", "Medical Records"),
    ]

    code = models.CharField(
        max_length=20,
        help_text="Department code (e.g., OPD, IPD, LAB). Unique per facility.",
    )
    name = models.CharField(
        max_length=100,
        help_text="Department name",
    )
    description = models.TextField(
        blank=True,
        help_text="Department description",
    )
    department_type = models.CharField(
        max_length=20,
        choices=DEPARTMENT_TYPES,
        help_text="Type of department",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Parent department for hierarchical structure",
    )
    head = models.ForeignKey(
        "StaffProfile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="headed_departments",
        help_text="Department head",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this department is active",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Department."""

        verbose_name = "Department"
        verbose_name_plural = "Departments"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"],
                name="unique_department_code_per_facility",
                condition=models.Q(facility__isnull=False),
            ),
        ]

    def __str__(self) -> str:
        """Return department name."""
        return f"{self.name} ({self.code})"

    def get_staff_count(self) -> int:
        """
        Get count of active staff in this department.

        Returns:
            int: Number of staff with this as primary department
        """
        return self.primary_staff.filter(employment_status="ACTIVE").count()

    def get_hierarchy(self) -> list:
        """
        Get full parent chain from root to this department.

        Returns:
            list: List of departments from root to self
        """
        hierarchy = []
        current = self
        while current is not None:
            hierarchy.insert(0, current)
            current = current.parent
        return hierarchy

    def get_subdepartments(self):
        """
        Get child departments.

        Returns:
            QuerySet: Child departments
        """
        return self.department_set.all()


class Role(models.Model):
    """
    Hospital role with hierarchical permissions.

    Defines role-based access control with flexible JSON permission matrix.
    Can be linked to Django Groups for standard permission fallback.
    Supports Kenya-specific requirements like license tracking.
    """

    ROLE_CATEGORIES = [
        ("CLINICAL", "Clinical Staff"),
        ("ADMINISTRATIVE", "Administrative Staff"),
        ("TECHNICAL", "Technical Staff"),
        ("MANAGEMENT", "Management"),
        ("COMMUNITY", "Community Health"),
        ("ALLIED_HEALTH", "Allied Health"),
    ]

    ROLE_SCOPES = [
        ("ORG", "Organization-wide"),
        ("FACILITY", "Facility-specific"),
    ]

    code = models.CharField(
        max_length=30,
        unique=True,
        help_text="Unique role code (e.g., DOCTOR, NURSE)",
    )
    name = models.CharField(
        max_length=100,
        help_text="Role name",
    )
    category = models.CharField(
        max_length=20,
        choices=ROLE_CATEGORIES,
        help_text="Role category",
    )
    description = models.TextField(
        blank=True,
        help_text="Role description",
    )

    # Multitenancy scope
    scope = models.CharField(
        max_length=10,
        choices=ROLE_SCOPES,
        default="ORG",
        help_text="Whether this role applies org-wide or to a specific facility.",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="roles",
        help_text="Organization this role belongs to (null = system-wide default).",
    )
    facility = models.ForeignKey(
        "Facility",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="roles",
        help_text="Facility this role is scoped to (only when scope=FACILITY).",
    )

    # Permission matrix (JSON for flexibility)
    permissions_matrix = models.JSONField(
        default=dict,
        help_text="Permission matrix with resources and actions",
    )

    # Hierarchy
    hierarchy_level = models.PositiveIntegerField(
        default=0,
        help_text="Hierarchy level (0=highest)",
    )
    parent_role = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Parent role for permission inheritance",
    )

    # Linked Django Group (for standard permissions)
    django_group = models.OneToOneField(
        "auth.Group",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Linked Django Group for standard permissions",
    )

    # Kenya-specific
    requires_license = models.BooleanField(
        default=False,
        help_text="Whether this role requires a medical license",
    )
    license_body = models.CharField(
        max_length=100,
        blank=True,
        help_text="Licensing body (e.g., KMPDB, NCK)",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Whether this role is active",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Role."""

        verbose_name = "Role"
        verbose_name_plural = "Roles"
        ordering = ["hierarchy_level", "name"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(scope="FACILITY", facility__isnull=True),
                name="role_facility_required_when_facility_scoped",
            ),
        ]

    def __str__(self) -> str:
        """Return role name."""
        return f"{self.name} ({self.code})"

    def has_permission(self, action: str, resource: str) -> bool:
        """
        Check if role has permission for action on resource.

        Args:
            action: Action to check (create, read, update, delete, etc.)
            resource: Resource type (Patient, Encounter, etc.)

        Returns:
            bool: True if permission granted
        """
        if not self.permissions_matrix:
            return False

        resource_perms = self.permissions_matrix.get(resource, {})
        return resource_perms.get(action, False)

    def get_all_permissions(self) -> dict:
        """
        Get all permissions including inherited from parent.

        Returns:
            dict: Combined permission matrix
        """
        if not self.parent_role:
            return self.permissions_matrix.copy()

        # Start with parent permissions
        all_perms = self.parent_role.get_all_permissions()

        # Override/extend with this role's permissions
        for resource, actions in self.permissions_matrix.items():
            if resource not in all_perms:
                all_perms[resource] = {}
            all_perms[resource].update(actions)

        return all_perms

    def can_access_department(self, department) -> bool:
        """
        Check if role can access department.

        Args:
            department: Department to check

        Returns:
            bool: True if access allowed
        """
        # For now, all roles can access all departments
        # This can be extended with department-specific rules
        return True


class StaffProfile(SyncOriginMixin, models.Model):
    """
    Extended profile for hospital staff members.

    Links users to roles and departments for role-based access control.
    Tracks Kenya-specific requirements like license verification and employment status.
    """

    EMPLOYMENT_STATUS = [
        ("ACTIVE", "Active"),
        ("ON_LEAVE", "On Leave"),
        ("SUSPENDED", "Suspended"),
        ("TERMINATED", "Terminated"),
    ]

    EMPLOYMENT_TYPE = [
        ("PERMANENT", "Permanent"),
        ("CONTRACT", "Contract"),
        ("LOCUM", "Locum (Part-time)"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
        help_text="Linked user account",
    )

    # Identity
    employee_id = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        help_text="Unique employee ID (e.g., VH-2026-001). Auto-generated if left blank.",
    )
    title = models.CharField(
        max_length=20,
        blank=True,
        help_text="Title (e.g., Dr., Nurse)",
    )
    middle_name = models.CharField(
        max_length=100,
        blank=True,
        help_text="Middle name (optional)",
    )

    # Role and Department
    primary_role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="primary_staff",
        help_text="Primary role",
    )
    secondary_roles = models.ManyToManyField(
        Role,
        blank=True,
        related_name="secondary_staff",
        help_text="Additional roles",
    )
    primary_department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="primary_staff",
        help_text="Primary department",
    )
    secondary_departments = models.ManyToManyField(
        Department,
        blank=True,
        related_name="secondary_staff",
        help_text="Additional departments",
    )

    # Facility assignment (Capability-Based Experience)
    organization = models.ForeignKey(
        "Organization",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="staff_profiles",
        help_text="Primary organization (cached from primary_facility for query performance)",
    )
    secondary_organizations = models.ManyToManyField(
        "Organization",
        blank=True,
        related_name="secondary_staff_profiles",
        help_text="Additional organizations (for locum, part-time, or consultant physicians)",
    )
    primary_facility = models.ForeignKey(
        "Facility",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="staff",
        help_text="Primary work facility",
    )
    secondary_facilities = models.ManyToManyField(
        "Facility",
        blank=True,
        related_name="secondary_staff",
        help_text="Additional facilities (for multi-site workers)",
    )

    # Professional details (Kenya-specific)
    hwr_id = models.CharField(
        max_length=50,
        blank=True,
        help_text="Health Worker Registry ID (e.g., PUID-059839)",
    )
    license_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Professional license number from licensing body (e.g., COC-Clinical Officer-2026-620095)",
    )
    license_expiry = models.DateField(
        null=True,
        blank=True,
        help_text="License expiry date",
    )
    license_verified = models.BooleanField(
        default=False,
        help_text="Whether license has been verified via DHA registry lookup",
    )
    licensing_body = models.CharField(
        max_length=100,
        blank=True,
        help_text="Regulatory body (e.g., Clinical Officers Council, NCK)",
    )
    specialization = models.CharField(
        max_length=100,
        blank=True,
        help_text="Medical specialization",
    )
    practice_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="Practice type from DHA registry (e.g., Clinical Officer)",
    )
    subspecialty = models.CharField(
        max_length=200,
        blank=True,
        help_text="Sub-specialty from DHA registry",
    )
    discipline_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Discipline name from DHA registry",
    )
    educational_qualifications = models.CharField(
        max_length=300,
        blank=True,
        help_text="Educational qualifications from DHA registry",
    )
    hwr_status = models.CharField(
        max_length=50,
        blank=True,
        help_text="HWR practitioner status (e.g., Licensed)",
    )
    hwr_salutation = models.CharField(
        max_length=30,
        blank=True,
        help_text="Salutation from DHA registry (e.g., Dr., Prof., Mr.)",
    )
    identification_type = models.CharField(
        max_length=50,
        blank=True,
        help_text="Identification document type from DHA registry (e.g., National ID)",
    )
    postal_address = models.CharField(
        max_length=300,
        blank=True,
        help_text="Postal address from DHA registry",
    )
    hwr_national_id_encrypted = models.TextField(default="", blank=True)
    hwr_national_id_hmac = models.CharField(max_length=64, default="", blank=True, db_index=True)
    hwr_national_id = encrypted_pii_property("hwr_national_id")
    hwr_last_verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of last successful HWR verification",
    )

    # Contact (encrypted at rest — Kenya DPA 2019 § 41)
    phone_number_encrypted = models.TextField(default="", blank=True)
    phone_number = encrypted_pii_property("phone_number")
    emergency_contact_name_encrypted = models.TextField(default="", blank=True)
    emergency_contact_name = encrypted_pii_property("emergency_contact_name")
    emergency_contact_phone_encrypted = models.TextField(default="", blank=True)
    emergency_contact_phone = encrypted_pii_property("emergency_contact_phone")

    # Account lifecycle
    must_change_password = models.BooleanField(
        default=False,
        help_text="When True the user must set a new password on next login.",
    )
    mfa_grace_deadline = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "Deadline by which MFA must be configured for roles that require it. "
            "Set on first login; after this deadline, API access is blocked until "
            "MFA is set up. Default grace period: 72 hours."
        ),
    )
    mfa_disabled = models.BooleanField(
        default=False,
        help_text="When True, MFA is administratively disabled for this user. "
        "Existing devices are NOT deleted — they remain dormant until re-enabled.",
    )

    # Employment
    employment_status = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_STATUS,
        default="ACTIVE",
        help_text="Current employment status",
    )
    employment_type = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_TYPE,
        default="PERMANENT",
        help_text="Type of employment (Permanent, Contract, or Locum/Part-time)",
    )
    date_joined = models.DateField(
        help_text="Date joined the organization",
    )
    date_left = models.DateField(
        null=True,
        blank=True,
        help_text="Date left the organization",
    )

    # Supervisor
    supervisor = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="supervisees",
        help_text="Direct supervisor",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for StaffProfile."""

        verbose_name = "Staff Profile"
        verbose_name_plural = "Staff Profiles"
        ordering = ["user__last_name", "user__first_name"]

    def __str__(self) -> str:
        """Return formatted name."""
        return self.get_full_name()

    @classmethod
    def generate_employee_id(cls) -> str:
        """Generate a unique employee ID in the format VH-YYYY-XXXX."""
        import secrets
        from datetime import date

        year = date.today().year
        for _ in range(10):
            candidate = f"VH-{year}-{secrets.token_hex(3).upper()}"
            if not cls.objects.filter(employee_id=candidate).exists():
                return candidate
        # Fallback with longer hex to avoid collision
        return f"VH-{year}-{secrets.token_hex(5).upper()}"

    def clean(self):
        """Validate cross-organization constraints."""
        from django.core.exceptions import ValidationError

        errors = {}
        if self.primary_facility_id and self.organization_id:
            if self.primary_facility.organization_id != self.organization_id:
                errors["primary_facility"] = (
                    "Primary facility must belong to the staff member's primary organization."
                )
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """Auto-generate employee_id and auto-set organization on save."""
        if not self.employee_id:
            self.employee_id = self.generate_employee_id()
        if self.primary_facility and self.primary_facility.organization:
            self.organization = self.primary_facility.organization
        super().save(*args, **kwargs)

    def validate_secondary_facilities(self):
        """Validate that all secondary facilities belong to allowed organizations.

        Allowed orgs = primary organization + secondary organizations.
        Call after saving M2M relations.
        """
        from django.core.exceptions import ValidationError

        if not self.pk:
            return
        allowed_org_ids = set()
        if self.organization_id:
            allowed_org_ids.add(self.organization_id)
        allowed_org_ids.update(self.secondary_organizations.values_list("id", flat=True))
        if not allowed_org_ids:
            return
        bad = list(
            self.secondary_facilities.exclude(organization_id__in=allowed_org_ids).values_list(
                "name", flat=True
            )
        )
        if bad:
            raise ValidationError(
                {
                    "secondary_facilities": (
                        f"These facilities do not belong to any of the staff member's "
                        f"organizations: {', '.join(bad)}"
                    )
                }
            )

    def get_full_name(self) -> str:
        """
        Get full name with title.

        Returns:
            str: Title + User's full name
        """
        full_name = self.user.get_full_name() or self.user.username
        if self.title:
            return f"{self.title} {full_name}"
        return full_name

    def get_all_roles(self) -> list:
        """
        Get primary + secondary roles.

        Returns:
            list: All roles
        """
        roles = [self.primary_role]
        roles.extend(list(self.secondary_roles.all()))
        return roles

    def get_all_departments(self) -> list:
        """
        Get primary + secondary departments.

        Returns:
            list: All departments
        """
        departments = [self.primary_department]
        departments.extend(list(self.secondary_departments.all()))
        return departments

    def get_all_facilities(self) -> list:
        """
        Get primary + secondary facilities.

        Returns:
            list: All assigned facilities (primary first, then secondaries).
                  Empty list if no primary facility is set.
        """
        facilities = []
        if self.primary_facility:
            facilities.append(self.primary_facility)
        facilities.extend(list(self.secondary_facilities.all()))
        return facilities

    def has_permission(self, action: str, resource: str) -> bool:
        """
        Check if staff has permission for action on resource.

        Aggregates permissions from all roles (including inherited).

        Args:
            action: Action to check
            resource: Resource type

        Returns:
            bool: True if permission granted from any role
        """
        for role in self.get_all_roles():
            # Use get_all_permissions to include inherited permissions
            all_perms = role.get_all_permissions()
            resource_perms = all_perms.get(resource, {})
            if resource_perms.get(action, False):
                return True
        return False

    def is_license_valid(self) -> bool:
        """
        Check if license is valid (not expired).

        Returns:
            bool: True if no expiry or not yet expired
        """
        if not self.license_expiry:
            return True

        from datetime import date

        return self.license_expiry >= date.today()

    @property
    def is_external(self) -> bool:
        """
        Check if staff is an external service provider.

        Locum (part-time) staff are considered external providers.

        Returns:
            bool: True if employment type is LOCUM
        """
        return self.employment_type == "LOCUM"

    def get_supervisees(self):
        """
        Get direct reports.

        Returns:
            QuerySet: StaffProfiles supervised by this staff
        """
        return self.supervisees.all()

    # ------------------------------------------------------------------
    # OrgMembership compat properties (Phase 1 multi-org)
    # ------------------------------------------------------------------

    @property
    def active_memberships(self):
        """Return queryset of ACTIVE OrgMembership records."""
        return self.memberships.filter(status="ACTIVE")

    @property
    def primary_membership(self):
        """Return the primary OrgMembership, or None."""
        return self.active_memberships.filter(is_primary=True).first()

    def get_membership_for_org(self, org_id: int):
        """Return the ACTIVE OrgMembership for a specific org, or None."""
        return self.active_memberships.filter(organization_id=org_id).first()

    def has_permission_for_org(self, action: str, resource: str, org_id: int) -> bool:
        """Check permission using the org-specific role from OrgMembership."""
        membership = self.get_membership_for_org(org_id)
        if not membership:
            return False
        all_perms = membership.role.get_all_permissions()
        resource_perms = all_perms.get(resource, {})
        return resource_perms.get(action, False)
