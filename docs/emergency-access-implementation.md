# Emergency Access (Break-Glass) Implementation

> **DHA Compliance**: P1 Required - Emergency Access Procedures
> **Kenya DPA 2019**: Section 32 (Lawful Bases - Vital Interests)
> **Completed**: February 22, 2026

---

## Overview

Emergency Access (also known as "break-glass") allows healthcare providers to bypass normal access controls during life-threatening situations. This is a regulatory requirement for healthcare systems, enabling clinicians to access patient records when:

- Patient is unconscious and cannot provide consent
- Life-threatening emergency requiring immediate action
- Mass casualty incidents
- Critical lab results requiring urgent intervention
- Medication emergencies
- Disaster response scenarios

All emergency access invocations are:
- **Time-limited** (15 minutes to 24 hours, default 4 hours)
- **Logged to audit trail** with full details
- **Subject to mandatory review** by administrators
- **Trigger automatic escalation alerts** via email/SMS

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Emergency Access Flow                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  Clinician  │────▶│  Break-Glass    │────▶│  AuditLog       │   │
│  │  Request    │     │  Invocation     │     │  Entry Created  │   │
│  └─────────────┘     └────────┬────────┘     └─────────────────┘   │
│                               │                                      │
│                    ┌──────────▼──────────┐                          │
│                    │  Celery Task        │                          │
│                    │  (Async)            │                          │
│                    └──────────┬──────────┘                          │
│                               │                                      │
│           ┌───────────────────┼───────────────────┐                 │
│           │                   │                   │                 │
│  ┌────────▼────────┐ ┌───────▼───────┐ ┌────────▼────────┐        │
│  │  Email Alert    │ │  SMS Alert    │ │  EmergencyAccess │        │
│  │  to Admins      │ │  to Admins    │ │  Record Saved    │        │
│  └─────────────────┘ └───────────────┘ └─────────────────┘        │
│                                                                      │
│                    ┌──────────────────────┐                         │
│                    │  Admin Dashboard     │                         │
│                    │  - Review pending    │                         │
│                    │  - Approve/Revoke    │                         │
│                    │  - View statistics   │                         │
│                    └──────────────────────┘                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### EmergencyAccess

| Field | Type | Description |
|-------|------|-------------|
| `user` | ForeignKey(User) | User who invoked emergency access |
| `patient` | ForeignKey(Patient) | Optional - specific patient or null for system-wide |
| `reason` | CharField | Predefined reason code |
| `reason_details` | TextField | Detailed justification (min 10 chars) |
| `requested_at` | DateTimeField | When access was requested |
| `expires_at` | DateTimeField | When access expires |
| `duration_minutes` | PositiveIntegerField | Duration (15-1440 mins, default 240) |
| `status` | CharField | ACTIVE, EXPIRED, REVOKED, REVIEWED |
| `approver` | ForeignKey(User) | Administrator who reviewed |
| `approved_at` | DateTimeField | When reviewed |
| `approval_notes` | TextField | Review notes |
| `revoked_by` | ForeignKey(User) | User who revoked (if applicable) |
| `revoked_at` | DateTimeField | When revoked |
| `revocation_reason` | TextField | Reason for revocation |
| `escalation_sent` | BooleanField | Whether admin notification sent |
| `escalation_sent_at` | DateTimeField | When notification sent |
| `ip_address` | GenericIPAddressField | Request IP for audit |
| `user_agent` | TextField | Browser/client info |

### EmergencyAccessReason (Choices)

| Code | Description |
|------|-------------|
| `LIFE_THREATENING` | Life-threatening emergency |
| `UNCONSCIOUS_PATIENT` | Patient unconscious/unable to consent |
| `MASS_CASUALTY` | Mass casualty incident |
| `CRITICAL_LAB_RESULT` | Critical lab result requiring immediate action |
| `MEDICATION_EMERGENCY` | Urgent medication information needed |
| `DISASTER_RESPONSE` | Disaster/emergency response |
| `OTHER` | Other (requires detailed justification) |

### EmergencyAccessStatus (Choices)

| Status | Description |
|--------|-------------|
| `ACTIVE` | Currently active, access granted |
| `EXPIRED` | Passed expiration time |
| `REVOKED` | Manually revoked by administrator |
| `REVIEWED` | Reviewed and closed by administrator |

---

## API Endpoints

Base URL: `/api/core/emergency-access/`

### Create Emergency Access (Break-Glass)

```http
POST /api/core/emergency-access/
Authorization: Bearer <token>
Content-Type: application/json

{
    "reason": "LIFE_THREATENING",
    "reason_details": "Patient arrived in critical condition with severe trauma. Need immediate access to medical history and current medications.",
    "duration_minutes": 120,
    "patient_mrn": "MRN-20260222-0001"  // Optional
}
```

**Response (201 Created):**
```json
{
    "id": 1,
    "user": 5,
    "user_username": "dr.jane",
    "user_full_name": "Dr. Jane Smith",
    "patient": 42,
    "patient_mrn": "MRN-20260222-0001",
    "patient_name": "John Doe",
    "reason": "LIFE_THREATENING",
    "reason_display": "Life-threatening emergency",
    "reason_details": "Patient arrived in critical condition...",
    "requested_at": "2026-02-22T10:30:00Z",
    "expires_at": "2026-02-22T12:30:00Z",
    "duration_minutes": 120,
    "status": "ACTIVE",
    "status_display": "Active",
    "is_active": true,
    "is_expired": false,
    "remaining_minutes": 119,
    "escalation_sent": true,
    "escalation_sent_at": "2026-02-22T10:30:05Z"
}
```

### List Emergency Access Records

```http
GET /api/core/emergency-access/
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Description |
|-----------|-------------|
| `status` | Filter by status (ACTIVE, EXPIRED, REVOKED, REVIEWED) |
| `pending_review` | Set to `true` to show only records needing review |
| `since` | ISO date - show records since this date |

**Note:** Regular users see only their own records. Admins/superusers see all records.

### Get Current User's Active Access

```http
GET /api/core/emergency-access/my_active/
Authorization: Bearer <token>
```

Returns array of user's currently active emergency access records.

### Review Emergency Access (Admin Only)

```http
POST /api/core/emergency-access/{id}/review/
Authorization: Bearer <token>
Content-Type: application/json

{
    "action": "approve",  // or "revoke"
    "notes": "Verified legitimate emergency use case."
}
```

**Required Permission:** `core.approve_emergency_access` or superuser

### Dashboard Statistics (Admin Only)

```http
GET /api/core/emergency-access/dashboard_stats/
Authorization: Bearer <token>
```

**Response:**
```json
{
    "total_active": 2,
    "total_pending_review": 5,
    "total_today": 3,
    "total_this_week": 12,
    "by_reason": {
        "LIFE_THREATENING": 5,
        "UNCONSCIOUS_PATIENT": 3,
        "MEDICATION_EMERGENCY": 4
    },
    "by_status": {
        "ACTIVE": 2,
        "EXPIRED": 3,
        "REVIEWED": 7
    }
}
```

**Required Permission:** `core.view_emergency_dashboard` or `core.approve_emergency_access` or superuser

---

## Permissions

| Permission | Codename | Description |
|------------|----------|-------------|
| Approve Emergency Access | `core.approve_emergency_access` | Can approve/revoke emergency access requests |
| Revoke Emergency Access | `core.revoke_emergency_access` | Can revoke active emergency access |
| View Dashboard | `core.view_emergency_dashboard` | Can view emergency access statistics |

---

## Audit Logging

All emergency access actions are logged to `AuditLog`:

| Action | When Logged |
|--------|-------------|
| `emergency_access_invoke` | When user invokes break-glass access |
| `emergency_access_approved` | When admin approves/reviews access |
| `emergency_access_revoked` | When admin revokes access |

**Audit Log Details Include:**
- User who invoked/reviewed
- Patient MRN (if specific patient)
- Reason and justification
- Duration and expiration
- IP address and user agent
- Review notes (for approvals/revocations)

---

## Escalation Alerts

When emergency access is invoked, the system automatically sends alerts to administrators via:

### Email Alert

Subject: `🚨 ALERT: Emergency Access Invoked by {username}`

Content includes:
- User information
- Patient details (if applicable)
- Reason and detailed justification
- Timestamps and duration
- IP address
- Link to review in admin dashboard

### SMS Alert (if configured)

Brief message: `🚨 VITORA ALERT: Emergency access by {username}. Reason: {reason}. Review required.`

**Recipients:** All active users who are either:
- Superusers
- Have `core.approve_emergency_access` permission

---

## Background Tasks (Celery)

### send_emergency_access_escalation

- **Queue:** Default
- **Trigger:** Immediately after emergency access creation
- **Retries:** 3 (with exponential backoff, max 5 minutes)
- **Actions:** Send email and SMS to administrators

### expire_emergency_access

- **Schedule:** Run every 5 minutes (configure in Celery Beat)
- **Action:** Update status to EXPIRED for records past expiration time

**Celery Beat Configuration:**
```python
# In hmis/celery.py
app.conf.beat_schedule = {
    'expire-emergency-access': {
        'task': 'hmis.apps.core.emergency_access.tasks.expire_emergency_access',
        'schedule': crontab(minute='*/5'),
    },
}
```

---

## Django Admin

Emergency access records are viewable in Django Admin at:
`/admin/core/emergencyaccess/`

Features:
- Color-coded status badges
- Filterable by status, reason, date
- Searchable by username, patient MRN
- Read-only fields for audit integrity
- Cannot add/delete records via admin (security)

---

## Frontend Integration

### Invoking Emergency Access

```typescript
// API call from frontend
const response = await fetch('/api/core/emergency-access/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    reason: 'LIFE_THREATENING',
    reason_details: 'Patient requires immediate intervention...',
    duration_minutes: 240,
    patient_mrn: 'MRN-20260222-0001',
  }),
});
```

### Checking Active Access

```typescript
// Check if user has active emergency access
const active = await fetch('/api/core/emergency-access/my_active/', {
  headers: { 'Authorization': `Bearer ${token}` },
});
const records = await active.json();

if (records.length > 0) {
  // User has active emergency access
  showEmergencyAccessBanner(records[0]);
}
```

### Admin Dashboard Example

```typescript
// Fetch dashboard stats
const stats = await fetch('/api/core/emergency-access/dashboard_stats/', {
  headers: { 'Authorization': `Bearer ${token}` },
});
const data = await stats.json();

// Display in dashboard
console.log(`Active: ${data.total_active}`);
console.log(`Pending Review: ${data.total_pending_review}`);
```

---

## Testing

**Test File:** `tests/test_emergency_access.py`

**Test Count:** 29 tests

**Test Categories:**
- Model tests (11) - CRUD, status transitions, expiration
- Serializer tests (3) - Validation, patient lookup
- API tests (11) - All endpoints, permissions
- Task tests (4) - Escalation, expiration

**Run Tests:**
```bash
cd backend
poetry run pytest tests/test_emergency_access.py -v
```

---

## Files

| File | Purpose |
|------|---------|
| `hmis/apps/core/emergency_access/__init__.py` | Module exports |
| `hmis/apps/core/emergency_access/models.py` | EmergencyAccess model |
| `hmis/apps/core/emergency_access/serializers.py` | API serializers |
| `hmis/apps/core/emergency_access/views.py` | ViewSet and permissions |
| `hmis/apps/core/emergency_access/tasks.py` | Celery tasks |
| `hmis/apps/core/emergency_access/urls.py` | URL routing |
| `hmis/apps/core/emergency_access/admin.py` | Django admin config |
| `hmis/apps/core/migrations/0019_emergency_access.py` | Database migration |
| `tests/test_emergency_access.py` | Unit tests |

---

## Compliance

### Kenya Data Protection Act 2019

- **Section 32 - Vital Interests:** Emergency access is permitted when necessary to protect vital interests of the data subject where they cannot give consent
- **Audit Trail:** All access logged with 7-year retention
- **Purpose Limitation:** Reason must be provided and logged

### DHA Requirements

- **Break-Glass Mechanism:** ✅ Implemented
- **Time-Limited Access:** ✅ 15 min to 24 hours
- **Mandatory Logging:** ✅ All invocations audited
- **Administrator Review:** ✅ Dashboard and review workflow
- **Escalation Alerts:** ✅ Email/SMS notifications

---

**Last Updated:** February 22, 2026
**Version:** 1.0
