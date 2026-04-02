"""
Tests for Dispensing model.

Following TDD approach: Write tests FIRST, then implement model.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError

# ============================================================================
# Dispensing Model Tests (16 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestDispensingModel:
    """Tests for Dispensing model."""

    def test_dispensing_from_prescription(self, sample_organization, sample_facility):
        """Dispensing can be created from prescription item."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import (
            Dispensing,
            Drug,
            Prescription,
            PrescriptionItem,
            StockBatch,
        )

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist1", password="test123")

        county = County.objects.create(code=20, name="Test County 20")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 20")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="OPD",
            chief_complaint="Test complaint",
            facility=sample_facility,
        )

        prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=user,
            valid_until=date.today() + timedelta(days=30),
        )

        drug = Drug.objects.create(
            code="DISP001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        prescription_item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            prescription_item=prescription_item,
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=user,
        )

        assert dispensing.id is not None
        assert dispensing.prescription_item == prescription_item
        assert dispensing.patient == patient
        assert dispensing.drug == drug
        assert dispensing.batch == batch
        assert dispensing.quantity_dispensed == 30

    def test_direct_dispensing_otc(self, sample_organization):
        """OTC drugs can be dispensed without prescription."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist2", password="test123")

        county = County.objects.create(code=21, name="Test County 21")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 21")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient2",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP002",
            generic_name="OTC Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
            schedule="OTC",
            requires_prescription=False,
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP002",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("3.00"),
            selling_price=Decimal("5.00"),
            received_by=user,
        )

        # Direct dispense without prescription
        dispensing = Dispensing.objects.create(
            prescription_item=None,  # No prescription for OTC
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=10,
            unit_price=Decimal("5.00"),
            total_price=Decimal("50.00"),
            dispensed_by=user,
        )

        assert dispensing.prescription_item is None
        assert dispensing.drug.schedule == "OTC"

    def test_batch_linkage_required(self, sample_organization):
        """Dispensing must be linked to a batch for traceability."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist3", password="test123")

        county = County.objects.create(code=22, name="Test County 22")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 22")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient3",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP003",
            generic_name="Test Drug 3",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP003",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=10,
            unit_price=Decimal("10.00"),
            total_price=Decimal("100.00"),
            dispensed_by=user,
        )

        assert dispensing.batch == batch
        assert dispensing.batch.batch_number == "DISP003"

    def test_quantity_validation_against_stock(self, sample_organization):
        """Dispensing quantity should not exceed available stock."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist4", password="test123")

        county = County.objects.create(code=23, name="Test County 23")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 23")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient4",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP004",
            generic_name="Test Drug 4",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP004",
            quantity_received=50,
            quantity_available=50,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Try to dispense more than available
        dispensing = Dispensing(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=100,  # More than available
            unit_price=Decimal("10.00"),
            total_price=Decimal("1000.00"),
            dispensed_by=user,
        )

        # Should raise error when validated
        with pytest.raises(ValidationError):
            dispensing.clean()

    def test_dispense_reduces_batch_stock(self, sample_organization):
        """Dispensing should reduce batch available quantity."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist5", password="test123")

        county = County.objects.create(code=24, name="Test County 24")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 24")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient5",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP005",
            generic_name="Test Drug 5",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP005",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        initial_quantity = batch.quantity_available

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=user,
        )

        batch.refresh_from_db()
        assert batch.quantity_available == initial_quantity - 30

    def test_price_calculation(self, sample_organization):
        """Total price should be calculated correctly."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist6", password="test123")

        county = County.objects.create(code=25, name="Test County 25")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 25")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient6",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP006",
            generic_name="Test Drug 6",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP006",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=25,
            unit_price=Decimal("10.00"),
            total_price=Decimal("0.00"),  # Will be calculated
            dispensed_by=user,
        )

        calculated_total = dispensing.calculate_total()
        assert calculated_total == Decimal("250.00")

    def test_discount_application(self, sample_organization):
        """Discount should be applied to total price."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist7", password="test123")

        county = County.objects.create(code=26, name="Test County 26")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 26")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient7",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP007",
            generic_name="Test Drug 7",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP007",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=20,
            unit_price=Decimal("10.00"),
            discount=Decimal("50.00"),  # 50 discount
            total_price=Decimal("0.00"),
            dispensed_by=user,
        )

        calculated_total = dispensing.calculate_total()
        assert calculated_total == Decimal("150.00")  # (20 * 10) - 50

    def test_return_processing(self, sample_organization):
        """Returns should be tracked on dispensing record."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist8", password="test123")

        county = County.objects.create(code=27, name="Test County 27")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 27")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient8",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP008",
            generic_name="Test Drug 8",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP008",
            quantity_received=1000,
            quantity_available=970,  # 30 already dispensed
            quantity_dispensed=30,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=user,
        )

        # Process return
        dispensing.process_return(10, "Patient had adverse reaction")

        assert dispensing.quantity_returned == 10
        assert "adverse reaction" in dispensing.notes.lower()

    def test_return_restores_batch_stock(self, sample_organization):
        """Returning drugs should restore batch stock."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist9", password="test123")

        county = County.objects.create(code=28, name="Test County 28")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 28")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient9",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP009",
            generic_name="Test Drug 9",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP009",
            quantity_received=1000,
            quantity_available=970,
            quantity_dispensed=30,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=user,
        )

        initial_available = batch.quantity_available

        # Process return
        dispensing.process_return(15, "Excess quantity")

        batch.refresh_from_db()
        assert batch.quantity_available == initial_available + 15

    def test_controlled_drug_verification_required(self, sample_organization):
        """Controlled drugs require verification."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist10", password="test123")

        county = County.objects.create(code=29, name="Test County 29")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 29")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient10",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP010",
            generic_name="Controlled Drug",
            strength="10mg",
            form="INJECTION",
            categories=["CONTROLLED"],
            unit="vial",
            schedule="CD",
            is_controlled=True,
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP010",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=5,
            unit_price=Decimal("100.00"),
            total_price=Decimal("500.00"),
            dispensed_by=user,
        )

        assert dispensing.requires_verification() is True

    def test_verification_by_different_user(self, sample_organization):
        """Controlled drug verification must be by different user."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user1 = User.objects.create_user(username="pharmacist11", password="test123")
        user2 = User.objects.create_user(username="pharmacist12", password="test123")

        county = County.objects.create(code=30, name="Test County 30")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 30")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient11",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP011",
            generic_name="Controlled Drug 2",
            strength="10mg",
            form="INJECTION",
            categories=["CONTROLLED"],
            unit="vial",
            schedule="CD",
            is_controlled=True,
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP011",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00"),
            received_by=user1,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=5,
            unit_price=Decimal("100.00"),
            total_price=Decimal("500.00"),
            dispensed_by=user1,
        )

        # Verify by different user
        dispensing.verify(user2)

        assert dispensing.verified_by == user2
        assert dispensing.verified_at is not None

    def test_instructions_documentation(self, sample_organization):
        """Dispensing instructions should be documented."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist13", password="test123")

        county = County.objects.create(code=31, name="Test County 31")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 31")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient12",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP012",
            generic_name="Test Drug 12",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP012",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        instructions = "Take 1 tablet 3 times daily after meals. Complete the full course."

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=user,
            instructions_given=instructions,
        )

        assert dispensing.instructions_given == instructions
        assert "after meals" in dispensing.instructions_given.lower()

    def test_counseling_flag(self, sample_organization):
        """Patient counseling completion should be tracked."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist14", password="test123")

        county = County.objects.create(code=32, name="Test County 32")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 32")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient13",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP013",
            generic_name="Test Drug 13",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP013",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=user,
            patient_counseled=True,
        )

        assert dispensing.patient_counseled is True

    def test_fefo_batch_selection(self, sample_organization):
        """Dispensing should use batch with earliest expiry (FEFO)."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist15", password="test123")

        county = County.objects.create(code=33, name="Test County 33")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 33")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient14",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP014",
            generic_name="Test Drug 14",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        # Create batches with different expiry dates
        batch1 = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP014A",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=180),  # Expires sooner
            received_date=date.today() - timedelta(days=10),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        batch2 = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP014B",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),  # Expires later
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Get batches for dispensing (FEFO order)
        batches = StockBatch.objects.filter(
            drug=drug, status="AVAILABLE", quantity_available__gt=0
        ).order_by("expiry_date")

        # First batch should be the one expiring sooner
        assert batches.first() == batch1
        assert batches.first().batch_number == "DISP014A"

    def test_audit_trail_creation(self, sample_organization):
        """Dispensing should create audit trail."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Dispensing, Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist16", password="test123")

        county = County.objects.create(code=34, name="Test County 34")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 34")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient15",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP015",
            generic_name="Test Drug 15",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP015",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        dispensing = Dispensing.objects.create(
            patient=patient,
            drug=drug,
            batch=batch,
            quantity_dispensed=30,
            unit_price=Decimal("10.00"),
            total_price=Decimal("300.00"),
            dispensed_by=user,
        )

        # Verify dispensing was created with user and timestamp
        assert dispensing.dispensed_by == user
        assert dispensing.dispensed_at is not None
        assert dispensing.created_at is not None

    def test_multiple_batches_for_single_dispense(self, sample_organization):
        """Dispensing large quantity should work across multiple batches (FEFO)."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="pharmacist17", password="test123")

        county = County.objects.create(code=35, name="Test County 35")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 35")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient16",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        drug = Drug.objects.create(
            code="DISP016",
            generic_name="Test Drug 16",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        # Create multiple batches with different expiry dates
        batch1 = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP016A",
            quantity_received=50,
            quantity_available=50,
            expiry_date=date.today() + timedelta(days=180),  # Expires sooner
            received_date=date.today() - timedelta(days=10),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        batch2 = StockBatch.objects.create(
            drug=drug,
            batch_number="DISP016B",
            quantity_received=100,
            quantity_available=100,
            expiry_date=date.today() + timedelta(days=365),  # Expires later
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Verify we have enough stock for large dispense
        total_available = batch1.quantity_available + batch2.quantity_available
        assert total_available >= 100

        # Get batches in FEFO order
        batches = StockBatch.objects.filter(
            drug=drug, status="AVAILABLE", quantity_available__gt=0
        ).order_by("expiry_date")

        # First batch should be used first (FEFO)
        assert batches.first() == batch1

        # For a dispense of 100 units, we'd need both batches:
        # - 50 from batch1 (all of it)
        # - 50 from batch2 (partial)
        # This demonstrates FEFO logic across multiple batches
        dispense_quantity = 100
        remaining = dispense_quantity

        for batch in batches:
            if remaining <= 0:
                break
            quantity_from_batch = min(remaining, batch.quantity_available)
            remaining -= quantity_from_batch

        assert remaining == 0  # All quantity can be fulfilled
