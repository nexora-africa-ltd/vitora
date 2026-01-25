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
}

# Timezone configuration
app.conf.timezone = "Africa/Nairobi"
