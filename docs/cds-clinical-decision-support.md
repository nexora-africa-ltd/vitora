# Clinical Decision Support (CDS) Module

> **DHA Gap #25** — Evidence-Based Clinical Decision Support Engine  
> **Status**: ✅ Complete  
> **Module**: `backend/hmis/apps/cds/` + `web-app/app/(dashboard)/cds/`

---

## Overview

The CDS module provides a **rule-driven, advisory-only** clinical decision support engine for Vitora HMIS. It evaluates JSON-defined clinical rules against patient context (vitals, medications, allergies, lab results) and generates tiered alerts that advise clinicians without blocking their workflow.

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Advisory-only** | Alerts inform but never prevent clinical actions (except flagging on finalize) |
| **Evidence-based** | Every rule has an evidence level (A–D) and clinical references |
| **Tiered display** | CRITICAL → interruptive dialog; HIGH → prominent inline; MEDIUM/LOW → collapsible |
| **Auditable** | Every alert action (accept, override, dismiss) is logged with user + timestamp |
| **Data-driven** | Rules stored as JSON in `data/cds_rules.json`, loaded via management command |
| **Auto-evaluated** | Rules fire automatically on encounter save via Django signals |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CDS Architecture                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐    │
│  │ cds_rules.json│──▶│ seed_cds_rules│──▶│  CDSRule (DB Model)   │    │
│  │  (data/)      │   │ (mgmt cmd)   │   │  status, condition,   │    │
│  └──────────────┘   └──────────────┘   │  priority, evidence   │    │
│                                         └───────────┬───────────┘    │
│                                                     │                │
│  ┌──────────────┐   ┌──────────────┐               │                │
│  │  Encounter   │──▶│ post_save    │──▶  ┌─────────▼────────┐      │
│  │  (save)      │   │ signal       │     │  CDS Engine       │      │
│  └──────────────┘   └──────────────┘     │  evaluate_rules() │      │
│                                           └─────────┬────────┘      │
│                                                     │                │
│                                           ┌─────────▼────────┐      │
│                                           │   CDSAlert        │      │
│                                           │   (DB Model)      │      │
│                                           └─────────┬────────┘      │
│                                                     │                │
│  ┌──────────────────────────────────────────────────┼───────────┐   │
│  │                   Frontend Integration           │           │   │
│  │                                                  │           │   │
│  │  ┌────────────────┐  ┌────────────┐  ┌──────────▼────────┐ │   │
│  │  │ Vitals Display │  │ Alerts     │  │  Critical Dialog  │ │   │
│  │  │ (inline icons) │  │ Panel      │  │  (on finalize)    │ │   │
│  │  └────────────────┘  └────────────┘  └───────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Backend

### Models

#### `CDSRule`

Defines a clinical decision support rule with JSON-based condition logic.

| Field | Type | Description |
|-------|------|-------------|
| `code` | `CharField(50)` | Unique rule identifier (e.g., `VITAL-SPO2-LOW`) |
| `name` | `CharField(255)` | Human-readable name |
| `description` | `TextField` | Detailed description |
| `category` | `CharField` | One of: `DRUG_ALLERGY`, `DRUG_DRUG`, `CRITICAL_LAB`, `VITAL_SIGN`, `GUIDELINE`, `PREVENTIVE`, `DOSAGE` |
| `priority` | `CharField` | One of: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO` |
| `evidence_level` | `CharField` | One of: `A` (strong), `B` (moderate), `C` (limited), `D` (expert consensus) |
| `status` | `CharField` | Lifecycle: `DRAFT` → `ACTIVE` → `INACTIVE` → `RETIRED` |
| `condition` | `JSONField` | Rule logic (see [Condition Format](#condition-format)) |
| `action_type` | `CharField` | One of: `ALERT`, `CONTRAINDICATE`, `WARN`, `SUGGEST`, `REQUIRE`, `INFORM` |
| `action_message` | `TextField` | Message template with `{variable}` placeholders |
| `suggestion` | `TextField` | Recommended clinical action |
| `references` | `JSONField` | List of clinical guideline references |
| `metadata` | `JSONField` | Additional configuration |

**State transitions:**

```
DRAFT ──activate()──▶ ACTIVE ──deactivate()──▶ INACTIVE
                        │                         │
                        └──retire()──▶ RETIRED ◀──┘
```

**Computed properties:**
- `is_active` — Whether rule is in ACTIVE status
- `trigger_count` — Total alerts generated by this rule
- `override_rate` — Percentage of alerts that were overridden

#### `CDSAlert`

A generated alert instance from rule evaluation.

| Field | Type | Description |
|-------|------|-------------|
| `rule` | `FK(CDSRule)` | Source rule |
| `patient` | `FK(Patient)` | Target patient |
| `encounter` | `FK(Encounter)` | Encounter context (nullable) |
| `priority` | `CharField` | Copied from rule at trigger time |
| `status` | `CharField` | `PENDING` → one of: `ACKNOWLEDGED`, `ACCEPTED`, `OVERRIDDEN`, `DISMISSED`, `AUTO_RESOLVED` |
| `message` | `TextField` | Rendered alert message |
| `suggestion` | `TextField` | Recommended action (from rule) |
| `details` | `JSONField` | Evaluation context (values that triggered) |
| `override_reason` | `TextField` | Clinical rationale if overridden |
| `resolved_by` | `FK(User)` | Who resolved the alert |
| `resolved_at` | `DateTimeField` | When resolved |
| `triggered_by` | `FK(User)` | Whose action triggered the alert |

**Alert lifecycle:**

```
                    ┌─▶ ACKNOWLEDGED
                    │
PENDING ──resolve──┼─▶ ACCEPTED
                    │
                    ├─▶ OVERRIDDEN (requires reason, min 10 chars)
                    │
                    ├─▶ DISMISSED
                    │
                    └─▶ AUTO_RESOLVED (system — condition no longer applies)
```

---

### CDS Engine (`engine.py`)

The engine evaluates rules against an `EvaluationContext` dataclass:

```python
@dataclass
class EvaluationContext:
    patient_id: int
    encounter_id: int | None = None
    # Vitals
    temperature: Decimal | None = None
    pulse: int | None = None
    systolic_bp: int | None = None
    diastolic_bp: int | None = None
    respiratory_rate: int | None = None
    spo2: Decimal | None = None
    weight: Decimal | None = None
    height: Decimal | None = None
    # Patient info
    patient_age_years: int | None = None
    patient_gender: str | None = None
    # Medications & allergies
    allergy_substances: list[str]
    current_medications: list[str]
    prescribing_drug_name: str | None = None
    # Lab results
    lab_results: list[dict]  # [{test_name, value, unit}]
```

**Key functions:**

| Function | Description |
|----------|-------------|
| `evaluate_rule(rule, context)` | Evaluate a single rule → `EvaluationResult` |
| `evaluate_rules(rules, context)` | Evaluate multiple rules → list of triggered results |
| `build_encounter_context(encounter)` | Build context from an Encounter model instance |

#### Condition Format

Rules use a JSON `condition` object with a `type` field that selects the evaluator:

**`vital_range`** — Vital sign threshold checks:
```json
{
  "type": "vital_range",
  "vital": "spo2",
  "min": 95,
  "min_label": "Hypoxemia"
}
```
Supported vitals: `temperature`, `pulse`, `spo2`, `systolic_bp`, `diastolic_bp`, `respiratory_rate`, `weight`, `height`

**`drug_allergy`** — Drug-allergy interaction:
```json
{
  "type": "drug_allergy",
  "substance": "penicillin",
  "cross_reactive": ["amoxicillin", "ampicillin"]
}
```

**`drug_drug`** — Drug-drug interaction:
```json
{
  "type": "drug_drug",
  "drug_a": "warfarin",
  "drug_b": "aspirin",
  "severity": "major"
}
```

**`lab_range`** — Critical lab value alerts:
```json
{
  "type": "lab_range",
  "test_name": "potassium",
  "critical_low": 2.5,
  "critical_high": 6.5,
  "unit": "mmol/L"
}
```

**`custom`** — Extensible custom logic (evaluated via `metadata`).

#### Message Templates

`action_message` supports `{variable}` placeholders. Available variables depend on the rule type:

- **vital_range**: `{vital}`, `{value}`, `{threshold}`, `{label}`, `{direction}`
- **drug_allergy**: `{allergy}`, `{prescribing_drug}`, `{substance}`, `{medication}`
- **drug_drug**: `{drug_a}`, `{drug_b}`, `{severity}`
- **lab_range**: `{test_name}`, `{value}`, `{threshold}`, `{unit}`, `{direction}`

---

### Auto-Evaluation via Signals

The `post_save` signal on `Encounter` automatically triggers CDS evaluation:

```python
# hmis/apps/cds/signals.py
@receiver(post_save, sender="encounters.Encounter")
def evaluate_cds_on_encounter_save(sender, instance, created, **kwargs):
    # 1. Get all ACTIVE rules
    # 2. Build EvaluationContext from the encounter
    # 3. Evaluate rules
    # 4. Create CDSAlert for each triggered rule (if not already pending)
```

**Deduplication**: If a `PENDING` alert already exists for the same rule + patient, no duplicate is created.

---

### Seed Data

Rules are defined in `backend/data/cds_rules.json` and loaded via:

```bash
cd backend
poetry run python manage.py seed_cds_rules
```

#### Bundled Rules (19 rules)

| Code | Name | Category | Priority |
|------|------|----------|----------|
| `VITAL-TEMP-HIGH` | High Temperature (Fever) | VITAL_SIGN | HIGH |
| `VITAL-TEMP-LOW` | Low Temperature (Hypothermia) | VITAL_SIGN | HIGH |
| `VITAL-SPO2-LOW` | Low Oxygen Saturation | VITAL_SIGN | CRITICAL |
| `VITAL-PULSE-HIGH` | Tachycardia | VITAL_SIGN | HIGH |
| `VITAL-PULSE-LOW` | Bradycardia | VITAL_SIGN | MEDIUM |
| `VITAL-BP-SYS-HIGH` | Hypertension | VITAL_SIGN | MEDIUM |
| `VITAL-BP-SYS-CRISIS` | Hypertensive Crisis | VITAL_SIGN | CRITICAL |
| `VITAL-RR-HIGH` | Tachypnea | VITAL_SIGN | HIGH |
| `DRUG-ALLERGY-001` | Generic Drug-Allergy Check | DRUG_ALLERGY | CRITICAL |
| `DRUG-ALLERGY-PEN` | Penicillin Allergy/Cross-Reactivity | DRUG_ALLERGY | CRITICAL |
| `DDI-WARF-ASP` | Warfarin + Aspirin Interaction | DRUG_DRUG | HIGH |
| `DDI-METRO-ALCO` | Metronidazole + Alcohol Warning | DRUG_DRUG | MEDIUM |
| `DDI-ACE-POTASSIUM` | ACE Inhibitor + Potassium | DRUG_DRUG | MEDIUM |
| `LAB-K-CRIT` | Critical Potassium | CRITICAL_LAB | CRITICAL |
| `LAB-NA-CRIT` | Critical Sodium | CRITICAL_LAB | CRITICAL |
| `LAB-GLU-CRIT-LOW` | Critical Hypoglycemia | CRITICAL_LAB | CRITICAL |
| `LAB-GLU-CRIT-HIGH` | Critical Hyperglycemia | CRITICAL_LAB | HIGH |
| `LAB-HB-CRIT-LOW` | Critical Anemia | CRITICAL_LAB | CRITICAL |
| `LAB-CREAT-HIGH` | Elevated Creatinine | CRITICAL_LAB | HIGH |

#### Adding Custom Rules

Add a new entry to `data/cds_rules.json`:

```json
{
  "code": "VITAL-HR-PEDI-HIGH",
  "name": "Pediatric Tachycardia",
  "description": "Heart rate >160 bpm in children under 5.",
  "category": "VITAL_SIGN",
  "priority": "HIGH",
  "evidence_level": "B",
  "action_type": "ALERT",
  "action_message": "⚠️ Pediatric tachycardia: HR {value} bpm (threshold: >{threshold} bpm).",
  "suggestion": "Assess for dehydration, fever, pain. Consider fluid resuscitation.",
  "condition": {
    "type": "vital_range",
    "vital": "pulse",
    "max": 160,
    "max_label": "Pediatric tachycardia"
  },
  "references": ["Kenya Paediatric Guidelines 2023"]
}
```

Then re-run: `poetry run python manage.py seed_cds_rules`

The seed command uses upsert logic — existing rules are updated, new rules are created, nothing is deleted.

---

### API Endpoints

#### Rules

```
GET    /api/cds/rules/                   # List rules (filterable by category, priority, status)
POST   /api/cds/rules/                   # Create rule (DRAFT status)
GET    /api/cds/rules/{id}/              # Rule detail
PATCH  /api/cds/rules/{id}/              # Update rule
DELETE /api/cds/rules/{id}/              # Delete rule

POST   /api/cds/rules/{id}/activate/     # DRAFT/INACTIVE → ACTIVE
POST   /api/cds/rules/{id}/deactivate/   # ACTIVE → INACTIVE
POST   /api/cds/rules/{id}/retire/       # Any → RETIRED
POST   /api/cds/rules/{id}/evaluate/     # Evaluate rule against an encounter
         Body: { "encounter_id": 42 }
```

#### Alerts

```
GET    /api/cds/alerts/                  # List alerts (filterable by status, priority, patient, encounter)
GET    /api/cds/alerts/{id}/             # Alert detail

POST   /api/cds/alerts/{id}/acknowledge/ # Mark as seen
POST   /api/cds/alerts/{id}/accept/      # Accept recommendation
POST   /api/cds/alerts/{id}/override/    # Override with reason
         Body: { "reason": "Clinical rationale (min 10 chars)" }
POST   /api/cds/alerts/{id}/dismiss/     # Dismiss

GET    /api/cds/alerts/pending/          # Pending alerts (filterable by patient, encounter)
POST   /api/cds/alerts/evaluate_encounter/  # Manually trigger evaluation
         Body: { "encounter_id": 42 }
GET    /api/cds/alerts/dashboard/        # Dashboard statistics
```

#### Inline Encounter Alerts

CDS alerts are also embedded in encounter detail responses:

```
GET    /api/encounters/{id}/

Response includes:
{
  ...encounter fields...,
  "cds_alerts": [
    {
      "id": 1,
      "rule_code": "VITAL-SPO2-LOW",
      "rule_name": "Low Oxygen Saturation",
      "priority": "CRITICAL",
      "status": "PENDING",
      "message": "🚨 Critical: SpO2 88% is below 95%.",
      "suggestion": "Administer supplemental oxygen...",
      "is_critical": true,
      "created_at": "2026-03-02T10:15:00Z"
    }
  ]
}
```

---

## Frontend Integration

The CDS module integrates into the encounter workflow at three tiers, following standard EHR UX patterns (similar to Epic/Cerner).

### Tier 1: Contextual Vitals Callouts

**Component**: `VitalsDisplay` (enhanced)  
**Location**: Encounter detail page, under each vital card  
**Trigger**: `cds_alerts` embedded in the encounter API response

When a CDS alert matches a vital sign (via rule code prefix like `VITAL-TEMP-*`, `VITAL-SPO2-*`), a small advisory line appears directly under the relevant vital card:

```
┌─────────────────────────┐
│ 🌡 Temperature          │
│    39.2 °C              │
│    Normal: 36.5-37.5    │
│ ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │
│ 🛡 High temp: 39.2°C   │
└─────────────────────────┘
```

The mapping from rule codes to vitals:

| Rule Code Prefix | Vital Field |
|-------------------|-------------|
| `VITAL-TEMP-*` | Temperature |
| `VITAL-SPO2-*` | SpO2 |
| `VITAL-PULSE-*` | Pulse |
| `VITAL-BP-*` | Blood Pressure |
| `VITAL-RR-*` | Respiratory Rate |

### Tier 2: CDS Alerts Panel

**Component**: `CDSAlertsPanel`  
**Location**: Encounter detail page (after vitals) + Encounter edit review page (step 7, before SOAP summary)

A collapsible card that groups alerts by priority:

```
┌─────────────────────────────────────────────────────┐
│ 🛡 Clinical Decision Support        [1 Critical]    │
├─────────────────────────────────────────────────────┤
│ 🔴 Critical: SpO2 88% is below 95%.                │
│    Administer supplemental oxygen...                 │
│                              [Accept] [Override]     │
│                                                      │
│ 🟡 High temperature: 39.2°C.                        │
│    Assess for infection source...                    │
│                              [Accept] [Override]     │
│                                                      │
│ ▼ Show 2 additional advisories                       │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- CRITICAL and HIGH alerts are always visible
- MEDIUM, LOW, and INFO alerts are collapsible (hidden by default)
- **Accept** — marks the alert as accepted (clinician agrees)
- **Override** — opens a dialog requiring a documented clinical rationale (min 10 characters, audited)
- **Dismiss** — available only for MEDIUM/LOW/INFO alerts
- Uses `SystemBanner` inline variant with semantic colors for each priority level
- Fetches alerts via `useEncounterCDSAlerts(encounterId)` React Query hook

### Tier 3: Interruptive Critical Dialog

**Component**: `CDSCriticalDialog`  
**Location**: Encounter edit review page — triggered when clicking "Finalize Encounter"

When the clinician attempts to finalize an encounter with unresolved CRITICAL or HIGH alerts, an interruptive dialog appears:

```
┌─────────────────────────────────────────────────────┐
│ 🛡 Unresolved CDS Alerts                            │
│                                                      │
│ This encounter has unresolved alerts that require    │
│ your attention before finalizing.                    │
│                                                      │
│ [1 Critical] [1 High]     Resolve all to proceed     │
│                                                      │
│ 🔴 Critical: SpO2 88% is below 95%.                 │
│    Administer oxygen...                              │
│                              [Accept] [Override]     │
│                                                      │
│ 🟡 High temperature: 39.2°C.                        │
│    Assess for infection...                           │
│                              [Accept] [Override]     │
│                                                      │
│                    [Cancel]  [Finalize Encounter]     │
│                               (disabled until all    │
│                                alerts resolved)      │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- The "Finalize Encounter" button is disabled until all CRITICAL/HIGH alerts are resolved
- Each alert can be accepted or overridden inline in the dialog
- Override requires a documented clinical rationale (same as panel)
- If no unresolved CRITICAL/HIGH alerts exist, finalization proceeds directly without the dialog
- MEDIUM/LOW/INFO alerts do not block finalization

### Standalone CDS Pages

| Route | Page | Description |
|-------|------|-------------|
| `/cds` | Dashboard | Overview stats: pending alerts by priority, trends, override rates |
| `/cds/rules` | Rules list | All rules with status badges, filters, search |
| `/cds/rules/[id]` | Rule detail | Full rule info, trigger history, override rate |
| `/cds/rules/new` | Create rule | Form for creating new rules (DRAFT → needs activation) |
| `/cds/alerts` | Alerts list | All alerts with filters by status, priority, patient |
| `/cds/alerts/[id]` | Alert detail | Alert info, resolution history, associated encounter |

### React Query Hooks

All hooks are in `lib/hooks/use-cds.ts`:

| Hook | Description |
|------|-------------|
| `useEncounterCDSAlerts(encounterId)` | Pending alerts for an encounter (30s stale time) |
| `useEvaluateEncounterCDS()` | Mutation to manually trigger rule evaluation |
| `useAcknowledgeCDSAlert()` | Mutation to acknowledge an alert |
| `useAcceptCDSAlert()` | Mutation to accept a recommendation |
| `useOverrideCDSAlert()` | Mutation to override with reason |
| `useDismissCDSAlert()` | Mutation to dismiss |

### API Client

All methods are in `lib/api/cds.ts` with Zod-validated responses:

```typescript
cdsApi.listRules(params?)        // Paginated list
cdsApi.getRule(id)               // Detail
cdsApi.createRule(data)          // Create
cdsApi.activateRule(id)          // Activate
cdsApi.evaluateRule(id, encId)   // Evaluate against encounter
cdsApi.listAlerts(params?)       // Paginated list
cdsApi.acknowledgeAlert(id)      // Acknowledge
cdsApi.acceptAlert(id)           // Accept
cdsApi.overrideAlert(id, reason) // Override
cdsApi.dismissAlert(id)          // Dismiss
cdsApi.getPendingAlerts(params?) // Pending alerts
cdsApi.evaluateEncounter(encId)  // Manual evaluation
cdsApi.getDashboard()            // Dashboard stats
```

---

## Workflow Integration Summary

```
Clinician creates/updates encounter
        │
        ▼
Django post_save signal fires
        │
        ▼
CDS Engine evaluates all ACTIVE rules
        │
        ▼
CDSAlert records created (PENDING)
        │
        ├──▶ Encounter detail page shows:
        │      • Vitals cards with inline CDS callouts (Tier 1)
        │      • CDS Alerts Panel below vitals (Tier 2)
        │
        └──▶ Encounter finalize (Step 7) checks:
               • No CRITICAL/HIGH unresolved? → Finalize directly
               • Has unresolved? → Show interruptive dialog (Tier 3)
                     │
                     ├── Accept each → alert resolved
                     ├── Override each → requires reason (audited)
                     └── All resolved → "Finalize" button enables
```

---

## Testing

The CDS module has **78 unit tests** covering:

- Rule model state transitions (activate, deactivate, retire)
- Rule computed properties (trigger_count, override_rate)
- Alert model state transitions (acknowledge, accept, override, dismiss)
- Alert computed properties (is_pending, is_critical, age_hours)
- Engine evaluation for all rule types (vital_range, drug_allergy, drug_drug, lab_range)
- Engine edge cases (missing values, invalid conditions, boundary thresholds)
- API CRUD operations for rules and alerts
- API custom actions (activate, override with reason, evaluate_encounter)
- Dashboard statistics endpoint
- Pending alerts filtering by patient/encounter
- Serializer validation (condition format, code uniqueness)

```bash
cd backend
poetry run pytest tests/test_cds.py -v --no-cov
```

---

## Files Reference

### Backend

| File | Description |
|------|-------------|
| `hmis/apps/cds/models.py` | CDSRule + CDSAlert models with TextChoices enums |
| `hmis/apps/cds/engine.py` | Rule evaluation engine with EvaluationContext |
| `hmis/apps/cds/views.py` | CDSRuleViewSet + CDSAlertViewSet with custom actions |
| `hmis/apps/cds/serializers.py` | Detail, list, create, action serializers |
| `hmis/apps/cds/signals.py` | Auto-evaluate on encounter save |
| `hmis/apps/cds/admin.py` | Admin with colored badges, fieldsets, filters |
| `hmis/apps/cds/urls.py` | Router registration |
| `hmis/apps/cds/management/commands/seed_cds_rules.py` | Load rules from JSON |
| `data/cds_rules.json` | 19 bundled clinical rules |
| `tests/test_cds.py` | 78 unit tests |

### Frontend

| File | Description |
|------|-------------|
| `lib/types/cds.ts` | TypeScript interfaces |
| `lib/schemas/cds.schema.ts` | Zod runtime validation schemas |
| `lib/api/cds.ts` | API client with `parseResponse()` |
| `lib/hooks/use-cds.ts` | React Query hooks |
| `components/encounters/cds-alerts-panel.tsx` | Tier 2 — Collapsible alerts panel |
| `components/encounters/cds-critical-dialog.tsx` | Tier 3 — Interruptive finalize dialog |
| `components/encounters/vitals-display.tsx` | Tier 1 — Enhanced with inline CDS callouts |
| `app/(dashboard)/cds/page.tsx` | Dashboard page |
| `app/(dashboard)/cds/rules/page.tsx` | Rules list page |
| `app/(dashboard)/cds/rules/[id]/page.tsx` | Rule detail page |
| `app/(dashboard)/cds/rules/new/page.tsx` | Create rule page |
| `app/(dashboard)/cds/alerts/page.tsx` | Alerts list page |
| `app/(dashboard)/cds/alerts/[id]/page.tsx` | Alert detail page |

---

## Configuration

### Environment Variables

No CDS-specific environment variables. The module uses the standard Django database and auth configuration.

### Seed Data

```bash
# Load bundled rules (idempotent — safe to re-run)
poetry run python manage.py seed_cds_rules
```

### Django Admin

CDS rules and alerts are manageable via Django admin at `/admin/cds/`:
- Color-coded status badges (ACTIVE=green, DRAFT=gray, RETIRED=red)
- Color-coded priority badges (CRITICAL=red, HIGH=amber, MEDIUM=blue)
- Filterable by category, priority, status
- Raw ID fields for FK lookups

---

*Last updated: March 2, 2026*
