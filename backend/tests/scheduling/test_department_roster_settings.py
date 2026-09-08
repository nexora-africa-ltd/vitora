# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for canonical department repeating rota settings.

Run with: poetry run pytest tests/scheduling/test_department_roster_settings.py -q
Inputs: Django API client and facility-scoped scheduling fixtures.
"""

from datetime import time

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def nursing_department(db, sample_facility):
    """Create a facility-scoped department for rota tests."""
    from hmis.apps.core.models import Department

    return Department.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        code="ROTA-NURSING",
        name="Nursing",
        department_type="CLINICAL",
    )


class TestDepartmentRosterSettingsAPI:
    """Canonical department rota CRUD and validation tests."""

    def test_create_repeating_rota_and_return_defaults(
        self, authenticated_client, nursing_department, sample_facility
    ):
        """A department has one canonical repeating rota of active shift types."""
        from hmis.apps.scheduling.models import ShiftTypeConfig

        for shift_type, start_time, end_time in (
            ("DAY", time(7), time(15)),
            ("NIGHT", time(19), time(7)),
        ):
            ShiftTypeConfig.objects.create(
                facility=sample_facility,
                organization=sample_facility.organization,
                shift_type=shift_type,
                start_time=start_time,
                end_time=end_time,
            )

        response = authenticated_client.post(
            "/api/scheduling/department-roster-settings/",
            {"department": nursing_department.id, "repeating_shift_pattern": ["DAY", "NIGHT"]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["repeating_shift_pattern"] == ["DAY", "NIGHT"]

        defaults = authenticated_client.get("/api/scheduling/department-roster-settings/defaults/")
        assert defaults.status_code == status.HTTP_200_OK
        assert defaults.data[str(nursing_department.id)] == ["DAY", "NIGHT"]

    def test_rejects_inactive_or_unconfigured_pattern_type(
        self, authenticated_client, nursing_department, sample_facility
    ):
        """Rota entries must resolve to an active facility or department shift configuration."""
        from hmis.apps.scheduling.models import ShiftTypeConfig

        ShiftTypeConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
            is_active=False,
        )

        response = authenticated_client.post(
            "/api/scheduling/department-roster-settings/",
            {"department": nursing_department.id, "repeating_shift_pattern": ["DAY"]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "repeating_shift_pattern" in response.data

    def test_accepts_nonworking_markers_in_department_rota_pattern(
        self, authenticated_client, nursing_department, sample_facility
    ):
        """Department rota may contain non-working markers for staff cycle templates."""
        from hmis.apps.scheduling.models import ShiftTypeConfig

        ShiftTypeConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
        )
        response = authenticated_client.post(
            "/api/scheduling/department-roster-settings/",
            {
                "department": nursing_department.id,
                "repeating_shift_pattern": [
                    "DAY",
                    "DAY_OFF",
                    "NIGHT_OFF",
                    "OFF",
                    "AFTERNOON_OFF",
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["repeating_shift_pattern"][-4:] == [
            "DAY_OFF",
            "NIGHT_OFF",
            "OFF",
            "AFTERNOON_OFF",
        ]

        nonworking_response = authenticated_client.patch(
            f"/api/scheduling/department-roster-settings/{response.data['id']}/",
            {
                "department": nursing_department.id,
                "repeating_shift_pattern": [
                    "DAY",
                    "LEAVE",
                    "SICK_LEAVE",
                    "REST",
                ],
            },
            format="json",
        )

        assert nonworking_response.status_code == status.HTTP_200_OK

    def test_accepts_active_department_override_pattern_type(
        self, authenticated_client, nursing_department, sample_facility
    ):
        """An active department override may supply a rota type without a facility default."""
        from hmis.apps.scheduling.models import DepartmentShiftConfig

        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="NIGHT",
            start_time=time(19),
            end_time=time(7),
        )

        response = authenticated_client.post(
            "/api/scheduling/department-roster-settings/",
            {"department": nursing_department.id, "repeating_shift_pattern": ["NIGHT"]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_rejects_department_from_another_facility(
        self, authenticated_client, sample_organization
    ):
        """Canonical rota records cannot reference another facility's department."""
        from hmis.apps.core.models import Department, Facility

        other_facility = Facility.objects.create(
            organization=sample_organization, name="Other Facility", mfl_code="ROTA-OTHER"
        )
        other_department = Department.objects.create(
            facility=other_facility,
            organization=sample_organization,
            code="ROTA-OTHER",
            name="Other",
            department_type="CLINICAL",
        )
        response = authenticated_client.post(
            "/api/scheduling/department-roster-settings/",
            {"department": other_department.id, "repeating_shift_pattern": []},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "department" in response.data
