#!/usr/bin/env python3
"""
Fetch all SHA BenefitsAndInterventions concepts from DHA KNHTS (OCL API)
and export to JSONL format.

Source: https://nhts.dha.go.ke/orgs/MOH-KENYA/sources/BenefitsAndInterventions/
API:    https://ilm-hie.dha.go.ke/ocl/

Usage:
    python scripts/scrape_benefits_interventions.py
    python scripts/scrape_benefits_interventions.py --output data/benefits.jsonl
    python scripts/scrape_benefits_interventions.py --page-size 200
"""

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

API_BASE = "https://ilm-hie.dha.go.ke/ocl"
SOURCE_PATH = "/orgs/MOH-KENYA/sources/BenefitsAndInterventions/concepts/"
DEFAULT_OUTPUT = "data/sha_benefits_and_interventions.jsonl"
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds


def fetch_page(page: int, page_size: int) -> list[dict]:
    """Fetch a single page of concepts from the OCL API."""
    params = urlencode({
        "limit": page_size,
        "page": page,
        "verbose": "true",
    })
    url = f"{API_BASE}{SOURCE_PATH}?{params}"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode())
                return data
        except (HTTPError, URLError, TimeoutError) as e:
            if attempt == MAX_RETRIES:
                print(f"\n  ERROR: Failed after {MAX_RETRIES} attempts: {e}", file=sys.stderr)
                raise
            print(f"\n  Retry {attempt}/{MAX_RETRIES} (page {page}): {e}", file=sys.stderr)
            time.sleep(RETRY_DELAY * attempt)
    return []


def normalize_concept(raw: dict) -> dict:
    """Extract and flatten the useful fields from a raw OCL concept."""
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


def main():
    parser = argparse.ArgumentParser(description="Export SHA BenefitsAndInterventions to JSONL")
    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT, help="Output JSONL file path")
    parser.add_argument("--page-size", type=int, default=100, help="Items per API page (max ~200)")
    parser.add_argument("--raw", action="store_true", help="Write raw API response (no normalization)")
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Fetching BenefitsAndInterventions from DHA KNHTS...")
    print(f"  API: {API_BASE}{SOURCE_PATH}")
    print(f"  Page size: {args.page_size}")
    print(f"  Output: {output_path}")
    print()

    total_written = 0
    page = 1

    with open(output_path, "w", encoding="utf-8") as f:
        while True:
            concepts = fetch_page(page, args.page_size)

            if not concepts:
                break

            for concept in concepts:
                record = concept if args.raw else normalize_concept(concept)
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                total_written += 1

            print(f"  Page {page}: fetched {len(concepts)} concepts (total: {total_written})")

            if len(concepts) < args.page_size:
                break  # Last page

            page += 1
            time.sleep(0.5)  # Be polite to the server

    print(f"\nDone! Exported {total_written} concepts to {output_path}")


if __name__ == "__main__":
    main()
