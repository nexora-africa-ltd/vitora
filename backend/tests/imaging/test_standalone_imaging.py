"""
Tests for standalone Imaging capabilities.

Covers:
- Walk-in imaging patient registration (model, CRUD API)
- Standalone imaging order creation (no encounter required)
- HL7 ORM^O01 inbound imaging order ingestion
- External imaging order accept/reject workflow
- Walk-in → HMIS patient linking
- Billing decoupling
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
def walkin_patient_data():
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
def walkin_patient(db, test_user, sample_facility, sample_organization):
    from hmis.apps.imaging.standalone.models import WalkInImagingPatient

    return WalkInImagingPatient.objects.create(
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
def sample_imaging_procedure(db, sample_facility, sample_organization):
    from hmis.apps.imaging.models import ImagingProcedure

    return ImagingProcedure.objects.create(
        code="CXR",
        name="Chest X-Ray PA",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("500.00"),
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sample_hl7_orm_message():
    return (
        "MSH|^~\\&|ExternalEMR|Kenyatta Hospital|VitoraRad|Demo Clinic|20260507||"
        "ORM^O01|MSG-IMG-001|P|2.5\r"
        "PID|1||PAT001||Wanjiku^Jane||19900615|F\r"
        "ORC|NW|REF-12345|||ROUTINE|||R|||Dr. Ochieng^123\r"
        "OBR|1|REF-12345||CXR^Chest X-Ray PA||||||||||||||||||||||||||Cough\r"
    )


@pytest.fixture
def external_imaging_order(db, sample_facility, sample_organization):
    from hmis.apps.imaging.standalone.models import ExternalImagingOrderRequest

    return ExternalImagingOrderRequest.objects.create(
        message_control_id="MSG-IMG-002",
        sending_application="ExternalEMR",
        sending_facility="Nairobi Hospital",
        external_patient_id="EXT-PAT-001",
        patient_name="Jane Wanjiku",
        patient_dob=date(1990, 6, 15),
        patient_gender="F",
        patient_id_number="12345678",
        placer_order_number="EXT-REF-001",
        priority="ROUTINE",
        clinical_indication="Persistent cough",
        requested_procedures=[{"code": "CXR", "name": "Chest X-Ray PA", "laterality": "NA"}],
        raw_message="MSH|...",
        status=ExternalImagingOrderRequest.Status.RECEIVED,
        facility=sample_facility,
        organization=sample_organization,
    )


# =============================================================================
# Walk-In Imaging Patient Model Tests
# =============================================================================


class TestWalkInImagingPatientModel:
    def test_auto_generates_registration_number(self, walkin_patient):
        assert walkin_patient.registration_number.startswith("WLKR-")
        parts = walkin_patient.registration_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8
        assert len(parts[2]) == 4

    def test_full_name_property(self, walkin_patient):
        assert walkin_patient.full_name == "John Kamau"

    def test_str_representation(self, walkin_patient):
        result = str(walkin_patient)
        assert "John Kamau" in result
        assert "WLKR-" in result

    def test_sequential_registration_numbers(
        self, db, test_user, sample_facility, sample_organization
    ):
        from hmis.apps.imaging.standalone.models import WalkInImagingPatient

        p1 = WalkInImagingPatient.objects.create(
            first_name="A",
            last_name="B",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        p2 = WalkInImagingPatient.objects.create(
            first_name="C",
            last_name="D",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        seq1 = int(p1.registration_number.split("-")[-1])
        seq2 = int(p2.registration_number.split("-")[-1])
        assert seq2 == seq1 + 1


# =============================================================================
# Walk-In Imaging Patient API Tests
# =============================================================================


class TestWalkInImagingPatientAPI:
    def test_create_walkin_patient(self, authenticated_client, walkin_patient_data):
        response = authenticated_client.post(
            "/api/imaging/standalone/walkin-patients/",
            walkin_patient_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["registration_number"].startswith("WLKR-")
        assert response.data["first_name"] == "Jane"
        assert response.data["full_name"] == "Jane Wanjiku"

    def test_create_walkin_requires_auth(self, api_client, walkin_patient_data):
        response = api_client.post(
            "/api/imaging/standalone/walkin-patients/",
            walkin_patient_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_walkin_rejects_future_dob(self, authenticated_client, walkin_patient_data):
        walkin_patient_data["date_of_birth"] = "2030-01-01"
        response = authenticated_client.post(
            "/api/imaging/standalone/walkin-patients/",
            walkin_patient_data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_walkin_patients(self, authenticated_client, walkin_patient):
        response = authenticated_client.get("/api/imaging/standalone/walkin-patients/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_search_walkin_patients(self, authenticated_client, walkin_patient):
        response = authenticated_client.get("/api/imaging/standalone/walkin-patients/?search=Kamau")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
        assert response.data["results"][0]["last_name"] == "Kamau"

    def test_retrieve_walkin_patient(self, authenticated_client, walkin_patient):
        response = authenticated_client.get(
            f"/api/imaging/standalone/walkin-patients/{walkin_patient.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["registration_number"] == walkin_patient.registration_number

    def test_update_walkin_patient(self, authenticated_client, walkin_patient):
        response = authenticated_client.patch(
            f"/api/imaging/standalone/walkin-patients/{walkin_patient.id}/",
            {"phone_number": "0799999999"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["phone_number"] == "0799999999"

    def test_link_walkin_to_hmis_patient(
        self, authenticated_client, walkin_patient, sample_patient
    ):
        response = authenticated_client.post(
            f"/api/imaging/standalone/walkin-patients/{walkin_patient.id}/link-patient/",
            {"patient_id": sample_patient.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["linked_patient"] == sample_patient.id

    def test_link_walkin_invalid_patient(self, authenticated_client, walkin_patient):
        response = authenticated_client.post(
            f"/api/imaging/standalone/walkin-patients/{walkin_patient.id}/link-patient/",
            {"patient_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# Standalone Imaging Order Tests
# =============================================================================


class TestStandaloneImagingOrderAPI:
    def test_create_with_inline_walkin(self, authenticated_client, sample_imaging_procedure):
        data = {
            "walkin_name": "Test Patient",
            "walkin_phone": "0712000000",
            "walkin_gender": "M",
            "clinical_indication": "Routine screening",
            "items": [{"procedure_code": "CXR", "laterality": "NA"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_walkin"] is True
        assert response.data["walkin_patient_name"] == "Test Patient"
        assert response.data["encounter"] is None
        assert response.data["patient"] is None

    def test_create_with_walkin_patient_id(
        self, authenticated_client, walkin_patient, sample_imaging_procedure
    ):
        data = {
            "walkin_patient_id": walkin_patient.id,
            "clinical_indication": "Cough",
            "items": [{"procedure_code": "CXR"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["walkin_patient_name"] == walkin_patient.full_name

    def test_create_with_hmis_patient(
        self, authenticated_client, sample_patient, sample_imaging_procedure
    ):
        data = {
            "patient_id": sample_patient.id,
            "clinical_indication": "Chest pain",
            "items": [{"procedure_code": "CXR"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["patient"] == sample_patient.id
        assert response.data["encounter"] is None

    def test_requires_items(self, authenticated_client):
        data = {
            "walkin_name": "Test",
            "clinical_indication": "Test",
            "items": [],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_requires_clinical_indication(self, authenticated_client, sample_imaging_procedure):
        data = {
            "walkin_name": "Test",
            "items": [{"procedure_code": "CXR"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_requires_patient_ref(self, authenticated_client, sample_imaging_procedure):
        data = {
            "clinical_indication": "Test",
            "items": [{"procedure_code": "CXR"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_procedure_code(self, authenticated_client):
        data = {
            "walkin_name": "Test",
            "clinical_indication": "Test",
            "items": [{"procedure_code": "DOES_NOT_EXIST"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_walkin_id(self, authenticated_client, sample_imaging_procedure):
        data = {
            "walkin_patient_id": 99999,
            "clinical_indication": "Test",
            "items": [{"procedure_code": "CXR"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_does_not_bill_patient(self, authenticated_client, sample_imaging_procedure):
        from hmis.apps.imaging.models import ImagingOrder

        data = {
            "walkin_name": "No Bill",
            "clinical_indication": "Test",
            "items": [{"procedure_code": "CXR"}],
        }
        response = authenticated_client.post(
            "/api/imaging/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        order = ImagingOrder.objects.get(id=response.data["id"])
        assert order.bill_patient is False
        assert order.encounter is None


# =============================================================================
# HL7 ORM Ingestion Tests
# =============================================================================


class TestHL7ORMIngestion:
    def test_ingest_valid_orm_message(
        self, db, sample_hl7_orm_message, sample_facility, sample_organization
    ):
        from hmis.apps.imaging.standalone.services import ingest_hl7_orm_imaging

        ext_req = ingest_hl7_orm_imaging(
            sample_hl7_orm_message,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert ext_req.id is not None
        assert ext_req.message_control_id == "MSG-IMG-001"
        assert ext_req.sending_application == "ExternalEMR"
        assert ext_req.sending_facility == "Kenyatta Hospital"
        assert ext_req.patient_name == "Jane Wanjiku"
        assert ext_req.patient_gender == "F"
        assert ext_req.placer_order_number == "REF-12345"
        assert ext_req.status == "RECEIVED"
        assert len(ext_req.requested_procedures) == 1
        assert ext_req.requested_procedures[0]["code"] == "CXR"

    def test_ingest_orm_parses_patient_dob(
        self, db, sample_hl7_orm_message, sample_facility, sample_organization
    ):
        from hmis.apps.imaging.standalone.services import ingest_hl7_orm_imaging

        ext_req = ingest_hl7_orm_imaging(
            sample_hl7_orm_message,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert ext_req.patient_dob == date(1990, 6, 15)

    def test_ingest_orm_with_newlines(self, db, sample_facility, sample_organization):
        from hmis.apps.imaging.standalone.services import ingest_hl7_orm_imaging

        msg = (
            "MSH|^~\\&|EMR1|Hosp1|Vitora|Demo||ORM^O01|MSG-IMG-003|P|2.5\n"
            "PID|1||P100||Doe^John||19800101|M\n"
            "ORC|NW|REF-999|||ROUTINE|||R\n"
            "OBR|1|REF-999||CXR^Chest X-Ray||||||||||||||||||||||||||Cough\n"
        )
        ext_req = ingest_hl7_orm_imaging(
            msg, facility=sample_facility, organization=sample_organization
        )
        assert ext_req.patient_name == "John Doe"
        assert ext_req.patient_gender == "M"
        assert ext_req.placer_order_number == "REF-999"
        assert len(ext_req.requested_procedures) == 1


# =============================================================================
# External Imaging Order Workflow Tests
# =============================================================================


class TestExternalImagingOrderWorkflow:
    def test_list_external_orders(self, authenticated_client, external_imaging_order):
        response = authenticated_client.get("/api/imaging/standalone/external-orders/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_external_order(self, authenticated_client, external_imaging_order):
        response = authenticated_client.get(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["placer_order_number"] == "EXT-REF-001"
        assert response.data["status"] == "RECEIVED"

    def test_accept_external_order(
        self, authenticated_client, external_imaging_order, sample_imaging_procedure
    ):
        response = authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "accepted"
        assert response.data["imaging_order"] is not None
        assert response.data["imaging_order"]["is_walkin"] is True

        external_imaging_order.refresh_from_db()
        assert external_imaging_order.status == "ACCEPTED"
        assert external_imaging_order.imaging_order is not None
        assert external_imaging_order.walkin_patient is not None

    def test_accept_without_walkin_creation(
        self, authenticated_client, external_imaging_order, sample_imaging_procedure
    ):
        response = authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/accept/",
            {"auto_create_walkin": False},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        external_imaging_order.refresh_from_db()
        assert external_imaging_order.walkin_patient is None

    def test_reject_external_order(self, authenticated_client, external_imaging_order):
        response = authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/reject/",
            {"reason": "Equipment unavailable"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REJECTED"
        assert response.data["rejection_reason"] == "Equipment unavailable"

    def test_reject_requires_reason(self, authenticated_client, external_imaging_order):
        response = authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/reject/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_accept_already_processed(
        self, authenticated_client, external_imaging_order, sample_imaging_procedure
    ):
        authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        response = authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_reject_already_processed(
        self, authenticated_client, external_imaging_order, sample_imaging_procedure
    ):
        authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        response = authenticated_client.post(
            f"/api/imaging/standalone/external-orders/{external_imaging_order.id}/reject/",
            {"reason": "Changed mind"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Billing Decoupling
# =============================================================================


class TestImagingOrderBillingDecoupling:
    def test_order_without_encounter_succeeds(
        self,
        db,
        test_user,
        sample_imaging_procedure,
        sample_facility,
        sample_organization,
    ):
        from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem

        order = ImagingOrder.objects.create(
            patient=None,
            encounter=None,
            ordered_by=test_user,
            priority="ROUTINE",
            clinical_indication="Direct walk-in",
            status="ORDERED",
            is_walkin=True,
            walkin_patient_name="Direct Patient",
            bill_patient=False,
        )
        ImagingOrderItem.objects.create(
            order=order,
            procedure=sample_imaging_procedure,
            laterality="NA",
            unit_cost=sample_imaging_procedure.cost,
        )
        assert order.id is not None
        assert order.encounter is None
        assert order.patient is None
        assert order.is_walkin is True
        assert order.bill_patient is False


# =============================================================================
# Domain Events
# =============================================================================


class TestStandaloneImagingDomainEvents:
    def test_walkin_creation_publishes_event(
        self, db, test_user, sample_facility, sample_organization, mocker
    ):
        mock_publish = mocker.patch("hmis.apps.imaging.standalone.signals.publish_event")
        from hmis.apps.imaging.standalone.models import WalkInImagingPatient

        WalkInImagingPatient.objects.create(
            first_name="Event",
            last_name="Test",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called()
        call_kwargs = mock_publish.call_args.kwargs
        assert "walkin" in call_kwargs["event_type"]

    def test_external_order_creation_publishes_event(
        self, db, sample_facility, sample_organization, mocker
    ):
        mock_publish = mocker.patch("hmis.apps.imaging.standalone.signals.publish_event")
        from hmis.apps.imaging.standalone.models import ExternalImagingOrderRequest

        ExternalImagingOrderRequest.objects.create(
            message_control_id="EVT-IMG-001",
            sending_application="Test",
            sending_facility="Test Facility",
            patient_name="Event Patient",
            placer_order_number="EVT-EXT-001",
            requested_procedures=[{"code": "CXR"}],
            raw_message="MSH|...",
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called()
        call_kwargs = mock_publish.call_args.kwargs
        assert "external_order" in call_kwargs["event_type"]
