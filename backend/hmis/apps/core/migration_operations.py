# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Concurrent index-removal operation for PostgreSQL Django migrations.

Import ``ConcurrentRemoveIndex`` in an ``atomic = False`` migration to remove
an explicit non-unique index without blocking writers. It accepts the same
``model_name`` and ``name`` arguments as Django's ``RemoveIndex`` operation.
"""

from django.db.migrations.operations.models import RemoveIndex


class ConcurrentRemoveIndex(RemoveIndex):
    """Remove and restore a simple index with PostgreSQL concurrent DDL."""

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor != "postgresql":
            return super().database_forwards(app_label, schema_editor, from_state, to_state)

        del to_state
        model = from_state.apps.get_model(app_label, self.model_name)
        if self.allow_migrate_model(schema_editor.connection.alias, model):
            schema_editor.execute(
                f"DROP INDEX CONCURRENTLY IF EXISTS {schema_editor.quote_name(self.name)}"
            )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor != "postgresql":
            return super().database_backwards(app_label, schema_editor, from_state, to_state)

        del from_state
        model = to_state.apps.get_model(app_label, self.model_name)
        if self.allow_migrate_model(schema_editor.connection.alias, model):
            index = next(index for index in model._meta.indexes if index.name == self.name)
            columns = ", ".join(
                schema_editor.quote_name(model._meta.get_field(field_name).column)
                for field_name in index.fields
            )
            schema_editor.execute(
                f"CREATE INDEX CONCURRENTLY {schema_editor.quote_name(index.name)} "
                f"ON {schema_editor.quote_name(model._meta.db_table)} ({columns})"
            )
