
# Patient Resource Overview

Manage patient identity and information across the healthcare network.

## Introduction

The Patient resource represents an individual receiving healthcare services within the HIE network. It contains demographic information, identifiers, and contact details necessary for healthcare coordination across facilities.

**All Patient resource APIs require JWT authentication.** 🔑 [Learn how to obtain your JWT token here](#).

## Patient Identifiers

Patients can be identified using several unique identifiers:

| Identifier Type | Description |
|----------------|-------------|
| **HIE Patient ID** | Primary identifier assigned by the HIE system (starts with "CR") |
| **National ID** | Government-issued identification numbers |
| **Mandate Number** | Mandate Number ID Type |
| **Alien ID** | Alien ID Type |
| **KRA PIN** | Kenya Revenue Authority Personal Identification Number |
| **Temporary ID** | Temporary identification number |
| **Passport Number** | International travel document identifier |

## Patient Data Elements

The Patient resource captures essential demographic and contact information:

- Basic demographics (name, date of birth, gender)
- Contact information (address, phone numbers, email)
- Identifiers (national ID and other unique identifiers)
- Location details (County, Sub-County, Ward)

## Key Capabilities

The Patient resource allows healthcare facilities to:

### ✅ Create and Register
Register new patients in the HIE system with a unique identifier.

### 🔍 Search and Retrieve
Find and access patient information using various identifiers.

### 📌 Update Demographics
Maintain current patient contact and demographic information.

### 🏥 Validate Eligibility
Check patient insurance and program eligibility status.

### Patient Management
Healthcare providers can manage comprehensive patient information including demographics, contact information, insurance details, and eligibility status through a unified API interface. This enables coordinated care across the healthcare network.

---

## Patient Resource APIs

The following APIs are available for interacting with the Patient resource.

🔒 **All requests require JWT authentication.**

### Fetch Patient `GET`

Retrieves patient information using unique identifiers or data elements specified above.

#### Patient Identification Data Alignment

The main personally identifiable information (PII) for patients in the system includes the following. Having this data in your HMIS aligned with what's stored in the Client Registry creates consistency across systems and improves patient matching accuracy throughout the HIE network.

- CR ID (Client Registry unique identifier)
- Title (e.g., 'Miss')
- Middle name
- Place of birth
- Person with disability status (1=Yes, 0=No)
- Citizenship
- Identification type (e.g., 'National ID')
- Identification number
- Phone number

#### Request

```bash
curl -X GET "{base_url}/v3/client-registry/fetch-client?identification_type=National ID&identification_number=xxxxxxxx&agent=SAFARICOM-CONSORTIUM-SANDBOX" \
    -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `identification_type` | Yes | Type of identifier (e.g., National ID) |
| `identification_number` | Yes | The identifier value |
| `agent` | Yes | Your organization identifier |

#### Response

```json
curl -X GET "{base_url}/v3/client-registry/fetch-client?identification_type=National ID&identification_number=xxxxxxxx&agent=SAFARICOM-CONSORTIUM-SANDBOX" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"```


#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| identification_type | Yes | Type of identifier (e.g., National ID) |
| identification_number | Yes | The identifier value |
| agent | Yes | Your organization identifier |


#### Response



```JSON
{
    "message": {
        "total": 1,
        "result": [
            {
                "_pii": "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore",
                "resourceType": "Patient",
                "id": "CR000000000000-2",
                "meta": {
                    "versionId": "1",
                    "creationTime": "2024-09-28 14:06:35.296678",
                    "lastUpdated": "2024-09-28 14:17:20.919576",
                    "source": "http://cr-nrb.tiberbu.health"
                },
                "originSystem": {
                    "system": "SPIN MOBILE API",
                    "record_id": ""
                },
                "title": "Miss",
                "middle_name": "Doe",
                "place_of_birth": "MACHAKOS",
                "person_with_disability": 1,
                "citizenship": "KENYAN",
                "kra_pin": "KRA001",
                "preferred_primary_care_network": "pumwani",
                "employment_type": "Employed",
                "domestic_worker_type": "",
                "civil_status": "",
                "identification_type": "National ID",
                "identification_number": "xxxxxxxx",
                "other_identifications": [
                    {
                        "identification_type": "House Hold Number",
                        "identification_number": "HHxxxxxxxxxx"
                    },
                    {
                        "identification_number": "SHAxxxxxxxxxxxxx-2",
                        "identification_type": "SHA Number"
                    },
                    {
                        "identification_number": "CRxxxxxxxxxxxxx-7",
                        "identification_type": "Household Number"
                    }
                ],
                "dependants": [
                    {
                        "date_added": "2024-09-28 14:06:35.296678",
                        "relationship": "Spouse",
                        "total": 1,
                        "result": [
                            {
                                "resourceType": "Patient",
                                "id": "CRxxxxxxxxxxxxx-7",
                                "meta": {
                                    "versionId": "1",
                                    "creationTime": "2024-09-28 11:45:34.075724",
                                    "lastUpdated": "2024-09-28 14:09:20.150487",
                                    "source": "http://cr-nrb.tiberbu.health"
                                },
                                "originSystem": {
                                    "system": "SPIN MOBILE API",
                                    "record_id": ""
                                },
                                "title": "Miss",
                                "first_name": "Jane ",
                                "middle_name": "Doe",
                                "last_name": "Test",
                                "gender": "Female",
                                "date_of_birth": "2010-05-11",
                                "place_of_birth": "MACHAKOS",
                                "person_with_disability": 1,
                                "citizenship": "KENYAN",
                                "kra_pin": "KRA001",
                                "preferred_primary_care_network": "pumwani",
                                "employment_type": "Employed",
                                "domestic_worker_type": "",
                                "civil_status": "",
                                "identification_type": "National ID",
                                "identification_number": "xxxxxxxx",
                                "other_identifications": [
                                    {
                                        "identification_type": "House Hold Number",
                                        "identification_number": "HHxxxxxxxxxx"
                                    },
                                    {
                                        "identification_type": "SHA Number",
                                        "identification_number": "SHAxxxxxxxxxxxxx-7"
                                    },
                                    {
                                        "identification_number": "CRxxxxxxxxxxxxx-2",
                                        "identification_type": "Household Number"
                                    }
                                ],
                                "dependants": [],
                                "is_alive": 0,
                                "deceased_datetime": "2024-09-05 13:58:54",
                                "phone": "",
                                "biometrics_verified": 0,
                                "biometrics_score": 0,
                                "email": "",
                                "country": "Kenya",
                                "county": "Nairobi",
                                "sub_county": "Kasarani",
                                "ward": "kasarani",
                                "village_estate": "test",
                                "building_house_no": "test-house-number",
                                "latitude": "",
                                "longitude": "",
                                "province_state_country": "United States",
                                "zip_code": "",
                                "identification_residence": "",
                                "employer_name": "",
                                "employer_pin": "",
                                "disability_category": " physical",
                                "disability_subcategory": "handcapped",
                                "disability_cause": "accident",
                                "in_lawful_custody": "",
                                "admission_remand_number": "",
                                "document_uploads": [],
                                "alternative_contacts": [],
                                "gross_income": 0,
                                "gross_income_currency": "",
                                "postal_address": "",
                                "estimated_contribution": 0,
                                "city": "",
                                "id_serial": "",
                                "learning_institution_code": "",
                                "learning_institution_name": "",
                                "grade_level": "",
                                "is_agent": 0,
                                "agent_id": ""
                            }
                        ]
                    },
                    {
                        "date_added": "2024-09-28 14:06:35.296678",
                        "relationship": "Child",
                        "total": 1,
                        "result": [
                            {
                                "resourceType": "Patient",
                                "id": "CRxxxxxxxxxxxxx-1",
                                "meta": {
                                    "versionId": "1",
                                    "creationTime": "2024-09-28 11:46:36.149197",
                                    "lastUpdated": "2024-09-28 11:49:47.082523",
                                    "source": "http://cr-nrb.tiberbu.health"
                                },
                                "originSystem": {
                                    "system": "SPIN MOBILE API",
                                    "record_id": ""
                                },
                                "title": "Miss",
                                "first_name": "Jane ",
                                "middle_name": "Doe",
                                "last_name": "Child",
                                "gender": "Female",
                                "date_of_birth": "2020-05-20",
                                "place_of_birth": "MACHAKOS",
                                "person_with_disability": 1,
                                "citizenship": "KENYAN",
                                "kra_pin": "KRA001",
                                "preferred_primary_care_network": "pumwani",
                                "employment_type": "Employed",
                                "domestic_worker_type": "",
                                "civil_status": "",
                                "identification_type": "Birth Certificate",
                                "identification_number": "xxxxxxxx",
                                "other_identifications": [
                                    {
                                        "identification_type": "House Hold Number",
                                        "identification_number": "HHxxxxxxxxxxxxx"
                                    },
                                    {
                                        "identification_type": "SHA Number",
                                        "identification_number": "SHAxxxxxxxxxxxxx-1"
                                    },
                                    {
                                        "identification_number": "HHxxxxxxxxxxxxx-2",
                                        "identification_type": "Household Number"
                                    }
                                ],
                                "dependants": [],
                                "is_alive": 0,
                                "deceased_datetime": "2024-09-05 13:58:54",
                                "phone": "",
                                "biometrics_verified": 0,
                                "biometrics_score": 0,
                                "email": "",
                                "country": "Kenya",
                                "county": "Nairobi",
                                "sub_county": "Kasarani",
                                "ward": "kasarani",
                                "village_estate": "test",
                                "building_house_no": "test-house-number",
                                "latitude": "",
                                "longitude": "",
                                "province_state_country": "United States",
                                "zip_code": "",
                                "identification_residence": "",
                                "employer_name": "",
                                "employer_pin": "",
                                "disability_category": " physical",
                                "disability_subcategory": "handcapped",
                                "disability_cause": "accident",
                                "in_lawful_custody": "",
                                "admission_remand_number": "",
                                "document_uploads": [],
                                "alternative_contacts": [],
                                "gross_income": 0,
                                "gross_income_currency": "",
                                "postal_address": "",
                                "estimated_contribution": 0,
                                "city": "",
                                "id_serial": "",
                                "learning_institution_code": "",
                                "learning_institution_name": "",
                                "grade_level": "",
                                "is_agent": 0,
                                "agent_id": ""
                            }
                        ]
                    }
                ],
                "is_alive": 0,
                "deceased_datetime": "2024-09-05 13:58:54",
                "biometrics_verified": 0,
                "biometrics_score": 0,
                "country": "Kenya",
                "county": "Nairobi",
                "sub_county": "Kasarani",
                "ward": "kasarani",
                "village_estate": "test",
                "building_house_no": "test-house-number",
                "latitude": "",
                "longitude": "",
                "province_state_country": "United States",
                "zip_code": "",
                "identification_residence": "",
                "employer_name": "",
                "employer_pin": "",
                "disability_category": " physical",
                "disability_subcategory": "handcapped",
                "disability_cause": "accident",
                "in_lawful_custody": "",
                "admission_remand_number": "",
                "document_uploads": [],
                "alternative_contacts": [],
                "gross_income": 0,
                "gross_income_currency": "",
                "postal_address": "",
                "estimated_contribution": 0,
                "city": "",
                "id_serial": "",
                "learning_institution_code": "",
                "learning_institution_name": "",
                "grade_level": "",
                "is_agent": 0,
                "agent_id": ""
            }
        ]
    }
}
```
#### Request Body
The following fields can be updated:

Field	Required	Description
email	No	Patient email address
phone	No	Patient phone number
county	No	Patient county of residence
sub_county	No	Patient sub-county of residence

#### Status Codes

| Code | Description |
|------|-------------|
| `200 OK` | Request successful |
| `401 Unauthorized` | Invalid credentials provided |
| `404 Not Found` | Patient not found |

---

### Update Patient `PUT`

Updates patient information such as contact details.

#### Request

```bash
curl -X PUT "{base_url}/v3/update-client" \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    --data-raw '{
        "id": "CRxxxxxxxxxxxx-x",
        "agent": "SAFARICOM-CONSORTIUM-SANDBOX",
        "encrypted_pin": "1+kUOXTbjKd1I1ISeExmRTTqv80/ZHqCMox7YubOdvHH5AmI81VsAbWV3nbg61YerVfodJh9s3/4jzyFAWvUvlaIJ2aN09SEW7ZgjfNYEQ0te50b7jsu26DmzYVsNA3iG5ZsSMyaGY+Hpkd7YXZ8qJJ3HcUjvlIb58nIIKAVfw8obIFhbtLP8SnwO4X1EA5Q2OkyKG1YnNtqdtbCp90c1Dy6S1lxpdSMzAhZ1V6xcpzim8tX+O2RpFabSqgsiglOK1g1hgo1UVqhV14LGhg01nP/i3zt5oKCU7zPHxf324C6xDw6oGsfSsM4nKvOaW8q51roWLNL1ECdoL+Viwz==",
        "email": "",
        "phone": "",
        "county": "",
        "sub_county": ""
    }'
```

#### Request Body

The following fields can be updated:

| Field | Required | Description |
|-------|----------|-------------|
| `email` | No | Patient email address |
| `phone` | No | Patient phone number |
| `county` | No | Patient county of residence |
| `sub_county` | No | Patient sub-county of residence |

#### Status Codes

| Code | Description |
|------|-------------|
| `200 OK` | Update successful |
| `400 Bad Request` | Invalid request parameters |
| `401 Unauthorized` | Invalid credentials |

---

## Common Use Cases

### Patient Search

Locate patients across the HIE network using one or more identifiers. This enables:

- Preventing duplicate patient records
- Retrieving comprehensive patient history
- Coordinating care across multiple facilities

**Implementation Example:**

Before creating a new patient record, query the HIE using available identifiers to check if the patient already exists in the system. This prevents duplicate records and ensures comprehensive care across facilities.

### Patient Record Management

Healthcare providers can manage comprehensive patient information including:

- Demographics (name, date of birth, gender, etc.)
- Contact information (address, phone numbers, email)
- Primary care provider
- Insurance details

**Implementation Example:**

When patient contact information changes, use the Update Patient API to keep records current and accurate across the HIE network, ensuring care coordination and proper communication.

### Eligibility Verification

Verify patient insurance coverage and eligibility status before providing services:

- Confirm insurance coverage status
- Check NHIF coverage and transition status
- Identify potential coverage issues before service delivery

**Implementation Example:**

At patient registration or before scheduling procedures, use the Eligibility Check API to verify coverage status. This allows for proactive financial counseling and prevents surprise billing issues.

---

## Best Practices

1. **Search Before Creating:** Always check for existing patient records using available identifiers before creating new ones to prevent duplicates.

2. **Validate Patient Identity:** Use multiple identifiers when possible to ensure accurate patient matching and reduce the risk of errors.

3. **Update Information Promptly:** Keep patient contact information and demographics current to ensure accurate communication and care coordination.

4. **Check Eligibility Regularly:** Verify patient eligibility status before each service to prevent billing issues and ensure coverage.

5. **Handle Sensitive Data Securely:** Always follow data privacy regulations and implement proper security measures when handling patient information.

6. **Document Data Sources:** Track and document the origin of patient information and any modifications made to maintain data integrity.
