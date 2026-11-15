<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for REP-IHR-001 International Concern Reporting.
Use: Attach the workflow screenshot and external-reference evidence only after an actual authorised escalation.
Inputs: Staging Facility 13, Patient 402, IHR notification 404, and the documented Kenya IHR escalation pathway.
-->

# REP-IHR-001 — IHR International Concern Reporting

**Status:** County and National escalation evidence ready. WHO notification is intentionally not claimed.

| Portal field | Value |
| --- | --- |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/surveillance/ihr/404/` |
| Required header | `X-Facility-ID: 13` |
| Current status | `ESCALATED_NATIONAL` |

The synthetic Novel Coronavirus scenario contains positive Annex 2 criteria and recorded County → National progression. It has no `who_notified_at` value and no external WHO reference number.

Vitora records externally issued WHO reference evidence; it does not transmit directly to a WHO endpoint. Attach an actual authorised external reference only after the responsible IHR focal-point workflow occurs.
