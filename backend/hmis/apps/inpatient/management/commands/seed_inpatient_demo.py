"""
Management command to seed comprehensive inpatient demo data.

Creates realistic admissions, ward rounds, transfers, and discharges
covering all ward types, payer types, admission statuses, and clinical
workflows.  Includes deep clinical data:

- Allergies & comorbidities per patient
- Encounter vitals + SOAP notes
- Lab orders, items, and results (with verification)
- Imaging orders, items, and radiology reports
- Prescriptions and prescription items
- Nursing Kardex handover notes (shift-to-shift)
- Ward-level shift handovers
- CDS rules and alerts (drug-allergy, critical vitals, critical lab)
- Supervisor alert acknowledgments

Uses authentic Kenyan names (no "Demo" suffixes).

Usage:
    python manage.py seed_inpatient_demo
    python manage.py seed_inpatient_demo --clear
    python manage.py seed_inpatient_demo --dry-run
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from hmis.apps.cds.models import CDSAlert, CDSRule
from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.imaging.models import (
    ImagingOrder,
    ImagingOrderItem,
    ImagingProcedure,
    RadiologyReport,
)
from hmis.apps.inpatient.models import (
    Admission,
    Bed,
    Discharge,
    KardexHandoverNote,
    KardexShiftNote,
    NursingCarePlanEntry,
    NursingKardex,
    ShiftHandover,
    SupervisorAlertAcknowledgment,
    TemperatureReading,
    Transfer,
    Ward,
    WardRound,
)
from hmis.apps.laboratory.models import (
    LabOrder,
    LabOrderItem,
    LabResult,
    TestCatalog,
)
from hmis.apps.patients.models import Allergy, Patient
from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

User = get_user_model()

# ---------------------------------------------------------------------------
# Name pools — realistic Kenyan names, no "Demo" tags
# ---------------------------------------------------------------------------
FIRST_NAMES_M = [
    "Brian", "Kevin", "Dennis", "Martin", "Eric",
    "George", "Stephen", "Patrick", "Nicholas", "Alex",
]
FIRST_NAMES_F = [
    "Catherine", "Winnie", "Mercy", "Agnes", "Esther",
    "Beatrice", "Florence", "Irene", "Pauline", "Gladys",
]
LAST_NAMES = [
    "Wafula", "Chebet", "Nyambura", "Odhiambo", "Kibet",
    "Muthoni", "Achieng", "Karanja", "Wambui", "Barasa",
]

# ---------------------------------------------------------------------------
# Test-catalog / Drug / Imaging-procedure seed pools
# These are created lazily by _ensure_test_catalog / _ensure_drugs / etc.
# ---------------------------------------------------------------------------
TEST_CATALOG_DEFS = [
    # (code, name, category, specimen_type, result_type, unit, male_range, female_range, cost)
    ("FBC", "Full Blood Count", "HEMATOLOGY", "BLOOD", "PANEL", "", "", "", Decimal("800")),
    ("HB", "Haemoglobin", "HEMATOLOGY", "BLOOD", "NUMERIC", "g/dL", "13.0-17.0", "12.0-16.0", Decimal("300")),
    ("WBC", "White Blood Cell Count", "HEMATOLOGY", "BLOOD", "NUMERIC", "x10^9/L", "4.0-11.0", "4.0-11.0", Decimal("300")),
    ("PLT", "Platelet Count", "HEMATOLOGY", "BLOOD", "NUMERIC", "x10^9/L", "150-400", "150-400", Decimal("300")),
    ("CR", "Serum Creatinine", "CHEMISTRY", "BLOOD", "NUMERIC", "µmol/L", "62-106", "44-80", Decimal("500")),
    ("BUN", "Blood Urea Nitrogen", "CHEMISTRY", "BLOOD", "NUMERIC", "mmol/L", "2.5-7.1", "2.5-7.1", Decimal("400")),
    ("K", "Serum Potassium", "CHEMISTRY", "BLOOD", "NUMERIC", "mmol/L", "3.5-5.0", "3.5-5.0", Decimal("400")),
    ("NA", "Serum Sodium", "CHEMISTRY", "BLOOD", "NUMERIC", "mmol/L", "136-145", "136-145", Decimal("400")),
    ("RBS", "Random Blood Sugar", "CHEMISTRY", "BLOOD", "NUMERIC", "mmol/L", "3.9-7.8", "3.9-7.8", Decimal("300")),
    ("HBA1C", "Glycated Haemoglobin", "CHEMISTRY", "BLOOD", "NUMERIC", "%", "4.0-5.6", "4.0-5.6", Decimal("1500")),
    ("TROPI", "Troponin I", "CHEMISTRY", "BLOOD", "NUMERIC", "ng/mL", "0-0.04", "0-0.04", Decimal("2000")),
    ("CRP", "C-Reactive Protein", "CHEMISTRY", "BLOOD", "NUMERIC", "mg/L", "0-5", "0-5", Decimal("600")),
    ("BCULTURE", "Blood Culture", "MICROBIOLOGY", "BLOOD", "TEXT", "", "", "", Decimal("1200")),
    ("WIDAL", "Widal Test", "SEROLOGY", "BLOOD", "TEXT", "", "", "", Decimal("500")),
    ("UA", "Urinalysis", "URINALYSIS", "URINE", "TEXT", "", "", "", Decimal("300")),
    ("EGFR", "Estimated GFR", "CHEMISTRY", "BLOOD", "NUMERIC", "mL/min", ">90", ">90", Decimal("500")),
]

DRUG_DEFS = [
    # (code, generic_name, form, strength, unit, categories, schedule, is_essential, cost)
    ("AMX500", "Amoxicillin", "CAPSULE", "500mg", "capsules", ["ANTIBIOTIC"], "POM", True, Decimal("5")),
    ("AUGM625", "Amoxicillin-Clavulanate", "TABLET", "625mg", "tablets", ["ANTIBIOTIC"], "POM", True, Decimal("15")),
    ("CEFT1G", "Ceftriaxone", "INJECTION", "1g", "vials", ["ANTIBIOTIC"], "POM", True, Decimal("120")),
    ("METRO400", "Metronidazole", "TABLET", "400mg", "tablets", ["ANTIBIOTIC"], "POM", True, Decimal("3")),
    ("PCM1G", "Paracetamol", "TABLET", "1g", "tablets", ["ANALGESIC"], "OTC", True, Decimal("2")),
    ("PCMIV", "Paracetamol IV", "INJECTION", "1g/100mL", "vials", ["ANALGESIC"], "POM", True, Decimal("250")),
    ("TRAM50", "Tramadol", "CAPSULE", "50mg", "capsules", ["ANALGESIC"], "POM", False, Decimal("8")),
    ("OMEP20", "Omeprazole", "CAPSULE", "20mg", "capsules", ["OTHER"], "POM", True, Decimal("5")),
    ("METO500", "Metformin", "TABLET", "500mg", "tablets", ["ANTIDIABETIC"], "POM", True, Decimal("3")),
    ("MIXT3070", "Insulin Mixtard 30/70", "INJECTION", "100 IU/mL", "pens", ["ANTIDIABETIC"], "POM", True, Decimal("750")),
    ("HEPARIN", "Heparin Sodium", "INJECTION", "5000 IU/mL", "vials", ["OTHER"], "POM", True, Decimal("350")),
    ("ASPIRIN", "Aspirin", "TABLET", "75mg", "tablets", ["ANALGESIC"], "OTC", True, Decimal("2")),
    ("CLOPI75", "Clopidogrel", "TABLET", "75mg", "tablets", ["OTHER"], "POM", False, Decimal("15")),
    ("ATORV20", "Atorvastatin", "TABLET", "20mg", "tablets", ["OTHER"], "POM", True, Decimal("8")),
    ("ORS", "Oral Rehydration Salts", "POWDER", "20.5g sachet", "sachets", ["OTHER"], "OTC", True, Decimal("10")),
    ("ZINC20", "Zinc Sulphate", "TABLET", "20mg", "tablets", ["VITAMIN"], "OTC", True, Decimal("5")),
    ("AZITH500", "Azithromycin", "TABLET", "500mg", "tablets", ["ANTIBIOTIC"], "POM", True, Decimal("20")),
    ("NORAD", "Noradrenaline", "INJECTION", "4mg/4mL", "ampoules", ["OTHER"], "POM", False, Decimal("450")),
    ("OXYTOCIN", "Oxytocin", "INJECTION", "10 IU/mL", "ampoules", ["OTHER"], "POM", True, Decimal("80")),
    ("ENALAPRIL", "Enalapril", "TABLET", "5mg", "tablets", ["ANTIHYPERTENSIVE"], "POM", True, Decimal("4")),
]

IMAGING_PROCEDURE_DEFS = [
    # (code, name, modality, body_region, cost, requires_contrast)
    ("CXR", "Chest X-Ray PA", "XR", "CHEST", Decimal("1500"), False),
    ("AXR", "Abdominal X-Ray", "XR", "ABDOMEN", Decimal("1500"), False),
    ("USS-ABD", "Abdomen Ultrasound", "US", "ABDOMEN", Decimal("3000"), False),
    ("USS-PELV", "Pelvic Ultrasound", "US", "PELVIS", Decimal("3000"), False),
    ("CT-HEAD", "CT Head Plain", "CT", "HEAD", Decimal("12000"), False),
    ("CT-CHEST", "CT Chest with Contrast", "CT", "CHEST", Decimal("15000"), True),
    ("ECG", "Electrocardiogram", "OTHER", "CHEST", Decimal("500"), False),
    ("ECHO", "Echocardiogram", "US", "CHEST", Decimal("5000"), False),
]

# ---------------------------------------------------------------------------
# Clinical scenario definitions
# Distribution: 7 ACTIVE, 2 DISCHARGED, 1 DECEASED
# Transfers: 2 of the ACTIVE patients have transfer history
# Each scenario now includes: allergies, comorbidities, encounter_vitals,
# lab_orders, imaging_orders, prescriptions, handover_notes
# ---------------------------------------------------------------------------
SCENARIOS = [
    # ========== ACTIVE admissions (7) ==========
    {
        "ward_type": "MEDICAL",
        "icd": "J18.9",
        "dx_text": "Pneumonia, unspecified organism",
        "complaint": "Productive cough and fever for 5 days",
        "payer": "SHA",
        "status": "ACTIVE",
        "days_ago": 3,
        "gender": "M",
        "age_range": (45, 70),
        "allergies": [
            {"substance": "Penicillin", "substance_type": "medication", "reaction_type": "rash", "severity": "moderate", "verification_status": "confirmed", "criticality": "high", "notes": "Developed maculopapular rash after amoxicillin in 2018"},
        ],
        "comorbidities": {"chronic_conditions": "Hypertension (controlled on enalapril 5mg OD), Type 2 DM (diet controlled)", "current_medications": "Enalapril 5mg OD", "past_surgeries": "None", "family_history": "Father — MI at age 58, Mother — T2DM", "social_history": "Former smoker (quit 2019), no alcohol, retired teacher"},
        "encounter_vitals": {"temperature": Decimal("38.2"), "pulse": 98, "blood_pressure": "138/82", "respiratory_rate": 22, "spo2": Decimal("96"), "weight": Decimal("78.5"), "height": Decimal("172"), "history_of_present_illness": "65-year-old male presents with 5-day history of productive cough with yellowish sputum, fever up to 38.5°C, and progressive dyspnoea on exertion. Associated pleuritic right-sided chest pain. No haemoptysis. Has been self-medicating with OTC cough syrup without improvement.", "physical_examination": "Alert, febrile (38.2°C). Tachypnoeic, RR 22. Reduced air entry and crackles right lower zone. Dull to percussion right base. No wheeze. CVS: S1S2, no murmurs. Abdomen soft. No pedal oedema.", "assessment": "Community-acquired pneumonia, right lower lobe. Likely bacterial. Rule out TB given Kenya endemicity."},
        "lab_orders": [
            {"priority": "URGENT", "clinical_notes": "CAP day 5, febrile. Assess WBC, CRP for infection severity", "status": "COMPLETED", "items": [
                {"test_code": "FBC", "result": None},
                {"test_code": "HB", "result": {"numeric_value": Decimal("13.8"), "result_unit": "g/dL", "result_flag": "NORMAL", "reference_range_text": "13.0-17.0 g/dL"}},
                {"test_code": "WBC", "result": {"numeric_value": Decimal("14.2"), "result_unit": "x10^9/L", "result_flag": "HIGH", "reference_range_text": "4.0-11.0", "interpretation": "Leucocytosis consistent with bacterial infection"}},
                {"test_code": "CRP", "result": {"numeric_value": Decimal("86.0"), "result_unit": "mg/L", "result_flag": "HIGH", "reference_range_text": "0-5 mg/L", "interpretation": "Markedly elevated, consistent with acute bacterial infection"}},
            ]},
            {"priority": "ROUTINE", "clinical_notes": "Renal baseline — known hypertensive", "status": "COMPLETED", "items": [
                {"test_code": "CR", "result": {"numeric_value": Decimal("92"), "result_unit": "µmol/L", "result_flag": "NORMAL", "reference_range_text": "62-106 µmol/L"}},
                {"test_code": "K", "result": {"numeric_value": Decimal("4.2"), "result_unit": "mmol/L", "result_flag": "NORMAL", "reference_range_text": "3.5-5.0 mmol/L"}},
            ]},
        ],
        "imaging_orders": [
            {"procedure_code": "CXR", "priority": "URGENT", "clinical_indication": "Productive cough, fever 5 days, reduced air entry R base. R/O pneumonia vs TB", "status": "REPORTED", "report": {"findings": "Right lower lobe consolidation with air bronchograms. No pleural effusion. No cavitation or lymphadenopathy. Cardiac silhouette normal.", "impression": "Right lower lobe pneumonia. No features to suggest TB or malignancy.", "is_critical": False}},
        ],
        "prescriptions": [
            {"clinical_notes": "CAP — penicillin allergy, use cephalosporin", "items": [
                {"drug_code": "CEFT1G", "quantity": 6, "dosage": "1g IV", "frequency": "Once daily", "duration": "3 days", "route": "Intravenous", "instructions": "Administer over 30 min"},
                {"drug_code": "AUGM625", "quantity": 14, "dosage": "625mg", "frequency": "Three times daily", "duration": "7 days", "route": "Oral", "instructions": "Step-down from IV. Take with food."},
                {"drug_code": "PCM1G", "quantity": 12, "dosage": "1g", "frequency": "Three times daily", "duration": "As needed", "route": "Oral", "instructions": "For fever >37.5°C or pain"},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "DAY", "day_offset": 1, "pending_tasks": "Due ceftriaxone at 2000h. Repeat CRP tomorrow morning. Step-down to oral if afebrile overnight.", "escalations": "Penicillin allergy documented — ensure allergy band on wrist."},
            {"shift_ending": "NIGHT", "day_offset": 1, "pending_tasks": "Morning bloods: FBC, CRP. Review by consultant on ward round. If afebrile and CRP <40, switch to oral augmentin.", "escalations": ""},
            {"shift_ending": "DAY", "day_offset": 2, "pending_tasks": "Switched to oral augmentin. DC IV cannula. Plan discharge if stable overnight. Arrange follow-up CXR in 6 weeks.", "escalations": ""},
        ],
        "rounds": [
            {"day_offset": 1, "condition": "IMPROVING", "subj": "Less febrile, cough productive but decreasing", "obj": "T 37.4°C, RR 20, SpO2 96% on room air", "assess": "Improving community-acquired pneumonia, responding to IV antibiotics", "plan": "Step down to oral amoxicillin-clavulanate, monitor sputum culture results"},
            {"day_offset": 2, "condition": "IMPROVING", "subj": "Afebrile, appetite improving", "obj": "T 36.8°C, RR 18, SpO2 98%. CRP trending down", "assess": "Resolving pneumonia", "plan": "Switch to oral antibiotics, plan discharge if stable overnight"},
        ],
        "kardex": {
            "mobility_status": "Ambulatory with assistance",
            "dietary_requirements": "Regular",
            "iv_access": "Right forearm IV cannula",
            "fall_risk": "MODERATE",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "Patient presenting with pyrexia, productive cough, tachypnoea, and reduced SpO2. Crackles on auscultation right lower lobe.",
            "nursing_diagnosis": "Impaired gas exchange related to alveolar consolidation as evidenced by SpO2 96% and increased respiratory rate",
            "goal": "Patient will maintain SpO2 ≥95% on room air and be afebrile within 48 hours",
            "plan": "Administer prescribed antibiotics on time, O2 therapy PRN, encourage deep breathing exercises Q4H, monitor temperature 4-hourly",
            "rationale": "Timely antibiotic administration targets the infecting organism; O2 supplementation corrects hypoxaemia; deep breathing prevents atelectasis",
            "implementation": "Antibiotics given on schedule, O2 at 2L/min via nasal prongs for first 24h, patient doing incentive spirometry",
            "evaluation": "SpO2 improved to 98% on room air by day 2, temperature normalised",
        },
        "shift_notes": [
            {"shift": "DAY", "day_offset": 1, "content": "Patient resting comfortably. T 37.4°C, SpO2 96%. IV antibiotics given on time. Encouraged oral fluids. Cough still productive but less frequent. Family visited and counselled on progress."},
            {"shift": "NIGHT", "day_offset": 1, "content": "Slept intermittently. T 37.1°C at 2200h. SpO2 97%. No respiratory distress. Continued IV fluids at 80ml/hr."},
            {"shift": "DAY", "day_offset": 2, "content": "Patient afebrile. Taking full diet. Ambulating to bathroom independently. Switched to oral augmentin per doctor's order. DC IV cannula."},
        ],
        "tpr": [
            {"day_offset": 0, "hour": 8, "temp": "38.2", "pulse": 98, "rr": 22},
            {"day_offset": 0, "hour": 14, "temp": "37.8", "pulse": 92, "rr": 20},
            {"day_offset": 1, "hour": 8, "temp": "37.4", "pulse": 86, "rr": 20},
            {"day_offset": 1, "hour": 20, "temp": "37.1", "pulse": 80, "rr": 18},
            {"day_offset": 2, "hour": 8, "temp": "36.8", "pulse": 78, "rr": 18},
        ],
    },
    {
        "ward_type": "SURGICAL",
        "icd": "K35.8",
        "dx_text": "Acute appendicitis, other and unspecified",
        "complaint": "Acute RIF pain, nausea, and fever",
        "payer": "CASH",
        "status": "ACTIVE",
        "days_ago": 1,
        "gender": "F",
        "age_range": (18, 35),
        "allergies": [
            {"substance": "Ibuprofen", "substance_type": "medication", "reaction_type": "nausea", "severity": "mild", "verification_status": "presumed", "criticality": "low", "notes": "GI upset with NSAIDs"},
        ],
        "comorbidities": {"chronic_conditions": "None", "current_medications": "Combined oral contraceptive pill", "past_surgeries": "None", "family_history": "Non-contributory", "social_history": "University student, non-smoker, social alcohol, no drug use"},
        "encounter_vitals": {"temperature": Decimal("37.8"), "pulse": 92, "blood_pressure": "118/72", "respiratory_rate": 18, "spo2": Decimal("99"), "weight": Decimal("62.0"), "height": Decimal("165"), "history_of_present_illness": "24-year-old female presents with 12-hour history of periumbilical pain that migrated to the RIF. Associated nausea and 1 episode of vomiting. Low-grade fever. No urinary symptoms. LMP 2 weeks ago, regular.", "physical_examination": "Tender RIF with localised guarding and rebound. Rovsing sign positive. McBurney point tenderness. No mass palpable. Bowel sounds reduced. PR: tender high on right.", "assessment": "Acute appendicitis — surgical candidate. Alvarado score 8/10."},
        "lab_orders": [
            {"priority": "URGENT", "clinical_notes": "Acute abdomen — pre-op workup", "status": "COMPLETED", "items": [
                {"test_code": "FBC", "result": None},
                {"test_code": "WBC", "result": {"numeric_value": Decimal("15.6"), "result_unit": "x10^9/L", "result_flag": "HIGH", "reference_range_text": "4.0-11.0", "interpretation": "Neutrophilic leucocytosis supporting acute appendicitis"}},
                {"test_code": "CRP", "result": {"numeric_value": Decimal("42.0"), "result_unit": "mg/L", "result_flag": "HIGH", "reference_range_text": "0-5 mg/L"}},
                {"test_code": "CR", "result": {"numeric_value": Decimal("64"), "result_unit": "µmol/L", "result_flag": "NORMAL", "reference_range_text": "44-80 µmol/L"}},
            ]},
        ],
        "imaging_orders": [
            {"procedure_code": "USS-ABD", "priority": "URGENT", "clinical_indication": "RIF pain, query appendicitis. Alvarado 8.", "status": "REPORTED", "report": {"findings": "Non-compressible tubular structure in RIF measuring 11mm diameter with surrounding fat stranding. No free fluid. No ovarian pathology.", "impression": "Findings consistent with acute appendicitis. No complication.", "is_critical": False}},
        ],
        "prescriptions": [
            {"clinical_notes": "Peri-operative antibiotics and analgesia", "items": [
                {"drug_code": "CEFT1G", "quantity": 2, "dosage": "1g IV", "frequency": "Pre-op then post-op", "duration": "2 doses", "route": "Intravenous", "instructions": "First dose 30 min before incision"},
                {"drug_code": "METRO400", "quantity": 6, "dosage": "400mg IV", "frequency": "Three times daily", "duration": "48 hours", "route": "Intravenous", "instructions": "Administer over 20 min"},
                {"drug_code": "PCMIV", "quantity": 3, "dosage": "1g IV", "frequency": "Every 8 hours", "duration": "24 hours", "route": "Intravenous", "instructions": "Post-op analgesia"},
                {"drug_code": "PCM1G", "quantity": 15, "dosage": "1g", "frequency": "Three times daily", "duration": "5 days", "route": "Oral", "instructions": "Step-down analgesia after tolerating oral intake"},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "NIGHT", "day_offset": 0, "pending_tasks": "Post-op monitoring: vitals Q1H ×4 then Q4H. Check wound and drain. Advance diet when bowel sounds return. Due IV metronidazole at 0200h.", "escalations": "NSAID allergy documented — use paracetamol only for analgesia."},
        ],
        "rounds": [
            {"day_offset": 1, "condition": "STABLE", "subj": "Post-op day 1, tolerating oral fluids, mild incisional pain", "obj": "T 37.0°C, wound dry, bowel sounds present", "assess": "Uncomplicated post-appendicectomy recovery", "plan": "Advance diet, ambulate, continue IV antibiotics for 24h then switch oral"},
        ],
        "kardex": {
            "mobility_status": "Ambulatory with encouragement",
            "dietary_requirements": "Sips → light diet",
            "iv_access": "Left hand IV cannula",
            "fall_risk": "LOW",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "Post-appendicectomy day 1. Surgical wound clean and dry. Mild guarding around incision site. Pain score 4/10 on movement.",
            "nursing_diagnosis": "Acute pain related to surgical incision as evidenced by guarding and pain score 4/10",
            "goal": "Patient will report pain score ≤3/10 within 24 hours and ambulate independently",
            "plan": "Administer prescribed analgesics on schedule, wound care daily, encourage early ambulation, monitor for surgical site infection",
            "rationale": "Adequate analgesia enables early mobilisation which reduces risk of DVT and promotes bowel function; wound monitoring detects early infection",
            "implementation": "Paracetamol 1g IV Q8H given, patient ambulated to bedside chair",
            "evaluation": "Pain reduced to 2/10 at rest. Bowel sounds active, passed flatus",
        },
        "shift_notes": [
            {"shift": "NIGHT", "day_offset": 0, "content": "Post-op patient returned from theatre at 2030h. Conscious, oriented. BP 118/72, PR 80. Wound dry, drain minimal. IV paracetamol given. Resting comfortably."},
            {"shift": "DAY", "day_offset": 1, "content": "Patient sat up and walked to bathroom with assistance. Tolerating sips of water. Wound clean and dry. Drain removed. Pain well controlled on oral analgesics."},
        ],
        "tpr": [
            {"day_offset": 0, "hour": 21, "temp": "37.2", "pulse": 84, "rr": 16},
            {"day_offset": 1, "hour": 6, "temp": "36.9", "pulse": 76, "rr": 16},
            {"day_offset": 1, "hour": 14, "temp": "37.0", "pulse": 78, "rr": 16},
        ],
    },
    {
        "ward_type": "PEDIATRIC",
        "icd": "A09",
        "dx_text": "Infectious gastroenteritis and colitis, unspecified",
        "complaint": "Watery diarrhoea and vomiting for 2 days, poor oral intake",
        "payer": "SHA",
        "status": "ACTIVE",
        "days_ago": 2,
        "gender": "M",
        "age_range": (2, 8),
        "allergies": [],
        "comorbidities": {"chronic_conditions": "None", "current_medications": "None", "past_surgeries": "None", "family_history": "No significant family history", "social_history": "Attends daycare centre, vaccinations up to date"},
        "encounter_vitals": {"temperature": Decimal("37.8"), "pulse": 120, "blood_pressure": "90/55", "respiratory_rate": 28, "spo2": Decimal("98"), "weight": Decimal("14.5"), "height": Decimal("96"), "history_of_present_illness": "3-year-old male, 2-day history of profuse watery diarrhoea (6-8 episodes/day) with vomiting (4 episodes). Reduced oral intake. Reduced urine output. No blood in stool. Several children at daycare have similar illness.", "physical_examination": "Irritable but consolable. Sunken eyes. Dry mucous membranes. Reduced skin turgor. Tachycardic (120). Capillary refill 3 seconds. Abdomen soft, hyperactive bowel sounds. No hepatosplenomegaly.", "assessment": "Moderate dehydration secondary to acute gastroenteritis. Likely rotavirus. WHO Plan B rehydration indicated."},
        "lab_orders": [
            {"priority": "URGENT", "clinical_notes": "AGE with moderate dehydration in 3-year-old", "status": "COMPLETED", "items": [
                {"test_code": "K", "result": {"numeric_value": Decimal("3.2"), "result_unit": "mmol/L", "result_flag": "LOW", "reference_range_text": "3.5-5.0 mmol/L", "interpretation": "Mild hypokalaemia — supplement via ORS and diet"}},
                {"test_code": "NA", "result": {"numeric_value": Decimal("138"), "result_unit": "mmol/L", "result_flag": "NORMAL", "reference_range_text": "136-145 mmol/L"}},
                {"test_code": "RBS", "result": {"numeric_value": Decimal("5.2"), "result_unit": "mmol/L", "result_flag": "NORMAL", "reference_range_text": "3.9-7.8 mmol/L"}},
            ]},
        ],
        "imaging_orders": [],
        "prescriptions": [
            {"clinical_notes": "AGE — oral rehydration and zinc supplementation per WHO guidelines", "items": [
                {"drug_code": "ORS", "quantity": 10, "dosage": "5ml spoons every 5 min", "frequency": "Continuous", "duration": "Until rehydrated", "route": "Oral", "instructions": "Small frequent sips. Mother to administer."},
                {"drug_code": "ZINC20", "quantity": 10, "dosage": "20mg", "frequency": "Once daily", "duration": "10 days", "route": "Oral", "instructions": "Dissolve in ORS if child unable to chew. Continue full 10 days even after diarrhoea resolves."},
                {"drug_code": "PCM1G", "quantity": 5, "dosage": "250mg", "frequency": "Every 6 hours PRN", "duration": "As needed", "route": "Oral", "instructions": "For temperature >38°C. Use 15mg/kg dose."},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "DAY", "day_offset": 1, "pending_tasks": "Continue strict I/O chart. Weigh nappies. ORS ad lib. Monitor for dehydration signs. Repeat K+ tomorrow if still loose stools.", "escalations": "Potassium 3.2 — low. Ensure adequate ORS intake. Escalate if <3.0 or child becomes lethargic."},
        ],
        "rounds": [
            {"day_offset": 1, "condition": "IMPROVING", "subj": "Vomiting stopped, taking ORS well, still 3 loose stools", "obj": "No sunken eyes, skin turgor normal, capillary refill <2s", "assess": "Moderate dehydration improving on IV fluids", "plan": "Switch to oral rehydration if tolerating, monitor stool frequency"},
        ],
        "kardex": {
            "mobility_status": "Active, playing in bed",
            "dietary_requirements": "BRAT diet, ORS ad lib",
            "iv_access": "Right hand paediatric cannula",
            "fall_risk": "MODERATE",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "3-year-old with watery diarrhoea ×6/day, vomiting, dry mucous membranes, reduced skin turgor, tachycardia",
            "nursing_diagnosis": "Fluid volume deficit related to GI losses as evidenced by dry mucosa, poor turgor, and tachycardia",
            "goal": "Rehydration achieved within 24 hours; moist mucosa, normal turgor, urine output ≥1ml/kg/hr",
            "plan": "Strict I/O chart, IV maintenance fluids as prescribed, offer ORS small frequent sips, weigh daily, monitor for signs of shock",
            "rationale": "Careful fluid replacement corrects dehydration; strict I/O monitoring enables early detection of worsening fluid deficit",
            "implementation": "IV Ringer's lactate running at 60ml/hr per weight. ORS 5ml spoons every 5 min. Nappy weighed for output",
            "evaluation": "Vomiting ceased by day 1, taking ORS well. Skin turgor improved. Urine output adequate",
        },
        "shift_notes": [
            {"shift": "DAY", "day_offset": 1, "content": "Child more alert, playing. Tolerated ORS and BRAT diet. 2 loose stools (reduced from 6). Mother at bedside. IV slowed to maintenance rate."},
            {"shift": "NIGHT", "day_offset": 1, "content": "Slept well. 1 loose stool overnight. Nappy wet ×3 (good output). Mother giving ORS as instructed. Plan to DC IV if tolerating well in morning."},
        ],
        "tpr": [
            {"day_offset": 0, "hour": 10, "temp": "37.8", "pulse": 120, "rr": 28},
            {"day_offset": 0, "hour": 18, "temp": "37.4", "pulse": 110, "rr": 24},
            {"day_offset": 1, "hour": 8, "temp": "37.0", "pulse": 100, "rr": 22},
            {"day_offset": 1, "hour": 20, "temp": "36.8", "pulse": 96, "rr": 20},
        ],
    },
    {
        # ICU patient who will be TRANSFERRED to Medical ward (step-down)
        "ward_type": "ICU",
        "icd": "I21.0",
        "dx_text": "Acute transmural MI of anterior wall",
        "complaint": "Severe central chest pain, diaphoresis, SOB",
        "payer": "CORPORATE",
        "status": "ACTIVE",
        "days_ago": 4,
        "gender": "M",
        "age_range": (50, 68),
        "allergies": [
            {"substance": "Morphine", "substance_type": "medication", "reaction_type": "nausea", "severity": "mild", "verification_status": "confirmed", "criticality": "low", "notes": "Severe nausea and vomiting with morphine — use tramadol or fentanyl instead"},
        ],
        "comorbidities": {"chronic_conditions": "Hypertension (poorly controlled), Dyslipidaemia, Type 2 DM on metformin", "current_medications": "Metformin 500mg BD, Atorvastatin 20mg ON, Amlodipine 10mg OD (not taking regularly)", "past_surgeries": "Right inguinal hernia repair (2015)", "family_history": "Father — MI at 58, died. Brother — CABG at 52. Strong family history of IHD.", "social_history": "Active smoker 20 pack-years, social alcohol, bank manager, sedentary lifestyle"},
        "encounter_vitals": {"temperature": Decimal("37.0"), "pulse": 88, "blood_pressure": "90/60", "respiratory_rate": 22, "spo2": Decimal("93"), "weight": Decimal("92.0"), "height": Decimal("175"), "history_of_present_illness": "58-year-old male presents with sudden onset severe central crushing chest pain radiating to left arm and jaw, associated with diaphoresis and dyspnoea. Onset 2 hours ago while at rest. No relief with GTN spray from ambulance. Known hypertensive but poorly compliant.", "physical_examination": "Diaphoretic, distressed. BP 90/60, HR 88 regular. JVP not elevated. S4 gallop, no murmurs. Chest: bilateral fine basal crepitations. ECG: ST elevation V1-V4, reciprocal depression in inferior leads. Troponin I markedly elevated.", "assessment": "Anterior STEMI. Killip Class II. For emergent PCI."},
        "lab_orders": [
            {"priority": "STAT", "clinical_notes": "Anterior STEMI — serial troponin, baseline bloods", "status": "COMPLETED", "items": [
                {"test_code": "TROPI", "result": {"numeric_value": Decimal("12.4"), "result_unit": "ng/mL", "result_flag": "CRITICAL_HIGH", "reference_range_text": "0-0.04 ng/mL", "interpretation": "Markedly elevated troponin I confirming acute myocardial injury", "is_critical_result": True}},
                {"test_code": "HB", "result": {"numeric_value": Decimal("14.8"), "result_unit": "g/dL", "result_flag": "NORMAL", "reference_range_text": "13.0-17.0 g/dL"}},
                {"test_code": "CR", "result": {"numeric_value": Decimal("98"), "result_unit": "µmol/L", "result_flag": "NORMAL", "reference_range_text": "62-106 µmol/L"}},
                {"test_code": "K", "result": {"numeric_value": Decimal("4.4"), "result_unit": "mmol/L", "result_flag": "NORMAL", "reference_range_text": "3.5-5.0 mmol/L"}},
                {"test_code": "RBS", "result": {"numeric_value": Decimal("11.2"), "result_unit": "mmol/L", "result_flag": "HIGH", "reference_range_text": "3.9-7.8 mmol/L", "interpretation": "Stress hyperglycaemia in setting of acute MI. Known diabetic."}},
            ]},
            {"priority": "URGENT", "clinical_notes": "Post-PCI day 1 — repeat troponin peak", "status": "COMPLETED", "day_offset": 1, "items": [
                {"test_code": "TROPI", "result": {"numeric_value": Decimal("48.6"), "result_unit": "ng/mL", "result_flag": "CRITICAL_HIGH", "reference_range_text": "0-0.04 ng/mL", "interpretation": "Peak troponin. Expected rise post-STEMI. Trending.", "is_critical_result": True}},
            ]},
        ],
        "imaging_orders": [
            {"procedure_code": "ECG", "priority": "STAT", "clinical_indication": "Acute chest pain with diaphoresis, query STEMI", "status": "COMPLETED"},
            {"procedure_code": "CXR", "priority": "URGENT", "clinical_indication": "Post-STEMI day 1, basal creps, assess for pulmonary congestion", "status": "REPORTED", "report": {"findings": "Upper lobe venous distension. Bilateral perihilar haziness and Kerley B lines. Mild bilateral pleural effusions. Heart size upper limit of normal. No pneumothorax.", "impression": "Pulmonary oedema consistent with acute heart failure (Killip II). Mild cardiomegaly.", "is_critical": False}},
            {"procedure_code": "ECHO", "priority": "URGENT", "clinical_indication": "Post-anterior STEMI — assess LV function", "status": "REPORTED", "report": {"findings": "LV mildly dilated. Anteroseptal and apical akinesis. Estimated LVEF 42% by Simpson biplane. Mild mitral regurgitation. RV function normal. No pericardial effusion.", "impression": "LV systolic dysfunction (EF 42%) with regional wall motion abnormality consistent with anterior STEMI territory. Mild functional MR.", "is_critical": False}},
        ],
        "prescriptions": [
            {"clinical_notes": "Post-STEMI acute management — dual antiplatelet, anticoagulation, statin", "items": [
                {"drug_code": "ASPIRIN", "quantity": 30, "dosage": "75mg", "frequency": "Once daily", "duration": "Lifelong", "route": "Oral", "instructions": "Take with food. Do not stop without cardiology advice."},
                {"drug_code": "CLOPI75", "quantity": 30, "dosage": "75mg", "frequency": "Once daily", "duration": "12 months", "route": "Oral", "instructions": "Dual antiplatelet therapy post-PCI. Take with aspirin."},
                {"drug_code": "HEPARIN", "quantity": 6, "dosage": "5000 IU SC", "frequency": "Every 12 hours", "duration": "48 hours", "route": "Subcutaneous", "instructions": "DVT prophylaxis while on bed rest"},
                {"drug_code": "ATORV20", "quantity": 30, "dosage": "40mg", "frequency": "Once daily at night", "duration": "Ongoing", "route": "Oral", "instructions": "High-intensity statin. Take at bedtime."},
                {"drug_code": "ENALAPRIL", "quantity": 30, "dosage": "2.5mg", "frequency": "Twice daily", "duration": "Ongoing", "route": "Oral", "instructions": "ACE inhibitor for post-MI LV protection. Titrate up as tolerated."},
                {"drug_code": "METO500", "quantity": 60, "dosage": "500mg", "frequency": "Twice daily", "duration": "Ongoing", "route": "Oral", "instructions": "Continue home metformin for DM"},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "DAY", "day_offset": 1, "pending_tasks": "Serial troponin at 2000h. Hourly vitals including BP on arterial line. Heparin infusion running — check aPTT at 0600h. Cardiology review at 0800h.", "escalations": "CRITICAL: Troponin 48.6 — peak expected. Report any chest pain immediately. Morphine allergy — use tramadol for pain."},
            {"shift_ending": "NIGHT", "day_offset": 1, "pending_tasks": "Morning bloods: FBC, U&E, troponin trough. Echo arranged for 1000h. Dietician referral for cardiac/diabetic diet pending.", "escalations": ""},
            {"shift_ending": "DAY", "day_offset": 2, "pending_tasks": "Transfer to medical ward step-down when ICU consult confirms stability. Ensure telemetry available on receiving ward.", "escalations": ""},
        ],
        "transfer": {
            "day_offset": 3,
            "dest_ward_type": "MEDICAL",
            "reason": "STEP_DOWN",
            "details": "Haemodynamically stable post-PCI, EF 45%, tolerating diet. No longer requires ICU-level monitoring.",
            "handover": "Day 3 post-STEMI. Dual antiplatelet therapy. Telemetry monitoring. Diet as tolerated. Cardiology review in 48h.",
        },
        "rounds": [
            {"day_offset": 1, "condition": "CRITICAL", "subj": "Chest pain resolved post-PCI, mild dyspnoea", "obj": "BP 110/70, HR 82, SpO2 95% on 2L O2. Troponin trending down. ECG: resolving ST changes", "assess": "STEMI anterior wall post-PCI, LV function mildly reduced", "plan": "Continue heparin infusion, dual antiplatelet therapy, serial ECG and troponin at 12h"},
            {"day_offset": 2, "condition": "IMPROVING", "subj": "No chest pain, tolerating diet", "obj": "BP 118/74, HR 76, SpO2 97% on room air. Echo: EF 45%", "assess": "Post-STEMI day 2, haemodynamically stable", "plan": "Wean O2, prepare for step-down to medical ward"},
        ],
        "kardex": {
            "mobility_status": "Bed rest → bedside chair",
            "dietary_requirements": "Cardiac diet, low sodium",
            "iv_access": "Right subclavian CVC, left hand peripheral",
            "fall_risk": "HIGH",
            "pressure_sore_risk": "MODERATE",
        },
        "care_plan": {
            "assessment": "Post-STEMI day 1. On heparin infusion. Dual antiplatelet therapy. CVC in situ. Continuous cardiac monitoring showing NSR.",
            "nursing_diagnosis": "Decreased cardiac output related to myocardial injury as evidenced by reduced EF and chest pain history",
            "goal": "Patient will maintain stable haemodynamics (SBP >100, HR 60-100) and remain pain-free for 24 hours",
            "plan": "Continuous cardiac monitoring, hourly vital signs, strict bed rest day 1, titrate O2 to SpO2 ≥94%, report any chest pain immediately",
            "rationale": "Continuous monitoring enables early detection of arrhythmias and re-infarction; bed rest reduces myocardial oxygen demand in acute phase",
            "implementation": "Cardiac monitor on. BP/HR Q1H. O2 at 2L weaned to room air day 2. CVC site dressed and dry. Heparin infusion running.",
            "evaluation": "Haemodynamically stable. No recurrent chest pain. Stepped down to medical ward day 3.",
        },
        "shift_notes": [
            {"shift": "DAY", "day_offset": 1, "content": "Post-PCI day 1. Cardiac monitor — NSR, no ectopics. BP stable 110-118/70-74. O2 at 2L, SpO2 95-96%. Heparin infusion running. Bedside commode used. Family counselled about cardiac rehabilitation pathway."},
            {"shift": "NIGHT", "day_offset": 1, "content": "Uneventful night. Slept with 1 awakening for vitals. Telemetry stable. CVC site dry. Troponin trend reviewed with ICU physician — declining as expected."},
            {"shift": "DAY", "day_offset": 2, "content": "Sat in chair for 30 min, tolerated well. O2 weaned to room air, SpO2 97%. Eating full cardiac diet. Ready for step-down transfer per consultant."},
        ],
        "tpr": [
            {"day_offset": 0, "hour": 6, "temp": "37.0", "pulse": 88, "rr": 20},
            {"day_offset": 0, "hour": 12, "temp": "37.2", "pulse": 82, "rr": 18},
            {"day_offset": 1, "hour": 8, "temp": "36.9", "pulse": 80, "rr": 18},
            {"day_offset": 1, "hour": 20, "temp": "36.8", "pulse": 76, "rr": 16},
            {"day_offset": 2, "hour": 8, "temp": "36.7", "pulse": 74, "rr": 16},
        ],
    },
    {
        "ward_type": "MATERNITY",
        "icd": "O80",
        "dx_text": "Single spontaneous delivery",
        "complaint": "Term pregnancy in labour, regular contractions",
        "payer": "SHA",
        "status": "ACTIVE",
        "days_ago": 1,
        "gender": "F",
        "age_range": (22, 35),
        "allergies": [],
        "comorbidities": {"chronic_conditions": "None", "current_medications": "Ferrous sulphate 200mg OD, Folic acid 5mg OD (antenatal)", "past_surgeries": "None", "family_history": "Mother — gestational DM in her pregnancies", "social_history": "Married, housewife, non-smoker, no alcohol. Gravida 2 Para 1+0."},
        "encounter_vitals": {"temperature": Decimal("37.0"), "pulse": 82, "blood_pressure": "118/72", "respiratory_rate": 18, "spo2": Decimal("99"), "weight": Decimal("72.0"), "height": Decimal("162"), "history_of_present_illness": "28-year-old G2P1+0 at 39+2 weeks gestation. Regular painful contractions every 5 minutes for 6 hours. SROM 2 hours ago — clear liquor. Good fetal movements. ANC attended ×6 — all normal. HIV negative.", "physical_examination": "Well-nourished. Abdomen: fundal height 38cm, longitudinal lie, cephalic ROA, 3/5 palpable. FHR 142 regular. PV: 6cm dilated, fully effaced, station -1, membranes absent, clear liquor. Pelvis adequate.", "assessment": "Active first stage of labour. G2P1 at term. Normal progress."},
        "lab_orders": [
            {"priority": "ROUTINE", "clinical_notes": "Admission bloods — labour ward", "status": "COMPLETED", "items": [
                {"test_code": "HB", "result": {"numeric_value": Decimal("11.8"), "result_unit": "g/dL", "result_flag": "NORMAL", "reference_range_text": "11.0-14.0 g/dL (pregnancy)"}},
                {"test_code": "RBS", "result": {"numeric_value": Decimal("5.4"), "result_unit": "mmol/L", "result_flag": "NORMAL", "reference_range_text": "3.9-7.8 mmol/L"}},
            ]},
        ],
        "imaging_orders": [],
        "prescriptions": [
            {"clinical_notes": "Postpartum — iron supplementation, analgesia", "items": [
                {"drug_code": "PCM1G", "quantity": 9, "dosage": "1g", "frequency": "Three times daily", "duration": "3 days", "route": "Oral", "instructions": "For afterpains"},
                {"drug_code": "OXYTOCIN", "quantity": 1, "dosage": "10 IU IM", "frequency": "Stat", "duration": "Single dose", "route": "Intramuscular", "instructions": "Active management of third stage of labour"},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "NIGHT", "day_offset": 0, "pending_tasks": "Baby weight 3.2kg, Apgar 9/10. BCG and OPV-0 due in morning. Ensure breastfeeding established. Fundal checks Q15min × 1hr, then Q1H × 4hrs.", "escalations": ""},
            {"shift_ending": "DAY", "day_offset": 1, "pending_tasks": "Baby immunised. PNC counselling done. Discharge if observations normal. Schedule 48-hour PNC visit.", "escalations": ""},
        ],
        "rounds": [
            {"day_offset": 1, "condition": "STABLE", "subj": "Delivered healthy baby 3.2 kg, breastfeeding well", "obj": "Uterus well contracted, lochia normal, perineum intact", "assess": "Uncomplicated SVD, mother and baby well", "plan": "Observe 24h, immunise baby, PNC counselling"},
        ],
        "kardex": {
            "mobility_status": "Ambulatory",
            "dietary_requirements": "Regular, encourage fluids",
            "iv_access": "None",
            "fall_risk": "LOW",
            "pressure_sore_risk": "LOW",
            "maternity_continuity_action": "SCHEDULE_EARLY_PNC",
            "maternity_continuity_notes": "Schedule 48-hour PNC visit for mother and baby",
        },
        "care_plan": {
            "assessment": "Postpartum day 1. SVD at term, no complications. Uterus well-contracted, fundus at umbilicus. Lochia rubra, moderate amount. Baby breastfeeding well.",
            "nursing_diagnosis": "Risk for postpartum haemorrhage related to uterine atony in immediate postpartum period",
            "goal": "Uterus will remain well-contracted; lochia will be moderate to minimal without clots within 24 hours",
            "plan": "Monitor fundal height and firmness Q15min ×1hr, then Q1H ×4hrs; assess lochia pad count; encourage early breastfeeding to promote uterine contraction",
            "rationale": "Uterine massage and monitoring enable early detection of atony; breastfeeding stimulates oxytocin release which promotes uterine involution",
            "implementation": "Fundal checks done per protocol. Breastfeeding initiated within 30 min of delivery. Two pads used in first 4 hours — normal.",
            "evaluation": "Uterus well-contracted, lochia reducing. Mother and baby stable for discharge planning.",
        },
        "shift_notes": [
            {"shift": "NIGHT", "day_offset": 0, "content": "Delivered spontaneously at 2145h. Baby 3.2 kg, Apgar 9/10. Breastfed within 30 min. Fundus firm. Lochia moderate. Perineum intact. Both comfortable."},
            {"shift": "DAY", "day_offset": 1, "content": "Mother ambulatory. Breastfeeding well. Lochia reducing. Baby BCG and OPV-0 given. PNC counselling done. Plan for discharge if observations remain normal."},
        ],
        "tpr": [
            {"day_offset": 0, "hour": 22, "temp": "37.0", "pulse": 82, "rr": 18},
            {"day_offset": 1, "hour": 6, "temp": "36.8", "pulse": 76, "rr": 16},
            {"day_offset": 1, "hour": 14, "temp": "36.7", "pulse": 74, "rr": 16},
        ],
    },
    {
        # Isolation patient who will be TRANSFERRED to Medical ward after clearance
        "ward_type": "ISOLATION",
        "icd": "A01.0",
        "dx_text": "Typhoid fever",
        "complaint": "High fever for 10 days, headache, abdominal pain, constipation",
        "payer": "SHA",
        "status": "ACTIVE",
        "days_ago": 5,
        "gender": "F",
        "age_range": (20, 40),
        "allergies": [
            {"substance": "Sulfonamides", "substance_type": "medication", "reaction_type": "rash", "severity": "moderate", "verification_status": "confirmed", "criticality": "high", "notes": "Stevens-Johnson syndrome risk — documented in 2020"},
            {"substance": "Peanuts", "substance_type": "food", "reaction_type": "hives", "severity": "mild", "verification_status": "confirmed", "criticality": "low", "notes": "Urticaria after peanut exposure. Avoids peanut products."},
        ],
        "comorbidities": {"chronic_conditions": "None", "current_medications": "None", "past_surgeries": "Tonsillectomy (childhood)", "family_history": "Non-contributory", "social_history": "Agricultural worker in rural Kisumu. Uses borehole water. Non-smoker, no alcohol."},
        "encounter_vitals": {"temperature": Decimal("39.2"), "pulse": 102, "blood_pressure": "110/68", "respiratory_rate": 22, "spo2": Decimal("97"), "weight": Decimal("58.0"), "height": Decimal("160"), "history_of_present_illness": "26-year-old female presents with 10-day history of high-grade fever (up to 39.5°C) with stepladder pattern. Associated headache, abdominal pain, constipation, and anorexia. Myalgia and malaise. No rash noted. Uses untreated borehole water.", "physical_examination": "Febrile (39.2°C), toxic-looking. Coated tongue. Relative bradycardia. Abdomen: tender hepatosplenomegaly, no guarding. Rose spots on trunk (faint). No lymphadenopathy.", "assessment": "Clinical typhoid fever — Salmonella typhi suspected. Blood culture sent. Start empirical ceftriaxone. Contact isolation."},
        "lab_orders": [
            {"priority": "URGENT", "clinical_notes": "Suspected typhoid — blood culture urgent", "status": "COMPLETED", "items": [
                {"test_code": "BCULTURE", "result": {"text_value": "Salmonella typhi isolated. Sensitive to: Ceftriaxone, Azithromycin, Ciprofloxacin. Resistant to: Ampicillin, Chloramphenicol, Cotrimoxazole.", "result_flag": "POSITIVE", "interpretation": "Confirmed typhoid fever. MDR pattern noted — sensitive to ceftriaxone and azithromycin."}},
                {"test_code": "WIDAL", "result": {"text_value": "O antigen titre 1:320, H antigen titre 1:640", "result_flag": "POSITIVE", "interpretation": "Titres consistent with active Salmonella typhi infection"}},
            ]},
            {"priority": "ROUTINE", "clinical_notes": "Baseline bloods — monitor hepatic/renal function", "status": "COMPLETED", "items": [
                {"test_code": "HB", "result": {"numeric_value": Decimal("11.2"), "result_unit": "g/dL", "result_flag": "LOW", "reference_range_text": "12.0-16.0 g/dL", "interpretation": "Mild anaemia of chronic disease"}},
                {"test_code": "WBC", "result": {"numeric_value": Decimal("3.8"), "result_unit": "x10^9/L", "result_flag": "LOW", "reference_range_text": "4.0-11.0", "interpretation": "Leukopenia — typical of typhoid fever"}},
                {"test_code": "PLT", "result": {"numeric_value": Decimal("142"), "result_unit": "x10^9/L", "result_flag": "LOW", "reference_range_text": "150-400", "interpretation": "Mild thrombocytopenia, monitor for DIC"}},
            ]},
        ],
        "imaging_orders": [
            {"procedure_code": "USS-ABD", "priority": "ROUTINE", "clinical_indication": "Typhoid fever with hepatosplenomegaly — assess for complications", "status": "REPORTED", "report": {"findings": "Liver mildly enlarged (16cm span) with homogeneous echotexture. Spleen enlarged (14cm). No focal lesions. No abscess. No free fluid. Gallbladder normal, no cholelithiasis.", "impression": "Hepatosplenomegaly consistent with typhoid fever. No complications (abscess, perforation).", "is_critical": False}},
        ],
        "prescriptions": [
            {"clinical_notes": "Confirmed typhoid — culture-directed therapy", "items": [
                {"drug_code": "CEFT1G", "quantity": 14, "dosage": "2g IV", "frequency": "Once daily", "duration": "14 days", "route": "Intravenous", "instructions": "Infuse over 30 min. Complete full 14-day course."},
                {"drug_code": "AZITH500", "quantity": 7, "dosage": "500mg", "frequency": "Once daily", "duration": "7 days", "route": "Oral", "instructions": "Step-down from IV ceftriaxone when afebrile ×48h. Take on empty stomach."},
                {"drug_code": "PCM1G", "quantity": 15, "dosage": "1g", "frequency": "Every 6 hours PRN", "duration": "As needed", "route": "Oral", "instructions": "For temperature >38°C. Tepid sponge first."},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "DAY", "day_offset": 1, "pending_tasks": "Temperature chart 4-hourly. Blood culture result pending. Ensure isolation precautions: gown, gloves, hand hygiene for all contacts. Stool specimen for culture tomorrow.", "escalations": "ALLERGY: Sulfonamides — SJS risk documented. Do NOT prescribe cotrimoxazole."},
            {"shift_ending": "NIGHT", "day_offset": 2, "pending_tasks": "Blood culture result confirmed Salmonella typhi. Ceftriaxone sensitive. Continue current regimen. Watch for complications: perforation (sudden abd pain), GI bleed.", "escalations": ""},
            {"shift_ending": "DAY", "day_offset": 4, "pending_tasks": "Afebrile ×48h. Plan transfer to medical ward. DC isolation precautions. Switch to oral azithromycin. Repeat stool culture before discharge.", "escalations": ""},
        ],
        "transfer": {
            "day_offset": 4,
            "dest_ward_type": "MEDICAL",
            "reason": "SPECIALTY",
            "details": "Blood cultures negative on repeat. Afebrile for 48 hours. No longer requires contact isolation.",
            "handover": "Completing 14-day course of IV ceftriaxone. Day 12 now. Switch to oral azithromycin on day 10 done. Abdominal exam normal. Stool culture pending.",
        },
        "rounds": [
            {"day_offset": 1, "condition": "STABLE", "subj": "Still febrile, headache persisting", "obj": "T 38.9°C, tender hepatosplenomegaly, coated tongue", "assess": "Typhoid fever, blood culture Salmonella typhi confirmed", "plan": "IV ceftriaxone 2g OD, monitor for complications"},
            {"day_offset": 3, "condition": "IMPROVING", "subj": "Fever reducing, appetite returning", "obj": "T 37.6°C, Widal falling, abdomen less tender", "assess": "Typhoid responding to ceftriaxone", "plan": "Step down to oral azithromycin if afebrile for 48h, plan transfer out of isolation"},
        ],
        "kardex": {
            "mobility_status": "Ambulatory within isolation room",
            "dietary_requirements": "Soft diet, high protein",
            "iv_access": "Right arm peripheral cannula",
            "fall_risk": "LOW",
            "pressure_sore_risk": "LOW",
            "isolation_required": True,
            "isolation_type": "Contact isolation — enteric precautions",
        },
        "care_plan": {
            "assessment": "Confirmed Salmonella typhi. High-grade fever day 10. Hepatosplenomegaly. Contact isolation precautions in place.",
            "nursing_diagnosis": "Hyperthermia related to Salmonella typhi infection as evidenced by temperature 38.9°C and diaphoresis",
            "goal": "Patient will become afebrile (T <37.5°C) within 72 hours of appropriate antibiotic therapy",
            "plan": "Temperature monitoring Q4H, tepid sponging PRN for T >38.5°C, administer antipyretics as prescribed, ensure adequate hydration, strict contact precautions",
            "rationale": "Temperature monitoring tracks response to treatment; tepid sponging aids thermoregulation; enteric precautions prevent nosocomial transmission",
            "implementation": "Ceftriaxone 2g IV OD given. Tepid sponge on day 1. Oral fluids >2L/day achieved. Hand hygiene and gown/gloves enforced for all contacts.",
            "evaluation": "Afebrile by day 4. Transferred to medical ward after 48h apyrexia. Isolation precautions discontinued.",
        },
        "shift_notes": [
            {"shift": "DAY", "day_offset": 1, "content": "T 38.9°C. Tepid sponge given, brought down to 38.0°C. Ceftriaxone administered. Patient eating soft diet. Isolation precautions maintained — all visitors gowned. Stool specimen sent."},
            {"shift": "NIGHT", "day_offset": 1, "content": "Low-grade fever overnight (37.8°C). Slept for 4-hour stretches. Oral fluids maintained. No complications."},
            {"shift": "DAY", "day_offset": 3, "content": "T 37.2°C for 24h now. Appetite improved. Doctor reviewed — plan to transfer to medical ward tomorrow if remains afebrile. Oral azithromycin started."},
        ],
        "tpr": [
            {"day_offset": 0, "hour": 8, "temp": "39.2", "pulse": 102, "rr": 22},
            {"day_offset": 0, "hour": 20, "temp": "38.8", "pulse": 98, "rr": 20},
            {"day_offset": 1, "hour": 8, "temp": "38.9", "pulse": 96, "rr": 20},
            {"day_offset": 2, "hour": 8, "temp": "38.0", "pulse": 88, "rr": 18},
            {"day_offset": 3, "hour": 8, "temp": "37.6", "pulse": 82, "rr": 18},
            {"day_offset": 4, "hour": 8, "temp": "37.0", "pulse": 76, "rr": 16},
        ],
    },
    {
        "ward_type": "MEDICAL",
        "icd": "N17.9",
        "dx_text": "Acute kidney injury, unspecified",
        "complaint": "Oliguria, nausea, elevated creatinine on OPD labs",
        "payer": "CASH",
        "status": "ACTIVE",
        "days_ago": 2,
        "gender": "M",
        "age_range": (55, 75),
        "allergies": [
            {"substance": "Diclofenac", "substance_type": "medication", "reaction_type": "other", "severity": "moderate", "verification_status": "confirmed", "criticality": "high", "notes": "Precipitated AKI — all NSAIDs contraindicated in this patient"},
        ],
        "comorbidities": {"chronic_conditions": "Hypertension (enalapril 5mg BD), BPH (tamsulosin), Osteoarthritis knees", "current_medications": "Enalapril 5mg BD, Tamsulosin 0.4mg ON, Diclofenac 50mg BD (self-prescribed — cause of AKI)", "past_surgeries": "Right knee arthroscopy (2018)", "family_history": "Father — CKD on dialysis, died age 72", "social_history": "Retired mechanic, non-smoker, occasional alcohol. Widow."},
        "encounter_vitals": {"temperature": Decimal("36.8"), "pulse": 88, "blood_pressure": "158/92", "respiratory_rate": 18, "spo2": Decimal("97"), "weight": Decimal("84.0"), "height": Decimal("170"), "history_of_present_illness": "68-year-old male referred from OPD after routine bloods showed Cr 380 µmol/L (baseline 100 2 months ago). Reports 3 days of reduced urine output, nausea, and mild leg swelling. Has been taking diclofenac 50mg BD for 2 weeks for knee pain (self-prescribed, not on his regular medications).", "physical_examination": "BP 158/92. Mild periorbital puffiness. No JVP elevation. Lungs clear. Abdomen soft, palpable bladder — post-void residual 50ml. Mild bilateral pitting ankle oedema. Flank tenderness bilateral.", "assessment": "Pre-renal AKI likely precipitated by NSAID use (diclofenac) in setting of ACE inhibitor and poor oral intake. Cr 380, K+ 5.4. Stop nephrotoxins, IV fluids."},
        "lab_orders": [
            {"priority": "STAT", "clinical_notes": "AKI — urgent renal function and potassium", "status": "COMPLETED", "items": [
                {"test_code": "CR", "result": {"numeric_value": Decimal("380"), "result_unit": "µmol/L", "result_flag": "CRITICAL_HIGH", "reference_range_text": "62-106 µmol/L", "interpretation": "Severe AKI (KDIGO Stage 3). Baseline Cr 100. >3× rise.", "is_critical_result": True}},
                {"test_code": "K", "result": {"numeric_value": Decimal("5.4"), "result_unit": "mmol/L", "result_flag": "HIGH", "reference_range_text": "3.5-5.0 mmol/L", "interpretation": "Hyperkalaemia in AKI — monitor ECG, consider calcium gluconate if >6.0"}},
                {"test_code": "BUN", "result": {"numeric_value": Decimal("18.2"), "result_unit": "mmol/L", "result_flag": "HIGH", "reference_range_text": "2.5-7.1 mmol/L", "interpretation": "Markedly elevated urea supporting AKI"}},
                {"test_code": "NA", "result": {"numeric_value": Decimal("134"), "result_unit": "mmol/L", "result_flag": "LOW", "reference_range_text": "136-145 mmol/L", "interpretation": "Mild dilutional hyponatraemia"}},
            ]},
            {"priority": "URGENT", "clinical_notes": "Day 1 repeat renal function", "status": "COMPLETED", "day_offset": 1, "items": [
                {"test_code": "CR", "result": {"numeric_value": Decimal("320"), "result_unit": "µmol/L", "result_flag": "HIGH", "reference_range_text": "62-106 µmol/L", "interpretation": "Improving from 380. AKI responding to IV fluids."}},
                {"test_code": "K", "result": {"numeric_value": Decimal("5.1"), "result_unit": "mmol/L", "result_flag": "HIGH", "reference_range_text": "3.5-5.0 mmol/L"}},
                {"test_code": "EGFR", "result": {"numeric_value": Decimal("14"), "result_unit": "mL/min", "result_flag": "LOW", "reference_range_text": ">90 mL/min", "interpretation": "Severely reduced but improving with hydration"}},
            ]},
            {"priority": "ROUTINE", "clinical_notes": "Day 2 — trend creatinine", "status": "COMPLETED", "day_offset": 2, "items": [
                {"test_code": "CR", "result": {"numeric_value": Decimal("280"), "result_unit": "µmol/L", "result_flag": "HIGH", "reference_range_text": "62-106 µmol/L", "interpretation": "Continuing improvement. 380→320→280."}},
                {"test_code": "K", "result": {"numeric_value": Decimal("4.6"), "result_unit": "mmol/L", "result_flag": "NORMAL", "reference_range_text": "3.5-5.0 mmol/L"}},
            ]},
        ],
        "imaging_orders": [
            {"procedure_code": "USS-ABD", "priority": "URGENT", "clinical_indication": "AKI — rule out obstruction, assess kidney size", "status": "REPORTED", "report": {"findings": "Right kidney 11.2cm, left 10.8cm. Normal cortical thickness. No hydronephrosis bilaterally. No calculi. Bladder post-void residual minimal. Prostate mildly enlarged (estimated 45g).", "impression": "Normal-sized kidneys without obstruction. Findings support pre-renal AKI. Mild prostatomegaly.", "is_critical": False}},
        ],
        "prescriptions": [
            {"clinical_notes": "AKI management — stop nephrotoxins, IV fluids, renal-dose adjustments", "items": [
                {"drug_code": "PCM1G", "quantity": 12, "dosage": "1g", "frequency": "Three times daily", "duration": "As needed", "route": "Oral", "instructions": "For pain — no NSAIDs. Safe in renal impairment at this dose."},
                {"drug_code": "OMEP20", "quantity": 14, "dosage": "20mg", "frequency": "Once daily", "duration": "While inpatient", "route": "Oral", "instructions": "Stress ulcer prophylaxis"},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "DAY", "day_offset": 1, "pending_tasks": "Strict hourly I/O chart. Daily weight. IV NS at 125ml/hr — review rate in morning based on fluid balance. Morning bloods: U&E, Cr, eGFR.", "escalations": "CRITICAL: Cr 380, K+ 5.4. NSAID allergy added — ensure NO NSAIDs prescribed anywhere. Enalapril held until Cr <200."},
            {"shift_ending": "NIGHT", "day_offset": 1, "pending_tasks": "Urine output stable at 50ml/hr. Cr improving 380→320. Continue IV fluids overnight. Remove catheter if output >0.5ml/kg/hr sustained.", "escalations": ""},
        ],
        "rounds": [
            {"day_offset": 1, "condition": "STABLE", "subj": "Urine output improving, still nauseated", "obj": "Cr 380→320 µmol/L, K+ 5.1, urine output 40ml/hr", "assess": "Pre-renal AKI responding to IV fluid resuscitation", "plan": "Continue IV NS at 125ml/hr, strict I/O, recheck U&E in 12h"},
            {"day_offset": 2, "condition": "IMPROVING", "subj": "Nauseated less, voiding well", "obj": "Cr 280, K+ 4.6, urine output 60ml/hr", "assess": "AKI resolving", "plan": "Liberalise fluids, renal diet, recheck tomorrow. If Cr <200 consider discharge."},
        ],
        "kardex": {
            "mobility_status": "Ambulatory to bathroom",
            "dietary_requirements": "Renal diet — low potassium, controlled protein",
            "iv_access": "Left forearm cannula",
            "fall_risk": "MODERATE",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "Elderly male with oliguria, Cr 380, K+ 5.4. Dehydrated. History of NSAID use.",
            "nursing_diagnosis": "Impaired urinary elimination related to pre-renal AKI as evidenced by oliguria (20ml/hr) and elevated creatinine",
            "goal": "Urine output will reach ≥0.5ml/kg/hr (≥40ml/hr) within 24 hours, creatinine trending down",
            "plan": "Strict hourly I/O chart, daily weight, IV fluids as prescribed, urinalysis, report output <30ml/hr immediately",
            "rationale": "Strict I/O monitoring enables early detection of worsening renal function; IV hydration restores renal perfusion in pre-renal AKI",
            "implementation": "Catheterised for accurate output. Hourly I/O documented. IV NS at 125ml/hr. NSAID stopped. Daily bloods drawn.",
            "evaluation": "Output improved to 60ml/hr day 2. Creatinine trending down 380→280. Plan for catheter removal.",
        },
        "shift_notes": [
            {"shift": "DAY", "day_offset": 1, "content": "Catheter in situ. Output 35ml/hr improving to 45ml/hr by afternoon. Cr 320 (down from 380). Patient less nauseated. Taking small amounts of renal diet."},
            {"shift": "NIGHT", "day_offset": 1, "content": "Urine output stable at 50ml/hr. IV running. Slept well. No oedema. Na 138, K 5.1 — rechecked per plan."},
        ],
        "tpr": [
            {"day_offset": 0, "hour": 10, "temp": "36.8", "pulse": 88, "rr": 18},
            {"day_offset": 1, "hour": 8, "temp": "36.6", "pulse": 82, "rr": 16},
            {"day_offset": 2, "hour": 8, "temp": "36.5", "pulse": 76, "rr": 16},
        ],
    },
    # ========== DISCHARGED (2 — normal) ==========
    {
        "ward_type": "MEDICAL",
        "icd": "E11.65",
        "dx_text": "Type 2 DM with hyperglycaemia",
        "complaint": "Polyuria, polydipsia, blurred vision, RBS 28 mmol/L",
        "payer": "CASH",
        "status": "DISCHARGED",
        "days_ago": 10,
        "los": 5,
        "gender": "F",
        "age_range": (40, 60),
        "allergies": [
            {"substance": "Metformin", "substance_type": "medication", "reaction_type": "diarrhea", "severity": "mild", "verification_status": "confirmed", "criticality": "low", "notes": "GI intolerance at higher doses (>1g/day). Tolerate 500mg BD."},
        ],
        "comorbidities": {"chronic_conditions": "Type 2 DM (newly diagnosed this admission), Obesity (BMI 34)", "current_medications": "None prior to admission", "past_surgeries": "Caesarean section ×2 (2012, 2016)", "family_history": "Mother — T2DM on insulin. Sister — gestational DM", "social_history": "Businesswoman, sedentary. No smoking/alcohol. Eats chapati and ugali predominantly."},
        "encounter_vitals": {"temperature": Decimal("36.8"), "pulse": 86, "blood_pressure": "132/84", "respiratory_rate": 18, "spo2": Decimal("98"), "weight": Decimal("88.0"), "height": Decimal("161"), "history_of_present_illness": "52-year-old female presents with 3-week history of polyuria, polydipsia, and blurred vision. Significant weight loss (~5kg). OPD RBS 28 mmol/L. No DKA symptoms (no Kussmaul breathing, no acetone breath). No prior DM diagnosis.", "physical_examination": "Obese (BMI 34). BP 132/84. Dry mucous membranes. Fundi: no diabetic retinopathy. Feet: intact sensation, pedal pulses present. Acanthosis nigricans on neck.", "assessment": "New diagnosis T2DM with hyperglycaemia (RBS 28). No DKA. Start insulin sliding scale, plan transition to premixed insulin."},
        "lab_orders": [
            {"priority": "URGENT", "clinical_notes": "New T2DM — full metabolic panel and HbA1c", "status": "COMPLETED", "items": [
                {"test_code": "RBS", "result": {"numeric_value": Decimal("28.4"), "result_unit": "mmol/L", "result_flag": "CRITICAL_HIGH", "reference_range_text": "3.9-7.8 mmol/L", "interpretation": "Severely elevated random blood sugar. Consistent with uncontrolled T2DM.", "is_critical_result": True}},
                {"test_code": "HBA1C", "result": {"numeric_value": Decimal("11.2"), "result_unit": "%", "result_flag": "HIGH", "reference_range_text": "4.0-5.6%", "interpretation": "HbA1c 11.2% — poor glycaemic control over preceding 3 months. Target <7%."}},
                {"test_code": "CR", "result": {"numeric_value": Decimal("68"), "result_unit": "µmol/L", "result_flag": "NORMAL", "reference_range_text": "44-80 µmol/L"}},
                {"test_code": "K", "result": {"numeric_value": Decimal("4.1"), "result_unit": "mmol/L", "result_flag": "NORMAL", "reference_range_text": "3.5-5.0 mmol/L"}},
            ]},
            {"priority": "ROUTINE", "clinical_notes": "Day 3 — glucose stabilisation check", "status": "COMPLETED", "day_offset": 3, "items": [
                {"test_code": "RBS", "result": {"numeric_value": Decimal("8.4"), "result_unit": "mmol/L", "result_flag": "HIGH", "reference_range_text": "3.9-7.8 mmol/L", "interpretation": "Markedly improved from 28.4 to 8.4 on insulin. Near target."}},
                {"test_code": "EGFR", "result": {"numeric_value": Decimal("92"), "result_unit": "mL/min", "result_flag": "NORMAL", "reference_range_text": ">90 mL/min"}},
            ]},
        ],
        "imaging_orders": [],
        "prescriptions": [
            {"clinical_notes": "Discharge medications for T2DM — insulin + oral", "items": [
                {"drug_code": "MIXT3070", "quantity": 2, "dosage": "30 IU AM / 20 IU PM", "frequency": "Twice daily", "duration": "Ongoing", "route": "Subcutaneous", "instructions": "Inject into abdomen or thigh. Rotate injection sites. Measure before meals."},
                {"drug_code": "METO500", "quantity": 60, "dosage": "500mg", "frequency": "Twice daily", "duration": "Ongoing", "route": "Oral", "instructions": "Take with meals to reduce GI side effects. Maximum tolerated dose for this patient."},
            ]},
        ],
        "handover_notes": [],
        "rounds": [
            {"day_offset": 1, "condition": "STABLE", "subj": "Feeling better, blood sugars 12-15 mmol/L on insulin sliding scale", "obj": "RBS 13.2 mmol/L, no ketones, HbA1c 11.2%", "assess": "Uncontrolled T2DM admitted for stabilisation", "plan": "Initiate basal-bolus insulin, diabetic education, renal screen"},
            {"day_offset": 3, "condition": "IMPROVING", "subj": "Sugars 7-10 mmol/L, appetite good", "obj": "RBS 8.4 mmol/L, eGFR 72", "assess": "Glycaemia stabilising on insulin", "plan": "Switch to premixed insulin, plan discharge tomorrow"},
        ],
        "discharge": {
            "type": "NORMAL",
            "final_icd": "E11.65",
            "final_text": "Type 2 DM with hyperglycaemia — stabilised on insulin",
            "treatment": "IV insulin sliding scale transitioned to subcutaneous premixed insulin. Diabetic diet counselling. HbA1c 11.2%, target <7%.",
            "instructions": "1. Inject Mixtard 30 units AM, 20 units PM before meals.\n2. Check fasting blood sugar daily — target 4-7 mmol/L.\n3. Attend diabetic clinic in 2 weeks.\n4. Return if blood sugar >20 or signs of hypoglycaemia.",
            "meds": [
                {"drug_name": "Insulin Mixtard 30/70", "dosage": "30 IU AM / 20 IU PM", "frequency": "BD", "duration": "Ongoing"},
                {"drug_name": "Metformin", "dosage": "500mg", "frequency": "BD", "duration": "Ongoing"},
            ],
        },
    },
    {
        "ward_type": "SURGICAL",
        "icd": "K80.2",
        "dx_text": "Calculus of gallbladder without cholecystitis",
        "complaint": "Recurrent RUQ pain after fatty meals, ultrasound showed gallstones",
        "payer": "SHA",
        "status": "DISCHARGED",
        "days_ago": 14,
        "los": 3,
        "gender": "F",
        "age_range": (30, 50),
        "allergies": [],
        "comorbidities": {"chronic_conditions": "None", "current_medications": "None", "past_surgeries": "None", "family_history": "Mother — gallstones, cholecystectomy", "social_history": "Nurse, non-smoker, no alcohol. Multiparous (3 children)."},
        "encounter_vitals": {"temperature": Decimal("36.9"), "pulse": 76, "blood_pressure": "120/74", "respiratory_rate": 16, "spo2": Decimal("99"), "weight": Decimal("74.0"), "height": Decimal("164"), "history_of_present_illness": "38-year-old female with 6-month history of recurrent RUQ pain after fatty meals. Pain radiates to right shoulder. Associated nausea. Previous USS confirmed multiple gallstones. Elective laparoscopic cholecystectomy scheduled.", "physical_examination": "Well-nourished, comfortable. Abdomen soft. Mild RUQ tenderness, no guarding. Murphy sign equivocal. No jaundice. No palpable mass.", "assessment": "Symptomatic cholelithiasis for elective laparoscopic cholecystectomy."},
        "lab_orders": [
            {"priority": "ROUTINE", "clinical_notes": "Pre-operative workup", "status": "COMPLETED", "items": [
                {"test_code": "FBC", "result": None},
                {"test_code": "HB", "result": {"numeric_value": Decimal("13.2"), "result_unit": "g/dL", "result_flag": "NORMAL", "reference_range_text": "12.0-16.0 g/dL"}},
                {"test_code": "CR", "result": {"numeric_value": Decimal("58"), "result_unit": "µmol/L", "result_flag": "NORMAL", "reference_range_text": "44-80 µmol/L"}},
            ]},
        ],
        "imaging_orders": [
            {"procedure_code": "USS-ABD", "priority": "ROUTINE", "clinical_indication": "Pre-operative confirmation — cholelithiasis", "status": "REPORTED", "report": {"findings": "Multiple hyperechoic foci in gallbladder with posterior acoustic shadowing. No gallbladder wall thickening. CBD 4mm (normal). No intrahepatic duct dilatation. Liver normal.", "impression": "Cholelithiasis confirmed. No features of cholecystitis. CBD normal calibre.", "is_critical": False}},
        ],
        "prescriptions": [
            {"clinical_notes": "Post-op analgesia and antibiotic prophylaxis", "items": [
                {"drug_code": "CEFT1G", "quantity": 1, "dosage": "1g IV", "frequency": "Stat pre-op", "duration": "Single dose", "route": "Intravenous", "instructions": "Surgical antibiotic prophylaxis — 30 min before incision"},
                {"drug_code": "PCM1G", "quantity": 15, "dosage": "1g", "frequency": "Three times daily", "duration": "5 days", "route": "Oral", "instructions": "Discharge analgesia. Take regularly for first 3 days, then as needed."},
            ]},
        ],
        "handover_notes": [],
        "rounds": [
            {"day_offset": 1, "condition": "STABLE", "subj": "Post-op day 1, mild wound pain, passed flatus", "obj": "T 36.9°C, abdomen soft, laparoscopy ports clean", "assess": "Uncomplicated post-laparoscopic cholecystectomy", "plan": "Start sips, advance diet, early ambulation"},
        ],
        "discharge": {
            "type": "NORMAL",
            "final_icd": "K80.2",
            "final_text": "Cholelithiasis — laparoscopic cholecystectomy performed",
            "treatment": "Laparoscopic cholecystectomy under GA. No intraoperative complications. Histology: chronic cholecystitis.",
            "instructions": "1. Keep port sites clean and dry for 5 days.\n2. Take Paracetamol 1g 8-hourly for pain.\n3. Low-fat diet for 2 weeks, then gradual reintroduction.\n4. Return if fever, wound redness/discharge, or worsening pain.",
            "meds": [
                {"drug_name": "Paracetamol", "dosage": "1g", "frequency": "TDS", "duration": "5 days"},
            ],
        },
    },
    # ========== DECEASED (1) ==========
    {
        "ward_type": "ICU",
        "icd": "I46.9",
        "dx_text": "Cardiac arrest, unspecified",
        "complaint": "Witnessed collapse at home, PEA arrest on arrival",
        "payer": "SHA",
        "status": "DISCHARGED",
        "days_ago": 6,
        "los": 2,
        "gender": "M",
        "age_range": (62, 78),
        "allergies": [],
        "comorbidities": {"chronic_conditions": "Hypertension, Ischaemic heart disease, Chronic kidney disease Stage 3, Atrial fibrillation", "current_medications": "Aspirin 75mg OD, Atorvastatin 40mg ON, Lisinopril 10mg OD, Warfarin (INR target 2-3)", "past_surgeries": "CABG ×3 (2019)", "family_history": "Father — sudden cardiac death age 55", "social_history": "Retired military officer. Ex-smoker (quit after CABG). No alcohol."},
        "encounter_vitals": {"temperature": Decimal("35.2"), "pulse": 0, "blood_pressure": "0/0", "respiratory_rate": 0, "spo2": Decimal("62"), "weight": Decimal("82.0"), "height": Decimal("174"), "history_of_present_illness": "72-year-old male brought by ambulance after witnessed collapse at home. Wife reports sudden unresponsiveness while watching TV. CPR started by first responders. PEA arrest on ED arrival. ROSC achieved after 20 min of CPR and 3 rounds of adrenaline.", "physical_examination": "Post-ROSC: GCS 3 (E1V1M1). Intubated and mechanically ventilated. Pupils fixed and dilated. BP 90/60 on noradrenaline 0.2 mcg/kg/min. Peripheral mottling. Cold extremities.", "assessment": "Cardiac arrest with ROSC. PEA rhythm — likely acute MI on background of IHD. Post-cardiac arrest syndrome. Multi-organ dysfunction. Prognosis very poor."},
        "lab_orders": [
            {"priority": "STAT", "clinical_notes": "Post-cardiac arrest — full workup", "status": "COMPLETED", "items": [
                {"test_code": "TROPI", "result": {"numeric_value": Decimal("85.2"), "result_unit": "ng/mL", "result_flag": "CRITICAL_HIGH", "reference_range_text": "0-0.04 ng/mL", "interpretation": "Massively elevated — extensive myocardial necrosis post arrest", "is_critical_result": True}},
                {"test_code": "K", "result": {"numeric_value": Decimal("6.8"), "result_unit": "mmol/L", "result_flag": "CRITICAL_HIGH", "reference_range_text": "3.5-5.0 mmol/L", "interpretation": "Life-threatening hyperkalaemia. Treat urgently with calcium gluconate, insulin-dextrose.", "is_critical_result": True}},
                {"test_code": "CR", "result": {"numeric_value": Decimal("420"), "result_unit": "µmol/L", "result_flag": "CRITICAL_HIGH", "reference_range_text": "62-106 µmol/L", "interpretation": "AKI on CKD. No urine output.", "is_critical_result": True}},
                {"test_code": "HB", "result": {"numeric_value": Decimal("9.8"), "result_unit": "g/dL", "result_flag": "LOW", "reference_range_text": "13.0-17.0 g/dL", "interpretation": "Anaemia of chronic disease"}},
            ]},
        ],
        "imaging_orders": [
            {"procedure_code": "CXR", "priority": "STAT", "clinical_indication": "Post-intubation CXR — verify ETT position, assess for pulmonary oedema", "status": "REPORTED", "report": {"findings": "ETT tip 3cm above carina — satisfactory position. Bilateral diffuse airspace opacification. Cardiomegaly. Sternotomy wires and CABG clips noted. No pneumothorax.", "impression": "Satisfactory ETT position. Bilateral pulmonary oedema/ARDS. Known cardiomegaly post-CABG.", "is_critical": True}},
            {"procedure_code": "ECG", "priority": "STAT", "clinical_indication": "Post-ROSC — assess rhythm and ST changes", "status": "COMPLETED"},
        ],
        "prescriptions": [
            {"clinical_notes": "ICU critical care — vasopressor support, organ protection", "items": [
                {"drug_code": "NORAD", "quantity": 10, "dosage": "4mg in 50mL NS", "frequency": "Continuous infusion", "duration": "As needed", "route": "Intravenous", "instructions": "Titrate to MAP >65. Via CVC only."},
                {"drug_code": "HEPARIN", "quantity": 4, "dosage": "5000 IU SC", "frequency": "Every 12 hours", "duration": "While immobile", "route": "Subcutaneous", "instructions": "DVT prophylaxis. Hold if active bleeding."},
                {"drug_code": "OMEP20", "quantity": 4, "dosage": "40mg IV", "frequency": "Once daily", "duration": "While intubated", "route": "Intravenous", "instructions": "Stress ulcer prophylaxis"},
            ]},
        ],
        "handover_notes": [
            {"shift_ending": "DAY", "day_offset": 1, "pending_tasks": "Hourly neuro obs. Noradrenaline at 0.3 mcg/kg/min. Ventilator FiO2 60%, PEEP 10. Recheck ABG at 1800h. Repeat U&E for K+ trend. Family meeting at 1600h — goals of care discussion.", "escalations": "CRITICAL: K+ 6.8 — treated with calcium gluconate and insulin-dextrose. Repeat in 4h. GCS remains 3. Fixed dilated pupils. Poor prognosis communicated to family by ICU consultant."},
        ],
        "rounds": [
            {"day_offset": 1, "condition": "CRITICAL", "subj": "Intubated, sedated, on vasopressor support", "obj": "GCS 3T, BP 90/60 on noradrenaline 0.3mcg/kg/min, mech ventilated FiO2 60%, pH 7.18, lactate 8.2", "assess": "Post-cardiac arrest, multi-organ dysfunction. Poor neurological prognosis.", "plan": "Continue organ support, family meeting for goals of care discussion"},
        ],
        "discharge": {
            "type": "DECEASED",
            "final_icd": "I46.9",
            "final_text": "Cardiac arrest — refractory multi-organ failure despite maximal ICU support",
            "treatment": "CPR ×20 min with ROSC. Intubated and mechanically ventilated. Vasopressor support. Despite maximal therapy, progressive deterioration. Pronounced dead at 0847h day 2.",
            "instructions": "",
            "meds": [],
        },
    },
]


class Command(BaseCommand):
    help = "Seed comprehensive inpatient demo data with deep clinical records"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing demo inpatient data before seeding",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without writing to the database",
        )

    def handle(self, *args, **options):
        clear = options["clear"]
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.NOTICE("DRY RUN — no data will be written\n"))

        with transaction.atomic():
            if clear and not dry_run:
                self._clear_demo_data()
            elif clear and dry_run:
                count = Patient.objects.filter(phone_number__startswith="demo-ipd-").count()
                self.stdout.write(self.style.WARNING(f"Would clear {count} demo patients and related data"))

            user = self._get_or_create_user()
            doctor = self._get_or_create_doctor()
            incoming_nurse = self._get_or_create_incoming_nurse()
            county, sub_county = self._get_or_create_location()
            wards = self._ensure_wards()
            test_catalog = self._ensure_test_catalog()
            drugs = self._ensure_drugs()
            imaging_procs = self._ensure_imaging_procedures()
            cds_rules = self._ensure_cds_rules(user)

            created = {
                "patients": 0,
                "allergies": 0,
                "admissions": 0,
                "rounds": 0,
                "transfers": 0,
                "discharges": 0,
                "kardex_updates": 0,
                "care_plans": 0,
                "shift_notes": 0,
                "tpr_readings": 0,
                "lab_orders": 0,
                "lab_results": 0,
                "imaging_orders": 0,
                "radiology_reports": 0,
                "prescriptions": 0,
                "prescription_items": 0,
                "handover_notes": 0,
                "shift_handovers": 0,
                "cds_alerts": 0,
                "supervisor_alerts": 0,
            }

            for i, scenario in enumerate(SCENARIOS):
                self.stdout.write(f"  Scenario {i + 1}/{len(SCENARIOS)}: {scenario['dx_text'][:50]}...")

                # Idempotency: skip if this scenario's patient already exists
                demo_tag = f"demo-ipd-{i:04d}"
                if Patient.objects.filter(phone_number=demo_tag).exists():
                    self.stdout.write(self.style.NOTICE("    Already seeded, skipping"))
                    continue

                ward = wards[scenario["ward_type"]]
                bed = self._get_available_bed(ward, scenario["status"])
                if not bed:
                    self.stdout.write(self.style.WARNING(f"    No available bed in {ward.name}, skipping"))
                    continue

                scenario["_demo_tag"] = demo_tag

                # Dry run: just tally what would be created
                if dry_run:
                    self._tally_dry_run(scenario, created)
                    continue

                patient = self._create_patient(scenario, county, sub_county)
                created["patients"] += 1

                # --- Allergies ---
                for allergy_def in scenario.get("allergies", []):
                    Allergy.objects.create(
                        patient=patient,
                        substance=allergy_def["substance"],
                        substance_type=allergy_def["substance_type"],
                        reaction_type=allergy_def["reaction_type"],
                        severity=allergy_def["severity"],
                        verification_status=allergy_def["verification_status"],
                        criticality=allergy_def.get("criticality", "unable_to_assess"),
                        notes=allergy_def.get("notes", ""),
                        status="active",
                        recorded_by=user,
                    )
                    created["allergies"] += 1

                # --- IPD Encounter with vitals & SOAP ---
                admission_date = timezone.now() - timedelta(days=scenario["days_ago"])
                ev = scenario.get("encounter_vitals", {})
                ipd_encounter = Encounter.objects.create(
                    patient=patient,
                    encounter_type="IPD",
                    encounter_date=admission_date.date(),
                    chief_complaint=scenario["complaint"],
                    status="IN_PROGRESS" if scenario["status"] == "ACTIVE" else "CLOSED",
                    created_by=user,
                    # Vitals
                    temperature=ev.get("temperature"),
                    pulse=ev.get("pulse"),
                    blood_pressure=ev.get("blood_pressure", ""),
                    respiratory_rate=ev.get("respiratory_rate"),
                    spo2=ev.get("spo2"),
                    weight=ev.get("weight"),
                    height=ev.get("height"),
                    # SOAP
                    history_of_present_illness=ev.get("history_of_present_illness", ""),
                    physical_examination=ev.get("physical_examination", ""),
                    assessment=ev.get("assessment", ""),
                )

                # --- Comorbidities on encounter ---
                comorbid = scenario.get("comorbidities", {})
                if comorbid:
                    ipd_encounter.chronic_conditions = comorbid.get("chronic_conditions", "")
                    ipd_encounter.current_medications = comorbid.get("current_medications", "")
                    ipd_encounter.past_surgeries = comorbid.get("past_surgeries", "")
                    ipd_encounter.family_history = comorbid.get("family_history", "")
                    ipd_encounter.social_history = comorbid.get("social_history", "")
                    ipd_encounter.save(update_fields=[
                        "chronic_conditions", "current_medications",
                        "past_surgeries", "family_history", "social_history",
                    ])

                # --- Admission ---
                admission = Admission(
                    patient=patient,
                    ipd_encounter=ipd_encounter,
                    admission_date=admission_date,
                    admitting_diagnosis=scenario["icd"],
                    admitting_diagnosis_text=scenario["dx_text"],
                    admitting_officer=user,
                    attending_doctor=doctor,
                    ward=ward,
                    bed=bed,
                    admission_status=scenario["status"],
                    payer_type=scenario["payer"],
                )
                admission.save()
                created["admissions"] += 1

                # --- Lab orders with items & results ---
                for lab_def in scenario.get("lab_orders", []):
                    day_offset = lab_def.get("day_offset", 0)
                    order_date = admission_date + timedelta(days=day_offset)
                    lab_order = LabOrder.objects.create(
                        patient=patient,
                        encounter=ipd_encounter,
                        admission=admission,
                        ordered_by=doctor,
                        priority=lab_def["priority"],
                        clinical_notes=lab_def.get("clinical_notes", ""),
                        status=lab_def["status"],
                    )
                    created["lab_orders"] += 1
                    for item_def in lab_def.get("items", []):
                        test = test_catalog.get(item_def["test_code"])
                        if not test:
                            continue
                        lab_item = LabOrderItem.objects.create(
                            lab_order=lab_order,
                            test=test,
                            status="COMPLETED" if item_def.get("result") else "PENDING",
                            unit_cost=test.cost,
                        )
                        result_def = item_def.get("result")
                        if result_def:
                            LabResult.objects.create(
                                order_item=lab_item,
                                numeric_value=result_def.get("numeric_value"),
                                text_value=result_def.get("text_value", ""),
                                result_unit=result_def.get("result_unit", ""),
                                result_flag=result_def.get("result_flag", ""),
                                reference_range_text=result_def.get("reference_range_text", ""),
                                interpretation=result_def.get("interpretation", ""),
                                is_critical_result=result_def.get("is_critical_result", False),
                                entered_by=user,
                                verification_status="VERIFIED",
                                verified_by=doctor,
                                verified_at=order_date + timedelta(hours=4),
                            )
                            created["lab_results"] += 1

                # --- Imaging orders with reports ---
                for img_def in scenario.get("imaging_orders", []):
                    proc = imaging_procs.get(img_def["procedure_code"])
                    if not proc:
                        continue
                    img_order = ImagingOrder.objects.create(
                        patient=patient,
                        encounter=ipd_encounter,
                        admission=admission,
                        ordered_by=doctor,
                        priority=img_def["priority"],
                        clinical_indication=img_def["clinical_indication"],
                        status=img_def["status"],
                        total_cost=proc.cost,
                    )
                    ImagingOrderItem.objects.create(
                        order=img_order,
                        procedure=proc,
                        unit_cost=proc.cost,
                        is_completed=img_def["status"] in ("COMPLETED", "REPORTED"),
                        completed_at=admission_date + timedelta(hours=3) if img_def["status"] in ("COMPLETED", "REPORTED") else None,
                    )
                    created["imaging_orders"] += 1

                    report_def = img_def.get("report")
                    if report_def and img_def["status"] == "REPORTED":
                        RadiologyReport.objects.create(
                            imaging_order=img_order,
                            findings=report_def["findings"],
                            impression=report_def["impression"],
                            status="FINAL",
                            is_critical=report_def.get("is_critical", False),
                            reported_by=doctor,
                            signed_at=admission_date + timedelta(hours=5),
                        )
                        created["radiology_reports"] += 1

                # --- Prescriptions ---
                for rx_def in scenario.get("prescriptions", []):
                    prescription = Prescription.objects.create(
                        patient=patient,
                        encounter=ipd_encounter,
                        admission=admission,
                        prescribed_by=doctor,
                        valid_until=(admission_date + timedelta(days=30)).date(),
                        clinical_notes=rx_def.get("clinical_notes", ""),
                        status="PENDING",
                    )
                    created["prescriptions"] += 1
                    for item_def in rx_def.get("items", []):
                        drug = drugs.get(item_def["drug_code"])
                        if not drug:
                            continue
                        PrescriptionItem.objects.create(
                            prescription=prescription,
                            drug=drug,
                            quantity=item_def["quantity"],
                            dosage=item_def["dosage"],
                            frequency=item_def["frequency"],
                            duration=item_def.get("duration", ""),
                            route=item_def.get("route", ""),
                            instructions=item_def.get("instructions", ""),
                        )
                        created["prescription_items"] += 1

                # --- Ward rounds ---
                for rd in scenario.get("rounds", []):
                    round_date = (admission_date + timedelta(days=rd["day_offset"])).date()
                    if round_date > date.today():
                        continue
                    WardRound.objects.create(
                        admission=admission,
                        round_date=round_date,
                        round_time="08:30",
                        conducted_by=doctor,
                        review_type="WARD_ROUND",
                        subjective=rd["subj"],
                        objective=rd["obj"],
                        assessment=rd["assess"],
                        plan=rd["plan"],
                        condition_status=rd["condition"],
                    )
                    created["rounds"] += 1

                # --- Nursing Kardex update ---
                kardex_data = scenario.get("kardex")
                if kardex_data:
                    try:
                        kardex = admission.kardex
                    except NursingKardex.DoesNotExist:
                        kardex = NursingKardex.objects.create(admission=admission)
                    for field, value in kardex_data.items():
                        setattr(kardex, field, value)
                    kardex.save()
                    created["kardex_updates"] += 1

                    # --- Nursing care plan entry ---
                    cp = scenario.get("care_plan")
                    if cp:
                        NursingCarePlanEntry.objects.create(
                            kardex=kardex,
                            recorded_at=admission_date + timedelta(hours=2),
                            recorded_by=user,
                            assessment=cp["assessment"],
                            nursing_diagnosis=cp["nursing_diagnosis"],
                            goal_and_outcome_criteria=cp["goal"],
                            plan_of_action=cp["plan"],
                            scientific_rationale=cp["rationale"],
                            implementation=cp.get("implementation", ""),
                            evaluation=cp.get("evaluation", ""),
                            status="ACTIVE" if scenario["status"] == "ACTIVE" else "RESOLVED",
                        )
                        created["care_plans"] += 1

                    # --- Shift notes ---
                    for sn in scenario.get("shift_notes", []):
                        note_time = admission_date + timedelta(days=sn["day_offset"])
                        if sn["shift"] == "DAY":
                            note_time = note_time.replace(hour=14, minute=0)
                        else:
                            note_time = note_time.replace(hour=22, minute=0)
                        if note_time.date() > date.today():
                            continue
                        KardexShiftNote.objects.create(
                            kardex=kardex,
                            shift=sn["shift"],
                            nurse=user,
                            content=sn["content"],
                        )
                        created["shift_notes"] += 1

                    # --- Kardex handover notes (bed-level, nurse-to-nurse) ---
                    for ho in scenario.get("handover_notes", []):
                        ho_time = admission_date + timedelta(days=ho["day_offset"])
                        if ho_time.date() > date.today():
                            continue
                        KardexHandoverNote.objects.create(
                            kardex=kardex,
                            outgoing_nurse=user,
                            incoming_nurse=incoming_nurse,
                            shift_ending=ho["shift_ending"],
                            pending_tasks=ho["pending_tasks"],
                            escalations=ho.get("escalations", ""),
                            acknowledged_at=ho_time + timedelta(minutes=15),
                        )
                        created["handover_notes"] += 1

                # --- TPR readings ---
                for tpr in scenario.get("tpr", []):
                    reading_time = admission_date + timedelta(days=tpr["day_offset"], hours=tpr["hour"])
                    if reading_time.date() > date.today():
                        continue
                    TemperatureReading.objects.create(
                        admission=admission,
                        recorded_at=reading_time,
                        recorded_by=user,
                        temperature=Decimal(tpr["temp"]),
                        pulse=tpr.get("pulse"),
                        respiratory_rate=tpr.get("rr"),
                    )
                    created["tpr_readings"] += 1

                # --- Transfer ---
                transfer_data = scenario.get("transfer")
                if transfer_data:
                    dest_ward = wards.get(transfer_data["dest_ward_type"])
                    dest_bed = self._get_available_bed(dest_ward, "ACTIVE") if dest_ward else None
                    if dest_ward and dest_bed:
                        transfer_dt = admission_date + timedelta(days=transfer_data["day_offset"])
                        if transfer_dt.date() <= date.today():
                            Transfer.objects.create(
                                admission=admission,
                                source_ward=ward,
                                source_bed=bed,
                                destination_ward=dest_ward,
                                destination_bed=dest_bed,
                                reason=transfer_data["reason"],
                                reason_details=transfer_data["details"],
                                transferred_by=user,
                                transfer_date=transfer_dt,
                                clinical_handover_notes=transfer_data["handover"],
                            )
                            admission.ward = dest_ward
                            admission.bed = dest_bed
                            admission.save(update_fields=["ward", "bed"])
                            created["transfers"] += 1

                # --- Discharge ---
                discharge_data = scenario.get("discharge")
                if discharge_data:
                    discharge_dt = admission_date + timedelta(days=scenario.get("los", 3))
                    Discharge.objects.create(
                        admission=admission,
                        discharge_type=discharge_data["type"],
                        discharge_date=discharge_dt,
                        discharged_by=user,
                        admission_diagnosis=scenario["icd"],
                        final_diagnosis=discharge_data["final_icd"],
                        final_diagnosis_text=discharge_data["final_text"],
                        treatment_summary=discharge_data["treatment"],
                        patient_instructions=discharge_data["instructions"],
                        discharge_medications=discharge_data.get("meds", []),
                        follow_up_date=(discharge_dt + timedelta(days=14)).date() if discharge_data["type"] != "DECEASED" else None,
                        follow_up_instructions="Review at OPD clinic" if discharge_data["type"] != "DECEASED" else "",
                        pharmacy_cleared=True,
                        billing_cleared=True,
                        lab_results_acknowledged=True,
                    )
                    created["discharges"] += 1

                # --- CDS alerts for critical results ---
                created["cds_alerts"] += self._create_cds_alerts(
                    scenario, patient, ipd_encounter, doctor, cds_rules,
                )

            # --- Ward-level shift handovers (one per active ward) ---
            if not dry_run:
                created["shift_handovers"] += self._create_ward_shift_handovers(
                    wards, user, incoming_nurse,
                )

            # --- Supervisor alert acknowledgments (ICU patients) ---
            if not dry_run:
                created["supervisor_alerts"] += self._create_supervisor_alerts(doctor)

            self.stdout.write("")
            label = "Would create (dry run):" if dry_run else "Inpatient demo data seeded:"
            self.stdout.write(self.style.SUCCESS(label))
            for key, count in created.items():
                if count > 0:
                    self.stdout.write(f"  {key}: {count}")

    # -----------------------------------------------------------------------
    # Dry-run tally
    # -----------------------------------------------------------------------

    def _tally_dry_run(self, scenario, created):
        """Estimate what would be created without writing to DB."""
        created["patients"] += 1
        created["admissions"] += 1
        created["allergies"] += len(scenario.get("allergies", []))
        created["rounds"] += len([
            rd for rd in scenario.get("rounds", [])
            if (timezone.now() - timedelta(days=scenario["days_ago"]) + timedelta(days=rd["day_offset"])).date() <= date.today()
        ])
        if scenario.get("discharge"):
            created["discharges"] += 1
        if scenario.get("transfer"):
            created["transfers"] += 1
        if scenario.get("kardex"):
            created["kardex_updates"] += 1
        if scenario.get("care_plan"):
            created["care_plans"] += 1
        created["shift_notes"] += len(scenario.get("shift_notes", []))
        created["tpr_readings"] += len(scenario.get("tpr", []))
        for lab_def in scenario.get("lab_orders", []):
            created["lab_orders"] += 1
            for item_def in lab_def.get("items", []):
                if item_def.get("result"):
                    created["lab_results"] += 1
        for img_def in scenario.get("imaging_orders", []):
            created["imaging_orders"] += 1
            if img_def.get("report"):
                created["radiology_reports"] += 1
        for rx_def in scenario.get("prescriptions", []):
            created["prescriptions"] += 1
            created["prescription_items"] += len(rx_def.get("items", []))
        created["handover_notes"] += len(scenario.get("handover_notes", []))

    # -----------------------------------------------------------------------
    # CDS alerts
    # -----------------------------------------------------------------------

    def _create_cds_alerts(self, scenario, patient, encounter, doctor, cds_rules):
        """Create CDS alerts for critical lab values and drug-allergy interactions."""
        count = 0
        # Critical lab alerts
        critical_lab_rule = cds_rules.get("CRITICAL_LAB")
        if critical_lab_rule:
            for lab_def in scenario.get("lab_orders", []):
                for item_def in lab_def.get("items", []):
                    result = item_def.get("result")
                    if result and result.get("is_critical_result"):
                        CDSAlert.objects.create(
                            rule=critical_lab_rule,
                            patient=patient,
                            encounter=encounter,
                            priority="CRITICAL",
                            status="ACKNOWLEDGED",
                            message=f"Critical lab result: {item_def['test_code']} — {result.get('interpretation', 'Critical value detected')}",
                            suggestion="Notify attending physician immediately. Document communication.",
                            details={"test_code": item_def["test_code"], "value": str(result.get("numeric_value", result.get("text_value", "")))},
                            resolved_by=doctor,
                            resolved_at=timezone.now() - timedelta(hours=1),
                            triggered_by=doctor,
                        )
                        count += 1

        # Drug-allergy alerts
        drug_allergy_rule = cds_rules.get("DRUG_ALLERGY")
        if drug_allergy_rule and scenario.get("allergies"):
            for allergy in scenario["allergies"]:
                if allergy["substance_type"] == "medication" and allergy["severity"] in ("moderate", "severe", "life_threatening"):
                    CDSAlert.objects.create(
                        rule=drug_allergy_rule,
                        patient=patient,
                        encounter=encounter,
                        priority="HIGH",
                        status="ACKNOWLEDGED",
                        message=f"Drug allergy alert: Patient has {allergy['severity']} allergy to {allergy['substance']} ({allergy['reaction_type']}). {allergy.get('notes', '')}",
                        suggestion=f"Avoid {allergy['substance']} and related compounds. Check cross-reactivity.",
                        details={"substance": allergy["substance"], "severity": allergy["severity"], "reaction": allergy["reaction_type"]},
                        resolved_by=doctor,
                        resolved_at=timezone.now() - timedelta(hours=2),
                        triggered_by=doctor,
                    )
                    count += 1
        return count

    # -----------------------------------------------------------------------
    # Ward-level shift handovers
    # -----------------------------------------------------------------------

    def _create_ward_shift_handovers(self, wards, outgoing_nurse, incoming_nurse):
        """Create recent shift handovers for each active ward."""
        count = 0
        ward_notes = {
            "MEDICAL": "2 new admissions (pneumonia, AKI). 1 pending discharge (DM stabilised). 14 total patients. Dr Wanjala to review AKI patient Cr trend in morning.",
            "SURGICAL": "1 post-appendicectomy day 1 — progressing well. 1 pending discharge (cholecystectomy). 10 total patients. Theatre list tomorrow: 2 cases.",
            "PEDIATRIC": "1 AGE with dehydration — improving on ORS. 8 total patients. Ensure strict I/O for bed 3. No critical cases.",
            "ICU": "1 post-STEMI transferring to medical ward tomorrow. 1 cardiac arrest — poor prognosis, family meeting done. 4 total patients. 2 ventilated.",
            "MATERNITY": "1 SVD overnight — mother and baby well. Baby BCG/OPV-0 given. 12 total patients. 2 in early labour being monitored.",
            "ISOLATION": "1 typhoid (confirmed Salmonella typhi) — afebrile 48h, transferring out tomorrow. Contact precautions in effect. 3 total patients.",
        }
        handover_date = date.today() - timedelta(days=1)
        for wtype, ward in wards.items():
            notes = ward_notes.get(wtype, "No significant events this shift.")
            # Idempotency: skip if handover already exists
            if ShiftHandover.objects.filter(ward=ward, shift_date=handover_date, shift_ending="DAY").exists():
                continue
            ShiftHandover.objects.create(
                ward=ward,
                shift_date=handover_date,
                shift_ending="DAY",
                outgoing_nurse=outgoing_nurse,
                incoming_nurse=incoming_nurse,
                total_patients=random.randint(4, 16),
                critical_patients=1 if wtype == "ICU" else 0,
                new_admissions=random.randint(0, 2),
                discharges_pending=random.randint(0, 2),
                general_notes=notes,
                acknowledged_at=timezone.now() - timedelta(hours=12),
            )
            count += 1
        return count

    # -----------------------------------------------------------------------
    # Supervisor alert acknowledgments
    # -----------------------------------------------------------------------

    def _create_supervisor_alerts(self, doctor):
        """Create supervisor alert acknowledgments for ICU admissions."""
        count = 0
        icu_admissions = Admission.objects.filter(
            patient__phone_number__startswith="demo-ipd-",
            ward__ward_type="ICU",
        ).exclude(alert_acknowledgment__isnull=False)
        for admission in icu_admissions:
            try:
                SupervisorAlertAcknowledgment.objects.create(
                    admission=admission,
                    acknowledged_by=doctor,
                    notes="ICU admission reviewed. Critical care plan approved. Continue current management.",
                )
                count += 1
            except Exception:
                pass  # Skip if already acknowledged
        return count

    # -----------------------------------------------------------------------
    # Reference data helpers
    # -----------------------------------------------------------------------

    def _ensure_test_catalog(self) -> dict:
        """Ensure lab test catalog entries exist; return code→instance mapping."""
        catalog = {}
        for code, name, category, specimen, result_type, unit, male_range, female_range, cost in TEST_CATALOG_DEFS:
            test = TestCatalog.objects.filter(code=code).first()
            if not test:
                test = TestCatalog.objects.create(
                    code=code,
                    name=name,
                    short_name=code,
                    category=category,
                    specimen_type=specimen,
                    result_type=result_type,
                    result_unit=unit,
                    normal_range_male=male_range,
                    normal_range_female=female_range,
                    cost=cost,
                    is_active=True,
                )
            catalog[code] = test
        return catalog

    def _ensure_drugs(self) -> dict:
        """Ensure drug catalog entries exist; return code→instance mapping."""
        drug_map = {}
        for code, generic_name, form, strength, unit, categories, schedule, is_essential, cost in DRUG_DEFS:
            drug = Drug.objects.filter(code=code).first()
            if not drug:
                drug = Drug.objects.create(
                    code=code,
                    generic_name=generic_name,
                    form=form,
                    strength=strength,
                    unit=unit,
                    categories=categories,
                    schedule=schedule,
                    is_essential=is_essential,
                    reference_price=cost,
                )
            drug_map[code] = drug
        return drug_map

    def _ensure_imaging_procedures(self) -> dict:
        """Ensure imaging procedure catalog entries exist; return code→instance mapping."""
        proc_map = {}
        for code, name, modality, body_region, cost, requires_contrast in IMAGING_PROCEDURE_DEFS:
            proc = ImagingProcedure.objects.filter(code=code).first()
            if not proc:
                proc = ImagingProcedure.objects.create(
                    code=code,
                    name=name,
                    modality=modality,
                    body_region=body_region,
                    cost=cost,
                    requires_contrast=requires_contrast,
                    is_active=True,
                )
            proc_map[code] = proc
        return proc_map

    def _ensure_cds_rules(self, user) -> dict:
        """Ensure CDS rules exist for demo alerts; return category→rule mapping."""
        rules = {}
        rule_defs = [
            ("CRITICAL_LAB", "CDS-CRIT-LAB-001", "Critical Lab Value Alert",
             "Alerts when lab results fall in critical ranges requiring immediate intervention",
             "CRITICAL_LAB", "CRITICAL", "ALERT",
             "Critical lab result detected: {test_code}. Immediate physician notification required.",
             "Notify attending physician immediately. Document time of notification and recipient.",
             {"type": "lab_range", "trigger": "critical_flag"}),
            ("DRUG_ALLERGY", "CDS-DRUG-ALLRG-001", "Drug-Allergy Interaction Alert",
             "Alerts when a drug is prescribed to a patient with a documented allergy to that drug or class",
             "DRUG_ALLERGY", "HIGH", "CONTRAINDICATE",
             "Drug-allergy interaction: Patient has documented allergy to {substance}.",
             "Discontinue or substitute the offending drug. Verify allergy history with patient.",
             {"type": "drug_allergy", "check": "substance_match"}),
        ]
        for key, code, name, description, category, priority, action_type, action_message, suggestion, condition in rule_defs:
            rule = CDSRule.objects.filter(code=code).first()
            if not rule:
                rule = CDSRule.objects.create(
                    code=code,
                    name=name,
                    description=description,
                    category=category,
                    priority=priority,
                    status="ACTIVE",
                    condition=condition,
                    action_type=action_type,
                    action_message=action_message,
                    suggestion=suggestion,
                    created_by=user,
                    approved_by=user,
                    approved_at=timezone.now() - timedelta(days=30),
                )
            rules[key] = rule
        return rules

    # -----------------------------------------------------------------------
    # Core data helpers
    # -----------------------------------------------------------------------

    def _clear_demo_data(self):
        """Remove demo inpatient records created by previous runs."""
        from django.db import connection

        demo_patients = Patient.objects.filter(phone_number__startswith="demo-ipd-")
        count = demo_patients.count()
        if count:
            patient_ids = list(demo_patients.values_list("id", flat=True))

            # Collect all models that reference Patient via PROTECT.
            # Delete in reverse-dependency order to avoid ProtectedError.
            # We import lazily so the command works even if some apps
            # aren't installed yet.
            protect_deletions: list[tuple[str, object]] = []
            models_to_try = [
                ("billing.Invoice", lambda pids: __import__("hmis.apps.billing.models", fromlist=["Invoice"]).Invoice.objects.filter(encounter__patient_id__in=pids)),
                ("billing.Receipt", lambda pids: __import__("hmis.apps.billing.models", fromlist=["Receipt"]).Receipt.objects.filter(patient_id__in=pids)),
                ("billing.CreditNote", lambda pids: __import__("hmis.apps.billing.models", fromlist=["CreditNote"]).CreditNote.objects.filter(patient_id__in=pids)),
                ("billing.SHAClaim", lambda pids: __import__("hmis.apps.billing.models", fromlist=["SHAClaim"]).SHAClaim.objects.filter(patient_id__in=pids)),
                ("mch.ImmunizationRecord", lambda pids: __import__("hmis.apps.mch.models", fromlist=["ImmunizationRecord"]).ImmunizationRecord.objects.filter(patient_id__in=pids)),
                ("pharmacy.Dispensing", lambda pids: __import__("hmis.apps.pharmacy.models", fromlist=["Dispensing"]).Dispensing.objects.filter(patient_id__in=pids)),
            ]
            for label, qs_fn in models_to_try:
                try:
                    qs_fn(patient_ids).delete()
                except Exception:
                    pass  # Model may not exist or table missing

            # Standard direct-FK deletions
            CDSAlert.objects.filter(patient_id__in=patient_ids).delete()
            Prescription.objects.filter(patient_id__in=patient_ids).delete()
            LabOrder.objects.filter(patient_id__in=patient_ids).delete()
            ImagingOrder.objects.filter(patient_id__in=patient_ids).delete()
            Allergy.objects.filter(patient_id__in=patient_ids).delete()
            Admission.objects.filter(patient_id__in=patient_ids).delete()
            Encounter.objects.filter(patient_id__in=patient_ids).delete()
            demo_patients.delete()
            self.stdout.write(self.style.WARNING(f"Cleared {count} demo patients and related data"))
        else:
            self.stdout.write("No existing demo data to clear")

    def _get_or_create_user(self):
        return User.objects.filter(is_staff=True).first() or User.objects.create_user(
            username="demo_nurse",
            password="demo_nurse_pass",  # noqa: S106
            first_name="Demo",
            last_name="Nurse",
            is_staff=True,
        )

    def _get_or_create_doctor(self):
        doc = User.objects.filter(is_staff=True).exclude(username="demo_nurse").first()
        if doc:
            return doc
        return User.objects.create_user(
            username="demo_doctor",
            password="demo_doctor_pass",  # noqa: S106
            first_name="Dr",
            last_name="Wanjala",
            is_staff=True,
        )

    def _get_or_create_incoming_nurse(self):
        """Get or create a second nurse for handover recipients."""
        nurse = User.objects.filter(username="demo_nurse_incoming").first()
        if nurse:
            return nurse
        return User.objects.create_user(
            username="demo_nurse_incoming",
            password="demo_nurse_incoming_pass",  # noqa: S106
            first_name="Grace",
            last_name="Njeri",
            is_staff=True,
        )

    def _get_or_create_location(self):
        county = County.objects.first()
        if not county:
            county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.filter(county=county).first()
        if not sub_county:
            sub_county = SubCounty.objects.create(county=county, name="Mvita")
        return county, sub_county

    def _ensure_wards(self) -> dict:
        """Ensure one ward per type exists; return mapping.

        Prefers wards with gender_restriction=ANY that have available beds
        so that both male and female patients can be admitted.
        """
        ward_defs = [
            ("MEDICAL", "Medical Ward", "MED-01", Decimal("1500.00"), 20),
            ("SURGICAL", "Surgical Ward", "SUR-01", Decimal("2000.00"), 15),
            ("PEDIATRIC", "Paediatric Ward", "PED-01", Decimal("1200.00"), 12),
            ("MATERNITY", "Maternity Ward", "MAT-01", Decimal("1000.00"), 16),
            ("ICU", "Intensive Care Unit", "ICU-01", Decimal("8000.00"), 6),
            ("ISOLATION", "Isolation Ward", "ISO-01", Decimal("3000.00"), 8),
        ]
        wards = {}
        for wtype, name, code, rate, cap in ward_defs:
            ward = Ward.objects.filter(name=name).first()
            if not ward:
                # Prefer ANY-gender wards with available beds
                ward = (
                    Ward.objects.filter(ward_type=wtype, gender_restriction="ANY")
                    .filter(beds__status="AVAILABLE")
                    .distinct()
                    .first()
                )
            if not ward:
                ward = Ward.objects.filter(ward_type=wtype).first()
            if not ward:
                ward = Ward.objects.create(
                    name=name,
                    code=code,
                    ward_type=wtype,
                    capacity=cap,
                    daily_rate=rate,
                    is_active=True,
                )
            wards[wtype] = ward
        return wards

    def _get_available_bed(self, ward, admission_status):
        """Get an available bed, or a discharged bed for discharged scenarios."""
        bed = ward.beds.filter(status="AVAILABLE").first()
        if not bed and admission_status != "ACTIVE":
            bed = ward.beds.first()
        return bed

    def _create_patient(self, scenario, county, sub_county) -> Patient:
        gender = scenario["gender"]
        age_lo, age_hi = scenario["age_range"]
        age = random.randint(age_lo, age_hi)
        dob = date.today() - timedelta(days=age * 365 + random.randint(0, 364))

        first_name = random.choice(FIRST_NAMES_M if gender == "M" else FIRST_NAMES_F)
        last_name = random.choice(LAST_NAMES)

        return Patient.objects.create(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=dob,
            gender=gender,
            county=county,
            sub_county=sub_county,
            phone_number=scenario["_demo_tag"],
        )
