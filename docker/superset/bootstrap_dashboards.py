#!/usr/bin/env python3
"""
Bootstrap Superset dashboards for Vitora HMIS.

Usage:
    cd docker/superset
    docker compose exec superset python /app/bootstrap_dashboards.py

Or from host:
    docker exec vitora-superset python /data/backend/../bootstrap_dashboards.py

Prerequisites:
    - Superset is running
    - Vitora database connection has been added (name: "Vitora HMIS")
"""

import json
import sys
import requests

SUPERSET_URL = "http://localhost:8088"
ADMIN_USER = "admin"
ADMIN_PASS = "admin"
DB_NAME = "SQLite"  # Must match the database display name in Superset

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

session = requests.Session()


def login():
    """Authenticate and get CSRF token."""
    # Get CSRF token from login page
    r = session.get(f"{SUPERSET_URL}/api/v1/security/csrf_token/")
    if r.status_code == 401:
        # Need to login first
        pass

    payload = {"username": ADMIN_USER, "password": ADMIN_PASS, "provider": "db"}
    r = session.post(f"{SUPERSET_URL}/api/v1/security/login", json=payload)
    if r.status_code != 200:
        print(f"Login failed: {r.status_code} {r.text}")
        sys.exit(1)

    token = r.json()["access_token"]
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })

    # Get CSRF token
    r = session.get(f"{SUPERSET_URL}/api/v1/security/csrf_token/")
    if r.status_code == 200:
        csrf = r.json().get("result")
        if csrf:
            session.headers["X-CSRFToken"] = csrf
            session.headers["Referer"] = SUPERSET_URL

    print("✓ Authenticated with Superset")


def get_database_id():
    """Find the Vitora database by name."""
    r = session.get(f"{SUPERSET_URL}/api/v1/database/", params={"q": json.dumps({"filters": [{"col": "database_name", "opr": "eq", "value": DB_NAME}]})})
    if r.status_code != 200:
        print(f"Failed to list databases: {r.status_code} {r.text}")
        sys.exit(1)

    results = r.json().get("result", [])
    if not results:
        print(f"✗ Database '{DB_NAME}' not found. Add it in Superset first.")
        print("  Settings → Database Connections → + Database → SQLAlchemy URI: sqlite:////data/backend/vitora.db")
        sys.exit(1)

    db_id = results[0]["id"]
    print(f"✓ Found database '{DB_NAME}' (id={db_id})")
    return db_id


# ---------------------------------------------------------------------------
# Dataset creation
# ---------------------------------------------------------------------------

DATASETS = [
    # (table_name, display_name)
    ("patients_patient", "Patients"),
    ("encounters_encounter", "Encounters"),
    ("encounters_diagnosis", "Diagnoses"),
    ("billing_invoice", "Invoices"),
    ("billing_payment", "Payments"),
    ("laboratory_laborder", "Lab Orders"),
    ("laboratory_labresult", "Lab Results"),
    ("pharmacy_prescription", "Prescriptions"),
    ("triage_triageassessment", "Triage Assessments"),
    ("scheduling_shift", "Staff Shifts"),
    ("inpatient_admission", "Admissions"),
    ("analytics_facilitydailysummary", "Facility Daily Summary"),
    ("analytics_departmentmonthlysummary", "Department Monthly Summary"),
    ("core_auditlog", "Audit Logs"),
    ("clinics_clinicvisit", "Clinic Visits"),
    ("theatre_surgerycase", "Surgery Cases"),
    ("imaging_imagingorder", "Imaging Orders"),
]


def create_datasets(db_id):
    """Create datasets for key Vitora tables."""
    created = 0
    skipped = 0

    for table_name, display_name in DATASETS:
        # Check if dataset already exists
        r = session.get(
            f"{SUPERSET_URL}/api/v1/dataset/",
            params={"q": json.dumps({"filters": [
                {"col": "table_name", "opr": "eq", "value": table_name},
                {"col": "database", "opr": "rel_o_m", "value": db_id},
            ]})}
        )

        if r.status_code == 200 and r.json().get("count", 0) > 0:
            skipped += 1
            continue

        payload = {
            "database": db_id,
            "table_name": table_name,
            "schema": "",
        }
        r = session.post(f"{SUPERSET_URL}/api/v1/dataset/", json=payload)
        if r.status_code in (200, 201):
            created += 1
        else:
            print(f"  ⚠ Failed to create dataset '{table_name}': {r.status_code}")

    print(f"✓ Datasets: {created} created, {skipped} already existed")


# ---------------------------------------------------------------------------
# Chart creation
# ---------------------------------------------------------------------------

def get_dataset_id(table_name):
    """Look up a dataset by table name."""
    r = session.get(
        f"{SUPERSET_URL}/api/v1/dataset/",
        params={"q": json.dumps({"filters": [{"col": "table_name", "opr": "eq", "value": table_name}]})}
    )
    if r.status_code == 200:
        results = r.json().get("result", [])
        if results:
            return results[0]["id"]
    return None


CHARTS = [
    {
        "name": "Patient Registrations Over Time",
        "table": "patients_patient",
        "viz_type": "echarts_timeseries_bar",
        "params": {
            "datasource": None,  # filled in
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [{"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Patients"}],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Patients by Gender",
        "table": "patients_patient",
        "viz_type": "pie",
        "params": {
            "datasource": None,
            "viz_type": "pie",
            "groupby": ["gender"],
            "metric": {"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Count"},
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Encounters by Type",
        "table": "encounters_encounter",
        "viz_type": "pie",
        "params": {
            "datasource": None,
            "viz_type": "pie",
            "groupby": ["encounter_type"],
            "metric": {"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Count"},
            "row_limit": 10,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Encounters Over Time",
        "table": "encounters_encounter",
        "viz_type": "echarts_timeseries_line",
        "params": {
            "datasource": None,
            "viz_type": "echarts_timeseries_line",
            "x_axis": "encounter_date",
            "time_grain_sqla": "P1W",
            "metrics": [{"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Encounters"}],
            "groupby": ["encounter_type"],
            "row_limit": 10000,
        },
    },
    {
        "name": "Revenue Over Time",
        "table": "billing_invoice",
        "viz_type": "echarts_timeseries_bar",
        "params": {
            "datasource": None,
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1M",
            "metrics": [{"expressionType": "SIMPLE", "aggregate": "SUM", "column": {"column_name": "total_amount"}, "label": "Revenue (KES)"}],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Invoice Status Distribution",
        "table": "billing_invoice",
        "viz_type": "pie",
        "params": {
            "datasource": None,
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": {"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Invoices"},
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Lab Orders Over Time",
        "table": "laboratory_laborder",
        "viz_type": "echarts_timeseries_bar",
        "params": {
            "datasource": None,
            "viz_type": "echarts_timeseries_bar",
            "x_axis": "created_at",
            "time_grain_sqla": "P1W",
            "metrics": [{"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Lab Orders"}],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Staff Shift Status",
        "table": "scheduling_shift",
        "viz_type": "pie",
        "params": {
            "datasource": None,
            "viz_type": "pie",
            "groupby": ["status"],
            "metric": {"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Shifts"},
            "row_limit": 20,
            "sort_by_metric": True,
        },
    },
    {
        "name": "Daily Patient Volume",
        "table": "analytics_facilitydailysummary",
        "viz_type": "echarts_timeseries_line",
        "params": {
            "datasource": None,
            "viz_type": "echarts_timeseries_line",
            "x_axis": "date",
            "time_grain_sqla": "P1D",
            "metrics": [
                {"expressionType": "SIMPLE", "aggregate": "SUM", "column": {"column_name": "total_patients"}, "label": "Patients"},
                {"expressionType": "SIMPLE", "aggregate": "SUM", "column": {"column_name": "encounters_total"}, "label": "Encounters"},
            ],
            "groupby": [],
            "row_limit": 10000,
        },
    },
    {
        "name": "Top Diagnoses",
        "table": "encounters_diagnosis",
        "viz_type": "dist_bar",
        "params": {
            "datasource": None,
            "viz_type": "dist_bar",
            "groupby": ["icd11_display"],
            "metrics": [{"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Count"}],
            "row_limit": 15,
            "order_desc": True,
            "orderby": [[{"expressionType": "SIMPLE", "aggregate": "COUNT", "column": {"column_name": "id"}, "label": "Count"}, False]],
        },
    },
]


def create_charts():
    """Create charts from the CHARTS definitions."""
    created = 0
    skipped = 0
    chart_ids = []

    for chart_def in CHARTS:
        # Check if chart already exists by name
        r = session.get(
            f"{SUPERSET_URL}/api/v1/chart/",
            params={"q": json.dumps({"filters": [{"col": "slice_name", "opr": "eq", "value": chart_def["name"]}]})}
        )
        if r.status_code == 200 and r.json().get("count", 0) > 0:
            chart_ids.append(r.json()["result"][0]["id"])
            skipped += 1
            continue

        ds_id = get_dataset_id(chart_def["table"])
        if not ds_id:
            print(f"  ⚠ Dataset not found for '{chart_def['table']}', skipping chart '{chart_def['name']}'")
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

        r = session.post(f"{SUPERSET_URL}/api/v1/chart/", json=payload)
        if r.status_code in (200, 201):
            chart_ids.append(r.json()["id"])
            created += 1
        else:
            print(f"  ⚠ Failed to create chart '{chart_def['name']}': {r.status_code} {r.text[:200]}")

    print(f"✓ Charts: {created} created, {skipped} already existed")
    return chart_ids


# ---------------------------------------------------------------------------
# Dashboard creation
# ---------------------------------------------------------------------------

DASHBOARD_TITLE = "Vitora HMIS Overview"


def create_dashboard(chart_ids):
    """Create a dashboard with the given charts."""
    # Check if dashboard exists
    r = session.get(
        f"{SUPERSET_URL}/api/v1/dashboard/",
        params={"q": json.dumps({"filters": [{"col": "dashboard_title", "opr": "eq", "value": DASHBOARD_TITLE}]})}
    )
    if r.status_code == 200 and r.json().get("count", 0) > 0:
        dash_id = r.json()["result"][0]["id"]
        print(f"✓ Dashboard '{DASHBOARD_TITLE}' already exists (id={dash_id})")
        return dash_id

    # Build a simple grid layout — 2 columns
    position = {"DASHBOARD_VERSION_KEY": "v2"}
    root_children = []

    for i, chart_id in enumerate(chart_ids):
        row = i // 2
        col = i % 2
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
    position["HEADER_ID"] = {"type": "HEADER", "id": "HEADER_ID", "meta": {"text": DASHBOARD_TITLE}}

    payload = {
        "dashboard_title": DASHBOARD_TITLE,
        "published": True,
        "position_json": json.dumps(position),
    }

    r = session.post(f"{SUPERSET_URL}/api/v1/dashboard/", json=payload)
    if r.status_code in (200, 201):
        dash_id = r.json()["id"]
        print(f"✓ Dashboard created: '{DASHBOARD_TITLE}' (id={dash_id})")
        print(f"  → View: {SUPERSET_URL}/superset/dashboard/{dash_id}/")
        return dash_id
    else:
        print(f"✗ Failed to create dashboard: {r.status_code} {r.text[:300]}")
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("Vitora HMIS — Superset Dashboard Bootstrap")
    print("=" * 60)

    login()
    db_id = get_database_id()
    create_datasets(db_id)
    chart_ids = create_charts()
    if chart_ids:
        create_dashboard(chart_ids)
    else:
        print("✗ No charts created, skipping dashboard")

    print("=" * 60)
    print("Done! Open Superset to view and customize your dashboards.")
    print(f"  → {SUPERSET_URL}/dashboard/list/")
    print("=" * 60)


if __name__ == "__main__":
    main()
