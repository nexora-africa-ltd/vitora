# DHA HIE: Registries

> **Source**: [DHA Health Information Exchange](https://hie-docs.dha.go.ke)
> **Scraped**: 2026-05-01 21:01 UTC
> **Purpose**: Offline reference for Vitora HMIS SHA integration

---

## Table of Contents

1. [Introduction to HIE Registries](#introduction-to-hie-registries)
2. [Eligibility Process Guide: Patient Search Workflow](#eligibility-process-guide-patient-search-workflow)
3. [Facility Search Workflow Guide](#facility-search-workflow-guide)
4. [Professional Search Workflow Guide](#professional-search-workflow-guide)

---

## Introduction to HIE Registries

> Source: [https://hie-docs.dha.go.ke/docs/registries/gettingStarted/introduction](https://hie-docs.dha.go.ke/docs/registries/gettingStarted/introduction)

# HIE Registries Overview


Welcome to the HIE Registries API documentation for the Health Information Exchange (HIE) system.


The HIE Registries APIs provide secure, standardized access to core health information repositories, including the Client Registry (patients), Health Worker Registry (professionals), and Facility Registry (healthcare facilities). These registries are foundational for interoperability, enabling accurate identification, validation, and data exchange across the healthcare ecosystem.


By integrating with the Registries APIs, you can search, validate, and retrieve up-to-date information about patients, healthcare professionals, and facilities—ensuring data integrity, compliance, and seamless care coordination.


## What You'll Learn


- How to search and retrieve records from the Client, Health Worker, and Facility Registries
- Key workflows for patient, professional, and facility validation
- Best practices for integrating registry lookups into your applications


## Explore More


- **Process Docs:** Step-by-step guides for real-world registry scenarios.
- **Guides:** Understanding registry structure, data standards, and advanced usage.
- [API Reference:](https://hie-docs.dha.go.ke/registries) Registry endpoints and schemas in the [API Catalog](https://hie-docs.dha.go.ke/catalog).


> Use the sidebar to access process docs, guides, and the API reference for HIE Registries.


---

Last modified on
April 30, 2026
Patient Search

---

## Eligibility Process Guide: Patient Search Workflow

> Source: [https://hie-docs.dha.go.ke/docs/registries/process/patientSearch](https://hie-docs.dha.go.ke/docs/registries/process/patientSearch)

# Eligibility Process Guide: Patient Search Workflow


## Eligibility Process Guide: Patient Search Workflow


### 1. Overview


This guide focuses on the Patient Search workflow, the essential first step in the broader Eligibility Process. Patient Search focuses on helping one find the right patient and getting their accurate details. Itʼs how we accurately identify a patient making a health facility visit before determining the services for which they're qualified.


#### 1.1. What This Workflow Does


The Patient Search workflow's primary function is to locate a patient's official record using their identification details. When you provide an ID type (like a National ID) and the corresponding ID number, the system retrieves the correct patient's information, which is crucial in the eligibility process.


#### 1.2. Why This Workflow Is Critical


Getting patient identification right from the start is crucial for the entire healthcare journey. Without a precise match:


- **Accurate intervention display:** Having the right patient details helps show the correct medical interventions they can access in the facility.
- **Eligibility Failures:** All subsequent checks (like what benefits a patient has) would be unreliable if we're looking at the wrong record.
- **Data Integrity Issues:** It prevents creating duplicate records or scattering patient information across different entries, ensuring a clean and reliable data set for everyone. A single source of truth.


This workflow is the foundation of eligibility. It ensures that every step of the Eligibility Process is built on the right patient's foundation.


---


### 2. Workflow Details: Patient Search


![Patient Search Workflow Diagram](https://hie-docs.dha.go.ke/assets/PatientSearch-DbiSOyZX.png)


#### 2.1. Workflow Description


When you request to find a patient, the following internal process happens:


1. Input Reception: The system receives the patient's identification details, specifically an ID type (e.g., "National ID") and the corresponding ID number (e.g., "40150936").
2. National Client Registry (NCR) Query: If the initial checks pass, the system then sends a request to the NCR. The NCR acts as the single source of truth, performing a deep search based on the provided identifiers.
3. Information Retrieval: If the NCR finds a unique match, it sends back the patient's essential biodata (like name, date of birth, etc.) to our system.
4. Outcome Delivery: Our system then uses this retrieved data for the next steps in the Eligibility Process.


#### 2.2. Key Validations: Our System's Essential Checks


There are some essential checks performed to ensure a successful and accurate patient search. Understanding them helps you provide the correct information from your end.


- Valid ID Type Must Be Provided:
The ID type you send (like NATIONAL_ID or PASSPORT) must be one that our system and the National Client Registry (NCR) explicitly recognise and support.
This is important as it helps the system know how to look for the information in the central registry. If it's not a recognised type, the search won't even start.
- Both ID Number and ID Type Are Required:
You must provide both the actual ID number (e.g., "40150936") AND its correct corresponding ID type (e.g., "NATIONAL_ID"). You can't send one without the other.
This is critical for unique identification. An ID number alone isn't enough, as it could be a National ID, a temporary ID, or something else entirely. Likewise, an ID type without a number is useless. Providing both information helps the system perform a precise and accurate lookup, preventing errors or finding the wrong patient.


#### 2.3. Workflow Data Dictionary


This helps show you the information we work with, whether it is required or not and in what format the system expects it in.


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| Patient Identifier Type | The category or kind of identification document the Patient Identifier Value belongs to (e.g., "National ID," "Passport"). | String | Yes | This tells our system what kind of ID the Patient Identifier Value is. Knowing the type is important for a correct system search within the NCR and for applying the right matching rules. |
| Patient Identifier Value | The unique number or code directly from the patient's official identification document (e.g., the digits on a National ID card). | String | Yes | This is the exact identification number we use to query the National Client Registry. It's the primary key to unlocking the patient's record. |


#### 2.4. Expected Outcomes from this workflow


- Successful Search: The system successfully finds and retrieves the correct patient's data from the National Client Registry. This means you have the foundational information to proceed with other eligibility checks.
- Patient Not Found: The system indicates that no patient matching the provided ID type and number could be located in the National Client Registry. This might require verifying the input or exploring alternative identification methods.
- Input Error: The system identifies that the provided ID type or number did not meet our validation rules (e.g., an unsupported ID type was sent). This means the search couldn't even begin properly.


---


### 3. Supported Patient ID Types


To help you map your patient data, here are the types of patient identifiers our system recognises for the Patient Search workflow. Please ensure your inputs match the "Identifier Type Value (System Recognition)" precisely.


| Name (Common Use) | Identifier Type Value | Identifier Examples |
| --- | --- | --- |
| National ID | NATIONAL ID | 40150936 |
| Refugee ID | REFUGEE ID | 41506070 |
| Temporary ID | TEMPORARY ID | 41506070 |
| Mandate Number | MANDATE NUMBER | 41506070 |
| Alien ID | ALIEN ID | 41506070 |
| Birth Certificate Number | BIRTH CERTIFICATE NUMBER | 31415161 |
| Client Registry Identifier | CR ID | CR9795515286992-5 |
| SHA Identifier | SHA NUMBER | SHA0488143632695- |
| Birth Notification | BIRTH NOTIFICATION | 933306 |

Last modified on
April 30, 2026
Introduction to Registries
Facility Search

---

## Facility Search Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/registries/process/facilitySearch](https://hie-docs.dha.go.ke/docs/registries/process/facilitySearch)

# Facility Search Workflow Guide


## Facility Search Workflow: Finding and Validating Healthcare Facilities


### 1. Overview


This guide focuses on the Facility Search workflow, a core step in the Registries Process. Facility Search helps to provide valid and accurate healthcare facility information using the facility's official identifiers. It provides key information about a healthcare facility such as their registration status with the country's health authority, and also confirms their contracting status with Social Health Authority (SHA) to provide specific services for patients covered by SHA ensuring that every patient encounter is linked to a legitimate, operational facility.


#### 1.1. What This Workflow Does


The Facility Search workflow’s primary function is to retrieve a facility’s official record using its registration details. By providing a facility registration number or other recognized identifier, the system returns comprehensive facility information, which is essential for accurate reporting, billing, and compliance. This workflow ensures that all healthcare interactions are associated with valid, recognized and contracted facilities.


#### 1.2. Why This Workflow Is Critical


Accurate facility identification is vital for:


- **Regulatory Compliance:** Ensures that only licensed and operational facilities are used for patient care.
- **Billing and Claims:** Correct facility details are required for claims processing and reimbursement. Also confirms if the facility is contracted with SHA for specific services.
- **Patient Safety:** Links patient records to legitimate facilities, enhancing care continuity and safety.
- **Data Integrity:** Prevents errors and duplication in facility records, supporting a clean and reliable dataset.


This workflow is foundational for linking patient and professional interactions to the correct healthcare facility.


---


### 2. Workflow Details: Facility Search


#### 2.1. Workflow Description


When you request to find a facility, the following internal process occurs:


1. Input Reception: The system receives the facility’s identification details, such as a registration number or facility registry code.
2. Facility Registry Query: The system sends a request to the Facility Registry, which acts as the single authoritative source for facility data.
3. Information Retrieval: If a unique match is found, the registry returns the facility’s essential details (name, location, registration status, contact info, SHA contractual details).
4. Outcome Delivery: The system provides this data for subsequent processes as required.


#### 2.2. Key Validations: System Checks


To ensure a successful and accurate facility search, the system performs several checks:


- Valid Identifier Must Be Provided:
The identifier (e.g., registration number, fr-code) must be recognized and supported by the Facility Registry.
- Identifier value and format:
The value provided must match the expected format for the given identifier type (e.g., alphanumeric, specific length).


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| Facility Identifier Type | The category of identification used for the facility (e.g., "Registration Number", "Facility Code"). | String | Yes | Tells the system what kind of identifier is being used for the search. |
| Facility Identifier Value | The unique number or code assigned to the facility. | String | Yes | Used to query the Facility Registry and retrieve the facility’s record. |


#### 2.4. Expected Outcomes from this workflow


- **Successful Search:** The system finds and retrieves the correct facility’s data from the Facility Registry, enabling further processes.
- **Facility Not Found:** No facility matches the provided identifier; input may need verification.
- **Input Error:** Provided identifier type or value is invalid or unsupported.


---


### 3. Supported Facility Identifier Types


Below are the types of facility identifiers recognized for the Facility Search workflow. Ensure your inputs match the "Identifier Type Value" exactly.


| Name (Common Use) | Identifier Type Value | Identifier Examples |
| --- | --- | --- |
| Registration Number | registration-number | FAC12345 |
| Facility Registration Code | fr-code | HOSP67890 |


---


### 4. Key Success Factors for Facility Registry Integration


- **Use Valid Identifiers:** Always provide standardized, recognized facility identifiers.
- **Keep Records Updated:** Ensure facility data is current and synchronized.
- **Follow Compliance:** Adhere to privacy and regulatory requirements for facility data.
- **Design for Interoperability:** Integrate facility registry APIs for seamless data exchange.


---

Last modified on
April 30, 2026
Patient Search
Get Healthcare Professional Details

---

## Professional Search Workflow Guide

> Source: [https://hie-docs.dha.go.ke/docs/registries/process/professionalSearch](https://hie-docs.dha.go.ke/docs/registries/process/professionalSearch)

# Professional Search Workflow Guide


## Professional Search Workflow: Finding and Validating Healthcare Professionals


### 1. Overview


This guide focuses on the Professional Search workflow, a key step in the Registries Process. Professional Search helps providers get and validate healthcare professionals information using official identifiers, ensuring that every patient encounter is linked to a legitimate, licensed professional. It provides information on the healthcare professional including their demographics, specialties, and most importantly their licensing status.


#### 1.1. What This Workflow Does


The Professional Search workflow’s primary function is to retrieve a professional’s official record using their identification details. By providing a registration number, license number, or other recognized identifier, the system returns comprehensive professional information like demographics, specialties, and licensing status, which is essential for compliance, care quality, and reporting.


#### 1.2. Why This Workflow Is Critical


Accurate professional identification is vital for:


- **Regulatory Compliance:** Ensures that only licensed and authorized professionals are involved in patient care.
- **Billing and Claims:** Correct professional details are required for claims processing and reimbursement.
- **Care Quality:** Links patient encounters to verified professionals, supporting accountability and safety.
- **Data Integrity:** Prevents errors and duplication in professional records, supporting a clean and reliable dataset.


This workflow is foundational for linking patient and facility interactions to the correct healthcare professional.


---


### 2. Workflow Details: Professional Search


#### 2.1. Workflow Description


When you request to find a professional, the following internal process occurs:


1. Input Reception: The system receives the professional’s identification details, such as registration number, license number, or other supported identifier.
2. Health Worker Registry Query: The system sends a request to the Health Worker Registry, which acts as the authoritative source for professional data.
3. Information Retrieval: If a unique match is found, the registry returns the professional’s essential details (name, credentials, license status, contact info).
4. Outcome Delivery: The system provides the data which can then be used for subsequent processes.


#### 2.2. Key Validations: System Checks


To ensure a successful and accurate professional search, the system performs several checks:


- Valid Identifier Must Be Provided:
The identifier (e.g., registration number, license number) must be recognized and supported by the Health Worker Registry.
- Required Fields:
Both the identifier value and its type (e.g., "REGISTRATION_NUMBER") must be provided for a precise lookup.


#### 2.3. Workflow Data Dictionary


| Field Name | Description | Data Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| Professional Identifier Type | The category of identification used for the professional (e.g., "Registration Number", "License Number"). | String | Yes | Tells the system what kind of identifier is being used for the search. |
| Professional Identifier Value | The unique number or code assigned to the professional. | String | Yes | Used to query the Health Worker Registry and retrieve the professional’s record. |


#### 2.4. Expected Outcomes from this workflow


- **Successful Search:** The system finds and retrieves the correct professional’s data from the Health Worker Registry, enabling further processes.
- **Professional Not Found:** No professional matches the provided identifier; input may need verification.
- **Input Error:** Provided identifier type or value is invalid or unsupported.


---


### 3. Supported Professional Identifier Types


Below are the types of professional identifiers recognized for the Professional Search workflow. Ensure your inputs match the "Identifier Type Value" exactly.


| Name (Common Use) | Identifier Type Value | Identifier Examples |
| --- | --- | --- |
| Registration Number | registration_number | MED12345 |
| License Number | license_number | LIC67890 |


---


### 4. How Professional Search Connects to Other Workflows


Professional Search is interconnected with patient and facility registries:


- **Patient Visits:** Professional details are linked to patient records for every encounter.
- **Facility Validation:** Ensures professionals are associated with legitimate facilities.
- **Reporting and Analytics:** Accurate professional data supports operational and regulatory reporting.


---


### 5. Key Success Factors for Professional Registry Integration


- **Use Valid Identifiers:** Always provide standardized, recognized professional identifiers.
- **Keep Records Updated:** Ensure professional data is current and synchronized.
- **Follow Compliance:** Adhere to privacy and regulatory requirements for professional data.
- **Design for Interoperability:** Integrate professional registry APIs for seamless data exchange.


---

Last modified on
April 30, 2026
Facility Search

---
