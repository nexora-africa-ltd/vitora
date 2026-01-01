#!/usr/bin/env python
"""
KEML 2023 PDF Extractor - Improved Version

Uses text extraction with regex parsing for better coverage.
"""

import csv
import re
import pdfplumber
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class Medicine:
    code: str
    name: str
    dose_form: str
    strength: str
    lou: str
    category: str = ""
    subcategory: str = ""
    sub_subcategory: str = ""
    footnotes: str = ""
    page: int = 0


def clean_name(name: str) -> tuple[str, str]:
    """Remove footnote numbers from name and return (clean_name, footnotes)."""
    # Match trailing numbers that are footnotes (superscript style)
    match = re.search(r'^(.+?)(\d{1,3}(?:,\s*\d{1,3})*)$', name.strip())
    if match:
        return match.group(1).strip(), match.group(2)
    return name.strip(), ""


def extract_keml_v2(pdf_path: str, output_path: str) -> dict:
    """Extract medicines using text-based parsing."""
    
    medicines = []
    current_category = ""
    current_subcategory = ""
    current_sub_subcategory = ""
    
    # Patterns
    main_category_pattern = re.compile(r'^(\d{1,2})[.\s•]+([A-Z][A-Z,\s&\-\']+(?:[A-Z]+)?)\s*$', re.MULTILINE)
    subcategory_pattern = re.compile(r'^(\d{1,2}\.\d{1,2})\s+([A-Z][a-zA-Z,\s\-\(\)&]+)\s*$', re.MULTILINE)
    sub_subcategory_pattern = re.compile(r'^(\d{1,2}\.\d{1,2}\.\d{1,2})\s+([A-Z][a-zA-Z,\s\-\(\)&]+)\s*$', re.MULTILINE)
    
    stats = {
        'total_pages': 0,
        'total_medicines': 0,
        'categories': {},
        'skipped_pages': []
    }
    
    with pdfplumber.open(pdf_path) as pdf:
        stats['total_pages'] = len(pdf.pages)
        print(f"Processing {len(pdf.pages)} pages...")
        
        for page_num, page in enumerate(pdf.pages, 1):
            if page_num % 20 == 0:
                print(f"  Page {page_num}...")
            
            # Skip first few pages (table of contents, intro)
            if page_num < 17:
                continue
            
            # Try table extraction first
            tables = page.extract_tables()
            
            for table in tables:
                if not table:
                    continue
                
                for row in table:
                    if not row or len(row) < 4:
                        continue
                    
                    # Clean cells
                    cells = [str(c).strip() if c else '' for c in row]
                    
                    # Skip header rows
                    if cells[0] == '#' or 'Name of Medicine' in cells[0]:
                        continue
                    
                    # Check for medicine row (code like X.X.X.X)
                    code_match = re.match(r'^(\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,3})$', cells[0])
                    if code_match:
                        code = cells[0]
                        name_raw = cells[1] if len(cells) > 1 else ''
                        name, footnotes = clean_name(name_raw)
                        dose_form = cells[2] if len(cells) > 2 else ''
                        strength = cells[3] if len(cells) > 3 else ''
                        lou = cells[4] if len(cells) > 4 else ''
                        
                        # Clean multi-line values
                        strength = ' '.join(strength.split())
                        
                        if name:  # Only add if we have a name
                            med = Medicine(
                                code=code,
                                name=name,
                                dose_form=dose_form,
                                strength=strength,
                                lou=lou,
                                category=current_category,
                                subcategory=current_subcategory,
                                sub_subcategory=current_sub_subcategory,
                                footnotes=footnotes,
                                page=page_num
                            )
                            medicines.append(med)
                            stats['total_medicines'] += 1
                    
                    # Check for category/subcategory headers in first column
                    combined = ' '.join(cells).strip()
                    
                    # Main category (e.g., "7. ANTI-INFECTIVE MEDICINES")
                    cat_match = main_category_pattern.match(combined)
                    if cat_match:
                        current_category = f"{cat_match.group(1)}. {cat_match.group(2).strip()}"
                        if current_category not in stats['categories']:
                            stats['categories'][current_category] = 0
                        current_subcategory = ""
                        current_sub_subcategory = ""
                    
                    # Subcategory (e.g., "7.2 Antibacterials")
                    subcat_match = subcategory_pattern.match(combined)
                    if subcat_match:
                        current_subcategory = f"{subcat_match.group(1)} {subcat_match.group(2).strip()}"
                        current_sub_subcategory = ""
                    
                    # Sub-subcategory (e.g., "7.2.1 Access Group Antibiotics")
                    sub_subcat_match = sub_subcategory_pattern.match(combined)
                    if sub_subcat_match:
                        current_sub_subcategory = f"{sub_subcat_match.group(1)} {sub_subcat_match.group(2).strip()}"
            
            # Also check page text for categories
            text = page.extract_text() or ""
            for line in text.split('\n'):
                line = line.strip()
                
                cat_match = main_category_pattern.match(line)
                if cat_match:
                    current_category = f"{cat_match.group(1)}. {cat_match.group(2).strip()}"
                    if current_category not in stats['categories']:
                        stats['categories'][current_category] = 0
                
                subcat_match = subcategory_pattern.match(line)
                if subcat_match and not re.match(r'^\d+\.\d+\.\d+', line):
                    current_subcategory = f"{subcat_match.group(1)} {subcat_match.group(2).strip()}"
    
    # Update category counts
    for med in medicines:
        if med.category in stats['categories']:
            stats['categories'][med.category] += 1
    
    # Write to CSV
    print(f"\nWriting {len(medicines)} medicines to CSV...")
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['code', 'name', 'dose_form', 'strength', 'lou', 
                      'category', 'subcategory', 'sub_subcategory', 'footnotes', 'page']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for med in medicines:
            writer.writerow(asdict(med))
    
    return stats


def main():
    """Main entry point."""
    pdf_path = Path(__file__).parent.parent.parent / ".tmp" / "KEMSA -Kenya Essential Medicines List 2023 (2).pdf"
    output_path = Path(__file__).parent.parent.parent / ".tmp" / "keml_2023_complete.csv"
    
    print(f"=== KEML 2023 Extraction (v2) ===")
    print(f"PDF: {pdf_path}")
    print(f"Output: {output_path}")
    
    if not pdf_path.exists():
        print(f"ERROR: PDF not found at {pdf_path}")
        return
    
    stats = extract_keml_v2(str(pdf_path), str(output_path))
    
    print(f"\n=== Extraction Complete ===")
    print(f"Total pages: {stats['total_pages']}")
    print(f"Medicines extracted: {stats['total_medicines']}")
    print(f"\nCategories ({len(stats['categories'])}):")
    for cat, count in sorted(stats['categories'].items()):
        print(f"  {count:4d} - {cat}")
    print(f"\nSaved to: {output_path}")


if __name__ == "__main__":
    main()
