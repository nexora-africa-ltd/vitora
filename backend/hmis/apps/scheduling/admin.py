"""
Django Admin configuration for Scheduling app.

Phase 1: Core Scheduling Foundation
"""

from django.contrib import admin

from hmis.apps.scheduling.models import Appointment, Resource, Schedule, ScheduleBreak, TimeSlot


class ScheduleBreakInline(admin.TabularInline):
    """Inline admin for schedule breaks."""

    model = ScheduleBreak
    extra = 0


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    """Admin for Resource model."""

    list_display = ["code", "name", "resource_type", "is_active", "capacity"]
    list_filter = ["resource_type", "is_active"]
    search_fields = ["name", "code"]
    ordering = ["resource_type", "name"]


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    """Admin for Schedule model."""

    list_display = [
        "resource",
        "schedule_type",
        "day_of_week",
        "start_time",
        "end_time",
        "is_active",
    ]
    list_filter = ["schedule_type", "day_of_week", "is_active"]
    search_fields = ["resource__name", "resource__code"]
    inlines = [ScheduleBreakInline]


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    """Admin for Appointment model."""

    list_display = [
        "appointment_number",
        "patient",
        "resource",
        "scheduled_start",
        "status",
        "priority",
    ]
    list_filter = ["status", "appointment_type", "priority"]
    search_fields = [
        "appointment_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "resource__name",
    ]
    date_hierarchy = "scheduled_start"
    readonly_fields = ["appointment_number", "created_at", "updated_at"]


@admin.register(TimeSlot)
class TimeSlotAdmin(admin.ModelAdmin):
    """Admin for TimeSlot model."""

    list_display = ["start_time", "end_time", "timezone", "duration_minutes"]
    list_filter = ["timezone"]
