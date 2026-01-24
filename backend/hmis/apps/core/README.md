# Core Module

The Core module provides foundational services, models, and utilities shared across all Vitora HMIS modules. It includes audit logging, offline sync infrastructure, Kenya location hierarchy, RBAC (Role-Based Access Control), and notification systems.

## Overview

This module provides functionality for:
- **Audit Logging** - Kenya DPA 2019 compliant audit trails
- **Offline Sync** - Queue-based sync with conflict resolution
- **Kenya Locations** - 47 Counties → 289 Sub-Counties → 1,448 Wards
- **RBAC** - Roles, departments, and staff profiles
- **Notifications** - In-app notification system
- **Activity Feed** - Real-time dashboard activity stream
- **Idempotency** - Duplicate request prevention

## Models

### AuditLog
Kenya Data Protection Act 2019 compliant audit trail.

| Field | Description |
|-------|-------------|
| `user` | User who performed the action (nullable for system) |
| `action` | Action type (login_success, patient_view, etc.) |
| `resource_type` | Resource accessed (Patient, Encounter, etc.) |
| `resource_id` | ID of the resource |
| `timestamp` | When the action occurred |
| `ip_address` | Client IP address |
| `user_agent` | Browser/client user agent |
| `details` | JSON field for additional context |
| `patient_id` | Denormalized patient ID for sensitive access tracking |

**Action Types:**
- Authentication: `login_success`, `login_failed`, `logout`, `token_refresh`
- Patient: `patient_create`, `patient_view`, `patient_update`, `patient_delete`, `patient_list`
- Sensitive: `view_sensitive_patient`, `sensitive_access_denied`
- Encounter: `encounter_create`, `encounter_view`, `encounter_update`, `encounter_delete`
- System: `system_error`, `data_export`
- Clinic: `overdue_appointment_alert`, `appointment_reminder`

**Usage:**
```python
from hmis.apps.core.models import AuditLog

AuditLog.log(
    action="patient_view",
    user=request.user,
    resource_type="Patient",
    resource_id=patient.id,
    ip_address=get_client_ip(request),
    details={"purpose": "clinical consultation"},
    patient_id=patient.id,
)
```

### FrontendEvent
Track frontend user interactions for UX analytics.

| Field | Description |
|-------|-------------|
| `user` | User who triggered the event |
| `event_type` | Type (page_view, encounter_open, form_save, etc.) |
| `resource_type` | Resource type (Patient, Encounter, etc.) |
| `resource_id` | ID of the resource |
| `client_timestamp` | When event occurred on client |
| `server_timestamp` | When event was received |
| `session_id` | Client session identifier |
| `device_type` | web, desktop, mobile |
| `details` | JSON field for event metadata |
| `was_offline` | Whether event occurred offline |

### ActivityFeed
Dashboard activity stream for user-facing notifications.

| Field | Description |
|-------|-------------|
| `activity_type` | Category (patient, encounter, laboratory, pharmacy, etc.) |
| `action` | Action performed (registered, completed, dispensed, etc.) |
| `title` | Human-readable title |
| `description` | Additional context |
| `timestamp` | When activity occurred |
| `user` | User who performed the action |
| `resource_type` | Type of resource |
| `resource_id` | ID of the resource |
| `metadata` | JSON field for structured data (MRN, patient name, etc.) |

**Usage:**
```python
from hmis.apps.core.models import ActivityFeed

ActivityFeed.log_activity(
    activity_type="patient",
    action="registered",
    title="New patient registered",
    resource_type="Patient",
    resource_id=patient.id,
    user=request.user,
    metadata={"mrn": patient.mrn, "name": patient.get_full_name()},
)
```

---

## Offline Sync Models

### SyncQueue
Queue for tracking local changes that need synchronization.

| Field | Description |
|-------|-------------|
| `operation` | CREATE, UPDATE, DELETE |
| `model_name` | Name of the model being synced |
| `record_id` | ID of the record (null for new records) |
| `data` | Serialized data for the operation |
| `status` | PENDING, SYNCING, SYNCED, FAILED, CONFLICT |
| `retry_count` | Number of sync attempts |
| `error_message` | Error message if failed |
| `created_at` | When entry was queued |
| `synced_at` | When entry was synced |

**Methods:**
```python
entry.mark_syncing()      # Set status to SYNCING
entry.mark_synced()       # Set status to SYNCED, update synced_at
entry.mark_failed(error)  # Set status to FAILED, increment retry_count
entry.mark_conflict()     # Set status to CONFLICT
```

### SyncConflict
Record of sync conflicts for resolution.

| Field | Description |
|-------|-------------|
| `model_name` | Name of the model with conflict |
| `record_id` | ID of the record |
| `field_name` | Specific field with conflict (if field-level) |
| `local_data` | Local version of the data |
| `remote_data` | Remote version of the data |
| `resolved_data` | Final resolved data |
| `resolution_strategy` | LAST_WRITE_WINS, LOCAL_WINS, REMOTE_WINS, MANUAL, MERGED |
| `status` | PENDING, RESOLVED, DISMISSED |
| `detected_at` | When conflict was detected |
| `resolved_at` | When conflict was resolved |
| `resolved_by` | User who resolved (if manual) |

### NetworkStatus
Track network connectivity over time.

| Field | Description |
|-------|-------------|
| `is_online` | Whether system is online |
| `last_check` | When status was last checked |
| `latency_ms` | Network latency in milliseconds |
| `server_url` | Server URL that was checked |

### SyncMetrics
Track sync task performance metrics.

| Field | Description |
|-------|-------------|
| `task_id` | Celery task ID |
| `task_name` | Name of the task |
| `started_at` | When task started |
| `completed_at` | When task completed |
| `duration_ms` | Duration in milliseconds |
| `entries_processed` | Number of entries processed |
| `entries_succeeded` | Number successfully synced |
| `entries_failed` | Number that failed |
| `entries_conflicts` | Number with conflicts |
| `status` | running, completed, failed |

---

## Kenya Location Hierarchy

### County
Kenya's 47 counties (first administrative level).

| Field | Description |
|-------|-------------|
| `code` | County code (1-47) |
| `name` | County name (e.g., "Nairobi") |

### SubCounty
289 sub-counties (second administrative level).

| Field | Description |
|-------|-------------|
| `county` | Parent county (FK) |
| `name` | Sub-county name |

### Ward
1,448 wards (third administrative level).

| Field | Description |
|-------|-------------|
| `sub_county` | Parent sub-county (FK) |
| `name` | Ward name |

---

## RBAC Models

### Department
Hospital department for staff organization.

| Field | Description |
|-------|-------------|
| `code` | Unique department code (e.g., OPD, IPD, LAB) |
| `name` | Department name |
| `department_type` | CLINICAL, ADMINISTRATIVE, SUPPORT, LABORATORY, PHARMACY, RADIOLOGY, RECORDS |
| `parent` | Parent department (for hierarchy) |
| `head` | Department head (StaffProfile) |
| `is_active` | Whether department is active |

**Methods:**
```python
department.get_staff_count()     # Count of active staff
department.get_hierarchy()       # Full parent chain from root
department.get_subdepartments()  # Child departments
```

### Role
Role with hierarchical permissions.

| Field | Description |
|-------|-------------|
| `code` | Unique role code (e.g., DOCTOR, NURSE) |
| `name` | Role name |
| `category` | CLINICAL, ADMINISTRATIVE, TECHNICAL, MANAGEMENT, COMMUNITY |
| `description` | Role description |
| `permissions_matrix` | JSON permission matrix |
| `hierarchy_level` | Hierarchy level (0=highest) |
| `parent_role` | Parent role for inheritance |
| `django_group` | Linked Django Group |
| `requires_license` | Whether role requires medical license |
| `license_body` | Licensing body (KMPDB, NCK, etc.) |

**Permission Matrix Example:**
```json
{
    "Patient": {"create": true, "read": true, "update": true, "delete": false},
    "Encounter": {"create": true, "read": true, "update": true, "delete": false},
    "Prescription": {"create": true, "read": true, "update": false, "delete": false}
}
```

**Methods:**
```python
role.has_permission("read", "Patient")  # Check specific permission
role.get_all_permissions()               # Include inherited permissions
role.can_access_department(department)   # Check department access
```

### StaffProfile
Extended profile for hospital staff.

| Field | Description |
|-------|-------------|
| `user` | Linked User account |
| `employee_id` | Unique employee ID (e.g., VH-2026-001) |
| `title` | Title (Dr., Nurse, etc.) |
| `middle_name` | Middle name |
| `primary_role` | Primary Role (FK) |
| `secondary_roles` | Additional roles (M2M) |
| `primary_department` | Primary Department (FK) |
| `secondary_departments` | Additional departments (M2M) |
| `hwr_id` | Health Worker Registry ID (Kenya) |
| `license_number` | Professional license number |
| `license_expiry` | License expiry date |
| `license_verified` | Whether license verified via DHA |
| `licensing_body` | Regulatory body |
| `specialization` | Medical specialization |
| `phone_number` | Contact phone |
| `emergency_contact_name` | Emergency contact |
| `emergency_contact_phone` | Emergency contact phone |
| `employment_status` | ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED |
| `employment_type` | PERMANENT, CONTRACT, LOCUM |
| `date_joined` | Date joined organization |
| `date_left` | Date left organization |
| `supervisor` | Direct supervisor (StaffProfile) |

**Methods:**
```python
staff.get_full_name()                     # Title + full name
staff.get_all_roles()                     # Primary + secondary roles
staff.get_all_departments()               # Primary + secondary departments
staff.has_permission("create", "Patient") # Check permission from all roles
staff.is_license_valid()                  # Check license expiry
staff.is_external                         # True if LOCUM employment type
staff.get_supervisees()                   # Direct reports
```

---

## Notification Model

### Notification
In-app notifications for users.

| Field | Description |
|-------|-------------|
| `user` | User receiving notification |
| `notification_type` | Category (lab_result, appointment, etc.) |
| `priority` | LOW, NORMAL, HIGH, CRITICAL |
| `title` | Short title (max 200 chars) |
| `message` | Full message |
| `related_model` | Related model name |
| `related_id` | Related object ID |
| `action_url` | URL for user action |
| `is_read` | Whether notification read |
| `read_at` | When marked as read |
| `created_at` | When created |

**Methods:**
```python
notification.mark_as_read()  # Mark as read with timestamp
```

---

## Idempotency Model

### IdempotencyKey
Prevent duplicate API requests.

| Field | Description |
|-------|-------------|
| `key` | Idempotency key from client (UUID) |
| `user` | User who made the request |
| `resource_type` | Type of resource created |
| `resource_id` | ID of created resource |
| `response_status` | HTTP status code |
| `response_data` | Response data to replay |
| `created_at` | When key was created |

**Class Methods:**
```python
IdempotencyKey.get_or_none(key, user)  # Get existing key
IdempotencyKey.cleanup_old_keys(24)    # Delete keys older than 24 hours
```

---

## API Endpoints

### Audit Logs
```
GET  /api/auditlogs/                    # List audit logs (admin only)
GET  /api/auditlogs/?user={id}          # Filter by user
GET  /api/auditlogs/?action=patient_view  # Filter by action
GET  /api/auditlogs/?patient_id={id}    # Filter by patient
```

### Kenya Locations
```
GET  /api/locations/counties/                        # List all 47 counties
GET  /api/locations/sub-counties/?county={id}        # Sub-counties for county
GET  /api/locations/wards/?sub_county={id}           # Wards for sub-county
```

### Staff & Roles
```
GET   /api/staff/                       # List staff profiles
POST  /api/staff/                       # Create staff profile
GET   /api/staff/{id}/                  # Get staff profile
PATCH /api/staff/{id}/                  # Update staff profile
GET   /api/staff/me/                    # Get current user's profile

GET   /api/roles/                       # List roles
GET   /api/departments/                 # List departments
```

### Notifications
```
GET   /api/notifications/               # List user's notifications
GET   /api/notifications/unread/        # List unread notifications
POST  /api/notifications/{id}/read/     # Mark as read
POST  /api/notifications/read-all/      # Mark all as read
```

### Sync Status
```
GET   /api/sync/status/                 # Get sync status
GET   /api/sync/queue/                  # View sync queue
POST  /api/sync/trigger/                # Trigger manual sync
GET   /api/sync/conflicts/              # List conflicts
POST  /api/sync/conflicts/{id}/resolve/ # Resolve conflict
```

### Activity Feed
```
GET  /api/activity/                     # Get activity feed
GET  /api/activity/?type=patient        # Filter by type
GET  /api/activity/?limit=20            # Limit results
```

### Frontend Events
```
POST /api/events/                       # Log frontend event
POST /api/events/batch/                 # Log batch of events (offline sync)
```

---

## Celery Tasks

### Sync Tasks
```python
from hmis.apps.core.tasks import (
    process_sync_queue,       # Process pending sync entries
    run_full_sync,            # Full sync of all pending entries
)

# Trigger sync manually
process_sync_queue.delay(batch_size=50, max_retries=3)
```

### Alert Tasks
```python
from hmis.apps.core.tasks import (
    send_overdue_appointment_alerts,      # Daily overdue alerts
    send_upcoming_appointment_reminders,  # 1-3 day reminders
    generate_defaulter_list,              # Generate defaulter list
)

# Generate defaulter list for specific clinic
result = generate_defaulter_list.delay(clinic_id=1)
```

### Cleanup Tasks
```python
from hmis.apps.core.tasks import cleanup_idempotency_keys
cleanup_idempotency_keys.delay(hours=24)  # Clean up old keys
```

---

## Abstract Base Models

### TimeStampedModel
Abstract model with `created_at` and `updated_at` timestamps.

```python
from hmis.apps.core.models import TimeStampedModel

class MyModel(TimeStampedModel):
    name = models.CharField(max_length=100)
    # created_at and updated_at are automatically added
```

### SyncableModel
Abstract model for offline sync support.

```python
from hmis.apps.core.models import SyncableModel

class MyModel(SyncableModel):
    name = models.CharField(max_length=100)
    # Adds: version, sync_status, last_synced_at, server_id
    
    def save(self, *args, **kwargs):
        self.increment_version()
        super().save(*args, **kwargs)
```

---

## Permissions

The core module provides permission utilities:

```python
from hmis.apps.core.permissions import (
    SensitiveAccessPermission,  # Check sensitive patient access
    StaffOnlyPermission,        # Require staff profile
    RoleBasedPermission,        # Check role permissions
)
```

---

## Management Commands

```bash
# Import Kenya location hierarchy from CSV
python manage.py import_kenya_locations

# Load default roles from fixture
python manage.py load_default_roles

# Sync role permissions with Django groups
python manage.py sync_role_permissions

# Create test user with staff profile
python manage.py create_test_user --username testuser --role DOCTOR

# Seed demo data
python manage.py seed_demo_data
```

---

## Testing

```bash
# Run core module tests
cd backend
poetry run pytest tests/test_core*.py -v

# Run sync tests
poetry run pytest tests/test_sync*.py -v

# Run RBAC tests
poetry run pytest tests/test_rbac*.py -v
```

---

## Integration Points

- **All Modules** - AuditLog is called from all ViewSets for compliance
- **Patient Module** - Uses Kenya location hierarchy, sensitive access logging
- **Encounters Module** - Activity feed integration
- **Laboratory Module** - Notification system for lab results
- **Pharmacy Module** - Notification system for prescriptions
- **Clinics Module** - Alert tasks for chronic care follow-up
- **Billing Module** - Activity feed for billing events
- **Frontend** - WebSocket notifications, event logging

---

## Configuration

### Settings
```python
# settings/base.py

# Audit log retention (Kenya DPA requires 7 years)
AUDIT_LOG_RETENTION_YEARS = 7

# Sync configuration
SYNC_BATCH_SIZE = 50
SYNC_MAX_RETRIES = 3
SYNC_RETRY_DELAY_BASE = 60  # seconds

# Idempotency key TTL
IDEMPOTENCY_KEY_TTL_HOURS = 24
```

### Celery Beat Schedule
```python
# celery.py

CELERY_BEAT_SCHEDULE = {
    'process-sync-queue': {
        'task': 'core.process_sync_queue',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
    },
    'send-overdue-alerts': {
        'task': 'core.send_overdue_appointment_alerts',
        'schedule': crontab(hour=8, minute=0),  # Daily at 8 AM
    },
    'send-appointment-reminders': {
        'task': 'core.send_upcoming_appointment_reminders',
        'schedule': crontab(hour=7, minute=0),  # Daily at 7 AM
    },
    'cleanup-idempotency-keys': {
        'task': 'core.cleanup_idempotency_keys',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM
    },
}
```
