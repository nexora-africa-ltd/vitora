"""
Tests for data integrity and idempotency constraints.

Sprint 1.7: Data Integrity & Idempotency

TDD Tests for:
1. Patient duplicate prevention (unique identification, demographic uniqueness)
2. Admission constraints (one active admission per patient)
3. Encounter constraints (one active encounter per patient, clinician assignment)
4. Idempotency key tracking for API operations
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework import status

# ============================================================================
# Patient Integrity Constraint Tests
# ============================================================================


class TestPatientDuplicatePrevention:
    """Tests for preventing duplicate patient registration."""

    def test_unique_identification_number_constraint(self, db, sample_county, sample_sub_county):
        """Should prevent two patients with same identification type and number."""
        from hmis.apps.patients.models import Patient

        # Create first patient with national ID
        Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_type="national_id",
            identification_number="12345678",
        )

        # Attempt to create second patient with same national ID
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                Patient.objects.create(
                    first_name="Jane",
                    last_name="Smith",
                    date_of_birth="1985-05-20",
                    gender="F",
                    county=sample_county,
                    sub_county=sample_sub_county,
                    identification_type="national_id",
                    identification_number="12345678",
                )

    def test_different_identification_types_allowed(self, db, sample_county, sample_sub_county):
        """Should allow same number with different identification types."""
        from hmis.apps.patients.models import Patient

        # Create first patient with national ID
        p1 = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_type="national_id",
            identification_number="12345678",
        )

        # Create second patient with passport (same number, different type)
        p2 = Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth="1985-05-20",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_type="passport",
            identification_number="12345678",
        )

        assert p1.pk != p2.pk

    def test_null_identification_numbers_allowed(self, db, sample_county, sample_sub_county):
        """Should allow multiple patients without identification numbers."""
        from hmis.apps.patients.models import Patient

        # Create first patient without identification
        p1 = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_number=None,
        )

        # Create second patient without identification
        p2 = Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth="1985-05-20",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_number=None,
        )

        assert p1.pk != p2.pk

    def test_empty_identification_numbers_allowed(self, db, sample_county, sample_sub_county):
        """Should allow multiple patients with empty identification numbers."""
        from hmis.apps.patients.models import Patient

        # Create first patient with empty identification
        p1 = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_number="",
        )

        # Create second patient with empty identification
        p2 = Patient.objects.create(
            first_name="Jane",
            last_name="Smith",
            date_of_birth="1985-05-20",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
            identification_number="",
        )

        assert p1.pk != p2.pk

    def test_potential_duplicate_detection_via_serializer(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Should warn about potential duplicates with same demographics."""
        from hmis.apps.patients.models import Patient

        # Create existing patient
        Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        # Attempt to create patient with exact same demographics via API
        response = authenticated_client.post(
            "/api/patients/",
            {
                "first_name": "John",
                "last_name": "Doe",
                "date_of_birth": "1990-01-15",
                "gender": "M",
                "county": sample_county.id,
                "sub_county": sample_sub_county.id,
            },
            format="json",
        )

        # Should fail with duplicate warning
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            "duplicate" in str(response.data).lower()
            or "already exists" in str(response.data).lower()
        )

    def test_case_insensitive_duplicate_detection(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Should detect duplicates regardless of name case."""
        from hmis.apps.patients.models import Patient

        # Create existing patient
        Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
        )

        # Attempt to create with different case
        response = authenticated_client.post(
            "/api/patients/",
            {
                "first_name": "JOHN",
                "last_name": "DOE",
                "date_of_birth": "1990-01-15",
                "gender": "M",
                "county": sample_county.id,
                "sub_county": sample_sub_county.id,
            },
            format="json",
        )

        # Should still detect as duplicate
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# Admission Integrity Constraint Tests
# ============================================================================


class TestAdmissionConstraints:
    """Tests for admission integrity constraints."""

    def test_only_one_active_admission_per_patient(
        self, db, sample_patient, sample_inpatient_ward, sample_bed, test_user
    ):
        """Should prevent multiple active admissions for same patient."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.inpatient.models import Admission, Bed

        # Create IPD encounter for first admission
        ipd_encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Severe infection",
        )

        # Create first active admission
        admission1 = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter1,
            admission_date=timezone.now(),
            admitting_diagnosis="A09",
            admitting_diagnosis_text="Infectious gastroenteritis",
            admitting_officer=test_user,
            ward=sample_inpatient_ward,
            bed=sample_bed,
            payer_type="CASH",
            admission_status="ACTIVE",
        )
        assert admission1.admission_status == "ACTIVE"

        # Create second bed
        bed2 = Bed.objects.create(
            ward=sample_inpatient_ward,
            bed_number="B-102",
            bed_type="STANDARD",
            status="AVAILABLE",
        )

        # Create second IPD encounter
        ipd_encounter2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Another issue",
        )

        # Attempt second active admission - should fail
        with pytest.raises((IntegrityError, ValidationError)):
            with transaction.atomic():
                Admission.objects.create(
                    patient=sample_patient,
                    ipd_encounter=ipd_encounter2,
                    admission_date=timezone.now(),
                    admitting_diagnosis="J18",
                    admitting_diagnosis_text="Pneumonia",
                    admitting_officer=test_user,
                    ward=sample_inpatient_ward,
                    bed=bed2,
                    payer_type="CASH",
                    admission_status="ACTIVE",
                )

    def test_discharged_patient_can_be_readmitted(
        self, db, sample_patient, sample_inpatient_ward, sample_bed, test_user
    ):
        """Should allow readmission after discharge."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.inpatient.models import Admission, Bed

        # Create and discharge first admission
        ipd_encounter1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Severe infection",
        )

        admission1 = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter1,
            admission_date=timezone.now() - timedelta(days=3),
            admitting_diagnosis="A09",
            admitting_diagnosis_text="Infectious gastroenteritis",
            admitting_officer=test_user,
            ward=sample_inpatient_ward,
            bed=sample_bed,
            payer_type="CASH",
            admission_status="DISCHARGED",
            discharge_date=timezone.now() - timedelta(days=1),
        )

        # Create new bed
        bed2 = Bed.objects.create(
            ward=sample_inpatient_ward,
            bed_number="B-103",
            bed_type="STANDARD",
            status="AVAILABLE",
        )

        # Create new encounter for readmission
        ipd_encounter2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Relapse",
        )

        # Should be able to create new active admission
        admission2 = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter2,
            admission_date=timezone.now(),
            admitting_diagnosis="A09",
            admitting_diagnosis_text="Gastroenteritis relapse",
            admitting_officer=test_user,
            ward=sample_inpatient_ward,
            bed=bed2,
            payer_type="CASH",
            admission_status="ACTIVE",
        )

        assert admission2.admission_status == "ACTIVE"
        assert admission1.admission_status == "DISCHARGED"


# ============================================================================
# Encounter Integrity Constraint Tests
# ============================================================================


class TestEncounterConstraints:
    """Tests for encounter integrity constraints."""

    def test_only_one_active_encounter_per_patient(self, db, sample_patient):
        """Should prevent multiple IN_PROGRESS encounters for same patient."""
        from hmis.apps.encounters.models import Encounter

        # Create first IN_PROGRESS encounter
        enc1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            status="IN_PROGRESS",
        )
        assert enc1.status == "IN_PROGRESS"

        # Attempt second IN_PROGRESS encounter - should fail
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                Encounter.objects.create(
                    patient=sample_patient,
                    encounter_type="OPD",
                    chief_complaint="Fever",
                    status="IN_PROGRESS",
                )

    def test_completed_encounter_allows_new_active(self, db, sample_patient, test_user):
        """Should allow new encounter after previous one is completed."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter

        # Create and complete first encounter
        enc1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            status="COMPLETED",
            finalized_by=test_user,
            finalized_at=timezone.now(),
        )

        # Should be able to create new IN_PROGRESS encounter
        enc2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Fever",
            status="IN_PROGRESS",
        )

        assert enc1.status == "COMPLETED"
        assert enc2.status == "IN_PROGRESS"

    def test_draft_and_active_encounters_conflict(self, db, sample_patient):
        """Should allow DRAFT but not multiple IN_PROGRESS encounters."""
        from hmis.apps.encounters.models import Encounter

        # Create CREATED encounter (allowed)
        enc1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Cough",
            status="CREATED",
        )

        # Create IN_PROGRESS encounter (allowed)
        enc2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            status="IN_PROGRESS",
        )

        assert enc1.status == "CREATED"
        assert enc2.status == "IN_PROGRESS"

        # Attempting to create another IN_PROGRESS should fail
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                Encounter.objects.create(
                    patient=sample_patient,
                    encounter_type="OPD",
                    chief_complaint="Fever",
                    status="IN_PROGRESS",
                )


class TestEncounterClinicianAssignment:
    """Tests for clinician assignment to encounters."""

    def test_clinician_can_claim_encounter(self, db, sample_patient, test_user):
        """Should allow clinician to claim an encounter."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            status="CREATED",
        )

        # Clinician claims the encounter
        encounter.assigned_clinician = test_user
        encounter.claimed_at = timezone.now()
        encounter.status = "IN_PROGRESS"
        encounter.save()

        encounter.refresh_from_db()
        assert encounter.assigned_clinician == test_user
        assert encounter.status == "IN_PROGRESS"

    def test_encounter_cannot_be_claimed_by_two_clinicians(
        self, db, sample_patient, test_user, another_user
    ):
        """Should prevent two clinicians from claiming the same encounter."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            status="IN_PROGRESS",
            assigned_clinician=test_user,
            claimed_at=timezone.now(),
        )

        # Another clinician attempts to claim - should fail validation
        encounter.assigned_clinician = another_user

        with pytest.raises(ValidationError) as exc_info:
            encounter.full_clean()

        assert (
            "already being attended" in str(exc_info.value).lower()
            or "assigned" in str(exc_info.value).lower()
        )

    def test_clinician_can_release_encounter(self, db, sample_patient, test_user):
        """Should allow clinician to release an encounter."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
            status="IN_PROGRESS",
            assigned_clinician=test_user,
            claimed_at=timezone.now(),
        )

        # Clinician releases
        encounter.assigned_clinician = None
        encounter.claimed_at = None
        encounter.status = "CREATED"
        encounter.save()

        encounter.refresh_from_db()
        assert encounter.assigned_clinician is None
        assert encounter.status == "CREATED"


# ============================================================================
# Idempotency Key Tests
# ============================================================================


class TestIdempotencyKeys:
    """Tests for idempotency key tracking."""

    def test_idempotency_key_model_creation(self, db, test_user):
        """Should create idempotency key record."""
        from hmis.apps.core.models import IdempotencyKey

        key = IdempotencyKey.objects.create(
            key=str(uuid.uuid4()),
            user=test_user,
            resource_type="Patient",
            resource_id=1,
            response_status=201,
            response_data={"id": 1, "mrn": "MRN-20260123-0001"},
        )

        assert key.pk is not None
        assert key.resource_type == "Patient"

    def test_duplicate_idempotency_key_rejected(self, db, test_user):
        """Should prevent duplicate idempotency keys for same user."""
        from hmis.apps.core.models import IdempotencyKey

        idempotency_key = str(uuid.uuid4())

        IdempotencyKey.objects.create(
            key=idempotency_key,
            user=test_user,
            resource_type="Patient",
            resource_id=1,
            response_status=201,
            response_data={},
        )

        # Duplicate should fail
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                IdempotencyKey.objects.create(
                    key=idempotency_key,
                    user=test_user,
                    resource_type="Patient",
                    resource_id=2,
                    response_status=201,
                    response_data={},
                )

    def test_same_key_different_users_allowed(self, db, test_user, another_user):
        """Should allow same idempotency key for different users."""
        from hmis.apps.core.models import IdempotencyKey

        idempotency_key = str(uuid.uuid4())

        key1 = IdempotencyKey.objects.create(
            key=idempotency_key,
            user=test_user,
            resource_type="Patient",
            resource_id=1,
            response_status=201,
            response_data={},
        )

        key2 = IdempotencyKey.objects.create(
            key=idempotency_key,
            user=another_user,
            resource_type="Patient",
            resource_id=2,
            response_status=201,
            response_data={},
        )

        assert key1.pk != key2.pk


class TestIdempotentPatientCreation:
    """Tests for idempotent patient creation via API."""

    def test_idempotent_patient_creation_returns_same_response(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Repeated request with same idempotency key returns same response."""
        idempotency_key = str(uuid.uuid4())
        patient_data = {
            "first_name": "Idempotent",
            "last_name": "Test",
            "date_of_birth": "1990-01-15",
            "gender": "M",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        # First request
        response1 = authenticated_client.post(
            "/api/patients/",
            patient_data,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key,
        )
        assert response1.status_code == status.HTTP_201_CREATED
        patient_id = response1.data["id"]

        # Second request with same key should return same response (idempotent)
        response2 = authenticated_client.post(
            "/api/patients/",
            patient_data,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=idempotency_key,
        )
        assert response2.status_code == status.HTTP_201_CREATED
        assert response2.data["id"] == patient_id  # Same patient returned

    def test_different_idempotency_keys_create_separate_records(
        self, authenticated_client, sample_county, sample_sub_county
    ):
        """Different idempotency keys create separate patient records."""
        patient_data1 = {
            "first_name": "First",
            "last_name": "Patient",
            "date_of_birth": "1990-01-15",
            "gender": "M",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        patient_data2 = {
            "first_name": "Second",
            "last_name": "Patient",
            "date_of_birth": "1985-05-20",
            "gender": "F",
            "county": sample_county.id,
            "sub_county": sample_sub_county.id,
        }

        response1 = authenticated_client.post(
            "/api/patients/",
            patient_data1,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )

        response2 = authenticated_client.post(
            "/api/patients/",
            patient_data2,
            format="json",
            HTTP_X_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )

        assert response1.status_code == status.HTTP_201_CREATED
        assert response2.status_code == status.HTTP_201_CREATED
        assert response1.data["id"] != response2.data["id"]


# ============================================================================
# Encounter Claim API Tests
# ============================================================================


class TestEncounterClaimAPI:
    """Tests for encounter claim/release API endpoints."""

    def test_claim_encounter_endpoint(self, authenticated_client, sample_encounter):
        """Should successfully claim an encounter via API."""
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/claim/",
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "claimed"

        sample_encounter.refresh_from_db()
        assert sample_encounter.status == "IN_PROGRESS"
        assert sample_encounter.assigned_clinician is not None

    def test_claim_already_claimed_encounter_fails(
        self, authenticated_client, sample_encounter, test_user, another_user
    ):
        """Should reject claim if encounter already claimed by another clinician."""
        from django.utils import timezone

        # First user claims
        sample_encounter.assigned_clinician = another_user
        sample_encounter.claimed_at = timezone.now()
        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save()

        # Second user attempts to claim
        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/claim/",
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already claimed" in response.data["error"].lower()

    def test_release_encounter_endpoint(self, authenticated_client, sample_encounter, test_user):
        """Should successfully release an encounter via API."""
        from django.utils import timezone

        # Setup: claim the encounter first
        sample_encounter.assigned_clinician = test_user
        sample_encounter.claimed_at = timezone.now()
        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/release/",
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "released"

        sample_encounter.refresh_from_db()
        assert sample_encounter.assigned_clinician is None

    def test_release_encounter_not_assigned_to_user_fails(
        self, authenticated_client, sample_encounter, another_user
    ):
        """Should reject release if user is not the assigned clinician."""
        from django.utils import timezone

        # Another user has claimed
        sample_encounter.assigned_clinician = another_user
        sample_encounter.claimed_at = timezone.now()
        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/release/",
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# Bed Occupancy Constraint Tests
# ============================================================================


class TestBedOccupancyConstraints:
    """Tests for bed occupancy constraints."""

    def test_bed_cannot_be_double_booked(
        self, db, sample_patient, sample_inpatient_ward, sample_bed, test_user
    ):
        """Should prevent two active admissions to the same bed."""
        from django.utils import timezone

        from hmis.apps.encounters.models import Encounter
        from hmis.apps.inpatient.models import Admission
        from hmis.apps.patients.models import Patient

        # Create second patient
        patient2 = Patient.objects.create(
            first_name="Second",
            last_name="Patient",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_patient.county,
            sub_county=sample_patient.sub_county,
        )

        # Create IPD encounters
        ipd_enc1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Test 1",
        )

        ipd_enc2 = Encounter.objects.create(
            patient=patient2,
            encounter_type="IPD",
            chief_complaint="Test 2",
        )

        # First admission to bed
        Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_enc1,
            admission_date=timezone.now(),
            admitting_diagnosis="A09",
            admitting_diagnosis_text="Test diagnosis",
            admitting_officer=test_user,
            ward=sample_inpatient_ward,
            bed=sample_bed,
            payer_type="CASH",
            admission_status="ACTIVE",
        )

        # Second admission to same bed should fail
        with pytest.raises((IntegrityError, ValidationError)):
            with transaction.atomic():
                Admission.objects.create(
                    patient=patient2,
                    ipd_encounter=ipd_enc2,
                    admission_date=timezone.now(),
                    admitting_diagnosis="J18",
                    admitting_diagnosis_text="Pneumonia",
                    admitting_officer=test_user,
                    ward=sample_inpatient_ward,
                    bed=sample_bed,  # Same bed!
                    payer_type="CASH",
                    admission_status="ACTIVE",
                )
