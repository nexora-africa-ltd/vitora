"""
Tests for Discharge model - Sprint 1.5-1.6 Track D.

Test Coverage (15 tests):
- Discharge creation with clearances
- Bed status update (OCCUPIED → AVAILABLE)
- Admission status update (ACTIVE → DISCHARGED)
- LOS calculation
- Discharge summary required fields
- Discharge medications linking
- Follow-up appointment creation
- Referral documentation
- Discharge without clearance prevention
- Discharge audit logging
- Against-advice discharge documentation
- Deceased patient discharge
- Discharge date validation
- Multiple discharge prevention
- Patient instruction requirements
"""

from datetime import timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.inpatient.models import Admission, Bed, Discharge, Ward
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username="discharging_doctor",
        password="test123",
        email="doctor@example.com",
    )


@pytest.fixture
def sample_patient(db, test_user):
    """Create a sample patient."""
    county = County.objects.create(code=1, name="Test County")
    sub_county = SubCounty.objects.create(county=county, name="Test SubCounty")

    return Patient.objects.create(
        first_name="Michael",
        last_name="Johnson",
        date_of_birth="1975-08-15",
        gender="M",
        county=county,
        sub_county=sub_county,
        registered_by=test_user,
    )


@pytest.fixture
def sample_ward(db):
    """Create a sample ward."""
    return Ward.objects.create(
        name="Surgical Ward",
        code="SW-01",
        ward_type="SURGICAL",
        capacity=15,
        daily_rate=Decimal("600.00"),
    )


@pytest.fixture
def occupied_bed(db, sample_ward, test_user):
    """Create an occupied bed."""
    return Bed.objects.create(
        ward=sample_ward,
        bed_number="B-301",
        status="OCCUPIED",
        status_changed_by=test_user,
    )


@pytest.fixture
def active_admission(db, sample_patient, sample_ward, occupied_bed, test_user):
    """Create an active admission."""
    ipd_encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="IPD",
        encounter_date=timezone.now().date(),
        chief_complaint="Post-operative care",
    )

    admission_date = timezone.now() - timedelta(days=5)

    return Admission.objects.create(
        patient=sample_patient,
        ipd_encounter=ipd_encounter,
        admission_date=admission_date,
        admitting_diagnosis="K35.8",
        admitting_diagnosis_text="Acute appendicitis",
        admitting_officer=test_user,
        ward=sample_ward,
        bed=occupied_bed,
        payer_type="CASH",
        status="ACTIVE",
    )


@pytest.mark.django_db
class TestDischargeCreation:
    """Tests for Discharge creation."""

    def test_create_discharge_with_all_details(self, active_admission, test_user):
        """Should create discharge with complete documentation."""
        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Acute appendicitis, resolved",
            procedures_performed="Appendectomy performed",
            treatment_summary="Patient underwent emergency appendectomy. Post-operative recovery uneventful.",
            discharge_medications=[
                {
                    "name": "Amoxicillin",
                    "dosage": "500mg",
                    "frequency": "TID",
                    "duration": "7 days",
                },
                {
                    "name": "Paracetamol",
                    "dosage": "500mg",
                    "frequency": "PRN",
                    "duration": "5 days",
                },
            ],
            follow_up_date=(timezone.now() + timedelta(days=7)).date(),
            follow_up_instructions="Return for suture removal in 7 days",
            patient_instructions="Keep wound clean and dry. Rest for 2 weeks.",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        assert discharge.id is not None
        assert discharge.admission == active_admission
        assert discharge.discharge_type == "NORMAL"
        assert discharge.discharged_by == test_user
        assert discharge.final_diagnosis == "K35.8"
        assert len(discharge.discharge_medications) == 2
        assert discharge.pharmacy_cleared is True
        assert discharge.billing_cleared is True
        assert discharge.lab_results_acknowledged is True

    def test_bed_status_update_on_discharge(self, active_admission, test_user):
        """Should update bed status to AVAILABLE on discharge."""
        bed = active_admission.bed
        assert bed.status == "OCCUPIED"

        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Treatment completed successfully",
            patient_instructions="Follow discharge instructions",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        bed.refresh_from_db()
        assert bed.status == "AVAILABLE"

    def test_admission_status_update_on_discharge(self, active_admission, test_user):
        """Should update admission status to DISCHARGED."""
        assert active_admission.status == "ACTIVE"

        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Treatment completed",
            patient_instructions="Rest at home",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        active_admission.refresh_from_db()
        assert active_admission.status == "DISCHARGED"
        assert active_admission.discharge_date is not None

    def test_length_of_stay_calculation(self, active_admission, test_user):
        """Should calculate correct length of stay."""
        # Admission was 5 days ago
        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Successful treatment",
            patient_instructions="Follow up in 7 days",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        assert discharge.length_of_stay >= 5
        assert discharge.length_of_stay <= 6  # Allow for timing differences

    def test_discharge_medications_json_field(self, active_admission, test_user):
        """Should store discharge medications as JSON."""
        medications = [
            {"name": "Ibuprofen", "dosage": "400mg", "frequency": "TID", "duration": "5 days"},
            {"name": "Omeprazole", "dosage": "20mg", "frequency": "OD", "duration": "14 days"},
        ]

        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Treatment completed",
            discharge_medications=medications,
            patient_instructions="Take medications as prescribed",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        assert len(discharge.discharge_medications) == 2
        assert discharge.discharge_medications[0]["name"] == "Ibuprofen"
        assert discharge.discharge_medications[1]["dosage"] == "20mg"

    def test_follow_up_appointment_creation(self, active_admission, test_user):
        """Should support follow-up appointment scheduling."""
        follow_up_date = (timezone.now() + timedelta(days=14)).date()

        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Successful appendectomy",
            follow_up_date=follow_up_date,
            follow_up_instructions="Review wound healing and remove sutures",
            patient_instructions="Return in 2 weeks",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        assert discharge.follow_up_date == follow_up_date
        assert "sutures" in discharge.follow_up_instructions


@pytest.mark.django_db
class TestDischargeTypes:
    """Tests for different discharge types."""

    def test_normal_discharge(self, active_admission, test_user):
        """Should create normal discharge."""
        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Fully recovered",
            treatment_summary="Treatment successful",
            patient_instructions="Resume normal activities gradually",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        assert discharge.discharge_type == "NORMAL"

    def test_against_advice_discharge(self, active_admission, test_user):
        """Should document discharge against medical advice."""
        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="AGAINST_ADVICE",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Treatment incomplete - patient insisted on discharge",
            treatment_summary="Patient discharged against medical advice. Risks explained.",
            patient_instructions="Seek immediate medical attention if symptoms worsen",
            pharmacy_cleared=False,
            billing_cleared=True,
            lab_results_acknowledged=False,
        )

        assert discharge.discharge_type == "AGAINST_ADVICE"
        assert "treatment incomplete" in discharge.final_diagnosis_text.lower()

    def test_transferred_discharge(self, active_admission, test_user):
        """Should document transfer to another facility."""
        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="TRANSFERRED",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Transferred for specialized care",
            treatment_summary="Patient stabilized and transferred",
            referral_facility="Kenyatta National Hospital",
            referral_reason="Requires specialized surgical consultation",
            patient_instructions="Report to KNH within 24 hours",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        assert discharge.discharge_type == "TRANSFERRED"
        assert discharge.referral_facility == "Kenyatta National Hospital"

    def test_deceased_discharge(self, active_admission, test_user):
        """Should document deceased patient discharge."""
        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="DECEASED",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="R99",
            final_diagnosis_text="Death - cause under investigation",
            treatment_summary="Patient expired despite resuscitation efforts",
            patient_instructions="",
            pharmacy_cleared=True,
            billing_cleared=False,
            lab_results_acknowledged=True,
        )

        assert discharge.discharge_type == "DECEASED"
        active_admission.refresh_from_db()
        assert active_admission.status == "DECEASED"


@pytest.mark.django_db
class TestDischargeValidation:
    """Tests for discharge validation and business rules."""

    def test_prevent_multiple_discharge(self, active_admission, test_user):
        """Should prevent creating multiple discharges for same admission."""
        Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Treatment completed",
            patient_instructions="Rest at home",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        with pytest.raises(IntegrityError):
            Discharge.objects.create(
                admission=active_admission,
                discharge_type="NORMAL",
                discharge_date=timezone.now(),
                discharged_by=test_user,
                admission_diagnosis="K35.8",
                final_diagnosis="K35.8",
                final_diagnosis_text="Resolved",
                treatment_summary="Treatment completed",
                patient_instructions="Rest at home",
                pharmacy_cleared=True,
                billing_cleared=True,
                lab_results_acknowledged=True,
            )

    def test_discharge_date_not_before_admission(self, active_admission, test_user):
        """Should validate discharge date is not before admission date."""
        past_date = active_admission.admission_date - timedelta(days=1)

        discharge = Discharge(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=past_date,
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Treatment completed",
            patient_instructions="Rest",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        with pytest.raises(ValidationError, match="Discharge date cannot be before admission date"):
            discharge.clean()

    def test_clearance_requirements(self, active_admission, test_user):
        """Should validate clearances for normal discharge."""
        discharge = Discharge(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Treatment completed",
            patient_instructions="Rest at home",
            pharmacy_cleared=False,  # Missing clearance
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        with pytest.raises(ValidationError, match="All clearances required for normal discharge"):
            discharge.clean()


@pytest.mark.django_db
class TestDischargeQueries:
    """Tests for discharge query operations."""

    def test_discharge_string_representation(self, active_admission, test_user):
        """Should return proper string representation."""
        discharge = Discharge.objects.create(
            admission=active_admission,
            discharge_type="NORMAL",
            discharge_date=timezone.now(),
            discharged_by=test_user,
            admission_diagnosis="K35.8",
            final_diagnosis="K35.8",
            final_diagnosis_text="Resolved",
            treatment_summary="Treatment completed",
            patient_instructions="Rest",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )

        expected = f"Discharge: {active_admission.admission_number} - {discharge.discharge_type}"
        assert str(discharge) == expected

    def test_filter_discharges_by_type(self, sample_patient, sample_ward, test_user):
        """Should filter discharges by type."""
        # Get available beds from the ward (auto-generated)
        available_beds = list(sample_ward.beds.order_by("bed_number")[:3])

        # Create multiple admissions and discharges
        for i, (discharge_type, bed) in enumerate(
            zip(["NORMAL", "AGAINST_ADVICE", "TRANSFERRED"], available_beds, strict=False)
        ):
            bed.status = "OCCUPIED"
            bed.save()
            enc = Encounter.objects.create(
                patient=sample_patient,
                encounter_type="IPD",
                encounter_date=timezone.now().date(),
                chief_complaint=f"Case {i+1}",
            )
            admission = Admission.objects.create(
                patient=sample_patient,
                ipd_encounter=enc,
                admission_date=timezone.now() - timedelta(days=3),
                admitting_diagnosis="K35.8",
                admitting_diagnosis_text="Test",
                admitting_officer=test_user,
                ward=sample_ward,
                bed=bed,
                payer_type="CASH",
            )
            Discharge.objects.create(
                admission=admission,
                discharge_type=discharge_type,
                discharge_date=timezone.now(),
                discharged_by=test_user,
                admission_diagnosis="K35.8",
                final_diagnosis="K35.8",
                final_diagnosis_text="Test discharge",
                treatment_summary="Test",
                patient_instructions="Test",
                pharmacy_cleared=True,
                billing_cleared=True,
                lab_results_acknowledged=True,
            )

        normal_discharges = Discharge.objects.filter(discharge_type="NORMAL")
        assert normal_discharges.count() == 1
