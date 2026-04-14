"""
Read-only API views for projection read models.

These endpoints expose denormalized, pre-computed statistics for
real-time dashboards. Data is updated asynchronously via domain events.
"""

from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.projections.models import (
    ClinicQueueStats,
    PharmacyQueueStats,
    WardOccupancyStats,
)

# =============================================================================
# Serializers
# =============================================================================


class ClinicQueueStatsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicQueueStats
        fields = [
            "facility_id",
            "clinic_id",
            "waiting_count",
            "in_consultation_count",
            "completed_today",
            "no_show_today",
            "avg_wait_seconds",
            "longest_wait_seconds",
            "last_updated",
        ]


class WardOccupancyStatsSerializer(serializers.ModelSerializer):
    class Meta:
        model = WardOccupancyStats
        fields = [
            "facility_id",
            "ward_id",
            "total_beds",
            "occupied_beds",
            "available_beds",
            "occupancy_rate",
            "admissions_today",
            "discharges_today",
            "last_updated",
        ]


class PharmacyQueueStatsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyQueueStats
        fields = [
            "facility_id",
            "pending_prescriptions",
            "dispensed_today",
            "critical_stock_count",
            "low_stock_count",
            "last_updated",
        ]


# =============================================================================
# Views
# =============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def clinic_queue_stats(request):
    """
    GET /api/projections/clinic-queue/

    Query params:
    - clinic_id (required): Filter by clinic
    - facility_id (optional): Filter by facility
    """
    clinic_id = request.query_params.get("clinic_id")
    if not clinic_id:
        return Response(
            {"error": "clinic_id query parameter is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    filters = {"clinic_id": clinic_id}
    facility_id = request.query_params.get("facility_id")
    if facility_id:
        filters["facility_id"] = facility_id

    qs = ClinicQueueStats.objects.filter(**filters)
    serializer = ClinicQueueStatsSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ward_occupancy_stats(request):
    """
    GET /api/projections/ward-occupancy/

    Query params:
    - ward_id (optional): Filter by specific ward
    - facility_id (optional): Filter by facility
    """
    filters = {}
    ward_id = request.query_params.get("ward_id")
    if ward_id:
        filters["ward_id"] = ward_id

    facility_id = request.query_params.get("facility_id")
    if facility_id:
        filters["facility_id"] = facility_id

    qs = WardOccupancyStats.objects.filter(**filters)
    serializer = WardOccupancyStatsSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pharmacy_queue_stats(request):
    """
    GET /api/projections/pharmacy-queue/

    Query params:
    - facility_id (optional): Filter by facility
    """
    filters = {}
    facility_id = request.query_params.get("facility_id")
    if facility_id:
        filters["facility_id"] = facility_id

    qs = PharmacyQueueStats.objects.filter(**filters)
    serializer = PharmacyQueueStatsSerializer(qs, many=True)
    return Response(serializer.data)
