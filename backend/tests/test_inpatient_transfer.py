"""
Tests for Transfer model - Sprint 1.5-1.6 Track D.

Test Coverage (10 tests):
- Transfer creation with bed availability check
- Source bed status update (OCCUPIED → AVAILABLE)
- Destination bed status update (AVAILABLE → OCCUPIED)
- Admission ward/bed update
- Transfer reason validation
- Transfer listing by admission
- Same-ward transfer prevention
- Transfer with clinical handover notes
- Transfer date validation
- Multiple transfers for same admission
"""

import pytest
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.inpatient.models import Ward, Bed, Admission, Transfer
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient
from hmis.apps.core.models import County, SubCounty

User = get_user_model()


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username="transfer_doctor",
        password="testpass123",
        email="doctor@example.com",
    )


@pytest.fixture
def sample_patient(db, test_user):
    """Create a sample patient."""
    county = County.objects.create(code=1, name="Test County")
    sub_county = SubCounty.objects.create(county=county, name="Test SubCounty")
    
    return Patient.objects.create(
        first_name="Transfer",
        last_name="Patient",
        date_of_birth="1980-05-15",
        gender="F",
        county=county,
        sub_county=sub_county,
        registered_by=test_user,
    )


@pytest.fixture
def source_ward(db):
    """Create source ward."""
    return Ward.objects.create(
        name="Medical Ward",
        code="MED-01",
        ward_type="MEDICAL",
        capacity=20,
        daily_rate=Decimal("500.00"),
    )


@pytest.fixture
def destination_ward(db):
    """Create destination ward."""
    return Ward.objects.create(
        name="ICU Ward",
        code="ICU-01",
        ward_type="ICU",
        capacity=10,
        daily_rate=Decimal("2000.00"),
    )


@pytest.fixture
def source_bed(db, source_ward, test_user):
    """Create source bed (occupied)."""
    return Bed.objects.create(
        ward=source_ward,
        bed_number="MED-B-101",
        status="OCCUPIED",
        status_changed_by=test_user,
    )


@pytest.fixture
def destination_bed(db, destination_ward):
    """Create destination bed (available)."""
    return Bed.objects.create(
        ward=destination_ward,
        bed_number="ICU-B-201",
        status="AVAILABLE",
    )


@pytest.fixture
def active_admission(db, sample_patient, source_ward, source_bed, test_user):
    """Create an active admission."""
    ipd_encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="IPD",
        encounter_date=timezone.now().date(),
        chief_complaint="Requires specialized care",
    )
    
    return Admission.objects.create(
        patient=sample_patient,
        ipd_encounter=ipd_encounter,
        admission_date=timezone.now() - timedelta(days=2),
        admitting_diagnosis="J18.9",
        admitting_diagnosis_text="Pneumonia, unspecified",
        admitting_officer=test_user,
        ward=source_ward,
        bed=source_bed,
        payer_type="SHA",
        status="ACTIVE",
    )


@pytest.mark.django_db
class TestTransferCreation:
    """Tests for Transfer creation."""

    def test_create_transfer_with_all_details(
        self, active_admission, source_ward, source_bed, 
        destination_ward, destination_bed, test_user
    ):
        """Should create transfer with complete details."""
        transfer = Transfer.objects.create(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=destination_bed,
            reason="STEP_UP",
            reason_details="Patient condition deteriorating, requires ICU monitoring",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Patient vitals unstable. SpO2 89%. Requires ventilator support.",
        )

        assert transfer.id is not None
        assert transfer.admission == active_admission
        assert transfer.source_ward == source_ward
        assert transfer.source_bed == source_bed
        assert transfer.destination_ward == destination_ward
        assert transfer.destination_bed == destination_bed
        assert transfer.reason == "STEP_UP"
        assert transfer.transferred_by == test_user
        assert "SpO2" in transfer.clinical_handover_notes

    def test_source_bed_status_update_on_transfer(
        self, active_admission, source_ward, source_bed,
        destination_ward, destination_bed, test_user
    ):
        """Should update source bed status to AVAILABLE."""
        assert source_bed.status == "OCCUPIED"

        transfer = Transfer.objects.create(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=destination_bed,
            reason="STEP_UP",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Transfer to ICU",
        )

        source_bed.refresh_from_db()
        assert source_bed.status == "AVAILABLE"

    def test_destination_bed_status_update_on_transfer(
        self, active_admission, source_ward, source_bed,
        destination_ward, destination_bed, test_user
    ):
        """Should update destination bed status to OCCUPIED."""
        assert destination_bed.status == "AVAILABLE"

        transfer = Transfer.objects.create(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=destination_bed,
            reason="STEP_UP",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Transfer to ICU",
        )

        destination_bed.refresh_from_db()
        assert destination_bed.status == "OCCUPIED"

    def test_admission_ward_and_bed_update_on_transfer(
        self, active_admission, source_ward, source_bed,
        destination_ward, destination_bed, test_user
    ):
        """Should update admission's current ward and bed."""
        assert active_admission.ward == source_ward
        assert active_admission.bed == source_bed

        transfer = Transfer.objects.create(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=destination_bed,
            reason="STEP_UP",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Transfer to ICU",
        )

        active_admission.refresh_from_db()
        assert active_admission.ward == destination_ward
        assert active_admission.bed == destination_bed


@pytest.mark.django_db
class TestTransferValidation:
    """Tests for Transfer validation."""

    def test_prevent_same_ward_transfer(
        self, active_admission, source_ward, source_bed, test_user
    ):
        """Should prevent transfer within the same ward."""
        same_ward_bed = Bed.objects.create(
            ward=source_ward,
            bed_number="MED-B-102",
            status="AVAILABLE",
        )

        transfer = Transfer(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=source_ward,  # Same ward
            destination_bed=same_ward_bed,
            reason="BED_MANAGEMENT",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Moving to different bed",
        )

        with pytest.raises(ValidationError, match="Cannot transfer patient within the same ward"):
            transfer.clean()

    def test_destination_bed_must_be_available(
        self, active_admission, source_ward, source_bed,
        destination_ward, test_user
    ):
        """Should validate destination bed is available."""
        occupied_bed = Bed.objects.create(
            ward=destination_ward,
            bed_number="ICU-B-202",
            status="OCCUPIED",
        )

        transfer = Transfer(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=occupied_bed,
            reason="STEP_UP",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Transfer to ICU",
        )

        with pytest.raises(ValidationError, match="Destination bed must be available"):
            transfer.clean()

    def test_transfer_date_not_before_admission(
        self, active_admission, source_ward, source_bed,
        destination_ward, destination_bed, test_user
    ):
        """Should validate transfer date is not before admission date."""
        past_date = active_admission.admission_date - timedelta(days=1)

        transfer = Transfer(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=destination_bed,
            reason="STEP_UP",
            transferred_by=test_user,
            transfer_date=past_date,
            clinical_handover_notes="Transfer to ICU",
        )

        with pytest.raises(ValidationError, match="Transfer date cannot be before admission date"):
            transfer.clean()


@pytest.mark.django_db
class TestTransferReasons:
    """Tests for different transfer reasons."""

    def test_step_up_care_transfer(
        self, active_admission, source_ward, source_bed,
        destination_ward, destination_bed, test_user
    ):
        """Should document step-up care transfer (e.g., to ICU)."""
        transfer = Transfer.objects.create(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=destination_bed,
            reason="STEP_UP",
            reason_details="Patient requires intensive monitoring",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Critical condition, requires ICU",
        )

        assert transfer.reason == "STEP_UP"
        assert "intensive monitoring" in transfer.reason_details

    def test_specialty_care_transfer(
        self, active_admission, source_ward, source_bed, test_user
    ):
        """Should document specialty care transfer."""
        surgical_ward = Ward.objects.create(
            name="Surgical Ward",
            code="SURG-01",
            ward_type="SURGICAL",
            capacity=15,
            daily_rate=Decimal("800.00"),
        )
        surgical_bed = Bed.objects.create(
            ward=surgical_ward,
            bed_number="SURG-B-301",
            status="AVAILABLE",
        )

        transfer = Transfer.objects.create(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=surgical_ward,
            destination_bed=surgical_bed,
            reason="SPECIALTY",
            reason_details="Requires surgical intervention",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Patient scheduled for surgery tomorrow",
        )

        assert transfer.reason == "SPECIALTY"


@pytest.mark.django_db
class TestTransferQueries:
    """Tests for Transfer query operations."""

    def test_transfer_string_representation(
        self, active_admission, source_ward, source_bed,
        destination_ward, destination_bed, test_user
    ):
        """Should return proper string representation."""
        transfer = Transfer.objects.create(
            admission=active_admission,
            source_ward=source_ward,
            source_bed=source_bed,
            destination_ward=destination_ward,
            destination_bed=destination_bed,
            reason="STEP_UP",
            transferred_by=test_user,
            transfer_date=timezone.now(),
            clinical_handover_notes="Transfer to ICU",
        )

        expected = f"Transfer: {active_admission.admission_number} - {source_ward.name} → {destination_ward.name}"
        assert str(transfer) == expected

    def test_list_transfers_by_admission(
        self, active_admission, source_ward, source_bed, test_user
    ):
        """Should list all transfers for an admission."""
        # Create multiple wards and beds for transfers
        wards_and_beds = []
        for i in range(3):
            ward = Ward.objects.create(
                name=f"Ward {i+1}",
                code=f"W{i+1}",
                ward_type="MEDICAL",
                capacity=10,
                daily_rate=Decimal("500.00"),
            )
            bed = Bed.objects.create(
                ward=ward,
                bed_number=f"B-{i+1}01",
                status="AVAILABLE",
            )
            wards_and_beds.append((ward, bed))

        # Create multiple transfers
        current_ward = source_ward
        current_bed = source_bed
        
        for dest_ward, dest_bed in wards_and_beds[:2]:  # Create 2 transfers
            Transfer.objects.create(
                admission=active_admission,
                source_ward=current_ward,
                source_bed=current_bed,
                destination_ward=dest_ward,
                destination_bed=dest_bed,
                reason="BED_MANAGEMENT",
                transferred_by=test_user,
                transfer_date=timezone.now(),
                clinical_handover_notes=f"Transfer to {dest_ward.name}",
            )
            current_ward = dest_ward
            current_bed = dest_bed

        transfers = Transfer.objects.filter(admission=active_admission)
        assert transfers.count() == 2
