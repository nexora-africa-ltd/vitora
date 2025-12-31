# Sprint 1.3-1.4 Track B: Lab/Investigations Foundation - Deliverables

**Sprint Duration**: Weeks 5-8 (Phase 1)
**Status**: 📋 PLANNED
**Target Date**: Q1 2026

---

## Executive Summary

Track B of Sprint 1.3-1.4 implements the Laboratory and Investigations Foundation for Vitora HMIS. This module enables ordering lab tests from clinical encounters, tracking test status, recording results, and supporting both in-house laboratory processing and external lab referrals—a critical workflow in Kenya's healthcare facilities.

### Key Deliverables

| Deliverable | Tests Required | Priority |
|-------------|----------------|----------|
| TestCatalog Model | 10 tests | High |
| LabOrder Model | 18 tests | High |
| LabResult Model | 16 tests | High |
| LabOrderItem Model | 12 tests | High |
| LOINC Code Reference | 8 tests | Medium |
| Lab Order API | 16 tests | High |
| Lab Result API | 14 tests | High |
| Lab Workflow Status | 12 tests | High |
| External Lab Integration | 10 tests | Medium |

**Total Planned Tests**: ~116 tests
**Target Coverage**: ≥85%

---

## Kenya Healthcare Context

### Lab Testing Landscape

1. **Tier 1 (Dispensaries)**: Basic tests only, most referred
2. **Tier 2 (Health Centers)**: Basic hematology, urinalysis, malaria RDT
3. **Tier 3 (Sub-County Hospitals)**: Full clinical chemistry, hematology
4. **Tier 4 (County Hospitals)**: Advanced testing, histopathology
5. **Tier 5 (National Referral)**: Specialized testing, research

### Common Test Categories

- **Hematology**: CBC, blood grouping, ESR
- **Clinical Chemistry**: RBS, lipid panel, LFTs, RFTs
- **Microbiology**: Culture & sensitivity, urinalysis
- **Serology**: HIV, Hepatitis B/C, Widal, VDRL
- **Parasitology**: Malaria (microscopy/RDT), stool examination
- **Immunology**: CD4 count, viral load
- **Imaging**: X-ray, ultrasound (handled separately)

### External Lab Partners

- **KEMRI**: Research and specialized tests
- **Lancet Kenya**: Private lab chain
- **PathCare**: Private lab network
- **National Public Health Labs**: Reference testing

---

## Components to Implement

### 1. TestCatalog Model

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: Master catalog of available laboratory tests.

**Fields**:
```python
class TestCatalog(models.Model):
    """Laboratory test master catalog."""
    
    TEST_CATEGORIES = [
        ('HEMATOLOGY', 'Hematology'),
        ('CHEMISTRY', 'Clinical Chemistry'),
        ('MICROBIOLOGY', 'Microbiology'),
        ('SEROLOGY', 'Serology'),
        ('PARASITOLOGY', 'Parasitology'),
        ('IMMUNOLOGY', 'Immunology'),
        ('URINALYSIS', 'Urinalysis'),
        ('HISTOPATHOLOGY', 'Histopathology'),
        ('CYTOLOGY', 'Cytology'),
        ('MOLECULAR', 'Molecular Diagnostics'),
        ('OTHER', 'Other'),
    ]
    
    SPECIMEN_TYPES = [
        ('BLOOD', 'Whole Blood'),
        ('SERUM', 'Serum'),
        ('PLASMA', 'Plasma'),
        ('URINE', 'Urine'),
        ('STOOL', 'Stool'),
        ('CSF', 'Cerebrospinal Fluid'),
        ('SPUTUM', 'Sputum'),
        ('SWAB', 'Swab'),
        ('TISSUE', 'Tissue'),
        ('ASPIRATE', 'Aspirate'),
        ('OTHER', 'Other'),
    ]
    
    # Identity
    code = models.CharField(max_length=50, unique=True)  # Internal code
    name = models.CharField(max_length=200)  # Test name
    short_name = models.CharField(max_length=50)  # Abbreviation
    loinc_code = models.CharField(max_length=20, null=True, blank=True)  # LOINC mapping
    
    # Classification
    category = models.CharField(max_length=30, choices=TEST_CATEGORIES)
    specimen_type = models.CharField(max_length=20, choices=SPECIMEN_TYPES)
    
    # Requirements
    requires_fasting = models.BooleanField(default=False)
    special_instructions = models.TextField(blank=True)
    turnaround_hours = models.IntegerField(default=24)  # Expected TAT
    
    # Availability
    available_in_house = models.BooleanField(default=True)
    external_lab_partner = models.CharField(max_length=100, blank=True)
    
    # Pricing
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sha_claimable = models.BooleanField(default=True)  # Kenya SHA coverage
    
    # Result configuration
    result_type = models.CharField(max_length=20, choices=[
        ('NUMERIC', 'Numeric Value'),
        ('TEXT', 'Text Result'),
        ('OPTIONS', 'Predefined Options'),
        ('PANEL', 'Multi-component Panel'),
    ])
    result_unit = models.CharField(max_length=30, blank=True)  # e.g., "mg/dL"
    normal_range_male = models.CharField(max_length=50, blank=True)  # e.g., "4.5-5.5"
    normal_range_female = models.CharField(max_length=50, blank=True)
    normal_range_child = models.CharField(max_length=50, blank=True)
    result_options = models.JSONField(default=list)  # For OPTIONS type
    
    # Panel components (for PANEL type)
    is_panel = models.BooleanField(default=False)
    panel_components = models.ManyToManyField('self', symmetrical=False, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Methods**:
- `get_normal_range(patient)`: Returns appropriate range based on gender/age
- `is_result_abnormal(value, patient)`: Check if result is outside normal range
- `get_panel_tests()`: Get component tests if this is a panel

**Pre-seeded Tests** (Kenya Essential):
```python
ESSENTIAL_TESTS = [
    # Hematology
    ("CBC", "Complete Blood Count", "HEMATOLOGY", "BLOOD", True),
    ("HB", "Hemoglobin", "HEMATOLOGY", "BLOOD", True),
    ("ESR", "Erythrocyte Sedimentation Rate", "HEMATOLOGY", "BLOOD", True),
    ("BG", "Blood Grouping & Rh", "HEMATOLOGY", "BLOOD", True),
    ("PT_INR", "Prothrombin Time/INR", "HEMATOLOGY", "BLOOD", True),
    
    # Chemistry
    ("RBS", "Random Blood Sugar", "CHEMISTRY", "BLOOD", True),
    ("FBS", "Fasting Blood Sugar", "CHEMISTRY", "BLOOD", True),
    ("LIPID", "Lipid Profile", "CHEMISTRY", "SERUM", True),
    ("LFT", "Liver Function Tests", "CHEMISTRY", "SERUM", True),
    ("RFT", "Renal Function Tests", "CHEMISTRY", "SERUM", True),
    ("ELEC", "Electrolytes", "CHEMISTRY", "SERUM", True),
    
    # Serology
    ("HIV", "HIV 1&2 Antibody", "SEROLOGY", "BLOOD", True),
    ("HBSAG", "Hepatitis B Surface Antigen", "SEROLOGY", "SERUM", True),
    ("WIDAL", "Widal Test", "SEROLOGY", "SERUM", True),
    ("VDRL", "VDRL/RPR", "SEROLOGY", "SERUM", True),
    
    # Parasitology
    ("MPS", "Malaria Parasites (Microscopy)", "PARASITOLOGY", "BLOOD", True),
    ("MRDT", "Malaria RDT", "PARASITOLOGY", "BLOOD", True),
    ("STOOL", "Stool Examination", "PARASITOLOGY", "STOOL", True),
    
    # Urinalysis
    ("UA", "Urinalysis", "URINALYSIS", "URINE", True),
    ("UC", "Urine Culture", "MICROBIOLOGY", "URINE", True),
    
    # Immunology
    ("CD4", "CD4 Count", "IMMUNOLOGY", "BLOOD", False),  # Often external
    ("VL", "Viral Load", "MOLECULAR", "BLOOD", False),  # Often external
]
```

**Test Coverage**: 10 tests
- Test creation with required fields
- Test code uniqueness
- LOINC code assignment
- Category and specimen validation
- Normal range by gender/age
- Result abnormality detection
- Panel component relationships
- In-house vs external designation
- Active/inactive filtering
- Cost and SHA claimability

---

### 2. LabOrder Model

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: Order for laboratory tests linked to patient encounter.

**Fields**:
```python
class LabOrder(models.Model):
    """Laboratory test order from clinical encounter."""
    
    ORDER_TYPES = [
        ('IN_HOUSE', 'In-House Processing'),
        ('EXTERNAL', 'External Lab Referral'),
    ]
    
    ORDER_STATUS = [
        ('DRAFT', 'Draft'),
        ('ORDERED', 'Ordered'),
        ('SPECIMEN_COLLECTED', 'Specimen Collected'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
        ('REJECTED', 'Rejected'),
    ]
    
    PRIORITY_LEVELS = [
        ('ROUTINE', 'Routine'),
        ('URGENT', 'Urgent'),
        ('STAT', 'STAT (Immediate)'),
    ]
    
    # Identity
    order_number = models.CharField(max_length=30, unique=True, editable=False)
    
    # Relationships
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT)
    encounter = models.ForeignKey('encounters.Encounter', on_delete=models.PROTECT)
    ordered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='lab_orders')
    
    # Order details
    order_type = models.CharField(max_length=20, choices=ORDER_TYPES, default='IN_HOUSE')
    external_lab = models.CharField(max_length=100, blank=True)  # If external
    priority = models.CharField(max_length=20, choices=PRIORITY_LEVELS, default='ROUTINE')
    clinical_notes = models.TextField(blank=True)  # Clinical context for lab
    
    # Status tracking
    status = models.CharField(max_length=30, choices=ORDER_STATUS, default='DRAFT')
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(
        User, null=True, on_delete=models.SET_NULL, 
        related_name='lab_status_changes'
    )
    
    # Specimen tracking
    specimen_collected = models.BooleanField(default=False)
    specimen_collected_at = models.DateTimeField(null=True, blank=True)
    specimen_collected_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='specimens_collected'
    )
    
    # External lab details
    external_requisition_sent = models.BooleanField(default=False)
    external_requisition_date = models.DateTimeField(null=True, blank=True)
    external_accession_number = models.CharField(max_length=50, blank=True)
    
    # Billing
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)
    
    # Timestamps
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Methods**:
- `generate_order_number()`: Auto-generate unique order number (LAB-YYYYMMDD-XXXX)
- `calculate_total_cost()`: Sum of all ordered test costs
- `update_status(new_status, user)`: Status transition with validation
- `mark_specimen_collected(user)`: Record specimen collection
- `generate_external_requisition()`: Generate PDF for external lab
- `get_pending_results()`: Tests without results
- `is_complete()`: All tests have results
- `get_turnaround_time()`: Time from order to completion

**Status Workflow**:
```
DRAFT → ORDERED → SPECIMEN_COLLECTED → IN_PROGRESS → COMPLETED
                                    ↘ REJECTED
                ↘ CANCELLED
```

**Test Coverage**: 18 tests
- Order creation from encounter
- Order number auto-generation
- Order number uniqueness
- Status workflow transitions
- Invalid status transition rejection
- Specimen collection recording
- External lab designation
- Priority level assignment
- Clinical notes attachment
- Total cost calculation
- Ordered_by user tracking
- Status change audit
- In-house vs external routing
- Order cancellation
- Order rejection with reason
- Turnaround time calculation
- Pending results identification
- Completion detection

---

### 3. LabOrderItem Model

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: Individual test items within a lab order.

**Fields**:
```python
class LabOrderItem(models.Model):
    """Individual test within a lab order."""
    
    ITEM_STATUS = [
        ('PENDING', 'Pending'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='items')
    test = models.ForeignKey(TestCatalog, on_delete=models.PROTECT)
    
    # Status
    status = models.CharField(max_length=20, choices=ITEM_STATUS, default='PENDING')
    
    # Pricing at time of order (snapshot)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Special instructions for this specific test
    special_instructions = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Methods**:
- `save()`: Auto-populate unit_cost from TestCatalog
- `has_result()`: Check if result exists for this item

**Test Coverage**: 12 tests
- Item creation with test reference
- Cost snapshot from catalog
- Status transitions
- Link to parent order
- Multiple items per order
- Item cancellation
- Result linkage
- Panel expansion (auto-add components)
- Special instructions override
- Duplicate test prevention
- Item ordering within order
- Cascade delete behavior

---

### 4. LabResult Model

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: Store laboratory test results.

**Fields**:
```python
class LabResult(models.Model):
    """Laboratory test result."""
    
    RESULT_FLAGS = [
        ('NORMAL', 'Normal'),
        ('LOW', 'Low'),
        ('HIGH', 'High'),
        ('CRITICAL_LOW', 'Critical Low'),
        ('CRITICAL_HIGH', 'Critical High'),
        ('ABNORMAL', 'Abnormal'),
        ('POSITIVE', 'Positive'),
        ('NEGATIVE', 'Negative'),
    ]
    
    VERIFICATION_STATUS = [
        ('UNVERIFIED', 'Unverified'),
        ('VERIFIED', 'Verified'),
        ('REJECTED', 'Rejected'),
    ]
    
    # Relationships
    order_item = models.OneToOneField(LabOrderItem, on_delete=models.CASCADE, related_name='result')
    
    # Result data
    numeric_value = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    text_value = models.TextField(blank=True)
    option_value = models.CharField(max_length=100, blank=True)  # For predefined options
    
    # Interpretation
    result_flag = models.CharField(max_length=20, choices=RESULT_FLAGS, blank=True)
    interpretation = models.TextField(blank=True)  # Pathologist notes
    
    # Verification
    verification_status = models.CharField(
        max_length=20, choices=VERIFICATION_STATUS, default='UNVERIFIED'
    )
    verified_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='verified_results'
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    
    # Result entry
    entered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='entered_results')
    entered_at = models.DateTimeField(auto_now_add=True)
    
    # External results
    is_external_result = models.BooleanField(default=False)
    external_result_attachment = models.FileField(
        upload_to='lab_results/', null=True, blank=True
    )
    external_result_date = models.DateField(null=True, blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**Methods**:
- `auto_flag_result()`: Automatically determine flag based on normal ranges
- `is_critical()`: Check if result is critically abnormal
- `get_formatted_value()`: Return result with unit
- `verify(user)`: Mark result as verified

**Test Coverage**: 16 tests
- Result creation for order item
- Numeric value storage
- Text value storage
- Option value storage
- Auto-flag calculation (normal)
- Auto-flag calculation (abnormal)
- Auto-flag critical low
- Auto-flag critical high
- Interpretation notes
- Verification workflow
- External result attachment
- External result date tracking
- One result per order item
- Result with unit formatting
- Critical result detection
- Entered_by tracking

---

### 5. LOINC Code Reference

**Module**: `hmis/apps/laboratory/models.py`

**Purpose**: LOINC code lookup table for interoperability.

**Fields**:
```python
class LOINCCode(models.Model):
    """LOINC code reference for lab test interoperability."""
    
    code = models.CharField(max_length=20, unique=True, primary_key=True)
    component = models.CharField(max_length=200)  # What is measured
    property = models.CharField(max_length=50)  # Characteristic (mass, volume, etc.)
    time_aspect = models.CharField(max_length=50)  # Point vs duration
    system = models.CharField(max_length=100)  # Specimen type
    scale_type = models.CharField(max_length=50)  # Quantitative, ordinal, etc.
    method_type = models.CharField(max_length=100, blank=True)
    long_common_name = models.CharField(max_length=300)
    short_name = models.CharField(max_length=100)
    
    class Meta:
        verbose_name = "LOINC Code"
        verbose_name_plural = "LOINC Codes"
```

**Data Import**:
- Import from official LOINC CSV (subset for common tests)
- Management command: `python manage.py import_loinc`

**Test Coverage**: 8 tests
- LOINC code import from CSV
- Code uniqueness
- Component search
- Short name lookup
- Long name lookup
- System (specimen) filtering
- Scale type filtering
- Test catalog LOINC linking

---

### 6. Lab Order API

**Module**: `hmis/apps/laboratory/views.py` and `hmis/apps/laboratory/urls.py`

**Endpoints**:
```
# Test Catalog
GET    /api/lab/tests/                     # List available tests
GET    /api/lab/tests/{code}/              # Get test details
GET    /api/lab/tests/search/?q=           # Search tests by name

# Lab Orders
POST   /api/lab/orders/                    # Create new lab order
GET    /api/lab/orders/                    # List lab orders (filtered)
GET    /api/lab/orders/{order_number}/     # Get order details
PATCH  /api/lab/orders/{order_number}/     # Update order (limited fields)
POST   /api/lab/orders/{order_number}/submit/           # Submit order
POST   /api/lab/orders/{order_number}/collect-specimen/ # Record collection
POST   /api/lab/orders/{order_number}/cancel/           # Cancel order
GET    /api/lab/orders/{order_number}/requisition/      # Generate PDF requisition

# Order Items
POST   /api/lab/orders/{order_number}/items/            # Add test to order
DELETE /api/lab/orders/{order_number}/items/{id}/       # Remove test

# Patient Orders
GET    /api/patients/{id}/lab-orders/      # Orders for patient
GET    /api/encounters/{id}/lab-orders/    # Orders for encounter
```

**Serializers**:
```python
class TestCatalogSerializer(serializers.ModelSerializer):
    """Serializer for test catalog listing."""
    
class TestCatalogDetailSerializer(serializers.ModelSerializer):
    """Serializer with normal ranges and panel info."""
    
class LabOrderCreateSerializer(serializers.ModelSerializer):
    """Create order with items."""
    items = LabOrderItemSerializer(many=True)
    
class LabOrderSerializer(serializers.ModelSerializer):
    """Order with status and items."""
    items = LabOrderItemSerializer(many=True, read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    ordered_by_name = serializers.CharField(source='ordered_by.get_full_name', read_only=True)
    
class LabOrderItemSerializer(serializers.ModelSerializer):
    """Order item with test details."""
    test_name = serializers.CharField(source='test.name', read_only=True)
```

**Test Coverage**: 16 tests
- List tests (authenticated)
- Search tests by name
- Create lab order from encounter
- Order number auto-generated
- Add items to order
- Remove items from order
- Submit order (status change)
- Record specimen collection
- Cancel order
- Generate PDF requisition
- Filter orders by patient
- Filter orders by encounter
- Filter orders by status
- Filter orders by date range
- Pagination on list endpoints
- Permission checking (RBAC)

---

### 7. Lab Result API

**Module**: `hmis/apps/laboratory/views.py`

**Endpoints**:
```
# Results Entry
POST   /api/lab/orders/{order_number}/results/          # Enter result for item
PATCH  /api/lab/results/{id}/                           # Update result
POST   /api/lab/results/{id}/verify/                    # Verify result

# Results Viewing
GET    /api/lab/orders/{order_number}/results/          # All results for order
GET    /api/patients/{id}/lab-results/                  # All results for patient
GET    /api/lab/results/pending-verification/           # Results needing verification

# Attachments (external results)
POST   /api/lab/results/{id}/attachment/                # Upload external result scan
```

**Serializers**:
```python
class LabResultCreateSerializer(serializers.ModelSerializer):
    """Create/update result."""
    order_item_id = serializers.IntegerField()
    
class LabResultSerializer(serializers.ModelSerializer):
    """Result with test info and flags."""
    test_name = serializers.CharField(source='order_item.test.name', read_only=True)
    test_code = serializers.CharField(source='order_item.test.code', read_only=True)
    normal_range = serializers.SerializerMethodField()
    formatted_value = serializers.SerializerMethodField()
    
class LabResultVerifySerializer(serializers.Serializer):
    """Verify result action."""
    approved = serializers.BooleanField()
    comments = serializers.CharField(required=False)
```

**Test Coverage**: 14 tests
- Enter numeric result
- Enter text result
- Enter option result
- Auto-flag on entry
- Update existing result
- Verify result (approve)
- Verify result (reject)
- List results for order
- List results for patient
- Pending verification list
- Upload external attachment
- Result permission checking
- Critical result notification trigger
- Result history tracking

---

### 8. Lab Workflow Status

**Module**: `hmis/apps/laboratory/services.py`

**Purpose**: Service layer for lab workflow management.

**Classes**:
```python
class LabWorkflowService:
    """Service for managing lab order workflow."""
    
    @staticmethod
    def submit_order(order: LabOrder, user: User) -> LabOrder:
        """Submit order for processing."""
        
    @staticmethod
    def collect_specimen(order: LabOrder, user: User) -> LabOrder:
        """Record specimen collection."""
        
    @staticmethod
    def start_processing(order: LabOrder, user: User) -> LabOrder:
        """Mark order as in progress."""
        
    @staticmethod
    def complete_order(order: LabOrder, user: User) -> LabOrder:
        """Mark order as completed (all results in)."""
        
    @staticmethod
    def cancel_order(order: LabOrder, user: User, reason: str) -> LabOrder:
        """Cancel order with reason."""
        
    @staticmethod
    def reject_specimen(order: LabOrder, user: User, reason: str) -> LabOrder:
        """Reject specimen (hemolyzed, wrong container, etc.)."""


class LabAlertService:
    """Service for lab-related alerts."""
    
    @staticmethod
    def check_critical_results(order: LabOrder) -> list[str]:
        """Check for critical results requiring immediate attention."""
        
    @staticmethod
    def notify_ordering_clinician(order: LabOrder) -> None:
        """Notify clinician when results are ready."""
        
    @staticmethod
    def get_overdue_orders(hours: int = 24) -> QuerySet:
        """Get orders exceeding expected TAT."""
```

**Test Coverage**: 12 tests
- Submit order validation
- Specimen collection recording
- Start processing transition
- Complete order transition
- All results required for completion
- Cancel order with reason
- Reject specimen with reason
- Critical result detection
- Clinician notification trigger
- Overdue order detection
- Invalid transition rejection
- Audit log creation

---

### 9. External Lab Integration

**Module**: `hmis/apps/laboratory/external.py`

**Purpose**: Integration with external lab partners.

**Classes**:
```python
class ExternalLabRequisition:
    """Generate requisition documents for external labs."""
    
    @staticmethod
    def generate_pdf(order: LabOrder) -> bytes:
        """Generate PDF requisition form."""
        
    @staticmethod
    def generate_hl7_message(order: LabOrder) -> str:
        """Generate HL7 ORM message (future integration)."""


class ExternalResultImporter:
    """Import results from external lab systems."""
    
    @staticmethod
    def import_from_csv(order: LabOrder, csv_file: File) -> list[LabResult]:
        """Import results from CSV format."""
        
    @staticmethod
    def import_from_hl7(hl7_message: str) -> list[LabResult]:
        """Parse HL7 ORU message (future integration)."""
```

**PDF Requisition Content**:
- Facility header and logo
- Patient demographics (name, MRN, DOB, gender)
- Ordering clinician details
- Order date and priority
- List of tests requested
- Clinical notes/indication
- Specimen requirements
- Barcode for order number
- Kenya MOH requisition format compliance

**Test Coverage**: 10 tests
- PDF requisition generation
- Requisition contains patient info
- Requisition contains test list
- Requisition contains clinical notes
- Requisition has order barcode
- CSV result import
- CSV validation (column mapping)
- External result attachment
- HL7 message generation (stub)
- HL7 message parsing (stub)

---

## Database Migrations

### Migration: Add Laboratory Models

**File**: `hmis/apps/laboratory/migrations/0001_initial.py`

**Operations**:
1. Create TestCatalog table
2. Create LOINCCode table
3. Create LabOrder table
4. Create LabOrderItem table
5. Create LabResult table

### Migration: Seed Essential Tests

**File**: `hmis/apps/laboratory/migrations/0002_seed_tests.py`

**Operations**:
1. Import Kenya essential lab tests
2. Import common LOINC codes

**Indexes**:
- `test_code_idx` on TestCatalog.code
- `test_loinc_idx` on TestCatalog.loinc_code
- `order_number_idx` on LabOrder.order_number
- `order_patient_idx` on LabOrder.patient
- `order_status_idx` on LabOrder.status
- `result_verification_idx` on LabResult.verification_status

---

## Settings Configuration

```python
# hmis/settings/base.py

# Laboratory Configuration
LAB_ORDER_NUMBER_PREFIX = "LAB"
LAB_DEFAULT_TAT_HOURS = 24
LAB_CRITICAL_ALERT_ENABLED = True
LAB_AUTO_FLAG_RESULTS = True

# External Lab Partners
EXTERNAL_LAB_PARTNERS = [
    ("LANCET", "Lancet Kenya"),
    ("PATHCARE", "PathCare Kenya"),
    ("KEMRI", "KEMRI Reference Lab"),
]

# LOINC Data
LOINC_DATA_PATH = "data/loinc_common.csv"
```

---

## Architecture Decisions

### 1. Separate Order and OrderItem Models

**Decision**: Use LabOrder + LabOrderItem rather than single model

**Rationale**:
- Orders often contain multiple tests
- Each test can have independent status
- Supports partial result entry
- Clearer billing breakdown
- Matches clinical workflow

### 2. In-House vs External Distinction

**Decision**: Single LabOrder model with order_type field

**Rationale**:
- Same data structure for both workflows
- Easy to switch between (if external lab unavailable)
- Unified patient history view
- Simpler reporting

### 3. Result Verification Workflow

**Decision**: Require verification for all results

**Rationale**:
- Quality assurance requirement
- Lab accreditation compliance
- Audit trail for clinical governance
- Can be streamlined with auto-verification for certain tests

### 4. LOINC Integration

**Decision**: Optional LOINC codes, not required

**Rationale**:
- Many Kenya facilities don't use LOINC
- Enables future FHIR interoperability
- Progressive enhancement approach
- Manual mapping as needed

---

## Acceptance Criteria

| Criterion | Required |
|-----------|----------|
| TestCatalog with Kenya essential tests | ✅ |
| LabOrder with status workflow | ✅ |
| LabOrderItem for individual tests | ✅ |
| LabResult with auto-flagging | ✅ |
| External lab requisition PDF | ✅ |
| Result verification workflow | ✅ |
| LOINC code reference table | ✅ |
| Lab Order API complete | ✅ |
| Lab Result API complete | ✅ |
| Critical result alerts | ✅ |
| All ~116 tests passing | ✅ |
| Test coverage ≥85% | ✅ |

---

## Dependencies

- **Requires**: Patient model, Encounter model, User model
- **Requires**: RBAC foundation (Sprint 1.1-1.2 Track C)
- **Enables**: Sprint 1.5-1.6 Lab Workflow Completion
- **Used By**: Billing module (test costs)

---

## TDD Methodology

Follow strict TDD for this track:

1. **Red Phase**: Write all tests first
   - `test_lab_models.py` - Model tests
   - `test_lab_workflow.py` - Workflow service tests
   - `test_lab_api.py` - API endpoint tests
   - `test_lab_external.py` - External integration tests

2. **Green Phase**: Implement to pass tests
   - Models in `laboratory/models.py`
   - Services in `laboratory/services.py`
   - Views in `laboratory/views.py`
   - External in `laboratory/external.py`

3. **Refactor Phase**: Optimize while green
   - Query optimization
   - PDF generation performance
   - API response caching

---

## Example Test Cases

```python
# test_lab_models.py

@pytest.mark.django_db
class TestLabOrderModel:
    def test_order_number_auto_generated(self, sample_encounter):
        """Lab order number should be auto-generated."""
        order = LabOrder.objects.create(
            patient=sample_encounter.patient,
            encounter=sample_encounter,
            ordered_by=sample_encounter.registered_by,
        )
        assert order.order_number.startswith('LAB-')
        assert len(order.order_number) == 17  # LAB-YYYYMMDD-XXXX
        
    def test_status_workflow_valid_transition(self, sample_lab_order, lab_tech_user):
        """Valid status transitions should succeed."""
        sample_lab_order.update_status('ORDERED', lab_tech_user)
        assert sample_lab_order.status == 'ORDERED'
        
        sample_lab_order.update_status('SPECIMEN_COLLECTED', lab_tech_user)
        assert sample_lab_order.status == 'SPECIMEN_COLLECTED'
        
    def test_status_workflow_invalid_transition(self, sample_lab_order, lab_tech_user):
        """Invalid status transitions should raise error."""
        with pytest.raises(ValidationError):
            sample_lab_order.update_status('COMPLETED', lab_tech_user)  # Can't skip


@pytest.mark.django_db
class TestLabResultModel:
    def test_auto_flag_normal_result(self, sample_order_item, lab_tech_user):
        """Normal results should be flagged as NORMAL."""
        # Hemoglobin test, normal range 12-17 g/dL for male
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=14.5,
            entered_by=lab_tech_user,
        )
        result.auto_flag_result()
        assert result.result_flag == 'NORMAL'
        
    def test_auto_flag_critical_high(self, sample_order_item, lab_tech_user):
        """Critical high results should be flagged."""
        result = LabResult.objects.create(
            order_item=sample_order_item,
            numeric_value=25.0,  # Critically high
            entered_by=lab_tech_user,
        )
        result.auto_flag_result()
        assert result.result_flag == 'CRITICAL_HIGH'
        assert result.is_critical()
```

---

**Document Status**: DRAFT
**Sprint Status**: 📋 PLANNED
**Document Owner**: Engineering Lead
**Last Updated**: December 31, 2025
