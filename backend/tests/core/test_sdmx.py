"""
Tests for SDMX export service (Gap #29).

Covers:
- SDMX-ML generation for QuarterlyReport
- SDMX-ML generation for AnnualReport
- SDMX-ML generation for IDSRWeeklyReport
- XML well-formedness
- Correct data mapping
- Export endpoints
"""

from unittest.mock import MagicMock
from xml.etree.ElementTree import fromstring

import pytest  # type: ignore
from rest_framework import status


def _make_mock_quarterly_report(**overrides):
    """Create a mock QuarterlyReport for testing."""
    defaults = {
        "id": 1,
        "year": 2026,
        "quarter": 1,
        "clinic": MagicMock(__str__=lambda self: "Demo Clinic"),
        "total_visits": 1500,
        "new_visits": 800,
        "revisits": 700,
        "priority_red": 50,
        "priority_orange": 100,
        "priority_yellow": 200,
        "priority_green": 900,
        "priority_blue": 250,
        "male_visits": 600,
        "female_visits": 900,
        "under_5_visits": 200,
        "under_18_visits": 300,
        "adult_visits": 800,
        "over_60_visits": 200,
        "new_enrollments": 50,
        "active_enrollments": 200,
        "defaulters": 10,
        "anc_first_visits": 80,
        "anc_revisits": 120,
        "deliveries": 45,
        "total_revenue": "1500000.00",
        "sha_claims_amount": "900000.00",
        "cash_amount": "600000.00",
    }
    defaults.update(overrides)
    report = MagicMock()
    for k, v in defaults.items():
        setattr(report, k, v)
    return report


def _make_mock_annual_report(**overrides):
    """Create a mock AnnualReport for testing."""
    defaults = {
        "id": 1,
        "year": 2025,
        "clinic": MagicMock(__str__=lambda self: "Demo Clinic"),
        "total_visits": 6000,
        "new_visits": 3200,
        "revisits": 2800,
        "male_visits": 2400,
        "female_visits": 3600,
        "under_5_visits": 800,
        "under_18_visits": 1200,
        "adult_visits": 3200,
        "over_60_visits": 800,
        "new_enrollments": 200,
        "active_enrollments": 800,
        "defaulters": 40,
        "anc_first_visits": 320,
        "anc_revisits": 480,
        "deliveries": 180,
        "total_revenue": "6000000.00",
        "sha_claims_amount": "3600000.00",
        "cash_amount": "2400000.00",
    }
    defaults.update(overrides)
    report = MagicMock()
    for k, v in defaults.items():
        setattr(report, k, v)
    return report


def _make_mock_idsr_report(**overrides):
    """Create a mock IDSRWeeklyReport for testing."""
    defaults = {
        "id": 1,
        "epi_year": 2026,
        "epi_week": 8,
        "facility_code": "MFL001",
        "facility_name": "Demo Health Centre",
        "county": MagicMock(__str__=lambda self: "Nairobi"),
        "total_cases": 45,
        "total_deaths": 2,
        "immediate_cases": 5,
        "lab_confirmed_cases": 12,
        "disease_summaries": MagicMock(all=MagicMock(return_value=[])),
    }
    defaults.update(overrides)
    report = MagicMock()
    for k, v in defaults.items():
        setattr(report, k, v)
    return report


class TestSDMXExportService:
    """Tests for the SDMXExportService."""

    def test_quarterly_report_xml_well_formed(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_quarterly_report()
        service = SDMXExportService()
        xml_str = service.export_quarterly_to_sdmx(report)

        # Should be valid XML
        root = fromstring(xml_str)
        assert root is not None
        assert "StructureSpecificData" in root.tag

    def test_quarterly_report_contains_header(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_quarterly_report()
        service = SDMXExportService()
        xml_str = service.export_quarterly_to_sdmx(report)

        root = fromstring(xml_str)
        # Find Header element (namespace-agnostic)
        header = None
        for child in root:
            if "Header" in child.tag:
                header = child
                break
        assert header is not None

    def test_quarterly_report_correct_data(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_quarterly_report(total_visits=1500, year=2026, quarter=1)
        service = SDMXExportService()
        xml_str = service.export_quarterly_to_sdmx(report)

        root = fromstring(xml_str)
        # Find the observations
        obs_values = {}
        for elem in root.iter():
            if "Obs" in elem.tag:
                indicator = elem.get("INDICATOR", "")
                obs_values[indicator] = elem.get("OBS_VALUE", "")

        assert obs_values["TOTAL_VISITS"] == "1500"
        assert obs_values["NEW_VISITS"] == "800"

    def test_quarterly_report_correct_period(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_quarterly_report(year=2026, quarter=3)
        service = SDMXExportService()
        xml_str = service.export_quarterly_to_sdmx(report)

        root = fromstring(xml_str)
        for elem in root.iter():
            if "Obs" in elem.tag:
                assert elem.get("TIME_PERIOD") == "2026-Q3"
                break

    def test_annual_report_xml_well_formed(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_annual_report()
        service = SDMXExportService()
        xml_str = service.export_annual_to_sdmx(report)

        root = fromstring(xml_str)
        assert "StructureSpecificData" in root.tag

    def test_annual_report_correct_period(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_annual_report(year=2025)
        service = SDMXExportService()
        xml_str = service.export_annual_to_sdmx(report)

        root = fromstring(xml_str)
        for elem in root.iter():
            if "Obs" in elem.tag:
                assert elem.get("TIME_PERIOD") == "2025"
                break

    def test_annual_report_frequency_is_annual(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_annual_report()
        service = SDMXExportService()
        xml_str = service.export_annual_to_sdmx(report)

        root = fromstring(xml_str)
        for elem in root.iter():
            if "Series" in elem.tag:
                assert elem.get("FREQ") == "A"
                break

    def test_idsr_report_xml_well_formed(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_idsr_report()
        service = SDMXExportService()
        xml_str = service.export_idsr_to_sdmx(report)

        root = fromstring(xml_str)
        assert "StructureSpecificData" in root.tag

    def test_idsr_report_correct_period(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_idsr_report(epi_year=2026, epi_week=8)
        service = SDMXExportService()
        xml_str = service.export_idsr_to_sdmx(report)

        root = fromstring(xml_str)
        for elem in root.iter():
            if "Obs" in elem.tag:
                assert elem.get("TIME_PERIOD") == "2026-W08"
                break

    def test_idsr_report_surveillance_data(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_idsr_report(
            total_cases=45, total_deaths=2, immediate_cases=5, lab_confirmed_cases=12
        )
        service = SDMXExportService()
        xml_str = service.export_idsr_to_sdmx(report)

        root = fromstring(xml_str)
        obs_values = {}
        for elem in root.iter():
            if "Obs" in elem.tag:
                indicator = elem.get("INDICATOR", "")
                obs_values[indicator] = elem.get("OBS_VALUE", "")

        assert obs_values["TOTAL_CASES"] == "45"
        assert obs_values["TOTAL_DEATHS"] == "2"
        assert obs_values["IMMEDIATE_CASES"] == "5"
        assert obs_values["LAB_CONFIRMED_CASES"] == "12"

    def test_idsr_report_with_disease_summaries(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        # Mock disease summary
        summary = MagicMock()
        summary.disease = MagicMock(__str__=lambda self: "Cholera")
        summary.cases_under_5 = 3
        summary.cases_5_and_above = 7
        summary.deaths_under_5 = 1
        summary.deaths_5_and_above = 0

        report = _make_mock_idsr_report()
        report.disease_summaries = MagicMock(all=MagicMock(return_value=[summary]))

        service = SDMXExportService()
        xml_str = service.export_idsr_to_sdmx(report)

        root = fromstring(xml_str)
        # Should have disease-specific series with DISEASE attribute
        disease_series = []
        for elem in root.iter():
            if "Series" in elem.tag and elem.get("DISEASE"):
                disease_series.append(elem)
        assert len(disease_series) == 1
        assert disease_series[0].get("DISEASE") == "Cholera"

    def test_quarterly_report_null_clinic(self):
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = _make_mock_quarterly_report(clinic=None)
        service = SDMXExportService()
        xml_str = service.export_quarterly_to_sdmx(report)

        root = fromstring(xml_str)
        for elem in root.iter():
            if "Series" in elem.tag:
                assert elem.get("FACILITY") == "UNKNOWN"
                break


class TestSDMXExportEndpoints:
    """Tests for the SDMX export API endpoints."""

    @pytest.mark.django_db
    def test_quarterly_export_requires_auth(self, api_client):
        response = api_client.get("/api/quality/quarterly-reports/999/export-sdmx/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_annual_export_requires_auth(self, api_client):
        response = api_client.get("/api/quality/annual-reports/999/export-sdmx/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_idsr_export_requires_auth(self, api_client):
        response = api_client.get("/api/surveillance/idsr/999/export-sdmx/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_quarterly_export_not_found(self, authenticated_client):
        response = authenticated_client.get("/api/quality/quarterly-reports/99999/export-sdmx/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_annual_export_not_found(self, authenticated_client):
        response = authenticated_client.get("/api/quality/annual-reports/99999/export-sdmx/")
        assert response.status_code == status.HTTP_404_NOT_FOUND
