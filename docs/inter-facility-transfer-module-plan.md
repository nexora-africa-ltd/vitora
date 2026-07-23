# Inter-Facility Transfer Module Plan (Refine Existing Discharge Flow)

## Why refine instead of replace

Current transfer-out already exists through `Discharge(discharge_type="TRANSFERRED")`.
That path already carries critical side effects (bed turnover, admission status updates,
encounter closure, billing/reporting hooks). Replacing it would duplicate clinical logic.

The recommended architecture is layered:

- `InterFacilityTransfer` = operational workflow envelope
- `Discharge(discharge_type="TRANSFERRED")` = final clinical/legal transfer-out event

This keeps one source of truth for discharge while adding missing lifecycle states.

## Target workflow

1. Create transfer request (`DRAFT`)
2. Submit to destination (`PENDING_ACCEPTANCE`)
3. Destination accepts/rejects (`ACCEPTED`/`REJECTED`)
4. Source dispatches patient (`IN_TRANSIT`)
5. Destination records arrival (`ARRIVED`)
6. Cancellation allowed from non-terminal states (`CANCELLED`)

Discharge linkage:

- Transfer can exist before discharge.
- Final transfer-out discharge (`TRANSFERRED`) links into transfer record.
- Clinical closure remains in existing discharge model.

## Phase roadmap

### Phase 1 (kickoff in this change)

- Add `InterFacilityTransfer` model + migration.
- Add CRUD API endpoints.
- Add validation and uniqueness guard for one open transfer per admission.
- Keep discharge logic intact and linked via optional `source_discharge`.

### Phase 2 (kickoff implemented)

- Added state transition actions:
  - `POST /inter-facility-transfers/{id}/submit/`
  - `POST /inter-facility-transfers/{id}/accept/`
  - `POST /inter-facility-transfers/{id}/reject/`
  - `POST /inter-facility-transfers/{id}/dispatch/`
  - `POST /inter-facility-transfers/{id}/arrive/`
  - `POST /inter-facility-transfers/{id}/cancel/`
- Added transition guards in model (`can_transition_to` + `transition_to`).
- Added audit events for each transition action.
- Direct status edits are blocked; transitions must use workflow actions.
- Role-specific permission split is still pending hardening (next increment).

### Phase 3

- Add destination handoff UX queue and timeline.
- Add optional destination auto-admit/autocreate encounter.

### Phase 4

- Add cross-facility notifications/events.
- Add transfer packet attachments and acknowledgement workflow.

## Draft schema (Phase 1)

```python
class InterFacilityTransfer(TimeStampedModel):
    public_id: UUID
    transfer_number: str  # IFT-YYYYMMDD-XXXX

    source_admission: FK[Admission]
    source_discharge: OneToOne[Discharge] | None  # optional until finalized
    patient: FK[Patient]

    source_facility: FK[Facility]
    destination_facility: FK[Facility] | None
    destination_facility_name: str  # fallback for out-of-registry facilities

    status: Enum[DRAFT, PENDING_ACCEPTANCE, ACCEPTED, REJECTED, IN_TRANSIT, ARRIVED, CANCELLED]
    priority: Enum[ROUTINE, URGENT, STAT]
    reason_code: Enum[HIGHER_LEVEL_CARE, SPECIALIST_INPUT, NO_CAPACITY, EQUIPMENT_LIMITATION, PATIENT_REQUEST, OTHER]

    reason_details: str
    clinical_summary: str
    handover_notes: str

    transport_mode: Enum[AMBULANCE, PRIVATE, OTHER]
    escort_required: bool
    escort_name: str

    requested_by: FK[User]
    accepted_by/dispatched_by/arrived_by/cancelled_by: FK[User] | None
    accepted_at/dispatched_at/arrived_at/cancelled_at: datetime | None
    rejection_reason/cancellation_reason: str
```

### Key constraints

- One open transfer per admission for statuses:
  - `DRAFT`, `PENDING_ACCEPTANCE`, `ACCEPTED`, `IN_TRANSIT`
- Destination must be provided (`destination_facility` or `destination_facility_name`).
- If linked discharge exists, it must belong to same admission and be `TRANSFERRED`.

## Draft API contract

Phase 1 CRUD:

- `POST /api/inpatient/inter-facility-transfers/`
- `GET /api/inpatient/inter-facility-transfers/`
- `GET /api/inpatient/inter-facility-transfers/{id}/`
- `PATCH /api/inpatient/inter-facility-transfers/{id}/`

Example create payload:

```json
{
  "source_admission": 123,
  "destination_facility": 44,
  "reason_code": "HIGHER_LEVEL_CARE",
  "reason_details": "Requires ICU support",
  "priority": "URGENT",
  "clinical_summary": "Sepsis with escalating oxygen demand",
  "handover_notes": "2L crystalloid given; broad spectrum antibiotics started",
  "transport_mode": "AMBULANCE",
  "escort_required": true,
  "escort_name": "Nurse Kamau"
}
```

Future Phase 2 actions:

- `POST /{id}/submit/`
- `POST /{id}/accept/`
- `POST /{id}/reject/`
- `POST /{id}/dispatch/`
- `POST /{id}/arrive/`
- `POST /{id}/cancel/`

## Compatibility with existing discharge

This module does not replace `Discharge`.

- Existing discharge flow remains valid.
- Transfer module records operational lifecycle.
- Final transfer-out event still uses `Discharge(discharge_type="TRANSFERRED")`.
