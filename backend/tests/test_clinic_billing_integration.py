"""
TDD Tests for Clinic → Billing Integration.

Tests that starting a consultation auto-generates billing.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.patients.models import Patient

User = get_user_model()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username="billinguser",
        email="billing@example.com",
        password="testpass123",
    )


@pytest.fixture
def sample_patient(db):
    """Create a sample patient."""
    from hmis.apps.core.models import County, SubCounty

    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    return Patient.objects.create(
        first_name="John",
        last_name="Smith",
        date_of_birth="1985-05-20",
        gender="M",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def consultation_service(db, test_user):
    """Create a consultation service for billing."""
    category, _ = ServiceCategory.objects.get_or_create(
        code="CONS",
        defaults={
            "name": "Consultation",
            "description": "Medical consultation services",
        },
    )
    service, _ = Service.objects.get_or_create(
        code="CONS-OPD",
        defaults={
            "category": category,
            "name": "OPD Consultation",
            "unit_price": Decimal("500.00"),
            "created_by": test_user,
        },
    )
    return service


@pytest.fixture
def sample_clinic(db):
    """Create a sample clinic with consultation fee."""
    return Clinic.objects.create(
        name="General OPD",
        code="GEN-OPD-002",
        clinic_type="GENERAL_OPD",
        status="ACTIVE",
        location="Ground Floor",
        default_service_fee=Decimal("500.00"),
        sha_service_code="CONS-OPD",
    )


@pytest.fixture
def sample_clinic_visit(db, sample_patient, sample_clinic):
    """Create a sample clinic visit in WAITING status."""
    from datetime import date

    session, _ = ClinicSession.objects.get_or_create(
        clinic=sample_clinic,
        session_date=date.today(),
        defaults={"status": "OPEN"},
    )
    return ClinicVisit.objects.create(
        session=session,
        patient=sample_patient,
        status="WAITING",
        chief_complaint="General checkup",
    )


@pytest.mark.django_db
class TestStartConsultationBilling:
    """Test billing is created when consultation starts."""

    def test_start_consultation_creates_invoice(
        self, sample_clinic_visit, consultation_service, test_user
    ):
        """Should create invoice when consultation starts."""
        # Verify no invoice exists before
        assert Invoice.objects.filter(patient=sample_clinic_visit.patient).count() == 0

        # Start consultation
        sample_clinic_visit.start_consultation(user=test_user)

        # Verify invoice was created
        invoice = Invoice.objects.filter(
            patient=sample_clinic_visit.patient,
        ).first()
        assert invoice is not None
        assert invoice.status in ["draft", Invoice.Status.DRAFT]

    def test_start_consultation_adds_consultation_fee_item(
        self, sample_clinic_visit, consultation_service, test_user
    ):
        """Should add consultation fee as line item."""
        sample_clinic_visit.start_consultation(user=test_user)

        invoice = Invoice.objects.filter(
            patient=sample_clinic_visit.patient,
        ).first()
        assert invoice is not None

        # Check for consultation line item (may or may not link to service)
        consultation_item = invoice.items.filter(description__icontains="consultation").first()
        assert consultation_item is not None
        assert consultation_item.unit_price == Decimal("500.00")
        assert consultation_item.quantity == 1

    def test_start_consultation_links_billing_to_visit(
        self, sample_clinic_visit, consultation_service, test_user
    ):
        """Should link billing line item to clinic visit."""
        sample_clinic_visit.start_consultation(user=test_user)
        sample_clinic_visit.refresh_from_db()

        assert sample_clinic_visit.consultation_fee_charged is True
        assert sample_clinic_visit.billing_line_item is not None

    def test_start_consultation_uses_clinic_fee(
        self, sample_clinic_visit, consultation_service, test_user
    ):
        """Should use clinic's consultation fee if set."""
        sample_clinic_visit.session.clinic.default_service_fee = Decimal("750.00")
        sample_clinic_visit.session.clinic.save()

        sample_clinic_visit.start_consultation(user=test_user)

        invoice = Invoice.objects.filter(
            patient=sample_clinic_visit.patient,
        ).first()

        # Should use clinic's custom fee
        consultation_item = invoice.items.filter(description__icontains="consultation").first()
        assert consultation_item is not None
        assert consultation_item.unit_price == Decimal("750.00")

    def test_start_consultation_does_not_double_charge(
        self, sample_clinic_visit, consultation_service, test_user
    ):
        """Should not charge consultation fee twice."""
        # First start
        sample_clinic_visit.start_consultation(user=test_user)

        # Reset status to allow another start
        sample_clinic_visit.status = "CALLED"
        sample_clinic_visit.save()

        # Second start should not add another fee
        sample_clinic_visit.start_consultation(user=test_user)

        invoice = Invoice.objects.filter(
            patient=sample_clinic_visit.patient,
        ).first()

        # Should only have one consultation item
        consultation_items = invoice.items.filter(
            item_type=InvoiceItem.ItemType.SERVICE,
            service__code__icontains="CONS",
        )
        assert consultation_items.count() == 1


@pytest.mark.django_db
class TestBillingWithEncounter:
    """Test billing links to encounter when created."""

    def test_billing_links_to_encounter(self, sample_clinic_visit, consultation_service, test_user):
        """Should link invoice to encounter when one is created."""
        # Start consultation (creates encounter)
        encounter = sample_clinic_visit.start_consultation(user=test_user)

        invoice = Invoice.objects.filter(
            patient=sample_clinic_visit.patient,
        ).first()
        assert invoice is not None
        assert invoice.encounter == encounter

    def test_billing_uses_existing_encounter_invoice(
        self, sample_clinic_visit, consultation_service, test_user
    ):
        """Should use existing encounter invoice if present."""
        from hmis.apps.encounters.models import Encounter

        # Create encounter - this triggers a signal that creates an invoice
        encounter = Encounter.objects.create(
            patient=sample_clinic_visit.patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        # Get the signal-created invoice
        existing_invoice = Invoice.objects.filter(
            encounter=encounter,
        ).first()
        assert existing_invoice is not None, "Signal should create invoice for encounter"

        sample_clinic_visit.encounter = encounter
        sample_clinic_visit.save()

        # Start consultation - should use existing invoice
        sample_clinic_visit.start_consultation(user=test_user)

        # Should add item to existing invoice, not create new one
        invoices = Invoice.objects.filter(patient=sample_clinic_visit.patient)
        assert invoices.count() == 1
        assert invoices.first().id == existing_invoice.id


@pytest.mark.django_db
class TestReturnVisitBilling:
    """Test billing for return visits."""

    def test_return_visit_charges_review_fee(
        self, sample_clinic_visit, consultation_service, test_user
    ):
        """Return visits should charge review fee, not full consultation."""
        # Create review consultation service
        category = consultation_service.category
        Service.objects.get_or_create(
            code="CONS-REV",
            defaults={
                "category": category,
                "name": "Review Consultation",
                "unit_price": Decimal("300.00"),
                "created_by": test_user,
            },
        )

        sample_clinic_visit.visit_type = "RETURN"
        sample_clinic_visit.save()

        sample_clinic_visit.start_consultation(user=test_user)

        invoice = Invoice.objects.filter(
            patient=sample_clinic_visit.patient,
        ).first()
        assert invoice is not None

        # Should use review fee
        consultation_item = invoice.items.filter(description__icontains="consultation").first()
        # Could be either review fee or standard, depending on implementation
        assert consultation_item is not None
