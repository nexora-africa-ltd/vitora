"""Tests for hub settings path handling."""

import importlib
import os

import pytest


@pytest.fixture(autouse=True)
def assert_base_middleware_unchanged():
    """Importing hub settings must not install hub guards in the test process."""
    from django.conf import settings

    from hmis.settings import base

    original_base_middleware = list(base.MIDDLEWARE)
    original_active_middleware = list(settings.MIDDLEWARE)
    yield
    assert original_base_middleware == base.MIDDLEWARE
    assert original_active_middleware == settings.MIDDLEWARE


def test_hub_settings_default_database_lives_under_data(monkeypatch):
    """Hub settings should not fall back to a root-level hub.sqlite3."""
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_REQUIRED", "true")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_KEY", "test-sqlcipher-key")
    monkeypatch.delenv("HUB_DATA_DIR", raising=False)
    monkeypatch.delenv("HUB_DB_PATH", raising=False)

    from hmis.settings import hub

    importlib.reload(hub)

    assert str(hub.HUB_DATA_DIR).endswith(os.path.join("backend", "data"))
    assert str(hub.DATABASES["default"]["NAME"]).endswith(
        os.path.join("backend", "data", "hub.sqlite3")
    )
    assert hub.HUB_DATABASE_ENCRYPTION_REQUIRED is True
    assert hub.DATABASES["default"]["ENGINE"] == "hmis.db_backends.sqlcipher"


def test_hub_settings_are_explicitly_classified_as_hub(monkeypatch):
    """Hub-only endpoints depend on settings.ENVIRONMENT, not DJANGO_ENV."""
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_REQUIRED", "true")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_KEY", "test-sqlcipher-key")

    from hmis.settings import hub

    importlib.reload(hub)

    assert hub.ENVIRONMENT == "hub"


def test_hub_settings_honor_explicit_data_dir(monkeypatch, tmp_path):
    """HUB_DATA_DIR alone is enough to derive the canonical hub DB path."""
    data_dir = tmp_path / "hub-data"
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_REQUIRED", "true")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_KEY", "test-sqlcipher-key")
    monkeypatch.setenv("HUB_DATA_DIR", str(data_dir))
    monkeypatch.delenv("HUB_DB_PATH", raising=False)

    from hmis.settings import hub

    importlib.reload(hub)

    assert str(data_dir) == hub.HUB_DATA_DIR
    assert str(data_dir / "hub.sqlite3") == hub.HUB_DB_PATH
    assert hub.DATABASES["default"]["NAME"] == str(data_dir / "hub.sqlite3")


def test_hub_settings_honor_explicit_db_path(monkeypatch, tmp_path):
    """HUB_DB_PATH remains the direct override for SQLite location."""
    data_dir = tmp_path / "hub-data"
    db_path = tmp_path / "custom.sqlite3"
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_REQUIRED", "true")
    monkeypatch.setenv("HUB_DATABASE_ENCRYPTION_KEY", "test-sqlcipher-key")
    monkeypatch.setenv("HUB_DATA_DIR", str(data_dir))
    monkeypatch.setenv("HUB_DB_PATH", str(db_path))

    from hmis.settings import hub

    importlib.reload(hub)

    assert str(data_dir) == hub.HUB_DATA_DIR
    assert str(db_path) == hub.HUB_DB_PATH
    assert hub.DATABASES["default"]["NAME"] == str(db_path)
