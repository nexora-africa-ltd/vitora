"""
Tests for Phase L3 - Analyzer Integration Support.

This module tests the Instrument and AnalyzerRun models for tracking
laboratory analyzer/instrument data and raw machine runs.

Following TDD methodology - these tests define the expected behavior
before implementation.
"""

from datetime import datetime, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.models import (
    AnalyzerRun,
    Instrument,
    LabOrder,
    LabOrderItem,
    Specimen,
    TestCatalog,
)

User = get_user_model()


# ============================================================================
# Instrument Model Tests
# ============================================================================


@pytest.mark.django_db
class TestInstrumentModel:
    """Tests for Instrument model."""

    def test_create_instrument_with_required_fields(self):
        """Should create instrument with code and name."""
        instrument = Instrument.objects.create(
            code="HAEM-001",
            name="Sysmex XN-1000 Hematology Analyzer",
        )
        assert instrument.code == "HAEM-001"
        assert instrument.name == "Sysmex XN-1000 Hematology Analyzer"
        assert instrument.is_active is True
        assert instrument.interface_type == "MANUAL"

    def test_create_instrument_with_all_fields(self):
        """Should create instrument with all optional fields."""
        instrument = Instrument.objects.create(
            code="CHEM-002",
            name="Roche Cobas c501",
            manufacturer="Roche Diagnostics",
            model="Cobas c501",
            serial_number="SN-2024-001234",
            department="Clinical Chemistry",
            interface_type="HL7_MLLP",
            integration_config={
                "host": "192.168.1.100",
                "port": 5000,
                "encoding": "UTF-8",
            },
            is_active=True,
        )
        assert instrument.manufacturer == "Roche Diagnostics"
        assert instrument.model == "Cobas c501"
        assert instrument.serial_number == "SN-2024-001234"
        assert instrument.department == "Clinical Chemistry"
        assert instrument.interface_type == "HL7_MLLP"
        assert instrument.integration_config["host"] == "192.168.1.100"

    def test_instrument_code_uniqueness(self):
        """Instrument code should be unique."""
        Instrument.objects.create(
            code="HAEM-001",
            name="Analyzer 1",
        )
        with pytest.raises(Exception):  # IntegrityError
            Instrument.objects.create(
                code="HAEM-001",  # Duplicate
                name="Analyzer 2",
            )

    def test_instrument_str_representation(self):
        """String representation should include code and name."""
        instrument = Instrument.objects.create(
            code="MICRO-001",
            name="VITEK 2 Compact",
        )
        assert "MICRO-001" in str(instrument)
        assert "VITEK 2 Compact" in str(instrument)

    def test_instrument_interface_type_choices(self):
        """Should accept valid interface type choices."""
        choices = ["HL7_MLLP", "ASTM", "FHIR", "MANUAL"]
        for idx, choice in enumerate(choices):
            instrument = Instrument.objects.create(
                code=f"INT-{idx:03d}",
                name=f"Instrument {choice}",
                interface_type=choice,
            )
            assert instrument.interface_type == choice

    def test_instrument_inactive_by_default_can_be_set(self):
        """Should allow setting instrument as inactive."""
        instrument = Instrument.objects.create(
            code="OLD-001",
            name="Decommissioned Analyzer",
            is_active=False,
        )
        assert instrument.is_active is False


# ============================================================================
# AnalyzerRun Model Tests
# ============================================================================


@pytest.mark.django_db
class TestAnalyzerRunModel:
    """Tests for AnalyzerRun model."""

    @pytest.fixture
    def sample_instrument(self, db):
        """Create a sample instrument."""
        return Instrument.objects.create(
            code="HAEM-FIXTURE",
            name="Test Hematology Analyzer",
            manufacturer="Test Manufacturer",
            interface_type="HL7_MLLP",
        )

    @pytest.fixture
    def sample_specimen_for_analyzer(self, sample_lab_order):
        """Create a specimen for analyzer run testing."""
        specimen = Specimen.objects.create(
            barcode="SPE-ANALYZER-001",
            specimen_type="BLOOD",
            lab_order=sample_lab_order,
            status="PROCESSING",
        )
        return specimen

    def test_create_analyzer_run_with_required_fields(
        self, sample_instrument, sample_specimen_for_analyzer, test_user
    ):
        """Should create analyzer run with required fields."""
        run_time = timezone.now()
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            operator=test_user,
            run_datetime=run_time,
            raw_message="MSH|^~\\&|ANALYZER|LAB||20260215120000||ORU^R01^ORU_R01|001|P|2.5|||AL",
            raw_payload={"message_type": "ORU^R01", "patient_id": "12345"},
            status="RECEIVED",
        )
        assert run.specimen == sample_specimen_for_analyzer
        assert run.instrument == sample_instrument
        assert run.operator == test_user
        assert run.status == "RECEIVED"
        assert "ORU^R01" in run.raw_message

    def test_analyzer_run_status_choices(
        self, sample_instrument, sample_specimen_for_analyzer, test_user
    ):
        """Should accept valid status choices."""
        statuses = ["RECEIVED", "PARSED", "APPLIED", "ERROR"]
        for idx, status_choice in enumerate(statuses):
            specimen = Specimen.objects.create(
                barcode=f"SPE-STATUS-{idx:03d}",
                specimen_type="BLOOD",
                lab_order=sample_specimen_for_analyzer.lab_order,
                status="PROCESSING",
            )
            run = AnalyzerRun.objects.create(
                specimen=specimen,
                instrument=sample_instrument,
                run_datetime=timezone.now(),
                raw_message="TEST",
                raw_payload={},
                status=status_choice,
            )
            assert run.status == status_choice

    def test_analyzer_run_with_error(
        self, sample_instrument, sample_specimen_for_analyzer, test_user
    ):
        """Should store error message when parsing fails."""
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            run_datetime=timezone.now(),
            raw_message="INVALID MESSAGE FORMAT",
            raw_payload={},
            status="ERROR",
            error_message="Failed to parse HL7 message: Invalid MSH segment",
        )
        assert run.status == "ERROR"
        assert "Invalid MSH segment" in run.error_message

    def test_analyzer_run_without_operator(
        self, sample_instrument, sample_specimen_for_analyzer
    ):
        """Should allow creating analyzer run without operator (automated runs)."""
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            operator=None,  # Automated run, no operator
            run_datetime=timezone.now(),
            raw_message="AUTOMATED_MSG",
            raw_payload={"automated": True},
            status="RECEIVED",
        )
        assert run.operator is None
        assert run.status == "RECEIVED"

    def test_analyzer_run_created_at_auto_set(
        self, sample_instrument, sample_specimen_for_analyzer
    ):
        """created_at should be automatically set."""
        before = timezone.now()
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            run_datetime=timezone.now(),
            raw_message="TEST",
            raw_payload={},
            status="RECEIVED",
        )
        after = timezone.now()
        assert before <= run.created_at <= after

    def test_specimen_analyzer_runs_related_name(
        self, sample_instrument, sample_specimen_for_analyzer
    ):
        """Should access analyzer runs from specimen via related name."""
        AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            run_datetime=timezone.now(),
            raw_message="RUN 1",
            raw_payload={},
            status="RECEIVED",
        )
        AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            run_datetime=timezone.now(),
            raw_message="RUN 2",
            raw_payload={},
            status="PARSED",
        )
        assert sample_specimen_for_analyzer.analyzer_runs.count() == 2

    def test_analyzer_run_instrument_protect_on_delete(
        self, sample_instrument, sample_specimen_for_analyzer
    ):
        """Should not allow deleting instrument with analyzer runs (PROTECT)."""
        AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            run_datetime=timezone.now(),
            raw_message="TEST",
            raw_payload={},
            status="RECEIVED",
        )
        with pytest.raises(Exception):  # ProtectedError
            sample_instrument.delete()

    def test_analyzer_run_str_representation(
        self, sample_instrument, sample_specimen_for_analyzer
    ):
        """String representation should be informative."""
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_analyzer,
            instrument=sample_instrument,
            run_datetime=timezone.now(),
            raw_message="TEST",
            raw_payload={},
            status="RECEIVED",
        )
        str_rep = str(run)
        assert sample_specimen_for_analyzer.barcode in str_rep or sample_instrument.code in str_rep


# ============================================================================
# Instrument API Tests
# ============================================================================


@pytest.mark.django_db
class TestInstrumentAPI:
    """Tests for Instrument API endpoints."""

    @pytest.fixture
    def sample_instrument_data(self):
        """Sample data for creating instrument via API."""
        return {
            "code": "API-INST-001",
            "name": "API Created Analyzer",
            "manufacturer": "Test Corp",
            "model": "Model X",
            "serial_number": "SN-API-001",
            "department": "Hematology",
            "interface_type": "HL7_MLLP",
            "integration_config": {
                "host": "127.0.0.1",
                "port": 5000,
            },
            "is_active": True,
        }

    def test_list_instruments_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/lab/instruments/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_instruments(self, authenticated_client):
        """Should list all instruments."""
        Instrument.objects.create(code="LIST-001", name="Analyzer 1")
        Instrument.objects.create(code="LIST-002", name="Analyzer 2")

        response = authenticated_client.get("/api/lab/instruments/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_create_instrument(self, authenticated_client, sample_instrument_data):
        """Should create instrument with valid data."""
        response = authenticated_client.post(
            "/api/lab/instruments/",
            sample_instrument_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "API-INST-001"
        assert response.data["name"] == "API Created Analyzer"

    def test_retrieve_instrument(self, authenticated_client):
        """Should retrieve single instrument."""
        instrument = Instrument.objects.create(
            code="GET-001",
            name="Retrievable Analyzer",
        )
        response = authenticated_client.get(f"/api/lab/instruments/{instrument.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "GET-001"

    def test_update_instrument(self, authenticated_client):
        """Should update instrument."""
        instrument = Instrument.objects.create(
            code="UPD-001",
            name="Original Name",
        )
        response = authenticated_client.patch(
            f"/api/lab/instruments/{instrument.id}/",
            {"name": "Updated Name"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Name"

    def test_filter_instruments_by_active(self, authenticated_client):
        """Should filter instruments by active status."""
        Instrument.objects.create(code="ACTIVE-001", name="Active", is_active=True)
        Instrument.objects.create(code="INACTIVE-001", name="Inactive", is_active=False)

        response = authenticated_client.get("/api/lab/instruments/?is_active=true")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["code"] == "ACTIVE-001"

    def test_filter_instruments_by_interface_type(self, authenticated_client):
        """Should filter instruments by interface type."""
        Instrument.objects.create(
            code="HL7-001", name="HL7 Instrument", interface_type="HL7_MLLP"
        )
        Instrument.objects.create(
            code="MANUAL-001", name="Manual Instrument", interface_type="MANUAL"
        )

        response = authenticated_client.get(
            "/api/lab/instruments/?interface_type=HL7_MLLP"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["code"] == "HL7-001"

    def test_search_instruments(self, authenticated_client):
        """Should search instruments by code or name."""
        Instrument.objects.create(code="HAEM-001", name="Hematology Analyzer")
        Instrument.objects.create(code="CHEM-001", name="Chemistry Analyzer")

        response = authenticated_client.get("/api/lab/instruments/?search=HAEM")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["code"] == "HAEM-001"


# ============================================================================
# AnalyzerRun API Tests
# ============================================================================


@pytest.mark.django_db
class TestAnalyzerRunAPI:
    """Tests for AnalyzerRun API endpoints."""

    @pytest.fixture
    def sample_instrument_for_api(self, db):
        """Create a sample instrument for API tests."""
        return Instrument.objects.create(
            code="API-INST-FIXTURE",
            name="API Test Analyzer",
            interface_type="HL7_MLLP",
        )

    @pytest.fixture
    def sample_specimen_for_api(self, sample_lab_order):
        """Create a specimen for API tests."""
        specimen = Specimen.objects.create(
            barcode="SPE-API-001",
            specimen_type="BLOOD",
            lab_order=sample_lab_order,
            status="PROCESSING",
        )
        return specimen

    def test_list_analyzer_runs_requires_auth(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/lab/analyzer-runs/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_analyzer_runs(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should list analyzer runs."""
        AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="MSG1",
            raw_payload={},
            status="RECEIVED",
        )
        response = authenticated_client.get("/api/lab/analyzer-runs/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_create_analyzer_run(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should create analyzer run with valid data."""
        data = {
            "specimen": sample_specimen_for_api.id,
            "instrument": sample_instrument_for_api.id,
            "run_datetime": timezone.now().isoformat(),
            "raw_message": "MSH|^~\\&|TEST||",
            "raw_payload": {"type": "ORU"},
            "status": "RECEIVED",
        }
        response = authenticated_client.post(
            "/api/lab/analyzer-runs/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "RECEIVED"

    def test_retrieve_analyzer_run(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should retrieve single analyzer run."""
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="TEST",
            raw_payload={},
            status="RECEIVED",
        )
        response = authenticated_client.get(f"/api/lab/analyzer-runs/{run.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RECEIVED"

    def test_update_analyzer_run_status(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should update analyzer run status."""
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="TEST",
            raw_payload={},
            status="RECEIVED",
        )
        response = authenticated_client.patch(
            f"/api/lab/analyzer-runs/{run.id}/",
            {"status": "PARSED", "raw_payload": {"parsed": True}},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PARSED"

    def test_filter_analyzer_runs_by_status(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should filter analyzer runs by status."""
        AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="MSG1",
            raw_payload={},
            status="RECEIVED",
        )
        specimen2 = Specimen.objects.create(
            barcode="SPE-FILTER-002",
            specimen_type="BLOOD",
            lab_order=sample_specimen_for_api.lab_order,
            status="PROCESSING",
        )
        AnalyzerRun.objects.create(
            specimen=specimen2,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="MSG2",
            raw_payload={},
            status="PARSED",
        )

        response = authenticated_client.get("/api/lab/analyzer-runs/?status=RECEIVED")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["status"] == "RECEIVED"

    def test_filter_analyzer_runs_by_instrument(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should filter analyzer runs by instrument."""
        AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="MSG1",
            raw_payload={},
            status="RECEIVED",
        )
        other_instrument = Instrument.objects.create(
            code="OTHER-INST", name="Other Analyzer"
        )
        specimen2 = Specimen.objects.create(
            barcode="SPE-OTHER-001",
            specimen_type="BLOOD",
            lab_order=sample_specimen_for_api.lab_order,
            status="PROCESSING",
        )
        AnalyzerRun.objects.create(
            specimen=specimen2,
            instrument=other_instrument,
            run_datetime=timezone.now(),
            raw_message="MSG2",
            raw_payload={},
            status="RECEIVED",
        )

        response = authenticated_client.get(
            f"/api/lab/analyzer-runs/?instrument={sample_instrument_for_api.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_filter_analyzer_runs_by_specimen(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should filter analyzer runs by specimen barcode."""
        AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="MSG1",
            raw_payload={},
            status="RECEIVED",
        )

        response = authenticated_client.get(
            f"/api/lab/analyzer-runs/?specimen_barcode={sample_specimen_for_api.barcode}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_analyzer_run_mark_error_action(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should mark analyzer run as error with message."""
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="INVALID",
            raw_payload={},
            status="RECEIVED",
        )
        response = authenticated_client.post(
            f"/api/lab/analyzer-runs/{run.id}/mark_error/",
            {"error_message": "Failed to parse: Unknown message type"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ERROR"
        assert "Unknown message type" in response.data["error_message"]

    def test_analyzer_run_mark_applied_action(
        self, authenticated_client, sample_instrument_for_api, sample_specimen_for_api
    ):
        """Should mark analyzer run as applied."""
        run = AnalyzerRun.objects.create(
            specimen=sample_specimen_for_api,
            instrument=sample_instrument_for_api,
            run_datetime=timezone.now(),
            raw_message="VALID",
            raw_payload={"results": [{"test": "HB", "value": "14.5"}]},
            status="PARSED",
        )
        response = authenticated_client.post(
            f"/api/lab/analyzer-runs/{run.id}/mark_applied/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "APPLIED"


# ============================================================================
# Integration Tests
# ============================================================================


@pytest.mark.django_db
class TestAnalyzerIntegration:
    """Integration tests for analyzer workflow."""

    @pytest.fixture
    def hematology_instrument(self, db):
        """Create a hematology analyzer."""
        return Instrument.objects.create(
            code="HAEM-SYSMEX",
            name="Sysmex XN-1000",
            manufacturer="Sysmex",
            model="XN-1000",
            serial_number="XN1000-001",
            department="Hematology",
            interface_type="HL7_MLLP",
            integration_config={
                "host": "192.168.1.50",
                "port": 5001,
                "encoding": "UTF-8",
            },
        )

    def test_full_analyzer_workflow(
        self, sample_lab_order, hematology_instrument, test_user
    ):
        """Test complete workflow: receive -> parse -> apply results."""
        # Create specimen
        specimen = Specimen.objects.create(
            barcode="SPE-WORKFLOW-001",
            specimen_type="BLOOD",
            lab_order=sample_lab_order,
            status="PROCESSING",
        )

        # Step 1: Receive raw message from analyzer
        run = AnalyzerRun.objects.create(
            specimen=specimen,
            instrument=hematology_instrument,
            operator=test_user,
            run_datetime=timezone.now(),
            raw_message="MSH|^~\\&|SYSMEX|HAEM|VITORA|LIS|202602151200||ORU^R01|12345|P|2.5",
            raw_payload={},
            status="RECEIVED",
        )
        assert run.status == "RECEIVED"

        # Step 2: Parse the message
        run.status = "PARSED"
        run.raw_payload = {
            "message_type": "ORU^R01",
            "patient_id": specimen.lab_order.patient.mrn,
            "results": [
                {"test": "WBC", "value": "7.5", "unit": "x10^9/L"},
                {"test": "RBC", "value": "4.8", "unit": "x10^12/L"},
                {"test": "HGB", "value": "14.2", "unit": "g/dL"},
            ],
        }
        run.save()
        assert run.status == "PARSED"
        assert len(run.raw_payload["results"]) == 3

        # Step 3: Apply results (mark as applied after creating LabResults)
        run.status = "APPLIED"
        run.save()
        assert run.status == "APPLIED"

        # Verify audit trail
        runs = specimen.analyzer_runs.all()
        assert runs.count() == 1
        assert runs.first().instrument == hematology_instrument

    def test_multiple_runs_for_same_specimen(
        self, sample_lab_order, hematology_instrument
    ):
        """Same specimen can have multiple analyzer runs (reruns, QC, etc.)."""
        specimen = Specimen.objects.create(
            barcode="SPE-MULTI-RUN",
            specimen_type="BLOOD",
            lab_order=sample_lab_order,
            status="PROCESSING",
        )

        # First run (failed)
        run1 = AnalyzerRun.objects.create(
            specimen=specimen,
            instrument=hematology_instrument,
            run_datetime=timezone.now(),
            raw_message="FAILED_MSG",
            raw_payload={},
            status="ERROR",
            error_message="Insufficient sample volume",
        )

        # Second run (successful)
        run2 = AnalyzerRun.objects.create(
            specimen=specimen,
            instrument=hematology_instrument,
            run_datetime=timezone.now() + timedelta(minutes=30),
            raw_message="SUCCESS_MSG",
            raw_payload={"results": [{"test": "WBC", "value": "8.0"}]},
            status="APPLIED",
        )

        assert specimen.analyzer_runs.count() == 2
        assert run1.status == "ERROR"
        assert run2.status == "APPLIED"

    def test_instrument_performance_tracking(self, hematology_instrument, sample_lab_order):
        """Should be able to query analyzer performance metrics."""
        # Create multiple specimens and runs
        for i in range(5):
            specimen = Specimen.objects.create(
                barcode=f"SPE-PERF-{i:03d}",
                specimen_type="BLOOD",
                lab_order=sample_lab_order,
                status="PROCESSING",
            )
            AnalyzerRun.objects.create(
                specimen=specimen,
                instrument=hematology_instrument,
                run_datetime=timezone.now(),
                raw_message=f"MSG-{i}",
                raw_payload={},
                status="APPLIED" if i < 4 else "ERROR",
            )

        # Query analytics
        total_runs = hematology_instrument.analyzer_runs.count()
        successful_runs = hematology_instrument.analyzer_runs.filter(status="APPLIED").count()
        error_runs = hematology_instrument.analyzer_runs.filter(status="ERROR").count()

        assert total_runs == 5
        assert successful_runs == 4
        assert error_runs == 1
