# Sprint 1.1-1.2: Encounter Management - Deliverables

**Sprint Duration**: Weeks 1-4 (Phase 1)  
**Status**: 🔄 PLANNED  
**Target Start**: April 2026  
**TDD Focus**: Test vital signs validation and clinical workflows

---

## Executive Summary

Sprint 1.1-1.2 builds upon the Phase 0 foundation to deliver a production-ready Encounter Management module. This sprint focuses on enhanced vital signs validation, ICD-10 diagnosis coding, treatment plan templates, and encounter timeline views. Following TDD methodology, all tests are written BEFORE implementation.

---

## Prerequisites (From Phase 0) ✅

| Component | Status | Tests |
|-----------|--------|-------|
| Encounter Model | ✅ Complete | 41 tests |
| Basic Vitals (temp, pulse, BP, RR, weight, height, SpO2) | ✅ Complete | Validated |
| Medical History Section | ✅ Complete | 18 tests |
| Critical Vitals Detection | ✅ Complete | `has_critical_vitals()`, `get_alerts()` |
| Patient-Encounter FK | ✅ Complete | Cascade delete |

---

## Test Results Target

| Test File | Estimated Tests | Coverage Target |
|-----------|-----------------|-----------------|
| test_vitals_validation.py | 35 | 100% |
| test_diagnosis_icd10.py | 30 | 100% |
| test_treatment_plan.py | 25 | 100% |
| test_encounter_timeline.py | 20 | 100% |
| test_clinical_templates.py | 15 | 100% |
| test_encounter_api_enhanced.py | 25 | 100% |
| **Total** | **150+** | **≥85%** |

---

## Components to Implement

### 1. Enhanced Vital Signs Validation

**Module**: `hmis/apps/encounters/models.py` (extend existing)

**Current State** (Phase 0):
- Basic range validation exists
- Critical vitals detection implemented
- Alerts for abnormal values

**New Features**:
| Vital Sign | Normal Range | Warning Range | Critical Range | Unit |
|------------|--------------|---------------|----------------|------|
| Temperature | 36.1-37.2°C | 37.3-38.0°C / 35.5-36.0°C | >38.0°C / <35.5°C | °C |
| Pulse | 60-100 bpm | 50-59 / 101-120 bpm | <50 / >120 bpm | bpm |
| BP Systolic | 90-120 mmHg | 121-139 / 80-89 mmHg | ≥140 / <80 mmHg | mmHg |
| BP Diastolic | 60-80 mmHg | 81-89 / 50-59 mmHg | ≥90 / <50 mmHg | mmHg |
| Respiratory Rate | 12-20 /min | 21-25 / 10-11 /min | >25 / <10 /min | /min |
| SpO2 | 95-100% | 90-94% | <90% | % |
| Weight | 0.5-300 kg | N/A | N/A | kg |
| Height | 20-250 cm | N/A | N/A | cm |
| BMI | 18.5-24.9 | 25-29.9 / 17-18.4 | ≥30 / <17 | kg/m² |

**New Methods**:
```python
class Encounter(models.Model):
    # ... existing fields ...
    
    def get_vital_status(self, vital_name: str) -> str:
        """Return 'normal', 'warning', or 'critical' for a vital sign."""
        
    def get_all_vital_statuses(self) -> dict:
        """Return status dict for all recorded vitals."""
        
    def calculate_bmi(self) -> Optional[Decimal]:
        """Calculate BMI from weight and height."""
        
    def get_bmi_category(self) -> str:
        """Return BMI category: underweight/normal/overweight/obese."""
        
    def get_map(self) -> Optional[int]:
        """Calculate Mean Arterial Pressure from BP."""
        
    def get_vitals_summary(self) -> dict:
        """Return comprehensive vitals summary with statuses and alerts."""
```

**Test Coverage Requirements** (35 tests):
```python
# tests/test_vitals_validation.py

class TestVitalSignRanges:
    def test_temperature_normal_range(self): ...
    def test_temperature_warning_low(self): ...
    def test_temperature_warning_high(self): ...
    def test_temperature_critical_hypothermia(self): ...
    def test_temperature_critical_hyperthermia(self): ...
    
class TestBloodPressureValidation:
    def test_bp_systolic_normal(self): ...
    def test_bp_systolic_prehypertension(self): ...
    def test_bp_systolic_hypertension_stage1(self): ...
    def test_bp_systolic_hypertension_stage2(self): ...
    def test_bp_diastolic_validation(self): ...
    def test_bp_parse_format(self): ...
    def test_mean_arterial_pressure_calculation(self): ...
    
class TestBMICalculation:
    def test_bmi_calculation_normal(self): ...
    def test_bmi_category_underweight(self): ...
    def test_bmi_category_normal(self): ...
    def test_bmi_category_overweight(self): ...
    def test_bmi_category_obese(self): ...
    def test_bmi_null_when_missing_data(self): ...
    
class TestVitalStatusMethods:
    def test_get_vital_status_returns_normal(self): ...
    def test_get_vital_status_returns_warning(self): ...
    def test_get_vital_status_returns_critical(self): ...
    def test_get_all_vital_statuses(self): ...
    def test_get_vitals_summary_comprehensive(self): ...
    
class TestPediatricVitals:
    def test_pediatric_pulse_ranges(self): ...  # Higher normal for children
    def test_pediatric_respiratory_rate(self): ...
    def test_pediatric_bp_percentiles(self): ...
```

---

### 2. ICD-10 Diagnosis System

**Module**: `hmis/apps/encounters/models.py` (new models)

**Models**:
```python
class ICD10Code(models.Model):
    """ICD-10 diagnosis code reference table."""
    
    code = models.CharField(max_length=10, unique=True, db_index=True)
    short_description = models.CharField(max_length=255)
    long_description = models.TextField(blank=True)
    chapter = models.CharField(max_length=100)  # e.g., "Diseases of the respiratory system"
    category = models.CharField(max_length=100)  # e.g., "Acute upper respiratory infections"
    is_billable = models.BooleanField(default=True)  # Terminal code for billing
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = "ICD-10 Code"
        verbose_name_plural = "ICD-10 Codes"
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['short_description']),
            models.Index(fields=['chapter']),
        ]


class Diagnosis(models.Model):
    """Diagnosis entry linked to an encounter."""
    
    DIAGNOSIS_TYPE_CHOICES = [
        ('principal', 'Principal Diagnosis'),
        ('secondary', 'Secondary Diagnosis'),
        ('admitting', 'Admitting Diagnosis'),
        ('discharge', 'Discharge Diagnosis'),
        ('differential', 'Differential Diagnosis'),
    ]
    
    CERTAINTY_CHOICES = [
        ('confirmed', 'Confirmed'),
        ('provisional', 'Provisional'),
        ('ruled_out', 'Ruled Out'),
        ('suspected', 'Suspected'),
    ]
    
    encounter = models.ForeignKey(
        'Encounter',
        on_delete=models.CASCADE,
        related_name='diagnoses'
    )
    icd10_code = models.ForeignKey(
        ICD10Code,
        on_delete=models.PROTECT,
        related_name='diagnoses'
    )
    diagnosis_type = models.CharField(
        max_length=20,
        choices=DIAGNOSIS_TYPE_CHOICES,
        default='principal'
    )
    certainty = models.CharField(
        max_length=20,
        choices=CERTAINTY_CHOICES,
        default='confirmed'
    )
    clinical_notes = models.TextField(blank=True, default='')
    diagnosed_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True
    )
    diagnosed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = "Diagnosis"
        verbose_name_plural = "Diagnoses"
        ordering = ['diagnosis_type', '-diagnosed_at']
        constraints = [
            # Only one principal diagnosis per encounter
            models.UniqueConstraint(
                fields=['encounter'],
                condition=models.Q(diagnosis_type='principal'),
                name='unique_principal_diagnosis'
            )
        ]
```

**API Endpoints**:
```
GET  /api/icd10/search/?q=<query>        # Search ICD-10 codes
GET  /api/icd10/<code>/                  # Get code details
GET  /api/icd10/chapters/                # List chapters
GET  /api/icd10/common/                  # Frequently used codes

POST /api/encounters/<id>/diagnoses/     # Add diagnosis
GET  /api/encounters/<id>/diagnoses/     # List encounter diagnoses
PUT  /api/encounters/<id>/diagnoses/<id>/ # Update diagnosis
DELETE /api/encounters/<id>/diagnoses/<id>/ # Remove diagnosis
```

**Test Coverage Requirements** (30 tests):
```python
# tests/test_diagnosis_icd10.py

class TestICD10CodeModel:
    def test_icd10_code_creation(self): ...
    def test_icd10_code_uniqueness(self): ...
    def test_icd10_code_search_by_code(self): ...
    def test_icd10_code_search_by_description(self): ...
    def test_icd10_billable_filter(self): ...
    def test_icd10_chapter_grouping(self): ...
    
class TestDiagnosisModel:
    def test_diagnosis_creation(self): ...
    def test_diagnosis_requires_encounter(self): ...
    def test_diagnosis_requires_icd10_code(self): ...
    def test_diagnosis_type_choices(self): ...
    def test_diagnosis_certainty_choices(self): ...
    def test_only_one_principal_diagnosis(self): ...
    def test_multiple_secondary_diagnoses_allowed(self): ...
    def test_diagnosis_tracks_clinician(self): ...
    
class TestDiagnosisAPI:
    def test_search_icd10_codes(self): ...
    def test_search_icd10_partial_match(self): ...
    def test_search_icd10_by_chapter(self): ...
    def test_add_diagnosis_to_encounter(self): ...
    def test_add_diagnosis_requires_auth(self): ...
    def test_update_diagnosis(self): ...
    def test_delete_diagnosis(self): ...
    def test_list_encounter_diagnoses(self): ...
    def test_common_diagnoses_endpoint(self): ...
    
class TestDiagnosisValidation:
    def test_invalid_icd10_code_rejected(self): ...
    def test_inactive_icd10_code_warning(self): ...
    def test_non_billable_code_flagged(self): ...
```

**Data Migration**:
- Import ICD-10-CM codes (2024 version)
- ~70,000+ codes with descriptions
- Management command: `python manage.py import_icd10 data/icd10_codes.csv`

---

### 3. Treatment Plan Module

**Module**: `hmis/apps/encounters/models.py` (new models)

**Models**:
```python
class TreatmentPlanTemplate(models.Model):
    """Reusable treatment plan templates."""
    
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    diagnosis_codes = models.ManyToManyField(
        ICD10Code,
        blank=True,
        help_text="Suggested diagnoses for this template"
    )
    default_medications = models.TextField(
        blank=True,
        help_text="Default medications (JSON)"
    )
    default_procedures = models.TextField(
        blank=True,
        help_text="Default procedures (JSON)"
    )
    default_instructions = models.TextField(
        blank=True,
        help_text="Default patient instructions"
    )
    follow_up_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Suggested follow-up in days"
    )
    department = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Treatment Plan Template"
        verbose_name_plural = "Treatment Plan Templates"


class TreatmentPlan(models.Model):
    """Treatment plan for an encounter."""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    encounter = models.OneToOneField(
        'Encounter',
        on_delete=models.CASCADE,
        related_name='treatment_plan'
    )
    template = models.ForeignKey(
        TreatmentPlanTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    
    # Treatment details
    medications = models.TextField(
        blank=True,
        help_text="Prescribed medications (JSON)"
    )
    procedures = models.TextField(
        blank=True,
        help_text="Planned procedures (JSON)"
    )
    patient_instructions = models.TextField(blank=True)
    diet_recommendations = models.TextField(blank=True)
    activity_restrictions = models.TextField(blank=True)
    
    # Follow-up
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_notes = models.TextField(blank=True)
    
    # Referrals
    referral_needed = models.BooleanField(default=False)
    referral_specialty = models.CharField(max_length=100, blank=True)
    referral_notes = models.TextField(blank=True)
    
    # Tracking
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_treatment_plans'
    )
    approved_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_treatment_plans'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Treatment Plan"
        verbose_name_plural = "Treatment Plans"
    
    def apply_template(self, template: TreatmentPlanTemplate):
        """Apply a template to populate default values."""
        self.template = template
        self.medications = template.default_medications
        self.procedures = template.default_procedures
        self.patient_instructions = template.default_instructions
        if template.follow_up_days:
            from datetime import timedelta
            self.follow_up_date = date.today() + timedelta(days=template.follow_up_days)
```

**API Endpoints**:
```
GET  /api/treatment-templates/           # List templates
POST /api/treatment-templates/           # Create template
GET  /api/treatment-templates/<id>/      # Get template
GET  /api/treatment-templates/suggest/?diagnosis=<code>  # Suggest by diagnosis

POST /api/encounters/<id>/treatment-plan/  # Create/update plan
GET  /api/encounters/<id>/treatment-plan/  # Get plan
PATCH /api/encounters/<id>/treatment-plan/ # Partial update
POST /api/encounters/<id>/treatment-plan/apply-template/  # Apply template
```

**Test Coverage Requirements** (25 tests):
```python
# tests/test_treatment_plan.py

class TestTreatmentPlanTemplateModel:
    def test_template_creation(self): ...
    def test_template_with_diagnosis_codes(self): ...
    def test_template_default_values(self): ...
    def test_template_active_filter(self): ...
    
class TestTreatmentPlanModel:
    def test_treatment_plan_creation(self): ...
    def test_treatment_plan_one_per_encounter(self): ...
    def test_treatment_plan_status_transitions(self): ...
    def test_apply_template_populates_fields(self): ...
    def test_follow_up_date_calculation(self): ...
    
class TestTreatmentPlanAPI:
    def test_create_treatment_plan(self): ...
    def test_update_treatment_plan(self): ...
    def test_get_treatment_plan(self): ...
    def test_apply_template_endpoint(self): ...
    def test_suggest_templates_by_diagnosis(self): ...
    
class TestTreatmentPlanValidation:
    def test_medications_json_format(self): ...
    def test_procedures_json_format(self): ...
    def test_follow_up_date_not_in_past(self): ...
    def test_approval_requires_different_user(self): ...
    
class TestTreatmentPlanWorkflow:
    def test_draft_to_active_transition(self): ...
    def test_active_to_completed_transition(self): ...
    def test_cancelled_cannot_be_reactivated(self): ...
```

---

### 4. Encounter Timeline View

**Module**: `hmis/apps/encounters/views.py` (new endpoints)

**API Endpoints**:
```
GET /api/patients/<id>/encounter-timeline/
    ?start_date=YYYY-MM-DD
    &end_date=YYYY-MM-DD
    &encounter_type=OPD,IPD
    &include_vitals=true
    &include_diagnoses=true
    &include_treatment=true
```

**Response Format**:
```json
{
  "patient": {
    "mrn": "MRN-20251229-0001",
    "name": "John Doe",
    "age": 35
  },
  "timeline": [
    {
      "encounter_id": 1,
      "date": "2026-04-15",
      "type": "OPD",
      "chief_complaint": "Persistent cough",
      "vitals_summary": {
        "temperature": {"value": 37.8, "status": "warning", "unit": "°C"},
        "pulse": {"value": 88, "status": "normal", "unit": "bpm"},
        "blood_pressure": {"value": "125/82", "status": "normal"},
        "has_critical": false
      },
      "diagnoses": [
        {
          "code": "J06.9",
          "description": "Acute upper respiratory infection",
          "type": "principal",
          "certainty": "confirmed"
        }
      ],
      "treatment_plan": {
        "status": "completed",
        "medications_count": 3,
        "follow_up_date": "2026-04-22"
      },
      "alerts": []
    }
  ],
  "statistics": {
    "total_encounters": 5,
    "by_type": {"OPD": 4, "IPD": 1},
    "most_common_diagnosis": "J06.9",
    "average_follow_up_compliance": 80
  }
}
```

**Test Coverage Requirements** (20 tests):
```python
# tests/test_encounter_timeline.py

class TestEncounterTimelineAPI:
    def test_timeline_returns_encounters_ordered(self): ...
    def test_timeline_filters_by_date_range(self): ...
    def test_timeline_filters_by_encounter_type(self): ...
    def test_timeline_includes_vitals_summary(self): ...
    def test_timeline_includes_diagnoses(self): ...
    def test_timeline_includes_treatment_plan(self): ...
    def test_timeline_patient_statistics(self): ...
    
class TestTimelinePermissions:
    def test_timeline_requires_authentication(self): ...
    def test_sensitive_patient_timeline_restricted(self): ...
    def test_timeline_audit_logged(self): ...
    
class TestTimelinePerformance:
    def test_timeline_pagination(self): ...
    def test_timeline_select_related_optimization(self): ...
    def test_timeline_large_history_performance(self): ...
    
class TestTimelineEdgeCases:
    def test_timeline_empty_for_new_patient(self): ...
    def test_timeline_handles_incomplete_encounters(self): ...
    def test_timeline_date_range_validation(self): ...
```

---

### 5. Clinical Templates Library

**Module**: `hmis/apps/clinical_templates/` (new app)

**Models**:
```python
class ClinicalTemplate(models.Model):
    """Master clinical template for common conditions."""
    
    TEMPLATE_TYPE_CHOICES = [
        ('encounter', 'Encounter Template'),
        ('note', 'Clinical Note Template'),
        ('assessment', 'Assessment Template'),
        ('procedure', 'Procedure Template'),
    ]
    
    name = models.CharField(max_length=200)
    template_type = models.CharField(max_length=20, choices=TEMPLATE_TYPE_CHOICES)
    specialty = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    content = models.JSONField(help_text="Template structure as JSON")
    is_system = models.BooleanField(default=False)  # System vs user-created
    is_active = models.BooleanField(default=True)
    usage_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class TemplateSection(models.Model):
    """Reusable template sections."""
    
    template = models.ForeignKey(
        ClinicalTemplate,
        on_delete=models.CASCADE,
        related_name='sections'
    )
    name = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)
    is_required = models.BooleanField(default=False)
    fields = models.JSONField(help_text="Section fields definition")
```

**Pre-built Templates** (Kenya-specific):
1. **General OPD Visit** - Standard outpatient template
2. **Antenatal Care (ANC)** - MCH focused
3. **Child Wellness Check** - Pediatric template
4. **Chronic Disease Follow-up** - Diabetes, Hypertension
5. **Emergency Triage** - Quick assessment
6. **HIV/AIDS Care** - Sensitive access controlled
7. **Malaria Assessment** - Endemic disease
8. **Respiratory Infection** - Common presentation
9. **Diarrheal Disease** - Pediatric focus
10. **Trauma Assessment** - Emergency template

**Test Coverage Requirements** (15 tests):
```python
# tests/test_clinical_templates.py

class TestClinicalTemplateModel:
    def test_template_creation(self): ...
    def test_template_json_content_validation(self): ...
    def test_template_usage_tracking(self): ...
    def test_system_template_protection(self): ...
    
class TestTemplateSections:
    def test_section_ordering(self): ...
    def test_required_sections_validation(self): ...
    def test_section_fields_json_structure(self): ...
    
class TestTemplateAPI:
    def test_list_templates_by_type(self): ...
    def test_list_templates_by_specialty(self): ...
    def test_create_user_template(self): ...
    def test_clone_system_template(self): ...
    
class TestTemplateUsage:
    def test_apply_template_to_encounter(self): ...
    def test_template_usage_count_increment(self): ...
    def test_popular_templates_ranking(self): ...
```

---

## Database Migrations

### Migration 0004: Enhanced Vitals
```python
# hmis/apps/encounters/migrations/0004_enhanced_vitals.py
- Add calculated fields (BMI tracking if needed)
- Add vital status history table (optional)
```

### Migration 0005: ICD-10 Diagnosis
```python
# hmis/apps/encounters/migrations/0005_icd10_diagnosis.py
- Create ICD10Code model
- Create Diagnosis model
- Add indexes for search performance
- Add unique constraint for principal diagnosis
```

### Migration 0006: Treatment Plans
```python
# hmis/apps/encounters/migrations/0006_treatment_plans.py
- Create TreatmentPlanTemplate model
- Create TreatmentPlan model
- Add foreign keys and constraints
```

### Migration 0007: Clinical Templates
```python
# hmis/apps/clinical_templates/migrations/0001_initial.py
- Create ClinicalTemplate model
- Create TemplateSection model
- Load initial system templates
```

---

## Data Imports

### ICD-10 Codes Import
```bash
# Management command
python manage.py import_icd10 data/icd10_2024_codes.csv

# Expected file format (CSV):
# code,short_description,long_description,chapter,category,is_billable
# A00.0,Cholera due to Vibrio cholerae 01 biovar cholerae,...

# Source: WHO ICD-10 or CMS ICD-10-CM
# Estimated records: ~70,000+
```

### Clinical Templates Import
```bash
# Management command
python manage.py load_clinical_templates

# Loads from: data/clinical_templates/
# - general_opd.json
# - anc_visit.json
# - pediatric_wellness.json
# - chronic_followup.json
# etc.
```

---

## Settings Configuration

```python
# hmis/settings/base.py (additions)

# Vitals Configuration
VITALS_RANGES = {
    'temperature': {
        'unit': '°C',
        'normal': (36.1, 37.2),
        'warning_low': (35.5, 36.0),
        'warning_high': (37.3, 38.0),
        'critical_low': 35.5,
        'critical_high': 38.0,
    },
    'pulse': {
        'unit': 'bpm',
        'normal': (60, 100),
        'warning_low': (50, 59),
        'warning_high': (101, 120),
        'critical_low': 50,
        'critical_high': 120,
    },
    # ... other vitals
}

# Pediatric age threshold (years)
PEDIATRIC_AGE_THRESHOLD = 18

# ICD-10 Configuration
ICD10_VERSION = '2024'
ICD10_SEARCH_LIMIT = 50  # Max search results

# Treatment Plan Configuration
TREATMENT_PLAN_APPROVAL_REQUIRED = False  # Set True for audit compliance
DEFAULT_FOLLOW_UP_DAYS = 7

# Clinical Templates
TEMPLATE_MAX_SECTIONS = 20
TEMPLATE_MAX_FIELDS_PER_SECTION = 50
```

---

## API Documentation Updates

### New Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/encounters/<id>/vitals-summary/` | Comprehensive vitals with status |
| GET | `/api/icd10/search/` | Search ICD-10 codes |
| GET | `/api/icd10/chapters/` | List ICD-10 chapters |
| GET | `/api/icd10/common/` | Frequently used codes |
| POST | `/api/encounters/<id>/diagnoses/` | Add diagnosis |
| GET | `/api/encounters/<id>/diagnoses/` | List diagnoses |
| POST | `/api/encounters/<id>/treatment-plan/` | Create treatment plan |
| GET | `/api/encounters/<id>/treatment-plan/` | Get treatment plan |
| POST | `/api/encounters/<id>/treatment-plan/apply-template/` | Apply template |
| GET | `/api/treatment-templates/` | List templates |
| GET | `/api/treatment-templates/suggest/` | Suggest by diagnosis |
| GET | `/api/patients/<id>/encounter-timeline/` | Patient encounter history |
| GET | `/api/clinical-templates/` | List clinical templates |
| POST | `/api/clinical-templates/` | Create user template |

---

## Architecture Decisions

### 1. Separate Diagnosis Model vs Embedded

**Decision**: Create separate `Diagnosis` model with FK to Encounter

**Rationale**:
- Multiple diagnoses per encounter (principal + secondary)
- ICD-10 code referential integrity
- Audit trail per diagnosis
- Billing integration requires separate tracking
- SHA claims need diagnosis-level detail

### 2. Treatment Plan as OneToOne vs ForeignKey

**Decision**: OneToOne relationship with Encounter

**Rationale**:
- One active treatment plan per encounter
- Simplifies retrieval (`encounter.treatment_plan`)
- Prevents duplicate plans
- Clear ownership model

### 3. ICD-10 as Separate Reference Table

**Decision**: Create `ICD10Code` model with pre-loaded data

**Rationale**:
- Standardized codes (WHO/CMS maintained)
- Search/autocomplete performance
- Version tracking for updates
- Validation against official codes
- Future: Code deprecation handling

### 4. Clinical Templates as JSON Content

**Decision**: Store template structure as JSONField

**Rationale**:
- Flexible field definitions
- No schema changes for new templates
- Easy import/export
- Frontend rendering flexibility
- User customization without migrations

---

## Frontend Integration Points

### Desktop App Updates (Electron)

1. **Vitals Entry Form**
   - Color-coded input fields (normal/warning/critical)
   - Real-time BMI calculation
   - Visual alerts for critical values

2. **Diagnosis Search**
   - Autocomplete ICD-10 search
   - Recent/common codes quick-select
   - Chapter browser for discovery

3. **Treatment Plan Builder**
   - Template selection dropdown
   - Medication entry with dosage
   - Follow-up date picker
   - Patient instruction editor

4. **Encounter Timeline View**
   - Chronological encounter cards
   - Expandable details
   - Filter controls
   - Statistics dashboard

---

## Testing Strategy

### TDD Workflow
1. Write failing test for new feature
2. Implement minimum code to pass
3. Refactor for quality
4. Repeat

### Test Execution Order
```bash
# Run all Sprint 1.1-1.2 tests
pytest tests/test_vitals_validation.py -v
pytest tests/test_diagnosis_icd10.py -v
pytest tests/test_treatment_plan.py -v
pytest tests/test_encounter_timeline.py -v
pytest tests/test_clinical_templates.py -v
pytest tests/test_encounter_api_enhanced.py -v

# Run with coverage
pytest tests/test_vitals*.py tests/test_diagnosis*.py tests/test_treatment*.py \
       tests/test_encounter*.py tests/test_clinical*.py \
       --cov=hmis.apps.encounters --cov=hmis.apps.clinical_templates \
       --cov-fail-under=85
```

### E2E Tests (Playwright)
```javascript
// desktop-app/tests/e2e/encounter-management.e2e.js

test('complete encounter workflow', async ({ page }) => {
  // 1. Login
  // 2. Select patient
  // 3. Create encounter
  // 4. Enter vitals (verify color coding)
  // 5. Search and add diagnosis
  // 6. Create treatment plan from template
  // 7. Verify timeline shows new encounter
});
```

---

## Acceptance Criteria

### Sprint 1.1-1.2 Definition of Done

- [ ] All 150+ tests passing
- [ ] ≥85% code coverage for new modules
- [ ] ICD-10 codes imported (70,000+)
- [ ] 10 clinical templates loaded
- [ ] API documentation updated (OpenAPI/Swagger)
- [ ] Desktop app UI updated for new features
- [ ] E2E tests for critical workflows
- [ ] Performance: ICD-10 search < 200ms
- [ ] Performance: Timeline load < 500ms (100 encounters)
- [ ] Security: Sensitive patient encounters protected
- [ ] Audit: All clinical actions logged
- [ ] Code review completed
- [ ] Demo to stakeholders

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| ICD-10 data import issues | High | Medium | Test with sample data first, validate counts |
| Performance with large ICD-10 table | Medium | Medium | Add proper indexes, implement caching |
| Template JSON schema validation | Medium | Low | Define strict JSON schema, validate on save |
| Scope creep (feature requests) | High | High | Strict sprint scope, defer to 1.3+ |
| Integration with existing Encounter | Medium | Low | Backward-compatible migrations |

---

## Dependencies

### External
- ICD-10-CM 2024 code files (CMS download)
- WHO ICD-10 documentation

### Internal
- Phase 0 Patient model ✅
- Phase 0 Encounter model ✅
- Phase 0 Authentication ✅
- Phase 0 Audit logging ✅

---

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Enhanced Vitals | Tests + Implementation + API |
| 2 | ICD-10 Diagnosis | Models + Import + Search API |
| 3 | Treatment Plans | Templates + Plans + Workflow |
| 4 | Timeline + Templates | Timeline API + Clinical Templates + E2E |

---

## Post-Sprint Checklist

- [ ] Update ROADMAP.md with completion status
- [ ] Create sprint-1.1-1.2-deliverables.md (this document) with test results
- [ ] Tag release: `v0.2.0-encounter-management`
- [ ] Update test coverage badge
- [ ] Prepare demo for stakeholders
- [ ] Document any deferred items for Sprint 1.3+
- [ ] Retrospective notes

---

*Document Version: 1.0*  
*Created: December 29, 2025*  
*Author: Vitora HMIS Development Team*
