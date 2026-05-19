"""
Management command to seed rich inpatient demo data with full OPD→IPD journeys.

Complementary to seed_inpatient_demo.py — this script creates patients with:
- Complete OPD encounter (chief complaint, HPI, physical exam, assessment)
- Admission linked to the OPD encounter (source_encounter)
- Multiple ward rounds with realistic SOAP progression
- AI care plan results (stored in AICarePlanResult)
- Nursing kardex with care plan entries, shift notes
- Lab orders with results (some critical)
- Imaging with radiology reports
- Prescriptions (admission + discharge)
- Fluid balance charts
- TPR & BP monitoring

Each patient tells a clinical story from first presentation through admission.

Usage:
    python manage.py seed_rich_admissions
    python manage.py seed_rich_admissions --clear
    python manage.py seed_rich_admissions --dry-run
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from hmis.apps.ai.models import AICarePlanResult
from hmis.apps.core.models import County, Facility, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.imaging.models import (
    ImagingOrder,
    ImagingOrderItem,
    ImagingProcedure,
    RadiologyReport,
)
from hmis.apps.inpatient.models import (
    Admission,
    BPMonitoringReading,
    FluidBalanceEntry,
    FluidBalanceSheet,
    KardexHandoverNote,
    KardexShiftNote,
    NursingCarePlanEntry,
    NursingKardex,
    TemperatureReading,
    Ward,
    WardRound,
)
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
from hmis.apps.patients.models import Allergy, Patient
from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

User = get_user_model()

# Marker prefix for idempotent clear
DEMO_TAG_PREFIX = "demo-rich-"

# ---------------------------------------------------------------------------
# Name pools — authentic Kenyan names
# ---------------------------------------------------------------------------
FIRST_NAMES_M = [
    "James",
    "Samuel",
    "David",
    "Joseph",
    "Peter",
    "Daniel",
    "Moses",
    "John",
    "Timothy",
    "Emmanuel",
]
FIRST_NAMES_F = [
    "Mary",
    "Ruth",
    "Grace",
    "Naomi",
    "Sarah",
    "Elizabeth",
    "Hannah",
    "Lydia",
    "Martha",
    "Rebecca",
]
LAST_NAMES = [
    "Kipchoge",
    "Mutua",
    "Otieno",
    "Wanjiku",
    "Muturi",
    "Kiprotich",
    "Mwangi",
    "Ochieng",
    "Kamau",
    "Njoroge",
]

# ---------------------------------------------------------------------------
# Scenarios — each is a full OPD→IPD journey
# ---------------------------------------------------------------------------
SCENARIOS = [
    # =========================================================================
    # SCENARIO 1: Diabetic Ketoacidosis (DKA) — Medical Ward
    # 28-year-old Type 1 DM, non-compliance → DKA → ICU step-down → Medical
    # =========================================================================
    {
        "tag": "dka-001",
        "ward_type": "MEDICAL",
        "gender": "M",
        "age_range": (26, 32),
        "days_ago": 5,
        "status": "ACTIVE",
        "payer": "SHA",
        "icd": "E10.1",
        "dx_text": "Type 1 diabetes mellitus with ketoacidosis",
        "allergies": [
            {
                "substance": "Sulfonamides",
                "substance_type": "medication",
                "reaction_type": "rash",
                "severity": "moderate",
                "verification_status": "confirmed",
                "criticality": "low",
                "notes": "Mild rash with co-trimoxazole in 2021",
            },
        ],
        "opd_encounter": {
            "encounter_type": "EMERGENCY",
            "chief_complaint": "Confusion and vomiting for 1 day",
            "history_of_present_illness": (
                "28-year-old male, known Type 1 DM on insulin Mixtard 30/70 (20 units BD), "
                "presents with 1-day history of progressive confusion, nausea and vomiting ×4, "
                "and diffuse abdominal pain. Admits to running out of insulin 3 days ago due to "
                "financial constraints. Reports polyuria and polydipsia preceding symptoms. "
                "No fever, no diarrhoea, no chest pain. Last meal was yesterday morning."
            ),
            "physical_examination": (
                "GCS 13/15 (E3V4M6). Dehydrated (sunken eyes, dry mucous membranes, reduced skin turgor). "
                "Kussmaul breathing, RR 28/min. Fruity (ketotic) breath. Tachycardic, HR 118 bpm. "
                "BP 96/62 mmHg (hypotensive). Temp 36.8°C. Abdomen: diffuse tenderness, no guarding, "
                "no rebound. Bowel sounds present. No focal neurological deficit. Capillary refill 4 seconds."
            ),
            "assessment": (
                "Diabetic ketoacidosis — likely precipitated by insulin omission. "
                "Moderate-severe dehydration. Rule out infection as precipitant. "
                "Plan: aggressive IV resuscitation, insulin infusion, electrolyte monitoring, admit to medical ward."
            ),
            "vitals": {
                "temperature": Decimal("36.8"),
                "pulse": 118,
                "blood_pressure": "96/62",
                "respiratory_rate": 28,
                "spo2": Decimal("99"),
                "weight": Decimal("68.0"),
                "height": Decimal("175"),
            },
        },
        "lab_orders": [
            {
                "priority": "URGENT",
                "clinical_notes": "DKA — baseline metabolic panel, blood gas",
                "status": "COMPLETED",
                "day_offset": 0,
                "items": [
                    {
                        "test_code": "RBS",
                        "result": {
                            "numeric_value": Decimal("28.4"),
                            "result_unit": "mmol/L",
                            "result_flag": "CRITICAL",
                            "reference_range_text": "3.9-7.8 mmol/L",
                            "interpretation": "Severe hyperglycaemia consistent with DKA",
                            "is_critical_result": True,
                        },
                    },
                    {
                        "test_code": "K",
                        "result": {
                            "numeric_value": Decimal("5.8"),
                            "result_unit": "mmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "3.5-5.0 mmol/L",
                            "interpretation": "Hyperkalaemia — caution with insulin; will drop with treatment",
                        },
                    },
                    {
                        "test_code": "NA",
                        "result": {
                            "numeric_value": Decimal("131"),
                            "result_unit": "mmol/L",
                            "result_flag": "LOW",
                            "reference_range_text": "136-145 mmol/L",
                            "interpretation": "Pseudohyponatraemia — correct for glucose",
                        },
                    },
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("142"),
                            "result_unit": "µmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "62-106 µmol/L",
                            "interpretation": "AKI on dehydration — likely pre-renal",
                        },
                    },
                    {
                        "test_code": "HBA1C",
                        "result": {
                            "numeric_value": Decimal("12.4"),
                            "result_unit": "%",
                            "result_flag": "HIGH",
                            "reference_range_text": "4.0-5.6%",
                            "interpretation": "Very poor glycaemic control; consistent with prolonged non-compliance",
                        },
                    },
                ],
            },
            {
                "priority": "ROUTINE",
                "clinical_notes": "Day 2 repeat — monitor K+ and glucose trend",
                "status": "COMPLETED",
                "day_offset": 1,
                "items": [
                    {
                        "test_code": "RBS",
                        "result": {
                            "numeric_value": Decimal("14.2"),
                            "result_unit": "mmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "3.9-7.8 mmol/L",
                            "interpretation": "Improving but still hyperglycaemic; continue insulin sliding scale",
                        },
                    },
                    {
                        "test_code": "K",
                        "result": {
                            "numeric_value": Decimal("3.8"),
                            "result_unit": "mmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "3.5-5.0 mmol/L",
                            "interpretation": "Normalised with treatment; continue KCl in fluids",
                        },
                    },
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("98"),
                            "result_unit": "µmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "62-106 µmol/L",
                            "interpretation": "Creatinine normalising with rehydration — AKI resolving",
                        },
                    },
                ],
            },
            {
                "priority": "ROUTINE",
                "clinical_notes": "Day 4 pre-discharge — confirm metabolic stability",
                "status": "COMPLETED",
                "day_offset": 4,
                "items": [
                    {
                        "test_code": "RBS",
                        "result": {
                            "numeric_value": Decimal("8.6"),
                            "result_unit": "mmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "3.9-7.8 mmol/L",
                            "interpretation": "Near-target on basal-bolus regimen; safe for discharge",
                        },
                    },
                    {
                        "test_code": "K",
                        "result": {
                            "numeric_value": Decimal("4.1"),
                            "result_unit": "mmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "3.5-5.0 mmol/L",
                        },
                    },
                ],
            },
        ],
        "imaging_orders": [
            {
                "procedure_code": "CXR",
                "priority": "ROUTINE",
                "clinical_indication": "DKA — rule out infective precipitant",
                "status": "REPORTED",
                "day_offset": 0,
                "report": {
                    "findings": "Clear lung fields bilaterally. No consolidation or effusion. Normal cardiac silhouette. No mediastinal abnormality.",
                    "impression": "Normal chest radiograph. No evidence of pneumonia as precipitant for DKA.",
                    "is_critical": False,
                },
            },
        ],
        "prescriptions": [
            {
                "clinical_notes": "DKA protocol — insulin infusion transitioned to SC",
                "day_offset": 0,
                "items": [
                    {
                        "drug_code": "MIXT3070",
                        "quantity": 2,
                        "dosage": "20 units",
                        "frequency": "Twice daily",
                        "duration": "Ongoing",
                        "route": "Subcutaneous",
                        "instructions": "Resume home regimen once eating. Administer 30min before meals.",
                    },
                    {
                        "drug_code": "PCM1G",
                        "quantity": 9,
                        "dosage": "1g",
                        "frequency": "Three times daily",
                        "duration": "3 days",
                        "route": "Oral",
                        "instructions": "For abdominal discomfort",
                    },
                    {
                        "drug_code": "OMEP20",
                        "quantity": 5,
                        "dosage": "20mg",
                        "frequency": "Once daily",
                        "duration": "5 days",
                        "route": "Oral",
                        "instructions": "Gastroprotection during acute illness",
                    },
                ],
            },
        ],
        "rounds": [
            {
                "day_offset": 1,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Patient more alert, GCS 15. Vomiting settled. Tolerating sips of water. Mild abdominal discomfort persists.",
                "obj": "T 36.9°C, HR 92, BP 112/74, RR 18, SpO2 99%. No longer Kussmaul. Abdomen soft, mild epigastric tenderness. BM chart: 14.2 → 12.8 → 11.4 mmol/L overnight.",
                "assess": "Resolving DKA. Glucose trending down on sliding scale. AKI improving with fluids. K+ normalised.",
                "plan": "Continue NS at 125ml/hr. Switch from insulin infusion to SC Mixtard when tolerating full diet. Repeat UECs. Diabetes educator review. Start discharge planning if stable.",
            },
            {
                "day_offset": 2,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Eating full diet. No vomiting. Feels much better. Asking about discharge. Concerned about cost of insulin.",
                "obj": "T 36.7°C, HR 78, BP 118/76, RR 16. Abdomen non-tender. BM: 9.8 fasting, 12.1 post-meal. Urine ketones trace. Creatinine normalising (98).",
                "assess": "DKA resolved. Transitioned to SC insulin successfully. AKI resolved. Ready for diabetes education.",
                "plan": "Continue Mixtard 20u BD. Diabetes educator session today — self-monitoring, hypoglycaemia recognition, sick-day rules. Social worker referral for insulin access (NHIF/SHA coverage). Target discharge day 4-5.",
            },
            {
                "day_offset": 3,
                "condition": "STABLE",
                "review_type": "CONSULTANT_REVIEW",
                "subj": "Stable. Completed diabetes education. Able to demonstrate self-injection technique. Arranged SHA coverage for insulin supply.",
                "obj": "Afebrile. Haemodynamically stable. BM: 7.8 fasting, 10.2 post-lunch. All electrolytes normal.",
                "assess": "DKA fully resolved. Good understanding of self-management. SHA insulin coverage arranged.",
                "plan": "Discharge tomorrow. Prescription: Mixtard 30/70 20u BD, glucometer + strips. Follow-up diabetes clinic 2 weeks. HbA1c in 3 months. Safety net: return if vomiting, BM >20, or unwell.",
            },
            {
                "day_offset": 4,
                "condition": "STABLE",
                "review_type": "WARD_ROUND",
                "subj": "Ready for discharge. No complaints. Family present and counselled.",
                "obj": "T 36.6°C, HR 74, BP 116/72. BM 8.6 fasting. All discharge criteria met.",
                "assess": "Fit for discharge. DKA resolved, metabolically stable, self-management plan in place.",
                "plan": "Discharge today. Scripts: Mixtard 20u BD, glucometer, test strips ×50. OPD diabetes clinic in 14 days. Clear instructions given to patient and next of kin.",
            },
        ],
        "kardex": {
            "mobility_status": "Ambulatory",
            "dietary_requirements": "Diabetic diet (complex carbohydrates, low GI)",
            "iv_access": "Right antecubital fossa 18G cannula",
            "fall_risk": "LOW",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "Young T1DM patient admitted with DKA secondary to insulin omission due to financial barriers. Dehydrated, acidotic, hyperglycaemic.",
            "nursing_diagnosis": "Deficient fluid volume related to osmotic diuresis and vomiting as evidenced by tachycardia, hypotension, and reduced skin turgor",
            "goal": "Patient will be haemodynamically stable (HR <100, BP >100/60, urine output >0.5ml/kg/hr) within 12 hours and demonstrate correct self-injection technique before discharge",
            "plan": "1. Strict I&O chart. 2. Hourly BM monitoring (reduce to QDS when stable). 3. IV NS as prescribed. 4. Administer insulin per sliding scale/protocol. 5. Monitor K+ with each glucose check. 6. Diabetes educator referral day 2. 7. Social worker referral for insulin access.",
            "rationale": "DKA causes severe dehydration through osmotic diuresis; aggressive fluid replacement restores intravascular volume. Insulin drives glucose and potassium intracellularly — K+ monitoring prevents fatal hypokalaemia.",
            "implementation": "IV NS 1L stat then 500ml/hr ×2h, then 250ml/hr. Insulin infusion 0.1u/kg/hr. BM hourly. UECs 4-hourly. Urine ketones BD. Transitioned to SC day 2.",
            "evaluation": "Haemodynamically stable by 8 hours. BM <14 by day 2. Ketones cleared day 3. Patient demonstrating self-injection day 3.",
        },
        "ai_care_plan": {
            "primary_diagnosis": "Diabetic Ketoacidosis (Type 1 DM)",
            "goals": [
                {
                    "description": "Restore fluid and electrolyte balance within 12-24 hours",
                    "priority": "high",
                    "timeframe": "24 hours",
                },
                {
                    "description": "Achieve blood glucose <14 mmol/L without hypoglycaemia",
                    "priority": "high",
                    "timeframe": "48 hours",
                },
                {
                    "description": "Patient demonstrates correct insulin self-administration technique",
                    "priority": "medium",
                    "timeframe": "before discharge",
                },
                {
                    "description": "Arrange sustainable insulin supply via SHA coverage",
                    "priority": "medium",
                    "timeframe": "before discharge",
                },
            ],
            "interventions": [
                {
                    "category": "Fluid Resuscitation",
                    "items": [
                        {"action": "IV Normal Saline 1L stat, then 500ml/hr x2h, then 250ml/hr"},
                        {"action": "Strict intake/output charting hourly"},
                        {"action": "Monitor for fluid overload (JVP, lung creps)"},
                    ],
                },
                {
                    "category": "Glycaemic Control",
                    "items": [
                        {"action": "Insulin infusion 0.1 units/kg/hr via syringe driver"},
                        {"action": "Hourly BM monitoring until <14, then 2-hourly"},
                        {
                            "action": "Add 5% dextrose to fluids when BM <14 (prevent cerebral oedema)"
                        },
                        {"action": "Transition to SC insulin when eating and ketones cleared"},
                    ],
                },
                {
                    "category": "Electrolyte Management",
                    "items": [
                        {"action": "4-hourly UECs during insulin infusion"},
                        {"action": "KCl 20mmol/L in each litre of IV fluid (if K+ 3.5-5.5)"},
                        {"action": "Hold insulin if K+ <3.5 — replace first"},
                    ],
                },
                {
                    "category": "Patient Education",
                    "items": [
                        {
                            "action": "Diabetes educator session: self-monitoring, injection technique, hypoglycaemia recognition"
                        },
                        {
                            "action": "Sick-day rules education (never stop insulin, increase monitoring)"
                        },
                        {"action": "Social worker referral for SHA insulin coverage"},
                    ],
                },
            ],
            "discharge_criteria": [
                "Blood glucose <12 mmol/L on SC insulin for >24 hours",
                "Eating and drinking normally",
                "Urine ketones negative/trace",
                "Electrolytes normal",
                "Patient demonstrates correct self-injection technique",
                "Follow-up appointment booked",
                "Insulin supply arranged (SHA or purchased)",
            ],
            "follow_up": {
                "clinic": "Diabetes Clinic",
                "timeline": "2 weeks",
                "investigations": ["HbA1c in 3 months", "Renal function", "Lipid profile"],
            },
        },
        "shift_notes": [
            {
                "shift": "DAY",
                "day_offset": 0,
                "content": "Admitted from casualty with DKA. GCS 13 on arrival, now 14. IV NS running at 500ml/hr. Insulin infusion started at 7u/hr. BM 28.4 on admission, now 22.1. Strict I/O chart commenced. Hourly obs. Patient drowsy but rousable.",
            },
            {
                "shift": "NIGHT",
                "day_offset": 0,
                "content": "BM trending down: 18.6 → 16.2 → 14.8. Urine output adequate (60ml/hr). GCS now 15, more alert and orientated. Tolerated sips of water at 2300h. K+ repeated at midnight: 4.6 (normalising). Insulin infusion reduced to 4u/hr.",
            },
            {
                "shift": "DAY",
                "day_offset": 1,
                "content": "BM 14.2 at 0600. Insulin infusion stopped, transitioned to SC Mixtard 20u pre-breakfast. Eating half portions. IV changed to NS + 5% dextrose at 125ml/hr. Mobilising to bathroom independently. Diabetes educator booked for tomorrow.",
            },
            {
                "shift": "NIGHT",
                "day_offset": 1,
                "content": "Stable overnight. BM: 11.8 at 2200, 9.2 at 0200. No hypoglycaemia. Slept well. Full diet tolerated for supper.",
            },
            {
                "shift": "DAY",
                "day_offset": 2,
                "content": "BM 9.8 fasting. Excellent progress. Diabetes educator session completed — patient demonstrated correct pen injection technique. Social worker arranged SHA registration for insulin coverage. IV cannula removed. Fully ambulant.",
            },
            {
                "shift": "DAY",
                "day_offset": 3,
                "content": "Consultant review — approved for discharge tomorrow. All bloods normal. Patient and wife counselled on sick-day rules, hypoglycaemia management, and when to seek emergency care. Discharge prescription prepared.",
            },
        ],
        "tpr": [
            {
                "day_offset": 0,
                "hour": 8,
                "temp": "36.8",
                "pulse": 118,
                "rr": 28,
                "notes": "On admission; tachycardic, Kussmaul",
            },
            {
                "day_offset": 0,
                "hour": 12,
                "temp": "37.0",
                "pulse": 104,
                "rr": 24,
                "notes": "2L NS in; still tachycardic",
            },
            {
                "day_offset": 0,
                "hour": 16,
                "temp": "36.9",
                "pulse": 96,
                "rr": 22,
                "notes": "Improving with fluids",
            },
            {
                "day_offset": 0,
                "hour": 20,
                "temp": "36.7",
                "pulse": 88,
                "rr": 20,
                "notes": "Much improved; GCS 15",
            },
            {
                "day_offset": 1,
                "hour": 6,
                "temp": "36.9",
                "pulse": 82,
                "rr": 18,
                "notes": "Stable; switched to SC insulin",
            },
            {
                "day_offset": 1,
                "hour": 14,
                "temp": "36.7",
                "pulse": 78,
                "rr": 16,
                "notes": "Comfortable; eating",
            },
            {
                "day_offset": 2,
                "hour": 6,
                "temp": "36.6",
                "pulse": 76,
                "rr": 16,
                "notes": "Stable; ready for education",
            },
            {
                "day_offset": 2,
                "hour": 14,
                "temp": "36.7",
                "pulse": 74,
                "rr": 16,
                "notes": "Post-educator session",
            },
            {
                "day_offset": 3,
                "hour": 6,
                "temp": "36.6",
                "pulse": 72,
                "rr": 16,
                "notes": "Discharge day; all well",
            },
        ],
        "bp_readings": [
            {
                "day_offset": 0,
                "hour": 8,
                "systolic": 96,
                "diastolic": 62,
                "pulse": 118,
                "position": "LYING",
                "notes": "Hypotensive on admission",
            },
            {
                "day_offset": 0,
                "hour": 12,
                "systolic": 108,
                "diastolic": 68,
                "pulse": 104,
                "position": "LYING",
                "notes": "Improving with fluids",
            },
            {
                "day_offset": 0,
                "hour": 20,
                "systolic": 116,
                "diastolic": 74,
                "pulse": 88,
                "position": "SITTING",
                "notes": "Stable",
            },
            {
                "day_offset": 1,
                "hour": 8,
                "systolic": 112,
                "diastolic": 74,
                "pulse": 82,
                "position": "SITTING",
                "notes": "",
            },
            {
                "day_offset": 2,
                "hour": 8,
                "systolic": 118,
                "diastolic": 76,
                "pulse": 76,
                "position": "SITTING",
                "notes": "Normotensive",
            },
            {
                "day_offset": 3,
                "hour": 8,
                "systolic": 116,
                "diastolic": 72,
                "pulse": 74,
                "position": "SITTING",
                "notes": "Discharge obs",
            },
        ],
        "fluid_balance": {
            "days": [
                {
                    "day_offset": 0,
                    "weight_kg": "68.0",
                    "iv_notes": "NS 1L stat, then 500ml/hr x2h, then 250ml/hr. Add KCl 20mmol/L.",
                    "entries": [
                        {
                            "hour": 8,
                            "type": "INTRAVENOUS",
                            "item": "Normal Saline 0.9% + KCl 20mmol",
                            "amount_ml": 1000,
                            "notes": "Stat bolus over 1hr",
                        },
                        {
                            "hour": 9,
                            "type": "INTRAVENOUS",
                            "item": "Normal Saline 0.9% + KCl 20mmol",
                            "amount_ml": 500,
                            "notes": "Running at 500ml/hr",
                        },
                        {
                            "hour": 10,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 150,
                            "notes": "First output post-resus",
                        },
                        {
                            "hour": 11,
                            "type": "INTRAVENOUS",
                            "item": "Normal Saline 0.9% + KCl 20mmol",
                            "amount_ml": 500,
                            "notes": "",
                        },
                        {
                            "hour": 12,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 280,
                            "notes": "Good output responding",
                        },
                        {
                            "hour": 14,
                            "type": "INTRAVENOUS",
                            "item": "Normal Saline 0.9%",
                            "amount_ml": 500,
                            "notes": "Reduced to 250ml/hr",
                        },
                        {
                            "hour": 15,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 320,
                            "notes": "",
                        },
                        {
                            "hour": 16,
                            "type": "INTRAVENOUS",
                            "item": "NS + 5% Dextrose",
                            "amount_ml": 500,
                            "notes": "BM <14; added dextrose",
                        },
                        {
                            "hour": 18,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 400,
                            "notes": "Excellent output",
                        },
                        {
                            "hour": 20,
                            "type": "ALIMENTARY",
                            "item": "Water + ORS",
                            "amount_ml": 200,
                            "notes": "Tolerating oral fluids",
                        },
                        {
                            "hour": 22,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 350,
                            "notes": "",
                        },
                    ],
                },
            ],
        },
        "handover_notes": [
            {
                "shift_ending": "DAY",
                "day_offset": 0,
                "pending_tasks": "Continue insulin infusion. Hourly BM. Repeat K+ at midnight. Call doctor if BM <4 or >25, or GCS drops.",
                "escalations": "Sulfonamide allergy documented. Hypotensive on arrival — responded to fluids.",
            },
            {
                "shift_ending": "NIGHT",
                "day_offset": 0,
                "pending_tasks": "Morning: switch to SC insulin if BM <14 and tolerating oral. Repeat UECs 0600. Diabetes educator referral.",
                "escalations": "",
            },
            {
                "shift_ending": "DAY",
                "day_offset": 1,
                "pending_tasks": "Continue SC insulin. Monitor for hypos (first day off infusion). Remove IV if tolerating full diet overnight.",
                "escalations": "",
            },
        ],
    },
    # =========================================================================
    # SCENARIO 2: Acute Pyelonephritis → Urosepsis — Medical Ward
    # 34-year-old female, recurrent UTIs, now systemically unwell
    # =========================================================================
    {
        "tag": "pyelo-002",
        "ward_type": "MEDICAL",
        "gender": "F",
        "age_range": (30, 38),
        "days_ago": 4,
        "status": "ACTIVE",
        "payer": "SHA",
        "icd": "N10",
        "dx_text": "Acute pyelonephritis",
        "allergies": [],
        "opd_encounter": {
            "encounter_type": "EMERGENCY",
            "chief_complaint": "Right loin pain and high fever for 2 days",
            "history_of_present_illness": (
                "34-year-old female presents with 2-day history of severe right loin pain radiating to the groin, "
                "high-grade fever (self-measured 39.2°C at home), rigors, nausea and vomiting ×2. "
                "Reports dysuria and frequency for 5 days prior — treated self with cranberry juice. "
                "History of 3 UTIs in the past year (last treated with nitrofurantoin 4 months ago). "
                "Sexually active, no contraception. LMP 2 weeks ago, regular cycles. No vaginal discharge."
            ),
            "physical_examination": (
                "Toxic-looking, febrile (39.4°C). HR 112, BP 104/64, RR 20, SpO2 98%. "
                "Severe right renal angle tenderness (positive right Murphy's punch). "
                "Mild suprapubic tenderness. No peritonism. Abdomen otherwise soft. "
                "No costovertebral angle mass. Pelvic exam deferred (menstruating)."
            ),
            "assessment": (
                "Acute pyelonephritis, likely ascending from lower UTI. Borderline septic (qSOFA 2: tachycardia + hypotension). "
                "Differential: renal abscess, obstructive uropathy. "
                "Plan: Blood and urine cultures, IV antibiotics, renal USS, admit."
            ),
            "vitals": {
                "temperature": Decimal("39.4"),
                "pulse": 112,
                "blood_pressure": "104/64",
                "respiratory_rate": 20,
                "spo2": Decimal("98"),
                "weight": Decimal("62.0"),
                "height": Decimal("164"),
            },
        },
        "lab_orders": [
            {
                "priority": "URGENT",
                "clinical_notes": "Pyelonephritis with sepsis features. Blood culture, FBC, UECs, CRP",
                "status": "COMPLETED",
                "day_offset": 0,
                "items": [
                    {
                        "test_code": "WBC",
                        "result": {
                            "numeric_value": Decimal("18.6"),
                            "result_unit": "x10^9/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "4.0-11.0",
                            "interpretation": "Marked leucocytosis with neutrophilia — consistent with bacterial infection",
                        },
                    },
                    {
                        "test_code": "CRP",
                        "result": {
                            "numeric_value": Decimal("186"),
                            "result_unit": "mg/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "0-5 mg/L",
                            "interpretation": "Markedly elevated — severe bacterial infection",
                            "is_critical_result": True,
                        },
                    },
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("118"),
                            "result_unit": "µmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "44-80 µmol/L",
                            "interpretation": "Acute kidney injury — likely sepsis-related + dehydration",
                        },
                    },
                    {
                        "test_code": "UA",
                        "result": {
                            "text_value": "Leucocytes +++, Nitrites +, Blood ++, Protein +. WBC >100/HPF, bacteria many. No casts.",
                            "result_flag": "ABNORMAL",
                            "interpretation": "Findings consistent with urinary tract infection",
                        },
                    },
                    {
                        "test_code": "BCULTURE",
                        "result": {
                            "text_value": "E. coli isolated. Sensitive to: ceftriaxone, gentamicin, meropenem. Resistant to: ampicillin, co-trimoxazole, ciprofloxacin.",
                            "result_flag": "ABNORMAL",
                            "interpretation": "Bacteraemia confirmed — E. coli (ESBL-negative). Sensitivity guides therapy.",
                        },
                    },
                ],
            },
            {
                "priority": "ROUTINE",
                "clinical_notes": "Day 3 — assess treatment response",
                "status": "COMPLETED",
                "day_offset": 3,
                "items": [
                    {
                        "test_code": "WBC",
                        "result": {
                            "numeric_value": Decimal("9.8"),
                            "result_unit": "x10^9/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "4.0-11.0",
                            "interpretation": "WBC normalised — good response to antibiotics",
                        },
                    },
                    {
                        "test_code": "CRP",
                        "result": {
                            "numeric_value": Decimal("42"),
                            "result_unit": "mg/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "0-5 mg/L",
                            "interpretation": "Trending down significantly (186→42). Continue antibiotics.",
                        },
                    },
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("68"),
                            "result_unit": "µmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "44-80 µmol/L",
                            "interpretation": "Creatinine normalised — AKI resolved",
                        },
                    },
                ],
            },
        ],
        "imaging_orders": [
            {
                "procedure_code": "USS-ABD",
                "priority": "URGENT",
                "clinical_indication": "Right pyelonephritis — rule out obstruction or abscess",
                "status": "REPORTED",
                "day_offset": 0,
                "report": {
                    "findings": "Right kidney: 12.1cm, mild pelvi-calyceal dilatation (AP diameter 14mm). Increased cortical echogenicity consistent with pyelonephritis. No discrete abscess. No calculi. Left kidney: normal (10.8cm). Bladder: normal, no residual volume.",
                    "impression": "Right acute pyelonephritis with mild hydronephrosis (likely inflammatory oedema at PUJ, no obstructing calculus seen). No abscess formation.",
                    "is_critical": False,
                },
            },
        ],
        "prescriptions": [
            {
                "clinical_notes": "Urosepsis — empiric then guided by culture",
                "day_offset": 0,
                "items": [
                    {
                        "drug_code": "CEFT1G",
                        "quantity": 7,
                        "dosage": "2g IV",
                        "frequency": "Once daily",
                        "duration": "5 days (IV), then step-down",
                        "route": "Intravenous",
                        "instructions": "Administer over 30 min. Culture: E.coli sensitive.",
                    },
                    {
                        "drug_code": "PCM1G",
                        "quantity": 12,
                        "dosage": "1g",
                        "frequency": "Three times daily",
                        "duration": "As needed",
                        "route": "Oral",
                        "instructions": "For fever >37.5°C or pain",
                    },
                    {
                        "drug_code": "OMEP20",
                        "quantity": 7,
                        "dosage": "20mg",
                        "frequency": "Once daily",
                        "duration": "7 days",
                        "route": "Oral",
                        "instructions": "Gastroprotection",
                    },
                ],
            },
        ],
        "rounds": [
            {
                "day_offset": 1,
                "condition": "SAME",
                "review_type": "WARD_ROUND",
                "subj": "Still febrile overnight (peaked 38.8°C). Loin pain improving with analgesia. Nausea settled, tolerating oral fluids. Dysuria less.",
                "obj": "T 38.2°C, HR 98, BP 110/68, RR 18. Tender right loin but less than yesterday. Urine output adequate (>0.5ml/kg/hr). USS: pyelonephritis, mild hydronephrosis, no abscess.",
                "assess": "Day 1 post-admission pyelonephritis. Still febrile — expected in first 48h of IV antibiotics. No abscess on USS. Blood culture pending.",
                "plan": "Continue IV ceftriaxone 2g daily. Blood culture result expected today — adjust if needed. Repeat FBC/CRP day 3. Maintain IV fluids until fever settles. Can step down to oral when afebrile 24h.",
            },
            {
                "day_offset": 2,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "First afebrile night. Appetite returning. Loin pain much improved — only mild discomfort on deep palpation. No more dysuria.",
                "obj": "T 37.2°C, HR 82, BP 116/72, RR 16. Right loin mildly tender. Blood culture result: E. coli — sensitive to ceftriaxone (current Rx appropriate).",
                "assess": "Improving pyelonephritis. Blood culture confirms E.coli bacteraemia. Current ceftriaxone is appropriate per sensitivities. Afebrile — approaching step-down criteria.",
                "plan": "Continue IV ceftriaxone today (day 3 of IV). If remains afebrile for 24h, switch to oral ciprofloxacin — wait, resistant on culture. Use oral augmentin (sensitive) or continue ceftriaxone. Discuss with micro. Repeat bloods tomorrow.",
            },
            {
                "day_offset": 3,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Feels well. No fever for 36 hours. Eating full diet. Ambulating freely. Wants to go home.",
                "obj": "Afebrile (36.8°C). HR 76, BP 118/74. No loin tenderness. Repeat bloods: WBC 9.8 (was 18.6), CRP 42 (was 186), Cr 68 (was 118). All normalising.",
                "assess": "Resolving pyelonephritis and bacteraemia. Inflammatory markers trending to normal. AKI resolved. Culture E.coli sensitive to augmentin — suitable oral step-down.",
                "plan": "Step down to oral augmentin 625mg TDS for 10 more days (total 14 days antibiotics). Discharge tomorrow if remains well overnight. Follow-up renal USS in 6 weeks. Urology referral for recurrent UTIs.",
            },
        ],
        "kardex": {
            "mobility_status": "Bed rest day 1, then ambulatory",
            "dietary_requirements": "Light diet, high fluid intake (>2.5L/day)",
            "iv_access": "Left hand 20G cannula",
            "fall_risk": "LOW",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "Young woman with acute pyelonephritis and features of urosepsis. Febrile, tachycardic, dehydrated. Renal function mildly impaired.",
            "nursing_diagnosis": "Hyperthermia related to urinary tract infection as evidenced by temperature 39.4°C, rigors, and tachycardia",
            "goal": "Patient will be afebrile (T <37.5°C) within 48 hours and pain-free (VAS <3/10) within 24 hours",
            "plan": "1. Strict I&O — target output >0.5ml/kg/hr. 2. IV antibiotics on time. 3. 4-hourly TPR. 4. Encourage PO fluids >2.5L/day. 5. Paracetamol PRN for fever. 6. Report if temperature >39°C despite Rx or urine output <30ml/hr.",
            "rationale": "Timely antibiotic administration within 1 hour of sepsis recognition improves mortality. Adequate hydration supports renal perfusion and drug clearance.",
            "implementation": "Ceftriaxone 2g IV given within 45min of admission. NS 1L over 4h. Paracetamol 1g given for fever. I&O chart commenced. Urine output 50ml/hr average.",
            "evaluation": "Afebrile by 36 hours. Pain reduced to 2/10 by day 2. Renal function normalising.",
        },
        "ai_care_plan": {
            "primary_diagnosis": "Acute Pyelonephritis with Urosepsis",
            "goals": [
                {
                    "description": "Achieve apyrexia (T <37.5°C) within 48 hours of IV antibiotics",
                    "priority": "high",
                    "timeframe": "48 hours",
                },
                {
                    "description": "Resolve acute kidney injury (Cr <80 µmol/L)",
                    "priority": "high",
                    "timeframe": "72 hours",
                },
                {
                    "description": "Complete IV-to-oral antibiotic transition",
                    "priority": "medium",
                    "timeframe": "day 3-5",
                },
                {
                    "description": "Identify and address recurrent UTI risk factors",
                    "priority": "medium",
                    "timeframe": "before discharge",
                },
            ],
            "interventions": [
                {
                    "category": "Antimicrobial Therapy",
                    "items": [
                        {"action": "Ceftriaxone 2g IV once daily (culture-guided)"},
                        {"action": "Step-down to oral augmentin 625mg TDS when afebrile >24h"},
                        {"action": "Total antibiotic course: 14 days"},
                    ],
                },
                {
                    "category": "Fluid Management & Renal Support",
                    "items": [
                        {"action": "IV NS 1L over 4 hours, then maintenance 125ml/hr"},
                        {"action": "Target urine output >0.5ml/kg/hr (>30ml/hr)"},
                        {"action": "Encourage oral fluids >2.5L/day once tolerating"},
                        {"action": "Monitor creatinine daily until normalised"},
                    ],
                },
                {
                    "category": "Monitoring",
                    "items": [
                        {"action": "4-hourly TPR and BP"},
                        {"action": "Daily UECs until Cr normalises"},
                        {"action": "Repeat FBC/CRP day 3 to confirm response"},
                        {"action": "Repeat blood culture if persistent fever >48h"},
                    ],
                },
            ],
            "discharge_criteria": [
                "Afebrile >24 hours",
                "Tolerating oral antibiotics",
                "Creatinine normalised",
                "CRP trending down",
                "Pain controlled on oral analgesia",
                "Able to maintain adequate oral fluid intake",
            ],
            "follow_up": {
                "clinic": "Urology/Renal Clinic",
                "timeline": "6 weeks",
                "investigations": [
                    "Repeat renal USS (6 weeks)",
                    "Urology referral for recurrent UTI workup",
                ],
            },
        },
        "shift_notes": [
            {
                "shift": "DAY",
                "day_offset": 0,
                "content": "Admitted from casualty. Febrile 39.4°C, rigors on arrival. IV ceftriaxone given within 45min. NS 1L running. Strict I&O chart commenced. Patient rating pain 7/10 right loin — paracetamol given with good effect (down to 4/10). Blood and urine cultures sent.",
            },
            {
                "shift": "NIGHT",
                "day_offset": 0,
                "content": "Fever peaked at 38.8°C, rigors at 2300h. Paracetamol + tepid sponge — temp down to 38.2°C. Urine output adequate (45ml/hr average). Patient sleeping in between fever spikes.",
            },
            {
                "shift": "DAY",
                "day_offset": 1,
                "content": "T 38.2°C at 0600. Antibiotics on schedule. USS done — pyelonephritis confirmed, no abscess. Blood culture: E.coli, sensitive to current Rx. Pain improving. Taking oral fluids well.",
            },
            {
                "shift": "NIGHT",
                "day_offset": 1,
                "content": "First afebrile night! T max 37.4°C. Sleeping well. Good oral intake. Urine output good. No complaints overnight.",
            },
            {
                "shift": "DAY",
                "day_offset": 2,
                "content": "Afebrile 36.8°C. Eating full diet. Pain 1/10 (mild discomfort only). Ambulating freely. Repeat bloods all improving. Doctor planning step-down to oral tomorrow.",
            },
        ],
        "tpr": [
            {
                "day_offset": 0,
                "hour": 8,
                "temp": "39.4",
                "pulse": 112,
                "rr": 20,
                "notes": "On admission; febrile, tachycardic",
            },
            {
                "day_offset": 0,
                "hour": 12,
                "temp": "38.8",
                "pulse": 102,
                "rr": 18,
                "notes": "Post-IV antibiotics; still febrile",
            },
            {
                "day_offset": 0,
                "hour": 16,
                "temp": "38.4",
                "pulse": 96,
                "rr": 18,
                "notes": "Trending down",
            },
            {
                "day_offset": 0,
                "hour": 20,
                "temp": "38.6",
                "pulse": 98,
                "rr": 18,
                "notes": "Spike with rigors",
            },
            {
                "day_offset": 0,
                "hour": 23,
                "temp": "38.8",
                "pulse": 100,
                "rr": 18,
                "notes": "Night spike; PCM given",
            },
            {
                "day_offset": 1,
                "hour": 6,
                "temp": "38.2",
                "pulse": 92,
                "rr": 18,
                "notes": "Improving trend",
            },
            {
                "day_offset": 1,
                "hour": 14,
                "temp": "37.6",
                "pulse": 84,
                "rr": 16,
                "notes": "Near-afebrile",
            },
            {
                "day_offset": 1,
                "hour": 22,
                "temp": "37.2",
                "pulse": 80,
                "rr": 16,
                "notes": "Afebrile!",
            },
            {
                "day_offset": 2,
                "hour": 6,
                "temp": "36.8",
                "pulse": 78,
                "rr": 16,
                "notes": "Afebrile; day 2",
            },
            {
                "day_offset": 2,
                "hour": 14,
                "temp": "37.0",
                "pulse": 76,
                "rr": 16,
                "notes": "Comfortable; planning discharge",
            },
            {
                "day_offset": 3,
                "hour": 6,
                "temp": "36.9",
                "pulse": 74,
                "rr": 16,
                "notes": "Discharge day",
            },
        ],
        "bp_readings": [
            {
                "day_offset": 0,
                "hour": 8,
                "systolic": 104,
                "diastolic": 64,
                "pulse": 112,
                "position": "LYING",
                "notes": "Borderline hypotensive; sepsis",
            },
            {
                "day_offset": 0,
                "hour": 14,
                "systolic": 112,
                "diastolic": 70,
                "pulse": 96,
                "position": "SITTING",
                "notes": "Post-fluids",
            },
            {
                "day_offset": 1,
                "hour": 8,
                "systolic": 116,
                "diastolic": 72,
                "pulse": 84,
                "position": "SITTING",
                "notes": "Improving",
            },
            {
                "day_offset": 2,
                "hour": 8,
                "systolic": 118,
                "diastolic": 74,
                "pulse": 78,
                "position": "SITTING",
                "notes": "Normal",
            },
        ],
        "fluid_balance": {
            "days": [
                {
                    "day_offset": 0,
                    "weight_kg": "62.0",
                    "iv_notes": "NS 1L over 4h, then 125ml/hr maintenance",
                    "entries": [
                        {
                            "hour": 8,
                            "type": "INTRAVENOUS",
                            "item": "Normal Saline 0.9%",
                            "amount_ml": 1000,
                            "notes": "Over 4 hours",
                        },
                        {
                            "hour": 12,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 200,
                            "notes": "",
                        },
                        {
                            "hour": 13,
                            "type": "ALIMENTARY",
                            "item": "Water",
                            "amount_ml": 300,
                            "notes": "Encouraged fluids",
                        },
                        {
                            "hour": 16,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 250,
                            "notes": "Good output",
                        },
                        {
                            "hour": 18,
                            "type": "ALIMENTARY",
                            "item": "Soup",
                            "amount_ml": 200,
                            "notes": "Light diet",
                        },
                        {
                            "hour": 20,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 300,
                            "notes": "",
                        },
                    ],
                },
            ],
        },
        "handover_notes": [
            {
                "shift_ending": "DAY",
                "day_offset": 0,
                "pending_tasks": "Due ceftriaxone at 0800 tomorrow. Blood culture result expected. If persistent fever >39°C consider repeat cultures.",
                "escalations": "Borderline septic on admission — responded to fluids. Monitor urine output closely.",
            },
            {
                "shift_ending": "NIGHT",
                "day_offset": 0,
                "pending_tasks": "Review blood culture (E.coli confirmed sensitive). Ward round decision on step-down. Repeat bloods day 3.",
                "escalations": "",
            },
        ],
    },
    # =========================================================================
    # SCENARIO 3: Acute Appendicitis → Post-Appendicectomy — Surgical Ward
    # 22-year-old male, classic presentation, laparoscopic appendicectomy
    # =========================================================================
    {
        "tag": "appy-003",
        "ward_type": "SURGICAL",
        "gender": "M",
        "age_range": (20, 26),
        "days_ago": 3,
        "status": "ACTIVE",
        "payer": "CASH",
        "icd": "K35.8",
        "dx_text": "Acute appendicitis, other and unspecified",
        "allergies": [],
        "opd_encounter": {
            "encounter_type": "EMERGENCY",
            "chief_complaint": "Right lower abdominal pain for 2 days, worsening",
            "history_of_present_illness": (
                "22-year-old male university student presents with 2-day history of abdominal pain. "
                "Pain started periumbilically then migrated to the right iliac fossa over 12 hours. "
                "Now constant, sharp, 8/10 severity, worse on movement and coughing. "
                "Associated anorexia since yesterday, nausea ×3 but no vomiting. "
                "Low-grade fever (self-measured 37.8°C). No diarrhoea, no dysuria, no testicular symptoms. "
                "No similar episodes before. Last meal 18 hours ago."
            ),
            "physical_examination": (
                "Young man lying still, knees drawn up. Febrile 37.9°C. HR 96, BP 124/78, RR 18. "
                "Abdomen: guarding in RIF. Maximal tenderness at McBurney's point. "
                "Rovsing's sign positive. Psoas sign positive. Rebound tenderness present in RIF. "
                "No mass palpable. Bowel sounds reduced. DRE: tenderness on right side. "
                "Testes: normal, no torsion. Hernial orifices clear."
            ),
            "assessment": (
                "Acute appendicitis — Alvarado score 8/10. High clinical probability. "
                "Plan: Bloods (FBC, CRP), appendicectomy (laparoscopic). NPO, IV fluids, analgesia. "
                "Consented for laparoscopic appendicectomy ± proceed to open."
            ),
            "vitals": {
                "temperature": Decimal("37.9"),
                "pulse": 96,
                "blood_pressure": "124/78",
                "respiratory_rate": 18,
                "spo2": Decimal("99"),
                "weight": Decimal("72.0"),
                "height": Decimal("178"),
            },
        },
        "lab_orders": [
            {
                "priority": "URGENT",
                "clinical_notes": "Pre-op bloods — suspected appendicitis",
                "status": "COMPLETED",
                "day_offset": 0,
                "items": [
                    {
                        "test_code": "WBC",
                        "result": {
                            "numeric_value": Decimal("15.8"),
                            "result_unit": "x10^9/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "4.0-11.0",
                            "interpretation": "Leucocytosis with neutrophilia — supports appendicitis",
                        },
                    },
                    {
                        "test_code": "CRP",
                        "result": {
                            "numeric_value": Decimal("68"),
                            "result_unit": "mg/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "0-5 mg/L",
                            "interpretation": "Elevated — acute inflammatory process",
                        },
                    },
                    {
                        "test_code": "HB",
                        "result": {
                            "numeric_value": Decimal("14.8"),
                            "result_unit": "g/dL",
                            "result_flag": "NORMAL",
                            "reference_range_text": "13.0-17.0 g/dL",
                        },
                    },
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("82"),
                            "result_unit": "µmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "62-106 µmol/L",
                        },
                    },
                ],
            },
            {
                "priority": "ROUTINE",
                "clinical_notes": "Post-op day 1 — check for complications",
                "status": "COMPLETED",
                "day_offset": 1,
                "items": [
                    {
                        "test_code": "WBC",
                        "result": {
                            "numeric_value": Decimal("11.2"),
                            "result_unit": "x10^9/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "4.0-11.0",
                            "interpretation": "Normalising post-operatively — no evidence of complication",
                        },
                    },
                ],
            },
        ],
        "imaging_orders": [
            {
                "procedure_code": "USS-ABD",
                "priority": "URGENT",
                "clinical_indication": "RIF pain — confirm appendicitis, rule out other pathology",
                "status": "REPORTED",
                "day_offset": 0,
                "report": {
                    "findings": "Appendix visualised in RIF, diameter 12mm (dilated), non-compressible, with periappendiceal fat stranding. No appendicolith. Small amount of free fluid in pelvis. No other abnormality.",
                    "impression": "Findings consistent with acute appendicitis. No abscess or perforation.",
                    "is_critical": False,
                },
            },
        ],
        "prescriptions": [
            {
                "clinical_notes": "Post-appendicectomy — analgesia and prophylactic antibiotics",
                "day_offset": 0,
                "items": [
                    {
                        "drug_code": "CEFT1G",
                        "quantity": 3,
                        "dosage": "1g IV",
                        "frequency": "Once daily",
                        "duration": "3 doses (perioperative)",
                        "route": "Intravenous",
                        "instructions": "First dose at induction, then 24h and 48h",
                    },
                    {
                        "drug_code": "METRO400",
                        "quantity": 9,
                        "dosage": "500mg IV",
                        "frequency": "Three times daily",
                        "duration": "3 days",
                        "route": "Intravenous",
                        "instructions": "Anaerobic cover",
                    },
                    {
                        "drug_code": "TRAM50",
                        "quantity": 12,
                        "dosage": "50mg",
                        "frequency": "Three times daily",
                        "duration": "3 days",
                        "route": "Oral",
                        "instructions": "For post-operative pain. Reduce as tolerated.",
                    },
                    {
                        "drug_code": "PCM1G",
                        "quantity": 9,
                        "dosage": "1g",
                        "frequency": "Three times daily",
                        "duration": "3 days",
                        "route": "Oral",
                        "instructions": "Regular — combine with tramadol for multimodal analgesia",
                    },
                ],
            },
        ],
        "rounds": [
            {
                "day_offset": 1,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Post-op day 1. Pain 4/10 at incision sites (was 8/10 pre-op). Tolerated sips of water overnight. Passed flatus this morning. No nausea.",
                "obj": "T 37.2°C, HR 82, BP 120/76. Abdomen: soft, mild tenderness at port sites (3 sites). No distension. Wound: dry, no ooze. Drain (if placed): minimal serous fluid.",
                "assess": "Uncomplicated post-laparoscopic appendicectomy day 1. Good recovery — early return of bowel function.",
                "plan": "Advance diet to light meals. Continue IV antibiotics today (last dose tomorrow). Switch to oral analgesia. Encourage early mobilisation. Histology result pending.",
            },
            {
                "day_offset": 2,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Feeling much better. Pain 2/10, only with sudden movements. Eating full diet. Bowels opened. Mobilising to bathroom and corridor.",
                "obj": "Afebrile. HR 76, BP 118/74. Abdomen soft, non-tender except mild port-site sensitivity. Wounds clean and dry. No signs of infection.",
                "assess": "Post-op day 2, uncomplicated recovery. Histology: acutely inflamed appendix, no perforation, no dysplasia.",
                "plan": "Stop IV antibiotics. Switch to oral PCM only. Discharge tomorrow if mobile and pain-controlled. Suture removal at local clinic day 7-10.",
            },
        ],
        "kardex": {
            "mobility_status": "Bed rest 6h post-op, then ambulatory with assistance",
            "dietary_requirements": "NPO → Sips → Light diet → Regular (stepwise)",
            "iv_access": "Right hand 18G cannula (inserted in theatre)",
            "fall_risk": "LOW",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "Young male post-laparoscopic appendicectomy for acute appendicitis. Three port-site wounds. Pain managed with multimodal analgesia.",
            "nursing_diagnosis": "Acute pain related to surgical intervention as evidenced by patient reporting 6/10 pain on VAS and guarding at incision sites",
            "goal": "Pain controlled to <4/10 on VAS within 12 hours post-op and patient mobilising independently by day 2",
            "plan": "1. Pain assessment Q4H using VAS. 2. Administer analgesia as prescribed (multimodal: PCM + tramadol). 3. Encourage deep breathing and early mobilisation. 4. Wound obs Q8H for signs of infection. 5. Monitor temperature 4-hourly. 6. Advance diet as tolerated.",
            "rationale": "Multimodal analgesia provides synergistic pain relief while minimising opioid side effects. Early mobilisation prevents DVT and promotes recovery.",
            "implementation": "Paracetamol 1g TDS regular + tramadol 50mg TDS PRN. Assisted out of bed 6h post-op. Independent mobilisation by morning day 1.",
            "evaluation": "Pain 4/10 by evening of surgery, 2/10 by day 2. Mobilising independently. Eating full diet day 2.",
        },
        "ai_care_plan": {
            "primary_diagnosis": "Post-Laparoscopic Appendicectomy (Acute Appendicitis)",
            "goals": [
                {
                    "description": "Adequate pain control (VAS <4/10) within 12 hours post-op",
                    "priority": "high",
                    "timeframe": "12 hours",
                },
                {
                    "description": "Return of bowel function (flatus/bowels open) within 24 hours",
                    "priority": "medium",
                    "timeframe": "24 hours",
                },
                {
                    "description": "Independent mobilisation by post-op day 1",
                    "priority": "medium",
                    "timeframe": "24 hours",
                },
                {
                    "description": "Discharge within 48-72 hours",
                    "priority": "low",
                    "timeframe": "72 hours",
                },
            ],
            "interventions": [
                {
                    "category": "Pain Management",
                    "items": [
                        {"action": "Paracetamol 1g TDS regular (round-the-clock, not PRN)"},
                        {"action": "Tramadol 50mg TDS PRN for breakthrough pain"},
                        {"action": "VAS pain assessment every 4 hours"},
                        {"action": "Ice pack to port sites PRN"},
                    ],
                },
                {
                    "category": "Surgical Wound Care",
                    "items": [
                        {"action": "Keep wounds dry for 48 hours"},
                        {
                            "action": "Wound inspection every 8 hours for redness, swelling, discharge"
                        },
                        {"action": "Suture removal day 7-10 at local clinic"},
                    ],
                },
                {
                    "category": "Recovery & Mobilisation",
                    "items": [
                        {"action": "Sit up in bed 4 hours post-op"},
                        {"action": "Stand and walk to chair 6 hours post-op"},
                        {"action": "Corridor walking post-op day 1"},
                        {"action": "Deep breathing exercises Q4H to prevent atelectasis"},
                    ],
                },
            ],
            "discharge_criteria": [
                "Pain controlled on oral analgesia only",
                "Tolerating full diet",
                "Bowels opened",
                "Afebrile",
                "Wounds clean and dry",
                "Mobile independently",
                "Able to perform ADLs",
            ],
            "follow_up": {
                "clinic": "Surgical Outpatient",
                "timeline": "2 weeks",
                "investigations": ["Histology review at follow-up"],
            },
        },
        "shift_notes": [
            {
                "shift": "DAY",
                "day_offset": 0,
                "content": "Returned from theatre at 1400h. Lap appendicectomy uneventful (surgeon's note filed). GCS 15 post-anaesthesia. Pain 6/10 — IV paracetamol given. Wound dry. NBM, IV NS running. Monitoring post-op obs Q30min ×2h, then Q1h ×4h.",
            },
            {
                "shift": "NIGHT",
                "day_offset": 0,
                "content": "Comfortable overnight. Pain improved to 4/10 with regular analgesia. Sips of water tolerated from 2200h. No nausea/vomiting. Passed flatus at 0300h. Obs stable throughout.",
            },
            {
                "shift": "DAY",
                "day_offset": 1,
                "content": "Post-op day 1. Up and mobilising to bathroom independently. Light breakfast tolerated. Pain 3/10. Wounds checked — clean and dry. IV antibiotics given (dose 2/3). Planning switch to oral tomorrow.",
            },
            {
                "shift": "DAY",
                "day_offset": 2,
                "content": "Post-op day 2. Pain 2/10 on oral PCM only. Eating full diet. Fully mobile. IV cannula removed. Discussing discharge with patient — planning for tomorrow morning.",
            },
        ],
        "tpr": [
            {
                "day_offset": 0,
                "hour": 14,
                "temp": "36.4",
                "pulse": 72,
                "rr": 14,
                "notes": "Immediate post-op; stable",
            },
            {
                "day_offset": 0,
                "hour": 16,
                "temp": "37.2",
                "pulse": 80,
                "rr": 16,
                "notes": "Low-grade post-op fever (expected)",
            },
            {
                "day_offset": 0,
                "hour": 20,
                "temp": "37.4",
                "pulse": 78,
                "rr": 16,
                "notes": "Mild post-op pyrexia",
            },
            {
                "day_offset": 1,
                "hour": 6,
                "temp": "37.0",
                "pulse": 76,
                "rr": 16,
                "notes": "Settling",
            },
            {
                "day_offset": 1,
                "hour": 14,
                "temp": "36.8",
                "pulse": 74,
                "rr": 16,
                "notes": "Afebrile; mobilising",
            },
            {
                "day_offset": 2,
                "hour": 6,
                "temp": "36.7",
                "pulse": 72,
                "rr": 16,
                "notes": "Normal; day of discharge",
            },
        ],
        "bp_readings": [
            {
                "day_offset": 0,
                "hour": 14,
                "systolic": 118,
                "diastolic": 72,
                "pulse": 72,
                "position": "LYING",
                "notes": "Post-op recovery",
            },
            {
                "day_offset": 0,
                "hour": 20,
                "systolic": 122,
                "diastolic": 76,
                "pulse": 78,
                "position": "SITTING",
                "notes": "",
            },
            {
                "day_offset": 1,
                "hour": 8,
                "systolic": 120,
                "diastolic": 74,
                "pulse": 76,
                "position": "SITTING",
                "notes": "Stable",
            },
            {
                "day_offset": 2,
                "hour": 8,
                "systolic": 118,
                "diastolic": 72,
                "pulse": 72,
                "position": "SITTING",
                "notes": "Discharge obs",
            },
        ],
        "fluid_balance": None,
        "handover_notes": [
            {
                "shift_ending": "DAY",
                "day_offset": 0,
                "pending_tasks": "Post-op obs Q1h until midnight then Q4h. Sips of water from 2200h if no nausea. Tramadol PRN if pain >5/10.",
                "escalations": "Call surgeon if: wound ooze, fever >38.5°C, abdominal distension, or vomiting.",
            },
        ],
    },
    # =========================================================================
    # SCENARIO 4: Severe Malaria (Paediatric) — Paediatric Ward
    # 4-year-old child, P. falciparum, convulsions, severe anaemia
    # =========================================================================
    {
        "tag": "malaria-004",
        "ward_type": "PEDIATRIC",
        "gender": "F",
        "age_range": (3, 5),
        "days_ago": 4,
        "status": "ACTIVE",
        "payer": "SHA",
        "icd": "B50.0",
        "dx_text": "Plasmodium falciparum malaria with cerebral complications",
        "allergies": [],
        "opd_encounter": {
            "encounter_type": "EMERGENCY",
            "chief_complaint": "Fever, convulsions, and not eating for 3 days",
            "history_of_present_illness": (
                "4-year-old girl brought by mother with 3-day history of high fever (up to 40°C at home), "
                "generalised tonic-clonic convulsion ×2 (each lasting ~3 minutes, resolved spontaneously), "
                "and refusal to eat/drink for 2 days. "
                "Mother reports child has been increasingly drowsy since this morning. "
                "Recent travel to Kisumu (Lake region, malaria-endemic) 1 week ago. "
                "No ITN use during travel. No prophylaxis. Up-to-date on vaccinations. "
                "No prior malaria hospitalisation. No sickle cell disease (screened at birth)."
            ),
            "physical_examination": (
                "Weight 14.8kg (50th centile for age). Drowsy but rousable (Blantyre Coma Scale 4/5). "
                "Severely febrile 39.8°C. HR 148 bpm (tachycardic for age). RR 38 (elevated). BP 88/52. SpO2 96%. "
                "Severely pale (conjunctival pallor +++, palmar pallor +++). "
                "No jaundice. No petechiae or purpura. Mild hepatosplenomegaly (liver 3cm, spleen 4cm below costal margin). "
                "No neck stiffness. No Kernig's sign. Pupils equal and reactive. "
                "No focal neurological deficit. Fontanelle closed. Capillary refill 3 seconds."
            ),
            "assessment": (
                "Severe malaria (WHO criteria: impaired consciousness + severe anaemia + convulsions). "
                "Probable P. falciparum given travel to endemic area. "
                "DDx: meningitis (LP needed if no improvement), severe anaemia. "
                "Plan: IV artesunate, urgent FBC (Hb), BS for malaria, cross-match for transfusion, admit."
            ),
            "vitals": {
                "temperature": Decimal("39.8"),
                "pulse": 148,
                "blood_pressure": "88/52",
                "respiratory_rate": 38,
                "spo2": Decimal("96"),
                "weight": Decimal("14.8"),
                "height": Decimal("102"),
            },
        },
        "lab_orders": [
            {
                "priority": "URGENT",
                "clinical_notes": "Severe malaria — parasite count, Hb for transfusion decision",
                "status": "COMPLETED",
                "day_offset": 0,
                "items": [
                    {
                        "test_code": "HB",
                        "result": {
                            "numeric_value": Decimal("4.8"),
                            "result_unit": "g/dL",
                            "result_flag": "CRITICAL",
                            "reference_range_text": "11.0-14.0 g/dL",
                            "interpretation": "Severe anaemia (Hb <5) — transfusion indicated. Likely haemolytic + bone marrow suppression from malaria.",
                            "is_critical_result": True,
                        },
                    },
                    {
                        "test_code": "PLT",
                        "result": {
                            "numeric_value": Decimal("48"),
                            "result_unit": "x10^9/L",
                            "result_flag": "LOW",
                            "reference_range_text": "150-400",
                            "interpretation": "Thrombocytopenia — common in severe malaria. Monitor for bleeding.",
                        },
                    },
                    {
                        "test_code": "RBS",
                        "result": {
                            "numeric_value": Decimal("2.8"),
                            "result_unit": "mmol/L",
                            "result_flag": "CRITICAL",
                            "reference_range_text": "3.9-7.8 mmol/L",
                            "interpretation": "Hypoglycaemia — common in paediatric severe malaria. Immediate correction needed.",
                            "is_critical_result": True,
                        },
                    },
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("62"),
                            "result_unit": "µmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "27-62 µmol/L (paediatric)",
                        },
                    },
                ],
            },
            {
                "priority": "ROUTINE",
                "clinical_notes": "Day 2 — post-transfusion Hb, parasite clearance",
                "status": "COMPLETED",
                "day_offset": 2,
                "items": [
                    {
                        "test_code": "HB",
                        "result": {
                            "numeric_value": Decimal("8.2"),
                            "result_unit": "g/dL",
                            "result_flag": "LOW",
                            "reference_range_text": "11.0-14.0 g/dL",
                            "interpretation": "Post-transfusion rise (4.8→8.2). Adequate for now. Recheck in 1 week.",
                        },
                    },
                    {
                        "test_code": "PLT",
                        "result": {
                            "numeric_value": Decimal("98"),
                            "result_unit": "x10^9/L",
                            "result_flag": "LOW",
                            "reference_range_text": "150-400",
                            "interpretation": "Recovering. No clinical bleeding.",
                        },
                    },
                ],
            },
        ],
        "imaging_orders": [],
        "prescriptions": [
            {
                "clinical_notes": "Severe malaria — IV artesunate per WHO protocol",
                "day_offset": 0,
                "items": [
                    {
                        "drug_code": "PCM1G",
                        "quantity": 6,
                        "dosage": "250mg (syrup)",
                        "frequency": "Four times daily",
                        "duration": "3 days",
                        "route": "Oral",
                        "instructions": "Weight-based: 15mg/kg/dose. For fever >37.5°C. Use oral syringe.",
                    },
                    {
                        "drug_code": "ORS",
                        "quantity": 4,
                        "dosage": "1 sachet in 200ml water",
                        "frequency": "After each loose stool or PRN",
                        "duration": "3 days",
                        "route": "Oral",
                        "instructions": "Offer small sips frequently. Give after each vomit/stool.",
                    },
                ],
            },
        ],
        "rounds": [
            {
                "day_offset": 1,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Mother reports child more alert since transfusion yesterday. No further convulsions. Started taking sips of ORS and small amounts of porridge this morning. Still febrile but less than before.",
                "obj": "Blantyre Coma Scale 5/5 (fully conscious). T 38.2°C (improving). HR 128, RR 30, SpO2 98%. Conjunctivae still pale but improved. Spleen still palpable 3cm. BM 5.2 (stable after dextrose). IV artesunate dose 3/7 given.",
                "assess": "Improving severe malaria post-transfusion and artesunate. Consciousness restored. No further seizures. Still mildly febrile — expected on day 1 of treatment.",
                "plan": "Continue IV artesunate (total 7 doses over 3 days per WHO). Post-transfusion Hb tomorrow. Switch to oral ACT when able to take reliably. Iron supplementation after parasite clearance. Mother education on ITN use.",
            },
            {
                "day_offset": 2,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Child playing with toys on bed. Eating well (full porridge + banana). Drinking freely. No fever since last night. No seizures.",
                "obj": "T 37.0°C. HR 110 (normal for age). RR 24 (normal). Alert, playful, interactive. Pallor improving. Hb post-transfusion 8.2. Platelets recovering (98). Last IV artesunate given.",
                "assess": "Resolving severe malaria. Excellent clinical response. Ready to transition to oral ACT (artemether-lumefantrine).",
                "plan": "Switch to oral artemether-lumefantrine (Coartem) — 2 tablets BD × 3 days. Start iron + folic acid after completing ACT. Discharge when: tolerating oral meds for 24h, afebrile, Hb stable. Probably day 4. Malaria prevention counselling for mother.",
            },
            {
                "day_offset": 3,
                "condition": "STABLE",
                "review_type": "CONSULTANT_REVIEW",
                "subj": "Active child, eating and playing normally. No fever for 48 hours. Mother keen to take home.",
                "obj": "Afebrile. HR 105. Alert, playful. Palmar pallor mild. Taking Coartem without difficulty.",
                "assess": "Severe malaria resolved. Transitioned to oral ACT successfully. Ready for discharge.",
                "plan": "Discharge today. Complete Coartem course (remaining 4 doses). Iron syrup 2.5ml OD × 3 months. ITN for child — prescribe and educate. Follow-up in 1 week for Hb check. Return immediately if fever, drowsiness, or seizures.",
            },
        ],
        "kardex": {
            "mobility_status": "Bed rest with cot sides (seizure precautions)",
            "dietary_requirements": "Age-appropriate diet. Small frequent meals. ORS between meals.",
            "iv_access": "Right foot 22G cannula (paediatric)",
            "fall_risk": "HIGH",
            "pressure_sore_risk": "LOW",
        },
        "care_plan": {
            "assessment": "4-year-old with severe P. falciparum malaria — cerebral involvement (seizures, impaired consciousness), severe anaemia (Hb 4.8), hypoglycaemia (BM 2.8). Post-transfusion.",
            "nursing_diagnosis": "Risk for injury related to seizure activity and impaired consciousness as evidenced by Blantyre Coma Scale 4/5 and two prior seizures",
            "goal": "Child seizure-free for duration of admission and regains full consciousness (Blantyre 5/5) within 24 hours",
            "plan": "1. Seizure precautions (cot sides up, padded, suction at bedside). 2. Neuro obs Q2H (Blantyre scale). 3. BM Q4H (treat <3 with 10% dextrose 5ml/kg). 4. Strict I&O. 5. Blood transfusion per protocol. 6. IV artesunate on time. 7. NPO until GCS 5/5, then graded oral intake.",
            "rationale": "Seizure precautions prevent injury during convulsions. BM monitoring catches hypoglycaemia (common cause of death in paediatric cerebral malaria). Artesunate kills parasites faster than quinine with fewer side effects.",
            "implementation": "Cot sides up and padded. Diazepam rectal 5mg at bedside PRN. BM 2.8 on admission — 10% dextrose 5ml/kg bolus given (BM rechecked 5.0). Packed cells 15ml/kg transfused over 4 hours. IV artesunate 2.4mg/kg at 0, 12, 24h then daily.",
            "evaluation": "GCS 5/5 by 18 hours post-treatment. No further seizures. BM stable >4 throughout. Hb rose from 4.8 to 8.2 post-transfusion.",
        },
        "ai_care_plan": {
            "primary_diagnosis": "Severe Plasmodium falciparum Malaria (Paediatric)",
            "goals": [
                {
                    "description": "No further seizures during admission",
                    "priority": "high",
                    "timeframe": "immediate",
                },
                {
                    "description": "Full consciousness (Blantyre 5/5) within 24 hours",
                    "priority": "high",
                    "timeframe": "24 hours",
                },
                {
                    "description": "Maintain blood glucose >4 mmol/L",
                    "priority": "high",
                    "timeframe": "ongoing",
                },
                {
                    "description": "Hb >7 g/dL post-transfusion",
                    "priority": "high",
                    "timeframe": "24 hours",
                },
                {
                    "description": "Afebrile and parasite clearance",
                    "priority": "medium",
                    "timeframe": "72 hours",
                },
            ],
            "interventions": [
                {
                    "category": "Antimalarial Therapy (WHO Protocol)",
                    "items": [
                        {
                            "action": "IV Artesunate 2.4mg/kg at 0, 12, 24h, then daily until oral tolerated"
                        },
                        {"action": "Minimum 3 doses IV before switching to oral ACT"},
                        {
                            "action": "Transition to oral artemether-lumefantrine (Coartem) when eating"
                        },
                        {"action": "Total course: 3 days oral ACT after IV completion"},
                    ],
                },
                {
                    "category": "Blood Transfusion",
                    "items": [
                        {"action": "Packed RBCs 15ml/kg over 3-4 hours"},
                        {"action": "Furosemide 1mg/kg IV if signs of fluid overload"},
                        {
                            "action": "Transfusion observations per protocol (baseline, 15min, 30min, hourly)"
                        },
                        {"action": "Post-transfusion Hb at 24 hours"},
                    ],
                },
                {
                    "category": "Neurological Monitoring",
                    "items": [
                        {"action": "Blantyre Coma Scale assessment Q2H"},
                        {
                            "action": "Seizure precautions: cot sides, padding, suction, rectal diazepam at bedside"
                        },
                        {"action": "Document seizure: type, duration, post-ictal state"},
                        {"action": "If >2 seizures: phenobarbitone 20mg/kg loading"},
                    ],
                },
                {
                    "category": "Metabolic Support",
                    "items": [
                        {"action": "Blood glucose Q4H (Q2H if <4 or impaired consciousness)"},
                        {"action": "If BM <3: 10% dextrose 5ml/kg IV bolus, recheck in 30min"},
                        {"action": "Maintenance fluids with 5% dextrose at 80% of calculated rate"},
                    ],
                },
            ],
            "discharge_criteria": [
                "Fully conscious and playful",
                "Afebrile >24 hours",
                "Tolerating oral ACT and diet",
                "No seizures for >48 hours",
                "Hb >7 g/dL (stable)",
                "BM stable on oral feeds",
                "Caregiver educated on ITN use and danger signs",
            ],
            "follow_up": {
                "clinic": "Paediatric Outpatient",
                "timeline": "1 week",
                "investigations": [
                    "Repeat Hb (1 week)",
                    "Repeat Hb (1 month)",
                    "Growth monitoring",
                ],
            },
        },
        "shift_notes": [
            {
                "shift": "DAY",
                "day_offset": 0,
                "content": "Admitted from casualty with severe malaria. Drowsy (Blantyre 4/5), febrile 39.8°C, severely pale. BM 2.8 — 10% dextrose bolus given, rechecked 5.0. IV artesunate 1st dose given. Transfusion (packed cells 220ml) commenced. Seizure precautions in place.",
            },
            {
                "shift": "NIGHT",
                "day_offset": 0,
                "content": "Transfusion completed without reaction. Child more responsive (Blantyre 5/5 by 0200h). No seizures. BM stable 5.4 at midnight. T 38.4°C. Artesunate 2nd dose (12h) given. Mother at bedside, anxious but reassured.",
            },
            {
                "shift": "DAY",
                "day_offset": 1,
                "content": "Alert, drinking ORS. T 38.2°C. Eating small amounts of porridge. Artesunate 3rd dose given. No seizures. Still pale but improved. BM 5.8. Mother education on ITN use started.",
            },
            {
                "shift": "DAY",
                "day_offset": 2,
                "content": "Playing on bed. Afebrile. Eating well. Post-transfusion Hb 8.2 — adequate. Last IV artesunate given. Switched to oral Coartem (first dose given with fatty food for absorption). Plan discharge tomorrow.",
            },
            {
                "shift": "DAY",
                "day_offset": 3,
                "content": "Active child. Discharge today. Coartem second day completed (mother giving correctly). Iron prescription provided. ITN issued. Mother verbalises danger signs for return. Follow-up in 1 week.",
            },
        ],
        "tpr": [
            {
                "day_offset": 0,
                "hour": 10,
                "temp": "39.8",
                "pulse": 148,
                "rr": 38,
                "notes": "Admission; febrile, tachycardic",
            },
            {
                "day_offset": 0,
                "hour": 14,
                "temp": "39.2",
                "pulse": 140,
                "rr": 34,
                "notes": "Post-artesunate dose 1",
            },
            {
                "day_offset": 0,
                "hour": 18,
                "temp": "38.6",
                "pulse": 132,
                "rr": 30,
                "notes": "During transfusion",
            },
            {
                "day_offset": 0,
                "hour": 22,
                "temp": "38.4",
                "pulse": 128,
                "rr": 28,
                "notes": "Post-transfusion; more alert",
            },
            {
                "day_offset": 1,
                "hour": 6,
                "temp": "38.2",
                "pulse": 126,
                "rr": 28,
                "notes": "Fever reducing trend",
            },
            {
                "day_offset": 1,
                "hour": 14,
                "temp": "37.6",
                "pulse": 118,
                "rr": 26,
                "notes": "Nearly afebrile",
            },
            {
                "day_offset": 2,
                "hour": 6,
                "temp": "37.0",
                "pulse": 110,
                "rr": 24,
                "notes": "Afebrile; playful",
            },
            {
                "day_offset": 2,
                "hour": 14,
                "temp": "36.8",
                "pulse": 108,
                "rr": 22,
                "notes": "Normal",
            },
            {
                "day_offset": 3,
                "hour": 8,
                "temp": "36.9",
                "pulse": 105,
                "rr": 22,
                "notes": "Discharge day",
            },
        ],
        "bp_readings": [],
        "fluid_balance": None,
        "handover_notes": [
            {
                "shift_ending": "DAY",
                "day_offset": 0,
                "pending_tasks": "Artesunate 12h dose due at 2200h. Monitor transfusion (ends ~1400h). BM at midnight. Seizure precautions — diazepam rectal 5mg at bedside.",
                "escalations": "Hb 4.8 (critical), BM 2.8 (corrected). High-risk patient. Call doctor if: seizure >5min, BM <3, urine output <1ml/kg/hr, or any deterioration.",
            },
            {
                "shift_ending": "NIGHT",
                "day_offset": 0,
                "pending_tasks": "Artesunate 24h dose due at 1000h. Post-transfusion Hb tomorrow. Start oral fluids if GCS 5/5. Advance diet as tolerated.",
                "escalations": "",
            },
        ],
    },
    # =========================================================================
    # SCENARIO 5: Decompensated Heart Failure — Medical Ward
    # 68-year-old female, known RHD, AF, now in acute decompensation
    # =========================================================================
    {
        "tag": "hf-005",
        "ward_type": "MEDICAL",
        "gender": "F",
        "age_range": (64, 72),
        "days_ago": 6,
        "status": "ACTIVE",
        "payer": "SHA",
        "icd": "I50.0",
        "dx_text": "Congestive heart failure, decompensated",
        "allergies": [
            {
                "substance": "ACE Inhibitors (Enalapril)",
                "substance_type": "medication",
                "reaction_type": "angioedema",
                "severity": "severe",
                "verification_status": "confirmed",
                "criticality": "high",
                "notes": "Facial and tongue swelling 2 hours after first dose of enalapril in 2019. Required adrenaline.",
            },
        ],
        "opd_encounter": {
            "encounter_type": "EMERGENCY",
            "chief_complaint": "Severe breathlessness and leg swelling for 1 week",
            "history_of_present_illness": (
                "68-year-old female, known rheumatic heart disease (mitral stenosis + regurgitation) diagnosed 1998, "
                "on warfarin, digoxin, and furosemide. Presents with progressive dyspnoea over 1 week — "
                "now orthopnoeic (sleeps propped up on 4 pillows), paroxysmal nocturnal dyspnoea ×3 episodes, "
                "bilateral leg swelling extending to thighs, reduced urine output for 3 days, "
                "and 5kg weight gain (from 62kg baseline to 67kg). "
                "Admits to running out of furosemide 5 days ago. No chest pain. Irregular palpitations as usual (known AF). "
                "No fever, no cough with blood. Known ACE inhibitor intolerance (angioedema with enalapril)."
            ),
            "physical_examination": (
                "Elderly woman in respiratory distress, using accessory muscles. Sitting upright, unable to lie flat. "
                "HR 92 irregularly irregular (AF), BP 148/88, RR 28, SpO2 88% on room air (improved to 94% on 4L O2). "
                "JVP elevated to ear lobes. Bilateral basal crackles to mid-zones. "
                "Apex beat displaced laterally (6th ICS, anterior axillary line). Pansystolic murmur grade 4/6 at apex + rumbling mid-diastolic murmur. "
                "Bilateral pitting oedema to thighs (++). Abdomen: hepatomegaly 4cm, ascites (shifting dullness positive). Sacral oedema."
            ),
            "assessment": (
                "Acute decompensation of chronic heart failure (NYHA IV) — precipitated by diuretic non-compliance. "
                "Known RHD (mitral stenosis + regurgitation), chronic AF on warfarin. "
                "Plan: IV furosemide bolus + infusion, O2, strict fluid restriction, daily weights, ACE-I contraindicated (angioedema) — use losartan if needed."
            ),
            "vitals": {
                "temperature": Decimal("36.6"),
                "pulse": 92,
                "blood_pressure": "148/88",
                "respiratory_rate": 28,
                "spo2": Decimal("88"),
                "weight": Decimal("67.0"),
                "height": Decimal("158"),
            },
        },
        "lab_orders": [
            {
                "priority": "URGENT",
                "clinical_notes": "Decompensated HF — renal function, electrolytes before aggressive diuresis",
                "status": "COMPLETED",
                "day_offset": 0,
                "items": [
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("128"),
                            "result_unit": "µmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "44-80 µmol/L",
                            "interpretation": "Cardiorenal syndrome — reduced renal perfusion from low cardiac output",
                        },
                    },
                    {
                        "test_code": "K",
                        "result": {
                            "numeric_value": Decimal("5.2"),
                            "result_unit": "mmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "3.5-5.0 mmol/L",
                            "interpretation": "Mildly elevated — monitor closely with diuresis (will likely normalise)",
                        },
                    },
                    {
                        "test_code": "NA",
                        "result": {
                            "numeric_value": Decimal("132"),
                            "result_unit": "mmol/L",
                            "result_flag": "LOW",
                            "reference_range_text": "136-145 mmol/L",
                            "interpretation": "Dilutional hyponatraemia — fluid overload",
                        },
                    },
                    {
                        "test_code": "HB",
                        "result": {
                            "numeric_value": Decimal("10.8"),
                            "result_unit": "g/dL",
                            "result_flag": "LOW",
                            "reference_range_text": "12.0-16.0 g/dL",
                            "interpretation": "Mild anaemia — chronic disease + dilutional. May contribute to HF symptoms.",
                        },
                    },
                ],
            },
            {
                "priority": "ROUTINE",
                "clinical_notes": "Day 3 — assess diuresis response and renal function",
                "status": "COMPLETED",
                "day_offset": 3,
                "items": [
                    {
                        "test_code": "CR",
                        "result": {
                            "numeric_value": Decimal("96"),
                            "result_unit": "µmol/L",
                            "result_flag": "HIGH",
                            "reference_range_text": "44-80 µmol/L",
                            "interpretation": "Improving with diuresis (128→96). Continue current regimen.",
                        },
                    },
                    {
                        "test_code": "K",
                        "result": {
                            "numeric_value": Decimal("3.9"),
                            "result_unit": "mmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "3.5-5.0 mmol/L",
                            "interpretation": "Normalised. Continue KCl supplementation with diuretics.",
                        },
                    },
                    {
                        "test_code": "NA",
                        "result": {
                            "numeric_value": Decimal("137"),
                            "result_unit": "mmol/L",
                            "result_flag": "NORMAL",
                            "reference_range_text": "136-145 mmol/L",
                            "interpretation": "Corrected with fluid restriction and diuresis",
                        },
                    },
                ],
            },
        ],
        "imaging_orders": [
            {
                "procedure_code": "CXR",
                "priority": "URGENT",
                "clinical_indication": "Acute heart failure — assess pulmonary congestion",
                "status": "REPORTED",
                "day_offset": 0,
                "report": {
                    "findings": "Cardiomegaly (CTR 0.68). Bilateral pleural effusions (moderate right, small left). Upper lobe pulmonary venous congestion. Kerley B lines. No focal consolidation.",
                    "impression": "Findings consistent with decompensated congestive heart failure with bilateral pleural effusions and pulmonary oedema. No pneumonia.",
                    "is_critical": False,
                },
            },
            {
                "procedure_code": "ECG",
                "priority": "URGENT",
                "clinical_indication": "Known AF — rate control assessment",
                "status": "REPORTED",
                "day_offset": 0,
                "report": {
                    "findings": "Atrial fibrillation with controlled ventricular rate (88 bpm). Left axis deviation. LV hypertrophy by voltage criteria. No acute ST-T changes. No prolonged QTc.",
                    "impression": "Chronic AF with adequate rate control on digoxin. LVH. No acute ischaemia.",
                    "is_critical": False,
                },
            },
        ],
        "prescriptions": [
            {
                "clinical_notes": "Decompensated HF — diuresis + maintenance of existing meds",
                "day_offset": 0,
                "items": [
                    {
                        "drug_code": "PCM1G",
                        "quantity": 6,
                        "dosage": "Furosemide 80mg IV",
                        "frequency": "Twice daily",
                        "duration": "3 days",
                        "route": "Intravenous",
                        "instructions": "IV push slowly. Monitor UO target >1L/day net negative.",
                    },
                    {
                        "drug_code": "ASPIRIN",
                        "quantity": 30,
                        "dosage": "Not applicable — warfarin continuation",
                        "frequency": "Once daily",
                        "duration": "Ongoing",
                        "route": "Oral",
                        "instructions": "Continue home warfarin — check INR. Target 2.5-3.5 for AF + mechanical disease.",
                    },
                ],
            },
        ],
        "rounds": [
            {
                "day_offset": 1,
                "condition": "SAME",
                "review_type": "WARD_ROUND",
                "subj": "Slightly less breathless today but still orthopnoeic (3 pillows). Urine output improved (1.8L yesterday). Reports legs 'feel lighter'. Still can't walk more than a few steps.",
                "obj": "T 36.7°C, HR 88 (AF), BP 138/82, RR 24, SpO2 92% on 2L O2. JVP still elevated but reduced from ear to angle of jaw. Crackles bilateral bases (less than yesterday — were mid-zones). Oedema thighs to knees (improving). Weight: 65.8kg (↓1.2kg from admission).",
                "assess": "Day 1 post-admission. Responding to IV furosemide — net negative 1.2L. Crackles receding. Still significantly fluid overloaded. Continue aggressive diuresis.",
                "plan": "Continue IV furosemide 80mg BD. Fluid restrict to 1.5L/day. Daily weight and I&O. Repeat UECs day 3. Add spironolactone 25mg when K+ allows. Consider cardiology referral for valve assessment if no prior echo.",
            },
            {
                "day_offset": 2,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Breathing much easier. Slept flat for 2 hours last night (first time in 2 weeks). Legs less swollen. Walking to bathroom now. Appetite returning.",
                "obj": "T 36.6°C, HR 84 (AF), BP 132/78, RR 20, SpO2 95% on 1L O2. JVP +3cm above sternal angle. Crackles now basal only. Oedema to mid-calf (markedly improved). Weight: 64.2kg (↓2.8kg total). Abdomen: hepatomegaly reduced to 2cm.",
                "assess": "Excellent diuretic response. Total 2.8kg weight loss in 2 days. Approaching dry weight. Oxygenation improving.",
                "plan": "Reduce O2 — trial room air today. Switch to oral furosemide 80mg BD tomorrow if maintains improvement. Add spironolactone 25mg OD. Daily UECs until stable. Plan discharge when SpO2 >94% on room air, weight stable, and tolerating oral diuretics.",
            },
            {
                "day_offset": 4,
                "condition": "IMPROVING",
                "review_type": "WARD_ROUND",
                "subj": "Breathing comfortably at rest. Walking in corridor. No PND last 3 nights. Sleeping on 2 pillows (home baseline). Weight stable for 24h at 63kg (dry weight 62kg). Eating well.",
                "obj": "T 36.5°C, HR 82 (AF), BP 128/76, RR 16, SpO2 96% on room air. JVP normal. Clear lung fields. No peripheral oedema. Abdomen: liver edge just palpable. Weight 63.0kg.",
                "assess": "Near-compensated heart failure. Weight approaching baseline. Tolerating oral diuretics. Ready for discharge planning.",
                "plan": "Continue oral furosemide 80mg BD + spironolactone 25mg. Restart losartan 50mg (not ACE-I — angioedema risk). Ensure adequate potassium. Discharge tomorrow with strict fluid restriction (1.5L/day), daily weights at home, and early HF clinic review. Cardiology referral for valve assessment/surgery consideration.",
            },
            {
                "day_offset": 5,
                "condition": "STABLE",
                "review_type": "CONSULTANT_REVIEW",
                "subj": "Ready for discharge. Understands medications and fluid restriction. Family supportive.",
                "obj": "Weight 62.8kg (near dry weight). SpO2 96% RA. No oedema. Lungs clear.",
                "assess": "Compensated HF. Discharge criteria met. Precipitant identified (diuretic non-compliance) and addressed.",
                "plan": "Discharge today. Medications: furosemide 80mg BD, spironolactone 25mg OD, losartan 50mg OD, digoxin 125mcg OD, warfarin (per INR). Fluid restriction 1.5L. Daily weights. HF clinic 2 weeks. Cardiology 6 weeks.",
            },
        ],
        "kardex": {
            "mobility_status": "Bed rest with elevation of legs, gradual mobilisation",
            "dietary_requirements": "Low-sodium diet, fluid restriction 1.5L/day",
            "iv_access": "Left forearm 20G cannula",
            "fall_risk": "HIGH",
            "pressure_sore_risk": "MODERATE",
        },
        "care_plan": {
            "assessment": "Elderly woman with decompensated CHF secondary to RHD. Severe fluid overload — pulmonary oedema, bilateral effusions, peripheral oedema, ascites. Precipitated by stopping furosemide.",
            "nursing_diagnosis": "Excess fluid volume related to impaired cardiac output and medication non-compliance as evidenced by 5kg weight gain, bilateral oedema, JVP elevation, and SpO2 88%",
            "goal": "Patient will have weight reduction of ≥3kg within 72 hours and SpO2 >94% on room air",
            "plan": "1. Strict I&O (target net negative 1-1.5L/day). 2. Daily weight (same time, same scale). 3. Fluid restriction 1.5L/day (chart all intake). 4. O2 to maintain SpO2 >92%. 5. Elevate legs and HOB 45°. 6. IV furosemide as prescribed. 7. Fall precautions (orthostatic risk). 8. Medication adherence education before discharge.",
            "rationale": "Negative fluid balance reduces preload, relieving pulmonary congestion and peripheral oedema. Upright positioning optimises ventilation. Daily weights are the most sensitive marker of fluid status change.",
            "implementation": "O2 4L via nasal prongs. Strict fluid chart displayed above bed (1.5L jar visual guide). Daily weight 0600h. IV furosemide 80mg at 0800 and 2000. Legs elevated on 2 pillows. Call bell within reach. Cardiac monitor.",
            "evaluation": "Day 3: Weight 64.2kg (↓2.8kg). SpO2 95% on 1L O2. Oedema significantly improved. Day 5: Weight 62.8kg. SpO2 96% RA. Ready for discharge.",
        },
        "ai_care_plan": {
            "primary_diagnosis": "Decompensated Congestive Heart Failure (NYHA IV)",
            "goals": [
                {
                    "description": "Achieve net negative fluid balance 1-1.5L/day",
                    "priority": "high",
                    "timeframe": "daily",
                },
                {
                    "description": "Weight loss ≥3kg within 72 hours",
                    "priority": "high",
                    "timeframe": "72 hours",
                },
                {"description": "SpO2 >94% on room air", "priority": "high", "timeframe": "5 days"},
                {
                    "description": "Patient verbalises understanding of medication adherence and fluid restriction",
                    "priority": "medium",
                    "timeframe": "before discharge",
                },
            ],
            "interventions": [
                {
                    "category": "Diuresis",
                    "items": [
                        {"action": "IV Furosemide 80mg BD (slow push over 5 min)"},
                        {"action": "Target urine output >100ml/hr for first 24h"},
                        {"action": "Switch to oral when improving (usually day 3-4)"},
                        {"action": "Add spironolactone 25mg OD for neurohormonal blockade"},
                    ],
                },
                {
                    "category": "Fluid & Sodium Restriction",
                    "items": [
                        {"action": "Strict 1.5L/day fluid allowance (include all liquids in diet)"},
                        {"action": "Low-sodium diet (<2g Na/day)"},
                        {"action": "Visual fluid jug at bedside for patient self-monitoring"},
                        {"action": "Involve dietitian for meal planning"},
                    ],
                },
                {
                    "category": "Monitoring",
                    "items": [
                        {"action": "Daily weight at 0600h (fasting, post-void, same clothing)"},
                        {"action": "Strict I&O chart (target net negative 1-1.5L/day)"},
                        {"action": "4-hourly vital signs including SpO2"},
                        {"action": "Daily UECs until stable (monitor for hypokalaemia/AKI)"},
                    ],
                },
                {
                    "category": "Discharge Preparation",
                    "items": [
                        {"action": "Medication reconciliation and adherence counselling"},
                        {
                            "action": "Teach daily home weight monitoring (return if gain >1.5kg in 2 days)"
                        },
                        {"action": "Heart failure nurse specialist review pre-discharge"},
                        {"action": "Ensure pharmacy supplies for 1 month"},
                    ],
                },
            ],
            "discharge_criteria": [
                "Weight within 1kg of dry weight (62kg) for ≥24 hours",
                "SpO2 >94% on room air",
                "No peripheral oedema",
                "Tolerating oral diuretics with adequate urine output",
                "Creatinine stable or improving",
                "Patient able to weigh self and recognise warning signs",
                "Medications supplied and regimen understood",
            ],
            "follow_up": {
                "clinic": "Heart Failure Clinic",
                "timeline": "2 weeks",
                "investigations": [
                    "Echocardiogram (if not recent)",
                    "INR check (1 week)",
                    "UECs (1 week)",
                    "Cardiology valve assessment (6 weeks)",
                ],
            },
        },
        "shift_notes": [
            {
                "shift": "DAY",
                "day_offset": 0,
                "content": "Admitted in acute respiratory distress. SpO2 88% → 94% on 4L O2. Propped up 45°. IV furosemide 80mg stat given — good response (400ml urine in first 2h). Strict I&O chart and fluid restriction (1.5L jar) explained to patient and family. Weight 67kg on admission.",
            },
            {
                "shift": "NIGHT",
                "day_offset": 0,
                "content": "Urine output total 1800ml since admission. Patient more comfortable, RR reduced to 24. Sleeping propped up on 4 pillows. O2 weaned to 2L. 2nd dose furosemide given at 2000h.",
            },
            {
                "shift": "DAY",
                "day_offset": 1,
                "content": "Weight 65.8kg (↓1.2kg). Breathing easier but still orthopnoeic. Crackles receding. Oedema improving — now to knees. Net negative 1.5L overnight. Continue diuresis.",
            },
            {
                "shift": "DAY",
                "day_offset": 2,
                "content": "Weight 64.2kg (↓2.8kg total). Slept flat for 2 hours last night! SpO2 95% on 1L O2. Walking to bathroom. Started spironolactone today. Family brought home scale for teaching daily weights.",
            },
            {
                "shift": "DAY",
                "day_offset": 4,
                "content": "Weight 63.0kg. SpO2 96% room air since yesterday. No oedema. Switched to oral furosemide. Medications counselling completed — patient repeats back regimen correctly. Planning discharge tomorrow.",
            },
            {
                "shift": "DAY",
                "day_offset": 5,
                "content": "Discharge day. Weight 62.8kg (dry weight ~62kg). Patient and daughter counselled on: daily weights, fluid restriction, when to call (gain >1.5kg in 2 days, breathlessness at rest, swollen legs). Medications dispensed. HF clinic appointment given.",
            },
        ],
        "tpr": [
            {
                "day_offset": 0,
                "hour": 10,
                "temp": "36.6",
                "pulse": 92,
                "rr": 28,
                "notes": "On admission; AF rate",
            },
            {
                "day_offset": 0,
                "hour": 14,
                "temp": "36.5",
                "pulse": 88,
                "rr": 26,
                "notes": "Post-furosemide; diuresing",
            },
            {
                "day_offset": 0,
                "hour": 22,
                "temp": "36.6",
                "pulse": 86,
                "rr": 24,
                "notes": "More comfortable",
            },
            {
                "day_offset": 1,
                "hour": 6,
                "temp": "36.5",
                "pulse": 86,
                "rr": 22,
                "notes": "Improving",
            },
            {
                "day_offset": 1,
                "hour": 14,
                "temp": "36.6",
                "pulse": 84,
                "rr": 22,
                "notes": "Continued diuresis",
            },
            {
                "day_offset": 2,
                "hour": 6,
                "temp": "36.6",
                "pulse": 84,
                "rr": 20,
                "notes": "Much improved",
            },
            {
                "day_offset": 2,
                "hour": 14,
                "temp": "36.5",
                "pulse": 82,
                "rr": 18,
                "notes": "Trial off O2",
            },
            {
                "day_offset": 3,
                "hour": 6,
                "temp": "36.5",
                "pulse": 82,
                "rr": 18,
                "notes": "On room air SpO2 95%",
            },
            {
                "day_offset": 4,
                "hour": 6,
                "temp": "36.5",
                "pulse": 82,
                "rr": 16,
                "notes": "Stable; near baseline",
            },
            {
                "day_offset": 5,
                "hour": 6,
                "temp": "36.5",
                "pulse": 80,
                "rr": 16,
                "notes": "Discharge obs",
            },
        ],
        "bp_readings": [
            {
                "day_offset": 0,
                "hour": 10,
                "systolic": 148,
                "diastolic": 88,
                "pulse": 92,
                "position": "SITTING",
                "notes": "Admission; fluid overloaded",
            },
            {
                "day_offset": 0,
                "hour": 22,
                "systolic": 138,
                "diastolic": 82,
                "pulse": 86,
                "position": "SITTING",
                "notes": "Post-diuresis",
            },
            {
                "day_offset": 1,
                "hour": 8,
                "systolic": 134,
                "diastolic": 80,
                "pulse": 86,
                "position": "SITTING",
                "notes": "",
            },
            {
                "day_offset": 2,
                "hour": 8,
                "systolic": 128,
                "diastolic": 76,
                "pulse": 82,
                "position": "SITTING",
                "notes": "Improving",
            },
            {
                "day_offset": 3,
                "hour": 8,
                "systolic": 126,
                "diastolic": 74,
                "pulse": 82,
                "position": "SITTING",
                "notes": "Near baseline",
            },
            {
                "day_offset": 4,
                "hour": 8,
                "systolic": 124,
                "diastolic": 72,
                "pulse": 80,
                "position": "SITTING",
                "notes": "Stable",
            },
            {
                "day_offset": 5,
                "hour": 8,
                "systolic": 122,
                "diastolic": 72,
                "pulse": 80,
                "position": "SITTING",
                "notes": "Discharge",
            },
        ],
        "fluid_balance": {
            "days": [
                {
                    "day_offset": 0,
                    "weight_kg": "67.0",
                    "iv_notes": "Furosemide 80mg IV BD. Fluid restrict 1.5L total.",
                    "entries": [
                        {
                            "hour": 10,
                            "type": "INTRAVENOUS",
                            "item": "Furosemide 80mg IV push",
                            "amount_ml": 10,
                            "notes": "Stat dose",
                        },
                        {
                            "hour": 11,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 400,
                            "notes": "Brisk diuresis started",
                        },
                        {
                            "hour": 12,
                            "type": "ALIMENTARY",
                            "item": "Tea (restricted)",
                            "amount_ml": 150,
                            "notes": "From 1.5L allowance",
                        },
                        {
                            "hour": 13,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 350,
                            "notes": "",
                        },
                        {
                            "hour": 15,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 300,
                            "notes": "",
                        },
                        {
                            "hour": 16,
                            "type": "ALIMENTARY",
                            "item": "Soup (low-sodium)",
                            "amount_ml": 200,
                            "notes": "",
                        },
                        {
                            "hour": 18,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 250,
                            "notes": "",
                        },
                        {
                            "hour": 20,
                            "type": "INTRAVENOUS",
                            "item": "Furosemide 80mg IV push",
                            "amount_ml": 10,
                            "notes": "2nd dose",
                        },
                        {
                            "hour": 21,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 350,
                            "notes": "Good response to 2nd dose",
                        },
                        {
                            "hour": 23,
                            "type": "URINE",
                            "item": "Urine",
                            "amount_ml": 300,
                            "notes": "",
                        },
                    ],
                },
            ],
        },
        "handover_notes": [
            {
                "shift_ending": "DAY",
                "day_offset": 0,
                "pending_tasks": "2nd furosemide dose at 2000h. Monitor UO — target >100ml/hr overnight. Fluid chart at bedside (max 1.5L/24h). O2 to keep SpO2 >92%.",
                "escalations": "ACE inhibitor allergy (angioedema) — DO NOT GIVE enalapril/ramipril/etc. On warfarin — fall risk precautions.",
            },
            {
                "shift_ending": "NIGHT",
                "day_offset": 0,
                "pending_tasks": "Morning weight at 0600. UECs before ward round. IV furosemide 0800h.",
                "escalations": "",
            },
            {
                "shift_ending": "DAY",
                "day_offset": 1,
                "pending_tasks": "Continue monitoring. Weigh daily. Cardiology referral letter to be written. Patient education on fluid restriction — daughter to attend.",
                "escalations": "",
            },
        ],
    },
]


# ===========================================================================
# Command class
# ===========================================================================


class Command(BaseCommand):
    help = (
        "Seed rich inpatient demo data with full OPD→IPD journeys, care plans, and investigations"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear", action="store_true", help="Remove previously seeded data first"
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without writing to DB",
        )
        parser.add_argument(
            "--facility",
            type=int,
            default=None,
            help="Facility ID to scope data to (default: first facility)",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if options["clear"]:
            self._clear_demo_data()

        county, sub_county = self._get_or_create_location()
        user = self._get_or_create_user()
        doctor = self._get_or_create_doctor()
        incoming_nurse = self._get_or_create_incoming_nurse()
        facility = self._get_facility(options.get("facility"))
        organization = facility.organization if facility else None
        wards = self._ensure_wards()
        test_catalog = self._ensure_test_catalog()
        drugs = self._ensure_drugs()
        imaging_procedures = self._ensure_imaging_procedures()

        created = {
            "patients": 0,
            "opd_encounters": 0,
            "admissions": 0,
            "allergies": 0,
            "lab_orders": 0,
            "lab_results": 0,
            "imaging_orders": 0,
            "radiology_reports": 0,
            "prescriptions": 0,
            "prescription_items": 0,
            "rounds": 0,
            "kardex_updates": 0,
            "care_plans": 0,
            "ai_care_plans": 0,
            "shift_notes": 0,
            "tpr_readings": 0,
            "bp_readings": 0,
            "fluid_sheets": 0,
            "fluid_entries": 0,
            "handover_notes": 0,
        }

        for idx, scenario in enumerate(SCENARIOS):
            tag = f"{DEMO_TAG_PREFIX}{scenario['tag']}"
            self.stdout.write(f"  [{idx + 1}/{len(SCENARIOS)}] {scenario['dx_text']} ({tag})")

            if dry_run:
                self._tally_dry_run(scenario, created)
                continue

            # Skip if already seeded
            if Patient.objects.filter(middle_name=tag).exists():
                self.stdout.write("    ↳ Already exists, skipping")
                continue

            # --- Patient ---
            patient = self._create_patient(
                scenario, county, sub_county, tag, facility=facility, organization=organization
            )
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
                    criticality=allergy_def.get("criticality", "low"),
                    notes=allergy_def.get("notes", ""),
                    recorded_by=user,
                )
                created["allergies"] += 1

            # --- OPD Encounter (source) ---
            admission_date = timezone.now() - timedelta(days=scenario["days_ago"])
            opd = scenario["opd_encounter"]
            opd_encounter = Encounter.objects.create(
                patient=patient,
                encounter_type=opd["encounter_type"],
                encounter_date=admission_date.date(),
                chief_complaint=opd["chief_complaint"],
                history_of_present_illness=opd["history_of_present_illness"],
                physical_examination=opd["physical_examination"],
                assessment=opd["assessment"],
                temperature=opd["vitals"]["temperature"],
                pulse=opd["vitals"]["pulse"],
                blood_pressure=opd["vitals"]["blood_pressure"],
                respiratory_rate=opd["vitals"]["respiratory_rate"],
                spo2=opd["vitals"]["spo2"],
                weight=opd["vitals"].get("weight"),
                height=opd["vitals"].get("height"),
                status="COMPLETED",
                created_by=doctor,
                **({"facility": facility, "organization": organization} if facility else {}),
            )
            created["opd_encounters"] += 1

            # --- IPD Encounter (for orders) ---
            ipd_encounter = Encounter.objects.create(
                patient=patient,
                encounter_type="IPD",
                encounter_date=admission_date.date(),
                chief_complaint=opd["chief_complaint"],
                status="IN_PROGRESS",
                created_by=doctor,
                **({"facility": facility, "organization": organization} if facility else {}),
            )

            # --- Admission (linked to OPD encounter) ---
            ward = wards.get(scenario["ward_type"])
            bed = self._get_available_bed(ward) if ward else None
            admission = Admission.objects.create(
                patient=patient,
                ward=ward,
                bed=bed,
                ipd_encounter=ipd_encounter,
                opd_encounter=opd_encounter,
                admitting_officer=doctor,
                admission_date=admission_date,
                admitting_diagnosis=scenario["icd"],
                admitting_diagnosis_text=scenario["dx_text"],
                admission_status="ACTIVE",
                payer_type=scenario["payer"],
                **({"facility": facility, "organization": organization} if facility else {}),
            )
            created["admissions"] += 1

            # --- Lab Orders ---
            for lab_def in scenario.get("lab_orders", []):
                lab_date = admission_date + timedelta(days=lab_def.get("day_offset", 0))
                lab_order = LabOrder.objects.create(
                    patient=patient,
                    encounter=ipd_encounter,
                    ordered_by=doctor,
                    priority=lab_def["priority"],
                    clinical_notes=lab_def.get("clinical_notes", ""),
                    status=lab_def["status"],
                    ordered_at=lab_date,
                    **({"facility": facility, "organization": organization} if facility else {}),
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
                    )
                    result_def = item_def.get("result")
                    if result_def:
                        LabResult.objects.create(
                            order_item=lab_item,
                            numeric_value=result_def.get("numeric_value"),
                            text_value=result_def.get("text_value", ""),
                            result_unit=result_def.get("result_unit", ""),
                            result_flag=result_def.get("result_flag", "NORMAL"),
                            reference_range_text=result_def.get("reference_range_text", ""),
                            interpretation=result_def.get("interpretation", ""),
                            is_critical_result=result_def.get("is_critical_result", False),
                            entered_by=user,
                            entered_at=lab_date + timedelta(hours=1),
                            verified_by=doctor,
                            verified_at=lab_date + timedelta(hours=2),
                        )
                        created["lab_results"] += 1

            # --- Imaging Orders ---
            for img_def in scenario.get("imaging_orders", []):
                proc = imaging_procedures.get(img_def["procedure_code"])
                if not proc:
                    continue
                img_date = admission_date + timedelta(days=img_def.get("day_offset", 0))
                img_order = ImagingOrder.objects.create(
                    patient=patient,
                    encounter=ipd_encounter,
                    ordered_by=doctor,
                    priority=img_def["priority"],
                    clinical_indication=img_def.get("clinical_indication", ""),
                    status=img_def["status"],
                    ordered_at=img_date,
                    completed_at=img_date + timedelta(hours=3)
                    if img_def["status"] in ("COMPLETED", "REPORTED")
                    else None,
                )
                ImagingOrderItem.objects.create(
                    order=img_order,
                    procedure=proc,
                    is_completed=img_def["status"] in ("COMPLETED", "REPORTED"),
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
                        signed_at=img_date + timedelta(hours=4),
                    )
                    created["radiology_reports"] += 1

            # --- Prescriptions ---
            for rx_def in scenario.get("prescriptions", []):
                rx_date = admission_date + timedelta(days=rx_def.get("day_offset", 0))
                prescription = Prescription.objects.create(
                    patient=patient,
                    encounter=ipd_encounter,
                    admission=admission,
                    prescribed_by=doctor,
                    valid_until=(rx_date + timedelta(days=30)).date(),
                    clinical_notes=rx_def.get("clinical_notes", ""),
                    status="PENDING",
                    **({"facility": facility, "organization": organization} if facility else {}),
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

            # --- Ward Rounds ---
            for rd in scenario.get("rounds", []):
                round_date = (admission_date + timedelta(days=rd["day_offset"])).date()
                if round_date > date.today():
                    continue
                WardRound.objects.create(
                    admission=admission,
                    round_date=round_date,
                    round_time="08:30",
                    conducted_by=doctor,
                    review_type=rd.get("review_type", "WARD_ROUND"),
                    subjective=rd["subj"],
                    objective=rd["obj"],
                    assessment=rd["assess"],
                    plan=rd["plan"],
                    condition_status=rd["condition"],
                )
                created["rounds"] += 1

            # --- Nursing Kardex ---
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

                # Nursing care plan entry
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
                        status="ACTIVE",
                    )
                    created["care_plans"] += 1

                # Shift notes
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

                # Kardex handover notes
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

            # --- AI Care Plan Result (stored) ---
            ai_cp = scenario.get("ai_care_plan")
            if ai_cp:
                AICarePlanResult.objects.create(
                    encounter=ipd_encounter,
                    admission=admission,
                    primary_diagnosis=ai_cp["primary_diagnosis"],
                    created_by=doctor,
                    request_data={
                        "primary_diagnosis": ai_cp["primary_diagnosis"],
                        "patient_context": {
                            "age": patient.age if hasattr(patient, "age") else 40,
                            "gender": patient.gender,
                        },
                    },
                    result_data={
                        "primary_diagnosis": ai_cp["primary_diagnosis"],
                        "goals": ai_cp["goals"],
                        "interventions": ai_cp["interventions"],
                        "discharge_criteria": ai_cp.get("discharge_criteria", []),
                        "follow_up": ai_cp.get("follow_up"),
                        "mode": "tibabot",
                        "llm_enriched": True,
                    },
                    service_mode="tibabot",
                    **({"facility": facility, "organization": organization} if facility else {}),
                )
                created["ai_care_plans"] += 1

            # --- TPR Readings ---
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
                    notes=tpr.get("notes", ""),
                )
                created["tpr_readings"] += 1

            # --- BP Readings ---
            for bp in scenario.get("bp_readings", []):
                bp_time = admission_date + timedelta(days=bp["day_offset"], hours=bp["hour"])
                if bp_time.date() > date.today():
                    continue
                BPMonitoringReading.objects.create(
                    admission=admission,
                    recorded_at=bp_time,
                    recorded_by=user,
                    systolic=bp["systolic"],
                    diastolic=bp["diastolic"],
                    pulse=bp.get("pulse"),
                    position=bp.get("position", "SITTING"),
                    notes=bp.get("notes", ""),
                )
                created["bp_readings"] += 1

            # --- Fluid Balance ---
            fb_data = scenario.get("fluid_balance")
            if fb_data:
                for day_def in fb_data.get("days", []):
                    chart_date = (admission_date + timedelta(days=day_def["day_offset"])).date()
                    if chart_date > date.today():
                        continue
                    sheet = FluidBalanceSheet.objects.create(
                        admission=admission,
                        chart_date=chart_date,
                        recorded_by=user,
                        patient_weight_kg=Decimal(day_def["weight_kg"])
                        if day_def.get("weight_kg")
                        else None,
                        intravenous_infusion_notes=day_def.get("iv_notes", ""),
                    )
                    created["fluid_sheets"] += 1
                    for entry_def in day_def.get("entries", []):
                        entry_time = admission_date + timedelta(
                            days=day_def["day_offset"], hours=entry_def["hour"]
                        )
                        FluidBalanceEntry.objects.create(
                            fluid_balance_sheet=sheet,
                            recorded_at=entry_time,
                            recorded_by=user,
                            entry_type=entry_def["type"],
                            item_type=entry_def.get("item", ""),
                            amount_ml=entry_def.get("amount_ml"),
                            notes=entry_def.get("notes", ""),
                        )
                        created["fluid_entries"] += 1

        # --- Summary ---
        self.stdout.write("")
        label = "Would create (dry run):" if dry_run else "Rich inpatient demo data seeded:"
        self.stdout.write(self.style.SUCCESS(label))
        for key, count in created.items():
            if count > 0:
                self.stdout.write(f"  {key}: {count}")

    # -----------------------------------------------------------------------
    # Dry-run tally
    # -----------------------------------------------------------------------
    def _tally_dry_run(self, scenario, created):
        created["patients"] += 1
        created["opd_encounters"] += 1
        created["admissions"] += 1
        created["allergies"] += len(scenario.get("allergies", []))
        created["rounds"] += len(scenario.get("rounds", []))
        if scenario.get("kardex"):
            created["kardex_updates"] += 1
        if scenario.get("care_plan"):
            created["care_plans"] += 1
        if scenario.get("ai_care_plan"):
            created["ai_care_plans"] += 1
        created["shift_notes"] += len(scenario.get("shift_notes", []))
        created["tpr_readings"] += len(scenario.get("tpr", []))
        created["bp_readings"] += len(scenario.get("bp_readings", []))
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
        fb = scenario.get("fluid_balance")
        if fb:
            days = fb.get("days", [])
            created["fluid_sheets"] += len(days)
            for d in days:
                created["fluid_entries"] += len(d.get("entries", []))

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------
    def _clear_demo_data(self):
        demo_patients = Patient.objects.filter(middle_name__startswith=DEMO_TAG_PREFIX)
        count = demo_patients.count()
        if not count:
            self.stdout.write("No existing rich demo data to clear")
            return
        # Delete AI care plans first (FK to admission)
        AICarePlanResult.objects.filter(
            admission__patient__middle_name__startswith=DEMO_TAG_PREFIX
        ).delete()
        # Cascade delete patients
        from collections import defaultdict

        from django.db.models.deletion import ProtectedError

        def _force_delete(qs):
            for _ in range(30):
                try:
                    qs.delete()
                    return
                except ProtectedError as exc:
                    blocking = exc.protected_objects
                    if not blocking:
                        raise
                    by_model: dict[type, list] = defaultdict(list)
                    for obj in blocking:
                        by_model[type(obj)].append(obj.pk)
                    for model_cls, pks in by_model.items():
                        _force_delete(model_cls.objects.filter(pk__in=pks))

        _force_delete(demo_patients)
        self.stdout.write(
            self.style.WARNING(f"Cleared {count} rich demo patients and related data")
        )

    def _get_or_create_location(self):
        county = County.objects.first()
        if not county:
            county = County.objects.create(code=1, name="Mombasa")
        sub_county = SubCounty.objects.filter(county=county).first()
        if not sub_county:
            sub_county = SubCounty.objects.create(county=county, name="Mvita")
        return county, sub_county

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
            last_name="Omondi",
            is_staff=True,
        )

    def _get_or_create_incoming_nurse(self):
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

    def _get_facility(self, facility_id=None):
        if facility_id:
            return Facility.objects.get(pk=facility_id)
        return Facility.objects.first()

    def _ensure_wards(self) -> dict:
        ward_defs = [
            ("MEDICAL", "Medical Ward", "MED-01", Decimal("1500.00"), 20),
            ("SURGICAL", "Surgical Ward", "SUR-01", Decimal("2000.00"), 15),
            ("PEDIATRIC", "Paediatric Ward", "PED-01", Decimal("1200.00"), 12),
            ("ICU", "Intensive Care Unit", "ICU-01", Decimal("8000.00"), 6),
        ]
        wards = {}
        for wtype, name, code, rate, cap in ward_defs:
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

    def _get_available_bed(self, ward):
        if not ward:
            return None
        return ward.beds.filter(status="AVAILABLE").first()

    def _ensure_test_catalog(self) -> dict:
        from hmis.apps.inpatient.management.commands.seed_inpatient_demo import TEST_CATALOG_DEFS

        catalog = {}
        for (
            code,
            name,
            category,
            specimen,
            result_type,
            unit,
            male_range,
            female_range,
            cost,
        ) in TEST_CATALOG_DEFS:
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
        from hmis.apps.inpatient.management.commands.seed_inpatient_demo import DRUG_DEFS

        drug_map = {}
        for (
            code,
            generic_name,
            form,
            strength,
            unit,
            categories,
            schedule,
            is_essential,
            cost,
        ) in DRUG_DEFS:
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
        from hmis.apps.inpatient.management.commands.seed_inpatient_demo import (
            IMAGING_PROCEDURE_DEFS,
        )

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

    def _create_patient(
        self, scenario, county, sub_county, tag, facility=None, organization=None
    ) -> Patient:
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
            middle_name=tag,
            phone_number=tag,
            **(
                {"organization": organization, "registered_at_facility": facility}
                if organization
                else {}
            ),
        )
