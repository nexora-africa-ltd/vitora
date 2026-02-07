# Returning Patient Workflow Implementation Plan

> **Purpose**: Define the implementation strategy for a streamlined returning patient check-in flow in the Vitora HMIS web app.

---

## 📋 Current State Analysis

### What Exists

| Component | Status | Location |
|-----------|--------|----------|
| `visit_type` field with `RETURN` option | ✅ Implemented | `backend/hmis/apps/clinics/models.py` |
| Visit type in add-to-queue dialog | ✅ Implemented | `web-app/components/clinics/add-to-queue-dialog.tsx` |
| New vs revisit reporting | ✅ Implemented | `backend/hmis/apps/clinics/services/reporting.py` |
| Patient search by MRN/name/phone | ✅ Implemented | `web-app/app/(dashboard)/patients/page.tsx` |

### What's Missing

| Gap | Impact |
|-----|--------|
| No dedicated check-in page | Front desk staff must navigate multiple pages |
| Default visit_type always `NEW` | Manual selection required even for returning patients |
| No quick check-in action | Extra clicks to add returning patient to queue |
| No visit history detection | System doesn't auto-detect returning patients |

---

## 🎯 Proposed Solution

### New Components

#### 1. Patient Check-in Page (`/patients/checkin`)

A dedicated page for front desk / reception staff to quickly check in returning patients.

**Features:**
- MRN/ID barcode scanner input (auto-focus)
- Quick search by MRN, National ID, or phone number
- Patient verification display (photo, name, DOB, last visit)
- One-click check-in to triage or direct to clinic
- Auto-detect `visit_type` based on patient history

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  Patient Check-in                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────┐        │
│  │ 🔍 Scan or enter MRN / ID / Phone              │        │
│  └─────────────────────────────────────────────────┘        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  👤 Jane Smith                    MRN: MRN-20250101  │    │
│  │  DOB: 1985-05-20 (40y)           Phone: 0712xxxxxx  │    │
│  │  Last Visit: 2025-12-15 - CCC Clinic                │    │
│  │                                                      │    │
│  │  [Check-in to Triage]  [Direct to Clinic ▾]         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Recent Check-ins Today:                                    │
│  • John Doe - 09:15 - Triage                               │
│  • Mary Jane - 09:02 - CCC Clinic                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Quick Check-in Button on Patient Detail Page

Add a prominent "Check-in" action to `/patients/[id]` page header.

```tsx
<Button onClick={handleQuickCheckin}>
  <UserCheck className="mr-2 h-4 w-4" />
  Check-in Patient
</Button>
```

#### 3. Smart Visit Type Detection

Auto-set `visit_type` based on patient's visit history:

```typescript
function determineVisitType(patient: Patient): VisitType {
  const hasRecentVisits = patient.last_encounter_date !== null;
  const lastVisitDays = hasRecentVisits 
    ? daysSince(patient.last_encounter_date) 
    : Infinity;
  
  if (!hasRecentVisits) return 'NEW';
  if (lastVisitDays <= 30) return 'FOLLOW_UP';
  return 'RETURN';
}
```

---

## 📁 File Structure

```
web-app/
├── app/(dashboard)/patients/
│   └── checkin/
│       ├── page.tsx              # Check-in page
│       └── loading.tsx           # Loading state
├── components/patients/
│   ├── patient-checkin-form.tsx  # Search & verify form
│   ├── patient-checkin-card.tsx  # Patient display card
│   ├── quick-checkin-dialog.tsx  # Dialog for patient detail page
│   └── recent-checkins-list.tsx  # Today's check-ins
└── lib/
    ├── api/
    │   └── checkin.ts            # Check-in API functions
    └── hooks/
        └── use-checkin.ts        # Check-in React Query hooks
```

---

## 🔌 API Requirements

### Backend Endpoints Needed

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients/lookup/` | GET | Quick lookup by MRN, ID, or phone |
| `/api/patients/{id}/checkin/` | POST | Check-in patient to triage/clinic |
| `/api/checkins/today/` | GET | List today's check-ins |

### Lookup Response Schema

```python
# GET /api/patients/lookup/?q=MRN-20250101
{
  "id": 123,
  "mrn": "MRN-20250101-0001",
  "first_name": "Jane",
  "last_name": "Smith",
  "date_of_birth": "1985-05-20",
  "gender": "F",
  "phone_number": "0712******",  # Masked for privacy
  "photo_url": null,
  "last_visit": {
    "date": "2025-12-15",
    "clinic": "CCC Clinic",
    "encounter_type": "OPD"
  },
  "suggested_visit_type": "FOLLOW_UP",
  "active_enrollments": ["CCC", "TB"],
  "alerts": ["Allergy: Penicillin"]
}
```

### Check-in Request Schema

```python
# POST /api/patients/{id}/checkin/
{
  "destination": "TRIAGE",  # or clinic_id
  "visit_type": "RETURN",
  "priority_hint": "STANDARD",
  "notes": "Optional notes"
}
```

---

## 🔄 Implementation Phases

### Phase 1: Backend API (1-2 days)

- [ ] Add `PatientLookupView` with quick search
- [ ] Add `PatientCheckinView` action
- [ ] Add `TodayCheckinsView` for front desk display
- [ ] Write tests for new endpoints

### Phase 2: Check-in Page (2-3 days)

- [ ] Create `/patients/checkin` page layout
- [ ] Implement patient search form with barcode support
- [ ] Create patient verification card component
- [ ] Add check-in action handlers
- [ ] Integrate with triage waiting queue

### Phase 3: Quick Check-in Dialog (1 day)

- [ ] Add check-in button to patient detail page header
- [ ] Create `QuickCheckinDialog` component
- [ ] Wire up to existing clinic queue / triage

### Phase 4: Smart Defaults (0.5 days)

- [ ] Implement `determineVisitType()` utility
- [ ] Update `AddToQueueDialog` to use smart defaults
- [ ] Add visit type suggestion to patient lookup response

### Phase 5: Testing & Polish (1-2 days)

- [ ] E2E tests for check-in flow
- [ ] Accessibility audit (keyboard navigation, screen readers)
- [ ] Performance optimization (debounced search)
- [ ] Add to navigation for Reception role

---

## 🧭 Navigation Integration

Add check-in to sidebar navigation:

```typescript
// lib/config/navigation.ts
{
  title: 'Check-in',
  href: '/patients/checkin',
  icon: UserCheck,
  roles: ['RECEPTIONIST', 'NURSE', 'ADMIN'],
  description: 'Check in returning patients',
}
```

---

## 💡 UX Considerations

### Barcode Scanner Support

```tsx
// Auto-focus input for barcode scanner
useEffect(() => {
  searchInputRef.current?.focus();
}, []);

// Handle rapid barcode input (scanner sends Enter key)
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleSearch();
  }
};
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Enter` | Search / Confirm check-in |
| `T` | Check-in to Triage |
| `Esc` | Clear search |

### Error States

- Patient not found → Prompt to register new patient
- Patient already checked in today → Show warning, allow re-check-in
- Patient has unpaid balance → Show alert, allow override

---

## 📊 Success Metrics

| Metric | Target |
|--------|--------|
| Check-in time (returning patient) | < 30 seconds |
| Manual visit_type corrections | < 5% of check-ins |
| Front desk satisfaction | Positive feedback |

---

## 🔗 Related Documents

- [Ideal Patient Flow](ideal-patient-flow.md)
- [Clinics Module Implementation Plan](clinics-module-implementation-plan.md)
- [Triage Module Documentation](../backend/hmis/apps/triage/README.md)

---

**Last Updated**: February 7, 2026  
**Status**: Proposed  
**Priority**: Medium  
**Estimated Effort**: 5-8 days
