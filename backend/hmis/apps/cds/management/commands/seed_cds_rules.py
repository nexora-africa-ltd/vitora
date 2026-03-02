"""
Management command to seed initial CDS rules.

Seeds the following rule categories:
- Vital sign alerts (temperature, pulse, SpO2, blood pressure, respiratory rate)
- Drug-allergy interaction (generic prescribing check)
- Drug-drug interactions (common interactions)
- Critical lab values (potassium, sodium, glucose, hemoglobin, creatinine)
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandParser

from hmis.apps.cds.models import CDSRule, CDSRuleStatus


INITIAL_RULES: list[dict] = [
    # ─── Vital Sign Rules ───
    {
        "code": "VITAL-TEMP-HIGH",
        "name": "High Temperature (Fever)",
        "description": "Alert when patient temperature exceeds 38.0°C indicating fever.",
        "category": "VITAL_SIGN",
        "priority": "HIGH",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "⚠️ High temperature detected: {value}°C (threshold: >{threshold}°C). {label}.",
        "suggestion": "Assess for infection source. Consider antipyretics and blood cultures if >38.5°C.",
        "condition": {
            "type": "vital_range",
            "vital": "temperature",
            "max": 38.0,
            "max_label": "Fever",
        },
        "references": ["Kenya Clinical Guidelines 2022 — Fever Management"],
    },
    {
        "code": "VITAL-TEMP-LOW",
        "name": "Low Temperature (Hypothermia)",
        "description": "Alert when patient temperature drops below 35.5°C indicating hypothermia.",
        "category": "VITAL_SIGN",
        "priority": "HIGH",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "⚠️ Low temperature detected: {value}°C (threshold: <{threshold}°C). {label}.",
        "suggestion": "Assess for hypothermia cause. Active warming measures. Monitor core temperature.",
        "condition": {
            "type": "vital_range",
            "vital": "temperature",
            "min": 35.5,
            "min_label": "Hypothermia",
        },
        "references": ["WHO Integrated Management guidelines"],
    },
    {
        "code": "VITAL-SPO2-LOW",
        "name": "Low Oxygen Saturation (Hypoxemia)",
        "description": "Critical alert when SpO2 drops below 95% indicating hypoxemia.",
        "category": "VITAL_SIGN",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "CONTRAINDICATE",
        "action_message": "🚨 Critical: SpO2 {value}% is below {threshold}%. Immediate intervention required.",
        "suggestion": "Administer supplemental oxygen. Assess airway, breathing. Consider ABG. Escalate to senior clinician.",
        "condition": {
            "type": "vital_range",
            "vital": "spo2",
            "min": 95.0,
            "min_label": "Hypoxemia",
        },
        "references": ["Kenya Emergency Triage Assessment and Treatment (ETAT+)", "WHO Oxygen Therapy guidelines"],
    },
    {
        "code": "VITAL-PULSE-HIGH",
        "name": "Tachycardia",
        "description": "Alert when pulse rate exceeds 100 bpm in adults.",
        "category": "VITAL_SIGN",
        "priority": "MEDIUM",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "⚠️ Tachycardia: Pulse {value} bpm exceeds {threshold} bpm.",
        "suggestion": "Assess for pain, anxiety, dehydration, infection, or cardiac cause. ECG if persistent.",
        "condition": {
            "type": "vital_range",
            "vital": "pulse",
            "max": 100,
            "max_label": "Tachycardia",
        },
        "references": ["AHA Guidelines for tachycardia evaluation"],
    },
    {
        "code": "VITAL-PULSE-LOW",
        "name": "Bradycardia",
        "description": "Alert when pulse rate drops below 60 bpm.",
        "category": "VITAL_SIGN",
        "priority": "MEDIUM",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "⚠️ Bradycardia: Pulse {value} bpm below {threshold} bpm.",
        "suggestion": "Assess for medication effects (beta-blockers), cardiac conduction disease. ECG recommended.",
        "condition": {
            "type": "vital_range",
            "vital": "pulse",
            "min": 60,
            "min_label": "Bradycardia",
        },
        "references": ["AHA ACLS Bradycardia algorithm"],
    },
    {
        "code": "VITAL-BP-SYS-HIGH",
        "name": "Hypertension (Systolic)",
        "description": "Alert when systolic blood pressure exceeds 140 mmHg.",
        "category": "VITAL_SIGN",
        "priority": "MEDIUM",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "⚠️ Elevated systolic BP: {value} mmHg (threshold: >{threshold} mmHg).",
        "suggestion": "Repeat measurement after 5 min rest. Review antihypertensive medications. Lifestyle counselling.",
        "condition": {
            "type": "vital_range",
            "vital": "systolic_bp",
            "max": 140,
            "max_label": "Hypertension",
        },
        "references": ["Kenya National Guidelines for Cardiovascular Disease Management 2018"],
    },
    {
        "code": "VITAL-BP-SYS-CRISIS",
        "name": "Hypertensive Crisis",
        "description": "Critical alert when systolic BP exceeds 180 mmHg — hypertensive emergency risk.",
        "category": "VITAL_SIGN",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "CONTRAINDICATE",
        "action_message": "🚨 Hypertensive crisis: Systolic BP {value} mmHg exceeds {threshold} mmHg!",
        "suggestion": "Immediate assessment for end-organ damage. IV antihypertensives if symptomatic. Urgent referral.",
        "condition": {
            "type": "vital_range",
            "vital": "systolic_bp",
            "max": 180,
            "max_label": "Hypertensive Crisis",
        },
        "references": ["JNC 8 Hypertension Guidelines", "Kenya Emergency Medicine Guidelines"],
    },
    {
        "code": "VITAL-RR-HIGH",
        "name": "Tachypnea",
        "description": "Alert when respiratory rate exceeds 20 breaths/min in adults.",
        "category": "VITAL_SIGN",
        "priority": "MEDIUM",
        "evidence_level": "B",
        "action_type": "ALERT",
        "action_message": "⚠️ Tachypnea: Respiratory rate {value} breaths/min (threshold: >{threshold}).",
        "suggestion": "Assess for respiratory distress, pneumonia, metabolic acidosis. SpO2 monitoring.",
        "condition": {
            "type": "vital_range",
            "vital": "respiratory_rate",
            "max": 20,
            "max_label": "Tachypnea",
        },
        "references": ["WHO ETAT+ guidelines"],
    },
    # ─── Drug-Allergy Interaction ───
    {
        "code": "DRUG-ALLERGY-001",
        "name": "Drug-Allergy Interaction Check",
        "description": "Checks if the drug being prescribed matches any of the patient's known allergies.",
        "category": "DRUG_ALLERGY",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "CONTRAINDICATE",
        "action_message": "🚨 Drug-allergy interaction: Patient has documented allergy to '{allergy}'. Prescribing '{prescribing_drug}' is contraindicated.",
        "suggestion": "Do NOT prescribe this medication. Choose an alternative drug from a different class. Document reason if override is clinically justified.",
        "condition": {
            "type": "drug_allergy",
            "check_mode": "prescribing",
        },
        "references": ["WHO Patient Safety — Medication Without Harm", "Kenya Pharmacy & Poisons Board guidelines"],
    },
    {
        "code": "DRUG-ALLERGY-PEN",
        "name": "Penicillin Allergy Cross-Reactivity",
        "description": "Warns about penicillin allergy and cross-reactivity with other beta-lactams.",
        "category": "DRUG_ALLERGY",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "CONTRAINDICATE",
        "action_message": "🚨 Patient has '{allergy}' allergy. '{medication}' may cross-react with penicillin-class antibiotics.",
        "suggestion": "Avoid all penicillin-class and consider cephalosporin cross-reactivity (~2%). Use macrolides or fluoroquinolones as alternatives.",
        "condition": {
            "type": "drug_allergy",
            "substance": "penicillin",
            "cross_reactive": ["amoxicillin", "ampicillin", "piperacillin", "flucloxacillin"],
        },
        "references": ["UpToDate — Penicillin Allergy", "Kenya Essential Medicines List 2023"],
    },
    # ─── Drug-Drug Interactions ───
    {
        "code": "DDI-WARF-ASP",
        "name": "Warfarin-Aspirin Interaction",
        "description": "Major interaction: concurrent warfarin and aspirin increases bleeding risk.",
        "category": "DRUG_DRUG",
        "priority": "HIGH",
        "evidence_level": "A",
        "action_type": "WARN",
        "action_message": "⚠️ Drug interaction: {drug_a} + {drug_b} — increased bleeding risk (severity: {severity}).",
        "suggestion": "Monitor INR closely. Consider PPI for GI protection. Assess whether dual therapy is indicated.",
        "condition": {
            "type": "drug_drug",
            "drug_a": "warfarin",
            "drug_b": "aspirin",
            "severity": "major",
        },
        "references": ["BNF Interactions", "Kenya Clinical Pharmacology Guidelines"],
    },
    {
        "code": "DDI-METRO-ALCO",
        "name": "Metronidazole-Alcohol Interaction",
        "description": "Metronidazole with alcohol causes disulfiram-like reaction.",
        "category": "DRUG_DRUG",
        "priority": "HIGH",
        "evidence_level": "A",
        "action_type": "WARN",
        "action_message": "⚠️ Drug interaction: {drug_a} + {drug_b} — disulfiram-like reaction (severity: {severity}).",
        "suggestion": "Counsel patient to avoid ALL alcohol during treatment and 48h after completion.",
        "condition": {
            "type": "drug_drug",
            "drug_a": "metronidazole",
            "drug_b": "alcohol",
            "severity": "major",
        },
        "references": ["BNF Interactions"],
    },
    {
        "code": "DDI-ACE-POTASSIUM",
        "name": "ACE Inhibitor-Potassium Supplement Interaction",
        "description": "ACE inhibitors with potassium supplements risk hyperkalemia.",
        "category": "DRUG_DRUG",
        "priority": "HIGH",
        "evidence_level": "A",
        "action_type": "WARN",
        "action_message": "⚠️ Drug interaction: {drug_a} + {drug_b} — risk of hyperkalemia (severity: {severity}).",
        "suggestion": "Monitor serum potassium levels. Avoid routine potassium supplementation with ACE inhibitors.",
        "condition": {
            "type": "drug_drug",
            "drug_a": "enalapril",
            "drug_b": "potassium",
            "severity": "major",
        },
        "references": ["Kenya Cardiovascular Disease Guidelines 2018"],
    },
    # ─── Critical Lab Values ───
    {
        "code": "LAB-K-CRIT",
        "name": "Critical Potassium Level",
        "description": "Alert on critically high or low serum potassium — cardiac arrest risk.",
        "category": "CRITICAL_LAB",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "CONTRAINDICATE",
        "action_message": "🚨 Critical potassium: {value} {unit} ({direction}). Threshold: {threshold} {unit}.",
        "suggestion": "Stat ECG. If hyperkalemia: calcium gluconate, insulin+dextrose, salbutamol nebulizer. If hypokalemia: IV KCl replacement.",
        "condition": {
            "type": "lab_range",
            "test_name": "potassium",
            "critical_low": 2.5,
            "critical_high": 6.5,
            "unit": "mmol/L",
        },
        "references": ["WHO Emergency Lab Guidelines", "Kenya ETAT+"],
    },
    {
        "code": "LAB-NA-CRIT",
        "name": "Critical Sodium Level",
        "description": "Alert on critically high or low serum sodium.",
        "category": "CRITICAL_LAB",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "🚨 Critical sodium: {value} {unit} ({direction}). Threshold: {threshold} {unit}.",
        "suggestion": "If hyponatremia: fluid restriction, assess for SIADH. If hypernatremia: controlled hydration. Correct slowly (<10 mmol/24h).",
        "condition": {
            "type": "lab_range",
            "test_name": "sodium",
            "critical_low": 120,
            "critical_high": 160,
            "unit": "mmol/L",
        },
        "references": ["WHO Clinical Management Guidelines"],
    },
    {
        "code": "LAB-GLU-CRIT-LOW",
        "name": "Critical Low Glucose (Hypoglycemia)",
        "description": "Alert on critically low blood glucose — neurological emergency.",
        "category": "CRITICAL_LAB",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "CONTRAINDICATE",
        "action_message": "🚨 Critical hypoglycemia: Glucose {value} {unit} below {threshold} {unit}.",
        "suggestion": "Immediate IV dextrose 50% (50ml) or oral glucose if conscious. Recheck in 15 minutes.",
        "condition": {
            "type": "lab_range",
            "test_name": "glucose",
            "critical_low": 2.2,
            "unit": "mmol/L",
        },
        "references": ["Kenya Diabetes Management Guidelines 2020", "WHO Hypoglycemia Protocol"],
    },
    {
        "code": "LAB-GLU-CRIT-HIGH",
        "name": "Critical High Glucose (Hyperglycemia)",
        "description": "Alert on critically high blood glucose — DKA/HHS risk.",
        "category": "CRITICAL_LAB",
        "priority": "HIGH",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "⚠️ Critical hyperglycemia: Glucose {value} {unit} above {threshold} {unit}.",
        "suggestion": "Assess for DKA (ketones, pH) or HHS. IV fluids + insulin infusion protocol. Monitor hourly.",
        "condition": {
            "type": "lab_range",
            "test_name": "glucose",
            "critical_high": 25.0,
            "unit": "mmol/L",
        },
        "references": ["Kenya Diabetes Management Guidelines 2020"],
    },
    {
        "code": "LAB-HB-CRIT-LOW",
        "name": "Critical Low Hemoglobin (Severe Anemia)",
        "description": "Alert on critically low hemoglobin — transfusion threshold.",
        "category": "CRITICAL_LAB",
        "priority": "CRITICAL",
        "evidence_level": "A",
        "action_type": "ALERT",
        "action_message": "🚨 Severe anemia: Hemoglobin {value} {unit} below {threshold} {unit}.",
        "suggestion": "Type and crossmatch. Transfuse if symptomatic or Hb <5 g/dL (Kenya ETAT+). Investigate cause.",
        "condition": {
            "type": "lab_range",
            "test_name": "hemoglobin",
            "critical_low": 7.0,
            "unit": "g/dL",
        },
        "references": ["Kenya ETAT+", "WHO Blood Transfusion Safety guidelines"],
    },
    {
        "code": "LAB-CREAT-HIGH",
        "name": "Elevated Creatinine (Renal Impairment)",
        "description": "Alert on significantly elevated creatinine level.",
        "category": "CRITICAL_LAB",
        "priority": "HIGH",
        "evidence_level": "B",
        "action_type": "ALERT",
        "action_message": "⚠️ Elevated creatinine: {value} {unit} above {threshold} {unit}.",
        "suggestion": "Assess renal function (eGFR). Review nephrotoxic drugs. Consider fluid challenge if pre-renal. Nephrology consult if persistent.",
        "condition": {
            "type": "lab_range",
            "test_name": "creatinine",
            "critical_high": 300,
            "unit": "μmol/L",
        },
        "references": ["KDIGO AKI Guidelines", "Kenya Renal Disease Guidelines"],
    },
]


class Command(BaseCommand):
    help = "Seed initial CDS rules (vital signs, drug-allergy, drug-drug, critical lab values)"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview rules without creating them",
        )
        parser.add_argument(
            "--activate",
            action="store_true",
            help="Also activate all seeded rules (default: created as DRAFT)",
        )

    def handle(self, *args: object, **kwargs: object) -> None:
        dry_run = kwargs.get("dry_run", False)
        activate = kwargs.get("activate", False)

        created_count = 0
        skipped_count = 0

        for rule_data in INITIAL_RULES:
            code = rule_data["code"]
            exists = CDSRule.objects.filter(code=code).exists()

            if exists:
                skipped_count += 1
                self.stdout.write(self.style.WARNING(f"  SKIP: {code} — already exists"))
                continue

            if dry_run:
                self.stdout.write(self.style.SUCCESS(
                    f"  WOULD CREATE: {code} — {rule_data['name']} [{rule_data['category']}]"
                ))
                created_count += 1
                continue

            status_val = CDSRuleStatus.ACTIVE if activate else CDSRuleStatus.DRAFT
            CDSRule.objects.create(
                code=rule_data["code"],
                name=rule_data["name"],
                description=rule_data.get("description", ""),
                category=rule_data["category"],
                priority=rule_data["priority"],
                evidence_level=rule_data.get("evidence_level", "D"),
                status=status_val,
                condition=rule_data["condition"],
                action_type=rule_data.get("action_type", "ALERT"),
                action_message=rule_data["action_message"],
                suggestion=rule_data.get("suggestion", ""),
                references=rule_data.get("references", []),
                metadata=rule_data.get("metadata", {}),
            )
            created_count += 1
            self.stdout.write(self.style.SUCCESS(
                f"  CREATED: {code} — {rule_data['name']} [{status_val}]"
            ))

        self.stdout.write("")
        prefix = "DRY RUN: " if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"{prefix}CDS rules seeded: {created_count} created, {skipped_count} skipped"
        ))
