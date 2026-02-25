"""
Serializers for Allied Health dashboard.
"""

from datetime import date

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

    id = serializers.IntegerField()
    session_number = serializers.CharField()
    scheduled_time = serializers.DateTimeField()
    patient_name = serializers.CharField()
    patient_mrn = serializers.CharField()
    module = serializers.CharField()
    treatment_type = serializers.CharField()
    status = serializers.CharField()


class AlliedHealthDashboardSerializer(serializers.Serializer):
    """Combined dashboard stats for all allied health modules."""

    physiotherapy = PhysiotherapyStatsSerializer()
    nutrition = NutritionStatsSerializer()
    occupational_therapy = OccupationalTherapyStatsSerializer()
    social_work = SocialWorkStatsSerializer()
    counselling = CounsellingStatsSerializer()
    todays_sessions = TodaySessionSerializer(many=True)
