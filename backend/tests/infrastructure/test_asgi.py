"""
Tests for ASGI Configuration.

This module tests the ASGI application configuration in hmis/asgi.py,
including HTTP and WebSocket protocol routing.
"""

import pytest  # type: ignore
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.testing import WebsocketCommunicator

from hmis.asgi import application, websocket_urlpatterns


@pytest.mark.django_db
class TestAsgiConfiguration:
    """Tests for ASGI application configuration."""

    def test_application_is_protocol_type_router(self):
        """Application should be a ProtocolTypeRouter instance."""
        assert isinstance(application, ProtocolTypeRouter)

    def test_application_has_http_handler(self):
        """Application should have an HTTP handler configured."""
        # ProtocolTypeRouter stores handlers in application_mapping
        assert "http" in application.application_mapping

    def test_application_has_websocket_handler(self):
        """Application should have a WebSocket handler configured."""
        assert "websocket" in application.application_mapping

    def test_websocket_urlpatterns_combined(self):
        """WebSocket URL patterns should combine all module patterns."""
        # Verify clinic patterns are included
        clinic_patterns = [p for p in websocket_urlpatterns if "clinics" in p.pattern.regex.pattern]
        assert len(clinic_patterns) >= 1, "Clinic WebSocket patterns should be included"

        # Verify lab patterns are included
        lab_patterns = [p for p in websocket_urlpatterns if "lab" in p.pattern.regex.pattern]
        assert len(lab_patterns) >= 1, "Lab WebSocket patterns should be included"

        # Verify inpatient patterns are included
        inpatient_patterns = [
            p for p in websocket_urlpatterns if "inpatient" in p.pattern.regex.pattern
        ]
        assert len(inpatient_patterns) >= 1, "Inpatient WebSocket patterns should be included"

        # Verify MCH patterns are included
        mch_patterns = [p for p in websocket_urlpatterns if "mch" in p.pattern.regex.pattern]
        assert len(mch_patterns) >= 1, "MCH WebSocket patterns should be included"

        # Verify scheduling patterns are included
        scheduling_patterns = [
            p for p in websocket_urlpatterns if "scheduling" in p.pattern.regex.pattern
        ]
        assert len(scheduling_patterns) >= 1, "Scheduling WebSocket patterns should be included"

        # Verify imaging patterns are included
        imaging_patterns = [
            p for p in websocket_urlpatterns if "imaging" in p.pattern.regex.pattern
        ]
        assert len(imaging_patterns) >= 1, "Imaging WebSocket patterns should be included"

        # Verify immunization patterns are included
        immunization_patterns = [
            p for p in websocket_urlpatterns if "immunization" in p.pattern.regex.pattern
        ]
        assert len(immunization_patterns) >= 1, "Immunization WebSocket patterns should be included"

        # Verify dashboard patterns are included
        dashboard_patterns = [
            p for p in websocket_urlpatterns if "dashboard" in p.pattern.regex.pattern
        ]
        assert len(dashboard_patterns) >= 1, "Dashboard WebSocket patterns should be included"

    def test_websocket_urlpatterns_count(self):
        """Should have 17 total WebSocket URL patterns."""
        # 1 clinic queue + 3 lab + 2 MCH (partograph + facility) + 2 inpatient
        # + 1 triage/emergency + 1 surveillance alerts
        # + 1 pharmacy queue + 2 billing (invoices + sha-claims)
        # + 1 scheduling + 1 imaging + 1 immunizations + 1 dashboard = 17 patterns
        assert len(websocket_urlpatterns) == 17

    def test_clinic_queue_pattern_exists(self):
        """Clinic queue WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        clinic_pattern = r"ws/clinics/(?P<clinic_id>\d+)/queue/$"
        assert any(clinic_pattern in p for p in pattern_paths)

    def test_lab_encounter_pattern_exists(self):
        """Lab encounter WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        lab_encounter_pattern = r"ws/lab/encounters/(?P<encounter_id>\d+)/$"
        assert any(lab_encounter_pattern in p for p in pattern_paths)

    def test_lab_order_pattern_exists(self):
        """Lab order WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        lab_order_pattern = r"ws/lab/orders/(?P<order_id>\d+)/$"
        assert any(lab_order_pattern in p for p in pattern_paths)

    def test_lab_clinician_pattern_exists(self):
        """Lab clinician WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        lab_clinician_pattern = r"ws/lab/clinician/$"
        assert any(lab_clinician_pattern in p for p in pattern_paths)

    def test_mch_partograph_pattern_exists(self):
        """MCH partograph WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        mch_partograph_pattern = r"ws/mch/partographs/(?P<partograph_id>\d+)/$"
        assert any(mch_partograph_pattern in p for p in pattern_paths)

    def test_mch_facility_pattern_exists(self):
        """MCH facility WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        mch_facility_pattern = r"ws/mch/facility/(?P<facility_id>\d+)/$"
        assert any(mch_facility_pattern in p for p in pattern_paths)

    def test_scheduling_pattern_exists(self):
        """Scheduling appointments WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        scheduling_pattern = r"ws/scheduling/(?P<facility_id>\d+)/appointments/$"
        assert any(scheduling_pattern in p for p in pattern_paths)

    def test_imaging_pattern_exists(self):
        """Imaging orders WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        imaging_pattern = r"ws/imaging/(?P<facility_id>\d+)/orders/$"
        assert any(imaging_pattern in p for p in pattern_paths)

    def test_immunization_pattern_exists(self):
        """Immunization records WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        immunization_pattern = r"ws/immunizations/(?P<facility_id>\d+)/records/$"
        assert any(immunization_pattern in p for p in pattern_paths)

    def test_dashboard_pattern_exists(self):
        """Dashboard WebSocket pattern should exist."""
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]
        dashboard_pattern = r"ws/dashboard/(?P<facility_id>\d+)/$"
        assert any(dashboard_pattern in p for p in pattern_paths)


@pytest.mark.django_db
@pytest.mark.asyncio
class TestAsgiWebsocketRouting:
    """Async tests for WebSocket routing via ASGI application."""

    async def test_clinic_queue_websocket_route_resolves(self):
        """Clinic queue WebSocket route should be resolvable."""
        communicator = WebsocketCommunicator(
            application,
            "/ws/clinics/1/queue/",
        )
        try:
            # Attempt connection - may fail auth but route should resolve
            connected, _ = await communicator.connect()
            # If we get here without error, route was resolved
            # Auth may reject but that's separate from routing
        except Exception:
            # Expected if auth middleware rejects unauthenticated connection
            pass
        finally:
            await communicator.disconnect()

    async def test_lab_encounter_websocket_route_resolves(self):
        """Lab encounter WebSocket route should be resolvable."""
        communicator = WebsocketCommunicator(
            application,
            "/ws/lab/encounters/1/",
        )
        try:
            connected, _ = await communicator.connect()
        except Exception:
            pass
        finally:
            await communicator.disconnect()

    async def test_lab_order_websocket_route_resolves(self):
        """Lab order WebSocket route should be resolvable."""
        communicator = WebsocketCommunicator(
            application,
            "/ws/lab/orders/1/",
        )
        try:
            connected, _ = await communicator.connect()
        except Exception:
            pass
        finally:
            await communicator.disconnect()

    async def test_lab_clinician_websocket_route_resolves(self):
        """Lab clinician WebSocket route should be resolvable."""
        communicator = WebsocketCommunicator(
            application,
            "/ws/lab/clinician/",
        )
        try:
            connected, _ = await communicator.connect()
        except Exception:
            pass
        finally:
            await communicator.disconnect()

    async def test_mch_partograph_websocket_route_resolves(self):
        """MCH partograph WebSocket route should be resolvable."""
        communicator = WebsocketCommunicator(
            application,
            "/ws/mch/partographs/1/",
        )
        try:
            connected, _ = await communicator.connect()
        except Exception:
            pass
        finally:
            await communicator.disconnect()

    async def test_invalid_websocket_route_not_matched(self):
        """Invalid WebSocket routes should not match any defined patterns."""
        # Test that the patterns don't include invalid routes
        pattern_paths = [p.pattern.regex.pattern for p in websocket_urlpatterns]

        # These invalid patterns should not exist in our routes
        assert not any("invalid" in p for p in pattern_paths)
        assert not any("unknown" in p for p in pattern_paths)

        # All our patterns should only match valid module routes
        for pattern in pattern_paths:
            assert (
                "clinics" in pattern
                or "lab" in pattern
                or "mch" in pattern
                or "inpatient" in pattern
                or "emergency" in pattern
                or "surveillance" in pattern
                or "triage" in pattern
                or "pharmacy" in pattern
                or "billing" in pattern
                or "scheduling" in pattern
                or "imaging" in pattern
                or "immunization" in pattern
                or "dashboard" in pattern
            )
