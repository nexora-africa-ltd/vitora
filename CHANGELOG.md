<!--
What this file is for:
- Track user-facing release changes for Hub and Desktop from this point forward.

How to use it:
- Add a new dated release section for each published version before tagging.

Supported args/inputs:
- None. This is documentation only.
-->

# Vitora HMIS Changelog

All notable changes to Vitora HMIS releases are documented in this file.

## [Unreleased]

## [Hub 1.0.33] - 2026-10-08

### Hub

- Scope scheduled IDSR generation, report identity, API visibility, DHIS2 submission, ADX export, and Django admin review to the authoritative facility and organization fields.
- Add Azure Key Vault-backed SQLCipher key escrow enrollment/recovery integration to Linux and Windows hub installers and updaters, plus a manual staging recovery drill workflow.
- Add the hub capability registry and block cloud-only or unavailable workflow APIs locally, including surveillance, reporting, analytics, and incomplete workflow modules.
- Add DHA-facing recovery, backup, disease reporting, IDSR, access-control, vulnerability assessment, and penetration-testing evidence documents.

## [Desktop 1.0.27] - 2026-10-08

### Desktop

- Apply the shared hub capability registry to desktop hub navigation and direct-route guards, hiding cloud-only and unavailable modules in LAN hub/client modes.
- Keep cloud-authoritative surveillance, IDSR, DHIS2/KHIS, county notification, IHR, and contact-tracing workflows out of local hub navigation.

## [Hub 1.0.25] - 2026-10-03

### Hub

- Move hub runtime secrets to protected Windows DPAPI and Linux systemd credential stores, including shared DHA ILM credentials delivered through the device-encrypted activation envelope.
- Expand cloud-to-hub sync coverage for Document Hub records and their P0 clinical, laboratory, billing, inventory, immunization, inpatient, MCH, blood bank, and theatre dependencies.

## [Desktop 1.0.25] - 2026-10-03

### Desktop

- Align the desktop release with the expanded hub sync coverage for offline Document Hub workflows.

## [Desktop 1.0.24] - 2026-10-03

### Desktop

- Health-check the configured facility hub before attempting LAN discovery, so healthy cached hubs do not broadcast on every launch.
- Add frameless desktop window controls to login and organization onboarding routes.

## [Desktop 1.0.23] - 2026-10-03

### Desktop

- Apply the repository Rust formatting baseline to desktop configuration, updater, and printer command source files.

## [Desktop 1.0.22] - 2026-10-03

### Desktop

- Grant the packaged Tauri webview permission to invoke native `discover_hubs`, completing the LAN discovery release path.
- Regenerate Tauri capability schemas for the discovery command.

## [Hub 1.0.24] - 2026-10-03

### Hub

- Start the UDP LAN discovery responder with the hub ASGI lifecycle and stop it cleanly on Daphne shutdown.
- Expose discovery health through `/api/hub/health/`, including a non-fatal degraded state when UDP port `19088` is unavailable.
- Open UDP `19088` during Windows and Linux installs and updates, and publish it in Linux container deployments.
- Keep TCP `9088` for all hub API, authentication, sync, and WebSocket traffic; UDP is used only to discover a candidate hub address.

## [Desktop 1.0.21] - 2026-10-03

### Desktop

- Add native Tauri UDP broadcast discovery for facility hubs and verify discovered candidates through `/api/hub/health/` before use.
- Use native discovery during first workstation setup and automatically recover a stale saved hub URL before login, with verified HTTP subnet scanning as a fallback for older hubs.
- Bump desktop app version metadata to `1.0.21` across package, Tauri, and Cargo manifests and lockfiles.

## [Hub 1.0.23] - 2026-10-02

### Hub

- Add protocol-v2 hub re-enrollment with device-encrypted activation secrets and organization-scoped PII key packages.
- Move fresh Linux and Windows hub secret handling away from plaintext `.env` key storage; Windows uses DPAPI-protected secret bundles.
- Add organization-scoped v2 PII encryption, blind-index lookup, and a resumable all-model re-encryption command.
- Add Azure Key Vault environment separation and dedicated private media-storage configuration for cloud/hub interoperability.

## [Hub 1.0.22] - 2026-09-30

### Hub

- Stop the dedicated hub sync service before applying database migrations during updates, then restart it after the API service starts. This prevents SQLite migration locks from the continuous sync watcher.

## [Desktop 1.0.20] - 2026-09-30

### Desktop

- Accept subscription-filtered hub facility payloads by treating omitted module capabilities as disabled, preventing valid hub facility responses from failing client-side schema validation.
- Add regression coverage for the filtered facility response contract used by desktop sidecars.

## [Hub 1.0.21] - 2026-09-30

### Hub

- Report the installed hub/cloud runtime version in both health endpoints instead of stale source constants.
- Preserve cloud-authoritative `is_staff` during hub cloud-auth login and resolve facility reads through the directly assigned facility when the profile organization cache is stale.
- Persist RBAC reconciliation health across one-shot sync processes so hub health reflects completed reconciliation.
- Install a dedicated singleton hub sync service on Windows and Linux. The service runs `hub_sync --watch` without requiring Redis, Celery workers, or Celery Beat.

## [Desktop 1.0.18] - 2026-09-29

### Desktop

- Force frameless Tauri window decorations at native startup, keep workspace tabs sticky, and render the real Vitora logo in the title bar.
- Explicitly use the multi-resolution ICO for Windows NSIS installer and shortcut packaging.

## [Desktop 1.0.17] - 2026-09-29

### Desktop

- Changed workspace navigation so ordinary routing reuses the current tab, while modifier/middle-click and sidebar context-menu actions explicitly open destinations in new tabs.

## [Desktop 1.0.16] - 2026-09-29

### Desktop

- Fixed desktop window-control ACLs, preventing title-bar minimize, maximize, and close commands from being rejected.
- Kept the frameless workspace title bar above the expanded sidebar instead of allowing the sidebar to cover tabs.
- Regenerated the Windows ICO with 16px through 256px assets so Start Menu and taskbar shortcuts receive a proper application icon.

## [Desktop 1.0.15] - 2026-09-29

### Desktop

- Moved desktop workspace tabs into custom Tauri window chrome, with native drag, minimize, maximize, and close controls.
- Removed the dashboard-level workspace tab strip; browser and web deployments retain their normal native browser chrome.

## [Desktop 1.0.14] - 2026-09-28

### Desktop

- Added desktop-only clinician encounter workspace tabs inside the web shell so multiple encounters can stay open and switchable in one window.
- Added route-aware tab session tracking (`lastRoute` per encounter), close/close-others/close-all actions, and unsaved draft indicators sourced from encounter edit session state.
- Added focused regression tests for workspace tab interactions, including switch-route navigation, close-active fallback navigation, and close-all routing to `/encounters`.
- Bumped desktop app version metadata to `1.0.14` across `desktop-app/package.json`, `desktop-app/src-tauri/Cargo.toml`, `desktop-app/src-tauri/tauri.conf.json`, `desktop-app/package-lock.json`, and `desktop-app/src-tauri/Cargo.lock`.

## [Desktop 1.0.12] - 2026-09-15

### Desktop

- Added a desktop-only Application Updates card in Settings with manual availability checks, release notes, an explicit Install and Restart confirmation, and a Later deferral action.
- Added native update availability checks after packaged sidecar/UI startup and every 24 hours. Available updates notify users but never install without confirmation.
- Kept the tray menu update check as a second explicit install path.
- Bumped desktop app version metadata to `1.0.12` across `desktop-app/package.json`, `desktop-app/src-tauri/Cargo.toml`, `desktop-app/src-tauri/tauri.conf.json`, `desktop-app/package-lock.json`, and `desktop-app/src-tauri/Cargo.lock`.

## [1.0.19] - 2026-09-15

### Hub

- Removed unused and misleading `cloc`, `pycloc`, `pydotenv`, and `crypto` Python dependencies from hub deployments.
- Exported hash-locked Python requirements and enforce `--require-hashes` in Linux and Windows hub install/update paths.

## [Desktop 1.0.11] - 2026-09-15

### Desktop

- Verify SHA-256 checksums for downloaded Node.js sidecar artifacts before extraction and reject unexpected redirects.
- Bumped desktop app version metadata to `1.0.11` across `desktop-app/package.json`, `desktop-app/src-tauri/Cargo.toml`, `desktop-app/src-tauri/tauri.conf.json`, `desktop-app/package-lock.json`, and `desktop-app/src-tauri/Cargo.lock`.

## [1.0.17] - 2026-09-03

### Hub

- Fixed push subscription VAPID key endpoint behavior to return `200` with `configured=false` when push is not configured, preventing repeated 503 health noise while still exposing actionable UI status.
- Fixed scheduling on-duty endpoint access so admin role codes (`ADMIN`, `ORG-ADMIN`, `OWNER`) can view `/api/scheduling/shifts/on-duty/` even without direct `scheduling.manage_schedules` assignment.
- Fixed AI chat role gating mismatch by allowing `ORG-ADMIN`/`OWNER` in backend chat/status role checks, aligning API behavior with frontend permissions.
- Added regression coverage for VAPID response contract, on-duty ORG-ADMIN access, and ORG-ADMIN AI chat/status role handling.

## [Desktop 1.0.10] - 2026-09-03

### Desktop

- Updated push subscription client handling for the new VAPID endpoint contract (`configured`, `message`, optional `vapid_public_key`) so desktop/web UI reports disabled push configuration clearly instead of surfacing generic service errors.
- Bumped desktop app version metadata to `1.0.10` across `desktop-app/package.json`, `desktop-app/src-tauri/Cargo.toml`, `desktop-app/src-tauri/tauri.conf.json`, `desktop-app/package-lock.json`, and `desktop-app/src-tauri/Cargo.lock`.

## [1.0.15] - 2026-09-03

### Hub

- Improved manual desktop license check-in failure UX by surfacing cloud API error messages and error `code` values in the settings toast so operators can diagnose rejected check-ins without opening server logs.

## [1.0.14] - 2026-09-03

### Hub

- Added hub-side proxy behavior for `POST /api/licensing/check-in/` so manual desktop check-in can relay to cloud licensing in hub runtime.
- Added hub check-in telemetry enrichment and response surfacing for `app_version`, `os_info`, `hostname`, `hardware_fingerprint`, and `binary_manifest_id`.
- Added auto-seeding of `ReleaseManifest` from first check-in payload (`version` + `binary_hashes`) when a manifest does not yet exist.
- Updated hub install/migration env wiring to persist `CLOUD_API_BASE_URL` alongside `SYNC_SERVER_URL` and `LICENSE_TOKEN`.

## [Desktop 1.0.9] - 2026-09-03

### Desktop

- Surfaced manual license check-in telemetry fields in Desktop Settings (app version, OS info, hostname, hardware fingerprint, binary manifest ID).
- Bumped desktop app version metadata to `1.0.9` across `desktop-app/package.json`, `desktop-app/src-tauri/Cargo.toml`, `desktop-app/src-tauri/tauri.conf.json`, and lockfiles.

## [1.0.6] - 2026-09-01

### Desktop

- Fixed desktop API error handling so LAN workstation mode (`deployment_mode=lan_client`) no longer redirects to `/activate` when hub license guard codes are returned.
- Bumped desktop app version metadata to `1.0.6` across `package.json`, `Cargo.toml`, and `tauri.conf.json`, and refreshed lockfiles.

## [1.0.9] - 2026-09-01

### Hub

- Improved interactive cloud URL capture in the Windows hub installer: removed hardcoded API label, added explicit "Using Cloud URL" confirmation, and re-prompt loops for empty/invalid URLs.
- Prevented cloud URL/EULA prompt ambiguity in interactive mode by validating and confirming cloud URL before continuing to EULA prompts.

## [1.0.8] - 2026-09-01

### Hub

- Hardened Windows hub activation input handling by trimming activation code, cloud URL, and EULA version before API calls.
- Improved installer activation diagnostics to print backend error response bodies for `/api/licensing/activate/` failures.

## [1.0.7] - 2026-09-01

### Hub

- Added a manual sync example to the generated Windows `hub-shell.ps1` help text so operators can run `hub_sync --retry-failed` directly from the built-in wrapper.
- Tagged Hub release `hub-v1.0.7`.

## [1.0.5] - 2026-09-01

### Desktop

- Added a manual "Check In Now" action in Desktop Settings so operators can force a license check-in on demand without waiting for the background interval.
- Added explicit Tauri ACL capability permissions for desktop invoke commands (including `set_api_url`) to fix setup save failures in packaged builds.
- Bumped desktop app version metadata to `1.0.5` across `package.json`, `Cargo.toml`, and `tauri.conf.json`, and refreshed `package-lock.json`.

## [1.0.4] - 2026-09-01

### Desktop

- Bumped desktop app version metadata to `1.0.4` across `package.json`, `Cargo.toml`, and `tauri.conf.json` so installers and updater artifacts carry the correct release version.
- Updated lockfiles to keep desktop package metadata aligned with the new version.

### Backend

- Hardened sync materialization error handling to catch Django validation/integrity failures and return structured `success=false` responses instead of aborting pull processing.
- Added guarded fallback for nullable `billing.Invoice.encounter` to null unresolved missing parent references only when strict natural-key hints indicate the encounter is absent.
- Added regression tests for invoice FK materialization failures and hub pull deferral/logging behavior.

## [1.0.3] - 2026-08-30

### Desktop

- Added explicit Tauri ACL permissions for desktop app invoke commands (including `set_api_url`, `set_deployment_mode`, and `save_hub_config`) to unblock setup save flow in packaged builds.
- Updated generated Tauri schema/capability manifests to reflect new desktop command permissions.

## [1.0.2] - 2026-08-30

### Desktop

- Fixed desktop setup save failures in LAN client mode by coercing discovered facility/organization identifiers to strings before calling native config commands.
- Improved setup error surfacing to show actionable native error details instead of a generic save failure message.

## [1.0.1] - 2026-08-30

### Desktop

- Reworked desktop setup LAN defaults to avoid hard-coded `192.168.1.100` prefill and preserve manual overrides.
- Improved setup save flow with URL normalization, explicit validation, and visible error reporting when save fails.
- Upgraded hub discovery to be port-aware (entered port first, then `9099`/`9088`), expanded mDNS attempts, and added `/24` subnet fallback scans from entered IPv4 hosts.
- Hid the facility banner on desktop setup and hub setup routes to remove persistent setup-page noise.

### Hub

- Added durable pre-start port ownership checks in Windows updater to prevent Daphne bind failures on stale listeners.
- Updater now terminates stale hub-owned listeners safely, refuses to kill non-hub processes, and surfaces clear diagnostics.
- Hardened service start error handling so updater rollback executes cleanly on start failures.

## [0.1.6] - 2026-08-30

### Hub

- Fixed Windows startup/secret-rotation JSON parsing to safely handle bundles without `ciphertext_b64` (including plaintext fallback bundles).
- Prevented strict-mode startup crashes when `hub-secrets.dpapi.json` contains only a `secrets` map.

## [0.1.5] - 2026-08-30

### Hub

- Updated hub CI packaging to always include `scripts/start-hub-windows.ps1` in both Linux and Windows artifacts.
- Updated hub CI publish step to upload `start-hub-windows.ps1` to both root and `/releases/` CDN paths.
- Stabilized Windows hub Cython builds by running Cython translation in single-thread mode to avoid intermittent `Bad file descriptor` worker crashes on GitHub runners.

## [0.1.4] - 2026-08-30

### Hub

- Fixed Windows updater to continue when `scripts/start-hub-windows.ps1` is missing in an artifact by reusing the existing `C:\VitoraHub\start-hub.ps1` launcher.
- Added explicit logging for launcher-template fallback behavior.

## [0.1.3] - 2026-08-30

### Hub

- Updated Windows installer/updater/secret-rotation scripts to fall back to plaintext secret bundles when DPAPI types are unavailable, preventing update/install failures on affected hosts.
- Added explicit warnings when plaintext fallback is used so operators can harden host/runtime configuration later.

## [0.1.2] - 2026-08-30

### Hub

- Fixed Windows DPAPI type initialization in hub scripts so secret bundle protect/unprotect works reliably across PowerShell runtimes.
- Added explicit DPAPI availability errors with actionable guidance when running in unsupported environments.

## [0.1.1] - 2026-08-30

### Hub

- Added dual CDN path fallback support in installers/updaters (`/hub/...` and `/releases/hub/...`).
- Improved Windows updater resilience by treating `pip` stderr warnings as non-fatal when exit code is zero.
- Added weekly Windows auto-update scheduled task registration (`VitoraHubWeeklyUpdate`) with default maintenance window Sunday 2:00 AM.
- Persisted `HUB_AUTO_UPDATE_DAY` and `HUB_AUTO_UPDATE_TIME` in generated Windows hub `.env`.

### Desktop

- Made standalone bundle legacy API host guard configurable via `DESKTOP_BLOCKED_API_HOSTS` instead of hard-coded blocking.

### Operations

- Updated release storage references to `vitorareleasessa` in desktop docs.
