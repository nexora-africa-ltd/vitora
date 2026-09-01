# Hub ↔ Cloud Sync & Activation Flow

> **Status**: Implemented (Phase 1-5 complete)
> **Author**: Engineering
> **Date**: 2026-06-12
> **Scope**: Hub provisioning, activation, bidirectional sync

---

## Problem Statement

Today, hubs operate in complete isolation from the cloud:

1. The installer asks the operator to manually type `HUB_ID`, `HUB_FACILITY_ID`, `HUB_ORGANIZATION_ID` — but these don't correspond to anything on the cloud.
2. The setup wizard creates a **new** Organization + Facility locally — the cloud has no visibility into these.
3. The `HubCloudSyncWorker` transport layer exists but only 2 call sites use it (remote wipe + SHA claims).
4. Nexora staff cannot see which facilities are active, who their users are, or what data they hold.

---

## Design Goals

| # | Goal | Rationale |
|---|------|-----------|
| 1 | Cloud is the **source of truth** for Organization + Facility identity | Prevents ID collisions, enables central management |
| 2 | Hub activation is code-based (no manual ID entry) | Reduces operator error, enforces licensing |
| 3 | Clinical data syncs upward (hub→cloud) when connectivity allows | Enables central reporting, backup, and Nexora support |
| 4 | Reference data syncs downward (cloud→hub) | Drug catalogs, ICD codes, SHA packages stay current |
| 5 | Offline-first: hub must function fully without connectivity | Sync is best-effort, never blocking |

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         CLOUD (api.vitora.digital)                │
│                                                                   │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────────┐   │
│  │ Organization│───▶│  Facility    │───▶│   Installation     │   │
│  │ (master)    │    │  (master)    │    │   (per-hub record) │   │
│  └─────────────┘    └──────────────┘    └────────────────────┘   │
│         │                  │                       ▲              │
│         │                  │                       │              │
│         ▼                  ▼                       │ check-in     │
│  ┌──────────────────────────────────┐              │ + data push  │
│  │  /api/licensing/activate/        │◀─────────────┤              │
│  │  /api/sync/push/                 │              │              │
│  │  /api/sync/pull/                 │──────────────┘              │
│  └──────────────────────────────────┘                             │
└───────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS (when online)
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│                         HUB (LAN, offline-capable)                │
│                                                                   │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────────┐   │
│  │ Organization│    │  Facility    │    │  SyncQueue         │   │
│  │ (local copy)│    │ (local copy) │    │  (outbound buffer) │   │
│  └─────────────┘    └──────────────┘    └────────────────────┘   │
│         │                  │                       ▲              │
│         │                  │                       │              │
│         ▼                  ▼                       │ post_save    │
│  ┌──────────────────────────────────┐              │ signals      │
│  │  Patients, Encounters, Labs,     │──────────────┘              │
│  │  Pharmacy, Billing, etc.         │                             │
│  └──────────────────────────────────┘                             │
└───────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Activation-Driven Provisioning

### New Flow (replaces manual ID entry + setup wizard)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLOUD ADMIN (web-app)                                                    │
│                                                                          │
│ 1. Create Organization (if new customer)                                │
│ 2. Create Facility under that Organization                              │
│ 3. Generate Installation + Activation Code                               │
│    → System records: org_id, facility_id, planned hub metadata          │
│ 4. Send activation code to facility operator (email/print/SMS)          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                              activation code
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ HUB INSTALLER (on-site)                                                  │
│                                                                          │
│ 1. Run installer (downloads backend, creates venv, etc.)                │
│ 2. Installer prompts: "Enter activation code" (ONLY input needed)       │
│ 3. Installer fetches GET /api/licensing/eula/ and captures acceptance    │
│ 4. Installer calls POST /api/licensing/activate/                         │
│    → Request:  { activation_code, installation_id,                       │
│                 eula_accepted: true, eula_version }                      │
│    → Response: { license_token, organization, facility, sync_url }      │
│ 5. Installer writes .env from activation response:                      │
│    HUB_ID=<installation_id>                                             │
│    HUB_ORGANIZATION_ID=<org.id from cloud>                              │
│    HUB_FACILITY_ID=<facility.id from cloud>                             │
│    SYNC_SERVER_URL=<sync_url from cloud>                                │
│    LICENSE_TOKEN=<jwt>                                                   │
│ 6. Installer runs migrate + collectstatic                               │
│ 7. Installer seeds local DB with org + facility from activation data    │
│ 8. Installer prompts: "Create local admin account" (username/password)  │
│ 9. Start service                                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                              first boot
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ HUB FIRST BOOT                                                           │
│                                                                          │
│ 1. HubCloudSyncWorker starts (thread or Celery)                         │
│ 2. First check-in: POST /api/licensing/check-in/                        │
│    → Reports version, OS, IP; gets fresh license JWT                    │
│ 3. Initial pull: GET /api/sync/pull/ (since=epoch)                      │
│    → Pulls reference data: departments, roles, drug catalog, ICD codes  │
│ 4. Hub is ready for clinical use                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Changes to `POST /api/licensing/activate/` Response

Current response:

```json
{
  "license_token": "<license_jwt>",
  "installation_id": "...",
  "status": "ACTIVE"
}
```

New response (expanded):

```json
{
  "license_token": "<license_jwt>",
  "installation_id": "abc123",
  "status": "ACTIVE",
  "sync_url": "https://api.vitora.digital/api/sync",
  "organization": {
    "id": 5,
    "name": "Makueni County Hospital",
    "slug": "makueni-county-hospital",
    "contact_email": "admin@makueni.co.ke",
    "contact_phone": "+254700000000"
  },
  "facility": {
    "id": 12,
    "name": "Makueni Level 5 Hospital",
    "mfl_code": "13127",
    "level": 5,
    "ownership": "GOK",
    "county_id": 17,
    "county_name": "Makueni",
    "sub_county_id": 89,
    "sub_county_name": "Makueni",
    "modules": {
      "module_opd": true,
      "module_ipd": true,
      "module_pharmacy": true,
      "module_laboratory": true,
      "module_billing": true
    }
  },
  "bootstrap": {
    "departments": [...],
    "roles": [...]
  }
}
```

### Changes to Installer Scripts

The installer becomes simpler — only needs:

1. Activation code (entered by operator)
2. Admin credentials (username + password for local superuser)

Everything else (org name, facility name, MFL code, IDs) comes from the activation response.

```bash
# New installer flow (Linux)
read -rp "  Activation Code: " ACTIVATION_CODE

# Generate a unique installation ID
INSTALLATION_ID="hub-$(hostname)-$(date +%s)"

# Call cloud activation endpoint
RESPONSE=$(curl -sf -X POST "$CDN_BASE/api/licensing/activate/" \
  -H "Content-Type: application/json" \
  -d "{\"activation_code\": \"$ACTIVATION_CODE\", \"installation_id\": \"$INSTALLATION_ID\", \"eula_accepted\": true, \"eula_version\": \"2026-07-31\"}")

if [ $? -ne 0 ]; then
    error "Activation failed. Check your code and internet connection."
    exit 1
fi

# Parse response
LICENSE_TOKEN=$(echo "$RESPONSE" | jq -r '.license_token')
ORG_ID=$(echo "$RESPONSE" | jq -r '.organization.id')
FACILITY_ID=$(echo "$RESPONSE" | jq -r '.facility.id')
SYNC_URL=$(echo "$RESPONSE" | jq -r '.sync_url')
ORG_NAME=$(echo "$RESPONSE" | jq -r '.organization.name')
FACILITY_NAME=$(echo "$RESPONSE" | jq -r '.facility.name')

# Write .env (no manual IDs needed!)
cat > "$APP_DIR/.env" <<EOF
DJANGO_ENV=hub
HUB_ID=$INSTALLATION_ID
HUB_ORGANIZATION_ID=$ORG_ID
HUB_FACILITY_ID=$FACILITY_ID
HUB_DATA_DIR=$DB_DIR
HUB_DB_PATH=$DB_DIR/hub.sqlite3
SYNC_SERVER_URL=$SYNC_URL
LICENSE_TOKEN=$LICENSE_TOKEN
...
EOF
```

### New Management Command: `seed_from_activation`

```bash
python manage.py seed_from_activation --response-file=/tmp/activation.json
```

Creates local Organization + Facility records with the **same primary keys** as the cloud (critical for sync):

```python
# management/commands/seed_from_activation.py
Organization.objects.update_or_create(
    id=data["organization"]["id"],
    defaults={
        "name": data["organization"]["name"],
        "slug": data["organization"]["slug"],
        "is_active": True,
        "is_verified": True,
        ...
    }
)
Facility.objects.update_or_create(
    id=data["facility"]["id"],
    defaults={
        "name": data["facility"]["name"],
        "organization_id": data["organization"]["id"],
        ...
    }
)
```

### Setup Wizard Changes

The existing setup wizard (`/setup` in the Next.js sidecar) changes from "create org + facility + admin" to:

**New steps:**

1. **Activation** — enter code, call activate endpoint, receive org/facility info
2. **Confirm** — display org + facility info (read-only), confirm this is correct
3. **Admin Account** — create local superuser (username, email, password)

The org/facility creation step is removed — it comes from cloud activation data.

---

## Phase 2: Hub→Cloud Data Sync (Upward)

### Sync Registry

A declarative list of models that auto-queue for hub→cloud sync:

```python
# hmis/apps/core/sync_registry.py

from enum import Enum

class SyncDirection(Enum):
    UP = "up"          # hub → cloud
    DOWN = "down"      # cloud → hub
    BOTH = "both"      # bidirectional

SYNC_REGISTRY = {
    # Core identity (seeded from activation, then synced both ways)
    "core.Organization": {"direction": SyncDirection.BOTH, "priority": 1},
    "core.Facility": {"direction": SyncDirection.BOTH, "priority": 1},
    "core.StaffProfile": {"direction": SyncDirection.UP, "priority": 2},
    "auth.User": {"direction": SyncDirection.UP, "priority": 2, "exclude_fields": ["password"]},

    # Clinical data (up only — cloud is read-only archive)
    "patients.Patient": {"direction": SyncDirection.UP, "priority": 3},
    "patients.EmergencyContact": {"direction": SyncDirection.UP, "priority": 4},
    "encounters.Encounter": {"direction": SyncDirection.UP, "priority": 3},
    "encounters.Diagnosis": {"direction": SyncDirection.UP, "priority": 4},
    "encounters.TreatmentPlan": {"direction": SyncDirection.UP, "priority": 4},
    "encounters.Medication": {"direction": SyncDirection.UP, "priority": 4},
    "triage.TriageAssessment": {"direction": SyncDirection.UP, "priority": 3},
    "pharmacy.Prescription": {"direction": SyncDirection.UP, "priority": 3},
    "pharmacy.PrescriptionItem": {"direction": SyncDirection.UP, "priority": 4},
    "laboratory.LabOrder": {"direction": SyncDirection.UP, "priority": 3},
    "laboratory.LabOrderItem": {"direction": SyncDirection.UP, "priority": 4},
    "laboratory.LabResult": {"direction": SyncDirection.UP, "priority": 3},
    "billing.Invoice": {"direction": SyncDirection.UP, "priority": 3},
    "billing.InvoiceItem": {"direction": SyncDirection.UP, "priority": 4},
    "billing.Payment": {"direction": SyncDirection.UP, "priority": 3},
    "scheduling.Shift": {"direction": SyncDirection.UP, "priority": 4},
    "inpatient.Admission": {"direction": SyncDirection.UP, "priority": 3},
    "inpatient.BedAssignment": {"direction": SyncDirection.UP, "priority": 4},
    "immunizations.ImmunizationRecord": {"direction": SyncDirection.UP, "priority": 3},
    "imaging.ImagingOrder": {"direction": SyncDirection.UP, "priority": 3},
    "imaging.ImagingResult": {"direction": SyncDirection.UP, "priority": 3},

    # Reference data (down only — cloud pushes updates)
    "encounters.ICD10Code": {"direction": SyncDirection.DOWN, "priority": 5},
    "pharmacy.Drug": {"direction": SyncDirection.DOWN, "priority": 5},
    "clinical_templates.ClinicalTemplate": {"direction": SyncDirection.DOWN, "priority": 5},
    "billing.ServiceCatalog": {"direction": SyncDirection.DOWN, "priority": 5},

    # Audit (up only — for compliance reporting)
    "core.AuditLog": {"direction": SyncDirection.UP, "priority": 5, "batch_size": 500},
}
```

### Auto-Queuing Signal

```python
# hmis/apps/core/sync_signals.py

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.conf import settings

from hmis.apps.core.sync_registry import SYNC_REGISTRY, SyncDirection


def _should_sync(model_label: str) -> bool:
    """Check if model is registered for upward sync and we're in hub mode."""
    if getattr(settings, "DJANGO_ENV", "") != "hub":
        return False
    entry = SYNC_REGISTRY.get(model_label)
    if not entry:
        return False
    return entry["direction"] in (SyncDirection.UP, SyncDirection.BOTH)


def _get_model_label(instance) -> str:
    return f"{instance._meta.app_label}.{instance._meta.model_name.title()}"


@receiver(post_save)
def auto_queue_for_sync(sender, instance, created, **kwargs):
    """Automatically queue registered models for hub→cloud sync."""
    label = f"{instance._meta.app_label}.{instance.__class__.__name__}"
    if not _should_sync(label):
        return

    from hmis.apps.core.sync import queue_for_sync

    operation = "CREATE" if created else "UPDATE"
    entry = SYNC_REGISTRY[label]
    exclude = entry.get("exclude_fields", [])

    # Serialize instance (using model_to_dict with exclusions)
    from django.forms.models import model_to_dict
    data = model_to_dict(instance, exclude=exclude)

    # Convert non-serializable fields
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    data = json.loads(json.dumps(data, cls=DjangoJSONEncoder))

    queue_for_sync(
        operation=operation,
        model_name=label,
        record_id=instance.pk,
        data=data,
    )


@receiver(post_delete)
def auto_queue_delete_for_sync(sender, instance, **kwargs):
    """Queue DELETE operations for registered models."""
    label = f"{instance._meta.app_label}.{instance.__class__.__name__}"
    if not _should_sync(label):
        return

    from hmis.apps.core.sync import queue_for_sync

    queue_for_sync(
        operation="DELETE",
        model_name=label,
        record_id=instance.pk,
        data={"id": instance.pk},
    )
```

### Sync Payload Format

Each push batch follows this format:

```json
{
  "hub_id": "hub-reception-1718000000",
  "facility_id": 12,
  "organization_id": 5,
  "batch_id": "uuid-v4",
  "entries": [
    {
      "operation": "CREATE",
      "table": "patients.Patient",
      "record_id": 42,
      "data": { "id": 42, "first_name": "John", ... },
      "timestamp": "2026-06-12T10:30:00Z",
      "priority": 3
    }
  ]
}
```

---

## Phase 3: Cloud→Hub Data Sync (Downward)

### Pull Mechanism

Hub periodically calls `GET /api/sync/pull/?since={last_pull_timestamp}&direction=down`.

Cloud responds with changes to reference data and org/facility config updates:

```json
{
  "entries": [
    {
      "operation": "UPDATE",
      "table": "core.Facility",
      "record_id": 12,
      "data": { "module_radiology": true },
      "timestamp": "2026-06-12T09:00:00Z"
    },
    {
      "operation": "CREATE",
      "table": "pharmacy.Drug",
      "record_id": 5001,
      "data": { "name": "Amoxicillin 500mg", ... },
      "timestamp": "2026-06-12T08:00:00Z"
    }
  ],
  "has_more": false,
  "server_timestamp": "2026-06-12T10:30:00Z"
}
```

### Cloud Materializer (Applies Pushed Data)

```python
# hmis/apps/core/sync_materializer.py

from django.apps import apps
from hmis.apps.core.sync_registry import SYNC_REGISTRY


def materialize_entry(entry: dict) -> dict:
    """
    Apply a sync entry to the database.

    Returns {"success": True} or {"success": False, "error": "..."}.
    """
    table = entry["table"]
    operation = entry["operation"]
    data = entry["data"]
    record_id = entry["record_id"]

    if table not in SYNC_REGISTRY:
        return {"success": False, "error": f"Unknown table: {table}"}

    app_label, model_name = table.split(".")
    try:
        Model = apps.get_model(app_label, model_name)
    except LookupError:
        return {"success": False, "error": f"Model not found: {table}"}

    if operation == "CREATE":
        Model.objects.update_or_create(pk=record_id, defaults=data)
    elif operation == "UPDATE":
        Model.objects.filter(pk=record_id).update(**data)
    elif operation == "DELETE":
        Model.objects.filter(pk=record_id).delete()

    return {"success": True}
```

---

## Phase 4: Conflict Resolution

### Strategy

| Scenario | Resolution |
|----------|-----------|
| Same record modified on hub AND cloud | **Last-writer-wins** by timestamp (hub data preferred for clinical, cloud preferred for config) |
| Hub creates record with ID that exists on cloud | **Hub wins** — cloud record is overwritten (hub is source of truth for clinical data) |
| Cloud pushes reference data update | **Cloud wins** — hub overwrites local copy (cloud is source of truth for catalogs) |
| Two hubs edit same patient (multi-hub facility) | **Vector clock** — requires manual resolution via cloud admin |

### Conflict Detection

Each synced model gains a `sync_version` field (integer, incremented on every save):

```python
class SyncVersionMixin(models.Model):
    sync_version = models.PositiveIntegerField(default=1, editable=False)
    sync_source = models.CharField(max_length=100, blank=True, editable=False)  # hub_id or "cloud"

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not kwargs.pop("_skip_version_bump", False):
            self.sync_version += 1
        super().save(*args, **kwargs)
```

---

## Phase 5: PII Handling in Sync

### Rules

| Field Type | Synced? | Format |
|------------|---------|--------|
| Non-PII (names, clinical) | ✅ Yes | Plaintext |
| Fernet-encrypted PII (national_id, phone, email) | ✅ Yes | **Encrypted blob** (transferred as-is, same key on cloud) |
| Password hashes | ✅ Yes | Django hash string (pbkdf2/argon2) — required for offline auth |
| Session tokens | ❌ Never | Not in model |
| last_login | ❌ Excluded | Ephemeral, per-device |

The hub and cloud share the same `ENCRYPTION_KEY` (set during activation). Encrypted fields are synced as their ciphertext — never decrypted in transit.

> **Design note (password hashes)**: Password hashes MUST be synced bidirectionally so staff can authenticate on both hub (offline) and cloud. Django stores one-way hashes (PBKDF2 with 600k iterations or Argon2) that are not reversible. They are no more sensitive in transit than the clinical data already being synced over TLS. The `auth.User` registry entry uses `LAST_WRITE_WINS` conflict policy so the most recent password change (on either hub or cloud) takes precedence.

---

## Implementation Phases & Effort

| Phase | Scope | Effort | Depends On |
|-------|-------|--------|------------|
| **1a** | Expand activation response (org/facility/bootstrap data) | 1 day | — |
| **1b** | `seed_from_activation` management command | 1 day | 1a |
| **1c** | Rewrite installer to use activation code only | 2 days | 1a, 1b |
| **1d** | Rewrite setup wizard UI (activation → confirm → admin) | 2 days | 1c |
| **2a** | Sync registry + auto-queuing signals | 2 days | — |
| **2b** | Cloud materializer (apply pushed entries) | 2 days | 2a |
| **2c** | Priority-based push (critical data first) | 1 day | 2a |
| **3a** | Pull endpoint (cloud→hub reference data) | 1 day | — |
| **3b** | Hub pull consumer (apply reference data locally) | 1 day | 3a |
| **4** | Conflict resolution (version vectors, resolution UI) | 3 days | 2b |
| **5** | PII transit encryption, credential portability, key provisioning | 1 day | 1a |

**Total: ~17 days (3.5 weeks)**

### Recommended Sprint Breakdown

| Sprint | Deliverable | Outcome |
|--------|-------------|---------|
| **Sprint A** (Week 1-2) | Phases 1a-1d | Hub provisioned via activation code; cloud knows every active hub |
| **Sprint B** (Week 2-3) | Phases 2a-2c, 3a-3b | Clinical data flows to cloud; reference data flows to hub |
| **Sprint C** (Week 3-4) | Phases 4, 5 | Conflict handling; PII safe transit verified |

---

## Migration Path (Existing Hubs)

For hubs already deployed with the old manual-ID flow:

1. Cloud admin creates Installation record with matching `installation_id` (the `HUB_ID` from old .env)
2. Admin generates activation code and marks the Installation as pre-activated (bypass code entry)
3. Hub update script adds `SYNC_SERVER_URL` and `LICENSE_TOKEN` to .env
4. On next restart, hub begins syncing

Management command for one-time migration (implemented):

```bash
python manage.py migrate_to_activation --hub-id="reception-hub-1" --license-token="<jwt>"
# Verifies token via check-in, writes SYNC_SERVER_URL + LICENSE_TOKEN to .env
```

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Activation code brute force | 16-char URL-safe token = 96 bits entropy; rate-limited (5/min) |
| Stolen activation code | One-time use; cleared after activation; can be revoked before use |
| Man-in-the-middle on sync | HTTPS only for SYNC_SERVER_URL; license JWT signed with RS256 |
| Hub impersonation | Installation ID + license JWT together authenticate the hub |
| Data exfiltration via rogue hub | Activation ties hub to specific org/facility; materializer validates scope |
| Cloud compromise | Hub continues operating offline; no remote code execution capability |
| PII in transit | Transferred as Fernet ciphertext; TLS on top; key never in URL/headers |

---

## Open Questions

1. **Multi-hub facilities**: Should two hubs at the same facility share one Installation or have separate ones? (Recommendation: separate — each hub is a device)
2. **Hub-to-hub sync**: If two hubs serve the same facility on the same LAN, should they sync directly? (Recommendation: defer to Phase 5+, use cloud as intermediary for now)
3. **Offline activation**: What if the hub can't reach the cloud during installation? (Recommendation: require connectivity for initial activation only; all subsequent operation is offline-capable)
4. **Key rotation**: When ENCRYPTION_KEY is rotated on the cloud, how do hubs get the new key? (Recommendation: include in check-in response, re-encrypt locally)
