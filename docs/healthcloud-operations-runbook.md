# HealthCloud Insurance Operations Runbook

Date: 2026-08-05
Owner: Revenue Cycle Engineering
On-call: Platform + Billing Integrations

## 1) Purpose

This runbook covers HealthCloud private-insurance incidents for:
- OAuth token acquisition failures
- Upstream 5xx error spikes
- Remittance polling lag
- Emergency rollback to legacy private-insurance path

## 2) Key Signals and Alerts

Prometheus rule file: `monitoring/prometheus/rules/healthcloud_alerts.yml`

- `HealthCloudTokenAcquisitionFailures`
  - Trigger: `vitora_insurance_healthcloud_token_requests_total{result="failed"}`
- `HealthCloudUpstream5xxSpike`
  - Trigger: `vitora_insurance_upstream_responses_total{status_family="5xx"}` ratio > 20%
- `HealthCloudRemittanceLag`
  - Trigger: no successful `healthcloud.get_claim_remittance` operations after recent submissions

## 3) Triage Checklist (First 15 minutes)

1. Confirm alert scope (facility, payer, and start time).
2. Check insurance workers and beat scheduler are healthy.
3. Inspect recent `InsuranceOutboundCall` rows for 401/429/5xx patterns.
4. Verify HealthCloud flags are in expected state:
   - `insurance_healthcloud_enabled`
   - `insurance_healthcloud_visit_auth_required`
   - `insurance_healthcloud_credit_note_enabled`
5. Identify blast radius:
   - new claims blocked?
   - submissions delayed?
   - remittance reconciliation stale?

## 4) Token Outage Playbook

Use when `HealthCloudTokenAcquisitionFailures` is firing.

1. Validate provider credentials in `InsuranceProviderConfig` for affected facility.
2. Verify auth endpoint reachability (`auth_base_url`) from backend runtime.
3. Check outbound call audit for `/oauth2/token/` failures and correlation IDs.
4. If credentials rotated, apply corrected credentials and trigger retry by submitting a test OTP request.
5. If upstream auth is down and outage exceeds 15 minutes, move to rollback steps in Section 7.

Exit criteria:
- token failures return to baseline for 10+ minutes
- one successful OTP request and one successful visit start recorded

## 5) Upstream 5xx Spike Playbook

Use when `HealthCloudUpstream5xxSpike` is firing.

1. Confirm 5xx ratio and absolute count in Prometheus.
2. Check if 5xx is isolated to one host (`auth` vs `provider_*`) and one operation.
3. Validate retries are occurring and not saturating queue backlog.
4. Temporarily slow submission load if queue pressure increases.
5. Coordinate with HealthCloud support using representative correlation IDs.

Exit criteria:
- 5xx ratio below threshold for 15+ minutes
- claim submit and remittance checks succeed without manual retries

## 6) Remittance Lag Playbook

Use when `HealthCloudRemittanceLag` is firing.

1. Confirm beat jobs are scheduled:
   - `poll_claim_remittance_statuses`
   - `sweep_healthcloud_authorizations_and_reservations`
2. Check Celery worker and beat logs for failed insurance tasks.
3. Manually run a remittance check for one claim from API/UI.
4. Verify `InsuranceExternalSync` entries for `healthcloud.get_claim_remittance` success/failure transitions.
5. If backlog is large, scale workers and process oldest pending claims first.

Exit criteria:
- successful remittance polling resumes
- no critical pending remittance records older than agreed SLA

## 7) Rollback Switch Steps (Emergency)

Goal: disable HealthCloud flow safely in under 30 minutes.

1. Disable HealthCloud at runtime:
   - turn off `insurance_healthcloud_enabled`
2. If needed, relax visit gating before full disable:
   - turn off `insurance_healthcloud_visit_auth_required`
3. Disable credit-note pathway:
   - turn off `insurance_healthcloud_credit_note_enabled`
4. Confirm UI no longer shows HealthCloud workflow panel.
5. Confirm backend HealthCloud actions return feature-disabled responses.
6. Notify operations and billing teams that legacy flow is active.

Rollback validation:
- new private-insurance claims can proceed via legacy path
- no new HealthCloud workflow events are recorded

## 8) Post-Incident Actions

1. Record timeline, root cause, and mitigations.
2. Attach 3-5 sample correlation IDs and affected operations.
3. Capture whether rollback was required and total time to recover.
4. Create follow-up ticket for hardening (tests, alert tuning, retry policy).
