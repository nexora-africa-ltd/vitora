"""
Tests for AEFI → DHIS2 Tracker integration.

Covers:
- Tracker payload preparation from AEFI instance
- DHIS2 submission with mocked HTTP
- Celery task enqueue on submit_to_authorities
- Idempotency (skip already submitted)
- Error handling (DHIS2 downtime, missing config)
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest  # type: ignore

from hmis.apps.immunizations.models import (
    AEFI,
    AEFIEventType,
    AEFISeverity,
    ImmunizationRecord,
    VaccineDefinition,
)
from hmis.apps.immunizations.services.dhis2_tracker import AEFITrackerService


@pytest.fixture
def bcg_vaccine(db):
    return VaccineDefinition.objects.create(
        code="BCG",
        name="Bacille Calmette-Guérin",
        disease_target="Tuberculosis",
        standard_age_days=0,
        route="ID",
        dose_number=1,
        target_population="INFANT",
        program="KEPI",
    )


@pytest.fixture
def child_patient(
    db,
    test_user,
    sample_county,
    sample_sub_county,
    sample_organization,
    sample_facility,
):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Baby",
        last_name="Wanjiku",
        date_of_birth=date.today() - timedelta(days=30),
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
        registered_at_facility=sample_facility,
    )


@pytest.fixture
def administered_record(child_patient, bcg_vaccine, sample_facility, test_user):
    return ImmunizationRecord.objects.create(
        patient=child_patient,
        vaccine=bcg_vaccine,
        dose_number=1,
        scheduled_date=date.today() - timedelta(days=7),
        administered_date=date.today() - timedelta(days=7),
        status="ADMINISTERED",
        batch_number="BCG-2026-001",
        administered_by=test_user,
        vaccine_manufacturer="SII",
        diluent_batch_number="DIL-001",
        diluent_manufacturer="AJ Vaccines",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def reported_aefi(administered_record, sample_facility, test_user):
    return AEFI.objects.create(
        immunization_record=administered_record,
        event_date=date.today() - timedelta(days=5),
        event_types=[AEFIEventType.BCG_LYMPHADENITIS],
        severity=AEFISeverity.MILD,
        description="Axillary swelling following BCG",
        reported_by=test_user,
        reported_by_designation="RN",
        reported_to_authorities=True,
        report_date=date.today(),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.mark.django_db
class TestAEFITrackerPayload:
    """Tests for DHIS2 Tracker Event payload generation."""

    def test_payload_has_event_structure(self, reported_aefi):
        """Should produce a valid Tracker events payload."""
        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)

        assert "events" in payload
        assert len(payload["events"]) == 1

        event = payload["events"][0]
        assert "program" in event
        assert "programStage" in event
        assert "orgUnit" in event
        assert "occurredAt" in event
        assert "dataValues" in event
        assert event["status"] == "COMPLETED"

    def test_payload_maps_event_types(self, reported_aefi):
        """Should map event_types to a comma-separated data value."""
        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)
        data_values = {dv["dataElement"]: dv["value"] for dv in payload["events"][0]["dataValues"]}

        assert "AEFI_DE_EVENT_TYPES" in data_values
        assert "BCG_LYMPHADENITIS" in data_values["AEFI_DE_EVENT_TYPES"]

    def test_payload_maps_vaccine_details(self, reported_aefi):
        """Should include vaccine name, batch, manufacturer from record."""
        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)
        data_values = {dv["dataElement"]: dv["value"] for dv in payload["events"][0]["dataValues"]}

        assert data_values.get("AEFI_DE_VACCINE_NAME") == "Bacille Calmette-Guérin"
        assert data_values.get("AEFI_DE_VACCINE_BATCH") == "BCG-2026-001"
        assert data_values.get("AEFI_DE_MANUFACTURER") == "SII"
        assert data_values.get("AEFI_DE_VACCINE_DOSE") == "1"

    def test_payload_maps_diluent_info(self, reported_aefi):
        """Should include diluent details."""
        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)
        data_values = {dv["dataElement"]: dv["value"] for dv in payload["events"][0]["dataValues"]}

        assert data_values.get("AEFI_DE_DILUENT_NAME") == "AJ Vaccines"
        assert data_values.get("AEFI_DE_DILUENT_BATCH") == "DIL-001"

    def test_payload_maps_reporter_info(self, reported_aefi):
        """Should include reporter name and designation."""
        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)
        data_values = {dv["dataElement"]: dv["value"] for dv in payload["events"][0]["dataValues"]}

        # reported_by is a User FK — get_full_name() or username
        assert "AEFI_DE_REPORTER_NAME" in data_values
        assert data_values.get("AEFI_DE_REPORTER_DESIGNATION") == "RN"

    def test_payload_maps_severity_and_description(self, reported_aefi):
        """Should map severity and description."""
        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)
        data_values = {dv["dataElement"]: dv["value"] for dv in payload["events"][0]["dataValues"]}

        assert data_values.get("AEFI_DE_SEVERITY") == "MILD"
        assert "Axillary swelling" in data_values.get("AEFI_DE_DESCRIPTION", "")

    def test_payload_uses_mfl_code_as_org_unit(self, reported_aefi, sample_facility):
        """Should use institution_mfl_code as orgUnit when set."""
        reported_aefi.institution_mfl_code = sample_facility.mfl_code
        reported_aefi.save(update_fields=["institution_mfl_code"])

        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)
        assert payload["events"][0]["orgUnit"] == sample_facility.mfl_code

    def test_empty_fields_excluded_from_data_values(self, reported_aefi):
        """Should not include empty/null fields in data values."""
        payload = AEFITrackerService.prepare_tracker_payload(reported_aefi)
        de_keys = {dv["dataElement"] for dv in payload["events"][0]["dataValues"]}

        # national_classification is empty default → should not appear
        assert "AEFI_DE_NATIONAL_CLASS" not in de_keys
        # action_taken (treatment_details) is empty → should not appear
        assert "AEFI_DE_ACTION_TAKEN" not in de_keys


@pytest.mark.django_db
class TestAEFIDHIS2Submission:
    """Tests for DHIS2 HTTP submission."""

    @patch("requests.post")
    def test_successful_submission(self, mock_post, reported_aefi, settings):
        """Should POST to DHIS2 and update aefi.dhis2_submitted_at."""
        settings.DHIS2_API_URL = "https://dhis2.example.org"
        settings.DHIS2_USERNAME = "admin"
        settings.DHIS2_PASSWORD = "district"

        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.text = '{"status": "OK"}'
        mock_response.json.return_value = {"status": "OK"}
        mock_post.return_value = mock_response

        result = AEFITrackerService.submit_to_dhis2(reported_aefi)

        assert result["status"] == "OK"
        reported_aefi.refresh_from_db()
        assert reported_aefi.dhis2_submitted_at is not None
        assert reported_aefi.dhis2_response == {"status": "OK"}

        # Verify HTTP call
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert "/api/tracker" in call_kwargs[0][0]

    @patch("requests.post")
    def test_failed_submission_stores_error(self, mock_post, reported_aefi, settings):
        """Should store error response without setting dhis2_submitted_at."""
        settings.DHIS2_API_URL = "https://dhis2.example.org"
        settings.DHIS2_USERNAME = "admin"
        settings.DHIS2_PASSWORD = "district"

        mock_response = MagicMock()
        mock_response.ok = False
        mock_response.status_code = 409
        mock_response.text = '{"status": "ERROR"}'
        mock_response.json.return_value = {"status": "ERROR"}
        mock_post.return_value = mock_response

        result = AEFITrackerService.submit_to_dhis2(reported_aefi)

        reported_aefi.refresh_from_db()
        assert reported_aefi.dhis2_submitted_at is None
        assert reported_aefi.dhis2_response["status"] == "error"
        assert reported_aefi.dhis2_response["http_status"] == 409

    def test_skips_already_submitted(self, reported_aefi):
        """Should return early if AEFI was already submitted."""
        from django.utils import timezone

        reported_aefi.dhis2_submitted_at = timezone.now()
        reported_aefi.save(update_fields=["dhis2_submitted_at"])

        result = AEFITrackerService.submit_to_dhis2(reported_aefi)
        assert result["status"] == "already_submitted"

    def test_skips_unreported_aefi(self, administered_record, sample_facility):
        """Should raise ValueError if AEFI is not marked as reported."""
        aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[AEFIEventType.HIGH_FEVER],
            severity=AEFISeverity.MILD,
            description="Fever",
            reported_to_authorities=False,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        with pytest.raises(ValueError, match="must be marked as reported"):
            AEFITrackerService.submit_to_dhis2(aefi)

    def test_missing_dhis2_config(self, reported_aefi, settings):
        """Should return error when DHIS2 is not configured."""
        settings.DHIS2_API_URL = None
        settings.DHIS2_USERNAME = None
        settings.DHIS2_PASSWORD = None

        result = AEFITrackerService.submit_to_dhis2(reported_aefi)
        assert result["status"] == "error"
        assert "not configured" in result["message"]


@pytest.mark.django_db
class TestAEFICeleryTask:
    """Tests for the Celery task that wraps DHIS2 submission."""

    @patch("hmis.apps.immunizations.services.dhis2_tracker.AEFITrackerService.submit_to_dhis2")
    def test_task_calls_submit(self, mock_submit, reported_aefi):
        """Task should call AEFITrackerService.submit_to_dhis2."""
        mock_submit.return_value = {"status": "OK"}

        from hmis.apps.immunizations.tasks import submit_aefi_to_dhis2

        result = submit_aefi_to_dhis2(reported_aefi.pk)

        mock_submit.assert_called_once()
        assert result["status"] == "OK"

    def test_task_handles_missing_aefi(self):
        """Task should handle non-existent AEFI gracefully."""
        from hmis.apps.immunizations.tasks import submit_aefi_to_dhis2

        result = submit_aefi_to_dhis2(999999)
        assert result["status"] == "error"
        assert "not found" in result["message"]

    @patch("hmis.apps.immunizations.tasks.submit_aefi_to_dhis2.delay")
    def test_submit_to_authorities_enqueues_task(self, mock_delay, reported_aefi, test_user):
        """submit_to_authorities should enqueue the async DHIS2 task."""
        # Create unreported AEFI
        reported_aefi.reported_to_authorities = False
        reported_aefi.report_date = None
        reported_aefi.save(update_fields=["reported_to_authorities", "report_date"])

        reported_aefi.submit_to_authorities(user=test_user, notes="Test submit")

        mock_delay.assert_called_once_with(reported_aefi.pk)
