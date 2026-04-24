"""
Read-only API views for projection read models.

These endpoints expose denormalized, pre-computed statistics for
real-time dashboards. Data is updated asynchronously via domain events.
"""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import resolve_request_tenant
from hmis.apps.core.projections.models import (
    ClinicQueueStats,
    PharmacyQueueStats,
    RoomUtilizationStats,
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


class RoomUtilizationStatsSerializer(serializers.ModelSerializer):
    room_name = serializers.SerializerMethodField()
    clinic_name = serializers.SerializerMethodField()

    class Meta:
        model = RoomUtilizationStats
        fields = [
            "facility_id",
            "room_id",
            "room_name",
            "clinic_id",
            "clinic_name",
            "stat_date",
            "staffed_minutes",
            "consultation_minutes",
            "utilization_rate",
            "visits_completed",
            "no_show_count",
            "avg_wait_to_room_minutes",
            "avg_consultation_minutes",
            "active_clinicians_count",
            "last_updated",
        ]

    def get_room_name(self, obj):
        from hmis.apps.scheduling.models import Resource

        room = Resource.objects.filter(pk=obj.room_id).only("name").first()
        return room.name if room else None

    def get_clinic_name(self, obj):
        if not obj.clinic_id:
            return None
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.filter(pk=obj.clinic_id).only("name").first()
        return clinic.name if clinic else None


# =============================================================================
# Views
# =============================================================================


@extend_schema(
    parameters=[
        OpenApiParameter("clinic_id", OpenApiTypes.INT, required=True),
        OpenApiParameter("facility_id", OpenApiTypes.INT, required=False),
    ],
    responses={200: ClinicQueueStatsSerializer(many=True)},
)
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


@extend_schema(
    parameters=[
        OpenApiParameter("ward_id", OpenApiTypes.INT, required=False),
        OpenApiParameter("facility_id", OpenApiTypes.INT, required=False),
    ],
    responses={200: WardOccupancyStatsSerializer(many=True)},
)
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


@extend_schema(
    parameters=[OpenApiParameter("facility_id", OpenApiTypes.INT, required=False)],
    responses={200: PharmacyQueueStatsSerializer(many=True)},
)
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


def _get_request_facility_id(request):
    resolve_request_tenant(request)
    facility = getattr(request, "facility", None)
    if facility:
        return facility.id
    if getattr(request.user, "is_superuser", False):
        facility_id = request.query_params.get("facility_id")
        return int(facility_id) if facility_id else None
    return None


@extend_schema(
    parameters=[
        OpenApiParameter("date", OpenApiTypes.DATE, required=False),
        OpenApiParameter("clinic_id", OpenApiTypes.INT, required=False),
        OpenApiParameter("room_id", OpenApiTypes.INT, required=False),
        OpenApiParameter("facility_id", OpenApiTypes.INT, required=False),
    ],
    responses={200: RoomUtilizationStatsSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def room_utilization_stats(request):
    """
    GET /api/projections/room-utilization/

    Returns room utilization rows scoped to the current facility.
    Optional query params: date, clinic_id, room_id.
    """
    facility_id = _get_request_facility_id(request)
    if not facility_id:
        return Response([], status=status.HTTP_200_OK)

    filters = {"facility_id": facility_id}
    stat_date = request.query_params.get("date")
    if stat_date:
        filters["stat_date"] = stat_date
    room_id = request.query_params.get("room_id")
    if room_id:
        filters["room_id"] = room_id
    clinic_id = request.query_params.get("clinic_id")
    if clinic_id:
        filters["clinic_id"] = clinic_id

    qs = RoomUtilizationStats.objects.filter(**filters).order_by("-utilization_rate", "room_id")
    serializer = RoomUtilizationStatsSerializer(qs, many=True)
    return Response(serializer.data)


@extend_schema(
    parameters=[
        OpenApiParameter("date", OpenApiTypes.DATE, required=False),
        OpenApiParameter("facility_id", OpenApiTypes.INT, required=False),
    ],
    responses={
        200: inline_serializer(
            name="RoomUtilizationSummaryResponse",
            fields={
                "total_rooms": serializers.IntegerField(),
                "staffed_rooms": serializers.IntegerField(),
                "active_rooms": serializers.IntegerField(),
                "idle_rooms": serializers.IntegerField(),
                "overloaded_rooms": serializers.IntegerField(),
                "total_visits_completed": serializers.IntegerField(),
                "avg_utilization_rate": serializers.FloatField(),
                "avg_wait_to_room_minutes": serializers.FloatField(),
            },
        )
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def room_utilization_summary(request):
    """
    GET /api/projections/room-utilization/summary/

    Returns facility-level room utilization KPI aggregates.
    """
    facility_id = _get_request_facility_id(request)
    if not facility_id:
        return Response(
            {
                "total_rooms": 0,
                "staffed_rooms": 0,
                "active_rooms": 0,
                "idle_rooms": 0,
                "overloaded_rooms": 0,
                "total_visits_completed": 0,
                "avg_utilization_rate": 0.0,
                "avg_wait_to_room_minutes": 0.0,
            }
        )

    filters = {"facility_id": facility_id}
    stat_date = request.query_params.get("date")
    if stat_date:
        filters["stat_date"] = stat_date

    qs = RoomUtilizationStats.objects.filter(**filters)
    rows = list(qs)
    total_rooms = len(rows)
    staffed_rooms = sum(1 for row in rows if row.staffed_minutes > 0)
    active_rooms = sum(1 for row in rows if row.active_clinicians_count > 0)
    idle_rooms = sum(1 for row in rows if row.consultation_minutes == 0)
    overloaded_rooms = sum(1 for row in rows if float(row.utilization_rate) >= 85)
    total_visits_completed = sum(row.visits_completed for row in rows)
    avg_utilization_rate = (
        round(sum(float(row.utilization_rate) for row in rows) / total_rooms, 2)
        if total_rooms
        else 0.0
    )
    avg_wait_to_room_minutes = (
        round(sum(float(row.avg_wait_to_room_minutes) for row in rows) / total_rooms, 2)
        if total_rooms
        else 0.0
    )

    return Response(
        {
            "total_rooms": total_rooms,
            "staffed_rooms": staffed_rooms,
            "active_rooms": active_rooms,
            "idle_rooms": idle_rooms,
            "overloaded_rooms": overloaded_rooms,
            "total_visits_completed": total_visits_completed,
            "avg_utilization_rate": avg_utilization_rate,
            "avg_wait_to_room_minutes": avg_wait_to_room_minutes,
        }
    )
