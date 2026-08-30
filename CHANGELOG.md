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
