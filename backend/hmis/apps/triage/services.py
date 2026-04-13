"""
Triage services for Vitora HMIS.

This module contains business logic for triage operations,
particularly the KETA (Kenya Emergency Triage Assessment) category calculator.

Sprint 1.5-1.6 Track E: Triage Module MVP
"""

import uuid
from decimal import Decimal
from typing import Any

# Type alias for structured alert objects
AlertDict = dict[str, Any]


def _ensure_json_serializable(value: Any) -> float | int | str | None:
    """Convert Decimal and other non-JSON-serializable types to serializable ones."""
    if value is None:
        return 0
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float, str)):
        return value
    return float(value)  # fallback for other numeric types


def create_alert(
    severity: str,
    vital_type: str,
    message: str,
    value: float | int | str | Decimal | None = None,
    threshold: float | int | Decimal | None = None,
    clinical_note: str | None = None,
    actions: list[str] | None = None,
) -> AlertDict:
    """
    Create a structured alert object.

    Args:
        severity: 'CRITICAL' or 'WARNING'
        vital_type: One of 'SPO2', 'SYSTOLIC_BP', 'DIASTOLIC_BP', 'HEART_RATE',
                   'TEMPERATURE', 'RESPIRATORY_RATE', 'MENTAL_STATUS',
                   'PAIN_SCORE', 'GENERAL'
        message: Human-readable alert message
        value: The actual measured value (optional)
        threshold: The threshold that was violated (optional)
        clinical_note: Optional clinical guidance note
        actions: Optional list of recommended actions

    Returns:
        Structured alert dict matching frontend TriageAlertSchema
    """
    alert: AlertDict = {
        "id": str(uuid.uuid4()),
        "severity": severity,
        "vital_type": vital_type,
        "message": message,
        "value": _ensure_json_serializable(value),
        "threshold": _ensure_json_serializable(threshold),
    }
    if clinical_note:
        alert["clinical_note"] = clinical_note
    if actions:
        alert["actions"] = actions
    return alert


def calculate_map(systolic: int, diastolic: int) -> int:
    """
    Calculate Mean Arterial Pressure (MAP).

    MAP = (SBP + 2 × DBP) / 3

    Args:
        systolic: Systolic blood pressure (mmHg)
        diastolic: Diastolic blood pressure (mmHg)

    Returns:
        MAP value (rounded to nearest integer)
    """
    return round((systolic + 2 * diastolic) / 3)


def get_age_group(age_years: float) -> str:
    """
    Classify patient age for vital sign thresholds.

    Args:
        age_years: Patient age in years

    Returns:
        Age group string: 'adult', 'adolescent', 'school_age',
                         'young_child', 'infant', 'neonate'
    """
    if age_years >= 18:
        return "adult"
    if age_years >= 13:
        return "adolescent"
    if age_years >= 6:
        return "school_age"
    if age_years >= 1:
        return "young_child"
    if age_years >= 1 / 12:  # 1 month
        return "infant"
    return "neonate"


# MAP thresholds by age group (mmHg)
# Based on clinical guidelines for organ perfusion
MAP_THRESHOLDS = {
    "adult": {"normal_low": 70, "normal_high": 100, "critical_low": 65, "elevated_high": 105},
    "adolescent": {"normal_low": 65, "normal_high": 95, "critical_low": 60, "elevated_high": 100},
    "school_age": {"normal_low": 60, "normal_high": 90, "critical_low": 55, "elevated_high": 95},
    "young_child": {"normal_low": 55, "normal_high": 85, "critical_low": 50, "elevated_high": 90},
    "infant": {"normal_low": 45, "normal_high": 70, "critical_low": 40, "elevated_high": 75},
    "neonate": {"normal_low": 40, "normal_high": 60, "critical_low": 35, "elevated_high": 65},
}

# =============================================================================
# Age-Specific Vital Sign Thresholds
# Based on ETAT (WHO Emergency Triage Assessment & Treatment) and KETA guidelines
# =============================================================================

# Heart rate thresholds by age group (bpm)
HR_THRESHOLDS: dict[str, dict[str, int]] = {
    "neonate": {"critical_low": 80, "normal_low": 100, "normal_high": 160, "critical_high": 200},
    "infant": {"critical_low": 80, "normal_low": 100, "normal_high": 150, "critical_high": 180},
    "young_child": {"critical_low": 60, "normal_low": 80, "normal_high": 130, "critical_high": 170},
    "school_age": {"critical_low": 50, "normal_low": 70, "normal_high": 110, "critical_high": 150},
    "adolescent": {"critical_low": 40, "normal_low": 60, "normal_high": 100, "critical_high": 150},
    "adult": {"critical_low": 40, "normal_low": 60, "normal_high": 100, "critical_high": 150},
}

# Respiratory rate thresholds by age group (breaths/min)
RR_THRESHOLDS: dict[str, dict[str, int]] = {
    "neonate": {"critical_low": 20, "normal_low": 30, "normal_high": 60, "critical_high": 70},
    "infant": {"critical_low": 15, "normal_low": 25, "normal_high": 50, "critical_high": 60},
    "young_child": {"critical_low": 12, "normal_low": 20, "normal_high": 30, "critical_high": 45},
    "school_age": {"critical_low": 10, "normal_low": 18, "normal_high": 25, "critical_high": 35},
    "adolescent": {"critical_low": 8, "normal_low": 12, "normal_high": 20, "critical_high": 30},
    "adult": {"critical_low": 8, "normal_low": 12, "normal_high": 20, "critical_high": 30},
}

# Temperature thresholds by age group (°C)
# Neonates and infants are more vulnerable to temperature extremes
TEMP_THRESHOLDS: dict[str, dict[str, float]] = {
    "neonate": {"critical_low": 35.0, "normal_low": 36.5, "normal_high": 37.5, "critical_high": 38.0},
    "infant": {"critical_low": 35.0, "normal_low": 36.0, "normal_high": 37.5, "critical_high": 38.5},
    "young_child": {"critical_low": 35.0, "normal_low": 36.0, "normal_high": 37.5, "critical_high": 39.0},
    "school_age": {"critical_low": 35.0, "normal_low": 36.0, "normal_high": 37.5, "critical_high": 39.5},
    "adolescent": {"critical_low": 35.0, "normal_low": 36.0, "normal_high": 37.5, "critical_high": 40.0},
    "adult": {"critical_low": 32.0, "normal_low": 36.0, "normal_high": 37.5, "critical_high": 40.0},
}

# ETAT danger signs for children under 5 years
ETAT_DANGER_SIGNS = [
    "unable_to_drink",
    "convulsions",
    "lethargy",
    "chest_indrawing",
    "stridor",
    "severe_malnutrition",
    "grunting",
    "cyanosis",
    "severe_pallor",
    "hypothermia",
]

# Neonatal-specific chief complaint categories
NEONATAL_COMPLAINT_CATEGORIES = [
    "NEONATAL_SEPSIS",
    "NEONATAL_JAUNDICE",
    "NEONATAL_RESPIRATORY_DISTRESS",
    "BIRTH_ASPHYXIA",
]

# Pediatric-specific chief complaint categories (1-12y)
PEDIATRIC_COMPLAINT_CATEGORIES = [
    "FEBRILE_CONVULSION",
    "CROUP",
    "BRONCHIOLITIS",
    "SEVERE_MALARIA",
]


def check_heart_rate_status(
    hr: int, age_years: float = 30
) -> tuple[str, AlertDict | None]:
    """
    Check heart rate against age-appropriate thresholds.

    Args:
        hr: Heart rate in bpm
        age_years: Patient age in years (default 30 for adult)

    Returns:
        Tuple of (status, alert_dict) — 'critical', 'warning', or 'normal'
    """
    age_group = get_age_group(age_years)
    thresholds = HR_THRESHOLDS[age_group]

    if hr <= thresholds["critical_low"]:
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="HEART_RATE",
                message=f"Severe bradycardia (heart rate {hr} bpm)",
                value=hr,
                threshold=thresholds["critical_low"],
                clinical_note=f"Critical for {age_group.replace('_', ' ')}: HR ≤{thresholds['critical_low']} bpm",
                actions=["12-lead ECG", "Assess perfusion", "Prepare resuscitation"],
            ),
        )

    if hr >= thresholds["critical_high"]:
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="HEART_RATE",
                message=f"Severe tachycardia (heart rate {hr} bpm)",
                value=hr,
                threshold=thresholds["critical_high"],
                clinical_note=f"Critical for {age_group.replace('_', ' ')}: HR ≥{thresholds['critical_high']} bpm",
                actions=["12-lead ECG", "IV access", "Assess for shock/dehydration"],
            ),
        )

    if hr < thresholds["normal_low"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="HEART_RATE",
                message=f"Bradycardia (heart rate {hr} bpm)",
                value=hr,
                threshold=thresholds["normal_low"],
            ),
        )

    if hr > thresholds["normal_high"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="HEART_RATE",
                message=f"Tachycardia (heart rate {hr} bpm)",
                value=hr,
                threshold=thresholds["normal_high"],
            ),
        )

    return ("normal", None)


def check_respiratory_rate_status(
    rr: int, age_years: float = 30
) -> tuple[str, AlertDict | None]:
    """
    Check respiratory rate against age-appropriate thresholds.

    Args:
        rr: Respiratory rate in breaths/min
        age_years: Patient age in years (default 30 for adult)

    Returns:
        Tuple of (status, alert_dict) — 'critical', 'warning', or 'normal'
    """
    age_group = get_age_group(age_years)
    thresholds = RR_THRESHOLDS[age_group]

    if rr <= thresholds["critical_low"]:
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="RESPIRATORY_RATE",
                message=f"Severely low respiratory rate ({rr} breaths/min)",
                value=rr,
                threshold=thresholds["critical_low"],
                clinical_note=f"Critical for {age_group.replace('_', ' ')}: RR ≤{thresholds['critical_low']}",
                actions=["Assess airway", "Bag-valve mask ready", "Prepare intubation"],
            ),
        )

    if rr >= thresholds["critical_high"]:
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="RESPIRATORY_RATE",
                message=f"Severely elevated respiratory rate ({rr} breaths/min)",
                value=rr,
                threshold=thresholds["critical_high"],
                clinical_note=f"Critical for {age_group.replace('_', ' ')}: RR ≥{thresholds['critical_high']}",
                actions=["Supplemental oxygen", "Assess for respiratory failure", "Chest X-ray"],
            ),
        )

    if rr < thresholds["normal_low"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="RESPIRATORY_RATE",
                message=f"Low respiratory rate ({rr} breaths/min)",
                value=rr,
                threshold=thresholds["normal_low"],
            ),
        )

    if rr > thresholds["normal_high"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="RESPIRATORY_RATE",
                message=f"Elevated respiratory rate ({rr} breaths/min)",
                value=rr,
                threshold=thresholds["normal_high"],
            ),
        )

    return ("normal", None)


def check_temperature_status(
    temp: float, age_years: float = 30
) -> tuple[str, AlertDict | None]:
    """
    Check temperature against age-appropriate thresholds.

    Args:
        temp: Temperature in °C
        age_years: Patient age in years (default 30 for adult)

    Returns:
        Tuple of (status, alert_dict) — 'critical', 'warning', or 'normal'
    """
    age_group = get_age_group(age_years)
    thresholds = TEMP_THRESHOLDS[age_group]

    if temp <= thresholds["critical_low"]:
        note = "Life-threatening hypothermia"
        if age_group in ("neonate", "infant"):
            note = "Neonatal/infant hypothermia — high mortality risk"
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="TEMPERATURE",
                message=f"Severe hypothermia ({temp}°C)",
                value=float(temp),
                threshold=thresholds["critical_low"],
                clinical_note=note,
                actions=["Active warming", "Warm IV fluids", "Cardiac monitoring"],
            ),
        )

    if temp >= thresholds["critical_high"]:
        note = "Potentially life-threatening; urgent evaluation needed"
        if age_group in ("neonate", "infant"):
            note = "Neonatal/infant fever — high risk of serious bacterial infection"
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="TEMPERATURE",
                message=f"High fever / Hyperpyrexia ({temp}°C)",
                value=float(temp),
                threshold=thresholds["critical_high"],
                clinical_note=note,
                actions=["Antipyretics", "Cooling measures", "Blood cultures"],
            ),
        )

    if temp < thresholds["normal_low"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="TEMPERATURE",
                message=f"Low temperature ({temp}°C)",
                value=float(temp),
                threshold=thresholds["normal_low"],
                clinical_note="Monitor closely; consider warming",
            ),
        )

    if temp > thresholds["normal_high"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="TEMPERATURE",
                message=f"Elevated temperature ({temp}°C)",
                value=float(temp),
                threshold=thresholds["normal_high"],
            ),
        )

    return ("normal", None)


def check_map_status(
    systolic: int, diastolic: int, age_years: float = 30
) -> tuple[str, AlertDict | None]:
    """
    Check MAP against age-appropriate thresholds.

    Args:
        systolic: Systolic blood pressure (mmHg)
        diastolic: Diastolic blood pressure (mmHg)
        age_years: Patient age in years (default 30 for adult)

    Returns:
        Tuple of (status, alert_dict)
        status: 'critical', 'warning', or 'normal'
        alert_dict: Structured alert dict if abnormal, None if normal
    """
    map_value = calculate_map(systolic, diastolic)
    age_group = get_age_group(age_years)
    thresholds = MAP_THRESHOLDS[age_group]

    # Critical: MAP at or below minimum for adequate organ perfusion
    if map_value <= thresholds["critical_low"]:
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="SYSTOLIC_BP",
                message=f"Hypotension - MAP {map_value} mmHg indicates inadequate blood pressure",
                value=map_value,
                threshold=thresholds["critical_low"],
                clinical_note="Immediate intervention required for hypotensive crisis",
                actions=["Assess airway and breathing", "Establish IV access", "Prepare vasopressors"],
            ),
        )

    # Critical: Severely elevated MAP (>120 for adults)
    if map_value >= thresholds["elevated_high"] + 15:
        return (
            "critical",
            create_alert(
                severity="CRITICAL",
                vital_type="SYSTOLIC_BP",
                message=f"Hypertension - MAP {map_value} mmHg indicates severely elevated blood pressure",
                value=map_value,
                threshold=thresholds["elevated_high"] + 15,
                clinical_note="Urgent BP control needed to prevent end-organ damage",
                actions=["Monitor for signs of stroke/MI", "Consider IV antihypertensives"],
            ),
        )

    # Warning: MAP below normal range
    if map_value < thresholds["normal_low"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="SYSTOLIC_BP",
                message=f"Low blood pressure - MAP {map_value} mmHg below normal",
                value=map_value,
                threshold=thresholds["normal_low"],
            ),
        )

    # Warning: MAP above normal
    if map_value > thresholds["elevated_high"]:
        return (
            "warning",
            create_alert(
                severity="WARNING",
                vital_type="SYSTOLIC_BP",
                message=f"Elevated blood pressure - MAP {map_value} mmHg above normal",
                value=map_value,
                threshold=thresholds["elevated_high"],
            ),
        )

    return ("normal", None)


class TriageCategoryCalculator:
    """
    Calculates triage category using KETA (Kenya Emergency Triage Assessment) rules.

    Priority Order:
    1. RED - Life-threatening emergencies (immediate)
    2. ORANGE - Very urgent (<10 minutes)
    3. YELLOW - Urgent (<60 minutes)
    4. GREEN - Standard (<240 minutes)
    5. BLUE - Non-urgent/Referral
    """

    def __init__(self, thresholds: dict = None):
        """
        Initialize with custom or default thresholds.

        Args:
            thresholds: Optional custom thresholds dict, uses defaults if None
        """
        if thresholds is None:
            from hmis.apps.triage.models import TriageVitalThreshold

            self.thresholds = TriageVitalThreshold.get_defaults()
        else:
            self.thresholds = thresholds

    def calculate(
        self,
        vitals: dict,
        mental_status: str,
        chief_complaint_category: str,
        pain_score: int | None = None,
        mobility: str | None = None,
        patient_age_years: float = 30,
        gcs_total: int | None = None,
        etat_danger_signs: list[str] | None = None,
        dehydration_level: str = "",
        fontanelle_status: str = "",
        breastfeeding_ability: str = "",
        capillary_refill_seconds: int | None = None,
        muac_cm: float | None = None,
    ) -> tuple[str, list[AlertDict]]:
        """
        Calculate triage category and generate alerts.

        Args:
            vitals: Dict with spo2, systolic_bp, diastolic_bp, heart_rate,
                   temperature, respiratory_rate
            mental_status: AVPU scale value (A/V/P/U)
            chief_complaint_category: From CHIEF_COMPLAINT_CHOICES
            pain_score: 0-10 pain scale (optional)
            mobility: Mobility status (optional)
            patient_age_years: Patient age in years (for age-adjusted thresholds)
            gcs_total: Glasgow Coma Scale total (3-15, optional)
            etat_danger_signs: List of ETAT danger signs present (children <5y)
            dehydration_level: WHO dehydration classification (NONE/SOME/SEVERE)
            fontanelle_status: Anterior fontanelle (NORMAL/BULGING/SUNKEN)
            breastfeeding_ability: Feeding ability (NORMAL/REDUCED/UNABLE)
            capillary_refill_seconds: Capillary refill time in seconds
            muac_cm: Mid-upper arm circumference in cm (children 6-59 months)

        Returns:
            Tuple of (category, alerts_list) where alerts are structured dicts
        """
        alerts: list[AlertDict] = []

        # Check ETAT criteria for children <5 years (highest priority)
        if patient_age_years < 5:
            etat_alerts = self._check_etat_criteria(
                etat_danger_signs=etat_danger_signs or [],
                dehydration_level=dehydration_level,
                fontanelle_status=fontanelle_status,
                breastfeeding_ability=breastfeeding_ability,
                capillary_refill_seconds=capillary_refill_seconds,
                muac_cm=muac_cm,
                patient_age_years=patient_age_years,
            )
            if etat_alerts:
                alerts.extend(etat_alerts)
                # ETAT danger signs always warrant RED
                return "RED", alerts

        # Check RED criteria (highest priority)
        red_alerts = self._check_red_criteria(
            vitals, mental_status, chief_complaint_category, patient_age_years, gcs_total
        )
        if red_alerts:
            alerts.extend(red_alerts)
            return "RED", alerts

        # Check ORANGE criteria (very urgent)
        orange_alerts = self._check_orange_criteria(
            vitals, pain_score, chief_complaint_category, mobility, gcs_total,
            capillary_refill_seconds=capillary_refill_seconds,
            muac_cm=muac_cm,
            patient_age_years=patient_age_years,
            dehydration_level=dehydration_level,
        )
        if orange_alerts:
            alerts.extend(orange_alerts)
            # Add any vital warnings
            alerts.extend(self._check_vital_alerts(vitals, patient_age_years))
            return "ORANGE", alerts

        # Check YELLOW criteria (urgent)
        yellow_alerts = self._check_yellow_criteria(vitals, pain_score, chief_complaint_category)
        if yellow_alerts:
            alerts.extend(yellow_alerts)
            alerts.extend(self._check_vital_alerts(vitals, patient_age_years))
            return "YELLOW", alerts

        # Check if GREEN (standard)
        if chief_complaint_category in ["FEVER", "HEADACHE", "ABDOMINAL_PAIN"]:
            alerts.extend(self._check_vital_alerts(vitals, patient_age_years))
            return "GREEN", alerts

        # Default to BLUE (non-urgent)
        alerts.extend(self._check_vital_alerts(vitals, patient_age_years))
        return "BLUE", alerts

    def _check_etat_criteria(
        self,
        etat_danger_signs: list[str],
        dehydration_level: str,
        fontanelle_status: str,
        breastfeeding_ability: str,
        capillary_refill_seconds: int | None,
        muac_cm: float | None,
        patient_age_years: float,
    ) -> list[AlertDict]:
        """
        Check ETAT (Emergency Triage Assessment & Treatment) criteria for children <5y.

        Any ETAT danger sign = RED (emergency). These are WHO-defined signs indicating
        imminent risk of death in children.

        Returns:
            List of RED-level alerts, empty if no ETAT criteria met
        """
        alerts: list[AlertDict] = []

        # Check ETAT danger signs
        if etat_danger_signs:
            sign_labels = {
                "unable_to_drink": "Unable to drink or breastfeed",
                "convulsions": "Convulsions (now or recent)",
                "lethargy": "Abnormally sleepy / lethargic",
                "chest_indrawing": "Chest indrawing",
                "stridor": "Stridor in a calm child",
                "severe_malnutrition": "Severe visible malnutrition (wasting)",
                "grunting": "Grunting respiration",
                "cyanosis": "Central cyanosis",
                "severe_pallor": "Severe pallor",
                "hypothermia": "Hypothermia (cold to touch)",
            }
            for sign in etat_danger_signs:
                if sign in sign_labels:
                    alerts.append(
                        create_alert(
                            severity="CRITICAL",
                            vital_type="GENERAL",
                            message=f"ETAT danger sign: {sign_labels[sign]}",
                            clinical_note="WHO ETAT: immediate assessment and treatment required",
                            actions=["Assess ABC (Airway, Breathing, Circulation)", "Initiate emergency treatment"],
                        )
                    )

        # Severe dehydration = RED
        if dehydration_level == "SEVERE":
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="GENERAL",
                    message="Severe dehydration (WHO classification)",
                    clinical_note="Immediate IV/IO fluid resuscitation required",
                    actions=["IV access", "Ringer's lactate 20ml/kg bolus", "Reassess after 30 min"],
                )
            )

        # Bulging fontanelle = RED (meningitis sign) — only for <18 months
        if fontanelle_status == "BULGING" and patient_age_years < 1.5:
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="GENERAL",
                    message="Bulging fontanelle — possible meningitis/raised ICP",
                    clinical_note="Urgent lumbar puncture consideration; IV antibiotics",
                    actions=["Blood cultures", "IV ceftriaxone", "Consider LP when stable"],
                )
            )

        # Capillary refill ≥5 seconds = RED (poor perfusion / shock)
        if capillary_refill_seconds is not None and capillary_refill_seconds >= 5:
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="GENERAL",
                    message=f"Severely prolonged capillary refill ({capillary_refill_seconds}s)",
                    clinical_note="Signs of circulatory shock",
                    actions=["IV access", "Fluid bolus 20ml/kg", "Reassess perfusion"],
                )
            )

        # Unable to breastfeed = RED for infants <1 year
        if breastfeeding_ability == "UNABLE" and patient_age_years < 1:
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="GENERAL",
                    message="Unable to breastfeed / drink (infant)",
                    clinical_note="ETAT danger sign — risk of hypoglycaemia and dehydration",
                    actions=["Check blood glucose", "NG tube feed or IV dextrose", "Assess for sepsis"],
                )
            )

        return alerts

    def _check_red_criteria(
        self, vitals: dict, mental_status: str, chief_complaint: str, patient_age_years: float = 30,
        gcs_total: int | None = None
    ) -> list[AlertDict]:
        """
        Check for RED (Emergency) criteria.

        RED if:
        - Mental status U (Unresponsive) or P (Responds to Pain)
        - SpO2 ≤ 90% (moderate-severe hypoxemia)
        - MAP below critical threshold (age-adjusted, indicates inadequate organ perfusion)
        - MAP severely elevated (age-adjusted)
        - Heart rate < 40 or > 150
        - Altered consciousness chief complaint
        - Responds to voice only with altered consciousness

        Args:
            vitals: Dictionary of vital signs
            mental_status: AVPU scale (A/V/P/U)
            chief_complaint: Chief complaint category
            patient_age_years: Patient age in years (for MAP thresholds)

        Returns:
            List of RED-level structured alerts, empty if no RED criteria met
        """
        alerts: list[AlertDict] = []
        has_red_criteria = False

        # Mental status alerts (highest priority - immediate return)
        if mental_status == "U":
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="MENTAL_STATUS",
                    message="Patient unresponsive (AVPU=U)",
                    value=0,  # U = 0 on AVPU scale
                    threshold=1,  # Minimum acceptable is P (pain response)
                    clinical_note="Immediate resuscitation required",
                    actions=["Call code team", "Assess airway", "Check pulse"],
                )
            )
            return alerts

        if mental_status == "P":
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="MENTAL_STATUS",
                    message="Patient only responds to pain (AVPU=P)",
                    value=1,  # P = 1 on AVPU scale
                    threshold=2,  # Minimum acceptable is V (voice response)
                    clinical_note="Severe neurological impairment",
                    actions=["Protect airway", "Neurological assessment", "Consider CT head"],
                )
            )
            return alerts

        # Glasgow Coma Scale (GCS) - severe impairment (3-8) is RED
        if gcs_total is not None and gcs_total <= 8:
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="GCS",
                    message=f"Severe GCS impairment (GCS={gcs_total})",
                    value=gcs_total,
                    threshold=8,
                    clinical_note="GCS ≤8 indicates severe brain injury; intubation likely needed",
                    actions=["Protect airway", "Consider intubation", "Urgent CT head", "Neurosurgery consult"],
                )
            )
            return alerts

        # Collect all critical vital alerts
        # SpO2 critical (moderate-severe hypoxemia)
        spo2 = vitals.get("spo2")
        if spo2 is not None:
            if spo2 <= 85:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="SPO2",
                        message=f"Severe hypoxemia (SpO2 {spo2}%)",
                        value=spo2,
                        threshold=85,
                        clinical_note="Life-threatening hypoxia",
                        actions=["High-flow oxygen", "Prepare intubation equipment", "ABG"],
                    )
                )
                has_red_criteria = True
            elif spo2 <= 90:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="SPO2",
                        message=f"Moderate hypoxemia (SpO2 {spo2}%)",
                        value=spo2,
                        threshold=90,
                        clinical_note="Significant hypoxia requiring immediate intervention",
                        actions=["Supplemental oxygen", "Monitor closely"],
                    )
                )
                has_red_criteria = True

        # Blood pressure - MAP-based evaluation (age-adjusted)
        systolic = vitals.get("systolic_bp")
        diastolic = vitals.get("diastolic_bp")
        if systolic is not None and diastolic is not None:
            # Full MAP evaluation when both values are present
            status, alert_obj = check_map_status(systolic, diastolic, patient_age_years)
            if status == "critical" and alert_obj:
                alerts.append(alert_obj)
                has_red_criteria = True
        elif systolic is not None:
            # Fallback: systolic-only extreme value check when diastolic is missing
            if systolic < 90:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="SYSTOLIC_BP",
                        message=f"Severe low blood pressure (systolic {systolic} mmHg)",
                        value=systolic,
                        threshold=90,
                        clinical_note="Shock likely - immediate fluid resuscitation",
                        actions=["IV access x2", "Fluid bolus", "Vasopressors on standby"],
                    )
                )
                has_red_criteria = True
            elif systolic > 180:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="SYSTOLIC_BP",
                        message=f"Severe high blood pressure (systolic {systolic} mmHg)",
                        value=systolic,
                        threshold=180,
                        clinical_note="Hypertensive emergency risk",
                        actions=["ECG", "Check for end-organ damage", "IV antihypertensives"],
                    )
                )
                has_red_criteria = True

        # Heart rate critical (age-adjusted)
        hr = vitals.get("heart_rate")
        if hr:
            hr_status, hr_alert = check_heart_rate_status(hr, patient_age_years)
            if hr_status == "critical" and hr_alert:
                alerts.append(hr_alert)
                has_red_criteria = True

        # Temperature critical (age-adjusted)
        temp = vitals.get("temperature")
        if temp is not None:
            temp_status, temp_alert = check_temperature_status(float(temp), patient_age_years)
            if temp_status == "critical" and temp_alert:
                alerts.append(temp_alert)
                has_red_criteria = True

        # Respiratory rate critical (age-adjusted)
        rr = vitals.get("respiratory_rate")
        if rr:
            rr_status, rr_alert = check_respiratory_rate_status(rr, patient_age_years)
            if rr_status == "critical" and rr_alert:
                alerts.append(rr_alert)
                has_red_criteria = True

        # Altered consciousness with responds to voice
        if chief_complaint == "ALTERED_CONSCIOUSNESS" and mental_status == "V":
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="MENTAL_STATUS",
                    message="Altered consciousness - responds to voice only",
                    value=2,  # V = 2 on AVPU scale
                    threshold=3,  # A = 3 (alert) is normal
                    clinical_note="Deteriorating consciousness with altered LOC chief complaint",
                    actions=["Neurological exam", "Blood glucose", "Consider CT head"],
                )
            )
            has_red_criteria = True

        return alerts if has_red_criteria else []

    def _check_orange_criteria(
        self, vitals: dict, pain_score: int | None, chief_complaint: str, mobility: str | None,
        gcs_total: int | None = None,
        capillary_refill_seconds: int | None = None,
        muac_cm: float | None = None,
        patient_age_years: float = 30,
        dehydration_level: str = "",
    ) -> list[AlertDict]:
        """
        Check for ORANGE (Very Urgent) criteria.

        ORANGE if:
        - Chest pain with BP > 140 or significant pain
        - Difficulty breathing with SpO2 < 95%
        - Pain score 9-10
        - Trauma with immobile status
        - GCS 9-12 (moderate impairment)

        Args:
            vitals: Dictionary of vital signs
            pain_score: Pain level 0-10
            chief_complaint: Chief complaint category
            mobility: Mobility status
            gcs_total: Glasgow Coma Scale total (3-15, optional)

        Returns:
            List of ORANGE-level structured alerts, empty if no ORANGE criteria met
        """
        alerts: list[AlertDict] = []

        # Glasgow Coma Scale moderate impairment (9-12) - close monitoring needed
        if gcs_total is not None and 9 <= gcs_total <= 12:
            alerts.append(
                create_alert(
                    severity="WARNING",
                    vital_type="GCS",
                    message=f"Moderate GCS impairment (GCS={gcs_total})",
                    value=gcs_total,
                    threshold=12,
                    clinical_note="GCS 9-12 indicates moderate brain injury; close neurological monitoring",
                    actions=["Neurological monitoring q15min", "CT head", "Neurology consult"],
                )
            )
            return alerts

        # Chest pain with abnormal vitals or severe pain
        if chief_complaint == "CHEST_PAIN":
            systolic = vitals.get("systolic_bp")
            if (systolic and systolic > 140) or (pain_score and pain_score >= 7):
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="GENERAL",
                        message="Chest pain with abnormal vitals - cardiac evaluation needed",
                        value=systolic or pain_score or 0,
                        threshold=140,
                        clinical_note="Possible ACS - urgent cardiac workup",
                        actions=["12-lead ECG", "Troponin", "Aspirin if appropriate"],
                    )
                )
                return alerts

        # Difficulty breathing with low SpO2
        if chief_complaint == "DIFFICULTY_BREATHING":
            spo2 = vitals.get("spo2")
            if spo2 and spo2 < 95:
                alerts.append(
                    create_alert(
                        severity="WARNING",
                        vital_type="SPO2",
                        message=f"Difficulty breathing with low oxygen (SpO2 {spo2}%)",
                        value=spo2,
                        threshold=95,
                        clinical_note="Respiratory distress with hypoxia",
                        actions=["Supplemental oxygen", "Peak flow/spirometry", "CXR"],
                    )
                )
                return alerts

        # Severe pain
        if pain_score and pain_score >= 9:
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="PAIN_SCORE",
                    message=f"Severe pain (score {pain_score}/10) - immediate attention needed",
                    value=pain_score,
                    threshold=9,
                    clinical_note="Severe pain requiring urgent management",
                    actions=["IV access", "Analgesia", "Identify cause"],
                )
            )
            return alerts

        # Trauma with immobile
        if chief_complaint == "TRAUMA" and mobility == "IMMOBILE":
            alerts.append(
                create_alert(
                    severity="CRITICAL",
                    vital_type="GENERAL",
                    message="Trauma patient immobile - urgent assessment needed",
                    value=0,
                    threshold=0,
                    clinical_note="Potential spinal injury or severe trauma",
                    actions=["Spinal precautions", "Primary survey", "Imaging"],
                )
            )
            return alerts

        # ---- Pediatric ORANGE criteria (ETAT sub-RED) ----

        # Capillary refill 3-4 seconds = ORANGE (delayed but not shock)
        if capillary_refill_seconds is not None and 3 <= capillary_refill_seconds < 5:
            alerts.append(
                create_alert(
                    severity="WARNING",
                    vital_type="GENERAL",
                    message=f"Prolonged capillary refill ({capillary_refill_seconds}s)",
                    value=capillary_refill_seconds,
                    threshold=3,
                    clinical_note="Delayed perfusion — assess hydration and circulation",
                    actions=["IV access", "Fluid assessment", "Monitor closely"],
                )
            )
            return alerts

        # MUAC < 11.5 cm (SAM) = ORANGE (nutritional emergency, children 6-59 months)
        if muac_cm is not None and muac_cm < 11.5 and patient_age_years < 5:
            alerts.append(
                create_alert(
                    severity="WARNING",
                    vital_type="GENERAL",
                    message=f"Severe Acute Malnutrition (MUAC {muac_cm} cm)",
                    value=float(muac_cm),
                    threshold=11.5,
                    clinical_note="SAM — high mortality risk; initiate therapeutic feeding",
                    actions=["F-75 therapeutic milk", "Check blood glucose", "Assess for complications"],
                )
            )
            return alerts

        # Some dehydration = ORANGE
        if dehydration_level == "SOME":
            alerts.append(
                create_alert(
                    severity="WARNING",
                    vital_type="GENERAL",
                    message="Some dehydration (WHO classification)",
                    clinical_note="Oral rehydration therapy; monitor for worsening",
                    actions=["ORS administration", "Reassess in 4 hours"],
                )
            )
            return alerts

        return []

    def _check_yellow_criteria(
        self, vitals: dict, pain_score: int | None, chief_complaint: str
    ) -> list[AlertDict]:
        """
        Check for YELLOW (Urgent) criteria.

        YELLOW if:
        - Pain score 7-8
        - Fever with SpO2 < 95% or elevated temperature

        Args:
            vitals: Dictionary of vital signs
            pain_score: Pain level 0-10
            chief_complaint: Chief complaint category

        Returns:
            List of YELLOW-level structured alerts, empty if no YELLOW criteria met
        """
        alerts: list[AlertDict] = []

        # Moderate to significant pain
        if pain_score and pain_score >= 7:
            alerts.append(
                create_alert(
                    severity="WARNING",
                    vital_type="PAIN_SCORE",
                    message=f"Significant pain (score {pain_score}/10)",
                    value=pain_score,
                    threshold=7,
                )
            )
            return alerts

        # Fever with warning vitals
        if chief_complaint == "FEVER":
            spo2 = vitals.get("spo2")
            temp = vitals.get("temperature")

            if spo2 and spo2 < 95:
                alerts.append(
                    create_alert(
                        severity="WARNING",
                        vital_type="SPO2",
                        message=f"Fever with low oxygen (SpO2 {spo2}%)",
                        value=spo2,
                        threshold=95,
                    )
                )
                return alerts

            if temp and temp >= 38.5:
                alerts.append(
                    create_alert(
                        severity="WARNING",
                        vital_type="TEMPERATURE",
                        message=f"High fever (temperature {temp}°C)",
                        value=float(temp),
                        threshold=38.5,
                    )
                )
                return alerts

        return []

    def _check_vital_alerts(self, vitals: dict, patient_age_years: float = 30) -> list[AlertDict]:
        """
        Generate alerts for abnormal vitals (warning level).
        Uses age-adjusted thresholds.

        Args:
            vitals: Dictionary of vital signs
            patient_age_years: Patient age in years (for age-adjusted thresholds)

        Returns:
            List of warning-level structured alerts for abnormal vitals
        """
        alerts: list[AlertDict] = []

        # SpO2 warnings (not critical, already checked in RED)
        spo2 = vitals.get("spo2")
        if spo2 and 90 <= spo2 < 95:
            alerts.append(
                create_alert(
                    severity="WARNING",
                    vital_type="SPO2",
                    message=f"Low oxygen saturation (SpO2 {spo2}%)",
                    value=spo2,
                    threshold=95,
                )
            )

        # Heart rate warnings (age-adjusted)
        hr = vitals.get("heart_rate")
        if hr:
            hr_status, hr_alert = check_heart_rate_status(hr, patient_age_years)
            if hr_status == "warning" and hr_alert:
                alerts.append(hr_alert)

        # Blood pressure warnings (not critical)
        systolic = vitals.get("systolic_bp")
        if systolic and 140 < systolic <= 180:
            alerts.append(
                create_alert(
                    severity="WARNING",
                    vital_type="SYSTOLIC_BP",
                    message=f"Elevated blood pressure (systolic {systolic} mmHg)",
                    value=systolic,
                    threshold=140,
                )
            )

        # Temperature warnings (age-adjusted)
        temp = vitals.get("temperature")
        if temp is not None:
            temp_status, temp_alert = check_temperature_status(float(temp), patient_age_years)
            if temp_status == "warning" and temp_alert:
                alerts.append(temp_alert)

        # Respiratory rate warnings (age-adjusted)
        rr = vitals.get("respiratory_rate")
        if rr:
            rr_status, rr_alert = check_respiratory_rate_status(rr, patient_age_years)
            if rr_status == "warning" and rr_alert:
                alerts.append(rr_alert)

        return alerts


# =============================================================================
# Triage Room Auto-Routing
# =============================================================================


def find_best_triage_room(facility):
    """
    Find the best available triage room for auto-routing.

    A room is eligible when:
      1. It is an active PLACE resource in the facility.
      2. It belongs to the triage department configured in TriageSettings.
      3. It has at least one ACTIVE or ON_BREAK shift (i.e. clocked-in staff).
      4. Its current patient load (WAITING_TRIAGE + IN_TRIAGE entries) is
         below its capacity.

    Among eligible rooms the one with the lowest current load is returned.
    Ties are broken by room name (alphabetical) for determinism.

    Returns ``None`` when no eligible room is found or auto-routing is
    disabled for the facility.
    """
    from django.db.models import Count, Q

    from hmis.apps.scheduling.models import Resource, Shift

    from .models import TriageSettings, WaitingQueue

    # --- 1. Check settings ---------------------------------------------------
    try:
        settings = TriageSettings.objects.select_related("triage_department").get(
            facility=facility
        )
    except TriageSettings.DoesNotExist:
        return None

    if not settings.auto_route_to_room:
        return None

    if not settings.triage_department_id:
        return None

    # --- 2. Candidate rooms ---------------------------------------------------
    rooms = (
        Resource.objects.filter(
            facility=facility,
            resource_type="PLACE",
            is_active=True,
            department=settings.triage_department,
        )
        .annotate(
            current_load=Count(
                "triage_queue_entries",
                filter=Q(
                    triage_queue_entries__status__in=["WAITING_TRIAGE", "IN_TRIAGE"],
                ),
            )
        )
        .order_by("current_load", "name")
    )

    # --- 3. Rooms with active staff -------------------------------------------
    from datetime import date as date_cls

    today = date_cls.today()
    rooms_with_staff = set(
        Shift.objects.filter(
            room__in=rooms,
            shift_date=today,
            status__in=["ACTIVE", "ON_BREAK"],
        ).values_list("room_id", flat=True)
    )

    # --- 4. Pick the best room ------------------------------------------------
    for room in rooms:
        if room.pk not in rooms_with_staff:
            continue
        if room.current_load < room.capacity:
            return room

    return None
