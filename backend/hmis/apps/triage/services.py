"""
Triage services for Vitora HMIS.

This module contains business logic for triage operations,
particularly the KETA (Kenya Emergency Triage Assessment) category calculator.

Sprint 1.5-1.6 Track E: Triage Module MVP
"""


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
) -> tuple[str, str | None]:
    """
    Check MAP against age-appropriate thresholds.

    Args:
        systolic: Systolic blood pressure (mmHg)
        diastolic: Diastolic blood pressure (mmHg)
        age_years: Patient age in years (default 30 for adult)

    Returns:
        Tuple of (status, alert_message)
        status: 'critical', 'warning', or 'normal'
        alert_message: Description if abnormal, None if normal
    """
    map_value = calculate_map(systolic, diastolic)
    age_group = get_age_group(age_years)
    thresholds = MAP_THRESHOLDS[age_group]

    # Critical: MAP at or below minimum for adequate organ perfusion
    if map_value <= thresholds["critical_low"]:
        return (
            "critical",
            f"CRITICAL: Hypotension - MAP {map_value} mmHg indicates inadequate blood pressure (≤{thresholds['critical_low']})",
        )

    # Critical: Severely elevated MAP (>120 for adults)
    if map_value >= thresholds["elevated_high"] + 15:
        return (
            "critical",
            f"CRITICAL: Hypertension - MAP {map_value} mmHg indicates severely elevated blood pressure",
        )

    # Warning: MAP below normal range
    if map_value < thresholds["normal_low"]:
        return (
            "warning",
            f"Warning: Low blood pressure - MAP {map_value} mmHg below normal ({thresholds['normal_low']}-{thresholds['normal_high']})",
        )

    # Warning: MAP above normal
    if map_value > thresholds["elevated_high"]:
        return (
            "warning",
            f"Warning: Elevated blood pressure - MAP {map_value} mmHg (>{thresholds['elevated_high']})",
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
    ) -> tuple[str, list[str]]:
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
            Tuple of (category, alerts_list)
        """
        alerts = []

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
    ) -> list[str]:
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
            List of RED-level alerts, empty if no RED criteria met
        """
        alerts = []
        has_red_criteria = False

        # Mental status alerts (highest priority - immediate return)
        if mental_status == "U":
            alerts.append("CRITICAL: Patient unresponsive (AVPU=U)")
            return alerts

        if mental_status == "P":
            alerts.append("CRITICAL: Patient only responds to pain (AVPU=P)")
            return alerts

        # Collect all critical vital alerts
        # SpO2 critical (moderate-severe hypoxemia)
        spo2 = vitals.get("spo2")
        if spo2 is not None:
            if spo2 <= 85:
                alerts.append(f"EMERGENCY: Severe hypoxemia (SpO2 {spo2}%)")
                has_red_criteria = True
            elif spo2 <= 90:
                alerts.append(f"CRITICAL: Moderate hypoxemia (SpO2 {spo2}%)")
                has_red_criteria = True

        # Blood pressure - MAP-based evaluation (age-adjusted)
        systolic = vitals.get("systolic_bp")
        diastolic = vitals.get("diastolic_bp")
        if systolic is not None and diastolic is not None:
            # Full MAP evaluation when both values are present
            status, alert_msg = check_map_status(systolic, diastolic, patient_age_years)
            if status == "critical":
                alerts.append(alert_msg)
                has_red_criteria = True
        elif systolic is not None:
            # Fallback: systolic-only extreme value check when diastolic is missing
            if systolic < 90:
                alerts.append(
                    f"CRITICAL: Severe hypotension (systolic blood pressure {systolic} mmHg)"
                )
                has_red_criteria = True
            elif systolic > 180:
                alerts.append(
                    f"CRITICAL: Severe hypertension (systolic blood pressure {systolic} mmHg)"
                )
                has_red_criteria = True

        # Heart rate critical
        hr = vitals.get("heart_rate")
        if hr:
            if hr < 40:
                alerts.append(f"CRITICAL: Severe bradycardia (heart rate {hr} bpm)")
                has_red_criteria = True
            elif hr > 150:
                alerts.append(f"CRITICAL: Severe tachycardia (heart rate {hr} bpm)")
                has_red_criteria = True

        # Altered consciousness with responds to voice
        if chief_complaint == "ALTERED_CONSCIOUSNESS" and mental_status == "V":
            alerts.append("CRITICAL: Altered consciousness - responds to voice only")
            has_red_criteria = True

        return alerts if has_red_criteria else []

    def _check_orange_criteria(
        self, vitals: dict, pain_score: int | None, chief_complaint: str, mobility: str | None
    ) -> list[str]:
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
            List of ORANGE-level alerts, empty if no ORANGE criteria met
        """
        alerts = []

        # Chest pain with abnormal vitals or severe pain
        if chief_complaint == "CHEST_PAIN":
            systolic = vitals.get("systolic_bp")
            if (systolic and systolic > 140) or (pain_score and pain_score >= 7):
                alerts.append("ALERT: Chest pain with abnormal vitals - cardiac evaluation needed")
                return alerts

        # Difficulty breathing with low SpO2
        if chief_complaint == "DIFFICULTY_BREATHING":
            spo2 = vitals.get("spo2")
            if spo2 and spo2 < 95:
                alerts.append(f"ALERT: Difficulty breathing with low oxygen (SpO2 {spo2}%)")
                return alerts

        # Severe pain
        if pain_score and pain_score >= 9:
            alerts.append(
                f"ALERT: Severe pain (score {pain_score}/10) - immediate attention needed"
            )
            return alerts

        # Trauma with immobile
        if chief_complaint == "TRAUMA" and mobility == "IMMOBILE":
            alerts.append("ALERT: Trauma patient immobile - urgent assessment needed")
            return alerts

        return []

    def _check_yellow_criteria(
        self, vitals: dict, pain_score: int | None, chief_complaint: str
    ) -> list[str]:
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
            List of YELLOW-level alerts, empty if no YELLOW criteria met
        """
        alerts = []

        # Moderate to significant pain
        if pain_score and pain_score >= 7:
            alerts.append(f"WARNING: Significant pain (score {pain_score}/10)")
            return alerts

        # Fever with warning vitals
        if chief_complaint == "FEVER":
            spo2 = vitals.get("spo2")
            temp = vitals.get("temperature")

            if spo2 and spo2 < 95:
                alerts.append(f"WARNING: Fever with low oxygen (SpO2 {spo2}%)")
                return alerts

            if temp and temp >= 38.5:
                alerts.append(f"WARNING: High fever (temperature {temp}°C)")
                return alerts

        return []

    def _check_vital_alerts(self, vitals: dict) -> list[str]:
        """
        Generate alerts for abnormal vitals (warning level).

        Args:
            vitals: Dictionary of vital signs

        Returns:
            List of warning-level alerts for abnormal vitals
        """
        alerts = []

        # SpO2 warnings (not critical, already checked in RED)
        spo2 = vitals.get("spo2")
        if spo2 and 90 <= spo2 < 95:
            alerts.append(f"WARNING: Low oxygen saturation (SpO2 {spo2}%)")

        # Heart rate warnings (not critical)
        hr = vitals.get("heart_rate")
        if hr:
            if 40 <= hr < 50:
                alerts.append(f"WARNING: Bradycardia (heart rate {hr} bpm)")
            elif 100 < hr <= 150:
                alerts.append(f"WARNING: Tachycardia (heart rate {hr} bpm)")

        # Blood pressure warnings (not critical)
        systolic = vitals.get("systolic_bp")
        if systolic and 140 < systolic <= 180:
            alerts.append(f"WARNING: Elevated blood pressure (systolic {systolic} mmHg)")

        # Temperature warnings
        temp = vitals.get("temperature")
        if temp:
            if temp >= 38.5:
                alerts.append(f"WARNING: Elevated temperature ({temp}°C)")
            elif temp < 36.0:
                alerts.append(f"WARNING: Low temperature ({temp}°C)")

        # Respiratory rate warnings
        rr = vitals.get("respiratory_rate")
        if rr:
            if rr < 10:
                alerts.append(f"WARNING: Low respiratory rate ({rr} breaths/min)")
            elif rr > 24:
                alerts.append(f"WARNING: Elevated respiratory rate ({rr} breaths/min)")

        return alerts
