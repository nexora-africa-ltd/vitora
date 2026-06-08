"""
Hub Discovery Service — mDNS advertisement + UDP broadcast responder.

Allows LAN clients to automatically discover the facility hub without
manual IP configuration.

Two discovery methods:
1. mDNS/DNS-SD: Advertises _vitora._tcp.local via zeroconf
2. UDP broadcast: Responds to VITORA_DISCOVER probes on port 19088

Usage:
    from hmis.apps.core.hub_discovery import HubDiscoveryService
    service = HubDiscoveryService()
    service.start()  # non-blocking (daemon threads)
    ...
    service.stop()

Or via management command:
    python manage.py run_hub --with-discovery
"""

import json
import logging
import socket
import threading

from django.conf import settings

logger = logging.getLogger(__name__)

DISCOVERY_UDP_PORT = 19088
DISCOVERY_MAGIC = b"VITORA_DISCOVER"


class HubDiscoveryService:
    """Advertises the hub on the local network via mDNS and UDP."""

    def __init__(self):
        self.hub_port: int = int(getattr(settings, "HUB_PORT", 9088))
        self.hub_id: str = getattr(settings, "HUB_ID", "")
        self.facility_id: str = getattr(settings, "HUB_FACILITY_ID", "")
        self.facility_name: str = getattr(settings, "HUB_FACILITY_NAME", "Vitora Hub")
        self.version: str = "0.3.0"

        self._mdns_info = None
        self._zeroconf = None
        self._udp_thread: threading.Thread | None = None
        self._udp_stop = threading.Event()

    def start(self):
        """Start both mDNS and UDP discovery (non-blocking)."""
        self._start_mdns()
        self._start_udp_responder()

    def stop(self):
        """Stop all discovery services."""
        self._stop_udp_responder()
        self._stop_mdns()

    # -----------------------------------------------------------------------
    # mDNS (zeroconf)
    # -----------------------------------------------------------------------

    def _start_mdns(self):
        """Register _vitora._tcp.local service via zeroconf."""
        try:
            from zeroconf import ServiceInfo, Zeroconf

            local_ip = self._get_local_ip()
            if not local_ip:
                logger.warning("Could not determine local IP for mDNS. Skipping.")
                return

            self._zeroconf = Zeroconf()
            self._mdns_info = ServiceInfo(
                type_="_vitora._tcp.local.",
                name=f"vitora-hub-{self.hub_id}._vitora._tcp.local.",
                addresses=[socket.inet_aton(local_ip)],
                port=self.hub_port,
                properties={
                    "facility_id": self.facility_id,
                    "facility_name": self.facility_name,
                    "hub_id": self.hub_id,
                    "version": self.version,
                },
            )
            self._zeroconf.register_service(self._mdns_info)
            logger.info(
                "mDNS: Advertising _vitora._tcp.local on %s:%d",
                local_ip,
                self.hub_port,
            )
        except ImportError:
            logger.info(
                "zeroconf package not installed. mDNS discovery disabled. "
                "Install with: pip install zeroconf"
            )
        except Exception:
            logger.exception("Failed to start mDNS advertisement")

    def _stop_mdns(self):
        """Unregister mDNS service."""
        try:
            if self._zeroconf and self._mdns_info:
                self._zeroconf.unregister_service(self._mdns_info)
                self._zeroconf.close()
                logger.info("mDNS: Service unregistered.")
        except Exception:
            logger.exception("Error stopping mDNS")
        finally:
            self._zeroconf = None
            self._mdns_info = None

    # -----------------------------------------------------------------------
    # UDP Broadcast Responder
    # -----------------------------------------------------------------------

    def _start_udp_responder(self):
        """Start a UDP listener that responds to discovery probes."""
        self._udp_stop.clear()
        self._udp_thread = threading.Thread(
            target=self._udp_listen_loop,
            name="hub-udp-discovery",
            daemon=True,
        )
        self._udp_thread.start()
        logger.info("UDP discovery responder started on port %d", DISCOVERY_UDP_PORT)

    def _stop_udp_responder(self):
        """Stop the UDP responder thread."""
        self._udp_stop.set()
        if self._udp_thread and self._udp_thread.is_alive():
            self._udp_thread.join(timeout=3)
        logger.info("UDP discovery responder stopped.")

    def _udp_listen_loop(self):
        """Listen for VITORA_DISCOVER probes and respond with hub info."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.settimeout(1.0)  # 1s timeout for checking stop event

        try:
            sock.bind(("", DISCOVERY_UDP_PORT))
        except OSError as e:
            logger.error("Cannot bind UDP port %d: %s", DISCOVERY_UDP_PORT, e)
            return

        local_ip = self._get_local_ip() or "127.0.0.1"
        response_payload = json.dumps(
            {
                "url": f"http://{local_ip}:{self.hub_port}",
                "facility_id": self.facility_id,
                "facility_name": self.facility_name,
                "hub_id": self.hub_id,
                "version": self.version,
            }
        ).encode("utf-8")

        while not self._udp_stop.is_set():
            try:
                data, addr = sock.recvfrom(1024)
                if data.strip() == DISCOVERY_MAGIC:
                    sock.sendto(response_payload, addr)
                    logger.debug("UDP discovery: responded to %s", addr)
            except TimeoutError:
                continue
            except Exception:
                if not self._udp_stop.is_set():
                    logger.exception("UDP discovery error")

        sock.close()

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _get_local_ip() -> str | None:
        """Get the primary LAN IP address of this machine."""
        try:
            # Connect to a non-routable address to determine local interface IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return None
