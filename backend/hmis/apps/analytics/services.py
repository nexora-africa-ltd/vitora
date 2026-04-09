"""
Analytics ETL services.

Contains the aggregation logic that populates analytics models
from transactional data.  Called by Celery tasks in ``analytics.tasks``.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Sum

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Age-band helpers
# ---------------------------------------------------------------------------

AGE_BANDS = [
    ("0-4", 0, 4),
    ("5-14", 5, 14),
    ("15-24", 15, 24),
    ("25-34", 25, 34),
    ("35-49", 35, 49),
    ("50-64", 50, 64),
    ("65+", 65, 200),
]


def _age_band(dob: date, ref_date: date) -> str:
    """Return the age-band label for a date of birth."""
    age = ref_date.year - dob.year - ((ref_date.month, ref_date.day) < (dob.month, dob.day))
    for label, lo, hi in AGE_BANDS:
        if lo <= age <= hi:
            return label
    return "65+"


# ---------------------------------------------------------------------------
# Daily summary
# ---------------------------------------------------------------------------


def compute_daily_summary(facility, target_date: date) -> dict:
    """
    Compute all daily metrics for a single facility and date.

    Returns a dict of field values suitable for ``FacilityDailySummary``
    ``update_or_create`` defaults.
    """
    from hmis.apps.billing.models import Invoice, Payment
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    scope = {"facility": facility}
    patient_scope = {"registered_at_facility": facility}

    # -- Patients --
    new_patients = Patient.objects.filter(
        created_at__date=target_date, **patient_scope
    ).count()
    total_patients = Patient.objects.filter(
        created_at__date__lte=target_date, **patient_scope
    ).count()

    # -- Encounters --
    enc_qs = Encounter.objects.filter(encounter_date=target_date, **scope)
    encounters_opd = enc_qs.filter(encounter_type="OPD").count()
    encounters_ipd = enc_qs.filter(encounter_type="IPD").count()
    encounters_emergency = enc_qs.filter(encounter_type="EMERGENCY").count()
    encounters_other = enc_qs.exclude(
        encounter_type__in=["OPD", "IPD", "EMERGENCY"]
    ).count()
    encounters_total = enc_qs.count()

    # -- Revenue --
    payments = Payment.objects.filter(
        payment_date__date=target_date,
        status="completed",
        invoice__facility=facility,
    )
    revenue_total = payments.aggregate(t=Sum("amount"))["t"] or Decimal("0")
    revenue_cash = (
        payments.filter(method="cash").aggregate(t=Sum("amount"))["t"]
        or Decimal("0")
    )
    revenue_mpesa = (
        payments.filter(method="mpesa").aggregate(t=Sum("amount"))["t"]
        or Decimal("0")
    )
    revenue_insurance = (
        payments.filter(method="insurance").aggregate(t=Sum("amount"))["t"]
        or Decimal("0")
    )

    # -- Billing --
    invoices_created = Invoice.objects.filter(
        invoice_date=target_date, **scope
    ).count()
    outstanding = Invoice.objects.filter(
        status__in=["pending", "partial", "overdue"], **scope
    ).aggregate(t=Sum("balance_due"))["t"] or Decimal("0")

    # -- Lab --
    lab_stats = _get_lab_stats(facility, target_date)

    # -- Pharmacy --
    pharmacy_stats = _get_pharmacy_stats(facility, target_date)

    # -- Triage --
    triage_stats = _get_triage_stats(facility, target_date)

    # -- Inpatient --
    inpatient_stats = _get_inpatient_stats(facility, target_date)

    return {
        "new_patients": new_patients,
        "total_patients": total_patients,
        "encounters_opd": encounters_opd,
        "encounters_ipd": encounters_ipd,
        "encounters_emergency": encounters_emergency,
        "encounters_other": encounters_other,
        "encounters_total": encounters_total,
        "revenue_total": revenue_total,
        "revenue_cash": revenue_cash,
        "revenue_mpesa": revenue_mpesa,
        "revenue_insurance": revenue_insurance,
        "invoices_created": invoices_created,
        "outstanding_balance": outstanding,
        **lab_stats,
        **pharmacy_stats,
        **triage_stats,
        **inpatient_stats,
    }


def _get_lab_stats(facility, target_date: date) -> dict:
    try:
        from hmis.apps.laboratory.models import LabOrder, LabResult

        placed = LabOrder.objects.filter(
            created_at__date=target_date, facility=facility
        ).count()
        completed = LabOrder.objects.filter(
            status="COMPLETED", updated_at__date=target_date, facility=facility
        ).count()
        critical = LabResult.objects.filter(
            is_abnormal=True, created_at__date=target_date, facility=facility
        ).count()
        return {
            "lab_orders_placed": placed,
            "lab_orders_completed": completed,
            "lab_critical_results": critical,
        }
    except Exception:
        return {"lab_orders_placed": 0, "lab_orders_completed": 0, "lab_critical_results": 0}


def _get_pharmacy_stats(facility, target_date: date) -> dict:
    try:
        from hmis.apps.pharmacy.models import Prescription, StockAlert

        dispensed = Prescription.objects.filter(
            created_at__date=target_date, status="DISPENSED", facility=facility
        ).count()
        low_stock = StockAlert.objects.filter(
            resolved=False, alert_type="LOW_STOCK", facility=facility
        ).count()
        return {"prescriptions_dispensed": dispensed, "low_stock_alerts": low_stock}
    except Exception:
        return {"prescriptions_dispensed": 0, "low_stock_alerts": 0}


def _get_triage_stats(facility, target_date: date) -> dict:
    try:
        from hmis.apps.triage.models import TriageAssessment

        qs = TriageAssessment.objects.filter(
            created_at__date=target_date, facility=facility
        )
        assessments = qs.count()
        emergency = qs.filter(category="EMERGENCY").count()

        # Average wait time (creation → started_at)
        completed = qs.filter(status="COMPLETED", started_at__isnull=False)
        avg_wait = Decimal("0")
        if completed.exists():
            waits = []
            for a in completed[:200]:
                if a.started_at and a.created_at:
                    waits.append((a.started_at - a.created_at).total_seconds() / 60)
            if waits:
                avg_wait = Decimal(str(round(sum(waits) / len(waits), 1)))

        return {
            "triage_assessments": assessments,
            "triage_emergency_count": emergency,
            "avg_wait_time_minutes": avg_wait,
        }
    except Exception:
        return {
            "triage_assessments": 0,
            "triage_emergency_count": 0,
            "avg_wait_time_minutes": Decimal("0"),
        }


def _get_inpatient_stats(facility, target_date: date) -> dict:
    try:
        from hmis.apps.inpatient.models import Admission, Bed

        active = Admission.objects.filter(
            admission_status="ACTIVE", facility=facility
        ).count()
        new_adm = Admission.objects.filter(
            admission_date__date=target_date, facility=facility
        ).count()
        discharged = Admission.objects.filter(
            discharge_date__date=target_date,
            admission_status="DISCHARGED",
            facility=facility,
        ).count()

        total_beds = Bed.objects.filter(ward__facility=facility).exclude(
            status="MAINTENANCE"
        ).count()
        occupied = Bed.objects.filter(
            ward__facility=facility, status="OCCUPIED"
        ).count()
        occupancy = Decimal("0")
        if total_beds > 0:
            occupancy = Decimal(str(round(occupied / total_beds * 100, 2)))

        return {
            "current_admissions": active,
            "new_admissions": new_adm,
            "discharges": discharged,
            "bed_occupancy_rate": occupancy,
        }
    except Exception:
        return {
            "current_admissions": 0,
            "new_admissions": 0,
            "discharges": 0,
            "bed_occupancy_rate": Decimal("0"),
        }


# ---------------------------------------------------------------------------
# Department monthly summary
# ---------------------------------------------------------------------------

# Map encounter types to department codes
ENCOUNTER_TYPE_TO_DEPARTMENT = {
    "OPD": "OPD",
    "SCHEDULED_OPD": "OPD",
    "FOLLOW_UP": "OPD",
    "CONSULTANT_REVIEW": "OPD",
    "CHRONIC_STABLE": "OPD",
    "SPECIALIST_CLINIC": "OPD",
    "IPD": "IPD",
    "WARD_ROUND": "IPD",
    "DISCHARGE_REVIEW": "IPD",
    "EMERGENCY": "EMERGENCY",
    "ANC": "MCH",
    "PAEDIATRIC": "MCH",
    "PROCEDURE": "THEATRE",
    "DAY_CASE": "THEATRE",
}


def compute_department_monthly(facility, year: int, month: int) -> list[dict]:
    """
    Compute monthly summaries for each department at a facility.

    Returns a list of dicts, each with field values for
    ``DepartmentMonthlySummary.update_or_create`` defaults.
    """
    from hmis.apps.encounters.models import Diagnosis, Encounter

    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)

    enc_qs = Encounter.objects.filter(
        encounter_date__gte=month_start,
        encounter_date__lte=month_end,
        facility=facility,
    )

    results = []
    for dept_code, _dept_label in [
        ("OPD", "Outpatient"),
        ("IPD", "Inpatient"),
        ("EMERGENCY", "Emergency"),
        ("MCH", "Maternal & Child Health"),
        ("THEATRE", "Theatre / Procedures"),
    ]:
        enc_types = [k for k, v in ENCOUNTER_TYPE_TO_DEPARTMENT.items() if v == dept_code]
        dept_enc = enc_qs.filter(encounter_type__in=enc_types)

        visit_count = dept_enc.count()
        if visit_count == 0:
            continue

        unique_patients = dept_enc.values("patient").distinct().count()

        # Revenue via invoices linked to these encounters
        revenue = Decimal("0")
        try:
            from hmis.apps.billing.models import Invoice

            revenue = (
                Invoice.objects.filter(
                    encounter__in=dept_enc,
                    status__in=["paid", "partial"],
                    facility=facility,
                ).aggregate(t=Sum("total_amount"))["t"]
                or Decimal("0")
            )
        except Exception:
            logger.debug("Revenue aggregation failed for dept %s", dept_code)
        top_dx = list(
            Diagnosis.objects.filter(encounter__in=dept_enc, icd10_code__isnull=False)
            .values("icd10_code__code", "icd10_code__description")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )
        top_diagnoses = [
            {
                "code": d["icd10_code__code"] or "",
                "name": d["icd10_code__description"] or "",
                "count": d["count"],
            }
            for d in top_dx
        ]

        # Average LOS (IPD only)
        avg_los = None
        if dept_code == "IPD":
            try:
                from hmis.apps.inpatient.models import Admission

                avg_los_val = (
                    Admission.objects.filter(
                        facility=facility,
                        admission_date__date__gte=month_start,
                        admission_date__date__lte=month_end,
                        discharge_date__isnull=False,
                    )
                    .extra(
                        select={
                            "los": "EXTRACT(EPOCH FROM (discharge_date - admission_date)) / 86400"
                        }
                    )
                    .aggregate(avg_los=Avg("los"))
                )
                if avg_los_val.get("avg_los") is not None:
                    avg_los = round(float(avg_los_val["avg_los"]), 1)
            except Exception:
                logger.debug("LOS calculation failed for facility %s", facility.pk)

        results.append(
            {
                "department": dept_code,
                "visit_count": visit_count,
                "unique_patients": unique_patients,
                "revenue": revenue,
                "top_diagnoses": top_diagnoses,
                "avg_length_of_stay_days": avg_los,
            }
        )

    return results


# ---------------------------------------------------------------------------
# Diagnosis trends
# ---------------------------------------------------------------------------


def compute_diagnosis_trends(
    facility, period_start: date, period_end: date, granularity: str = "WEEKLY"
) -> list[dict]:
    """
    Compute ICD-10 diagnosis frequency for a period.

    Returns a list of dicts for ``DiagnosisTrend.update_or_create``.
    """
    from hmis.apps.encounters.models import Diagnosis, Encounter

    encounters = Encounter.objects.filter(
        encounter_date__gte=period_start,
        encounter_date__lte=period_end,
        facility=facility,
    )

    dx_counts = (
        Diagnosis.objects.filter(encounter__in=encounters, icd10_code__isnull=False)
        .values("icd10_code__code", "icd10_code__description")
        .annotate(count=Count("id"))
        .order_by("-count")[:50]
    )

    results = []
    for dx in dx_counts:
        # Get age/gender breakdowns
        dx_encounters = Diagnosis.objects.filter(
            encounter__in=encounters, icd10_code__code=dx["icd10_code__code"]
        ).select_related("encounter__patient")

        age_bands: dict[str, int] = {}
        gender_counts: dict[str, int] = {}
        for d in dx_encounters:
            patient = d.encounter.patient
            band = _age_band(patient.date_of_birth, period_end)
            age_bands[band] = age_bands.get(band, 0) + 1
            g = patient.gender or "O"
            gender_counts[g] = gender_counts.get(g, 0) + 1

        results.append(
            {
                "icd10_code": dx["icd10_code__code"] or "",
                "icd10_name": dx["icd10_code__description"] or "",
                "granularity": granularity,
                "period_start": period_start,
                "period_end": period_end,
                "case_count": dx["count"],
                "age_band_breakdown": age_bands,
                "gender_breakdown": gender_counts,
            }
        )

    return results


# ---------------------------------------------------------------------------
# Patient demographics snapshot
# ---------------------------------------------------------------------------


def compute_demographics_snapshot(facility, snapshot_date: date) -> dict:
    """
    Compute a demographics snapshot for a facility.

    Returns a dict of field values for ``PatientDemographicSnapshot``.
    """
    from hmis.apps.patients.models import Patient

    qs = Patient.objects.filter(registered_at_facility=facility)
    total = qs.count()

    # Age distribution
    age_dist: dict[str, int] = {}
    for p in qs.only("date_of_birth").iterator():
        band = _age_band(p.date_of_birth, snapshot_date)
        age_dist[band] = age_dist.get(band, 0) + 1

    # Gender distribution
    gender_dist = {}
    for row in qs.values("gender").annotate(count=Count("id")):
        gender_dist[row["gender"]] = row["count"]

    # Top counties
    county_dist = list(
        qs.values("county__name")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    county_list = [
        {"county": c["county__name"] or "Unknown", "count": c["count"]}
        for c in county_dist
    ]

    return {
        "snapshot_date": snapshot_date,
        "total_patients": total,
        "age_distribution": age_dist,
        "gender_distribution": gender_dist,
        "county_distribution": county_list,
    }
