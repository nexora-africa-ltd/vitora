# Sprint 1.5-1.6 Track B: Lab Workflow Implementation Plan

**Sprint Duration**: Weeks 9-12 (Phase 1)  
**Status**: 🚧 IN PROGRESS  
**Target Date**: Q1 2026  
**Dependencies**: Sprint 1.3-1.4 Track B (LabOrder, LabResult foundation models) ✅

---

## Executive Summary

This document tracks the implementation of Sprint 1.5-1.6 Track B Lab Workflow completion for Vitora HMIS. The implementation follows Test-Driven Development (TDD) principles and is organized into 4 phases with ~112 total planned tests.

### Key Objectives
- ✅ Complete in-house lab queue management
- 🔄 External lab PDF requisition generation
- 🔄 Enhanced result entry with auto-flagging
- 🔄 Critical value notifications (in-app + email)
- 🔄 Scanned result attachment support
- 🔄 Lab analytics and reporting

---

## Overall Progress

| Phase | Status | Tests | Coverage |
|-------|--------|-------|----------|
| **Phase 1: Core Models** | 🚧 25% | 14/56 | In Progress |
| **Phase 2: Services** | ⏳ Pending | 0/32 | Not Started |
| **Phase 3: API Endpoints** | ⏳ Pending | 0/26 | Not Started |
| **Phase 4: Reports** | ⏳ Pending | 0/8 | Not Started |
| **TOTAL** | 🚧 12.5% | 14/112 | In Progress |

**Legend**: ✅ Complete | 🚧 In Progress | ⏳ Pending

---

## Phase 1: Core Models & Database (Weeks 9-10)

**Target**: 56 tests | **Status**: 14/56 complete (25%)

### 1.1 LabQueue Model ✅ COMPLETE

**Status**: ✅ All tests passing  
**Tests**: 14/14 passing  
**Files**:
- Model: `backend/hmis/apps/laboratory/models.py`
- Tests: `backend/tests/test_lab_queue.py`
- Migrations: `0003_labqueue.py`, `0004_alter_labqueue_options_and_more.py`

**Implementation Details**:
```python
class LabQueue(models.Model):
    """Lab queue entry for in-house processing."""
    
    # Auto-generated queue number: LAB-YYYYMMDD-XXXX
    queue_number = models.CharField(max_length=20, unique=True, editable=False)
    
    # Priority-based ordering (STAT=1, URGENT=2, ROUTINE=3)
    priority = models.CharField(max_length=20, choices=Priority.choices)
    priority_order = models.IntegerField(default=3, editable=False)
    
    # Workflow states
    queue_status = models.CharField(
        choices=QueueStatus.choices,
        default=QueueStatus.PENDING
    )
```

**Test Coverage**:
- [x] Queue entry creation
- [x] Auto-generated queue numbers (LAB-YYYYMMDD-XXXX format)
- [x] Queue number uniqueness
- [x] Priority ordering (STAT > URGENT > ROUTINE)
- [x] Technician assignment
- [x] Sample collection tracking
- [x] Sample ID/barcode recording
- [x] Processing workflow (PENDING → COLLECTED → PROCESSING → REVIEW → RELEASED)
- [x] Result release
- [x] Sample rejection with reason
- [x] Turnaround time calculation
- [x] Queue filtering by status
- [x] Queue filtering by technician

**Commits**:
- `cf6e35a` - feat: Implement LabQueue model with tests (Phase 1.1)

---

### 1.2 LabResultTemplate Model 🔄 NEXT

**Target**: 8 tests  
**Status**: ⏳ Not Started

**Purpose**: Store reference ranges for lab parameters by demographics (age, gender)

**Planned Implementation**:
```python
class LabResultTemplate(models.Model):
    """Template for lab test parameters with reference ranges."""
    
    # Test identification
    test_code = models.CharField(max_length=20)  # LOINC code
    test_name = models.CharField(max_length=200)
    
    # Parameter details
    parameter_code = models.CharField(max_length=20)
    parameter_name = models.CharField(max_length=100)
    unit = models.CharField(max_length=50)
    
    # Reference ranges by demographic (stored as JSON)
    reference_ranges = models.JSONField(default=dict)
    # Example: {
    #   "adult_male": {"low": 4.5, "high": 5.5},
    #   "adult_female": {"low": 4.0, "high": 5.0},
    #   "pediatric": {"low": 3.5, "high": 5.0}
    # }
    
    # Critical values
    critical_low = models.DecimalField(null=True, blank=True)
    critical_high = models.DecimalField(null=True, blank=True)
```

**Test Plan**:
- [ ] Template creation with ranges
- [ ] Get reference range for adult male
- [ ] Get reference range for adult female
- [ ] Get reference range for pediatric
- [ ] Fallback to default range if missing
- [ ] Critical value thresholds
- [ ] Panel parameters ordered by display_order
- [ ] Test code + parameter code uniqueness

**Data to Populate**:
- CBC (Complete Blood Count): WBC, RBC, HGB, HCT, PLT, MCV, MCH, MCHC
- Liver Function: ALT, AST, ALP, GGT, Bilirubin, Albumin
- Kidney Function: Creatinine, BUN, eGFR, Uric Acid
- Lipid Profile: Total Cholesterol, LDL, HDL, Triglycerides
- Blood Glucose: Fasting, Random, HbA1c
- Electrolytes: Na, K, Cl, CO2
- Thyroid: TSH, T3, T4
- Urinalysis: pH, Protein, Glucose, etc.

---

### 1.3 Extended LabResult Model 🔄 TODO

**Target**: 16 tests  
**Status**: ⏳ Not Started

**Purpose**: Enhance existing LabResult with flags, verification, and amendment tracking

**Planned Fields to Add**:
```python
class LabResult(models.Model):
    # Existing fields...
    
    # NEW: Enhanced flagging
    class Flag(models.TextChoices):
        NORMAL = 'N', 'Normal'
        LOW = 'L', 'Low'
        HIGH = 'H', 'High'
        CRITICAL_LOW = 'LL', 'Critical Low'
        CRITICAL_HIGH = 'HH', 'Critical High'
        ABNORMAL = 'A', 'Abnormal'
    
    flag = models.CharField(max_length=2, choices=Flag.choices, default=Flag.NORMAL)
    is_critical = models.BooleanField(default=False)
    
    # NEW: Reference range tracking
    reference_low = models.DecimalField(null=True, blank=True)
    reference_high = models.DecimalField(null=True, blank=True)
    reference_range_text = models.CharField(max_length=100, blank=True)
    
    # NEW: Amendment tracking
    is_amended = models.BooleanField(default=False)
    amendment_reason = models.TextField(blank=True)
    original_value = models.CharField(max_length=100, blank=True)
    amended_by = models.ForeignKey(User, null=True, blank=True)
    amended_at = models.DateTimeField(null=True, blank=True)
    
    # NEW: Method/Equipment tracking
    method = models.CharField(max_length=100, blank=True)
    equipment = models.CharField(max_length=100, blank=True)
```

**Test Plan**:
- [ ] Result creation with order
- [ ] Parameter uniqueness per order
- [ ] Numeric value parsing
- [ ] Flag calculation: Normal (within range)
- [ ] Flag calculation: High (above range)
- [ ] Flag calculation: Low (below range)
- [ ] Flag calculation: Critical High
- [ ] Flag calculation: Critical Low
- [ ] Critical values require verification
- [ ] Cannot self-verify critical results
- [ ] Amendment tracking (original value preserved)
- [ ] Amendment requires reason
- [ ] Reference range by gender (male/female)
- [ ] Reference range by age (pediatric vs adult)
- [ ] Result comments stored
- [ ] Entry user tracked

---

### 1.4 LabResultAttachment Model 🔄 TODO

**Target**: 8 tests  
**Status**: ⏳ Not Started

**Purpose**: Support scanned result attachments for external lab results

**Planned Implementation**:
```python
class LabResultAttachment(models.Model):
    """Scanned or uploaded lab result document."""
    
    class AttachmentType(models.TextChoices):
        SCANNED_RESULT = 'scanned', 'Scanned Result'
        EXTERNAL_REPORT = 'external', 'External Lab Report'
        GRAPH = 'graph', 'Result Graph'
        IMAGE = 'image', 'Lab Image'
        OTHER = 'other', 'Other'
    
    # Linkage
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE)
    
    # File
    file = models.FileField(upload_to='lab_results/%Y/%m/')
    filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=50)  # MIME type
    file_size = models.IntegerField()  # Bytes
    
    # Metadata
    attachment_type = models.CharField(max_length=20, choices=AttachmentType.choices)
    description = models.CharField(max_length=255, blank=True)
    
    # Audit
    uploaded_by = models.ForeignKey(User, on_delete=models.PROTECT)
    uploaded_at = models.DateTimeField(auto_now_add=True)
```

**Test Plan**:
- [ ] Attachment upload
- [ ] Attachment linked to order
- [ ] File metadata extracted (size, type)
- [ ] Allowed extensions (PDF, PNG, JPG)
- [ ] Rejected extensions (.exe, .js)
- [ ] File size limit (>10MB rejected)
- [ ] Upload user tracked
- [ ] Multiple attachments per order

**Validation Rules**:
- Allowed extensions: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.tiff`, `.tif`
- Max file size: 10MB
- Allowed MIME types: `application/pdf`, `image/png`, `image/jpeg`, `image/tiff`

---

### 1.5 Notification Model (Core App) 🔄 TODO

**Target**: 10 tests  
**Status**: ⏳ Not Started

**Purpose**: In-app notifications for lab results, critical values, etc.

**Planned Implementation**:
```python
# In hmis/apps/core/models.py

class Notification(models.Model):
    """In-app notification for users."""
    
    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        NORMAL = 'normal', 'Normal'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=50)  # 'lab_result', 'critical_value', etc.
    priority = models.CharField(max_length=20, choices=Priority.choices)
    
    title = models.CharField(max_length=200)
    message = models.TextField()
    
    # Link to related object
    related_model = models.CharField(max_length=50, blank=True)
    related_id = models.BigIntegerField(null=True, blank=True)
    action_url = models.CharField(max_length=500, blank=True)
    
    # Status
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
```

**Test Plan**:
- [ ] Notification creation
- [ ] Link to related object (LabOrder)
- [ ] Priority levels
- [ ] Mark as read
- [ ] Filter by user
- [ ] Filter by type
- [ ] Filter by unread
- [ ] Critical priority for critical results
- [ ] Notification action URL
- [ ] Notification ordering (newest first)

---

## Phase 2: Services & Workflow (Week 10)

**Target**: 32 tests | **Status**: Not Started

### 2.1 LabOrderWorkflow Service 🔄 TODO

**Target**: 12 tests  
**Status**: ⏳ Not Started

**Purpose**: Manage lab order state transitions with validation

**Planned Implementation**:
```python
class LabOrderWorkflow:
    """
    Manages lab order state transitions.
    
    In-House Flow:
    ordered → collected → in_progress → completed
    
    External Flow:
    ordered → collected → completed
    """
    
    VALID_TRANSITIONS = {
        'ordered': ['collected', 'cancelled'],
        'collected': ['in_progress', 'cancelled'],
        'in_progress': ['completed', 'cancelled'],
        'completed': [],
        'cancelled': []
    }
    
    def can_transition_to(self, new_status: str) -> bool:
        """Check if transition is valid."""
        pass
    
    def transition_to(self, new_status: str, user: User, **kwargs) -> LabOrder:
        """Perform transition with validation."""
        pass
```

**Test Plan**:
- [ ] Valid transition: ordered → collected
- [ ] Valid transition: collected → in_progress (in-house only)
- [ ] Valid transition: in_progress → completed
- [ ] Invalid transition: ordered → completed (cannot skip steps)
- [ ] Invalid transition: completed → anything (terminal state)
- [ ] Cancellation requires reason
- [ ] Completion requires results
- [ ] In-progress only for in-house orders
- [ ] Transition creates audit log
- [ ] Completion triggers notification
- [ ] Sample collection records user
- [ ] Processing assigns technician

---

### 2.2 ExternalLabRequisition PDF Generator 🔄 TODO

**Target**: 10 tests  
**Status**: ⏳ Not Started

**Dependencies**: WeasyPrint library (already in pyproject.toml)

**Test Plan**:
- [ ] Requisition only for external orders
- [ ] PDF generation success (returns BytesIO buffer)
- [ ] PDF contains patient info
- [ ] PDF contains facility info (letterhead)
- [ ] PDF contains test info (code, name, sample type)
- [ ] PDF contains clinical info (indication, diagnosis)
- [ ] Priority highlighted (STAT/Urgent styling)
- [ ] Requisition number on PDF
- [ ] Save PDF to order
- [ ] PDF filename format

**User Input Required**:
- Facility logo (PNG, 300x100px minimum)
- Facility name
- Facility address
- Facility phone
- Facility email
- Facility license number

---

### 2.3 LabNotificationService 🔄 TODO

**Target**: 10 tests  
**Status**: ⏳ Not Started

**Test Plan**:
- [ ] Notification created on result release
- [ ] Critical notification priority for critical results
- [ ] Standard notification title format
- [ ] Critical notification title with emoji (🚨)
- [ ] Notification message includes patient info
- [ ] Critical email sent for critical results
- [ ] No email for normal results
- [ ] Notification action URL points to results
- [ ] Mark notification as read
- [ ] Filter clinician's notifications

---

## Phase 3: API Endpoints (Week 11)

**Target**: 26 tests | **Status**: Not Started

### 3.1 Extended LabOrder API 🔄 TODO

**Target**: 12 tests

**New Endpoints**:
```
POST   /api/lab/orders/{id}/collect/          # Record sample collection
POST   /api/lab/orders/{id}/start-processing/ # Start processing
POST   /api/lab/orders/{id}/complete/         # Complete and release
POST   /api/lab/orders/{id}/cancel/           # Cancel order
GET    /api/lab/orders/{id}/requisition/      # Download PDF
GET    /api/lab/queue/                        # Lab queue/worklist
GET    /api/lab/queue/stats/                  # Queue statistics
```

---

### 3.2 LabResult API 🔄 TODO

**Target**: 14 tests

**New Endpoints**:
```
GET    /api/lab/orders/{id}/results/                 # List results
POST   /api/lab/orders/{id}/results/                 # Enter single result
POST   /api/lab/orders/{id}/results/bulk/            # Enter bulk results
PATCH  /api/lab/orders/{id}/results/{result_id}/    # Update/amend
POST   /api/lab/orders/{id}/results/{result_id}/verify/ # Verify critical
GET    /api/lab/results/critical/                    # List critical results
GET    /api/lab/results/pending-verification/       # Unverified criticals
```

---

## Phase 4: Reports & Analytics (Week 12)

**Target**: 8 tests | **Status**: Not Started

### 4.1 LabReportService 🔄 TODO

**Reports to Implement**:
- Turnaround time analysis (by test type, priority)
- Workload statistics (tests per day, by type, by technician)
- Critical values report (count, notification response time)
- Sample rejection analysis (rejection rate, reasons)

---

## Implementation Guidelines

### TDD Workflow (STRICTLY ENFORCED)

```
1. RED    → Write a failing test that defines expected behavior
2. GREEN  → Write minimal code to make the test pass
3. REFACTOR → Improve code while keeping tests green
4. COMMIT → Use report_progress after each complete feature
```

### Test Organization

```
backend/tests/
├── test_lab_queue.py              ✅ Complete (14 tests)
├── test_lab_result_template.py    🔄 TODO (8 tests)
├── test_lab_result_extended.py    🔄 TODO (16 tests)
├── test_lab_attachment.py         🔄 TODO (8 tests)
├── test_notification.py           🔄 TODO (10 tests)
├── test_lab_workflow.py           🔄 TODO (12 tests)
├── test_lab_requisition.py        🔄 TODO (10 tests)
├── test_lab_notification_service.py 🔄 TODO (10 tests)
├── test_lab_queue_api.py          🔄 TODO (12 tests)
├── test_lab_result_api.py         🔄 TODO (14 tests)
└── test_lab_reports.py            🔄 TODO (8 tests)
```

### Commands Reference

```bash
# Backend (always run from /backend directory)
cd backend

# Run specific test file
poetry run pytest tests/test_lab_queue.py -v

# Run specific test
poetry run pytest tests/test_lab_queue.py::TestLabQueueModel::test_queue_entry_creation -v

# Run with coverage
poetry run pytest --cov=hmis --cov-report=term-missing

# Create migration
poetry run python manage.py makemigrations laboratory

# Apply migrations
poetry run python manage.py migrate

# Run quality checks
make quality  # lint + type-check + security
make format   # auto-fix with Black + isort
make test     # run all tests with coverage
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex workflow states | High | Comprehensive state machine tests ✅ |
| PDF generation issues | Medium | Template testing, fallback to simple format |
| Large file uploads | Medium | Size limits, async processing |
| Critical value delays | High | Priority queue ✅, immediate notifications |

---

## Success Criteria

### Phase 1 (Current)
- [x] LabQueue model with 14 tests passing ✅
- [ ] LabResultTemplate model with 8 tests passing
- [ ] Extended LabResult with 16 tests passing
- [ ] LabResultAttachment with 8 tests passing
- [ ] Notification model with 10 tests passing
- [ ] All 56 Phase 1 tests passing
- [ ] ≥85% code coverage for new models

### Overall (All Phases)
- [ ] All 112+ tests passing
- [ ] ≥85% code coverage
- [ ] Lab queue functional (assign, collect, process, release)
- [ ] PDF requisitions generating correctly
- [ ] Result entry with auto-flagging working
- [ ] Critical value notifications immediate
- [ ] File attachments uploading/downloading
- [ ] Reference ranges loaded for common panels
- [ ] API documentation complete
- [ ] No critical security issues

---

## Change Log

### 2026-01-02
- **Phase 1.1 Complete**: Implemented LabQueue model with 14 tests (all passing)
- Created migrations for LabQueue model
- Implemented priority-based ordering
- Added comprehensive workflow methods
- **Next**: LabResultTemplate model (Phase 1.2)

### 2026-01-01
- Created initial implementation plan
- Set up project structure
- Defined 4-phase approach with 112 planned tests

---

## Notes

### User Input Pending
1. **Facility Branding** (Week 10): Logo, letterhead details for PDF requisitions
2. **Kenya Lab Standards** (Optional): Kenya-specific reference ranges (will use WHO defaults if not provided)

### Dependencies Added
- ✅ WeasyPrint (PDF generation)
- ✅ Pillow (Image processing)
- ✅ ReportLab (Already in pyproject.toml)

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-02  
**Maintained By**: Engineering Team  
**Review Frequency**: After each phase completion
