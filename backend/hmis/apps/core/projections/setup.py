"""
Projection setup — registers and wires all projections.

Import this module to ensure all projections are registered and subscribed
to the EventBus. This is called from:
- CoreConfig.ready() (app startup)
- rebuild_projection management command
"""

import logging

from hmis.apps.core.projections.clinic_queue import ClinicQueueProjection
from hmis.apps.core.projections.pharmacy_queue import PharmacyQueueProjection
from hmis.apps.core.projections.registry import get_projection_registry
from hmis.apps.core.projections.ward_occupancy import WardOccupancyProjection

logger = logging.getLogger(__name__)


def register_projections() -> None:
    """Register all projection instances and wire them to the EventBus."""
    registry = get_projection_registry()

    registry.register(ClinicQueueProjection())
    registry.register(WardOccupancyProjection())
    registry.register(PharmacyQueueProjection())

    registry.wire()
    logger.info("All projections registered and wired.")
