# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for Superset chart schema auditing and chart reconciliation."""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

BOOTSTRAP_PATH = (
    Path(__file__).resolve().parents[3] / "docker" / "superset" / "bootstrap_dashboards.py"
)
SPEC = importlib.util.spec_from_file_location("superset_bootstrap", BOOTSTRAP_PATH)
assert SPEC and SPEC.loader
bootstrap = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bootstrap)


def test_chart_column_references_include_axes_groupings_and_metrics():
    """Audits every chart field that Superset resolves as a datasource column."""
    references = bootstrap._chart_column_references(
        {
            "x_axis": "shift_date",
            "time_column": "created_at",
            "groupby": ["status"],
            "metric": bootstrap.COUNT("id", "Total"),
            "metrics": [bootstrap.SUM("duration", "Duration")],
        }
    )

    assert references == [
        ("x_axis", "shift_date"),
        ("time_column", "created_at"),
        ("groupby", "status"),
        ("metric", "id"),
        ("metric", "duration"),
    ]


def test_schema_audit_rejects_stale_chart_columns(monkeypatch):
    """Stops reconciliation before it can publish a chart with a missing column."""
    monkeypatch.setattr(
        bootstrap,
        "CHARTS",
        [
            {
                "name": "Broken Chart",
                "table": "example_table",
                "params": {"x_axis": "date"},
            }
        ],
    )
    monkeypatch.setattr(bootstrap, "get_dataset_id", lambda *_: 1)
    response = MagicMock(status_code=200)
    response.json.return_value = {"result": {"columns": [{"column_name": "created_at"}]}}
    monkeypatch.setattr(bootstrap, "api_get", lambda *_: response)

    assert bootstrap.audit_chart_definitions("https://superset.example.com") is False


def test_existing_chart_is_updated_instead_of_skipped(monkeypatch):
    """Reconciles stale saved chart metadata to the current bootstrap definition."""
    chart = {
        "name": "Shifts Over Time",
        "table": "scheduling_shift",
        "viz_type": "echarts_timeseries_bar",
        "dashboard": "Staffing & Scheduling",
        "params": {"x_axis": "shift_date"},
    }
    monkeypatch.setattr(bootstrap, "CHARTS", [chart])
    list_response = MagicMock(status_code=200)
    list_response.json.return_value = {"result": [{"id": 63, "slice_name": chart["name"]}]}
    monkeypatch.setattr(bootstrap, "api_get", lambda *_args, **_kwargs: list_response)
    monkeypatch.setattr(bootstrap, "get_dataset_id", lambda *_: 48)
    put_response = MagicMock(status_code=200)
    put_response.json.return_value = {"id": 63}
    api_put = MagicMock(return_value=put_response)
    monkeypatch.setattr(bootstrap, "api_put", api_put)

    dashboard_charts = bootstrap.create_charts("https://superset.example.com")

    assert dashboard_charts == {"Staffing & Scheduling": [63]}
    assert api_put.call_args.args[0].endswith("/api/v1/chart/63")
    assert '"x_axis": "shift_date"' in api_put.call_args.kwargs["json"]["params"]


def test_dataset_reconciliation_lists_existing_datasets_once(monkeypatch):
    """Avoids one Superset list request per dataset during an audit."""
    monkeypatch.setattr(
        bootstrap, "DATASETS", [("existing_table", "Existing"), ("new_table", "New")]
    )
    list_response = MagicMock(status_code=200)
    list_response.json.return_value = {
        "result": [{"table_name": "existing_table", "database": {"id": 1}}]
    }
    api_get = MagicMock(return_value=list_response)
    api_post = MagicMock(return_value=MagicMock(status_code=201))
    monkeypatch.setattr(bootstrap, "api_get", api_get)
    monkeypatch.setattr(bootstrap, "api_post", api_post)

    bootstrap.create_datasets("https://superset.example.com", db_id=1)

    assert api_get.call_count == 1
    assert api_post.call_count == 1
    assert api_post.call_args.args[0].endswith("/api/v1/dataset/")


def test_api_list_all_requests_every_superset_page(monkeypatch):
    """Does not mistake Superset's 100-row page limit for a complete inventory."""
    first_page = MagicMock(status_code=200)
    first_page.json.return_value = {"result": [{"id": index} for index in range(100)]}
    second_page = MagicMock(status_code=200)
    second_page.json.return_value = {"result": [{"id": 100}]}
    api_get = MagicMock(side_effect=[first_page, second_page])
    monkeypatch.setattr(bootstrap, "api_get", api_get)

    results = bootstrap.api_list_all("https://superset.example.com", "dataset")

    assert len(results) == 101
    assert api_get.call_count == 2
