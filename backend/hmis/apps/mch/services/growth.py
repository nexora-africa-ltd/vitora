"""
WHO Growth Standards Z-score calculation service.

Implements the LMS (Lambda-Mu-Sigma) method for calculating Z-scores
using WHO Child Growth Standards data.

Z-score formula:
    When L ≠ 0: Z = ((X/M)^L - 1) / (L × S)
    When L = 0: Z = ln(X/M) / S

References:
    - WHO Child Growth Standards (0-5 years): https://www.who.int/tools/child-growth-standards
    - WHO Growth Reference (5-19 years): https://www.who.int/tools/growth-reference-data-for-5to19-years
"""

import json
import logging
import math
from decimal import Decimal
from pathlib import Path

logger = logging.getLogger(__name__)

# Base path for WHO growth standard data files
DATA_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "who_growth_standards"
)


class WHOGrowthCalculator:
    """
    Calculator for WHO Child Growth Standards Z-scores.

    Loads LMS (Lambda, Mu, Sigma) parameters from JSON data files
    and calculates Z-scores for various anthropometric indicators.

    Each JSON file contains an array of objects with:
    - age_days (or length/height for weight-for-length/height)
    - L (Box-Cox power)
    - M (median)
    - S (coefficient of variation)
    """

    _cache: dict = {}

    def __init__(self):
        """Initialize the calculator."""
        pass

    @classmethod
    def _load_data(cls, filename: str) -> list[dict]:
        """
        Load LMS data from a JSON file with caching.

        Args:
            filename: Name of the JSON file in data/who_growth_standards/

        Returns:
            List of LMS parameter dicts
        """
        if filename in cls._cache:
            return cls._cache[filename]

        filepath = DATA_DIR / filename
        if not filepath.exists():
            logger.warning(f"WHO growth data file not found: {filepath}")
            return []

        try:
            with open(filepath) as f:
                data = json.load(f)
            cls._cache[filename] = data
            return data
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Error loading WHO growth data from {filepath}: {e}")
            return []

    @staticmethod
    def _calculate_z_score(x: float, l: float, m: float, s: float) -> Decimal | None:
        """
        Calculate Z-score using the LMS method.

        Args:
            x: Measured value
            l: Lambda (Box-Cox power)
            m: Mu (median)
            s: Sigma (coefficient of variation)

        Returns:
            Z-score as Decimal, or None if calculation fails
        """
        if m <= 0 or s <= 0 or x <= 0:
            return None

        try:
            if abs(l) > 0.01:
                # Standard LMS formula
                z = ((x / m) ** l - 1) / (l * s)
            else:
                # When L ≈ 0, use logarithmic formula
                z = math.log(x / m) / s

            # Clamp extreme values
            z = max(-6.0, min(6.0, z))
            return Decimal(str(round(z, 2)))
        except (ValueError, ZeroDivisionError, OverflowError):
            return None

    @classmethod
    def _interpolate_lms(
        cls, data: list[dict], target_key: str, target_value: float
    ) -> tuple[float, float, float] | None:
        """
        Interpolate LMS parameters for a given target value (age or height/length).

        Args:
            data: List of LMS parameter dicts
            target_key: Key to match (e.g., 'age_days', 'length', 'height')
            target_value: The value to interpolate for

        Returns:
            Tuple of (L, M, S) or None if no data
        """
        if not data:
            return None

        # Find bounding records
        lower = None
        upper = None

        for record in data:
            val = record.get(target_key)
            if val is None:
                continue
            if val <= target_value:
                if lower is None or val > lower.get(target_key, float("-inf")):
                    lower = record
            if val >= target_value:
                if upper is None or val < upper.get(target_key, float("inf")):
                    upper = record

        if lower is None and upper is None:
            return None

        if lower is None:
            lower = upper
        if upper is None:
            upper = lower

        # Exact match or interpolate
        lower_val = lower[target_key]
        upper_val = upper[target_key]

        if lower_val == upper_val:
            return (lower["L"], lower["M"], lower["S"])

        # Linear interpolation
        fraction = (target_value - lower_val) / (upper_val - lower_val)
        l = lower["L"] + fraction * (upper["L"] - lower["L"])
        m = lower["M"] + fraction * (upper["M"] - lower["M"])
        s = lower["S"] + fraction * (upper["S"] - lower["S"])

        return (l, m, s)

    def _get_sex_filename(self, indicator: str, sex: str, age_days: int | None = None) -> str:
        """
        Get the correct filename for the given indicator, sex, and age.

        Selects between 0-5y (WHO Child Growth Standards) and 5-19y / 5-10y
        (WHO Growth Reference 2007) data files based on age_days.

        Args:
            indicator: e.g., 'wfa', 'lhfa', 'wfl', 'wfh', 'hcfa', 'bfa'
            sex: 'M' or 'F'
            age_days: Age in days (used to select 0-5 vs 5-19/5-10 file)

        Returns:
            Filename string
        """
        sex_label = "boys" if sex.upper() == "M" else "girls"

        # For age > 1856 days (>5y), use extended reference data
        if age_days is not None and age_days > 1856:
            if indicator == "wfa":
                return f"{indicator}_{sex_label}_5_10.json"
            elif indicator in ("bfa", "lhfa"):
                return f"{indicator}_{sex_label}_5_19.json"
            # hcfa: no 5-19y data exists, fall through to 0-5y

        return f"{indicator}_{sex_label}_0_5.json"

    def weight_for_age_z(self, weight_kg: float, age_days: int, sex: str) -> Decimal | None:
        """
        Calculate weight-for-age Z-score.

        Valid for ages 0-3652 days (0-10 years).
        WHO stops providing weight-for-age after 10y because it is not
        meaningful during puberty.

        Args:
            weight_kg: Weight in kilograms
            age_days: Age in days
            sex: 'M' or 'F'

        Returns:
            Z-score as Decimal, or None
        """
        if age_days < 0 or age_days > 3652:
            return None

        filename = self._get_sex_filename("wfa", sex, age_days)
        data = self._load_data(filename)
        lms = self._interpolate_lms(data, "age_days", age_days)
        if lms is None:
            return None

        return self._calculate_z_score(weight_kg, *lms)

    def height_for_age_z(self, height_cm: float, age_days: int, sex: str) -> Decimal | None:
        """
        Calculate height/length-for-age Z-score.

        Uses length for children < 730 days (2 years), height for >= 730 days.
        Valid for ages 0-6940 days (0-19 years).

        Args:
            height_cm: Height or length in centimeters
            age_days: Age in days
            sex: 'M' or 'F'

        Returns:
            Z-score as Decimal, or None
        """
        if age_days < 0 or age_days > 6940:
            return None

        filename = self._get_sex_filename("lhfa", sex, age_days)
        data = self._load_data(filename)
        lms = self._interpolate_lms(data, "age_days", age_days)
        if lms is None:
            return None

        return self._calculate_z_score(height_cm, *lms)

    def weight_for_height_z(self, weight_kg: float, height_cm: float, sex: str) -> Decimal | None:
        """
        Calculate weight-for-height/length Z-score.

        Uses weight-for-length for children with length 45-110 cm (recumbent).
        Uses weight-for-height for children with height 65-120 cm (standing).

        Args:
            weight_kg: Weight in kilograms
            height_cm: Height or length in centimeters
            sex: 'M' or 'F'

        Returns:
            Z-score as Decimal, or None
        """
        sex_label = "boys" if sex.upper() == "M" else "girls"

        # Try weight-for-length first (for younger children)
        if 45 <= height_cm <= 110:
            data = self._load_data(f"wfl_{sex_label}.json")
            lms = self._interpolate_lms(data, "length", height_cm)
            if lms:
                return self._calculate_z_score(weight_kg, *lms)

        # Try weight-for-height (for older children)
        if 65 <= height_cm <= 120:
            data = self._load_data(f"wfh_{sex_label}.json")
            lms = self._interpolate_lms(data, "height", height_cm)
            if lms:
                return self._calculate_z_score(weight_kg, *lms)

        return None

    def bmi_for_age_z(self, bmi: float, age_days: int, sex: str) -> Decimal | None:
        """
        Calculate BMI-for-age Z-score.

        Valid for ages 0-6940 days (0-19 years).

        Args:
            bmi: Body Mass Index
            age_days: Age in days
            sex: 'M' or 'F'

        Returns:
            Z-score as Decimal, or None
        """
        if age_days < 0 or age_days > 6940:
            return None

        filename = self._get_sex_filename("bfa", sex, age_days)
        data = self._load_data(filename)
        lms = self._interpolate_lms(data, "age_days", age_days)
        if lms is None:
            return None

        return self._calculate_z_score(bmi, *lms)

    def head_circumference_for_age_z(self, hc_cm: float, age_days: int, sex: str) -> Decimal | None:
        """
        Calculate head-circumference-for-age Z-score.

        Valid for ages 0-1856 days (0-5 years).

        Args:
            hc_cm: Head circumference in centimeters
            age_days: Age in days
            sex: 'M' or 'F'

        Returns:
            Z-score as Decimal, or None
        """
        if age_days < 0 or age_days > 1856:
            return None

        filename = self._get_sex_filename("hcfa", sex)
        data = self._load_data(filename)
        lms = self._interpolate_lms(data, "age_days", age_days)
        if lms is None:
            return None

        return self._calculate_z_score(hc_cm, *lms)

    @staticmethod
    def classify_z_score(z: Decimal | None) -> str:
        """
        Classify nutritional status from a Z-score.

        Args:
            z: Z-score value

        Returns:
            Classification string
        """
        if z is None:
            return "UNKNOWN"

        z_float = float(z)
        if z_float < -3:
            return "SEVERE_UNDERWEIGHT"
        elif z_float < -2:
            return "MODERATE_UNDERWEIGHT"
        elif z_float < -1:
            return "MILD_UNDERWEIGHT"
        elif z_float <= 1:
            return "NORMAL"
        elif z_float <= 2:
            return "OVERWEIGHT"
        else:
            return "OBESE"

    @staticmethod
    def classify_muac(muac_cm: float, age_months: float) -> str:
        """
        Classify MUAC for children 6-59 months.

        Thresholds per WHO:
        - SAM: < 11.5 cm
        - MAM: 11.5 - 12.4 cm
        - Normal: ≥ 12.5 cm

        Args:
            muac_cm: MUAC in centimeters
            age_months: Age in months

        Returns:
            Classification string: 'SAM', 'MAM', or 'NORMAL'
        """
        if age_months < 6 or age_months > 59:
            return "NORMAL"  # MUAC classification not applicable outside 6-59 months

        if muac_cm < 11.5:
            return "SAM"
        elif muac_cm < 12.5:
            return "MAM"
        else:
            return "NORMAL"

    @staticmethod
    def get_percentile_lines(
        data: list[dict], target_key: str = "age_days"
    ) -> dict[str, list[dict]]:
        """
        Generate percentile reference lines for chart visualization.

        Returns Z-score lines at -3, -2, -1, 0, +1, +2, +3 for charting.

        Args:
            data: LMS parameter data
            target_key: Key for x-axis values

        Returns:
            Dict mapping percentile labels to lists of {x, y} points
        """
        z_scores = {
            "z_neg3": -3,
            "z_neg2": -2,
            "z_neg1": -1,
            "z_0": 0,
            "z_pos1": 1,
            "z_pos2": 2,
            "z_pos3": 3,
        }

        result = {label: [] for label in z_scores}

        for record in data:
            x = record.get(target_key)
            l = record.get("L", 0)
            m = record.get("M", 0)
            s = record.get("S", 0)

            if m <= 0 or s <= 0:
                continue

            for label, z in z_scores.items():
                try:
                    if abs(l) > 0.01:
                        y = m * (1 + l * s * z) ** (1 / l)
                    else:
                        y = m * math.exp(s * z)
                    result[label].append({"x": x, "y": round(y, 2)})
                except (ValueError, ZeroDivisionError, OverflowError):
                    pass

        return result
