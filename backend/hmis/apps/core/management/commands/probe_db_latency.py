# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Probe PostgreSQL latency for current/default DB and candidate DATABASE_URL values.

How to run:
  python manage.py probe_db_latency --samples 20 --url "postgresql://..."
  python manage.py probe_db_latency --skip-default --url "postgresql://..." --url "postgresql://..."

Supported args/inputs:
  --url <DATABASE_URL>      Repeatable candidate PostgreSQL URLs to benchmark.
  --samples <int>           Number of measured samples per target (default: 15).
  --warmup <int>            Warmup runs per target before measuring (default: 2).
  --statement <sql>         Probe SQL statement (default: SELECT 1).
  --connect-timeout <sec>   Connection timeout in seconds (default: 10).
  --skip-default            Skip probing Django's configured default database.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import psycopg2
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


@dataclass
class Sample:
    connect_ms: float
    query_ms: float
    total_ms: float


def _percentile(values: list[float], pct: float) -> float:
    """Return nearest-rank percentile for non-empty value lists."""
    if not values:
        return 0.0
    sorted_values = sorted(values)
    rank = max(1, math.ceil((pct / 100.0) * len(sorted_values)))
    return sorted_values[rank - 1]


def _build_default_dsn() -> str | None:
    db = settings.DATABASES.get("default", {})
    engine = str(db.get("ENGINE", ""))
    if "postgresql" not in engine:
        return None

    options = db.get("OPTIONS", {}) or {}
    parts = [
        f"dbname={db.get('NAME', '')}",
        f"user={db.get('USER', '')}",
        f"password={db.get('PASSWORD', '')}",
        f"host={db.get('HOST', '')}",
        f"port={db.get('PORT', '')}",
    ]
    if options.get("sslmode"):
        parts.append(f"sslmode={options['sslmode']}")
    return " ".join(parts)


def _probe_target(
    dsn: str, statement: str, samples: int, warmup: int, connect_timeout: int
) -> tuple[list[Sample], int]:
    results: list[Sample] = []
    failures = 0

    total_runs = warmup + samples
    for run_idx in range(total_runs):
        conn = None
        try:
            started = time.perf_counter()
            conn = psycopg2.connect(dsn=dsn, connect_timeout=connect_timeout)
            connected = time.perf_counter()

            with conn.cursor() as cursor:
                cursor.execute(statement)
                cursor.fetchone()

            completed = time.perf_counter()
            if run_idx >= warmup:
                results.append(
                    Sample(
                        connect_ms=(connected - started) * 1000,
                        query_ms=(completed - connected) * 1000,
                        total_ms=(completed - started) * 1000,
                    )
                )
        except Exception:
            if run_idx >= warmup:
                failures += 1
        finally:
            if conn is not None:
                conn.close()

    return results, failures


class Command(BaseCommand):
    """Measure DB connect/query latency across one or more PostgreSQL targets."""

    help = "Probe DB latency and print p50/p95 for connect/query/total times."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--url",
            action="append",
            default=[],
            help="Candidate DATABASE_URL (repeat flag to test multiple endpoints).",
        )
        parser.add_argument(
            "--samples",
            type=int,
            default=15,
            help="Measured samples per target after warmup.",
        )
        parser.add_argument(
            "--warmup",
            type=int,
            default=2,
            help="Warmup runs per target before recording samples.",
        )
        parser.add_argument(
            "--statement",
            type=str,
            default="SELECT 1",
            help="Probe SQL statement to execute for query latency measurement.",
        )
        parser.add_argument(
            "--connect-timeout",
            type=int,
            default=10,
            help="Connection timeout in seconds.",
        )
        parser.add_argument(
            "--skip-default",
            action="store_true",
            help="Skip probing Django's configured default database target.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        samples = int(options["samples"])
        warmup = int(options["warmup"])
        statement = str(options["statement"])
        connect_timeout = int(options["connect_timeout"])

        if samples < 1:
            raise CommandError("--samples must be >= 1")
        if warmup < 0:
            raise CommandError("--warmup must be >= 0")
        if connect_timeout < 1:
            raise CommandError("--connect-timeout must be >= 1")

        targets: list[tuple[str, str]] = []

        if not bool(options["skip_default"]):
            default_dsn = _build_default_dsn()
            if default_dsn:
                targets.append(("default", default_dsn))
            else:
                self.stdout.write(self.style.WARNING("Skipping default DB: not PostgreSQL"))

        for idx, url in enumerate(options["url"], start=1):
            label = f"candidate-{idx}"
            targets.append((label, str(url).strip()))

        if not targets:
            raise CommandError("No targets to probe. Provide --url or omit --skip-default.")

        self.stdout.write(
            f"Running latency probe: samples={samples}, warmup={warmup}, statement={statement!r}"
        )

        for label, dsn in targets:
            parsed = urlparse(dsn) if "://" in dsn else None
            host = parsed.hostname if parsed else "(django default)"
            self.stdout.write(f"\nTarget: {label}  host={host}")

            measured, failures = _probe_target(
                dsn=dsn,
                statement=statement,
                samples=samples,
                warmup=warmup,
                connect_timeout=connect_timeout,
            )

            if not measured:
                self.stdout.write(
                    self.style.ERROR(f"  No successful samples (failures={failures})")
                )
                continue

            connect_values = [s.connect_ms for s in measured]
            query_values = [s.query_ms for s in measured]
            total_values = [s.total_ms for s in measured]

            self.stdout.write(
                "  connect_ms: "
                f"p50={_percentile(connect_values, 50):.2f} "
                f"p95={_percentile(connect_values, 95):.2f} "
                f"avg={sum(connect_values) / len(connect_values):.2f}"
            )
            self.stdout.write(
                "  query_ms:   "
                f"p50={_percentile(query_values, 50):.2f} "
                f"p95={_percentile(query_values, 95):.2f} "
                f"avg={sum(query_values) / len(query_values):.2f}"
            )
            self.stdout.write(
                "  total_ms:   "
                f"p50={_percentile(total_values, 50):.2f} "
                f"p95={_percentile(total_values, 95):.2f} "
                f"avg={sum(total_values) / len(total_values):.2f} "
                f"success={len(measured)} failures={failures}"
            )
