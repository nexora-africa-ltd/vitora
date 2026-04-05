"""
Shared fixtures for scheduling tests.

Overrides resource/appointment fixtures to include facility scoping.
Depends on global conftest fixtures: sample_facility, sample_organization.
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from django.utils import timezone


@pytest.fixture
def sample_person_resource(db, sample_facility):
    """Create a sample person resource scoped to a facility."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Dr. Test Doctor",
        resource_type="PERSON",
        code="DOC-TEST-001",
        is_active=True,
        metadata={"specialty": "General Practice"},
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def sample_place_resource(db, sample_facility):
    """Create a sample place resource scoped to a facility."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Consultation Room 1",
        resource_type="PLACE",
        code="ROOM-001",
        capacity=2,
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def sample_schedule(db, sample_person_resource):
    """Create a sample schedule for testing."""
    from hmis.apps.scheduling.models import Schedule

    return Schedule.objects.create(
        resource=sample_person_resource,
        schedule_type="RECURRING",
        day_of_week=0,  # Monday
        start_time=time(9, 0),
        end_time=time(17, 0),
        slot_duration_minutes=30,
        buffer_minutes=0,
        effective_from=date.today(),
        is_active=True,
    )


@pytest.fixture
def sample_appointment(db, sample_patient, sample_person_resource, sample_facility):
    """Create a sample appointment scoped to a facility."""
    from hmis.apps.scheduling.models import Appointment

    scheduled_start = timezone.now() + timedelta(hours=24)
    scheduled_end = scheduled_start + timedelta(minutes=30)

    return Appointment.objects.create(
        patient=sample_patient,
        resource=sample_person_resource,
        appointment_type="CONSULTATION",
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        reason="Test appointment",
        facility=sample_facility,
        organization=sample_facility.organization,
    )
