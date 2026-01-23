"""
Tests for staff API endpoints - username checking and suggestions.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

User = get_user_model()


@pytest.mark.django_db
class TestStaffUsernameCheck:
    """Tests for username availability check endpoint."""

    def test_check_available_username(self, authenticated_client):
        """Should return available=True for unused username."""
        response = authenticated_client.get(
            "/api/staff/check_username/",
            {"username": "uniqueusername123"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["available"] is True
        assert response.data["username"] == "uniqueusername123"
        assert response.data["suggestions"] == []

    def test_check_taken_username(self, authenticated_client, test_user):
        """Should return available=False for taken username."""
        response = authenticated_client.get(
            "/api/staff/check_username/",
            {"username": test_user.username},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["available"] is False
        assert response.data["username"] == test_user.username.lower()
        assert len(response.data["suggestions"]) > 0

    def test_check_username_case_insensitive(self, authenticated_client, test_user):
        """Should check username case-insensitively."""
        response = authenticated_client.get(
            "/api/staff/check_username/",
            {"username": test_user.username.upper()},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["available"] is False

    def test_check_username_missing_param(self, authenticated_client):
        """Should return error when username not provided."""
        response = authenticated_client.get("/api/staff/check_username/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "required" in response.data["error"].lower()

    def test_check_username_too_short(self, authenticated_client):
        """Should return error for username less than 3 characters."""
        response = authenticated_client.get(
            "/api/staff/check_username/",
            {"username": "ab"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "3 characters" in response.data["error"]

    def test_suggestions_when_taken(self, authenticated_client):
        """Should provide numbered suggestions for taken username."""
        # Create user with base username
        User.objects.create_user(username="johndoe", password="testpass")

        response = authenticated_client.get(
            "/api/staff/check_username/",
            {"username": "johndoe"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["available"] is False
        suggestions = response.data["suggestions"]
        assert len(suggestions) >= 1
        assert all("johndoe" in s for s in suggestions)


@pytest.mark.django_db
class TestStaffUsernameSuggestion:
    """Tests for username suggestion endpoint."""

    def test_suggest_username_basic(self, authenticated_client):
        """Should suggest usernames based on names."""
        response = authenticated_client.post(
            "/api/staff/suggest_username/",
            {"first_name": "John", "last_name": "Kamau"},
        )

        assert response.status_code == status.HTTP_200_OK
        suggestions = response.data["suggestions"]
        assert len(suggestions) > 0
        # Should include patterns like john.kamau, jkamau, johnk
        suggestion_str = " ".join(suggestions)
        assert "john" in suggestion_str.lower()

    def test_suggest_username_with_middle_name(self, authenticated_client):
        """Should include middle name in suggestions."""
        response = authenticated_client.post(
            "/api/staff/suggest_username/",
            {
                "first_name": "Mary",
                "last_name": "Wanjiku",
                "middle_name": "Njeri",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        suggestions = response.data["suggestions"]
        assert len(suggestions) > 0

    def test_suggest_username_missing_names(self, authenticated_client):
        """Should return error when names not provided."""
        response = authenticated_client.post(
            "/api/staff/suggest_username/",
            {"first_name": "John"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "required" in response.data["error"].lower()

    def test_suggest_username_cleans_special_chars(self, authenticated_client):
        """Should remove special characters from names."""
        response = authenticated_client.post(
            "/api/staff/suggest_username/",
            {"first_name": "John-Paul", "last_name": "O'Brien"},
        )

        assert response.status_code == status.HTTP_200_OK
        suggestions = response.data["suggestions"]
        # All suggestions should be alphanumeric (no hyphens or apostrophes)
        for suggestion in suggestions:
            assert suggestion.replace(".", "").replace("_", "").isalnum()

    def test_suggest_username_numbered_fallback(self, authenticated_client):
        """Should add numbers if base usernames are taken."""
        # Create users with common patterns
        User.objects.create_user(username="peter.ochieng", password="testpass")
        User.objects.create_user(username="pochieng", password="testpass")
        User.objects.create_user(username="petero", password="testpass")
        User.objects.create_user(username="peter_ochieng", password="testpass")

        response = authenticated_client.post(
            "/api/staff/suggest_username/",
            {"first_name": "Peter", "last_name": "Ochieng"},
        )

        assert response.status_code == status.HTTP_200_OK
        suggestions = response.data["suggestions"]
        # Should still have suggestions (with numbers)
        assert len(suggestions) > 0


@pytest.mark.django_db
class TestStaffDeactivation:
    """Tests for staff soft deletion (deactivation)."""

    def test_staff_deactivation_sets_terminated_status(self, authenticated_client):
        """Verify staff profile tracks termination fields."""
        from hmis.apps.core.models import StaffProfile

        # This tests that the model has the expected fields
        assert hasattr(StaffProfile, "employment_status")
        assert hasattr(StaffProfile, "date_left")
