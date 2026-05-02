# DHA HIE: Claims & Preauths

> **Source**: [DHA Health Information Exchange](https://hie-docs.dha.go.ke)
> **Scraped**: 2026-05-01 21:00 UTC
> **Purpose**: Offline reference for Vitora HMIS SHA integration
> **COMPLIANT** ✔
---

## Table of Contents

1. [Introduction to Claims](#introduction-to-claims)
2. [Benefits & Intervention Codes](#benefits-intervention-codes)
3. [Intervention Combination Rules](#intervention-combination-rules)
4. [Claim Lifecycle & Statuses](#claim-lifecycle-statuses)
5. [Understanding Virtual Claims](#understanding-virtual-claims)
6. [Preauthorization Lifecycle & Statuses](#preauthorization-lifecycle-statuses)
7. [Understanding Preauthorizations](#understanding-preauthorizations)
8. [Start Visit Consent Process Overview](#start-visit-consent-process-overview)
9. [Start Visit Process Guide: Start Visit Workflow](#start-visit-process-guide-start-visit-workflow)
10. [Eligibility Process](#eligibility-process)
11. [Eligibility Check Workflow Guide](#eligibility-check-workflow-guide)
12. [Eligibility Process Guide: Benefits Coverage Workflow](#eligibility-process-guide-benefits-coverage-workflow)
13. [Eligibility Process Guide: Intervention Coverage Workflow](#eligibility-process-guide-intervention-coverage-workflow)
14. [Preauths Process Overview: Obtaining Prior Authorisation for Healthcare Services](#preauths-process-overview-obtaining-prior-authorisation-for-healthcare-services)
15. [Preauths Process Guide: Normal Preauths Workflow](#preauths-process-guide-normal-preauths-workflow)
16. [Preauths Process Guide: Surgical Preauth Workflow](#preauths-process-guide-surgical-preauth-workflow)
17. [Preauths Process Guide: Elective Preauthorization Workflow](#preauths-process-guide-elective-preauthorization-workflow)
18. [Preauths Process Guide: Oncology Preauth Workflow](#preauths-process-guide-oncology-preauth-workflow)
19. [Preauths Process Guide: Renal Preauth Workflow](#preauths-process-guide-renal-preauth-workflow)
20. [Preauths Process Guide: Imaging Preauth Workflow](#preauths-process-guide-imaging-preauth-workflow)
21. [Preauths Process Guide: Optical Preauth Workflow](#preauths-process-guide-optical-preauth-workflow)
22. [Preauths Process Guide: Pre-Authorization Cancellation Workflow](#preauths-process-guide-pre-authorization-cancellation-workflow)
23. [Preauth Doctor Consent Process Overview: Facilitating Doctor Approval for Pre-Authorizations](#preauth-doctor-consent-process-overview-facilitating-doctor-approval-for-pre-authorizations)
24. [Intervention Process Overview: Managing Patient Services](#intervention-process-overview-managing-patient-services)
25. [Intervention Process Guide: Add New Intervention Workflow](#intervention-process-guide-add-new-intervention-workflow)
26. [Intervention Process Guide: Switch Intervention Workflow](#intervention-process-guide-switch-intervention-workflow)
27. [Intervention Process Guide: Retire Intervention Workflow](#intervention-process-guide-retire-intervention-workflow)
28. [Intervention Process Guide: Restore Intervention Workflow](#intervention-process-guide-restore-intervention-workflow)
29. [Billing Workflows Process Overview: Streamlining Financial Transactions in Healthcare](#billing-workflows-process-overview-streamlining-financial-transactions-in-healthcare)
30. [Billing Workflows Process Guide: Add new line Workflow](#billing-workflows-process-guide-add-new-line-workflow)
31. [Edit Claim Line Workflow Guide](#edit-claim-line-workflow-guide)
32. [Billing Workflows Process Guide: Remove line Workflow](#billing-workflows-process-guide-remove-line-workflow)
33. [Billing Workflows Process Guide: Add Diagnosis Workflow](#billing-workflows-process-guide-add-diagnosis-workflow)
34. [Billing Workflows Process Guide: Remove Diagnosis Workflow](#billing-workflows-process-guide-remove-diagnosis-workflow)
35. [Billing Workflows Process Guide: Add Attachment Workflow](#billing-workflows-process-guide-add-attachment-workflow)
36. [Billing Workflows Process Guide: Remove Attachment Workflow](#billing-workflows-process-guide-remove-attachment-workflow)
37. [Preview Provider Claim Workflow Guide](#preview-provider-claim-workflow-guide)
38. [Preview Payer Claim Workflow Guide](#preview-payer-claim-workflow-guide)
39. [Close Claim Workflow Guide](#close-claim-workflow-guide)
40. [Resubmit Claim Workflow Guide](#resubmit-claim-workflow-guide)
41. [Claim Dispatch / Visit End Process Overview: Finalizing Patient Claims and Encounters](#claim-dispatch-visit-end-process-overview-finalizing-patient-claims-and-encounters)
42. [Claim Dispatch / Visit End Process Guide: Outpatient Claim Dispatch Workflow](#claim-dispatch-visit-end-process-guide-outpatient-claim-dispatch-workflow)
43. [Claim Dispatch / Visit End Process Guide: In-patient Claim Dispatch Workflow](#claim-dispatch-visit-end-process-guide-in-patient-claim-dispatch-workflow)
44. [Remittance Process Overview: Streamlining Payment Reconciliation for Healthcare Providers](#remittance-process-overview-streamlining-payment-reconciliation-for-healthcare-providers)
45. [Remittance Process Guide: Get Remittances Workflow](#remittance-process-guide-get-remittances-workflow)
46. [Remittance Process Guide: Get Claims Paid by Remittance Workflow](#remittance-process-guide-get-claims-paid-by-remittance-workflow)

---

## Introduction to Claims

> Source: [https://hie-docs.dha.go.ke/docs/claims/getting-started/introduction](https://hie-docs.dha.go.ke/docs/claims/getting-started/introduction)

# Claims Overview


Welcome to the Claims API documentation for the Health Information Exchange (HIE) APIs.


The Claims API enables you to manage and process healthcare claims efficiently and securely. It provides the ability to create, submit, edit, track, and finalize claims, ensuring seamless integration with the Social Health Authority (SHA) and other stakeholders in the healthcare ecosystem.


By leveraging the Claims API, you can automate claim workflows. The API supports a wide range of claim operations, from eligibility checks and billing to preauthorization and remittance management.


## Capabilities


With the Claims API, you can:


- **Submit Claims:** Send new claims for processing and reimbursement.
- **Edit Claims:** Update claim details, including billing lines, diagnoses, and attachments.
- **Track Claim Status:** Monitor the progress and status of claims throughout their lifecycle.
- **Perform Eligibility Checks:** Instantly verify patient coverage and entitlements.
- **Manage Preauthorizations:** Request, update, or cancel preauthorization for specific healthcare services.
- **Handle Remittances:** Retrieve remittance details and payment information for processed claims.


## Explore More


- **Process Docs:** Step-by-step guides for real-world claims scenarios.
- **Guides:** Best practices, troubleshooting, and advanced usage.
- [API Reference:](https://hie-docs.dha.go.ke/eclaims) Claims endpoints and schemas in the [API Catalog](https://hie-docs.dha.go.ke/catalog).
- [Integration Scenarios:](https://hie-docs.dha.go.ke/docs/scenarios/overview) End-to-end API call sequences for each integration type - a great starting point once you have the APIs.


> Use the sidebar to access process docs, guides, and the API reference for Claims.


---

Last modified on
April 30, 2026
Eligibility Process Overview

---

## Benefits & Intervention Codes

> Source: [https://hie-docs.dha.go.ke/docs/claims/guides/benefit-intervention-codes](https://hie-docs.dha.go.ke/docs/claims/guides/benefit-intervention-codes)

# Benefits & Intervention Codes


The Social Health Authority (SHA) uses a standardized coding system to represent healthcare services. Understanding this hierarchy is essential for checking eligibility and submitting valid claims.


## The Code Hierarchy


SHA codes follow a hierarchical structure. You cannot submit a claim using only a high-level "Benefit" code; you must always be specific and use an "Intervention" code.


1. **Benefit Package (SHA-XX):** Broad categories of care (e.g., Inpatient, Dental).
2. **Intervention (SHA-XX-YYY):** The specific billable service (e.g., Appendectomy, Consultation).


### Code Relationship


An Intervention code usually starts with the prefix of its parent Benefit Package.


**Example:** `SHA-07-001` (Management of Medical Cases) belongs to `SHA-07` (Inpatient Services).


## List of Benefit Packages


Below are the high-level benefit packages available in the SHA ecosystem.


| Benefit Code | Name of Package |
| --- | --- |
| SHA-01 | Ambulance and Emergency Services |
| SHA-03 | Critical Care Services |
| SHA-05 | Optical Health Services |
| SHA-06 | Haematology and Oncology Services |
| SHA-07 | Inpatient Services |
| SHA-08 | Maternity and Child Health Services |
| SHA-09 | Medical Imaging & Other Investigations |
| SHA-10 | Mental Wellness Services |
| SHA-12 | Outpatient Services |
| SHA-13 | Palliative Care Services |
| SHA-16 | Renal Care Services |
| SHA-18 | Essential Diagnostic Laboratory Listing for NCDs |
| SHA-19 | Surgical Services |


## Finding Intervention Codes


While the table above lists the categories, you need specific **Intervention Codes** to build a claim.


You can retrieve the full list of valid interventions for a specific patient and facility by using the **Interventions Coverage Endpoint**.


### How it fits in with claims and preauths


When working with claims and preauths, you will need to use the *Intervention Code* to represent the provided healthcare service. This is the `intervention_code` used in most of the APIs in their request body.

Last modified on
April 30, 2026
SHA Combination Rules
Understanding Claims

---

## Intervention Combination Rules

> Source: [https://hie-docs.dha.go.ke/docs/claims/guides/sha-combination-rules](https://hie-docs.dha.go.ke/docs/claims/guides/sha-combination-rules)

# Intervention Combination Rules


The Social Health Authority (SHA) uses **Combination Rules** to govern which intervention codes can be added to the same claim.


These rules are essential for ensuring claim integrity, preventing conflicts (e.g., an inpatient and an outpatient service on the same claim), and improving payout times. Adhering to these rules at the point of care will significantly reduce claim rejections.


---


## How to interpret the Combination Rules Table


The logic in the Combination Rules table is based on a **Primary Intervention** model. The first intervention you add to a visit sets the context for the entire claim.

Important!

The "Code" column below refers to the **first intervention** added to the visit. The "Allowed Code Combinations" column shows what other benefit packages can (or cannot) be added *after* that first one.


### Checking Combinations via API


Before you call the [Add Intervention endpoint](https://hie-docs.dha.go.ke/eclaims/interventions#add-a-new-intervention-to-claim) to help add an intervention to a claim `POST /.../add_intervention`, you can validate your combination by using the [Validate Add Intervention to a claim endpoint](https://hie-docs.dha.go.ke/eclaims/interventions#validate-add-intervention-to-claim).This endpoint allows you to send your list of interventions and will return a response letting you know if it meets the combination rules or not for your existing claim, helping you prevent errors before they happen.


### Intervention Code Combinations


| Code | Name of Package | Allowed Code Combinations |
| --- | --- | --- |
| SHA-01 | Ambulance and Emergency Services | None. |
| SHA-03 | Critical Care Services | SHA-07 \| SHA-06 \| SHA-16 \| SHA-09 \| SHA-13 \| SHA-08 \| SHA-19 (Refer to surgical rules) |
| SHA-05 | Optical Health Services | ALONE(No other Intervention codes can/should be added) |
| SHA-06 | Haematology and Oncocllogy Services | ALONE(No other Intervention codes can/should be added) |
| SHA-07 | Inpatient Services | SHA-03 \| SHA-06 \| SHA-16 (001, 002, 004, 007, 008, 011) \| SHA-09 \| SHA-19 (Refer to surgical rules) |
| SHA-08 | Maternity and Child Health Services | SHA-03 \| SHA-09 \| SHA-07-005 \| SHA-07-006 codes after the lapse of the global period as per the Maternity rules sheet |
| SHA-09 | Medical Imaging & Other Investigations | ALONE(No other Intervention codes can/should be added) |
| SHA-10 | Mental Wellness Services | ALONE(No other Intervention codes can/should be added) |
| SHA-12 | Outpatient Services | ALONE(No other Intervention codes can/should be added) |
| SHA-13 | Palliative Care services | SHA-03 \| SHA-06 \| SHA-07 \| SHA-09 \| SHA-16 \| SHA-19 |
| SHA-16 | Renal Care Services | Codes to be reported alone are;SHA-16-001,002,004Codes to allow combination are;* SHA-16-003 \| SHA-03 \| SHA-07* SHA-16-005 \| SHA-03 \| SHA-07* SHA-16-006 \| SHA-03 \| SHA-07* SHA-16-007 \| SHA-03 \| SHA-07* SHA 16-009 \| SHA-03 \| SHA-07 |
| SHA-18 | Essential Diagnostic Laboratory Listing for NCDs | ALONE(No other Intervention codes can/should be added) |
| SHA-19 | Surgical Services | SHA-07-002 \| SHA-09 \| SHA-03 & SHA-13 ONLY after the lapse of the surgical global period defined in the Surgical rules sheet |

Last modified on
April 30, 2026
Get Claims Paid By Remittance
Understanding Benefits and Intervention Codes

---

## Claim Lifecycle & Statuses

> Source: [https://hie-docs.dha.go.ke/docs/claims/guides/understandingClaimStatuses](https://hie-docs.dha.go.ke/docs/claims/guides/understandingClaimStatuses)

# Claim Lifecycle & Statuses


Successfully integrating with the HIE requires managing the state of your claims. A claim moves through a lifecycle from creation to payment, and understanding this flow is key to building a robust integration.


## The Double Status System


Every claim has **two** sets of status fields that you must monitor. It is critical to distinguish between the status of the claim in **your system (Provider)** versus the status in the **Payer's system**.


| Perspective | Process Status Field | Validity Status Field |
| --- | --- | --- |
| Provider Claim | workflow_stateTracks the claim's lifecycle from your perspective (Draft → Submission_ready → Submitted). | claim_auth_statusTracks the authorization validity of the visit itself. |
| Payer Claim | workflowStateTracks the detailed adjudication steps inside the Payer's system. | authorisation.statusTracks the Payer's view of the authorization. |


---


## 1. Provider Claim Statuses


These statuses track the claim as it exists in your local system. They represent the high-level journey of a claim.


### A. Provider Workflow State (workflow_state)


We have grouped these statuses into logical phases based on the claim's journey.


#### Phase 1: Preparation (Local)


*The claim has not yet left your system*


- **DRAFT**: The claim is being created. You can edit lines and diagnoses.
- **PENDING**: Awaiting an internal action.
- **SUBMISSION_READY**: Validated locally and ready for dispatch.
- **ON_HOLD**: Paused locally for internal reasons.
- **TIME_BARRED**: The claim was not submitted within the allowed window (e.g., 24-hour emergency rule or 14 day window to add missing attachments).


#### Phase 2: Submission & Dispatch


*The hand-off to the payer.*


- **SUBMITTED**: Successfully sent to a service that will forward it to the payer's system.
- **DISPATCHED**: Acknowledged by the service and forwarded to the Payer.
- **FAILED_TO_SUBMIT**: Technical error prevented dispatch. Retry required.


#### Phase 3: Payer Processing & Feedback


*The claim is with the Payer.*


- **SUBMITTED_PAYER**: Received by the Payer's system.
- **AUTOMATIC_CHECKS_DONE**: Automated checks have completed and passed.
- **DRAFT_RESUBMIT**: You have pulled the claim back to fix a clarification request. It is editable. This is usually initiated when you run the [resubmitClaim](https://hie-docs.dha.go.ke/eclaims/billing#resubmit-claim) operation.
- **DRAFT_RESUBMIT_DOCUMENTS**: Specific status for uploading missing documents.


#### Phase 4: Final Outcomes


*The end of the lifecycle.*


- **CLOSED**: You have decided to close the claim and no longer wish to pursue it.


### Important Note on Financial Outcomes


The Provider Claim object does **not** track feedback from the Payer (payment or rejection statuses like `PAID` or `REJECTED`). To determine the financial outcome of a claim, you **must** check the Payer Claim  by querying the [getPayerClaim](https://hie-docs.dha.go.ke/eclaims/billing#preview-payer-claim) endpoint.


#### Provider Claim Workflow State Diagram


### B. Provider Authorization Status (claim_auth_status)


This tracks the clinical validity of the visit.


| Status | Meaning |
| --- | --- |
| PENDING | Authorization requested but not yet granted. |
| AUTHORIZED | Standard Status.The visit is valid, and patient has consented to it; you can add interventions and billing lines. |
| SUBMITTED_CLAIM | The claim associated with this authorization has been submitted to the payer. |
| AUTHORIZED_PENDING_VISIT | Used forElective Preauths. The pre-auth is approved, but the patient has not arrived yet. |
| AUTHORIZED_MULTISESSION | Valid for a series of related visits (e.g., dialysis or chemotherapy series). You can create multiple visits from thisauth. Only valid forMultisession preauths. |
| EMERGENCY_AUTHORIZED | Validated emergency case claim. Only valid for claims of service typeEMERGENCY. |
| REJECTED | Authorization request denied. |
| EXPIRED | Authorization validity period has passed. |
| CLOSED | Visit finalized. |


---


## 2. Payer Claim Statuses


These statuses appear in the **Payer Claim** object. They offer an insight into the review process inside the Payer's system and provide feedback for any issues raised with regards to the claim.


### Important Note


You can only check claims from the Payer's perspective after submission. These statuses are not applicable to claims in your local system.


### A. Payer Workflow State (workflowState)


#### Receipt & Validation


*The entry point into the Payer's world.*


- **DRAFT_PROVIDER**: The claim has been submitted and is now being processed for payer review.
- **SUBMITTED_PROVIDER**: Acknowledges receipt from the provider and passes some checks including if it has a diagnosis, an attachment and an invoice line.
- **AUTOMATIC_CHECKS_DONE**: Passed automated rules engine and validations checks.
- **SUBMITTED_PAYER**: Logged in Payer's core system. This signifies successful handoff to the payer


#### Adjudication & Review Queues


*Various levels of human and system reviews.*


- **IN_REVIEW**: General review queue.
- **CLINICAL_REVIEW**: Under review by clinical experts.
- **MEDICAL_REVIEW**: Under review by medical doctors.
- **UNDER_COMMITTEE_REVIEW**: High-level committee review.
- **SENT_TO_SURVEILLANCE**: Flagged for fraud check.
- **MANUAL_REVIEW**: Reviewed manually by someone from the payer and has passed.


#### Clarification & Returns


*The "Ping Pong" states where the claim is sent back to you. This is where the clarification loop resides*


- **CLARIFICATION_AFTER_AUTOMATIC_CHECKS**: Automated checks and validations have flagged an issue.
- **SENT_BACK**: Returned to provider for general corrections.
- **MISSING_DOCUMENTS**: Specific flag for missing attachments.
- **DRAFT_PROVIDER_RESUBMITTED**: Payer acknowledges your resubmission.
- **DRAFT_PROVIDER_RESUBMITTED_MISSING_DOCUMENTS**: Payer acknowledges missing document upload.
- **RESUBMITTED_MISSING_DOCUMENTS**: Docs received, processing resumed.


#### Payment & Finalization


*The final disposition.*


- **SENT_FOR_PAYMENT_PROCESSING**: Approved and queued for finance. In unique occasions, this claim may still be returned to a `SENT_BACK` status if the claim looks fraudulent.
- **APPROVED**: Final approval granted.
- **PAID**: Payment executed.
- **REJECTED**: Denied by the payer.
- **APPEALED**: Under appeal review.
- **TIME_BARRED**: Expired.


### B. Payer Authorization Status (authorisation.status)


- **SUBMITTED_CLAIM**: Authorization linked to a submitted claim.
- **AUTHORIZED**: Valid authorization on file.
- **EXPIRED**: Authorization validity period has lapsed.
- **CLOSED**: Authorization has been closed after claim finalization.


---

Last modified on
April 30, 2026
Understanding Claims
Understanding Preauths

---

## Understanding Virtual Claims

> Source: [https://hie-docs.dha.go.ke/docs/claims/guides/understandingClaims](https://hie-docs.dha.go.ke/docs/claims/guides/understandingClaims)

# Understanding Virtual Claims


A **virtual claim** in the HIE ecosystem is the digital record of a patient encounter. It acts as the container for three distinct types of data:


1. **Clinical Data:** Diagnoses and Interventions (What happened?)
2. **Financial Data:** Invoices and Lines (What does it cost?)
3. **Administrative Data:** Patient IDs, Provider IDs, and Authorizations (Who is involved?)


## The Two Views: Provider vs. Payer


It is critical to understand that a single claim exists in two forms depending what stage in the lifecycle it is in.


### 1. The Provider Claim (Your View)


This is the claim object as it exists in your HMIS. You have full control over this object while it is in `DRAFT`. And have no control when submitted.
This claim object is created by you via the [Create virtual claim endpoint](https://hie-docs.dha.go.ke/eclaims/start-visit-consent#create-new-virtual-claim).


- The primary use of this claim is to confirm that correct details have been added to the claim, tracking billing, submitting data, and correcting errors.
- This provider claim contains the "Source of Truth" for clinical and billing data.


### 2. The Payer Claim (The Adjudicator's View)


This is the read-only version of the claim that is what the payer's system actually sees and interacts directly with in terms of feedback.


- It can be retrieved via the [Preview Payer Claim endpoint](https://hie-docs.dha.go.ke/eclaims/billing#preview-payer-claim).
- Some of the primary uses of this claim is it helps get feedback on your claim directly from the payer and why, it helps provide more understanding as to why a claim was rejected or returned for changes, checking payment amounts, and reading feedback notes.


---


## Anatomy of a ClaimDHA Logo

Home
Authentication
Integration Scenarios
Claims & Preauths
Consent Services
Registries
Terminology Service
Changelog
API Catalog


A claim is a hierarchical tree. Understanding this hierarchy is essential for proper managing of the claim, and error handling.


### 1. The Root Object (The Claim)


Contains the high-level metadata: `claim_auth_status`, `workflow_state`, `patient_number`, and the `authorization_code` (mostly referred to as the `consent_token`).


### 2. The Invoice Object


Every claim has an `invoices` array (currently limited to 1 invoice per claim). This holds the financial totals.


- **Invoice Lines:** Nested inside the invoice. These are the specific line items (e.g., "Consultation - 500 KES").


### 3. The Intervention Object


These are the medical services linked to the claim.


- **Crucial Rule:** Every Invoice Line must correspond to a valid Intervention Code. If you have a line item for "Surgery," you must have an active Surgical Intervention in this array.


---


## Data Structure Examples


### Provider Claim Payload (Simplified)


This is a simplified structure of a Provider Claim. Notice how `invoices` and `interventions` are logically linked. To see the full structure you can check the [Create Virtual Claim endpoint](https://hie-docs.dha.go.ke/eclaims/start-visit-consent#create-new-virtual-claim) documentation.


```json
{
  "admitted_on": "string",
  "appointment_number": "string",
  "attributes": "string",
  "authorization_code": "string",
  "authorization_guid": "string",
  "beneficiary_guid": "string",
  "beneficiary_id": 5205,
  "beneficiary_is_fuzzy_matched": false,
  "cancel_reason_text": "string",
  "cancel_reason_type": "string",
  "claim_attachments_count": 705,
  "claim_auth_status": "string",
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 3865,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": false,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_id": 3315,
  "created_by_name": "string",
  "currency": "string",
  "diagnoses_count": 770,
  "discharge_cancel_date": "string",
  "discharge_cancel_remarks": "string",
  "discharge_reason": "string",
  "discharged_on": "string",
  "edi_claim_guid": "string",
  "emergency_visit_expiry": "string",
  "estimate_ip_days": 7995,
  "expected_discharge_date": "string",
  "has_reviewed_claim": false,
  "id": "string",
  "initial_intervention": "string",
  "intervention_copay_data": ["string", "string"],
  "interventions": [
    {
      "accrued_per_diem_amount": 4709.152718937875,
      "accrued_per_diem_days": 3493,
      "active_for_uhc": false,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6162.5011110231335,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": true,
      "keph_level_tarrif": 1330.8115657640074,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 8469,
      "switched_lines_retained": true,
      "workflow_state": "string"
    }
  ],
  "invoice_attachments_count": 3810,
  "invoice_id": "string",
  "invoice_number": "string",
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 1681.6708386995472,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 8374.510627096637,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 4521,
          "intervention_code": "string",
          "invoice": 1782,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 3795,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 9138.656265712008,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6632.284995171225,
          "line_net_amount": 7325.581053297044,
          "line_number": "string",
          "line_total_amount": 8277.868168267792,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 1399.5708020511534,
          "patient_discount_amount": 1065.155779487701,
          "patient_net_price": 1107.9968117682615,
          "pmf_line_status": "string",
          "quantity": 6204.365663753832,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 9690.798672122937,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 7148.383053016953
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 2332.0989140038596,
      "total_inv_copay": 3740.1355676164603,
      "total_inv_discount": 3939.1434464142017,
      "total_inv_net_amount": 5721.417071745256,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "is_charge_master_mapped": true,
  "is_negative": false,
  "is_resubmitted": false,
  "is_zero": false,
  "last_retry": "string",
  "location_code": "string",
  "location_name": "string",
  "member_name": "string",
  "member_number": "string",
  "member_number_has_token": true,
  "mode_of_arrival": "string",
  "nhif_number": "string",
  "notes": "string",
  "number_of_invoices": 5711,
  "patient_name": "string",
  "patient_number": "string",
  "payer_code": "string",
  "payer_name": "string",
  "payer_slade_code": "string",
  "policy_number": "string",
  "policy_valid_from": "string",
  "policy_valid_to": "string",
  "provider_name": "string",
  "provider_slade_code": "string",
  "reason_for_unknown_patient": "string",
  "reference_number": "string",
  "resubmission_workflow_state": "string",
  "retry_count": 8884,
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_claim_amount": 7006.812956886901,
  "total_claim_copay": 1155.9236336068325,
  "total_claim_discount": 747.5162780757105,
  "total_claim_net_amount": 5155.379558342188,
  "total_claim_splits": 1573.3887589863737,
  "updated_by_name": "string",
  "visit_end": "string",
  "visit_number": "string",
  "visit_start": "string",
  "workflow_state": "string"
}
```


#### Key Field Reference: Provider Claim


| Field | Description |
| --- | --- |
| id | Unique identifier for the claim. |
| claim_id | Internal ID for the claim. |
| claim_auth_status | Shows the authorization status of the claim. |
| authorization_code | Code confirming claim authorization and consent (consent_token). |
| authorization_guid | GUID for the authorization. |
| beneficiary_id | Identifier for the beneficiary (beneficiary_cr_id). |
| beneficiary_guid | GUID for the beneficiary. |
| patient_name / patient_number | Name and identifier of the patient. |
| member_name / member_number | Details about the insured member. |
| provider_name / provider_slade_code | Name and code of the healthcare provider. |
| payer_name / payer_code / payer_slade_code | Details of the insurance payer. |
| scheme_name / scheme_code | Name and code of the SHA scheme. |
| total_claim_amount | The total monetary value being claimed. |
| total_claim_net_amount | Net amount after discounts and copays. |
| total_claim_copay | Total copay amount for the claim. |
| total_claim_discount | Total discount applied to the claim. |
| total_claim_splits | Amount split across payers or schemes. |
| invoices | Array of billing details. Only 1 invoice allowed per claim. |
| invoice_number / invoice_id | Invoice reference and identifier. |
| interventions | Lists the healthcare services or procedures. |
| claim_diagnoses | Diagnoses associated with the claim. |
| workflow_state | Current processing status of the claim (e.g., DRAFT, SUBMITTED). |
| resubmission_workflow_state | Status of the claim during resubmission. |
| service_type | Type of healthcare service (e.g., CAPITATION, INPATIENT). |
| visit_start / visit_end | Start and end timestamps for the patient visit. |
| admitted_on / discharged_on | Admission and discharge dates for inpatient claims. |
| discharge_reason | Reason for patient discharge. |
| emergency_visit_expiry | Expiry date for emergency visits. |
| has_reviewed_claim | Indicates if the claim has been reviewed by the provider. |
| is_resubmitted | Whether the claim has been resubmitted. |
| currency | Currency used for the claim (e.g., KES). |
| notes | Additional comments or notes about the claim. |


> **Note:** The `document_types` field is key for claim attachments: all required document types listed here must be uploaded for each intervention before the claim can be submitted. If any required document is missing, the claim submission will be blocked. For a complete structure, refer to the [relevant API reference documentation](https://hie-docs.dha.go.ke/eclaims/start-visit-consent#create-new-virtual-claim) and see the actual response payload.


### Payer Claim Payload (Simplified)


This is a simplified structure of a Payer Claim. Notice how `claimNotes` and `claimTransitions`. This is data added by the Payer after automated or payer user reviews. To see the full structure you can check the [Create Virtual Claim endpoint](https://hie-docs.dha.go.ke/eclaims/billing#preview-payer-claim) documentation.


```json
{
  "attachments_count": 8159,
  "claim_attachments": [
    {
      "attachment": "string",
      "attachment_type": "string",
      "claim": "string",
      "data": "string",
      "debug_data": "string",
      "description": "string",
      "id": "string",
      "intervention_code": "string",
      "last_retry": "string",
      "retry_count": 6599,
      "title": "string"
    }
  ],
  "claim_diagnoses": [
    {
      "claim": "string",
      "claim_diagnosis_id": 1737,
      "diagnosis": "string",
      "diagnosis_code": "string",
      "diagnosis_name": "string",
      "edi_claim_diagnosis_guid": "string",
      "edi_claim_diagnosis_replicated": "string",
      "intervention_code": "string",
      "is_flagged_diagnosis": true,
      "is_inpatient": true,
      "original_visit_date": "string",
      "patient_number": "string",
      "recorded_on": "string",
      "site_code": "string",
      "site_code_type": "string",
      "visit_number": "string"
    }
  ],
  "claim_number": "string",
  "copay_amount": 537.101349514999,
  "diagnoses_count": 2580,
  "discount_amount": 3214.5500929632285,
  "estimated_processing_time": "string",
  "id": "string",
  "interventions": [
    {
      "accrued_per_diem_amount": 7339.765853242024,
      "accrued_per_diem_days": 2046,
      "active_for_uhc": true,
      "bill_from": "string",
      "bill_to": "string",
      "id": "string",
      "intervention_code": "string",
      "intervention_fund": "string",
      "intervention_name": "string",
      "intervention_overall_tariff": 6702.36724029738,
      "intervention_payment_mechanism": "string",
      "is_switched_intervention": false,
      "keph_level_tarrif": 5927.742541068468,
      "preauth_exist": true,
      "requires_surgical_preauth": false,
      "sub_benefit_code": "string",
      "supported_scheme": "string",
      "switched_intervention_id": 3081,
      "switched_lines_retained": false,
      "workflow_state": "string"
    }
  ],
  "invoices": [
    {
      "created_by_name": "string",
      "department": "string",
      "discount_amount": 4956.066249831641,
      "dispatch_batch_number": "string",
      "dispatch_status": "string",
      "doctors": [
        {
          "doctor_request_status": "APPROVED",
          "slade_code": "string"
        }
      ],
      "edi_invoice_id": "string",
      "id": "string",
      "invoice_copays": [
        {
          "charge_date": "string",
          "copay_amount": 6210.702181039925,
          "copay_type": "string",
          "description": "string",
          "edi_invoice_copay_guid": "string",
          "edi_invoice_copay_id": 5380,
          "intervention_code": "string",
          "invoice": 6036,
          "provider_copay_no": "string"
        }
      ],
      "invoice_date": "string",
      "invoice_flags": [
        {
          "code": "string",
          "description": "string",
          "edi_flag_guid": "string",
          "edi_flag_id": 2896,
          "existing": "string",
          "flag_type": "string",
          "invoice": "string",
          "is_resolved": true,
          "message": "string",
          "payload": "string",
          "response": "string",
          "timestamp": "string",
          "traceback": "string"
        }
      ],
      "invoice_number": "string",
      "invoice_type": "string",
      "lines": [
        {
          "attributes": "string",
          "bill_from": "string",
          "bill_to": "string",
          "charge_date": "string",
          "discount": 7969.099805558973,
          "discount_reason": "string",
          "doctor_code": "string",
          "doctor_name": "string",
          "id": "string",
          "intervention_code": "string",
          "invoice": "string",
          "is_active": false,
          "is_cancellation": true,
          "is_return": false,
          "item_code": "string",
          "item_name": "string",
          "line_copay": 6286.828709544115,
          "line_net_amount": 5415.312992009897,
          "line_number": "string",
          "line_total_amount": 95.08355621054676,
          "linked_invoice_line": "string",
          "map_request": "string",
          "map_request_description": "string",
          "mapped_slade_code": "string",
          "nhif_rebate_amount": 9768.505450343619,
          "patient_discount_amount": 5052.602332524425,
          "patient_net_price": 1295.9196543846008,
          "pmf_line_status": "string",
          "quantity": 9055.222778253114,
          "scheme_code": "string",
          "scheme_name": "string",
          "sponsor_net_price": 8166.429674629485,
          "uhc_exceeded": true,
          "unit": "string",
          "unit_price": 2598.675619029447
        }
      ],
      "linked_invoice": "string",
      "linked_invoice_line": "string",
      "member_name": "string",
      "patient_name": "string",
      "patient_number": "string",
      "provider_invoice_ref": "string",
      "provider_name": "string",
      "scheme_code": "string",
      "scheme_name": "string",
      "scu_branch_id": "string",
      "scu_dispatch_timestamp": "string",
      "scu_receipt_signature": "string",
      "service_type": "string",
      "total_inv_amount": 6278.949082592125,
      "total_inv_copay": 5508.40995614728,
      "total_inv_discount": 1889.5562200735694,
      "total_inv_net_amount": 1602.2825305865563,
      "visit_end": "string",
      "visit_start": "string",
      "workflow_state": "string"
    }
  ],
  "member_number": "string",
  "net_amount": 3171.675575686503,
  "number_of_invoices": 6813,
  "patient_name": "string",
  "patient_number": "string",
  "payer_claim_status": "string",
  "payer_processing_notes": "string",
  "provider_name": "string",
  "scheme_code": "string",
  "scheme_name": "string",
  "service_type": "string",
  "total_amount": 9481.243191838284,
  "visit_end": "string",
  "visit_start": "string"
}
```


#### Key Field Reference: Payer Claim


| Field                                                  | Description                                        |
| ------------------------------------------------------ | -------------------------------------------------- | --- |
| id                                                     | Unique identifier for the payer claim.             |
| claim_number                                           | The claim number assigned by the payer.            |
| payer_claim_status                                     | Current status of the claim in the payer's system. |
| payer_processing_notes                                 | Notes or feedback from the payer's processing.     |
| member_number                                          | Identifier for the insured member.                 |
| patient_name / patient_number                          | Name and identifier of the patient.                |
| provider_name                                          | Name of the healthcare provider.                   |
| scheme_name / scheme_code                              | Name and code of the insurance scheme.             |
| total_amount                                           | The total amount of the claim.                     |
| net_amount                                             | The net amount after adjustments.                  |
| copay_amount                                           | Total copay amount.                                |
| discount_amount                                        | Total discount amount.                             |
| interventions                                          | Lists the healthcare services or procedures.       |
| interventions[n].intervention_name / intervention_code | Name and code of the medical service.              |
| interventions[n].intervention_overall_tariff           | Overall tariff for the intervention.               |
| invoices                                               | Array of billing details and adjudicated lines.    |
| invoices[n].lines                                      | Specific line items within the invoice.            |
| invoices[n].lines[n].item_name / item_code             | Name and code of the line item.                    |
| invoices[n].lines[n].line_total_amount                 | Total amount for the specific line.                |
| claim_diagnoses                                        | Diagnoses associated with the claim.               |
| claim_attachments                                      | Supporting documents attached to the claim.        |
| attachments_count                                      | Total number of attachments.                       |
| diagnoses_count                                        | Total number of diagnoses.                         |
| number_of_invoices                                     | Total number of invoices.                          |
| estimated_processing_time                              | Estimated time for claim processing.               |
| visit_start / visit_end                                | Start and end timestamps for the patient visit.    |     |


> **Note:** This claim object contains more additional fields but has been simplified to cover the most commonly used and relevant fields for understanding and processing claims. For a complete structure, refer to the [relevant API reference documentation](https://hie-docs.dha.go.ke/eclaims/billing#preview-payer-claim) and see the the actual response payload.

Last modified on
April 30, 2026
Understanding Benefits and Intervention Codes
Understanding Claim Statuses

---

## Preauthorization Lifecycle & Statuses

> Source: [https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauthStatuses](https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauthStatuses)

# Preauthorization Lifecycle & Statuses


Managing preauthorizations requires tracking their state from initial creation through doctor approval and final payer adjudication. This guide explains the lifecycle of a preauth request.

State Machine

The preauth workflow is linear but includes specific loops for **Doctor
Approval** and **Payer Clarifications**. You must monitor the `status` field
to know when action is required.


## 1. Preparation Phase (Local)


These statuses occur before the preauth is successfully sent to the Payer for adjudication.


- **DRAFT**: The request is being created locally. You have full control to edit details, add attachments, and modify line items.
- **PENDING_SUBMISSION**: The preauth is fully validated and ready to be sent to the Payer switch.
- **CANCELLED**: The provider has decided not to proceed with the request. This is a terminal state for unsubmitted preauths.


### The Doctor Approval Loop


These are states where the doctor's approval is required. These intermediate states are only encountered when the approval request is done via the **Practice360 App**.


- **DOCTOR_REQUEST_SENT**: An approval request has been sent to the doctor.
- **PENDING_DOCTOR_APPROVAL**: The system is waiting for the doctor to explicitly approve or reject the request.
- **DOCTOR_REQUEST_FAILED**: The push notification or request to the doctor failed (e.g., connectivity issues). You may need to retry.


---


## 2. Submission & Active Phase


Once the preauth leaves your system, it enters the active processing state.


- **ACTIVE**: The preauth has been successfully submitted to the Payer. It is now **under review**.

Note: This does not mean it is approved yet. It means the request is sent to the Payer.


---


## 3. The Clarification Loop (Action Required)


Sometimes, the Payer's automated systems will flag issues or changes needed before an actual person reviews it. In this case the preauth transitions to this state:


- **CLARIFICATION_AFTER_AUTOMATIC_CHECKS**: The Payer's bots have flagged missing information or data mismatches.

Action Required: You must update the preauth (e.g., attach a missing document or fix a coding error) and re-submit. This transitions the claim back to ACTIVE.


---


## 4. Final Outcomes


These statuses represent the Payer's decision.


- **FINALISED**: **Success.** The Payer has reviewed the request and made a decision (Approved). You can now proceed to offer the service and link this preauth to a claim.
- **REJECTED**: The request was denied. The Payer will usually provide a reason in the `preauthNotes`.
- **REJECTED_AFTER_APPROVAL**: A rare state where a previously `FINALISED` (approved) preauth is revoked upon further audit or review.


---


## Visualizing the Workflow


The diagram below illustrates the valid transitions between these states.

Last modified on
April 30, 2026
Understanding Preauths

---

## Understanding Preauthorizations

> Source: [https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauths](https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauths)

# Understanding Preauthorizations


A **Preauthorization** (or "Preauth") is a formal request for prior financial approval from the Payer. It allows you to secure a guarantee of payment for specific, high-cost, or restricted medical services before you perform them.

When do I need a Preauth?

You don't need to guess. The **Intervention
Coverage** check will
explicitly tell you if a specific service requires pre-authorization inside
the intervention JSON structure.


## Anatomy of a Preauthorization


A preauth usually requires strong clinical evidence to justify the *need* for care. This evidence is reviewed by the payer and they approve or reject it or even approve a portion of the requested amount


The Preauth object is composed of four distinct data blocks:


1. **The Request (Root):** This is the main preauth object. It contains high-level details like the `preauthType` (e.g., Surgical) and the `totalEstimatedAmount`.
2. **Clinical Justification:** The `preauthDiagnoses` is key here as it helps provide the medical indications notices to warrant the need of the specific intervention being requested for. It helps explain *why* the procedure is necessary.
3. **Financial Line Items:** The `preauthItems` array lists exactly what you want to bill for (e.g., "Appendectomy procedure - 1 Unit").
4. **Supporting Evidence:** The `preauthAttachments` array holds files like X-rays or lab reports that prove the medical necessity.
5. **Attending medics:** The `preauthDoctors` array has information on attending physicians who will administer to the patient and whether or not they have given their approval for the preauth.


---


## Data Structure Examples


### Preauthorization Payload (Simplified)


This JSON represents a finalized preauth. Notice how the `preauthItems` contain both the requested amount (`unitPrice`) and the approved amount (`approvedUnitPrice`).


```json
{
  "accessPoint": "string",
  "anaesthesiaType": "string",
  "authorization": 214,
  "authorizationDetails": {
    "authCode": "string",
    "beneficiaryName": "string",
    "beneficiaryNumber": "string",
    "payerName": "string",
    "providerName": "string",
    "status": "string",
    "token": "string",
    "interventions": [
      {
        "code": "string",
        "name": "string",
        "needsPreauth": true,
        "overallTariff": 2996.3338685571907
      }
    ]
  },
  "beneficiaryDetails": {
    "beneficiaryId": 4912,
    "firstName": "string",
    "lastName": "string",
    "schemeName": "string"
  },
  "clinicalIndications": "string",
  "description": "string",
  "finalApprovedAmount": 9880.199954316204,
  "guid": "string",
  "id": 4700,
  "isElective": false,
  "isEmergency": false,
  "isHmisPreauth": true,
  "lengthOfStay": 9051,
  "memberName": "string",
  "payerName": "string",
  "preauthAttachments": [
    {
      "attachmentType": "MEDICAL_REPORT",
      "title": "string",
      "uploadedFile": "string"
    }
  ],
  "preauthDiagnoses": [
    {
      "name": "string",
      "preauthDiagnosisType": "string",
      "status": "string"
    }
  ],
  "preauthDoctors": [
    {
      "name": "string",
      "doctorReviewStatus": "string",
      "isHospitalDoctor": true,
      "status": "string"
    }
  ],
  "preauthItems": [
    {
      "name": "string",
      "quantity": "string",
      "unitPrice": 6606.9827456073035,
      "approvedAmount": 3943.764477869045,
      "status": "string"
    }
  ],
  "preauthType": "string",
  "providerName": "string",
  "serviceStart": "string",
  "serviceEnd": "string",
  "status": "string",
  "totalEstimatedAmountForPreauth": 7128.228861416082,
  "totalInterimApprovedAmountForPreauth": 9719.000418822541
}
```


#### Key Field Reference


| Field | Description |
| --- | --- |
| guid | Critical.The global unique identifier (UUID) for this preauth. |
| id | Internal ID for the preauth. |
| preauthType | The category of care requested (e.g., Surgical, Medical). |
| status | The current state of the request (e.g., SUBMITTED, FINALISED). |
| finalApprovedAmount | The total amount the Payer has agreed to cover. |
| totalEstimatedAmountForPreauth | The total cost projected by the Provider. |
| totalInterimApprovedAmountForPreauth | Interim approved amount during processing. |
| serviceStart/serviceEnd | ISO timestamps for the proposed medical service window. |
| lengthOfStay | Expected duration of stay for inpatient services. |
| clinicalIndications | Medical reasons justifying the request. |
| description | Additional description of the preauth request. |
| isElective/isEmergency | Indicates if the procedure is elective or an emergency. |
| isHmisPreauth | Indicates if the preauth originated from an HMIS. |
| beneficiaryDetails | Details of the patient (ID, Name, Scheme). |
| memberName | Name of the insured member. |
| payerName | Name of the insurance payer. |
| providerName | Name of the healthcare provider. |
| authorizationDetails | Links to the parent visit, including the consent token and interventions. |
| preauthItems | List of specific services or items requested. |
| preauthItems[].approvedAmount | Amount authorized by the Payer for the item. |
| preauthDiagnoses | Diagnoses associated with the preauth request. |
| preauthDoctors | Doctors involved in the service and their review status. |
| preauthAttachments | Supporting documents (e.g., MEDICAL_REPORT). |
| accessPoint | Point of access for the service. |
| anaesthesiaType | Type of anaesthesia required (if applicable). |

Last modified on
April 30, 2026
Understanding Claim Statuses
Understanding Preauth Statuses

---

## Start Visit Consent Process Overview

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitConsentProcessOverview](https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitConsentProcessOverview)

# Start Visit Consent Process Overview


## Start Visit Process Overview: Initiating a Valid Patient Encounter


### 1. Introduction: Understanding the Start Visit Process


This comprehensive guide provides a clear overview of how our system manages the initiation of a patient's visit at a healthcare facility. This process is crucial for establishing a valid patient encounter, ensuring all necessary information is captured from the beginning.


The Start Visit Process involves:


- Verifying beneficiary contact information.
- Obtaining explicit patient consent via a One-Time Password (OTP) or biometrics fingerprint match to confirm their presence and agreement to receive services.


This series of interconnected steps is designed to ensure a valid healthcare visit is formally initiated, serving as the foundation for all subsequent services a patient receives. It confirms the patient's physical presence for treatment and captures vital information, enabling the facility to accurately claim compensation from the Social Health Authority (SHA) for services provided. This critical process comes after the successful confirmation of a patient's eligibility for the necessary interventions.


#### 1.1. Why This Full Process Matters


An accurate Start Visit Process is important for creating a valid patient visit claim that complies with Social Health Authority (SHA) guidelines. It's not just a formality; it's fundamental for smooth operations and financial integrity. Its importance can be summarised as follows:


- **Validates Patient Presence**: Ensures that a patient has physically arrived at the healthcare facility and is actively seeking services, preventing fraudulent claims.
- **Secures Payment Claims**: With verified patient consent via OTP or biometrics, the healthcare facility gains a solid basis for accurately claiming payments from SHA for services rendered.
- **Confirms Patient & Guardian Contacts**: Verifies essential contact information, including phone numbers. For minors, it explicitly ensures the parent or guardian's contact information is accurately captured, vital for consent and communication.
- **Formalises Visit Initiation**: Allows the healthcare facility to formally commence a valid visit, gathering all preliminary information required by SHA for proper documentation and subsequent processes.
- **Ensures Compliance**: Guarantees that every patient encounter begins in adherence to national standards and regulatory requirements.


## 2. The Full Start Visit Process Journey: Step-by-Step Encounter Creation


The complete Start Visit Process is a multi-step journey, centred around ensuring a healthcare facility accurately initiates a valid visit with a patient. Each workflow builds upon the results of the previous one, creating a seamless and verified encounter.


Here are the key workflows in their sequential order:


### 2.1. Step 1: Get Beneficiary's Contact Workflow


This workflow's primary role is to retrieve and validate the contact information associated with a beneficiary. It confirms if the beneficiary is an active SHA member and possesses a valid phone number, which is essential for sending consent OTPs. For deceased beneficiaries, it displays next-of-kin contacts, and for minors, it provides parent/guardian contact details.


This workflow is crucial as it sets the stage by verifying that the patient is either a valid SHA beneficiary or linked to one, and that their contact information is accurate. This ensures that critical consent OTPs are sent to the correct individual (or that the correct beneficiary is presented for biometrics verification), enabling verifiable approvals.


### 2.2. Step 2: Send OTP / Get Biometrics Authorization


This step obtains the patient's explicit consent. There are two parallel paths depending on your facility's setup:


**OTP Path**


Generate and send a One-Time Password (OTP) to the beneficiary's validated contact number. The OTP verifies the patient's presence at the specific healthcare facility and their approval for seeking medical services. The OTP is then submitted as part of the Start Visit request in Step 3.


**Biometrics Path**


Call `POST /api/v1/claims/authorize` with biometrics-specific fields (including a `workstationID` from your Hardware Server and the biometrics agent's National ID). The system creates an authorization record in `PENDING` status and returns an iframe link. Render the iframe in your UI so the patient can place their finger on the connected device. On a successful fingerprint match, the authorization transitions from `PENDING` to `AUTHORIZED`. The `auth_guid` of that authorized record is then submitted in Step 3 instead of an OTP.


Both paths lead to the same outcome: a verified patient authorization that can be used to formally start the visit.


For end-to-end scenario walkthroughs, see:


- [Scenario 1: SHIF IP Per Diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)
- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Scenario 5: SHIF OP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-5-shif-op-ffs-normal-preauth)


### 2.3. Step 3: Start Visit Workflow


This is the concluding step where the actual visit claim is created in the system. It validates that all previously required information (the complete "payload," including a verified OTP or biometrics `auth_guid`) is present and correct. Upon successful creation, it responds with essential patient visit details and a `consent_token`.


This workflow is important as it officially marks the commencement of a patient's encounter with a health facility within our system. Successfully creating this visit's claim is foundational, leading directly to subsequent processes like detailed intervention recording and financial billing workflows.


## 3. How Workflows Connect


While each workflow in the Start Visit Process has a specific task, they are deeply interconnected. Data flows seamlessly from one step to the next:


- **Cascading Dependencies**: Each subsequent workflow critically depends on the successful completion and accurate output of the preceding steps. For example, the OTP path requires a valid phone number from the Get Beneficiary's Contact workflow; the biometrics path requires the workstation and agent details to be ready before calling the authorize endpoint.
- **Consistent Identifiers**: Patient identifiers are consistently used, ensuring that all checks and actions pertain to the correct individual.
- **Dynamic Rule Application**: Information gathered in earlier steps (e.g., beneficiary status, facility type) directly influences the rules applied in later stages, ensuring compliance and accurate visit initiation.


## 4. Key Success Factors for Overall Start Visit Integration


For your integration with the entire Start Visit Process to be successful and efficient, keep these overarching principles in mind:


- **Complete and Accurate Inputs**: Ensure the required patient and facility details are accurate. Incomplete or incorrect data will hamper the process.
- **Choose the Right Consent Path**: Determine whether your facility will use OTP-based or biometrics-based patient authorization. Both paths are supported; the biometrics path requires an active Hardware Server (fingerprint device) and a biometrics agent National ID. Ensure your integration handles both success and failure scenarios for whichever path you use.
- **Design for All Outcomes**: Be prepared to handle all possible responses from our workflows (e.g., "Beneficiary's Contacts Not Found," "OTP Not Verified," "Biometrics Authorization Pending/Failed," "Visit Creation Error"). Design your system to clearly communicate these outcomes to end-users.


By understanding and adhering to these principles, you can ensure a smooth, accurate, and effective integration with the Start Visit Process, ultimately contributing to successful patient encounters and compliant claims with SHA.

Last modified on
April 30, 2026
Eligibility Check
Start Visit

---

## Start Visit Process Guide: Start Visit Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitWorkflow](https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitWorkflow)

# Start Visit Process Guide: Start Visit Workflow


## Start Visit Consent Process Guide: Start Visit Workflow


### 1. Overview: Initiating the Patient Visit and Confirming Consent


This guide details the Start Visit Workflow, the final and crucial step in the overall Start Visit Process. This integrated workflow is responsible for two primary actions: securely verifying patient consent using an OTP, and then officially initiating the patient's visit within a healthcare facility.


It brings together all prior validations, checks and the patient's explicit authorisation to formally record the start of a patient encounter.


#### 1.1. What This Workflow Does


The Start Visit Workflow completes the patient journey by confirming consent and registering the visit. It involves:


- **Receiving All Visit-Related Inputs**: It takes patient identifiers, the One-Time Password (OTP) provided by the patient or beneficiary, the type of service being offered, and the planned interventions.
- **OTP Verification**: It validates the patient's OTP by linking it to the previously initiated consent request.
- **Confirming Patient Consent & Authorisation**: Upon successful OTP verification, the system confirms the patient's authorisation and provides a unique `token`. This token is critical for all subsequent actions related to this visit.
- **Formal Visit Initiation**: Using the confirmed consent and all gathered visit details, the system officially records the patient's visit, creating a formal claim. This typically involves updating internal records and possibly interacting with SHA's visit-related services.
- **Providing Final Status**: It communicates whether the visit was successfully started and provides the `token` for future use.


#### 1.2. Why This Workflow Is Critical


This workflow is vital because it is the point of formal patient encounter registration and final consent confirmation. Its criticality stems from:


- **Official Visit Claim**: It creates the official claim for the patient's visit in the system, enabling subsequent billing, clinical documentation, and data exchange.
- **Legal & Ethical Compliance**: By integrating OTP verification, it ensures that the visit is initiated only with the patient's explicit and verifiable consent, adhering to data privacy regulations and ethical healthcare practices.
- **Enabling Subsequent Actions**: The `token` generated upon successful creation of a visit is the key to unlocking actions requiring some authorisation, such as submitting claims. Without this token, critical follow-up processes for the visit cannot proceed.
- **Completing the Patient Journey**: It marks the successful conclusion of the "Start Visit Consent Process," transitioning the patient to an active encounter.


This workflow formalises the healthcare encounter with explicit consent and provides the necessary authorisation for comprehensive care delivery while meeting compliance with SHA.


## 2. Workflow Details: Start Visit Process


This section details the complete process for initiating a patient's visit, including the integrated OTP verification.


### 2.1. Step-by-Step System Behavior


The visit can be initiated via two consent paths. Both paths lead to a formally registered visit claim.


#### OTP Path


1. Input Reception
The system receives all necessary inputs to start a visit, including the service type, beneficiary CR ID, the one-time password (OTP) provided by the patient, the optional beneficiary contact ID (if a specific contact was chosen for the OTP), and an array of interventions.
2. Internal Data Lookup & Consent Reference Retrieval
Using the beneficiary CR ID, the system retrieves the patient's details. It also identifies and retrieves the unique consent request ID that was generated when the OTP was initially sent. This consent request ID is essential for validating the OTP.
3. OTP Verification
The system validates the OTP using the consent request ID and the OTP entered by the patient. It checks whether the OTP matches the one sent for that specific request and verifies that it is still valid (i.e., not expired or already used).
4. Confirm Consent & Obtain Authorisation Token
Upon successful validation of the OTP, the patient's consent is confirmed, and an authorisation token is provided along with its expiration details. This authorisation token serves as proof of the patient's active consent for this visit and related interactions. If OTP verification fails at this point due to an incorrect OTP or an expired OTP, the workflow stops, and the failure is reported.
5. Formal Visit Initiation
After successful OTP verification and receipt of the authorisation token, the system proceeds to formally initiate the visit. It compiles all visit details: beneficiary CR ID, service type, interventions, and the newly acquired authorisation token. The system then creates the official visit claim, linking it to the patient and the services to be rendered.


#### Biometrics Path


1. **Call the Authorize Endpoint**
Before starting the visit, call `POST /api/v1/claims/authorize` with biometrics-specific fields:


- `workstationID`: obtained from your Hardware Server `/status` endpoint (e.g. `https://localhost:18065/status`)
- Biometrics agent National ID and other required authorization fields


See the [Authorize (Biometrics/OTP) API Reference](https://hie-docs.dha.go.ke/eclaims) for the full request schema.


1. Receive PENDING Authorization
The system creates an authorization record in PENDING status. The response includes an iframe link to the fingerprint capture UI.
2. Render the Iframe in Your UI
Display the iframe to the patient-facing screen. The iframe shows the patient's enrolled fingerprints and a Start button. The patient places their finger on the connected biometrics device.
3. Fingerprint Capture and Match
The device captures and matches the fingerprint against the enrolled template. On a successful match, the authorization record transitions automatically from PENDING to AUTHORIZED.
4. Formal Visit Initiation with auth_guid
Call POST /api/v1/claims/visit and include auth_guid (the GUID of the now-AUTHORIZED authorization) instead of the otp field. The system validates the authorization status and creates the official visit claim.


See the [Create Claim / Start Visit API Reference](https://hie-docs.dha.go.ke/eclaims) for the full request schema.


### 2.2. Key Validations


These are essential checks performed throughout this workflow to ensure a successful and compliant visit initiation:


1. Valid Patient Identification (beneficiary_cr_id): The provided beneficiary_cr_id must be a legitimate, active identifier in the Client Registry. This identifier is crucial, as it serves as the core identifier for the patient and is necessary for all subsequent data lookups and SHA interactions.
2. Valid Service Type: The service_type must be one of the predefined acceptable types: INPATIENT, OUTPATIENT, CAPITATION, or EMERGENCY. This classification ensures that the visit is categorised accurately and that the correct rules apply.
3. Valid and Current OTP: The one-time password (OTP) provided by the patient must be accurate, correspond to an active consent_request_id, and not be expired. This step is vital as it serves as direct proof of patient consent and is a fundamental security requirement.
4. Valid Interventions: The interventions array must contain valid and recognised intervention codes that are applicable to the service_type. This ensures that the requested services are correctly documented and can be tracked and billed appropriately.
5. Successful OTP Verification by SHA: SHA's validation service must confirm that the OTP is correct and issue an authorisation token. Without this step, patient consent is not officially confirmed, and the visit cannot be formally initiated with SHA.
6. Successful Visit Creation/Registration: The system must successfully create the visitʼs claim and/or confirm its registration with SHA. This step is the ultimate goal of the workflow, marking the official commencement of the patientʼs encounter.


### 2.3. Workflow Data Dictionary (Conceptual)


This table outlines the key information used and produced by this workflow:


| Field Name | Description | Options | Required | Purpose |
| --- | --- | --- | --- | --- |
| service_type | The category of service being offered for the visit. | INPATIENT, OUTPATIENT, CAPITATION, EMERGENCY | Yes | Defines the type of patient encounter, impacting facility operations, billing, and clinical pathways. |
| beneficiary_cr_id | The patient's unique Client Registry ID. |  | Yes | The core identifier links the visit to the specific patient. Used to retrieve necessary details and manage consent. |
| otp | The numerical One-Time Password provided by the patient. |  | Required for OTP path | Patient's explicit verification of consent. It must match the OTP sent earlier for the current consent request. Not used whenauth_guidis provided. |
| auth_guid | The GUID of an AUTHORIZED biometrics authorization. |  | Required for biometrics path | Used instead ofotpwhen the patient has consented via fingerprint biometrics. The referenced authorization must be in AUTHORIZED status. |
| beneficiary_contact_id | An optional identifier for a specific patient contact if they have multiple. |  | No | Allows targeting a specific contact if the patient has multiple, ensuring the OTP is linked to the correct consent request context. |
| interventions | An array of codes representing the chosen services or procedures to be performed during this visit. |  | Yes | Details the specific medical/healthcare actions for which the visit is being initiated, essential for planning, resource allocation, and clinical documentation. |


### Understanding 'consent_token'


> **Important:** The `token` returned in the authorization object (for biometrics flow) or within this workflow response should be used as the `consent_token` parameter in subsequent API calls.


### 2.6. Expected Outcomes


The outcomes for the Start Visit Workflow reflect the final status of the visit initiation process.


**Success: Visit Initiated & Consent Granted:**


- All inputs were valid, the OTP was successfully verified by SHA (or the biometrics authorization was AUTHORIZED), and the patient's visit was formally recorded. A valid `token` is issued. With this, the patient's visit has officially begun. The `token` should be securely stored and used for all subsequent authenticated interactions with SHA related to this visit.


**Failure: Invalid Input Data:**


- One or more of the initial inputs (beneficiary_cr_id, service_type, interventions, or beneficiary_contact_id) were invalid, missing, or malformed. The visit cannot be initiated. The system should log the specific input error, and the user interface should prompt staff to correct the invalid data.


**Failure: OTP Verification Failed:**


- The OTP provided by the patient was incorrect, or the OTP/consent request had expired before verification could be completed. In this case, patient consent could not be verified. The visit cannot proceed. The user might need to re-enter the OTP or, if expired, start a new consent process from the "Send OTP" phase.


## 3. Critical Success Factors for Start Visit Integration


For your integration with the Start Visit Workflow to be successful and reliable, keep these key points firmly in mind:


- **Accurate Data Flow from Preceding Workflows**: Ensure that validated patient identifiers (beneficiary_cr_id, beneficiary_contact_id) and the consent_request_id are correctly carried forward and available as inputs to this workflow.
- **OTP Handling**: Implement a user-friendly mechanism for patients to input the OTP. Ensure proper error handling for incorrect or expired OTPs.
- **Secure Authorisation Token Management**: Upon successful visit initiation, securely store the `token` and its expiry details. This token is crucial for all subsequent authorised interactions with SHA.
- **Comprehensive Input Validation**: Validate all incoming parameters (service_type, beneficiary_cr_id, otp, interventions) thoroughly before attempting to process the visit. This minimises errors and ensures data integrity.
- **Clear Error Messaging & Recovery**: Be prepared to handle all documented failure scenarios from both the OTP verification.

Last modified on
April 30, 2026
Start Visit Consent Process Overview
Intervention Process Overview

---

## Eligibility Process

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/eligibility/eligibilityProcessOverview](https://hie-docs.dha.go.ke/docs/claims/process/eligibility/eligibilityProcessOverview)

# Eligibility Process


## Eligibility Process


### Understanding the Eligibility Process


#### 1. Introduction


The Eligibility Process is a multi-step journey aimed at determining exactly which healthcare services and interventions a patient is eligible for. This comprehensive guide offers a high-level overview of how these specific healthcare services, benefits, and treatments to which a patient is entitled are determined.


The Eligibility Process is a series of interconnected steps designed to ensure that the right patient receives the right care, at the right facility, and that this care is properly covered according to the rules set by the Social Health Authority (SHA). It's about moving from simply identifying a patient to confirming their precise healthcare entitlements.


##### 1.1. Why This Full Process Matters


An accurate Eligibility Process is key to efficient, fair, and compliant healthcare delivery. It is crucial because it:


- **Ensures Fair Access:** Guarantees that patients receive services aligned with their entitlements and contributions.
- **Prevents Financial Surprises:** Provides clarity to patients and providers upfront, avoiding unexpected costs and disputes at the health care facility.
- **Protects the various Health Funds:** Safeguards the financial sustainability of the Social Health Authority and its constituent funds by ensuring proper claims and preventing unauthorised services.
- **Promotes Compliance:** Adheres strictly to national healthcare regulations and policies.
- **Streamlines Care Delivery:** Equips healthcare providers with immediate, accurate information, enabling quicker and more informed treatment decisions.
- **Maintains Data Integrity:** Creates a reliable, single source of truth for patient eligibility, reducing errors and duplication.


---


### 2. The Eligibility Journey: Step-by-Step Process


The complete Eligibility Process is a multi-step journey, with a number of workflows, each building up to the next. Here are the key workflows:


#### 2.1. Step 1: Patient Search


This is the foundational first step. It's all about accurately identifying the patient. Our system looks up a patientʼs details from a central database for patient identities using unique identifiers (like National Identity Number) to retrieve the patient's verified information.


This is important as, without having accurate data on the patient, all subsequent checks are impossible or unreliable. It ensures we're building the entire eligibility determination on the correct individual's foundation.


#### 2.2. Step 2: Benefits Coverage


Once the patient is identified, this workflow determines what general healthcare service categories (known as "sub-benefits") the patient is entitled to receive in a specific healthcare facility. It cross-references the patient's details with the details of the specific health facility.


This step is important as it establishes the scope of services the patient can access. It confirms which types of care this patient is eligible for at a facility.


#### 2.3. Step 3: Intervention Coverage


Building on the general sub-benefits, this workflow refines the eligibility further to pinpoint the exact healthcare interventions (specific medical procedures) a patient is eligible to receive. It applies the Social Health Authority's (SHA) detailed rules, considering the patient's eligibility and the specific facility's licensed capabilities and contractual agreements with SHA for those interventions.


This is important as it is the level of detail needed for actual clinical decisions and accurate billing. It informs on what specific treatments can a patient receive at a facility. It prevents unauthorised procedures and ensures accurate tariff enforcement.


#### 2.4. Step 4: Contribution Status


This workflow performs a financial health check of the patient's coverage. It verifies their current payment standing with the Social Health Authority (SHA) and assesses their status within any special schemes like the Public Office Medical Fund (PMF) for civil servants. It determines if their contributions are up-to-date and if they qualify for services based on their financial compliance.


It is important as it ensures that certain services are only provided to those who are current with their payments, safeguarding the fund and preventing financial loss for providers.


![Eligibility Workflow Diagram](https://hie-docs.dha.go.ke/assets/EligibilityProcess-DGVkPjhI.png)


---


### 3. How Workflows Connect


While each workflow has a specific job, they are deeply interconnected. Data flows seamlessly from one step to the next, with crucial cross-workflow validations ensuring integrity:


- **Single Source of Truth:** Core patient data is always sourced from a central database via Patient Search, ensuring a consistent patient data across all subsequent checks. Similarly, facility data is validated against a central Facility Registry database.
- **Cascading Dependencies:** Each subsequent workflow depends on the successful completion and accurate output of the preceding steps. For example, if a patient cannot be found, no further eligibility checks can proceed.
- **Consistent Identifiers:** The patient and facility identifiers must be consistently passed and remain valid across all relevant workflows to ensure that all checks are performed for the correct individual and facility visited.
- **Dynamic Rule Application:** Information gathered from earlier workflows, like patient details, facility details, and contribution status, dynamically informs the SHA rules applied in later stages to determine precise eligibility.


---


### 4. Key Success Factors for Overall Eligibility Integration


For your integration with the entire Eligibility Process to be successful and efficient:


- **Accurate Patient Identification:** Ensure accurate patient details are obtained from a successful Patient Search. This is the foundation of the entire process.
- **Validate Facility Data:** Consistently provide correct and verified facility identifiers, as facility capabilities and contracts are central to benefits and interventions.
- **Understand Interdependencies:** Recognise that errors or missing data in an earlier workflow will inevitably cascade and cause failures or incorrect outcomes in later steps.
- **Understand SHA Rules:** Having a minimal understanding of how patient status, facility type, and contribution status influence eligibility will help you interpret results and troubleshoot effectively.
- **Design for All Outcomes:** Be prepared to handle all possible responses from our workflows (e.g., "Patient Not Found," "No Benefits Found," "Not Eligible Due to Contribution," "Input Error") and design your system to clearly communicate these to end-users.


---


## 5. Related Resources


See how the eligibility process fits into end-to-end integration flows:


- [Scenario 1: SHIF IP Per Diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)
- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Scenario 3: SHIF IP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)
- [Scenario 4: SHIF OP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth)
- [Scenario 5: SHIF OP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-5-shif-op-ffs-normal-preauth)
- [Scenario 6: UHC OP Capitation](https://hie-docs.dha.go.ke/docs/scenarios/scenario-6-uhc-op-capitation)
- [HIE Registries API Reference](https://hie-docs.dha.go.ke/registries)

Last modified on
April 30, 2026
Introduction
Benefits Coverage

---

## Eligibility Check Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/eligibility/eligibilityCheck](https://hie-docs.dha.go.ke/docs/claims/process/eligibility/eligibilityCheck)

# Eligibility Check Workflow Guide


## Eligibility Process: Eligibility Check Workflow


### 1. Overview: Patient Eligibility Check


This guide provides information on the **Eligibility Check Workflow**, a core workflow within the Eligibility Process. It helps to provide a one-stop solution to immediately determining a patient's current healthcare coverage status and entitlements under the Social Health Authority (SHA).


This workflow combines essential identity verification and coverage status checks to provide information on whether a specific patient is currently covered by SHA on what services and the coverage validity period. It returns a clear status of their coverage and the fundamental details of their entitlement.


#### 1.1. What This Workflow Does


The Eligibility Check Workflow performs two critical functions:


- **Patient Identification:** Accurately identifies the patient using their provided identifier (e.g., National ID) against the central **Client Registry**.
- **Contribution Status Verification:** Immediately verifies the patient's coverage status under SHA and validity period for this coverage.


The primary outcome is the patient's **SHA coverage status** and key details of their enrollment and coverage. This is the simplest, fastest way to confirm a patient's eligibility to receive services.


#### 1.2. Why This Workflow Is Critical


- **Instant Verification:** Provides an instant way to check a patient's coverage status in one place.
- **Billing Assurance:** Offers a preliminary confirmation of SHA coverage, reducing financial risk for healthcare providers.
- **Service Triage:** Enables providers to quickly determine the appropriate funding scheme for a patient (e.g., UHC, PMF) and any subsequent services they can access.


---


### 2. Workflow Details: Eligibility Check


#### 2.1. Workflow Description


This workflow is simpler and more direct than the full multi-step eligibility process, focusing only on identification and key contribution standing information with SHA.


1. **Input Reception:** The system receives the patient's identification details. This involved the type of identifier being used and it's value e.g. `National ID` and the ID number.
2. **Patient Search & Validation:** The system queries the Client Registry to verify the existence and identity of the patient, converting the input identifier into a verified **Client Registry ID (CR ID)**.
3. **Contribution Status Check:** The system checks the patient's CR ID and gets the SHA coverage to determine their active contribution status.
4. **Outcome Delivery:** The system returns the official SHA coverage status and related entitlement details.


#### 2.2. Key Validations: System Checks


| Validation Check | Description | Why It Matters |
| --- | --- | --- |
| Valid Identification Type: | Theid_type(e.g.,National ID,Birth Certificate) must be a supported type recognized by the Client Registry. Refer to the types fromPatient Search docs | Ensures the system attempts to search using a known, queryable format. |
| Valid Identification Value: | Theid_valuemust be present and correctly formatted (e.g., a specific length or alphanumeric pattern). | Critical for accurately locating the patient in the Client Registry. |
| Patient Must Be Found: | The system must successfully match the provided ID to an active patient profile in the Client Registry to retrieve the CR ID. | Without a verified identity (CR ID), no coverage check can be performed. |


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| Identification Type | The type of identifier being used (Options includeTemporary ID,Alien ID,Refugee ID,Mandate Number,Birth Certificate,National ID,Birth Notification). | String | Yes | Tells the system which index to search for the patient. |
| Identification Value | The specific value of the patient's identifier (e.g., "12345678"). | String | Yes | The actual search query to locate the patient. |


#### 2.4. Expected Outcomes


| Outcome | Description |
| --- | --- |
| Eligible / Active Coverage: | The patient is successfully identified and their contribution status is confirmed as active and compliant with SHA. Coverage details are returned. |
| Ineligible / Not Active: | The patient is identified, but their contribution status is not compliant, or their coverage has lapsed. |
| Patient Not Found: | The providedid_typeandid_valuedid not match any entry in the Client Registry. |
| Input Error: | Missing or invalid required fields (e.g., missingid_valueor invalidid_type). |


---


### 3. Critical Success Factors for Integration


- **Accurate ID Input:** Ensure user-provided ID types and values are validated on your end before being passed to this API. Junk data in means failure out.
- **Handle All Outcomes:** Design your user interface to clearly distinguish between **"Patient Not Found"** (identity issue) and **"Ineligible"** (financial/status issue), as they require different responses from the facility staff.
- **Audit Compliance:** Always ensure that the `Facility Identifier` and `Facility Identifier Type` are correctly passed for every request, as this ensures all checks are properly audited for security and compliance.


---

Last modified on
April 30, 2026
Interventions Coverage
Start Visit Consent Process Overview

---

## Eligibility Process Guide: Benefits Coverage Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/eligibility/benefitsCoverage](https://hie-docs.dha.go.ke/docs/claims/process/eligibility/benefitsCoverage)

# Eligibility Process Guide: Benefits Coverage Workflow


## Eligibility Process Guide: Benefits Coverage Workflow


### 1. Overview: Understanding Patient Entitlements


This guide outlines the Benefits Coverage workflow, an essential part of the Eligibility Process. Once a patient has been accurately identified through the Patient Search workflow, this stage determines the specific healthcare services and interventions they are entitled to receive. This determination is based on the patient's biodata, their contributions to the Social Health Authority (SHA), whether they are a civil servant, and the facility they visited. All of this information is cross-checked against the rules established by SHA.


#### 1.1. What This Workflow Does


The Benefits Coverage workflow dynamically cross-checks information on the patient and facility versus the eligibility rules and then retrieves the specific sub-benefits a patient is eligible for. It does this by taking several key pieces of information:


- **Patient Details:** Crucial information like their age, gender, and especially their contribution status with SHA.
- **Facility Details:** Information about the healthcare facility where the service is to be provided, such as its ownership (e.g., public, private), its KEPH level, licensure, and SHA contract status.


The system applies a set of rules from the SHA benefit matrix - essentially a rulebook that dictates which services are covered under various patient and facility conditions.


#### 1.2. Why This Workflow Is Critical


- **Risk of Uncovered Services:** Prevents patients from incurring unexpected costs.
- **Financial Loss for Providers:** Avoids services for which facilities won't be reimbursed.
- **Regulatory Non-Compliance:** Ensures adherence to SHA policies.
- **Improved Patient Experience:** Patients know what they are entitled to upfront.


---


### 2. Benefit Matrix Overview


#### 2.1. Overall Benefit Structure


![Benefits Structure Diagram](https://hie-docs.dha.go.ke/assets/BenefitStructure-BeXg6_x0.png)


- **Packages:** Highest level, e.g., inpatient/outpatient.
- **Sub-packages:** Breakdown by common characteristics, e.g., emergency services.
- **Interventions:** Specific healthcare services, each with limits and tariffs.


#### 2.2. Funds


- **Primary Healthcare Fund (PHC):** Covers outpatient services at lower-level facilities, funded by government and grants.
- **Social Health Insurance Fund (SHIF):** For contributing members, available at hospital level 3 and above.
- **Emergency Chronic Critical Illness Fund (ECCIF):** For emergency, critical, chronic, and palliative care.


#### 2.3. Schemes


- **UHC (Universal Healthcare Coverage):** For all citizens using PHC and SHIF.
- **PMF (Public Medical Officer Fund):** For civil servants, extended coverage.


#### 2.4. Payment Mechanisms


- **Capitation:** For PHC, based on patient numbers at facilities.
- **Per Diem:** Daily payments, e.g., ICU care.
- **Fee for Service:** SHA pays full fee if tariff is met.
- **Fixed Fee for Service:** SHA pays fixed fee; patient covers the rest.
- **Case-Based:** Depends on treatment scenario; e.g., cesarean after failed normal delivery.


> ECCIF and SHIF use all payment mechanisms *except* capitation.


---


### 3. Workflow Details: Benefits Coverage


#### 3.1. Workflow Description


1. **Input Reception:** Takes Client Registry ID (CR ID), facility ID and optionally service type.
2. **Internal Data Retrieval:** Fetches full patient profile and facility details.
3. **Rule Application:** Applies SHA benefit matrix:

Patient vs benefit categories.
Facility vs licensed services.
4. **Sub-Benefit Determination:** System compiles eligible sub-benefits.
5. **Outcome Delivery:** Returns the list.


#### 3.2. Key Validations


- **Valid Facility ID & Type:** Must be known and accurate.
- **CR ID is Mandatory:** Identifies the patient and their eligibility.
- **Facility ID Type Must Be Recognised:** e.g., `fr-code`, `registration-number`.
- **Valid Age and Gender:** Needed for SHA age- and gender-based rules.
- **CR Only Source for Patient Data:** Ensures single source of truth.
- **Facility Must Meet SHA Criteria:** Includes KEPH level, ownership, contract status.


#### 3.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| Beneficiary Client Registry ID | Unique patient identifier from Patient Search | String | Yes | Used to retrieve profile and apply rules |
| Facility Identifier | Unique ID for health facility | String | Yes | Required to determine eligible services |
| Facility Identifier Type | e.g.,fr-code,registration-number | String | Yes | Helps system interpret facility ID |
| Service Type | e.g.,INPATIENT,OUTPATIENT | String | Yes | Context for the check |
| Sub-Benefit Code | Optional code for a specific benefit | String | No | If specified, limits search to one item |


#### 3.4. Expected Outcomes


- **Successful Retrieval of Benefits:** Patient is eligible, list of sub-benefits returned.
- **No Benefits Found:** Valid patient/facility but no matched sub-benefits.
- **Input Error:** Invalid or missing data prevented execution.


---


### 4. Critical Success Factors for Benefits Coverage Integration


- **Keep IDs Updated:** Use the latest `beneficiary_cr_id`, `facility_id`, and `facility_id_type`.
- **Understand SHA Rules:** Know how demographics and facility affect results.
- **Handle “No Benefits Found” Gracefully:** Design for fallback messaging or user alerts.

Last modified on
April 30, 2026
Eligibility Process Overview
Interventions Coverage

---

## Eligibility Process Guide: Intervention Coverage Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/eligibility/interventionsCoverage](https://hie-docs.dha.go.ke/docs/claims/process/eligibility/interventionsCoverage)

# Eligibility Process Guide: Intervention Coverage Workflow


## 1. Overview: Determining Specific Services


This guide focuses on the Intervention Coverage workflow, an important stage within the broader Eligibility Process. Building upon the patient identification and general sub-benefits determination, this workflow's primary role is to pinpoint the exact, granular healthcare interventions (e.g., specific medical procedures, medications, or diagnostic tests) a patient is eligible to receive at a particular health facility.


### 1.1. What This Workflow Does


The Intervention Coverage workflow retrieves a list of precise healthcare interventions available to a patient. It achieves this by combining:


- **Verified Patient Details**: The patient's comprehensive profile from the Client Registry, linked via their CR ID.
- **Specific Facility Details**: In-depth information about the health facility where the intervention would occur.
- **Benefits coverage**: A list of sub-benefits that the specific patient is eligible for.


Our system then applies the rules established by the Social Health Authority (SHA). These rules determine which interventions are covered based on the patient's eligibility (from previous workflows) and the facility's licensed capacity and contractual agreements with SHA.


### 1.2. Why This Workflow Is Critical


This workflow is paramount for precise and compliant healthcare delivery, preventing misinterpretations of general benefits. Its importance lies in:


- **Preventing Unauthorised Services**: Ensures that patients only receive interventions that are specifically covered and permissible for a given facility, avoiding non-compliance and potential fraud.
- **Accurate Costing and Claims**: Provides the exact codes for covered interventions, which are vital for accurate billing, claims submission, and financial reconciliation.
- **Accurate tariff allocation**: Given that tariffs are tied to the interventions, providing the right interventions ensures that the correct tariffs for the interventions are used.
- **Optimising Patient Journey**: Allows healthcare providers to immediately know what specific treatments they can offer, streamlining the patient's pathway and reducing administrative delays.
- **Resource Allocation**: Helps facilities manage their services efficiently by knowing what interventions are eligible for coverage through SHA.


In essence, this workflow moves from general "sub-benefits" to specific "interventions," acting as the final gate to confirm what can truly be performed and covered by SHA.


## 2. Workflow Details: Intervention Coverage


### 2.1. Workflow Description


![Intervention Flow Diagram](https://hie-docs.dha.go.ke/assets/InterventionProcess-B1fd3x3P.png)


When a request for intervention coverage is received, our system executes an internal sequence:


1. Input Reception: The system receives the patient's unique Client Registry ID and the specific identification details for the health facility. It may also receive a broad service_type (e.g., "INPATIENT") or an optional sub_benefit_code if a more detailed check is needed.
2. Dependent Data Retrieval: Our system first ensures that comprehensive patient details are available (using the Client Registry ID) and then retrieves the complete profile of the specified facility (including its KEPH level, ownership, and contracted status). This relies on successful outcomes from previous workflows like Patient Search and facility data validation.
3. Rule Application (SHA Intervention Matrix): The system performs a multi-layered evaluation:


- It considers the patient's overall eligibility and specific sub-benefits determined in previous steps.
- It cross-references this with the facility's capabilities and its contractual agreements with SHA for specific interventions.
- It applies the Social Health Authority's detailed rules for benefits coverage, which might vary based on patient demographics, facility details and the services requested.


1. Intervention Determination: Based on the application of these rules, and the selected sub-benefit from the previous workflow, the system compiles a list of individual, covered interventions (e.g., "Appendectomy," "Malaria Test," "Specific Drug Prescription Code") that the patient is eligible for at that exact facility.
2. Outcome Delivery: The determined list of eligible interventions is prepared for use by the integrating system.


### 2.2. Key Validations: Our System's Essential Checks


These are the critical validations our internal system performs to ensure an accurate and successful intervention coverage determination. Understanding why these are in place helps you provide the correct information from your end.


**Valid Facility Information (ID and Type) Must Be Provided:**


- The system requires both a correct facility_id (the unique identifier for the health facility) and its facility_id_type (e.g., fr-code, registration-number).
- This is important as interventions are highly dependent on the facility's capabilities and authorisations. Our system needs precise facility identification to apply the correct rules about what specific procedures, tests, or treatments it is licensed and contracted to provide under SHA. Inaccurate facility data will lead to incorrect intervention lists.


**Beneficiary Client Registry ID (CR ID) Is Mandatory:**


- The patient's beneficiary_cr_id, obtained from the Patient Search workflow, must be provided.
- This ID is important as it is the primary link to the patient's full medical and eligibility profile. Without it, the system cannot access the patient's entitlements and apply the granular rules for specific interventions.


**Facility ID Type Must Be a Valid Option:**


- The facility_id_type must be one of the supported types recognised by our Facility Registry (e.g., fr-code, registration-number, fid).
- This is essential as it ensures the system correctly interprets and queries the Facility Registry for essential details needed to determine facility-specific intervention eligibility.


**Patient Must Have a Valid Age and Gender:**


- The patient's details retrieved via their CR ID must include a specified and valid age and gender.
- This is important as many interventions have age- or gender-specific eligibility criteria defined by SHA. For example, certain screenings are only for specific age groups. Missing or invalid demographic data will prevent accurate rule application for interventions.


**Patient Records Fetched from CR only (not locally):**


- The patient's data should only be from the Client Registry (CR) and not from any local database.
- This is important as it ensures that the Client Registry remains the ultimate "single source of truth" for patient biodata. It guarantees that our system always uses the most accurate and up-to-date patient information for benefit determination.


**Facility Must Meet SHA Criteria (KEPH, Ownership, Contracted):**


- The retrieved facility details must explicitly define its Kenya Essential Package for Health (KEPH) level, clearly indicate its ownership (e.g., government, private, faith-based), and confirm that it is formally contracted by SHA to offer services. These are essential in validating that the facility is allowed to offer services and be paid by SHA.
- These three attributes are absolutely important for applying SHA's rules. The KEPH level defines the scope of services a facility is equipped for, ownership can influence certain benefits, and being "contracted" confirms its legal standing to provide SHA-covered services. Without these, the system cannot accurately determine what interventions are valid at that specific location.


### 2.3. Workflow Data Dictionary


This helps show you the information we work with, whether it is required or not and in what format the system expects it in.


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| Beneficiary Client Registry ID | The patient's unique identifier was obtained from a successful Patient Search. | String | Yes | This is the patient's identity key. It ensures we are determining interventions for the correct individual and can access their full eligibility profile established in prior steps. |
| Facility Identifier | The unique identification number for the health facility where services are being considered. | String | Yes | This identifies the specific facility for the intervention. The facility's capabilities and SHA contracts are directly linked to this ID, fundamentally impacting which interventions are deemed eligible at that site. |
| Facility Identifier Type | The category or type of the Facility Identifier (e.g., fr-code, registration-number). | String | Yes | This tells our system how to interpret the Facility Identifier, allowing it to correctly query our Facility Registry and retrieve essential details needed for granular intervention determination. |
| Service Type | The broad classification of the healthcare service being considered (e.g., INPATIENT, OUTPATIENT). | String | Yes | This provides a broad context for the intervention check. While interventions are specific, their eligibility can still be influenced by whether they occur during an inpatient stay, an outpatient visit, or an emergency, guiding the application of certain SHA rules. |
| Sub-Benefit Code | (Optional) A specific code for a sub-benefit (e.g., "Dental Care"). If provided, the system will narrow its intervention search to within this sub-benefit. | String | No | This field allows for a more focused query. If you know the general sub-benefit category of the intervention you're looking for, providing this code can help the system return a more relevant and streamlined list of specific interventions, making the output more manageable. |


### 2.4. Expected Outcomes


- **Successful Retrieval of Interventions**: The system successfully identifies and returns a list of specific interventions (e.g., procedure codes, medication codes) that the patient is eligible to access at the given health facility, according to SHA rules and the facility's scope.
- **No Interventions Found**: The system indicates that, while the patient and facility are valid, no specific interventions could be found for the given criteria (e.g., the patient not covered for any service at that specific facility's level, or the requested service type has no corresponding interventions).
- **Input Error**: The system identifies that the provided input (patient ID, facility ID, etc.) did not meet our validation rules, preventing the intervention check from executing properly.


## 3. Critical Success Factors for Intervention Coverage Integration


For your integration with the Intervention Coverage workflow to be successful, keep these key points in mind:


- **Accurate Input from Previous Steps**: Ensure the beneficiary_cr_id and facility_id you're providing are correct and consistently validated from the Patient Search and Facility Registry, respectively. Errors in upstream data will cascade.
- **Understanding SHA Rules for Interventions**: While our system applies the complex rules, a conceptual grasp of how patient status and facility type influence specific intervention eligibility will aid in interpreting results and troubleshooting.
- **Handling "No Interventions Found" Scenarios**: Be prepared for situations where, even if a patient is generally eligible, no specific interventions are covered at a given facility or for a given service type. Design your system to clearly communicate such outcomes to end-users.

Last modified on
April 30, 2026
Benefits Coverage
Eligibility Check

---

## Preauths Process Overview: Obtaining Prior Authorisation for Healthcare Services

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/preauthsProcessOverview](https://hie-docs.dha.go.ke/docs/claims/process/preauths/preauthsProcessOverview)

# Preauths Process Overview: Obtaining Prior Authorisation for Healthcare Services


## 1. Introduction: Understanding Pre-Authorisation


Welcome to the Preauths Process! This comprehensive guide provides a high-level overview of how our system facilitates the important step of obtaining prior authorisation for specific healthcare services.


Pre-authorisation is a key requirement for certain medical interventions, ensuring that the Social Health Authority (SHA) reviews and approves payment for a service before it is rendered to a patient.


The Preauthorisation Process is a series of workflows designed to facilitate the submission, review, and approval of requests for specialised or high-cost healthcare services. It involves submitting detailed medical information to the SHA for their assessment and decision, ultimately determining whether a patient's planned treatment will be covered.


### 1.1. Why This Full Process Matters


An accurate and thorough Pre-Auth process helps ensure financial coverage, compliance, and appropriate utilisation of healthcare services. It is crucial because it:


- Ensures Financial Coverage: Guarantees that high-cost, specialised, or planned interventions receive prior approval from SHA, providing financial assurance for both the patient and the healthcare facility.
- Prevents Claim Rejections: By obtaining pre-authorisation upfront, it significantly reduces the likelihood of claims being rejected by SHA due to a lack of prior approval, protecting the facility's revenue.
- Efficient use of medical funds: SHA's review process helps ensure that services are medically necessary and appropriate, contributing to the efficient use of healthcare funds and preventing unnecessary expenditures.
- Promotes Clinical Compliance: The requirement for detailed clinical information and the doctor's consent facilitates a review of the medical necessity of the proposed intervention, enhancing the quality of care.
- Streamlines Service Delivery: With pre-authorisation in place, facilities can proceed with planned treatments with confidence, minimising administrative delays and patient uncertainty regarding coverage.


---


## 2. The Preauths Process Journey: Step-by-Step Authorisation


The complete Preauths Process is a multi-step process, involving various types of requests and specialised forms. Each workflow within this process is designed to handle different scenarios for obtaining SHA approval.


Here are the key types of preauthorization requests and the associated workflows:


### 2.1. Step 1: Normal Preauths


This workflow handles the submission of a standard general preauthorization request for a single intervention or a set of related interventions that require prior approval from SHA.


It's the most common pathway for obtaining approval for a wide range of services, ensuring compliance with routine pre-authorised care.


### 2.2. Step 2: Elective Preauthorization


This workflow manages the submission of preauthorization requests for elective procedures, which are planned and scheduled in advance. These preauthorizations involve obtaining approval before the patient's actual visit, ensuring that the procedures receive the necessary prior authorisation. This process allows patients and facilities to confirm financial coverage, enabling them to schedule and prepare accordingly.


### 2.3. Specialised Preauth Forms


Beyond the general request types, certain types of preauths have specific workflows for creating detailed records for specialised medical areas. These forms capture the unique clinical and service details required for SHA's review. These include:


- **Surgical Preauth**: For planned surgical procedures.
- **Renal Preauth**: For kidney-related treatments, often involving dialysis sessions.
- **Oncology Preauth**: For cancer diagnosis and treatment plans.
- **Imaging Preauth**: For specialised diagnostic imaging services (e.g., MRI, CT scans).
- **Optical Preauth**: For eye-related services, including consultations and optical items.


> Note: Each of these specialised preauth forms serves as the detailed input for one of the various preauthorization request types (Normal or Elective), depending on the nature of the service.


---


## 3. How Workflows Connect


While each workflow within the Preauths Process has a distinct role, they are deeply interconnected:


- Foundation from Eligibility & Intervention Coverage: The decision to initiate a preauth request typically stems from the Eligibility Process (identifying a patient's general coverage) and the Intervention Coverage Process (identifying specific services that require pre-authorisation).
- Authorisation Token: The token used depends on the preauth type:

For normal preauths: the consent_token comes from an active patient visit, created via POST /api/v1/claims/visit.
For elective preauths: the token comes from a pre-visit authorization object, created via POST /api/v1/claims/authorize before any visit exists.
- Detailed Clinical Data: Preauth workflows require comprehensive clinical information, diagnoses, and proposed items/interventions. This data is often prepared by clinical staff and forms the core of the preauthorization request.
- Doctor's Consent: Many preauth types explicitly require consent from attending doctors or clinical officers, ensuring medical oversight and accountability.
- Attachments: The ability to include supporting documents (attachments) is common across various preauth types, providing necessary evidence for SHA's review.
- Outcome Dictates Service Delivery: The outcome of a preauthorization (approved, rejected, or more info requested) directly dictates whether the proposed service can proceed and be covered by SHA. This outcome then influences subsequent steps in the patient's care journey and the facility's claiming process.


---


## 4. Related Scenarios


- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Scenario 3: SHIF IP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)
- [Scenario 4: SHIF OP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth)
- [Scenario 5: SHIF OP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-5-shif-op-ffs-normal-preauth)

Last modified on
April 30, 2026
Restore Intervention
Normal Preauth

---

## Preauths Process Guide: Normal Preauths Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/normalPreauths](https://hie-docs.dha.go.ke/docs/claims/process/preauths/normalPreauths)

# Preauths Process Guide: Normal Preauths Workflow


## 1. Overview: Submitting a Standard Pre-Authorisation Request


This guide details the Normal Preauths Workflow, a core component of the broader Preauths Process. This workflow is designed to facilitate the submission of a standard, general pre-authorisation request for a single intervention or a set of related interventions that require prior approval from the Social Health Authority (SHA).


This workflow ensures that healthcare providers can formally request and obtain SHA's approval for planned services, which is essential for ensuring financial coverage and compliance.


### 1.1. What This Workflow Does


The Normal Preauths Workflow's primary function is to submit a valid general pre-authorisation request to SHA. This is done by:


**Receiving Authorisation and Intervention Details:** It takes a `consent_token` (for the patient's active visit) and the `intervention_code` for the specific service requiring pre-authorisation.


**Gathering Clinical and Supporting Data:** It collects essential clinical information, such as diagnoses, items related to the service, and attachments (if necessary), to support the medical justification for preauthorization.


**Including Doctor Information:** Doctor details are required in the `doctors` array payload for medical accountability and audit purposes. For non-elective (normal) preauths, there is no doctor approval step - the preauth proceeds directly to SHA review after submission. Only elective preauths trigger doctor consent approval.


**Validating Request Compliance:** It performs a series of checks to ensure the request meets SHA's standards, including minimum data requirements and financial thresholds based on the patient's scheme (UHC, PMF).


**Submitting the Preauth:** Upon successful validation, the system submits the comprehensive pre-authorisation request to SHA for review.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


This workflow is vital because it is the standard mechanism for obtaining SHA's approval for a wide range of planned healthcare services. It helps in:


**Ensuring Financial Coverage:** It's the primary way to secure prior approval from SHA, providing financial assurance for both the patient and the healthcare facility before high-cost or specialised services are rendered.


**Preventing Claim Rejections:** By obtaining pre-authorisation upfront, facilities reduce the risk of claims being rejected by SHA due to a lack of prior approval, protecting their revenue.


**Promoting Medical Necessity:** The requirement for detailed clinical information and the doctor's consent ensures that the proposed interventions are medically justified and appropriate for the patient's condition.


**Maintaining Compliance:** It enforces adherence to SHA's regulations for pre-authorisation, which is crucial for the facility's operational integrity and auditability.


This workflow ensures that planned healthcare services are both medically appropriate and financially covered, streamlining the care process and protecting stakeholders.


## 2. Workflow Details: Submitting a Normal Preauth


This section details the step-by-step process for submitting a normal pre-authorisation request.


### 2.1. Step-by-Step System Behavior


1. Input Reception:
The system receives the consent_token for the patient's active visit, the intervention_code that requires pre-authorisation, an array of items related to the preauth, an array of diagnoses, an array of doctors providing consent, and optionally, attachments.
2. Authorisation and Visit Context Check:
The system uses the provided consent_token to validate that the patient's visit is still in an active state and that the consent is valid.
3. Preauth Request Validation:
The system performs comprehensive checks on the incoming data and the context of the request:


**Minimum Data Requirements:** This validation ensures that at least one diagnosis, at least one item, and at least one attachment (if attachments are required for this preauthorization type) are provided.


**Doctor's License:** It validates that at least one doctor provided has a valid license.


**Financial limits:**


- Suppose the patient is under a Universal Health Coverage (UHC) scheme. In that case, it checks that the overall bill amount for the preauth is less than the KEPH (Kenya Essential Package for Health) level tariff or the overall tariff.
- If the patient is under a Public Office Medical Fund (PMF) scheme, it checks that the overall bill amount is less than the PMF balance plus any ex-gratia amount.


**Doctor Information:** It verifies that at least one doctor is provided in the request for medical accountability. For normal preauths, this is not a doctor approval step - no consent notification is sent.


**Intervention Preauth Requirement:** It confirms that the `intervention_code` requires a pre-authorisation according to SHA's rules.


1. Submit Preauth Request to SHA:
If all validations pass, the system compiles the complete pre-authorisation request payload and submits it to SHA's preauth service.
2. Receive SHA Response:
The system receives and processes the response from SHA, which indicates the submission status (e.g., success, failure, pending review).


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant submission of a normal pre-authorisation request:


**Active Consent/Visit State:** The `consent_token` must be valid and correspond to an active patient visit. This ensures the preauth request is tied to an ongoing, authorised patient encounter.


**At Least One Diagnosis:** The request must include at least one `diagnosis`. This provides the medical justification for the requested interventions, an important requirement during review.


**At Least One Bill Item:** The request must include at least one `item` (bill item). This defines the specific services being requested for authorisation, necessary for financial assessment.


**At Least One Attachment (if required):** If the preauth type or intervention requires supporting documents, at least one `attachment` must be provided. This provides essential clinical evidence or justification for review.


**Valid Doctor's License:** At least one doctor listed in the request must have a valid license. This ensures that the requesting medical professional is duly qualified and authorised.


**Financial Limits Compliance (UHC/PMF):** For UHC patients, the overall bill amount must be below the defined KEPH level or overall tariff. For PMF patients, the overall bill amount must be within their PMF balance plus any ex-gratia allowance. These checks ensure the requested preauth aligns with the financial limits and policies of the patient's specific health scheme, preventing automatic rejections.


**Doctor Information Provided:** At least one doctor must be included in the request for medical accountability. This is not a doctor approval step - no consent notification is sent for normal preauths. Only elective preauths trigger doctor consent approval.


**Intervention Requires Preauth:** The `intervention_code` for which pre-authorisation is sought must require pre-authorisation according to SHA's rules. This prevents unnecessary preauth submissions for services that don't require them, streamlining the process.


### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow:


| Field Name | Description | Required (Input) | Purpose |
| --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | Yes | Authorises the preauth request for the correct patient and active visit. |
| intervention_code | The unique identifier for the intervention you want to do a preauth request. You should only select the intervention that needs a preauth. You can know this from the previous intervention coverage response. | Yes | Specifies the particular service for which pre-authorisation is being sought. |
| items | An array of items (billable components or sub-services) included in the preauth request. | Yes | Details the specific components of the service being requested for authorisation, crucial for financial assessment. |
| diagnoses | An array of diagnoses relevant to the preauth request. | Yes | Provides the medical justification for the requested intervention, a fundamental requirement for SHA's review. |
| doctors | An array of attending doctors/clinical officers whose consent is required for the preauth. | Yes | Captures the medical professional(s) providing consent and oversight for the requested service. |
| attachments | An array of attachments (e.g., medical reports, lab results) supporting the request. | No | Provides supplementary clinical evidence or justification for SHA's review. |


### 2.4. Expected Outcomes


**Success: Preauth Request Submitted:**
All inputs were valid, the visit was active, and the preauth request successfully passed all internal validations and was submitted to SHA. A `preauth_id` is returned. Here, the pre-authorisation request is now with SHA for review. The facility will await SHA's decision (approval, rejection, or request for more information). The `preauth_id` can be used to track its status.


**Failure: Invalid Consent/Visit State:**
The `consent_token` was invalid, expired, or the visit it references is no longer active. The preauth request cannot be submitted. The user must ensure they are using a valid token for an active visit.


**Failure: Missing/Invalid Required Data:**
One or more mandatory fields (`diagnosis`, `items`, `intervention_code`, `doctors`) were missing or invalid, or `attachments` were required but not provided. The preauth request cannot be submitted. The user needs to provide all required and valid information.


**Failure: Financial Threshold Exceeded:**
The overall bill amount for the preauth exceeded the permissible limits for the patient's UHC or PMF scheme. The preauth request cannot be submitted as is. The user may need to adjust the request or explore alternative funding options.


**Failure: Doctor Information Missing/Invalid:**
One or more doctors listed in the request were missing or invalid. The preauth request cannot be submitted. Ensure at least one valid doctor is included in the `doctors` array.


**Failure: Intervention Does Not Require Preauth:**
The `intervention_code` specified does not require a pre-authorisation according to SHA's rules. The preauth request cannot be submitted. This service can likely be provided without prior authorisation.


---


## 3. Related Scenarios


- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Scenario 5: SHIF OP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-5-shif-op-ffs-normal-preauth)

Last modified on
April 30, 2026
Preauths Process Overview
Elective Preauth

---

## Preauths Process Guide: Surgical Preauth Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/surgicalPreauths](https://hie-docs.dha.go.ke/docs/claims/process/preauths/surgicalPreauths)

# Preauths Process Guide: Surgical Preauth Workflow


## 1. Overview: Obtaining Prior Authorization for Surgical Procedures


This guide details the Surgical Preauth Workflow, a specialized preauth form which is part of the broader Preauths Process. This workflow is specifically designed to facilitate the submission of pre-authorization requests for surgical interventions that require prior approval from the Social Health Authority (SHA) for payment.


A surgical preauth is a type of elective preauth and therefore this workflow ensures that planned surgical procedures receive the necessary prior approval, providing financial assurance and regulatory compliance before the operation takes place.


## 2. Workflow Details: Submitting a Surgical Preauth


This section details the step-by-step process for submitting a surgical pre-authorization request.


### 2.1. Step-by-Step System Behavior


1. Input Reception:
The system receives the consent_token for the patient's active visit, the intervention_code for the surgical procedure, arrays of items, diagnoses, doctors, attachments, and specific surgical details like surgery_date, chief_complaint, vital_signs, history_of_present_illness, physical_examination, investigation_report_details, type_of_anaesthesia, is_condition_related_to_employment, is_condition_related_to_auto_or_other_accident, is_co_insured, and co_insurance_details.
2. Authorization and Visit Context Check:
The system uses the provided consent_token to validate that the patient has a valid, active visit and that consent is still active. This also includes confirming the patient is in an active state.
3. Surgical Preauth Request Validation:
The system performs comprehensive and specific checks on the incoming data and the context of the request, as per SHA's rules for surgical procedures (which fall under Elective Preauths). Therefore elective preauths validations are considered. However specific Surgical Form Field Validations are checked such as surgery_date, chief_complaint, vital_signs, history_of_present_illness, physical_examination, investigation_report_details, and type_of_anaesthesia.
4. Submit Surgical Preauth Request to SHA:
If all validations pass, the system compiles the complete surgical pre-authorization request payload and submits it to SHA's preauth service.
5. Receive SHA Response:
The system receives and processes the response from SHA, which indicates the submission status (e.g., success, failure, pending review).


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant submission of a surgical pre-authorisation request. Surgical preauths align with the validation rules for elective procedures hence the validations remain the same.


### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow, specifically for Surgical Preauths. This form represents the required items on a surgical preauth.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit |  | True | string |
| intervention_code | Unique identifier to the intervention. Must be one thatneeds_a_preauth. |  | True | string |
| surgery_date | The expected surgery date. |  | True | An ISO 8601 timestamp of the date |
| chief_complaint | The complaint that caused the patient to seek medical care. |  | True | string |
| vital_signs | Patient's vital signs eg. Heart rate, Blood pressure, Respiratory rate, Temperature and Oxygen saturation. |  | True | string |
| history_of_present_illness | History of present illness. |  | True | string |
| physical_examination | Description of findings from physical examination. |  | True | string |
| investigation_report_details | Investigations. |  | True | string |
| type_of_anaesthesia | Type of anaesthesia. | General Anaesthesia, Local Anaesthesia, Spinal Anaesthesia, Sedation | True | string |
| is_condition_related_to_employment | Is the patient's condition related to employment?. |  | False | boolean |
| is_condition_related_to_auto_or_other_accident | Is the patient's condition related to auto/other accident?. |  | False | boolean |
| is_co_insured | Is the patient co-insured?. |  | False | boolean |
| co_insurance_details | Co-insurance Details if the patient is co-insured. |  | False | string (should be string, boolean from image is likely error) |
| doctors | Array of Attending Doctors/Clinical Officers consent. |  | True | array |
| items | Array of items in the preauth request. |  | True | array |
| diagnoses | Array of diagnoses in the preauth request. |  | True | array |
| attachments | Array of attachments in the request. |  | False | array |


Some items in the general workflow dictionary have their own specific workflow dictionaries. Below is the list that applies to this particular preauthorization.


#### 2.3.1. Preauth Doctor


This component represents the details of a doctor or clinical officer whose consent is required for a pre-authorization.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| identification_number | The unique ID to the doctor. |  | True | file (likely string/number for ID) |
| identification_type | The type of ID being used. | registration_number, National ID, Alien ID, Refugee ID | True | string |
| regulation_body | The licensing body choices. Defaults to KMPDC. | KMPDC, COC, NCK | True | string |
| intervention_code | The intervention code associated with the doctor's consent. |  | True | string |
| name | The client registry ID from the eligibility workflow |  | True | string |


#### 2.3.2. Preauth Items


This component represents the individual billable items or sub-services included within a pre-authorisation request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| unit_price | The unit price charged for this item. |  | True | float (up-to 2dp) |
| quantity | The quantity of the item. |  | True | float (up-to 2dp) |
| charge_date | The charge date to the item. Defaults to today. |  | False | An ISO 8601 timestamp of the date |
| scheme_name | The name of the scheme you intend to bill to. | Universal Health Coverage, Public Medical Service Fund | True | string |
| scheme_code | The scheme code you intend to bill against. | UHC, PMF | True | string |
| consent_token | The consent token for the patient visit. |  | True | string |


#### 2.3.3. Preauth Diagnosis


This component represents the diagnostic information associated with a pre-authorization request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| icd_code | The ICD 11 code. |  | True | string |


#### 2.3.4. Preauth Attachments


This component represents the supporting documents or files that are attached to a pre-authorization request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| file_blob | The file blob. |  | True | file |
| document_title | Title to the document. |  | False | string |
| document_type |  | PRESCRIPTION, MEDICAL_REPORT, RADIOLOGY_REQUEST, LAB_ORDER, INTERIM_BILL, DISCHARGE_SUMMARY, FINAL_BILL, PROFORMA_INVOICE, THEATRE_LIST, CLINICAL_DOCUMENTATION, OTHER | True | string |

Last modified on
April 30, 2026
Elective Preauth
Imaging Preauth

---

## Preauths Process Guide: Elective Preauthorization Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/electivePreauths](https://hie-docs.dha.go.ke/docs/claims/process/preauths/electivePreauths)

# Preauths Process Guide: Elective Preauthorization Workflow


## 1. Overview: Obtaining Prior Approval for Planned Procedures


This guide covers the Elective Preauthorization Workflow - a process for submitting pre-authorisation requests for elective (planned, non-urgent) procedures that require SHA approval **before the patient's actual visit day**.


Unlike standard preauths submitted on the day of a visit, elective preauths are initiated in advance. This means patient consent and authorization are obtained during a pre-visit phase, and the resulting authorization object carries the `consent_token` used when calling `POST /api/v1/preauths`.


**Related scenarios:**


- [Scenario 3: SHIF IP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)
- [Scenario 4: SHIF OP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth)


**API references:**


- [Preauths API Reference](https://hie-docs.dha.go.ke/eclaims)
- [Authorize API Reference](https://hie-docs.dha.go.ke/eclaims)


### 1.1. What This Workflow Does


**Receiving Pre-Visit Authorization and Service Details:** It takes a `consent_token` obtained from a **pre-visit authorization object** (created before any visit or claim exists) and the `intervention_code` for the specific elective service requiring pre-authorisation.


**Gathering Comprehensive Clinical Data:** It collects detailed medical information such as specific `diagnoses`, associated `items` (billable components), and mandatory `attachments` (e.g., medical reports, lab results) to provide strong medical justification.


**Obtaining Doctor's Consent:** It routes the preauth request for doctor approval automatically. You do not need to call the doctor consent endpoint manually in the standard flow.


**Validating Request Compliance:** It performs stringent checks to ensure the request meets SHA's criteria for elective procedures, including intervention type, facility authorisation, patient scheme, age ranges, and confirming the procedure is not emergency or urgent.


**Submitting the Preauth:** Upon successful validation, the system submits the elective pre-authorisation request to SHA for review.


### 1.2. Why This Workflow Is Critical


**Guaranteed Financial Coverage:** Secures prior approval for planned, often high-cost procedures, giving patients and facilities financial certainty before the service is rendered.


**Optimised Planning and Scheduling:** With pre-authorisation confirmed upfront, facilities can schedule resources and patients can prepare without uncertainty regarding payment.


**Ensuring Medical Appropriateness:** The requirement for detailed clinical information and doctor's approval ensures elective procedures are medically justified and align with SHA's guidelines.


**Preventing Claim Denials:** Fulfilling the pre-authorisation requirement significantly reduces the risk of claims being rejected by SHA.


**Maintaining Regulatory Compliance:** Enforces adherence to SHA's specific regulations for elective procedures, which is critical for operational integrity and auditability.


---


## 2. Identifying Elective Interventions


Not all interventions require elective preauth. Before initiating this workflow, check whether the specific intervention the patient needs falls into this category.


When you call `GET /api/v1/patients/benefits/interventions` to look up an intervention, the response includes a flag:


```json
{
  "intervention_code": "...",
  "description": "...",
  "needsManualPreauthApproval": true
}
```


If `needsManualPreauthApproval` is `true`, the intervention requires elective preauthorization - meaning SHA must approve the procedure **before** the patient's visit takes place. These are planned, non-urgent procedures such as scheduled surgeries, specialist referrals, or procedures requiring pre-approval due to cost or clinical complexity.


If `needsManualPreauthApproval` is `false` or absent, the intervention follows the standard same-day preauth flow instead. Use the [Normal Preauths Workflow](https://hie-docs.dha.go.ke/docs/claims/process/preauths/normalPreauths) for those cases.


---


## 3. Pre-Visit Consent: OTP vs Biometrics


Because elective preauths happen before the patient's actual visit, patient consent must be obtained in a **pre-visit phase**. This creates an authorization object in status `AUTHORIZED_PENDING_VISIT`, whose `token` becomes the `consent_token` for the preauth request.


The consent can be collected via OTP or biometrics.


### 3.1. OTP Flow (Pre-Visit)


1. Get patient contacts: Call GET /api/v1/patients/contacts. The response returns a list of contacts with masked values and an id for each entry.
2. Confirm contact with patient: Present the masked contacts and confirm which one the patient wants to use for OTP delivery. Note the id of the selected contact.
3. Send OTP: Call POST /api/v1/claims/otp, optionally passing beneficiary_contact_id (the id from step 2). If omitted, the system uses the patient's default contact.
4. Authorize (pre-visit): Call POST /api/v1/claims/authorize with the OTP and relevant fields. The system creates an authorization object in status AUTHORIZED_PENDING_VISIT.
5. Submit preauth: Use the token from the authorization object as the consent_token when calling POST /api/v1/preauths. Include all required clinical data.
6. Await doctor and SHA approval: The preauth moves through the approval lifecycle (see Section 4 below). Once SHA approves, the authorization transitions to AUTHORIZED.
7. On the day of the visit: Call POST /api/v1/claims/otp again to generate a fresh OTP, then call POST /api/v1/claims/visit using that OTP. No new /authorize call is needed. The system validates: same patient + same intervention + existing AUTHORIZED authorization + approved preauth, then creates the claim successfully.


The OTP sent on the day of the visit goes directly to `POST /api/v1/claims/visit`. The authorization created in the pre-visit phase is reused; the system links them automatically.


### 3.2. Biometrics Flow (Pre-Visit)


1. Authorize (pre-visit): Call POST /api/v1/claims/authorize with biometrics-specific fields (workstation ID, biometrics agent National ID, etc.). The system creates an authorization in PENDING status and returns an iframe link.
2. Render the iframe: Display the iframe to the patient. The patient matches their fingerprints through the biometrics agent.
3. On successful fingerprint match: The authorization transitions to AUTHORIZED_PENDING_VISIT.
4. Submit preauth: Use the token from the authorization object as the consent_token when calling POST /api/v1/preauths. Include all required clinical data.
5. Await doctor and SHA approval: The preauth moves through the approval lifecycle (see Section 4). Once SHA approves, the authorization transitions to AUTHORIZED.
6. On the day of the visit: Call POST /api/v1/claims/visit using the auth_guid (the GUID of the authorization created in the pre-visit phase). No new consent step is needed. The system validates the existing authorized preauth and creates the claim.


For biometrics, the `auth_guid` replaces a fresh OTP or token on visit day. Keep the authorization GUID stored against the patient's planned visit record.


---


## 4. Preauth Status Lifecycle


Elective preauths go through a multi-step approval process before the claim can be created.


```text
POST /api/v1/preauths
        |
        v
PENDING_DOCTOR_APPROVAL  <-- System automatically sends consent request to doctor via SMS/notification
        |
        v (Doctor approves)
     ACTIVE              <-- Preauth is submitted to SHA/payer for review
        |
        v (SHA approves)
    FINALISED            <-- Preauth approved; patient visit can proceed
```


The `/doctor-consent` endpoint is a **resend fallback only**. It is used when the doctor did not receive or acted on the initial notification and needs a new one sent. Do not call it as part of the standard flow.


When the preauth reaches `FINALISED`:


- The pre-visit authorization transitions from `AUTHORIZED_PENDING_VISIT` to `AUTHORIZED`
- The patient can proceed to the facility for the scheduled procedure
- On visit day, follow the visit creation steps in [Section 3](https://hie-docs.dha.go.ke/docs/claims/process/preauths/electivePreauths#3-pre-visit-consent-otp-vs-biometrics) for your chosen consent method


---


## 5. Workflow Details: Submitting an Elective Preauth


### 5.1. Step-by-Step


1. **Verify the intervention requires elective preauth** by checking `needsManualPreauthApproval: true` on the intervention record.
2. **Obtain pre-visit consent** using OTP or biometrics (see [Section 3](https://hie-docs.dha.go.ke/docs/claims/process/preauths/electivePreauths#3-pre-visit-consent-otp-vs-biometrics)).
3. **Collect clinical data:** diagnoses, bill items, attachments (medical reports, lab results), and doctors providing consent.
4. **Call POST /api/v1/preauths** with:

consent_token from the pre-visit authorization object
intervention_code
diagnoses, items, doctors, attachments
expected_service_start_date (required for all elective preauths)
5. **Monitor preauth status** as it moves through doctor approval and SHA review.
6. **On visit day**, follow the OTP or biometrics visit creation steps.


### 5.2. Key Validations


**Valid Pre-Visit Authorization:** The `consent_token` must come from a pre-visit authorization object (status `AUTHORIZED_PENDING_VISIT`). All preauth requests must be linked to a valid, patient-consented authorization that was created in the pre-visit phase.


**At Least One Diagnosis:** The request must include at least one `diagnosis` to provide medical justification for the requested intervention.


**At Least One Bill Item:** The request must include at least one `item` (bill item) defining the specific services being requested.


**At Least One Attachment (if required):** If the preauth type or intervention requires supporting documents, at least one `attachment` must be provided.


**Valid Doctor's License:** At least one doctor listed in the request must have a valid license.


**Financial Limits Compliance (UHC/PMF):** For UHC patients, the overall bill amount must be below the defined KEPH level or overall tariff. For PMF patients, the overall bill amount must be within their PMF balance plus any ex-gratia allowance.


**Doctor's Consent Included:** If the intervention requires consent from one or more doctors, it must be provided in the request.


**Intervention Requires Preauth:** The `intervention_code` must require pre-authorisation (`needsManualPreauthApproval: true`) according to SHA's rules.


**Expected Service Start Date:** Every elective preauth request must include a planned expected start date for the procedure. This is required for scheduling, resource planning, and tracking the preauth validity period.


**Not an Emergency or Urgent Case:** Elective preauths are for planned procedures only. Requests flagged as emergency or urgent will be rejected.


### 5.3. Expected Outcomes


**Success: Elective Preauth Request Submitted**
All inputs were valid and the request passed all validations. A `preauth_id` is returned. The preauth moves to `PENDING_DOCTOR_APPROVAL`. Use the `preauth_id` to track its status through doctor approval and SHA review.


**Failure: Invalid Pre-Visit Authorization**
The `consent_token` was invalid, expired, or not from a pre-visit authorization object. Ensure you are using the `token` from an authorization created in the pre-visit phase with status `AUTHORIZED_PENDING_VISIT`.


**Failure: Missing or Invalid Required Data**
One or more mandatory fields (`diagnoses`, `items`, `doctors`, `attachments`, `expected_service_start_date`) were missing or invalid. Provide all required information and resubmit.


**Failure: Elective Preauth Condition Violation**
The request violated one or more rules for elective preauths (e.g., intervention not designated for elective, facility not authorised, patient scheme/age mismatch, or the case is flagged as emergency/urgent). Review the specific violation returned in the error response and correct before resubmitting.

Last modified on
April 30, 2026
Normal Preauth
Surgical Preauth

---

## Preauths Process Guide: Oncology Preauth Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/oncologyPreauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/oncologyPreauth)

# Preauths Process Guide: Oncology Preauth Workflow


## 1. Overview: Authorising Cancer Diagnosis and Treatment Plans


This guide details the Oncology Preauth Workflow, a specialised preauth form which is part of the broader Preauths Process. This workflow is specifically designed to facilitate the submission of pre-authorisation requests for oncology interventions (i.e., services related to cancer diagnosis and treatment) that require prior approval from the Social Health Authority (SHA) for payment.


An oncology preauth is a type of multisession preauth, as due to the nature of cancer treatment, it often involves multiple sessions, aligning with aspects of multisession preauths. This workflow ensures that patients undergoing cancer treatments receive necessary prior approval, providing crucial financial assurance and enabling continuous, compliant care.


## 2. Workflow Details: Submitting an Oncology Preauth


This section details the step-by-step process for submitting an oncology pre-authorisation request.


### 2.1. Step-by-Step System Behavior


1. Input Reception:
The system receives the consent_token for the patient's active visit, the intervention_code for the oncology procedure, is_co_insured, carcinoma_staging, comorbidity, metastases, progress_report, treatment_setting, start_date, number_of_sessions, cost_per_session, and arrays of items, diagnoses, doctors, and attachments.
2. Authorisation and Visit Context Check:
The system uses the provided consent_token to validate that the patient has a valid, active visit and that consent is still active. This also includes confirming the patient is in an active state.
3. Oncology Preauth Request Validation:
The system performs comprehensive and specific checks on the incoming data and the context of the request, as per SHA's rules for oncology procedures. Most of the workflow's checks and validations are from the multisession validations.
4. Submit Oncology Preauth Request to SHA:
If all validations pass, the system compiles the complete oncology pre-authorisation request payload and submits it to SHA's preauth service.
5. Receive SHA Response:
The system receives and processes the response from SHA, which indicates the submission status (e.g., success, failure, pending review).


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant submission of an oncology pre-authorisation request. Most of these checks stem from the specific multisession validations.


### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow:


| Field Name | Description | Required (Input) | Type | Options (if applicable) | Purpose |
| --- | --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | Yes | string |  | Authorizes the preauth request for the correct patient and active visit. |
| intervention_code | The unique identifier for the oncology intervention you want to do a preauth request for. You should only select the intervention that needs a preauth. You can know this from the previous interventions coverage response. | Yes | string |  | Specifies the particular oncology procedure or treatment for which pre-authorization is being sought. |
| is_co_insured | Is the patient co-insured? | No | boolean |  | Indicates if the patient has co-insurance. |
| carcinoma_staging | The Carcinoma staging. | Yes | string | Stage 1, Stage 2, Stage 3, Stage 4 | Provides details on the stage of carcinoma, essential for oncology treatment planning. |
| comorbidity | The comorbidity. | Yes | string |  | Describes any co-existing medical conditions. |
| metastases | The metastases. | Yes | string | Lung, Brain, Liver, Other (specify missing option) | Indicates the location of cancer spread. |
| progress_report | The patient's progress report. | No | string |  | Provides an update on the patient's condition and treatment progress. |
| treatment_setting | The treatment setting. | Yes | string | Day ward, Reclining chair, Side room (Specify your option) | Specifies where the treatment will take place. |
| start_date | The expected start date. | Yes | An ISO 8601 timestamp of the date for the |  | Marks the beginning of the authorized treatment period. |
| number_of_sessions | The number of sessions. | Yes | integer |  | Defines the extent of the oncology treatment plan (e.g., number of chemotherapy cycles). |
| cost_per_session | The cost per session. | Yes | float (up-to 2dp) |  | Specifies the cost for each individual session. |
| doctors | The Attending Doctors/Clinical Officers consent. This is an array of the doctors you need approval from. | Yes | array |  | Captures the medical professional(s) providing consent and oversight for the requested oncology service. |
| items | This will be an array of items in the preauth request. | Yes | array |  | Details the specific components of the oncology service being requested for authorization, crucial for financial assessment. |
| diagnoses | This will be an array of diagnoses in the preauth request. | Yes | array |  | Provides the medical justification for the requested oncology intervention, a fundamental requirement for SHA's review. |
| attachments | This will be an array of attachments in the request. | No | array |  | Provides essential clinical evidence or justification for SHA's detailed review of oncology procedures. |


Some items in the general workflow dictionary have their specific workflow dictionaries. Below is the list that applies to this particular preauthorization.


#### 2.3.1. Preauth Doctor


This defines the structure for doctors associated with a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| identification_number | The unique id to the doctor. |  | True | file |
| identification_type | The type of ID being used. | registration_number, National ID, Alien ID, Refugee ID | True | string |
| regulation_body | The licensing body choices. Defaults to KMPDC. | KMPDC, COC, NCK | True | string |
| intervention_code | The intervention code. |  | True | string |
| name | The client registry ID from the previous eligibility call. |  | True | string |


#### 2.3.2. Preauth Items


This defines the structure for individual items included in a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| unit_price | The unit price charged for this item. |  | True | float (up-to 2dp) |
| quantity | The quantity of the item. |  | True | float (up-to 2dp) |
| charge_date | The charge date to the item. Defaults to today. |  | False | An ISO 8601 timestamp of the date for the |
| scheme_name | The name of the scheme you intend to bill to. | Universal Health Coverage, Public Medical Service Fund | True | string |
| scheme_code | The scheme code you intend to bill against. | UHC, PMF | True | string |
| consent_token | The consent token for the patient visit. |  | True | string |


#### 2.3.3. Preauth Diagnosis


This defines the structure for diagnoses associated with a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| icd_code | The ICD 11 code. |  | True | string |


#### 2.3.4. Preauth Attachments


This defines the structure for attachments included in a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| file_blob | The file blob. |  | True | file |
| document_title | Title to the document. |  | False | string |
| document_type |  | PRESCRIPTION, MEDICAL_REPORT, RADIOLOGY_REQUEST, LAB_ORDER, INTERIM_BILL, DISCHARGE_SUMMARY, FINAL_BILL, PROFORMA_INVOICE, THEATRE_LIST, CLINICAL_DOCUMENTATION, OTHER | True | string |

Last modified on
April 30, 2026
Optical Preauth
Renal Preauth

---

## Preauths Process Guide: Renal Preauth Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/renalPreauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/renalPreauth)

# Preauths Process Guide: Renal Preauth Workflow


## 1. Overview: Authorising Renal Treatments and Dialysis Sessions


This guide details the Renal Preauth Workflow, a specialised preauth form which is part of the broader Preauths Process. This workflow is specifically designed to facilitate the submission of pre-authorisation requests for renal interventions, which often involve a series of sessions, such as dialysis, that require prior approval from the Social Health Authority (SHA) for payment.


A renal preauth is a type of multisession preauth because, given its nature of treatment, it often involves multiple sessions. At its core, this workflow ensures that patients requiring ongoing renal treatments receive necessary prior approval, providing financial assurance and enabling continuous, compliant care.


## 2. Workflow Details: Submitting a Renal Preauth


This section details the step-by-step process for submitting a renal pre-authorisation request.


### 2.1. Step-by-Step System Behavior


1. Input Reception:
The system receives the consent_token for the patient's active visit, the intervention_code for the renal procedure, start_date, number_of_sessions_required, frequency_of_sessions, clinical_indications, is_co_insured, and arrays of items, diagnoses, doctors, and attachments. The preauth_type will be "Renal Preauthorization".
2. Authorisation and Visit Context Check:
The system uses the provided consent_token to validate that the patient has a valid, active visit and that consent is still active. This also includes confirming the patient is in an active state.
3. Renal Preauth Request Validation:
The system performs comprehensive and specific checks on the incoming data and the context of the request, as per SHA's rules for renal procedures. Most checks and validations are based on the multisession validations.
4. Submit Renal Preauth Request to SHA:
If all validations pass, the system compiles the complete renal pre-authorisation request payload and submits it to SHA's preauth service.
5. Receive SHA Response:
The system receives and processes the response from SHA, which indicates the submission status (e.g., success, failure, pending review).


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant submission of an oncology pre-authorisation request. Most of these checks stem from the specific multisession validations.


### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow:


| Field Name | Description | Required (Input) | Type | Options (if applicable) |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | Yes | string |  |
| intervention_code | The unique identifier for the renal intervention you want to do a preauth request. You should only select the intervention thatneeds_a_preauth. You can know this from the previous intervention coverage response. | Yes | string |  |
| start_date | Expected Date of 1st Session. | Yes | An ISO 8601 timestamp of the date for the |  |
| number_of_sessions_required | Number of Sessions Required. | Yes | integer |  |
| frequency_of_sessions | Frequency of sessions. | True | string | Twice a week, Once a week, One time every 2 weeks, One time every 3 weeks, One a month |
| clinical_indications | The clinical indications. | True | string | End-Stage renal disease, Acute kidney failure, Other |
| is_co_insured | Is the patient co-insured? | False | boolean |  |
| doctors | The Attending Doctors/Clinical Officers consent. This is an array of the doctors you need approval from. | Yes | array |  |
| items | This will be an array of items in the preauth request. | Yes | array |  |
| diagnoses | This will be an array of diagnoses in the preauth request. | Yes | array |  |
| attachments | This will be an array of attachments in the request. | False | array |  |


Some items in the general workflow dictionary have their specific workflow dictionaries. Below is the list that applies to this particular preauthorization.


#### 2.3.1. Preauth Doctor


This defines the structure for doctors associated with a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| identification_number | The unique id to the doctor. |  | True | file |
| identification_type | The type of ID being used. | registration_number, National ID, Alien ID, Refugee ID | True | string |
| regulation_body | The licensing body's choices. Defaults to KMPDC. | KMPDC, COC, NCK | True | string |
| intervention_code | The intervention code. |  | True | string |
| name | The client registry ID from the previous eligibility call. |  | True | string |


#### 2.3.2. Preauth Items


This defines the structure for individual items included in a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| unit_price | The unit price charged for this item. |  | True | float (up-to 2dp) |
| quantity | The quantity of the item. |  | True | float (up-to 2dp) |
| charge_date | The charge date to the item. Defaults to today. |  | False | An ISO 8601 timestamp of the date for the |
| scheme_name | The name of the scheme you intend to bill to. | Universal Health Coverage, Public Medical Service Fund | True | string |
| scheme_code | The scheme code you intend to bill against. | UHC, PMF | True | string |
| consent_token | The consent token for the patient visit. |  | True | string |


#### 2.3.3. Preauth Diagnosis


This defines the structure for diagnoses associated with a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| icd_code | The ICD-11 code. |  | True | string |


#### 2.3.4. Preauth Attachments


This defines the structure for attachments included in a preauth request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| file_blob | The file blob. |  | True | file |
| document_title | Title to the document. |  | False | string |
| document_type |  | PRESCRIPTION, MEDICAL_REPORT, RADIOLOGY_REQUEST, LAB_ORDER, INTERIM_BILL, DISCHARGE_SUMMARY, FINAL_BILL, PROFORMA_INVOICE, THEATRE_LIST, CLINICAL_DOCUMENTATION, OTHER | True | string |

Last modified on
April 30, 2026
Oncology Preauth
Cancel Preauth

---

## Preauths Process Guide: Imaging Preauth Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/imagingPreauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/imagingPreauth)

# Preauths Process Guide: Imaging Preauth Workflow


## 1. Overview: Authorising Specialised Diagnostic Imaging Services


This guide details the Imaging Preauth Workflow, a specialised preauth form which is part of the broader Preauths Process. This workflow is specifically designed to facilitate the submission of pre-authorisation requests for Imaging interventions (such as MRI, CT scans, advanced X-rays, and ultrasounds) that require prior approval from the Social Health Authority (SHA) for payment.


Imaging preauth is a type of elective preauth and therefore this workflow ensures that patients needing specialised diagnostic imaging receive necessary prior approval, providing financial assurance and enabling the appropriate and compliant utilisation of these often high-cost services.


## 2. Workflow Details: Submitting an Imaging Preauth


This section details the step-by-step process for submitting an imaging pre-authorisation request.


### 2.1. Step-by-Step System Behavior


1. Input Reception:
The system receives the consent_token for the patient's active visit, the intervention_code for the imaging procedure, clinical_indications, and arrays of items, diagnoses, doctors, and attachments.
2. Authorisation and Visit Context Check:
The system uses the provided consent_token to validate that the patient has a valid, active visit and that consent is still active. This also includes confirming the patient is in an active state.
3. Imaging Preauth Request Validation:
The system performs comprehensive and specific checks on the incoming data and the context of the request, as per SHA's rules for imaging procedures and general elective preauthorization rules. Therefore, elective preauth validations are considered. However, Imaging Specific Mandatory Field checks are done for the presence and validity of the clinical_indications field.
4. Submit Imaging Preauth Request to SHA:
If all validations pass, the system compiles the complete imaging pre-authorisation request payload and submits it to SHA's preauth service.
5. Receive SHA Response:
The system receives and processes the response from SHA, which indicates the submission status (e.g., success, failure, pending review).


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant submission of a surgical pre-authorisation request. Imaging preauths align with the validation rules for elective procedures, hence the validations remain the same.


### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow for an Imaging preauth.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. |  | True | string |
| intervention_code | This should be the unique identifier for the intervention we want to do a preauth request for. You should only select the intervention thatneeds_a_preauth. You can know this from the previous interventions coverage response. |  | True | string |
| clinical_indications | The clinical indications. |  | True | string |
| doctors | The Attending Doctors/Clinical Officers' consent. This is an array of the doctors you need approval from. |  | True | array |
| items | This will be an array of items in the preauth request. |  | True | array |
| diagnoses | This will be an array of diagnoses in the preauth request. |  | True | array |
| attachments | This will be an array of attachments in the request. |  | False | array |


Some items in the general workflow dictionary have their own specific workflow dictionaries. Below is the list that applies to this particular preauthorization.


#### 2.3.1. Preauth Doctor


This component represents the details of a doctor or clinical officer whose consent is required for a pre-authorisation.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| identification_number | The unique ID for the doctor. |  | True | file (likely string/number for ID) |
| identification_type | The type of ID being used. | registration_number, National ID, Alien ID, Refugee ID | True | string |
| regulation_body | The licensing body's choices. Defaults to KMPDC. | KMPDC, COC, NCK | True | string |
| intervention_code | The intervention code is associated with the doctor's consent. |  | True | string |
| name | The client registry ID from the previous eligibility call (This might be a generic description; in context of items, likely item name). |  | True | string |


#### 2.3.2. Preauth Items


This component represents the individual billable items or sub-services included within a pre-authorisation request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| unit_price | The unit price charged for this item. |  | True | float (up-to 2dp) |
| quantity | The quantity of the item. |  | True | float (up-to 2dp) |
| charge_date | The charge date for the item. Defaults to today. |  | False | An ISO 8601 timestamp of the date for the |
| scheme_name | The name of the scheme you intend to bill to. | Universal Health Coverage, Public Medical Service Fund | True | string |
| scheme_code | The scheme code you intend to bill against. | UHC, PMF | True | string |
| consent_token | The consent token for the patient visit. |  | True | string |


#### 2.3.3. Preauth Diagnosis


This component represents the diagnostic information associated with a pre-authorization request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| icd_code | The ICD-11 code. |  | True | string |


#### 2.3.4. Preauth Attachments


This component represents the supporting documents or files that are attached to a pre-authorisation request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| file_blob | The file blob. |  | True | file |
| document_title | Title to the document. |  | False | string |
| document_type |  | PRESCRIPTION, MEDICAL_REPORT, RADIOLOGY_REQUEST, LAB_ORDER, INTERIM_BILL, DISCHARGE_SUMMARY, FINAL_BILL, PROFORMA_INVOICE, THEATRE_LIST, CLINICAL_DOCUMENTATION, OTHER | True | string |

Last modified on
April 30, 2026
Surgical Preauth
Optical Preauth

---

## Preauths Process Guide: Optical Preauth Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/opticalPreauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/opticalPreauth)

# Preauths Process Guide: Optical Preauth Workflow


## 1. Overview: Authorising Optical Interventions and Items


This guide details the Optical Preauth Workflow, a specialised preauth form which is part of the broader Preauths Process. This workflow is specifically designed to facilitate the submission of pre-authorisation requests for Optical interventions (such as eye examinations, corrective lenses, frames, and other optical aids) that require prior approval from the Social Health Authority (SHA) for payment.


An optical preauth is a type of elective preauth, and therefore, this workflow ensures that patients needing optical services receive necessary prior approval, providing financial assurance and enabling the appropriate and compliant utilisation of these services.


## 2. Workflow Details: Submitting an Optical Preauth


This section details the step-by-step process for submitting an optical pre-authorisation request.


### 2.1. Step-by-Step System Behavior


1. Input Reception:
The system receives the consent_token for the patient's active visit, the intervention_code for the optical procedure, clinical_indications, new_or_replacement, lens_prescription, consultation_amount, consultation_description, eye_examination_amount, eye_examination_description, frame_amount, frame_description, lens_amount, lens_description, necessity_of_service, arrays of doctors, items, diagnoses, and attachments.
2. Authorization and Visit Context Check:
The system uses the provided consent_token to validate that the patient has a valid, active visit and that consent is still active. This also includes confirming the patient is in an active state.
3. Optical Preauth Request Validation:
The system performs comprehensive and specific checks on the incoming data and the context of the request, as per SHA's rules for optical procedures (which fall under Elective Preauths). Therefore, elective preauth validations are considered. However, Optical Specific Mandatory Fields are checked, such as clinical_indications and necessity_of_service.
4. Submit Optical Preauth Request to SHA:
If all validations pass, the system compiles the complete optical pre-authorisation request payload and submits it to SHA's preauth service.
5. Receive SHA Response:
The system receives and processes the response from SHA, which indicates the submission status (e.g., success, failure, pending review).


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant submission of a surgical pre-authorisation request. Optical preauths align with the validation rules for elective procedures, hence the validations remain the same.


### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow for an Optical preauth.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. |  | True | string |
| intervention_code | This should be the unique identifier for the intervention we want to do a preauth request for. You should only select the intervention thatneeds_a_preauth. You can know this from the previous intervention coverage response. |  | True | string |
| clinical_indications | The clinical indications. |  | True | string |
| new_or_replacement | Confirms if this is a new request or a replacement request | New, Replacement | False | string |
| lens_prescription |  | Framed, Contact | False | string |
| consultation_amount |  |  | False | string |
| consultation_description |  |  | False | string |
| eye_examination_amount |  |  | False | string |
| eye_examination_description |  |  | False | string |
| frame_amount |  |  | False | string |
| frame_description |  |  | False | string |
| lens_amount |  |  | False | string |
| lens_description |  |  | False | string |
| necessity_of_service | Brief Description of necessity for service. |  | True | string |
| doctors | The Attending Doctors/Clinical Officers' consent. This is an array of the doctors you need approval from. |  | True | array |
| items | This will be an array of items in the preauth request. |  | True | array |
| diagnoses | This will be an array of diagnoses in the preauth request. |  | True | array |
| attachments | This will be an array of attachments in the request. |  | False | array |
| status | The outcome of the preauth submission (e.g., "Success", "Failed"). |  | Output | Indicates whether the optical preauth request was successfully submitted to SHA. |
| message | A descriptive message about the outcome, including any error details. |  | Output | Provides detailed feedback, especially in case of failure, to aid in troubleshooting. |
| preauth_id | A unique identifier for the submitted preauthorization request (if successful). |  | Output | A reference ID for tracking the optical preauthorization request within SHA's system. |


Some items in the general workflow dictionary have their own specific workflow dictionaries. Below is the list that applies to this particular preauthorization.


#### 2.3.1. Preauth Doctor


This component represents the details of a doctor or clinical officer whose consent is required for a pre-authorisation.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| identification_number | The unique ID for's choices. Defaults to KMPDC. | KMPDC, COC, NCK | True | string |
| intervention_code | The intervention code is associated with the doctor's consent. |  | True | string |
| name | The client registry ID from the previous eligibility call (This might be a generic description; in context of items, likely item name). |  | True | string |


#### 2.3.2. Preauth Items


This component represents the individual billable items or sub-services included within a pre-authorisation request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| unit_price | The unit price charged for this item. |  | True | float (up-to 2dp) |
| quantity | The quantity of the item. |  | True | float (up-to 2dp) |
| charge_date | The charge date for the item. Defaults to today. |  | False | An ISO 8601 timestamp of the date |
| scheme_name | The name of the scheme you intend to bill to. | Universal Health Coverage, Public Medical Service Fund | True | string |
| scheme_code | The scheme code you intend to bill against. | UHC, PMF | True | string |
| consent_token | The consent token for the patient visit. |  | True | string |


#### 2.3.3. Preauth Diagnosis


This component represents the diagnostic information associated with a pre-authorisation request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| icd_code | The ICD-11 code. |  | True | string |


#### 2.3.4. Preauth Attachments


This component represents the supporting documents or files that are attached to a pre-authorisation request.


| Field Name | Info | Options (if applicable) | Is required? | Type |
| --- | --- | --- | --- | --- |
| file_blob | The file blob. |  | True | file |
| document_title | Title of the document. |  | False | string |
| document_type |  | PRESCRIPTION, MEDICAL_REPORT, RADIOLOGY_REQUEST, LAB_ORDER, INTERIM_BILL, DISCHARGE_SUMMARY, FINAL_BILL, PROFORMA_INVOICE, THEATRE_LIST, CLINICAL_DOCUMENTATION, OTHER | True | string |

Last modified on
April 30, 2026
Imaging Preauth
Oncology Preauth

---

## Preauths Process Guide: Pre-Authorization Cancellation Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauths/cancelPreauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/cancelPreauth)

# Preauths Process Guide: Pre-Authorization Cancellation Workflow


## Preauths Process: Cancelling a Pending Pre-Authorization Request


### 1. Overview


This guide explains the Pre-Authorization Cancellation workflow, which allows healthcare facilities to formally close or cancel a pending pre-authorization request that was initiated but will no longer be pursued or submitted to the Social Health Authority (SHA) for review.


This workflow is essential for maintaining data integrity, and clearing the facility's queue of open preauths that are no longer valid.This provides a true reflection of the patient's visit.


#### 1.1. What This Workflow Does


The Pre-Authorization Cancellation workflow enables users to:


- **Identify the Target Preauth:** Use a valid, active `consent_token` and the specific `intervention_code` to uniquely identify the pending pre-authorization request.
- **Validate Cancel Status:** Ensure the identified pre-authorization is in a state that permits cancellation (preauths in `DRAFT` status).
- **Execute Status Change:** Update the status of the pre-authorization request to `CANCELLED`.


#### 1.2. Why This Workflow Is Critical


- **Data Integrity:** Formally cancelling preauths opened by mistake ensures that the facility's records accurately reflect the services the patient is actually receiving or pursuing.
- **Queue Management:** Clears the system of unnecessary or erroneously opened preauth requests.
- **Preventing Accidental Submissions:** Avoids mistaken submission of an incorrect preauthorization requests for review by the payer.
- **Auditability:** Provides a clear audit trail for cancelled preauthorization requests.


---


### 2. Workflow Details: Cancelling a Preauth Request


#### 2.1. Workflow Description


1. **Input Reception:** The system receives the patient's current `consent_token` and the `intervention_code` linked to the preauthorization request to be cancelled.
2. **Preauth Identification:** The system identifies the specific pending pre-authorization request using the provided information.
3. **Status Validation:** The system verifies that the current status of the identified preauth is eligible for cancellation, i.e it should be in `DRAFT` status only.
4. **Status Update:** If validation is successful, the preauth status is atomically updated to `CANCELLED`.
5. **Outcome Delivery:** A confirmation message and the `preauth_id` of the cancelled request are returned.


#### 2.2. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The active token linking to the patient's current visit | String | Yes | Identifies the active patient visit context |
| intervention_code | SHA-recognized code for the intervention | String | Yes | Uniquely identifies the specific intervention which the pre-authorization request is for. |


#### 2.3. Expected Outcomes


| Outcome | Description |
| --- | --- |
| Success: Preauth Closed | The pre-authorization request was successfully identified and closed. |
| Failure: Invalid Consent/Visit | Theconsent_tokenwas invalid, expired, or the visit is no longer active. |
| Failure: Preauth Not Found | No pending pre-authorization request matched the provided identifiers. |
| Failure: Invalid Status | The request cannot be closed because it is already in a final state. |
| Failure: Input Error | Missing or invalid required fields. |


---


### 3. Critical Success Factors for Integration


- **Token Accuracy:** Ensure the provided `consent_token` is the correct, currently active token for the patient's visit.
- **Intervention Code Precision:** The `intervention_code` must precisely match the code used when the preauth request was originally opened.
- **Status Handling:** Communicate clearly why a request cannot be cancelled if it is already in a final state.


---

Last modified on
April 30, 2026
Renal Preauth
Billing Process Overview

---

## Preauth Doctor Consent Process Overview: Facilitating Doctor Approval for Pre-Authorizations

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/preauthDoctorConsent/preauthDocConsent](https://hie-docs.dha.go.ke/docs/claims/process/preauthDoctorConsent/preauthDocConsent)

# Preauth Doctor Consent Process Overview: Facilitating Doctor Approval for Pre-Authorizations


### This Endpoint is a Resend Fallback - Not Part of the Standard Elective Preauth Flow


Doctor consent is automatically triggered only for **elective preauthorizations**. When you create an elective preauth using `POST /api/v1/preauths`, the system **automatically submits the preauth and sends a consent request to the doctor** in the same operation. You do not need to call `POST /api/v1/claims/doctor-consent` as a step in the elective preauth creation flow.


For **non-elective (normal) preauths**: doctor information is included in the payload for accountability and medical justification, but no consent request is sent and no approval step is required.


This endpoint is used **only as a fallback**: if the doctor reports they did not receive the initial consent request for an elective preauth and needs it resent, call this endpoint to trigger a new delivery.


## 1. Introduction: Understanding Preauth Doctor Consent


This guide covers the Doctor Consent process for pre-authorisations - specifically the fallback resend workflow triggered when a doctor needs the consent request to be re-delivered.


The Preauth Doctor Consent process, through the Doctor Consent workflow, is designed to ensure that all pre-authorisation requests submitted to the Social Health Authority (SHA) have the necessary medical approval from the attending doctor. It's about moving from a prepared pre-authorisation request to one that is officially verified by the responsible medical professional.


### 1.1. Why This Full Process Matters


The Preauth Doctor Consent process is fundamental to compliant and medically justified healthcare delivery. It is crucial because it:


- **Ensures Medical Accountability**: Verifies that a qualified medical professional reviews and approves the planned intervention.
- **Validates Medical Necessity**: Strengthens the medical justification for the pre-authorisation request, increasing the likelihood of SHA approval.
- **Maintains Regulatory Compliance**: Adheres to requirements that mandate doctors' consent for certain procedures and treatments.
- **Prevents Claim Denials**: Reduces the risk of pre-auth requests being denied due to missing or unverified medical consent.


### 1.2. Elective Preauth Doctor Approval Status Flow


When an elective preauth is created, it progresses through the following statuses:


| Status | Description |
| --- | --- |
| PENDING_DOCTOR_APPROVAL | The preauth has been created and a consent request has been sent to the doctor. Awaiting the doctor's response. |
| ACTIVE | The doctor has approved the consent request. The preauth is submitted to the payer (SHA) for review. |
| FINALISED | SHA has reviewed and approved the preauth. The service can proceed with financial coverage. |


---


## 2. The Full Preauth Doctor Consent Journey: Step-by-Step Doctor Approval


The complete Preauth Doctor Consent process is centred around the **Doctor Consent workflow**. This ensures medical approval is secured before a pre-authorisation can proceed.


### 2.1. Step 1: Doctor Consent Workflow


This foundational step involves prompting a consent request to be sent to the attending doctor on a preauth, and allowing them to approve or reject it.


This step is vital for ensuring every pre-authorisation request has explicit medical backing. Without the doctor’s consent, the preauth is incomplete and cannot be submitted to SHA.


---


## 3. Workflow Details: Doctor Consent


### 3.1. Workflow Description: Step-by-Step System Behavior


When a preauth request requires doctor consent, here’s what happens:


1. Consent Prompt Initiation
A request is triggered to send a consent prompt to the attending doctor.
2. Doctor and Facility Validation

Verify that the doctor exists in the health worker registry.
Check the facility’s registration and ability to transact.
Confirm the doctor has a valid KMPDC license.
3. Consent Request Delivery
The system sends an SMS (and optionally email) to the doctor with preauth details and a consent prompt.
4. Doctor Response Reception
The doctor responds via SMS (typically with a code) indicating approval or rejection.
5. Preauth Status Update
Based on the response, the system updates the pre-authorisation request accordingly.


---


### 3.2. Key Validations: Our System's Essential Checks


- Valid Doctor License (KMPDC)
Only doctors with a valid license can consent.
- Doctor Existence in Registry
The doctor must exist and be verifiable in the national health worker registry.
- Valid Facility
The facility must be registered and authorized to transact.
- Consent Request Delivery
The system must successfully send the SMS/email request to the doctor.
- Consent Response Handling
The system must be able to receive and process the doctor's response (typically SMS).


---


### 3.3. Expected Outcomes from this Workflow


- Success: Doctor Consent Approved
The request is sent and the doctor approves. The preauth now includes medical consent and may proceed.
- Success: Doctor Consent Rejected
The request is sent and the doctor rejects it. The preauth cannot continue and must be reviewed or cancelled.
- Failure: Invalid Doctor or Facility
The doctor or facility ID is missing, unregistered, or unauthorized. The consent request is blocked until valid details are provided.


---


## 4. Related Scenarios


- [Scenario 3: SHIF IP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)
- [Scenario 4: SHIF OP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth)

Last modified on
April 30, 2026
Close Claim
Claim Dispatch Process Overview

---

## Intervention Process Overview: Managing Patient Services

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/interventions/interventionProcessOverview](https://hie-docs.dha.go.ke/docs/claims/process/interventions/interventionProcessOverview)

# Intervention Process Overview: Managing Patient Services


## Intervention Process Overview: Managing Patient Services


### 1. Introduction: Understanding Interventions


This is a comprehensive guide providing a high-level overview of how we manage interventions, which are the specific healthcare services that providers give to patients covered under the Social Health Authority (SHA). This process covers the whole lifecycle of an intervention, including adding new ones, retiring existing ones, switching between them, and restoring previously retired interventions to a patient's visit, with all changes accurately reflected in the corresponding claim of the visit.


At its core, the Intervention Process is designed to ensure that a healthcare provider can accurately record the specific healthcare services provided to a patient and manage and modify these services as needed, depending on allowable scenarios. It's about maintaining a precise and verifiable record of all medical services a SHA-covered patient receives at a health facility, therefore enabling the health facility to submit an appropriate and accurate claim for payment for those services.


#### 1.1. Why This Full Process Matters


An accurate and well-managed Intervention Process is important for several critical reasons, as it ensures a clear and precise picture of all healthcare services provided during a patient's visit. It is crucial because it:


- **Provides a Comprehensive Record of Services**: This process ensures a precise and exhaustive account of all healthcare services delivered to a patient during their visit to a healthcare facility, supporting clinical accuracy and historical record-keeping.
- **Facilitates Efficient Claims Processing**: By enabling the accurate capture of interventions and their associated billing information, this process directly contributes to a smoother, faster, and more efficient claims submission and payment process, reducing discrepancies and delays.
- **Ensures Compliance and Auditability**: This process establishes a clear, auditable trail of all service modifications, which is vital for compliance and resolving any disputes related to services provided or claims submitted.


## 2. The Full Intervention Process Journey: Step-by-Step Management of Interventions


The complete intervention process is a multi-step journey, with each workflow building upon or providing management capabilities for the interventions recorded during a patient's visit. Here are the key workflows in their sequential order:


### 2.1. Step 1: Add New Intervention


This is the foundational step that enables the recording of any healthcare service. It allows for the addition of a new, valid intervention to a patient's existing visit record.


This workflow is crucial for establishing the initial record of all valid healthcare services provided to a patient covered under SHA. It also makes it possible to apply subsequent workflows, such as retiring or switching an intervention, as an intervention must first exist to be modified.


### 2.2. Step 2: Retire an Intervention


This workflow specifically allows for the logical removal or deactivation of an existing intervention from a patient's current visit record.


This workflow is important as it helps to correct inaccuracies or remove unnecessary interventions from a patient's visit record. For instance, if an intervention was mistakenly added or later deemed not applicable, it can be retired from the visit record to ensure claims accuracy.


### 2.3. Step 3: Switch Intervention


This workflow facilitates the replacement of one existing intervention with another specified intervention within a patient's visit record.


Depending on dynamic changes during a visit (e.g., a planned service change, or a more appropriate intervention is identified), there might be a need to swap one specified intervention for another. This workflow comes in handy for maintaining an accurate and flexible record of care.


### 2.4. Step 4: Restore Intervention


This workflow retrieves a previously retired intervention and reinstates its status to make it a valid and active intervention again for the patient's visit.


In cases of error where an intervention was mistakenly retired, or if circumstances change requiring its re-inclusion, this workflow provides the capability to restore it to the patient's visit record, ensuring data integrity and flexibility.


## 3. How Workflows Connect: The Power of Interdependency


While each workflow in the Intervention Process has a specific role, they are interconnected and data flows seamlessly with crucial cross-workflow validations ensuring integrity:


- **Foundational Dependence**: The Add New Intervention workflow is foundational. No other intervention management workflows (Retire, Switch, Restore) can operate unless an intervention has first been successfully added to a patient's visit.
- **Intervention State dependence**: Each subsequent workflow's operation is strictly dependent on the current status of an intervention. For example: An intervention must be an active and existing intervention before it can be retired or switched. Or only a previously Retired intervention can be restored. This prevents restoring an active intervention or an intervention that never existed.
- **Claim Reflection**: All changes made to interventions (Add, Retire, Switch, Restore) are designed to be accurately reflected in the patient's visit details, which directly impacts the generation and submission of the subsequent claim for that visit.


## 4. Key Success Factors for Overall Intervention Process Integration


For your integration with the entire Intervention Process to be successful and efficient, keep these overarching principles in mind:


- **Data Accuracy and Consistency**: Ensuring that intervention codes and associated details are consistently accurate at every stage (from adding to modifying) is paramount. Inaccurate data will lead to incorrect claims and hinder proper service management.
- **Strict Adherence to SHA Rules**: Understanding and implementing SHA's rules for adding, retiring, switching, and restoring interventions is vital. This includes rules around eligibility, service applicability, and timing to avoid rejections or compliance issues.
- **Error Handling and User Feedback**: Implement error detection and reporting at each step of the process. Clear, actionable feedback for users is essential to quickly resolve issues, whether due to invalid input, business rule violations, or technical glitches.
- **Auditability and Traceability**: Every change within the intervention lifecycle should be logged and traceable. This ensures accountability, supports dispute resolution, and aids in regulatory compliance checks.


By understanding and adhering to these principles, you can ensure a smooth, accurate, and effective integration with the Intervention Process, ultimately contributing to precise patient records, efficient claims processing, and improved quality of care.

Last modified on
April 30, 2026
Start Visit
Add Intervention

---

## Intervention Process Guide: Add New Intervention Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/interventions/addIntervention](https://hie-docs.dha.go.ke/docs/claims/process/interventions/addIntervention)

# Intervention Process Guide: Add New Intervention Workflow


## Intervention Process Guide: Add New Intervention Workflow


### 1. Overview: Adding a New Service to a Patient's Visit


This guide details the Add New Intervention Workflow, which is the foundational step in managing the specific healthcare services (interventions) provided to a patient during an active visit. This workflow allows healthcare providers to officially record a new service that has been rendered or is planned for a patient covered under the Social Health Authority (SHA).


It is all about ensuring that all services delivered are accurately captured against a patient's visit, which is crucial for maintaining precise patient records and for claims processing.


#### 1.1. What This Workflow Does


The Add New Intervention Workflow's main function is to record a specific new service to an existing, active patient visit. It accomplishes this by:


- **Receiving Authorization and Service Details**: It takes a consent_token (which signifies an active, authorized patient visit) and the intervention_code for the specific service being added.
- **Validating Service Appropriateness**: It performs checks to ensure the intervention_code is valid and adheres to combination rules with other services already on the visit, e.g. preventing a mix of inpatient and outpatient services.
- **Adding the Intervention**: Upon successful validation, the system adds this new intervention to the patient's visit record.
- **Updating Claim Information**: The addition of the intervention is subsequently reflected in the claim associated with that visit, ensuring accurate billing.


#### 1.2. Why This Workflow Is Critical (The "Why It Matters")


This workflow is vital because it represents the initial digital capture of services provided to a patient during their visit. Other reasons for having this workflow include:


- **Foundation for other intervention workflows**: It is a prerequisite for all other intervention management workflows (such as retiring or switching interventions), as an intervention must first be added before it can be modified.
- **Ensuring Accurate Patient Records**: By precisely documenting each service, we contribute to a comprehensive and accurate medical history for the patient, which is essential for continuous care and informed clinical decision-making.
- **Enabling Accurate Claims**: Every intervention added directly impacts the claim submitted for the visit. Accurate capture here is fundamental for correct and timely reimbursement to the healthcare provider.
- **Supporting Compliance**: Proper recording of interventions ensures compliance with SHA guidelines and other regulatory requirements regarding service documentation.


In short, this workflow ensures that the digital record of care accurately matches the care provided, laying the groundwork for all subsequent operational and financial processes.


## 2. Workflow Details: Adding an Intervention


This section details the step-by-step process for adding a new intervention to a patient's visit.


### 2.1. Step-by-Step System Behavior


1. Input Reception:
The system receives the consent_token for the patient's active visit and the intervention_code representing the new service to be added.
2. Authorization and Visit Context Check:
The system uses the provided consent_token to validate that the patient's visit is consented and active. This ensures that interventions are only added to ongoing and authorized encounters.
3. Intervention Code and Combination Validation:
The system performs checks on the intervention_code. It confirms that the intervention code is a valid service code. After this, it validates the combination of the intervention_code with any existing interventions already on the patient's visit. This includes ensuring that you cannot mix inpatient and outpatient interventions on the same visit. Specific combinations of intervention codes may also be restricted.
4. Add Intervention to Visit Record:
If all validations pass, the system proceeds to add the intervention_code to the active patient visit record.
5. Claim Reflection:
The addition of this intervention is automatically reflected in the claim associated with that patient visit, ensuring the claim accurately represents the services provided.


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant addition of interventions:


- **Active Consent/Visit State**: The system validates that the visit linked to the consent_token is still in an active state and that the patient's consent is valid. This prevents interventions from being added to closed or unconsented visits.
- **Valid Intervention Code**: The intervention_code must be a recognized and acceptable service code within the system. Ensures only legitimate services are recorded.
- **Intervention Combination Rules Check**: The system confirms that the new intervention_code does not violate any predefined rules regarding combinations of interventions already on the visit (e.g., no mixing of IP and OP interventions). Ensures data integrity and compliance with SHA rules.


### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow:


| Field Name | Description | Required | Purpose |
| --- | --- | --- | --- |
| consent_token | The authorization token for the patient's active visit. | Yes | Authorizes the action to add an intervention to the correct patient visit. |
| intervention_code | The unique code identifies the specific healthcare service you are trying to add. | Yes | Specifies the particular service being rendered or planned for the patient. |


### 2.4. Expected Outcomes


**Success: Intervention Successfully Added:** All inputs are valid, consent/visit was active, and the intervention_code successfully passed all combination rules and was added to the patient's visit record. Therefore patient's visit record is updated with the new service. This change will be reflected in the associated claim. The system can now proceed with other visit-related actions or add more interventions.


**Failure: Invalid Consent/Visit State:** The consent_token was invalid, expired, or the visit it references is no longer active. The intervention cannot be added. Ensure you are using a valid token for an active visit.


**Failure: Invalid Intervention Code:** The provided intervention_code is not recognised or is not a valid code. The intervention cannot be added. You need to verify and provide a correct intervention code.


**Failure: Intervention Combination Violation:** The intervention_code violates predefined rules when combined with other interventions already on the visit (e.g., attempting to add an Outpatient intervention to an Inpatient visit). The intervention cannot be added. Review the combination rules and ensure the service is appropriate for the current visit context.

Last modified on
April 30, 2026
Intervention Process Overview
Retire Intervention

---

## Intervention Process Guide: Switch Intervention Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/interventions/switchIntervention](https://hie-docs.dha.go.ke/docs/claims/process/interventions/switchIntervention)

# Intervention Process Guide: Switch Intervention Workflow


## 1. Overview: Changing a Service During a Patient's Visit


The Switch Intervention Workflow is a step that helps in managing healthcare services during an active patient visit. This workflow enables the replacement of an existing intervention with a different one within a patient's visit record. This helps in adapting to evolving patient needs, changes in treatment plans, or correcting previously recorded services.


This workflow ensures that the patient's visit record remains accurate and flexible, reflecting the most current and appropriate services being provided.


### 1.1. What This Workflow Does


The Switch Intervention Workflow's main function is to replace one intervention with another on an existing, active patient visit. It does this by:


- Receiving Authorization and Service Details: It takes a consent_token (which signifies an active, authorized patient visit) and the existing_intervention_code to be replaced, along with the new_intervention_code to switch to.
- Validating Switch Conditions: It performs a series of checks to ensure the switch is permissible. These validations include confirming the visit's active state, adhering to intervention combination rules, checking for pre-authorization requirements of the new intervention, ensuring compatible access points, and considering the presence of bill items or diagnoses for retention.
- Performing the Switch: Once the validation is successful, the system replaces the existing_intervention_code with the new_intervention_code in the patient's visit record.
- Managing Associated Data: It handles the retention of bill_items and diagnosis from the existing_intervention_code based on the retain_bill_items option and specific rules (e.g., when switching from per diem to surgical interventions).
- Updating Claim Information: The change in interventions is subsequently reflected in the claim associated with that visit, ensuring accurate billing.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


This workflow is absolutely vital because it provides the flexibility and accuracy needed to manage dynamic patient care during a visit. It's important as it helps:


- Adapting to Clinical Changes: Patient conditions can evolve, or a more suitable treatment might be identified. This workflow allows healthcare providers to quickly adjust the recorded services to match the actual care provided.
- Correcting Errors: If an incorrect intervention was initially added, this workflow offers a way to rectify it by switching to the correct one without fully removing and re-adding.
- Ensuring Accurate Claims: By ensuring the patient's record precisely reflects the services delivered, it directly contributes to generating accurate claims for reimbursement, preventing discrepancies and ensuring fair payment to facilities.
- Maintaining Data Integrity: It helps keep the patient's visit record clean and accurate, ensuring that only the services genuinely provided are documented.


In short, this workflow ensures the digital record of care remains flexible and precise, matching the dynamic nature of patient treatment and supporting efficient, compliant financial processes.


---


## 2. Workflow Details: Switching an Intervention


This section details the step-by-step process for switching one intervention for another on a patient's visit.


### 2.1. Step-by-Step System Behavior


1. Input Reception: The system receives the consent_token for the patient's active visit, the existing_intervention_code to be replaced, the new_intervention_code to switch to, and the retain_bill_items option. Optionally, bill_from and bill_to timestamps may be provided if retain_bill_items is true.
2. Authorization and Visit Context Check: The system uses the provided consent_token to validate that the patient's visit and associated consent are still in an active state. This ensures interventions are only managed for ongoing and authorized encounters.
3. Intervention Switch Condition Validation: The system performs crucial checks on both the existing_intervention_code and the new_intervention_code, as well as their context within the visit. It checks the following:


Combination Rules: Confirms that the new_intervention_code adheres to acceptable combination rules with other interventions already on the visit (e.g., preventing mixing of Inpatient (IP) and Outpatient (OP) interventions).


Pre-Authorization Check: Verifies that the new_intervention_code does not require an elective pre-authorization from SHA.


Access Point Compatibility: Ensures that the new_intervention_code has the same access point (e.g., Inpatient, Outpatient, or both) as the existing_intervention_code.


Specific Combination Restrictions: Checks for specific rules where interventions cannot be combined (e.g., for imaging services, patients might need to be discharged before certain switches can occur).


Bill Item/Diagnosis Retention Rules: Verifies if bill_items and diagnosis can be retained based on the retain_bill_items flag and specific rules (e.g., these items can be retained unless switching from a 'per diem' intervention to a 'surgical' one).
4. Perform Intervention Switch: If all validations pass, the system proceeds to replace the existing_intervention_code with the new_intervention_code in the patient's visit record. This includes handling the retention or removal of associated bill items and diagnoses as per the rules.
5. Claim Reflection: The switch of this intervention is automatically reflected in the claim associated with that patient visit, ensuring the claim accurately represents the services provided.


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant switching of interventions:


- Active Consent/Visit State: The visit linked to the consent_token must be in an active state, and the patient's consent must be valid.
- Valid Existing and New Intervention Codes: Both the existing_intervention_code and new_intervention_code must be recognized and valid service codes.
- Intervention Combination Rules Adherence: The combination of the new_intervention_code with other existing interventions on the visit must be allowed.
- No Elective Pre-Authorization for New Intervention: The new_intervention_code must not require an elective pre-authorization from SHA.
- Bill Item and Diagnosis Retention Rules: Validates whether bill_items and diagnosis can be retained based on the retain_bill_items option and specific rules.
- Same Access Point: The new_intervention_code must have the same access point as the existing_intervention_code.
- No Conflicting Intervention Combinations: Checks for rules where certain interventions cannot be combined.
- Existing Intervention is Active on Visit: The existing_intervention_code must be currently active on the patient’s visit.


### 2.3. Workflow Data Dictionary


| Field Name | Description | Required | Purpose |
| --- | --- | --- | --- |
| consent_token | The authorization token for the patient's active visit | Yes | Authorizes the action to switch interventions for the correct patient visit |
| existing_intervention_code | Unique code identifying the service to switch from | Yes | Specifies the intervention to be replaced on the patient's visit |
| new_intervention_code | Unique code identifying the service to switch to | Yes | Specifies the new intervention that will replace the existing one |
| retain_bill_items | Flag indicating whether to retain bill items | Yes | Determines if financial records from the old intervention should be retained |
| bill_from | Start date of the previous intervention (if retaining bills) | Yes/No | Specifies start date for retaining bill items |
| bill_to | End date of the previous intervention (if retaining bills) | Yes/No | Specifies end date for retaining bill items |


### 2.4. Expected Outcomes


- Success: Intervention Successfully Switched: All inputs were valid, consent_token was active, and existing_intervention_code was successfully replaced with new_intervention_code after validations. Associated bill items and diagnoses handled as specified. Patient record and claim updated.
- Failure: Invalid Consent/Visit State: The consent_token was invalid, expired, or the visit is no longer active.
- Failure: Invalid Intervention Codes: Either existing_intervention_code or new_intervention_code is not valid.
- Failure: Switch Condition Violation: The switch violated one or more predefined rules (e.g., mixing IP/OP, pre-auth required, access mismatch).
- Failure: Bill Item/Diagnosis Retention Conflict: Retention not possible due to conflicting rules (e.g., switching from per diem to surgical). User must adjust the retain_bill_items flag or accept that retention isn’t allowed.
- Failure: Intervention Not Found or Not Active: The existing_intervention_code is not active on the patient’s visit. User needs to verify the code and status.

Last modified on
April 30, 2026
Retire Intervention
Restore Intervention

---

## Intervention Process Guide: Retire Intervention Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/interventions/retireIntervention](https://hie-docs.dha.go.ke/docs/claims/process/interventions/retireIntervention)

# Intervention Process Guide: Retire Intervention Workflow


## Intervention Process Guide: Remove Intervention Workflow


### 1. Overview: Removing a Service from a Patient's Visit


This guide expounds on the Remove Intervention Workflow, a key step in managing healthcare services (interventions) during an active patient visit. This workflow allows healthcare providers to remove a specific service that has been previously added to a patient's visit record. This action is important in correcting errors, adapting to changes in care during the visit, and ensuring that only actually delivered services are accounted for in the final claim.


This workflow is about maintaining the accuracy and integrity of a patient's visit record by making precise adjustments to the services listed.


#### 1.1. What This Workflow Does


The Remove Intervention Workflow's main function is to eliminate a specific service from an existing, active patient visit. It accomplishes this by:


- Receiving Authorisation and Service Details: It takes a consent_token (which signifies an active, authorised patient visit) and the intervention_code for the specific service to be removed.
- Validating Removal Conditions: It performs essential checks to ensure the intervention can be removed. These checks include confirming the visit's active state, and ensuring the intervention does not have associated bill items, diagnoses, or is not a 'per diem' type.
- Removing the Intervention: Upon successful validation, the system removes the specified intervention from the patient's visit record.
- Updating Claim Information: The removal of the intervention is subsequently reflected in the claim associated with that visit, ensuring accurate billing.


#### 1.2. Why This Workflow Is Critical (The "Why It Matters")


This workflow is vital because it ensures the accuracy and flexibility of patient service records during an ongoing visit. Its criticality stems from:


- Correcting Errors: It provides a mechanism to rectify mistakes, such as an intervention being mistakenly added to a patient's visit.
- Adapting to Care Changes: During a visit, patient needs or care plans might change. This workflow allows for services that are no longer applicable or were not performed to be removed.
- Ensuring Accurate Claims: By removing unnecessary or incorrect interventions, it directly contributes to generating precise claims for reimbursement, preventing over-billing or discrepancies.
- Maintaining Data Integrity: It helps keep the patient's visit record clean and accurate, reflecting only the services that were genuinely provided and are relevant.


In short, this workflow ensures that the digital record of care accurately reflects the actual care delivered, enhancing data integrity and supporting precise financial processes.


---


### 2. Workflow Details: Removing an Intervention


This section details the step-by-step process for removing an intervention from a patient's visit.


#### 2.1. Step-by-Step System Behavior


1. Input Reception: The system receives the consent_token for the patient's active visit and the intervention_code representing the service to be removed.
2. Authorisation and Visit Context Check: The system uses the provided consent_token to validate that the patient's visit and associated consent are still in an active state. This ensures interventions are only managed for ongoing and authorised encounters.
3. Intervention Removal Condition Validation: The system conducts essential checks on the intervention code and its status. It verifies that the intervention being removed has no associated bill items. Additionally, it confirms that there is no linked diagnosis for the intervention. The system also checks that the intervention is not classified as a per diem type. Finally, it validates that the intervention_code is recognised and currently active for the visit.
4. Remove Intervention from Visit Record: If all validations pass, the system proceeds to remove the specified intervention_code from the patient's visit record.
5. Claim Reflection: The removal of this intervention is automatically reflected in the claim associated with that patient visit, ensuring the claim accurately represents the services provided.


#### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant removal of interventions:


- Active Consent/Visit State: The visit linked to the consent_token must be in an active state, and the patient's consent must be valid. Prevents interventions from being removed from closed or unauthorised visits.
- Intervention Has No Bill Item: The intervention being removed must not have any associated bill items. Prevents discrepancies where a service might be removed but has already been billed.
- Intervention Has No Diagnosis: The intervention being removed must not have a diagnosis linked to it. Ensures clinical consistency, as a diagnosis usually confirms a service was rendered and necessary.
- Intervention Is Not Per Diem: The intervention being removed must not be a 'per diem' intervention type. Per diem charges are often fixed daily rates and may have different removal rules.
- Intervention Exists and is Active on Visit: The intervention_code must correspond to an intervention that was previously added and is currently active on the patient's visit. You can only remove an intervention that exists and is currently active.


#### 2.3. Workflow Data Dictionary


This table outlines the key information used and produced by this workflow:


| Field Name | Description | Required | Purpose |
| --- | --- | --- | --- |
| consent_token | The authorisation token for the patient's active visit. | Yes | Authorises the action to remove an intervention from the correct patient visit. |
| intervention_code | The unique code identifies the specific healthcare service you are trying to remove. | Yes | Specifies the particular service to be removed. |


#### 2.4. Expected Outcomes


- Success: Intervention Successfully Removed: All inputs are valid, consent/visit was active, and the intervention successfully passed all removal conditions and was removed from the patient's visit record. The patient's visit record is updated, and the removed service is no longer considered for billing. The system can now proceed with other visit-related actions or further intervention management.
- Failure: Invalid Consent/Visit State: The consent_token was invalid, expired, or the visit it references is no longer active. The intervention cannot be removed. Ensure you are using a valid token for an active visit.
- Failure: Intervention Cannot Be Removed (Validation Failed): The intervention could not be removed because it violated one or more of the predefined rules (e.g., it has a bill item, a diagnosis, or is a per diem intervention). The intervention cannot be removed under the current conditions. Needs to address the specific reason for the rejection (e.g., remove associated bill items or diagnoses first, or confirm it's not a per diem type).

Last modified on
April 30, 2026
Add Intervention
Switch Intervention

---

## Intervention Process Guide: Restore Intervention Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/interventions/restoreIntervention](https://hie-docs.dha.go.ke/docs/claims/process/interventions/restoreIntervention)

# Intervention Process Guide: Restore Intervention Workflow


## 1. Overview: Reinstating a Previously Removed Service to a Patient's Visit


The Restore Intervention Workflow, the final step in managing healthcare services during an active patient visit. This workflow allows healthcare providers to reinstate a specific service (intervention) that was previously removed from a patient's visit record. This functionality is crucial for correcting errors or re-including services that become relevant again during the course of care.


At its core, this workflow ensures that the patient's visit record accurately reflects all services provided, even those that were temporarily removed.


### 1.1. What This Workflow Does


The Restore Intervention Workflow's primary function is to reactivate a specific intervention that was previously removed from an existing, active patient visit. It accomplishes this by:


- Receiving Authorization and Service Details: It takes a consent_token (which signifies an active, authorized patient visit) and the intervention_code for the specific service to be restored.
- Validating Restoration Conditions: It performs a series of crucial checks to ensure the restoration is permissible. These validations include confirming the visit's active state, ensuring the intervention was indeed previously removed, and adhering to complex combination rules (e.g., preventing mixing of surgical/per diem, capitation/non-capitation, and inpatient/outpatient interventions). It also checks for the requirement of a diagnosis and absence of attachments.
- Reinstating the Intervention: Upon successful validation, the system reactivates the specified intervention, adding it back to the patient's visit record.
- Updating Claim Information: The reinstatement of the intervention is subsequently reflected in the claim associated with that visit, ensuring accurate billing.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


This workflow is absolutely vital because it provides the ability to correct records and adapt to dynamic care scenarios after an intervention has been removed. It is crucial in:


- Correcting Errors: It offers a crucial mechanism to reverse mistakes, such as an intervention being inadvertently removed from a patient's visit.
- Adapting to Evolving Care: Patient needs or treatment plans might shift, making a previously removed service relevant again. This workflow allows for flexible adjustments to the recorded care.
- Ensuring Accurate Claims: By reinstating necessary interventions, it directly contributes to generating precise claims for reimbursement, ensuring all provided services are correctly accounted for.
- Maintaining Data Integrity: It helps keep the patient's visit record comprehensive and accurate, reflecting the complete picture of services rendered throughout the encounter.


In short, this workflow ensures the digital record of care remains accurate and adaptable, supporting both clinical precision and compliant financial processes.


---


## 2. Workflow Details: Restoring an Intervention


This section details the step-by-step process for restoring an intervention to a patient's visit.


### 2.1. Step-by-Step System Behavior


1. Input Reception: The system receives the consent_token for the patient's active visit and the intervention_code representing the service to be restored.
2. Authorization and Visit Context Check: The system uses the provided consent_token to validate that the patient's visit and associated consent are still in an active state. This ensures interventions are only managed for ongoing and authorized encounters.
3. Intervention Restoration Condition Validation: The system performs crucial checks on the intervention_code and its potential impact on the existing visit.

Surgical/Per Diem Mix: It verifies that if active interventions are surgical, a per diem intervention cannot be restored, and vice versa.
Capitation Claim Limit: It checks that restoring a capitation intervention will not violate the "one capitation claim, per patient, per day" rule.
Diagnosis Requirement: It ensures that the intervention being restored has a diagnosis associated with it, as required.
No Attachments: It verifies that the intervention being restored does not have any attachments.
Capitation Mix: It confirms that restoring a capitation intervention will not lead to mixing capitation interventions with non-capitation interventions on the same visit.
Combination Rules: It validates that the combination of the restored intervention with any existing active interventions on the visit is as expected and allowed (e.g., you cannot mix Inpatient (IP) and Outpatient (OP) interventions).
4. Reactivate Intervention on Visit Record: If all validations pass, the system proceeds to reactivate the specified intervention_code on the patient's visit record, changing its status from removed back to active.
5. Claim Reflection: The reinstatement of this intervention is automatically reflected in the claim associated with that patient visit, ensuring the claim accurately represents all services provided.


---


### 2.2. Key Validations


These are the critical checks performed during this workflow to ensure the accurate and compliant restoration of interventions:


- Active Consent/Visit State: The visit linked to the consent_token must be in an active state, and the patient's consent must be valid. This prevents interventions from being restored to closed or unauthorized visits.
- Intervention Previously Removed: The intervention_code must correspond to an intervention that was previously removed from this specific patient's visit. This ensures you can only restore an intervention that was previously taken off the record.
- Surgical/Per Diem Combination Restriction: If active interventions are surgical, a per diem intervention cannot be restored, and vice versa. This enforces specific billing and service delivery categories, preventing incompatible service types from being active concurrently.
- One Capitation Claim, Per Patient, Per Day: Restoring a capitation intervention must not violate this rule. This ensures compliance with capitation billing limits and prevents over-claiming for services funded through capitation.
- Requires One Diagnosis: The intervention being restored must have a diagnosis associated with it. This helps ensure clinical justification for the service is present upon restoration.
- No Attachments: The intervention being restored must not have any attachments.
- Capitation Interventions Cannot Mix with Non-Capitation: Restoring a capitation intervention must not lead to a mix with non-capitation interventions on the same visit. This helps maintain distinct billing and funding categories within a single visit, crucial for SHA compliance.
- Intervention Combination Rules Adherence (IP/OP Mix): The combination of the restored intervention with any existing active interventions on the visit must be allowed (e.g., you cannot mix Inpatient (IP) and Outpatient (OP) interventions). It ensures data integrity and compliance with billing and service delivery guidelines.


---


### 2.3. Workflow Data Dictionary


| Field Name | Description | Required | Purpose |
| --- | --- | --- | --- |
| consent_token | The authorization token for the patient's active visit | Yes | Authorizes the action to restore an intervention to the correct patient visit. |
| intervention_code | The unique code identifying the specific healthcare service you are trying to restore | Yes | Specifies the particular service to be reactivated on the patient's visit. |


---


### 2.4. Expected Outcomes


- Success: Intervention Successfully Restored
All inputs were valid, consent/visit was active, and the intervention successfully passed all restoration conditions and was reactivated on the patient's visit record. The patient's visit record is updated, and the restored service will now be considered for billing. The system can proceed with other visit-related actions.
- Failure: Invalid Consent/Visit State
The consent_token was invalid, expired, or the visit it references is no longer active. The intervention cannot be restored. The user must ensure they are using a valid token for an active visit.
- Failure: Intervention Cannot Be Restored (Validation Failed)
The intervention could not be restored because it violated one or more of the predefined rules (e.g., mixing surgical/per diem, capitation limits, missing diagnosis, or combination rules). The intervention cannot be restored under the current conditions. The user needs to address the specific reason for the rejection (e.g., adjust other interventions, provide diagnosis).

Last modified on
April 30, 2026
Switch Intervention
Preauths Process Overview

---

## Billing Workflows Process Overview: Streamlining Financial Transactions in Healthcare

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/billingProcessOverview](https://hie-docs.dha.go.ke/docs/claims/process/billing/billingProcessOverview)

# Billing Workflows Process Overview: Streamlining Financial Transactions in Healthcare


## 1. Introduction: Understanding Billing Workflows


Billing workflows overview docs provide a high-level overview of how the financial transactions and associated data related to patient visits and claims are managed.


The Billing Workflows are designed to ensure the accurate and efficient handling of billable items, diagnoses, and supporting documents on a claim. It's about moving from an unbilled or partially billed visit to a fully reconciled and auditable claim ready for processing.


### 1.1. Why This Full Process Matters


A robust and accurate Billing Workflows is key to efficient, fair, and compliant healthcare delivery. It is crucial because it:


- **Ensures Financial Accuracy**: Prevents incorrect billing by enforcing financial limits and valid scheme allocations.
- **Maintains Claim Integrity**: Ensures all claims are associated with correct patient visits, interventions, and supporting diagnoses/attachments.
- **Improves Auditability**: Provides a clear, documented record of all changes to billing items, diagnoses, and attachments, which is important for compliance and dispute resolution.
- **Facilitates Seamless Processing**: By ensuring data quality and adherence to rules, it enables smoother subsequent steps like claim submission and payment reconciliation.


---


## 2. The Full Billing Workflows Journey: Step-by-Step Claim Management


The Billing Workflow is a multi-step process, with each workflow enabling specific modifications to a patient's claim. Here are the key workflows that are part of the Billing Workflows process:


### 2.1. Step 1: Add new line


This is an important step where new billable items (services or products) are added to an existing claim for a patient visit.


It is important as it allows providers to accurately record all rendered services and associated costs, forming the basis of the claim's financial segment. It includes important validations for financial limits and scheme applicability.


### 2.2. Step 2: Remove line


This workflow allows for the removal of an existing bill item from a claim, mainly used to correct errors or reverse charges.


This workflow's importance is that it ensures only valid and accurate charges remain on a claim, maintaining the financial accuracy of the claim. There is a specific validation for per diem interventions.


### 2.3. Step 3: Add Diagnosis


This workflow adds a new ICD-11 diagnosis code to a specific intervention within a claim.


Proper diagnosis linkage to a claim is important to validate the medical necessity and claim approval. It includes validations for diagnosis acceptance, activity, and weight for capitation.


### 2.4. Step 4: Remove Diagnosis


This workflow facilitates the removal of an ICD-11 diagnosis code from an existing visit intervention on a claim.


This workflow allows for correction of incorrectly attached diagnoses, ensuring the claim accurately reflects the patient's condition and the services provided.


### 2.5. Step 5: Add Attachment


This workflow adds a new attachment (e.g., medical reports, invoices) to an existing visit intervention on a claim.


Supporting documents are often required for claim substantiation, especially for complex cases or specific interventions. The attachment must be tied to an active intervention.


### 2.6. Step 6: Remove Attachment


This workflow allows for the removal of an existing attachment from a visit intervention on a claim.


Enables the cleanup of wrongly placed or outdated attachments, ensuring the claim documentation is accurate and relevant.


---


## 3. How Workflows Connect: The Power of Interdependency


While each workflow has a specific role, they are all interconnected, creating a system for claim management. They show interdependency in the following ways:


- **Consistent Patient Context**: Every workflow requires a `consent_token`, ensuring that all billing actions are performed within the context of a valid and active patient visit.
- **Intervention-Centric Operations**: Diagnoses and attachments are consistently linked to specific `intervention_code`s within the claim. This ensures that supporting information directly relates to the services provided.
- **Claim-Level Integrity**: `invoice_number` and `line_id` (or `line_number`) ensure that line item modifications (add/remove lines) accurately target specific entries on a given invoice/claim.
- **Cascading Validations**: The financial validations checks for "Add new line" workflow influence the allowed financial amounts, ensuring that additions adhere to established financial policies. Similarly, removing lines has specific validations that prevent invalid operations (e.g., removing per diem interventions).


---


## 4. Key Success Factors for Overall Billing Workflows Integration


For your integration with the entire Billing Workflows process to be successful and efficient, keep these overarching principles in mind:


- **Accurate consent_token Usage**: Always provide the correct and active `consent_token` for the patient visit to authorise any billing modification.
- **Adherence to Validations**: Understand and implement logic to respect the various validations (e.g., financial limits, scheme codes, per diem rules) specified for each workflow. Proactively validating data on your end can reduce rejections.
- **Correct Identifier Usage**: Ensure accurate use of unique identifiers like `invoice_number`, `line_id`, `attachment_id`, and `intervention_code` to target the correct entities for modification.
- **Understanding Document and Diagnosis Types**: For "Add Attachment" and "Add Diagnosis," be aware of the specific types and codes accepted by the system to ensure successful uploads and linkages.


By understanding and adhering to these factors, you can ensure a smooth, accurate, and effective integration with the Billing Workflows.


---


## 5. Related Resources


- [Scenario 1: SHIF IP Per Diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)
- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Scenario 3: SHIF IP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)
- [eClaims API Reference](https://hie-docs.dha.go.ke/eclaims)

Last modified on
April 30, 2026
Cancel Preauth
Add New Line

---

## Billing Workflows Process Guide: Add new line Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/addNewLine](https://hie-docs.dha.go.ke/docs/claims/process/billing/addNewLine)

# Billing Workflows Process Guide: Add new line Workflow


## 1. Overview: Adding Billable Items to a Claim


This guide focuses on the Add new line workflow, which is an essential step in the broader Billing Workflows Process. Think of it as the mechanism for ensuring all services and items provided during a patient's visit are accurately recorded and billed. This workflow's main work is to incorporate new, valid billable items into an existing patient claim.


### 1.1. What This Workflow Does


The Add new line workflow's main function is to append a new invoice line item, representing a billable service or product, to a patient's current claim. It receives specific details about the item, its cost, quantity, and the intended billing scheme, then applies a series of validations to append it.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Getting billable items added right from the beginning is important for accurate financial management and claim processing. The workflow is therefore essential in the following ways:


- **Accurate billing and revenue collection**: It ensures that services or items are properly added with the right information, making sure that the facility will be properly reimbursed for care provided to a patient.
- **Claim Acceptance**: Correct and compliant line items (e.g., not exceeding tariffs, valid scheme codes) lead to the claim being accepted by the payer.
- **Financial Accuracy**: Accurate billing leads to matches between services rendered and payments received, leading to easy reconciliation and correct financial records.
- **Audit compliance**: Having the proper documentation for each billable item makes claims easily audited and provides transparency and visibility.


In short, this workflow is the foundation for accurate claim amounts. It ensures that every subsequent step of the Billing Workflows Process is built on the right financial information.


---


## 2. Workflow Details: Add new line


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request to add a new bill item to a claim comes into our system, here's the internal process that unfolds:


1. Input Reception: The system first receives the consent_token for the active patient visit, along with details of the new line item: intervention_code, charge_date, invoice_number, unit_price, quantity, scheme_name, scheme_code, and an optional line_number.
2. Visit and Consent Validation: The system immediately validates the provided consent_token to confirm that the patient's visit is still active/open and that the consent is valid.
3. Financial and Scheme Validation:

The system calculates the total bill amount for the new line item (and the cumulative claim).
It checks if the bill amount is less than the keph level tariff or the overall tariff.
If the scheme_code is 'PMF', it verifies that the bill amount is less than the PMF balance + ex gratia.
It ensures that the scheme_code and scheme_name provided for the invoice line are valid and recognised by the system.
If the intervention_code is a ‘per diem’ intervention, the system checks that the bill from and bill to dates are present for the invoice line.
It also handles cases where an intervention falls under both UHC and PMF, splitting the bill to exhaust UHC first if the amount exceeds the tariff.
4. Item Addition: If all validations pass, the system proceeds to add the new line item to the patient's claim, associating it with the specified intervention_code and invoice_number.


### 2.2. Key Validations: Our System's Essential Checks


There are some essential checks our system performs behind the scenes to ensure a successful and accurate "Add new line" operation. Understanding these helps you provide the correct information from your end, preventing errors.


- Active Visit/Consent Validation:
The consent_token provided must correspond to a patient visit that is currently open and active.
- Bill Amount vs. Tariff/Balance Validation:
The financial amount must adhere to the maximum allowed tariffs or available PMF balance + ex gratia.
- Valid Scheme Code/Name:
Every invoice line must be associated with a valid scheme_code (e.g., UHC, PMF) and scheme_name.
- Per Diem Intervention Date Validation:
If the intervention_code indicates a 'per diem' service, the line must include valid bill from and bill to dates.
- UHC/PMF Bill Splitting Logic:
If an intervention falls under both UHC and PMF and exceeds the KEPH level tariff, the bill will be split to prioritise UHC.


### 2.3. Workflow Data Dictionary: What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | string | Yes | Authorises the billing action for the correct patient and active visit. |
| intervention_code | The code for the intervention you are trying to add. | string | Yes | Specifies the particular service or item being billed. |
| charge_date | The charge date for the item. Defaults to today. | ISO 8601 datetime | No | Records when the item was provided/charged. |
| invoice_number | Unique reference to the invoice from the provider. | string | Yes | Links to internal billing records, essential for tracking/auditing. |
| unit_price | The unit price charged for this item. | float (2dp) | Yes | Defines cost per unit of service/item. |
| quantity | Quantity of the item. Defaults to 1. | float (2dp) | No | Number of units provided. |
| scheme_name | Name of the scheme you intend to bill to. | string | No | Human-readable name for payer. |
| scheme_code | Code you intend to bill against. | string | Yes | Standard code that directs billing to the correct payer. |
| line_number | Unique identifier for the invoice line/item. | string | No | Internal line reference for easier cross-referencing. |


### 2.4. Expected Outcomes from this Workflow


When you query this workflow, here's what you can expect in return:


- **Success**: Line Item Added to Claim – the system adds the item and passes all validations.
- **Failure**: Invalid Visit/Consent – the `consent_token` is invalid, expired, or visit is closed.
- **Failure**: Financial Limit Exceeded – the `unit_price` or total bill exceeds allowed tariffs or balances.
- **Failure**: Invalid Scheme Information – unrecognised `scheme_code` or `scheme_name`.
- **Failure**: Missing Per Diem Dates – for per diem services, `bill from` / `bill to` dates are required.
- **Failure**: Missing Required Data – any required field (e.g., `consent_token`, `intervention_code`, `invoice_number`, `unit_price`, `scheme_code`) is missing or malformed.

Last modified on
April 30, 2026
Billing Process Overview
Remove Line

---

## Edit Claim Line Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/editClaimLine](https://hie-docs.dha.go.ke/docs/claims/process/billing/editClaimLine)

# Edit Claim Line Workflow Guide


## Edit Claim Line Workflow: Adjusting Amount and Quantity After Resubmission


### 1. Overview


This guide explains the Edit Claim Line workflow, which allows providers to adjust the unit price and quantity of a claim line after a claim has been resubmitted and transitioned to an editable status (`DRAFT_RESUBMIT`). This workflow is designed to enable corrections while maintaining strict controls to prevent fraud.


#### 1.1. What This Workflow Does


The Edit Claim Line workflow enables providers to:


- **Edit Amount and Quantity:** Adjust only the unit price and quantity for a specific claim line.
- **Ensure Data Integrity:** Restrict edits to prevent unauthorized changes to other claim details.
- **Prepare for Accurate Resubmission:** Make necessary corrections before the claim is resubmitted for payer review.


#### 1.2. Why This Workflow Is Critical


- **Prevents Fraud:** Only amount and quantity can be changed, reducing risk of manipulation.
- **Improves Accuracy:** Providers can fix errors flagged by the payer or internal checks.
- **Speeds Up Processing:** Ensures claims are correct before final resubmission.


---


### 2. Workflow Details: Edit Claim Line


![](https://hie-docs.dha.go.ke/)


#### 2.1. Workflow Description


When a provider needs to edit a claim line, the following steps occur:


1. **Input Reception:** The provider submits a request with the claim’s consent token and the line ID to be edited.
2. **Validation:** The system checks that the claim is in an editable status (`DRAFT_RESUBMIT`) and that the line exists.
3. **Edit Action:** The provider specifies the new unit price and quantity for the claim line.
4. **Outcome Delivery:** The system updates the claim line and returns the revised details for review.


#### 2.2. Key Validations: System Checks


- **Editable Status Required:**

 The claim must be in `DRAFT_RESUBMIT` status to allow edits.
- **Valid Consent Token and Line ID:**

 Both must be provided and match an existing claim and line.
- **Allowed Fields:**

 Only `unit_price` and `quantity` can be changed.


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | Unique code for the claim | String | Yes | Identifies which claim to edit |
| line_id | Unique identifier for the claim line | String | Yes | Specifies which line to edit |
| unit_price | Adjusted unit price for the line | Number | Yes | New price for the claim line |
| quantity | Adjusted quantity for the line | Integer | Yes | New quantity for the claim line |


#### 2.4. Expected Outcomes from this workflow


- **Successful Edit:** The claim line is updated with the new amount and quantity.
- **Edit Not Allowed:** The claim is not in an editable status or the line does not exist.
- **Input Error:** Provided identifiers or values are invalid.


---


### 3. Example API Usage


**Endpoint:**

`PATCH /adapter/facade/is/v1/invoice_lines/adjust_virtual_claim_line`


**Request Body Example:**


```json
{
  "consent_token": "DCW9JXNMDY",
  "line_id": "8d7dabfd-03ef-44fa-bfef-b360907a1cf2",
  "unit_price": 1000,
  "quantity": 1
}
```


**Response Example:**


```json
{
  "invoice": "11111111-d51c-4e91-91d0-24c8155f85bc",
  "item_code": "SHA-07-005",
  "item_name": "Post-partum Complications",
  "charge_date": "2025-09-23T15:24:23.182593+03:00",
  "unit": "DAYS",
  "unit_price": "1000.00",
  "quantity": 1,
  "line_total_amount": "1000.00",
  "line_net_amount": "1000.00",
  "id": "8d7dabfd-03ef-44fa-bfef-b360907a1cf2",
  "intervention_code": "SHA-07-005",
  "scheme_code": "UHC",
  "scheme_name": "SOCIAL HEALTH AUTHORITY",
  "bill_from": "2025-09-23T15:02:21.885861+03:00",
  "bill_to": "2025-09-23T15:24:23.174440+03:00",
  "is_active": true
}
```


---


### 4. How Edit Claim Line Connects to Other Workflows


- **Resubmit Claim:** Must be performed after the claim is transitioned to `DRAFT_RESUBMIT`.
- **Preview & Submission:** After edits, the claim can be previewed and resubmitted to the payer.
- **Audit Trail:** All edits are tracked for compliance and fraud prevention.


---


### 5. Key Success Factors for Edit Claim Line Workflow


- **Use Valid Identifiers:** Always provide the correct consent token and line ID.
- **Edit Only Allowed Fields:** Restrict changes to amount and quantity.
- **Review Before Submission:** Ensure all edits are accurate before resubmitting the claim.
- **Maintain Compliance:** Follow regulatory standards during claim editing.


---

Last modified on
April 30, 2026
Resubmit Claim
Close Claim

---

## Billing Workflows Process Guide: Remove line Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/removeLine](https://hie-docs.dha.go.ke/docs/claims/process/billing/removeLine)

# Billing Workflows Process Guide: Remove line Workflow


## 1. Overview: Deleting Billable Items from a Claim


This guide focuses on the Remove line workflow, a crucial stage in our broader Billing Workflows Process. It is a mechanism for correcting or reversing previously added billable items on a patient's claim. The primary function of this workflow is to accurately remove an existing invoice line item from a claim.


### 1.1. What This Workflow Does


The Remove line workflow's main function is to accurately identify and delete a specific line item that has already been added to a patient's claim for an existing visit. This is done by taking unique identifiers for the claim and the line item itself, ensuring that only the intended item is removed, while also performing an important validation on the intervention's payment mechanism.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Being able to accurately remove billable items is important for maintaining the financial integrity and accuracy of a patient's claim. Having a precise and compliant line item removal process brings several benefits:


- **Precise billing and patient satisfaction**: Correctly billed services can be easily removed, leading to patients being charged for services they only received or that were corrected.
- **Claim Accuracy**: Erroneous line items on a claim are removed, and this can resolve any disputes with payers and simplify the reconciliation process.
- **Audit Successes**: The ability to correct billing errors post-addition can lead to compliance during audits and avoidance of potential penalties.
- **Operational Efficiency**: Manual or cumbersome processes for removing line items are resolved with this, hence reducing delays and decreasing administrative burden.


This workflow is key to ensuring claim accuracy and flexibility. It ensures that billing information remains truthful and adaptable to changes, supporting the overall integrity of the Billing Workflows Process.


---


## 2. Workflow Details: Remove line


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request to remove a line item from an existing claim is received, here's the internal process that unfolds:


1. **Input Reception**: The system first receives the `consent_token` for the active patient visit, the `invoice_number` of the claim, and either the `line_number` or, preferably, the `line_id` of the item to be removed.
2. **Visit and Consent Validation**: The system immediately validates the provided `consent_token` to confirm that the patient's visit is still active/open and that the consent is valid.
3. **Line Item Identification**: Using the `invoice_number` and `line_id` (or `line_number`), the system locates the specific bill item on the claim.
4. **Intervention Payment Mechanism Validation**: The system performs a critical check: it validates that the intervention associated with the line item being removed does not have a 'per diem' payment mechanism.
5. **Line Item Removal**: If all validations pass and the item is found, the system proceeds to remove the specified line item from the patient's claim.


### 2.2. Key Validations: Our System's Essential Checks


There are some essential checks our system performs behind the scenes to ensure a successful and accurate "Remove line" operation. Understanding these helps you provide the correct information from your end, preventing errors.


- Active Visit/Consent Validation:
The consent_token provided must correspond to a patient visit that is currently open and active. This ensures billing modifications are only made on valid patient encounters.
- Line Item Existence:
The combination of invoice_number and line_id (or line_number) must precisely identify an existing line item on the claim. This prevents accidental deletion or deletion of non-existent items.
- Non-Per Diem Intervention Validation:
The intervention associated with the item must not be classified with a 'per diem' payment mechanism. Such services are billed by day and need special handling for removal.


### 2.3. Workflow Data Dictionary (Conceptual): What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | string | Yes | Authorises the billing modification action for the correct patient and visit. |
| invoice_number | Unique reference to the invoice from the provider. | string | Yes | Identifies the specific claim or invoice from which the line is to be removed. |
| line_number | Identifier for the invoice line/item within invoice. | string | No | Alternative/additional way to identify the specific item internally. |
| line_id | System-generated GUID for the invoice line item. | string | Yes | Most reliable identifier for targeting the correct line item. |


### 2.4. Expected Outcomes from this Workflow


When you query this workflow, here's what you can expect in return:


- **Success**: Line Item Removed from Claim – the item is successfully removed after all validations pass.
- **Failure: Invalid Visit/Consent** – the `consent_token` is invalid, expired, or the visit is no longer active.
- **Failure: Per Diem Intervention** – the item is associated with a 'per diem' intervention, which cannot be removed through this workflow.
- **Failure: Line Item Not Found** – the provided `invoice_number` and `line_id` (or `line_number`) do not match any existing line item.
- **Failure: Missing Required Data** – any required field (`consent_token`, `invoice_number`, `line_id`) is missing or malformed.

Last modified on
April 30, 2026
Add New Line
Add diagnosis

---

## Billing Workflows Process Guide: Add Diagnosis Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/addDiagnosis](https://hie-docs.dha.go.ke/docs/claims/process/billing/addDiagnosis)

# Billing Workflows Process Guide: Add Diagnosis Workflow


## 1. Overview: Attaching Diagnoses to Claim Interventions


This guide focuses on the Add Diagnosis workflow, which is a vital stage in the broader Billing Workflows Process. It is key in linking medical reasons (diagnoses) for services provided to the specific interventions on a patient's claim. The main role of this workflow is to accurately add a new ICD-11 diagnosis code and associate it with an existing intervention within a claim.


### 1.1. What This Workflow Does


The Add Diagnosis workflow's primary function is to append a new, valid ICD-11 diagnosis code to a specified intervention that is already part of a patient's claim. It does this by taking the patient's visit consent, the diagnosis code, and the intervention code, then performing validations to ensure the diagnosis is appropriate and compliant for that intervention.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Accurately attaching diagnoses to interventions is important for proper medical coding, claim justification, and financial reimbursement. This workflow is important as it brings with it the following benefits:


- **Claim Acceptance**: Claims are likely to be accepted if the diagnoses justify the interventions performed or are valid for the type of service.
- **Improved Auditability**: Correct diagnoses make it easy to have audits, and this potentially results in no penalties or repayment obligations.
- **Accurate Reporting**: Correct diagnosis data improves public health reporting and internal performance analysis.
- **Operational Efficiency**: This workflow reduces the need for manual correction of diagnosis errors or re-submission of denied claims, leading to increased efficiency.


This workflow is key to ensuring the clinical and financial validity of claims. It ensures that the medical necessity of services is clearly documented, supporting the overall integrity of the Billing Workflows Process.


---


## 2. Workflow Details: Add Diagnosis


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request to add a new diagnosis to a claim intervention is received, several processes unfold:


1. **Input Reception**: The system first receives the `consent_token` for the active patient visit, the `icd_code` representing the diagnosis, and the `intervention_code` to which the diagnosis should be attached.
2. **Visit and Consent Validation**: The system immediately validates the provided `consent_token` to confirm that the patient's visit is still active/open and that the consent is valid.
3. **Diagnosis and Intervention Specific Validations**:

The system checks if the provided intervention_code has a specific diagnosis block or list of accepted diagnoses.
It verifies that the icd_code provided is an active diagnosis.
It confirms that the icd_code adheres to the ICD-11 standard.
If the intervention_code is associated with a 'capitation' payment model, it checks that the chosen diagnosis has a weight greater than zero.
4. **Diagnosis Association**: If all validations pass, the system proceeds to link the new `icd_code` to the specified `intervention_code` within the patient's claim.


### 2.2. Key Validations: Our System's Essential Checks


There are some essential checks our system performs behind the scenes to ensure a successful and accurate "Add Diagnosis" operation:


- Active Visit/Consent Validation:
The consent_token must correspond to a currently open and active visit.
- Intervention-Specific Diagnosis Acceptance:
The icd_code must fall within the accepted categories or diagnosis blocks for the given intervention_code.
- Diagnosis Activity Status:
The icd_code must be active.
- ICD 11 Format Compliance:
The icd_code must follow the ICD-11 standard format.
- Capitation Diagnosis Weight Validation:
If under capitation, the diagnosis must have a defined weight greater than zero (>0).


### 2.3. Workflow Data Dictionary (Conceptual): What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | string | Yes | Authorises the diagnosis addition for the correct patient and visit. |
| icd_code | A valid ICD-11 code. | string | Yes | The specific diagnosis to associate with the intervention. |
| intervention_code | The intervention to attach this diagnosis to. | string | Yes | Identifies the specific service or procedure being justified. |


### 2.4. Expected Outcomes from this Workflow


When you query this workflow, here's what you can expect in return:


- **Success**: Diagnosis Added to Intervention – the `icd_code` is linked to the `intervention_code`, and all validations pass.
- **Failure: Invalid Visit/Consent** – the `consent_token` is invalid, expired, or the visit is closed.
- **Failure: Invalid ICD Code** – the `icd_code` is invalid, not active, or lacks capitation weight.
- **Failure: Diagnosis Incompatible with Intervention** – the diagnosis is not allowed for the provided `intervention_code`.
- **Failure: Intervention Not Found** – the `intervention_code` is not associated with the patient’s visit.
- **Failure: Missing Required Data** – a mandatory field (`consent_token`, `icd_code`, `intervention_code`) is missing or malformed.

Last modified on
April 30, 2026
Remove Line
Remove Diagnosis

---

## Billing Workflows Process Guide: Remove Diagnosis Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/removeDiagnosis](https://hie-docs.dha.go.ke/docs/claims/process/billing/removeDiagnosis)

# Billing Workflows Process Guide: Remove Diagnosis Workflow


## 1. Overview: Detaching Diagnoses from Claim Interventions


This guide focuses on the Remove Diagnosis workflow, which is a vital stage in our broader Billing Workflows Process. It is used in correcting or retracting a previously attached diagnosis code from a patient's claim. This workflow's primary role is to accurately detach an ICD-11 diagnosis code from a specific intervention within a claim.


### 1.1. What This Workflow Does


The Remove Diagnosis workflow's primary function is to remove an existing ICD-11 diagnosis code from a specified intervention that is already part of a patient's claim. It does this by taking the patient's visit context, the diagnosis code, and the intervention code, ensuring that the correct diagnosis-intervention pair is targeted for removal.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


The ability to accurately remove diagnoses is crucial for maintaining the clinical and financial integrity of a patient's claim. Several benefits arise from this:


- **Claim Uniformity**: Correct diagnoses on a claim align with the services provided, leading to an improved rate of acceptance from payers.
- **Auditability**: Removing an erroneous diagnosis on a claim leads to accurate records in case of scrutiny during audits, and this accurately represents the patient's condition.
- **Accurate Reporting**: Correct diagnoses can clarify and align medical data and reporting, impacting public health tracking and internal analysis.
- **Patient Record Accuracy**: The patient's permanent record is corrected, and this resolves any issues of incorrect information, which positively affects future care decisions.


This workflow is crucial to ensuring the accuracy of clinical coding. It ensures that the diagnoses attached to services are correct and verifiable, supporting the overall integrity of the Billing Workflows Process.


---


## 2. Workflow Details: Remove Diagnosis


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request to remove a diagnosis from a claim intervention is made, here's the internal process that unfolds:


1. **Input Reception**: The system first receives the `consent_token` for the active patient visit, the `icd_code` representing the diagnosis to be removed, and the `intervention_code` from which the diagnosis should be detached.
2. **Visit and Consent Validation**: The system immediately validates the provided `consent_token` to confirm that the patient's visit is still active/open and that the consent is valid.
3. **Diagnosis-Intervention Linkage Validation**: The system checks if the specified `icd_code` is currently linked to the provided `intervention_code` on the patient's claim.
4. **Diagnosis Detachment**: If the linkage is confirmed and all validations pass, the system proceeds to detach the specified `icd_code` from the `intervention_code` within the patient's claim.


### 2.2. Key Validations: Our System's Essential Checks


There are some essential checks our system performs behind the scenes to ensure a successful and accurate "Remove Diagnosis" operation:


- Active Visit/Consent Validation:
The consent_token must correspond to a currently open and active patient visit.
- Diagnosis-Intervention Linkage Existence:
The system must confirm that the icd_code is currently linked to the specified intervention_code on the patient’s claim.
- Intervention Existence:
The intervention_code must refer to a service that exists on the patient’s claim.


### 2.3. Workflow Data Dictionary: What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | string | Yes | Authorises the diagnosis removal action for the correct patient and visit. |
| icd_code | A valid ICD-11 code. | string | Yes | The diagnosis code to be detached from the intervention. |
| intervention_code | The intervention to remove this diagnosis from. | string | Yes | Identifies the procedure or service to detach the diagnosis from. |


### 2.4. Expected Outcomes from this Workflow


When you query this workflow, here's what you can expect in return:


- **Success**: Diagnosis Removed from Intervention – the specified diagnosis is detached and all validations pass.
- **Failure: Invalid Visit/Consent** – the `consent_token` is invalid, expired, or the visit is closed.
- **Failure: Diagnosis-Intervention Linkage Not Found** – the specified `icd_code` is not currently linked to the given `intervention_code`.
- **Failure: Missing Required Data** – one or more required fields (`consent_token`, `icd_code`, `intervention_code`) are missing or malformed.

Last modified on
April 30, 2026
Add diagnosis
Add Attachment

---

## Billing Workflows Process Guide: Add Attachment Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/addAttachment](https://hie-docs.dha.go.ke/docs/claims/process/billing/addAttachment)

# Billing Workflows Process Guide: Add Attachment Workflow


## 1. Overview: Adding Supporting Documents to a Claim


This guide focuses on the Add Attachment workflow, a crucial stage in the broader Billing Workflows Process. It gives the mechanism for providing proof or additional context for a claim's interventions. This workflow's primary role is to accurately upload and link a new supporting document to an existing intervention within a patient's claim.


### 1.1. What This Workflow Does


The Add Attachment workflow's work is to upload a digital document and associate it with a specific intervention that is already part of a patient's claim. It does this by taking the patient's visit context, the file itself (`file_blob`), and metadata about the document, then performing the required validations to ensure the attachment is correctly linked to a valid intervention.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


The ability to accurately add attachments is crucial for the substantiation and justification of claims, particularly for complex cases or specific interventions. Without a precise and compliant attachment process, several serious issues can arise:


- **Claim Denials**: Payers may deny claims if required supporting documentation (e.g., lab results, a prescription, or an invoice) is missing.
- **Audit Scrutiny**: Lack of documentation makes claims vulnerable to intense scrutiny and potential penalties during audits.
- **Medical Record Incompleteness**: The patient's record will be incomplete, lacking the full context of their treatment and the justification for interventions.
- **Operational Inefficiency**: Manual processes for providing supporting documents are cumbersome and prone to error, leading to delays and increased administrative costs.


This workflow is key to strengthening the validity and verifiability of claims. It ensures that all claims are backed by the necessary evidence, supporting the overall integrity of the Billing Workflows Process.


---


## 2. Workflow Details: Add Attachment


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request to add an attachment to a claim intervention is made, here's the internal process that unfolds:


1. **Input Reception**: The system first receives the `consent_token` for the active patient visit, the `file_blob` of the document, and metadata including the `document_type`, `document_title`, `document_description`, and an optional `intervention_code`.
2. **Visit and Consent Validation**: The system immediately validates the provided `consent_token` to confirm that the patient's visit is still active/open and that the consent is valid.
3. **Intervention Validation**: If an `intervention_code` is provided, the system validates that the attachment is being tied to a specific intervention that is present on the patient's claim.
4. **Document Upload and Association**: If all validations pass, the system securely uploads the `file_blob`, records the associated metadata, and links the new attachment to the patient's claim. If `intervention_code` was provided, the attachment is linked directly to that intervention.
5. **Confirmation**: The system confirms the successful addition of the attachment.


### 2.2. Key Validations: Our System's Essential Checks


There are some essential checks our system performs behind the scenes to ensure a successful and accurate "Add Attachment" operation:


- Active Visit/Consent Validation:
The consent_token must correspond to a currently open and active visit.
- Intervention Existence:
If intervention_code is provided, the system confirms that this intervention exists on the claim.


### 2.3. Workflow Data Dictionary (Conceptual): What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | string | Yes | Authorises the attachment action for the correct patient and visit. |
| file_blob | The file blob (binary data of the file). | file | Yes | Actual file content to be uploaded and stored. |
| document_title | Title of the document. | string | No | Human-readable title for identification. |
| document_type | The type of medical document being uploaded. | string | Yes | Categorizes the document (e.g., prescription, invoice). |
| document_description | The document description. | string | No | Free-text details or context about the attachment. |
| intervention_code | The intervention code to link the document to. | string | No | Identifies the specific procedure the document supports. |


### 2.4. Expected Outcomes from this Workflow


When you query this workflow, here's what you can expect in return:


- **Success**: Attachment Added – The system uploads the file, creates an attachment record, and links it to the claim (and intervention if specified).
- **Failure: Invalid Visit/Consent** – The `consent_token` is invalid, expired, or refers to a closed visit.
- **Failure: Intervention Not Found** – An `intervention_code` was provided but doesn't exist on the claim.
- **Failure: Invalid Document Type** – The `document_type` provided is not supported.
- **Failure: Missing Required Data** – One or more required fields (`consent_token`, `file_blob`, `document_type`) are missing or malformed.

Last modified on
April 30, 2026
Remove Diagnosis
Remove Attachment

---

## Billing Workflows Process Guide: Remove Attachment Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/removeAttachment](https://hie-docs.dha.go.ke/docs/claims/process/billing/removeAttachment)

# Billing Workflows Process Guide: Remove Attachment Workflow


## 1. Overview: Deleting Supporting Documents from a Claim


This guide focuses on the Remove Attachment workflow, which provides the mechanism for correcting or retracting a previously uploaded supporting document from a patient's claim. This workflow's key role is to accurately delete an existing attachment from a specific intervention within a claim.


### 1.1. What This Workflow Does


The Remove Attachment workflow's primary function is to remove an existing attachment, identified by its unique ID, from a specified intervention that is already part of a patient's claim. It does this by taking the patient's visit context, the attachment's unique identifier, and the associated intervention code, ensuring that the correct document-intervention pair is targeted for removal.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


The ability to accurately remove attachments is crucial for maintaining the integrity and accuracy of a patient's claim documentation. Without a precise and compliant attachment removal process, several serious issues can arise:


- **Misleading Claim Information**: Erroneous or outdated documents remaining on a claim can provide misleading information to payers and auditors.
- **Security Risks**: Unnecessary documents, especially those containing sensitive information, should not be retained on a claim if they are no longer relevant.
- **Audit Complications**: The presence of extraneous or incorrect documents can complicate the auditing process and introduce confusion.
- **Data Bloat**: Storing unnecessary attachments increases data storage requirements and can slow down claim retrieval.


This workflow is important for maintaining clean and accurate claim documentation. It ensures that the claim file contains only the necessary and correct evidence, supporting the overall integrity of the Billing Workflows Process.


---


## 2. Workflow Details: Remove Attachment


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request to remove an attachment from a claim intervention is made, here's the internal process that unfolds:


1. **Input Reception**: The system first receives the `consent_token` for the active patient visit, the `attachment_id` of the document to be removed, and the `intervention_code` from which the attachment should be detached.
2. **Visit and Consent Validation**: The system immediately validates the provided `consent_token` to confirm that the patient's visit is still active/open and that the consent is valid.
3. **Attachment-Intervention Linkage Validation**: The system checks if the specified `attachment_id` is currently linked to the provided `intervention_code` on the patient's claim.
4. **Attachment Detachment and Deletion**: If the linkage is confirmed and all validations pass, the system proceeds to detach the specified `attachment_id` from the `intervention_code` and deletes the attachment file from storage.


### 2.2. Key Validations: Our System's Essential Checks


- Active Visit/Consent Validation:
The consent_token must correspond to an open and active patient visit.
- Attachment-Intervention Linkage Existence:
The system confirms that the attachment_id is currently linked to the given intervention_code in the patient’s claim.


### 2.3. Workflow Data Dictionary (Conceptual): What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | string | Yes | Authorises the attachment removal action for the correct patient/visit. |
| attachment_id | The system-generated UUID of the attachment. | string (uuid4) | Yes | Identifies the exact file to be removed. |
| intervention_code | The intervention to remove this attachment from. | string | Yes | Identifies the service or procedure associated with the attachment. |


### 2.4. Expected Outcomes from this Workflow


- **Success**: Attachment Removed from Intervention – The system detaches the attachment and deletes the file, passing all validations.
- **Failure: Invalid Visit/Consent** – The `consent_token` is invalid, expired, or refers to a closed visit.
- **Failure: Attachment-Intervention Linkage Not Found** – The provided `attachment_id` is not linked to the specified `intervention_code`.
- **Failure: Missing Required Data** – One or more of the required fields (`consent_token`, `attachment_id`, `intervention_code`) is missing or malformed.

Last modified on
April 30, 2026
Add Attachment
Preview Provider Claim

---

## Preview Provider Claim Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/previewProviderClaim](https://hie-docs.dha.go.ke/docs/claims/process/billing/previewProviderClaim)

# Preview Provider Claim Workflow Guide


## Preview Provider Claim Workflow: Reviewing Claim Details Before Payer Submission


### 1. Overview


This guide explains the Preview Provider Claim workflow, which allows providers to view the details and status of a claim before it is reviewed and updated by the payer. This workflow provides visibility into the claim’s contents, status, and any internal checks performed after submission but before payer review.


#### 1.1. What This Workflow Does


The Preview Provider Claim workflow enables providers to:


- **Review Claim Details:** See all claim data, including invoices, interventions, diagnoses, and attachments.
- **Check Claim Status:** View the current status of the claim (e.g., DRAFT, SUBMISSION_READY, AUTHORIZED, CLOSED).
- **Perform Internal Validation:** Ensure all required information is present and correct before the claim is sent to the payer.
- **Identify Issues Early:** Spot missing data, errors, or incomplete sections that could delay payer processing.


#### 1.2. Why This Workflow Is Critical


- **Reduces Errors:** Providers can catch and fix issues before payer review.
- **Improves Transparency:** Providers have full visibility into what will be sent to the payer.
- **Speeds Up Processing:** Well-prepared claims are less likely to be rejected or delayed by the payer.


---


### 2. Workflow Details: Preview Provider Claim


#### 2.1. Workflow Description


When a provider requests to preview a claim, the following steps occur:


1. **Input Reception:** The provider submits a request with the claim’s consent token and facility identifiers.
2. **Claim Lookup:** The system retrieves the claim details from the provider’s internal records.
3. **Internal Checks:** The system validates the claim for completeness, required fields, and business rules.
4. **Status Reporting:** The system returns the claim’s current status and all associated data.
5. **Outcome Delivery:** The provider reviews the claim and makes any necessary corrections before final submission to the payer.


#### 2.2. Key Validations: System Checks


- **Consent Token Must Be Provided:**

 The consent token uniquely identifies the claim to preview.
- **Facility Identifiers:**

 Facility ID and type may be required for multi-facility providers.
- **Required Fields:**

 All mandatory claim fields (e.g., interventions, invoices, diagnoses) must be present.


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | Unique code for the claim | String | Yes | Identifies which claim to preview |
| facility_id | Facility identifier | String | No | Specifies the facility for the claim |
| facility_id_type | Type of facility identifier | String | No | Indicates the identifier type |


**Returned Data Includes:**


- Claim status (`claim_auth_status`)
- Total claim amounts
- Invoices and invoice lines
- Interventions
- Diagnoses
- Attachments
- Workflow state


#### 2.4. Expected Outcomes from this workflow


- **Successful Preview:** Claim details are returned for provider review.
- **Claim Not Found:** No claim matches the provided consent token; input may need verification.
- **Input Error:** Provided identifiers are invalid or missing.


---


### 3. How Preview Provider Claim Connects to Other Workflows


- **Billing:** Ensures all billing lines and invoices are correct before payer submission.
- **Interventions:** Validates interventions linked to the claim.
- **Attachments & Diagnoses:** Confirms all supporting documents and diagnoses are present.


---


### 4. Key Success Factors for Provider Claim Preview


- **Use Valid Consent Tokens:** Always provide the correct consent token for the claim.
- **Review All Data:** Check every section of the claim for completeness and accuracy.
- **Fix Issues Early:** Address any errors or missing data before submitting to the payer.
- **Follow Compliance:** Ensure all claim data meets regulatory and payer requirements.


---

Last modified on
April 30, 2026
Remove Attachment
Preview Payer Claim

---

## Preview Payer Claim Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/previewPayerClaim](https://hie-docs.dha.go.ke/docs/claims/process/billing/previewPayerClaim)

# Preview Payer Claim Workflow Guide


## Preview Payer Claim Workflow: Tracking Claim Status After Submission to Payer


### 1. Overview


This guide explains the Preview Payer Claim workflow, which allows providers and beneficiaries to view the details and status of a claim after it has been submitted to the payer. This workflow provides visibility into the claim’s progress, status, and any updates or actions taken by the payer.


#### 1.1. What This Workflow Does


The Preview Payer Claim workflow enables users to:


- **Track Claim Status:** View the current status of the claim as seen by the payer (e.g., AUTHORIZED, CLOSED, REJECTED).
- **Review Claim Details:** See all claim data, including invoices, interventions, diagnoses, and attachments as processed by the payer.
- **Monitor Updates:** Stay informed about any changes, approvals, or rejections made by the payer.
- **Facilitate Communication:** Understand what the payer sees, helping resolve issues or follow up on pending claims.


#### 1.2. Why This Workflow Is Critical


- **Transparency:** Users can track the claim’s journey and status after submission.
- **Accountability:** Ensures both provider and beneficiary are aware of payer actions.
- **Faster Resolution:** Helps identify and address issues or delays in claim processing.


---


### 2. Workflow Details: Preview Payer Claim


![Preview Payer Claim Workflow Diagram](https://hie-docs.dha.go.ke/)


#### 2.1. Workflow Description


When a user requests to preview a payer claim, the following steps occur:


1. **Input Reception:** The user submits a request with the claim’s consent token and facility identifiers.
2. **Claim Lookup:** The system queries the payer’s records for the claim.
3. **Status & Data Retrieval:** The payer returns the claim’s current status and all associated data.
4. **Outcome Delivery:** The user reviews the claim as seen by the payer, including any updates or actions taken.


#### 2.2. Key Validations: System Checks


- **Consent Token Must Be Provided:**

 The consent token uniquely identifies the claim to preview.
- **Facility Identifiers:**

 Facility ID and type may be required for multi-facility providers.
- **Required Fields:**

 All mandatory claim fields must be present for accurate tracking.


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | Unique code for the claim | String | Yes | Identifies which claim to preview |
| facility_id | Facility identifier | String | No | Specifies the facility for the claim |
| facility_id_type | Type of facility identifier | String | No | Indicates the identifier type |


**Returned Data Includes:**


- Claim status (`claim_auth_status`)
- Total claim amounts
- Invoices and invoice lines
- Interventions
- Diagnoses
- Attachments
- Workflow state


#### 2.4. Expected Outcomes from this workflow


- **Successful Preview:** Claim details and status are returned as seen by the payer.
- **Claim Not Found:** No claim matches the provided consent token; input may need verification.
- **Input Error:** Provided identifiers are invalid or missing.


---


### 3. Example API Usage


**Endpoint:**

`POST /adapter/facade/edi/v1/claims/claims`


**Request Body Example:**


```json
{
  "consent_token": "7EE5HKBV6L"
}
```


**Response Example:**


```json
{
  "id": "8b4ddfb3-5da2-4d78-8fea-cc82776bbb9f",
  "claim_auth_status": "CLOSED",
  "total_claim_amount": "0.00",
  "total_claim_net_amount": "0.00",
  "invoices": [
    {
      "id": "628d5077-f691-43a0-a1d2-6f7e68311ffc",
      "invoice_number": "INV/13545/70179-CLOSED-8822",
      "total_inv_amount": "800.00",
      "workflow_state": "INVALID",
      "lines": [ /* ... */ ],
      "scheme_name": "SOCIAL HEALTH AUTHORITY",
      "patient_name": "CLIFFORD OCHIENG OUMA",
      "provider_name": "HALCYON HEALTHCARE LIMITED",
      "member_number": "CR6996401484997-0"
    }
  ],
  "payer_name": "Social Health Authority",
  "provider_name": "HALCYON HEALTHCARE LIMITED",
  "scheme_name": "SOCIAL HEALTH AUTHORITY",
  "patient_name": "CLIFFORD OCHIENG OUMA",
  "currency": "KES",
  "authorization_code": "CSBHHZA2LU",
  "workflow_state": "CLOSED"
}
```


---


### 4. How Preview Payer Claim Connects to Other Workflows


- **Billing:** Confirms the payer’s view of billing lines and invoices.
- **Interventions:** Validates interventions as processed by the payer.
- **Attachments & Diagnoses:** Shows all supporting documents and diagnoses as received by the payer.


---


### 5. Key Success Factors for Payer Claim Preview


- **Use Valid Consent Tokens:** Always provide the correct consent token for the claim.
- **Review All Data:** Check every section of the claim for completeness and accuracy.
- **Follow Up Promptly:** Address any issues or discrepancies with the payer as soon as possible.
- **Maintain Compliance:** Ensure all claim data meets regulatory and payer requirements.


---

Last modified on
April 30, 2026
Preview Provider Claim
Resubmit Claim

---

## Close Claim Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/closeClaim](https://hie-docs.dha.go.ke/docs/claims/process/billing/closeClaim)

# Close Claim Workflow Guide


## Close Claim Workflow: Terminating Claims Not Scheduled for Submission


### 1. Overview


This guide explains the Close Claim workflow, which allows providers and integrators to terminate a claim that is not scheduled for submission to the payer. If, for any reason, a provider decides not to proceed with a claim, this workflow enables them to close the claim, changing its status to `CLOSED`.


#### 1.1. What This Workflow Does


The Close Claim workflow enables users to:


- **Terminate Unwanted Claims:** End claims that are no longer needed or were created in error.
- **Change Claim Status:** Update the claim’s status to `CLOSED`, preventing further edits or submission.
- **Document Cancellation Reason:** Record the reason for closing the claim for audit and compliance purposes.


#### 1.2. Why This Workflow Is Critical


- **Prevents Unnecessary Processing:** Stops claims that should not be submitted, reducing clutter and confusion.
- **Supports Compliance:** Ensures all claim closures are documented with a reason.
- **Improves Data Integrity:** Keeps the claims database clean and accurate.


---


### 2. Workflow Details: Close Claim


![](https://hie-docs.dha.go.ke/)


#### 2.1. Workflow Description


When a provider or integrator needs to close a claim, the following steps occur:


1. **Input Reception:** The user submits a request with the claim’s consent token and a cancellation reason.
2. **Status Transition:** The system updates the claim’s status to `CLOSED`.
3. **Outcome Delivery:** The claim is terminated and cannot be edited or submitted to the payer.


#### 2.2. Key Validations: System Checks


- **Consent Token Must Be Provided:**

 The consent token uniquely identifies the claim to be closed.
- **Cancellation Reason Required:**

 Both the type and detailed explanation of the cancellation reason must be provided.


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | Unique code for the claim | String | Yes | Identifies which claim to close |
| cancel_reason_type | Type of cancellation reason | String | Yes | Specifies the category of cancellation |
| cancel_reason_text | Detailed explanation of the cancellation | String | Yes | Documents the reason for closing the claim |


**Allowed Values for cancel_reason_type:**


- WRONG_PATIENT
- NO_SERVICE_GIVEN
- WRONG_BENEFIT
- EXPIRED_VISIT
- EXHAUSTED_BENEFIT
- TIME_BARRED
- OTHER_REASONS


#### 2.4. Expected Outcomes from this workflow


- **Successful Closure:** The claim status is updated to `CLOSED` and no further actions can be performed.
- **Input Error:** Provided identifiers or cancellation reason are invalid or missing.


---


### 3. Example API Usage


**Endpoint:**

`POST /adapter/facade/is/v1/claims/close_virtual_claim_visit`


**Request Body Example:**


```json
{
  "consent_token": "CSBHHZA2LU",
  "cancel_reason_type": "OTHER_REASONS",
  "cancel_reason_text": "Wrong claim"
}
```


**Response Example:**


```json
{
  "id": "8b4ddfb3-5da2-4d78-8fea-cc82776bbb9f",
  "claim_auth_status": "CLOSED",
  "total_claim_amount": "0.00",
  "invoices": [
    {
      "invoice_number": "INV/13545/70179-CLOSED-8822",
      "workflow_state": "INVALID"
    }
  ],
  "interventions": [
    {
      "intervention_code": "SHA-18-001",
      "intervention_name": "Haemoglobin A1C (HbA1C)"
    }
  ],
  "cancel_reason_type": "OTHER_REASONS",
  "cancel_reason_text": "Wrong claim"
}
```


---


### 4. How Close Claim Connects to Other Workflows


- **Claim Lifecycle:** Provides a way to terminate claims that are not proceeding to submission.
- **Audit Trail:** Ensures all closures are documented for compliance and reporting.


---


### 5. Key Success Factors for Close Claim Workflow


- **Use Valid Consent Tokens:** Always provide the correct consent token for the claim.
- **Document Cancellation Clearly:** Choose the appropriate cancellation reason and provide a clear explanation.
- **Review Before Closure:** Ensure the claim truly needs to be closed, as this action cannot be undone.


---

Last modified on
April 30, 2026
Edit Claim Line
Preauth Doctor Consent Overview

---

## Resubmit Claim Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/billing/resubmitClaim](https://hie-docs.dha.go.ke/docs/claims/process/billing/resubmitClaim)

# Resubmit Claim Workflow Guide


## Resubmit Claim Workflow: Transitioning Claims for Editing After Payer Review


### 1. Overview


This guide explains the Resubmit Claim workflow, which allows providers to transition a claim to a status that permits editing after it has been reviewed by the payer. When a claim is sent back by the payer for clarifications or changes, this workflow enables the provider to update claim line details and resubmit for further review.


#### 1.1. What This Workflow Does


The Resubmit Claim workflow enables providers to:


- **Transition Claim Status:** Change the claim’s status to `DRAFT_RESUBMIT`, allowing edits.
- **Edit Claim Lines:** Update details such as unit price, quantity, diagnoses, and attachments.
- **Address Payer Feedback:** Make necessary corrections based on payer comments or rejection reasons.
- **Prepare for Resubmission:** Ensure the claim is complete and accurate before sending it back to the payer.


#### 1.2. Why This Workflow Is Critical


- **Improves Claim Accuracy:** Providers can correct errors and add missing information.
- **Speeds Up Resolution:** Facilitates quick turnaround for claims needing clarification.
- **Enhances Collaboration:** Supports communication between providers and payers for efficient claim processing.


---


### 2. Workflow Details: Resubmit Claim


![Resubmit Claim Workflow Diagram](https://hie-docs.dha.go.ke/)


#### 2.1. Workflow Description


When a provider needs to resubmit a claim, the following steps occur:


1. **Input Reception:** The provider submits a request with the claim’s consent token and relevant identifiers.
2. **Status Transition:** The system updates the claim’s status to `DRAFT_RESUBMIT`, unlocking it for edits.
3. **Claim Editing:** The provider can now modify claim line items, diagnoses, and attachments as needed.
4. **Outcome Delivery:** Once edits are complete, the claim can be resubmitted for payer review.


#### 2.2. Key Validations: System Checks


- **Consent Token Must Be Provided:**

 The consent token uniquely identifies the claim to be transitioned.
- **Facility Identifiers:**

 Facility ID and type may be required for multi-facility providers.
- **Required Fields:**

 All mandatory claim fields must be present for successful transition.


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | Unique code for the claim | String | Yes | Identifies which claim to transition |
| facility_id | Facility identifier | String | No | Specifies the facility for the claim |
| facility_id_type | Type of facility identifier | String | No | Indicates the identifier type |


---


### 3. Example API Usage


**Endpoint:**

`POST /adapter/facade/is/v1/claims/resubmit_virtual_claim_line`


**Request Body Example:**


```json
{
  "consent_token": "7EE5HKBV6L"
}
```


**Response Example:**


```json
{
  "message": "Claim status transitioned to DRAFT_RESUBMIT. You can now edit claim lines."
}
```


---


### 4. How Resubmit Claim Connects to Other Workflows


- **Claim Editing:** Unlocks claim lines for editing, allowing updates to billing, diagnoses, and attachments.
- **Preview & Submission:** After edits, the claim can be previewed and resubmitted to the payer.
- **Payer Collaboration:** Supports iterative review and correction cycles between provider and payer.


---


### 5. Key Success Factors for Resubmit Claim Workflow


- **Use Valid Consent Tokens:** Always provide the correct consent token for the claim.
- **Review Payer Feedback:** Address all comments and requested changes before resubmitting.
- **Edit Carefully:** Ensure all claim line details are accurate and complete.
- **Follow Compliance:** Maintain regulatory standards during claim editing and resubmission.


---

Last modified on
April 30, 2026
Preview Payer Claim
Edit Claim Line

---

## Claim Dispatch / Visit End Process Overview: Finalizing Patient Claims and Encounters

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/claimDispatchProcessOverview](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/claimDispatchProcessOverview)

# Claim Dispatch / Visit End Process Overview: Finalizing Patient Claims and Encounters


## 1. Introduction: Understanding Claim Dispatch / Visit End


This comprehensive guide provides a high-level overview of how our system manages the crucial final steps of a patient's visit and the associated billing. This process is the formal conclusion of a healthcare encounter.


The Claim Dispatch / Visit End is a series of interconnected steps designed to ensure that all services are accounted for, the patient's record is properly closed, and the claim is ready for submission to the Social Health Authority (SHA). It's about moving from an active, open visit to a finalised, dispatched claim.


### 1.1. Why This Full Process Matters


A robust and accurate Claim Dispatch / Visit End process is fundamental to efficient, fair, and compliant healthcare delivery. It is crucial because it:


- **Ensures Financial Accuracy**: Verifies that a claim is complete and accurate before it is dispatched, which reduces the risk of payment delays or denials.
- **Maintains Record Integrity**: Guarantees that a patient's visit record is officially and correctly closed, preventing future administrative confusion and ensuring accurate health records.
- **Adheres to Regulatory Compliance**: Follows all necessary procedures, such as getting patient confirmation via OTP or biometrics for outpatient visits or setting next-of-kin contacts in specific inpatient scenarios.
- **Streamlines Operations**: Automates the finalisation of claims, reducing the administrative burden on providers and enabling more efficient payment processing.


---


## 2. The Full Claim Dispatch / Visit End Journey: Step-by-Step Encounter Closure


The complete Claim Dispatch / Visit End is a multi-step journey, with each workflow building upon the results of the previous one. It consists of a series of workflows, each focused on a different aspect of the claim's finality. The two key workflows diverge based on the type of patient encounter.


Here are the key workflows:


### 2.1. Step 1: Outpatient claim dispatch


This workflow verifies the patient's consent before submitting the claim and formally ending the visit. Consent can be obtained via a One-Time Password (OTP) sent to the patient's registered contact, or via a biometrics authorization using fingerprint matching.


This specific step is vital for ensuring that the patient acknowledges and consents to the end of their visit, which is an important validation for the claim's integrity and compliance.


### 2.2. Step 2: Inpatient claim dispatch


This workflow handles the process of an inpatient's discharge. Discharge consent can be obtained via OTP or via biometrics authorization. It also includes a conditional step to set next-of-kin contacts if the patient's discharge reason is "DECEASED".


This specific step is vital for ensuring that all necessary post-visit actions for an inpatient are completed, which includes data collection and, in sensitive cases, proper handling of next-of-kin information.


---


## 3. Key Success Factors for Overall Claim Dispatch / Visit End Integration


For your integration with the entire Claim Dispatch / Visit End process to be successful and efficient, keep these points in mind:


- Provide Correct consent_token: The consent_token is the key that unlocks all actions in this process. Ensuring its validity and correctness is paramount.
- Accurate Patient Contact Data: For outpatient claims, the process critically depends on having valid beneficiary contacts to send the OTP. Without this, the visit cannot be finalised.
- Precise discharge_reason: For inpatient claims, the discharge_reason field is not just a label; it is a critical trigger for conditional logic. Correctly populating this field ensures that the appropriate subsequent steps (e.g., next-of-kin contacts) are completed.


By understanding and adhering to these key points, you can ensure a smooth, accurate, and effective integration with the Claim Dispatch / Visit End process.


---


## 4. Related Guides and Scenarios


- [Inpatient Claim Dispatch Guide](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/inPatientClaimDispatch)
- [Outpatient Claim Dispatch Guide](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/outPatientClaimDispatch)
- [Scenario 1: SHIF IP Per Diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)
- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)

Last modified on
April 30, 2026
Preauth Doctor Consent Overview
Inpatient Claim Dispatch

---

## Claim Dispatch / Visit End Process Guide: Outpatient Claim Dispatch Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/outPatientClaimDispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/outPatientClaimDispatch)

# Claim Dispatch / Visit End Process Guide: Outpatient Claim Dispatch Workflow


## 1. Overview: Finalising an Outpatient's Visit and Claim


This guide outlines the Outpatient claim dispatch workflow, which is the final step in our comprehensive Claim Dispatch/Visit End process. It serves as a final verification and checkout for a patient's outpatient visit. The primary purpose of this workflow is to ensure that a patient's visit is officially closed and that the claim is ready for dispatch. To obtain explicit patient consent for the end of the visit, two methods are supported: a One-Time Password (OTP) sent to the patient's registered contact, or a biometrics authorization via fingerprint matching.


### 1.1. What This Workflow Does


The Outpatient claim dispatch workflow's main function is to formalise an outpatient's visit conclusion. It supports two consent methods:


**OTP path:**


- Retrieving the beneficiary's contact details
- Sending an OTP to that contact
- Verifying the OTP
- Performing the "Outpatient Visit End" action


**Biometrics path:**


- Calling `POST /api/v1/claims/authorize` with biometrics fields to create a `PENDING` authorization
- Rendering the iframe so the patient can match their fingerprint, transitioning the authorization to `AUTHORIZED`
- Performing the "Outpatient Visit End" action using `auth_guid` instead of `otp_code`


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Finalising an outpatient visit correctly is essential for claim integrity and patient trust. Without a precise, patient-verified process, several risks arise:


- **Unverified Claims**: Claims submitted without patient confirmation may be disputed or rejected.
- **Billing Discrepancies**: Incomplete visit closures can cause inaccuracies in patient records.
- **Lack of Patient Trust**: Verifying the visit end with an OTP increases trust and transparency.


This workflow ensures every outpatient claim is backed by patient-verified consent.


---


## 2. Workflow Details: Outpatient Claim Dispatch


### 2.1. Workflow Description: Step-by-Step System Behavior


1. Get Beneficiary's Valid Contacts
The system retrieves the patient's valid contact info using:

consent_token
is_alive flag (to determine which contact to use)
2. Obtain Visit-End Consent
Option A: OTP
The system sends a unique OTP to the contact using:

beneficiary_cr_id
beneficiary_contact_id
consent_token
otp_type = discharge

Option B: Biometrics
As an alternative to OTP, consent can be obtained via biometrics:

Call POST /api/v1/claims/authorize with biometrics-specific fields, including the workstationID from the biometrics hardware server and the biometrics agent's National ID. The authorization is created in PENDING status and the response includes an iframe link.
Render the iframe so the patient can match their fingerprint. On a successful match, the authorization transitions from PENDING to AUTHORIZED.
In the visit-end call (step 3), include auth_guid (the GUID of the AUTHORIZED authorization) instead of otp_code.
3. Outpatient Visit End
The system finalises the visit and prepares the claim for dispatch using otp_code (OTP path) or auth_guid (biometrics path).


---


### 2.2. Key Validations: Our System's Essential Checks


- Valid Beneficiary Contacts
The system must retrieve a valid contact (phone/email). Without one, it cannot send the OTP.
- OTP Match
The provided otp_code must match what was sent. This confirms the patient's consent to end the visit.
- Biometrics Authorization Status (biometrics path)
The auth_guid must correspond to an AUTHORIZED authorization. PENDING or expired authorizations will be rejected.
- Valid consent_token
It must correspond to an active outpatient visit.


---


### 2.3. Workflow Data Dictionary: What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | The consent token for the patient visit. | string | Yes | Authorises and links action to a specific visit. |
| is_alive | Whether the patient is alive. | boolean | Yes | Determines which contacts to use for OTP. |
| beneficiary_cr_id | Client registry ID from eligibility check. | string | Yes | Identifies the patient in the client registry. |
| beneficiary_contact_id | ID of the contact (defaults to main contact). | string | No | Indicates which contact receives the OTP. |
| otp_type | OTP context – should be"discharge" | string | Yes | Defines the purpose of the OTP. |
| otp_code | The OTP provided by the beneficiary. | string | Conditional | Confirms patient consent to end the visit (OTP path). |
| auth_guid | GUID of an AUTHORIZED biometrics authorization. | string | Conditional | Used instead ofotp_codewhen biometrics consent was used for visit end. |


---


### 2.4. Expected Outcomes from this Workflow


- Success: Visit Ended with OTP
The OTP is verified and the outpatient visit is officially ended.
- Success: Visit Ended with Biometrics
The biometrics authorization is confirmed as AUTHORIZED and the outpatient visit is officially ended.
- Failure: No Valid Contacts
The system cannot send the OTP due to missing contact info.
- Failure: Incorrect OTP
The provided OTP does not match what was sent.
- Failure: Invalid or Pending Biometrics Authorization
The auth_guid does not correspond to an AUTHORIZED authorization.
- Failure: Missing Required Data
Any required field (consent_token, otp_code, or auth_guid) is missing or malformed.


---


## 3. Related Guides and Scenarios


- [Scenario 4: SHIF OP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth)
- [Scenario 5: SHIF OP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-5-shif-op-ffs-normal-preauth)
- [Scenario 6: UHC OP Capitation](https://hie-docs.dha.go.ke/docs/scenarios/scenario-6-uhc-op-capitation)

Last modified on
April 30, 2026
Inpatient Claim Dispatch
Remittance Process Overview

---

## Claim Dispatch / Visit End Process Guide: In-patient Claim Dispatch Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/inPatientClaimDispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/inPatientClaimDispatch)

# Claim Dispatch / Visit End Process Guide: In-patient Claim Dispatch Workflow


## 1. Overview: Finalising an Inpatient's Discharge and Claim


This guide focuses on the inpatient claim dispatch workflow, which is part of the final stages of the broader claim dispatch and visit end process. The workflow ensures a formal finalisation and checkout for a patient's inpatient stay. Its primary purpose is to guarantee that the patient is officially discharged and that all claim-related data, including special case information, is accurately captured and linked to the final claim.


### 1.1. What This Workflow Does


The Inpatient claim dispatch workflow's primary function is to formalise an inpatient's discharge from a facility. It achieves this by:


- Confirming the patient's identity via an OTP or biometrics authorization,
- Processing the discharge itself, and
- Executing a conditional step of collecting next-of-kin contact information if the discharge reason is `"DECEASED"`.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Getting an inpatient's discharge process right is key for both clinical accuracy and financial compliance. Without a precise process, several serious issues can arise:


- **Inaccurate Records**: An incomplete discharge can leave a patient's record in an "open" state.
- **Non-Compliant Claims**: Claims for deceased patients require next-of-kin documentation, or they risk rejection.
- **Audit Scrutiny**: Improper discharges may lead to issues during audit reviews.
- **Financial Errors**: Incomplete claims can lead to payment delays and reconciliation errors.


This workflow ensures compliant inpatient billing with accurate discharge data and procedural integrity.


---


## 2. Workflow Details: Inpatient Claim Dispatch


![Inpatient DIscharge Workflow](https://hie-docs.dha.go.ke/assets/Inpatientdischarge-BmS0XPVk.png)


### 2.1. Workflow Description: Step-by-Step System Behavior


1. Get Beneficiary's Valid Contacts
The system retrieves patient contact info using consent_token and is_alive flag.
2. Send OTP (OTP path)
An OTP is sent to the retrieved contact using:

beneficiary_cr_id
beneficiary_contact_id
consent_token
otp_type = discharge

Biometrics path (alternative to OTP): Discharge consent can also be obtained via biometrics:

Call POST /api/v1/claims/authorize with biometrics-specific fields, including the workstationID from the biometrics hardware server and the biometrics agent's National ID. The authorization is created in PENDING status and the response includes an iframe link.
Render the iframe so the patient can match their fingerprint. On a successful match, the authorization transitions from PENDING to AUTHORIZED.
In the discharge call (step 3), include auth_guid (the GUID of the AUTHORIZED authorization) in place of the otp field.
3. Inpatient Discharge
The discharge action is performed using:

consent_token
discharge_date
invoice_number
discharge_reason
otp (OTP path) or auth_guid (biometrics path) for patient consent
4. Conditional Check
The system checks whether discharge_reason == DECEASED.
5. Set Next-of-Kin Contacts (if deceased)
If is_alive = false, the system requires:

next_of_kin_full_name
next_of_kin_id_number
next_of_kin_id_number_type
contact_value
6. Confirmation
The system confirms successful discharge and the completion of required steps.


---


### 2.2. Key Validations: Our System's Essential Checks


- Valid Discharge Date
discharge_date cannot be before admission date or in the future.
- Conditional next_of_kin Data
If discharge_reason == DECEASED, next-of-kin data is required.
- Valid consent_token
Must correspond to an active inpatient visit.


---


### 2.3. Workflow Data Dictionary: What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| consent_token | Token for patient visit | string | Yes | Authorises finalisation and links to patient encounter |
| is_alive | Patient alive status | boolean | Yes | Determines contact retrieval logic for OTP |
| beneficiary_cr_id | Client registry ID | string | Yes | Identifies the beneficiary |
| beneficiary_contact_id | ID of the patient’s contact | string | No | Specifies the contact for OTP |
| otp_type | Should be set todischarge | string | Yes | Defines OTP context |
| discharge_date | Date of discharge (not before admission or in future) | ISO 8601 | Yes | Sets the patient’s discharge timestamp |
| invoice_number | Invoice reference from provider | string | Yes | Links the discharge to a specific claim |
| discharge_reason | Reason for discharge: RECOVERED, REFERRED, DECEASED, etc. | string | Yes | Used for logic branching and compliance |
| next_of_kin_full_name | Full name of next-of-kin | string | Conditional | Required ifdischarge_reason == DECEASED |
| next_of_kin_id_number | ID number of next-of-kin | string | Conditional | Required ifdischarge_reason == DECEASED |
| next_of_kin_id_number_type | ID type (e.g. National ID, Alien ID) | string | Conditional | Required ifdischarge_reason == DECEASED |
| contact_value | Active phone number of next-of-kin | string | Conditional | Required ifdischarge_reason == DECEASED |
| auth_guid | GUID of an AUTHORIZED biometrics authorization | string | Conditional | Used instead ofotpwhen biometrics consent was used for discharge |


---


### 2.4. Expected Outcomes from this Workflow


- Success: Discharge with OTP
Patient is successfully discharged; OTP was verified and all required steps completed.
- Success: Discharge with Biometrics
Patient is successfully discharged; biometrics authorization was confirmed as AUTHORIZED and all required steps completed.
- Failure: Incorrect OTP
OTP verification failed.
- Failure: Invalid or Pending Biometrics Authorization
The auth_guid does not correspond to an AUTHORIZED authorization. Ensure the patient has completed fingerprint matching before submitting.
- Failure: Missing Conditional Data
discharge_reason == DECEASED but next-of-kin info not provided.
- Failure: Invalid Discharge Date
Discharge date is before admission or in the future.
- Failure: Missing Required Data
Any required field (e.g., consent_token, discharge_reason) is missing or malformed.


---


## 3. Related Guides and Scenarios


- [Scenario 1: SHIF IP Per Diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)
- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Scenario 3: SHIF IP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)

Last modified on
April 30, 2026
Claim Dispatch Process Overview
Outpatient Claim Dispatch

---

## Remittance Process Overview: Streamlining Payment Reconciliation for Healthcare Providers

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/remittances/remittanceProcessOverview](https://hie-docs.dha.go.ke/docs/claims/process/remittances/remittanceProcessOverview)

# Remittance Process Overview: Streamlining Payment Reconciliation for Healthcare Providers


## 1. Introduction: Understanding Remittance


This comprehensive guide provides a high-level overview of how the financial reconciliation of payments received from the Social Health Authority (SHA) for submitted claims is managed.


The Remittance process is a series of interconnected steps designed to ensure that healthcare providers can accurately track and reconcile payments against their submitted claims. It's about moving from a state where payments have been received to a clear, reconciled financial record.


### 1.1. Why This Full Process Matters


An accurate Remittance process is fundamental to efficient, transparent, and compliant financial operations in healthcare. It is crucial because it:


- **Ensures Financial Transparency & Accuracy**: Providers understand what they’ve been paid, by whom, and for which claims - reducing discrepancies.
- **Enables Efficient Reconciliation**: Automates matching of incoming payments to claims, minimizing manual work and potential errors.
- **Supports Audit Readiness**: Maintains a clear audit trail of all payments and associated claims for compliance and reviews.
- **Improves Cash Flow Management**: Helps providers allocate received funds faster, enhancing financial planning and operational stability.


---


## 2. The Full Remittance Journey: Step-by-Step Payment Reconciliation


The complete Remittance process is a multi-step journey, with each workflow building on the previous. Each stage adds depth until full reconciliation is achieved.


### 2.1. Step 1: Get Remittances


This foundational step retrieves a high-level summary of all remittances (payments) received by a specific healthcare facility from SHA.


- **Purpose**: Provides an initial overview of all incoming payments.
- **Value**: Helps facilities identify new remittances for reconciliation.


### 2.2. Step 2: Get Claims Paid by Remittance


This workflow provides a detailed breakdown of the specific claims that were paid under a given remittance.


- **Purpose**: Enables claim-level reconciliation.
- **Value**: Identifies which claims were fully paid, partially paid, or unpaid.


---


## 3. How Workflows Connect: The Power of Interdependency


While distinct, these workflows are interconnected and form a cohesive reconciliation system. Key dependencies include:


- Cascading Dependencies:
The Get claims paid by remittance workflow depends on output from Get Remittances. Specifically, bank_reference from the first is required to query the second.
- Consistent Facility Identification:
Both workflows use the same facility_id and facility_id_type, ensuring accurate data retrieval and segregation by provider.


---


## 4. Key Success Factors for Overall Remittance Integration


To successfully and efficiently integrate with the Remittance process, follow these best practices:


- Accurate Facility Identification
Always supply correct facility_id and facility_id_type to access relevant remittance data.
- Effective Remittance Identifier Management
Use the bank_reference from the Get Remittances output to accurately query Get claims paid by remittance.
- Robust Error Handling
Build in logic to handle invalid IDs or remittance references, enabling your system to manage failures gracefully.


These principles will ensure smooth, accurate integration with the Remittance process - streamlining reconciliation and improving your financial visibility.

Last modified on
April 30, 2026
Outpatient Claim Dispatch
Get Remittances

---

## Remittance Process Guide: Get Remittances Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/remittances/getRemittance](https://hie-docs.dha.go.ke/docs/claims/process/remittances/getRemittance)

# Remittance Process Guide: Get Remittances Workflow


## 1. Overview: Retrieving High-Level Remittance Information


This guide provides an overview of the **Get Remittances** workflow, which is the crucial first step in the larger Remittance Process. It reviews incoming payments from the Social Health Authority (SHA). The main function of this workflow is to gather a summary of all remittances (payments) received by a specific healthcare facility.


### 1.1. What This Workflow Does


The Get Remittances workflow provides a high-level list of payment batches (remittances) sent by SHA to a facility. It does this by taking the facility's identification details and querying the system for all matching remittance records.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Getting a clear overview of received remittances is essential for starting the reconciliation process. Without this step:


- **Delayed Reconciliation**: Payment-to-claim matching is delayed, causing slower financial closure.
- **Missed Payments**: Payments may go unnoticed, leading to financial discrepancies.
- **Inefficient Tracking**: Manual tracking is error-prone and time-consuming.


This workflow is the **gateway to payment reconciliation**. All other steps depend on the accurate, complete list it provides.


---


## 2. Workflow Details: Get Remittances


### 2.1. Workflow Description: Step-by-Step System Behavior


1. Input Reception: The system receives facility_id and facility_id_type.
2. Facility Validation: The system validates that the ID and ID type correspond to a registered and recognised facility.
3. Remittance Data Retrieval: After validation, the system queries financial records for all remittances linked to that facility.
4. Data Compilation: It compiles key information including:

bank_reference
payment amounts
payment dates
5. Output Delivery: The system returns a list of high-level remittances.


---


### 2.2. Key Validations: Our System’s Essential Checks


- **Valid Facility Identification**

facility_id must be a legitimate facility identifier.
facility_id_type must be a supported type:

fr-code,
registration-number,
fid.


These ensure the system retrieves data for the correct, authorised facility - preventing data leakage or mismatch.


---


### 2.3. Workflow Data Dictionary: What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| facility_id | Unique identifier for the healthcare facility | string | Yes | Primary key for identifying the target facility for remittance lookup |
| facility_id_type | Type of identifier (e.g.,fr-code,fid, etc.) | string | Yes | Helps the system correctly interpret and locate the facility |


---


### 2.4. Expected Outcomes from this Workflow


- Success: Remittances Retrieved
A valid list of remittances for the facility is returned.
- Failure: Invalid Facility Identification
The facility_id or facility_id_type is incorrect or unrecognised.
- Failure: No Remittances Found
The facility is valid, but no remittance records exist.
- Failure: Missing Required Data
Required fields (facility_id, facility_id_type) are missing or malformed.

Last modified on
April 30, 2026
Remittance Process Overview
Get Claims Paid By Remittance

---

## Remittance Process Guide: Get Claims Paid by Remittance Workflow

> Source: [https://hie-docs.dha.go.ke/docs/claims/process/remittances/getClaimsPaidbyRemittance](https://hie-docs.dha.go.ke/docs/claims/process/remittances/getClaimsPaidbyRemittance)

# Remittance Process Guide: Get Claims Paid by Remittance Workflow


## 1. Overview: Accessing a Detailed Claim Breakdown for a Specific Payment


This guide focuses on the **Get claims paid by remittance** workflow, which is part of the larger Remittance Process. It examines a specific payment to determine which claims were covered by that payment. The primary purpose of this workflow is to provide a **detailed, claim-by-claim breakdown** of a specific remittance, enabling accurate financial reconciliation.


### 1.1. What This Workflow Does


This workflow retrieves a list of all claims that were paid under a given remittance. It uses the unique `bank_reference` and the facility's ID to return individual claim-level payment information.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


A claim-by-claim breakdown is essential to proper reconciliation. Without this:


- **Unreconciled Claims**: The facility won't know which specific claims were paid.
- **Billing Discrepancies**: Partial, full, or denied claims go untracked, causing accounting errors.
- **Inefficient Follow-up**: Outstanding claims can't be pursued without clarity.
- **Audit Deficiencies**: Missing links between payments and claims create audit trail gaps.


This workflow ensures every payment is mapped to its respective claims for clean accounting and tracking.


---


## 2. Workflow Details: Get Claims Paid by Remittance


### 2.1. Workflow Description: Step-by-Step System Behavior


1. Input Reception
Receives:

facility_id
facility_id_type
bank_reference
2. Validation

Confirms the facility is valid.
Confirms the bank_reference is valid for that facility.
3. Claim Data Retrieval
Queries the system for all claims associated with the given bank_reference.
4. Data Compilation
Gathers claim details:

Claim ID
Payment amount
Payment status
5. Output Delivery
Returns the complete claim list for that remittance.


---


### 2.2. Key Validations: Our System’s Essential Checks


- Valid Remittance Identifier
bank_reference must exist and be linked to the specified facility.
- Valid Facility Identification
facility_id must be valid, and facility_id_type must be one of:

fr-code
registration-number
fid


---


### 2.3. Workflow Data Dictionary: What Information We Work With


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| facility_id | Unique identifier of the healthcare facility | string | Yes | Primary key used to locate remittance and claim data |
| facility_id_type | Format/type offacility_id(e.g.,fr-code,fid) | string | Yes | Informs the system how to interpret and validate the facility |
| bank_reference | Unique identifier for a specific remittance payment | string | Yes | Connects the request to a specific remittance for claim lookup |


---


### 2.4. Expected Outcomes from this Workflow


- Success: Claims Breakdown Retrieved
A detailed list of claims paid under the specified remittance is returned.
- Failure: Invalid Remittance Reference
The bank_reference is not valid for the specified facility.
- Failure: Invalid Facility Identification
The facility_id or facility_id_type is incorrect or not recognised.
- Failure: No Claims Found
The remittance exists, but no claims are linked to it.
- Failure: Missing Required Data
One or more required fields (facility_id, bank_reference) is missing or malformed.

Last modified on
April 30, 2026
Get Remittances
SHA Combination Rules

---
