"""
Management command to replay domain events.

Usage:
    # Replay all events for a specific aggregate
    python manage.py replay_events --aggregate-type Prescription --aggregate-id 123

    # Replay all events of a specific type
    python manage.py replay_events --event-type prescription.created

    # Replay events since a given date
    python manage.py replay_events --since 2026-04-01

    # Replay events for a facility
    python manage.py replay_events --facility-id 1

    # Dry run (list events without dispatching)
    python manage.py replay_events --event-type prescription.created --dry-run
"""

import logging

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Replay domain events from the EventStore through the EventBus."

    def add_arguments(self, parser):
        parser.add_argument(
            "--event-type",
            type=str,
            help="Filter by event type prefix (e.g. 'prescription.created')",
        )
        parser.add_argument(
            "--aggregate-type",
            type=str,
            help="Filter by aggregate type (e.g. 'Prescription')",
        )
        parser.add_argument(
            "--aggregate-id",
            type=str,
            help="Filter by aggregate ID",
        )
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Filter by facility ID",
        )
        parser.add_argument(
            "--since",
            type=str,
            help="Replay events since this datetime (ISO format, e.g. 2026-04-01T00:00:00)",
        )
        parser.add_argument(
            "--until",
            type=str,
            help="Replay events until this datetime (ISO format)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List events without dispatching to handlers",
        )

    def handle(self, *args, **options):
        from hmis.apps.core.events.base import DomainEvent
        from hmis.apps.core.events.bus import get_event_bus
        from hmis.apps.core.events.store import EventStore

        since = None
        until = None

        if options["since"]:
            since = parse_datetime(options["since"])
            if since is None:
                self.stderr.write(f"Invalid --since datetime: {options['since']}")
                return
            if timezone.is_naive(since):
                since = timezone.make_aware(since)

        if options["until"]:
            until = parse_datetime(options["until"])
            if until is None:
                self.stderr.write(f"Invalid --until datetime: {options['until']}")
                return
            if timezone.is_naive(until):
                until = timezone.make_aware(until)

        events_qs = EventStore.replay(
            event_type=options.get("event_type"),
            aggregate_type=options.get("aggregate_type"),
            aggregate_id=options.get("aggregate_id"),
            facility_id=options.get("facility_id"),
            since=since,
            until=until,
        )

        count = events_qs.count()
        self.stdout.write(f"Found {count} event(s) to replay.")

        if count == 0:
            return

        if options["dry_run"]:
            self.stdout.write("Dry run — listing events without dispatching:\n")
            for record in events_qs[:50]:
                self.stdout.write(
                    f"  [{record.timestamp}] {record.event_type} "
                    f"{record.aggregate_type}:{record.aggregate_id}"
                )
            if count > 50:
                self.stdout.write(f"  ... and {count - 50} more")
            return

        bus = get_event_bus()
        dispatched = 0
        errors = 0

        for record in events_qs.iterator():
            event = DomainEvent(
                event_type=record.event_type,
                aggregate_type=record.aggregate_type,
                aggregate_id=record.aggregate_id,
                payload=record.payload,
                timestamp=record.timestamp,
                user_id=record.user_id,
                facility_id=record.facility_id,
                organization_id=record.organization_id,
                correlation_id=record.correlation_id,
                event_id=record.event_id,
            )

            try:
                # Dispatch to subscribers only (skip persistence — already stored)
                with bus._lock:
                    handlers = list(bus._subscribers.get(event.event_type, []))
                    wildcard_handlers = list(bus._wildcard_subscribers)

                for handler in handlers:
                    bus._safe_call(handler, event)
                for handler in wildcard_handlers:
                    bus._safe_call(handler, event)

                dispatched += 1
            except Exception:
                errors += 1
                logger.exception(f"Failed to replay event {record.event_id}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Replay complete: {dispatched} dispatched, {errors} errors."
            )
        )
