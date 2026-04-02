"""
Tests for Stock Alert, Prescription, Dispensing, and Stock Adjustment models.

Following TDD approach: Write tests FIRST, then implement models.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore

# ============================================================================
# StockAlert Model Tests (12 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestStockAlertModel:
    """Tests for Stock Alert model."""

    def test_alert_creation_for_low_stock(self):
        """Alert can be created for low stock situation."""
        from hmis.apps.pharmacy.models import Drug, StockAlert

        drug = Drug.objects.create(
            code="ALERT001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Stock level below reorder point",
        )

        assert alert.id is not None
        assert alert.drug == drug
        assert alert.alert_type == "LOW_STOCK"
        assert alert.severity == "MEDIUM"
        assert alert.is_acknowledged is False

    def test_alert_creation_for_out_of_stock(self):
        """Alert can be created for out of stock situation."""
        from hmis.apps.pharmacy.models import Drug, StockAlert

        drug = Drug.objects.create(
            code="ALERT002",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="OUT_OF_STOCK",
            severity="CRITICAL",
            message="Drug is completely out of stock",
        )

        assert alert.alert_type == "OUT_OF_STOCK"
        assert alert.severity == "CRITICAL"

    def test_alert_creation_for_expiring_soon(self):
        """Alert can be created for expiring drugs (30/60/90 days)."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAlert, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="alertuser1", password="test123")

        drug = Drug.objects.create(
            code="ALERT003",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="EXP001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=60),  # Expiring in 60 days
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        alert = StockAlert.objects.create(
            drug=drug,
            batch=batch,
            alert_type="EXPIRING_SOON",
            severity="HIGH",
            message="Batch expiring in 60 days",
        )

        assert alert.alert_type == "EXPIRING_SOON"
        assert alert.batch == batch

    def test_alert_creation_for_expired(self):
        """Alert can be created for expired drugs."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAlert, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="alertuser2", password="test123")

        drug = Drug.objects.create(
            code="ALERT004",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        batch = StockBatch.objects.create(
            drug=drug,
            batch_number="EXPIRED001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() - timedelta(days=10),
            received_date=date.today() - timedelta(days=400),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
            status="EXPIRED",
        )

        alert = StockAlert.objects.create(
            drug=drug,
            batch=batch,
            alert_type="EXPIRED",
            severity="CRITICAL",
            message="Batch has expired",
        )

        assert alert.alert_type == "EXPIRED"
        assert alert.severity == "CRITICAL"

    def test_severity_assignment_rules(self):
        """Alert severity should be assigned based on alert type."""
        from hmis.apps.pharmacy.models import Drug, StockAlert

        drug = Drug.objects.create(
            code="ALERT005",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        # Critical severity for out of stock and expired
        critical_alert = StockAlert.objects.create(
            drug=drug,
            alert_type="OUT_OF_STOCK",
            severity="CRITICAL",
            message="Critical alert",
        )
        assert critical_alert.severity == "CRITICAL"

        # High severity for expiring soon
        high_alert = StockAlert.objects.create(
            drug=drug,
            alert_type="EXPIRING_SOON",
            severity="HIGH",
            message="High alert",
        )
        assert high_alert.severity == "HIGH"

        # Medium severity for low stock
        medium_alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Medium alert",
        )
        assert medium_alert.severity == "MEDIUM"

    def test_acknowledge_alert(self):
        """Alert can be acknowledged by a user."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAlert

        User = get_user_model()
        user = User.objects.create_user(username="alertuser3", password="test123")

        drug = Drug.objects.create(
            code="ALERT006",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock alert",
        )

        alert.acknowledge(user)

        assert alert.is_acknowledged is True
        assert alert.acknowledged_by == user
        assert alert.acknowledged_at is not None

    def test_resolve_alert_with_notes(self):
        """Alert can be resolved with resolution notes."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAlert

        User = get_user_model()
        user = User.objects.create_user(username="alertuser4", password="test123")

        drug = Drug.objects.create(
            code="ALERT007",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        alert = StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock alert",
        )

        alert.resolve(user, "New stock received")

        assert alert.is_resolved is True
        assert alert.resolved_by == user
        assert alert.resolved_at is not None
        assert alert.resolution_notes == "New stock received"

    def test_auto_generate_low_stock_alerts(self):
        """System should auto-generate alerts for low stock."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAlert, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="alertuser5", password="test123")

        drug = Drug.objects.create(
            code="ALERT008",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
            default_reorder_level=100,
        )

        # Create batch with low stock
        StockBatch.objects.create(
            drug=drug,
            batch_number="LOW001",
            quantity_received=1000,
            quantity_available=50,  # Below reorder level
            expiry_date=date.today() + timedelta(days=365),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Generate alerts
        alerts = StockAlert.generate_low_stock_alerts()

        assert len(alerts) > 0
        assert any(alert.drug == drug for alert in alerts)

    def test_auto_generate_expiry_alerts(self):
        """System should auto-generate alerts for expiring drugs."""
        from django.contrib.auth import get_user_model

        from hmis.apps.pharmacy.models import Drug, StockAlert, StockBatch

        User = get_user_model()
        user = User.objects.create_user(username="alertuser6", password="test123")

        drug = Drug.objects.create(
            code="ALERT009",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        # Create batch expiring soon
        StockBatch.objects.create(
            drug=drug,
            batch_number="EXPSOON001",
            quantity_received=1000,
            quantity_available=1000,
            expiry_date=date.today() + timedelta(days=60),
            received_date=date.today(),
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            received_by=user,
        )

        # Generate alerts
        alerts = StockAlert.generate_expiry_alerts()

        assert len(alerts) > 0
        assert any(alert.drug == drug for alert in alerts)

    def test_no_duplicate_alerts(self):
        """System should not create duplicate alerts for same condition."""
        from hmis.apps.pharmacy.models import Drug, StockAlert

        drug = Drug.objects.create(
            code="ALERT010",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        # Create first alert
        StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock alert",
        )

        # Check for existing alert before creating new one
        existing_alerts = StockAlert.objects.filter(
            drug=drug, alert_type="LOW_STOCK", is_resolved=False
        )

        assert existing_alerts.count() == 1

    def test_alert_filtering_by_type(self):
        """Alerts can be filtered by alert type."""
        from hmis.apps.pharmacy.models import Drug, StockAlert

        drug = Drug.objects.create(
            code="ALERT011",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Low stock",
        )

        StockAlert.objects.create(
            drug=drug,
            alert_type="EXPIRING_SOON",
            severity="HIGH",
            message="Expiring soon",
        )

        low_stock_alerts = StockAlert.objects.filter(alert_type="LOW_STOCK")
        expiring_alerts = StockAlert.objects.filter(alert_type="EXPIRING_SOON")

        assert low_stock_alerts.count() == 1
        assert expiring_alerts.count() == 1

    def test_alert_filtering_by_severity(self):
        """Alerts can be filtered by severity level."""
        from hmis.apps.pharmacy.models import Drug, StockAlert

        drug = Drug.objects.create(
            code="ALERT012",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        StockAlert.objects.create(
            drug=drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Medium severity",
        )

        StockAlert.objects.create(
            drug=drug,
            alert_type="OUT_OF_STOCK",
            severity="CRITICAL",
            message="Critical severity",
        )

        critical_alerts = StockAlert.objects.filter(severity="CRITICAL")
        medium_alerts = StockAlert.objects.filter(severity="MEDIUM")

        assert critical_alerts.count() == 1
        assert medium_alerts.count() == 1


# ============================================================================
# Prescription Model Tests (15 tests as per sprint deliverables)
# ============================================================================


@pytest.mark.django_db
class TestPrescriptionModel:
    """Tests for Prescription model."""

    def test_prescription_number_auto_generated(self, sample_organization, sample_facility):
        """Prescription number should be auto-generated with format RX-YYYYMMDD-XXXX."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber0", password="test123")

        county = County.objects.create(code=100, name="Test County 100")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 100")

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
            clinical_notes="Test prescription",
        )

        # Check prescription number format
        assert prescription.prescription_number is not None
        assert prescription.prescription_number.startswith("RX-")
        assert len(prescription.prescription_number) == 16  # RX-YYYYMMDD-XXXX

        # Create another prescription on the same day
        prescription2 = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=user,
            valid_until=date.today() + timedelta(days=30),
            clinical_notes="Test prescription 2",
        )

        # Check sequential numbering
        num1 = int(prescription.prescription_number.split("-")[-1])
        num2 = int(prescription2.prescription_number.split("-")[-1])
        assert num2 == num1 + 1

    def test_prescription_creation_linked_to_encounter(self, sample_organization, sample_facility):
        """Prescription can be created and linked to encounter."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber1", password="test123")

        county = County.objects.create(code=101, name="Test County")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty")

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
            clinical_notes="Test prescription",
        )

        assert prescription.id is not None
        assert prescription.encounter == encounter
        assert prescription.patient == patient
        assert prescription.prescribed_by == user
        assert prescription.status == "PENDING"

    def test_prescription_creation_linked_to_patient(self, sample_organization, sample_facility):
        """Prescription must be linked to patient."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber2", password="test123")

        county = County.objects.create(code=2, name="Test County 2")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 2")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient2",
            date_of_birth="1990-01-01",
            gender="F",
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

        # Verify patient can access their prescriptions
        assert patient.prescriptions.count() == 1
        assert patient.prescriptions.first() == prescription

    def test_prescriber_must_be_authenticated_user(self, sample_organization, sample_facility):
        """Prescriber must be an authenticated user."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber3", password="test123")

        county = County.objects.create(code=3, name="Test County 3")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 3")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient3",
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

        assert prescription.prescribed_by == user
        assert prescription.prescribed_by.username == "prescriber3"

    def test_valid_until_date_validation(self, sample_organization, sample_facility):
        """Prescription should have a valid_until date."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber4", password="test123")

        county = County.objects.create(code=4, name="Test County 4")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 4")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient4",
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

        # Valid date 30 days in future
        valid_date = date.today() + timedelta(days=30)
        prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=user,
            valid_until=valid_date,
        )

        assert prescription.valid_until == valid_date
        assert prescription.valid_until > date.today()

    def test_prescription_item_creation(self, sample_organization, sample_facility):
        """Prescription item can be created with drug linkage."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber5", password="test123")

        county = County.objects.create(code=5, name="Test County 5")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 5")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient5",
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
            code="PRESC001",
            generic_name="Test Drug",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
            route="Oral",
            instructions="Take after meals",
        )

        assert item.id is not None
        assert item.prescription == prescription
        assert item.drug == drug
        assert item.quantity == 30
        assert item.quantity_dispensed == 0

    def test_quantity_and_dosage_required(self, sample_organization, sample_facility):
        """Prescription item requires quantity and dosage."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber6", password="test123")

        county = County.objects.create(code=6, name="Test County 6")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 6")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient6",
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
            code="PRESC002",
            generic_name="Test Drug 2",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=20,
            dosage="2 tablets",
            frequency="2 times daily",
            duration="5 days",
        )

        assert item.quantity == 20
        assert item.dosage == "2 tablets"
        assert item.frequency == "2 times daily"
        assert item.duration == "5 days"

    def test_dispensed_quantity_tracking(self, sample_organization, sample_facility):
        """Prescription item tracks dispensed quantity."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber7", password="test123")

        county = County.objects.create(code=7, name="Test County 7")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 7")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient7",
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
            code="PRESC003",
            generic_name="Test Drug 3",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
            quantity_dispensed=15,
        )

        assert item.quantity_dispensed == 15
        remaining = item.quantity - item.quantity_dispensed
        assert remaining == 15

    def test_prescription_is_valid_check(self, sample_organization, sample_facility):
        """Prescription is_valid method checks if not expired."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber8", password="test123")

        county = County.objects.create(code=8, name="Test County 8")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 8")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient8",
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

        # Valid prescription
        valid_prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=user,
            valid_until=date.today() + timedelta(days=30),
        )

        assert valid_prescription.is_valid() is True

    def test_prescription_expiry(self, sample_organization, sample_facility):
        """Prescription is_valid returns False if expired."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber9", password="test123")

        county = County.objects.create(code=9, name="Test County 9")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 9")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient9",
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

        # Expired prescription
        expired_prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=user,
            valid_until=date.today() - timedelta(days=5),
            status="EXPIRED",
        )

        assert expired_prescription.is_valid() is False

    def test_partial_dispensing_status(self, sample_organization, sample_facility):
        """Prescription status updates to PARTIAL when some items dispensed."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber10", password="test123")

        county = County.objects.create(code=10, name="Test County 10")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 10")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient10",
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
            code="PRESC004",
            generic_name="Test Drug 4",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
            quantity_dispensed=15,  # Partially dispensed
        )

        prescription.update_status()

        assert prescription.status == "PARTIAL"

    def test_full_dispensing_status(self, sample_organization, sample_facility):
        """Prescription status updates to DISPENSED when all items dispensed."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber11", password="test123")

        county = County.objects.create(code=11, name="Test County 11")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 11")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient11",
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
            code="PRESC005",
            generic_name="Test Drug 5",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
            quantity_dispensed=30,  # Fully dispensed
        )

        prescription.update_status()

        assert prescription.status == "DISPENSED"

    def test_cancellation_with_reason(self, sample_organization, sample_facility):
        """Prescription can be cancelled with reason."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber12", password="test123")

        county = County.objects.create(code=12, name="Test County 12")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 12")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient12",
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
            code="PRESC006",
            generic_name="Test Drug 6",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
        )

        # Cancel prescription item
        item.cancel("Patient allergy discovered")

        assert item.is_cancelled is True
        assert item.cancellation_reason == "Patient allergy discovered"

    def test_status_auto_update(self, sample_organization, sample_facility):
        """Prescription status auto-updates based on items."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber13", password="test123")

        county = County.objects.create(code=13, name="Test County 13")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 13")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient13",
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

        assert prescription.status == "PENDING"

        drug = Drug.objects.create(
            code="PRESC007",
            generic_name="Test Drug 7",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        item = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
            quantity_dispensed=0,
        )

        # Status should remain PENDING
        prescription.update_status()
        assert prescription.status == "PENDING"

    def test_substitution_flag(self, sample_organization, sample_facility):
        """Prescription item can allow or disallow generic substitution."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        User = get_user_model()
        user = User.objects.create_user(username="prescriber14", password="test123")

        county = County.objects.create(code=14, name="Test County 14")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 14")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient14",
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
            code="PRESC008",
            generic_name="Test Drug 8",
            strength="100mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        # Allow substitution (default)
        item1 = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
            is_substitutable=True,
        )

        assert item1.is_substitutable is True

        # Disallow substitution
        item2 = PrescriptionItem.objects.create(
            prescription=prescription,
            drug=drug,
            quantity=30,
            dosage="1 tablet",
            frequency="3 times daily",
            duration="10 days",
            is_substitutable=False,
        )

        assert item2.is_substitutable is False

    def test_clinical_notes_for_pharmacist(self, sample_organization, sample_facility):
        """Prescription can include clinical notes for pharmacist."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.pharmacy.models import Prescription

        User = get_user_model()
        user = User.objects.create_user(username="prescriber15", password="test123")

        county = County.objects.create(code=15, name="Test County 15")
        sub_county = SubCounty.objects.create(county=county, name="Test SubCounty 15")

        patient = Patient.objects.create(
            first_name="Test",
            last_name="Patient15",
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

        notes = "Patient has history of penicillin allergy. Please counsel on side effects."
        prescription = Prescription.objects.create(
            encounter=encounter,
            patient=patient,
            prescribed_by=user,
            valid_until=date.today() + timedelta(days=30),
            clinical_notes=notes,
        )

        assert prescription.clinical_notes == notes
        assert "allergy" in prescription.clinical_notes.lower()
