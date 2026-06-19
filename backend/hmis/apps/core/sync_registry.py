# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Declarative registry for hub/cloud data sync."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class SyncDirection(Enum):
    """Supported sync directions for registered models."""

    UP = "up"
    DOWN = "down"
    BOTH = "both"


@dataclass(frozen=True)
class SyncRegistryEntry:
    """Configuration for one syncable model."""

    direction: SyncDirection
    priority: int
    exclude_fields: tuple[str, ...] = field(default_factory=tuple)
    batch_size: int | None = None
    conflict_policy: str | None = None


SYNC_REGISTRY: dict[str, SyncRegistryEntry] = {
    # Core identity
    "core.Organization": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=1,
        conflict_policy="REMOTE_WINS",
    ),
    "core.Facility": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=1,
        conflict_policy="REMOTE_WINS",
    ),
    "core.StaffProfile": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=2,
        conflict_policy="LAST_WRITE_WINS",
    ),
    "auth.User": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=2,
        conflict_policy="LAST_WRITE_WINS",
        exclude_fields=("last_login",),
    ),
    # Clinical data
    "patients.Patient": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "patients.EmergencyContact": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "encounters.Encounter": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "encounters.Diagnosis": SyncRegistryEntry(direction=SyncDirection.UP, priority=4),
    "encounters.TreatmentPlan": SyncRegistryEntry(direction=SyncDirection.UP, priority=4),
    "encounters.Medication": SyncRegistryEntry(direction=SyncDirection.UP, priority=4),
    "triage.TriageAssessment": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "pharmacy.Prescription": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "pharmacy.PrescriptionItem": SyncRegistryEntry(direction=SyncDirection.UP, priority=4),
    "laboratory.LabOrder": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "laboratory.LabOrderItem": SyncRegistryEntry(direction=SyncDirection.UP, priority=4),
    "laboratory.LabResult": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "billing.Invoice": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "billing.InvoiceItem": SyncRegistryEntry(direction=SyncDirection.UP, priority=4),
    "billing.Payment": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "scheduling.Shift": SyncRegistryEntry(direction=SyncDirection.UP, priority=4),
    "inpatient.Admission": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "immunizations.ImmunizationRecord": SyncRegistryEntry(
        direction=SyncDirection.UP,
        priority=3,
    ),
    "imaging.ImagingOrder": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    "imaging.RadiologyReport": SyncRegistryEntry(direction=SyncDirection.UP, priority=3),
    # Reference data (downward only in this phase, not auto-queued from hub)
    "encounters.ICD10Code": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "pharmacy.Drug": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "clinical_templates.ClinicalTemplate": SyncRegistryEntry(
        direction=SyncDirection.DOWN,
        priority=5,
    ),
    "billing.ServiceCategory": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "billing.Service": SyncRegistryEntry(direction=SyncDirection.DOWN, priority=5),
    "ai.TibaBotFacilityKey": SyncRegistryEntry(
        direction=SyncDirection.DOWN,
        priority=5,
        conflict_policy="REMOTE_WINS",
    ),
    # Compliance/audit
    "core.AuditLog": SyncRegistryEntry(direction=SyncDirection.UP, priority=5, batch_size=500),
}


def get_registry_entry(model_label: str) -> SyncRegistryEntry | None:
    """Return the sync registry entry for a model label, if registered."""
    return SYNC_REGISTRY.get(model_label)


def is_upward_sync_model(model_label: str) -> bool:
    """Return whether a model should auto-queue upward changes from a hub."""
    entry = get_registry_entry(model_label)
    return bool(entry and entry.direction in {SyncDirection.UP, SyncDirection.BOTH})


def is_downward_sync_model(model_label: str) -> bool:
    """Return whether a model can be pulled downward from cloud to hub."""
    entry = get_registry_entry(model_label)
    return bool(entry and entry.direction in {SyncDirection.DOWN, SyncDirection.BOTH})


def downward_sync_models() -> set[str]:
    """Return all registry labels allowed in cloud-to-hub pulls."""
    return {
        model_label
        for model_label, entry in SYNC_REGISTRY.items()
        if entry.direction in {SyncDirection.DOWN, SyncDirection.BOTH}
    }
