# IPS Bundle Implementation

> **FHIR R4 International Patient Summary (IPS) Bundle for Vitora HMIS**
>
> Version: 1.1
> Implemented: February 23, 2026
> Updated: April 24, 2026
> Status: ✅ Active

---

## Overview

Vitora HMIS implements the **FHIR R4 International Patient Summary (IPS)** specification to enable interoperable patient data exchange. The IPS Bundle provides a standardized, portable health record containing essential patient information for cross-border and cross-system healthcare continuity.

### Compliance

| Standard | Profile | Status |
|----------|---------|--------|
| **FHIR R4** | `http://hl7.org/fhir/uv/ips/` | ✅ Implemented |
| **IPS Bundle** | `Bundle-uv-ips` | ✅ Implemented |
| **IPS Composition** | `Composition-uv-ips` | ✅ Implemented |
| **IPS MedicationStatement** | `MedicationStatement-uv-ips` | ✅ Implemented |

---

## API Endpoints

### IPS Bundle Generation

```
GET /fhir/Patient/{id}/$summary
```

Generates a complete IPS Bundle for the specified patient containing:
- **Patient** resource
- **Composition** (document structure with sections)
- **Condition** resources (diagnoses)
- **AllergyIntolerance** resources
- **MedicationStatement** resources (from prescriptions)
- **CarePlan** resources (from treatment plans)
- **Observation** resources (laboratory, social history, pregnancy)
- **Specimen** resources
- **DiagnosticReport** resources
- **Immunization** resources
- **Procedure** resources
- **ImagingStudy** resources
- **Media** resources

**Authentication**: Required (JWT Bearer token)

**Response**: FHIR R4 Bundle (type: `document`)

#### Example Request

```bash
curl -X GET "https://api.vitora.health/fhir/Patient/123/$summary" \
  -H "Authorization: Bearer <token>" \
  -H "Accept: application/fhir+json"
```

#### Example Response

```json
{
  "resourceType": "Bundle",
  "id": "ips-123",
  "meta": {
    "lastUpdated": "2026-02-23T10:30:00+00:00",
    "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"]
  },
  "identifier": {
    "system": "https://api.vitora.health/fhir/identifier/ips-bundle",
    "value": "ips-MRN-20260101-0001"
  },
  "type": "document",
  "timestamp": "2026-02-23T10:30:00+00:00",
  "entry": [
    {
      "fullUrl": "https://api.vitora.health/fhir/Composition/123",
      "resource": { "resourceType": "Composition", "..." }
    },
    {
      "fullUrl": "https://api.vitora.health/fhir/Patient/123",
      "resource": { "resourceType": "Patient", "..." }
    },
    {
      "fullUrl": "https://api.vitora.health/fhir/MedicationStatement/456",
      "resource": { "resourceType": "MedicationStatement", "..." }
    },
    {
      "fullUrl": "https://api.vitora.health/fhir/CarePlan/789",
      "resource": { "resourceType": "CarePlan", "..." }
    }
  ]
}
```

---

### Individual Resource Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /fhir/Patient/{id}` | Read Patient resource |
| `GET /fhir/Condition/{id}` | Read Condition (diagnosis) resource |
| `GET /fhir/AllergyIntolerance/{id}` | Read AllergyIntolerance resource |
| `GET /fhir/MedicationStatement/{id}` | Read MedicationStatement resource |
| `GET /fhir/CarePlan/{id}` | Read CarePlan (treatment plan) resource |
| `GET /fhir/Composition/{id}` | Read Composition resource |
| `GET /fhir/Practitioner/{id}` | Read Practitioner resource |
| `GET /fhir/PractitionerRole/{id}` | Read PractitionerRole resource |
| `GET /fhir/Organization/{id}` | Read Organization resource |
| `GET /fhir/Observation/{id}` | Read Observation resource (lab, vitals, social history, pregnancy) |
| `GET /fhir/Medication/{id}` | Read Medication resource |
| `GET /fhir/Specimen/{id}` | Read Specimen resource |
| `GET /fhir/DiagnosticReport/{id}` | Read DiagnosticReport resource |
| `GET /fhir/Immunization/{id}` | Read Immunization resource |
| `GET /fhir/Procedure/{id}` | Read Procedure resource |
| `GET /fhir/ImagingStudy/{id}` | Read ImagingStudy resource |
| `GET /fhir/Media/{id}` | Read Media resource |
| `GET /fhir/Device/{id}` | Read implant-backed Device resource |
| `GET /fhir/DeviceUseStatement/{id}` | Read implant-backed DeviceUseStatement resource |

---

## IPS Composition Sections

The IPS Composition includes the following sections:

### 1. Allergies and Intolerances (Required)

**LOINC Code**: `48765-2`

Lists all active allergies for the patient from the `Allergy` model.

```json
{
  "title": "Allergies and Intolerances",
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "48765-2",
      "display": "Allergies and adverse reactions Document"
    }]
  },
  "entry": [
    { "reference": "AllergyIntolerance/1" },
    { "reference": "AllergyIntolerance/2" }
  ]
}
```

### 2. Medication Summary (Required)

**LOINC Code**: `10160-0`

Lists all active/pending medications from `PrescriptionItem` records.

```json
{
  "title": "Medication Summary",
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "10160-0",
      "display": "History of Medication use Narrative"
    }]
  },
  "entry": [
    { "reference": "MedicationStatement/1" },
    { "reference": "MedicationStatement/2" }
  ]
}
```

### 3. Problem List (Required)

**LOINC Code**: `11450-4`

Lists diagnoses from `Diagnosis` records linked to patient encounters.

```json
{
  "title": "Problem List",
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "11450-4",
      "display": "Problem list - Reported"
    }]
  },
  "entry": [
    { "reference": "Condition/1" }
  ]
}
```

### 4. Plan of Care (Conditional)

**LOINC Code**: `18776-5`

Included when the patient has active treatment plans.

```json
{
  "title": "Plan of Care",
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "18776-5",
      "display": "Plan of care note"
    }]
  },
  "entry": [
    { "reference": "CarePlan/1" }
  ]
}
```

### 5. Diagnostic Results (Conditional)

**LOINC Code**: `30954-2`

Included when the patient has laboratory results, diagnostic reports, specimens, imaging studies, or media.

```json
{
  "title": "Diagnostic Results",
  "entry": [
    { "reference": "Observation/1" },
    { "reference": "DiagnosticReport/1" },
    { "reference": "Specimen/1" },
    { "reference": "ImagingStudy/1" },
    { "reference": "Media/1" }
  ]
}
```

### 6. Social History (Conditional)

**LOINC Code**: `29762-2`

Included when dedicated social-history observations exist.

### 7. History of Pregnancy (Conditional)

**LOINC Code**: `10162-6`

Included when pregnancy-related observations exist.

### 8. History of Immunizations (Conditional)

**LOINC Code**: `11369-6`

Included when immunization records exist.

### 9. Procedure History (Conditional)

**LOINC Code**: `47519-4`

Included when completed or scheduled procedures exist.

---

## Resource Mappings

### MedicationStatement (from PrescriptionItem)

| Django Field | FHIR Element | Notes |
|--------------|--------------|-------|
| `prescription.status` | `status` | PENDING/PARTIAL → active, DISPENSED → completed |
| `drug.code` | `medicationCodeableConcept.coding[0].code` | Local drug code |
| `drug.generic_name` | `medicationCodeableConcept.coding[0].display` | Drug name |
| `drug.keml_code` | `medicationCodeableConcept.coding[1].code` | Kenya Essential Medicines List |
| `prescription.patient` | `subject` | Patient reference |
| `prescription.prescribed_at` | `effectivePeriod.start` | Prescription date |
| `dosage` | `dosage[0].text` | Combined dosage string |
| `frequency` | `dosage[0].timing.code.text` | Frequency text |
| `route` | `dosage[0].route` | Administration route |
| `instructions` | `dosage[0].patientInstruction` | Patient instructions |
| `prescription.prescribed_by` | `informationSource` | Prescriber reference |
| `prescription.encounter` | `context` | Encounter reference |

### CarePlan (from TreatmentPlan)

| Django Field | FHIR Element | Notes |
|--------------|--------------|-------|
| `status` | `status` | DRAFT → draft, ACTIVE → active, etc. |
| `encounter.encounter_type` | `title` | Treatment plan title |
| `encounter.patient` | `subject` | Patient reference |
| `created_at` | `period.start`, `created` | Plan creation date |
| `encounter` | `encounter` | Encounter reference |
| `created_by` | `author` | Plan author |
| `approved_by` | `contributor` | Plan approver |
| `clinical_notes` | `description`, `note` | Clinical notes |
| `diet_recommendations` | `activity[].detail` | Diet activity (SNOMED: 182922004) |
| `activity_restrictions` | `activity[].detail` | Activity restriction (SNOMED: 183301007) |
| `referral_needed` + `referral_specialty` | `activity[].detail` | Referral activity (SNOMED: 3457005) |
| `follow_up_date` | `activity[].detail.scheduledPeriod` | Follow-up appointment |

---

## Data Sources

The IPS Bundle aggregates data from the following Django models:

| IPS Section | Django Model | Query Criteria |
|-------------|--------------|----------------|
| Patient | `patients.Patient` | Direct lookup by ID |
| Allergies | `patients.Allergy` | `status='active'`, via `get_active_allergies_for_patient()` |
| Medications | `pharmacy.PrescriptionItem` | `prescription.status IN (PENDING, PARTIAL, DISPENSED)`, `is_cancelled=False` |
| Conditions | `encounters.Diagnosis` | All diagnoses linked to patient encounters |
| Plan of Care | `encounters.TreatmentPlan` | `status IN (ACTIVE, DRAFT)` |
| Laboratory Results | `laboratory.LabResult` | `order_item.lab_order.patient = patient` |
| Diagnostic Reports | `laboratory.DiagnosticReport` | `lab_order.patient = patient` |
| Specimens | `laboratory.Specimen` | `lab_order.patient = patient` |
| Social History | `encounters.SocialHistoryObservation` | `patient = patient` |
| Pregnancy History | `encounters.PregnancyObservation` | `patient = patient` |
| Immunizations | `immunizations.ImmunizationRecord` | `patient = patient` |
| Procedures | `procedures.ProcedureOrder` | `patient = patient` |
| Imaging | `imaging.DICOMStudy`, `imaging.DICOMInstance` | `patient = patient` |
| Devices | `theatre.TheatreConsumable` | `is_implant=True`, via surgery case patient linkage |

### Inferno Seed Data

Use the management command below to create stable Inferno test IDs for the currently supported IPS-adjacent FHIR resources:

```bash
cd backend
poetry run python manage.py seed_fhir_test_data
```

The command now prints IDs for:
- Laboratory Observation
- Alcohol use Observation
- Tobacco use Observation
- Pregnancy status Observation
- Pregnancy expected delivery date Observation
- Pregnancy outcome Observation
- Immunization
- Specimen
- DiagnosticReport
- Procedure
- ImagingStudy
- Media
- Device
- DeviceUseStatement

### Query Limits

To prevent oversized bundles:
- Diagnoses: Last 10
- Allergies: Up to 20
- Prescriptions: Last 10 (all non-cancelled items included)
- Treatment Plans: Last 5 active/draft
- Laboratory results: Up to 20
- Social history observations: Up to 10
- Pregnancy observations: Up to 10
- Diagnostic reports, immunizations, procedures, imaging studies, media: Up to 10 each

---

## Empty Section Handling

When a section has no data, the IPS specification requires an `emptyReason`:

```json
{
  "title": "Medication Summary",
  "code": { "..." },
  "text": {
    "status": "generated",
    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">No current medications</div>"
  },
  "emptyReason": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/list-empty-reason",
      "code": "unavailable",
      "display": "Unavailable"
    }]
  }
}
```

---

## Integration Examples

### Python (requests)

```python
import requests

def get_patient_ips(patient_id: int, access_token: str) -> dict:
    """Fetch IPS Bundle for a patient."""
    response = requests.get(
        f"https://api.vitora.health/fhir/Patient/{patient_id}/$summary",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/fhir+json",
        },
    )
    response.raise_for_status()
    return response.json()
```

### JavaScript (fetch)

```javascript
async function getPatientIPS(patientId, accessToken) {
  const response = await fetch(
    `https://api.vitora.health/fhir/Patient/${patientId}/$summary`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/fhir+json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
```

### cURL

```bash
# Get IPS Bundle
curl -X GET "https://api.vitora.health/fhir/Patient/123/$summary" \
  -H "Authorization: Bearer eyJ..." \
  -H "Accept: application/fhir+json"

# Get individual MedicationStatement
curl -X GET "https://api.vitora.health/fhir/MedicationStatement/456" \
  -H "Authorization: Bearer eyJ..." \
  -H "Accept: application/fhir+json"

# Get individual CarePlan
curl -X GET "https://api.vitora.health/fhir/CarePlan/789" \
  -H "Authorization: Bearer eyJ..." \
  -H "Accept: application/fhir+json"
```

---

## Testing

### Unit Tests

Located in `backend/tests/core/test_fhir_ips.py`:

```bash
# Run IPS tests only
cd backend
poetry run pytest tests/core/test_fhir_ips.py -v

# Run with coverage
poetry run pytest tests/core/test_fhir_ips.py --cov=hmis.apps.core.fhir
```

### Test Coverage

| Test Class | Tests | Description |
|------------|-------|-------------|
| `TestFHIRIPSBundle` | 5 | Bundle structure, composition, patient, auth |
| `TestFHIRObservation` | 5 | Lab, social history, and pregnancy observations |
| `TestFHIRAdditionalResources` | 10 | Standalone IPS-adjacent resources including Device and DeviceUseStatement |
| `TestFHIRIPSMedicationStatement` | 5 | Medication inclusion, dosage, multiple meds |
| `TestFHIRIPSCarePlan` | 6 | CarePlan inclusion, activities, referrals |
| `TestFHIRIPSEmptySections` | 2 | Empty section handling |
| `TestFHIRIPSAllergies` | 2 | Allergy integration |
| `TestFHIRIPSComplete` | 4 | Complete bundle and expanded composition sections |
| `TestSeedFHIRTestDataCommand` | 1 | Inferno seed coverage and output keys |
| **Total** | **40** | |

### Test Fixtures

Available fixtures for IPS testing:

```python
@pytest.fixture
def sample_drug(db):
    """Create a sample drug for prescription tests."""

@pytest.fixture
def sample_prescription_with_items(db, sample_patient, sample_encounter, test_user, sample_drug):
    """Create a prescription with items for IPS testing."""

@pytest.fixture
def sample_treatment_plan_full(db, sample_encounter, test_user):
    """Create a treatment plan with all fields populated."""

@pytest.fixture
def sample_allergy_active(db, sample_patient, test_user):
    """Create an active allergy for IPS testing."""
```

---

## Error Handling

### 404 Not Found

Returned when the patient does not exist:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "not-found",
    "diagnostics": "Patient with ID 999 not found"
  }]
}
```

### 401 Unauthorized

Returned when authentication is missing or invalid:

```json
{
  "detail": "Authentication credentials were not provided."
}
```

---

## Future Enhancements

The following enhancements are planned for future sprints:

1. **Vital Signs Section** - Add recent encounter vitals into the summary bundle
2. **Medication Resource Linking** - Add explicit `Medication` entries referenced from bundle medication statements
3. **Richer Device Coverage** - Expand beyond theatre implants to other clinically relevant device sources when patient linkage is explicit
4. **IPS Document Generation** - PDF export of IPS summary
5. **IPS Validation** - Integration with FHIR validator for conformance checking

---

## References

- [HL7 FHIR International Patient Summary (IPS)](http://hl7.org/fhir/uv/ips/)
- [FHIR R4 Bundle Resource](https://hl7.org/fhir/R4/bundle.html)
- [FHIR R4 MedicationStatement Resource](https://hl7.org/fhir/R4/medicationstatement.html)
- [FHIR R4 CarePlan Resource](https://hl7.org/fhir/R4/careplan.html)
- [Kenya Digital Health Standards](https://www.health.go.ke/)

---

**Last Updated**: April 24, 2026
**Maintainer**: Backend Team
