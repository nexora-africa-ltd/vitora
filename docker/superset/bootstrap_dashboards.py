#!/usr/bin/env python3
"""
Bootstrap Superset dashboards for Vitora HMIS.

Usage (remote — production Superset on Azure):
    python docker/superset/bootstrap_dashboards.py \\
        --url https://vitora-superset.agreeabledune-6cc420cc.eastus.azurecontainerapps.io \\
        --user admin --password 'YOUR_PASSWORD' \\
        --db-name PostgreSQL

Or local Docker:
    docker compose exec superset python /app/bootstrap_dashboards.py

Prerequisites:
    - Superset is running
    - Database connection has been added with the matching name
"""

import argparse
import json
import sys
import requests

# Defaults (override with CLI args)
SUPERSET_URL = "http://localhost:8088"
ADMIN_USER = "admin"
ADMIN_PASS = "admin"
DB_NAME = "PostgreSQL"  # Must match the database display name in Superset
REQUEST_TIMEOUT = 120  # seconds per API call (dataset introspection can be slow)

# ---------------------------------------------------------------------------
# Auth — with automatic re-login on 401
# ---------------------------------------------------------------------------

session = requests.Session()
_auth_creds = {}  # stored for re-auth on token expiry


def parse_args():
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Bootstrap Superset dashboards for Vitora HMIS")
    parser.add_argument("--url", default=SUPERSET_URL, help="Superset base URL")
    parser.add_argument("--user", default=ADMIN_USER, help="Admin username")
    parser.add_argument("--password", default=ADMIN_PASS, help="Admin password")
    parser.add_argument("--db-name", default=DB_NAME, help="Database display name in Superset")
    parser.add_argument("--schema", default="public", help="Database schema (default: public)")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Metric helpers — shorthand for Superset's verbose metric dicts
# ---------------------------------------------------------------------------

def COUNT(col: str, label: str) -> dict:
    return {"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": col}, "label": label}

def SUM(col: str, label: str) -> dict:
    return {"expressionType": "SIMPLE", "aggregate": "SUM", "column": {"column_name": col}, "label": label}

def AVG(col: str, label: str) -> dict:
    return {"expressionType": "SIMPLE", "aggregate": "AVG", "column": {"column_name": col}, "label": label}


def login(base_url, username, password):
    """Authenticate and get CSRF token. Stores creds for auto-refresh."""
    _auth_creds["base_url"] = base_url
    _auth_creds["username"] = username
    _auth_creds["password"] = password

    _do_login(base_url, username, password)
    print("✓ Authenticated with Superset")


def _do_login(base_url, username, password):
    """Internal: perform login + CSRF fetch."""
    payload = {"username": username, "password": password, "provider": "db"}
    r = session.post(f"{base_url}/api/v1/security/login", json=payload, timeout=30)
    if r.status_code != 200:
        print(f"\nLogin failed: {r.status_code} {r.text}")
        sys.exit(1)

    token = r.json()["access_token"]
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })

    # Get CSRF token
    r = session.get(f"{base_url}/api/v1/security/csrf_token/", timeout=30)
    if r.status_code == 200:
        csrf = r.json().get("result")
        if csrf:
            session.headers["X-CSRFToken"] = csrf
            session.headers["Referer"] = base_url


def _reauth():
    """Re-authenticate using stored credentials (token expired)."""
    print("(re-auth) ", end="", flush=True)
    _do_login(_auth_creds["base_url"], _auth_creds["username"], _auth_creds["password"])


def _is_csrf_error(response):
    """Check if a 400 response is a CSRF token error."""
    if response.status_code != 400:
        return False
    try:
        body = response.json()
        for err in body.get("errors", []):
            if "CSRF" in err.get("message", ""):
                return True
    except Exception:
        pass
    return "CSRF" in response.text[:500]


def api_get(url, **kwargs):
    """GET with auto retry on 401 (token expired)."""
    kwargs.setdefault("timeout", REQUEST_TIMEOUT)
    r = session.get(url, **kwargs)
    if r.status_code == 401:
        _reauth()
        r = session.get(url, **kwargs)
    return r


def api_post(url, **kwargs):
    """POST with auto retry on 401 or CSRF expiry."""
    kwargs.setdefault("timeout", REQUEST_TIMEOUT)
    r = session.post(url, **kwargs)
    if r.status_code == 401 or _is_csrf_error(r):
        _reauth()
        r = session.post(url, **kwargs)
    return r


def api_put(url, **kwargs):
    """PUT with auto retry on 401 or CSRF expiry."""
    kwargs.setdefault("timeout", REQUEST_TIMEOUT)
    r = session.put(url, **kwargs)
    if r.status_code == 401 or _is_csrf_error(r):
        _reauth()
        r = session.put(url, **kwargs)
    return r


def get_database_id(base_url, db_name):
    """Find the Vitora database by name."""
    r = api_get(f"{base_url}/api/v1/database/", params={"q": json.dumps({"filters": [{"col": "database_name", "opr": "eq", "value": db_name}]})})
    if r.status_code != 200:
        print(f"Failed to list databases: {r.status_code} {r.text}")
        sys.exit(1)

    results = r.json().get("result", [])
    if not results:
        print(f"✗ Database '{db_name}' not found. Add it in Superset first.")
        sys.exit(1)

    db_id = results[0]["id"]
    print(f"✓ Found database '{db_name}' (id={db_id})")
    return db_id


# ---------------------------------------------------------------------------
# Dataset creation
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Datasets — every meaningful table in the Vitora schema
# ---------------------------------------------------------------------------

DATASETS = [
    # ── Patients ──
    ("patients_patient", "Patients"),
    ("patients_allergy", "Allergies"),
    ("patients_emergencycontact", "Emergency Contacts"),
    ("patients_deathrecord", "Death Records"),
    # ── Encounters ──
    ("encounters_encounter", "Encounters"),
    ("encounters_diagnosis", "Diagnoses"),
    ("encounters_treatmentplan", "Treatment Plans"),
    ("encounters_medication", "Medications"),
    ("encounters_chroniccondition", "Chronic Conditions"),
    ("encounters_currentmedication", "Current Medications"),
    # ── Billing ──
    ("billing_invoice", "Invoices"),
    ("billing_invoiceitem", "Invoice Items"),
    ("billing_payment", "Payments"),
    ("billing_creditnote", "Credit Notes"),
    ("billing_receipt", "Receipts"),
    ("billing_service", "Services"),
    ("billing_servicecategory", "Service Categories"),
    ("billing_shaclaim", "SHA Claims"),
    ("billing_shaclaimitem", "SHA Claim Items"),
    ("billing_shapreauth", "SHA Preauths"),
    ("billing_sharemittance", "SHA Remittances"),
    ("billing_sharemittanceline", "SHA Remittance Lines"),
    ("billing_shaeligibilitycheck", "SHA Eligibility Checks"),
    ("billing_preauthrequest", "Preauth Requests"),
    # ── Laboratory ──
    ("laboratory_laborder", "Lab Orders"),
    ("laboratory_laborderitem", "Lab Order Items"),
    ("laboratory_labresult", "Lab Results"),
    # ── Pharmacy ──
    ("pharmacy_prescription", "Prescriptions"),
    ("pharmacy_prescriptionitem", "Prescription Items"),
    ("pharmacy_dispensing", "Dispensing Records"),
    ("pharmacy_drug", "Drugs"),
    ("pharmacy_stockbatch", "Pharmacy Stock Batches"),
    ("pharmacy_stockalert", "Pharmacy Stock Alerts"),
    ("pharmacy_stockadjustment", "Pharmacy Stock Adjustments"),
    # ── Triage ──
    ("triage_triageassessment", "Triage Assessments"),
    ("triage_triagequeue", "Triage Queue"),
    ("triage_escalation", "Triage Escalations"),
    ("triage_waittimebreach", "Wait Time Breaches"),
    # ── Inpatient ──
    ("inpatient_admission", "Admissions"),
    ("inpatient_discharge", "Discharges"),
    ("inpatient_transfer", "Transfers"),
    ("inpatient_ward", "Wards"),
    ("inpatient_bed", "Beds"),
    ("inpatient_wardround", "Ward Rounds"),
    ("inpatient_nursingkardex", "Nursing Kardex"),
    ("inpatient_shifthandover", "Shift Handovers"),
    ("inpatient_medicationadministration", "Medication Administration"),
    # ── Scheduling ──
    ("scheduling_shift", "Staff Shifts"),
    ("scheduling_appointment", "Appointments"),
    ("scheduling_resource", "Resources"),
    # ── Theatre ──
    ("theatre_surgerycase", "Surgery Cases"),
    ("theatre_anesthesiarecord", "Anesthesia Records"),
    ("theatre_operativenote", "Operative Notes"),
    ("theatre_whosafetychecklist", "WHO Safety Checklists"),
    ("theatre_operatingtheatre", "Operating Theatres"),
    # ── Imaging ──
    ("imaging_imagingorder", "Imaging Orders"),
    ("imaging_imagingorderitem", "Imaging Order Items"),
    ("imaging_radiologyreport", "Radiology Reports"),
    ("imaging_imagingprocedure", "Imaging Procedures"),
    # ── Immunizations ──
    ("immunizations_immunizationrecord", "Immunization Records"),
    ("immunizations_aefi", "AEFI Reports"),
    ("immunizations_vaccinestock", "Vaccine Stock"),
    ("immunizations_vaccinedefinition", "Vaccine Definitions"),
    ("immunizations_coldchainequipment", "Cold Chain Equipment"),
    ("immunizations_temperaturelog", "Temperature Logs"),
    # ── Clinics ──
    ("clinics_clinic", "Clinics"),
    ("clinics_clinicvisit", "Clinic Visits"),
    ("clinics_clinicsession", "Clinic Sessions"),
    ("clinics_clinicenrollment", "Clinic Enrollments"),
    # ── Surveillance ──
    ("surveillance_notifiablecase", "Notifiable Cases"),
    ("surveillance_ihrnotification", "IHR Notifications"),
    ("surveillance_idsrweeklyreport", "IDSR Weekly Reports"),
    ("surveillance_surveillancealert", "Surveillance Alerts"),
    # ── Analytics (pre-aggregated) ──
    ("analytics_facilitydailysummary", "Facility Daily Summary"),
    ("analytics_departmentmonthlysummary", "Department Monthly Summary"),
    ("analytics_diagnosistrend", "Diagnosis Trends"),
    ("analytics_patientdemographicsnapshot", "Patient Demographics Snapshot"),
    # ── Inventory ──
    ("inventory_purchaseorder", "Purchase Orders"),
    ("inventory_goodsreceiptnote", "Goods Receipt Notes"),
    ("inventory_stockcount", "Stock Counts"),
    ("inventory_stocktransfer", "Stock Transfers"),
    ("inventory_consumptionrecord", "Consumption Records"),
    ("inventory_supplier", "Suppliers"),
    # ── Blood Bank ──
    ("blood_bank_bloodunit", "Blood Units"),
    ("blood_bank_bloodrequest", "Blood Requests"),
    ("blood_bank_blooddonor", "Blood Donors"),
    ("blood_bank_crossmatch", "Cross Matches"),
    # ── Quality ──
    ("quality_qualitymeasure", "Quality Measures"),
    ("quality_qualitymeasureresult", "Quality Measure Results"),
    # ── Referrals ──
    ("referrals_clinicalreferral", "Clinical Referrals"),
    # ── Procedures ──
    ("procedures_procedureorder", "Procedure Orders"),
    ("procedures_procedurelog", "Procedure Logs"),
    # ── Allied Health ──
    ("physiotherapy_physiotherapyorder", "Physiotherapy Orders"),
    ("physiotherapy_physiotherapysession", "Physiotherapy Sessions"),
    ("counselling_counsellingsession", "Counselling Sessions"),
    ("counselling_counsellingreferral", "Counselling Referrals"),
    ("social_work_socialworkcase", "Social Work Cases"),
    # ── Core ──
    ("core_auditlog", "Audit Logs"),
    ("core_staffprofile", "Staff Profiles"),
    ("core_department", "Departments"),
    ("core_facility", "Facilities"),
    ("core_organization", "Organizations"),
    ("core_notification", "Notifications"),
    ("core_county", "Counties"),
    ("core_subcounty", "Sub-Counties"),
    # ── Check-in ──
    ("checkin_checkin", "Patient Check-ins"),
    # ── AI ──
    ("ai_chatsession", "AI Chat Sessions"),
    ("ai_chatmessage", "AI Chat Messages"),
    # ── CDS ──
    ("cds_cdsalert", "CDS Alerts"),
    # ── Sick Notes ──
    ("sick_notes_sicknote", "Sick Notes"),
    # ── Dialysis ──
    ("dialysis_dialysissession", "Dialysis Sessions"),
    ("dialysis_dialysisorder", "Dialysis Orders"),
]


def create_datasets(base_url, db_id, schema="public"):
    """Create datasets for key Vitora tables."""
    created = 0
    skipped = 0
    failed = 0
    total = len(DATASETS)

    for i, (table_name, display_name) in enumerate(DATASETS, 1):
        print(f"  [{i}/{total}] {table_name}... ", end="", flush=True)
        try:
            # Check if dataset already exists
            r = api_get(
                f"{base_url}/api/v1/dataset/",
                params={"q": json.dumps({"filters": [
                    {"col": "table_name", "opr": "eq", "value": table_name},
                    {"col": "database", "opr": "rel_o_m", "value": db_id},
                ]})},
            )

            if r.status_code == 200 and r.json().get("count", 0) > 0:
                skipped += 1
                print("exists")
                continue

            payload = {
                "database": db_id,
                "table_name": table_name,
                "schema": schema,
            }
            r = api_post(f"{base_url}/api/v1/dataset/", json=payload)
            if r.status_code in (200, 201):
                created += 1
                print("created")
            else:
                failed += 1
                print(f"FAILED ({r.status_code})")
        except requests.exceptions.Timeout:
            failed += 1
            print("TIMEOUT")
        except Exception as e:
            failed += 1
            print(f"ERROR ({e})")

    print(f"✓ Datasets: {created} created, {skipped} already existed, {failed} failed")


# ---------------------------------------------------------------------------
# Chart creation
# ---------------------------------------------------------------------------

def get_dataset_id(base_url, table_name):
    """Look up a dataset by table name."""
    r = api_get(
        f"{base_url}/api/v1/dataset/",
        params={"q": json.dumps({"filters": [{"col": "table_name", "opr": "eq", "value": table_name}]})},
    )
    if r.status_code == 200:
        results = r.json().get("result", [])
        if results:
            return results[0]["id"]
    return None


CHARTS = [
    # ═══════════════════════════════════════════════════════════════════════
    #  PATIENTS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Patient Registrations Over Time",
        "table": "patients_patient",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Patients")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Patients by Gender",
        "table": "patients_patient",
        "viz_type": "pie",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "pie",
            "groupby": ["gender"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Patients by County",
        "table": "patients_patient",
        "viz_type": "dist_bar",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["county_id"],
            "metrics": [COUNT("id", "Count")],
            "row_limit": 47,
            "order_desc": True,
        },
    },
    {
        "name": "Patient Age Distribution",
        "table": "patients_patient",
        "viz_type": "histogram",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "histogram",
            "all_columns_x": ["date_of_birth"],
            "row_limit": 50000,
        },
    },
    {
        "name": "Patients by Referral Source",
        "table": "patients_patient",
        "viz_type": "pie",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "pie",
            "groupby": ["referral_source"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Sensitive Patients Count",
        "table": "patients_patient",
        "viz_type": "big_number_total",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "big_number_total",
            "metric": COUNT("id", "Count"),
            "adhoc_filters": [{"clause": "WHERE", "comparator": "true", "expressionType": "SIMPLE", "operator": "==", "subject": "is_sensitive"}],
        },
    },
    {
        "name": "Allergy Types Distribution",
        "table": "patients_allergy",
        "viz_type": "pie",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "pie",
            "groupby": ["allergy_type"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Allergy Severity Distribution",
        "table": "patients_allergy",
        "viz_type": "pie",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "pie",
            "groupby": ["severity"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Death Records Over Time",
        "table": "patients_deathrecord",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Patient Analytics",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "date_of_death",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Deaths")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  ENCOUNTERS & CLINICAL
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Encounters by Type",
        "table": "encounters_encounter",
        "viz_type": "pie",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "pie",
            "groupby": ["encounter_type"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Encounters Over Time",
        "table": "encounters_encounter",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "encounter_date",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Encounters")],
            "groupby": ["encounter_type"],
            "row_limit": 10000,
        },
    },
    {
        "name": "Encounters by Status",
        "table": "encounters_encounter",
        "viz_type": "pie",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Top 15 Diagnoses (ICD-10/11)",
        "table": "encounters_diagnosis",
        "viz_type": "dist_bar",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["icd11_display"],
            "metrics": [COUNT("id", "Count")],
            "row_limit": 15,
            "order_desc": True,
        },
    },
    {
        "name": "Diagnoses Over Time",
        "table": "encounters_diagnosis",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Diagnoses")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Diagnosis Type (Primary vs Secondary)",
        "table": "encounters_diagnosis",
        "viz_type": "pie",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "pie",
            "groupby": ["diagnosis_type"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Treatment Plans by Status",
        "table": "encounters_treatmentplan",
        "viz_type": "pie",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Chronic Conditions Distribution",
        "table": "encounters_chroniccondition",
        "viz_type": "dist_bar",
        "dashboard": "Clinical Overview",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["condition_name"],
            "metrics": [COUNT("id", "Count")],
            "row_limit": 20,
            "order_desc": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  BILLING & REVENUE
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Revenue Over Time",
        "table": "billing_invoice",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Billing & Revenue",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [SUM("total_amount", "Revenue (KES)")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Invoice Status Distribution",
        "table": "billing_invoice",
        "viz_type": "pie",
        "dashboard": "Billing & Revenue",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Invoices"),
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Payments Over Time",
        "table": "billing_payment",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Billing & Revenue",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [SUM("amount", "Payments (KES)")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Payments by Method",
        "table": "billing_payment",
        "viz_type": "pie",
        "dashboard": "Billing & Revenue",
        "params": {
            "viz_type": "pie",
            "groupby": ["payment_method"],
            "metric": SUM("amount", "Amount (KES)"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Top 15 Services by Revenue",
        "table": "billing_invoiceitem",
        "viz_type": "dist_bar",
        "dashboard": "Billing & Revenue",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["description"],
            "metrics": [SUM("total", "Revenue (KES)")],
            "row_limit": 15,
            "order_desc": True,
        },
    },
    {
        "name": "Outstanding vs Paid Invoices",
        "table": "billing_invoice",
        "viz_type": "big_number_total",
        "dashboard": "Billing & Revenue",
        "params": {
            "viz_type": "big_number_total",
            "metric": SUM("total_amount", "Total Revenue (KES)"),
        },
    },
    {
        "name": "Credit Notes Over Time",
        "table": "billing_creditnote",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Billing & Revenue",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [SUM("amount", "Refunds (KES)")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  SHA (Social Health Authority) CLAIMS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "SHA Claims Over Time",
        "table": "billing_shaclaim",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "SHA Claims",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Claims")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "SHA Claims by Status",
        "table": "billing_shaclaim",
        "viz_type": "pie",
        "dashboard": "SHA Claims",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Claims"),
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "SHA Claim Amounts",
        "table": "billing_shaclaim",
        "viz_type": "big_number_total",
        "dashboard": "SHA Claims",
        "params": {
            "viz_type": "big_number_total",
            "metric": SUM("total_amount", "Total Claimed (KES)"),
        },
    },
    {
        "name": "SHA Remittances Over Time",
        "table": "billing_sharemittance",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "SHA Claims",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [SUM("total_amount", "Remitted (KES)")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "SHA Preauths by Status",
        "table": "billing_shapreauth",
        "viz_type": "pie",
        "dashboard": "SHA Claims",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Preauths"),
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "SHA Eligibility Check Outcomes",
        "table": "billing_shaeligibilitycheck",
        "viz_type": "pie",
        "dashboard": "SHA Claims",
        "params": {
            "viz_type": "pie",
            "groupby": ["is_eligible"],
            "metric": COUNT("id", "Checks"),
            "row_limit": 5,
            "sort_by_metric": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  LABORATORY
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Lab Orders Over Time",
        "table": "laboratory_laborder",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Laboratory",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Lab Orders")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Lab Orders by Status",
        "table": "laboratory_laborder",
        "viz_type": "pie",
        "dashboard": "Laboratory",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Orders"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Lab Orders by Priority",
        "table": "laboratory_laborder",
        "viz_type": "pie",
        "dashboard": "Laboratory",
        "params": {
            "viz_type": "pie",
            "groupby": ["priority"],
            "metric": COUNT("id", "Orders"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Lab Results — Abnormal vs Normal",
        "table": "laboratory_labresult",
        "viz_type": "pie",
        "dashboard": "Laboratory",
        "params": {
            "viz_type": "pie",
            "groupby": ["is_abnormal"],
            "metric": COUNT("id", "Results"),
            "row_limit": 5,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Lab Results Over Time",
        "table": "laboratory_labresult",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Laboratory",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Results")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  PHARMACY
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Prescriptions Over Time",
        "table": "pharmacy_prescription",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Pharmacy",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Prescriptions")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Prescription Status Distribution",
        "table": "pharmacy_prescription",
        "viz_type": "pie",
        "dashboard": "Pharmacy",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Dispensing Over Time",
        "table": "pharmacy_dispensing",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Pharmacy",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Dispenses")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Stock Alerts by Type",
        "table": "pharmacy_stockalert",
        "viz_type": "pie",
        "dashboard": "Pharmacy",
        "params": {
            "viz_type": "pie",
            "groupby": ["alert_type"],
            "metric": COUNT("id", "Alerts"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Top Dispensed Drugs",
        "table": "pharmacy_prescriptionitem",
        "viz_type": "dist_bar",
        "dashboard": "Pharmacy",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["drug_name"],
            "metrics": [SUM("quantity", "Qty Dispensed")],
            "row_limit": 20,
            "order_desc": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  TRIAGE & EMERGENCY
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Triage Assessments Over Time",
        "table": "triage_triageassessment",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Triage & Emergency",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Assessments")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Triage by Priority/Category",
        "table": "triage_triageassessment",
        "viz_type": "pie",
        "dashboard": "Triage & Emergency",
        "params": {
            "viz_type": "pie",
            "groupby": ["triage_category"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Wait Time Breaches Over Time",
        "table": "triage_waittimebreach",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Triage & Emergency",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Breaches")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Escalations Over Time",
        "table": "triage_escalation",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Triage & Emergency",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Escalations")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  INPATIENT
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Admissions Over Time",
        "table": "inpatient_admission",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "admitted_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Admissions")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Admissions by Status",
        "table": "inpatient_admission",
        "viz_type": "pie",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Admissions by Type",
        "table": "inpatient_admission",
        "viz_type": "pie",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "pie",
            "groupby": ["admission_type"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Discharges Over Time",
        "table": "inpatient_discharge",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "discharged_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Discharges")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Discharge Disposition",
        "table": "inpatient_discharge",
        "viz_type": "pie",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "pie",
            "groupby": ["disposition"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Bed Occupancy by Status",
        "table": "inpatient_bed",
        "viz_type": "pie",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Beds"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Ward Rounds Over Time",
        "table": "inpatient_wardround",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Rounds")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Transfers Over Time",
        "table": "inpatient_transfer",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Inpatient",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Transfers")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  THEATRE / SURGERY
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Surgery Cases Over Time",
        "table": "theatre_surgerycase",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Theatre & Surgery",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Surgeries")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Surgery Cases by Status",
        "table": "theatre_surgerycase",
        "viz_type": "pie",
        "dashboard": "Theatre & Surgery",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Cases"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Surgery by Priority",
        "table": "theatre_surgerycase",
        "viz_type": "pie",
        "dashboard": "Theatre & Surgery",
        "params": {
            "viz_type": "pie",
            "groupby": ["priority"],
            "metric": COUNT("id", "Cases"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "WHO Safety Checklist Compliance",
        "table": "theatre_whosafetychecklist",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Theatre & Surgery",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Checklists")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  IMAGING / RADIOLOGY
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Imaging Orders Over Time",
        "table": "imaging_imagingorder",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Imaging & Radiology",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Orders")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Imaging Orders by Status",
        "table": "imaging_imagingorder",
        "viz_type": "pie",
        "dashboard": "Imaging & Radiology",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Orders"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Imaging by Priority",
        "table": "imaging_imagingorder",
        "viz_type": "pie",
        "dashboard": "Imaging & Radiology",
        "params": {
            "viz_type": "pie",
            "groupby": ["priority"],
            "metric": COUNT("id", "Orders"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Radiology Reports Over Time",
        "table": "imaging_radiologyreport",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Imaging & Radiology",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Reports")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  SCHEDULING & STAFFING
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Staff Shift Status Distribution",
        "table": "scheduling_shift",
        "viz_type": "pie",
        "dashboard": "Staffing & Scheduling",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Shifts"),
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Shifts by Type",
        "table": "scheduling_shift",
        "viz_type": "pie",
        "dashboard": "Staffing & Scheduling",
        "params": {
            "viz_type": "pie",
            "groupby": ["shift_type"],
            "metric": COUNT("id", "Shifts"),
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Shifts Over Time",
        "table": "scheduling_shift",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Staffing & Scheduling",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "date",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Shifts")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Appointments Over Time",
        "table": "scheduling_appointment",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Staffing & Scheduling",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "start_time",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Appointments")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Appointment Status Distribution",
        "table": "scheduling_appointment",
        "viz_type": "pie",
        "dashboard": "Staffing & Scheduling",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  IMMUNIZATIONS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Immunizations Over Time",
        "table": "immunizations_immunizationrecord",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Immunizations",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "administered_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Immunizations")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "AEFI Reports Over Time",
        "table": "immunizations_aefi",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Immunizations",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "reported_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "AEFIs")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "AEFI Severity Distribution",
        "table": "immunizations_aefi",
        "viz_type": "pie",
        "dashboard": "Immunizations",
        "params": {
            "viz_type": "pie",
            "groupby": ["severity"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Cold Chain Temperature Excursions",
        "table": "immunizations_temperaturelog",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Immunizations",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "recorded_at",
            "time_grain_sqla": "P1D",
            "metrics": [COUNT("id", "Readings")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  CLINICS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Clinic Visits Over Time",
        "table": "clinics_clinicvisit",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Clinics",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Visits")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Clinic Visit Status",
        "table": "clinics_clinicvisit",
        "viz_type": "pie",
        "dashboard": "Clinics",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Visits"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Clinic Enrollments Over Time",
        "table": "clinics_clinicenrollment",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Clinics",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "enrolled_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Enrollments")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  SURVEILLANCE & PUBLIC HEALTH
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Notifiable Cases Over Time",
        "table": "surveillance_notifiablecase",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Surveillance",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Cases")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Notifiable Cases by Status",
        "table": "surveillance_notifiablecase",
        "viz_type": "pie",
        "dashboard": "Surveillance",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Cases"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "IHR Notifications by Status",
        "table": "surveillance_ihrnotification",
        "viz_type": "pie",
        "dashboard": "Surveillance",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Notifications"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Surveillance Alerts Over Time",
        "table": "surveillance_surveillancealert",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Surveillance",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Alerts")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  INVENTORY & SUPPLY CHAIN
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Purchase Orders Over Time",
        "table": "inventory_purchaseorder",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Inventory",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "POs")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Purchase Order Status",
        "table": "inventory_purchaseorder",
        "viz_type": "pie",
        "dashboard": "Inventory",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "POs"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Stock Transfers Over Time",
        "table": "inventory_stocktransfer",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Inventory",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Transfers")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Consumption Records Over Time",
        "table": "inventory_consumptionrecord",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Inventory",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Consumption Events")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  BLOOD BANK
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Blood Units by Group & Status",
        "table": "blood_bank_bloodunit",
        "viz_type": "dist_bar",
        "dashboard": "Blood Bank",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["blood_group"],
            "metrics": [COUNT("id", "Units")],
            "row_limit": 20,
            "order_desc": True,
        },
    },
    {
        "name": "Blood Requests Over Time",
        "table": "blood_bank_bloodrequest",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Blood Bank",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Requests")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Blood Request Status",
        "table": "blood_bank_bloodrequest",
        "viz_type": "pie",
        "dashboard": "Blood Bank",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Requests"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  REFERRALS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Clinical Referrals Over Time",
        "table": "referrals_clinicalreferral",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Referrals & Allied Health",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Referrals")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Referrals by Status",
        "table": "referrals_clinicalreferral",
        "viz_type": "pie",
        "dashboard": "Referrals & Allied Health",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Referrals"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Counselling Sessions Over Time",
        "table": "counselling_counsellingsession",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Referrals & Allied Health",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Sessions")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Social Work Cases by Status",
        "table": "social_work_socialworkcase",
        "viz_type": "pie",
        "dashboard": "Referrals & Allied Health",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Cases"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Physiotherapy Orders Over Time",
        "table": "physiotherapy_physiotherapyorder",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Referrals & Allied Health",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Orders")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  CHECK-IN & QUEUE
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Patient Check-ins Over Time",
        "table": "checkin_checkin",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Operations",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Check-ins")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Check-in Status Distribution",
        "table": "checkin_checkin",
        "viz_type": "pie",
        "dashboard": "Operations",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Count"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  AI & CDS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "AI Chat Sessions Over Time",
        "table": "ai_chatsession",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "AI & Clinical Decision Support",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Sessions")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "CDS Alerts by Severity",
        "table": "cds_cdsalert",
        "viz_type": "pie",
        "dashboard": "AI & Clinical Decision Support",
        "params": {
            "viz_type": "pie",
            "groupby": ["severity"],
            "metric": COUNT("id", "Alerts"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "CDS Alerts Over Time",
        "table": "cds_cdsalert",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "AI & Clinical Decision Support",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [COUNT("id", "Alerts")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  PRE-AGGREGATED ANALYTICS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Daily Patient Volume",
        "table": "analytics_facilitydailysummary",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Executive Summary",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "date",
            "time_grain_sqla": "P1D",
            "metrics": [
                SUM("total_patients", "Patients"),
                SUM("encounters_total", "Encounters"),
            ],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Daily Revenue Trend",
        "table": "analytics_facilitydailysummary",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Executive Summary",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "date",
            "time_grain_sqla": "P1D",
            "metrics": [SUM("revenue_total", "Revenue (KES)")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Diagnosis Trends (Top Conditions)",
        "table": "analytics_diagnosistrend",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Executive Summary",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "date",
            "time_grain_sqla": "P1W",
            "metrics": [SUM("count", "Cases")],
            "groupby": ["diagnosis_name"],
            "row_limit": 10000,
        },
    },
    {
        "name": "Department Monthly Summary",
        "table": "analytics_departmentmonthlysummary",
        "viz_type": "dist_bar",
        "dashboard": "Executive Summary",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["department_name"],
            "metrics": [SUM("encounters_total", "Encounters")],
            "row_limit": 30,
            "order_desc": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  AUDIT & COMPLIANCE
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Audit Log Volume Over Time",
        "table": "core_auditlog",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Audit & Compliance",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "timestamp",
            "time_grain_sqla": "P1D",
            "metrics": [COUNT("id", "Events")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Audit Actions Distribution",
        "table": "core_auditlog",
        "viz_type": "dist_bar",
        "dashboard": "Audit & Compliance",
        "params": {
            "viz_type": "dist_bar",
            "groupby": ["action"],
            "metrics": [COUNT("id", "Count")],
            "row_limit": 20,
            "order_desc": True,
        },
    },
    {
        "name": "Audit by Resource Type",
        "table": "core_auditlog",
        "viz_type": "pie",
        "dashboard": "Audit & Compliance",
        "params": {
            "viz_type": "pie",
            "groupby": ["resource_type"],
            "metric": COUNT("id", "Count"),
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Sick Notes Over Time",
        "table": "sick_notes_sicknote",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Audit & Compliance",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Sick Notes")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  PROCEDURES
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Procedure Orders Over Time",
        "table": "procedures_procedureorder",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Procedures",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Procedures")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Procedure Orders by Status",
        "table": "procedures_procedureorder",
        "viz_type": "pie",
        "dashboard": "Procedures",
        "params": {
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": COUNT("id", "Orders"),
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  QUALITY
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Quality Measures Performance",
        "table": "quality_qualitymeasureresult",
        "viz_type": "echarts_timeseries_line",
        "dashboard": "Quality",
        "params": {
            "viz_type": "echarts_timeseries_line",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Results")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    # ═══════════════════════════════════════════════════════════════════════
    #  DIALYSIS
    # ═══════════════════════════════════════════════════════════════════════
    {
        "name": "Dialysis Sessions Over Time",
        "table": "dialysis_dialysissession",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Dialysis",
        "params": {
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [COUNT("id", "Sessions")],
            "groupby": [],
            "row_limit": 10000,
        },
    },
]


def create_charts(base_url):
    """Create charts from the CHARTS definitions. Returns {dashboard_name: [chart_ids]}."""
    created = 0
    skipped = 0
    failed = 0
    total = len(CHARTS)
    dashboard_charts = {}  # dashboard_name → [chart_id, ...]

    for i, chart_def in enumerate(CHARTS, 1):
        dashboard_name = chart_def.get("dashboard", "Vitora HMIS Overview")
        print(f"  [{i}/{total}] {chart_def['name']}... ", end="", flush=True)

        try:
            # Check if chart already exists by name — list all and match in
            # Python to avoid Superset filter issues with & in slice_name
            cid = None
            r = api_get(
                f"{base_url}/api/v1/chart/",
                params={"q": json.dumps({"page_size": 500, "columns": ["id", "slice_name"]})},
            )
            if r.status_code == 200:
                for c in r.json().get("result", []):
                    if c.get("slice_name") == chart_def["name"]:
                        cid = c["id"]
                        break

            if cid is not None:
                dashboard_charts.setdefault(dashboard_name, []).append(cid)
                skipped += 1
                print("exists")
                continue

            ds_id = get_dataset_id(base_url, chart_def["table"])
            if not ds_id:
                failed += 1
                print(f"SKIP (no dataset for '{chart_def['table']}')")
                continue

            params = chart_def["params"].copy()
            params["datasource"] = f"{ds_id}__table"

            payload = {
                "slice_name": chart_def["name"],
                "viz_type": chart_def["viz_type"],
                "datasource_id": ds_id,
                "datasource_type": "table",
                "params": json.dumps(params),
            }

            r = api_post(f"{base_url}/api/v1/chart/", json=payload)
            if r.status_code in (200, 201):
                cid = r.json()["id"]
                dashboard_charts.setdefault(dashboard_name, []).append(cid)
                created += 1
                print("created")
            else:
                failed += 1
                print(f"FAILED ({r.status_code})")
        except requests.exceptions.Timeout:
            failed += 1
            print("TIMEOUT")
        except Exception as e:
            failed += 1
            print(f"ERROR ({e})")

    print(f"✓ Charts: {created} created, {skipped} already existed, {failed} failed")
    return dashboard_charts


# ---------------------------------------------------------------------------
# Dashboard creation — one per category
# ---------------------------------------------------------------------------

def _build_position_json(title, chart_ids):
    """Build Superset position_json for a 2-column grid of charts."""
    position = {"DASHBOARD_VERSION_KEY": "v2"}
    root_children = []

    for i, chart_id in enumerate(chart_ids):
        row = i // 2
        component_id = f"CHART-{chart_id}"
        row_id = f"ROW-{row}"

        if row_id not in position:
            position[row_id] = {
                "type": "ROW",
                "id": row_id,
                "children": [],
                "meta": {"background": "BACKGROUND_TRANSPARENT"},
            }
            root_children.append(row_id)

        position[row_id]["children"].append(component_id)
        position[component_id] = {
            "type": "CHART",
            "id": component_id,
            "children": [],
            "meta": {
                "width": 6,
                "height": 50,
                "chartId": chart_id,
                "sliceName": "",
            },
        }

    position["ROOT_ID"] = {"type": "ROOT", "id": "ROOT_ID", "children": ["GRID_ID"]}
    position["GRID_ID"] = {"type": "GRID", "id": "GRID_ID", "children": root_children}
    position["HEADER_ID"] = {"type": "HEADER", "id": "HEADER_ID", "meta": {"text": title}}
    return position


def create_dashboard(base_url, title, chart_ids):
    """Create or update a dashboard and link its charts.

    Superset 4.x does NOT auto-link charts from position_json on
    dashboard PUT.  Instead, each chart must be updated via
    ``PUT /api/v1/chart/{id}`` with ``{"dashboards": [dash_id]}``
    to create the ``dashboard_slices`` association.  We still PUT
    ``position_json`` on the dashboard for the 2-column grid layout.
    """
    position = _build_position_json(title, chart_ids)
    pos_json = json.dumps(position)

    # Check if dashboard exists — list all and match in Python to avoid
    # Superset filter issues with special characters (& in titles)
    dash_id = None
    r = api_get(
        f"{base_url}/api/v1/dashboard/",
        params={"q": json.dumps({"page_size": 200})},
    )
    if r.status_code == 200:
        for d in r.json().get("result", []):
            if d.get("dashboard_title") == title:
                dash_id = d["id"]
                break

    if dash_id is None:
        # Create the dashboard first
        payload = {
            "dashboard_title": title,
            "published": True,
            "position_json": pos_json,
        }
        r = api_post(f"{base_url}/api/v1/dashboard/", json=payload)
        if r.status_code not in (200, 201):
            print(f"  ✗ Failed to create dashboard '{title}': {r.status_code} {r.text[:300]}")
            return None
        dash_id = r.json()["id"]

    # Set position_json for layout
    r = api_put(f"{base_url}/api/v1/dashboard/{dash_id}", json={
        "position_json": pos_json,
        "published": True,
    })
    if r.status_code not in (200, 201):
        print(f"  ⚠ Dashboard '{title}' layout update failed: {r.status_code}")

    # Link charts → dashboard via chart PUT (Superset 4.x requirement)
    linked = 0
    for cid in chart_ids:
        r = api_put(f"{base_url}/api/v1/chart/{cid}", json={"dashboards": [dash_id]})
        if r.status_code == 200:
            linked += 1
        else:
            print(f"\n    ⚠ Chart {cid} link failed: {r.status_code}", end="")
    print(f"  ✓ Dashboard '{title}' (id={dash_id}, {linked}/{len(chart_ids)} charts linked)")
    return dash_id


def create_all_dashboards(base_url, dashboard_charts):
    """Create all dashboards from the chart groupings."""
    print(f"\n  Creating {len(dashboard_charts)} dashboards...")
    for title, chart_ids in sorted(dashboard_charts.items()):
        create_dashboard(base_url, title, chart_ids)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    base_url = args.url.rstrip("/")

    print("=" * 60)
    print("Vitora HMIS — Superset Dashboard Bootstrap")
    print(f"  URL:      {base_url}")
    print(f"  DB Name:  {args.db_name}")
    print(f"  Schema:   {args.schema}")
    print(f"  Datasets: {len(DATASETS)}")
    print(f"  Charts:   {len(CHARTS)}")
    dashboards = {c.get("dashboard", "Vitora HMIS Overview") for c in CHARTS}
    print(f"  Dashboards: {len(dashboards)}")
    print("=" * 60)

    login(base_url, args.user, args.password)
    db_id = get_database_id(base_url, args.db_name)
    create_datasets(base_url, db_id, args.schema)
    dashboard_charts = create_charts(base_url)

    if dashboard_charts:
        create_all_dashboards(base_url, dashboard_charts)
    else:
        print("✗ No charts created, skipping dashboards")

    print("\n" + "=" * 60)
    print("Done! Open Superset to view and customize your dashboards.")
    print(f"  → {base_url}/dashboard/list/")
    print("=" * 60)


if __name__ == "__main__":
    main()
