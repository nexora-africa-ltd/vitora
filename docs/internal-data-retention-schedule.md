<!--
Purpose: Internal controller worksheet for defining and approving Vitora HMIS data-retention schedules by data class.
Use: Complete under records, clinical, legal, finance, privacy, and security governance; do not use as a public privacy notice or DHA-facing policy.
Inputs: Applicable legal requirements, healthcare records rules, payer/tax/employment contracts, processor terms, storage inventory, legal holds, and risk assessments.
-->
# Internal Data Retention Schedule

**Classification:** Internal confidential working document
**Owner:** Controller Records Manager and DPO
**Status:** Complete before applying retention/disposal automation or approving disposal at scale

## Purpose

This internal worksheet records the controller-specific retention schedule that sits behind the Data Retention and Secure Disposal Policy. It is separate from the DHA-facing policy because the periods below require controller, clinical, legal, financial, and contractual decisions that cannot be inferred from Vitora source code.

## Completion Rules

1. Record an exact duration and a clear trigger for every class before approving automated or bulk disposal.
2. Cite the applicable legal, clinical, contractual, payer, tax, employment, or other justification.
3. Identify every primary, backup, offline, processor, and export location that can hold the data.
4. Define how legal holds, rights requests, complaints, incidents, and clinical safety reviews suspend disposal.
5. Record the approved disposal method and the evidence required to close the disposal action.
6. Review at least annually and after a material change to law, clinical service, payer, processor, storage location, integration, or data flow.

## Controller Schedule

| Data class | Data/examples | Retention period | Trigger | Justification/reference | Owner | Storage/recipient locations | Hold rule | Disposal method and evidence | Approval/review date |
|---|---|---|---|---|---|---|---|---|---|
| Clinical record | Encounters, diagnoses, notes, care plans, referrals, consent relevant to care |  |  |  |  |  |  |  |  |
| Child/adolescent record | Child-specific clinical records and representative/authority evidence |  |  |  |  |  |  |  |  |
| Maternity/safeguarding record | MCH, delivery, GBV, counselling, child-protection, and safeguarding records |  |  |  |  |  |  |  |  |
| Diagnostic/imaging record | Lab results, DICOM objects, images, reports, and attachments |  |  |  |  |  |  |  |  |
| Blood-bank/donor record | Donor, unit, cross-match, transfusion, and adverse-event records |  |  |  |  |  |  |  |  |
| Financial/claims record | Invoices, payments, receipts, claims, preauthorizations, remittances, and procurement |  |  |  |  |  |  |  |  |
| Staff/HR record | Staff identity, employment, roster, credential, disciplinary, and training records |  |  |  |  |  |  |  |  |
| Audit/security record | Audit trail, emergency access, security events, and integrity results | Minimum 7 years unless longer requirement applies | Event date | Product policy and controller validation | Security / Records |  |  |  |  |
| Public-health/reporting extract | IDSR, IHR, DHIS2/KHIS, MOH, quality, and analytics working copies |  |  |  |  |  |  |  |  |
| AI data | Prompts, chat, output, provider logs, and adopted clinical output |  |  |  |  |  |  |  |  |
| Rights/complaint/incident record | Access/erasure requests, DPIA, breach, complaint, and investigation evidence |  |  |  |  |  |  |  |  |
| Processor-held copy | Messaging, payer, payment, laboratory, AI, storage, support, and analytics-provider data |  |  |  |  |  |  |  |  |

## Operational Copy Defaults

These source-backed defaults are operational references, not replacements for the controller schedule:

| Copy | Source-backed default | Owner decision required |
|---|---|---|
| Audit organization setting | 7 years | Verify production retention/archive mechanism and any longer requirement |
| `backup.sh` backups | 30 days local, 90 days remote | Confirm selected production backup job, storage, holds, and restoration obligations |
| `backup-db.sh` backups | 30 days | Confirm selected production backup job, encryption, storage, and holds |
| Hub local bundles | 14 bundles | Confirm time coverage, offsite destination, holds, and device disposal |
| Synced queue entries | 24 hours after sync | Confirm scheduled pruning and whether exceptional troubleshooting retention applies |
| Failed queue entries | 7 days | Confirm scheduled pruning and incident/hold exclusions |

## Approval

| Role | Name | Signature/approval reference | Date |
|---|---|---|---|
| Controller/facility leadership |  |  |  |
| Records Manager |  |  |  |
| Clinical Governance lead |  |  |  |
| Finance lead |  |  |  |
| DPO |  |  |  |
| Security Officer |  |  |  |
