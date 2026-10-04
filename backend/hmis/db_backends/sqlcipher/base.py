# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: I001
"""Django SQLite backend using SQLCipher for encrypted Facility Hub databases.

Use via DATABASES['default']['ENGINE'] = 'hmis.db_backends.sqlcipher' and
DATABASES['default']['OPTIONS']['cipher_key'] = a protected runtime key.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal
from itertools import tee

from django.db.backends.sqlite3._functions import register as register_functions
from django.db.backends.sqlite3.base import FORMAT_QMARK_REGEX
from django.db.backends.sqlite3.base import DatabaseWrapper as SQLiteDatabaseWrapper
from django.db.backends.sqlite3.base import adapt_date, adapt_datetime, decoder
from django.utils.asyncio import async_unsafe
from django.utils.dateparse import parse_date, parse_datetime, parse_time

try:
    from sqlcipher3 import dbapi2 as Database
except ImportError as exc:  # pragma: no cover - exercised in packaging checks
    raise RuntimeError(
        "SQLCipher support requires the platform-specific sqlcipher3 hub dependency."
    ) from exc

# SQLCipher has a separate DB-API adapter registry. Django's registrations on
# stdlib sqlite3 do not apply to this driver.
Database.register_converter("bool", b"1".__eq__)
for _type, _parser in (
    ("date", parse_date),
    ("time", parse_time),
    ("datetime", parse_datetime),
    ("timestamp", parse_datetime),
):
    Database.register_converter(_type, decoder(_parser))
Database.register_adapter(Decimal, str)
Database.register_adapter(date, adapt_date)
Database.register_adapter(datetime, adapt_datetime)


class SQLCipherCursorWrapper:
    """Translate Django placeholders for SQLCipher's DB-API cursor."""

    def __init__(self, cursor):
        self.cursor = cursor

    def __getattr__(self, attribute):
        return getattr(self.cursor, attribute)

    def __iter__(self):
        return self

    def __next__(self):
        return next(self.cursor)

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
            self.cursor.execute(query)
        else:
            param_names = list(params) if isinstance(params, Mapping) else None
            self.cursor.execute(self._convert_query(query, param_names=param_names), params)
        return self

    def executemany(self, query, param_list):
        peekable, param_list = tee(iter(param_list))
        params = next(peekable, None)
        param_names = list(params) if isinstance(params, Mapping) else None
        self.cursor.executemany(self._convert_query(query, param_names=param_names), param_list)
        return self


class DatabaseWrapper(SQLiteDatabaseWrapper):
    """Apply and verify a SQLCipher key before Django accesses hub tables."""

    Database = Database

    def get_connection_params(self):
        """Keep the cipher key out of DB-API connection keyword arguments."""
        params = super().get_connection_params()
        params.pop("cipher_key", None)
        return params

    @async_unsafe
    def get_new_connection(self, conn_params):
        key = str(self.settings_dict.get("OPTIONS", {}).get("cipher_key") or "")
        if not key:
            raise RuntimeError("HUB_DATABASE_ENCRYPTION_KEY is required for SQLCipher.")
        connection = self.Database.connect(**conn_params)
        try:
            escaped_key = key.replace("'", "''")
            connection.execute(f"PRAGMA key = '{escaped_key}'")
            cipher_version = connection.execute("PRAGMA cipher_version").fetchone()
            if not cipher_version or not cipher_version[0]:
                raise self.Database.DatabaseError("SQLCipher runtime verification failed.")
            # cipher_version alone does not read encrypted pages or validate the key.
            connection.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
            register_functions(connection)
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA legacy_alter_table = OFF")
            for command in self.init_commands:
                if command.strip():
                    connection.execute(command.strip())
        except self.Database.Error:
            connection.close()
            raise
        return connection

    def create_cursor(self, name=None):  # noqa: ARG002
        """Return a SQLCipher cursor with Django SQLite parameter adaptation."""
        return SQLCipherCursorWrapper(self.connection.cursor())
