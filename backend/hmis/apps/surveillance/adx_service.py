"""
ADX (Aggregate Data Exchange) export service for DHIS2.

Generates ADX XML payloads as an alternative to JSON DataValueSet
for submitting aggregate data to KHIS/DHIS2.

ADX is a WHO/SDMX standard for health data exchange supported by DHIS2.
Reference: https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/data.html
"""

import logging
from xml.etree.ElementTree import Element, SubElement, tostring

from django.conf import settings

logger = logging.getLogger(__name__)


class ADXExportService:
    """Export aggregate data in ADX XML format for DHIS2."""

    def __init__(self):
        self.org_unit = getattr(settings, "DHIS2_ORG_UNIT", "")

    def export_idsr_to_adx(self, report) -> str:
        """
        Export an IDSR Weekly Report as ADX XML.

        Args:
            report: IDSRWeeklyReport model instance

        Returns:
            ADX XML string
        """
        adx = Element("adx")
        adx.set("xmlns", "urn:ihe:qrph:adx:2015")

        group = SubElement(adx, "group")
        group.set("orgUnit", self.org_unit)
        group.set("period", f"{report.epi_year}W{report.epi_week:02d}")
        group.set("dataSet", "IDSR_WEEKLY")

        # Add summary values
        self._add_value(group, "IDSR_TOTAL_CASES", report.total_cases)
        self._add_value(group, "IDSR_TOTAL_DEATHS", report.total_deaths)
        self._add_value(group, "IDSR_IMMEDIATE_CASES", report.immediate_cases)
        self._add_value(group, "IDSR_LAB_CONFIRMED", report.lab_confirmed_cases)

        # Add per-disease summaries if available
        if hasattr(report, "disease_summaries"):
            for summary in report.disease_summaries.all():
                disease_group = SubElement(adx, "group")
                disease_group.set("orgUnit", self.org_unit)
                disease_group.set("period", f"{report.epi_year}W{report.epi_week:02d}")
                disease_group.set("dataSet", "IDSR_DISEASE")

                disease_name = str(summary.disease) if summary.disease else "unknown"
                self._add_value(
                    disease_group,
                    "CASES_UNDER_5",
                    summary.cases_under_5,
                    {"disease": disease_name},
                )
                self._add_value(
                    disease_group,
                    "CASES_5_AND_ABOVE",
                    summary.cases_5_and_above,
                    {"disease": disease_name},
                )
                self._add_value(
                    disease_group,
                    "DEATHS_UNDER_5",
                    summary.deaths_under_5,
                    {"disease": disease_name},
                )
                self._add_value(
                    disease_group,
                    "DEATHS_5_AND_ABOVE",
                    summary.deaths_5_and_above,
                    {"disease": disease_name},
                )

        return tostring(adx, encoding="unicode", xml_declaration=True)

    def export_quarterly_to_adx(self, report) -> str:
        """
        Export a Quarterly Report as ADX XML.

        Args:
            report: QuarterlyReport model instance

        Returns:
            ADX XML string
        """
        adx = Element("adx")
        adx.set("xmlns", "urn:ihe:qrph:adx:2015")

        group = SubElement(adx, "group")
        group.set("orgUnit", self.org_unit)
        group.set("period", f"{report.year}Q{report.quarter}")
        group.set("dataSet", "QUARTERLY_FACILITY")

        self._add_value(group, "TOTAL_VISITS", report.total_visits)
        self._add_value(group, "NEW_VISITS", report.new_visits)
        self._add_value(group, "REVISITS", report.revisits)
        self._add_value(group, "UNDER_5_VISITS", getattr(report, "under_5_visits", 0))
        self._add_value(group, "OVER_5_VISITS", getattr(report, "over_5_visits", 0))

        # Priority breakdown
        for priority in ["red", "orange", "yellow", "green", "blue"]:
            field = f"priority_{priority}"
            self._add_value(
                group, f"PRIORITY_{priority.upper()}", getattr(report, field, 0)
            )

        return tostring(adx, encoding="unicode", xml_declaration=True)

    def _add_value(
        self,
        parent: Element,
        data_element: str,
        value,
        attributes: dict | None = None,
    ) -> None:
        """Add a dataValue element to an ADX group."""
        if value is None:
            return
        dv = SubElement(parent, "dataValue")
        dv.set("dataElement", data_element)
        dv.set("value", str(value))
        if attributes:
            for key, val in attributes.items():
                dv.set(key, str(val))
