#!/usr/bin/env python3
"""
Generate RBAC Matrix as an Excel workbook for Google Sheets import.

Produces docs/rbac-permissions-matrix.xlsx with three sheets:
1. Action Permissions   — Action-level permissions (rows) × Roles (columns)
2. Module Access        — Module access (rows) × Roles (columns)
3. Facility Modules     — Facility module availability by KEPH level

Roles are loaded from backend/hmis/apps/core/fixtures/roles.json (single source of truth).
Boolean cells have data-validation checkboxes and conditional formatting (green/red).
"""
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
    from openpyxl import Workbook
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    output_dir = os.path.join(os.path.dirname(__file__), "..", "docs")
    output_file = os.path.join(output_dir, "rbac-permissions-matrix.xlsx")

    wb = Workbook()

    # Shared styles
    header_font = Font(bold=True, size=11)
    title_font = Font(bold=True, size=14, color="FFFFFF")
    subtitle_font = Font(italic=True, size=10, color="666666")
    category_font = Font(bold=True, size=9, color="555555")
    code_font = Font(size=8, color="999999", italic=True)
    title_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_fill = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")
    green_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    red_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
    green_font = Font(color="006100")
    red_font = Font(color="9C0006")
    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )

    # Checkbox data validation (TRUE/FALSE)
    checkbox_dv = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=False)
    checkbox_dv.showErrorMessage = True
    checkbox_dv.errorTitle = "Invalid"
    checkbox_dv.error = "Use TRUE or FALSE"

    def style_title_row(ws, row, max_col):
        for col in range(1, max_col + 1):
            cell = ws.cell(row=row, column=col)
            cell.font = title_font
            cell.fill = title_fill
            cell.alignment = Alignment(horizontal="left")

    def style_header_row(ws, row, max_col):
        for col in range(1, max_col + 1):
            cell = ws.cell(row=row, column=col)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
            cell.border = thin_border

    def add_conditional_formatting(ws, min_col, max_col, min_row, max_row):
        cell_range = (
            f"{get_column_letter(min_col)}{min_row}:"
            f"{get_column_letter(max_col)}{max_row}"
        )
        ws.conditional_formatting.add(
            cell_range,
            CellIsRule(operator="equal", formula=['"TRUE"'], fill=green_fill, font=green_font),
        )
        ws.conditional_formatting.add(
            cell_range,
            CellIsRule(operator="equal", formula=['"FALSE"'], fill=red_fill, font=red_font),
        )

    # =========================================================================
    # Sheet 1: Action Permissions Matrix
    # =========================================================================
    ws1 = wb.active
    ws1.title = "Action Permissions"
    ws1.sheet_properties.tabColor = "1F4E79"

    num_roles = len(ALL_ROLES)
    max_col = 3 + num_roles

    # Row 1: Title
    ws1.cell(row=1, column=1, value="VITORA HMIS — Action Permissions Matrix")
    ws1.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
    style_title_row(ws1, 1, max_col)

    # Row 2: Subtitle
    ws1.cell(row=2, column=1, value="Toggle TRUE/FALSE to validate against your facility's real-life role assignments.")
    ws1.cell(row=2, column=1).font = subtitle_font

    # Row 3: Category headers
    for i, role in enumerate(ALL_ROLES):
        cell = ws1.cell(row=3, column=4 + i, value=ROLE_CATEGORIES[role])
        cell.font = category_font
        cell.alignment = Alignment(horizontal="center")

    # Row 4: Column headers
    ws1.cell(row=4, column=1, value="Module")
    ws1.cell(row=4, column=2, value="Action")
    ws1.cell(row=4, column=3, value="Description")
    for i, role in enumerate(ALL_ROLES):
        ws1.cell(row=4, column=4 + i, value=ROLE_DISPLAY_NAMES[role])
    style_header_row(ws1, 4, max_col)

    # Row 5: Role codes
    for i, role in enumerate(ALL_ROLES):
        cell = ws1.cell(row=5, column=4 + i, value=role)
        cell.font = code_font
        cell.alignment = Alignment(horizontal="center")

    # Data rows
    row_num = 6
    data_start_row = row_num
    current_module = None
    for action_key, allowed_roles in ACTION_PERMISSIONS.items():
        module = action_key.split(".")[0]
        if module != current_module:
            current_module = module

        description = ACTION_DESCRIPTIONS.get(action_key, action_key.split(".")[1])
        ws1.cell(row=row_num, column=1, value=module.upper()).font = Font(bold=True)
        ws1.cell(row=row_num, column=2, value=action_key)
        ws1.cell(row=row_num, column=3, value=description)
        for i, role in enumerate(ALL_ROLES):
            cell = ws1.cell(row=row_num, column=4 + i)
            cell.value = "TRUE" if role in allowed_roles else "FALSE"
            cell.alignment = Alignment(horizontal="center")
            cell.border = thin_border
        row_num += 1
    data_end_row = row_num - 1

    # Add validation and formatting to boolean cells
    ws1.add_data_validation(checkbox_dv)
    bool_range = f"{get_column_letter(4)}{data_start_row}:{get_column_letter(max_col)}{data_end_row}"
    checkbox_dv.add(bool_range)
    add_conditional_formatting(ws1, 4, max_col, data_start_row, data_end_row)

    # Column widths
    ws1.column_dimensions["A"].width = 14
    ws1.column_dimensions["B"].width = 30
    ws1.column_dimensions["C"].width = 36
    for i in range(num_roles):
        ws1.column_dimensions[get_column_letter(4 + i)].width = 12

    ws1.freeze_panes = "D6"

    # =========================================================================
    # Sheet 2: Module Access Matrix
    # =========================================================================
    ws2 = wb.create_sheet("Module Access")
    ws2.sheet_properties.tabColor = "2E75B6"

    max_col2 = 2 + num_roles

    ws2.cell(row=1, column=1, value="VITORA HMIS — Module Access Matrix (Sidebar Visibility)")
    ws2.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col2)
    style_title_row(ws2, 1, max_col2)

    ws2.cell(row=2, column=1, value="Can this role SEE this module in the sidebar?")
    ws2.cell(row=2, column=1).font = subtitle_font

    for i, role in enumerate(ALL_ROLES):
        cell = ws2.cell(row=3, column=3 + i, value=ROLE_CATEGORIES[role])
        cell.font = category_font
        cell.alignment = Alignment(horizontal="center")

    ws2.cell(row=4, column=1, value="Module")
    ws2.cell(row=4, column=2, value="Description")
    for i, role in enumerate(ALL_ROLES):
        ws2.cell(row=4, column=3 + i, value=ROLE_DISPLAY_NAMES[role])
    style_header_row(ws2, 4, max_col2)

    for i, role in enumerate(ALL_ROLES):
        cell = ws2.cell(row=5, column=3 + i, value=role)
        cell.font = code_font
        cell.alignment = Alignment(horizontal="center")

    checkbox_dv2 = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=False)
    checkbox_dv2.showErrorMessage = True
    ws2.add_data_validation(checkbox_dv2)

    row_num = 6
    data_start_row2 = row_num
    for module_key, description in MODULE_DESCRIPTIONS.items():
        access = MODULE_ROLE_ACCESS.get(module_key, [])
        ws2.cell(row=row_num, column=1, value=module_key).font = Font(bold=True)
        ws2.cell(row=row_num, column=2, value=description)
        for i, role in enumerate(ALL_ROLES):
            cell = ws2.cell(row=row_num, column=3 + i)
            cell.value = "TRUE" if (access == "ALL" or role in access) else "FALSE"
            cell.alignment = Alignment(horizontal="center")
            cell.border = thin_border
        row_num += 1
    data_end_row2 = row_num - 1

    bool_range2 = f"{get_column_letter(3)}{data_start_row2}:{get_column_letter(max_col2)}{data_end_row2}"
    checkbox_dv2.add(bool_range2)
    add_conditional_formatting(ws2, 3, max_col2, data_start_row2, data_end_row2)

    ws2.column_dimensions["A"].width = 16
    ws2.column_dimensions["B"].width = 40
    for i in range(num_roles):
        ws2.column_dimensions[get_column_letter(3 + i)].width = 12
    ws2.freeze_panes = "C6"

    # =========================================================================
    # Sheet 3: Facility Module Matrix by KEPH Level
    # =========================================================================
    ws3 = wb.create_sheet("Facility Modules")
    ws3.sheet_properties.tabColor = "548235"

    levels = list(KEPH_LEVELS.keys())
    keph_modules = list(next(iter(KEPH_LEVELS.values())).keys())
    max_col3 = 1 + len(levels)

    ws3.cell(row=1, column=1, value="VITORA HMIS — Facility Module Availability by KEPH Level")
    ws3.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col3)
    style_title_row(ws3, 1, max_col3)

    ws3.cell(row=2, column=1, value="Which modules are available at each Kenya KEPH facility level?")
    ws3.cell(row=2, column=1).font = subtitle_font

    ws3.cell(row=3, column=1, value="Module")
    for i, level in enumerate(levels):
        ws3.cell(row=3, column=2 + i, value=level)
    style_header_row(ws3, 3, max_col3)

    checkbox_dv3 = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=False)
    checkbox_dv3.showErrorMessage = True
    ws3.add_data_validation(checkbox_dv3)

    row_num = 4
    data_start_row3 = row_num
    for mod in keph_modules:
        ws3.cell(row=row_num, column=1, value=mod).font = Font(bold=True)
        for i, level_name in enumerate(levels):
            cell = ws3.cell(row=row_num, column=2 + i)
            cell.value = "TRUE" if KEPH_LEVELS[level_name][mod] else "FALSE"
            cell.alignment = Alignment(horizontal="center")
            cell.border = thin_border
        row_num += 1
    data_end_row3 = row_num - 1

    bool_range3 = f"{get_column_letter(2)}{data_start_row3}:{get_column_letter(max_col3)}{data_end_row3}"
    checkbox_dv3.add(bool_range3)
    add_conditional_formatting(ws3, 2, max_col3, data_start_row3, data_end_row3)

    ws3.column_dimensions["A"].width = 16
    for i in range(len(levels)):
        ws3.column_dimensions[get_column_letter(2 + i)].width = 28
    ws3.freeze_panes = "B4"

    # =========================================================================
    # Sheet 4: Role Reference (all 33 roles from fixture)
    # =========================================================================
    ws4 = wb.create_sheet("Role Reference")
    ws4.sheet_properties.tabColor = "BF8F00"

    ws4.cell(row=1, column=1, value="VITORA HMIS — Role Reference (from roles.json fixture)")
    ws4.merge_cells(start_row=1, start_column=1, end_row=1, end_column=7)
    style_title_row(ws4, 1, 7)

    ws4.cell(row=2, column=1, value="All roles loaded from backend/hmis/apps/core/fixtures/roles.json — single source of truth.")
    ws4.cell(row=2, column=1).font = subtitle_font

    ref_headers = ["PK", "Code", "Name", "Category", "License Required", "License Body", "Hierarchy Level"]
    for i, h in enumerate(ref_headers):
        ws4.cell(row=3, column=1 + i, value=h)
    style_header_row(ws4, 3, 7)

    for row_idx, entry in enumerate(_role_entries, start=4):
        fields = entry["fields"]
        ws4.cell(row=row_idx, column=1, value=entry["pk"])
        ws4.cell(row=row_idx, column=2, value=fields["code"]).font = Font(name="Consolas", size=10)
        ws4.cell(row=row_idx, column=3, value=fields["name"])
        ws4.cell(row=row_idx, column=4, value=fields["category"])
        ws4.cell(row=row_idx, column=5, value="Yes" if fields.get("requires_license") else "No")
        ws4.cell(row=row_idx, column=6, value=fields.get("license_body", ""))
        ws4.cell(row=row_idx, column=7, value=fields.get("hierarchy_level", ""))
        for col in range(1, 8):
            ws4.cell(row=row_idx, column=col).border = thin_border

    ws4.column_dimensions["A"].width = 6
    ws4.column_dimensions["B"].width = 24
    ws4.column_dimensions["C"].width = 32
    ws4.column_dimensions["D"].width = 18
    ws4.column_dimensions["E"].width = 16
    ws4.column_dimensions["F"].width = 14
    ws4.column_dimensions["G"].width = 16
    ws4.freeze_panes = "A4"

    # =========================================================================
    # Save
    # =========================================================================
    wb.save(output_file)
    print(f"✅ Created: {output_file}")
    print()
    print("📋 Next steps:")
    print("   1. Upload to Google Drive → Open with Google Sheets")
    print("   2. TRUE/FALSE cells have data validation — click to toggle")
    print("   3. Green = allowed, Red = denied (conditional formatting)")
    print("   4. Share with clinician consultant for validation")


if __name__ == "__main__":
    main()
