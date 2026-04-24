"""
Serializers for Allied Health dashboard.
"""

from rest_framework import serializers


class AlliedHealthModuleStatsSerializer(serializers.Serializer):
    """Stats for a single allied health module."""

    pending_count = serializers.IntegerField()
    in_progress_count = serializers.IntegerField()
    today_sessions_count = serializers.IntegerField()
    completed_today_count = serializers.IntegerField()


class PhysiotherapyStatsSerializer(AlliedHealthModuleStatsSerializer):
    """Physiotherapy module stats."""

    pass


class NutritionStatsSerializer(AlliedHealthModuleStatsSerializer):
    """Nutrition module stats with additional consultation count."""

    consultations_count = serializers.IntegerField()


class OccupationalTherapyStatsSerializer(AlliedHealthModuleStatsSerializer):
    """Occupational Therapy module stats."""

    pass


class SocialWorkStatsSerializer(serializers.Serializer):
    """Social work module stats."""

    open_cases_count = serializers.IntegerField()
    urgent_count = serializers.IntegerField()
    this_week_count = serializers.IntegerField()


class CounsellingStatsSerializer(AlliedHealthModuleStatsSerializer):
    """Counselling module stats with additional follow-ups count."""

    follow_ups_count = serializers.IntegerField()


class TodaySessionSerializer(serializers.Serializer):
    """Today's session entry for dashboard."""

    id = serializers.CharField()  # Can be int or "cv-{id}" for clinic visits
    session_number = serializers.CharField(allow_null=True)
    scheduled_time = serializers.DateTimeField(allow_null=True)
    patient_name = serializers.CharField()
    patient_mrn = serializers.CharField()
    module = serializers.CharField()
    treatment_type = serializers.CharField()
    status = serializers.CharField()
    source = serializers.CharField(required=False, default="MODULE")  # MODULE or CLINIC_QUEUE


class ClinicTypeQueueStatsSerializer(serializers.Serializer):
    """Queue stats for a single clinic type."""

    waiting_count = serializers.IntegerField()
    in_consultation_count = serializers.IntegerField()
    completed_count = serializers.IntegerField()
    total_today = serializers.IntegerField()


class AlliedHealthClinicQueueStatsSerializer(serializers.Serializer):
    """Queue stats for all allied health clinic types."""

    physio = ClinicTypeQueueStatsSerializer(required=False)
    nutrition = ClinicTypeQueueStatsSerializer(required=False)
    ot = ClinicTypeQueueStatsSerializer(required=False)
    counselling = ClinicTypeQueueStatsSerializer(required=False)
    mental_health = ClinicTypeQueueStatsSerializer(required=False)
    social_work = ClinicTypeQueueStatsSerializer(required=False)
    totals = ClinicTypeQueueStatsSerializer(required=False)


# Backwards-compatible import alias for existing code/tests while keeping a
# distinct serializer class name for OpenAPI component generation.
ClinicQueueStatsSerializer = AlliedHealthClinicQueueStatsSerializer


class AlliedHealthDashboardSerializer(serializers.Serializer):
    """Combined dashboard stats for all allied health modules."""

    physiotherapy = PhysiotherapyStatsSerializer()
    nutrition = NutritionStatsSerializer()
    occupational_therapy = OccupationalTherapyStatsSerializer()
    social_work = SocialWorkStatsSerializer()
    counselling = CounsellingStatsSerializer()
    todays_sessions = TodaySessionSerializer(many=True)
    clinic_queue_stats = AlliedHealthClinicQueueStatsSerializer(required=False)
