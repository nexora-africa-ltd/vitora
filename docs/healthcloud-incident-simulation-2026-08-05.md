# HealthCloud Incident Simulation Record

Date: 2026-08-05
Type: Tabletop + targeted staging checks
Scope: HealthCloud private-insurance operational readiness
Runbook: `docs/healthcloud-operations-runbook.md`

## Scenario Summary

1. Simulated OAuth credential failure producing repeated token request failures.
2. Simulated upstream instability (5xx burst) affecting claim operations.
3. Simulated remittance polling lag due to worker interruption.

## Timeline and Outcomes

- 10:00 - Trigger condition reviewed against alert definitions in `monitoring/prometheus/rules/healthcloud_alerts.yml`.
- 10:08 - Token outage triage walk-through completed (credentials, auth host, outbound audit checks).
- 10:16 - 5xx spike triage walk-through completed (ratio validation, queue pressure checks, support escalation template).
- 10:24 - Remittance lag playbook walk-through completed (beat schedule, worker health, manual remittance check).
- 10:31 - Rollback drill completed via feature-flag sequence; target path disable confirmed in UI/API expectations.
- 10:38 - Recovery checklist completed; simulation closed.

## Validation Checklist

- [x] Alert-to-runbook mapping exists for token failures, 5xx spike, remittance lag.
- [x] Escalation path defined (Revenue Cycle Engineering + Platform on-call).
- [x] Correlation-ID based investigation steps documented.
- [x] Rollback switch order documented and executable.
- [x] Recovery and post-incident evidence checklist documented.

## Drill Result

Result: PASS

- Runbook was actionable for all simulated failure classes.
- Rollback sequence is clear and can be executed within the target operational window.
- No blocking documentation gaps remained after the drill.

## Follow-ups

1. Tune token-failure threshold after first week of staging telemetry.
2. Add Grafana dashboard panels for HealthCloud alerts and workflow success/failure trend.
