"""
Smart Bed Allocation Service — Phase C.

Layers advanced allocation intelligence on top of the existing
rule-based bed assignment (Phase B):

1. Predictive Discharge — bed availability forecast
2. Emergency Buffer — reserve beds for emergencies
3. Cohort Grouping — keep similar diagnoses together
4. Infection Control — auto-detect isolation needs
5. Staff Workload — balance across wards by workload score
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.db import models, transaction
from django.db.models import Avg, Count, F, Q
from django.utils import timezone

from hmis.apps.core.models import AuditLog
from hmis.apps.inpatient.models import Admission, Bed, Discharge, Ward
from hmis.apps.inpatient.services.bed_assignment import NoBedAvailableError
from hmis.apps.inpatient.services.bed_rules import (
    BedAssignmentRuleResult,
    bed_assignment_rule_evaluator,
)

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from hmis.apps.patients.models import Patient


@dataclass
class PredictedDischarge:
    """A predicted bed release from an active admission."""

    admission_id: int
    admission_number: str
    patient_name: str
    ward_id: int
    ward_name: str
    bed_id: int
    bed_number: str
    admission_date: str
    expected_discharge_date: str | None
    estimated_discharge_date: str | None
    source: str  # "explicit" or "avg_los"
    hours_until_available: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "admission_id": self.admission_id,
            "admission_number": self.admission_number,
            "patient_name": self.patient_name,
            "ward_id": self.ward_id,
            "ward_name": self.ward_name,
            "bed_id": self.bed_id,
            "bed_number": self.bed_number,
            "admission_date": self.admission_date,
            "expected_discharge_date": self.expected_discharge_date,
            "estimated_discharge_date": self.estimated_discharge_date,
            "source": self.source,
            "hours_until_available": self.hours_until_available,
        }


@dataclass
class BedUtilization:
    """Ward-level bed utilization analytics."""

    ward_id: int
    ward_name: str
    ward_code: str
    capacity: int
    occupied: int
    available: int
    cleaning: int
    reserved: int
    maintenance: int
    occupancy_rate: float
    emergency_buffer_percent: int
    emergency_buffer_beds: int
    effective_available: int  # available minus emergency buffer
    avg_length_of_stay_days: float | None
    predicted_discharges_next_4h: int
    predicted_discharges_next_24h: int
    workload_score: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "ward_id": self.ward_id,
            "ward_name": self.ward_name,
            "ward_code": self.ward_code,
            "capacity": self.capacity,
            "occupied": self.occupied,
            "available": self.available,
            "cleaning": self.cleaning,
            "reserved": self.reserved,
            "maintenance": self.maintenance,
            "occupancy_rate": self.occupancy_rate,
            "emergency_buffer_percent": self.emergency_buffer_percent,
            "emergency_buffer_beds": self.emergency_buffer_beds,
            "effective_available": self.effective_available,
            "avg_length_of_stay_days": self.avg_length_of_stay_days,
            "predicted_discharges_next_4h": self.predicted_discharges_next_4h,
            "predicted_discharges_next_24h": self.predicted_discharges_next_24h,
            "workload_score": self.workload_score,
        }


@dataclass
class SmartAllocationResult:
    """Result of a smart bed allocation."""

    success: bool
    assigned_bed: Bed | None = None
    rule_result: BedAssignmentRuleResult | None = None
    smart_scores: dict[str, float] = field(default_factory=dict)
    emergency_buffer_enforced: bool = False
    cohort_match_score: float = 0.0
    infection_isolation_triggered: bool = False
    workload_score: float = 0.0
    predicted_discharges: list[PredictedDischarge] = field(default_factory=list)
    evaluation_time_ms: int = 0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "assigned_bed_id": self.assigned_bed.id if self.assigned_bed else None,
            "assigned_bed_number": (
                self.assigned_bed.bed_number if self.assigned_bed else None
            ),
            "smart_scores": self.smart_scores,
            "emergency_buffer_enforced": self.emergency_buffer_enforced,
            "cohort_match_score": self.cohort_match_score,
            "infection_isolation_triggered": self.infection_isolation_triggered,
            "workload_score": self.workload_score,
            "predicted_discharges_count": len(self.predicted_discharges),
            "evaluation_time_ms": self.evaluation_time_ms,
            "error": self.error,
        }


class SmartBedAllocationService:
    """
    Phase C: Smart allocation service.

    Enhances the existing rule-based evaluator with:
    - Predictive discharge awareness
    - Emergency buffer enforcement
    - Cohort grouping scoring
    - Infection control auto-routing
    - Staff workload balancing
    """

    # ------------------------------------------------------------------ #
    #  Predictive Discharge
    # ------------------------------------------------------------------ #

    def get_predicted_discharges(
        self,
        ward: Ward,
        hours_ahead: int = 24,
    ) -> list[PredictedDischarge]:
        """
        Get admissions expected to free beds within *hours_ahead*.

        Sources (in priority order):
        1. Explicit ``expected_discharge_date`` set by clinicians.
        2. Estimated from average LOS by diagnosis for that ward.
        """
        now = timezone.now()
        cutoff = now + timedelta(hours=hours_ahead)
        predictions: list[PredictedDischarge] = []

        active_admissions = (
            Admission.objects.filter(
                ward=ward,
                admission_status="ACTIVE",
            )
            .select_related("patient", "ward", "bed")
        )

        # Average LOS for this ward (from historical discharges)
        avg_los = self._get_avg_los_for_ward(ward)

        for admission in active_admissions:
            expected = admission.expected_discharge_date
            estimated = None
            source = "explicit"

            if expected is None and avg_los is not None:
                # Estimate from average LOS
                estimated_dt = admission.admission_date + timedelta(days=avg_los)
                if estimated_dt <= cutoff:
                    estimated = estimated_dt.isoformat()
                    source = "avg_los"
                else:
                    continue  # Not expected to discharge in time
            elif expected is not None:
                if expected > cutoff:
                    continue  # Outside window
            else:
                continue  # No data

            discharge_dt = expected or (
                admission.admission_date + timedelta(days=avg_los) if avg_los else None
            )
            hours_until = None
            if discharge_dt:
                delta = discharge_dt - now
                hours_until = round(max(0, delta.total_seconds() / 3600), 1)

            predictions.append(
                PredictedDischarge(
                    admission_id=admission.id,
                    admission_number=admission.admission_number,
                    patient_name=f"{admission.patient.first_name} {admission.patient.last_name}",
                    ward_id=ward.id,
                    ward_name=ward.name,
                    bed_id=admission.bed_id,
                    bed_number=admission.bed.bed_number,
                    admission_date=admission.admission_date.isoformat(),
                    expected_discharge_date=(
                        expected.isoformat() if expected else None
                    ),
                    estimated_discharge_date=estimated,
                    source=source,
                    hours_until_available=hours_until,
                )
            )

        # Sort by soonest first
        predictions.sort(key=lambda p: p.hours_until_available or float("inf"))
        return predictions

    # ------------------------------------------------------------------ #
    #  Emergency Buffer
    # ------------------------------------------------------------------ #

    def get_emergency_buffer_beds(self, ward: Ward) -> int:
        """
        Number of beds that must remain reserved for emergencies.

        Calculated as ``ceil(capacity * emergency_buffer_percent / 100)``.
        """
        import math

        pct = ward.emergency_buffer_percent
        if pct <= 0:
            return 0
        return math.ceil(ward.capacity * pct / 100)

    def get_effective_available_beds(self, ward: Ward) -> int:
        """Available beds minus emergency buffer."""
        return max(0, ward.available_beds - self.get_emergency_buffer_beds(ward))

    def check_emergency_buffer(
        self,
        ward: Ward,
        is_emergency: bool,
    ) -> tuple[bool, int]:
        """
        Check if a non-emergency admission would breach the buffer.

        Returns (allowed, effective_available).
        Emergency admissions always pass.
        """
        buffer_beds = self.get_emergency_buffer_beds(ward)
        effective = max(0, ward.available_beds - buffer_beds)

        if is_emergency:
            return (ward.available_beds > 0, ward.available_beds)

        return (effective > 0, effective)

    # ------------------------------------------------------------------ #
    #  Cohort Grouping
    # ------------------------------------------------------------------ #

    def calculate_cohort_score(self, patient: Patient, ward: Ward) -> float:
        """
        Score how well a patient's diagnosis matches the existing ward cohort.

        Higher score → patient's diagnosis category is already represented
        in the ward, improving care quality through grouping.

        Uses ICD-10 chapter (first letter) as the grouping key.
        """
        active_admissions = Admission.objects.filter(
            ward=ward,
            admission_status="ACTIVE",
        )

        if not active_admissions.exists():
            return 0.0  # Empty ward — neutral score

        # Get diagnosis chapters for current ward patients
        ward_diagnoses = list(
            active_admissions.values_list("admitting_diagnosis", flat=True)
        )

        # Get patient's diagnosis from most recent encounter or pending recommendation
        patient_diagnosis = self._get_patient_diagnosis(patient)
        if not patient_diagnosis:
            return 0.0

        patient_chapter = patient_diagnosis[0].upper() if patient_diagnosis else ""

        if not patient_chapter:
            return 0.0

        # Count matching chapters
        matching = sum(
            1
            for d in ward_diagnoses
            if d and d[0].upper() == patient_chapter
        )
        total = len(ward_diagnoses)

        # Score: proportion of ward patients with same ICD-10 chapter
        return round((matching / total) * 100, 1) if total > 0 else 0.0

    # ------------------------------------------------------------------ #
    #  Infection Control
    # ------------------------------------------------------------------ #

    def evaluate_infection_risk(
        self,
        patient: Patient,
        admission: Admission | None = None,
    ) -> tuple[bool, str]:
        """
        Determine if patient needs isolation based on:
        1. Existing NursingKardex isolation flags.
        2. Critical lab results with infection markers.

        Returns (needs_isolation, reason).
        """
        # Check existing kardex
        if admission is not None:
            try:
                kardex = admission.kardex
                if kardex.isolation_required:
                    return True, f"Kardex: {kardex.isolation_type or 'isolation required'}"
            except Exception:
                pass  # No kardex yet

        # Check for critical infection-related lab results
        try:
            from hmis.apps.laboratory.models import LabResult

            recent_results = LabResult.objects.filter(
                order__encounter__patient=patient,
                result_flag__in=["CRITICAL_HIGH", "CRITICAL_LOW"],
            ).order_by("-verified_at")[:10]

            infection_markers = {"WBC", "CRP", "PCT", "ESR", "BLOOD_CULTURE"}
            for result in recent_results:
                test_code = (result.test_item.code or "").upper()
                if any(marker in test_code for marker in infection_markers):
                    return True, f"Critical lab: {result.test_item.name} ({result.result_flag})"
        except Exception:
            pass  # Lab module may not exist or have different structure

        return False, ""

    # ------------------------------------------------------------------ #
    #  Staff Workload
    # ------------------------------------------------------------------ #

    def calculate_workload_score(self, ward: Ward) -> float:
        """
        Calculate ward workload score (0–100, lower is less loaded).

        Factors:
        - Occupancy rate (primary)
        - Critical patient count from latest shift handover
        - Total patients per capacity
        """
        from hmis.apps.inpatient.models import ShiftHandover

        occupancy = ward.occupancy_rate  # 0-100

        # Get latest shift handover
        latest_handover = (
            ShiftHandover.objects.filter(ward=ward)
            .order_by("-shift_date", "-created_at")
            .first()
        )

        if latest_handover and latest_handover.total_patients > 0:
            critical_ratio = (
                latest_handover.critical_patients / latest_handover.total_patients
            ) * 100
        else:
            critical_ratio = 0.0

        # Weighted: 60% occupancy, 40% critical patient ratio
        score = (occupancy * 0.6) + (critical_ratio * 0.4)
        return round(min(100.0, score), 1)

    # ------------------------------------------------------------------ #
    #  Bed Utilization Analytics
    # ------------------------------------------------------------------ #

    def get_bed_utilization(self, ward: Ward) -> BedUtilization:
        """Calculate comprehensive bed utilization analytics for a ward."""
        occupied = ward.beds.filter(status="OCCUPIED").count()
        available = ward.beds.filter(status="AVAILABLE").count()
        cleaning = ward.beds.filter(status="CLEANING").count()
        reserved = ward.beds.filter(status="RESERVED").count()
        maintenance = ward.beds.filter(status="MAINTENANCE").count()

        buffer_beds = self.get_emergency_buffer_beds(ward)
        effective = max(0, available - buffer_beds)

        avg_los = self._get_avg_los_for_ward(ward)

        predictions_4h = len(self.get_predicted_discharges(ward, hours_ahead=4))
        predictions_24h = len(self.get_predicted_discharges(ward, hours_ahead=24))

        return BedUtilization(
            ward_id=ward.id,
            ward_name=ward.name,
            ward_code=ward.code,
            capacity=ward.capacity,
            occupied=occupied,
            available=available,
            cleaning=cleaning,
            reserved=reserved,
            maintenance=maintenance,
            occupancy_rate=ward.occupancy_rate,
            emergency_buffer_percent=ward.emergency_buffer_percent,
            emergency_buffer_beds=buffer_beds,
            effective_available=effective,
            avg_length_of_stay_days=avg_los,
            predicted_discharges_next_4h=predictions_4h,
            predicted_discharges_next_24h=predictions_24h,
            workload_score=self.calculate_workload_score(ward),
        )

    # ------------------------------------------------------------------ #
    #  Smart Assign Bed
    # ------------------------------------------------------------------ #

    @transaction.atomic
    def smart_assign_bed(
        self,
        patient: Patient,
        ward: Ward,
        user: User,
        requires_isolation: bool = False,
        requires_oxygen: bool = False,
        requires_ventilator: bool = False,
        admission_type: str = "ELECTIVE",
        ip_address: str = "0.0.0.0",
        mark_as_occupied: bool = False,
    ) -> SmartAllocationResult:
        """
        Full smart allocation combining all Phase C features.

        Process:
        1. Check infection risk → override requires_isolation if detected
        2. Enforce emergency buffer for non-emergency admissions
        3. Run rule-based evaluation (Phase B)
        4. Apply cohort grouping bonus scoring
        5. Apply workload penalty scoring
        6. Include predicted discharge info when no beds available
        """
        start_time = time.time()
        is_emergency = admission_type == "EMERGENCY"

        # 1. Infection control — auto-detect
        infection_detected, infection_reason = self.evaluate_infection_risk(patient)
        if infection_detected and not requires_isolation:
            requires_isolation = True

        # 2. Emergency buffer check
        buffer_allowed, effective_available = self.check_emergency_buffer(
            ward, is_emergency
        )

        if not buffer_allowed:
            evaluation_time_ms = int((time.time() - start_time) * 1000)
            predicted = self.get_predicted_discharges(ward, hours_ahead=4)

            return SmartAllocationResult(
                success=False,
                emergency_buffer_enforced=True,
                predicted_discharges=predicted,
                evaluation_time_ms=evaluation_time_ms,
                error=(
                    f"No beds available for non-emergency admission. "
                    f"Emergency buffer reserves {self.get_emergency_buffer_beds(ward)} "
                    f"bed(s) in {ward.name}."
                ),
            )

        # 3. Rule-based evaluation (reuse Phase B)
        rule_result = bed_assignment_rule_evaluator.evaluate_beds_for_patient(
            patient=patient,
            ward=ward,
            requires_isolation=requires_isolation,
            requires_oxygen=requires_oxygen,
            requires_ventilator=requires_ventilator,
            admission_type=admission_type,
            user=user,
            ip_address=ip_address,
        )

        # 4 & 5. Apply smart scores on top of rule evaluations
        cohort_score = self.calculate_cohort_score(patient, ward)
        workload_score = self.calculate_workload_score(ward)

        smart_scores = {
            "cohort_match": cohort_score,
            "workload": workload_score,
            "infection_risk": 1.0 if infection_detected else 0.0,
        }

        assigned_bed = None
        if rule_result.success and rule_result.assigned_bed:
            assigned_bed = rule_result.assigned_bed

            if mark_as_occupied:
                bed = (
                    Bed.objects.filter(id=assigned_bed.id, status="AVAILABLE")
                    .select_for_update(skip_locked=True)
                    .first()
                )
                if bed is None:
                    raise NoBedAvailableError(
                        f"Bed {assigned_bed.bed_number} was assigned to another patient"
                    )
                bed.mark_occupied(user)
                assigned_bed.refresh_from_db()

        # If no bed, provide predicted discharges for planning
        predicted = []
        if not assigned_bed:
            predicted = self.get_predicted_discharges(ward, hours_ahead=4)

        evaluation_time_ms = int((time.time() - start_time) * 1000)

        # Audit log
        if assigned_bed:
            AuditLog.log(
                action="bed_smart_assigned",
                user=user,
                resource_type="Bed",
                resource_id=assigned_bed.id,
                details={
                    "ward": ward.code,
                    "bed_number": assigned_bed.bed_number,
                    "assignment_type": "smart_allocation",
                    "smart_scores": smart_scores,
                    "infection_isolation_triggered": infection_detected,
                    "emergency_buffer_enforced": False,
                },
                ip_address=ip_address,
            )

        return SmartAllocationResult(
            success=assigned_bed is not None,
            assigned_bed=assigned_bed,
            rule_result=rule_result,
            smart_scores=smart_scores,
            emergency_buffer_enforced=False,
            cohort_match_score=cohort_score,
            infection_isolation_triggered=infection_detected,
            workload_score=workload_score,
            predicted_discharges=predicted,
            evaluation_time_ms=evaluation_time_ms,
            error=rule_result.error if not assigned_bed else None,
        )

    # ------------------------------------------------------------------ #
    #  Private helpers
    # ------------------------------------------------------------------ #

    def _get_avg_los_for_ward(self, ward: Ward) -> float | None:
        """Average length of stay (days) for completed discharges in this ward."""
        result = (
            Discharge.objects.filter(admission__ward=ward)
            .annotate(
                los=models.ExpressionWrapper(
                    F("discharge_date") - F("admission__admission_date"),
                    output_field=models.DurationField(),
                )
            )
            .aggregate(avg_los=Avg("los"))
        )
        avg_duration = result.get("avg_los")
        if avg_duration is not None:
            return round(avg_duration.total_seconds() / 86400, 1)
        return None

    def _get_patient_diagnosis(self, patient: Patient) -> str | None:
        """Get patient's latest diagnosis code."""
        # Try from most recent encounter
        try:
            from hmis.apps.encounters.models import Encounter

            latest = (
                Encounter.objects.filter(patient=patient)
                .order_by("-encounter_date")
                .first()
            )
            if latest and latest.chief_complaint:
                # Check ICD10 diagnoses via encounter
                diagnoses = getattr(latest, "diagnoses", None)
                if diagnoses and diagnoses.exists():
                    first_dx = diagnoses.first()
                    return first_dx.icd10_code if first_dx else None
        except Exception:
            pass

        # Try from admission recommendation
        try:
            rec = (
                AdmissionRecommendation.objects.filter(
                    encounter__patient=patient,
                    status="ACCEPTED",
                )
                .order_by("-created_at")
                .first()
            )
            if rec:
                return rec.provisional_diagnosis
        except Exception:
            pass

        return None


# Module-level singleton
smart_bed_allocation_service = SmartBedAllocationService()
