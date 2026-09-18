# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Verify staff selection with production RBAC; run pytest tests/core/test_staff_lookup.py.

Inputs: pytest's database, settings, and tenant fixtures; no extra environment variables.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from hmis.apps.core.models import Facility, Organization
from tests.conftest import ensure_staff_profile


@pytest.fixture
def lookup_context(settings, sample_organization, sample_facility):
    settings.RBAC_READ_ENFORCEMENT = True
    user = get_user_model().objects.create_user(username="lookup_requester")
    ensure_staff_profile(user, sample_organization, sample_facility)
    clinician = get_user_model().objects.create_user(
        username="lookup_clinician",
        first_name="Jane",
        last_name="Smith",
        email="jane.clinician@example.com",
    )
    staff = ensure_staff_profile(clinician, sample_organization, sample_facility, "LOOKUP-123")
    client = APIClient()
    client.force_authenticate(user)
    return client, staff


def test_non_admin_can_lookup_without_reading_hr_records(lookup_context):
    client, staff = lookup_context
    assert client.get("/api/staff/").status_code == 403
    response = client.get("/api/staff/lookup/", {"search": "Jane Smith"})
    assert response.status_code == 200
    assert len(response.data["results"]) == 1
    row = response.data["results"][0]
    assert row["user"] == staff.user_id
    assert row["id"] == staff.pk
    assert set(row) == {
        "id",
        "user",
        "full_name",
        "user_email",
        "employee_id",
        "primary_role_name",
        "primary_department_name",
        "license_number",
    }


@pytest.mark.parametrize("search", ["jane.clinician@example.com", "LOOKUP-123", "lookup_clinician"])
def test_lookup_searches_all_staff_identifiers(lookup_context, search):
    client, staff = lookup_context
    response = client.get("/api/staff/lookup/", {"search": search})
    assert response.status_code == 200
    assert [row["user"] for row in response.data["results"]] == [staff.user_id]


def test_lookup_excludes_other_tenants_and_inactive_staff(lookup_context, sample_facility):
    client, staff = lookup_context
    foreign_org = Organization.objects.create(name="Other Clinic", slug="lookup-other")
    foreign_facility = Facility.objects.create(
        organization=foreign_org,
        name="Other Health Centre",
        mfl_code="LOOKUP-OTHER",
        level="3",
        county=sample_facility.county,
        sub_county=sample_facility.sub_county,
    )
    foreign_user = get_user_model().objects.create_user(username="lookup_foreign")
    foreign = ensure_staff_profile(foreign_user, foreign_org, foreign_facility)
    assert foreign.organization_id == foreign_org.pk
    response = client.get("/api/staff/lookup/")
    assert response.status_code == 200
    assert foreign.pk not in {row["id"] for row in response.data["results"]}

    staff.employment_status = "TERMINATED"
    staff.save(update_fields=["employment_status"])
    response = client.get("/api/staff/lookup/", {"search": "LOOKUP-123"})
    assert response.data["results"] == []
    staff.employment_status = "ACTIVE"
    staff.save(update_fields=["employment_status"])
    staff.user.is_active = False
    staff.user.save(update_fields=["is_active"])
    assert client.get("/api/staff/lookup/", {"search": "LOOKUP-123"}).data["results"] == []


def test_lookup_requires_auth_and_tenant(lookup_context):
    assert APIClient().get("/api/staff/lookup/").status_code == 401
    user = get_user_model().objects.create_user(username="lookup_no_tenant")
    client = APIClient()
    client.force_authenticate(user)
    response = client.get("/api/staff/lookup/")
    assert response.status_code == 200
    assert response.data["results"] == []


def test_lookup_search_reaches_beyond_initial_page(lookup_context):
    client, staff = lookup_context
    initial = client.get("/api/staff/lookup/", {"page_size": 1})
    assert initial.status_code == 200
    assert initial.data["count"] >= 2
    assert initial.data["next"]
    response = client.get("/api/staff/lookup/", {"page_size": 1, "search": "LOOKUP-123"})
    assert response.data["results"][0]["user"] == staff.user_id
