# Terminology Strategy for Vitora HMIS

> **Created**: 2026-02-14  
> **Updated**: 2026-02-15  
> **Owner**: Engineering  
> **Status**: Phase T0 Implemented  
> **Scope**: Clinical coding, external system mappings, interoperability foundation

---

## 1) Executive Summary

Vitora HMIS needs a **terminology strategy** — not necessarily a separate terminology service (yet), but a coherent approach to:

1. **Internal clinical codes** — What codes does Vitora use for procedures, diagnoses, tests?
2. **External mappings** — How do we translate to/from NHIF/SHA tariffs, LOINC, LIS vendor codes, DHIS2?
3. **Interoperability** — How do we support HL7/FHIR code system URIs?

This document provides a **pragmatic, phased implementation plan** that delivers value incrementally without requiring a big-bang terminology service rewrite.

---

## 2) Kenya Context (Reality Check)

Kenya does **not** operationally depend on CPT (Current Procedural Terminology).

Instead, procedures and services derive from:
- Ministry of Health service lists
- **SHA/NHIF reimbursement tariffs** (primary billing driver)
- Facility-specific price catalogues
- **DHIS2 reporting categories** (aggregate indicators)

Therefore: **Vitora codes are the canonical internal language; external codes are mapped, not foundational.**

---

## 3) Current State in Vitora

| Domain | Model | Location | Status |
|--------|-------|----------|--------|
| Laboratory tests | `TestCatalog` | `hmis.apps.laboratory` | ✅ Has LOINC mapping fields |
| Diagnoses | `ICD10Code` | `hmis.apps.encounters` | ✅ Imported, searchable |
| LOINC codes | `LOINCCode` | `hmis.apps.laboratory` | ✅ Reference table |
| Procedures | None (implicit in billing items) | Scattered | ⚠️ Gap |
| External mappings | `ExternalCodeMapping` | `hmis.apps.core` | ✅ Implemented (Phase T0) |

**Key observation**: We now have `ExternalCodeMapping` as a **cross-system mapping layer** using GenericForeignKey.

---

## 4) Target Architecture (Incremental)

```
                    Vitora Clinical Apps
 ┌─────────────────────────────────────────────────────┐
 │ Encounters │ Laboratory │ Pharmacy │ Billing │ ...  │
 └──────────────────────┬──────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
     TestCatalog    ICD10Code    (Future: ProcedureCatalog)
          │             │             │
          └─────────────┬─────────────┘
                        │
                        ▼
              ExternalCodeMapping
        ┌───────────────────────────────┐
        │ code_system: "LIS_ACME"       │
        │ external_code: "12345"        │
        │ → TestCatalog(id=42)          │
        │                               │
        │ code_system: "SHA_TARIFF"     │
        │ external_code: "CONS-001"     │
        │ → ProcedureCatalog(id=7)      │
        └───────────────────────────────┘
                        │
                        ▼
         HL7/FHIR | SHA Claims | DHIS2 Export
```

**Key principle**: Internal models remain unchanged; `ExternalCodeMapping` provides the translation layer.

---

## 5) Phased Implementation Plan

### Phase T0 — External Code Mapping ✅ IMPLEMENTED

**ROI**: High (unblocks HL7/MLLP, SHA claims, LIS integrations)  
**Effort**: 2-4 hours  
**Risk**: None (additive, no refactoring)  
**Status**: ✅ Completed 2026-02-15

#### Implementation Summary

| Component | Location | Details |
|-----------|----------|---------|
| Model | `hmis/apps/core/models.py` | `ExternalCodeMapping` with GenericForeignKey |
| Migration | `core.0014_external_code_mapping` | Applied |
| Admin | `hmis/apps/core/admin.py` | Full CRUD with filters |
| Tests | `tests/test_external_code_mapping.py` | 20 tests (CRUD, resolve, reverse lookup) |

#### Key Features Implemented

- **GenericForeignKey**: Maps to any model (TestCatalog, ICD10Code, etc.)
- **`resolve(code_system, external_code)`**: Returns internal object or None
- **`resolve_or_raise(code_system, external_code)`**: Returns internal object or raises DoesNotExist
- **`get_mappings_for_object(obj)`**: Get all external codes for an internal entity
- **`get_external_code(obj, code_system)`**: Get specific external code
- **Unique constraint**: `(code_system, external_code)` ensures no duplicates
- **Soft deactivation**: `is_active` flag for retiring mappings without deletion

#### Usage Examples

```python
from hmis.apps.core.models import ExternalCodeMapping

# === LIS Result Import (HL7 ORU Parser) ===
# Resolve external LIS code to internal TestCatalog
test = ExternalCodeMapping.resolve("LIS_ACME", "12345")
if test is None:
    logger.warning("Unmapped LIS code: 12345 - queuing for review")
    UnmappedCodeQueue.objects.create(code_system="LIS_ACME", code="12345")
else:
    LabResult.objects.create(
        order_item=order_item,
        test=test,
        value=oru_message.get_value(),
        ...
    )

# === SHA Claim Export ===
# Get SHA tariff code for a diagnosis
sha_code = ExternalCodeMapping.get_external_code(diagnosis, "SHA_TARIFF_2025")
if sha_code:
    claim_bundle.add_diagnosis(code=sha_code, system="https://sha.go.ke/tariff/2025")
else:
    logger.warning(f"No SHA mapping for {diagnosis.code}, using ICD-10 directly")

# === Bulk Import Mappings ===
from django.contrib.contenttypes.models import ContentType
from hmis.apps.laboratory.models import TestCatalog

test = TestCatalog.objects.get(code="CBC")
content_type = ContentType.objects.get_for_model(test)

ExternalCodeMapping.objects.create(
    code_system="LIS_MINDRAY",
    external_code="MR_CBC_001",
    external_display="Complete Blood Count (Mindray)",
    content_type=content_type,
    object_id=test.pk,
    relationship="EQUIVALENT",
    notes="Mapped during Mindray BC-5800 integration",
)

# === Get All Mappings for an Entity ===
mappings = ExternalCodeMapping.get_mappings_for_object(test)
for m in mappings:
    print(f"{m.code_system}: {m.external_code}")
# Output:
# LIS_ACME: 12345
# LIS_MINDRAY: MR_CBC_001
# LOINC: 57021-8
```

**Deliverables**:
1. Add `ExternalCodeMapping` model to `hmis.apps.core`:

```python
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class ExternalCodeMapping(models.Model):
    """
    Maps external system codes to internal Vitora entities.
    
    Supports any model via GenericForeignKey (TestCatalog, ICD10Code, 
    future ProcedureCatalog, DrugCatalog, etc.)
    """
    
    # External system identifier
    code_system = models.CharField(
        max_length=100,
        help_text="External system ID, e.g., 'LIS_ACME', 'SHA_TARIFF', 'NHIF_2025', 'LOINC'"
    )
    external_code = models.CharField(
        max_length=100,
        help_text="Code in the external system"
    )
    external_display = models.CharField(
        max_length=255,
        blank=True,
        help_text="Display name in external system (for reference)"
    )
    
    # Internal Vitora entity (generic)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    internal_object = GenericForeignKey('content_type', 'object_id')
    
    # Mapping metadata
    relationship = models.CharField(
        max_length=20,
        choices=[
            ('EQUIVALENT', 'Equivalent'),
            ('BROADER', 'Broader'),
            ('NARROWER', 'Narrower'),
            ('RELATED', 'Related'),
        ],
        default='EQUIVALENT'
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['code_system', 'external_code']
        indexes = [
            models.Index(fields=['code_system', 'external_code']),
            models.Index(fields=['content_type', 'object_id']),
        ]
        verbose_name = 'External Code Mapping'
        verbose_name_plural = 'External Code Mappings'
    
    def __str__(self):
        return f"{self.code_system}:{self.external_code} → {self.internal_object}"
    
    @classmethod
    def resolve(cls, code_system: str, external_code: str):
        """
        Resolve an external code to its internal Vitora object.
        
        Returns the internal object or None if not mapped.
        """
        try:
            mapping = cls.objects.select_related('content_type').get(
                code_system=code_system,
                external_code=external_code,
                is_active=True
            )
            return mapping.internal_object
        except cls.DoesNotExist:
            return None
    
    @classmethod
    def resolve_or_raise(cls, code_system: str, external_code: str):
        """
        Resolve an external code or raise DoesNotExist.
        """
        mapping = cls.objects.select_related('content_type').get(
            code_system=code_system,
            external_code=external_code,
            is_active=True
        )
        return mapping.internal_object
```

2. Add Django Admin interface for mapping management
3. Add basic tests for CRUD and resolution
4. Document supported `code_system` values

#### Supported `code_system` Values

| Code System | Description | Target Models | Example External Code |
|-------------|-------------|---------------|----------------------|
| `LIS_<vendor>` | Laboratory Information System vendor codes | `TestCatalog` | `LIS_ACME:12345` |
| `SHA_TARIFF_<year>` | SHA (Social Health Authority) tariff codes | `ICD10Code`, `ProcedureCatalog` | `SHA_TARIFF_2025:SHA_A00` |
| `NHIF_<year>` | Legacy NHIF codes (pre-SHA) | `ICD10Code`, `ProcedureCatalog` | `NHIF_2024:NHF001` |
| `LOINC` | Logical Observation Identifiers Names and Codes | `TestCatalog` | `LOINC:2951-2` |
| `KHIS` | Kenya Health Information System (DHIS2) codes | `ICD10Code`, `TestCatalog` | `KHIS:DIAG_001` |
| `SNOMED_CT` | SNOMED Clinical Terms | `ICD10Code`, `ProcedureCatalog` | `SNOMED_CT:195967001` |
| `NDC` | National Drug Code (for pharmacy) | `DrugCatalog` | `NDC:12345-678-90` |
| `KEBS_DRUG` | Kenya Bureau of Standards drug codes | `DrugCatalog` | `KEBS_DRUG:KE001` |

**Naming Convention**:
- Use UPPERCASE with underscores
- Include version/year suffix when applicable (e.g., `SHA_TARIFF_2025`)
- Prefix vendor-specific codes with vendor identifier (e.g., `LIS_ACME`, `LIS_MINDRAY`)

**Usage example (Phase C HL7 parser)**:
```python
from hmis.apps.core.models import ExternalCodeMapping

# In HL7 ORU parser
external_test_code = oru_message.get_test_code()  # e.g., "12345"
lis_system = settings.HL7_LIS_CODE_SYSTEM  # e.g., "LIS_ACME"

test = ExternalCodeMapping.resolve(lis_system, external_test_code)
if test is None:
    logger.warning(f"Unmapped LIS code: {external_test_code}")
    # Handle gracefully (reject, queue for review, etc.)
else:
    # Create LabResult for this test
    LabResult.objects.create(order_item=item, ...)
```

---

### Phase T1 — Code System Registry (Post-Phase C)

**ROI**: Medium (enables self-documenting API, FHIR compliance)  
**Effort**: 4-8 hours  
**Risk**: Low

**Deliverables**:
1. Add `CodeSystem` model to track vocabularies:

```python
class CodeSystem(models.Model):
    """Registry of code systems used in Vitora."""
    
    slug = models.SlugField(unique=True)  # e.g., "vitora-lab", "icd-10", "loinc"
    name = models.CharField(max_length=100)
    uri = models.URLField(help_text="FHIR CodeSystem URI")
    version = models.CharField(max_length=50, blank=True)
    publisher = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    is_internal = models.BooleanField(default=False)  # Vitora-managed vs external
    is_active = models.BooleanField(default=True)
```

2. Pre-populate with:
   - `vitora-lab` → `https://vitora.health/fhir/CodeSystem/laboratory`
   - `icd-10` → `http://hl7.org/fhir/sid/icd-10`
   - `loinc` → `http://loinc.org`
   - `sha-tariff-2025` → `https://sha.go.ke/tariff/2025`

3. Link `ExternalCodeMapping.code_system` to `CodeSystem.slug`

4. Add `/api/terminology/codesystems/` endpoint (read-only)

**Benefit**: FHIR exports can reference proper CodeSystem URIs.

---

### Phase T2 — Search Optimization & Synonyms (Future)

**ROI**: High for UX (clinician autocomplete)  
**Effort**: 8-16 hours  
**Risk**: Low

**Deliverables**:
1. Add `ConceptAlias` model for synonyms:

```python
class ConceptAlias(models.Model):
    """Alternative names for concepts (synonyms, abbreviations, translations)."""
    
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    concept = GenericForeignKey()
    
    alias = models.CharField(max_length=255)
    alias_type = models.CharField(
        max_length=20,
        choices=[
            ('SYNONYM', 'Synonym'),
            ('ABBREVIATION', 'Abbreviation'),
            ('TRANSLATION', 'Translation'),
            ('DISPLAY', 'Display Name'),
        ]
    )
    language = models.CharField(max_length=10, default='en')  # e.g., 'sw' for Kiswahili
```

2. Update search endpoints to include aliases
3. Add Kiswahili translations for common tests/procedures

**Example**:
```
TestCatalog: code="CBC", name="Complete Blood Count"
Aliases: "FBC", "Hemogram", "Blood count", "Kipimo cha damu kamili"
```

---

### Phase T3 — Vitora Procedure Catalogue (Future)

**ROI**: Medium-High (standardized procedures for billing/reporting)  
**Effort**: 16-32 hours  
**Risk**: Medium (billing impact)

**Deliverables**:
1. Add `ProcedureCatalog` model (similar to `TestCatalog`):

```python
class ProcedureCatalog(models.Model):
    """Vitora procedure catalogue with semantic codes."""
    
    code = models.CharField(max_length=20, unique=True)  # VIT-PROC-001
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=50, blank=True)
    category = models.CharField(max_length=50)  # CONSULTATION, MINOR_SURGERY, etc.
    department = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    
    # Billing linkage (indirect)
    default_charge_item = models.ForeignKey('billing.ChargeItem', null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
```

2. Migrate existing implicit procedures from billing items
3. Add `ExternalCodeMapping` entries for SHA tariff codes
4. Update billing to reference `ProcedureCatalog`

**Code structure**:
| Code | Meaning |
|------|---------|
| VIT-CONS-OPD-001 | OPD Consultation |
| VIT-CONS-SPEC-001 | Specialist Consultation |
| VIT-SURG-MIN-001 | Minor Surgery - Wound Suturing |
| VIT-DIAG-XR-001 | Chest X-Ray |

---

### Phase T4 — FHIR Terminology Operations (Future)

**ROI**: Required for FHIR certification  
**Effort**: 24-40 hours  
**Risk**: Low (additive)

**Deliverables**:
1. `/fhir/CodeSystem/{id}` — FHIR CodeSystem resource
2. `/fhir/ValueSet/{id}` — FHIR ValueSet resource
3. `/fhir/ValueSet/$expand` — Expand a value set
4. `/fhir/CodeSystem/$validate-code` — Validate a code
5. `/fhir/ConceptMap/$translate` — Translate between systems

---

## 6) Decision: Separate Service vs Embedded Module?

**Recommendation: Embedded module for now, service later if needed.**

| Factor | Embedded (in Django) | Separate Service |
|--------|---------------------|------------------|
| Development speed | Fast | Slower |
| Deployment complexity | Same as HMIS | Additional infra |
| Data consistency | Transactional | Eventually consistent |
| Reuse across apps | Via API | Native |
| When to consider | < 100K codes | > 100K codes, multi-system |

**Current state**: Vitora has ~5K ICD-10 codes, ~500 lab tests, ~200 procedures. Embedded module is sufficient.

**Trigger for separate service**: If terminology needs to serve multiple applications (e.g., separate mobile app, analytics platform) with different access patterns.

---

## 7) Governance (Often Ignored, Always Important)

For a production HMIS, terminology changes must be governed:

1. **Clinical Lead** — Validates medical accuracy
2. **Informatician** — Ensures proper coding structure
3. **Billing Expert** — Validates tariff mappings
4. **Analyst** — Ensures reporting continuity

**Process**:
- New codes require approval before activation
- Retired codes are soft-deleted (`is_active=False`)
- Breaking changes (renames, merges) require migration plan

---

## 8) Priority Matrix (ROI vs Effort)

```
                    HIGH ROI
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
     │   T0: External  │   T2: Search    │
     │   Code Mapping  │   Synonyms      │
     │   ★★★★★         │   ★★★★          │
     │   (2-4 hrs)     │   (8-16 hrs)    │
     │                 │                 │
LOW ─┼─────────────────┼─────────────────┼─ HIGH
EFFORT                 │                EFFORT
     │                 │                 │
     │   T1: Code      │   T3: Procedure │
     │   System Reg    │   Catalogue     │
     │   ★★★           │   ★★★★          │
     │   (4-8 hrs)     │   (16-32 hrs)   │
     │                 │                 │
     └─────────────────┼─────────────────┘
                       │
                    LOW ROI
```

**Recommended order**: T0 → T1 → T2 → T3 → T4

---

## 9) Next Actions

1. **Immediate (Pre-Phase C)**: Implement `ExternalCodeMapping` model (Phase T0)
2. **Post-Phase C**: Add `CodeSystem` registry (Phase T1)
3. **Future**: Evaluate need for `ProcedureCatalog` based on billing requirements
4. **Future**: Add search synonyms when UX feedback indicates need

---

## 10) References

- `docs/laboratory-reporting-proposal.md` (Phase C HL7/MLLP integration)
- `docs/lis-evolution.md` (LIS architecture evolution, Specimen model, analyzer integration)
- `backend/hmis/apps/laboratory/models.py` (`TestCatalog` with LOINC fields)
- `backend/hmis/apps/encounters/models.py` (`ICD10Code`)
- HL7 FHIR Terminology Module: https://hl7.org/fhir/terminology-module.html
- Kenya SHA Tariff Schedule (external reference)
