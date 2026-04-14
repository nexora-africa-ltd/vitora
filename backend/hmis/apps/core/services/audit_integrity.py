"""
Audit Integrity Service.

Provides hash chain verification for tamper-resistant audit logs.
Each AuditLog entry includes a SHA-256 hash computed over its content
and the hash of the previous entry, forming a cryptographic chain.

DHA Compliance: Gap #31 — Tamper-Resistant Audit Log (Sprint 3.C)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class IntegrityResult:
    """Result of an audit chain integrity verification."""

    valid: bool
    entries_checked: int
    first_mismatch_seq: int | None = None
    first_mismatch_detail: str = ""
    errors: list[str] = field(default_factory=list)
    checked_at: datetime | None = None

    def __post_init__(self):
        if self.checked_at is None:
            self.checked_at = timezone.now()


class AuditIntegrityService:
    """
    Service for verifying the integrity of the audit log hash chain.

    Recomputes hashes for audit entries and compares them against
    stored hashes to detect tampering.
    """

    def verify_chain(
        self,
        start_seq: int | None = None,
        end_seq: int | None = None,
    ) -> IntegrityResult:
        """
        Verify the audit log hash chain over a range of entries.

        Args:
            start_seq: Starting sequence number (inclusive). Defaults to 1.
            end_seq: Ending sequence number (inclusive). Defaults to the latest.

        Returns:
            IntegrityResult with verification outcome.
        """
        from hmis.apps.core.models import AuditLog

        queryset = AuditLog.objects.filter(
            sequence_number__isnull=False,
        ).order_by("sequence_number")

        if start_seq is not None:
            queryset = queryset.filter(sequence_number__gte=start_seq)
        if end_seq is not None:
            queryset = queryset.filter(sequence_number__lte=end_seq)

        entries = queryset.values(
            "sequence_number",
            "previous_hash",
            "entry_hash",
            "action",
            "user_id",
            "timestamp",
            "resource_type",
            "resource_id",
            "details",
        )

        if not entries.exists():
            return IntegrityResult(valid=True, entries_checked=0)

        errors: list[str] = []
        checked = 0
        expected_prev_hash: str | None = None

        for entry in entries.iterator():
            checked += 1
            seq = entry["sequence_number"]

            # Verify previous_hash linkage (skip for the first entry in range
            # unless it's the absolute first entry)
            if expected_prev_hash is not None:
                if entry["previous_hash"] != expected_prev_hash:
                    detail = (
                        f"Chain break at seq {seq}: "
                        f"expected previous_hash={expected_prev_hash[:16]}..., "
                        f"got={entry['previous_hash'][:16]}..."
                    )
                    return IntegrityResult(
                        valid=False,
                        entries_checked=checked,
                        first_mismatch_seq=seq,
                        first_mismatch_detail=detail,
                        errors=[detail],
                    )

            # Verify the entry's own hash
            recomputed = AuditLog.compute_hash(
                sequence_number=seq,
                previous_hash=entry["previous_hash"],
                action=entry["action"],
                user_id=entry["user_id"] or 0,
                timestamp=entry["timestamp"],
                resource_type=entry["resource_type"],
                resource_id=entry["resource_id"],
                details=entry["details"],
            )

            if recomputed != entry["entry_hash"]:
                detail = (
                    f"Hash mismatch at seq {seq}: "
                    f"stored={entry['entry_hash'][:16]}..., "
                    f"computed={recomputed[:16]}..."
                )
                return IntegrityResult(
                    valid=False,
                    entries_checked=checked,
                    first_mismatch_seq=seq,
                    first_mismatch_detail=detail,
                    errors=[detail],
                )

            expected_prev_hash = entry["entry_hash"]

        # Check for sequence gaps
        gap_result = self._check_sequence_gaps(start_seq, end_seq)
        if gap_result:
            errors.append(gap_result)
            return IntegrityResult(
                valid=False,
                entries_checked=checked,
                first_mismatch_detail=gap_result,
                errors=errors,
            )

        return IntegrityResult(valid=True, entries_checked=checked)

    def verify_latest(self, count: int = 100) -> IntegrityResult:
        """
        Verify the most recent N entries in the hash chain.

        Args:
            count: Number of recent entries to verify.

        Returns:
            IntegrityResult with verification outcome.
        """
        from hmis.apps.core.models import AuditLog

        latest = (
            AuditLog.objects.filter(sequence_number__isnull=False)
            .order_by("-sequence_number")
            .values_list("sequence_number", flat=True)[:count]
        )
        seq_list = list(latest)
        if not seq_list:
            return IntegrityResult(valid=True, entries_checked=0)

        start_seq = min(seq_list)
        end_seq = max(seq_list)
        return self.verify_chain(start_seq=start_seq, end_seq=end_seq)

    def get_chain_status(self) -> dict:
        """
        Get a summary of the audit chain health.

        Returns:
            Dictionary with chain statistics and last verification info.
        """
        from hmis.apps.core.models import AuditLog

        total_entries = AuditLog.objects.count()
        chained_entries = AuditLog.objects.filter(sequence_number__isnull=False).count()
        unchained_entries = total_entries - chained_entries

        last_entry = (
            AuditLog.objects.filter(sequence_number__isnull=False)
            .order_by("-sequence_number")
            .values("sequence_number", "entry_hash", "timestamp")
            .first()
        )

        # Check for recent tamper alert notifications
        from hmis.apps.core.models import Notification

        tamper_alerts = Notification.objects.filter(
            notification_type="audit_tamper_detected",
        ).count()

        # Get last verification result
        last_verification = (
            AuditLog.objects.filter(action="audit_integrity_check")
            .order_by("-timestamp")
            .values("timestamp", "details")
            .first()
        )

        return {
            "total_entries": total_entries,
            "chained_entries": chained_entries,
            "unchained_entries": unchained_entries,
            "last_sequence_number": (last_entry["sequence_number"] if last_entry else None),
            "last_entry_hash": (last_entry["entry_hash"] if last_entry else None),
            "last_entry_timestamp": (last_entry["timestamp"].isoformat() if last_entry else None),
            "tamper_alerts_count": tamper_alerts,
            "last_verified_at": (
                last_verification["timestamp"].isoformat() if last_verification else None
            ),
            "last_verification_valid": (
                last_verification["details"].get("valid") if last_verification else None
            ),
        }

    def _check_sequence_gaps(
        self,
        start_seq: int | None = None,
        end_seq: int | None = None,
    ) -> str | None:
        """Check for gaps in the sequence numbers within the given range."""
        from hmis.apps.core.models import AuditLog

        queryset = AuditLog.objects.filter(sequence_number__isnull=False)
        if start_seq is not None:
            queryset = queryset.filter(sequence_number__gte=start_seq)
        if end_seq is not None:
            queryset = queryset.filter(sequence_number__lte=end_seq)

        agg = queryset.aggregate(
            min_seq=models.Min("sequence_number"),
            max_seq=models.Max("sequence_number"),
            count=models.Count("sequence_number"),
        )

        if agg["count"] == 0:
            return None

        expected_count = agg["max_seq"] - agg["min_seq"] + 1
        if agg["count"] != expected_count:
            return (
                f"Sequence gap detected: expected {expected_count} entries "
                f"between seq {agg['min_seq']} and {agg['max_seq']}, "
                f"but found {agg['count']}"
            )
        return None
