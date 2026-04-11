"""
Projection Registry.

Discovers projection instances and wires them to the EventBus.
Provides lookup by name for the rebuild management command.
"""

import logging

from hmis.apps.core.events.bus import get_event_bus
from hmis.apps.core.projections.base import Projection

logger = logging.getLogger(__name__)


class ProjectionRegistry:
    """
    Singleton registry that holds all projection instances.

    Usage:
        registry = get_projection_registry()
        registry.register(ClinicQueueProjection())
        registry.wire()  # subscribes all projections to the EventBus
    """

    def __init__(self):
        self._projections: dict[str, Projection] = {}
        self._wired = False

    def register(self, projection: Projection) -> None:
        """Register a projection instance."""
        name = projection.name
        if name in self._projections:
            logger.warning("Projection %s already registered, skipping", name)
            return
        self._projections[name] = projection
        logger.debug("Registered projection: %s (events: %s)", name, projection.event_types)

    def get(self, name: str) -> Projection | None:
        """Get a projection by name."""
        return self._projections.get(name)

    def all(self) -> dict[str, Projection]:
        """Return all registered projections."""
        return dict(self._projections)

    def wire(self) -> None:
        """Subscribe all registered projections to the EventBus."""
        if self._wired:
            return

        bus = get_event_bus()
        for name, projection in self._projections.items():
            for event_type in projection.event_types:
                bus.subscribe(event_type, projection.handle_event)
            projection.on_registered()
            logger.info("Wired projection %s to %d event types", name, len(projection.event_types))

        self._wired = True

    def clear(self) -> None:
        """Unregister all projections (for testing)."""
        self._projections.clear()
        self._wired = False


# Singleton
_registry: ProjectionRegistry | None = None


def get_projection_registry() -> ProjectionRegistry:
    """Get or create the singleton ProjectionRegistry."""
    global _registry
    if _registry is None:
        _registry = ProjectionRegistry()
    return _registry


def reset_projection_registry() -> None:
    """Reset the singleton registry (for testing)."""
    global _registry
    if _registry is not None:
        _registry.clear()
    _registry = None
