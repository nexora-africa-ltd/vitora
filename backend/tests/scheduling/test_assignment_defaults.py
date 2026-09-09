# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for assignment-rule default seeding.

What this file is for:
- Verify management command and API endpoint behavior for seeding scheduling assignment defaults.

How to use it:
- Run with: poetry run pytest tests/scheduling/test_assignment_defaults.py -v

Supported inputs/args:
- Standard pytest args; no custom CLI/env args required.
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework import status

from hmis.apps.scheduling.models import AssignmentRule


@pytest.mark.django_db
class TestAssignmentDefaultsCommand:
    """Management command should seed idempotent assignment rules."""

    def test_seed_command_creates_defaults_once(self, sample_facility, test_user):
        """Command creates defaults on first run and skips on second run."""
        assert AssignmentRule.objects.filter(facility=sample_facility).count() == 0

        call_command(
            "seed_assignment_defaults",
            f"--facility-id={sample_facility.id}",
            f"--created-by={test_user.id}",
        )
        first_count = AssignmentRule.objects.filter(facility=sample_facility).count()
        assert first_count > 0

        call_command(
            "seed_assignment_defaults",
            f"--facility-id={sample_facility.id}",
            f"--created-by={test_user.id}",
        )
        second_count = AssignmentRule.objects.filter(facility=sample_facility).count()
        assert second_count == first_count


@pytest.mark.django_db
class TestAssignmentDefaultsApi:
    """API action should seed defaults when authorized."""

    @pytest.fixture
    def superuser_client(self, api_client, sample_organization, sample_facility):
        """Authenticated client for a platform superuser."""
        from tests.conftest import ensure_staff_profile

        User = get_user_model()
        user = User.objects.create_user(
            username="assignment_superuser",
            email="assignment.superuser@example.com",
            password="testpassword123",
            is_superuser=True,
            is_staff=True,
        )
        ensure_staff_profile(user, sample_organization, sample_facility, employee_id="ASGN-SUPER")
        api_client.force_authenticate(user=user)
        return api_client

    def test_seed_defaults_requires_superuser(self, authenticated_client):
        """Non-superusers receive 403 even when authenticated."""
        response = authenticated_client.post("/api/scheduling/assignment-rules/seed-defaults/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_seed_defaults_creates_rules_and_is_idempotent(self, superuser_client, sample_facility):
        """First call creates defaults, second call creates none."""
        response = superuser_client.post("/api/scheduling/assignment-rules/seed-defaults/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] > 0
        assert len(response.data["created_rule_codes"]) == response.data["created"]

        first_count = AssignmentRule.objects.filter(facility=sample_facility).count()
        assert first_count == response.data["total_rules"]

        second = superuser_client.post("/api/scheduling/assignment-rules/seed-defaults/")
        assert second.status_code == status.HTTP_200_OK
        assert second.data["created"] == 0
        assert second.data["created_rule_codes"] == []
        assert second.data["total_rules"] == first_count
