# Vitora HMIS Demo Video Script

> **Purpose**: Shot-by-shot guide for recording a product demo video
> **Target Length**: 3-5 minutes (short version) or 8-10 minutes (full walkthrough)
> **Audience**: Healthcare facility administrators, IT decision-makers, Ministry of Health stakeholders

---

## Pre-Recording Checklist

- [ ] Seed demo data (see commands below)
- [ ] Clear browser cache / use incognito
- [ ] Set browser to 1920x1080 (or 1280x720 for smaller file)
- [ ] Hide bookmarks bar and extensions
- [ ] Use a clean demo facility name (e.g., "Sunrise Medical Centre")
- [ ] Disable notifications (system + browser)
- [ ] Practice the flow 1-2 times before recording

### Demo Data Setup

```bash
cd backend
poetry shell

# Seed comprehensive demo data (organization, facility, users, patients, allergies, billing, etc.)
python manage.py seed_demo_data

# Or force-recreate if demo data already exists
python manage.py seed_demo_data --force
```

**What gets created:**
- Demo Health Services Ltd (organization) with 2 facilities (HQ + Branch)
- 15+ demo users across all roles (admin, doctor, nurse, pharmacist, lab tech, billing, etc.)
- 75+ sample patients with realistic Kenyan names
- **Allergies for key patients** (Penicillin, Sulfonamides, Aspirin, ACE inhibitors, etc.)
- **Emergency contacts** for demo patients
- Sample encounters, invoices, lab orders, imaging orders
- MCH demo scenarios (ANC, delivery, immunization)

**Demo Credentials:**
| Username | Role | Password |
|----------|------|----------|
| `demo_admin` | Admin | `DemoAdmin2026?!` |
| `demo_doctor` | Doctor | `DemoDoctor2026?!` |
| `demo_nurse` | Nurse | `DemoNurse2026?!` |
| `demo_receptionist` | Reception | `DemoReception2026?!` |
| `demo_pharmacist` | Pharmacist | `DemoPharmacy2026?!` |
| `demo_labtech` | Lab Tech | `DemoLab2026?!` |
| `demo_billing` | Billing | `DemoBilling2026?!` |

> **Tip**: For the demo video, use `demo_doctor` to show the full clinical workflow.

---

## Scene Breakdown

### Scene 1: Opening & Login (15-20 seconds)

**Visual**: Login page → Dashboard

**Narration**:
> "Vitora HMIS is a complete hospital management system built for Kenya's healthcare facilities. Let me show you how it works."

**Actions**:
1. Show login page briefly (highlight "Powered by Nexora Africa")
2. Enter credentials: `demo_doctor` / `DemoDoctor2026?!`
3. Click Login
4. Land on dashboard

**Key Points to Highlight**:
- Clean, modern interface
- Works on any device (mention offline capability)

---

### Scene 2: Dashboard Overview (30-40 seconds)

**Visual**: Dashboard with stats cards, recent activity

**Narration**:
> "The dashboard gives you a real-time snapshot of your facility. Today we have 47 patients checked in, 12 in the queue, and 3 critical alerts that need attention."

**Actions**:
1. Pan across stat cards (patients, encounters, revenue)
2. Hover over a critical alert (e.g., low SpO2 warning)
3. Show the "Today's Schedule" section
4. Quick scroll to show recent activity feed

**Key Points to Highlight**:
- Real-time data
- Critical alerts for patient safety
- At-a-glance operational status

---

### Scene 3: Patient Registration (60-90 seconds)

**Visual**: Patient registration form

**Narration**:
> "Let's register a new patient. Vitora automatically generates a unique Medical Record Number and validates all required fields."

**Actions**:
1. Click "New Patient" button
2. Fill in patient details:
   - First Name: `Sarah`
   - Last Name: `Njoroge`
   - Date of Birth: `1990-06-15`
   - Gender: `Female`
   - Phone: `0712345678`
   - National ID: `32456789`
3. **Highlight**: County → Sub-County → Ward cascade
   - Select "Nairobi" → "Westlands" → "Parklands"
4. Add emergency contact:
   - Name: `James Njoroge`
   - Relationship: `Spouse`
   - Phone: `0722345678`
5. Click "Save"
6. **Highlight**: Auto-generated MRN (e.g., `MRN-20260526-0042`)

**Key Points to Highlight**:
- Kenya location hierarchy (47 counties, 289 sub-counties)
- National ID validation
- Auto-generated MRN format
- Data encrypted at rest (mention for compliance)

> **Alternative**: Skip registration and use existing demo patient **Mary Otieno** (DEMO-PT-0002) who already has allergies seeded. Search for "Mary" in patient search.

---

### Scene 4: Triage Assessment (45-60 seconds)

**Visual**: Triage queue → Assessment form

**Narration**:
> "When Mary arrives, our triage nurse captures her vitals. The system automatically calculates triage priority based on clinical indicators."

**Actions**:
1. Navigate to Triage Queue
2. Search for "Mary Otieno" or click "Start Triage" for her
3. Enter vitals:
   - Temperature: `37.8°C`
   - Blood Pressure: `130/85`
   - Pulse: `88 bpm`
   - SpO2: `96%`
   - Respiratory Rate: `18`
4. Enter chief complaint: "Persistent headache for 3 days"
5. System shows: **Priority 3 - Urgent** (yellow badge)
6. Click "Complete Triage"

**Key Points to Highlight**:
- Vitals with normal range indicators
- SpO2 monitoring (alerts below 95%)
- Automated priority scoring
- Queue position updates in real-time

> **Demo Patient**: Use **Mary Otieno** (DEMO-PT-0002) for continuity through scenes 4-7.

---

### Scene 5: Clinical Encounter (90-120 seconds)

**Visual**: Encounter form with history, diagnosis, treatment

**Narration**:
> "The clinician now sees Mary. They have her full history, vitals from triage, and can document the encounter comprehensively."

**Actions**:
1. Click on Mary Otieno from the queue (or search for "Mary Otieno")
2. Show tabs: History | Vitals | Allergies | Medications
3. **Review allergies**: Show existing allergies:
   - **Aspirin** (severe - bronchospasm) - RED badge
   - **NSAIDs** (life-threatening - angioedema) - RED badge
4. Document findings:
   - Physical exam notes
   - Add diagnosis: Type "Migraine" → Select ICD-10 code `G43.9`
5. **Create treatment plan**:
   - Select from template: "Migraine Management"
   - Shows pre-filled medications + instructions
6. Adjust prescription:
   - Paracetamol 1g TDS for 5 days (safe - no allergy)
7. **Highlight**: ⚠️ Allergy warning when attempting to add Ibuprofen
   - System blocks: "Patient has NSAID allergy (life-threatening)"
   - Demonstrate the safety net
8. Save encounter

**Key Points to Highlight**:
- ICD-10 code search with autocomplete
- Treatment plan templates (time-saver)
- **Drug-allergy interaction warnings** (critical safety feature)
- Complete clinical documentation

> **Demo Patient**: Use **Mary Otieno** (DEMO-PT-0002) - she has Aspirin and NSAID allergies pre-seeded.

---

### Scene 6: Pharmacy Dispensing (30-45 seconds)

**Visual**: Pharmacy queue → Dispensing screen

**Narration**:
> "The prescription is instantly available in the pharmacy. Our pharmacist verifies and dispenses with full tracking."

**Actions**:
1. Switch to Pharmacy module (login as `demo_pharmacist` or stay as doctor)
2. Show Mary Otieno's prescription in queue
3. Click to dispense
4. **Highlight**: Allergy warning badge visible (Aspirin, NSAIDs)
5. Verify stock availability (green checkmarks for Paracetamol)
6. Print label (show preview)
7. Mark as dispensed

**Key Points to Highlight**:
- Real-time prescription queue
- Allergy alerts visible to pharmacist
- Stock level integration
- Batch and expiry tracking
- Label printing

---

### Scene 7: Billing & SHA Claims (60-90 seconds)

**Visual**: Invoice → SHA submission

**Narration**:
> "Billing is automatic. The system generates an invoice from the encounter and can submit directly to SHA for reimbursement."

**Actions**:
1. Navigate to Billing
2. Show Mary Otieno's invoice (auto-generated):
   - Consultation: KES 500
   - Paracetamol 1g x 15: KES 150
   - **Total: KES 650**
3. **Check SHA eligibility**:
   - Click "Check SHA"
   - Show eligibility response (Member Active, Scheme: SHA-01)
4. **Submit claim**:
   - Click "Submit to SHA"
   - Show claim reference number
   - Status: "Submitted - Pending Adjudication"
5. Receive payment (show as "Paid" status)

**Key Points to Highlight**:
- Automatic invoice generation from clinical data
- Real-time SHA eligibility check
- Direct claims submission (no manual forms)
- Claim tracking and reconciliation

---

### Scene 8: Reports & Analytics (30-45 seconds)

**Visual**: Reports dashboard

**Narration**:
> "Vitora provides comprehensive reporting for both facility management and mandatory KHIS submissions."

**Actions**:
1. Navigate to Reports
2. Show key reports:
   - Daily OPD Summary
   - Revenue Report (with SHA vs Cash breakdown)
   - Disease Surveillance (ICD-10 aggregation)
3. **Highlight**: "Export to KHIS" button
4. Show generated MOH 705A preview

**Key Points to Highlight**:
- Built-in MOH report templates
- KHIS/DHIS2 integration ready
- Financial reconciliation
- Data-driven decisions

---

### Scene 9: Offline Capability (20-30 seconds)

**Visual**: Offline indicator → Sync

**Narration**:
> "And here's what sets Vitora apart: it works completely offline. When internet returns, everything syncs automatically."

**Actions**:
1. Show network indicator (online - green)
2. Simulate offline (show indicator turn orange/red)
3. Demonstrate creating a record while offline
4. Reconnect → Show sync in progress
5. Show "All data synced" confirmation

**Key Points to Highlight**:
- Works in rural areas with poor connectivity
- No data loss
- Automatic conflict resolution
- Peace of mind for clinicians

---

### Scene 10: Closing & Call to Action (15-20 seconds)

**Visual**: Dashboard → Contact/Demo page

**Narration**:
> "Vitora HMIS: Built for Kenya, ready for your facility. Visit vitora.co.ke to schedule your demo."

**Actions**:
1. Return to dashboard (show smooth interface)
2. Fade to logo + website URL
3. Show contact information

---

## Recording Tips

### Audio
- Use a quality microphone (USB condenser or lapel mic)
- Record narration separately for cleaner audio (easier to edit)
- Keep background music subtle (10-15% volume)

### Video
- Record at 1080p 60fps minimum
- Use keyboard shortcuts instead of searching menus (looks more professional)
- Pause briefly on important screens (gives viewers time to read)
- Zoom in on key UI elements (OBS or Screen Studio can do this)

### Editing
- Add subtle zoom effects on clicks
- Use lower-third text for feature callouts
- Include captions (accessibility + silent autoplay)
- Keep transitions simple (cuts or short fades)

### Suggested Tools
| Task | Tool | Notes |
|------|------|-------|
| Screen Recording | OBS Studio | Free, reliable |
| Editing | DaVinci Resolve | Free, professional |
| Captions | Descript | AI-generated, editable |
| Thumbnails | Canva | Quick and easy |
| Hosting | YouTube (unlisted) | Free, good analytics |

---

## Version Variants

### Short Version (3 min)
Include: Scenes 1, 3, 5, 7, 10
Focus: Patient journey from registration to billing

### Full Version (8-10 min)
Include: All scenes
Focus: Comprehensive feature walkthrough

### SHA-Focused Version (5 min)
Include: Scenes 1, 3, 5, 7 (expanded), 10
Focus: Claims workflow for payer/MoH audiences

---

## Asset Checklist

- [ ] Logo (PNG, transparent background)
- [ ] Brand colors for lower-thirds (#8B1538 burgundy, #2DD4BF teal)
- [ ] Intro/outro animation (optional)
- [ ] Background music track (royalty-free)
- [ ] Demo data seeded and verified

---

*Last Updated: May 2026*
