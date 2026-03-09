#!/usr/bin/env python3
"""
Generate RBAC Matrix CSVs for Google Sheets import.

Produces three CSV files:
1. action-permissions-matrix.csv   — Action-level permissions (rows) × Roles (columns)
2. module-access-matrix.csv        — Module access (rows) × Roles (columns)
3. facility-module-matrix.csv      — Facility module availability by KEPH level

Roles are loaded from backend/hmis/apps/core/fixtures/roles.json (single source of truth).
Pre-marked with current implementation from the codebase.
Clinician consultant can validate by toggling checkboxes in Google Sheets.
"""
import csv
import json
import os

# =============================================================================
# LOAD ROLES from the backend fixture (single source of truth)
# =============================================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FIXTURE_PATH = os.path.join(
    SCRIPT_DIR, "..", "backend", "hmis", "apps", "core", "fixtures", "roles.json"
)

with open(FIXTURE_PATH) as f:
    _fixture = json.load(f)

# Extract role entries in fixture order
_role_entries = [e for e in _fixture if e["model"] == "core.role"]

ALL_ROLES = [e["fields"]["code"] for e in _role_entries]

# Map fixture category values to human-readable group labels
_CATEGORY_LABELS = {
    "CLINICAL": "Clinical",
    "ADMINISTRATIVE": "Admin / Records",
    "TECHNICAL": "Technical",
    "MANAGEMENT": "Management",
    "COMMUNITY": "Community",
    "ALLIED_HEALTH": "Allied Health",
}

ROLE_CATEGORIES = {
    e["fields"]["code"]: _CATEGORY_LABELS.get(e["fields"]["category"], e["fields"]["category"])
    for e in _role_entries
}

ROLE_DISPLAY_NAMES = {
    e["fields"]["code"]: e["fields"]["name"]
    for e in _role_entries
}

# =============================================================================
# DATA: Mirrored from web-app/lib/permissions/actions.ts
# Role codes MUST match roles.json fixture codes.
# =============================================================================

ACTION_PERMISSIONS = {
    # === Inpatient Module ===
    "inpatient.view_ward": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE", "ADMIN"],
    "inpatient.record_vitals": ["DOCTOR", "CLINICAL_OFFICER", "NURSE"],
    "inpatient.make_rounds": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "inpatient.prescribe": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "inpatient.administer_medication": ["DOCTOR", "CLINICAL_OFFICER", "NURSE"],
    "inpatient.order_lab": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "inpatient.order_imaging": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "inpatient.discharge": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "inpatient.transfer": ["DOCTOR", "CLINICAL_OFFICER", "NURSE"],
    # === Pharmacy Module ===
    "pharmacy.view_prescriptions": ["PHARMACIST", "PHARMACY_TECH", "NURSE", "DOCTOR"],
    "pharmacy.dispense": ["PHARMACIST", "PHARMACY_TECH"],
    "pharmacy.verify_prescription": ["PHARMACIST"],
    "pharmacy.manage_stock": ["PHARMACIST", "PHARMACY_TECH", "STORE_KEEPER"],
    "pharmacy.adjust_inventory": ["PHARMACIST", "STORE_KEEPER"],
    # === Laboratory Module ===
    "laboratory.view_orders": ["LAB_TECH", "LAB_SCIENTIST", "DOCTOR", "NURSE"],
    "laboratory.collect_sample": ["LAB_TECH", "PHLEBOTOMIST", "NURSE"],
    "laboratory.enter_results": ["LAB_TECH", "LAB_SCIENTIST"],
    "laboratory.verify_results": ["LAB_SCIENTIST", "PATHOLOGIST"],
    "laboratory.release_results": ["LAB_SCIENTIST", "PATHOLOGIST"],
    # === Imaging Module ===
    "imaging.view_orders": ["RADIOGRAPHER", "SONOGRAPHER", "RADIOLOGIST", "DOCTOR", "NURSE"],
    "imaging.perform_scan": ["RADIOGRAPHER", "SONOGRAPHER", "MRI_TECHNOLOGIST", "CT_TECHNOLOGIST", "NUCLEAR_MED_TECH"],
    "imaging.upload_images": ["RADIOGRAPHER", "SONOGRAPHER", "MRI_TECHNOLOGIST", "CT_TECHNOLOGIST", "NUCLEAR_MED_TECH"],
    "imaging.write_report": ["RADIOLOGIST"],
    "imaging.verify_report": ["RADIOLOGIST"],
    # === Billing Module ===
    "billing.view_invoices": ["BILLING_CLERK", "CASHIER", "BILLING_SUPERVISOR"],
    "billing.create_invoice": ["BILLING_CLERK", "CASHIER"],
    "billing.record_payment": ["CASHIER", "BILLING_CLERK"],
    "billing.apply_discount": ["BILLING_SUPERVISOR", "ADMIN"],
    "billing.void_invoice": ["BILLING_SUPERVISOR", "ADMIN"],
    "billing.submit_sha_claim": ["BILLING_CLERK", "BILLING_SUPERVISOR"],
    # === Encounters Module ===
    "encounters.create": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE"],
    "encounters.prescribe": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "encounters.order_lab": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "encounters.order_imaging": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "encounters.diagnose": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER"],
    "encounters.refer": ["DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE"],
    # === Admin Module ===
    "admin.manage_staff": ["ADMIN", "HR_OFFICER"],
    "admin.manage_roles": ["ADMIN"],
    "admin.view_audit_logs": ["ADMIN", "COMPLIANCE_OFFICER"],
    "admin.manage_facilities": ["ADMIN"],
}

# =============================================================================
# DATA: Module access from web-app/lib/permissions/constants.ts
# =============================================================================

# moduleKey → required Django permission
MODULE_PERMISSIONS = {
    "dashboard": None,  # Everyone
    "checkin": "checkin.view_checkin",
    "patients": "patients.view_patient",
    "triage": "triage.view_triageassessment",
    "emergency": "encounters.view_encounter",
    "surveillance": "surveillance.view_notifiablecase",
    "clinics": "clinics.view_clinic",
    "encounters": "encounters.view_encounter",
    "inpatient": "inpatient.view_admission",
    "pharmacy": "pharmacy.view_prescription",
    "laboratory": "laboratory.view_laborder",
    "imaging": "imaging.view_imagingorder",
    "theatre": "scheduling.view_surgerycase",
    "billing": "billing.view_invoice",
    "admin": "core.view_staffprofile",
}

# Which roles typically have each module permission
# (inferred from action roles + Kenyan hospital conventions)
MODULE_ROLE_ACCESS = {
    "dashboard": "ALL",  # Everyone
    "checkin": [
        "RECEPTIONIST", "RECORDS_CLERK", "NURSE", "ADMIN",
    ],
    "patients": [
        "DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE", "RECEPTIONIST",
        "RECORDS_CLERK", "PHARMACIST", "LAB_TECH", "LAB_SCIENTIST",
        "RADIOGRAPHER", "RADIOLOGIST", "BILLING_CLERK", "CASHIER",
        "BILLING_SUPERVISOR", "ADMIN", "HR_OFFICER",
    ],
    "triage": [
        "NURSE", "CLINICAL_OFFICER", "DOCTOR",
    ],
    "emergency": [
        "DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE",
    ],
    "surveillance": [
        "DOCTOR", "CLINICAL_OFFICER", "NURSE", "ADMIN", "COMPLIANCE_OFFICER",
    ],
    "clinics": [
        "DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE",
    ],
    "encounters": [
        "DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE",
    ],
    "inpatient": [
        "DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE", "NURSE_AIDE", "ADMIN",
    ],
    "pharmacy": [
        "PHARMACIST", "PHARMACY_TECH", "DOCTOR", "CLINICAL_OFFICER", "NURSE",
    ],
    "laboratory": [
        "LAB_TECH", "LAB_SCIENTIST", "PATHOLOGIST", "PHLEBOTOMIST",
        "DOCTOR", "CLINICAL_OFFICER", "NURSE",
    ],
    "imaging": [
        "RADIOGRAPHER", "SONOGRAPHER", "RADIOLOGIST",
        "MRI_TECHNOLOGIST", "CT_TECHNOLOGIST", "NUCLEAR_MED_TECH",
        "RADIOLOGY_ASSISTANT", "DOCTOR", "CLINICAL_OFFICER", "NURSE",
    ],
    "theatre": [
        "DOCTOR", "CONSULTANT", "CLINICAL_OFFICER", "NURSE",
    ],
    "billing": [
        "BILLING_CLERK", "CASHIER", "BILLING_SUPERVISOR", "ADMIN",
    ],
    "admin": [
        "ADMIN", "HR_OFFICER", "COMPLIANCE_OFFICER",
    ],
}

# =============================================================================
# DATA: Facility modules by KEPH level (from rbac-capability-plan.md)
# =============================================================================

KEPH_LEVELS = {
    "Level 1 – Community Unit": {
        "outpatient": True,
        "inpatient": False,
        "emergency": False,
        "pharmacy": False,
        "laboratory": False,
        "imaging": False,
        "theatre": False,
        "icu": False,
        "maternity": False,
        "dialysis": False,
        "blood_bank": False,
        "mortuary": False,
    },
    "Level 2 – Dispensary": {
        "outpatient": True,
        "inpatient": False,
        "emergency": False,
        "pharmacy": True,
        "laboratory": False,
        "imaging": False,
        "theatre": False,
        "icu": False,
        "maternity": False,
        "dialysis": False,
        "blood_bank": False,
        "mortuary": False,
    },
    "Level 3 – Health Centre": {
        "outpatient": True,
        "inpatient": False,
        "emergency": False,
        "pharmacy": True,
        "laboratory": True,
        "imaging": False,
        "theatre": False,
        "icu": False,
        "maternity": True,
        "dialysis": False,
        "blood_bank": False,
        "mortuary": False,
    },
    "Level 4 – Sub-County Hospital": {
        "outpatient": True,
        "inpatient": True,
        "emergency": True,
        "pharmacy": True,
        "laboratory": True,
        "imaging": True,
        "theatre": True,
        "icu": False,
        "maternity": True,
        "dialysis": False,
        "blood_bank": False,
        "mortuary": False,
    },
    "Level 5 – County Referral": {
        "outpatient": True,
        "inpatient": True,
        "emergency": True,
        "pharmacy": True,
        "laboratory": True,
        "imaging": True,
        "theatre": True,
        "icu": True,
        "maternity": True,
        "dialysis": True,
        "blood_bank": False,
        "mortuary": False,
    },
    "Level 6 – National Referral": {
        "outpatient": True,
        "inpatient": True,
        "emergency": True,
        "pharmacy": True,
        "laboratory": True,
        "imaging": True,
        "theatre": True,
        "icu": True,
        "maternity": True,
        "dialysis": True,
        "blood_bank": True,
        "mortuary": True,
    },
}

# Human-readable descriptions for action keys
ACTION_DESCRIPTIONS = {
    "inpatient.view_ward": "View ward list and bed status",
    "inpatient.record_vitals": "Record patient vital signs",
    "inpatient.make_rounds": "Conduct ward rounds",
    "inpatient.prescribe": "Write prescriptions for inpatients",
    "inpatient.administer_medication": "Administer medication to patients",
    "inpatient.order_lab": "Order laboratory investigations",
    "inpatient.order_imaging": "Order imaging/radiology studies",
    "inpatient.discharge": "Discharge patients from the ward",
    "inpatient.transfer": "Transfer patients between wards",
    "pharmacy.view_prescriptions": "View prescription list",
    "pharmacy.dispense": "Dispense medication to patients",
    "pharmacy.verify_prescription": "Verify/validate prescriptions",
    "pharmacy.manage_stock": "Manage drug stock and inventory",
    "pharmacy.adjust_inventory": "Make stock adjustments/write-offs",
    "laboratory.view_orders": "View lab orders and results",
    "laboratory.collect_sample": "Collect patient samples",
    "laboratory.enter_results": "Enter lab test results",
    "laboratory.verify_results": "Verify/approve lab results",
    "laboratory.release_results": "Release results to clinicians",
    "imaging.view_orders": "View imaging orders/studies",
    "imaging.perform_scan": "Perform imaging scan",
    "imaging.upload_images": "Upload DICOM images",
    "imaging.write_report": "Write radiology report",
    "imaging.verify_report": "Verify/sign radiology report",
    "billing.view_invoices": "View patient invoices",
    "billing.create_invoice": "Create new invoices",
    "billing.record_payment": "Record patient payments",
    "billing.apply_discount": "Apply discounts/waivers",
    "billing.void_invoice": "Void/cancel invoices",
    "billing.submit_sha_claim": "Submit SHA insurance claims",
    "encounters.create": "Create clinical encounters",
    "encounters.prescribe": "Prescribe medication (OPD)",
    "encounters.order_lab": "Order lab tests from encounter",
    "encounters.order_imaging": "Order imaging from encounter",
    "encounters.diagnose": "Record diagnosis (ICD-10)",
    "encounters.refer": "Refer patient to another provider",
    "admin.manage_staff": "Manage staff profiles",
    "admin.manage_roles": "Create/edit roles and permissions",
    "admin.view_audit_logs": "View system audit logs",
    "admin.manage_facilities": "Manage facility settings",
}

MODULE_DESCRIPTIONS = {
    "dashboard": "Main dashboard and overview",
    "checkin": "Patient check-in / queue",
    "patients": "Patient registry and records",
    "triage": "Triage assessment queue",
    "emergency": "Emergency department",
    "surveillance": "Disease surveillance & IDSR reporting",
    "clinics": "Outpatient clinics (OPD, MCH, etc.)",
    "encounters": "Clinical encounters / consultations",
    "inpatient": "Inpatient wards and admissions",
    "pharmacy": "Pharmacy and dispensing",
    "laboratory": "Laboratory orders and results",
    "imaging": "Imaging / radiology",
    "theatre": "Operating theatre / surgery",
    "billing": "Finance, invoicing and payments",
    "admin": "System administration",
}


def main():
    output_dir = os.path.join(os.path.dirname(__file__), "..", "docs")

    # =========================================================================
    # Sheet 1: Action Permissions Matrix
    # =========================================================================
    action_file = os.path.join(output_dir, "rbac-action-permissions-matrix.csv")
    with open(action_file, "w", newline="") as f:
        writer = csv.writer(f)

        # Header rows
        writer.writerow(
            ["VITORA HMIS — Action Permissions Matrix"]
            + [""] * len(ALL_ROLES)
        )
        writer.writerow(
            ["Pre-marked with current implementation. Check (TRUE) or uncheck (FALSE) to validate."]
            + [""] * len(ALL_ROLES)
        )
        writer.writerow([])  # blank spacer

        # Role categories row
        writer.writerow(
            ["", "", ""]
            + [ROLE_CATEGORIES[r] for r in ALL_ROLES]
        )
        # Column headers
        writer.writerow(
            ["Module", "Action", "Description"]
            + [ROLE_DISPLAY_NAMES[r] for r in ALL_ROLES]
        )
        writer.writerow(
            ["", "", ""]
            + [r for r in ALL_ROLES]  # code row for reference
        )

        # Data rows grouped by module
        current_module = None
        for action_key, allowed_roles in ACTION_PERMISSIONS.items():
            module = action_key.split(".")[0]
            action_name = action_key.split(".")[1]

            # Module separator
            if module != current_module:
                if current_module is not None:
                    writer.writerow([])  # blank row between modules
                current_module = module

            description = ACTION_DESCRIPTIONS.get(action_key, action_name)
            row = [module.upper(), action_key, description]
            for role in ALL_ROLES:
                row.append("TRUE" if role in allowed_roles else "FALSE")
            writer.writerow(row)

    print(f"✅ Created: {action_file}")

    # =========================================================================
    # Sheet 2: Module Access Matrix
    # =========================================================================
    module_file = os.path.join(output_dir, "rbac-module-access-matrix.csv")
    with open(module_file, "w", newline="") as f:
        writer = csv.writer(f)

        # Header rows
        writer.writerow(
            ["VITORA HMIS — Module Access Matrix (Sidebar Visibility)"]
            + [""] * len(ALL_ROLES)
        )
        writer.writerow(
            ["Can this role SEE this module in the sidebar? Pre-marked with current implementation."]
            + [""] * len(ALL_ROLES)
        )
        writer.writerow([])

        # Role categories row
        writer.writerow(
            ["", ""]
            + [ROLE_CATEGORIES[r] for r in ALL_ROLES]
        )
        # Column headers
        writer.writerow(
            ["Module", "Description"]
            + [ROLE_DISPLAY_NAMES[r] for r in ALL_ROLES]
        )
        writer.writerow(
            ["", ""]
            + [r for r in ALL_ROLES]
        )

        for module_key, description in MODULE_DESCRIPTIONS.items():
            access = MODULE_ROLE_ACCESS.get(module_key, [])
            row = [module_key, description]
            for role in ALL_ROLES:
                if access == "ALL":
                    row.append("TRUE")
                else:
                    row.append("TRUE" if role in access else "FALSE")
            writer.writerow(row)

    print(f"✅ Created: {module_file}")

    # =========================================================================
    # Sheet 3: Facility Module Matrix by KEPH Level
    # =========================================================================
    facility_file = os.path.join(output_dir, "rbac-facility-module-matrix.csv")
    with open(facility_file, "w", newline="") as f:
        writer = csv.writer(f)

        levels = list(KEPH_LEVELS.keys())
        modules = list(next(iter(KEPH_LEVELS.values())).keys())

        # Header rows
        writer.writerow(
            ["VITORA HMIS — Facility Module Availability by KEPH Level"]
            + [""] * len(levels)
        )
        writer.writerow(
            ["Which modules are available at each Kenya facility level? Validate against your facility."]
            + [""] * len(levels)
        )
        writer.writerow([])

        # Column headers
        writer.writerow(["Module"] + levels)

        for mod in modules:
            row = [mod]
            for level_name in levels:
                row.append("TRUE" if KEPH_LEVELS[level_name][mod] else "FALSE")
            writer.writerow(row)

    print(f"✅ Created: {facility_file}")

    # =========================================================================
    # Sheet 4: Combined single CSV with all three matrices separated by headers
    # (easiest for importing to a single Google Sheet with multiple tabs)
    # =========================================================================
    combined_file = os.path.join(output_dir, "rbac-complete-matrix.csv")
    with open(combined_file, "w", newline="") as f:
        writer = csv.writer(f)

        max_cols = 3 + len(ALL_ROLES)

        # ── SECTION 1: Action Permissions ──
        writer.writerow(
            ["═══ SHEET 1: ACTION PERMISSIONS MATRIX ═══"] + [""] * (max_cols - 1)
        )
        writer.writerow(
            [
                "Pre-marked with current Vitora HMIS implementation (March 2026)."
            ]
            + [""] * (max_cols - 1)
        )
        writer.writerow(
            [
                "Instructions: In Google Sheets, select the TRUE/FALSE cells → Data → Data Validation → Checkbox."
            ]
            + [""] * (max_cols - 1)
        )
        writer.writerow(
            [
                "Then toggle checkboxes to match your facility's real-life setup."
            ]
            + [""] * (max_cols - 1)
        )
        writer.writerow([])

        writer.writerow(
            ["", "", ""] + [ROLE_CATEGORIES[r] for r in ALL_ROLES]
        )
        writer.writerow(
            ["Module", "Action", "Description"]
            + [ROLE_DISPLAY_NAMES[r] for r in ALL_ROLES]
        )
        writer.writerow(["", "", ""] + ALL_ROLES)

        current_module = None
        for action_key, allowed_roles in ACTION_PERMISSIONS.items():
            module = action_key.split(".")[0]
            if module != current_module:
                if current_module is not None:
                    writer.writerow([])
                current_module = module

            description = ACTION_DESCRIPTIONS.get(
                action_key, action_key.split(".")[1]
            )
            row = [module.upper(), action_key, description]
            for role in ALL_ROLES:
                row.append("TRUE" if role in allowed_roles else "FALSE")
            writer.writerow(row)

        # spacing
        writer.writerow([])
        writer.writerow([])

        # ── SECTION 2: Module Access ──
        writer.writerow(
            ["═══ SHEET 2: MODULE (SIDEBAR) ACCESS MATRIX ═══"]
            + [""] * (max_cols - 1)
        )
        writer.writerow(
            ["Can this role SEE this module in the sidebar navigation?"]
            + [""] * (max_cols - 1)
        )
        writer.writerow([])

        writer.writerow(["", ""] + [ROLE_CATEGORIES[r] for r in ALL_ROLES])
        writer.writerow(
            ["Module", "Description"]
            + [ROLE_DISPLAY_NAMES[r] for r in ALL_ROLES]
        )
        writer.writerow(["", ""] + ALL_ROLES)

        for module_key, description in MODULE_DESCRIPTIONS.items():
            access = MODULE_ROLE_ACCESS.get(module_key, [])
            row = [module_key, description]
            for role in ALL_ROLES:
                if access == "ALL":
                    row.append("TRUE")
                else:
                    row.append("TRUE" if role in access else "FALSE")
            writer.writerow(row)

        # spacing
        writer.writerow([])
        writer.writerow([])

        # ── SECTION 3: Facility Modules ──
        levels = list(KEPH_LEVELS.keys())
        modules = list(next(iter(KEPH_LEVELS.values())).keys())

        writer.writerow(
            ["═══ SHEET 3: FACILITY MODULE AVAILABILITY (KEPH LEVELS) ═══"]
            + [""] * (max_cols - 1)
        )
        writer.writerow(
            [
                "Which modules are available at each Kenya KEPH facility level?"
            ]
            + [""] * (max_cols - 1)
        )
        writer.writerow([])
        writer.writerow(["Module"] + levels)

        for mod in modules:
            row = [mod]
            for level_name in levels:
                row.append(
                    "TRUE" if KEPH_LEVELS[level_name][mod] else "FALSE"
                )
            writer.writerow(row)

    print(f"✅ Created: {combined_file}")
    print()
    print("📋 Next steps:")
    print("   1. Open Google Sheets → File → Import → Upload the CSV")
    print("   2. Select the TRUE/FALSE cells")
    print("   3. Data → Data Validation → Criteria: Checkbox")
    print("   4. Share with clinician consultant for validation")


if __name__ == "__main__":
    main()
