#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys
from pathlib import Path


def load_sibling_env(base_dir: str | os.PathLike | None = None) -> None:
    r"""Load KEY=VALUE lines from a sibling .env without overriding the shell.

    Installed hub administrators commonly run ``python manage.py ...`` directly
    from ``C:\VitoraHub``. Loading the generated .env before Django imports
    settings keeps those commands on the same hub.sqlite3 database as the
    Windows service.
    """
    root = Path(base_dir) if base_dir is not None else Path(__file__).resolve().parent
    env_path = root / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


def main():
    """Run administrative tasks."""
    load_sibling_env()
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
