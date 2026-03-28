"""
Tests for DeathRecord (Last Office) feature.

Tests cover:
- Model creation and Patient deceased status propagation
- CRUD API endpoints
- Workflow actions: certify, release_body, report_to_civil_registry, void
- Validation rules
"""

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def death_record_data(sample_patient):
    """Valid death record creation data."""
    return {
        "patient": sample_patient.id,
        "date_of_death": "2026-03-27",
        "time_of_death": "14:30:00",
        "manner_of_death": "NATURAL",
        "place_of_death": "INPATIENT",
        "place_of_death_detail": "Medical Ward 1",
        "primary_cause": "Pneumonia",
        "notification_source": "MANUAL_ENTRY",
    }


@pytest.fixture
def sample_death_record(db, sample_patient, test_user):
    """Create a sample death record for testing."""
    from hmis.apps.patients.models import DeathRecord

    return DeathRecord.objects.create(
        patient=sample_patient,
        date_of_death="2026-03-27",
        time_of_death="14:30:00",
        manner_of_death="NATURAL",
        place_of_death="INPATIENT",
        primary_cause="Pneumonia",
        recorded_by=test_user,
    )


# =============================================================================
# MODEL TESTS
# =============================================================================


class TestDeathRecordModel:
    """Tests for DeathRecord model behavior."""

    def test_creation_marks_patient_deceased(self, sample_death_record, sample_patient):
        """Creating a death record should auto-set Patient.is_deceased."""
        sample_patient.refresh_from_db()
        assert sample_patient.is_deceased is True
        assert str(sample_patient.date_of_death) == "2026-03-27"

    def test_str_representation(self, sample_death_record):
        """Should have meaningful string representation."""
        assert sample_death_record.patient.mrn in str(sample_death_record)
        assert "2026-03-27" in str(sample_death_record)

    def test_default_status(self, sample_death_record):
        """Default status should be PENDING_CERTIFICATION."""
        assert sample_death_record.status == "PENDING_CERTIFICATION"

    def test_default_body_status(self, sample_death_record):
        """Default body status should be IN_MORGUE."""
        assert sample_death_record.body_status == "IN_MORGUE"

    def test_certify(self, sample_death_record, another_user):
        """Certify should update status and certification fields."""
        sample_death_record.certify(user=another_user, certificate_number="DC-2026-001")
        sample_death_record.refresh_from_db()
        assert sample_death_record.status == "CERTIFIED"
        assert sample_death_record.certified_by == another_user
        assert sample_death_record.certified_at is not None
        assert sample_death_record.death_certificate_number == "DC-2026-001"

    def test_release_body(self, sample_death_record, another_user):
        """Release body should update body_status and release fields."""
        sample_death_record.certify(user=another_user)
        sample_death_record.release_body(
            released_to="John Doe",
            id_number="12345678",
            relationship="Spouse",
            burial_permit="BP-001",
        )
        sample_death_record.refresh_from_db()
        assert sample_death_record.body_status == "RELEASED"
        assert sample_death_record.status == "RELEASED_TO_FAMILY"
        assert sample_death_record.released_to == "John Doe"
        assert sample_death_record.released_to_id_number == "12345678"
        assert sample_death_record.burial_permit_number == "BP-001"
        assert sample_death_record.release_date is not None

    def test_void_reverses_patient_deceased(self, sample_death_record, sample_patient, another_user):
        """Voiding a death record should reverse Patient.is_deceased."""
        sample_patient.refresh_from_db()
        assert sample_patient.is_deceased is True

        sample_death_record.void(user=another_user, reason="Entered in error - wrong patient")
        sample_death_record.refresh_from_db()
        sample_patient.refresh_from_db()

        assert sample_death_record.status == "VOIDED"
        assert sample_death_record.voided_by == another_user
        assert sample_death_record.voided_at is not None
        assert sample_death_record.void_reason == "Entered in error - wrong patient"
        assert sample_patient.is_deceased is False
        assert sample_patient.date_of_death is None

    def test_is_voided_property(self, sample_death_record, another_user):
        """is_voided property should reflect voided status."""
        assert sample_death_record.is_voided is False
        sample_death_record.void(user=another_user, reason="Entered in error")
        assert sample_death_record.is_voided is True

    def test_is_certified_property(self, sample_death_record, another_user):
        """is_certified property should be True after certification."""
        assert sample_death_record.is_certified is False
        sample_death_record.certify(user=another_user)
        assert sample_death_record.is_certified is True

    def test_is_released_property(self, sample_death_record, another_user):
        """is_released property should be True after body release."""
        assert sample_death_record.is_released is False
        sample_death_record.certify(user=another_user)
        sample_death_record.release_body(released_to="Family Member")
        assert sample_death_record.is_released is True

    def test_report_to_civil_registry(self, sample_death_record, another_user):
        """Should update status to REPORTED_TO_CIVIL_REGISTRY."""
        sample_death_record.certify(user=another_user)
        sample_death_record.report_to_civil_registry()
        sample_death_record.refresh_from_db()
        assert sample_death_record.status == "REPORTED_TO_CIVIL_REGISTRY"


# =============================================================================
# API CRUD TESTS
# =============================================================================


class TestDeathRecordAPI:
    """Tests for DeathRecord API endpoints."""

    def test_create_death_record(self, authenticated_client, death_record_data):
        """Should create a death record and return 201."""
        response = authenticated_client.post("/api/death-records/", death_record_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["patient"] == death_record_data["patient"]
        assert response.data["primary_cause"] == "Pneumonia"

    def test_create_unauthenticated_fails(self, api_client, death_record_data):
        """Should reject unauthenticated requests."""
        response = api_client.post("/api/death-records/", death_record_data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_future_date_of_death_fails(self, authenticated_client, death_record_data):
        """Should reject future date of death."""
        death_record_data["date_of_death"] = "2030-01-01"
        response = authenticated_client.post("/api/death-records/", death_record_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "date_of_death" in response.data

    def test_create_duplicate_for_patient_fails(
        self, authenticated_client, death_record_data, sample_death_record
    ):
        """Should reject creating a second death record for the same patient."""
        response = authenticated_client.post("/api/death-records/", death_record_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "patient" in response.data

    def test_create_date_before_birth_fails(
        self, authenticated_client, death_record_data, sample_patient
    ):
        """Should reject date of death before date of birth."""
        death_record_data["date_of_death"] = "1980-01-01"
        response = authenticated_client.post("/api/death-records/", death_record_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_death_records(self, authenticated_client, sample_death_record):
        """Should list death records."""
        response = authenticated_client.get("/api/death-records/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_list_filter_by_status(self, authenticated_client, sample_death_record):
        """Should filter by status."""
        response = authenticated_client.get(
            "/api/death-records/?status=PENDING_CERTIFICATION"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_list_filter_by_body_status(self, authenticated_client, sample_death_record):
        """Should filter by body status."""
        response = authenticated_client.get("/api/death-records/?body_status=IN_MORGUE")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_death_record(self, authenticated_client, sample_death_record):
        """Should retrieve a death record with full detail."""
        response = authenticated_client.get(
            f"/api/death-records/{sample_death_record.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["patient_mrn"] == sample_death_record.patient.mrn
        assert response.data["patient_name"] is not None
        assert response.data["manner_of_death_display"] == "Natural"

    def test_search_by_patient_mrn(self, authenticated_client, sample_death_record):
        """Should search by patient MRN."""
        mrn = sample_death_record.patient.mrn
        response = authenticated_client.get(f"/api/death-records/?search={mrn}")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


# =============================================================================
# WORKFLOW ACTION TESTS
# =============================================================================


class TestDeathRecordWorkflow:
    """Tests for DeathRecord workflow actions."""

    def test_certify_action(self, authenticated_client, sample_death_record):
        """Should certify a death record."""
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/certify/",
            {"certificate_number": "DC-2026-001"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CERTIFIED"
        assert response.data["death_certificate_number"] == "DC-2026-001"

    def test_certify_voided_record_fails(
        self, authenticated_client, sample_death_record, another_user
    ):
        """Should not certify a voided record."""
        sample_death_record.void(user=another_user, reason="Entered in error - test")
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/certify/", {}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_certify_already_certified_fails(
        self, authenticated_client, sample_death_record, another_user
    ):
        """Should not certify an already certified record."""
        sample_death_record.certify(user=another_user)
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/certify/", {}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_release_body_action(
        self, authenticated_client, sample_death_record, another_user
    ):
        """Should release body after certification."""
        sample_death_record.certify(user=another_user)
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/release-body/",
            {
                "released_to": "Jane Doe",
                "id_number": "12345678",
                "relationship": "Spouse",
                "burial_permit_number": "BP-2026-001",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["body_status"] == "RELEASED"
        assert response.data["released_to"] == "Jane Doe"

    def test_release_body_without_certification_fails(
        self, authenticated_client, sample_death_record
    ):
        """Should not release body without certification."""
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/release-body/",
            {"released_to": "Jane Doe"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_release_body_already_released_fails(
        self, authenticated_client, sample_death_record, another_user
    ):
        """Should not release body twice."""
        sample_death_record.certify(user=another_user)
        sample_death_record.release_body(released_to="First Person")
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/release-body/",
            {"released_to": "Second Person"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_report_to_civil_registry_action(
        self, authenticated_client, sample_death_record, another_user
    ):
        """Should mark as reported to civil registry."""
        sample_death_record.certify(user=another_user)
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/report-to-civil-registry/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REPORTED_TO_CIVIL_REGISTRY"

    def test_report_without_certification_fails(
        self, authenticated_client, sample_death_record
    ):
        """Should not report without certification."""
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/report-to-civil-registry/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_void_action(self, authenticated_client, sample_death_record):
        """Should void a death record."""
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/void/",
            {"reason": "Entered in error - wrong patient record"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "VOIDED"

    def test_void_released_body_fails(
        self, authenticated_client, sample_death_record, another_user
    ):
        """Should not void after body has been released."""
        sample_death_record.certify(user=another_user)
        sample_death_record.release_body(released_to="Family Member")
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/void/",
            {"reason": "Trying to void after release"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_void_already_voided_fails(
        self, authenticated_client, sample_death_record, another_user
    ):
        """Should not void an already voided record."""
        sample_death_record.void(user=another_user, reason="First void - test")
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/void/",
            {"reason": "Second void attempt"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_void_reason_too_short_fails(self, authenticated_client, sample_death_record):
        """Void reason must be at least 10 characters."""
        response = authenticated_client.post(
            f"/api/death-records/{sample_death_record.id}/void/",
            {"reason": "short"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# PATIENT DECEASED STATUS TESTS
# =============================================================================


class TestPatientDeceasedStatus:
    """Tests for Patient deceased status integration."""

    def test_patient_list_shows_deceased_field(self, authenticated_client, sample_patient):
        """Patient list should include is_deceased field."""
        response = authenticated_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK
        patient = response.data["results"][0]
        assert "is_deceased" in patient

    def test_patient_detail_shows_deceased_field(
        self, authenticated_client, sample_death_record
    ):
        """Patient detail should show deceased status after death record creation."""
        patient_id = sample_death_record.patient.id
        response = authenticated_client.get(f"/api/patients/{patient_id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_deceased"] is True
        assert response.data["date_of_death"] == "2026-03-27"


@pytest.mark.django_db
class TestDeceasedDischargeAutoCreation:
    """Tests for auto-creation of DeathRecord from DECEASED inpatient discharge."""

    def test_deceased_discharge_creates_death_record(
        self, sample_admission, test_user
    ):
        """DECEASED discharge should auto-create a DeathRecord."""
        from django.utils import timezone

        from hmis.apps.inpatient.models import Discharge
        from hmis.apps.patients.models import DeathRecord

        Discharge.objects.create(
            admission=sample_admission,
            discharge_type="DECEASED",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="J18.9",
            final_diagnosis="J18.9",
            final_diagnosis_text="Pneumonia, unspecified",
            treatment_summary="Patient deteriorated despite treatment",
            patient_instructions="N/A - deceased",
        )

        # Death record should exist
        patient = sample_admission.patient
        patient.refresh_from_db()
        assert patient.is_deceased is True
        assert hasattr(patient, "death_record")

        death_record = patient.death_record
        assert death_record.notification_source == "INPATIENT_DISCHARGE"
        assert death_record.primary_cause == "Pneumonia, unspecified"
        assert death_record.admission == sample_admission
        assert death_record.recorded_by == test_user
        assert death_record.status == "PENDING_CERTIFICATION"

    def test_deceased_discharge_skips_existing_death_record(
        self, sample_admission, test_user
    ):
        """If patient already has a death record, discharge should not duplicate."""
        from django.utils import timezone

        from hmis.apps.inpatient.models import Discharge
        from hmis.apps.patients.models import DeathRecord

        # Create death record first (e.g., manual entry)
        patient = sample_admission.patient
        DeathRecord.objects.create(
            patient=patient,
            date_of_death=timezone.now().date(),
            primary_cause="Cardiac arrest",
            recorded_by=test_user,
            notification_source="MANUAL_ENTRY",
        )

        # Discharge should not create a second one
        Discharge.objects.create(
            admission=sample_admission,
            discharge_type="DECEASED",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="J18.9",
            final_diagnosis="I46.9",
            final_diagnosis_text="Cardiac arrest",
            treatment_summary="Resuscitation unsuccessful",
            patient_instructions="N/A - deceased",
        )

        assert DeathRecord.objects.filter(patient=patient).count() == 1
        assert patient.death_record.notification_source == "MANUAL_ENTRY"

    def test_normal_discharge_does_not_create_death_record(
        self, sample_admission, test_user
    ):
        """Non-DECEASED discharge should NOT create a DeathRecord."""
        from django.utils import timezone

        from hmis.apps.inpatient.models import Discharge
        from hmis.apps.patients.models import DeathRecord

        Discharge.objects.create(
            admission=sample_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="J18.9",
            final_diagnosis="J18.9",
            final_diagnosis_text="Pneumonia, resolved",
            treatment_summary="Completed IV antibiotics",
            patient_instructions="Continue oral antibiotics for 5 days",
        )

        assert not DeathRecord.objects.filter(
            patient=sample_admission.patient
        ).exists()
        sample_admission.patient.refresh_from_db()
        assert sample_admission.patient.is_deceased is False

    def test_deceased_discharge_api_returns_death_record_id(
        self, authenticated_client, sample_admission, test_user
    ):
        """API response for DECEASED discharge should include death_record_id."""
        response = authenticated_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": sample_admission.id,
                "discharge_type": "DECEASED",
                "discharge_date": "2026-03-28T10:00:00Z",
                "discharged_by": test_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Pneumonia, unspecified",
                "treatment_summary": "Patient deteriorated",
                "patient_instructions": "N/A - deceased",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["death_record_id"] is not None
        assert isinstance(response.data["death_record_id"], int)
