#!/usr/bin/env python3
"""
Scrape ALL sections of the DHA HIE documentation into separate Markdown files.

Sections:
  - Authentication     -> docs/hie-authentication.md
  - Claims & Preauths  -> docs/hie-claims-preauths.md
  - Consent Services   -> docs/hie-consent-services.md
  - Registries         -> docs/hie-registries.md
  - Terminology Service-> docs/hie-terminology-service.md
  - Changelog          -> docs/hie-changelog.md
  - API Catalog        -> docs/hie-api-catalog.md

The site (hie-docs.dha.go.ke) is a Zudoku SPA — uses Playwright for JS rendering.

Usage:
    python scripts/scrape_hie_docs.py
    python scripts/scrape_hie_docs.py --sections claims consent
    python scripts/scrape_hie_docs.py --output-dir /path/to/dir
    python scripts/scrape_hie_docs.py --delay 3.0

Prerequisites:
    pip install playwright beautifulsoup4
    playwright install chromium
"""

import argparse
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin

try:
    from playwright.sync_api import sync_playwright, Page
    from bs4 import BeautifulSoup, Tag
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install playwright beautifulsoup4")
    print("  playwright install chromium")
    sys.exit(1)


BASE_URL = "https://hie-docs.dha.go.ke"

# Section definitions: name -> (output_filename, entry_url, pages_list)
# Pages will be auto-discovered from the sidebar, but we define known pages as fallback
SECTIONS = {
    "authentication": {
        "title": "Authentication",
        "output": "hie-authentication.md",
        "prefix": "/docs/authentication",
        "pages": [
            "/docs/authentication/getting-started/intro",
        ],
    },
    "claims": {
        "title": "Claims & Preauths",
        "output": "hie-claims-preauths.md",
        "prefix": "/docs/claims",
        "pages": [
            "/docs/claims/getting-started/introduction",
            # Guides
            "/docs/claims/guides/benefit-intervention-codes",
            "/docs/claims/guides/sha-combination-rules",
            "/docs/claims/guides/understandingClaimStatuses",
            "/docs/claims/guides/understandingClaims",
            "/docs/claims/guides/understandingPreauthStatuses",
            "/docs/claims/guides/understandingPreauths",
            # Start Visit & Consent
            "/docs/claims/process/startVisitConsent/startVisitConsentProcessOverview",
            "/docs/claims/process/startVisitConsent/startVisitWorkflow",
            # Eligibility
            "/docs/claims/process/eligibility/eligibilityProcessOverview",
            "/docs/claims/process/eligibility/eligibilityCheck",
            "/docs/claims/process/eligibility/benefitsCoverage",
            "/docs/claims/process/eligibility/interventionsCoverage",
            # Preauths
            "/docs/claims/process/preauths/preauthsProcessOverview",
            "/docs/claims/process/preauths/normalPreauths",
            "/docs/claims/process/preauths/surgicalPreauths",
            "/docs/claims/process/preauths/electivePreauths",
            "/docs/claims/process/preauths/oncologyPreauth",
            "/docs/claims/process/preauths/renalPreauth",
            "/docs/claims/process/preauths/imagingPreauth",
            "/docs/claims/process/preauths/opticalPreauth",
            "/docs/claims/process/preauths/cancelPreauth",
            # Doctor Consent
            "/docs/claims/process/preauthDoctorConsent/preauthDocConsent",
            # Interventions
            "/docs/claims/process/interventions/interventionProcessOverview",
            "/docs/claims/process/interventions/addIntervention",
            "/docs/claims/process/interventions/switchIntervention",
            "/docs/claims/process/interventions/retireIntervention",
            "/docs/claims/process/interventions/restoreIntervention",
            # Billing
            "/docs/claims/process/billing/billingProcessOverview",
            "/docs/claims/process/billing/addNewLine",
            "/docs/claims/process/billing/editClaimLine",
            "/docs/claims/process/billing/removeLine",
            "/docs/claims/process/billing/addDiagnosis",
            "/docs/claims/process/billing/removeDiagnosis",
            "/docs/claims/process/billing/addAttachment",
            "/docs/claims/process/billing/removeAttachment",
            "/docs/claims/process/billing/previewProviderClaim",
            "/docs/claims/process/billing/previewPayerClaim",
            "/docs/claims/process/billing/closeClaim",
            "/docs/claims/process/billing/resubmitClaim",
            # Claim Dispatch
            "/docs/claims/process/claimDispatch/claimDispatchProcessOverview",
            "/docs/claims/process/claimDispatch/outPatientClaimDispatch",
            "/docs/claims/process/claimDispatch/inPatientClaimDispatch",
            # Remittances
            "/docs/claims/process/remittances/remittanceProcessOverview",
            "/docs/claims/process/remittances/getRemittance",
            "/docs/claims/process/remittances/getClaimsPaidbyRemittance",
        ],
    },
    "consent": {
        "title": "Consent Services",
        "output": "hie-consent-services.md",
        "prefix": "/docs/consent",
        "pages": [
            "/docs/consent/getting-started/intro",
            "/docs/consent/process/getBeneficiaryValidContact",
            "/docs/consent/process/sendOTP",
            "/docs/consent/process/biometricsConsent",
            "/docs/consent/process/createOTPWhitelistRequest",
            "/docs/consent/process/getOTPWhitelistRequest",
        ],
    },
    "registries": {
        "title": "Registries",
        "output": "hie-registries.md",
        "prefix": "/docs/registries",
        "pages": [
            "/docs/registries/gettingStarted/introduction",
            "/docs/registries/process/patientSearch",
            "/docs/registries/process/facilitySearch",
            "/docs/registries/process/professionalSearch",
        ],
    },
    "terminology": {
        "title": "Terminology Service",
        "output": "hie-terminology-service.md",
        "prefix": "/docs/terminologyService",
        "pages": [
            "/docs/terminologyService/gettingStarted/intro",
        ],
    },
    "changelog": {
        "title": "Changelog",
        "output": "hie-changelog.md",
        "prefix": "/changelog",
        "pages": [
            "/changelog",
        ],
    },
    "catalog": {
        "title": "API Catalog",
        "output": "hie-api-catalog.md",
        "prefix": "/catalog",
        "pages": [
            "/catalog",
        ],
    },
}


@dataclass
class ScrapedPage:
    url: str
    title: str
    markdown: str
    diagrams: list[str] = field(default_factory=list)


def wait_for_content(page: Page) -> None:
    """Wait for the SPA to finish rendering content."""
    try:
        page.wait_for_selector(
            "article, [class*='prose'], main h1, main h2", timeout=15000
        )
    except Exception:
        pass
    # Wait for dynamic content
    try:
        page.wait_for_load_state("networkidle", timeout=10000)
    except Exception:
        pass
    page.wait_for_timeout(1500)


def get_page_html(page: Page) -> str:
    """Get the rendered HTML content from the main content area."""
    return page.evaluate("""() => {
        const selectors = [
            'article',
            'main [class*="content"]',
            '[class*="prose"]',
            'main',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText.trim().length > 50) {
                return el.innerHTML;
            }
        }
        const main = document.querySelector('main');
        if (main) return main.innerHTML;
        return document.body.innerHTML;
    }""") or ""


def get_page_title(page: Page) -> str:
    """Extract the page title."""
    title = page.evaluate("""() => {
        const h1 = document.querySelector('article h1, main h1, [class*="prose"] h1');
        if (h1) return h1.textContent.trim();
        return document.title.split(' - ')[0].trim();
    }""")
    title = re.sub(r"Link to [\w-]+$", "", title or "").strip()
    return title


def extract_sequence_diagrams(page: Page) -> list[dict]:
    """Extract sequence diagram text from rendered SVGs."""
    return page.evaluate("""() => {
        const results = [];
        document.querySelectorAll('svg').forEach(svg => {
            const rect = svg.getBoundingClientRect();
            if (rect.width < 200 || rect.height < 100) return;
            const cls = svg.className && svg.className.baseVal ? svg.className.baseVal : '';
            if (cls.includes('lucide') || cls.includes('icon')) return;

            const textEls = [];
            svg.querySelectorAll('text').forEach(el => {
                const t = el.textContent.trim();
                if (t) {
                    const r = el.getBoundingClientRect();
                    const elCls = el.getAttribute('class') || '';
                    textEls.push({text: t, y: r.y, x: r.x, cls: elCls});
                }
            });
            textEls.sort((a, b) => a.y - b.y || a.x - b.x);

            const actors = [];
            const messages = [];
            const notes = [];

            textEls.forEach(item => {
                if (item.cls.includes('actor')) {
                    if (actors.indexOf(item.text) === -1) actors.push(item.text);
                } else if (item.cls.includes('messageText')) {
                    messages.push(item.text);
                } else if (item.cls.includes('noteText')) {
                    notes.push(item.text);
                }
            });

            svg.querySelectorAll('.note tspan').forEach(el => {
                const t = el.textContent.trim();
                if (t && notes.indexOf(t) === -1) notes.push(t);
            });

            if (actors.length > 0 || messages.length > 0) {
                results.push({actors, messages, notes, isSequenceDiagram: true});
            }
        });
        return results;
    }""") or []


def discover_section_pages(page: Page, prefix: str) -> list[str]:
    """Discover pages belonging to a section from the sidebar navigation."""
    links = page.evaluate("""(prefix) => {
        const results = [];
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href') || '';
            if (href.startsWith(prefix) && href.indexOf('#') === -1) {
                if (results.indexOf(href) === -1) results.push(href);
            }
        });
        return results;
    }""", prefix)
    return links or []


def html_to_markdown(html: str, page_url: str) -> str:
    """Convert HTML string to Markdown."""
    soup = BeautifulSoup(html, "html.parser")
    lines: list[str] = []
    _convert_element(soup, lines, page_url)
    text = "\n".join(lines)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    text = re.sub(r"Link to [\w-]+", "", text)
    return text.strip()


def _convert_element(el, lines: list[str], page_url: str) -> None:
    """Recursively convert HTML elements to markdown lines."""
    if isinstance(el, str):
        text = el.strip()
        if text:
            lines.append(text)
        return

    if not isinstance(el, Tag):
        return

    tag = el.name

    if tag in ("script", "style", "nav", "button", "noscript", "header", "footer"):
        return

    classes = " ".join(el.get("class", []))
    if any(
        skip in classes
        for skip in ["breadcrumb", "pagination", "sidebar", "toc", "copy-button"]
    ):
        return

    if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
        level = int(tag[1])
        text = el.get_text(strip=True)
        text = re.sub(r"Link to [\w-]+$", "", text).strip()
        if text:
            lines.append("")
            lines.append(f"{'#' * level} {text}")
            lines.append("")
        return

    if tag == "p":
        text = _inline_text(el, page_url)
        if text.strip():
            lines.append("")
            lines.append(text)
            lines.append("")
        return

    if tag == "pre":
        code_el = el.find("code")
        if code_el:
            el_classes = code_el.get("class", [])
            lang = ""
            for cls in el_classes:
                if "language-" in cls:
                    lang = cls.split("language-")[-1]
                    break
            code_text = code_el.get_text()
            lines.append("")
            lines.append(f"```{lang}")
            lines.append(code_text.rstrip())
            lines.append("```")
            lines.append("")
        else:
            code_text = el.get_text()
            lines.append("")
            lines.append("```")
            lines.append(code_text.rstrip())
            lines.append("```")
            lines.append("")
        return

    if tag == "code" and el.parent and el.parent.name != "pre":
        return

    if tag == "table":
        _convert_table(el, lines)
        return

    if tag in ("ul", "ol"):
        lines.append("")
        for i, li in enumerate(el.find_all("li", recursive=False)):
            prefix = f"{i + 1}. " if tag == "ol" else "- "
            text = _inline_text(li, page_url)
            lines.append(f"{prefix}{text}")
        lines.append("")
        return

    if tag == "img":
        src = el.get("src", "")
        alt = el.get("alt", "Diagram")
        if src and not any(
            skip in src.lower() for skip in ["logo", "icon", "favicon"]
        ):
            full_url = urljoin(page_url, src) if not src.startswith("http") else src
            lines.append("")
            lines.append(f"![{alt}]({full_url})")
            lines.append("")
        return

    if tag == "svg":
        svg_classes = " ".join(el.get("class", []))
        if "lucide" in svg_classes or "icon" in svg_classes:
            return
        title_el = el.find("title")
        if title_el:
            lines.append("")
            lines.append(f"*[Flowchart: {title_el.get_text(strip=True)}]*")
            lines.append("")
        return

    if tag == "blockquote":
        lines.append("")
        for child in el.children:
            if isinstance(child, Tag):
                child_text = _inline_text(child, page_url)
                if child_text.strip():
                    for line in child_text.split("\n"):
                        lines.append(f"> {line}")
            elif isinstance(child, str) and child.strip():
                lines.append(f"> {child.strip()}")
        lines.append("")
        return

    if tag == "hr":
        lines.append("")
        lines.append("---")
        lines.append("")
        return

    if tag == "details":
        summary = el.find("summary")
        if summary:
            lines.append("")
            lines.append(
                f"<details><summary>{summary.get_text(strip=True)}</summary>"
            )
            lines.append("")
        for child in el.children:
            if isinstance(child, Tag) and child.name == "summary":
                continue
            _convert_element(child, lines, page_url)
        lines.append("</details>")
        lines.append("")
        return

    if tag == "div" and any(
        kw in classes
        for kw in ["admonition", "callout", "alert", "warning", "info", "note"]
    ):
        lines.append("")
        if "warning" in classes:
            lines.append("> **Warning**")
        elif "info" in classes:
            lines.append("> **Info**")
        else:
            lines.append("> **Note**")
        text = el.get_text(strip=True)
        for line in text.split("\n"):
            if line.strip():
                lines.append(f"> {line.strip()}")
        lines.append("")
        return

    for child in el.children:
        _convert_element(child, lines, page_url)


def _inline_text(el: Tag, page_url: str) -> str:
    """Convert inline HTML to markdown text."""
    parts: list[str] = []
    for child in el.children:
        if isinstance(child, str):
            parts.append(child)
        elif isinstance(child, Tag):
            if child.name == "code":
                parts.append(f"`{child.get_text()}`")
            elif child.name in ("strong", "b"):
                parts.append(f"**{child.get_text()}**")
            elif child.name in ("em", "i"):
                parts.append(f"*{child.get_text()}*")
            elif child.name == "a":
                href = child.get("href", "")
                text = child.get_text(strip=True)
                if href:
                    if href.startswith("/") or href.startswith("#"):
                        full_url = urljoin(page_url, href)
                    else:
                        full_url = href
                    parts.append(f"[{text}]({full_url})")
                else:
                    parts.append(text)
            elif child.name == "br":
                parts.append("\n")
            elif child.name == "img":
                src = child.get("src", "")
                alt = child.get("alt", "")
                if src and "logo" not in src.lower() and "icon" not in src.lower():
                    full_url = (
                        urljoin(page_url, src)
                        if not src.startswith("http")
                        else src
                    )
                    parts.append(f"![{alt}]({full_url})")
            elif child.name in ("span", "div", "li", "td", "th"):
                parts.append(_inline_text(child, page_url))
            elif child.name in ("script", "style", "button", "svg"):
                pass
            else:
                parts.append(child.get_text())
    return "".join(parts).strip()


def _convert_table(table: Tag, lines: list[str]) -> None:
    """Convert HTML table to markdown."""
    rows: list[list[str]] = []

    thead = table.find("thead")
    headers: list[str] = []
    if thead:
        for th in thead.find_all(["th", "td"]):
            headers.append(th.get_text(strip=True))

    tbody = table.find("tbody") or table
    for tr in tbody.find_all("tr", recursive=False if tbody.name == "tbody" else True):
        cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
        if cells and any(c.strip() for c in cells):
            rows.append(cells)

    if not headers and rows:
        headers = rows.pop(0)

    if not headers and not rows:
        return

    max_cols = max(
        len(headers), max((len(r) for r in rows), default=0)
    )
    headers = (headers + [""] * max_cols)[:max_cols]

    lines.append("")
    lines.append("| " + " | ".join(h or " " for h in headers) + " |")
    lines.append("| " + " | ".join(["---"] * max_cols) + " |")
    for row in rows:
        padded = (row + [""] * max_cols)[:max_cols]
        escaped = [c.replace("|", "\\|") for c in padded]
        lines.append("| " + " | ".join(escaped) + " |")
    lines.append("")


def format_sequence_diagram(svg_info: dict) -> str:
    """Format sequence diagram as readable markdown."""
    actors = svg_info.get("actors", [])
    messages = svg_info.get("messages", [])
    notes = svg_info.get("notes", [])

    if not messages and not actors:
        return ""

    parts: list[str] = []

    if actors:
        unique_actors = list(dict.fromkeys(actors))
        parts.append("**Participants:**")
        for actor in unique_actors:
            parts.append(f"- {actor}")
        parts.append("")

    if messages:
        parts.append("**Flow:**")
        for i, msg in enumerate(messages, 1):
            parts.append(f"{i}. {msg}")
        parts.append("")

    if notes:
        unique_notes = list(dict.fromkeys(notes))
        parts.append("**Notes:**")
        for note in unique_notes:
            parts.append(f"- {note}")
        parts.append("")

    return "\n".join(parts)


def scrape_page(page: Page, path: str) -> ScrapedPage | None:
    """Navigate to a page, wait for render, and extract content."""
    url = urljoin(BASE_URL, path)
    print(f"    Fetching: {url}")

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        wait_for_content(page)
    except Exception as e:
        print(f"    [ERROR] Failed to load {url}: {e}")
        return None

    title = get_page_title(page)
    if not title:
        title = path.split("/")[-1].replace("-", " ").title()

    # Extract diagrams
    diagrams = extract_sequence_diagrams(page)

    # Get HTML and convert
    content_html = get_page_html(page)
    if not content_html or len(content_html) < 50:
        print(f"    [WARN] Minimal content for {url}")
        return None

    markdown = html_to_markdown(content_html, url)

    # Insert diagram text if found
    if diagrams:
        for svg_info in diagrams:
            if not svg_info.get("isSequenceDiagram"):
                continue
            diagram_md = format_sequence_diagram(svg_info)
            if diagram_md:
                if "## Complete Flow" in markdown:
                    markdown = markdown.replace(
                        "## Complete Flow",
                        f"## Complete Flow\n\n{diagram_md}",
                        1,
                    )
                else:
                    markdown += f"\n\n### Sequence Diagram\n\n{diagram_md}"

    return ScrapedPage(url=url, title=title, markdown=markdown)


def build_section_document(section_title: str, pages: list[ScrapedPage]) -> str:
    """Build a unified markdown document for a section."""
    parts: list[str] = []

    parts.append(f"# DHA HIE: {section_title}")
    parts.append("")
    parts.append(
        f"> **Source**: [DHA Health Information Exchange]"
        f"(https://hie-docs.dha.go.ke)"
    )
    parts.append(
        f"> **Scraped**: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}"
    )
    parts.append(
        "> **Purpose**: Offline reference for Vitora HMIS SHA integration"
    )
    parts.append("")
    parts.append("---")
    parts.append("")

    # TOC
    if len(pages) > 1:
        parts.append("## Table of Contents")
        parts.append("")
        for i, pg in enumerate(pages, 1):
            anchor = re.sub(r"[^a-z0-9\s-]", "", pg.title.lower())
            anchor = re.sub(r"\s+", "-", anchor.strip())
            parts.append(f"{i}. [{pg.title}](#{anchor})")
        parts.append("")
        parts.append("---")
        parts.append("")

    # Content
    for pg in pages:
        parts.append(f"## {pg.title}")
        parts.append("")
        parts.append(f"> Source: [{pg.url}]({pg.url})")
        parts.append("")
        parts.append(pg.markdown)
        parts.append("")
        parts.append("---")
        parts.append("")

    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser(
        description="Scrape DHA HIE documentation sections to Markdown files"
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        default=None,
        help="Output directory (default: docs/)",
    )
    parser.add_argument(
        "--sections",
        "-s",
        nargs="*",
        choices=list(SECTIONS.keys()),
        default=None,
        help="Specific sections to scrape (default: all)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="Delay between page navigations in seconds (default: 1.5)",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run browser in headed mode for debugging",
    )
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Discover additional pages from sidebar (slower but more complete)",
    )
    args = parser.parse_args()

    # Output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        script_dir = Path(__file__).resolve().parent
        output_dir = script_dir.parent / "docs"

    # Sections to scrape
    sections_to_scrape = args.sections or list(SECTIONS.keys())

    print("DHA HIE Documentation Scraper")
    print("=" * 50)
    print(f"Output dir: {output_dir}")
    print(f"Sections: {', '.join(sections_to_scrape)}")
    print(f"Delay: {args.delay}s")
    print(f"Discover mode: {'on' if args.discover else 'off'}")
    print()

    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        total_pages_scraped = 0
        total_files_written = 0

        for section_key in sections_to_scrape:
            section = SECTIONS[section_key]
            print(f"\n{'='*50}")
            print(f"  SECTION: {section['title']}")
            print(f"{'='*50}")

            pages_to_scrape = list(section["pages"])

            # Optionally discover additional pages
            if args.discover and pages_to_scrape:
                print(f"  Discovering pages (prefix: {section['prefix']})...")
                try:
                    page.goto(
                        urljoin(BASE_URL, pages_to_scrape[0]),
                        wait_until="domcontentloaded",
                        timeout=20000,
                    )
                    wait_for_content(page)
                    discovered = discover_section_pages(page, section["prefix"])
                    new_pages = [
                        p for p in discovered
                        if p not in pages_to_scrape
                    ]
                    if new_pages:
                        print(f"  + Discovered {len(new_pages)} additional pages")
                        pages_to_scrape.extend(new_pages)
                except Exception as e:
                    print(f"  [WARN] Discovery failed: {e}")

            # Deduplicate
            seen = set()
            deduped = []
            for p in pages_to_scrape:
                clean = p.split("#")[0].rstrip("/")
                if clean not in seen:
                    seen.add(clean)
                    deduped.append(clean)
            pages_to_scrape = deduped

            print(f"  Pages to scrape: {len(pages_to_scrape)}")

            # Scrape each page
            scraped: list[ScrapedPage] = []
            for i, path in enumerate(pages_to_scrape):
                result = scrape_page(page, path)
                if result:
                    scraped.append(result)
                    print(
                        f"    ✓ [{i+1}/{len(pages_to_scrape)}] "
                        f"{result.title} ({len(result.markdown):,} chars)"
                    )
                else:
                    print(f"    ✗ [{i+1}/{len(pages_to_scrape)}] Failed: {path}")

                if i < len(pages_to_scrape) - 1:
                    time.sleep(args.delay)

            if not scraped:
                print(f"  [SKIP] No pages scraped for {section['title']}")
                continue

            # Build and write document
            document = build_section_document(section["title"], scraped)
            output_path = output_dir / section["output"]
            output_path.write_text(document, encoding="utf-8")

            total_pages_scraped += len(scraped)
            total_files_written += 1
            print(
                f"\n  ✓ Written: {output_path.name} "
                f"({len(document):,} chars, {len(scraped)} pages)"
            )

        browser.close()

    print(f"\n{'='*50}")
    print(f"COMPLETE")
    print(f"{'='*50}")
    print(f"  Files written: {total_files_written}")
    print(f"  Pages scraped: {total_pages_scraped}")
    print(f"  Output dir: {output_dir}")
    print()


if __name__ == "__main__":
    main()
