# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create or verify a disposable SQLCipher database for the escrow recovery drill.

Run: python hub_sqlcipher_escrow_drill.py create|verify <database-path>.
Inputs: HUB_DATABASE_ENCRYPTION_KEY; the database contains only a synthetic sentinel.
"""

from __future__ import annotations

import sys
from pathlib import Path


def _connection(path: Path):
    from sqlcipher3 import dbapi2 as database

    key = __import__("os").environ.get("HUB_DATABASE_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("HUB_DATABASE_ENCRYPTION_KEY is required for the drill.")
    connection = database.connect(path)
    connection.execute(f"PRAGMA key = '{key.replace("'", "''")}'")
    if not connection.execute("PRAGMA cipher_version").fetchone()[0]:
        raise RuntimeError("SQLCipher runtime is unavailable.")
    connection.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
    return connection


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in {"create", "verify"}:
        print("Usage: hub_sqlcipher_escrow_drill.py create|verify <database-path>", file=sys.stderr)
        return 2
    action, path_text = sys.argv[1:]
    path = Path(path_text)
    connection = _connection(path)
    try:
        if action == "create":
            connection.execute("CREATE TABLE drill_sentinel (value TEXT NOT NULL)")
            connection.execute("INSERT INTO drill_sentinel (value) VALUES ('escrow-recovery-ok')")
            connection.commit()
        else:
            value = connection.execute("SELECT value FROM drill_sentinel").fetchone()
            if value != ("escrow-recovery-ok",):
                raise RuntimeError("Recovered SQLCipher database sentinel is invalid.")
            if connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise RuntimeError("Recovered SQLCipher database integrity check failed.")
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
