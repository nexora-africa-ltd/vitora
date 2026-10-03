# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Django SQLite backend using SQLCipher for encrypted Facility Hub databases.

Use via DATABASES['default']['ENGINE'] = 'hmis.db_backends.sqlcipher' and
DATABASES['default']['OPTIONS']['cipher_key'] = a protected runtime key.
"""

from __future__ import annotations

from django.db.backends.sqlite3.base import DatabaseWrapper as SQLiteDatabaseWrapper

try:
    from sqlcipher3 import dbapi2 as Database
except ImportError as exc:  # pragma: no cover - exercised in packaging checks
    raise RuntimeError(
        "SQLCipher support requires the platform-specific sqlcipher3 hub dependency."
    ) from exc


class DatabaseWrapper(SQLiteDatabaseWrapper):
    """Apply and verify a SQLCipher key before Django accesses hub tables."""

    Database = Database

    def get_connection_params(self):
        """Keep the cipher key out of DB-API connection keyword arguments."""
        params = super().get_connection_params()
        params.pop("cipher_key", None)
        return params

    def get_new_connection(self, conn_params):
        connection = self.Database.connect(**conn_params)
        key = str(self.settings_dict.get("OPTIONS", {}).get("cipher_key") or "")
        if not key:
            connection.close()
            raise RuntimeError("HUB_DATABASE_ENCRYPTION_KEY is required for SQLCipher.")

        escaped_key = key.replace("'", "''")
        connection.execute(f"PRAGMA key = '{escaped_key}'")
        cipher_version = connection.execute("PRAGMA cipher_version").fetchone()
        if not cipher_version or not cipher_version[0]:
            connection.close()
            raise RuntimeError("SQLCipher runtime verification failed.")
        return connection
