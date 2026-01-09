
# Facility Registry API

The Facility Registry API allows users to search for healthcare facilities within the system using facility codes. This API ensures efficient facility lookup and retrieval of essential facility details, supporting healthcare coordination and management.

## Facility Identifiers

Facilities can be identified using the following:

- **Facility Code**: A unique code assigned to each healthcare facility.

## Facility Data Elements

The Facility resource contains essential facility-related information, including:

- Facility Code (Unique identifier)
- Approval Status
- Facility Level
- Operational Status
- Current License Expiry Date

## Key Capabilities

This API enables:

- 🔍 **Search and Retrieve**: Find and access facility details using a facility code.
- 📌 **Verify Facility Status**: Retrieve licensing and operational status.

## Facility Management

Healthcare administrators and system users can leverage this API to:

- Search for healthcare facilities based on facility codes.
- Retrieve critical facility details such as approval and operational status.

## Facility Resource APIs

The following API endpoint is available for interacting with the Facility Registry:

### Search Facility API Endpoint

#### Description
Search for healthcare facilities based on facility codes.

#### Endpoint
- **Method**: `GET`
- **URL**: `{{base_url}}/v1/facility-search?facility_code={{facility_code}}`

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| facility_code | string | ✅ Yes | Facility code |

#### Headers

| Header | Required | Description |
|--------|----------|-------------|
| Authorization | ✅ Yes | Bearer token for authentication |

#### Response

```json
{
    "message": {
        "facility_code": "24749",
        "found": 1,
        "approved": null,
        "facility_level": null,
        "operational_status": null,
        "current_license_expiry_date": ""
    }
}
```

#### Status Codes

| Code | Description |
|------|-------------|
| 200 | Request successful |
| 404 | Facility not found |

## Common Use Cases

### Facility Lookup
Retrieve a facility's details for reference, status verification, or licensing purposes.

### Implementation Example
Before approving a new facility for a healthcare program, use this API to verify the facility's status and operational details.

## Best Practices

✅ **Ensure Valid Facility Codes**: Always use the correct facility code to retrieve accurate results.

✅ **Authenticate Requests**: Use a valid JWT token for API access.

✅ **Handle Missing Data Gracefully**: Not all facilities may have complete metadata (e.g., approval status or license expiry date may be null).

✅ **Verify Facility Status Before Transactions**: Ensure the facility is operational and licensed before proceeding with medical transactions or referrals.

---

# Refill Calculation Explained Simply

The refill computation process determines how many medication refills a patient has left and when they can get their next refill. Here's how it works in straightforward terms:

## Step 1: Gather the Information

The system collects two key pieces of information:

- The original prescription details (from the `MedicationRequest`)
- A history of all times the medication was dispensed (from `MedicationDispense` records)

## Step 2: Calculate Basic Numbers

- **Total allowed fills**: This is the initial fill plus all refills
    - For example: If the doctor allows 5 refills, the total is 6 fills (1 initial + 5 refills)
- **Fills used so far**: Count how many times the pharmacy has given the medication to the patient
- **Remaining refills**: Subtract the fills used from the total allowed

## Step 3: Determine Next Refill Date

- Look at when the patient last picked up their medication
- Check how many days that supply was meant to last (usually 30 days)
- Add those days to the last pickup date to find when they can get their next refill

## Step 4: Check If Prescription Is Still Valid

- Prescriptions typically expire after a certain period (often 6 months)
- The system compares today's date with the prescription's end date
- If today's date is past the end date, the prescription is no longer valid, regardless of remaining refills

## Example

For patient Stephen Gitau:

- His doctor wrote a prescription for Amlodipine with 5 refills (6 total fills)
- He's picked up the medication twice already
- He has 4 refills remaining
- His next refill is due on May 27, 2025
- His prescription remains valid until September 28, 2025

The Python code does all this automatically by processing the FHIR resources from the patient's health record, saving pharmacists from having to calculate these details manually.

