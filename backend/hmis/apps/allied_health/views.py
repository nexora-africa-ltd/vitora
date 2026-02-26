"""
Views for Allied Health dashboard.

Provides a combined dashboard view aggregating stats from all allied health modules:
- Physiotherapy
- Nutrition/Dietetics
- Occupational Therapy
- Social Work
- Counselling

Also includes ClinicVisits from allied health clinic types for patients
checked into these clinics directly.
"""

from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.allied_health.serializers import AlliedHealthDashboardSerializer

# Allied health clinic types that should be included in the dashboard
ALLIED_HEALTH_CLINIC_TYPES = [
    "PHYSIO",
    "NUTRITION",
    "OT",
    "COUNSELLING",
    "MENTAL_HEALTH",
    "SOCIAL_WORK",
]


class AlliedHealthDashboardView(APIView):
    """
    Combined dashboard for all Allied Health services.

    Returns aggregated statistics from:
    - Physiotherapy
    - Nutrition/Dietetics
    - Occupational Therapy
    - Social Work
    - Counselling
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="allied_health_dashboard",
        summary="Get Allied Health dashboard statistics",
        description="Returns aggregated statistics from all allied health modules",
        responses={200: AlliedHealthDashboardSerializer},
        tags=["Allied Health"],
    )
    def get(self, request):
        """Get combined dashboard statistics."""
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

        # Physiotherapy stats
        physio_stats = self._get_physiotherapy_stats(today)

        # Nutrition stats
        nutrition_stats = self._get_nutrition_stats(today)

        # Occupational Therapy stats
        ot_stats = self._get_ot_stats(today)

        # Social Work stats
        sw_stats = self._get_social_work_stats(today, week_start)

        # Counselling stats
        counselling_stats = self._get_counselling_stats(today)

        # Today's sessions across all modules
        todays_sessions = self._get_todays_sessions(today)

        # Clinic queue stats for allied health clinics
        clinic_queue_stats = self._get_clinic_queue_stats(today)

        data = {
            "physiotherapy": physio_stats,
            "nutrition": nutrition_stats,
            "occupational_therapy": ot_stats,
            "social_work": sw_stats,
            "counselling": counselling_stats,
            "todays_sessions": todays_sessions,
            "clinic_queue_stats": clinic_queue_stats,
        }

        serializer = AlliedHealthDashboardSerializer(data)
        return Response(serializer.data)

    def _get_physiotherapy_stats(self, today):
        """Get physiotherapy module statistics."""
        try:
            from hmis.apps.physiotherapy.models import PhysiotherapyOrder, PhysiotherapySession

            orders = PhysiotherapyOrder.objects.all()
            sessions = PhysiotherapySession.objects.all()

            return {
                "pending_count": orders.filter(status="PENDING").count(),
                "in_progress_count": orders.filter(status="IN_PROGRESS").count(),
                "today_sessions_count": sessions.filter(
                    session_date=today, status__in=["SCHEDULED", "IN_PROGRESS"]
                ).count(),
                "completed_today_count": sessions.filter(
                    session_date=today, status="COMPLETED"
                ).count(),
            }
        except Exception:
            return {
                "pending_count": 0,
                "in_progress_count": 0,
                "today_sessions_count": 0,
                "completed_today_count": 0,
            }

    def _get_nutrition_stats(self, today):
        """Get nutrition module statistics."""
        try:
            from hmis.apps.nutrition.models import NutritionConsultation

            consultations = NutritionConsultation.objects.all()

            return {
                "pending_count": consultations.filter(status="PENDING").count(),
                "in_progress_count": consultations.filter(status="IN_PROGRESS").count(),
                "today_sessions_count": consultations.filter(
                    consultation_date=today, status__in=["SCHEDULED", "IN_PROGRESS"]
                ).count(),
                "completed_today_count": consultations.filter(
                    consultation_date=today, status="COMPLETED"
                ).count(),
                "consultations_count": consultations.filter(
                    status__in=["PENDING", "IN_PROGRESS", "SCHEDULED"]
                ).count(),
            }
        except Exception:
            return {
                "pending_count": 0,
                "in_progress_count": 0,
                "today_sessions_count": 0,
                "completed_today_count": 0,
                "consultations_count": 0,
            }

    def _get_ot_stats(self, today):
        """Get occupational therapy module statistics."""
        try:
            from hmis.apps.occupational_therapy.models import OTOrder, OTSession

            orders = OTOrder.objects.all()
            sessions = OTSession.objects.all()

            return {
                "pending_count": orders.filter(status="PENDING").count(),
                "in_progress_count": orders.filter(status="IN_PROGRESS").count(),
                "today_sessions_count": sessions.filter(
                    session_date=today, status__in=["SCHEDULED", "IN_PROGRESS"]
                ).count(),
                "completed_today_count": sessions.filter(
                    session_date=today, status="COMPLETED"
                ).count(),
            }
        except Exception:
            return {
                "pending_count": 0,
                "in_progress_count": 0,
                "today_sessions_count": 0,
                "completed_today_count": 0,
            }

    def _get_social_work_stats(self, today, week_start):
        """Get social work module statistics."""
        try:
            from hmis.apps.social_work.models import SocialWorkCase

            cases = SocialWorkCase.objects.all()

            return {
                "open_cases_count": cases.filter(status="OPEN").count(),
                "urgent_count": cases.filter(urgency="CRITICAL").count()
                + cases.filter(urgency="HIGH").count(),
                "this_week_count": cases.filter(created_at__date__gte=week_start).count(),
            }
        except Exception:
            return {
                "open_cases_count": 0,
                "urgent_count": 0,
                "this_week_count": 0,
            }

    def _get_counselling_stats(self, today):
        """Get counselling module statistics."""
        try:
            from hmis.apps.counselling.models import CounsellingReferral, CounsellingSession

            referrals = CounsellingReferral.objects.all()
            sessions = CounsellingSession.objects.all()

            return {
                "pending_count": referrals.filter(status="PENDING").count(),
                "in_progress_count": referrals.filter(status="IN_PROGRESS").count(),
                "today_sessions_count": sessions.filter(
                    session_date=today, status__in=["SCHEDULED", "IN_PROGRESS"]
                ).count(),
                "completed_today_count": sessions.filter(
                    session_date=today, status="COMPLETED"
                ).count(),
                "follow_ups_count": sessions.filter(session_type="FOLLOW_UP", status="SCHEDULED").count(),
            }
        except Exception:
            return {
                "pending_count": 0,
                "in_progress_count": 0,
                "today_sessions_count": 0,
                "completed_today_count": 0,
                "follow_ups_count": 0,
            }

    def _get_clinic_queue_stats(self, today):
        """
        Get queue statistics for patients checked into allied health clinics.

        This captures patients who are checked into PHYSIO, NUTRITION, OT,
        COUNSELLING, MENTAL_HEALTH, or SOCIAL_WORK clinic types directly,
        without necessarily having an allied health order.
        """
        try:
            from hmis.apps.clinics.models import ClinicVisit

            # Get today's clinic visits for allied health clinic types
            visits = ClinicVisit.objects.filter(
                session__session_date=today,
                session__clinic__clinic_type__in=ALLIED_HEALTH_CLINIC_TYPES,
            )

            # Group by clinic type
            stats_by_type = {}
            for clinic_type in ALLIED_HEALTH_CLINIC_TYPES:
                type_visits = visits.filter(session__clinic__clinic_type=clinic_type)
                stats_by_type[clinic_type.lower()] = {
                    "waiting_count": type_visits.filter(
                        status__in=["REGISTERED", "WAITING"]
                    ).count(),
                    "in_consultation_count": type_visits.filter(
                        status="IN_CONSULTATION"
                    ).count(),
                    "completed_count": type_visits.filter(
                        status="COMPLETED"
                    ).count(),
                    "total_today": type_visits.count(),
                }

            # Also include totals
            stats_by_type["totals"] = {
                "waiting_count": visits.filter(
                    status__in=["REGISTERED", "WAITING"]
                ).count(),
                "in_consultation_count": visits.filter(
                    status="IN_CONSULTATION"
                ).count(),
                "completed_count": visits.filter(
                    status="COMPLETED"
                ).count(),
                "total_today": visits.count(),
            }

            return stats_by_type
        except Exception:
            return {}

    def _get_todays_sessions(self, today):
        """Get all sessions scheduled for today across all modules."""
        sessions = []

        # Physiotherapy sessions
        try:
            from hmis.apps.physiotherapy.models import PhysiotherapySession

            physio_sessions = PhysiotherapySession.objects.filter(
                session_date=today
            ).select_related("order__patient", "order__treatment_type")[:10]

            for session in physio_sessions:
                sessions.append(
                    {
                        "id": session.id,
                        "session_number": session.session_number,
                        "scheduled_time": timezone.make_aware(
                            timezone.datetime.combine(session.session_date, session.start_time)
                        )
                        if session.start_time
                        else None,
                        "patient_name": session.order.patient.full_name,
                        "patient_mrn": session.order.patient.mrn,
                        "module": "PHYSIO",
                        "treatment_type": session.order.treatment_type.name,
                        "status": session.status,
                    }
                )
        except Exception:
            pass

        # OT sessions
        try:
            from hmis.apps.occupational_therapy.models import OTSession

            ot_sessions = OTSession.objects.filter(session_date=today).select_related(
                "order__patient", "order__treatment_type"
            )[:10]

            for session in ot_sessions:
                sessions.append(
                    {
                        "id": session.id,
                        "session_number": session.session_number,
                        "scheduled_time": timezone.make_aware(
                            timezone.datetime.combine(session.session_date, session.start_time)
                        )
                        if session.start_time
                        else None,
                        "patient_name": session.order.patient.full_name,
                        "patient_mrn": session.order.patient.mrn,
                        "module": "OT",
                        "treatment_type": session.order.treatment_type.name,
                        "status": session.status,
                    }
                )
        except Exception:
            pass

        # Counselling sessions
        try:
            from hmis.apps.counselling.models import CounsellingSession

            counselling_sessions = CounsellingSession.objects.filter(session_date=today).select_related(
                "referral__patient"
            )[:10]

            for session in counselling_sessions:
                sessions.append(
                    {
                        "id": session.id,
                        "session_number": session.session_number,
                        "scheduled_time": timezone.make_aware(
                            timezone.datetime.combine(session.session_date, session.start_time)
                        )
                        if session.start_time
                        else None,
                        "patient_name": session.referral.patient.full_name,
                        "patient_mrn": session.referral.patient.mrn,
                        "module": "COUNSELLING",
                        "treatment_type": session.get_session_type_display(),
                        "status": session.status,
                    }
                )
        except Exception:
            pass

        # Include ClinicVisits from allied health clinic types
        # This ensures patients checked directly into allied health clinics appear
        try:
            from hmis.apps.clinics.models import ClinicVisit

            clinic_visits = ClinicVisit.objects.filter(
                session__session_date=today,
                session__clinic__clinic_type__in=ALLIED_HEALTH_CLINIC_TYPES,
                status__in=["REGISTERED", "WAITING", "CALLED", "IN_CONSULTATION"],
            ).select_related("patient", "session__clinic")[:20]

            # Track already-added patient IDs to avoid duplicates
            existing_patient_ids = {s.get("patient_mrn") for s in sessions}

            for visit in clinic_visits:
                # Skip if we already have this patient from a module-specific session
                if visit.patient.mrn in existing_patient_ids:
                    continue

                clinic_type = visit.session.clinic.clinic_type
                module_map = {
                    "PHYSIO": "PHYSIO",
                    "NUTRITION": "NUTRITION",
                    "OT": "OT",
                    "COUNSELLING": "COUNSELLING",
                    "MENTAL_HEALTH": "COUNSELLING",
                    "SOCIAL_WORK": "SOCIAL_WORK",
                }

                sessions.append(
                    {
                        "id": f"cv-{visit.id}",  # Prefix to distinguish from module sessions
                        "session_number": visit.queue_number,
                        "scheduled_time": visit.registered_at,
                        "patient_name": visit.patient.full_name,
                        "patient_mrn": visit.patient.mrn,
                        "module": module_map.get(clinic_type, clinic_type),
                        "treatment_type": visit.chief_complaint or visit.session.clinic.name,
                        "status": visit.status,
                        "source": "CLINIC_QUEUE",  # Indicate this is from clinic queue
                    }
                )
        except Exception:
            pass

        # Sort by scheduled time
        sessions.sort(key=lambda x: x.get("scheduled_time") or timezone.now())

        return sessions[:20]  # Limit to 20 sessions
