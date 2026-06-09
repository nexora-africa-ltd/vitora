# Offline-First Architecture Plan

> **Status**: Approved plan — implementation pending
> **Last Updated**: 2026-06-08
> **Decision Drivers**: PowerSync + Neon always-on cost, unreliable internet in rural Kenya, multi-user facility coordination

---

## Executive Summary

Vitora HMIS operates in a dual-mode architecture:

- **Web clients** (reliable internet): Next.js + PowerSync Cloud + Neon PostgreSQL
- **Desktop clients** (unreliable/no internet): Tauri + local SQLite + REST sync to facility hub

This eliminates the requirement for all facilities to have persistent internet while retaining PowerSync for web-only deployments where connectivity is available.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUD TIER (always-on)                               │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Django REST API + PostgreSQL (Azure / VPS)                           │  │
│  │  - Source of truth for all organizations                              │  │
│  │  - PowerSync logical replication (for web clients)                    │  │
│  │  - REST sync endpoints (for desktop/hub clients)                      │  │
│  │  - Reporting, analytics, cross-facility queries                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│           ▲                              ▲                                   │
│           │ PowerSync stream             │ REST batch sync                   │
│           │                              │                                   │
└───────────┼──────────────────────────────┼───────────────────────────────────┘
            │                              │
┌───────────┼──────────┐    ┌─────────────┼──────────────────────────────────┐
│  WEB TIER            │    │  FACILITY TIER (LAN)                           │
│                      │    │                                                │
│  Browser + PWA       │    │  ┌─────────────────────────────────────────┐   │
│  PowerSync SDK       │    │  │  Facility Hub (Django on local machine) │   │
│  WASM SQLite         │    │  │  - PostgreSQL or SQLite (WAL mode)      │   │
│  (for users with     │    │  │  - WebSocket server (Django Channels)   │   │
│   reliable internet) │    │  │  - Syncs to cloud when internet avail.  │   │
│                      │    │  └──────────────┬──────────────────────────┘   │
└──────────────────────┘    │                 │ LAN (HTTP + WebSocket)       │
                            │    ┌────────────┼────────────┐                 │
                            │    │            │            │                 │
                            │  ┌─▼─-─┐      ┌─▼─-─┐      ┌─▼─-─┐             │
                            │  │ PC1 │      │ PC2 │      │ PC3 │             │
                            │  │Tauri│      │Tauri│      │Tauri│             │
                            │  │SQLit│      │SQLit│      │SQLit│             │
                            │  └─────┘      └─────┘      └─────┘             │
                            │  Reception    Doctor       Lab                 │
                            └────────────────────────────────────────────────┘
```

---

## Deployment Modes

Each Tauri installation operates in one of four modes, configured at first launch:

| Mode | Description | Use Case |
|------|-------------|----------|
| `standalone` | Single user, syncs direct to cloud when online | Solo practitioner, small clinic (1 staff) |
| `lan-client` | Multi-user, connects to facility hub on LAN | Workstations at a facility |
| `lan-hub` | This machine IS the hub (runs Django locally) | Designated server PC or Raspberry Pi |
| `web-only` | Browser client, uses PowerSync | Users with reliable internet (county offices, urban clinics) |

For small clinics (1–3 staff), one machine can be both hub and client — Django runs as a background service, Tauri connects to `localhost:9088`.

---

## Component Details

### 1. Local SQLite Database (Tauri Client)

Each Tauri client maintains a local SQLite database using `better-sqlite3` in the Next.js standalone sidecar (Node.js).

**Configuration:**
```sql
PRAGMA journal_mode = WAL;          -- Write-Ahead Logging for crash resilience
PRAGMA synchronous = NORMAL;        -- Balance between safety and speed
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;         -- Wait up to 5s for locks
```

**Schema**: Mirrors the Django models relevant to the facility (patients, encounters, triage, pharmacy, lab, billing). Generated from a shared schema definition.

**Storage location:**
```
Linux:   ~/.local/share/digital.vitora.hmis/db/vitora.db
Windows: %APPDATA%/digital.vitora.hmis/db/vitora.db
macOS:   ~/Library/Application Support/digital.vitora.hmis/db/vitora.db
```

### 2. Facility Hub

The facility hub is a Django instance running on the LAN — identical to the cloud backend but configured for local use.

**Hardware options (in order of preference):**
1. Dedicated desktop PC (always on) — most reliable
2. Raspberry Pi 5 (4GB+) — $50, low power, fanless
3. Mini NUC / thin client — compact, reliable
4. The same machine as a user workstation (small clinics only)

**Software stack:**
- Django + Gunicorn/Daphne (same codebase as cloud)
- SQLite (WAL mode) for facilities ≤20 staff, PostgreSQL for larger
- Django Channels (WebSocket) for real-time updates
- Celery (optional) for background tasks

**Deployment:**
```bash
# On the hub machine (one-time setup)
./install-hub.sh  # Extracts Django, creates DB, runs migrations, starts services
# Runs as a systemd service on Linux or Windows Service
```

### 3. Cloud Server

Unchanged from current architecture:
- Django REST API + PostgreSQL (Azure Container Apps or VPS)
- PowerSync Cloud (logical replication for web clients)
- Serves as the ultimate source of truth and cross-facility data

---

## Sync Protocol

### Client → Hub (LAN Sync)

**Write path:**
```
User action
  → Write to local SQLite (instant UI response)
  → POST /api/sync/push/ to facility hub (LAN, <1ms latency)
  → Hub validates & persists
  → Hub broadcasts via WebSocket to all other clients
  → Other clients update their local SQLite
```

**Read path:**
```
User opens screen
  → Query local SQLite (instant)
  → Background: check for updates from hub
  → If newer data exists: update local SQLite, re-render
```

### Hub → Cloud (WAN Sync)

**When internet is available:**
```
Hub detects connectivity
  → POST /api/sync/push/ (batch of changes since last sync)
  → GET /api/sync/pull/?since=<timestamp> (fetch cloud changes)
  → Apply cloud changes to hub DB
  → Broadcast new data to LAN clients via WebSocket
```

**Sync frequency:** Every 30 seconds when online, or on-demand via manual trigger.

### REST Sync Endpoints (New)

```
POST   /api/sync/push/                  # Batch push changes
  Body: { changes: [{ table, operation, record_id, data, timestamp, client_id }] }
  Response: { accepted: 45, rejected: 2, conflicts: [{...}] }

GET    /api/sync/pull/?since=<iso_ts>&tables=<csv>
  Response: { changes: [...], server_timestamp: "...", has_more: false }

GET    /api/sync/pull/?full=true         # Full re-sync (recovery)
  Response: paginated full dataset

POST   /api/sync/resolve-conflict/       # Manual conflict resolution
  Body: { conflict_id, resolution: "local_wins" | "remote_wins" | "merge", merged_data?: {...} }

GET    /api/sync/status/                 # Sync health check
  Response: { last_sync: "...", pending_changes: 3, conflicts: 0 }
```

### Conflict Resolution

| Conflict Type | Strategy | Details |
|---------------|----------|---------|
| Same field edited by two users | Last-write-wins (LWW) | Timestamp-based; hub's clock is authority |
| Concurrent creates (no collision) | Accept both | UUIDs prevent ID conflicts |
| Offline client submits stale edit | Reject with 409 | Client shows conflict UI with both versions |
| Schema version mismatch | Reject until client updates | Force app update |

**Conflict UI in Tauri client:**
- Shows both versions side-by-side
- User picks "Keep mine", "Keep theirs", or manually merges
- Resolution posted to `/api/sync/resolve-conflict/`

---

## Real-Time Communication (LAN)

### WebSocket (Primary)

Django Channels is already in the stack. Each Tauri client opens a WebSocket to the facility hub:

```
ws://192.168.x.x:9088/ws/facility/{facility_id}/
```

**Message types:**

```json
// Record created/updated
{ "type": "record.changed", "table": "encounters_encounter", "id": 42, "operation": "create" }

// Queue position changed (triage)
{ "type": "queue.updated", "clinic_id": 5, "positions": [...] }

// Critical alert (lab result, vitals)
{ "type": "alert.critical", "patient_id": 7, "message": "SpO2 < 95%" }

// Shift started (room occupancy)
{ "type": "shift.started", "room_id": 3, "staff_id": 12 }
```

**Client handling:**
1. Receive WebSocket message
2. Fetch full record from hub: `GET /api/{table}/{id}/`
3. Upsert into local SQLite
4. Re-render affected UI components (React Query invalidation)

### Short-Polling (Fallback)

If WebSocket fails (firewall, proxy issues):

```
GET /api/sync/changes/?since=<last_ts>  (every 3 seconds over LAN)
```

LAN latency is <1ms, so polling 5–20 clients every 3s is negligible load.

---

## Hub Discovery

### Option A: mDNS/DNS-SD (Primary — Recommended)

The facility hub advertises itself via mDNS/Bonjour:

```
Service: _vitora._tcp.local
Port: 9088
TXT: facility_id=<uuid>, facility_name=<name>, version=0.3.0
```

Tauri clients discover automatically on startup. No manual configuration needed.

**Implementation:** `zeroconf` Python package on hub, Rust `mdns-sd` crate or Node `bonjour-service` on client.

### Option B: UDP Broadcast Probe

Client sends a UDP broadcast to `255.255.255.255:19088` with payload `VITORA_DISCOVER`. Hub responds with JSON:
```json
{ "url": "http://192.168.1.100:9088", "facility_id": "uuid", "facility_name": "Demo Clinic", "version": "0.3.0" }
```

Simplest possible discovery — works on any flat LAN, no library dependencies.

### Option C: Manual Configuration (Always-Available Fallback)

Settings UI in Tauri app:

```
┌─────────────────────────────────────────┐
│  Vitora HMIS — Connection Setup         │
│                                         │
│  Server Address:                        │
│  ┌─────────────────────────────────┐    │
│  │ http://192.168.1.100:9088       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Scan Network]  [Test Connection] [OK] │
└─────────────────────────────────────────┘
```

For networks where mDNS is blocked or VLAN'd, users (or IT staff) enter the hub IP/hostname directly. The "Scan Network" button triggers UDP broadcast probe.

### ~~Option D: QR Code~~ (Removed)

QR code pairing was removed from the plan. Rationale:
- Raspberry Pi hubs are typically headless (no display to show QR)
- Desktop PCs don't have cameras aimed at other screens
- The problem QR solves (hub discovery) is better served by mDNS + UDP broadcast + manual entry
- QR is a mobile-phone UX pattern that doesn't translate to PC-to-PC workflows

---

## Backup Strategy

### Backup Tiers

| Tier | Frequency | Retention | Location | Purpose |
|------|-----------|-----------|----------|---------|
| Rolling | Every 30 min (while app open) | Last 3 copies | Local disk | Protect against crash/corruption |
| Daily | On app launch + graceful shutdown | Last 14 days | Local disk | Point-in-time recovery |
| External | Manual or scheduled (daily) | Last 30 days | USB drive / external | Disaster recovery |
| Cloud | On successful sync to server | Indefinite | Cloud PostgreSQL | Ultimate backup |

### Local Backup Implementation

**Using SQLite's Online Backup API** (safe for concurrent reads):

```typescript
// In Node.js sidecar
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const BACKUP_DIR = path.join(appDataDir, 'backups');
const ROLLING_DIR = path.join(BACKUP_DIR, 'rolling');
const DAILY_DIR = path.join(BACKUP_DIR, 'daily');

function createBackup(type: 'rolling' | 'daily'): string {
  const db = new Database(DB_PATH, { readonly: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = type === 'rolling'
    ? path.join(ROLLING_DIR, `vitora-${timestamp}.db`)
    : path.join(DAILY_DIR, `vitora-${timestamp.split('T')[0]}.db`);

  db.backup(dest);
  db.close();

  // Prune old backups
  pruneBackups(type === 'rolling' ? ROLLING_DIR : DAILY_DIR, type === 'rolling' ? 3 : 14);

  return dest;
}

function pruneBackups(dir: string, maxCount: number): void {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse();

  for (const file of files.slice(maxCount)) {
    fs.unlinkSync(path.join(dir, file));
  }
}
```

### Storage Layout

```
~/.local/share/digital.vitora.hmis/
├── db/
│   ├── vitora.db                       ← Live database
│   └── vitora.db-wal                   ← WAL journal
├── backups/
│   ├── rolling/
│   │   ├── vitora-2026-06-08T10-00-00.db
│   │   ├── vitora-2026-06-08T10-30-00.db
│   │   └── vitora-2026-06-08T11-00-00.db
│   └── daily/
│       ├── vitora-2026-06-07.db
│       ├── vitora-2026-06-06.db
│       └── ... (14 days)
├── config/
│   └── settings.json                   ← Deployment mode, hub URL, etc.
└── standalone/                          ← Next.js server (existing)
```

### Corruption Detection & Recovery

```typescript
// On app startup
function checkDatabaseIntegrity(): 'ok' | 'corrupted' {
  const db = new Database(DB_PATH);
  const result = db.pragma('integrity_check');
  db.close();
  return result[0].integrity_check === 'ok' ? 'ok' : 'corrupted';
}

async function recoverDatabase(): Promise<void> {
  // 1. Try latest rolling backup
  const rollingBackup = getLatestBackup(ROLLING_DIR);
  if (rollingBackup && checkIntegrity(rollingBackup) === 'ok') {
    fs.copyFileSync(rollingBackup, DB_PATH);
    log.info(`Recovered from rolling backup: ${rollingBackup}`);
    return;
  }

  // 2. Try latest daily backup
  const dailyBackup = getLatestBackup(DAILY_DIR);
  if (dailyBackup && checkIntegrity(dailyBackup) === 'ok') {
    fs.copyFileSync(dailyBackup, DB_PATH);
    log.info(`Recovered from daily backup: ${dailyBackup}`);
    return;
  }

  // 3. Full re-sync from hub/cloud
  log.warn('No valid local backup found. Initiating full re-sync...');
  await fullResyncFromServer();
}
```

### Graceful Shutdown

```typescript
// On app close
function onAppShutdown(): void {
  const db = new Database(DB_PATH);
  db.pragma('wal_checkpoint(TRUNCATE)');  // Flush WAL to main DB
  db.close();
  createBackup('daily');
}
```

### External Backup (USB)

Exposed as a Tauri IPC command for manual or scheduled backup:

```rust
#[tauri::command]
async fn export_backup(app: AppHandle, dest_path: String, encrypt: bool) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    let backup_path = if encrypt {
        // Create encrypted ZIP with facility passphrase
        create_encrypted_backup(&db_path, &dest_path)?
    } else {
        // Plain copy
        std::fs::copy(&db_path, &dest_path)
            .map_err(|e| format!("Backup failed: {}", e))?;
        dest_path.clone()
    };
    Ok(backup_path)
}
```

**UI**: Settings → Data → Export Backup → Choose destination (USB, external drive)

---

## Data Flow Scenarios

### Scenario 1: Normal Operation (Hub Reachable)

```
1. Nurse records vitals on PC2
2. Write to PC2 local SQLite (UI updates instantly)
3. POST to hub (LAN, <5ms)
4. Hub persists, broadcasts WS: { type: "record.changed", table: "encounters", id: 42 }
5. PC1, PC3 receive WS message
6. PC1, PC3 fetch full record from hub, update local SQLite
7. Doctor on PC1 sees updated vitals in <1 second
```

### Scenario 2: Hub Offline (Server Crash)

```
1. Nurse records vitals on PC2
2. Write to PC2 local SQLite (UI updates instantly)
3. POST to hub fails (timeout)
4. Change queued in local sync_queue table
5. PC2 shows "Offline" indicator, continues working
6. ... Hub restarts 10 minutes later ...
7. PC2 detects hub is back (health check)
8. Batch push queued changes to hub
9. Hub broadcasts to other clients
10. All clients converge
```

### Scenario 3: Facility Completely Offline (No Internet, Hub Running)

```
1. All PCs write to hub over LAN normally
2. Hub queues cloud sync (pending)
3. ... Internet returns after 3 days ...
4. Hub pushes 3 days of changes to cloud
5. Cloud applies changes, resolves any conflicts
6. Hub pulls any cloud-side changes (from other facilities in org)
7. Hub broadcasts new data to LAN clients
```

### Scenario 4: Single User Standalone (No Hub, No Internet)

```
1. Solo clinician works on Tauri app
2. All writes go to local SQLite only
3. Changes queue for cloud sync
4. ... Clinician drives to town with internet ...
5. App detects connectivity, syncs to cloud
6. (Or: clinician exports USB backup weekly as insurance)
```

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Local SQLite stores patient data | Encrypt DB file at rest (SQLCipher or OS-level encryption) |
| LAN traffic is unencrypted | Use mTLS between clients and hub (self-signed CA per facility) |
| Hub is a theft target | Full-disk encryption on hub machine + remote wipe capability |
| USB backups can be lost | Encrypt with facility passphrase (AES-256) |
| Stale client has outdated RBAC | Hub validates permissions on every write; client enforces UI-only |
| Rogue client on LAN | Hub requires JWT auth; initial pairing via setup token |

### PII Handling (Kenya DPA 2019)

- Encrypted fields (`national_id`, `phone_number`, etc.) remain encrypted in local SQLite using the same Fernet key
- Fernet key is stored in OS keychain (via `tauri-plugin-stronghold` or OS keyring)
- Local backups inherit encryption — no plaintext PII on disk
- USB exports are additionally wrapped in AES-256

---

## Implementation Phases

### Phase 1: Local SQLite in Tauri (Foundation)

- [x] Add `better-sqlite3` to Next.js standalone sidecar
- [x] Define local schema (mirror Django models for facility-scoped data)
- [x] Implement read-from-local-SQLite for all pages
- [x] Implement write-to-local + queue for hub sync
- [x] Backup engine (rolling + daily + integrity check)
- [x] Settings UI for deployment mode selection

### Phase 2: REST Sync Endpoints (Django)

- [x] `POST /api/sync/push/` — batch accept changes
- [x] `GET /api/sync/pull/?since=<ts>` — incremental pull
- [x] `GET /api/sync/pull/?full=true` — full re-sync
- [x] `POST /api/sync/resolve-conflict/` — manual resolution
- [x] `GET /api/sync/status/` — health/status
- [x] Conflict detection and resolution logic (extend existing `SyncQueue`/`SyncConflict`)

### Phase 3: Facility Hub Deployment

- [x] Django configuration for local/hub mode (SQLite backend, reduced dependencies)
- [x] Hub installer script (Linux systemd + Windows NSSM service)
- [x] Django Channels WebSocket groups for facility broadcast (`ws/sync/{facility_id}/`)
- [x] Hub → Cloud sync worker (background task, thread + Celery modes)
- [x] Hub health monitoring endpoint (`GET /api/hub/health/`)
- [x] Broadcast wiring: sync push → WebSocket group send to LAN clients
- [x] 24 tests (health endpoint, WebSocket consumer, broadcast wiring, cloud sync worker)

### Phase 4: Real-Time LAN Communication

- [x] WebSocket connection from Tauri client to hub (`HubWebSocketClient` with auto-reconnect)
- [x] Message types and handlers (sync_changes, ping/pong, subscribe filtering)
- [x] Short-polling fallback (HTTP GET every 3s when WebSocket unavailable)
- [x] mDNS/DNS-SD discovery (hub advertises `_vitora._tcp.local` via zeroconf)
- [x] UDP broadcast fallback for discovery (`VITORA_DISCOVER` on port 19088)
- [x] Manual IP/hostname entry in client settings (always-available fallback)
- [x] Hub discovery client (`probeHub`, `discoverHub`, subnet scan)
- [x] 11 tests (UDP responder, mDNS registration, message routing, polling)

### Phase 5: Hardening

- [x] SQLCipher or OS-level encryption for local DB — Tauri keychain-backed key storage (`get_db_encryption_key`, `set_fernet_key`, `get_fernet_key` commands); keystore file with 0600 permissions on Unix
- [ ] mTLS for LAN traffic (self-signed CA per facility) — deferred; LAN is private network behind firewall; hub already validates facility on WebSocket connect
- [x] USB backup encryption (AES-256 + facility passphrase) — `exportEncryptedBackup()`/`importEncryptedBackup()` using AES-256-GCM + PBKDF2 (100k iterations)
- [x] Fernet key storage in OS keychain — Tauri `KeyStore` with `set_fernet_key`/`get_fernet_key` commands
- [x] Remote wipe capability for lost/stolen hubs — `POST /api/hub/wipe/` (admin-only) + `GET /api/hub/wipe-check/` (hub polls) + client-side `executeLocalWipe()`
- [x] Sync conflict dashboard in admin UI — `GET /api/sync/dashboard/` (queue summary, throughput, stale entries, conflict breakdown)
- [x] Sync queue pruning + retry backoff — management command + Celery beat task (every 6h), client-side exponential backoff (5s→5min, max 10 retries)
- [x] Hub JWT token refresh — auto-refresh via refresh token, re-authenticate on failure
- [x] 22 backend tests (remote wipe, dashboard, pruning, token refresh)

---

## Cost Comparison

| Component | PowerSync-Only (Current) | Hybrid (This Plan) |
|-----------|--------------------------|---------------------|
| Neon PostgreSQL | ~$20-50/mo (always-on, logical replication) | $0-19/mo (scale-to-zero OK for cloud tier) |
| PowerSync Cloud | ~$50-100/mo | ~$20-50/mo (only web clients, lower volume) |
| Facility Hub Hardware | N/A | $0 (existing PC) or $50 one-time (RPi) |
| VPS (alternative to Neon) | N/A | $5-10/mo (if replacing Neon entirely) |
| **Monthly Total** | **$70-150/mo** | **$20-70/mo** |

For facilities using desktop-only (Tauri + hub), the cloud cost is near zero — they only need cloud sync for cross-facility reporting and backup.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-08 | Keep PowerSync for web clients | Works well for users with reliable internet; already implemented |
| 2026-06-08 | Add local SQLite for Tauri desktop | Eliminates internet dependency for facility operations |
| 2026-06-08 | Facility hub model for multi-user | SQLite is single-process; hub provides shared state over LAN |
| 2026-06-08 | Reject BeeWare | Toga UI toolkit too immature for clinical workflows; Tauri already uses React |
| 2026-06-08 | Keep Tauri (not Electron) | 10MB bundle vs 150MB; lower RAM; already working |
| 2026-06-08 | better-sqlite3 over WASM SQLite | Native performance in Node sidecar; backup API support |

---

## References

- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [better-sqlite3 Backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---backup)
- [Tauri v2 Guides](https://v2.tauri.app/develop/)
- [Django Channels](https://channels.readthedocs.io/)
- [mDNS Service Discovery](https://datatracker.ietf.org/doc/html/rfc6762)
- Existing: `docs/powersync-integration.md` (PowerSync web-client architecture)
- Existing: `backend/hmis/apps/core/models.py` → `SyncQueue`, `SyncConflict`
