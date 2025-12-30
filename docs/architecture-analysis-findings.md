# Vitora HMIS Architecture Analysis

**Date**: December 30, 2025  
**Analyst**: AI Assistant  
**Scope**: Encounter Status, Status Badges, Web Frontend Timing, Investigations/Lab, RBAC

---

## Table of Contents
1. [A) Encounter Draft vs Complete Status](#a-encounter-draft-vs-complete-status)
2. [B) Status Badges for Encounters](#b-status-badges-for-encounters)
3. [C) Web Frontend Development Timing](#c-web-frontend-development-timing)
4. [D) Investigations/Lab Work/Imaging](#d-investigationslab-workimaging)
5. [E) RBAC/Role Matrix](#e-rbacrole-matrix)
6. [Summary & Recommendations](#summary--recommendations)

---

## A) Encounter Draft vs Complete Status

### Current Implementation

**Finding: NO explicit draft/complete status on Encounter model**

The current `Encounter` model in [backend/hmis/apps/encounters/models.py](backend/hmis/apps/encounters/models.py) does **NOT** have a status field. Encounters are implicitly considered "complete" once created.

```python
# Current Encounter model - NO status field
class Encounter(models.Model):
    ENCOUNTER_TYPE_CHOICES = [
        ("OPD", "Outpatient Department"),
        ("IPD", "Inpatient Department"),
        ("EMERGENCY", "Emergency"),
    ]
    patient = models.ForeignKey(...)
    encounter_type = models.CharField(...)
    encounter_date = models.DateField(...)
    chief_complaint = models.TextField(...)
    # ... vitals, medical history, notes
    # NO status field!
```

### Future Provisions

**The TreatmentPlan model DOES have a status field** (documented in [README.md#L452](README.md#L452)):

```python
class TreatmentPlan(models.Model):
    status = models.CharField(max_length=20, default='draft')
    # Allowed values: draft, active, completed, cancelled
```

However, this is for the **treatment plan**, not the encounter itself.

### Recommendation

**Add an encounter status field** to enable proper clinical workflow:

```python
class Encounter(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),           # Started, not finalized
        ('IN_PROGRESS', 'In Progress'), # Active - patient being seen
        ('COMPLETED', 'Completed'),    # Finalized - no more edits
        ('CANCELLED', 'Cancelled'),    # Voided encounter
    ]
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='DRAFT'
    )
```

**Clinical workflow justification**:
- Clinicians often start documenting before all information is available
- Draft encounters shouldn't appear in official reports
- Completed encounters should be immutable (with proper audit trails for corrections)
- Required for proper billing integration (only bill completed encounters)

---

## B) Status Badges for Encounters

### Current Implementation

**Finding: NO status badges currently implemented**

The current UI in [desktop-app/src/renderer/encounter-timeline.js](desktop-app/src/renderer/encounter-timeline.js) only shows:
- Encounter type labels (OPD, EMERGENCY, INPATIENT, etc.)
- Critical vital alerts (using `has_critical_vitals`)

### Future Provisions

The frontend already has infrastructure for badges in the timeline module:

```javascript
// Constants in encounter-timeline.js
const ENCOUNTER_TYPE_LABELS = {
  OPD: 'Outpatient',
  EMERGENCY: 'Emergency',
  INPATIENT: 'Inpatient',
  TELEMEDICINE: 'Telemedicine',
  HOME_VISIT: 'Home Visit',
};
```

### Recommendation

**Yes, implement status badges** with visual differentiation:

| Status | Badge Color | Icon | Description |
|--------|-------------|------|-------------|
| Draft | Gray | 📝 | Incomplete documentation |
| In Progress | Blue | 🔄 | Active encounter |
| Completed | Green | ✅ | Finalized |
| Cancelled | Red | ❌ | Voided |
| Critical | Red (pulsing) | ⚠️ | Critical vitals (existing) |

**Implementation suggestion**:
```javascript
const ENCOUNTER_STATUS_BADGES = {
  DRAFT: { label: 'Draft', cssClass: 'badge-draft', icon: '📝' },
  IN_PROGRESS: { label: 'In Progress', cssClass: 'badge-in-progress', icon: '🔄' },
  COMPLETED: { label: 'Completed', cssClass: 'badge-completed', icon: '✅' },
  CANCELLED: { label: 'Cancelled', cssClass: 'badge-cancelled', icon: '❌' },
};
```

---

## C) Web Frontend Development Timing

### Current Roadmap

**Web frontend (Next.js) is currently scheduled for Phase 2, Sprint 2.9-2.10** (Weeks 17-20, ~Oct 2026):

| Phase | Timeline | Web Frontend Status |
|-------|----------|---------------------|
| Phase 0 | Jan-Mar 2026 | ❌ Desktop only |
| Phase 1 | Apr-Sep 2026 | ❌ Desktop + Mobile |
| **Phase 2** | Oct 2026-Mar 2027 | **✅ Web frontend starts Sprint 2.9** |

### Proposed Change: Move to Phase 1

**Your proposal: Move web frontend development to Phase 1**

### Analysis: Challenges You Might Face

#### 1. Resource Contention (HIGH RISK)
**Challenge**: Phase 1 already has two parallel tracks:
- Track A: Desktop Encounter Management
- Track B: Mobile App Foundation

Adding a third track (Web Frontend) requires:
- Additional frontend engineer(s)
- Shared API development time
- More QA effort

**Mitigation**: 
- Start with read-only dashboard (simpler scope)
- Use shared component library between desktop and web
- Consider hiring/contracting additional frontend resource

#### 2. API Stability (MEDIUM RISK)
**Challenge**: APIs are still evolving during Phase 1. Web frontend may need frequent updates.

**Mitigation**:
- Use API versioning from the start
- Web frontend should use same API as desktop/mobile (already planned)
- TypeScript types generated from OpenAPI schema

#### 3. Scope Creep (HIGH RISK)
**Challenge**: Stakeholders seeing a web interface may request features not in scope.

**Mitigation**:
- Clearly define web frontend as "view-only" for Phase 1
- Feature parity roadmap showing what's coming
- Regular demos with scope reminders

#### 4. Deployment Complexity (MEDIUM RISK)
**Challenge**: Web frontend requires hosting infrastructure earlier than planned.

**Mitigation**:
- Use Vercel/Netlify for initial deployment (free tier)
- Can be static site with API calls to demo server
- No need for production-grade infrastructure initially

#### 5. Testing Overhead (MEDIUM RISK)
**Challenge**: Three platforms to test (Desktop + Mobile + Web)

**Mitigation**:
- Shared E2E test patterns
- API-level testing covers all platforms
- Component testing with React Testing Library (shared)

### Recommendation

**YES, move web frontend to Phase 1 with a limited scope**:

| Sprint | Web Frontend Scope (Phase 1 Addition) |
|--------|--------------------------------------|
| 1.3-1.4 | Project scaffold, auth, patient list (read-only) |
| 1.5-1.6 | Patient details, encounter history view |
| 1.7-1.8 | Reporting dashboard, stakeholder demo portal |
| 1.9-1.10 | Integration testing, feedback collection |

**Stakeholder benefits**:
- ✅ Real-time feedback on UI/UX
- ✅ Accessible from any device (no installation)
- ✅ Shareable links for specific patients/reports
- ✅ Better informed decisions before pilot deployment

---

## D) Investigations/Lab Work/Imaging

### Current Implementation

**Finding: NO lab/investigations module currently implemented**

Explicitly excluded from MVP ([docs/mvp-scope-acceptance-criteria.md#L130](docs/mvp-scope-acceptance-criteria.md#L130)):
```markdown
- ❌ Lab results module
- ❌ DICOM/Imaging
```

### Future Provisions

#### Lab Module
- Mentioned for "Phase 2+" in [docs/sprint-0.1-deliverables.md#L218](docs/sprint-0.1-deliverables.md#L218)
- FHIR Observation resources planned for lab results
- LOINC codes planned for lab observations

#### Imaging/Radiology
- **Phase 3, Sprint 3.4-3.6** (Weeks 7-12, ~Jun 2027):
  - DICOM image ingestion
  - Web-based DICOM viewer
  - Radiology reporting
  - PACS-lite (local storage)

### Gap Analysis: In-house vs External

**Finding: NO provision for in-house vs external lab workflow**

Your requirement for:
- **In-house**: Order → Lab receives → Results → Auto-populate encounter
- **External**: Order → Generate requisition form (PDF) → Manual result entry

This workflow is **NOT currently documented** in the roadmap.

### Recommendation

**Add Lab/Investigations module to Phase 1 or early Phase 2** with the following structure:

```python
class LabOrderType(models.TextChoices):
    IN_HOUSE = 'IN_HOUSE', 'In-house'
    EXTERNAL = 'EXTERNAL', 'External/Referral'

class LabOrder(models.Model):
    """Lab/Investigation Order Model"""
    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE, related_name='lab_orders')
    test_name = models.CharField(max_length=200)
    loinc_code = models.CharField(max_length=20, blank=True)  # LOINC standardization
    order_type = models.CharField(max_length=20, choices=LabOrderType.choices)
    status = models.CharField(max_length=20, choices=[
        ('ORDERED', 'Ordered'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ])
    ordered_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    ordered_at = models.DateTimeField(auto_now_add=True)
    
    # External lab details
    external_lab_name = models.CharField(max_length=200, blank=True)
    requisition_pdf = models.FileField(upload_to='lab_requisitions/', blank=True)

class LabResult(models.Model):
    """Lab Result Model"""
    order = models.OneToOneField(LabOrder, on_delete=models.CASCADE, related_name='result')
    result_value = models.TextField()
    unit = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=100, blank=True)
    is_abnormal = models.BooleanField(default=False)
    result_date = models.DateTimeField()
    resulted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    attachments = models.JSONField(default=list)  # For scanned results
```

**Workflow diagrams**:

```
IN-HOUSE FLOW:
┌─────────────┐    ┌───────────────┐    ┌────────────────┐    ┌──────────────┐
│ Clinician   │───▶│ Lab Receives  │───▶│ Lab Processes  │───▶│ Auto-notify  │
│ Orders Test │    │ (Status:      │    │ & Records      │    │ Clinician &  │
│             │    │  IN_PROGRESS) │    │ Results        │    │ Show in EMR  │
└─────────────┘    └───────────────┘    └────────────────┘    └──────────────┘

EXTERNAL FLOW:
┌─────────────┐    ┌───────────────┐    ┌────────────────┐    ┌──────────────┐
│ Clinician   │───▶│ Generate PDF  │───▶│ Patient Takes  │───▶│ Manual Entry │
│ Orders Test │    │ Requisition   │    │ to External    │    │ When Results │
│             │    │ (Printable)   │    │ Lab            │    │ Arrive       │
└─────────────┘    └───────────────┘    └────────────────┘    └──────────────┘
```

---

## E) RBAC/Role Matrix

### Current Implementation

**Finding: PARTIAL RBAC implementation**

#### What's Implemented ✅

1. **SensitiveAccessPermission** ([backend/hmis/apps/core/permissions.py](backend/hmis/apps/core/permissions.py)):
   - Controls access to HIV/GBV/Mental Health patients
   - Requires `patients.view_sensitive_patient` permission
   - All access logged to audit trail

2. **AuditLogPermission**: Only superusers can view audit logs

3. **PatientPermission**: Combines auth + sensitive data filtering

4. **Django's built-in permission system**: Used for basic model-level permissions

#### What's NOT Implemented ❌

1. **No explicit Role model**: Roles are handled via Django Groups
2. **No department-based access control**: No `Department` model linked to users
3. **No role-specific UI rendering**: All users see the same interface
4. **No permission matrix enforcement**: The role matrix in README is a **sample**, not enforced

### Role Matrix (Sample from README.md)

| Role | Patients | Encounters | Pharmacy | Reports | Settings | Sensitive Data |
|------|----------|------------|----------|---------|----------|----------------|
| Administrator | Full | Full | Full | Full | Full | Yes |
| Doctor | View, Edit | Full | View | View | - | Yes (authorized) |
| Nurse | View, Edit | Create, View, Edit | View | View | - | No |
| Pharmacist | View | View | Full | View | - | No |
| Receptionist | Create, View, Edit | View | - | - | - | No |
| Lab Technician | View | View (labs only) | - | View | - | No |

### Future Provisions

- **Phase 1**: User stories reference roles (e.g., "As a nurse, I want to record patient vitals...")
- **DPIA**: Documents role-based access as a security control
- **README**: Lists `RoleBasedPermission` as a planned permission class

### Recommendation

**Implement proper RBAC in Phase 1 with the following structure**:

```python
class Department(models.Model):
    """Hospital department for role scoping"""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    
class Role(models.Model):
    """System roles with granular permissions"""
    ROLE_CHOICES = [
        ('ADMIN', 'Administrator'),
        ('DOCTOR', 'Doctor/Clinician'),
        ('NURSE', 'Nurse'),
        ('PHARMACIST', 'Pharmacist'),
        ('LAB_TECH', 'Lab Technician'),
        ('RECEPTIONIST', 'Receptionist'),
        ('BILLING_CLERK', 'Billing Clerk'),
        ('DATA_CLERK', 'Data Entry Clerk'),
    ]
    name = models.CharField(max_length=50, choices=ROLE_CHOICES, unique=True)
    permissions = models.ManyToManyField(Permission)
    can_access_sensitive = models.BooleanField(default=False)

class StaffProfile(models.Model):
    """Extended user profile with role and department"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='staff_profile')
    role = models.ForeignKey(Role, on_delete=models.PROTECT)
    departments = models.ManyToManyField(Department)  # Multi-department support
    employee_id = models.CharField(max_length=50, unique=True)
    can_prescribe = models.BooleanField(default=False)  # For doctors
    license_number = models.CharField(max_length=50, blank=True)  # Medical license
```

**Permission matrix implementation**:

```python
# In core/permissions.py
class RoleBasedPermission(permissions.BasePermission):
    """
    Enforces role-based access control based on action and resource.
    """
    # Permission matrix - role -> resource -> allowed actions
    PERMISSION_MATRIX = {
        'ADMIN': {'patients': ['*'], 'encounters': ['*'], 'pharmacy': ['*'], 'reports': ['*']},
        'DOCTOR': {'patients': ['view', 'edit'], 'encounters': ['*'], 'pharmacy': ['view'], 'reports': ['view']},
        'NURSE': {'patients': ['view', 'edit'], 'encounters': ['create', 'view', 'edit'], 'pharmacy': ['view']},
        'PHARMACIST': {'patients': ['view'], 'encounters': ['view'], 'pharmacy': ['*']},
        'LAB_TECH': {'patients': ['view'], 'encounters': ['view'], 'lab_results': ['*']},
        'RECEPTIONIST': {'patients': ['create', 'view', 'edit'], 'encounters': ['view']},
    }
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        role = getattr(request.user, 'staff_profile', None)
        if not role:
            return False
            
        resource = getattr(view, 'resource_name', None)
        action = self._get_action(request.method)
        
        return self._check_permission(role.role.name, resource, action)
```

---

## Summary & Recommendations

| Topic | Current State | Recommendation | Priority |
|-------|---------------|----------------|----------|
| **A) Encounter Status** | ❌ Not implemented | Add status field (draft/in-progress/completed/cancelled) | HIGH |
| **B) Status Badges** | ❌ Not implemented | Add visual badges in timeline and lists | MEDIUM |
| **C) Web Frontend** | Phase 2 (Oct 2026) | Move to Phase 1 with limited scope (read-only dashboard) | HIGH |
| **D) Lab/Investigations** | ❌ Not implemented | Add in Phase 1/early Phase 2 with in-house/external workflows | HIGH |
| **E) RBAC** | Partial (sensitive only) | Implement full role matrix with department scoping | HIGH |

### Suggested Sprint Additions for Phase 1

| Sprint | Additional Tasks |
|--------|-----------------|
| **1.1-1.2** | - Add Encounter status field<br>- Add status badges to UI<br>- Basic Role model |
| **1.3-1.4** | - Web frontend scaffold (read-only)<br>- Lab order model (basic) |
| **1.5-1.6** | - Lab results workflow<br>- PDF requisition generation<br>- Web dashboard |
| **1.7-1.8** | - Full RBAC enforcement<br>- Department-based filtering<br>- Role-based UI |

### Action Items

1. **Immediate** (Before Sprint 1.1):
   - [ ] Add `status` field to Encounter model
   - [ ] Create migration and update serializers
   - [ ] Add status badges to desktop UI

2. **Sprint 1.1-1.2**:
   - [ ] Create Role and StaffProfile models
   - [ ] Implement RoleBasedPermission class
   - [ ] Update admin to assign roles

3. **Sprint 1.3-1.4**:
   - [ ] Scaffold Next.js web frontend
   - [ ] Implement read-only patient dashboard
   - [ ] Create LabOrder model with in-house/external workflows

4. **Sprint 1.5-1.6**:
   - [ ] Implement PDF requisition generation
   - [ ] Lab result entry workflow
   - [ ] Role-based UI rendering

---

*This analysis is based on codebase review as of December 30, 2025. Recommendations should be validated with clinical advisors and adjusted based on pilot feedback.*
