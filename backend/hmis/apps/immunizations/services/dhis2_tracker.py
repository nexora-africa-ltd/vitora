"""
AEFI DHIS2 Tracker submission service.

Submits AEFI reports to the Kenya DHIS2 AEFI Tracker Program as
Tracker Events. Mirrors the pattern used by IDSRReportingService
for aggregate data, adapted for the Tracker API.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Load tracker mappings once at module level
_MAPPINGS_PATH = Path(settings.BASE_DIR) / "data" / "dhis2_aefi_tracker_mappings.json"
_MAPPINGS: dict | None = None


def _get_mappings() -> dict:
    global _MAPPINGS
    if _MAPPINGS is None:
        try:
            _MAPPINGS = json.loads(_MAPPINGS_PATH.read_text())
        except FileNotFoundError:
            logger.error("AEFI tracker mappings file not found: %s", _MAPPINGS_PATH)
            _MAPPINGS = {}
    return _MAPPINGS


class AEFITrackerService:
    """Service for submitting AEFI reports to DHIS2 Tracker API."""

    @classmethod
    def prepare_tracker_payload(cls, aefi) -> dict:
        """Build a DHIS2 Tracker Event payload from an AEFI instance.

        Args:
            aefi: AEFI model instance with related immunization_record.

        Returns:
            dict suitable for POST to /api/tracker
        """
        mappings = _get_mappings()
        de = mappings.get("dataElements", {})
        program = mappings.get("program", {})

        record = aefi.immunization_record
        vaccine = record.vaccine if record else None

        org_unit = getattr(settings, "DHIS2_ORG_UNIT", "")
        if aefi.institution_mfl_code:
            org_unit = aefi.institution_mfl_code

        data_values = []

        def _add(de_key: str, value):
            if value is not None and value != "" and de_key in de:
                data_values.append({
                    "dataElement": de[de_key],
                    "value": str(value),
                })

        _add("event_date", aefi.event_date.isoformat() if aefi.event_date else None)
        _add("onset_time", str(aefi.onset_time) if aefi.onset_time else None)
        _add("event_types", ",".join(aefi.event_types or []))
        _add("severity", aefi.severity)
        _add("outcome", aefi.outcome)
        _add("description", aefi.description)
        _add("report_type", aefi.report_type)

        # Vaccine details from immunization record
        if vaccine:
            _add("vaccine_name", vaccine.name)
            _add("vaccine_dose", record.dose_number)
            _add("vaccine_manufacturer", record.vaccine_manufacturer)
        if record:
            _add("vaccine_batch", record.batch_number)
            _add("vaccination_date", record.administered_date.isoformat() if record.administered_date else None)
            _add("vaccination_service_type", record.vaccination_service_type)
            _add("diluent_name", record.diluent_manufacturer)
            _add("diluent_batch_number", record.diluent_batch_number)

        # Facility info
        _add("vaccination_centre_name", aefi.vaccination_centre_name)
        _add("vaccination_centre_mfl", aefi.institution_mfl_code)

        # Reporter info (from reported_by User FK)
        reporter = aefi.reported_by
        if reporter:
            _add("reporter_name", reporter.get_full_name() or reporter.username)
            # Phone from staff profile if available
            profile = getattr(reporter, "staff_profile", None)
            if profile:
                _add("reporter_phone", getattr(profile, "phone", ""))
        _add("reporter_designation", aefi.reported_by_designation)

        # Actions and specimen
        _add("action_taken", aefi.treatment_details)
        _add("specimen_collected", str(aefi.specimen_collected).lower())

        # National classification (may be empty for initial reports)
        _add("national_classification", aefi.national_classification)

        event_date = aefi.event_date.isoformat() if aefi.event_date else timezone.localdate().isoformat()

        return {
            "events": [
                {
                    "program": program.get("id", ""),
                    "programStage": program.get("programStage", ""),
                    "orgUnit": org_unit,
                    "occurredAt": event_date,
                    "status": "COMPLETED",
                    "dataValues": data_values,
                }
            ]
        }

    @classmethod
    def submit_to_dhis2(cls, aefi) -> dict:
        """Submit an AEFI report to DHIS2 Tracker API.

        Args:
            aefi: AEFI instance. Must have reported_to_authorities=True.

        Returns:
            DHIS2 API response dict.
        """
        import requests

        if not aefi.reported_to_authorities:
            raise ValueError("AEFI must be marked as reported before DHIS2 submission")

        if aefi.dhis2_submitted_at:
            logger.info("AEFI %s already submitted to DHIS2, skipping", aefi.id)
            return {"status": "already_submitted"}

        dhis2_url = getattr(settings, "DHIS2_API_URL", None)
        dhis2_username = getattr(settings, "DHIS2_USERNAME", None)
        dhis2_password = getattr(settings, "DHIS2_PASSWORD", None)

        if not all([dhis2_url, dhis2_username, dhis2_password]):
            logger.warning("DHIS2 credentials not configured, skipping AEFI submission")
            return {"status": "error", "message": "DHIS2 not configured"}

        payload = cls.prepare_tracker_payload(aefi)

        try:
            response = requests.post(
                f"{dhis2_url}/api/tracker",
                json=payload,
                auth=(dhis2_username, dhis2_password),
                headers={"Content-Type": "application/json"},
                timeout=30,
            )

            response_data = response.json() if response.text else {}

            if response.ok:
                aefi.dhis2_submitted_at = timezone.now()
                aefi.dhis2_response = response_data
                aefi.save(update_fields=["dhis2_submitted_at", "dhis2_response"])
                logger.info("AEFI %s submitted to DHIS2 successfully", aefi.id)
            else:
                aefi.dhis2_response = {
                    "status": "error",
                    "http_status": response.status_code,
                    "body": response_data,
                }
                aefi.save(update_fields=["dhis2_response"])
                logger.error(
                    "AEFI DHIS2 submission failed: %s — %s",
                    response.status_code,
                    response_data,
                )

            return response_data

        except requests.RequestException as e:
            error_response = {"status": "error", "message": str(e)}
            aefi.dhis2_response = error_response
            aefi.save(update_fields=["dhis2_response"])
            logger.error("AEFI DHIS2 request failed: %s", e)
            return error_response
