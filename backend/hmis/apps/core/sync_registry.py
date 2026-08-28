# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core sync registry for Vitora HMIS.

What this file is for:
- Implement sync registry logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

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
        priority=2,
        conflict_policy="REMOTE_WINS",
    ),
    "core.Role": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=3,
        conflict_policy="REMOTE_WINS",
    ),
    "core.Department": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=3,
        conflict_policy="REMOTE_WINS",
    ),
    "core.StaffProfile": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=4,
        conflict_policy="LAST_WRITE_WINS",
    ),
    "core.OrgMembership": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=5,
        conflict_policy="LAST_WRITE_WINS",
    ),
    "auth.User": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=3,
        conflict_policy="LAST_WRITE_WINS",
        exclude_fields=("last_login",),
    ),
    # Clinical data
    "patients.Patient": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "patients.EmergencyContact": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "encounters.Encounter": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "encounters.Diagnosis": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "encounters.TreatmentPlan": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "encounters.Medication": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "triage.TriageAssessment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.Clinic": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "clinics.ClinicRoom": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicSchedule": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicStaff": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicSession": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "clinics.ClinicVisit": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "clinics.ClinicEnrollment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "pharmacy.Prescription": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "pharmacy.PrescriptionItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "laboratory.LabOrder": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "laboratory.LabOrderItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "laboratory.LabResult": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.Invoice": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "billing.InvoiceItem": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "billing.Payment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "scheduling.Resource": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "scheduling.Schedule": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "scheduling.ScheduleBreak": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "scheduling.Appointment": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "scheduling.Shift": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "scheduling.SchedulingSettings": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=3),
    "scheduling.StaffConstraint": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
    "inpatient.Admission": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "immunizations.ImmunizationRecord": SyncRegistryEntry(
        direction=SyncDirection.BOTH,
        priority=4,
    ),
    "imaging.ImagingOrder": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=4),
    "imaging.RadiologyReport": SyncRegistryEntry(direction=SyncDirection.BOTH, priority=5),
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
