"""
Tests for cross-facility scheduling conflict detection and department extraction.

Tests:
- ResourceListSerializer includes department_name from linked StaffProfile
- Cross-facility conflicts endpoint detects overlapping shifts
- Cross-facility conflicts endpoint returns empty when no overlaps
- Cross-facility conflicts endpoint requires date params
"""

from datetime import date, time

import pytest  # type: ignore
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def department_cardiology(db):
    """Create a Cardiology department."""
    from hmis.apps.core.models import Department

    return Department.objects.create(name="Cardiology", code="CARD", is_active=True)


@pytest.fixture
def staff_with_department(
    db, test_user, sample_organization, sample_facility, department_cardiology, sample_role
):
    """Create a StaffProfile with a department assigned."""
    # Create a separate user for this staff member
    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import StaffProfile

    User = get_user_model()
    user = User.objects.create_user(username="dr_kamau", password="testpass123")

    return StaffProfile.objects.create(
        user=user,
        employee_id="EMP-KAMAU",
        organization=sample_organization,
        primary_facility=sample_facility,
        primary_department=department_cardiology,
        primary_role=sample_role,
        employment_status="ACTIVE",
        date_joined=date(2024, 1, 1),
    )


@pytest.fixture
def resource_with_department(db, staff_with_department, sample_facility):
    """Create a Resource linked to a StaffProfile that has a department."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Dr. Kamau",
        resource_type="PERSON",
        code="DOC-KAMAU",
        is_active=True,
        staff_profile=staff_with_department,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def second_facility(db, sample_organization, sample_county, sample_sub_county):
    """Create a second facility in the same organization."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Branch Clinic B",
        mfl_code="88888",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def resource_at_second_facility(db, staff_with_department, second_facility):
    """Create a Resource at the second facility for the same staff member."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Dr. Kamau",
        resource_type="PERSON",
        code="DOC-KAMAU-B",
        is_active=True,
        staff_profile=staff_with_department,
        facility=second_facility,
        organization=second_facility.organization,
    )


# =============================================================================
# Department Extraction Tests
# =============================================================================


@pytest.mark.django_db
class TestResourceDepartmentExtraction:
    """Tests that Resource serializer exposes department from StaffProfile."""

    def test_resource_list_includes_department_name(
        self, authenticated_client, resource_with_department
    ):
        """ResourceListSerializer should return department_name from linked StaffProfile."""
        response = authenticated_client.get("/api/scheduling/resources/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        resource = next(r for r in results if r["id"] == resource_with_department.id)
        assert resource["department_name"] == "Cardiology"

    def test_resource_list_department_null_when_no_profile(
        self, authenticated_client, sample_person_resource
    ):
        """Resources without a staff_profile should return department_name=null."""
        response = authenticated_client.get("/api/scheduling/resources/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        resource = next(r for r in results if r["id"] == sample_person_resource.id)
        assert resource["department_name"] is None

    def test_resource_detail_includes_department_name(
        self, authenticated_client, resource_with_department
    ):
        """ResourceSerializer (detail) should also return department_name."""
        response = authenticated_client.get(
            f"/api/scheduling/resources/{resource_with_department.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["department_name"] == "Cardiology"


# =============================================================================
# Cross-Facility Conflict Tests
# =============================================================================


@pytest.mark.django_db
class TestCrossFacilityConflicts:
    """Tests for the cross-facility-conflicts endpoint."""

    def test_requires_date_params(self, authenticated_client):
        """Should return 400 if from_date or to_date is missing."""
        response = authenticated_client.get("/api/scheduling/shifts/cross-facility-conflicts/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "from_date" in response.data["error"]

    def test_no_conflicts_when_no_other_facility_shifts(
        self, authenticated_client, resource_with_department, sample_facility
    ):
        """Should return empty list when staff has no shifts at other facilities."""
        from hmis.apps.scheduling.models import Shift

        Shift.objects.create(
            staff_resource=resource_with_department,
            shift_date=date(2026, 4, 14),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.get(
            "/api/scheduling/shifts/cross-facility-conflicts/",
            {"from_date": "2026-04-14", "to_date": "2026-04-20"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_detects_conflict_across_facilities(
        self,
        authenticated_client,
        staff_with_department,
        resource_with_department,
        second_facility,
        sample_facility,
    ):
        """Should detect when same staff is scheduled at two facilities on same day."""
        from hmis.apps.scheduling.models import Resource, Shift

        # Shift at primary facility
        Shift.objects.create(
            staff_resource=resource_with_department,
            shift_date=date(2026, 4, 14),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        # Create resource at second facility for same staff (now FK, not OneToOne)
        resource_b = Resource.objects.create(
            name="Dr. Kamau (Branch B)",
            resource_type="PERSON",
            code="DOC-KAMAU-B",
            is_active=True,
            staff_profile=staff_with_department,
            facility=second_facility,
            organization=second_facility.organization,
        )

        # Shift at second facility on same day
        Shift.objects.create(
            staff_resource=resource_b,
            shift_date=date(2026, 4, 14),
            start_time=time(19, 0),
            end_time=time(7, 0),
            shift_type="NIGHT",
            facility=second_facility,
            organization=second_facility.organization,
        )

        response = authenticated_client.get(
            "/api/scheduling/shifts/cross-facility-conflicts/",
            {"from_date": "2026-04-14", "to_date": "2026-04-20"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

        conflict = response.data[0]
        assert conflict["staff_resource_name"] == "Dr. Kamau"
        assert conflict["shift_date"] == "2026-04-14"
        assert conflict["other_facility"]["name"] == str(second_facility)
        assert conflict["other_shift"]["shift_type"] == "NIGHT"
        assert conflict["this_facility_shift"]["shift_type"] == "DAY"

    def test_no_conflict_different_dates(
        self,
        authenticated_client,
        staff_with_department,
        resource_with_department,
        second_facility,
        sample_facility,
    ):
        """Should not flag shifts on different dates as conflicts."""
        from hmis.apps.scheduling.models import Resource, Shift

        # Shift at primary facility on Monday
        Shift.objects.create(
            staff_resource=resource_with_department,
            shift_date=date(2026, 4, 14),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        resource_b = Resource.objects.create(
            name="Dr. Kamau (Branch B)",
            resource_type="PERSON",
            code="DOC-KAMAU-B2",
            is_active=True,
            staff_profile=staff_with_department,
            facility=second_facility,
            organization=second_facility.organization,
        )

        # Shift at second facility on Tuesday — no conflict
        Shift.objects.create(
            staff_resource=resource_b,
            shift_date=date(2026, 4, 15),
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            facility=second_facility,
            organization=second_facility.organization,
        )

        response = authenticated_client.get(
            "/api/scheduling/shifts/cross-facility-conflicts/",
            {"from_date": "2026-04-14", "to_date": "2026-04-20"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 0

    def test_invalid_date_format(self, authenticated_client):
        """Should return 400 for invalid date format."""
        response = authenticated_client.get(
            "/api/scheduling/shifts/cross-facility-conflicts/",
            {"from_date": "not-a-date", "to_date": "2026-04-20"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_rejected(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(
            "/api/scheduling/shifts/cross-facility-conflicts/",
            {"from_date": "2026-04-14", "to_date": "2026-04-20"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
