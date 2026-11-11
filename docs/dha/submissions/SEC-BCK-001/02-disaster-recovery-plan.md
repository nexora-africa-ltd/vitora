# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: DHA SEC-BCK-001 controlled-document cover sheet for the Vitora Disaster Recovery Plan.
Use: Attach with the signed controlled plan or export this package's referenced plan to PDF.
Inputs: docs/dha/disaster-recovery-plan.md and its completed approval record.
-->

# Disaster Recovery Plan — Controlled Evidence Reference

The authoritative Disaster Recovery Plan is [`../../disaster-recovery-plan.md`](../../disaster-recovery-plan.md). It defines incident activation, roles, communications, restoration into an isolated environment, recovery acceptance checks, monthly restore validation, post-incident review, and approval requirements.

For the DHA submission, attach the signed controlled PDF rendition of that plan. This reference sheet exists to make the document relationship explicit in the SEC-BCK-001 evidence package and must be kept aligned with the approved plan.

## Required plan assertions

- Recoverable events include service loss, database corruption, failed migration, security incident, backup/restore failure, and provider outage.
- Recovery requires checksum verification and an isolated restore before production cutover.
- Acceptance includes application health, HTTPS, authentication, tenant isolation, audit logging, storage, reconciliation, and stakeholder communication checks.
- The plan is reviewed annually and after material incidents, failed drills, or material infrastructure changes.
- The approved recovery objectives are RTO four hours and RPO 24 hours.
