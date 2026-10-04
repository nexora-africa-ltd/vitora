# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Django SQLite backend using SQLCipher for encrypted Facility Hub databases.

Use via DATABASES['default']['ENGINE'] = 'hmis.db_backends.sqlcipher' and
DATABASES['default']['OPTIONS']['cipher_key'] = a protected runtime key.
"""

from __future__ import annotations

from collections.abc import Mapping
from itertools import tee

from django.db.backends.sqlite3.base import FORMAT_QMARK_REGEX
from django.db.backends.sqlite3.base import DatabaseWrapper as SQLiteDatabaseWrapper

try:
    from sqlcipher3 import dbapi2 as Database
except ImportError as exc:  # pragma: no cover - exercised in packaging checks
    raise RuntimeError(
        "SQLCipher support requires the platform-specific sqlcipher3 hub dependency."
    ) from exc


class SQLCipherCursorWrapper:
    """Translate Django placeholders for SQLCipher's DB-API cursor."""

    def __init__(self, cursor):
        self.cursor = cursor

    def __getattr__(self, attribute):
        return getattr(self.cursor, attribute)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

    @staticmethod
    def _convert_query(query, *, param_names=None):
        if param_names is None:
            return FORMAT_QMARK_REGEX.sub("?", query).replace("%%", "%")
        return query % {name: f":{name}" for name in param_names}

    def execute(self, query, params=None):
        if params is None:
            return self.cursor.execute(query)
        param_names = list(params) if isinstance(params, Mapping) else None
        return self.cursor.execute(self._convert_query(query, param_names=param_names), params)

    def executemany(self, query, param_list):
        peekable, param_list = tee(iter(param_list))
        params = next(peekable, None)
        param_names = list(params) if isinstance(params, Mapping) else None
        return self.cursor.executemany(
            self._convert_query(query, param_names=param_names), param_list
        )


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

    def create_cursor(self, name=None):  # noqa: ARG002
        """Return a SQLCipher cursor with Django SQLite parameter adaptation."""
        return SQLCipherCursorWrapper(self.connection.cursor())
