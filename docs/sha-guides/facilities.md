
# Understanding the Facility Resource

## What is a Facility Resource?

In healthcare information exchange systems, a "Facility Resource" is a standardized digital representation of healthcare organizations providing services. It serves as the authoritative source for facility information across the HIE ecosystem, enabling consistent identification and referencing of healthcare facilities.

## FHIR and Facility Resources

In FHIR, facilities are primarily represented through the **Organization** resource, often with associated **Location** and **HealthcareService** resources. These structured resources enable consistent representation of facilities across different healthcare systems within the HIE.

## Core Components of a Facility Resource

```json
{
    "message": {
        "id": "",
        "facility_name": "ST CHRISTINE MEDICAL CENTRE KAKAMEGA",
        "registration_number": "15366",
        "facility_code": "23989",
        "regulator": "Kenya Medical Practitioners and Dentists Council (KMPDC)",
        "facility_level": "Level 3A",
        "facility_category": "Private Practice",
        "facility_owner": "private-practice-private-institution-academic",
        "facility_type": "MEDICAL CENTRE",
        "county": "KAKAMEGA",
        "sub_county": "Lurambi",
        "ward": "Sheywe",
        "found": 1,
        "approved": "yes",
        "operational_status": "active",
        "current_license_expiry_date": ""
    }
}
```

A Facility Resource typically includes:

### Organizational Information
- Official facility name
- Type of facility (hospital, clinic, laboratory)
- Ownership model (public, private, faith-based)
- Operational status (active, inactive, suspended)

### Location Details
- Physical address
- Geographic coordinates
- Service catchment area
- Administrative divisions (county, sub-county, ward)

### Identification
- Multiple identifier types (MFL code, KMHFL code, etc.)
- Issuing authorities for each identifier
- Validity periods for credentials and certifications

### Service Information
- Healthcare services offered
- Operational hours
- Contact information
- Reference to key personnel

## The Facility Resource in an HIE Ecosystem

In a Healthcare Information Exchange (HIE) ecosystem, the Facility Resource serves several critical functions:

### Standardized Facility Identification
The HIE maintains a standardized Master Facility List (MFL) that uniquely identifies each healthcare facility, enabling accurate referencing across all systems.

### Enhanced Interoperability
By maintaining consistent facility identifiers, the HIE enables proper attribution of clinical documents, lab results, and other health information to their originating facilities.

### Improved Data Exchange
When exchanging clinical information, systems can reliably reference the source and recipient facilities, ensuring proper routing and context.

### Efficient Healthcare Operations
Resource allocation, referral management, and health service mapping become more effective with standardized facility information.

## Facility Matching and Registry Management

Maintaining an accurate facility registry involves:

- **Supporting multiple identifiers** - Accommodating various facility coding systems
- **Hierarchical relationships** - Tracking parent-child relationships between facilities
- **Version control** - Managing changes to facility information over time
- **Deduplication processes** - Identifying and resolving duplicate facility entries

## Implementation Considerations

When working with Facility Resources in an HIE:

1. Implement governance processes for adding and updating facility information
2. Establish data quality standards for required fields and formats
3. Develop workflows for facility verification and validation
4. Create processes for managing facility mergers, closures, and name changes
5. Ensure proper linkage between facilities and their services

## Real-World Applications

Healthcare systems can leverage Facility Resources for:

- **Referral Management** - Directing patients to appropriate facilities
- **Health Service Mapping** - Understanding service distribution and gaps
- **Supply Chain Management** - Coordinating resource distribution
- **Emergency Response** - Identifying nearby facilities during emergencies
- **Health System Planning** - Making informed decisions about facility development

By properly implementing a Facility Registry, healthcare organizations can improve coordination of care, enhance data quality, and support better healthcare delivery across the entire ecosystem.

---

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
| `facility_code` | string | ✅ Yes | Facility code |

#### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | ✅ Yes | Bearer token for authentication |

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

