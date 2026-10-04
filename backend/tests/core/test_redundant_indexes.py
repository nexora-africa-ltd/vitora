# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Guard against redundant single-column Django model indexes.

Run with ``poetry run pytest tests/core/test_redundant_indexes.py --no-cov``.
The test inspects installed Django models and accepts composite, partial,
functional, and pattern-specific indexes while rejecting a Meta index that
duplicates a ForeignKey, unique, or db_index field index.
"""

from unittest.mock import Mock

import pytest  # type: ignore
from django.apps import apps


@pytest.mark.django_db
def test_model_meta_indexes_do_not_duplicate_automatic_field_indexes():
    """A simple Meta index must not duplicate an automatic field index."""
    duplicates = []

    for model in apps.get_models():
        fields = {field.name: field for field in model._meta.fields}
        for index in model._meta.indexes:
            if len(index.fields) != 1:
                continue

            field = fields.get(index.fields[0])
            if field is None:
                continue

            if field.many_to_one or field.one_to_one or field.unique or field.db_index:
                duplicates.append(f"{model._meta.label}.{index.name}")

    assert duplicates == []


def test_concurrent_remove_index_uses_postgresql_concurrent_ddl():
    """Cleanup migrations must avoid blocking writers on PostgreSQL."""
    from hmis.apps.core.migration_operations import ConcurrentRemoveIndex
    from hmis.apps.sick_notes.models import SickNote

    schema_editor = Mock()
    schema_editor.connection.vendor = "postgresql"
    schema_editor.connection.alias = "default"
    schema_editor.quote_name.side_effect = lambda value: f'"{value}"'
    from_state = Mock()
    from_state.apps.get_model.return_value = SickNote
    operation = ConcurrentRemoveIndex(model_name="sicknote", name="sn_number_idx")

    operation.database_forwards("sick_notes", schema_editor, from_state, Mock())

    schema_editor.execute.assert_called_once_with(
        'DROP INDEX CONCURRENTLY IF EXISTS "sn_number_idx"'
    )
