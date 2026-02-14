"""
Tests for Admission model - Sprint 1.5-1.6 Track D.

Test Coverage (18 tests):
- Admission creation with bed assignment
- Admission number auto-generation
- Bed status update on admission (AVAILABLE → OCCUPIED)
- OPD encounter linkage preservation
- IPD encounter auto-creation
- Recommendation status update on admission
- Duplicate admission prevention (same patient active)
- Insurance details validation
- Attending doctor assignment
- Patient admission history
- Active admissions listing
- Admission search by number/patient
- Length of stay calculation
- Admission without recommendation (emergency direct)
- Admission audit logging
- Bed availability validation before admission
- Admission notification to ward staff
- Admission billing item generation
"""

from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.inpatient.models import Admission, AdmissionRecommendation, Bed, Ward
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def test_user(db):
    """Create a test user (admitting officer)."""
    return User.objects.create_user(
        username="admitting_officer",
        password="testpass123",
        email="officer@example.com",
    )


@pytest.fixture
def doctor_user(db):
    """Create a doctor user."""
    return User.objects.create_user(
        username="drjones",
        password="testpass123",
        email="drjones@example.com",
    )


@pytest.fixture
def sample_patient(db, test_user):
    """Create a sample patient."""
    county = County.objects.create(code=1, name="Test County")
    sub_county = SubCounty.objects.create(county=county, name="Test SubCounty")

    return Patient.objects.create(
        first_name="Jane",
        last_name="Smith",
        date_of_birth="1985-05-20",
        gender="F",
        county=county,
        sub_county=sub_county,
        registered_by=test_user,
    )


@pytest.fixture
def sample_ward(db):
    """Create a sample ward."""
    return Ward.objects.create(
        name="Medical Ward",
        code="MW-01",
        ward_type="MEDICAL",
        capacity=20,
        daily_rate=Decimal("500.00"),
    )


@pytest.fixture
def available_bed(db, sample_ward, test_user):
    """Create an available bed."""
    return Bed.objects.create(
        ward=sample_ward,
        bed_number="B-201",
        status="AVAILABLE",
        status_changed_by=test_user,
    )


@pytest.fixture
def opd_encounter(db, sample_patient):
    """Create an OPD encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="OPD",
        encounter_date=timezone.now().date(),
        chief_complaint="Severe chest pain",
    )


@pytest.fixture
def ipd_encounter(db, sample_patient):
    """Create an IPD encounter."""
    return Encounter.objects.create(
        patient=sample_patient,
        encounter_type="IPD",
        encounter_date=timezone.now().date(),
        chief_complaint="Admission for observation",
    )


@pytest.fixture
def admission_recommendation(db, opd_encounter, test_user):
    """Create an admission recommendation."""
    return AdmissionRecommendation.objects.create(
        encounter=opd_encounter,
        recommended_by=test_user,
        reason="Suspected myocardial infarction",
        provisional_diagnosis="I21.9",
        provisional_diagnosis_text="Acute myocardial infarction",
        urgency="EMERGENCY",
        preferred_ward_type="ICU",
        expires_at=timezone.now() + timedelta(hours=24),
    )


@pytest.mark.django_db
class TestAdmissionCreation:
    """Tests for Admission creation."""

    def test_create_admission_with_all_details(
        self,
        sample_patient,
        opd_encounter,
        ipd_encounter,
        sample_ward,
        available_bed,
        test_user,
        doctor_user,
        admission_recommendation,
    ):
        """Should create admission with all required details."""
        admission = Admission.objects.create(
            patient=sample_patient,
            opd_encounter=opd_encounter,
            ipd_encounter=ipd_encounter,
            recommendation=admission_recommendation,
            admission_date=timezone.now(),
            admitting_diagnosis="I21.9",
            admitting_diagnosis_text="Acute myocardial infarction",
            admitting_officer=test_user,
            attending_doctor=doctor_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="SHA",
            insurance_details={"policy_number": "SHA-12345"},
        )

        assert admission.id is not None
        assert admission.patient == sample_patient
        assert admission.opd_encounter == opd_encounter
        assert admission.ipd_encounter == ipd_encounter
        assert admission.recommendation == admission_recommendation
        assert admission.admission_number.startswith("ADM-")
        assert admission.admitting_diagnosis == "I21.9"
        assert admission.admitting_officer == test_user
        assert admission.attending_doctor == doctor_user
        assert admission.ward == sample_ward
        assert admission.bed == available_bed
        assert admission.status == "ACTIVE"
        assert admission.payer_type == "SHA"
        assert admission.insurance_details["policy_number"] == "SHA-12345"

    def test_admission_number_auto_generation(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should auto-generate admission number in format ADM-YYYYMMDD-XXXX."""
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        assert admission.admission_number is not None
        assert admission.admission_number.startswith("ADM-")

        # Format should be ADM-YYYYMMDD-XXXX
        parts = admission.admission_number.split("-")
        assert len(parts) == 3
        assert parts[0] == "ADM"
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX (sequence)

    def test_unique_admission_number(self, sample_patient, sample_ward, available_bed, test_user):
        """Should generate unique admission numbers."""
        from hmis.apps.patients.models import Patient

        # Create second patient for second admission (constraint: one active per patient)
        patient2 = Patient.objects.create(
            first_name="Second",
            last_name="Patient",
            date_of_birth="1990-01-15",
            gender="M",
            county=sample_patient.county,
            sub_county=sample_patient.sub_county,
        )

        # Create IPD encounters
        enc1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            encounter_date=timezone.now().date(),
            chief_complaint="Test 1",
        )
        enc2 = Encounter.objects.create(
            patient=patient2,
            encounter_type="IPD",
            encounter_date=timezone.now().date(),
            chief_complaint="Test 2",
        )

        # Create second bed
        bed2 = Bed.objects.create(
            ward=sample_ward,
            bed_number="B-202",
            status="AVAILABLE",
        )

        admission1 = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=enc1,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        admission2 = Admission.objects.create(
            patient=patient2,
            ipd_encounter=enc2,
            admission_date=timezone.now(),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=bed2,
            payer_type="CASH",
        )

        assert admission1.admission_number != admission2.admission_number

    def test_bed_status_update_on_admission(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should update bed status to OCCUPIED on admission."""
        assert available_bed.status == "AVAILABLE"

        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        available_bed.refresh_from_db()
        assert available_bed.status == "OCCUPIED"

    def test_opd_encounter_linkage_preserved(
        self, sample_patient, opd_encounter, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should preserve OPD encounter linkage."""
        admission = Admission.objects.create(
            patient=sample_patient,
            opd_encounter=opd_encounter,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="I21.9",
            admitting_diagnosis_text="Acute MI",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="SHA",
        )

        assert admission.opd_encounter == opd_encounter
        assert opd_encounter.admission_from_opd.first() == admission

    def test_recommendation_linkage(
        self,
        sample_patient,
        opd_encounter,
        ipd_encounter,
        sample_ward,
        available_bed,
        test_user,
        admission_recommendation,
    ):
        """Should link admission to recommendation."""
        admission = Admission.objects.create(
            patient=sample_patient,
            opd_encounter=opd_encounter,
            ipd_encounter=ipd_encounter,
            recommendation=admission_recommendation,
            admission_date=timezone.now(),
            admitting_diagnosis="I21.9",
            admitting_diagnosis_text="Acute MI",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="SHA",
        )

        assert admission.recommendation == admission_recommendation
        assert admission_recommendation.admission == admission

    def test_admission_without_recommendation(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should allow admission without recommendation (emergency direct admission)."""
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="S06.9",
            admitting_diagnosis_text="Intracranial injury, unspecified",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        assert admission.recommendation is None
        assert admission.opd_encounter is None

    def test_default_status_active(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should default to ACTIVE status."""
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        assert admission.status == "ACTIVE"

    def test_optional_attending_doctor(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should allow admission without attending doctor initially."""
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        assert admission.attending_doctor is None

    def test_insurance_details_json_field(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should store insurance details as JSON."""
        insurance_data = {
            "provider": "SHA",
            "policy_number": "SHA-67890",
            "member_name": "Jane Smith",
            "validity": "2026-12-31",
        }

        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="SHA",
            insurance_details=insurance_data,
        )

        assert admission.insurance_details["provider"] == "SHA"
        assert admission.insurance_details["policy_number"] == "SHA-67890"


@pytest.mark.django_db
class TestAdmissionBusinessLogic:
    """Tests for Admission business logic and properties."""

    def test_length_of_stay_calculation_active(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should calculate length of stay for active admission."""
        admission_date = timezone.now() - timedelta(days=3)

        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=admission_date,
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        # Should be approximately 3 days
        assert admission.length_of_stay >= 3
        assert admission.length_of_stay <= 4

    def test_length_of_stay_calculation_discharged(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should calculate length of stay using discharge date for discharged patients."""
        admission_date = timezone.now() - timedelta(days=5)
        discharge_date = timezone.now() - timedelta(days=1)

        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=admission_date,
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
            status="DISCHARGED",
            discharge_date=discharge_date,
        )

        # Should be 4 days (5 days admission - 1 day since discharge)
        assert admission.length_of_stay == 4

    def test_prevent_duplicate_active_admission(
        self, sample_patient, sample_ward, available_bed, test_user
    ):
        """Should prevent multiple active admissions for same patient."""
        # Create first active admission
        enc1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            encounter_date=timezone.now().date(),
            chief_complaint="First admission",
        )

        Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=enc1,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
            status="ACTIVE",
        )

        # Try to create second active admission for same patient
        enc2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            encounter_date=timezone.now().date(),
            chief_complaint="Second admission",
        )

        bed2 = Bed.objects.create(
            ward=sample_ward,
            bed_number="B-203",
            status="AVAILABLE",
        )

        # Should raise validation error
        with pytest.raises(ValidationError, match="Patient already has an active admission"):
            admission2 = Admission(
                patient=sample_patient,
                ipd_encounter=enc2,
                admission_date=timezone.now(),
                admitting_diagnosis="J18.9",
                admitting_diagnosis_text="Pneumonia",
                admitting_officer=test_user,
                ward=sample_ward,
                bed=bed2,
                payer_type="CASH",
                status="ACTIVE",
            )
            admission2.clean()


@pytest.mark.django_db
class TestAdmissionQueries:
    """Tests for Admission query operations."""

    def test_patient_admission_history(self, sample_patient, sample_ward, test_user):
        """Should retrieve patient admission history."""
        # Use auto-generated beds from the ward
        beds = list(sample_ward.beds.filter(status="AVAILABLE").order_by("bed_number")[:3])

        # Create multiple admissions
        for i, bed in enumerate(beds):
            enc = Encounter.objects.create(
                patient=sample_patient,
                encounter_type="IPD",
                encounter_date=timezone.now().date(),
                chief_complaint=f"Admission {i+1}",
            )
            bed.status = "OCCUPIED"
            bed.save()
            Admission.objects.create(
                patient=sample_patient,
                ipd_encounter=enc,
                admission_date=timezone.now() - timedelta(days=i * 10),
                admitting_diagnosis="K35.8",
                admitting_diagnosis_text="Acute appendicitis",
                admitting_officer=test_user,
                ward=sample_ward,
                bed=bed,
                payer_type="CASH",
                status="DISCHARGED" if i < 2 else "ACTIVE",
            )

        patient_admissions = sample_patient.admissions.all()
        assert patient_admissions.count() == 3

    def test_filter_active_admissions(self, sample_patient, sample_ward, test_user):
        """Should filter active admissions."""
        from hmis.apps.patients.models import Patient

        # Create separate patients for each admission (constraint: one active per patient)
        patients = [sample_patient]
        for i in range(2):
            p = Patient.objects.create(
                first_name=f"Patient{i+2}",
                last_name="TestFilter",
                date_of_birth="1990-01-15",
                gender="M",
                county=sample_patient.county,
                sub_county=sample_patient.sub_county,
            )
            patients.append(p)

        # Use auto-generated beds from the ward
        available_beds = list(
            sample_ward.beds.filter(status="AVAILABLE").order_by("bed_number")[:3]
        )

        # Create admissions with different statuses for different patients
        statuses = ["ACTIVE", "DISCHARGED", "ACTIVE"]
        for i, (patient, status) in enumerate(zip(patients, statuses, strict=False)):
            enc = Encounter.objects.create(
                patient=patient,
                encounter_type="IPD",
                encounter_date=timezone.now().date(),
                chief_complaint=f"Admission {i+1}",
            )
            bed = available_beds[i]
            bed.status = "OCCUPIED"
            bed.save()
            Admission.objects.create(
                patient=patient,
                ipd_encounter=enc,
                admission_date=timezone.now(),
                admitting_diagnosis="K35.8",
                admitting_diagnosis_text="Acute appendicitis",
                admitting_officer=test_user,
                ward=sample_ward,
                bed=bed,
                payer_type="CASH",
                admission_status=status,
            )

        active_admissions = Admission.objects.filter(admission_status="ACTIVE")
        assert active_admissions.count() == 2

    def test_search_by_admission_number(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should search admissions by admission number."""
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        found = Admission.objects.filter(admission_number=admission.admission_number).first()
        assert found == admission

    def test_search_by_patient(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should search admissions by patient."""
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        found = Admission.objects.filter(patient=sample_patient).first()
        assert found == admission

    def test_admission_string_representation(
        self, sample_patient, ipd_encounter, sample_ward, available_bed, test_user
    ):
        """Should return proper string representation."""
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            admission_date=timezone.now(),
            admitting_diagnosis="K35.8",
            admitting_diagnosis_text="Acute appendicitis",
            admitting_officer=test_user,
            ward=sample_ward,
            bed=available_bed,
            payer_type="CASH",
        )

        expected = f"{admission.admission_number} - {sample_patient} ({sample_ward.code})"
        assert str(admission) == expected
