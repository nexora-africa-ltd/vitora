from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

from hmis.apps.inpatient.models import Ward
from hmis.apps.patients.models import Patient


@dataclass(frozen=True)
class CompatibilityViolation:
    """Represents a single constraint violation."""

    code: str
    severity: str  # "WARNING" | "CRITICAL"
    message: str
    override_allowed: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class CompatibilityResult:
    """Result of compatibility check."""

    compatible: bool
    violations: list[CompatibilityViolation]

    @property
    def has_critical_violations(self) -> bool:
        return any(v.severity == "CRITICAL" for v in self.violations)


class WardCompatibilityService:
    """Service for checking patient-ward compatibility."""

    def check_compatibility(
        self,
        patient: Patient,
        ward: Ward,
        requires_isolation: bool = False,
        requires_oxygen: bool = False,
        requires_ventilator: bool = False,
    ) -> CompatibilityResult:
        violations: list[CompatibilityViolation] = []

        gender_violation = self._check_gender(patient, ward)
        if gender_violation:
            violations.append(gender_violation)

        age_violation = self._check_age(patient, ward)
        if age_violation:
            violations.append(age_violation)

        if requires_isolation and not ward.isolation_capable:
            violations.append(
                CompatibilityViolation(
                    code="ISOLATION_REQUIRED",
                    severity="CRITICAL",
                    message=(
                        f"Patient requires isolation but {ward.name} is not isolation-capable"
                    ),
                    override_allowed=False,
                )
            )

        if requires_oxygen and not ward.oxygen_equipped:
            violations.append(
                CompatibilityViolation(
                    code="OXYGEN_REQUIRED",
                    severity="CRITICAL",
                    message=(f"Patient requires oxygen but {ward.name} is not oxygen-equipped"),
                    override_allowed=True,
                )
            )

        if requires_ventilator and not ward.ventilator_capable:
            violations.append(
                CompatibilityViolation(
                    code="VENTILATOR_REQUIRED",
                    severity="CRITICAL",
                    message=(
                        f"Patient requires ventilator but {ward.name} is not ventilator-capable"
                    ),
                    override_allowed=False,
                )
            )

        type_violation = self._check_ward_type(patient, ward)
        if type_violation:
            violations.append(type_violation)

        return CompatibilityResult(compatible=len(violations) == 0, violations=violations)

    def _check_gender(self, patient: Patient, ward: Ward) -> CompatibilityViolation | None:
        if ward.gender_restriction == "ANY":
            return None

        patient_gender = patient.gender  # 'M', 'F', 'O'

        if ward.gender_restriction == "MALE_ONLY" and patient_gender != "M":
            return CompatibilityViolation(
                code="GENDER_MISMATCH",
                severity="WARNING",
                message=(
                    f"Ward '{ward.name}' is male-only but patient is {patient.get_gender_display()}"
                ),
                override_allowed=True,
            )

        if ward.gender_restriction == "FEMALE_ONLY" and patient_gender != "F":
            return CompatibilityViolation(
                code="GENDER_MISMATCH",
                severity="WARNING",
                message=(
                    f"Ward '{ward.name}' is female-only but patient is {patient.get_gender_display()}"
                ),
                override_allowed=True,
            )

        return None

    def _check_age(self, patient: Patient, ward: Ward) -> CompatibilityViolation | None:
        patient_age = self._calculate_age(patient.date_of_birth)

        if ward.min_age_years is not None and patient_age < ward.min_age_years:
            return CompatibilityViolation(
                code="AGE_BELOW_MIN",
                severity="WARNING",
                message=(
                    f"Patient is {patient_age} years old but ward requires minimum {ward.min_age_years} years"
                ),
                override_allowed=True,
            )

        if ward.max_age_years is not None and patient_age > ward.max_age_years:
            return CompatibilityViolation(
                code="AGE_ABOVE_MAX",
                severity="WARNING",
                message=(
                    f"Patient is {patient_age} years old but ward maximum is {ward.max_age_years} years"
                ),
                override_allowed=True,
            )

        return None

    def _check_ward_type(self, patient: Patient, ward: Ward) -> CompatibilityViolation | None:
        patient_age = self._calculate_age(patient.date_of_birth)

        if ward.ward_type == "MATERNITY" and patient.gender != "F":
            return CompatibilityViolation(
                code="MATERNITY_GENDER",
                severity="WARNING",
                message="Maternity ward is intended for female patients",
                override_allowed=True,
            )

        if ward.ward_type == "PEDIATRIC" and patient_age > 14:
            return CompatibilityViolation(
                code="PEDIATRIC_AGE",
                severity="WARNING",
                message=(
                    f"Pediatric ward is intended for patients under 15 years (patient is {patient_age})"
                ),
                override_allowed=True,
            )

        return None

    def _calculate_age(self, dob: date | str) -> int:
        if isinstance(dob, str):
            dob = date.fromisoformat(dob)

        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


ward_compatibility_service = WardCompatibilityService()
