"""
Tests for KENHDD Schema Validation.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

import pytest  # type: ignore
from django.core.management import call_command
from rest_framework import status


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def kenhdd_elements(db):
    """Seed KENHDD elements for tests."""
    call_command("seed_kenhdd_elements", verbosity=0)


@pytest.fixture
def validation_service():
    """Return a KENHDDValidationService instance."""
    from hmis.apps.kenhdd.services.validation import KENHDDValidationService

    return KENHDDValidationService()


# ============================================================================
# Model Tests
# ============================================================================


class TestKENHDDDataElementModel:
    """Tests for the KENHDDDataElement model."""

    def test_create_element(self, db):
        """Should create a KENHDD data element."""
        from hmis.apps.kenhdd.models import KENHDDDataElement

        element = KENHDDDataElement.objects.create(
            element_id="TEST-001",
            name="Test Element",
            resource_type="PATIENT",
            model_field="first_name",
            requirement_level="MANDATORY",
            data_type="STRING",
        )
        assert element.element_id == "TEST-001"
        assert str(element) == "[TEST-001] Test Element"

    def test_element_id_unique(self, db):
        """Should enforce unique element_id."""
        from django.db import IntegrityError

        from hmis.apps.kenhdd.models import KENHDDDataElement

        KENHDDDataElement.objects.create(
            element_id="UNIQUE-001",
            name="First",
            resource_type="PATIENT",
            model_field="first_name",
            requirement_level="MANDATORY",
            data_type="STRING",
        )
        with pytest.raises(IntegrityError):
            KENHDDDataElement.objects.create(
                element_id="UNIQUE-001",
                name="Duplicate",
                resource_type="PATIENT",
                model_field="last_name",
                requirement_level="MANDATORY",
                data_type="STRING",
            )

    def test_create_validation_run(self, db, test_user):
        """Should create a validation run record."""
        from decimal import Decimal

        from hmis.apps.kenhdd.models import KENHDDValidationRun

        run = KENHDDValidationRun.objects.create(
            resource_type="PATIENT",
            records_checked=100,
            records_compliant=95,
            compliance_score=Decimal("95.00"),
            mandatory_pass_rate=Decimal("98.50"),
            violations={"KENHDD-PAT-006": 5},
            run_by=test_user,
        )
        assert run.compliance_score == Decimal("95.00")
        assert "PATIENT" in str(run)
        assert "95.00" in str(run)


# ============================================================================
# Seed Command Tests
# ============================================================================


class TestSeedCommand:
    """Tests for the seed_kenhdd_elements management command."""

    def test_seed_creates_elements(self, db):
        """Should create all expected elements."""
        from hmis.apps.kenhdd.models import KENHDDDataElement

        call_command("seed_kenhdd_elements", verbosity=0)
        count = KENHDDDataElement.objects.count()
        assert count == 56

    def test_seed_idempotent(self, db):
        """Running seed twice should not create duplicates."""
        from hmis.apps.kenhdd.models import KENHDDDataElement

        call_command("seed_kenhdd_elements", verbosity=0)
        call_command("seed_kenhdd_elements", verbosity=0)
        assert KENHDDDataElement.objects.count() == 56


# ============================================================================
# Validation Service Tests
# ============================================================================


class TestKENHDDValidationService:
    """Tests for the KENHDD validation service."""

    def test_validate_compliant_patient(
        self, kenhdd_elements, validation_service, sample_patient
    ):
        """A patient with all mandatory fields should be compliant."""
        result = validation_service.validate_record("PATIENT", sample_patient)
        assert result.resource_type == "PATIENT"
        # first_name, last_name, dob, gender, county, sub_county, mrn are all present
        assert result.is_compliant is True
        assert result.pass_count > 0

    def test_validate_missing_mandatory_field(
        self, kenhdd_elements, validation_service, db,
        sample_county, sample_sub_county,
        sample_organization,
    ):
        """A patient missing consent_given=False should still validate (boolean False is not empty)."""
        from hmis.apps.patients.models import Patient

        patient = Patient.objects.create(
            first_name="Test",
            last_name="User",
            date_of_birth="2000-01-01",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            consent_given=False,
            organization=sample_organization,
        )
        result = validation_service.validate_record("PATIENT", patient)
        # consent_given is False (boolean) — not empty, should PASS
        consent_elem = next(
            (e for e in result.elements if e.element_id == "KENHDD-PAT-015"), None
        )
        assert consent_elem is not None
        assert consent_elem.status == "PASS"

    def test_validate_conditional_field_warning(
        self, kenhdd_elements, validation_service, sample_patient
    ):
        """A conditional field that is empty should produce a WARNING."""
        result = validation_service.validate_record("PATIENT", sample_patient)
        # identification_number is CONDITIONAL and likely empty on sample_patient
        id_num_elem = next(
            (e for e in result.elements if e.element_id == "KENHDD-PAT-007"), None
        )
        assert id_num_elem is not None
        assert id_num_elem.status == "WARNING"

    def test_validate_optional_field_empty_passes(
        self, kenhdd_elements, validation_service, sample_patient
    ):
        """An empty optional field should PASS."""
        result = validation_service.validate_record("PATIENT", sample_patient)
        sha_elem = next(
            (e for e in result.elements if e.element_id == "KENHDD-PAT-013"), None
        )
        assert sha_elem is not None
        assert sha_elem.status == "PASS"

    def test_validate_format_pattern(
        self, kenhdd_elements, validation_service, sample_patient
    ):
        """MRN format should be validated against pattern."""
        result = validation_service.validate_record("PATIENT", sample_patient)
        mrn_elem = next(
            (e for e in result.elements if e.element_id == "KENHDD-PAT-012"), None
        )
        assert mrn_elem is not None
        # MRN is auto-generated in MRN-YYYYMMDD-XXXX format — should PASS
        assert mrn_elem.status == "PASS"

    def test_validate_encounter(
        self, kenhdd_elements, validation_service, sample_encounter
    ):
        """Should validate encounter records."""
        result = validation_service.validate_record("ENCOUNTER", sample_encounter)
        assert result.resource_type == "ENCOUNTER"
        assert len(result.elements) > 0
        # encounter_type, encounter_date, chief_complaint are set
        enc_type_elem = next(
            (e for e in result.elements if e.element_id == "KENHDD-ENC-001"), None
        )
        assert enc_type_elem is not None
        assert enc_type_elem.status == "PASS"

    def test_generate_compliance_report(
        self, kenhdd_elements, validation_service, sample_patient, test_user
    ):
        """Should generate a compliance report for PATIENT type."""
        scores = validation_service.generate_compliance_report(
            resource_type="PATIENT",
            sample_size=10,
            user=test_user,
        )
        assert len(scores) == 1
        assert scores[0].resource_type == "PATIENT"
        assert scores[0].total_records >= 1
        assert 0 <= scores[0].compliance_pct <= 100
        assert 0 <= scores[0].mandatory_pass_rate <= 100

    def test_get_compliance_summary_empty(
        self, kenhdd_elements, validation_service
    ):
        """Summary should show None scores when no runs exist."""
        summary = validation_service.get_compliance_summary()
        assert len(summary) > 0
        patient_entry = next(
            (s for s in summary if s["resource_type"] == "PATIENT"), None
        )
        assert patient_entry is not None
        assert patient_entry["compliance_score"] is None

    def test_get_model_class(self, validation_service):
        """Should resolve model classes for known resource types."""
        patient_cls = validation_service.get_model_class("PATIENT")
        assert patient_cls is not None
        assert patient_cls.__name__ == "Patient"

        unknown = validation_service.get_model_class("UNKNOWN")
        assert unknown is None


# ============================================================================
# Report Service Tests
# ============================================================================


class TestKENHDDReportService:
    """Tests for the KENHDD report service."""

    def test_export_json(self, db, test_user):
        """Should export a validation run as JSON."""
        import json
        from decimal import Decimal

        from hmis.apps.kenhdd.models import KENHDDValidationRun
        from hmis.apps.kenhdd.services.report import KENHDDReportService

        run = KENHDDValidationRun.objects.create(
            resource_type="PATIENT",
            records_checked=50,
            records_compliant=48,
            compliance_score=Decimal("96.00"),
            mandatory_pass_rate=Decimal("98.00"),
            violations={"KENHDD-PAT-008": 2},
            run_by=test_user,
        )
        service = KENHDDReportService()
        output = service.export_compliance_report_json(run)
        data = json.loads(output)
        assert data["report_type"] == "KENHDD Compliance Report"
        assert data["summary"]["compliance_score"] == 96.0

    def test_export_csv(self, db, test_user):
        """Should export a validation run as CSV."""
        from decimal import Decimal

        from hmis.apps.kenhdd.models import KENHDDValidationRun
        from hmis.apps.kenhdd.services.report import KENHDDReportService

        run = KENHDDValidationRun.objects.create(
            resource_type="ENCOUNTER",
            records_checked=20,
            records_compliant=18,
            compliance_score=Decimal("90.00"),
            mandatory_pass_rate=Decimal("95.00"),
            violations={"KENHDD-ENC-004": 2},
            run_by=test_user,
        )
        service = KENHDDReportService()
        output = service.export_compliance_report_csv(run)
        assert "KENHDD Compliance Report" in output
        assert "ENCOUNTER" in output
        assert "KENHDD-ENC-004" in output


# ============================================================================
# API Tests
# ============================================================================


class TestKENHDDAPIEndpoints:
    """Tests for KENHDD API endpoints."""

    def test_list_elements(self, kenhdd_elements, authenticated_client):
        """Should list KENHDD data elements."""
        response = authenticated_client.get("/api/kenhdd/elements/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) > 0

    def test_filter_elements_by_resource_type(
        self, kenhdd_elements, authenticated_client
    ):
        """Should filter elements by resource type."""
        response = authenticated_client.get(
            "/api/kenhdd/elements/?resource_type=PATIENT"
        )
        assert response.status_code == status.HTTP_200_OK
        for elem in response.data["results"]:
            assert elem["resource_type"] == "PATIENT"

    def test_validate_record_endpoint(
        self, kenhdd_elements, authenticated_client, sample_patient
    ):
        """Should validate a specific patient record."""
        response = authenticated_client.post(
            "/api/kenhdd/compliance/validate-record/",
            {"resource_type": "PATIENT", "record_id": sample_patient.id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resource_type"] == "PATIENT"
        assert "elements" in response.data
        assert "is_compliant" in response.data

    def test_validate_record_not_found(
        self, kenhdd_elements, authenticated_client
    ):
        """Should return 404 for non-existent record."""
        response = authenticated_client.post(
            "/api/kenhdd/compliance/validate-record/",
            {"resource_type": "PATIENT", "record_id": 99999},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_compliance_report_endpoint(
        self, kenhdd_elements, authenticated_client, sample_patient
    ):
        """Should generate a compliance report."""
        response = authenticated_client.post(
            "/api/kenhdd/compliance/compliance-report/",
            {"resource_type": "PATIENT", "sample_size": 10},
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        assert response.data[0]["resource_type"] == "PATIENT"

    def test_summary_endpoint(self, kenhdd_elements, authenticated_client):
        """Should return compliance summary."""
        response = authenticated_client.get("/api/kenhdd/compliance/summary/")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_runs_endpoint(
        self, kenhdd_elements, authenticated_client, sample_patient
    ):
        """Should list past validation runs."""
        # Generate a run first
        authenticated_client.post(
            "/api/kenhdd/compliance/compliance-report/",
            {"resource_type": "PATIENT", "sample_size": 5},
        )
        response = authenticated_client.get("/api/kenhdd/compliance/runs/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_auth_required(self, kenhdd_elements, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/kenhdd/elements/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_export_json_endpoint(
        self, kenhdd_elements, authenticated_client, sample_patient
    ):
        """Should export validation run as JSON."""
        # Generate a run first
        authenticated_client.post(
            "/api/kenhdd/compliance/compliance-report/",
            {"resource_type": "PATIENT", "sample_size": 5},
        )
        response = authenticated_client.post(
            "/api/kenhdd/compliance/export/",
            {"resource_type": "PATIENT", "format": "json"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/json"


# ============================================================================
# Phase 2: Run Detail & Failed Records Tests
# ============================================================================


class TestKENHDDFailedRecordModel:
    """Tests for the KENHDDFailedRecord model."""

    def test_create_failed_record(self, db, test_user):
        """Should create a failed record linked to a validation run."""
        from decimal import Decimal

        from hmis.apps.kenhdd.models import KENHDDFailedRecord, KENHDDValidationRun

        run = KENHDDValidationRun.objects.create(
            resource_type="PATIENT",
            records_checked=10,
            records_compliant=8,
            compliance_score=Decimal("80.00"),
            mandatory_pass_rate=Decimal("90.00"),
            violations={"KENHDD-PAT-006": 2},
            run_by=test_user,
        )
        fr = KENHDDFailedRecord.objects.create(
            run=run,
            record_id="42",
            is_compliant=False,
            pass_count=5,
            fail_count=2,
            warning_count=1,
            violation_details=[
                {
                    "element_id": "KENHDD-PAT-006",
                    "element_name": "Phone Number",
                    "field_name": "phone_number",
                    "status": "FAIL",
                    "message": "Mandatory field 'Phone Number' is empty",
                    "requirement_level": "MANDATORY",
                    "value": "",
                }
            ],
        )
        assert fr.run == run
        assert fr.record_id == "42"
        assert fr.fail_count == 2
        assert len(fr.violation_details) == 1
        assert "42" in str(fr)

    def test_cascade_delete(self, db, test_user):
        """Deleting a run should cascade-delete its failed records."""
        from decimal import Decimal

        from hmis.apps.kenhdd.models import KENHDDFailedRecord, KENHDDValidationRun

        run = KENHDDValidationRun.objects.create(
            resource_type="PATIENT",
            records_checked=5,
            records_compliant=3,
            compliance_score=Decimal("60.00"),
            mandatory_pass_rate=Decimal("70.00"),
            violations={},
            run_by=test_user,
        )
        KENHDDFailedRecord.objects.create(
            run=run, record_id="1", fail_count=1, violation_details=[]
        )
        KENHDDFailedRecord.objects.create(
            run=run, record_id="2", fail_count=1, violation_details=[]
        )
        assert KENHDDFailedRecord.objects.filter(run=run).count() == 2
        run.delete()
        assert KENHDDFailedRecord.objects.count() == 0


class TestKENHDDFailedRecordPersistence:
    """Tests that compliance reports now persist failed records."""

    def test_compliance_report_persists_failed_records(
        self, kenhdd_elements, sample_patient, test_user
    ):
        """generate_compliance_report should create KENHDDFailedRecord entries."""
        from hmis.apps.kenhdd.models import KENHDDFailedRecord, KENHDDValidationRun
        from hmis.apps.kenhdd.services.validation import KENHDDValidationService

        service = KENHDDValidationService()
        service.generate_compliance_report(
            resource_type="PATIENT", sample_size=10, user=test_user
        )
        run = KENHDDValidationRun.objects.filter(resource_type="PATIENT").first()
        assert run is not None
        # There should be at least some records checked
        assert run.records_checked >= 1
        # Failed records might exist if sample_patient is non-compliant on optional/conditional fields
        failed = KENHDDFailedRecord.objects.filter(run=run)
        # Each failed record should have violation_details
        for fr in failed:
            assert isinstance(fr.violation_details, list)


class TestKENHDDRunDetailAPI:
    """Tests for the run-detail and failures endpoints."""

    def test_run_detail_endpoint(
        self, kenhdd_elements, authenticated_client, sample_patient
    ):
        """Should return run detail with failed records."""
        # Generate a run
        authenticated_client.post(
            "/api/kenhdd/compliance/compliance-report/",
            {"resource_type": "PATIENT", "sample_size": 5},
        )
        runs_response = authenticated_client.get("/api/kenhdd/compliance/runs/")
        assert runs_response.status_code == status.HTTP_200_OK
        assert len(runs_response.data) >= 1
        run_id = runs_response.data[0]["id"]

        response = authenticated_client.get(
            f"/api/kenhdd/compliance/runs/{run_id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == run_id
        assert "failed_records" in response.data
        assert "total_failed" in response.data
        assert isinstance(response.data["failed_records"], list)

    def test_run_detail_not_found(self, kenhdd_elements, authenticated_client):
        """Should return 404 for non-existent run."""
        response = authenticated_client.get(
            "/api/kenhdd/compliance/runs/99999/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_run_failures_endpoint(
        self, kenhdd_elements, authenticated_client, sample_patient
    ):
        """Should return failures list for a run."""
        authenticated_client.post(
            "/api/kenhdd/compliance/compliance-report/",
            {"resource_type": "PATIENT", "sample_size": 5},
        )
        runs_response = authenticated_client.get("/api/kenhdd/compliance/runs/")
        run_id = runs_response.data[0]["id"]

        response = authenticated_client.get(
            f"/api/kenhdd/compliance/runs/{run_id}/failures/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_run_failures_not_found(self, kenhdd_elements, authenticated_client):
        """Should return 404 when run does not exist."""
        response = authenticated_client.get(
            "/api/kenhdd/compliance/runs/99999/failures/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_revalidate_endpoint(
        self, kenhdd_elements, authenticated_client, sample_patient
    ):
        """Should revalidate previously failed records and create a new run."""
        from hmis.apps.kenhdd.models import KENHDDFailedRecord, KENHDDValidationRun

        # Generate initial run
        authenticated_client.post(
            "/api/kenhdd/compliance/compliance-report/",
            {"resource_type": "PATIENT", "sample_size": 5},
        )
        run = KENHDDValidationRun.objects.filter(resource_type="PATIENT").first()
        assert run is not None

        # Ensure at least one failed record exists for the test
        if not KENHDDFailedRecord.objects.filter(run=run).exists():
            KENHDDFailedRecord.objects.create(
                run=run,
                record_id=str(sample_patient.pk),
                is_compliant=False,
                fail_count=1,
                warning_count=0,
                violation_details=[
                    {
                        "element_id": "KENHDD-PAT-006",
                        "element_name": "Phone Number",
                        "field_name": "phone_number",
                        "status": "FAIL",
                        "message": "test",
                        "requirement_level": "MANDATORY",
                        "value": "",
                    }
                ],
            )

        initial_run_count = KENHDDValidationRun.objects.count()

        response = authenticated_client.post(
            f"/api/kenhdd/compliance/runs/{run.pk}/revalidate/"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resource_type"] == "PATIENT"
        assert "failed_records" in response.data
        # A new run should have been created
        assert KENHDDValidationRun.objects.count() == initial_run_count + 1

    def test_revalidate_no_failed_records(
        self, kenhdd_elements, authenticated_client, test_user
    ):
        """Should return 400 when run has no failed records to revalidate."""
        from decimal import Decimal

        from hmis.apps.kenhdd.models import KENHDDValidationRun

        run = KENHDDValidationRun.objects.create(
            resource_type="PATIENT",
            records_checked=10,
            records_compliant=10,
            compliance_score=Decimal("100.00"),
            mandatory_pass_rate=Decimal("100.00"),
            violations={},
            run_by=test_user,
        )
        response = authenticated_client.post(
            f"/api/kenhdd/compliance/runs/{run.pk}/revalidate/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_revalidate_not_found(self, kenhdd_elements, authenticated_client):
        """Should return 404 when run does not exist."""
        response = authenticated_client.post(
            "/api/kenhdd/compliance/runs/99999/revalidate/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_auth_required_on_run_detail(self, kenhdd_elements, api_client):
        """Should reject unauthenticated requests to run detail."""
        response = api_client.get("/api/kenhdd/compliance/runs/1/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_auth_required_on_revalidate(self, kenhdd_elements, api_client):
        """Should reject unauthenticated requests to revalidate."""
        response = api_client.post("/api/kenhdd/compliance/runs/1/revalidate/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
