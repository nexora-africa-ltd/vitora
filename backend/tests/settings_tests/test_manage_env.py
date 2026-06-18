"""Tests for manage.py environment loading in installed hub deployments."""

import importlib.util
import os
from pathlib import Path


def _load_manage_module():
    manage_path = Path(__file__).resolve().parents[2] / "manage.py"
    spec = importlib.util.spec_from_file_location("vitora_manage", manage_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_load_sibling_env_sets_missing_values(tmp_path, monkeypatch):
    """Installed hub admins running manage.py directly still use hub.sqlite3."""
    manage = _load_manage_module()
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DJANGO_ENV=hub\n"
        "DJANGO_SETTINGS_MODULE=hmis.settings\n"
        "HUB_DB_PATH=C:\\VitoraHub\\data\\hub.sqlite3\n"
        "HUB_DATA_DIR=C:\\VitoraHub\\data\n"
    )

    monkeypatch.delenv("DJANGO_ENV", raising=False)
    monkeypatch.delenv("DJANGO_SETTINGS_MODULE", raising=False)
    monkeypatch.delenv("HUB_DB_PATH", raising=False)
    monkeypatch.delenv("HUB_DATA_DIR", raising=False)

    manage.load_sibling_env(tmp_path)

    assert os.environ["DJANGO_ENV"] == "hub"
    assert os.environ["DJANGO_SETTINGS_MODULE"] == "hmis.settings"
    assert os.environ["HUB_DB_PATH"] == "C:\\VitoraHub\\data\\hub.sqlite3"
    assert os.environ["HUB_DATA_DIR"] == "C:\\VitoraHub\\data"


def test_load_sibling_env_does_not_override_existing_values(tmp_path, monkeypatch):
    """Explicit process env vars still win over values in .env."""
    manage = _load_manage_module()
    (tmp_path / ".env").write_text("DJANGO_ENV=hub\nHUB_DB_PATH=from-file.sqlite3\n")

    monkeypatch.setenv("DJANGO_ENV", "test")
    monkeypatch.setenv("HUB_DB_PATH", "from-shell.sqlite3")

    manage.load_sibling_env(tmp_path)

    assert os.environ["DJANGO_ENV"] == "test"
    assert os.environ["HUB_DB_PATH"] == "from-shell.sqlite3"
