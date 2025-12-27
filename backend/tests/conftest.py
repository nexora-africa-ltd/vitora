"""
Pytest configuration and fixtures for Vitora HMIS tests.

This file contains shared fixtures and configuration for all tests.
"""

from collections.abc import Generator

import pytest

# ============================================================================
# Pytest Configuration
# ============================================================================


def pytest_configure(config):
    """Configure pytest with custom settings."""
    config.addinivalue_line("markers", "unit: Mark test as a unit test")
    config.addinivalue_line("markers", "integration: Mark test as an integration test")
    config.addinivalue_line("markers", "e2e: Mark test as an end-to-end test")
    config.addinivalue_line("markers", "slow: Mark test as slow running")


# ============================================================================
# Django Settings (will be used when Django is set up)
# ============================================================================

# @pytest.fixture(scope="session")
# def django_db_setup():
#     """Set up test database."""
#     pass


# ============================================================================
# Common Fixtures
# ============================================================================


@pytest.fixture
def sample_data() -> dict:
    """
    Provide sample data for tests.

    Returns:
        dict: Sample data dictionary
    """
    return {"name": "Test User", "email": "test@example.com", "age": 30}


@pytest.fixture
def mock_settings(monkeypatch) -> Generator[None, None, None]:
    """
    Mock Django settings for testing.

    Args:
        monkeypatch: Pytest monkeypatch fixture

    Yields:
        None
    """
    # This will be used once Django is set up
    # monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "hmis.settings.test")
    yield


# ============================================================================
# Database Fixtures (will be activated when Django is set up)
# ============================================================================

# @pytest.fixture
# def db_patient(db):
#     """Create a test patient in the database."""
#     from hmis.apps.patients.models import Patient
#     return Patient.objects.create(
#         first_name="John",
#         last_name="Doe",
#         date_of_birth="1990-01-01",
#         gender="M"
#     )


# @pytest.fixture
# def db_encounter(db, db_patient):
#     """Create a test encounter in the database."""
#     from hmis.apps.encounters.models import Encounter
#     return Encounter.objects.create(
#         patient=db_patient,
#         encounter_type="OPD",
#         chief_complaint="Headache"
#     )


# ============================================================================
# API Client Fixtures (will be activated when Django is set up)
# ============================================================================

# @pytest.fixture
# def api_client():
#     """Provide Django REST framework API client."""
#     from rest_framework.test import APIClient
#     return APIClient()


# @pytest.fixture
# def authenticated_client(api_client, db):
#     """Provide authenticated API client."""
#     from django.contrib.auth import get_user_model
#     User = get_user_model()
#     user = User.objects.create_user(
#         username="testuser",
#         password="testpass123"
#     )
#     api_client.force_authenticate(user=user)
#     return api_client


# ============================================================================
# Factory Fixtures (will be activated when models are created)
# ============================================================================

# @pytest.fixture
# def patient_factory():
#     """Provide patient factory for creating test patients."""
#     from tests.factories import PatientFactory
#     return PatientFactory


# @pytest.fixture
# def encounter_factory():
#     """Provide encounter factory for creating test encounters."""
#     from tests.factories import EncounterFactory
#     return EncounterFactory
