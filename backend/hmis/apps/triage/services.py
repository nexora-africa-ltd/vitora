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
    Classify patient age for MAP thresholds.

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
            patient_age_years: Patient age in years (for age-adjusted MAP thresholds)

        Returns:
            Tuple of (category, alerts_list) where alerts are structured dicts
        """
        alerts: list[AlertDict] = []

        # Check RED criteria (highest priority)
        red_alerts = self._check_red_criteria(
            vitals, mental_status, chief_complaint_category, patient_age_years
        )
        if red_alerts:
            alerts.extend(red_alerts)
            return "RED", alerts

        # Check ORANGE criteria (very urgent)
        orange_alerts = self._check_orange_criteria(
            vitals, pain_score, chief_complaint_category, mobility
        )
        if orange_alerts:
            alerts.extend(orange_alerts)
            # Add any vital warnings
            alerts.extend(self._check_vital_alerts(vitals))
            return "ORANGE", alerts

        # Check YELLOW criteria (urgent)
        yellow_alerts = self._check_yellow_criteria(vitals, pain_score, chief_complaint_category)
        if yellow_alerts:
            alerts.extend(yellow_alerts)
            alerts.extend(self._check_vital_alerts(vitals))
            return "YELLOW", alerts

        # Check if GREEN (standard)
        if chief_complaint_category in ["FEVER", "HEADACHE", "ABDOMINAL_PAIN"]:
            alerts.extend(self._check_vital_alerts(vitals))
            return "GREEN", alerts

        # Default to BLUE (non-urgent)
        alerts.extend(self._check_vital_alerts(vitals))
        return "BLUE", alerts

    def _check_red_criteria(
        self, vitals: dict, mental_status: str, chief_complaint: str, patient_age_years: float = 30
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

        # Heart rate critical
        hr = vitals.get("heart_rate")
        if hr:
            if hr < 40:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="HEART_RATE",
                        message=f"Severe bradycardia (heart rate {hr} bpm)",
                        value=hr,
                        threshold=40,
                        clinical_note="Risk of cardiac arrest",
                        actions=["12-lead ECG", "Atropine ready", "Pacing on standby"],
                    )
                )
                has_red_criteria = True
            elif hr > 150:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="HEART_RATE",
                        message=f"Severe tachycardia (heart rate {hr} bpm)",
                        value=hr,
                        threshold=150,
                        clinical_note="Unstable tachyarrhythmia risk",
                        actions=["12-lead ECG", "IV access", "Cardioversion on standby"],
                    )
                )
                has_red_criteria = True

        # Temperature critical (severe hypothermia or high fever)
        temp = vitals.get("temperature")
        if temp is not None:
            if temp < 32:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="TEMPERATURE",
                        message=f"Severe hypothermia ({temp}°C)",
                        value=float(temp),
                        threshold=32,
                        clinical_note="Life-threatening; risk of cardiac arrest",
                        actions=["Active warming", "Warm IV fluids", "Cardiac monitoring"],
                    )
                )
                has_red_criteria = True
            elif temp >= 40:
                alerts.append(
                    create_alert(
                        severity="CRITICAL",
                        vital_type="TEMPERATURE",
                        message=f"High fever / Hyperpyrexia ({temp}°C)",
                        value=float(temp),
                        threshold=40,
                        clinical_note="Potentially life-threatening; urgent evaluation needed",
                        actions=["Antipyretics", "Cooling measures", "Investigate source"],
                    )
                )
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
        self, vitals: dict, pain_score: int | None, chief_complaint: str, mobility: str | None
    ) -> list[AlertDict]:
        """
        Check for ORANGE (Very Urgent) criteria.

        ORANGE if:
        - Chest pain with BP > 140 or significant pain
        - Difficulty breathing with SpO2 < 95%
        - Pain score 9-10
        - Trauma with immobile status

        Args:
            vitals: Dictionary of vital signs
            pain_score: Pain level 0-10
            chief_complaint: Chief complaint category
            mobility: Mobility status

        Returns:
            List of ORANGE-level structured alerts, empty if no ORANGE criteria met
        """
        alerts: list[AlertDict] = []

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

    def _check_vital_alerts(self, vitals: dict) -> list[AlertDict]:
        """
        Generate alerts for abnormal vitals (warning level).

        Args:
            vitals: Dictionary of vital signs

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

        # Heart rate warnings (not critical)
        hr = vitals.get("heart_rate")
        if hr:
            if 40 <= hr < 50:
                alerts.append(
                    create_alert(
                        severity="WARNING",
                        vital_type="HEART_RATE",
                        message=f"Bradycardia (heart rate {hr} bpm)",
                        value=hr,
                        threshold=50,
                    )
                )
            elif 100 < hr <= 150:
                alerts.append(
                    create_alert(
                        severity="WARNING",
                        vital_type="HEART_RATE",
                        message=f"Tachycardia (heart rate {hr} bpm)",
                        value=hr,
                        threshold=100,
                    )
                )

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

        # Temperature warnings (critical cases already handled in RED)
        temp = vitals.get("temperature")
        if temp:
            # Warning high: 37.6-39.9°C (sub-classified as low-grade or moderate fever)
            if 37.5 < temp < 40:
                if temp < 38.5:
                    alerts.append(
                        create_alert(
                            severity="WARNING",
                            vital_type="TEMPERATURE",
                            message=f"Low-grade fever ({temp}°C)",
                            value=float(temp),
                            threshold=37.5,
                            clinical_note="Usually mild, often infection-related",
                        )
                    )
                else:
                    alerts.append(
                        create_alert(
                            severity="WARNING",
                            vital_type="TEMPERATURE",
                            message=f"Moderate fever ({temp}°C)",
                            value=float(temp),
                            threshold=38.5,
                            clinical_note="Clinical attention may be required",
                        )
                    )
            # Warning low: 32-36°C (sub-classified as mild or moderate hypothermia)
            elif 32 <= temp < 36:
                if temp >= 35:
                    alerts.append(
                        create_alert(
                            severity="WARNING",
                            vital_type="TEMPERATURE",
                            message=f"Mild hypothermia ({temp}°C)",
                            value=float(temp),
                            threshold=36.0,
                            clinical_note="Usually mild, monitor closely",
                        )
                    )
                else:
                    alerts.append(
                        create_alert(
                            severity="WARNING",
                            vital_type="TEMPERATURE",
                            message=f"Moderate hypothermia ({temp}°C)",
                            value=float(temp),
                            threshold=35.0,
                            clinical_note="Symptoms: shivering, confusion, slurred speech",
                        )
                    )

        # Respiratory rate warnings
        rr = vitals.get("respiratory_rate")
        if rr:
            if rr < 10:
                alerts.append(
                    create_alert(
                        severity="WARNING",
                        vital_type="RESPIRATORY_RATE",
                        message=f"Low respiratory rate ({rr} breaths/min)",
                        value=rr,
                        threshold=10,
                    )
                )
            elif rr > 24:
                alerts.append(
                    create_alert(
                        severity="WARNING",
                        vital_type="RESPIRATORY_RATE",
                        message=f"Elevated respiratory rate ({rr} breaths/min)",
                        value=rr,
                        threshold=24,
                    )
                )

        return alerts
