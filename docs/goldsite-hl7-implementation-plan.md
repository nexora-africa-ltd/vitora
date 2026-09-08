<!--
File purpose: Implementation plan for integrating Goldsite analyzer HL7 v2.3.1 over TCP/MLLP with Vitora LIS workflows.
How to use: Follow phases in order; each phase includes deliverables, tests, and rollout gates.
Supported inputs: Goldsite HL7 messages ORU^R01, QRY^Q02, QCK^Q02, DSR^Q03, ACK^Q03 and site-specific analyzer configuration.
-->

# Goldsite HL7 v2.3.1 Implementation Plan

## Current completion status

- Status: Partially complete (engineering implementation complete, UAT pending)
- Last updated: 2026-09-08
- Progress summary:
  - Phase A Foundation: complete
  - Phase B Adapter compatibility: complete
  - Phase C Service workflow: complete
  - Phase D Validation and rollout: in progress

## 1) Scope and target architecture

- Implement Goldsite integration as an application-layer HL7 adapter, not a kernel/device driver.
- Use TCP/IP with MLLP framing: `<0x0B> ... <0x1C><0x0D>`.
- Support Goldsite workflow pairs:
  - `ORU^R01` -> `ACK^R01`
  - `QRY^Q02` -> `QCK^Q02`
  - `DSR^Q03` -> `ACK^Q03`
- Run in existing laboratory analyzer interfacing stack (`InstrumentChannel` + protocol adapters + message processing service).

## 2) Protocol compliance profile (Goldsite)

- HL7 baseline version: `2.3.1`.
- Message delimiters from MSH are `|^~\&`.
- Segment separator is `\r`.
- Goldsite-specific `MSH-16` semantics:
  - `0`: sample test result
  - `1`: calibration result
  - `2`: quality control result
- Required ACK behavior:
  - `AA`: accepted
  - `AE`: error
  - `AR`: rejection
- Goldsite status code mapping in `MSA-6`:
  - `100` segment sequence error
  - `101` required field missing
  - `102` data type error
  - `200` unsupported message type
  - `201` unsupported event code
  - `202` unsupported processing ID
  - `203` unsupported version ID
  - `204` unknown key identifier

## 3) Data mapping strategy

- Sample result mode (`MSH-16=0`):
  - `OBR-2` -> sample/barcode identifier
  - `OBX-3` -> test code
  - `OBX-5` -> analyte name
  - `OBX-6` -> result value
  - `OBX-7` -> unit
  - `OBX-8` -> reference range
  - `OBX-9` -> abnormal flag (`L/H/N`)
  - `OBX-15` -> test timestamp
- Query mode (`QRY^Q02`):
  - `QRD-8` -> patient/sample subject filter (barcode in real-time mode)
- Display response mode (`DSR^Q03`):
  - `DSP-3` -> comma-delimited pending item IDs
  - `ERR-1=0` -> completed/not-found convention

## 4) Implementation phases

### Phase A: Foundation

- Add a dedicated Goldsite analyzer template in seeded templates.
- Configure default HL7 settings:
  - `version=2.3.1`
  - `encoding=ascii`
  - `ack_mode=original`
  - `mllp_framing=true`
- Add default field mapping for Goldsite sample result payloads.

### Phase B: Adapter compatibility

- Extend HL7 adapter parsing to:
  - classify `QRY^Q02` as query messages,
  - extract query barcode from `QRD-8`,
  - classify `DSR^Q03` as result-display responses,
  - parse `DSP-3` item list into parsed payload metadata,
  - capture Goldsite result type from `MSH-16`.
- Extend ACK builder to:
  - echo inbound `MSH-10` control ID,
  - support explicit `AE/AR` + optional Goldsite status code and text.

### Phase C: Service workflow

- Process inbound Goldsite ORU results via existing analyzer message flow.
- Add query-response hooks for host query workflow:
  - receive `QRY^Q02`, generate `QCK^Q02`, then prepare `DSR^Q03` payload.
- Persist raw and parsed message payloads for replay and troubleshooting.

### Phase D: Validation and rollout

- Unit tests:
  - framing/unframing,
  - message typing (`ORU/QRY/DSR/ACK`),
  - query barcode extraction,
  - ACK status code emission.
- Integration tests with a socket simulator using Goldsite sample payloads.
- UAT checklist:
  - real-time result transmission,
  - batch transmission,
  - sample query by barcode,
  - pending/completed sample behavior (`DSP`/`ERR`).

## 5) Delivery checklist

- [x] Goldsite template added to analyzer template seeding.
- [x] HL7 adapter supports Goldsite QRY/DSR semantics.
- [x] ACK builder supports Goldsite `MSA-6` codes and text.
- [x] Parsing/mapping tests added and passing.
- [x] Runbook section added for site configuration and go-live validation.

## Remaining UAT tasks

The items below are required before production sign-off:

1) Device connectivity and handshake validation
- Verify stable TCP/MLLP connectivity between Goldsite analyzer and Vitora in facility network.
- Confirm framing compatibility (`0x0B ... 0x1C 0x0D`) under sustained traffic.

2) Real-time result transmission UAT
- Run patient sample tests and verify `ORU^R01 -> ACK^R01` end-to-end.
- Confirm result mapping correctness (sample ID, test code, result value, units, flags, test time).

3) Batch transmission UAT
- Trigger analyzer batch upload of historical results and verify ingest order, idempotency, and dedup behavior.
- Confirm no data loss when processing multiple samples/items in one run.

4) Query/response workflow UAT
- Validate full `QRY^Q02 -> QCK^Q02 -> DSR^Q03 -> ACK^Q03` flow against the live instrument.
- Confirm pending-item responses use `DSP` and completed/not-found cases use `ERR|0` as expected.

5) Error and rejection handling UAT
- Inject malformed/unsupported payloads and verify `AE/AR` behavior and `MSA-6` status mapping.
- Confirm failed/rejected/timeout messages are visible in analyzer message logs and can be replayed safely.

6) Operational readiness
- Confirm Celery beat/worker processing for outbound dispatch in staging/production.
- Capture go-live evidence (message logs, ACK traces, sample reconciliation report) and obtain sign-off from LIS lead + biomedical engineer.
