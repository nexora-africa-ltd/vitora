"""
MOH report generation services.

Each generator queries transactional data for a given facility and period,
then populates the corresponding MOH report model.  Reports are created in
DRAFT status — a human must review and approve before DHIS2 submission.
"""

from __future__ import annotations

import logging
from datetime import date

from django.db import transaction
from django.utils import timezone

from hmis.apps.core.models import Facility

from .models import (
    AbstractMOHReport,
    MOH705DiseaseRow,
    MOH705Report,
    MOH711Report,
    MOH717Report,
    MOHDataElementMapping,
    MOHReportStatus,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _age_on_date(dob: date | None, ref: date) -> int | None:
    if dob is None:
        return None
    age = ref.year - dob.year - ((ref.month, ref.day) < (dob.month, dob.day))
    return max(age, 0)


def _first_day_of_month(year: int, month: int) -> date:
    return date(year, month, 1)


def _last_day_of_month(year: int, month: int) -> date:
    import calendar

    last = calendar.monthrange(year, month)[1]
    return date(year, month, last)


# ---------------------------------------------------------------------------
# MOH 705 Generator — Outpatient Morbidity
# ---------------------------------------------------------------------------


class MOH705Generator:
    """Generate MOH 705 outpatient morbidity report."""

    # OPD-like encounter types
    OPD_TYPES = [
        "OPD",
        "SCHEDULED_OPD",
        "FOLLOW_UP",
        "CONSULTANT_REVIEW",
        "CHRONIC_STABLE",
        "SPECIALIST_CLINIC",
        "PAEDIATRIC",
    ]

    @classmethod
    def generate(
        cls,
        facility: Facility,
        year: int,
        month: int,
        *,
        generated_by=None,
    ) -> MOH705Report:
        from hmis.apps.encounters.models import Diagnosis

        period_start = _first_day_of_month(year, month)
        period_end = _last_day_of_month(year, month)

        diagnoses = Diagnosis.objects.filter(
            encounter__encounter_type__in=cls.OPD_TYPES,
            encounter__encounter_date__range=(period_start, period_end),
            encounter__facility=facility,
            diagnosis_type="PRIMARY",
            icd10_code__isnull=False,
        ).select_related("encounter__patient", "icd10_code")

        # Aggregate by ICD-10 chapter
        chapter_agg: dict[int, dict] = {}
        total_u5 = 0
        total_5plus = 0
        encounter_ids: set[int] = set()

        for dx in diagnoses.iterator():
            enc = dx.encounter
            encounter_ids.add(enc.id)
            ch = dx.icd10_code.chapter  # type: ignore[union-attr]
            cat_name = dx.icd10_code.category  # type: ignore[union-attr]
            age = _age_on_date(enc.patient.date_of_birth, enc.encounter_date)

            bucket = chapter_agg.setdefault(
                ch,
                {
                    "category_name": cat_name,
                    "under_5": 0,
                    "5_and_above": 0,
                },
            )
            if age is not None and age < 5:
                bucket["under_5"] += 1
                total_u5 += 1
            else:
                bucket["5_and_above"] += 1
                total_5plus += 1

        total_visits = len(encounter_ids)

        with transaction.atomic():
            report, _created = MOH705Report.objects.update_or_create(
                facility=facility,
                period_start=period_start,
                defaults={
                    "period_end": period_end,
                    "organization": facility.organization,
                    "total_visits": total_visits,
                    "total_under_5": total_u5,
                    "total_5_and_above": total_5plus,
                    "new_cases": total_u5 + total_5plus,
                    "revisits": 0,
                    "status": MOHReportStatus.DRAFT,
                    "generated_by": generated_by,
                    "generated_at": timezone.now(),
                },
            )
            # Replace disease rows
            report.disease_rows.all().delete()  # type: ignore[attr-defined]
            rows = [
                MOH705DiseaseRow(
                    report=report,
                    icd10_chapter=ch,
                    category_name=data["category_name"],
                    cases_under_5=data["under_5"],
                    cases_5_and_above=data["5_and_above"],
                    total_cases=data["under_5"] + data["5_and_above"],
                )
                for ch, data in sorted(chapter_agg.items())
            ]
            MOH705DiseaseRow.objects.bulk_create(rows)

        logger.info(
            "MOH 705 generated for %s — %s: %d visits, %d disease rows",
            facility.name,
            report.period_label,
            total_visits,
            len(rows),
        )
        return report


# ---------------------------------------------------------------------------
# MOH 711 Generator — Integrated RH / HIV / Malaria / Nutrition
# ---------------------------------------------------------------------------


class MOH711Generator:
    """Generate MOH 711 integrated report."""

    @classmethod
    def generate(
        cls,
        facility: Facility,
        year: int,
        month: int,
        *,
        generated_by=None,
    ) -> MOH711Report:
        period_start = _first_day_of_month(year, month)
        period_end = _last_day_of_month(year, month)

        rh = cls._reproductive_health(facility, period_start, period_end)
        malaria = cls._malaria_indicators(facility, period_start, period_end)
        immunisation = cls._immunisation_summary(facility, period_start, period_end)

        with transaction.atomic():
            report, _created = MOH711Report.objects.update_or_create(
                facility=facility,
                period_start=period_start,
                defaults={
                    "period_end": period_end,
                    "organization": facility.organization,
                    "status": MOHReportStatus.DRAFT,
                    "generated_by": generated_by,
                    "generated_at": timezone.now(),
                    **rh,
                    **malaria,
                    **immunisation,
                },
            )
        logger.info("MOH 711 generated for %s — %s", facility.name, report.period_label)
        return report

    @classmethod
    def _reproductive_health(cls, facility: Facility, start: date, end: date) -> dict:
        from hmis.apps.encounters.models import Encounter

        anc_visits = Encounter.objects.filter(
            facility=facility,
            encounter_type="ANC",
            encounter_date__range=(start, end),
        ).count()

        delivery_data: dict = {
            "anc_visits": anc_visits,
            "deliveries_normal": 0,
            "deliveries_caesarean": 0,
            "deliveries_total": 0,
            "live_births": 0,
            "still_births": 0,
        }

        try:
            from hmis.apps.mch.models import Delivery

            deliveries = Delivery.objects.filter(
                delivery_date__range=(start, end),
                registration__facility=facility,
                status="COMPLETED",
            )
            delivery_data["deliveries_total"] = deliveries.count()
            delivery_data["deliveries_caesarean"] = deliveries.filter(
                delivery_type__in=["ELECTIVE_CS", "EMERGENCY_CS"]
            ).count()
            delivery_data["deliveries_normal"] = (
                delivery_data["deliveries_total"] - delivery_data["deliveries_caesarean"]
            )
            delivery_data["live_births"] = deliveries.filter(delivery_outcome="LIVE_BIRTH").count()
            delivery_data["still_births"] = deliveries.filter(delivery_outcome="STILLBIRTH").count()
        except (ImportError, Exception):
            logger.debug("MCH/Delivery data unavailable — zeroed in MOH 711")

        return delivery_data

    @classmethod
    def _malaria_indicators(cls, facility: Facility, start: date, end: date) -> dict:
        """Count malaria diagnoses by age band from outpatient encounters."""
        from hmis.apps.encounters.models import Diagnosis

        malaria_dx = Diagnosis.objects.filter(
            encounter__facility=facility,
            encounter__encounter_date__range=(start, end),
            diagnosis_type="PRIMARY",
            icd10_code__code__startswith="B5",  # B50-B54 Malaria
        ).select_related("encounter__patient")

        u5 = 0
        over5 = 0
        pregnancy = 0

        for dx in malaria_dx.iterator():
            age = _age_on_date(
                dx.encounter.patient.date_of_birth,
                dx.encounter.encounter_date,
            )
            if age is not None and age < 5:
                u5 += 1
            else:
                over5 += 1
            if dx.encounter.encounter_type == "ANC":
                pregnancy += 1

        return {
            "malaria_cases_under_5": u5,
            "malaria_cases_5_and_above": over5,
            "malaria_in_pregnancy": pregnancy,
        }

    @classmethod
    def _immunisation_summary(cls, facility: Facility, start: date, end: date) -> dict:
        """Pull immunisation counts if the module is available."""
        data: dict[str, int] = {
            "bcg_given": 0,
            "opv_given": 0,
            "penta_given": 0,
            "measles_given": 0,
            "fully_immunised": 0,
        }

        try:
            from hmis.apps.immunizations.models import ImmunizationRecord

            base = ImmunizationRecord.objects.filter(
                facility=facility,
                administered_date__range=(start, end),
                status="ADMINISTERED",
            )
            data["bcg_given"] = base.filter(vaccine__code__icontains="BCG").count()
            data["opv_given"] = base.filter(vaccine__code__icontains="OPV").count()
            data["penta_given"] = base.filter(vaccine__code__icontains="PENTA").count()
            data["measles_given"] = base.filter(vaccine__code__icontains="MEASLES").count()
        except (ImportError, Exception):
            logger.debug("Immunization data unavailable — zeroed in MOH 711")

        return data


# ---------------------------------------------------------------------------
# MOH 717 Generator — Workload Summary
# ---------------------------------------------------------------------------


class MOH717Generator:
    """Generate MOH 717 workload report."""

    OPD_TYPES = MOH705Generator.OPD_TYPES

    @classmethod
    def generate(
        cls,
        facility: Facility,
        year: int,
        month: int,
        *,
        generated_by=None,
    ) -> MOH717Report:
        period_start = _first_day_of_month(year, month)
        period_end = _last_day_of_month(year, month)

        opd = cls._opd_counts(facility, period_start, period_end)
        inpatient = cls._inpatient_counts(facility, period_start, period_end)
        delivery = cls._delivery_counts(facility, period_start, period_end)
        lab = cls._lab_counts(facility, period_start, period_end)
        emergency = cls._emergency_count(facility, period_start, period_end)
        referrals = cls._referral_counts(facility, period_start, period_end)

        with transaction.atomic():
            report, _created = MOH717Report.objects.update_or_create(
                facility=facility,
                period_start=period_start,
                defaults={
                    "period_end": period_end,
                    "organization": facility.organization,
                    "status": MOHReportStatus.DRAFT,
                    "generated_by": generated_by,
                    "generated_at": timezone.now(),
                    **opd,
                    **inpatient,
                    **delivery,
                    **lab,
                    **emergency,
                    **referrals,
                },
            )
        logger.info("MOH 717 generated for %s — %s", facility.name, report.period_label)
        return report

    @classmethod
    def _opd_counts(cls, facility: Facility, start: date, end: date) -> dict:
        from hmis.apps.encounters.models import Encounter

        opd_qs = Encounter.objects.filter(
            facility=facility,
            encounter_type__in=cls.OPD_TYPES,
            encounter_date__range=(start, end),
        )
        total = opd_qs.count()
        revisits = opd_qs.filter(encounter_type="FOLLOW_UP").count()
        return {
            "opd_total": total,
            "opd_revisits": revisits,
            "opd_new_visits": total - revisits,
        }

    @classmethod
    def _inpatient_counts(cls, facility: Facility, start: date, end: date) -> dict:
        data: dict[str, int] = {
            "admissions_total": 0,
            "discharges_total": 0,
            "inpatient_days": 0,
            "deaths_total": 0,
            "surgeries_major": 0,
            "surgeries_minor": 0,
        }
        try:
            from hmis.apps.inpatient.models import Admission, Discharge

            data["admissions_total"] = Admission.objects.filter(
                facility=facility,
                admission_date__date__range=(start, end),
            ).count()

            discharges = Discharge.objects.filter(
                admission__facility=facility,
                discharge_date__date__range=(start, end),
            )
            data["discharges_total"] = discharges.count()
            data["deaths_total"] = discharges.filter(discharge_type="DECEASED").count()
        except (ImportError, Exception):
            logger.debug("Inpatient data unavailable — zeroed in MOH 717")

        return data

    @classmethod
    def _delivery_counts(cls, facility: Facility, start: date, end: date) -> dict:
        data: dict[str, int] = {"deliveries_total": 0, "deliveries_caesarean": 0}
        try:
            from hmis.apps.mch.models import Delivery

            deliveries = Delivery.objects.filter(
                registration__facility=facility,
                delivery_date__range=(start, end),
                status="COMPLETED",
            )
            data["deliveries_total"] = deliveries.count()
            data["deliveries_caesarean"] = deliveries.filter(
                delivery_type__in=["ELECTIVE_CS", "EMERGENCY_CS"]
            ).count()
        except (ImportError, Exception):
            logger.debug("MCH delivery data unavailable for MOH 717")

        return data

    @classmethod
    def _lab_counts(cls, facility: Facility, start: date, end: date) -> dict:
        try:
            from hmis.apps.laboratory.models import LabOrder

            total = LabOrder.objects.filter(
                facility=facility,
                ordered_date__date__range=(start, end),
            ).count()
            return {"lab_tests_total": total}
        except (ImportError, Exception):
            return {"lab_tests_total": 0}

    @classmethod
    def _emergency_count(cls, facility: Facility, start: date, end: date) -> dict:
        from hmis.apps.encounters.models import Encounter

        count = Encounter.objects.filter(
            facility=facility,
            encounter_type="EMERGENCY",
            encounter_date__range=(start, end),
        ).count()
        return {"emergency_visits": count}

    @classmethod
    def _referral_counts(cls, facility: Facility, start: date, end: date) -> dict:
        data: dict[str, int] = {"referrals_in": 0, "referrals_out": 0}
        try:
            from hmis.apps.referrals.models import ClinicalReferral

            data["referrals_out"] = ClinicalReferral.objects.filter(
                referring_facility=facility,
                created_at__date__range=(start, end),
            ).count()
            data["referrals_in"] = ClinicalReferral.objects.filter(
                receiving_facility=facility,
                created_at__date__range=(start, end),
            ).count()
        except (ImportError, Exception):
            logger.debug("Referral data unavailable for MOH 717")

        return data


# ---------------------------------------------------------------------------
# DHIS2 submission
# ---------------------------------------------------------------------------


class DHIS2SubmissionService:
    """Prepare DHIS2 DataValueSet payloads and submit."""

    @classmethod
    def prepare_payload(cls, report: AbstractMOHReport) -> dict:  # type: ignore[type-arg]
        """Build a DHIS2 DataValueSet JSON payload for the given report."""
        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        facility = getattr(report, "facility", None)
        creds = resolve_dhis2_credentials(facility)
        org_unit = creds.org_unit
        env = creds.environment
        period = report.dhis2_period

        if isinstance(report, MOH705Report):
            return cls._payload_705(report, period, org_unit, env)
        if isinstance(report, MOH711Report):
            return cls._payload_711(report, period, org_unit, env)
        if isinstance(report, MOH717Report):
            return cls._payload_717(report, period, org_unit, env)

        raise ValueError(f"Unknown report type: {type(report)}")

    @classmethod
    def submit(cls, report: AbstractMOHReport) -> dict:  # type: ignore[type-arg]
        """Submit an approved report to DHIS2."""
        import requests

        from hmis.apps.core.dhis2 import resolve_dhis2_credentials

        if report.status != MOHReportStatus.APPROVED:
            raise ValueError("Only approved reports can be submitted to DHIS2")

        payload = cls.prepare_payload(report)
        facility = getattr(report, "facility", None)
        creds = resolve_dhis2_credentials(facility)

        if not creds.base_url:
            raise ValueError("DHIS2_API_URL is not configured")

        url = f"{creds.api_url}/api/dataValueSets"
        try:
            resp = requests.post(
                url,
                json=payload,
                auth=(creds.username, creds.password),
                timeout=30,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            report.mark_submitted(data)
            return data
        except Exception as exc:
            error = {"status": "error", "message": str(exc)}
            report.mark_failed(error)
            return error

    # -- Per-report-type payloads -------------------------------------------

    @classmethod
    def _payload_705(cls, report: MOH705Report, period: str, org_unit: str, env: str) -> dict:
        data_values = []
        for row in report.disease_rows.all():  # type: ignore[attr-defined]
            u5_uid = MOHDataElementMapping.get_uid("MOH705", f"ch{row.icd10_chapter}_under_5", env)
            o5_uid = MOHDataElementMapping.get_uid(
                "MOH705", f"ch{row.icd10_chapter}_5_and_above", env
            )
            if u5_uid:
                data_values.append(
                    {
                        "dataElement": u5_uid,
                        "period": period,
                        "orgUnit": org_unit,
                        "value": str(row.cases_under_5),
                    }
                )
            if o5_uid:
                data_values.append(
                    {
                        "dataElement": o5_uid,
                        "period": period,
                        "orgUnit": org_unit,
                        "value": str(row.cases_5_and_above),
                    }
                )

        return {
            "dataValues": data_values,
            "period": period,
            "orgUnit": org_unit,
            "completeDate": report.generated_at.strftime("%Y-%m-%d") if report.generated_at else "",
        }

    @classmethod
    def _payload_711(cls, report: MOH711Report, period: str, org_unit: str, env: str) -> dict:
        fields = [
            "anc_visits",
            "deliveries_normal",
            "deliveries_caesarean",
            "deliveries_total",
            "live_births",
            "still_births",
            "malaria_cases_under_5",
            "malaria_cases_5_and_above",
            "malaria_in_pregnancy",
            "bcg_given",
            "opv_given",
            "penta_given",
            "measles_given",
            "fully_immunised",
        ]
        return cls._simple_payload(report, "MOH711", fields, period, org_unit, env)

    @classmethod
    def _payload_717(cls, report: MOH717Report, period: str, org_unit: str, env: str) -> dict:
        fields = [
            "opd_new_visits",
            "opd_revisits",
            "opd_total",
            "admissions_total",
            "discharges_total",
            "inpatient_days",
            "deaths_total",
            "deliveries_total",
            "deliveries_caesarean",
            "surgeries_major",
            "surgeries_minor",
            "referrals_in",
            "referrals_out",
            "lab_tests_total",
            "emergency_visits",
        ]
        return cls._simple_payload(report, "MOH717", fields, period, org_unit, env)

    @classmethod
    def _simple_payload(
        cls,
        report,
        report_type: str,
        fields: list[str],
        period: str,
        org_unit: str,
        env: str,
    ) -> dict:
        data_values = []
        for field in fields:
            uid = MOHDataElementMapping.get_uid(report_type, field, env)
            if uid:
                data_values.append(
                    {
                        "dataElement": uid,
                        "period": period,
                        "orgUnit": org_unit,
                        "value": str(getattr(report, field, 0)),
                    }
                )
        return {
            "dataValues": data_values,
            "period": period,
            "orgUnit": org_unit,
            "completeDate": report.generated_at.strftime("%Y-%m-%d") if report.generated_at else "",
        }
