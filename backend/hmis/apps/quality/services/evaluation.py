# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Automated CQM Evaluation Engine for Vitora HMIS.

Evaluates quality measures against actual clinical data using structured
evaluation rules stored on QualityMeasure.evaluation_rule.

Supported rule types:
- bp_control: Blood pressure control (e.g., BP < 140/90 for HTN patients)
- lab_threshold: Lab result threshold (e.g., HbA1c < 7%, VL < 1000)
- wait_time: Patient waiting time percentile (e.g., seen within 30 min)
- visit_count: Minimum visit count (e.g., ANC 4+ visits)
- enrollment_active: Active enrollment rate (e.g., defaulter rate)
- stock_availability: Medicine stock-out tracking
- skilled_birth_attendance: Deliveries with documented skilled attendant
- tb_treatment_success: TB cohort treatment success using enrollment outcomes
- immunization_completeness: Under-5 KEPI schedule completeness in period
- maternal_mortality_ratio: Maternal deaths per live births (scaled ratio)
- idsr_timeliness: Weekly IDSR reports submitted by deadline

Each rule type has a corresponding evaluator function that returns
(numerator, denominator, notes) for a given clinic and reporting period.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Count, Q

logger = logging.getLogger(__name__)


@dataclass
class EvaluationResult:
    """Result of evaluating a single quality measure."""

    numerator: int
    denominator: int
    notes: str = ""

    @property
    def percentage(self) -> Decimal:
        if self.denominator == 0:
            return Decimal("0.00")
        return Decimal(str(self.numerator / self.denominator * 100)).quantize(Decimal("0.01"))


def get_period_date_range(year: int, period: int, period_type: str) -> tuple[date, date]:
    """Get (start_date, end_date) for a reporting period."""
    if period_type == "MONTHLY":
        start = date(year, period, 1)
        if period == 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, period + 1, 1) - timedelta(days=1)
    elif period_type == "QUARTERLY":
        start_month = (period - 1) * 3 + 1
        start = date(year, start_month, 1)
        end_month = start_month + 3
        if end_month > 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, end_month, 1) - timedelta(days=1)
    else:  # ANNUAL
        start = date(year, 1, 1)
        end = date(year, 12, 31)
    return start, end


# =============================================================================
# Evaluator: Blood Pressure Control
# =============================================================================


def evaluate_bp_control(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """
    Evaluate blood pressure control measure.

    Rule params:
        systolic_max: int (default 140)
        diastolic_max: int (default 90)
        clinic_types: list[str] (e.g., ["HYPERTENSION"])
        enrollment_required: bool (default True)

    Denominator: Active enrolled patients with at least one encounter in period
    Numerator: Those with last BP below threshold
    """
    from hmis.apps.clinics.models import ClinicEnrollment
    from hmis.apps.encounters.models import Encounter

    systolic_max = params.get("systolic_max", 140)
    diastolic_max = params.get("diastolic_max", 90)

    # Get active enrollments for this clinic
    enrollments = ClinicEnrollment.objects.filter(
        clinic_id=clinic_id,
        status="ACTIVE",
    ).values_list("patient_id", flat=True)

    if not enrollments:
        return EvaluationResult(0, 0, "No active enrollments found")

    # Get encounters in period for enrolled patients
    encounters_in_period = Encounter.objects.filter(
        patient_id__in=enrollments,
        encounter_date__gte=start_date,
        encounter_date__lte=end_date,
    ).exclude(blood_pressure="")

    # Get distinct patients with BP readings in period
    patients_with_bp = (
        encounters_in_period.values("patient_id")
        .annotate(visit_count=Count("id"))
        .filter(visit_count__gte=1)
    )
    denominator = patients_with_bp.count()

    if denominator == 0:
        return EvaluationResult(0, 0, "No patients with BP readings in period")

    # Check last BP for each patient
    numerator = 0
    for patient_data in patients_with_bp:
        pid = patient_data["patient_id"]
        last_encounter = (
            encounters_in_period.filter(patient_id=pid)
            .exclude(blood_pressure="")
            .order_by("-encounter_date")
            .first()
        )
        if last_encounter and last_encounter.blood_pressure:
            try:
                parts = last_encounter.blood_pressure.split("/")
                systolic = int(parts[0].strip())
                diastolic = int(parts[1].strip())
                if systolic < systolic_max and diastolic < diastolic_max:
                    numerator += 1
            except (ValueError, IndexError):
                continue

    return EvaluationResult(
        numerator, denominator, f"BP < {systolic_max}/{diastolic_max} in last encounter"
    )


# =============================================================================
# Evaluator: Lab Result Threshold
# =============================================================================


def evaluate_lab_threshold(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """
    Evaluate lab result threshold measure.

    Rule params:
        test_name: str (e.g., "HbA1c", "Viral Load")
        test_code: str (optional LOINC code)
        threshold: float (e.g., 7.0 for HbA1c, 1000 for VL)
        comparison: str ("lt", "lte", "gt", "gte") - default "lt"
        clinic_types: list[str]

    Denominator: Enrolled patients with the specified test result in period
    Numerator: Those meeting the threshold criteria
    """
    from hmis.apps.clinics.models import ClinicEnrollment
    from hmis.apps.laboratory.models import LabResult

    test_name = params.get("test_name", "")
    test_code = params.get("test_code", "")
    threshold = params.get("threshold", 0)
    comparison = params.get("comparison", "lt")

    # Get active enrollments
    enrollments = ClinicEnrollment.objects.filter(
        clinic_id=clinic_id,
        status="ACTIVE",
    ).values_list("patient_id", flat=True)

    if not enrollments:
        return EvaluationResult(0, 0, "No active enrollments found")

    # Build lab result filter
    lab_filter = Q(
        order_item__lab_order__patient_id__in=enrollments,
        entered_at__date__gte=start_date,
        entered_at__date__lte=end_date,
        verification_status="VERIFIED",
        numeric_value__isnull=False,
    )
    if test_code:
        lab_filter &= Q(order_item__test__loinc_code=test_code)
    elif test_name:
        lab_filter &= Q(order_item__test__name__icontains=test_name)

    results = LabResult.objects.filter(lab_filter)

    # Get distinct patients with results
    patient_results = results.values("order_item__lab_order__patient_id").annotate(
        result_count=Count("id")
    )
    denominator = patient_results.count()

    if denominator == 0:
        return EvaluationResult(0, 0, f"No verified {test_name or test_code} results in period")

    # Check latest result per patient against threshold
    numerator = 0
    for pr in patient_results:
        pid = pr["order_item__lab_order__patient_id"]
        latest = (
            results.filter(order_item__lab_order__patient_id=pid)
            .order_by("-entered_at")
            .values_list("numeric_value", flat=True)
            .first()
        )
        if latest is not None and (
            comparison == "lt"
            and latest < threshold
            or comparison == "lte"
            and latest <= threshold
            or comparison == "gt"
            and latest > threshold
            or comparison == "gte"
            and latest >= threshold
        ):
            numerator += 1

    comp_label = {"lt": "<", "lte": "≤", "gt": ">", "gte": "≥"}.get(comparison, comparison)
    return EvaluationResult(
        numerator, denominator, f"Latest {test_name or test_code} {comp_label} {threshold}"
    )


# =============================================================================
# Evaluator: Wait Time
# =============================================================================


def evaluate_wait_time(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """
    Evaluate patient waiting time measure.

    Rule params:
        max_minutes: int (default 30)
        data_source: str ("clinic_visit" [default] | "triage_assessment")

    clinic_visit source:
      Denominator: Completed visits in period with both registered_at and consultation_started_at
      Numerator: Those where wait time <= max_minutes

    triage_assessment source:
      Denominator: Triage assessments in period with arrival_time and triage_start_time
      Numerator: Those where triage wait <= max_minutes
    """
    max_minutes = params.get("max_minutes", 30)
    data_source = params.get("data_source", "clinic_visit")

    if data_source == "triage_assessment":
        from hmis.apps.triage.models import TriageAssessment

        assessments = TriageAssessment.objects.filter(
            assigned_clinic_id=clinic_id,
            arrival_time__date__gte=start_date,
            arrival_time__date__lte=end_date,
            triage_start_time__isnull=False,
        )

        denominator = assessments.count()
        if denominator == 0:
            return EvaluationResult(0, 0, "No triage assessments with timing data")

        numerator = 0
        for assessment in assessments.only("arrival_time", "triage_start_time"):
            wait = (assessment.triage_start_time - assessment.arrival_time).total_seconds() / 60
            if wait <= max_minutes:
                numerator += 1

        return EvaluationResult(
            numerator, denominator, f"Triage started within {max_minutes} minutes"
        )

    from hmis.apps.clinics.models import ClinicVisit

    visits = ClinicVisit.objects.filter(
        session__clinic_id=clinic_id,
        status="COMPLETED",
        registered_at__date__gte=start_date,
        registered_at__date__lte=end_date,
        consultation_started_at__isnull=False,
    )

    denominator = visits.count()
    if denominator == 0:
        return EvaluationResult(0, 0, "No completed visits with timing data")

    # Count visits within threshold
    numerator = 0
    for visit in visits.only("registered_at", "consultation_started_at"):
        wait = (visit.consultation_started_at - visit.registered_at).total_seconds() / 60
        if wait <= max_minutes:
            numerator += 1

    return EvaluationResult(numerator, denominator, f"Seen within {max_minutes} minutes")


# =============================================================================
# Evaluator: Visit Count (e.g., ANC 4+ visits)
# =============================================================================


def evaluate_visit_count(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """
    Evaluate minimum visit count measure.

    Rule params:
        min_visits: int (default 4)
        enrollment_status: str (default "ACTIVE") - or "ANY"

    Denominator: Patients enrolled in clinic during period
    Numerator: Those with >= min_visits completed visits in period
    """
    from hmis.apps.clinics.models import ClinicEnrollment, ClinicVisit

    min_visits = params.get("min_visits", 4)
    enrollment_status = params.get("enrollment_status", "ACTIVE")

    enrollment_filter = Q(clinic_id=clinic_id)
    if enrollment_status != "ANY":
        enrollment_filter &= Q(status=enrollment_status)

    enrolled_patients = ClinicEnrollment.objects.filter(enrollment_filter).values_list(
        "patient_id", flat=True
    )

    denominator = len(set(enrolled_patients))
    if denominator == 0:
        return EvaluationResult(0, 0, "No enrolled patients")

    # Count visits per patient in period
    visit_counts = (
        ClinicVisit.objects.filter(
            session__clinic_id=clinic_id,
            patient_id__in=enrolled_patients,
            status="COMPLETED",
            registered_at__date__gte=start_date,
            registered_at__date__lte=end_date,
        )
        .values("patient_id")
        .annotate(visit_count=Count("id"))
    )

    numerator = sum(1 for vc in visit_counts if vc["visit_count"] >= min_visits)

    return EvaluationResult(numerator, denominator, f"Patients with >= {min_visits} visits")


# =============================================================================
# Evaluator: Enrollment Active (Defaulter Rate)
# =============================================================================


def evaluate_enrollment_active(
    clinic_id: int,
    start_date: date,  # noqa: ARG001
    end_date: date,  # noqa: ARG001
    params: dict[str, Any],  # noqa: ARG001
) -> EvaluationResult:
    """
    Evaluate active enrollment rate (inverse of defaulter rate).

    Rule params:
        target_status: str (default "ACTIVE")
        missed_threshold_days: int (days since last visit to be "defaulter")

    Denominator: All enrolled patients (ACTIVE + DEFAULTED)
    Numerator: Those who are still active (not defaulted)
    """
    from hmis.apps.clinics.models import ClinicEnrollment

    total = ClinicEnrollment.objects.filter(
        clinic_id=clinic_id,
        status__in=["ACTIVE", "DEFAULTED"],
    ).count()

    active = ClinicEnrollment.objects.filter(
        clinic_id=clinic_id,
        status="ACTIVE",
    ).count()

    if total == 0:
        return EvaluationResult(0, 0, "No enrollments")

    return EvaluationResult(active, total, "Active vs defaulted enrollments")


# =============================================================================
# Evaluator: Stock Availability
# =============================================================================


def evaluate_stock_availability(
    clinic_id: int,
    start_date: date,
    end_date: date,
    params: dict[str, Any],  # noqa: ARG001
) -> EvaluationResult:
    """
    Evaluate medicine stock-out rate.

    Rule params:
        tracer_only: bool (default True) - only count tracer medicines
        stock_out_threshold: int (default 0) - quantity below which = stock-out

    Denominator: Total tracer medicines being tracked
    Numerator: Those that DID NOT experience a stock-out (inverted for "availability")

    Note: For stock-out RATE measures (target is LOW, e.g., 5%), this returns
    the stock-out count as numerator. The measure's target_percentage should
    be set accordingly (e.g., target < 5% stock-outs means low_threshold=20).
    """
    from hmis.apps.pharmacy.models import StockAlert

    # Stock alerts for this facility's clinic
    alerts = StockAlert.objects.filter(
        facility_id=clinic_id,  # StockAlert uses facility FK
        alert_type="STOCK_OUT",
        created_at__date__gte=start_date,
        created_at__date__lte=end_date,
    )

    # Count unique items that had stock-outs
    items_with_stockout = alerts.values("drug").distinct().count()

    # Total tracked items (from StockBatch with this facility)
    from hmis.apps.pharmacy.models import StockBatch

    total_items = StockBatch.objects.filter(facility_id=clinic_id).values("drug").distinct().count()

    if total_items == 0:
        return EvaluationResult(0, 0, "No tracked stock items")

    # Return stock-out count as numerator (measure target should be LOW)
    return EvaluationResult(
        items_with_stockout, total_items, f"{items_with_stockout} items stocked out"
    )


# =============================================================================
# Evaluator: Skilled Birth Attendance
# =============================================================================


def evaluate_skilled_birth_attendance(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """Evaluate skilled birth attendance among facility deliveries.

    Rule params:
        require_documented_attendant: bool (default True)
        delivery_status: str (default "COMPLETED")
        include_outcomes: list[str] (default ["LIVE_BIRTH", "STILLBIRTH", "NEONATAL_DEATH"])
    """
    from hmis.apps.clinics.models import Clinic
    from hmis.apps.mch.models import Delivery

    clinic = Clinic.objects.filter(pk=clinic_id).only("facility_id").first()
    facility_id = clinic.facility_id if clinic else None
    if not facility_id:
        return EvaluationResult(0, 0, "Clinic has no facility mapping")

    require_documented_attendant = bool(params.get("require_documented_attendant", True))
    delivery_status = str(params.get("delivery_status", "COMPLETED"))
    include_outcomes = params.get("include_outcomes") or [
        "LIVE_BIRTH",
        "STILLBIRTH",
        "NEONATAL_DEATH",
    ]

    deliveries = Delivery.objects.filter(
        registration__facility_id=facility_id,
        delivery_date__gte=start_date,
        delivery_date__lte=end_date,
    )

    if delivery_status:
        deliveries = deliveries.filter(status=delivery_status)

    if include_outcomes:
        deliveries = deliveries.filter(delivery_outcome__in=include_outcomes)

    denominator = deliveries.count()
    if denominator == 0:
        return EvaluationResult(0, 0, "No eligible deliveries found")

    if require_documented_attendant:
        numerator = deliveries.exclude(delivered_by__isnull=True).count()
        notes = "Deliveries with documented skilled attendant"
    else:
        numerator = denominator
        notes = "All eligible deliveries counted as skilled attendance"

    return EvaluationResult(numerator, denominator, notes)


# =============================================================================
# Evaluator: TB Treatment Success
# =============================================================================


def evaluate_tb_treatment_success(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """Evaluate TB treatment success from enrollment outcomes.

    Rule params:
        success_statuses: list[str] (default ["COMPLETED"])
        success_keywords: list[str] (default treatment success keywords)
        use_outcome_reason: bool (default True)
        require_outcome_date: bool (default True)
        cohort_statuses: list[str] (default treatment-closed statuses)
    """
    from hmis.apps.clinics.models import ClinicEnrollment

    success_statuses = set(params.get("success_statuses") or ["COMPLETED"])
    success_keywords = [
        str(item).strip().lower()
        for item in (params.get("success_keywords") or ["cured", "treatment complete", "completed"])
        if str(item).strip()
    ]
    use_outcome_reason = bool(params.get("use_outcome_reason", True))
    require_outcome_date = bool(params.get("require_outcome_date", True))
    cohort_statuses = params.get("cohort_statuses") or [
        "COMPLETED",
        "TRANSFERRED_OUT",
        "LOST_TO_FOLLOW_UP",
        "DECEASED",
        "SUSPENDED",
    ]

    cohort = ClinicEnrollment.objects.filter(clinic_id=clinic_id, status__in=cohort_statuses)
    if require_outcome_date:
        cohort = cohort.filter(
            outcome_date__isnull=False,
            outcome_date__gte=start_date,
            outcome_date__lte=end_date,
        )

    denominator = cohort.count()
    if denominator == 0:
        return EvaluationResult(0, 0, "No TB cohort outcomes in period")

    success_query = Q(status__in=success_statuses)
    if use_outcome_reason and success_keywords:
        reason_query = Q()
        for keyword in success_keywords:
            reason_query |= Q(outcome_reason__icontains=keyword)
        success_query |= reason_query

    numerator = cohort.filter(success_query).count()
    return EvaluationResult(numerator, denominator, "TB treatment outcomes marked as success")


# =============================================================================
# Evaluator: Immunization Completeness
# =============================================================================


def evaluate_immunization_completeness(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """Evaluate under-5 immunization completeness for due KEPI doses.

    Rule params:
        vaccine_program: str (default "KEPI")
        max_patient_age_years: int (default 5)
        strict_due_in_period: bool (default True)
    """
    from hmis.apps.clinics.models import Clinic
    from hmis.apps.immunizations.models import ImmunizationRecord

    clinic = Clinic.objects.filter(pk=clinic_id).only("facility_id").first()
    facility_id = clinic.facility_id if clinic else None
    if not facility_id:
        return EvaluationResult(0, 0, "Clinic has no facility mapping")

    vaccine_program = str(params.get("vaccine_program", "KEPI"))
    max_patient_age_years = int(params.get("max_patient_age_years", 5) or 5)
    strict_due_in_period = bool(params.get("strict_due_in_period", True))

    due_filter = Q(
        facility_id=facility_id,
        vaccine__program=vaccine_program,
    )
    if strict_due_in_period:
        due_filter &= Q(scheduled_date__gte=start_date, scheduled_date__lte=end_date)
    else:
        due_filter &= Q(scheduled_date__lte=end_date)

    if max_patient_age_years > 0:
        cutoff_birth_date = end_date - timedelta(days=max_patient_age_years * 365)
        due_filter &= Q(patient__date_of_birth__gte=cutoff_birth_date)

    due_records = ImmunizationRecord.objects.filter(due_filter)
    per_patient = due_records.values("patient_id").annotate(
        total_due=Count("id"),
        total_administered=Count("id", filter=Q(status="ADMINISTERED")),
    )
    denominator = per_patient.count()
    if denominator == 0:
        return EvaluationResult(0, 0, "No due immunization records found")

    numerator = sum(
        1
        for row in per_patient
        if int(row.get("total_due") or 0) > 0
        and int(row.get("total_due") or 0) == int(row.get("total_administered") or 0)
    )
    return EvaluationResult(numerator, denominator, "Patients complete for due immunization doses")


# =============================================================================
# Evaluator: Maternal Mortality Ratio
# =============================================================================


def evaluate_maternal_mortality_ratio(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """Evaluate maternal mortality ratio using delivery outcomes.

    Rule params:
        ratio_multiplier: int (default 100000)
        delivery_status: str (default "COMPLETED")
    """
    from hmis.apps.clinics.models import Clinic
    from hmis.apps.mch.models import Delivery

    clinic = Clinic.objects.filter(pk=clinic_id).only("facility_id").first()
    facility_id = clinic.facility_id if clinic else None
    if not facility_id:
        return EvaluationResult(0, 0, "Clinic has no facility mapping")

    ratio_multiplier = int(params.get("ratio_multiplier", 100000) or 100000)
    delivery_status = str(params.get("delivery_status", "COMPLETED"))

    base_qs = Delivery.objects.filter(
        registration__facility_id=facility_id,
        delivery_date__gte=start_date,
        delivery_date__lte=end_date,
    )
    if delivery_status:
        base_qs = base_qs.filter(status=delivery_status)

    maternal_deaths = base_qs.filter(delivery_outcome="MATERNAL_DEATH").count()
    live_births = base_qs.filter(delivery_outcome="LIVE_BIRTH").count()

    if live_births == 0:
        return EvaluationResult(0, 0, "No live births in period")

    scaled_numerator = maternal_deaths * ratio_multiplier
    return EvaluationResult(
        scaled_numerator,
        live_births,
        f"Maternal deaths per {ratio_multiplier} live births",
    )


# =============================================================================
# Evaluator: IDSR Reporting Timeliness
# =============================================================================


def evaluate_idsr_timeliness(
    clinic_id: int, start_date: date, end_date: date, params: dict[str, Any]
) -> EvaluationResult:
    """Evaluate IDSR weekly report timeliness.

    Rule params:
        submission_statuses: list[str] (default ["SUBMITTED"])
        include_approved: bool (default False)
        deadline_days_after_week_end: int (default 1)
        require_dhis2_timestamp: bool (default True)
    """
    from hmis.apps.clinics.models import Clinic
    from hmis.apps.surveillance.models import IDSRWeeklyReport

    clinic = Clinic.objects.filter(pk=clinic_id).only("facility_id").first()
    facility_id = clinic.facility_id if clinic else None
    if not facility_id:
        return EvaluationResult(0, 0, "Clinic has no facility mapping")

    submission_statuses = set(params.get("submission_statuses") or ["SUBMITTED"])
    include_approved = bool(params.get("include_approved", False))
    if include_approved:
        submission_statuses.add("APPROVED")
    deadline_days_after_week_end = int(params.get("deadline_days_after_week_end", 1) or 1)
    require_dhis2_timestamp = bool(params.get("require_dhis2_timestamp", True))

    expected_weeks: set[tuple[int, int]] = set()
    cursor = start_date
    while cursor <= end_date:
        iso = cursor.isocalendar()
        expected_weeks.add((iso.year, iso.week))
        cursor += timedelta(days=1)

    denominator = len(expected_weeks)
    if denominator == 0:
        return EvaluationResult(0, 0, "No expected epidemiological weeks in period")

    reports = IDSRWeeklyReport.objects.filter(
        facility_ref_id=facility_id,
        week_end_date__gte=start_date,
        week_start_date__lte=end_date,
    ).order_by("-updated_at")

    report_map: dict[tuple[int, int], Any] = {}
    for report in reports:
        key = (int(report.epi_year), int(report.epi_week))
        if key in expected_weeks and key not in report_map:
            report_map[key] = report

    numerator = 0
    for key in expected_weeks:
        report = report_map.get(key)
        if not report or report.status not in submission_statuses:
            continue

        if require_dhis2_timestamp:
            submitted_date = report.dhis2_submitted_at.date() if report.dhis2_submitted_at else None
        else:
            submitted_date = (
                report.dhis2_submitted_at.date()
                if report.dhis2_submitted_at
                else report.updated_at.date()
            )
        if not submitted_date:
            continue

        deadline_date = report.week_end_date + timedelta(days=deadline_days_after_week_end)
        if submitted_date <= deadline_date:
            numerator += 1

    return EvaluationResult(numerator, denominator, "IDSR reports submitted by weekly deadline")


# =============================================================================
# Evaluator Registry
# =============================================================================

EVALUATOR_REGISTRY: dict[str, Callable[..., EvaluationResult]] = {
    "bp_control": evaluate_bp_control,
    "lab_threshold": evaluate_lab_threshold,
    "wait_time": evaluate_wait_time,
    "visit_count": evaluate_visit_count,
    "enrollment_active": evaluate_enrollment_active,
    "stock_availability": evaluate_stock_availability,
    "skilled_birth_attendance": evaluate_skilled_birth_attendance,
    "tb_treatment_success": evaluate_tb_treatment_success,
    "immunization_completeness": evaluate_immunization_completeness,
    "maternal_mortality_ratio": evaluate_maternal_mortality_ratio,
    "idsr_timeliness": evaluate_idsr_timeliness,
}


# =============================================================================
# Main Evaluation Entry Point
# =============================================================================


def evaluate_measure(
    measure, clinic_id: int, year: int, period: int, period_type: str
) -> EvaluationResult | None:
    """
    Evaluate a single quality measure for a clinic and period.

    Returns None if the measure has no evaluation_rule or the rule type
    is not supported.
    """
    rule = measure.evaluation_rule
    if not rule:
        return None

    rule_type = rule.get("type")
    params = rule.get("params", {})

    evaluator = EVALUATOR_REGISTRY.get(rule_type)
    if evaluator is None:
        logger.warning(
            "Unknown evaluation rule type '%s' for measure %s",
            rule_type,
            measure.code,
        )
        return None

    start_date, end_date = get_period_date_range(year, period, period_type)

    try:
        return evaluator(clinic_id, start_date, end_date, params)
    except (AttributeError, TypeError, RuntimeError, OSError, AssertionError):
        logger.exception(
            "Error evaluating measure %s for clinic %d (period %d/%d/%s)",
            measure.code,
            clinic_id,
            year,
            period,
            period_type,
        )
        return None


def evaluate_all_measures_for_clinic(
    clinic_id: int, year: int, period: int, period_type: str
) -> list[dict]:
    """
    Evaluate all active measures with evaluation_rules for a clinic/period.

    Creates or updates QualityMeasureResult records.
    Returns list of result summaries.
    """
    from hmis.apps.quality.models import QualityMeasure, QualityMeasureResult

    measures = QualityMeasure.objects.filter(
        status="ACTIVE",
        evaluation_rule__isnull=False,
    )

    results_summary = []

    for measure in measures:
        # Check if measure applies to this clinic type
        if measure.applicable_clinic_types:
            from hmis.apps.clinics.models import Clinic

            try:
                clinic = Clinic.objects.get(pk=clinic_id)
                if clinic.clinic_type not in measure.applicable_clinic_types:
                    continue
            except Clinic.DoesNotExist:
                continue

        result = evaluate_measure(measure, clinic_id, year, period, period_type)
        if result is None:
            continue

        # Update or create the result record
        obj, created = QualityMeasureResult.objects.update_or_create(
            measure=measure,
            clinic_id=clinic_id,
            year=year,
            period=period,
            period_type=period_type,
            defaults={
                "numerator": result.numerator,
                "denominator": result.denominator,
                "calculation_notes": result.notes,
            },
        )

        results_summary.append(
            {
                "measure_code": measure.code,
                "measure_name": measure.name,
                "numerator": result.numerator,
                "denominator": result.denominator,
                "percentage": float(obj.percentage),
                "meets_target": obj.meets_target,
                "created": created,
            }
        )

    return results_summary
