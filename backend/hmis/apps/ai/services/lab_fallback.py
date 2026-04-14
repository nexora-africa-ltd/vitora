"""
Local fallback for lab result interpretation.

Provides basic reference range checks for ~50 common lab tests when
TibaBot is unavailable. No pattern detection or narrative summary.
"""

from __future__ import annotations

from typing import Any

# Age/sex-specific reference ranges: {test_name: {key: (low, high, unit)}}
# Keys: "default", "male", "female", "child" (age < 18), "pregnant"
_REFERENCE_RANGES: dict[str, dict[str, tuple[float, float, str]]] = {
    "hemoglobin": {
        "male": (13.5, 17.5, "g/dL"),
        "female": (12.0, 16.0, "g/dL"),
        "pregnant": (11.0, 14.0, "g/dL"),
        "child": (11.0, 16.0, "g/dL"),
    },
    "wbc": {"default": (4.0, 11.0, "x10^9/L")},
    "platelets": {"default": (150.0, 400.0, "x10^9/L")},
    "serum_creatinine": {
        "male": (0.7, 1.3, "mg/dL"),
        "female": (0.6, 1.1, "mg/dL"),
    },
    "blood_urea_nitrogen": {"default": (7.0, 20.0, "mg/dL")},
    "sodium": {"default": (136.0, 145.0, "mmol/L")},
    "potassium": {"default": (3.5, 5.0, "mmol/L")},
    "chloride": {"default": (98.0, 106.0, "mmol/L")},
    "bicarbonate": {"default": (22.0, 29.0, "mmol/L")},
    "calcium": {"default": (8.5, 10.5, "mg/dL")},
    "glucose_fasting": {"default": (70.0, 100.0, "mg/dL")},
    "glucose_random": {"default": (70.0, 140.0, "mg/dL")},
    "hba1c": {"default": (4.0, 5.6, "%")},
    "alt": {
        "male": (7.0, 56.0, "U/L"),
        "female": (7.0, 45.0, "U/L"),
    },
    "ast": {
        "male": (10.0, 40.0, "U/L"),
        "female": (9.0, 32.0, "U/L"),
    },
    "alkaline_phosphatase": {"default": (44.0, 147.0, "U/L")},
    "total_bilirubin": {"default": (0.1, 1.2, "mg/dL")},
    "direct_bilirubin": {"default": (0.0, 0.3, "mg/dL")},
    "albumin": {"default": (3.5, 5.5, "g/dL")},
    "total_protein": {"default": (6.0, 8.3, "g/dL")},
    "uric_acid": {
        "male": (3.4, 7.0, "mg/dL"),
        "female": (2.4, 6.0, "mg/dL"),
    },
    "cholesterol_total": {"default": (0.0, 200.0, "mg/dL")},
    "ldl": {"default": (0.0, 100.0, "mg/dL")},
    "hdl": {
        "male": (40.0, 60.0, "mg/dL"),
        "female": (50.0, 60.0, "mg/dL"),
    },
    "triglycerides": {"default": (0.0, 150.0, "mg/dL")},
    "tsh": {"default": (0.4, 4.0, "mIU/L")},
    "free_t4": {"default": (0.8, 1.8, "ng/dL")},
    "free_t3": {"default": (2.3, 4.2, "pg/mL")},
    "iron": {
        "male": (65.0, 175.0, "mcg/dL"),
        "female": (50.0, 170.0, "mcg/dL"),
    },
    "ferritin": {
        "male": (20.0, 500.0, "ng/mL"),
        "female": (20.0, 200.0, "ng/mL"),
    },
    "vitamin_b12": {"default": (200.0, 900.0, "pg/mL")},
    "folate": {"default": (2.7, 17.0, "ng/mL")},
    "psa": {"male": (0.0, 4.0, "ng/mL")},
    "crp": {"default": (0.0, 10.0, "mg/L")},
    "esr": {
        "male": (0.0, 22.0, "mm/hr"),
        "female": (0.0, 29.0, "mm/hr"),
    },
    "inr": {"default": (0.8, 1.2, "ratio")},
    "pt": {"default": (11.0, 13.5, "seconds")},
    "aptt": {"default": (25.0, 35.0, "seconds")},
    "fibrinogen": {"default": (200.0, 400.0, "mg/dL")},
    "d_dimer": {"default": (0.0, 0.5, "mg/L")},
    "troponin_i": {"default": (0.0, 0.04, "ng/mL")},
    "bnp": {"default": (0.0, 100.0, "pg/mL")},
    "ck": {
        "male": (39.0, 308.0, "U/L"),
        "female": (26.0, 192.0, "U/L"),
    },
    "ldh": {"default": (140.0, 280.0, "U/L")},
    "amylase": {"default": (28.0, 100.0, "U/L")},
    "lipase": {"default": (0.0, 160.0, "U/L")},
    "ggt": {
        "male": (8.0, 61.0, "U/L"),
        "female": (5.0, 36.0, "U/L"),
    },
    "magnesium": {"default": (1.7, 2.2, "mg/dL")},
    "phosphorus": {"default": (2.5, 4.5, "mg/dL")},
    "lactate": {"default": (0.5, 2.0, "mmol/L")},
}

# Critical thresholds — values beyond these need immediate attention
_CRITICAL_THRESHOLDS: dict[str, tuple[float | None, float | None]] = {
    "potassium": (2.5, 6.5),
    "sodium": (120.0, 160.0),
    "glucose_fasting": (40.0, 500.0),
    "glucose_random": (40.0, 500.0),
    "hemoglobin": (5.0, 20.0),
    "platelets": (50.0, None),
    "troponin_i": (None, 0.4),
    "lactate": (None, 4.0),
    "inr": (None, 5.0),
    "crp": (None, 100.0),
}


def _get_range(
    test_name: str,
    patient_sex: str | None,
    patient_age: int | None,
    is_pregnant: bool,
) -> tuple[float, float, str] | None:
    """Look up the appropriate reference range for a test."""
    ranges = _REFERENCE_RANGES.get(test_name.lower())
    if not ranges:
        return None

    sex_key = "male" if patient_sex and patient_sex.lower() == "male" else "female"

    if is_pregnant and "pregnant" in ranges:
        return ranges["pregnant"]
    if patient_age is not None and patient_age < 18 and "child" in ranges:
        return ranges["child"]
    if sex_key in ranges:
        return ranges[sex_key]
    return ranges.get("default")


def _classify_value(
    value: float,
    low: float,
    high: float,
    test_name: str,
) -> str:
    """Classify a value as normal, high, low, critical_high, or critical_low."""
    crit = _CRITICAL_THRESHOLDS.get(test_name.lower())
    if crit:
        crit_low, crit_high = crit
        if crit_low is not None and value < crit_low:
            return "critical_low"
        if crit_high is not None and value > crit_high:
            return "critical_high"

    if value < low:
        return "low"
    if value > high:
        return "high"
    return "normal"


def interpret_lab_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Basic lab interpretation using reference ranges.

    Returns flags with status classifications but no pattern detection
    or narrative interpretation.
    """
    patient_age: int | None = payload.get("patient_age")
    patient_sex: str | None = payload.get("patient_sex")
    is_pregnant: bool = payload.get("is_pregnant", False)
    lab_results: list[dict[str, Any]] = payload.get("lab_results", [])

    flags: list[dict[str, Any]] = []
    critical_alerts: list[str] = []

    for result in lab_results:
        test_name = result.get("test_name", "")
        value = result.get("value")
        unit = result.get("unit", "")

        if value is None:
            continue

        ref = _get_range(test_name, patient_sex, patient_age, is_pregnant)
        if ref is None:
            flags.append(
                {
                    "test_name": test_name,
                    "value": value,
                    "unit": unit,
                    "status": "unknown",
                    "reference_range": None,
                    "deviation_percent": None,
                    "message": f"No reference range available for {test_name}.",
                }
            )
            continue

        low, high, ref_unit = ref
        flag_status = _classify_value(value, low, high, test_name)

        # Calculate deviation from nearest boundary
        deviation: float | None = None
        if flag_status in ("low", "critical_low") and low > 0:
            deviation = round(((low - value) / low) * 100, 1)
        elif flag_status in ("high", "critical_high") and high > 0:
            deviation = round(((value - high) / high) * 100, 1)

        flags.append(
            {
                "test_name": test_name,
                "value": value,
                "unit": unit,
                "status": flag_status,
                "reference_range": {"low": low, "high": high, "unit": ref_unit},
                "deviation_percent": deviation,
                "message": f"{test_name}: {value} {unit} ({flag_status})",
            }
        )

        if flag_status.startswith("critical"):
            critical_alerts.append(
                f"CRITICAL: {test_name} = {value} {unit} is {flag_status.replace('_', ' ')}"
            )

    return {
        "flags": flags,
        "patterns": [],
        "interpretation_summary": "Basic reference range check (AI unavailable).",
        "suggested_followup_labs": [],
        "critical_alerts": critical_alerts,
        "mode": "fallback",
    }
