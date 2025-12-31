# Sprint 1.3-1.4 Track A: Pharmacy Module - Deliverables

**Sprint Duration**: Weeks 5-8 (Phase 1)
**Status**: 📋 PLANNED
**Target Date**: Q1 2026

---

## Executive Summary

Track A of Sprint 1.3-1.4 implements a comprehensive Pharmacy Module for Vitora HMIS, enabling drug inventory management, prescription processing, dispensing workflows, and expiry tracking. The module is designed for Kenya's healthcare context with support for essential medicines lists and offline-first operation.

### Key Deliverables

| Deliverable | Tests Required | Priority |
|-------------|----------------|----------|
| Drug Catalog Model | 12 tests | High |
| Pharmacy Inventory Model | 18 tests | High |
| Prescription Model | 15 tests | High |
| Dispensing Model | 16 tests | High |
| Stock Alerts System | 12 tests | High |
| Expiry Tracking (FEFO) | 10 tests | High |
| Prescription API | 14 tests | Medium |
| Dispensing API | 12 tests | Medium |
| Inventory Reports | 8 tests | Medium |

**Total Planned Tests**: ~117 tests
**Target Coverage**: ≥85%

---

## Components to Implement

### 1. Drug Catalog Model

**Module**: `hmis/apps/pharmacy/models.py`

**Purpose**: Master catalog of drugs available in the facility, based on Kenya Essential Medicines List (KEML).

**Fields**:
```python
class Drug(models.Model):
    """Drug master catalog entry."""
    
    DRUG_FORMS = [
        ('TABLET', 'Tablet'),
        ('CAPSULE', 'Capsule'),
        ('SYRUP', 'Syrup'),
        ('INJECTION', 'Injection'),
        ('CREAM', 'Cream'),
        ('OINTMENT', 'Ointment'),
        ('DROPS', 'Drops'),
        ('INHALER', 'Inhaler'),
        ('SUPPOSITORY', 'Suppository'),
        ('POWDER', 'Powder'),
        ('SUSPENSION', 'Suspension'),
        ('SOLUTION', 'Solution'),
        ('GEL', 'Gel'),
        ('PATCH', 'Patch'),
        ('SPRAY', 'Spray'),
    ]
    
    DRUG_CATEGORIES = [
        ('ANALGESIC', 'Analgesics & Antipyretics'),
        ('ANTIBIOTIC', 'Antibiotics'),
        ('ANTIMALARIAL', 'Antimalarials'),
        ('ANTIRETROVIRAL', 'Antiretrovirals'),
        ('ANTIHYPERTENSIVE', 'Antihypertensives'),
        ('ANTIDIABETIC', 'Antidiabetics'),
        ('ANTIHISTAMINE', 'Antihistamines'),
        ('VITAMIN', 'Vitamins & Supplements'),
        ('VACCINE', 'Vaccines'),
        ('CONTRACEPTIVE', 'Contraceptives'),
        ('PSYCHOTROPIC', 'Psychotropic Drugs'),
        ('CONTROLLED', 'Controlled Substances'),
        ('OTHER', 'Other'),
    ]
    
    SCHEDULE_CHOICES = [
        ('OTC', 'Over The Counter'),
        ('POM', 'Prescription Only Medicine'),
        ('P', 'Pharmacy Only'),
        ('CD', 'Controlled Drug'),
    ]
    
    # Identity
    code = models.CharField(max_length=50, unique=True)  # Internal code
    generic_name = models.CharField(max_length=200)
    brand_names = models.JSONField(default=list)  # Multiple brands
    
    # Classification
    category = models.CharField(max_length=30, choices=DRUG_CATEGORIES)
    form = models.CharField(max_length=20, choices=DRUG_FORMS)
    strength = models.CharField(max_length=50)  # e.g., "500mg", "250mg/5ml"
    unit = models.CharField(max_length=20)  # e.g., "tablet", "ml", "vial"
    
    # Scheduling
    schedule = models.CharField(max_length=10, choices=SCHEDULE_CHOICES, default='POM')
    requires_prescription = models.BooleanField(default=True)
    is_controlled = models.BooleanField(default=False)
    is_narcotic = models.BooleanField(default=False)
    
    # Kenya-specific
    keml_code = models.CharField(max_length=20, blank=True)  # Kenya Essential Medicines List
    is_essential = models.BooleanField(default=False)  # On KEML
    nhif_code = models.CharField(max_length=20, blank=True)  # For NHIF/SHA claims
    
    # Inventory hints
    default_reorder_level = models.PositiveIntegerField(default=50)
    default_reorder_quantity = models.PositiveIntegerField(default=100)
    shelf_life_months = models.PositiveIntegerField(null=True, blank=True)
    storage_requirements = models.TextField(blank=True)  # Cold chain, etc.
    
    # Pricing (reference only - actual price per batch)
    reference_price = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['generic_name', 'strength']
        indexes = [
            models.Index(fields=['generic_name']),
            models.Index(fields=['category']),
            models.Index(fields=['keml_code']),
        ]
```

**Methods**:
- `get_display_name()`: "Generic Name Strength Form"
- `search(query)`: Full-text search on name, brands
- `get_current_stock()`: Total stock across all batches

**Test Coverage**: 12 tests
- Drug creation with required fields
- Drug code uniqueness
- Form/category validation
- KEML code format validation
- Schedule determines requires_prescription
- Controlled drug flag
- Brand names JSON array
- Display name formatting
- Search by generic name
- Search by brand name
- Default reorder levels
- Reference price handling

---

### 2. Pharmacy Inventory Model (Stock Batch)

**Module**: `hmis/apps/pharmacy/models.py`

**Purpose**: Track drug stock by batch with FEFO (First Expiry, First Out) support.

**Fields**:
```python
class StockBatch(models.Model):
    """Individual batch of drug stock."""
    
    STOCK_STATUS = [
        ('AVAILABLE', 'Available'),
        ('LOW', 'Low Stock'),
        ('OUT_OF_STOCK', 'Out of Stock'),
        ('EXPIRED', 'Expired'),
        ('QUARANTINE', 'Quarantine'),
        ('RECALLED', 'Recalled'),
    ]
    
    drug = models.ForeignKey(Drug, on_delete=models.PROTECT, related_name='batches')
    
    # Batch identification
    batch_number = models.CharField(max_length=50)
    barcode = models.CharField(max_length=100, blank=True)
    
    # Quantities
    quantity_received = models.PositiveIntegerField()
    quantity_available = models.PositiveIntegerField()
    quantity_dispensed = models.PositiveIntegerField(default=0)
    quantity_damaged = models.PositiveIntegerField(default=0)
    quantity_expired = models.PositiveIntegerField(default=0)
    
    # Dates
    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField()
    received_date = models.DateField()
    
    # Pricing
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)  # Per unit
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)  # Per unit
    
    # Source
    supplier = models.CharField(max_length=200, blank=True)
    purchase_order = models.CharField(max_length=50, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='received_batches'
    )
    
    # Status
    status = models.CharField(max_length=20, choices=STOCK_STATUS, default='AVAILABLE')
    location = models.CharField(max_length=100, blank=True)  # Shelf/bin location
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['expiry_date', 'received_date']  # FEFO ordering
        unique_together = ['drug', 'batch_number']
        indexes = [
            models.Index(fields=['expiry_date']),
            models.Index(fields=['status']),
        ]
```

**Methods**:
- `is_expired()`: Check if batch is expired
- `days_to_expiry()`: Days until expiry
- `is_low_stock()`: Below drug's reorder level
- `dispense(quantity)`: Reduce available stock
- `return_stock(quantity)`: Handle returns
- `mark_expired()`: Mark batch as expired
- `mark_damaged(quantity, reason)`: Record damage
- `get_value()`: Total value of remaining stock

**Test Coverage**: 18 tests
- Batch creation with drug linkage
- Batch number uniqueness per drug
- Quantity tracking (received, available, dispensed)
- Expiry date validation (not in past for new batches)
- Days to expiry calculation
- Is expired check
- Low stock threshold check
- Dispense reduces available quantity
- Dispense prevents over-dispensing
- Return stock increases available
- Mark expired status change
- Mark damaged with quantity/reason
- FEFO ordering (earliest expiry first)
- Status transitions
- Stock value calculation
- Cost price vs selling price
- Supplier tracking
- Received by user tracking

---

### 3. Stock Alert Model

**Module**: `hmis/apps/pharmacy/models.py`

**Purpose**: Track and manage stock-related alerts (low stock, expiring, expired).

**Fields**:
```python
class StockAlert(models.Model):
    """Stock-related alerts and notifications."""
    
    ALERT_TYPES = [
        ('LOW_STOCK', 'Low Stock'),
        ('OUT_OF_STOCK', 'Out of Stock'),
        ('EXPIRING_SOON', 'Expiring Soon'),  # Within 90 days
        ('EXPIRED', 'Expired'),
        ('RECALLED', 'Product Recalled'),
    ]
    
    ALERT_SEVERITY = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]
    
    drug = models.ForeignKey(Drug, on_delete=models.CASCADE, related_name='alerts')
    batch = models.ForeignKey(StockBatch, on_delete=models.CASCADE, null=True, blank=True)
    
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES)
    severity = models.CharField(max_length=10, choices=ALERT_SEVERITY)
    message = models.TextField()
    
    # Resolution
    is_acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acknowledged_alerts'
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    
    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_alerts'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-severity', '-created_at']
```

**Methods**:
- `acknowledge(user)`: Mark alert as acknowledged
- `resolve(user, notes)`: Mark alert as resolved
- `generate_low_stock_alerts()`: Classmethod to generate alerts
- `generate_expiry_alerts()`: Classmethod to generate alerts

**Test Coverage**: 12 tests
- Alert creation for low stock
- Alert creation for out of stock
- Alert creation for expiring (30/60/90 days)
- Alert creation for expired
- Severity assignment rules
- Acknowledge alert
- Resolve alert with notes
- Auto-generate low stock alerts
- Auto-generate expiry alerts
- No duplicate alerts
- Alert filtering by type
- Alert filtering by severity

---

### 4. Prescription Model

**Module**: `hmis/apps/pharmacy/models.py`

**Purpose**: Track prescriptions from encounters, linked to dispensing.

**Fields**:
```python
class Prescription(models.Model):
    """Prescription for a patient encounter."""
    
    PRESCRIPTION_STATUS = [
        ('PENDING', 'Pending'),
        ('PARTIAL', 'Partially Dispensed'),
        ('DISPENSED', 'Fully Dispensed'),
        ('CANCELLED', 'Cancelled'),
        ('EXPIRED', 'Expired'),
    ]
    
    # Links
    encounter = models.ForeignKey(
        'encounters.Encounter',
        on_delete=models.PROTECT,
        related_name='prescriptions'
    )
    patient = models.ForeignKey(
        'patients.Patient',
        on_delete=models.PROTECT,
        related_name='prescriptions'
    )
    
    # Prescriber
    prescribed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='prescriptions_written'
    )
    prescribed_at = models.DateTimeField(auto_now_add=True)
    
    # Validity
    valid_until = models.DateField()  # Typically 30 days from prescription
    
    # Status
    status = models.CharField(max_length=20, choices=PRESCRIPTION_STATUS, default='PENDING')
    
    # Notes
    clinical_notes = models.TextField(blank=True)  # For pharmacist
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-prescribed_at']


class PrescriptionItem(models.Model):
    """Individual drug item in a prescription."""
    
    prescription = models.ForeignKey(
        Prescription,
        on_delete=models.CASCADE,
        related_name='items'
    )
    drug = models.ForeignKey(Drug, on_delete=models.PROTECT)
    
    # Dosage instructions
    quantity = models.PositiveIntegerField()  # Total quantity to dispense
    dosage = models.CharField(max_length=100)  # e.g., "1 tablet"
    frequency = models.CharField(max_length=100)  # e.g., "3 times daily"
    duration = models.CharField(max_length=50)  # e.g., "7 days"
    route = models.CharField(max_length=50, blank=True)  # e.g., "Oral", "IV"
    instructions = models.TextField(blank=True)  # e.g., "Take after meals"
    
    # Dispensing tracking
    quantity_dispensed = models.PositiveIntegerField(default=0)
    is_substitutable = models.BooleanField(default=True)  # Allow generic substitution
    
    # Status
    is_cancelled = models.BooleanField(default=False)
    cancellation_reason = models.TextField(blank=True)
```

**Methods**:
- `is_valid()`: Check if prescription not expired
- `is_fully_dispensed()`: All items dispensed
- `get_remaining_items()`: Items not fully dispensed
- `cancel(reason)`: Cancel prescription/item
- `update_status()`: Auto-update based on items

**Test Coverage**: 15 tests
- Prescription creation linked to encounter
- Prescription creation linked to patient
- Prescriber must be authenticated user
- Valid until date validation
- Prescription item creation
- Quantity and dosage required
- Dispensed quantity tracking
- Prescription is_valid check
- Prescription expiry
- Partial dispensing status
- Full dispensing status
- Cancellation with reason
- Status auto-update
- Substitution flag
- Clinical notes for pharmacist

---

### 5. Dispensing Model

**Module**: `hmis/apps/pharmacy/models.py`

**Purpose**: Track drug dispensing from prescriptions with batch traceability.

**Fields**:
```python
class Dispensing(models.Model):
    """Drug dispensing record."""
    
    prescription_item = models.ForeignKey(
        PrescriptionItem,
        on_delete=models.PROTECT,
        related_name='dispensings',
        null=True,
        blank=True
    )
    
    # Direct dispense (OTC, emergency)
    patient = models.ForeignKey(
        'patients.Patient',
        on_delete=models.PROTECT,
        related_name='dispensings'
    )
    drug = models.ForeignKey(Drug, on_delete=models.PROTECT)
    
    # Batch tracking (FEFO)
    batch = models.ForeignKey(
        StockBatch,
        on_delete=models.PROTECT,
        related_name='dispensings'
    )
    
    # Quantities
    quantity_dispensed = models.PositiveIntegerField()
    quantity_returned = models.PositiveIntegerField(default=0)
    
    # Pricing
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Instructions given
    instructions_given = models.TextField(blank=True)
    patient_counseled = models.BooleanField(default=False)
    
    # Dispensed by
    dispensed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='dispensings'
    )
    dispensed_at = models.DateTimeField(auto_now_add=True)
    
    # Verification (for controlled substances)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_dispensings'
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    
    # Notes
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-dispensed_at']
```

**Methods**:
- `process_return(quantity, reason)`: Handle drug returns
- `requires_verification()`: Check if drug needs second verification
- `verify(user)`: Second pharmacist verification
- `calculate_total()`: Unit price × quantity - discount

**Test Coverage**: 16 tests
- Dispensing from prescription
- Direct dispensing (OTC)
- Batch linkage required
- Quantity validation against stock
- Dispense reduces batch stock
- Price calculation
- Discount application
- Return processing
- Return restores batch stock
- Controlled drug verification required
- Verification by different user
- Instructions documentation
- Counseling flag
- FEFO batch selection
- Multiple batches for single dispense
- Audit trail creation

---

### 6. FEFO (First Expiry First Out) Logic

**Module**: `hmis/apps/pharmacy/services.py`

**Purpose**: Automatically select batches with earliest expiry for dispensing.

**Implementation**:
```python
class FEFODispenser:
    """First Expiry First Out dispensing logic."""
    
    @staticmethod
    def get_batches_for_dispensing(drug: Drug, quantity: int) -> list[tuple[StockBatch, int]]:
        """
        Get batches to dispense from, prioritizing earliest expiry.
        
        Args:
            drug: Drug to dispense
            quantity: Total quantity needed
            
        Returns:
            List of (batch, quantity) tuples
            
        Raises:
            InsufficientStockError: If not enough stock available
        """
        available_batches = StockBatch.objects.filter(
            drug=drug,
            status='AVAILABLE',
            expiry_date__gt=timezone.now().date(),
            quantity_available__gt=0
        ).order_by('expiry_date', 'received_date')
        
        result = []
        remaining = quantity
        
        for batch in available_batches:
            if remaining <= 0:
                break
            
            take = min(batch.quantity_available, remaining)
            result.append((batch, take))
            remaining -= take
        
        if remaining > 0:
            raise InsufficientStockError(
                f"Insufficient stock for {drug.generic_name}. "
                f"Requested: {quantity}, Available: {quantity - remaining}"
            )
        
        return result
    
    @staticmethod
    def dispense(drug: Drug, quantity: int, dispensed_by: User, **kwargs) -> list[Dispensing]:
        """
        Dispense drug using FEFO logic.
        Creates dispensing records and updates batch quantities.
        """
        batches = FEFODispenser.get_batches_for_dispensing(drug, quantity)
        dispensings = []
        
        for batch, qty in batches:
            dispensing = Dispensing.objects.create(
                drug=drug,
                batch=batch,
                quantity_dispensed=qty,
                unit_price=batch.selling_price,
                total_price=batch.selling_price * qty,
                dispensed_by=dispensed_by,
                **kwargs
            )
            batch.dispense(qty)
            dispensings.append(dispensing)
        
        return dispensings
```

**Test Coverage**: 10 tests
- Single batch sufficient
- Multiple batches needed
- Earliest expiry selected first
- Expired batches excluded
- Quarantined batches excluded
- Insufficient stock error
- Batch quantity reduced after dispense
- Zero quantity request
- Drug with no stock
- Same expiry date ordering by received date

---

### 7. Stock Adjustment Model

**Module**: `hmis/apps/pharmacy/models.py`

**Purpose**: Track non-dispensing stock changes (damage, loss, returns to supplier).

**Fields**:
```python
class StockAdjustment(models.Model):
    """Record of stock adjustment (non-dispensing)."""
    
    ADJUSTMENT_TYPES = [
        ('DAMAGE', 'Damaged Stock'),
        ('LOSS', 'Stock Loss/Theft'),
        ('EXPIRED', 'Expired Stock'),
        ('RETURN_SUPPLIER', 'Return to Supplier'),
        ('TRANSFER_OUT', 'Transfer Out'),
        ('TRANSFER_IN', 'Transfer In'),
        ('COUNT_CORRECTION', 'Physical Count Correction'),
        ('SAMPLE', 'Sample/Demo'),
    ]
    
    batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name='adjustments')
    adjustment_type = models.CharField(max_length=20, choices=ADJUSTMENT_TYPES)
    
    quantity = models.IntegerField()  # Positive = increase, Negative = decrease
    reason = models.TextField()
    
    # Documentation
    reference_number = models.CharField(max_length=50, blank=True)  # e.g., return note number
    
    adjusted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='stock_adjustments'
    )
    adjusted_at = models.DateTimeField(auto_now_add=True)
    
    # Approval (for significant adjustments)
    requires_approval = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_adjustments'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
```

**Test Coverage**: 8 tests
- Adjustment creation reduces stock
- Adjustment creation increases stock
- Reason required
- Approval workflow for large adjustments
- Reference number for returns
- Adjustment types validation
- Cannot adjust below zero
- Audit trail creation

---

### 8. API Endpoints

**Module**: `hmis/apps/pharmacy/views.py`

**Endpoints**:
```
# Drug Catalog
GET     /api/pharmacy/drugs/                     # List drugs (searchable)
GET     /api/pharmacy/drugs/{id}/                # Drug details
POST    /api/pharmacy/drugs/                     # Add drug (admin)
PATCH   /api/pharmacy/drugs/{id}/                # Update drug (admin)

# Stock Batches
GET     /api/pharmacy/stock/                     # List all stock
GET     /api/pharmacy/stock/{drug_id}/           # Stock for specific drug
POST    /api/pharmacy/stock/receive/             # Receive new stock
PATCH   /api/pharmacy/stock/{batch_id}/          # Update batch

# Alerts
GET     /api/pharmacy/alerts/                    # List alerts
GET     /api/pharmacy/alerts/low-stock/          # Low stock alerts
GET     /api/pharmacy/alerts/expiring/           # Expiring soon alerts
POST    /api/pharmacy/alerts/{id}/acknowledge/   # Acknowledge alert
POST    /api/pharmacy/alerts/{id}/resolve/       # Resolve alert

# Prescriptions
GET     /api/prescriptions/                      # List prescriptions
GET     /api/prescriptions/{id}/                 # Prescription details
POST    /api/prescriptions/                      # Create prescription
PATCH   /api/prescriptions/{id}/                 # Update prescription
POST    /api/prescriptions/{id}/cancel/          # Cancel prescription
GET     /api/patients/{id}/prescriptions/        # Patient's prescriptions

# Dispensing
GET     /api/dispensings/                        # List dispensings
POST    /api/dispensings/                        # Dispense drug
POST    /api/dispensings/{id}/return/            # Process return
POST    /api/dispensings/{id}/verify/            # Verify controlled drug

# Reports
GET     /api/pharmacy/reports/stock-summary/     # Current stock summary
GET     /api/pharmacy/reports/expiry-report/     # Expiring stock report
GET     /api/pharmacy/reports/dispensing/        # Dispensing report
GET     /api/pharmacy/reports/movement/          # Stock movement report
```

**Test Coverage**: 14 tests (Prescription API) + 12 tests (Dispensing API)
- Drug search and filtering
- Stock receive endpoint
- Stock level queries
- Prescription CRUD
- Prescription by patient
- Dispensing workflow
- FEFO batch selection via API
- Return processing via API
- Controlled drug verification via API
- Alert endpoints
- Report generation
- Permission-based access
- Pagination and filtering
- Validation error handling

---

## Database Migrations

### Migration: Add Pharmacy Models

```python
# hmis/apps/pharmacy/migrations/0001_initial.py

operations = [
    migrations.CreateModel(name='Drug', ...),
    migrations.CreateModel(name='StockBatch', ...),
    migrations.CreateModel(name='StockAlert', ...),
    migrations.CreateModel(name='Prescription', ...),
    migrations.CreateModel(name='PrescriptionItem', ...),
    migrations.CreateModel(name='Dispensing', ...),
    migrations.CreateModel(name='StockAdjustment', ...),
    
    # Indexes
    migrations.AddIndex(
        model_name='drug',
        index=models.Index(fields=['generic_name']),
    ),
    migrations.AddIndex(
        model_name='stockbatch',
        index=models.Index(fields=['expiry_date']),
    ),
]
```

---

## Test Files to Create

### 1. tests/test_pharmacy_models.py (~65 tests)

```python
"""
Tests for Pharmacy models: Drug, StockBatch, Prescription, Dispensing.
Following TDD approach: Write tests FIRST, then implement.
"""

class TestDrugModel:
    """Tests for Drug catalog model."""
    # 12 tests

class TestStockBatchModel:
    """Tests for Stock Batch model."""
    # 18 tests

class TestStockAlertModel:
    """Tests for Stock Alert model."""
    # 12 tests

class TestPrescriptionModel:
    """Tests for Prescription model."""
    # 15 tests

class TestDispensingModel:
    """Tests for Dispensing model."""
    # 16 tests

class TestStockAdjustmentModel:
    """Tests for Stock Adjustment model."""
    # 8 tests
```

### 2. tests/test_pharmacy_fefo.py (~10 tests)

```python
"""
Tests for FEFO (First Expiry First Out) dispensing logic.
"""

class TestFEFODispenser:
    """Tests for FEFO batch selection."""
    # 10 tests
```

### 3. tests/test_pharmacy_api.py (~34 tests)

```python
"""
Tests for Pharmacy API endpoints.
"""

class TestDrugAPI:
    """Tests for Drug catalog API."""
    # 6 tests

class TestStockAPI:
    """Tests for Stock management API."""
    # 8 tests

class TestPrescriptionAPI:
    """Tests for Prescription API."""
    # 10 tests

class TestDispensingAPI:
    """Tests for Dispensing API."""
    # 10 tests
```

### 4. tests/test_pharmacy_reports.py (~8 tests)

```python
"""
Tests for Pharmacy reports.
"""

class TestPharmacyReports:
    """Tests for inventory and dispensing reports."""
    # 8 tests
```

---

## Data Fixtures

### Kenya Essential Medicines List (Sample)

```python
# hmis/apps/pharmacy/fixtures/keml_drugs.json
[
    {
        "code": "PARA500",
        "generic_name": "Paracetamol",
        "strength": "500mg",
        "form": "TABLET",
        "category": "ANALGESIC",
        "schedule": "OTC",
        "keml_code": "02.01",
        "is_essential": true
    },
    {
        "code": "AMOX500",
        "generic_name": "Amoxicillin",
        "strength": "500mg",
        "form": "CAPSULE",
        "category": "ANTIBIOTIC",
        "schedule": "POM",
        "keml_code": "06.02.01",
        "is_essential": true
    },
    {
        "code": "ARTEM20",
        "generic_name": "Artemether-Lumefantrine",
        "strength": "20/120mg",
        "form": "TABLET",
        "category": "ANTIMALARIAL",
        "schedule": "POM",
        "keml_code": "06.05.03",
        "is_essential": true
    },
    // ... more drugs
]
```

---

## Settings Configuration

```python
# hmis/settings/base.py additions

# Pharmacy Configuration
PHARMACY_SETTINGS = {
    'DEFAULT_PRESCRIPTION_VALIDITY_DAYS': 30,
    'LOW_STOCK_THRESHOLD_DAYS': 14,  # Alert when stock lasts less than X days
    'EXPIRY_WARNING_DAYS': 90,  # Alert when expiring within X days
    'CRITICAL_EXPIRY_DAYS': 30,  # Critical alert when expiring within X days
    'CONTROLLED_DRUG_VERIFICATION': True,  # Require second pharmacist
    'ALLOW_OTC_DISPENSING': True,  # Allow dispensing without prescription
    'FEFO_ENABLED': True,  # Use First Expiry First Out
}

# Drug Schedules
DRUG_SCHEDULES = {
    'OTC': {'requires_prescription': False, 'requires_verification': False},
    'POM': {'requires_prescription': True, 'requires_verification': False},
    'P': {'requires_prescription': False, 'requires_verification': False},
    'CD': {'requires_prescription': True, 'requires_verification': True},
}
```

---

## Acceptance Criteria

| Criterion | Tests | Status |
|-----------|-------|--------|
| Drug catalog with KEML codes | 12 | 📋 |
| Stock batch management | 18 | 📋 |
| Stock alerts (low, expiry) | 12 | 📋 |
| Prescription management | 15 | 📋 |
| Dispensing with FEFO | 16 | 📋 |
| Stock adjustments | 8 | 📋 |
| FEFO logic | 10 | 📋 |
| API endpoints | 34 | 📋 |
| Reports | 8 | 📋 |
| Controlled drug verification | ✓ | 📋 |
| All tests pass | ~117 | 📋 |
| Coverage ≥85% | ✓ | 📋 |

---

## Dependencies

- Patient model (existing)
- Encounter model (existing)
- User model (existing)
- RBAC system (Track C of 1.1-1.2)

---

## Architecture Decisions

### 1. Batch-Level Stock Tracking

**Decision**: Track stock at batch level, not aggregate

**Rationale**:
- FEFO requires knowing each batch's expiry
- Recall management requires batch traceability
- Cost accounting per batch
- Kenya pharmacy regulations require batch records

### 2. Prescription Model Separation

**Decision**: Separate Prescription from Dispensing models

**Rationale**:
- Prescription can be filled partially over time
- Prescription can be filled at different facilities
- Clear audit trail for prescribing vs dispensing
- Support for e-prescription in future

### 3. KEML Integration

**Decision**: Include KEML codes in Drug model

**Rationale**:
- Essential for Kenya regulatory compliance
- Required for NHIF/SHA claims
- Standardizes drug catalog across facilities
- Enables national reporting

---

## TDD Methodology

1. **Red**: Write all ~117 tests first (this document)
2. **Green**: Implement models, FEFO logic, and APIs to pass tests
3. **Refactor**: Optimize queries, add caching for drug lookups

---

**Document Status**: PLANNED
**Sprint Status**: 📋 NOT STARTED
**Document Owner**: Engineering Lead
**Last Updated**: December 31, 2025
