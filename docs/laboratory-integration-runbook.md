# Laboratory Integration Runbook (LIS)

Date: 2026-08-02
Scope: Analyzer integration for HL7/ASTM/serial/TCP workflows in Vitora LIS.

## 1) Purpose

This runbook defines:
- How to configure lab instrument integration safely
- How to validate end-to-end analyzer connectivity and message flow
- How to commission per vendor/protocol with a repeatable checklist
- How to operate with RBAC, tenant scoping, and audit expectations

## 2) Integration Architecture

- Instruments are registered in LIS (`/laboratory/settings` -> Instruments).
- Channels define transport/protocol details (host/port/protocol, mapping, direction).
- Inbound messages are parsed and recorded as analyzer message events.
- Parsed results map into specimen/order context and produce analyzer runs/results.

## 3) Configuration Surfaces

- Web settings UI:
  - `/laboratory/settings` (instruments, workflow, barcode, templates)
- Analyzer channel APIs (for advanced setup/automation):
  - `/api/lab/analyzers/channels/`
  - `/api/lab/analyzers/messages/`
  - `/api/lab/analyzers/dashboard/`

## 4) Security and Access Controls

- Require authenticated users with explicit lab integration permissions.
- Read/write operations on integration settings are RBAC-gated.
- Tenant scoping is enforced by facility/org on lab integration models.
- Do not share channel credentials or bridge credentials outside authorized staff.

## 5) Network and Ingress Rules

- Do not expose analyzer ingress ports to all IPs.
- Restrict by analyzer/bridge source IP ranges.
- Prefer private network/VPN between lab network and backend.
- Keep protocol-specific ports documented per facility and approved by security.
- Enable TLS/secure transport where available (for protocol wrappers/gateways).

## 6) Commissioning Checklist (Standard)

Run for each instrument before go-live:

1. Instrument and channel configured with correct protocol and host/port.
2. Facility/tenant mapping verified.
3. Test message received and stored in analyzer message log.
4. Specimen/order resolution validated.
5. Results parsing and units/reference ranges verified.
6. Abnormal/critical values route correctly.
7. Rejection and error paths tested.
8. Audit evidence captured (who, when, what sample/message).
9. Sign-off by LIS lead + biomedical engineer.

## 7) Vendor/Protocol Commissioning Checklists

### 7.1 HL7 v2 over MLLP

- Confirm HL7 version and trigger events used by instrument.
- Validate MSH sender/receiver fields and facility IDs.
- Validate ACK mode (application vs commit ACK expectations).
- Verify patient/sample identifiers map to LIS specimen/order.
- Validate OBX mapping for numeric/text/result flags.
- Test retry/duplicate message handling.

### 7.2 ASTM (LIS2-A2 / E1394)

- Verify framing and checksum handling.
- Validate record sequence and parser mapping.
- Confirm delimiter handling and component extraction.
- Validate host-to-instrument order download (if enabled).
- Test malformed frame behavior and error logging.

### 7.3 Serial Bridge

- Confirm serial parameters (baud, parity, stop bits, flow control).
- Validate bridge health/reconnection behavior.
- Verify bridge-to-backend channel routing and timeout behavior.
- Test disconnection and auto-recovery.

### 7.4 Raw TCP / Gateway Adapter

- Confirm payload framing used by gateway.
- Validate message boundary handling under high throughput.
- Verify keepalive, timeout, and reconnect settings.

### 7.5 FHIR-based Analyzer Integrations (where applicable)

- Validate endpoint auth and token rotation process.
- Verify Observation/DiagnosticReport mapping.
- Ensure code systems (LOINC/etc.) are mapped and validated.
- Test idempotency and duplicate handling for repeated submissions.

## 8) Operational Monitoring

- Daily:
  - channel connection status
  - failed messages and parse errors
  - backlog/pending analyzer runs
- Weekly:
  - message failure trend and top root causes
  - analyzer uptime and reconnect events
- Monthly:
  - sample replay drill and incident response review

## 9) Backup and Recovery Expectations

- Backup both DB records and any attached raw payload artifacts required for traceability.
- Validate restores in staging with representative analyzer messages.
- Keep retention aligned with policy/regulatory requirements.

## 10) Change Control Template

Record each change:
- date/time
- facility
- instrument + channel
- old/new protocol or host/port settings
- reason and approver
- commissioning evidence reference
