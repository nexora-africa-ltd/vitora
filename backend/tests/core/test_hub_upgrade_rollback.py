# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Stopped-hub conversion and failed-upgrade rollback tests.

Run: poetry run pytest tests/core/test_hub_upgrade_rollback.py --no-cov.
Uses temporary SQLite databases and synthetic protected credential bytes.
"""

import importlib.util
import sqlite3
from pathlib import Path

import pytest

from hmis.apps.core.hub_database import replace_with_encrypted_database, verify_database_key


@pytest.fixture
def rollback_module():
    path = Path(__file__).resolve().parents[2] / "scripts" / "hub-update-state.py"
    spec = importlib.util.spec_from_file_location("hub_update_state", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_failed_encrypted_upgrade_restores_database_credentials_watermark_and_wal(
    tmp_path, rollback_module
):
    database = tmp_path / "hub.sqlite3"
    source = sqlite3.connect(database)
    source.execute("CREATE TABLE sync_queue (id INTEGER PRIMARY KEY, status TEXT)")
    source.execute("INSERT INTO sync_queue VALUES (1, 'PENDING')")
    source.commit()
    source.close()
    bundle = tmp_path / "hub-secrets.dpapi.json"
    bundle.write_bytes(b"original OS-protected credential bundle")
    env = tmp_path / ".env"
    env.write_bytes(b"HUB_DATABASE_ENCRYPTION_REQUIRED=false\n")
    watermark = tmp_path / ".hub_sync_state.json"
    watermark.write_bytes(b'{"last_pull_timestamp": "2026-10-01T00:00:00"}')
    paths = [
        database,
        Path(str(database) + "-wal"),
        Path(str(database) + "-shm"),
        bundle,
        env,
        watermark,
    ]
    snapshot = tmp_path / "rollback"
    before = {path: path.read_bytes() for path in paths if path.exists()}
    rollback_module.capture(snapshot, paths)
    replace_with_encrypted_database(database, "new-key")
    assert verify_database_key(database, "new-key")
    bundle.write_bytes(b"new protected key bundle")
    env.write_bytes(b"HUB_DATABASE_ENCRYPTION_REQUIRED=true\n")
    watermark.write_bytes(b"{}")
    # Simulate files left by the failed migration's new database epoch.
    Path(str(database) + "-wal").write_bytes(b"new encrypted WAL")
    Path(str(database) + "-shm").write_bytes(b"new SHM")
    rollback_module.restore(snapshot)
    assert all(path.read_bytes() == content for path, content in before.items())
    assert not Path(str(database) + "-wal").exists()
    assert not Path(str(database) + "-shm").exists()
    source = sqlite3.connect(database)
    try:
        assert source.execute("SELECT * FROM sync_queue").fetchall() == [(1, "PENDING")]
    finally:
        source.close()


def test_corrupt_rollback_set_does_not_replace_any_live_file(tmp_path, rollback_module):
    target = tmp_path / "db"
    target.write_bytes(b"before")
    snapshot = tmp_path / "rollback"
    rollback_module.capture(snapshot, [target])
    target.write_bytes(b"after")
    (snapshot / "0").write_bytes(b"corrupt")
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        rollback_module.restore(snapshot)
    assert target.read_bytes() == b"after"
