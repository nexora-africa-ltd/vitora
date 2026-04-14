#!/usr/bin/env python3
"""
WebSocket load testing script.

Simulates multiple concurrent WebSocket connections across facilities
and measures fan-out latency for broadcast events.

Requirements:
    pip install websockets aiohttp

Usage:
    # Basic — 10 facilities, 5 users each:
    python scripts/load_test_websockets.py

    # Custom parameters:
    python scripts/load_test_websockets.py \
        --base-url ws://localhost:9088 \
        --api-url http://localhost:9088 \
        --facilities 50 --users-per-facility 20 \
        --events 100 --duration 30

    # With authentication (uses JWT):
    python scripts/load_test_websockets.py --username admin --password admin123
"""

import argparse
import asyncio
import json
import logging
import statistics
import sys
import time
from dataclasses import dataclass, field

logger = logging.getLogger("ws_load_test")


@dataclass
class LoadTestMetrics:
    """Aggregated load test results."""

    connections_attempted: int = 0
    connections_succeeded: int = 0
    connections_failed: int = 0
    messages_received: int = 0
    latencies_ms: list[float] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def p50_ms(self) -> float:
        if not self.latencies_ms:
            return 0
        sorted_lat = sorted(self.latencies_ms)
        idx = len(sorted_lat) // 2
        return sorted_lat[idx]

    @property
    def p95_ms(self) -> float:
        if not self.latencies_ms:
            return 0
        sorted_lat = sorted(self.latencies_ms)
        idx = int(len(sorted_lat) * 0.95)
        return sorted_lat[min(idx, len(sorted_lat) - 1)]

    @property
    def p99_ms(self) -> float:
        if not self.latencies_ms:
            return 0
        sorted_lat = sorted(self.latencies_ms)
        idx = int(len(sorted_lat) * 0.99)
        return sorted_lat[min(idx, len(sorted_lat) - 1)]

    @property
    def avg_ms(self) -> float:
        return statistics.mean(self.latencies_ms) if self.latencies_ms else 0

    def summary(self) -> str:
        return (
            f"\n{'=' * 60}\n"
            f"  WebSocket Load Test Results\n"
            f"{'=' * 60}\n"
            f"  Connections: {self.connections_succeeded}/{self.connections_attempted} "
            f"({self.connections_failed} failed)\n"
            f"  Messages received: {self.messages_received}\n"
            f"  Latency (ms):\n"
            f"    avg: {self.avg_ms:.1f}\n"
            f"    p50: {self.p50_ms:.1f}\n"
            f"    p95: {self.p95_ms:.1f}\n"
            f"    p99: {self.p99_ms:.1f}\n"
            f"  Errors: {len(self.errors)}\n"
            f"{'=' * 60}"
        )


async def get_jwt_token(api_url: str, username: str, password: str) -> str | None:
    """Obtain a JWT access token from the API."""
    try:
        import aiohttp

        async with aiohttp.ClientSession() as session, session.post(
            f"{api_url}/api/token/",
            json={"username": username, "password": password},
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data.get("access")
            logger.error("Auth failed: %d %s", resp.status, await resp.text())
    except ImportError:
        logger.error("aiohttp required for authentication: pip install aiohttp")
    except Exception as e:
        logger.error("Auth error: %s", e)
    return None


async def ws_client(
    url: str,
    facility_id: int,
    client_id: int,
    metrics: LoadTestMetrics,
    duration: float,
    token: str | None = None,
):
    """Single WebSocket client that connects and listens for messages."""
    try:
        import websockets
    except ImportError:
        logger.error("websockets library required: pip install websockets")
        return

    metrics.connections_attempted += 1
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with websockets.connect(url, additional_headers=headers) as ws:
            metrics.connections_succeeded += 1
            start = time.monotonic()

            while (time.monotonic() - start) < duration:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    recv_time = time.monotonic()
                    data = json.loads(msg)

                    # Measure latency if timestamp is in the message
                    sent_ts = data.get("data", {}).get("_sent_at")
                    if sent_ts:
                        latency = (recv_time - sent_ts) * 1000
                        metrics.latencies_ms.append(latency)

                    metrics.messages_received += 1
                except TimeoutError:
                    continue
                except Exception as e:
                    metrics.errors.append(f"client-{facility_id}-{client_id}: recv error: {e}")
                    break

    except Exception as e:
        metrics.connections_failed += 1
        metrics.errors.append(f"client-{facility_id}-{client_id}: connect error: {e}")


async def run_load_test(args):
    """Execute the load test with the given parameters."""
    metrics = LoadTestMetrics()

    # Authenticate if credentials provided
    token = None
    if args.username and args.password:
        logger.info("Authenticating as %s...", args.username)
        token = await get_jwt_token(args.api_url, args.username, args.password)
        if not token:
            logger.error("Authentication failed, running without token")

    # Build connection tasks
    tasks = []
    for fac_id in range(1, args.facilities + 1):
        for user_id in range(1, args.users_per_facility + 1):
            # Cycle through different WS endpoints
            endpoints = [
                f"{args.base_url}/ws/pharmacy/{fac_id}/queue/",
                f"{args.base_url}/ws/billing/{fac_id}/invoices/",
            ]
            url = endpoints[user_id % len(endpoints)]
            tasks.append(ws_client(url, fac_id, user_id, metrics, args.duration, token))

    total = len(tasks)
    logger.info(
        "Starting load test: %d connections (%d facilities × %d users), duration=%ds",
        total, args.facilities, args.users_per_facility, args.duration,
    )

    # Run all clients concurrently
    await asyncio.gather(*tasks, return_exceptions=True)

    print(metrics.summary())

    # Exit with error code if too many failures
    failure_rate = metrics.connections_failed / max(metrics.connections_attempted, 1)
    if failure_rate > 0.1:  # >10% failure
        logger.error("High failure rate: %.1f%%", failure_rate * 100)
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="WebSocket Load Test for Vitora HMIS")
    parser.add_argument("--base-url", default="ws://localhost:9088", help="WebSocket base URL")
    parser.add_argument("--api-url", default="http://localhost:9088", help="REST API base URL")
    parser.add_argument("--facilities", type=int, default=10, help="Number of facilities")
    parser.add_argument("--users-per-facility", type=int, default=5, help="Users per facility")
    parser.add_argument("--duration", type=int, default=10, help="Test duration in seconds")
    parser.add_argument("--events", type=int, default=50, help="Events to generate (unused)")
    parser.add_argument("--username", default="", help="API username for JWT auth")
    parser.add_argument("--password", default="", help="API password for JWT auth")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    sys.exit(asyncio.run(run_load_test(args)))


if __name__ == "__main__":
    main()
