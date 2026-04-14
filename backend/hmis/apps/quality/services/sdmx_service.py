"""
SDMX-ML export service for Vitora HMIS.

Generates SDMX 2.1 StructureSpecificData messages from aggregate
report data (QuarterlyReport, AnnualReport, IDSRWeeklyReport).

Implements Gap #29 of the DHA compliance roadmap.
"""

import logging
from datetime import UTC, datetime
from xml.etree.ElementTree import Element, SubElement, tostring

logger = logging.getLogger(__name__)

# Namespaces for SDMX 2.1
NS = {
    "message": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message",
    "common": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common",
    "data": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/structurespecific",
}

AGENCY_ID = "VITORA"
DSD_ID_FACILITY = "DSD_FACILITY_STATS"
DSD_ID_SURVEILLANCE = "DSD_IDSR"


def _ns(prefix: str, tag: str) -> str:
    """Build a namespaced tag."""
    return f"{{{NS[prefix]}}}{tag}"


def _build_header(
    sender_id: str = "VITORA_HMIS",
    receiver_id: str = "KHIS",
    report_id: str = "",
) -> Element:
    """Build SDMX message header."""
    header = Element(_ns("message", "Header"))

    id_el = SubElement(header, _ns("message", "ID"))
    id_el.text = report_id or f"VITORA_{datetime.now(UTC).strftime('%Y%m%dT%H%M%S')}"

    test = SubElement(header, _ns("message", "Test"))
    test.text = "false"

    prepared = SubElement(header, _ns("message", "Prepared"))
    prepared.text = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S")

    sender = SubElement(header, _ns("message", "Sender"), id=sender_id)
    SubElement(sender, _ns("common", "Name"), **{"xml:lang": "en"}).text = "Vitora HMIS"

    receiver = SubElement(header, _ns("message", "Receiver"), id=receiver_id)
    SubElement(receiver, _ns("common", "Name"), **{"xml:lang": "en"}).text = receiver_id

    return header


class SDMXExportService:
    """Service for exporting aggregate data in SDMX-ML format."""

    def export_quarterly_to_sdmx(self, report) -> str:
        """
        Export a QuarterlyReport as SDMX-ML StructureSpecificData.

        Args:
            report: A QuarterlyReport model instance.

        Returns:
            SDMX-ML XML string.
        """
        root = Element(
            _ns("message", "StructureSpecificData"),
            {f"xmlns:{k}": v for k, v in NS.items()},
        )

        clinic_name = str(report.clinic) if report.clinic else "UNKNOWN"
        header = _build_header(
            report_id=f"QR_{report.year}_Q{report.quarter}_{report.id}",
            receiver_id="KHIS",
        )
        root.append(header)

        # DataSet
        dataset = SubElement(
            root,
            _ns("message", "DataSet"),
            structureRef=DSD_ID_FACILITY,
            action="Replace",
        )

        # Series: facility statistics
        period = f"{report.year}-Q{report.quarter}"
        observations = {
            "TOTAL_VISITS": report.total_visits,
            "NEW_VISITS": report.new_visits,
            "REVISITS": report.revisits,
            "PRIORITY_RED": report.priority_red,
            "PRIORITY_ORANGE": report.priority_orange,
            "PRIORITY_YELLOW": report.priority_yellow,
            "PRIORITY_GREEN": report.priority_green,
            "PRIORITY_BLUE": report.priority_blue,
            "MALE_VISITS": report.male_visits,
            "FEMALE_VISITS": report.female_visits,
            "UNDER_5_VISITS": report.under_5_visits,
            "UNDER_18_VISITS": report.under_18_visits,
            "ADULT_VISITS": report.adult_visits,
            "OVER_60_VISITS": report.over_60_visits,
            "NEW_ENROLLMENTS": report.new_enrollments,
            "ACTIVE_ENROLLMENTS": report.active_enrollments,
            "DEFAULTERS": report.defaulters,
            "ANC_FIRST_VISITS": report.anc_first_visits,
            "ANC_REVISITS": report.anc_revisits,
            "DELIVERIES": report.deliveries,
            "TOTAL_REVENUE": str(report.total_revenue),
            "SHA_CLAIMS_AMOUNT": str(report.sha_claims_amount),
            "CASH_AMOUNT": str(report.cash_amount),
        }

        series = SubElement(
            dataset,
            _ns("data", "Series"),
            FACILITY=clinic_name,
            FREQ="Q",
        )

        for indicator, value in observations.items():
            SubElement(
                series,
                _ns("data", "Obs"),
                TIME_PERIOD=period,
                OBS_VALUE=str(value),
                INDICATOR=indicator,
            )

        return tostring(root, encoding="unicode", xml_declaration=True)

    def export_annual_to_sdmx(self, report) -> str:
        """
        Export an AnnualReport as SDMX-ML StructureSpecificData.

        Args:
            report: An AnnualReport model instance.

        Returns:
            SDMX-ML XML string.
        """
        root = Element(
            _ns("message", "StructureSpecificData"),
            {f"xmlns:{k}": v for k, v in NS.items()},
        )

        clinic_name = str(report.clinic) if report.clinic else "UNKNOWN"
        header = _build_header(
            report_id=f"AR_{report.year}_{report.id}",
            receiver_id="KHIS",
        )
        root.append(header)

        dataset = SubElement(
            root,
            _ns("message", "DataSet"),
            structureRef=DSD_ID_FACILITY,
            action="Replace",
        )

        period = str(report.year)
        observations = {
            "TOTAL_VISITS": report.total_visits,
            "NEW_VISITS": report.new_visits,
            "REVISITS": report.revisits,
            "MALE_VISITS": report.male_visits,
            "FEMALE_VISITS": report.female_visits,
            "UNDER_5_VISITS": report.under_5_visits,
            "UNDER_18_VISITS": report.under_18_visits,
            "ADULT_VISITS": report.adult_visits,
            "OVER_60_VISITS": report.over_60_visits,
            "NEW_ENROLLMENTS": report.new_enrollments,
            "ACTIVE_ENROLLMENTS": report.active_enrollments,
            "DEFAULTERS": report.defaulters,
            "ANC_FIRST_VISITS": report.anc_first_visits,
            "ANC_REVISITS": report.anc_revisits,
            "DELIVERIES": report.deliveries,
            "TOTAL_REVENUE": str(report.total_revenue),
            "SHA_CLAIMS_AMOUNT": str(report.sha_claims_amount),
            "CASH_AMOUNT": str(report.cash_amount),
        }

        series = SubElement(
            dataset,
            _ns("data", "Series"),
            FACILITY=clinic_name,
            FREQ="A",
        )

        for indicator, value in observations.items():
            SubElement(
                series,
                _ns("data", "Obs"),
                TIME_PERIOD=period,
                OBS_VALUE=str(value),
                INDICATOR=indicator,
            )

        return tostring(root, encoding="unicode", xml_declaration=True)

    def export_idsr_to_sdmx(self, report) -> str:
        """
        Export an IDSRWeeklyReport as SDMX-ML StructureSpecificData.

        Args:
            report: An IDSRWeeklyReport model instance.

        Returns:
            SDMX-ML XML string.
        """
        root = Element(
            _ns("message", "StructureSpecificData"),
            {f"xmlns:{k}": v for k, v in NS.items()},
        )

        header = _build_header(
            report_id=f"IDSR_{report.epi_year}_W{report.epi_week}_{report.id}",
            receiver_id="KHIS",
        )
        root.append(header)

        dataset = SubElement(
            root,
            _ns("message", "DataSet"),
            structureRef=DSD_ID_SURVEILLANCE,
            action="Replace",
        )

        period = f"{report.epi_year}-W{report.epi_week:02d}"
        observations = {
            "TOTAL_CASES": report.total_cases,
            "TOTAL_DEATHS": report.total_deaths,
            "IMMEDIATE_CASES": report.immediate_cases,
            "LAB_CONFIRMED_CASES": report.lab_confirmed_cases,
        }

        series_attrs = {
            "FACILITY": report.facility_name or report.facility_code or "UNKNOWN",
            "FREQ": "W",
        }
        if report.county:
            series_attrs["COUNTY"] = str(report.county)

        series = SubElement(dataset, _ns("data", "Series"), **series_attrs)

        for indicator, value in observations.items():
            SubElement(
                series,
                _ns("data", "Obs"),
                TIME_PERIOD=period,
                OBS_VALUE=str(value),
                INDICATOR=indicator,
            )

        # Add per-disease breakdowns from summaries if available
        summaries = getattr(report, "disease_summaries", None)
        if summaries:
            for summary in summaries.all():
                disease_name = str(summary.disease) if summary.disease else "UNKNOWN"
                disease_series = SubElement(
                    dataset,
                    _ns("data", "Series"),
                    FACILITY=series_attrs["FACILITY"],
                    FREQ="W",
                    DISEASE=disease_name,
                )
                SubElement(
                    disease_series,
                    _ns("data", "Obs"),
                    TIME_PERIOD=period,
                    OBS_VALUE=str(getattr(summary, "cases_under_5", 0)),
                    INDICATOR="CASES_UNDER_5",
                )
                SubElement(
                    disease_series,
                    _ns("data", "Obs"),
                    TIME_PERIOD=period,
                    OBS_VALUE=str(getattr(summary, "cases_5_and_above", 0)),
                    INDICATOR="CASES_5_AND_ABOVE",
                )
                SubElement(
                    disease_series,
                    _ns("data", "Obs"),
                    TIME_PERIOD=period,
                    OBS_VALUE=str(getattr(summary, "deaths_under_5", 0)),
                    INDICATOR="DEATHS_UNDER_5",
                )
                SubElement(
                    disease_series,
                    _ns("data", "Obs"),
                    TIME_PERIOD=period,
                    OBS_VALUE=str(getattr(summary, "deaths_5_and_above", 0)),
                    INDICATOR="DEATHS_5_AND_ABOVE",
                )

        return tostring(root, encoding="unicode", xml_declaration=True)
