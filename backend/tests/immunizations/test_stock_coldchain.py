"""
Tests for immunizations stock management, cold chain, and incident reporting.

Covers:
- VaccineStock model and API (receive, issue, transactions, alerts)
- ColdChainEquipment model and API (CRUD, temperature logs)
- TemperatureLog model (auto excursion detection)
- VaccineIncident model and API (CRUD, resolve action)
- MCH → immunizations unification smoke test
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.immunizations.models import (
    ColdChainEquipment,
    StockTransaction,
    TemperatureLog,
    VaccineDefinition,
    VaccineIncident,
    VaccineStock,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def bcg_vaccine(db):
    return VaccineDefinition.objects.create(
        code="BCG_TEST",
        name="BCG (Test)",
        disease_target="Tuberculosis",
        standard_age_days=0,
        route="ID",
        dose_number=1,
        series_name="BCG",
        target_population="INFANT",
        program="KEPI",
    )


@pytest.fixture
def stock_batch(db, bcg_vaccine, test_user, sample_facility):
    return VaccineStock.objects.create(
        vaccine=bcg_vaccine,
        batch_number="BCG-2026-001",
        quantity_received=100,
        quantity_on_hand=80,
        expiry_date=date.today() + timedelta(days=180),
        manufacturer="Serum Institute",
        supplier="KEMSA",
        received_date=date.today() - timedelta(days=10),
        received_by=test_user,
        storage_location="Main Fridge 1",
        vvm_status="Stage 1",
        min_stock_level=20,
        facility=sample_facility,
    )


@pytest.fixture
def expired_stock(db, bcg_vaccine, test_user, sample_facility):
    return VaccineStock.objects.create(
        vaccine=bcg_vaccine,
        batch_number="BCG-2025-OLD",
        quantity_received=50,
        quantity_on_hand=30,
        expiry_date=date.today() - timedelta(days=5),
        manufacturer="Serum Institute",
        supplier="KEMSA",
        received_date=date.today() - timedelta(days=365),
        received_by=test_user,
        storage_location="Main Fridge 1",
        facility=sample_facility,
    )


@pytest.fixture
def fridge(db, sample_facility):
    return ColdChainEquipment.objects.create(
        name="Main Fridge 1",
        equipment_type="FRIDGE",
        model_number="VLS-054",
        serial_number="SN-FRIDGE-001",
        manufacturer="Vestfrost",
        location="EPI Room",
        capacity_litres=Decimal("54.0"),
        min_temp=Decimal("2.00"),
        max_temp=Decimal("8.00"),
        status="OPERATIONAL",
        power_source="Mains + Solar backup",
        has_backup_power=True,
        facility=sample_facility,
    )


@pytest.fixture
def incident(db, test_user, fridge, stock_batch, sample_facility):
    inc = VaccineIncident.objects.create(
        title="Power outage in EPI room",
        incident_type="POWER_OUTAGE",
        severity="HIGH",
        description="Mains power lost for 4 hours, backup solar did not activate.",
        occurred_at=timezone.now() - timedelta(hours=6),
        doses_affected=80,
        reported_by=test_user,
        facility=sample_facility,
    )
    inc.affected_equipment.add(fridge)
    inc.affected_batches.add(stock_batch)
    return inc


# =============================================================================
# Model Property Tests
# =============================================================================


class TestVaccineStockModel:
    """Tests for VaccineStock model properties."""

    def test_is_expired_false(self, stock_batch):
        assert stock_batch.is_expired is False

    def test_is_expired_true(self, expired_stock):
        assert expired_stock.is_expired is True

    def test_is_low_stock_false(self, stock_batch):
        assert stock_batch.is_low_stock is False

    def test_is_low_stock_true(self, stock_batch):
        stock_batch.quantity_on_hand = 15
        stock_batch.save()
        assert stock_batch.is_low_stock is True

    def test_is_near_expiry_false(self, stock_batch):
        assert stock_batch.is_near_expiry is False

    def test_is_near_expiry_true(self, stock_batch):
        stock_batch.expiry_date = date.today() + timedelta(days=10)
        stock_batch.save()
        assert stock_batch.is_near_expiry is True

    def test_is_near_expiry_false_when_expired(self, expired_stock):
        assert expired_stock.is_near_expiry is False


class TestTemperatureLogModel:
    """Tests for TemperatureLog auto-excursion detection."""

    def test_normal_temp_no_excursion(self, fridge, test_user):
        log = TemperatureLog.objects.create(
            equipment=fridge,
            temperature=Decimal("4.50"),
            recorded_at=timezone.now(),
            recorded_by=test_user,
        )
        assert log.is_excursion is False

    def test_high_temp_triggers_excursion(self, fridge, test_user):
        log = TemperatureLog.objects.create(
            equipment=fridge,
            temperature=Decimal("12.00"),
            recorded_at=timezone.now(),
            recorded_by=test_user,
        )
        assert log.is_excursion is True

    def test_low_temp_triggers_excursion(self, fridge, test_user):
        log = TemperatureLog.objects.create(
            equipment=fridge,
            temperature=Decimal("-1.00"),
            recorded_at=timezone.now(),
            recorded_by=test_user,
        )
        assert log.is_excursion is True


# =============================================================================
# Stock API Tests
# =============================================================================


class TestVaccineStockAPI:
    """Tests for vaccine stock API endpoints."""

    def test_list_stock(self, authenticated_client, stock_batch):
        response = authenticated_client.get("/api/immunizations/stock/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_stock(self, authenticated_client, bcg_vaccine):
        data = {
            "vaccine": bcg_vaccine.id,
            "batch_number": "BCG-2026-NEW",
            "quantity_received": 200,
            "quantity_on_hand": 200,
            "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
            "received_date": date.today().isoformat(),
            "min_stock_level": 25,
        }
        response = authenticated_client.post("/api/immunizations/stock/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        # Verify initial RECEIVE transaction was created
        stock_id = response.data["id"]
        txn = StockTransaction.objects.filter(stock_id=stock_id)
        assert txn.count() == 1
        assert txn.first().transaction_type == "RECEIVE"
        assert txn.first().quantity == 200

    def test_get_stock_detail(self, authenticated_client, stock_batch):
        response = authenticated_client.get(f"/api/immunizations/stock/{stock_batch.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["batch_number"] == "BCG-2026-001"
        assert response.data["is_expired"] is False
        assert response.data["is_low_stock"] is False

    def test_issue_stock(self, authenticated_client, stock_batch):
        data = {
            "quantity": 10,
            "transaction_type": "WASTAGE",
            "reason": "Dropped vial",
        }
        response = authenticated_client.post(
            f"/api/immunizations/stock/{stock_batch.id}/issue/", data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["quantity_on_hand"] == 70  # 80 - 10

    def test_issue_stock_insufficient(self, authenticated_client, stock_batch):
        data = {
            "quantity": 999,
            "transaction_type": "WASTAGE",
            "reason": "test",
        }
        response = authenticated_client.post(
            f"/api/immunizations/stock/{stock_batch.id}/issue/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Insufficient stock" in response.data["detail"]

    def test_list_transactions(self, authenticated_client, stock_batch):
        # Create a transaction first
        StockTransaction.objects.create(
            stock=stock_batch,
            transaction_type="RECEIVE",
            quantity=100,
            balance_after=80,
        )
        response = authenticated_client.get(
            f"/api/immunizations/stock/{stock_batch.id}/transactions/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_filter_expired_stock(self, authenticated_client, stock_batch, expired_stock):
        response = authenticated_client.get("/api/immunizations/stock/?is_expired=true")
        assert response.status_code == status.HTTP_200_OK
        batch_numbers = [s["batch_number"] for s in response.data["results"]]
        assert "BCG-2025-OLD" in batch_numbers
        assert "BCG-2026-001" not in batch_numbers


# =============================================================================
# Cold Chain API Tests
# =============================================================================


class TestColdChainEquipmentAPI:
    """Tests for cold chain equipment API endpoints."""

    def test_list_equipment(self, authenticated_client, fridge):
        response = authenticated_client.get("/api/immunizations/cold-chain/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_equipment(self, authenticated_client):
        data = {
            "name": "Cold Box A",
            "equipment_type": "COLD_BOX",
            "serial_number": "SN-CB-001",
            "location": "Outreach Kit",
            "min_temp": "2.00",
            "max_temp": "8.00",
        }
        response = authenticated_client.post("/api/immunizations/cold-chain/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Cold Box A"

    def test_get_equipment_detail(self, authenticated_client, fridge):
        response = authenticated_client.get(f"/api/immunizations/cold-chain/{fridge.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["serial_number"] == "SN-FRIDGE-001"

    def test_filter_by_status(self, authenticated_client, fridge):
        response = authenticated_client.get("/api/immunizations/cold-chain/?status=operational")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


class TestTemperatureLogAPI:
    """Tests for temperature log API endpoints."""

    def test_create_temperature_log(self, authenticated_client, fridge):
        data = {
            "equipment": fridge.id,
            "temperature": "5.50",
            "recorded_at": timezone.now().isoformat(),
        }
        response = authenticated_client.post(
            "/api/immunizations/temperature-logs/", data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_excursion"] is False

    def test_create_excursion_log(self, authenticated_client, fridge):
        data = {
            "equipment": fridge.id,
            "temperature": "15.00",
            "recorded_at": timezone.now().isoformat(),
        }
        response = authenticated_client.post(
            "/api/immunizations/temperature-logs/", data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_excursion"] is True

    def test_list_equipment_temperatures(self, authenticated_client, fridge, test_user):
        TemperatureLog.objects.create(
            equipment=fridge,
            temperature=Decimal("4.00"),
            recorded_at=timezone.now(),
            recorded_by=test_user,
        )
        response = authenticated_client.get(
            f"/api/immunizations/cold-chain/{fridge.id}/temperatures/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_filter_excursions_only(self, authenticated_client, fridge, test_user):
        TemperatureLog.objects.create(
            equipment=fridge,
            temperature=Decimal("4.00"),
            recorded_at=timezone.now(),
            recorded_by=test_user,
        )
        TemperatureLog.objects.create(
            equipment=fridge,
            temperature=Decimal("15.00"),
            recorded_at=timezone.now(),
            recorded_by=test_user,
        )
        response = authenticated_client.get(
            "/api/immunizations/temperature-logs/?excursions_only=true"
        )
        assert response.status_code == status.HTTP_200_OK
        # All returned should be excursions
        for log in response.data["results"]:
            assert log["is_excursion"] is True


# =============================================================================
# Incident API Tests
# =============================================================================


class TestVaccineIncidentAPI:
    """Tests for vaccine incident reporting API endpoints."""

    def test_list_incidents(self, authenticated_client, incident):
        response = authenticated_client.get("/api/immunizations/incidents/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_incident(self, authenticated_client, fridge, stock_batch):
        data = {
            "title": "Cold chain break during transport",
            "incident_type": "COLD_CHAIN_BREAK",
            "severity": "CRITICAL",
            "description": "Cold box left open for 2 hours during outreach.",
            "occurred_at": timezone.now().isoformat(),
            "affected_equipment": [fridge.id],
            "affected_batches": [stock_batch.id],
            "doses_affected": 50,
            "doses_lost": 20,
        }
        response = authenticated_client.post("/api/immunizations/incidents/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["incident_type"] == "COLD_CHAIN_BREAK"
        assert response.data["severity"] == "CRITICAL"
        assert response.data["doses_affected"] == 50

    def test_get_incident_detail(self, authenticated_client, incident):
        response = authenticated_client.get(f"/api/immunizations/incidents/{incident.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "Power outage in EPI room"

    def test_resolve_incident(self, authenticated_client, incident):
        data = {
            "corrective_actions": "Repaired solar backup switch.",
            "preventive_actions": "Scheduled monthly solar panel check.",
        }
        response = authenticated_client.post(
            f"/api/immunizations/incidents/{incident.id}/resolve/", data, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "RESOLVED"
        assert response.data["corrective_actions"] == "Repaired solar backup switch."
        assert response.data["duration_minutes"] is not None

    def test_resolve_already_resolved(self, authenticated_client, incident):
        incident.status = "RESOLVED"
        incident.save()
        response = authenticated_client.post(
            f"/api/immunizations/incidents/{incident.id}/resolve/", {}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_filter_by_severity(self, authenticated_client, incident):
        response = authenticated_client.get("/api/immunizations/incidents/?severity=high")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_filter_by_type(self, authenticated_client, incident):
        response = authenticated_client.get(
            "/api/immunizations/incidents/?incident_type=power_outage"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


# =============================================================================
# MCH Unification Smoke Test
# =============================================================================


class TestMCHUnification:
    """Smoke tests verifying MCH endpoints now delegate to immunizations app."""

    def test_mch_vaccines_returns_kepi_only(self, authenticated_client, bcg_vaccine):
        # Also create a non-KEPI vaccine to ensure it's excluded
        VaccineDefinition.objects.create(
            code="HEPB_ADULT_SMOKE",
            name="Hep B Adult (smoke)",
            target_population="ADULT",
            program="ROUTINE",
            standard_age_days=0,
        )
        response = authenticated_client.get("/api/mch/vaccines/")
        assert response.status_code == status.HTTP_200_OK
        codes = [v["code"] for v in response.data]
        assert "BCG_TEST" in codes
        assert "HEPB_ADULT_SMOKE" not in codes  # Excluded: not KEPI

    def test_mch_immunizations_endpoint_works(self, authenticated_client):
        response = authenticated_client.get("/api/mch/immunizations/")
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Stock-Linked Administration Tests
# =============================================================================


class TestStockLinkedAdministration:
    """Tests for administering vaccines via stock batch selection."""

    @pytest.fixture
    def imm_record(self, db, bcg_vaccine, sample_patient, sample_facility):
        from hmis.apps.immunizations.models import ImmunizationRecord

        return ImmunizationRecord.objects.create(
            patient=sample_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today(),
            facility=sample_facility,
        )

    def test_administer_with_stock_batch_deducts_and_fills(
        self,
        authenticated_client,
        imm_record,
        stock_batch,
    ):
        """Selecting a stock batch auto-fills batch details and deducts 1 dose."""
        initial_qty = stock_batch.quantity_on_hand
        response = authenticated_client.post(
            f"/api/immunizations/records/{imm_record.id}/administer/",
            {"stock_batch": stock_batch.id, "site": "LEFT_THIGH"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["batch_number"] == stock_batch.batch_number
        assert response.data["status"] == "ADMINISTERED"

        stock_batch.refresh_from_db()
        assert stock_batch.quantity_on_hand == initial_qty - 1

        # Verify StockTransaction was created
        txn = StockTransaction.objects.filter(
            stock=stock_batch,
            immunization_record=imm_record,
        ).first()
        assert txn is not None
        assert txn.transaction_type == "ISSUE"
        assert txn.quantity == -1
        assert txn.balance_after == initial_qty - 1

    def test_administer_with_wrong_vaccine_stock_fails(
        self,
        authenticated_client,
        imm_record,
        sample_facility,
    ):
        """Stock batch for a different vaccine should be rejected."""
        other_vaccine = VaccineDefinition.objects.create(
            code="OPV_TEST",
            name="OPV (Test)",
            standard_age_days=0,
            program="KEPI",
        )
        wrong_stock = VaccineStock.objects.create(
            vaccine=other_vaccine,
            batch_number="OPV-2026-001",
            quantity_received=50,
            quantity_on_hand=50,
            expiry_date=date.today() + timedelta(days=180),
            received_date=date.today(),
            facility=sample_facility,
        )
        response = authenticated_client.post(
            f"/api/immunizations/records/{imm_record.id}/administer/",
            {"stock_batch": wrong_stock.id},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "does not match" in str(response.data)

    def test_administer_with_expired_stock_fails(
        self,
        authenticated_client,
        imm_record,
        expired_stock,
    ):
        """Expired stock batch should be rejected."""
        response = authenticated_client.post(
            f"/api/immunizations/records/{imm_record.id}/administer/",
            {"stock_batch": expired_stock.id},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "expired" in str(response.data).lower()

    def test_administer_with_empty_stock_fails(
        self,
        authenticated_client,
        imm_record,
        stock_batch,
    ):
        """Stock batch with 0 doses should be rejected."""
        stock_batch.quantity_on_hand = 0
        stock_batch.save(update_fields=["quantity_on_hand"])
        response = authenticated_client.post(
            f"/api/immunizations/records/{imm_record.id}/administer/",
            {"stock_batch": stock_batch.id},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "0 doses" in str(response.data)

    def test_administer_manual_entry_still_works(
        self,
        authenticated_client,
        imm_record,
    ):
        """Manual batch entry (no stock_batch) should still work."""
        response = authenticated_client.post(
            f"/api/immunizations/records/{imm_record.id}/administer/",
            {
                "batch_number": "MANUAL-001",
                "lot_number": "LOT-999",
                "vaccine_manufacturer": "Test Pharma",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["batch_number"] == "MANUAL-001"
        assert response.data["status"] == "ADMINISTERED"


class TestAvailableStockFilter:
    """Tests for the `available` query filter on VaccineStock."""

    def test_available_filter_excludes_expired_and_empty(
        self,
        authenticated_client,
        stock_batch,
        expired_stock,
        sample_facility,
    ):
        """available=true returns only non-expired batches with qty > 0."""
        # Create an empty batch
        VaccineStock.objects.create(
            vaccine=stock_batch.vaccine,
            batch_number="BCG-EMPTY",
            quantity_received=10,
            quantity_on_hand=0,
            expiry_date=date.today() + timedelta(days=90),
            received_date=date.today(),
            facility=sample_facility,
        )
        response = authenticated_client.get(
            "/api/immunizations/stock/",
            {"available": "true"},
        )
        assert response.status_code == status.HTTP_200_OK
        batch_numbers = [r["batch_number"] for r in response.data["results"]]
        assert stock_batch.batch_number in batch_numbers
        assert expired_stock.batch_number not in batch_numbers
        assert "BCG-EMPTY" not in batch_numbers
