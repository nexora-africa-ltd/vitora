"""
Service layer for Disease Surveillance.

Provides business logic for case creation, alert generation,
notification to county health offices, and outbreak detection.
"""

import logging
from datetime import date, timedelta
from typing import TYPE_CHECKING

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import models
from django.utils import timezone

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from hmis.apps.encounters.models import Diagnosis

    from .models import IDSRWeeklyReport, NotifiableCase, NotifiableDisease, SurveillanceAlert

logger = logging.getLogger(__name__)



class SurveillanceService:
    """
    Service class for disease surveillance operations.

    Provides methods for:
    - Creating notifiable cases from diagnoses
    - Generating alerts for immediate diseases
    - Broadcasting WebSocket notifications
    - Checking outbreak thresholds
    - Sending SMS/email notifications
    """

    @classmethod
    def check_diagnosis_for_notifiable_disease(
        cls, diagnosis: "Diagnosis"
    ) -> "NotifiableDisease | None":
        """
        Check if a diagnosis matches any notifiable disease.

        Args:
            diagnosis: Diagnosis instance to check

        Returns:
            NotifiableDisease if match found, None otherwise
        """
        from .models import NotifiableDisease

        if not diagnosis.icd10_code:
            return None

        code = diagnosis.icd10_code.code.upper()

        # Check for exact match or prefix match
        diseases = NotifiableDisease.objects.filter(is_active=True)

        for disease in diseases:
            disease_codes = disease.get_icd10_code_list()
            for disease_code in disease_codes:
                # Exact match or code starts with disease code
                if code == disease_code or code.startswith(disease_code.rstrip(".")):
                    return disease

        return None

    @classmethod
    def create_case_from_diagnosis(
        cls,
        diagnosis: "Diagnosis",
        disease: "NotifiableDisease",
        reported_by: "User | None" = None,
    ) -> "NotifiableCase":
        """
        Create a NotifiableCase from a diagnosis.

        Args:
            diagnosis: Diagnosis that triggered the case
            disease: NotifiableDisease that was matched
            reported_by: User who triggered the case (usually diagnosing clinician)

        Returns:
            Created NotifiableCase instance
        """
        from .models import NotifiableCase, SurveillanceAlert

        encounter = diagnosis.encounter
        patient = encounter.patient

        # Check for existing case
        existing = NotifiableCase.objects.filter(
            patient=patient,
            encounter=encounter,
            disease=disease,
        ).first()

        if existing:
            logger.info(
                f"Case already exists for {disease.name} - patient {patient.mrn} - encounter {encounter.id}"
            )
            return existing

        # Create the case
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=patient,
            encounter=encounter,
            diagnosis=diagnosis,
            reported_by=reported_by or diagnosis.diagnosed_by,
            county=patient.county,
            sub_county=patient.sub_county,
        )

        logger.info(
            f"Created notifiable case for {disease.name} - patient {patient.mrn} "
            f"- category {disease.category}"
        )

        # Generate alert for immediate diseases
        if disease.is_immediate:
            cls.create_alert(
                case=case,
                alert_type=SurveillanceAlert.AlertType.NEW_CASE,
            )

        # Check outbreak thresholds
        cls.check_outbreak_thresholds(disease, patient.county)

        return case

    @classmethod
    def create_alert(
        cls,
        case: "NotifiableCase",
        alert_type: str,
        custom_message: str | None = None,
    ) -> "SurveillanceAlert":
        """
        Create a surveillance alert and broadcast via WebSocket.

        Args:
            case: NotifiableCase that triggered the alert
            alert_type: Type of alert (NEW_CASE, OVERDUE, OUTBREAK)
            custom_message: Optional custom message

        Returns:
            Created SurveillanceAlert instance
        """
        from .models import SurveillanceAlert

        # Generate message
        if custom_message:
            message = custom_message
        elif alert_type == SurveillanceAlert.AlertType.NEW_CASE:
            message = (
                f"New {case.disease.get_category_display()} case: "
                f"{case.disease.name} detected for patient {case.patient.mrn}"
            )
            if case.disease.is_immediate:
                message = f"⚠️ IMMEDIATE: {message}"
        elif alert_type == SurveillanceAlert.AlertType.OVERDUE:
            message = (
                f"⏰ OVERDUE: Notification deadline passed for "
                f"{case.disease.name} - patient {case.patient.mrn}"
            )
        elif alert_type == SurveillanceAlert.AlertType.OUTBREAK:
            message = (
                f"🚨 OUTBREAK ALERT: {case.disease.name} threshold exceeded "
                f"in {case.county.name if case.county else 'facility'}"
            )
        else:
            message = f"Alert for {case.disease.name} - {case.patient.mrn}"

        # Create alert record
        alert = SurveillanceAlert.objects.create(
            case=case,
            alert_type=alert_type,
            message=message,
        )

        # Broadcast via WebSocket
        cls.broadcast_alert(alert)

        # Send SMS/email for immediate diseases
        if case.disease.is_immediate and alert_type in [
            SurveillanceAlert.AlertType.NEW_CASE,
            SurveillanceAlert.AlertType.OUTBREAK,
        ]:
            cls.send_sms_alert(alert)
            cls.send_email_alert(alert)

        return alert

    @classmethod
    def broadcast_alert(cls, alert: "SurveillanceAlert") -> None:
        """
        Broadcast alert to WebSocket clients.

        Args:
            alert: SurveillanceAlert to broadcast
        """
        from .models import SurveillanceAlert

        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("No channel layer configured for WebSocket broadcast")
            return

        event_type_map = {
            SurveillanceAlert.AlertType.NEW_CASE: "surveillance_immediate_alert"
            if alert.case.disease.is_immediate
            else "surveillance_new_case",
            SurveillanceAlert.AlertType.OVERDUE: "surveillance_overdue_alert",
            SurveillanceAlert.AlertType.OUTBREAK: "surveillance_outbreak_alert",
            SurveillanceAlert.AlertType.CASE_UPDATE: "surveillance_new_case",
        }

        event_type = event_type_map.get(alert.alert_type, "surveillance_new_case")

        data = {
            "alert_id": alert.id,
            "case_id": alert.case.id,
            "disease_name": alert.case.disease.name,
            "disease_category": alert.case.disease.category,
            "patient_mrn": alert.case.patient.mrn,
            "county": alert.case.county.name if alert.case.county else None,
            "message": alert.message,
            "alert_type": alert.alert_type,
            "is_immediate": alert.case.disease.is_immediate,
            "notification_deadline": (
                alert.case.notification_deadline.isoformat()
                if alert.case.notification_deadline
                else None
            ),
            "timestamp": alert.created_at.isoformat(),
        }

        try:
            async_to_sync(channel_layer.group_send)(
                "surveillance_alerts",
                {
                    "type": event_type,
                    "data": data,
                },
            )
            alert.sent_via_websocket = True
            alert.save(update_fields=["sent_via_websocket"])
            logger.info(f"Broadcast surveillance alert {alert.id} via WebSocket")
        except Exception as e:
            logger.error(f"Failed to broadcast surveillance alert: {e}")

    @classmethod
    def send_sms_alert(cls, alert: "SurveillanceAlert") -> bool:
        """
        Send SMS alert for immediate reportable diseases.

        Args:
            alert: SurveillanceAlert to send

        Returns:
            True if SMS sent successfully
        """
        # Get county health officer phone from settings or county config
        # This is a placeholder implementation
        try:
            from hmis.apps.core.sms_gateway import send_sms

            county = alert.case.county
            if not county:
                logger.warning(f"No county for alert {alert.id}, skipping SMS")
                return False

            # TODO: Get county health officer phone from configuration
            # For now, use settings
            recipient = getattr(settings, "SURVEILLANCE_SMS_RECIPIENT", None)
            if not recipient:
                logger.info("No SURVEILLANCE_SMS_RECIPIENT configured")
                return False

            message = f"[Vitora HMIS] {alert.message}"

            success = send_sms(recipient, message)

            if success:
                alert.sent_via_sms = True
                alert.sms_recipient = recipient
                alert.save(update_fields=["sent_via_sms", "sms_recipient"])
                logger.info(f"Sent SMS alert {alert.id} to {recipient}")
            return success

        except Exception as e:
            logger.error(f"Failed to send SMS alert: {e}")
            return False

    @classmethod
    def send_email_alert(cls, alert: "SurveillanceAlert") -> bool:
        """
        Send email alert for immediate reportable diseases.

        Args:
            alert: SurveillanceAlert to send

        Returns:
            True if email sent successfully
        """
        try:
            from django.core.mail import send_mail

            county = alert.case.county
            if not county:
                logger.warning(f"No county for alert {alert.id}, skipping email")
                return False

            # TODO: Get county health officer email from configuration
            recipient = getattr(settings, "SURVEILLANCE_EMAIL_RECIPIENT", None)
            if not recipient:
                logger.info("No SURVEILLANCE_EMAIL_RECIPIENT configured")
                return False

            subject = f"[Vitora HMIS] {alert.get_alert_type_display()}: {alert.case.disease.name}"
            body = f"""
Disease Surveillance Alert
===========================

{alert.message}

Case Details:
- Disease: {alert.case.disease.name}
- Category: {alert.case.disease.get_category_display()}
- Patient MRN: {alert.case.patient.mrn}
- County: {county.name if county else 'N/A'}
- Detected: {alert.case.detected_at.strftime('%Y-%m-%d %H:%M')}
- Notification Deadline: {alert.case.notification_deadline.strftime('%Y-%m-%d %H:%M') if alert.case.notification_deadline else 'N/A'}

Please log in to Vitora HMIS to review and process this case.
"""

            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )

            alert.sent_via_email = True
            alert.email_recipient = recipient
            alert.save(update_fields=["sent_via_email", "email_recipient"])
            logger.info(f"Sent email alert {alert.id} to {recipient}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")
            return False

    @classmethod
    def check_outbreak_thresholds(cls, disease: "NotifiableDisease", county=None) -> None:
        """
        Check if outbreak threshold is exceeded and create alert if so.

        Args:
            disease: NotifiableDisease to check
            county: County to check (optional)
        """
        from .models import OutbreakThreshold, SurveillanceAlert

        # Get relevant thresholds
        thresholds = OutbreakThreshold.objects.filter(
            disease=disease,
            is_active=True,
        )

        if county:
            # Check county-specific and national thresholds
            thresholds = thresholds.filter(models.Q(county=county) | models.Q(county__isnull=True))
        else:
            # Check only national threshold
            thresholds = thresholds.filter(county__isnull=True)

        for threshold in thresholds:
            exceeded, count = threshold.check_threshold()
            if exceeded:
                # Check if we already sent an outbreak alert recently
                recent_alert = SurveillanceAlert.objects.filter(
                    case__disease=disease,
                    alert_type=SurveillanceAlert.AlertType.OUTBREAK,
                    created_at__gte=timezone.now() - timedelta(hours=24),
                ).exists()

                if not recent_alert:
                    # Get most recent case to attach alert to
                    from .models import NotifiableCase

                    recent_case = NotifiableCase.objects.filter(
                        disease=disease,
                    ).order_by("-detected_at").first()

                    if recent_case:
                        cls.create_alert(
                            case=recent_case,
                            alert_type=SurveillanceAlert.AlertType.OUTBREAK,
                            custom_message=(
                                f"🚨 OUTBREAK THRESHOLD EXCEEDED: {count} cases of "
                                f"{disease.name} in {threshold.period_days} days "
                                f"(threshold: {threshold.case_threshold}) - "
                                f"{threshold.county.name if threshold.county else 'National'}"
                            ),
                        )
                        logger.warning(
                            f"Outbreak threshold exceeded: {disease.name} - "
                            f"{count}/{threshold.case_threshold} cases"
                        )

    @classmethod
    def check_overdue_cases(cls) -> list["NotifiableCase"]:
        """
        Check for cases that have passed notification deadline.

        Called periodically by Celery task to generate overdue alerts.

        Returns:
            List of newly overdue cases
        """
        from .models import NotifiableCase, NotificationStatus, SurveillanceAlert

        now = timezone.now()

        # Find cases that are overdue and don't have an overdue alert
        overdue_cases = NotifiableCase.objects.filter(
            notification_deadline__lt=now,
            notification_status=NotificationStatus.PENDING,
        ).exclude(
            alerts__alert_type=SurveillanceAlert.AlertType.OVERDUE
        )

        newly_overdue = []
        for case in overdue_cases:
            cls.create_alert(case=case, alert_type=SurveillanceAlert.AlertType.OVERDUE)
            newly_overdue.append(case)
            logger.warning(f"Case overdue: {case.disease.name} - {case.patient.mrn}")

        return newly_overdue


class IDSRReportingService:
    """
    Service class for IDSR Weekly Report generation.

    Provides methods for:
    - Calculating epidemiological weeks (ISO 8601)
    - Generating weekly reports from NotifiableCase data
    - Aggregating disease summaries by age group
    - Preparing DHIS2 payloads for submission
    """

    @staticmethod
    def get_epi_week(reference_date=None) -> tuple[int, int, "date", "date"]:
        """
        Calculate epidemiological week for a given date.

        Uses ISO 8601 week numbering:
        - Week 1 is the week containing the first Thursday
        - Weeks run Monday to Sunday

        Args:
            reference_date: Date to calculate week for (default: today)

        Returns:
            Tuple of (epi_year, epi_week, week_start, week_end)
        """

        if reference_date is None:
            reference_date = timezone.localdate()
        elif isinstance(reference_date, str):
            from datetime import datetime

            reference_date = datetime.strptime(reference_date, "%Y-%m-%d").date()

        # ISO calendar: (year, week, weekday)
        iso_cal = reference_date.isocalendar()
        epi_year = iso_cal[0]
        epi_week = iso_cal[1]

        # Calculate week start (Monday) and end (Sunday)
        # weekday() returns 0=Monday, 6=Sunday
        days_since_monday = reference_date.weekday()
        week_start = reference_date - timedelta(days=days_since_monday)
        week_end = week_start + timedelta(days=6)

        return (epi_year, epi_week, week_start, week_end)

    @staticmethod
    def get_previous_epi_week(reference_date=None) -> tuple[int, int, "date", "date"]:
        """
        Get the previous epidemiological week.

        Used for generating reports at end of week (Sunday midnight).

        Args:
            reference_date: Reference date (default: today)

        Returns:
            Tuple of (epi_year, epi_week, week_start, week_end)
        """
        if reference_date is None:
            reference_date = timezone.localdate()

        # Go back 7 days to get previous week
        previous_date = reference_date - timedelta(days=7)
        return IDSRReportingService.get_epi_week(previous_date)

    @classmethod
    def generate_weekly_report(
        cls,
        epi_year: int,
        epi_week: int,
        week_start: "date",
        week_end: "date",
        facility_code: str | None = None,
        facility_name: str | None = None,
        county=None,
        generated_by=None,
    ) -> "IDSRWeeklyReport":
        """
        Generate or update an IDSR weekly report.

        Aggregates all NotifiableCase records within the week period
        and creates per-disease summaries.

        Args:
            epi_year: Epidemiological year
            epi_week: Epidemiological week number
            week_start: Monday of the week
            week_end: Sunday of the week
            facility_code: MFL code (optional, from settings)
            facility_name: Facility name
            county: County for filtering/routing
            generated_by: User generating the report

        Returns:
            Created or updated IDSRWeeklyReport instance
        """
        from datetime import datetime

        from django.conf import settings
        from django.db import transaction

        from .models import (
            IDSRDiseaseSummary,
            IDSRReportStatus,
            IDSRWeeklyReport,
            NotifiableCase,
            NotifiableCategory,
        )

        # Get facility info from settings if not provided
        if not facility_code:
            facility_code = getattr(settings, "FACILITY_CODE", "")
        if not facility_name:
            facility_name = getattr(settings, "FACILITY_NAME", "")

        # Convert week_end to datetime for comparison with detected_at
        week_start_dt = datetime.combine(week_start, datetime.min.time())
        week_end_dt = datetime.combine(week_end, datetime.max.time())

        # Make timezone-aware
        if settings.USE_TZ:
            from django.utils import timezone as tz

            week_start_dt = tz.make_aware(week_start_dt)
            week_end_dt = tz.make_aware(week_end_dt)

        # Query cases for this week
        cases_queryset = NotifiableCase.objects.select_related(
            "disease", "patient", "county"
        ).filter(
            detected_at__gte=week_start_dt,
            detected_at__lte=week_end_dt,
        )

        if county:
            cases_queryset = cases_queryset.filter(county=county)

        cases = list(cases_queryset)

        with transaction.atomic():
            # Create or update the weekly report
            report, created = IDSRWeeklyReport.objects.update_or_create(
                epi_year=epi_year,
                epi_week=epi_week,
                facility_code=facility_code,
                defaults={
                    "facility_name": facility_name,
                    "week_start_date": week_start,
                    "week_end_date": week_end,
                    "county": county,
                    "generated_by": generated_by,
                    "status": IDSRReportStatus.DRAFT,
                },
            )

            # Clear existing summaries if regenerating
            if not created:
                report.disease_summaries.all().delete()

            # Aggregate by disease
            disease_data = {}
            total_deaths = 0
            immediate_cases = 0
            lab_confirmed_cases = 0

            for case in cases:
                disease_id = case.disease_id
                if disease_id not in disease_data:
                    disease_data[disease_id] = {
                        "disease": case.disease,
                        "cases_under_5": 0,
                        "cases_5_and_above": 0,
                        "deaths_under_5": 0,
                        "deaths_5_and_above": 0,
                        "lab_confirmed": 0,
                        "is_outbreak": False,
                    }

                # Calculate age at detection
                patient_age = cls._calculate_age(
                    case.patient.date_of_birth, case.detected_at.date()
                )

                if patient_age < 5:
                    disease_data[disease_id]["cases_under_5"] += 1
                    if case.outcome == "DECEASED":
                        disease_data[disease_id]["deaths_under_5"] += 1
                        total_deaths += 1
                else:
                    disease_data[disease_id]["cases_5_and_above"] += 1
                    if case.outcome == "DECEASED":
                        disease_data[disease_id]["deaths_5_and_above"] += 1
                        total_deaths += 1

                if case.laboratory_confirmed:
                    disease_data[disease_id]["lab_confirmed"] += 1
                    lab_confirmed_cases += 1

                if case.disease.category == NotifiableCategory.IMMEDIATE:
                    immediate_cases += 1

            # Check for outbreaks
            outbreak_diseases = []
            for disease_id, data in disease_data.items():
                from .models import OutbreakThreshold

                threshold = OutbreakThreshold.objects.filter(
                    disease_id=disease_id,
                    is_active=True,
                ).first()

                if threshold:
                    total_cases = data["cases_under_5"] + data["cases_5_and_above"]
                    if total_cases >= threshold.case_threshold:
                        data["is_outbreak"] = True
                        outbreak_diseases.append(data["disease"].name)

            # Create disease summaries
            for _disease_id, data in disease_data.items():
                IDSRDiseaseSummary.objects.create(
                    report=report,
                    disease=data["disease"],
                    cases_under_5=data["cases_under_5"],
                    cases_5_and_above=data["cases_5_and_above"],
                    deaths_under_5=data["deaths_under_5"],
                    deaths_5_and_above=data["deaths_5_and_above"],
                    lab_confirmed=data["lab_confirmed"],
                    is_outbreak=data["is_outbreak"],
                )

            # Update report summary
            report.total_cases = len(cases)
            report.total_deaths = total_deaths
            report.immediate_cases = immediate_cases
            report.lab_confirmed_cases = lab_confirmed_cases
            report.outbreak_declared = len(outbreak_diseases) > 0
            report.outbreak_diseases = ",".join(outbreak_diseases)
            report.save()

            logger.info(
                f"Generated IDSR report W{epi_week:02d}/{epi_year}: "
                f"{len(cases)} cases, {len(disease_data)} diseases"
            )

        return report

    @staticmethod
    def _calculate_age(date_of_birth, reference_date) -> int:
        """Calculate age in years from date of birth."""
        if not date_of_birth:
            return 0
        years = reference_date.year - date_of_birth.year
        if (reference_date.month, reference_date.day) < (
            date_of_birth.month,
            date_of_birth.day,
        ):
            years -= 1
        return max(0, years)

    @classmethod
    def generate_previous_week_report(cls, generated_by=None) -> "IDSRWeeklyReport":
        """
        Generate IDSR report for the previous epidemiological week.

        Called by Celery task on Sunday midnight.

        Args:
            generated_by: User or None for system

        Returns:
            Generated IDSRWeeklyReport
        """
        epi_year, epi_week, week_start, week_end = cls.get_previous_epi_week()
        return cls.generate_weekly_report(
            epi_year=epi_year,
            epi_week=epi_week,
            week_start=week_start,
            week_end=week_end,
            generated_by=generated_by,
        )

    @classmethod
    def prepare_dhis2_payload(cls, report: "IDSRWeeklyReport") -> dict:
        """
        Prepare DHIS2 DataValueSet payload for submission.

        Formats the IDSR report data according to Kenya KHIS
        data element structure.

        Args:
            report: IDSRWeeklyReport to submit

        Returns:
            DHIS2 API payload dict
        """
        from django.conf import settings

        # DHIS2 period format for weekly: YYYY"W"WW (e.g., 2026W08)
        period = f"{report.epi_year}W{report.epi_week:02d}"

        # Get org unit from settings
        org_unit = getattr(settings, "DHIS2_ORG_UNIT", report.facility_code)

        data_values = []

        # TODO: Map disease summaries to actual DHIS2 data elements
        # These data element IDs need to be configured per DHIS2 instance
        for summary in report.disease_summaries.select_related("disease"):
            # Placeholder data element mapping
            disease_code = summary.disease.name.upper().replace(" ", "_")

            # Cases under 5
            if summary.cases_under_5 > 0:
                data_values.append({
                    "dataElement": f"IDSR_{disease_code}_U5_CASES",
                    "period": period,
                    "orgUnit": org_unit,
                    "value": summary.cases_under_5,
                })

            # Cases 5 and above
            if summary.cases_5_and_above > 0:
                data_values.append({
                    "dataElement": f"IDSR_{disease_code}_O5_CASES",
                    "period": period,
                    "orgUnit": org_unit,
                    "value": summary.cases_5_and_above,
                })

            # Deaths under 5
            if summary.deaths_under_5 > 0:
                data_values.append({
                    "dataElement": f"IDSR_{disease_code}_U5_DEATHS",
                    "period": period,
                    "orgUnit": org_unit,
                    "value": summary.deaths_under_5,
                })

            # Deaths 5 and above
            if summary.deaths_5_and_above > 0:
                data_values.append({
                    "dataElement": f"IDSR_{disease_code}_O5_DEATHS",
                    "period": period,
                    "orgUnit": org_unit,
                    "value": summary.deaths_5_and_above,
                })

        return {
            "dataValues": data_values,
            "period": period,
            "orgUnit": org_unit,
            "completeDate": timezone.localdate().isoformat(),
        }

    @classmethod
    def submit_to_dhis2(cls, report: "IDSRWeeklyReport") -> dict:
        """
        Submit IDSR report to DHIS2.

        Args:
            report: Approved IDSRWeeklyReport to submit

        Returns:
            DHIS2 API response dict
        """
        import requests
        from django.conf import settings

        if report.status != "APPROVED":
            raise ValueError("Report must be approved before submission")

        dhis2_url = getattr(settings, "DHIS2_API_URL", None)
        dhis2_username = getattr(settings, "DHIS2_USERNAME", None)
        dhis2_password = getattr(settings, "DHIS2_PASSWORD", None)

        if not all([dhis2_url, dhis2_username, dhis2_password]):
            logger.warning("DHIS2 credentials not configured")
            return {"status": "error", "message": "DHIS2 not configured"}

        payload = cls.prepare_dhis2_payload(report)

        try:
            response = requests.post(
                f"{dhis2_url}/api/dataValueSets",
                json=payload,
                auth=(dhis2_username, dhis2_password),
                headers={"Content-Type": "application/json"},
                timeout=30,
            )

            response_data = response.json() if response.text else {}

            if response.ok:
                report.mark_submitted(response_data)
                logger.info(f"Submitted IDSR report {report.id} to DHIS2")
            else:
                report.mark_failed(response_data)
                logger.error(f"DHIS2 submission failed: {response.status_code}")

            return response_data

        except requests.RequestException as e:
            error_response = {"status": "error", "message": str(e)}
            report.mark_failed(error_response)
            logger.error(f"DHIS2 request failed: {e}")
            return error_response
