"""
Tests for SHAClaimItem model.

Following TDD principles, these tests define the expected behavior of the
SHAClaimItem model for SHA (Social Health Authority) claims integration
as specified in Sprint 2.1-2.2 deliverables.

Test Coverage (15 tests):
- Test claim item creation with valid data
- Test quantity must be positive
- Test unit price cannot be negative
- Test claimed amount auto-calculated on save
- Test max quantity validation against tariff
- Test apply_tariff() updates pricing
- Test create_from_invoice_item() with tariff
- Test create_from_invoice_item() auto-finds tariff
- Test create_from_invoice_item() without tariff uses invoice price
- Test parent claim total updates on item save
- Test item status choices
- Test approved amount and quantity fields
- Test rejection reason storage
- Test service date validation
- Test cascade delete with parent claim
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

# =============================================================================
# Fixtures specific to SHAClaimItem tests
# =============================================================================


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an active SHA member for testing claims."""
    from hmis.apps.billing.models import SHAMember

    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number='SHA-1234567890',
        national_id='12345678',
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        eligibility_valid_until=date.today() + timedelta(days=30),
        created_by=test_user,
    )


@pytest.fixture
def sha_tariff(db):
    """Create a SHA tariff for testing claim items."""
    from hmis.apps.billing.models import SHATariff

    return SHATariff.objects.create(
        code='SHA-CONS-001',
        name='General Consultation',
        category=SHATariff.TariffCategory.CONSULTATION,
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        sha_amount=Decimal('500.00'),
        effective_date=date.today() - timedelta(days=30),
        is_active=True,
        max_quantity_per_claim=5,
    )


@pytest.fixture
def sha_tariff_with_low_max_quantity(db):
    """Create a SHA tariff with low max quantity for validation tests."""
    from hmis.apps.billing.models import SHATariff

    return SHATariff.objects.create(
        code='SHA-LAB-001',
        name='Lab Test',
        category=SHATariff.TariffCategory.LABORATORY,
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        sha_amount=Decimal('200.00'),
        effective_date=date.today() - timedelta(days=30),
        is_active=True,
        max_quantity_per_claim=2,  # Low max for testing
    )


@pytest.fixture
def sample_invoice(db, sample_patient, test_user):
    """Create a sample invoice for testing."""
    from hmis.apps.billing.models import Invoice

    return Invoice.objects.create(
        patient=sample_patient,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        status=Invoice.Status.DRAFT,
        payment_type=Invoice.PaymentType.INSURANCE,
        created_by=test_user,
    )


@pytest.fixture
def sha_claim(db, sha_member, sample_encounter, sample_invoice, test_user):
    """Create a SHA claim for testing claim items."""
    from hmis.apps.billing.models import SHAClaim

    return SHAClaim.objects.create(
        patient=sha_member.patient,
        sha_member=sha_member,
        encounter=sample_encounter,
        invoice=sample_invoice,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        service_date=date.today(),
        primary_diagnosis_code='J06.9',
        primary_diagnosis_description='Acute upper respiratory infection',
        facility_code='MFL-12345',
        facility_level='L3',
        created_by=test_user,
    )


@pytest.fixture
def sample_service_category(db):
    """Create a sample service category for testing."""
    from hmis.apps.billing.models import ServiceCategory

    return ServiceCategory.objects.create(
        code='CONS',
        name='Consultation',
        description='Consultation services',
        is_active=True,
    )


@pytest.fixture
def sample_service(db, sample_service_category, test_user):
    """Create a sample service for testing."""
    from hmis.apps.billing.models import Service

    return Service.objects.create(
        code='SVC-CONS-001',
        name='General Consultation',
        category=sample_service_category,
        unit_price=Decimal('600.00'),
        is_active=True,
        created_by=test_user,
    )


@pytest.fixture
def sample_invoice_item(db, sample_invoice, sample_service):
    """Create a sample invoice item for testing create_from_invoice_item."""
    from hmis.apps.billing.models import InvoiceItem

    return InvoiceItem.objects.create(
        invoice=sample_invoice,
        item_type=InvoiceItem.ItemType.SERVICE,
        service=sample_service,
        description='General Consultation Service',
        quantity=Decimal('1.00'),
        unit_price=Decimal('600.00'),
        line_total=Decimal('600.00'),
    )


# =============================================================================
# Test Class: SHAClaimItem Model
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimItemModel:
    """Tests for SHAClaimItem model following Sprint 2.1-2.2 deliverables spec."""

    # =========================================================================
    # Test 1: Claim item creation with valid data
    # =========================================================================
    def test_claim_item_creation_with_valid_data(self, sha_claim, sha_tariff):
        """Should create claim item with valid data."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='General Consultation',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
        )

        assert item.id is not None
        assert item.claim == sha_claim
        assert item.tariff == sha_tariff
        assert item.description == 'General Consultation'
        assert item.quantity == 1
        assert item.unit_price == Decimal('500.00')
        assert item.claimed_amount == Decimal('500.00')
        assert item.rejection_reason == ''

    # =========================================================================
    # Test 2: Quantity must be positive
    # =========================================================================
    def test_quantity_must_be_positive(self, sha_claim, sha_tariff):
        """Should reject zero or negative quantity."""
        from hmis.apps.billing.models import SHAClaimItem

        with pytest.raises(ValidationError) as exc_info:
            SHAClaimItem.objects.create(
                claim=sha_claim,
                tariff=sha_tariff,
                description='Test Item',
                quantity=0,  # Invalid - must be positive
                unit_price=Decimal('500.00'),
                claimed_amount=Decimal('0.00'),
            )

        assert 'quantity' in str(exc_info.value)

    def test_negative_quantity_rejected(self, sha_claim, sha_tariff):
        """Should reject negative quantity."""
        from hmis.apps.billing.models import SHAClaimItem

        with pytest.raises(ValidationError) as exc_info:
            SHAClaimItem.objects.create(
                claim=sha_claim,
                tariff=sha_tariff,
                description='Test Item',
                quantity=-1,  # Invalid - negative
                unit_price=Decimal('500.00'),
                claimed_amount=Decimal('-500.00'),
            )

        assert 'quantity' in str(exc_info.value)

    # =========================================================================
    # Test 3: Unit price cannot be negative
    # =========================================================================
    def test_unit_price_cannot_be_negative(self, sha_claim, sha_tariff):
        """Should reject negative unit price."""
        from hmis.apps.billing.models import SHAClaimItem

        with pytest.raises(ValidationError) as exc_info:
            SHAClaimItem.objects.create(
                claim=sha_claim,
                tariff=sha_tariff,
                description='Test Item',
                quantity=1,
                unit_price=Decimal('-100.00'),  # Invalid - negative
                claimed_amount=Decimal('-100.00'),
            )

        assert 'unit_price' in str(exc_info.value)

    def test_zero_unit_price_allowed(self, sha_claim):
        """Should allow zero unit price (free services)."""
        from hmis.apps.billing.models import SHAClaimItem

        # Zero price should be allowed (e.g., free services covered by SHA)
        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            description='Free Service',
            quantity=1,
            unit_price=Decimal('0.00'),
            claimed_amount=Decimal('0.00'),
        )

        assert item.unit_price == Decimal('0.00')

    # =========================================================================
    # Test 4: Claimed amount auto-calculated on save
    # =========================================================================
    def test_claimed_amount_auto_calculated_on_save(self, sha_claim, sha_tariff):
        """Should auto-calculate claimed amount as quantity × unit_price on save."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Multiple Units',
            quantity=3,
            unit_price=Decimal('200.00'),
            claimed_amount=Decimal('0.00'),  # Will be overwritten
        )
        item.save()

        # Should auto-calculate: 3 × 200 = 600
        assert item.claimed_amount == Decimal('600.00')

    def test_claimed_amount_recalculated_on_update(self, sha_claim, sha_tariff):
        """Should recalculate claimed amount when quantity or price changes."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Test Item',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
        )

        # Update quantity
        item.quantity = 2
        item.save()

        # Should recalculate: 2 × 500 = 1000
        assert item.claimed_amount == Decimal('1000.00')

    # =========================================================================
    # Test 5: Max quantity validation against tariff
    # =========================================================================
    def test_max_quantity_validation_against_tariff(
        self, sha_claim, sha_tariff_with_low_max_quantity
    ):
        """Should reject quantity exceeding tariff max_quantity_per_claim."""
        from hmis.apps.billing.models import SHAClaimItem

        # Tariff has max_quantity_per_claim = 2
        with pytest.raises(ValidationError) as exc_info:
            SHAClaimItem.objects.create(
                claim=sha_claim,
                tariff=sha_tariff_with_low_max_quantity,
                description='Lab Test',
                quantity=5,  # Exceeds max of 2
                unit_price=Decimal('200.00'),
                claimed_amount=Decimal('1000.00'),
            )

        assert 'quantity' in str(exc_info.value)
        assert 'maximum' in str(exc_info.value).lower() or 'max' in str(exc_info.value).lower()

    def test_quantity_at_max_allowed(self, sha_claim, sha_tariff_with_low_max_quantity):
        """Should allow quantity exactly at max_quantity_per_claim."""
        from hmis.apps.billing.models import SHAClaimItem

        # Tariff has max_quantity_per_claim = 2
        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff_with_low_max_quantity,
            description='Lab Test',
            quantity=2,  # Exactly at max
            unit_price=Decimal('200.00'),
            claimed_amount=Decimal('400.00'),
        )

        assert item.quantity == 2

    # =========================================================================
    # Test 6: apply_tariff() updates pricing
    # =========================================================================
    def test_apply_tariff_updates_pricing(self, sha_claim, sha_tariff):
        """Should update unit_price and claimed_amount when tariff is applied."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            description='Test Item',
            quantity=2,
            unit_price=Decimal('100.00'),  # Initial price
            claimed_amount=Decimal('200.00'),
        )

        # Apply tariff with sha_amount = 500.00
        item.apply_tariff(sha_tariff)

        assert item.tariff == sha_tariff
        assert item.unit_price == Decimal('500.00')
        assert item.claimed_amount == Decimal('1000.00')  # 2 × 500

    def test_apply_tariff_saves_item(self, sha_claim, sha_tariff):
        """Should save item after applying tariff."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            description='Test Item',
            quantity=1,
            unit_price=Decimal('100.00'),
            claimed_amount=Decimal('100.00'),
        )

        item.apply_tariff(sha_tariff)

        # Reload from database
        item.refresh_from_db()
        assert item.tariff == sha_tariff
        assert item.unit_price == Decimal('500.00')

    # =========================================================================
    # Test 7: create_from_invoice_item() with tariff
    # =========================================================================
    def test_create_from_invoice_item_with_tariff(
        self, sha_claim, sample_invoice_item, sha_tariff
    ):
        """Should create claim item from invoice item with provided tariff."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.create_from_invoice_item(
            claim=sha_claim,
            invoice_item=sample_invoice_item,
            tariff=sha_tariff,
        )

        assert item.claim == sha_claim
        assert item.tariff == sha_tariff
        assert item.invoice_item == sample_invoice_item
        assert item.service == sample_invoice_item.service
        assert item.description == sample_invoice_item.description
        assert item.quantity == sample_invoice_item.quantity
        assert item.unit_price == sha_tariff.sha_amount  # Uses tariff price

    # =========================================================================
    # Test 8: create_from_invoice_item() auto-finds tariff
    # =========================================================================
    def test_create_from_invoice_item_auto_finds_tariff(
        self, sha_claim, sample_invoice_item, sample_service
    ):
        """Should auto-find matching tariff when not provided."""
        from hmis.apps.billing.models import SHAClaimItem, SHATariff

        # Create a tariff that maps to the service via internal_service FK
        tariff = SHATariff.objects.create(
            code='SHA-AUTO-001',
            name='Auto-matched Tariff',
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,  # Matches claim facility_level
            sha_amount=Decimal('450.00'),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
            internal_service=sample_service,  # Link tariff to service
        )

        item = SHAClaimItem.create_from_invoice_item(
            claim=sha_claim,
            invoice_item=sample_invoice_item,
            # tariff not provided - should auto-find
        )

        assert item.tariff == tariff
        assert item.unit_price == tariff.sha_amount

    # =========================================================================
    # Test 9: create_from_invoice_item() without tariff uses invoice price
    # =========================================================================
    def test_create_from_invoice_item_without_tariff_uses_invoice_price(
        self, sha_claim, sample_invoice_item
    ):
        """Should use invoice item price when no tariff found."""
        from hmis.apps.billing.models import SHAClaimItem

        # No tariff is linked to the service, so it should use invoice price
        item = SHAClaimItem.create_from_invoice_item(
            claim=sha_claim,
            invoice_item=sample_invoice_item,
            # No tariff provided and no auto-match
        )

        assert item.tariff is None
        assert item.unit_price == sample_invoice_item.unit_price

    # =========================================================================
    # Test 10: Parent claim total updates on item save
    # =========================================================================
    def test_parent_claim_total_updates_on_item_save(self, sha_claim, sha_tariff):
        """Should update parent claim's claimed_amount when item is saved."""
        from hmis.apps.billing.models import SHAClaimItem

        # Initial claim amount
        sha_claim.refresh_from_db()
        initial_amount = sha_claim.claimed_amount

        # Create item
        SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='First Item',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
        )

        sha_claim.refresh_from_db()
        assert sha_claim.claimed_amount == Decimal('500.00')

        # Add another item
        SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Second Item',
            quantity=2,
            unit_price=Decimal('300.00'),
            claimed_amount=Decimal('600.00'),
        )

        sha_claim.refresh_from_db()
        assert sha_claim.claimed_amount == Decimal('1100.00')  # 500 + 600

    # =========================================================================
    # Test 11: Item status choices
    # =========================================================================
    def test_item_status_choices(self, sha_claim):
        """Should accept all valid item status choices."""
        from hmis.apps.billing.models import SHAClaimItem

        statuses = ['pending', 'approved', 'rejected', 'adjusted']

        for status in statuses:
            item = SHAClaimItem.objects.create(
                claim=sha_claim,
                description=f'Item with {status} status',
                quantity=1,
                unit_price=Decimal('100.00'),
                claimed_amount=Decimal('100.00'),
                status=status,
            )
            assert item.status == status
            item.delete()

    def test_invalid_status_rejected(self, sha_claim):
        """Should reject invalid status choices."""
        from hmis.apps.billing.models import SHAClaimItem

        with pytest.raises(ValidationError):
            item = SHAClaimItem(
                claim=sha_claim,
                description='Test Item',
                quantity=1,
                unit_price=Decimal('100.00'),
                claimed_amount=Decimal('100.00'),
                status='invalid_status',
            )
            item.full_clean()

    # =========================================================================
    # Test 12: Approved amount and quantity fields
    # =========================================================================
    def test_approved_amount_and_quantity_fields(self, sha_claim, sha_tariff):
        """Should store approved amount and quantity from adjudication."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Test Item',
            quantity=3,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('1500.00'),
            status='approved',
            approved_quantity=2,  # SHA approved 2 of 3
            approved_amount=Decimal('1000.00'),  # 2 × 500
        )

        assert item.approved_quantity == 2
        assert item.approved_amount == Decimal('1000.00')

    def test_approved_fields_nullable(self, sha_claim):
        """Should allow null approved fields for pending items."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            description='Pending Item',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
            status='pending',
            # approved_quantity and approved_amount not set
        )

        assert item.approved_quantity is None
        assert item.approved_amount is None

    # =========================================================================
    # Test 13: Rejection reason storage
    # =========================================================================
    def test_rejection_reason_storage(self, sha_claim, sha_tariff):
        """Should store rejection reason for rejected items."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Test Item',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
            status='rejected',
            rejection_reason='Service not covered under patient benefit plan',
        )

        assert item.rejection_reason == 'Service not covered under patient benefit plan'

    def test_rejection_reason_blank_for_approved(self, sha_claim):
        """Should allow blank rejection reason for approved items."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            description='Approved Item',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
            status='approved',
            rejection_reason='',  # Blank is fine
        )

        assert item.rejection_reason == ''

    # =========================================================================
    # Test 14: Service date validation
    # =========================================================================
    def test_service_date_stored(self, sha_claim, sha_tariff):
        """Should store service date for the claim item."""
        from hmis.apps.billing.models import SHAClaimItem

        service_date = date.today() - timedelta(days=5)

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Test Item',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
            service_date=service_date,
        )

        assert item.service_date == service_date

    def test_service_date_defaults_to_claim_service_date(
        self, sha_claim, sample_invoice_item, sha_tariff
    ):
        """Should default to claim's service date when created from invoice item."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.create_from_invoice_item(
            claim=sha_claim,
            invoice_item=sample_invoice_item,
            tariff=sha_tariff,
        )

        assert item.service_date == sha_claim.service_date

    # =========================================================================
    # Test 15: Cascade delete with parent claim
    # =========================================================================
    def test_cascade_delete_with_parent_claim(self, sha_claim, sha_tariff):
        """Should delete claim items when parent claim is deleted."""
        from hmis.apps.billing.models import SHAClaim, SHAClaimItem

        # Create items
        item1 = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Item 1',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
        )
        item2 = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Item 2',
            quantity=1,
            unit_price=Decimal('300.00'),
            claimed_amount=Decimal('300.00'),
        )

        item1_id = item1.id
        item2_id = item2.id
        claim_id = sha_claim.id

        # Delete parent claim
        sha_claim.delete()

        # Verify items are deleted
        assert not SHAClaimItem.objects.filter(id=item1_id).exists()
        assert not SHAClaimItem.objects.filter(id=item2_id).exists()
        assert not SHAClaim.objects.filter(id=claim_id).exists()

    def test_tariff_protected_on_item_delete(self, sha_claim, sha_tariff):
        """Should not delete tariff when claim item is deleted (PROTECT)."""
        from hmis.apps.billing.models import SHAClaimItem, SHATariff

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Test Item',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
        )

        tariff_id = sha_tariff.id

        # Delete item
        item.delete()

        # Tariff should still exist
        assert SHATariff.objects.filter(id=tariff_id).exists()


# =============================================================================
# Test Class: SHAClaimItem String Representation
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimItemStringRepresentation:
    """Tests for SHAClaimItem string representation."""

    def test_string_representation(self, sha_claim, sha_tariff):
        """Should return claim number and description."""
        from hmis.apps.billing.models import SHAClaimItem

        item = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='General Consultation',
            quantity=1,
            unit_price=Decimal('500.00'),
            claimed_amount=Decimal('500.00'),
        )

        expected = f"{sha_claim.claim_number} - General Consultation"
        assert str(item) == expected


# =============================================================================
# Test Class: SHAClaimItem Meta Options
# =============================================================================


@pytest.mark.django_db
class TestSHAClaimItemMetaOptions:
    """Tests for SHAClaimItem model Meta options."""

    def test_verbose_name(self):
        """Should have correct verbose name."""
        from hmis.apps.billing.models import SHAClaimItem

        assert SHAClaimItem._meta.verbose_name == "SHA Claim Item"
        assert SHAClaimItem._meta.verbose_name_plural == "SHA Claim Items"

    def test_ordering(self, sha_claim, sha_tariff):
        """Should order by id."""
        from hmis.apps.billing.models import SHAClaimItem

        item1 = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='First',
            quantity=1,
            unit_price=Decimal('100.00'),
            claimed_amount=Decimal('100.00'),
        )
        item2 = SHAClaimItem.objects.create(
            claim=sha_claim,
            tariff=sha_tariff,
            description='Second',
            quantity=1,
            unit_price=Decimal('200.00'),
            claimed_amount=Decimal('200.00'),
        )

        items = list(SHAClaimItem.objects.filter(claim=sha_claim))
        assert items[0].id < items[1].id
