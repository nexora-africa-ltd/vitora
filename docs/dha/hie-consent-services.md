# DHA HIE: Consent Services

> **Source**: [DHA Health Information Exchange](https://hie-docs.dha.go.ke)
> **Scraped**: 2026-05-01 21:01 UTC
> **Purpose**: Offline reference for Vitora HMIS SHA integration

---

## Table of Contents

1. [Introduction to Consent Services](#introduction-to-consent-services)
2. [Start Visit Process Guide: Get Beneficiary Valid Contact](#start-visit-process-guide-get-beneficiary-valid-contact)
3. [Start Visit Process Guide: Send OTP Workflow](#start-visit-process-guide-send-otp-workflow)
4. [Biometrics Consent Process Guide](#biometrics-consent-process-guide)
5. [Consent Services Process Guide: Create OTP Whitelisting Workflow](#consent-services-process-guide-create-otp-whitelisting-workflow)
6. [Consent Service Process Guide: Get OTP Whitelist Request Workflow](#consent-service-process-guide-get-otp-whitelist-request-workflow)

---

## Introduction to Consent Services

> Source: [https://hie-docs.dha.go.ke/docs/consent/getting-started/intro](https://hie-docs.dha.go.ke/docs/consent/getting-started/intro)

# Consent Services Overview


Welcome to the Consent Services API documentation for the Health Information Exchange (HIE) APIs.


The Consent Services API enables you to securely manage beneficiary consent, a critical requirement for accessing and sharing sensitive health information. This API supports robust consent workflows using One-Time Passwords (OTP) and biometrics, ensuring that only authorized actions are performed with explicit beneficiary approval.


By integrating Consent Services, you can verify user identity, obtain and record consent, and comply with regulatory requirements for data privacy and security. The API provides endpoints for sending OTPs, retrieving beneficiary contact details, and managing consent verification for various healthcare operations.


## What You'll Learn


- How to request and verify consent using OTP and biometrics
- Key consent workflows, including sending OTPs and retrieving beneficiary contacts
- Best practices for integrating consent management into your applications


## Explore More


- **Process Docs:** Step-by-step guides for real-world consent scenarios.
- **Guides:** Compliance best practices, troubleshooting, and advanced usage.
- [API Reference:](https://hie-docs.dha.go.ke/consent) Consent endpoints and schemas in the [API Catalog](https://hie-docs.dha.go.ke/catalog).


> Use the sidebar to access process docs, guides, and the API reference for Consent Services.


---

Last modified on
April 30, 2026
Biometrics Consent

---

## Start Visit Process Guide: Get Beneficiary Valid Contact

> Source: [https://hie-docs.dha.go.ke/docs/consent/process/getBeneficiaryValidContact](https://hie-docs.dha.go.ke/docs/consent/process/getBeneficiaryValidContact)

# Start Visit Process Guide: Get Beneficiary Valid Contact


## Start Visit Process Guide: Get Beneficiary Valid Contact Workflow


### 1. Overview: Retrieve and Validate the Beneficiaryʼs Contact Details


This guide focuses on the Get Beneficiary's Valid Contact Workflow, a foundational step in our broader Start Visit Process. This workflow's primary role is to retrieve and validate the crucial contact information associated with a patient's beneficiary. It confirms if the beneficiary is an active SHA member and possesses a valid phone number, which is an essential prerequisite for sending consent One-Time Passwords (OTPs). For cases involving deceased beneficiaries, it prioritises displaying next-of-kin contacts, and for minors, it ensures the provision of valid parent or guardian contact details.


#### 1.1. What This Workflow Does


The Get Beneficiary's Valid Contact Workflow's primary function is to securely obtain and validate the accurate contact details of a specific beneficiary. It achieves this by:


- **Identifying the Beneficiary**: Using the provided beneficiary_cr_id (Client Registry ID) linked to the patient seeking services, it can identify the beneficiary from data from the Client Registry (CR)
- **Determining Relevant Contacts**: For patients who are minors or dependents of a deceased beneficiary, it identifies and prioritises the contact information of the designated parent/guardian or next of kin, respectively.
- **Retrieving Comprehensive Details**: Accessing all registered information for that beneficiary, including their active membership status with SHA.


#### 1.2. Why This Workflow Is Critical


Getting the beneficiary's contact information precisely correct from the start is important for initiating a valid and compliant patient visit claim. This workflow is critical because it:


- **Enables Secure Consent**: Ensures that consent OTPs, which are vital for verifying a patient's presence and agreement to services, are sent to the correct and authorised individual (the beneficiary, parent/guardian, or next of kin). This prevents unauthorised consent and potential fraud.
- **Confirms Valid Membership**: Verifies that the beneficiary is a valid, active member registered under SHA. This is a foundational check for all subsequent financial and service-related processes.
- **Facilitates Crucial Communication**: Provides reliable contact points for any necessary follow-up or emergency communication related to the patient's visit.
- **Supports Compliant Claiming**: By confirming the accuracy of beneficiary contacts, it strengthens the position for healthcare facilities to make legitimate claims for services provided to SHA.


This workflow ensures that all subsequent steps of the Start Visit Process, especially consent and communication, are built upon accurate and verified information.


## 2. Workflow Details: Get Beneficiary Valid Contact


### 2.1. Workflow Description


When eligibility checks are completed and a patient is ready to receive a medical intervention, triggering the start of a visit, here's the internal process that unfolds for contact retrieval:


1. Input Received: The system receives the patient's client_registry_id, which is either the beneficiary's beneficiary_cr_id or, if the patient is a dependent, it gets the beneficiary_cr_id, which is that of the primary contributor.
2. Beneficiary Data Fetching: Using the provided beneficiary_cr_id, it securely fetches the comprehensive profile and all registered contact details of that specific beneficiary from the central client registry.
3. Phone Number Validation: From the retrieved contact details, it checks for the presence of at least one valid and active phone number associated with the beneficiary. This number is flagged for OTP delivery.
4. Output: The validated contact details of the beneficiary are provided.


### 2.2. Key Validations: Our System's Essential Checks


There are some essential checks our system performs behind the scenes to ensure a successful and accurate execution of this workflow. Understanding these helps you provide the correct information from your end, preventing errors.


**Valid Beneficiary Client Registry ID:**


- The beneficiary_cr_id provided must be a valid, existing, and correctly formatted identifier recognised by the Client Registry.
- This ID is the absolute foundation for accessing any beneficiary information. It serves as the single source of truth for accurate and up-to-date client data.
- Without a valid CR ID, the system cannot uniquely identify the beneficiary, making it impossible to retrieve their details or check their SHA membership.


**Presence of at Least One Valid Phone Number:**


- After fetching beneficiary details, the system verifies that at least one functional phone number is registered and available for communication.
- A valid phone number is critical for the subsequent Send OTP Workflow, which relies on sending an OTP to this number for explicit patient/beneficiary consent. Without it, the consent process cannot be completed, preventing the start of a visit.


**Correct Contact Identified for Minors/Deceased Dependents:**


- For patients identified as minors or dependents of deceased beneficiaries, the system must accurately identify and provide the contact information of their registered parent/guardian or next of kin, respectively.
- This ensures that consent for the visit is sought from the appropriate and authorised individual, which makes it compliant for a valid healthcare encounter.


### 2.3. Workflow Data Dictionary


This table helps you understand the key pieces of information this workflow uses, whether they're required, and the conceptual format our system expects.


| Field Name (Conceptual) | Description | Data Type (Conceptual) | Required | Purpose / What it Means (to the Business) |
| --- | --- | --- | --- | --- |
| Beneficiary Client Registry ID | The unique identifier of the beneficiary associated with the patient. This could be the patient's own CR ID if they are the primary beneficiary, or the CR ID of their parent/guardian. | String | Yes | This is the identity key that tells our system which beneficiary we need to retrieve details for. It's the primary input to pull all their registered information, including contact details and membership status. |


### 2.4. Expected Outcomes from this Workflow


When you query this workflow, here's what you can expect in return:


**Success: Beneficiary Found & Valid Contact Retrieved:**


- One successfully identifies the beneficiary, retrieves their contact details (including a valid phone number), and identifies relevant next-of-kin/parent/guardian contacts if applicable. This sets the stage for the next step in the Start Visit Process.


**Failure: Beneficiary Not Found:**


- The provided beneficiary_cr_id does not correspond to any valid beneficiary record in the system. The visit cannot be initiated under this beneficiary. The user may need to re-verify the identification details.


**Failure: No Valid Phone Number Found:**


- The beneficiary record is found, but no valid or active phone number is registered for them (or their next of kin/guardian for minors/deceased dependents). The OTP consent workflow, therefore, cannot proceed.


## 3. Critical Success Factors for Get Beneficiary Valid Contact Integration


For your integration with the Get Beneficiary Valid Contact Workflow to be successful, keep these key points firmly in mind:


- **Provide Valid Client Registry ID**: Always ensure you provide a correct and validated beneficiary_cr_id. This is the single most critical input; any error here will halt the process.
- **Plan for Missing Contacts**: Design your system to handle scenarios where a beneficiary might not have a registered phone number.


---


## 4. Related Resources


- [Send OTP Guide](https://hie-docs.dha.go.ke/docs/consent/process/sendOTP)
- [Scenario 1: SHIF IP Per Diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)
- [Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Consent API Reference](https://hie-docs.dha.go.ke/consent)

Last modified on
April 30, 2026
Biometrics Consent
Send OTP

---

## Start Visit Process Guide: Send OTP Workflow

> Source: [https://hie-docs.dha.go.ke/docs/consent/process/sendOTP](https://hie-docs.dha.go.ke/docs/consent/process/sendOTP)

# Start Visit Process Guide: Send OTP Workflow


## Start Visit Process Guide: Send OTP Workflow


### 1. Overview: Securing Patient Consent


This guide details the Send OTP Workflow, a critical step within the broader Start Visit Process. This workflow manages the entire patient consent mechanism by using One-Time Passwords (OTPs) to gain explicit authorisation for a patient's visit and related health record access under the Social Health Authority (SHA).


#### 1.1. Why This Workflow Is Critical


This workflow is vital because it represents the point at which patient engagement and explicit consent must be obtained before a visit can be formally initiated. It's critical as it helps in:


- **Ensuring Patient Consent**: It is the primary mechanism for obtaining the patient's direct and verifiable approval.
- **Enabling Formal Visit Initiation**: A successful OTP process is a non-negotiable prerequisite for the final Start Visit Workflow.
- **Preventing Unauthorised Access**: By requiring OTP verification, it adds a layer of security, ensuring only the authorised patient consents to the visit and any associated access to their health records.


In short, this workflow ensures every patient encounter respects privacy by obtaining explicit consent, a fundamental requirement for valid healthcare service delivery under SHA.


## 2. Workflow Details: Send OTP


This part of the workflow manages sending the One-Time Password (OTP) to the patient's registered phone number to initiate the consent process.


### 2.1. What This Workflow Does


The Send OTP Workflow prepares and sends an OTP to the beneficiaryʼs phone number. It handles:


- **Receiving Patient Identifiers**: This process involves obtaining the patient's unique Client Registry ID and, optionally, their contact preference.
- **Preparing Consent Request**: Using these identifiers, the system internally gathers all necessary patient information (like phone number), facility details, and the specific permissions required for this consent service.
- **Requesting OTP Dispatch**: The system sends this prepared request to generate and send an OTP.
- **Obtaining Consent Reference**: If successful, it receives a unique reference ID for this consent request, essential for later verification.
- **Providing Status**: It communicates whether the OTP was successfully requested and sent.


### 2.2. Step-by-Step System Behavior


**Pre-step: Retrieve Patient Contacts**


Before sending an OTP, call `GET /api/v1/patients/contacts` to retrieve the patient's registered contacts. The response returns a list of contacts with masked values (for example, `"+254714***898"`) and their IDs. Show the patient the masked number to confirm which contact to use, then pass the `id` from that contacts record as `beneficiary_contact_id` in step 1 below. If `beneficiary_contact_id` is not provided, the system sends the OTP to the patient's default contact.


1. Input Reception: The system receives the patient's beneficiary_cr_id and, optionally, beneficiary_contact_id.
2. Internal Patient Data Lookup: Using these IDs, the system looks up the patient's registered phone number, the facility's identifier, and the required consent permissions (e.g. access to the patient's record).
3. Request OTP: The system securely sends this prepared patient, facility, and permission information to the consent service.
4. Processing & Dispatch of OTP: The system generates a unique OTP and sends it via SMS to the patient's phone.
5. Receive Response: The system gives a response indicating if the OTP was sent and providing a unique consent_request_id.
6. Outcome Processing: The system stores the consent_request_id for the next step.


### 2.4. Workflow Data Dictionary (Conceptual)


This table outlines the key information used and produced by this workflow:


| Field Name (Conceptual) | Description | Required | Purpose |
| --- | --- | --- | --- |
| beneficiary_cr_id | The patient's unique Client Registry ID. | Yes | Internal identity is key to finding all patient and contact details for the SHA consent request. |
| beneficiary_contact_id | An optional identifier for a specific patient contact. Obtain this by callingGET /api/v1/patients/contacts, selecting the desired contact from the masked list, and using itsid. | No | Ensures OTP is sent to a specific phone number. If not provided, the system sends to the patient's default contact. |


### 2.5. Expected Outcomes


**Success: OTP Successfully Dispatched**


- The system successfully requested, and SHA confirmed the OTP was sent to the patient. A consent_request_id is provided. The workflow can proceed to Start Visit Workflow.


**Failure: Invalid Patient/Contact Data**


- The provided patient ID or contact ID was invalid or could not be found internally. OTP dispatch failed. The user needs to correct the input before re-attempting.


## 3. Critical Success Factors for Consent OTP Integration


For your integration with the Consent OTP Workflows to be successful, keep these key points firmly in mind:


- **Ensure Accurate Patient Identification**: The patient's Client Registry ID must be accurate and valid. This allows the system to correctly retrieve all necessary patient and contact details for OTP dispatch by SHA.
- **Implement OTP Input Interface**: Design your user interface to prompt the patient for the OTP and make it easy to enter. Include options for re-sending OTPs if the initial one expires or isn't received, while respecting any rate limits.
- **Design for Comprehensive Error Handling**: Be prepared to handle all documented failure scenarios from both the Send and Verify OTP workflows (e.g., invalid input, expired OTPs, network issues). Clear, user-friendly error messages should guide staff and patients on corrective actions.

Last modified on
April 30, 2026
Get Beneficiary Valid Contact
OTP Whitelist Request

---

## Biometrics Consent Process Guide

> Source: [https://hie-docs.dha.go.ke/docs/consent/process/biometricsConsent](https://hie-docs.dha.go.ke/docs/consent/process/biometricsConsent)

# Biometrics Consent Process Guide


## 1. Overview: Biometrics as the Primary Consent Method


Biometrics is the **primary method** for verifying patient identity and obtaining consent before starting a visit, creating a preauth, or discharging a patient. Most facilities are required to use biometrics - the patient's fingerprint is captured and matched against their SHA-registered prints to provide consent.


**OTP is a fallback method** for patients who cannot use biometrics. To use OTP, a patient must first be whitelisted through a formal request process reviewed by SHA. See:


- [OTP Whitelist Request](https://hie-docs.dha.go.ke/docs/consent/process/createOTPWhitelistRequest) - how to request OTP access for a patient
- [Get OTP Whitelist Request](https://hie-docs.dha.go.ke/docs/consent/process/getOTPWhitelistRequest) - how to check whitelist status


The biometrics mechanism has two components that work together:


1. **Hardware Server** - A Windows application installed on the workstation that communicates directly with the biometric device and exposes a local API at `http://localhost:18065`.
2. **Biometrics Authorization API** - The `POST /api/v1/claims/authorize` endpoint creates an authorization and returns an iframe link for the capture and matching process.


---


## 2. Hardware Server Setup


The Hardware Server must be installed and running on the workstation where the biometric device is connected before any biometrics capture can take place.


### 2.1. What the Hardware Server Does


The Hardware Server is a local Windows service that bridges web-based systems like SHA with biometric hardware - fingerprint scanners and NFC card readers - over HTTP and WebSocket. It:


- Discovers connected fingerprint scanners (Digital Persona, SecuGen, BioMini, ZKTeco) and NFC readers (ACS ACR1251/1252)
- Exposes them through a REST API
- Pushes real-time device and reader events over WebSocket (`/ws/devices`)
- Handles authentication, encryption of biometric data, and syncs devices and credentials with the remote identity backend


### 2.2. Installation


1. Download the Hardware Server `.exe` installer (provided separately by SHA).
2. Install it on the Windows workstation that has the biometric device connected.
3. Launch the application - it starts a background service on `localhost:18065` that continues running even if the application window is closed.
4. **Login** using your **biometrics agent** credentials.


### Biometrics Agent Account


A biometrics agent is a designated user created by SHA for the facility. During setup, SHA captures the agent's National ID number. This National ID is a required field when calling `POST /api/v1/claims/authorize` with biometrics fields.


### 2.3. Verify the Service is Running


Call the Hardware Server status endpoint:


```text
GET http://localhost:18065/status
```


Example response:


```json
{
  "workstationID": "WS-12345",
  "devices": [
    {
      "deviceId": "DEV-001",
      "status": "connected",
      "type": "fingerprint"
    }
  ]
}
```


Key fields:


- `workstationID` - Required field in `POST /api/v1/claims/authorize`
- `devices` - List of detected biometric devices; if empty or all disconnected, check the USB connection


### 2.4. Connecting the Device


- Plug the biometric fingerprint device into the workstation via USB.
- Recheck `/status` - the device should now appear in the `devices` array with a `connected` status.
- Run a **test capture** from the Hardware Server application interface to confirm the device can read fingerprints before going live.


### 2.5. Hardware Server Troubleshooting


| Problem | Resolution |
| --- | --- |
| localhost:18065/statusis unreachable | The background service is not running. Open the Hardware Server application and click "Restart Service", then retry/status. |
| Device not indeviceslist | Check USB connection. Plug in device while app is running and retry/status. |
| Test capture fails | Verify device is correctly connected; restart service and retry. |


---


## 3. Biometrics Authorization Flow


Once the Hardware Server is set up and running, follow this flow to obtain biometrics consent.


### 3.1. Step 1 - Create an Authorization


Call `POST /api/v1/claims/authorize` with biometrics-specific fields:


- `workstationID` (from `GET http://localhost:18065/status`)
- Biometrics agent National ID
- Patient beneficiary CR ID
- Relevant claim and service identifiers


The system creates an authorization in `PENDING` status and returns an **iframe link** in the response.


### 3.2. Step 2 - Render the iframe


Embed the iframe URL in your application's UI. The iframe:


- Detects whether a biometric device is connected (via Hardware Server)
- Shows the patient's available registered fingerprints
- Displays a "Start" button to begin the capture process
- **Expires in 10 minutes** - the fingerprint capture must complete within this window


### iframe Expiry


If the iframe expires before matching completes, the authorization remains stuck in `PENDING`. Cancel it using the cancel authorization endpoint and create a new one.


### 3.3. Step 3 - Fingerprint Capture and Matching


1. The operator or patient clicks the **Start** button on the iframe.
2. The biometric device lights up and is ready to capture.
3. The patient places their finger on the device.
4. The iframe captures the print and attempts to match it against the patient's registered prints.
5. The iframe displays real-time feedback on the capture and matching result.


**On success:** Authorization transitions from `PENDING` to `AUTHORIZED` (standard visit) or `AUTHORIZED_PENDING_VISIT` (elective preauth pre-visit).


**On failure:** The iframe shows the rejection and prompts a retry. Up to **3 retry attempts** are allowed. If all 3 fail, the authorization transitions to `REJECTED` status. At this point you must create a new authorization and begin again from Step 1.


### 3.4. Step 4 - Use the Authorization


Once the authorization is in `AUTHORIZED` or `AUTHORIZED_PENDING_VISIT` status, it can be used:


| Use case | Field to include |
| --- | --- |
| Create a standard visit (POST /api/v1/claims/visit) | auth_guid(the GUID from the authorization object) instead ofotp |
| Create an elective preauth (POST /api/v1/preauths) | tokenfrom the authorization object asconsent_token |
| Discharge a patient | auth_guidinstead ofotpin the discharge endpoint |


---


## 4. Authorization Status Reference


| Status | Meaning |
| --- | --- |
| PENDING | Authorization created; waiting for successful fingerprint match |
| AUTHORIZED | Fingerprint matched; ready for standard visit or discharge |
| AUTHORIZED_PENDING_VISIT | Fingerprint matched (elective); waiting for visit creation after preauth approval |
| REJECTED | All 3 retry attempts failed; create a new authorization to try again |


---


## 5. Troubleshooting Authorization Issues


### iframe Expired Before Matching


The iframe is only valid for 10 minutes. If it expires:


1. Cancel the stuck `PENDING` authorization using the cancel authorization endpoint.
2. Create a new authorization via `POST /api/v1/claims/authorize`.
3. Render the new iframe and retry the matching process.


### Authorization Stuck at PENDING


If the authorization remains in `PENDING` after a seemingly successful match:


1. Check the current authorization status via the authorization details endpoint.
2. If still `PENDING`, cancel it using the cancel authorization endpoint.
3. Create a new authorization and retry.
4. If issues persist, verify Hardware Server is running (`GET http://localhost:18065/status`) and restart the service if needed.


### All 3 Retries Failed (REJECTED status)


After 3 failed fingerprint matching attempts, the authorization transitions to `REJECTED` and is no longer usable. Create a new authorization and retry from Step 1.


If fingerprint matching repeatedly fails for a patient, consider submitting an OTP Whitelist Request for the patient. See [OTP Whitelist Request](https://hie-docs.dha.go.ke/docs/consent/process/createOTPWhitelistRequest).


### Device Not Detected by iframe


- Verify Hardware Server is running (check `GET http://localhost:18065/status`).
- Confirm the device appears in the `devices` list with `connected` status.
- Run a test capture from the Hardware Server application.
- Restart the service if needed.


---


## 6. Related Resources


- [OTP Whitelist Request](https://hie-docs.dha.go.ke/docs/consent/process/createOTPWhitelistRequest)
- [Get OTP Whitelist Request](https://hie-docs.dha.go.ke/docs/consent/process/getOTPWhitelistRequest)
- [Biometrics Scenarios - Scenario 1: SHIF IP Per Diem](https://hie-docs.dha.go.ke/docs/scenarios/scenario-1-shif-ip-per-diem)
- [Biometrics Scenarios - Scenario 2: SHIF IP FFS Normal Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-2-shif-ip-ffs-normal-preauth)
- [Biometrics Scenarios - Scenario 3: SHIF IP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-3-shif-ip-ffs-elective-preauth)
- [Biometrics Scenarios - Scenario 4: SHIF OP FFS Elective Preauth](https://hie-docs.dha.go.ke/docs/scenarios/scenario-4-shif-op-ffs-elective-preauth)
- [Start Visit Workflow Guide](https://hie-docs.dha.go.ke/docs/claims/process/startVisitConsent/startVisitWorkflow)
- [Elective Preauth Guide](https://hie-docs.dha.go.ke/docs/claims/process/preauths/electivePreauths)
- [Consent Services API Reference](https://hie-docs.dha.go.ke/consent)

Last modified on
April 30, 2026
Introduction to Consent
Get Beneficiary Valid Contact

---

## Consent Services Process Guide: Create OTP Whitelisting Workflow

> Source: [https://hie-docs.dha.go.ke/docs/consent/process/createOTPWhitelistRequest](https://hie-docs.dha.go.ke/docs/consent/process/createOTPWhitelistRequest)

# Consent Services Process Guide: Create OTP Whitelisting Workflow


## 1. Overview: Enabling the Use of OTP in Specific Scenarios


This guide details the **OTP Whitelisting** workflow, which is a **crucial stage** in our broader **Consent Services Process**. It serves as an alternative method to ensure that consent is still provided for patients who cannot use biometrics, the default option for consent with specific healthcare providers. The primary role of this workflow is to **ensure that One-Time Passwords (OTPs) are only utilized in approved scenarios, thereby enhancing security and compliance**.


To use OTP as a consent method, a patient must first be whitelisted through this workflow. This process assists in validating and approving specific situations for OTP usage before proceeding to the Send OTP Workflow.


### 1.1. What This Workflow Does


The principal function of the **OTP Whitelisting** workflow is **to validate and approve specific use cases for OTP usage**. It does this by **assessing the context and reasons for each OTP request against a predefined set of criteria**.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Getting **OTP usage** right from the beginning is vital for **maintaining security and compliance**. Without a precise **whitelisting** process, several serious issues can arise:


- **Unauthorized Access:** Using OTPs in unapproved scenarios may lead to unauthorized access to sensitive patient information.
- **Compliance Risks:** Failing to adhere to consent requirements can result in non-compliance with healthcare regulations.
- **Fraud Risks:** Misuse of OTPs may open avenues for fraudulent activities, compromising the security of patient data.


In summary, this workflow is the **foundation of secure OTP usage**. It ensures that every subsequent step of the **Consent Services Process** is built on the principle of **approved and validated OTP scenarios**.


---


## 2. Workflow Details: OTP Whitelisting


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request for OTP Whitelisting is made (after failed attempts to use biometrics), here's how the internal process unfolds:


1. **Failed Biometric Attempts:** The system receives the patient's request for OTP usage after unsuccessful biometric consent attempts. Biometrics are enforced for all hospital levels, except for levels 2 and 3.
2. **Make an OTP Whitelist Request:** The user submits a request to whitelist the patient for OTP usage by providing necessary details such as the reason for using OTP and patient identifiers.
3. **Confirm if the Patient is Already Whitelisted:** The system checks if the patient is already whitelisted for OTP usage. If they are, the system informs the provider that the patient is already permitted to use OTPs.
4. **Create OTP Whitelist Request:** If the patient is not already whitelisted, the system creates a new OTP Whitelist Request with the provided details, such as beneficiary CR ID, reason for whitelisting, any attachments, and the number of failed biometric attempts.
5. **Submit OTP Whitelist Request:** The system submits the OTP Whitelist Request to authorized personnel for approval, triggering any necessary workflows or notifications.
6. **Review of the OTP Whitelist Request:** Social Health Authority officers log into an admin panel to review the OTP Whitelist Request, ensuring all information is accurate and complete. They assess the validity of the reason provided for OTP usage and all attachments before making a decision.
7. **Receive Approval Decision:** The system waits for a decision on the OTP Whitelist Request. This may involve manual review by authorized personnel or an automated review. If approved, the system updates the patient's status to allow OTP usage. If denied, the system notifies the requester with the reasons for denial.


### 2.2. Key Validations: Essential Checks by Our System


Several essential checks are performed by our system to ensure successful and accurate OTP Whitelisting. Understanding these checks helps you provide the correct information, preventing errors.


- **Valid Beneficiary CR ID:**

What it Means: The system verifies that the provided beneficiary CR ID is valid and exists in the Client Registry.
Why It's Important: This ensures that the OTP Whitelisting request is associated with a legitimate patient record, preventing unauthorized access.
- **Failed Biometric Attempts:**

What it Means: The system requires evidence of failed biometric attempts and checks the number recorded for the patient.
Why It's Important: This helps establish a pattern of failed attempts, justifying the need for OTP Whitelisting as an alternative consent method.
- **Patient OTP Whitelist Status:**

What it Means: The system checks if the patient is already whitelisted for OTP usage. If the patient is already whitelisted, no new request can be made.
Why It's Important: This prevents redundant requests and ensures the workflow remains efficient.
- **Pending OTP whitelist requests:**

What it means: The system checks if there are any pending OTP whitelist requests for the patient. If there are pending requests, new requests cannot be made until the existing ones are resolved.
Why it's important: This helps to avoid processing new requests while existing ones are still under review.


### 2.3. Workflow Data Dictionary: Key Information Utilized


This table outlines the essential pieces of information involved in this workflow, indicating which fields are required and the expected data format.


| Field Name (Conceptual) | Description | Data Type (Conceptual) | Required | Purpose / Significance to the Business |
| --- | --- | --- | --- | --- |
| reason_type | Specifies the reason for requesting the whitelist. Allowed values include:OLD,AMPUTEE,MEDICAL_CONDITION,MENTALLY_UNSTABLE,ONCOLOGY_TREATMENT,DIALYSIS_TREATMENT,CONSTRUCTION_WORKER,OTHER,EXPIRED,BIOMETRIC_FAILURE,CHILD_BELOW_7_YEARS,PRIVACY_CONCERNS,TECHNICAL_ISSUES. | String | Yes | Identifies the main reason for the OTP whitelisting request, serving to categorize and justify the request for evaluation and compliance purposes. |
| reason | A detailed explanation for the whitelist request. | String | Yes | Offers additional context to support the selected reason_type for the whitelisting request. |
| biometric_attempts | The number of unsuccessful attempts using biometrics. | Integer | Yes | Indicates the number of failed biometric attempts, validating the necessity for OTP as an alternative method. |
| beneficiary_cr_id | A unique identifier for the beneficiary within the coverage system. | String | Yes | Connects the OTP whitelist request to a specific patient in the Client Registry. |
| attachments | A list of metadata for attachments. Each attachment description includes the title, document type, and the related file field for upload. | Array of Objects | Yes | Supplies supporting documents for the whitelist request, such as medical reports or other evidence. |
| file_field_name | The actual file to be uploaded as part of the whitelist request. Rename this field to match thefile_field_namespecified in the attachments array (e.g.,attachments_file_blob). | String (binary) | No | Enables the upload of the actual file(s) referenced in the attachments metadata. |


### 2.4. Expected Outcomes from the Workflow


When querying this workflow, you can anticipate the following outcomes:


- **Success:** OTP whitelist request successfully created for the patient.
- **Failure:** Pending OTP Whitelist request detected, preventing the creation of a new OTP request.
- **Failure:** The patient is already whitelisted for OTP, hence no new OTP whitelist request will be created.


---


## Approval and Rejection Logic


### Automatic Review


Requests with certain `reason_type` values are automatically reviewed by a scheduled job (every 10 minutes). Possible statuses: **CLOSED**, **REJECTED**, or **APPROVED**.


**Eligible for Automatic Review:**
OLD, AMPUTEE, MEDICAL_CONDITION, MENTALLY_UNSTABLE, ONCOLOGY_TREATMENT, DIALYSIS_TREATMENT, CONSTRUCTION_WORKER


**Automatic Status Checks:**


- **CLOSED:** Already whitelisted and period is valid.
- **APPROVED:**

AMPUTEE with attachments
OLD, age ≥ 60, and failed biometric attempt in last 24h
DIALYSIS_TREATMENT, failed biometric attempt in last 24h, previous dialysis intervention
ONCOLOGY_TREATMENT, failed biometric attempt in last 24h, previous oncology intervention
MEDICAL_CONDITION or MENTALLY_UNSTABLE, failed biometric attempt in last 24h, with attachments
- **REJECTED:**

AMPUTEE without attachments
OLD and age < 60
DIALYSIS without previous dialysis intervention
ONCOLOGY without previous oncology intervention
MEDICAL_CONDITION or MENTALLY_UNSTABLE without attachments


### Manual Review


Requests with these types require manual review:
`OTHER`, `EXPIRED`, `BIOMETRIC_FAILURE`, `CHILD_BELOW_7_YEARS`, `PRIVACY_CONCERNS`, `TECHNICAL_ISSUES`.


---


## 3. Critical Success Factors for OTP Whitelist Workflow Integration


To ensure successful integration with the **OTP Whitelist** workflow, consider the following key points:


- **Provide the correct beneficiary CR ID:** Accurate submission of the `beneficiary_cr_id` is crucial for retrieving precise patient details, including their OTP whitelist status.
- **Set up a callback URL:** Implement a callback URL to receive notifications regarding the status of the OTP whitelist request.
- **Provide a valid reason type:** Familiarize yourself with the available reason types in the system (e.g., `OLD`, `AMPUTEE`, `MEDICAL_CONDITION`) to ensure correctness.
- **Plan for potential failure scenarios:** Implement error handling for conditions like patient not being found, existing pending requests, or technical issues.

Last modified on
April 30, 2026
Send OTP
Get OTP Whitelist Request

---

## Consent Service Process Guide: Get OTP Whitelist Request Workflow

> Source: [https://hie-docs.dha.go.ke/docs/consent/process/getOTPWhitelistRequest](https://hie-docs.dha.go.ke/docs/consent/process/getOTPWhitelistRequest)

# Consent Service Process Guide: Get OTP Whitelist Request Workflow


---


## 1. Overview: Check information of a created OTP Whitelist Request


This guide focuses on the **Get OTP Whitelist Request** workflow, a key part of the broader **Consent Services Process**. This workflow is important as it provides a means of retrieving the details of a specific OTP Whitelist Request using unique identifiers or patient information.


### 1.1. What This Workflow Does


The **Get OTP Whitelist Request** workflow retrieves the details of a specific OTP Whitelist Request. It does this by querying the system using either a unique `GUID` or a combination of beneficiary and facility identifiers.


### 1.2. Why This Workflow Is Critical (The "Why It Matters")


Retrieving OTP Whitelist Request information is crucial for:


- Checking the status of any pending Whitelist reauests for a particular beneficiary in a specific healthcare facility
- Supporting audit and review processes for consent workflows.


Without accurate retrieval, there is a risk of:


- Complicating follow up and review process of various OTP whitelist requests****


---


## 2. Workflow Details: Get OTP Whitelist Request


### 2.1. Workflow Description: Step-by-Step System Behavior


When a request to retrieve an OTP Whitelist Request is made, the following steps occur:


1. **Receive Query:** The system receives a query with either a GUID or a combination of beneficiary_cr_id, facility_id, and facility_id_type.
2. **Validate Input:** The system checks that the required parameters are present and correctly formatted.
3. **Search for Request:** The system searches for the OTP Whitelist Request record matching the provided identifiers.
4. **Return Results:** If found, the system returns the details of the OTP Whitelist Request, including status, reason, beneficiary, facility, and attachments. If not found, an error is returned.


### 2.2. Key Validations: Our System's Essential Checks


- **GUID Provided:**

What it means: The system checks if a valid GUID is provided in the query.
Why it's important: Ensures the request is specific and can be uniquely identified.
- **Beneficiary and Facility Identifiers:**

What it means: If GUID is not provided, the system checks for beneficiary_cr_id, facility_id, and facility_id_type.
Why it's important: Ensures the system can locate the correct request using alternate identifiers.
- **Parameter Format:**

What it means: All parameters must be correctly formatted (e.g., string type).
Why it's important: Prevents errors and ensures reliable query processing.


### 2.3. Workflow Data Dictionary (Conceptual): What Information We Work With


| Field Name (Conceptual) | Description | Data Type (Conceptual) | Required | Purpose / What it Means (to the Business) |
| --- | --- | --- | --- | --- |
| guid | Unique GUID of the OTP whitelist request. | String | Yes | Used to uniquely identify and retrieve a specific OTP whitelist request. |
| beneficiary_cr_id | Beneficiary CR ID. Required together with facility_id and facility_id_type. | String | No | Used to identify the patient associated with the OTP whitelist request. |
| facility_id | Facility identifier (e.g., FR Code). Required if beneficiary_cr_id is used. | String | No | Identifies the facility where the request was made. |
| facility_id_type | Type of facility identifier (e.g., fr-code). Required if beneficiary_cr_id is used. | String | No | Specifies the type of facility identifier for correct matching. |


### 2.4. Expected Outcomes from this Workflow


When you query this workflow, you can expect:


- **Success:**

The system returns the OTP whitelist request record, including details such as GUID, beneficiary, facility, reason, status, attachments, and timestamps.
- **Failure:**

The system returns an error if the GUID or required parameters are missing or invalid.
The system returns an error if no matching OTP whitelist request is found.


---


## 4. Critical Success Factors for Integration


- Provide precise input parameters (GUID or correct combination of beneficiary and facility identifiers).
- Understand the required identifier types and formats.
- Handle errors and missing data gracefully in your integration.

Last modified on
April 30, 2026
OTP Whitelist Request

---
