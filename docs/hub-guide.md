# Vitora HMIS Facility Hub — Comprehensive Guide & Operations Runbook

> **Current Version**: hub-v0.6.4
> **Platforms**: Linux (Debian/Ubuntu, Raspberry Pi), Windows 10/11+
> **Delivery Modes**: Native (systemd/NSSM service), Container (Docker Compose)
> **Last Updated**: June 2026

---

## Table of Contents

1. [What Is the Hub?](#what-is-the-hub)
2. [Architecture](#architecture)
3. [System Requirements](#system-requirements)
4. [Installation](#installation)
5. [Activation & Licensing](#activation--licensing)
6. [Configuration Reference](#configuration-reference)
7. [Operations Runbook](#operations-runbook)
8. [Update & Upgrade Procedures](#update--upgrade-procedures)
9. [Backup & Recovery](#backup--recovery)
10. [Monitoring & Health Checks](#monitoring--health-checks)
11. [Security Model](#security-model)
12. [Networking & LAN Discovery](#networking--lan-discovery)
13. [Troubleshooting](#troubleshooting)
14. [Uninstalling & Decommissioning](#uninstalling--decommissioning)
15. [CI/CD & Building from Source](#cicd--building-from-source)

---

## What Is the Hub?

The **Facility Hub** is a local Django REST API server that runs on-premise at a healthcare facility. It provides:

- **Offline-first operation**: Facilities with unreliable internet continue working without interruption
- **Multi-user LAN access**: Multiple desktop/mobile clients on the local network connect to one hub
- **Cloud sync**: When internet is available, the hub pushes data to the Vitora cloud
- **License-gated features**: Analytics, advanced reporting, and integrations require a valid license

The hub is NOT the desktop application — it's the backend server that desktop/mobile clients connect to.

---

## Architecture

```
                          ┌──────── Internet ────────┐
                          │                          │
┌──── Facility LAN ──────────────────────────────────────────────────┐
│                         │                          │               │
│  ┌─────────────────┐   │   ┌──────────────────┐   │               │
│  │ Desktop Client  │───┼──▶│   Facility Hub   │───┼──▶ Vitora Cloud│
│  │  (Tauri app)    │   │   │  (Django + ASGI) │   │   (Azure)     │
│  └─────────────────┘   │   │                  │   │               │
│                         │   │  SQLite (WAL)    │   │               │
│  ┌─────────────────┐   │   │  Port 9088       │   │               │
│  │ Desktop Client  │───┼──▶│  WebSocket       │   │               │
│  │  (Tauri app)    │   │   │  License guard   │   │               │
│  └─────────────────┘   │   └──────────────────┘   │               │
│                         │                          │               │
│  ┌─────────────────┐   │                          │               │
│  │ Mobile Client   │───┘                          │               │
│  │  (React Native) │                              │               │
│  └─────────────────┘                              │               │
└───────────────────────────────────────────────────┘               │
                                                                     │
                          ┌──────────────────────────────────────────┘
                          ▼
                 ┌─────────────────────┐
                 │   Vitora Cloud API  │
                 │  (Azure Container)  │
                 │  PostgreSQL (Neon)  │
                 │  SHA/DHIS2 relay    │
                 └─────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Daphne (ASGI)** | HTTP + WebSocket server |
| **SQLite (WAL mode)** | Local database (supports ≤20 concurrent users) |
| **WhiteNoise** | Static file serving (no nginx needed) |
| **InMemoryChannelLayer** | WebSocket pub/sub (upgrade to Redis for >10 clients) |
| **License Guard Middleware** | Enforces license validity with tiered grace periods |
| **Cloud Sync Worker** | Background sync to cloud (Celery or thread-based) |
| **mDNS (avahi)** | LAN service discovery on Raspberry Pi |

---

## System Requirements

### Hardware

| Deployment | Minimum | Recommended |
|------------|---------|-------------|
| **Raspberry Pi** | Pi 4 (2GB RAM) | Pi 5 (8-16GB RAM) |
| **Dedicated PC** | 2 cores, 2GB RAM | 4 cores, 4GB RAM |
| **Windows PC** | 2 cores, 4GB RAM | 4 cores, 8GB RAM |
| **Docker (any)** | 2GB RAM | 4GB RAM |
| **Storage** | 2GB free | 10GB+ (for growing SQLite DB) |

### Software

| Platform | Requirements |
|----------|-------------|
| **Linux (native)** | Ubuntu 22.04+ / Debian 12+, Python 3.11+ |
| **Linux (container)** | Docker 20.10+, docker compose v2 |
| **Windows** | Windows 10/11 or Server 2019+, Python 3.11+ |
| **Network** | LAN connectivity, optional internet for cloud sync |

---

## Installation

### Linux — Interactive (Recommended)

```bash
# One-liner (downloads and runs installer)
curl -sSL https://get.vitora.digital/hub | sudo bash

# Or with a specific version
curl -sSL https://get.vitora.digital/hub | sudo bash -s -- --version 0.4.0

# Container mode (requires Docker)
curl -sSL https://get.vitora.digital/hub | sudo bash -s -- --mode container
```

### Linux — Non-Interactive (Automation)

```bash
export ACTIVATION_CODE="ABC-123-XYZ"
export CLOUD_URL="https://api.vitora.digital"  # optional, this is the default
curl -sSL https://get.vitora.digital/hub | sudo bash -s -- --non-interactive
```

### Windows — Interactive

```powershell
# Download and run (as Administrator)
irm https://get.vitora.digital/hub.ps1 | iex

# Or with specific version
powershell -ExecutionPolicy Bypass -File install-hub-windows.ps1 -Version 0.4.0
```

### Windows — Non-Interactive

```powershell
$env:ACTIVATION_CODE = "ABC-123-XYZ"
$env:CLOUD_URL = "https://api.vitora.digital"
powershell -ExecutionPolicy Bypass -File install-hub-windows.ps1 -NonInteractive
```

### Installer Options

| Option | Linux | Windows | Default |
|--------|-------|---------|---------|
| Version | `--version 0.4.0` | `-Version 0.4.0` | Latest from CDN |
| Port | `--port 9090` | `-Port 9090` | 9088 |
| Mode | `--mode container` | N/A | native |
| Non-interactive | `--non-interactive` | `-NonInteractive` | Interactive |

### What the Installer Does

1. **Pre-checks**: Verifies root/admin, Python 3.11+, network tools
2. **Activation**: Calls `/api/licensing/activate/` with your activation code
3. **Downloads**: Fetches versioned artifact from CDN (`https://get.vitora.digital/hub/`)
4. **Extracts**: Unpacks to `/opt/vitora` (Linux) or `C:\VitoraHub` (Windows)
5. **Hardens**: Sets restrictive file permissions (root-only write)
6. **Python env**: Creates virtualenv, installs dependencies
7. **Configuration**: Generates `.env` with secrets and activation data
8. **Database**: Runs migrations, seeds org/facility from activation response
9. **Service**: Installs systemd service (Linux) or NSSM service (Windows)
10. **Firewall**: Opens port in ufw (Linux) or Windows Firewall
11. **Pi extras**: mDNS (avahi), hostname, SD card journal optimization

---

## Activation & Licensing

### Activation Flow

```
Admin Panel (Cloud)          Installer                    Hub
      │                          │                        │
      │ Generate Activation Code │                        │
      │◄─────────────────────────│                        │
      │                          │                        │
      │   POST /api/licensing/activate/                   │
      │   {activation_code, installation_id}              │
      │──────────────────────────────────────────────────▶│
      │                          │                        │
      │   Response: {license_token, org, facility,        │
      │              sync_url, encryption_key}            │
      │◄──────────────────────────────────────────────────│
      │                          │                        │
      │                          │ Writes license.jwt     │
      │                          │ Seeds org/facility     │
      │                          │ Starts service         │
```

### License Enforcement Tiers

| Status | Days Past Expiry | Behavior |
|--------|-----------------|----------|
| **Valid** | N/A | Full access |
| **Soft Grace** | 0–7 days | Full access + `X-License-Warning: expired-soft-grace` header |
| **Read-Only** | 7–14 days | GET requests only; writes return 403 |
| **Locked** | >14 days | All API requests blocked except login + check-in |
| **Revoked** | N/A | Immediate full block |

### License Renewal

The hub's Celery task `license_check_in` runs periodically:
1. Calls cloud `/api/licensing/check-in/` with hub telemetry
2. Cloud validates and returns a fresh license JWT
3. Hub caches the new JWT at `HUB_LICENSE_TOKEN_PATH`

**If internet is unavailable**, the hub continues operating using the cached JWT until grace periods expire.

### Cloud-Only Features (Hub Mode)

When running in hub mode, certain integrations route through the cloud:
- **SHA Claims**: Submitted via cloud proxy (cloud holds DHA credentials)
- **SHA Eligibility**: Checked via cloud proxy
- **MOH/KHIS Reports**: Submitted via cloud relay
- **Analytics**: Requires `analytics` feature flag on the subscription plan

### Exempt Paths (Always Accessible Regardless of License)

```
/api/licensing/    — check-in, activation, status
/api/token/        — JWT login
/api/auth/         — cookie auth
/api/hub/          — hub health, wipe check
/admin/            — Django admin (local operations)
/static/           — static files
```

---

## Configuration Reference

### File Locations

| Platform | Config File | Database | Logs |
|----------|------------|----------|------|
| **Linux (native)** | `/opt/vitora/.env` | `/var/lib/vitora/hub.sqlite3` | `/var/log/vitora/` |
| **Linux (container)** | `/opt/vitora/.env` | Docker volume `vitora-data` | Docker logs |
| **Windows** | `C:\VitoraHub\.env` | `C:\VitoraHub\data\hub.sqlite3` | `C:\VitoraHub\logs\` |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DJANGO_ENV` | Yes | `hub` | Must be `hub` for hub mode |
| `DJANGO_SECRET_KEY` | Auto | Generated | Django cryptographic secret |
| `ENCRYPTION_KEY` | Yes | From activation | Fernet key for PII encryption |
| `HUB_ID` | Yes | From activation | Unique installation identifier |
| `HUB_FACILITY_ID` | Yes | From activation | Facility UUID |
| `HUB_ORGANIZATION_ID` | Yes | From activation | Organization UUID |
| `HUB_PORT` | No | `9088` | HTTP port |
| `HUB_DB_PATH` | No | `/var/lib/vitora/hub.sqlite3` | SQLite database path |
| `HUB_DATA_DIR` | No | `/var/lib/vitora` | Writable data directory |
| `HUB_LOG_FILE` | No | `/var/log/vitora/hub.log` | Log file path |
| `SYNC_SERVER_URL` | No | `https://api.vitora.digital/api/sync` | Cloud sync endpoint |
| `HUB_LICENSE_TOKEN_PATH` | No | `/var/lib/vitora-hub/license.jwt` | Cached activation/license JWT used for hub identity |
| `LICENSE_TOKEN` | Yes | From activation | Initial license JWT; sync falls back to `HUB_LICENSE_TOKEN_PATH` when unset |
| `ALLOWED_HOSTS` | No | `*` | Django allowed hosts |
| `HUB_REDIS_URL` | No | Empty | Redis URL (enables Redis channel layer) |
| `CELERY_BROKER_URL` | No | Empty | Celery broker (empty = thread-based sync) |

### Django Settings (hub.py)

Key differences from cloud/production:

| Setting | Hub Value | Cloud Value |
|---------|-----------|-------------|
| `DEBUG` | `False` | `False` |
| `DATABASES` | SQLite (WAL) | PostgreSQL |
| `CHANNEL_LAYERS` | InMemoryChannelLayer | Redis |
| `POWERSYNC_URL` | Empty (disabled) | PowerSync Cloud URL |
| `SENTRY_DSN` | Empty (disabled) | Sentry project URL |
| `EMAIL_BACKEND` | Console (disabled) | SendGrid/SES |
| `CORS_ALLOW_ALL_ORIGINS` | `True` | `False` |
| `AUTH_COOKIE_SECURE` | `False` (HTTP LAN) | `True` (HTTPS) |
| `SESSION_ENGINE` | `db` | `db` or Redis |
| `SETUP_WIZARD_ENABLED` | `True` | `False` |
| `MFA_ENFORCEMENT` | `True` | `True` |

---

## Operations Runbook

### Daily Operations

#### Check Service Status

**Linux:**
```bash
systemctl status vitora-hub
```

**Windows:**
```powershell
Get-Service VitoraHub
```

#### View Logs (Real-time)

**Linux:**
```bash
# Systemd journal
journalctl -u vitora-hub -f

# Or file-based
tail -f /var/log/vitora/hub.log
```

**Windows:**
```powershell
Get-Content C:\VitoraHub\logs\hub-stdout.log -Tail 50 -Wait
```

**Docker:**
```bash
cd /opt/vitora && docker compose logs -f hub
```

#### Health Check

```bash
curl http://localhost:9088/api/hub/health/
# Expected: {"status": "healthy", ...}
```

The `sync` block reports local queue state. For example, `"pending": 7` means seven local `SyncQueue` entries are waiting to be pushed to the cloud. `"last_synced_at": null` means no entry has been marked `SYNCED` yet on this hub database.

#### Force Cloud Sync

Run one push/pull cycle when health shows pending items or after restoring connectivity.

Hub cloud sync authenticates with the hub's activation/license identity. The worker sends the cached license JWT as a bearer token to `/api/sync/push/` and `/api/sync/pull/`; it does not use a staff username, password, service account, or MFA bypass.

Admins can also use the desktop app: Settings -> Desktop -> Hub Operations -> Sync Now. The Desktop tab is visible only in Tauri and only to admin roles.

**Linux:**
```bash
cd /opt/vitora
sudo -u vitora /opt/vitora/venv/bin/python manage.py hub_sync
```

**Windows:**
```powershell
cd C:\VitoraHub
.\hub-shell.ps1 hub_sync
```

The command reports `pushed`, `pulled`, and queue counts before/after the run. Missing sync settings or a missing license token exits with an error and leaves pending queue entries intact.

#### Check License Status

```bash
curl http://localhost:9088/api/licensing/status/
# Shows: expiry date, grace period status, feature flags
```

### Service Management

#### Start / Stop / Restart

**Linux (systemd):**
```bash
sudo systemctl start vitora-hub
sudo systemctl stop vitora-hub
sudo systemctl restart vitora-hub
```

**Windows (NSSM):**
```powershell
Start-Service VitoraHub
Stop-Service VitoraHub
Restart-Service VitoraHub

# Or via NSSM (more control):
C:\VitoraHub\nssm\nssm.exe restart VitoraHub
```

**Docker:**
```bash
cd /opt/vitora
docker compose restart hub
docker compose stop hub
docker compose start hub
```

#### Disable Auto-Start (Maintenance Mode)

**Linux:**
```bash
sudo systemctl disable vitora-hub
sudo systemctl stop vitora-hub
# Re-enable after maintenance:
sudo systemctl enable vitora-hub
sudo systemctl start vitora-hub
```

**Windows:**
```powershell
Set-Service VitoraHub -StartupType Disabled
Stop-Service VitoraHub
# Re-enable:
Set-Service VitoraHub -StartupType Automatic
Start-Service VitoraHub
```

### Database Operations

#### Run Migrations (After Update)

```bash
# Linux
cd /opt/vitora
sudo -u vitora /opt/vitora/venv/bin/python manage.py migrate --no-input

# Windows (run as Administrator)
cd C:\VitoraHub
.\venv\Scripts\python.exe manage.py migrate --no-input
```

#### Create Admin User

```bash
# Linux
cd /opt/vitora
sudo -u vitora /opt/vitora/venv/bin/python manage.py createsuperuser

# Windows
cd C:\VitoraHub
.\venv\Scripts\python.exe manage.py createsuperuser
```

#### Check Database Size

```bash
# Linux
ls -lh /var/lib/vitora/hub.sqlite3

# Windows
(Get-Item C:\VitoraHub\data\hub.sqlite3).Length / 1MB
```

#### Vacuum Database (Reclaim Space)

```bash
# Linux
sqlite3 /var/lib/vitora/hub.sqlite3 "VACUUM;"

# Windows
sqlite3.exe C:\VitoraHub\data\hub.sqlite3 "VACUUM;"
```

#### Check SQLite Integrity

```bash
sqlite3 /var/lib/vitora/hub.sqlite3 "PRAGMA integrity_check;"
# Expected output: "ok"
```

### Django Management Commands (Hub-Relevant)

```bash
# These all run from the hub install directory with the venv Python

# Sync role permissions (after role changes)
python manage.py sync_role_permissions

# Load/reload clinical templates
python manage.py load_clinical_templates

# Import ICD-10 codes (first run)
python manage.py import_icd10

# Load Kenya locations (first run)
python manage.py import_kenya_locations

# Generate ward beds (after adding wards)
python manage.py generate_ward_beds

# Collect static files (after update)
python manage.py collectstatic --no-input

# Seed demo data (testing only)
python manage.py seed_demo_data
```

---

## Update & Upgrade Procedures

### Automatic Updates (Container Mode)

The hub's update service periodically checks for new versions:
1. Queries CDN for `latest.json`
2. Pulls new container image
3. Verifies cosign signature
4. Restarts container
5. Health-checks the new version
6. Rolls back on failure

### Manual Update (Native Mode — Linux)

```bash
# 1. Stop the service
sudo systemctl stop vitora-hub

# 2. Backup the database
sudo cp /var/lib/vitora/hub.sqlite3 /var/lib/vitora/hub.sqlite3.bak

# 3. Download new version
VERSION="0.4.0"
curl -fsSL "https://get.vitora.digital/hub/vitora-hub-${VERSION}.tar.gz" -o /tmp/hub.tar.gz

# 4. Extract (overwrite code, keep .env and data)
sudo tar -xzf /tmp/hub.tar.gz -C /opt/vitora --strip-components=1

# 5. Re-harden permissions
sudo chown -R root:vitora /opt/vitora
sudo chmod -R 750 /opt/vitora

# 6. Update Python dependencies
sudo -u vitora /opt/vitora/venv/bin/pip install -r /opt/vitora/requirements-hub.txt

# 7. Run migrations
cd /opt/vitora
sudo -u vitora /opt/vitora/venv/bin/python manage.py migrate --no-input

# 8. Collect static files
sudo -u vitora /opt/vitora/venv/bin/python manage.py collectstatic --no-input

# 9. Restart
sudo systemctl start vitora-hub

# 10. Verify
sleep 3
curl http://localhost:9088/api/hub/health/
```

### Manual Update (Native Mode — Windows)

```powershell
# 1. Stop service
Stop-Service VitoraHub

# 2. Backup database
Copy-Item "C:\VitoraHub\data\hub.sqlite3" "C:\VitoraHub\data\hub.sqlite3.bak"

# 3. Download and extract new version
$Version = "0.4.0"
Invoke-WebRequest -Uri "https://get.vitora.digital/hub/vitora-hub-${Version}.zip" -OutFile "$env:TEMP\hub.zip"
Expand-Archive -Path "$env:TEMP\hub.zip" -DestinationPath "$env:TEMP\hub-update" -Force

# 4. Copy new code (preserve .env and data/)
$source = Get-ChildItem "$env:TEMP\hub-update" -Directory | Select-Object -First 1
Get-ChildItem $source.FullName | Where-Object { $_.Name -notin @('.env', 'data', 'logs', 'nssm', 'venv') } | ForEach-Object {
    $dest = Join-Path "C:\VitoraHub" $_.Name
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Move-Item $_.FullName $dest
}

# 5. Update dependencies
& C:\VitoraHub\venv\Scripts\python.exe -m pip install -r C:\VitoraHub\requirements-hub.txt

# 6. Run migrations
Push-Location C:\VitoraHub
& .\venv\Scripts\python.exe manage.py migrate --no-input
& .\venv\Scripts\python.exe manage.py collectstatic --no-input
Pop-Location

# 7. Restart
Start-Service VitoraHub

# 8. Verify
Start-Sleep -Seconds 3
Invoke-RestMethod http://localhost:9088/api/hub/health/
```

### Rollback Procedure

```bash
# Linux
sudo systemctl stop vitora-hub
sudo cp /var/lib/vitora/hub.sqlite3.bak /var/lib/vitora/hub.sqlite3
# Re-install previous version artifact or restore from backup
sudo systemctl start vitora-hub
```

---

## Backup & Recovery

### What to Back Up

| Item | Path (Linux) | Path (Windows) | Priority |
|------|------|------|----------|
| Database | `/var/lib/vitora/hub.sqlite3` | `C:\VitoraHub\data\hub.sqlite3` | **Critical** |
| WAL file | `/var/lib/vitora/hub.sqlite3-wal` | `C:\VitoraHub\data\hub.sqlite3-wal` | **Critical** |
| Environment | `/opt/vitora/.env` | `C:\VitoraHub\.env` | High |
| License | `/var/lib/vitora/license.jwt` | `C:\VitoraHub\data\license.jwt` | High |
| Secret key | `/var/lib/vitora/.hub_secret_key` | `C:\VitoraHub\data\.hub_secret_key` | High |
| Media | `/opt/vitora/media/` | `C:\VitoraHub\media\` | Medium |

### Backup Script (Linux)

```bash
#!/bin/bash
# /opt/vitora/scripts/backup.sh — Run via cron
BACKUP_DIR="/var/lib/vitora/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

# SQLite online backup (safe for running database)
sqlite3 /var/lib/vitora/hub.sqlite3 ".backup '$BACKUP_DIR/hub-${TIMESTAMP}.sqlite3'"

# Backup config files
tar -czf "$BACKUP_DIR/config-${TIMESTAMP}.tar.gz" \
  /opt/vitora/.env \
  /var/lib/vitora/license.jwt \
  /var/lib/vitora/.hub_secret_key

# Rotate: keep last 7 days
find "$BACKUP_DIR" -name "*.sqlite3" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

Add to cron:
```bash
# Daily backup at 2am
echo "0 2 * * * /opt/vitora/scripts/backup.sh" | sudo tee /etc/cron.d/vitora-backup
```

### Recovery Procedure

```bash
# 1. Stop the hub
sudo systemctl stop vitora-hub

# 2. Restore database from backup
sudo cp /var/lib/vitora/backups/hub-YYYYMMDD-HHMMSS.sqlite3 /var/lib/vitora/hub.sqlite3
sudo chown vitora:vitora /var/lib/vitora/hub.sqlite3

# 3. Restore config (if needed)
sudo tar -xzf /var/lib/vitora/backups/config-YYYYMMDD-HHMMSS.tar.gz -C /

# 4. Restart
sudo systemctl start vitora-hub

# 5. Verify
curl http://localhost:9088/api/hub/health/
```

---

## Monitoring & Health Checks

### Health Endpoint

```bash
curl http://localhost:9088/api/hub/health/
```

Returns:
```json
{
  "status": "healthy",
  "version": "0.4.0",
  "hub_id": "hub-raspberrypi-1718000000",
  "facility_id": "fac-uuid",
  "uptime_seconds": 86400,
  "db_size_mb": 45.2,
  "last_sync": "2026-06-12T14:30:00Z"
}
```

### License Status

```bash
curl http://localhost:9088/api/licensing/status/
```

### Monitoring Checklist

| Check | Frequency | Command | Alert If |
|-------|-----------|---------|----------|
| Service running | 1 min | `systemctl is-active vitora-hub` | inactive |
| Health endpoint | 5 min | `curl -sf localhost:9088/api/hub/health/` | non-200 |
| License expiry | Daily | Check `X-License-Warning` header | expired-soft-grace |
| Disk space | Hourly | `df -h /var/lib/vitora` | >80% |
| DB size | Daily | `ls -lh hub.sqlite3` | >1GB |
| Last cloud sync | Hourly | Health endpoint `last_sync` | >1 hour ago |

### Simple Watchdog (Linux)

```bash
# /etc/cron.d/vitora-watchdog
*/5 * * * * root systemctl is-active vitora-hub || systemctl restart vitora-hub
```

---

## Security Model

### File Permissions

**Linux:**
```
/opt/vitora/           → root:vitora 750 (code — not writable by service user)
/var/lib/vitora/       → vitora:vitora 700 (data — writable by service)
/var/log/vitora/       → vitora:vitora 700 (logs — writable by service)
/opt/vitora/.env       → vitora:vitora 600 (secrets — service-only read)
```

**Windows:**
```
C:\VitoraHub\          → Administrators: Full, SYSTEM: Full, Users: ReadAndExecute
C:\VitoraHub\data\     → Service account writable
C:\VitoraHub\logs\     → Service account writable
```

### Systemd Security Hardening

The service unit applies these restrictions:
- `NoNewPrivileges=true` — cannot escalate
- `ProtectSystem=strict` — filesystem read-only except allowed paths
- `ProtectHome=true` — no access to /home
- `ReadWritePaths=/var/lib/vitora /var/log/vitora` — only these are writable
- `PrivateTmp=true` — isolated /tmp

### License Guard Middleware

All API requests (except exempt paths) pass through `HubLicenseGuardMiddleware`:
- Verifies the RS256-signed license JWT
- Enforces tiered grace periods on expiry
- Returns appropriate HTTP 403 codes for UI handling

### PII Encryption

The hub uses the same Fernet encryption key as the cloud for:
- `Patient.national_id`
- `Patient.phone_number`
- `Patient.email`
- `Patient.address`

The key is provided during activation and stored in `.env`.

### CORS (LAN)

Hub allows all origins (`CORS_ALLOW_ALL_ORIGINS = True`) because it's not internet-facing. Desktop apps on different LAN IPs need unrestricted access.

### Cookie Security (LAN)

```
AUTH_COOKIE_SECURE = False      # HTTP on LAN (no TLS)
AUTH_COOKIE_SAMESITE = "Lax"    # Prevent CSRF from external sites
```

---

## Networking & LAN Discovery

### Default Port

The hub listens on **port 9088** on all interfaces (`0.0.0.0:9088`).

### Firewall Rules

**Linux (ufw):**
```bash
sudo ufw allow 9088/tcp comment "Vitora Hub"
```

**Windows:**
```powershell
# Already configured by installer (Private profile only)
Get-NetFirewallRule -DisplayName "Vitora Hub*"
```

### mDNS Discovery (Raspberry Pi)

On Raspberry Pi installations, the hub advertises via Avahi (mDNS):
- Hostname: `vitora-hub.local`
- Service: `_http._tcp` on port 9088
- TXT records: `path=/api/hub/health/`, `version=0.4.0`

Desktop clients can connect to `http://vitora-hub.local:9088` without knowing the IP.

### Finding the Hub IP

```bash
# On the hub itself
hostname -I | awk '{print $1}'

# From another machine on the same LAN
# Option 1: mDNS (if avahi is running)
ping vitora-hub.local

# Option 2: Port scan
nmap -p 9088 192.168.1.0/24

# Option 3: Check router DHCP leases
```

### Desktop Client Connection

When setting up the desktop app in "Facility Workstation" mode:
1. Enter: `http://<hub-ip>:9088`
2. The app validates via health check
3. All subsequent API calls go to this URL

---

## Troubleshooting

### Service Won't Start

**Check the logs first:**
```bash
# Linux
journalctl -u vitora-hub -n 50 --no-pager
cat /var/log/vitora/hub-error.log

# Windows
Get-Content C:\VitoraHub\logs\hub-stderr.log -Tail 50
```

**Common causes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ModuleNotFoundError` | Venv corrupted or deps not installed | Re-run `pip install -r requirements-hub.txt` |
| `OperationalError: database is locked` | Another process has the DB open | Kill stale processes: `fuser hub.sqlite3` |
| `Address already in use` | Port 9088 occupied | `lsof -i :9088` then kill or change port |
| `Permission denied: .env` | Wrong file ownership | `chown vitora:vitora /opt/vitora/.env` |
| `No module named 'hmis'` | Working directory wrong | Check `WorkingDirectory` in service unit |

### License Errors

| Error Code | Meaning | Resolution |
|------------|---------|-----------|
| `hub_not_activated` | No `license.jwt` file found | Re-run installer or copy license file |
| `hub_license_invalid` | JWT signature verification failed | Get new license from cloud admin |
| `hub_license_read_only` | Expired 7-14 days | Restore internet for auto-renewal |
| `hub_license_expired` | Expired >14 days | Contact Nexora support |

### Cloud Sync Failing

```bash
# Check sync status
curl http://localhost:9088/api/hub/health/ | python3 -m json.tool

# Check if cloud is reachable
curl -sf https://api.vitora.digital/api/health/

# Check DNS resolution
nslookup api.vitora.digital

# Force sync (if Celery is available)
cd /opt/vitora
sudo -u vitora /opt/vitora/venv/bin/python manage.py shell -c "
from hmis.apps.core.tasks import sync_to_cloud
sync_to_cloud.delay()
"
```

### Desktop Clients Can't Connect

1. **Verify hub is running**: `curl http://localhost:9088/api/hub/health/`
2. **Check firewall**: `sudo ufw status` — port 9088 must be allowed
3. **Check network**: Client and hub on same subnet?
4. **Check CORS**: Hub uses `CORS_ALLOW_ALL_ORIGINS=True` by default
5. **Test from client**: `curl http://<hub-ip>:9088/api/hub/health/`

### Database Issues

**"database disk image is malformed":**
```bash
sudo systemctl stop vitora-hub
sqlite3 /var/lib/vitora/hub.sqlite3 ".recover" | sqlite3 /var/lib/vitora/hub-recovered.sqlite3
mv /var/lib/vitora/hub.sqlite3 /var/lib/vitora/hub-corrupted.sqlite3
mv /var/lib/vitora/hub-recovered.sqlite3 /var/lib/vitora/hub.sqlite3
chown vitora:vitora /var/lib/vitora/hub.sqlite3
sudo systemctl start vitora-hub
```

**WAL file growing too large:**
```bash
sqlite3 /var/lib/vitora/hub.sqlite3 "PRAGMA wal_checkpoint(TRUNCATE);"
```

### Raspberry Pi Specific

**SD card wear:**
- Journal is set to volatile (`Storage=volatile` in journald config)
- SQLite WAL mode reduces write amplification
- Monitor SD health: `cat /sys/block/mmcblk0/stat`

**Overheating (throttling):**
```bash
vcgencmd measure_temp
# If >80°C, add a heatsink or fan
```

---

## Uninstalling & Decommissioning

### Linux (Native Mode)

```bash
# 1. Stop and disable service
sudo systemctl stop vitora-hub
sudo systemctl disable vitora-hub

# 2. Remove systemd unit
sudo rm /etc/systemd/system/vitora-hub.service
sudo systemctl daemon-reload

# 3. Remove application code
sudo rm -rf /opt/vitora

# 4. (Optional) Remove data — WARNING: destroys patient data!
sudo rm -rf /var/lib/vitora
sudo rm -rf /var/log/vitora

# 5. (Optional) Remove service user
sudo userdel vitora

# 6. (Optional) Remove mDNS advertisement (Raspberry Pi)
sudo rm -f /etc/avahi/services/vitora-hub.service
sudo systemctl restart avahi-daemon

# 7. (Optional) Remove firewall rule
sudo ufw delete allow 9088/tcp
```

### Linux (Container Mode)

```bash
# 1. Stop and remove containers
cd /opt/vitora && sudo docker compose down

# 2. Remove images
sudo docker rmi $(docker images --filter=reference='*vitora*' -q) 2>/dev/null

# 3. Remove volumes (WARNING: destroys data!)
sudo docker volume rm vitora-data 2>/dev/null

# 4. Remove config
sudo rm -rf /opt/vitora
sudo rm -rf /var/lib/vitora
sudo rm -rf /var/log/vitora
```

### Windows

```powershell
# 1. Stop and remove service
Stop-Service VitoraHub -ErrorAction SilentlyContinue
sc.exe delete VitoraHub

# 2. Remove application
Remove-Item -Recurse -Force "C:\VitoraHub"

# 3. Remove firewall rule
Remove-NetFirewallRule -DisplayName "Vitora Hub*" -ErrorAction SilentlyContinue
```

### Decommissioning Checklist

Before decommissioning a hub, ensure:
- [ ] All data has been synced to cloud (`last_sync` is recent)
- [ ] Database backup taken and stored securely
- [ ] Encryption key (`ENCRYPTION_KEY`) saved — needed to decrypt PII in backups
- [ ] License deactivated in cloud admin panel
- [ ] Desktop clients reconfigured to use cloud or new hub

---

## CI/CD & Building from Source

### Build Pipelines

| Workflow | Trigger | Output |
|----------|---------|--------|
| `build-hub.yml` | Tag `hub-v*` | Tarball + upload to Azure CDN |
| `build-compiled-hub.yml` | Tag `hub-compiled-v*` | Nuitka-compiled tarball (no Python source) |
| `build-hub-container.yml` | Tag `hub-v*` | OCI image pushed to registry |

### Building Locally

```bash
cd backend

# Install dependencies
poetry install

# Generate requirements for hub deployment
poetry export -f requirements.txt --without-hashes > requirements-hub.txt

# Create tarball
mkdir -p /tmp/vitora-hub
cp -r hmis manage.py requirements-hub.txt data scripts /tmp/vitora-hub/
tar -czf vitora-hub-0.4.0.tar.gz -C /tmp vitora-hub
```

### Compiled Build (Nuitka)

For production deployments where Python source should not be visible:

```bash
cd backend
python scripts/compile-hub.py
# Output: build/compiled/payload/ (compiled .so/.pyd files)
```

The compiled build is signed with cosign for integrity verification.

---

## Version History

| Tag | Date | Highlights |
|-----|------|-----------|
| `hub-v0.4.0` | Jun 2026 | Code protection gaps, container lifecycle, ACL hardening |
| `hub-v0.3.0` | May 2026 | License guard middleware, cloud proxy routing |
| `hub-v0.2.0` | Apr 2026 | Activation-driven installer, Windows support |
| `hub-v0.1.0` | Mar 2026 | Initial hub release (Linux + Raspberry Pi) |
