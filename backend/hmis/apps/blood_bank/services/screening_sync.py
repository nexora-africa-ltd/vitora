"""Sync blood-unit screening fields from verified laboratory screening results.

Use by calling `sync_blood_unit_screening_from_lab_order(lab_order)` after lab result verification.
Inputs: `LabOrder` (with optional `blood_bank_unit`) and verified `LabResult` values.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from hmis.apps.blood_bank.models import UnitStatus

if TYPE_CHECKING:
    from hmis.apps.blood_bank.models import BloodUnit
    from hmis.apps.laboratory.models import LabOrder, LabResult


SCREEN_FIELD_MAP = {
    "hiv": "hiv_screened",
    "hbv": "hbv_screened",
    "hcv": "hcv_screened",
    "syphilis": "syphilis_screened",
    "malaria": "malaria_screened",
}


NEGATIVE_TOKENS = {
    "NEGATIVE",
    "NON-REACTIVE",
    "NON REACTIVE",
    "NONREACTIVE",
    "NOT DETECTED",
    "UNDETECTED",
}


REACTIVE_TOKENS = {
    "POSITIVE",
    "REACTIVE",
    "DETECTED",
}


def _detect_screen_key(test_code: str, test_name: str, short_name: str) -> str | None:
    haystack = f"{test_code} {test_name} {short_name}".upper()

    if "HIV" in haystack:
        return "hiv"
    if "HBV" in haystack or "HEPATITIS B" in haystack or "HBSAG" in haystack:
        return "hbv"
    if "HCV" in haystack or "HEPATITIS C" in haystack:
        return "hcv"
    if "SYPH" in haystack or "VDRL" in haystack or "RPR" in haystack:
        return "syphilis"
    if "MALARIA" in haystack:
        return "malaria"

    return None


def _result_text(result: LabResult) -> str:
    value = result.option_value or result.text_value or result.interpretation or ""
    return str(value).upper().strip()


def _is_negative(value: str) -> bool:
    return any(token in value for token in NEGATIVE_TOKENS)


def _is_reactive(value: str) -> bool:
    if _is_negative(value):
        return False
    return any(token in value for token in REACTIVE_TOKENS)


def sync_blood_unit_screening_from_lab_order(lab_order: LabOrder) -> BloodUnit | None:
    """Recompute blood-unit screening checkboxes and status from verified lab results."""
    unit = getattr(lab_order, "blood_bank_unit", None)
    if unit is None:
        return None

    from hmis.apps.laboratory.models import LabResult

    screen_state: dict[str, dict[str, bool]] = {
        "hiv": {"screened": False, "negative": False, "reactive": False},
        "hbv": {"screened": False, "negative": False, "reactive": False},
        "hcv": {"screened": False, "negative": False, "reactive": False},
        "syphilis": {"screened": False, "negative": False, "reactive": False},
        "malaria": {"screened": False, "negative": False, "reactive": False},
    }

    verified_results = (
        LabResult.objects.filter(order_item__lab_order=lab_order, verification_status="VERIFIED")
        .select_related("order_item__test")
        .order_by("updated_at", "id")
    )

    for result in verified_results:
        test = result.order_item.test
        screen_key = _detect_screen_key(test.code or "", test.name or "", test.short_name or "")
        if screen_key is None:
            continue

        value = _result_text(result)
        screen_state[screen_key] = {
            "screened": True,
            "negative": _is_negative(value),
            "reactive": _is_reactive(value),
        }

    update_fields: list[str] = []
    for screen_key, field_name in SCREEN_FIELD_MAP.items():
        screened = screen_state[screen_key]["screened"]
        if getattr(unit, field_name) != screened:
            setattr(unit, field_name, screened)
            update_fields.append(field_name)

    all_screened = all(state["screened"] for state in screen_state.values())
    all_negative = all_screened and all(
        state["negative"] and not state["reactive"] for state in screen_state.values()
    )
    any_reactive = any(state["reactive"] for state in screen_state.values())

    if unit.all_screens_negative != all_negative:
        unit.all_screens_negative = all_negative
        update_fields.append("all_screens_negative")

    if any_reactive and unit.status not in {
        UnitStatus.QUARANTINED,
        UnitStatus.ISSUED,
        UnitStatus.DISCARDED,
        UnitStatus.EXPIRED,
    }:
        reactive_screen = next(key for key, state in screen_state.items() if state["reactive"])
        reason = (
            f"Screening sync: {reactive_screen.upper()} result marked reactive "
            f"on linked lab order {lab_order.order_number}"
        )
        notes = (unit.notes or "").strip()
        if reason not in notes:
            unit.notes = f"{notes}\n{reason}".strip() if notes else reason
            update_fields.append("notes")

        unit.status = UnitStatus.QUARANTINED
        update_fields.append("status")

    elif all_negative and unit.status in {UnitStatus.COLLECTED, UnitStatus.TESTING}:
        unit.status = UnitStatus.AVAILABLE
        update_fields.append("status")

    if update_fields:
        unit.save(update_fields=sorted(set(update_fields + ["updated_at"])))

    return unit


def sync_blood_unit_screening_from_result(result: LabResult) -> BloodUnit | None:
    """Sync screening fields for the blood unit linked to this result's lab order."""
    return sync_blood_unit_screening_from_lab_order(result.order_item.lab_order)
