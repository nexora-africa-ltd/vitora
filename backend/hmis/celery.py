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
    # Billing tasks
    "hmis.apps.billing.tasks.poll_sha_claim_statuses": {"queue": "billing"},
    "hmis.apps.billing.tasks.submit_pending_sha_claims": {"queue": "billing"},
    # Quality reporting tasks
    "hmis.apps.quality.tasks.generate_quarterly_reports": {"queue": "reporting"},
    "hmis.apps.quality.tasks.generate_annual_reports": {"queue": "reporting"},
    # Triage escalation tasks
    "hmis.apps.triage.tasks.check_wait_time_breaches": {"queue": "monitoring"},
    "hmis.apps.triage.tasks.auto_resolve_breaches": {"queue": "monitoring"},
    # Analytics ETL tasks
    "hmis.apps.analytics.tasks.refresh_daily_analytics": {"queue": "reporting"},
    "hmis.apps.analytics.tasks.refresh_monthly_analytics": {"queue": "reporting"},
    "hmis.apps.analytics.tasks.refresh_demographics_snapshot": {"queue": "reporting"},
    # MOH Reporting tasks
    "hmis.apps.moh_reporting.tasks.generate_moh705_monthly": {"queue": "reporting"},
    "hmis.apps.moh_reporting.tasks.generate_moh711_monthly": {"queue": "reporting"},
    "hmis.apps.moh_reporting.tasks.generate_moh717_monthly": {"queue": "reporting"},
    # Scheduling attendance tasks
    "hmis.apps.scheduling.tasks.mark_absent_shifts": {"queue": "monitoring"},
    "hmis.apps.scheduling.tasks.auto_clock_out_stale_shifts": {"queue": "monitoring"},
    "hmis.apps.scheduling.tasks.send_shift_reminders": {"queue": "monitoring"},
    # HWR license verification
    "hmis.apps.core.tasks.verify_staff_hwr_licenses": {"queue": "monitoring"},
    # Laboratory analyzer tasks
    "laboratory.analyzers.check_channel_health": {"queue": "monitoring"},
    "laboratory.analyzers.retry_failed_messages": {"queue": "maintenance"},
    "laboratory.analyzers.broadcast_work_orders": {"queue": "laboratory"},
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
    # Billing agent: Poll SHA API for claim status updates every 15 minutes
    "billing-poll-sha-claim-statuses": {
        "task": "hmis.apps.billing.tasks.poll_sha_claim_statuses",
        "schedule": crontab(minute="*/15"),
    },
    # Billing agent: Poll DHA API for pre-authorization decisions every 5 minutes
    "billing-poll-preauth-statuses": {
        "task": "hmis.apps.billing.tasks.poll_preauth_statuses",
        "schedule": crontab(minute="*/5"),
    },
    # Billing: Refresh OTP whitelist statuses every 10 minutes
    "billing-refresh-otp-whitelist-statuses": {
        "task": "hmis.apps.billing.tasks.refresh_otp_whitelist_statuses",
        "schedule": crontab(minute="*/10"),
    },
    # Billing: Re-scrape SHA interventions catalog weekly (Sunday 3 AM)
    "billing-refresh-sha-interventions": {
        "task": "hmis.apps.billing.tasks.refresh_sha_interventions",
        "schedule": crontab(minute=0, hour=3, day_of_week="sunday"),
    },
    # Pharmacy: Expire overdue prescriptions daily at 1 AM
    "pharmacy-expire-prescriptions": {
        "task": "hmis.apps.pharmacy.tasks.expire_prescriptions",
        "schedule": crontab(minute=0, hour=1),
    },
    # Referrals: Expire stale PENDING referrals every 15 minutes
    "referrals-expire-referrals": {
        "task": "hmis.apps.referrals.tasks.expire_referrals",
        "schedule": crontab(minute="*/15"),
    },
    # Pharmacy: Generate expiring-soon Rx alerts daily at 6 AM
    "pharmacy-prescription-expiry-alerts": {
        "task": "hmis.apps.pharmacy.tasks.generate_prescription_expiry_alerts",
        "schedule": crontab(minute=0, hour=6),
    },
    # Analytics: Daily facility summaries at 2 AM
    "analytics-refresh-daily": {
        "task": "hmis.apps.analytics.tasks.refresh_daily_analytics",
        "schedule": crontab(minute=0, hour=2),
    },
    # Analytics: Monthly department + diagnosis trends on 1st at 3 AM
    "analytics-refresh-monthly": {
        "task": "hmis.apps.analytics.tasks.refresh_monthly_analytics",
        "schedule": crontab(minute=0, hour=3, day_of_month=1),
    },
    # Analytics: Demographics snapshot on 1st at 4 AM
    "analytics-refresh-demographics": {
        "task": "hmis.apps.analytics.tasks.refresh_demographics_snapshot",
        "schedule": crontab(minute=0, hour=4, day_of_month=1),
    },
    # MOH 705: Outpatient morbidity on 1st at 5 AM
    "generate-moh705-monthly": {
        "task": "hmis.apps.moh_reporting.tasks.generate_moh705_monthly",
        "schedule": crontab(minute=0, hour=5, day_of_month=1),
    },
    # MOH 711: Integrated RH/HIV/Malaria/Nutrition on 1st at 5:30 AM
    "generate-moh711-monthly": {
        "task": "hmis.apps.moh_reporting.tasks.generate_moh711_monthly",
        "schedule": crontab(minute=30, hour=5, day_of_month=1),
    },
    # MOH 717: Workload summary on 1st at 6 AM
    "generate-moh717-monthly": {
        "task": "hmis.apps.moh_reporting.tasks.generate_moh717_monthly",
        "schedule": crontab(minute=0, hour=6, day_of_month=1),
    },
    # Scheduling: Mark absent shifts — every 15 minutes during working hours
    "scheduling-mark-absent-shifts": {
        "task": "hmis.apps.scheduling.tasks.mark_absent_shifts",
        "schedule": crontab(minute="*/15", hour="6-22"),
    },
    # Scheduling: Auto clock-out stale shifts — every 30 minutes
    "scheduling-auto-clock-out-stale": {
        "task": "hmis.apps.scheduling.tasks.auto_clock_out_stale_shifts",
        "schedule": crontab(minute="*/30"),
    },
    # Scheduling: Expire pending swap requests — every 15 minutes
    "scheduling-expire-pending-swaps": {
        "task": "hmis.apps.scheduling.tasks.expire_pending_swap_requests",
        "schedule": crontab(minute="*/15"),
    },
    # Scheduling: Send clock-in reminders — every 5 minutes during working hours
    "scheduling-send-shift-reminders": {
        "task": "hmis.apps.scheduling.tasks.send_shift_reminders",
        "schedule": crontab(minute="*/5", hour="5-22"),
    },
    # Laboratory: Check analyzer channel health — every 5 minutes
    "lab-check-analyzer-channel-health": {
        "task": "laboratory.analyzers.check_channel_health",
        "schedule": crontab(minute="*/5"),
    },
    # Laboratory: Retry failed analyzer messages — every 15 minutes
    "lab-retry-failed-analyzer-messages": {
        "task": "laboratory.analyzers.retry_failed_messages",
        "schedule": crontab(minute="*/15"),
    },
    # Laboratory: Broadcast pending work orders to analyzers — every 10 minutes
    "lab-broadcast-work-orders": {
        "task": "laboratory.analyzers.broadcast_work_orders",
        "schedule": crontab(minute="*/10"),
    },
    # HWR: Verify staff licenses weekly (Sunday 4 AM)
    "core-verify-staff-hwr-licenses": {
        "task": "hmis.apps.core.tasks.verify_staff_hwr_licenses",
        "schedule": crontab(minute=0, hour=4, day_of_week="sunday"),
    },
}

# Timezone configuration
app.conf.timezone = "Africa/Nairobi"
