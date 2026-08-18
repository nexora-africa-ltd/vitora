#!/usr/bin/env bash
# Notification burst helper for rapid end-to-end notification checks.
#
# How to run:
#   cd backend && ./scripts/notif-burst.sh <username> [count]
#
# Supported args/inputs:
#   - Arg 1 (required): username to receive notifications.
#   - Arg 2 (optional): number of notifications to create (default: 5).
#   - Uses Poetry when available; otherwise falls back to python/python3.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/notif-burst.sh <username> [count]"
  exit 1
fi

USERNAME="$1"
COUNT="${2:-5}"

if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || [[ "$COUNT" -lt 1 ]]; then
  echo "Error: [count] must be a positive integer"
  exit 1
fi

if command -v poetry >/dev/null 2>&1; then
  RUNNER=(poetry run python)
elif command -v python >/dev/null 2>&1; then
  RUNNER=(python)
elif command -v python3 >/dev/null 2>&1; then
  RUNNER=(python3)
else
  echo "Error: poetry, python, or python3 is required"
  exit 1
fi

BURST_USER="$USERNAME" BURST_COUNT="$COUNT" "${RUNNER[@]}" manage.py shell -c '
import os
from django.contrib.auth import get_user_model
from hmis.apps.core.services.notification_service import notify_users

username = os.environ["BURST_USER"]
count = int(os.environ.get("BURST_COUNT", "5"))
user = get_user_model().objects.get(username=username)

for i in range(count):
    notify_users(
        users=[user],
        notification_type="system",
        priority="high" if i % 2 == 0 else "normal",
        title=f"Burst notification #{i + 1}",
        message=f"Manual rapid-check notification {i + 1}/{count}",
        related_model="Encounter",
        related_id=99000 + i,
        action_url="/encounters",
    )

print(f"Created {count} notifications for {user.username}")
'
