"""
WebSocket Consumers for Emergency/Triage Queue.

Provides real-time updates for the emergency department dashboard.
Clients connect to receive live updates about critical patients and zone stats.

WebSocket endpoint: ws://localhost/ws/emergency/queue/
"""

import asyncio
import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

logger = logging.getLogger(__name__)


class EmergencyQueueConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for emergency queue real-time updates.

    Handles:
    - Connection management (connect/disconnect)
    - Periodic broadcasting of critical patients and zone stats
    - Broadcasting queue events to connected clients

    Events broadcasted:
    - emergency.critical_update: Critical (RED) patients in ER zones
    - emergency.zones_update: Zone summary statistics
    - emergency.patient_added: New patient added to ER queue
    - emergency.patient_moved: Patient status changed
    """

    # Periodic broadcast interval (seconds)
    BROADCAST_INTERVAL = 5

    async def connect(self):
        """Handle WebSocket connection."""
        self.room_group_name = "emergency_queue"
        self._task = None

        # Join emergency queue group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        logger.info("WebSocket connected to emergency queue")

        # Start periodic broadcast task
        self._task = asyncio.create_task(self._periodic_broadcast())

        # Send initial data immediately
        await self._send_current_state()

    async def disconnect(self, _close_code):
        """Handle WebSocket disconnection."""
        # Cancel periodic task
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Leave emergency group
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            logger.info("WebSocket disconnected from emergency queue")

    async def receive(self, text_data=None, _bytes_data=None):
        """Handle incoming WebSocket messages."""
        if text_data:
            try:
                content = json.loads(text_data)
                await self.receive_json(content)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON received: {e}")
                await self.send_json({"error": "Invalid JSON format", "detail": str(e)})

    async def receive_json(self, content):
        """Handle incoming WebSocket messages."""
        message_type = content.get("type", "unknown")
        logger.debug(f"Received WebSocket message: {message_type}")

        if message_type == "ping":
            await self.send_json({"type": "pong", "timestamp": content.get("timestamp")})
        elif message_type == "refresh":
            # Client requesting immediate refresh
            await self._send_current_state()

    async def _periodic_broadcast(self):
        """Periodically broadcast state to all connected clients."""
        while True:
            try:
                await asyncio.sleep(self.BROADCAST_INTERVAL)
                await self._send_current_state()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic broadcast: {e}")

    async def _send_current_state(self):
        """Send current critical patients and zone stats."""
        try:
            critical_data = await self._get_critical_patients()
            zones_data = await self._get_zones_summary()

            await self.send_json({
                "type": "state_update",
                "data": {
                    "critical": critical_data,
                    "zones": zones_data,
                    "timestamp": timezone.now().isoformat(),
                },
            })
        except Exception as e:
            logger.error(f"Error sending state: {e}")

    @database_sync_to_async
    def _get_critical_patients(self) -> dict[str, Any]:
        """Get critical (RED) patients in ER zones."""
        from hmis.apps.triage.models import TriageQueue

        er_areas = [
            "ER_RESUS", "ER_ACUTE", "TRAUMA", "ER_FAST_TRACK",
            "OBSERVATION", "PEDIATRIC_ER", "MATERNITY"
        ]

        queryset = TriageQueue.objects.filter(
            triage_assessment__triage_category="RED",
            triage_assessment__assigned_area__in=er_areas,
            status__in=["WAITING", "CALLED"],
        ).select_related(
            "triage_assessment__encounter__patient",
        ).order_by("triage_assessment__arrival_time")

        patients = []
        now = timezone.now()

        for entry in queryset:
            assessment = entry.triage_assessment
            patient = assessment.encounter.patient
            encounter = assessment.encounter
            wait_delta = now - assessment.arrival_time
            wait_minutes = int(wait_delta.total_seconds() / 60)

            patients.append({
                "id": assessment.id,  # Triage assessment ID for routing
                "queue_id": entry.id,  # Queue entry ID
                "encounter_id": encounter.id,
                "encounter_status": encounter.status,
                "patient_name": f"{patient.first_name} {patient.last_name}",
                "mrn": patient.mrn,
                "chief_complaint": assessment.chief_complaint or "",
                "assigned_area": assessment.assigned_area,
                "assigned_area_display": assessment.get_assigned_area_display(),
                "wait_minutes": wait_minutes,
                "arrival_time": assessment.arrival_time.isoformat(),
                "status": entry.status,
            })

        return {"count": len(patients), "patients": patients}

    @database_sync_to_async
    def _get_zones_summary(self) -> dict[str, Any]:
        """Get summary stats for all ER zones."""
        from hmis.apps.triage.models import TriageQueue

        er_zones = [
            {"code": "ER_RESUS", "name": "Resuscitation", "capacity": 4, "default_category": "RED"},
            {"code": "ER_ACUTE", "name": "Acute Care", "capacity": 10, "default_category": "ORANGE"},
            {"code": "TRAUMA", "name": "Trauma Bay", "capacity": 2, "default_category": "RED"},
            {"code": "ER_FAST_TRACK", "name": "Fast Track", "capacity": 12, "default_category": "GREEN"},
            {"code": "OBSERVATION", "name": "Observation", "capacity": 8, "default_category": "YELLOW"},
            {"code": "PEDIATRIC_ER", "name": "Pediatric ER", "capacity": 6, "default_category": "ORANGE"},
            {"code": "MATERNITY", "name": "Maternity", "capacity": 4, "default_category": "ORANGE"},
        ]

        active_statuses = ["WAITING", "CALLED", "WITH_CLINICIAN"]
        zone_stats = []

        for zone in er_zones:
            zone_queryset = TriageQueue.objects.filter(
                triage_assessment__assigned_area=zone["code"],
                status__in=active_statuses,
            ).select_related("triage_assessment")

            category_counts = {"RED": 0, "ORANGE": 0, "YELLOW": 0, "GREEN": 0, "BLUE": 0}
            for entry in zone_queryset:
                category = entry.triage_assessment.triage_category
                if category in category_counts:
                    category_counts[category] += 1

            total = sum(category_counts.values())

            primary_category = zone["default_category"]
            for cat in ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"]:
                if category_counts[cat] > 0:
                    primary_category = cat
                    break

            zone_stats.append({
                "code": zone["code"],
                "name": zone["name"],
                "capacity": zone["capacity"],
                "total": total,
                "primary_category": primary_category,
                "by_category": category_counts,
            })

        return {
            "zones": zone_stats,
            "total_patients": sum(z["total"] for z in zone_stats),
        }

    # =========================================================================
    # Channel layer event handlers (for group broadcasts)
    # =========================================================================

    async def emergency_critical_update(self, event):
        """Handle critical patient update broadcast."""
        await self.send_json({
            "type": "critical_update",
            "data": event["data"],
        })

    async def emergency_zones_update(self, event):
        """Handle zones stats update broadcast."""
        await self.send_json({
            "type": "zones_update",
            "data": event["data"],
        })

    async def emergency_patient_event(self, event):
        """Handle individual patient events (added, moved, removed)."""
        await self.send_json({
            "type": event["event_type"],
            "data": event["data"],
        })

    async def emergency_bed_update(self, event):
        """Handle ER bed status change broadcasts."""
        await self.send_json({
            "type": "bed_update",
            "data": event["data"],
        })

    async def emergency_wait_breach(self, event):
        """Handle wait time breach alert broadcasts."""
        await self.send_json({
            "type": "wait_time_breach",
            "data": event["data"],
        })

    async def emergency_escalation_event(self, event):
        """Handle escalation event broadcasts."""
        await self.send_json({
            "type": "escalation_event",
            "data": event["data"],
        })


# =============================================================================
# Utility function to broadcast updates from signals/views
# =============================================================================


async def broadcast_emergency_update(event_type: str, data: dict[str, Any]):
    """
    Broadcast an emergency update to all connected clients.

    Call this from signals or views when triage queue changes.

    Args:
        event_type: One of 'critical_update', 'zones_update', 'patient_added', etc.
        data: Event-specific data payload
    """
    from channels.layers import get_channel_layer

    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        "emergency_queue",
        {
            "type": f"emergency.{event_type.replace('_', '.')}",
            "event_type": event_type,
            "data": data,
        },
    )
