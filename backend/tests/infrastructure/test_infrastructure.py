"""
Infrastructure smoke tests for Vitora HMIS.

These tests validate that the testing infrastructure is properly set up.
They should pass even without any application code.
"""

import sys

import pytest  # type: ignore


@pytest.mark.unit
def test_python_version():
    """Test that Python version is 3.12 or higher."""
    assert sys.version_info >= (3, 12), "Python 3.12+ is required"


@pytest.mark.unit
def test_pytest_working():
    """Test that pytest is working correctly."""
    assert True, "Pytest should work"


@pytest.mark.unit
def test_sample_data_fixture(sample_data):
    """Test that fixtures are working correctly."""
    assert sample_data is not None
    assert isinstance(sample_data, dict)
    assert "name" in sample_data


@pytest.mark.unit
def test_basic_math():
    """Test basic assertions work."""
    assert 1 + 1 == 2
    assert 2 * 2 == 4


@pytest.mark.unit
class TestInfrastructure:
    """Test class to validate test infrastructure."""

    def test_class_based_tests_work(self):
        """Test that class-based tests work."""
        assert True

    def test_fixture_in_class(self, sample_data):
        """Test that fixtures work in class-based tests."""
        assert sample_data["name"] == "Test User"


@pytest.mark.unit
@pytest.mark.parametrize(
    "input,expected",
    [
        (1, 2),
        (2, 4),
        (3, 6),
    ],
)
def test_parametrized_tests(input, expected):
    """Test that parametrized tests work."""
    assert input * 2 == expected


@pytest.mark.slow
def test_slow_test_marker():
    """Test that slow marker works (can be skipped with -m 'not slow')."""
    import time

    time.sleep(0.1)
    assert True


# ============================================================================
# Integration Test Examples (will be uncommented when Django is set up)
# ============================================================================

# @pytest.mark.integration
# def test_database_connection(db):
#     """Test database connection."""
#     from django.db import connection
#     with connection.cursor() as cursor:
#         cursor.execute("SELECT 1")
#         result = cursor.fetchone()
#         assert result[0] == 1


# @pytest.mark.integration
# def test_django_settings():
#     """Test Django settings are loaded."""
#     from django.conf import settings
#     assert settings.DEBUG is not None


# ============================================================================
# E2E Test Examples (will be uncommented when API is set up)
# ============================================================================

# @pytest.mark.e2e
# def test_health_check_endpoint(api_client):
#     """Test health check endpoint."""
#     response = api_client.get("/health/")
#     assert response.status_code == 200
