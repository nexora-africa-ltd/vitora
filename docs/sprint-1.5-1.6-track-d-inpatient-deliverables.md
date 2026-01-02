# Sprint 1.5-1.6 Track D: Inpatient Foundation - Deliverables

**Sprint Duration**: Weeks 9-12 (Phase 1)
**Status**: 📋 PLANNED
**Target Start**: TBD (after Sprint 1.3-1.4 completion)
**Last Updated**: January 2, 2026

---

## Executive Summary

Sprint 1.5-1.6 Track D implements the foundational Inpatient Department (IPD) module for Vitora HMIS. This track enables seamless OPD → IPD transitions, bed management, ward rounds, nursing Kardex, and discharge workflows. The implementation follows Test-Driven Development (TDD) methodology and addresses requirements gathered from consultant stakeholder feedback.

### Business Value
- **Eliminates duplicate registration**: Patients admitted directly from OPD without re-registration
- **Improves care continuity**: Clinical notes flow seamlessly from OPD to IPD
- **Enhances nursing efficiency**: Kardex provides shift-based care summaries
- **Enables bed utilization tracking**: Real-time occupancy for resource planning
- **Supports KHIS reporting**: IPD admission indicators for mandatory reporting

---

## Test Plan Summary

| Test Category | Estimated Tests | Priority |
|---------------|-----------------|----------|
| Ward Model | 12 | High |
| Bed Model | 15 | High |
| Admission Recommendation | 10 | High |
| Admission Model | 18 | High |
| Ward Round | 12 | Medium |
| Nursing Kardex | 20 | High |
| Shift Handover | 8 | Medium |
| Transfer | 10 | Medium |
| Discharge | 15 | High |
| Bed Occupancy Dashboard | 8 | Medium |
| API Endpoints | 25 | High |
| Integration Tests | 15 | High |
| **Total** | **~168** | - |

---

## Components to Implement

### 1. Ward Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class Ward(TimeStampedModel):
    """Hospital ward for inpatient care."""
    
    WARD_TYPE_CHOICES = [
        ('MEDICAL', 'Medical Ward'),
        ('SURGICAL', 'Surgical Ward'),
        ('PEDIATRIC', 'Pediatric Ward'),
        ('MATERNITY', 'Maternity Ward'),
        ('ICU', 'Intensive Care Unit'),
        ('ISOLATION', 'Isolation Ward'),
    ]
    
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)  # e.g., "MED-01"
    ward_type = models.CharField(max_length=20, choices=WARD_TYPE_CHOICES)
    floor = models.CharField(max_length=50, blank=True)
    capacity = models.PositiveIntegerField()  # Total bed count
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2)  # Bed charge per day
    
    # Computed properties
    @property
    def available_beds(self) -> int:
        """Count of beds with status AVAILABLE."""
        
    @property
    def occupancy_rate(self) -> float:
        """Current occupancy percentage."""
```

**Test Coverage** (12 tests):
- Ward creation with valid data
- Ward type validation
- Unique name constraint
- Unique code constraint
- Capacity validation (positive integer)
- Daily rate validation
- Available beds calculation
- Occupancy rate calculation
- Ward deactivation
- Ward listing with filters
- Ward search by name/code
- Ward update with audit

---

### 2. Bed Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class Bed(TimeStampedModel):
    """Individual bed within a ward."""
    
    BED_STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('OCCUPIED', 'Occupied'),
        ('MAINTENANCE', 'Under Maintenance'),
        ('RESERVED', 'Reserved'),
    ]
    
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE, related_name='beds')
    bed_number = models.CharField(max_length=20)  # e.g., "B-101"
    status = models.CharField(max_length=20, choices=BED_STATUS_CHOICES, default='AVAILABLE')
    bed_type = models.CharField(max_length=50, blank=True)  # e.g., "Standard", "ICU", "Isolation"
    notes = models.TextField(blank=True)  # Maintenance notes, etc.
    
    # Status change tracking
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    
    class Meta:
        unique_together = ['ward', 'bed_number']
        
    def mark_occupied(self, user):
        """Transition to OCCUPIED status."""
        
    def mark_available(self, user):
        """Transition to AVAILABLE status."""
        
    def mark_maintenance(self, user, reason):
        """Transition to MAINTENANCE status with reason."""
        
    def mark_reserved(self, user, duration_hours=24):
        """Transition to RESERVED status with expiry."""
```

**Test Coverage** (15 tests):
- Bed creation with valid data
- Unique bed number per ward
- Status transitions: AVAILABLE → OCCUPIED
- Status transitions: OCCUPIED → AVAILABLE
- Status transitions: AVAILABLE → MAINTENANCE
- Status transitions: MAINTENANCE → AVAILABLE
- Status transitions: AVAILABLE → RESERVED
- Reserved bed auto-expiry
- Invalid status transition prevention
- Bed listing by ward
- Bed filtering by status
- Bed assignment validation (no double-booking)
- Bed status change audit logging
- Bed deactivation with occupied check
- Bed search by number

---

### 3. Admission Recommendation Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class AdmissionRecommendation(TimeStampedModel):
    """Clinician recommendation for patient admission from OPD."""
    
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('ACCEPTED', 'Accepted'),
        ('DECLINED', 'Declined'),
        ('EXPIRED', 'Expired'),
    ]
    
    encounter = models.OneToOneField(
        'encounters.Encounter', 
        on_delete=models.CASCADE,
        related_name='admission_recommendation'
    )
    recommended_by = models.ForeignKey(User, on_delete=models.PROTECT)
    reason = models.TextField()  # Admission reason
    provisional_diagnosis = models.CharField(max_length=10)  # ICD-10 code
    provisional_diagnosis_text = models.CharField(max_length=255)
    urgency = models.CharField(max_length=20, choices=[
        ('ROUTINE', 'Routine'),
        ('URGENT', 'Urgent'),
        ('EMERGENCY', 'Emergency'),
    ], default='ROUTINE')
    preferred_ward_type = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    expires_at = models.DateTimeField()  # Default: 24 hours from creation
    
    # Resolution
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    decline_reason = models.TextField(blank=True)
    
    def accept(self, user):
        """Mark recommendation as accepted."""
        
    def decline(self, user, reason):
        """Mark recommendation as declined with reason."""
        
    def is_expired(self) -> bool:
        """Check if recommendation has expired."""
```

**Test Coverage** (10 tests):
- Recommendation creation from OPD encounter
- Encounter status update to ADMISSION_PENDING
- Recommendation expiry after 24 hours
- Recommendation acceptance flow
- Recommendation decline with reason
- Duplicate recommendation prevention
- Only OPD encounters can have recommendations
- Recommendation notification to reception
- Expired recommendation handling
- Recommendation audit logging

---

### 4. Admission Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class Admission(TimeStampedModel):
    """Inpatient admission record."""
    
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('DISCHARGED', 'Discharged'),
        ('TRANSFERRED_OUT', 'Transferred Out'),
        ('DECEASED', 'Deceased'),
        ('ABSCONDED', 'Absconded'),
    ]
    
    # Patient and encounter linkage
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT, related_name='admissions')
    opd_encounter = models.ForeignKey(
        'encounters.Encounter', 
        on_delete=models.SET_NULL, 
        null=True, 
        related_name='admission_from_opd'
    )
    ipd_encounter = models.OneToOneField(
        'encounters.Encounter',
        on_delete=models.PROTECT,
        related_name='admission'
    )
    recommendation = models.OneToOneField(
        AdmissionRecommendation,
        on_delete=models.SET_NULL,
        null=True,
        related_name='admission'
    )
    
    # Admission details
    admission_number = models.CharField(max_length=50, unique=True)  # ADM-YYYYMMDD-XXXX
    admission_date = models.DateTimeField()
    admitting_diagnosis = models.CharField(max_length=10)  # ICD-10
    admitting_diagnosis_text = models.CharField(max_length=255)
    admitting_officer = models.ForeignKey(User, on_delete=models.PROTECT, related_name='admissions_processed')
    attending_doctor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='patients_attending')
    
    # Location
    ward = models.ForeignKey(Ward, on_delete=models.PROTECT)
    bed = models.ForeignKey(Bed, on_delete=models.PROTECT)
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    
    # Insurance/payment
    payer_type = models.CharField(max_length=20, choices=[
        ('CASH', 'Cash'),
        ('SHA', 'SHA Insurance'),
        ('CORPORATE', 'Corporate'),
    ])
    insurance_details = models.JSONField(default=dict, blank=True)
    
    # Timestamps
    discharge_date = models.DateTimeField(null=True, blank=True)
    
    @property
    def length_of_stay(self) -> int:
        """Calculate LOS in days."""
        
    def generate_admission_number(self):
        """Auto-generate admission number: ADM-YYYYMMDD-XXXX."""
```

**Test Coverage** (18 tests):
- Admission creation with bed assignment
- Admission number auto-generation
- Bed status update on admission (AVAILABLE → OCCUPIED)
- OPD encounter linkage preservation
- IPD encounter auto-creation
- Recommendation status update on admission
- Duplicate admission prevention (same patient active)
- Insurance details validation
- Attending doctor assignment
- Patient admission history
- Active admissions listing
- Admission search by number/patient
- Length of stay calculation
- Admission without recommendation (emergency direct)
- Admission audit logging
- Bed availability validation before admission
- Admission notification to ward staff
- Admission billing item generation

---

### 5. Ward Round Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class WardRound(TimeStampedModel):
    """Daily ward round documentation."""
    
    admission = models.ForeignKey(Admission, on_delete=models.CASCADE, related_name='ward_rounds')
    round_date = models.DateField()
    round_time = models.TimeField()
    conducted_by = models.ForeignKey(User, on_delete=models.PROTECT)
    
    # Clinical findings
    subjective = models.TextField(help_text="Patient complaints, symptoms")
    objective = models.TextField(help_text="Examination findings, vitals")
    assessment = models.TextField(help_text="Clinical assessment, diagnosis updates")
    plan = models.TextField(help_text="Treatment plan, orders")
    
    # Patient condition
    condition_status = models.CharField(max_length=20, choices=[
        ('STABLE', 'Stable'),
        ('IMPROVING', 'Improving'),
        ('DETERIORATING', 'Deteriorating'),
        ('CRITICAL', 'Critical'),
    ])
    
    # Flags
    requires_consultant_review = models.BooleanField(default=False)
    consultant_specialty = models.CharField(max_length=100, blank=True)
    
    class Meta:
        unique_together = ['admission', 'round_date', 'conducted_by']
        ordering = ['-round_date', '-round_time']
```

**Test Coverage** (12 tests):
- Ward round creation
- SOAP note structure validation
- Condition status transitions
- Multiple rounds per day (different doctors)
- Round date cannot be future
- Consultant review flagging
- Round listing by admission
- Round filtering by date
- Round search
- Round audit logging
- Round notification to care team
- Round PDF export

---

### 6. Nursing Kardex Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class NursingKardex(TimeStampedModel):
    """Nursing Kardex for inpatient care coordination."""
    
    admission = models.OneToOneField(Admission, on_delete=models.CASCADE, related_name='kardex')
    
    # Nursing care plan (editable sections)
    nursing_problems = models.TextField(blank=True)
    interventions = models.TextField(blank=True)
    monitoring_requirements = models.TextField(blank=True)
    care_task_frequency = models.TextField(blank=True)
    
    # Risk assessments
    fall_risk = models.CharField(max_length=20, choices=[
        ('LOW', 'Low'),
        ('MODERATE', 'Moderate'),
        ('HIGH', 'High'),
    ], default='LOW')
    pressure_sore_risk = models.CharField(max_length=20, choices=[
        ('LOW', 'Low'),
        ('MODERATE', 'Moderate'),
        ('HIGH', 'High'),
    ], default='LOW')
    
    class Meta:
        verbose_name_plural = "Nursing Kardexes"


class KardexShiftNote(TimeStampedModel):
    """Individual shift note entry in Kardex (append-only)."""
    
    kardex = models.ForeignKey(NursingKardex, on_delete=models.CASCADE, related_name='shift_notes')
    shift = models.CharField(max_length=10, choices=[
        ('DAY', 'Day Shift'),
        ('NIGHT', 'Night Shift'),
    ])
    nurse = models.ForeignKey(User, on_delete=models.PROTECT)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']


class KardexHandoverNote(TimeStampedModel):
    """Handover notes for shift transitions."""
    
    kardex = models.ForeignKey(NursingKardex, on_delete=models.CASCADE, related_name='handover_notes')
    outgoing_nurse = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    incoming_nurse = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    shift_ending = models.CharField(max_length=10)
    pending_tasks = models.TextField()
    escalations = models.TextField(blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
```

**Test Coverage** (20 tests):
- Kardex auto-creation on admission
- Patient snapshot data (read-only computed)
- Current orders auto-population from encounter
- Nursing care plan updates
- Risk assessment updates
- Shift note creation (append-only)
- Shift note immutability
- Handover note creation
- Handover acknowledgment
- Kardex access restriction to ward staff
- Critical orders highlighting
- Allergy highlighting
- Kardex view by admission
- Shift notes filtering by date/shift
- Kardex audit logging
- Kardex PDF export
- Diet order display
- IV fluid tracking
- Activity level display
- Special instructions display

---

### 7. Shift Handover Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class ShiftHandover(TimeStampedModel):
    """Formal shift handover record."""
    
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE)
    shift_date = models.DateField()
    shift_ending = models.CharField(max_length=10, choices=[
        ('DAY', 'Day Shift'),
        ('NIGHT', 'Night Shift'),
    ])
    outgoing_nurse = models.ForeignKey(User, on_delete=models.PROTECT, related_name='handovers_given')
    incoming_nurse = models.ForeignKey(User, on_delete=models.PROTECT, related_name='handovers_received')
    
    # Summary
    total_patients = models.PositiveIntegerField()
    critical_patients = models.PositiveIntegerField(default=0)
    new_admissions = models.PositiveIntegerField(default=0)
    discharges_pending = models.PositiveIntegerField(default=0)
    
    # Notes
    general_notes = models.TextField(blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        unique_together = ['ward', 'shift_date', 'shift_ending']
```

**Test Coverage** (8 tests):
- Handover creation
- Auto-population of patient counts
- Handover acknowledgment
- Handover listing by ward
- Handover report generation
- Critical patient highlighting
- Handover audit logging
- Incomplete handover alerts

---

### 8. Transfer Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class Transfer(TimeStampedModel):
    """Patient transfer between wards."""
    
    TRANSFER_REASON_CHOICES = [
        ('STEP_UP', 'Step Up Care (e.g., to ICU)'),
        ('STEP_DOWN', 'Step Down Care'),
        ('SPECIALTY', 'Specialty Care'),
        ('BED_MANAGEMENT', 'Bed Management'),
        ('PATIENT_REQUEST', 'Patient Request'),
        ('OTHER', 'Other'),
    ]
    
    admission = models.ForeignKey(Admission, on_delete=models.CASCADE, related_name='transfers')
    
    # Source
    source_ward = models.ForeignKey(Ward, on_delete=models.PROTECT, related_name='transfers_out')
    source_bed = models.ForeignKey(Bed, on_delete=models.PROTECT, related_name='transfers_out')
    
    # Destination
    destination_ward = models.ForeignKey(Ward, on_delete=models.PROTECT, related_name='transfers_in')
    destination_bed = models.ForeignKey(Bed, on_delete=models.PROTECT, related_name='transfers_in')
    
    # Details
    reason = models.CharField(max_length=20, choices=TRANSFER_REASON_CHOICES)
    reason_details = models.TextField(blank=True)
    transferred_by = models.ForeignKey(User, on_delete=models.PROTECT)
    transfer_date = models.DateTimeField()
    
    # Handover
    clinical_handover_notes = models.TextField()
```

**Test Coverage** (10 tests):
- Transfer creation with bed availability check
- Source bed status update (OCCUPIED → AVAILABLE)
- Destination bed status update (AVAILABLE → OCCUPIED)
- Admission ward/bed update
- Transfer reason validation
- Transfer listing by admission
- Transfer audit logging
- Transfer notification to both wards
- Same-ward transfer prevention
- Transfer summary in patient timeline

---

### 9. Discharge Model

**Module**: `hmis/apps/inpatient/models.py`

**Fields**:
```python
class Discharge(TimeStampedModel):
    """Patient discharge record."""
    
    DISCHARGE_TYPE_CHOICES = [
        ('NORMAL', 'Normal Discharge'),
        ('AGAINST_ADVICE', 'Discharge Against Medical Advice'),
        ('TRANSFERRED', 'Transferred to Another Facility'),
        ('DECEASED', 'Deceased'),
        ('ABSCONDED', 'Absconded'),
    ]
    
    admission = models.OneToOneField(Admission, on_delete=models.CASCADE, related_name='discharge')
    
    # Discharge details
    discharge_type = models.CharField(max_length=20, choices=DISCHARGE_TYPE_CHOICES)
    discharge_date = models.DateTimeField()
    discharged_by = models.ForeignKey(User, on_delete=models.PROTECT)
    
    # Clinical summary
    admission_diagnosis = models.CharField(max_length=10)  # ICD-10
    final_diagnosis = models.CharField(max_length=10)  # ICD-10
    final_diagnosis_text = models.CharField(max_length=255)
    procedures_performed = models.TextField(blank=True)
    treatment_summary = models.TextField()
    
    # Discharge medications
    discharge_medications = models.JSONField(default=list)  # Links to pharmacy
    
    # Follow-up
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_instructions = models.TextField(blank=True)
    
    # Referrals
    referral_facility = models.CharField(max_length=255, blank=True)
    referral_reason = models.TextField(blank=True)
    
    # Patient instructions
    patient_instructions = models.TextField()
    
    # Clearances
    pharmacy_cleared = models.BooleanField(default=False)
    billing_cleared = models.BooleanField(default=False)
    lab_results_acknowledged = models.BooleanField(default=False)
    
    # Computed
    @property
    def length_of_stay(self) -> int:
        """Days from admission to discharge."""
```

**Test Coverage** (15 tests):
- Discharge creation with clearances
- Bed status update (OCCUPIED → AVAILABLE)
- Admission status update (ACTIVE → DISCHARGED)
- LOS calculation
- Discharge summary required fields
- Discharge medications linking
- Follow-up appointment creation
- Referral documentation
- Discharge without clearance prevention
- Discharge audit logging
- Discharge summary PDF generation
- KHIS discharge indicator update
- Discharge notification to patient
- Discharge billing finalization
- Against-advice discharge documentation

---

### 10. API Endpoints

**Module**: `hmis/apps/inpatient/views.py`, `hmis/apps/inpatient/urls.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/wards/` | GET | List all wards with occupancy |
| `/api/wards/{id}/` | GET | Ward detail |
| `/api/wards/{id}/beds/` | GET | List beds in ward |
| `/api/beds/{id}/` | GET, PATCH | Bed detail, status update |
| `/api/encounters/{id}/recommend-admission/` | POST | Create admission recommendation |
| `/api/admission-recommendations/` | GET | List pending recommendations |
| `/api/admissions/` | GET, POST | List/create admissions |
| `/api/admissions/{id}/` | GET, PATCH | Admission detail |
| `/api/admissions/{id}/rounds/` | GET, POST | Ward rounds for admission |
| `/api/admissions/{id}/kardex/` | GET, PATCH | Nursing Kardex |
| `/api/admissions/{id}/kardex/shift-notes/` | GET, POST | Kardex shift notes |
| `/api/admissions/{id}/kardex/handover/` | GET, POST | Kardex handover notes |
| `/api/admissions/{id}/transfer/` | POST | Transfer patient |
| `/api/admissions/{id}/discharge/` | POST | Discharge patient |
| `/api/shift-handovers/` | GET, POST | Ward shift handovers |
| `/api/reports/bed-occupancy/` | GET | Bed occupancy dashboard data |

**Test Coverage** (25 tests):
- Authentication required on all endpoints
- Permission checks per endpoint
- Pagination and filtering
- Search functionality
- Error responses
- Offline sync compatibility (SyncQueue integration)

---

## Database Migrations

### Migration 0001: Create Inpatient Models
```python
# hmis/apps/inpatient/migrations/0001_initial.py

- Ward model
- Bed model
- AdmissionRecommendation model
- Admission model
- WardRound model
- NursingKardex model
- KardexShiftNote model
- KardexHandoverNote model
- ShiftHandover model
- Transfer model
- Discharge model
```

### Migration 0002: Add Encounter Admission Status
```python
# hmis/apps/encounters/migrations/XXXX_add_admission_status.py

- Add admission_status field to Encounter model
- Choices: NONE, ADMISSION_PENDING, ADMITTED, DECLINED
```

---

## Integration Points

### 1. Encounter Model Updates
- Add `admission_status` field
- Add `admission_recommendation` relationship

### 2. Billing Integration
- Bed charges per day (ward.daily_rate)
- Admission billing item auto-creation
- Discharge billing finalization

### 3. Pharmacy Integration
- Discharge medications linked to dispensing
- Pharmacy clearance flag

### 4. Laboratory Integration
- Pending lab results acknowledgment
- Lab results visibility in Kardex

### 5. Sync/Offline Support
- All models inherit from SyncableModel
- SyncQueue integration for offline admissions

### 6. Audit Logging
- All CRUD operations logged
- Bed status changes logged
- Admission/discharge events logged

---

## UI Components (Web Dashboard)

### 1. Ward Overview Dashboard
- Ward cards with occupancy percentage
- Color-coded bed status grid
- Quick admission action

### 2. Admission Pending Queue
- List of pending recommendations
- Accept/decline actions
- Bed selection modal

### 3. Patient Admission Form
- Patient search/link
- Ward/bed selection
- Insurance details
- Admitting diagnosis

### 4. Ward Round Form
- SOAP note structure
- Condition status selector
- Consultant review flag

### 5. Nursing Kardex View
- Tabbed sections (Snapshot, Orders, Care Plan, Notes, Handover)
- Add shift note modal
- Handover generation

### 6. Discharge Form
- Summary template
- Clearance checklist
- Medication list
- Print preview

---

## Acceptance Criteria Summary

| User Story | Key Acceptance Criteria |
|------------|------------------------|
| KE-IPD-001 | Clinician can recommend admission from OPD; reception notified |
| KE-IPD-002 | Receptionist can admit patient with bed assignment |
| KE-IPD-003 | Real-time bed occupancy visible; status management |
| KE-IPD-004 | Clinical notes continue seamlessly after admission |
| KE-IPD-005 | Daily ward rounds documented with SOAP format |
| KE-IPD-006 | Kardex maintains care plan, shift notes, handover |
| KE-IPD-007 | Incoming nurse can review Kardex at shift start |
| KE-IPD-008 | Patient can be transferred between wards |
| KE-IPD-009 | Discharge requires clearances; generates summary |
| KE-IPD-010 | Consultant referrals tracked during admission |

---

## Dependencies

### Internal Dependencies
- `hmis.apps.patients` - Patient model
- `hmis.apps.encounters` - Encounter model
- `hmis.apps.core` - AuditLog, SyncQueue, TimeStampedModel
- `hmis.apps.pharmacy` - Discharge medications
- `hmis.apps.billing` - Admission billing

### External Dependencies
- Django 5.x
- Django REST Framework
- Celery (for notifications)
- Redis (for real-time updates)

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Bed double-booking | High | Medium | Database-level unique constraint, transaction locking |
| Orphaned admissions | Medium | Low | Foreign key constraints, soft delete |
| Kardex data loss | High | Low | Append-only design, audit logging |
| Sync conflicts | Medium | Medium | Conflict resolution UI, last-write-wins for non-critical |
| Performance with many beds | Medium | Low | Database indexing, caching |

---

## Success Metrics

- [ ] ≥80% test coverage for inpatient module
- [ ] All 10 user stories (KE-IPD-001 to KE-IPD-010) acceptance criteria met
- [ ] Bed occupancy dashboard loads in <2 seconds
- [ ] Zero duplicate bed assignments in testing
- [ ] Kardex shift notes append-only verified
- [ ] Offline admission workflow functional
- [ ] Integration tests pass with billing and pharmacy

---

## Appendix A: Model Relationships

```
Patient
    └── Admission (1:N)
            ├── WardRound (1:N)
            ├── NursingKardex (1:1)
            │       ├── KardexShiftNote (1:N)
            │       └── KardexHandoverNote (1:N)
            ├── Transfer (1:N)
            └── Discharge (1:1)

Ward
    └── Bed (1:N)
            └── Admission (current)

Encounter
    ├── AdmissionRecommendation (1:1, OPD only)
    └── Admission (1:1, IPD encounter)
```

---

## Appendix B: Status State Machines

### Bed Status
```
AVAILABLE ──► RESERVED ──► OCCUPIED ──► AVAILABLE
    │              │            │
    │              └────────────┤ (reservation expires)
    │                           │
    └──► MAINTENANCE ───────────┘
```

### Admission Status
```
         ┌────────────────────────────────────┐
         │                                    │
         ▼                                    │
      ACTIVE ──► DISCHARGED                   │
         │                                    │
         ├──► TRANSFERRED_OUT ────────────────┘
         │
         ├──► DECEASED
         │
         └──► ABSCONDED
```

### Admission Recommendation Status
```
PENDING ──► ACCEPTED ──► (Admission created)
    │
    ├──► DECLINED
    │
    └──► EXPIRED (24 hours)
```

---

*Document prepared by Nexora Africa Ltd Engineering Team*
*Based on consultant stakeholder feedback - January 2026*
