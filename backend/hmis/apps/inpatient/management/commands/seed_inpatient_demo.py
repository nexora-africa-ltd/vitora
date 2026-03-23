"""
Management command to seed comprehensive inpatient demo data.

Creates realistic admissions, ward rounds, transfers, and discharges
covering all ward types, payer types, admission statuses, and clinical
workflows. Uses authentic Kenyan names (no "Demo" suffixes).

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

from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.inpatient.models import (
    Admission,
    Bed,
    Discharge,
    KardexShiftNote,
    NursingCarePlanEntry,
    NursingKardex,
    TemperatureReading,
    Transfer,
    Ward,
    WardRound,
)
from hmis.apps.patients.models import Patient

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
# Clinical scenario definitions
# Distribution: 7 ACTIVE, 2 DISCHARGED, 1 DECEASED
# Transfers: 2 of the ACTIVE patients have transfer history
# Nursing: all ACTIVE patients get Kardex updates, care plans, shift notes, TPR
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
    help = "Seed comprehensive inpatient demo data (admissions, rounds, transfers, discharges)"

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
            county, sub_county = self._get_or_create_location()
            wards = self._ensure_wards()

            created = {"patients": 0, "admissions": 0, "rounds": 0, "transfers": 0, "discharges": 0, "kardex_updates": 0, "care_plans": 0, "shift_notes": 0, "tpr_readings": 0}

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
                    created["patients"] += 1
                    created["admissions"] += 1
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
                    continue

                patient = self._create_patient(scenario, county, sub_county)
                created["patients"] += 1

                # Create IPD encounter
                admission_date = timezone.now() - timedelta(days=scenario["days_ago"])
                ipd_encounter = Encounter.objects.create(
                    patient=patient,
                    encounter_type="IPD",
                    encounter_date=admission_date.date(),
                    chief_complaint=scenario["complaint"],
                    status="IN_PROGRESS" if scenario["status"] == "ACTIVE" else "CLOSED",
                    created_by=user,
                )

                # Create admission
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

                # Ward rounds
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
                            # Update admission to reflect current ward/bed
                            admission.ward = dest_ward
                            admission.bed = dest_bed
                            admission.save(update_fields=["ward", "bed"])
                            created["transfers"] += 1

                # Discharge
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

            self.stdout.write("")
            label = "Would create (dry run):" if dry_run else "Inpatient demo data seeded:"
            self.stdout.write(self.style.SUCCESS(label))
            for key, count in created.items():
                self.stdout.write(f"  {key}: {count}")

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _clear_demo_data(self):
        """Remove demo inpatient records created by previous runs."""
        # Patients created by this command have phone_number starting with "demo-ipd-"
        demo_patients = Patient.objects.filter(phone_number__startswith="demo-ipd-")
        count = demo_patients.count()
        if count:
            # Cascade deletes admissions, encounters, etc.
            Encounter.objects.filter(patient__in=demo_patients).delete()
            Admission.objects.filter(patient__in=demo_patients).delete()
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

    def _get_or_create_location(self):
        county = County.objects.first()
        if not county:
            county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.filter(county=county).first()
        if not sub_county:
            sub_county = SubCounty.objects.create(county=county, name="Mvita")
        return county, sub_county

    def _ensure_wards(self) -> dict:
        """Ensure one ward per type exists; return mapping."""
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
            # For discharged scenarios, pick any bed (it'll be freed by discharge)
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
            # Deterministic tag for idempotency and cleanup
            phone_number=scenario["_demo_tag"],
        )
