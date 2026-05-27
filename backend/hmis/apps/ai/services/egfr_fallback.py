"""
Local fallback eGFR calculator.

Used when TibaBot is unavailable. Implements CKD-EPI 2021 (race-free)
and Cockcroft-Gault equations locally.
"""

from typing import Any


def _convert_to_mg_dl(creatinine: float, unit: str) -> float:
    """Convert creatinine to mg/dL if given in µmol/L."""
    if unit == "umol/L":
        return creatinine / 88.4
    return creatinine


def _ckd_epi_2021(creatinine_mg_dl: float, age: int, sex: str) -> float:
    """
    CKD-EPI 2021 race-free equation.

    Reference: Inker LA et al. N Engl J Med 2021;385:1737-49.
    """
    if sex == "female":
        kappa = 0.7
        alpha = -0.241 if creatinine_mg_dl <= kappa else -1.200
        sex_factor = 1.012
    else:
        kappa = 0.9
        alpha = -0.302 if creatinine_mg_dl <= kappa else -1.200
        sex_factor = 1.0

    return 142 * ((creatinine_mg_dl / kappa) ** alpha) * (0.9938**age) * sex_factor


def _cockcroft_gault(
    creatinine_mg_dl: float, age: int, sex: str, weight_kg: float | None
) -> float | None:
    """
    Cockcroft-Gault equation for CrCl.

    Reference: Cockcroft DW, Gault MH. Nephron 1976;16:31-41.
    """
    if weight_kg is None:
        return None
    crcl = ((140 - age) * weight_kg) / (72 * creatinine_mg_dl)
    if sex == "female":
        crcl *= 0.85
    return round(crcl, 1)


def _get_ckd_stage(egfr: float) -> tuple[str, str]:
    """Return (stage, category) based on eGFR value."""
    if egfr >= 90:
        return "G1", "Normal or high"
    elif egfr >= 60:
        return "G2", "Mildly decreased"
    elif egfr >= 45:
        return "G3a", "Mildly to moderately decreased"
    elif egfr >= 30:
        return "G3b", "Moderately to severely decreased"
    elif egfr >= 15:
        return "G4", "Severely decreased"
    else:
        return "G5", "Kidney failure"


def _get_dose_adjustment_band(egfr: float) -> str:
    """Return dose adjustment band based on eGFR."""
    if egfr >= 60:
        return "normal"
    elif egfr >= 45:
        return "mild"
    elif egfr >= 30:
        return "moderate"
    elif egfr >= 15:
        return "severe"
    else:
        return "dialysis"


def _get_flags(egfr: float, ckd_stage: str) -> list[str]:
    """Return clinical action flags based on CKD stage."""
    flags: list[str] = []
    if ckd_stage in ("G3a", "G3b", "G4", "G5"):
        flags.append("monitor_egfr_quarterly")
        flags.append("check_urine_acr")
    if ckd_stage in ("G3b", "G4", "G5"):
        flags.append("avoid_nsaids")
        flags.append("avoid_nephrotoxins")
        flags.append("adjust_metformin_dose")
    if ckd_stage in ("G4", "G5"):
        flags.append("refer_nephrology")
        flags.append("check_potassium")
        flags.append("check_phosphate")
        flags.append("check_pth")
    if ckd_stage == "G5":
        flags.append("discuss_rrt_options")
    if egfr < 30:
        flags.append("avoid_gadolinium_contrast")
    if egfr < 45:
        flags.append("caution_iv_contrast")
    return flags


def calculate_egfr_fallback(data: dict[str, Any]) -> dict[str, Any]:
    """
    Calculate eGFR locally when TibaBot is unavailable.

    Implements CKD-EPI 2021 and Cockcroft-Gault equations.
    """
    creatinine = data["creatinine"]
    unit = data.get("creatinine_unit", "umol/L")
    age = data["age"]
    sex = data["sex"]
    weight_kg = data.get("weight_kg")

    creatinine_mg_dl = _convert_to_mg_dl(creatinine, unit)

    egfr_ckd_epi = round(_ckd_epi_2021(creatinine_mg_dl, age, sex), 1)
    egfr_cg = _cockcroft_gault(creatinine_mg_dl, age, sex, weight_kg)

    ckd_stage, category = _get_ckd_stage(egfr_ckd_epi)
    dose_band = _get_dose_adjustment_band(egfr_ckd_epi)
    flags = _get_flags(egfr_ckd_epi, ckd_stage)

    interpretation = f"eGFR {egfr_ckd_epi} mL/min/1.73m² — CKD Stage {ckd_stage} ({category})."
    if dose_band == "normal":
        interpretation += " No renal dose adjustment needed."
    elif dose_band == "mild":
        interpretation += " Mild impairment — check renally-cleared drugs for dose adjustment."
    elif dose_band == "moderate":
        interpretation += " Moderate impairment — dose reduce renally-cleared medications."
    elif dose_band == "severe":
        interpretation += " Severe impairment — significant dose reduction or avoidance required."
    else:
        interpretation += " Kidney failure — use dialysis-dosed regimens."

    return {
        "egfr_ckd_epi": egfr_ckd_epi,
        "egfr_cockcroft_gault": egfr_cg,
        "ckd_stage": ckd_stage,
        "category": category,
        "dose_adjustment_band": dose_band,
        "flags": flags,
        "interpretation": interpretation,
        "creatinine_used_mg_dl": round(creatinine_mg_dl, 3),
        "mode": "fallback",
    }
