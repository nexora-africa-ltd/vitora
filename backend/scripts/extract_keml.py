#!/usr/bin/env python
"""
KEML 2023 PDF Extractor - Final Version

Handles multi-row medicines and better category tracking.
"""

import csv
import re
import pdfplumber
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Optional, List


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
    """Remove footnote numbers from name."""
    if not name:
        return "", ""
    # Match trailing superscript numbers
    match = re.search(r'^(.+?)(\d{1,3}(?:,\s*\d{1,3})*)$', name.strip())
    if match:
        return match.group(1).strip(), match.group(2)
    return name.strip(), ""


def is_category_header(text: str) -> tuple[bool, str, str]:
    """Check if text is a main category header."""
    if not text:
        return False, "", ""
    # Pattern: "1. ANAESTHETICS..." or "7. ANTI-INFECTIVE..."
    match = re.match(r'^(\d{1,2})[.\s•]+([A-Z][A-Z,\s&\-\'\.]+)$', text.strip())
    if match:
        return True, match.group(1), match.group(2).strip()
    return False, "", ""


def is_subcategory_header(text: str) -> tuple[bool, str, str]:
    """Check if text is a subcategory header."""
    if not text:
        return False, "", ""
    # Pattern: "7.2 Antibacterials"
    match = re.match(r'^(\d{1,2}\.\d{1,2})\s+([A-Z][a-zA-Z,\s\-\(\)&\']+)$', text.strip())
    if match:
        return True, match.group(1), match.group(2).strip()
    return False, "", ""


def is_sub_subcategory_header(text: str) -> tuple[bool, str, str]:
    """Check if text is a sub-subcategory header."""
    if not text:
        return False, "", ""
    # Pattern: "7.2.1 Access Group Antibiotics"
    match = re.match(r'^(\d{1,2}\.\d{1,2}\.\d{1,2})\s+([A-Z][a-zA-Z,\s\-\(\)&\']+)$', text.strip())
    if match:
        return True, match.group(1), match.group(2).strip()
    return False, "", ""


def is_medicine_code(text: str) -> bool:
    """Check if text is a medicine code (X.X.X or X.X.X.X)."""
    if not text:
        return False
    # Match both 3-part (1.2.3) and 4-part (1.2.3.4) codes
    return bool(re.match(r'^\d{1,2}\.\d{1,2}\.\d{1,2}(\.\d{1,3})?$', text.strip()))


def extract_keml_final(pdf_path: str, output_path: str) -> dict:
    """Extract all medicines from KEML PDF."""
    
    medicines: List[Medicine] = []
    current_category = ""
    current_subcategory = ""
    current_sub_subcategory = ""
    
    # Track current medicine for multi-row entries
    current_medicine: Optional[Medicine] = None
    
    stats = {
        'total_pages': 0,
        'medicines': 0,
        'formulations': 0,  # Multiple formulations of same medicine
        'categories': {},
    }
    
    with pdfplumber.open(pdf_path) as pdf:
        stats['total_pages'] = len(pdf.pages)
        print(f"Processing {len(pdf.pages)} pages...")
        
        for page_num, page in enumerate(pdf.pages, 1):
            if page_num % 20 == 0:
                print(f"  Page {page_num}...")
            
            # Skip non-content pages (intro, TOC, appendices after ~130)
            if page_num < 19 or page_num > 130:
                continue
            
            tables = page.extract_tables()
            
            for table in tables:
                if not table:
                    continue
                
                for row in table:
                    if not row or len(row) < 2:
                        continue
                    
                    # Clean cells
                    cells = [str(c).strip().replace('\n', ' ') if c else '' for c in row]
                    first_cell = cells[0]
                    
                    # Skip header rows
                    if first_cell == '#' or 'Name of Medicine' in first_cell:
                        continue
                    
                    # Check for category headers in combined text
                    combined = ' '.join(c for c in cells if c).strip()
                    
                    # Main category
                    is_cat, cat_num, cat_name = is_category_header(combined)
                    if is_cat:
                        current_category = f"{cat_num}. {cat_name}"
                        stats['categories'][current_category] = 0
                        current_subcategory = ""
                        current_sub_subcategory = ""
                        current_medicine = None
                        continue
                    
                    # Also check first cell alone for categories
                    is_cat, cat_num, cat_name = is_category_header(first_cell)
                    if is_cat:
                        current_category = f"{cat_num}. {cat_name}"
                        stats['categories'][current_category] = 0
                        current_subcategory = ""
                        current_sub_subcategory = ""
                        current_medicine = None
                        continue
                    
                    # Subcategory (check combined first, then first cell)
                    for text_to_check in [combined, first_cell]:
                        is_subcat, subcat_num, subcat_name = is_subcategory_header(text_to_check)
                        if is_subcat and not is_medicine_code(first_cell):
                            current_subcategory = f"{subcat_num} {subcat_name}"
                            current_sub_subcategory = ""
                            current_medicine = None
                            break
                    
                    # Sub-subcategory
                    for text_to_check in [combined, first_cell]:
                        is_sub_subcat, sub_subcat_num, sub_subcat_name = is_sub_subcategory_header(text_to_check)
                        if is_sub_subcat and not is_medicine_code(first_cell):
                            current_sub_subcategory = f"{sub_subcat_num} {sub_subcat_name}"
                            current_medicine = None
                            break
                    
                    # Check for medicine row
                    if is_medicine_code(first_cell):
                        name_raw = cells[1] if len(cells) > 1 else ''
                        name, footnotes = clean_name(name_raw)
                        dose_form = cells[2] if len(cells) > 2 else ''
                        strength = cells[3] if len(cells) > 3 else ''
                        lou = cells[4] if len(cells) > 4 else ''
                        
                        if name:
                            current_medicine = Medicine(
                                code=first_cell,
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
                            medicines.append(current_medicine)
                            stats['medicines'] += 1
                            if current_category in stats['categories']:
                                stats['categories'][current_category] += 1
                    
                    # Continuation row (no code, but has dose_form/strength)
                    elif not first_cell and current_medicine:
                        # This is an additional formulation of the previous medicine
                        dose_form = cells[2] if len(cells) > 2 else ''
                        strength = cells[3] if len(cells) > 3 else ''
                        lou = cells[4] if len(cells) > 4 else ''
                        
                        if dose_form or strength:
                            # Create new entry for this formulation
                            new_med = Medicine(
                                code=current_medicine.code,
                                name=current_medicine.name,
                                dose_form=dose_form or current_medicine.dose_form,
                                strength=strength,
                                lou=lou or current_medicine.lou,
                                category=current_medicine.category,
                                subcategory=current_medicine.subcategory,
                                sub_subcategory=current_medicine.sub_subcategory,
                                footnotes=current_medicine.footnotes,
                                page=page_num
                            )
                            medicines.append(new_med)
                            stats['formulations'] += 1
    
    # Sort by code
    medicines.sort(key=lambda m: [int(x) for x in m.code.split('.')])
    
    # Write CSV
    print(f"\nWriting {len(medicines)} entries to CSV...")
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
    output_path = Path(__file__).parent.parent.parent / ".tmp" / "keml_2023_final.csv"
    
    print("=" * 60)
    print("KEML 2023 PDF Extraction")
    print("=" * 60)
    print(f"Source: {pdf_path.name}")
    print(f"Output: {output_path.name}")
    print()
    
    if not pdf_path.exists():
        print(f"ERROR: PDF not found")
        return
    
    stats = extract_keml_final(str(pdf_path), str(output_path))
    
    print("\n" + "=" * 60)
    print("EXTRACTION COMPLETE")
    print("=" * 60)
    print(f"Pages processed: {stats['total_pages']}")
    print(f"Unique medicines: {stats['medicines']}")
    print(f"Additional formulations: {stats['formulations']}")
    print(f"Total entries: {stats['medicines'] + stats['formulations']}")
    print()
    print(f"Categories ({len(stats['categories'])}):")
    for cat, count in sorted(stats['categories'].items(), key=lambda x: int(x[0].split('.')[0])):
        if count > 0:
            print(f"  {count:4d} - {cat}")
    print()
    print(f"Output: {output_path}")


if __name__ == "__main__":
    main()
