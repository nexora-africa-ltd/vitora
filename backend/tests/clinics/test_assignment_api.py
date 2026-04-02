"""
API Tests for Assignment Engine - Phase 2.

Tests the REST API endpoints for:
- AssignmentRule CRUD
- AssignmentDecision queries
- AssignmentOverride CRUD
- Auto-assignment action
- Manual override action
"""

from datetime import date, timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status


class TestAssignmentRuleAPI:
    """Tests for AssignmentRule API endpoints."""

    @pytest.fixture
    def rule_data(self):
        """Sample rule data for testing."""
        return {
            "name": "API Test Rule",
            "rule_code": "api_test_rule",
            "applies_to": "APPOINTMENT",
            "rule_definition": {
                "version": "1.0",
                "constraints": [{"field": "metadata.status", "operator": "==", "value": "on_duty"}],
                "scoring": [{"field": "metadata.current_load", "weight": -1}],
            },
            "priority": 100,
            "description": "Test rule for API",
        }

    def test_create_assignment_rule(self, authenticated_client, rule_data):
        """Should create a new assignment rule via API."""
        response = authenticated_client.post(
            "/api/scheduling/assignment-rules/",
            rule_data,
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "API Test Rule"
        assert response.data["rule_code"] == "api_test_rule"
        assert response.data["is_active"] is True

    def test_list_assignment_rules(self, authenticated_client, db):
        """Should list all active assignment rules."""
        from hmis.apps.scheduling.models import AssignmentRule

        # Create rules
        AssignmentRule.objects.create(
            name="Rule 1",
            rule_code="rule_1",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            priority=100,
        )
        AssignmentRule.objects.create(
            name="Rule 2",
            rule_code="rule_2",
            applies_to="SHIFT",
            rule_definition={"version": "1.0"},
            priority=50,
        )

        response = authenticated_client.get("/api/scheduling/assignment-rules/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 2

    def test_filter_rules_by_applies_to(self, authenticated_client, db):
        """Should filter rules by applies_to type."""
        from hmis.apps.scheduling.models import AssignmentRule

        AssignmentRule.objects.create(
            name="Appointment Rule",
            rule_code="apt_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
        )
        AssignmentRule.objects.create(
            name="Shift Rule",
            rule_code="shift_rule",
            applies_to="SHIFT",
            rule_definition={"version": "1.0"},
        )

        response = authenticated_client.get(
            "/api/scheduling/assignment-rules/?applies_to=APPOINTMENT"
        )

        assert response.status_code == status.HTTP_200_OK
        for rule in response.data["results"]:
            assert rule["applies_to"] == "APPOINTMENT"

    def test_update_assignment_rule(self, authenticated_client, rule_data):
        """Should update an existing rule."""
        # Create rule first
        create_response = authenticated_client.post(
            "/api/scheduling/assignment-rules/",
            rule_data,
            format="json",
        )
        rule_id = create_response.data["id"]

        # Update it
        update_response = authenticated_client.patch(
            f"/api/scheduling/assignment-rules/{rule_id}/",
            {"priority": 200, "description": "Updated description"},
            format="json",
        )

        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["priority"] == 200
        assert update_response.data["description"] == "Updated description"

    def test_deactivate_assignment_rule(self, authenticated_client, rule_data):
        """Should deactivate a rule."""
        create_response = authenticated_client.post(
            "/api/scheduling/assignment-rules/",
            rule_data,
            format="json",
        )
        rule_id = create_response.data["id"]

        response = authenticated_client.post(
            f"/api/scheduling/assignment-rules/{rule_id}/deactivate/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_active"] is False

    def test_activate_assignment_rule(self, authenticated_client, db):
        """Should activate an inactive rule."""
        from hmis.apps.scheduling.models import AssignmentRule

        rule = AssignmentRule.objects.create(
            name="Inactive Rule",
            rule_code="inactive_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
            is_active=False,
        )

        response = authenticated_client.post(
            f"/api/scheduling/assignment-rules/{rule.id}/activate/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_active"] is True


class TestAssignmentDecisionAPI:
    """Tests for AssignmentDecision API endpoints (read-only)."""

    @pytest.fixture
    def sample_decision(self, db, test_user, sample_patient):
        """Create a sample decision for testing."""
        from hmis.apps.scheduling.models import AssignmentDecision, AssignmentRule, Resource

        resource = Resource.objects.create(
            name="Dr. Decision Test",
            resource_type="PERSON",
            code="DOC-DEC-001",
        )
        rule = AssignmentRule.objects.create(
            name="Decision Test Rule",
            rule_code="decision_test_rule",
            applies_to="APPOINTMENT",
            rule_definition={"version": "1.0"},
        )

        return AssignmentDecision.objects.create(
            assignment_type="APPOINTMENT",
            target_id=1,
            target_type="Appointment",
            rule_applied=rule,
            assigned_resource=resource,
            decision_outcome="ASSIGNED",
            decision_reason="Test decision",
            triggered_by=test_user,
        )

    def test_list_decisions(self, authenticated_client, sample_decision):
        """Should list assignment decisions."""
        response = authenticated_client.get("/api/scheduling/assignment-decisions/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_filter_decisions_by_target(self, authenticated_client, sample_decision):
        """Should filter decisions by target type and ID."""
        response = authenticated_client.get(
            "/api/scheduling/assignment-decisions/?target_type=Appointment&target_id=1"
        )

        assert response.status_code == status.HTTP_200_OK
        for decision in response.data["results"]:
            assert decision["target_type"] == "Appointment"

    def test_decision_detail_includes_all_fields(self, authenticated_client, sample_decision):
        """Should include full details in decision retrieval."""
        response = authenticated_client.get(
            f"/api/scheduling/assignment-decisions/{sample_decision.id}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "candidates_evaluated" in response.data
        assert "scoring_details" in response.data
        assert "evaluation_inputs" in response.data
        assert "evaluation_time_ms" in response.data

    def test_decisions_are_read_only(self, authenticated_client, sample_decision):
        """Should not allow modifying decisions."""
        response = authenticated_client.patch(
            f"/api/scheduling/assignment-decisions/{sample_decision.id}/",
            {"decision_reason": "Modified"},
            format="json",
        )

        # Should be forbidden or method not allowed
        assert response.status_code in [
            status.HTTP_403_FORBIDDEN,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        ]


class TestAssignmentOverrideAPI:
    """Tests for AssignmentOverride API endpoints."""

    @pytest.fixture
    def sample_resources(self, db):
        """Create sample resources."""
        from hmis.apps.scheduling.models import Resource

        return {
            "original": Resource.objects.create(
                name="Original Doctor",
                resource_type="PERSON",
                code="DOC-ORIG-001",
            ),
            "new": Resource.objects.create(
                name="New Doctor",
                resource_type="PERSON",
                code="DOC-NEW-001",
            ),
        }

    def test_create_override(self, authenticated_client, sample_resources):
        """Should create a manual override."""
        response = authenticated_client.post(
            "/api/scheduling/assignment-overrides/",
            {
                "target_type": "Appointment",
                "target_id": 1,
                "original_resource": sample_resources["original"].id,
                "new_resource": sample_resources["new"].id,
                "override_reason": "PATIENT_REQUEST",
                "justification": "Patient requested Dr. New due to familiarity",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["override_reason"] == "PATIENT_REQUEST"
        assert response.data["approval_status"] == "NOT_REQUIRED"

    def test_create_override_requires_justification(self, authenticated_client, sample_resources):
        """Should reject override without justification."""
        response = authenticated_client.post(
            "/api/scheduling/assignment-overrides/",
            {
                "target_type": "Appointment",
                "target_id": 1,
                "new_resource": sample_resources["new"].id,
                "override_reason": "OTHER",
                "justification": "",  # Empty
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_overrides(self, authenticated_client, sample_resources, test_user):
        """Should list overrides."""
        from hmis.apps.scheduling.models import AssignmentOverride

        AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=1,
            new_resource=sample_resources["new"],
            override_reason="EMERGENCY",
            justification="Emergency situation",
            overridden_by=test_user,
        )

        response = authenticated_client.get("/api/scheduling/assignment-overrides/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_approve_override(
        self, authenticated_client, sample_resources, test_user, another_user
    ):
        """Should approve a pending override."""
        from hmis.apps.scheduling.models import AssignmentOverride

        override = AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=1,
            new_resource=sample_resources["new"],
            override_reason="ADMINISTRATIVE",
            justification="Department policy",
            overridden_by=test_user,
            requires_approval=True,
        )

        # Authenticate as another user to approve
        authenticated_client.force_authenticate(user=another_user)

        response = authenticated_client.post(
            f"/api/scheduling/assignment-overrides/{override.id}/approve/",
            {"notes": "Approved by supervisor"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["approval_status"] == "APPROVED"

    def test_reject_override(self, authenticated_client, sample_resources, test_user, another_user):
        """Should reject a pending override."""
        from hmis.apps.scheduling.models import AssignmentOverride

        override = AssignmentOverride.objects.create(
            target_type="Appointment",
            target_id=1,
            new_resource=sample_resources["new"],
            override_reason="OTHER",
            justification="Personal preference",
            overridden_by=test_user,
            requires_approval=True,
        )

        authenticated_client.force_authenticate(user=another_user)

        response = authenticated_client.post(
            f"/api/scheduling/assignment-overrides/{override.id}/reject/",
            {"reason": "Not a valid clinical reason"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["approval_status"] == "REJECTED"


class TestAutoAssignmentAPI:
    """Tests for the auto-assignment action endpoint."""

    @pytest.fixture
    def assignment_setup(self, db, sample_county, sample_sub_county, sample_organization):
        """Set up resources and rule for auto-assignment."""
        from hmis.apps.patients.models import Patient
        from hmis.apps.scheduling.models import AssignmentRule, Resource

        patient = Patient.objects.create(
            first_name="API",
            last_name="Patient",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        resources = []
        for i, load in enumerate([3, 1, 5]):
            resources.append(
                Resource.objects.create(
                    name=f"Dr. Auto {i}",
                    resource_type="PERSON",
                    code=f"DOC-AUTO-{i:03d}",
                    metadata={
                        "status": "on_duty",
                        "current_load": load,
                    },
                )
            )

        rule = AssignmentRule.objects.create(
            name="Auto Assignment Rule",
            rule_code="auto_assign_rule",
            applies_to="APPOINTMENT",
            rule_definition={
                "version": "1.0",
                "constraints": [
                    {"field": "metadata.status", "operator": "==", "value": "on_duty"},
                ],
                "scoring": [
                    {"field": "metadata.current_load", "weight": -1},
                ],
            },
            priority=100,
        )

        return {
            "patient": patient,
            "resources": resources,
            "rule": rule,
        }

    def test_auto_assign_appointment(self, authenticated_client, assignment_setup):
        """Should automatically assign best matching resource."""
        scheduled_start = timezone.now() + timedelta(hours=2)

        response = authenticated_client.post(
            "/api/scheduling/assignments/auto-assign/",
            {
                "assignment_type": "APPOINTMENT",
                "patient_id": assignment_setup["patient"].id,
                "scheduled_start": scheduled_start.isoformat(),
                "scheduled_end": (scheduled_start + timedelta(minutes=30)).isoformat(),
                "reason": "API test appointment",
                "candidate_ids": [r.id for r in assignment_setup["resources"]],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert (
            response.data["assigned_resource"]["id"] == assignment_setup["resources"][1].id
        )  # Lowest load

    def test_auto_assign_returns_decision_details(self, authenticated_client, assignment_setup):
        """Should return decision details in response."""
        scheduled_start = timezone.now() + timedelta(hours=2)

        response = authenticated_client.post(
            "/api/scheduling/assignments/auto-assign/",
            {
                "assignment_type": "APPOINTMENT",
                "patient_id": assignment_setup["patient"].id,
                "scheduled_start": scheduled_start.isoformat(),
                "scheduled_end": (scheduled_start + timedelta(minutes=30)).isoformat(),
                "reason": "Test",
                "candidate_ids": [r.id for r in assignment_setup["resources"]],
            },
            format="json",
        )

        assert "decision" in response.data
        assert response.data["decision"]["decision_outcome"] == "ASSIGNED"

    def test_auto_assign_handles_no_match(self, authenticated_client, assignment_setup, db):
        """Should return unassigned when no candidates match."""
        from hmis.apps.scheduling.models import Resource

        # Create resource that won't match
        off_duty = Resource.objects.create(
            name="Dr. OffDuty",
            resource_type="PERSON",
            code="DOC-OFF-API",
            metadata={"status": "off_duty"},
        )

        scheduled_start = timezone.now() + timedelta(hours=2)

        response = authenticated_client.post(
            "/api/scheduling/assignments/auto-assign/",
            {
                "assignment_type": "APPOINTMENT",
                "patient_id": assignment_setup["patient"].id,
                "scheduled_start": scheduled_start.isoformat(),
                "scheduled_end": (scheduled_start + timedelta(minutes=30)).isoformat(),
                "reason": "Test",
                "candidate_ids": [off_duty.id],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is False
        assert response.data["assigned_resource"] is None


class TestManualOverrideAPI:
    """Tests for the manual override action endpoint."""

    @pytest.fixture
    def override_setup(self, db, sample_county, sample_sub_county, sample_organization):
        """Set up for manual override testing."""
        from hmis.apps.patients.models import Patient
        from hmis.apps.scheduling.models import Appointment, Resource

        patient = Patient.objects.create(
            first_name="Override",
            last_name="Patient",
            date_of_birth="1990-01-15",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_organization,
        )

        original = Resource.objects.create(
            name="Dr. Original",
            resource_type="PERSON",
            code="DOC-OVR-ORIG",
        )
        new = Resource.objects.create(
            name="Dr. New",
            resource_type="PERSON",
            code="DOC-OVR-NEW",
        )

        scheduled_start = timezone.now() + timedelta(hours=3)
        appointment = Appointment.objects.create(
            patient=patient,
            resource=original,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(minutes=30),
            reason="Original appointment",
        )

        return {
            "patient": patient,
            "original": original,
            "new": new,
            "appointment": appointment,
        }

    def test_manual_override_appointment(self, authenticated_client, override_setup):
        """Should manually override an appointment assignment."""
        response = authenticated_client.post(
            "/api/scheduling/assignments/manual-override/",
            {
                "target_type": "Appointment",
                "target_id": override_setup["appointment"].id,
                "new_resource_id": override_setup["new"].id,
                "override_reason": "PATIENT_REQUEST",
                "justification": "Patient requested different doctor",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        # new_resource returns just the ID in the serializer
        assert response.data["override"]["new_resource"] == override_setup["new"].id

    def test_manual_override_updates_appointment(self, authenticated_client, override_setup):
        """Should update the appointment's assigned resource."""
        from hmis.apps.scheduling.models import Appointment

        authenticated_client.post(
            "/api/scheduling/assignments/manual-override/",
            {
                "target_type": "Appointment",
                "target_id": override_setup["appointment"].id,
                "new_resource_id": override_setup["new"].id,
                "override_reason": "EMERGENCY",
                "justification": "Emergency reassignment",
            },
            format="json",
        )

        # Verify appointment was updated
        override_setup["appointment"].refresh_from_db()
        assert override_setup["appointment"].resource.id == override_setup["new"].id
