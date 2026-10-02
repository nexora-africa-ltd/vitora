# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Execute checked-in sync SQL against schemas derived from current Django models.

Run: poetry run pytest tests/core/test_powersync_stream_privacy.py --no-cov
Inputs: sync-streams.yaml, Django model metadata, synthetic in-memory SQLite data.
This tests row/column policy locally; PowerSync Cloud deployment is separate.
"""

import re
import sqlite3
from pathlib import Path

import pytest
import yaml
from django.apps import apps

STREAMS = yaml.safe_load(
    (Path(__file__).resolve().parents[2] / "powersync/sync-streams.yaml").read_text()
)["streams"]
CLINICAL_STREAMS = [
    "org_patient_data",
    "facility_encounters",
    "facility_triage",
    "facility_clinical",
    "facility_pharmacy",
    "facility_laboratory",
    "facility_invoices",
    "facility_culture_results",
    "facility_antibiotic_sensitivities",
]


@pytest.fixture
def mirror():
    db = sqlite3.connect(":memory:")
    for model in apps.get_models():
        table = model._meta.db_table
        columns = [field.column for field in model._meta.concrete_fields]
        db.execute(
            f'CREATE TABLE IF NOT EXISTS "{table}" ({", ".join(chr(34) + c + chr(34) for c in columns)})'
        )
        for pk in (1, 2, 3):
            values = dict.fromkeys(columns)
            values.update({c: pk for c in columns if c == "id" or c.endswith("_id")})
            values.update(
                {
                    c: v
                    for c, v in {
                        "organization_id": 20 if pk != 3 else 30,
                        "facility_id": 10 if pk != 3 else 30,
                        "is_sensitive": pk == 2,
                        "is_active": 1,
                        "is_system": pk == 1,
                    }.items()
                    if c in columns
                }
            )
            db.execute(
                f'INSERT INTO "{table}" VALUES ({", ".join("?" for _ in columns)})',  # noqa: S608 - identifiers come only from Django model metadata
                list(values.values()),
            )
    yield db
    db.close()


def execute_stream(db, name, *, sensitive=False, permitted=True, overrides=None):
    stream = STREAMS[name]
    ctes = ", ".join(f"{key} AS ({value})" for key, value in stream.get("with", {}).items())
    statements = stream.get("queries", [stream.get("query")])
    result = []
    for query in statements:
        sql = (f"WITH {ctes} " if ctes else "") + query
        claims = {
            "organization_id": 20,
            "facility_id": 10,
            "can_view_sensitive": int(sensitive),
            "sync_policy_version": 2,
        }
        claims.update(overrides or {})
        sql = re.sub(
            r"auth\.parameter\('([^']+)'\)",
            lambda match, claims=claims: str(claims.get(match[1], int(permitted))),
            sql,
        )
        cursor = db.execute(sql)
        result.append((cursor.description, cursor.fetchall()))
    return result


@pytest.mark.parametrize("name", list(STREAMS))
def test_stream_sql_matches_current_physical_schema(mirror, name):
    execute_stream(mirror, name)


@pytest.mark.parametrize("name", CLINICAL_STREAMS)
def test_sensitive_and_other_tenant_records_are_not_replicated(mirror, name):
    for columns, rows in execute_stream(mirror, name):
        ids = {row[0] for row in rows}
        assert ids == {1}, (name, columns, ids)


@pytest.mark.parametrize("name", CLINICAL_STREAMS)
def test_read_permission_required_for_replication(mirror, name):
    for _, rows in execute_stream(mirror, name, permitted=False):
        assert rows == []


def test_sensitive_permission_allows_only_same_organization(mirror):
    for _, rows in execute_stream(mirror, "org_patient_data", sensitive=True):
        assert {row[0] for row in rows} == {1, 2}


def test_global_templates_do_not_publish_private_templates_or_creator(mirror):
    for columns, rows in execute_stream(mirror, "global_clinical_templates"):
        assert {row[0] for row in rows} == {1}
        assert "created_by_id" not in {column[0] for column in columns}


def test_signed_read_claims_match_django_permissions():
    from unittest.mock import Mock

    from hmis.apps.core.powersync_tokens import get_sync_read_claims

    user = Mock(is_active=True)
    user.has_perm.side_effect = lambda perm: (
        perm in {"patients.view_patient", "patients.view_sensitive_patient"}
    )
    claims = get_sync_read_claims(user)
    assert claims["read_patients_patient"] == 1
    assert claims["read_billing_invoice"] == 0
    assert claims["can_view_sensitive"] == 1
    assert claims["sync_policy_version"] == 2
    user.is_active = False
    claims = get_sync_read_claims(user)
    assert claims["read_patients_patient"] == 0
    assert claims["can_view_sensitive"] == 0


@pytest.mark.parametrize("name", CLINICAL_STREAMS)
def test_old_policy_token_cannot_receive_clinical_data(mirror, name):
    for _, rows in execute_stream(mirror, name, overrides={"sync_policy_version": 1}):
        assert rows == []


def test_child_read_permission_does_not_follow_parent_automatically(mirror):
    results = execute_stream(
        mirror, "facility_pharmacy", overrides={"read_pharmacy_prescriptionitem": 0}
    )
    assert {row[0] for row in results[0][1]} == {1}
    assert results[1][1] == []


@pytest.mark.parametrize("name", [name for name, stream in STREAMS.items() if "with" in stream])
def test_ctes_only_reference_physical_tables(mirror, name):
    """PowerSync compiles CTEs independently; chained CTEs become phantom tables."""
    for sql in STREAMS[name]["with"].values():
        standalone = re.sub(r"auth\.parameter\('[^']+'\)", "0", sql)
        mirror.execute(standalone)
