"""
Read-Model Projection Infrastructure for Vitora HMIS.

Projections are denormalized, read-optimized views derived from domain events.
They provide fast dashboard queries without hitting normalized tables.

Architecture:
- Projection: Abstract base class defining the event→state contract
- ProjectionRegistry: Auto-discovers and wires projections to the EventBus
- rebuild_projection: Management command for replaying events to rebuild state
"""
