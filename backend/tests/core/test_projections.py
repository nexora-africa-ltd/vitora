"""
Tests for read-model projections infrastructure and concrete projections.

Tests cover:
- Projection base class (rebuild, reset)
- ProjectionRegistry (register, wire, lookup)
- ClinicQueueProjection (visit events → queue stats)
- WardOccupancyProjection (inpatient events → occupancy stats)
- PharmacyQueueProjection (pharmacy events → pharmacy stats)
- Projection API endpoints (read-only views)
- Rebuild management command
"""

import uuid

import pytest  # type: ignore
from unittest.mock import patch

from django.utils import timezone

from hmis.apps.core.events import DomainEvent, get_event_bus
from hmis.apps.core.events.bus import reset_event_bus
from hmis.apps.core.events.store import EventStore
from hmis.apps.core.events.types import (
    ClinicalEvents,
    InpatientEvents,
    PharmacyEvents,
)
from hmis.apps.core.projections.clinic_queue import ClinicQueueProjection
from hmis.apps.core.projections.models import (
    ClinicQueueStats,
    PharmacyQueueStats,
    WardOccupancyStats,
)
from hmis.apps.core.projections.pharmacy_queue import PharmacyQueueProjection
from hmis.apps.core.projections.registry import (
    get_projection_registry,
    reset_projection_registry,
)
from hmis.apps.core.projections.ward_occupancy import WardOccupancyProjection


@pytest.fixture(autouse=True)
def _clean_state():
    """Reset event bus and projection registry before each test."""
    reset_event_bus()
    reset_projection_registry()
    yield
    reset_event_bus()
    reset_projection_registry()


def _make_event(event_type, aggregate_type="Test", aggregate_id=1, payload=None,
                facility_id=1, **kwargs):
    """Helper to create a DomainEvent."""
    return DomainEvent(
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload or {},
        facility_id=facility_id,
        **kwargs,
    )


# =============================================================================
# Registry Tests
# =============================================================================


class TestProjectionRegistry:
    """Test ProjectionRegistry register/wire/lookup."""

    def test_register_and_lookup(self):
        """Should register a projection and find it by name."""
        registry = get_projection_registry()
        proj = ClinicQueueProjection()
        registry.register(proj)

        assert registry.get("ClinicQueueProjection") is proj

    def test_register_duplicate_skips(self):
        """Registering the same projection twice should be a no-op."""
        registry = get_projection_registry()
        proj1 = ClinicQueueProjection()
        proj2 = ClinicQueueProjection()
        registry.register(proj1)
        registry.register(proj2)

        assert registry.get("ClinicQueueProjection") is proj1

    def test_all_returns_all_projections(self):
        """all() should return all registered projections."""
        registry = get_projection_registry()
        registry.register(ClinicQueueProjection())
        registry.register(WardOccupancyProjection())
        registry.register(PharmacyQueueProjection())

        all_projs = registry.all()
        assert len(all_projs) == 3
        assert "ClinicQueueProjection" in all_projs
        assert "WardOccupancyProjection" in all_projs
        assert "PharmacyQueueProjection" in all_projs

    def test_wire_subscribes_to_event_bus(self):
        """wire() should subscribe projections to the EventBus."""
        registry = get_projection_registry()
        proj = ClinicQueueProjection()
        registry.register(proj)
        registry.wire()

        bus = get_event_bus()
        # Verify the projection's handler is in the subscriber list
        handlers = bus._subscribers.get(ClinicalEvents.CLINIC_VISIT_CREATED, [])
        assert proj.handle_event in handlers

    def test_wire_idempotent(self):
        """Calling wire() twice should not double-subscribe."""
        registry = get_projection_registry()
        proj = ClinicQueueProjection()
        registry.register(proj)
        registry.wire()
        registry.wire()  # second call

        bus = get_event_bus()
        handlers = bus._subscribers.get(ClinicalEvents.CLINIC_VISIT_CREATED, [])
        handler_count = sum(1 for h in handlers if h == proj.handle_event)
        assert handler_count == 1

    def test_clear_removes_all(self):
        """clear() should remove all registered projections."""
        registry = get_projection_registry()
        registry.register(ClinicQueueProjection())
        registry.clear()

        assert len(registry.all()) == 0
        assert registry.get("ClinicQueueProjection") is None


# =============================================================================
# ClinicQueueProjection Tests
# =============================================================================


@pytest.mark.django_db
class TestClinicQueueProjection:
    """Test ClinicQueueProjection event handling."""

    def test_visit_created_increments_waiting(self):
        """New clinic visit should increment waiting count."""
        proj = ClinicQueueProjection()
        event = _make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            aggregate_type="ClinicVisit",
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
        )
        proj.handle_event(event)

        stats = ClinicQueueStats.objects.get(facility_id=1, clinic_id=10)
        assert stats.waiting_count == 1

    def test_multiple_visits_accumulate(self):
        """Multiple visit created events should accumulate."""
        proj = ClinicQueueProjection()
        for i in range(3):
            event = _make_event(
                ClinicalEvents.CLINIC_VISIT_CREATED,
                aggregate_type="ClinicVisit",
                aggregate_id=i + 1,
                payload={"clinic_id": 10, "patient_id": i + 1, "status": "REGISTERED"},
            )
            proj.handle_event(event)

        stats = ClinicQueueStats.objects.get(facility_id=1, clinic_id=10)
        assert stats.waiting_count == 3

    def test_status_change_to_consultation(self):
        """WAITING → IN_CONSULTATION should decrement waiting, increment consultation."""
        proj = ClinicQueueProjection()
        # First: create a visit
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
        ))
        # Then: change to IN_CONSULTATION
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
            payload={"clinic_id": 10, "old_status": "WAITING", "new_status": "IN_CONSULTATION"},
        ))

        stats = ClinicQueueStats.objects.get(facility_id=1, clinic_id=10)
        assert stats.waiting_count == 0
        assert stats.in_consultation_count == 1

    def test_status_change_to_completed(self):
        """IN_CONSULTATION → COMPLETED should decrement consultation, increment completed."""
        proj = ClinicQueueProjection()
        # Setup: 1 in consultation
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
        ))
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
            payload={"clinic_id": 10, "old_status": "WAITING", "new_status": "IN_CONSULTATION"},
        ))
        # Complete
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
            payload={"clinic_id": 10, "old_status": "IN_CONSULTATION", "new_status": "COMPLETED"},
        ))

        stats = ClinicQueueStats.objects.get(facility_id=1, clinic_id=10)
        assert stats.waiting_count == 0
        assert stats.in_consultation_count == 0
        assert stats.completed_today == 1

    def test_no_show_counted(self):
        """WAITING → NO_SHOW should increment no_show_today."""
        proj = ClinicQueueProjection()
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
        ))
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
            payload={"clinic_id": 10, "old_status": "WAITING", "new_status": "NO_SHOW"},
        ))

        stats = ClinicQueueStats.objects.get(facility_id=1, clinic_id=10)
        assert stats.waiting_count == 0
        assert stats.no_show_today == 1

    def test_missing_clinic_id_ignored(self):
        """Events without clinic_id should be silently ignored."""
        proj = ClinicQueueProjection()
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"patient_id": 1, "status": "REGISTERED"},
        ))

        assert ClinicQueueStats.objects.count() == 0

    @patch("hmis.apps.core.projections.clinic_queue.ClinicQueueProjection._broadcast")
    def test_broadcasts_on_update(self, mock_broadcast):
        """Should broadcast after each event."""
        proj = ClinicQueueProjection()
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
        ))
        assert mock_broadcast.called

    def test_reset_clears_all(self):
        """reset() should delete all stats."""
        proj = ClinicQueueProjection()
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
        ))
        assert ClinicQueueStats.objects.count() == 1

        proj.reset()
        assert ClinicQueueStats.objects.count() == 0

    def test_reset_scoped_to_facility(self):
        """reset(facility_id=X) should only delete stats for that facility."""
        proj = ClinicQueueProjection()
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
            facility_id=1,
        ))
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 20, "patient_id": 2, "status": "REGISTERED"},
            facility_id=2,
        ))
        assert ClinicQueueStats.objects.count() == 2

        proj.reset(facility_id=1)
        assert ClinicQueueStats.objects.count() == 1
        assert ClinicQueueStats.objects.first().facility_id == 2


# =============================================================================
# WardOccupancyProjection Tests
# =============================================================================


@pytest.mark.django_db
class TestWardOccupancyProjection:
    """Test WardOccupancyProjection event handling."""

    def test_admission_increments_occupancy(self):
        """Admission event should increase occupied beds."""
        proj = WardOccupancyProjection()
        # First set capacity
        proj.handle_event(_make_event(
            InpatientEvents.WARD_CAPACITY_CHANGED,
            payload={"ward_id": 5, "total_beds": 20},
        ))
        # Admit
        proj.handle_event(_make_event(
            InpatientEvents.ADMISSION_CREATED,
            payload={"ward_id": 5},
        ))

        stats = WardOccupancyStats.objects.get(facility_id=1, ward_id=5)
        assert stats.occupied_beds == 1
        assert stats.available_beds == 19
        assert stats.admissions_today == 1
        assert float(stats.occupancy_rate) == 5.0

    def test_discharge_decrements_occupancy(self):
        """Discharge event should decrease occupied beds."""
        proj = WardOccupancyProjection()
        proj.handle_event(_make_event(
            InpatientEvents.WARD_CAPACITY_CHANGED,
            payload={"ward_id": 5, "total_beds": 20},
        ))
        proj.handle_event(_make_event(
            InpatientEvents.ADMISSION_CREATED,
            payload={"ward_id": 5},
        ))
        proj.handle_event(_make_event(
            InpatientEvents.DISCHARGE_COMPLETED,
            payload={"ward_id": 5},
        ))

        stats = WardOccupancyStats.objects.get(facility_id=1, ward_id=5)
        assert stats.occupied_beds == 0
        assert stats.available_beds == 20
        assert stats.discharges_today == 1

    def test_capacity_change_recalculates(self):
        """Ward capacity change should recalculate available beds."""
        proj = WardOccupancyProjection()
        proj.handle_event(_make_event(
            InpatientEvents.WARD_CAPACITY_CHANGED,
            payload={"ward_id": 5, "total_beds": 10},
        ))
        proj.handle_event(_make_event(
            InpatientEvents.ADMISSION_CREATED,
            payload={"ward_id": 5},
        ))
        # Capacity increases
        proj.handle_event(_make_event(
            InpatientEvents.WARD_CAPACITY_CHANGED,
            payload={"ward_id": 5, "total_beds": 20},
        ))

        stats = WardOccupancyStats.objects.get(facility_id=1, ward_id=5)
        assert stats.total_beds == 20
        assert stats.occupied_beds == 1
        assert stats.available_beds == 19

    def test_discharged_cannot_go_negative(self):
        """Discharging when 0 occupied should not go negative."""
        proj = WardOccupancyProjection()
        proj.handle_event(_make_event(
            InpatientEvents.WARD_CAPACITY_CHANGED,
            payload={"ward_id": 5, "total_beds": 10},
        ))
        proj.handle_event(_make_event(
            InpatientEvents.DISCHARGE_COMPLETED,
            payload={"ward_id": 5},
        ))

        stats = WardOccupancyStats.objects.get(facility_id=1, ward_id=5)
        assert stats.occupied_beds == 0
        assert stats.available_beds == 10

    def test_missing_ward_id_ignored(self):
        """Events without ward_id should be silently ignored."""
        proj = WardOccupancyProjection()
        proj.handle_event(_make_event(
            InpatientEvents.ADMISSION_CREATED,
            payload={},
        ))
        assert WardOccupancyStats.objects.count() == 0

    def test_reset(self):
        """reset() should clear all stats."""
        proj = WardOccupancyProjection()
        proj.handle_event(_make_event(
            InpatientEvents.WARD_CAPACITY_CHANGED,
            payload={"ward_id": 5, "total_beds": 20},
        ))
        proj.reset()
        assert WardOccupancyStats.objects.count() == 0


# =============================================================================
# PharmacyQueueProjection Tests
# =============================================================================


@pytest.mark.django_db
class TestPharmacyQueueProjection:
    """Test PharmacyQueueProjection event handling."""

    def test_prescription_created_increments_pending(self):
        """New prescription should increment pending count."""
        proj = PharmacyQueueProjection()
        proj.handle_event(_make_event(
            PharmacyEvents.PRESCRIPTION_CREATED,
            aggregate_type="Prescription",
        ))

        stats = PharmacyQueueStats.objects.get(facility_id=1)
        assert stats.pending_prescriptions == 1

    def test_dispensing_decrements_pending(self):
        """Dispensing should decrement pending and increment dispensed_today."""
        proj = PharmacyQueueProjection()
        proj.handle_event(_make_event(PharmacyEvents.PRESCRIPTION_CREATED))
        proj.handle_event(_make_event(PharmacyEvents.DISPENSING_COMPLETED))

        stats = PharmacyQueueStats.objects.get(facility_id=1)
        assert stats.pending_prescriptions == 0
        assert stats.dispensed_today == 1

    def test_expired_decrements_pending(self):
        """Expired prescription should decrement pending."""
        proj = PharmacyQueueProjection()
        proj.handle_event(_make_event(PharmacyEvents.PRESCRIPTION_CREATED))
        proj.handle_event(_make_event(PharmacyEvents.PRESCRIPTION_EXPIRED))

        stats = PharmacyQueueStats.objects.get(facility_id=1)
        assert stats.pending_prescriptions == 0
        assert stats.dispensed_today == 0

    def test_stock_critical_increments(self):
        """Stock critical event should increment critical_stock_count."""
        proj = PharmacyQueueProjection()
        proj.handle_event(_make_event(PharmacyEvents.STOCK_CRITICAL))

        stats = PharmacyQueueStats.objects.get(facility_id=1)
        assert stats.critical_stock_count == 1

    def test_stock_low_warning_increments(self):
        """Stock low warning event should increment low_stock_count."""
        proj = PharmacyQueueProjection()
        proj.handle_event(_make_event(PharmacyEvents.STOCK_LOW_WARNING))

        stats = PharmacyQueueStats.objects.get(facility_id=1)
        assert stats.low_stock_count == 1

    def test_pending_cannot_go_negative(self):
        """Dispensing without a prior prescription should not go negative."""
        proj = PharmacyQueueProjection()
        proj.handle_event(_make_event(PharmacyEvents.DISPENSING_COMPLETED))

        stats = PharmacyQueueStats.objects.get(facility_id=1)
        assert stats.pending_prescriptions == 0
        assert stats.dispensed_today == 1

    def test_missing_facility_ignored(self):
        """Events without facility_id should be silently ignored."""
        proj = PharmacyQueueProjection()
        proj.handle_event(DomainEvent(
            event_type=PharmacyEvents.PRESCRIPTION_CREATED,
            aggregate_type="Prescription",
            aggregate_id=1,
            facility_id=None,
        ))
        assert PharmacyQueueStats.objects.count() == 0

    def test_reset(self):
        """reset() should clear all stats."""
        proj = PharmacyQueueProjection()
        proj.handle_event(_make_event(PharmacyEvents.PRESCRIPTION_CREATED))
        proj.reset()
        assert PharmacyQueueStats.objects.count() == 0


# =============================================================================
# Rebuild Tests
# =============================================================================


@pytest.mark.django_db
class TestProjectionRebuild:
    """Test projection rebuild from EventStore."""

    def test_rebuild_from_event_store(self):
        """Rebuild should replay events from EventStore into projection state."""
        # Seed EventStore with events
        EventStore.objects.create(
            event_id=str(uuid.uuid4()),
            event_type=ClinicalEvents.CLINIC_VISIT_CREATED,
            aggregate_type="ClinicVisit",
            aggregate_id=1,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
            facility_id=1,
        )
        EventStore.objects.create(
            event_id=str(uuid.uuid4()),
            event_type=ClinicalEvents.CLINIC_VISIT_CREATED,
            aggregate_type="ClinicVisit",
            aggregate_id=2,
            payload={"clinic_id": 10, "patient_id": 2, "status": "REGISTERED"},
            facility_id=1,
        )
        EventStore.objects.create(
            event_id=str(uuid.uuid4()),
            event_type=ClinicalEvents.CLINIC_VISIT_STATUS_CHANGED,
            aggregate_type="ClinicVisit",
            aggregate_id=1,
            payload={"clinic_id": 10, "old_status": "WAITING", "new_status": "COMPLETED"},
            facility_id=1,
        )

        proj = ClinicQueueProjection()
        count = proj.rebuild()

        assert count == 3
        stats = ClinicQueueStats.objects.get(facility_id=1, clinic_id=10)
        assert stats.waiting_count == 1  # 2 created, 1 completed
        assert stats.completed_today == 1

    def test_rebuild_scoped_to_facility(self):
        """Rebuild with facility filter should only process that facility's events."""
        EventStore.objects.create(
            event_id=str(uuid.uuid4()),
            event_type=ClinicalEvents.CLINIC_VISIT_CREATED,
            aggregate_type="ClinicVisit",
            aggregate_id=1,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
            facility_id=1,
        )
        EventStore.objects.create(
            event_id=str(uuid.uuid4()),
            event_type=ClinicalEvents.CLINIC_VISIT_CREATED,
            aggregate_type="ClinicVisit",
            aggregate_id=2,
            payload={"clinic_id": 20, "patient_id": 2, "status": "REGISTERED"},
            facility_id=2,
        )

        proj = ClinicQueueProjection()
        count = proj.rebuild(facility_id=1)

        assert count == 1
        assert ClinicQueueStats.objects.count() == 1
        assert ClinicQueueStats.objects.first().clinic_id == 10

    def test_rebuild_resets_before_replaying(self):
        """Rebuild should clear existing state before replaying."""
        proj = ClinicQueueProjection()
        # Create some existing state
        proj.handle_event(_make_event(
            ClinicalEvents.CLINIC_VISIT_CREATED,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
        ))
        assert ClinicQueueStats.objects.first().waiting_count == 1

        # Rebuild with no events in store → should be empty
        proj.rebuild()
        assert ClinicQueueStats.objects.count() == 0


# =============================================================================
# API Tests
# =============================================================================


@pytest.mark.django_db
class TestProjectionAPIs:
    """Test projection read-only API endpoints."""

    def test_clinic_queue_stats_requires_clinic_id(self, authenticated_client):
        """GET /api/projections/clinic-queue/ without clinic_id should return 400."""
        response = authenticated_client.get("/api/projections/clinic-queue/")
        assert response.status_code == 400

    def test_clinic_queue_stats_returns_data(self, authenticated_client):
        """GET /api/projections/clinic-queue/?clinic_id=10 should return stats."""
        ClinicQueueStats.objects.create(
            facility_id=1, clinic_id=10, waiting_count=5, in_consultation_count=2,
        )
        response = authenticated_client.get("/api/projections/clinic-queue/?clinic_id=10")
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["waiting_count"] == 5
        assert response.data[0]["in_consultation_count"] == 2

    def test_clinic_queue_stats_empty(self, authenticated_client):
        """Should return empty list when no stats exist."""
        response = authenticated_client.get("/api/projections/clinic-queue/?clinic_id=999")
        assert response.status_code == 200
        assert response.data == []

    def test_ward_occupancy_stats_returns_data(self, authenticated_client):
        """GET /api/projections/ward-occupancy/ should return stats."""
        WardOccupancyStats.objects.create(
            facility_id=1, ward_id=5, total_beds=20, occupied_beds=8,
            available_beds=12, occupancy_rate=40.0,
        )
        response = authenticated_client.get("/api/projections/ward-occupancy/?ward_id=5")
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["total_beds"] == 20
        assert response.data[0]["occupied_beds"] == 8

    def test_ward_occupancy_stats_filter_by_facility(self, authenticated_client):
        """Should filter by facility_id."""
        WardOccupancyStats.objects.create(facility_id=1, ward_id=5, total_beds=20)
        WardOccupancyStats.objects.create(facility_id=2, ward_id=6, total_beds=10)

        response = authenticated_client.get("/api/projections/ward-occupancy/?facility_id=1")
        assert response.status_code == 200
        assert len(response.data) == 1

    def test_pharmacy_queue_stats_returns_data(self, authenticated_client):
        """GET /api/projections/pharmacy-queue/ should return stats."""
        PharmacyQueueStats.objects.create(
            facility_id=1, pending_prescriptions=15, dispensed_today=30,
        )
        response = authenticated_client.get("/api/projections/pharmacy-queue/?facility_id=1")
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["pending_prescriptions"] == 15

    def test_unauthenticated_request_rejected(self, api_client):
        """Unauthenticated requests should return 401."""
        response = api_client.get("/api/projections/clinic-queue/?clinic_id=10")
        assert response.status_code == 401


# =============================================================================
# End-to-End Integration Test
# =============================================================================


@pytest.mark.django_db
class TestProjectionEndToEnd:
    """Integration test: event published → projection updated → API returns data."""

    def test_event_to_projection_to_api(self, authenticated_client):
        """Full pipeline: publish event → projection updates → API returns stats."""
        # 1. Register and wire projection
        registry = get_projection_registry()
        proj = ClinicQueueProjection()
        registry.register(proj)
        registry.wire()

        # 2. Publish events through the EventBus
        bus = get_event_bus()
        bus.publish(DomainEvent(
            event_type=ClinicalEvents.CLINIC_VISIT_CREATED,
            aggregate_type="ClinicVisit",
            aggregate_id=1,
            payload={"clinic_id": 10, "patient_id": 1, "status": "REGISTERED"},
            facility_id=1,
        ))
        bus.publish(DomainEvent(
            event_type=ClinicalEvents.CLINIC_VISIT_CREATED,
            aggregate_type="ClinicVisit",
            aggregate_id=2,
            payload={"clinic_id": 10, "patient_id": 2, "status": "REGISTERED"},
            facility_id=1,
        ))

        # 3. Verify projection state
        stats = ClinicQueueStats.objects.get(facility_id=1, clinic_id=10)
        assert stats.waiting_count == 2

        # 4. Verify API
        response = authenticated_client.get("/api/projections/clinic-queue/?clinic_id=10")
        assert response.status_code == 200
        assert response.data[0]["waiting_count"] == 2
