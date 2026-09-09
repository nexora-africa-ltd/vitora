# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Default assignment-rule seeding for scheduling.

What this file is for:
- Provide idempotent seeding of baseline AssignmentRule records per facility.

How to use it:
- Import ``seed_assignment_defaults_for_facility`` from app services.
- Used by API action and management command.

Supported inputs/args:
- facility: Facility instance where rules should be seeded.
- created_by: Optional Django user attached to seeded rules.
- dry_run: Optional bool; when True returns counts without writing.
"""

from datetime import date
from typing import Any

from hmis.apps.core.models import Facility
from hmis.apps.scheduling.models import AssignmentRule

DEFAULT_ASSIGNMENT_RULES: tuple[dict[str, Any], ...] = (
    {
        "name": "Default appointment assignment",
        "rule_code": "default_appointment_assignment",
        "applies_to": "APPOINTMENT",
        "priority": 100,
        "description": "Baseline fallback rule for appointment auto-assignment.",
        "rule_definition": {
            "version": "1.0",
            "when": {},
            "constraints": [],
            "scoring": [],
            "fallback": {"action": "leave_unassigned"},
        },
    },
    {
        "name": "Urgent appointment prioritization",
        "rule_code": "urgent_appointment_prioritization",
        "applies_to": "APPOINTMENT",
        "priority": 140,
        "description": "Prioritize urgent/emergency appointment matching before generic appointment rules.",
        "rule_definition": {
            "version": "1.0",
            "when": {"priority": "EMERGENCY"},
            "constraints": [],
            "scoring": [{"field": "capacity", "weight": 2}],
            "fallback": {"action": "notify_scheduler"},
        },
    },
    {
        "name": "Follow-up appointment continuity",
        "rule_code": "followup_appointment_continuity",
        "applies_to": "APPOINTMENT",
        "priority": 120,
        "description": "Prefer resources with stronger continuity scores for follow-up appointments.",
        "rule_definition": {
            "version": "1.0",
            "when": {"appointment_type": "FOLLOW_UP"},
            "constraints": [],
            "scoring": [{"field": "metadata.continuity_score", "weight": 2}],
            "fallback": {"action": "notify_scheduler"},
        },
    },
    {
        "name": "Default shift assignment",
        "rule_code": "default_shift_assignment",
        "applies_to": "SHIFT",
        "priority": 100,
        "description": "Baseline fallback rule for shift auto-assignment.",
        "rule_definition": {
            "version": "1.0",
            "when": {},
            "constraints": [],
            "scoring": [],
            "fallback": {"action": "leave_unassigned"},
        },
    },
    {
        "name": "Night shift suitability",
        "rule_code": "night_shift_suitability",
        "applies_to": "SHIFT",
        "priority": 130,
        "description": "Prefer resources with higher configured suitability for night shifts.",
        "rule_definition": {
            "version": "1.0",
            "when": {"shift_type": "NIGHT"},
            "constraints": [],
            "scoring": [{"field": "metadata.night_shift_score", "weight": 2}],
            "fallback": {"action": "notify_scheduler"},
        },
    },
    {
        "name": "Default bed assignment",
        "rule_code": "default_bed_assignment",
        "applies_to": "BED_ASSIGNMENT",
        "priority": 100,
        "description": "Baseline fallback rule for bed assignment auto-matching.",
        "rule_definition": {
            "version": "1.0",
            "when": {},
            "constraints": [],
            "scoring": [],
            "fallback": {"action": "leave_unassigned"},
        },
    },
    {
        "name": "Isolation bed preference",
        "rule_code": "isolation_bed_preference",
        "applies_to": "BED_ASSIGNMENT",
        "priority": 130,
        "description": "Prioritize resources tagged for isolation when isolation care context is present.",
        "rule_definition": {
            "version": "1.0",
            "when": {"care_level": "ISOLATION"},
            "constraints": [],
            "scoring": [{"field": "metadata.isolation_score", "weight": 2}],
            "fallback": {"action": "notify_scheduler"},
        },
    },
    {
        "name": "Default lab batch assignment",
        "rule_code": "default_lab_batch_assignment",
        "applies_to": "LAB_BATCH",
        "priority": 100,
        "description": "Baseline fallback rule for lab batch assignment.",
        "rule_definition": {
            "version": "1.0",
            "when": {},
            "constraints": [],
            "scoring": [],
            "fallback": {"action": "leave_unassigned"},
        },
    },
    {
        "name": "Urgent lab batch prioritization",
        "rule_code": "urgent_lab_batch_prioritization",
        "applies_to": "LAB_BATCH",
        "priority": 130,
        "description": "Prioritize higher-capacity resources for urgent laboratory batches.",
        "rule_definition": {
            "version": "1.0",
            "when": {"priority": "URGENT"},
            "constraints": [],
            "scoring": [{"field": "capacity", "weight": 2}],
            "fallback": {"action": "notify_scheduler"},
        },
    },
    {
        "name": "Default theatre slot assignment",
        "rule_code": "default_theatre_slot_assignment",
        "applies_to": "THEATRE_SLOT",
        "priority": 100,
        "description": "Baseline fallback rule for theatre slot assignment.",
        "rule_definition": {
            "version": "1.0",
            "when": {},
            "constraints": [],
            "scoring": [],
            "fallback": {"action": "leave_unassigned"},
        },
    },
    {
        "name": "Emergency theatre slot prioritization",
        "rule_code": "emergency_theatre_slot_prioritization",
        "applies_to": "THEATRE_SLOT",
        "priority": 140,
        "description": "Prioritize theatre resources for emergency procedures first.",
        "rule_definition": {
            "version": "1.0",
            "when": {"priority": "EMERGENCY"},
            "constraints": [],
            "scoring": [{"field": "capacity", "weight": 2}],
            "fallback": {"action": "notify_scheduler"},
        },
    },
)


def seed_assignment_defaults_for_facility(
    facility: Facility,
    created_by=None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Seed baseline assignment rules for a facility.

    The operation is idempotent by ``(facility, rule_code)``.
    """
    created = 0
    skipped = 0
    created_rule_codes: list[str] = []

    for template in DEFAULT_ASSIGNMENT_RULES:
        existing = AssignmentRule.objects.filter(
            facility=facility,
            rule_code=template["rule_code"],
        ).exists()
        if existing:
            skipped += 1
            continue

        created += 1
        created_rule_codes.append(str(template["rule_code"]))
        if dry_run:
            continue

        AssignmentRule.objects.create(
            name=template["name"],
            rule_code=template["rule_code"],
            applies_to=template["applies_to"],
            rule_definition=template["rule_definition"],
            version=1,
            priority=template["priority"],
            is_active=True,
            effective_from=date.today(),
            description=template["description"],
            created_by=created_by,
            facility=facility,
            organization=facility.organization,
        )

    return {
        "facility_id": facility.id,
        "created": created,
        "skipped": skipped,
        "templates": len(DEFAULT_ASSIGNMENT_RULES),
        "created_rule_codes": created_rule_codes,
        "total_rules": AssignmentRule.objects.filter(facility=facility).count()
        if not dry_run
        else AssignmentRule.objects.filter(facility=facility).count() + created,
    }
