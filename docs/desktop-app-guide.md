# Vitora HMIS Desktop Application — Comprehensive Guide

> **Version**: 0.1.0 (Tauri v2)
> **Platforms**: Windows (x64), Linux (x64), macOS (ARM64)
> **Last Updated**: June 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
4. [First-Run Setup](#first-run-setup)
5. [Deployment Modes](#deployment-modes)
6. [Configuration Reference](#configuration-reference)
7. [Native Capabilities](#native-capabilities)
8. [Development Guide](#development-guide)
9. [Build & Release](#build--release)
10. [Auto-Update System](#auto-update-system)
11. [Troubleshooting](#troubleshooting)
12. [Operations Runbook](#operations-runbook)

---

## Architecture Overview

```
┌─ Tauri Shell (Rust, ~10MB) ────────────────────────────────────┐
│  WebView2/WebKit → http://127.0.0.1:<random-port>              │
│  ├─ System tray: Show/Quit, close-to-tray, double-click restore│
│  ├─ Auto-updater: Ed25519 signed, checks releases CDN          │
│  ├─ Printer: ESC/POS via system spooler (lp / copy /B)         │
│  ├─ Notifications: native OS notifications                      │
│  ├─ Deep links: vitora:// URL scheme                            │
│  └─ Window state: persists size/position across sessions        │
└────────────┬───────────────────────────────────────────────────┘
             │ spawns
┌────────────▼───────────────────────────────────────────────────┐
│  Node.js v22 LTS sidecar (bundled binary, ~70MB)               │
│  └─ next start (standalone build of web-app)                    │
│     Env: PORT=<random>, NEXT_PUBLIC_API_URL=<from config>       │
└────────────┬───────────────────────────────────────────────────┘
             │ HTTP (withCredentials cookies)
┌────────────▼───────────────────────────────────────────────────┐
│  Backend API                                                    │
│  ├─ Cloud: https://api.vitora.digital (Standalone mode)         │
│  └─ Hub: http://192.168.x.x:9088 (LAN Client mode)             │
└────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- The web-app runs locally inside a Node.js sidecar — no internet required to load the UI
- A random free TCP port is selected on each launch to avoid conflicts
- The Rust shell manages lifecycle, tray, auto-updates, printing, and native OS integration
- In dev mode, the sidecar is skipped — Tauri points directly to the dev server (port 3009)

---

## System Requirements

### End Users (Installation)

| Platform | Minimum | Recommended |
|----------|---------|-------------|
| **Windows** | Windows 10 (1809+) | Windows 11 |
| **Linux** | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 |
| **macOS** | macOS 12 (Monterey) | macOS 14+ (Apple Silicon) |
| **RAM** | 512MB free | 1GB+ free |
| **Disk** | 200MB | 500MB |
| **Network** | LAN connectivity to hub or internet | Stable connection |

WebView2 is bundled in the Windows installer (silent embed). Linux requires WebKitGTK 4.1.

### Developers (Building)

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | 1.70+ | Tauri shell compilation |
| Node.js | 22 LTS | Building web-app + sidecar |
| npm | 10+ | Package management |

**Linux dev dependencies:**
```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf libssl-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

---

## Installation

### Windows

1. Download `Vitora HMIS_0.1.0_x64-setup.exe` from the latest GitHub Release
2. Run the installer (requires Admin for per-machine install)
3. WebView2 is embedded — no separate download needed
4. Start from Start Menu → "Vitora HMIS"

### Linux

```bash
# DEB (Ubuntu/Debian)
sudo dpkg -i vitora-hmis_0.1.0_amd64.deb

# AppImage (portable)
chmod +x vitora-hmis_0.1.0_amd64.AppImage
./vitora-hmis_0.1.0_amd64.AppImage
```

### macOS

1. Download `Vitora HMIS_0.1.0_aarch64.dmg`
2. Drag to Applications folder
3. First launch: right-click → Open (to bypass Gatekeeper until notarization is set up)

---

## First-Run Setup

On first launch, the app detects `setup_completed: false` in config and redirects to `/desktop-setup`.

### Setup Flow

1. **Splash screen** → app loads the bundled web frontend
2. **First-run detection** → redirect to setup page
3. **Choose deployment mode** (see next section)
4. **Enter API/Hub URL** → connection test validates the endpoint
5. **Save** → config persisted to disk, `setup_completed = true`
6. **Login page** appears → enter credentials
7. **Session persists** — cookies stored in WebView2 profile, survive restarts

### Connection Test

The setup page validates the endpoint before saving:
```
GET <url>/api/health/ → expects 200 OK
```

---

## Deployment Modes

The desktop app supports four operating modes configured during first-run:

| Mode | API Target | Use Case |
|------|-----------|----------|
| **Standalone** | `https://api.vitora.digital` | Single user, direct cloud access |
| **LAN Client** | `http://<hub-ip>:9088` | Multi-user facility, connects to local hub |
| **LAN Hub** | `http://127.0.0.1:9088` | This machine IS the hub (runs Django locally) |
| **Web Only** | Cloud + PowerSync | Unusual for desktop; browser-like mode |

### Standalone Mode
- Best for: Clinicians working from home, single-provider clinics
- Internet required for all API calls
- Cookie auth to cloud API (SameSite=None; Secure)

### LAN Client Mode
- Best for: Multi-user facilities with a dedicated hub machine
- Hub URL is the facility server's LAN IP (e.g., `http://192.168.1.100:9088`)
- Works entirely offline from internet (hub handles sync to cloud)
- Cookie auth over HTTP (SameSite=Lax)

### LAN Hub Mode
- Best for: Small facilities where one PC serves as both workstation and hub
- The installer sets up Django as a local service
- Desktop app connects to localhost

---

## Configuration Reference

### Config File Location

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\digital.vitora.hmis\config.json` |
| Linux | `~/.config/digital.vitora.hmis/config.json` |
| macOS | `~/Library/Application Support/digital.vitora.hmis/config.json` |

### Config Schema

```json
{
  "api_url": "https://vitora-api.agreeabledune-6cc420cc.eastus.azurecontainerapps.io",
  "deployment_mode": "standalone",
  "client_id": "tauri-1718000000000-abc123",
  "sync_interval_secs": 30,
  "backup_interval_mins": 30,
  "hub_url": "",
  "facility_id": "",
  "organization_id": "",
  "setup_completed": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `api_url` | string | Base URL for the Vitora API (set during first-run) |
| `deployment_mode` | enum | `standalone` / `lan_client` / `lan_hub` / `web_only` |
| `client_id` | string | Unique device ID (auto-generated, never changes) |
| `sync_interval_secs` | int | Background sync frequency (0 = disabled) |
| `backup_interval_mins` | int | Auto-backup frequency (0 = disabled) |
| `hub_url` | string | LAN hub address (only for `lan_client` mode) |
| `facility_id` | string | Facility ID for WebSocket scoping |
| `organization_id` | string | Organization ID for data scoping |
| `setup_completed` | bool | Whether first-run wizard has been completed |

### Resetting Configuration

To force re-run of the setup wizard, delete the config file:

```bash
# Linux
rm ~/.config/digital.vitora.hmis/config.json

# Windows (PowerShell)
Remove-Item "$env:APPDATA\digital.vitora.hmis\config.json"

# macOS
rm ~/Library/Application\ Support/digital.vitora.hmis/config.json
```

---

## Native Capabilities

| Feature | Implementation | Frontend API |
|---------|---------------|--------------|
| System tray | Rust `tray-icon` plugin | — (Rust-only) |
| Close to tray | `WindowEvent::CloseRequested` → hide | — |
| Auto-update | `tauri-plugin-updater` (Ed25519) | `checkForUpdates()`, `installUpdate()` |
| Window state | `tauri-plugin-window-state` | Automatic persistence |
| Notifications | `tauri-plugin-notification` | `showNotification()` |
| Deep links | `tauri-plugin-deep-link` (`vitora://`) | `onDeepLink()` |
| Printing | `lp` (Linux/Mac) / `copy /B` (Win) | `printReceipt()`, `listPrinters()` |
| File export | `tauri-plugin-fs` + `dialog` | `saveFile()` |
| Auto-start | `tauri-plugin-autostart` | — |
| First-run config | Custom `config.rs` | `isFirstRun()`, `getApiUrl()`, `setApiUrl()` |

All frontend wrappers are in `web-app/lib/desktop/index.ts` with graceful browser fallbacks (no-op when not in Tauri).

### Deep Link Scheme

The app registers `vitora://` as a URL scheme. Example deep links:
- `vitora://patient/123` — open patient detail
- `vitora://encounter/456` — open encounter

Events are emitted to the frontend as `deep-link` Tauri events.

### ESC/POS Printing

The desktop app supports thermal receipt printers:
```typescript
// List available printers
const printers = await listPrinters();

// Print ESC/POS receipt
await printReceipt({
  printer: "EPSON TM-T88V",
  data: escPosBytes
});
```

On Linux/macOS: uses `lp` system command.
On Windows: uses `copy /B` to the printer port.

---

## Development Guide

### Quick Start

```bash
# Terminal 1: Start the web-app dev server (port 3009)
cd web-app && npm run dev

# Terminal 2: Start Tauri dev shell (opens native window → loads port 3009)
cd desktop-app && npm install && npm run dev:tauri
```

Or combined:
```bash
cd desktop-app && npm run dev
```

### Project Structure

```
desktop-app/
├── package.json                    # Build scripts (dev, build, setup)
├── scripts/
│   ├── download-node.js            # Downloads Node.js binary for target platform
│   └── bundle-standalone.js        # Copies web-app standalone build into src-tauri
├── src-tauri/
│   ├── tauri.conf.json             # Main config (windows, plugins, bundle)
│   ├── Cargo.toml                  # Rust dependencies
│   ├── capabilities/
│   │   └── desktop.json            # Plugin permissions whitelist
│   ├── frontend/
│   │   └── index.html              # Splash screen (served while sidecar starts)
│   ├── icons/                      # App icons (ico, icns, png)
│   └── src/
│       ├── main.rs                 # Entry point
│       ├── lib.rs                  # App setup: sidecar, tray, plugins, events
│       ├── config.rs               # AppConfig: api_url, deployment mode, persistence
│       └── commands/
│           ├── mod.rs              # Command module exports
│           └── printer.rs          # ESC/POS printing + list_printers
```

### Dev Mode Behavior

- No sidecar is spawned — Tauri loads `http://127.0.0.1:3009` directly
- Splash screen is closed immediately
- System tray still works (Show/Quit)
- Hot-reload from the web-app dev server works normally
- Deep links are not registered (debug builds skip this)

---

## Build & Release

### Full Build Pipeline

```bash
# Download Node.js binary for your platform → build web-app → bundle standalone
npm run setup

# Compile Tauri shell → produce platform installers
npm run build:tauri
```

### Step-by-Step

```bash
npm run build:web              # Next.js standalone build (output: web-app/.next/standalone)
npm run bundle-standalone      # Copy standalone output to src-tauri/standalone/
node scripts/download-node.js  # Fetch Node.js binary for target platform
npm run build:tauri            # Tauri build → src-tauri/target/release/bundle/
```

### Build Artifacts

| Platform | Output |
|----------|--------|
| Windows | `target/release/bundle/nsis/Vitora HMIS_0.1.0_x64-setup.exe` + `.msi` |
| Linux | `target/release/bundle/deb/` + `appimage/` |
| macOS | `target/release/bundle/dmg/` |

### CI/CD Pipeline (`.github/workflows/build-desktop.yml`)

- **Trigger**: Push tag `desktop-v*` or manual dispatch
- **Matrix**: Windows x86_64, Linux x86_64, macOS aarch64
- **Signing**: Ed25519 for updater artifacts
- **Output**: GitHub Release (draft) with installers + `latest.json` updater manifest
- **CDN**: Azure Front Door at `https://vitora-releases-dzf4f6hmfdadf3gk.z01.azurefd.net/updates`

### Required CI Secrets

| Secret | Purpose |
|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Ed25519 key for updater signing |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password |
| `WINDOWS_CERTIFICATE_BASE64` | PFX cert for Windows code signing |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob upload for updater manifests |

---

## Auto-Update System

### How It Works

1. App starts → checks updater endpoint periodically
2. Endpoint: `https://vitora-releases-dzf4f6hmfdadf3gk.z01.azurefd.net/updates`
3. Compares current version vs `latest.json` manifest
4. If update available: downloads + verifies Ed25519 signature
5. Prompts user → installs update → restarts

### Updater Configuration (tauri.conf.json)

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<Ed25519 public key>",
      "endpoints": [
        "https://vitora-releases-dzf4f6hmfdadf3gk.z01.azurefd.net/updates"
      ]
    }
  }
}
```

### Forcing an Update Check

From the app's About/Settings page, trigger a manual check. Or restart the app.

### Rollback

Tauri's updater doesn't have built-in rollback. To downgrade:
1. Uninstall the current version
2. Install the desired older version from GitHub Releases

---

## Troubleshooting

### App Won't Start (Blank Window)

**Cause**: Sidecar failed to start or timed out.

1. Check if another process is using the app data directory
2. Delete the extracted standalone bundle to force re-extraction:
   ```bash
   # Linux
   rm -rf ~/.local/share/digital.vitora.hmis/standalone/

   # Windows
   Remove-Item -Recurse "$env:APPDATA\digital.vitora.hmis\standalone\"

   # macOS
   rm -rf ~/Library/Application\ Support/digital.vitora.hmis/standalone/
   ```
3. Restart the app

### "Failed to start Vitora" Error Page

**Cause**: Node.js sidecar didn't respond within 20 seconds.

- Ensure no antivirus is blocking Node.js execution
- Check available disk space (standalone extraction needs ~150MB)
- On Windows: check that WebView2 Runtime is installed

### Login Fails (401 on LAN Client)

**Cause**: Cookie domain mismatch or CORS rejection.

- Verify hub URL in config matches the actual hub IP/port
- The hub must be running (check `systemctl status vitora-hub` on Linux or `Get-Service VitoraHub` on Windows)
- Ensure the hub's `CORS_ALLOW_ALL_ORIGINS = True` is set (default in hub settings)

### System Tray Icon Missing (Linux)

Install the AppIndicator library:
```bash
sudo apt install libappindicator3-1
```

### Deep Links Not Working

- Deep links only register in production builds (not debug)
- On Windows: check registry `HKEY_CURRENT_USER\Software\Classes\vitora`
- On macOS: check `Info.plist` URL schemes
- On Linux: check `~/.local/share/applications/` for `.desktop` file

### Printing Fails

- Linux/macOS: ensure `cups` is installed and the printer is visible in `lpstat -p`
- Windows: verify the printer is listed in `Get-Printer`
- ESC/POS printers must be connected and configured as a system printer

---

## Operations Runbook

### Uninstalling

**Windows:**
```powershell
# Via Control Panel or:
& "C:\Program Files\Vitora HMIS\uninstall.exe"

# Remove user data
Remove-Item -Recurse "$env:APPDATA\digital.vitora.hmis"
```

**Linux:**
```bash
sudo dpkg -r vitora-hmis  # DEB
# or just delete the AppImage

# Remove user data
rm -rf ~/.config/digital.vitora.hmis
rm -rf ~/.local/share/digital.vitora.hmis
```

**macOS:**
```bash
rm -rf /Applications/Vitora\ HMIS.app
rm -rf ~/Library/Application\ Support/digital.vitora.hmis
```

### Viewing Logs

The desktop app logs to stdout (visible in dev mode). In production, Tauri logs to:
- **Windows**: `%APPDATA%\digital.vitora.hmis\logs\`
- **Linux**: `~/.local/share/digital.vitora.hmis/logs/` or systemd journal
- **macOS**: `~/Library/Logs/digital.vitora.hmis/`

### Resetting to Factory State

```bash
# Remove all user data (config, extracted bundle, credentials)
# Linux:
rm -rf ~/.config/digital.vitora.hmis
rm -rf ~/.local/share/digital.vitora.hmis

# Windows (PowerShell):
Remove-Item -Recurse -Force "$env:APPDATA\digital.vitora.hmis"

# macOS:
rm -rf ~/Library/Application\ Support/digital.vitora.hmis
```

The app will behave as a fresh install on next launch.

### Switching Deployment Modes

1. Delete the config file (see above) OR edit `config.json` manually
2. Set `"setup_completed": false` to trigger the setup wizard
3. Restart the app → choose new mode

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Cold start (splash → app ready) | < 5s | Sidecar startup dominates |
| Idle RAM usage | < 200MB | WebView2 + Node.js sidecar |
| Installer size | < 100MB | Node.js binary is the largest component |

---

## Security

### Content Security Policy

The WebView enforces a CSP (in `tauri.conf.json`):
- `connect-src`: localhost, `*.vitora.digital`, `*.azurecontainerapps.io`, `*.powersync.journeyapps.com`
- `script-src`: self + unsafe-inline/eval (required by Next.js)
- `frame-src`: self + `*.vitora.digital`

### Cookie Persistence

WebView2 (Windows) and WebKit (Linux/macOS) store session cookies in their profile directories, surviving app restarts. Cookies are scoped to the API origin.

### Auth Header

All requests include `X-Vitora-Client: desktop/0.1.0` for analytics and access control differentiation.

### Code Signing Status

| Platform | Status | Mechanism |
|----------|--------|-----------|
| Windows | ⚠️ Pending | Azure Trusted Signing (PFX certificate) |
| macOS | ⚠️ Pending | Apple notarization (`xcrun notarytool`) |
| Linux | N/A | No code signing requirement |
| Updater | ✅ Active | Ed25519 signature verification |

---

## Version History

| Tag | Date | Highlights |
|-----|------|-----------|
| `desktop-v0.1.5` | Jun 2026 | Company name correction |
| `desktop-v0.1.4` | May 2026 | Window state persistence, deep links |
| `desktop-v0.1.3` | May 2026 | Auto-update CDN wiring |
| `desktop-v0.1.2` | Apr 2026 | First-run setup wizard |
| `desktop-v0.1.1` | Apr 2026 | System tray, close-to-tray |
| `desktop-v0.1.0` | Mar 2026 | Initial Tauri v2 release |
