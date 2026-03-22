"""
Celery application configuration for Vitora HMIS.

This module configures Celery for background task processing,
particularly for offline sync operations.

Sprint 0.5: Offline Sync Logic
"""

import os

from celery import Celery
from celery.schedules import crontab

# Set the default Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings.development")

# Create the Celery app
app = Celery("hmis")

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Load task modules from all registered Django apps.
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task for testing Celery configuration."""
    print(f"Request: {self.request!r}")


# Configure task routing
app.conf.task_routes = {
    "hmis.apps.core.tasks.process_sync_queue": {"queue": "sync"},
    "hmis.apps.core.tasks.sync_single_entry": {"queue": "sync"},
    "hmis.apps.core.tasks.check_connectivity": {"queue": "monitoring"},
    "hmis.apps.core.tasks.cleanup_synced_entries": {"queue": "maintenance"},
    "hmis.apps.core.tasks.retry_failed_entries": {"queue": "maintenance"},
    "hmis.apps.core.tasks.full_sync": {"queue": "sync"},
    # Surveillance tasks
    "hmis.apps.surveillance.tasks.generate_idsr_weekly_report": {"queue": "reporting"},
    "hmis.apps.surveillance.tasks.check_overdue_notifications": {"queue": "monitoring"},
    "hmis.apps.surveillance.tasks.check_outbreak_thresholds": {"queue": "monitoring"},
    "hmis.apps.surveillance.tasks.submit_idsr_to_dhis2": {"queue": "reporting"},
    # Quality reporting tasks
    "hmis.apps.quality.tasks.generate_quarterly_reports": {"queue": "reporting"},
    "hmis.apps.quality.tasks.generate_annual_reports": {"queue": "reporting"},
    # Triage escalation tasks
    "hmis.apps.triage.tasks.check_wait_time_breaches": {"queue": "monitoring"},
    "hmis.apps.triage.tasks.auto_resolve_breaches": {"queue": "monitoring"},
}

# Configure periodic tasks (Celery Beat)
app.conf.beat_schedule = {
    "check-connectivity-every-minute": {
        "task": "hmis.apps.core.tasks.check_connectivity",
        "schedule": 60.0,  # Every 60 seconds
    },
    "process-sync-queue-every-5-minutes": {
        "task": "hmis.apps.core.tasks.process_sync_queue",
        "schedule": 300.0,  # Every 5 minutes
    },
    "cleanup-synced-entries-daily": {
        "task": "hmis.apps.core.tasks.cleanup_synced_entries",
        "schedule": 86400.0,  # Daily
        "kwargs": {"days_old": 30},
    },
    "retry-failed-entries-hourly": {
        "task": "hmis.apps.core.tasks.retry_failed_entries",
        "schedule": 3600.0,  # Every hour
    },
    "generate-monthly-clinic-reports": {
        "task": "hmis.apps.clinics.tasks.generate_monthly_clinic_reports",
        "schedule": crontab(minute=0, hour=1, day_of_month=1),
    },
    # IDSR Weekly Report - runs Sunday at midnight (Kenya time)
    "generate-idsr-weekly-report": {
        "task": "hmis.apps.surveillance.tasks.generate_idsr_weekly_report",
        "schedule": crontab(minute=0, hour=0, day_of_week="sunday"),
    },
    # Check for overdue notifications - every 4 hours
    "check-overdue-notifications": {
        "task": "hmis.apps.surveillance.tasks.check_overdue_notifications",
        "schedule": crontab(minute=0, hour="*/4"),
    },
    # Check outbreak thresholds - twice daily
    "check-outbreak-thresholds": {
        "task": "hmis.apps.surveillance.tasks.check_outbreak_thresholds",
        "schedule": crontab(minute=0, hour="6,18"),
    },
    # Quarterly reports - 1st day of each quarter at 2 AM
    "generate-quarterly-reports": {
        "task": "hmis.apps.quality.tasks.generate_quarterly_reports",
        "schedule": crontab(minute=0, hour=2, day_of_month=1, month_of_year="1,4,7,10"),
    },
    # Annual reports - January 2nd at 3 AM
    "generate-annual-reports": {
        "task": "hmis.apps.quality.tasks.generate_annual_reports",
        "schedule": crontab(minute=0, hour=3, day_of_month=2, month_of_year=1),
    },
    # Triage: Check for KETA wait time breaches every minute
    "check-wait-time-breaches-every-minute": {
        "task": "hmis.apps.triage.tasks.check_wait_time_breaches",
        "schedule": 60.0,  # Every 60 seconds
    },
    # Triage: Auto-resolve breaches for completed/LWBS patients every 5 minutes
    "auto-resolve-breaches-every-5-minutes": {
        "task": "hmis.apps.triage.tasks.auto_resolve_breaches",
        "schedule": 300.0,  # Every 5 minutes
    },
    # Billing agent: Daily bed charges for active IPD admissions at midnight
    "billing-apply-daily-bed-charges": {
        "task": "hmis.apps.billing.tasks.apply_daily_bed_charges",
        "schedule": crontab(minute=0, hour=0),
    },
    # Billing agent: Flag overdue invoices daily at 6 AM
    "billing-flag-overdue-invoices": {
        "task": "hmis.apps.billing.tasks.flag_overdue_invoices",
        "schedule": crontab(minute=0, hour=6),
    },
    # Billing agent: Submit pending SHA claims hourly
    "billing-submit-pending-sha-claims": {
        "task": "hmis.apps.billing.tasks.submit_pending_sha_claims",
        "schedule": crontab(minute=30, hour="*/1"),
    },
    # Pharmacy: Expire overdue prescriptions daily at 1 AM
    "pharmacy-expire-prescriptions": {
        "task": "hmis.apps.pharmacy.tasks.expire_prescriptions",
        "schedule": crontab(minute=0, hour=1),
    },
    # Pharmacy: Generate expiring-soon Rx alerts daily at 6 AM
    "pharmacy-prescription-expiry-alerts": {
        "task": "hmis.apps.pharmacy.tasks.generate_prescription_expiry_alerts",
        "schedule": crontab(minute=0, hour=6),
    },
}

# Timezone configuration
app.conf.timezone = "Africa/Nairobi"
