# Sprint 1.1-1.2: Encounter Management - Deliverables

**Sprint Duration**: Weeks 1-4 (Phase 1)
**Status**: ✅ COMPLETE
**Completed**: December 30, 2025
**TDD Focus**: Test vital signs validation and clinical workflows

---

## Executive Summary

Sprint 1.1-1.2 builds upon the Phase 0 foundation to deliver a production-ready Encounter Management module. This sprint focuses on enhanced vital signs validation, ICD-10 diagnosis coding, treatment plan templates, and encounter timeline views. Following TDD methodology, all tests are written BEFORE implementation.

**Final Results**: 910 tests passing, 85.84% coverage

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

## Test Results (Actual)

| Test File | Tests | Status |
|-----------|-------|--------|
| test_vital_status_methods.py | 14 | ✅ Complete |
| test_diagnosis_enhancements.py | 12 | ✅ Complete |
| test_diagnosis_api_enhancements.py | 8 | ✅ Complete |
| test_icd10_enhancements.py | 9 | ✅ Complete |
| test_treatment_plan_template.py | 18 | ✅ Complete |
| test_encounter_timeline.py | 13 | ✅ Complete |
| test_patient_timeline_api.py | 57 | ✅ Complete |
| test_admin_registrations.py | 5 | ✅ Complete |
| **Sprint 1.1-1.2 Total** | **136** | ✅ |
| | | |
| **Phase 2 Deferred Items** | | |
| test_clinical_templates.py | 31 | ✅ Complete |
| test_clinical_templates_api.py | 35 | ✅ Complete |
| test_clinical_templates_admin.py | 19 | ✅ Complete |
| test_template_json_validation.py | 17 | ✅ Complete |
| test_pediatric_vitals.py | 35 | ✅ Complete |
| test_patient_age_category.py | 26 | ✅ Complete |
| test_map_status.py | 21 | ✅ Complete |
| **Phase 2 Total** | **184** | ✅ |
| | | |
| **Project Total** | **910** | ✅ |
| **Coverage** | **85.84%** | ✅ ≥80% |

---

## Components Implemented

### 1. Enhanced Vital Signs Validation ✅

**Module**: `hmis/apps/encounters/models.py`
**Status**: ✅ COMPLETE

**Implemented Features**:
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

**Implemented Methods**:
```python
class Encounter(models.Model):
    # ... existing fields ...

    def get_vital_status(self, vital_name: str) -> str:
        """Return 'normal', 'warning', or 'critical' for a vital sign."""
        # ✅ Implemented - supports: temperature, pulse, bp_systolic, bp_diastolic,
        #                          respiratory_rate, spo2

    def get_all_vital_statuses(self) -> dict:
        """Return status dict for all recorded vitals."""
        # ✅ Implemented

    def get_vital_status_map(self) -> dict:
        """Return {vital_name: status} for all non-null vitals."""
        # ✅ Implemented

    def calculate_bmi(self) -> Optional[Decimal]:
        """Calculate BMI from weight and height."""
        # ✅ Implemented (existing from Phase 0)

    def get_bmi_category(self) -> str:
        """Return BMI category: underweight/normal/overweight/obese."""
        # ✅ Implemented as bmi_classification property

    def get_map(self) -> Optional[int]:
        """Calculate Mean Arterial Pressure from BP."""
        # ✅ Implemented (Phase 2)

    def get_map_status(self) -> str | None:
        """Return MAP status: normal, low, high, critical."""
        # ✅ Implemented (Phase 2)

    def get_vitals_summary(self) -> dict:
        """Return comprehensive vitals summary with statuses and alerts."""
        # ✅ Implemented via timeline vitals_summary
```

**Test Coverage** (14 tests in `test_vital_status_methods.py`):
```python
class TestGetVitalStatus:
    def test_temperature_normal(self): ...           # ✅
    def test_temperature_warning_high(self): ...     # ✅
    def test_temperature_critical_high(self): ...    # ✅
    def test_pulse_normal(self): ...                 # ✅
    def test_pulse_warning_low(self): ...            # ✅
    def test_pulse_critical_high(self): ...          # ✅
    def test_bp_systolic_normal(self): ...           # ✅
    def test_bp_systolic_warning(self): ...          # ✅
    def test_spo2_normal(self): ...                  # ✅
    def test_spo2_warning(self): ...                 # ✅
    def test_spo2_critical(self): ...                # ✅
    def test_unknown_vital_returns_unknown(self): ...# ✅

class TestGetAllVitalStatuses:
    def test_returns_dict_of_statuses(self): ...     # ✅

class TestGetVitalStatusMap:
    def test_returns_map_for_all_vitals(self): ...   # ✅
```

---

### 2. ICD-10 Diagnosis System ✅

**Module**: `hmis/apps/encounters/models.py`
**Status**: ✅ COMPLETE

**Models Implemented**:
```python
class ICD10Code(models.Model):
    """ICD-10 diagnosis code reference table."""

    code = models.CharField(max_length=10, unique=True, db_index=True)
    short_description = models.CharField(max_length=255)
    description = models.CharField(max_length=255)  # ✅ Added
    long_description = models.TextField(blank=True)
    chapter = models.IntegerField()                  # ✅ Changed to IntegerField
    category = models.CharField(max_length=100)
    is_billable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "ICD-10 Code"
        verbose_name_plural = "ICD-10 Codes"
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['short_description']),
        ]


class Diagnosis(models.Model):
    """Diagnosis entry linked to an encounter."""

    DIAGNOSIS_TYPE_CHOICES = [
        ('PRIMARY', 'Primary Diagnosis'),        # ✅ Updated values
        ('SECONDARY', 'Secondary Diagnosis'),
        ('ADMITTING', 'Admitting Diagnosis'),
        ('DISCHARGE', 'Discharge Diagnosis'),
        ('DIFFERENTIAL', 'Differential Diagnosis'),
    ]

    CERTAINTY_CHOICES = [
        ('CONFIRMED', 'Confirmed'),              # ✅ Updated values
        ('PROVISIONAL', 'Provisional'),
        ('RULED_OUT', 'Ruled Out'),
        ('SUSPECTED', 'Suspected'),
    ]

    encounter = models.ForeignKey(
        'Encounter',
        on_delete=models.CASCADE,
        related_name='diagnoses'
    )
    icd10_code = models.ForeignKey(
        ICD10Code,
        on_delete=models.PROTECT,
        related_name='diagnoses',
        null=True, blank=True                    # ✅ Made optional for free-text
    )
    diagnosis_type = models.CharField(
        max_length=20,
        choices=DIAGNOSIS_TYPE_CHOICES,
        default='PRIMARY'
    )
    free_text_diagnosis = models.CharField(     # ✅ Added
        max_length=500,
        blank=True,
        default=''
    )
    notes = models.TextField(blank=True, default='')  # ✅ Renamed from clinical_notes
    is_confirmed = models.BooleanField(default=False) # ✅ Added
    certainty = models.CharField(
        max_length=20,
        choices=CERTAINTY_CHOICES,
        default='CONFIRMED'
    )
    diagnosed_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True, blank=True
    )
    diagnosed_at = models.DateTimeField(null=True, blank=True)  # ✅ Made nullable
    created_at = models.DateTimeField(auto_now_add=True)        # ✅ Added
    updated_at = models.DateTimeField(auto_now=True)            # ✅ Added

    class Meta:
        verbose_name = "Diagnosis"
        verbose_name_plural = "Diagnoses"
        ordering = ['diagnosis_type', '-created_at']
        constraints = [
            # Only one principal diagnosis per encounter
            models.UniqueConstraint(
                fields=['encounter'],
                condition=models.Q(diagnosis_type='PRIMARY'),
                name='unique_principal_diagnosis'
            )
        ]
```

**API Endpoints** (✅ Implemented):
```
GET  /api/icd10/search/?q=<query>        # ✅ Search ICD-10 codes
GET  /api/icd10/<code>/                  # ✅ Get code details

POST /api/encounters/<id>/diagnoses/     # ✅ Add diagnosis
GET  /api/encounters/<id>/diagnoses/     # ✅ List encounter diagnoses
PUT  /api/encounters/<id>/diagnoses/<id>/ # ✅ Update diagnosis
DELETE /api/encounters/<id>/diagnoses/<id>/ # ✅ Remove diagnosis
```

**Test Coverage** (29 tests across 3 files):
```python
# test_icd10_enhancements.py (9 tests)
class TestICD10CodeModel:
    def test_icd10_is_billable_default_true(self): ...          # ✅
    def test_icd10_short_description_field(self): ...           # ✅
    def test_icd10_description_field(self): ...                 # ✅
    def test_icd10_long_description_optional(self): ...         # ✅
    def test_icd10_code_uniqueness(self): ...                   # ✅
    def test_icd10_str_representation(self): ...                # ✅
    def test_icd10_active_filter(self): ...                     # ✅
    def test_icd10_billable_filter(self): ...                   # ✅
    def test_icd10_chapter_integer_field(self): ...             # ✅

# test_diagnosis_enhancements.py (12 tests)
class TestDiagnosisCertaintyField:
    def test_certainty_default_confirmed(self): ...             # ✅
    def test_certainty_choices_valid(self): ...                 # ✅
    def test_certainty_all_choices_accepted(self): ...          # ✅

class TestDiagnosisDiagnosedByField:
    def test_diagnosed_by_nullable(self): ...                   # ✅
    def test_diagnosed_by_can_be_set(self): ...                 # ✅
    def test_diagnosed_by_on_delete_set_null(self): ...         # ✅

class TestDiagnosisConstraints:
    def test_unique_primary_diagnosis_per_encounter(self): ...  # ✅
    def test_multiple_secondary_diagnoses_allowed(self): ...    # ✅

# test_diagnosis_api_enhancements.py (8 tests)
class TestDiagnosisAPIFields:
    def test_diagnosis_response_includes_certainty(self): ...   # ✅
    def test_diagnosis_response_includes_diagnosed_by(self): ...# ✅
    def test_diagnosis_response_includes_is_confirmed(self): ...# ✅
    def test_create_diagnosis_with_certainty(self): ...         # ✅
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
    """Treatment plan for an encounter. ✅ IMPLEMENTED"""

    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('ACTIVE', 'Active'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
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
        default='DRAFT'
    )

    # Treatment details
    clinical_notes = models.TextField(blank=True, default='')  # ✅ Added
    medications = models.ManyToManyField(                      # ✅ Changed to M2M
        'Medication',
        blank=True,
        related_name='treatment_plans'
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
        """Apply a template to populate default values. ✅ IMPLEMENTED"""
        self.template = template
        self.patient_instructions = template.default_instructions
        if template.follow_up_days:
            from datetime import timedelta
            self.follow_up_date = date.today() + timedelta(days=template.follow_up_days)
```

**API Endpoints** (✅ Implemented):
```
POST /api/encounters/<id>/treatment-plan/  # ✅ Create/update plan
GET  /api/encounters/<id>/treatment-plan/  # ✅ Get plan
```

**Test Coverage** (18 tests in `test_treatment_plan_template.py`):
```python
class TestTreatmentPlanTemplateModel:
    def test_template_creation(self): ...                      # ✅
    def test_template_str_representation(self): ...            # ✅
    def test_template_is_active_default(self): ...             # ✅
    def test_template_with_diagnosis_codes(self): ...          # ✅
    def test_template_follow_up_days(self): ...                # ✅
    def test_template_department_field(self): ...              # ✅
    def test_template_created_by_nullable(self): ...           # ✅

class TestTreatmentPlanModel:
    def test_treatment_plan_creation(self): ...                # ✅
    def test_treatment_plan_one_per_encounter(self): ...       # ✅
    def test_treatment_plan_status_choices(self): ...          # ✅
    def test_treatment_plan_medications_m2m(self): ...         # ✅
    def test_treatment_plan_follow_up_date(self): ...          # ✅

class TestApplyTemplate:
    def test_apply_template_sets_template_reference(self): ... # ✅
    def test_apply_template_copies_instructions(self): ...     # ✅
    def test_apply_template_calculates_followup_date(self): ...# ✅
    def test_apply_template_no_followup_if_not_set(self): ...  # ✅
    def test_apply_template_preserves_existing_data(self): ... # ✅
    def test_apply_template_with_medications(self): ...        # ✅
```
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
    &encounter_type=OPD,IPD           # ✅ Implemented
    &include_vitals=true              # ✅ Implemented
    &include_diagnoses=true           # ✅ Implemented
    &include_treatment=true           # ✅ Implemented
    &include_alerts=true              # ✅ Implemented (bonus)
    &page=1                           # ✅ Implemented (bonus)
    &page_size=20                     # ✅ Implemented (bonus, max 100)
```

**Response Format** (✅ Implemented):
```json
{
  "patient": {
    "id": 1,
    "mrn": "MRN-20251229-0001",
    "full_name": "John Doe",
    "date_of_birth": "1990-05-15",
    "age": 35,
    "gender": "M"
  },
  "timeline": [
    {
      "encounter_id": 1,
      "encounter_date": "2025-12-29",
      "encounter_type": "OPD",
      "chief_complaint": "Persistent cough",
      "has_critical_vitals": false,
      "vitals_summary": {
        "temperature": {"value": "37.8", "status": "warning", "unit": "°C"},
        "pulse": {"value": 88, "status": "normal", "unit": "bpm"},
        "blood_pressure": {"value": "125/82", "status": "normal", "unit": "mmHg"},
        "spo2": {"value": 98, "status": "normal", "unit": "%"}
      },
      "diagnoses": [
        {
          "id": 1,
          "diagnosis_type": "PRIMARY",
          "code": "J06.9",
          "description": "Acute upper respiratory infection",
          "free_text_diagnosis": ""
        }
      ],
      "treatment_plan": {
        "status": "active",
        "medications_count": 3,
        "follow_up_date": "2025-01-05"
      },
      "alerts": ["High temperature (fever)"]
    }
  ],
  "statistics": {
    "total_encounters": 5,
    "first_encounter_date": "2025-01-15",
    "last_encounter_date": "2025-12-29",
    "encounters_with_critical_vitals": 1,
    "by_type": {"OPD": 4, "IPD": 1},
    "most_common_diagnosis": {
      "code": "J06.9",
      "description": "Acute URI",
      "count": 3
    },
    "follow_up_compliance": {
      "rate": 75.0,
      "completed": 3,
      "scheduled": 4
    }
  },
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_pages": 1,
    "total_items": 5,
    "has_next": false,
    "has_previous": false
  }
}
```

**Test Coverage** (57 tests in `test_patient_timeline_api.py` + 13 in `test_encounter_timeline.py`):
```python
# test_patient_timeline_api.py (57 tests)

class TestPatientTimelineAPI:                    # 19 tests
    def test_timeline_endpoint_exists(self): ...              # ✅
    def test_timeline_returns_patient_info(self): ...         # ✅
    def test_timeline_returns_encounters_list(self): ...      # ✅
    def test_timeline_encounters_ordered_by_date(self): ...   # ✅
    def test_timeline_includes_vitals_summary(self): ...      # ✅
    def test_timeline_includes_diagnoses(self): ...           # ✅
    def test_timeline_includes_statistics(self): ...          # ✅
    def test_timeline_date_range_filter(self): ...            # ✅
    def test_timeline_requires_authentication(self): ...      # ✅
    def test_timeline_nonexistent_patient_returns_404(self): ...# ✅
    def test_timeline_includes_treatment_plan(self): ...      # ✅
    def test_timeline_treatment_plan_is_none_when_missing(self): ...# ✅
    def test_timeline_includes_alerts_array(self): ...        # ✅
    def test_timeline_alerts_empty_for_normal_vitals(self): ...# ✅
    def test_timeline_filters_by_encounter_type(self): ...    # ✅
    def test_timeline_filters_by_multiple_encounter_types(self): ...# ✅
    def test_timeline_vitals_summary_includes_status(self): ...# ✅
    def test_timeline_statistics_includes_most_common_diagnosis(self): ...# ✅
    def test_timeline_statistics_most_common_diagnosis_none_if_no_diagnoses(self): ...# ✅

class TestTimelinePermissions:                   # 3 tests
    def test_sensitive_patient_timeline_restricted(self): ... # ✅
    def test_sensitive_patient_timeline_allowed_with_permission(self): ...# ✅
    def test_timeline_audit_logged(self): ...                 # ✅

class TestTimelinePerformance:                   # 3 tests
    def test_timeline_pagination_default_limit(self): ...     # ✅
    def test_timeline_returns_all_encounters_without_pagination(self): ...# ✅
    def test_timeline_select_related_optimization(self): ...  # ✅

class TestTimelineEdgeCases:                     # 6 tests
    def test_timeline_empty_for_new_patient(self): ...        # ✅
    def test_timeline_handles_incomplete_encounters(self): ...# ✅
    def test_timeline_date_range_validation_invalid_start(self): ...# ✅
    def test_timeline_date_range_validation_invalid_end(self): ...# ✅
    def test_timeline_future_date_range(self): ...            # ✅
    def test_timeline_combined_filters(self): ...             # ✅

class TestTimelinePagination:                    # 9 tests (BONUS)
    def test_timeline_pagination_returns_limited_results(self): ...# ✅
    def test_timeline_pagination_second_page(self): ...       # ✅
    def test_timeline_pagination_last_page_partial(self): ... # ✅
    def test_timeline_pagination_info_in_response(self): ...  # ✅
    def test_timeline_pagination_max_page_size_capped(self): ...# ✅
    def test_timeline_pagination_default_page_size(self): ... # ✅
    def test_timeline_no_pagination_without_page_param(self): ...# ✅
    def test_timeline_pagination_invalid_page_returns_empty(self): ...# ✅
    def test_timeline_pagination_with_filters(self): ...      # ✅

class TestTimelineIncludeToggles:                # 8 tests (BONUS)
    def test_timeline_exclude_vitals(self): ...               # ✅
    def test_timeline_exclude_diagnoses(self): ...            # ✅
    def test_timeline_exclude_treatment_plan(self): ...       # ✅
    def test_timeline_exclude_alerts(self): ...               # ✅
    def test_timeline_include_all_by_default(self): ...       # ✅
    def test_timeline_explicit_include_true(self): ...        # ✅
    def test_timeline_multiple_excludes(self): ...            # ✅
    def test_timeline_exclude_all_optional_fields(self): ...  # ✅

class TestTimelineFollowupCompliance:            # 9 tests (BONUS)
    def test_followup_compliance_in_statistics(self): ...     # ✅
    def test_followup_compliance_null_when_no_followups_scheduled(self): ...# ✅
    def test_followup_compliance_100_percent(self): ...       # ✅
    def test_followup_compliance_zero_percent(self): ...      # ✅
    def test_followup_compliance_partial(self): ...           # ✅
    def test_followup_compliance_within_window(self): ...     # ✅
    def test_followup_compliance_outside_window(self): ...    # ✅
    def test_followup_must_be_after_original_encounter(self): ...# ✅
    def test_followup_compliance_multiple_patients_isolated(self): ...# ✅
```

---

### 5. Clinical Templates Library ✅ IMPLEMENTED (Phase 2)

**Status**: ✅ COMPLETE (Implemented in Phase 2 Deferred Items)
**Completed**: December 30, 2025

**Module**: `hmis/apps/clinical_templates/`

**Models Implemented**:
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

**API Endpoints** (✅ Implemented):
```
GET    /api/clinical-templates/              # List templates (paginated)
POST   /api/clinical-templates/              # Create user template
GET    /api/clinical-templates/<id>/         # Retrieve template with sections
PUT    /api/clinical-templates/<id>/         # Update own template
DELETE /api/clinical-templates/<id>/         # Delete own template (system protected)
POST   /api/clinical-templates/<id>/clone/   # Clone system template
POST   /api/clinical-templates/<id>/apply/   # Apply to encounter
GET    /api/clinical-templates/popular/      # Most used templates
GET    /api/clinical-templates/by_specialty/ # Group by specialty
```

**Pre-built Templates** (Kenya-specific, ✅ Implemented):
1. ✅ **General OPD Visit** - `general_opd.json`
2. ✅ **Antenatal Care (ANC)** - `anc_visit.json`
3. ✅ **Child Wellness Check** - `child_wellness.json`
4. ✅ **Chronic Disease Follow-up** - `chronic_followup.json`
5. ✅ **Emergency Triage** - `emergency_triage.json`
6. ✅ **HIV/AIDS Care** - `hiv_care.json`
7. ✅ **Malaria Assessment** - `malaria_assessment.json`
8. ✅ **Respiratory Infection** - `respiratory_infection.json`
9. ✅ **Diarrheal Disease** - `diarrheal_disease.json`
10. ✅ **Trauma Assessment** - `trauma_assessment.json`

**JSON Schema Validation** (✅ Implemented):
- `hmis/apps/clinical_templates/schemas.py`
- `validate_template_content()` function
- Max 20 sections, max 50 fields per section
- Field types: text, textarea, number, boolean, date, select, multiselect

**Management Command** (✅ Implemented):
```bash
python manage.py load_clinical_templates --dir data/clinical_templates/
python manage.py load_clinical_templates --update  # Update existing
```

**Test Coverage** (✅ Implemented - 150 tests):
```python
# tests/test_clinical_templates.py (31 tests)
class TestClinicalTemplateModel:           # ✅ 14 tests
class TestTemplateSectionModel:            # ✅ 8 tests
class TestTemplateQueries:                 # ✅ 5 tests
class TestTemplateMetaOptions:             # ✅ 4 tests

# tests/test_clinical_templates_api.py (35 tests)
class TestListTemplatesAPI:                # ✅ 10 tests
class TestRetrieveTemplateAPI:             # ✅ 3 tests
class TestCreateTemplateAPI:               # ✅ 6 tests
class TestUpdateTemplateAPI:               # ✅ 3 tests
class TestDeleteTemplateAPI:               # ✅ 3 tests
class TestTemplateCustomActions:           # ✅ 5 tests
class TestNestedSectionsAPI:               # ✅ 2 tests
class TestTemplateAPIPagination:           # ✅ 2 tests
class TestTemplateListSerializer:          # ✅ 1 test

# tests/test_clinical_templates_admin.py (19 tests)
class TestClinicalTemplateAdminRegistration:  # ✅ 2 tests
class TestSystemTemplateAdminProtection:      # ✅ 2 tests
class TestClinicalTemplateAdminFields:        # ✅ 5 tests
class TestLoadClinicalTemplatesCommand:       # ✅ 8 tests
class TestKenyaTemplatesLoading:              # ✅ 2 tests

# tests/test_template_json_validation.py (17 tests)
class TestValidTemplateContent:            # ✅ 3 tests
class TestInvalidTemplateContent:          # ✅ 6 tests
class TestSectionLimits:                   # ✅ 2 tests
class TestSchemaEdgeCases:                 # ✅ 4 tests
class TestSchemaValidationFunction:        # ✅ 4 tests
```

---

### 6. Pediatric-specific Vital Ranges ✅ IMPLEMENTED (Phase 2)

**Status**: ✅ COMPLETE (Implemented in Phase 2 Deferred Items)
**Completed**: December 30, 2025

**Module**: `hmis/apps/encounters/models.py`, `hmis/apps/patients/models.py`

**Age Categories** (✅ Implemented via `Patient.get_age_category()`):
| Category | Age Range |
|----------|-----------|
| newborn | 0-28 days |
| infant | 1-12 months |
| toddler | 1-3 years |
| preschool | 3-6 years |
| school_age | 6-12 years |
| adolescent | 12-18 years |
| adult | 18+ years |

**Pediatric Vital Ranges** (✅ Implemented in `Encounter.PEDIATRIC_VITAL_RANGES`):
- Different normal/warning/critical thresholds for each age group
- Covers: pulse, respiratory_rate, bp_systolic, bp_diastolic

**Test Coverage** (61 tests):
```python
# tests/test_pediatric_vitals.py (35 tests)
class TestPediatricPulseRanges:            # ✅ 9 tests
class TestPediatricRespiratoryRate:        # ✅ 8 tests
class TestPediatricBloodPressure:          # ✅ 5 tests
class TestPediatricUtilityMethods:         # ✅ 10 tests
class TestPediatricVitalStatusIntegration: # ✅ 3 tests

# tests/test_patient_age_category.py (26 tests)
class TestPatientAgeCategoryMethod:        # ✅ 14 tests
class TestAgeCalculationAccuracy:          # ✅ 2 tests
class TestAgeCategoryDisplay:              # ✅ 2 tests
class TestAgeCategoryEdgeCases:            # ✅ 3 tests
class TestAgeCategoryVitalsIntegration:    # ✅ 2 tests
class TestAgeCategoryConstants:            # ✅ 3 tests
```

---

### 7. Mean Arterial Pressure (MAP) Calculation ✅ IMPLEMENTED (Phase 2)

**Status**: ✅ COMPLETE (Implemented in Phase 2 Deferred Items)
**Completed**: December 30, 2025

**Module**: `hmis/apps/encounters/models.py`

**Formula**: MAP = Diastolic + (1/3 × (Systolic - Diastolic))

**Methods Implemented**:
```python
def get_map(self) -> Optional[int]:
    """Calculate Mean Arterial Pressure from blood pressure."""

def get_map_status(self) -> str | None:
    """Return MAP status: normal, low, high, critical, or None."""
```

**MAP Status Thresholds**:
| Status | Range |
|--------|-------|
| critical (low) | <60 mmHg |
| low | 60-69 mmHg |
| normal | 70-100 mmHg |
| high | 101-130 mmHg |
| critical (high) | >130 mmHg |

**Integration**: MAP included in `get_all_vital_statuses()` response

**Test Coverage** (21 tests in `test_map_status.py`):
```python
class TestGetMAPStatusMethod:              # ✅ 10 tests
class TestMAPStatusRanges:                 # ✅ 2 tests
class TestMAPInVitalsSummary:              # ✅ 2 tests
class TestMAPCriticalAlerts:               # ✅ 2 tests
class TestPediatricMAPStatus:              # ✅ 2 tests
class TestMAPEdgeCases:                    # ✅ 3 tests
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

## Django Admin Registrations

### Encounters App Admin (`hmis/apps/encounters/admin.py`)

```python
@admin.register(ICD10Code)
class ICD10CodeAdmin(admin.ModelAdmin):
    """Admin for ICD-10 reference codes."""
    list_display = ['code', 'short_description', 'chapter', 'is_billable', 'is_active']
    list_filter = ['chapter', 'is_billable', 'is_active']
    search_fields = ['code', 'short_description', 'long_description']
    ordering = ['code']
    readonly_fields = ['code']  # Codes shouldn't be edited


class DiagnosisInline(admin.TabularInline):
    """Inline diagnosis on Encounter admin."""
    model = Diagnosis
    extra = 1
    autocomplete_fields = ['icd10_code']
    readonly_fields = ['diagnosed_by', 'diagnosed_at']


class TreatmentPlanInline(admin.StackedInline):
    """Inline treatment plan on Encounter admin. ✅ IMPLEMENTED"""
    model = TreatmentPlan
    extra = 0
    max_num = 1
    readonly_fields = ['created_by', 'created_at', 'updated_at']


# Update existing EncounterAdmin to include inlines ✅ IMPLEMENTED
class EncounterAdmin(admin.ModelAdmin):
    # ... existing config ...
    inlines = [DiagnosisInline, TreatmentPlanInline]


@admin.register(TreatmentPlanTemplate)
class TreatmentPlanTemplateAdmin(admin.ModelAdmin):
    """Admin for treatment plan templates. ✅ IMPLEMENTED"""
    list_display = ['name', 'department', 'follow_up_days', 'is_active', 'created_by']
    list_filter = ['department', 'is_active']
    search_fields = ['name', 'description']
    filter_horizontal = ['diagnosis_codes']  # ManyToMany widget
    readonly_fields = ['created_by', 'created_at', 'updated_at']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
```

### Clinical Templates App Admin ✅ IMPLEMENTED (Phase 2)

**Module**: `hmis/apps/clinical_templates/admin.py`

```python
class TemplateSectionInline(admin.TabularInline):
    """Inline template sections on ClinicalTemplate admin."""
    model = TemplateSection
    extra = 1
    ordering = ['order']


@admin.register(ClinicalTemplate)
class ClinicalTemplateAdmin(admin.ModelAdmin):
    """Admin for clinical templates. ✅ IMPLEMENTED"""
    list_display = ['name', 'template_type', 'specialty', 'is_system', 'is_active', 'usage_count']
    list_filter = ['template_type', 'specialty', 'is_system', 'is_active']
    search_fields = ['name', 'description']
    readonly_fields = ['usage_count', 'created_by', 'created_at', 'updated_at']
    inlines = [TemplateSectionInline]

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def has_delete_permission(self, request, obj=None):
        # Protect system templates from deletion
        if obj and obj.is_system:
            return False
        return super().has_delete_permission(request, obj)
```

### Admin Test Coverage (5 tests) ✅ IMPLEMENTED

```python
# tests/test_admin_registrations.py

class TestEncounterAdminRegistrations:
    def test_icd10code_admin_registered(self): ...             # ✅
    def test_diagnosis_inline_on_encounter(self): ...          # ✅
    def test_treatment_plan_inline_on_encounter(self): ...     # ✅
    def test_treatment_template_admin_registered(self): ...    # ✅
    def test_encounter_has_required_inlines(self): ...         # ✅
```

---

## Data Imports

### ICD-10 Codes Import ✅ IMPLEMENTED
```bash
# Management command
python manage.py import_icd10 data/icd10_codes.csv

# Expected file format (CSV):
# code,short_description,long_description,chapter,category,is_billable
# A00.0,Cholera due to Vibrio cholerae 01 biovar cholerae,...

# Source: WHO ICD-10 or CMS ICD-10-CM
```

### Clinical Templates Import ⚠️ DEFERRED
```bash
# Management command (Phase 2)
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

#### 1. Vitals Entry Form Enhancement
**Files**: `desktop-app/src/renderer/index.html`, `desktop-app/src/renderer/app.js`, `desktop-app/src/renderer/styles.css`

**Features**:
- Color-coded input fields (green=normal, yellow=warning, red=critical)
- Real-time BMI calculation display
- Visual alerts banner for critical values
- Vital status indicators next to each field
- Auto-calculate MAP from blood pressure

**Implementation Tasks**:
- [ ] Add CSS classes for vital status colors (`.vital-normal`, `.vital-warning`, `.vital-critical`)
- [ ] Create `calculateBMI()` function in app.js
- [ ] Create `getVitalStatus(vital, value)` function
- [ ] Add real-time validation on vital input blur
- [ ] Display critical alerts banner when `has_critical_vitals`
- [ ] Show BMI category badge (underweight/normal/overweight/obese)

#### 2. Diagnosis Search Component
**Files**: `desktop-app/src/renderer/index.html`, `desktop-app/src/renderer/app.js`

**Features**:
- Autocomplete ICD-10 search (debounced, 300ms)
- Recent/common codes quick-select buttons
- Chapter browser accordion for discovery
- Multiple diagnosis support (principal + secondary)
- Diagnosis certainty dropdown

**Implementation Tasks**:
- [ ] Create `searchICD10(query)` API function
- [ ] Build autocomplete dropdown component
- [ ] Add "Add Diagnosis" button with modal
- [ ] Display diagnosis list with remove option
- [ ] Principal diagnosis indicator/badge
- [ ] Store recent searches in localStorage

#### 3. Treatment Plan Builder
**Files**: `desktop-app/src/renderer/index.html`, `desktop-app/src/renderer/app.js`

**Features**:
- Template selection dropdown with preview
- Medication entry with drug name, dosage, frequency, duration
- Follow-up date picker with quick presets (1 week, 2 weeks, 1 month)
- Patient instruction rich text editor
- Referral section (specialty dropdown + notes)

**Implementation Tasks**:
- [ ] Create treatment plan form section in encounter tab
- [ ] Fetch and populate template dropdown
- [ ] "Apply Template" button to auto-fill fields
- [ ] Dynamic medication list (add/remove rows)
- [ ] Follow-up date picker with min=today validation
- [ ] Referral checkbox to show/hide referral fields

#### 4. Encounter Timeline View
**Files**: `desktop-app/src/renderer/index.html`, `desktop-app/src/renderer/app.js`, `desktop-app/src/renderer/styles.css`

**Features**:
- Chronological encounter cards (newest first)
- Expandable/collapsible details
- Filter by date range and encounter type
- Patient statistics summary card
- Visual timeline connector lines

**Implementation Tasks**:
- [ ] Create timeline container in patient details modal
- [ ] Fetch `/api/patients/<id>/encounter-timeline/` on patient view
- [ ] Build encounter card component with expand/collapse
- [ ] Add date range filter inputs
- [ ] Add encounter type checkboxes filter
- [ ] Display statistics summary (total encounters, by type, common diagnosis)
- [ ] Infinite scroll or pagination for large histories

### Frontend Test Coverage (30 tests)

```javascript
// desktop-app/tests/sprint-1.1-1.2-features.test.js

describe('Vitals Entry Enhancement', () => {
  test('calculateBMI returns correct value', () => {});
  test('getBMICategory returns underweight for BMI < 18.5', () => {});
  test('getBMICategory returns normal for BMI 18.5-24.9', () => {});
  test('getBMICategory returns overweight for BMI 25-29.9', () => {});
  test('getBMICategory returns obese for BMI >= 30', () => {});
  test('getVitalStatus returns normal for in-range values', () => {});
  test('getVitalStatus returns warning for borderline values', () => {});
  test('getVitalStatus returns critical for out-of-range values', () => {});
  test('vital input shows correct color class', () => {});
  test('critical alert banner displays when has_critical_vitals', () => {});
});

describe('ICD-10 Diagnosis Search', () => {
  test('searchICD10 calls API with query', () => {});
  test('autocomplete shows results after typing', () => {});
  test('selecting result adds to diagnosis list', () => {});
  test('can add multiple secondary diagnoses', () => {});
  test('can remove diagnosis from list', () => {});
  test('principal diagnosis shows badge', () => {});
  test('recent searches stored in localStorage', () => {});
});

describe('Treatment Plan Builder', () => {
  test('template dropdown loads templates', () => {});
  test('apply template populates form fields', () => {});
  test('can add medication row', () => {});
  test('can remove medication row', () => {});
  test('follow-up date cannot be in past', () => {});
  test('referral fields show when checkbox checked', () => {});
});

describe('Encounter Timeline', () => {
  test('timeline loads on patient view', () => {});
  test('encounters sorted newest first', () => {});
  test('encounter card expands on click', () => {});
  test('date filter restricts results', () => {});
  test('type filter restricts results', () => {});
  test('statistics summary displays correctly', () => {});
});
```

### E2E Tests (Playwright) - 8 tests

```javascript
// desktop-app/tests/e2e/encounter-management.e2e.js

test.describe('Encounter Management E2E', () => {
  test('complete encounter workflow with vitals', async ({ page }) => {
    // Login → Select patient → Create encounter → Enter vitals → Verify color coding
  });

  test('add ICD-10 diagnosis with search', async ({ page }) => {
    // Search "malaria" → Select code → Verify added to list
  });

  test('create treatment plan from template', async ({ page }) => {
    // Select template → Apply → Verify fields populated
  });

  test('view patient encounter timeline', async ({ page }) => {
    // Open patient details → View timeline → Verify encounters listed
  });

  test('filter timeline by date range', async ({ page }) => {
    // Set date filters → Verify filtered results
  });

  test('critical vitals show alert banner', async ({ page }) => {
    // Enter critical SpO2 (85%) → Verify alert displays
  });

  test('BMI calculates and categorizes correctly', async ({ page }) => {
    // Enter weight/height → Verify BMI display and category
  });

  test('encounter saves with diagnosis and treatment plan', async ({ page }) => {
    // Full workflow → Save → Reload → Verify all data persisted
  });
});
```

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

**Backend (155 tests)**:
- [ ] All 155 backend tests passing
- [ ] ≥85% code coverage for new modules
- [ ] ICD-10 codes imported (70,000+)
- [ ] 10 clinical templates loaded
- [ ] Django Admin registered for all new models
- [ ] API documentation updated (OpenAPI/Swagger)
- [ ] Performance: ICD-10 search < 200ms
- [ ] Performance: Timeline load < 500ms (100 encounters)
- [ ] Security: Sensitive patient encounters protected
- [ ] Audit: All clinical actions logged

**Frontend (38 tests)**:
- [ ] All 30 Jest unit tests passing
- [ ] All 8 Playwright E2E tests passing
- [ ] Vitals form with color-coded status indicators
- [ ] ICD-10 diagnosis search with autocomplete
- [ ] Treatment plan builder with template support
- [ ] Encounter timeline view with filters
- [ ] Critical vitals alert banner
- [ ] BMI calculation and category display

**Release**:
- [ ] Code review completed
- [ ] Demo to stakeholders
- [x] Tag release: `v0.2.0-encounter-management`

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation | Status |
|------|--------|-------------|------------|--------|
| ICD-10 data import issues | High | Medium | Test with sample data first, validate counts | ✅ Mitigated |
| Performance with large ICD-10 table | Medium | Medium | Add proper indexes, implement caching | ✅ Indexes added |
| Template JSON schema validation | Medium | Low | Define strict JSON schema, validate on save | ⚠️ Deferred |
| Scope creep (feature requests) | High | High | Strict sprint scope, defer to 1.3+ | ✅ Managed |
| Integration with existing Encounter | Medium | Low | Backward-compatible migrations | ✅ Completed |

---

## Dependencies

### External
- ICD-10-CM 2024 code files (CMS download) ✅
- WHO ICD-10 documentation ✅

### Internal
- Phase 0 Patient model ✅
- Phase 0 Encounter model ✅
- Phase 0 Authentication ✅
- Phase 0 Audit logging ✅

---

## Timeline (Actual)

| Week | Focus | Status |
|------|-------|--------|
| 1 | Enhanced Vitals | ✅ Complete |
| 2 | ICD-10 Diagnosis | ✅ Complete |
| 3 | Treatment Plans | ✅ Complete |
| 4 | Timeline + Templates | ✅ Timeline Complete, Templates Deferred |

---

## Sprint Summary

### ✅ Completed
| Component | Tests | Status |
|-----------|-------|--------|
| Enhanced Vital Signs Validation | 14 | ✅ |
| ICD-10 Diagnosis System | 29 | ✅ |
| Treatment Plan Module | 18 | ✅ |
| Encounter Timeline View | 70 | ✅ |
| Admin Registrations | 5 | ✅ |
| **Total New Tests** | **136** | ✅ |

### Bonus Features Implemented
- **Pagination** (`?page=1&page_size=20`) - Timeline API
- **Include Toggles** (`?include_vitals=false`) - Bandwidth optimization
- **Follow-up Compliance** - Statistics calculation with ±7 day window

### ⚠️ Deferred to Phase 2
- Clinical Templates Library
- Clinical Templates Admin
- Pediatric-specific vital ranges
- Mean Arterial Pressure (MAP) calculation

### Final Metrics
| Metric | Value |
|--------|-------|
| Total Tests | 760 |
| Coverage | 84.93% |
| Sprint Tests Added | 136 |
| API Endpoints Added | 8 |

---

## Post-Sprint Checklist

- [ ] Update ROADMAP.md with completion status
- [x] Update sprint-1.1-1.2-deliverables.md with test results
- [x] Update test coverage (84.93%)
- [ ] Tag release: `v0.2.0-encounter-management`
- [ ] Prepare demo for stakeholders
- [x] Document deferred items for Phase 2
- [ ] Retrospective notes

---

*Document Version: 2.0*
*Created: December 29, 2025*
*Updated: December 30, 2025*
*Author: Vitora HMIS Development Team*
