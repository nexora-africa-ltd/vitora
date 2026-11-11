# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for outbound-sync tenant-context resolution.

Run with: poetry run pytest tests/core/test_sync_signals.py -q
Inputs: Django model instances and scalar relationship values encountered during signal traversal.
"""

from hmis.apps.core.sync_signals import get_tenant_context


def test_get_tenant_context_ignores_non_model_related_values():
    """Scalar values encountered during relation traversal must not crash sync signals."""
    assert get_tenant_context("not-a-django-model") == (None, None)
