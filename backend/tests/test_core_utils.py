"""
Tests for core utility functions.
"""

import pytest # type: ignore
from django.conf import settings

from hmis.apps.core.utils import (
    generate_case_number,
    generate_ob_number,
    generate_prc_number,
)


class TestGeneratePRCNumber:
    """Tests for PRC number generation."""

    def test_generate_prc_number_format(self):
        """Should generate PRC number in correct format."""
        prc = generate_prc_number()

        # Should match format: FAC-PRC-XXXX/YYYY
        assert prc.startswith("FAC-PRC-")
        assert "/" in prc
        parts = prc.split("-PRC-")
        assert len(parts) == 2
        sequence_year = parts[1]
        sequence, year = sequence_year.split("/")
        assert len(sequence) == 4
        assert sequence.isdigit()
        assert len(year) == 4
        assert year.isdigit()

    def test_generate_prc_number_with_custom_facility_code(self):
        """Should use custom facility code when provided."""
        prc = generate_prc_number(facility_code="KNH")

        assert prc.startswith("KNH-PRC-")

    def test_generate_prc_number_sequential(self):
        """Should generate sequential numbers."""
        prc1 = generate_prc_number()
        # Without actual PRC encounters in the database,
        # each call should return the same number (0001)
        assert "0001" in prc1


class TestGenerateCaseNumber:
    """Tests for generic case number generation."""

    def test_generate_case_number_format(self):
        """Should generate case number in correct format."""
        case_num = generate_case_number("RTA")

        # Should match format: FAC-RTA-XXXX/YYYY
        assert "FAC-RTA-" in case_num
        assert "/" in case_num

    def test_generate_case_number_with_custom_prefix(self):
        """Should use custom prefix."""
        case_num = generate_case_number("TRAUMA")

        assert "TRAUMA" in case_num

    def test_generate_case_number_with_custom_facility_code(self):
        """Should use custom facility code when provided."""
        case_num = generate_case_number("GBV", facility_code="MOH")

        assert case_num.startswith("MOH-GBV-")


class TestGenerateOBNumber:
    """Tests for OB number placeholder generation."""

    def test_generate_ob_number_format(self):
        """Should generate OB number placeholder in correct format."""
        ob = generate_ob_number()

        # Should match format: OB/____/YYYY
        assert ob.startswith("OB/")
        assert "____" in ob  # Placeholder for police-assigned number
        parts = ob.split("/")
        assert len(parts) == 3
        year = parts[2]
        assert len(year) == 4
        assert year.isdigit()


@pytest.mark.django_db
class TestPRCNumberAPI:
    """Integration tests for PRC number API endpoint."""

    def test_generate_prc_number_endpoint(self, authenticated_client):
        """Should return PRC number via API."""
        response = authenticated_client.get("/api/core/generate/prc-number/")

        assert response.status_code == 200
        assert "prc_number" in response.data
        assert response.data["prc_number"].startswith("FAC-PRC-")

    def test_generate_prc_number_endpoint_with_facility_code(self, authenticated_client):
        """Should accept custom facility code."""
        response = authenticated_client.get(
            "/api/core/generate/prc-number/", {"facility_code": "KNH"}
        )

        assert response.status_code == 200
        assert response.data["prc_number"].startswith("KNH-PRC-")

    def test_generate_prc_number_endpoint_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/core/generate/prc-number/")

        assert response.status_code == 401


@pytest.mark.django_db
class TestCaseNumberAPI:
    """Integration tests for case number API endpoint."""

    def test_generate_case_number_endpoint(self, authenticated_client):
        """Should return case number via API."""
        response = authenticated_client.get(
            "/api/core/generate/case-number/", {"prefix": "RTA"}
        )

        assert response.status_code == 200
        assert "case_number" in response.data
        assert "RTA" in response.data["case_number"]

    def test_generate_case_number_endpoint_default_prefix(self, authenticated_client):
        """Should use default CASE prefix if not provided."""
        response = authenticated_client.get("/api/core/generate/case-number/")

        assert response.status_code == 200
        assert "CASE" in response.data["case_number"]

    def test_generate_case_number_endpoint_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/core/generate/case-number/")

        assert response.status_code == 401
