# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for department-specific shift configuration and server-side autofill plans.

Run with: poetry run pytest tests/scheduling/test_department_shift_config_autofill.py -q
Inputs: Django API client and scheduling fixtures.
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def nursing_department(db, sample_facility):
    """Create a facility-scoped nursing department."""
    from hmis.apps.core.models import Department

    return Department.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        code="NURSING-AF",
        name="Nursing",
        department_type="CLINICAL",
    )


@pytest.fixture
def nursing_resources(db, sample_facility, nursing_department):
    """Create two active people in the nursing department."""
    from hmis.apps.scheduling.models import Resource

    return [
        Resource.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            resource_type="PERSON",
            code=f"NURSE-AF-{number}",
            name=f"Nurse {number}",
            is_active=True,
        )
        for number in (1, 2)
    ]


class TestDepartmentShiftConfigAPI:
    """Department shift config CRUD and default resolution tests."""

    def test_create_and_list_department_shift_config(
        self, authenticated_client, nursing_department
    ):
        """A facility user can configure an active departmental day shift."""
        payload = {
            "department": nursing_department.id,
            "shift_type": "DAY",
            "label": "Nursing Day",
            "start_time": "06:00",
            "end_time": "18:00",
            "color": "#00897B",
            "min_staff": 2,
            "max_staff": 3,
        }
        response = authenticated_client.post(
            "/api/scheduling/department-shift-configs/", payload, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["department"] == nursing_department.id
        assert response.data["min_staff"] == 2
        assert response.data["max_staff"] == 3

        response = authenticated_client.get("/api/scheduling/department-shift-configs/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"][0]["department"] == nursing_department.id

    def test_rejects_department_from_another_facility(
        self, authenticated_client, sample_organization, nursing_department
    ):
        """Tenant validation prevents cross-facility department configuration."""
        from hmis.apps.core.models import Department, Facility

        other_facility = Facility.objects.create(
            organization=sample_organization,
            name="Other Facility",
            mfl_code="AF-OTHER",
        )
        other_department = Department.objects.create(
            facility=other_facility,
            organization=sample_organization,
            code="OTHER-AF",
            name="Other",
            department_type="CLINICAL",
        )
        response = authenticated_client.post(
            "/api/scheduling/department-shift-configs/",
            {
                "department": other_department.id,
                "shift_type": "DAY",
                "start_time": "07:00",
                "end_time": "15:00",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "department" in response.data

    def test_defaults_returns_department_configs(
        self, authenticated_client, nursing_department, sample_facility
    ):
        """Defaults exposes active configurations keyed by canonical department ID."""
        from hmis.apps.scheduling.models import DepartmentRosterSettings, DepartmentShiftConfig

        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            start_time=time(6),
            end_time=time(18),
            min_staff=2,
        )

        response = authenticated_client.get("/api/scheduling/department-shift-configs/defaults/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data[str(nursing_department.id)]["DAY"]["min_staff"] == 2
        assert response.data[str(nursing_department.id)]["DAY"]["start_time"] == "06:00"

    def test_delete_requires_model_permission(
        self, authenticated_client, nursing_department, sample_facility
    ):
        """The CRUD delete endpoint enforces Django's delete permission."""
        from hmis.apps.scheduling.models import DepartmentRosterSettings, DepartmentShiftConfig

        config = DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
        )
        response = authenticated_client.delete(
            f"/api/scheduling/department-shift-configs/{config.id}/"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_creation_publishes_domain_event(self, mocker, nursing_department, sample_facility):
        """Department configuration changes are visible to roster projections."""
        from hmis.apps.core.events import SchedulingEvents
        from hmis.apps.scheduling.models import DepartmentShiftConfig

        publish_event = mocker.patch("hmis.apps.scheduling.signals.publish_event")
        config = DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
        )

        publish_event.assert_called_once_with(
            event_type=SchedulingEvents.DEPARTMENT_SHIFT_CONFIG_CREATED,
            aggregate_type="DepartmentShiftConfig",
            aggregate_id=config.id,
            payload={
                "department_id": nursing_department.id,
                "shift_type": "DAY",
                "is_active": True,
            },
            facility_id=sample_facility.id,
            organization_id=sample_facility.organization_id,
        )


class TestAutofillDepartmentRuleValidation:
    """Scheduling settings use IDs, not free-text department names, for department rules."""

    def test_department_rule_requires_current_facility_department_id(
        self, authenticated_client, nursing_department
    ):
        """Department rules reject legacy free-text values and accept canonical IDs."""
        current = authenticated_client.get("/api/scheduling/settings/current/")

        legacy = authenticated_client.patch(
            f"/api/scheduling/settings/{current.data['id']}/",
            {
                "autofill_group_minimums": [
                    {"scope": "DEPARTMENT", "value": "Nursing", "min_staff": 2}
                ]
            },
            format="json",
        )
        assert legacy.status_code == status.HTTP_400_BAD_REQUEST
        assert "autofill_group_minimums" in legacy.data

        canonical = authenticated_client.patch(
            f"/api/scheduling/settings/{current.data['id']}/",
            {
                "autofill_group_minimums": [
                    {
                        "scope": "DEPARTMENT",
                        "department_id": nursing_department.id,
                        "min_staff": 2,
                    }
                ],
                "autofill_group_maximums": [{"scope": "ROLE", "value": "Nurse", "max_staff": 3}],
            },
            format="json",
        )
        assert canonical.status_code == status.HTTP_200_OK
        assert (
            canonical.data["autofill_group_minimums"][0]["department_id"] == nursing_department.id
        )
        assert canonical.data["autofill_group_maximums"][0]["value"] == "Nurse"


class TestAutofillPlanAPI:
    """The server plans deterministic drafts without writing Shift rows."""

    def test_plan_uses_all_active_people_and_department_override(
        self, authenticated_client, nursing_department, nursing_resources, sample_facility
    ):
        """Planner chooses facility people regardless of UI filters and writes no shifts."""
        from hmis.apps.scheduling.models import DepartmentShiftConfig, Shift, ShiftTypeConfig

        ShiftTypeConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
        )
        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            label="Nursing Day",
            start_time=time(6),
            end_time=time(18),
            min_staff=2,
        )
        settings = authenticated_client.get("/api/scheduling/settings/current/")
        authenticated_client.patch(
            f"/api/scheduling/settings/{settings.data['id']}/",
            {"active_shift_types": ["DAY"], "autofill_mode": "MIN_COVERAGE"},
            format="json",
        )

        plan_date = date.today()
        response = authenticated_client.post(
            "/api/scheduling/shifts/autofill-plan/",
            {"start_date": str(plan_date), "end_date": str(plan_date), "resource_ids": []},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert Shift.objects.count() == 0
        assert [draft["staff_resource"] for draft in response.data["draft_shifts"]] == [
            nursing_resources[0].id,
            nursing_resources[1].id,
        ]
        assert {draft["start_time"] for draft in response.data["draft_shifts"]} == {"06:00"}
        assert response.data["report"]["coverage"][0]["config_source"] == "department"
        assert response.data["report"]["resources_considered"] == 2
        assert isinstance(response.data["report"]["fairness_spread"], float)
        runs = authenticated_client.get("/api/scheduling/settings/autofill-runs/")
        assert runs.status_code == status.HTTP_200_OK
        assert runs.data[0]["strategy"] == "server-department-coverage-plan"

    def test_plan_counts_existing_shift_and_uses_facility_config_fallback(
        self, authenticated_client, nursing_department, nursing_resources, sample_facility
    ):
        """Existing coverage is retained and absent department config falls back to facility defaults."""
        from hmis.apps.scheduling.models import Shift, ShiftTypeConfig

        plan_date = date.today()
        ShiftTypeConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
        )
        Shift.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            staff_resource=nursing_resources[0],
            department=nursing_department,
            shift_date=plan_date,
            start_time=time(7),
            end_time=time(15),
            shift_type="DAY",
        )
        settings = authenticated_client.get("/api/scheduling/settings/current/")
        authenticated_client.patch(
            f"/api/scheduling/settings/{settings.data['id']}/",
            {"active_shift_types": ["DAY"], "autofill_min_staff_per_shift": {"DAY": 2}},
            format="json",
        )

        response = authenticated_client.post(
            "/api/scheduling/shifts/autofill-plan/",
            {"start_date": str(plan_date), "end_date": str(plan_date)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["draft_shifts"]) == 1
        assert response.data["draft_shifts"][0]["staff_resource"] == nursing_resources[1].id
        assert response.data["report"]["coverage"][0]["existing_staff"] == 1
        assert response.data["report"]["coverage"][0]["config_source"] == "facility"

    def test_department_override_set_limits_planning_to_its_active_shift_types(
        self, authenticated_client, nursing_department, nursing_resources, sample_facility
    ):
        """A department override set defines that department's roster shift types."""
        from hmis.apps.scheduling.models import DepartmentShiftConfig, ShiftTypeConfig

        ShiftTypeConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
        )
        ShiftTypeConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            shift_type="NIGHT",
            start_time=time(19),
            end_time=time(7),
        )
        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="NIGHT",
            start_time=time(20),
            end_time=time(8),
            min_staff=1,
        )
        settings = authenticated_client.get("/api/scheduling/settings/current/")
        authenticated_client.patch(
            f"/api/scheduling/settings/{settings.data['id']}/",
            {"active_shift_types": ["DAY", "NIGHT"]},
            format="json",
        )

        plan_date = date.today()
        response = authenticated_client.post(
            "/api/scheduling/shifts/autofill-plan/",
            {"start_date": str(plan_date), "end_date": str(plan_date)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert {draft["shift_type"] for draft in response.data["draft_shifts"]} == {"NIGHT"}
        assert {draft["start_time"] for draft in response.data["draft_shifts"]} == {"20:00"}

    def test_balanced_utilization_plans_staff_to_the_facility_target(
        self, authenticated_client, nursing_department, nursing_resources, sample_facility
    ):
        """Balanced utilization fills eligible staff toward their configured weekly target."""
        from hmis.apps.scheduling.models import DepartmentRosterSettings, DepartmentShiftConfig

        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
            min_staff=1,
        )
        settings = authenticated_client.get("/api/scheduling/settings/current/")
        authenticated_client.patch(
            f"/api/scheduling/settings/{settings.data['id']}/",
            {
                "autofill_mode": "BALANCED_UTILIZATION",
                "autofill_target_days_per_staff": 4,
            },
            format="json",
        )
        week_start = date.today() - timedelta(days=date.today().weekday())
        response = authenticated_client.post(
            "/api/scheduling/shifts/autofill-plan/",
            {"start_date": str(week_start), "end_date": str(week_start + timedelta(days=3))},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        planned_by_resource = {
            resource.id: sum(
                1
                for draft in response.data["draft_shifts"]
                if draft["staff_resource"] == resource.id
            )
            for resource in nursing_resources
        }
        assert planned_by_resource == {nursing_resources[0].id: 4, nursing_resources[1].id: 4}

    def test_plan_leaves_noncovered_staff_days_unassigned(
        self, authenticated_client, nursing_department, nursing_resources, sample_facility
    ):
        """Autofill does not turn unassigned staff into an entire department OFF roster."""
        from hmis.apps.scheduling.models import DepartmentShiftConfig

        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
            min_staff=1,
        )
        settings = authenticated_client.get("/api/scheduling/settings/current/")
        authenticated_client.patch(
            f"/api/scheduling/settings/{settings.data['id']}/",
            {"autofill_mode": "MIN_COVERAGE"},
            format="json",
        )
        week_start = date.today() - timedelta(days=date.today().weekday())
        response = authenticated_client.post(
            "/api/scheduling/shifts/autofill-plan/",
            {"start_date": str(week_start), "end_date": str(week_start + timedelta(days=6))},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        planned_days = {
            resource.id: {
                draft["shift_date"]
                for draft in response.data["draft_shifts"]
                if draft["staff_resource"] == resource.id
            }
            for resource in nursing_resources
        }
        assert any(len(days) < 7 for days in planned_days.values())
        assert all(draft["shift_type"] != "OFF" for draft in response.data["draft_shifts"])

    def test_department_pattern_is_a_calendar_repeating_rota(
        self, authenticated_client, nursing_department, nursing_resources, sample_facility
    ):
        """The department's configured pattern determines the planned shift type each day."""
        from hmis.apps.scheduling.models import DepartmentRosterSettings, DepartmentShiftConfig

        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
            min_staff=1,
        )
        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="NIGHT",
            start_time=time(19),
            end_time=time(7),
            min_staff=1,
        )
        DepartmentRosterSettings.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            repeating_shift_pattern=["DAY", "NIGHT"],
        )
        monday = date.today() - timedelta(days=date.today().weekday())
        settings = authenticated_client.get("/api/scheduling/settings/current/")
        authenticated_client.patch(
            f"/api/scheduling/settings/{settings.data['id']}/",
            {"autofill_mode": "MIN_COVERAGE"},
            format="json",
        )
        response = authenticated_client.post(
            "/api/scheduling/shifts/autofill-plan/",
            {"start_date": str(monday), "end_date": str(monday + timedelta(days=3))},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        first_resource_shifts = [
            draft["shift_type"]
            for draft in response.data["draft_shifts"]
            if draft["staff_resource"] == nursing_resources[0].id
        ]
        rota_anchor_date = date(2000, 1, 3)
        pattern = ["DAY", "NIGHT"]
        expected = [
            pattern[((monday + timedelta(days=index)) - rota_anchor_date).days % len(pattern)]
            for index in range(4)
        ]
        assert first_resource_shifts == expected

    def test_department_pattern_respects_shift_max_staff_cap(
        self, authenticated_client, nursing_department, nursing_resources, sample_facility
    ):
        """Pattern-driven assignment still respects configured per-shift max_staff."""
        from hmis.apps.scheduling.models import DepartmentRosterSettings, DepartmentShiftConfig

        DepartmentShiftConfig.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            shift_type="DAY",
            start_time=time(7),
            end_time=time(15),
            min_staff=1,
            max_staff=1,
        )
        DepartmentRosterSettings.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            department=nursing_department,
            repeating_shift_pattern=["DAY"],
        )
        monday = date.today() - timedelta(days=date.today().weekday())
        response = authenticated_client.post(
            "/api/scheduling/shifts/autofill-plan/",
            {"start_date": str(monday), "end_date": str(monday + timedelta(days=2))},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        coverage_entries = [
            item
            for item in response.data["report"]["coverage"]
            if item["department_id"] == nursing_department.id and item["shift_type"] == "DAY"
        ]
        assert all(item["planned_staff"] <= 1 for item in coverage_entries)
