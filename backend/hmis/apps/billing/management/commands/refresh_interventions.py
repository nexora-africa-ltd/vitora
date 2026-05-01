"""
Management command to refresh the local SHA BenefitsAndInterventions JSONL
from the DHA KNHTS OCL API.

Usage:
    python manage.py refresh_interventions
    python manage.py refresh_interventions --page-size 200
    python manage.py refresh_interventions --dry-run
"""

import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.management.base import BaseCommand

from hmis.apps.billing.services.intervention_fallback import clear_cache

OCL_API_BASE = "https://ilm-hie.dha.go.ke/ocl"
SOURCE_PATH = "/orgs/MOH-KENYA/sources/BenefitsAndInterventions/concepts/"
MAX_RETRIES = 3
RETRY_DELAY = 5


class Command(BaseCommand):
    help = "Refresh local SHA BenefitsAndInterventions data from DHA KNHTS (OCL API)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--page-size",
            type=int,
            default=100,
            help="Items per API page (default: 100, max ~200)",
        )
        parser.add_argument(
            "--output",
            type=str,
            default=None,
            help="Output path (default: data/sha/benefits_and_interventions.jsonl)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch and count records without writing to disk",
        )
        parser.add_argument(
            "--raw",
            action="store_true",
            help="Write raw OCL API response (no normalization)",
        )

    def handle(self, *args, **options):
        page_size = options["page_size"]
        dry_run = options["dry_run"]
        raw = options["raw"]

        output_path = options["output"]
        if output_path:
            output_path = Path(output_path)
        else:
            output_path = (
                Path(settings.BASE_DIR) / "data" / "sha" / "benefits_and_interventions.jsonl"
            )

        self.stdout.write("Fetching BenefitsAndInterventions from DHA KNHTS...")
        self.stdout.write(f"  API: {OCL_API_BASE}{SOURCE_PATH}")
        self.stdout.write(f"  Page size: {page_size}")
        self.stdout.write(f"  Output: {output_path}")
        if dry_run:
            self.stdout.write(self.style.WARNING("  DRY RUN — no file will be written"))
        self.stdout.write("")

        total_fetched = 0
        page = 1
        all_records = []

        while True:
            concepts = self._fetch_page(page, page_size)
            if not concepts:
                break

            for concept in concepts:
                record = concept if raw else self._normalize(concept)
                all_records.append(record)
                total_fetched += 1

            self.stdout.write(f"  Page {page}: fetched {len(concepts)} (total: {total_fetched})")

            if len(concepts) < page_size:
                break

            page += 1
            time.sleep(0.5)  # Rate limiting

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f"\nDry run complete. Would write {total_fetched} records.")
            )
            return

        # Write atomically: write to temp, then rename
        output_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = output_path.with_suffix(".jsonl.tmp")

        with open(tmp_path, "w", encoding="utf-8") as f:
            for record in all_records:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        tmp_path.rename(output_path)

        # Clear the in-memory cache so next request picks up fresh data
        clear_cache()

        self.stdout.write(
            self.style.SUCCESS(f"\nDone! Refreshed {total_fetched} interventions → {output_path}")
        )

    def _fetch_page(self, page: int, page_size: int) -> list[dict]:
        """Fetch a single page from the OCL API with retry logic."""
        params = urlencode({"limit": page_size, "page": page, "verbose": "true"})
        url = f"{OCL_API_BASE}{SOURCE_PATH}?{params}"

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                req = Request(url, headers={"Accept": "application/json"})  # noqa: S310
                with urlopen(req, timeout=60) as resp:  # noqa: S310  # nosec B310 — URL is hardcoded HTTPS constant
                    return json.loads(resp.read().decode())
            except (HTTPError, URLError, TimeoutError) as e:
                if attempt == MAX_RETRIES:
                    self.stderr.write(
                        self.style.ERROR(
                            f"  FAILED after {MAX_RETRIES} attempts (page {page}): {e}"
                        )
                    )
                    raise
                self.stderr.write(f"  Retry {attempt}/{MAX_RETRIES} (page {page}): {e}")
                time.sleep(RETRY_DELAY * attempt)
        return []

    @staticmethod
    def _normalize(raw: dict) -> dict:
        """Extract and flatten useful fields from a raw OCL concept."""
        return {
            "id": raw.get("id"),
            "uuid": raw.get("uuid"),
            "display_name": raw.get("display_name"),
            "concept_class": raw.get("concept_class"),
            "retired": raw.get("retired", False),
            "description": next(
                (d["description"] for d in raw.get("descriptions", []) if d.get("locale") == "en"),
                None,
            ),
            "names": [
                {"name": n["name"], "type": n.get("name_type"), "locale": n.get("locale")}
                for n in raw.get("names", [])
            ],
            "extras": raw.get("extras", {}),
            "url": raw.get("url"),
            "source": raw.get("source"),
            "owner": raw.get("owner"),
            "created_on": raw.get("created_on"),
            "updated_on": raw.get("updated_on"),
        }
