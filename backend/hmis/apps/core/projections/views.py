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

    Falls back to live computation from Inpatient Ward/Bed models when
    the projection table has no matching records.
    """
    filters = {}
    ward_id = request.query_params.get("ward_id")
    if ward_id:
        filters["ward_id"] = ward_id

    facility_id = request.query_params.get("facility_id")
    if facility_id:
        filters["facility_id"] = facility_id

    # Always compute from source models for accuracy; projection table
    # may be stale if domain events were not fired for all data paths.
    data = _compute_live_ward_occupancy(filters)
    return Response(data)


def _compute_live_ward_occupancy(filters: dict) -> list[dict]:
    """Compute ward occupancy from Inpatient Ward/Bed models."""
    from django.db.models import Count, Q
    from django.utils import timezone as tz

    from hmis.apps.inpatient.models import Admission, Ward

    ward_filters = {}
    if filters.get("ward_id"):
        ward_filters["id"] = filters["ward_id"]
    if filters.get("facility_id"):
        ward_filters["facility_id"] = filters["facility_id"]

    wards = Ward.objects.filter(**ward_filters).annotate(
        total_bed_count=Count("beds"),
        occupied_bed_count=Count("beds", filter=Q(beds__status="OCCUPIED")),
        available_bed_count=Count("beds", filter=Q(beds__status="AVAILABLE")),
    )

    today = tz.now().date()
    results = []
    for ward in wards:
        total = ward.total_bed_count
        occupied = ward.occupied_bed_count
        available = ward.available_bed_count
        occupancy_rate = round((occupied / total) * 100, 2) if total > 0 else 0

        admissions_today = Admission.objects.filter(ward=ward, admission_date__date=today).count()
        discharges_today = Admission.objects.filter(ward=ward, discharge_date__date=today).count()

        results.append(
            {
                "facility_id": ward.facility_id,
                "ward_id": ward.id,
                "total_beds": total,
                "occupied_beds": occupied,
                "available_beds": available,
                "occupancy_rate": occupancy_rate,
                "admissions_today": admissions_today,
                "discharges_today": discharges_today,
                "last_updated": tz.now().isoformat(),
            }
        )
    return results


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

    Falls back to live computation from Pharmacy models when
    the projection table has no matching records.
    """
    filters = {}
    facility_id = request.query_params.get("facility_id")
    if facility_id:
        filters["facility_id"] = facility_id

    # Always compute from source models for accuracy; projection table
    # may be stale if domain events were not fired for all data paths.
    data = _compute_live_pharmacy_queue(filters)
    return Response(data)


def _compute_live_pharmacy_queue(filters: dict) -> list[dict]:
    """Compute pharmacy queue stats from Prescription and StockAlert models."""
    from django.db.models import Count
    from django.utils import timezone as tz

    from hmis.apps.pharmacy.models import Prescription, StockAlert

    today = tz.localdate()
    rx_filters = {}
    if filters.get("facility_id"):
        rx_filters["facility_id"] = filters["facility_id"]

    # Group prescriptions by facility
    pending_qs = (
        Prescription.objects.filter(status="PENDING", facility_id__isnull=False, **rx_filters)
        .values("facility_id")
        .annotate(count=Count("id"))
    )
    dispensed_qs = (
        Prescription.objects.filter(
            status="DISPENSED",
            updated_at__date=today,
            facility_id__isnull=False,
            **rx_filters,
        )
        .values("facility_id")
        .annotate(count=Count("id"))
    )

    # Collect all facility IDs
    facility_ids = set()
    pending_map: dict[int, int] = {}
    dispensed_map: dict[int, int] = {}

    for row in pending_qs:
        fid = row["facility_id"]
        facility_ids.add(fid)
        pending_map[fid] = row["count"]

    for row in dispensed_qs:
        fid = row["facility_id"]
        facility_ids.add(fid)
        dispensed_map[fid] = row["count"]

    # Stock alerts (unresolved)
    alert_filters_direct: dict = {}
    if filters.get("facility_id"):
        alert_filters_direct["facility_id"] = filters["facility_id"]

    critical_qs = (
        StockAlert.objects.filter(severity="CRITICAL", is_resolved=False, **alert_filters_direct)
        .values("facility_id")
        .annotate(count=Count("id"))
    )
    low_qs = (
        StockAlert.objects.filter(alert_type="LOW_STOCK", is_resolved=False, **alert_filters_direct)
        .values("facility_id")
        .annotate(count=Count("id"))
    )

    critical_map: dict[int, int] = {}
    low_map: dict[int, int] = {}
    for row in critical_qs:
        fid = row["facility_id"]
        facility_ids.add(fid)
        critical_map[fid] = row["count"]
    for row in low_qs:
        fid = row["facility_id"]
        facility_ids.add(fid)
        low_map[fid] = row["count"]

    now_iso = tz.now().isoformat()
    results = []
    for fid in facility_ids:
        results.append(
            {
                "facility_id": fid,
                "pending_prescriptions": pending_map.get(fid, 0),
                "dispensed_today": dispensed_map.get(fid, 0),
                "critical_stock_count": critical_map.get(fid, 0),
                "low_stock_count": low_map.get(fid, 0),
                "last_updated": now_iso,
            }
        )
    return results


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
