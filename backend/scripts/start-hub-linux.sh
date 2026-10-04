#!/usr/bin/env bash
# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# Hub systemd launcher: loads non-secret config plus a systemd decrypted credential, then starts hub jobs.
# Usage: start-hub-linux.sh api|sync|backup|backup-upload|backup-verify. Inputs: /opt/vitora/.env and $CREDENTIALS_DIRECTORY/hub-secrets.

set -euo pipefail

MODE="${1:-api}"
APP_DIR="${VITORA_HUB_DIR:-/opt/vitora}"
ENV_FILE="$APP_DIR/.env"
CREDENTIAL_FILE="${CREDENTIALS_DIRECTORY:-}/hub-secrets"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")
    set +a
fi

if [[ -z "$CREDENTIALS_DIRECTORY" || ! -r "$CREDENTIAL_FILE" ]]; then
    echo "Protected hub credential is unavailable; refusing to start." >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$CREDENTIAL_FILE"
set +a

cd "$APP_DIR"
case "$MODE" in
    api) exec "$APP_DIR/venv/bin/daphne" -b 0.0.0.0 -p "${HUB_PORT:-9088}" hmis.asgi:application ;;
    sync) exec "$APP_DIR/venv/bin/python" manage.py hub_sync --watch ;;
    backup) exec "$APP_DIR/venv/bin/python" manage.py hub_backup ;;
    backup-upload) exec "$APP_DIR/venv/bin/python" manage.py hub_backup_upload ;;
    backup-verify) exec "$APP_DIR/venv/bin/python" manage.py hub_backup --verify ;;
    *) echo "Usage: $0 api|sync|backup|backup-upload|backup-verify" >&2; exit 2 ;;
esac
