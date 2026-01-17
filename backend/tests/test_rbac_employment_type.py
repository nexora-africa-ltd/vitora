"""
Tests for StaffProfile employment type (Locum/Part-time support).
Following TDD approach: Write tests FIRST, then implement.

Sprint 1.1-1.2 Track C: RBAC Foundation - Employment Type Extension
"""

from datetime import date

import pytest  # type: ignore
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
class TestStaffProfileEmploymentType:
    """Tests for StaffProfile employment type field."""

    @pytest.fixture
    def sample_department(self):
        """Create sample department."""
        from hmis.apps.core.models import Department

        return Department.objects.create(
            code="OPD",
            name="Outpatient Department",
            department_type="CLINICAL",
        )

    @pytest.fixture
    def sample_role(self):
        """Create sample role."""
        from hmis.apps.core.models import Role

        return Role.objects.create(
            code="DOCTOR",
            name="Medical Doctor",
            category="CLINICAL",
        )

    def test_employment_type_field_exists(self):
        """StaffProfile should have employment_type field."""
        from hmis.apps.core.models import StaffProfile

        assert hasattr(
            StaffProfile, "employment_type"
        ), "StaffProfile should have employment_type field"

    def test_employment_type_choices(self):
        """Should have PERMANENT, CONTRACT, and LOCUM employment types."""
        from hmis.apps.core.models import StaffProfile

        # Get the choices from the field
        field = StaffProfile._meta.get_field("employment_type")
        choice_values = [choice[0] for choice in field.choices]

        assert "PERMANENT" in choice_values, "Should have PERMANENT employment type"
        assert "CONTRACT" in choice_values, "Should have CONTRACT employment type"
        assert "LOCUM" in choice_values, "Should have LOCUM employment type"

    def test_default_employment_type_is_permanent(self, sample_department, sample_role):
        """Default employment type should be PERMANENT."""
        from hmis.apps.core.models import StaffProfile

        user = User.objects.create_user(username="testuser", password="test123")
        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-001",
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
        )

        assert staff.employment_type == "PERMANENT", "Default employment type should be PERMANENT"

    def test_can_create_locum_staff(self, sample_department, sample_role):
        """Should be able to create staff with LOCUM employment type."""
        from hmis.apps.core.models import StaffProfile

        user = User.objects.create_user(username="locum_doc", password="test123")
        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-LOC-001",
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
            employment_type="LOCUM",
        )

        assert staff.employment_type == "LOCUM"
        staff.refresh_from_db()
        assert staff.employment_type == "LOCUM"

    def test_can_create_contract_staff(self, sample_department, sample_role):
        """Should be able to create staff with CONTRACT employment type."""
        from hmis.apps.core.models import StaffProfile

        user = User.objects.create_user(username="contract_nurse", password="test123")
        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-CON-001",
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
            employment_type="CONTRACT",
        )

        assert staff.employment_type == "CONTRACT"

    def test_filter_staff_by_employment_type(self, sample_department, sample_role):
        """Should be able to filter staff by employment type."""
        from hmis.apps.core.models import StaffProfile

        # Create different types of staff
        for i, emp_type in enumerate(["PERMANENT", "LOCUM", "CONTRACT", "LOCUM"]):
            user = User.objects.create_user(username=f"user{i}", password="test123")
            StaffProfile.objects.create(
                user=user,
                employee_id=f"VH-2026-{i:03d}",
                primary_role=sample_role,
                primary_department=sample_department,
                date_joined=date.today(),
                employment_type=emp_type,
            )

        # Filter by type
        permanent_staff = StaffProfile.objects.filter(employment_type="PERMANENT")
        assert permanent_staff.count() == 1

        locum_staff = StaffProfile.objects.filter(employment_type="LOCUM")
        assert locum_staff.count() == 2

        contract_staff = StaffProfile.objects.filter(employment_type="CONTRACT")
        assert contract_staff.count() == 1

    def test_is_external_property(self, sample_department, sample_role):
        """Locum staff should be considered external (is_external property)."""
        from hmis.apps.core.models import StaffProfile

        # Create permanent staff
        perm_user = User.objects.create_user(username="perm", password="test123")
        permanent_staff = StaffProfile.objects.create(
            user=perm_user,
            employee_id="VH-2026-PERM",
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
            employment_type="PERMANENT",
        )

        # Create locum staff
        loc_user = User.objects.create_user(username="loc", password="test123")
        locum_staff = StaffProfile.objects.create(
            user=loc_user,
            employee_id="VH-2026-LOC",
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
            employment_type="LOCUM",
        )

        assert permanent_staff.is_external is False, "Permanent staff should not be external"
        assert locum_staff.is_external is True, "Locum staff should be considered external"

    def test_employment_type_display(self, sample_department, sample_role):
        """Should have human-readable display for employment type."""
        from hmis.apps.core.models import StaffProfile

        user = User.objects.create_user(username="testdisplay", password="test123")
        staff = StaffProfile.objects.create(
            user=user,
            employee_id="VH-2026-DIS",
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
            employment_type="LOCUM",
        )

        # Django model should have get_employment_type_display method
        display = staff.get_employment_type_display()
        assert "Locum" in display or "Part-time" in display.lower() or "locum" in display.lower()
