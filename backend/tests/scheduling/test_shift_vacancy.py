# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for explicit facility-scoped scheduling shift vacancies.

Run with:
- poetry run pytest tests/scheduling/test_shift_vacancy.py -q

Inputs:
- Scheduling fixtures provide the authenticated user, facility, and department.
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def other_facility(sample_organization, sample_county, sample_sub_county):
    """Create a second facility in the same organization."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Other Test Health Centre",
        mfl_code="99998",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
    )


@pytest.fixture
def sample_shift_vacancy(sample_facility, sample_department, test_user):
    """Create an open vacancy at the current facility."""
    from hmis.apps.scheduling.models import ShiftVacancy

    return ShiftVacancy.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        shift_date=date.today() + timedelta(days=1),
        start_time=time(8, 0),
        end_time=time(16, 0),
        shift_type="DAY",
        department=sample_department,
        notes="Cover outpatient clinic.",
        created_by=test_user,
    )


@pytest.mark.django_db
class TestShiftVacancyWorkflow:
    """Tests for vacancy lifecycle methods."""

    def test_fill_marks_vacancy_filled_and_records_user(self, sample_shift_vacancy, test_user):
        """An open vacancy can be filled exactly once."""
        sample_shift_vacancy.fill(test_user)

        assert sample_shift_vacancy.status == "FILLED"
        assert sample_shift_vacancy.filled_by == test_user
        assert sample_shift_vacancy.filled_at is not None

    def test_cancel_marks_open_vacancy_cancelled(self, sample_shift_vacancy):
        """An open vacancy can be cancelled."""
        sample_shift_vacancy.cancel()

        assert sample_shift_vacancy.status == "CANCELLED"

    def test_filled_vacancy_cannot_be_cancelled(self, sample_shift_vacancy, test_user):
        """Terminal vacancy states cannot be changed."""
        sample_shift_vacancy.fill(test_user)

        with pytest.raises(ValueError, match="Cannot cancel"):
            sample_shift_vacancy.cancel()

    def test_vacancy_workflow_publishes_domain_events(
        self, sample_shift_vacancy, test_user, mocker
    ):
        """Filling an open vacancy publishes its lifecycle event."""
        from hmis.apps.core.events import SchedulingEvents

        publish_event = mocker.patch("hmis.apps.scheduling.signals.publish_event")

        sample_shift_vacancy.fill(test_user)

        publish_event.assert_called_once_with(
            event_type=SchedulingEvents.SHIFT_VACANCY_FILLED,
            aggregate_type="ShiftVacancy",
            aggregate_id=sample_shift_vacancy.id,
            payload={
                "shift_date": str(sample_shift_vacancy.shift_date),
                "start_time": "08:00:00",
                "end_time": "16:00:00",
                "shift_type": "DAY",
                "status": "FILLED",
                "department_id": sample_shift_vacancy.department_id,
                "filled_by_id": test_user.id,
            },
            facility_id=sample_shift_vacancy.facility_id,
            organization_id=sample_shift_vacancy.organization_id,
        )


@pytest.mark.django_db
class TestShiftVacancyAPI:
    """Tests for the facility-scoped vacancy API."""

    def test_create_list_filter_and_fill_vacancy(
        self, authenticated_client, sample_department, test_user
    ):
        """Vacancies can be created, filtered, and filled through the scheduling API."""
        vacancy_date = date.today() + timedelta(days=2)
        create_response = authenticated_client.post(
            "/api/scheduling/vacancies/",
            {
                "shift_date": str(vacancy_date),
                "start_time": "08:00",
                "end_time": "16:00",
                "shift_type": "DAY",
                "department": sample_department.id,
                "notes": "Need a clinician.",
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        vacancy_id = create_response.data["id"]
        assert create_response.data["status"] == "OPEN"
        assert create_response.data["created_by"] == test_user.id

        list_response = authenticated_client.get(
            f"/api/scheduling/vacancies/?status=OPEN&from_date={vacancy_date}"
        )
        assert list_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in list_response.data["results"]] == [vacancy_id]

        fill_response = authenticated_client.post(f"/api/scheduling/vacancies/{vacancy_id}/fill/")
        assert fill_response.status_code == status.HTTP_200_OK
        assert fill_response.data["status"] == "FILLED"
        assert fill_response.data["filled_by"] == test_user.id
        assert fill_response.data["filled_at"] is not None

    def test_list_excludes_other_facility_vacancies(
        self,
        authenticated_client,
        other_facility,
        sample_department,
        test_user,
    ):
        """The facility-scoped list never exposes vacancies from another facility."""
        from hmis.apps.scheduling.models import ShiftVacancy

        other_vacancy = ShiftVacancy.objects.create(
            facility=other_facility,
            organization=other_facility.organization,
            shift_date=date.today() + timedelta(days=1),
            start_time=time(8, 0),
            end_time=time(16, 0),
            shift_type="DAY",
            department=sample_department,
            created_by=test_user,
        )

        response = authenticated_client.get("/api/scheduling/vacancies/")

        assert response.status_code == status.HTTP_200_OK
        assert other_vacancy.id not in [item["id"] for item in response.data["results"]]
