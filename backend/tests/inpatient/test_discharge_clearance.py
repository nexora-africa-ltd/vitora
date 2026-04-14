"""
Tests for automated discharge clearance.

Test Coverage:
- GET /api/inpatient/admissions/{id}/clearance-status/ endpoint
- Billing clearance: based on invoice balance
- Pharmacy clearance: based on prescription dispensing status
- Laboratory clearance: based on lab order completion status
- Nursing clearance: based on active nursing care plan entries
- DischargeSerializer validation blocks discharge when clearances fail
- DischargeSerializer auto-populates clearance booleans on success
- Against-advice / absconded discharges bypass clearance checks
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from hmis.apps.billing.models import Invoice
from hmis.apps.encounters.models import Encounter
from hmis.apps.inpatient.models import (
    Admission,
    Bed,
    Discharge,
    NursingCarePlanEntry,
    NursingKardex,
    Ward,
)
from hmis.apps.patients.models import Patient
from tests.conftest import ensure_staff_profile

User = get_user_model()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def discharge_user(db):
    """Create a user for discharge tests."""
    return User.objects.create_user(
        username="discharge_clearance_doc",
        password="test123",
        email="clearancedoc@example.com",
    )


@pytest.fixture
def discharge_patient(db, discharge_user, sample_county, sample_sub_county, sample_organization):
    """Create patient for discharge clearance tests."""
    return Patient.objects.create(
        first_name="Clearance",
        last_name="TestPatient",
        date_of_birth="1985-06-15",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        registered_by=discharge_user,
        organization=sample_organization,
    )


@pytest.fixture
def discharge_ward(db, sample_facility, sample_organization):
    """Create a ward for discharge tests."""
    return Ward.objects.create(
        name="Clearance Test Ward",
        code="CTW-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def discharge_bed(db, discharge_ward, discharge_user):
    """Create an occupied bed."""
    return Bed.objects.create(
        ward=discharge_ward,
        bed_number="CTW-B001",
        status="OCCUPIED",
        status_changed_by=discharge_user,
    )


@pytest.fixture
def clearance_admission(
    db,
    discharge_patient,
    discharge_ward,
    discharge_bed,
    discharge_user,
    sample_facility,
    sample_organization,
):
    """Create an active admission with IPD encounter for clearance tests."""
    ipd_encounter = Encounter.objects.create(
        patient=discharge_patient,
        encounter_type="IPD",
        encounter_date=timezone.now().date(),
        chief_complaint="Admitted for treatment",
        facility=sample_facility,
        organization=sample_organization,
    )

    return Admission.objects.create(
        patient=discharge_patient,
        ipd_encounter=ipd_encounter,
        admission_date=timezone.now() - timedelta(days=3),
        admitting_diagnosis="J18.9",
        admitting_diagnosis_text="Pneumonia",
        admitting_officer=discharge_user,
        ward=discharge_ward,
        bed=discharge_bed,
        payer_type="CASH",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def clearance_client(db, discharge_user, sample_organization, sample_facility):
    """Authenticated client for clearance tests."""
    from rest_framework.test import APIClient

    client = APIClient()
    ensure_staff_profile(discharge_user, sample_organization, sample_facility)
    client.force_authenticate(user=discharge_user)
    return client


# ============================================================================
# Clearance Status Endpoint Tests
# ============================================================================


@pytest.mark.django_db
class TestClearanceStatusEndpoint:
    """Tests for GET /api/inpatient/admissions/{id}/clearance-status/."""

    def test_clearance_status_requires_auth(self, api_client, clearance_admission):
        """Should require authentication."""
        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_all_clear_when_no_orders(self, clearance_client, clearance_admission):
        """Should report all cleared when no invoices, prescriptions, or lab orders exist."""
        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["billing"]["cleared"] is True
        assert data["pharmacy"]["cleared"] is True
        assert data["laboratory"]["cleared"] is True
        assert data["nursing"]["cleared"] is True
        assert data["all_cleared"] is True

    def test_billing_not_cleared_with_outstanding_invoice(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should report billing not cleared when there's an unpaid invoice."""
        Invoice.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            invoice_date=timezone.now().date(),
            due_date=(timezone.now() + timedelta(days=30)).date(),
            subtotal=Decimal("5000.00"),
            total_amount=Decimal("5000.00"),
            balance_due=Decimal("5000.00"),
            status="pending",
            created_by=discharge_user,
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["billing"]["cleared"] is False
        assert "5,000.00" in response.data["billing"]["reason"]
        assert response.data["billing"]["outstanding_amount"] >= 5000.00
        assert response.data["billing"]["invoice_count"] >= 1
        assert response.data["all_cleared"] is False

    def test_billing_cleared_when_invoice_paid(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should report billing cleared when invoice is fully paid."""
        Invoice.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            invoice_date=timezone.now().date(),
            due_date=(timezone.now() + timedelta(days=30)).date(),
            subtotal=Decimal("5000.00"),
            total_amount=Decimal("5000.00"),
            amount_paid=Decimal("5000.00"),
            balance_due=Decimal("0.00"),
            status="paid",
            created_by=discharge_user,
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["billing"]["cleared"] is True

    def test_pharmacy_not_cleared_with_pending_prescription(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should report pharmacy not cleared when prescriptions are pending."""
        from hmis.apps.pharmacy.models import Prescription

        Prescription.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            prescribed_by=discharge_user,
            status="PENDING",
            valid_until=date.today() + timedelta(days=30),
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["pharmacy"]["cleared"] is False
        assert response.data["pharmacy"]["pending_count"] == 1
        assert response.data["all_cleared"] is False

    def test_pharmacy_cleared_when_all_dispensed(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should report pharmacy cleared when all prescriptions are dispensed."""
        from hmis.apps.pharmacy.models import Prescription

        Prescription.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            prescribed_by=discharge_user,
            status="DISPENSED",
            valid_until=date.today() + timedelta(days=30),
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["pharmacy"]["cleared"] is True

    def test_lab_not_cleared_with_pending_orders(
        self,
        clearance_client,
        clearance_admission,
        discharge_user,
        sample_facility,
        sample_organization,
    ):
        """Should report lab not cleared when lab orders are pending."""
        from hmis.apps.laboratory.models import LabOrder

        LabOrder.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            ordered_by=discharge_user,
            status="ORDERED",
            facility=sample_facility,
            organization=sample_organization,
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["laboratory"]["cleared"] is False
        assert response.data["laboratory"]["pending_count"] == 1
        assert response.data["all_cleared"] is False

    def test_lab_cleared_when_all_completed(
        self,
        clearance_client,
        clearance_admission,
        discharge_user,
        sample_facility,
        sample_organization,
    ):
        """Should report lab cleared when all lab orders are completed."""
        from hmis.apps.laboratory.models import LabOrder

        LabOrder.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            ordered_by=discharge_user,
            status="COMPLETED",
            facility=sample_facility,
            organization=sample_organization,
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["laboratory"]["cleared"] is True

    def test_nursing_not_cleared_with_active_care_plans(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should report nursing not cleared when there are active care plan entries."""
        kardex, _ = NursingKardex.objects.get_or_create(admission=clearance_admission)
        NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=discharge_user,
            assessment="Patient has fever",
            nursing_diagnosis="Hyperthermia",
            goal_and_outcome_criteria="Temperature normalizes within 24 hours",
            plan_of_action="Administer antipyretics, tepid sponging",
            scientific_rationale="Reduce body temperature",
            status="ACTIVE",
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["nursing"]["cleared"] is False
        assert response.data["nursing"]["pending_count"] == 1
        assert response.data["all_cleared"] is False

    def test_nursing_cleared_when_all_resolved(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should report nursing cleared when all care plan entries are resolved."""
        kardex, _ = NursingKardex.objects.get_or_create(admission=clearance_admission)
        NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=discharge_user,
            assessment="Patient had fever",
            nursing_diagnosis="Hyperthermia",
            goal_and_outcome_criteria="Temperature normalized",
            plan_of_action="Antipyretics administered",
            scientific_rationale="Temperature control",
            status="RESOLVED",
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["nursing"]["cleared"] is True

    def test_mixed_clearance_status(
        self,
        clearance_client,
        clearance_admission,
        discharge_user,
        sample_facility,
        sample_organization,
    ):
        """Should correctly report mixed statuses across departments."""
        from hmis.apps.laboratory.models import LabOrder
        from hmis.apps.pharmacy.models import Prescription

        # Pharmacy: dispensed -> cleared
        Prescription.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            prescribed_by=discharge_user,
            status="DISPENSED",
            valid_until=date.today() + timedelta(days=30),
        )

        # Lab: still pending -> not cleared
        LabOrder.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            ordered_by=discharge_user,
            status="IN_PROGRESS",
            facility=sample_facility,
            organization=sample_organization,
        )

        url = f"/api/inpatient/admissions/{clearance_admission.id}/clearance-status/"
        response = clearance_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["billing"]["cleared"] is True
        assert response.data["pharmacy"]["cleared"] is True
        assert response.data["laboratory"]["cleared"] is False
        assert response.data["nursing"]["cleared"] is True
        assert response.data["all_cleared"] is False


# ============================================================================
# Discharge Serializer Automated Validation Tests
# ============================================================================


@pytest.mark.django_db
class TestDischargeAutomatedClearance:
    """Tests for automated clearance validation in DischargeSerializer."""

    def test_discharge_blocked_by_unpaid_invoice(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should reject normal discharge when billing not cleared."""
        Invoice.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            invoice_date=timezone.now().date(),
            due_date=(timezone.now() + timedelta(days=30)).date(),
            subtotal=Decimal("3000.00"),
            total_amount=Decimal("3000.00"),
            balance_due=Decimal("3000.00"),
            status="pending",
            created_by=discharge_user,
        )

        response = clearance_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": clearance_admission.id,
                "discharge_type": "NORMAL",
                "discharge_date": timezone.now().isoformat(),
                "discharged_by": discharge_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Pneumonia resolved",
                "treatment_summary": "IV antibiotics completed",
                "patient_instructions": "Rest at home",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "billing_cleared" in response.data

    def test_discharge_blocked_by_pending_prescription(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should reject normal discharge when pharmacy not cleared."""
        from hmis.apps.pharmacy.models import Prescription

        Prescription.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            prescribed_by=discharge_user,
            status="PENDING",
            valid_until=date.today() + timedelta(days=30),
        )

        response = clearance_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": clearance_admission.id,
                "discharge_type": "NORMAL",
                "discharge_date": timezone.now().isoformat(),
                "discharged_by": discharge_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Pneumonia resolved",
                "treatment_summary": "IV antibiotics completed",
                "patient_instructions": "Rest at home",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "pharmacy_cleared" in response.data

    def test_discharge_blocked_by_pending_lab_order(
        self,
        clearance_client,
        clearance_admission,
        discharge_user,
        sample_facility,
        sample_organization,
    ):
        """Should reject normal discharge when lab results pending."""
        from hmis.apps.laboratory.models import LabOrder

        LabOrder.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            ordered_by=discharge_user,
            status="ORDERED",
            facility=sample_facility,
            organization=sample_organization,
        )

        response = clearance_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": clearance_admission.id,
                "discharge_type": "NORMAL",
                "discharge_date": timezone.now().isoformat(),
                "discharged_by": discharge_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Pneumonia resolved",
                "treatment_summary": "IV antibiotics completed",
                "patient_instructions": "Rest at home",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "lab_results_acknowledged" in response.data

    def test_normal_discharge_succeeds_when_all_clear(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Should allow normal discharge when all clearances pass."""
        response = clearance_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": clearance_admission.id,
                "discharge_type": "NORMAL",
                "discharge_date": timezone.now().isoformat(),
                "discharged_by": discharge_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Pneumonia resolved",
                "treatment_summary": "IV antibiotics completed successfully",
                "patient_instructions": "Rest, increase fluids, follow up in 2 weeks",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Clearance booleans should be auto-populated
        assert response.data["pharmacy_cleared"] is True
        assert response.data["billing_cleared"] is True
        assert response.data["lab_results_acknowledged"] is True

    def test_against_advice_discharge_bypasses_clearance(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Against-advice discharge should bypass clearance checks."""
        from hmis.apps.pharmacy.models import Prescription

        # Create a pending prescription that would block normal discharge
        Prescription.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            prescribed_by=discharge_user,
            status="PENDING",
            valid_until=date.today() + timedelta(days=30),
        )

        response = clearance_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": clearance_admission.id,
                "discharge_type": "AGAINST_ADVICE",
                "discharge_date": timezone.now().isoformat(),
                "discharged_by": discharge_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Pneumonia - leaving against advice",
                "treatment_summary": "Patient insists on leaving despite incomplete treatment",
                "patient_instructions": "Return immediately if symptoms worsen",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_absconded_discharge_bypasses_clearance(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Absconded discharge should bypass clearance checks."""
        Invoice.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            invoice_date=timezone.now().date(),
            due_date=(timezone.now() + timedelta(days=30)).date(),
            subtotal=Decimal("10000.00"),
            total_amount=Decimal("10000.00"),
            balance_due=Decimal("10000.00"),
            status="pending",
            created_by=discharge_user,
        )

        response = clearance_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": clearance_admission.id,
                "discharge_type": "ABSCONDED",
                "discharge_date": timezone.now().isoformat(),
                "discharged_by": discharge_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Patient absconded",
                "treatment_summary": "Patient left without notice",
                "patient_instructions": "N/A - patient absconded",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_deceased_discharge_bypasses_clearance(
        self, clearance_client, clearance_admission, discharge_user
    ):
        """Deceased discharge should bypass clearance checks."""
        from hmis.apps.pharmacy.models import Prescription

        Prescription.objects.create(
            patient=clearance_admission.patient,
            encounter=clearance_admission.ipd_encounter,
            admission=clearance_admission,
            prescribed_by=discharge_user,
            status="PENDING",
            valid_until=date.today() + timedelta(days=30),
        )

        response = clearance_client.post(
            "/api/inpatient/discharges/",
            {
                "admission": clearance_admission.id,
                "discharge_type": "DECEASED",
                "discharge_date": timezone.now().isoformat(),
                "discharged_by": discharge_user.id,
                "admission_diagnosis": "J18.9",
                "final_diagnosis": "J18.9",
                "final_diagnosis_text": "Deceased",
                "treatment_summary": "Patient passed away during treatment",
                "patient_instructions": "N/A",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
