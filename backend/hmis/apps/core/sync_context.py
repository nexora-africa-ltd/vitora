# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Shared context flags for sync materialization."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_sync_materialization_depth: ContextVar[int] = ContextVar(
    "sync_materialization_depth",
    default=0,
)


@contextmanager
def sync_materialization_context() -> Iterator[None]:
    """Mark model writes as originating from sync materialization."""
    token = _sync_materialization_depth.set(_sync_materialization_depth.get() + 1)
    try:
        yield
    finally:
        _sync_materialization_depth.reset(token)


def is_sync_materialization_active() -> bool:
    """Return whether the current call stack is applying a sync entry."""
    return _sync_materialization_depth.get() > 0
