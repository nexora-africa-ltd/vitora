# DHA HIE Integration Scenarios Reference

> **Source**: [DHA Health Information Exchange Documentation](https://hie-docs.dha.go.ke/docs/scenarios/overview)
> **Scraped**: 2026-05-01 20:37 UTC
> **Purpose**: Offline reference for Vitora HMIS SHA integration development
> **COMPLIANT** ✔

---

## Table of Contents

1. [Integration Scenarios](#integration-scenarios)
2. [Scenario 1: SHIF - Inpatient - Per Diem - No Preauth](#scenario-1-shif---inpatient---per-diem---no-preauth)
3. [Scenario 2: SHIF - Inpatient - Fee for Service - Normal/Special Preauth](#scenario-2-shif---inpatient---fee-for-service---normalspecial-preauth)
4. [Scenario 3: SHIF - Inpatient - Fee for Service - Elective Preauth](#scenario-3-shif---inpatient---fee-for-service---elective-preauth)
5. [Scenario 4: SHIF - Outpatient - Fee for Service - Elective Preauth](#scenario-4-shif---outpatient---fee-for-service---elective-preauth)
6. [Scenario 5: SHIF - Outpatient - Fee for Service - Normal/Special Preauth](#scenario-5-shif---outpatient---fee-for-service---normalspecial-preauth)
7. [Scenario 6: UHC - Outpatient - Capitation](#scenario-6-uhc---outpatient---capitation)

---

## Integration Scenarios

> Source: [https://hie-docs.dha.go.ke/docs/scenarios/overview](https://hie-docs.dha.go.ke/docs/scenarios/overview)

# Integration Scenarios


This section gives you end-to-end API roadmaps for the most common integration paths on the HIE platform. Each scenario maps a real clinical use case to the exact sequence of API calls across all services - from authentication through to claim submission.


Use the decision matrix below to identify which scenario matches the intervention you are integrating, then follow the step-by-step walkthrough for that path.


---


## General API Flow


In most cases, every integration on a visit flow starts with an eligibility check - verifying whether the patient is eligible for SHA and what services they can receive at the hospital. These can be seen as four prerequisite steps regardless of which scenario follows. They establish the patient's identity, their coverage, and the specific services available to them at your facility.


| Step | Action | Service | Endpoint | Key Inputs | Key Output |
| --- | --- | --- | --- | --- | --- |
| 1 | Get Access Token | Auth | POST /api/v1/tenants/token | client_id,client_secret | access_token |
| 2 | Patient Search | Registries | GET /api/v1/patients | identification_number,identification_type | id(beneficiary CR ID) - use aspatient_id; also returns demographics for HMIS registration |
| 3 | Check SHA Eligibility | eClaims | GET /api/v1/patients/eligibility | identification_number,identification_type | Eligibility status of their various schemes under SHA |
| 4 | Sub-Benefit Coverage | eClaims | GET /api/v1/patients/sub-benefits | patient_id | sub_benefit_codelist |
| 5 | Intervention Coverage | eClaims | GET /api/v1/patients/benefits/interventions | patient_id,sub_benefit_code | Intervention list with flags (see below) |


### Read the Intervention Flags


The response from **Step 5 (Intervention Coverage)** contains the fields that determine which scenario applies. Check these on every intervention before proceeding:


- `paymentMechanism` - `PER_DIEM` or `FEE_FOR_SERVICE`
- `needsPreauth` - `true` or `false`
- `needsManualPreauthApproval` - `true` = elective preauth required
- `accessPoint` - `IP` (inpatient), `OP` (outpatient), or both
- `fund` - `SHIF`, `UHC`, etc.


---


## Scenario Decision Matrix


| Scenario | Fund | Access Point | Payment Mechanism | Needs Preauth | Elective Preauth | Claim Dispatch |
| --- | --- | --- | --- | --- | --- | --- |
| Scenario 1: SHIF IP Per Diem | SHIF | Inpatient | Per Diem | No | N/A | Discharge |
| Scenario 2: SHIF IP FFS Normal Preauth | SHIF | Inpatient | Fee for Service | Yes | No | Discharge |
| Scenario 3: SHIF IP FFS Elective Preauth | SHIF | Inpatient | Fee for Service | Yes | Yes | Discharge |
| Scenario 4: SHIF OP FFS Elective Preauth | SHIF | Outpatient | Fee for Service | Yes | Yes | Submit |
| Scenario 5: SHIF OP FFS Normal Preauth | SHIF | Outpatient | Fee for Service | Yes | No | Submit |
| Scenario 6: UHC OP Capitation | UHC | Outpatient | Capitation | N/A | N/A | Submit |


---


## Consent: OTP vs Biometrics


All scenarios require patient consent to start a visit. The consent flow is the same regardless of scenario - only the authorization method differs. Both methods are documented separately below.


### OTP Flow


| Step | Action | Service | Endpoint | Notes |
| --- | --- | --- | --- | --- |
| A | Get patient contacts | Consent | GET /api/v1/patients/contacts | Returns a list of masked contact numbers. Show the patient their masked number(s) and confirm which they want to use. Take theidof that contact. |
| B | Send OTP | Consent | POST /api/v1/claims/otp | Pass thebeneficiary_contact_idfrom Step A to target a specific contact. If omitted, the patient's default contact is used. |
| C | Use OTP in visit creation | eClaims | POST /api/v1/claims/visit | Pass the OTP directly when creating the claim. |


For **elective scenarios only**, the OTP is also used in a pre-visit `/authorize` call before the day of the actual visit (see Scenarios 3 and 4).


### OTP consent: example contacts response


```json
{
  "count": 1,
  "results": [
    {
      "id": 675590,
      "contactValue": "+254714***898",
      "contactType": "PHO",
      "isConfirmed": true,
      "active": true
    }
  ]
}
```


Confirm the masked number with the patient, then use the `id` as `beneficiary_contact_id` in the Send OTP call.


---


### Biometrics Flow


| Step | Action | Service | Endpoint | Notes |
| --- | --- | --- | --- | --- |
| A | Create authorization | Consent | POST /api/v1/claims/authorize | Provide biometric-specific fields. Authorization is created inPENDINGstatus. Response includes an iframe link where fingerprint matching is initiated and feedback is shown. |
| B | Patient matches fingerprints | - | (via iframe) | After successful matching, authorization transitions toAUTHORIZED(standard visit) orAUTHORIZED_PENDING_VISIT(elective service). |
| C | Use auth_guid in visit creation | eClaims | POST /api/v1/claims/visit | Pass theauth_guidfrom the authorization. No second consent step is needed on the day of visit. |


### token is your consent identifier


The `token` field in the `POST /api/v1/claims/authorize` response is used as the `consent_token` parameter in all downstream eClaims endpoints. Store it immediately - it is required for every action on the visit.


For biometrics, you also store the `guid` to reference the authorization by `auth_guid` in visit and discharge endpoints.


---


### Biometrics Discharge


Discharge can also be performed via biometrics. The process mirrors the start-visit biometrics flow:


1. Hit `POST /api/v1/claims/authorize` with biometric fields
2. Match the patient's fingerprints via the iframe (authorization goes from `PENDING` to `AUTHORIZED`)
3. Call `POST /api/v1/claims/discharge` - remove the `otp` field and replace with `auth_guid`, providing the GUID of the authorization where fingerprints were matched


---


## Claim Dispatch Reference


| Visit Type | Action | Endpoint |
| --- | --- | --- |
| Outpatient | Submit claim | POST /api/v1/claims/submit |
| Inpatient | Send discharge OTP | POST /api/v1/claims/otp/discharge |
| Inpatient | Discharge patient (submits claim) | POST /api/v1/claims/discharge |
| Any | Discard claim | POST /api/v1/claims/close |

Last modified on
April 30, 2026
Scenario 1: SHIF IP Per Diem

---

## Scenario 1: SHIF - Inpatient - Per Diem - No Preauth

> Source: [https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)

# Scenario 1: SHIF - Inpatient - Per Diem - No Preauth


A patient is admitted to a ward and the intervention is charged on a **per-day tariff**. No preauthorization is required. The claim is submitted at discharge.


## Intervention Properties


| Property | Value |
| --- | --- |
| Fund | SHIF |
| Access Point | Inpatient (IP) |
| Payment Mechanism | Per Diem |
| Needs Preauth | No (needsPreauth: false) |
| Elective Preauth | N/A |
| Tariff Type | Hospital Level Tariff |


**How to identify this scenario:** After calling `GET /api/v1/patients/benefits/interventions`, the intervention has `paymentMechanism: "PER_DIEM"` and `needsPreauth: false`.


Examples: General Ward Admission (Management of Medical Cases), HDU, ICU transfers.


## Hospital Level Tariff


Per diem interventions use a Hospital Level Tariff. SHA sets specific tariff amounts for each hospital based on their KEPH level as determined by KMPDC. The tariff fields in the intervention response correspond to each level:


| Field | KEPH Level |
| --- | --- |
| level2Tariff | Level 2 (lowest) |
| level3Tariff | Level 3 |
| level4Tariff | Level 4 |
| level5Tariff | Level 5 |
| level6Tariff | Level 6 (highest) |


Your facility's applicable tariff is determined by its KEPH level. When submitting `unit_price` in `POST /api/v1/claims/lines`, use the tariff value for your facility's level. If the submitted amount exceeds the tariff for your level, the request is rolled back.


---


## Complete Flow

**Participants:**
- 🏥 Point of Care
- 🔐 Auth Service
- 📋 Registries
- ✅ Consent Service
- 🔄 eClaims & Preauths

**Flow:**
1. POST /api/v1/tenants/token
2. access_token
3. GET /api/v1/patients
4. patient.id (beneficiary CR ID - used as patient_id)
5. GET /api/v1/patients/eligibility
6. eligibility status (schemes under SHA)
7. GET /api/v1/patients/sub-benefits
8. sub_benefit_code list
9. GET /api/v1/patients/benefits/interventions
10. interventions (paymentMechanism=PER_DIEM, needsPreauth=false)
11. GET /api/v1/patients/contacts
12. masked contact list (confirm number with patient, get contact id)
13. POST /api/v1/claims/otp (beneficiary_contact_id optional)
14. OTP sent to patient
15. POST /api/v1/claims/authorize (biometric fields)
16. authorization (status PENDING) + iframe link for fingerprint matching
17. authorization transitions to AUTHORIZED
18. POST /api/v1/claims/visit (otp OR auth_guid)
19. IP claim created
20. POST /api/v1/claims/lines (diagnoses + attachments + unit_price for tariff check)
21. OK (amount validated against Hospital Level Tariff)
22. POST /api/v1/claims/preview
23. provider claim preview
24. POST /api/v1/claims/otp/discharge
25. Discharge OTP sent to patient
26. POST /api/v1/claims/discharge (otp field)
27. claim submitted
28. POST /api/v1/claims/authorize (biometric fields)
29. authorization (status PENDING) + iframe link
30. authorization transitions to AUTHORIZED
31. POST /api/v1/claims/discharge (auth_guid field instead of otp)
32. claim submitted

**Notes:**
- General API Flow
- Get Patient Consent (OTP path)
- OR Get Patient Consent (Biometrics path)
- Patient matches fingerprints via iframe
- Create Inpatient Claim
- Add Combined Billing Details
- Line item is AUTO-GENERATED for per diem
- Discharge (OTP path)
- OR Discharge (Biometrics path)



---


## Step-by-Step API Calls


### Phase 1: General API Flow


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 1 | Get access token | Auth | POST /api/v1/tenants/token | client_id,client_secret | access_token |
| 2 | Patient search | Registries | GET /api/v1/patients | identification_number,identification_type | id(beneficiary CR ID) - store aspatient_id; demographics for HMIS registration |
| 3 | SHA eligibility check | eClaims | GET /api/v1/patients/eligibility | identification_number,identification_type | Eligibility status of schemes under SHA |
| 4 | Sub-benefit coverage | eClaims | GET /api/v1/patients/sub-benefits | patient_id | sub_benefit_codelist |
| 5 | Intervention coverage | eClaims | GET /api/v1/patients/benefits/interventions | patient_id,sub_benefit_code | intervention_code,paymentMechanism,needsPreauth, tariff fields per KEPH level |


### Phase 2: Patient Consent


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6a | Get patient contacts | Consent | GET /api/v1/patients/contacts | patient_id | Masked contact list withid- confirm contact with patient |
| 7a | Send OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes,beneficiary_contact_id(optional) | OTP delivered to patient |
| 8a | Create claim with OTP | eClaims | POST /api/v1/claims/visit | otp,intervention_code,service_type: "INPATIENT" | Claim created |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6b | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields,service_type: "INPATIENT" | Authorization inPENDINGstatus;guid; iframe link for fingerprint matching |
| 7b | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED |
| 8b | Create claim with auth_guid | eClaims | POST /api/v1/claims/visit | auth_guid,intervention_code,service_type: "INPATIENT" | Claim created |


### Phase 3: Create Claim


See Phase 2 above - the claim is created as part of the consent step (OTP or `auth_guid` passed directly into `POST /api/v1/claims/visit`).


### Phase 4: Add Combined Billing Details


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 10 | Add combined billing details | eClaims | POST /api/v1/claims/lines | consent_token,intervention_code,unit_price(your KEPH level tariff value for validation),diagnoses(ICD-11 array),attachments(files + metadata) | Tariff validation result |


### Phase 5: Preview & Dispatch


**OTP discharge path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 11 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 12 | Send discharge OTP | eClaims | POST /api/v1/claims/otp/discharge | consent_token | OTP sent for discharge consent |
| 13 | Discharge patient | eClaims | POST /api/v1/claims/discharge | otp(discharge OTP) | Claim submitted to SHA |


**Biometrics discharge path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 11 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 12 | Create discharge authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields | Authorization inPENDINGstatus + iframe link |
| 13 | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED |
| 14 | Discharge patient | eClaims | POST /api/v1/claims/discharge | auth_guid(from Step 12 authorization) | Claim submitted to SHA |


---


## Field Flow Between Steps


| Output Field | Step It Comes From | Used In |
| --- | --- | --- |
| access_token | Step 1 | Authorization header for all subsequent requests |
| patient.id(beneficiary CR ID) | Step 2 | patient_idin Steps 3, 4, 5, 6, 7, 8 |
| sub_benefit_code | Step 4 | sub_benefit_codein Step 5 |
| intervention_code | Step 5 | interventionsin Step 8;intervention_codein Steps 9, 10 |
| token(OTP path) | n/a - OTP used directly | otpfield inPOST /api/v1/claims/visit |
| guid(Biometrics path) | Step 6b authorize | auth_guidinPOST /api/v1/claims/visitand biometrics discharge |


---


## Important Notes


### Per Diem: Do Not Add a Manual Line Item


For per diem interventions, the system **automatically generates the claim line item** based on the accrued days and the applicable tariff. You do **not** need to specify a separate line item when calling `POST /api/v1/claims/lines`.


Submit `diagnoses` and `attachments` only. The `unit_price` field you send is used purely for tariff validation - it is compared against the intervention's Hospital Level Tariff for your facility's KEPH level. If the submitted amount exceeds the tariff, the entire request is rolled back and an error is returned.


### One Active Per Diem Intervention at a Time


A claim cannot have more than one **active** per diem intervention at the same time. If the patient needs to transfer between wards (e.g., General Ward → ICU), you must **switch** the intervention using `POST /api/v1/claims/interventions/switch` rather than adding a new one alongside the existing active intervention.


See the intervention management guides for details on switching.


### Discharge Submits the Claim


The discharge step (`POST /api/v1/claims/discharge`) both discharges the patient and simultaneously submits the claim to SHA. There is no separate submit step for inpatient claims.


Before discharging, always run `POST /api/v1/claims/preview` to verify the claim is complete and correct.


---


## See Also


- [Start Visit Consent Process](https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitConsentProcessOverview) - Detailed OTP and biometrics authorization walkthrough
- [Intervention Coverage](https://hie-docs.dha.go.ke/docs/claims/process/eligibility/interventionsCoverage) - How to read intervention flags
- [Billing Process Overview](https://hie-docs.dha.go.ke/docs/claims/process/billing/billingProcessOverview) - Combined billing details
- [Inpatient Claim Dispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/inPatientClaimDispatch) - Discharge flow details
- [Add Intervention](https://hie-docs.dha.go.ke/docs/claims/process/interventions/addIntervention) - Managing multiple interventions on a visit
- [Switch Intervention](https://hie-docs.dha.go.ke/docs/claims/process/interventions/switchIntervention) - Ward transfer / per diem switching rules

Last modified on
April 30, 2026
Scenarios Overview
Scenario 2: SHIF IP FFS Normal Preauth

---

## Scenario 2: SHIF - Inpatient - Fee for Service - Normal/Special Preauth

> Source: [https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)

# Scenario 2: SHIF - Inpatient - Fee for Service - Normal/Special Preauth


A patient is admitted for a service that is billed per item (fee for service) and requires a **non-elective preauthorization** raised within the same visit. The preauth must reach `FINALISED` status before billing can proceed. The claim is submitted at discharge.


## Intervention Properties


| Property | Value |
| --- | --- |
| Fund | SHIF |
| Access Point | Inpatient (IP) |
| Payment Mechanism | Fee for Service |
| Needs Preauth | Yes (needsPreauth: true) |
| Elective Preauth | No (needsManualPreauthApproval: false) |
| Tariff Type | Overall / KEPH Level |


**How to identify this scenario:** After calling `GET /api/v1/patients/benefits/interventions`, the intervention has `paymentMechanism: "FEE_FOR_SERVICE"`, `needsPreauth: true`, and `needsManualPreauthApproval: false`.


The preauth type (normal, surgical, oncology, renal, imaging, optical) is indicated by the `isSurgicalPreauth`, `isRenalPreauth`, `isOncologyPreauth`, `isImagingPreauth`, and `isOpticalPreauth` flags. Normal preauth = all flags are false.


---


## Complete Flow

**Participants:**
- 🏥 Point of Care
- 🔐 Auth Service
- 📋 Registries
- ✅ Consent Service
- 🔄 eClaims & Preauths

**Flow:**
1. POST /api/v1/tenants/token
2. access_token
3. GET /api/v1/patients
4. patient.id (patient_id)
5. GET /api/v1/patients/eligibility
6. eligibility status
7. GET /api/v1/patients/sub-benefits
8. sub_benefit_code list
9. GET /api/v1/patients/benefits/interventions
10. interventions (needsPreauth=true, needsManualPreauthApproval=false)
11. GET /api/v1/patients/contacts
12. masked contact list (confirm number with patient, get contact id)
13. POST /api/v1/claims/otp (beneficiary_contact_id optional)
14. OTP sent to patient
15. POST /api/v1/claims/authorize (biometric fields)
16. authorization (status PENDING) + iframe link for fingerprint matching
17. authorization transitions to AUTHORIZED
18. POST /api/v1/claims/visit (otp OR auth_guid, service_type: INPATIENT)
19. IP claim created
20. POST /api/v1/preauths (normal or special form, includes doctor info)
21. preauth created (no doctor approval step for non-elective)
22. GET /api/v1/preauths?consent_token=...
23. preauth status
24. POST /api/v1/claims/lines (line item + diagnoses + attachments)
25. billing details saved (validated against tariff)
26. POST /api/v1/claims/preview
27. provider claim preview
28. POST /api/v1/claims/otp/discharge
29. Discharge OTP sent
30. POST /api/v1/claims/discharge (otp field)
31. claim submitted
32. POST /api/v1/claims/authorize (biometric fields)
33. authorization (status PENDING) + iframe link
34. authorization transitions to AUTHORIZED
35. POST /api/v1/claims/discharge (auth_guid field instead of otp)
36. claim submitted

**Notes:**
- General API Flow
- Get Patient Consent (OTP path)
- OR Get Patient Consent (Biometrics path)
- Patient matches fingerprints via iframe
- Create IP Claim
- Create Preauth (within visit)
- Add Combined Billing Details
- Only allowed after preauth is FINALISED
- Discharge (OTP path)
- OR Discharge (Biometrics path)



---


## Step-by-Step API Calls


### Phase 1: General API Flow


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 1 | Get access token | Auth | POST /api/v1/tenants/token | client_id,client_secret | access_token |
| 2 | Patient search | Registries | GET /api/v1/patients | identification_number,identification_type | id(beneficiary CR ID) - store aspatient_id |
| 3 | SHA eligibility check | eClaims | GET /api/v1/patients/eligibility | identification_number,identification_type | Eligibility status of schemes under SHA |
| 4 | Sub-benefit coverage | eClaims | GET /api/v1/patients/sub-benefits | patient_id | sub_benefit_codelist |
| 5 | Intervention coverage | eClaims | GET /api/v1/patients/benefits/interventions | patient_id,sub_benefit_code | intervention_code,needsPreauth,needsManualPreauthApproval, preauth type flags |


### Phase 2: Patient Consent


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6a | Get patient contacts | Consent | GET /api/v1/patients/contacts | patient_id | Masked contact list withid- confirm contact with patient |
| 7a | Send OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes,beneficiary_contact_id(optional) | OTP sent |
| 8a | Create claim with OTP | eClaims | POST /api/v1/claims/visit | otp,intervention_code,service_type: "INPATIENT" | IP claim created |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6b | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields,service_type: "INPATIENT" | AuthorizationPENDING;guid; iframe link |
| 7b | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED |
| 8b | Create claim with auth_guid | eClaims | POST /api/v1/claims/visit | auth_guid,intervention_code,service_type: "INPATIENT" | IP claim created |


### Phase 3: Create Claim


See Phase 2 above - the claim is created as part of the consent step.


### Phase 4: Create & Await Preauth


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 10 | Create preauth | eClaims | POST /api/v1/preauths | consent_token,intervention_code, preauth form fields (normal or special), doctor details, diagnosis, attachments, requested amount | Preauth created |
| 11 | Poll preauth status | eClaims | GET /api/v1/preauths | consent_token | status- repeat untilFINALISED |


### Phase 5: Add Combined Billing Details


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 12 | Add combined billing details | eClaims | POST /api/v1/claims/lines | consent_token,intervention_code,unit_price,quantity,diagnoses(ICD-11 array),attachments | Billing saved; amount validated against tariff |


### Phase 6: Preview & Dispatch


**OTP discharge path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 13 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 14 | Send discharge OTP | eClaims | POST /api/v1/claims/otp/discharge | consent_token | OTP sent for discharge |
| 15 | Discharge patient | eClaims | POST /api/v1/claims/discharge | otp(discharge OTP) | Claim submitted to SHA |


**Biometrics discharge path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 13 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 14 | Create discharge authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields | AuthorizationPENDING+ iframe link |
| 15 | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED |
| 16 | Discharge patient | eClaims | POST /api/v1/claims/discharge | auth_guid(from Step 14) | Claim submitted to SHA |


---


## Field Flow Between Steps


| Output Field | Step It Comes From | Used In |
| --- | --- | --- |
| access_token | Step 1 | Authorization header - all requests |
| patient.id | Step 2 | patient_idin Steps 3-8 |
| sub_benefit_code | Step 4 | Step 5 |
| intervention_code | Step 5 | Steps 8, 9, 10, 12 |
| OTP (OTP path) | Patient receives via SMS | otpfield inPOST /api/v1/claims/visitand discharge |
| guid(Biometrics path) | Step 6b authorize | auth_guidinPOST /api/v1/claims/visitand biometrics discharge |
| consent_token | From claim creation (Step 8) | Steps 10-16 |


---


## Choosing the Right Preauth Form


| Preauth Type | When to Use | Intervention Flag |
| --- | --- | --- |
| Normal Preauth | General services with no special clinical form | All special flags =false |
| Surgical Preauth | Surgical procedures | isSurgicalPreauth: true |
| Oncology Preauth | Cancer treatments | isOncologyPreauth: true |
| Renal Preauth | Dialysis and renal services | isRenalPreauth: true |
| Imaging Preauth | Radiology / imaging | isImagingPreauth: true |
| Optical Preauth | Eye care services | isOpticalPreauth: true |


Each special preauth form collects additional clinical data specific to that service category. The `POST /api/v1/preauths` endpoint accepts all types via a `oneOf` schema - submit the form that matches the flag.


---


## Important Notes


### Billing Requires an Approved Preauth


You cannot add bill items to the claim until the preauth status is `FINALISED`. Any attempt to call `POST /api/v1/claims/lines` before the preauth is approved will be rejected.


Poll `GET /api/v1/preauths?consent_token=...` until the status reaches `FINALISED` before proceeding to billing.


### Doctor Info Required, But No Approval Step for Non-Elective Preauths


When you call `POST /api/v1/preauths` for a non-elective preauth, doctor information (doctor name, doctor ID, etc.) is required in the payload. However, the doctor does **not** need to approve the preauth. The system processes it directly without waiting for doctor confirmation.


Doctor approval (which puts the preauth into `PENDING_DOCTOR_APPROVAL` status) is only required for **elective preauths** - see Scenarios 3 and 4.


The `POST /api/v1/claims/doctor-consent` endpoint is used only as a fallback to resend a consent request if a doctor reports they did not receive it.


### Billing Amount Validated Against Tariff


The `unit_price` submitted in `POST /api/v1/claims/lines` is validated against the intervention's Overall/KEPH Level tariff. The billed amount must not exceed the tariff. If it does, the entire combined billing request is rolled back.


---


## See Also


- [Normal Preauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/normalPreauths) - Full normal preauth guide
- [Surgical Preauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/surgicalPreauths) - Surgical-specific form fields
- [Preauth Doctor Consent](https://hie-docs.dha.go.ke/docs/claims/process/preauthDoctorConsent/preauthDocConsent) - When and how to resend doctor consent
- [Understanding Preauth Statuses](https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauthStatuses) - Full status lifecycle
- [Billing Process Overview](https://hie-docs.dha.go.ke/docs/claims/process/billing/billingProcessOverview)
- [Inpatient Claim Dispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/inPatientClaimDispatch)

Last modified on
April 30, 2026
Scenario 1: SHIF IP Per Diem
Scenario 3: SHIF IP FFS Elective Preauth

---

## Scenario 3: SHIF - Inpatient - Fee for Service - Elective Preauth

> Source: [https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)

# Scenario 3: SHIF - Inpatient - Fee for Service - Elective Preauth


A patient is scheduled for a planned inpatient procedure that requires **prior approval before the visit begins** (elective preauthorization). The preauth is created and approved in advance. On the day of the actual visit, the claim is created using the same patient and intervention - no new consent or authorization step is needed.


## Intervention Properties


| Property | Value |
| --- | --- |
| Fund | SHIF |
| Access Point | Inpatient (IP) |
| Payment Mechanism | Fee for Service |
| Needs Preauth | Yes (needsPreauth: true) |
| Elective Preauth | Yes (needsManualPreauthApproval: true) |
| Tariff Type | Overall / KEPH Level |


**How to identify this scenario:** After calling `GET /api/v1/patients/benefits/interventions`, the intervention has `paymentMechanism: "FEE_FOR_SERVICE"`, `needsPreauth: true`, and `needsManualPreauthApproval: true` with `accessPoint: "IP"`.


---


## Complete Flow

**Participants:**
- 🏥 Point of Care
- 🔐 Auth Service
- 📋 Registries
- ✅ Consent Service
- 🔄 eClaims & Preauths

**Flow:**
1. POST /api/v1/tenants/token
2. access_token
3. GET /api/v1/patients
4. patient.id (patient_id)
5. GET /api/v1/patients/eligibility
6. eligibility status
7. GET /api/v1/patients/sub-benefits
8. sub_benefit_code list
9. GET /api/v1/patients/benefits/interventions
10. interventions (needsManualPreauthApproval=true)
11. GET /api/v1/patients/contacts
12. masked contact list (confirm with patient, get contact id)
13. POST /api/v1/claims/otp (beneficiary_contact_id optional)
14. OTP sent to patient
15. POST /api/v1/claims/authorize (patient_id, otp)
16. authorization token (status: AUTHORIZED_PENDING_VISIT)
17. POST /api/v1/claims/authorize (biometric fields)
18. authorization (status: PENDING) + iframe link
19. authorization transitions to AUTHORIZED_PENDING_VISIT
20. POST /api/v1/preauths (consent_token = authorization token)
21. preauth created (status: PENDING_DOCTOR_APPROVAL)
22. preauth status: ACTIVE (sent to payer)
23. GET /api/v1/preauths?consent_token=...
24. preauth status
25. POST /api/v1/claims/otp
26. fresh OTP sent to patient
27. POST /api/v1/claims/visit (otp, same patient + intervention)
28. IP claim created
29. POST /api/v1/claims/visit (auth_guid, same patient + intervention)
30. IP claim created
31. POST /api/v1/claims/lines (line item + diagnoses + attachments)
32. billing saved (validated against tariff)
33. POST /api/v1/claims/preview
34. provider claim preview
35. POST /api/v1/claims/otp/discharge
36. Discharge OTP sent
37. POST /api/v1/claims/discharge (otp field)
38. claim submitted
39. POST /api/v1/claims/authorize (biometric fields)
40. authorization (status: PENDING) + iframe link
41. authorization transitions to AUTHORIZED
42. POST /api/v1/claims/discharge (auth_guid field)
43. claim submitted

**Notes:**
- PRE-VISIT PHASE (Before admission day)
- Get consent to create an authorization (OTP path)
- OR Get consent to create an authorization (Biometrics path)
- Patient matches fingerprints via iframe
- Create elective preauth using authorization token
- Doctor approves the preauth
- Preauth FINALISED - authorization transitions to AUTHORIZED
- DAY OF ACTUAL PATIENT VISIT
- OTP path - send fresh OTP, create claim directly
- OR Biometrics path - create claim directly using auth_guid
- Discharge (OTP path)
- OR Discharge (Biometrics path)



This scenario has **two distinct phases** separated in time.


---


## Step-by-Step API Calls


### Pre-Visit Phase


#### Phase 1: General API Flow


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 1 | Get access token | Auth | POST /api/v1/tenants/token | client_id,client_secret | access_token |
| 2 | Patient search | Registries | GET /api/v1/patients | identification_number,identification_type | id(beneficiary CR ID) - store aspatient_id |
| 3 | SHA eligibility check | eClaims | GET /api/v1/patients/eligibility | identification_number,identification_type | Eligibility status of schemes under SHA |
| 4 | Sub-benefit coverage | eClaims | GET /api/v1/patients/sub-benefits | patient_id | sub_benefit_codelist |
| 5 | Intervention coverage | eClaims | GET /api/v1/patients/benefits/interventions | patient_id,sub_benefit_code | intervention_code,needsManualPreauthApproval: trueconfirmed |


#### Phase 2: Authorization for Preauth


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6a | Get patient contacts | Consent | GET /api/v1/patients/contacts | patient_id | Masked contact list withid- confirm contact with patient |
| 7a | Send OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes,beneficiary_contact_id(optional) | OTP sent |
| 8a | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id,otp | Authorizationtoken(status:AUTHORIZED_PENDING_VISIT) |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6b | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields | AuthorizationPENDING;guid;token; iframe link |
| 7b | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED_PENDING_VISIT |


#### Phase 3: Create & Await Preauth


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 9 | Create preauth | eClaims | POST /api/v1/preauths | consent_token(authorizationtoken),intervention_code, preauth form, doctor details, diagnosis, requested amount, attachments | Preauth created (status:PENDING_DOCTOR_APPROVAL) |
| 10 | Poll preauth status | eClaims | GET /api/v1/preauths | consent_token | status- repeat untilFINALISED |


---


### Day of Actual Visit


### No New Consent Required on Day of Visit


On the day of the actual visit, you do **not** need to call `POST /api/v1/claims/authorize` again. The system checks that:


- The same `patient_id` is used
- The same `intervention_code` is used
- An existing authorization in `AUTHORIZED` status exists
- An approved preauth exists for this patient and intervention


For OTP: send a fresh OTP and pass it directly in `POST /api/v1/claims/visit`.
For biometrics: pass the `auth_guid` from the pre-visit authorization directly in `POST /api/v1/claims/visit`.


#### Phase 4: Create Claim


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 11a | Send fresh OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes | OTP sent |
| 12a | Create IP claim | eClaims | POST /api/v1/claims/visit | otp,intervention_code,service_type: "INPATIENT" | IP claim created;consent_tokenreturned |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 12b | Create IP claim | eClaims | POST /api/v1/claims/visit | auth_guid(from pre-visit authorization),intervention_code,service_type: "INPATIENT" | IP claim created;consent_tokenreturned |


#### Phase 5: Add Combined Billing Details


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 13 | Add combined billing details | eClaims | POST /api/v1/claims/lines | consent_token,intervention_code,unit_price,quantity,diagnoses,attachments | Billing saved |


#### Phase 6: Preview & Discharge


**OTP discharge path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 14 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 15 | Send discharge OTP | eClaims | POST /api/v1/claims/otp/discharge | consent_token | OTP sent for discharge |
| 16 | Discharge patient | eClaims | POST /api/v1/claims/discharge | otp(discharge OTP) | Claim submitted to SHA |


**Biometrics discharge path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 14 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 15 | Create discharge authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields | AuthorizationPENDING+ iframe link |
| 16 | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED |
| 17 | Discharge patient | eClaims | POST /api/v1/claims/discharge | auth_guid(from Step 15) | Claim submitted to SHA |


---


## Field Flow Between Steps


| Output Field | Step It Comes From | Used In |
| --- | --- | --- |
| access_token | Step 1 | Authorization header - all requests |
| patient.id | Step 2 | patient_idin all subsequent steps |
| intervention_code | Step 5 | Preauth, claim, billing steps |
| token(OTP path) | Step 8a | consent_tokeninPOST /api/v1/preauths |
| token(Biometrics path) | Step 6b | consent_tokeninPOST /api/v1/preauths |
| guid(Biometrics path) | Step 6b | auth_guidin Day-of-Visit claim creation |
| consent_token | From claim creation (Step 12) | Billing, preview, discharge steps |


---


## Important Notes


### Elective Preauth - Doctor Approval Required


For elective preauths, the doctor **must** approve before the preauth proceeds. The status flow is:


1. `PENDING_DOCTOR_APPROVAL` - created; awaiting doctor confirmation
2. `ACTIVE` - doctor approved; sent to payer for review
3. `FINALISED` - payer approved; preauth is now valid for claim creation


The `POST /api/v1/claims/doctor-consent` endpoint is available as a fallback to resend the consent request if the doctor reports they did not receive it.


### Authorization Status: AUTHORIZED_PENDING_VISIT


When you call `POST /api/v1/claims/authorize` during the pre-visit phase, the authorization is created in `AUTHORIZED_PENDING_VISIT` status. This is correct and expected - it means the patient has consented but no claim exists yet.


Once the preauth is approved (FINALISED), the authorization transitions to `AUTHORIZED` status, signaling that a claim can now be created for this patient and intervention.


### Same Patient and Intervention on the Day of Visit


The system automatically links the approved preauth to the new claim. For this to work, use the **same patient_id** and the **same intervention_code** that were used during the pre-visit phase.


---


## See Also


- [Elective Preauth Guide](https://hie-docs.dha.go.ke/docs/claims/process/preauths/electivePreauths) - Detailed elective preauth walkthrough
- [Understanding Preauth Statuses](https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauthStatuses)
- [Start Visit Consent Process](https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitConsentProcessOverview)
- [Billing Process Overview](https://hie-docs.dha.go.ke/docs/claims/process/billing/billingProcessOverview)
- [Inpatient Claim Dispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/inPatientClaimDispatch)

Last modified on
April 30, 2026
Scenario 2: SHIF IP FFS Normal Preauth
Scenario 4: SHIF OP FFS Elective Preauth

---

## Scenario 4: SHIF - Outpatient - Fee for Service - Elective Preauth

> Source: [https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth)

# Scenario 4: SHIF - Outpatient - Fee for Service - Elective Preauth


A patient is scheduled for a planned outpatient procedure that requires **prior approval before the visit begins** (elective preauthorization). The preauth is created and approved in advance. On the day of the actual visit, an outpatient claim is created using the same patient and intervention - no new consent or authorization step is needed.


## Intervention Properties


| Property | Value |
| --- | --- |
| Fund | SHIF |
| Access Point | Outpatient (OP) |
| Payment Mechanism | Fee for Service |
| Needs Preauth | Yes (needsPreauth: true) |
| Elective Preauth | Yes (needsManualPreauthApproval: true) |
| Tariff Type | Overall / KEPH Level |


**How to identify this scenario:** After calling `GET /api/v1/patients/benefits/interventions`, the intervention has `paymentMechanism: "FEE_FOR_SERVICE"`, `needsPreauth: true`, `needsManualPreauthApproval: true`, and `accessPoint: "OP"`.


This scenario is identical to [Scenario 3](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth) except the access point is **Outpatient** - the pre-visit phase is the same, but the day-of-visit phase creates an `OUTPATIENT` claim and ends with `POST /api/v1/claims/submit` instead of discharge.


---


## Complete Flow

**Participants:**
- 🏥 Point of Care
- 🔐 Auth Service
- 📋 Registries
- ✅ Consent Service
- 🔄 eClaims & Preauths

**Flow:**
1. POST /api/v1/tenants/token
2. access_token
3. GET /api/v1/patients
4. patient.id (patient_id)
5. GET /api/v1/patients/eligibility
6. eligibility status
7. GET /api/v1/patients/sub-benefits
8. sub_benefit_code list
9. GET /api/v1/patients/benefits/interventions
10. interventions (needsManualPreauthApproval=true, accessPoint=OP)
11. GET /api/v1/patients/contacts
12. masked contact list (confirm with patient, get contact id)
13. POST /api/v1/claims/otp (beneficiary_contact_id optional)
14. OTP sent to patient
15. POST /api/v1/claims/authorize (patient_id, otp)
16. authorization token (status: AUTHORIZED_PENDING_VISIT)
17. POST /api/v1/claims/authorize (biometric fields)
18. authorization (status: PENDING) + iframe link
19. authorization transitions to AUTHORIZED_PENDING_VISIT
20. POST /api/v1/preauths (consent_token = authorization token)
21. preauth created (status: PENDING_DOCTOR_APPROVAL)
22. preauth status: ACTIVE (sent to payer)
23. GET /api/v1/preauths?consent_token=...
24. preauth status
25. POST /api/v1/claims/otp
26. fresh OTP sent to patient
27. POST /api/v1/claims/visit (otp, same patient + intervention)
28. OP claim created
29. POST /api/v1/claims/visit (auth_guid, same patient + intervention)
30. OP claim created
31. POST /api/v1/claims/lines (line item + diagnoses + attachments)
32. billing saved
33. POST /api/v1/claims/preview
34. provider claim preview
35. POST /api/v1/claims/submit
36. outpatient claim submitted

**Notes:**
- PRE-VISIT PHASE (Before appointment day)
- Get consent to create an authorization (OTP path)
- OR Get consent to create an authorization (Biometrics path)
- Patient matches fingerprints via iframe
- Doctor approves the preauth
- Preauth FINALISED - authorization transitions to AUTHORIZED
- DAY OF ACTUAL PATIENT VISIT
- OTP path - send fresh OTP, create claim directly
- OR Biometrics path - create claim directly using auth_guid



---


## Step-by-Step API Calls


### Pre-Visit Phase


#### Phase 1: General API Flow


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 1 | Get access token | Auth | POST /api/v1/tenants/token | client_id,client_secret | access_token |
| 2 | Patient search | Registries | GET /api/v1/patients | identification_number,identification_type | id(beneficiary CR ID) - store aspatient_id |
| 3 | SHA eligibility check | eClaims | GET /api/v1/patients/eligibility | identification_number,identification_type | Eligibility status of schemes under SHA |
| 4 | Sub-benefit coverage | eClaims | GET /api/v1/patients/sub-benefits | patient_id | sub_benefit_codelist |
| 5 | Intervention coverage | eClaims | GET /api/v1/patients/benefits/interventions | patient_id,sub_benefit_code | intervention_code,needsManualPreauthApproval: trueconfirmed |


#### Phase 2: Authorization for Preauth


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6a | Get patient contacts | Consent | GET /api/v1/patients/contacts | patient_id | Masked contact list withid- confirm contact with patient |
| 7a | Send OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes,beneficiary_contact_id(optional) | OTP sent |
| 8a | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id,otp | Authorizationtoken(status:AUTHORIZED_PENDING_VISIT) |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6b | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields | AuthorizationPENDING;guid;token; iframe link |
| 7b | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED_PENDING_VISIT |


#### Phase 3: Create & Await Preauth


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 9 | Create preauth | eClaims | POST /api/v1/preauths | consent_token(authorizationtoken),intervention_code, preauth form, doctor details, diagnosis, requested amount, attachments | Preauth created (status:PENDING_DOCTOR_APPROVAL) |
| 10 | Poll preauth status | eClaims | GET /api/v1/preauths | consent_token | status- repeat untilFINALISED |


---


### Day of Actual Visit


### No New Consent Required on Day of Visit


On the day of the actual visit, you do **not** need to call `POST /api/v1/claims/authorize` again. The system checks that:


- The same `patient_id` is used
- The same `intervention_code` is used
- An existing authorization in `AUTHORIZED` status exists
- An approved preauth exists for this patient and intervention


For OTP: send a fresh OTP and pass it directly in `POST /api/v1/claims/visit`.
For biometrics: pass the `auth_guid` from the pre-visit authorization directly in `POST /api/v1/claims/visit`.


#### Phase 4: Create Claim


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 11a | Send fresh OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes | OTP sent |
| 12a | Create OP claim | eClaims | POST /api/v1/claims/visit | otp,intervention_code,service_type: "OUTPATIENT" | OP claim created;consent_tokenreturned |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 12b | Create OP claim | eClaims | POST /api/v1/claims/visit | auth_guid(from pre-visit authorization),intervention_code,service_type: "OUTPATIENT" | OP claim created;consent_tokenreturned |


#### Phase 5: Add Combined Billing Details


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 13 | Add combined billing details | eClaims | POST /api/v1/claims/lines | consent_token,intervention_code,unit_price,quantity,diagnoses,attachments | Billing saved; amount validated against tariff |


#### Phase 6: Preview & Submit


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 14 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 15 | Submit outpatient claim | eClaims | POST /api/v1/claims/submit | consent_token | Claim submitted to SHA |


---


## Field Flow Between Steps


| Output Field | Step It Comes From | Used In |
| --- | --- | --- |
| access_token | Step 1 | Authorization header - all requests |
| patient.id | Step 2 | patient_idin all subsequent steps |
| intervention_code | Step 5 | Preauth, claim, billing steps |
| token(OTP path) | Step 8a | consent_tokeninPOST /api/v1/preauths |
| token(Biometrics path) | Step 6b | consent_tokeninPOST /api/v1/preauths |
| guid(Biometrics path) | Step 6b | auth_guidin Day-of-Visit claim creation |
| consent_token | From claim creation (Step 12) | Billing, preview, submit steps |


---


## Important Notes


### Elective Preauth - Doctor Approval Required


For elective preauths, the doctor **must** approve before the preauth proceeds. The status flow is:


1. `PENDING_DOCTOR_APPROVAL` - created; awaiting doctor confirmation
2. `ACTIVE` - doctor approved; sent to payer for review
3. `FINALISED` - payer approved; preauth is now valid for claim creation


The `POST /api/v1/claims/doctor-consent` endpoint is available as a fallback to resend the consent request if the doctor reports they did not receive it.


### Difference from Scenario 3 (Inpatient)


Scenario 4 is structurally identical to Scenario 3. The only differences are:


- `service_type: "OUTPATIENT"` instead of `"INPATIENT"` in the claim creation step
- Claim dispatch uses `POST /api/v1/claims/submit` (Step 15) instead of the two-step OTP/biometrics discharge flow


---


## See Also


- [Elective Preauth Guide](https://hie-docs.dha.go.ke/docs/claims/process/preauths/electivePreauths)
- [Scenario 3: SHIF IP Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth) - Same flow, inpatient variant
- [Understanding Preauth Statuses](https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauthStatuses)
- [Outpatient Claim Dispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/outPatientClaimDispatch)

Last modified on
April 30, 2026
Scenario 3: SHIF IP FFS Elective Preauth
Scenario 5: SHIF OP FFS Normal Preauth

---

## Scenario 5: SHIF - Outpatient - Fee for Service - Normal/Special Preauth

> Source: [https://hie-docs.dha.go.ke/docs/scenarios/scenario-5-shif-op-ffs-normal-preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-5-shif-op-ffs-normal-preauth)

# Scenario 5: SHIF - Outpatient - Fee for Service - Normal/Special Preauth


A patient presents for an outpatient service that requires a **non-elective preauthorization** raised within the same visit. The claim is created first, then the preauth is created within the visit context. Billing proceeds once the preauth is approved. The claim is submitted at the end of the visit.


## Intervention Properties


| Property | Value |
| --- | --- |
| Fund | SHIF |
| Access Point | Outpatient (OP) |
| Payment Mechanism | Fee for Service |
| Needs Preauth | Yes (needsPreauth: true) |
| Elective Preauth | No (needsManualPreauthApproval: false) |
| Tariff Type | Overall / KEPH Level |


**How to identify this scenario:** After calling `GET /api/v1/patients/benefits/interventions`, the intervention has `paymentMechanism: "FEE_FOR_SERVICE"`, `needsPreauth: true`, `needsManualPreauthApproval: false`, and `accessPoint: "OP"`.


This scenario is the **outpatient equivalent of Scenario 2** - the preauth flow is the same, but the claim is an outpatient claim and dispatch ends with submit rather than discharge.


---


## Complete Flow

**Participants:**
- 🏥 Point of Care
- 🔐 Auth Service
- 📋 Registries
- ✅ Consent Service
- 🔄 eClaims & Preauths

**Flow:**
1. POST /api/v1/tenants/token
2. access_token
3. GET /api/v1/patients
4. patient.id (patient_id)
5. GET /api/v1/patients/eligibility
6. eligibility status
7. GET /api/v1/patients/sub-benefits
8. sub_benefit_code list
9. GET /api/v1/patients/benefits/interventions
10. interventions (needsPreauth=true, needsManualPreauthApproval=false, accessPoint=OP)
11. GET /api/v1/patients/contacts
12. masked contact list (confirm with patient, get contact id)
13. POST /api/v1/claims/otp (beneficiary_contact_id optional)
14. OTP sent to patient
15. POST /api/v1/claims/visit (otp, service_type: OUTPATIENT)
16. OP claim created
17. POST /api/v1/claims/authorize (biometric fields)
18. authorization (status PENDING) + iframe link
19. authorization transitions to AUTHORIZED
20. POST /api/v1/claims/visit (auth_guid, service_type: OUTPATIENT)
21. OP claim created
22. POST /api/v1/preauths (normal or special form, includes doctor info)
23. preauth created (no doctor approval step for non-elective)
24. GET /api/v1/preauths?consent_token=...
25. preauth status
26. POST /api/v1/claims/lines (line item + diagnoses + attachments)
27. billing saved (validated against tariff)
28. POST /api/v1/claims/preview
29. provider claim preview
30. POST /api/v1/claims/submit
31. outpatient claim submitted

**Notes:**
- General API Flow
- Get Patient Consent (OTP path)
- Create OP Claim with OTP
- OR Get Patient Consent (Biometrics path)
- Patient matches fingerprints via iframe
- Create OP Claim with auth_guid
- Create Preauth (within visit)
- Add Combined Billing Details



---


## Step-by-Step API Calls


### Phase 1: General API Flow


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 1 | Get access token | Auth | POST /api/v1/tenants/token | client_id,client_secret | access_token |
| 2 | Patient search | Registries | GET /api/v1/patients | identification_number,identification_type | id(beneficiary CR ID) - store aspatient_id |
| 3 | SHA eligibility check | eClaims | GET /api/v1/patients/eligibility | identification_number,identification_type | Eligibility status of schemes under SHA |
| 4 | Sub-benefit coverage | eClaims | GET /api/v1/patients/sub-benefits | patient_id | sub_benefit_codelist |
| 5 | Intervention coverage | eClaims | GET /api/v1/patients/benefits/interventions | patient_id,sub_benefit_code | intervention_code,needsPreauth,needsManualPreauthApproval, preauth type flags |


### Phase 2: Patient Consent


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6a | Get patient contacts | Consent | GET /api/v1/patients/contacts | patient_id | Masked contact list withid- confirm contact with patient |
| 7a | Send OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes,beneficiary_contact_id(optional) | OTP sent |
| 8a | Create claim with OTP | eClaims | POST /api/v1/claims/visit | otp,intervention_code,service_type: "OUTPATIENT" | OP claim created |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6b | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields,service_type: "OUTPATIENT" | AuthorizationPENDING;guid; iframe link |
| 7b | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED |
| 8b | Create claim with auth_guid | eClaims | POST /api/v1/claims/visit | auth_guid,intervention_code,service_type: "OUTPATIENT" | OP claim created |


### Phase 3: Create & Await Preauth


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 9 | Create preauth | eClaims | POST /api/v1/preauths | consent_token,intervention_code, preauth form fields (normal or special), doctor details, diagnosis, attachments, requested amount | Preauth created (no doctor approval step) |
| 10 | Poll preauth status | eClaims | GET /api/v1/preauths | consent_token | status- repeat untilFINALISED |


### Phase 4: Add Combined Billing Details


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 11 | Add combined billing details | eClaims | POST /api/v1/claims/lines | consent_token,intervention_code,unit_price,quantity,diagnoses,attachments | Billing saved; amount validated against tariff |


### Phase 5: Preview & Submit


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 12 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 13 | Submit outpatient claim | eClaims | POST /api/v1/claims/submit | consent_token | Claim submitted to SHA |


---


## Field Flow Between Steps


| Output Field | Step It Comes From | Used In |
| --- | --- | --- |
| access_token | Step 1 | Authorization header - all requests |
| patient.id | Step 2 | patient_idin Steps 3-8 |
| sub_benefit_code | Step 4 | Step 5 |
| intervention_code | Step 5 | Steps 8, 9, 11 |
| OTP (OTP path) | Patient receives via SMS | otpfield inPOST /api/v1/claims/visit |
| guid(Biometrics path) | Step 6b authorize | auth_guidinPOST /api/v1/claims/visit |
| consent_token | From claim creation (Step 8) | Steps 9-13 |


---


## Choosing the Right Preauth Form


| Preauth Type | When to Use | Intervention Flag |
| --- | --- | --- |
| Normal Preauth | General services | All special flags =false |
| Surgical Preauth | Surgical procedures | isSurgicalPreauth: true |
| Oncology Preauth | Cancer treatments | isOncologyPreauth: true |
| Renal Preauth | Dialysis and renal care | isRenalPreauth: true |
| Imaging Preauth | Radiology / imaging | isImagingPreauth: true |
| Optical Preauth | Eye care | isOpticalPreauth: true |


---


## Important Notes


### Billing Requires an Approved Preauth


You cannot add billing details until the preauth status is `FINALISED`. Poll `GET /api/v1/preauths?consent_token=...` and wait for approval before calling `POST /api/v1/claims/lines`.


### Doctor Info Required, But No Approval Step for Non-Elective Preauths


When you call `POST /api/v1/preauths` for a non-elective preauth, doctor information is required in the payload. However, the doctor does **not** need to approve the preauth. The system processes it directly without waiting for doctor confirmation.


Doctor approval (which puts the preauth into `PENDING_DOCTOR_APPROVAL` status) is only required for **elective preauths** - see Scenarios 3 and 4.


### Difference from Scenario 2 (Inpatient)


This scenario is structurally identical to Scenario 2. The only differences are:


- `service_type: "OUTPATIENT"` in the claim creation step
- Claim dispatch uses `POST /api/v1/claims/submit` (Step 13) instead of the two-step inpatient discharge


---


## See Also


- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth) - Same flow, inpatient variant
- [Normal Preauth](https://hie-docs.dha.go.ke/docs/claims/process/preauths/normalPreauths)
- [Preauth Doctor Consent](https://hie-docs.dha.go.ke/docs/claims/process/preauthDoctorConsent/preauthDocConsent)
- [Understanding Preauth Statuses](https://hie-docs.dha.go.ke/docs/claims/guides/understandingPreauthStatuses)
- [Outpatient Claim Dispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/outPatientClaimDispatch)

Last modified on
April 30, 2026
Scenario 4: SHIF OP FFS Elective Preauth
Scenario 6: UHC OP Capitation

---

## Scenario 6: UHC - Outpatient - Capitation

> Source: [https://hie-docs.dha.go.ke/docs/scenarios/scenario-6-uhc-op-capitation](https://hie-docs.dha.go.ke/docs/scenarios/scenario-6-uhc-op-capitation)

# Scenario 6: UHC - Outpatient - Capitation


A patient presents at a facility for a UHC-covered outpatient service under a **capitation payment mechanism**. No preauthorization is required. This path also covers **PHC (Primary Healthcare Fund)** outpatient visits at Level 2, Level 3, and select Level 4 (primarily government-owned) facilities, where attachments are not mandatory.


## Intervention Properties


| Property | Value |
| --- | --- |
| Fund | UHC (or PHC for Level 2/3 and select Level 4 facilities) |
| Access Point | Outpatient (OP) |
| Payment Mechanism | Capitation |
| Needs Preauth | N/A |
| Elective Preauth | N/A |
| Tariff Type | N/A |


**How to identify this scenario:** After calling `GET /api/v1/patients/benefits/interventions`, the intervention has `paymentMechanism: "CAPITATION"` and fund = `UHC`.


For PHC claims at Level 2, Level 3, and select Level 4 (primarily government-owned) facilities, the flow is the same but attachments are not required.


---


## Complete Flow

**Participants:**
- 🏥 Point of Care
- 🔐 Auth Service
- 📋 Registries
- ✅ Consent Service
- 🔄 eClaims & Preauths

**Flow:**
1. POST /api/v1/tenants/token
2. access_token
3. GET /api/v1/patients
4. patient.id (patient_id)
5. GET /api/v1/patients/eligibility
6. eligibility status
7. GET /api/v1/patients/sub-benefits
8. sub_benefit_code list
9. GET /api/v1/patients/benefits/interventions
10. interventions (paymentMechanism=CAPITATION)
11. GET /api/v1/patients/contacts
12. masked contact list (confirm with patient, get contact id)
13. POST /api/v1/claims/otp (beneficiary_contact_id optional)
14. OTP sent to patient
15. POST /api/v1/claims/visit (otp, service_type: OUTPATIENT)
16. OP claim created
17. POST /api/v1/claims/authorize (biometric fields)
18. authorization (status PENDING) + iframe link
19. authorization transitions to AUTHORIZED
20. POST /api/v1/claims/visit (auth_guid, service_type: OUTPATIENT)
21. OP claim created
22. POST /api/v1/claims/lines (line item + diagnoses + attachments)
23. billing saved
24. POST /api/v1/claims/preview
25. provider claim preview
26. POST /api/v1/claims/submit
27. outpatient claim submitted ✓

**Notes:**
- General API Flow
- Get Patient Consent (OTP path)
- Create OP Claim with OTP
- OR Get Patient Consent (Biometrics path)
- Patient matches fingerprints via iframe
- Create OP Claim with auth_guid
- Add Combined Billing Details
- Attachments optional for PHC



---


## Step-by-Step API Calls


### Phase 1: General API Flow


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 1 | Get access token | Auth | POST /api/v1/tenants/token | client_id,client_secret | access_token |
| 2 | Patient search | Registries | GET /api/v1/patients | identification_number,identification_type | id(beneficiary CR ID) - store aspatient_id |
| 3 | SHA eligibility check | eClaims | GET /api/v1/patients/eligibility | identification_number,identification_type | Eligibility status of schemes under SHA |
| 4 | Sub-benefit coverage | eClaims | GET /api/v1/patients/sub-benefits | patient_id | sub_benefit_codelist |
| 5 | Intervention coverage | eClaims | GET /api/v1/patients/benefits/interventions | patient_id,sub_benefit_code | intervention_code,paymentMechanism: "CAPITATION"confirmed |


### Phase 2: Patient Consent


**OTP path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6a | Get patient contacts | Consent | GET /api/v1/patients/contacts | patient_id | Masked contact list withid- confirm contact with patient |
| 7a | Send OTP | Consent | POST /api/v1/claims/otp | patient_id,intervention_codes,beneficiary_contact_id(optional) | OTP sent |
| 8a | Create claim with OTP | eClaims | POST /api/v1/claims/visit | otp,intervention_code,service_type: "OUTPATIENT" | OP claim created |


**Biometrics path:**


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 6b | Create authorization | Consent | POST /api/v1/claims/authorize | patient_id, biometric fields,service_type: "OUTPATIENT" | AuthorizationPENDING;guid; iframe link |
| 7b | (Patient matches fingerprints via iframe) | - | - | - | Authorization transitions toAUTHORIZED |
| 8b | Create claim with auth_guid | eClaims | POST /api/v1/claims/visit | auth_guid,intervention_code,service_type: "OUTPATIENT" | OP claim created |


### Phase 3: Add Combined Billing Details


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 9 | Add combined billing details | eClaims | POST /api/v1/claims/lines | consent_token,intervention_code,unit_price,quantity,diagnoses(ICD-11 array),attachments(optional for PHC) | Billing saved |


### Phase 4: Preview & Submit


| # | Action | Service | Endpoint | Key Request Fields | Key Output |
| --- | --- | --- | --- | --- | --- |
| 10 | Preview provider claim | eClaims | POST /api/v1/claims/preview | consent_token | Claim preview |
| 11 | Submit outpatient claim | eClaims | POST /api/v1/claims/submit | consent_token | Claim submitted to SHA |


---


## Field Flow Between Steps


| Output Field | Step It Comes From | Used In |
| --- | --- | --- |
| access_token | Step 1 | Authorization header - all requests |
| patient.id | Step 2 | patient_idin Steps 3-8 |
| sub_benefit_code | Step 4 | Step 5 |
| intervention_code | Step 5 | Steps 8, 9, 10 |
| OTP (OTP path) | Patient receives via SMS | otpfield inPOST /api/v1/claims/visit |
| guid(Biometrics path) | Step 6b authorize | auth_guidinPOST /api/v1/claims/visit |
| consent_token | From claim creation (Step 8) | Steps 9-11 |


---


## Important Notes


### PHC Claims: Attachments Are Optional


For **Primary Healthcare (PHC) claims** at Level 2, Level 3, and select Level 4 (primarily government-owned) facilities, attachments are **not required** when calling `POST /api/v1/claims/lines`. You can submit just the line item and diagnosis.


For standard UHC outpatient claims, include attachments as required by the intervention.


### No Preauthorization Required


Capitation interventions do not require any preauthorization step. After creating the claim, proceed directly to billing.


### Capitation vs Per Diem


Capitation (this scenario) and Per Diem ([Scenario 1](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)) are both non-preauth flows, but they differ in important ways:


|   | Capitation (Scenario 6) | Per Diem (Scenario 1) |
| --- | --- | --- |
| Access point | Outpatient | Inpatient |
| Fund | UHC / PHC | SHIF |
| Line item | Manually submitted | Auto-generated |
| Dispatch | Submit (POST /claims/submit) | Discharge (POST /claims/discharge) |


---


## See Also


- [Start Visit Consent Process](https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitConsentProcessOverview)
- [Outpatient Claim Dispatch](https://hie-docs.dha.go.ke/docs/claims/process/claimDispatch/outPatientClaimDispatch)
- [Billing Process Overview](https://hie-docs.dha.go.ke/docs/claims/process/billing/billingProcessOverview)
- [Understanding Benefits and Intervention Codes](https://hie-docs.dha.go.ke/docs/claims/guides/benefit-intervention-codes)

Last modified on
April 30, 2026
Scenario 5: SHIF OP FFS Normal Preauth

---
