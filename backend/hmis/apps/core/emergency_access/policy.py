# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Emergency access write policy map.

What this file is for:
- Define a backend-ready allowlist/denylist for break-glass write actions.

How to use it:
- Import `get_emergency_action_policy()` and `is_hard_denied_emergency_action()`
  from permission middleware to decide whether a request can bypass normal flow
  during an active emergency-access session.

Supported inputs/args:
- `method`: HTTP method string (e.g. "POST", "PATCH").
- `path`: request path (e.g. "/api/encounters/12/").
- Optional context checks in middleware should enforce session header, scope,
  role, TTL, and payload-field restrictions described in each policy entry.
"""

from __future__ import annotations

import re
from typing import Any

# Header required on emergency writes to bind the request to a live session.
EMERGENCY_SESSION_HEADER = "X-Emergency-Access-ID"

# Role codes permitted to use LIMITED_WRITE emergency actions.
EMERGENCY_WRITE_ALLOWED_ROLE_CODES = {
    "DOCTOR",
    "CLINICAL_OFFICER",
    "NURSE",
    "ADMIN",
    "ORG-ADMIN",
    "OWNER",
}

# Global guardrails for emergency write mode.
EMERGENCY_WRITE_GUARDRAILS = {
    "session_access_mode": "LIMITED_WRITE",
    "scope_required": "PATIENT",
    "max_ttl_minutes": 60,
    "extension_minutes": 30,
    "max_extensions": 1,
    "max_writes_per_session": 20,
    "max_sessions_per_user_per_day": 3,
}

# Endpoint/action allowlist keyed by endpoint regex then HTTP method.
# Middleware can enforce `required_fields` and `allowed_fields` against payload.
EMERGENCY_ACTION_ALLOWLIST: dict[str, dict[str, dict[str, Any]]] = {
    r"^/api/encounters/$": {
        "POST": {
            "action": "encounter.create_emergency",
            "purpose": "Start urgent emergency encounter",
            "required_fields": {"patient", "encounter_type", "chief_complaint", "encounter_date"},
            "field_constraints": {
                "encounter_type": {"equals": "EMERGENCY"},
            },
        },
    },
    r"^/api/encounters/\d+/$": {
        "PATCH": {
            "action": "encounter.patch_urgent_fields",
            "purpose": "Record immediate stabilization vitals and complaint",
            "allowed_fields": {
                "temperature",
                "pulse",
                "blood_pressure",
                "respiratory_rate",
                "spo2",
                "weight",
                "height",
                "chief_complaint",
            },
            "blocked_fields_note": "Reject payload if fields outside `allowed_fields` are present.",
        },
    },
    r"^/api/triage/assessments/$": {
        "POST": {
            "action": "triage.create_assessment",
            "purpose": "Capture acuity for emergency encounter",
            "required_fields": {"patient"},
            "context_constraints": {
                "linked_emergency_encounter_required": True,
            },
        },
    },
    r"^/api/laboratory/lab-orders/$": {
        "POST": {
            "action": "laboratory.create_stat_order",
            "purpose": "Place life-saving urgent diagnostics",
            "required_fields": {"patient"},
            "field_constraints": {
                "priority": {"in": {"STAT"}},
            },
            "context_constraints": {
                "urgent_tests_only": True,
            },
        },
    },
    r"^/api/pharmacy/prescriptions/$": {
        "POST": {
            "action": "pharmacy.create_emergency_first_dose",
            "purpose": "Allow immediate first-dose or short bridge medications",
            "required_fields": {"patient"},
            "context_constraints": {
                "max_duration_hours": 24,
                "refills_forbidden": True,
            },
        },
    },
    r"^/api/imaging/orders/$": {
        "POST": {
            "action": "imaging.create_urgent_order",
            "purpose": "Allow urgent trauma/stroke imaging",
            "required_fields": {"patient"},
            "context_constraints": {
                "urgent_indication_required": True,
            },
        },
    },
    r"^/api/inpatient/admissions/$": {
        "POST": {
            "action": "inpatient.create_emergency_admission",
            "purpose": "Permit immediate emergency bed placement",
            "required_fields": {"patient"},
            "context_constraints": {
                "admission_type": {"in": {"EMERGENCY"}},
            },
        },
    },
    r"^/api/patients/\d+/$": {
        "PATCH": {
            "action": "patients.patch_emergency_demographics",
            "purpose": "Allow emergency-safe contact/demographic corrections",
            "allowed_fields": {
                "phone_number",
                "emergency_contact_name",
                "emergency_contact_phone",
                "emergency_contact_relationship",
                "address",
            },
            "blocked_fields_note": "Do not allow identifiers, merges, deletion, or broad profile edits.",
        },
    },
}

# Hard deny list: never bypass with emergency access.
EMERGENCY_ACTION_HARD_DENY: dict[str, dict[str, str]] = {
    r"^/api/.*$": {
        "DELETE": "Delete operations are never allowed in emergency write mode.",
    },
    r"^/api/sha/.*$": {
        "POST": "SHA claims/preauth submissions are never emergency-bypassable.",
        "PATCH": "SHA claim mutations are never emergency-bypassable.",
        "PUT": "SHA claim mutations are never emergency-bypassable.",
    },
    r"^/api/(billing|invoices)/.*$": {
        "POST": "Billing finalization/submission actions are not allowed in emergency mode.",
        "PATCH": "Billing finalization/submission actions are not allowed in emergency mode.",
        "PUT": "Billing finalization/submission actions are not allowed in emergency mode.",
        "DELETE": "Billing deletion is never allowed in emergency mode.",
    },
    r"^/api/core/(roles|permissions|invitations|organizations|facilities|staff)/.*$": {
        "POST": "RBAC and tenant admin configuration cannot be emergency-bypassed.",
        "PATCH": "RBAC and tenant admin configuration cannot be emergency-bypassed.",
        "PUT": "RBAC and tenant admin configuration cannot be emergency-bypassed.",
        "DELETE": "RBAC and tenant admin configuration cannot be emergency-bypassed.",
    },
    r"^/api/.*/(export|bulk|import)/.*$": {
        "POST": "Bulk/export/import data operations are blocked in emergency mode.",
    },
}


def get_emergency_action_policy(method: str, path: str) -> dict[str, Any] | None:
    """Return allowlist policy for a request, or None when not allowlisted."""
    normalized_method = method.upper().strip()
    normalized_path = path.strip() or "/"
    for endpoint_regex, method_map in EMERGENCY_ACTION_ALLOWLIST.items():
        if re.match(endpoint_regex, normalized_path):
            return method_map.get(normalized_method)
    return None


def is_hard_denied_emergency_action(method: str, path: str) -> tuple[bool, str]:
    """Return hard deny decision and reason for a request."""
    normalized_method = method.upper().strip()
    normalized_path = path.strip() or "/"
    for endpoint_regex, method_map in EMERGENCY_ACTION_HARD_DENY.items():
        if re.match(endpoint_regex, normalized_path) and normalized_method in method_map:
            return True, method_map[normalized_method]
    return False, ""
