"""
TDD Tests for Proforma Invoice Implementation.

Business Rules:
1. Proforma invoices have separate numbering: PRO-YYYYMMDD-XXXX
2. Proformas can be freely created, modified, voided, and deleted
3. Conversion creates a NEW Invoice linked back to the proforma
4. Partial conversion is allowed (only some items converted)
5. Proformas have validity period (default 30 days)
6. Expired proformas cannot be converted (must be renewed or recreated)
7. Proformas cannot be paid directly - must convert to invoice first
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status

from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory


@pytest.fixture
def service_category(db):
    """Create a test service category."""
    return ServiceCategory.objects.create(
        name="Consultation",
        code="CONS",
        description="Consultation services",
        display_order=1,
    )


@pytest.fixture
def test_service(db, service_category, test_user):
    """Create a test service."""
    return Service.objects.create(
        category=service_category,
        code="CONS-GEN",
        name="General Consultation",
        description="General medical consultation",
        unit_price=Decimal("500.00"),
        created_by=test_user,
    )


@pytest.fixture
def test_service_2(db, service_category, test_user):
    """Create a second test service."""
    return Service.objects.create(
        category=service_category,
        code="CONS-SPEC",
        name="Specialist Consultation",
        description="Specialist medical consultation",
        unit_price=Decimal("1500.00"),
        created_by=test_user,
    )


@pytest.fixture
def proforma_invoice(db, sample_patient, test_user, sample_facility, sample_organization):
    """Create a test proforma invoice."""
    return Invoice.objects.create(
        patient=sample_patient,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        status=Invoice.Status.PROFORMA,
        payment_type=Invoice.PaymentType.CASH,
        created_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def proforma_with_items(db, proforma_invoice, test_service, test_service_2):
    """Create a proforma invoice with multiple items."""
    InvoiceItem.objects.create(
        invoice=proforma_invoice,
        item_type=InvoiceItem.ItemType.SERVICE,
        service=test_service,
        description="General Consultation",
        quantity=1,
        unit_price=Decimal("500.00"),
    )
    InvoiceItem.objects.create(
        invoice=proforma_invoice,
        item_type=InvoiceItem.ItemType.SERVICE,
        service=test_service_2,
        description="Specialist Consultation",
        quantity=2,
        unit_price=Decimal("1500.00"),
    )
    proforma_invoice.calculate_totals()
    return proforma_invoice


# =============================================================================
# Proforma Invoice Creation Tests
# =============================================================================


@pytest.mark.django_db
class TestProformaInvoiceCreation:
    """Tests for creating proforma invoices."""

    def test_proforma_status_exists(self):
        """Proforma should be a valid invoice status."""
        assert hasattr(Invoice.Status, "PROFORMA")
        assert Invoice.Status.PROFORMA == "proforma"

    def test_create_proforma_invoice(self, sample_patient, test_user):
        """Should be able to create a proforma invoice."""
        proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        assert proforma.status == Invoice.Status.PROFORMA
        assert proforma.pk is not None

    def test_proforma_number_format(self, proforma_invoice):
        """Proforma should have PRO-YYYYMMDD-XXXX format."""
        assert proforma_invoice.invoice_number.startswith("PRO-")
        # Format: PRO-YYYYMMDD-XXXX
        parts = proforma_invoice.invoice_number.split("-")
        assert len(parts) == 3
        assert parts[0] == "PRO"
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX sequence

    def test_proforma_sequential_numbering(self, sample_patient, test_user):
        """Proformas should have sequential numbering within the same day."""
        proforma1 = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )
        proforma2 = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        # Extract sequence numbers
        seq1 = int(proforma1.invoice_number.split("-")[-1])
        seq2 = int(proforma2.invoice_number.split("-")[-1])

        assert seq2 == seq1 + 1

    def test_proforma_separate_from_invoice_sequence(self, sample_patient, test_user):
        """Proforma numbering should be separate from regular invoice numbering."""
        # Create a regular invoice
        invoice = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        # Create a proforma
        proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        assert invoice.invoice_number.startswith("INV-")
        assert proforma.invoice_number.startswith("PRO-")


# =============================================================================
# Proforma Invoice Validity Tests
# =============================================================================


@pytest.mark.django_db
class TestProformaValidity:
    """Tests for proforma invoice validity period."""

    def test_proforma_has_valid_until_field(self, proforma_invoice):
        """Proforma should have a valid_until field."""
        assert hasattr(proforma_invoice, "valid_until")

    def test_proforma_default_validity_30_days(self, sample_patient, test_user):
        """Proforma should default to 30 days validity."""
        proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        expected_valid_until = date.today() + timedelta(days=30)
        assert proforma.valid_until == expected_valid_until

    def test_proforma_custom_validity(self, sample_patient, test_user):
        """Proforma validity can be customized."""
        custom_validity = date.today() + timedelta(days=14)
        proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            valid_until=custom_validity,
            created_by=test_user,
        )

        assert proforma.valid_until == custom_validity

    def test_proforma_is_valid_property(self, proforma_invoice):
        """Proforma should have is_valid property."""
        assert hasattr(proforma_invoice, "is_valid")
        assert proforma_invoice.is_valid is True

    def test_expired_proforma_is_not_valid(self, sample_patient, test_user):
        """Expired proforma should have is_valid=False."""
        proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=45),
            due_date=date.today() - timedelta(days=15),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            valid_until=date.today() - timedelta(days=15),
            created_by=test_user,
        )

        assert proforma.is_valid is False

    def test_proforma_days_until_expiry(self, proforma_invoice):
        """Proforma should report days until expiry."""
        assert hasattr(proforma_invoice, "days_until_expiry")
        assert proforma_invoice.days_until_expiry >= 0


# =============================================================================
# Proforma Modification Tests
# =============================================================================


@pytest.mark.django_db
class TestProformaModification:
    """Tests for proforma invoice modification."""

    def test_proforma_can_add_items(self, proforma_invoice, test_service):
        """Should be able to add items to proforma."""
        item = InvoiceItem.objects.create(
            invoice=proforma_invoice,
            item_type=InvoiceItem.ItemType.SERVICE,
            service=test_service,
            description="Test Service",
            quantity=1,
            unit_price=Decimal("500.00"),
        )

        assert item.pk is not None
        assert proforma_invoice.items.count() == 1

    def test_proforma_can_remove_items(self, proforma_with_items):
        """Should be able to remove items from proforma."""
        initial_count = proforma_with_items.items.count()
        item = proforma_with_items.items.first()
        item.delete()

        assert proforma_with_items.items.count() == initial_count - 1

    def test_proforma_can_update_items(self, proforma_with_items):
        """Should be able to update items on proforma."""
        item = proforma_with_items.items.first()
        item.quantity = 5
        item.save()

        item.refresh_from_db()
        assert item.quantity == 5

    def test_proforma_can_be_voided(self, proforma_invoice, test_user):
        """Proforma can be voided."""
        proforma_invoice.void(voided_by=test_user, reason="Customer changed mind")

        proforma_invoice.refresh_from_db()
        assert proforma_invoice.status == Invoice.Status.CANCELLED
        assert proforma_invoice.is_voided is True

    def test_proforma_can_be_deleted(self, proforma_invoice):
        """Proforma can be deleted."""
        proforma_id = proforma_invoice.pk
        proforma_invoice.delete()

        assert not Invoice.objects.filter(pk=proforma_id).exists()


# =============================================================================
# Proforma Conversion Tests
# =============================================================================


@pytest.mark.django_db
class TestProformaConversion:
    """Tests for converting proforma to invoice."""

    def test_convert_proforma_creates_new_invoice(self, proforma_with_items, test_user):
        """Converting proforma should create a NEW invoice."""
        proforma_id = proforma_with_items.pk

        new_invoice = proforma_with_items.convert_to_invoice(converted_by=test_user)

        # New invoice should be a different record
        assert new_invoice.pk != proforma_id
        assert new_invoice.status == Invoice.Status.DRAFT

    def test_convert_proforma_links_back(self, proforma_with_items, test_user):
        """New invoice should link back to original proforma."""
        new_invoice = proforma_with_items.convert_to_invoice(converted_by=test_user)

        assert new_invoice.converted_from_proforma == proforma_with_items
        assert new_invoice.converted_from_proforma.pk == proforma_with_items.pk

    def test_convert_proforma_copies_items(self, proforma_with_items, test_user):
        """Conversion should copy all items to new invoice."""
        original_item_count = proforma_with_items.items.count()

        new_invoice = proforma_with_items.convert_to_invoice(converted_by=test_user)

        assert new_invoice.items.count() == original_item_count

    def test_convert_proforma_copies_totals(self, proforma_with_items, test_user):
        """Conversion should preserve totals."""
        original_total = proforma_with_items.total_amount

        new_invoice = proforma_with_items.convert_to_invoice(converted_by=test_user)

        assert new_invoice.total_amount == original_total

    def test_converted_invoice_has_inv_number(self, proforma_with_items, test_user):
        """Converted invoice should have INV-... number format."""
        new_invoice = proforma_with_items.convert_to_invoice(converted_by=test_user)

        assert new_invoice.invoice_number.startswith("INV-")

    def test_proforma_marked_as_converted(self, proforma_with_items, test_user):
        """Original proforma should be marked as converted."""
        proforma_with_items.convert_to_invoice(converted_by=test_user)

        proforma_with_items.refresh_from_db()
        assert proforma_with_items.is_converted is True
        assert proforma_with_items.converted_at is not None

    def test_converted_proforma_cannot_convert_again(self, proforma_with_items, test_user):
        """A converted proforma cannot be converted again."""
        proforma_with_items.convert_to_invoice(converted_by=test_user)

        with pytest.raises(ValidationError) as exc_info:
            proforma_with_items.convert_to_invoice(converted_by=test_user)

        assert "already been converted" in str(exc_info.value).lower()

    def test_only_proforma_can_be_converted(self, sample_patient, test_user):
        """Only proforma status invoices can be converted."""
        regular_invoice = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            status=Invoice.Status.DRAFT,
            payment_type=Invoice.PaymentType.CASH,
            created_by=test_user,
        )

        with pytest.raises(ValidationError) as exc_info:
            regular_invoice.convert_to_invoice(converted_by=test_user)

        assert "only proforma" in str(exc_info.value).lower()

    def test_expired_proforma_cannot_convert(self, sample_patient, test_user):
        """Expired proforma cannot be converted."""
        expired_proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=45),
            due_date=date.today() - timedelta(days=15),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            valid_until=date.today() - timedelta(days=15),
            created_by=test_user,
        )

        with pytest.raises(ValidationError) as exc_info:
            expired_proforma.convert_to_invoice(converted_by=test_user)

        assert "expired" in str(exc_info.value).lower()


# =============================================================================
# Partial Conversion Tests
# =============================================================================


@pytest.mark.django_db
class TestPartialConversion:
    """Tests for partial proforma conversion."""

    def test_convert_specific_items_only(self, proforma_with_items, test_user):
        """Should be able to convert only specific items."""
        # Get first item only
        item_ids = [proforma_with_items.items.first().pk]

        new_invoice = proforma_with_items.convert_to_invoice(
            converted_by=test_user,
            item_ids=item_ids,
        )

        assert new_invoice.items.count() == 1

    def test_partial_conversion_updates_proforma_items(self, proforma_with_items, test_user):
        """Converted items should be marked on proforma."""
        item_to_convert = proforma_with_items.items.first()
        item_ids = [item_to_convert.pk]

        proforma_with_items.convert_to_invoice(
            converted_by=test_user,
            item_ids=item_ids,
        )

        item_to_convert.refresh_from_db()
        assert item_to_convert.is_converted is True

    def test_partial_conversion_proforma_remains_active(self, proforma_with_items, test_user):
        """Proforma with unconverted items remains active."""
        item_ids = [proforma_with_items.items.first().pk]

        proforma_with_items.convert_to_invoice(
            converted_by=test_user,
            item_ids=item_ids,
        )

        proforma_with_items.refresh_from_db()
        # Proforma should still be active since not all items converted
        assert proforma_with_items.status == Invoice.Status.PROFORMA
        assert proforma_with_items.is_converted is False

    def test_full_conversion_when_all_items_converted(self, proforma_with_items, test_user):
        """Proforma marked converted when all items are converted."""
        all_item_ids = list(proforma_with_items.items.values_list("pk", flat=True))

        proforma_with_items.convert_to_invoice(
            converted_by=test_user,
            item_ids=all_item_ids,
        )

        proforma_with_items.refresh_from_db()
        assert proforma_with_items.is_converted is True

    def test_cannot_convert_already_converted_items(self, proforma_with_items, test_user):
        """Cannot convert items that were already converted."""
        item_ids = [proforma_with_items.items.first().pk]

        # First conversion
        proforma_with_items.convert_to_invoice(
            converted_by=test_user,
            item_ids=item_ids,
        )

        # Try to convert same items again
        with pytest.raises(ValidationError) as exc_info:
            proforma_with_items.convert_to_invoice(
                converted_by=test_user,
                item_ids=item_ids,
            )

        assert "already been converted" in str(exc_info.value).lower()

    def test_multiple_partial_conversions(self, proforma_with_items, test_user):
        """Should be able to do multiple partial conversions."""
        items = list(proforma_with_items.items.all())

        # First partial conversion
        invoice1 = proforma_with_items.convert_to_invoice(
            converted_by=test_user,
            item_ids=[items[0].pk],
        )

        # Second partial conversion
        invoice2 = proforma_with_items.convert_to_invoice(
            converted_by=test_user,
            item_ids=[items[1].pk],
        )

        assert invoice1.pk != invoice2.pk
        assert invoice1.items.count() == 1
        assert invoice2.items.count() == 1


# =============================================================================
# Proforma Payment Restriction Tests
# =============================================================================


@pytest.mark.django_db
class TestProformaPaymentRestriction:
    """Tests for proforma payment restrictions."""

    def test_proforma_cannot_be_paid_directly(self, proforma_with_items, test_user):
        """Proforma cannot receive payments - must convert first."""
        from hmis.apps.billing.models import Payment

        with pytest.raises(ValidationError) as exc_info:
            Payment.objects.create(
                invoice=proforma_with_items,
                amount=Decimal("500.00"),
                method=Payment.Method.CASH,
                received_by=test_user,
            )

        assert "proforma" in str(exc_info.value).lower()

    def test_proforma_cannot_transition_to_paid(self, proforma_invoice):
        """Proforma status cannot transition directly to paid."""
        with pytest.raises(ValidationError):
            proforma_invoice.status = Invoice.Status.PAID
            proforma_invoice.full_clean()


# =============================================================================
# Proforma API Tests
# =============================================================================


@pytest.mark.django_db
class TestProformaAPI:
    """Tests for proforma invoice API endpoints."""

    def test_create_proforma_via_api(self, authenticated_client, sample_patient):
        """Should be able to create proforma via API."""
        response = authenticated_client.post(
            "/api/billing/invoices/",
            {
                "patient": sample_patient.pk,
                "status": "proforma",
                "payment_type": "cash",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "proforma"
        assert response.data["invoice_number"].startswith("PRO-")

    def test_convert_proforma_via_api(self, authenticated_client, proforma_with_items):
        """Should be able to convert proforma via API."""
        response = authenticated_client.post(
            f"/api/billing/invoices/{proforma_with_items.pk}/convert/",
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["invoice_number"].startswith("INV-")
        assert response.data["converted_from_proforma"] == proforma_with_items.pk

    def test_partial_convert_via_api(self, authenticated_client, proforma_with_items):
        """Should be able to partially convert via API."""
        item_ids = [proforma_with_items.items.first().pk]

        response = authenticated_client.post(
            f"/api/billing/invoices/{proforma_with_items.pk}/convert/",
            {"item_ids": item_ids},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data["items"]) == 1

    def test_filter_proformas_via_api(self, authenticated_client, proforma_invoice):
        """Should be able to filter for proformas only."""
        response = authenticated_client.get(
            "/api/billing/invoices/",
            {"status": "proforma"},
        )

        assert response.status_code == status.HTTP_200_OK
        for invoice in response.data["results"]:
            assert invoice["status"] == "proforma"

    def test_proforma_serializer_includes_validity(self, authenticated_client, proforma_invoice):
        """Proforma response should include validity information."""
        response = authenticated_client.get(
            f"/api/billing/invoices/{proforma_invoice.pk}/",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "valid_until" in response.data
        assert "is_valid" in response.data
        assert "days_until_expiry" in response.data

    def test_proforma_serializer_includes_conversion_status(
        self, authenticated_client, proforma_invoice
    ):
        """Proforma response should include conversion status."""
        response = authenticated_client.get(
            f"/api/billing/invoices/{proforma_invoice.pk}/",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "is_converted" in response.data
        assert "can_convert" in response.data


# =============================================================================
# Proforma Renewal Tests
# =============================================================================


@pytest.mark.django_db
class TestProformaRenewal:
    """Tests for renewing expired proformas."""

    def test_renew_expired_proforma(self, sample_patient, test_user):
        """Should be able to renew an expired proforma."""
        expired_proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=45),
            due_date=date.today() - timedelta(days=15),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            valid_until=date.today() - timedelta(days=15),
            created_by=test_user,
        )

        renewed = expired_proforma.renew(renewed_by=test_user)

        assert renewed.pk != expired_proforma.pk
        assert renewed.status == Invoice.Status.PROFORMA
        assert renewed.is_valid is True
        assert renewed.valid_until >= date.today()

    def test_renew_copies_items(self, sample_patient, test_user, test_service):
        """Renewed proforma should copy items from original."""
        expired_proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=45),
            due_date=date.today() - timedelta(days=15),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            valid_until=date.today() - timedelta(days=15),
            created_by=test_user,
        )
        InvoiceItem.objects.create(
            invoice=expired_proforma,
            item_type=InvoiceItem.ItemType.SERVICE,
            service=test_service,
            description="Test Service",
            quantity=1,
            unit_price=Decimal("500.00"),
        )

        renewed = expired_proforma.renew(renewed_by=test_user)

        assert renewed.items.count() == expired_proforma.items.count()

    def test_original_proforma_marked_as_renewed(self, sample_patient, test_user):
        """Original proforma should be marked as renewed."""
        expired_proforma = Invoice.objects.create(
            patient=sample_patient,
            invoice_date=date.today() - timedelta(days=45),
            due_date=date.today() - timedelta(days=15),
            status=Invoice.Status.PROFORMA,
            payment_type=Invoice.PaymentType.CASH,
            valid_until=date.today() - timedelta(days=15),
            created_by=test_user,
        )

        renewed = expired_proforma.renew(renewed_by=test_user)

        expired_proforma.refresh_from_db()
        assert expired_proforma.renewed_to == renewed
        assert expired_proforma.status == Invoice.Status.CANCELLED
