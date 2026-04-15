"""
Management command to configure Metabase dashboards for embedding.

Ensures every dashboard (except sample data dashboards) has:
  1. A ``facility_id`` filter parameter (type ``number/=``)
  2. ``embedding_params`` with ``facility_id`` locked

This command is idempotent and safe to run repeatedly.

Usage:
    python manage.py configure_metabase_embedding
    python manage.py configure_metabase_embedding --dry-run
    python manage.py configure_metabase_embedding --secret <key>
"""

import requests
from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Configure Metabase dashboards for embedded analytics."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be changed without making modifications.",
        )
        parser.add_argument(
            "--secret",
            type=str,
            default="",
            help="Set the Metabase embedding secret key (only needed once).",
        )
        parser.add_argument(
            "--metabase-url",
            type=str,
            default="",
            help="Override METABASE_SITE_URL.",
        )
        parser.add_argument(
            "--api-key",
            type=str,
            default="",
            help="Override METABASE_API_KEY for authentication.",
        )

    def handle(self, *args, **options):
        site_url = (
            options["metabase_url"]
            or getattr(settings, "METABASE_API_URL", "")
            or getattr(settings, "METABASE_SITE_URL", "")
        ).rstrip("/")
        api_key = options["api_key"] or getattr(settings, "METABASE_API_KEY", "")
        dry_run = options["dry_run"]
        secret = options["secret"]

        if not site_url:
            self.stderr.write(
                self.style.ERROR(
                    "METABASE_SITE_URL is not configured. "
                    "Set it in settings or pass --metabase-url."
                )
            )
            return

        headers = {}
        if api_key:
            headers["x-api-key"] = api_key

        # ── Step 1: Set embedding secret (once) ─────────────────────────
        if secret:
            if dry_run:
                self.stdout.write("[DRY RUN] Would set embedding-secret-key")
            else:
                resp = requests.put(
                    f"{site_url}/api/setting/embedding-secret-key",
                    json={"value": secret},
                    headers={**headers, "Content-Type": "application/json"},
                    timeout=10,
                )
                if resp.ok:
                    self.stdout.write(self.style.SUCCESS("Embedding secret key set."))
                else:
                    self.stderr.write(
                        self.style.ERROR(
                            f"Failed to set secret: {resp.status_code} {resp.text[:200]}"
                        )
                    )

        # ── Step 2: Fetch all dashboards ─────────────────────────────────
        try:
            resp = requests.get(
                f"{site_url}/api/dashboard",
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            self.stderr.write(self.style.ERROR(f"Cannot reach Metabase: {exc}"))
            return

        dashboards = resp.json()
        self.stdout.write(f"Found {len(dashboards)} dashboards.")

        FACILITY_ID_PARAM = {
            "name": "Facility ID",
            "slug": "facility_id",
            "id": "facility_id",
            "type": "number/=",
            "sectionId": "number",
        }

        updated = 0
        skipped = 0

        for d in dashboards:
            dash_id = d["id"]
            dash_name = d["name"]
            params = d.get("parameters") or []
            embedding_params = d.get("embedding_params") or {}

            has_facility_param = any(p.get("slug") == "facility_id" for p in params)
            has_locked = embedding_params.get("facility_id") == "locked"

            if has_facility_param and has_locked:
                self.stdout.write(f"  ✓ {dash_name} (ID={dash_id}) — already configured")
                skipped += 1
                continue

            # Build the update payload
            payload = {}
            if not has_facility_param:
                payload["parameters"] = params + [FACILITY_ID_PARAM]
            if not has_locked:
                payload["embedding_params"] = {
                    **embedding_params,
                    "facility_id": "locked",
                }

            if dry_run:
                self.stdout.write(
                    f"  [DRY RUN] Would update {dash_name} (ID={dash_id}): "
                    f"add_param={not has_facility_param}, lock={not has_locked}"
                )
                updated += 1
                continue

            try:
                resp = requests.put(
                    f"{site_url}/api/dashboard/{dash_id}",
                    json=payload,
                    headers={**headers, "Content-Type": "application/json"},
                    timeout=10,
                )
                resp.raise_for_status()
                result = resp.json()
                ep = result.get("embedding_params", {})
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  ✓ Updated {dash_name} (ID={dash_id}) — embedding_params={ep}"
                    )
                )
                updated += 1
            except requests.RequestException as exc:
                self.stderr.write(
                    self.style.ERROR(f"  ✗ Failed to update {dash_name} (ID={dash_id}): {exc}")
                )

        self.stdout.write(f"\nDone: {updated} updated, {skipped} already configured.")
