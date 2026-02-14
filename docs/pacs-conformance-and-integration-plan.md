# PACS Conformance Audit & Integration Plan (Advisory)

Date: 2026-02-14
Branch context: `develop`

## Target Setup (Most Valuable Default)

**External PACS = system-of-record for DICOM objects (pixel data + canonical retrieval).**

**Vitora HMIS = workflow layer**:
- indexes studies/series/instances for search + worklists
- links studies to patients/encounters/imaging orders
- provides viewer access via authenticated proxy (so we can audit + enforce RBAC)
- stores reports/annotations (or references) and pushes notifications

This is the recommended default because PACS is purpose-built for storage/conformance/retention, while Vitora is strongest as a clinical workflow + security + audit layer.

---

## Current Implementation (Observed)

### What Vitora does today

**Vitora acts as a PACS-lite.**

- Upload: `POST /api/imaging/studies/upload/` accepts multipart DICOM files and stores them under `MEDIA_ROOT/dicom/{study}/{series}/{sop}.dcm`.
- Index: Vitora persists DICOM metadata in DB models: `DICOMStudy → DICOMSeries → DICOMInstance`.
- Retrieve: `GET /api/imaging/dicom/{sop_instance_uid}/` streams a local file from disk (`FileResponse(open(file_path))`).
- Render: `GET /api/imaging/dicom/{sop_instance_uid}/frame/` renders PNG server-side.
- Audit: Upload/retrieve/delete are audit-logged.

### Evidence (code locations)
- Local filesystem PACS service: `PACSStorageService` in `backend/hmis/apps/imaging/services/pacs.py`
- DICOM models include `DICOMInstance.file_path` (local path) in `backend/hmis/apps/imaging/models.py`
- Upload + retrieve endpoints in `backend/hmis/apps/imaging/views.py`
- Web viewer uses Vitora endpoints (`/api/imaging/dicom/{sop}/`) in `web-app/lib/api/imaging.ts`

### Conclusion vs target
- **Not conforming** to “external PACS is system-of-record”.
- Today, Vitora is both the archive and the workflow layer.

---

## Conformance Checklist (Use for Reviews)

### A. Storage of record
- [ ] DICOM pixel data stored in external PACS (not Vitora filesystem)
- [ ] Vitora DB stores PACS references (UIDs + PACS identifier), not local file paths
- [ ] Retention policies enforced at PACS (or object store) level

### B. Retrieval
- [ ] Viewer retrieval uses PACS DICOMweb (WADO-RS/WADO-URI) or a Vitora proxy that fetches from PACS
- [ ] All image access is authenticated + authorized (RBAC) and **audited**
- [ ] Vitora does not require direct filesystem access to DICOM pixels in production

### C. Ingest
- [ ] Modality / uploader stores via PACS ingest path (e.g., STOW-RS or PACS-native)
- [ ] Vitora indexes studies after PACS ingest (webhook/event or polling)
- [ ] Vitora can reconcile/attach to imaging orders using accession/order numbers

### D. Clinical workflow
- [ ] Study appears in worklist quickly with correct patient/order linkage state
- [ ] Reporting + verification events notify ordering clinician (WebSocket + persisted status)
- [ ] Sensitive patient rules propagate to imaging access (restricted viewing)

### E. Security & audit (Kenya DPA context)
- [ ] Audit logs include: user, action, resource identifiers, timestamp, IP, purpose (where applicable)
- [ ] Minimal data in logs; no pixel data; no excessive PHI in event payloads
- [ ] Access to studies is least-privilege

### F. Operational
- [ ] PACS connectivity is configurable (env vars) and can be swapped per site
- [ ] Fallback mode exists for dev/testing (local PACS-lite) without changing client code

---

## Gaps (What Blocks Conformance)

1) **Vitora stores DICOM pixels locally** (`MEDIA_ROOT/dicom/...`).
2) **Vitora retrieval serves from disk**, not from external PACS.
3) **Upload goes into Vitora**, not STOW-RS / PACS ingest.
4) No explicit **PACS base URL / DICOMweb** configuration layer.

---

## Integration Plan (Concrete, Phased)

This plan keeps existing functionality working while introducing the external-PACS mode behind an abstraction.

### Phase 0 — Add a PACS Backend Abstraction (no behavior change)

Goal: preserve current local filesystem behavior but create a seam for external PACS.

**Backend changes**
- Introduce an interface-like service boundary (Python protocol or base class), e.g.:
  - `PACSBackend.store(...)`
  - `PACSBackend.get_instance_stream(...)` OR `get_wado_url(...)`
  - `PACSBackend.delete_study(...)`
- Make current `PACSStorageService` an implementation (`LocalFilesystemPACSBackend`).
- Add settings:
  - `PACS_MODE=local|external` (default `local` for now)

**Outcome**
- No API changes for clients.
- Internal code chooses a backend based on settings.

### Phase 1 — Add External PACS Config + Proxy Retrieval

Goal: keep Vitora as the **auth+audit gateway** while pixels live in PACS.

**Backend changes**
- Add settings/env vars:
  - `PACS_MODE=external`
  - `PACS_DICOMWEB_BASE_URL=https://...` (Orthanc/dcm4chee)
  - `PACS_AUTH=none|basic|bearer`
  - `PACS_BASIC_USER`, `PACS_BASIC_PASSWORD` (if basic)
  - `PACS_BEARER_TOKEN` (if static bearer; not ideal long-term)
  - (optional) `PACS_TLS_VERIFY=true|false`
- Implement `ExternalDICOMwebPACSBackend`:
  - For `GET /api/imaging/dicom/{sop}/`:
    - Vitora verifies user permission + audit logs the access
    - Vitora fetches from PACS WADO-RS (or PACS WADO-URI) and streams back
- Keep audit event parity (`dicom_retrieve`).

**Outcome**
- Viewer continues using the same URL (`/api/imaging/dicom/{sop}/`) but data comes from PACS.

### Phase 2 — Index-only storage in Vitora (stop relying on local file_path)

Goal: Vitora DB becomes a metadata index + linkage store.

**Backend changes**
- Evolve `DICOMInstance.file_path` usage:
  - keep field temporarily for backwards compatibility
  - introduce new fields (example):
    - `pacs_server` (string key, or FK if multi-PACS)
    - `storage_backend` (`local|external`)
    - (optional) `pacs_object_id` if PACS uses internal IDs
- Retrieval path uses SOP UID + PACS config rather than local file_path.

**Outcome**
- Existing studies can still be served locally (migration period).
- New studies reference PACS as source.

### Phase 3 — Upload via PACS ingest (STOW-RS) + Eventing

Goal: Upload no longer stores pixels in Vitora.

**Backend changes**
- Replace/augment `/api/imaging/studies/upload/`:
  - Option A: Vitora forwards multipart uploads to PACS STOW-RS
  - Option B: Client uploads directly to PACS; Vitora only indexes afterwards
- After ingest, Vitora indexes:
  - either by reading tags from uploaded objects (if available)
  - or by querying PACS for study metadata (preferred)
- Add a mechanism for “study ready”:
  - Webhook from PACS (if supported) → Vitora
  - or polling job (Celery) if webhooks aren’t available

**Outcome**
- “External PACS is system-of-record” is fully achieved.

---

## Minimal API Contract to Keep Stable

To avoid reworking the web viewer repeatedly, keep these stable:
- `GET /api/imaging/studies/` (worklist)
- `GET /api/imaging/studies/{study_uid}/` (detail)
- `GET /api/imaging/studies/{study_uid}/instances/` (instance list)
- `GET /api/imaging/dicom/{sop_uid}/` (viewer fetch; internally local or external)

Upload can evolve (Phase 3) without breaking viewer.

---

## Risks & Guardrails

- **Auth propagation:** external PACS usually has its own auth; proxying through Vitora avoids exposing PACS credentials to browsers.
- **Performance:** proxy streaming is workable for small studies; for large CT/MR you may want direct PACS DICOMweb with short-lived signed URLs/tokens (later).
- **Audit requirements:** proxying ensures every view is logged in Vitora.
- **Offline-first:** if offline viewing is required, keep a deliberate caching strategy (separate from making Vitora the archive).

---

## Recommendation

If you want the highest-value setup with minimal churn:
1) Do Phase 0 + Phase 1 first (proxy retrieval from external PACS).
2) Then gradually migrate uploads to PACS (Phase 3).

This gets you real PACS-of-record benefits early while preserving your current UI and endpoints.
