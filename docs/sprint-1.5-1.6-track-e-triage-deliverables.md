# Sprint 1.5-1.6 Track E: Triage Module MVP - Deliverables

**Sprint Duration**: Weeks 9-12
**Status**: 📋 PLANNED
**Target Start**: May 2026
**Last Updated**: January 3, 2026

---

## Executive Summary

This sprint delivers a comprehensive Triage Module MVP for Vitora HMIS, enabling emergency department and outpatient triage workflows. The module implements the Kenya Emergency Triage Assessment (KETA) 5-level scale with rules-based decision support, priority queue management, and configurable vital thresholds. This addresses critical patient flow management needs for Kenyan healthcare facilities.

### Business Value
- **Faster patient prioritization**: Structured triage reduces assessment time to <5 minutes
- **Improved patient safety**: Critical vital alerts prevent missed emergencies
- **Kenya compliance**: KETA scale aligns with MoH emergency triage standards
- **Operational visibility**: Real-time queue dashboard for resource planning
- **Quality metrics**: Wait time tracking enables continuous improvement

---

## Test Results Summary

<!-- Update this section as tests are implemented -->

| Test File | Tests | Status |
|-----------|-------|--------|
| test_triage_models.py | 0 | ⬜ Not Started |
| test_triage_api.py | 0 | ⬜ Not Started |
| test_triage_queue.py | 0 | ⬜ Not Started |
| test_triage_thresholds.py | 0 | ⬜ Not Started |
| test_triage_reporting.py | 0 | ⬜ Not Started |
| **Total** | **0** | **⬜ Not Started** |

**Status Legend**: ⬜ Not Started | 🔄 In Progress | ✅ All Passed | ❌ Failed

---

## Components to Implement

### 1. TriageAssessment Model

**Module**: `hmis/apps/triage/models.py`

**Purpose**: Core triage assessment capturing patient arrival, clinical assessment, KETA categorization, and routing decisions. Links to Encounter to maintain clinical context.

**Fields**:
```python
class TriageAssessment(TimeStampedModel):
    """
    Triage assessment linked to an encounter.
    Captures initial patient assessment and KETA priority categorization.
    """
    
    # Chief Complaint Categories
    CHIEF_COMPLAINT_CHOICES = [
        ('CHEST_PAIN', 'Chest Pain'),
        ('DIFFICULTY_BREATHING', 'Difficulty Breathing'),
        ('TRAUMA', 'Trauma/Injury'),
        ('FEVER', 'Fever'),
        ('ABDOMINAL_PAIN', 'Abdominal Pain'),
        ('HEADACHE', 'Headache'),
        ('ALTERED_CONSCIOUSNESS', 'Altered Consciousness'),
        ('BLEEDING', 'Bleeding'),
        ('POISONING', 'Poisoning/Overdose'),
        ('OBSTETRIC', 'Obstetric Emergency'),
        ('PEDIATRIC', 'Pediatric Emergency'),
        ('OTHER', 'Other'),
    ]
    
    # AVPU Mental Status Scale
    MENTAL_STATUS_CHOICES = [
        ('A', 'Alert'),
        ('V', 'Responds to Voice'),
        ('P', 'Responds to Pain'),
        ('U', 'Unresponsive'),
    ]
    
    # Mobility Status
    MOBILITY_CHOICES = [
        ('AMBULATORY', 'Ambulatory'),
        ('WHEELCHAIR', 'Wheelchair'),
        ('STRETCHER', 'Stretcher'),
        ('IMMOBILE', 'Immobile/Carried'),
    ]
    
    # Arrival Mode
    ARRIVAL_MODE_CHOICES = [
        ('WALK_IN', 'Walk-in'),
        ('AMBULANCE', 'Ambulance'),
        ('POLICE', 'Police'),
        ('REFERRAL', 'Referral from another facility'),
        ('OTHER', 'Other'),
    ]
    
    # KETA Triage Categories (Kenya Emergency Triage Assessment)
    TRIAGE_CATEGORY_CHOICES = [
        ('RED', 'Emergency - Immediate'),
        ('ORANGE', 'Very Urgent - <10 min'),
        ('YELLOW', 'Urgent - <60 min'),
        ('GREEN', 'Standard - <240 min'),
        ('BLUE', 'Non-Urgent/Referral'),
    ]
    
    # Care Area Assignment
    ASSIGNED_AREA_CHOICES = [
        ('ER_RESUS', 'ER - Resuscitation'),
        ('ER_ACUTE', 'ER - Acute Care'),
        ('ER_FAST_TRACK', 'ER - Fast Track'),
        ('OBSERVATION', 'Observation Unit'),
        ('OPD', 'Outpatient Department'),
        ('TRAUMA', 'Trauma Bay'),
        ('PEDIATRIC_ER', 'Pediatric ER'),
        ('MATERNITY', 'Maternity/Labor'),
        ('SPECIALTY', 'Specialty Clinic'),
    ]
    
    # Core Relationship
    encounter = models.OneToOneField(
        'encounters.Encounter',
        on_delete=models.CASCADE,
        related_name='triage_assessment'
    )
    
    # Clinical Assessment
    chief_complaint = models.TextField(help_text="Primary reason for visit")
    chief_complaint_category = models.CharField(
        max_length=50,
        choices=CHIEF_COMPLAINT_CHOICES
    )
    pain_score = models.IntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        null=True,
        blank=True,
        help_text="Pain level 0-10"
    )
    mental_status = models.CharField(
        max_length=1,
        choices=MENTAL_STATUS_CHOICES,
        help_text="AVPU mental status scale"
    )
    mobility = models.CharField(max_length=20, choices=MOBILITY_CHOICES)
    arrival_mode = models.CharField(
        max_length=20,
        choices=ARRIVAL_MODE_CHOICES,
        default='WALK_IN'
    )
    allergies_noted = models.TextField(
        blank=True,
        help_text="Allergies noted at triage (snapshot from patient record)"
    )
    
    # Triage Decision
    triage_category = models.CharField(max_length=10, choices=TRIAGE_CATEGORY_CHOICES)
    auto_calculated_category = models.CharField(
        max_length=10,
        choices=TRIAGE_CATEGORY_CHOICES,
        help_text="System-suggested category before nurse override"
    )
    category_override_reason = models.TextField(
        blank=True,
        help_text="Required if nurse overrides system suggestion"
    )
    
    # Routing
    assigned_area = models.CharField(max_length=30, choices=ASSIGNED_AREA_CHOICES)
    assigned_clinician = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='triage_assignments'
    )
    
    # Critical Timestamps
    arrival_time = models.DateTimeField(help_text="When patient arrived at facility")
    triage_start_time = models.DateTimeField(help_text="When triage assessment began")
    triage_end_time = models.DateTimeField(null=True, blank=True)
    seen_by_clinician_time = models.DateTimeField(null=True, blank=True)
    
    # Alerts
    alerts = models.JSONField(default=list, help_text="List of critical alerts generated")
    
    # Audit
    triaged_by = models.ForeignKey(
        'auth.User',
        on_delete=models.PROTECT,
        related_name='triage_assessments_performed'
    )
    
    class Meta:
        ordering = ['-arrival_time']
        permissions = [
            ('perform_triage', 'Can perform triage assessments'),
            ('view_triage_queue', 'Can view triage queue'),
            ('override_triage_category', 'Can override triage category'),
        ]
    
    # Target wait times by category (in minutes)
    TARGET_WAIT_TIMES = {
        'RED': 0,      # Immediate
        'ORANGE': 10,  # Very Urgent
        'YELLOW': 60,  # Urgent
        'GREEN': 240,  # Standard
        'BLUE': 480,   # Non-Urgent
    }
    
    def calculate_triage_category(self) -> str:
        """
        Calculate triage category based on vitals and symptoms.
        Returns suggested KETA category (RED/ORANGE/YELLOW/GREEN/BLUE).
        """
        pass
    
    def get_wait_time_minutes(self) -> int:
        """Calculate time in minutes since arrival."""
        pass
    
    def is_wait_time_exceeded(self) -> bool:
        """Check if patient has exceeded target wait time for their category."""
        pass
    
    def generate_alerts(self) -> list[str]:
        """Generate alerts based on vitals and symptoms."""
        pass
```

**Test Coverage** (25 tests):
- [ ] Test model creation with valid data
- [ ] Test encounter one-to-one relationship
- [ ] Test chief_complaint_category choices validation
- [ ] Test pain_score range validation (0-10)
- [ ] Test pain_score null allowed
- [ ] Test mental_status AVPU choices
- [ ] Test mobility choices validation
- [ ] Test arrival_mode default value
- [ ] Test triage_category KETA choices
- [ ] Test assigned_area choices validation
- [ ] Test arrival_time required
- [ ] Test triage_start_time required
- [ ] Test triage_end_time optional
- [ ] Test seen_by_clinician_time optional
- [ ] Test alerts default empty list
- [ ] Test triaged_by required
- [ ] Test calculate_triage_category returns valid category
- [ ] Test RED category for critical SpO2 (<90%)
- [ ] Test RED category for unresponsive (AVPU=U)
- [ ] Test ORANGE category for critical BP
- [ ] Test get_wait_time_minutes calculation
- [ ] Test is_wait_time_exceeded for each category
- [ ] Test generate_alerts for critical vitals
- [ ] Test category override requires reason
- [ ] Test ordering by arrival_time descending

---

### 2. TriageVitalThreshold Model

**Module**: `hmis/apps/triage/models.py`

**Purpose**: Configurable vital sign thresholds for critical and warning alerts. Allows facility-specific customization while providing sensible defaults.

**Fields**:
```python
class TriageVitalThreshold(TimeStampedModel):
    """
    Configurable thresholds for vital sign alerts.
    Can be customized per facility or use system defaults.
    """
    
    VITAL_TYPE_CHOICES = [
        ('SPO2', 'Oxygen Saturation (%)'),
        ('SYSTOLIC_BP', 'Systolic Blood Pressure (mmHg)'),
        ('DIASTOLIC_BP', 'Diastolic Blood Pressure (mmHg)'),
        ('HEART_RATE', 'Heart Rate (bpm)'),
        ('TEMPERATURE', 'Temperature (°C)'),
        ('RESPIRATORY_RATE', 'Respiratory Rate (breaths/min)'),
    ]
    
    vital_type = models.CharField(
        max_length=30,
        choices=VITAL_TYPE_CHOICES,
        unique=True
    )
    critical_low = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value below this triggers critical alert"
    )
    warning_low = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value below this triggers warning"
    )
    warning_high = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value above this triggers warning"
    )
    critical_high = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value above this triggers critical alert"
    )
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = "Triage Vital Threshold"
        verbose_name_plural = "Triage Vital Thresholds"
    
    @classmethod
    def get_defaults(cls) -> dict:
        """Return default threshold values."""
        return {
            'SPO2': {'critical_low': 90, 'warning_low': 95},
            'SYSTOLIC_BP': {
                'critical_high': 180, 'critical_low': 90,
                'warning_high': 140, 'warning_low': 100
            },
            'DIASTOLIC_BP': {'critical_high': 120, 'warning_high': 90},
            'HEART_RATE': {
                'critical_high': 150, 'critical_low': 40,
                'warning_high': 100, 'warning_low': 50
            },
            'TEMPERATURE': {
                'critical_high': 40.0, 'critical_low': 35.0,
                'warning_high': 38.5, 'warning_low': 36.0
            },
            'RESPIRATORY_RATE': {
                'critical_high': 30, 'critical_low': 8,
                'warning_high': 24, 'warning_low': 10
            },
        }
    
    def check_value(self, value: Decimal) -> str:
        """
        Check a vital value against thresholds.
        Returns: 'critical', 'warning', or 'normal'
        """
        pass
```

**Test Coverage** (15 tests):
- [ ] Test model creation with valid data
- [ ] Test vital_type unique constraint
- [ ] Test vital_type choices validation
- [ ] Test threshold fields accept null
- [ ] Test threshold fields accept decimal values
- [ ] Test is_active default True
- [ ] Test get_defaults returns all vital types
- [ ] Test check_value returns 'critical' for critical_low breach
- [ ] Test check_value returns 'critical' for critical_high breach
- [ ] Test check_value returns 'warning' for warning_low breach
- [ ] Test check_value returns 'warning' for warning_high breach
- [ ] Test check_value returns 'normal' for normal values
- [ ] Test SpO2 critical threshold (90%)
- [ ] Test temperature critical thresholds (35°C, 40°C)
- [ ] Test heart_rate critical thresholds (40, 150 bpm)

---

### 3. TriageQueue Model

**Module**: `hmis/apps/triage/models.py`

**Purpose**: Active queue entry for patients awaiting care. Automatically sorted by triage priority and arrival time. Removed when patient completes care pathway.

**Fields**:
```python
class TriageQueue(TimeStampedModel):
    """
    Active triage queue entry for a patient awaiting care.
    Removed when patient is seen by clinician or leaves.
    """
    
    STATUS_CHOICES = [
        ('WAITING', 'Waiting'),
        ('CALLED', 'Called'),
        ('WITH_CLINICIAN', 'With Clinician'),
        ('COMPLETED', 'Completed'),
        ('LEFT_WITHOUT_BEING_SEEN', 'Left Without Being Seen (LWBS)'),
    ]
    
    triage_assessment = models.OneToOneField(
        TriageAssessment,
        on_delete=models.CASCADE,
        related_name='queue_entry'
    )
    position = models.IntegerField(
        help_text="Queue position (auto-calculated by priority)"
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='WAITING'
    )
    called_at = models.DateTimeField(null=True, blank=True)
    called_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='queue_calls'
    )
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['triage_assessment__triage_category', 'triage_assessment__arrival_time']
        verbose_name = "Triage Queue Entry"
        verbose_name_plural = "Triage Queue Entries"
    
    @classmethod
    def get_active_queue(cls, area: str = None) -> QuerySet:
        """Get active queue entries, optionally filtered by area."""
        pass
    
    @classmethod
    def recalculate_positions(cls):
        """Recalculate all queue positions based on priority ordering."""
        pass
    
    def mark_called(self, called_by: User):
        """Mark patient as called."""
        pass
    
    def mark_with_clinician(self):
        """Mark patient as with clinician, update triage timestamps."""
        pass
    
    def mark_completed(self):
        """Mark queue entry as completed."""
        pass
    
    def mark_lwbs(self, reason: str = ''):
        """Mark patient as Left Without Being Seen."""
        pass
```

**Test Coverage** (20 tests):
- [ ] Test model creation with valid data
- [ ] Test triage_assessment one-to-one relationship
- [ ] Test status default is WAITING
- [ ] Test status choices validation
- [ ] Test called_at optional
- [ ] Test called_by optional
- [ ] Test ordering by category then arrival_time
- [ ] Test RED category patients appear first
- [ ] Test same category sorted by arrival_time (FIFO)
- [ ] Test get_active_queue excludes COMPLETED
- [ ] Test get_active_queue excludes LWBS
- [ ] Test get_active_queue filter by area
- [ ] Test recalculate_positions updates all entries
- [ ] Test mark_called sets called_at timestamp
- [ ] Test mark_called sets called_by user
- [ ] Test mark_called changes status to CALLED
- [ ] Test mark_with_clinician updates status
- [ ] Test mark_with_clinician sets seen_by_clinician_time on assessment
- [ ] Test mark_completed changes status
- [ ] Test mark_lwbs with reason

---

### 4. Triage Category Calculator Service

**Module**: `hmis/apps/triage/services.py`

**Purpose**: Business logic for calculating triage category based on vital signs, symptoms, and clinical indicators. Implements KETA (Kenya Emergency Triage Assessment) rules.

**Implementation**:
```python
class TriageCategoryCalculator:
    """
    Calculates triage category using KETA (Kenya Emergency Triage Assessment) rules.
    
    Priority Order:
    1. RED - Life-threatening emergencies (immediate)
    2. ORANGE - Very urgent (<10 minutes)
    3. YELLOW - Urgent (<60 minutes)
    4. GREEN - Standard (<240 minutes)
    5. BLUE - Non-urgent/Referral
    """
    
    def __init__(self, thresholds: dict = None):
        """Initialize with custom or default thresholds."""
        self.thresholds = thresholds or TriageVitalThreshold.get_defaults()
    
    def calculate(
        self,
        vitals: dict,
        mental_status: str,
        chief_complaint_category: str,
        pain_score: int = None,
        mobility: str = None,
    ) -> tuple[str, list[str]]:
        """
        Calculate triage category and generate alerts.
        
        Args:
            vitals: Dict with spo2, systolic_bp, diastolic_bp, heart_rate, 
                   temperature, respiratory_rate
            mental_status: AVPU scale value (A/V/P/U)
            chief_complaint_category: From CHIEF_COMPLAINT_CHOICES
            pain_score: 0-10 pain scale (optional)
            mobility: Mobility status (optional)
        
        Returns:
            Tuple of (category, alerts_list)
        """
        pass
    
    def _check_red_criteria(self, vitals, mental_status, chief_complaint) -> list[str]:
        """Check for RED (Emergency) criteria."""
        pass
    
    def _check_orange_criteria(self, vitals, pain_score, chief_complaint) -> list[str]:
        """Check for ORANGE (Very Urgent) criteria."""
        pass
    
    def _check_yellow_criteria(self, vitals, pain_score) -> list[str]:
        """Check for YELLOW (Urgent) criteria."""
        pass
    
    def _check_vital_alerts(self, vitals) -> list[str]:
        """Generate alerts for abnormal vitals."""
        pass
```

**Test Coverage** (20 tests):
- [ ] Test calculator initialization with defaults
- [ ] Test calculator initialization with custom thresholds
- [ ] Test RED for unresponsive (AVPU=U)
- [ ] Test RED for responds to pain only (AVPU=P)
- [ ] Test RED for SpO2 < 90%
- [ ] Test RED for severe hypotension (systolic < 90)
- [ ] Test RED for severe hypertension (systolic > 180)
- [ ] Test RED for severe bradycardia (HR < 40)
- [ ] Test RED for severe tachycardia (HR > 150)
- [ ] Test RED for altered consciousness chief complaint
- [ ] Test ORANGE for chest pain with abnormal vitals
- [ ] Test ORANGE for difficulty breathing with SpO2 < 95%
- [ ] Test ORANGE for severe pain (score 9-10)
- [ ] Test ORANGE for trauma with immobile status
- [ ] Test YELLOW for moderate pain (score 7-8)
- [ ] Test YELLOW for fever with warning vitals
- [ ] Test GREEN for stable vitals and low pain
- [ ] Test BLUE for non-urgent chief complaint, stable vitals
- [ ] Test alerts generated for each critical vital
- [ ] Test multiple alerts combined correctly

---

## API Endpoints

**Module**: `hmis/apps/triage/views.py`, `hmis/apps/triage/urls.py`

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/triage/` | GET | List triage assessments (filterable) | Yes |
| `/api/triage/` | POST | Create new triage assessment | Yes + `perform_triage` |
| `/api/triage/{id}/` | GET | Get triage assessment detail | Yes |
| `/api/triage/{id}/` | PATCH | Update triage assessment | Yes + `perform_triage` |
| `/api/triage/{id}/` | DELETE | Delete triage assessment | Yes + Admin |
| `/api/triage/calculate-category/` | POST | Calculate suggested category | Yes |
| `/api/triage/vital-thresholds/` | GET | Get vital thresholds | Yes |
| `/api/triage/vital-thresholds/` | PUT | Update vital thresholds | Yes + Admin |
| `/api/triage/queue/` | GET | Get active triage queue | Yes + `view_triage_queue` |
| `/api/triage/queue/{id}/call/` | POST | Mark patient as called | Yes + `view_triage_queue` |
| `/api/triage/queue/{id}/with-clinician/` | POST | Mark patient with clinician | Yes |
| `/api/triage/queue/{id}/complete/` | POST | Mark as completed | Yes |
| `/api/triage/queue/{id}/lwbs/` | POST | Mark as left without being seen | Yes |
| `/api/triage/reports/wait-times/` | GET | Wait time statistics | Yes |
| `/api/triage/reports/volume/` | GET | Volume by category | Yes |

**API Test Coverage** (30 tests):
- [ ] Test authentication required on all endpoints
- [ ] Test `perform_triage` permission for create/update
- [ ] Test `view_triage_queue` permission for queue endpoints
- [ ] Test admin permission for delete and threshold update
- [ ] Test create triage assessment with valid data
- [ ] Test create triage assessment auto-calculates category
- [ ] Test create triage assessment auto-adds to queue
- [ ] Test create triage assessment generates alerts
- [ ] Test update triage assessment
- [ ] Test category override requires reason
- [ ] Test category override logs audit entry
- [ ] Test list triage assessments pagination
- [ ] Test list filter by triage_category
- [ ] Test list filter by assigned_area
- [ ] Test list filter by date range
- [ ] Test calculate-category endpoint returns category and alerts
- [ ] Test get vital thresholds returns all types
- [ ] Test update vital thresholds (admin only)
- [ ] Test get queue returns sorted by priority
- [ ] Test get queue excludes completed entries
- [ ] Test get queue filter by assigned_area
- [ ] Test call endpoint updates status and timestamp
- [ ] Test with-clinician endpoint updates assessment
- [ ] Test complete endpoint removes from active queue
- [ ] Test lwbs endpoint with reason
- [ ] Test wait-times report returns statistics
- [ ] Test volume report returns counts by category
- [ ] Test error response 400 for invalid data
- [ ] Test error response 401 for unauthenticated
- [ ] Test error response 403 for insufficient permissions
- [ ] Test error response 404 for non-existent assessment

---

## Serializers

**Module**: `hmis/apps/triage/serializers.py`

```python
class TriageAssessmentSerializer(serializers.ModelSerializer):
    """Serializer for TriageAssessment model."""
    
    patient_name = serializers.CharField(source='encounter.patient.full_name', read_only=True)
    patient_mrn = serializers.CharField(source='encounter.patient.mrn', read_only=True)
    patient_age = serializers.IntegerField(source='encounter.patient.age', read_only=True)
    vitals = serializers.SerializerMethodField()
    wait_time_minutes = serializers.SerializerMethodField()
    is_wait_time_exceeded = serializers.SerializerMethodField()
    triaged_by_name = serializers.CharField(source='triaged_by.get_full_name', read_only=True)
    
    class Meta:
        model = TriageAssessment
        fields = [
            'id', 'encounter', 'patient_name', 'patient_mrn', 'patient_age',
            'chief_complaint', 'chief_complaint_category', 'pain_score',
            'mental_status', 'mobility', 'arrival_mode', 'allergies_noted',
            'triage_category', 'auto_calculated_category', 'category_override_reason',
            'assigned_area', 'assigned_clinician',
            'arrival_time', 'triage_start_time', 'triage_end_time', 'seen_by_clinician_time',
            'alerts', 'vitals', 'wait_time_minutes', 'is_wait_time_exceeded',
            'triaged_by', 'triaged_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['auto_calculated_category', 'alerts', 'triaged_by']


class TriageAssessmentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating triage assessments."""
    
    def validate(self, data):
        """Ensure override reason provided if category differs from auto-calculated."""
        pass
    
    def create(self, validated_data):
        """Auto-calculate category, generate alerts, add to queue."""
        pass


class TriageQueueSerializer(serializers.ModelSerializer):
    """Serializer for triage queue entries."""
    
    assessment = TriageAssessmentSerializer(source='triage_assessment', read_only=True)
    
    class Meta:
        model = TriageQueue
        fields = ['id', 'assessment', 'position', 'status', 'called_at', 'notes']


class TriageVitalThresholdSerializer(serializers.ModelSerializer):
    """Serializer for vital thresholds."""
    
    class Meta:
        model = TriageVitalThreshold
        fields = '__all__'


class TriageCategoryCalculationSerializer(serializers.Serializer):
    """Serializer for category calculation request."""
    
    spo2 = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    systolic_bp = serializers.IntegerField(required=False)
    diastolic_bp = serializers.IntegerField(required=False)
    heart_rate = serializers.IntegerField(required=False)
    temperature = serializers.DecimalField(max_digits=4, decimal_places=1, required=False)
    respiratory_rate = serializers.IntegerField(required=False)
    mental_status = serializers.ChoiceField(choices=['A', 'V', 'P', 'U'])
    chief_complaint_category = serializers.CharField()
    pain_score = serializers.IntegerField(min_value=0, max_value=10, required=False)
    mobility = serializers.CharField(required=False)
```

---

## Database Migrations

### Migration 0001: Create Triage Models
```python
# hmis/apps/triage/migrations/0001_initial.py

# Models created:
# - TriageAssessment
# - TriageVitalThreshold
# - TriageQueue

# Permissions added:
# - perform_triage
# - view_triage_queue
# - override_triage_category
```

### Migration 0002: Load Default Thresholds
```python
# hmis/apps/triage/migrations/0002_load_default_thresholds.py

# Data migration to load default vital thresholds:
# - SPO2, SYSTOLIC_BP, DIASTOLIC_BP, HEART_RATE, TEMPERATURE, RESPIRATORY_RATE
```

---

## Integration Points

### 1. Encounters Integration
- **Module**: `hmis/apps/encounters/`
- **Description**: TriageAssessment links to Encounter via OneToOne relationship. Vitals from encounter are used for triage calculations.
- **Dependencies**: Encounter must exist before triage assessment can be created.

### 2. Patients Integration
- **Module**: `hmis/apps/patients/`
- **Description**: Patient allergies are snapshotted into triage assessment. Patient demographics displayed in queue.
- **Dependencies**: Patient record for allergies lookup.

### 3. Inpatient Integration (Track D)
- **Module**: `hmis/apps/inpatient/`
- **Description**: Triage can check bed availability for ER admissions. Assigned_area can route to wards.
- **Dependencies**: Ward and Bed models from Track D.

### 4. Audit Logging
- **Module**: `hmis/apps/core/`
- **Description**: All triage actions logged via AuditLog. Category overrides are specially flagged.
- **Dependencies**: AuditLog model, audit logging utilities.

### 5. RBAC Integration (Sprint 1.1-1.2 Track C)
- **Module**: `hmis/apps/core/permissions.py`
- **Description**: Triage permissions integrated with role system. Triage Nurse role gets perform_triage permission.
- **Dependencies**: Role, StaffProfile models.

---

## Settings Configuration

```python
# hmis/settings/base.py

# Triage Module Settings
TRIAGE_SETTINGS = {
    # Auto-add to queue on triage creation
    'AUTO_ADD_TO_QUEUE': True,
    
    # Queue refresh interval for frontend (seconds)
    'QUEUE_REFRESH_INTERVAL': 30,
    
    # Enable wait time exceeded alerts
    'WAIT_TIME_ALERTS_ENABLED': True,
    
    # Default triage scale (for future multi-scale support)
    'DEFAULT_TRIAGE_SCALE': 'KETA',
    
    # Require override reason when changing from auto-calculated category
    'REQUIRE_OVERRIDE_REASON': True,
}

# Target wait times by KETA category (minutes)
TRIAGE_TARGET_WAIT_TIMES = {
    'RED': 0,      # Immediate
    'ORANGE': 10,  # Very Urgent
    'YELLOW': 60,  # Urgent
    'GREEN': 240,  # Standard (4 hours)
    'BLUE': 480,   # Non-Urgent (8 hours)
}
```

---

## UI Components

### 1. Triage Assessment Form
- **Location**: `web-app/components/triage/TriageAssessmentForm.tsx`
- **Description**: Form for creating/editing triage assessments with vitals capture, AVPU selector, pain scale, and chief complaint dropdown.
- **Props**: `encounterId`, `patientId`, `onSuccess`, `onCancel`
- **Dependencies**: shadcn/ui Form, Select, Input, Button components

### 2. Triage Category Badge
- **Location**: `web-app/components/triage/TriageCategoryBadge.tsx`
- **Description**: Color-coded badge displaying triage category (RED/ORANGE/YELLOW/GREEN/BLUE)
- **Props**: `category`, `size`
- **Dependencies**: shadcn/ui Badge component

### 3. Triage Queue Dashboard
- **Location**: `web-app/components/triage/TriageQueueDashboard.tsx`
- **Description**: Real-time queue display with patient cards sorted by priority. Shows wait time, category, assigned area.
- **Props**: `areaFilter`, `refreshInterval`
- **Dependencies**: TriageCategoryBadge, PatientCard components

### 4. Vital Alerts Panel
- **Location**: `web-app/components/triage/VitalAlertsPanel.tsx`
- **Description**: Displays critical and warning alerts for current patient's vitals
- **Props**: `alerts`, `vitals`
- **Dependencies**: Alert, AlertDescription components

### 5. Wait Time Statistics Card
- **Location**: `web-app/components/triage/WaitTimeStatsCard.tsx`
- **Description**: Dashboard card showing average wait times by category
- **Props**: `dateRange`
- **Dependencies**: Card, Chart components

---

## TDD Approach

### Example Test Cases

```python
# Test file: tests/test_triage_models.py

import pytest
from django.utils import timezone
from datetime import timedelta
from rest_framework import status

from hmis.apps.triage.models import TriageAssessment, TriageQueue, TriageVitalThreshold
from hmis.apps.triage.services import TriageCategoryCalculator


class TestTriageAssessment:
    """Tests for TriageAssessment model."""
    
    def test_create_triage_assessment_with_valid_data(self, db, sample_encounter, test_user):
        """Should create triage assessment with all required fields."""
        # Given: Valid triage data
        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Chest pain radiating to left arm",
            chief_complaint_category="CHEST_PAIN",
            pain_score=8,
            mental_status="A",
            mobility="AMBULATORY",
            arrival_mode="WALK_IN",
            triage_category="ORANGE",
            auto_calculated_category="ORANGE",
            assigned_area="ER_ACUTE",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        # Then: Assessment is created
        assert assessment.id is not None
        assert assessment.triage_category == "ORANGE"
        assert assessment.encounter == sample_encounter
    
    def test_category_override_requires_reason(self, db, sample_encounter, test_user):
        """Should require reason when nurse overrides auto-calculated category."""
        # Given: Auto-calculated YELLOW, nurse wants ORANGE
        assessment = TriageAssessment(
            encounter=sample_encounter,
            chief_complaint="Abdominal pain",
            chief_complaint_category="ABDOMINAL_PAIN",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="ORANGE",
            auto_calculated_category="YELLOW",
            category_override_reason="",  # Empty reason
            assigned_area="ER_ACUTE",
            arrival_time=timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        
        # Then: Validation error
        with pytest.raises(ValidationError) as exc_info:
            assessment.full_clean()
        assert 'category_override_reason' in str(exc_info.value)
    
    def test_wait_time_exceeded_for_yellow_category(self, db, sample_encounter, test_user):
        """Should flag wait time exceeded for YELLOW patient waiting >60 min."""
        # Given: YELLOW patient arrived 75 minutes ago
        assessment = TriageAssessment.objects.create(
            encounter=sample_encounter,
            chief_complaint="Fever",
            chief_complaint_category="FEVER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="YELLOW",
            auto_calculated_category="YELLOW",
            assigned_area="OPD",
            arrival_time=timezone.now() - timedelta(minutes=75),
            triage_start_time=timezone.now() - timedelta(minutes=70),
            triaged_by=test_user,
        )
        
        # Then: Wait time exceeded
        assert assessment.is_wait_time_exceeded() == True
        assert assessment.get_wait_time_minutes() >= 75


class TestTriageCategoryCalculator:
    """Tests for triage category calculation logic."""
    
    def test_red_category_for_unresponsive_patient(self):
        """Should return RED for unresponsive (AVPU=U) patient."""
        # Given: Calculator and unresponsive patient
        calculator = TriageCategoryCalculator()
        vitals = {'spo2': 98, 'heart_rate': 80}
        
        # When: Calculate category
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status='U',
            chief_complaint_category='OTHER',
        )
        
        # Then: RED category with alert
        assert category == 'RED'
        assert 'Unresponsive patient' in alerts
    
    def test_red_category_for_critical_spo2(self):
        """Should return RED for SpO2 < 90%."""
        # Given: Critically low oxygen
        calculator = TriageCategoryCalculator()
        vitals = {'spo2': 85}
        
        # When: Calculate category
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status='A',
            chief_complaint_category='DIFFICULTY_BREATHING',
        )
        
        # Then: RED with hypoxemia alert
        assert category == 'RED'
        assert any('hypoxemia' in alert.lower() for alert in alerts)
    
    def test_orange_category_for_chest_pain_with_abnormal_vitals(self):
        """Should return ORANGE for chest pain with warning vitals."""
        # Given: Chest pain with elevated BP
        calculator = TriageCategoryCalculator()
        vitals = {'systolic_bp': 160, 'heart_rate': 95, 'spo2': 96}
        
        # When: Calculate category
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status='A',
            chief_complaint_category='CHEST_PAIN',
        )
        
        # Then: ORANGE (chest pain + abnormal vitals)
        assert category == 'ORANGE'


class TestTriageQueueOrdering:
    """Tests for triage queue priority sorting."""
    
    def test_queue_sorted_by_category_then_arrival(self, db, create_triage_assessment):
        """Should sort queue by category (RED first) then arrival time (FIFO)."""
        # Given: Patients with different categories and times
        yellow_early = create_triage_assessment(
            category='YELLOW',
            arrival_time=timezone.now() - timedelta(minutes=60)
        )
        red_late = create_triage_assessment(
            category='RED',
            arrival_time=timezone.now() - timedelta(minutes=10)
        )
        red_early = create_triage_assessment(
            category='RED',
            arrival_time=timezone.now() - timedelta(minutes=30)
        )
        
        # When: Get queue
        queue = TriageQueue.objects.all()
        
        # Then: RED patients first (by arrival), then YELLOW
        assert queue[0].triage_assessment == red_early  # RED, earlier
        assert queue[1].triage_assessment == red_late   # RED, later
        assert queue[2].triage_assessment == yellow_early  # YELLOW


class TestTriageAPI:
    """Tests for triage API endpoints."""
    
    def test_create_triage_requires_perform_triage_permission(
        self, api_client, test_user, triage_data
    ):
        """Should reject triage creation without perform_triage permission."""
        # Given: Authenticated user without triage permission
        api_client.force_authenticate(user=test_user)
        
        # When: Attempt to create triage
        response = api_client.post('/api/triage/', triage_data)
        
        # Then: 403 Forbidden
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_create_triage_auto_calculates_category(
        self, authenticated_client_with_triage_permission, triage_data
    ):
        """Should auto-calculate category on triage creation."""
        # Given: Triage data without category
        triage_data.pop('triage_category', None)
        triage_data.pop('auto_calculated_category', None)
        
        # When: Create triage
        response = authenticated_client_with_triage_permission.post(
            '/api/triage/', triage_data
        )
        
        # Then: Category auto-calculated
        assert response.status_code == status.HTTP_201_CREATED
        assert 'auto_calculated_category' in response.data
        assert response.data['auto_calculated_category'] in ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']
    
    def test_get_queue_returns_sorted_entries(
        self, authenticated_client_with_queue_permission
    ):
        """Should return queue sorted by priority."""
        # When: Get queue
        response = authenticated_client_with_queue_permission.get('/api/triage/queue/')
        
        # Then: Success with sorted results
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
```

---

## Acceptance Criteria Summary

| User Story | Key Acceptance Criteria | Status |
|------------|------------------------|--------|
| KE-TRI-001 | Triage nurse can capture vitals, chief complaint, AVPU, pain score | ⬜ |
| KE-TRI-002 | System auto-calculates KETA category (RED/ORANGE/YELLOW/GREEN/BLUE) | ⬜ |
| KE-TRI-003 | Nurse can override category with mandatory reason | ⬜ |
| KE-TRI-004 | Critical vital alerts displayed for dangerous values | ⬜ |
| KE-TRI-005 | Triage queue sorted by category then arrival time | ⬜ |
| KE-TRI-006 | Queue shows wait time and flags exceeded target | ⬜ |
| KE-TRI-007 | Patients can be called, marked with clinician, completed | ⬜ |
| KE-TRI-008 | Vital thresholds configurable by admin | ⬜ |
| KE-TRI-009 | Wait time and volume reports available | ⬜ |
| KE-TRI-010 | All actions audit logged for DPA compliance | ⬜ |

**Status Legend**: ⬜ Not Started | 🔄 In Progress | ✅ Complete

---

## Dependencies

### Internal Dependencies
- `hmis.apps.encounters` - Encounter model for triage linkage
- `hmis.apps.patients` - Patient model for demographics and allergies
- `hmis.apps.core` - AuditLog, TimeStampedModel, SyncQueue
- `hmis.apps.core.permissions` - Role-based permission checking
- `hmis.apps.inpatient` (Track D) - Bed availability (optional integration)

### External Dependencies
- Django 5.x
- Django REST Framework
- pytest, pytest-django
- Factory Boy (for test fixtures)

### Blocking Dependencies
- [ ] Sprint 1.1-1.2 Track A: Encounter model with vitals ✅ (completed)
- [ ] Sprint 1.1-1.2 Track C: RBAC foundation (in progress)
- [ ] Django migrations framework

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Over-reliance on auto-categorization | High | Medium | Require nurse confirmation, prominent disclaimer, audit override |
| Alert fatigue from too many warnings | Medium | Medium | Configurable thresholds, allow temporary snooze, escalation logic |
| Queue sync conflicts in busy ER | High | Low | Timestamp-based ordering, optimistic locking, frequent refresh |
| Legal liability for missed emergencies | Critical | Low | Clear "supports not replaces" disclaimer, full audit trail, nurse training |
| Performance under high load | Medium | Medium | Efficient queue queries, database indexing, pagination |
| Offline queue management complexity | Medium | Medium | Local queue cache, sync on reconnect, conflict resolution |

---

## Success Metrics

- [ ] ≥85% test coverage for triage module
- [ ] All 10 user story acceptance criteria met
- [ ] Triage assessment completion time <5 minutes (measured in pilot)
- [ ] Queue refresh/display time <2 seconds
- [ ] Zero critical/high security issues (Bandit scan)
- [ ] Offline triage capability verified
- [ ] 100% audit coverage for triage actions
- [ ] User satisfaction >4/5 from pilot triage nurses

---

## Definition of Done

- [ ] All tests written and passing (≥110 tests)
- [ ] Code coverage ≥85%
- [ ] Code reviewed and approved
- [ ] Documentation updated (README, API docs, inline comments)
- [ ] No linting errors (`make quality` passes)
- [ ] Security scan clean (`bandit`)
- [ ] Migrations tested (forward and backward)
- [ ] Offline functionality verified
- [ ] Audit logging implemented for all CRUD operations
- [ ] KETA compliance verified
- [ ] Demo ready for stakeholders
- [ ] Integration with Track D (Inpatient) verified

---

## Appendix A: Data Model Diagram

```
[Encounter] ──────────────────────────────────┐
    │                                         │
    └── [TriageAssessment] (1:1)              │
            │                                 │
            ├── triaged_by ──► [User]         │
            │                                 │
            ├── assigned_clinician ──► [User] │
            │                                 │
            └── [TriageQueue] (1:1)           │
                    │                         │
                    └── called_by ──► [User]  │
                                              │
[TriageVitalThreshold] (standalone config)    │
                                              │
[Patient] ◄───────────────────────────────────┘
    (via Encounter)
```

---

## Appendix B: State Machine Diagrams

### Triage Queue Status Transitions
```
                    ┌──────────────────────┐
                    │                      │
                    ▼                      │
WAITING ──► CALLED ──► WITH_CLINICIAN ──► COMPLETED
    │           │              │
    │           │              │
    │           └──────────────┼──► LEFT_WITHOUT_BEING_SEEN
    │                          │
    └──────────────────────────┘
```

### KETA Category Priority
```
RED (Immediate)        ◄── Highest Priority
    │
ORANGE (<10 min)
    │
YELLOW (<60 min)
    │
GREEN (<240 min)
    │
BLUE (Non-Urgent)      ◄── Lowest Priority
```

---

## Appendix C: Fixtures & Test Data

```python
# tests/conftest.py additions

@pytest.fixture
def sample_triage_assessment(db, sample_encounter, test_user):
    """Create sample triage assessment for testing."""
    from hmis.apps.triage.models import TriageAssessment
    return TriageAssessment.objects.create(
        encounter=sample_encounter,
        chief_complaint="Fever and body aches",
        chief_complaint_category="FEVER",
        pain_score=5,
        mental_status="A",
        mobility="AMBULATORY",
        arrival_mode="WALK_IN",
        triage_category="GREEN",
        auto_calculated_category="GREEN",
        assigned_area="OPD",
        arrival_time=timezone.now() - timedelta(minutes=30),
        triage_start_time=timezone.now() - timedelta(minutes=25),
        triaged_by=test_user,
    )

@pytest.fixture
def triage_data(sample_encounter):
    """Valid triage assessment data for API tests."""
    return {
        'encounter': sample_encounter.id,
        'chief_complaint': 'Chest pain',
        'chief_complaint_category': 'CHEST_PAIN',
        'pain_score': 7,
        'mental_status': 'A',
        'mobility': 'AMBULATORY',
        'arrival_mode': 'WALK_IN',
        'assigned_area': 'ER_ACUTE',
        'arrival_time': timezone.now().isoformat(),
        'triage_start_time': timezone.now().isoformat(),
    }

@pytest.fixture
def triage_nurse_user(db, test_user):
    """User with triage permissions."""
    from django.contrib.auth.models import Permission
    permission = Permission.objects.get(codename='perform_triage')
    test_user.user_permissions.add(permission)
    return test_user

@pytest.fixture
def authenticated_client_with_triage_permission(api_client, triage_nurse_user):
    """API client authenticated with triage permission."""
    api_client.force_authenticate(user=triage_nurse_user)
    return api_client

@pytest.fixture
def create_triage_assessment(db, sample_patient, test_user):
    """Factory fixture for creating triage assessments."""
    from hmis.apps.encounters.models import Encounter
    from hmis.apps.triage.models import TriageAssessment, TriageQueue
    
    def _create(category='GREEN', arrival_time=None):
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type='OPD',
            chief_complaint='Test complaint',
        )
        assessment = TriageAssessment.objects.create(
            encounter=encounter,
            chief_complaint='Test',
            chief_complaint_category='OTHER',
            mental_status='A',
            mobility='AMBULATORY',
            triage_category=category,
            auto_calculated_category=category,
            assigned_area='OPD',
            arrival_time=arrival_time or timezone.now(),
            triage_start_time=timezone.now(),
            triaged_by=test_user,
        )
        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=0,
        )
        return assessment
    
    return _create
```

---

## Appendix D: API Request/Response Examples

### Create Triage Assessment
```http
POST /api/triage/
Content-Type: application/json
Authorization: Bearer <token>

{
    "encounter": 42,
    "chief_complaint": "Severe chest pain radiating to left arm, started 2 hours ago",
    "chief_complaint_category": "CHEST_PAIN",
    "pain_score": 8,
    "mental_status": "A",
    "mobility": "WHEELCHAIR",
    "arrival_mode": "AMBULANCE",
    "allergies_noted": "Penicillin",
    "assigned_area": "ER_ACUTE",
    "arrival_time": "2026-05-15T10:30:00Z",
    "triage_start_time": "2026-05-15T10:32:00Z"
}
```

**Response** (201 Created):
```json
{
    "id": 1,
    "encounter": 42,
    "patient_name": "John Kamau",
    "patient_mrn": "MRN-20260515-0042",
    "patient_age": 55,
    "chief_complaint": "Severe chest pain radiating to left arm, started 2 hours ago",
    "chief_complaint_category": "CHEST_PAIN",
    "pain_score": 8,
    "mental_status": "A",
    "mobility": "WHEELCHAIR",
    "arrival_mode": "AMBULANCE",
    "allergies_noted": "Penicillin",
    "triage_category": "ORANGE",
    "auto_calculated_category": "ORANGE",
    "category_override_reason": "",
    "assigned_area": "ER_ACUTE",
    "assigned_clinician": null,
    "arrival_time": "2026-05-15T10:30:00Z",
    "triage_start_time": "2026-05-15T10:32:00Z",
    "triage_end_time": "2026-05-15T10:35:00Z",
    "seen_by_clinician_time": null,
    "alerts": [
        "Chest pain with elevated pain score - cardiac evaluation recommended",
        "Patient arrived by ambulance"
    ],
    "vitals": {
        "blood_pressure": "150/95",
        "heart_rate": 98,
        "spo2": 96,
        "temperature": 37.2
    },
    "wait_time_minutes": 5,
    "is_wait_time_exceeded": false,
    "triaged_by": 3,
    "triaged_by_name": "Nurse Wanjiku",
    "created_at": "2026-05-15T10:35:00Z",
    "updated_at": "2026-05-15T10:35:00Z"
}
```

### Get Triage Queue
```http
GET /api/triage/queue/?assigned_area=ER_ACUTE
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
[
    {
        "id": 5,
        "assessment": {
            "id": 12,
            "patient_name": "Mary Otieno",
            "patient_mrn": "MRN-20260515-0038",
            "triage_category": "RED",
            "chief_complaint": "Difficulty breathing, SpO2 88%",
            "assigned_area": "ER_RESUS",
            "wait_time_minutes": 2,
            "alerts": ["Severe hypoxemia - immediate intervention required"]
        },
        "position": 1,
        "status": "WAITING",
        "called_at": null
    },
    {
        "id": 1,
        "assessment": {
            "id": 1,
            "patient_name": "John Kamau",
            "patient_mrn": "MRN-20260515-0042",
            "triage_category": "ORANGE",
            "chief_complaint": "Severe chest pain",
            "assigned_area": "ER_ACUTE",
            "wait_time_minutes": 8,
            "alerts": ["Chest pain - cardiac evaluation recommended"]
        },
        "position": 2,
        "status": "CALLED",
        "called_at": "2026-05-15T10:40:00Z"
    }
]
```

### Calculate Category (Decision Support)
```http
POST /api/triage/calculate-category/
Content-Type: application/json
Authorization: Bearer <token>

{
    "spo2": 91,
    "systolic_bp": 165,
    "heart_rate": 105,
    "temperature": 38.8,
    "respiratory_rate": 26,
    "mental_status": "A",
    "chief_complaint_category": "DIFFICULTY_BREATHING",
    "pain_score": 6
}
```

**Response** (200 OK):
```json
{
    "suggested_category": "ORANGE",
    "alerts": [
        "Low oxygen saturation (SpO2 91%) - monitor closely",
        "Elevated blood pressure (165 mmHg)",
        "Tachycardia (105 bpm)",
        "Fever (38.8°C)",
        "Elevated respiratory rate (26/min)"
    ],
    "reasoning": "Difficulty breathing with multiple warning vital signs warrants Very Urgent (ORANGE) classification"
}
```

### Wait Time Report
```http
GET /api/triage/reports/wait-times/?date_from=2026-05-01&date_to=2026-05-15
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
    "period": {
        "from": "2026-05-01",
        "to": "2026-05-15"
    },
    "summary": {
        "total_patients": 523,
        "average_wait_time_minutes": 42,
        "median_wait_time_minutes": 35
    },
    "by_category": {
        "RED": {
            "count": 18,
            "target_minutes": 0,
            "average_wait_minutes": 2,
            "exceeded_target_count": 3,
            "exceeded_target_percent": 16.7
        },
        "ORANGE": {
            "count": 67,
            "target_minutes": 10,
            "average_wait_minutes": 8,
            "exceeded_target_count": 12,
            "exceeded_target_percent": 17.9
        },
        "YELLOW": {
            "count": 156,
            "target_minutes": 60,
            "average_wait_minutes": 38,
            "exceeded_target_count": 22,
            "exceeded_target_percent": 14.1
        },
        "GREEN": {
            "count": 245,
            "target_minutes": 240,
            "average_wait_minutes": 85,
            "exceeded_target_count": 8,
            "exceeded_target_percent": 3.3
        },
        "BLUE": {
            "count": 37,
            "target_minutes": 480,
            "average_wait_minutes": 120,
            "exceeded_target_count": 0,
            "exceeded_target_percent": 0
        }
    }
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | Jan 3, 2026 | AI Assistant | Initial draft from analysis document |
| 1.0 | - | Engineering Lead | Final specification (pending review) |

---

*Document prepared by Nexora Africa Ltd Engineering Team*
