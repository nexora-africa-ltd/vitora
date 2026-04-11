"""
Core WebSocket infrastructure.

Shared components for all WebSocket consumers:
- BaseConsumer: heartbeat ping/pong, connection logging
- ThrottledBroadcaster: batched event aggregation
- Health check endpoint
"""
