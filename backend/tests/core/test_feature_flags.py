"""
Tests for FeatureFlag model and API.

TDD: These tests define the expected behavior BEFORE implementation.
"""

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def feature_flag(db):
    """Create a sample feature flag."""
    from hmis.apps.core.models import FeatureFlag

    return FeatureFlag.objects.create(
        name="smart_autopopulate",
        description="Enable AI/CDS smart autopopulation with user confirmation",
        is_enabled=False,
    )


@pytest.fixture
def enabled_flag(db):
    """Create an enabled feature flag."""
    from hmis.apps.core.models import FeatureFlag

    return FeatureFlag.objects.create(
        name="test_feature",
        description="A test feature",
        is_enabled=True,
    )


class TestFeatureFlagModel:
    """Tests for the FeatureFlag model."""

    def test_create_feature_flag(self, feature_flag):
        """Should create a feature flag with default disabled state."""
        assert feature_flag.name == "smart_autopopulate"
        assert feature_flag.is_enabled is False
        assert feature_flag.description != ""
        assert feature_flag.created_at is not None
        assert feature_flag.updated_at is not None

    def test_feature_flag_str(self, feature_flag):
        """String representation should include name and status."""
        result = str(feature_flag)
        assert "smart_autopopulate" in result

    def test_unique_name_constraint(self, feature_flag):
        """Should not allow duplicate flag names."""
        from django.db import IntegrityError

        from hmis.apps.core.models import FeatureFlag

        with pytest.raises(IntegrityError):
            FeatureFlag.objects.create(
                name="smart_autopopulate",
                description="Duplicate",
            )

    def test_is_flag_enabled_class_method(self, feature_flag, enabled_flag):
        """Should provide a class method to check flag state."""
        from hmis.apps.core.models import FeatureFlag

        assert FeatureFlag.is_flag_enabled("smart_autopopulate") is False
        assert FeatureFlag.is_flag_enabled("test_feature") is True
        # Non-existent flags should default to False
        assert FeatureFlag.is_flag_enabled("nonexistent_flag") is False

    def test_enable_disable(self, feature_flag):
        """Should be able to toggle flag state."""
        assert feature_flag.is_enabled is False
        feature_flag.is_enabled = True
        feature_flag.save()
        feature_flag.refresh_from_db()
        assert feature_flag.is_enabled is True


class TestFeatureFlagAPI:
    """Tests for the FeatureFlag read-only API."""

    def test_list_flags_authenticated(self, authenticated_client, feature_flag, enabled_flag):
        """Should return all feature flags for authenticated users."""
        response = authenticated_client.get("/api/core/features/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2

    def test_list_flags_unauthenticated(self, api_client, feature_flag):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/core/features/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_flag_response_shape(self, authenticated_client, feature_flag):
        """Response should contain name, is_enabled, and description."""
        response = authenticated_client.get("/api/core/features/")
        assert response.status_code == status.HTTP_200_OK
        flag_data = response.data[0]
        assert "name" in flag_data
        assert "is_enabled" in flag_data
        assert "description" in flag_data

    def test_no_create_via_api(self, authenticated_client):
        """Should not allow creating flags via API (admin-only)."""
        response = authenticated_client.post(
            "/api/core/features/",
            {"name": "new_flag", "is_enabled": True, "description": "test"},
        )
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_no_update_via_api(self, authenticated_client, feature_flag):
        """Should not allow updating flags via API (admin-only)."""
        response = authenticated_client.patch(
            f"/api/core/features/{feature_flag.id}/",
            {"is_enabled": True},
        )
        # ListModelMixin-only viewset has no detail routes — returns 404
        assert response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_no_delete_via_api(self, authenticated_client, feature_flag):
        """Should not allow deleting flags via API."""
        response = authenticated_client.delete(f"/api/core/features/{feature_flag.id}/")
        assert response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_check_endpoint(self, authenticated_client, feature_flag, enabled_flag):
        """Should provide a check endpoint for specific flag by name."""
        response = authenticated_client.get("/api/core/features/check/?name=smart_autopopulate")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "smart_autopopulate"
        assert response.data["is_enabled"] is False

        response = authenticated_client.get("/api/core/features/check/?name=test_feature")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_enabled"] is True

    def test_check_nonexistent_flag(self, authenticated_client):
        """Should return disabled for non-existent flags."""
        response = authenticated_client.get("/api/core/features/check/?name=nonexistent")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_enabled"] is False
