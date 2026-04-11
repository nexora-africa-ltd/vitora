"""
TDD Tests for Domain Events Infrastructure.

Tests for:
- DomainEvent dataclass
- EventBus publish/subscribe
- EventStore persistence and replay
- Event decorators
"""

import pytest  # type: ignore
from django.utils import timezone

from hmis.apps.core.events.base import DomainEvent
from hmis.apps.core.events.bus import EventBus, get_event_bus, reset_event_bus
from hmis.apps.core.events.store import EventStore


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture(autouse=True)
def clean_event_bus():
    """Reset event bus between tests to avoid cross-test pollution."""
    reset_event_bus()
    yield
    reset_event_bus()


# =============================================================================
# DOMAIN EVENT DATACLASS TESTS
# =============================================================================


class TestDomainEvent:
    """Test DomainEvent base dataclass."""

    def test_create_event_with_required_fields(self):
        """Should create event with required fields and auto-generated defaults."""
        event = DomainEvent(
            event_type="prescription.created",
            aggregate_type="Prescription",
            aggregate_id=42,
        )

        assert event.event_type == "prescription.created"
        assert event.aggregate_type == "Prescription"
        assert event.aggregate_id == 42
        assert event.payload == {}
        assert event.event_id  # Auto-generated UUID
        assert event.correlation_id  # Auto-generated UUID
        assert event.timestamp  # Auto-set to now

    def test_create_event_with_all_fields(self):
        """Should create event with all fields populated."""
        event = DomainEvent(
            event_type="invoice.paid",
            aggregate_type="Invoice",
            aggregate_id=99,
            payload={"amount": "1500.00", "method": "mpesa"},
            user_id=5,
            facility_id=3,
            organization_id=1,
        )

        assert event.payload == {"amount": "1500.00", "method": "mpesa"}
        assert event.user_id == 5
        assert event.facility_id == 3
        assert event.organization_id == 1

    def test_event_is_immutable(self):
        """Should not allow mutation of event fields (frozen dataclass)."""
        event = DomainEvent(
            event_type="test.event",
            aggregate_type="Test",
            aggregate_id=1,
        )

        with pytest.raises(AttributeError):
            event.event_type = "modified"  # type: ignore

    def test_to_dict_serialization(self):
        """Should serialize event to a plain dict."""
        event = DomainEvent(
            event_type="prescription.created",
            aggregate_type="Prescription",
            aggregate_id=42,
            payload={"number": "RX-001"},
            user_id=5,
        )

        d = event.to_dict()
        assert d["event_type"] == "prescription.created"
        assert d["aggregate_type"] == "Prescription"
        assert d["aggregate_id"] == 42
        assert d["payload"] == {"number": "RX-001"}
        assert d["user_id"] == 5
        assert "event_id" in d
        assert "correlation_id" in d
        assert "timestamp" in d

    def test_each_event_has_unique_id(self):
        """Should generate unique event_id for each instance."""
        e1 = DomainEvent(event_type="a", aggregate_type="A", aggregate_id=1)
        e2 = DomainEvent(event_type="a", aggregate_type="A", aggregate_id=1)

        assert e1.event_id != e2.event_id


# =============================================================================
# EVENT BUS TESTS
# =============================================================================


@pytest.mark.django_db
class TestEventBus:
    """Test EventBus publish/subscribe."""

    def test_subscribe_and_receive_event(self):
        """Should deliver event to subscribed handler."""
        bus = get_event_bus()
        received = []

        def handler(event):
            received.append(event)

        bus.subscribe("test.event", handler)
        bus.publish(
            DomainEvent(
                event_type="test.event",
                aggregate_type="Test",
                aggregate_id=1,
                payload={"key": "value"},
            )
        )

        assert len(received) == 1
        assert received[0].event_type == "test.event"
        assert received[0].payload == {"key": "value"}

    def test_handler_not_called_for_other_event_types(self):
        """Should not call handler for unrelated event types."""
        bus = get_event_bus()
        received = []

        bus.subscribe("type.a", lambda e: received.append(e))
        bus.publish(
            DomainEvent(event_type="type.b", aggregate_type="B", aggregate_id=1)
        )

        assert len(received) == 0

    def test_multiple_handlers_for_same_type(self):
        """Should call all handlers registered for the same event type."""
        bus = get_event_bus()
        calls_a = []
        calls_b = []

        bus.subscribe("test.multi", lambda e: calls_a.append(e))
        bus.subscribe("test.multi", lambda e: calls_b.append(e))
        bus.publish(
            DomainEvent(event_type="test.multi", aggregate_type="Test", aggregate_id=1)
        )

        assert len(calls_a) == 1
        assert len(calls_b) == 1

    def test_wildcard_subscriber(self):
        """Should call wildcard handlers for all event types."""
        bus = get_event_bus()
        all_events = []

        bus.subscribe("*", lambda e: all_events.append(e))
        bus.publish(
            DomainEvent(event_type="type.a", aggregate_type="A", aggregate_id=1)
        )
        bus.publish(
            DomainEvent(event_type="type.b", aggregate_type="B", aggregate_id=2)
        )

        assert len(all_events) == 2

    def test_handler_failure_does_not_block_others(self):
        """Should continue dispatching even if one handler fails."""
        bus = get_event_bus()
        received = []

        def failing_handler(event):
            raise ValueError("intentional failure")

        def success_handler(event):
            received.append(event)

        bus.subscribe("test.fail", failing_handler)
        bus.subscribe("test.fail", success_handler)
        bus.publish(
            DomainEvent(event_type="test.fail", aggregate_type="Test", aggregate_id=1)
        )

        assert len(received) == 1  # success_handler still called

    def test_unsubscribe_handler(self):
        """Should remove handler after unsubscribe."""
        bus = get_event_bus()
        received = []

        def handler(event):
            received.append(event)

        bus.subscribe("test.unsub", handler)
        bus.unsubscribe("test.unsub", handler)
        bus.publish(
            DomainEvent(event_type="test.unsub", aggregate_type="Test", aggregate_id=1)
        )

        assert len(received) == 0

    def test_unsubscribe_wildcard(self):
        """Should remove wildcard handler after unsubscribe."""
        bus = get_event_bus()
        received = []

        def handler(event):
            received.append(event)

        bus.subscribe("*", handler)
        bus.unsubscribe("*", handler)
        bus.publish(
            DomainEvent(event_type="test.wild", aggregate_type="Test", aggregate_id=1)
        )

        assert len(received) == 0

    def test_clear_removes_all_subscribers(self):
        """Should remove all subscribers after clear."""
        bus = get_event_bus()
        received = []

        bus.subscribe("test.clear", lambda e: received.append(e))
        bus.subscribe("*", lambda e: received.append(e))
        bus.clear()
        bus.publish(
            DomainEvent(event_type="test.clear", aggregate_type="Test", aggregate_id=1)
        )

        assert len(received) == 0

    def test_duplicate_subscribe_ignored(self):
        """Should not register same handler twice for same event type."""
        bus = get_event_bus()
        calls = []

        def handler(event):
            calls.append(event)

        bus.subscribe("test.dup", handler)
        bus.subscribe("test.dup", handler)  # Duplicate
        bus.publish(
            DomainEvent(event_type="test.dup", aggregate_type="Test", aggregate_id=1)
        )

        assert len(calls) == 1  # Called once, not twice

    def test_singleton_returns_same_instance(self):
        """get_event_bus should return the same instance."""
        bus1 = get_event_bus()
        bus2 = get_event_bus()
        assert bus1 is bus2


# =============================================================================
# EVENT STORE TESTS
# =============================================================================


@pytest.mark.django_db
class TestEventStore:
    """Test EventStore persistence and replay."""

    def test_event_persisted_on_publish(self):
        """Should persist event to EventStore when published."""
        bus = get_event_bus()
        bus.publish(
            DomainEvent(
                event_type="prescription.created",
                aggregate_type="Prescription",
                aggregate_id=42,
                payload={"number": "RX-001"},
                user_id=5,
                facility_id=3,
            )
        )

        assert EventStore.objects.count() == 1
        record = EventStore.objects.first()
        assert record.event_type == "prescription.created"
        assert record.aggregate_type == "Prescription"
        assert record.aggregate_id == "42"
        assert record.payload == {"number": "RX-001"}
        assert record.user_id == 5
        assert record.facility_id == 3

    def test_multiple_events_persisted(self):
        """Should persist multiple events."""
        bus = get_event_bus()
        for i in range(5):
            bus.publish(
                DomainEvent(
                    event_type="test.event",
                    aggregate_type="Test",
                    aggregate_id=i,
                )
            )

        assert EventStore.objects.count() == 5

    def test_replay_by_event_type(self):
        """Should filter replayed events by type prefix."""
        bus = get_event_bus()
        bus.publish(
            DomainEvent(event_type="prescription.created", aggregate_type="Rx", aggregate_id=1)
        )
        bus.publish(
            DomainEvent(event_type="prescription.expired", aggregate_type="Rx", aggregate_id=2)
        )
        bus.publish(
            DomainEvent(event_type="invoice.created", aggregate_type="Inv", aggregate_id=3)
        )

        rx_events = EventStore.replay(event_type="prescription")
        assert rx_events.count() == 2

    def test_replay_by_aggregate(self):
        """Should filter replayed events by aggregate type and id."""
        bus = get_event_bus()
        bus.publish(
            DomainEvent(event_type="rx.created", aggregate_type="Prescription", aggregate_id=42)
        )
        bus.publish(
            DomainEvent(event_type="rx.expired", aggregate_type="Prescription", aggregate_id=42)
        )
        bus.publish(
            DomainEvent(event_type="rx.created", aggregate_type="Prescription", aggregate_id=99)
        )

        events = EventStore.replay(aggregate_type="Prescription", aggregate_id="42")
        assert events.count() == 2

    def test_replay_by_facility(self):
        """Should filter replayed events by facility."""
        bus = get_event_bus()
        bus.publish(
            DomainEvent(
                event_type="test.a", aggregate_type="A", aggregate_id=1, facility_id=1
            )
        )
        bus.publish(
            DomainEvent(
                event_type="test.b", aggregate_type="B", aggregate_id=2, facility_id=2
            )
        )

        events = EventStore.replay(facility_id=1)
        assert events.count() == 1
        assert events.first().facility_id == 1

    def test_replay_by_time_range(self):
        """Should filter replayed events by timestamp range."""
        bus = get_event_bus()

        now = timezone.now()
        past = now - timezone.timedelta(hours=2)
        future = now + timezone.timedelta(hours=2)

        bus.publish(
            DomainEvent(event_type="test.now", aggregate_type="T", aggregate_id=1)
        )

        events = EventStore.replay(since=past, until=future)
        assert events.count() == 1

        # Events outside range
        events = EventStore.replay(since=future)
        assert events.count() == 0

    def test_replay_ordered_by_timestamp(self):
        """Should return replayed events in chronological order."""
        bus = get_event_bus()
        for i in range(3):
            bus.publish(
                DomainEvent(event_type="ordered", aggregate_type="O", aggregate_id=i)
            )

        events = list(EventStore.replay(event_type="ordered"))
        timestamps = [e.timestamp for e in events]
        assert timestamps == sorted(timestamps)

    def test_event_store_str(self):
        """Should have a readable string representation."""
        bus = get_event_bus()
        bus.publish(
            DomainEvent(
                event_type="prescription.created",
                aggregate_type="Prescription",
                aggregate_id=42,
            )
        )

        record = EventStore.objects.first()
        assert "prescription.created" in str(record)
        assert "Prescription" in str(record)


# =============================================================================
# DECORATOR TESTS
# =============================================================================


@pytest.mark.django_db
class TestDecorators:
    """Test event publishing and handling decorators."""

    def test_handles_event_decorator(self):
        """Should register handler via decorator and receive events."""
        from hmis.apps.core.events.decorators import handles_event

        received = []

        @handles_event("test.decorated")
        def my_handler(event):
            received.append(event)

        bus = get_event_bus()
        bus.publish(
            DomainEvent(
                event_type="test.decorated", aggregate_type="Test", aggregate_id=1
            )
        )

        assert len(received) == 1

    def test_publishes_event_decorator(self):
        """Should publish event when decorated function returns event dict."""
        from hmis.apps.core.events.decorators import publishes_event

        received = []
        bus = get_event_bus()
        bus.subscribe("test.published", lambda e: received.append(e))

        @publishes_event("test.published", aggregate_type="Test")
        def create_thing():
            return {
                "aggregate_id": 42,
                "payload": {"name": "test"},
                "user_id": 5,
                "facility_id": 3,
            }

        result = create_thing()

        assert result["aggregate_id"] == 42
        assert len(received) == 1
        assert received[0].payload == {"name": "test"}
        assert received[0].user_id == 5

    def test_publishes_event_skips_on_none(self):
        """Should not publish event if function returns None."""
        from hmis.apps.core.events.decorators import publishes_event

        received = []
        bus = get_event_bus()
        bus.subscribe("test.none", lambda e: received.append(e))

        @publishes_event("test.none", aggregate_type="Test")
        def noop():
            return None

        noop()
        assert len(received) == 0

    def test_publishes_event_skips_non_dict(self):
        """Should not publish event if function returns non-dict."""
        from hmis.apps.core.events.decorators import publishes_event

        received = []
        bus = get_event_bus()
        bus.subscribe("test.nondict", lambda e: received.append(e))

        @publishes_event("test.nondict", aggregate_type="Test")
        def returns_string():
            return "not a dict"

        result = returns_string()
        assert result == "not a dict"
        assert len(received) == 0

    def test_publishes_event_persists_to_store(self):
        """Should persist event to EventStore via decorator."""
        from hmis.apps.core.events.decorators import publishes_event

        @publishes_event("test.persisted", aggregate_type="Test")
        def do_create():
            return {"aggregate_id": 1, "payload": {"created": True}}

        do_create()

        assert EventStore.objects.filter(event_type="test.persisted").count() == 1
