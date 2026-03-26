# Vitora HMIS - Stakeholder Workflow Review Checklist

## Demo Environment Details

| Item | Value |
|------|-------|
| **Frontend URL** | https://vitora-hmis-staging.onrender.com |
| **API URL** | https://vitora-staging.onrender.com |
| **Environment** | Staging/Demo |
| **Facility Name** | Demo Health Facility |

---

## Demo User Credentials

| Role | Username | Password |
|------|----------|----------|
| **System Administrator** | `demo_admin` | `DemoAdmin2026?!` |
| **Receptionist** | `demo_receptionist` | `DemoReception2026!` |
| **Nurse (Triage)** | `demo_nurse` | `DemoNurse2026!` |
| **Doctor** | `demo_doctor` | `DemoDoctor2026!` |
| **Pharmacist** | `demo_pharmacist` | `DemoPharmacy2026!` |
| **Lab Technician** | `demo_labtech` | `DemoLab2026!` |
| **Billing Clerk** | `demo_billing` | `DemoBilling2026!` |

---

## Workflow Review Checklist

### 1. Patient Registration (Receptionist)

- [ ] **Search for existing patient** - Try searching by name, MRN, or phone number
- [ ] **Register new patient** - Fill out registration form
  - [ ] Basic info (name, DOB, gender) captured correctly?
  - [ ] Kenya location hierarchy (County → Sub-County → Ward) working?
  - [ ] Emergency contact captured?
  - [ ] MRN auto-generated correctly (format: MRN-YYYYMMDD-XXXX)?
- [ ] **Patient list** - Can you find and view registered patients?
- [ ] **Edit patient** - Can you update patient information?

**Feedback:**
```
[ ] Works as expected
[ ] Minor issues (describe below)
[ ] Major issues (describe below)
[ ] Missing feature (describe below)

Notes:
_______________________________________________
_______________________________________________
```

---

### 2. Triage Assessment (Nurse)

- [ ] **View triage queue** - See patients waiting for triage?
- [ ] **Record vitals** - Can you enter:
  - [ ] Temperature (°C)
  - [ ] Blood pressure (systolic/diastolic)
  - [ ] Pulse rate (BPM)
  - [ ] Respiratory rate (breaths/min)
  - [ ] Oxygen saturation (SpO₂ %)
  - [ ] Weight (kg)
  - [ ] Height (cm)
- [ ] **Triage classification** - Priority levels displayed correctly?
- [ ] **Critical alerts** - Do alerts show for abnormal vitals (e.g., SpO₂ < 95%)?
- [ ] **Send to consultation** - Can you send patient to doctor queue?

**Feedback:**
```
[ ] Works as expected
[ ] Minor issues (describe below)
[ ] Major issues (describe below)
[ ] Missing feature (describe below)

Notes:
_______________________________________________
_______________________________________________
```

---

### 3. Clinical Consultation (Doctor)

- [ ] **View consultation queue** - See patients waiting?
- [ ] **Patient summary** - View patient history and previous encounters?
- [ ] **Create encounter** - Start a new consultation
  - [ ] Chief complaint captured?
  - [ ] Clinical examination notes?
  - [ ] Vitals visible from triage?
- [ ] **Add diagnosis** - Can you:
  - [ ] Search ICD-10 codes?
  - [ ] Add primary diagnosis?
  - [ ] Add secondary diagnoses?
- [ ] **Prescribe medication** - Can you:
  - [ ] Search for drugs?
  - [ ] Specify dosage, frequency, duration?
  - [ ] Add prescription instructions?
- [ ] **Order lab tests** - Can you request lab investigations?
- [ ] **Clinical notes** - Save consultation notes?
- [ ] **Treatment plan** - Create follow-up instructions?

**Feedback:**
```
[ ] Works as expected
[ ] Minor issues (describe below)
[ ] Major issues (describe below)
[ ] Missing feature (describe below)

Notes:
_______________________________________________
_______________________________________________
```

---

### 4. Pharmacy Dispensing (Pharmacist)

- [ ] **View prescription queue** - See pending prescriptions?
- [ ] **Review prescription** - View prescription details?
- [ ] **Check drug availability** - Stock levels visible?
- [ ] **Dispense medication** - Can you:
  - [ ] Confirm quantity dispensed?
  - [ ] Add dispensing notes?
  - [ ] Mark as partially dispensed (if applicable)?
- [ ] **Print label** - Generate medication label?
- [ ] **Complete dispensing** - Finalize the prescription?

**Feedback:**
```
[ ] Works as expected
[ ] Minor issues (describe below)
[ ] Major issues (describe below)
[ ] Missing feature (describe below)

Notes:
_______________________________________________
_______________________________________________
```

---

### 5. Laboratory (Lab Technician)

- [ ] **View lab orders** - See pending lab requests?
- [ ] **Accept sample** - Mark sample received?
- [ ] **Enter results** - Can you:
  - [ ] Input test values?
  - [ ] Add reference ranges?
  - [ ] Flag abnormal results?
- [ ] **Verify results** - Review before release?
- [ ] **Release results** - Make available to doctor?

**Feedback:**
```
[ ] Works as expected
[ ] Minor issues (describe below)
[ ] Major issues (describe below)
[ ] Missing feature (describe below)

Notes:
_______________________________________________
_______________________________________________
```

---

### 6. Billing & Payments (Billing Clerk)

- [ ] **Create invoice** - Generate bill for patient?
- [ ] **Add line items** - Can you add:
  - [ ] Consultation fees?
  - [ ] Lab test charges?
  - [ ] Medication costs?
  - [ ] Other services?
- [ ] **Apply discounts** - Waiver/discount functionality?
- [ ] **SHA/Insurance** - Can you check SHA coverage?
- [ ] **Record payment** - Accept payment and issue receipt?
- [ ] **View payment history** - See patient's billing history?

**Feedback:**
```
[ ] Works as expected
[ ] Minor issues (describe below)
[ ] Major issues (describe below)
[ ] Missing feature (describe below)

Notes:
_______________________________________________
_______________________________________________
```

---

### 7. Reports & Dashboard (All Users)

- [ ] **Dashboard widgets** - Are statistics displayed?
- [ ] **Patient statistics** - Total patients, new registrations?
- [ ] **Financial summary** - Revenue, outstanding payments?
- [ ] **Generate reports** - Can you export data?

**Feedback:**
```
[ ] Works as expected
[ ] Minor issues (describe below)
[ ] Major issues (describe below)
[ ] Missing feature (describe below)

Notes:
_______________________________________________
_______________________________________________
```

---

## General Usability Feedback

### Navigation & Layout
- [ ] Easy to navigate between modules?
- [ ] Menu structure intuitive?
- [ ] Breadcrumbs helpful?

### Performance
- [ ] Pages load quickly?
- [ ] Forms submit without delay?
- [ ] Search results appear fast?

### Mobile/Tablet
- [ ] Tested on mobile device?
- [ ] Tested on tablet?
- [ ] Touch interactions work well?

### Accessibility
- [ ] Text readable?
- [ ] Color contrast sufficient?
- [ ] Error messages clear?

---

## Priority Features Request

**What features are CRITICAL for go-live?**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**What features would be NICE TO HAVE?**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

## Overall Assessment

| Category | Rating (1-5) | Comments |
|----------|--------------|----------|
| **Ease of Use** | ⭐⭐⭐⭐⭐ | |
| **Workflow Match** | ⭐⭐⭐⭐⭐ | |
| **Visual Design** | ⭐⭐⭐⭐⭐ | |
| **Performance** | ⭐⭐⭐⭐⭐ | |
| **Completeness** | ⭐⭐⭐⭐⭐ | |

**Would you recommend this system for your facility?**
- [ ] Yes, ready for pilot
- [ ] Yes, with minor changes
- [ ] Needs significant work
- [ ] No, major redesign needed

---

## Additional Comments

```
_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________
```

---

## Reviewer Information

| Field | Value |
|-------|-------|
| **Name** | |
| **Role/Title** | |
| **Facility** | |
| **Date** | |
| **Email** | |

---

*Thank you for your feedback! Your input helps us build a better system for Kenya's healthcare facilities.*

**Submit feedback to:** feedback@nexora.africa

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Prepared by: Nexora Africa Ltd*
