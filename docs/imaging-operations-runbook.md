# Imaging Operations Runbook (DICOM)

Date: 2026-08-02
Scope: X-ray, Ultrasound, CT, MRI, and other DICOM-capable modalities integrating with Vitora HMIS.

## 1) Purpose

This runbook describes how to:

- Set up imaging equipment for DICOM push into Vitora
- Configure facility-level imaging integration settings in UI
- Run and operate the DICOM C-STORE listener
- Validate end-to-end image ingestion and viewing
- Troubleshoot common production issues

## 2) Architecture at a Glance

- Modalities (X-ray/US/CT/MRI) push DICOM instances to Vitora over DICOM C-STORE.
- Vitora listener receives files and stores them under local PACS-lite storage:
  - `MEDIA_ROOT/dicom/{study_uid}/{series_uid}/{sop_uid}.dcm`
- Metadata is indexed in DB tables:
  - `DICOMStudy`, `DICOMSeries`, `DICOMInstance`
- Viewer retrieves DICOM files through API endpoints and renders images for web UI.

## 3) Preconditions

- Facility has imaging module enabled.
- Device can send DICOM C-STORE to external destination.
- Network path is open from modality VLAN/LAN to Vitora host on listener port (default `11112/TCP`).
- Patient matching is available through DICOM `PatientID` to Vitora `mrn` or `national_id`.

## 4) UI Configuration (Facility Team)

Use the new settings UI:

- Path: `/imaging/settings`
- Fields:
  - `Enable inbound C-STORE listener`
  - `AE Title` (max 16 chars, uppercase A-Z0-9_-)
  - `Bind Host` (usually `0.0.0.0`)
  - `Port` (default `11112`)
  - `Allowed Calling AEs` (comma-separated AE titles)
  - `Notes`

Equipment registry UI:

- List: `/imaging/equipment`
- Add: `/imaging/equipment/new`
- Capture AE title, station name, manufacturer, model, serial, room, calibration details.

Important: listener runtime currently reads environment/app settings. Keep runtime values aligned with `/imaging/settings`.

## 5) Runtime Listener Configuration (Ops)

Set backend environment variables:

- `DICOM_SCP_AE_TITLE` (default `VITORA`)
- `DICOM_SCP_PORT` (default `11112`)
- `DICOM_SCP_BIND_HOST` (default `0.0.0.0`)
- `DICOM_SCP_ALLOWED_PEERS` (comma-separated list, empty = allow all)

Start listener:

```bash
python manage.py dicom_scp_listener
```

Optional overrides:

```bash
python manage.py dicom_scp_listener --ae-title VITORA --port 11112 --bind 0.0.0.0
```

## 6) Modality Console Setup (Vendor/Field Engineer)

For each modality destination entry:

- Called AE Title: value from runbook/UI (for example `VITORA`)
- Remote host/IP: Vitora backend host (or facility hub host)
- Remote port: listener port (for example `11112`)
- Calling AE Title: unique per machine (for allow-listing and traceability)

Host format note:

- Use a hostname or IP only (for example `api.vitora.digital` or `10.20.1.15`).
- Do not include URL scheme (`https://`) in DICOM destination settings.
- DICOM C-STORE here is raw DICOM over TCP on the configured port (for example `11112`).
- If using a public DNS name, ensure it resolves and routes TCP `11112` to the listener host.

Recommended naming:

- `XR_ROOM1`, `US_ROOM2`, `CT_MAIN`, `MRI_1`

Record each machine in equipment registry with matching AE title/station/serial.

## 6.1) PACS Router Setup (if used)

If a PACS router/gateway (for example Orthanc, dcm4chee route, vendor gateway) sits between modalities and Vitora:

- Configure upstream modality -> router as normal.
- Configure router -> Vitora destination:
  - Called AE Title: Vitora AE (for example `VITORA`)
  - Host/IP: Vitora listener host
  - Port: Vitora listener port (for example `11112`)
  - Calling AE Title: router AE title (add this to allow-list if used)
- If allow-listing is enabled in Vitora, include router calling AE in `Allowed Calling AEs`.
- Validate one end-to-end send from modality via router and confirm study appears in `/imaging/studies`.

## 7) Firewall and Network Checklist

- Permit modality subnet -> Vitora host `TCP/<listener_port>`.
- Ensure no NAT/security device rewrites or blocks DICOM association traffic.
- Validate DNS/hostname or use static IP in device config.
- If segmented network, confirm routing from modality VLAN to app subnet.

### 7.1) Azure Container Apps Ingress Rules

- Do not expose DICOM listener port (`11112` or custom) to `0.0.0.0/0`.
- Restrict ingress source to known modality/PACS router public IPs, or use private networking only.
- Prefer private connectivity (site-to-site VPN / ExpressRoute / private endpoint patterns) for healthcare traffic.
- Keep app-level allow-list (`DICOM_SCP_ALLOWED_PEERS`) enabled even when network filtering is in place.
- If using a reverse proxy/LB in front of ACA, ensure raw TCP forwarding for DICOM listener port is preserved.

## 8) End-to-End Validation (Commissioning)

1. In `/imaging/settings`, confirm listener profile.
2. Start listener process.
3. Send one known test study from modality.
4. Verify in Vitora:
   - Study appears in `/imaging/studies`
   - Images open in study viewer
   - Study fields include expected modality/accession
   - Equipment is auto-resolved or appears as expected
5. Confirm audit visibility (upload/retrieve actions).

## 9) Operational Guardrails

- Use `Allowed Calling AEs` in production to block unknown senders.
- Keep patient identifiers consistent (DICOM `PatientID` mapped to HMIS MRN/national ID).
- Monitor disk capacity under `MEDIA_ROOT/dicom`.
- Backup strategy must include both DB and DICOM filesystem storage.

## 9.1) Backup and Retention Policy (Minimum Standard)

Both components are required for full recovery:

- Database backup (PostgreSQL):
  - Contains patient/order/study/series/instance metadata and file pointers.
  - Required tables include `imaging_dicomstudy`, `imaging_dicomseries`, `imaging_dicominstance`.
- Filesystem backup (`MEDIA_ROOT/dicom/`):
  - Contains the actual DICOM objects (`.dcm` pixel data).

Recommended backup schedule:

- DB: nightly full backup + point-in-time/WAL if available.
- Filesystem: nightly incremental + weekly full snapshot.
- Keep DB and filesystem backups from matching windows (same date stamp) to avoid pointer drift.

Minimum retention:

- Daily backups: 30 days
- Weekly backups: 12 weeks
- Monthly backups: 12 months

Recovery validation (monthly):

1. Restore DB backup to staging.
2. Restore matching `MEDIA_ROOT/dicom/` snapshot.
3. Open `/imaging/studies` and verify sample studies render.
4. Confirm `DICOMInstance.file_path` resolves to existing files.

Purge policy:

- Do not delete only DB rows or only DICOM files.
- Any retention purge must be coordinated so metadata and files are removed together.
- Record purge batch, date range, and approver in facility change log.

## 9.2) Security Controls Summary (Compliance)

Current backend controls for DICOM access paths:

- Authentication required for all DICOM retrieve/render endpoints.
- Explicit read permission required for raw image access:
  - `imaging.view_dicominstance` or `imaging.view_dicomstudy`
- Tenant scoping enforcement on `instance -> series -> study -> patient`:
  - org/facility context must match request tenant
  - deny-by-default if tenant context is missing
- Audit logging:
  - success: `dicom_retrieve`
  - denied: `dicom_retrieve_denied`, `dicom_frame_denied`
- Listener ingress hardening:
  - source IP restriction and AE allow-list (`DICOM_SCP_ALLOWED_PEERS`)
  - no open Internet exposure for DICOM listener port

## 10) Troubleshooting

### A. Study not appearing

- Check listener process is running.
- Check port and firewall (`11112/TCP` by default).
- Confirm modality destination AE/host/port values.
- Confirm patient match exists (PatientID -> MRN/national ID).

### B. Association rejected

- Verify calling AE is in `DICOM_SCP_ALLOWED_PEERS` if allow-list enabled.
- Confirm called AE title matches listener AE.

### C. File received but viewer fails

- Confirm file exists on disk under `MEDIA_ROOT/dicom/...`.
- Verify `DICOMInstance.file_path` points to existing file.
- Check permissions for media directory.

### D. Equipment not linked

- Verify DICOM tags contain AE/station/manufacturer/model/serial.
- Confirm equipment record values match incoming metadata.

## 11) Routine Tasks

- Weekly:
  - Review unknown calling AEs and update allow-list.
  - Verify free storage and growth trend.
- Monthly:
  - Reconfirm modality destination configs against runbook.
  - Review equipment calibration dates in `/imaging/equipment`.

## 12) Known Current Limitations

- Full Modality Worklist (MWL/C-FIND/C-MOVE orchestration) is not yet implemented.
- Current flow is C-STORE push and/or web DICOM upload.

## 13) Change Log Template

For each facility change, record:

- Date/time
- Facility/site
- Machine name + calling AE
- Old/new AE/host/port
- Engineer and approver
- Validation result
