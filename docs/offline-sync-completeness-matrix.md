# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# Offline Sync Completeness Matrix

This document defines the mandatory offline-sync decision process for Vitora hubs. The machine-readable source of truth is `backend/hmis/apps/core/sync_registry.py`.

Every concrete `OrganizationScopedModel` or `FacilityScopedModel` has exactly one classification:

| Classification | Meaning |
| --- | --- |
| `BOTH` | Hub and cloud can author operational data while offline. |
| `DOWN` | Cloud-master/reference data is materialized to hubs. |
| `UP` | Hub-generated compliance, audit, or event data is delivered to cloud. |
| `EXCLUDED` | Deliberately unavailable for hub sync, with a reason, replacement strategy, and planned phase where applicable. |

`SYNC_REGISTRY` holds the `BOTH`, `DOWN`, and `UP` entries. `SYNC_EXCLUSIONS` holds every explicit `EXCLUDED` entry. `tests/core/test_sync_completeness.py` discovers scoped Django models through the app registry and fails when a model has no decision or is both registered and excluded.

This is intentionally stricter than an ad hoc registry addition: a developer must decide the model's offline authority and dependency closure before its migration can pass CI.

## Delivery Phases

| Phase | Dependency-closed workflow coverage |
| --- | --- |
| P0 | Classification matrix, regression enforcement, local backup and sync-state preservation controls. |
| 1 | Patient, encounter, laboratory, billing, pharmacy, and Document Hub metadata. Document files remain cloud/on-demand until Phase 4. |
| 2 | MCH, inpatient, theatre, blood bank, and procedures. |
| 3 | Inventory, insurance, scheduling, surveillance, and referrals. |
| 4 | Attachments, generic relations, and media/blob synchronization. |

An excluded model is not silently supported. Its `replacement_strategy` describes the temporary safe operating path and its `planned_phase` identifies the dependency-closure release that must replace the exclusion.

Document Hub metadata includes the document identity, status, issuer, signature, share, and source-record references. It does not include `FileField` or blob contents in Phase 1; hubs retrieve those through authenticated cloud access while online and Phase 4 will add encrypted offline media transfer and cache validation.

`immunizations.*` is the authoritative vaccine, immunization record, AEFI, stock, and cold-chain graph. The MCH module remains authoritative for maternal and child-health context such as ANC, delivery, PNC, growth, HEI, and Vitamin A; its legacy `mch.Vaccine`, `mch.ImmunizationRecord`, and `mch.AEFI` tables are migration sources, not sync authorities.

## Backup Baseline

Cloud snapshots protect synchronized central data but are not a backup for unsynced hub state. Each hub must retain:

1. Daily encrypted, WAL-safe SQLite full backups for the configured local retention period.
2. An optional encrypted off-device target, queued for LAN NAS, removable media, or object storage while offline.
3. Cloud database snapshots for centrally synchronized data.
4. The sync queue and sync-watermark state alongside each local backup, so a restored hub does not lose pending outbound work or replay an unsafe pull window.

Restore validation must prove that the SQLite backup, pending `SyncQueue` records, and `.hub_sync_state.json` watermark restore together before the hub reconnects.
