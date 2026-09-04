"""
Tests for standalone LIS capabilities.

Covers:
- Walk-in patient registration (model, CRUD API)
- Standalone lab order creation (no encounter required)
- HL7 ORM^O01 inbound order ingestion
- External order accept/reject workflow
- Walk-in → HMIS patient linking
- Billing decoupling (standalone orders don't auto-bill)
"""

import json
from datetime import date

import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def walkin_patient_data():
    """Valid walk-in patient registration data."""
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
    """Create a persisted walk-in patient."""
    from hmis.apps.laboratory.standalone.models import WalkInPatient

    return WalkInPatient.objects.create(
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
def sample_hl7_orm_message():
    """Valid HL7 ORM^O01 message for testing inbound order ingestion."""
    return (
        "MSH|^~\\&|ExternalLIS|Kenyatta Lab|VitoraLIS|Demo Clinic|20260507||"
        "ORM^O01|MSG001|P|2.5\r"
        "PID|1||PAT001||Wanjiku^Jane||19900615|F\r"
        "ORC|NW|ORD12345|||ROUTINE|||R\r"
        "OBR|1|ORD12345||CBC^Complete Blood Count|||||||||||Clinical notes here\r"
        "OBR|2|ORD12345||BMP^Basic Metabolic Panel\r"
    )


@pytest.fixture
def external_order(db, sample_facility, sample_organization, sample_test_catalog):
    """Create an ExternalOrderRequest for testing accept/reject."""
    from hmis.apps.laboratory.standalone.models import ExternalOrderRequest

    return ExternalOrderRequest.objects.create(
        message_control_id="MSG002",
        sending_application="ExternalLIS",
        sending_facility="Nairobi Hospital",
        external_patient_id="EXT-PAT-001",
        patient_name="Jane Wanjiku",
        patient_dob=date(1990, 6, 15),
        patient_gender="F",
        patient_id_number="12345678",
        placer_order_number="ORD-EXT-001",
        order_priority="ROUTINE",
        clinical_info="Suspected anemia",
        requested_tests=[{"code": "CBC", "name": "Complete Blood Count"}],
        raw_message="MSH|...",
        status=ExternalOrderRequest.Status.RECEIVED,
        facility=sample_facility,
        organization=sample_organization,
    )


# =============================================================================
# Walk-In Patient Model Tests
# =============================================================================


class TestWalkInPatientModel:
    """Tests for the WalkInPatient model."""

    def test_auto_generates_registration_number(self, walkin_patient):
        """Walk-in patients get auto-generated WLKN-YYYYMMDD-XXXX numbers."""
        assert walkin_patient.registration_number.startswith("WLKN-")
        parts = walkin_patient.registration_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX sequence

    def test_full_name_property(self, walkin_patient):
        """full_name returns first + last name."""
        assert walkin_patient.full_name == "John Kamau"

    def test_str_representation(self, walkin_patient):
        """__str__ includes name and registration number."""
        result = str(walkin_patient)
        assert "John Kamau" in result
        assert "WLKN-" in result

    def test_sequential_registration_numbers(
        self, db, test_user, sample_facility, sample_organization
    ):
        """Multiple walk-ins on the same day get sequential numbers."""
        from hmis.apps.laboratory.standalone.models import WalkInPatient

        p1 = WalkInPatient.objects.create(
            first_name="A",
            last_name="B",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        p2 = WalkInPatient.objects.create(
            first_name="C",
            last_name="D",
            registered_by=test_user,
            facility=sample_facility,
            organization=sample_organization,
        )
        # They share the same date prefix but different sequences
        assert p1.registration_number[:-4] == p2.registration_number[:-4]
        seq1 = int(p1.registration_number.split("-")[-1])
        seq2 = int(p2.registration_number.split("-")[-1])
        assert seq2 == seq1 + 1


# =============================================================================
# Walk-In Patient API Tests
# =============================================================================


class TestWalkInPatientAPI:
    """Tests for walk-in patient CRUD endpoints."""

    def test_create_walkin_patient(self, authenticated_client, walkin_patient_data):
        """POST /api/lab/standalone/walkin-patients/ creates a walk-in patient."""
        response = authenticated_client.post(
            "/api/lab/standalone/walkin-patients/",
            walkin_patient_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["registration_number"].startswith("WLKN-")
        assert response.data["first_name"] == "Jane"
        assert response.data["last_name"] == "Wanjiku"
        assert response.data["full_name"] == "Jane Wanjiku"

    def test_create_walkin_requires_auth(self, api_client, walkin_patient_data):
        """Unauthenticated requests are rejected."""
        response = api_client.post(
            "/api/lab/standalone/walkin-patients/",
            walkin_patient_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_walkin_rejects_future_dob(self, authenticated_client, walkin_patient_data):
        """Future date of birth is rejected."""
        walkin_patient_data["date_of_birth"] = "2030-01-01"
        response = authenticated_client.post(
            "/api/lab/standalone/walkin-patients/",
            walkin_patient_data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_walkin_patients(self, authenticated_client, walkin_patient):
        """GET /api/lab/standalone/walkin-patients/ lists walk-in patients."""
        response = authenticated_client.get("/api/lab/standalone/walkin-patients/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_search_walkin_patients(self, authenticated_client, walkin_patient):
        """Search filter works on name, phone, national_id."""
        response = authenticated_client.get("/api/lab/standalone/walkin-patients/?search=Kamau")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
        assert response.data["results"][0]["last_name"] == "Kamau"

    def test_retrieve_walkin_patient(self, authenticated_client, walkin_patient):
        """GET /api/lab/standalone/walkin-patients/{id}/ returns detail."""
        response = authenticated_client.get(
            f"/api/lab/standalone/walkin-patients/{walkin_patient.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["registration_number"] == walkin_patient.registration_number

    def test_update_walkin_patient(self, authenticated_client, walkin_patient):
        """PATCH updates walk-in patient details."""
        response = authenticated_client.patch(
            f"/api/lab/standalone/walkin-patients/{walkin_patient.id}/",
            {"phone_number": "0799999999"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["phone_number"] == "0799999999"

    def test_link_walkin_to_hmis_patient(
        self, authenticated_client, walkin_patient, sample_patient
    ):
        """POST link-patient/ links walk-in to a full HMIS patient."""
        response = authenticated_client.post(
            f"/api/lab/standalone/walkin-patients/{walkin_patient.id}/link-patient/",
            {"patient_id": sample_patient.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["linked_patient"] == sample_patient.id

    def test_link_walkin_invalid_patient(self, authenticated_client, walkin_patient):
        """Linking to non-existent patient returns 404."""
        response = authenticated_client.post(
            f"/api/lab/standalone/walkin-patients/{walkin_patient.id}/link-patient/",
            {"patient_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# Standalone Order Creation Tests
# =============================================================================


class TestStandaloneOrderAPI:
    """Tests for standalone lab order creation (no encounter required)."""

    def test_create_standalone_order_with_inline_walkin(
        self, authenticated_client, sample_test_catalog
    ):
        """Create order with inline walk-in patient details (no prior registration)."""
        data = {
            "walkin_name": "Test Patient",
            "walkin_phone": "0712000000",
            "walkin_gender": "M",
            "priority": "ROUTINE",
            "clinical_notes": "Routine screening",
            "items": [{"test_code": "CBC"}],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_walkin"] is True
        assert response.data["walkin_patient_name"] == "Test Patient"
        assert response.data["encounter"] is None
        assert response.data["patient"] is not None

    def test_create_standalone_order_with_walkin_patient_id(
        self, authenticated_client, walkin_patient, sample_test_catalog
    ):
        """Create order referencing an existing walk-in patient."""
        data = {
            "walkin_patient_id": walkin_patient.id,
            "priority": "URGENT",
            "items": [{"test_code": "CBC"}],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["walkin_patient_name"] == walkin_patient.full_name

    def test_create_standalone_order_with_hmis_patient(
        self, authenticated_client, sample_patient, sample_test_catalog
    ):
        """Create standalone order for an existing HMIS patient (no encounter)."""
        data = {
            "patient_id": sample_patient.id,
            "priority": "STAT",
            "clinical_notes": "Emergency lab work",
            "items": [{"test_code": "CBC"}],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["patient"] == sample_patient.id
        assert response.data["encounter"] is None

    def test_create_standalone_order_requires_items(self, authenticated_client):
        """Order creation fails without test items."""
        data = {
            "walkin_name": "Test Patient",
            "items": [],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_standalone_order_requires_patient_ref(
        self, authenticated_client, sample_test_catalog
    ):
        """Order fails without any patient reference."""
        data = {
            "priority": "ROUTINE",
            "items": [{"test_code": "CBC"}],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_standalone_order_invalid_test_code(self, authenticated_client):
        """Order fails with invalid test code."""
        data = {
            "walkin_name": "Test Patient",
            "items": [{"test_code": "NONEXISTENT_TEST"}],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_standalone_order_invalid_walkin_id(
        self, authenticated_client, sample_test_catalog
    ):
        """Order fails with non-existent walk-in patient ID."""
        data = {
            "walkin_patient_id": 99999,
            "items": [{"test_code": "CBC"}],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_standalone_order_creates_invoice_without_encounter(
        self, authenticated_client, sample_test_catalog
    ):
        """Standalone orders create invoice items even when encounter is null."""
        from hmis.apps.billing.models import Invoice
        from hmis.apps.laboratory.models import LabOrder

        data = {
            "walkin_name": "Test Patient",
            "walkin_dob": "1991-01-01",
            "walkin_gender": "F",
            "items": [{"test_code": "CBC"}],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        order = LabOrder.objects.get(id=response.data["id"])
        assert order.bill_patient is True
        assert order.encounter is None  # No encounter = no invoice
        assert order.billing_patient_id is not None
        assert Invoice.objects.filter(items__lab_order=order).exists()

    def test_standalone_order_multiple_items(self, authenticated_client, sample_test_catalog):
        """Order can have multiple test items."""
        # Create second test
        from hmis.apps.laboratory.models import TestCatalog

        TestCatalog.objects.create(
            code="LIPID",
            name="Lipid Panel",
            short_name="LIPID",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="PANEL",
            cost=800.00,
            available_in_house=True,
            is_active=True,
        )

        data = {
            "walkin_name": "Multi-test Patient",
            "items": [
                {"test_code": "CBC"},
                {"test_code": "LIPID"},
            ],
        }
        response = authenticated_client.post(
            "/api/lab/standalone/orders/create/",
            data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED


# =============================================================================
# HL7 ORM Inbound Ingestion Tests
# =============================================================================


class TestHL7ORMIngestion:
    """Tests for HL7 ORM^O01 inbound message parsing and ingestion."""

    def test_ingest_valid_orm_message(
        self, db, sample_hl7_orm_message, sample_facility, sample_organization
    ):
        """Valid ORM message creates an ExternalOrderRequest."""
        from hmis.apps.laboratory.standalone.services import ingest_hl7_orm

        ext_order = ingest_hl7_orm(
            sample_hl7_orm_message,
            facility=sample_facility,
            organization=sample_organization,
        )

        assert ext_order.id is not None
        assert ext_order.message_control_id == "MSG001"
        assert ext_order.sending_application == "ExternalLIS"
        assert ext_order.sending_facility == "Kenyatta Lab"
        assert ext_order.patient_name == "Jane Wanjiku"
        assert ext_order.patient_gender == "F"
        assert ext_order.placer_order_number == "ORD12345"
        assert ext_order.status == "RECEIVED"
        assert len(ext_order.requested_tests) == 2
        assert ext_order.requested_tests[0]["code"] == "CBC"

    def test_ingest_orm_parses_patient_dob(
        self, db, sample_hl7_orm_message, sample_facility, sample_organization
    ):
        """HL7 DOB field (YYYYMMDD) is correctly parsed."""
        from hmis.apps.laboratory.standalone.services import ingest_hl7_orm

        ext_order = ingest_hl7_orm(
            sample_hl7_orm_message,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert ext_order.patient_dob == date(1990, 6, 15)

    def test_ingest_orm_with_newlines(self, db, sample_facility, sample_organization):
        """HL7 message separated by \\n instead of \\r is handled."""
        from hmis.apps.laboratory.standalone.services import ingest_hl7_orm

        msg = (
            "MSH|^~\\&|Lab1|Hosp1|Vitora|Demo||ORM^O01|MSG003|P|2.5\n"
            "PID|1||P100||Doe^John||19800101|M\n"
            "ORC|NW|ORD999|||ROUTINE|||R\n"
            "OBR|1|ORD999||FBS^Fasting Blood Sugar\n"
        )
        ext_order = ingest_hl7_orm(msg, facility=sample_facility, organization=sample_organization)
        assert ext_order.patient_name == "John Doe"
        assert ext_order.patient_gender == "M"
        assert ext_order.placer_order_number == "ORD999"
        assert len(ext_order.requested_tests) == 1

    def test_ingest_orm_priority_mapping(self, db, sample_facility, sample_organization):
        """HL7 priority codes are mapped correctly."""
        from hmis.apps.laboratory.standalone.services import ingest_hl7_orm

        msg = (
            "MSH|^~\\&|Lab1|Hosp1|Vitora|Demo||ORM^O01|MSG004|P|2.5\r"
            "PID|1||P200||Smith^Alice||19951231|F\r"
            "ORC|NW|ORD555|||||S\r"
            "OBR|1|ORD555||CBC^Complete Blood Count\r"
        )
        ext_order = ingest_hl7_orm(msg, facility=sample_facility, organization=sample_organization)
        assert ext_order.order_priority == "STAT"


# =============================================================================
# External Order Accept/Reject Tests
# =============================================================================


class TestExternalOrderWorkflow:
    """Tests for external order accept/reject workflow."""

    def test_list_external_orders(self, authenticated_client, external_order):
        """GET /api/lab/standalone/external-orders/ lists external orders."""
        response = authenticated_client.get("/api/lab/standalone/external-orders/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_retrieve_external_order(self, authenticated_client, external_order):
        """GET detail returns full external order info."""
        response = authenticated_client.get(
            f"/api/lab/standalone/external-orders/{external_order.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["placer_order_number"] == "ORD-EXT-001"
        assert response.data["status"] == "RECEIVED"

    def test_accept_external_order(self, authenticated_client, external_order, sample_test_catalog):
        """POST accept/ creates a lab order and walk-in patient."""
        response = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "accepted"
        assert response.data["lab_order"] is not None
        assert response.data["lab_order"]["is_walkin"] is True

        # Verify the external order is now ACCEPTED
        external_order.refresh_from_db()
        assert external_order.status == "ACCEPTED"
        assert external_order.lab_order is not None
        assert external_order.walkin_patient is not None

    def test_accept_external_order_without_walkin_creation(
        self, authenticated_client, external_order, sample_test_catalog
    ):
        """Accept without auto-creating walk-in patient."""
        response = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/accept/",
            {"auto_create_walkin": False},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        external_order.refresh_from_db()
        assert external_order.walkin_patient is None

    def test_reject_external_order(self, authenticated_client, external_order):
        """POST reject/ marks the order as rejected with a reason."""
        response = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/reject/",
            {"reason": "Test not available at this facility"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REJECTED"
        assert response.data["rejection_reason"] == "Test not available at this facility"

    def test_reject_requires_reason(self, authenticated_client, external_order):
        """Reject without reason is rejected."""
        response = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/reject/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_accept_already_processed_order(
        self, authenticated_client, external_order, sample_test_catalog
    ):
        """Cannot accept an order that's already been accepted."""
        # Accept first
        authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        # Try to accept again
        response = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_reject_already_processed_order(
        self, authenticated_client, external_order, sample_test_catalog
    ):
        """Cannot reject an order that's already been accepted."""
        # Accept first
        authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/accept/",
            {"auto_create_walkin": True},
            format="json",
        )
        # Try to reject
        response = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/reject/",
            {"reason": "Changed mind"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestStandaloneInteropInbound:
    """Tests for WS3 inbound interop endpoints (idempotency, crosswalk, replay)."""

    def test_inbound_ingest_hl7_creates_trace_and_crosswalk(
        self, authenticated_client, sample_hl7_orm_message
    ):
        response = authenticated_client.post(
            "/api/lab/standalone/interop/inbound-orders/",
            {
                "source_system": "EXT_LIS",
                "channel": "HL7",
                "message_format": "HL7",
                "hl7_message": sample_hl7_orm_message,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["trace_id"]

        from hmis.apps.laboratory.standalone.models import ExternalPatientIdentifierCrosswalk

        assert ExternalPatientIdentifierCrosswalk.objects.filter(
            source_system="EXT_LIS",
            external_patient_id="PAT001",
        ).exists()

    def test_inbound_ingest_supports_idempotency_key(
        self, authenticated_client, sample_hl7_orm_message
    ):
        payload = {
            "source_system": "EXT_LIS",
            "channel": "HL7",
            "message_format": "HL7",
            "hl7_message": sample_hl7_orm_message,
        }
        headers = {"HTTP_X_IDEMPOTENCY_KEY": "idem-ord-001"}

        first = authenticated_client.post(
            "/api/lab/standalone/interop/inbound-orders/",
            payload,
            format="json",
            **headers,
        )
        second = authenticated_client.post(
            "/api/lab/standalone/interop/inbound-orders/",
            payload,
            format="json",
            **headers,
        )

        assert first.status_code == status.HTTP_201_CREATED
        assert second.status_code == status.HTTP_200_OK
        assert second.data["status"] == "idempotent_replay"
        assert first.data["trace_id"] == second.data["trace_id"]

    def test_replay_failed_dead_letter_event(
        self, authenticated_client, sample_hl7_orm_message, sample_facility, sample_organization
    ):
        from hmis.apps.laboratory.standalone.models import InboundIngestionEvent

        event = InboundIngestionEvent.objects.create(
            source_system="EXT_LIS",
            channel="HL7",
            status=InboundIngestionEvent.Status.FAILED,
            raw_payload=sample_hl7_orm_message,
            error_message="Parse error",
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.post(
            f"/api/lab/standalone/interop/inbound-events/{event.id}/replay/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        event.refresh_from_db()
        assert event.status == InboundIngestionEvent.Status.REPLAYED
        assert event.external_order is not None


class TestStandaloneInteropOutbound:
    """Tests for WS3 outbound result delivery and delivery status tracking."""

    def test_deliver_result_pdf_package_and_download(
        self,
        authenticated_client,
        external_order,
        sample_lab_order,
        sample_facility,
        sample_organization,
    ):
        external_order.lab_order = sample_lab_order
        external_order.status = external_order.Status.ACCEPTED
        external_order.facility = sample_facility
        external_order.organization = sample_organization
        external_order.save(update_fields=["lab_order", "status", "facility", "organization"])

        sample_lab_order.status = "COMPLETED"
        sample_lab_order.save(update_fields=["status", "updated_at"])

        deliver = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/deliver-result/",
            {"channel": "PDF_PACKAGE"},
            format="json",
        )
        assert deliver.status_code == status.HTTP_201_CREATED
        assert deliver.data["status"] == "DELIVERED"
        assert deliver.data["pdf_filename"].endswith(".pdf")

        download = authenticated_client.get(
            f"/api/lab/standalone/interop/delivery-logs/{deliver.data['id']}/download-pdf/"
        )
        assert download.status_code == status.HTTP_200_OK
        assert download["Content-Type"] == "application/pdf"

    def test_deliver_result_webhook_failure_is_logged(
        self,
        authenticated_client,
        external_order,
        sample_lab_order,
        sample_facility,
        sample_organization,
        mocker,
    ):
        from urllib.error import URLError

        mocker.patch(
            "hmis.apps.laboratory.standalone.services.urllib_request.urlopen",
            side_effect=URLError("network down"),
        )

        external_order.lab_order = sample_lab_order
        external_order.status = external_order.Status.ACCEPTED
        external_order.facility = sample_facility
        external_order.organization = sample_organization
        external_order.save(update_fields=["lab_order", "status", "facility", "organization"])

        sample_lab_order.status = "COMPLETED"
        sample_lab_order.save(update_fields=["status", "updated_at"])

        response = authenticated_client.post(
            f"/api/lab/standalone/external-orders/{external_order.id}/deliver-result/",
            {"channel": "WEBHOOK", "destination": "https://example.invalid/hooks/lab-results"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "FAILED"
        assert "network down" in response.data["error_message"]


class TestStandaloneMappingTooling:
    """Tests for WS3 message mapping config and validation tooling."""

    def test_create_and_list_mapping(self, authenticated_client, sample_test_catalog):
        create = authenticated_client.post(
            "/api/lab/standalone/interop/mappings/",
            {
                "code_system": "EXT_LIS",
                "external_code": "EXT-CBC-01",
                "external_display": "External CBC",
                "relationship": "EQUIVALENT",
                "is_active": True,
                "test_code": sample_test_catalog.code,
            },
            format="json",
        )
        assert create.status_code == status.HTTP_201_CREATED
        assert create.data["external_code"] == "EXT-CBC-01"

        listed = authenticated_client.get(
            "/api/lab/standalone/interop/mappings/?code_system=EXT_LIS"
        )
        assert listed.status_code == status.HTTP_200_OK
        assert len(listed.data) >= 1
        assert any(entry["external_code"] == "EXT-CBC-01" for entry in listed.data)

    def test_validate_mapping_preview(self, authenticated_client, sample_test_catalog):
        authenticated_client.post(
            "/api/lab/standalone/interop/mappings/",
            {
                "code_system": "EXT_LIS",
                "external_code": "EXT-CBC-02",
                "relationship": "EQUIVALENT",
                "is_active": True,
                "test_code": sample_test_catalog.code,
            },
            format="json",
        )

        response = authenticated_client.post(
            "/api/lab/standalone/interop/mappings/validate/",
            {
                "source_system": "EXT_LIS",
                "message_format": "JSON",
                "payload": {
                    "tests": [{"code": "EXT-CBC-02"}, {"code": "UNKNOWN-CODE"}],
                },
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_codes"] == 2
        assert response.data["mapped_count"] == 1
        assert response.data["unmapped_count"] == 1


# =============================================================================
# Billing Decoupling Tests
# =============================================================================


class TestBillingDecoupling:
    """Tests verifying billing is decoupled from standalone orders."""

    def test_lab_order_without_encounter_succeeds(
        self, db, test_user, sample_test_catalog, sample_facility, sample_organization
    ):
        """LabOrder can be created with encounter=None (standalone mode)."""
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem

        order = LabOrder.objects.create(
            patient=None,
            encounter=None,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            priority="ROUTINE",
            is_walkin=True,
            walkin_patient_name="Direct Test",
            bill_patient=False,
            facility=sample_facility,
            organization=sample_organization,
        )
        LabOrderItem.objects.create(
            lab_order=order,
            test=sample_test_catalog,
            unit_cost=sample_test_catalog.cost,
        )
        assert order.id is not None
        assert order.encounter is None
        assert order.patient is None
        assert order.is_walkin is True

    def test_lab_order_with_encounter_still_works(self, sample_lab_order):
        """Traditional lab orders (with encounter) still work correctly."""
        assert sample_lab_order.encounter is not None
        assert sample_lab_order.patient is not None
        assert sample_lab_order.is_walkin is False

    def test_standalone_billing_reconciliation_endpoint(
        self, authenticated_client, sample_test_catalog
    ):
        data = {
            "walkin_name": "Recon Patient",
            "walkin_dob": "1992-02-02",
            "walkin_gender": "M",
            "items": [{"test_code": "CBC"}],
        }
        create = authenticated_client.post(
            "/api/lab/standalone/orders/create/", data, format="json"
        )
        assert create.status_code == status.HTTP_201_CREATED

        response = authenticated_client.get("/api/lab/standalone/billing/reconciliation/")
        assert response.status_code == status.HTTP_200_OK
        assert "released_orders" in response.data
        assert "collected_amount" in response.data

    def test_standalone_invoice_pdf_endpoint(self, authenticated_client, sample_test_catalog):
        from hmis.apps.billing.models import Invoice

        data = {
            "walkin_name": "PDF Patient",
            "walkin_dob": "1993-03-03",
            "walkin_gender": "F",
            "items": [{"test_code": "CBC"}],
        }
        create = authenticated_client.post(
            "/api/lab/standalone/orders/create/", data, format="json"
        )
        assert create.status_code == status.HTTP_201_CREATED

        invoice = Invoice.objects.filter(items__lab_order_id=create.data["id"]).first()
        assert invoice is not None

        response = authenticated_client.get(
            f"/api/lab/standalone/billing/invoices/{invoice.id}/pdf/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"

    def test_standalone_payments_endpoint(
        self, authenticated_client, sample_test_catalog, test_user
    ):
        from hmis.apps.billing.models import Invoice, Payment

        data = {
            "walkin_name": "Paid Patient",
            "walkin_dob": "1994-04-04",
            "walkin_gender": "M",
            "items": [{"test_code": "CBC"}],
        }
        create = authenticated_client.post(
            "/api/lab/standalone/orders/create/", data, format="json"
        )
        assert create.status_code == status.HTTP_201_CREATED

        invoice = Invoice.objects.filter(items__lab_order_id=create.data["id"]).first()
        assert invoice is not None
        payment = Payment.objects.create(
            invoice=invoice,
            method=Payment.Method.CASH,
            amount=invoice.total_amount,
            received_by=test_user,
        )
        payment.process()

        response = authenticated_client.get("/api/lab/standalone/billing/payments/")
        assert response.status_code == status.HTTP_200_OK
        assert any(row["payment_reference"] == payment.payment_reference for row in response.data)

    def test_standalone_remittance_lines_endpoint_returns_ok(self, authenticated_client):
        response = authenticated_client.get("/api/lab/standalone/billing/remittance-lines/")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)


# =============================================================================
# Domain Event Tests
# =============================================================================


class TestStandaloneDomainEvents:
    """Tests verifying domain events are published for standalone operations."""

    def test_walkin_creation_publishes_event(
        self, db, test_user, sample_facility, sample_organization, mocker
    ):
        """Walk-in patient creation publishes a domain event."""
        mock_publish = mocker.patch("hmis.apps.laboratory.standalone.signals.publish_event")
        from hmis.apps.laboratory.standalone.models import WalkInPatient

        WalkInPatient.objects.create(
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
        """External order creation publishes a domain event."""
        mock_publish = mocker.patch("hmis.apps.laboratory.standalone.signals.publish_event")
        from hmis.apps.laboratory.standalone.models import ExternalOrderRequest

        ExternalOrderRequest.objects.create(
            message_control_id="EVT001",
            sending_application="Test",
            sending_facility="Test Facility",
            patient_name="Event Patient",
            placer_order_number="EVT-ORD-001",
            requested_tests=[{"code": "CBC"}],
            raw_message="MSH|...",
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called()
        call_kwargs = mock_publish.call_args.kwargs
        assert "external_order" in call_kwargs["event_type"]


class TestStandaloneOnboardingStatusAPI:
    """Tests for LIS standalone onboarding status endpoint."""

    def test_get_status_returns_checklist(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        response = authenticated_client.get("/api/lab/standalone/onboarding/status/")
        assert response.status_code == status.HTTP_200_OK
        assert "steps" in response.data
        assert isinstance(response.data["steps"], list)
        assert response.data["complete"] is False

    def test_post_status_rejects_incomplete_required_steps(
        self, authenticated_client, sample_facility
    ):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/status/", {}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "lis_onboarding_incomplete"

    def test_post_status_marks_complete_when_required_steps_done(
        self, authenticated_client, sample_facility, mocker
    ):
        from hmis.apps.core.models import Facility

        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        mocker.patch.object(
            Facility,
            "get_lis_onboarding_checklist",
            return_value=[
                {"key": "lab_identity", "label": "Identity", "done": True, "required": True},
                {"key": "test_catalog", "label": "Catalog", "done": True, "required": True},
            ],
        )

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/status/", {}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        sample_facility.refresh_from_db()
        assert sample_facility.lis_onboarding_completed_at is not None
        assert response.data["complete"] is True


class TestStandaloneOnboardingMiddleware:
    """Tests for standalone LIS onboarding enforcement middleware."""

    @override_settings(LIS_STANDALONE_ONBOARDING_ENFORCEMENT=True)
    def test_blocks_standalone_write_actions_before_onboarding_complete(
        self, api_client, test_user, sample_facility
    ):
        assert api_client.login(username=test_user.username, password="testpassword123")

        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.lis_onboarding_completed_at = None
        sample_facility.save()

        payload = {
            "first_name": "Blocked",
            "last_name": "User",
        }
        response = api_client.post(
            "/api/lab/standalone/walkin-patients/",
            payload,
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        payload_json = json.loads(response.content.decode("utf-8"))
        assert payload_json["code"] == "lis_onboarding_required"

    @override_settings(LIS_STANDALONE_ONBOARDING_ENFORCEMENT=True)
    def test_allows_standalone_write_actions_after_onboarding_complete(
        self, api_client, test_user, sample_facility
    ):
        assert api_client.login(username=test_user.username, password="testpassword123")

        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.lis_onboarding_completed_at = timezone.now()
        sample_facility.save()

        payload = {
            "first_name": "Allowed",
            "last_name": "User",
        }
        response = api_client.post(
            "/api/lab/standalone/walkin-patients/",
            payload,
            format="json",
        )
        # Session login does not satisfy DRF JWT auth; this assertion verifies
        # middleware did not block with lis_onboarding_required.
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestStandaloneOnboardingSeeding:
    """Tests for LIS standalone onboarding default seeding endpoint."""

    def test_seed_defaults_creates_archetype_data(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/seed-defaults/",
            {"archetype": "small"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["archetype"] == "small"
        assert response.data["created_tests"] >= 1
        assert response.data["created_instruments"] >= 0
        assert response.data["created_channels"] >= 0

    def test_seed_defaults_rejects_invalid_archetype(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/seed-defaults/",
            {"archetype": "invalid"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestStandaloneOnboardingCSV:
    """Tests for LIS onboarding CSV templates and import workflow."""

    def test_download_test_catalog_template(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        response = authenticated_client.get(
            "/api/lab/standalone/onboarding/templates/test-catalog/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "code,name,short_name" in response.content.decode("utf-8")

    def test_import_test_catalog_csv(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "code,name,short_name,category,specimen_type,turnaround_hours,cost,result_type,is_active\n"
            "GLU,Glucose,GLU,CHEMISTRY,SERUM,8,300,NUMERIC,true\n"
        )
        upload = SimpleUploadedFile("test-catalog.csv", csv_content.encode("utf-8"), "text/csv")

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/import/test-catalog/",
            {"file": upload},
            format="multipart",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created"] >= 1
        assert response.data["error_count"] == 0

    def test_import_test_catalog_csv_missing_columns(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = "code,name\nGLU,Glucose\n"
        upload = SimpleUploadedFile("invalid.csv", csv_content.encode("utf-8"), "text/csv")

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/import/test-catalog/",
            {"file": upload},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "missing_columns" in response.data

    def test_import_specimen_workflow_csv(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "workflow_key,enabled,value\n"
            "require_specimen_receipt,true,true\n"
            "tat_warning_threshold_percent,true,80\n"
        )
        upload = SimpleUploadedFile("workflow.csv", csv_content.encode("utf-8"), "text/csv")

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/import/specimen-workflow/",
            {"file": upload},
            format="multipart",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["updated"] >= 1

    def test_import_analyzer_channel_csv(self, authenticated_client, sample_facility):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "instrument_code,instrument_name,manufacturer,protocol,host,port,encoding,channel_name,is_active\n"
            "ANZ-01,Analyzer 1,Generic,TCP,127.0.0.1,5001,ascii,Primary,true\n"
        )
        upload = SimpleUploadedFile("analyzer.csv", csv_content.encode("utf-8"), "text/csv")

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/import/analyzer-channel/",
            {"file": upload},
            format="multipart",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["created_channels"] >= 1

    def test_import_reference_ranges_csv(
        self, authenticated_client, sample_facility, sample_organization
    ):
        sample_facility.operating_mode = sample_facility.OperatingMode.STANDALONE_LAB
        sample_facility.save()

        from hmis.apps.laboratory.models import TestCatalog

        scoped_test = TestCatalog.objects.create(
            code="CBC-RANGE",
            name="CBC Range",
            short_name="CBCR",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=100,
            facility=sample_facility,
            organization=sample_organization,
        )

        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_content = (
            "test_code,gender,age_band,normal_range,critical_low,critical_high,unit\n"
            f"{scoped_test.code},F,adult,4.0-9.0,2.0,20.0,mmol/L\n"
        )
        upload = SimpleUploadedFile("ranges.csv", csv_content.encode("utf-8"), "text/csv")

        response = authenticated_client.post(
            "/api/lab/standalone/onboarding/import/reference-ranges/",
            {"file": upload},
            format="multipart",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["updated"] >= 1
