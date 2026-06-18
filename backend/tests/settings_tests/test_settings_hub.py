"""Tests for hub settings path handling."""

import importlib
import os


def test_hub_settings_default_database_lives_under_data(monkeypatch):
    """Hub settings should not fall back to a root-level hub.sqlite3."""
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.delenv("HUB_DATA_DIR", raising=False)
    monkeypatch.delenv("HUB_DB_PATH", raising=False)

    from hmis.settings import hub

    importlib.reload(hub)

    assert str(hub.HUB_DATA_DIR).endswith(os.path.join("backend", "data"))
    assert str(hub.DATABASES["default"]["NAME"]).endswith(
        os.path.join("backend", "data", "hub.sqlite3")
    )


def test_hub_settings_honor_explicit_data_dir(monkeypatch, tmp_path):
    """HUB_DATA_DIR alone is enough to derive the canonical hub DB path."""
    data_dir = tmp_path / "hub-data"
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
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
    monkeypatch.setenv("HUB_DATA_DIR", str(data_dir))
    monkeypatch.setenv("HUB_DB_PATH", str(db_path))

    from hmis.settings import hub

    importlib.reload(hub)

    assert str(data_dir) == hub.HUB_DATA_DIR
    assert str(db_path) == hub.HUB_DB_PATH
    assert hub.DATABASES["default"]["NAME"] == str(db_path)
