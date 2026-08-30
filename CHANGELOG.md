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

### Added
- Placeholder section for upcoming release notes.

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
