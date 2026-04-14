"""
Tests for domain event publishing from signal handlers.

Verifies that Django signal handlers correctly publish domain events
alongside their primary operations (billing, WebSocket broadcasts, etc.).
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore

from hmis.apps.core.events import (
    BillingEvents,
    ClinicalEvents,
    CoreEvents,
    LaboratoryEvents,
    PharmacyEvents,
    get_event_bus,
)
from hmis.apps.core.events.bus import reset_event_bus


@pytest.fixture(autouse=True)
def _clean_event_bus():
    """Reset event bus before each test to ensure clean state."""
    reset_event_bus()
    yield
    reset_event_bus()


class TestEventTypeCatalog:
    """Test that event type constants follow the naming convention."""

    def test_billing_events_follow_convention(self):
        """All billing events should start with 'billing.'."""
        for attr in dir(BillingEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(BillingEvents, attr)
                assert value.startswith("billing."), f"{attr} = {value} doesn't start with 'billing.'"

    def test_pharmacy_events_follow_convention(self):
        """All pharmacy events should start with 'pharmacy.'."""
        for attr in dir(PharmacyEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(PharmacyEvents, attr)
                assert value.startswith("pharmacy."), f"{attr} = {value}"

    def test_laboratory_events_follow_convention(self):
        """All laboratory events should start with 'laboratory.'."""
        for attr in dir(LaboratoryEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(LaboratoryEvents, attr)
                assert value.startswith("laboratory."), f"{attr} = {value}"

    def test_clinical_events_follow_convention(self):
        """All clinical events should start with 'clinical.'."""
        for attr in dir(ClinicalEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(ClinicalEvents, attr)
                assert value.startswith("clinical."), f"{attr} = {value}"

    def test_core_events_follow_convention(self):
        """All core events should start with 'core.'."""
        for attr in dir(CoreEvents):
            if attr.isupper() and not attr.startswith("_"):
                value = getattr(CoreEvents, attr)
                assert value.startswith("core."), f"{attr} = {value}"

    def test_no_duplicate_event_types(self):
        """Event type values should be unique across all catalogs."""
        all_values = []
        for cls in [BillingEvents, PharmacyEvents, LaboratoryEvents, ClinicalEvents, CoreEvents]:
            for attr in dir(cls):
                if attr.isupper() and not attr.startswith("_"):
                    all_values.append(getattr(cls, attr))
        assert len(all_values) == len(set(all_values)), "Duplicate event types found"


class TestPublishEventHelper:
    """Test the publish_event convenience function."""

    def test_publish_event_creates_and_publishes(self):
        """publish_event should create a DomainEvent and publish it."""
        from hmis.apps.core.events.helpers import publish_event

        received = []
        bus = get_event_bus()
        bus.subscribe("test.event", lambda e: received.append(e))

        publish_event(
            event_type="test.event",
            aggregate_type="TestModel",
            aggregate_id=42,
            payload={"key": "value"},
            facility_id=1,
        )

        assert len(received) == 1
        assert received[0].event_type == "test.event"
        assert received[0].aggregate_id == 42
        assert received[0].payload == {"key": "value"}
        assert received[0].facility_id == 1

    def test_publish_event_swallows_exceptions(self):
        """publish_event should never raise, even if the bus fails."""
        from hmis.apps.core.events.helpers import publish_event

        with patch("hmis.apps.core.events.helpers.get_event_bus") as mock_bus:
            mock_bus.return_value.publish.side_effect = RuntimeError("bus broken")

            # Should not raise
            publish_event(
                event_type="test.event",
                aggregate_type="Test",
                aggregate_id=1,
            )


class TestBillingSignalEvents:
    """Test domain event publishing from billing signal handlers."""

    @pytest.mark.django_db
    def test_invoice_post_save_publishes_created_event(self):
        """broadcast_invoice_change should publish billing.invoice.created on create."""
        received = []
        bus = get_event_bus()
        bus.subscribe(BillingEvents.INVOICE_CREATED, lambda e: received.append(e))

        from hmis.apps.billing.signals import broadcast_invoice_change

        invoice = MagicMock()
        invoice.id = 99
        invoice.invoice_number = "INV-001"
        invoice.status = "DRAFT"
        invoice.total_amount = 5000
        invoice.patient_id = 10
        invoice.facility_id = 1
        invoice.organization_id = 2

        with patch("hmis.apps.billing.websockets.broadcast_invoice_created"):
            broadcast_invoice_change(sender=None, instance=invoice, created=True)

        assert len(received) == 1
        assert received[0].aggregate_type == "Invoice"
        assert received[0].aggregate_id == 99
        assert received[0].payload["invoice_number"] == "INV-001"

    @pytest.mark.django_db
    def test_invoice_post_save_publishes_updated_event(self):
        """broadcast_invoice_change should publish billing.invoice.updated on update."""
        received = []
        bus = get_event_bus()
        bus.subscribe(BillingEvents.INVOICE_UPDATED, lambda e: received.append(e))

        from hmis.apps.billing.signals import broadcast_invoice_change

        invoice = MagicMock()
        invoice.id = 99
        invoice.invoice_number = "INV-001"
        invoice.status = "FINALIZED"
        invoice.total_amount = 7500
        invoice.patient_id = 10
        invoice.facility_id = 1
        invoice.organization_id = 2

        with patch("hmis.apps.billing.websockets.broadcast_invoice_updated"):
            broadcast_invoice_change(sender=None, instance=invoice, created=False)

        assert len(received) == 1
        assert received[0].event_type == BillingEvents.INVOICE_UPDATED

    @pytest.mark.django_db
    def test_payment_post_save_publishes_event(self):
        """broadcast_payment_change should publish billing.payment.received on create."""
        received = []
        bus = get_event_bus()
        bus.subscribe(BillingEvents.PAYMENT_RECEIVED, lambda e: received.append(e))

        from hmis.apps.billing.signals import broadcast_payment_change

        payment = MagicMock()
        payment.id = 50
        payment.amount = 3000
        payment.payment_method = "MPESA"
        payment.invoice_id = 99
        payment.facility_id = 1
        payment.organization_id = 2

        with patch("hmis.apps.billing.websockets.broadcast_payment_received"):
            broadcast_payment_change(sender=None, instance=payment, created=True)

        assert len(received) == 1
        assert received[0].aggregate_type == "Payment"
        assert received[0].payload["payment_method"] == "MPESA"

    @pytest.mark.django_db
    def test_payment_update_does_not_publish(self):
        """broadcast_payment_change should not publish on update."""
        received = []
        bus = get_event_bus()
        bus.subscribe(BillingEvents.PAYMENT_RECEIVED, lambda e: received.append(e))

        from hmis.apps.billing.signals import broadcast_payment_change

        payment = MagicMock()
        broadcast_payment_change(sender=None, instance=payment, created=False)

        assert len(received) == 0


class TestPharmacySignalEvents:
    """Test domain event publishing from pharmacy signal handlers."""

    @pytest.mark.django_db
    def test_prescription_created_publishes_event(self):
        """broadcast_prescription_on_create should publish pharmacy.prescription.created."""
        received = []
        bus = get_event_bus()
        bus.subscribe(PharmacyEvents.PRESCRIPTION_CREATED, lambda e: received.append(e))

        from hmis.apps.pharmacy.signals import broadcast_prescription_on_create

        prescription = MagicMock()
        prescription.id = 77
        prescription.prescription_number = "RX-001"
        prescription.patient_id = 10
        prescription.encounter_id = 20
        prescription.facility_id = 1
        prescription.organization_id = 2

        with patch("hmis.apps.pharmacy.websockets.broadcast_prescription_created"):
            broadcast_prescription_on_create(sender=None, instance=prescription, created=True)

        assert len(received) == 1
        assert received[0].aggregate_type == "Prescription"
        assert received[0].payload["prescription_number"] == "RX-001"

    @pytest.mark.django_db
    def test_prescription_update_does_not_publish(self):
        """broadcast_prescription_on_create should not publish on update."""
        received = []
        bus = get_event_bus()
        bus.subscribe(PharmacyEvents.PRESCRIPTION_CREATED, lambda e: received.append(e))

        from hmis.apps.pharmacy.signals import broadcast_prescription_on_create

        broadcast_prescription_on_create(sender=None, instance=MagicMock(), created=False)
        assert len(received) == 0

    @pytest.mark.django_db
    def test_dispensing_completed_publishes_event(self):
        """broadcast_dispensing_on_create should publish pharmacy.dispensing.completed."""
        received = []
        bus = get_event_bus()
        bus.subscribe(PharmacyEvents.DISPENSING_COMPLETED, lambda e: received.append(e))

        from hmis.apps.pharmacy.signals import broadcast_dispensing_on_create

        drug = MagicMock()
        drug.id = 5
        drug.generic_name = "Amoxicillin"

        dispensing = MagicMock()
        dispensing.id = 33
        dispensing.drug = drug
        dispensing.quantity_dispensed = 30
        dispensing.patient_id = 10
        dispensing.facility_id = 1
        dispensing.organization_id = 2

        with patch("hmis.apps.pharmacy.websockets.broadcast_dispensing_completed"):
            broadcast_dispensing_on_create(sender=None, instance=dispensing, created=True)

        assert len(received) == 1
        assert received[0].payload["drug_name"] == "Amoxicillin"
        assert received[0].payload["quantity_dispensed"] == 30

    @pytest.mark.django_db
    def test_stock_critical_publishes_event(self):
        """broadcast_stock_level_change should publish stock.critical when qty == 0."""
        received = []
        bus = get_event_bus()
        bus.subscribe(PharmacyEvents.STOCK_CRITICAL, lambda e: received.append(e))

        from hmis.apps.pharmacy.signals import broadcast_stock_level_change

        drug = MagicMock()
        drug.generic_name = "Paracetamol"
        drug.default_reorder_level = 10

        batch = MagicMock()
        batch.id = 88
        batch.facility_id = 5
        batch.quantity_available = 0
        batch.status = "AVAILABLE"
        batch.drug = drug

        with patch("hmis.apps.pharmacy.websockets.broadcast_stock_critical"):
            broadcast_stock_level_change(sender=None, instance=batch)

        assert len(received) == 1
        assert received[0].event_type == PharmacyEvents.STOCK_CRITICAL
        assert received[0].facility_id == 5

    @pytest.mark.django_db
    def test_stock_low_warning_publishes_event(self):
        """broadcast_stock_level_change should publish stock.low_warning below reorder."""
        received = []
        bus = get_event_bus()
        bus.subscribe(PharmacyEvents.STOCK_LOW_WARNING, lambda e: received.append(e))

        from hmis.apps.pharmacy.signals import broadcast_stock_level_change

        drug = MagicMock()
        drug.generic_name = "Ibuprofen"
        drug.default_reorder_level = 50

        batch = MagicMock()
        batch.id = 89
        batch.facility_id = 5
        batch.quantity_available = 20
        batch.status = "AVAILABLE"
        batch.drug = drug

        with patch("hmis.apps.pharmacy.websockets.broadcast_stock_low_warning"):
            broadcast_stock_level_change(sender=None, instance=batch)

        assert len(received) == 1
        assert received[0].event_type == PharmacyEvents.STOCK_LOW_WARNING
        assert received[0].payload["reorder_level"] == 50


class TestClinicsSignalEvents:
    """Test domain event publishing from clinics signal handlers."""

    @pytest.mark.django_db
    def test_clinic_visit_created_publishes_event(self):
        """clinic_visit_post_save should publish clinical.clinic_visit.created."""
        received = []
        bus = get_event_bus()
        bus.subscribe(ClinicalEvents.CLINIC_VISIT_CREATED, lambda e: received.append(e))

        from hmis.apps.clinics.signals import clinic_visit_post_save

        visit = MagicMock()
        visit.id = 100
        visit._skip_broadcast = False
        visit.patient_id = 10
        visit.clinic_id = 3
        visit.status = "WAITING"
        visit.facility_id = 1

        with patch("hmis.apps.clinics.signals.broadcast_patient_added"):
            clinic_visit_post_save(sender=None, instance=visit, created=True)

        assert len(received) == 1
        assert received[0].aggregate_type == "ClinicVisit"
        assert received[0].payload["status"] == "WAITING"

    @pytest.mark.django_db
    def test_clinic_visit_status_change_publishes_event(self):
        """clinic_visit_status_change should publish clinical.clinic_visit.status_changed."""
        received = []
        bus = get_event_bus()
        bus.subscribe(ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED, lambda e: received.append(e))

        from hmis.apps.clinics.signals import clinic_visit_status_change

        visit = MagicMock()
        visit.id = 100
        visit._skip_broadcast = False
        visit._old_status = "WAITING"
        visit.status = "CALLED"
        visit.patient_id = 10
        visit.clinic_id = 3
        visit.facility_id = 1

        with patch("hmis.apps.clinics.signals.broadcast_patient_called"):
            clinic_visit_status_change(sender=None, instance=visit, created=False)

        assert len(received) == 1
        assert received[0].payload["old_status"] == "WAITING"
        assert received[0].payload["new_status"] == "CALLED"


class TestCoreSignalEvents:
    """Test domain event publishing from core signal handlers."""

    @pytest.mark.django_db
    def test_login_publishes_event(self):
        """log_user_login should publish core.user.logged_in."""
        received = []
        bus = get_event_bus()
        bus.subscribe(CoreEvents.USER_LOGGED_IN, lambda e: received.append(e))

        from hmis.apps.core.signals import log_user_login

        user = MagicMock()
        user.id = 7
        user.username = "testdoc"
        request = MagicMock()
        request.META = {"HTTP_USER_AGENT": "test"}

        with patch("hmis.apps.core.models.AuditLog") as mock_audit:
            mock_audit.log = MagicMock()
            with patch("hmis.apps.core.permissions.get_client_ip", return_value="127.0.0.1"):
                log_user_login(sender=None, request=request, user=user)

        assert len(received) == 1
        assert received[0].event_type == CoreEvents.USER_LOGGED_IN
        assert received[0].user_id == 7
        assert received[0].payload["username"] == "testdoc"

    @pytest.mark.django_db
    def test_patient_created_publishes_event(self):
        """patient_activity_signal should publish core.patient.created."""
        received = []
        bus = get_event_bus()
        bus.subscribe(CoreEvents.PATIENT_CREATED, lambda e: received.append(e))

        from hmis.apps.core.signals import patient_activity_signal

        registered_by = MagicMock()
        registered_by.id = 3

        instance = MagicMock()
        instance.id = 55
        instance.mrn = "MRN-20260101-0001"
        instance.first_name = "Jane"
        instance.last_name = "Doe"
        instance.gender = "F"
        instance.registered_by = registered_by
        instance.facility_id = 1
        instance.organization_id = 2

        with patch("hmis.apps.core.models.ActivityFeed") as mock_af:
            mock_af.log_activity = MagicMock()
            patient_activity_signal(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].aggregate_type == "Patient"
        assert received[0].payload["mrn"] == "MRN-20260101-0001"

    @pytest.mark.django_db
    def test_encounter_created_publishes_event(self):
        """encounter_activity_signal should publish clinical.encounter.created."""
        received = []
        bus = get_event_bus()
        bus.subscribe(ClinicalEvents.ENCOUNTER_CREATED, lambda e: received.append(e))

        from hmis.apps.core.signals import encounter_activity_signal

        patient = MagicMock()
        patient.id = 10
        patient.first_name = "John"
        patient.last_name = "Doe"
        patient.mrn = "MRN-001"

        created_by = MagicMock()
        created_by.id = 5

        instance = MagicMock()
        instance.id = 200
        instance.patient = patient
        instance.patient_id = 10
        instance.encounter_type = "OPD"
        instance.created_by = created_by
        instance.facility_id = 1
        instance.organization_id = 2

        with patch("hmis.apps.core.models.ActivityFeed") as mock_af:
            mock_af.log_activity = MagicMock()
            encounter_activity_signal(sender=None, instance=instance, created=True)

        assert len(received) == 1
        assert received[0].payload["encounter_type"] == "OPD"
        assert received[0].user_id == 5
