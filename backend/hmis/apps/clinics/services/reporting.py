"""Clinic reporting services.

Implements Priority 3 (MonthlyClinicReport) aggregation.

The goal is to keep reporting logic out of views/models and make it easy to test.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Sum

from hmis.apps.billing.models import Invoice
from hmis.apps.clinics.models import Clinic, ClinicEnrollment, ClinicVisit, MonthlyClinicReport


@dataclass(frozen=True)
class MonthRange:
    start: date
    end: date


def _month_range(year: int, month: int) -> MonthRange:
    if month < 1 or month > 12:
        raise ValidationError({"month": "Month must be between 1 and 12."})

    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return MonthRange(start=start, end=end)


def generate_monthly_report(clinic: Clinic, year: int, month: int) -> MonthlyClinicReport:
    """Generate (or update) a monthly report for a clinic.

    Aggregates data primarily from:
    - ClinicVisit (via ClinicSession.session_date)
    - Invoice (linked via Invoice.clinic_visit or Encounter.clinic_visit)

    Returns the upserted MonthlyClinicReport instance.
    """

    month_range = _month_range(year, month)
    reference_date = month_range.end - timedelta(days=1)

    visits = ClinicVisit.objects.select_related("patient", "session").filter(
        session__clinic=clinic,
        session__session_date__gte=month_range.start,
        session__session_date__lt=month_range.end,
    )

    total_visits = visits.count()
    new_visits = visits.filter(visit_type="NEW").count()
    revisits = visits.exclude(visit_type="NEW").count()

    male_visits = visits.filter(patient__gender="M").count()
    female_visits = visits.filter(patient__gender="F").count()

    # Priority breakdown (ignore priorities not in RED/ORANGE/YELLOW/GREEN/BLUE)
    priority_red = visits.filter(priority="RED").count()
    priority_orange = visits.filter(priority="ORANGE").count()
    priority_yellow = visits.filter(priority="YELLOW").count()
    priority_green = visits.filter(priority="GREEN").count()
    priority_blue = visits.filter(priority="BLUE").count()

    # Age bands (age at visit date)
    under_5_visits = 0
    under_18_visits = 0
    adult_visits = 0
    over_60_visits = 0

    for visit in visits:
        dob = getattr(visit.patient, "date_of_birth", None)
        visit_date = getattr(visit.session, "session_date", None)
        if not dob or not visit_date:
            continue

        age_years = (visit_date - dob).days // 365
        if age_years < 5:
            under_5_visits += 1
        if age_years < 18:
            under_18_visits += 1
        if 18 <= age_years < 60:
            adult_visits += 1
        if age_years >= 60:
            over_60_visits += 1

    # Revenue (paid invoices) linked to clinic
    paid_invoices = Invoice.objects.filter(
        status=Invoice.Status.PAID,
        invoice_date__gte=month_range.start,
        invoice_date__lt=month_range.end,
    ).filter(
        Q(clinic_visit__session__clinic=clinic) | Q(encounter__clinic_visit__session__clinic=clinic)
    )

    total_revenue = paid_invoices.aggregate(total=Sum("total_amount")).get("total") or Decimal(
        "0.00"
    )

    # Enrollment aggregation
    enrollments = ClinicEnrollment.objects.filter(clinic=clinic)

    new_enrollments = enrollments.filter(
        enrollment_date__gte=month_range.start,
        enrollment_date__lt=month_range.end,
    ).count()

    active_enrollments_qs = enrollments.filter(
        status="ACTIVE",
        enrollment_date__lt=month_range.end,
    )
    active_enrollments = active_enrollments_qs.count()

    defaulters = 0
    for enrollment in active_enrollments_qs.only(
        "next_appointment",
        "appointment_interval_days",
    ):
        next_appointment = enrollment.next_appointment
        if not next_appointment:
            continue

        days_overdue = max(0, (reference_date - next_appointment).days)
        if days_overdue >= (enrollment.appointment_interval_days * 2):
            defaulters += 1

    # For now, split is not implemented (future: based on payment method / SHA claims)
    sha_claims_amount = Decimal("0.00")
    cash_amount = total_revenue

    defaults = {
        "total_visits": total_visits,
        "new_visits": new_visits,
        "revisits": revisits,
        "priority_red": priority_red,
        "priority_orange": priority_orange,
        "priority_yellow": priority_yellow,
        "priority_green": priority_green,
        "priority_blue": priority_blue,
        "male_visits": male_visits,
        "female_visits": female_visits,
        "under_5_visits": under_5_visits,
        "under_18_visits": under_18_visits,
        "adult_visits": adult_visits,
        "over_60_visits": over_60_visits,
        "total_revenue": total_revenue,
        "sha_claims_amount": sha_claims_amount,
        "cash_amount": cash_amount,
        "new_enrollments": new_enrollments,
        "active_enrollments": active_enrollments,
        "defaulters": defaulters,
    }

    with transaction.atomic():
        report, _created = MonthlyClinicReport.objects.update_or_create(
            clinic=clinic,
            year=year,
            month=month,
            defaults=defaults,
        )

    return report


def generate_all_clinic_reports(year: int, month: int):
    """Generate monthly reports for all clinics.

    Returns an iterable of MonthlyClinicReport instances.
    """

    reports = []
    for clinic in Clinic.objects.all():
        reports.append(generate_monthly_report(clinic, year=year, month=month))
    return reports
