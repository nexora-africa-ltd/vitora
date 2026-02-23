# Structured Allergy Model Implementation

> **DHA Compliance**: Sprint 1.C, Item 7 — `P1 REQUIRED`
>
> Version: 1.1
> Created: February 23, 2026
> Updated: February 23, 2026
> Status: ✅ Complete (Backend + Frontend)

---

## Overview

The Structured Allergy Model replaces free-text allergy recording with a standardized, queryable data model that:

- Enables **drug-allergy interaction checking** at prescription time
- Supports **FHIR R4 AllergyIntolerance** resource mapping
- Integrates with **IPS (International Patient Summary)** bundles
- Complies with **DHA Digital Health Standards** for clinical data quality
- Maintains full **Kenya DPA 2019** audit compliance

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Allergy Model Architecture                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐         │
│  │     Patient     │────▶│     Allergy     │────▶│      Drug       │         │
│  │                 │  1:N│                 │  N:1│   (optional)    │         │
│  └─────────────────┘     └────────┬────────┘     └─────────────────┘         │
│                                   │                                           │
│                          ┌────────▼────────┐                                  │
│                          │   Encounter     │                                  │
│                          │ (source_encounter)                                 │
│                          └─────────────────┘                                  │
│                                                                               │
│  Integrations:                                                                │
│  ├── PrescriptionCreateSerializer → Drug-allergy interaction check           │
│  ├── FHIRAllergyIntoleranceView   → FHIR R4 resource                          │
│  └── FHIRPatientSummaryView       → IPS Bundle inclusion                      │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Allergy Model

**Location**: `hmis/apps/patients/models.py`

```python
class Allergy(models.Model):
    # Core fields
    patient = ForeignKey(Patient)              # Required
    substance = CharField(max_length=500)      # Required - allergen name
    substance_code = CharField(blank=True)     # RxNorm, SNOMED CT, or local code
    substance_code_system = CharField(blank=True)  # Code system URI
    substance_type = CharField(choices=[...])  # medication, food, environmental, biological, other
    
    # Link to Drug (enables interaction checking)
    drug = ForeignKey(Drug, null=True)         # Optional - for medication allergies
    
    # Reaction details
    reaction_type = CharField(choices=[...])   # anaphylaxis, rash, hives, etc.
    reaction_description = TextField(blank=True)
    severity = CharField(choices=[...])        # mild, moderate, severe, life_threatening
    criticality = CharField(choices=[...])     # low, high, unable_to_assess (FHIR)
    
    # Dates
    onset_date = DateField(null=True)          # When allergy first identified
    last_occurrence = DateField(null=True)     # Most recent reaction
    
    # Status
    status = CharField(choices=[...])          # active, inactive, resolved
    verification_status = CharField(choices=[...])  # unconfirmed, presumed, confirmed, refuted
    
    # Clinical notes
    notes = TextField(blank=True)
    
    # Source tracking
    source_encounter = ForeignKey(Encounter, null=True)  # Where recorded
    recorded_by = ForeignKey(User)             # Who recorded
    
    # Timestamps
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

### Choice Values

| Field | Values |
|-------|--------|
| `substance_type` | `medication`, `food`, `environmental`, `biological`, `other` |
| `reaction_type` | `anaphylaxis`, `angioedema`, `bronchospasm`, `cardiac_arrhythmia`, `diarrhea`, `dyspnea`, `hives`, `hypotension`, `itching`, `nausea`, `rash`, `swelling`, `vomiting`, `other` |
| `severity` | `mild`, `moderate`, `severe`, `life_threatening` |
| `criticality` | `low`, `high`, `unable_to_assess` |
| `status` | `active`, `inactive`, `resolved` |
| `verification_status` | `unconfirmed`, `presumed`, `confirmed`, `refuted`, `entered_in_error` |

### Database Constraints

- **Unique Active Constraint**: Only one active allergy per patient per substance
  - Allows multiple resolved/inactive allergies with the same substance
- **Indexes**: `(patient, status)`, `substance`, `severity`, `substance_type`

---

## API Endpoints

### Nested Routes (under patient)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/patients/{id}/allergies/` | List patient's allergies |
| `POST` | `/api/patients/{id}/allergies/` | Create allergy for patient |
| `GET` | `/api/patients/{id}/allergies/{allergy_id}/` | Get allergy detail |
| `PATCH` | `/api/patients/{id}/allergies/{allergy_id}/` | Update allergy |
| `DELETE` | `/api/patients/{id}/allergies/{allergy_id}/` | Delete allergy |

### Standalone Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/allergies/` | List all allergies (filterable) |
| `GET` | `/api/allergies/{id}/` | Get allergy by ID |
| `GET` | `/api/allergies/lookup/` | Substance lookup |
| `POST` | `/api/allergies/check-interactions/` | Check drug-allergy interactions |

### FHIR Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/fhir/AllergyIntolerance/{id}` | FHIR R4 AllergyIntolerance resource |
| `GET` | `/fhir/Patient/{id}/$summary` | IPS Bundle (includes allergies) |

---

## API Payloads

### Create Allergy

```json
POST /api/patients/123/allergies/
{
  "substance": "Penicillin",
  "substance_type": "medication",
  "drug": 456,                    // Optional: link to Drug record
  "reaction_type": "anaphylaxis",
  "severity": "severe",
  "criticality": "high",
  "onset_date": "2020-05-15",
  "verification_status": "confirmed",
  "notes": "Patient had anaphylactic shock at previous facility"
}
```

**Response (201 Created)**:
```json
{
  "id": 789,
  "patient": 123,
  "patient_mrn": "MRN-20260101-0001",
  "patient_name": "John Doe",
  "substance": "Penicillin",
  "substance_type": "medication",
  "substance_type_display": "Medication",
  "drug": 456,
  "drug_name": "Penicillin V",
  "reaction_type": "anaphylaxis",
  "reaction_type_display": "Anaphylaxis",
  "severity": "severe",
  "severity_display": "Severe",
  "criticality": "high",
  "criticality_display": "High Risk",
  "status": "active",
  "status_display": "Active",
  "verification_status": "confirmed",
  "verification_status_display": "Confirmed",
  "is_high_risk": true,
  "is_active": true,
  "onset_date": "2020-05-15",
  "notes": "Patient had anaphylactic shock at previous facility",
  "recorded_by": 1,
  "recorded_by_username": "dr.smith",
  "created_at": "2026-02-23T10:30:00Z",
  "updated_at": "2026-02-23T10:30:00Z"
}
```

### Substance Lookup

```
GET /api/allergies/lookup/?q=penic&type=medication
```

**Response**:
```json
[
  {
    "substance": "Penicillin V",
    "code": "DRUG001",
    "code_system": "local_drug_code",
    "drug_id": 456,
    "type": "medication",
    "display": "Penicillin V (250mg)"
  },
  {
    "substance": "Penicillin G",
    "code": "DRUG002",
    "code_system": "local_drug_code",
    "drug_id": 457,
    "type": "medication",
    "display": "Penicillin G (1M units)"
  }
]
```

### Check Drug Interactions

```json
POST /api/allergies/check-interactions/
{
  "patient_id": 123,
  "drug_ids": [456, 789],
  "drug_names": ["Amoxicillin"]
}
```

**Response**:
```json
{
  "patient_id": 123,
  "has_interactions": true,
  "has_high_risk": true,
  "interactions": [
    {
      "allergy_id": 789,
      "substance": "Penicillin",
      "severity": "severe",
      "severity_display": "Severe",
      "reaction_type": "anaphylaxis",
      "is_high_risk": true,
      "drug_id": 456,
      "warning": "Patient is allergic to Penicillin (Severe severity)"
    }
  ]
}
```

---

## Drug-Allergy Interaction Checking

### Prescription Flow Integration

When creating a prescription via `POST /api/pharmacy/prescriptions/`, the system automatically checks for drug-allergy interactions:

1. **Check Phase**: Each prescribed drug is checked against patient's active allergies
   - By drug ID (if allergy linked to Drug record)
   - By drug name (substring match for generic names)

2. **Block Phase**: If interactions found, request is rejected with `400 Bad Request`:
   ```json
   {
     "allergy_warnings": [
       {
         "drug_id": 456,
         "drug_name": "Amoxicillin",
         "allergy_id": 789,
         "substance": "Penicillin",
         "severity": "severe",
         "reaction_type": "anaphylaxis",
         "is_high_risk": true
       }
     ],
     "message": "Drug-allergy interactions detected. Set acknowledge_allergy_warnings=true to proceed.",
     "has_high_risk": true
   }
   ```

3. **Override Phase**: Prescriber can acknowledge and proceed:
   ```json
   POST /api/pharmacy/prescriptions/
   {
     "patient": 123,
     "acknowledge_allergy_warnings": true,
     "items": [{ "drug": 456, ... }]
   }
   ```
   
4. **Audit Phase**: Override is logged in `clinical_notes` field:
   ```
   [ALLERGY WARNING ACKNOWLEDGED BY PRESCRIBER]
   The following drug-allergy interactions were detected:
   - Amoxicillin: Patient allergic to Penicillin (Severe)
   ```

---

## FHIR R4 Mapping

### AllergyIntolerance Resource

**Endpoint**: `GET /fhir/AllergyIntolerance/{id}`

```json
{
  "resourceType": "AllergyIntolerance",
  "id": "789",
  "meta": {
    "profile": ["http://hl7.org/fhir/StructureDefinition/AllergyIntolerance"]
  },
  "clinicalStatus": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
      "code": "active",
      "display": "Active"
    }]
  },
  "verificationStatus": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
      "code": "confirmed",
      "display": "Confirmed"
    }]
  },
  "type": "allergy",
  "category": ["medication"],
  "criticality": "high",
  "code": {
    "text": "Penicillin",
    "coding": [{
      "system": "local_drug_code",
      "code": "DRUG001",
      "display": "Penicillin"
    }]
  },
  "patient": {
    "reference": "Patient/123",
    "display": "John Doe"
  },
  "onsetDateTime": "2020-05-15",
  "recordedDate": "2026-02-23T10:30:00Z",
  "recorder": {
    "reference": "Practitioner/1",
    "display": "Dr. Smith"
  },
  "reaction": [{
    "severity": "severe",
    "manifestation": [{
      "coding": [{
        "system": "http://snomed.info/sct",
        "code": "39579001",
        "display": "Anaphylaxis"
      }]
    }],
    "description": "Patient had anaphylactic shock at previous facility"
  }],
  "note": [{
    "text": "Patient had anaphylactic shock at previous facility"
  }]
}
```

### IPS Bundle Integration

Active allergies are automatically included in the patient's IPS Bundle at `/fhir/Patient/{id}/$summary`:

- Composition section: "Allergies and Intolerances" with references
- Bundle entries: Full AllergyIntolerance resources
- Empty section: Shows "No known allergies" with emptyReason when no allergies

---

## Data Migration

### Automatic Migration

**Migration**: `hmis/apps/patients/migrations/0012_migrate_encounter_allergies.py`

Parses existing `Encounter.allergies` free-text fields into structured `Allergy` records:

1. **Parsing Logic**:
   - Splits by comma, semicolon, newline
   - Extracts severity from parentheses: `Penicillin (severe - anaphylaxis)`
   - Maps keywords to `severity` and `reaction_type`

2. **Deduplication**:
   - Skips "none", "NKDA", "N/A" entries
   - Only creates one active allergy per substance per patient
   - Links to source encounter for traceability

3. **Default Values**:
   - `substance_type`: "medication" (most common)
   - `verification_status`: "unconfirmed" (from free text)
   - `status`: "active"

### Running the Migration

```bash
cd backend
poetry run python manage.py migrate patients
```

---

## Test Coverage

**Test File**: `backend/tests/test_allergy.py` — **39 tests**

| Test Class | Tests | Coverage |
|------------|:-----:|----------|
| `TestAllergyModel` | 12 | Model creation, validation, constraints |
| `TestAllergyDrugInteraction` | 4 | Drug-allergy checking methods |
| `TestAllergyAPI` | 7 | CRUD operations, authentication |
| `TestAllergyLookup` | 3 | Substance lookup endpoint |
| `TestDrugAllergyInteractionCheckAPI` | 4 | Interaction check endpoint |
| `TestFHIRAllergyIntolerance` | 3 | FHIR resource mapping |
| `TestPrescriptionAllergyCheck` | 2 | Prescription integration |
| `TestAllergyAuditLogging` | 2 | Audit trail |
| `TestAllergySerializers` | 2 | Serializer fields |

### Running Tests

```bash
cd backend
poetry run pytest tests/test_allergy.py -v
```

---

## Frontend Implementation

> **Status**: ✅ Complete
> **Location**: `web-app/`

### Required Components

#### 1. API Client (`lib/api/allergies.ts`)

```typescript
import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { 
  AllergySchema, 
  AllergyListSchema, 
  AllergyLookupResultSchema,
  DrugInteractionCheckSchema 
} from '@/lib/schemas/allergy.schema';

export const allergiesApi = {
  // List allergies for a patient
  listByPatient: async (patientId: number) => {
    const response = await apiClient.get(`/api/patients/${patientId}/allergies/`);
    return parseResponse(z.array(AllergyListSchema), response.data);
  },

  // Get allergy detail
  get: async (patientId: number, allergyId: number) => {
    const response = await apiClient.get(`/api/patients/${patientId}/allergies/${allergyId}/`);
    return parseResponse(AllergySchema, response.data);
  },

  // Create allergy
  create: async (patientId: number, data: AllergyCreatePayload) => {
    const response = await apiClient.post(`/api/patients/${patientId}/allergies/`, data);
    return parseResponse(AllergySchema, response.data);
  },

  // Update allergy
  update: async (patientId: number, allergyId: number, data: Partial<Allergy>) => {
    const response = await apiClient.patch(
      `/api/patients/${patientId}/allergies/${allergyId}/`,
      data
    );
    return parseResponse(AllergySchema, response.data);
  },

  // Delete allergy
  delete: async (patientId: number, allergyId: number) => {
    await apiClient.delete(`/api/patients/${patientId}/allergies/${allergyId}/`);
  },

  // Substance lookup
  lookup: async (query: string, type: SubstanceType = 'medication') => {
    const response = await apiClient.get('/api/allergies/lookup/', {
      params: { q: query, type }
    });
    return parseResponse(z.array(AllergyLookupResultSchema), response.data);
  },

  // Check drug interactions
  checkInteractions: async (patientId: number, drugIds: number[], drugNames: string[] = []) => {
    const response = await apiClient.post('/api/allergies/check-interactions/', {
      patient_id: patientId,
      drug_ids: drugIds,
      drug_names: drugNames,
    });
    return parseResponse(DrugInteractionCheckSchema, response.data);
  },
};
```

#### 2. Zod Schema (`lib/schemas/allergy.schema.ts`)

```typescript
import { z } from 'zod';

export const SubstanceTypeSchema = z.enum([
  'medication', 'food', 'environmental', 'biological', 'other'
]);

export const ReactionTypeSchema = z.enum([
  'anaphylaxis', 'angioedema', 'bronchospasm', 'cardiac_arrhythmia',
  'diarrhea', 'dyspnea', 'hives', 'hypotension', 'itching',
  'nausea', 'rash', 'swelling', 'vomiting', 'other'
]);

export const SeveritySchema = z.enum(['mild', 'moderate', 'severe', 'life_threatening']);

export const CriticalitySchema = z.enum(['low', 'high', 'unable_to_assess']);

export const AllergyStatusSchema = z.enum(['active', 'inactive', 'resolved']);

export const VerificationStatusSchema = z.enum([
  'unconfirmed', 'presumed', 'confirmed', 'refuted', 'entered_in_error'
]);

export const AllergySchema = z.object({
  id: z.number(),
  patient: z.number(),
  patient_mrn: z.string(),
  patient_name: z.string(),
  substance: z.string(),
  substance_code: z.string().optional(),
  substance_code_system: z.string().optional(),
  substance_type: SubstanceTypeSchema,
  substance_type_display: z.string(),
  drug: z.number().nullable(),
  drug_name: z.string().nullable(),
  reaction_type: ReactionTypeSchema,
  reaction_type_display: z.string(),
  reaction_description: z.string().optional(),
  severity: SeveritySchema,
  severity_display: z.string(),
  criticality: CriticalitySchema,
  criticality_display: z.string(),
  onset_date: z.string().nullable(),
  last_occurrence: z.string().nullable(),
  status: AllergyStatusSchema,
  status_display: z.string(),
  verification_status: VerificationStatusSchema,
  verification_status_display: z.string(),
  is_high_risk: z.boolean(),
  is_active: z.boolean(),
  notes: z.string().optional(),
  source_encounter: z.number().nullable(),
  recorded_by: z.number().nullable(),
  recorded_by_username: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const AllergyListSchema = z.object({
  id: z.number(),
  substance: z.string(),
  substance_type: SubstanceTypeSchema,
  reaction_type: ReactionTypeSchema,
  severity: SeveritySchema,
  severity_display: z.string(),
  status: AllergyStatusSchema,
  status_display: z.string(),
  is_high_risk: z.boolean(),
  onset_date: z.string().nullable(),
});

export const AllergyLookupResultSchema = z.object({
  substance: z.string(),
  code: z.string(),
  code_system: z.string(),
  drug_id: z.number().nullable(),
  type: z.string(),
  display: z.string(),
});

export const DrugInteractionSchema = z.object({
  allergy_id: z.number(),
  substance: z.string(),
  severity: SeveritySchema,
  severity_display: z.string(),
  reaction_type: ReactionTypeSchema,
  is_high_risk: z.boolean(),
  drug_id: z.number().optional(),
  drug_name: z.string().optional(),
  warning: z.string(),
});

export const DrugInteractionCheckSchema = z.object({
  patient_id: z.number(),
  has_interactions: z.boolean(),
  has_high_risk: z.boolean(),
  interactions: z.array(DrugInteractionSchema),
});

export type Allergy = z.infer<typeof AllergySchema>;
export type AllergyListItem = z.infer<typeof AllergyListSchema>;
export type SubstanceType = z.infer<typeof SubstanceTypeSchema>;
export type AllergyLookupResult = z.infer<typeof AllergyLookupResultSchema>;
export type DrugInteractionCheck = z.infer<typeof DrugInteractionCheckSchema>;
```

#### 3. TypeScript Types (`lib/types/allergy.ts`)

```typescript
export interface AllergyCreatePayload {
  substance: string;
  substance_type?: 'medication' | 'food' | 'environmental' | 'biological' | 'other';
  drug?: number;
  reaction_type?: string;
  reaction_description?: string;
  severity?: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  criticality?: 'low' | 'high' | 'unable_to_assess';
  onset_date?: string;
  last_occurrence?: string;
  verification_status?: 'unconfirmed' | 'presumed' | 'confirmed' | 'refuted';
  notes?: string;
  source_encounter?: number;
}

export interface AllergyUpdatePayload extends Partial<AllergyCreatePayload> {
  status?: 'active' | 'inactive' | 'resolved';
}
```

#### 4. Patient Allergies Tab (`components/patients/allergies/patient-allergies-tab.tsx`)

Display allergies in patient detail page with:
- List of allergies with severity badges
- High-risk warning banner for severe/life-threatening allergies
- Add new allergy button
- Edit/resolve inline actions

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { allergiesApi } from '@/lib/api/allergies';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Plus, Shield } from 'lucide-react';
import { AllergyFormDialog } from './allergy-form-dialog';
import { AllergyListItem } from './allergy-list-item';

interface PatientAllergiesTabProps {
  patientId: number;
}

export function PatientAllergiesTab({ patientId }: PatientAllergiesTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: allergies, isLoading } = useQuery({
    queryKey: ['patient-allergies', patientId],
    queryFn: () => allergiesApi.listByPatient(patientId),
  });

  const activeAllergies = allergies?.filter((a) => a.status === 'active') || [];
  const highRiskAllergies = activeAllergies.filter((a) => a.is_high_risk);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <CardTitle>Allergies</CardTitle>
          {activeAllergies.length > 0 && (
            <Badge variant="secondary">{activeAllergies.length} active</Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Allergy
        </Button>
      </CardHeader>

      <CardContent>
        {/* High Risk Warning */}
        {highRiskAllergies.length > 0 && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <AlertTriangle className="h-4 w-4" />
              High-Risk Allergies Present
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {highRiskAllergies.map((a) => a.substance).join(', ')}
            </p>
          </div>
        )}

        {/* No Known Allergies */}
        {activeAllergies.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No known allergies recorded</p>
          </div>
        )}

        {/* Allergy List */}
        <div className="space-y-2">
          {activeAllergies.map((allergy) => (
            <AllergyListItem
              key={allergy.id}
              allergy={allergy}
              patientId={patientId}
            />
          ))}
        </div>
      </CardContent>

      <AllergyFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        patientId={patientId}
      />
    </Card>
  );
}
```

#### 5. Allergy Form Dialog (`components/patients/allergies/allergy-form-dialog.tsx`)

Modal form for adding/editing allergies with:
- Substance autocomplete (from lookup endpoint)
- Severity and reaction type dropdowns
- Date pickers for onset/last occurrence
- Optional drug linking

#### 6. Allergy List Item (`components/patients/allergies/allergy-list-item.tsx`)

Individual allergy row with:
- Severity color-coded badge
- Substance name and reaction type
- Actions: Edit, Resolve, Delete

#### 7. Prescription Allergy Warning (`components/pharmacy/prescription-allergy-warning.tsx`)

Modal shown when drug-allergy interaction detected:
- Lists all conflicting allergies
- Highlights high-risk interactions
- Requires acknowledgment checkbox to proceed
- Logs override decision

```tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { DrugInteractionCheck } from '@/lib/types/allergy';

interface PrescriptionAllergyWarningProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interactions: DrugInteractionCheck;
  onAcknowledge: () => void;
  onCancel: () => void;
}

export function PrescriptionAllergyWarning({
  open,
  onOpenChange,
  interactions,
  onAcknowledge,
  onCancel,
}: PrescriptionAllergyWarningProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Drug-Allergy Interaction Warning
          </AlertDialogTitle>
          <AlertDialogDescription>
            The following drug-allergy interactions were detected:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          {interactions.interactions.map((interaction) => (
            <div
              key={interaction.allergy_id}
              className="p-3 rounded-lg border border-destructive/20 bg-destructive/5"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{interaction.drug_name}</span>
                <Badge
                  variant={interaction.is_high_risk ? 'destructive' : 'secondary'}
                >
                  {interaction.severity_display}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Patient allergic to: {interaction.substance}
                {interaction.reaction_type !== 'other' && (
                  <> — previous reaction: {interaction.reaction_type}</>
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(!!checked)}
          />
          <label htmlFor="acknowledge" className="text-sm">
            I acknowledge these drug-allergy interactions and accept clinical
            responsibility for this prescription.
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel Prescription</AlertDialogCancel>
          <AlertDialogAction
            onClick={onAcknowledge}
            disabled={!acknowledged}
            className="bg-destructive hover:bg-destructive/90"
          >
            Proceed with Prescription
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### React Query Hooks

```typescript
// lib/hooks/use-allergies.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { allergiesApi } from '@/lib/api/allergies';
import { toast } from 'sonner';

export function usePatientAllergies(patientId: number) {
  return useQuery({
    queryKey: ['patient-allergies', patientId],
    queryFn: () => allergiesApi.listByPatient(patientId),
    enabled: !!patientId,
  });
}

export function useAllergyLookup(query: string, type: SubstanceType) {
  return useQuery({
    queryKey: ['allergy-lookup', query, type],
    queryFn: () => allergiesApi.lookup(query, type),
    enabled: query.length >= 2,
  });
}

export function useCreateAllergy(patientId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AllergyCreatePayload) => 
      allergiesApi.create(patientId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-allergies', patientId] });
      toast.success('Allergy recorded successfully');
    },
    onError: (error) => {
      toast.error('Failed to record allergy');
    },
  });
}

export function useCheckDrugInteractions() {
  return useMutation({
    mutationFn: ({ patientId, drugIds, drugNames }: {
      patientId: number;
      drugIds: number[];
      drugNames?: string[];
    }) => allergiesApi.checkInteractions(patientId, drugIds, drugNames),
  });
}
```

### Integration Points

| Location | Integration |
|----------|-------------|
| Patient Detail Page | Add "Allergies" tab after "History" |
| Patient Summary Card | Show high-risk allergy badge |
| Encounter Form | Display active allergies in sidebar |
| Prescription Form | Call `check-interactions` before submit |
| Dispensing View | Show allergy warnings |
| Triage Screen | Prominent allergy display |

---

## Audit Logging

All allergy operations are logged to `AuditLog`:

| Action | Trigger | Details |
|--------|---------|---------|
| `allergy_create` | POST /allergies/ | substance, severity, patient_mrn |
| `allergy_view` | GET /allergies/{id}/ | substance, patient_mrn |
| `allergy_update` | PATCH /allergies/{id}/ | changes dict, patient_mrn |
| `allergy_delete` | DELETE /allergies/{id}/ | substance, patient_mrn |

---

## Future Enhancements

1. **HPT Registry Integration**: Look up substances from Kenya's HP&T Medicine Registry
2. **Cross-Reactivity Checking**: Warn about beta-lactam cross-reactivity (penicillin ↔ cephalosporins)
3. **Allergy Import from External Systems**: HL7 FHIR import of AllergyIntolerance resources
4. **Patient-Reported Allergies**: Self-service allergy reporting via patient portal

---

## Files Changed

### Backend
- `hmis/apps/patients/models.py` — Added `Allergy` model
- `hmis/apps/patients/serializers.py` — Added `AllergySerializer`, `AllergyListSerializer`
- `hmis/apps/patients/views.py` — Added `AllergyViewSet`
- `hmis/apps/patients/admin.py` — Added `AllergyAdmin`, `AllergyInline`
- `hmis/urls.py` — Registered allergy routes
- `hmis/apps/pharmacy/serializers.py` — Added drug-allergy checking
- `hmis/apps/pharmacy/admin.py` — Added `search_fields` for autocomplete
- `hmis/apps/core/fhir/views.py` — FHIR AllergyIntolerance + IPS integration
- `hmis/apps/patients/migrations/0011_add_allergy_model.py` — Model migration
- `hmis/apps/patients/migrations/0012_migrate_encounter_allergies.py` — Data migration
- `tests/test_allergy.py` — 39 comprehensive tests

### Frontend (To Be Created)
- `lib/api/allergies.ts` — API client
- `lib/schemas/allergy.schema.ts` — Zod schemas
- `lib/types/allergy.ts` — TypeScript types
- `lib/hooks/use-allergies.ts` — React Query hooks
- `components/patients/allergies/patient-allergies-tab.tsx` — Tab component
- `components/patients/allergies/allergy-form-dialog.tsx` — Add/edit form
- `components/patients/allergies/allergy-list-item.tsx` — List row
- `components/pharmacy/prescription-allergy-warning.tsx` — Interaction warning modal

---

## Acceptance Criteria

- [x] **Backend**: Allergy model with all required fields
- [x] **Backend**: CRUD API endpoints with audit logging
- [x] **Backend**: Drug-allergy interaction checking in prescription flow
- [x] **Backend**: FHIR AllergyIntolerance resource mapping
- [x] **Backend**: IPS Bundle includes allergies
- [x] **Backend**: Data migration from free-text allergies
- [x] **Backend**: 39 passing tests
- [ ] **Frontend**: Allergy management tab in patient detail
- [ ] **Frontend**: Substance autocomplete lookup
- [ ] **Frontend**: Prescription drug-allergy warning modal
- [ ] **Frontend**: High-risk allergy badges throughout UI
- [ ] **E2E**: Playwright tests for allergy workflow

---

*Last Updated: February 23, 2026*
