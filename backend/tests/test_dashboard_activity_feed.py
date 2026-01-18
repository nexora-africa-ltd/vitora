"""
TDD Tests for Dashboard Activity Feed API.

Following Red-Green-Refactor cycle:
1. RED: Write these failing tests first
2. GREEN: Implement minimal code to pass
3. REFACTOR: Clean up while keeping tests green

Tests for GET /api/core/dashboard/activity-feed/

Provides real-time activity feed for dashboard using dedicated ActivityFeed model.
"""

from datetime import timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# API endpoint
ACTIVITY_FEED_URL = "/api/core/dashboard/activity-feed/"


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def activity_feed_model(db):
    """Get the ActivityFeed model."""
    from hmis.apps.core.models import ActivityFeed
    return ActivityFeed


@pytest.fixture
def create_activity(db, test_user):
    """Factory fixture to create activity feed entries."""
    from hmis.apps.core.models import ActivityFeed

    def _create_activity(
        activity_type="patient",
        action="registered",
        title="Test Activity",
        description="Test description",
        user=None,
        resource_type="Patient",
        resource_id=1,
        timestamp=None,
        metadata=None,
    ):
        return ActivityFeed.objects.create(
            activity_type=activity_type,
            action=action,
            title=title,
            description=description,
            user=user or test_user,
            resource_type=resource_type,
            resource_id=resource_id,
            timestamp=timestamp or timezone.now(),
            metadata=metadata or {},
        )

    return _create_activity


# =============================================================================
# Model Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedModel:
    """Test ActivityFeed model structure and behavior."""

    def test_activity_feed_model_exists(self, activity_feed_model):
        """ActivityFeed model should exist."""
        assert activity_feed_model is not None

    def test_activity_types_include_all_modules(self, activity_feed_model):
        """Activity types should include all HMIS modules."""
        type_choices = dict(activity_feed_model.ACTIVITY_TYPES)

        # All modules should be represented
        expected_types = [
            'patient',
            'encounter',
            'laboratory',
            'pharmacy',
            'billing',
            'triage',
            'inpatient',
            'prescription',
            'appointment',
            'system',
        ]

        for activity_type in expected_types:
            assert activity_type in type_choices, f"Missing activity type: {activity_type}"

    def test_create_activity_feed_entry(self, create_activity, test_user):
        """Should create an activity feed entry."""
        activity = create_activity(
            activity_type="patient",
            action="registered",
            title="New patient registered",
            description="John Doe (MRN-20260118-0001)",
            user=test_user,
            resource_type="Patient",
            resource_id=123,
        )

        assert activity.id is not None
        assert activity.activity_type == "patient"
        assert activity.action == "registered"
        assert activity.user == test_user

    def test_activity_feed_ordering(self, create_activity):
        """Activities should be ordered by timestamp descending."""
        from hmis.apps.core.models import ActivityFeed

        # Create activities with different timestamps
        old = create_activity(
            title="Old activity",
            timestamp=timezone.now() - timedelta(hours=2)
        )
        new = create_activity(
            title="New activity",
            timestamp=timezone.now()
        )

        activities = list(ActivityFeed.objects.all())
        assert activities[0].id == new.id
        assert activities[1].id == old.id

    def test_activity_feed_has_metadata_field(self, create_activity):
        """Activity should support metadata JSON field."""
        activity = create_activity(
            metadata={"mrn": "MRN-20260118-0001", "patient_name": "John Doe"}
        )

        assert activity.metadata["mrn"] == "MRN-20260118-0001"
        assert activity.metadata["patient_name"] == "John Doe"


# =============================================================================
# Authentication Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedAuthentication:
    """Test authentication requirements for activity feed endpoint."""

    def test_activity_feed_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get(ACTIVITY_FEED_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_activity_feed_accessible_when_authenticated(self, authenticated_client):
        """Should allow authenticated requests."""
        response = authenticated_client.get(ACTIVITY_FEED_URL)
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Response Structure Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedResponseStructure:
    """Test response structure for activity feed endpoint."""

    def test_response_contains_count(self, authenticated_client, create_activity):
        """Response should include total count."""
        create_activity()
        create_activity()

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        assert response.status_code == status.HTTP_200_OK
        assert "count" in response.data
        assert response.data["count"] >= 2

    def test_response_contains_next_link(self, authenticated_client, create_activity):
        """Response should include next pagination link when applicable."""
        # Create more than default limit
        for i in range(25):
            create_activity(title=f"Activity {i}")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        assert "next" in response.data

    def test_response_contains_results_array(self, authenticated_client, create_activity):
        """Response should include results array."""
        create_activity()

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        assert "results" in response.data
        assert isinstance(response.data["results"], list)

    def test_result_item_structure(self, authenticated_client, create_activity, test_user):
        """Each result item should have required fields."""
        create_activity(
            activity_type="patient",
            action="registered",
            title="New patient registered",
            description="John Doe (MRN-20260118-0001)",
            user=test_user,
            resource_type="Patient",
            resource_id=123,
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        assert len(response.data["results"]) > 0
        item = response.data["results"][0]

        # Required fields
        assert "id" in item
        assert "type" in item
        assert "action" in item
        assert "title" in item
        assert "description" in item
        assert "timestamp" in item

        # Optional fields
        assert "user" in item
        assert "resource" in item

    def test_user_field_structure(self, authenticated_client, create_activity, test_user):
        """User field should have id and name."""
        create_activity(user=test_user)

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["user"] is not None
        assert "id" in item["user"]
        assert "name" in item["user"]

    def test_resource_field_structure(self, authenticated_client, create_activity):
        """Resource field should have type, id, and href."""
        create_activity(
            resource_type="Patient",
            resource_id=123,
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["resource"] is not None
        assert "type" in item["resource"]
        assert "id" in item["resource"]
        assert "href" in item["resource"]


# =============================================================================
# Pagination Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedPagination:
    """Test pagination for activity feed endpoint."""

    def test_default_limit_is_20(self, authenticated_client, create_activity):
        """Default limit should be 20 items."""
        for i in range(30):
            create_activity(title=f"Activity {i}")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        assert len(response.data["results"]) == 20

    def test_custom_limit(self, authenticated_client, create_activity):
        """Should respect custom limit parameter."""
        for i in range(15):
            create_activity(title=f"Activity {i}")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?limit=5&refresh=true")

        assert len(response.data["results"]) == 5

    def test_limit_max_100(self, authenticated_client, create_activity):
        """Limit should not exceed 100."""
        for i in range(110):
            create_activity(title=f"Activity {i}")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?limit=150&refresh=true")

        assert len(response.data["results"]) <= 100

    def test_offset_pagination(self, authenticated_client, create_activity):
        """Should support offset pagination."""
        # Create activities with known order
        activities = []
        for i in range(10):
            activities.append(create_activity(
                title=f"Activity {i}",
                timestamp=timezone.now() - timedelta(minutes=i)
            ))

        # Get first page
        response1 = authenticated_client.get(f"{ACTIVITY_FEED_URL}?limit=5&offset=0&refresh=true")
        # Get second page
        response2 = authenticated_client.get(f"{ACTIVITY_FEED_URL}?limit=5&offset=5&refresh=true")

        # Results should be different
        ids1 = [r["id"] for r in response1.data["results"]]
        ids2 = [r["id"] for r in response2.data["results"]]

        assert len(set(ids1) & set(ids2)) == 0  # No overlap

    def test_next_link_format(self, authenticated_client, create_activity):
        """Next link should be properly formatted."""
        for i in range(25):
            create_activity(title=f"Activity {i}")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?limit=10&refresh=true")

        assert response.data["next"] is not None
        assert "offset=10" in response.data["next"]
        assert "limit=10" in response.data["next"]

    def test_next_is_none_on_last_page(self, authenticated_client, create_activity):
        """Next should be None when on last page."""
        for i in range(5):
            create_activity(title=f"Activity {i}")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?limit=10&refresh=true")

        assert response.data["next"] is None


# =============================================================================
# Filtering Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedFiltering:
    """Test filtering for activity feed endpoint."""

    def test_filter_by_single_type(self, authenticated_client, create_activity):
        """Should filter by single activity type."""
        create_activity(activity_type="patient", title="Patient activity")
        create_activity(activity_type="encounter", title="Encounter activity")
        create_activity(activity_type="laboratory", title="Lab activity")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?types=patient&refresh=true")

        assert response.data["count"] == 1
        assert response.data["results"][0]["type"] == "patient"

    def test_filter_by_multiple_types(self, authenticated_client, create_activity):
        """Should filter by multiple activity types (comma-separated)."""
        create_activity(activity_type="patient", title="Patient activity")
        create_activity(activity_type="encounter", title="Encounter activity")
        create_activity(activity_type="laboratory", title="Lab activity")
        create_activity(activity_type="pharmacy", title="Pharmacy activity")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?types=patient,encounter&refresh=true")

        assert response.data["count"] == 2
        types = [r["type"] for r in response.data["results"]]
        assert "patient" in types
        assert "encounter" in types
        assert "laboratory" not in types

    def test_filter_by_action(self, authenticated_client, create_activity):
        """Should filter by action."""
        create_activity(action="registered", title="Registration")
        create_activity(action="completed", title="Completion")
        create_activity(action="registered", title="Another registration")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?actions=registered&refresh=true")

        assert response.data["count"] == 2

    def test_no_filter_returns_all(self, authenticated_client, create_activity):
        """Without filters, should return all activities."""
        create_activity(activity_type="patient")
        create_activity(activity_type="encounter")
        create_activity(activity_type="laboratory")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        assert response.data["count"] == 3


# =============================================================================
# Ordering Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedOrdering:
    """Test ordering for activity feed endpoint."""

    def test_returns_recent_first(self, authenticated_client, create_activity):
        """Activities should be ordered by timestamp descending (recent first)."""
        old = create_activity(
            title="Old activity",
            timestamp=timezone.now() - timedelta(hours=2)
        )
        new = create_activity(
            title="New activity",
            timestamp=timezone.now()
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        results = response.data["results"]
        assert results[0]["title"] == "New activity"
        assert results[1]["title"] == "Old activity"


# =============================================================================
# Resource Href Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedResourceHref:
    """Test resource href generation."""

    def test_patient_href(self, authenticated_client, create_activity):
        """Patient resources should have correct href."""
        create_activity(resource_type="Patient", resource_id=123)

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["resource"]["href"] == "/patients/123"

    def test_encounter_href(self, authenticated_client, create_activity):
        """Encounter resources should have correct href."""
        create_activity(
            activity_type="encounter",
            resource_type="Encounter",
            resource_id=456
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["resource"]["href"] == "/encounters/456"

    def test_lab_order_href(self, authenticated_client, create_activity):
        """Lab order resources should have correct href."""
        create_activity(
            activity_type="laboratory",
            resource_type="LabOrder",
            resource_id=789
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["resource"]["href"] == "/laboratory/orders/789"

    def test_prescription_href(self, authenticated_client, create_activity):
        """Prescription resources should have correct href."""
        create_activity(
            activity_type="prescription",
            resource_type="Prescription",
            resource_id=101
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["resource"]["href"] == "/pharmacy/prescriptions/101"

    def test_invoice_href(self, authenticated_client, create_activity):
        """Invoice resources should have correct href."""
        create_activity(
            activity_type="billing",
            resource_type="Invoice",
            resource_id=202
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["resource"]["href"] == "/billing/invoices/202"


# =============================================================================
# User Info Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedUserInfo:
    """Test user information in activity feed."""

    def test_includes_user_info(self, authenticated_client, create_activity, test_user):
        """Activity should include user information."""
        test_user.first_name = "Jane"
        test_user.last_name = "Nurse"
        test_user.save()

        create_activity(user=test_user)

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["user"]["id"] == test_user.id
        assert "Jane" in item["user"]["name"] or "Nurse" in item["user"]["name"]

    def test_handles_null_user(self, authenticated_client, activity_feed_model):
        """Should handle activities without user (system activities)."""
        activity_feed_model.objects.create(
            activity_type="system",
            action="backup_completed",
            title="System backup completed",
            description="Automatic daily backup",
            user=None,
            resource_type="System",
            resource_id=0,
        )

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["user"] is None

    def test_uses_username_when_no_full_name(self, authenticated_client, create_activity, test_user):
        """Should use username when full name is not set."""
        test_user.first_name = ""
        test_user.last_name = ""
        test_user.save()

        create_activity(user=test_user)

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        item = response.data["results"][0]

        assert item["user"]["name"] == test_user.username


# =============================================================================
# Edge Cases
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedEdgeCases:
    """Test edge cases for activity feed endpoint."""

    def test_empty_feed(self, authenticated_client):
        """Should handle empty activity feed gracefully."""
        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 0
        assert response.data["results"] == []
        assert response.data["next"] is None

    def test_invalid_limit_defaults_to_20(self, authenticated_client, create_activity):
        """Invalid limit should default to 20."""
        for i in range(25):
            create_activity(title=f"Activity {i}")

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?limit=invalid&refresh=true")

        assert len(response.data["results"]) == 20

    def test_negative_offset_treated_as_zero(self, authenticated_client, create_activity):
        """Negative offset should be treated as 0."""
        create_activity()

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?offset=-5&refresh=true")

        assert response.status_code == status.HTTP_200_OK

    def test_large_offset_returns_empty(self, authenticated_client, create_activity):
        """Large offset beyond data should return empty results."""
        create_activity()

        response = authenticated_client.get(f"{ACTIVITY_FEED_URL}?offset=1000&refresh=true")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"] == []


# =============================================================================
# Caching Tests
# =============================================================================


@pytest.mark.django_db
class TestActivityFeedCaching:
    """Test caching behavior for activity feed endpoint."""

    def test_cache_bypass_with_refresh(self, authenticated_client, create_activity):
        """Should bypass cache when refresh=true."""
        create_activity(title="Initial activity")

        # First request (may be cached)
        response1 = authenticated_client.get(ACTIVITY_FEED_URL)
        count1 = response1.data["count"]

        # Add another activity
        create_activity(title="New activity")

        # Request with refresh
        response2 = authenticated_client.get(f"{ACTIVITY_FEED_URL}?refresh=true")
        count2 = response2.data["count"]

        assert count2 == count1 + 1
