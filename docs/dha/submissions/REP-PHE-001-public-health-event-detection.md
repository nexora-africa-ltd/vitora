<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for REP-PHE-001 Public Health Event Detection and Alerting.
Use: Retest the alert and threshold evidence endpoints from outside the internal network before submission.
Inputs: Staging Facility 13, Patient 402, Measles cases 419-423, outbreak alert 407, and the County 30 threshold.
-->

# REP-PHE-001 — Public Health Event Detection and Alerting

**Status:** Synthetic outbreak-detection evidence ready.

| GET evidence | URL |
| --- | --- |
| Outbreak alert | `https://staging-api.vitora.digital/api/surveillance/alerts/407/` |
| Source case | `https://staging-api.vitora.digital/api/surveillance/cases/419/` |
| Threshold configuration | `https://staging-api.vitora.digital/api/surveillance/thresholds/` |

The scenario contains five synthetic Measles cases (`419–423`) distributed across three days. The County 30 threshold is active at five cases in three days, and alert `407` records the threshold event.

No county delivery was fabricated for this synthetic outbreak. If DHA requires live county transport evidence for this row, use a DHA-approved recipient and create a new controlled delivery from the case workflow.
