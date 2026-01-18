# Sprint 1.5-1.6 Track B: Lab Workflow Completion - Deliverables

**Sprint Duration**: Weeks 9-12 (Phase 1)
**Status**: 📋 PLANNED
**Target Date**: Q1 2026
**Dependencies**: Sprint 1.3-1.4 Track B (LabOrder, LabResult foundation models)

---

## Executive Summary

Track B of Sprint 1.5-1.6 completes the Laboratory Workflow for Vitora HMIS, enabling in-house lab queue management, external lab PDF requisitions, result entry forms, clinician notifications, and scanned result attachments. The module supports Kenya's healthcare context with offline-first operation and integration with common Kenya lab panels.

### Key Deliverables

| Deliverable | Tests Required | Priority | User Input Needed |
|-------------|----------------|----------|-------------------|
| Lab Queue Management | 14 tests | High | ❌ |
| Lab Order Status Workflow | 12 tests | High | ❌ |
| External Lab Requisition PDF | 10 tests | High | ✅ **Facility Logo/Letterhead** |
| Lab Result Entry Form | 16 tests | High | ❌ |
| Result Reference Ranges | 8 tests | Medium | ✅ **Kenya Lab Standards** |
| Lab Result Notifications | 10 tests | Medium | ❌ |
| Result Attachments (Scanned) | 8 tests | Medium | ❌ |
| Lab Order API (extended) | 12 tests | Medium | ❌ |
| Lab Result API | 14 tests | Medium | ❌ |
| Lab Reports/Analytics | 8 tests | Low | ❌ |

**Total Planned Tests**: ~112 tests
**Target Coverage**: ≥85%

---

## ⚠️ User Input Required

Before implementation begins, the following inputs are needed:

### 1. Facility Branding for PDF Requisitions (MEDIUM PRIORITY)

| Item | Description | Default |
|------|-------------|---------|
| **Facility Logo** | PNG/SVG logo for requisition header | Vitora placeholder logo |
| **Facility Name** | Official facility name | "[Your Facility Name]" |
| **Facility Address** | Physical address | "P.O. Box 00000, Nairobi, Kenya" |
| **Facility Phone** | Contact number | "+254 700 000 000" |
| **Facility Email** | Contact email | "lab@facility.example" |
| **License Number** | Medical facility license | "MF-00000" |

**Action Required**:
- Provide facility logo file (PNG, min 300x100px)
- Confirm facility details for official documents

**Timeline**: Needed by Week 10 (for PDF generation)

### 2. Kenya Lab Reference Ranges (LOW PRIORITY)

| Item | Description | Status |
|------|-------------|--------|
| **CBC Reference Ranges** | Normal ranges by age/gender | Will use WHO standards |
| **Chemistry Panel Ranges** | Liver, kidney, lipid panels | Will use WHO standards |
| **Kenya-specific Ranges** | If different from WHO | Provide if available |

**Note**: We'll implement WHO standard reference ranges. Kenya-specific ranges can be added later if provided.

### 3. External Lab Partners (OPTIONAL)

| Item | Description | Status |
|------|-------------|--------|
| **Partner Lab List** | Labs for external referrals | Can be added later |
| **Lab Contact Details** | For requisition forms | Can be added later |
| **Sample Collection Points** | Pickup locations | Can be added later |

**Note**: This is optional for Phase 1. External lab integration is a placeholder for future partnerships.

---

## Prerequisites (From Sprint 1.3-1.4 Track B)

The following models should already exist from the previous sprint:

### Existing LabOrder Model
```python
class LabOrder(models.Model):
    """Lab order from an encounter."""

    class OrderType(models.TextChoices):
        IN_HOUSE = 'in_house', 'In-House'
        EXTERNAL = 'external', 'External Lab'

    class Status(models.TextChoices):
        ORDERED = 'ordered', 'Ordered'
        COLLECTED = 'collected', 'Sample Collected'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT)
    encounter = models.ForeignKey('encounters.Encounter', on_delete=models.PROTECT)
    test_code = models.CharField(max_length=20)  # LOINC code
    test_name = models.CharField(max_length=200)
    order_type = models.CharField(max_length=20, choices=OrderType.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ORDERED)
    # ... additional fields
```

### Existing LabResult Model
```python
class LabResult(models.Model):
    """Result for a lab order."""

    lab_order = models.ForeignKey(LabOrder, on_delete=models.PROTECT, related_name='results')
    parameter_name = models.CharField(max_length=100)
    value = models.CharField(max_length=100)
    unit = models.CharField(max_length=50)
    reference_range = models.CharField(max_length=100, blank=True)
    is_abnormal = models.BooleanField(default=False)
    # ... additional fields
```

---

## Components to Implement

### 1. Lab Queue Management Model

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: Manage the in-house lab queue with worklist, prioritization, and technician assignment.

**Fields**:
```python
class LabQueue(models.Model):
    """Lab queue entry for in-house processing."""

    class Priority(models.TextChoices):
        ROUTINE = 'routine', 'Routine'
        URGENT = 'urgent', 'Urgent'
        STAT = 'stat', 'STAT (Emergency)'

    class QueueStatus(models.TextChoices):
        PENDING = 'pending', 'Pending Collection'
        COLLECTED = 'collected', 'Sample Collected'
        PROCESSING = 'processing', 'Processing'
        REVIEW = 'review', 'Pending Review'
        RELEASED = 'released', 'Results Released'

    id = models.BigAutoField(primary_key=True)

    # Linkage
    lab_order = models.OneToOneField(LabOrder, on_delete=models.CASCADE, related_name='queue_entry')

    # Queue management
    queue_number = models.CharField(max_length=20, unique=True)  # LAB-YYYYMMDD-XXXX
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.ROUTINE)
    queue_status = models.CharField(max_length=20, choices=QueueStatus.choices, default=QueueStatus.PENDING)

    # Assignment
    assigned_technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='assigned_lab_orders'
    )

    # Sample tracking
    sample_type = models.CharField(max_length=50)  # blood, urine, stool, swab, etc.
    sample_id = models.CharField(max_length=50, blank=True)  # Barcode/tube ID
    collected_at = models.DateTimeField(null=True, blank=True)
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='samples_collected'
    )

    # Processing
    processing_started_at = models.DateTimeField(null=True, blank=True)
    processing_completed_at = models.DateTimeField(null=True, blank=True)

    # Review/Release
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lab_results_reviewed'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)

    # Notes
    technician_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)  # If sample rejected

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-priority', 'created_at']
        indexes = [
            models.Index(fields=['queue_number']),
            models.Index(fields=['queue_status', 'priority']),
            models.Index(fields=['assigned_technician', 'queue_status']),
        ]
```

**Auto-generated Queue Number Format**: `LAB-YYYYMMDD-XXXX`

**Methods**:
- `generate_queue_number()`: Auto-generate unique queue number
- `assign_to(technician)`: Assign to lab technician
- `collect_sample(collector, sample_id)`: Record sample collection
- `start_processing()`: Mark as in progress
- `submit_for_review()`: Submit results for review
- `release_results(reviewer)`: Approve and release results
- `reject_sample(reason)`: Reject sample with reason
- `get_turnaround_time()`: Calculate TAT from order to release

**Test Coverage**: 14 tests

| Test | Description |
|------|-------------|
| `test_queue_entry_creation` | Queue entry created with lab order |
| `test_queue_number_auto_generated` | Queue number follows format |
| `test_queue_number_uniqueness` | Duplicate numbers rejected |
| `test_priority_ordering` | STAT > Urgent > Routine |
| `test_assign_technician` | Technician assignment works |
| `test_collect_sample` | Sample collection recorded |
| `test_sample_id_recorded` | Barcode/tube ID stored |
| `test_start_processing` | Status changes to processing |
| `test_submit_for_review` | Status changes to review |
| `test_release_results` | Results released, order completed |
| `test_reject_sample` | Rejection with reason |
| `test_turnaround_time_calculation` | TAT correctly calculated |
| `test_queue_filtering_by_status` | Filter pending, processing, etc. |
| `test_queue_filtering_by_technician` | Filter by assigned user |

---

### 2. Lab Order Status Workflow

**Module**: `hmis/apps/laboratory/services.py`

**Purpose**: Manage state transitions for lab orders with validation.

**Implementation**:
```python
class LabOrderWorkflow:
    """
    Manages lab order state transitions.

    In-House Flow:
    ordered → collected → in_progress → completed

    External Flow:
    ordered → collected (sample sent) → completed (results received)
    """

    VALID_TRANSITIONS = {
        'ordered': ['collected', 'cancelled'],
        'collected': ['in_progress', 'cancelled'],  # in_progress only for in-house
        'in_progress': ['completed', 'cancelled'],
        'completed': [],  # Terminal state
        'cancelled': [],  # Terminal state
    }

    def __init__(self, lab_order: LabOrder):
        self.lab_order = lab_order

    def can_transition_to(self, new_status: str) -> bool:
        """Check if transition is valid."""
        current = self.lab_order.status
        return new_status in self.VALID_TRANSITIONS.get(current, [])

    def transition_to(self, new_status: str, user: User, **kwargs) -> LabOrder:
        """
        Transition order to new status with validation.

        Args:
            new_status: Target status
            user: User performing the action
            **kwargs: Additional data (e.g., sample_id, rejection_reason)

        Returns:
            Updated LabOrder

        Raises:
            InvalidTransitionError: If transition is not allowed
        """
        if not self.can_transition_to(new_status):
            raise InvalidTransitionError(
                f"Cannot transition from {self.lab_order.status} to {new_status}"
            )

        # Perform transition with appropriate actions
        if new_status == 'collected':
            self._handle_collection(user, kwargs)
        elif new_status == 'in_progress':
            self._handle_processing_start(user)
        elif new_status == 'completed':
            self._handle_completion(user, kwargs)
        elif new_status == 'cancelled':
            self._handle_cancellation(user, kwargs)

        self.lab_order.status = new_status
        self.lab_order.save()

        # Create audit log
        AuditLog.log(
            action=f'lab_order_{new_status}',
            user=user,
            resource_type='LabOrder',
            resource_id=self.lab_order.id,
            details={'previous_status': self.lab_order.status, 'new_status': new_status}
        )

        return self.lab_order

    def _handle_collection(self, user: User, kwargs: dict):
        """Handle sample collection."""
        queue = self.lab_order.queue_entry
        queue.collect_sample(
            collector=user,
            sample_id=kwargs.get('sample_id', '')
        )

    def _handle_processing_start(self, user: User):
        """Handle processing start (in-house only)."""
        if self.lab_order.order_type != 'in_house':
            raise InvalidTransitionError("Only in-house orders can be marked as in_progress")
        queue = self.lab_order.queue_entry
        queue.start_processing()
        queue.assigned_technician = user
        queue.save()

    def _handle_completion(self, user: User, kwargs: dict):
        """Handle order completion."""
        # Verify results exist
        if not self.lab_order.results.exists():
            raise InvalidTransitionError("Cannot complete order without results")

        queue = self.lab_order.queue_entry
        queue.release_results(user)

        # Trigger notification
        self._notify_clinician()

    def _handle_cancellation(self, user: User, kwargs: dict):
        """Handle order cancellation."""
        reason = kwargs.get('cancellation_reason', '')
        if not reason:
            raise InvalidTransitionError("Cancellation requires a reason")
        self.lab_order.cancellation_reason = reason
        self.lab_order.cancelled_by = user
        self.lab_order.cancelled_at = timezone.now()

    def _notify_clinician(self):
        """Send notification when results are ready."""
        from hmis.apps.laboratory.notifications import send_result_notification
        send_result_notification(self.lab_order)
```

**Test Coverage**: 12 tests

| Test | Description |
|------|-------------|
| `test_valid_transition_ordered_to_collected` | Standard flow step 1 |
| `test_valid_transition_collected_to_in_progress` | In-house only |
| `test_valid_transition_in_progress_to_completed` | Final step |
| `test_invalid_transition_ordered_to_completed` | Cannot skip steps |
| `test_invalid_transition_completed_to_anything` | Terminal state |
| `test_cancellation_requires_reason` | Reason mandatory |
| `test_completion_requires_results` | Results must exist |
| `test_in_progress_only_for_in_house` | External orders skip this |
| `test_transition_creates_audit_log` | Audit trail maintained |
| `test_completion_triggers_notification` | Clinician notified |
| `test_sample_collection_records_user` | Collector tracked |
| `test_processing_assigns_technician` | Auto-assignment |

---

### 3. External Lab Requisition PDF Generation

**Module**: `hmis/apps/laboratory/services/requisition.py`

**Purpose**: Generate PDF requisition forms for external lab referrals.

**Implementation**:
```python
from django.template.loader import render_to_string
from weasyprint import HTML
from io import BytesIO

class ExternalLabRequisition:
    """Generate PDF requisition for external lab orders."""

    def __init__(self, lab_order: LabOrder):
        if lab_order.order_type != 'external':
            raise ValueError("Requisition only for external orders")
        self.lab_order = lab_order
        self.patient = lab_order.patient
        self.encounter = lab_order.encounter

    def generate_pdf(self) -> BytesIO:
        """
        Generate PDF requisition form.

        Returns:
            BytesIO buffer containing PDF
        """
        context = self._build_context()
        html_content = render_to_string('laboratory/requisition.html', context)

        pdf_buffer = BytesIO()
        HTML(string=html_content).write_pdf(pdf_buffer)
        pdf_buffer.seek(0)

        return pdf_buffer

    def _build_context(self) -> dict:
        """Build template context."""
        return {
            # Facility info
            'facility_name': settings.FACILITY_NAME,
            'facility_address': settings.FACILITY_ADDRESS,
            'facility_phone': settings.FACILITY_PHONE,
            'facility_email': settings.FACILITY_EMAIL,
            'facility_license': settings.FACILITY_LICENSE,
            'facility_logo_url': settings.FACILITY_LOGO_URL,

            # Requisition info
            'requisition_number': self.lab_order.order_number,
            'requisition_date': self.lab_order.created_at,
            'priority': self.lab_order.queue_entry.priority if hasattr(self.lab_order, 'queue_entry') else 'routine',

            # Patient info
            'patient_name': self.patient.get_full_name(),
            'patient_mrn': self.patient.mrn,
            'patient_dob': self.patient.date_of_birth,
            'patient_age': self.patient.get_age(),
            'patient_gender': self.patient.get_gender_display(),
            'patient_phone': self.patient.phone_number,

            # Clinical info
            'ordering_clinician': self.encounter.clinician.get_full_name() if self.encounter.clinician else '',
            'clinical_indication': self.lab_order.clinical_indication,
            'icd10_code': self.lab_order.icd10_code,
            'diagnosis': self.lab_order.provisional_diagnosis,

            # Test info
            'test_code': self.lab_order.test_code,
            'test_name': self.lab_order.test_name,
            'sample_type': self.lab_order.sample_type,
            'special_instructions': self.lab_order.special_instructions,

            # External lab info (if specified)
            'external_lab_name': self.lab_order.external_lab_name,
            'external_lab_address': self.lab_order.external_lab_address,
        }

    def save_to_order(self) -> str:
        """Generate PDF and save to lab order."""
        pdf_buffer = self.generate_pdf()
        filename = f"requisition_{self.lab_order.order_number}.pdf"

        self.lab_order.requisition_pdf.save(filename, ContentFile(pdf_buffer.read()))
        return self.lab_order.requisition_pdf.url
```

**HTML Template** (`templates/laboratory/requisition.html`):
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Professional requisition form styling */
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; }
        .logo { max-height: 80px; }
        .title { font-size: 24px; font-weight: bold; text-align: center; }
        .section { margin: 15px 0; padding: 10px; border: 1px solid #ddd; }
        .section-title { font-weight: bold; background: #f5f5f5; padding: 5px; }
        .field { display: flex; margin: 5px 0; }
        .label { width: 150px; font-weight: bold; }
        .value { flex: 1; }
        .priority-stat { color: red; font-weight: bold; }
        .priority-urgent { color: orange; font-weight: bold; }
        .footer { margin-top: 30px; border-top: 1px solid #333; padding-top: 10px; }
        .signature-line { border-bottom: 1px solid #333; width: 200px; margin-top: 40px; }
    </style>
</head>
<body>
    <!-- Requisition content -->
</body>
</html>
```

**Test Coverage**: 10 tests

| Test | Description |
|------|-------------|
| `test_requisition_only_for_external` | Rejects in-house orders |
| `test_pdf_generation_success` | PDF buffer returned |
| `test_pdf_contains_patient_info` | Patient details in PDF |
| `test_pdf_contains_facility_info` | Facility letterhead |
| `test_pdf_contains_test_info` | Test code, name, sample type |
| `test_pdf_contains_clinical_info` | Indication, diagnosis |
| `test_priority_highlighted` | STAT/Urgent styling |
| `test_requisition_number_on_pdf` | Unique tracking number |
| `test_save_to_order` | PDF attached to order |
| `test_pdf_filename_format` | Proper filename |

---

### 4. Lab Result Entry Model (Extended)

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: Enhanced result entry with reference ranges, flags, and validation.

**Extended Fields**:
```python
class LabResult(models.Model):
    """Result for a lab order - extended for result entry workflow."""

    class Flag(models.TextChoices):
        NORMAL = 'N', 'Normal'
        LOW = 'L', 'Low'
        HIGH = 'H', 'High'
        CRITICAL_LOW = 'LL', 'Critical Low'
        CRITICAL_HIGH = 'HH', 'Critical High'
        ABNORMAL = 'A', 'Abnormal'

    id = models.BigAutoField(primary_key=True)

    # Linkage
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='results')

    # Result identification
    parameter_code = models.CharField(max_length=20)  # LOINC component code
    parameter_name = models.CharField(max_length=100)

    # Result value
    value = models.CharField(max_length=100)
    value_numeric = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    unit = models.CharField(max_length=50, blank=True)

    # Reference range
    reference_range_text = models.CharField(max_length=100, blank=True)  # "3.5-5.0"
    reference_low = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    reference_high = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)

    # Flags
    flag = models.CharField(max_length=2, choices=Flag.choices, default=Flag.NORMAL)
    is_critical = models.BooleanField(default=False)  # Requires immediate attention

    # Comments
    result_comment = models.TextField(blank=True)
    internal_note = models.TextField(blank=True)  # Lab staff only

    # Method/Equipment
    method = models.CharField(max_length=100, blank=True)  # Testing methodology
    equipment = models.CharField(max_length=100, blank=True)  # Analyzer used

    # Entry tracking
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='lab_results_entered'
    )
    entered_at = models.DateTimeField(auto_now_add=True)

    # Verification (for critical results)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lab_results_verified'
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    # Amendment tracking
    is_amended = models.BooleanField(default=False)
    amendment_reason = models.TextField(blank=True)
    original_value = models.CharField(max_length=100, blank=True)
    amended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='lab_results_amended'
    )
    amended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['parameter_name']
        unique_together = ['lab_order', 'parameter_code']


class LabResultTemplate(models.Model):
    """Template for lab test parameters with reference ranges."""

    id = models.BigAutoField(primary_key=True)

    # Test identification
    test_code = models.CharField(max_length=20)  # LOINC code
    test_name = models.CharField(max_length=200)

    # Parameter details
    parameter_code = models.CharField(max_length=20)
    parameter_name = models.CharField(max_length=100)
    unit = models.CharField(max_length=50)

    # Reference ranges by demographic
    # Stored as JSON for flexibility
    reference_ranges = models.JSONField(default=dict)
    # Example: {
    #   "adult_male": {"low": 4.5, "high": 5.5},
    #   "adult_female": {"low": 4.0, "high": 5.0},
    #   "pediatric": {"low": 3.5, "high": 5.0},
    #   "default": {"low": 4.0, "high": 5.5}
    # }

    # Critical values
    critical_low = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    critical_high = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)

    # Display
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['test_code', 'display_order']
        unique_together = ['test_code', 'parameter_code']

    def get_reference_range(self, patient: 'Patient') -> tuple:
        """Get appropriate reference range for patient demographics."""
        age = patient.get_age()
        gender = patient.gender

        ranges = self.reference_ranges

        # Determine category
        if age < 18:
            category = 'pediatric'
        elif gender == 'M':
            category = 'adult_male'
        else:
            category = 'adult_female'

        range_data = ranges.get(category, ranges.get('default', {}))
        return (range_data.get('low'), range_data.get('high'))
```

**Methods**:
- `evaluate_flag()`: Auto-calculate flag based on value vs reference
- `is_within_range()`: Check if value is normal
- `requires_verification()`: Check if critical and needs verification
- `verify(user)`: Verify critical result
- `amend(user, new_value, reason)`: Amend result with audit trail

**Test Coverage**: 16 tests

| Test | Description |
|------|-------------|
| `test_result_creation_with_order` | Result linked to order |
| `test_parameter_uniqueness_per_order` | No duplicate parameters |
| `test_numeric_value_parsing` | Value converted to numeric |
| `test_flag_calculation_normal` | Within range = Normal |
| `test_flag_calculation_high` | Above range = High |
| `test_flag_calculation_low` | Below range = Low |
| `test_flag_calculation_critical_high` | Above critical = Critical High |
| `test_flag_calculation_critical_low` | Below critical = Critical Low |
| `test_critical_requires_verification` | Critical values need verification |
| `test_verification_by_different_user` | Cannot self-verify critical |
| `test_amendment_tracking` | Original value preserved |
| `test_amendment_requires_reason` | Reason mandatory |
| `test_reference_range_by_gender` | Male/Female ranges |
| `test_reference_range_by_age` | Pediatric vs adult |
| `test_result_comment` | Comments stored |
| `test_entered_by_recorded` | Entry user tracked |

---

### 5. Reference Range Configuration

**Module**: `hmis/apps/laboratory/models.py` (LabResultTemplate)

**Purpose**: Store and manage reference ranges for lab parameters.

**Sample Data Migration**:
```python
# migrations/0005_populate_reference_ranges.py

def populate_cbc_ranges(apps, schema_editor):
    """Populate Complete Blood Count reference ranges."""
    LabResultTemplate = apps.get_model('laboratory', 'LabResultTemplate')

    cbc_parameters = [
        {
            'test_code': 'CBC',
            'test_name': 'Complete Blood Count',
            'parameter_code': 'WBC',
            'parameter_name': 'White Blood Cell Count',
            'unit': '×10⁹/L',
            'reference_ranges': {
                'adult_male': {'low': 4.5, 'high': 11.0},
                'adult_female': {'low': 4.5, 'high': 11.0},
                'pediatric': {'low': 5.0, 'high': 15.0},
            },
            'critical_low': 2.0,
            'critical_high': 30.0,
        },
        {
            'test_code': 'CBC',
            'test_name': 'Complete Blood Count',
            'parameter_code': 'RBC',
            'parameter_name': 'Red Blood Cell Count',
            'unit': '×10¹²/L',
            'reference_ranges': {
                'adult_male': {'low': 4.5, 'high': 5.5},
                'adult_female': {'low': 4.0, 'high': 5.0},
                'pediatric': {'low': 4.0, 'high': 5.5},
            },
            'critical_low': 2.5,
            'critical_high': 8.0,
        },
        {
            'test_code': 'CBC',
            'test_name': 'Complete Blood Count',
            'parameter_code': 'HGB',
            'parameter_name': 'Hemoglobin',
            'unit': 'g/dL',
            'reference_ranges': {
                'adult_male': {'low': 13.5, 'high': 17.5},
                'adult_female': {'low': 12.0, 'high': 16.0},
                'pediatric': {'low': 11.0, 'high': 14.0},
            },
            'critical_low': 7.0,
            'critical_high': 20.0,
        },
        # ... more parameters
    ]

    for param in cbc_parameters:
        LabResultTemplate.objects.create(**param)
```

**Common Test Panels to Implement**:

| Panel | Parameters | Status |
|-------|------------|--------|
| CBC (Complete Blood Count) | WBC, RBC, HGB, HCT, PLT, MCV, MCH, MCHC | Included |
| Liver Function | ALT, AST, ALP, GGT, Bilirubin, Albumin | Included |
| Kidney Function | Creatinine, BUN, eGFR, Uric Acid | Included |
| Lipid Profile | Total Chol, LDL, HDL, Triglycerides | Included |
| Blood Glucose | Fasting, Random, HbA1c | Included |
| Electrolytes | Na, K, Cl, CO2 | Included |
| Thyroid Function | TSH, T3, T4 | Included |
| Urinalysis | pH, Protein, Glucose, etc. | Included |

**Test Coverage**: 8 tests

| Test | Description |
|------|-------------|
| `test_template_creation` | Template with ranges |
| `test_get_reference_adult_male` | Male ranges returned |
| `test_get_reference_adult_female` | Female ranges returned |
| `test_get_reference_pediatric` | Child ranges returned |
| `test_get_reference_fallback` | Default if missing |
| `test_critical_values` | Critical thresholds |
| `test_panel_parameters_ordered` | Display order |
| `test_test_code_parameter_uniqueness` | Unique constraint |

---

### 6. Lab Result Notifications

**Module**: `hmis/apps/laboratory/notifications.py`

**Purpose**: Notify clinicians when lab results are ready, with priority for critical values.

**Implementation**:
```python
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from hmis.apps.core.models import Notification

class LabNotificationService:
    """Handle lab result notifications."""

    def send_result_notification(self, lab_order: LabOrder):
        """
        Send notification when results are ready.

        Creates in-app notification and optionally sends email.
        """
        clinician = lab_order.encounter.clinician
        patient = lab_order.patient

        # Check for critical results
        has_critical = lab_order.results.filter(is_critical=True).exists()

        # Determine priority
        priority = 'critical' if has_critical else 'normal'

        # Create in-app notification
        notification = Notification.objects.create(
            user=clinician,
            notification_type='lab_result',
            priority=priority,
            title=self._get_notification_title(lab_order, has_critical),
            message=self._get_notification_message(lab_order),
            related_model='LabOrder',
            related_id=lab_order.id,
            action_url=f'/encounters/{lab_order.encounter.id}/lab/{lab_order.id}/'
        )

        # Send email for critical results
        if has_critical and clinician.email:
            self._send_critical_email(clinician, lab_order)

        return notification

    def _get_notification_title(self, lab_order: LabOrder, has_critical: bool) -> str:
        """Generate notification title."""
        if has_critical:
            return f"🚨 CRITICAL: Lab Results Ready - {lab_order.test_name}"
        return f"Lab Results Ready - {lab_order.test_name}"

    def _get_notification_message(self, lab_order: LabOrder) -> str:
        """Generate notification message."""
        patient = lab_order.patient
        critical_results = lab_order.results.filter(is_critical=True)

        message = f"Results for {patient.get_full_name()} ({patient.mrn}) are now available."

        if critical_results.exists():
            critical_params = ", ".join([r.parameter_name for r in critical_results])
            message += f"\n\n⚠️ Critical values detected: {critical_params}"

        return message

    def _send_critical_email(self, clinician: User, lab_order: LabOrder):
        """Send email for critical lab results."""
        context = {
            'clinician_name': clinician.get_full_name(),
            'patient_name': lab_order.patient.get_full_name(),
            'patient_mrn': lab_order.patient.mrn,
            'test_name': lab_order.test_name,
            'critical_results': lab_order.results.filter(is_critical=True),
            'result_url': f"{settings.FRONTEND_URL}/encounters/{lab_order.encounter.id}/lab/{lab_order.id}/",
        }

        html_message = render_to_string('laboratory/email/critical_result.html', context)
        plain_message = render_to_string('laboratory/email/critical_result.txt', context)

        send_mail(
            subject=f"🚨 CRITICAL Lab Result - {lab_order.patient.get_full_name()}",
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[clinician.email],
            html_message=html_message,
            fail_silently=False,
        )

    def send_pending_collection_reminder(self, lab_order: LabOrder):
        """Remind about uncollected samples."""
        # Implementation for overdue sample collection
        pass

    def send_external_result_received(self, lab_order: LabOrder):
        """Notify when external lab results are received."""
        # Implementation for external results
        pass
```

**Notification Model (in core)**:
```python
class Notification(models.Model):
    """In-app notification for users."""

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        NORMAL = 'normal', 'Normal'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=50)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMAL)
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

    class Meta:
        ordering = ['-created_at']
```

**Test Coverage**: 10 tests

| Test | Description |
|------|-------------|
| `test_notification_created_on_release` | In-app notification created |
| `test_critical_notification_priority` | Critical flag sets priority |
| `test_notification_title_normal` | Standard title format |
| `test_notification_title_critical` | Critical title with emoji |
| `test_notification_message_content` | Patient info included |
| `test_critical_email_sent` | Email for critical results |
| `test_email_not_sent_for_normal` | No email for normal results |
| `test_notification_action_url` | Link to results |
| `test_mark_as_read` | Read status updated |
| `test_clinician_notifications_list` | Filter by user |

---

### 7. Lab Result Attachments

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: Support scanned result attachments for external lab results.

**Fields**:
```python
class LabResultAttachment(models.Model):
    """Scanned or uploaded lab result document."""

    class AttachmentType(models.TextChoices):
        SCANNED_RESULT = 'scanned', 'Scanned Result'
        EXTERNAL_REPORT = 'external', 'External Lab Report'
        GRAPH = 'graph', 'Result Graph'
        IMAGE = 'image', 'Lab Image'
        OTHER = 'other', 'Other'

    id = models.BigAutoField(primary_key=True)

    # Linkage
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='attachments')

    # File
    file = models.FileField(upload_to='lab_results/%Y/%m/')
    filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=50)  # MIME type
    file_size = models.IntegerField()  # Bytes

    # Metadata
    attachment_type = models.CharField(max_length=20, choices=AttachmentType.choices)
    description = models.CharField(max_length=255, blank=True)

    # Audit
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def save(self, *args, **kwargs):
        if self.file:
            self.filename = self.file.name
            self.file_type = self._get_mime_type()
            self.file_size = self.file.size
        super().save(*args, **kwargs)

    def _get_mime_type(self) -> str:
        """Determine MIME type from file."""
        import mimetypes
        mime_type, _ = mimetypes.guess_type(self.file.name)
        return mime_type or 'application/octet-stream'
```

**File Validation**:
```python
from django.core.validators import FileExtensionValidator
from django.core.exceptions import ValidationError

ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif']
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_lab_attachment(file):
    """Validate lab result attachment."""
    # Check extension
    ext = file.name.split('.')[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Check size
    if file.size > MAX_FILE_SIZE:
        raise ValidationError(f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB")

    # Check for malicious content (basic)
    if file.content_type not in ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']:
        raise ValidationError("Invalid file content type")
```

**Test Coverage**: 8 tests

| Test | Description |
|------|-------------|
| `test_attachment_upload` | File uploaded successfully |
| `test_attachment_linked_to_order` | Attachment on correct order |
| `test_file_metadata_extracted` | Size, type recorded |
| `test_allowed_extensions` | PDF, PNG, JPG accepted |
| `test_rejected_extension` | .exe, .js rejected |
| `test_file_size_limit` | >10MB rejected |
| `test_uploaded_by_recorded` | User tracked |
| `test_multiple_attachments` | Multiple files per order |

---

### 8. Lab Order API (Extended)

**Module**: `hmis/apps/laboratory/views.py`

**Endpoints**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lab/orders/` | GET | List lab orders (paginated, filterable) |
| `/api/lab/orders/` | POST | Create new lab order |
| `/api/lab/orders/{id}/` | GET | Get order details with results |
| `/api/lab/orders/{id}/collect/` | POST | Record sample collection |
| `/api/lab/orders/{id}/start-processing/` | POST | Start processing (in-house) |
| `/api/lab/orders/{id}/complete/` | POST | Complete and release results |
| `/api/lab/orders/{id}/cancel/` | POST | Cancel order |
| `/api/lab/orders/{id}/requisition/` | GET | Download PDF requisition |
| `/api/lab/queue/` | GET | Lab queue/worklist |
| `/api/lab/queue/stats/` | GET | Queue statistics |
| `/api/lab/templates/` | GET | List test templates |
| `/api/lab/templates/{test_code}/` | GET | Get template parameters |

**Test Coverage**: 12 tests

| Test | Description |
|------|-------------|
| `test_list_orders_authenticated` | List with pagination |
| `test_list_orders_filter_by_status` | Filter by status |
| `test_list_orders_filter_by_patient` | Filter by patient |
| `test_create_in_house_order` | Create in-house order |
| `test_create_external_order` | Create external order |
| `test_collect_sample_endpoint` | Status transition |
| `test_start_processing_endpoint` | In-house only |
| `test_complete_order_endpoint` | Results required |
| `test_cancel_order_endpoint` | With reason |
| `test_download_requisition` | PDF returned |
| `test_queue_worklist` | Pending orders list |
| `test_queue_stats` | Statistics returned |

---

### 9. Lab Result API

**Module**: `hmis/apps/laboratory/views.py`

**Endpoints**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lab/orders/{id}/results/` | GET | List results for order |
| `/api/lab/orders/{id}/results/` | POST | Enter result (single) |
| `/api/lab/orders/{id}/results/bulk/` | POST | Enter results (batch) |
| `/api/lab/orders/{id}/results/{result_id}/` | PATCH | Update/amend result |
| `/api/lab/orders/{id}/results/{result_id}/verify/` | POST | Verify critical result |
| `/api/lab/orders/{id}/attachments/` | GET | List attachments |
| `/api/lab/orders/{id}/attachments/` | POST | Upload attachment |
| `/api/lab/orders/{id}/attachments/{att_id}/` | DELETE | Delete attachment |
| `/api/lab/results/critical/` | GET | List critical results |
| `/api/lab/results/pending-verification/` | GET | Results needing verification |

**Test Coverage**: 14 tests

| Test | Description |
|------|-------------|
| `test_list_results` | Results for order |
| `test_enter_single_result` | Single parameter entry |
| `test_enter_bulk_results` | Multiple parameters |
| `test_auto_flag_calculation` | Flags auto-calculated |
| `test_update_result` | Value updated |
| `test_amend_result` | Amendment with reason |
| `test_verify_critical_result` | Verification endpoint |
| `test_verify_requires_different_user` | Cannot self-verify |
| `test_upload_attachment` | File upload |
| `test_delete_attachment` | File removed |
| `test_list_critical_results` | Filter critical |
| `test_pending_verification_list` | Unverified criticals |
| `test_result_entry_creates_audit` | Audit trail |
| `test_unauthorized_result_entry` | Permission required |

---

### 10. Lab Reports/Analytics

**Module**: `hmis/apps/laboratory/reports.py`

**Reports**:

```python
class LabReportService:
    """Generate lab analytics and reports."""

    def turnaround_time_report(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Lab turnaround time analysis.

        Returns:
            - Average TAT by test type
            - TAT by priority
            - Outliers
        """
        pass

    def workload_report(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Lab workload statistics.

        Returns:
            - Tests per day
            - Tests by type
            - Tests by technician
        """
        pass

    def critical_values_report(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Critical value statistics.

        Returns:
            - Count by parameter
            - Notification response time
        """
        pass

    def sample_rejection_report(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Sample rejection analysis.

        Returns:
            - Rejection rate
            - Reasons breakdown
        """
        pass
```

**Test Coverage**: 8 tests

| Test | Description |
|------|-------------|
| `test_turnaround_time_calculation` | TAT by test |
| `test_tat_by_priority` | STAT vs routine |
| `test_workload_by_day` | Daily volume |
| `test_workload_by_technician` | Staff productivity |
| `test_critical_values_count` | Critical summary |
| `test_critical_notification_time` | Response metrics |
| `test_rejection_rate` | Rejection percentage |
| `test_rejection_reasons` | Reason breakdown |

---

## Database Migrations

### Migration Order

1. `0001_lab_queue.py` - LabQueue model
2. `0002_lab_result_extended.py` - Extended LabResult fields
3. `0003_lab_result_template.py` - LabResultTemplate model
4. `0004_lab_attachment.py` - LabResultAttachment model
5. `0005_notification.py` - Notification model (core app)
6. `0006_populate_templates.py` - Reference range data

---

## Settings Configuration

Add to `hmis/settings/base.py`:

```python
# Laboratory Configuration
LAB_QUEUE_PREFIX = 'LAB-'
LAB_SAMPLE_EXPIRY_HOURS = 24  # Hours before sample considered expired
LAB_CRITICAL_NOTIFICATION_EMAIL = True  # Send email for critical values
LAB_AUTO_RELEASE_NON_CRITICAL = False  # Auto-release non-critical results

# Facility Branding (for requisitions)
FACILITY_NAME = env('FACILITY_NAME', default='Demo Health Facility')
FACILITY_ADDRESS = env('FACILITY_ADDRESS', default='P.O. Box 00000, Nairobi, Kenya')
FACILITY_PHONE = env('FACILITY_PHONE', default='+254 700 000 000')
FACILITY_EMAIL = env('FACILITY_EMAIL', default='lab@facility.example')
FACILITY_LICENSE = env('FACILITY_LICENSE', default='MF-00000')
FACILITY_LOGO_URL = env('FACILITY_LOGO_URL', default='/static/images/logo.png')

# File Upload
LAB_ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024  # 10MB
LAB_ATTACHMENT_ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']
```

---

## Implementation Timeline

| Week | Tasks | Deliverables |
|------|-------|--------------|
| **Week 9** | Lab Queue, Status Workflow, tests | Queue management with 26 tests passing |
| **Week 10** | External Requisition PDF, Result Entry, tests | PDF generation, result forms |
| **Week 11** | Notifications, Attachments, APIs, tests | Complete notification system |
| **Week 12** | Reports, integration testing, documentation | Complete lab workflow module |

---

## Dependencies

### Internal Dependencies
- `patients` app - Patient model
- `encounters` app - Encounter model
- `core` app - AuditLog, Notification models

### External Dependencies
```
# Add to pyproject.toml
weasyprint>=60.0  # For PDF generation
Pillow>=10.0.0    # For image processing
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex workflow states | High | Comprehensive state machine tests |
| PDF generation issues | Medium | Template testing, fallback to simple format |
| Large file uploads | Medium | Size limits, async processing |
| Critical value delays | High | Priority queue, immediate notifications |

---

## Success Criteria

- [ ] All 112+ tests passing
- [ ] ≥85% code coverage
- [ ] Lab queue functional (assign, collect, process, release)
- [ ] PDF requisitions generating correctly
- [ ] Result entry with auto-flagging working
- [ ] Critical value notifications immediate
- [ ] File attachments uploading/downloading
- [ ] Reference ranges for common panels loaded
- [ ] API documentation complete
- [ ] No critical security issues

---

## Appendix: Sample Test File Structure

```
backend/tests/
├── laboratory/
│   ├── __init__.py
│   ├── conftest.py              # Lab fixtures
│   ├── test_models/
│   │   ├── test_lab_queue.py    # 14 tests
│   │   ├── test_lab_result.py   # 16 tests
│   │   ├── test_result_template.py # 8 tests
│   │   └── test_attachment.py   # 8 tests
│   ├── test_services/
│   │   ├── test_workflow.py     # 12 tests
│   │   ├── test_requisition.py  # 10 tests
│   │   └── test_notification.py # 10 tests
│   ├── test_api/
│   │   ├── test_order_api.py    # 12 tests
│   │   └── test_result_api.py   # 14 tests
│   └── test_reports/
│       └── test_lab_reports.py  # 8 tests
```

---

**Document Version**: 1.0
**Created**: January 2, 2026
**Author**: Engineering Team
**Review Status**: DRAFT - Pending stakeholder review
