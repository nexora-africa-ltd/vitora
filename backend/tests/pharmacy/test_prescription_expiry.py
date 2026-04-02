"""
Tests for prescription expiry handling.

Covers:
- Fix A: Celery task auto-expiry (expire_prescriptions)
- Fix B: effective_status property and days_until_expiry
- Fix C: Dispensing guard rejects expired prescriptions
- Fix D: Prescription expiry alerts (generate_prescription_expiry_alerts)
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status


# ============================================================================
# Helpers
# ============================================================================

def _create_prescription_with_items(valid_until, sample_organization=None, sample_facility=None, rx_status="PENDING"):
    """Helper to create a prescription with one drug item."""
    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import County, SubCounty
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient
    from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

    User = get_user_model()
    user = User.objects.create_user(
        username=f"prescriber_{valid_until}_{rx_status}",
        password="test123",
    )

    county = County.objects.create(
        code=abs(hash(f"{valid_until}{rx_status}")) % 9000 + 1000,
        name=f"County {valid_until}",
    )
    sub_county = SubCounty.objects.create(county=county, name="Sub")

    patient = Patient.objects.create(
        first_name="Jane",
        last_name="Doe",
        date_of_birth="1990-05-20",
        gender="F",
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )

    encounter = Encounter.objects.create(
        patient=patient,
        encounter_type="OPD",
        chief_complaint="Headache",
        facility=sample_facility,
    )

    drug = Drug.objects.create(
        code=f"DRG-{abs(hash(f'{valid_until}{rx_status}')) % 90000 + 10000}",
        generic_name="Paracetamol",
        strength="500mg",
        form="TABLET",
        categories=["ANALGESIC"],
        unit="tablet",
    )

    rx = Prescription.objects.create(
        encounter=encounter,
        patient=patient,
        prescribed_by=user,
        valid_until=valid_until,
        status=rx_status,
        clinical_notes="Test",
    )

    item = PrescriptionItem.objects.create(
        prescription=rx,
        drug=drug,
        quantity=30,
        dosage="1 tablet",
        frequency="3 times daily",
        duration="10 days",
    )

    return rx, item, drug, user


# ============================================================================
# Fix B: effective_status and days_until_expiry properties
# ============================================================================


@pytest.mark.django_db
class TestEffectiveStatus:
    """Tests for the effective_status property on Prescription."""

    def test_pending_within_validity_returns_pending(self):
        """PENDING prescription within validity shows PENDING."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=10),
            rx_status="PENDING",
        )
        assert rx.effective_status == "PENDING"

    def test_pending_past_validity_returns_expired(self):
        """PENDING prescription past valid_until shows EXPIRED."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=1),
            rx_status="PENDING",
        )
        assert rx.effective_status == "EXPIRED"

    def test_partial_past_validity_returns_expired(self):
        """PARTIAL prescription past valid_until shows EXPIRED."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=5),
            rx_status="PARTIAL",
        )
        assert rx.effective_status == "EXPIRED"

    def test_dispensed_not_affected(self):
        """DISPENSED prescription keeps DISPENSED regardless of date."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=30),
            rx_status="DISPENSED",
        )
        assert rx.effective_status == "DISPENSED"

    def test_cancelled_not_affected(self):
        """CANCELLED prescription keeps CANCELLED regardless of date."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=30),
            rx_status="CANCELLED",
        )
        assert rx.effective_status == "CANCELLED"

    def test_expired_stays_expired(self):
        """Already-EXPIRED prescription stays EXPIRED."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=30),
            rx_status="EXPIRED",
        )
        assert rx.effective_status == "EXPIRED"


@pytest.mark.django_db
class TestDaysUntilExpiry:
    """Tests for the days_until_expiry property."""

    def test_future_prescription(self):
        """Prescription expiring in 10 days returns 10."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=10),
        )
        assert rx.days_until_expiry == 10

    def test_today_prescription(self):
        """Prescription expiring today returns 0."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today(),
        )
        assert rx.days_until_expiry == 0

    def test_past_prescription(self):
        """Prescription expired 3 days ago returns -3."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=3),
        )
        assert rx.days_until_expiry == -3

    def test_dispensed_returns_none(self):
        """DISPENSED prescriptions return None."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=10),
            rx_status="DISPENSED",
        )
        assert rx.days_until_expiry is None

    def test_cancelled_returns_none(self):
        """CANCELLED prescriptions return None."""
        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=10),
            rx_status="CANCELLED",
        )
        assert rx.days_until_expiry is None


# ============================================================================
# Fix A: expire_prescriptions Celery task
# ============================================================================


@pytest.mark.django_db
class TestExpirePrescriptionsTask:
    """Tests for the expire_prescriptions Celery task."""

    def test_expires_pending_past_validity(self):
        """Task marks PENDING prescriptions past valid_until as EXPIRED."""
        from hmis.apps.pharmacy.tasks import expire_prescriptions

        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=1),
            rx_status="PENDING",
        )

        result = expire_prescriptions()

        rx.refresh_from_db()
        assert rx.status == "EXPIRED"
        assert result["expired"] >= 1

    def test_expires_partial_past_validity(self):
        """Task marks PARTIAL prescriptions past valid_until as EXPIRED."""
        from hmis.apps.pharmacy.tasks import expire_prescriptions

        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=2),
            rx_status="PARTIAL",
        )

        result = expire_prescriptions()

        rx.refresh_from_db()
        assert rx.status == "EXPIRED"
        assert result["expired"] >= 1

    def test_does_not_expire_valid_prescription(self):
        """Task does NOT touch prescriptions still within validity."""
        from hmis.apps.pharmacy.tasks import expire_prescriptions

        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=10),
            rx_status="PENDING",
        )

        expire_prescriptions()

        rx.refresh_from_db()
        assert rx.status == "PENDING"

    def test_does_not_touch_dispensed(self):
        """Task does NOT change DISPENSED prescriptions."""
        from hmis.apps.pharmacy.tasks import expire_prescriptions

        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=5),
            rx_status="DISPENSED",
        )

        expire_prescriptions()

        rx.refresh_from_db()
        assert rx.status == "DISPENSED"

    def test_does_not_touch_cancelled(self):
        """Task does NOT change CANCELLED prescriptions."""
        from hmis.apps.pharmacy.tasks import expire_prescriptions

        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=5),
            rx_status="CANCELLED",
        )

        expire_prescriptions()

        rx.refresh_from_db()
        assert rx.status == "CANCELLED"

    def test_returns_zero_when_nothing_to_expire(self):
        """Task returns expired=0 when no prescriptions qualify."""
        from hmis.apps.pharmacy.tasks import expire_prescriptions

        result = expire_prescriptions()
        assert result["expired"] == 0


# ============================================================================
# Fix C: Dispensing guard
# ============================================================================


@pytest.mark.django_db
class TestDispensingGuard:
    """Tests that dispensing from expired prescriptions is rejected."""

    def test_dispense_rejected_for_expired_rx(self, authenticated_client):
        """Dispensing against an expired prescription returns 400."""
        rx, item, drug, _ = _create_prescription_with_items(
            valid_until=date.today() - timedelta(days=1),
            rx_status="PENDING",
        )

        response = authenticated_client.post(
            "/api/pharmacy/dispensings/dispense/",
            {
                "drug_id": drug.id,
                "quantity": 5,
                "patient_id": rx.patient_id,
                "prescription_item_id": item.id,
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "expired" in response.data["error"].lower()

    def test_dispense_allowed_for_valid_rx(self, authenticated_client):
        """Dispensing against a valid prescription passes the guard check.

        Note: may still fail on FEFO stock availability, but it should
        NOT be blocked by the expiry guard.
        """
        rx, item, drug, _ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=10),
            rx_status="PENDING",
        )

        response = authenticated_client.post(
            "/api/pharmacy/dispensings/dispense/",
            {
                "drug_id": drug.id,
                "quantity": 5,
                "patient_id": rx.patient_id,
                "prescription_item_id": item.id,
            },
        )

        # Should NOT be a 400 with "expired" message
        # (may be 400 for insufficient stock, that's fine)
        if response.status_code == status.HTTP_400_BAD_REQUEST:
            assert "expired" not in response.data.get("error", "").lower()


# ============================================================================
# Fix D: Prescription expiry alerts
# ============================================================================


@pytest.mark.django_db
class TestPrescriptionExpiryAlerts:
    """Tests for generate_prescription_expiry_alerts task."""

    def test_creates_alert_for_expiring_prescription(self):
        """Alert created for prescription expiring within 7 days."""
        from hmis.apps.pharmacy.models import StockAlert
        from hmis.apps.pharmacy.tasks import generate_prescription_expiry_alerts

        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=2),
            rx_status="PENDING",
        )

        generate_prescription_expiry_alerts()

        alerts = StockAlert.objects.filter(alert_type="RX_EXPIRING")
        assert alerts.count() >= 1
        alert = alerts.first()
        assert rx.prescription_number in alert.message

    def test_critical_severity_within_3_days(self):
        """Alert has CRITICAL severity when expiring within 3 days."""
        from hmis.apps.pharmacy.models import StockAlert
        from hmis.apps.pharmacy.tasks import generate_prescription_expiry_alerts

        rx, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=1),
            rx_status="PARTIAL",
        )

        generate_prescription_expiry_alerts()

        alert = StockAlert.objects.filter(
            alert_type="RX_EXPIRING",
            message__startswith=f"Prescription {rx.prescription_number}",
        ).first()
        assert alert is not None
        assert alert.severity == "CRITICAL"

    def test_no_alert_for_fully_dispensed(self):
        """No alert for prescription with all items dispensed."""
        from hmis.apps.pharmacy.models import StockAlert
        from hmis.apps.pharmacy.tasks import generate_prescription_expiry_alerts

        rx, item, *_ = _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=2),
            rx_status="PENDING",
        )
        # Mark item as fully dispensed
        item.quantity_dispensed = item.quantity
        item.save()

        generate_prescription_expiry_alerts()

        alerts = StockAlert.objects.filter(
            alert_type="RX_EXPIRING",
            message__startswith=f"Prescription {rx.prescription_number}",
        )
        assert alerts.count() == 0

    def test_no_duplicate_alerts(self):
        """Running the task twice does not create duplicate alerts."""
        from hmis.apps.pharmacy.models import StockAlert
        from hmis.apps.pharmacy.tasks import generate_prescription_expiry_alerts

        _create_prescription_with_items(
            valid_until=date.today() + timedelta(days=2),
            rx_status="PENDING",
        )

        generate_prescription_expiry_alerts()
        generate_prescription_expiry_alerts()

        alerts = StockAlert.objects.filter(alert_type="RX_EXPIRING")
        assert alerts.count() == 1
