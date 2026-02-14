# Laboratory Information System Evolution for Vitora HMIS

> **Created**: 2026-02-14  
> **Owner**: Engineering  
> **Status**: Planning  
> **Scope**: Laboratory module architecture evolution

---

## 1) Executive Summary

Vitora HMIS has a functional laboratory module (`hmis.apps.laboratory`) that supports clinical workflows today. This document outlines how to evolve it toward a **production-grade, specimen-centric LIS** without a disruptive rewrite.

**Key principle**: Evolve the existing Django app incrementally. A separate microservice is premature at current scale.

---

## 2) Current State Analysis

### 2.1 Existing Models

| Model | Purpose | lis.md Equivalent | Status |
|-------|---------|-------------------|--------|
| `TestCatalog` | Test master catalog | `test_concept` | ✅ Solid |
| `LOINCCode` | LOINC reference | Part of terminology | ✅ Exists |
| `LabOrder` | Order container | `lab_order` | ✅ Solid |
| `LabOrderItem` | Individual test requests | `lab_order_item` | ✅ Solid |
| `LabResult` | Test result (on item) | `observation` | ⚠️ Needs specimen link |
| `LabQueue` | Processing queue | `specimen` (partial) | ⚠️ Conflates specimen + queue |
| `LabResultTemplate` | Result templates | N/A | ✅ Vitora-specific |
| `LabResultAttachment` | PDF/scan uploads | Part of `diagnostic_report` | ✅ Exists |

### 2.2 Current Entity Relationships

```
Patient
   │
   ▼
Encounter
   │
   ▼
LabOrder ─────────────────────────┐
   │                              │
   ▼                              ▼
LabOrderItem(s) ──────────► LabQueue (1:1 with order)
   │                              │
   ▼                              │
LabResult ◄───────────────────────┘ (queue tracks sample/collection)
```

**Issues**:
1. `LabQueue` combines specimen tracking + processing workflow
2. Results attach to `LabOrderItem`, not specimens
3. No explicit `Specimen` entity
4. No analyzer run tracking
5. Single-stage verification

### 2.3 Current Workflow Strengths

- ✅ Order → Queue → Result pipeline works
- ✅ Sample ID tracking exists (`LabQueue.sample_id`)
- ✅ Collection timestamps exist (`LabQueue.collected_at`)
- ✅ WebSocket notifications for results
- ✅ Verification workflow (single-stage)
- ✅ Critical value flagging

---

## 3) Target Architecture (lis.md Vision)

### 3.1 Domain Model

```
Patient
   │
   ▼
Encounter
   │
   ▼
LabOrder ──────────────────► LabQueue (workflow state)
   │                              ▲
   │                              │
   ▼                              │
LabOrderItem(s)                   │
   │                              │
   ▼                              │
Specimen(s) ──────────────────────┘
   │
   ▼
LabResult (Observation)
   │ (optional)
   ▼
AnalyzerRun (machine data)
   │
   ▼
DiagnosticReport (final output)
```

### 3.2 Key Principles from lis.md

1. **Specimen-centric**: Results attach to specimens, not orders
2. **Barcode-first**: Specimen barcode is the operational key
3. **Audit-safe**: Full history of result modifications
4. **FHIR-mappable**: Specimen → `Specimen`, LabResult → `Observation`
5. **Analyzer-compatible**: Store raw instrument data

---

## 4) Gap Analysis

| lis.md Concept | Current Vitora | Gap | Priority |
|----------------|----------------|-----|----------|
| `Specimen` model | `LabQueue` has sample fields | Conflated; no true Specimen | **HIGH** |
| Results on specimens | Results on `LabOrderItem` | Structural mismatch | **HIGH** |
| Barcode as primary key | `sample_id` exists but secondary | Minor rename/promote | Low |
| Two-stage validation | Single `verified_by` | Add technical validation | Medium |
| `AnalyzerRun` tracking | None | Add when analyzers connected | Low |
| `DiagnosticReport` output | `LabResultAttachment` partial | Add report model | Medium |
| Rejection tracking | `rejection_reason` on queue | Works | None |
| FHIR resource mapping | None explicit | Future (Phase T4) | Low |

---

## 5) Incremental Evolution Plan

### Phase L0 — Extract Specimen Model (High Priority)

**Goal**: Create explicit `Specimen` entity; migrate specimen fields from `LabQueue`.

**Why this matters**:
- Labs operate on samples, not orders
- Multiple samples possible per order (not today, but real-world)
- Results should trace to the physical sample
- Barcode lookup must be fast

**Deliverables**:

```python
class Specimen(models.Model):
    """Physical laboratory sample."""
    
    # Identity
    barcode = models.CharField(max_length=50, unique=True, db_index=True)
    specimen_type = models.CharField(max_length=30, choices=SPECIMEN_TYPES)
    container_type = models.CharField(max_length=50, blank=True)
    
    # Linkage
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='specimens')
    order_items = models.ManyToManyField(LabOrderItem, related_name='specimens')
    
    # Collection
    collected_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    collected_at = models.DateTimeField(null=True, blank=True)
    collection_site = models.CharField(max_length=100, blank=True)  # e.g., "Left arm"
    
    # Lab receipt
    received_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    received_at = models.DateTimeField(null=True, blank=True)
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('PENDING', 'Pending Collection'),
            ('COLLECTED', 'Collected'),
            ('RECEIVED', 'Received at Lab'),
            ('PROCESSING', 'Processing'),
            ('REJECTED', 'Rejected'),
            ('STORED', 'Stored'),
            ('DISPOSED', 'Disposed'),
        ],
        default='PENDING'
    )
    rejection_reason = models.TextField(blank=True)
    
    # Storage (future: blood bank, pathology)
    storage_location = models.CharField(max_length=100, blank=True)
    storage_temperature = models.CharField(max_length=20, blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['barcode']),
            models.Index(fields=['status']),
            models.Index(fields=['collected_at']),
        ]
```

**Migration strategy**:
1. Create `Specimen` model
2. Auto-create `Specimen` when `LabQueue` entry is created (signal)
3. Copy existing `LabQueue.sample_id` → `Specimen.barcode`
4. Add `specimen` FK to `LabResult` (nullable initially)
5. Backfill `LabResult.specimen` from `LabQueue`
6. Eventually deprecate specimen fields on `LabQueue`

**LabQueue becomes pure workflow**:
```python
class LabQueue(models.Model):
    # Keep: queue_number, priority, queue_status, assigned_technician
    # Keep: processing_started_at, processing_completed_at, released_at
    # Keep: technician_notes
    # Deprecate: sample_id, sample_type, collected_at, collected_by (move to Specimen)
    
    specimen = models.OneToOneField(Specimen, null=True, on_delete=models.SET_NULL)
```

**Effort**: 8-16 hours  
**Risk**: Medium (data migration required)

---

### Phase L1 — Link Results to Specimens

**Goal**: Results attach to specimens, not just order items.

**Deliverables**:
1. Add `specimen` FK to `LabResult`:
   ```python
   class LabResult(models.Model):
       order_item = models.OneToOneField(LabOrderItem, ...)  # Keep for now
       specimen = models.ForeignKey(
           Specimen, 
           on_delete=models.PROTECT, 
           null=True,  # Nullable during migration
           related_name='results'
       )
   ```

2. Update result creation workflow to require specimen
3. Validation: `result.specimen` must be linked to `result.order_item.lab_order`

**Effort**: 4-8 hours  
**Risk**: Low (additive)

---

### Phase L2 — Two-Stage Validation

**Goal**: Support technical validation (lab tech) + clinical sign-off (pathologist).

**Deliverables**:
```python
class ResultValidation(models.Model):
    """Validation/approval record for a lab result."""
    
    result = models.ForeignKey(LabResult, on_delete=models.CASCADE, related_name='validations')
    validation_type = models.CharField(
        max_length=20,
        choices=[
            ('TECHNICAL', 'Technical Review'),
            ('CLINICAL', 'Clinical Sign-off'),
        ]
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ('APPROVED', 'Approved'),
            ('REJECTED', 'Rejected'),
            ('PENDING', 'Pending'),
        ]
    )
    validated_by = models.ForeignKey(User, on_delete=models.PROTECT)
    validated_at = models.DateTimeField(auto_now_add=True)
    comment = models.TextField(blank=True)
```

**Update workflow**:
- Technical validation by lab tech
- Clinical sign-off by pathologist (optional based on test complexity)
- Result `verification_status` derived from validations

**Effort**: 4-8 hours  
**Risk**: Low

---

### Phase L3 — Analyzer Integration Support

**Goal**: Track raw instrument data and machine runs.

**Deliverables**:
```python
class Instrument(models.Model):
    """Laboratory analyzer/instrument registry."""
    
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    manufacturer = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    
    # Integration config
    interface_type = models.CharField(
        max_length=20,
        choices=[
            ('HL7_MLLP', 'HL7 v2 over MLLP'),
            ('ASTM', 'ASTM/LIS2-A2'),
            ('FHIR', 'FHIR R4'),
            ('MANUAL', 'Manual Entry'),
        ],
        default='MANUAL'
    )
    integration_config = models.JSONField(default=dict)  # Host, port, etc.


class AnalyzerRun(models.Model):
    """Raw data from analyzer for a specimen."""
    
    specimen = models.ForeignKey(Specimen, on_delete=models.CASCADE, related_name='analyzer_runs')
    instrument = models.ForeignKey(Instrument, on_delete=models.PROTECT)
    operator = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    run_datetime = models.DateTimeField()
    
    # Raw data
    raw_message = models.TextField(help_text="Raw HL7/ASTM message")
    raw_payload = models.JSONField(default=dict, help_text="Parsed message data")
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('RECEIVED', 'Message Received'),
            ('PARSED', 'Parsed Successfully'),
            ('APPLIED', 'Results Applied'),
            ('ERROR', 'Parse Error'),
        ]
    )
    error_message = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
```

**This enables**:
- Audit trail: "Which machine produced this result?"
- Error recovery: Re-parse raw messages if needed
- Analytics: Machine performance, QC

**Effort**: 8-12 hours  
**Risk**: Low (additive, only needed when analyzers are connected)

---

### Phase L4 — Diagnostic Report Output

**Goal**: Generate formal patient-facing lab reports.

**Deliverables**:
```python
class DiagnosticReport(models.Model):
    """Final patient-facing lab report."""
    
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='reports')
    
    # Report identity
    report_number = models.CharField(max_length=30, unique=True)
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('DRAFT', 'Draft'),
            ('PRELIMINARY', 'Preliminary'),
            ('FINAL', 'Final'),
            ('AMENDED', 'Amended'),
            ('CANCELLED', 'Cancelled'),
        ]
    )
    
    # Sign-off
    issued_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    issued_at = models.DateTimeField(null=True, blank=True)
    
    # Content (optional: can generate from results)
    conclusion = models.TextField(blank=True)
    clinical_info = models.TextField(blank=True)
    
    # Output
    pdf_file = models.FileField(upload_to='lab_reports/', null=True, blank=True)
    
    # FHIR
    fhir_resource_id = models.CharField(max_length=100, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Effort**: 8-12 hours  
**Risk**: Low

---

## 6) Implementation Priority Matrix

```
                    HIGH VALUE
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
     │   L0: Specimen  │   L1: Results   │
     │   Model         │   → Specimens   │
     │   ★★★★★         │   ★★★★★         │
     │   (8-16 hrs)    │   (4-8 hrs)     │
     │                 │                 │
LOW ─┼─────────────────┼─────────────────┼─ HIGH
EFFORT                 │                EFFORT
     │                 │                 │
     │   L2: Two-stage │   L3: Analyzer  │
     │   Validation    │   Run Support   │
     │   ★★★           │   ★★★★          │
     │   (4-8 hrs)     │   (8-12 hrs)    │
     │                 │                 │
     └─────────────────┼─────────────────┘
                       │
                    LOW VALUE (for now)
```

**Recommended sequence**: L0 → L1 → L2 → (Phase C HL7/MLLP) → L3 → L4

---

## 7) Service Boundary Decision

### Now: Embedded Django App (Recommended)

```
vitora-backend/
└── hmis/
    └── apps/
        └── laboratory/        ← Evolution happens here
            ├── models.py      ← Add Specimen, AnalyzerRun, etc.
            ├── views.py
            ├── serializers.py
            └── services/
                ├── workflow.py
                ├── hl7_service.py
                └── mllp_client.py
```

**Why**:
- Transactional consistency with EMR (orders created in encounters)
- Simpler deployment (single Django app)
- Adequate for single-facility / small multi-facility
- ~500-1000 tests/day doesn't need microservice

### Future: Separate Service (When?)

Consider extraction when:
- Multiple analyzers producing high-throughput messages
- >10,000 tests/day sustained
- Need for independent scaling
- Multi-regional deployment with local LIS

Extraction pattern:
```
vitora-hmis (Django)
    │
    ├─── REST API ──────────────► vitora-lis (FastAPI/Django)
    │                                  │
    └─── Event Bus ◄───────────────────┘
         (lab.result.verified, etc.)
```

---

## 8) Integration with Terminology Strategy

The `Specimen` model integrates with terminology via:

1. **`specimen_type`**: Should reference `TestCatalog.specimen_type` choices
2. **Future**: Map specimen types to FHIR Specimen.type codes
3. **Future**: `ExternalCodeMapping` for analyzer-specific specimen identifiers

See: `docs/terminology-strategy.md` (Phase T0 — ExternalCodeMapping)

---

## 9) Relationship to Phase C (HL7/MLLP)

Phase C (HL7/MLLP external exchange) dependencies:

| Phase C Need | This Document's Solution |
|--------------|--------------------------|
| Map external test codes | `ExternalCodeMapping` (Phase T0) |
| Attach results to samples | `Specimen` model (Phase L0/L1) |
| Store raw HL7 messages | `AnalyzerRun.raw_message` (Phase L3) |
| Two-stage approval | `ResultValidation` (Phase L2) |

**Recommended order**:
1. Phase T0 (ExternalCodeMapping) — 2-4 hrs
2. Phase L0 (Specimen model) — 8-16 hrs
3. Phase L1 (Results → Specimens) — 4-8 hrs
4. Phase C (HL7/MLLP wiring) — existing plan
5. Phase L3 (AnalyzerRun) — when first analyzer connected

---

## 10) Migration Safety

### Data Migration Principles

1. **Additive first**: New models are nullable; old fields deprecated gradually
2. **Dual-write during transition**: Write to both old and new structures
3. **Read from new**: Once backfill complete, read from new models
4. **Sunset old**: Remove deprecated fields after verification period

### Rollback Strategy

Each phase should be reversible:
- Phase L0: `Specimen` can be deleted if signals disabled
- Phase L1: `LabResult.specimen` is nullable; fallback to order_item
- Phase L2: `ResultValidation` is separate table; existing verification untouched

---

## 11) Next Actions

| Action | Owner | Effort | Blocks |
|--------|-------|--------|--------|
| Implement `ExternalCodeMapping` (Phase T0) | Backend | 2-4 hrs | Phase C |
| Design `Specimen` model migration | Backend | 2 hrs | Phase L0 |
| Implement Phase L0 (Specimen) | Backend | 8-16 hrs | Phase L1 |
| Implement Phase L1 (Results → Specimens) | Backend | 4-8 hrs | Phase C accuracy |

---

## 12) References

- `docs/laboratory-reporting-proposal.md` — Phase C HL7/MLLP plan
- `docs/terminology-strategy.md` — External code mapping strategy
- `backend/hmis/apps/laboratory/models.py` — Current implementation
- HL7 FHIR Laboratory Module: https://hl7.org/fhir/diagnostics-module.html
