"""
Tests for standalone Pharmacy capabilities.

Covers:
- Walk-in customer registration (model, CRUD API)
- Standalone prescription creation (no encounter required)
- HL7 RDE^O11 inbound prescription ingestion
- External prescription accept/reject workflow
- Walk-in → HMIS patient linking
- Billing decoupling (standalone prescriptions don't auto-bill)
- Domain event publication
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def walkin_customer_data():
    return {
        "first_name": "Jane",
        "last_name": "Wanjiku",
        "date_of_birth": "1990-06-15",
        "gender": "F",
        "phone_number": "0712345678",
        "national_id": "12345678",
        "id_type": "NATIONAL_ID",
        "referring_facility": "Kenyatta National Hospital",
        "referring_clinician": "Dr. Ochieng",
    }


@pytest.fixture
def walkin_customer(db, test_user, sample_facility, sample_organization):
    from hmis.apps.pharmacy.standalone.models import WalkInCustomer

    return WalkInCustomer.objects.create(
        first_name="John",
        last_name="Kamau",
        date_of_birth=date(1985, 3, 20),
        gender="M",
        phone_number="0723456789",
        national_id="87654321",
        id_type="NATIONAL_ID",
        registered_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sample_drug(db):
    from hmis.apps.pharmacy.models import Drug

    return Drug.objects.create(
        code="PARA500",
        generic_name="Paracetamol",
        strength="500mg",
        form="TABLET",
        category="ANALGESIC",
        schedule="OTC",
        unit="tablet",
        requires_prescription=False,
        default_reorder_level=50,
        default_reorder_quantity=100,
        reference_price=Decimal("10.00"),
    )


@pytest.fixture
def sample_hl7_rde_message():
    return (
        "MSH|^~\\&|ExternalEMR|Kenyatta Hospital|VitoraPharm|Demo Clinic|20260507||"
        "RDE^O11|MSG-RX-001|P|2.5\r"
        "PID|1||PAT001||Wanjiku^Jane||19900615|F\r"
        "ORC|NW|RX-12345|||ROUTINE|||R|||Dr. Ochieng^123\r"
        "RXE||PARA500^Paracetamol|500|tablet||||||20\r"
    )


@pytest.fixture
def external_prescription(db, sample_facility, sample_organization, sample_drug):
    from hmis.apps.pharmacy.standalone.models import ExternalPrescriptionRequest

    return ExternalPrescriptionRequest.objects.create(
        message_control_id="MSG-RX-002",
        sending_application="ExternalEMR",
        sending_facility="Nairobi Hospital",
        external_patient_id="EXT-PAT-001",
        patient_name="Jane Wanjiku",
        patient_dob=date(1990, 6, 15),
        patient_gender="F",
        patient_id_number="12345678",
        external_prescription_number="EXT-RX-001",
        priority="ROUTINE",
        clinical_info="Headache",
        requested_items=[
            {
                "drug_code": "PARA500",
                "drug_name": "Paracetamol",
                "dose": "1 tablet",
                "frequency": "TDS",
                "duration": "5 days",
                "quantity": 15,
            }
        ],
        raw_message="MSH|...",
        status=ExternalPrescriptionRequest.Status.RECEIVED,
        facility=sample_facility,
        organization=sample_organization,
    )


# =============================================================================
# Walk-In Customer Model Tests
# =============================================================================


class TestWalkInCustomerModel:
    def test_auto_generates_registration_number(self, walkin_customer):
        assert walkin_customer.registration_number.startswith("WLKC-")
        parts = walkin_customer.registration_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4

    def test_full_name_property(self, walkin_customer):
        assert walkin_customer.full_name == "John Kamau"

    def test_str_representation(self, walkin_customer):
        result = str(walkin_customer)
        assert "John Kamau" in result
        assert "WLKC-" in result

    def test_sequential_registration_numbers(
        self, db, test_user, sample_facility, sample_organization
    ):
        from hmis.apps.pharmacy.standalone.models import WalkInCustomer

        c1 = WalkInCustomer.objects.create(
            first_name="A",
            last_name="B",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        c2 = WalkInCustomer.objects.create(
            first_name="C",
            last_name="D",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        seq1 = int(c1.registration_number.split("-")[-1])
        seq2 = int(c2.registration_number.split("-")[-1])
        assert seq2 == seq1 + 1


# =============================================================================
# Walk-In Customer API Tests
# =============================================================================


class TestWalkInCustomerAPI:
    def test_create_walkin_customer(self, authenticated_client, walkin_customer_data):
        response = authenticated_client.post(
            "/api/pharmacy/standalone/walkin-customers/",
            walkin_customer_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["registration_number"].startswith("WLKC-")
        assert response.data["first_name"] == "Jane"
        assert response.data["full_name"] == "Jane Wanjiku"

    def test_create_walkin_requires_auth(self, api_client, walkin_customer_data):
        response = api_client.post(
            "/api/pharmacy/standalone/walkin-customers/",
            walkin_customer_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_walkin_rejects_future_dob(self, authenticated_client, walkin_customer_data):
        walkin_customer_data["date_of_birth"] = "2030-01-01"
        response = authenticated_client.post(
            "/api/pharmacy/standalone/walkin-customers/",
            walkin_customer_data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_walkin_customers(self, authenticated_client, walkin_customer):
        response = authenticated_client.get("/api/pharmacy/standalone/walkin-customers/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_search_walkin_customers(self, authenticated_client, walkin_customer):
        response = authenticated_client.get(
            "/api/pharmacy/standalone/walkin-customers/?search=Kamau"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
        assert response.data["results"][0]["last_name"] == "Kamau"

    def test_retrieve_walkin_customer(self, authenticated_client, walkin_customer):
        response = authenticated_client.get(
            f"/api/pharmacy/standalone/walkin-customers/{walkin_customer.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["registration_number"] == walkin_customer.registration_number

    def test_update_walkin_customer(self, authenticated_client, walkin_customer):
        response = authenticated_client.patch(
            f"/api/pharmacy/standalone/walkin-customers/{walkin_customer.id}/",
            {"phone_number": "0799999999"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["phone_number"] == "0799999999"

    def test_link_walkin_to_hmis_patient(
        self, authenticated_client, walkin_customer, sample_patient
    ):
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/walkin-customers/{walkin_customer.id}/link-patient/",
            {"patient_id": sample_patient.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["linked_patient"] == sample_patient.id

    def test_link_walkin_invalid_patient(self, authenticated_client, walkin_customer):
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/walkin-customers/{walkin_customer.id}/link-patient/",
            {"patient_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# Standalone Prescription Tests
# =============================================================================


class TestStandalonePrescriptionAPI:
    def test_create_with_inline_walkin(self, authenticated_client, sample_drug):
        data = {
            "walkin_name": "Test Customer",
            "walkin_phone": "0712000000",
            "walkin_gender": "M",
            "prescriber_name": "Dr. External",
            "clinical_notes": "Routine",
            "items": [
                {
                    "drug_code": "PARA500",
                    "dosage": "1 tablet",
                    "frequency": "TDS",
                    "duration": "5 days",
                    "quantity": 15,
                }
            ],
        }
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_walkin"] is True
        assert response.data["walkin_customer_name"] == "Test Customer"
        assert response.data["encounter"] is None
        assert response.data["patient"] is None

    def test_create_with_walkin_customer_id(
        self, authenticated_client, walkin_customer, sample_drug
    ):
        data = {
            "walkin_customer_id": walkin_customer.id,
            "items": [
                {
                    "drug_code": "PARA500",
                    "dosage": "1 tablet",
                    "frequency": "BD",
                    "duration": "3 days",
                    "quantity": 6,
                }
            ],
        }
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["walkin_customer_name"] == walkin_customer.full_name

    def test_create_with_hmis_patient(self, authenticated_client, sample_patient, sample_drug):
        data = {
            "patient_id": sample_patient.id,
            "clinical_notes": "OTC dispense",
            "items": [
                {
                    "drug_code": "PARA500",
                    "dosage": "1 tablet",
                    "frequency": "QID",
                    "duration": "7 days",
                    "quantity": 28,
                }
            ],
        }
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["patient"] == sample_patient.id
        assert response.data["encounter"] is None

    def test_requires_items(self, authenticated_client):
        data = {"walkin_name": "Test", "items": []}
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_requires_patient_ref(self, authenticated_client, sample_drug):
        data = {
            "items": [
                {
                    "drug_code": "PARA500",
                    "dosage": "1 tab",
                    "frequency": "BD",
                    "duration": "3 days",
                    "quantity": 6,
                }
            ]
        }
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_drug_code(self, authenticated_client):
        data = {
            "walkin_name": "Test",
            "items": [
                {
                    "drug_code": "DOES_NOT_EXIST",
                    "dosage": "1",
                    "frequency": "OD",
                    "duration": "1 day",
                    "quantity": 1,
                }
            ],
        }
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_walkin_id(self, authenticated_client, sample_drug):
        data = {
            "walkin_customer_id": 99999,
            "items": [
                {
                    "drug_code": "PARA500",
                    "dosage": "1",
                    "frequency": "OD",
                    "duration": "1 day",
                    "quantity": 1,
                }
            ],
        }
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_does_not_create_invoice(self, authenticated_client, sample_drug):
        from hmis.apps.pharmacy.models import Prescription

        data = {
            "walkin_name": "No Bill",
            "items": [
                {
                    "drug_code": "PARA500",
                    "dosage": "1 tab",
                    "frequency": "OD",
                    "duration": "1 day",
                    "quantity": 1,
                }
            ],
        }
        response = authenticated_client.post(
            "/api/pharmacy/standalone/prescriptions/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        rx = Prescription.objects.get(id=response.data["id"])
        assert rx.bill_patient is False
        assert rx.encounter is None


# =============================================================================
# HL7 RDE Ingestion Tests
# =============================================================================


class TestHL7RDEIngestion:
    def test_ingest_valid_rde_message(
        self, db, sample_hl7_rde_message, sample_facility, sample_organization
    ):
        from hmis.apps.pharmacy.standalone.services import ingest_hl7_rde

        ext_req = ingest_hl7_rde(
            sample_hl7_rde_message,
            facility=sample_facility,
            organization=sample_organization,
        )

        assert ext_req.id is not None
        assert ext_req.message_control_id == "MSG-RX-001"
        assert ext_req.sending_application == "ExternalEMR"
        assert ext_req.sending_facility == "Kenyatta Hospital"
        assert ext_req.patient_name == "Jane Wanjiku"
        assert ext_req.patient_gender == "F"
        assert ext_req.external_prescription_number == "RX-12345"
        assert ext_req.status == "RECEIVED"
        assert len(ext_req.requested_items) == 1
        assert ext_req.requested_items[0]["drug_code"] == "PARA500"

    def test_ingest_rde_parses_patient_dob(
        self, db, sample_hl7_rde_message, sample_facility, sample_organization
    ):
        from hmis.apps.pharmacy.standalone.services import ingest_hl7_rde

        ext_req = ingest_hl7_rde(
            sample_hl7_rde_message,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert ext_req.patient_dob == date(1990, 6, 15)

    def test_ingest_rde_with_newlines(self, db, sample_facility, sample_organization):
        from hmis.apps.pharmacy.standalone.services import ingest_hl7_rde

        msg = (
            "MSH|^~\\&|EMR1|Hosp1|Vitora|Demo||RDE^O11|MSG-RX-003|P|2.5\n"
            "PID|1||P100||Doe^John||19800101|M\n"
            "ORC|NW|RX-999|||ROUTINE|||R\n"
            "RXE||AMOX500^Amoxicillin|500|capsule||||||21\n"
        )
        ext_req = ingest_hl7_rde(msg, facility=sample_facility, organization=sample_organization)
        assert ext_req.patient_name == "John Doe"
        assert ext_req.patient_gender == "M"
        assert ext_req.external_prescription_number == "RX-999"
        assert len(ext_req.requested_items) == 1


# =============================================================================
# External Prescription Workflow Tests
# =============================================================================


class TestExternalPrescriptionWorkflow:
    def test_list_external_prescriptions(self, authenticated_client, external_prescription):
        response = authenticated_client.get("/api/pharmacy/standalone/external-prescriptions/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_external_prescription(self, authenticated_client, external_prescription):
        response = authenticated_client.get(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["external_prescription_number"] == "EXT-RX-001"
        assert response.data["status"] == "RECEIVED"

    def test_accept_external_prescription(
        self, authenticated_client, external_prescription, sample_drug
    ):
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "accepted"
        assert response.data["prescription"] is not None
        assert response.data["prescription"]["is_walkin"] is True

        external_prescription.refresh_from_db()
        assert external_prescription.status == "ACCEPTED"
        assert external_prescription.prescription is not None
        assert external_prescription.walkin_customer is not None

    def test_accept_without_walkin_creation(
        self, authenticated_client, external_prescription, sample_drug
    ):
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/accept/",
            {"auto_create_walkin": False},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        external_prescription.refresh_from_db()
        assert external_prescription.walkin_customer is None

    def test_reject_external_prescription(self, authenticated_client, external_prescription):
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/reject/",
            {"reason": "Drug out of stock"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REJECTED"
        assert response.data["rejection_reason"] == "Drug out of stock"

    def test_reject_requires_reason(self, authenticated_client, external_prescription):
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/reject/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_accept_already_processed(
        self, authenticated_client, external_prescription, sample_drug
    ):
        authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_reject_already_processed(
        self, authenticated_client, external_prescription, sample_drug
    ):
        authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        response = authenticated_client.post(
            f"/api/pharmacy/standalone/external-prescriptions/{external_prescription.id}/reject/",
            {"reason": "Changed mind"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Billing Decoupling
# =============================================================================


class TestPrescriptionBillingDecoupling:
    def test_prescription_without_encounter_succeeds(
        self, db, test_user, sample_drug, sample_facility, sample_organization
    ):
        from datetime import timedelta

        from hmis.apps.pharmacy.models import Prescription, PrescriptionItem

        rx = Prescription.objects.create(
            patient=None,
            encounter=None,
            prescribed_by=test_user,
            valid_until=date.today() + timedelta(days=30),
            is_walkin=True,
            walkin_customer_name="Direct Customer",
            bill_patient=False,
            facility=sample_facility,
            organization=sample_organization,
        )
        PrescriptionItem.objects.create(
            prescription=rx,
            drug=sample_drug,
            dosage="1 tab",
            frequency="OD",
            duration="1 day",
            quantity=1,
        )
        assert rx.id is not None
        assert rx.encounter is None
        assert rx.patient is None
        assert rx.is_walkin is True
        assert rx.bill_patient is False


# =============================================================================
# Domain Events
# =============================================================================


class TestStandalonePharmacyDomainEvents:
    def test_walkin_creation_publishes_event(
        self, db, test_user, sample_facility, sample_organization, mocker
    ):
        mock_publish = mocker.patch("hmis.apps.pharmacy.standalone.signals.publish_event")
        from hmis.apps.pharmacy.standalone.models import WalkInCustomer

        WalkInCustomer.objects.create(
            first_name="Event",
            last_name="Test",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called()
        call_kwargs = mock_publish.call_args.kwargs
        assert "walkin" in call_kwargs["event_type"]

    def test_external_prescription_creation_publishes_event(
        self, db, sample_facility, sample_organization, mocker
    ):
        mock_publish = mocker.patch("hmis.apps.pharmacy.standalone.signals.publish_event")
        from hmis.apps.pharmacy.standalone.models import ExternalPrescriptionRequest

        ExternalPrescriptionRequest.objects.create(
            message_control_id="EVT-RX-001",
            sending_application="Test",
            sending_facility="Test Facility",
            patient_name="Event Patient",
            external_prescription_number="EVT-EXT-001",
            requested_items=[{"drug_code": "PARA500"}],
            raw_message="MSH|...",
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called()
        call_kwargs = mock_publish.call_args.kwargs
        assert "external_prescription" in call_kwargs["event_type"]
